/**
 * xlsxCheck.js — Report Check for Excel files: read every sheet and point out
 * entries typed twice by mistake. Nothing in the file is changed.
 *
 *  xlrow  — a row that repeats an earlier row of the same sheet, or whose
 *           numbers all match another row (copied and not updated)
 *  xlcol  — a column whose numbers all match an earlier column
 *  xlname — a name typed twice in a list (a header row, a station list, a
 *           species list), and the same name written two ways in a column or
 *           header row (Glycera sp. / glycera sp, ST1 / ST-1)
 *
 * Findings use the shape of reportCheck.js: each cell that is pointed at
 * becomes a "paragraph" ({text, sheet, r, c, loc}), so the Report Check page
 * lists, filters, skips and exports them like any other finding.
 */

export const XL_CATS = ['xlrow', 'xlcol', 'xlname'];

/* Sheets bigger than this are drawn only around the findings (xlsxView.js) */
export const XL_DRAW_ALL = 60000;

const colName = c => { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; };
export const cellRef = (r, c) => colName(c) + (r + 1);
export { colName };

const squash = s => String(s).replace(/\s+/g, ' ').trim();
const NUMTXT = /^[-+]?\d[\d,]*(\.\d+)?$/;
/* same name if only case, spaces or . - _ , ; : ' " ( ) / differ */
const loose = s => squash(s).toLowerCase().replace(/[\s.\-_,;:'"()/\\]+/g, '');
/* placeholders that are meant to repeat */
const FILLER = new Set(['nd', 'na', 'n/a', 'ns', 'nil', 'none', 'no', 'yes', 'x', 'ok', 'total', 'sum', 'mean', 'average', 'min', 'max', 'sd', 'รวม', 'เฉลี่ย', 'ไม่พบ', 'ไม่มี', '-']);
const isName = s => {
  const t = squash(s);
  return t.length >= 2 && /[A-Za-z฀-๿]/.test(t) && !FILLER.has(t.toLowerCase()) && !/^[<>≤≥]/.test(t);
};
const yearish = v => Number.isInteger(v) && ((v >= 1900 && v <= 2100) || (v >= 2400 && v <= 2700));
/* numbers worth comparing (as tabledup in reportCheck.js): 2+ values, not all
   the same, not all years, and at least one that is not a tiny whole number */
function telling(vals) {
  if (vals.length < 2 || new Set(vals).size < 2) return false;
  if (vals.every(yearish)) return false;
  return vals.some(v => !yearish(v) && (Number.isInteger(v) ? Math.abs(v) >= 10 : v !== 0));
}

/* Read a workbook (xlsx, xlsm, xls, csv) into sheets of {text, num} cells */
export function extractXlsx(buf) {
  const X = window.XLSX;
  const wb = X.read(buf, { type: 'array', cellDates: true });
  const hidden = ((wb.Workbook || {}).Sheets || []).map(s => !!(s && s.Hidden));
  const sheets = [];
  let cells = 0;
  const notes = [];
  wb.SheetNames.forEach((name, si) => {
    const ws = wb.Sheets[name] || {};
    const got = [];
    let nr = 0, nc = 0;
    for (const k in ws) {
      if (k[0] === '!') continue;
      const cell = ws[k];
      if (!cell || cell.v == null || cell.t === 'z') continue;
      const text = squash(cell.w != null ? cell.w : cell.v);
      if (!text) continue;
      const a = X.utils.decode_cell(k);
      let num = null;
      if (cell.t === 'n') num = cell.v;
      else if (cell.t === 's' && NUMTXT.test(text)) num = +text.replace(/,/g, '');
      got.push([a.r, a.c, { text, num }]);
      if (a.r + 1 > nr) nr = a.r + 1;
      if (a.c + 1 > nc) nc = a.c + 1;
    }
    const rows = new Array(nr).fill(null);
    for (const [r, c, v] of got) {
      if (!rows[r]) rows[r] = new Array(nc).fill(null);
      rows[r][c] = v;
    }
    cells += got.length;
    if (nr * nc > XL_DRAW_ALL && !notes.includes('xlbig')) notes.push('xlbig');
    sheets.push({ name, hidden: !!hidden[si], nr, nc, rows, merges: ws['!merges'] || [] });
  });
  return { kind: 'xlsx', sheets, cells, paras: [], notes };
}

export function checkXlsx(doc) {
  const issues = [];
  let paras = [];
  const pIdx = new Map();
  const P = (si, r, c) => {
    const k = si + ':' + r + ':' + c;
    let i = pIdx.get(k);
    if (i == null) {
      const S = doc.sheets[si], cell = S.rows[r] && S.rows[r][c];
      i = paras.length;
      paras.push({ text: cell ? cell.text : '', sheet: si, r, c, loc: S.name + ' · ' + cellRef(r, c), heading: '' });
      pIdx.set(k, i);
    }
    return i;
  };
  /* one finding pointing at several cells: the first is listed, all are marked */
  const add = (cat, cellList, extra) => {
    const pis = cellList.map(([si, r, c]) => P(si, r, c));
    const [first, ...rest] = pis;
    issues.push({ cat, sev: 'warn', para: first, ranges: [[0, paras[first].text.length]],
      also: rest.map(pi => [pi, 0, paras[pi].text.length]), suggest: '', ...extra });
  };
  const flagged = new Set(); // cell pairs already reported as names

  doc.sheets.forEach((S, si) => {
    if (!S.nr) return;
    const rowsSeen = new Map(), numRowsSeen = new Map();

    /* ── rows ── */
    S.rows.forEach((row, r) => {
      if (!row) return;
      const filled = [];
      row.forEach((x, c) => { if (x) filled.push(c); });
      if (filled.length < 2) return;
      const nums = filled.filter(c => row[c].num != null);
      const texts = filled.filter(c => row[c].num == null);
      /* the whole row again: needs a number (repeated header rows of several
         tables on one sheet are fine), and real numbers if it has no text */
      const numVals = nums.map(c => row[c].num);
      const worth = nums.length && numVals.some(v => v !== 0) && (texts.length || telling(numVals));
      const key = filled.map(c => c + '=' + (row[c].num != null ? row[c].num : row[c].text.toLowerCase())).join('\u0001');
      if (worth && rowsSeen.has(key)) {
        const r0 = rowsSeen.get(key);
        add('xlrow', filled.map(c => [si, r, c]), { msg: 'xlRowSame', refLoc: r0 + 1,
          found: filled.slice(0, 8).map(c => row[c].text).join(' | ') + (filled.length > 8 ? ' …' : ''), key: 'xlrow:' + si + ':' + key });
      } else {
        if (worth && !rowsSeen.has(key)) rowsSeen.set(key, r);
        /* same numbers under a different label: copied and not updated.
           Years are left out — in long-format data a row is often just a
           year, a replicate and a small count, which match by chance. */
        const data = nums.filter(c => !yearish(row[c].num));
        if (data.length >= 3 && texts.length && telling(data.map(c => row[c].num))) {
          const nk = data.map(c => c + '=' + row[c].num).join('\u0001');
          const prev = numRowsSeen.get(nk);
          if (prev != null) {
            const lbl = texts.map(c => row[c].text).join(' '), plbl = S.rows[prev].filter(Boolean).filter(x => x.num == null).map(x => x.text).join(' ');
            add('xlrow', data.map(c => [si, r, c]), { msg: 'xlRowNums', refLoc: prev + 1, label: lbl, other: plbl,
              found: lbl + ': ' + data.slice(0, 8).map(c => row[c].text).join(' | ') + (data.length > 8 ? ' …' : ''), key: 'xlrown:' + si + ':' + nk });
          } else numRowsSeen.set(nk, r);
        }
      }
      /* names in a header-like row (mostly text) */
      if (texts.length >= 3 && texts.length / filled.length >= 0.8) names(si, texts.map(c => [r, c, row[c]]), 'row');
    });

    /* ── columns ── */
    const colsSeen = new Map();
    for (let c = 0; c < S.nc; c++) {
      const cells = [];
      for (let r = 0; r < S.nr; r++) { const x = S.rows[r] && S.rows[r][c]; if (x) cells.push([r, c, x]); }
      if (!cells.length) continue;
      const nums = cells.filter(x => x[2].num != null), texts = cells.filter(x => x[2].num == null);
      if (nums.length >= 3 && telling(nums.map(x => x[2].num))) {
        const ck = nums.map(x => x[0] + '=' + x[2].num).join('\u0001');
        const lab = (() => { const above = texts.filter(x => x[0] < nums[0][0]); return above.length ? above[above.length - 1][2].text : ''; })();
        if (colsSeen.has(ck)) {
          const p = colsSeen.get(ck);
          add('xlcol', nums.map(x => [si, x[0], c]), { msg: 'xlColNums', col: colName(c), refCol: colName(p.c), label: lab, other: p.lab,
            found: (lab ? lab + ': ' : '') + nums.slice(0, 8).map(x => x[2].text).join(' | ') + (nums.length > 8 ? ' …' : ''), key: 'xlcol:' + si + ':' + ck });
        } else colsSeen.set(ck, { c, lab });
      }
      if (texts.length >= 3 && texts.length / cells.length >= 0.6) names(si, texts, 'col');
    }
  });

  /* Names in one list (a column, or a header-like row): a name typed twice
     when the list is mostly one-of-each, and a name written two ways */
  function names(si, cells, dir) {
    const list = cells.filter(x => isName(x[2].text));
    if (list.length < 3) return;
    /* exact repeats: only in lists of distinct names (a species or station
       list) — data columns repeat their values on purpose */
    const byText = new Map();
    list.forEach(x => { const k = x[2].text; if (!byText.has(k)) byText.set(k, []); byText.get(k).push(x); });
    const counts = [...byText.values()].map(a => a.length);
    const dupItems = counts.reduce((a, n) => a + n - 1, 0);
    if (Math.max(...counts) <= 2 && dupItems / list.length <= 0.34) {
      byText.forEach(a => {
        if (a.length < 2) return;
        const [f, x] = a;
        const pk = si + ':' + x[0] + ':' + x[1] + '>' + f[0] + ':' + f[1];
        if (flagged.has(pk)) return;
        flagged.add(pk);
        add('xlname', [[si, x[0], x[1]], [si, f[0], f[1]]], { msg: dir === 'row' ? 'xlNameRow' : 'xlNameCol',
          refLoc: cellRef(f[0], f[1]), found: x[2].text, key: 'xlname:' + si + ':' + x[2].text });
      });
    }
    /* one name, several spellings: point at the less common forms */
    const byLoose = new Map();
    list.forEach(x => {
      const k = loose(x[2].text);
      if (k.length < 2) return;
      if (!byLoose.has(k)) byLoose.set(k, new Map());
      const m = byLoose.get(k);
      if (!m.has(x[2].text)) m.set(x[2].text, []);
      m.get(x[2].text).push(x);
    });
    byLoose.forEach(forms => {
      if (forms.size < 2) return;
      const ranked = [...forms.entries()].sort((a, b) => b[1].length - a[1].length || a[1][0][0] - b[1][0][0] || a[1][0][1] - b[1][0][1]);
      const [usual, ucells] = ranked[0];
      ranked.slice(1).forEach(([form, xs]) => {
        const pk = si + ':' + dir + ':' + xs[0][0] + ':' + xs[0][1] + '~' + usual;
        if (flagged.has(pk)) return;
        flagged.add(pk);
        add('xlname', xs.slice(0, 50).map(x => [si, x[0], x[1]]), { msg: 'xlNameForm', usual, n: xs.length, nUsual: ucells.length,
          refLoc: cellRef(ucells[0][0], ucells[0][1]), found: form, key: 'xlform:' + si + ':' + form + '>' + usual });
      });
    });
  }

  /* list order: sheet, row, column */
  const order = paras.map((p, i) => i).sort((a, b) => paras[a].sheet - paras[b].sheet || paras[a].r - paras[b].r || paras[a].c - paras[b].c);
  const remap = new Array(paras.length);
  order.forEach((old, nu) => { remap[old] = nu; });
  paras = order.map(i => paras[i]);
  issues.forEach((iss, id) => {
    iss.id = id;
    iss.para = remap[iss.para];
    iss.also = iss.also.map(([pi, s, e]) => [remap[pi], s, e]);
  });
  doc.paras = paras;
  return issues;
}
