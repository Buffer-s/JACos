/**
 * Offline playback — "download a playlist for offline".
 *
 * Audio bytes are fetched once and stored in the Cache API (`jacos-offline-v1`),
 * plus slim metadata in localStorage so the UI knows what's saved. Nothing is
 * written to the filesystem and nothing leaves the device except the fetch
 * from SoundCloud's CDN (or, when the CDN refuses cross-origin reads, through
 * JACo's own /api/media edge proxy — same origin, no stored copy server-side).
 *
 * Offline playback prefers the saved copy; HLS-only tracks can't be saved as
 * clean files and are skipped with a clear message.
 */

import { getProgressiveStreamUrl, type SCTrack } from './soundcloud';
import { readJSON, writeJSONStrict } from './storage';

export const OFFLINE_CACHE_NAME = 'jacos-offline-v1';
const KEY_PREFIX = 'https://jac-os.pages.dev/__offline__/';
const META_KEY = 'offline_tracks';
const MAX_OFFLINE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB soft cap

export interface OfflineEntry {
  id: number;
  title: string;
  username: string;
  duration: number;
  artwork_url: string | null;
  permalink_url: string | null;
  savedAt: number;
  bytes: number;
}

export function isOfflineSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

const keyFor = (id: number) => `${KEY_PREFIX}${id}`;
const objectUrls = new Map<number, string>();

export function listOffline(): OfflineEntry[] {
  const list = readJSON<OfflineEntry[]>(META_KEY, []);
  return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'number') : [];
}

function saveMeta(list: OfflineEntry[]): boolean {
  try {
    writeJSONStrict(META_KEY, list);
    return true;
  } catch {
    return false;
  }
}

export function offlineBytes(): number {
  return listOffline().reduce((sum, e) => sum + (e.bytes || 0), 0);
}

export async function isTrackOffline(id: number): Promise<boolean> {
  if (!isOfflineSupported()) return listOffline().some((e) => e.id === id);
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const hit = await cache.match(keyFor(id));
    return !!hit;
  } catch {
    return false;
  }
}

export type SaveResult = 'saved' | 'already' | 'hls-only' | 'failed';

/** Fetch a track's progressive MP3 and store it for offline listening. */
export async function saveTrackOffline(track: SCTrack): Promise<SaveResult> {
  if (!isOfflineSupported() || typeof track?.id !== 'number') return 'failed';
  const id = track.id;
  if (listOffline().some((e) => e.id === id)) return 'already';

  const streamUrl = await getProgressiveStreamUrl(track);
  if (!streamUrl) return 'hls-only';

  // 1) try the CDN directly (free, no proxy bandwidth)…
  let blob: Blob | null = null;
  try {
    const res = await fetch(streamUrl, { mode: 'cors' });
    if (res.ok) blob = await res.blob();
  } catch {
    /* CDN refuses cross-origin reads — fall back to the same-origin proxy */
  }
  // 2) …through JACo's edge proxy when that fails (no CORS needed, same origin)
  if (!blob) {
    try {
      const res = await fetch(`/api/media?u=${encodeURIComponent(streamUrl)}`);
      if (res.ok) blob = await res.blob();
    } catch {
      /* still failing — report honestly */
    }
  }
  if (!blob) return 'failed';

  if (offlineBytes() + blob.size > MAX_OFFLINE_BYTES) return 'failed';

  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const stored = new Response(blob, {
      headers: {
        'content-type': blob.type || 'audio/mpeg',
        'x-jacos-size': String(blob.size),
        'x-cached-at': String(Date.now()),
      },
    });
    await cache.put(keyFor(id), stored);
  } catch {
    return 'failed';
  }

  const entry: OfflineEntry = {
    id,
    title: track.title,
    username: track.user?.username ?? 'Unknown artist',
    duration: typeof track.duration === 'number' ? track.duration : 0,
    artwork_url: track.artwork_url ?? null,
    permalink_url: track.permalink_url ?? null,
    savedAt: Date.now(),
    bytes: blob.size,
  };
  saveMeta([entry, ...listOffline()]);
  return 'saved';
}

export async function removeOfflineTrack(id: number): Promise<void> {
  if (isOfflineSupported()) {
    try {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      await cache.delete(keyFor(id));
    } catch {
      /* non-fatal */
    }
  }
  const obj = objectUrls.get(id);
  if (obj) {
    URL.revokeObjectURL(obj);
    objectUrls.delete(id);
  }
  saveMeta(listOffline().filter((e) => e.id !== id));
}

/** Object URL for the offline copy, or null when not saved. */
export async function getOfflineBlobUrl(id: number): Promise<string | null> {
  const memo = objectUrls.get(id);
  if (memo) return memo;
  if (!isOfflineSupported()) return null;
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const hit = await cache.match(keyFor(id));
    if (!hit) return null;
    const blob = await hit.blob();
    const obj = URL.createObjectURL(blob);
    objectUrls.set(id, obj);
    return obj;
  } catch {
    return null;
  }
}

export async function clearAllOffline(): Promise<void> {
  if (isOfflineSupported()) {
    try {
      await caches.delete(OFFLINE_CACHE_NAME);
    } catch {
      /* non-fatal */
    }
  }
  for (const obj of objectUrls.values()) URL.revokeObjectURL(obj);
  objectUrls.clear();
  saveMeta([]);
}
