/**
 * standardsUI.js — Standards Management screen (spec §8: its own dedicated
 * screen, not folded into a generic settings modal). Add/edit/delete
 * standards, each with a value, direction (max/min), unit, source, and an
 * optional per-parameter decimal-display override.
 */

import { LANG } from '../utils/lang.js';
import {
  getState, getStandards, addStandard, updateStandard, removeStandard, getParamCols, resolveCanonical,
  getStandardsHistory, revertStandardsTo,
} from '../core/state.js';
import { sortStdEntriesBySeverity } from '../core/analysis.js';
import { wireSearch, wirePagination } from './tableControls.js';

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const PAGE_SIZE = 10;

function paramSuggestions(t) {
  const cols = getParamCols(t);
  return [...new Set(cols.map(c => resolveCanonical(t, c)))].sort();
}

export function renderStandardsUI(t) {
  const root = document.getElementById(`${t}-standards-root`);
  if (!root) return;
  const isEN = LANG === 'en';
  const suggestions = paramSuggestions(t);

  root.innerHTML = `
    <div class="std-form-card">
      <div class="std-form-title">${isEN ? 'Add a standard' : 'เพิ่มมาตรฐานใหม่'}</div>
      <div class="std-form-row">
        <div class="field-g">
          <label>${isEN ? 'Parameter' : 'Parameter'}</label>
          <input type="text" id="${t}-std-param" list="${t}-std-param-list" placeholder="${isEN ? 'e.g. Arsenic' : 'เช่น Arsenic'}">
          <datalist id="${t}-std-param-list">${suggestions.map(p => `<option value="${escHtml(p)}">`).join('')}</datalist>
        </div>
        <div class="field-g field-g-sm">
          <label>${isEN ? 'Direction' : 'ทิศทาง'}</label>
          <select id="${t}-std-dir">
            <option value="max">${isEN ? 'Max (not to exceed)' : 'ค่าสูงสุด (ห้ามเกิน)'}</option>
            <option value="min">${isEN ? 'Min (not to fall below)' : 'ค่าต่ำสุด (ห้ามต่ำกว่า)'}</option>
          </select>
        </div>
        <div class="field-g field-g-sm">
          <label title="${isEN ? 'Optional. Set this to bind more than one severity level to the same parameter (e.g. Watch + Critical) — leave blank for a single standard' : 'ไม่บังคับ ใช้เมื่อต้องการตั้งมาตรฐานหลายระดับให้ parameter เดียวกัน (เช่น เฝ้าระวัง + วิกฤต) — เว้นว่างถ้ามีมาตรฐานเดียว'}">${isEN ? 'Tier' : 'ระดับ'}</label>
          <input type="text" id="${t}-std-tier" placeholder="${isEN ? 'e.g. Watch' : 'เช่น เฝ้าระวัง'}">
        </div>
        <div class="field-g field-g-sm">
          <label>${isEN ? 'Value' : 'ค่า'}</label>
          <input type="number" step="any" id="${t}-std-value" placeholder="0">
        </div>
        <div class="field-g field-g-sm">
          <label>${isEN ? 'Unit' : 'หน่วย'}</label>
          <input type="text" id="${t}-std-unit" placeholder="µg/L">
        </div>
        <div class="field-g field-g-sm">
          <label>${isEN ? 'Decimals' : 'ทศนิยม'}</label>
          <input type="number" min="0" max="8" id="${t}-std-dec" placeholder="auto">
        </div>
        <div class="field-g field-g-sm">
          <label title="${isEN ? 'Used for BDL readings reported with no limit (e.g. bare \'ND\'), when the BDL method is \'Half detection limit\'' : 'ใช้เมื่อค่า BDL ในไฟล์ไม่ระบุตัวเลข limit มาด้วย (เช่น "ND" เฉยๆ) และเลือกวิธี BDL เป็น "ครึ่งหนึ่งของ limit"'}">${isEN ? 'Fallback DL' : 'DL สำรอง'}</label>
          <input type="number" step="any" min="0" id="${t}-std-bdl" placeholder="${isEN ? 'none' : 'ไม่มี'}">
        </div>
        <div class="field-g field-g-lg">
          <label>${isEN ? 'Source' : 'แหล่งที่มา'}</label>
          <input type="text" id="${t}-std-source" placeholder="${isEN ? 'e.g. PCD 2564, Marine Water Quality Standard' : 'เช่น ประกาศ คพ. 2564'}">
        </div>
        <button class="btn btn-primary std-add-btn" id="${t}-std-add">${isEN ? 'Add' : 'เพิ่ม'}</button>
      </div>
      <div class="std-form-err" id="${t}-std-err"></div>
    </div>

    <div class="table-card std-table-card">
      <div class="std-table-toolbar">
        <div class="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="${t}-std-search" placeholder="${isEN ? 'Search parameter or source…' : 'ค้นหา parameter หรือแหล่งที่มา…'}">
        </div>
        <span class="std-count" id="${t}-std-count"></span>
        <div class="history-toggle">
          <button type="button" class="btn" id="${t}-std-hist-toggle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>
            ${isEN ? 'History' : 'ประวัติ'}
          </button>
          <div class="history-popover" id="${t}-std-hist-popover"></div>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>${isEN ? 'Parameter' : 'Parameter'}</th><th>${isEN ? 'Tier' : 'ระดับ'}</th>
            <th>${isEN ? 'Direction' : 'ทิศทาง'}</th>
            <th class="num">${isEN ? 'Value' : 'ค่า'}</th><th>${isEN ? 'Unit' : 'หน่วย'}</th>
            <th>${isEN ? 'Source' : 'แหล่งที่มา'}</th><th class="num">${isEN ? 'Decimals' : 'ทศนิยม'}</th>
            <th class="num">${isEN ? 'Fallback DL' : 'DL สำรอง'}</th>
            <th></th>
          </tr></thead>
          <tbody id="${t}-std-tbody"></tbody>
        </table>
      </div>
      <div class="table-foot"><div id="${t}-std-page"></div></div>
    </div>`;

  wireAddForm(t);
  renderTable(t);
  wireHistoryPopover(t);
}

/** Bilingual summary text for one history entry — the only place in this
    file that turns an { action, meta } record into display text; state.js
    itself stores no display strings. */
function formatHistoryEntry(e, isEN) {
  if (e.action === 'start') return isEN ? 'Session start' : 'เริ่มต้น session';
  if (e.action === 'revert') return isEN ? 'Reverted to a previous version' : 'ย้อนกลับไปยังเวอร์ชันก่อนหน้า';
  const verb = { add: isEN ? 'Added' : 'เพิ่ม', update: isEN ? 'Edited' : 'แก้ไข', remove: isEN ? 'Removed' : 'ลบ' }[e.action];
  const tierPart = e.meta.tier ? ` (${escHtml(e.meta.tier)})` : '';
  return `${verb} ${escHtml(e.meta.parameter)}${tierPart}`;
}

function formatTime(at) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderHistoryPopover(t) {
  const isEN = LANG === 'en';
  const popover = document.getElementById(`${t}-std-hist-popover`);
  if (!popover) return;
  const history = getStandardsHistory(t);
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
    revertStandardsTo(t, btn.dataset.id);
    renderStandardsUI(t);
    document.getElementById(`${t}-std-hist-popover`)?.classList.add('open');
    window.dispatchEvent(new CustomEvent('aer-standards-changed', { detail: { t } }));
  }));
}

// Closes any open .history-popover on an outside click. Registered once at
// module load (not per-render, unlike the button's own toggle listener
// below) — renderStandardsUI replaces the popover/button DOM nodes on
// every edit, so a per-render document listener here would accumulate.
document.addEventListener('click', e => {
  document.querySelectorAll('.history-popover.open').forEach(p => {
    if (!p.closest('.history-toggle')?.contains(e.target)) p.classList.remove('open');
  });
});

function wireHistoryPopover(t) {
  const btn = document.getElementById(`${t}-std-hist-toggle`);
  const popover = document.getElementById(`${t}-std-hist-popover`);
  if (!btn || !popover) return;
  renderHistoryPopover(t);
  btn.addEventListener('click', e => {
    e.stopPropagation();
    popover.classList.toggle('open');
  });
}

/** Whether a candidate {parameter, tier, direction} entry can be added/saved
    alongside `siblings` (every other existing entry for that parameter,
    i.e. excluding the one being edited if this is an edit) — enforces
    unambiguous multi-tier state: every entry for a parameter with more
    than one tier must have a distinct, non-blank tier label, and share the
    same direction. Returns an error string, or null if valid. */
function tierValidationError(siblings, candidate, isEN) {
  if (!siblings.length) return null; // first entry for this parameter — blank tier is fine
  const blankSibling = siblings.find(s => !s.tier);
  if (blankSibling) {
    return isEN
      ? 'This parameter already has an untiered standard — edit it below to give it a tier label first.'
      : 'Parameter นี้มีมาตรฐานแบบไม่ระบุระดับอยู่แล้ว — แก้ไขรายการนั้นให้มีชื่อระดับก่อน';
  }
  if (!candidate.tier) {
    return isEN
      ? 'This parameter already has tiered standards — enter a tier label to add another.'
      : 'Parameter นี้มีมาตรฐานหลายระดับอยู่แล้ว — กรอกชื่อระดับเพื่อเพิ่มอีกระดับ';
  }
  if (siblings.some(s => s.tier === candidate.tier)) {
    return isEN
      ? 'This tier already exists for this parameter — edit it below instead.'
      : 'ระดับนี้มีอยู่แล้วสำหรับ parameter นี้ — แก้ไขในตารางด้านล่างแทน';
  }
  if (siblings[0].direction !== candidate.direction) {
    return isEN
      ? "This tier's direction must match the parameter's existing standards."
      : 'ทิศทางของระดับนี้ต้องตรงกับทิศทางมาตรฐานเดิมของ parameter นี้';
  }
  return null;
}

function wireAddForm(t) {
  const isEN = LANG === 'en';
  const addBtn = document.getElementById(`${t}-std-add`);
  addBtn.addEventListener('click', () => {
    const paramEl = document.getElementById(`${t}-std-param`);
    const valueEl = document.getElementById(`${t}-std-value`);
    const unitEl = document.getElementById(`${t}-std-unit`);
    const sourceEl = document.getElementById(`${t}-std-source`);
    const decEl = document.getElementById(`${t}-std-dec`);
    const bdlEl = document.getElementById(`${t}-std-bdl`);
    const dirEl = document.getElementById(`${t}-std-dir`);
    const tierEl = document.getElementById(`${t}-std-tier`);
    const errEl = document.getElementById(`${t}-std-err`);
    errEl.textContent = '';

    const parameter = paramEl.value.trim();
    const value = parseFloat(valueEl.value);
    const tier = tierEl.value.trim();
    if (!parameter) { errEl.textContent = isEN ? 'Enter a parameter name.' : 'กรอกชื่อ parameter'; return; }
    if (isNaN(value)) { errEl.textContent = isEN ? 'Enter a numeric value.' : 'กรอกค่าตัวเลข'; return; }
    const siblings = getStandards(t).filter(s => s.parameter === parameter);
    const err = tierValidationError(siblings, { tier, direction: dirEl.value }, isEN);
    if (err) { errEl.textContent = err; return; }
    addStandard(t, {
      parameter, direction: dirEl.value, value, tier,
      unit: unitEl.value.trim(), source: sourceEl.value.trim(),
      decimals: decEl.value !== '' ? parseInt(decEl.value) : null,
      bdlFallbackLimit: bdlEl.value !== '' ? parseFloat(bdlEl.value) : null,
    });
    paramEl.value = ''; valueEl.value = ''; unitEl.value = ''; sourceEl.value = ''; decEl.value = ''; bdlEl.value = ''; tierEl.value = '';
    renderStandardsUI(t);
    window.dispatchEvent(new CustomEvent('aer-standards-changed', { detail: { t } }));
  });
}

/** Rows sorted for display: alphabetically by parameter, then least → most
    severe within each parameter (mirrors how a multi-tier parameter's
    entries are evaluated). */
function sortForDisplay(list) {
  const byParam = {};
  list.forEach(s => { (byParam[s.parameter] ??= []).push(s); });
  return Object.keys(byParam).sort((a, b) => a.localeCompare(b))
    .flatMap(p => sortStdEntriesBySeverity(byParam[p]));
}

function renderTable(t) {
  const isEN = LANG === 'en';
  const tbody = document.getElementById(`${t}-std-tbody`);
  const countEl = document.getElementById(`${t}-std-count`);
  const searchEl = document.getElementById(`${t}-std-search`);
  const pageEl = document.getElementById(`${t}-std-page`);
  const all = getStandards(t);
  countEl.textContent = isEN ? `${all.length} standards` : `${all.length} รายการ`;

  wireSearch(searchEl, all,
    (s, q) => s.parameter.toLowerCase().includes(q) || (s.source || '').toLowerCase().includes(q),
    filtered => {
      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state empty-state-inline">
          <p>${all.length ? (isEN ? 'No standards match your search.' : 'ไม่พบรายการที่ค้นหา') : (isEN ? 'No standards entered yet — add one above.' : 'ยังไม่มีมาตรฐาน — เพิ่มด้านบนเพื่อเริ่มต้น')}</p>
        </div></td></tr>`;
        pageEl.innerHTML = '';
        return;
      }
      wirePagination(pageEl, sortForDisplay(filtered), PAGE_SIZE, pageRows => {
        tbody.innerHTML = pageRows.map(s => `<tr data-id="${s.id}">
          <td class="param-cell">${escHtml(s.parameter)}</td>
          <td>${escHtml(s.tier) || '—'}</td>
          <td>${s.direction === 'min' ? (isEN ? 'Min' : 'ต่ำสุด') : (isEN ? 'Max' : 'สูงสุด')}</td>
          <td class="num">${s.value}</td>
          <td>${escHtml(s.unit) || '—'}</td>
          <td>${escHtml(s.source) || '—'}</td>
          <td class="num">${s.decimals ?? '—'}</td>
          <td class="num">${s.bdlFallbackLimit ?? '—'}</td>
          <td class="std-row-actions">
            <button class="icon-btn std-edit" data-id="${s.id}" title="${isEN ? 'Edit' : 'แก้ไข'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>
            </button>
            <button class="icon-btn std-del" data-id="${s.id}" title="${isEN ? 'Delete' : 'ลบ'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </td>
        </tr>`).join('');

        tbody.querySelectorAll('.std-del').forEach(btn => btn.addEventListener('click', () => {
          removeStandard(t, btn.dataset.id);
          renderStandardsUI(t);
          window.dispatchEvent(new CustomEvent('aer-standards-changed', { detail: { t } }));
        }));
        tbody.querySelectorAll('.std-edit').forEach(btn => btn.addEventListener('click', () => startEdit(t, btn.dataset.id)));
      });
    }
  );
}

function startEdit(t, id) {
  const isEN = LANG === 'en';
  const std = getStandards(t).find(s => s.id === id);
  if (!std) return;
  const row = document.querySelector(`#${t}-std-tbody tr[data-id="${id}"]`);
  if (!row) return;
  row.innerHTML = `
    <td><input type="text" class="edit-in" value="${escHtml(std.parameter)}" data-f="parameter"></td>
    <td><input type="text" class="edit-in" value="${escHtml(std.tier || '')}" data-f="tier"></td>
    <td><select class="edit-in" data-f="direction">
      <option value="max" ${std.direction === 'max' ? 'selected' : ''}>${isEN ? 'Max' : 'สูงสุด'}</option>
      <option value="min" ${std.direction === 'min' ? 'selected' : ''}>${isEN ? 'Min' : 'ต่ำสุด'}</option>
    </select></td>
    <td class="num"><input type="number" step="any" class="edit-in num-in" value="${std.value}" data-f="value"></td>
    <td><input type="text" class="edit-in" value="${escHtml(std.unit || '')}" data-f="unit"></td>
    <td><input type="text" class="edit-in" value="${escHtml(std.source || '')}" data-f="source"></td>
    <td class="num"><input type="number" min="0" max="8" class="edit-in num-in" value="${std.decimals ?? ''}" data-f="decimals"></td>
    <td class="num"><input type="number" step="any" min="0" class="edit-in num-in" value="${std.bdlFallbackLimit ?? ''}" data-f="bdlFallbackLimit"></td>
    <td class="std-row-actions">
      <button class="icon-btn std-save" title="${isEN ? 'Save' : 'บันทึก'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button class="icon-btn std-cancel" title="${isEN ? 'Cancel' : 'ยกเลิก'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </td>`;
  const errEl = document.getElementById(`${t}-std-err`);
  row.querySelector('.std-cancel').addEventListener('click', () => renderStandardsUI(t));
  row.querySelector('.std-save').addEventListener('click', () => {
    const patch = {};
    row.querySelectorAll('.edit-in').forEach(inp => {
      const f = inp.dataset.f;
      patch[f] = f === 'value' ? parseFloat(inp.value)
        : f === 'decimals' ? (inp.value !== '' ? parseInt(inp.value) : null)
        : f === 'bdlFallbackLimit' ? (inp.value !== '' ? parseFloat(inp.value) : null)
        : inp.value.trim();
    });
    if (!patch.parameter || isNaN(patch.value)) return;
    const siblings = getStandards(t).filter(s => s.id !== id && s.parameter === patch.parameter);
    const err = tierValidationError(siblings, patch, isEN);
    if (err) { errEl.textContent = err; return; }
    errEl.textContent = '';
    updateStandard(t, id, patch);
    renderStandardsUI(t);
    window.dispatchEvent(new CustomEvent('aer-standards-changed', { detail: { t } }));
  });
}
