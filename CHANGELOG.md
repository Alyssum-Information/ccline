# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-04

### Added

- Initial release.
- Core segments: model, project path, context-window budget bar (with %), plus
  5-hour and 7-day rate-limit indicators, ordered nearest-term to farthest.
- Color-tiered bars (green → yellow → red at 60% / 85%).
- Optional add-on segments: ⛏ caveman and ↓ rtk token-savings.
- Config overrides via `~/.claude/ccline.config.json` or `$CCLINE_CONFIG`
  (colors, bar widths, path length, per-segment toggles).
- Cross-platform installers: `install.sh` and `install.ps1`.
- Screenshot/demo generator: `tools/demo.js`.

[1.0.0]: https://github.com/Alyssum-Information/ccline/releases/tag/v1.0.0
