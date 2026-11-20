/**
 * xlsxView.js — draw an Excel file for Report Check: one card per sheet with
 * column letters and row numbers, like Excel. Cells with findings carry
 * data-is="ids" so the page script colours, filters and selects them like
 * the marks in a Word or PDF view.
 */
import { colName, XL_DRAW_ALL } from '../core/xlsxCheck.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* byPara: paragraph index → findings at that cell. Returns the page width
   for zoom-to-fit; 1 keeps 100 % (wide sheets scroll inside their card). */
export function renderXlsx(el, doc, byPara, t) {
  const marks = new Map();
  byPara.forEach((list, pi) => {
    const p = doc.paras[pi];
    if (!p) return;
    const k = p.sheet + ':' + p.r + ':' + p.c;
    marks.set(k, (marks.get(k) || []).concat(list));
  });
  const sevRank = { err: 0, warn: 1, info: 2 };
  let h = '<div class="rc-pages rc-xpages">';
  doc.sheets.forEach((S, si) => {
    h += '<div class="rc-sheet-lbl">' + esc(t.sheet + ' ' + (si + 1) + ' · ' + S.name + (S.hidden ? ' (' + t.hiddenSheet + ')' : '')) + '</div>' +
      '<section class="rc-sheet rc-xsheet" data-pg="' + (si + 1) + '">';
    if (!S.nr) { h += '<div class="rc-xempty">' + esc(t.emptySheet) + '</div></section>'; return; }
    /* big sheets: the first rows, and the rows around each finding */
    let show = null;
    if (S.nr * S.nc > XL_DRAW_ALL) {
      show = new Set();
      for (let r = 0; r < Math.min(S.nr, 20); r++) show.add(r);
      marks.forEach((_, k) => {
        const [s, r] = k.split(':').map(Number);
        if (s !== si) return;
        for (let d = -2; d <= 2; d++) if (r + d >= 0 && r + d < S.nr) show.add(r + d);
      });
    }
    let t0 = '<table class="rc-xt"><thead><tr><th class="rc-xc"></th>';
    for (let c = 0; c < S.nc; c++) t0 += '<th>' + colName(c) + '</th>';
    t0 += '</tr></thead><tbody>';
    let gap = 0;
    for (let r = 0; r < S.nr; r++) {
      if (show && !show.has(r)) { gap++; continue; }
      if (gap) { t0 += '<tr class="rc-xgap"><td colspan="' + (S.nc + 1) + '">' + esc(t.rowsHidden(gap)) + '</td></tr>'; gap = 0; }
      const row = S.rows[r];
      t0 += '<tr><th class="rc-xc">' + (r + 1) + '</th>';
      for (let c = 0; c < S.nc; c++) {
        const x = row && row[c];
        if (!x) { t0 += '<td></td>'; continue; }
        const m = marks.get(si + ':' + r + ':' + c);
        let attr = x.num != null ? ' class="n' : ' class="';
        if (m) {
          m.sort((a, b) => sevRank[a.sev] - sevRank[b.sev]);
          attr += ' rc-xm sev-' + m[0].sev + '" data-i="' + m[0].id + '" data-is="' + [...new Set(m.map(i => i.id))].join(' ') + '"';
        } else attr += '"';
        t0 += '<td' + attr + (x.text.length > 30 ? ' title="' + esc(x.text) + '"' : '') + '>' + esc(x.text) + '</td>';
      }
      t0 += '</tr>';
    }
    if (gap) t0 += '<tr class="rc-xgap"><td colspan="' + (S.nc + 1) + '">' + esc(t.rowsHidden(gap)) + '</td></tr>';
    h += t0 + '</tbody></table></section>';
  });
  el.innerHTML = h + '</div>';
  return 1;
}
