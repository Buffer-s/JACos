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
 * for media, SoundCloud's CDN. Direct access is often blocked by CORS, so
 * every request goes through a route chain: your custom proxy (Settings,
 * if set) → the route that worked last time → direct → public CORS proxies.
 * The winning route is remembered in localStorage and tried first next time.
 */

import { readJSON, writeJSON, readString, writeString, removeKey } from './storage';

const API_ORIGIN = 'https://api-v2.soundcloud.com';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

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

const ROUTE_KEY = 'api_route';

export interface RouteInfo {
  id: string;
  label: string;
}
interface RouteCandidate extends RouteInfo {
  build: (url: string) => string;
}

/**
 * Built-in routes, in default order (after the custom proxy and the
 * remembered winner). Every candidate is validated before its response is
 * accepted, so a proxy error page never gets mistaken for SoundCloud.
 */
const PUBLIC_ROUTES: RouteCandidate[] = [
  { id: 'direct', label: 'Direct connection', build: (url) => url },
  { id: 'corsproxy.io', label: 'corsproxy.io', build: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}` },
  { id: 'api.cors.lol', label: 'api.cors.lol', build: (url) => `https://api.cors.lol/?url=${encodeURIComponent(url)}` },
  { id: 'api.allorigins.win', label: 'api.allorigins.win', build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
];

function customRoute(): RouteCandidate | null {
  const proxy = getApiProxy();
  return proxy ? { id: 'custom', label: 'Your custom proxy', build: (url) => proxy + encodeURIComponent(url) } : null;
}

function routeById(id: string | null): RouteCandidate | null {
  if (!id) return null;
  if (id === 'custom') return customRoute();
  return PUBLIC_ROUTES.find((r) => r.id === id) ?? null;
}

/** Label of the route that last worked — shown in Settings. */
export function getActiveRouteLabel(): string {
  return routeById(readString(ROUTE_KEY))?.label ?? 'Not detected yet';
}

/** Forget the remembered route; the chain is re-probed from the top. */
export function clearActiveRoute(): void {
  removeKey(ROUTE_KEY);
}

type BodyKind = 'json' | 'html' | 'js';

/** Cheap content sniffing — SoundCloud's api always answers JSON, and its
 *  homepage/bundles have unmistakable markers. Proxy error pages don't. */
const validators: Record<BodyKind, (body: string) => boolean> = {
  json: (body) => {
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  },
  html: (body) => body.length > 2000,
  js: (body) => body.length > 3000,
};

interface RawResponse {
  status: number;
  body: string;
  route: RouteCandidate;
}

/**
 * Fetch `url`, walking the route chain in order: custom proxy (if set) →
 * the route that worked last time → the built-in chain. The winner is
 * remembered in localStorage and tried first from then on.
 */
async function routedFetch(url: string, kind: BodyKind, timeoutMs = REQUEST_TIMEOUT_MS): Promise<RawResponse> {
  const ordered: RouteCandidate[] = [];
  const push = (route: RouteCandidate | null) => {
    if (route && !ordered.includes(route)) ordered.push(route);
  };
  push(customRoute());
  push(routeById(readString(ROUTE_KEY)));
  for (const route of PUBLIC_ROUTES) push(route);

  for (const route of ordered) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(route.build(url), { signal: ctrl.signal, mode: 'cors' });
      const body = await res.text();
      if (!validators[kind](body)) continue; // error page / non-SoundCloud answer — next route
      writeString(ROUTE_KEY, route.id);
      return { status: res.status, body, route };
    } catch {
      /* unreachable or timed out through this route — try the next one */
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ApiError(0, 'Network error — SoundCloud may be unreachable from your network.');
}

async function fetchText(url: string, kind: 'html' | 'js'): Promise<string> {
  const { body } = await routedFetch(url, kind);
  return body;
}

/** Try to scrape a live client_id out of soundcloud.com's web bundles. */
async function scrapeClientId(): Promise<string | null> {
  const HOMEPAGES = ['https://soundcloud.com/', 'https://m.soundcloud.com/'];
  for (const home of HOMEPAGES) {
    let html: string;
    try {
      html = await fetchText(home, 'html');
    } catch {
      continue; // that entry page is unreachable through every route — try the next
    }
    // 1) The id sometimes sits inline in the HTML bootstrap itself
    const inline =
      html.match(/client_id["']?\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/) ||
      html.match(/["']clientId["']\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/);
    if (inline) return inline[1];

    // 2) Collect every plausible JS bundle: absolute sndcdn URLs + root-relative assets
    const found = new Set<string>();
    for (const m of html.matchAll(/https:\/\/[a-z0-9.-]*sndcdn\.com\/[^"'\s]+\.js[^"'\s]*/gi)) {
      found.add(m[0]);
    }
    for (const m of html.matchAll(/(?:src|href)=["'](\/[A-Za-z0-9._-]*assets\/[^"'\s]+\.js[^"'\s]*)["']/gi)) {
      found.add('https://soundcloud.com' + m[1]);
    }
    const bundles = Array.from(found);
    bundles.sort((a, b) => a.length - b.length); // keep large/core bundles last
    // The id hides in one of the last bundles — scan the tail first
    for (const url of bundles.reverse().slice(0, 24)) {
      try {
        const js = await fetchText(url, 'js');
        const m =
          js.match(/client_id:["']?([0-9a-zA-Z]{32})["']/) ||
          js.match(/client_id["']?\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/) ||
          js.match(/["']clientId["']\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/);
        if (m) return m[1];
      } catch {
        /* try next bundle */
      }
    }
  }
  return null;
}

/** Cheap probe: does SoundCloud accept this id? Uses the route chain. */
export async function verifyClientId(id: string): Promise<boolean> {
  try {
    const url = `${API_ORIGIN}/resolve?url=${encodeURIComponent('https://soundcloud.com/soundcloud')}&client_id=${encodeURIComponent(id)}`;
    const { status, body } = await routedFetch(url, 'json', 8000);
    if (status !== 200) return false;
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Resolve a usable client_id. Throws ClientIdUnavailableError when everything fails.
 * Every candidate — detected or remembered — is verified against the API before
 * being used, so a stale id can never leak into real requests. Verification
 * costs one cheap call per detection (results are cached for 24h).
 */
export async function detectClientId(opts: { forceRefresh?: boolean; excludeId?: string } = {}): Promise<string> {
  const custom = getCustomClientId();
  if (custom && custom !== opts.excludeId) {
    resolvedClientId = custom;
    resolvedSource = 'custom';
    return custom;
  }

  const tryIds = async (ids: (string | null)[], source: ClientIdSource): Promise<string | null> => {
    for (const id of ids) {
      if (!id || id === opts.excludeId) continue;
      // eslint-disable-next-line no-await-in-loop
      const ok = await verifyClientId(id);
      if (ok) {
        resolvedClientId = id;
        resolvedSource = source;
        writeJSON(cacheKey, { id, at: Date.now() } satisfies ClientIdCache);
        return id;
      }
    }
    return null;
  };

  if (!opts.forceRefresh && !opts.excludeId) {
    if (resolvedClientId) return resolvedClientId;
    const cached = readJSON<ClientIdCache | null>(cacheKey, null);
    if (cached && Date.now() - cached.at < TOKEN_TTL_MS && cached.id) {
      const ok = await verifyClientId(cached.id);
      if (ok) {
        resolvedClientId = cached.id;
        resolvedSource = 'cache';
        return cached.id;
      }
      removeKey(cacheKey);
    }
  }

  const scraped = await scrapeClientId();
  const fromScrape = await tryIds([scraped], 'scrape');
  if (fromScrape) return fromScrape;

  const fromFallback = await tryIds(FALLBACK_CLIENT_IDS, 'fallback');
  if (fromFallback) return fromFallback;

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

  const { status, body } = await routedFetch(url.toString(), 'json');

  if ((status === 401 || status === 403) && retry) {
    // Stale client_id — drop it and try to detect a fresh one exactly once.
    const stale = resolvedClientId;
    removeKey(cacheKey);
    resolvedClientId = null;
    try {
      await detectClientId({ forceRefresh: true, excludeId: stale ?? undefined });
    } catch {
      throw new ApiError(status, 'SoundCloud rejected the client_id. Open Settings → SoundCloud connection and paste a fresh one (soundcloud.com → DevTools → Network → any api-v2 request → copy the client_id parameter).');
    }
    return apiFetch<T>(path, params, false);
  }

  if (status === 401 || status === 403) {
    throw new ApiError(status, 'SoundCloud rejected the client_id. Open Settings → SoundCloud connection and paste a fresh one (soundcloud.com → DevTools → Network → any api-v2 request → copy the client_id parameter).');
  }
  if (status === 404) throw new ApiError(404, 'Not found on SoundCloud.');
  if (status === 429) throw new ApiError(429, 'Rate limited by SoundCloud — wait a moment and retry.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ApiError(status, 'SoundCloud returned an unreadable response.');
  }
  if (status < 200 || status >= 300) {
    const detail = (parsed as { message?: string } | null)?.message;
    throw new ApiError(status, detail || `SoundCloud error (HTTP ${status}).`);
  }
  return parsed as T;
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
