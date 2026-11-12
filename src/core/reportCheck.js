/**
 * reportCheck.js — the checks behind the Report Check page. Pure: no DOM.
 *
 * Input  doc = { kind: 'docx'|'pdf'|'text', paras: [Para] }
 *        Para = { text, page?, heading?, isHeading?, inTable?, toc?, hf? }
 *          hf   = repeated page header/footer (PDF) — not checked
 *          toc  = table-of-contents line — only character/spelling checks
 * Output [Issue] = { id, cat, sev, para, ranges:[[start,end]], found,
 *                    suggest, msg, key, ref? }  (offsets into para.text)
 *
 * Thai has no spaces between words, so words come from the browser's own
 * dictionary segmenter (Intl.Segmenter 'th').
 */

const SEG = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter('th', { granularity: 'word' }) : null;

/* Display order of the categories */
export const CATS = ['spell', 'char', 'dupword', 'dupphrase', 'number', 'consist', 'overuse', 'space', 'pair'];
export const SEV_ORDER = { err: 0, warn: 1, info: 2 };

const THAI = /[฀-๿]/;
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
    for (const m of text.matchAll(/[฀-๿]+|[A-Za-z]+|[0-9]+/g)) {
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
      if (NUMERIC.test(a.w) || (a.w.length === 1 && !THAI.test(a.w))) continue;
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
        msg: span.includes('\n') ? 'line' : '', key: 'dupword:' + lc(a.w) });
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
      if (p.hf || p.toc || p.inTable || dupParaSkip.has(pi)) return;
      if (scope !== 'doc') first = new Map();
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
    });
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
