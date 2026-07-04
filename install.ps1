# ccline installer (Windows / PowerShell)
# Copies statusline.js into your Claude config dir and wires up settings.json.
# Usage:  powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = 'Stop'

$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }
if (-not (Test-Path $claudeDir)) { New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null }

$src  = Join-Path $PSScriptRoot 'statusline.js'
$dest = Join-Path $claudeDir 'ccline.js'
Copy-Item $src $dest -Force
Write-Host "Installed statusline -> $dest"

# Locate node.exe.
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "node not found on PATH. Install Node.js first (https://nodejs.org)." }

# Merge the statusLine block into settings.json (preserving other keys).
$settingsPath = Join-Path $claudeDir 'settings.json'
if (Test-Path $settingsPath) {
  $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
} else {
  $settings = [PSCustomObject]@{}
}
$cmd = '"{0}" "{1}"' -f $node, $dest
$statusLine = [PSCustomObject]@{ type = 'command'; command = $cmd }
$settings | Add-Member -NotePropertyName statusLine -NotePropertyValue $statusLine -Force
$settings | ConvertTo-Json -Depth 20 | Set-Content $settingsPath -Encoding utf8
Write-Host "Wired statusLine into $settingsPath"
Write-Host "Done. Restart Claude Code to see it."
