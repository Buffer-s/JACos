import type { Playlist, Profile, StreamInfo, Track } from "./types";

const API = "https://api-v2.soundcloud.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* -------------------------------------------------------------------------- */
/* In-memory cache (nothing is ever written to disk)                          */
/* -------------------------------------------------------------------------- */

type Entry = { value: unknown; expires: number };
type Store = {
  cache: Map<string, Entry>;
  inflight: Map<string, Promise<unknown>>;
  clientId?: { id: string; expires: number };
};

const g = globalThis as unknown as { __jaco?: Store };
const store: Store = (g.__jaco ??= { cache: new Map(), inflight: new Map() });

const MAX_ENTRIES = 600;

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const pending = store.inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = load()
    .then((value) => {
      if (store.cache.size >= MAX_ENTRIES) {
        const oldest = store.cache.keys().next().value;
        if (oldest !== undefined) store.cache.delete(oldest);
      }
      store.cache.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .finally(() => store.inflight.delete(key));

  store.inflight.set(key, p);
  return p;
}

const MIN = 60_000;

/* -------------------------------------------------------------------------- */
/* client_id handling                                                         */
/* -------------------------------------------------------------------------- */

async function scrapeClientId(): Promise<string> {
  const home = await fetch("https://soundcloud.com/", {
    headers: { "user-agent": UA },
    cache: "no-store",
  });
  const html = await home.text();
  const scripts = [...html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(
    (m) => m[1],
  );

  for (const src of scripts.reverse()) {
    try {
      const res = await fetch(src, { headers: { "user-agent": UA }, cache: "no-store" });
      const js = await res.text();
      const m = js.match(/[?&,{ ]client_id[:=]"?([a-zA-Z0-9]{32})"?/);
      if (m) return m[1];
    } catch {
      // try the next bundle
    }
  }
  throw new Error("Could not obtain a SoundCloud client id");
}

async function getClientId(force = false): Promise<string> {
  if (!force && process.env.SOUNDCLOUD_CLIENT_ID) return process.env.SOUNDCLOUD_CLIENT_ID;
  const current = store.clientId;
  if (!force && current && current.expires > Date.now()) return current.id;

  const key = "__client_id__";
  const pending = store.inflight.get(key);
  if (pending) return pending as Promise<string>;

  const p = scrapeClientId()
    .then((id) => {
      store.clientId = { id, expires: Date.now() + 6 * 60 * MIN };
      return id;
    })
    .finally(() => store.inflight.delete(key));
  store.inflight.set(key, p);
  return p;
}

/* -------------------------------------------------------------------------- */
/* Low level fetch                                                            */
/* -------------------------------------------------------------------------- */

type Params = Record<string, string | number | undefined>;

async function scGet<T = any>(pathOrUrl: string, params: Params = {}): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const clientId = await getClientId(attempt > 0);
    const url = new URL(pathOrUrl.startsWith("http") ? pathOrUrl : `${API}${pathOrUrl}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    url.searchParams.set("client_id", clientId);

    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, cache: "no-store" });
    if (res.status === 404) return null;
    if ((res.status === 401 || res.status === 403) && attempt === 0) continue;
    if (!res.ok) throw new Error(`SoundCloud responded with ${res.status}`);
    return (await res.json()) as T;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Mapping                                                                    */
/* -------------------------------------------------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapTrack(t: any): Track {
  const transcodings: any[] = t.media?.transcodings ?? [];
  return {
    id: t.id,
    title: t.title ?? "Untitled",
    artist: t.user?.username ?? "Unknown artist",
    artistPermalink: t.user?.permalink ?? "",
    artwork: t.artwork_url ?? t.user?.avatar_url ?? null,
    duration: t.full_duration ?? t.duration ?? 0,
    url: t.permalink_url ?? "",
    playable: t.streamable !== false && t.policy !== "BLOCK" && transcodings.length > 0,
  };
}

function mapProfile(u: any): Profile {
  return {
    id: u.id,
    username: u.username ?? u.permalink,
    fullName: u.full_name ?? "",
    permalink: u.permalink,
    url: u.permalink_url,
    avatar: u.avatar_url ?? null,
    banner: u.visuals?.visuals?.[0]?.visual_url ?? null,
    description: u.description ?? "",
    city: u.city ?? null,
    country: u.country_code ?? null,
    followers: u.followers_count ?? 0,
    following: u.followings_count ?? 0,
    trackCount: u.track_count ?? 0,
    playlistCount: u.playlist_count ?? 0,
    verified: Boolean(u.verified),
  };
}

function mapPlaylist(p: any, tracks: Track[]): Playlist {
  const firstArt = tracks.find((t) => t.artwork)?.artwork ?? null;
  return {
    id: p.id,
    title: p.title ?? "Untitled playlist",
    slug: p.permalink,
    url: p.permalink_url,
    artwork: p.artwork_url ?? firstArt ?? p.user?.avatar_url ?? null,
    description: p.description ?? "",
    trackCount: p.track_count ?? tracks.length,
    duration: p.duration ?? tracks.reduce((a, t) => a + t.duration, 0),
    isAlbum: Boolean(p.is_album),
    createdAt: p.display_date ?? p.created_at ?? "",
    ownerPermalink: p.user?.permalink ?? "",
    ownerName: p.user?.username ?? "",
    tracks,
  };
}

/** Playlist payloads often carry only the first few tracks fully populated. Fill in the rest. */
async function hydrateTracks(raw: any[]): Promise<Track[]> {
  const byId = new Map<number, any>();
  const missing: number[] = [];
  for (const t of raw) {
    if (t.title && t.media) byId.set(t.id, t);
    else missing.push(t.id);
  }

  const chunks: number[][] = [];
  for (let i = 0; i < missing.length; i += 30) chunks.push(missing.slice(i, i + 30));
  const results = await Promise.all(chunks.map((ids) => scGet<any[]>("/tracks", { ids: ids.join(",") })));
  for (const list of results) for (const t of list ?? []) byId.set(t.id, t);

  return raw.map((t) => byId.get(t.id)).filter(Boolean).map(mapTrack);
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export function getProfile(permalink: string): Promise<Profile | null> {
  const key = `profile:${permalink.toLowerCase()}`;
  return cached(key, 10 * MIN, async () => {
    const data = await scGet<any>("/resolve", { url: `https://soundcloud.com/${encodeURIComponent(permalink)}` });
    if (!data || data.kind !== "user") return null;
    return mapProfile(data);
  });
}

async function collectPages(path: string): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = path;
  let first = true;
  for (let page = 0; page < 6 && next; page++) {
    const data: any = await scGet<any>(next, first ? { limit: 50, linked_partitioning: 1 } : {});
    first = false;
    if (!data) break;
    out.push(...(data.collection ?? []));
    next = data.next_href ?? null;
  }
  return out;
}

export function getUserPlaylists(userId: number): Promise<Playlist[]> {
  return cached(`playlists:${userId}`, 10 * MIN, async () => {
    const [sets, albums] = await Promise.all([
      collectPages(`/users/${userId}/playlists_without_albums`),
      collectPages(`/users/${userId}/albums`),
    ]);
    const seen = new Set<number>();
    const merged = [...sets, ...albums].filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    merged.sort((a, b) => String(b.display_date ?? b.created_at).localeCompare(String(a.display_date ?? a.created_at)));

    return merged
      .filter((p) => p.sharing !== "private")
      .map((p) => mapPlaylist(p, (p.tracks ?? []).filter((t: any) => t.title).map(mapTrack)));
  });
}

async function buildFullPlaylist(raw: any): Promise<Playlist> {
  const tracks = await hydrateTracks(raw.tracks ?? []);
  return mapPlaylist(raw, tracks);
}

export function getPlaylistById(id: number): Promise<Playlist | null> {
  return cached(`playlist:${id}`, 10 * MIN, async () => {
    const raw = await scGet<any>(`/playlists/${id}`);
    if (!raw || raw.kind !== "playlist") return null;
    return buildFullPlaylist(raw);
  });
}

export function getPlaylistBySlug(user: string, slug: string): Promise<Playlist | null> {
  return cached(`set:${user.toLowerCase()}/${slug.toLowerCase()}`, 10 * MIN, async () => {
    const raw = await scGet<any>("/resolve", {
      url: `https://soundcloud.com/${encodeURIComponent(user)}/sets/${encodeURIComponent(slug)}`,
    });
    if (!raw || raw.kind !== "playlist") return null;
    return buildFullPlaylist(raw);
  });
}

function rank(t: any): number {
  const proto = t.format?.protocol;
  const mime: string = t.format?.mime_type ?? "";
  const preset: string = t.preset ?? "";
  if (t.snipped) return 99;
  if (proto === "progressive" && mime.includes("mpeg")) return 0;
  if (proto === "hls" && preset === "aac_160k") return 1;
  if (proto === "hls" && preset.startsWith("mp3")) return 2;
  if (proto === "hls" && preset === "aac_96k") return 3;
  if (proto === "hls" && mime.includes("mpegurl")) return 4;
  if (proto === "progressive") return 5;
  return 50; // opus and friends: not playable everywhere
}

/**
 * Resolves a short-lived, signed media URL for a track. The audio itself is streamed
 * by the browser straight from SoundCloud's CDN, so nothing is stored on this server.
 * Only the signed URL is cached (in memory) so repeat plays are instant.
 */
export function getStream(trackId: number): Promise<StreamInfo | null> {
  return cached(`stream:${trackId}`, 25 * MIN, async () => {
    const track = await scGet<any>(`/tracks/${trackId}`);
    if (!track) return null;

    const transcodings: any[] = [...(track.media?.transcodings ?? [])].sort((a, b) => rank(a) - rank(b));
    for (const t of transcodings.slice(0, 3)) {
      if (rank(t) >= 50) break;
      const res = await scGet<{ url?: string }>(t.url, { track_authorization: track.track_authorization });
      if (res?.url) {
        return { url: res.url, type: t.format.protocol === "hls" ? "hls" : "progressive" } as StreamInfo;
      }
    }
    return null;
  });
}
