# Contributing to ccline

Thanks for your interest! ccline is intentionally small — a single,
dependency-free Node.js file — and the goal is to keep it that way.

## Ground rules

- **No runtime dependencies.** Everything lives in `statusline.js` using only
  Node's standard library.
- **Single file.** New behavior goes into `statusline.js`, gated behind config
  where it's optional.
- **Config over forks.** Prefer a `ccline.config.json` knob to a hardcoded
  choice, so users can tune without editing the script.

## Development

```bash
node --check statusline.js   # syntax lint (this is `npm test`)
```

## Pull requests

- Match the existing style (2-space indent, semicolons, `'use strict'`).
- Update `README.md` and `CHANGELOG.md` when behavior changes.
- If you touch the installers, verify on **both** a POSIX shell and PowerShell.
- Keep it fast: the status line runs on every render, so avoid new blocking work
  on the hot path (cache anything expensive, as the existing segments do).

## Reporting bugs

Open an issue with your **OS**, **Node version**, **terminal**, and — for visual
glitches — a screenshot. A copy of the JSON Claude Code pipes in (if you can
capture it) helps a lot.
