<p align="center">
  <img src="public/og.png" alt="JACo's Soundcloud — Just Another Copy of Sweden's Soundcloud" width="720" />
</p>

<h1 align="center">JACo's Soundcloud</h1>
<p align="center"><strong>Just Another Copy of Sweden's Soundcloud</strong></p>
<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-ff5500.svg"></a>
  <img alt="Made by Buffer" src="https://img.shields.io/badge/made%20by-Buffer-333333.svg">
  <img alt="Version" src="https://img.shields.io/badge/version-0.0.1-ff5500.svg">
</p>

JACo's Soundcloud (**JACos**) is an open-source, account-free SoundCloud web client.
Paste a public SoundCloud profile or playlist URL and JACos lists everything the user published — then plays it, directly in your browser.

No account. No sign-in. No files written to disk.

## Features (v0.0.1)

- **URL-first.** Paste `soundcloud.com/<user>`, a `/sets/<playlist>` link, an `snd.sc` short link, or a bare `@handle`. JACos resolves it and takes you there.
- **Playlist listing.** Every public playlist of the user, in a faithful SoundCloud-style grid — tracks count, likes, last-updated.
- **Playlists & tracks.** Full tracklist with deterministic waveforms, likes, play counts, duration and the classic orange play/pause states.
- **Real playback.** Streams from SoundCloud's own CDN (progressive MP3 preferred, HLS via hls.js as fallback).
- **Browser-native caching.** The first play stores the MP3 once in your browser's **Cache Storage** (LRU, capped at 40 tracks / 256 MB). Replays come from cache. **Nothing is ever written to disk.**
- **Media Session + keyboard.** Lock-screen controls, <kbd>Space</kbd> play/pause, <kbd>←</kbd>/<kbd>→</kbd> seek, <kbd>↑</kbd>/<kbd>↓</kbd> volume, <kbd>L</kbd> like.
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

A stale id yields a `401`; JACos detects that, drops the cached id and re-detects once transparently.
If your network blocks direct requests to SoundCloud entirely, set a **CORS proxy base** in
Settings (requests are sent as `PROXY?url=<encoded URL>`).

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
| API proxy base (advanced)  | `jacos:api_proxy`      | *(none)*      |
| Liked tracks (local only)  | `jacos:liked`          | `[]`          |
| Volume / mute              | `jacos:volume`, `jacos:muted` | `0.8` / off |
| Shuffle / repeat           | `jacos:shuffle`, `jacos:repeat` | off / off  |
| Recently viewed profiles   | `jacos:recent`         | `[]`          |

## Deploying

`dist/` is fully static — drop it on any static host (GitHub Pages, Netlify, Cloudflare Pages,
a plain nginx). The build uses relative asset paths, so hosting under a sub-path works too.

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
