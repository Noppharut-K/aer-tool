/**
 * reportUI.js — Report tab: structured narrative per Station or Location
 * (single-select grain toggle). Each card has labeled subsections (not one
 * run-on paragraph) so a long list — e.g. every year's REF comparison for
 * every parameter — stays scannable instead of becoming a wall of text.
 */

import { LANG } from '../utils/lang.js';
import { getState, getReportHidden, setReportSectionHidden, getReportHiddenItems, setReportItemHidden } from '../core/state.js';
import { getReportGroups } from '../core/report.js';
import { fmtVal } from '../core/analysis.js';
import { wireSearch, wirePagination } from './tableControls.js';
import { TYPE_CFG } from '../core/standards.js';

const PAGE_SIZE = 10;
let reportGrain = 'station';
let reportView = 'detail';
let printingTab = null; // set right before window.print(), consumed by the module-level 'afterprint' handler below

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const GRAIN_LABEL = {
  station: { th: 'ตาม Station', en: 'By Station' },
  location: { th: 'ตาม Location', en: 'By Location' },
};

const VIEW_LABEL = {
  summary: { th: 'สรุป', en: 'Summary' },
  detail: { th: 'รายละเอียด', en: 'Detail' },
};

const SEC = {
  overall: { th: 'สถานะเทียบกับมาตรฐาน', en: 'Standards status' },
  minmax: { th: 'ช่วงค่า Min–Max', en: 'Min–Max range' },
  selfTrend: { th: 'แนวโน้มเทียบกับตัวเอง (ข้ามปี)', en: 'Trend vs itself (across years)' },
  refTrend: { th: 'แนวโน้มเทียบกับ REF', en: 'Trend vs Reference' },
  baseTrend: { th: 'แนวโน้มเทียบกับ Baseline', en: 'Trend vs Baseline' },
};

export function renderReportUI(t) {
  const root = document.getElementById(`${t}-report-root`);
  if (!root) return;
  const isEN = LANG === 'en';
  const state = getState(t);

  if (!state.analyzed || !state.rows.length) {
    root.innerHTML = `<div class="empty-state"><p>${isEN ? 'Run analysis first.' : 'กรุณาวิเคราะห์ข้อมูลก่อน จึงจะใช้งานส่วนนี้ได้'}</p></div>`;
    return;
  }

  const groups = getReportGroups(t, reportGrain);
  const hiddenItems = getReportHiddenItems(t, reportGrain);
  const hiddenItemSet = new Set(hiddenItems);
  const itemGrainLabel = isEN ? GRAIN_LABEL[reportGrain].en.replace('By ', '') : (reportGrain === 'station' ? 'Station' : 'Location');

  root.innerHTML = `
    <div class="cmp-pills">
      ${Object.entries(GRAIN_LABEL).map(([key, l]) => `<button type="button" class="cmp-pill ${key === reportGrain ? 'active' : ''}" data-report-grain="${key}">${isEN ? l.en : l.th}</button>`).join('')}
    </div>
    <div class="cmp-pills">
      ${Object.entries(VIEW_LABEL).map(([key, l]) => `<button type="button" class="cmp-pill ${key === reportView ? 'active' : ''}" data-report-view="${key}">${isEN ? l.en : l.th}</button>`).join('')}
    </div>
    <div class="report-toolbar">
      <div class="search-field report-search-field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="${t}-report-search" placeholder="${isEN ? 'Search…' : 'ค้นหา…'}">
      </div>
      <div class="field-picker">
        <button type="button" class="btn" id="${t}-report-sec-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
          ${isEN ? 'Show/hide sections' : 'แสดง/ซ่อนหัวข้อ'}
        </button>
        <div class="field-popover" id="${t}-report-sec-popover">
          <div class="field-popover-hd">${isEN ? 'Sections' : 'หัวข้อ'}</div>
          ${Object.entries(SEC).map(([key, l]) => `<label><input type="checkbox" class="report-sec-check" data-key="${key}" ${getReportHidden(t)[key] ? '' : 'checked'}> ${isEN ? l.en : l.th}</label>`).join('')}
        </div>
      </div>
      <div class="field-picker">
        <button type="button" class="btn" id="${t}-report-item-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
          ${isEN ? `Show/hide ${itemGrainLabel}s` : `ซ่อน/แสดง ${itemGrainLabel}`}${hiddenItems.length ? ` (${hiddenItems.length})` : ''}
        </button>
        <div class="field-popover field-popover-scroll" id="${t}-report-item-popover">
          <div class="field-popover-hd">${isEN ? itemGrainLabel : itemGrainLabel}</div>
          ${groups.map(g => `<label><input type="checkbox" class="report-item-check" data-key="${escHtml(g.key)}" ${hiddenItemSet.has(g.key) ? '' : 'checked'}> ${escHtml(g.key)}</label>`).join('')}
        </div>
      </div>
      <button type="button" class="btn" id="${t}-report-print">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        ${isEN ? 'Print / Export PDF' : 'พิมพ์ / ส่งออก PDF'}
      </button>
    </div>
    <div class="print-only" id="${t}-report-print-heading"></div>
    <div id="${t}-report-list"></div>
    <div class="table-foot"><div id="${t}-report-page"></div></div>
  `;

  root.querySelectorAll('[data-report-grain]').forEach(btn => btn.addEventListener('click', () => {
    reportGrain = btn.dataset.reportGrain;
    renderReportUI(t);
  }));
  root.querySelectorAll('[data-report-view]').forEach(btn => btn.addEventListener('click', () => {
    reportView = btn.dataset.reportView;
    renderReportUI(t);
  }));

  const secToggleBtn = document.getElementById(`${t}-report-sec-toggle`);
  const secPopover = document.getElementById(`${t}-report-sec-popover`);
  secToggleBtn.addEventListener('click', e => { e.stopPropagation(); secPopover.classList.toggle('open'); });
  secPopover.querySelectorAll('.report-sec-check').forEach(cb => cb.addEventListener('change', () => {
    setReportSectionHidden(t, cb.dataset.key, !cb.checked);
    renderReportUI(t);
    document.getElementById(`${t}-report-sec-popover`)?.classList.add('open');
  }));

  const itemToggleBtn = document.getElementById(`${t}-report-item-toggle`);
  const itemPopover = document.getElementById(`${t}-report-item-popover`);
  itemToggleBtn.addEventListener('click', e => { e.stopPropagation(); itemPopover.classList.toggle('open'); });
  itemPopover.querySelectorAll('.report-item-check').forEach(cb => cb.addEventListener('change', () => {
    setReportItemHidden(t, reportGrain, cb.dataset.key, !cb.checked);
    renderReportUI(t);
    document.getElementById(`${t}-report-item-popover`)?.classList.add('open');
  }));

  const visibleGroups = groups.filter(g => !hiddenItemSet.has(g.key));
  const listEl = document.getElementById(`${t}-report-list`);
  const pageEl = document.getElementById(`${t}-report-page`);
  const searchEl = document.getElementById(`${t}-report-search`);

  const renderList = filtered => {
    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-state"><p>${isEN ? 'No rows match.' : 'ไม่พบข้อมูลที่ตรงตามเงื่อนไขที่กำหนด'}</p></div>`;
      pageEl.innerHTML = '';
      return;
    }
    if (reportView === 'summary') {
      pageEl.innerHTML = '';
      listEl.innerHTML = summaryTableHtml(filtered, isEN);
      wireSummaryRowClicks(t, listEl);
      return;
    }
    wirePagination(pageEl, filtered, PAGE_SIZE, pageGroups => {
      listEl.innerHTML = pageGroups.map(g => g.grain === 'station' ? stationCardHtml(t, g, isEN) : locationCardHtml(t, g, isEN)).join('');
    });
  };

  wireSearch(searchEl, visibleGroups, (g, q) => String(g.key).toLowerCase().includes(q), renderList);

  document.getElementById(`${t}-report-print`).addEventListener('click', () => {
    const q = (searchEl.value || '').trim().toLowerCase();
    const all = q ? visibleGroups.filter(g => String(g.key).toLowerCase().includes(q)) : visibleGroups;
    if (!all.length) {
      listEl.innerHTML = `<div class="empty-state"><p>${isEN ? 'No rows match.' : 'ไม่พบข้อมูลที่ตรงตามเงื่อนไขที่กำหนด'}</p></div>`;
    } else if (reportView === 'summary') {
      listEl.innerHTML = summaryTableHtml(all, isEN);
    } else {
      listEl.innerHTML = all.map(g => g.grain === 'station' ? stationCardHtml(t, g, isEN) : locationCardHtml(t, g, isEN)).join('');
    }
    document.getElementById(`${t}-report-print-heading`).innerHTML = printHeadingHtml(t, isEN, q, hiddenItems.length, itemGrainLabel);
    printingTab = t;
    window.print();
  });
}

/** Jumping from a summary row to its full detail card reuses the existing
    search box + Detail view (search narrows to exactly this one key) —
    no separate "scroll to card" mechanism needed. */
function wireSummaryRowClicks(t, container) {
  container.querySelectorAll('.report-sum-row').forEach(row => row.addEventListener('click', () => {
    const key = row.dataset.key;
    reportView = 'detail';
    renderReportUI(t);
    const searchEl = document.getElementById(`${t}-report-search`);
    if (searchEl) { searchEl.value = key; searchEl.dispatchEvent(new Event('input', { bubbles: true })); }
  }));
}

function printHeadingHtml(t, isEN, activeFilter, hiddenCount, itemGrainLabel) {
  const moduleName = TYPE_CFG[t].name;
  const grainLabel = isEN ? GRAIN_LABEL[reportGrain].en : GRAIN_LABEL[reportGrain].th;
  const viewLabel = isEN ? VIEW_LABEL[reportView].en : VIEW_LABEL[reportView].th;
  const generated = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const filterLine = activeFilter
    ? `<div class="print-only-line">${isEN ? `Filtered by: "${escHtml(activeFilter)}"` : `กรองผลลัพธ์ด้วยคำค้นหา: "${escHtml(activeFilter)}"`}</div>`
    : '';
  const hiddenLine = hiddenCount
    ? `<div class="print-only-line">${isEN ? `${hiddenCount} ${itemGrainLabel}(s) hidden from this report` : `ซ่อน ${hiddenCount} ${itemGrainLabel} จากรายงานนี้`}</div>`
    : '';
  return `
    <div class="print-only-title">${escHtml(moduleName)} — ${isEN ? 'Report' : 'รายงาน'} (${escHtml(grainLabel)} · ${escHtml(viewLabel)})</div>
    <div class="print-only-line">${isEN ? 'Generated' : 'สร้างเมื่อ'} ${generated}</div>
    ${filterLine}
    ${hiddenLine}
  `;
}

// Fires once the print dialog closes (printed or cancelled) and restores
// the normal paginated Report view — registered once at module load, not
// per-render, so it never accumulates (same reasoning as the history
// popovers' outside-click listener in standardsUI.js/comparisonUI.js).
window.addEventListener('afterprint', () => {
  if (!printingTab) return;
  const t = printingTab;
  printingTab = null;
  renderReportUI(t);
});

// Closes the show/hide-sections and show/hide-items popovers on an
// outside click — registered once at module load, not per-render, for
// the same reason as the history popovers' outside-click listener in
// standardsUI.js/comparisonUI.js (renderReportUI replaces the
// popover/button DOM nodes on every render).
document.addEventListener('click', e => {
  document.querySelectorAll('[id$="-report-sec-popover"].open, [id$="-report-item-popover"].open').forEach(p => {
    if (!p.closest('.field-picker')?.contains(e.target)) p.classList.remove('open');
  });
});

function section(titleObj, isEN, bodyHtml, hidden) {
  if (hidden) return '';
  return `<div class="report-section">
    <div class="report-section-title">${isEN ? titleObj.en : titleObj.th}</div>
    ${bodyHtml}
  </div>`;
}

function metaLine(g, isEN) {
  const parts = [
    isEN ? `${g.n} readings` : `${g.n} รายการข้อมูล`,
    isEN ? `${g.paramCount} parameters` : `${g.paramCount} พารามิเตอร์`,
  ];
  if (g.years.length) parts.push(isEN ? `${g.years[0]}–${g.years[g.years.length - 1]}` : `ปี ${g.years[0]}–${g.years[g.years.length - 1]}`);
  if (g.grain === 'location') parts.push(isEN ? `${g.stationCount} stations` : `${g.stationCount} สถานี`);
  return parts.join(' · ');
}

function overallStatusHtml(g, isEN) {
  const exceedParamCount = new Set(g.exceeding.map(e => e.pk)).size;
  const parts = [];
  if (exceedParamCount) parts.push(isEN ? `${exceedParamCount} exceeding` : `เกินมาตรฐาน ${exceedParamCount} parameter`);
  parts.push(isEN ? `${g.passCount} within limits` : `ผ่านมาตรฐาน ${g.passCount} parameter`);
  if (g.notSetCount) parts.push(isEN ? `${g.notSetCount} no standard set` : `ยังไม่ตั้งมาตรฐาน ${g.notSetCount} parameter`);
  return `<p class="report-para">${parts.join(' · ')}</p>`;
}

/** Maps a points array (each carrying `.yr`) by year for O(1) lookup when
    building a fixed-year-column table — a parameter may be missing a
    reading in a given year, so callers render '—' on a miss rather than
    assuming positional alignment across rows. */
function pointsByYear(points) {
  const m = new Map();
  points.forEach(p => m.set(String(p.yr), p));
  return m;
}

function statusChipHtml(e, isEN) {
  // Same severity-color convention as Data Overview's chip coloring: the
  // most severe tier this parameter defines gets red, a lesser tier gets
  // amber; an untiered standard (single threshold) is always red.
  const chipCls = e.isMostSevere ? 'chip-exceed' : 'chip-outlier';
  const label = e.tier ? escHtml(e.tier) : (isEN ? 'Exceeding' : 'เกิน');
  return `<span class="chip ${chipCls}">${label}</span>`;
}

function exceedingListHtml(exceeding, isEN, attributeStation) {
  if (!exceeding.length) return `<p class="report-para">${isEN ? 'No parameters exceeded their standard.' : 'ไม่มีพารามิเตอร์ใดเกินมาตรฐานที่กำหนด'}</p>`;
  const stTh = attributeStation ? `<th>${isEN ? 'Station' : 'สถานี'}</th>` : '';
  return `<div class="table-scroll"><table class="report-table">
    <thead><tr><th>${isEN ? 'Parameter' : 'Parameter'}</th>${stTh}<th class="num">${isEN ? 'Value' : 'ค่า'}</th><th>${isEN ? 'Unit' : 'หน่วย'}</th><th class="num">${isEN ? 'Year' : 'ปี'}</th><th>${isEN ? 'Standard' : 'มาตรฐาน'}</th><th>${isEN ? 'Status' : 'สถานะ'}</th></tr></thead>
    <tbody>${exceeding.map(e => {
      const limitWord = e.std.direction === 'min' ? (isEN ? 'not below' : 'ไม่ต่ำกว่า') : (isEN ? 'not exceed' : 'ไม่เกิน');
      const stTd = attributeStation ? `<td>${escHtml(e.st)}</td>` : '';
      return `<tr>
        <td class="param">${escHtml(e.pk)}</td>${stTd}
        <td class="num">${fmtVal(e.value, e.std.decimals)}</td>
        <td>${e.unit || '—'}</td>
        <td class="num">${e.yr ?? '—'}</td>
        <td>${isEN ? `limit ${limitWord}` : `มาตรฐาน${limitWord}`} ${e.std.value} ${e.std.unit || ''}</td>
        <td>${statusChipHtml(e, isEN)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function minMaxListHtml(minMax, isEN) {
  return `<div class="table-scroll"><table class="report-table">
    <thead><tr><th>${isEN ? 'Parameter' : 'Parameter'}</th><th>${isEN ? 'Unit' : 'หน่วย'}</th><th class="num">Min</th><th class="num">Max</th></tr></thead>
    <tbody>${minMax.map(m => `<tr><td class="param">${escHtml(m.pk)}</td><td>${m.unit || '—'}</td><td class="num">${fmtVal(m.min)}</td><td class="num">${fmtVal(m.max)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function trendSuffix(trend, isEN) {
  if (!trend) return isEN ? '—' : '—';
  if (trend.label === 'stable') return isEN ? 'No discernible trend' : 'ไม่มีแนวโน้มเปลี่ยนแปลงชัดเจน';
  const word = trend.label === 'up' ? (isEN ? 'Increasing trend' : 'มีแนวโน้มเพิ่มขึ้น') : (isEN ? 'Decreasing trend' : 'มีแนวโน้มลดลง');
  return `${word} ${trend.pct >= 0 ? '+' : ''}${trend.pct.toFixed(1)}%`;
}

function yearHeadHtml(years, isEN) {
  return years.map(y => `<th class="num">${y}</th>`).join('');
}

function selfTrendListHtml(selfTrend, years, isEN) {
  if (!selfTrend.length) return `<p class="report-para">${isEN ? 'Not enough years of data for a trend (need at least 2).' : 'ข้อมูลมีไม่เพียงพอสำหรับการวิเคราะห์แนวโน้ม (ต้องมีข้อมูลอย่างน้อย 2 ปี)'}</p>`;
  return `<div class="table-scroll"><table class="report-table">
    <thead><tr><th>${isEN ? 'Parameter' : 'Parameter'}</th>${yearHeadHtml(years, isEN)}<th>${isEN ? 'Overall trend' : 'แนวโน้มโดยรวม'}</th></tr></thead>
    <tbody>${selfTrend.map(s => {
      const byYr = pointsByYear(s.points);
      let prevYr = null, prevVal = null;
      const cells = years.map(y => {
        const p = byYr.get(String(y));
        if (!p) return `<td class="num">—</td>`;
        // % change vs the last year that actually had a reading — named
        // explicitly (not just "previous year") since a gap in the data
        // means that's not always the immediately preceding calendar year.
        let deltaHtml = '';
        if (prevVal != null) {
          const pct = prevVal !== 0 ? (p.val - prevVal) / Math.abs(prevVal) * 100 : null;
          deltaHtml = pct == null ? ''
            : `<div class="report-yr-delta">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% ${isEN ? 'vs' : 'เทียบ'} ${prevYr}</div>`;
        }
        prevYr = y; prevVal = p.val;
        return `<td class="num"><div class="report-yr-val">${fmtVal(p.val)}</div>${deltaHtml}</td>`;
      }).join('');
      return `<tr><td class="param">${escHtml(s.pk)}</td>${cells}<td>${trendSuffix(s.trend, isEN)}</td></tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function refBaselineTrendListHtml(trendList, hasFlag, years, isEN) {
  if (!hasFlag) return `<p class="report-para">${isEN ? 'Reference/Baseline not configured for this Location.' : 'ยังไม่มีการกำหนดสถานีอ้างอิง (REF) หรือสถานีฐาน (Baseline) สำหรับพื้นที่นี้'}</p>`;
  if (!trendList.length) return `<p class="report-para">${isEN ? 'No comparable data.' : 'ไม่มีข้อมูลที่สามารถนำมาเปรียบเทียบได้ในขณะนี้'}</p>`;
  return `<div class="table-scroll"><table class="report-table">
    <thead><tr><th>${isEN ? 'Parameter' : 'Parameter'}</th>${yearHeadHtml(years, isEN)}</tr></thead>
    <tbody>${trendList.map(s => {
      const byYr = pointsByYear(s.points);
      const cells = years.map(y => {
        const p = byYr.get(String(y));
        if (!p) return `<td class="num">—</td>`;
        const pct = isFinite(p.pctDiff) ? `${p.pctDiff >= 0 ? '+' : ''}${p.pctDiff.toFixed(1)}%` : '—';
        // p.status ('close'/'different') already reflects this format's own
        // configured threshold (same value the Comparison tab uses) — flag
        // it in red here rather than introduce a second judgment.
        const deltaCls = p.status === 'different' ? 'report-yr-delta report-yr-delta-diff' : 'report-yr-delta';
        return `<td class="num"><div class="report-yr-val">${fmtVal(p.compareVal)}</div><div class="${deltaCls}">${pct}</div></td>`;
      }).join('');
      return `<tr><td class="param">${escHtml(s.pk)}</td>${cells}</tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

/** Same exceed-count / isMostSevere severity logic statusChipHtml() /
    exceedingListHtml() already use — just rolled up to one chip per
    Station/Location instead of one row per exceeding parameter. */
function standardsSummary(g, isEN) {
  const exceedParamCount = new Set(g.exceeding.map(e => e.pk)).size;
  if (!exceedParamCount) return { cls: 'chip-ok', label: isEN ? 'All within limits' : 'ผ่านทั้งหมด' };
  const anyCritical = g.exceeding.some(e => e.isMostSevere);
  return { cls: anyCritical ? 'chip-exceed' : 'chip-outlier', label: isEN ? `${exceedParamCount} exceeding` : `เกิน ${exceedParamCount} parameter` };
}

/** Same trend.label field trendSuffix() reads per parameter — counted
    across every parameter in this Station/Location's self-trend list
    instead of spelled out one row at a time. */
function selfTrendSummaryHtml(selfTrend, isEN) {
  if (!selfTrend.length) return `<span class="report-sum-trend flat">${isEN ? '— not enough data' : '— ข้อมูลไม่พอ'}</span>`;
  const up = selfTrend.filter(s => s.trend?.label === 'up').length;
  const down = selfTrend.filter(s => s.trend?.label === 'down').length;
  if (!up && !down) return `<span class="report-sum-trend flat">${isEN ? 'Stable' : 'คงที่'}</span>`;
  const parts = [];
  if (up) parts.push(`↑${up}`);
  if (down) parts.push(`↓${down}`);
  return `<span class="report-sum-trend ${up >= down ? 'up' : 'down'}">${parts.join(' ')}</span>`;
}

/** Same p.status ('close'/'different') field refBaselineTrendListHtml()
    reads per year to red-flag a cell — counted here across parameters
    into one chip ("ต่าง N" = at least one differing year for that
    parameter, matching the same threshold the Detail view already
    applies). */
function refBaseSummary(trendList, hasFlag, isEN) {
  if (!hasFlag) return { cls: 'chip-unset', label: '—' };
  if (!trendList.length) return { cls: 'chip-unset', label: isEN ? 'No data' : 'ไม่มีข้อมูล' };
  const diff = trendList.filter(s => s.points.some(p => p.status === 'different')).length;
  if (!diff) return { cls: 'chip-ok', label: isEN ? 'All close' : 'ใกล้เคียงทั้งหมด' };
  return { cls: 'chip-exceed', label: isEN ? `${diff} different` : `ต่าง ${diff}` };
}

function chipSpan(o) {
  return `<span class="chip ${o.cls}">${o.label}</span>`;
}

function summaryTableHtml(groups, isEN) {
  const isStation = groups[0]?.grain === 'station';
  const theadCells = isStation
    ? `<th>${isEN ? 'Station' : 'Station'}</th><th>${isEN ? 'Year' : 'ปี'}</th><th class="num">${isEN ? 'Parameters' : 'Parameters'}</th><th>${isEN ? 'Standards status' : 'สถานะมาตรฐาน'}</th><th>${isEN ? 'Trend (across years)' : 'แนวโน้ม (ข้ามปี)'}</th><th>${isEN ? 'vs REF' : 'เทียบ REF'}</th><th>${isEN ? 'vs Baseline' : 'เทียบ Baseline'}</th>`
    : `<th>${isEN ? 'Location' : 'Location'}</th><th class="num">${isEN ? 'Stations' : 'Stations'}</th><th>${isEN ? 'Year' : 'ปี'}</th><th class="num">${isEN ? 'Parameters' : 'Parameters'}</th><th>${isEN ? 'Standards status' : 'สถานะมาตรฐาน (รวม)'}</th><th>${isEN ? 'Trend (across years)' : 'แนวโน้ม (ข้ามปี)'}</th><th>${isEN ? 'vs Baseline' : 'เทียบ Baseline'}</th>`;
  const rows = groups.map(g => {
    const yearsLabel = g.years.length ? `${g.years[0]}–${g.years[g.years.length - 1]}` : '—';
    const nameSub = isStation && g.loc ? `<div class="report-sum-sub">${escHtml(g.loc)}</div>` : '';
    const nameCell = `<td><div class="report-sum-name">${escHtml(g.key)}</div>${nameSub}</td>`;
    const status = chipSpan(standardsSummary(g, isEN));
    const trend = selfTrendSummaryHtml(g.selfTrend, isEN);
    const base = chipSpan(refBaseSummary(g.baselineTrend, g.hasBaseline, isEN));
    const bodyCells = isStation
      ? `<td>${yearsLabel}</td><td class="num">${g.paramCount}</td><td>${status}</td><td>${trend}</td><td>${chipSpan(refBaseSummary(g.refTrend, g.hasRef, isEN))}</td><td>${base}</td>`
      : `<td class="num">${g.stationCount}</td><td>${yearsLabel}</td><td class="num">${g.paramCount}</td><td>${status}</td><td>${trend}</td><td>${base}</td>`;
    return `<tr class="report-sum-row" data-key="${escHtml(g.key)}">${nameCell}${bodyCells}</tr>`;
  }).join('');
  return `<div class="table-scroll"><table class="report-table report-sum-table">
    <thead><tr>${theadCells}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function stationCardHtml(t, g, isEN) {
  const hidden = getReportHidden(t);
  return `<div class="report-card">
    <div class="report-card-title">${escHtml(g.key)}${g.loc ? ` <span class="report-card-title-sub">(${isEN ? 'Location' : 'Location'}: ${escHtml(g.loc)})</span>` : ''}</div>
    <div class="report-card-meta">${metaLine(g, isEN)}</div>
    ${section(SEC.overall, isEN, overallStatusHtml(g, isEN) + exceedingListHtml(g.exceeding, isEN, false), hidden.overall)}
    ${section(SEC.selfTrend, isEN, selfTrendListHtml(g.selfTrend, g.years, isEN), hidden.selfTrend)}
    ${section(SEC.refTrend, isEN, refBaselineTrendListHtml(g.refTrend, g.hasRef, g.years, isEN), hidden.refTrend)}
    ${section(SEC.baseTrend, isEN, refBaselineTrendListHtml(g.baselineTrend, g.hasBaseline, g.years, isEN), hidden.baseTrend)}
  </div>`;
}

function locationCardHtml(t, g, isEN) {
  const hidden = getReportHidden(t);
  return `<div class="report-card">
    <div class="report-card-title">${escHtml(g.key)}</div>
    <div class="report-card-meta">${metaLine(g, isEN)}</div>
    ${section(SEC.overall, isEN, overallStatusHtml(g, isEN) + exceedingListHtml(g.exceeding, isEN, true), hidden.overall)}
    ${section(SEC.minmax, isEN, minMaxListHtml(g.minMax, isEN), hidden.minmax)}
    ${section(SEC.selfTrend, isEN, selfTrendListHtml(g.selfTrend, g.years, isEN), hidden.selfTrend)}
    ${section(SEC.baseTrend, isEN, refBaselineTrendListHtml(g.baselineTrend, g.hasBaseline, g.years, isEN), hidden.baseTrend)}
  </div>`;
}
