/**
 * reportUI.js — Report tab: narrative summary of Data Overview + Comparison
 * findings, grouped by Station, Location, or Year (one grain at a time).
 * Brief/key-points tone — mentions exceedances and significant comparison
 * differences, not every parameter's full detail.
 */

import { LANG } from '../utils/lang.js';
import { getState } from '../core/state.js';
import { getReportGroups, hasAnyComparisonConfigured } from '../core/report.js';
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
  year: { th: 'ตามปี', en: 'By Year' },
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
  const configured = hasAnyComparisonConfigured(t);

  wireSearch(searchEl, groups,
    (g, q) => String(g.key).toLowerCase().includes(q),
    filtered => {
      if (!filtered.length) {
        listEl.innerHTML = `<div class="empty-state"><p>${isEN ? 'No rows match.' : 'ไม่มีข้อมูลตรงกับเงื่อนไข'}</p></div>`;
        pageEl.innerHTML = '';
        return;
      }
      wirePagination(pageEl, filtered, PAGE_SIZE, pageGroups => {
        listEl.innerHTML = pageGroups.map(g => cardHtml(g, isEN, configured)).join('');
      });
    }
  );
}

function cardHtml(g, isEN, configured) {
  return `<div class="report-card">
    <div class="report-card-title">${escHtml(g.key)}${g.loc ? ` <span class="report-card-title-sub">(${isEN ? 'Location' : 'Location'}: ${escHtml(g.loc)})</span>` : ''}</div>
    <div class="report-card-meta">${metaLine(g, isEN)}</div>
    <p class="report-para">${standardsSentence(g, isEN)}</p>
    ${configured ? `<p class="report-para">${comparisonSentence(g, isEN)}</p>` : ''}
  </div>`;
}

function metaLine(g, isEN) {
  const parts = [];
  parts.push(isEN ? `${g.n} readings` : `${g.n} รายการข้อมูล`);
  parts.push(isEN ? `${g.paramCount} parameters` : `${g.paramCount} parameter`);
  if (g.grain !== 'year' && g.years.length) parts.push(isEN ? `${g.years[0]}–${g.years[g.years.length - 1]}` : `ปี ${g.years[0]}–${g.years[g.years.length - 1]}`);
  if (g.grain !== 'station') parts.push(isEN ? `${g.stationCount} stations` : `${g.stationCount} สถานี`);
  if (g.grain === 'year') parts.push(isEN ? `${g.locationCount} locations` : `${g.locationCount} พื้นที่`);
  return parts.join(' · ');
}

const LIST_CAP = 5;

/** Joins up to LIST_CAP rendered items with "; ", appending a "+N more"
    note when the list was truncated — keeps narrative sentences readable
    even when a group has many exceedances/differences (e.g. every
    parameter at a heavily-impacted station). */
function joinCapped(items, renderFn, isEN) {
  const shown = items.slice(0, LIST_CAP).map(renderFn).join('; ');
  const rest = items.length - LIST_CAP;
  if (rest <= 0) return shown;
  return shown + (isEN ? `; and ${rest} more` : ` และอีก ${rest} รายการ`);
}

function standardsSentence(g, isEN) {
  let s;
  if (g.exceeding.length) {
    const sorted = [...g.exceeding].sort((a, b) => Math.abs(b.value - b.std.value) / Math.abs(b.std.value || 1) - Math.abs(a.value - a.std.value) / Math.abs(a.std.value || 1));
    const list = joinCapped(sorted, e => {
      const limitWord = e.std.direction === 'min' ? (isEN ? 'not below' : 'ไม่ต่ำกว่า') : (isEN ? 'not exceed' : 'ไม่เกิน');
      return isEN
        ? `${e.pk} (${fmtVal(e.value, e.std.decimals)} ${e.unit || ''}, limit ${limitWord} ${e.std.value} ${e.std.unit || ''})`
        : `${e.pk} (${fmtVal(e.value, e.std.decimals)} ${e.unit || ''}, มาตรฐาน${limitWord} ${e.std.value} ${e.std.unit || ''})`;
    }, isEN);
    s = isEN
      ? `${g.exceeding.length} parameter(s) exceeded their standard: ${list}.`
      : `พบ ${g.exceeding.length} parameter ที่มีค่าเกินมาตรฐานที่ตั้งไว้: ${list}`;
  } else {
    s = isEN ? 'All parameters with a standard set were within limits.' : 'ทุก parameter ที่มีมาตรฐานอยู่ในเกณฑ์ปกติ';
  }
  if (g.notSetCount) {
    s += isEN
      ? ` (${g.notSetCount} parameter(s) have no standard configured.)`
      : ` (อีก ${g.notSetCount} parameter ยังไม่ได้ตั้งค่ามาตรฐานอ้างอิง)`;
  }
  return s;
}

function comparisonSentence(g, isEN) {
  if (!g.diffing.length) {
    return isEN ? 'All comparison results were close to their reference value.' : 'ผลเปรียบเทียบทั้งหมดอยู่ในเกณฑ์ใกล้เคียงค่าอ้างอิง';
  }
  const sorted = [...g.diffing].sort((a, b) => Math.abs(b.pctDiff) - Math.abs(a.pctDiff));
  const list = joinCapped(sorted, d => `${d.pk} (${d.fmt}, ${d.pctDiff >= 0 ? '+' : ''}${d.pctDiff.toFixed(1)}%)`, isEN);
  return isEN
    ? `${g.diffing.length} comparison(s) differed significantly from their reference: ${list}.`
    : `ผลเปรียบเทียบพบความแตกต่างอย่างมีนัยสำคัญ ${g.diffing.length} รายการ: ${list}`;
}
