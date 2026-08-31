/**
 * standardsUI.js — Standards Management screen (spec §8: its own dedicated
 * screen, not folded into a generic settings modal). Add/edit/delete
 * standards, each with a value, direction (max/min), unit, source, and an
 * optional per-parameter decimal-display override.
 */

import { LANG } from '../utils/lang.js';
import { getState, getStandards, addStandard, updateStandard, removeStandard, getParamCols, resolveCanonical } from '../core/state.js';
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
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>${isEN ? 'Parameter' : 'Parameter'}</th><th>${isEN ? 'Direction' : 'ทิศทาง'}</th>
            <th class="num">${isEN ? 'Value' : 'ค่า'}</th><th>${isEN ? 'Unit' : 'หน่วย'}</th>
            <th>${isEN ? 'Source' : 'แหล่งที่มา'}</th><th class="num">${isEN ? 'Decimals' : 'ทศนิยม'}</th>
            <th></th>
          </tr></thead>
          <tbody id="${t}-std-tbody"></tbody>
        </table>
      </div>
      <div class="table-foot"><div id="${t}-std-page"></div></div>
    </div>`;

  wireAddForm(t);
  renderTable(t);
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
    const dirEl = document.getElementById(`${t}-std-dir`);
    const errEl = document.getElementById(`${t}-std-err`);
    errEl.textContent = '';

    const parameter = paramEl.value.trim();
    const value = parseFloat(valueEl.value);
    if (!parameter) { errEl.textContent = isEN ? 'Enter a parameter name.' : 'กรอกชื่อ parameter'; return; }
    if (isNaN(value)) { errEl.textContent = isEN ? 'Enter a numeric value.' : 'กรอกค่าตัวเลข'; return; }
    if (getStandards(t).some(s => s.parameter === parameter)) {
      errEl.textContent = isEN ? 'This parameter already has a standard — edit it below instead.' : 'Parameter นี้มีมาตรฐานอยู่แล้ว — แก้ไขในตารางด้านล่างแทน';
      return;
    }
    addStandard(t, {
      parameter, direction: dirEl.value, value,
      unit: unitEl.value.trim(), source: sourceEl.value.trim(),
      decimals: decEl.value !== '' ? parseInt(decEl.value) : null,
    });
    paramEl.value = ''; valueEl.value = ''; unitEl.value = ''; sourceEl.value = ''; decEl.value = '';
    renderStandardsUI(t);
    window.dispatchEvent(new CustomEvent('aer-standards-changed', { detail: { t } }));
  });
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
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state empty-state-inline">
          <p>${all.length ? (isEN ? 'No standards match your search.' : 'ไม่พบรายการที่ค้นหา') : (isEN ? 'No standards entered yet — add one above.' : 'ยังไม่มีมาตรฐาน — เพิ่มด้านบนเพื่อเริ่มต้น')}</p>
        </div></td></tr>`;
        pageEl.innerHTML = '';
        return;
      }
      wirePagination(pageEl, filtered, PAGE_SIZE, pageRows => {
        tbody.innerHTML = pageRows.map(s => `<tr data-id="${s.id}">
          <td class="param-cell">${escHtml(s.parameter)}</td>
          <td>${s.direction === 'min' ? (isEN ? 'Min' : 'ต่ำสุด') : (isEN ? 'Max' : 'สูงสุด')}</td>
          <td class="num">${s.value}</td>
          <td>${escHtml(s.unit) || '—'}</td>
          <td>${escHtml(s.source) || '—'}</td>
          <td class="num">${s.decimals ?? '—'}</td>
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
    <td><select class="edit-in" data-f="direction">
      <option value="max" ${std.direction === 'max' ? 'selected' : ''}>${isEN ? 'Max' : 'สูงสุด'}</option>
      <option value="min" ${std.direction === 'min' ? 'selected' : ''}>${isEN ? 'Min' : 'ต่ำสุด'}</option>
    </select></td>
    <td class="num"><input type="number" step="any" class="edit-in num-in" value="${std.value}" data-f="value"></td>
    <td><input type="text" class="edit-in" value="${escHtml(std.unit || '')}" data-f="unit"></td>
    <td><input type="text" class="edit-in" value="${escHtml(std.source || '')}" data-f="source"></td>
    <td class="num"><input type="number" min="0" max="8" class="edit-in num-in" value="${std.decimals ?? ''}" data-f="decimals"></td>
    <td class="std-row-actions">
      <button class="icon-btn std-save" title="${isEN ? 'Save' : 'บันทึก'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button class="icon-btn std-cancel" title="${isEN ? 'Cancel' : 'ยกเลิก'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </td>`;
  row.querySelector('.std-cancel').addEventListener('click', () => renderStandardsUI(t));
  row.querySelector('.std-save').addEventListener('click', () => {
    const patch = {};
    row.querySelectorAll('.edit-in').forEach(inp => {
      const f = inp.dataset.f;
      patch[f] = f === 'value' ? parseFloat(inp.value) : f === 'decimals' ? (inp.value !== '' ? parseInt(inp.value) : null) : inp.value.trim();
    });
    if (!patch.parameter || isNaN(patch.value)) return;
    updateStandard(t, id, patch);
    renderStandardsUI(t);
    window.dispatchEvent(new CustomEvent('aer-standards-changed', { detail: { t } }));
  });
}
