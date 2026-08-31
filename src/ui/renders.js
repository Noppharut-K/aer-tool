/**
 * renders.js — Data Overview dashboard: KPI strip, pivot-style grouped
 * table (column picker), search + pagination, empty states.
 */

import { LANG } from '../utils/lang.js';
import { getState, getParamCols } from '../core/state.js';
import { calcStat, computeOutlierStats, fmtVal } from '../core/analysis.js';
import { wireSearch, wirePagination } from './tableControls.js';

const PAGE_SIZE = 20;
const FIELD_LABEL = { year: { th: 'ปี', en: 'Year' }, loc: { th: 'Location', en: 'Location' }, st: { th: 'Station', en: 'Station' }, wl: { th: 'ระดับความลึก', en: 'Depth level' } };
const FIELD_ROWKEY = { year: 'yr', loc: 'loc', st: 'st', wl: 'wl' };
const DIM_ORDER = ['year', 'loc', 'st', 'wl'];

function checkedFields(t) {
  return [...document.querySelectorAll(`.fp-check[data-t="${t}"]:checked`)].map(c => c.value)
    .sort((a, b) => DIM_ORDER.indexOf(a) - DIM_ORDER.indexOf(b));
}

export function renderDashboard(t) {
  const isEN = LANG === 'en';
  const state = getState(t);
  const body = document.getElementById(`${t}-dash-body`);
  const tableCard = document.getElementById(`${t}-table-card`);
  if (!body || !tableCard) return;

  updateFieldSummary(t);

  if (!state.analyzed || !state.rows.length) {
    body.classList.add('is-empty');
    tableCard.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/></svg></div>
      <h2>${state.raw.length ? (isEN ? 'Ready to analyze' : 'พร้อมวิเคราะห์ข้อมูล') : (isEN ? 'No data imported yet' : 'ยังไม่มีข้อมูลนำเข้า')}</h2>
      <p>${state.raw.length
        ? (isEN ? 'Column mapping is confirmed — click Run analysis to build the dashboard.' : 'ยืนยันการจับคู่คอลัมน์แล้ว — กด "วิเคราะห์ข้อมูล" เพื่อเริ่ม')
        : (isEN ? 'Upload a wide-format Excel file or load the demo dataset to start.' : 'อัปโหลดไฟล์ Excel หรือกด "ทดลอง Demo" เพื่อเริ่มต้น')}</p>
    </div>`;
    document.getElementById(`${t}-kpi-strip`).innerHTML = '';
    return;
  }
  body.classList.remove('is-empty');

  renderKPIs(t);

  const dims = checkedFields(t);
  const zThreshold = parseFloat(document.getElementById(`${t}-outlier`)?.value) || 0;
  const groups = buildGroups(state.rows, dims);

  const searchEl = document.getElementById(`${t}-search`);
  wireSearch(searchEl, groups,
    (g, q) => g.pk.toLowerCase().includes(q) || dims.some(d => String(g.dims[d] ?? '').toLowerCase().includes(q)),
    filtered => renderTable(t, tableCard, filtered, dims, zThreshold)
  );
}

function updateFieldSummary(t) {
  const isEN = LANG === 'en';
  const dims = checkedFields(t);
  const el = document.getElementById(`${t}-fp-summary`);
  if (el) el.textContent = dims.length ? dims.map(d => isEN ? FIELD_LABEL[d].en : FIELD_LABEL[d].th).join(' + ') : (isEN ? 'Overview' : 'ภาพรวม');
}

function renderKPIs(t) {
  const isEN = LANG === 'en';
  const state = getState(t);
  const rows = state.rows;
  const zThreshold = parseFloat(document.getElementById(`${t}-outlier`)?.value) || 0;

  const stations = new Set(rows.map(r => r.st)).size;
  const parameters = new Set(rows.map(r => r.pk)).size;
  const byPk = {};
  rows.forEach(r => { (byPk[r.pk] ??= []).push(r); });
  let exceeding = 0, passing = 0, notSet = 0, outlierCount = 0;
  Object.values(byPk).forEach(group => {
    const hasStd = group.some(r => r.sc_status !== 'no_std');
    const hasExceed = group.some(r => r.sc_status === 'exceed');
    if (!hasStd) notSet++;
    else if (hasExceed) exceeding++;
    else passing++;
    if (zThreshold > 0) {
      const { isOutlier } = computeOutlierStats(group.map(r => r.val), zThreshold);
      outlierCount += group.filter(r => isOutlier(r.val)).length;
    }
  });

  const cards = [
    { label: isEN ? 'Stations' : 'สถานี', val: stations, sub: isEN ? 'total sampled' : 'จุดเก็บตัวอย่าง', cls: '' },
    { label: isEN ? 'Parameters' : 'Parameters', val: parameters, sub: isEN ? 'tracked' : 'ที่ติดตาม', cls: '' },
    { label: isEN ? 'Exceeding' : 'เกินมาตรฐาน', val: exceeding, sub: isEN ? 'parameters over standard' : 'parameter ที่เกิน', cls: 'kpi-exceed' },
    { label: isEN ? `Outliers (${zThreshold || '—'}σ)` : `ค่าผิดปกติ (${zThreshold || '—'}σ)`, val: outlierCount, sub: isEN ? 'flagged values' : 'ค่าที่ถูกตั้งค่าสถานะ', cls: 'kpi-outlier' },
    { label: isEN ? 'Passing' : 'ผ่านมาตรฐาน', val: passing, sub: isEN ? 'within all standards' : 'อยู่ในเกณฑ์ทั้งหมด', cls: 'kpi-ok' },
  ];
  document.getElementById(`${t}-kpi-strip`).innerHTML = cards.map(c => `
    <div class="kpi-card ${c.cls}">
      <div class="kpi-top"><span class="kpi-label">${c.label}</span></div>
      <div class="kpi-val">${c.val}</div>
      <div class="kpi-sub">${c.sub}</div>
    </div>`).join('');
}

function buildGroups(rows, dims) {
  const map = {};
  rows.forEach(r => {
    const keyParts = [r.pk, ...dims.map(d => String(r[FIELD_ROWKEY[d]] ?? '—'))];
    const key = keyParts.join('||');
    if (!map[key]) {
      map[key] = { pk: r.pk, unit: r.unit, dims: {}, vals: [], statuses: [] };
      dims.forEach(d => { map[key].dims[d] = r[FIELD_ROWKEY[d]] ?? '—'; });
    }
    map[key].vals.push(r.val);
    map[key].statuses.push(r.sc_status);
  });
  return Object.values(map);
}

function renderTable(t, tableCard, groups, dims, zThreshold) {
  const isEN = LANG === 'en';
  if (!groups.length) {
    tableCard.innerHTML = `<div class="empty-state"><p>${isEN ? 'No rows match your filters.' : 'ไม่มีข้อมูลตรงกับเงื่อนไข'}</p></div>`;
    return;
  }
  groups.sort((a, b) => a.pk.localeCompare(b.pk) || dims.some(d => a.dims[d] !== b.dims[d]));

  const dimHeaders = dims.map(d => isEN ? FIELD_LABEL[d].en : FIELD_LABEL[d].th);
  const ths = ['Parameter', ...dimHeaders, isEN ? 'Unit' : 'หน่วย', 'n', 'Min', 'Max', 'Mean', 'SD', isEN ? 'Status' : 'สถานะ'];

  tableCard.innerHTML = `
    <div class="table-scroll">
      <table>
        <thead><tr>${ths.map((h, i) => `<th${i > 0 && i < ths.length - 1 ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead>
        <tbody id="${t}-tbody"></tbody>
      </table>
    </div>
    <div class="table-foot"><div id="${t}-page"></div></div>`;

  const tbody = document.getElementById(`${t}-tbody`);
  wirePagination(document.getElementById(`${t}-page`), groups, PAGE_SIZE, pageGroups => {
    tbody.innerHTML = pageGroups.map(g => rowHtml(g, dims, zThreshold, isEN)).join('');
  });
}

function rowHtml(g, dims, zThreshold, isEN) {
  const st = calcStat(g.vals);
  const hasStd = g.statuses.some(s => s !== 'no_std');
  const exceedN = g.statuses.filter(s => s === 'exceed').length;
  const status = !hasStd
    ? `<span class="chip chip-unset">${isEN ? 'Not yet set' : 'ยังไม่ตั้งมาตรฐาน'}</span>`
    : exceedN > 0
      ? `<span class="chip chip-exceed">${isEN ? `${exceedN} exceeding` : `เกิน ${exceedN} ค่า`}</span>`
      : `<span class="chip chip-ok">${isEN ? 'Within limits' : 'อยู่ในเกณฑ์'}</span>`;

  let outlierTag = '';
  if (zThreshold > 0) {
    const { isOutlier } = computeOutlierStats(g.vals, zThreshold);
    const n = g.vals.filter(isOutlier).length;
    if (n > 0) outlierTag = `<span class="row-outlier-tag"><span class="chip chip-outlier">${n} ${isEN ? 'outlier' : 'ผิดปกติ'}${n > 1 ? 's' : ''}</span></span>`;
  }

  const dimCells = dims.map(d => `<td>${g.dims[d]}</td>`).join('');
  return `<tr class="${exceedN > 0 ? 'row-exceed' : ''}">
    <td class="param-cell">${g.pk}${outlierTag}</td>
    ${dimCells}
    <td>${g.unit || '—'}</td>
    <td class="num">${st.n}</td>
    <td class="num">${fmtVal(st.min)}</td>
    <td class="num">${fmtVal(st.max)}</td>
    <td class="num">${fmtVal(st.mean)}</td>
    <td class="num">${fmtVal(st.sd)}</td>
    <td>${status}</td>
  </tr>`;
}
