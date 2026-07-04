#!/usr/bin/env node
// ccline — a richer status line for Claude Code.
// Layout: ◆ <model> │ <project path> │ ⬢ <used>/<max> [⛏caveman ↓rtk] <bar> <ctx%> │ ⏳<5h-reset> <bar> <5h%> │ 📅<7d>%
// Order is nearest-term to farthest: this conversation → 5h window → 7d window.
// All token figures are THIS conversation (context) / THIS session (savings) — no lifetime totals.
// Input: statusLine JSON on stdin (model, workspace, session_id, transcript_path, context_window, rate_limits).
//
// Zero-config: the four core segments (model / path / rate-limit / context) always render.
// The ⛏caveman and ↓rtk segments are OPTIONAL add-ons — they light up only if you have those
// tools installed, and cost nothing (auto-skip) if you don't. Override any default by dropping a
// JSON file at ~/.claude/ccline.config.json (or set $CCLINE_CONFIG to a path). See examples/.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// ── Configuration ─────────────────────────────────────────────────────────
// Defaults below are overlaid (shallow, per top-level key) by an optional user
// config file, so a partial override only touches the keys it names.
const DEFAULTS = {
  // 256-color xterm indices. Tweak to taste.
  colors: {
    accent: 141,   // model diamond (muted violet)
    text: 252,     // primary text
    dim: 245,      // labels, reset time
    faint: 238,    // separators, empty bar
    green: 114,
    yellow: 214,
    red: 196,
    caveman: 205,  // pink — distinct from the green/yellow/red usage tiers
    rtk: 45,       // cyan — distinct from the usage tiers and the caveman pink
  },
  contextBarWidth: 12,   // width of the ⬢ context bar
  rateBarWidth: 5,       // width of the ⏳ 5-hour bar
  pathMaxLen: 48,        // truncate the project path past this many chars
  segments: {
    // 'auto' = show if the tool is detected, else silently skip.
    // 'off'  = never show (and never spawn the tool). 'on' = force-attempt.
    caveman: 'auto',
    rtk: 'auto',
  },
  // ⛏ caveman: token savings from the caveman plugin (github.com/…/caveman).
  caveman: {
    // Path to the plugin's active-mode flag file. {claude} expands to the
    // Claude config dir ($CLAUDE_CONFIG_DIR or ~/.claude).
    flagFile: '{claude}/.caveman-active',
    // Compression ratio per mode — savings = output / (1 - ratio) - output.
    ratios: { full: 0.65 },
  },
  // ↓ rtk: token savings from the rtk CLI (Rust Token Killer).
  rtk: {
    command: 'rtk',
    args: ['gain', '--format', 'json'],
    // dotted path into the JSON output holding the lifetime cumulative saving.
    totalPath: 'summary.total_saved',
  },
};

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

function loadConfig() {
  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  const file = process.env.CCLINE_CONFIG || path.join(CLAUDE_DIR, 'ccline.config.json');
  try {
    const user = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const k of Object.keys(user)) {
      if (user[k] && typeof user[k] === 'object' && !Array.isArray(user[k])) {
        cfg[k] = Object.assign({}, cfg[k], user[k]);
      } else {
        cfg[k] = user[k];
      }
    }
  } catch {}
  return cfg;
}

const CONFIG = loadConfig();
const COL = CONFIG.colors;

// Answer --version / --help before touching stdin (reading fd 0 would block).
const VERSION = '1.0.0';
if (process.argv.includes('-v') || process.argv.includes('--version')) {
  process.stdout.write(`ccline ${VERSION}\n`);
  process.exit(0);
}
if (process.argv.includes('-h') || process.argv.includes('--help')) {
  process.stdout.write(
    `ccline ${VERSION} — a richer status line for Claude Code\n\n` +
    `Claude Code pipes status-line JSON on stdin; ccline prints one formatted line.\n` +
    `Configure via ~/.claude/ccline.config.json (or $CCLINE_CONFIG).\n` +
    `Docs: https://github.com/Alyssum-Information/ccline\n`
  );
  process.exit(0);
}

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^﻿/, '')); } catch {}

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const fg = n => `${ESC}38;5;${n}m`;

const SEP = ` ${fg(COL.faint)}│${RESET} `;
const tierColor = p => (p < 60 ? COL.green : p <= 85 ? COL.yellow : COL.red);
const humTok = n => {
  n = Math.round(n);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n);
};
const dig = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const TMP = os.tmpdir();

// Read a small cache file if fresh (<ttlMs); returns parsed JSON or null.
function readCache(file, ttlMs) {
  try {
    const st = fs.statSync(file);
    if (ttlMs == null || Date.now() - st.mtimeMs < ttlMs) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch {}
  return null;
}
function writeCache(file, obj) {
  try { fs.writeFileSync(file, JSON.stringify(obj)); } catch {}
}

const segs = [];

// ── Model ────────────────────────────────────────────────────────────────
if (data.model && data.model.display_name) {
  segs.push(`${fg(COL.accent)}◆${RESET} ${BOLD}${fg(COL.text)}${data.model.display_name}${RESET}`);
}

// ── Path relative to project root ────────────────────────────────────────
{
  const ws = data.workspace || {};
  const cur = ws.current_dir || data.cwd || '';
  const proj = ws.project_dir || cur;
  if (cur) {
    const projName = path.basename(proj) || proj;
    const rel = path.relative(proj, cur).replace(/\\/g, '/');
    let disp;
    if (!rel) disp = projName;
    else if (rel.startsWith('..')) disp = cur.replace(/\\/g, '/');
    else disp = `${projName}/${rel}`;
    const max = CONFIG.pathMaxLen;
    if (disp.length > max) disp = '…' + disp.slice(-(max - 1));
    segs.push(`${fg(COL.dim)}${disp}${RESET}`);
  }
}

// Rate-limit segments are collected into rateSegs here but emitted AFTER the
// context panel below, so display order is context → 5h → 7d — nearest-term
// (this conversation) to farthest (the weekly window).
const rateSegs = [];
// ── Rate limits (5h reset-time + short bar, 7d calendar) ──────────────────
// stdin carries rate_limits only after the first API response. Cache the last
// seen value; when absent (session start) render the cache dimmed so limits
// still show immediately instead of a blank until turn 1.
{
  const cacheFile = path.join(TMP, 'ccline-ratelimits.json');
  let rl = data.rate_limits;
  let stale = false;
  if (rl && (rl.five_hour || rl.seven_day)) {
    writeCache(cacheFile, rl);
  } else {
    const c = readCache(cacheFile, null);
    if (c) { rl = c; stale = true; }
  }
  rl = rl || {};

  const fh = rl.five_hour;
  if (fh && fh.used_percentage != null) {
    const p = Math.max(0, Math.min(100, Math.round(fh.used_percentage)));
    const col = stale ? COL.dim : tierColor(p);
    const width = CONFIG.rateBarWidth;
    const filled = Math.round((p / 100) * width);
    const bar = `${fg(col)}${'▓'.repeat(filled)}${fg(COL.faint)}${'░'.repeat(width - filled)}${RESET}`;
    let reset = '';
    if (fh.resets_at) {
      const secs = Math.max(0, fh.resets_at - Math.floor(Date.now() / 1000));
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      reset = h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`;
    }
    const pre = stale ? DIM : '';
    rateSegs.push(`${pre}${fg(COL.dim)}⏳ ${reset}${RESET} ${bar} ${fg(col)}${p}%${RESET}`);
  }
  const sd = rl.seven_day;
  if (sd && sd.used_percentage != null) {
    const p = Math.max(0, Math.min(100, Math.round(sd.used_percentage)));
    const col = stale ? COL.dim : tierColor(p);
    rateSegs.push(`${stale ? DIM : ''}${fg(COL.dim)}📅 ${RESET}${fg(col)}${p}%${RESET}`);
  }
}

// ── Merged token panel: context budget + this-session savings ────────────
{
  const panel = [];

  // Context window — this conversation's token usage vs limit.
  const cw = data.context_window || {};
  const used = cw.total_input_tokens != null ? cw.total_input_tokens
    : cw.used_tokens != null ? cw.used_tokens : null;
  const max = cw.context_window_size != null ? cw.context_window_size
    : cw.max_tokens != null ? cw.max_tokens : null;
  let pct = cw.used_percentage != null ? cw.used_percentage
    : (used != null && max) ? (used / max) * 100 : null;

  // ── Optional add-on: ⛏ caveman savings (THIS session) ──────────────────
  // Estimated from transcript output tokens. ⛏ presence itself signals the
  // caveman plugin is active (no separate mode label).
  let cavSaved = 0;
  if (CONFIG.segments.caveman !== 'off') {
    const cav = CONFIG.caveman;
    const RATIO = cav.ratios || {};
    let mode = null;
    try {
      const flag = cav.flagFile.replace('{claude}', CLAUDE_DIR);
      const st = fs.lstatSync(flag);
      if (st.isFile() && st.size <= 64) {
        mode = fs.readFileSync(flag, 'utf8').split(/\r?\n/)[0].trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      }
    } catch {}
    const ratio = mode && RATIO[mode] != null ? RATIO[mode] : null;
    const tp = data.transcript_path;
    if (ratio != null && tp) {
      // Cache parse by transcript size — only re-read when the file grows.
      const sid = data.session_id || path.basename(tp, '.jsonl');
      const cacheFile = path.join(TMP, `ccline-cvm-${sid}.json`);
      let out = 0;
      try {
        const size = fs.statSync(tp).size;
        const c = readCache(cacheFile, null);
        if (c && c.size === size) {
          out = c.out;
        } else {
          const raw = fs.readFileSync(tp, 'utf8');
          for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            let e; try { e = JSON.parse(line); } catch { continue; }
            if (e.type === 'assistant' && e.message && e.message.usage) {
              out += e.message.usage.output_tokens || 0;
            }
          }
          writeCache(cacheFile, { size, out });
        }
      } catch {}
      if (out > 0) cavSaved = Math.round(out / (1 - ratio)) - out;
    }
  }

  // ── Optional add-on: ↓ rtk savings (THIS session) ──────────────────────
  // `rtk gain` is lifetime-cumulative, so snapshot a baseline at first sighting
  // of this session_id and show the delta.
  let rtkSaved = 0;
  if (CONFIG.segments.rtk !== 'off') {
    try {
      const gainCache = path.join(TMP, 'ccline-rtk.json');
      let total = null;
      const c = readCache(gainCache, 60_000);
      if (c) total = c.total_saved;
      if (total == null) {
        const outp = execFileSync(CONFIG.rtk.command, CONFIG.rtk.args,
          { timeout: 1500, windowsHide: true, encoding: 'utf8' });
        total = dig(JSON.parse(outp), CONFIG.rtk.totalPath);
        writeCache(gainCache, { total_saved: total });
      }
      if (typeof total === 'number') {
        const sid = data.session_id || 'default';
        const baseFile = path.join(TMP, `ccline-rtk-base-${sid}.json`);
        let base = readCache(baseFile, null);
        if (!base || typeof base.base !== 'number' || base.base > total) {
          base = { base: total };
          writeCache(baseFile, base);
        }
        rtkSaved = Math.max(0, total - base.base);
      }
    } catch {}
  }

  // One merged segment: ⬢ used/max ⛏cav ↓rtk <stacked-bar>.
  // Bar scale = max + savings, so the ⛏/↓ segments extend the bar *beyond* the
  // real limit — visualizing "how much longer the bar would be without them".
  if (pct != null || used != null) {
    pct = pct != null ? Math.max(0, Math.min(100, Math.round(pct))) : 0;
    const tier = tierColor(pct);
    const nums = (used != null && max)
      ? ` ${fg(COL.text)}${humTok(used)}${fg(COL.dim)}/${humTok(max)}${RESET}`
      : ` ${BOLD}${fg(tier)}${pct}%${RESET}`;
    const cav = cavSaved > 0 ? ` ${fg(COL.caveman)}⛏${humTok(cavSaved)}${RESET}` : '';
    const rtk = rtkSaved > 0 ? ` ${fg(COL.rtk)}↓${humTok(rtkSaved)}${RESET}` : '';

    let bar = '';
    if (used != null && max) {
      const W = CONFIG.contextBarWidth;
      const total = max + cavSaved + rtkSaved;
      const cUsed = Math.round((used / total) * W);
      const cCav = Math.round((cavSaved / total) * W);
      const cRtk = Math.round((rtkSaved / total) * W);
      const cRem = Math.max(0, W - cUsed - cCav - cRtk); // remaining real budget
      bar = ' '
        + `${fg(tier)}${'▓'.repeat(cUsed)}`
        + `${fg(COL.faint)}${'░'.repeat(cRem)}`
        + `${fg(COL.caveman)}${'▓'.repeat(cCav)}`
        + `${fg(COL.rtk)}${'▓'.repeat(cRtk)}${RESET}`;
    }
    // Trailing % after the bar, but only when the bar (used/max) is shown —
    // the %-only fallback in `nums` already carries it.
    const pctStr = (used != null && max) ? ` ${fg(tier)}${pct}%${RESET}` : '';
    panel.push(`${fg(COL.dim)}⬢${RESET}${nums}${cav}${rtk}${bar}${pctStr}`);
  }

  if (panel.length) segs.push(panel.join(' '));
}

// Emit rate-limit segments last: context (nearest) → 5h → 7d (farthest).
for (const r of rateSegs) segs.push(r);

process.stdout.write(segs.join(SEP));
