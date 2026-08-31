/**
 * renders.js — UI render functions for all analysis tabs
 */

import { LANG, L, T } from '../utils/lang.js';
import { fmtD, fmt } from '../utils/fmt.js';
import { getState, getColVal } from '../core/state.js';
import { calcStat, computeOutlierStats } from '../core/analysis.js';
import { wireSearch, wirePagination } from './tableControls.js';

// ── Helper: filter rows by year and parameter selectors ──────────────────────
export function flt(t, yrId, pId) {
  let r = getState(t).rows.filter(rr => !rr.is_ref);
  const yr = document.getElementById(`${t}-${yrId}`)?.value || 'all';
  const p  = document.getElementById(`${t}-${pId}`)?.value  || 'all';
  if (yr !== 'all') r = r.filter(rr => String(rr.yr) === yr);
  if (p  !== 'all') r = r.filter(rr => rr.col === p);
  return r;
}

// ── mkTbl — build a data table, optionally with click-to-sort headers ───────
/**
 * @param {?Array<?(string|(row:any)=>any)>} sortKeys - parallel array to
 *   `ths`; null/undefined entries are non-sortable columns, a string is a
 *   row property name, a function is a row->value accessor. Omit entirely
 *   for a plain (non-sortable) table — existing callers are unaffected.
 */
export function mkTbl(el, ths, rows, fn, title, sortKeys) {
  if (!rows || !rows.length) {
    el.innerHTML = `<div class="empty-state"><p>${T('es_nodata')}</p></div>`;
    return;
  }
  const txtPat = /^(location|parameter|station|area|หน่วย|unit|ชื่อ|name|label|สถานี|พื้นที่|บริเวณ|ผลเปรียบเทียบ|ผลการเปรียบเทียบ|ผลเทียบมาตรฐาน|standard|มีนัย|sig|แนวโน้ม|trend|ระดับ|level|diff)/i;

  const curCol = sortKeys && el.dataset.sortCol != null ? +el.dataset.sortCol : null;
  const curDir = el.dataset.sortDir || 'asc';
  let sortedRows = rows;
  if (sortKeys && curCol != null && sortKeys[curCol]) {
    const keyFn = typeof sortKeys[curCol] === 'function' ? sortKeys[curCol] : (r => r[sortKeys[curCol]]);
    sortedRows = [...rows].sort((a, b) => {
      const av = keyFn(a), bv = keyFn(b);
      const cmp = av > bv ? 1 : av < bv ? -1 : 0;
      return curDir === 'asc' ? cmp : -cmp;
    });
  }

  const thHtml = ths.map((h, i) => {
    const isTxt = txtPat.test(typeof h === 'string' ? h : '');
    const sortable = sortKeys && sortKeys[i];
    const cls = [isTxt ? 'txt' : '', sortable ? 'sortable-th' : ''].filter(Boolean).join(' ');
    const arrow = sortable && curCol === i ? (curDir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th${cls ? ` class="${cls}"` : ''}${sortable ? ` data-sort-idx="${i}"` : ''}>${h}${arrow}</th>`;
  }).join('');
  const titleHtml = title
    ? `<div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;padding:8px 4px 4px">${title}</div>`
    : '';
  el.innerHTML = titleHtml + `<table><thead><tr>${thHtml}</tr></thead><tbody>${sortedRows.map(fn).join('')}</tbody></table>`;

  if (sortKeys) {
    el.querySelectorAll('th[data-sort-idx]').forEach(th => {
      th.addEventListener('click', () => {
        const idx = +th.dataset.sortIdx;
        if (curCol === idx) el.dataset.sortDir = curDir === 'asc' ? 'desc' : 'asc';
        else { el.dataset.sortCol = idx; el.dataset.sortDir = 'asc'; }
        mkTbl(el, ths, rows, fn, title, sortKeys);
      });
    });
  }
}

// ── Traffic Light (Overview pane) ────────────────────────────────────────────
export function renderTL(t) {
  const grid = document.getElementById(`${t}-tl-grid`);
  if (!grid) return;

  const yr   = document.getElementById(`${t}-ov-yr`)?.value  || 'all';
  const locF = document.getElementById(`${t}-ov-loc`)?.value || 'all';

  if (yr === 'all') {
    grid.innerHTML = `<div style="padding:12px 16px;background:var(--blue-l);border:1px solid var(--blue-m);border-radius:var(--rm);font-size:13px;color:var(--blue);display:flex;align-items:center;gap:8px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      ${LANG === 'en' ? 'Select a year in the filter above to view Status Summary' : 'เลือกปีใน filter เพื่อดู Status Summary'}
    </div>`;
    return;
  }

  let rows = getState(t).rows.filter(r => !r.is_ref && String(r.yr ?? '—') === yr);
  if (locF !== 'all') rows = rows.filter(r => r.loc === locF);

  if (!rows.length) {
    grid.innerHTML = `<div class="empty-state"><p>${T('es_nodata')}</p></div>`;
    return;
  }

  const map = {};
  rows.forEach(r => {
    if (!map[r.loc]) map[r.loc] = { loc: r.loc, excP: new Set() };
    if (r.exceed) map[r.loc].excP.add(r.col);
  });

  grid.innerHTML = Object.values(map).sort((a, b) => a.loc.localeCompare(b.loc)).map(d => {
    const isRed  = d.excP.size > 0;
    const excStr = [...d.excP].slice(0, 4).join(', ') + (d.excP.size > 4 ? ` +${d.excP.size - 4}` : '');
    return `<div class="tl-card">
      <div style="padding-top:4px;flex-shrink:0"><div class="${isRed ? 'tl-red' : 'tl-green'}"></div></div>
      <div class="tl-info">
        <div class="tl-loc">${d.loc}</div>
        <div class="tl-yr">${LANG === 'en' ? 'Year' : 'ปี'} ${yr}</div>
        <div class="tl-params">${isRed
          ? `<span style="color:var(--red);font-weight:600;font-size:12px">${excStr}</span>`
          : `<span style="color:var(--green);font-size:12px">${T('b_pass')}</span>`
        }</div>
      </div>
    </div>`;
  }).join('');
}

const OV_PAGE_SIZE = 20;

// ── Overview Table ────────────────────────────────────────────────────────────
export function renderOV(t) {
  renderTL(t);
  const rows = flt(t, 'ov-yr', 'ov-p');
  const tblEl = document.getElementById(`${t}-tbl-ov`);
  if (!tblEl) return;

  if (!rows.length) {
    tblEl.innerHTML = `<div class="empty-state"><p>${T('es_nodata')}</p></div>`;
    document.getElementById(`${t}-ov-page`)?.replaceChildren();
    return;
  }

  const locF = document.getElementById(`${t}-ov-loc`)?.value || 'all';
  const wlF  = document.getElementById(`${t}-ov-wl`)?.value  || 'all';
  let filteredRows = locF !== 'all' ? rows.filter(r => r.loc === locF) : rows;
  if (wlF !== 'all') filteredRows = filteredRows.filter(r => r.wl === wlF);

  // Text search — restricts which raw measurements feed the aggregation
  // below, so searching a station/location name narrows the resulting
  // param×year groups to ones that actually include it
  const searchEl = document.getElementById(`${t}-ov-search`);
  wireSearch(searchEl, filteredRows,
    (r, q) => r.col.toLowerCase().includes(q) || (r.loc||'').toLowerCase().includes(q) || (r.st||'').toLowerCase().includes(q),
    searchedRows => renderOVTable(t, tblEl, searchedRows)
  );
}

function renderOVTable(t, tblEl, filteredRows) {
  if (!filteredRows.length) {
    tblEl.innerHTML = `<div class="empty-state"><p>${T('es_nodata')}</p></div>`;
    document.getElementById(`${t}-ov-page`)?.replaceChildren();
    return;
  }

  const zThreshold = parseFloat(document.getElementById(`${t}-ov-outlier`)?.value);
  const showExceedOnly = document.getElementById(`${t}-sc-ep-card`)?.classList.contains('active');

  const map = {};
  filteredRows.forEach(r => {
    const k = r.col + '||' + (r.yr ?? '—');
    if (!map[k]) map[k] = { col: r.col, unit: r.unit, yr: r.yr ?? '—', vals: [], excSt: new Set(), total: 0 };
    map[k].vals.push(r.val);
    map[k].total++;
    if (r.exceed) map[k].excSt.add(r.st);
  });

  let data = Object.values(map).sort((a, b) => a.col.localeCompare(b.col) || (a.yr > b.yr ? 1 : -1));
  if (showExceedOnly) data = data.filter(d => d.excSt.size > 0);

  const l = L[LANG] || L.th;
  const ths = [l.th_p, l.th_yr, l.th_u, l.th_n, l.th_min, l.th_max, l.th_mean, l.th_sd, isEN()?'Outliers':'ค่าผิดปกติ', l.th_exst, l.th_exn, l.th_exfq, l.th_stat];
  const sortKeys = [
    d => d.col, d => d.yr, null,
    d => calcStat(d.vals).n, d => calcStat(d.vals).min, d => calcStat(d.vals).max,
    d => calcStat(d.vals).mean, d => calcStat(d.vals).sd,
    d => outlierCount(d.vals, zThreshold),
    null, d => d.excSt.size, d => d.excSt.size, d => d.excSt.size > 0 ? 1 : 0,
  ];

  const rowFn = d => {
    const st = calcStat(d.vals);
    const stationsInGroup = new Set(filteredRows.filter(r => r.col === d.col && String(r.yr ?? '—') === String(d.yr)).map(r => r.st)).size;
    const excPct = stationsInGroup > 0 ? Math.round(d.excSt.size / stationsInGroup * 100) : 0;
    const outCount = outlierCount(d.vals, zThreshold);
    return `<tr>
      <td class="em">${d.col}</td>
      <td class="num">${d.yr}</td>
      <td>${d.unit}</td>
      <td class="num">${st.n}</td>
      <td class="num">${fmtD(st.min, t, d.col)}</td>
      <td class="num">${fmtD(st.max, t, d.col)}</td>
      <td class="num">${fmtD(st.mean, t, d.col)}</td>
      <td class="num">${fmtD(st.sd, t, d.col)}</td>
      <td class="num">${outCount > 0 ? `<span class="badge badge-amber">${outCount}</span>` : '—'}</td>
      <td class="num" style="font-size:12px;max-width:180px">${d.excSt.size > 0
        ? `<span style="color:var(--red);font-weight:600">${[...d.excSt].join(', ')}</span>`
        : '—'}</td>
      <td class="num">${d.excSt.size > 0 ? `<span class="badge badge-red">${d.excSt.size}</span>` : '—'}</td>
      <td class="num">${d.excSt.size > 0 ? `<span style="color:var(--red);font-weight:600">${excPct}%</span>` : '—'}</td>
      <td class="num">${d.excSt.size > 0
        ? `<span class="badge badge-red">${T('b_exc')}</span>`
        : `<span class="badge badge-green">${T('b_pass')}</span>`}</td>
    </tr>`;
  };

  wirePagination(document.getElementById(`${t}-ov-page`), data, OV_PAGE_SIZE,
    pageData => mkTbl(tblEl, ths, pageData, rowFn, null, sortKeys)
  );
}

function outlierCount(vals, zThreshold) {
  if (!(zThreshold > 0)) return 0;
  const { isOutlier } = computeOutlierStats(vals, zThreshold);
  return vals.filter(isOutlier).length;
}

function isEN() { return LANG === 'en'; }

// ── Statistics Table ──────────────────────────────────────────────────────────
export function renderST(t) {
  const distF         = document.getElementById(`${t}-st-dist`)?.value || 'all';
  const wlF            = document.getElementById(`${t}-st-wl`)?.value   || 'all';
  const grp           = document.getElementById(`${t}-st-grp`)?.value  || 'param';
  const outlierMethod = document.getElementById(`${t}-st-outlier`)?.value || 'none';
  const l             = L[LANG] || L.th;
  const tblEl         = document.getElementById(`${t}-tbl-st`);
  if (!tblEl) return;

  let rows = flt(t, 'st-yr', 'st-p');
  if (distF !== 'all') rows = rows.filter(r => String(r.dist) === distF || r.dist === parseFloat(distF));
  if (wlF !== 'all') rows = rows.filter(r => r.wl === wlF);
  if (!rows.length) { tblEl.innerHTML = `<div class="empty-state"><p>${T('es_nodata')}</p></div>`; return; }

  const map = {};
  rows.forEach(r => {
    const yrKey = r.yr ? '||' + r.yr : '';
    const k = grp === 'param' ? r.col
            : grp === 'loc'   ? r.loc + '||' + r.col
            :                   r.st + '||' + r.loc + '||' + r.col + yrKey;
    if (!map[k]) map[k] = { ...r, vals: [] };
    map[k].vals.push(r.val);
  });

  // Build per-col distribution for outlier detection
  const rawByCol = {};
  rows.forEach(r => {
    if (!rawByCol[r.col]) rawByCol[r.col] = [];
    rawByCol[r.col].push(r.val);
  });

  const data = Object.values(map).map(d => ({ ...d, ...calcStat(d.vals) }));

  // Outlier detection
  const outlierSet = new Set();
  if (outlierMethod !== 'none') {
    data.forEach(d => {
      const colVals = rawByCol[d.col] || [];
      if (outlierMethod === 'z2' || outlierMethod === 'z3') {
        const { isOutlier } = computeOutlierStats(colVals, outlierMethod === 'z2' ? 2 : 3);
        d.vals.forEach(v => { if (isOutlier(v)) outlierSet.add(d); });
      }
      if (outlierMethod === 'iqr') {
        const sorted = [...colVals].sort((a,b)=>a-b);
        const q1 = sorted[Math.floor(sorted.length*0.25)];
        const q3 = sorted[Math.floor(sorted.length*0.75)];
        const iqr = q3 - q1;
        d.vals.forEach(v => { if (v < q1 - 1.5*iqr || v > q3 + 1.5*iqr) outlierSet.add(d); });
      }
    });
  }

  const hdr = grp === 'param' ? l.th_p
            : grp === 'loc'   ? l.th_loc
            :                   l.th_st;

  mkTbl(tblEl,
    [hdr, l.th_p, l.th_u, l.th_n, l.th_min, l.th_max, l.th_mean, l.th_med, l.th_sd],
    data.sort((a, b) => (a.loc||'').localeCompare(b.loc||'') || a.col.localeCompare(b.col)),
    d => {
      const isOut = outlierSet.has(d);
      const rowStyle = isOut ? ' style="background:var(--amber-l)"' : '';
      const grpVal = grp === 'param' ? d.col
                   : grp === 'loc'   ? d.loc
                   :                   d.st;
      return `<tr${rowStyle}>
        <td class="em">${grpVal}${isOut ? ' <span class="badge badge-amber" style="font-size:10px">outlier</span>' : ''}</td>
        <td>${grp === 'param' ? d.unit : d.col}</td>
        <td>${grp === 'param' ? '' : d.unit}</td>
        <td class="num">${d.n}</td>
        <td class="num">${fmtD(d.min, t, d.col)}</td>
        <td class="num">${fmtD(d.max, t, d.col)}</td>
        <td class="num">${fmtD(d.mean, t, d.col)}</td>
        <td class="num">${fmtD(d.med, t, d.col)}</td>
        <td class="num">${fmtD(d.sd, t, d.col)}</td>
      </tr>`;
    }
  );
}

// ── Standards Table ───────────────────────────────────────────────────────────
export function renderSTD(t) {
  const distF  = document.getElementById(`${t}-std-dist`)?.value  || 'all';
  const wlF    = document.getElementById(`${t}-std-wl`)?.value    || 'all';
  const showEx = document.getElementById(`${t}-std-show`)?.value  || 'all';
  const locF   = document.getElementById(`${t}-std-loc`)?.value   || 'all';
  const l      = L[LANG] || L.th;
  const tblEl  = document.getElementById(`${t}-tbl-std`);
  if (!tblEl) return;

  let rows = flt(t, 'std-yr', 'std-p').filter(r => r.sc_status !== 'no_std');
  if (distF  !== 'all') rows = rows.filter(r => String(r.dist) === distF);
  if (wlF    !== 'all') rows = rows.filter(r => r.wl === wlF);
  if (locF   !== 'all') rows = rows.filter(r => r.loc === locF);
  if (showEx === 'exceed') rows = rows.filter(r => r.sc_status === 'exceed');

  if (!rows.length) { tblEl.innerHTML = `<div class="empty-state"><p>${T('es_nodata')}</p></div>`; return; }

  mkTbl(tblEl,
    [l.th_p, l.th_yr, l.th_st, l.th_loc, l.th_u, l.th_val, l.th_res, l.th_stat],
    rows.sort((a, b) => a.col.localeCompare(b.col) || a.loc.localeCompare(b.loc)),
    d => `<tr>
      <td class="em">${d.col}</td>
      <td class="num">${d.yr ?? '—'}</td>
      <td>${d.st}</td>
      <td>${d.loc}</td>
      <td>${d.unit}</td>
      <td class="num" style="color:${d.sc_status==='exceed'?'var(--red)':'var(--text2)'}">${fmtD(d.val, t, d.col)}</td>
      <td style="font-size:12px;color:var(--text3)">${d.sc_msg}</td>
      <td class="num">${d.sc_status === 'exceed'
        ? `<span class="badge badge-red">${T('b_exc')}</span>`
        : `<span class="badge badge-green">${T('b_pass')}</span>`}</td>
    </tr>`
  );
}

// ── Raw Data Table ────────────────────────────────────────────────────────────
export function renderRAW(t) {
  const state = getState(t);
  const tblEl = document.getElementById(`${t}-tbl-raw`);
  if (!tblEl) return;

  const yr  = document.getElementById(`${t}-raw-yr`)?.value || 'all';
  const yrCol = getColVal(t, 'year');
  let raw = state.raw;
  if (yr !== 'all' && yrCol) raw = raw.filter(r => String(r[yrCol]) === yr);

  if (!raw.length) { tblEl.innerHTML = `<div class="empty-state"><p>${T('es_raw')}</p></div>`; return; }

  const cols = state.cols;
  const ths  = cols.map(c => `<th>${c}</th>`).join('');
  const tbody = raw.slice(0, 500).map(r =>
    `<tr>${cols.map(c => `<td>${r[c] ?? '—'}</td>`).join('')}</tr>`
  ).join('');

  tblEl.innerHTML = `<table><thead><tr>${ths}</tr></thead><tbody>${tbody}</tbody></table>`;
  if (raw.length > 500) {
    tblEl.innerHTML += `<div style="padding:8px 14px;font-size:12px;color:var(--text3)">แสดง 500/${raw.length} rows</div>`;
  }
}
