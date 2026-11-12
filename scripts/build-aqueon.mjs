/**
 * build-aqueon.mjs — bundle the Aqueon app into this site at /aer-tool/aqueon/.
 *
 * Aqueon is a separate project (React + TypeScript, single-file Vite build);
 * its source is not changed. This script:
 *   1. type-checks and builds it into a temporary folder (so Aqueon's own
 *      git-tracked dist/ and Aqueon.html stay untouched),
 *   2. adds a slim "back to AER" bar to the built page,
 *   3. writes the result to public/aqueon/index.html, which Vite copies into
 *      every AER build (commit it — `npm run deploy` doesn't rebuild Aqueon).
 *
 * Run `npm run aqueon` after changing Aqueon. Aqueon's location defaults to
 * the sibling folder Program/Aqueon; override with AQUEON_DIR=/path/to/Aqueon.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aqDir = path.resolve(process.env.AQUEON_DIR || path.join(root, '..', '..', 'Aqueon'));
if (!fs.existsSync(path.join(aqDir, 'package.json'))) {
  console.error(`Aqueon project not found at ${aqDir} — set AQUEON_DIR to its folder.`);
  process.exit(1);
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqueon-build-'));
try {
  console.log(`Building Aqueon from ${aqDir} …`);
  execSync('npx tsc --noEmit', { cwd: aqDir, stdio: 'inherit' });
  execSync(`npx vite build --outDir "${outDir}" --emptyOutDir`, { cwd: aqDir, stdio: 'inherit' });

  let html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');

  /* Back bar — styled with Aqueon's own theme tokens so it follows its
     light/dark switch; hidden when printing (Aqueon prints Field log / COC
     documents). Aqueon's own beforeunload guard still warns about unsaved
     work when the link is clicked. */
  /* AER palette — Aqueon styles everything (charts included) through these
     tokens, so redefining them recolours the whole app without touching its
     source. Values come from AER's src/style.css (:root / body.dark). Placed
     after Aqueon's own <style>, so the same selectors win by source order. */
  const theme = `<style id="aer-theme">
:root,:root[data-theme='dark']{--bg:#2b2d35;--panel:#31343d;--panel-2:#3c3f48;--border:#404450;--text:#ffffff;--muted:#a0a4b2;--faint:#757a8a;--pill-bg:#25272e;--pill-active-bg:#3dd68c;--pill-active-text:#0d2218;--red:#ef4444;--blue:#5b8dee;--green:#3dd68c;--amber:#fbbf24;--purple:#a78bfa}
:root[data-theme='light']{--bg:#f4f5f7;--panel:#ffffff;--panel-2:#f8f9fb;--border:#e2e4ea;--text:#1a1d27;--muted:#6b7080;--faint:#9aa0b4;--pill-bg:#eaecf0;--pill-active-bg:#0d7a52;--pill-active-text:#ffffff;--red:#c41a1a;--blue:#1a4fd6;--green:#0d7a52;--amber:#b35c00;--purple:#7c3aed}
:root:not([data-theme='light']) .chip[aria-pressed='true'],:root:not([data-theme='light']) .toast{color:#0d2218}
</style>`;
  const style = theme + `<style id="aer-backbar-style">
#aer-backbar{display:flex;align-items:center;gap:12px;padding:7px 28px;background:var(--panel);border-bottom:1px solid var(--border);font-size:12.5px;color:var(--muted);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Sukhumvit Set','Thonburi',sans-serif}
#aer-backbar a{display:inline-flex;align-items:center;gap:6px;color:var(--text);text-decoration:none;font-weight:600;padding:3px 10px 3px 6px;border-radius:999px}
#aer-backbar a:hover{background:var(--panel-2)}
#aer-backbar a:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
#aer-backbar span{margin-left:auto;color:var(--faint);letter-spacing:.04em}
@media print{#aer-backbar{display:none!important}}
</style>`;
  const bar = `<nav id="aer-backbar" aria-label="AER"><a href="../index.html"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>กลับหน้าหลัก AER</a><span>AER · Assisted Environmental Reporting</span></nav>`;

  /* The single-file build inlines the whole app script inside <head>, and that
     script contains "</head>" / "<body>" text of its own (SheetJS HTML
     export) — so inject at the LAST occurrence, which is the real tag. */
  const headAt = html.lastIndexOf('</head>');
  if (headAt < 0) throw new Error('Unexpected Aqueon build output (no </head>).');
  html = html.slice(0, headAt) + style + html.slice(headAt);
  const bodyAt = html.lastIndexOf('<body');
  const bodyEnd = bodyAt < 0 ? -1 : html.indexOf('>', bodyAt);
  if (bodyAt < headAt || bodyEnd < 0) throw new Error('Unexpected Aqueon build output (no <body> after </head>).');
  html = html.slice(0, bodyEnd + 1) + bar + html.slice(bodyEnd + 1);

  const dest = path.join(root, 'public', 'aqueon', 'index.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
  console.log(`Wrote ${path.relative(root, dest)} (${(html.length / 1024).toFixed(0)} KB)`);
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
