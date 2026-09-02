/**
 * comparisonUI.js — Tab 2 Comparison screen: value-summary method (Avg/
 * Mode/Median), 3 non-editable default comparison formats (Station vs
 * Reference / Location vs Baseline / Location vs Year), and up to 7
 * user-defined Custom Comparison items (items 4–10) built from freely
 * pairing a subject (Station/Location) against a reference kind
 * (Reference/Baseline/itself-in-another-year).
 */

import { LANG } from '../utils/lang.js';
import {
  getState, getParamCols, resolveCanonical, getDepthSummaryMethod, setDepthSummaryMethod,
  getCmpSettings, updateCmpSettings, getCustomCmp, addCustomCmp, updateCustomCmp, removeCustomCmp,
  getStatsMethod, setStatsMethod, getCustomCmpHistory, revertCustomCmpTo,
} from '../core/state.js';
import { TYPE_CFG } from '../core/standards.js';
import { compareStationVsRef, compareLocationVsBaseline, compareLocationVsYear, compareCustom, getAvailableYears } from '../core/comparisons.js';
import { fmtVal } from '../core/analysis.js';
import { wireSearch, wirePagination } from './tableControls.js';

const PAGE_SIZE = 20;
const CUSTOM_CMP_MAX = 7;
let activeFormat = 'stRef';
let builderOpen = null; // null | 'new' | <custom id being edited>

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const FORMATS = {
  stRef:   { th: 'Station vs Reference', en: 'Station vs Reference', groupLabel: { th: 'Station', en: 'Station' }, refLabel: { th: 'ค่า REF', en: 'REF value' } },
  locBase: { th: 'Location vs Baseline', en: 'Location vs Baseline', groupLabel: { th: 'Location', en: 'Location' }, refLabel: { th: 'ค่า Baseline', en: 'Baseline value' } },
  locYear: { th: 'Location vs Year', en: 'Location vs Year', groupLabel: { th: 'Location', en: 'Location' }, refLabel: { th: 'ค่าปีฐาน', en: 'Base year value' } },
};

const SUBJECT_LABEL = { station: { th: 'Station', en: 'Station' }, location: { th: 'Location', en: 'Location' } };
const REFKIND_LABEL = { reference: { th: 'Reference', en: 'Reference' }, baseline: { th: 'Baseline', en: 'Baseline' }, year: { th: 'ปีอื่น', en: 'another year' } };

function allParams(t) {
  return [...new Set(getParamCols(t).map(c => resolveCanonical(t, c)))].sort();
}

function fmtForCustom(def) {
  const refLabel = def.refKind === 'reference' ? { th: 'ค่า REF', en: 'REF value' }
    : def.refKind === 'baseline' ? { th: 'ค่า Baseline', en: 'Baseline value' }
    : { th: 'ค่าปีฐาน', en: 'Base year value' };
  return { groupLabel: SUBJECT_LABEL[def.subjectKind], refLabel };
}

function autoName(subjectKind, refKind, isEN) {
  const subj = isEN ? SUBJECT_LABEL[subjectKind].en : SUBJECT_LABEL[subjectKind].th;
  const ref = refKind === 'year' ? (isEN ? 'Year' : 'ปี') : (isEN ? REFKIND_LABEL[refKind].en : REFKIND_LABEL[refKind].th);
  return `${subj} vs ${ref}`;
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

  const customs = getCustomCmp(t);
  if (!FORMATS[activeFormat] && !customs.some(c => c.id === activeFormat)) activeFormat = 'stRef';
  const activeCustom = customs.find(c => c.id === activeFormat) || null;

  const isSea = TYPE_CFG[t].hasDepth;
  const aggTopbarHint = isSea
    ? (isEN ? 'Applies to every comparison below — depth readings are summarized per station first, then stations are summarized per Location.' : 'มีผลกับทุกรูปแบบด้านล่าง — สรุปค่าแต่ละความลึกในสถานีก่อน แล้วจึงสรุปค่าสถานีรวมเป็น Location')
    : (isEN ? 'Applies whenever multiple stations are combined into one Location value (e.g. Location vs Baseline/Year, or multiple REF/Baseline stations).' : 'มีผลเมื่อรวมค่าจากหลายสถานีเป็นค่าเดียวของ Location (เช่น Location vs Baseline/Year หรือเมื่อกำหนด REF/Baseline หลายสถานี)');

  const atCap = customs.length >= CUSTOM_CMP_MAX;
  root.innerHTML = `
    <div class="cmp-topbar">
      ${!activeCustom ? `<div class="pill-field"><label>${isEN ? 'Value summary method' : 'วิธีสรุปค่า'}</label>
        <select id="${t}-depth-method">
          <option value="avg">${isEN ? 'Average' : 'ค่าเฉลี่ย'}</option>
          <option value="mode">${isEN ? 'Mode' : 'ฐานนิยม'}</option>
          <option value="median">${isEN ? 'Median' : 'มัธยฐาน'}</option>
        </select>
      </div>` : ''}
      <div class="pill-field"><label title="${isEN ? 'Location-level comparisons only (Location vs Baseline/Year, or a location-subject Custom Comparison) — Station-level comparisons don\'t have enough raw readings to test meaningfully.' : 'ใช้ได้เฉพาะการเปรียบเทียบระดับ Location (Location vs Baseline/Year หรือ Custom Comparison ที่ subject เป็น Location) — ระดับ Station มีข้อมูลดิบไม่พอทดสอบทางสถิติ'}">${isEN ? 'Statistical test' : 'สถิติทดสอบ'}</label>
        <select id="${t}-stats-method">
          <option value="none">${isEN ? 'None' : 'ไม่ใช้'}</option>
          <option value="ttest">${isEN ? 't-test' : 't-test'}</option>
          <option value="mannwhitney">${isEN ? 'Mann-Whitney U' : 'Mann-Whitney U'}</option>
        </select>
      </div>
      ${!activeCustom ? `<div class="cmp-topbar-hint">${aggTopbarHint}</div>` : ''}
    </div>

    <div class="cmp-pills">
      ${Object.entries(FORMATS).map(([key, f]) => `<button type="button" class="cmp-pill ${key === activeFormat ? 'active' : ''}" data-cmp-fmt="${key}">${isEN ? f.en : f.th}</button>`).join('')}
      ${customs.map(c => `<button type="button" class="cmp-pill cmp-pill-custom ${c.id === activeFormat ? 'active' : ''}" data-cmp-fmt="${c.id}">${escHtml(c.name)}</button>`).join('')}
      <button type="button" class="cmp-pill cmp-pill-add" id="${t}-cmp-add-btn" ${atCap ? 'disabled' : ''} title="${atCap ? (isEN ? 'Maximum 10 formats total (3 default + 7 custom)' : 'สูงสุด 10 รูปแบบ (default 3 + custom 7)') : (isEN ? 'Add a custom comparison' : 'เพิ่มการเปรียบเทียบแบบกำหนดเอง')}">+ ${isEN ? 'Add' : 'เพิ่ม'}</button>
      <div class="history-toggle">
        <button type="button" class="btn" id="${t}-cc-hist-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>
          ${isEN ? 'History' : 'ประวัติ'}
        </button>
        <div class="history-popover" id="${t}-cc-hist-popover"></div>
      </div>
    </div>

    <div id="${t}-cmp-builder"></div>
    <div class="cmp-settings-strip" id="${t}-cmp-settings"></div>
    <div class="table-card" id="${t}-cmp-table-card"></div>
  `;

  if (!activeCustom) {
    const depthSel = document.getElementById(`${t}-depth-method`);
    depthSel.value = getDepthSummaryMethod(t);
    depthSel.addEventListener('change', () => { setDepthSummaryMethod(t, depthSel.value); renderFormat(t); });
  }

  const statsSel = document.getElementById(`${t}-stats-method`);
  statsSel.value = getStatsMethod(t);
  statsSel.addEventListener('change', () => { setStatsMethod(t, statsSel.value); renderFormat(t); });

  root.querySelectorAll('.cmp-pill:not(.cmp-pill-add)').forEach(btn => btn.addEventListener('click', () => {
    activeFormat = btn.dataset.cmpFmt;
    builderOpen = null;
    renderComparisonUI(t);
  }));

  document.getElementById(`${t}-cmp-add-btn`).addEventListener('click', () => {
    if (atCap) return;
    builderOpen = 'new';
    renderBuilder(t);
  });

  wireHistoryPopover(t);

  if (builderOpen) renderBuilder(t);
  renderFormat(t);
}

/** Bilingual summary text for one history entry — mirrors
    standardsUI.js's formatHistoryEntry; state.js itself stores no display
    strings. Custom comparisons already carry a user-given `name`. */
function formatHistoryEntry(e, isEN) {
  if (e.action === 'start') return isEN ? 'Session start' : 'เริ่มต้น session';
  if (e.action === 'revert') return isEN ? 'Reverted to a previous version' : 'ย้อนกลับไปยังเวอร์ชันก่อนหน้า';
  const verb = { add: isEN ? 'Added' : 'เพิ่ม', update: isEN ? 'Edited' : 'แก้ไข', remove: isEN ? 'Removed' : 'ลบ' }[e.action];
  return `${verb} "${escHtml(e.meta.name)}"`;
}

function formatTime(at) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderHistoryPopover(t) {
  const isEN = LANG === 'en';
  const popover = document.getElementById(`${t}-cc-hist-popover`);
  if (!popover) return;
  const history = getCustomCmpHistory(t);
  if (!history.length) {
    popover.innerHTML = `<div class="history-empty">${isEN ? 'No edits yet this session.' : 'ยังไม่มีการแก้ไขใน session นี้'}</div>`;
    return;
  }
  const lastIdx = history.length - 1;
  popover.innerHTML = [...history].reverse().map((e, revIdx) => {
    const idx = lastIdx - revIdx;
    const isCurrent = idx === lastIdx;
    return `<div class="history-row">
      <div class="history-row-main">
        <div class="history-row-summary">${formatHistoryEntry(e, isEN)}</div>
        <div class="history-row-time">${formatTime(e.at)}</div>
      </div>
      ${isCurrent
        ? `<span class="history-row-current">${isEN ? 'Current' : 'ปัจจุบัน'}</span>`
        : `<button type="button" class="history-row-revert" data-id="${e.id}">${isEN ? 'Revert' : 'ย้อนกลับ'}</button>`}
    </div>`;
  }).join('');
  popover.querySelectorAll('.history-row-revert').forEach(btn => btn.addEventListener('click', () => {
    revertCustomCmpTo(t, btn.dataset.id);
    if (!FORMATS[activeFormat] && !getCustomCmp(t).some(c => c.id === activeFormat)) activeFormat = 'stRef';
    builderOpen = null;
    renderComparisonUI(t);
    document.getElementById(`${t}-cc-hist-popover`)?.classList.add('open');
  }));
}

// Closes any open .history-popover on an outside click — see the matching
// comment in standardsUI.js for why this is registered once at module
// load rather than per-render.
document.addEventListener('click', e => {
  document.querySelectorAll('.history-popover.open').forEach(p => {
    if (!p.closest('.history-toggle')?.contains(e.target)) p.classList.remove('open');
  });
});

function wireHistoryPopover(t) {
  const btn = document.getElementById(`${t}-cc-hist-toggle`);
  const popover = document.getElementById(`${t}-cc-hist-popover`);
  if (!btn || !popover) return;
  renderHistoryPopover(t);
  btn.addEventListener('click', e => {
    e.stopPropagation();
    popover.classList.toggle('open');
  });
}

function renderBuilder(t) {
  const isEN = LANG === 'en';
  const container = document.getElementById(`${t}-cmp-builder`);
  if (!container) return;
  const editing = builderOpen !== 'new' ? getCustomCmp(t).find(c => c.id === builderOpen) : null;
  const subjectKind = editing?.subjectKind || 'station';
  const refKind = editing?.refKind || 'reference';

  container.innerHTML = `
    <div class="std-form-card cmp-builder-card">
      <div class="std-form-title">${editing ? (isEN ? 'Edit comparison' : 'แก้ไขการเปรียบเทียบ') : (isEN ? 'New custom comparison' : 'สร้างการเปรียบเทียบใหม่')}</div>
      <div class="std-form-row">
        <div class="field-g field-g-lg">
          <label>${isEN ? 'Name' : 'ชื่อ'}</label>
          <input type="text" id="${t}-ccb-name" value="${escHtml(editing?.name || '')}" placeholder="${escHtml(autoName(subjectKind, refKind, isEN))}">
        </div>
        <div class="field-g field-g-sm">
          <label>${isEN ? 'Compare' : 'เทียบ'}</label>
          <select id="${t}-ccb-subject">
            <option value="station" ${subjectKind === 'station' ? 'selected' : ''}>${isEN ? 'Station' : 'Station'}</option>
            <option value="location" ${subjectKind === 'location' ? 'selected' : ''}>${isEN ? 'Location' : 'Location'}</option>
          </select>
        </div>
        <div class="field-g field-g-sm">
          <label>${isEN ? 'Against' : 'กับ'}</label>
          <select id="${t}-ccb-refkind">
            <option value="reference" ${refKind === 'reference' ? 'selected' : ''}>${isEN ? 'Reference' : 'Reference'}</option>
            <option value="baseline" ${refKind === 'baseline' ? 'selected' : ''}>${isEN ? 'Baseline' : 'Baseline'}</option>
            <option value="year" ${refKind === 'year' ? 'selected' : ''}>${isEN ? 'Itself, another year' : 'ตัวเองในปีอื่น'}</option>
          </select>
        </div>
        <button class="btn btn-primary std-add-btn" id="${t}-ccb-save">${isEN ? 'Save' : 'บันทึก'}</button>
        <button class="btn std-add-btn" id="${t}-ccb-cancel">${isEN ? 'Cancel' : 'ยกเลิก'}</button>
      </div>
      <div class="std-form-err" id="${t}-ccb-err"></div>
    </div>`;

  const nameEl = document.getElementById(`${t}-ccb-name`);
  const subjEl = document.getElementById(`${t}-ccb-subject`);
  const refEl = document.getElementById(`${t}-ccb-refkind`);
  const updatePlaceholder = () => { nameEl.placeholder = autoName(subjEl.value, refEl.value, isEN); };
  subjEl.addEventListener('change', updatePlaceholder);
  refEl.addEventListener('change', updatePlaceholder);

  document.getElementById(`${t}-ccb-cancel`).addEventListener('click', () => {
    builderOpen = null;
    renderComparisonUI(t);
  });

  document.getElementById(`${t}-ccb-save`).addEventListener('click', () => {
    const errEl = document.getElementById(`${t}-ccb-err`);
    const name = nameEl.value.trim();
    if (!name) { errEl.textContent = isEN ? 'Enter a name.' : 'กรอกชื่อ'; return; }
    const patch = { name, subjectKind: subjEl.value, refKind: refEl.value };
    if (editing) {
      updateCustomCmp(t, editing.id, patch);
      activeFormat = editing.id;
    } else {
      const id = addCustomCmp(t, patch);
      if (!id) { errEl.textContent = isEN ? 'Maximum 10 formats reached.' : 'ครบจำนวนสูงสุด 10 รูปแบบแล้ว'; return; }
      activeFormat = id;
    }
    builderOpen = null;
    renderComparisonUI(t);
  });
}

function renderFormat(t) {
  const customs = getCustomCmp(t);
  const activeCustom = customs.find(c => c.id === activeFormat);
  if (activeCustom) { renderCustomFormat(t, activeCustom); return; }

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
  const showStats = (activeFormat === 'locBase' || activeFormat === 'locYear') && getStatsMethod(t) !== 'none';
  const searchEl = document.getElementById(`${t}-cmp-search`);
  wireSearch(searchEl, rows,
    (r, q) => r.pk.toLowerCase().includes(q) || r.group.toLowerCase().includes(q),
    filtered => renderTable(t, tableCard, filtered, fmt, showStats)
  );
}

function renderCustomFormat(t, def) {
  const isEN = LANG === 'en';
  const stripEl = document.getElementById(`${t}-cmp-settings`);
  const tableCard = document.getElementById(`${t}-cmp-table-card`);
  if (!stripEl || !tableCard) return;

  const aggSelectHtml = `
    <div class="pill-field"><label>${isEN ? 'Summary method' : 'วิธีสรุปค่า'}</label>
      <select id="${t}-cmp-agg">
        <option value="avg" ${def.aggMethod === 'avg' ? 'selected' : ''}>${isEN ? 'Average' : 'ค่าเฉลี่ย'}</option>
        <option value="mode" ${def.aggMethod === 'mode' ? 'selected' : ''}>${isEN ? 'Mode' : 'ฐานนิยม'}</option>
        <option value="median" ${def.aggMethod === 'median' ? 'selected' : ''}>${isEN ? 'Median' : 'มัธยฐาน'}</option>
      </select>
    </div>`;
  const actionsHtml = `
    <div class="cmp-item-actions">
      <button type="button" class="icon-btn" id="${t}-cmp-edit" title="${isEN ? 'Edit' : 'แก้ไข'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button type="button" class="icon-btn" id="${t}-cmp-del" title="${isEN ? 'Delete' : 'ลบ'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
    </div>`;

  if (def.refKind === 'year') {
    const years = getAvailableYears(t);
    stripEl.innerHTML = `
      <div class="pill-field"><label>${isEN ? 'Base year' : 'ปีตั้งต้น'}</label>
        <select id="${t}-cmp-baseyear">
          <option value="">${isEN ? '— select —' : '— เลือก —'}</option>
          ${years.map(y => `<option value="${y}" ${String(def.baseYear) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>
      <div class="pill-field"><label>${isEN ? 'Threshold %' : 'Threshold %'}</label><input type="number" id="${t}-cmp-threshold" min="0" step="1" value="${def.threshold}"></div>
      ${aggSelectHtml}
      <div class="search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" id="${t}-cmp-search" placeholder="${isEN ? 'Search parameter, group…' : 'ค้นหา parameter, group…'}"></div>
      ${actionsHtml}`;
    document.getElementById(`${t}-cmp-baseyear`).addEventListener('change', e => { updateCustomCmp(t, def.id, { baseYear: e.target.value || null }); renderFormat(t); });
  } else {
    const refWord = isEN ? REFKIND_LABEL[def.refKind].en : REFKIND_LABEL[def.refKind].th;
    stripEl.innerHTML = `
      <div class="pill-field"><label>${isEN ? 'Reference year' : 'ปีของค่าอ้างอิง'}</label>
        <select id="${t}-cmp-yearmode">
          <option value="match" ${def.yearMode === 'match' ? 'selected' : ''}>${isEN ? 'Same year as data' : 'ปีเดียวกับข้อมูล'}</option>
          <option value="fixed" ${def.yearMode === 'fixed' ? 'selected' : ''}>${isEN ? 'One fixed year' : 'ปีที่เลือกไว้ตายตัว'}</option>
        </select>
      </div>
      ${def.yearMode === 'fixed' ? `<div class="pill-field"><label>${isEN ? `${refWord} year` : `ปีของ ${refWord}`}</label>
        <select id="${t}-cmp-fixedyear">
          <option value="">${isEN ? '— select —' : '— เลือก —'}</option>
          ${getAvailableYears(t).map(y => `<option value="${y}" ${String(def.fixedYear) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="pill-field"><label>${isEN ? 'Threshold %' : 'Threshold %'}</label><input type="number" id="${t}-cmp-threshold" min="0" step="1" value="${def.threshold}"></div>
      ${aggSelectHtml}
      <div class="search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" id="${t}-cmp-search" placeholder="${isEN ? 'Search parameter, group…' : 'ค้นหา parameter, group…'}"></div>
      ${actionsHtml}`;
    document.getElementById(`${t}-cmp-yearmode`).addEventListener('change', e => { updateCustomCmp(t, def.id, { yearMode: e.target.value }); renderFormat(t); });
    document.getElementById(`${t}-cmp-fixedyear`)?.addEventListener('change', e => { updateCustomCmp(t, def.id, { fixedYear: e.target.value || null }); renderFormat(t); });
  }

  document.getElementById(`${t}-cmp-threshold`).addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { updateCustomCmp(t, def.id, { threshold: v }); renderFormat(t); }
  });
  document.getElementById(`${t}-cmp-agg`).addEventListener('change', e => { updateCustomCmp(t, def.id, { aggMethod: e.target.value }); renderFormat(t); });
  document.getElementById(`${t}-cmp-edit`).addEventListener('click', () => { builderOpen = def.id; renderComparisonUI(t); });
  document.getElementById(`${t}-cmp-del`).addEventListener('click', () => {
    removeCustomCmp(t, def.id);
    activeFormat = 'stRef';
    renderComparisonUI(t);
  });

  const rows = allParams(t).flatMap(pk => compareCustom(t, pk, def).map(r => ({ pk, ...r })));
  const searchEl = document.getElementById(`${t}-cmp-search`);
  const fmt = fmtForCustom(def);
  const showStats = def.subjectKind === 'location' && getStatsMethod(t) !== 'none';
  wireSearch(searchEl, rows,
    (r, q) => r.pk.toLowerCase().includes(q) || r.group.toLowerCase().includes(q),
    filtered => renderTable(t, tableCard, filtered, fmt, showStats)
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

function renderTable(t, tableCard, rows, fmt, showStats) {
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
          ${showStats ? `<th>${isEN ? 'Significance' : 'นัยสำคัญ'}</th>` : ''}
        </tr></thead>
        <tbody id="${t}-cmp-tbody"></tbody>
      </table>
    </div>
    <div class="table-foot"><div id="${t}-cmp-page"></div></div>`;

  const tbody = document.getElementById(`${t}-cmp-tbody`);
  wirePagination(document.getElementById(`${t}-cmp-page`), rows, PAGE_SIZE, pageRows => {
    tbody.innerHTML = pageRows.map(r => rowHtml(r, isEN, showStats)).join('');
  });
}

function pValueChip(r, isEN) {
  if (!r.sampleN) return '';
  if (r.pValue == null) {
    return `<span class="chip chip-unset" title="n=${r.sampleN.a}, ${r.sampleN.b}">${isEN ? 'n too low' : 'n น้อยไป'}</span>`;
  }
  const sig = r.pValue < 0.05;
  const label = isEN ? (sig ? 'Significant' : 'Not significant') : (sig ? 'มีนัยสำคัญ' : 'ไม่มีนัยสำคัญ');
  return `<span class="chip ${sig ? 'chip-exceed' : 'chip-ok'}" title="n=${r.sampleN.a}, ${r.sampleN.b}">${label} (p=${r.pValue.toFixed(3)})</span>`;
}

function rowHtml(r, isEN, showStats) {
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
    ${showStats ? `<td>${pValueChip(r, isEN)}</td>` : ''}
  </tr>`;
}
