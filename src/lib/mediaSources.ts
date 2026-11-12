/**
 * Multi-source audio resolution.
 *
 * SoundCloud hands out several ways to get the same track (a progressive MP3,
 * a handful of HLS presets), and any one of them can be blocked, expired or
 * broken at a given moment. So instead of picking one URL and hoping, the
 * player builds an ordered chain of sources, tries them one by one until
 * something actually plays, and remembers which source won:
 *
 *   1. local cache (handled by the player, not listed here)
 *   2. the track's transcodings, best first, reordered by what has worked before
 *   3. an optional download/resolver API the user configured in Settings
 *
 * Once a source works it is remembered for that track *and* globally, so the
 * next play (same track or not) starts with the source that is actually
 * delivering audio on this network.
 *
 * The winning source is then downloaded and handed to `audioCache.ts`, which is
 * what makes "a song that didn't work before" work next time.
 */

import { getStreamCandidates, hydrateTrack, type SCTrack } from './soundcloud';
import { getCachedAudio, hasCachedAudio, isAudioCacheEnabled, putCachedAudio, MAX_TRACK_BYTES } from './audioCache';
import { readJSON, readString, removeKey, writeJSON, writeString } from './storage';

export interface AudioSource {
  /** stable id, remembered in the source scoreboard */
  key: string;
  label: string;
  kind: 'hls' | 'progressive' | 'file';
  /** Resolve the playable URL (short-lived signed CDN URL or API answer). */
  resolveUrl: () => Promise<string>;
  /** Fetch the whole audio file for the cache. Throws when it can't be had. */
  download: () => Promise<Blob>;
  /**
   * How good this source is for a *stored copy* — lower wins.
   * 0 = progressive MP3 (seekable everywhere), 1 = HLS with MP3 segments,
   * 2 = external download API, 3 = fragmented MP4 (MSE-friendly, not always
   * playable straight from a blob). Used to order background downloads.
   */
  cacheRank?: number;
}

interface SourceStat {
  ok: number;
  fail: number;
  last: number;
}

const PREF_KEY = 'source_pref'; // { [trackId]: sourceKey }
const STATS_KEY = 'source_stats'; // { [sourceKey]: {ok, fail, last} }
const DOWNLOAD_API_KEY = 'download_api';
const MAX_PREFS = 800;

/* -------------------------------------------------------------------------- */
/* Settings: optional download API                                            */
/* -------------------------------------------------------------------------- */

export function getDownloadApi(): string {
  return readString(DOWNLOAD_API_KEY) ?? '';
}

export function setDownloadApi(value: string): void {
  const v = value.trim();
  if (v) writeString(DOWNLOAD_API_KEY, v);
  else removeKey(DOWNLOAD_API_KEY);
}

/* -------------------------------------------------------------------------- */
/* Source memory                                                              */
/* -------------------------------------------------------------------------- */

function readStats(): Record<string, SourceStat> {
  return readJSON<Record<string, SourceStat>>(STATS_KEY, {});
}

function readPrefs(): Record<string, string> {
  return readJSON<Record<string, string>>(PREF_KEY, {});
}

function quality(stat: SourceStat | undefined): number {
  if (!stat) return 0.5;
  const total = stat.ok + stat.fail;
  return total > 0 ? stat.ok / total : 0.5;
}

/** Record how a source behaved so the next attempt can start with the winner. */
export function rememberSourceResult(trackId: number, sourceKey: string, ok: boolean): void {
  try {
    const stats = readStats();
    const prev: SourceStat = stats[sourceKey] ?? { ok: 0, fail: 0, last: 0 };
    stats[sourceKey] = {
      ok: prev.ok + (ok ? 1 : 0),
      fail: prev.fail + (ok ? 0 : 1),
      last: Date.now(),
    };
    writeJSON(STATS_KEY, stats);

    const prefs = readPrefs();
    if (ok) {
      prefs[String(trackId)] = sourceKey;
    } else if (prefs[String(trackId)] === sourceKey) {
      delete prefs[String(trackId)];
    }
    const keys = Object.keys(prefs);
    if (keys.length > MAX_PREFS) {
      // drop the oldest insertions (string keys keep insertion order)
      for (const key of keys.slice(0, keys.length - MAX_PREFS)) delete prefs[key];
    }
    writeJSON(PREF_KEY, prefs);
  } catch {
    /* memory is best-effort */
  }
}

export interface SourceMemory {
  tracks: number;
  stats: { key: string; ok: number; fail: number; rate: number }[];
}

export function getSourceMemory(): SourceMemory {
  const prefs = readPrefs();
  const stats = readStats();
  return {
    tracks: Object.keys(prefs).length,
    stats: Object.entries(stats)
      .map(([key, s]) => ({ key, ok: s.ok, fail: s.fail, rate: quality(s) }))
      .sort((a, b) => b.ok - a.ok || b.rate - a.rate),
  };
}

export function forgetSourceMemory(): void {
  removeKey(PREF_KEY);
  removeKey(STATS_KEY);
}

/** Best-known-first ordering: this track's winner, then the global winners. */
function orderByMemory(trackId: number, sources: AudioSource[]): AudioSource[] {
  const prefs = readPrefs();
  const stats = readStats();
  const preferred = prefs[String(trackId)];
  return sources
    .map((source, index) => ({ source, index }))
    .sort((a, b) => {
      const pa = a.source.key === preferred ? 0 : 1;
      const pb = b.source.key === preferred ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const qa = quality(stats[a.source.key]);
      const qb = quality(stats[b.source.key]);
      if (Math.abs(qa - qb) > 0.05) return qb - qa;
      return a.index - b.index; // keep the natural (best-quality) order
    })
    .map(({ source }) => source);
}

/* -------------------------------------------------------------------------- */
/* Fetch helpers                                                              */
/* -------------------------------------------------------------------------- */

async function fetchWithTimeout(url: string, ms = 60_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAudioBytes(url: string, maxBytes = MAX_TRACK_BYTES): Promise<Blob> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`audio download answered HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error('track is too large to cache');
  const blob = await res.blob();
  if (blob.size === 0) throw new Error('audio download was empty');
  if (blob.size > maxBytes) throw new Error('track is too large to cache');
  return blob;
}

function playlistKind(text: string): string {
  // fragmented MP4 (HLS aac presets) needs its init segment up front
  if (/#EXT-X-MAP/i.test(text)) return 'audio/mp4';
  if (/\.mp3(\?|$)/im.test(text)) return 'audio/mpeg';
  return 'audio/aac';
}

/**
 * Download an HLS track by fetching its playlist and every segment, then
 * concatenating the bytes. This is the "download using the APIs" route for
 * tracks that only offer HLS — exactly the ones that tend to fail in `<audio>`.
 */
async function downloadHls(playlistUrl: string): Promise<Blob> {
  const res = await fetchWithTimeout(playlistUrl, 30_000);
  if (!res.ok) throw new Error(`HLS playlist answered HTTP ${res.status}`);
  const text = await res.text();

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const segmentUrls: string[] = [];
  let initUrl: string | null = null;
  let encrypted = false;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY') && !/METHOD=NONE/i.test(line)) encrypted = true;
    if (line.startsWith('#EXT-X-MAP')) {
      const m = line.match(/URI="([^"]+)"/);
      if (m) initUrl = new URL(m[1], playlistUrl).toString();
      continue;
    }
    if (line.startsWith('#')) continue;
    segmentUrls.push(new URL(line, playlistUrl).toString());
  }
  if (encrypted) throw new Error('HLS stream is encrypted');
  if (segmentUrls.length === 0) throw new Error('HLS playlist had no segments');

  const parts: BlobPart[] = [];
  let bytes = 0;
  const add = (blob: Blob) => {
    bytes += blob.size;
    if (bytes > MAX_TRACK_BYTES) throw new Error('track is too large to cache');
    parts.push(blob);
  };

  if (initUrl) {
    const initRes = await fetchWithTimeout(initUrl);
    if (!initRes.ok) throw new Error('HLS init segment failed');
    add(await initRes.blob());
  }

  // A few segments at a time keeps it quick without hammering the CDN.
  const BATCH = 4;
  for (let i = 0; i < segmentUrls.length; i += BATCH) {
    const batch = segmentUrls.slice(i, i + BATCH);
    const blobs = await Promise.all(
      batch.map(async (url) => {
        const segRes = await fetchWithTimeout(url, 30_000);
        if (!segRes.ok) throw new Error(`HLS segment answered HTTP ${segRes.status}`);
        return segRes.blob();
      }),
    );
    for (const blob of blobs) add(blob);
  }

  return new Blob(parts, { type: playlistKind(text) });
}

/* -------------------------------------------------------------------------- */
/* Optional external download API                                             */
/* -------------------------------------------------------------------------- */

function trackUrl(track: SCTrack): string {
  if (track.permalink_url) return track.permalink_url;
  const user = track.user?.permalink;
  const permalink = track.permalink;
  return user && permalink ? `https://soundcloud.com/${user}/${permalink}` : 'https://soundcloud.com';
}

function downloadApiRequest(track: SCTrack): string {
  const api = getDownloadApi();
  const target = trackUrl(track);
  if (api.includes('{url}')) return api.replace(/\{url\}/g, encodeURIComponent(target));
  const sep = api.includes('?') ? '&' : '?';
  return `${api}${sep}url=${encodeURIComponent(target)}`;
}

function pickAudioUrl(body: unknown, depth = 0): string | null {
  if (depth > 3 || !body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const directKeys = ['downloadUrl', 'download_url', 'audioUrl', 'audio_url', 'stream_url', 'streamUrl', 'audio', 'url'];
  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  }
  for (const key of ['data', 'result', 'track', 'media']) {
    const nested = pickAudioUrl(record[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

async function resolveDownloadApi(track: SCTrack): Promise<string> {
  const endpoint = downloadApiRequest(track);
  const res = await fetchWithTimeout(endpoint, 25_000);
  if (!res.ok) throw new Error(`download API answered HTTP ${res.status}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('download API did not answer with JSON');
  }
  if (body && typeof body === 'object' && (body as { status?: unknown }).status === false) {
    const reason = (body as { reason?: unknown }).reason;
    throw new Error(typeof reason === 'string' && reason ? reason : 'download API could not resolve that track');
  }
  const url = pickAudioUrl(body);
  if (!url) throw new Error('download API returned no audio URL');
  return url;
}

/* -------------------------------------------------------------------------- */
/* The chain                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Ordered list of network sources to try for a track. The player walks it
 * until one produces audio; empty list = SoundCloud says nothing is playable.
 *
 * Hydrates first: search rows and playlist stubs often arrive without
 * `media.transcodings`, and building a chain from those produced an empty list
 * — i.e. "this track has no playable stream" without a single attempt.
 */
export async function buildAudioChain(track: SCTrack): Promise<AudioSource[]> {
  const full = await hydrateTrack(track).catch(() => track);
  const sources: AudioSource[] = getStreamCandidates(full).map((candidate) => ({
    key: candidate.key,
    label: candidate.label,
    kind: candidate.kind,
    cacheRank:
      candidate.kind === 'progressive' ? 0 : candidate.preset.toLowerCase().startsWith('mp3') ? 1 : 3,
    resolveUrl: async () => (await candidate.resolve()).url,
    download: async () => {
      const { url } = await candidate.resolve();
      return candidate.kind === 'hls' ? downloadHls(url) : fetchAudioBytes(url);
    },
  }));

  if (getDownloadApi()) {
    sources.push({
      key: 'custom-api',
      label: 'your download API',
      kind: 'file',
      cacheRank: 2,
      resolveUrl: () => resolveDownloadApi(track),
      download: async () => fetchAudioBytes(await resolveDownloadApi(track)),
    });
  }

  return orderByMemory(full.id, sources);
}

/* -------------------------------------------------------------------------- */
/* Background caching                                                         */
/* -------------------------------------------------------------------------- */

const inFlight = new Set<number>();
let activeDownloads = 0;
const waiting: (() => void)[] = [];
const MAX_PARALLEL_DOWNLOADS = 2;

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeDownloads >= MAX_PARALLEL_DOWNLOADS) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  activeDownloads += 1;
  try {
    return await work();
  } finally {
    activeDownloads -= 1;
    waiting.shift()?.();
  }
}

/**
 * Download a track's audio through whichever source works and store it in the
 * browser cache. Called after playback starts, so it never delays the music.
 * Returns the source key that produced the cached file (or null).
 */
export async function cacheTrackAudio(
  track: SCTrack,
  winner?: AudioSource,
): Promise<string | null> {
  if (!isAudioCacheEnabled() || !track || typeof track.id !== 'number') return null;
  if (inFlight.has(track.id)) return null;
  if (await hasCachedAudio(track.id)) return null;

  inFlight.add(track.id);
  try {
    return await withSlot(async () => {
      if (await getCachedAudio(track.id)) return null;
      const chain = await buildAudioChain(track);
      const rank = (source: AudioSource) => source.cacheRank ?? 2;
      const rest = chain.filter((source) => source.key !== winner?.key).sort((a, b) => rank(a) - rank(b));
      // Prefer a file that plays straight from a blob: the winning source when
      // it is one of those, otherwise the best-ranked download, then the rest.
      const ordered = !winner ? chain.slice().sort((a, b) => rank(a) - rank(b)) : rank(winner) <= 2 ? [winner, ...rest] : [...rest, winner];
      for (const source of ordered) {
        try {
          const blob = await source.download();
          if (!blob || blob.size === 0) continue;
          if (await putCachedAudio(track.id, blob, { title: track.title, source: source.key })) {
            return source.key;
          }
        } catch {
          /* try the next source — a blocked download must not break playback */
        }
      }
      return null;
    });
  } finally {
    inFlight.delete(track.id);
  }
}
