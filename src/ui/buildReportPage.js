/**
 * buildReportPage.js — Report Check: open a Word/PDF report (or paste text),
 * list what looks wrong, and highlight each spot in the text. Nothing is
 * edited and nothing leaves the browser.
 */
import { LANG, L } from '../utils/lang.js';
import { runChecks, CATS, SEV_ORDER } from '../core/reportCheck.js';
import { extractDocx, extractPdf, extractText } from '../core/reportExtract.js';
import { renderWord, renderPdf, renderPlain, stopPdf } from './reportView.js';

/* Where a repeated passage counts: 'para' (same paragraph only) or 'doc' */
function savedScope() { try { return localStorage.getItem('aer-rc-scope') === 'doc' ? 'doc' : 'para'; } catch (e) { return 'para'; } }
const RPT = { doc: null, name: '', issues: [], ignored: new Set(), ignoredKeys: new Set(), off: new Set(), sel: null,
  scope: savedScope(), pdfCache: new Map(), zoom: null };
window.RPT = RPT;

const LIST_CAP = 1500;

const TX = {
  th: {
    title: 'Report Check', sub: 'ตรวจรายงาน · คำซ้ำ · คำผิด · เลขตาราง/รูป',
    hero: 'ตรวจรายงานก่อนส่ง',
    heroSub: 'เปิดไฟล์รายงาน แล้วโปรแกรมจะชี้จุดที่น่าจะผิด พร้อมไฮไลต์ในเนื้อหา โดยไม่แก้ไฟล์ของคุณ',
    drop: 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์', dropSub: 'Word (.docx) หรือ PDF',
    privacy: 'ไฟล์ไม่ถูกส่งออกจากเครื่อง ตรวจในเบราว์เซอร์ทั้งหมด',
    paste: 'หรือวางข้อความเพื่อตรวจ', pastePh: 'วางข้อความจากรายงานที่นี่…', pasteBtn: 'ตรวจข้อความ',
    checks: 'สิ่งที่ตรวจ',
    scopeLbl: 'ตรวจข้อความซ้ำ', scopePara: 'ในย่อหน้าเดียวกัน', scopeDoc: 'ทั้งเล่ม',
    scopeHint: { para: 'ขึ้นย่อหน้าใหม่แล้วไม่นับว่าซ้ำ', doc: 'แจ้งเมื่อข้อความซ้ำที่ใดก็ได้ในเล่ม' },
    reading: 'กำลังอ่านไฟล์…', readingPdf: 'กำลังอ่าน PDF หน้า', checking: 'กำลังตรวจ…',
    zoomIn: 'ขยาย', zoomOut: 'ย่อ', zoomFit: 'พอดีความกว้าง',
    newFile: 'เปิดไฟล์อื่น', export: 'Export Excel', restore: 'คืนรายการที่ข้าม',
    pages: 'หน้า', paras: 'ย่อหน้า', pastedName: 'ข้อความที่วาง',
    total: 'จุดที่พบ', none: 'ไม่พบจุดที่ต้องตรวจในหมวดที่เลือก',
    clean: 'ไม่พบจุดที่น่าจะผิด',
    ignore: 'ข้าม', ignoreAll: 'ข้ามทั้งหมดแบบนี้', copy: 'คัดลอกไปค้นหา', copied: 'คัดลอกแล้ว',
    page: 'หน้า', para: 'ย่อหน้า', table: 'ในตาราง', heading: 'หัวข้อ',
    more: n => `แสดง ${LIST_CAP} รายการแรกจาก ${n} — ปิดบางหมวดด้านบนเพื่อดูส่วนที่เหลือ`,
    fix: 'แก้เป็น',
    sev: { err: 'ควรแก้', warn: 'ควรตรวจ', info: 'ข้อสังเกต' },
    cat: {
      spell: 'คำที่มักสะกดผิด', char: 'อักขระผิดปกติ', dupword: 'คำซ้ำติดกัน', dupphrase: 'ข้อความซ้ำ',
      number: 'เลขตาราง/รูป', consist: 'เขียนไม่เหมือนกัน', overuse: 'คำเดิมถี่', space: 'เว้นวรรค', pair: 'วงเล็บ/คำพูด',
    },
    catDesc: {
      spell: 'คำที่พบบ่อยว่าสะกดผิด เช่น อนุญาติ, ปรากฎ, แพลงตอน, คลอโรฟิล',
      char: 'ตัวอักษรที่ดูเหมือนถูกแต่ค้นหาไม่เจอ เช่น เ+เ แทน แ, \u0E4D+า แทน ำ, อักขระล่องหน, oC',
      dupword: 'คำเดียวกันติดกัน เช่น "การการ", "the the"',
      dupphrase: 'ข้อความ 8 คำขึ้นไปที่ซ้ำในย่อหน้าเดียวกัน หรือเลือกให้ตรวจทั้งเล่ม (ย่อหน้าซ้ำ / ข้อความ 12 คำขึ้นไป)',
      number: 'เลขตาราง/รูปข้าม ซ้ำ สลับลำดับ อ้างถึงตารางที่ไม่มี และลิงก์อ้างอิงใน Word ที่เสีย',
      consist: 'หน่วยหรือคำเดียวกันเขียนหลายแบบ เช่น mg/L กับ mg/l, ไนเตรท กับ ไนเตรต, ๆ เว้นวรรคไม่เหมือนกัน',
      overuse: 'คำเดิมใช้ 3 ครั้งขึ้นไปในช่วงสั้น ๆ',
      space: 'เว้นวรรคซ้อน และวรรคหน้าจุลภาคหรือในวงเล็บ (Word และข้อความที่วาง)',
      pair: 'วงเล็บหรือเครื่องหมายคำพูดเปิดแล้วไม่ปิด',
    },
    msg: {
      ee: 'พิมพ์ เ สองตัวแทน แ — ดูเหมือนกันแต่ค้นหาและเรียงคำไม่ได้',
      am: 'พิมพ์ \u0E4D กับ า แยกกันแทน ำ — ดูเหมือนกันแต่ค้นหาไม่เจอ',
      mark2: 'สระหรือวรรณยุกต์ซ้อนกันสองตัว',
      order: 'พิมพ์วรรณยุกต์ก่อนสระบน — ดูเหมือนถูกแต่ค้นหาไม่เจอ',
      zw: n => `มีอักขระล่องหน ${n} ตัว (มักติดมาจากการคัดลอกเว็บ)`,
      deg: 'ใช้ตัว o หรือ º แทนเครื่องหมายองศา',
      field: 'ลิงก์อ้างอิงใน Word เสีย — ใน Word กด Ctrl+A แล้ว F9 เพื่ออัปเดต หรือสร้างการอ้างอิงใหม่',
      line: 'คร่อมบรรทัด — ตรวจในไฟล์จริงว่าซ้ำหรือไม่',
      double: 'เว้นวรรคซ้อน',
      punct: 'มีวรรคหน้าเครื่องหมายหรือในวงเล็บ',
      open: 'เปิดแล้วไม่พบตัวปิดในย่อหน้าเดียวกัน',
      close: 'พบตัวปิดโดยไม่มีตัวเปิด',
      para: 'ทั้งย่อหน้าซ้ำกับ',
      phrase: 'ข้อความช่วงนี้ซ้ำกับ',
      phraseSame: 'ข้อความช่วงนี้ซ้ำกับช่วงก่อนหน้าในย่อหน้าเดียวกัน (ไฮไลต์ทั้งสองช่วง)',
      capdup: 'เลขซ้ำกับที่มีแล้วใน',
      capstart: 'ลำดับไม่ได้เริ่มที่ 1',
      capgap: n => `เลขข้าม — ก่อนหน้านี้ถึงเลข ${n}`,
      caporder: n => `ลำดับสลับ — ก่อนหน้านี้ถึงเลข ${n} แล้ว`,
      capsep: 'รูปแบบเลขไม่เหมือนที่อื่น (ใช้ทั้ง - และ .)',
      refmissing: k => `อ้างถึง${k === 'table' ? 'ตาราง' : 'รูป'}ที่ไม่พบคำบรรยายในเอกสาร`,
      yamok: c => `เอกสารส่วนใหญ่เขียน ๆ อีกแบบ (${c[0]} ครั้ง เทียบกับแบบนี้ ${c[1]} ครั้ง)`,
      thdigit: c => `ใช้เลขไทยปนกับเลขอารบิก (ไทย ${c[0]} / อารบิก ${c[1]})`,
      ardigit: c => `ใช้เลขอารบิกปนกับเลขไทย (ไทย ${c[0]} / อารบิก ${c[1]})`,
      unit: c => `หน่วยเดียวกันเขียนต่างกัน (แบบที่ใช้มากกว่า ${c[0]} ครั้ง, แบบนี้ ${c[1]} ครั้ง)`,
      term: c => `คำเดียวกันสะกดสองแบบ (แบบที่ใช้มากกว่า ${c[0]} ครั้ง, แบบนี้ ${c[1]} ครั้ง)`,
      overuse: n => `ใช้คำนี้ ${n} ครั้งในช่วงสั้น ๆ`,
      spell: 'คำนี้มักสะกดผิด',
    },
    note: {
      scanned: 'PDF นี้แทบไม่มีข้อความ อาจเป็นไฟล์สแกน — ตรวจได้เฉพาะไฟล์ที่มีข้อความจริง ลองใช้ไฟล์ Word แทน',
      garbled: 'ข้อความภาษาไทยใน PDF นี้ดึงออกมาได้ไม่สมบูรณ์ (สระ/วรรณยุกต์เพี้ยน) อาจมีจุดที่ชี้ผิด — ถ้ามีไฟล์ Word จะแม่นกว่า',
      pdfspace: 'PDF ไม่ได้เก็บการเว้นวรรคไว้จริง จึงไม่ตรวจหมวดเว้นวรรค และหัวกระดาษ/ท้ายกระดาษที่ซ้ำทุกหน้าจะถูกข้าม',
    },
    err: {
      type: 'รองรับเฉพาะไฟล์ .docx และ .pdf', doc: 'ไฟล์ .doc แบบเก่ายังไม่รองรับ — เปิดใน Word แล้วบันทึกเป็น .docx ก่อน',
      notdocx: 'เปิดไฟล์ Word นี้ไม่ได้ ไฟล์อาจเสียหรือมีรหัสผ่าน', pdf: 'เปิด PDF นี้ไม่ได้ ไฟล์อาจเสียหรือมีรหัสผ่าน',
      nolib: 'โหลดตัวอ่านไฟล์ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่', empty: 'ไม่พบข้อความในไฟล์นี้',
    },
    xlsx: ['ลำดับ', 'ระดับ', 'หมวด', 'ตำแหน่ง', 'หัวข้อ', 'ที่พบ', 'แก้เป็น', 'รายละเอียด', 'ข้อความรอบ ๆ'],
  },
  en: {
    title: 'Report Check', sub: 'Proofread reports · repeated words · misspellings · table/figure numbers',
    hero: 'Check a report before sending',
    heroSub: 'Open a report and every spot that looks wrong is listed and highlighted in the text. Your file is not changed.',
    drop: 'Drop a file here, or click to choose one', dropSub: 'Word (.docx) or PDF',
    privacy: 'Your file stays on this computer — everything runs in the browser',
    paste: 'Or paste text to check', pastePh: 'Paste report text here…', pasteBtn: 'Check text',
    checks: 'What is checked',
    scopeLbl: 'Repeated passages', scopePara: 'Within a paragraph', scopeDoc: 'Whole report',
    scopeHint: { para: 'A new paragraph does not count as a repeat', doc: 'Flag a passage repeated anywhere in the report' },
    reading: 'Reading file…', readingPdf: 'Reading PDF page', checking: 'Checking…',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomFit: 'Fit to width',
    newFile: 'Open another file', export: 'Export Excel', restore: 'Restore skipped',
    pages: 'pages', paras: 'paragraphs', pastedName: 'Pasted text',
    total: 'Found', none: 'Nothing to check in the selected categories',
    clean: 'Nothing that looks wrong was found',
    ignore: 'Skip', ignoreAll: 'Skip all like this', copy: 'Copy to search', copied: 'Copied',
    page: 'Page', para: 'Paragraph', table: 'in a table', heading: 'Section',
    more: n => `Showing the first ${LIST_CAP} of ${n} — turn off some categories above to see the rest`,
    fix: 'Change to',
    sev: { err: 'Fix', warn: 'Check', info: 'Note' },
    cat: {
      spell: 'Common misspellings', char: 'Odd characters', dupword: 'Repeated words', dupphrase: 'Repeated passages',
      number: 'Table/figure numbers', consist: 'Inconsistent forms', overuse: 'Overused words', space: 'Spacing', pair: 'Brackets/quotes',
    },
    catDesc: {
      spell: 'Thai words often misspelled, e.g. อนุญาติ, ปรากฎ, แพลงตอน, คลอโรฟิล',
      char: 'Characters that look right but break search: เ+เ for แ, \u0E4D+า for ำ, invisible characters, oC',
      dupword: 'The same word twice in a row, e.g. "การการ", "the the"',
      dupphrase: 'Passages of 8+ words repeated within one paragraph — or, if chosen, anywhere in the report (whole paragraphs / 12+ words)',
      number: 'Skipped, duplicated or out-of-order table/figure numbers, references to missing ones, broken Word cross-references',
      consist: 'Units or terms written more than one way: mg/L vs mg/l, ไนเตรท vs ไนเตรต, ๆ spacing',
      overuse: 'The same word 3+ times within a short span',
      space: 'Double spaces, spaces before commas or inside brackets (Word and pasted text)',
      pair: 'Brackets or quotes opened but not closed',
    },
    msg: {
      ee: 'Two เ typed instead of แ — looks the same but breaks search and sorting',
      am: '\u0E4D and า typed separately instead of ำ — looks the same but breaks search',
      mark2: 'The same vowel or tone mark twice',
      order: 'Tone mark typed before the upper vowel — looks right but breaks search',
      zw: n => `${n} invisible character(s), usually pasted from the web`,
      deg: 'Letter o or º used instead of the degree sign',
      field: 'Broken Word cross-reference — in Word press Ctrl+A then F9 to update, or insert the reference again',
      line: 'Across a line break — check in the file',
      double: 'Double space',
      punct: 'Space before punctuation or inside brackets',
      open: 'Opened but not closed in this paragraph',
      close: 'Closed without an opening one',
      para: 'Whole paragraph repeats',
      phrase: 'This passage repeats',
      phraseSame: 'This passage repeats an earlier one in the same paragraph (both are highlighted)',
      capdup: 'Number already used at',
      capstart: 'Numbering does not start at 1',
      capgap: n => `Number skipped — the previous one was ${n}`,
      caporder: n => `Out of order — numbering had already reached ${n}`,
      capsep: 'Number style differs from the rest (both - and . are used)',
      refmissing: k => `Refers to a ${k} with no caption in the document`,
      yamok: c => `ๆ is mostly written the other way (${c[0]} vs ${c[1]} times)`,
      thdigit: c => `Thai digits mixed with Arabic digits (Thai ${c[0]} / Arabic ${c[1]})`,
      ardigit: c => `Arabic digits mixed with Thai digits (Thai ${c[0]} / Arabic ${c[1]})`,
      unit: c => `Same unit written differently (usual form ${c[0]} times, this form ${c[1]})`,
      term: c => `Same term spelled two ways (usual form ${c[0]} times, this form ${c[1]})`,
      overuse: n => `Used ${n} times within a short span`,
      spell: 'Commonly misspelled',
    },
    note: {
      scanned: 'This PDF has almost no text — it may be a scan. Only PDFs with real text can be checked; try the Word file instead.',
      garbled: 'Thai text in this PDF did not extract cleanly (vowels/tone marks are off), so some findings may be wrong. A Word file is more accurate.',
      pdfspace: 'PDFs do not keep real spacing, so spacing is not checked, and headers/footers repeated on every page are skipped.',
    },
    err: {
      type: 'Only .docx and .pdf files are supported', doc: 'Old .doc files are not supported — open it in Word and save as .docx first',
      notdocx: 'This Word file could not be opened. It may be damaged or password-protected.', pdf: 'This PDF could not be opened. It may be damaged or password-protected.',
      nolib: 'The file reader did not load. Check the internet connection and try again.', empty: 'No text was found in this file',
    },
    xlsx: ['No.', 'Level', 'Category', 'Location', 'Section', 'Found', 'Change to', 'Details', 'Context'],
  },
};
const tx = () => TX[LANG] || TX.th;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const showWs = s => esc(s).replace(/ /g, '·').replace(/\n/g, '↵').replace(/\t/g, '→');

let rootEl = null;

export function buildReportPage(el) {
  rootEl = el;
  render();
}
/* Re-render in the current language (called by main.js on TH/EN switch) */
export function refreshReportPage() { if (rootEl) render(); }

function render() {
  const t = tx(), l = L[LANG] || L.th;
  rootEl.innerHTML =
    '<div class="ph"><button class="ph-back" data-back="rpt"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>' + esc(l.back) + '</button>' +
    '<div class="ph-div"></div><div style="display:flex;flex-direction:column;gap:1px"><span class="ph-title">' + t.title + '</span><span class="ph-sub">' + esc(t.sub) + '</span></div></div>' +
    '<div class="rc-body" id="rc-body"></div>';
  if (RPT.doc) renderResult(); else renderStart();
}

/* ── Start screen ───────────────────────────────────────────────────────── */

function renderStart() {
  const t = tx();
  const body = document.getElementById('rc-body');
  body.classList.remove('has-doc');
  body.innerHTML =
    '<div class="rc-start">' +
    '<h2 class="rc-hero">' + esc(t.hero) + '</h2><p class="rc-hero-sub">' + esc(t.heroSub) + '</p>' +
    '<div class="rc-drop" id="rc-drop" role="button" tabindex="0">' +
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><polyline points="14 3 14 8 19 8"/><path d="M9 14l2 2 4-4"/></svg>' +
    '<div class="rc-drop-lbl">' + esc(t.drop) + '</div><div class="rc-drop-sub">' + esc(t.dropSub) + '</div>' +
    '<input type="file" id="rc-file" accept=".docx,.pdf,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden></div>' +
    '<div class="rc-privacy"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>' + esc(t.privacy) + '</div>' +
    '<div class="rc-err" id="rc-err" role="alert" hidden></div>' +
    '<details class="rc-paste"><summary>' + esc(t.paste) + '</summary>' +
    '<textarea id="rc-text" rows="8" placeholder="' + esc(t.pastePh) + '"></textarea>' +
    '<button class="btn btn-primary" id="rc-text-go">' + esc(t.pasteBtn) + '</button></details>' +
    '<div class="rc-opt-row">' + scopeHtml() + '</div>' +
    '<h3 class="rc-h3">' + esc(t.checks) + '</h3><div class="rc-checks">' +
    CATS.map(c => '<div class="rc-check"><b>' + esc(t.cat[c]) + '</b><span>' + esc(t.catDesc[c]) + '</span></div>').join('') +
    '</div></div>';

  const drop = document.getElementById('rc-drop');
  const input = document.getElementById('rc-file');
  drop.addEventListener('click', () => { input.value = ''; input.click(); });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop.click(); } });
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('change', () => { if (input.files[0]) openFile(input.files[0]); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('over');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) openFile(f);
  });
  document.querySelector('#rc-body .rc-opt-row').addEventListener('click', onScope);
  document.getElementById('rc-text-go').addEventListener('click', () => {
    const s = document.getElementById('rc-text').value;
    if (!s.trim()) return;
    load(extractText(s), tx().pastedName);
  });
}

function showErr(msg) {
  const e = document.getElementById('rc-err');
  if (e) { e.textContent = msg; e.hidden = false; }
}

function progress(label, frac) {
  const o = document.getElementById('progress-overlay');
  if (!o) return;
  if (label == null) { o.style.display = 'none'; return; }
  o.style.display = 'flex';
  document.getElementById('progress-label').textContent = label;
  document.getElementById('progress-bar').style.width = Math.round((frac || 0) * 100) + '%';
  document.getElementById('progress-sub').textContent = '';
}
const nextFrame = () => new Promise(r => setTimeout(r, 30));

async function openFile(file) {
  const t = tx();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'doc') return showErr(t.err.doc);
  if (ext !== 'docx' && ext !== 'pdf') return showErr(t.err.type);
  progress(t.reading, 0.05);
  await nextFrame();
  try {
    const buf = await file.arrayBuffer();
    let doc;
    if (ext === 'pdf') {
      try {
        doc = await extractPdf(buf, (n, total) => progress(t.readingPdf + ' ' + n + '/' + total, n / total * 0.9));
      } catch (e) {
        throw new Error(/Failed to fetch|dynamically imported|import/i.test(String(e && e.message)) ? 'nolib' : 'pdf');
      }
    } else {
      doc = extractDocx(buf);
    }
    if (!doc.paras.length && !(doc.notes || []).includes('scanned')) throw new Error('empty');
    progress(t.checking, 0.95);
    await nextFrame();
    load(doc, file.name);
  } catch (e) {
    progress(null);
    console.error(e);
    showErr(t.err[e.message] || t.err.notdocx);
    return;
  }
  progress(null);
}

function scopeHtml() {
  const t = tx();
  return '<div class="rc-opt"><span class="rc-opt-lbl">' + esc(t.scopeLbl) + '</span><div class="rc-seg" role="group" aria-label="' + esc(t.scopeLbl) + '">' +
    ['para', 'doc'].map(v => '<button data-scope="' + v + '" aria-pressed="' + (RPT.scope === v) + '">' + esc(v === 'para' ? t.scopePara : t.scopeDoc) + '</button>').join('') +
    '</div><span class="rc-opt-hint">' + esc(t.scopeHint[RPT.scope]) + '</span></div>';
}
function onScope(e) {
  const b = e.target.closest('[data-scope]');
  if (!b || b.dataset.scope === RPT.scope) return;
  RPT.scope = b.dataset.scope;
  try { localStorage.setItem('aer-rc-scope', RPT.scope); } catch (err) { /* private mode */ }
  if (RPT.doc) { RPT.issues = runChecks(RPT.doc, { scope: RPT.scope }); RPT.sel = null; refresh(); }
  else { const row = document.querySelector('#rc-body .rc-opt-row'); if (row) row.innerHTML = scopeHtml(); }
}

/* Free what the previous file held: image URLs, the PDF, rendered pages */
function unload() {
  const d = RPT.doc;
  stopPdf();
  if (d && d.urls) d.urls.forEach(u => URL.revokeObjectURL(u));
  if (d && d.pdf) d.pdf.destroy();
  RPT.pdfCache.forEach(u => URL.revokeObjectURL(u));
  RPT.pdfCache.clear();
  RPT.doc = null;
  RPT.issues = [];
}

function load(doc, name) {
  unload();
  RPT.doc = doc;
  RPT.name = name;
  RPT.issues = runChecks(doc, { scope: RPT.scope });
  RPT.ignored = new Set();
  RPT.ignoredKeys = new Set();
  RPT.off = new Set();
  RPT.sel = null;
  renderResult();
}

/* ── Results ────────────────────────────────────────────────────────────── */

const sig = i => i.cat + '|' + i.para + '|' + i.ranges[0][0] + '|' + (i.msg || '');
const live = () => RPT.issues.filter(i => !RPT.ignored.has(sig(i)) && !RPT.ignoredKeys.has(i.key));
const shown = () => live().filter(i => !RPT.off.has(i.cat));

/* Page of a text offset: PDFs know it; Word files know it when Word saved
   its page breaks (most files saved by Word do). */
function pageAt(p, off = 0) {
  if (RPT.doc.kind === 'pdf') return p.page;
  if (RPT.doc.kind === 'docx' && RPT.doc.hasPages) return p.page + (p.breaks || []).filter(b => b <= off).length;
  return null;
}
function locText(p, pi, off) {
  const t = tx();
  const pg = pageAt(p, off);
  const a = [pg ? t.page + ' ' + pg : t.para + ' ' + (p.no || pi + 1)];
  if (p.inTable) a.push(t.table);
  return a.join(' · ');
}
const locShort = pi => locText(RPT.doc.paras[pi], pi, 0).split(' · ')[0];

function message(i) {
  const m = tx().msg;
  if (i.cat === 'spell') return m.spell;
  if (i.cat === 'overuse') return m.overuse(i.count);
  const f = m[i.msg];
  if (typeof f === 'function') {
    if (i.msg === 'zw') return f(i.count);
    if (i.msg === 'capgap' || i.msg === 'caporder') return f(i.prevNum);
    if (i.msg === 'refmissing') return f(i.kind);
    return f(i.counts || []);
  }
  let s = f || '';
  if (i.ref != null) s += ' ' + locShort(i.ref);
  return s;
}

function context(i) {
  const text = RPT.doc.paras[i.para].text;
  const [s, e] = i.ranges[0];
  if (e - s > 120) return '<b>' + esc(text.slice(s, s + 110)) + '…</b>';
  const a = Math.max(0, s - 36), b = Math.min(text.length, e + 36);
  const mid = text.slice(s, e);
  const midHtml = /^\s*$/.test(mid) || mid.length <= 2 && /[\u200B-\u200D\u2060\uFEFF]/.test(mid) ? '<b class="ws">' + showWs(mid || '◌') + '</b>' : '<b>' + esc(mid) + '</b>';
  return (a > 0 ? '…' : '') + esc(text.slice(a, s)).replace(/\n/g, ' ') + midHtml + esc(text.slice(e, b)).replace(/\n/g, ' ') + (b < text.length ? '…' : '');
}

function searchText(i) {
  const text = RPT.doc.paras[i.para].text;
  const [s, e] = i.ranges[0];
  let q = text.slice(s, e);
  if (q.trim().length < 3 || /[\u200B-\u200D\u2060\uFEFF]/.test(q)) q = text.slice(Math.max(0, s - 12), Math.min(text.length, e + 12));
  return q.split('\n')[0].trim().slice(0, 60);
}

function renderResult() {
  const t = tx();
  const body = document.getElementById('rc-body');
  body.classList.add('has-doc');
  const d = RPT.doc;
  const meta = d.kind === 'pdf' || (d.kind === 'docx' && d.hasPages) ? d.pages + ' ' + t.pages : d.paras.filter(p => p.text.trim()).length + ' ' + t.paras;
  body.innerHTML =
    '<div class="rc-top">' +
    '<div class="rc-file"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><polyline points="14 3 14 8 19 8"/></svg>' +
    '<span class="rc-fname">' + esc(RPT.name) + '</span><span class="rc-fmeta">' + esc(meta) + '</span></div>' +
    '<div class="rc-actions"><button class="btn" id="rc-restore" hidden></button><button class="btn" id="rc-new">' + esc(t.newFile) + '</button>' +
    '<button class="btn btn-primary" id="rc-export">' + esc(t.export) + '</button></div></div>' +
    (d.notes || []).map(n => '<div class="rc-note' + (n === 'pdfspace' ? '' : ' warn') + '">' + esc(t.note[n]) + '</div>').join('') +
    '<div class="rc-sum" id="rc-sum"></div>' +
    '<div class="rc-main"><div class="rc-list" id="rc-list" aria-label="' + esc(t.total) + '"></div>' +
    '<div class="rc-docpane"><div class="rc-doc" id="rc-doc"></div>' +
    '<div class="rc-zoom" id="rc-zoom" role="group" aria-label="Zoom"><button data-z="out" aria-label="' + esc(t.zoomOut) + '">−</button>' +
    '<button data-z="fit" id="rc-zoom-v" title="' + esc(t.zoomFit) + '"></button><button data-z="in" aria-label="' + esc(t.zoomIn) + '">+</button></div></div></div>';

  document.getElementById('rc-new').addEventListener('click', () => { unload(); renderStart(); });
  document.getElementById('rc-export').addEventListener('click', exportXlsx);
  document.getElementById('rc-restore').addEventListener('click', () => {
    RPT.ignored.clear(); RPT.ignoredKeys.clear(); refresh();
  });
  document.getElementById('rc-sum').addEventListener('click', e => {
    if (e.target.closest('[data-scope]')) return onScope(e);
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    const c = b.dataset.cat;
    if (RPT.off.has(c)) RPT.off.delete(c); else RPT.off.add(c);
    refresh();
  });
  document.getElementById('rc-list').addEventListener('click', onListClick);
  document.getElementById('rc-zoom').addEventListener('click', e => {
    const b = e.target.closest('[data-z]');
    if (!b) return;
    const el = document.getElementById('rc-doc');
    const cur = currentZoom(el);
    RPT.zoom = b.dataset.z === 'fit' ? null : Math.min(2, Math.max(0.3, b.dataset.z === 'in' ? cur * 1.2 : cur / 1.2));
    const mid = (el.scrollTop + el.clientHeight / 2) / (el.scrollHeight || 1);
    fit(el);
    el.scrollTop = mid * el.scrollHeight - el.clientHeight / 2;
  });
  document.getElementById('rc-doc').addEventListener('click', e => {
    const m = e.target.closest('[data-i]');
    if (m) select(+m.dataset.i, 'doc');
  });
  refresh();
}

function refresh() {
  renderSummary();
  renderList();
  renderDoc();
  const n = RPT.issues.length - live().length;
  const r = document.getElementById('rc-restore');
  if (r) { r.hidden = !n; r.textContent = tx().restore + ' (' + n + ')'; }
}

function renderSummary() {
  const t = tx();
  const all = live();
  const by = {}, sev = { err: 0, warn: 0, info: 0 };
  all.forEach(i => { by[i.cat] = (by[i.cat] || 0) + 1; });
  shown().forEach(i => { sev[i.sev]++; });
  const el = document.getElementById('rc-sum');
  el.innerHTML = '<div class="rc-sum-row">' +
    '<div class="rc-sev">' + ['err', 'warn', 'info'].map(s => '<span class="rc-sevc sev-' + s + '"><i></i>' + esc(t.sev[s]) + ' <b>' + sev[s] + '</b></span>').join('') + '</div>' +
    '</div>' + scopeHtml() + '</div>' +
    '<div class="rc-chips">' + CATS.filter(c => by[c]).map(c =>
      '<button class="rc-chip" data-cat="' + c + '" aria-pressed="' + !RPT.off.has(c) + '">' + esc(t.cat[c]) + ' <b>' + by[c] + '</b></button>').join('') + '</div>';
}

function renderList() {
  const t = tx();
  const list = shown().sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || a.para - b.para || a.ranges[0][0] - b.ranges[0][0]);
  const el = document.getElementById('rc-list');
  if (!list.length) {
    el.innerHTML = '<div class="rc-empty">' + esc(RPT.issues.length ? t.none : t.clean) + '</div>';
    return;
  }
  const keyCount = new Map();
  list.forEach(i => keyCount.set(i.key, (keyCount.get(i.key) || 0) + 1));
  const h = [];
  list.slice(0, LIST_CAP).forEach(i => {
    const p = RPT.doc.paras[i.para];
    h.push('<div class="rc-item sev-' + i.sev + (RPT.sel === i.id ? ' sel' : '') + '" data-id="' + i.id + '" tabindex="0" role="button">' +
      '<div class="rc-item-hd"><span class="rc-dot"></span><span class="rc-cat">' + esc(t.cat[i.cat]) + '</span>' +
      '<span class="rc-loc">' + esc(locText(p, i.para, i.ranges[0][0])) + '</span></div>' +
      '<div class="rc-ctx">' + context(i) + '</div>' +
      (i.suggest && i.suggest.trim() ? '<div class="rc-fix">' + esc(t.fix) + ' <b>' + esc(i.suggest) + '</b></div>' : '') +
      '<div class="rc-msg">' + esc(message(i)) + '</div>' +
      (p.heading ? '<div class="rc-head">' + esc(t.heading) + ': ' + esc(p.heading) + '</div>' : '') +
      '<div class="rc-btns"><button data-act="copy">' + esc(t.copy) + '</button><button data-act="ignore">' + esc(t.ignore) + '</button>' +
      (keyCount.get(i.key) > 1 ? '<button data-act="ignoreAll">' + esc(t.ignoreAll) + ' (' + keyCount.get(i.key) + ')</button>' : '') +
      '</div></div>');
  });
  if (list.length > LIST_CAP) h.push('<div class="rc-more">' + esc(t.more(list.length)) + '</div>');
  el.innerHTML = h.join('');
}

function onListClick(e) {
  const item = e.target.closest('.rc-item');
  if (!item) return;
  const id = +item.dataset.id;
  const iss = RPT.issues.find(x => x.id === id);
  const act = e.target.closest('[data-act]');
  if (act) {
    e.stopPropagation();
    if (act.dataset.act === 'ignore') { RPT.ignored.add(sig(iss)); if (RPT.sel === id) RPT.sel = null; refresh(); }
    else if (act.dataset.act === 'ignoreAll') { RPT.ignoredKeys.add(iss.key); refresh(); }
    else if (act.dataset.act === 'copy') {
      const q = searchText(iss);
      (navigator.clipboard ? navigator.clipboard.writeText(q) : Promise.reject()).then(() => {
        act.textContent = tx().copied;
        setTimeout(() => { act.textContent = tx().copy; }, 1400);
      }).catch(() => window.prompt('', q));
    }
    return;
  }
  select(id, 'list');
}

function select(id, from) {
  RPT.sel = id;
  document.querySelectorAll('.rc-item.sel, #rc-doc .sel').forEach(x => x.classList.remove('sel'));
  const item = document.querySelector('.rc-item[data-id="' + id + '"]');
  if (item) { item.classList.add('sel'); if (from === 'doc') item.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  const marks = document.querySelectorAll('#rc-doc [data-i="' + id + '"]');
  marks.forEach(m => m.classList.add('sel'));
  if (from === 'list') {
    const iss = RPT.issues.find(x => x.id === id) || {};
    const p = RPT.doc.paras[iss.para] || {};
    const target = marks[0] || document.getElementById('rc-p-' + (p.idx ?? iss.para)) ||
      document.querySelector('#rc-doc .rc-sheet[data-pg="' + p.page + '"]');
    if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

/* Document view: the report drawn as pages (reportView.js), with the shown
   findings highlighted; scaled down to fit the panel. */
let fitObs = null;
function renderDoc() {
  const t = tx();
  const d = RPT.doc;
  const el = document.getElementById('rc-doc');
  const byPara = new Map();
  shown().forEach(i => {
    if (!byPara.has(i.para)) byPara.set(i.para, []);
    byPara.get(i.para).push(i);
  });
  const keep = el.scrollTop;
  const w = d.kind === 'docx' ? renderWord(el, d, byPara, RPT.sel, t.page)
    : d.kind === 'pdf' ? renderPdf(el, d, byPara, RPT.sel, RPT.pdfCache, t.page)
    : renderPlain(el, d, byPara, RPT.sel);
  el.dataset.w = w;
  fit(el);
  el.scrollTop = keep;
  if (!fitObs) fitObs = new ResizeObserver(() => { const e = document.getElementById('rc-doc'); if (e) fit(e); });
  fitObs.disconnect();
  fitObs.observe(el);
}
/* Zoom: "fit" scales the page to the panel width; +/- set it by hand */
function fitZoom(el) { return Math.min(1, Math.max(0.3, (el.clientWidth - 32) / (+el.dataset.w || 794))); }
function currentZoom(el) { return RPT.zoom ?? fitZoom(el); }
function fit(el) {
  const pages = el.querySelector('.rc-pages');
  if (!pages) return;
  const z = currentZoom(el);
  pages.style.zoom = z.toFixed(3);
  const v = document.getElementById('rc-zoom-v');
  if (v) { v.textContent = Math.round(z * 100) + '%'; v.setAttribute('aria-pressed', String(RPT.zoom == null)); }
}

function exportXlsx() {
  const t = tx();
  const X = window.XLSX;
  if (!X) return;
  const rows = [t.xlsx];
  shown().sort((a, b) => a.para - b.para || a.ranges[0][0] - b.ranges[0][0]).forEach((i, n) => {
    const p = RPT.doc.paras[i.para];
    const [s, e] = i.ranges[0];
    rows.push([n + 1, t.sev[i.sev], t.cat[i.cat], locText(p, i.para, s), p.heading || '',
      p.text.slice(s, Math.min(e, s + 200)), i.suggest || '', message(i),
      p.text.slice(Math.max(0, s - 40), Math.min(p.text.length, e + 40)).replace(/\n/g, ' ')]);
  });
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = [6, 10, 18, 16, 30, 30, 16, 50, 60].map(w => ({ wch: w }));
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Report Check');
  const base = RPT.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'report';
  X.writeFile(wb, 'ReportCheck_' + base + '.xlsx');
}
