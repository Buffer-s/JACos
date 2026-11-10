# JACo's Soundcloud

**Just Another Copy of Sweden's Soundcloud** — paste a public SoundCloud profile or playlist URL and stream what they publish, straight from SoundCloud's own CDN.

[![version](https://img.shields.io/badge/version-0.1.3-ff5500.svg)](package.json)
[![license](https://img.shields.io/badge/license-MIT-ff5500.svg)](LICENSE)

Open source (MIT), made by **Buffer**. Not affiliated with SoundCloud AB — all audio belongs to its uploaders.

## Features

- **Basically SoundCloud, open source** — search the entire catalog, paste a profile (`soundcloud.com/bfrend`), a playlist (`soundcloud.com/bfrend/sets/mix`), a full URL, or a bare `@handle`. Link-style URLs work on the hosted site too (`jac-os.pages.dev/bfrend`). Plain-word searches always open results — never someone's profile.
- **Search like SoundCloud** — the top search box finds **tracks**, **playlists** and **people** across all of SoundCloud, with SoundCloud-style result sections and pagination.
- **Likes & playlists — private or public** — like any track and it lands in **Likes**; create unlimited **local playlists** with the ＋ button on any row or in the player. Private playlists stay in this browser only — nothing is uploaded or synced. Make any playlist **public** and it gets a shareable link (`jac-os.pages.dev/<your-slug>`) that anyone can open — no account needed; the link follows your edits and can be made private again any time.
- **Fork any playlist** — one tap copies any SoundCloud, public or local playlist into your own private copy, ready to trim, extend and rename.
- **Full player** — play, shuffle, repeat, seek (drag the bar — audio only jumps when you release), like, volume (defaults to 50%), keyboard shortcuts (Space / arrows / L), and lock-screen controls via the Media Session API. A right-hand library column (likes + playlists) fills the empty space on wide screens.
- **Dark & light themes** — perfect dark mode, a light theme faithful to SoundCloud, or follow your system. Toggle in the top bar or Settings → Appearance.
- **SoundCloud's actual catalog and rules** — unavailable or uploader-blocked tracks are simply not playable; everything public that SoundCloud allows streams here.
- **Zero-config connection** — on Cloudflare Pages a tiny built-in **Pages Function** (`functions/api/sc`) talks to SoundCloud server-side and handles the web player's `client_id` handshake automatically. Nothing to paste, nothing to sign up for.
- **Static-host fallback** — if the build is hosted somewhere without Functions, JACos falls back to a browser route chain with an auto-detected, verified `client_id` (and remembers the route that works). A custom `client_id` and CORS proxy can be set in Settings as an escape hatch. Stuck connection? Settings → **Reset connection** clears the remembered state.
- **Tracklist parity** — plays, duration, likes and waveform-style seeks, just like the real thing. Because it is a copy of the real thing.

> Note on playback: tracks stream straight from SoundCloud's CDN (`<audio>` for progressive MP3s, hls.js for HLS) — JACo's keeps nothing on disk and nothing on its servers. Tracks that are region-locked or uploader-disabled on SoundCloud can't play here either; uploader-blocked or HLS-only files occasionally fail to start, same as on any non-SoundCloud client.

## How it works

```
┌────────────┐   same-origin    ┌──────────────────────┐   server-side    ┌──────────────┐
│  Browser    │  /api/sc?path=  │  Pages Function      │  api-v2 with a   │  SoundCloud  │
│  (React SPA)│ ──────────────► │  functions/api/sc    │ ───────────────► │  api-v2      │
│             │ ◄────────────── │  (scrape client_id,  │ ◄─────────────── │              │
└────────────┘   JSON           │   cache, retry 401)  │   JSON           └──────────────┘
      │                          └──────────────────────┘
      │  audio: <audio>/hls.js direct from SoundCloud's CDN (signed URL)
      ▼
  soundcloud CDN
```

- The SPA is a static Vite + React build. Audio goes straight from SoundCloud's CDN to the browser; JACo's stores nothing server-side, ever.
- Public playlists are the one place JACo's keeps data: a Supabase table of slug → track-ID snapshots, written anonymously (insert-only for everyone; updates/deletes require the creator's per-playlist editor key). No accounts, no analytics.
- `functions/api/sc` is a generic, server-side bridge to `https://api-v2.soundcloud.com`. It scrapes the same `client_id` the web player uses (or `SOUNDCLOUD_CLIENT_ID` if set), caches it in memory, retries once on 401, and negative-caches upstream failures briefly.
- Stream URLs are short-lived, signed CDN URLs. The browser streams (progressive or HLS via hls.js) straight from SoundCloud.
- Nothing is written to disk — not on the server, not in the browser. Audio is streamed, never stored.

## Develop

```bash
npm ci
npm run dev        # vite dev server
npm run build      # → dist/
npm run preview    # preview the production build
npm run typecheck
```

To emulate the Pages Function locally:

```bash
npm run build
npx wrangler pages dev dist
```

(The bridge needs outbound network access to soundcloud.com; you can also set `SOUNDCLOUD_CLIENT_ID` to skip scraping.)

## Deploy (Cloudflare Pages)

1. Fork this repo.
2. Create a Pages project connected to the fork (or push to your own).
3. Build command `npm run build`, output directory `dist`. `public/_redirects` ships the SPA fallback; `functions/` is picked up automatically as a Pages Function — that's the whole setup.
4. Optional: set the `SOUNDCLOUD_CLIENT_ID` environment variable to pin a client_id instead of scraping.

## Routes

Hash routes: `#/`, `#/user/<permalink>`, `#/playlist/<id>`, `#/search/<query>`, `#/likes`, `#/playlists`, `#/playlists/<id>`. On the Pages site, link-style URLs like `/bfrend` or `/bfrend/sets/<set>` are rewritten to the right page at boot.

## Settings

Gear icon → Settings: audio cache stats and clearing, and the SoundCloud connection (source of the `client_id`, remembered route, test connection, optional custom `client_id` / CORS proxy for non-Pages hosting).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please keep the UI faithful to SoundCloud — JACos is a loving copy, not a reimagining.

## License

[MIT](LICENSE). Made by **Buffer**.
