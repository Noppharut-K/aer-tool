/**
 * reportUI.js — Report tab: structured narrative per Station or Location
 * (single-select grain toggle). Each card has labeled subsections (not one
 * run-on paragraph) so a long list — e.g. every year's REF comparison for
 * every parameter — stays scannable instead of becoming a wall of text.
 */

import { LANG } from '../utils/lang.js';
import { getState } from '../core/state.js';
import { getReportGroups } from '../core/report.js';
import { fmtVal } from '../core/analysis.js';
import { wireSearch, wirePagination } from './tableControls.js';

const PAGE_SIZE = 10;
let reportGrain = 'station';

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
    <div class="search-field report-search-field">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="${t}-report-search" placeholder="${isEN ? 'Search…' : 'ค้นหา…'}">
    </div>
    <div id="${t}-report-list"></div>
    <div class="table-foot"><div id="${t}-report-page"></div></div>
  `;

  root.querySelectorAll('[data-report-grain]').forEach(btn => btn.addEventListener('click', () => {
    reportGrain = btn.dataset.reportGrain;
    renderReportUI(t);
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
        listEl.innerHTML = pageGroups.map(g => g.grain === 'station' ? stationCardHtml(g, isEN) : locationCardHtml(g, isEN)).join('');
      });
    }
  );
}

function section(titleObj, isEN, bodyHtml) {
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

function exceedingListHtml(exceeding, isEN, attributeStation) {
  if (!exceeding.length) return `<p class="report-para">${isEN ? 'No parameters exceeded their standard.' : 'ไม่มี parameter ที่เกินมาตรฐาน'}</p>`;
  return `<ul class="report-list">${exceeding.map(e => {
    const limitWord = e.std.direction === 'min' ? (isEN ? 'not below' : 'ไม่ต่ำกว่า') : (isEN ? 'not exceed' : 'ไม่เกิน');
    const stPart = attributeStation ? ` — ${escHtml(e.st)}` : '';
    return `<li>${escHtml(e.pk)}${stPart}: ${fmtVal(e.value, e.std.decimals)} ${e.unit || ''} (${isEN ? `limit ${limitWord}` : `มาตรฐาน${limitWord}`} ${e.std.value} ${e.std.unit || ''})</li>`;
  }).join('')}</ul>`;
}

function minMaxListHtml(minMax, isEN) {
  return `<ul class="report-list">${minMax.map(m => `<li>${escHtml(m.pk)}: ${fmtVal(m.min)}–${fmtVal(m.max)} ${m.unit || ''}</li>`).join('')}</ul>`;
}

function trendSuffix(trend, isEN) {
  if (!trend) return '';
  if (trend.label === 'stable') return isEN ? ' (stable)' : ' (ค่อนข้างคงที่)';
  const word = trend.label === 'up' ? (isEN ? 'increasing' : 'เพิ่มขึ้น') : (isEN ? 'decreasing' : 'ลดลง');
  return ` (${word} ${trend.pct >= 0 ? '+' : ''}${trend.pct.toFixed(1)}%)`;
}

/** Compact inline line chart (~120x32) built from a { yr, [valueKey] }
    points array — no charting library, matches this app's existing
    hand-written inline SVG. Each point carries a native <title> tooltip
    for the exact year/value, since the chart itself has no axis labels.
    Returns '' when there's nothing meaningful to draw. */
function sparklineSvg(points, valueKey, isEN) {
  // Infinity shows up in pctDiff when a reference value is exactly 0 — not
  // plottable on a linear scale, so it's dropped from the chart geometry
  // entirely rather than distorting the axis or producing an invalid path.
  const plottable = points.filter(p => p[valueKey] != null && isFinite(p[valueKey]));
  if (plottable.length < 2) return '';
  const W = 120, H = 32, PAD = 4;
  const vals = plottable.map(p => p[valueKey]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const stepX = (W - PAD * 2) / (plottable.length - 1);
  const coords = plottable.map((p, i) => ({
    x: PAD + i * stepX,
    y: H - PAD - ((p[valueKey] - min) / range) * (H - PAD * 2),
    yr: p.yr, val: p[valueKey],
  }));
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const suffix = valueKey === 'pctDiff' ? '%' : '';
  const dots = coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2"><title>${c.yr}: ${isFinite(c.val) ? fmtVal(c.val) + suffix : (isEN ? 'n/a' : 'ไม่มีข้อมูล')}</title></circle>`).join('');
  return `<svg class="trend-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${pathD}" fill="none" stroke="currentColor" stroke-width="1.5"/>${dots}</svg>`;
}

function selfTrendListHtml(selfTrend, isEN) {
  if (!selfTrend.length) return `<p class="report-para">${isEN ? 'Not enough years of data for a trend (need at least 2).' : 'ข้อมูลไม่พอสำหรับดูแนวโน้ม (ต้องมีอย่างน้อย 2 ปี)'}</p>`;
  return `<ul class="report-list">${selfTrend.map(s => {
    const range = `${s.points[0].yr}–${s.points[s.points.length - 1].yr}`;
    return `<li>${escHtml(s.pk)} ${sparklineSvg(s.points, 'val', isEN)} <span class="trend-range">${range}</span>${trendSuffix(s.trend, isEN)}</li>`;
  }).join('')}</ul>`;
}

function refBaselineTrendListHtml(trendList, hasFlag, isEN) {
  if (!hasFlag) return `<p class="report-para">${isEN ? 'Reference/Baseline not configured for this Location.' : 'ยังไม่ได้กำหนด REF/Baseline สำหรับพื้นที่นี้'}</p>`;
  if (!trendList.length) return `<p class="report-para">${isEN ? 'No comparable data.' : 'ไม่มีข้อมูลที่เปรียบเทียบได้'}</p>`;
  return `<ul class="report-list">${trendList.map(s => {
    const range = `${s.points[0].yr}–${s.points[s.points.length - 1].yr}`;
    return `<li>${escHtml(s.pk)} ${sparklineSvg(s.points, 'pctDiff', isEN)} <span class="trend-range">${range}</span>${trendSuffix(s.trend, isEN)}</li>`;
  }).join('')}</ul>`;
}

function stationCardHtml(g, isEN) {
  return `<div class="report-card">
    <div class="report-card-title">${escHtml(g.key)}${g.loc ? ` <span class="report-card-title-sub">(${isEN ? 'Location' : 'Location'}: ${escHtml(g.loc)})</span>` : ''}</div>
    <div class="report-card-meta">${metaLine(g, isEN)}</div>
    ${section(SEC.overall, isEN, overallStatusHtml(g, isEN) + exceedingListHtml(g.exceeding, isEN, false))}
    ${section(SEC.selfTrend, isEN, selfTrendListHtml(g.selfTrend, isEN))}
    ${section(SEC.refTrend, isEN, refBaselineTrendListHtml(g.refTrend, g.hasRef, isEN))}
    ${section(SEC.baseTrend, isEN, refBaselineTrendListHtml(g.baselineTrend, g.hasBaseline, isEN))}
  </div>`;
}

function locationCardHtml(g, isEN) {
  return `<div class="report-card">
    <div class="report-card-title">${escHtml(g.key)}</div>
    <div class="report-card-meta">${metaLine(g, isEN)}</div>
    ${section(SEC.overall, isEN, overallStatusHtml(g, isEN) + exceedingListHtml(g.exceeding, isEN, true))}
    ${section(SEC.minmax, isEN, minMaxListHtml(g.minMax, isEN))}
    ${section(SEC.selfTrend, isEN, selfTrendListHtml(g.selfTrend, isEN))}
    ${section(SEC.baseTrend, isEN, refBaselineTrendListHtml(g.baselineTrend, g.hasBaseline, isEN))}
  </div>`;
}
