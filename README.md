# ccline

> A richer status line for [Claude Code](https://claude.ai/code) — model, project path, rate-limit burn-down, and a live context-window budget bar, all in one line.

[![CI](https://github.com/Alyssum-Information/ccline/actions/workflows/ci.yml/badge.svg)](https://github.com/Alyssum-Information/ccline/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A514-brightgreen.svg)](https://nodejs.org)
[![Dependencies: none](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

![ccline status line](screenshots/demo.png)

Segments run nearest-term to farthest: **this conversation → 5-hour window → 7-day window.**

## Features

- **Zero dependencies, single file.** Just Node.js and `statusline.js`.
- **Context budget at a glance** — tokens used vs. the window limit, with a color-tiered bar and percentage.
- **Rate-limit burn-down** — time until the 5-hour window resets, plus 5-hour and 7-day usage.
- **Color-tiered** — every bar goes green → yellow → red as it fills (60% / 85% thresholds).
- **Fully themeable** — colors, bar widths, and path length via a small JSON config; no rebuild.
- **Optional add-ons** — [caveman](https://github.com/juliusbrussee/caveman) and `rtk` token-savings segments light up only if you have those tools, and cost nothing if you don't.
- **Fast** — per-session caches keep each render cheap; heavy work is memoized.

## What each segment means

| Segment | Example | Meaning |
|---|---|---|
| ◆ model | `◆ Opus 4.8` | Active model display name |
| path | `dewiz/sub/dir` | Current dir, relative to project root (truncated past `pathMaxLen`) |
| ⬢ context | `⬢ 84k/200k ▓▓▓▓▓░░░ 42%` | This conversation's context tokens vs the window limit, with % |
| ⏳ 5-hour | `⏳ 3h20m ▓▓░░░ 42%` | Time until the 5-hour rate window resets, burn bar, and % used |
| 📅 7-day | `📅 18%` | 7-day rate window used |
| ⛏ caveman *(opt)* | `⛏12k` | Tokens saved this session by the [caveman](https://github.com/juliusbrussee/caveman) plugin (pink) |
| ↓ rtk *(opt)* | `↓8k` | Tokens saved this session by the `rtk` CLI (cyan) |

All token figures are for **this conversation / this session** — no lifetime totals. The ⛏ and ↓ segments extend the context bar *beyond* the real limit, visualizing how much longer the bar would be without those savings.

## Requirements

- [Node.js](https://nodejs.org) **≥ 14** on your `PATH`.
- A terminal with **256-color** support and a font that renders emoji + geometric glyphs (◆ ⏳ 📅 ⬢ ⛏ ↓ and the `▓ ░` block characters). Most modern terminals and Nerd Fonts qualify.

## Install

Clone, then run the installer for your OS — it copies the script into your Claude config dir and merges the `statusLine` block into `settings.json` (existing keys preserved):

```bash
git clone https://github.com/Alyssum-Information/ccline.git
cd ccline

# macOS / Linux
bash install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File install.ps1
```

Restart Claude Code to see the new status line.

### Manual install

Copy `statusline.js` anywhere, then add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/statusline.js"
  }
}
```

On Windows, use the full paths to `node.exe` and the script:

```json
{
  "statusLine": {
    "type": "command",
    "command": "\"C:\\Program Files\\nodejs\\node.exe\" \"C:\\Users\\you\\.claude\\ccline.js\""
  }
}
```

## Configure

Everything works with zero config. To customize, drop a JSON file at `~/.claude/ccline.config.json` (or point `$CCLINE_CONFIG` at any path). Every key is optional — you only specify what you want to change. See [`examples/ccline.config.json`](examples/ccline.config.json).

| Key | Default | Purpose |
|---|---|---|
| `contextBarWidth` | `12` | Width of the ⬢ context bar |
| `rateBarWidth` | `5` | Width of the ⏳ 5-hour bar |
| `pathMaxLen` | `48` | Truncate the project path past this many chars |
| `colors` | *(256-color xterm indices)* | Per-element color (`accent`, `text`, `dim`, `faint`, `green`, `yellow`, `red`, `caveman`, `rtk`) |
| `segments.caveman` | `"auto"` | `auto` / `on` / `off` for the ⛏ segment |
| `segments.rtk` | `"auto"` | `auto` / `on` / `off` for the ↓ segment |

`auto` shows a segment only if its tool is detected (and skips cleanly, at zero cost, if not). `off` never runs the tool.

### Optional add-ons

- **⛏ caveman** — if you use the [caveman](https://github.com/juliusbrussee/caveman) plugin, ccline reads its `.caveman-active` flag and estimates tokens saved from your transcript. Tune `caveman.flagFile` and `caveman.ratios` in config.
- **↓ rtk** — if you use the `rtk` CLI, ccline calls `rtk gain --format json` and shows this session's delta. Tune `rtk.command` / `rtk.args` / `rtk.totalPath` in config.

If you don't have these tools, leave the defaults — the segments simply never appear.

## How it works

Claude Code pipes a JSON blob to the status-line command on stdin (model, workspace, `context_window`, `rate_limits`, `transcript_path`, …). `statusline.js` reads it, formats the segments with ANSI 256-color codes, and writes one line to stdout. Small per-session cache files in the temp dir keep it fast (the transcript parse is memoized by file size; `rtk gain` is snapshotted per session).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Glyphs show as boxes (□ / tofu) | Use a font with emoji + symbol coverage (e.g. a [Nerd Font](https://www.nerdfonts.com/)). |
| No colors, just text | Your terminal isn't in 256-color mode. Enable it or set `TERM=xterm-256color`. |
| Status line is blank | Confirm `node` is on `PATH`, and that the `command` in `settings.json` points at the installed script. |
| Nothing after a fresh start | The rate-limit numbers appear after the first API response; ccline shows the last-seen values (dimmed) until then. |
| `rtk` segment adds lag | You don't have `rtk` — set `"segments": { "rtk": "off" }` in your config so it's never invoked. |

## Uninstall

Remove the `statusLine` block from `~/.claude/settings.json`, then delete the installed script (`~/.claude/ccline.js`) and, if present, `~/.claude/ccline.config.json`.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Keep it dependency-free and single-file.

## License

[MIT](LICENSE) © 2026 Alyssum
