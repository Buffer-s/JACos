/**
 * Minimal client for SoundCloud's public-but-unofficial web API (api-v2).
 *
 * There is no public developer program anymore, so the web app's own
 * client_id is what every request carries. It rotates periodically, so:
 *   1. A user-supplied client_id (Settings) always wins.
 *   2. Otherwise we try a cached detection (24h TTL).
 *   3. Otherwise we scrape it live from soundcloud.com's JS bundles.
 *   4. As a last resort before giving up, a few community-circulated IDs are
 *      tried (they are usually stale — expect them to fail).
 * If all of that fails the app shows a manual "paste a client_id" panel.
 *
 * Everything runs in the browser. Requests hit api-v2.soundcloud.com and,
 * for media, SoundCloud's CDN. A custom CORS proxy can be set in Settings
 * for networks where direct requests are blocked.
 */

import { readJSON, writeJSON, readString, writeString, removeKey } from './storage';

const API_ORIGIN = 'https://api-v2.soundcloud.com';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SCUser {
  kind: 'user';
  id: number;
  urn?: string;
  username: string;
  permalink: string;
  permalink_url: string;
  avatar_url: string | null;
  followers_count: number;
  followings_count: number;
  track_count: number;
  playlist_count: number;
  description?: string | null;
  last_modified?: string | null;
  created_at?: string;
}

export interface SCTranscoding {
  url: string;
  duration?: number;
  is_streamable?: boolean;
  format: {
    protocol: 'progressive' | 'hls' | string;
    mime_type: string;
  };
  preset?: string;
  quality?: string;
}

export interface SCTrack {
  kind: 'track';
  id: number;
  title: string;
  duration: number; // ms
  permalink_url: string;
  artwork_url: string | null;
  waveform_url?: string;
  user?: SCUser;
  likes_count?: number;
  favoritings_count?: number;
  reposts_count?: number;
  playback_count?: number;
  comment_count?: number;
  media?: { transcodings: SCTranscoding[] };
  created_at?: string;
  genre?: string | null;
  isrc?: string | null;
}

/** Playlist track entries may be full tracks or bare stubs {id, kind}. */
export type SCPlaylistTrack = SCTrack | { kind?: string; id: number };

export interface SCPlaylist {
  kind: 'playlist' | 'system-playlist';
  id: number;
  title: string;
  permalink_url: string;
  artwork_url: string | null;
  description?: string | null;
  user?: SCUser;
  tracks: SCPlaylistTrack[];
  track_count: number;
  duration: number; // ms
  likes_count?: number;
  reposts_count?: number;
  created_at?: string;
  last_modified?: string;
  is_album?: boolean;
}

export type ResolvedTarget =
  | { kind: 'user'; user: SCUser }
  | { kind: 'playlist'; playlist: SCPlaylist }
  | { kind: 'track'; track: SCTrack }
  | { kind: 'unknown'; raw: unknown };

export type ClientIdSource = 'custom' | 'cache' | 'scrape' | 'fallback' | null;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export class ClientIdUnavailableError extends Error {
  constructor() {
    super('Could not detect a SoundCloud client_id automatically.');
    this.name = 'ClientIdUnavailableError';
  }
}

/* ------------------------------------------------------------------ */
/* client_id management                                                */
/* ------------------------------------------------------------------ */

const FALLBACK_CLIENT_IDS = [
  // Community-circulated IDs. They rotate every few days/weeks and are
  // almost certainly stale by the time you read this — only tried after
  // live detection, and the app degrades to a manual field if they fail.
  'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX',
  'y_BSmHtzDkDbNqxOFqC8bmvftGcBDMeb',
];

interface ClientIdCache {
  id: string;
  at: number;
}

let resolvedClientId: string | null = null;
let resolvedSource: ClientIdSource = null;
const overrideKey = 'client_id_override';
const cacheKey = 'client_id_cache';
const proxyKey = 'api_proxy';

export function getCustomClientId(): string | null {
  const v = readString(overrideKey);
  return v && v.trim() ? v.trim() : null;
}
export function setCustomClientId(id: string): void {
  writeString(overrideKey, id.trim());
  invalidateClientId();
}
export function clearCustomClientId(): void {
  removeKey(overrideKey);
  invalidateClientId();
}
export function getApiProxy(): string {
  return readString(proxyKey)?.trim() ?? '';
}
export function setApiProxy(proxy: string): void {
  writeString(proxyKey, proxy.trim());
}
export function getClientIdSource(): ClientIdSource {
  return resolvedSource;
}
export function invalidateClientId(): void {
  resolvedClientId = null;
  resolvedSource = null;
  removeKey(cacheKey);
}

function proxied(url: string): string {
  const proxy = getApiProxy();
  return proxy ? proxy + encodeURIComponent(url) : url;
}

async function fetchText(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(proxied(url), { signal: ctrl.signal, mode: 'cors' });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Try to scrape a live client_id out of soundcloud.com's web bundles. */
async function scrapeClientId(): Promise<string | null> {
  try {
    const html = await fetchText('https://soundcloud.com/');
    const scriptUrls = Array.from(
      new Set(html.match(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"'\s]+\.js/g) ?? []),
    );
    // The id tends to hide in the last bundles
    for (const url of scriptUrls.reverse().slice(0, 12)) {
      try {
        const js = await fetchText(url);
        const m =
          js.match(/client_id:"([0-9a-zA-Z]{32})"/) ||
          js.match(/client_id["']?\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/);
        if (m) return m[1];
      } catch {
        /* try next bundle */
      }
    }
  } catch {
    /* soundcloud.com blocked / CORS — fall through */
  }
  return null;
}

/**
 * Resolve a usable client_id. Throws ClientIdUnavailableError when everything fails.
 * Pass excludeId to force a fresh detection after a 401 on a previously working id.
 */
export async function detectClientId(opts: { forceRefresh?: boolean; excludeId?: string } = {}): Promise<string> {
  const custom = getCustomClientId();
  if (custom && custom !== opts.excludeId) {
    resolvedClientId = custom;
    resolvedSource = 'custom';
    return custom;
  }

  if (!opts.forceRefresh && !opts.excludeId) {
    if (resolvedClientId) return resolvedClientId;
    const cached = readJSON<ClientIdCache | null>(cacheKey, null);
    if (cached && Date.now() - cached.at < TOKEN_TTL_MS && cached.id) {
      resolvedClientId = cached.id;
      resolvedSource = 'cache';
      return cached.id;
    }
  }

  const scraped = await scrapeClientId();
  if (scraped && scraped !== opts.excludeId) {
    resolvedClientId = scraped;
    resolvedSource = 'scrape';
    writeJSON(cacheKey, { id: scraped, at: Date.now() } satisfies ClientIdCache);
    return scraped;
  }

  for (const id of FALLBACK_CLIENT_IDS) {
    if (id !== opts.excludeId) {
      resolvedClientId = id;
      resolvedSource = 'fallback';
      return id;
    }
  }

  throw new ClientIdUnavailableError();
}

/* ------------------------------------------------------------------ */
/* request plumbing                                                    */
/* ------------------------------------------------------------------ */

async function apiFetch<T>(path: string, params: Record<string, string>, retry = true): Promise<T> {
  const cid = await detectClientId();
  const url = /^https?:\/\//i.test(path) ? new URL(path) : new URL(API_ORIGIN + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('client_id', cid);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(proxied(url.toString()), { signal: ctrl.signal, mode: 'cors' });
  } catch (err) {
    clearTimeout(t);
    if ((err as Error).name === 'AbortError') throw new ApiError(0, 'Request timed out');
    throw new ApiError(0, 'Network error — SoundCloud may be unreachable from your network.');
  }
  clearTimeout(t);

  if ((res.status === 401 || res.status === 403) && retry) {
    // Stale client_id — drop it and try to detect a fresh one exactly once.
    const stale = resolvedClientId;
    removeKey(cacheKey);
    resolvedClientId = null;
    try {
      await detectClientId({ forceRefresh: true, excludeId: stale ?? undefined });
    } catch {
      throw new ApiError(res.status, 'SoundCloud rejected the client_id. Open Settings and paste a fresh one.');
    }
    return apiFetch<T>(path, params, false);
  }

  if (res.status === 404) throw new ApiError(404, 'Not found on SoundCloud.');
  if (res.status === 429) throw new ApiError(429, 'Rate limited by SoundCloud — wait a moment and retry.');
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string };
      detail = body?.message ?? '';
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail || `SoundCloud error (HTTP ${res.status}).`);
  }
  return (await res.json()) as T;
}

interface Collection<T> {
  collection: T[];
  next_href: string | null;
}

async function paginate<T>(path: string, params: Record<string, string>, maxPages = 10): Promise<T[]> {
  const out: T[] = [];
  let page = 0;
  let nextPath: string | null = path;
  let nextParams: Record<string, string> = { ...params, linked_partitioning: '1' };
  while (nextPath && page < maxPages) {
    const data: Collection<T> = await apiFetch<Collection<T>>(nextPath, nextParams);
    out.push(...(data.collection ?? []));
    page += 1;
    if (data.next_href) {
      // next_href is absolute; convert back to path + params but keep client_id handling central
      try {
        const u = new URL(data.next_href);
        nextPath = u.pathname;
        nextParams = {};
        u.searchParams.forEach((v, k) => {
          if (k !== 'client_id') nextParams[k] = v;
        });
      } catch {
        break;
      }
    } else {
      break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* artwork helpers                                                     */
/* ------------------------------------------------------------------ */

export type ArtworkSize = 't50x50' | 't120x120' | 't200x200' | 't300x300' | 't500x500' | 'original';

export function artwork(url: string | null | undefined, size: ArtworkSize = 't500x500'): string | null {
  if (!url) return null;
  // SoundCloud artwork URLs look like ...-large.jpg / ...-t300x300.jpg / ...-original.jpg
  return url.replace(/-(large|original|crop|t\d+x\d+)(?=\.(jpg|jpeg|png|gif|webp))/i, `-${size}`);
}

export const avatar = (url: string | null | undefined, size: 't50x50' | 't120x120' = 't120x120') =>
  artwork(url, size);

/* ------------------------------------------------------------------ */
/* high-level calls                                                    */
/* ------------------------------------------------------------------ */

export async function resolveUrl(url: string): Promise<ResolvedTarget> {
  const raw = await apiFetch<{ kind?: string }>('/resolve', { url });
  const kind = (raw as { kind?: string }).kind;
  if (kind === 'user') return { kind: 'user', user: raw as unknown as SCUser };
  if (kind === 'playlist' || kind === 'system-playlist') return { kind: 'playlist', playlist: raw as unknown as SCPlaylist };
  if (kind === 'track') return { kind: 'track', track: raw as unknown as SCTrack };
  return { kind: 'unknown', raw };
}

export async function getUser(permalink: string): Promise<SCUser> {
  const target = await resolveUrl(`https://soundcloud.com/${permalink.replace(/^@/, '')}`);
  if (target.kind !== 'user') throw new ApiError(404, 'That URL is not a SoundCloud profile.');
  return target.user;
}

export async function getUserPlaylists(userId: number): Promise<SCPlaylist[]> {
  return paginate<SCPlaylist>(`/users/${userId}/playlists`, { limit: '50' });
}

export async function getUserTracks(userId: number): Promise<SCTrack[]> {
  return paginate<SCTrack>(`/users/${userId}/tracks`, { limit: '100' });
}

const isTrackStub = (t: SCPlaylistTrack): t is { kind?: string; id: number } =>
  !t || typeof t !== 'object' || !('duration' in t) || (t as SCTrack).duration === undefined;

/** Fetch a playlist, hydrating stubbed track entries into full tracks. */
export async function getPlaylist(id: number): Promise<SCPlaylist> {
  const playlist = await apiFetch<SCPlaylist>(`/playlists/${id}`, {});
  const stubs = (playlist.tracks ?? []).filter(isTrackStub);
  if (stubs.length > 0) {
    const ids = stubs.map((s) => s.id);
    const hydrated = new Map<number, SCTrack>();
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      try {
        const tracks = await apiFetch<SCTrack[]>('/tracks', { ids: batch.join(',') });
        for (const t of tracks) hydrated.set(t.id, t);
      } catch {
        /* leave unhydrated — row renders a fallback */
      }
    }
    playlist.tracks = playlist.tracks.map((t) => {
      if (isTrackStub(t)) return hydrated.get(t.id) ?? t;
      return t;
    });
  }
  return playlist;
}

export interface StreamResolution {
  /** Direct progressive MP3 URL, or the resolved HLS playlist URL. */
  url: string;
  kind: 'progressive' | 'hls';
  mimeType: string;
}

/**
 * Pick the best transcoding for a track and resolve it to a playable URL.
 * Progressive MP3 wins (native <audio> + cacheable blobs); HLS is the fallback.
 */
export async function getStreamUrl(track: SCTrack): Promise<StreamResolution | null> {
  const transcodings = track.media?.transcodings ?? [];
  const usable = transcodings.filter((t) => t.is_streamable !== false);

  const rank = (t: SCTranscoding): number => {
    const preset = t.preset ?? '';
    if (t.format.protocol === 'progressive') {
      if (preset.includes('mp3_128')) return 0;
      if (preset.includes('mp3')) return 1;
      return 2;
    }
    if (t.format.protocol === 'hls') {
      if (preset.includes('aac_160')) return 10;
      if (preset.includes('mp3_128')) return 11;
      return 12;
    }
    return 99;
  };

  const sorted = [...usable].sort((a, b) => rank(a) - rank(b));
  const best = sorted[0];
  if (!best) return null;

  const data = await apiFetch<{ url?: string }>(best.url, {});
  if (!data?.url) return null;

  return {
    url: data.url,
    kind: best.format.protocol === 'hls' ? 'hls' : 'progressive',
    mimeType: best.format.mime_type ?? 'audio/mpeg',
  };
}

/** Resolve a playlist stub's user for display purposes (non-fatal on failure). */
export function playlistUser(p: SCPlaylist): SCUser | null {
  return p.user ?? null;
}
