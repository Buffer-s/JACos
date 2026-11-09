/**
 * Local library — liked tracks and playlists stored ONLY in this browser.
 *
 * Nothing here ever leaves the device: no uploads, no sync, no account.
 * Tracks are stored as full api-v2 objects so lists render without refetching.
 */

import { readJSON, readString, removeKey, writeJSONStrict } from './storage';
import { getTracksByIds, type SCTrack } from './soundcloud';

const PLAYLISTS_KEY = 'local_playlists';
const LIKES_KEY = 'liked_tracks';
const LEGACY_LIKES_KEY = 'liked';
const MAX_PLAYLISTS = 100;
const MAX_TRACKS_PER_PLAYLIST = 500;
const MAX_LIKES = 500;

export interface LocalPlaylist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: SCTrack[];
}

/** Notify the UI (sidebar etc.) that the local library changed. */
function emitChange(): void {
  try {
    window.dispatchEvent(new CustomEvent('jacos:local-lib'));
  } catch {
    /* non-browser (tests) — ignore */
  }
}

export function onLocalLibraryChange(fn: () => void): () => void {
  window.addEventListener('jacos:local-lib', fn);
  return () => window.removeEventListener('jacos:local-lib', fn);
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
}

/* ------------------------------- Playlists ------------------------------- */

export function getLocalPlaylists(): LocalPlaylist[] {
  const list = readJSON<LocalPlaylist[]>(PLAYLISTS_KEY, []);
  return Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.tracks)) : [];
}

function savePlaylists(list: LocalPlaylist[]): boolean {
  try {
    writeJSONStrict(PLAYLISTS_KEY, list);
    emitChange();
    return true;
  } catch (err) {
    if (isQuotaError(err)) console.warn('jacos: local playlist storage is full');
    return false;
  }
}

export function getLocalPlaylist(id: string): LocalPlaylist | null {
  return getLocalPlaylists().find((p) => p.id === id) ?? null;
}

export function createLocalPlaylist(name: string): LocalPlaylist | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const list = getLocalPlaylists();
  if (list.length >= MAX_PLAYLISTS) return null;
  const now = Date.now();
  const playlist: LocalPlaylist = {
    id: `lp-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    tracks: [],
  };
  if (!savePlaylists([playlist, ...list])) return null;
  return playlist;
}

export function renameLocalPlaylist(id: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const list = getLocalPlaylists();
  const target = list.find((p) => p.id === id);
  if (!target) return false;
  target.name = trimmed;
  target.updatedAt = Date.now();
  return savePlaylists(list);
}

export function deleteLocalPlaylist(id: string): void {
  savePlaylists(getLocalPlaylists().filter((p) => p.id !== id));
}

/** Returns 'added' | 'duplicate' | 'full' | 'missing'. */
export function addTrackToLocalPlaylist(id: string, track: SCTrack): 'added' | 'duplicate' | 'full' | 'missing' {
  const list = getLocalPlaylists();
  const target = list.find((p) => p.id === id);
  if (!target) return 'missing';
  if (target.tracks.some((t) => t.id === track.id)) return 'duplicate';
  if (target.tracks.length >= MAX_TRACKS_PER_PLAYLIST) return 'full';
  target.tracks = [...target.tracks, track];
  target.updatedAt = Date.now();
  return savePlaylists(list) ? 'added' : 'full';
}

export function removeTrackFromLocalPlaylist(id: string, trackId: number): boolean {
  const list = getLocalPlaylists();
  const target = list.find((p) => p.id === id);
  if (!target) return false;
  target.tracks = target.tracks.filter((t) => t.id !== trackId);
  target.updatedAt = Date.now();
  return savePlaylists(list);
}

export function localPlaylistDuration(p: LocalPlaylist): number {
  return p.tracks.reduce((sum, t) => sum + (typeof t.duration === 'number' ? t.duration : 0), 0);
}

/* --------------------------------- Likes --------------------------------- */

export function getLikedTracks(): SCTrack[] {
  const list = readJSON<SCTrack[]>(LIKES_KEY, []);
  return Array.isArray(list) ? list.filter((t) => t && typeof t.id === 'number') : [];
}

export function isTrackLiked(trackId: number): boolean {
  return getLikedTracks().some((t) => t.id === trackId);
}

/** Toggles the like. Returns the new liked state. */
export function toggleLikedTrack(track: SCTrack): boolean {
  const list = getLikedTracks();
  const exists = list.some((t) => t.id === track.id);
  const next = exists ? list.filter((t) => t.id !== track.id) : [track, ...list].slice(0, MAX_LIKES);
  try {
    writeJSONStrict(LIKES_KEY, next);
  } catch {
    /* quota — likes silently capped */
  }
  emitChange();
  return !exists;
}

export function replaceLikedTracks(tracks: SCTrack[]): void {
  try {
    writeJSONStrict(LIKES_KEY, tracks.slice(0, MAX_LIKES));
  } catch {
    /* quota — likes silently capped */
  }
  emitChange();
}

/** One-time migration: legacy 'liked' stored bare ids; hydrate them to full tracks. */
export async function migrateLegacyLikes(): Promise<void> {
  try {
    const legacy = readJSON<unknown>(LEGACY_LIKES_KEY, []);
    if (!Array.isArray(legacy)) return;
    const ids = legacy.filter((v): v is number => typeof v === 'number');
    if (ids.length > 0) {
      const fetched = await getTracksByIds(ids);
      const existing = getLikedTracks();
      const seen = new Set(existing.map((t) => t.id));
      replaceLikedTracks([...fetched.filter((t) => !seen.has(t.id)), ...existing]);
    }
    removeKey(LEGACY_LIKES_KEY);
  } catch {
    /* offline or API hiccup — migration runs again next visit */
  }
}

/** True when storage holds something liked (used to render the empty state). */
export function legacyLikesPending(): boolean {
  const raw = readString(LEGACY_LIKES_KEY);
  return !!raw;
}
