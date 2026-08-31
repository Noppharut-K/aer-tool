/**
 * refBaselineUI.js — per-Location REF/Baseline station mapping (Tab 2
 * foundation). Each Location gets its own REF and Baseline picker,
 * offering every station tab-wide (cross-Location assignment allowed —
 * REF stations are commonly external reference points in EIA practice).
 * Rewritten fresh for the redesigned visual system; no logic ported from
 * the discarded pre-redesign build beyond the underlying concept.
 */

import { LANG } from '../utils/lang.js';
import { getState } from '../core/state.js';
import { setRefMap, getRefMap, setBaselineMap, getBaselineMap } from '../core/state.js';

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function readMap(t, cls) {
  const map = {};
  document.querySelectorAll(`.${cls}-${t}:checked`).forEach(cb => {
    const loc = cb.dataset.location;
    (map[loc] ??= []).push(cb.value);
  });
  return map;
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
  const refMap = getRefMap(t) || {};
  const baselineMap = getBaselineMap(t) || {};

  root.innerHTML = `
    <div class="sheet-sub" style="margin-bottom:14px">${isEN
      ? 'Assign REF and Baseline stations to each Location — a station from any Location can serve as another’s reference.'
      : 'กำหนดสถานี REF และ Baseline ให้แต่ละ Location — เลือกสถานีจาก Location ใดก็ได้มาเป็นค่าอ้างอิงของ Location อื่น'}</div>
    ${locations.map(loc => `
      <div class="refmap-loc-card">
        <div class="refmap-loc-title">${escHtml(loc)}</div>
        <div class="refmap-loc-cols">
          <div>
            <div class="refmap-role-lbl">REF</div>
            <div class="refmap-chip-grid">
              ${stations.map(s => `<label class="refmap-chip">
                <input type="checkbox" class="rck-loc-${t}" data-location="${escHtml(loc)}" value="${escHtml(s)}" ${(refMap[loc] || []).includes(s) ? 'checked' : ''}>
                <span>${escHtml(s)}</span>
              </label>`).join('')}
            </div>
          </div>
          <div>
            <div class="refmap-role-lbl">Baseline</div>
            <div class="refmap-chip-grid">
              ${stations.map(s => `<label class="refmap-chip">
                <input type="checkbox" class="bck-loc-${t}" data-location="${escHtml(loc)}" value="${escHtml(s)}" ${(baselineMap[loc] || []).includes(s) ? 'checked' : ''}>
                <span>${escHtml(s)}</span>
              </label>`).join('')}
            </div>
          </div>
        </div>
      </div>`).join('')}`;

  const commit = () => {
    setRefMap(t, readMap(t, 'rck-loc'));
    setBaselineMap(t, readMap(t, 'bck-loc'));
    window.dispatchEvent(new CustomEvent('aer-refmap-changed', { detail: { t } }));
  };
  root.querySelectorAll(`.rck-loc-${t}, .bck-loc-${t}`).forEach(cb => cb.addEventListener('change', commit));
}
