/**
 * refBaselineUI.js — per-Location REF/Baseline station assignment (Phase 4)
 *
 * Replaces the old flat, tab-wide REF/Baseline checkbox lists. Each Location
 * gets its own REF and Baseline pickers, offering every station in the
 * uploaded file (cross-Location assignment allowed — a REF station commonly
 * sits outside any of the study's own Locations in EIA practice).
 */

import { LANG } from '../utils/lang.js';
import { getState, getColVal, getRefMap, getBaselineMap, setRefMap, setBaselineMap } from '../core/state.js';

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Read every checked box in the sidebar back into a { [location]: string[] } map */
function readMap(t, cls) {
  const map = {};
  document.querySelectorAll(`.${cls}-${t}:checked`).forEach(cb => {
    const loc = cb.dataset.location;
    (map[loc] ??= []).push(cb.value);
  });
  return map;
}

/** Rebuild the per-Location REF/Baseline sidebar UI for a tab, replacing
    rebuildRef() from the old flat-checkbox implementation. Call this after
    a file loads/reloads, or after Edit Mapping changes the Station/Location
    columns. `onChange` fires whenever a checkbox is toggled, after state has
    been updated — the caller re-renders dependent tabs from there. */
export function rebuildRefBaseline(t, onChange) {
  const el = document.getElementById(`${t}-refbaseline-body`);
  if (!el) return;

  const state  = getState(t);
  const colLoc = getColVal(t, 'loc');
  const colSt  = getColVal(t, 'st');
  const isEN   = LANG === 'en';

  if (!colSt || !state.raw.length) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text3);padding:4px">${isEN ? 'Load a file first' : 'โหลดไฟล์ก่อน'}</p>`;
    return;
  }

  const allStations = [...new Set(state.raw.map(r => String(r[colSt] || '')).filter(Boolean))].sort();
  const locations = colLoc
    ? [...new Set(state.raw.map(r => String(r[colLoc] || '')).filter(Boolean))].sort()
    : [isEN ? '(All stations)' : '(สถานีทั้งหมด)'];

  const refMap = getRefMap(t) || {};
  const bsMap  = getBaselineMap(t) || {};

  el.innerHTML = locations.map(loc => {
    const refChecked = new Set(refMap[loc] || []);
    const bsChecked  = new Set(bsMap[loc]  || []);
    const stationOpts = (checkedSet, cls) => allStations.map(s => `
      <label class="ref-item">
        <input type="checkbox" class="${cls}-${t}" data-location="${escHtml(loc)}" value="${escHtml(s)}" ${checkedSet.has(s) ? 'checked' : ''}>
        <span>${escHtml(s)}</span>
      </label>`).join('');
    return `<div class="rb-loc-block">
      <div class="rb-loc-title">${escHtml(loc)}</div>
      <div class="rb-loc-cols">
        <div>
          <div class="rb-col-lbl">${isEN ? 'REF' : 'REF'}</div>
          <div class="ref-list rb-ref-list">${stationOpts(refChecked, 'rck-loc')}</div>
        </div>
        <div>
          <div class="rb-col-lbl">${isEN ? 'Baseline' : 'Baseline'}</div>
          <div class="ref-list rb-ref-list">${stationOpts(bsChecked, 'bck-loc')}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Note: NOT committed on build (only on user interaction, below) — leaving
  // refMap/baselineMap at whatever they already were (null on a fresh
  // upload) preserves getRefStationsFor()'s "no per-Location mapping
  // configured yet" fallback until the user actually touches a checkbox.
  const commit = () => {
    setRefMap(t, readMap(t, 'rck-loc'));
    setBaselineMap(t, readMap(t, 'bck-loc'));
    onChange?.();
  };
  el.querySelectorAll(`.rck-loc-${t}, .bck-loc-${t}`).forEach(cb => cb.addEventListener('change', commit));
}
