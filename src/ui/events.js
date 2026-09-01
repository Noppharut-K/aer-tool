/**
 * events.js — wires up all event handlers for the redesigned sea/sed pages
 */

import { LANG } from '../utils/lang.js';
import {
  getState, setRaw, getParamCols, resolveCanonical,
  setStandards, setRefMap, setBaselineMap, setDepthSummaryMethod, setCmpSettings, setCustomCmp,
  setBdlMethod, getBdlMethod,
} from '../core/state.js';
import { showColumnMappingScreen, exportConfigTemplate, importConfigTemplate } from './columnMapping.js';
import { renderDashboard } from './renders.js';
import { isNumericValue, parseBdl } from '../core/analysis.js';
import { renderStandardsUI } from './standardsUI.js';
import { renderRefBaselineUI } from './refBaselineUI.js';
import { renderComparisonUI } from './comparisonUI.js';
import { renderReportUI } from './reportUI.js';
import { runAnalysis } from '../core/runAnalysis.js';

export function setSt(t, msg, kind = 'idle') {
  // Lightweight status surface — currently just console; command bar shows
  // file/mapping state directly, so a persistent status bar isn't needed
  // in the new layout. Kept as a hook for future toast-style messages.
  if (kind === 'err') console.error(`[${t}]`, msg);
}

// ── File / demo loading ──────────────────────────────────────────────────

function afterDataLoaded(t, meta) {
  const cmdFile = document.getElementById(`${t}-cmd-file`);
  document.getElementById(`${t}-file-name`).textContent = meta.name;
  document.getElementById(`${t}-file-meta`).textContent = meta.sub;
  cmdFile.style.display = 'flex';
  document.getElementById(`${t}-btn-importcfg`).disabled = false;

  showColumnMappingScreen(t, {
    onConfirm: () => {
      document.getElementById(`${t}-cmd-map`).style.display = 'flex';
      document.getElementById(`${t}-btn-run`).disabled = false;
      document.getElementById(`${t}-btn-exportcfg`).disabled = false;
      runDQ(t);
      runAnalysis(t, () => renderDashboard(t));
      document.getElementById(`${t}-btn-export`).disabled = !getState(t).analyzed;
      renderDashboard(t);
    },
  });
}

export function handleFile(t, file) {
  if (!file) return;
  const reader = new FileReader();
  const isCSV = file.name.endsWith('.csv');
  reader.onload = e => {
    try {
      // raw:true for CSV only — without it, SheetJS's per-cell type-guessing
      // can silently mangle ambiguous text like "<0.02" into a bogus date
      // serial number (confirmed: "<0.01" parses fine as text but "<0.02"
      // gets guessed as a date and corrupted to 36557). XLSX/XLS files carry
      // real cell types from the binary format, so they don't need this.
      const wb = isCSV ? XLSX.read(e.target.result, { type: 'binary', raw: true }) : XLSX.read(e.target.result, { type: 'array' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      setRaw(t, data);
      afterDataLoaded(t, { name: file.name, sub: `${data.length} ${LANG === 'en' ? 'rows' : 'แถว'} · ${getState(t).cols.length} cols` });
    } catch (err) {
      alert((LANG === 'en' ? 'Load failed: ' : 'โหลดไม่สำเร็จ: ') + err.message);
    }
  };
  isCSV ? reader.readAsBinaryString(file) : reader.readAsArrayBuffer(file);
}

export function loadDemoInto(t, data, meta) {
  setRaw(t, data);
  afterDataLoaded(t, meta);
}

// ── Data Quality check ───────────────────────────────────────────────────

const BDL_METHOD_LABEL = {
  exclude: { th: 'ไม่รวมในการคำนวณ', en: 'Exclude' },
  zero: { th: 'แทนด้วย 0', en: 'Zero' },
  half: { th: 'ครึ่งหนึ่งของ detection limit', en: 'Half detection limit' },
};

function bdlNoteHtml(count, method, isEN) {
  if (!count || method !== 'exclude') return '';
  const methodLabel = isEN ? BDL_METHOD_LABEL.exclude.en : BDL_METHOD_LABEL.exclude.th;
  return `<div class="dq-item">${isEN
    ? `${count} BDL reading(s) excluded from calculations (method: ${methodLabel}).`
    : `พบค่า BDL ${count} รายการ ถูกไม่รวมในการคำนวณ (วิธี: ${methodLabel})`}</div>`;
}

export function runDQ(t) {
  const state = getState(t);
  const wrap = document.getElementById(`${t}-dq-wrap`);
  if (!wrap || !state.raw.length) return;
  const isEN = LANG === 'en';
  const paramCols = getParamCols(t);
  const bdlMethod = getBdlMethod(t);
  const issues = [];
  let bdlCount = 0;

  paramCols.forEach(col => {
    const nonNum = [];
    state.raw.forEach((r, i) => {
      const v = r[col];
      if (v == null || v === '') return;
      if (parseBdl(v)) { bdlCount++; return; }
      if (!isNumericValue(v)) nonNum.push({ row: i + 2, val: v });
    });
    if (nonNum.length) issues.push({ col: resolveCanonical(t, col), samples: nonNum.slice(0, 3) });
  });

  const bdlNote = bdlNoteHtml(bdlCount, bdlMethod, isEN);

  if (!issues.length) {
    wrap.innerHTML = `<div class="dq-wrap dq-ok"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>${isEN ? 'Data quality check passed — no issues' : 'ข้อมูลผ่านการตรวจสอบ — ไม่พบปัญหา'}${bdlNote}</div>`;
    return;
  }
  wrap.innerHTML = `<div class="dq-wrap dq-warn">
    <div class="dq-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${isEN ? 'Non-numeric values found' : 'พบค่าที่ไม่ใช่ตัวเลข'}</div>
    ${issues.map(i => `<div class="dq-item"><b>${i.col}</b>: ${i.samples.map(s => `${isEN ? 'row' : 'แถว'} ${s.row} = "${s.val}"`).join(', ')}</div>`).join('')}
    ${bdlNote}
  </div>`;
}

// ── Field-picker popover ─────────────────────────────────────────────────

const FP_PRESETS = {
  overview: [],
  location: ['year', 'loc'],
  station: ['st'],
};

function wireFieldPicker(t) {
  const btn = document.querySelector(`[data-fp-toggle="${t}"]`);
  const popover = document.getElementById(`${t}-fp-popover`);
  if (!btn || !popover) return;
  btn.addEventListener('click', e => { e.stopPropagation(); popover.classList.toggle('open'); });
  document.addEventListener('click', e => {
    if (popover.classList.contains('open') && !popover.contains(e.target) && e.target !== btn) popover.classList.remove('open');
  });
  popover.querySelectorAll('.fp-check').forEach(cb => cb.addEventListener('change', () => renderDashboard(t)));
  popover.querySelectorAll('.fp-preset').forEach(btn => btn.addEventListener('click', () => {
    const fields = FP_PRESETS[btn.dataset.preset] || [];
    popover.querySelectorAll('.fp-check').forEach(cb => { cb.checked = fields.includes(cb.value); });
    renderDashboard(t);
  }));
}

// ── View nav (Data Overview / Standards) ─────────────────────────────────

function wireViewNav(t) {
  document.querySelectorAll(`#page-${t} .view-nav-btn`).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`#page-${t} .view-nav-btn`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll(`#page-${t} .view-pane`).forEach(p => p.classList.remove('active'));
      document.getElementById(`${t}-view-${btn.dataset.viewBtn}`).classList.add('active');
      const titleEl = document.getElementById(`${t}-view-title`);
      if (titleEl) titleEl.textContent = btn.textContent.trim();
      if (btn.dataset.viewBtn === 'standards') renderStandardsUI(t);
      if (btn.dataset.viewBtn === 'refmap') renderRefBaselineUI(t);
      if (btn.dataset.viewBtn === 'comparison') renderComparisonUI(t);
      if (btn.dataset.viewBtn === 'report') renderReportUI(t);
    });
  });
}

// ── Main wiring entry point ──────────────────────────────────────────────

export function wireEvents(t, { loadDemo, downloadTemplate, doExport }) {
  const el = document.getElementById(`page-${t}`);
  if (!el) return;

  const fi = document.getElementById(`${t}-fi`);
  fi.addEventListener('change', () => handleFile(t, fi.files[0]));
  document.getElementById(`${t}-btn-upload`).addEventListener('click', () => fi.click());

  el.querySelectorAll(`[data-demo="${t}"]`).forEach(btn => btn.addEventListener('click', () => loadDemo(t)));
  el.querySelectorAll(`[data-template="${t}"]`).forEach(btn => btn.addEventListener('click', () => downloadTemplate(t)));
  el.querySelectorAll(`[data-export="${t}"]`).forEach(btn => btn.addEventListener('click', () => doExport(t)));

  el.querySelectorAll(`[data-run="${t}"]`).forEach(btn => btn.addEventListener('click', () => {
    runAnalysis(t, () => renderDashboard(t));
    document.getElementById(`${t}-btn-export`).disabled = !getState(t).analyzed;
  }));

  el.querySelectorAll(`[data-editmap="${t}"]`).forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    showColumnMappingScreen(t, {
      prefill: getState(t).colMap,
      onConfirm: () => {
        runDQ(t);
        runAnalysis(t, () => renderDashboard(t));
      },
    });
  }));

  el.querySelectorAll(`[data-exportcfg="${t}"]`).forEach(btn => btn.addEventListener('click', () => exportConfigTemplate(t)));
  el.querySelectorAll(`[data-importcfg="${t}"]`).forEach(btn => btn.addEventListener('click', () => document.getElementById(`${t}-importmap-fi`)?.click()));
  document.getElementById(`${t}-importmap-fi`)?.addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    importConfigTemplate(t, f, (draft, json) => {
      if (json.standardsLibrary) setStandards(t, json.standardsLibrary);
      if (json.refMap) setRefMap(t, json.refMap);
      if (json.baselineMap) setBaselineMap(t, json.baselineMap);
      if (json.depthSummaryMethod) setDepthSummaryMethod(t, json.depthSummaryMethod);
      if (json.cmpSettings) setCmpSettings(t, json.cmpSettings);
      if (json.customCmp) setCustomCmp(t, json.customCmp);
      showColumnMappingScreen(t, {
        prefill: draft,
        onConfirm: () => {
          document.getElementById(`${t}-cmd-map`).style.display = 'flex';
          document.getElementById(`${t}-btn-run`).disabled = false;
          document.getElementById(`${t}-btn-exportcfg`).disabled = false;
          runDQ(t);
          runAnalysis(t, () => renderDashboard(t));
        },
      });
    });
  });

  document.getElementById(`${t}-outlier`)?.addEventListener('input', () => renderDashboard(t));
  document.getElementById(`${t}-bdl-method`)?.addEventListener('change', e => {
    setBdlMethod(t, e.target.value);
    runAnalysis(t, () => renderDashboard(t));
    runDQ(t);
  });
  wireFieldPicker(t);
  wireViewNav(t);

  window.addEventListener('aer-standards-changed', e => {
    if (e.detail?.t !== t) return;
    runAnalysis(t, () => renderDashboard(t));
  });

  window.addEventListener('aer-refmap-changed', e => {
    if (e.detail?.t !== t) return;
    const comparisonPane = document.getElementById(`${t}-view-comparison`);
    if (comparisonPane?.classList.contains('active')) renderComparisonUI(t);
  });
}
