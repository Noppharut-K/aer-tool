/**
 * refBaselineUI.js — per-Location REF/Baseline station mapping (Tab 2
 * foundation). Each Location gets its own REF and Baseline picker, offering
 * every station tab-wide (cross-Location assignment allowed — REF stations
 * are commonly external reference points in EIA practice). Uses a
 * searchable multi-select dropdown rather than a checkbox grid so it stays
 * usable once a dataset has 100+ stations.
 */

import { LANG } from '../utils/lang.js';
import { getState, setRefMap, getRefMap, setBaselineMap, getBaselineMap } from '../core/state.js';

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function selectBlockHtml(stations, selected, isEN) {
  return `
    <div class="ms-select">
      <button type="button" class="ms-toggle">
        <span class="ms-toggle-text"></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="ms-popover">
        <input type="text" class="ms-search" placeholder="${isEN ? 'Search station…' : 'ค้นหาสถานี…'}">
        <div class="ms-list">
          ${stations.map(s => `<label class="ms-option"><input type="checkbox" value="${escHtml(s)}" ${selected.includes(s) ? 'checked' : ''}><span>${escHtml(s)}</span></label>`).join('')}
        </div>
      </div>
    </div>
    <div class="ms-chips"></div>`;
}

function renderChips(block, selected, isEN) {
  const chips = block.querySelector('.ms-chips');
  chips.innerHTML = selected.length
    ? selected.map(s => `<span class="ms-chip">${escHtml(s)}<button type="button" class="ms-chip-x" data-x="${escHtml(s)}">&times;</button></span>`).join('')
    : `<span class="ms-chips-empty">${isEN ? 'None selected' : 'ยังไม่เลือก'}</span>`;
  block.querySelector('.ms-toggle-text').textContent = selected.length
    ? `${selected.length} ${isEN ? 'station(s) selected' : 'สถานีที่เลือก'}`
    : (isEN ? 'Select stations…' : 'เลือกสถานี…');
}

function wireSelectBlock(block, isEN, onChange) {
  const toggle = block.querySelector('.ms-toggle');
  const popover = block.querySelector('.ms-popover');
  const search = block.querySelector('.ms-search');
  const list = block.querySelector('.ms-list');
  const chips = block.querySelector('.ms-chips');
  const getSelected = () => [...list.querySelectorAll('input:checked')].map(cb => cb.value);

  renderChips(block, getSelected(), isEN);

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.ms-popover.open').forEach(p => { if (p !== popover) p.classList.remove('open'); });
    popover.classList.toggle('open');
    if (popover.classList.contains('open')) {
      search.value = '';
      list.querySelectorAll('.ms-option').forEach(o => { o.style.display = ''; });
      search.focus();
    }
  });

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    list.querySelectorAll('.ms-option').forEach(opt => {
      opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  list.addEventListener('change', () => {
    const sel = getSelected();
    renderChips(block, sel, isEN);
    onChange(sel);
  });

  chips.addEventListener('click', e => {
    const btn = e.target.closest('.ms-chip-x');
    if (!btn) return;
    const cb = [...list.querySelectorAll('input')].find(c => c.value === btn.dataset.x);
    if (cb) cb.checked = false;
    const sel = getSelected();
    renderChips(block, sel, isEN);
    onChange(sel);
  });
}

if (!window.__aerMsOutsideClickWired) {
  window.__aerMsOutsideClickWired = true;
  document.addEventListener('click', e => {
    if (!e.target.closest('.ms-select')) {
      document.querySelectorAll('.ms-popover.open').forEach(p => p.classList.remove('open'));
    }
  });
}

export function renderRefBaselineUI(t) {
  const root = document.getElementById(`${t}-refmap-root`);
  if (!root) return;
  const isEN = LANG === 'en';
  const state = getState(t);

  if (!state.analyzed || !state.rows.length) {
    root.innerHTML = `<div class="empty-state"><p>${isEN ? 'Run analysis first to see Locations and Stations here.' : 'วิเคราะห์ข้อมูลก่อน เพื่อให้เห็น Location และ Station ที่นี่'}</p></div>`;
    return;
  }

  const locations = [...new Set(state.rows.map(r => r.loc))].sort();
  const stations = [...new Set(state.rows.map(r => r.st))].sort();
  const refMap = { ...(getRefMap(t) || {}) };
  const baselineMap = { ...(getBaselineMap(t) || {}) };

  root.innerHTML = `
    <div class="sheet-sub" style="margin-bottom:14px">${isEN
      ? 'Assign REF and Baseline stations to each Location — a station from any Location can serve as another’s reference.'
      : 'กำหนดสถานี REF และ Baseline ให้แต่ละ Location — เลือกสถานีจาก Location ใดก็ได้มาเป็นค่าอ้างอิงของ Location อื่น'}</div>
    ${locations.map((loc, i) => `
      <div class="refmap-loc-card">
        <div class="refmap-loc-title">${escHtml(loc)}</div>
        <div class="refmap-loc-cols">
          <div class="refmap-role-block" data-role="ref" data-idx="${i}">
            <div class="refmap-role-lbl">REF</div>
            ${selectBlockHtml(stations, refMap[loc] || [], isEN)}
          </div>
          <div class="refmap-role-block" data-role="base" data-idx="${i}">
            <div class="refmap-role-lbl">Baseline</div>
            ${selectBlockHtml(stations, baselineMap[loc] || [], isEN)}
          </div>
        </div>
      </div>`).join('')}`;

  root.querySelectorAll('.refmap-role-block').forEach(block => {
    const loc = locations[+block.dataset.idx];
    const isRef = block.dataset.role === 'ref';
    wireSelectBlock(block, isEN, sel => {
      const map = isRef ? refMap : baselineMap;
      if (sel.length) map[loc] = sel; else delete map[loc];
      if (isRef) setRefMap(t, { ...refMap }); else setBaselineMap(t, { ...baselineMap });
      window.dispatchEvent(new CustomEvent('aer-refmap-changed', { detail: { t } }));
    });
  });
}
