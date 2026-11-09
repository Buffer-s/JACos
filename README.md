<h1 align="center">JACo's Soundcloud</h1>
<p align="center"><strong>Just Another Copy of Sweden's Soundcloud</strong></p>
<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-ff5500.svg"></a>
  <img alt="Made by Buffer" src="https://img.shields.io/badge/made%20by-Buffer-333333.svg">
  <img alt="Version" src="https://img.shields.io/badge/version-0.0.3-ff5500.svg">
</p>

JACo's Soundcloud (**JACos**) is an open-source, account-free SoundCloud web client.
Paste a public SoundCloud profile or playlist URL and JACos lists everything the user published — then plays it, directly in your browser.

## Features (v0.0.3)

- **URL-first.** Paste `soundcloud.com/<user>`, a `/sets/<playlist>` link, an `snd.sc` short link, or a bare `@handle`. JACos resolves it and takes you there.
- **Playlist listing.** Every public playlist of the user, in a faithful SoundCloud-style grid — tracks count, likes, last-updated.
- **Playlists & tracks.** Full tracklist with deterministic waveforms, likes, play counts, duration and the classic orange play/pause states.
- **Real playback.** Streams from SoundCloud's own CDN (progressive MP3 preferred, HLS via hls.js as fallback).
- **Browser-native caching.** The first play stores the MP3 once in your browser's **Cache Storage** (LRU, capped at 40 tracks / 256 MB). Replays come from cache.
- **Media Session + keyboard.** Lock-screen controls, <kbd>Space</kbd> play/pause, <kbd>←</kbd>/<kbd>→</kbd> seek, <kbd>↑</kbd>/<kbd>↓</kbd> volume, <kbd>L</kbd> like.
- **Automatic route failover.** If direct SoundCloud requests are blocked, JACos walks the route chain (direct → public CORS proxies) and remembers the one that works.
- **Open source.** MIT-licensed. Made by Buffer.

## Quick start

Requires Node.js ≥ 18.17 and npm.

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build      # outputs dist/
npm run preview    # serves dist/ on http://localhost:4173
```

Other scripts: `npm run typecheck` (tsc), `npm run build` (vite), `npm run preview`.

## Using the app

**Link-style URLs.** `https://jac-os.pages.dev/<user>` (and even `/<user>/sets/<name>`) work directly — the path is resolved against SoundCloud and you land on the matching profile or playlist. Implemented with a `_redirects` SPA fallback plus a one-time boot-time resolver.


1. Open the site.
2. Paste a profile URL — e.g. `soundcloud.com/bfrend` — into the search bar or the hero field and hit **Find playlists**.
3. You land on the profile: avatar, bio, stats, and tabs for **Playlists** and **Tracks**.
4. Click a playlist card to open it, then press play (on the artwork, on the row, or the orange button in the player bar).

## How it works

SoundCloud shut its public developer program years ago, so JACos uses the same unofficial
`api-v2.soundcloud.com` endpoints that soundcloud.com's own web player uses, always from the browser:

| What                | Endpoint                                                        |
| ------------------- | --------------------------------------------------------------- |
| Resolve any URL     | `GET /resolve?url=<url>`                                        |
| List playlists      | `GET /users/{id}/playlists?linked_partitioning=1`                |
| List tracks         | `GET /users/{id}/tracks?linked_partitioning=1`                   |
| Load a playlist     | `GET /playlists/{id}` (track stubs hydrated via `GET /tracks?ids=…`) |
| Resolve a stream    | `GET /media/soundcloud:tracks:{id}/stream/{protocol}`            |

### The client_id question

Every `api-v2` call carries a `client_id`. It belongs to the web app, not to you or to JACos,
and it rotates periodically. JACos resolves it like this, in order:

1. **Your custom client_id** (Settings → SoundCloud connection) — beats everything.
2. **Cached detection** (24 h TTL, in localStorage).
3. **Live detection** — JACos fetches soundcloud.com's HTML, finds the `a-v2.sndcdn.com` JS bundles, and extracts the client_id from them (same trick every open-source client uses).
4. **Community fallback ids** — tried only if detection fails; they are usually stale.
5. **Manual entry** — if all else fails, the UI asks you to paste a client_id from your own DevTools session (steps are in Settings).

**Verification.** Every detected id — cached, scraped, or community — is probed against the API (`/resolve` on a known-good profile) *before* being used, so a stale id never reaches your requests. If a cached id stops verifying, it's discarded and re-detected. Only your own custom id is used unverified.

A stale id that somehow slips through yields a `401`; JACos detects that, drops the cached id and re-detects once transparently.

### Routing & CORS (automatic)

SoundCloud frequently refuses direct browser requests, so **every** request walks a route chain:

1. **Your custom CORS proxy**, if you set one in Settings (tried first).
2. **The route that worked last time**, remembered in localStorage (`jacos:api_route`).
3. **Direct** connection to `api-v2.soundcloud.com`.
4. **Public CORS proxies**, in order: `corsproxy.io` → `api.cors.lol` → `api.allorigins.win`.

Each candidate is validated before its response is accepted (JSON sniffing for the API, content
markers for the homepage scrape), so proxy error pages fall through to the next route instead of
surfacing as bogus failures. The route that answers first is **remembered** and tried first from
then on — that's the "remembers the one that works for you" bit. If it stops working, JACos skips
to the next route automatically and remembers the new winner. **Settings → SoundCloud connection**
shows the current route, can forget the remembered one, and can run a connection test.

### Caching, not downloading

Progressive MP3 transcodings are fetched once and stored with the **Cache API** under the
`jacos-audio-v1` cache. An LRU eviction keeps at most 40 tracks or 256 MB. There is no
filesystem download, no export folder, no IndexedDB audio blobs. HLS-only tracks are streamed
with [hls.js](https://github.com/video-dev/hls.js) and are not cached.

Check **Settings → Audio cache** to see the current usage or clear it. If a fetch fails
(CORS, offline, quota), JACos silently falls back to streaming the CDN URL directly — playback
always wins over caching.

## Configuration

Everything lives in **Settings** (gear icon in the top bar) or localStorage under the `jacos:` prefix:

| Setting                    | Storage key            | Default       |
| -------------------------- | ---------------------- | ------------- |
| Custom client_id           | `jacos:client_id_override` | auto-detect  |
| Custom CORS proxy (advanced) | `jacos:api_proxy`    | *(none)*      |
| Remembered route           | `jacos:api_route`          | *(auto)*      |
| Liked tracks (local only)  | `jacos:liked`          | `[]`          |
| Volume / mute              | `jacos:volume`, `jacos:muted` | `0.8` / off |
| Shuffle / repeat           | `jacos:shuffle`, `jacos:repeat` | off / off  |
| Recently viewed profiles   | `jacos:recent`         | `[]`          |

## Deploying

`dist/` is fully static — drop it on any static host (GitHub Pages, Netlify, Cloudflare Pages,
a plain nginx). The build uses relative asset paths, so hosting under a sub-path works too.

## Versioning & releases

JACos uses a simple rolling scheme:

- Every update gets **its own PR** titled with its version (e.g. `v0.0.2`) and merges into `main`.
- Each update bumps the version by **0.0.1** (`0.0.1` → `0.0.2` → …).
- When a bump would reach `0.0.10`, it rolls to the next minor instead: `0.0.8` → `0.0.9` → **`0.1.0`**. No `0.0.10` exists.
- The canonical version lives in `package.json` (single source of truth), is shown in the app footer and Settings → About, and the README badge matches it. Keep all three in sync in release PRs.

## Legal

JACos is a client, not a host. Audio streams from SoundCloud's CDN and remains the property of
its respective owners and uploaders. JACo's Soundcloud is not affiliated with, endorsed by, or
connected to SoundCloud AB in any way. "SoundCloud" is a trademark of SoundCloud Limited.
If you are a rights holder and something here concerns you, please open an issue.

## Development

```
src/
  lib/         SoundCloud api-v2 client, Cache-Storage audio cache, query parsing, waveform, utils
  state/       PlayerContext (queue, playback, Media Session, keyboard shortcuts)
  components/  TopNav, PlayerBar, track rows, playlist cards, waveform, settings modal, toasts
  pages/       Home, UserPage, PlaylistPage, NotFound
scripts/gen-og.mjs   generates public/og.png via @resvg/resvg-js
```

Design language: Interstate → Inter, `#ff5500` primary, hairline borders, radii of 3–6 px.
Please keep new UI faithful to the SoundCloud design language it's copying.

## Contributing

PRs are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Be kind, keep it building, keep it orange.

## License

[MIT](LICENSE) © 2026 Buffer. Made by Buffer.
