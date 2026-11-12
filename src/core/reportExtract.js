/**
 * reportExtract.js — turn a Word (.docx), PDF or pasted text into the
 * paragraph list that reportCheck.js reads, plus what the viewer needs to
 * show the report the way it looks in Word / on the PDF page.
 *
 * .docx is a zip; it is opened with SheetJS's zip reader (XLSX.CFB, already
 * loaded for Excel), so no extra library. PDF text and page images come from
 * pdf.js, loaded only when a PDF is opened.
 *
 * Every Para has `text` (what the checks read). Word paragraphs also carry
 * `runs` (formatting spans over text offsets), `pp` (paragraph layout) and a
 * numbering `label`; PDF paragraphs carry `geo` (where each piece of text sits
 * on its page).
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';

/* ── small XML helpers ──────────────────────────────────────────────────── */

const at = (el, n) => (el ? (el.getAttributeNS(W, n) ?? el.getAttribute('w:' + n)) : null);
function kid(el, name) {
  if (!el) return null;
  for (const c of el.children) if (c.localName === name && c.namespaceURI === W) return c;
  return null;
}
const kids = (el, name) => (el ? [...el.children].filter(c => c.localName === name && c.namespaceURI === W) : []);
function onOff(el) {
  const v = at(el, 'val');
  return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
}
const onAttr = v => v === '1' || v === 'true' || v === 'on';
const num = v => (v == null || v === '' ? undefined : +v);
const parseXml = s => new DOMParser().parseFromString(s, 'application/xml');
/* any-namespace lookups, for DrawingML, VML and charts */
const lk = (el, n) => (el ? [...el.children].find(c => c.localName === n) || null : null);
const lks = (el, n) => (el ? [...el.children].filter(c => c.localName === n) : []);
const ld = (el, n) => (el ? el.getElementsByTagNameNS('*', n)[0] || null : null);
const emu = v => (+v || 0) / 9525; // EMU → CSS px
const rid = el => el && (el.getAttributeNS(R, 'id') || el.getAttribute('r:id') || el.getAttributeNS(R, 'embed') || el.getAttribute('r:embed'));

function mergeTabs(a = [], b = []) {
  const m = new Map(a.map(t => [t.pos, t]));
  for (const t of b) { if (t.val === 'clear') m.delete(t.pos); else m.set(t.pos, t); }
  return [...m.values()].sort((x, y) => x.pos - y.pos);
}
/* Merge two property bags; keys that are undefined in `b` keep `a`'s value */
function merge(a, b) {
  a = a || {}; b = b || {};
  const o = { ...a };
  for (const k in b) if (b[k] !== undefined) o[k] = b[k];
  if (b.first !== undefined) delete o.hang;
  if (b.hang !== undefined) delete o.first;
  if (b.tabs) o.tabs = mergeTabs(a.tabs, b.tabs);
  if (b.borders) o.borders = { ...(a.borders || {}), ...b.borders };
  if (b.mar) o.mar = { ...(a.mar || {}), ...b.mar };
  delete o.__k;
  return o;
}

function parsePPr(pPr) {
  const o = {};
  if (!pPr) return o;
  const jc = kid(pPr, 'jc'); if (jc) o.jc = at(jc, 'val');
  const ind = kid(pPr, 'ind');
  if (ind) {
    o.indL = num(at(ind, 'left') ?? at(ind, 'start'));
    o.indR = num(at(ind, 'right') ?? at(ind, 'end'));
    o.first = num(at(ind, 'firstLine'));
    o.hang = num(at(ind, 'hanging'));
  }
  const sp = kid(pPr, 'spacing');
  if (sp) {
    o.spB = num(at(sp, 'before')); o.spA = num(at(sp, 'after'));
    const bl = num(at(sp, 'beforeLines')), al = num(at(sp, 'afterLines'));
    if (bl !== undefined) o.spB = bl * 2.4; // 1/100 of a 12pt line
    if (al !== undefined) o.spA = al * 2.4;
    if (onAttr(at(sp, 'beforeAutospacing'))) o.spB = 280;
    if (onAttr(at(sp, 'afterAutospacing'))) o.spA = 280;
    o.line = num(at(sp, 'line')); if (o.line !== undefined) o.lineRule = at(sp, 'lineRule') || 'auto';
  }
  const cs = kid(pPr, 'contextualSpacing'); if (cs) o.ctxSp = onOff(cs);
  const sg = kid(pPr, 'snapToGrid'); if (sg) o.snap = onOff(sg);
  const tabs = kid(pPr, 'tabs');
  if (tabs) o.tabs = kids(tabs, 'tab').map(t => ({ val: at(t, 'val') || 'left', pos: +at(t, 'pos') || 0, leader: at(t, 'leader') }));
  const ol = kid(pPr, 'outlineLvl'); if (ol) o.outline = +at(ol, 'val');
  const np = kid(pPr, 'numPr');
  if (np) { const id = kid(np, 'numId'), lv = kid(np, 'ilvl'); if (id) o.numId = at(id, 'val'); if (lv) o.ilvl = +at(lv, 'val'); }
  const pb = kid(pPr, 'pageBreakBefore'); if (pb) o.pbb = onOff(pb);
  const shd = kid(pPr, 'shd'); if (shd) { const f = at(shd, 'fill'); if (f && f !== 'auto') o.fill = f; }
  const bd = kid(pPr, 'pBdr'); if (bd) o.borders = parseBorders(bd);
  return o;
}

function parseRPr(rPr) {
  const o = {};
  if (!rPr) return o;
  for (const n of ['b', 'bCs', 'i', 'iCs', 'strike', 'dstrike', 'vanish', 'caps', 'smallCaps', 'cs', 'rtl']) {
    const e = kid(rPr, n); if (e) o[n] = onOff(e);
  }
  const u = kid(rPr, 'u'); if (u) o.u = (at(u, 'val') || 'single') !== 'none';
  const sz = kid(rPr, 'sz'); if (sz) o.sz = +at(sz, 'val');
  const szc = kid(rPr, 'szCs'); if (szc) o.szCs = +at(szc, 'val');
  const va = kid(rPr, 'vertAlign'); if (va) o.vert = at(va, 'val');
  const col = kid(rPr, 'color'); if (col) { const v = at(col, 'val'); if (v && v !== 'auto') o.color = v; }
  const hl = kid(rPr, 'highlight'); if (hl) o.hl = at(hl, 'val');
  const shd = kid(rPr, 'shd'); if (shd) { const f = at(shd, 'fill'); if (f && f !== 'auto') o.shd = f; }
  const spc = kid(rPr, 'spacing'); if (spc) o.csp = +at(spc, 'val') || 0;
  const wsc = kid(rPr, 'w'); if (wsc) o.wsc = +at(wsc, 'val') || 100;
  const rf = kid(rPr, 'rFonts');
  if (rf) {
    const a = at(rf, 'ascii') || at(rf, 'hAnsi'), c = at(rf, 'cs');
    if (a) o.fA = a; if (c) o.fC = c;
    const aT = at(rf, 'asciiTheme') || at(rf, 'hAnsiTheme'), cT = at(rf, 'cstheme');
    if (aT && !a) o.fAT = aT; if (cT && !c) o.fCT = cT;
    const h = at(rf, 'hint'); if (h) o.hint = h;
  }
  const rs = kid(rPr, 'rStyle'); if (rs) o.rStyle = at(rs, 'val');
  return o;
}

/* Borders: { top, left, bottom, right, insideH, insideV } of { val, sz, color } */
function parseBorders(el) {
  if (!el) return null;
  const o = {};
  for (const c of el.children) {
    if (c.namespaceURI !== W) continue;
    const n = { start: 'left', end: 'right' }[c.localName] || c.localName;
    o[n] = { val: at(c, 'val') || 'single', sz: +(at(c, 'sz') || 4), color: at(c, 'color') };
  }
  return o;
}
function parseMar(el) {
  if (!el) return null;
  const o = {};
  for (const c of el.children) {
    if (c.namespaceURI !== W) continue;
    const n = { start: 'left', end: 'right' }[c.localName] || c.localName;
    const w = +at(c, 'w');
    if (!isNaN(w) && (at(c, 'type') || 'dxa') === 'dxa') o[n] = w;
  }
  return o;
}
function parseTblPr(el) {
  if (!el) return {};
  const tw = kid(el, 'tblW');
  return {
    style: at(kid(el, 'tblStyle'), 'val') || undefined, borders: parseBorders(kid(el, 'tblBorders')) || undefined,
    mar: parseMar(kid(el, 'tblCellMar')) || undefined, ind: num(at(kid(el, 'tblInd'), 'w')), jc: at(kid(el, 'jc'), 'val') || undefined,
    tw: tw ? { type: at(tw, 'type'), w: at(tw, 'w') } : undefined,
  };
}

/* ── styles, numbering, theme ───────────────────────────────────────────── */

function loadStyles(xml) {
  const S = { byId: {}, defP: {}, defR: {}, normal: null, tableNormal: null, memo: {} };
  if (!xml) return S;
  const d = parseXml(xml);
  const dd = d.getElementsByTagNameNS(W, 'docDefaults')[0];
  if (dd) {
    const rp = dd.getElementsByTagNameNS(W, 'rPrDefault')[0];
    const pp = dd.getElementsByTagNameNS(W, 'pPrDefault')[0];
    if (rp) S.defR = parseRPr(kid(rp, 'rPr'));
    if (pp) S.defP = parsePPr(kid(pp, 'pPr'));
  }
  for (const st of d.getElementsByTagNameNS(W, 'style')) {
    const id = at(st, 'styleId');
    const s = {
      type: at(st, 'type'), name: (at(kid(st, 'name'), 'val') || id || '').toLowerCase(),
      based: at(kid(st, 'basedOn'), 'val'), pPr: parsePPr(kid(st, 'pPr')), rPr: parseRPr(kid(st, 'rPr')),
      tbl: parseTblPr(kid(st, 'tblPr')),
    };
    S.byId[id] = s;
    if (at(st, 'default') === '1' && s.type === 'paragraph') S.normal = id;
    if (at(st, 'default') === '1' && s.type === 'table') S.tableNormal = id;
  }
  return S;
}
function styleChain(S, id, depth = 0) {
  if (!id || !S.byId[id] || depth > 20) return { pPr: {}, rPr: {}, tbl: {} };
  if (S.memo[id]) return S.memo[id];
  const st = S.byId[id];
  const base = styleChain(S, st.based, depth + 1);
  return (S.memo[id] = { pPr: merge(base.pPr, st.pPr), rPr: merge(base.rPr, st.rPr), tbl: merge(base.tbl, st.tbl) });
}

function loadNumbering(xml) {
  const N = { abs: {}, num: {} };
  if (!xml) return N;
  const d = parseXml(xml);
  for (const an of d.getElementsByTagNameNS(W, 'abstractNum')) {
    const lv = {};
    for (const l of kids(an, 'lvl')) {
      lv[+at(l, 'ilvl')] = {
        fmt: at(kid(l, 'numFmt'), 'val') || 'decimal', text: at(kid(l, 'lvlText'), 'val') ?? '',
        start: +(at(kid(l, 'start'), 'val') ?? 1), pPr: parsePPr(kid(l, 'pPr')), rPr: parseRPr(kid(l, 'rPr')),
        suff: at(kid(l, 'suff'), 'val') || 'tab',
      };
    }
    N.abs[at(an, 'abstractNumId')] = { lv };
  }
  for (const n of d.getElementsByTagNameNS(W, 'num')) {
    const ov = {};
    for (const o of kids(n, 'lvlOverride')) { const so = kid(o, 'startOverride'); if (so) ov[+at(o, 'ilvl')] = +at(so, 'val'); }
    N.num[at(n, 'numId')] = { abs: at(kid(n, 'abstractNumId'), 'val'), ov, used: {} };
  }
  return N;
}

const THAI_LETTERS = 'กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ';
function roman(n) {
  const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s;
}
export function fmtNum(n, fmt) {
  switch (fmt) {
    case 'decimalZero': return n < 10 ? '0' + n : String(n);
    case 'upperRoman': return roman(n);
    case 'lowerRoman': return roman(n).toLowerCase();
    case 'upperLetter': return String.fromCharCode(65 + (n - 1) % 26).repeat(Math.floor((n - 1) / 26) + 1);
    case 'lowerLetter': return String.fromCharCode(97 + (n - 1) % 26).repeat(Math.floor((n - 1) / 26) + 1);
    case 'thaiLetters': return THAI_LETTERS[(n - 1) % THAI_LETTERS.length];
    case 'thaiNumbers': case 'thaiCounting': return String(n).replace(/\d/g, d => String.fromCharCode(0x0E50 + +d));
    case 'numberInDash': return '- ' + n + ' -';
    case 'none': return '';
    default: return String(n);
  }
}
/* Bullets are usually Symbol/Wingdings glyphs in the private-use area */
const BULLET = { 0xB7: '•', 0xA7: '▪', 0xD8: '➢', 0xFC: '✓', 0x76: '❖', 0x6E: '■', 0x71: '❑', 0x6C: '●', 0x9F: '•', 0xA8: '◆', 0xE0: '→', 0xE8: '➔', 0x6F: '□', 0xFE: '☑' };
function bullet(t) {
  if (!t) return '•';
  const c = t.charCodeAt(0);
  if (c >= 0xF000 && c <= 0xF0FF) return BULLET[c & 0xFF] || '•';
  if (t === 'o') return '◦';
  return t;
}
function numLabel(N, cnt, numId, ilvl) {
  const n = N.num[numId]; if (!n) return null;
  const an = N.abs[n.abs]; if (!an) return null;
  const lv = an.lv[ilvl]; if (!lv) return null;
  const c = cnt[n.abs] || (cnt[n.abs] = []);
  if (n.ov[ilvl] != null && !n.used[ilvl]) { c[ilvl] = n.ov[ilvl] - 1; n.used[ilvl] = true; }
  c[ilvl] = (c[ilvl] ?? lv.start - 1) + 1;
  for (let j = ilvl + 1; j < 9; j++) c[j] = undefined;
  if (lv.fmt === 'bullet') return { text: bullet(lv.text), lv };
  const text = lv.text.replace(/%(\d)/g, (_, k) => {
    const L = +k - 1, l2 = an.lv[L] || lv;
    return fmtNum(c[L] ?? l2.start, l2.fmt);
  });
  return { text, lv };
}

const OFFICE_COLORS = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
function loadTheme(xml) {
  const T = { minor: {}, major: {}, colors: { ...OFFICE_COLORS } };
  if (!xml) return T;
  const d = parseXml(xml);
  for (const k of ['minor', 'major']) {
    const f = d.getElementsByTagNameNS(A, k + 'Font')[0];
    if (!f) continue;
    const latin = f.getElementsByTagNameNS(A, 'latin')[0];
    T[k].latin = latin && latin.getAttribute('typeface');
    for (const s of f.getElementsByTagNameNS(A, 'font')) if (s.getAttribute('script') === 'Thai') T[k].thai = s.getAttribute('typeface');
    const cs = f.getElementsByTagNameNS(A, 'cs')[0];
    if (!T[k].thai && cs && cs.getAttribute('typeface')) T[k].thai = cs.getAttribute('typeface');
  }
  const cs = d.getElementsByTagNameNS(A, 'clrScheme')[0];
  if (cs) for (const c of cs.children) {
    const s = lk(c, 'srgbClr'), y = lk(c, 'sysClr');
    const v = (s && s.getAttribute('val')) || (y && (y.getAttribute('lastClr') || (y.getAttribute('val') === 'window' ? 'FFFFFF' : '000000')));
    if (v) T.colors[c.localName] = v;
  }
  return T;
}

/* DrawingML colour (a solidFill, a style ref, a gradient stop …) → "#rrggbb" */
const PRESET = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080' };
function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function rgb(h, s, l) {
  if (!s) return [l, l, l].map(v => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255));
}
function dmlColor(el, theme) {
  if (!el) return null;
  const c = [...el.children].find(x => /^(srgbClr|schemeClr|sysClr|prstClr|scrgbClr)$/.test(x.localName));
  if (!c) return null;
  const v = c.getAttribute('val');
  let hex;
  if (c.localName === 'srgbClr') hex = v;
  else if (c.localName === 'sysClr') hex = c.getAttribute('lastClr') || (v === 'window' ? 'FFFFFF' : '000000');
  else if (c.localName === 'prstClr') hex = PRESET[v] || '000000';
  else if (c.localName === 'schemeClr') hex = theme.colors[{ bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }[v] || v] || '000000';
  else return null;
  if (!/^[0-9a-f]{6}$/i.test(hex || '')) return null;
  let [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (const m of c.children) {
    const k = +m.getAttribute('val') / 100000;
    if (m.localName === 'lumMod' || m.localName === 'lumOff') {
      const [h, s, l] = hsl(r, g, b);
      [r, g, b] = rgb(h, s, Math.min(1, Math.max(0, m.localName === 'lumMod' ? l * k : l + k)));
    } else if (m.localName === 'shade') [r, g, b] = [r, g, b].map(x => Math.round(x * k));
    else if (m.localName === 'tint') [r, g, b] = [r, g, b].map(x => Math.round(x + (255 - x) * (1 - k)));
  }
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/* Chart part → { title, plots:[{ type, dir, grouping, series }], axes, legend } */
function parseChart(d, theme) {
  const chart = ld(d, 'chart');
  const txt = el => (el ? [...el.getElementsByTagNameNS(A, 't')].map(t => t.textContent).join('') : '');
  const val = (el, n) => { const e = lk(el, n); return e ? e.getAttribute('val') : null; };
  const col = el => dmlColor(el, theme);
  const ptsFrom = (c, n) => {
    const a = new Array(Math.min(n || 0, 5000)).fill('');
    for (const p of lks(c, 'pt')) { const i = +p.getAttribute('idx'); const v = lk(p, 'v'); if (i < 5000) a[i] = v ? v.textContent : ''; }
    return a;
  };
  const pts = el => {
    if (!el) return [];
    const ml = ld(el, 'multiLvlStrCache');
    if (ml) return ptsFrom(lk(ml, 'lvl'), +val(ml, 'ptCount'));
    const c = ld(el, 'strCache') || ld(el, 'numCache') || ld(el, 'strLit') || ld(el, 'numLit');
    if (!c) { const v = ld(el, 'v'); return v ? [v.textContent] : []; }
    return ptsFrom(c, +val(c, 'ptCount'));
  };
  const fmtOf = el => { const c = el && (ld(el, 'numCache') || ld(el, 'numLit')); const f = c && lk(c, 'formatCode'); return f ? f.textContent : null; };
  const plots = [];
  const pa = lk(chart, 'plotArea');
  let k = 0;
  for (const p of pa ? pa.children : []) {
    const m = /^(bar|bar3D|line|line3D|pie|pie3D|doughnut|area|area3D|scatter|radar|ofPie|bubble)Chart$/.exec(p.localName);
    if (!m) continue;
    const type = { bar3D: 'bar', line3D: 'line', pie3D: 'pie', area3D: 'area', ofPie: 'pie', bubble: 'scatter' }[m[1]] || m[1];
    const dl0 = lk(p, 'dLbls');
    const series = lks(p, 'ser').map(s => {
      const sp = lk(s, 'spPr');
      const ln = lk(sp, 'ln');
      const sdl = lk(s, 'dLbls') || dl0;
      const mk = lk(s, 'marker');
      const vEl = lk(s, 'val') || lk(s, 'yVal');
      return {
        name: pts(lk(s, 'tx'))[0] || '', cats: pts(lk(s, 'cat') || lk(s, 'xVal')),
        vals: pts(vEl).map(v => (v === '' || v == null ? null : +v)), fmt: fmtOf(vEl),
        fill: col(lk(sp, 'solidFill')), line: col(lk(ln, 'solidFill')), noLine: !!lk(ln, 'noFill'), noFill: !!lk(sp, 'noFill'),
        lineW: ln && ln.getAttribute('w') ? emu(ln.getAttribute('w')) : null,
        marker: mk ? val(mk, 'symbol') : null, mfill: col(lk(lk(mk, 'spPr'), 'solidFill')),
        idx: +(val(s, 'idx') ?? k), pts: lks(s, 'dPt').map(dp => ({ i: +val(dp, 'idx'), fill: col(lk(lk(dp, 'spPr'), 'solidFill')) })),
        showVal: sdl ? val(sdl, 'showVal') === '1' : false, showPct: sdl ? val(sdl, 'showPercent') === '1' : false,
        showCat: sdl ? val(sdl, 'showCatName') === '1' : false,
      };
    });
    k += series.length;
    plots.push({
      type, dir: val(p, 'barDir') || 'col', grouping: val(p, 'grouping') || 'clustered', series,
      hole: type === 'doughnut' ? +(val(p, 'holeSize') || 50) : 0, vary: val(p, 'varyColors') === '1',
      gap: +(val(p, 'gapWidth') ?? 150), overlap: +(val(p, 'overlap') ?? 0), scatter: val(p, 'scatterStyle'),
      axIds: lks(p, 'axId').map(a => a.getAttribute('val')),
    });
  }
  const axes = pa ? [...pa.children].filter(c => /Ax$/.test(c.localName)).map(a => {
    const sc = lk(a, 'scaling');
    const nf = lk(a, 'numFmt');
    return {
      id: val(a, 'axId'), kind: a.localName, pos: val(a, 'axPos'), del: val(a, 'delete') === '1', title: txt(lk(a, 'title')),
      min: num(val(sc, 'min')), max: num(val(sc, 'max')), grid: !!lk(a, 'majorGridlines'), fmt: nf ? nf.getAttribute('formatCode') : null,
      rev: val(sc, 'orientation') === 'maxMin', unit: num(val(a, 'majorUnit')),
    };
  }) : [];
  const t = lk(chart, 'title');
  let title = t ? txt(t) : '';
  if (t && !title) { const s = plots.flatMap(p => p.series); if (s.length === 1) title = s[0].name; }
  if (val(chart, 'autoTitleDeleted') === '1' && !t) title = '';
  const lg = lk(chart, 'legend');
  return { title, plots, axes, legend: lg ? (val(lg, 'legendPos') || 'r') : null, colors: theme.colors };
}

/* DrawingML text (SmartArt shapes, chart-like boxes) → [{ align, runs:[{ t, sz, b, i, color }] }] */
function dmlText(txBody, theme) {
  if (!txBody) return null;
  const out = [];
  for (const p of lks(txBody, 'p')) {
    const pPr = lk(p, 'pPr');
    const runs = [];
    for (const r of p.children) {
      if (r.localName !== 'r' && r.localName !== 'fld') continue;
      const rp = lk(r, 'rPr');
      const t = lk(r, 't');
      runs.push({ t: t ? t.textContent : '', sz: rp && rp.getAttribute('sz') ? +rp.getAttribute('sz') / 100 : null,
        b: rp && rp.getAttribute('b') === '1', i: rp && rp.getAttribute('i') === '1', color: dmlColor(lk(rp, 'solidFill'), theme) });
    }
    out.push({ align: pPr ? pPr.getAttribute('algn') : null, runs });
  }
  return out;
}

/* The page number printed on each physical page (1-based index), from
   each section's numbering start and format */
function pageLabels(paras, secs, n) {
  const first = {};
  const secOf = [];
  for (const p of paras) {
    if (typeof p.idx !== 'number') continue;
    if (first[p.sec] == null || p.page < first[p.sec]) first[p.sec] = p.page;
    for (let k = 0; k <= (p.breaks || []).length; k++) if (secOf[p.page + k] == null) secOf[p.page + k] = p.sec;
  }
  const out = [null];
  let num = 0, prev = -1;
  for (let pg = 1; pg <= n; pg++) {
    const si = secOf[pg] ?? prev;
    const s = secs[si] || {};
    num = si !== prev && first[si] === pg && s.numStart != null ? s.numStart : num + 1;
    prev = si;
    out.push(fmtNum(num, s.numFmt || 'decimal'));
  }
  return out;
}

const IMG_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };

/* ── Word ───────────────────────────────────────────────────────────────── */

export function extractDocx(buf) {
  const X = window.XLSX;
  if (!X || !X.CFB) throw new Error('nolib');
  let zip;
  try { zip = X.CFB.read(new Uint8Array(buf), { type: 'buffer' }); } catch (e) { throw new Error('notdocx'); }
  const bin = path => {
    const e = X.CFB.find(zip, '/' + path); // CFB paths are rooted ("/word/document.xml")
    if (!e || !e.content) return null;
    return e.content instanceof Uint8Array ? e.content : new Uint8Array(e.content);
  };
  const read = path => { const b = bin(path); return b ? new TextDecoder('utf-8').decode(b) : null; };
  const xml = read('word/document.xml');
  if (!xml) throw new Error('notdocx');

  const S = loadStyles(read('word/styles.xml'));
  const N = loadNumbering(read('word/numbering.xml'));
  const theme = loadTheme(read('word/theme/theme1.xml'));
  const color = el => dmlColor(el, theme);

  /* Relationships of a part ("word/document.xml" → word/_rels/document.xml.rels) */
  const relsOf = path => {
    const dir = path.replace(/[^/]+$/, ''), base = path.slice(dir.length);
    const x = read(dir + '_rels/' + base + '.rels');
    const m = {};
    if (x) for (const r of parseXml(x).getElementsByTagName('Relationship')) m[r.getAttribute('Id')] = { target: r.getAttribute('Target'), mode: r.getAttribute('TargetMode'), dir };
    return m;
  };
  let rels = relsOf('word/document.xml');
  const partPath = id => {
    const r = rels[id];
    if (!r || r.mode === 'External' || !r.target) return null;
    let path = r.target.startsWith('/') ? r.target.slice(1) : r.dir + r.target;
    while (/[^/]+\/\.\.\//.test(path)) path = path.replace(/[^/]+\/\.\.\//, '');
    return path;
  };

  const sx = read('word/settings.xml');
  const sd = sx ? parseXml(sx) : null;
  const defTab = (sd && +at(ld(sd, 'defaultTabStop'), 'val')) || 720;
  const evenOdd = !!(sd && ld(sd, 'evenAndOddHeaders') && onOff(ld(sd, 'evenAndOddHeaders')));

  const urls = [];
  const media = new Map();
  function image(id) {
    const path = partPath(id);
    if (!path) return null;
    if (media.has(path)) return media.get(path);
    const ext = (path.split('.').pop() || '').toLowerCase();
    const data = bin(path);
    let out = { url: null, kind: ext.toUpperCase() };
    if (data && IMG_TYPES[ext]) {
      out.url = URL.createObjectURL(new Blob([data], { type: IMG_TYPES[ext] }));
      urls.push(out.url);
    }
    media.set(path, out);
    return out;
  }

  const d = parseXml(xml);
  const body = d.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('notdocx');

  /* Word records where each page started the last time it laid the file out
     (<w:lastRenderedPageBreak/>); that gives real page numbers. */
  const hasLR = xml.includes('lastRenderedPageBreak');
  const ctx = { page: 1, heading: '', cnt: {}, paras: [], fld: [], sec: 0, hard: false, pre: '', inHf: false, cmt: {}, bm: {} };
  const blocks = [];
  const normalR = merge(S.defR, styleChain(S, S.normal).rPr);

  /* Sections: page size and margins, headers/footers, page numbering */
  const secs = [];
  const hfCache = new Map();
  function headerPart(ref) {
    const id = rid(ref);
    if (hfCache.has(id)) return hfCache.get(id);
    const path = partPath(id);
    const x = path && read(path);
    const out = [];
    hfCache.set(id, out);
    if (!x) return out;
    const save = { paras: ctx.paras, heading: ctx.heading, cnt: ctx.cnt, fld: ctx.fld, pre: ctx.pre, inHf: ctx.inHf, rels };
    Object.assign(ctx, { paras: [], cnt: {}, fld: [], pre: 'h' + hfCache.size + '-', inHf: true });
    rels = relsOf(path);
    try { walk(parseXml(x).documentElement, out, false); } finally {
      rels = save.rels;
      Object.assign(ctx, { paras: save.paras, heading: save.heading, cnt: save.cnt, fld: save.fld, pre: save.pre, inHf: save.inHf });
    }
    return out;
  }
  function parseSect(el) {
    const s = { pg: { w: 11906, h: 16838, l: 1440, r: 1440, t: 1440, b: 1440, hd: 720, ft: 720 }, hdr: {}, ftr: {}, titlePg: false, numStart: null, numFmt: null, grid: null, type: 'nextPage', cols: 1 };
    if (!el) return s;
    const sz = kid(el, 'pgSz'), mar = kid(el, 'pgMar');
    if (sz) { s.pg.w = +at(sz, 'w') || s.pg.w; s.pg.h = +at(sz, 'h') || s.pg.h; }
    if (mar) {
      for (const [k, a] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right'], ['hd', 'header'], ['ft', 'footer']]) {
        const v = num(at(mar, a)); if (v !== undefined) s.pg[k] = Math.abs(v);
      }
      s.pg.l += num(at(mar, 'gutter')) || 0;
    }
    for (const h of kids(el, 'headerReference')) s.hdr[at(h, 'type') || 'default'] = headerPart(h);
    for (const h of kids(el, 'footerReference')) s.ftr[at(h, 'type') || 'default'] = headerPart(h);
    const tp = kid(el, 'titlePg'); s.titlePg = !!tp && onOff(tp);
    const pn = kid(el, 'pgNumType'); if (pn) { s.numStart = num(at(pn, 'start')) ?? null; s.numFmt = at(pn, 'fmt'); }
    const dg = kid(el, 'docGrid'); if (dg) s.grid = { type: at(dg, 'type') || 'default', pitch: +at(dg, 'linePitch') || 0 };
    const ty = kid(el, 'type'); if (ty) s.type = at(ty, 'val');
    const cl = kid(el, 'cols'); if (cl) s.cols = +at(cl, 'num') || 1;
    return s;
  }

  function walk(container, out, inTable, ts) {
    for (const el of container.children) {
      if (el.namespaceURI !== W) continue;
      const ln = el.localName;
      if (ln === 'p') para(el, out, inTable, ts);
      else if (ln === 'tbl') table(el, out);
      else if (ln === 'sdt') { const c = kid(el, 'sdtContent'); if (c) walk(c, out, inTable, ts); }
      else if (ln === 'customXml' || ln === 'smartTag') walk(el, out, inTable, ts);
    }
  }

  function para(el, out, inTable, ts) {
    const pPrEl = kid(el, 'pPr');
    const direct = parsePPr(pPrEl);
    const sid = at(kid(pPrEl, 'pStyle'), 'val') || S.normal;
    const st = styleChain(S, sid);
    /* Word puts a table style's paragraph settings above Normal but below
       any other paragraph style */
    const norm = sid === S.normal;
    let pp = ts ? (norm ? merge(merge(S.defP, st.pPr), ts.pPr) : merge(merge(S.defP, ts.pPr), st.pPr)) : merge(S.defP, st.pPr);
    const baseR = ts ? (norm ? merge(merge(S.defR, st.rPr), ts.rPr) : merge(merge(S.defR, ts.rPr), st.rPr)) : merge(S.defR, st.rPr);
    const markR = merge(baseR, parseRPr(kid(pPrEl, 'rPr')));
    delete markR.vanish;
    const numId = direct.numId ?? st.pPr.numId;
    const ilvl = direct.ilvl ?? st.pPr.ilvl ?? 0;
    let label = null, labelR = null, suff = 'tab';
    if (numId && numId !== '0') {
      const L = numLabel(N, ctx.cnt, numId, ilvl);
      if (L) { label = L.text; pp = merge(pp, L.lv.pPr); labelR = merge(markR, L.lv.rPr); suff = L.lv.suff; }
    }
    pp = merge(pp, direct);
    const sname = (S.byId[sid] || {}).name || '';
    const toc = /^toc|table of figures|สารบัญ/.test(sname);
    const isHeading = !toc && (/^heading|หัวเรื่อง|^title$/.test(sname) || (pp.outline != null && pp.outline < 9));
    if (pp.pbb && !ctx.inHf) { ctx.hard = true; if (!hasLR) ctx.page++; }
    const P = {
      text: '', runs: [], pp, label, labelR, suff, inTable, toc, isHeading, page: ctx.page, breaks: [],
      idx: ctx.pre ? ctx.pre + ctx.paras.length : ctx.paras.length, sid, sec: ctx.sec, markR,
    };
    ctx.paras.push(P);
    out.push({ t: 'p', p: P });
    if (!ctx.inHf && kid(pPrEl, 'pPrChange')) P.revs = [{ k: 'fmt', s: 0, e: 0 }];
    let lastKey = null;

    const add = (str, rp) => {
      if (!str) return;
      const s = P.text.length;
      P.text += str;
      const key = rp.__k || (rp.__k = JSON.stringify(rp));
      const last = P.runs[P.runs.length - 1];
      if (last && !last.img && lastKey === key) last.e = P.text.length;
      else { P.runs.push({ s, e: P.text.length, rp }); lastKey = key; }
    };
    /* PAGE / NUMPAGES field results are redrawn per page */
    const fieldRp = rp => {
      const f = ctx.fld[ctx.fld.length - 1];
      if (!f || !f.res) return rp;
      const m = /^\s*(PAGE|NUMPAGES|SECTIONPAGES)\b/i.exec(f.code);
      if (!m) return rp;
      const o = { ...rp, fld: m[1].toUpperCase() };
      delete o.__k;
      return o;
    };
    const pageBreak = () => {
      if (ctx.inHf) return;
      ctx.page++;
      if (!P.text && !P.runs.length) { P.page = ctx.page; P.topSoft = !ctx.hard; } else P.breaks.push(P.text.length);
      ctx.hard = false;
    };
    const pushObj = obj => { if (obj) { P.runs.push({ s: P.text.length, e: P.text.length, img: obj }); lastKey = null; } };

    /* ── drawings: pictures, shapes, text boxes, groups, charts ── */
    const textBlocks = txbx => { const bs = []; walk(txbx, bs, inTable); return bs; };
    const anchorOf = an => {
      const pos = n => {
        const e = lk(an, n); if (!e) return { rel: 'column', off: 0, align: null };
        const off = lk(e, 'posOffset'), al = lk(e, 'align');
        return { rel: e.getAttribute('relativeFrom') || 'column', off: off ? emu(off.textContent) : 0, align: al ? al.textContent : null };
      };
      let wrap = 'none';
      for (const c of an.children) if (/^wrap/.test(c.localName)) wrap = c.localName.slice(4).toLowerCase();
      const h = pos('positionH'), v = pos('positionV');
      if (an.getAttribute('simplePos') === '1') { const sp = lk(an, 'simplePos'); h.rel = v.rel = 'page'; h.off = emu(sp.getAttribute('x')); v.off = emu(sp.getAttribute('y')); h.align = v.align = null; }
      return { h, v, wrap, behind: an.getAttribute('behindDoc') === '1',
        dist: { l: emu(an.getAttribute('distL')), r: emu(an.getAttribute('distR')), t: emu(an.getAttribute('distT')), b: emu(an.getAttribute('distB')) } };
    };
    const shapeFill = (spPr, style) => {
      if (!spPr) return null;
      if (lk(spPr, 'noFill')) return null;
      if (lk(spPr, 'solidFill')) return color(lk(spPr, 'solidFill'));
      if (lk(spPr, 'gradFill')) return color(ld(lk(spPr, 'gradFill'), 'gs'));
      if (lk(spPr, 'blipFill') || lk(spPr, 'pattFill')) return null;
      const fr = style && lk(style, 'fillRef');
      return fr && +fr.getAttribute('idx') > 0 ? color(fr) : null;
    };
    const shapeLine = (spPr, style) => {
      const ln = lk(spPr, 'ln');
      if (ln && lk(ln, 'noFill')) return null;
      let c = ln && lk(ln, 'solidFill') ? color(lk(ln, 'solidFill')) : null;
      if (!c) { const lr = style && lk(style, 'lnRef'); if (lr && +lr.getAttribute('idx') > 0) c = color(lr); }
      if (!c) return null;
      return { color: c, w: ln && ln.getAttribute('w') ? Math.max(0.5, emu(ln.getAttribute('w'))) : 1, dash: ln ? (lk(ln, 'prstDash') || {}).getAttribute?.('val') : null,
        head: ln && lk(ln, 'headEnd') ? lk(ln, 'headEnd').getAttribute('type') : null, tail: ln && lk(ln, 'tailEnd') ? lk(ln, 'tailEnd').getAttribute('type') : null };
    };
    const xfrmOf = spPr => {
      const x = lk(spPr, 'xfrm');
      return x ? { rot: (+x.getAttribute('rot') || 0) / 60000, flipH: x.getAttribute('flipH') === '1', flipV: x.getAttribute('flipV') === '1' } : {};
    };
    const picObj = (el, w, h) => {
      const blip = ld(el, 'blip');
      const im = blip ? image(rid(blip)) : null;
      const sr = ld(el, 'srcRect');
      const crop = sr ? ['l', 't', 'r', 'b'].map(k => (+sr.getAttribute(k) || 0) / 100000) : null;
      return { t: 'img', url: im && im.url, kind: im ? im.kind : '', w, h, crop: crop && crop.some(Boolean) ? crop : null, ...xfrmOf(lk(el, 'spPr')) };
    };
    const wspObj = (el, w, h) => {
      const spPr = lk(el, 'spPr');
      const geom = ld(spPr, 'prstGeom');
      const style = lk(el, 'style');
      const txbx = ld(el, 'txbxContent');
      const bp = lk(el, 'bodyPr');
      const ins = k => (bp && bp.getAttribute(k + 'Ins') != null ? emu(bp.getAttribute(k + 'Ins')) : (k === 'l' || k === 'r' ? 9.6 : 4.8));
      return {
        t: 'shape', prst: geom ? geom.getAttribute('prst') : 'rect', fill: shapeFill(spPr, style), line: shapeLine(spPr, style),
        blocks: txbx ? textBlocks(txbx) : null, dml: dmlText(lk(el, 'txBody'), theme),
        ins: { l: ins('l'), t: ins('t'), r: ins('r'), b: ins('b') }, va: bp && bp.getAttribute('anchor'), vert: bp && bp.getAttribute('vert'),
        w, h, ...xfrmOf(spPr),
      };
    };
    const grpObj = (el, w, h, chx) => {
      const xf = chx || lk(lk(el, 'grpSpPr'), 'xfrm');
      const chOff = lk(xf, 'chOff'), chExt = lk(xf, 'chExt');
      const x0 = chOff ? emu(chOff.getAttribute('x')) : 0, y0 = chOff ? emu(chOff.getAttribute('y')) : 0;
      const cw = chExt ? emu(chExt.getAttribute('cx')) : w, chh = chExt ? emu(chExt.getAttribute('cy')) : h;
      const kx = w / (cw || 1), ky = h / (chh || 1);
      const out = [];
      for (const c of el.children) {
        const n = c.localName;
        if (!/^(wsp|pic|grpSp|graphicFrame|cxnSp|sp)$/.test(n)) continue;
        const cxf = n === 'grpSp' ? lk(lk(c, 'grpSpPr'), 'xfrm') : n === 'graphicFrame' ? lk(c, 'xfrm') : lk(lk(c, 'spPr'), 'xfrm');
        const off = lk(cxf, 'off'), ext = lk(cxf, 'ext');
        if (!off || !ext) continue;
        const cwpx = emu(ext.getAttribute('cx')) * kx, chpx = emu(ext.getAttribute('cy')) * ky;
        const obj = shapeObj(c, cwpx, chpx);
        if (obj) out.push({ x: (emu(off.getAttribute('x')) - x0) * kx, y: (emu(off.getAttribute('y')) - y0) * ky, w: cwpx, h: chpx, obj });
      }
      return { t: 'grp', w, h, kids: out };
    };
    const chartObj = (el, w, h) => {
      const path = partPath(rid(el));
      const x = path && read(path);
      if (!x) return { t: 'ph', kind: 'chart', w, h };
      try { return { t: 'chart', w, h, chart: parseChart(parseXml(x), theme) }; } catch (e) { return { t: 'ph', kind: 'chart', w, h }; }
    };
    /* SmartArt: Word saves a drawn copy of the diagram (diagrams/drawingN.xml) */
    const smartArt = (el, w, h) => {
      try {
        const dm = partPath(el.getAttributeNS(R, 'dm') || el.getAttribute('r:dm'));
        const dx = dm && read(dm);
        const ext = dx && ld(parseXml(dx), 'dataModelExt');
        const dp = ext && partPath(ext.getAttribute('relId'));
        const drawing = dp && read(dp);
        if (!drawing) return { t: 'ph', kind: 'diagram', w, h };
        const tree = ld(parseXml(drawing), 'spTree');
        const out = [];
        for (const sp of lks(tree, 'sp')) {
          const xf = lk(lk(sp, 'spPr'), 'xfrm');
          const off = lk(xf, 'off'), e = lk(xf, 'ext');
          if (!off || !e) continue;
          const o = wspObj(sp, emu(e.getAttribute('cx')), emu(e.getAttribute('cy')));
          out.push({ x: emu(off.getAttribute('x')), y: emu(off.getAttribute('y')), w: o.w, h: o.h, obj: o });
        }
        return { t: 'grp', w, h, kids: out };
      } catch (e) { return { t: 'ph', kind: 'diagram', w, h }; }
    };
    function shapeObj(el, w, h) {
      if (!el) return null;
      switch (el.localName) {
        case 'pic': return picObj(el, w, h);
        case 'wsp': case 'sp': case 'cxnSp': return wspObj(el, w, h);
        case 'wgp': case 'grpSp': return grpObj(el, w, h);
        case 'chart': return chartObj(el, w, h);
        case 'relIds': return smartArt(el, w, h);
        case 'graphicFrame': { const gd = ld(el, 'graphicData'); return shapeObj(gd && gd.firstElementChild, w, h); }
        default: return { t: 'ph', kind: el.localName, w, h };
      }
    }
    const drawing = dr => {
      const wrapEl = lk(dr, 'inline') || lk(dr, 'anchor');
      if (!wrapEl) return;
      const ext = lk(wrapEl, 'extent');
      const w = ext ? emu(ext.getAttribute('cx')) : 0, h = ext ? emu(ext.getAttribute('cy')) : 0;
      const gd = ld(wrapEl, 'graphicData');
      const obj = shapeObj(gd && gd.firstElementChild, w, h);
      if (!obj) return;
      if (wrapEl.localName === 'anchor') obj.anchor = anchorOf(wrapEl);
      pushObj(obj);
    };

    /* VML (older files, OLE objects): v:shape / v:rect / v:group … */
    const vStyle = s => { const o = {}; for (const kv of (s || '').split(';')) { const i = kv.indexOf(':'); if (i > 0) o[kv.slice(0, i).trim().toLowerCase()] = kv.slice(i + 1).trim(); } return o; };
    const vLen = v => { const m = /^(-?[\d.]+)\s*(pt|px|in|cm|mm)?$/.exec(v || ''); if (!m) return 0; return +m[1] * ({ pt: 4 / 3, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }[m[2] || 'px']); };
    const vColor = v => { const c = (v || '').split(/\s/)[0]; return /^#?[0-9a-f]{3,6}$/i.test(c) ? (c[0] === '#' ? c : '#' + c) : (/^[a-z]+$/i.test(c) ? c : null); };
    const vmlObj = (sh, W0, H0) => {
      const st = vStyle(sh.getAttribute('style'));
      const w = W0 ?? vLen(st.width), h = H0 ?? vLen(st.height);
      if (sh.localName === 'group') {
        const cs = (sh.getAttribute('coordsize') || '1000,1000').split(',').map(Number);
        const co = (sh.getAttribute('coordorigin') || '0,0').split(',').map(Number);
        const kx = w / (cs[0] || 1), ky = h / (cs[1] || 1);
        const out = [];
        for (const c of sh.children) {
          if (!/^(shape|rect|roundrect|oval|line|image|group|textbox)$/.test(c.localName)) continue;
          const s2 = vStyle(c.getAttribute('style'));
          const cw = (parseFloat(s2.width) || 0) * kx, chh = (parseFloat(s2.height) || 0) * ky;
          const o = vmlObj(c, cw, chh);
          if (o) out.push({ x: ((parseFloat(s2.left) || 0) - (co[0] || 0)) * kx, y: ((parseFloat(s2.top) || 0) - (co[1] || 0)) * ky, w: cw, h: chh, obj: o });
        }
        return { t: 'grp', w, h, kids: out };
      }
      const im = lk(sh, 'imagedata');
      if (im) { const i = image(rid(im)); return { t: 'img', url: i && i.url, kind: i ? i.kind : '', w, h }; }
      const tb = ld(sh, 'txbxContent');
      const filled = sh.getAttribute('filled'), stroked = sh.getAttribute('stroked');
      const fill = filled === 'f' || filled === 'false' ? null : (vColor(sh.getAttribute('fillcolor')) || (tb || filled ? '#ffffff' : null));
      const line = stroked === 'f' || stroked === 'false' ? null : { color: vColor(sh.getAttribute('strokecolor')) || '#000', w: vLen(sh.getAttribute('strokeweight')) || 1 };
      const prst = { oval: 'ellipse', roundrect: 'roundRect', line: 'line' }[sh.localName] || 'rect';
      if (!tb && !fill && !line) return null;
      return { t: 'shape', prst, fill, line, blocks: tb ? textBlocks(tb) : null, ins: { l: 9.6, t: 4.8, r: 9.6, b: 4.8 }, w, h };
    };
    const pict = pc => {
      const sh = [...pc.children].find(c => /^(shape|rect|roundrect|oval|line|image|group)$/.test(c.localName));
      if (!sh) return;
      const obj = vmlObj(sh);
      if (!obj) return;
      const st = vStyle(sh.getAttribute('style'));
      if (st.position === 'absolute') {
        const wr = ld(sh, 'wrap');
        const hr = { page: 'page', margin: 'margin', text: 'column', char: 'character' }[st['mso-position-horizontal-relative']] || 'column';
        const vr = { page: 'page', margin: 'margin', text: 'paragraph', line: 'line' }[st['mso-position-vertical-relative']] || 'paragraph';
        const al = v => (v && v !== 'absolute' ? v : null);
        obj.anchor = {
          h: { rel: hr, off: vLen(st['margin-left']) + vLen(st.left), align: al(st['mso-position-horizontal']) },
          v: { rel: vr, off: vLen(st['margin-top']) + vLen(st.top), align: al(st['mso-position-vertical']) },
          wrap: wr ? ({ topAndBottom: 'topandbottom' }[wr.getAttribute('type')] || wr.getAttribute('type') || 'square') : 'none',
          behind: (+st['z-index'] || 0) < 0, dist: { l: 9, r: 9, t: 0, b: 0 },
        };
      }
      pushObj(obj);
    };

    const run = r => {
      const dd = parseRPr(kid(r, 'rPr'));
      let rp = baseR;
      if (dd.rStyle) rp = merge(rp, styleChain(S, dd.rStyle).rPr);
      rp = merge(rp, dd);
      delete rp.rStyle;
      if (rp.vanish) { // hidden text: not shown, but counted for the before-sending check
        let n = 0;
        for (const c of r.children) if (c.localName === 't' && c.namespaceURI === W) n += c.textContent.length;
        if (n && !ctx.inHf) (P.hidden || (P.hidden = [])).push({ at: P.text.length, n });
        return;
      }
      if (!ctx.inHf && kid(kid(r, 'rPr'), 'rPrChange')) (P.revs || (P.revs = [])).push({ k: 'fmt', s: P.text.length, e: P.text.length });
      for (const c of r.children) {
        if (c.namespaceURI === W) {
          switch (c.localName) {
            case 't': add(c.textContent, fieldRp(rp)); break;
            case 'tab': case 'ptab': add('\t', rp); break;
            case 'br': if (at(c, 'type') === 'page') { ctx.hard = true; if (!hasLR) pageBreak(); } else if (at(c, 'type') !== 'column') add('\n', rp); break;
            case 'cr': add('\n', rp); break;
            case 'noBreakHyphen': add('-', rp); break;
            case 'sym': { const ch = parseInt(at(c, 'char') || '', 16); if (ch) add(bullet(String.fromCharCode(ch < 0xF000 ? 0xF000 + ch : ch)), rp); break; }
            case 'lastRenderedPageBreak': if (hasLR) pageBreak(); break;
            case 'fldChar': {
              const ty = at(c, 'fldCharType');
              if (ty === 'begin') ctx.fld.push({ code: '', res: false });
              else if (ty === 'separate') {
                const f = ctx.fld[ctx.fld.length - 1];
                if (f) { f.res = true; const m = /PAGEREF\s+(\S+)/.exec(f.code); if (m && P.toc && !P.tocAnchor) P.tocAnchor = m[1]; }
              }
              else if (ty === 'end') ctx.fld.pop();
              break;
            }
            case 'instrText': { const f = ctx.fld[ctx.fld.length - 1]; if (f && !f.res) f.code += c.textContent; break; }
            case 'drawing': drawing(c); break;
            case 'pict': case 'object': pict(c); break;
            case 'commentReference': { const id = at(c, 'id'); if (!ctx.inHf && !ctx.cmt[id]) ctx.cmt[id] = { p: P.idx, s: P.text.length, e: P.text.length }; break; }
          }
        } else if (c.localName === 'AlternateContent') {
          /* modern content in Choice; Fallback repeats it for old Word */
          const ch = [...c.children].find(x => x.localName === 'Choice');
          if (ch) for (const x of ch.children) { if (x.localName === 'drawing') drawing(x); else if (x.localName === 'pict') pict(x); }
        }
      }
    };
    const inl = container => {
      for (const c of container.children) {
        if (c.namespaceURI !== W) {
          if (c.localName === 'AlternateContent') { const ch = [...c.children].find(x => x.localName === 'Choice'); if (ch) inl(ch); }
          continue;
        }
        switch (c.localName) {
          case 'r': run(c); break;
          case 'hyperlink': if (P.toc && !P.tocAnchor && at(c, 'anchor')) P.tocAnchor = at(c, 'anchor'); inl(c); break;
          case 'smartTag': case 'customXml': inl(c); break;
          case 'ins': case 'moveTo': {
            const s0 = P.text.length;
            inl(c);
            if (!ctx.inHf) (P.revs || (P.revs = [])).push({ k: 'ins', s: s0, e: P.text.length });
            break;
          }
          case 'del': case 'moveFrom': if (!ctx.inHf) (P.revs || (P.revs = [])).push({ k: 'del', s: P.text.length, e: P.text.length }); break;
          case 'commentRangeStart': if (!ctx.inHf) ctx.cmt[at(c, 'id')] = { p: P.idx, s: P.text.length, e: null }; break;
          case 'commentRangeEnd': { const m = ctx.cmt[at(c, 'id')]; if (m && m.p === P.idx && m.e == null) m.e = P.text.length; break; }
          case 'bookmarkStart': if (!ctx.inHf && at(c, 'name')) ctx.bm[at(c, 'name')] = { p: P.idx, off: P.text.length }; break;
          case 'fldSimple': ctx.fld.push({ code: at(c, 'instr') || '', res: true }); inl(c); ctx.fld.pop(); break;
          case 'sdt': { const sc = kid(c, 'sdtContent'); if (sc) inl(sc); break; }
        }
      }
    };
    inl(el);

    if (isHeading && !inTable && P.text.trim()) ctx.heading = P.text.replace(/\s+/g, ' ').trim().slice(0, 80);
    P.heading = isHeading ? '' : ctx.heading;
    /* a section ends with this paragraph */
    const sp = kid(pPrEl, 'sectPr');
    if (sp && !ctx.inHf) {
      const s = parseSect(sp);
      secs.push(s);
      ctx.sec++;
      if (s.type !== 'continuous') ctx.hard = true;
    }
  }

  function table(tblEl, out) {
    const tp = parseTblPr(kid(tblEl, 'tblPr'));
    const ts = styleChain(S, tp.style || S.tableNormal);
    const props = merge(ts.tbl, tp);
    const grid = kids(kid(tblEl, 'tblGrid'), 'gridCol').map(g => +at(g, 'w') || 0);
    let width = null;
    if (props.tw) {
      const ty = props.tw.type, v = props.tw.w || '';
      if (ty === 'pct') width = /%$/.test(v) ? parseFloat(v) + '%' : (+v / 50) + '%';
      else if (ty === 'dxa' && +v) width = +v / 15;
    }
    const T = { t: 'tbl', grid, rows: [], width, borders: props.borders || {}, mar: { left: 108, right: 108, top: 0, bottom: 0, ...(props.mar || {}) }, jc: props.jc, ind: props.ind || 0 };
    const pts = { pPr: ts.pPr, rPr: ts.rPr };
    const owner = [];
    for (const tr of kids(tblEl, 'tr')) {
      const row = [];
      const trPr = kid(tr, 'trPr');
      const trh = kid(trPr, 'trHeight');
      if (trh) { row.h = +at(trh, 'val') || 0; row.hRule = at(trh, 'hRule') || 'atLeast'; }
      const th = kid(trPr, 'tblHeader'); if (th && onOff(th)) row.hdr = true;
      let col = +(at(kid(trPr, 'gridBefore'), 'val') || 0);
      for (const tc of tr.children) {
        if (tc.localName !== 'tc' || tc.namespaceURI !== W) continue;
        const tcPr = kid(tc, 'tcPr');
        const span = +(at(kid(tcPr, 'gridSpan'), 'val') || 1);
        const vm = kid(tcPr, 'vMerge');
        const vmv = vm ? (at(vm, 'val') || 'continue') : null;
        if (vmv === 'continue' && owner[col]) {
          owner[col].rowspan++;
          const bd = parseBorders(kid(tcPr, 'tcBorders'));
          if (bd && bd.bottom) owner[col].borders = { ...(owner[col].borders || {}), bottom: bd.bottom };
          walk(tc, owner[col].blocks, true, pts);
          col += span;
          continue;
        }
        const f = at(kid(tcPr, 'shd'), 'fill');
        const cell = {
          span, rowspan: 1, col, blocks: [], fill: f && f !== 'auto' ? f : null, va: at(kid(tcPr, 'vAlign'), 'val'),
          borders: parseBorders(kid(tcPr, 'tcBorders')), mar: parseMar(kid(tcPr, 'tcMar')), dir: at(kid(tcPr, 'textDirection'), 'val'),
          noWrap: !!kid(tcPr, 'noWrap'),
        };
        walk(tc, cell.blocks, true, pts);
        for (let k = col; k < col + span; k++) owner[k] = vmv === 'restart' ? cell : null;
        row.push(cell);
        col += span;
      }
      T.rows.push(row);
    }
    out.push(T);
  }

  walk(body, blocks, false);

  /* Comments: where they sit, who wrote them, what they say */
  const comments = [];
  {
    const cx = read('word/comments.xml');
    const texts = {};
    if (cx) for (const c of parseXml(cx).getElementsByTagNameNS(W, 'comment')) {
      texts[at(c, 'id')] = { author: at(c, 'author') || '', text: [...c.getElementsByTagNameNS(W, 't')].map(t => t.textContent).join('').trim() };
    }
    for (const [id, m] of Object.entries(ctx.cmt)) comments.push({ ...m, e: m.e ?? m.s, ...(texts[id] || { author: '', text: '' }) });
    for (const id of Object.keys(texts)) if (!ctx.cmt[id]) comments.push({ p: null, s: 0, e: 0, ...texts[id] });
  }
  secs.push(parseSect(kids(body, 'sectPr').pop()));
  /* a section without its own header/footer uses the previous section's */
  for (let i = 1; i < secs.length; i++) {
    for (const k of ['default', 'first', 'even']) {
      if (secs[i].hdr[k] === undefined) secs[i].hdr[k] = secs[i - 1].hdr[k];
      if (secs[i].ftr[k] === undefined) secs[i].ftr[k] = secs[i - 1].ftr[k];
    }
  }

  const paras = ctx.paras;
  let n = 0;
  for (const p of paras) if (p.text.trim() && !p.inTable) p.no = ++n; // table cells are located by table/row

  /* Tables as grids of paragraph indices, for the repeated-data checks.
     A nested table is listed on its own, not as part of its cell. */
  const tables = [];
  const cellParas = bs => {
    const a = [];
    for (const b of bs) {
      if (b.t === 'p') a.push(b.p.idx);
      else if (b.t === 'tbx') a.push(...cellParas(b.blocks));
      else if (b.t === 'tbl') addTable(b);
    }
    return a;
  };
  const addTable = T => {
    const entry = { no: tables.length, rows: [], cap: '' };
    tables.push(entry);
    entry.rows = T.rows.map(r => r.map(c => ({ col: c.col, span: c.span, paras: cellParas(c.blocks) })));
    entry.rows.forEach((r, ri) => r.forEach(c => c.paras.forEach(i => { paras[i].tbl = entry.no; paras[i].row = ri + 1; })));
  };
  const scan = bs => { for (const b of bs) { if (b.t === 'tbl') addTable(b); else if (b.t === 'tbx') scan(b.blocks); } };
  scan(blocks);
  /* name each table by its caption: just above it, or else just below */
  const CAP = /^\s*((?:ตาราง(?:ที่)?|Table)\s*[0-9๐-๙]+(?:\s?[.\-–]\s?[0-9๐-๙]+)*)/i;
  for (const T of tables) {
    const ids = T.rows.flatMap(r => r.flatMap(c => c.paras));
    if (!ids.length) continue;
    const near = (from, step, n) => {
      for (let i = from; i >= 0 && i < paras.length && n > 0; i += step) {
        const q = paras[i];
        if (!q.text.trim()) continue;
        if (q.tbl != null) return '';
        const m = q.text.match(CAP);
        if (m) return m[1].replace(/\s+/g, ' ');
        n--;
      }
      return '';
    };
    T.cap = near(Math.min(...ids) - 1, -1, 2) || near(Math.max(...ids) + 1, 1, 1);
  }

  return {
    kind: 'docx', paras, blocks, tables, notes: [], urls, hasPages: hasLR || ctx.page > 1, hasLR, pages: ctx.page,
    comments, bookmarks: ctx.bm, pageLabels: pageLabels(paras, secs, ctx.page),
    pg: secs[secs.length - 1].pg, secs, defTab, evenOdd, theme, normalR,
  };
}

/* ── PDF ────────────────────────────────────────────────────────────────── */

/* Thai fonts in older PDFs map shifted tone marks/vowels to private-use
   code points (U+F700–F71A); map them back. */
const PUA = {
  0xF700: 0x0E10, 0xF701: 0x0E34, 0xF702: 0x0E35, 0xF703: 0x0E36, 0xF704: 0x0E37,
  0xF705: 0x0E48, 0xF706: 0x0E49, 0xF707: 0x0E4A, 0xF708: 0x0E4B, 0xF709: 0x0E4C,
  0xF70A: 0x0E48, 0xF70B: 0x0E49, 0xF70C: 0x0E4A, 0xF70D: 0x0E4B, 0xF70E: 0x0E4C,
  0xF70F: 0x0E0D, 0xF710: 0x0E31, 0xF711: 0x0E4D, 0xF712: 0x0E47, 0xF713: 0x0E48,
  0xF714: 0x0E49, 0xF715: 0x0E4A, 0xF716: 0x0E4B, 0xF717: 0x0E4C, 0xF718: 0x0E38,
  0xF719: 0x0E39, 0xF71A: 0x0E3A,
};
export function fixThai(s) {
  return s
    .replace(/[\uF700-\uF71A]/g, c => String.fromCharCode(PUA[c.charCodeAt(0)] || c.charCodeAt(0)))
    .replace(/ํ([่-๋]?)า/g, '$1ำ')            // ํ + า → ำ
    .replace(/([่-์])([ัิ-ื็])/g, '$2$1') // tone before vowel → vowel first
    .normalize('NFC');
}

const TOC_LINE = /(\.\s?){5,}|…{2,}|_{5,}|\S\s{3,}[0-9๐-๙ivx]{1,4}\s*$/i;
const PAGE_NO = /^[\s\-–—]*(?:หน้า\s*)?[0-9๐-๙ivxlc]{1,4}[\s\-–—]*$/i;
const CAP_START = /^\s*(ตาราง|รูป|ภาพ|แผนภาพ|Table|Figure|Fig\.)\s*(ที่)?\s*[0-9๐-๙]/i;

/* Text items → lines. Each line keeps `segs`: which characters came from
   which item, with the item's position, so a finding can be drawn on the
   page image. */
function pageLines(items) {
  const lines = [];
  let cur = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    if (!it.str) { if (it.hasEOL && cur) cur.eol = true; continue; }
    const [, , c, d, x, y] = it.transform;
    const size = Math.hypot(c, d) || it.height || 10;
    if (!cur || cur.eol || Math.abs(y - cur.y) > size * 0.5 || x < cur.x0 - size) {
      cur = { y, size, x0: x, text: '', end: x, segs: [] };
      lines.push(cur);
    } else if (x - cur.end > size * 0.2 && cur.text && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) {
      cur.text += ' ';
    }
    let s = fixThai(it.str).replace(/[ \u00A0]{2,}/g, ' ');
    if (!cur.text || /\s$/.test(cur.text)) s = s.replace(/^\s+/, '');
    if (s) {
      const start = cur.text.length;
      cur.text += s;
      cur.segs.push({ s: start, e: cur.text.length, x, y, w: it.width || 0, size });
    }
    cur.end = Math.max(cur.end, x + (it.width || 0));
    if (it.hasEOL) cur.eol = true;
  }
  for (const l of lines) {
    l.text = l.text.replace(/\s+$/, '');
    for (const g of l.segs) g.e = Math.min(g.e, l.text.length);
  }
  return lines.filter(l => l.text);
}

export async function extractPdf(buf, onProgress) {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages = [], sizes = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 4 / 3 }); // PDF points → CSS px
    sizes.push({ w: vp.width, h: vp.height, tf: vp.transform });
    const tc = await page.getTextContent();
    pages.push(pageLines(tc.items));
    page.cleanup();
    if (onProgress) onProgress(n, pdf.numPages);
  }

  /* Running headers/footers: the first/last two lines of a page whose text
     (numbers aside) repeats on many pages. */
  const hfKey = l => l.text.replace(/[0-9๐-๙]+/g, '#').replace(/\s+/g, ' ');
  const edge = (ls, i) => i < 2 || i >= ls.length - 2;
  const count = new Map();
  pages.forEach(ls => {
    const seen = new Set();
    ls.forEach((l, i) => { if (edge(ls, i)) seen.add(hfKey(l)); });
    seen.forEach(k => count.set(k, (count.get(k) || 0) + 1));
  });
  const minRep = Math.max(3, Math.ceil(pages.length * 0.3));
  const isHf = (ls, i) => edge(ls, i) && ((pages.length >= 4 && count.get(hfKey(ls[i])) >= minRep) || PAGE_NO.test(ls[i].text));

  /* Lines → paragraphs: break on a larger gap, a size change, a caption or
     a TOC line. Line breaks are kept as "\n". */
  const paras = [];
  let thai = 0, bad = 0, chars = 0;
  pages.forEach((ls, pi) => {
    let cur = null, prev = null;
    const right = Math.max(0, ...ls.map(l => l.end));
    ls.forEach((l, i) => {
      chars += l.text.length;
      thai += (l.text.match(/[ก-๎]/g) || []).length;
      bad += (l.text.match(/(^|[^ก-๎])[ัิ-ฺ็-๎]|[-�]/g) || []).length;
      const hf = isHf(ls, i);
      const toc = !hf && TOC_LINE.test(l.text);
      /* A caption starts its own paragraph — unless the line before ran to
         the right margin, in which case this is a wrapped "…ตารางที่ 3-5". */
      const capLine = CAP_START.test(l.text) && (!prev || prev.end < right - prev.size * 3 || prev.y - l.y > prev.size * 1.8);
      const brk = !cur || hf || toc || cur.hf || cur.toc || capLine ||
        (prev && (prev.y - l.y > prev.size * 1.8 || l.y > prev.y + 1 || Math.abs(l.size - prev.size) > 1.5));
      if (brk) {
        cur = { text: '', page: pi + 1, hf, toc, geo: [] };
        paras.push(cur);
      } else cur.text += '\n';
      const base = cur.text.length;
      cur.text += l.text;
      for (const g of l.segs) cur.geo.push({ ...g, s: g.s + base, e: g.e + base });
      prev = l;
    });
  });

  const notes = [];
  if (chars < pages.length * 40) notes.push('scanned');
  else if (thai > 200 && bad / thai > 0.01) notes.push('garbled');
  notes.push('pdfspace');
  return { kind: 'pdf', paras, notes, pages: pages.length, sizes, pdf };
}

/* ── Pasted text ────────────────────────────────────────────────────────── */

export function extractText(str) {
  const paras = str.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim()).map((text, i) => ({ text, no: i + 1 }));
  return { kind: 'text', paras, notes: [] };
}
