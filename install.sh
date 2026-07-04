#!/usr/bin/env bash
# ccline installer (macOS / Linux)
# Copies statusline.js into your Claude config dir and wires up settings.json.
# Usage:  bash install.sh
set -euo pipefail

claude_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
mkdir -p "$claude_dir"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="$claude_dir/ccline.js"
cp "$script_dir/statusline.js" "$dest"
echo "Installed statusline -> $dest"

if ! command -v node >/dev/null 2>&1; then
  echo "node not found on PATH. Install Node.js first (https://nodejs.org)." >&2
  exit 1
fi
node_bin="$(command -v node)"

# Merge the statusLine block into settings.json with node (no jq needed).
settings="$claude_dir/settings.json"
CCLINE_NODE="$node_bin" CCLINE_DEST="$dest" CCLINE_SETTINGS="$settings" node <<'JS'
const fs = require('fs');
const p = process.env.CCLINE_SETTINGS;
let s = {};
try { s = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
s.statusLine = { type: 'command', command: `"${process.env.CCLINE_NODE}" "${process.env.CCLINE_DEST}"` };
fs.writeFileSync(p, JSON.stringify(s, null, 2));
JS
echo "Wired statusLine into $settings"
echo "Done. Restart Claude Code to see it."
