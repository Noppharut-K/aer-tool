/**
 * reportUI.js — Report tab: structured narrative per Station or Location
 * (single-select grain toggle). Each card has labeled subsections (not one
 * run-on paragraph) so a long list — e.g. every year's REF comparison for
 * every parameter — stays scannable instead of becoming a wall of text.
 */

import { LANG } from '../utils/lang.js';
import { getState, getReportHidden, setReportSectionHidden } from '../core/state.js';
import { getReportGroups } from '../core/report.js';
import { fmtVal } from '../core/analysis.js';
import { wireSearch, wirePagination } from './tableControls.js';
import { TYPE_CFG } from '../core/standards.js';

const PAGE_SIZE = 10;
let reportGrain = 'station';
let printingTab = null; // set right before window.print(), consumed by the module-level 'afterprint' handler below

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const GRAIN_LABEL = {
  station: { th: 'ตาม Station', en: 'By Station' },
  location: { th: 'ตาม Location', en: 'By Location' },
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
    root.innerHTML = `<div class="empty-state"><p>${isEN ? 'Run analysis first.' : 'วิเคราะห์ข้อมูลก่อน'}</p></div>`;
    return;
  }

  root.innerHTML = `
    <div class="cmp-pills">
      ${Object.entries(GRAIN_LABEL).map(([key, l]) => `<button type="button" class="cmp-pill ${key === reportGrain ? 'active' : ''}" data-report-grain="${key}">${isEN ? l.en : l.th}</button>`).join('')}
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

  const secToggleBtn = document.getElementById(`${t}-report-sec-toggle`);
  const secPopover = document.getElementById(`${t}-report-sec-popover`);
  secToggleBtn.addEventListener('click', e => { e.stopPropagation(); secPopover.classList.toggle('open'); });
  secPopover.querySelectorAll('.report-sec-check').forEach(cb => cb.addEventListener('change', () => {
    setReportSectionHidden(t, cb.dataset.key, !cb.checked);
    renderReportUI(t);
    document.getElementById(`${t}-report-sec-popover`)?.classList.add('open');
  }));

  const groups = getReportGroups(t, reportGrain);
  const listEl = document.getElementById(`${t}-report-list`);
  const pageEl = document.getElementById(`${t}-report-page`);
  const searchEl = document.getElementById(`${t}-report-search`);

  wireSearch(searchEl, groups,
    (g, q) => String(g.key).toLowerCase().includes(q),
    filtered => {
      if (!filtered.length) {
        listEl.innerHTML = `<div class="empty-state"><p>${isEN ? 'No rows match.' : 'ไม่มีข้อมูลตรงกับเงื่อนไข'}</p></div>`;
        pageEl.innerHTML = '';
        return;
      }
      wirePagination(pageEl, filtered, PAGE_SIZE, pageGroups => {
        listEl.innerHTML = pageGroups.map(g => g.grain === 'station' ? stationCardHtml(t, g, isEN) : locationCardHtml(t, g, isEN)).join('');
      });
    }
  );

  document.getElementById(`${t}-report-print`).addEventListener('click', () => {
    const q = (searchEl.value || '').trim().toLowerCase();
    const all = q ? groups.filter(g => String(g.key).toLowerCase().includes(q)) : groups;
    listEl.innerHTML = all.length
      ? all.map(g => g.grain === 'station' ? stationCardHtml(t, g, isEN) : locationCardHtml(t, g, isEN)).join('')
      : `<div class="empty-state"><p>${isEN ? 'No rows match.' : 'ไม่มีข้อมูลตรงกับเงื่อนไข'}</p></div>`;
    document.getElementById(`${t}-report-print-heading`).innerHTML = printHeadingHtml(t, isEN, q);
    printingTab = t;
    window.print();
  });
}

function printHeadingHtml(t, isEN, activeFilter) {
  const moduleName = TYPE_CFG[t].name;
  const grainLabel = isEN ? GRAIN_LABEL[reportGrain].en : GRAIN_LABEL[reportGrain].th;
  const generated = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const filterLine = activeFilter
    ? `<div class="print-only-line">${isEN ? `Filtered by: "${escHtml(activeFilter)}"` : `กรองด้วยคำค้นหา: "${escHtml(activeFilter)}"`}</div>`
    : '';
  return `
    <div class="print-only-title">${escHtml(moduleName)} — ${isEN ? 'Report' : 'รายงาน'} (${escHtml(grainLabel)})</div>
    <div class="print-only-line">${isEN ? 'Generated' : 'สร้างเมื่อ'} ${generated}</div>
    ${filterLine}
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

// Closes the show/hide-sections popover on an outside click — registered
// once at module load, not per-render, for the same reason as the history
// popovers' outside-click listener in standardsUI.js/comparisonUI.js
// (renderReportUI replaces the popover/button DOM nodes on every render).
document.addEventListener('click', e => {
  document.querySelectorAll('[id$="-report-sec-popover"].open').forEach(p => {
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
    isEN ? `${g.paramCount} parameters` : `${g.paramCount} parameter`,
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
  if (!exceeding.length) return `<p class="report-para">${isEN ? 'No parameters exceeded their standard.' : 'ไม่มี parameter ที่เกินมาตรฐาน'}</p>`;
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
  if (trend.label === 'stable') return isEN ? 'Stable' : 'ค่อนข้างคงที่';
  const word = trend.label === 'up' ? (isEN ? 'Increasing' : 'เพิ่มขึ้น') : (isEN ? 'Decreasing' : 'ลดลง');
  return `${word} ${trend.pct >= 0 ? '+' : ''}${trend.pct.toFixed(1)}%`;
}

function yearHeadHtml(years, isEN) {
  return years.map(y => `<th class="num">${y}</th>`).join('');
}

function selfTrendListHtml(selfTrend, years, isEN) {
  if (!selfTrend.length) return `<p class="report-para">${isEN ? 'Not enough years of data for a trend (need at least 2).' : 'ข้อมูลไม่พอสำหรับดูแนวโน้ม (ต้องมีอย่างน้อย 2 ปี)'}</p>`;
  return `<div class="table-scroll"><table class="report-table">
    <thead><tr><th>${isEN ? 'Parameter' : 'Parameter'}</th>${yearHeadHtml(years, isEN)}<th>${isEN ? 'Overall trend' : 'แนวโน้มโดยรวม'}</th></tr></thead>
    <tbody>${selfTrend.map(s => {
      const byYr = pointsByYear(s.points);
      const cells = years.map(y => {
        const p = byYr.get(String(y));
        return `<td class="num">${p ? fmtVal(p.val) : '—'}</td>`;
      }).join('');
      return `<tr><td class="param">${escHtml(s.pk)}</td>${cells}<td>${trendSuffix(s.trend, isEN)}</td></tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function refBaselineTrendListHtml(trendList, hasFlag, years, isEN) {
  if (!hasFlag) return `<p class="report-para">${isEN ? 'Reference/Baseline not configured for this Location.' : 'ยังไม่ได้กำหนด REF/Baseline สำหรับพื้นที่นี้'}</p>`;
  if (!trendList.length) return `<p class="report-para">${isEN ? 'No comparable data.' : 'ไม่มีข้อมูลที่เปรียบเทียบได้'}</p>`;
  return `<div class="table-scroll"><table class="report-table">
    <thead><tr><th>${isEN ? 'Parameter' : 'Parameter'}</th>${yearHeadHtml(years, isEN)}</tr></thead>
    <tbody>${trendList.map(s => {
      const byYr = pointsByYear(s.points);
      const cells = years.map(y => {
        const p = byYr.get(String(y));
        if (!p) return `<td class="num">—</td>`;
        const pct = isFinite(p.pctDiff) ? `${p.pctDiff >= 0 ? '+' : ''}${p.pctDiff.toFixed(1)}%` : '—';
        return `<td class="num"><div class="report-yr-val">${fmtVal(p.compareVal)}</div><div class="report-yr-delta">${pct}</div></td>`;
      }).join('');
      return `<tr><td class="param">${escHtml(s.pk)}</td>${cells}</tr>`;
    }).join('')}</tbody>
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
