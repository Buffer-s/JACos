/**
 * Audio cache — the browser-side copy of tracks JACos managed to obtain.
 *
 * Whenever a track starts playing, the winning audio source is fetched in the
 * background (see `mediaSources.ts`) and stored in the browser's Cache Storage
 * under a synthetic request key per track id. The player always checks this
 * cache first, so a track that once worked keeps working even when
 * SoundCloud's CDN (or the bridge) is having a bad day.
 *
 * Everything is best-effort: private mode, a missing Cache Storage API or a
 * full disk simply means "no cache", never a broken player.
 */

import { readString, writeString } from './storage';

const CACHE_NAME = 'jacos-audio-v1';
const FAKE_ORIGIN = 'https://jacos-audio.local';
const ENABLED_KEY = 'audio_cache';
/** Whole-cache ceiling — oldest tracks are evicted first. */
const MAX_BYTES = 300 * 1024 * 1024;
/** A single track larger than this is streamed but never stored. */
export const MAX_TRACK_BYTES = 60 * 1024 * 1024;
const MAX_ENTRIES = 400;

export interface CachedAudioMeta {
  trackId: number;
  title: string;
  /** audio source key that produced the file, e.g. `hls:aac_160k` */
  source: string;
  bytes: number;
  storedAt: number;
  type: string;
}

export interface AudioCacheStats {
  supported: boolean;
  enabled: boolean;
  count: number;
  bytes: number;
  maxBytes: number;
  entries: CachedAudioMeta[];
}

export function audioCacheSupported(): boolean {
  return typeof caches !== 'undefined' && typeof caches.open === 'function';
}

export function isAudioCacheEnabled(): boolean {
  return readString(ENABLED_KEY) !== '0';
}

export function setAudioCacheEnabled(on: boolean): void {
  writeString(ENABLED_KEY, on ? '1' : '0');
}

function keyFor(trackId: number): Request {
  return new Request(`${FAKE_ORIGIN}/track/${trackId}`, { method: 'GET' });
}

async function openCache(): Promise<Cache | null> {
  if (!audioCacheSupported()) return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null; // blocked in private mode / opaque origin
  }
}

/** Every stored entry's metadata (headers only — bodies are never read). */
async function listEntries(cache: Cache): Promise<CachedAudioMeta[]> {
  const out: CachedAudioMeta[] = [];
  let keys: readonly Request[] = [];
  try {
    keys = await cache.keys();
  } catch {
    return out;
  }
  for (const req of keys) {
    let res: Response | undefined;
    try {
      res = await cache.match(req);
    } catch {
      continue;
    }
    if (!res) continue;
    const fromUrl = Number(req.url.split('/').pop());
    const trackId = Number(res.headers.get('x-jacos-track') ?? fromUrl);
    if (!Number.isFinite(trackId)) continue;
    out.push({
      trackId,
      title: res.headers.get('x-jacos-title') ?? '',
      source: res.headers.get('x-jacos-source') ?? '',
      bytes: Number(res.headers.get('content-length') ?? 0) || 0,
      storedAt: Number(res.headers.get('x-jacos-stored') ?? 0) || 0,
      type: res.headers.get('content-type') ?? 'audio/mpeg',
    });
  }
  return out;
}

/** Keep the cache under its byte/entry ceilings by dropping the oldest tracks. */
async function trim(cache: Cache, metas?: CachedAudioMeta[]): Promise<void> {
  const all = (metas ?? (await listEntries(cache))).slice().sort((a, b) => a.storedAt - b.storedAt);
  let bytes = all.reduce((n, m) => n + m.bytes, 0);
  let count = all.length;
  for (const meta of all) {
    if (bytes <= MAX_BYTES && count <= MAX_ENTRIES) break;
    try {
      await cache.delete(keyFor(meta.trackId));
      bytes -= meta.bytes;
      count -= 1;
    } catch {
      /* keep going — one stubborn entry must not block eviction */
    }
  }
}

/**
 * Store a track's audio. Returns true when it actually landed in the cache.
 * Oversized or empty blobs are skipped (the track still streams, it just
 * isn't remembered).
 */
export async function putCachedAudio(
  trackId: number,
  blob: Blob,
  meta: { title?: string; source?: string } = {},
): Promise<boolean> {
  if (!isAudioCacheEnabled()) return false;
  if (!blob || blob.size === 0 || blob.size > MAX_TRACK_BYTES) return false;
  const cache = await openCache();
  if (!cache) return false;

  const headers = new Headers({
    'content-type': blob.type || 'audio/mpeg',
    'content-length': String(blob.size),
    'x-jacos-track': String(trackId),
    'x-jacos-title': (meta.title ?? '').slice(0, 200),
    'x-jacos-source': (meta.source ?? '').slice(0, 80),
    'x-jacos-stored': String(Date.now()),
  });
  try {
    await cache.put(keyFor(trackId), new Response(blob, { status: 200, headers }));
  } catch {
    return false; // quota or unsupported body type
  }
  await trim(cache);
  return true;
}

export async function getCachedAudio(trackId: number): Promise<Blob | null> {
  if (!isAudioCacheEnabled()) return null;
  const cache = await openCache();
  if (!cache) return null;
  try {
    const res = await cache.match(keyFor(trackId));
    if (!res) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

export async function hasCachedAudio(trackId: number): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;
  try {
    return !!(await cache.match(keyFor(trackId)));
  } catch {
    return false;
  }
}

export async function removeCachedAudio(trackId: number): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  try {
    await cache.delete(keyFor(trackId));
  } catch {
    /* non-fatal */
  }
}

export async function clearAudioCache(): Promise<void> {
  if (!audioCacheSupported()) return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    /* non-fatal */
  }
}

export async function getAudioCacheStats(): Promise<AudioCacheStats> {
  const supported = audioCacheSupported();
  const base: AudioCacheStats = {
    supported,
    enabled: isAudioCacheEnabled(),
    count: 0,
    bytes: 0,
    maxBytes: MAX_BYTES,
    entries: [],
  };
  if (!supported) return base;
  const cache = await openCache();
  if (!cache) return base;
  const entries = (await listEntries(cache)).sort((a, b) => b.storedAt - a.storedAt);
  return {
    ...base,
    count: entries.length,
    bytes: entries.reduce((n, m) => n + m.bytes, 0),
    entries,
  };
}

/** "84.2 MB" — shared by Settings and the cache status line. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
