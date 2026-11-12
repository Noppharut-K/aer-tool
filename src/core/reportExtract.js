/**
 * reportExtract.js — turn a Word (.docx), PDF or pasted text into the
 * paragraph list that reportCheck.js reads. Runs entirely in the browser.
 *
 * .docx is a zip; it is opened with SheetJS's zip reader (XLSX.CFB, already
 * loaded for Excel), so no extra library. PDF text comes from pdf.js, loaded
 * only when a PDF is opened.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/* ── Word ───────────────────────────────────────────────────────────────── */

export function extractDocx(buf) {
  const X = window.XLSX;
  if (!X || !X.CFB) throw new Error('nolib');
  let zip;
  try { zip = X.CFB.read(new Uint8Array(buf), { type: 'buffer' }); } catch (e) { throw new Error('notdocx'); }
  const read = path => {
    const e = X.CFB.find(zip, '/' + path); // CFB paths are rooted ("/word/document.xml")
    if (!e || !e.content) return null;
    const c = e.content instanceof Uint8Array ? e.content : new Uint8Array(e.content);
    return new TextDecoder('utf-8').decode(c);
  };
  const xml = read('word/document.xml');
  if (!xml) throw new Error('notdocx');
  const parse = s => new DOMParser().parseFromString(s, 'application/xml');

  /* Style names and outline levels — headings and TOC lines are found by
     style, since Word stores no page numbers. */
  const styles = {};
  const sx = read('word/styles.xml');
  if (sx) {
    for (const st of parse(sx).getElementsByTagNameNS(W, 'style')) {
      const id = st.getAttributeNS(W, 'styleId') || st.getAttribute('w:styleId');
      const nm = st.getElementsByTagNameNS(W, 'name')[0];
      const ol = st.getElementsByTagNameNS(W, 'outlineLvl')[0];
      styles[id] = {
        name: nm ? (nm.getAttributeNS(W, 'val') || nm.getAttribute('w:val') || '') : '',
        outline: ol ? +(ol.getAttributeNS(W, 'val') || ol.getAttribute('w:val')) : null,
      };
    }
  }
  const val = el => el && (el.getAttributeNS(W, 'val') || el.getAttribute('w:val'));

  const d = parse(xml);
  const body = d.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('notdocx');
  const paras = [];
  let heading = '';
  for (const p of body.getElementsByTagNameNS(W, 'p')) {
    /* Text boxes are stored twice (modern + VML fallback): skip the copy */
    let inTable = false, skip = false;
    for (let a = p.parentNode; a && a !== body; a = a.parentNode) {
      if (a.localName === 'Fallback') { skip = true; break; }
      if (a.localName === 'tc') inTable = true;
    }
    if (skip) continue;
    let text = '';
    for (const el of p.getElementsByTagNameNS(W, '*')) {
      const ln = el.localName;
      if (ln !== 't' && ln !== 'tab' && ln !== 'br' && ln !== 'cr' && ln !== 'noBreakHyphen') continue;
      let own = el.parentNode;
      while (own && !(own.localName === 'p' && own.namespaceURI === W)) own = own.parentNode;
      if (own !== p) continue; // belongs to a nested text-box paragraph
      if (ln === 't') text += el.textContent;
      else if (ln === 'tab') text += '\t';
      else if (ln === 'noBreakHyphen') text += '-';
      else text += '\n';
    }
    if (!text.trim()) continue;
    const pPr = p.getElementsByTagNameNS(W, 'pPr')[0];
    const sid = pPr && val(pPr.getElementsByTagNameNS(W, 'pStyle')[0]);
    const st = styles[sid] || {};
    const sname = (st.name || sid || '').toLowerCase();
    const ol = pPr && pPr.getElementsByTagNameNS(W, 'outlineLvl')[0];
    const outline = ol ? +val(ol) : st.outline;
    const isHeading = /heading|หัวเรื่อง|^title$/.test(sname) || (outline != null && outline < 9);
    const toc = /^toc|table of figures|สารบัญ/.test(sname);
    if (isHeading && !toc && !inTable) heading = text.replace(/\s+/g, ' ').trim().slice(0, 80);
    paras.push({ text, heading: isHeading ? '' : heading, isHeading: isHeading && !toc, inTable, toc });
  }
  return { kind: 'docx', paras, notes: [] };
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
    .replace(/ํ([่-๋]?)า/g, '$1ำ')         // ํ + า → ำ
    .replace(/([่-์])([ัิ-ื็])/g, '$2$1') // tone before vowel → vowel first
    .normalize('NFC');
}

const TOC_LINE = /(\.\s?){5,}|…{2,}|_{5,}|\S\s{3,}[0-9๐-๙ivx]{1,4}\s*$/i;
const PAGE_NO = /^[\s\-–—]*(?:หน้า\s*)?[0-9๐-๙ivxlc]{1,4}[\s\-–—]*$/i;
const CAP_START = /^\s*(ตาราง|รูป|ภาพ|แผนภาพ|Table|Figure|Fig\.)\s*(ที่)?\s*[0-9๐-๙]/i;

function pageLines(items) {
  const lines = [];
  let cur = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    if (!it.str) { if (it.hasEOL && cur) cur.eol = true; continue; }
    const [, , c, d, x, y] = it.transform;
    const size = Math.hypot(c, d) || it.height || 10;
    if (!cur || cur.eol || Math.abs(y - cur.y) > size * 0.5 || x < cur.x0 - size) {
      cur = { y, size, x0: x, text: '', end: x };
      lines.push(cur);
    } else if (x - cur.end > size * 0.2 && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) {
      cur.text += ' ';
    }
    cur.text += it.str;
    cur.end = Math.max(cur.end, x + (it.width || 0));
    if (it.hasEOL) cur.eol = true;
  }
  for (const l of lines) l.text = fixThai(l.text).replace(/[  ]{2,}/g, ' ').trim();
  return lines.filter(l => l.text);
}

export async function extractPdf(buf, onProgress) {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    pages.push(pageLines(tc.items));
    page.cleanup();
    if (onProgress) onProgress(n, pdf.numPages);
  }
  await pdf.destroy();

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
     a TOC line. Line breaks are kept as "\n" so the view matches the PDF. */
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
        cur = { text: l.text, page: pi + 1, lineStarts: [0], hf, toc };
        paras.push(cur);
      } else {
        cur.text += '\n';
        cur.lineStarts.push(cur.text.length);
        cur.text += l.text;
      }
      prev = l;
    });
  });

  const notes = [];
  if (chars < pages.length * 40) notes.push('scanned');
  else if (thai > 200 && bad / thai > 0.01) notes.push('garbled');
  notes.push('pdfspace');
  return { kind: 'pdf', paras, notes, pages: pages.length };
}

/* ── Pasted text ────────────────────────────────────────────────────────── */

export function extractText(str) {
  const paras = str.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim()).map(text => ({ text }));
  return { kind: 'text', paras, notes: [] };
}
