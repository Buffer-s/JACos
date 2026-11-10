/**
 * SoundCloud api-v2 client.
 *
 * First stop is always the same-origin server bridge (`/api/sc`, a Cloudflare
 * Pages Function). It fetches api-v2 server-side with a browser User-Agent and
 * handles SoundCloud's client_id dance itself, so the browser needs nothing —
 * no settings, no keys, no CORS games.
 *
 * When the bridge isn't there (plain static hosting), every call falls back to
 * a browser route chain (custom proxy → remembered route → direct → public
 * CORS proxies) plus a scraped, verified client_id, remembered per-session.
 */

import { readJSON, writeJSON, readString, writeString, removeKey } from './storage';

const API = 'https://api-v2.soundcloud.com';
const MIN = 60_000;

/* -------------------------------------------------------------------------- */
/* Types (raw api-v2-ish shapes — only what the UI reads)                     */
/* -------------------------------------------------------------------------- */

export interface SCUser {
  id: number;
  permalink: string;
  permalink_url: string;
  username: string;
  avatar_url: string | null;
  followers_count?: number;
  followings_count?: number;
  track_count?: number;
  playlist_count?: number;
  description?: string | null;
  city?: string | null;
  country?: string | null;
  verified?: boolean;
}

export interface SCTranscoding {
  url: string;
  preset?: string;
  snipped?: boolean;
  format?: { protocol?: string; mime_type?: string };
}

export interface SCTrack {
  id: number;
  title: string;
  duration: number;
  artwork_url: string | null;
  permalink_url?: string;
  permalink?: string;
  created_at?: string;
  playback_count?: number;
  likes_count?: number;
  favoritings_count?: number;
  policy?: string;
  streamable?: boolean;
  track_authorization?: string;
  user?: SCUser;
  media?: { transcodings?: SCTranscoding[] };
}

export interface SCPlaylist {
  id: number;
  kind?: string;
  title: string;
  artwork_url: string | null;
  permalink_url?: string;
  created_at?: string;
  last_modified?: string;
  track_count: number;
  duration?: number;
  likes_count?: number;
  is_album?: boolean;
  user?: SCUser;
  tracks?: SCTrack[];
}

export interface StreamInfo {
  kind: 'progressive' | 'hls';
  url: string;
}

export type ResolveResult =
  | { kind: 'user'; user: SCUser }
  | { kind: 'playlist'; playlist: SCPlaylist }
  | { kind: 'track'; track: SCTrack };

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ClientIdUnavailableError extends Error {
  constructor(message = 'JACos could not obtain a SoundCloud client_id automatically.') {
    super(message);
    this.name = 'ClientIdUnavailableError';
  }
}

/* -------------------------------------------------------------------------- */
/* Small in-memory cache (10 min default, streams 20)                         */
/* -------------------------------------------------------------------------- */

type Entry = { value: unknown; expires: number };
const cache = new Map<string, Entry>();
const MAX_CACHE = 300;

function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value as T);
  return load().then((value) => {
    // never pin a null result (one transient failure must not poison the track)
    if (value === null || value === undefined) return value;
    if (cache.size >= MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  });
}

/* -------------------------------------------------------------------------- */
/* Artwork URL helpers                                                        */
/* -------------------------------------------------------------------------- */

function sizeSwap(url: string | null | undefined, size: string): string | null {
  if (!url) return null;
  return url.replace(/-(large|original|crop|badge|small|tiny|t\d+x\d+)\.(jpg|jpeg|png)/i, `-${size}.$2`);
}

export function artwork(url: string | null | undefined, size = 't500x500'): string | null {
  return sizeSwap(url, size);
}

export function avatar(url: string | null | undefined, size = 't120x120'): string | null {
  return sizeSwap(url, size);
}

/* -------------------------------------------------------------------------- */
/* Server bridge                                                              */
/* -------------------------------------------------------------------------- */

let bridgeBadUntil = 0;
let bridgeOk = false;

async function bridgeJson<T>(pathOrUrl: string, params: Record<string, string | number | undefined>): Promise<T> {
  if (Date.now() < bridgeBadUntil) throw new Error('The server bridge is unavailable right now.');
  const q = new URLSearchParams();
  q.set('path', pathOrUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) q.set(k, String(v));
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(`/api/sc?${q.toString()}`, {
      headers: { accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch (err) {
    bridgeBadUntil = Date.now() + 5 * MIN;
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timer);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('application/json')) {
    // A static host answering with the SPA fallback (text/html) lands here too.
    bridgeBadUntil = Date.now() + 5 * MIN;
    throw new ApiError(res.status, `The server bridge answered HTTP ${res.status}.`);
  }
  bridgeOk = true;
  return (await res.json()) as T;
}

/* -------------------------------------------------------------------------- */
/* Browser route chain (fallback when the bridge is not deployed)             */
/* -------------------------------------------------------------------------- */

const ROUTE_KEY = 'api_route';
const CLIENT_ID_KEY = 'client_id';
const CLIENT_ID_CACHE = 'client_id_cache';

interface Route {
  key: string;
  wrap: (url: string) => string;
}

const BASE_ROUTES: Route[] = [
  { key: 'corsproxy.io', wrap: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
  { key: 'api.cors.lol', wrap: (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}` },
  { key: 'api.allorigins.win', wrap: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
];

function buildRoutes(): Route[] {
  const routes: Route[] = [];
  const custom = getApiProxy();
  if (custom) {
    routes.push({ key: 'custom proxy', wrap: (u) => `${custom}${encodeURIComponent(u)}` });
  }
  if (typeof window !== 'undefined') {
    routes.push({ key: 'direct', wrap: (u) => u });
  }
  const remembered = typeof window !== 'undefined' ? readString(ROUTE_KEY) : null;
  const ordered = remembered ? [...BASE_ROUTES].sort((a, b) => Number(b.key === remembered) - Number(a.key === remembered)) : BASE_ROUTES;
  routes.push(...ordered);
  return routes;
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

async function routedFetch(url: string): Promise<Response> {
  const routes = buildRoutes();
  let lastError: unknown = new ApiError(0, 'No route to SoundCloud succeeded.');
  for (const route of routes) {
    const { signal, done } = withTimeout(12_000);
    try {
      const res = await fetch(route.wrap(url), { signal });
      done();
      if (res.ok || res.status === 401 || res.status === 403 || res.status === 404) {
        if (typeof window !== 'undefined') writeString(ROUTE_KEY, route.key);
        return res;
      }
      lastError = new ApiError(res.status, `Route "${route.key}" answered HTTP ${res.status}.`);
    } catch (err) {
      done();
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new ApiError(0, String(lastError));
}

/* -------------------------------------------------------------------------- */
/* client_id handling (browser chain only)                                    */
/* -------------------------------------------------------------------------- */

export function getApiProxy(): string {
  return (typeof window === 'undefined' ? null : readString('api_proxy')) ?? '';
}

export function setApiProxy(value: string): void {
  const v = value.trim();
  if (v) writeString('api_proxy', v);
  else removeKey('api_proxy');
  bridgeBadUntil = 0;
}

export function getCustomClientId(): string | null {
  return typeof window === 'undefined' ? null : readString(CLIENT_ID_KEY);
}

export function setCustomClientId(value: string): void {
  writeString(CLIENT_ID_KEY, value.trim());
  removeKey(CLIENT_ID_CACHE);
}

export function clearCustomClientId(): void {
  removeKey(CLIENT_ID_KEY);
  removeKey(CLIENT_ID_CACHE);
}

export function getClientIdSource(): 'server' | 'custom' | 'cache' | null {
  if (bridgeOk) return 'server';
  if (getCustomClientId()) return 'custom';
  const cachedId = typeof window === 'undefined' ? null : readJSON<{ id: string; expires: number } | null>(CLIENT_ID_CACHE, null);
  if (cachedId && cachedId.expires > Date.now()) return 'cache';
  return null;
}

export function getActiveRouteLabel(): string {
  if (bridgeOk) return 'server bridge (Pages Function)';
  if (typeof window === 'undefined') return 'automatic';
  return readString(ROUTE_KEY) ?? 'automatic (server bridge first)';
}

export function clearActiveRoute(): void {
  removeKey(ROUTE_KEY);
  bridgeBadUntil = 0;
  bridgeOk = false;
}

async function verifyClientId(id: string): Promise<boolean> {
  const url = `${API}/resolve?url=${encodeURIComponent('https://soundcloud.com/soundcloud')}&client_id=${encodeURIComponent(id)}`;
  try {
    const res = await routedFetch(url);
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

async function scrapeClientId(): Promise<string> {
  const home = await routedFetch('https://soundcloud.com/');
  const html = await home.text();

  const inline =
    html.match(/[?&,{ ]client_id[:=]"?([a-zA-Z0-9]{32})"?/) ||
    html.match(/client_id["']?\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/);
  if (inline) return inline[1];

  const found = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/[^"]+\.js[^"]*)"/g)) {
    found.add(m[1]);
  }
  for (const m of html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/[^"'\s]+\.js[^"'\s]*/g)) {
    found.add(m[0]);
  }

  for (const src of [...found].reverse().slice(0, 20)) {
    try {
      const res = await routedFetch(src);
      const js = await res.text();
      const m =
        js.match(/[?&,{ ]client_id[:=]"?([a-zA-Z0-9]{32})"?/) ||
        js.match(/client_id["']?\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/) ||
        js.match(/clientId["']?\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/);
      if (m) return m[1];
    } catch {
      /* try the next bundle */
    }
  }
  throw new ClientIdUnavailableError('Could not detect a SoundCloud client_id.');
}

async function getClientId(force = false): Promise<string> {
  const custom = getCustomClientId();
  if (custom) return custom;
  if (!force) {
    const hit = readJSON<{ id: string; expires: number } | null>(CLIENT_ID_CACHE, null);
    if (hit && hit.expires > Date.now()) return hit.id;
  }
  const id = await scrapeClientId();
  if (!(await verifyClientId(id))) {
    removeKey(CLIENT_ID_CACHE);
    throw new ClientIdUnavailableError('The detected SoundCloud client_id was rejected. Open Settings and paste a fresh one.');
  }
  writeJSON(CLIENT_ID_CACHE, { id, expires: Date.now() + 6 * 60 * MIN });
  return id;
}

export async function detectClientId(_opts: { forceRefresh?: boolean } = {}): Promise<string> {
  try {
    await bridgeJson<unknown>('/resolve', { url: 'https://soundcloud.com/soundcloud' });
    return 'server';
  } catch {
    /* bridge not deployed/reachable — detect for the browser chain */
  }
  return getClientId(_opts.forceRefresh);
}

/* -------------------------------------------------------------------------- */
/* Low-level apiFetch: bridge first, then browser chain                       */
/* -------------------------------------------------------------------------- */

async function toApiError(res: Response): Promise<ApiError> {
  let message = `SoundCloud answered HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { message?: unknown; error_description?: unknown };
    if (typeof body?.message === 'string' && body.message) message = body.message;
    else if (typeof body?.error_description === 'string' && body.error_description) message = body.error_description;
  } catch {
    /* not JSON — keep the generic message */
  }
  return new ApiError(res.status, message);
}

type Params = Record<string, string | number | undefined>;

/** Batch-fetch full tracks by id (used to migrate legacy liked-id storage). */
export async function getTracksByIds(ids: number[]): Promise<SCTrack[]> {
  const out: SCTrack[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    try {
      const res = await apiFetch<any>('/tracks', { ids: ids.slice(i, i + 30).join(',') });
      out.push(...collectionOf(res).map(mapTrack as (t: any) => SCTrack));
    } catch {
      /* skip the batch */
    }
  }
  return out;
}

async function apiFetch<T = unknown>(pathOrUrl: string, params: Params = {}): Promise<T> {
  try {
    return await bridgeJson<T>(pathOrUrl, params);
  } catch {
    /* bridge unavailable — fall through to the browser route chain */
  }

  const id = await getClientId();
  const base = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${API}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  url.searchParams.set('client_id', id);

  let res = await routedFetch(url.toString());
  if (res.status === 401 || res.status === 403) {
    removeKey(CLIENT_ID_CACHE);
    const fresh = await getClientId(true);
    url.searchParams.set('client_id', fresh);
    res = await routedFetch(url.toString());
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) removeKey(ROUTE_KEY); // stop remembering a dead route
    throw await toApiError(res);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, 'SoundCloud answered with an unreadable response.');
  }
}

/* -------------------------------------------------------------------------- */
/* Mapping (raw api-v2 passes through — the UI reads api-v2 field names)      */
/* -------------------------------------------------------------------------- */

const mapUser = (u: unknown): SCUser => u as SCUser;
const mapTrack = (t: unknown): SCTrack => t as SCTrack;
const mapPlaylist = (p: SCPlaylist): SCPlaylist => p;

export async function resolveUrl(url: string): Promise<ResolveResult> {
  const raw = await cached<any>(`resolve:${url.toLowerCase()}`, 10 * MIN, () => apiFetch<any>('/resolve', { url }));
  if (raw?.kind === 'user') return { kind: 'user', user: mapUser(raw) };
  if (raw?.kind === 'playlist') return { kind: 'playlist', playlist: mapPlaylist(raw) };
  if (raw?.kind === 'track') return { kind: 'track', track: mapTrack(raw) };
  throw new Error('Could not resolve that URL.');
}

export async function getUser(permalink: string): Promise<SCUser> {
  const raw = await cached<any>(`user:${permalink.toLowerCase()}`, 10 * MIN, () =>
    apiFetch<any>('/resolve', { url: `https://soundcloud.com/${encodeURIComponent(permalink)}` }),
  );
  if (raw?.kind !== 'user') throw new Error('Profile not found.');
  return mapUser(raw);
}

function collectionOf(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.collection)) return raw.collection;
  return [];
}

/** Follow `next_href` pages (linked_partitioning) so small page sizes don't truncate results. */
async function apiFetchAll(path: string, params: Params, maxPages = 3): Promise<any[]> {
  const items: any[] = [];
  let url: string | null = path;
  let query: Params = params;
  for (let page = 0; page < maxPages && url; page++) {
    const raw: any = await apiFetch<any>(url, query);
    items.push(...collectionOf(raw));
    url = typeof raw?.next_href === 'string' && raw.next_href ? raw.next_href : null;
    query = {}; // next_href carries its own cursor params
  }
  return items;
}

export async function getUserPlaylists(userId: number): Promise<SCPlaylist[]> {
  const items = await cached<any[]>(`user-playlists:${userId}`, 10 * MIN, () =>
    apiFetchAll(`/users/${userId}/playlists`, { limit: 100, linked_partitioning: 1 }),
  );
  return items.map(mapPlaylist as (p: any) => SCPlaylist);
}

export async function getUserTracks(userId: number): Promise<SCTrack[]> {
  const items = await cached<any[]>(`user-tracks:${userId}`, 10 * MIN, () =>
    apiFetchAll(`/users/${userId}/tracks`, { limit: 100, linked_partitioning: 1 }),
  );
  return items.map(mapTrack as (t: any) => SCTrack);
}

/* -------------------------------------------------------------------------- */
/* Search — mirrors soundcloud.com's Tracks / Playlists / People sections     */
/* -------------------------------------------------------------------------- */

export type SearchType = 'tracks' | 'playlists' | 'users';
export interface SearchResult<T> {
  items: T[];
  /** true when SoundCloud reports more results (next_href present) */
  hasMore: boolean;
}

async function apiSearch(type: SearchType, q: string, offset: number): Promise<any> {
  try {
    return await apiFetch<any>(`/search/${type}`, { q, limit: 30, offset, linked_partitioning: 1 });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
      // older route shape
      return apiFetch<any>('/search', { q, type, limit: 30, offset, linked_partitioning: 1 });
    }
    throw err;
  }
}

export async function searchTracks(q: string, offset = 0): Promise<SearchResult<SCTrack>> {
  const raw = await apiSearch('tracks', q, offset);
  return { items: collectionOf(raw).map(mapTrack as (t: any) => SCTrack), hasMore: typeof raw?.next_href === 'string' };
}

export async function searchPlaylists(q: string, offset = 0): Promise<SearchResult<SCPlaylist>> {
  const raw = await apiSearch('playlists', q, offset);
  return { items: collectionOf(raw).map(mapPlaylist as (p: any) => SCPlaylist), hasMore: typeof raw?.next_href === 'string' };
}

export async function searchUsers(q: string, offset = 0): Promise<SearchResult<SCUser>> {
  const raw = await apiSearch('users', q, offset);
  return { items: collectionOf(raw).map(mapUser as (u: any) => SCUser), hasMore: typeof raw?.next_href === 'string' };
}

export async function getPlaylist(id: number): Promise<SCPlaylist> {
  return cached(`playlist:${id}`, 10 * MIN, async () => {
    const raw = await apiFetch<any>(`/playlists/${id}`);
    if (!raw || raw.kind !== 'playlist') throw new Error('Playlist not found.');
    const rawTracks: unknown[] = Array.isArray(raw.tracks) ? raw.tracks : [];
    // SoundCloud playlists list tracks as either bare ids OR stub objects
    // ({id, permalink, ...} with no duration/media). Anything missing the
    // fields we need gets batch-hydrated via /tracks?ids= (chunks of 30).
    const byId = new Map<number, any>();
    const needIds: number[] = [];
    for (const t of rawTracks) {
      if (typeof t === 'number' && Number.isFinite(t)) {
        needIds.push(t);
        continue;
      }
      if (t && typeof t === 'object' && typeof (t as any).id === 'number') {
        const trk = t as any;
        byId.set(trk.id, trk);
        if (typeof trk.duration !== 'number' || !trk.media) needIds.push(trk.id);
      }
    }
    const uniqueIds = [...new Set(needIds)];
    for (let i = 0; i < uniqueIds.length; i += 30) {
      try {
        const res = await apiFetch<any>('/tracks', { ids: uniqueIds.slice(i, i + 30).join(',') });
        for (const t of collectionOf(res)) {
          if (t && typeof t.id === 'number') byId.set(t.id, t);
        }
      } catch {
        /* keep whatever the stubs gave us */
      }
    }
    const tracks = rawTracks
      .map((t) => {
        const id = typeof t === 'number' ? t : (t as any)?.id;
        return typeof id === 'number' ? byId.get(id) : undefined;
      })
      .filter((t): t is SCTrack => !!t && typeof (t as SCTrack).duration === 'number');
    return mapPlaylist({ ...raw, tracks } as SCPlaylist);
  });
}

/* -------------------------------------------------------------------------- */
/* Stream resolution — short-lived signed CDN URL, never proxied through us   */
/* -------------------------------------------------------------------------- */

function rankTranscoding(t: SCTranscoding): number {
  const proto = t.format?.protocol;
  const mime: string = t.format?.mime_type ?? '';
  const preset: string = t.preset ?? '';
  if (t.snipped) return 99;
  if (proto === 'progressive' && mime.includes('mpeg')) return 0;
  if (proto === 'hls' && preset === 'aac_160k') return 1;
  if (proto === 'hls' && preset.startsWith('mp3')) return 2;
  if (proto === 'hls' && preset === 'aac_96k') return 3;
  if (proto === 'hls' && mime.includes('mpegurl')) return 4;
  if (proto === 'progressive') return 5;
  return 50; // opus and friends — not universally playable
}

export async function getStreamUrl(track: SCTrack): Promise<StreamInfo | null> {
  if (!track || typeof track.id !== 'number') return null;
  const transcodings = track.media?.transcodings ?? [];
  const playable = track.streamable !== false && track.policy !== 'BLOCK' && transcodings.length > 0;
  if (!playable) return null;

  return cached(`stream:${track.id}`, 20 * MIN, async () => {
    const ranked = transcodings
      .map((t) => ({ t, r: rankTranscoding(t) }))
      .filter(({ r }) => r < 50)
      .sort((a, b) => a.r - b.r);
    for (const { t } of ranked) {
      try {
        const res = await apiFetch<{ url?: string }>(
          t.url,
          track.track_authorization ? { track_authorization: track.track_authorization } : {},
        );
        if (res?.url) {
          return { kind: t.format?.protocol === 'hls' ? 'hls' : 'progressive', url: res.url } as StreamInfo;
        }
      } catch {
        /* try the next transcoding */
      }
    }
    return null;
  });
}
