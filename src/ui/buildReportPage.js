/**
 * buildReportPage.js — Report Check: open a Word/PDF report (or paste text),
 * list what looks wrong, and highlight each spot in the text. Nothing is
 * edited and nothing leaves the browser.
 */
import { LANG, L } from '../utils/lang.js';
import { runChecks, CATS, SEV_ORDER, scanAbbr } from '../core/reportCheck.js';
import { extractDocx, extractPdf, extractText } from '../core/reportExtract.js';
import { renderWord, renderPdf, renderPlain, stopPdf, ensureFonts, guessBreaks, pdfRects } from './reportView.js';

/* Where a repeated passage counts: 'para' (same paragraph only) or 'doc' */
function savedScope() { try { return localStorage.getItem('aer-rc-scope') === 'doc' ? 'doc' : 'para'; } catch (e) { return 'para'; } }
function savedListW() { try { return Math.max(260, Math.min(900, +localStorage.getItem('aer-rc-lw') || 380)); } catch (e) { return 380; } }
const RPT = { doc: null, name: '', issues: [], ignored: new Set(), ignoredKeys: new Set(), off: new Set(), sel: null,
  scope: savedScope(), pdfCache: new Map(), zoom: null, sev: 'all', q: '', listW: savedListW(), drawn: null, brk: null };
window.RPT = RPT;

const LIST_CAP = 1500;

/* Thai dictionary (public/dict, PyThaiNLP word list, CC0): fetched once,
   then cached by the browser. Words the user marks as correct are kept in
   this browser and count as known in every report. */
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
let DICT = null, dictLoading = null;
const PRE = new Set(); // every beginning of a word, so cutting can stop early
function loadDict() {
  if (DICT) return Promise.resolve(DICT);
  if (!dictLoading) {
    dictLoading = fetch(BASE + 'dict/th-words.txt').then(r => (r.ok ? r.text() : ''))
      .then(t => {
        DICT = new Set(t.split('\n').map(w => w.trim()).filter(Boolean));
        for (const w of DICT) for (let k = 1; k <= w.length; k++) PRE.add(w.slice(0, k));
        return DICT;
      })
      .catch(() => (DICT = new Set()));
  }
  return dictLoading;
}
function readWords() { try { return new Set(JSON.parse(localStorage.getItem('aer-rc-words') || '[]')); } catch (e) { return new Set(); } }
const USER = readWords();
function saveWords() { try { localStorage.setItem('aer-rc-words', JSON.stringify([...USER])); } catch (e) { /* private mode */ } }
const userPre = () => { const s = new Set(); for (const w of USER) for (let k = 1; k <= w.length; k++) s.add(w.slice(0, k)); return s; };
const dictView = () => {
  if (!DICT || !DICT.size) return null;
  const up = userPre();
  return { size: DICT.size, has: w => DICT.has(w) || USER.has(w), pre: w => PRE.has(w) || up.has(w) };
};
const check = doc => runChecks(doc, { scope: RPT.scope, dict: dictView() });

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
    searchPh: 'ค้นหาในรายการและในเนื้อรายงาน (Enter = ไปจุดถัดไป)',
    catAll: 'เลือกทั้งหมด', catNone: 'ล้าง',
    addWord: 'เพิ่มเป็นคำที่ถูก', myWords: n => `คำที่คุณเพิ่มไว้ ${n} คำ`, clearWords: 'ล้าง', clearWordsQ: n => `ลบคำที่เพิ่มไว้ทั้ง ${n} คำ?`, noCat: 'ยังไม่ได้เลือกหมวด — กดหมวดที่ต้องการดูด้านบน หรือ "เลือกทั้งหมด"', sevLbl: 'ระดับ', sevAll: 'ทั้งหมด', noMatch: 'ไม่พบรายการที่ตรงกับคำค้น',
    found: (m, n) => `พบ ${m} จาก ${n} รายการที่แสดงอยู่`,
    hiddenMatch: n => `แต่พบ ${n} รายการในหมวดหรือระดับที่ปิดไว้`, showAll: 'แสดงทุกหมวด',
    inDoc: n => `ในเนื้อรายงาน ${n} แห่ง`, docMatch: n => `แต่พบคำนี้ในเนื้อรายงาน ${n} แห่ง (ไฮไลต์สีเหลือง) — กด ‹ › ด้านบนรายงาน หรือ Enter เพื่อไปทีละแห่ง`,
    findNone: 'ไม่พบในรายงาน', findPos: (i, n) => `แห่งที่ ${i} / ${n}`, findPrev: 'แห่งก่อนหน้า', findNext: 'แห่งถัดไป', resize: 'ลากเพื่อปรับขนาดรายการกับหน้ารายงาน',
    prevPage: 'หน้าก่อน', nextPage: 'หน้าถัดไป', goPage: 'ไปที่หน้า',
    brkLbl: 'ตัดบรรทัดแบบ', brkHint: 'Word บน Mac ตัดบรรทัดภาษาไทยที่ช่องว่างเท่านั้น ส่วน Word บน Windows ตัดระหว่างคำ — เลือกให้ตรงกับเครื่องที่เปิดดูไฟล์ (โปรแกรมเดาจากไฟล์ให้แล้ว)',
    newFile: 'เปิดไฟล์อื่น', export: 'Export Excel', restore: 'คืนรายการที่ข้าม',
    prevSkips: n => `ข้ามไว้จากการตรวจไฟล์ชื่อนี้ครั้งก่อน ${n} รายการ — กด "คืนรายการที่ข้าม" ถ้าต้องการดูอีกครั้ง`,
    pages: 'หน้า', paras: 'ย่อหน้า', pastedName: 'ข้อความที่วาง',
    total: 'จุดที่พบ', none: 'ไม่พบจุดที่ต้องตรวจในหมวดที่เลือก',
    clean: 'ไม่พบจุดที่น่าจะผิด',
    ignore: 'ข้าม', ignoreAll: 'ข้ามทั้งหมดแบบนี้', copy: 'คัดลอกไปค้นหา', copied: 'คัดลอกแล้ว',
    page: 'หน้า', para: 'ย่อหน้า', table: 'ในตาราง', heading: 'หัวข้อ', row: 'แถว', tableN: n => `ตารางลำดับที่ ${n} ในไฟล์`,
    more: n => `แสดง ${LIST_CAP} รายการแรกจาก ${n} — ปิดบางหมวดด้านบนเพื่อดูส่วนที่เหลือ`,
    fix: 'แก้เป็น',
    sev: { err: 'ควรแก้', warn: 'ควรตรวจ', info: 'ข้อสังเกต' },
    cat: {
      prep: 'ตรวจก่อนส่ง', spell: 'คำที่มักสะกดผิด', dict: 'ไม่มีในพจนานุกรม', datamatch: 'ตัวเลขไม่ตรงตาราง', char: 'อักขระผิดปกติ', dupword: 'คำ/ตัวเลขซ้ำติดกัน', dupphrase: 'ข้อความซ้ำ', tabledup: 'ข้อมูลซ้ำในตาราง', toc: 'สารบัญ', abbr: 'คำย่อ', sci: 'ชื่อวิทยาศาสตร์',
      number: 'เลขตาราง/รูป', consist: 'เขียนไม่เหมือนกัน', overuse: 'คำเดิมถี่', space: 'เว้นวรรค', pair: 'วงเล็บ/คำพูด',
    },
    catDesc: {
      prep: 'สิ่งที่ลืมไว้ก่อนส่ง: ความเห็น (Comment), การแก้ไขที่ยังไม่ยอมรับ (Track Changes), ไฮไลต์, ข้อความที่ซ่อนไว้ และข้อความรอเติม เช่น xxx, ???, [ใส่ข้อมูล], TBD',
      toc: 'เลขหน้าในสารบัญ/สารบัญตาราง/สารบัญรูปที่ไม่ตรงกับหน้าจริง และชื่อในสารบัญที่ไม่ตรงกับหัวข้อ (ไฟล์ Word ที่บันทึกจาก Word)',
      abbr: 'คำย่อที่ใช้ก่อนนิยาม นิยามซ้ำหรือคนละความหมาย เขียนหลายแบบ (DO / D.O.) และชื่อเต็มที่เขียนซ้ำหลังนิยามแล้ว — Export Excel มีตารางคำย่อให้ด้วย',
      sci: 'ชื่อวิทยาศาสตร์ (สกุล ชนิด) ที่ไม่เป็นตัวเอียง เช่น Chaetoceros curvisetus, Nitzschia sp. (เฉพาะไฟล์ Word)',
      spell: 'คำที่พบบ่อยว่าสะกดผิด เช่น อนุญาติ, ปรากฎ, แพลงตอน, คลอโรฟิล',
      dict: 'คำภาษาไทยที่ไม่มีในพจนานุกรม (รายการคำ PyThaiNLP กว่า 6 หมื่นคำ + ศัพท์งานสิ่งแวดล้อม) อาจเป็นคำผิด หรือชื่อเฉพาะ/ศัพท์เทคนิค — กด "เพิ่มเป็นคำที่ถูก" แล้วจะไม่ชี้อีก',
      datamatch: 'ช่วง/ค่าเฉลี่ย/ค่าสูงสุด/ต่ำสุดที่เขียนในเนื้อความ เทียบกับตัวเลขในตาราง เช่น "pH อยู่ในช่วง 7.8 ถึง 8.2" (เฉพาะไฟล์ Word)',
      char: 'ตัวอักษรที่ดูเหมือนถูกแต่ค้นหาไม่เจอ เช่น เ+เ แทน แ, \u0E4D+า แทน ำ, อักขระล่องหน, oC',
      dupword: 'คำหรือตัวเลขเดียวกันติดกัน เช่น "การการ", "the the", "25.3 25.3" (รวมในช่องตาราง)',
      dupphrase: 'ข้อความ 8 คำขึ้นไปที่ซ้ำในย่อหน้าเดียวกัน (หรือในช่องตารางเดียวกัน) หรือเลือกให้ตรวจทั้งเล่ม (ย่อหน้าซ้ำ / ข้อความ 12 คำขึ้นไป)',
      tabledup: 'แถวหรือคอลัมน์ที่ตัวเลขตรงกันทุกช่อง (มักเกิดจากคัดลอกแถวแล้วลืมแก้ค่า) และตารางที่ตัวเลขซ้ำกับตารางอื่นทั้งตาราง — PDF ตรวจได้เฉพาะแถว',
      number: 'เลขตาราง/รูปข้าม ซ้ำ สลับลำดับ อ้างถึงตารางที่ไม่มี และลิงก์อ้างอิงใน Word ที่เสีย',
      consist: 'หน่วยหรือคำเดียวกันเขียนหลายแบบ เช่น mg/L กับ mg/l, ไนเตรท กับ ไนเตรต, ๆ เว้นวรรคไม่เหมือนกัน, พ.ศ./ค.ศ. ปนกัน, รหัสสถานี ST1 กับ ST-1, ทศนิยมในคอลัมน์ไม่เท่ากัน',
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
      part: 'ท้ายคำซ้ำกับคำถัดไป — อาจพิมพ์ซ้ำ',
      multi: 'ชุดคำเดียวกันซ้ำติดกัน — อาจพิมพ์ซ้ำ',
      double: 'เว้นวรรคซ้อน',
      punct: 'มีวรรคหน้าเครื่องหมายหรือในวงเล็บ',
      open: 'เปิดแล้วไม่พบตัวปิดในย่อหน้าเดียวกัน',
      close: 'พบตัวปิดโดยไม่มีตัวเปิด',
      para: 'ทั้งย่อหน้าซ้ำกับ',
      phrase: 'ข้อความช่วงนี้ซ้ำกับ',
      phraseSame: 'ข้อความช่วงนี้ซ้ำกับช่วงก่อนหน้าในย่อหน้าเดียวกัน (ไฮไลต์ทั้งสองช่วง)',
      num: 'ตัวเลขเดียวกันซ้ำติดกัน',
      comment: i => 'มีความเห็น (Comment) ค้างอยู่' + (i.author || i.note ? ' — ' + (i.author ? i.author + ': ' : '') + (i.note ? '"' + i.note.slice(0, 120) + '"' : '') : ''),
      track: i => `มีการแก้ไขที่ยังไม่ได้ยอมรับ (Track Changes) ${i.count} จุดในย่อหน้านี้` + (i.kinds.includes('del') ? ' รวมข้อความที่ถูกลบ' : '') + ' — ใน Word ไปที่ Review › Accept',
      hidden: i => `มีข้อความที่ซ่อนไว้ (Hidden) ${i.count} ตัวอักษร — จะไม่แสดงแต่ยังอยู่ในไฟล์`,
      hl: 'มีไฮไลต์ค้างอยู่ — ตรวจแล้วอย่าลืมเอาไฮไลต์ออก',
      placeholder: 'ข้อความที่ดูเหมือนเว้นไว้รอเติม',
      tocpage: i => `สารบัญระบุหน้านี้ แต่หัวข้ออยู่หน้า ${i.real} — คลิกขวาที่สารบัญใน Word แล้วเลือก Update Field`,
      toctitle: i => `ชื่อในสารบัญไม่ตรงกับหัวข้อจริง: "${i.now}"`,
      abbrBefore: i => `ใช้คำย่อ ${i.abbr} ก่อนนิยาม` + (i.n > 1 ? ` (${i.n} ครั้ง)` : '') + ' — นิยามครั้งแรกที่',
      abbrTwice: i => `นิยามคำย่อ ${i.abbr} ซ้ำอีก ${i.n} ครั้ง (ไฮไลต์ทุกจุด) — นิยามครั้งแรกที่`,
      abbrMeaning: i => `คำย่อ ${i.abbr} นิยามคนละความหมาย: "${i.full}" กับ "${i.first}" ที่`,
      abbrFull: i => `นิยามคำย่อ ${i.abbr} ไว้แล้ว แต่ยังเขียนชื่อเต็ม ${i.n} ครั้ง (ไฮไลต์ทุกจุด) — ใช้คำย่อแทนได้`,
      abbrForm: i => `คำย่อเขียนต่างจากที่นิยาม (${i.abbr})`,
      sci: 'ชื่อวิทยาศาสตร์ควรเป็นตัวเอียง',
      sciRank: 'sp. / spp. / cf. ไม่ต้องเป็นตัวเอียง (เอียงเฉพาะชื่อสกุลและชนิด)',
      claim: i => ({ range: 'ช่วงที่เขียน', mean: 'ค่าเฉลี่ยที่เขียน', max: 'ค่าสูงสุดที่เขียน', min: 'ค่าต่ำสุดที่เขียน' }[i.kind]) +
        ` ไม่ตรงกับ${i.table || 'ตารางลำดับที่ ' + i.tno} (${i.label}) ซึ่งได้ ${i.actual}` + (i.n > 1 ? ` — เขียนแบบนี้ ${i.n} แห่ง` : '') + (i.sev === 'info' ? ' — อาจหมายถึงบางสถานีหรือบางฤดู ตรวจอีกครั้ง' : ''),
      yearBE: 'ปีนี้เป็น ค.ศ. แต่เขียนว่า พ.ศ.', yearCE: 'ปีนี้เป็น พ.ศ. แต่เขียนว่า ค.ศ.',
      yearMix: c => `ใช้ปี ค.ศ. ปนกับ พ.ศ. (พ.ศ. ${c[0]} ครั้ง / ค.ศ. ${c[1]} ครั้ง) — ไม่นับในวงเล็บอ้างอิงและเอกสารอ้างอิง`,
      codeForm: i => `รหัสเดียวกันเขียนสองแบบ: ${i.forms[0]} (${i.forms[1]} ครั้ง) กับ ${i.forms[2]} (${i.forms[3]} ครั้ง)`,
      stationForm: i => `เขียน "สถานี 1" ปนกับ "สถานีที่ 1" — ส่วนใหญ่ใช้ "${i.usual}" (${i.counts[0]} / ${i.counts[1]} ครั้ง)`,
      decimals: i => `ทศนิยมไม่เท่ากับค่าอื่นใน "${i.label}" (ส่วนใหญ่ ${i.dec} ตำแหน่ง) ${i.n} ช่อง`,
      dict: i => 'ไม่มีในพจนานุกรม — ตรวจว่าสะกดถูกไหม' + (i.n > 1 ? ` (พบ ${i.n} ครั้ง ไฮไลต์ทุกจุด)` : ''),
      rowSame: () => 'ทั้งแถวซ้ำกับแถวก่อนหน้าในตารางเดียวกัน',
      rowData: i => `ตัวเลขทั้งแถวตรงกับแถว${i.other ? ' "' + i.other + '"' : 'ก่อนหน้า'} ทุกช่อง — อาจคัดลอกแล้วลืมแก้ค่า`,
      colData: i => `ตัวเลขในคอลัมน์${i.label ? ' "' + i.label + '"' : 'นี้'} ตรงกับคอลัมน์${i.other ? ' "' + i.other + '"' : 'ก่อนหน้า'} ทุกแถว — อาจคัดลอกแล้วลืมแก้ค่า`,
      tableSame: () => 'ตัวเลขทั้งตารางตรงกับตารางก่อนหน้า — อาจใส่ตารางซ้ำ',
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
    abbrSheet: 'คำย่อ', abbrHead: ['คำย่อ', 'ชื่อเต็ม', 'นิยามครั้งแรก', 'ใช้ (ครั้ง)'],
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
    searchPh: 'Search the list and the report text (Enter = next match)',
    catAll: 'Select all', catNone: 'Clear',
    addWord: 'Mark as correct', myWords: n => `${n} word(s) you added`, clearWords: 'Clear', clearWordsQ: n => `Remove all ${n} added word(s)?`, noCat: 'No category selected — pick one above, or "Select all"', sevLbl: 'Level', sevAll: 'All', noMatch: 'No findings match the search',
    found: (m, n) => `${m} of ${n} shown findings`,
    hiddenMatch: n => `${n} more match in hidden categories or levels`, showAll: 'Show all categories',
    inDoc: n => `${n} in the report`, docMatch: n => `Found ${n} times in the report text (yellow) — use ‹ › above the report or Enter to step through`,
    findNone: 'Not in the report', findPos: (i, n) => `${i} of ${n}`, findPrev: 'Previous match', findNext: 'Next match', resize: 'Drag to resize the list and the report',
    prevPage: 'Previous page', nextPage: 'Next page', goPage: 'Go to page',
    brkLbl: 'Line breaks', brkHint: 'Word for Mac breaks Thai lines only at spaces; Word for Windows breaks between words — pick the one you view the file in (guessed from the file)',
    newFile: 'Open another file', export: 'Export Excel', restore: 'Restore skipped',
    prevSkips: n => `${n} finding(s) skipped last time this file name was checked — "Restore skipped" shows them again`,
    pages: 'pages', paras: 'paragraphs', pastedName: 'Pasted text',
    total: 'Found', none: 'Nothing to check in the selected categories',
    clean: 'Nothing that looks wrong was found',
    ignore: 'Skip', ignoreAll: 'Skip all like this', copy: 'Copy to search', copied: 'Copied',
    page: 'Page', para: 'Paragraph', table: 'in a table', heading: 'Section', row: 'row', tableN: n => `Table #${n} in the file`,
    more: n => `Showing the first ${LIST_CAP} of ${n} — turn off some categories above to see the rest`,
    fix: 'Change to',
    sev: { err: 'Fix', warn: 'Check', info: 'Note' },
    cat: {
      prep: 'Before sending', spell: 'Common misspellings', dict: 'Not in dictionary', datamatch: 'Text vs table', char: 'Odd characters', dupword: 'Repeated words/numbers', dupphrase: 'Repeated passages', tabledup: 'Repeated table data', toc: 'Contents', abbr: 'Abbreviations', sci: 'Scientific names',
      number: 'Table/figure numbers', consist: 'Inconsistent forms', overuse: 'Overused words', space: 'Spacing', pair: 'Brackets/quotes',
    },
    catDesc: {
      prep: 'Left in by mistake: comments, tracked changes not yet accepted, highlighter, hidden text, and text to fill in such as xxx, ???, [insert], TBD',
      toc: 'Page numbers in the contents / lists of tables and figures that do not match the real page, and entries whose title differs from the heading (Word files saved by Word)',
      abbr: 'Abbreviations used before they are defined, defined twice or with two meanings, written two ways (DO / D.O.), and full names repeated after the definition — Export Excel includes a table of abbreviations',
      sci: 'Scientific names (genus, species) not in italics, e.g. Chaetoceros curvisetus, Nitzschia sp. (Word files only)',
      spell: 'Thai words often misspelled, e.g. อนุญาติ, ปรากฎ, แพลงตอน, คลอโรฟิล',
      dict: 'Thai words not in the dictionary (PyThaiNLP word list, 60,000+ words, plus environmental terms): a misspelling, or a name/technical term — "Mark as correct" stops it being flagged',
      datamatch: 'Ranges, means, maxima and minima written in the text compared with the numbers in the table, e.g. "pH อยู่ในช่วง 7.8 ถึง 8.2" (Word files)',
      char: 'Characters that look right but break search: เ+เ for แ, \u0E4D+า for ำ, invisible characters, oC',
      dupword: 'The same word or number twice in a row, e.g. "การการ", "the the", "25.3 25.3" (table cells too)',
      dupphrase: 'Passages of 8+ words repeated within one paragraph (or one table cell) — or, if chosen, anywhere in the report (whole paragraphs / 12+ words)',
      tabledup: 'Rows or columns whose numbers match another exactly (a row copied and not updated), and tables whose numbers repeat another table — PDFs: rows only',
      number: 'Skipped, duplicated or out-of-order table/figure numbers, references to missing ones, broken Word cross-references',
      consist: 'Units or terms written more than one way: mg/L vs mg/l, ไนเตรท vs ไนเตรต, ๆ spacing, Buddhist/Christian years mixed, station codes ST1 vs ST-1, decimal places in a column',
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
      part: 'The end of a word is repeated as the next word — typed twice?',
      multi: 'The same words twice in a row — typed twice?',
      double: 'Double space',
      punct: 'Space before punctuation or inside brackets',
      open: 'Opened but not closed in this paragraph',
      close: 'Closed without an opening one',
      para: 'Whole paragraph repeats',
      phrase: 'This passage repeats',
      phraseSame: 'This passage repeats an earlier one in the same paragraph (both are highlighted)',
      num: 'The same number twice in a row',
      comment: i => 'A comment is still in the file' + (i.author || i.note ? ' — ' + (i.author ? i.author + ': ' : '') + (i.note ? '"' + i.note.slice(0, 120) + '"' : '') : ''),
      track: i => `${i.count} tracked change(s) not yet accepted in this paragraph` + (i.kinds.includes('del') ? ', including deleted text' : '') + ' — in Word: Review › Accept',
      hidden: i => `${i.count} character(s) of hidden text — not shown, but still in the file`,
      hl: 'Highlighter left on — remove it once checked',
      placeholder: 'Looks like text left to fill in',
      tocpage: i => `The contents give this page, but the heading is on page ${i.real} — in Word right-click the contents and choose Update Field`,
      toctitle: i => `Contents entry differs from the heading: "${i.now}"`,
      abbrBefore: i => `${i.abbr} is used before it is defined` + (i.n > 1 ? ` (${i.n} times)` : '') + ' — first defined at',
      abbrTwice: i => `${i.abbr} is defined ${i.n} more time(s) (all marked) — first defined at`,
      abbrMeaning: i => `${i.abbr} is defined with two meanings: "${i.full}" and "${i.first}" at`,
      abbrFull: i => `${i.abbr} is defined, but the full name is written ${i.n} more time(s) (all marked) — the abbreviation can be used`,
      abbrForm: i => `Abbreviation written differently from its definition (${i.abbr})`,
      sci: 'Scientific names should be in italics',
      sciRank: 'sp. / spp. / cf. stay upright (only genus and species are italic)',
      claim: i => ({ range: 'The range', mean: 'The mean', max: 'The maximum', min: 'The minimum' }[i.kind]) +
        ` written here does not match ${i.table || 'table #' + i.tno} (${i.label}), which gives ${i.actual}` + (i.n > 1 ? ` — written so in ${i.n} places` : '') + (i.sev === 'info' ? ' — it may mean some stations or seasons; check' : ''),
      yearBE: 'A Christian-era year labelled พ.ศ.', yearCE: 'A Buddhist-era year labelled ค.ศ.',
      yearMix: c => `Christian-era years mixed with Buddhist-era years (BE ${c[0]} / CE ${c[1]}) — citations and the reference list are not counted`,
      codeForm: i => `The same code written two ways: ${i.forms[0]} (${i.forms[1]}×) and ${i.forms[2]} (${i.forms[3]}×)`,
      stationForm: i => `"สถานี 1" and "สถานีที่ 1" both used — mostly "${i.usual}" (${i.counts[0]} / ${i.counts[1]})`,
      decimals: i => `${i.n} cell(s) with different decimal places from the rest of "${i.label}" (mostly ${i.dec})`,
      dict: i => 'Not in the dictionary — check the spelling' + (i.n > 1 ? ` (${i.n} times, all marked)` : ''),
      rowSame: () => 'The whole row repeats an earlier row of this table',
      rowData: i => `Every number matches row${i.other ? ' "' + i.other + '"' : ' above'} — copied and not updated?`,
      colData: i => `Every number in column${i.label ? ' "' + i.label + '"' : ''} matches column${i.other ? ' "' + i.other + '"' : ' before it'} — copied and not updated?`,
      tableSame: () => 'Every number matches an earlier table — table inserted twice?',
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
    abbrSheet: 'Abbreviations', abbrHead: ['Abbreviation', 'Full name', 'First defined', 'Uses'],
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
    CATS.map(c => '<div class="rc-check"><b>' + esc(t.cat[c]) + '</b><span>' + esc(t.catDesc[c]) + '</span>' +
      (c === 'dict' && USER.size ? '<span class="rc-words">' + esc(t.myWords(USER.size)) + ' <button data-act="clearWords">' + esc(t.clearWords) + '</button></span>' : '') + '</div>').join('') +
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
  const cw = body.querySelector('[data-act="clearWords"]');
  if (cw) cw.addEventListener('click', () => { if (window.confirm(tx().clearWordsQ(USER.size))) { USER.clear(); saveWords(); renderStart(); } });
  document.getElementById('rc-text-go').addEventListener('click', () => {
    const s = document.getElementById('rc-text').value;
    if (!s.trim()) return;
    loadDict().then(() => load(extractText(s), tx().pastedName));
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
      progress(t.checking, 0.6);
      await Promise.all([ensureFonts(), loadDict()]); // lines are measured, so the report fonts must be ready
    }
    if (!doc.paras.length && !(doc.notes || []).includes('scanned')) throw new Error('empty');
    await loadDict();
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

function scopeHtml(compact) {
  const t = tx();
  return '<div class="rc-opt' + (compact ? ' compact' : '') + '"><span class="rc-opt-lbl">' + esc(t.scopeLbl) + '</span><div class="rc-seg" role="group" aria-label="' + esc(t.scopeLbl) + '">' +
    ['para', 'doc'].map(v => '<button data-scope="' + v + '" aria-pressed="' + (RPT.scope === v) + '"' + (compact ? ' title="' + esc(t.scopeHint[v]) + '"' : '') + '>' + esc(v === 'para' ? t.scopePara : t.scopeDoc) + '</button>').join('') +
    '</div>' + (compact ? '' : '<span class="rc-opt-hint">' + esc(t.scopeHint[RPT.scope]) + '</span>') + '</div>';
}
function onScope(e) {
  const b = e.target.closest('[data-scope]');
  if (!b || b.dataset.scope === RPT.scope) return;
  RPT.scope = b.dataset.scope;
  try { localStorage.setItem('aer-rc-scope', RPT.scope); } catch (err) { /* private mode */ }
  if (RPT.doc) { RPT.issues = check(RPT.doc); RPT.sel = null; refresh(); }
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
  clearFind();
}

function load(doc, name) {
  unload();
  RPT.doc = doc;
  RPT.name = name;
  RPT.issues = check(doc);
  loadSkips(name);
  RPT.prevSkips = RPT.issues.filter(i => RPT.ignored.has(sig(i)) || RPT.ignoredKeys.has(i.key)).length;
  RPT.off = new Set();
  RPT.sel = null;
  RPT.sev = 'all';
  RPT.q = '';
  RPT.drawn = null;
  RPT.brk = null;
  RPT.zoom = null;
  renderResult();
}

/* ── Results ────────────────────────────────────────────────────────────── */

/* A skipped finding is remembered by its words, not its position, so it
   stays skipped when the report is checked again after edits elsewhere */
const sig = i => {
  if (i._sig) return i._sig;
  const t = (RPT.doc.paras[i.para] || {}).text || '';
  const [s, e] = i.ranges[0];
  return (i._sig = i.cat + '|' + (i.msg || '') + '|' + t.slice(Math.max(0, s - 20), Math.min(t.length, e + 20)).replace(/\s+/g, ' '));
};
/* skips are kept per file name in this browser (the 40 most recent files) */
const SKIP_KEY = 'aer-rc-skips';
function readSkips() { try { return JSON.parse(localStorage.getItem(SKIP_KEY) || '{}'); } catch (e) { return {}; } }
function loadSkips(name) {
  const e = readSkips()[name];
  RPT.ignored = new Set(e ? e.s : []);
  RPT.ignoredKeys = new Set(e ? e.k : []);
}
function saveSkips() {
  if (!RPT.name) return;
  const all = readSkips();
  if (RPT.ignored.size || RPT.ignoredKeys.size) all[RPT.name] = { t: Date.now(), s: [...RPT.ignored], k: [...RPT.ignoredKeys] };
  else delete all[RPT.name];
  const keep = Object.entries(all).sort((a, b) => b[1].t - a[1].t).slice(0, 40);
  try { localStorage.setItem(SKIP_KEY, JSON.stringify(Object.fromEntries(keep))); } catch (e) { /* full or private mode */ }
}
const live = () => RPT.issues.filter(i => !RPT.ignored.has(sig(i)) && !RPT.ignoredKeys.has(i.key) && !(i.cat === 'dict' && (USER.has(i.word) || USER.has(i.core))));
const shown = () => live().filter(i => !RPT.off.has(i.cat) && (RPT.sev === 'all' || i.sev === RPT.sev));

/* Page of a text offset: PDFs know it; Word files know it when Word saved
   its page breaks (most files saved by Word do). */
function pageAt(p, off = 0) {
  if (RPT.doc.kind === 'pdf') return p.page;
  if (RPT.doc.kind === 'docx' && RPT.doc.hasPages) return p.page + (p.breaks || []).filter(b => b <= off).length;
  return null;
}
/* A Word table is named by its caption ("ตารางที่ 3-2"), else by its order */
function tblName(n) {
  const T = RPT.doc.tables && RPT.doc.tables[n];
  return (T && T.cap) || tx().tableN(n + 1);
}
function locText(p, pi, off) {
  const t = tx();
  const pg = pageAt(p, off);
  const a = [];
  if (pg) a.push(t.page + ' ' + pg);
  if (p.tbl != null) a.push(tblName(p.tbl), t.row + ' ' + p.row);
  else {
    if (!pg) a.push(t.para + ' ' + (p.no || pi + 1));
    if (p.inTable) a.push(t.table);
  }
  return a.join(' · ');
}
const locShort = pi => locText(RPT.doc.paras[pi], pi, 0).split(' · ')[0];
/* where the earlier copy is: a row of this table, another table, or a page */
function refText(i) {
  const q = RPT.doc.paras[i.ref], p = RPT.doc.paras[i.para];
  if (q.tbl == null) return locShort(i.ref);
  if (i.msg === 'tableSame') return tblName(q.tbl);
  return (q.tbl === p.tbl ? '' : tblName(q.tbl) + ' ') + tx().row + ' ' + q.row;
}

function message(i) {
  const m = tx().msg;
  if (i.cat === 'spell') return m.spell;
  if (i.cat === 'overuse') return m.overuse(i.count);
  if (i.cat === 'tabledup') return m[i.msg](i) + (i.ref != null ? ' (' + refText(i) + ')' : '');
  if (i.cat === 'datamatch' || i.cat === 'dict' || /^(yearBE|yearCE|codeForm|stationForm|decimals)$/.test(i.msg || '')) {
    const f = m[i.msg];
    return typeof f === 'function' ? f(i) : f || '';
  }
  if (i.cat === 'prep' || i.cat === 'toc' || i.cat === 'abbr' || i.cat === 'sci') {
    const f = m[i.msg];
    const base = typeof f === 'function' ? f(i) : f || '';
    return /^abbr(Before|Twice|Meaning)$/.test(i.msg) && i.ref != null ? base + ' ' + locShort(i.ref) : base;
  }
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
  if (i.cat === 'tabledup') return '<b>' + esc(i.found.length > 140 ? i.found.slice(0, 138) + '…' : i.found) + '</b>';
  const text = RPT.doc.paras[i.para].text;
  const [s, e] = i.ranges[0];
  if (e - s > 120) return '<b>' + esc(text.slice(s, s + 110)) + '…</b>';
  let a = Math.max(0, s - 36), b = Math.min(text.length, e + 36);
  // don't cut a Thai cluster: no excerpt starts on a mark (…่างดำ) or drops one
  const MARK = /[ัำ-ฺ็-๎]/;
  while (a > 0 && a < s && (MARK.test(text[a]) || /[ะาๅ]/.test(text[a]))) a++;
  while (b < text.length && MARK.test(text[b])) b++;
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
  const meta = d.kind === 'pdf' || (d.kind === 'docx' && d.hasPages) ? d.pages + ' ' + t.pages : d.paras.filter(p => p.text.trim() && !p.inTable).length + ' ' + t.paras;
  body.innerHTML =
    '<div class="rc-top">' +
    '<div class="rc-file"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><polyline points="14 3 14 8 19 8"/></svg>' +
    '<span class="rc-fname">' + esc(RPT.name) + '</span><span class="rc-fmeta">' + esc(meta) + '</span></div>' +
    '<div class="rc-actions"><button class="btn" id="rc-restore" hidden></button><button class="btn" id="rc-new">' + esc(t.newFile) + '</button>' +
    '<button class="btn btn-primary" id="rc-export">' + esc(t.export) + '</button></div></div>' +
    (d.notes || []).map(n => '<div class="rc-note' + (n === 'pdfspace' ? '' : ' warn') + '">' + esc(t.note[n]) + '</div>').join('') +
    (RPT.prevSkips ? '<div class="rc-note" id="rc-prevskips">' + esc(t.prevSkips(RPT.prevSkips)) + '</div>' : '') +
    '<div class="rc-main" id="rc-main" style="--rc-lw:' + RPT.listW + 'px">' +
    '<div class="rc-side">' +
    '<div class="rc-tools" id="rc-tools">' +
    '<label class="rc-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input id="rc-q" type="search" autocomplete="off" placeholder="' + esc(t.searchPh) + '" aria-label="' + esc(t.searchPh) + '" value="' + esc(RPT.q) + '"></label>' +
    '<div class="rc-sevf" id="rc-sevf" role="group" aria-label="' + esc(t.sevLbl) + '"></div>' +
    '<div class="rc-chips" id="rc-chips"></div>' +
    '<div class="rc-scope-row" id="rc-scope"></div></div>' +
    '<div class="rc-count" id="rc-count" aria-live="polite"></div>' +
    '<div class="rc-list" id="rc-list" aria-label="' + esc(t.total) + '"></div></div>' +
    '<div class="rc-split" id="rc-split" role="separator" aria-orientation="vertical" tabindex="0" aria-label="' + esc(t.resize) + '"></div>' +
    '<div class="rc-docpane"><div class="rc-dbar">' +
    '<div class="rc-pnav" id="rc-pnav"><button data-pg="prev" aria-label="' + esc(t.prevPage) + '">‹</button><span>' + esc(t.page) + '</span>' +
    '<input id="rc-pg" inputmode="numeric" aria-label="' + esc(t.goPage) + '"><span class="rc-pgn" id="rc-pgn"></span>' +
    '<button data-pg="next" aria-label="' + esc(t.nextPage) + '">›</button></div>' +
    '<div class="rc-find" id="rc-find" hidden><span id="rc-find-n" aria-live="polite"></span>' +
    '<button data-f="-1" aria-label="' + esc(t.findPrev) + '">‹</button><button data-f="1" aria-label="' + esc(t.findNext) + '">›</button></div>' +
    (d.kind === 'docx' ? '<div class="rc-opt compact rc-brk" id="rc-brk" title="' + esc(t.brkHint) + '"><span class="rc-opt-lbl">' + esc(t.brkLbl) + '</span><div class="rc-seg" role="group" aria-label="' + esc(t.brkLbl) + '">' +
      '<button data-brk="mac">Word Mac</button><button data-brk="win">Word Windows</button></div></div>' : '') +
    '<div class="rc-zoom" id="rc-zoom" role="group" aria-label="Zoom"><button data-z="out" aria-label="' + esc(t.zoomOut) + '">−</button>' +
    '<button data-z="fit" id="rc-zoom-v" title="' + esc(t.zoomFit) + '"></button><button data-z="in" aria-label="' + esc(t.zoomIn) + '">+</button></div></div>' +
    '<div class="rc-doc" id="rc-doc"></div></div></div>';

  document.getElementById('rc-new').addEventListener('click', () => { unload(); renderStart(); });
  document.getElementById('rc-export').addEventListener('click', exportXlsx);
  document.getElementById('rc-restore').addEventListener('click', () => {
    RPT.ignored.clear(); RPT.ignoredKeys.clear(); saveSkips();
    RPT.prevSkips = 0;
    const note = document.getElementById('rc-prevskips');
    if (note) note.remove();
    refresh();
  });
  document.getElementById('rc-tools').addEventListener('click', e => {
    if (e.target.closest('[data-scope]')) return onScope(e);
    const cc = e.target.closest('[data-cats]');
    if (cc) {
      RPT.off.clear();
      if (cc.dataset.cats === 'none') live().forEach(i => RPT.off.add(i.cat));
      refresh();
      return;
    }
    const sv = e.target.closest('[data-sev]');
    if (sv) { RPT.sev = sv.dataset.sev; refresh(); return; }
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    const c = b.dataset.cat;
    if (RPT.off.has(c)) RPT.off.delete(c); else RPT.off.add(c);
    refresh();
  });
  let qt = null;
  const qEl = document.getElementById('rc-q');
  qEl.addEventListener('input', e => {
    clearTimeout(qt);
    qt = setTimeout(() => { RPT.q = e.target.value; findInDoc(); renderList(); renderCount(); }, 150);
  });
  qEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(qt);
    if (RPT.q !== qEl.value) { RPT.q = qEl.value; findInDoc(); renderList(); renderCount(); }
    gotoFind(e.shiftKey ? -1 : 1);
  });
  document.getElementById('rc-find').addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (b) gotoFind(+b.dataset.f);
  });
  const list = document.getElementById('rc-list');
  list.addEventListener('click', onListClick);
  list.addEventListener('keydown', onListKey);
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
  const doc = document.getElementById('rc-doc');
  doc.addEventListener('click', e => {
    const m = e.target.closest('[data-i]');
    if (m) select(+m.dataset.i, 'doc');
  });
  let raf = 0;
  doc.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; trackPage(); }); }, { passive: true });
  document.getElementById('rc-pnav').addEventListener('click', e => {
    const b = e.target.closest('[data-pg]');
    if (b) goPage(curPage() + (b.dataset.pg === 'next' ? 1 : -1));
  });
  const pg = document.getElementById('rc-pg');
  pg.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goPage(parseInt(pg.value, 10)); pg.blur(); } });
  pg.addEventListener('change', () => goPage(parseInt(pg.value, 10)));
  const bk = document.getElementById('rc-brk');
  if (bk) bk.addEventListener('click', e => {
    const b = e.target.closest('[data-brk]');
    if (!b || b.dataset.brk === breakMode()) return;
    RPT.brk = b.dataset.brk;
    renderDoc(true);
  });
  splitter();
  refresh();
}
/* How Thai lines wrap: as Word for Mac or for Windows did (guessed from the file) */
function breakMode() {
  const d = RPT.doc;
  if (RPT.brk) return RPT.brk;
  if (!d.brkGuess) d.brkGuess = guessBreaks(d);
  return d.brkGuess;
}

function refresh() {
  renderSummary();
  renderList();
  renderCount();
  renderDoc();
  const n = RPT.issues.filter(i => RPT.ignored.has(sig(i)) || RPT.ignoredKeys.has(i.key)).length;
  const r = document.getElementById('rc-restore');
  if (r) { r.hidden = !n; r.textContent = tx().restore + ' (' + n + ')'; }
}

/* Level filter (all / fix / check / note), category chips, repeat scope */
function renderSummary() {
  const t = tx();
  const all = live();
  const by = {}, sev = { err: 0, warn: 0, info: 0 };
  all.forEach(i => { if (!RPT.off.has(i.cat)) sev[i.sev]++; });
  all.forEach(i => { if (RPT.sev === 'all' || i.sev === RPT.sev) by[i.cat] = (by[i.cat] || 0) + 1; });
  const tot = sev.err + sev.warn + sev.info;
  document.getElementById('rc-sevf').innerHTML =
    '<button data-sev="all" aria-pressed="' + (RPT.sev === 'all') + '">' + esc(t.sevAll) + ' <b>' + tot + '</b></button>' +
    ['err', 'warn', 'info'].map(s => '<button class="sev-' + s + '" data-sev="' + s + '" aria-pressed="' + (RPT.sev === s) + '"' + (sev[s] ? '' : ' disabled') + '><i></i>' +
      esc(t.sev[s]) + ' <b>' + sev[s] + '</b></button>').join('');
  const allCats = [...new Set(all.map(i => i.cat))];
  const on = allCats.filter(c => !RPT.off.has(c)).length;
  document.getElementById('rc-chips').innerHTML = CATS.filter(c => allCats.includes(c)).map(c =>
    '<button class="rc-chip" data-cat="' + c + '" aria-pressed="' + !RPT.off.has(c) + '">' + esc(t.cat[c]) + ' <b>' + (by[c] || 0) + '</b></button>').join('') +
    (allCats.length > 1 ? '<span class="rc-chipctl"><button data-cats="all"' + (on === allCats.length ? ' disabled' : '') + '>' + esc(t.catAll) + '</button>' +
      '<button data-cats="none"' + (on === 0 ? ' disabled' : '') + '>' + esc(t.catNone) + '</button></span>' : '');
  document.getElementById('rc-scope').innerHTML = scopeHtml(true);
}

function renderCount() {
  const el = document.getElementById('rc-count');
  if (!el) return;
  const n = shown().length, m = listed().length;
  el.textContent = RPT.q.trim() ? tx().found(m, n) + ' · ' + tx().inDoc(findCount()) : '';
  el.hidden = !RPT.q.trim();
}

/* Text a finding can be searched by */
function searchable(i) {
  const p = RPT.doc.paras[i.para];
  return [tx().cat[i.cat], message(i), i.found, i.suggest, p.heading, locText(p, i.para, i.ranges[0][0]),
    p.text.slice(Math.max(0, i.ranges[0][0] - 30), i.ranges[0][1] + 30)].join(' ').toLowerCase();
}
function listed(list = shown()) {
  const q = RPT.q.trim().toLowerCase();
  if (!q) return list;
  const words = q.split(/\s+/);
  return list.filter(i => { const s = searchable(i); return words.every(w => s.includes(w)); });
}

function renderList() {
  const t = tx();
  const list = listed().sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || a.para - b.para || a.ranges[0][0] - b.ranges[0][0]);
  const el = document.getElementById('rc-list');
  if (!list.length) {
    /* the search only looks at the shown categories/levels: say so when
       hidden ones would match */
    const hidden = RPT.q.trim() ? listed(live()).length : 0;
    const allOff = live().length && live().every(i => RPT.off.has(i.cat));
    el.innerHTML = '<div class="rc-empty">' + esc(RPT.q.trim() ? t.noMatch : allOff ? t.noCat : RPT.issues.length ? t.none : t.clean) +
      (hidden ? '<div class="rc-hidden">' + esc(t.hiddenMatch(hidden)) + '</div><button class="btn" data-act="showAll">' + esc(t.showAll) + '</button>' : '') +
      (RPT.q.trim() && findCount() ? '<div class="rc-hidden">' + esc(t.docMatch(findCount())) + '</div>' : '') + '</div>';
    return;
  }
  const keyCount = new Map();
  shown().forEach(i => keyCount.set(i.key, (keyCount.get(i.key) || 0) + 1));
  const h = [];
  list.slice(0, LIST_CAP).forEach(i => {
    const p = RPT.doc.paras[i.para];
    const fix = i.suggest && i.suggest.trim() ? '<span class="rc-fix">' + esc(t.fix) + ' <b>' + esc(i.suggest) + '</b></span>' : '';
    h.push('<div class="rc-item sev-' + i.sev + (RPT.sel === i.id ? ' sel' : '') + '" data-id="' + i.id + '" tabindex="0" role="button"' +
      (p.heading ? ' title="' + esc(t.heading + ': ' + p.heading) + '"' : '') + '>' +
      '<div class="rc-item-hd"><span class="rc-dot"></span><span class="rc-cat">' + esc(t.cat[i.cat]) + '</span>' +
      '<span class="rc-loc">' + esc(locText(p, i.para, i.ranges[0][0])) + '</span></div>' +
      '<div class="rc-ctx">' + context(i) + '</div>' +
      '<div class="rc-msg">' + fix + esc(message(i)) + '</div>' +
      '<div class="rc-btns"><button data-act="copy">' + esc(t.copy) + '</button><button data-act="ignore">' + esc(t.ignore) + '</button>' +
      (keyCount.get(i.key) > 1 ? '<button data-act="ignoreAll">' + esc(t.ignoreAll) + ' (' + keyCount.get(i.key) + ')</button>' : '') +
      (i.cat === 'dict' ? '<button data-act="addWord">' + esc(t.addWord) + '</button>' : '') +
      '</div></div>');
  });
  if (list.length > LIST_CAP) h.push('<div class="rc-more">' + esc(t.more(list.length)) + '</div>');
  el.innerHTML = h.join('');
}

function onListClick(e) {
  if (e.target.closest('[data-act="showAll"]')) { RPT.off.clear(); RPT.sev = 'all'; refresh(); return; }
  const item = e.target.closest('.rc-item');
  if (!item) return;
  const id = +item.dataset.id;
  const iss = RPT.issues.find(x => x.id === id);
  const act = e.target.closest('[data-act]');
  if (act) {
    e.stopPropagation();
    if (act.dataset.act === 'ignore') { RPT.ignored.add(sig(iss)); saveSkips(); if (RPT.sel === id) RPT.sel = null; refresh(); }
    else if (act.dataset.act === 'ignoreAll') { RPT.ignoredKeys.add(iss.key); saveSkips(); refresh(); }
    else if (act.dataset.act === 'addWord') {
      /* the word as shown, and its unknown part, so it is known in any sentence */
      USER.add(iss.word);
      if (iss.core && iss.core.length >= 2) USER.add(iss.core);
      saveWords();
      if (RPT.sel === id) RPT.sel = null;
      refresh();
    }
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
/* ↑ ↓ move through the list; Enter shows the spot */
function onListKey(e) {
  const item = e.target.closest('.rc-item');
  if (!item || e.target !== item) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(+item.dataset.id, 'list'); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  let nx = e.key === 'ArrowDown' ? item.nextElementSibling : item.previousElementSibling;
  while (nx && !nx.classList.contains('rc-item')) nx = e.key === 'ArrowDown' ? nx.nextElementSibling : nx.previousElementSibling;
  if (nx) { nx.focus(); select(+nx.dataset.id, 'list'); }
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

/* Document view: the report drawn as pages (reportView.js). All findings
   are drawn once; filters only show or hide their marks. */
let fitObs = null;
function renderDoc(force) {
  const t = tx();
  const d = RPT.doc;
  const el = document.getElementById('rc-doc');
  if (!el) return;
  if (force || RPT.drawn !== RPT.issues || !el.firstChild) {
    const byPara = new Map();
    const put = (pi, i) => { if (!byPara.has(pi)) byPara.set(pi, []); byPara.get(pi).push(i); };
    RPT.issues.forEach(i => {
      put(d.kind === 'docx' ? (d.paras[i.para] || {}).idx ?? i.para : i.para, i);
      for (const [pi, s, e] of i.also || []) put(d.kind === 'docx' ? (d.paras[pi] || {}).idx ?? pi : pi, { ...i, para: pi, ranges: [[s, e]] });
    });
    const keep = el.scrollTop;
    const w = d.kind === 'docx' ? renderWord(el, d, byPara, t.page, breakMode())
      : d.kind === 'pdf' ? renderPdf(el, d, byPara, RPT.pdfCache, t.page)
      : renderPlain(el, d, byPara);
    el.dataset.w = w;
    RPT.drawn = RPT.issues;
    fit(el);
    el.scrollTop = keep;
    if (!fitObs) fitObs = new ResizeObserver(() => { const e = document.getElementById('rc-doc'); if (e) fit(e); });
    fitObs.disconnect();
    fitObs.observe(el);
    const n = el.querySelectorAll('.rc-sheet[data-pg]').length;
    const nav = document.getElementById('rc-pnav');
    if (nav) nav.hidden = n < 2;
    const pgn = document.getElementById('rc-pgn');
    if (pgn) pgn.textContent = '/ ' + n;
    trackPage();
    document.querySelectorAll('#rc-brk [data-brk]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.brk === breakMode())));
    findInDoc();
  }
  applyMarks();
}
/* Show the marks of the findings that pass the filters; where findings
   overlap, the most severe shown one colours the mark. */
function applyMarks() {
  const el = document.getElementById('rc-doc');
  if (!el) return;
  const vis = new Set(shown().map(i => i.id));
  const sevOf = new Map(RPT.issues.map(i => [i.id, i.sev]));
  el.querySelectorAll('[data-is]').forEach(m => {
    const id = m.dataset.is.split(' ').map(Number).find(x => vis.has(x));
    m.classList.remove('sev-err', 'sev-warn', 'sev-info', 'sel');
    if (id == null) { m.classList.add('rc-off'); m.removeAttribute('data-i'); return; }
    m.classList.remove('rc-off');
    m.dataset.i = id;
    m.classList.add('sev-' + sevOf.get(id));
    if (id === RPT.sel) m.classList.add('sel');
  });
}

/* ── Search in the report text ──
   Word and pasted text: every match becomes a DOM Range, painted with the
   CSS Highlight API (the pages are not changed). PDF: boxes over the page
   image from the text positions. The page script's invisible characters
   (word joiners) are skipped, so matches are found across them. */
const FIND = { ranges: [], boxes: [], cur: -1 };
const HAS_HL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
const lowerAscii = s => s.replace(/[A-Z]/g, c => c.toLowerCase()); // keeps every index in place
const findCount = () => FIND.ranges.length || FIND.boxes.length;
function clearFind() {
  FIND.ranges = []; FIND.boxes = []; FIND.cur = -1;
  if (HAS_HL) { CSS.highlights.delete('rc-find'); CSS.highlights.delete('rc-find-cur'); }
  document.querySelectorAll('#rc-doc .rc-findbox').forEach(b => b.remove());
}
function findInDoc() {
  const el = document.getElementById('rc-doc');
  clearFind();
  const q = lowerAscii(RPT.q.trim().replace(/[\u2060\u200B]/g, ''));
  if (el && q && RPT.doc) {
    if (RPT.doc.kind === 'pdf') findPdf(el, q); else findDom(el, q);
  }
  findBar();
}
function findDom(el, q) {
  for (const p of el.querySelectorAll('.rc-wp')) {
    let str = '';
    const map = [];
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.parentElement.closest('.rc-wp') !== p) continue; // text boxes inside are their own paragraphs
      const t = n.data;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === '\u2060' || t[i] === '\u200B') continue;
        str += t[i];
        map.push(n, i);
      }
    }
    const low = lowerAscii(str);
    for (let k = low.indexOf(q); k >= 0 && FIND.ranges.length < 3000; k = low.indexOf(q, k + q.length)) {
      const e = k + q.length - 1;
      const r = document.createRange();
      r.setStart(map[2 * k], map[2 * k + 1]);
      r.setEnd(map[2 * e], map[2 * e + 1] + 1);
      FIND.ranges.push(r);
    }
  }
  if (HAS_HL && FIND.ranges.length) CSS.highlights.set('rc-find', new Highlight(...FIND.ranges));
}
function findPdf(el, q) {
  const d = RPT.doc;
  d.paras.forEach((p, pi) => {
    const low = lowerAscii(p.text);
    for (let k = low.indexOf(q); k >= 0 && FIND.boxes.length < 3000; k = low.indexOf(q, k + q.length)) FIND.boxes.push({ pi, s: k, e: k + q.length });
  });
  FIND.boxes.forEach((m, i) => {
    const p = d.paras[m.pi];
    const sheet = el.querySelector('.rc-sheet.pdf[data-pg="' + p.page + '"]');
    if (!sheet) return;
    for (const r of pdfRects(d, p, [[m.s, m.e]])) {
      const b = document.createElement('div');
      b.className = 'rc-findbox';
      b.dataset.f = i;
      b.style.cssText = 'left:' + r[0].toFixed(1) + 'px;top:' + r[1].toFixed(1) + 'px;width:' + r[2].toFixed(1) + 'px;height:' + r[3].toFixed(1) + 'px';
      sheet.appendChild(b);
    }
  });
}
function findBar() {
  const bar = document.getElementById('rc-find');
  if (!bar) return;
  const n = findCount();
  bar.hidden = !RPT.q.trim();
  bar.classList.toggle('none', !n);
  document.getElementById('rc-find-n').textContent = !n ? tx().findNone : FIND.cur >= 0 ? tx().findPos(FIND.cur + 1, n) : tx().inDoc(n);
}
/* Show match number cur: bring its page into view first (off-screen pages
   are not laid out), then centre the match */
function gotoFind(step) {
  const n = findCount();
  const el = document.getElementById('rc-doc');
  if (!n || !el) return;
  FIND.cur = (FIND.cur + step + n) % n;
  let target, sheet;
  if (FIND.ranges.length) {
    const r = FIND.ranges[FIND.cur];
    if (HAS_HL) CSS.highlights.set('rc-find-cur', new Highlight(r));
    sheet = r.startContainer.parentElement.closest('.rc-sheet');
    target = () => r.getBoundingClientRect();
  } else {
    el.querySelectorAll('.rc-findbox.cur').forEach(b => b.classList.remove('cur'));
    const bs = el.querySelectorAll('.rc-findbox[data-f="' + FIND.cur + '"]');
    bs.forEach(b => b.classList.add('cur'));
    sheet = bs[0] && bs[0].closest('.rc-sheet');
    target = () => (bs[0] ? bs[0].getBoundingClientRect() : null);
  }
  if (sheet) el.scrollTop += sheet.getBoundingClientRect().top - el.getBoundingClientRect().top;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const rc = target();
    if (rc && rc.height) el.scrollTop += rc.top - el.getBoundingClientRect().top - el.clientHeight / 3;
    trackPage();
  }));
  findBar();
}

/* Page navigation */
function sheets() { const el = document.getElementById('rc-doc'); return el ? [...el.querySelectorAll('.rc-sheet[data-pg]')] : []; }
function curPage() { return parseInt((document.getElementById('rc-pg') || {}).value, 10) || 1; }
function trackPage() {
  const el = document.getElementById('rc-doc');
  const inp = document.getElementById('rc-pg');
  if (!el || !inp || document.activeElement === inp) return;
  const y = el.getBoundingClientRect().top + el.clientHeight * 0.35;
  let n = 1;
  for (const s of sheets()) { if (s.getBoundingClientRect().top <= y) n = +s.dataset.pg; else break; }
  inp.value = n;
}
function goPage(n) {
  const all = sheets();
  if (!all.length || !n) return;
  n = Math.max(1, Math.min(all.length, n));
  const el = document.getElementById('rc-doc');
  const s = all[n - 1];
  el.scrollTop += s.getBoundingClientRect().top - el.getBoundingClientRect().top - 10;
  document.getElementById('rc-pg').value = n;
}

/* Drag the divider to give the list or the page more room */
function splitter() {
  const sp = document.getElementById('rc-split'), main = document.getElementById('rc-main');
  if (!sp || !main) return;
  const set = w => {
    const max = Math.max(320, main.clientWidth * 0.6);
    RPT.listW = Math.round(Math.max(260, Math.min(max, w)));
    main.style.setProperty('--rc-lw', RPT.listW + 'px');
  };
  const save = () => { try { localStorage.setItem('aer-rc-lw', RPT.listW); } catch (e) { /* private mode */ } };
  sp.addEventListener('pointerdown', e => {
    e.preventDefault();
    sp.setPointerCapture(e.pointerId);
    sp.classList.add('drag');
    const x0 = e.clientX, w0 = RPT.listW;
    const move = ev => set(w0 + ev.clientX - x0);
    const up = () => { sp.classList.remove('drag'); sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); save(); };
    sp.addEventListener('pointermove', move);
    sp.addEventListener('pointerup', up);
  });
  sp.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); set(RPT.listW + (e.key === 'ArrowRight' ? 24 : -24)); save(); }
  });
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
      i.cat === 'tabledup' ? i.found : p.text.slice(s, Math.min(e, s + 200)), i.suggest || '', message(i),
      p.text.slice(Math.max(0, s - 40), Math.min(p.text.length, e + 40)).replace(/\n/g, ' ')]);
  });
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = [6, 10, 18, 16, 30, 30, 16, 50, 60].map(w => ({ wch: w }));
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Report Check');
  /* table of abbreviations, ready to paste into the report */
  const { defs, uses } = scanAbbr(RPT.doc);
  if (defs.size) {
    const ar = [t.abbrHead];
    [...defs.keys()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })).forEach(a => {
      const d = defs.get(a)[0];
      ar.push([a, d.full, locText(RPT.doc.paras[d.pi], d.pi, d.s), uses.get(a).length]);
    });
    const ws2 = X.utils.aoa_to_sheet(ar);
    ws2['!cols'] = [12, 50, 20, 10].map(w => ({ wch: w }));
    X.utils.book_append_sheet(wb, ws2, t.abbrSheet);
  }
  const base = RPT.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'report';
  X.writeFile(wb, 'ReportCheck_' + base + '.xlsx');
}
