/**
 * comparisonUI.js — Tab 2 Comparison screen: depth-summary method (sea),
 * 3 default comparison formats (Station vs Reference / Location vs
 * Baseline / Location vs Year), each with its own settings + results table.
 * Custom Comparison builder (items 4–10) is deferred to a follow-up round.
 */

import { LANG } from '../utils/lang.js';
import { getState, getParamCols, resolveCanonical, getDepthSummaryMethod, setDepthSummaryMethod, getCmpSettings, updateCmpSettings } from '../core/state.js';
import { TYPE_CFG } from '../core/standards.js';
import { compareStationVsRef, compareLocationVsBaseline, compareLocationVsYear, getAvailableYears } from '../core/comparisons.js';
import { fmtVal } from '../core/analysis.js';
import { wireSearch, wirePagination } from './tableControls.js';

const PAGE_SIZE = 20;
let activeFormat = 'stRef';

const FORMATS = {
  stRef:   { th: 'Station vs Reference', en: 'Station vs Reference', groupLabel: { th: 'Station', en: 'Station' }, refLabel: { th: 'ค่า REF', en: 'REF value' } },
  locBase: { th: 'Location vs Baseline', en: 'Location vs Baseline', groupLabel: { th: 'Location', en: 'Location' }, refLabel: { th: 'ค่า Baseline', en: 'Baseline value' } },
  locYear: { th: 'Location vs Year', en: 'Location vs Year', groupLabel: { th: 'Location', en: 'Location' }, refLabel: { th: 'ค่าปีฐาน', en: 'Base year value' } },
};

function allParams(t) {
  return [...new Set(getParamCols(t).map(c => resolveCanonical(t, c)))].sort();
}

export function renderComparisonUI(t) {
  const root = document.getElementById(`${t}-comparison-root`);
  if (!root) return;
  const isEN = LANG === 'en';
  const state = getState(t);

  if (!state.analyzed || !state.rows.length) {
    root.innerHTML = `<div class="empty-state"><p>${isEN ? 'Run analysis first.' : 'วิเคราะห์ข้อมูลก่อน'}</p></div>`;
    return;
  }

  const isSea = TYPE_CFG[t].hasDepth;
  root.innerHTML = `
    ${isSea ? `<div class="cmp-topbar">
      <div class="pill-field"><label>${isEN ? 'Depth summary' : 'สรุปตามความลึก'}</label>
        <select id="${t}-depth-method">
          <option value="avg">${isEN ? 'Average' : 'ค่าเฉลี่ย'}</option>
          <option value="mode">${isEN ? 'Mode' : 'ฐานนิยม'}</option>
          <option value="median">${isEN ? 'Median' : 'มัธยฐาน'}</option>
        </select>
      </div>
      <div class="cmp-topbar-hint">${isEN ? 'Applies to every comparison below — every station value is depth-summarized first.' : 'มีผลกับทุกรูปแบบด้านล่าง — ทุกค่าของสถานีจะถูกสรุปตามความลึกก่อนเสมอ'}</div>
    </div>` : ''}

    <div class="cmp-pills">
      ${Object.entries(FORMATS).map(([key, f]) => `<button type="button" class="cmp-pill ${key === activeFormat ? 'active' : ''}" data-cmp-fmt="${key}">${isEN ? f.en : f.th}</button>`).join('')}
    </div>

    <div class="cmp-settings-strip" id="${t}-cmp-settings"></div>
    <div class="table-card" id="${t}-cmp-table-card"></div>
  `;

  if (isSea) {
    const sel = document.getElementById(`${t}-depth-method`);
    sel.value = getDepthSummaryMethod(t);
    sel.addEventListener('change', () => { setDepthSummaryMethod(t, sel.value); renderFormat(t); });
  }

  root.querySelectorAll('.cmp-pill').forEach(btn => btn.addEventListener('click', () => {
    activeFormat = btn.dataset.cmpFmt;
    root.querySelectorAll('.cmp-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderFormat(t);
  }));

  renderFormat(t);
}

function renderFormat(t) {
  const isEN = LANG === 'en';
  const fmt = FORMATS[activeFormat];
  const settings = getCmpSettings(t)[activeFormat];
  const stripEl = document.getElementById(`${t}-cmp-settings`);
  const tableCard = document.getElementById(`${t}-cmp-table-card`);
  if (!stripEl || !tableCard) return;

  if (activeFormat === 'locYear') {
    const years = getAvailableYears(t);
    stripEl.innerHTML = `
      <div class="pill-field"><label>${isEN ? 'Base year' : 'ปีตั้งต้น'}</label>
        <select id="${t}-cmp-baseyear">
          <option value="">${isEN ? '— select —' : '— เลือก —'}</option>
          ${years.map(y => `<option value="${y}" ${String(settings.baseYear) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>
      <div class="pill-field"><label>${isEN ? 'Threshold %' : 'Threshold %'}</label><input type="number" id="${t}-cmp-threshold" min="0" step="1" value="${settings.threshold}"></div>
      <div class="search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" id="${t}-cmp-search" placeholder="${isEN ? 'Search parameter, location…' : 'ค้นหา parameter, location…'}"></div>`;
    document.getElementById(`${t}-cmp-baseyear`).addEventListener('change', e => { updateCmpSettings(t, activeFormat, { baseYear: e.target.value || null }); renderFormat(t); });
  } else {
    const refWord = isEN ? fmt.refLabel.en.replace(' value', '') : (activeFormat === 'stRef' ? 'REF' : 'Baseline');
    const matchHint = isEN
      ? `${refWord} value is taken from the same year as the row being compared.`
      : `ดึงค่า ${refWord} จากปีเดียวกับข้อมูลที่นำมาเทียบ (ปีไหนก็เทียบกับปีนั้น)`;
    const fixedHint = isEN
      ? `${refWord} value always comes from one year you pick below, no matter which year is being compared.`
      : `ดึงค่า ${refWord} จากปีที่เลือกไว้ปีเดียวเสมอ ไม่ว่าข้อมูลที่เทียบจะเป็นปีไหนก็ตาม`;
    stripEl.innerHTML = `
      <div class="pill-field"><label>${isEN ? 'Reference year' : 'ปีของค่าอ้างอิง'}</label>
        <select id="${t}-cmp-yearmode">
          <option value="match" ${settings.yearMode === 'match' ? 'selected' : ''}>${isEN ? 'Same year as data' : 'ปีเดียวกับข้อมูล'}</option>
          <option value="fixed" ${settings.yearMode === 'fixed' ? 'selected' : ''}>${isEN ? 'One fixed year' : 'ปีที่เลือกไว้ตายตัว'}</option>
        </select>
      </div>
      ${settings.yearMode === 'fixed' ? `<div class="pill-field"><label>${isEN ? `${refWord} year` : `ปีของ ${refWord}`}</label>
        <select id="${t}-cmp-fixedyear">
          <option value="">${isEN ? '— select —' : '— เลือก —'}</option>
          ${getAvailableYears(t).map(y => `<option value="${y}" ${String(settings.fixedYear) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="pill-field"><label>${isEN ? 'Threshold %' : 'Threshold %'}</label><input type="number" id="${t}-cmp-threshold" min="0" step="1" value="${settings.threshold}"></div>
      <div class="search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" id="${t}-cmp-search" placeholder="${isEN ? 'Search parameter, group…' : 'ค้นหา parameter, group…'}"></div>
      <div class="cmp-yearmode-hint">${settings.yearMode === 'fixed' ? fixedHint : matchHint}</div>`;
    document.getElementById(`${t}-cmp-yearmode`).addEventListener('change', e => { updateCmpSettings(t, activeFormat, { yearMode: e.target.value }); renderFormat(t); });
    document.getElementById(`${t}-cmp-fixedyear`)?.addEventListener('change', e => { updateCmpSettings(t, activeFormat, { fixedYear: e.target.value || null }); renderFormat(t); });
  }
  document.getElementById(`${t}-cmp-threshold`).addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { updateCmpSettings(t, activeFormat, { threshold: v }); renderFormat(t); }
  });

  const rows = computeAll(t, activeFormat, getCmpSettings(t)[activeFormat]);
  const searchEl = document.getElementById(`${t}-cmp-search`);
  wireSearch(searchEl, rows,
    (r, q) => r.pk.toLowerCase().includes(q) || r.group.toLowerCase().includes(q),
    filtered => renderTable(t, tableCard, filtered, fmt)
  );
}

function computeFn(formatKey) {
  return { stRef: compareStationVsRef, locBase: compareLocationVsBaseline, locYear: compareLocationVsYear }[formatKey];
}

function computeAll(t, formatKey, settings) {
  const fn = computeFn(formatKey);
  const out = [];
  allParams(t).forEach(pk => {
    fn(t, pk, settings).forEach(r => out.push({ pk, ...r }));
  });
  return out;
}

function renderTable(t, tableCard, rows, fmt) {
  const isEN = LANG === 'en';
  if (!rows.length) {
    tableCard.innerHTML = `<div class="empty-state"><p>${isEN ? 'No rows match.' : 'ไม่มีข้อมูลตรงกับเงื่อนไข'}</p></div>`;
    return;
  }
  rows.sort((a, b) => a.pk.localeCompare(b.pk) || a.group.localeCompare(b.group) || (a.yr ?? 0) - (b.yr ?? 0));

  const groupLabel = isEN ? fmt.groupLabel.en : fmt.groupLabel.th;
  const refLabel = isEN ? fmt.refLabel.en : fmt.refLabel.th;
  tableCard.innerHTML = `
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th>Parameter</th><th>${groupLabel}</th><th>${isEN ? 'Year' : 'ปี'}</th>
          <th class="num">${isEN ? 'Value' : 'ค่า'}</th><th class="num">${refLabel}</th>
          <th class="num">% ${isEN ? 'diff' : 'ต่าง'}</th><th>${isEN ? 'Status' : 'สถานะ'}</th>
        </tr></thead>
        <tbody id="${t}-cmp-tbody"></tbody>
      </table>
    </div>
    <div class="table-foot"><div id="${t}-cmp-page"></div></div>`;

  const tbody = document.getElementById(`${t}-cmp-tbody`);
  wirePagination(document.getElementById(`${t}-cmp-page`), rows, PAGE_SIZE, pageRows => {
    tbody.innerHTML = pageRows.map(r => rowHtml(r, isEN)).join('');
  });
}

function rowHtml(r, isEN) {
  const statusChip = r.status === 'no_ref'
    ? `<span class="chip chip-unset">${isEN ? 'Not set' : 'ยังไม่กำหนด'}</span>`
    : r.status === 'different'
      ? `<span class="chip chip-exceed">${isEN ? 'Different' : 'ต่าง'}</span>`
      : `<span class="chip chip-ok">${isEN ? 'Close' : 'ใกล้เคียง'}</span>`;
  return `<tr class="${r.status === 'different' ? 'row-exceed' : ''}">
    <td class="param-cell">${r.pk}</td>
    <td>${r.group}</td>
    <td>${r.yr ?? '—'}</td>
    <td class="num">${fmtVal(r.compareVal)}</td>
    <td class="num">${r.refVal != null ? fmtVal(r.refVal) : '—'}</td>
    <td class="num">${r.pctDiff != null && isFinite(r.pctDiff) ? (r.pctDiff >= 0 ? '+' : '') + r.pctDiff.toFixed(1) + '%' : '—'}</td>
    <td>${statusChip}</td>
  </tr>`;
}
