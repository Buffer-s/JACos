/**
 * Browser-native audio cache.
 *
 * Songs are fetched once from SoundCloud's CDN and stored in the Cache API
 * (`jacos-audio-v1`), which lives entirely inside the browser profile. Nothing
 * is ever written to the user's filesystem. An LRU cap keeps the cache bounded
 * (MAX_ENTRIES / MAX_BYTES), and repeat plays are served from cache.
 *
 * If the fetch fails (CORS, offline, quota) the caller gets the raw CDN URL
 * and the <audio> element streams it directly — playback always wins over caching.
 */

export const AUDIO_CACHE_NAME = 'jacos-audio-v1';
const MAX_ENTRIES = 40;
const MAX_BYTES = 256 * 1024 * 1024; // 256 MB
const KEY_PREFIX = 'https://jacos.cache/track/';

export interface CacheResult {
  /** URL to assign to audio.src (object URL when cached, CDN URL otherwise). */
  url: string;
  fromCache: boolean;
  cacheable: boolean;
}

export interface CacheStats {
  entries: number;
  bytes: number;
  supported: boolean;
}

const objectUrls = new Map<string, string>(); // cache key -> object URL
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

/** Subscribe to cache changes (for the settings panel). Returns unsubscribe. */
export function onCacheChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isCacheSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

const keyFor = (trackId: number | string) => `${KEY_PREFIX}${trackId}`;

/** Evict oldest entries until within both caps. Best effort. */
async function evict(cache: Cache): Promise<void> {
  const keys = await cache.keys();
  interface Entry { key: Request; size: number; at: number }
  const entries: Entry[] = await Promise.all(
    keys.map(async (key) => {
      const res = await cache.match(key);
      const size = Number(res?.headers.get('x-jacos-size') ?? 0) || 0;
      const at = Number(res?.headers.get('x-cached-at') ?? 0) || 0;
      return { key, size, at };
    }),
  );
  entries.sort((a, b) => a.at - b.at);
  let totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
  let total = entries.length;
  while (total > MAX_ENTRIES || totalBytes > MAX_BYTES) {
    const oldest = entries.shift();
    if (!oldest) break;
    await cache.delete(oldest.key);
    const obj = objectUrls.get(oldest.key.url);
    if (obj) {
      URL.revokeObjectURL(obj);
      objectUrls.delete(oldest.key.url);
    }
    totalBytes -= oldest.size;
    total -= 1;
  }
}

/**
 * Get a playable URL for a progressive stream, caching it on first use.
 * Falls back to the raw CDN URL when fetching for cache purposes fails.
 */
export async function ensurePlayable(trackId: number, directUrl: string): Promise<CacheResult> {
  const key = keyFor(trackId);

  const mem = objectUrls.get(key);
  if (mem) return { url: mem, fromCache: true, cacheable: true };

  if (!isCacheSupported()) return { url: directUrl, fromCache: false, cacheable: false };

  let cache: Cache;
  try {
    cache = await caches.open(AUDIO_CACHE_NAME);
  } catch {
    return { url: directUrl, fromCache: false, cacheable: false };
  }

  // 1) cache hit?
  try {
    const hit = await cache.match(key);
    if (hit) {
      const blob = await hit.blob();
      const obj = URL.createObjectURL(blob);
      objectUrls.set(key, obj);
      emit();
      return { url: obj, fromCache: true, cacheable: true };
    }
  } catch {
    /* fall through to network */
  }

  // 2) fetch + store
  try {
    const res = await fetch(directUrl, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const stored = new Response(blob, {
      headers: {
        'content-type': blob.type || 'audio/mpeg',
        'x-jacos-size': String(blob.size),
        'x-cached-at': String(Date.now()),
      },
    });
    try {
      await cache.put(key, stored);
      await evict(cache);
    } catch {
      // Quota or put failure — keep playback, drop the cache write.
    }
    const obj = URL.createObjectURL(blob);
    objectUrls.set(key, obj);
    emit();
    return { url: obj, fromCache: false, cacheable: true };
  } catch {
    // 3) uncacheable (CORS/offline) — let <audio> stream the CDN URL directly
    return { url: directUrl, fromCache: false, cacheable: false };
  }
}

export async function cacheStats(): Promise<CacheStats> {
  if (!isCacheSupported()) return { entries: 0, bytes: 0, supported: false };
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    let bytes = 0;
    await Promise.all(
      keys.map(async (key) => {
        const res = await cache.match(key);
        bytes += Number(res?.headers.get('x-jacos-size') ?? 0) || 0;
      }),
    );
    return { entries: keys.length, bytes, supported: true };
  } catch {
    return { entries: 0, bytes: 0, supported: true };
  }
}

export async function clearAudioCache(): Promise<void> {
  if (isCacheSupported()) {
    try {
      await caches.delete(AUDIO_CACHE_NAME);
    } catch {
      /* non-fatal */
    }
  }
  for (const obj of objectUrls.values()) URL.revokeObjectURL(obj);
  objectUrls.clear();
  emit();
}

/** Fire-and-forget: make sure the next track is already cached. */
export async function prefetchTrack(trackId: number, directUrl: string): Promise<void> {
  try {
    await ensurePlayable(trackId, directUrl);
  } catch {
    /* prefetch is best effort */
  }
}
