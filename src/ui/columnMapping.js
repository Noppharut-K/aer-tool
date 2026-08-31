/**
 * columnMapping.js — Column Mapping screen (Phase 1)
 *
 * Shown on every file upload / demo load (no persistence across reopens,
 * per the client's explicit "reset every time, export/import a template
 * instead" decision). Confirmed mapping is stored in state.js's colMap.
 */

import { LANG } from '../utils/lang.js';
import { TYPE_CFG, STD, ALIAS } from '../core/standards.js';
import { resP } from '../core/analysis.js';
import { getState, setColMap, getColMap } from '../core/state.js';

/* Escape a raw-file column name / sample value before it goes into an HTML
   attribute or text node — a value containing a quote would otherwise
   truncate the attribute it's placed in */
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Role definitions — value is the colMap.fields key, 'param', or '' (ignore) */
function ROLES(t, isEN) {
  return [
    { v: '',          l: isEN ? 'No (ignore)'                : 'ไม่ใช้ (ข้าม)' },
    { v: 'year',       l: isEN ? 'Year'                        : 'ปี' },
    { v: 'project',    l: isEN ? 'Project'                     : 'โครงการ' },
    { v: 'loc',        l: isEN ? 'Location'                    : 'Location' },
    { v: 'st',         l: isEN ? 'Station'                     : 'Station' },
    { v: 'utmN',       l: isEN ? 'N (UTM)'                     : 'พิกัด N (UTM)' },
    { v: 'utmE',       l: isEN ? 'E (UTM)'                     : 'พิกัด E (UTM)' },
    { v: 'dist',       l: isEN ? 'Distance from platform'      : 'ระยะห่างจากแท่น' },
    { v: 'direction',  l: isEN ? 'Direction from platform'     : 'ทิศทางจากแท่น' },
    ...(t === 'sea' ? [{ v: 'wl', l: isEN ? 'Depth level' : 'ระดับความลึก' }] : []),
    { v: 'date',       l: isEN ? 'Date'                        : 'วันที่' },
    { v: 'rtype',      l: isEN ? 'Report Type'                 : 'ประเภทรายงาน' },
    { v: 'area',       l: isEN ? 'Area'                        : 'Area' },
    { v: 'param',      l: isEN ? 'Parameter'                   : 'Parameter (ค่าที่วัดได้)' },
  ];
}

/* Fields that must be unique across the table — picking one for a column
   resets any other row currently holding it */
const SINGULAR_FIELDS = ['year','project','loc','st','utmN','utmE','dist','direction','wl','date','rtype','area'];

const MRL_PREFIX = /^MRL_/i;

/** Two-tier resolver: exact-name dict first, fuzzy keyword fallback second
    (same shape as Bio's bioAutoDetect) */
function autoDetectMapping(t, cols) {
  const EXACT = {
    year:      ['year', 'ปี'],
    project:   ['project', 'โครงการ'],
    loc:       ['location', 'loc'],
    st:        ['station', 'st'],
    utmN:      ['n_utm', 'utm_n', 'northing', 'n(utm)', 'n (utm)'],
    utmE:      ['e_utm', 'utm_e', 'easting', 'e(utm)', 'e (utm)'],
    dist:      ['distance', 'ระยะห่าง'],
    direction: ['direction', 'ทิศทาง'],
    wl:        ['water level', 'water_level', 'depth level', 'ระดับความลึก', 'ระดับน้ำ'],
    date:      ['date', 'sampling date', 'วันที่'],
    rtype:     ['report_type', 'report type', 'ประเภทรายงาน'],
    area:      ['area'],
  };
  const FUZZY = {
    year:      ['year', 'ปี'],
    project:   ['project', 'โครงการ'],
    loc:       ['location', 'บริเวณ'],
    st:        ['station', 'สถานี'],
    utmN:      ['utm_n', 'northing'],
    utmE:      ['utm_e', 'easting'],
    dist:      ['distance', 'ระยะ'],
    direction: ['direction', 'ทิศ'],
    wl:        ['depth', 'water level', 'ความลึก', 'ระดับ'],
    date:      ['date', 'วันที่'],
    rtype:     ['report', 'รายงาน'],
    area:      ['area'],
  };
  const roleKeys = t === 'sea'
    ? Object.keys(EXACT)
    : Object.keys(EXACT).filter(k => k !== 'wl');

  const fields = {};
  const used = new Set();

  roleKeys.forEach(key => {
    const cand = cols.find(c => !used.has(c) && EXACT[key].includes(String(c).toLowerCase().trim()));
    if (cand) { fields[key] = cand; used.add(cand); }
  });

  roleKeys.forEach(key => {
    if (fields[key]) return;
    const cand = cols.find(c => {
      if (used.has(c)) return false;
      const cl = String(c).toLowerCase();
      return FUZZY[key].some(kw => cl.includes(kw));
    });
    if (cand) { fields[key] = cand; used.add(cand); }
  });

  return { fields, used };
}

/** Default every unused, numeric, non-MRL_ column to role=Parameter */
function autoDetectParams(cols, raw, used) {
  const params = {};
  cols.forEach(col => {
    if (used.has(col) || MRL_PREFIX.test(col)) return;
    const sample = raw.find(r => r[col] != null && r[col] !== '');
    if (sample == null || isNaN(parseFloat(sample[col]))) return;
    params[col] = { canonical: resP(col), include: true };
  });
  return params;
}

/** Build the initial mapping draft: prefill (imported template) > auto-detect */
function buildDraft(t, prefill) {
  const state = getState(t);
  const cols  = state.cols;
  const raw   = state.raw;

  if (prefill) {
    const fields = {};
    SINGULAR_FIELDS.forEach(k => {
      const col = prefill.fields?.[k];
      if (col && cols.includes(col)) fields[k] = col;
    });
    const used = new Set(Object.values(fields));
    const params = {};
    Object.entries(prefill.params || {}).forEach(([col, def]) => {
      if (cols.includes(col) && !used.has(col)) { params[col] = { ...def }; used.add(col); }
    });
    Object.assign(params, autoDetectParams(cols, raw, used));
    const unmatched = Object.values(prefill.fields || {}).some(c => c && !cols.includes(c))
      || Object.keys(prefill.params || {}).some(c => !cols.includes(c));
    return {
      fields, params,
      depthSummaryMethod: prefill.depthSummaryMethod || 'avg',
      sourceColumns: cols,
      _unmatchedWarning: unmatched,
    };
  }

  const { fields, used } = autoDetectMapping(t, cols);
  const params = autoDetectParams(cols, raw, used);
  return { fields, params, depthSummaryMethod: 'avg', sourceColumns: cols, _unmatchedWarning: false };
}

/** Read-only "Field: Column" summary for the sidebar */
export function renderColMapSummary(t) {
  const box = document.getElementById(`${t}-colmap-summary`);
  if (!box) return;
  const cm = getColMap(t);
  const isEN = LANG === 'en';
  box.innerHTML = '';
  if (!cm) {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:12px;color:var(--text3);padding:4px';
    p.textContent = isEN ? 'No file loaded yet' : 'ยังไม่ได้โหลดไฟล์';
    box.appendChild(p);
    return;
  }
  ROLES(t, isEN).filter(r => r.v && r.v !== 'param' && cm.fields[r.v]).forEach(r => {
    const row = document.createElement('div');
    row.className = 'colmap-sum-row';
    const lbl = document.createElement('span'); lbl.textContent = r.l;
    const val = document.createElement('b'); val.textContent = cm.fields[r.v];
    row.appendChild(lbl); row.appendChild(val);
    box.appendChild(row);
  });
  const paramCount = Object.values(cm.params || {}).filter(p => p.include).length;
  const row = document.createElement('div');
  row.className = 'colmap-sum-row';
  const lbl = document.createElement('span'); lbl.textContent = isEN ? 'Parameters' : 'Parameters';
  const val = document.createElement('b'); val.textContent = String(paramCount);
  row.appendChild(lbl); row.appendChild(val);
  box.appendChild(row);
}

/** All canonical-name options for a tab: STD keys plus current custom value */
function canonOptions(t, current) {
  const keys = Object.keys(STD[t] || {});
  if (current && !keys.includes(current)) keys.unshift(current);
  return keys;
}

/**
 * Show the full-screen column mapping overlay.
 * @param {string} t
 * @param {{onConfirm?: Function, onCancel?: Function, prefill?: Object}} opts
 */
export function showColumnMappingScreen(t, { onConfirm, onCancel, prefill } = {}) {
  const state = getState(t);
  if (!state.cols.length) return;
  const isEN = LANG === 'en';
  const cfg = TYPE_CFG[t];

  const draft = buildDraft(t, prefill);
  const roleOpts = ROLES(t, isEN);

  document.getElementById(`colmap-overlay-${t}`)?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay colmap-overlay';
  overlay.id = `colmap-overlay-${t}`;

  const box = document.createElement('div');
  box.className = 'settings-box colmap-box';

  const title = document.createElement('div');
  title.className = 'settings-title';
  title.textContent = `${isEN ? 'Column Mapping' : 'จับคู่คอลัมน์ข้อมูล'} — ${cfg.name}`;
  box.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'settings-sub';
  sub.textContent = isEN
    ? 'Confirm which raw-file column corresponds to each field. This resets every time a file is (re)loaded.'
    : 'ยืนยันว่าคอลัมน์ในไฟล์ตรงกับ field ใด — หน้านี้จะรีเซ็ตทุกครั้งที่โหลดไฟล์ใหม่';
  box.appendChild(sub);

  if (draft._unmatchedWarning) {
    const warn = document.createElement('div');
    warn.className = 'colmap-warn';
    warn.textContent = '⚠️ ' + (isEN
      ? 'Some mapped columns from the imported template were not found in this file and were left unmapped.'
      : 'บางคอลัมน์จาก template ที่นำเข้าไม่พบในไฟล์นี้ จึงถูกปล่อยว่างไว้');
    box.appendChild(warn);
  }

  const tableWrap = document.createElement('div');
  tableWrap.className = 'settings-table-wrap colmap-table-wrap';

  const hd = document.createElement('div');
  hd.className = 'colmap-row colmap-row-hd';
  ['col','role','canon'].forEach((_, i) => {
    const d = document.createElement('div');
    d.textContent = [isEN ? 'Column' : 'คอลัมน์', isEN ? 'Role' : 'บทบาท', isEN ? 'Parameter name' : 'ชื่อ Parameter'][i];
    hd.appendChild(d);
  });
  tableWrap.appendChild(hd);

  state.cols.forEach(col => {
    const sampleVals = state.raw.slice(0, 2).map(r => r[col]).filter(v => v != null && v !== '').map(String);
    let role = '';
    for (const k of SINGULAR_FIELDS) if (draft.fields[k] === col) { role = k; break; }
    if (!role && draft.params[col]) role = 'param';

    const row = document.createElement('div');
    row.className = 'colmap-row';
    row.dataset.col = col;

    const nameCell = document.createElement('div');
    const nm = document.createElement('div'); nm.className = 'settings-param'; nm.textContent = col;
    const pv = document.createElement('div'); pv.className = 'settings-preview'; pv.textContent = sampleVals.join(', ') || '—';
    nameCell.appendChild(nm); nameCell.appendChild(pv);
    row.appendChild(nameCell);

    const roleSel = document.createElement('select');
    roleSel.className = 'colmap-role';
    roleSel.dataset.col = col;
    roleOpts.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.v; opt.textContent = r.l;
      if (r.v === role) opt.selected = true;
      roleSel.appendChild(opt);
    });
    row.appendChild(roleSel);

    const canonSel = document.createElement('select');
    canonSel.className = 'colmap-canon';
    canonSel.dataset.col = col;
    const curCanon = draft.params[col]?.canonical || resP(col);
    canonOptions(t, curCanon).forEach(k => {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = k;
      if (k === curCanon) opt.selected = true;
      canonSel.appendChild(opt);
    });
    canonSel.style.visibility = role === 'param' ? 'visible' : 'hidden';
    row.appendChild(canonSel);

    tableWrap.appendChild(row);
  });
  box.appendChild(tableWrap);

  if (t === 'sea') {
    const depthRow = document.createElement('div');
    depthRow.className = 'colmap-depth-row';
    const lbl = document.createElement('label');
    lbl.textContent = isEN ? 'Depth-level summarization method (per station)' : 'วิธีสรุปค่าตามระดับความลึก (ต่อสถานี)';
    const sel = document.createElement('select');
    sel.id = `colmap-depthmethod-${t}`;
    [['avg', isEN ? 'Average' : 'ค่าเฉลี่ย'], ['mode', isEN ? 'Mode' : 'ฐานนิยม'], ['median', isEN ? 'Median' : 'มัธยฐาน']]
      .forEach(([v, l]) => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = l;
        if (v === draft.depthSummaryMethod) opt.selected = true;
        sel.appendChild(opt);
      });
    depthRow.appendChild(lbl); depthRow.appendChild(sel);
    box.appendChild(depthRow);
  }

  const footer = document.createElement('div');
  footer.className = 'settings-footer';

  const leftBtns = document.createElement('div');
  leftBtns.style.cssText = 'display:flex;gap:8px';
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-outline btn-sm';
  exportBtn.textContent = isEN ? 'Export Template' : 'Export Template';
  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-outline btn-sm';
  importBtn.textContent = isEN ? 'Import Template' : 'Import Template';
  leftBtns.appendChild(exportBtn); leftBtns.appendChild(importBtn);

  const rightBtns = document.createElement('div');
  rightBtns.style.cssText = 'display:flex;gap:8px';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-outline btn-sm';
  cancelBtn.textContent = isEN ? 'Cancel' : 'ยกเลิก';
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-primary btn-sm';
  confirmBtn.id = `colmap-confirm-${t}`;
  confirmBtn.textContent = isEN ? 'Confirm Mapping' : 'ยืนยันการจับคู่';
  confirmBtn.disabled = true;
  rightBtns.appendChild(cancelBtn); rightBtns.appendChild(confirmBtn);

  footer.appendChild(leftBtns); footer.appendChild(rightBtns);
  box.appendChild(footer);

  overlay.appendChild(box);
  document.getElementById(`page-${t}`).appendChild(overlay);

  const validate = () => {
    const hasStation = [...overlay.querySelectorAll('.colmap-role')].some(s => s.value === 'st');
    confirmBtn.disabled = !hasStation;
  };

  // Role changes: enforce singular fields, toggle canon select, revalidate
  overlay.querySelectorAll('.colmap-role').forEach(sel => {
    sel.addEventListener('change', () => {
      const newRole = sel.value;
      const col = sel.dataset.col;
      if (newRole && SINGULAR_FIELDS.includes(newRole)) {
        overlay.querySelectorAll('.colmap-role').forEach(other => {
          if (other !== sel && other.value === newRole) other.value = '';
        });
      }
      const canonSel = overlay.querySelector(`.colmap-canon[data-col="${CSS.escape(col)}"]`);
      if (canonSel) canonSel.style.visibility = newRole === 'param' ? 'visible' : 'hidden';
      validate();
    });
  });

  cancelBtn.addEventListener('click', () => {
    overlay.remove();
    onCancel?.();
  });

  confirmBtn.addEventListener('click', () => {
    const fields = {};
    const params = {};
    overlay.querySelectorAll('.colmap-role').forEach(sel => {
      const col = sel.dataset.col;
      const role = sel.value;
      if (!role) return;
      if (role === 'param') {
        const canonSel = overlay.querySelector(`.colmap-canon[data-col="${CSS.escape(col)}"]`);
        params[col] = { canonical: canonSel ? canonSel.value : resP(col), include: true };
      } else {
        fields[role] = col;
      }
    });
    const depthSel = document.getElementById(`colmap-depthmethod-${t}`);
    const colMap = {
      version: 1,
      fields,
      params,
      depthSummaryMethod: depthSel ? depthSel.value : 'avg',
      sourceColumns: state.cols.slice(),
    };
    setColMap(t, colMap);
    renderColMapSummary(t);
    overlay.remove();
    onConfirm?.();
  });

  exportBtn.addEventListener('click', () => exportConfigTemplate(t, {
    fields: (() => {
      const f = {};
      overlay.querySelectorAll('.colmap-role').forEach(sel => { if (sel.value && sel.value !== 'param') f[sel.value] = sel.dataset.col; });
      return f;
    })(),
    params: (() => {
      const p = {};
      overlay.querySelectorAll('.colmap-role').forEach(sel => {
        if (sel.value !== 'param') return;
        const col = sel.dataset.col;
        const canonSel = overlay.querySelector(`.colmap-canon[data-col="${CSS.escape(col)}"]`);
        p[col] = { canonical: canonSel ? canonSel.value : resP(col), include: true };
      });
      return p;
    })(),
    depthSummaryMethod: document.getElementById(`colmap-depthmethod-${t}`)?.value || 'avg',
  }));

  importBtn.addEventListener('click', () => {
    overlay.remove();
    document.getElementById(`${t}-importmap-fi`)?.click();
  });

  validate();
}

/** Download the current (confirmed or in-progress) mapping as a JSON template */
export function exportConfigTemplate(t, colMapOverride) {
  const cm = colMapOverride || getColMap(t);
  if (!cm) return;
  const cfg = TYPE_CFG[t];
  const envelope = {
    aerConfigTemplate: true,
    version: 1,
    exportedAt: new Date().toISOString(),
    tab: t,
    columnMapping: {
      fields: cm.fields,
      params: cm.params,
      depthSummaryMethod: cm.depthSummaryMethod,
      sourceColumns: cm.sourceColumns,
    },
    standardsLibrary: null,
    refBaselineMapping: null,
    comparisons: null,
  };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `AER_${cfg.name}_ConfigTemplate_${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Read a JSON template file and hand the draft mapping to `cb` */
export function importConfigTemplate(t, file, cb) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const json = JSON.parse(e.target.result);
      if (!json.aerConfigTemplate || !json.columnMapping) {
        alert(LANG === 'en' ? 'Invalid config template file.' : 'ไฟล์ template ไม่ถูกต้อง');
        return;
      }
      cb(json.columnMapping);
    } catch (err) {
      alert((LANG === 'en' ? 'Failed to read template: ' : 'อ่านไฟล์ template ไม่สำเร็จ: ') + err.message);
    }
  };
  reader.readAsText(file);
}
