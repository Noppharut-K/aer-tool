/**
 * reportCheck.js — the checks behind the Report Check page. Pure: no DOM.
 *
 * Input  doc = { kind: 'docx'|'pdf'|'text', paras: [Para] }
 *        Para = { text, page?, heading?, isHeading?, inTable?, toc?, hf? }
 *          hf   = repeated page header/footer (PDF) — not checked
 *          toc  = table-of-contents line — only character/spelling checks
 *        doc.tables (Word only) = [{ rows: [[{ col, span, paras:[index] }]] }]
 * Output [Issue] = { id, cat, sev, para, ranges:[[start,end]], found,
 *                    suggest, msg, key, ref?, also?:[[para,start,end]] }
 *          (offsets into para.text; `also` = more places to highlight)
 *
 * Thai has no spaces between words, so words come from the browser's own
 * dictionary segmenter (Intl.Segmenter 'th').
 */

const SEG = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter('th', { granularity: 'word' }) : null;

/* Display order of the categories */
export const CATS = ['prep', 'spell', 'dict', 'char', 'dupword', 'dupphrase', 'tabledup', 'datamatch', 'number', 'toc', 'abbr', 'sci', 'consist', 'overuse', 'space', 'pair'];
export const SEV_ORDER = { err: 0, warn: 1, info: 2 };

const THAI = /[\u0E00-\u0E7F]/;
const NUMERIC = /^[0-9๐-๙.,%]+$/;
const lc = w => w.toLowerCase();
const thaiDigits = s => s.replace(/[๐-๙]/g, d => String(d.charCodeAt(0) - 0x0E50));

export function tokenize(text) {
  const out = [];
  if (SEG) {
    for (const s of SEG.segment(text)) {
      if (s.isWordLike) out.push({ w: s.segment, s: s.index, e: s.index + s.segment.length });
    }
  } else {
    for (const m of text.matchAll(/[\u0E00-\u0E7F]+|[A-Za-z]+|[0-9]+/g)) {
      out.push({ w: m[0], s: m.index, e: m.index + m[0].length });
    }
  }
  return out;
}

/* ── Word lists ─────────────────────────────────────────────────────────── */

/* Misspellings that are wrong wherever they appear: [wrong, correct, lookahead?]
   The lookahead stops a match inside the correct word (คลอโรฟิล → คลอโรฟิลล์). */
const SPELL = [
  ['อนุญาติ', 'อนุญาต'], ['ผลลัพท์', 'ผลลัพธ์'], ['(?<!ปรา)กฏ', 'กฎ'], ['ปรากฎ', 'ปรากฏ'],
  ['อุณภูมิ', 'อุณหภูมิ'], ['ทะเลสาป', 'ทะเลสาบ'], ['สังเกตุ', 'สังเกต'], ['เกณท์', 'เกณฑ์'],
  ['เกณฑ', 'เกณฑ์', '(?!\u0E4C)'], ['มาตรฐาณ', 'มาตรฐาน'], ['ฟอสเฟส', 'ฟอสเฟต'],
  ['แพลงตอน', 'แพลงก์ตอน'], ['แพลงค์ตอน', 'แพลงก์ตอน'], ['แพงก์ตอน', 'แพลงก์ตอน'],
  ['ประสิทธิ์ภาพ', 'ประสิทธิภาพ'], ['อัตตรา', 'อัตรา'], ['ปฎิบัติ', 'ปฏิบัติ'],
  ['ปฏิกริยา', 'ปฏิกิริยา'], ['ปฎิกิริยา', 'ปฏิกิริยา'],
  ['คลอโรฟิล', 'คลอโรฟิลล์', '(?!ล์)'], ['คลอโรฟิวส์', 'คลอโรฟิลล์'],
  ['เปอร์เซนต์', 'เปอร์เซ็นต์'], ['เปอร์เซ็น', 'เปอร์เซ็นต์', '(?!ต์)'],
  ['โอกาศ', 'โอกาส'], ['ประเมิณ', 'ประเมิน'], ['วิเคาระห์', 'วิเคราะห์'], ['วิเคราห์', 'วิเคราะห์'],
  ['วิเคระห์', 'วิเคราะห์'], ['รายระเอียด', 'รายละเอียด'], ['ศรีษะ', 'ศีรษะ'],
  ['อ๊อกซิเจน', 'ออกซิเจน'], ['ออกซิเจ้น', 'ออกซิเจน'], ['ซัลเฟท', 'ซัลเฟต'],
  ['ปริมาน', 'ปริมาณ'], ['ผูกพันธ์', 'ผูกพัน'], ['บรรยากาส', 'บรรยากาศ'],
  ['สิ่งแวกล้อม', 'สิ่งแวดล้อม'], ['สิงแวดล้อม', 'สิ่งแวดล้อม'], ['ชายฝั้ง', 'ชายฝั่ง'],
  ['ตระกอน', 'ตะกอน'], ['สัตหน้าดิน', 'สัตว์หน้าดิน'], ['ความหลายหลาก', 'ความหลากหลาย'],
  ['จำนวณ', 'จำนวน'], ['เปรียบเทียป', 'เปรียบเทียบ'], ['ผลกระทป', 'ผลกระทบ'],
].map(([bad, good, tail]) => ({ re: new RegExp(bad + (tail || ''), 'g'), good }));

/* Spellings where either form is seen in reports, but one report should
   pick one. Each group lists the variants. */
const VARIANTS = [
  ['ไนเตรท', 'ไนเตรต'], ['ไนไตรท์', 'ไนไตรต์'], ['ซิลิเกต', 'ซิลิเคต'], ['อีเมล์', 'อีเมล'],
  ['แอมโมเนียไนโตรเจน', 'แอมโมเนีย-ไนโตรเจน'], ['คลอโรฟิลล์ เอ', 'คลอโรฟิลล์-เอ', 'คลอโรฟิลล์เอ'],
];

const STOP = new Set((
  'ที่ และ ใน ของ การ ความ มี เป็น ได้ ให้ จาก กับ โดย ซึ่ง ว่า ไม่ จะ นี้ นั้น ไป มา อยู่ แต่ หรือ เพื่อ ทั้ง ' +
  'ตาม ต่อ แล้ว ก็ ด้วย ถึง อย่าง เมื่อ คือ ยัง ส่วน ระหว่าง บริเวณ พบ ค่า สถานี อัน แห่ง ทาง ขึ้น ลง ออก ' +
  'เข้า กัน แก่ ต้อง อาจ ควร เช่น ดัง ดังนี้ ดังกล่าว ประมาณ มาก น้อย กว่า เท่า เดียว แต่ละ ทุก บาง หนึ่ง ' +
  'สอง สาม ปี เดือน วัน ครั้ง ช่วง จุด ตัวอย่าง พื้นที่ ข้อมูล ผล ตรวจ วัด น้ำ ทะเล ดิน ชนิด กลุ่ม ราย ' +
  'ตาราง รูป ภาพ หน่วย ระดับ ซึ่ง เพราะ จึง หาก ถ้า ทำ ใช้ เคย ไว้ ยัง คน ตัว ละ เท่านั้น นอกจาก รวม ' +
  'the and of to in for with from that this are was were is be by on at as an or which their its these ' +
  'those than also have has had not but station sample samples value values'
).split(/\s+/));

/* ── helpers ────────────────────────────────────────────────────────────── */

function makeAdder(out) {
  let n = 0;
  return (o) => { o.id = ++n; out.push(o); return o; };
}

/* Opening/closing pairs; straight double quotes are counted separately */
const OPEN = { '(': ')', '[': ']', '{': '}', '“': '”' };
const CLOSE = { ')': '(', ']': '[', '}': '{', '”': '“' };

const CAP_LABEL = '(ตาราง(?:ที่)?|รูป(?:ที่)?|ภาพ(?:ที่)?|แผนภาพ(?:ที่)?|แผนที่ที่|Table|Figure|Fig\\.?)';
const NUM_PAT = '([0-9๐-๙]+(?:\\s?[.\\-–]\\s?[0-9๐-๙]+)*)';
const CAP_RE = new RegExp('^\\s*' + CAP_LABEL + '\\s*' + NUM_PAT, 'i');
const REF_RE = new RegExp('(ตารางที่|รูปที่|ภาพที่|แผนภาพที่|Table|Figure|Fig\\.)\\s*' + NUM_PAT, 'gi');
const CONT_RE = /^\s*[(（]?\s*(ต่อ|continued|cont\.?)/i;

function capKind(label) {
  const l = label.toLowerCase();
  if (l.startsWith('ตาราง') || l.startsWith('table')) return 'table';
  return 'figure';
}
const capLang = label => (THAI.test(label) ? 'th' : 'en');
function capNum(raw) {
  const parts = thaiDigits(raw).split(/\s?[.\-–]\s?/).map(Number);
  const sep = /[.]/.test(raw) ? '.' : (/[\-–]/.test(raw) ? '-' : '');
  return { parts, key: parts.join('-'), sep };
}

/* ── main ───────────────────────────────────────────────────────────────── */

export function runChecks(doc, opts = {}) {
  const scope = opts.scope === 'doc' ? 'doc' : 'para';
  const issues = [];
  const add = makeAdder(issues);
  const paras = doc.paras;
  const isPdf = doc.kind === 'pdf';
  const toks = paras.map(p => (p.hf ? [] : tokenize(p.text)));

  /* Paragraphs covered by a whole-paragraph duplicate skip the phrase check */
  const dupParaSkip = new Set();

  paras.forEach((p, pi) => {
    if (p.hf) return;
    const t = p.text;

    /* Spelling */
    for (const r of SPELL) {
      r.re.lastIndex = 0;
      for (const m of t.matchAll(r.re)) {
        add({ cat: 'spell', sev: 'err', para: pi, ranges: [[m.index, m.index + m[0].length]],
          found: m[0], suggest: r.good, key: 'spell:' + m[0] });
      }
    }

    /* Characters that look right but are wrong (break search/sorting) */
    for (const m of t.matchAll(/เเ/g)) {
      add({ cat: 'char', sev: 'err', para: pi, ranges: [[m.index, m.index + 2]], found: 'เเ', suggest: 'แ',
        msg: 'ee', key: 'char:ee' });
    }
    for (const m of t.matchAll(/\u0E4Dา/g)) {
      add({ cat: 'char', sev: 'err', para: pi, ranges: [[m.index, m.index + 2]], found: '\u0E4Dา', suggest: 'ำ',
        msg: 'am', key: 'char:am' });
    }
    for (const m of t.matchAll(/([\u0E31\u0E34-\u0E3A\u0E47-\u0E4E])\1+/g)) {
      add({ cat: 'char', sev: 'err', para: pi, ranges: [[m.index, m.index + m[0].length]], found: m[0], suggest: m[1],
        msg: 'mark2', key: 'char:mark2' });
    }
    if (!isPdf) {
      for (const m of t.matchAll(/[\u0E48-\u0E4B][\u0E31\u0E34-\u0E37]/g)) {
        add({ cat: 'char', sev: 'warn', para: pi, ranges: [[m.index, m.index + 2]], found: m[0], suggest: m[0][1] + m[0][0],
          msg: 'order', key: 'char:order' });
      }
    }
    const zw = [...t.matchAll(/[\u200B-\u200D\u2060\uFEFF]/g)].map(m => [m.index, m.index + 1]);
    if (zw.length) add({ cat: 'char', sev: 'info', para: pi, ranges: zw, found: '', suggest: '', msg: 'zw', key: 'char:zw', count: zw.length });
    for (const m of t.matchAll(/(?<=[0-9๐-๙]\s?)(?:[º˚]|o)\s?C(?![A-Za-z])/g)) {
      add({ cat: 'char', sev: 'warn', para: pi, ranges: [[m.index, m.index + m[0].length]], found: m[0], suggest: '°C',
        msg: 'deg', key: 'char:deg' });
    }

    /* Broken Word cross-references */
    for (const m of t.matchAll(/Error! (?:Reference source not found|Bookmark not defined|No text of specified style in document|Not a valid bookmark self-reference)\.?|ข้อผิดพลาด!\s*ไม่(?:พบ|ได้กำหนด|มีข้อความ)[^\n.]{0,40}/g)) {
      add({ cat: 'number', sev: 'err', para: pi, ranges: [[m.index, m.index + m[0].length]], found: m[0], suggest: '',
        msg: 'field', key: 'number:field' });
    }

    /* Repeated word: the same word twice in a row */
    const tk = toks[pi];
    for (let k = 0; k + 1 < tk.length; k++) {
      const a = tk[k];
      const num = NUMERIC.test(a.w);
      /* a repeated number ("25.3 25.3") counts too — except in PDFs, where a
         table row reads as one line of neighbouring cells */
      if (num && (isPdf || !/[0-9๐-๙]/.test(a.w) || (a.w.length < 2 && !/[.,]/.test(a.w)))) continue;
      if (!num && a.w.length === 1 && !THAI.test(a.w)) continue;
      let j = k;
      /* "ปลา ปลาทู" segments as ปลา|ปลา|ทู — after a space, the repeat must
         be a whole word, not the start of a longer one */
      const again = n => {
        const gap = t.slice(tk[n].e, tk[n + 1].s);
        if (lc(tk[n + 1].w) !== lc(a.w) || !/^[ \u00A0\n]*$/.test(gap)) return false;
        return gap === '' || !/[\u0E01-\u0E4E]/.test(t[tk[n + 1].e] || '');
      };
      while (j + 1 < tk.length && again(j)) j++;
      if (j === k) continue;
      const span = t.slice(a.s, tk[j].e);
      add({ cat: 'dupword', sev: 'warn', para: pi, ranges: [[a.s, tk[j].e]], found: span, suggest: a.w,
        msg: span.includes('\n') ? 'line' : num ? 'num' : '', key: 'dupword:' + (num ? '#' : lc(a.w)) });
      k = j;
    }

    if (p.toc) return;

    /* Spacing — PDF spacing is reconstructed from glyph positions, so only
       for Word/pasted text. */
    if (!isPdf && !p.inTable) {
      for (const m of t.matchAll(/(?<=\S) {2,}(?=\S)/g)) {
        add({ cat: 'space', sev: 'info', para: pi, ranges: [[m.index, m.index + m[0].length]], found: '', suggest: ' ',
          msg: 'double', key: 'space:double' });
      }
      for (const m of t.matchAll(/(?<=\S) +(?=[,;])|(?<=\() +| +(?=\))/g)) {
        add({ cat: 'space', sev: 'info', para: pi, ranges: [[m.index, m.index + m[0].length]], found: '', suggest: '',
          msg: 'punct', key: 'space:punct' });
      }
    }

    /* Brackets and quotes that are not closed */
    {
      /* a lone ")" right after a list marker — "1) ", "ก) " — is not an error */
      const marker = new Set();
      for (const m of t.matchAll(/(^|[\s])(?:[0-9๐-๙]{1,2}|[a-zA-Zก-ฮ])\)(?=\s|$)/g)) marker.add(m.index + m[0].length - 1);
      const stack = [];
      const bad = [];
      for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (OPEN[c]) stack.push(i);
        else if (CLOSE[c]) {
          if (stack.length && t[stack[stack.length - 1]] === CLOSE[c]) stack.pop();
          else if (!marker.has(i)) bad.push(i);
        }
      }
      bad.push(...stack);
      const q = [...t.matchAll(/"/g)];
      if (q.length % 2) bad.push(q[q.length - 1].index);
      for (const i of bad.sort((a, b) => a - b)) {
        add({ cat: 'pair', sev: isPdf ? 'info' : 'warn', para: pi, ranges: [[i, i + 1]], found: t[i], suggest: '',
          msg: OPEN[t[i]] ? 'open' : 'close', key: 'pair:' + pi + ':' + i });
      }
    }

    /* Same content word 3+ times within 20 words */
    if (!p.inTable) {
      const pos = new Map();
      tk.forEach((x, k) => {
        const w = lc(x.w);
        if (NUMERIC.test(w) || STOP.has(w)) return;
        if (THAI.test(w) ? w.length < 3 : w.length < 4) return;
        if (!pos.has(w)) pos.set(w, []);
        pos.get(w).push(k);
      });
      for (const [w, ks] of pos) {
        if (ks.length < 3) continue;
        const hit = new Set();
        for (let i = 0; i + 2 < ks.length; i++) if (ks[i + 2] - ks[i] < 20) [ks[i], ks[i + 1], ks[i + 2]].forEach(k => hit.add(k));
        if (!hit.size) continue;
        const ranges = [...hit].sort((a, b) => a - b).map(k => [tk[k].s, tk[k].e]);
        add({ cat: 'overuse', sev: 'info', para: pi, ranges, found: tk[ks[0]].w, suggest: '', msg: '',
          key: 'overuse:' + w, count: ranges.length });
      }
    }
  });

  /* ── Repeated passages ──
     Reports repeat set sentences on purpose (the same wording for every
     station), so by default a repeat only counts inside one paragraph:
       scope 'para' — 8+ words repeated within the same paragraph
       scope 'doc'  — whole paragraphs, or 12+ words, repeated anywhere   */
  if (scope === 'doc') {
    const seen = new Map();
    paras.forEach((p, pi) => {
      if (p.hf || p.toc || p.inTable) return;
      const k = p.text.replace(/\s+/g, ' ').trim();
      if (k.length < 40) return;
      if (seen.has(k)) {
        add({ cat: 'dupphrase', sev: 'warn', para: pi, ranges: [[0, p.text.length]], found: '', suggest: '',
          msg: 'para', ref: seen.get(k), key: 'dupphrase:p:' + pi });
        dupParaSkip.add(pi); dupParaSkip.add(seen.get(k));
      } else seen.set(k, pi);
    });
  }
  {
    const N = scope === 'doc' ? 12 : 8;
    const MIN_CHARS = scope === 'doc' ? 40 : 24;
    let first = new Map(); // n-gram -> [para, tokenIndex] of its first occurrence
    const cover = new Map(); // para -> Map(tokenIndex -> [earlier para, earlier tokenIndex])
    paras.forEach((p, pi) => {
      if (p.hf || p.toc || dupParaSkip.has(pi)) return;
      /* table cells repeat each other by design — only within one cell */
      if (p.inTable) { const keep = first; first = new Map(); scan(pi); first = keep; return; }
      if (scope !== 'doc') first = new Map();
      scan(pi);
    });
    function scan(pi) {
      const ws = toks[pi].map(x => lc(x.w));
      for (let k = 0; k + N <= ws.length; k++) {
        const g = ws.slice(k, k + N).join('\u0001');
        const f = first.get(g);
        if (!f) { first.set(g, [pi, k]); continue; }
        if (f[0] === pi && k - f[1] < N) continue; // overlapping run inside one paragraph
        if (!cover.has(pi)) cover.set(pi, new Map());
        const c = cover.get(pi);
        for (let j = k; j < k + N; j++) if (!c.has(j)) c.set(j, [f[0], f[1] + (j - k)]);
      }
    }
    for (const [pi, c] of cover) {
      const tk = toks[pi];
      const idx = [...c.keys()].sort((a, b) => a - b);
      let s = 0;
      for (let i = 1; i <= idx.length; i++) {
        if (i < idx.length && idx[i] === idx[i - 1] + 1) continue;
        const a = tk[idx[s]], b = tk[idx[i - 1]];
        if (b.e - a.s >= MIN_CHARS) {
          const [rp, rk] = c.get(idx[s]);
          const ranges = [[a.s, b.e]];
          if (rp === pi) {
            /* same paragraph: also mark the earlier copy */
            const rEnd = c.get(idx[i - 1])[1];
            ranges.push([tk[rk].s, tk[Math.min(rEnd, tk.length - 1)].e]);
          }
          add({ cat: 'dupphrase', sev: rp === pi ? 'warn' : 'info', para: pi, ranges, found: '', suggest: '',
            msg: rp === pi ? 'phraseSame' : 'phrase', ref: rp === pi ? null : rp, key: 'dupphrase:' + pi + ':' + a.s });
        }
        s = i;
      }
    }
  }

  /* ── Table / figure numbering ── */
  {
    const caps = [];
    const capAt = new Set();
    paras.forEach((p, pi) => {
      if (p.hf || p.toc) return;
      /* captions start a paragraph (the PDF reader breaks paragraphs there) */
      {
        const seg = p.text.split('\n')[0];
        const m = seg.match(CAP_RE);
        if (!m) return;
        const after = seg.slice(m[0].length);
        if (/^[0-9๐-๙]/.test(after)) return;
        const st = m.index + m[0].indexOf(m[1]);
        capAt.add(pi + ':' + st);
        caps.push({ pi, s: st, e: m[0].length, label: m[1], kind: capKind(m[1]), lang: capLang(m[1]),
          num: capNum(m[2]), cont: CONT_RE.test(after) });
      }
    });

    const KIND_TH = { table: 'table', figure: 'figure' };
    const groups = new Map();
    for (const c of caps) {
      if (c.cont) continue;
      const g = c.kind + '|' + c.lang + '|' + c.num.parts.slice(0, -1).join('-');
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(c);
    }
    for (const list of groups.values()) {
      const seen = new Map();
      let prev = null;
      for (const c of list) {
        const last = c.num.parts[c.num.parts.length - 1];
        const label = p => paras[c.pi].text.slice(c.s, c.e);
        const base = { cat: 'number', para: c.pi, ranges: [[c.s, c.e]], found: label(), suggest: '', kind: KIND_TH[c.kind] };
        if (seen.has(c.num.key)) {
          add({ ...base, sev: 'warn', msg: 'capdup', ref: seen.get(c.num.key), key: 'number:capdup:' + c.pi + ':' + c.s });
        } else if (prev == null && last !== 1) {
          add({ ...base, sev: 'info', msg: 'capstart', key: 'number:capstart:' + c.pi + ':' + c.s });
        } else if (prev != null && last > prev + 1) {
          add({ ...base, sev: 'warn', msg: 'capgap', prevNum: prev, key: 'number:capgap:' + c.pi + ':' + c.s });
        } else if (prev != null && last < prev) {
          add({ ...base, sev: 'warn', msg: 'caporder', prevNum: prev, key: 'number:caporder:' + c.pi + ':' + c.s });
        }
        if (!seen.has(c.num.key)) seen.set(c.num.key, c.pi);
        prev = Math.max(prev ?? 0, last);
      }
    }

    /* Mixed separators: ตารางที่ 3-1 and ตารางที่ 3.2 in one report */
    for (const kind of ['table', 'figure']) {
      const ks = caps.filter(c => c.kind === kind && c.num.sep);
      const cnt = {}; ks.forEach(c => { cnt[c.num.sep] = (cnt[c.num.sep] || 0) + 1; });
      const seps = Object.keys(cnt);
      if (seps.length < 2) continue;
      const major = seps.sort((a, b) => cnt[b] - cnt[a])[0];
      for (const c of ks) if (c.num.sep !== major) {
        add({ cat: 'consist', sev: 'info', para: c.pi, ranges: [[c.s, c.e]], found: paras[c.pi].text.slice(c.s, c.e),
          suggest: major, msg: 'capsep', key: 'consist:capsep:' + kind });
      }
    }

    /* References to a table/figure number that has no caption */
    const have = { table: new Set(), figure: new Set() };
    caps.forEach(c => have[c.kind].add(c.num.key));
    paras.forEach((p, pi) => {
      if (p.hf || p.toc) return;
      for (const m of p.text.matchAll(REF_RE)) {
        if (capAt.has(pi + ':' + m.index)) continue;
        const kind = capKind(m[1]);
        if (!have[kind].size) continue;
        const n = capNum(m[2]);
        if (have[kind].has(n.key)) continue;
        add({ cat: 'number', sev: 'warn', para: pi, ranges: [[m.index, m.index + m[0].length]], found: m[0], suggest: '',
          msg: 'refmissing', kind, key: 'number:ref:' + kind + ':' + n.key });
      }
    });
  }

  tableChecks(doc, paras, add);
  prepChecks(doc, paras, add);
  tocChecks(doc, paras, add);
  abbrChecks(doc, paras, add);
  sciChecks(doc, paras, add);
  claimChecks(doc, paras, add);
  moreConsistency(doc, paras, add);
  dictChecks(doc, paras, add, opts.dict);

  /* ── Consistency across the whole report ── */
  const body = paras.map((p, pi) => [p, pi]).filter(([p]) => !p.hf && !p.toc);

  /* ๆ written with and without a space before it */
  {
    const occ = { spaced: [], tight: [] };
    for (const [p, pi] of body) for (const m of p.text.matchAll(/(\s?)ๆ/g)) {
      if (m.index === 0 && !m[1]) continue;
      (m[1] ? occ.spaced : occ.tight).push([pi, m.index, m.index + m[0].length]);
    }
    if (occ.spaced.length && occ.tight.length) {
      const minor = occ.spaced.length < occ.tight.length ? 'spaced' : 'tight';
      const major = minor === 'spaced' ? 'tight' : 'spaced';
      for (const [pi, s, e] of occ[minor]) {
        add({ cat: 'consist', sev: 'info', para: pi, ranges: [[s, e]], found: paras[pi].text.slice(s, e),
          suggest: major === 'spaced' ? ' ๆ' : 'ๆ', msg: 'yamok', counts: [occ[major].length, occ[minor].length], key: 'consist:yamok' });
      }
    }
  }

  /* Thai and Arabic digits mixed in running text */
  {
    const th = [], ar = [];
    for (const [p, pi] of body) {
      if (p.inTable) continue;
      for (const m of p.text.matchAll(/[๐-๙]+/g)) th.push([pi, m.index, m.index + m[0].length]);
      for (const m of p.text.matchAll(/(?<![A-Za-z])[0-9]+/g)) ar.push([pi, m.index, m.index + m[0].length]);
    }
    if (th.length && ar.length) {
      const minor = th.length <= ar.length ? th : ar;
      const byPara = new Map();
      for (const [pi, s, e] of minor) { if (!byPara.has(pi)) byPara.set(pi, []); byPara.get(pi).push([s, e]); }
      for (const [pi, ranges] of byPara) {
        add({ cat: 'consist', sev: 'info', para: pi, ranges, found: paras[pi].text.slice(ranges[0][0], ranges[0][1]),
          suggest: '', msg: minor === th ? 'thdigit' : 'ardigit', counts: [th.length, ar.length], key: 'consist:digits' });
      }
    }
  }

  /* Units written more than one way (mg/L vs mg/l, µg/L vs ug/L, m3 vs m³ ...) */
  {
    const UNIT = /(?<![A-Za-z])(?:[µμu]?g|mg|ng|kg|cells?|ind\.?|individuals?|org\.?|ml|mL|[lL]|m|cm|mm)\s?\/\s?(?:[µμu]?g|mg|kg|ml|mL|[lL]|(?:m|cm)(?:\^?[23²³])?)(?![A-Za-z0-9²³])/g;
    const canon = u => u.replace(/\s/g, '').replace(/[μu](?=g)/g, 'µ').replace(/\^/g, '').replace(/²/g, '2').replace(/³/g, '3')
      .replace(/cells?/i, 'cell').replace(/individuals?/i, 'ind').replace(/ind\./, 'ind').replace(/org\./, 'org').toLowerCase();
    const fam = new Map();
    for (const [p, pi] of body) for (const m of p.text.matchAll(UNIT)) {
      const k = canon(m[0]);
      if (!fam.has(k)) fam.set(k, new Map());
      const f = fam.get(k);
      if (!f.has(m[0])) f.set(m[0], []);
      f.get(m[0]).push([pi, m.index, m.index + m[0].length]);
    }
    for (const f of fam.values()) {
      if (f.size < 2) continue;
      const forms = [...f.keys()].sort((a, b) => f.get(b).length - f.get(a).length);
      const major = forms[0];
      for (const form of forms.slice(1)) for (const [pi, s, e] of f.get(form)) {
        add({ cat: 'consist', sev: 'warn', para: pi, ranges: [[s, e]], found: form, suggest: major, msg: 'unit',
          counts: [f.get(major).length, f.get(form).length], key: 'consist:unit:' + form });
      }
    }
  }

  /* Terms spelled two accepted ways */
  for (const group of VARIANTS) {
    const hits = new Map();
    for (const [p, pi] of body) for (const v of group) {
      for (const m of p.text.matchAll(new RegExp(v.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'), 'g'))) {
        /* a longer variant that contains this one is counted under itself */
        if (group.some(o => o !== v && o.length > v.length && o.includes(v) && p.text.startsWith(o, m.index - o.indexOf(v)))) continue;
        if (!hits.has(v)) hits.set(v, []);
        hits.get(v).push([pi, m.index, m.index + m[0].length]);
      }
    }
    if (hits.size < 2) continue;
    const forms = [...hits.keys()].sort((a, b) => hits.get(b).length - hits.get(a).length);
    for (const form of forms.slice(1)) for (const [pi, s, e] of hits.get(form)) {
      add({ cat: 'consist', sev: 'warn', para: pi, ranges: [[s, e]], found: form, suggest: forms[0], msg: 'term',
        counts: [hits.get(forms[0]).length, hits.get(form).length], key: 'consist:term:' + form });
    }
  }

  issues.sort((a, b) => a.para - b.para || a.ranges[0][0] - b.ranges[0][0] || SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
  return issues;
}

/* ── Repeated data in tables ──
   Copy a row (or a column, or a whole table) for the next station and
   forget to change the values: the numbers then match exactly. Labels may
   differ; the numbers are what is compared. */

const NUMCELL = /^[<>≤≥~±+\-()0-9๐-๙.,%\s]+$/;
const isNumCell = s => /[0-9๐-๙]/.test(s) && NUMCELL.test(s);
const numsOf = s => (thaiDigits(s).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => x.replace(/,/g, ''));
const yearish = v => /^\d{4}$/.test(v) && ((+v >= 1900 && +v <= 2100) || (+v >= 2400 && +v <= 2700));
/* worth comparing: 2+ numbers, not all the same, not all years, and at
   least one that is not a tiny whole number (0, 1, 2 …) */
function telling(cells) {
  const vals = cells.flatMap(numsOf);
  if (vals.length < 2 || new Set(vals).size < 2) return false;
  if (vals.every(yearish)) return false;
  return vals.some(v => v.includes('.') ? +v > 0 : +v >= 10);
}
const squash = s => s.replace(/\s+/g, ' ').trim();
const short = s => (s.length > 30 ? s.slice(0, 28) + '…' : s);

function tableChecks(doc, paras, add) {
  const whole = i => [i, 0, paras[i].text.length];
  if (doc.kind === 'pdf') return pdfRows(paras, add);
  if (!doc.tables) return;
  const tableSeen = new Map();
  doc.tables.forEach((T, ti) => {
    const grid = T.rows.map(r => r.map(c => {
      const ps = c.paras.filter(i => paras[i].text.trim());
      return { col: c.col, span: c.span, ps, text: squash(ps.map(i => paras[i].text).join(' ')) };
    }));
    const anchor = cs => {
      const ps = cs.flatMap(c => c.ps);
      return { para: ps[0], ranges: [[0, paras[ps[0]].text.length]], also: ps.slice(1).map(whole) };
    };

    /* whole table: every number the same as an earlier table */
    {
      const nums = grid.flatMap((r, ri) => r.filter(c => isNumCell(c.text)).map(c => ({ ri, c })));
      if (nums.length >= 6 && telling(nums.map(x => x.c.text))) {
        const k = nums.map(x => x.ri + ':' + x.c.col + ':' + x.c.text).join('\u0001');
        const prev = tableSeen.get(k);
        if (prev) {
          add({ cat: 'tabledup', sev: 'warn', ...anchor(nums.map(x => x.c)), found: nums.slice(0, 8).map(x => x.c.text).join(' | ') + (nums.length > 8 ? ' …' : ''), suggest: '',
            msg: 'tableSame', ref: prev, key: 'tabledup:t:' + ti });
          return; // its rows/columns would only repeat the same finding
        } else tableSeen.set(k, nums[0].c.ps[0]);
      }
    }

    /* rows: the numbers from the first number cell onwards */
    const rowSeen = new Map();
    grid.forEach((r, ri) => {
      const f = r.findIndex(c => isNumCell(c.text));
      if (f < 0) return;
      const data = r.slice(f);
      if (data.filter(c => isNumCell(c.text)).length < 2 || !telling(data.map(c => c.text))) return;
      const k = data.map(c => c.col + ':' + c.text).join('\u0001');
      const label = squash(r.slice(0, f).map(c => c.text).join(' '));
      const prev = rowSeen.get(k);
      if (!prev) { rowSeen.set(k, { ri, label, para: data.find(c => c.ps.length).ps[0] }); return; }
      const cells = data.filter(c => c.ps.length);
      add({ cat: 'tabledup', sev: 'warn', ...anchor(cells), found: data.map(c => c.text).join(' | '), suggest: '',
        msg: label === prev.label ? 'rowSame' : 'rowData', other: short(prev.label), ref: prev.para,
        key: 'tabledup:r:' + ti + ':' + ri });
    });

    /* columns: single-width cells lined up by grid column */
    const cols = new Map();
    grid.forEach((r, ri) => r.forEach(c => {
      if (c.span !== 1 || c.col == null) return;
      if (!cols.has(c.col)) cols.set(c.col, new Map());
      cols.get(c.col).set(ri, c);
    }));
    const head = col => {
      for (const c of [...col.values()]) { if (isNumCell(c.text)) break; if (c.text) return c.text; }
      return '';
    };
    const keys = [...cols.keys()].sort((a, b) => a - b);
    const flagged = new Set();
    for (let x = 0; x < keys.length; x++) for (let y = x + 1; y < keys.length; y++) {
      if (flagged.has(keys[y])) continue;
      const A = cols.get(keys[x]), B = cols.get(keys[y]);
      let same = [], bad = false;
      for (const ri of new Set([...A.keys(), ...B.keys()])) {
        const a = A.get(ri), b = B.get(ri);
        const an = a && isNumCell(a.text), bn = b && isNumCell(b.text);
        if (!an && !bn) continue;
        if (an && bn && a.text === b.text) same.push(b); else { bad = true; break; }
      }
      if (bad || same.length < 3 || !telling(same.map(c => c.text))) continue;
      flagged.add(keys[y]);
      const cells = same.filter(c => c.ps.length);
      add({ cat: 'tabledup', sev: 'warn', ...anchor(cells), found: same.map(c => c.text).join(' | '), suggest: '',
        msg: 'colData', label: short(head(B)), other: short(head(A)), ref: null,
        key: 'tabledup:c:' + ti + ':' + keys[y] });
    }
  });
}

/* PDFs have no table structure: compare lines that end in 3+ numbers,
   on the same or the next page. */
function pdfRows(paras, add) {
  const seen = new Map();
  paras.forEach((p, pi) => {
    if (p.hf || p.toc) return;
    let off = 0;
    for (const line of p.text.split('\n')) {
      const s = off;
      off += line.length + 1;
      const toks = [...line.matchAll(/\S+/g)];
      const f = toks.findIndex(m => isNumCell(m[0]));
      if (f < 0) continue;
      const data = toks.slice(f);
      if (data.length < 3 || !data.every(m => isNumCell(m[0]) || /^(ND|N\/A|-|–)$/i.test(m[0]))) continue;
      if (data.filter(m => isNumCell(m[0])).length < 3 || !telling(data.map(m => m[0]))) continue;
      const k = data.map(m => m[0]).join(' ');
      const label = squash(line.slice(0, data[0].index));
      const prev = seen.get(k);
      const range = [s + data[0].index, s + line.length];
      if (prev && p.page - prev.page <= 1) {
        add({ cat: 'tabledup', sev: 'warn', para: pi, ranges: [range], found: k, suggest: '',
          msg: label === prev.label ? 'rowSame' : 'rowData', other: short(prev.label), ref: prev.para,
          key: 'tabledup:r:' + pi + ':' + s });
      } else seen.set(k, { page: p.page, label, para: pi });
    }
  });
}

/* ── Before sending: comments, tracked changes, highlighter, hidden text,
   text left to fill in ── */
const PLACEHOLDER = /x{3,}|X{3,}|\?{3,}|\.{6,}|_{6,}|…{2,}|\[(?:ใส่|เติม|ระบุ|รอ|insert|add|todo)[^\]]{0,40}\]|\((?:ใส่|เติม|รอ)[^)]{0,30}\)|(?<![A-Za-z])(?:TBD|TBC|TODO|FIXME|Lorem ipsum)(?![A-Za-z])/gi;
function prepChecks(doc, paras, add) {
  const len = pi => paras[pi].text.length;
  const one = (pi, s) => [Math.min(s, Math.max(0, len(pi) - 1)), Math.min(len(pi), Math.min(s, Math.max(0, len(pi) - 1)) + 1)];
  for (const c of doc.comments || []) {
    if (c.p == null || !paras[c.p]) continue;
    const r = c.e > c.s ? [c.s, c.e] : one(c.p, c.s);
    add({ cat: 'prep', sev: 'err', para: c.p, ranges: [r], found: paras[c.p].text.slice(r[0], r[1]), suggest: '',
      msg: 'comment', author: c.author, note: c.text, key: 'prep:comment' });
  }
  paras.forEach((p, pi) => {
    if (p.hf) return;
    if (p.revs && p.revs.length) {
      const ranges = p.revs.map(r => (r.e > r.s ? [r.s, r.e] : one(pi, r.s)));
      const kinds = new Set(p.revs.map(r => r.k));
      add({ cat: 'prep', sev: 'err', para: pi, ranges, found: '', suggest: '', msg: 'track', count: p.revs.length,
        kinds: [...kinds], key: 'prep:track' });
    }
    if (p.hidden && p.hidden.length) {
      add({ cat: 'prep', sev: 'warn', para: pi, ranges: [one(pi, p.hidden[0].at)], found: '', suggest: '', msg: 'hidden',
        count: p.hidden.reduce((a, h) => a + h.n, 0), key: 'prep:hidden' });
    }
    if (p.runs) {
      const ranges = [];
      for (const r of p.runs) if (!r.img && r.rp && r.rp.hl && r.rp.hl !== 'none' && r.e > r.s) {
        const last = ranges[ranges.length - 1];
        if (last && last[1] === r.s) last[1] = r.e; else ranges.push([r.s, r.e]);
      }
      if (ranges.length) add({ cat: 'prep', sev: 'warn', para: pi, ranges, found: p.text.slice(ranges[0][0], ranges[0][1]), suggest: '', msg: 'hl', key: 'prep:hl' });
    }
    if (p.toc) return;
    PLACEHOLDER.lastIndex = 0;
    for (const m of p.text.matchAll(PLACEHOLDER)) {
      add({ cat: 'prep', sev: 'err', para: pi, ranges: [[m.index, m.index + m[0].length]], found: m[0], suggest: '', msg: 'placeholder', key: 'prep:ph' });
    }
  });
}

/* ── Table of contents: page numbers and titles against the real ones.
   Word records the page each heading landed on when it saved; a TOC that
   was not updated after edits shows old numbers. ── */
const normT = s => thaiDigits(s).replace(/[\s\t\u00A0\u200B]+/g, '').toLowerCase();
function tocChecks(doc, paras, add) {
  if (!doc.hasLR || !doc.pageLabels) return;
  const pageOf = (pi, off) => paras[pi].page + (paras[pi].breaks || []).filter(b => b <= off).length;
  /* fallback when an entry has no link: a heading or caption with the same text */
  const byText = new Map();
  paras.forEach((p, pi) => {
    if (p.toc || p.hf || !p.text.trim()) return;
    const k = normT((p.label || '') + p.text);
    if (!byText.has(k)) byText.set(k, pi); else byText.set(k, -1);
  });
  paras.forEach((p, pi) => {
    if (!p.toc) return;
    const m = /^(.*\S)\t\s*([0-9๐-๙]+|[ivxlcdm]+|[ก-ฮ])\s*$/i.exec(p.text);
    if (!m) return;
    const title = m[1].replace(/\t/g, ' ').trim();
    const shown = m[2];
    let target = null;
    if (p.tocAnchor && doc.bookmarks && doc.bookmarks[p.tocAnchor]) target = doc.bookmarks[p.tocAnchor];
    else { const t = byText.get(normT(title)); if (t != null && t >= 0) target = { p: t, off: 0 }; }
    if (!target || !paras[target.p]) return;
    const real = doc.pageLabels[pageOf(target.p, target.off)];
    const numAt = p.text.length - m[2].length - (p.text.length - p.text.trimEnd().length);
    if (real != null && normT(real) !== normT(shown)) {
      add({ cat: 'toc', sev: 'warn', para: pi, ranges: [[numAt, numAt + shown.length]], found: shown, suggest: real,
        msg: 'tocpage', real, ref: target.p, key: 'toc:page' });
    }
    const tp = paras[target.p];
    /* compare without the leading number ("2.1", "บทที่ 3") */
    const bare = x => normT(x).replace(/^(?:บทที่|chapter|appendix)?[0-9.\-–]*/i, '');
    const want = bare((tp.label || '') + ' ' + tp.text), have = bare(title);
    if (have && want && want !== have) {
      add({ cat: 'toc', sev: 'info', para: pi, ranges: [[0, Math.min(p.text.length, m[1].length)]], found: title, suggest: '',
        msg: 'toctitle', now: ((tp.label ? tp.label + ' ' : '') + tp.text).replace(/\s+/g, ' ').trim().slice(0, 80), ref: target.p, key: 'toc:title' });
    }
  });
}

/* ── Abbreviations ──
   Definitions: "ออกซิเจนละลายน้ำ (DO)", "Dissolved Oxygen (DO)",
   "(Dissolved Oxygen; DO)", "กรมควบคุมมลพิษ (คพ.)", and rows of an
   abbreviations table (first cell the abbreviation). */
const ABBR_EN = '[A-Za-z][A-Za-z0-9&\\-/]{0,9}';
const isAbbr = a => {
  const up = (a.match(/[A-Z]/g) || []).length;
  return a.length >= 2 && a.length <= 10 && (up >= 2 || /^[a-z]+[A-Z][A-Za-z]*$/.test(a)) && !/\//.test(a);
};
const SMALL = new Set(['of', 'and', 'the', 'for', 'in', 'on', 'to', 'by', 'at', '&']);
const keyOf = a => a.replace(/[.\s\-]/g, '').toUpperCase();
/* words that lead into a name but are not part of it */
const LEAD = /^(?:ตามเกณฑ์ของ|ตามประกาศของ|ค่า|ของ|ตาม|และ|หรือ|โดย|จาก|ใน|ที่|คือ|ได้แก่|ซึ่ง|เช่น|ปริมาณ|ระดับ|หน่วยงาน)/;
function trimThai(s) {
  for (let i = 0; i < 4; i++) { const t = s.replace(LEAD, ''); if (t === s || t.length < 4) break; s = t; }
  return s;
}
function commonEnd(a, b) { let k = 0; while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++; return a.slice(a.length - k); }
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function scanAbbr(doc) {
  const paras = doc.paras;
  const defs = new Map(); // abbreviation -> [{ pi, s, e, full }]
  const addDef = (abbr, pi, s, e, full) => {
    if (!defs.has(abbr)) defs.set(abbr, []);
    defs.get(abbr).push({ pi, s, e, full: (full || '').trim() });
  };
  /* an abbreviations table: right after a heading/caption that says so */
  let listMode = 0;
  paras.forEach((p, pi) => {
    if (p.hf || p.toc) return;
    const t = p.text;
    if (!p.inTable && /คำย่อ|อักษรย่อ|ตัวย่อ|abbreviation/i.test(t) && t.length < 80) listMode = 3;
    else if (!p.inTable && t.trim()) listMode = Math.max(0, listMode - 1);
    if (p.inTable && listMode && p.tbl != null && doc.tables) {
      const T = doc.tables[p.tbl];
      const row = T && T.rows[p.row - 1];
      if (row && row[0] && row[0].paras[0] === pi) {
        const a = t.trim();
        const rest = row.slice(1).flatMap(c => c.paras).map(i => paras[i].text).join(' ').trim();
        if ((isAbbr(a) || /^[ก-ฮ]{1,5}\.(?:[ก-ฮ]{1,5}\.)*$/.test(a)) && rest) addDef(a, pi, 0, a.length, rest);
      }
    }
    for (const m of t.matchAll(new RegExp('\\(([^()]{3,80}?)[;,]\\s*(' + ABBR_EN + ')\\)', 'g'))) {
      if (isAbbr(m[2])) addDef(m[2], pi, m.index + m[0].length - m[2].length - 1, m.index + m[0].length - 1, m[1]);
    }
    for (const m of t.matchAll(new RegExp('\\((' + ABBR_EN + ')\\)', 'g'))) {
      const a = m[1];
      if (!isAbbr(a)) continue;
      const before = t.slice(0, m.index).replace(/\s+$/, '');
      let full = '';
      const words = before.split(/\s+/);
      const letters = a.replace(/[^A-Za-z]/g, '');
      /* English: the words whose initials spell the abbreviation */
      for (let n = Math.min(words.length, letters.length + 3); n >= 2; n--) {
        const ws = words.slice(-n);
        const ini = ws.filter(w => !SMALL.has(w.toLowerCase())).map(w => w[0] || '').join('').toUpperCase();
        if (ini === letters.toUpperCase() && /^[A-Za-z]/.test(ws[0])) { full = ws.join(' '); break; }
      }
      /* Thai: the run of Thai text right before the bracket */
      if (!full) { const th = /([\u0E00-\u0E7F]{3,40})$/.exec(before); if (th) full = trimThai(th[1]); }
      if (full || /[\u0E00-\u0E7F]$/.test(before)) addDef(a, pi, m.index + 1, m.index + 1 + a.length, full);
    }
    for (const m of t.matchAll(/([\u0E00-\u0E7F]{3,40})\s*\(([ก-ฮ]{1,5}\.(?:[ก-ฮ]{1,5}\.)*)\)/g)) {
      addDef(m[2], pi, m.index + m[0].length - m[2].length - 1, m.index + m[0].length - 1, trimThai(m[1]));
    }
  });
  /* a name defined more than once: the common ending is the name itself
     ("ตามเกณฑ์ของกรมควบคุมมลพิษ", "ตามประกาศกรมควบคุมมลพิษ" → "กรมควบคุมมลพิษ") */
  for (const ds of defs.values()) {
    const th = ds.filter(d => /[\u0E00-\u0E7F]/.test(d.full));
    for (const d of th) for (const o of th) {
      if (d === o) continue;
      const c = commonEnd(d.full, o.full);
      if (c.length >= 4 && c.length < d.full.length) d.full = c;
    }
  }
  /* uses of each defined abbreviation (not the definitions themselves) */
  const uses = new Map();
  for (const a of defs.keys()) {
    const thai = /[ก-ฮ]/.test(a);
    const re = thai ? new RegExp(escRe(a), 'g') : new RegExp('(?<![A-Za-z0-9])' + escRe(a) + '(?![A-Za-z0-9])', 'g');
    const list = [];
    paras.forEach((p, pi) => {
      if (p.hf || p.toc) return;
      for (const m of p.text.matchAll(re)) {
        if (defs.get(a).some(d => d.pi === pi && d.s === m.index)) continue;
        list.push({ pi, s: m.index, e: m.index + a.length });
      }
    });
    uses.set(a, list);
  }
  return { defs, uses };
}
function abbrChecks(doc, paras, add) {
  const { defs, uses } = scanAbbr(doc);
  const before = (x, d) => x.pi < d.pi || (x.pi === d.pi && x.s < d.s);
  for (const [a, ds] of defs) {
    const d0 = ds[0];
    /* used before it is defined (headings and table cells too) */
    const early = uses.get(a).filter(u => before(u, d0));
    if (early.length) {
      const u = early[0];
      add({ cat: 'abbr', sev: 'warn', para: u.pi, ranges: [[u.s, u.e]], found: a, suggest: '', msg: 'abbrBefore', abbr: a, n: early.length,
        ref: d0.pi, key: 'abbr:before:' + a });
    }
    /* defined more than once */
    const same = (x, y) => { const a = normT(x), b = normT(y); return !a || !b || a === b || a.endsWith(b) || b.endsWith(a) || commonEnd(a, b).length >= 5; };
    const diff = ds.slice(1).filter(d => !same(d.full, d0.full));
    for (const d of diff) {
      add({ cat: 'abbr', sev: 'warn', para: d.pi, ranges: [[d.s, d.e]], found: a, suggest: '',
        msg: 'abbrMeaning', abbr: a, full: d.full, first: d0.full, ref: d0.pi, key: 'abbr:meaning:' + a });
    }
    /* the same definition again: one finding, every place marked */
    const again = ds.slice(1).filter(d => !diff.includes(d));
    if (again.length) {
      add({ cat: 'abbr', sev: 'info', para: again[0].pi, ranges: [[again[0].s, again[0].e]], also: again.slice(1).map(d => [d.pi, d.s, d.e]),
        found: a, suggest: '', msg: 'abbrTwice', abbr: a, n: again.length, ref: d0.pi, key: 'abbr:twice:' + a });
    }
    /* the full name written out again after the abbreviation was defined */
    const full = d0.full;
    if (full && full.length >= 4 && !/[;,]/.test(full)) {
      const re = new RegExp(escRe(full) + '(?!\\s*\\()', 'g');
      const at = [];
      paras.forEach((p, pi) => {
        if (p.hf || p.toc || p.inTable || pi < d0.pi) return;
        for (const m of p.text.matchAll(re)) {
          if (pi === d0.pi && m.index <= d0.s) continue;
          if (ds.some(d => d.pi === pi && Math.abs(d.s - (m.index + full.length)) < 6)) continue;
          at.push([pi, m.index, m.index + full.length]);
        }
      });
      if (at.length) add({ cat: 'abbr', sev: 'info', para: at[0][0], ranges: [[at[0][1], at[0][2]]], also: at.slice(1), found: full, suggest: a,
        msg: 'abbrFull', abbr: a, n: at.length, key: 'abbr:full:' + a });
    }
  }
  /* the same abbreviation written another way: DO / D.O. / Do, pH / PH */
  const keys = new Map([...defs.keys()].filter(a => !/[ก-ฮ]/.test(a)).map(a => [keyOf(a), a]));
  paras.forEach((p, pi) => {
    if (p.hf || p.toc) return;
    for (const m of p.text.matchAll(/(?<![A-Za-z0-9])[A-Za-z](?:\.?[A-Za-z0-9]){1,9}\.?(?![A-Za-z0-9])/g)) {
      const f = m[0].replace(/\.$/, m[0].length > 2 && /\.[A-Za-z]\.$/.test(m[0]) ? '.' : '');
      const a = keys.get(keyOf(f));
      if (!a || f === a) continue;
      if (!/[A-Z].*[A-Z]|\./.test(f) || /^[a-z]+$/.test(f)) continue; // "do", "Do" are words
      add({ cat: 'abbr', sev: 'warn', para: pi, ranges: [[m.index, m.index + f.length]], found: f, suggest: a, msg: 'abbrForm', abbr: a,
        key: 'abbr:form:' + f });
    }
  });
}

/* ── Scientific names in italics (Word files: needs the formatting) ──
   Genus + species ("Chaetoceros curvisetus"), Genus + sp./spp./cf., and
   abbreviated genus ("C. curvisetus"). sp./spp. themselves stay upright. */
const RANKS = /^(?:sp|spp|cf|aff|var|subsp|ssp|nov)\.$/;
const LATIN_END = /(?:us|um|a|ae|is|es|ii|i|ensis|oides|ata|ina|ella|ica|alis|ius|on|ix|ax|ex|eus|ea)$/;
const NOT_GENUS = new Set(['The', 'This', 'These', 'That', 'Those', 'There', 'Station', 'Stations', 'Table', 'Figure', 'Fig', 'Total', 'Mean', 'Average',
  'Sea', 'Water', 'Data', 'Phase', 'Zone', 'Area', 'Site', 'Point', 'Season', 'Dry', 'Wet', 'Rainy', 'Summer', 'Winter', 'Note', 'Source', 'Unit',
  'Group', 'Class', 'Order', 'Family', 'Phylum', 'Division', 'Kingdom', 'Others', 'Other', 'Unidentified', 'Number', 'Index', 'Value', 'Standard']);
function sciChecks(doc, paras, add) {
  if (doc.kind !== 'docx') return;
  const italicAt = (p, i) => { for (const r of p.runs) if (!r.img && r.s <= i && i < r.e) return !!(r.rp && r.rp.i); return false; };
  const allItalic = (p, s, e) => { for (let i = s; i < e; i++) if (!/\s/.test(p.text[i]) && !italicAt(p, i)) return false; return true; };
  const anyItalic = (p, s, e) => { for (let i = s; i < e; i++) if (!/[\s.]/.test(p.text[i]) && italicAt(p, i)) return true; return false; };
  const known = new Set();
  const BIN = /(?<![A-Za-z])([A-Z][a-z]{2,})\s+(sp\.|spp\.|cf\.|aff\.|var\.|[a-z]{3,})(?![A-Za-z])/g;
  /* is this a name, not two words of an English sentence ("Water quality …")? */
  const isName = (t, m) => {
    const [, g, ep] = m;
    if (NOT_GENUS.has(g)) return false;
    if (RANKS.test(ep) || known.has(g)) return true;
    if (!LATIN_END.test(ep)) return false;
    const prev = t.slice(0, m.index).match(/([A-Za-z]+)\s*$/);
    const next = t.slice(m.index + m[0].length).match(/^\s*([a-z]+)/);
    return !prev && !next;
  };
  paras.forEach(p => { if (!p.hf) for (const m of p.text.matchAll(BIN)) if (RANKS.test(m[2]) && !NOT_GENUS.has(m[1])) known.add(m[1]); });
  paras.forEach(p => { if (!p.hf) for (const m of p.text.matchAll(BIN)) if (isName(p.text, m)) known.add(m[1]); });
  const initials = new Set([...known].map(g => g[0]));
  paras.forEach((p, pi) => {
    if (p.hf || p.toc || !p.runs) return;
    const t = p.text;
    for (const m of t.matchAll(BIN)) {
      const [, g, ep] = m;
      if (!isName(t, m)) continue;
      const rank = RANKS.test(ep);
      const gs = m.index, ge = gs + g.length, es = m.index + m[0].length - ep.length, ee = m.index + m[0].length;
      const ok = allItalic(p, gs, ge) && (rank || allItalic(p, es, ee));
      if (!ok) {
        add({ cat: 'sci', sev: 'warn', para: pi, ranges: [[gs, rank ? ge : ee]], found: t.slice(gs, rank ? ge : ee), suggest: '', msg: 'sci',
          key: 'sci:' + g });
      } else if (rank && anyItalic(p, es, ee)) {
        add({ cat: 'sci', sev: 'info', para: pi, ranges: [[es, ee]], found: ep, suggest: '', msg: 'sciRank', key: 'sci:rank' });
      }
    }
    for (const m of t.matchAll(/(?<![A-Za-z])([A-Z])\.\s?([a-z]{4,})(?![A-Za-z])/g)) {
      if (!initials.has(m[1]) || !LATIN_END.test(m[2])) continue;
      const s = m.index, e = m.index + m[0].length;
      if (!allItalic(p, s, e)) add({ cat: 'sci', sev: 'warn', para: pi, ranges: [[s, e]], found: m[0], suggest: '', msg: 'sci', key: 'sci:' + m[1] + '.' });
    }
  });
}

/* ── Numbers in the text against the tables (Word files) ──
   "ค่าความเป็นกรดด่าง (pH) อยู่ในช่วง 7.8 ถึง 8.2" is compared with the pH
   values of the table the paragraph refers to (or the nearest one under the
   same heading). Each table gives series by column (header row on top) and
   by row (name in the first cell). */
const numVal = s => { const m = /^[<>≤≥~]?\s*([0-9๐-๙]+(?:[.,][0-9๐-๙]+)?)\s*$/.exec(s.trim()); return m && !/^[<>≤≥]/.test(s.trim()) ? parseFloat(thaiDigits(m[1]).replace(',', '.')) : null; };
const decOf = s => { const m = /[.,]([0-9๐-๙]+)/.exec(s); return m ? m[1].length : 0; };
const paramKey = s => s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/[\s:]+/g, '').toLowerCase();
const parenAbbr = s => { const m = /\(([A-Za-z][A-Za-z0-9\-]{0,9})\)/.exec(s); return m ? m[1].toLowerCase() : null; };
function tableSeries(doc, paras) {
  const out = [];
  if (!doc.tables) return out;
  const isNum = c => numVal(c.text) != null;
  const notParam = label => /^\s*(?:[A-Z]{1,4}[\s\-_.]?[0-9]+|สถานี|จุด|ฤดู|เดือน|ปี|ครั้งที่|ไตรมาส|[0-9๐-๙])/i.test(label); // a station or a time
  doc.tables.forEach((T, ti) => {
    const grid = T.rows.map(r => r.map(c => {
      const ps = c.paras.filter(i => paras[i].text.trim());
      return { col: c.col, span: c.span, rowspan: c.rowspan || 1, ps, text: ps.map(i => paras[i].text).join(' ').replace(/\s+/g, ' ').trim() };
    }));
    /* which cell covers each row/column, merged cells included */
    const occ = grid.map(() => []);
    grid.forEach((r, ri) => r.forEach(c => {
      for (let k = 0; k < c.rowspan && ri + k < grid.length; k++) for (let q = c.col; q < c.col + c.span; q++) occ[ri + k][q] = c;
    }));
    let h = 0;
    while (h < grid.length) {
      const r = grid[h], n = r.filter(isNum).length;
      if (r.length && n / r.length >= 0.3) break;
      h++;
    }
    if (h === grid.length) return;
    const first = T.rows.map(r => r[0]).find(Boolean);
    const anchor = first && first.paras[0];
    const push = (label, cells, dir) => {
      const vals = cells.filter(isNum).map(c => ({ v: numVal(c.text), dec: decOf(c.text), c }));
      if (vals.length < 2 || !label || notParam(label)) return;
      const keys = [paramKey(label)];
      const ab = parenAbbr(label);
      if (ab) keys.push(ab);
      out.push({ ti, label, keys: keys.filter(Boolean), vals, anchor, dir });
    };
    /* columns: header text above, values below */
    const cols = new Set(grid.slice(h).flatMap(r => r.filter(c => c.span === 1).map(c => c.col)));
    for (const col of cols) {
      const label = grid.slice(0, h).map(r => r.find(c => c.col <= col && col < c.col + c.span)).filter(Boolean).map(c => c.text).join(' ');
      push(label, grid.slice(h).map(r => r.find(c => c.col === col && c.span === 1)).filter(Boolean), 'col');
    }
    /* rows: the name in the first column; a name merged down over several
       rows (1 m, 10 m, 20 m …) covers all of them, and each value column
       of that block is a series of its own */
    let ri = h;
    while (ri < grid.length) {
      const L = occ[ri][0] || occ[ri].find(Boolean);
      if (!L) { ri++; continue; }
      let end = ri + 1;
      while (end < grid.length && occ[end][0] === L) end++;
      if (!isNum(L)) {
        const cells = grid.slice(ri, end).flat().filter(c => c !== L);
        push(L.text, cells, end - ri > 1 ? 'rows' : 'row'); // 'rows': the whole merged block, mixed columns
        if (end - ri > 1) {
          const cs = new Set(cells.map(c => c.col));
          for (const col of cs) push(L.text, cells.filter(c => c.col === col), 'block');
        }
      }
      ri = end;
    }
  });
  return out;
}
const NUM = '([0-9๐-๙]+(?:\\.[0-9๐-๙]+)?)';
const CLAIMS = [
  ['range', new RegExp('(?:อยู่)?(?:ในช่วง|ระหว่าง|ตั้งแต่)\\s*(?:ค่า)?\\s*' + NUM + '\\s*(?:ถึง|-|–|และ)\\s*' + NUM, 'g')],
  ['range', new RegExp('มีค่า\\s*' + NUM + '\\s*[-–]\\s*' + NUM, 'g')],
  ['mean', new RegExp('เฉลี่ย\\s*(?:เท่ากับ|อยู่ที่|ประมาณ|คือ)?\\s*' + NUM, 'g')],
  ['max', new RegExp('สูงสุด\\s*(?:เท่ากับ|อยู่ที่|คือ)?\\s*' + NUM, 'g')],
  ['min', new RegExp('ต่ำสุด\\s*(?:เท่ากับ|อยู่ที่|คือ)?\\s*' + NUM, 'g')],
];
const RANGE = new RegExp(NUM + '\\s*(?:[-–]|ถึง)\\s*' + NUM, 'g');
const roundTo = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
function claimChecks(doc, paras, add) {
  if (doc.kind !== 'docx' || !doc.tables || !doc.tables.length) return;
  const series = tableSeries(doc, paras);
  if (!series.length) return;
  /* names a parameter goes by: table labels, plus abbreviation ↔ full name */
  const alias = new Map(); // normalized name in text -> key
  for (const s of series) for (const k of s.keys) alias.set(k, k);
  const { defs } = scanAbbr(doc);
  for (const [a, ds] of defs) {
    const k = a.toLowerCase();
    if (!alias.has(k)) continue;
    for (const d of ds) if (d.full) alias.set(paramKey(d.full), k);
  }
  const names = [...alias.keys()].filter(n => n.length >= 2).sort((x, y) => y.length - x.length);
  /* a word from a list ("ปริมาณออกซิเจนละลาย") to a table name */
  const resolve = item => {
    const x = paramKey(item).replace(/^(?:และ|หรือ|มี|ค่า|ปริมาณ|ระดับ)+/, '');
    if (x.length < 2) return null;
    if (alias.has(x)) return alias.get(x);
    for (const [n, k] of alias) if (n.length >= 3 && ((x.length >= 5 && n.startsWith(x)) || x.endsWith(n))) return k;
    return null;
  };
  const capIdx = new Map();
  doc.tables.forEach((T, ti) => { if (T.cap) capIdx.set(normT(T.cap), ti); });
  const seenClaim = new Map();
  const tablePara = ti => { const T = doc.tables[ti]; const c = T.rows.map(r => r[0]).find(Boolean); return c ? c.paras[0] : null; };
  const stat = vs => { const v = vs.map(x => x.v); return { min: Math.min(...v), max: Math.max(...v), mean: v.reduce((a, b) => a + b, 0) / v.length }; };
  /* one claim against the table(s) */
  const judge = (p, pi, named, kind, key, numsRaw, s0, e0) => {
    let cands = series.filter(s => s.keys.includes(key));
    if (!cands.length) return;
    let explicit = false;
    if (named.length) { const c = cands.filter(s => named.includes(s.ti)); if (c.length) { cands = c; explicit = true; } }
    if (!explicit) {
      /* the nearest table under the same heading */
      const near = cands.map(s => ({ s, d: Math.abs((tablePara(s.ti) ?? 1e9) - pi) }))
        .filter(x => { const tp = tablePara(x.s.ti); return tp != null && (paras[tp].heading || '') === (p.heading || ''); });
      if (!near.length) return;
      const best = Math.min(...near.map(x => x.d));
      cands = near.filter(x => x.d === best).map(x => x.s);
    }
    const ti = cands[0].ti;
    cands = cands.filter(s => s.ti === ti);
    const sets = [cands.filter(s => s.dir !== 'block').flatMap(s => s.vals), ...cands.map(s => s.vals)].filter(v => v.length);
    const nums = numsRaw.map(x => parseFloat(thaiDigits(x)));
    const decs = numsRaw.map(x => decOf(x));
    for (const vs of sets) {
      const s = stat(vs);
      if (kind === 'range') {
        const lo = nums[0] <= nums[1] ? 0 : 1, hi = 1 - lo;
        if (roundTo(s.min, decs[lo]) === nums[lo] && roundTo(s.max, decs[hi]) === nums[hi]) return;
      } else {
        const want = kind === 'mean' ? s.mean : s[kind];
        if (Math.abs(roundTo(want, decs[0]) - nums[0]) <= 10 ** -decs[0] * (kind === 'mean' ? 1 : 0) + 1e-9) return;
      }
    }
    const st = stat(sets[0]);
    let out = true;
    if (kind === 'range') {
      const [a, b] = nums[0] <= nums[1] ? nums : [nums[1], nums[0]];
      out = a < roundTo(st.min, decs[0]) || b > roundTo(st.max, decs[1]);
    }
    const T = doc.tables[ti];
    const found = p.text.slice(s0, e0);
    const gk = ti + '|' + kind + '|' + key + '|' + found;
    const here = [pi, s0, e0];
    if (seenClaim.has(gk)) { const g = seenClaim.get(gk); (g.also || (g.also = [])).push(here); g.n++; return; }
    const d = Math.max(...decs);
    seenClaim.set(gk, add({ cat: 'datamatch', sev: out && explicit ? 'warn' : 'info', para: pi, ranges: [[s0, e0]], found,
      suggest: '', msg: 'claim', kind, label: cands[0].label.slice(0, 40), table: T.cap || null, tno: ti + 1, n: 1,
      actual: kind === 'range' ? st.min.toFixed(d) + '–' + st.max.toFixed(d) : (kind === 'mean' ? st.mean : st[kind]).toFixed(d),
      ref: tablePara(ti), key: 'datamatch:' + gk }));
  };
  paras.forEach((p, pi) => {
    if (p.hf || p.toc || p.inTable) return;
    const t = p.text;
    const low = t.toLowerCase();
    /* tables named in this paragraph */
    const named = [];
    for (const m of t.matchAll(/(ตาราง(?:ที่)?|Table)\s*([0-9๐-๙]+(?:\s?[.\-–]\s?[0-9๐-๙]+)*)/gi)) {
      for (const [cap, ti] of capIdx) if (normT(cap).endsWith(normT(m[2]))) named.push(ti);
    }
    /* "A, B และ C อยู่ในช่วง a–b, c–d และ e–f ตามลำดับ": pair them in order */
    const done = [];
    let from = 0;
    for (const m of t.matchAll(/ตามลำดับ/g)) {
      const S = from, E = m.index;
      from = E + m[0].length;
      const rs = [...t.slice(S, E).matchAll(RANGE)].map(r => ({ s: S + r.index, e: S + r.index + r[0].length, nums: [r[1], r[2]] }));
      if (rs.length < 2) continue;
      done.push([rs[0].s, E]);
      const keys = [];
      for (const item of t.slice(Math.max(S, rs[0].s - 300), rs[0].s).split(/[\s,]+/)) {
        const k = resolve(item);
        if (k && keys[keys.length - 1] !== k) keys.push(k);
      }
      if (keys.length < rs.length) continue; // cannot tell which is which: say nothing
      const use = keys.slice(-rs.length);
      rs.forEach((r, k) => judge(p, pi, named, 'range', use[k], r.nums, r.s, r.e));
    }
    for (const [kind, re] of CLAIMS) {
      re.lastIndex = 0;
      for (const m of t.matchAll(re)) {
        const s0 = m.index + m[0].search(/[0-9๐-๙]/), e0 = m.index + m[0].length;
        if (done.some(([a, b]) => s0 >= a && s0 < b)) continue;
        /* the parameter: the nearest name before the number, same clause */
        const win = low.slice(Math.max(0, m.index - 90), m.index + 1);
        let key = null, at = -1;
        for (const n of names) {
          const latin = /^[a-z0-9\-]+$/.test(n);
          const re2 = latin ? new RegExp('(?<![a-z0-9])' + escRe(n) + '(?![a-z0-9])', 'g') : new RegExp(escRe(n), 'g');
          for (const x of win.matchAll(re2)) if (x.index > at) { at = x.index; key = alias.get(n); }
        }
        if (key) judge(p, pi, named, kind, key, m.slice(1), s0, e0);
      }
    }
  });
}

/* ── Consistency: years, station codes, decimal places ── */
function moreConsistency(doc, paras, add) {
  /* reference lists use Christian years on purpose: skip them */
  let inRefs = false;
  const refPara = paras.map(p => {
    if (p.isHeading || (!p.inTable && p.text.length < 60)) {
      if (/^\s*(?:เอกสารอ้างอิง|บรรณานุกรม|รายการอ้างอิง|references?|bibliography)\s*$/i.test(p.text)) inRefs = true;
      else if (p.isHeading) inRefs = false;
    }
    return inRefs;
  });
  /* years: "พ.ศ. 2024" / "ค.ศ. 2567" are wrong; plain years of both eras mixed */
  const be = [], ce = [];
  paras.forEach((p, pi) => {
    if (p.hf || p.toc || refPara[pi]) return;
    const t = p.text;
    for (const m of t.matchAll(/(พ\.\s?ศ\.|ค\.\s?ศ\.)\s*([0-9๐-๙]{4})/g)) {
      const y = +thaiDigits(m[2]);
      const isBE = m[1].startsWith('พ');
      if ((isBE && y >= 1900 && y <= 2100) || (!isBE && y >= 2400 && y <= 2700)) {
        const s = m.index, e = m.index + m[0].length;
        add({ cat: 'consist', sev: 'warn', para: pi, ranges: [[s, e]], found: m[0], suggest: isBE ? 'พ.ศ. ' + (y + 543) : 'ค.ศ. ' + (y - 543),
          msg: isBE ? 'yearBE' : 'yearCE', key: 'consist:yearlabel' });
      }
    }
    if (p.inTable) return;
    for (const m of t.matchAll(/(?<![0-9๐-๙.,/])([0-9๐-๙]{4})(?![0-9๐-๙])/g)) {
      const y = +thaiDigits(m[1]);
      const before = t.slice(Math.max(0, m.index - 40), m.index);
      if (/ค\.\s?ศ\.\s*$|พ\.\s?ศ\.\s*$/.test(before)) continue; // labelled: checked above
      if (/[A-Za-z][^()]*,?\s*$/.test(before) && /\(/.test(before)) continue; // (Smith, 2019)
      if (/et al|[A-Za-z]{3,}\.?\s*$/.test(before)) continue;
      if (y >= 2400 && y <= 2700) be.push([pi, m.index, m.index + 4]);
      else if (y >= 1950 && y <= 2100) ce.push([pi, m.index, m.index + 4]);
    }
  });
  if (be.length >= 3 && ce.length && ce.length < be.length) {
    const by = new Map();
    for (const [pi, s, e] of ce) { if (!by.has(pi)) by.set(pi, []); by.get(pi).push([s, e]); }
    for (const [pi, ranges] of by) add({ cat: 'consist', sev: 'info', para: pi, ranges, found: paras[pi].text.slice(ranges[0][0], ranges[0][1]), suggest: '',
      msg: 'yearMix', counts: [be.length, ce.length], key: 'consist:yearmix' });
  }
  /* station / sample codes written two ways: ST1 / ST-1 / ST 1 */
  const fam = new Map();
  const SKIPC = /^(?:CO|NO|PO|SO|NH|H|O|N|C|P|S|K|ISO|COVID|TOC|BOD|COD|EC|SS|TSS|DO|PH|UTM|WGS|GPS|NTU|PSU|PPT|MG|ML|KM|CM|MM|Q|Y|R)$/i;
  paras.forEach((p, pi) => {
    if (p.hf || p.toc || refPara[pi]) return;
    for (const m of p.text.matchAll(/(?<![A-Za-z0-9.\-])([A-Z]{1,4})([\s\-_.]?)([0-9]{1,3})(?![0-9A-Za-z]|\.[0-9])/g)) {
      if (SKIPC.test(m[1])) continue;
      const sep = m[2] === '_' ? '_' : m[2] === '.' ? '.' : m[2] === '-' ? '-' : m[2] ? ' ' : '';
      if (!fam.has(m[1])) fam.set(m[1], new Map());
      const f = fam.get(m[1]);
      if (!f.has(sep)) f.set(sep, []);
      f.get(sep).push([pi, m.index, m.index + m[0].length]);
    }
  });
  const sepName = s => ({ '': 'ติดกัน', ' ': 'เว้นวรรค', '-': 'ขีด', '.': 'จุด', '_': 'ขีดล่าง' }[s]);
  for (const [pre, f] of fam) {
    if (f.size < 2) continue;
    const all = [...f.values()].reduce((a, x) => a + x.length, 0);
    if (all < 3) continue;
    const forms = [...f.keys()].sort((a, b) => f.get(b).length - f.get(a).length);
    const major = forms[0];
    const ex = x => pre + (x === ' ' ? ' ' : x) + '1';
    for (const form of forms.slice(1)) {
      const at = f.get(form);
      add({ cat: 'consist', sev: 'info', para: at[0][0], ranges: [[at[0][1], at[0][2]]], also: at.slice(1), found: paras[at[0][0]].text.slice(at[0][1], at[0][2]),
        suggest: '', msg: 'codeForm', forms: [ex(major), f.get(major).length, ex(form), at.length], sepA: sepName(major), sepB: sepName(form), key: 'consist:code:' + pre + form });
    }
  }
  /* "สถานี 1" and "สถานีที่ 1" both used */
  {
    const a = [], b = [];
    paras.forEach((p, pi) => {
      if (p.hf || p.toc) return;
      for (const m of p.text.matchAll(/สถานี(ที่)?\s*([0-9๐-๙]{1,3})(?![0-9๐-๙])/g)) (m[1] ? b : a).push([pi, m.index, m.index + m[0].length]);
    });
    if (a.length && b.length && a.length + b.length >= 4) {
      const [minor, major] = a.length < b.length ? [a, b] : [b, a];
      add({ cat: 'consist', sev: 'info', para: minor[0][0], ranges: [[minor[0][1], minor[0][2]]], also: minor.slice(1), found: paras[minor[0][0]].text.slice(minor[0][1], minor[0][2]),
        suggest: '', msg: 'stationForm', counts: [major.length, minor.length], usual: major === b ? 'สถานีที่ 1' : 'สถานี 1', key: 'consist:station' });
    }
  }
  /* decimal places that differ within a table column or row */
  if (doc.kind !== 'docx') return;
  const done = new Set();
  /* per column (or per row of one name); a merged block mixes columns, so not that */
  const series = tableSeries(doc, paras).filter(s => s.dir !== 'rows').sort((x, y) => (x.dir === 'col' ? 0 : 1) - (y.dir === 'col' ? 0 : 1));
  for (const s of series) {
    const vals = s.vals.filter(v => !done.has(v.c));
    if (vals.length < 4) continue;
    const cnt = {};
    vals.forEach(v => { cnt[v.dec] = (cnt[v.dec] || 0) + 1; });
    const d = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    if (cnt[d] / vals.length < 0.7 || (d === 0 && cnt[d] === vals.length)) continue;
    const odd = vals.filter(v => v.dec !== d && v.c.ps.length);
    if (!odd.length || odd.length === vals.length) continue;
    odd.forEach(v => done.add(v.c));
    const at = odd.map(v => [v.c.ps[0], 0, paras[v.c.ps[0]].text.length]);
    add({ cat: 'consist', sev: 'info', para: at[0][0], ranges: [[0, at[0][2]]], also: at.slice(1), found: odd.map(v => v.c.text).slice(0, 6).join(', '),
      suggest: '', msg: 'decimals', dec: d, label: s.label.slice(0, 40), n: odd.length, key: 'consist:dec:' + s.ti + ':' + s.label });
  }
}

/* ── Words not in the dictionary ──
   The Thai word list (PyThaiNLP, CC0) plus the user's own added words.
   Each run of Thai letters is cut into dictionary words, leaving as few
   letters over as possible (like PyThaiNLP's maximal matching); the letters
   left over are the suspect. Shown with the words either side, so the whole
   misspelt word is visible. One finding per word, every place marked. */
const GRAPH = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
function cutWords(run, dict) {
  const n = run.length;
  const next = new Array(n + 1);
  if (GRAPH) { for (const g of GRAPH.segment(run)) next[g.index] = g.index + g.segment.length; }
  for (let i = 0; i < n; i++) if (next[i] == null) next[i] = i + 1;
  const edge = new Uint8Array(n + 1);
  for (let i = 0; i < n; i = next[i]) edge[next[i]] = 1;
  const cost = new Array(n + 1).fill(Infinity), words = new Array(n + 1).fill(Infinity), back = new Array(n + 1);
  cost[0] = 0; words[0] = 0;
  for (let i = 0; i < n; i++) {
    if (cost[i] === Infinity) continue;
    const better = (j, c, w, k) => { if (c < cost[j] || (c === cost[j] && w < words[j])) { cost[j] = c; words[j] = w; back[j] = [i, k]; } };
    for (let j = i + 1; j <= Math.min(n, i + 24); j++) {
      if (!edge[j]) continue; // words end between letter clusters
      const w = run.slice(i, j);
      if (dict.pre && !dict.pre(w)) break; // no word starts like this
      if (dict.has(w)) better(j, cost[i], words[i] + 1, true);
    }
    const j = next[i];
    if (j <= n) better(j, cost[i] + (j - i), words[i] + 1, false);
  }
  const out = [];
  for (let j = n; j > 0;) { const [i, k] = back[j]; out.push({ s: i, e: j, known: k }); j = i; }
  return out.reverse();
}
function dictChecks(doc, paras, add, dict) {
  if (!dict || !dict.size) return;
  const found = new Map();
  paras.forEach((p, pi) => {
    if (p.hf || p.toc) return;
    const t = p.text;
    for (const m of t.matchAll(/[ก-ฺเ-ๅ็-๎]{2,}/g)) {
      /* Thai abbreviations with dots: คพ. สผ. กทม. */
      if (m[0].length <= 6 && t[m.index + m[0].length] === '.') continue;
      const cut = cutWords(m[0], dict);
      /* join neighbouring unknown pieces */
      const parts = [];
      for (const c of cut) {
        const last = parts[parts.length - 1];
        if (!c.known && last && !last.known) last.e = c.e; else parts.push({ ...c });
      }
      parts.forEach((c, k) => {
        if (c.known) return;
        const prev = parts[k - 1], nxt = parts[k + 1];
        let s0 = prev ? prev.s : c.s, e0 = nxt ? nxt.e : c.e;
        if (e0 - s0 > 20) { s0 = prev && c.s - prev.s <= 8 ? prev.s : c.s; e0 = c.e; }
        const w = m[0].slice(s0, e0);
        if (w.length < 2) return;
        if (!found.has(w)) found.set(w, { at: [], core: m[0].slice(c.s, c.e) });
        found.get(w).at.push([pi, m.index + s0, m.index + e0]);
      });
    }
  });
  for (const [w, { at, core }] of found) {
    add({ cat: 'dict', sev: 'info', para: at[0][0], ranges: [[at[0][1], at[0][2]]], also: at.slice(1), found: w, suggest: '', msg: 'dict', n: at.length, word: w, core,
      key: 'dict:' + w });
  }
}
