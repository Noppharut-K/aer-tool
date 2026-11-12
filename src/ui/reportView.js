/**
 * reportView.js — draws the report beside the findings list.
 *   Word  → white pages laid out from the file's own styles: fonts and
 *           sizes, bold/italic, indents, numbering, tables, images, and the
 *           page breaks Word recorded the last time it saved the file.
 *   PDF   → the real pages, rendered by pdf.js, with boxes over each finding.
 *   Text  → one plain page.
 * The pages stay paper-white in dark mode, like Word's own page view.
 */
import { SEV_ORDER } from '../core/reportCheck.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const showWs = s => esc(s.replace(/[​-‍⁠﻿]/g, '◌')).replace(/ /g, '·').replace(/\n/g, '↵').replace(/\t/g, '→');
const TW = 15; // twips per CSS px
const THAI = /[฀-๿]/;

/* Thai fonts designed small for their point size (TH Sarabun, Angsana,
   Cordia…) are drawn with Sarabun, scaled to look the same size. */
function cssFont(name) {
  if (!name) return { fam: "'Sarabun', sans-serif", k: 0.78 };
  const n = name.toLowerCase();
  if (/sarabun|angsana|cordia|browallia|^th |psk|jasmine|eucrosia|freesia|irisupc|lilyupc|dillenia|kodchiang|upc$/.test(n)) return { fam: "'Sarabun', sans-serif", k: 0.78 };
  return { fam: "'" + name.replace(/'/g, '') + "', 'Sarabun', sans-serif", k: 1 };
}
const HL = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000' };

function themeFont(doc, t, script) {
  if (!t) return null;
  const set = /^major/.test(t) ? doc.theme.major : doc.theme.minor;
  return /Bidi|cs/i.test(t) ? set.thai : set.latin;
}

function runCss(doc, rp, thai) {
  rp = rp || {};
  const b = thai ? (rp.bCs ?? rp.b) : rp.b;
  const i = thai ? (rp.iCs ?? rp.i) : rp.i;
  const sz = (thai ? (rp.szCs ?? rp.sz) : rp.sz) ?? (thai ? (doc.normalR.szCs ?? doc.normalR.sz) : doc.normalR.sz) ?? 22;
  const name = thai
    ? (rp.fC || themeFont(doc, rp.fCT) || doc.theme.minor.thai || rp.fA || themeFont(doc, rp.fAT))
    : (rp.fA || themeFont(doc, rp.fAT) || doc.theme.minor.latin);
  const f = cssFont(name);
  let px = sz / 2 * 4 / 3 * f.k;
  const css = ['font-family:' + f.fam];
  if (rp.vert === 'superscript' || rp.vert === 'subscript') { css.push('vertical-align:' + (rp.vert === 'superscript' ? 'super' : 'sub')); px *= 0.66; }
  css.push('font-size:' + px.toFixed(1) + 'px');
  if (b) css.push('font-weight:700');
  if (i) css.push('font-style:italic');
  const dec = [rp.u && 'underline', (rp.strike || rp.dstrike) && 'line-through'].filter(Boolean);
  if (dec.length) css.push('text-decoration:' + dec.join(' '));
  if (rp.color && /^[0-9a-f]{6}$/i.test(rp.color)) css.push('color:#' + rp.color);
  if (rp.hl && HL[rp.hl]) css.push('background:' + HL[rp.hl]);
  else if (rp.shd && /^[0-9a-f]{6}$/i.test(rp.shd)) css.push('background:#' + rp.shd);
  if (rp.caps) css.push('text-transform:uppercase');
  if (rp.smallCaps) css.push('font-variant:small-caps');
  return css.join(';');
}

/* Text of [a,b) of a paragraph: formatting spans from `runs`, findings as
   <mark>. Overlaps keep the most severe finding. */
function issueAt(spans, a, b) {
  let best = null;
  for (const [s, e, i] of spans) if (s <= a && e >= b && (!best || SEV_ORDER[i.sev] < SEV_ORDER[best.sev])) best = i;
  return best;
}
function spansOf(issues) {
  const spans = [];
  for (const i of issues) for (const [s, e] of i.ranges) if (e > s) spans.push([s, e, i]);
  return spans;
}
function markOpen(i, sel) { return '<mark class="rc-m sev-' + i.sev + (sel === i.id ? ' sel' : '') + '" data-i="' + i.id + '">'; }

function wordText(doc, p, issues, sel, a = 0, b = p.text.length) {
  const spans = spansOf(issues);
  const cuts = new Set([a, b]);
  for (const [s, e] of spans) { if (s > a && s < b) cuts.add(s); if (e > a && e < b) cuts.add(e); }
  let out = '';
  for (const r of p.runs) {
    if (r.img) {
      if (r.s < a || r.s > b || (r.s === b && b !== p.text.length)) continue;
      out += imgHtml(r.img);
      continue;
    }
    const s0 = Math.max(a, r.s), e0 = Math.min(b, r.e);
    if (s0 >= e0) continue;
    const pts = [s0, ...[...cuts].filter(c => c > s0 && c < e0).sort((x, y) => x - y), e0];
    const runThai = THAI.test(p.text.slice(r.s, r.e));
    for (let k = 0; k + 1 < pts.length; k++) {
      const seg = p.text.slice(pts[k], pts[k + 1]);
      const iss = issueAt(spans, pts[k], pts[k + 1]);
      let inner = '';
      /* Latin words take the Latin font; Thai and neutral text the Thai one */
      for (const part of seg.split(/([A-Za-z][A-Za-z'’\-.]*)/)) {
        if (!part) continue;
        const latin = /[A-Za-z]/.test(part);
        const thai = !latin && (THAI.test(part) || runThai);
        const txt = iss && /^[\s​-‍⁠﻿]+$/.test(part) ? showWs(part) : esc(part);
        inner += '<span style="' + runCss(doc, r.rp, thai) + '">' + txt + '</span>';
      }
      out += iss ? markOpen(iss, sel) + inner + '</mark>' : inner;
    }
  }
  return out;
}

function imgHtml(im) {
  const w = Math.round(im.w || 0), h = Math.round(im.h || 0);
  const size = w && h ? 'width:' + w + 'px;height:' + h + 'px;' : '';
  if (im.url) return '<img class="rc-img" src="' + im.url + '" alt="" style="' + size + '">';
  const label = im.kind === 'chart' ? 'แผนภูมิ / Chart' : im.kind === 'diagram' ? 'SmartArt' : 'รูปภาพ ' + (im.kind || '');
  return '<span class="rc-imgph" style="' + (size || 'width:160px;height:90px;') + '">' + esc(label) + '</span>';
}

function paraHtml(doc, p, issues, sel) {
  const pp = p.pp || {};
  const st = [];
  const left = (pp.indL || 0) / TW, right = (pp.indR || 0) / TW;
  const hang = (pp.hang || 0) / TW, first = (pp.first || 0) / TW;
  if (pp.spB) st.push('margin-top:' + (pp.spB / TW).toFixed(1) + 'px');
  st.push('margin-bottom:' + ((pp.spA || 0) / TW).toFixed(1) + 'px');
  if (left) st.push('padding-left:' + left.toFixed(1) + 'px');
  if (right) st.push('padding-right:' + right.toFixed(1) + 'px');
  if (hang) st.push('text-indent:' + (-hang).toFixed(1) + 'px');
  else if (first) st.push('text-indent:' + first.toFixed(1) + 'px');
  const jc = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[pp.jc];
  if (jc) st.push('text-align:' + jc);
  if (pp.line) {
    if (pp.lineRule === 'auto') st.push('line-height:' + (1.35 * pp.line / 240).toFixed(2));
    else st.push('line-height:' + (pp.line / TW).toFixed(1) + 'px');
  }
  if (pp.fill && /^[0-9a-f]{6}$/i.test(pp.fill)) st.push('background:#' + pp.fill);

  let label = '';
  if (p.label) {
    const lt = THAI.test(p.label) || THAI.test(p.text);
    const lw = p.suff === 'tab' && hang ? ';display:inline-block;min-width:' + hang.toFixed(1) + 'px;text-indent:0' : '';
    label = '<span class="rc-lbl" style="' + runCss(doc, p.labelR, lt) + lw + '">' + esc(p.label) + '</span>' +
      (p.suff === 'space' ? ' ' : (p.suff === 'tab' && !hang ? ' ' : ''));
  }
  let body;
  const cut = p.toc ? p.text.lastIndexOf('\t') : -1;
  if (cut > 0) {
    body = '<span class="rc-toc-t">' + label + wordText(doc, p, issues, sel, 0, cut) + '</span><span class="rc-ldr"></span>' +
      '<span>' + wordText(doc, p, issues, sel, cut + 1) + '</span>';
    st.push('display:flex;align-items:baseline');
    label = '';
  } else {
    body = label + wordText(doc, p, issues, sel);
  }
  if (!p.text && !p.runs.some(r => r.img)) body += '<span style="' + runCss(doc, (p.runs[0] || {}).rp || p.labelR || {}, true) + '">​</span>';
  const cls = 'rc-wp' + (p.isHeading ? ' hd' : '');
  return '<p class="' + cls + '" id="rc-p-' + p.idx + '" style="' + st.join(';') + '">' + body + '</p>';
}

function blocksHtml(doc, blocks, byPara, sel) {
  let h = '';
  for (const b of blocks) {
    if (b.t === 'p') h += paraHtml(doc, b.p, byPara.get(b.p.idx) || [], sel);
    else if (b.t === 'tbl') h += tableHtml(doc, b, byPara, sel);
    else if (b.t === 'tbx') h += '<div class="rc-tbx">' + blocksHtml(doc, b.blocks, byPara, sel) + '</div>';
  }
  return h;
}

function tableHtml(doc, T, byPara, sel) {
  const total = T.grid.reduce((a, b) => a + b, 0) || 1;
  const contentW = (doc.pg.w - doc.pg.l - doc.pg.r) / TW;
  const width = typeof T.width === 'string' ? T.width : Math.min(T.width || total / TW, contentW).toFixed(0) + 'px';
  let h = '<div class="rc-tblwrap"><table class="rc-tbl' + (T.noBorder ? ' nb' : '') + '" style="width:' + width + (T.jc === 'center' ? ';margin:0 auto' : '') + '">';
  if (T.grid.length) h += '<colgroup>' + T.grid.map(w => '<col style="width:' + (w / total * 100).toFixed(2) + '%">').join('') + '</colgroup>';
  for (const row of T.rows) {
    h += '<tr>';
    for (const c of row) {
      const st = [];
      if (c.fill && /^[0-9a-f]{6}$/i.test(c.fill)) st.push('background:#' + c.fill);
      if (c.va) st.push('vertical-align:' + (c.va === 'center' ? 'middle' : c.va === 'bottom' ? 'bottom' : 'top'));
      h += '<td' + (c.span > 1 ? ' colspan="' + c.span + '"' : '') + (c.rowspan > 1 ? ' rowspan="' + c.rowspan + '"' : '') +
        (st.length ? ' style="' + st.join(';') + '"' : '') + '>' + blocksHtml(doc, c.blocks, byPara, sel) + '</td>';
    }
    h += '</tr>';
  }
  return h + '</table></div>';
}

function firstPara(b) {
  if (b.t === 'p') return b.p;
  const list = b.t === 'tbl' ? b.rows.flatMap(r => r.flatMap(c => c.blocks)) : b.blocks;
  for (const x of list) { const p = firstPara(x); if (p) return p; }
  return null;
}

export function renderWord(el, doc, byPara, sel, pageLbl) {
  const pg = doc.pg;
  const w = pg.w / TW;
  const groups = [];
  for (const b of doc.blocks) {
    const p = firstPara(b);
    const page = p ? p.page : (groups.length ? groups[groups.length - 1].page : 1);
    if (!groups.length || (doc.hasPages && page !== groups[groups.length - 1].page)) groups.push({ page, blocks: [] });
    groups[groups.length - 1].blocks.push(b);
  }
  const pad = [pg.t, pg.r, pg.b, pg.l].map(v => Math.min(v / TW, 120).toFixed(0) + 'px').join(' ');
  let h = '<div class="rc-pages" style="width:' + w.toFixed(0) + 'px">';
  for (const g of groups) {
    if (doc.hasPages) h += '<div class="rc-sheet-lbl">' + esc(pageLbl) + ' ' + g.page + '</div>';
    h += '<section class="rc-sheet word" style="min-height:' + (pg.h / TW).toFixed(0) + 'px;padding:' + pad + ';contain-intrinsic-size:auto ' + (pg.h / TW).toFixed(0) + 'px">' +
      blocksHtml(doc, g.blocks, byPara, sel) + '</section>';
  }
  el.innerHTML = h + '</div>';
  return w;
}

export function renderPlain(el, doc, byPara, sel) {
  let h = '<div class="rc-pages" style="width:794px"><section class="rc-sheet plain">';
  doc.paras.forEach((p, pi) => {
    const spans = spansOf(byPara.get(pi) || []);
    const cuts = new Set([0, p.text.length]);
    for (const [s, e] of spans) { cuts.add(s); cuts.add(e); }
    const pts = [...cuts].filter(c => c >= 0 && c <= p.text.length).sort((a, b) => a - b);
    let body = '';
    for (let k = 0; k + 1 < pts.length; k++) {
      const seg = p.text.slice(pts[k], pts[k + 1]);
      const iss = issueAt(spans, pts[k], pts[k + 1]);
      body += iss ? markOpen(iss, sel) + (/^[\s​-‍⁠﻿]+$/.test(seg) ? showWs(seg) : esc(seg)) + '</mark>' : esc(seg);
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

export function renderPdf(el, doc, byPara, sel, cache, pageLbl) {
  const hl = new Map();
  byPara.forEach((issues, pi) => {
    const p = doc.paras[pi];
    for (const i of issues) for (const r of rects(doc, p, i)) {
      if (!hl.has(p.page)) hl.set(p.page, []);
      hl.get(p.page).push('<div class="rc-hl sev-' + i.sev + (sel === i.id ? ' sel' : '') + '" data-i="' + i.id + '" style="left:' + r[0].toFixed(1) +
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
