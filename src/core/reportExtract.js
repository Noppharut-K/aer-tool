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
const V = 'urn:schemas-microsoft-com:vml';

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
const num = v => (v == null || v === '' ? undefined : +v);
const parseXml = s => new DOMParser().parseFromString(s, 'application/xml');

/* Merge two property bags; keys that are undefined in `b` keep `a`'s value */
function merge(a, b) {
  const o = { ...a };
  for (const k in b) if (b[k] !== undefined) o[k] = b[k];
  if (b.first !== undefined) delete o.hang;
  if (b.hang !== undefined) delete o.first;
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
    o.line = num(at(sp, 'line')); if (o.line !== undefined) o.lineRule = at(sp, 'lineRule') || 'auto';
  }
  const ol = kid(pPr, 'outlineLvl'); if (ol) o.outline = +at(ol, 'val');
  const np = kid(pPr, 'numPr');
  if (np) { const id = kid(np, 'numId'), lv = kid(np, 'ilvl'); if (id) o.numId = at(id, 'val'); if (lv) o.ilvl = +at(lv, 'val'); }
  const pb = kid(pPr, 'pageBreakBefore'); if (pb) o.pbb = onOff(pb);
  const shd = kid(pPr, 'shd'); if (shd) { const f = at(shd, 'fill'); if (f && f !== 'auto') o.fill = f; }
  return o;
}

function parseRPr(rPr) {
  const o = {};
  if (!rPr) return o;
  for (const n of ['b', 'bCs', 'i', 'iCs', 'strike', 'dstrike', 'vanish', 'caps', 'smallCaps']) {
    const e = kid(rPr, n); if (e) o[n] = onOff(e);
  }
  const u = kid(rPr, 'u'); if (u) o.u = (at(u, 'val') || 'single') !== 'none';
  const sz = kid(rPr, 'sz'); if (sz) o.sz = +at(sz, 'val');
  const szc = kid(rPr, 'szCs'); if (szc) o.szCs = +at(szc, 'val');
  const va = kid(rPr, 'vertAlign'); if (va) o.vert = at(va, 'val');
  const col = kid(rPr, 'color'); if (col) { const v = at(col, 'val'); if (v && v !== 'auto') o.color = v; }
  const hl = kid(rPr, 'highlight'); if (hl) o.hl = at(hl, 'val');
  const shd = kid(rPr, 'shd'); if (shd) { const f = at(shd, 'fill'); if (f && f !== 'auto') o.shd = f; }
  const rf = kid(rPr, 'rFonts');
  if (rf) {
    const a = at(rf, 'ascii') || at(rf, 'hAnsi'), c = at(rf, 'cs');
    if (a) o.fA = a; if (c) o.fC = c;
    const aT = at(rf, 'asciiTheme') || at(rf, 'hAnsiTheme'), cT = at(rf, 'cstheme');
    if (aT && !a) o.fAT = aT; if (cT && !c) o.fCT = cT;
  }
  const rs = kid(rPr, 'rStyle'); if (rs) o.rStyle = at(rs, 'val');
  return o;
}

/* ── styles, numbering, theme fonts ─────────────────────────────────────── */

function loadStyles(xml) {
  const S = { byId: {}, defP: {}, defR: {}, normal: null, memo: {} };
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
    };
    S.byId[id] = s;
    if (at(st, 'default') === '1' && s.type === 'paragraph') S.normal = id;
  }
  return S;
}
function styleChain(S, id, depth = 0) {
  if (!id || !S.byId[id] || depth > 20) return { pPr: {}, rPr: {} };
  if (S.memo[id]) return S.memo[id];
  const st = S.byId[id];
  const base = styleChain(S, st.based, depth + 1);
  return (S.memo[id] = { pPr: merge(base.pPr, st.pPr), rPr: merge(base.rPr, st.rPr) });
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
function fmtNum(n, fmt) {
  switch (fmt) {
    case 'decimalZero': return n < 10 ? '0' + n : String(n);
    case 'upperRoman': return roman(n);
    case 'lowerRoman': return roman(n).toLowerCase();
    case 'upperLetter': return String.fromCharCode(65 + (n - 1) % 26).repeat(Math.floor((n - 1) / 26) + 1);
    case 'lowerLetter': return String.fromCharCode(97 + (n - 1) % 26).repeat(Math.floor((n - 1) / 26) + 1);
    case 'thaiLetters': return THAI_LETTERS[(n - 1) % THAI_LETTERS.length];
    case 'thaiNumbers': case 'thaiCounting': return String(n).replace(/\d/g, d => String.fromCharCode(0x0E50 + +d));
    case 'none': return '';
    default: return String(n);
  }
}
/* Bullets are usually Symbol/Wingdings glyphs in the private-use area */
const BULLET = { 0xB7: '•', 0xA7: '▪', 0xD8: '➢', 0xFC: '✓', 0x76: '❖', 0x6E: '■', 0x71: '❑', 0x6C: '●', 0x9F: '•', 0xA8: '◆' };
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

function loadTheme(xml) {
  const T = { minor: {}, major: {} };
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
  return T;
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
  const rels = {};
  const rx = read('word/_rels/document.xml.rels');
  if (rx) for (const r of parseXml(rx).getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');

  const urls = [];
  const media = new Map();
  function image(rid) {
    const target = rels[rid];
    if (!target) return null;
    let path = target.startsWith('/') ? target.slice(1) : 'word/' + target;
    while (/[^/]+\/\.\.\//.test(path)) path = path.replace(/[^/]+\/\.\.\//, '');
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

  /* Page size from the last section */
  let pg = { w: 11906, h: 16838, l: 1440, r: 1440, t: 1440, b: 1440 };
  const sect = kids(body, 'sectPr').pop();
  if (sect) {
    const sz = kid(sect, 'pgSz'), mar = kid(sect, 'pgMar');
    if (sz) pg = { ...pg, w: +at(sz, 'w') || pg.w, h: +at(sz, 'h') || pg.h };
    if (mar) pg = { ...pg, l: num(at(mar, 'left')) ?? pg.l, r: num(at(mar, 'right')) ?? pg.r, t: num(at(mar, 'top')) ?? pg.t, b: num(at(mar, 'bottom')) ?? pg.b };
  }

  /* Word records where each page started the last time it laid the file out
     (<w:lastRenderedPageBreak/>); that gives real page numbers. */
  const hasLR = xml.includes('lastRenderedPageBreak');
  const ctx = { page: 1, heading: '', cnt: {}, paras: [] };
  const blocks = [];
  const normalR = merge(S.defR, styleChain(S, S.normal).rPr);

  function walk(container, out, inTable) {
    for (const el of container.children) {
      if (el.namespaceURI !== W) continue;
      const ln = el.localName;
      if (ln === 'p') para(el, out, inTable);
      else if (ln === 'tbl') table(el, out);
      else if (ln === 'sdt') { const c = kid(el, 'sdtContent'); if (c) walk(c, out, inTable); }
      else if (ln === 'customXml' || ln === 'smartTag') walk(el, out, inTable);
    }
  }

  function para(el, out, inTable) {
    const pPrEl = kid(el, 'pPr');
    const direct = parsePPr(pPrEl);
    const sid = at(kid(pPrEl, 'pStyle'), 'val') || S.normal;
    const st = styleChain(S, sid);
    let pp = merge(S.defP, st.pPr);
    const numId = direct.numId ?? st.pPr.numId;
    const ilvl = direct.ilvl ?? st.pPr.ilvl ?? 0;
    const baseR = merge(S.defR, st.rPr);
    let label = null, labelR = null, suff = 'tab';
    if (numId && numId !== '0') {
      const L = numLabel(N, ctx.cnt, numId, ilvl);
      if (L) { label = L.text; pp = merge(pp, L.lv.pPr); labelR = merge(baseR, L.lv.rPr); suff = L.lv.suff; }
    }
    pp = merge(pp, direct);
    const sname = (S.byId[sid] || {}).name || '';
    const toc = /^toc|table of figures|สารบัญ/.test(sname);
    const isHeading = !toc && (/^heading|หัวเรื่อง|^title$/.test(sname) || (pp.outline != null && pp.outline < 9));
    if (pp.pbb && !hasLR) ctx.page++;
    const P = { text: '', runs: [], pp, label, labelR, suff, inTable, toc, isHeading, page: ctx.page, breaks: [], idx: ctx.paras.length };
    ctx.paras.push(P);
    out.push({ t: 'p', p: P });
    const boxes = [];
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
    const pageBreak = () => {
      ctx.page++;
      if (!P.text && !P.runs.length) P.page = ctx.page; else P.breaks.push(P.text.length);
    };
    const pushImg = img => { P.runs.push({ s: P.text.length, e: P.text.length, img }); lastKey = null; };
    const textbox = txbx => { const bx = { t: 'tbx', blocks: [] }; walk(txbx, bx.blocks, inTable); boxes.push(bx); };

    const drawing = dr => {
      const ext = dr.getElementsByTagNameNS(WP, 'extent')[0];
      const w = ext ? +ext.getAttribute('cx') / 9525 : 0, h = ext ? +ext.getAttribute('cy') / 9525 : 0;
      const tb = dr.getElementsByTagNameNS(W, 'txbxContent')[0];
      if (tb) { textbox(tb); return; }
      const blip = dr.getElementsByTagNameNS(A, 'blip')[0];
      const gd = dr.getElementsByTagNameNS(A, 'graphicData')[0];
      const uri = gd ? gd.getAttribute('uri') || '' : '';
      if (blip) {
        const im = image(blip.getAttributeNS(R, 'embed') || blip.getAttribute('r:embed'));
        pushImg({ url: im && im.url, kind: im ? im.kind : '', w, h });
      } else if (/chart/i.test(uri)) pushImg({ url: null, kind: 'chart', w, h });
      else if (/diagram/i.test(uri)) pushImg({ url: null, kind: 'diagram', w, h });
    };
    const pict = pc => {
      const tb = pc.getElementsByTagNameNS(W, 'txbxContent')[0];
      if (tb) { textbox(tb); return; }
      const idata = pc.getElementsByTagNameNS(V, 'imagedata')[0];
      if (!idata) return;
      const shape = idata.parentNode;
      const style = (shape && shape.getAttribute && shape.getAttribute('style')) || '';
      const len = k => { const m = style.match(new RegExp(k + ':\\s*([\\d.]+)(pt|px|in)?')); if (!m) return 0; return +m[1] * (m[2] === 'in' ? 96 : m[2] === 'px' ? 1 : 4 / 3); };
      const im = image(idata.getAttributeNS(R, 'id') || idata.getAttribute('r:id'));
      pushImg({ url: im && im.url, kind: im ? im.kind : '', w: len('width'), h: len('height') });
    };
    const run = r => {
      const d = parseRPr(kid(r, 'rPr'));
      let rp = baseR;
      if (d.rStyle) rp = merge(rp, styleChain(S, d.rStyle).rPr);
      rp = merge(rp, d);
      delete rp.rStyle;
      if (rp.vanish) return; // hidden text
      for (const c of r.children) {
        if (c.namespaceURI === W) {
          switch (c.localName) {
            case 't': add(c.textContent, rp); break;
            case 'tab': case 'ptab': add('\t', rp); break;
            case 'br': if (at(c, 'type') === 'page') { if (!hasLR) pageBreak(); } else add('\n', rp); break;
            case 'cr': add('\n', rp); break;
            case 'noBreakHyphen': add('-', rp); break;
            case 'lastRenderedPageBreak': if (hasLR) pageBreak(); break;
            case 'drawing': drawing(c); break;
            case 'pict': pict(c); break;
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
        if (c.namespaceURI !== W) continue;
        switch (c.localName) {
          case 'r': run(c); break;
          case 'hyperlink': case 'ins': case 'smartTag': case 'fldSimple': case 'customXml': case 'moveTo': inl(c); break;
          case 'sdt': { const sc = kid(c, 'sdtContent'); if (sc) inl(sc); break; }
        }
      }
    };
    inl(el);

    if (isHeading && !inTable && P.text.trim()) ctx.heading = P.text.replace(/\s+/g, ' ').trim().slice(0, 80);
    P.heading = isHeading ? '' : ctx.heading;
    for (const b of boxes) out.push(b);
  }

  function table(tblEl, out) {
    const grid = kids(kid(tblEl, 'tblGrid'), 'gridCol').map(g => +at(g, 'w') || 0);
    const tblPr = kid(tblEl, 'tblPr');
    const tw = kid(tblPr, 'tblW');
    let width = null;
    if (tw) {
      const ty = at(tw, 'type'), v = at(tw, 'w') || '';
      if (ty === 'pct') width = /%$/.test(v) ? parseFloat(v) + '%' : (+v / 50) + '%';
      else if (ty === 'dxa' && +v) width = +v / 15;
    }
    const bd = kid(tblPr, 'tblBorders');
    const noBorder = !!bd && [...bd.children].length > 0 && [...bd.children].every(b => /^(none|nil)$/.test(at(b, 'val') || ''));
    const jc = at(kid(tblPr, 'jc'), 'val');
    const T = { t: 'tbl', grid, rows: [], width, noBorder, jc };
    const owner = [];
    for (const tr of kids(tblEl, 'tr')) {
      const row = [];
      const trPr = kid(tr, 'trPr');
      let col = +(at(kid(trPr, 'gridBefore'), 'val') || 0);
      for (const tc of tr.children) {
        if (tc.localName !== 'tc' || tc.namespaceURI !== W) continue;
        const tcPr = kid(tc, 'tcPr');
        const span = +(at(kid(tcPr, 'gridSpan'), 'val') || 1);
        const vm = kid(tcPr, 'vMerge');
        const vmv = vm ? (at(vm, 'val') || 'continue') : null;
        if (vmv === 'continue' && owner[col]) {
          owner[col].rowspan++;
          walk(tc, owner[col].blocks, true);
          col += span;
          continue;
        }
        const f = at(kid(tcPr, 'shd'), 'fill');
        const cell = { span, rowspan: 1, blocks: [], fill: f && f !== 'auto' ? f : null, va: at(kid(tcPr, 'vAlign'), 'val') };
        walk(tc, cell.blocks, true);
        for (let k = col; k < col + span; k++) owner[k] = vmv === 'restart' ? cell : null;
        row.push(cell);
        col += span;
      }
      T.rows.push(row);
    }
    out.push(T);
  }

  walk(body, blocks, false);

  const paras = ctx.paras;
  let n = 0;
  for (const p of paras) if (p.text.trim()) p.no = ++n;
  return {
    kind: 'docx', paras, blocks, notes: [], urls, hasPages: hasLR || ctx.page > 1, pages: ctx.page,
    pg, theme, normalR,
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
    .replace(/[-]/g, c => String.fromCharCode(PUA[c.charCodeAt(0)] || c.charCodeAt(0)))
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
    let s = fixThai(it.str).replace(/[  ]{2,}/g, ' ');
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
