# Contributing to JACo's Soundcloud

Thanks for helping make the world's most obvious SoundCloud copy slightly less obvious.

## Getting going

```bash
npm install
npm run dev
```

Check your work before opening a PR:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # vite build
```

CI runs both on every PR against Node 20 and 22.

## Ground rules

- **SoundCloud's design language is the spec.** `#ff5500` orange, Inter (stand-in for Interstate),
  hairline `#e5e5e5` borders, 3–6 px radii. No green accent dots, no purple gradients, no glassmorphism.
- **No fake data.** If a number or artwork is missing, render the fallback, not an invented value.
- **Playback always wins over caching.** Cache failures must degrade to plain streaming, never to silence.
- **Keep it account-free.** Features requiring a SoundCloud login don't belong in core.
- **Don't add green.** Seriously.

## Reporting bugs

Open an issue at https://github.com/bufferclick/JACos/issues with:

- what you pasted (URL shape, not necessarily the full private link),
- what happened vs. what you expected,
- browser + console output if playback was involved.

## Versioning & release PRs

- Every update ships as its own PR titled with its version (e.g. `v0.1.4`).
- Bump the version by **0.0.1** per update: `0.1.4` → `0.1.5`. When a patch bump would reach `0.1.10`, roll to the
  next minor instead (`0.1.9` → `0.2.0`).
- Keep `package.json`, `package-lock.json`, the README version badge, the `index.html` generator meta tag and the
  in-app footer (which reads `package.json`) in sync in the same PR.
- Add a matching entry under **Changelog** in the README.

## Pull requests

1. Fork and branch from `main`.
2. Keep PRs focused — one feature or fix per PR.
3. Fill in the PR template and link any related issue.
