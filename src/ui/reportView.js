/**
 * reportView.js — draws the report beside the findings list.
 *   Word  → pages laid out from the file itself: the fonts (TH Sarabun is
 *           bundled, so lines wrap where Word wraps them), Word's line
 *           heights and spacing, tab stops, numbering, tables with their
 *           borders, pictures, shapes, charts and SmartArt, headers and
 *           footers with page numbers — split into pages where Word split
 *           them the last time it saved the file.
 *   PDF   → the real pages, rendered by pdf.js, with boxes over each finding.
 *   Text  → one plain page.
 * The pages stay paper-white in dark mode, like Word's own page view.
 * Findings are drawn as <mark data-is="ids">; the page script shows or
 * hides them without redrawing the pages.
 */
import { SEV_ORDER } from '../core/reportCheck.js';
import { fmtNum } from '../core/reportExtract.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const showWs = s => esc(s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '◌')).replace(/ /g, '·').replace(/\n/g, '↵').replace(/\t/g, '→');
const TW = 15; // twips per CSS px
const THAI = /[฀-๿]/;
const hex6 = v => /^[0-9a-f]{6}$/i.test(v || '');

/* ── fonts ── TH Sarabun New is bundled (GPL, see public/fonts). Its letter
   widths equal TH SarabunPSK's; the two differ only in line height, so one
   set of files serves both, with Word's line metrics for each. */
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
let fontsAdded = false;
function addFonts() {
  if (fontsAdded || typeof document === 'undefined') return;
  fontsAdded = true;
  const faces = [
    [400, 'normal', 'THSarabunNew.ttf', ['TH Sarabun New', 'THSarabunNew']],
    [700, 'normal', 'THSarabunNew-Bold.ttf', ['TH Sarabun New Bold', 'THSarabunNew-Bold']],
    [400, 'italic', 'THSarabunNew-Italic.ttf', ['TH Sarabun New Italic', 'THSarabunNew-Italic']],
    [700, 'italic', 'THSarabunNew-BoldItalic.ttf', ['TH Sarabun New Bold Italic', 'THSarabunNew-BoldItalic']],
  ];
  const fams = [['RC Sarabun New', '84.4%', '48.1%'], ['RC Sarabun PSK', '85%', '46%']]; // Word's line box for each
  const css = fams.flatMap(([f, a, d]) => faces.map(([wt, st, file, loc]) =>
    "@font-face{font-family:'" + f + "';src:" + loc.map(l => "local('" + l + "')").join(',') + ",url('" + BASE + 'fonts/' + file +
    "') format('truetype');font-weight:" + wt + ';font-style:' + st + ';font-display:block;ascent-override:' + a + ';descent-override:' + d + ';line-gap-override:0%}')).join('\n');
  const s = document.createElement('style');
  s.id = 'rc-fonts';
  s.textContent = css;
  document.head.appendChild(s);
  /* metric-compatible stand-ins for Office's Latin fonts */
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&family=Caladea:ital,wght@0,400;0,700;1,400;1,700&family=Tinos:ital,wght@0,400;0,700;1,400;1,700&family=Arimo:ital,wght@0,400;0,700;1,400;1,700&display=swap';
  document.head.appendChild(l);
}
/* Wait for the report fonts before the first layout (line wrapping and
   page splitting are measured). */
export async function ensureFonts() {
  addFonts();
  if (!document.fonts || !document.fonts.load) return;
  const want = ['400 16px "RC Sarabun New"', '700 16px "RC Sarabun New"', '400 16px "RC Sarabun PSK"', '700 16px "RC Sarabun PSK"'];
  try { await Promise.race([Promise.all(want.map(f => document.fonts.load(f, 'กa1'))), new Promise(r => setTimeout(r, 5000))]); } catch (e) { /* draw with fallbacks */ }
}

/* Single line height as a multiple of the font size, measured from
   Word's own layout (Word for Mac, the user's setup). */
const LH = {
  'times new roman': 1.153, arial: 1.149, tahoma: 1.224, calibri: 1.222, 'calibri light': 1.222, cambria: 1.173,
  'leelawadee': 1.33, 'leelawadee ui': 1.33, 'segoe ui': 1.33, verdana: 1.215, georgia: 1.136, 'courier new': 1.133, symbol: 1.2, wingdings: 1.1,
};
const SUB = {
  calibri: "'Calibri','Carlito'", 'calibri light': "'Calibri Light','Carlito'", cambria: "'Cambria','Caladea'",
  'times new roman': "'Times New Roman','Tinos'", arial: "'Arial','Arimo'", 'courier new': "'Courier New',monospace",
};
const NEW = { fam: "'RC Sarabun New',sans-serif", k: 1, lh: 1.325 };
const PSK = { fam: "'RC Sarabun PSK',sans-serif", k: 1, lh: 1.31 };
const fontMemo = new Map();
function cssFont(name) {
  const key = name || '';
  if (fontMemo.has(key)) return fontMemo.get(key);
  const n = key.toLowerCase().trim();
  let f;
  if (!n || /sarabun ?new|sarabun ?it/.test(n)) f = NEW;
  else if (/sarabun/.test(n)) f = PSK;
  else if (/^angsana/.test(n)) f = { fam: PSK.fam, k: 1.04, lh: 1.35 };
  else if (/^cordia/.test(n)) f = { fam: PSK.fam, k: 1.06, lh: 1.155 };
  else if (/^browallia/.test(n)) f = { fam: PSK.fam, k: 1.0, lh: 1.25 };
  else if (/^th |upc$|jasmine|eucrosia|freesia|dillenia|kodchiang|niramit|charm|k2d|baijam|kodchasal|krub|mali|chakra|fah ?kwang|koho|srisakdi/.test(n)) {
    f = { fam: "'" + key.replace(/'/g, '') + "'," + NEW.fam, k: 1, lh: 1.3 };
  } else f = { fam: (SUB[n] || "'" + key.replace(/'/g, '') + "'") + ',' + NEW.fam, k: 1, lh: LH[n] || 1.17 };
  fontMemo.set(key, f);
  return f;
}
const HL = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000' };

function themeFont(doc, t) {
  if (!t) return null;
  const set = /^major/.test(t) ? doc.theme.major : doc.theme.minor;
  return /Bidi|cs/i.test(t) ? set.thai : set.latin;
}
/* Font of a run for Thai (complex-script) or Latin text */
function runFont(doc, rp, thai) {
  rp = rp || {};
  const sz = (thai ? (rp.szCs ?? rp.sz) : rp.sz) ?? (thai ? (doc.normalR.szCs ?? doc.normalR.sz) : doc.normalR.sz) ?? 22;
  const name = thai
    ? (rp.fC || themeFont(doc, rp.fCT) || doc.theme.minor.thai || rp.fA || themeFont(doc, rp.fAT))
    : (rp.fA || themeFont(doc, rp.fAT) || doc.theme.minor.latin);
  const f = cssFont(name);
  const nominal = sz / 2 * 4 / 3;
  return { f, nominal, px: nominal * f.k };
}
const cssMemo = new WeakMap();
function runCss(doc, rp, thai) {
  rp = rp || {};
  let m = cssMemo.get(rp);
  if (!m) { m = {}; cssMemo.set(rp, m); }
  const k = thai ? 't' : 'l';
  if (m[k]) return m[k];
  const b = thai ? (rp.bCs ?? rp.b) : rp.b;
  const i = thai ? (rp.iCs ?? rp.i) : rp.i;
  const { f, px: px0 } = runFont(doc, rp, thai);
  let px = px0;
  const css = ['font-family:' + f.fam];
  if (rp.vert === 'superscript' || rp.vert === 'subscript') { css.push('vertical-align:' + (rp.vert === 'superscript' ? 'super' : 'sub')); px *= 0.66; }
  css.push('font-size:' + px.toFixed(2) + 'px');
  if (b) css.push('font-weight:700');
  if (i) css.push('font-style:italic');
  const dec = [rp.u && 'underline', (rp.strike || rp.dstrike) && 'line-through'].filter(Boolean);
  if (dec.length) css.push('text-decoration:' + dec.join(' '));
  if (hex6(rp.color)) css.push('color:#' + rp.color);
  if (rp.hl && HL[rp.hl]) css.push('background:' + HL[rp.hl]);
  else if (hex6(rp.shd)) css.push('background:#' + rp.shd);
  if (rp.caps) css.push('text-transform:uppercase');
  if (rp.smallCaps) css.push('font-variant:small-caps');
  if (rp.csp) css.push('letter-spacing:' + (rp.csp / TW).toFixed(2) + 'px');
  return (m[k] = css.join(';'));
}

/* ── Thai line breaking ──
   Word for Windows breaks Thai lines between words (a dictionary, like the
   browser). Word for Mac breaks only at spaces, and splits a run of letters
   only when the run is longer than the line. 'mac' mode copies that by
   joining Thai letter clusters with WORD JOINER (U+2060); the browser's
   emergency breaking (overflow-wrap:anywhere) then splits over-long runs. */
let BRK = 'win';
let lastCh = ' ';
const GSEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
function brkText(s) {
  if (BRK !== 'mac' || !GSEG) { if (s) lastCh = s[s.length - 1]; return s; }
  let out = '';
  for (const { segment: g } of GSEG.segment(s)) {
    if (!/\s/.test(g) && !/\s/.test(lastCh) && (THAI.test(g) || THAI.test(lastCh))) out += '\u2060';
    out += g;
    lastCh = g;
  }
  return out;
}
/* Which Word laid the file out, judged from where it started new pages
   inside paragraphs (each one is the start of a line). */
export function guessBreaks(doc) {
  if (!doc || doc.kind !== 'docx' || !GSEG) return 'mac';
  const WS = new Intl.Segmenter('th', { granularity: 'word' });
  let atSpace = 0, atWord = 0, inWord = 0;
  for (const p of doc.paras) for (const k of p.breaks || []) {
    const a = p.text[k - 1] || '', b = p.text[k] || '';
    if (!a || !b) continue;
    if (/\s/.test(a) || /\s/.test(b)) { atSpace++; continue; }
    if (!THAI.test(a) && !THAI.test(b)) continue;
    const from = Math.max(0, k - 40);
    let edge = false;
    for (const w of WS.segment(p.text.slice(from, k + 40))) if (from + w.index === k) { edge = true; break; }
    if (edge) atWord++; else inWord++;
  }
  if (atWord > inWord && atWord >= Math.max(1, atSpace * 0.3)) return 'win';
  return 'mac';
}

/* ── render state for the sheet being drawn ── */
let G = { w: 794, h: 1123, l: 96, r: 96, t: 96, b: 96, cw: 602, ch: 931 }; // page geometry, px
let PAGE = { n: '1', total: 1 };
const geom = pg => {
  const g = { w: pg.w / TW, h: pg.h / TW, l: pg.l / TW, r: pg.r / TW, t: pg.t / TW, b: pg.b / TW, hd: pg.hd / TW, ft: pg.ft / TW };
  g.cw = g.w - g.l - g.r; g.ch = g.h - g.t - g.b;
  return g;
};

/* ── findings ── */
function spansOf(issues) {
  const spans = [];
  for (const i of issues) for (const [s, e] of i.ranges) if (e > s) spans.push([s, e, i]);
  return spans;
}
/* every finding that covers [a,b), most severe first */
function issuesAt(spans, a, b) {
  const out = [];
  for (const [s, e, i] of spans) if (s <= a && e >= b && !out.includes(i)) out.push(i);
  return out.sort((x, y) => SEV_ORDER[x.sev] - SEV_ORDER[y.sev]);
}
function markOpen(list) {
  return '<mark class="rc-m sev-' + list[0].sev + '" data-i="' + list[0].id + '" data-is="' + list.map(i => i.id).join(' ') + '">';
}

/* Which font a character takes: Thai letters the complex-script font;
   Latin letters the Latin font; digits/punctuation the Latin font unless
   the run asks for complex script (w:hint="cs", w:cs); spaces and other
   neutral characters follow the character before them. */
function charClass(ch, prev, csRun, hintCs) {
  if (csRun) return 'T';
  if (THAI.test(ch)) return 'T';
  if (/[A-Za-zÀ-ɏ]/.test(ch)) return 'L';
  if (/[0-9!-\/:-@\[-`{-~]/.test(ch)) return hintCs ? 'T' : 'L';
  return prev || (hintCs ? 'T' : null);
}

function wordText(doc, p, issues, a = 0, b = p.text.length) {
  const spans = spansOf(issues);
  const cuts = new Set([a, b]);
  for (const [s, e] of spans) { if (s > a && s < b) cuts.add(s); if (e > a && e < b) cuts.add(e); }
  let out = '';
  for (const r of p.runs) {
    if (r.img) {
      if (r.img.anchor) continue; // drawn at the start of the paragraph
      if (r.s < a || r.s > b || (r.s === b && b !== p.text.length)) continue;
      out += objHtml(doc, r.img, p);
      continue;
    }
    const s0 = Math.max(a, r.s), e0 = Math.min(b, r.e);
    if (s0 >= e0) continue;
    const pts = [s0, ...[...cuts].filter(c => c > s0 && c < e0).sort((x, y) => x - y), e0];
    const rp = r.rp || {};
    const csRun = !!(rp.cs || rp.rtl), hintCs = rp.hint === 'cs';
    const runThai = THAI.test(p.text.slice(r.s, r.e));
    for (let k = 0; k + 1 < pts.length; k++) {
      const seg = p.text.slice(pts[k], pts[k + 1]);
      const iss = issuesAt(spans, pts[k], pts[k + 1]);
      let inner = '', buf = '', cls = null;
      const flush = () => {
        if (!buf) return;
        const thai = cls === 'T' || (cls == null && runThai);
        const txt = iss.length && /^[\s\u200B-\u200D\u2060\uFEFF]+$/.test(buf) ? showWs(buf) : esc(brkText(buf));
        if (rp.fld === 'PAGE') inner += '<span style="' + runCss(doc, rp, thai) + '">' + esc(PAGE.n) + '</span>';
        else if (rp.fld === 'NUMPAGES' || rp.fld === 'SECTIONPAGES') inner += '<span style="' + runCss(doc, rp, thai) + '">' + PAGE.total + '</span>';
        else inner += '<span style="' + runCss(doc, rp, thai) + '">' + txt + '</span>';
        buf = '';
      };
      for (const ch of seg) {
        if (ch === '\t') { flush(); inner += '<span class="rc-tab"></span>'; lastCh = ' '; continue; }
        const c = charClass(ch, cls, csRun, hintCs);
        if (c !== cls && buf) flush();
        cls = c;
        buf += ch;
      }
      flush();
      out += iss.length ? markOpen(iss) + inner + '</mark>' : inner;
      if (rp.fld) break; // the cached number is replaced once
    }
  }
  return out;
}

/* ── paragraphs ── */

/* The run that sets the paragraph's line height: the largest font used */
function lineFont(doc, p) {
  let best = null;
  const consider = (rp, thai) => { const f = runFont(doc, rp, thai); if (!best || f.nominal * f.f.lh > best.nominal * best.f.lh) best = f; };
  for (const r of p.runs) {
    if (r.img || r.e <= r.s) continue;
    const t = p.text.slice(r.s, r.e);
    if (THAI.test(t)) consider(r.rp, true);
    if (/[A-Za-z0-9]/.test(t)) consider(r.rp, !!(r.rp && (r.rp.cs || r.rp.hint === 'cs')) && !/[A-Za-z]/.test(t));
  }
  if (!best) consider(p.markR || (p.runs[0] || {}).rp || {}, true);
  return best;
}
function lineHeight(doc, p, f) {
  const pp = p.pp || {};
  const natural = f.nominal * f.f.lh;
  const sec = doc.secs && doc.secs[p.sec];
  const rule = pp.line != null ? pp.lineRule : 'auto';
  if (rule === 'exact') return pp.line / TW;
  if (rule === 'atLeast') return Math.max(pp.line / TW, natural);
  const mult = (pp.line ?? 240) / 240;
  if (sec && sec.grid && /^lines/.test(sec.grid.type) && sec.grid.pitch && pp.snap !== false) {
    const pitch = sec.grid.pitch / TW;
    return Math.ceil(natural / pitch - 0.02) * pitch * mult;
  }
  return natural * mult;
}
function borderCss(b) {
  if (!b || /^(nil|none)$/.test(b.val)) return 'none';
  const w = Math.max(0.5, (b.sz || 4) / 8 * 4 / 3); // eighths of a point
  const st = /double/.test(b.val) ? 'double' : /dot/i.test(b.val) ? 'dotted' : /dash/i.test(b.val) ? 'dashed' : 'solid';
  const c = hex6(b.color) ? '#' + b.color : '#000';
  return (st === 'double' ? Math.max(3, w * 3) : w).toFixed(2) + 'px ' + st + ' ' + c;
}

/* opts: a,b = text range (a paragraph split across pages); cont = this is
   the continuation; more = continues on the next page; noB/noA = drop the
   space before/after (contextual spacing, top of page) */
function paraHtml(doc, p, issues, opts = {}) {
  const pp = p.pp || {};
  const a = opts.a ?? 0, b = opts.b ?? p.text.length;
  const st = [];
  const left = (pp.indL || 0) / TW, right = (pp.indR || 0) / TW;
  const hang = (pp.hang || 0) / TW, first = (pp.first || 0) / TW;
  const f = lineFont(doc, p);
  const lh = lineHeight(doc, p, f);
  lastCh = ' ';
  st.push('font-family:' + f.f.fam, 'font-size:' + f.px.toFixed(2) + 'px', 'line-height:' + lh.toFixed(2) + 'px');
  const spB = opts.noB || opts.cont ? 0 : (pp.spB || 0) / TW;
  const spA = opts.noA || opts.more ? 0 : (pp.spA || 0) / TW;
  /* Word uses the larger of "space after" and the next "space before",
     the way CSS margins collapse */
  if (spB) st.push('margin-top:' + spB.toFixed(1) + 'px');
  if (spA) st.push('margin-bottom:' + spA.toFixed(1) + 'px');
  if (left > 0) st.push('padding-left:' + left.toFixed(1) + 'px'); else if (left < 0) st.push('margin-left:' + left.toFixed(1) + 'px');
  if (right > 0) st.push('padding-right:' + right.toFixed(1) + 'px'); else if (right < 0) st.push('margin-right:' + right.toFixed(1) + 'px');
  if (!opts.cont) { if (hang) st.push('text-indent:' + (-hang).toFixed(1) + 'px'); else if (first) st.push('text-indent:' + first.toFixed(1) + 'px'); }
  const jc = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify', thaiDistribute: 'justify', lowKashida: 'justify', mediumKashida: 'justify', highKashida: 'justify' }[pp.jc];
  if (jc) st.push('text-align:' + jc);
  /* Thai Distributed spreads the spare room between letters, not only at spaces */
  if (/^(thaiDistribute|distribute)$/.test(pp.jc)) st.push('text-justify:inter-character');
  if (jc === 'justify' && !opts.more) st.push('text-align-last:' + (pp.jc === 'distribute' ? 'justify' : 'auto'));
  if (opts.more && jc === 'justify') st.push('text-align-last:justify');
  if (hex6(pp.fill)) st.push('background:#' + pp.fill);
  if (pp.borders) for (const s of ['top', 'bottom', 'left', 'right']) if (pp.borders[s]) st.push('border-' + s + ':' + borderCss(pp.borders[s]));

  /* tab stops, in px from the margin */
  const tabs = p.text.slice(a, b).includes('\t') || (p.label && p.suff === 'tab' && !opts.cont);
  const attrs = [];
  if (tabs) {
    attrs.push('data-ts="' + (pp.tabs || []).filter(t => t.val !== 'clear').map(t => (t.pos / TW).toFixed(1) + ':' + t.val + ':' + (t.leader || '')).join(',') + '"');
    attrs.push('data-dt="' + ((doc.defTab || 720) / TW).toFixed(1) + '"');
    if (hang) attrs.push('data-hang="' + left.toFixed(1) + '"');
    if (left < 0) attrs.push('data-ml="' + left.toFixed(1) + '"');
  }

  let label = '';
  if (p.label && !opts.cont) {
    const lt = THAI.test(p.label) || THAI.test(p.text);
    label = '<span class="rc-lbl" style="' + runCss(doc, p.labelR, lt) + '">' + esc(p.label) + '</span>' +
      (p.suff === 'space' ? ' ' : p.suff === 'tab' ? '<span class="rc-tab"></span>' : '');
  }
  /* objects anchored to this paragraph are drawn at its start */
  let anchored = '';
  if (!opts.cont) for (const r of p.runs) if (r.img && r.img.anchor) anchored += objHtml(doc, r.img, p);
  let body = anchored + label + wordText(doc, p, issues, a, b);
  if (tabs) body += '<span class="rc-end"></span>';
  if (!p.text && !p.runs.some(r => r.img)) body += '<span style="' + runCss(doc, p.markR || (p.runs[0] || {}).rp || {}, true) + '">\u200B</span>';
  const cls = 'rc-wp' + (p.isHeading ? ' hd' : '');
  const id = opts.cont || typeof p.idx !== 'number' ? '' : ' id="rc-p-' + p.idx + '"';
  return '<div class="' + cls + '"' + id + ' ' + attrs.join(' ') + ' style="' + st.join(';') + '">' + body + '</div>';
}

/* Blocks inside a cell, text box or header: paragraphs with contextual
   spacing between neighbours of the same style */
function blocksHtml(doc, blocks, byPara) {
  let h = '';
  blocks.forEach((b, k) => {
    if (b.t === 'p') {
      const prev = blocks[k - 1], next = blocks[k + 1];
      const same = x => x && x.t === 'p' && x.p.sid === b.p.sid;
      const cs = b.p.pp && b.p.pp.ctxSp;
      h += paraHtml(doc, b.p, byPara.get(b.p.idx) || [], { noB: cs && same(prev), noA: cs && same(next) });
    } else if (b.t === 'tbl') h += tableHtml(doc, b, byPara);
    else if (b.t === 'tbx') h += '<div class="rc-tbx">' + blocksHtml(doc, b.blocks, byPara) + '</div>';
  });
  return h;
}

/* ── tables ── */
function firstPara(b) {
  if (!b) return null;
  if (b.t === 'p') return b.p;
  const list = b.t === 'tbl' ? b.rows.flatMap(r => r.flatMap(c => c.blocks)) : b.blocks || [];
  for (const x of list) { const p = firstPara(x); if (p) return p; }
  return null;
}
/* rows: which row indices to draw (a page's share of the table, with the
   repeated header rows first) */
function tableHtml(doc, T, byPara, rows) {
  const nGrid = T.grid.length || Math.max(1, ...T.rows.map(r => r.reduce((a, c) => a + c.span, 0)));
  const total = T.grid.reduce((a, b) => a + b, 0) || 1;
  const width = typeof T.width === 'string' ? T.width : Math.min(T.width || total / TW, G.cw + 40).toFixed(0) + 'px';
  const ind = T.ind ? ';margin-left:' + (T.ind / TW).toFixed(1) + 'px' : '';
  const jc = T.jc === 'center' ? ';margin-left:auto;margin-right:auto' : T.jc === 'right' || T.jc === 'end' ? ';margin-left:auto' : ind;
  let h = '<div class="rc-tblwrap"><table class="rc-tbl" style="width:' + width + jc + '">';
  if (T.grid.length) h += '<colgroup>' + T.grid.map(w => '<col style="width:' + (w / total * 100).toFixed(3) + '%">').join('') + '</colgroup>';
  const list = rows || T.rows.map((r, i) => i);
  const B = T.borders || {};
  /* cells merged down from a row that is not drawn (the table continues
     from the previous page) still need a cell here */
  const drawn = new Set(list);
  list.forEach((ri, li) => {
    const row = T.rows[ri];
    const cells = row.map(c => ({ c, ri }));
    if (li > 0 && list[li - 1] !== ri - 1 || (li === 0 && ri > 0)) {
      for (let up = ri - 1; up >= 0; up--) {
        if (drawn.has(up) && up >= list[0]) continue;
        for (const c of T.rows[up]) if (c.rowspan > 1 && up + c.rowspan > ri && !cells.some(x => x.c === c)) cells.push({ c, ri: up, ghost: true });
      }
      cells.sort((x, y) => x.c.col - y.c.col);
    }
    const st = [];
    if (row.h) st.push((row.hRule === 'exact' ? 'height:' : 'height:') + (row.h / TW).toFixed(1) + 'px');
    h += '<tr' + (row.hdr ? ' data-hdr="1"' : '') + (st.length ? ' style="' + st.join(';') + '"' : '') + '>';
    const last = list[list.length - 1];
    for (const { c, ri: r0, ghost } of cells) {
      const cs = [];
      const cb = c.borders || {};
      const firstRow = li === 0 || (ghost && li === 0);
      const span = Math.max(1, Math.min(c.rowspan - (ri - r0), last - ri + 1));
      const lastRow = ri + span - 1 >= T.rows.length - 1 || ri + span - 1 >= last;
      const edge = {
        top: cb.top || (firstRow ? B.top || B.insideH : B.insideH),
        bottom: cb.bottom || (lastRow ? B.bottom || B.insideH : null),
        left: cb.left || (c.col === 0 ? B.left : B.insideV),
        right: cb.right || (c.col + c.span >= nGrid ? B.right : null),
      };
      /* thin solid lines are drawn as inset shadows with their width kept in
         the padding, so a row is exactly text + line, as in Word, on any screen */
      const m = { ...(T.mar || {}), ...(c.mar || {}) };
      const pad = { top: (m.top || 0) / TW, right: (m.right || 0) / TW, bottom: (m.bottom || 0) / TW, left: (m.left || 0) / TW };
      const shadows = [];
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const e = edge[side];
        if (!e || /^(nil|none)$/.test(e.val)) continue;
        const w = Math.max(0.5, (e.sz || 4) / 6);
        const col = hex6(e.color) ? '#' + e.color : '#000';
        if (/^(single|thick)$/.test(e.val) && w <= 3) {
          pad[side] += w;
          const W = w.toFixed(2);
          shadows.push('inset ' + { top: '0 ' + W + 'px', bottom: '0 -' + W + 'px', left: W + 'px 0', right: '-' + W + 'px 0' }[side] + ' 0 0 ' + col);
        } else cs.push('border-' + side + ':' + borderCss(e));
      }
      if (shadows.length) cs.push('box-shadow:' + shadows.join(','));
      cs.push('padding:' + [pad.top, pad.right, pad.bottom, pad.left].map(v => v.toFixed(2) + 'px').join(' '));
      if (hex6(c.fill)) cs.push('background:#' + c.fill);
      cs.push('vertical-align:' + (c.va === 'center' ? 'middle' : c.va === 'bottom' ? 'bottom' : 'top'));
      if (c.noWrap) cs.push('white-space:nowrap');
      let inner = ghost ? '' : blocksHtml(doc, c.blocks, byPara);
      if (c.dir === 'btLr' || c.dir === 'tbRl' || c.dir === 'tbRlV') inner = '<div class="rc-vtext' + (c.dir === 'btLr' ? ' bt' : '') + '">' + inner + '</div>';
      h += '<td' + (c.span > 1 ? ' colspan="' + c.span + '"' : '') + (span > 1 ? ' rowspan="' + span + '"' : '') +
        ' style="' + cs.join(';') + '">' + inner + '</td>';
    }
    h += '</tr>';
  });
  return h + '</table></div>';
}

/* ── pictures, shapes, charts ── */
let uid = 0;
function shapeSvg(o) {
  const w = Math.max(o.w, 0.5), h = Math.max(o.h, 0.5);
  const ln = o.line, sw = ln ? ln.w : 0;
  const fill = o.fill || 'none', stroke = ln ? ln.color : 'none';
  if (fill === 'none' && stroke === 'none') return '';
  const dash = ln && ln.dash && ln.dash !== 'solid' ? ' stroke-dasharray="' + (/dot/i.test(ln.dash) && !/dash/i.test(ln.dash) ? sw + ' ' + sw * 2 : sw * 4 + ' ' + sw * 3) + '"' : '';
  let defs = '', mk = '';
  if (ln && (ln.head && ln.head !== 'none' || ln.tail && ln.tail !== 'none')) {
    const id = 'rcm' + (++uid);
    defs = '<defs><marker id="' + id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="' + Math.max(4, 3) + '" markerHeight="4" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="' + stroke + '"/></marker></defs>';
    if (ln.tail && ln.tail !== 'none') mk += ' marker-end="url(#' + id + ')"';
    if (ln.head && ln.head !== 'none') mk += ' marker-start="url(#' + id + ')"';
  }
  const at = ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + dash;
  const poly = pts => '<polygon points="' + pts.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' ') + '"' + at + '/>';
  const hh = Math.min(w, h / 2 * 1.0);
  let g;
  switch (o.prst) {
    case 'ellipse': case 'flowChartConnector': g = '<ellipse cx="' + w / 2 + '" cy="' + h / 2 + '" rx="' + w / 2 + '" ry="' + h / 2 + '"' + at + '/>'; break;
    case 'roundRect': case 'flowChartAlternateProcess': g = '<rect width="' + w + '" height="' + h + '" rx="' + Math.min(w, h) * 0.1667 + '"' + at + '/>'; break;
    case 'line': case 'straightConnector1': case 'bentConnector2': case 'bentConnector3': case 'curvedConnector3':
      g = '<line x1="0" y1="0" x2="' + w + '" y2="' + h + '"' + at.replace(/fill="[^"]*"/, 'fill="none"') + mk + '/>'; break;
    case 'triangle': g = poly([[w / 2, 0], [w, h], [0, h]]); break;
    case 'rtTriangle': g = poly([[0, 0], [w, h], [0, h]]); break;
    case 'diamond': case 'flowChartDecision': g = poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]); break;
    case 'parallelogram': case 'flowChartInputOutput': g = poly([[w * 0.25, 0], [w, 0], [w * 0.75, h], [0, h]]); break;
    case 'hexagon': g = poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]); break;
    case 'homePlate': g = poly([[0, 0], [w - h / 2, 0], [w, h / 2], [w - h / 2, h], [0, h]]); break;
    case 'chevron': g = poly([[0, 0], [w - h / 2, 0], [w, h / 2], [w - h / 2, h], [0, h], [h / 2, h / 2]]); break;
    case 'rightArrow': g = poly([[0, h * 0.25], [w - hh, h * 0.25], [w - hh, 0], [w, h / 2], [w - hh, h], [w - hh, h * 0.75], [0, h * 0.75]]); break;
    case 'leftArrow': g = poly([[w, h * 0.25], [hh, h * 0.25], [hh, 0], [0, h / 2], [hh, h], [hh, h * 0.75], [w, h * 0.75]]); break;
    case 'downArrow': { const v = Math.min(h, w / 2); g = poly([[w * 0.25, 0], [w * 0.75, 0], [w * 0.75, h - v], [w, h - v], [w / 2, h], [0, h - v], [w * 0.25, h - v]]); break; }
    case 'upArrow': { const v = Math.min(h, w / 2); g = poly([[w * 0.25, h], [w * 0.75, h], [w * 0.75, v], [w, v], [w / 2, 0], [0, v], [w * 0.25, v]]); break; }
    default: g = '<rect width="' + w + '" height="' + h + '"' + at + '/>';
  }
  const flip = o.flipH || o.flipV ? ' style="transform:scale(' + (o.flipH ? -1 : 1) + ',' + (o.flipV ? -1 : 1) + ')"' : '';
  return '<svg class="rc-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"' + flip + '>' + defs + g + '</svg>';
}
function dmlHtml(paras) {
  return paras.map(p => '<div style="text-align:' + ({ ctr: 'center', r: 'right', just: 'justify' }[p.align] || 'left') + '">' +
    (p.runs.map(r => '<span style="font-family:' + NEW.fam + ';font-size:' + ((r.sz || 14) * 4 / 3).toFixed(1) + 'px' + (r.b ? ';font-weight:700' : '') +
      (r.i ? ';font-style:italic' : '') + (r.color ? ';color:' + r.color : '') + '">' + esc(r.t) + '</span>').join('') || '\u200B') + '</div>').join('');
}
function objInner(doc, o) {
  const size = 'width:' + o.w.toFixed(1) + 'px;height:' + o.h.toFixed(1) + 'px';
  switch (o.t) {
    case 'img': {
      if (!o.url) return '<span class="rc-imgph" style="' + size + '">' + esc((o.kind === 'EMF' || o.kind === 'WMF' ? 'รูปแบบ ' + o.kind + ' (แสดงในเว็บไม่ได้)' : 'รูปภาพ ' + (o.kind || ''))) + '</span>';
      const tf = o.rot || o.flipH || o.flipV ? 'transform:rotate(' + (o.rot || 0) + 'deg) scale(' + (o.flipH ? -1 : 1) + ',' + (o.flipV ? -1 : 1) + ');' : '';
      if (o.crop) {
        const [l, t, r, b] = o.crop, W = o.w / (1 - l - r || 1), H = o.h / (1 - t - b || 1);
        return '<span class="rc-crop" style="' + size + ';' + tf + '"><img src="' + o.url + '" alt="" style="width:' + W.toFixed(1) + 'px;height:' + H.toFixed(1) + 'px;left:' + (-l * W).toFixed(1) + 'px;top:' + (-t * H).toFixed(1) + 'px"></span>';
      }
      return '<img class="rc-img" src="' + o.url + '" alt="" style="' + size + ';' + tf + '">';
    }
    case 'shape': {
      let body = '';
      if (o.blocks && o.blocks.length) body = blocksHtml(doc, o.blocks, CUR_BYPARA);
      else if (o.dml) body = dmlHtml(o.dml);
      const va = { ctr: 'center', b: 'flex-end' }[o.va] || 'flex-start';
      const pad = [o.ins.t, o.ins.r, o.ins.b, o.ins.l].map(v => (v || 0).toFixed(1) + 'px').join(' ');
      const vert = o.vert && o.vert !== 'horz' ? ' rc-vtext' + (o.vert === 'vert270' ? ' bt' : '') : '';
      return '<span class="rc-shape" style="' + size + (o.rot ? ';transform:rotate(' + o.rot + 'deg)' : '') + '">' + shapeSvg(o) +
        (body ? '<span class="rc-sbody' + vert + '" style="padding:' + pad + ';justify-content:' + va + '">' + body + '</span>' : '') + '</span>';
    }
    case 'grp':
      return '<span class="rc-grp" style="' + size + '">' + o.kids.map(k => '<span class="rc-gk" style="left:' + k.x.toFixed(1) + 'px;top:' + k.y.toFixed(1) +
        'px;width:' + k.w.toFixed(1) + 'px;height:' + k.h.toFixed(1) + 'px">' + objInner(doc, k.obj) + '</span>').join('') + '</span>';
    case 'chart':
      try { return '<span class="rc-chart" style="' + size + '">' + chartSvg(o) + '</span>'; } catch (e) { console.error(e); }
      return '<span class="rc-imgph" style="' + size + '">แผนภูมิ / Chart</span>';
    default:
      return '<span class="rc-imgph" style="' + size + '">' + esc(o.kind === 'diagram' ? 'SmartArt' : o.kind === 'chart' ? 'แผนภูมิ / Chart' : 'วัตถุ / Object') + '</span>';
  }
}
/* Inline objects sit on the text line; anchored ones are placed where
   Word places them: floated beside the text, on their own line, or at a
   fixed spot on the page (in front of / behind the text). */
function objHtml(doc, o, p) {
  const inner = objInner(doc, o);
  const a = o.anchor;
  if (!a) return '<span class="rc-obj" style="width:' + o.w.toFixed(1) + 'px;height:' + o.h.toFixed(1) + 'px">' + inner + '</span>';
  const pp = (p && p.pp) || {};
  const indL = (pp.indL || 0) / TW;
  const startX = G.l + indL + ((pp.first || 0) - (pp.hang || 0)) / TW; // where the paragraph's first line starts
  const xIn = (rel, off, align, w) => {
    const [base, width] = rel === 'page' ? [0, G.w] : rel === 'leftMargin' || rel === 'insideMargin' ? [0, G.l] : rel === 'rightMargin' || rel === 'outsideMargin' ? [G.w - G.r, G.r] : [G.l, G.cw];
    if (align === 'center') return base + (width - w) / 2;
    if (align === 'right' || align === 'outside') return base + width - w;
    if (align === 'left' || align === 'inside') return base;
    return base + off;
  };
  const yIn = (rel, off, align, h) => {
    const [base, height] = rel === 'page' ? [0, G.h] : rel === 'margin' ? [G.t, G.ch] : rel === 'topMargin' ? [0, G.t] : rel === 'bottomMargin' ? [G.h - G.b, G.b] : [null, 0];
    if (base == null) return null; // paragraph / line: relative to the paragraph
    if (align === 'center') return base + (height - h) / 2;
    if (align === 'bottom' || align === 'outside') return base + height - h;
    if (align === 'top' || align === 'inside') return base;
    return base + off;
  };
  const x = xIn(a.h.rel, a.h.off, a.h.align, o.w);
  const y = yIn(a.v.rel, a.v.off, a.v.align, o.h);
  const size = 'width:' + o.w.toFixed(1) + 'px;height:' + o.h.toFixed(1) + 'px';
  if (a.wrap === 'none' || a.behind) {
    const z = a.behind ? 'z-index:-1' : 'z-index:2';
    if (y != null) return '<span class="rc-abs" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;' + size + ';' + z + '">' + inner + '</span>';
    return '<span class="rc-anc"><span class="rc-abs" style="left:' + (x - startX).toFixed(1) + 'px;top:' + a.v.off.toFixed(1) + 'px;' + size + ';' + z + '">' + inner + '</span></span>';
  }
  const top = y == null ? Math.max(0, a.v.off) : 0;
  if (a.wrap === 'topandbottom') {
    const ml = a.h.align === 'center' ? 'auto' : Math.max(0, x - G.l - indL).toFixed(1) + 'px';
    return '<span class="rc-blockobj" style="' + size + ';margin:' + (top + a.dist.t).toFixed(1) + 'px auto ' + a.dist.b.toFixed(1) + 'px ' + ml + '">' + inner + '</span>';
  }
  const right = a.h.align === 'right' || (a.h.align !== 'left' && x + o.w / 2 > G.l + G.cw / 2);
  const m = right
    ? '0 ' + Math.max(0, G.l + G.cw - (x + o.w)).toFixed(1) + 'px ' + a.dist.b.toFixed(1) + 'px ' + a.dist.l.toFixed(1) + 'px'
    : '0 ' + a.dist.r.toFixed(1) + 'px ' + a.dist.b.toFixed(1) + 'px ' + Math.max(0, x - G.l - indL).toFixed(1) + 'px';
  return '<span class="rc-float" style="float:' + (right ? 'right' : 'left') + ';' + size + ';margin:' + m + (top ? ';margin-top:' + top.toFixed(1) + 'px' : '') + '">' + inner + '</span>';
}

/* ── charts, drawn from the numbers Word keeps inside the chart ── */
function niceAxis(min, max, n) {
  if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
  if (min === max) { if (min === 0) max = 1; else if (min > 0) min = 0; else max = 0; }
  const span = max - min;
  const raw = span / Math.max(2, n);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const lo = min >= 0 ? 0 : Math.floor((min - span * 0.05) / step) * step;
  const hi = max <= 0 ? 0 : Math.ceil((max + span * 0.05) / step) * step;
  return { lo, hi, step };
}
function fmtVal(v, code) {
  if (v == null || !isFinite(v)) return '';
  code = code || 'General';
  const dec = (/\.([0#]+)/.exec(code) || [, ''])[1].length;
  if (/%/.test(code)) return (v * 100).toFixed(dec) + '%';
  if (/General/i.test(code)) return String(+v.toFixed(Math.abs(v) >= 100 ? 1 : 2));
  const s = v.toFixed(dec);
  return /,/.test(code) ? (+s).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : s;
}
function chartSvg(o) {
  const C = o.chart, W = o.w, H = o.h;
  const acc = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(k => '#' + (C.colors[k] || '4472C4'));
  const pal = i => acc[i % 6];
  const FF = "font-family=\"'RC Sarabun New',sans-serif\"";
  const fs = 14, tfs = 19;
  const T = (x, y, s, opt = '') => '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" ' + FF + ' font-size="' + (opt.includes('font-size') ? '' : fs) + '" fill="#595959" ' + opt + '>' + esc(s) + '</text>';
  let svg = '<svg width="' + W.toFixed(1) + '" height="' + H.toFixed(1) + '" viewBox="0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1) + '"><rect x="0.5" y="0.5" width="' + (W - 1).toFixed(1) + '" height="' + (H - 1).toFixed(1) + '" fill="#fff" stroke="#d9d9d9"/>';
  let top = 10, bottom = H - 10, left = 10, right = W - 10;
  if (C.title) { svg += '<text x="' + (W / 2).toFixed(1) + '" y="' + (top + tfs).toFixed(1) + '" ' + FF + ' font-size="' + tfs + '" fill="#595959" text-anchor="middle">' + esc(C.title) + '</text>'; top += tfs + 12; }
  const plots = C.plots.filter(p => p.series.length);
  if (!plots.length) return svg + '</svg>';
  const pie = plots.find(p => p.type === 'pie' || p.type === 'doughnut');
  const series = pie ? pie.series.slice(0, 1) : plots.flatMap(p => p.series.map(s => ({ ...s, plot: p })));
  /* legend */
  const legend = pie ? (series[0].cats.length ? series[0].cats : series[0].vals.map((v, i) => String(i + 1))).map((c, i) => [c, (series[0].pts.find(q => q.i === i) || {}).fill || pal(i)])
    : series.map((s, i) => [s.name || 'Series ' + (i + 1), s.plot.type === 'line' || s.plot.type === 'scatter' ? (s.line || s.fill || pal(s.idx ?? i)) : (s.fill || pal(s.idx ?? i))]);
  if (C.legend && legend.length) {
    if (C.legend === 'r' || C.legend === 'l') {
      const lw = Math.min(W * 0.35, 24 + Math.max(...legend.map(([n]) => String(n).length)) * fs * 0.5);
      const x0 = C.legend === 'r' ? right - lw : left;
      const y0 = (top + bottom) / 2 - legend.length * (fs + 6) / 2;
      legend.forEach(([n, c], i) => { const y = y0 + i * (fs + 6); svg += '<rect x="' + (x0 + 4).toFixed(1) + '" y="' + (y + 3).toFixed(1) + '" width="8" height="8" fill="' + c + '"/>' + T(x0 + 16, y + fs * 0.85, String(n)); });
      if (C.legend === 'r') right -= lw + 6; else left += lw + 6;
    } else {
      const items = legend.map(([n, c]) => [String(n), c, 18 + String(n).length * fs * 0.48]);
      const tot = items.reduce((a, x) => a + x[2] + 10, 0);
      let x = Math.max(left, (W - tot) / 2);
      const y = C.legend === 't' ? top : bottom - fs;
      for (const [n, c, w] of items) { svg += '<rect x="' + x.toFixed(1) + '" y="' + (y + 3).toFixed(1) + '" width="8" height="8" fill="' + c + '"/>' + T(x + 12, y + fs * 0.85, n); x += w + 10; }
      if (C.legend === 't') top += fs + 10; else bottom -= fs + 10;
    }
  }
  if (pie) {
    const s = series[0];
    const vals = s.vals.map(v => Math.max(0, v || 0));
    const sum = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = (left + right) / 2, cy = (top + bottom) / 2, r = Math.max(10, Math.min(right - left, bottom - top) / 2 - 4);
    const hole = pie.hole / 100 * r;
    let ang = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a2 = ang + v / sum * Math.PI * 2;
      const c = (s.pts.find(q => q.i === i) || {}).fill || pal(i);
      const P = (rr, aa) => (cx + rr * Math.cos(aa)).toFixed(2) + ',' + (cy + rr * Math.sin(aa)).toFixed(2);
      const big = a2 - ang > Math.PI ? 1 : 0;
      if (v / sum > 0.9999) svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + c + '"/>';
      else svg += '<path d="M' + (hole ? P(hole, ang) : cx + ',' + cy) + 'L' + P(r, ang) + 'A' + r + ',' + r + ' 0 ' + big + ' 1 ' + P(r, a2) +
        (hole ? 'L' + P(hole, a2) + 'A' + hole + ',' + hole + ' 0 ' + big + ' 0 ' + P(hole, ang) : '') + 'Z" fill="' + c + '" stroke="#fff" stroke-width="1.5"/>';
      if ((s.showPct || s.showVal || s.showCat) && v > 0) {
        const mid = (ang + a2) / 2, rr = hole ? (r + hole) / 2 : r * 0.65;
        const lbl = [s.showCat && s.cats[i], s.showVal && fmtVal(v, s.fmt), s.showPct && Math.round(v / sum * 100) + '%'].filter(Boolean).join('; ');
        svg += T(cx + rr * Math.cos(mid), cy + rr * Math.sin(mid) + fs * 0.35, lbl, 'text-anchor="middle" fill="#fff"').replace('fill="#595959" ', '');
      }
      ang = a2;
    });
    if (hole) svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + hole + '" fill="#fff"/>';
    return svg + '</svg>';
  }
  /* cartesian charts */
  const scatter = plots.every(p => p.type === 'scatter');
  const horiz = plots.some(p => p.type === 'bar' && p.dir === 'bar');
  const cats = series.reduce((a, s) => (s.cats.length > a.length ? s.cats : a), []);
  const n = Math.max(cats.length, ...series.map(s => s.vals.length));
  const valAx = C.axes.find(a => a.kind === 'valAx' && !(scatter && (a.pos === 'b' || a.pos === 't'))) || {};
  const catAx = C.axes.find(a => a.kind === 'catAx' || a.kind === 'dateAx' || (scatter && a.kind === 'valAx' && (a.pos === 'b' || a.pos === 't'))) || {};
  let vmin = Infinity, vmax = -Infinity;
  for (const p of plots) {
    const ps = series.filter(s => s.plot === p);
    if (/stacked/i.test(p.grouping)) {
      for (let i = 0; i < n; i++) {
        let pos = 0, neg = 0;
        for (const s of ps) { const v = s.vals[i] || 0; if (v >= 0) pos += v; else neg += v; }
        if (p.grouping === 'percentStacked') { vmin = Math.min(vmin, neg < 0 ? -1 : 0); vmax = Math.max(vmax, 1); } else { vmin = Math.min(vmin, neg); vmax = Math.max(vmax, pos); }
      }
    } else for (const s of ps) for (const v of s.vals) if (v != null && isFinite(v)) { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
    if (p.type === 'bar' || p.type === 'area') { vmin = Math.min(vmin, 0); vmax = Math.max(vmax, 0); }
  }
  if (!isFinite(vmin)) { vmin = 0; vmax = 1; }
  if (!(scatter || plots.some(p => p.type === 'bar' || p.type === 'area')) && vmin > 0 && vmin < vmax * 0.6) vmin = 0;
  const lenV = horiz ? right - left : bottom - top;
  const ax = niceAxis(valAx.min ?? vmin, valAx.max ?? vmax, Math.max(3, Math.floor(lenV / (horiz ? 60 : 22))));
  if (valAx.min != null) ax.lo = valAx.min;
  if (valAx.max != null) ax.hi = valAx.max;
  if (valAx.unit) ax.step = valAx.unit;
  const vfmt = valAx.fmt && valAx.fmt !== 'General' ? valAx.fmt : (plots.some(p => p.grouping === 'percentStacked') ? '0%' : series[0].fmt);
  const ticks = [];
  for (let v = ax.lo, g = 0; v <= ax.hi + ax.step * 0.001 && g < 50; v += ax.step, g++) ticks.push(+v.toFixed(10));
  const tickLbl = ticks.map(v => fmtVal(v, vfmt));
  /* scatter x axis */
  let xs = null;
  if (scatter) {
    const xv = series.flatMap(s => s.cats.map(Number)).filter(isFinite);
    xs = niceAxis(Math.min(...xv), Math.max(...xv), Math.max(3, Math.floor((right - left) / 70)));
    if (catAx.min != null) xs.lo = catAx.min;
    if (catAx.max != null) xs.hi = catAx.max;
  }
  /* room for axis labels and titles */
  if (valAx.title) { if (horiz) bottom -= fs + 8; else left += fs + 8; }
  if (catAx.title) { if (horiz) left += fs + 8; else bottom -= fs + 8; }
  const catLbl = scatter ? [] : cats.map(String);
  if (horiz) {
    left += Math.min(W * 0.3, 8 + Math.max(0, ...catLbl.map(c => c.length)) * fs * 0.48);
    if (!valAx.del) bottom -= fs + 6;
  } else {
    if (!valAx.del) left += 8 + Math.max(...tickLbl.map(s => s.length)) * fs * 0.5;
    if (!catAx.del) bottom -= fs + 8;
  }
  right = Math.max(left + 20, right); bottom = Math.max(top + 20, bottom);
  const vpos = v => (horiz ? left + (v - ax.lo) / (ax.hi - ax.lo || 1) * (right - left) : bottom - (v - ax.lo) / (ax.hi - ax.lo || 1) * (bottom - top));
  /* grid + value labels */
  ticks.forEach((v, i) => {
    const q = vpos(v);
    if (valAx.grid !== false) svg += horiz ? '<line x1="' + q.toFixed(1) + '" y1="' + top + '" x2="' + q.toFixed(1) + '" y2="' + bottom + '" stroke="#d9d9d9"/>' : '<line x1="' + left + '" y1="' + q.toFixed(1) + '" x2="' + right + '" y2="' + q.toFixed(1) + '" stroke="#d9d9d9"/>';
    if (!valAx.del) svg += horiz ? T(q, bottom + fs + 2, tickLbl[i], 'text-anchor="middle"') : T(left - 6, q + fs * 0.33, tickLbl[i], 'text-anchor="end"');
  });
  if (valAx.title) svg += horiz ? T((left + right) / 2, H - 12 - (C.legend === 'b' ? fs + 10 : 0), valAx.title, 'text-anchor="middle"')
    : '<text ' + FF + ' font-size="' + fs + '" fill="#595959" text-anchor="middle" transform="translate(' + (14 + fs * 0.4) + ',' + ((top + bottom) / 2).toFixed(1) + ') rotate(-90)">' + esc(valAx.title) + '</text>';
  if (catAx.title) svg += horiz ? '<text ' + FF + ' font-size="' + fs + '" fill="#595959" text-anchor="middle" transform="translate(' + (14 + fs * 0.4) + ',' + ((top + bottom) / 2).toFixed(1) + ') rotate(-90)">' + esc(catAx.title) + '</text>'
    : T((left + right) / 2, bottom + fs * 2 + 10, catAx.title, 'text-anchor="middle"');
  const zero = vpos(Math.max(ax.lo, Math.min(ax.hi, 0)));
  svg += horiz ? '<line x1="' + zero.toFixed(1) + '" y1="' + top + '" x2="' + zero.toFixed(1) + '" y2="' + bottom + '" stroke="#bfbfbf"/>' : '<line x1="' + left + '" y1="' + zero.toFixed(1) + '" x2="' + right + '" y2="' + zero.toFixed(1) + '" stroke="#bfbfbf"/>';
  const band = (horiz ? bottom - top : right - left) / Math.max(1, n);
  const cpos = i => (horiz ? top + band * (i + 0.5) : left + band * (i + 0.5));
  const xpos = x => left + (x - xs.lo) / (xs.hi - xs.lo || 1) * (right - left);
  if (scatter) {
    const xt = [];
    for (let v = xs.lo, g = 0; v <= xs.hi + xs.step * 0.001 && g < 50; v += xs.step, g++) xt.push(+v.toFixed(10));
    xt.forEach(v => { svg += T(xpos(v), bottom + fs + 2, fmtVal(v, catAx.fmt), 'text-anchor="middle"'); });
  } else if (!catAx.del) {
    const every = Math.max(1, Math.ceil(Math.max(...catLbl.map(c => c.length), 1) * fs * 0.5 / band));
    catLbl.forEach((c, i) => { if (i % every) return; svg += horiz ? T(left - 6, cpos(i) + fs * 0.33, c, 'text-anchor="end"') : T(cpos(i), bottom + fs + 2, c, 'text-anchor="middle"'); });
  }
  /* series */
  const stackPos = new Array(n).fill(0), stackNeg = new Array(n).fill(0);
  for (const p of plots) {
    const ps = series.filter(s => s.plot === p);
    if (p.type === 'bar') {
      const stacked = /stacked/i.test(p.grouping);
      const k = stacked ? 1 : ps.length;
      const ov = stacked ? 1 : Math.max(-1, Math.min(1, p.overlap / 100));
      const bw = band / (k - (k - 1) * ov + p.gap / 100);
      const groupW = bw * (k - (k - 1) * ov);
      const tot = i => ps.reduce((a, s) => a + Math.abs(s.vals[i] || 0), 0) || 1;
      ps.forEach((s, si) => {
        const c = s.fill || pal(s.idx ?? si);
        s.vals.forEach((v0, i) => {
          if (v0 == null) return;
          const v = p.grouping === 'percentStacked' ? v0 / tot(i) : v0;
          let a, b;
          if (stacked) { if (v >= 0) { a = stackPos[i]; stackPos[i] += v; b = stackPos[i]; } else { a = stackNeg[i]; stackNeg[i] += v; b = stackNeg[i]; } } else { a = 0; b = v; }
          const off = cpos(i) - groupW / 2 + (stacked ? 0 : si * bw * (1 - ov));
          const p1 = vpos(Math.max(ax.lo, Math.min(ax.hi, a))), p2 = vpos(Math.max(ax.lo, Math.min(ax.hi, b)));
          const ci = (s.pts.find(q => q.i === i) || {}).fill || (p.vary && ps.length === 1 ? pal(i) : c);
          svg += horiz ? '<rect x="' + Math.min(p1, p2).toFixed(1) + '" y="' + off.toFixed(1) + '" width="' + Math.abs(p2 - p1).toFixed(1) + '" height="' + bw.toFixed(1) + '" fill="' + ci + '"/>'
            : '<rect x="' + off.toFixed(1) + '" y="' + Math.min(p1, p2).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.abs(p2 - p1).toFixed(1) + '" fill="' + ci + '"/>';
          if (s.showVal) svg += horiz ? T(Math.max(p1, p2) + 4, off + bw / 2 + fs * 0.33, fmtVal(v0, s.fmt)) : T(off + bw / 2, Math.min(p1, p2) - 4, fmtVal(v0, s.fmt), 'text-anchor="middle"');
        });
      });
      stackPos.fill(0); stackNeg.fill(0);
    } else {
      const stacked = /stacked/i.test(p.grouping);
      const acc2 = new Array(n).fill(0);
      ps.forEach((s, si) => {
        const c = s.line || s.fill || pal(s.idx ?? si);
        const ptsXY = [];
        s.vals.forEach((v, i) => {
          if (v == null) return;
          const vv = stacked ? (acc2[i] += v) : v;
          const X = scatter ? xpos(+s.cats[i]) : cpos(i), Y = vpos(vv);
          if (isFinite(X) && isFinite(Y)) ptsXY.push([X, Y, v]);
        });
        if (p.type === 'area') {
          if (ptsXY.length) svg += '<polygon points="' + [[ptsXY[0][0], zero], ...ptsXY, [ptsXY[ptsXY.length - 1][0], zero]].map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ') + '" fill="' + (s.fill || pal(s.idx ?? si)) + '" fill-opacity=".85"/>';
          return;
        }
        const drawLine = !s.noLine && !(scatter && p.scatter === 'marker');
        if (drawLine && ptsXY.length > 1) svg += '<polyline points="' + ptsXY.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="' + (s.lineW || 2.25).toFixed(2) + '" stroke-linejoin="round"/>';
        if (s.marker !== 'none' && (p.type !== 'line' || s.marker || !drawLine)) for (const [X, Y] of ptsXY) svg += '<circle cx="' + X.toFixed(1) + '" cy="' + Y.toFixed(1) + '" r="3.2" fill="' + (s.mfill || c) + '"/>';
        if (s.showVal) for (const [X, Y, v] of ptsXY) svg += T(X, Y - 7, fmtVal(v, s.fmt), 'text-anchor="middle"');
      });
    }
  }
  return svg + '</svg>';
}

/* ── pages ── */

/* The report as pages: each block goes to the page Word laid it on.
   A paragraph that Word split across two pages is drawn in two parts; a
   table is split between its rows, repeating its header rows. */
function pageGroups(doc) {
  const groups = [];
  const at = (page, sec) => {
    let g = groups[groups.length - 1];
    if (!g || (doc.hasPages && g.page !== page) || g.sec !== sec) { g = { page, sec, items: [] }; groups.push(g); }
    return g;
  };
  let lastPage = 1, lastSec = 0;
  for (const b of doc.blocks) {
    if (b.t === 'p') {
      const p = b.p;
      const cuts = [0, ...(p.breaks || []), p.text.length];
      const n = cuts.length - 1;
      for (let k = 0; k < n; k++) {
        if (k > 0 && cuts[k] === cuts[k + 1] && !p.runs.some(r => r.img && r.s === cuts[k])) continue;
        at(p.page + k, p.sec).items.push({ t: 'p', p, a: cuts[k], b: cuts[k + 1], cont: k > 0, more: k < n - 1 });
      }
      lastPage = p.page + n - 1; lastSec = p.sec;
    } else if (b.t === 'tbl') {
      const hdr = [];
      for (let ri = 0; ri < b.rows.length && b.rows[ri].hdr; ri++) hdr.push(ri);
      let cur = null, curPage = null;
      b.rows.forEach((r, ri) => {
        const ps = r.map(c => firstPara({ t: 'tbl', rows: [[c]] })).filter(Boolean);
        const pg = ps.length ? Math.min(...ps.map(p => p.page)) : (curPage ?? lastPage);
        const sec = ps.length ? ps[0].sec : lastSec;
        if (!cur || (doc.hasPages && pg !== curPage)) {
          cur = { t: 'tbl', T: b, rows: cur ? hdr.filter(h => h < ri) : [] };
          at(pg, sec).items.push(cur);
          curPage = pg; lastSec = sec;
        }
        cur.rows.push(ri);
        const lp = Math.max(...ps.map(p => p.page + (p.breaks || []).length), pg);
        lastPage = lp;
      });
    } else at(lastPage, lastSec).items.push({ t: 'blk', b });
  }
  if (!groups.length) groups.push({ page: 1, sec: 0, items: [] });
  return groups;
}

let CUR_BYPARA = new Map();
function sheetBody(doc, g, byPara) {
  let h = '';
  g.items.forEach((it, k) => {
    if (it.t === 'p') {
      const prev = g.items[k - 1], next = g.items[k + 1];
      const same = x => x && x.t === 'p' && x.p.sid === it.p.sid;
      const cs = it.p.pp && it.p.pp.ctxSp;
      /* Word drops the space before a paragraph at the top of a page,
         unless the page was started on purpose (page break, new section) */
      const topSoft = k === 0 && !it.cont && it.p.topSoft;
      h += paraHtml(doc, it.p, byPara.get(it.p.idx) || [], { a: it.a, b: it.b, cont: it.cont, more: it.more, noB: (cs && same(prev)) || topSoft, noA: cs && same(next) });
    } else if (it.t === 'tbl') h += tableHtml(doc, it.T, byPara, it.rows);
    else h += blocksHtml(doc, [it.b], byPara);
  });
  return h;
}

export function renderWord(el, doc, byPara, pageLbl, brk) {
  CUR_BYPARA = byPara;
  BRK = brk || 'win';
  const groups = pageGroups(doc);
  let maxW = 0;
  let h = '<div class="rc-pages">';
  for (const g of groups) {
    const s = (doc.secs && doc.secs[g.sec]) || { pg: doc.pg };
    G = geom(s.pg);
    maxW = Math.max(maxW, G.w);
    h += '<div class="rc-sheet-lbl"></div><section class="rc-sheet word" data-sec="' + g.sec + '" data-ch="' + G.ch.toFixed(1) + '" style="width:' + G.w.toFixed(1) + 'px;min-height:' + G.h.toFixed(1) +
      'px;padding:' + [G.t, G.r, G.b, G.l].map(v => v.toFixed(1) + 'px').join(' ') + ';contain-intrinsic-size:auto ' + G.h.toFixed(0) + 'px">' +
      '<div class="rc-hf rc-hdr" style="top:' + G.hd.toFixed(1) + 'px;left:' + G.l.toFixed(1) + 'px;right:' + G.r.toFixed(1) + 'px"></div>' +
      '<div class="rc-sbd">' + sheetBody(doc, g, byPara) + '</div>' +
      '<div class="rc-hf rc-ftr" style="bottom:' + G.ft.toFixed(1) + 'px;left:' + G.l.toFixed(1) + 'px;right:' + G.r.toFixed(1) + 'px"></div></section>';
  }
  el.innerHTML = h + '</div>';
  const pages = el.querySelector('.rc-pages');
  pages.style.width = maxW.toFixed(0) + 'px';
  pages.classList.toggle('brk-mac', BRK === 'mac');
  pages.classList.add('rc-measure');
  try {
    layoutTabs(pages);
    if (!doc.hasLR) paginate(pages);
    fillHeaders(pages, doc, pageLbl);
  } catch (e) { console.error(e); }
  pages.classList.remove('rc-measure');
  return maxW;
}

/* Tab stops: each tab is an empty inline box sized to reach the next stop.
   Measured after layout, one tab per paragraph per round. */
function layoutTabs(root) {
  const ps = [...root.querySelectorAll('.rc-wp[data-ts]')];
  if (!ps.length) return;
  const items = ps.map(p => ({
    p, tabs: [...p.querySelectorAll('.rc-tab')].filter(t => t.closest('.rc-wp') === p), end: [...p.querySelectorAll('.rc-end')].find(t => t.closest('.rc-wp') === p),
    stops: (p.dataset.ts || '').split(',').filter(Boolean).map(s => { const [pos, val, leader] = s.split(':'); return { pos: +pos, val, leader }; }),
    dt: +p.dataset.dt || 48, hang: p.dataset.hang != null ? +p.dataset.hang : null, ml: +(p.dataset.ml || 0),
  }));
  for (let round = 0; round < 30; round++) {
    const work = items.filter(it => it.tabs[round]);
    if (!work.length) break;
    const res = work.map(it => {
      const t = it.tabs[round];
      const pr = it.p.getBoundingClientRect();
      const x0 = pr.left - it.ml;
      const tr = t.getBoundingClientRect();
      const x = tr.left - x0;
      const nx = it.tabs[round + 1] || it.end;
      const nr = nx ? nx.getBoundingClientRect() : null;
      const segW = nr && Math.abs(nr.top - tr.top) < 3 ? Math.max(0, nr.left - tr.right) : 0;
      let stop = null;
      for (const s of it.stops) if (s.pos > x + 0.5 && s.val !== 'bar') { stop = s; break; }
      if (it.hang != null && x < it.hang - 0.5 && (!stop || it.hang < stop.pos)) stop = { pos: it.hang, val: 'left' };
      if (!stop) {
        const last = it.stops.length ? it.stops[it.stops.length - 1].pos : 0;
        let q = Math.floor(Math.max(x, last) / it.dt + 1) * it.dt;
        if (q - x < 0.5) q += it.dt;
        stop = { pos: q, val: 'left' };
      }
      let w = stop.pos - x;
      if (stop.val === 'right' || stop.val === 'end' || stop.val === 'decimal') w -= segW + 0.6; // a hair short, so rounding cannot wrap the line
      else if (stop.val === 'center') w -= segW / 2 + 0.3;
      const maxW = pr.width - (tr.left - pr.left) - 1;
      return [t, Math.max(0, Math.min(w, Math.max(0, maxW))), stop.leader];
    });
    for (const [t, w, ld] of res) { t.style.width = w.toFixed(1) + 'px'; if (ld && ld !== 'none') t.classList.add('ld-' + ld); }
  }
}

/* For files Word did not save page breaks in: split the pages by height.
   Everything is measured once, then moved; tables split between rows and
   repeat their header rows. */
function paginate(root) {
  for (const sheet of [...root.querySelectorAll('.rc-sheet.word')]) {
    const body = sheet.querySelector('.rc-sbd');
    const limit = +sheet.dataset.ch;
    const b0 = body.getBoundingClientRect();
    if (b0.height <= limit + 1) continue;
    const top0 = b0.top;
    const pages = [[]];
    let start = 0;
    const page = () => pages[pages.length - 1];
    for (const c of [...body.children]) {
      const r = c.getBoundingClientRect();
      if (r.bottom - top0 - start <= limit + 0.5) { page().push(c); continue; }
      const tbl = c.classList.contains('rc-tblwrap') && c.querySelector('table');
      if (tbl) {
        const rows = [...tbl.rows];
        const hdr = rows.filter(tr => tr.dataset.hdr);
        const hdrH = hdr.reduce((x, h) => x + h.getBoundingClientRect().height, 0);
        let chunk = [], first = true;
        for (const tr of rows) {
          const rr = tr.getBoundingClientRect();
          const real = chunk.some(x => !x.dataset.hdr);
          if (!tr.dataset.hdr && rr.bottom - top0 - start > limit + 0.5 && (real || page().length)) {
            if (real) { page().push({ tbl: c, rows: chunk, first }); first = false; chunk = [...hdr]; }
            pages.push([]);
            start = rr.top - top0 - (chunk.length ? hdrH : 0); // repeated header rows sit above
          }
          chunk.push(tr);
        }
        if (chunk.length) page().push({ tbl: c, rows: chunk, first });
        continue;
      }
      if (page().length) { pages.push([]); start = r.top - top0; }
      page().push(c);
    }
    if (pages.length < 2) continue;
    /* first page keeps its nodes; later pages get new sheets */
    let prev = sheet;
    pages.forEach((items, k) => {
      let target = body;
      if (k > 0) {
        const ns = sheet.cloneNode(false);
        for (const c of sheet.children) ns.appendChild(c.cloneNode(false));
        const lbl = document.createElement('div');
        lbl.className = 'rc-sheet-lbl';
        prev.after(lbl);
        lbl.after(ns);
        prev = ns;
        target = ns.querySelector('.rc-sbd');
      }
      for (const it of items) {
        if (it.tbl) {
          if (it.first) { if (k > 0) target.appendChild(it.tbl); continue; }
          const t0 = it.tbl.querySelector('table');
          const wrap = it.tbl.cloneNode(false), t2 = t0.cloneNode(false);
          const cg = t0.querySelector('colgroup');
          if (cg) t2.appendChild(cg.cloneNode(true));
          const tb = document.createElement('tbody');
          for (const tr of it.rows) tb.appendChild(tr.dataset.hdr ? tr.cloneNode(true) : tr);
          t2.appendChild(tb);
          wrap.appendChild(t2);
          target.appendChild(wrap);
        } else if (k > 0) {
          if (!target.firstChild && it.classList.contains('rc-wp')) it.style.marginTop = '0'; // Word drops it at the top of a page
          target.appendChild(it);
        }
      }
    });
  }
}

/* Headers and footers with page numbers; page labels */
function fillHeaders(root, doc, pageLbl) {
  const sheets = [...root.querySelectorAll('.rc-sheet.word')];
  let n = 0, prev = -1;
  const empty = new Map();
  sheets.forEach((sh, i) => {
    const si = +sh.dataset.sec;
    const s = (doc.secs && doc.secs[si]) || { hdr: {}, ftr: {}, pg: doc.pg };
    const first = si !== prev;
    n = first && s.numStart != null ? s.numStart : n + 1;
    prev = si;
    const kind = first && s.titlePg ? 'first' : doc.evenOdd && n % 2 === 0 ? 'even' : 'default';
    G = geom(s.pg);
    PAGE = { n: fmtNum(n, s.numFmt || 'decimal'), total: sheets.length };
    const hb = s.hdr ? s.hdr[kind] : null, fb = s.ftr ? s.ftr[kind] : null;
    const hd = sh.querySelector('.rc-hdr'), ft = sh.querySelector('.rc-ftr');
    if (hd && hb && hb.length) hd.innerHTML = blocksHtml(doc, hb, empty);
    if (ft && fb && fb.length) ft.innerHTML = blocksHtml(doc, fb, empty);
    if (hd && hd.children.length) layoutTabs(hd);
    if (ft && ft.children.length) layoutTabs(ft);
    /* a tall header pushes the text down, as in Word */
    if (hd && hd.offsetHeight && G.hd + hd.offsetHeight > G.t) sh.style.paddingTop = (G.hd + hd.offsetHeight).toFixed(1) + 'px';
    const lbl = sh.previousElementSibling;
    if (lbl && lbl.classList.contains('rc-sheet-lbl')) lbl.textContent = pageLbl + ' ' + (i + 1);
    sh.dataset.pg = i + 1;
  });
}

export function renderPlain(el, doc, byPara) {
  let h = '<div class="rc-pages" style="width:794px"><section class="rc-sheet plain">';
  doc.paras.forEach((p, pi) => {
    const spans = spansOf(byPara.get(pi) || []);
    const cuts = new Set([0, p.text.length]);
    for (const [s, e] of spans) { cuts.add(s); cuts.add(e); }
    const pts = [...cuts].filter(c => c >= 0 && c <= p.text.length).sort((a, b) => a - b);
    let body = '';
    for (let k = 0; k + 1 < pts.length; k++) {
      const seg = p.text.slice(pts[k], pts[k + 1]);
      const iss = issuesAt(spans, pts[k], pts[k + 1]);
      body += iss.length ? markOpen(iss) + (/^[\s\u200B-\u200D\u2060\uFEFF]+$/.test(seg) ? showWs(seg) : esc(seg)) + '</mark>' : esc(seg);
    }
    h += '<p class="rc-wp plain" id="rc-p-' + pi + '">' + body + '</p>';
  });
  el.innerHTML = h + '</section></div>';
  return 794;
}

/* ── PDF ── */

function rects(doc, p, issue) {
  const out = [];
  for (const [r0, r1] of issue.ranges) {
    for (const g of p.geo || []) {
      const a = Math.max(r0, g.s), b = Math.min(r1, g.e);
      if (a >= b) continue;
      const tf = doc.sizes[p.page - 1].tf;
      const len = g.e - g.s || 1;
      const x0 = g.x + g.w * (a - g.s) / len, x1 = g.x + g.w * (b - g.s) / len;
      const y0 = g.y - 0.22 * g.size, y1 = g.y + 0.92 * g.size;
      const P = (x, y) => [tf[0] * x + tf[2] * y + tf[4], tf[1] * x + tf[3] * y + tf[5]];
      const [ax, ay] = P(x0, y0), [bx, by] = P(x1, y1);
      out.push([Math.min(ax, bx), Math.min(ay, by), Math.max(4, Math.abs(bx - ax)), Math.abs(by - ay)]);
    }
  }
  return out;
}

export function renderPdf(el, doc, byPara, cache, pageLbl) {
  const hl = new Map();
  byPara.forEach((issues, pi) => {
    const p = doc.paras[pi];
    for (const i of issues) for (const r of rects(doc, p, i)) {
      if (!hl.has(p.page)) hl.set(p.page, []);
      hl.get(p.page).push('<div class="rc-hl sev-' + i.sev + '" data-i="' + i.id + '" data-is="' + i.id + '" style="left:' + r[0].toFixed(1) +
        'px;top:' + r[1].toFixed(1) + 'px;width:' + r[2].toFixed(1) + 'px;height:' + r[3].toFixed(1) + 'px"></div>');
    }
  });
  const maxW = Math.max(...doc.sizes.map(s => s.w));
  let h = '<div class="rc-pages" style="width:' + maxW.toFixed(0) + 'px">';
  doc.sizes.forEach((s, k) => {
    const n = k + 1;
    h += '<div class="rc-sheet-lbl">' + esc(pageLbl) + ' ' + n + '</div>' +
      '<section class="rc-sheet pdf" data-pg="' + n + '" style="width:' + s.w.toFixed(0) + 'px;height:' + s.h.toFixed(0) + 'px">' +
      (cache.has(n) ? '<img class="rc-pdfimg" src="' + cache.get(n) + '" alt="">' : '') + (hl.get(n) || []).join('') + '</section>';
  });
  el.innerHTML = h + '</div>';
  watchPdf(el, doc, cache);
  return maxW;
}

/* Render page images only as they scroll near, one at a time; the images
   are kept (as compressed blobs) so re-filtering does not redraw them. */
let observer = null;
const queue = [];
let busy = false;
function watchPdf(el, doc, cache) {
  if (observer) observer.disconnect();
  queue.length = 0;
  observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const n = +e.target.dataset.pg;
      if (!cache.has(n) && !queue.includes(n)) queue.push(n);
    }
    pump(el, doc, cache);
  }, { root: el, rootMargin: '1200px 0px' });
  el.querySelectorAll('.rc-sheet.pdf').forEach(s => { if (!cache.has(+s.dataset.pg)) observer.observe(s); });
}
async function pump(el, doc, cache) {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const n = queue.shift();
      if (cache.has(n)) continue;
      const page = await doc.pdf.getPage(n);
      const scale = 4 / 3 * Math.min(2, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      const c2 = canvas.getContext('2d');
      c2.fillStyle = '#fff'; c2.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: c2, viewport: vp }).promise;
      page.cleanup();
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
      canvas.width = canvas.height = 0;
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      cache.set(n, url);
      const sheet = el.querySelector('.rc-sheet.pdf[data-pg="' + n + '"]');
      if (sheet && !sheet.querySelector('.rc-pdfimg')) {
        const img = document.createElement('img');
        img.className = 'rc-pdfimg'; img.alt = ''; img.src = url;
        sheet.prepend(img);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    busy = false;
  }
}
export function stopPdf() { if (observer) observer.disconnect(); observer = null; queue.length = 0; }
