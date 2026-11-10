/**
 * Public playlists — the only part of JACo's that uses a server, because it
 * has to: a link that strangers open must resolve to the same playlist for
 * everyone. Stored in Supabase (JACo's project) as a snapshot of the track
 * list; the creator gets an editor key (kept only on their device) which is
 * required to change or remove the snapshot afterwards. No accounts.
 *
 * Rows are world-readable and anonymous-insert only. Updates and deletes go
 * through RPC functions that check the editor key — nobody can overwrite or
 * delete someone else's playlist.
 */

import type { SCTrack } from './soundcloud';

const SUPABASE_URL = 'https://kxnpxckpgmlzxrotisvo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DH5EuZnq-xLg99EmC5l8wg_SFeYWbj3';
const REST = `${SUPABASE_URL}/rest/v1/public_playlists`;
const RPC = `${SUPABASE_URL}/rest/v1/rpc`;

const HEADERS = {
  apikey: SUPABASE_KEY,
  authorization: `Bearer ${SUPABASE_KEY}`,
  'content-type': 'application/json',
};

/** Single-segment paths the app owns; these can never be public-playlist slugs. */
export const RESERVED_SLUGS = new Set([
  'user', 'users', 'playlist', 'playlists', 'resolve', 'search', 'likes',
  'public', 'api', 'assets', 'static', 'settings', 'download', 'offline',
  'sitemap', 'robots', 'favicon', 'og', 'manifest', 'index', 'help', 'about',
]);

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;

export function slugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return 'Slugs are 3–40 chars: lowercase letters, digits, hyphens (no leading hyphen).';
  if (RESERVED_SLUGS.has(slug)) return 'That name is reserved by JACo’s.';
  return null;
}

export interface TrackSnapshot {
  id: number;
  title: string;
  duration: number;
  artwork_url: string | null;
  permalink_url: string | null;
  permalink: string | null;
  username: string;
  user_permalink?: string;
}

export interface PublicPlaylist {
  slug: string;
  name: string;
  tracks: TrackSnapshot[];
  created_at: string;
  updated_at: string;
}

export function slimTrack(t: SCTrack): TrackSnapshot {
  return {
    id: t.id,
    title: t.title,
    duration: typeof t.duration === 'number' ? t.duration : 0,
    artwork_url: t.artwork_url ?? null,
    permalink_url: t.permalink_url ?? null,
    permalink: t.permalink ?? null,
    username: t.user?.username ?? 'Unknown artist',
    user_permalink: t.user?.permalink ?? undefined,
  };
}

/** 'available' | 'taken' | 'error' */
export async function checkSlugAvailable(slug: string): Promise<'available' | 'taken' | 'error'> {
  try {
    const res = await fetch(`${REST}?select=slug&slug=eq.${encodeURIComponent(slug)}&limit=1`, { headers: HEADERS });
    if (!res.ok) return 'error';
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) && rows.length === 0 ? 'available' : 'taken';
  } catch {
    return 'error';
  }
}

/** Publishes a snapshot; returns the editor key or an error string. */
export async function publishPublicPlaylist(input: {
  slug: string;
  name: string;
  tracks: SCTrack[];
}): Promise<{ slug: string; editorKey: string } | 'taken' | 'error'> {
  const editorKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  try {
    const res = await fetch(REST, {
      method: 'POST',
      headers: { ...HEADERS, prefer: 'return=minimal' },
      body: JSON.stringify({
        slug: input.slug,
        name: input.name.slice(0, 80),
        tracks: input.tracks.slice(0, 200).map(slimTrack),
        editor_key: editorKey,
      }),
    });
    if (res.status === 409) return 'taken';
    if (!res.ok) return 'error';
    return { slug: input.slug, editorKey };
  } catch {
    return 'error';
  }
}

export async function getPublicPlaylist(slug: string): Promise<PublicPlaylist | null> {
  try {
    const res = await fetch(
      `${REST}?select=slug,name,tracks,created_at,updated_at&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: HEADERS },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as PublicPlaylist[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Overwrite the snapshot after local edits. Silent on failure. */
export async function updatePublicPlaylist(
  slug: string,
  editorKey: string,
  name: string,
  tracks: SCTrack[],
): Promise<boolean> {
  try {
    const res = await fetch(`${RPC}/update_public_playlist`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        p_slug: slug,
        p_editor_key: editorKey,
        p_name: name.slice(0, 80),
        p_tracks: tracks.slice(0, 200).map(slimTrack),
      }),
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch {
    return false;
  }
}

/** Make the public link go away (becomes the private local copy only). */
export async function deletePublicPlaylist(slug: string, editorKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${RPC}/delete_public_playlist`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ p_slug: slug, p_editor_key: editorKey }),
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch {
    return false;
  }
}
