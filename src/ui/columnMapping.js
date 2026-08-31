/**
 * columnMapping.js — column mapping screen, shown before every analysis run
 * (spec §2.5: shown every time the file structure changes; no persistence
 * across reopens per the client's decision — Export/Import Template covers
 * reuse instead)
 */

import { LANG } from '../utils/lang.js';
import { TYPE_CFG } from '../core/standards.js';
import { getState, setColMap, getColMap } from '../core/state.js';
import { isNumericValue } from '../core/analysis.js';

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SINGULAR_FIELDS = ['year', 'project', 'loc', 'st', 'utmN', 'utmE', 'dist', 'direction', 'wl'];

function ROLES(t, isEN) {
  const roles = [
    { v: '', l: isEN ? 'Ignore' : 'ไม่ใช้' },
    { v: 'year', l: isEN ? 'Year' : 'ปี' },
    { v: 'project', l: isEN ? 'Project' : 'โครงการ' },
    { v: 'loc', l: 'Location' },
    { v: 'st', l: 'Station' },
    { v: 'utmN', l: 'N_UTM' },
    { v: 'utmE', l: 'E_UTM' },
    { v: 'dist', l: isEN ? 'Distance from platform' : 'ระยะห่างจาก platform' },
    { v: 'direction', l: isEN ? 'Direction from platform' : 'ทิศทางจาก platform' },
  ];
  if (t === 'sea') roles.push({ v: 'wl', l: isEN ? 'Depth level' : 'ระดับความลึก (Depth level)' });
  roles.push({ v: 'param', l: isEN ? 'Parameter' : 'Parameter (ค่าที่วัดได้)' });
  return roles;
}

const EXACT = {
  year: ['year', 'ปี'],
  project: ['project', 'โครงการ'],
  loc: ['location', 'loc'],
  st: ['station', 'st'],
  utmN: ['n_utm', 'n_utm ind75', 'n_utm_ind75', 'utm_n'],
  utmE: ['e_utm', 'e_utm ind75', 'e_utm_ind75', 'utm_e'],
  dist: ['distance from platform', 'distance'],
  direction: ['direction from platform', 'direction'],
  wl: ['depth level', 'depth level of sampling', 'depth', 'ระดับความลึก'],
};
const FUZZY = {
  year: ['year', 'ปี'], project: ['project', 'โครงการ'],
  loc: ['location', 'บริเวณ'], st: ['station', 'สถานี'],
  utmN: ['utm_n', 'northing', ' n '], utmE: ['utm_e', 'easting', ' e '],
  dist: ['distance', 'ระยะ'], direction: ['direction', 'ทิศ'],
  wl: ['depth', 'ความลึก'],
};

function autoDetect(t, cols) {
  const roleKeys = t === 'sea' ? Object.keys(EXACT) : Object.keys(EXACT).filter(k => k !== 'wl');
  const fields = {};
  const used = new Set();
  roleKeys.forEach(key => {
    const c = cols.find(c => !used.has(c) && EXACT[key].includes(String(c).toLowerCase().trim()));
    if (c) { fields[key] = c; used.add(c); }
  });
  roleKeys.forEach(key => {
    if (fields[key]) return;
    const c = cols.find(c => !used.has(c) && FUZZY[key].some(kw => String(c).toLowerCase().includes(kw)));
    if (c) { fields[key] = c; used.add(c); }
  });
  return { fields, used };
}

/* Explicit date-shaped patterns only — deliberately NOT using new Date(str)
   to detect these, since that parser is far too permissive (e.g.
   new Date("REF-01") silently parses as a valid date, which would wrongly
   swallow a Station column here). */
const DATE_PATTERNS = [
  /^\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/, // 2020-05-10, 2020-05-10T00:00:00
  /^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/,                     // 10/05/2020, 10-05-2020
];

/** Columns that clearly hold dates, not a mappable field or parameter — cut
    from the mapping screen entirely (no role to assign them, no value to
    read as data) rather than leaving them as a distracting "Ignore" row.
    Caught by name (any column with "date" in it) or, for oddly-named
    columns, by the sample value matching an explicit date pattern. */
function isDateLikeColumn(col, raw) {
  if (/date/i.test(col)) return true;
  const sample = raw.find(r => r[col] != null && r[col] !== '');
  if (!sample) return false;
  const v = String(sample[col]).trim();
  return DATE_PATTERNS.some(p => p.test(v));
}

function mappableCols(state) {
  return state.cols.filter(col => !isDateLikeColumn(col, state.raw));
}

function autoDetectParams(cols, raw, used) {
  const params = {};
  cols.forEach(col => {
    if (used.has(col)) return;
    const sample = raw.find(r => r[col] != null && r[col] !== '');
    if (sample == null || !isNumericValue(sample[col])) return;
    params[col] = col;
  });
  return params;
}

function buildDraft(t, prefill) {
  const state = getState(t);
  const cols = mappableCols(state), raw = state.raw;
  if (prefill) {
    const fields = {};
    SINGULAR_FIELDS.forEach(k => { if (prefill.fields?.[k] && cols.includes(prefill.fields[k])) fields[k] = prefill.fields[k]; });
    const used = new Set(Object.values(fields));
    const params = {};
    Object.entries(prefill.params || {}).forEach(([col, canon]) => { if (cols.includes(col) && !used.has(col)) { params[col] = canon; used.add(col); } });
    Object.assign(params, autoDetectParams(cols, raw, used));
    const unmatched = Object.values(prefill.fields || {}).some(c => c && !cols.includes(c)) || Object.keys(prefill.params || {}).some(c => !cols.includes(c));
    return { fields, params, _unmatchedWarning: unmatched };
  }
  const { fields, used } = autoDetect(t, cols);
  const params = autoDetectParams(cols, raw, used);
  return { fields, params, _unmatchedWarning: false };
}

export function showColumnMappingScreen(t, { onConfirm, onCancel, prefill } = {}) {
  const state = getState(t);
  if (!state.cols.length) return;
  const isEN = LANG === 'en';
  const cfg = TYPE_CFG[t];
  const draft = buildDraft(t, prefill);
  const roleOpts = ROLES(t, isEN);

  document.getElementById(`colmap-overlay-${t}`)?.remove();

  const overlay = document.createElement('div');
  overlay.className = `overlay colmap-overlay accent-${cfg.accent}`;
  overlay.id = `colmap-overlay-${t}`;

  const box = document.createElement('div');
  box.className = 'sheet colmap-sheet';

  box.innerHTML = `
    <div class="sheet-hd">
      <div class="sheet-title">${isEN ? 'Map your columns' : 'จับคู่คอลัมน์ข้อมูล'}</div>
      <div class="sheet-sub">${isEN
        ? `Confirm which column in your file matches each field. Runs every time you load a new file.`
        : `ยืนยันว่าคอลัมน์ในไฟล์ตรงกับ field ใด — ทำทุกครั้งที่โหลดไฟล์ใหม่`}</div>
      ${draft._unmatchedWarning ? `<div class="colmap-warn">${isEN ? 'Some fields from the imported template weren’t found in this file and were left unmapped.' : 'บางฟิลด์จาก template ที่นำเข้าไม่พบในไฟล์นี้ จึงถูกปล่อยว่างไว้'}</div>` : ''}
    </div>
    <div class="sheet-body colmap-table-wrap">
      <div class="colmap-row colmap-hd">
        <div>${isEN ? 'Column' : 'คอลัมน์'}</div><div>${isEN ? 'Sample' : 'ตัวอย่าง'}</div><div>${isEN ? 'Field' : 'บทบาท'}</div>
      </div>
      ${mappableCols(state).map(col => {
        const sample = state.raw.slice(0, 2).map(r => r[col]).filter(v => v != null && v !== '').map(String).join(', ');
        let role = '';
        for (const k of SINGULAR_FIELDS) if (draft.fields[k] === col) { role = k; break; }
        if (!role && draft.params[col]) role = 'param';
        return `<div class="colmap-row" data-col="${escHtml(col)}">
          <div class="colmap-colname">${escHtml(col)}</div>
          <div class="colmap-sample">${escHtml(sample) || '—'}</div>
          <select class="colmap-role-sel" data-col="${escHtml(col)}">
            ${roleOpts.map(r => `<option value="${r.v}" ${r.v === role ? 'selected' : ''}>${escHtml(r.l)}</option>`).join('')}
          </select>
        </div>`;
      }).join('')}
    </div>
    <div class="sheet-ft">
      <div class="sheet-ft-left">
        <button class="btn" id="colmap-export-${t}">${isEN ? 'Export Template' : 'Export Template'}</button>
        <button class="btn" id="colmap-import-${t}">${isEN ? 'Import Template' : 'Import Template'}</button>
      </div>
      <div class="sheet-ft-right">
        <button class="btn" id="colmap-cancel-${t}">${isEN ? 'Cancel' : 'ยกเลิก'}</button>
        <button class="btn btn-primary" id="colmap-confirm-${t}" disabled>${isEN ? 'Confirm' : 'ยืนยัน'}</button>
      </div>
    </div>`;

  overlay.appendChild(box);
  document.getElementById(`page-${t}`).appendChild(overlay);

  const confirmBtn = box.querySelector(`#colmap-confirm-${t}`);
  const validate = () => {
    confirmBtn.disabled = ![...box.querySelectorAll('.colmap-role-sel')].some(s => s.value === 'st');
  };

  box.querySelectorAll('.colmap-role-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const role = sel.value;
      if (role && SINGULAR_FIELDS.includes(role)) {
        box.querySelectorAll('.colmap-role-sel').forEach(other => { if (other !== sel && other.value === role) other.value = ''; });
      }
      validate();
    });
  });

  box.querySelector(`#colmap-cancel-${t}`).addEventListener('click', () => { overlay.remove(); onCancel?.(); });

  confirmBtn.addEventListener('click', () => {
    const fields = {};
    const params = {};
    box.querySelectorAll('.colmap-role-sel').forEach(sel => {
      const col = sel.dataset.col, role = sel.value;
      if (!role) return;
      if (role === 'param') params[col] = col;
      else fields[role] = col;
    });
    setColMap(t, { version: 1, fields, params, sourceColumns: state.cols.slice() });
    overlay.remove();
    onConfirm?.();
  });

  box.querySelector(`#colmap-export-${t}`).addEventListener('click', () => exportConfigTemplate(t, { fields: (() => {
    const f = {}; box.querySelectorAll('.colmap-role-sel').forEach(s => { if (s.value && s.value !== 'param') f[s.value] = s.dataset.col; }); return f;
  })(), params: (() => {
    const p = {}; box.querySelectorAll('.colmap-role-sel').forEach(s => { if (s.value === 'param') p[s.dataset.col] = s.dataset.col; }); return p;
  })() }));

  box.querySelector(`#colmap-import-${t}`).addEventListener('click', () => {
    overlay.remove();
    document.getElementById(`${t}-importmap-fi`)?.click();
  });

  validate();
}

export function exportConfigTemplate(t, colMapOverride) {
  const cm = colMapOverride || getColMap(t);
  if (!cm) return;
  const cfg = TYPE_CFG[t];
  const envelope = {
    aerConfigTemplate: true, version: 1, exportedAt: new Date().toISOString(), tab: t,
    columnMapping: { fields: cm.fields, params: cm.params, sourceColumns: cm.sourceColumns },
    standardsLibrary: null,
  };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AER_${cfg.name}_ConfigTemplate_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function importConfigTemplate(t, file, cb) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const json = JSON.parse(e.target.result);
      if (!json.aerConfigTemplate || !json.columnMapping) {
        alert(LANG === 'en' ? 'Invalid config template file.' : 'ไฟล์ template ไม่ถูกต้อง');
        return;
      }
      cb(json.columnMapping, json);
    } catch (err) {
      alert((LANG === 'en' ? 'Failed to read template: ' : 'อ่านไฟล์ template ไม่สำเร็จ: ') + err.message);
    }
  };
  reader.readAsText(file);
}
