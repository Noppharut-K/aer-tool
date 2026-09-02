/**
 * state.js — per-tab application state (sea / sed)
 *
 * Rebuilt fresh for the redesigned Tab 1. No config persists to
 * localStorage — everything here resets when the tab's data is replaced
 * or the page reloads (per the client's explicit "reset every time,
 * export/import a template instead" decision).
 */

/** @typedef {Object} StdEntry
 * @property {string} id
 * @property {string} parameter   - canonical parameter name (matches a raw column, case-sensitive as typed)
 * @property {'max'|'min'} direction - value is a maximum not to exceed, or a minimum not to fall below
 * @property {number} value
 * @property {string} unit
 * @property {string} source      - free text: standard name / issuing body
 * @property {?number} decimals   - display precision override for this parameter, null = auto
 */

/** @typedef {Object} TabState
 * @property {any[]}    raw       - Raw rows from uploaded file / demo
 * @property {string[]} cols      - Column names from the uploaded file
 * @property {?Object}  colMap    - Confirmed column mapping, null until confirmed (see columnMapping.js)
 * @property {any[]}    rows      - Processed long-format analysis rows
 * @property {boolean}  analyzed  - Whether runCore() has completed
 * @property {StdEntry[]} standards - User-entered standards library, starts empty
 */

function defaultCmpSettings() {
  return {
    stRef:   { yearMode: 'match', fixedYear: null, threshold: 20 },
    locBase: { yearMode: 'match', fixedYear: null, threshold: 20 },
    locYear: { baseYear: null, threshold: 20 },
  };
}

function createTabState() {
  return {
    raw: [],
    cols: [],
    colMap: null,
    rows: [],
    analyzed: false,
    standards: [],
    refMap: null,
    baselineMap: null,
    depthSummaryMethod: 'avg',
    cmpSettings: defaultCmpSettings(),
    customCmp: [],
    bdlMethod: 'exclude',
    statsMethod: 'none',
  };
}

const _state = {};
const TABS = ['sea', 'sed'];
TABS.forEach(t => { _state[t] = createTabState(); });

export function getState(t) {
  if (!_state[t]) _state[t] = createTabState();
  return _state[t];
}

/** New raw data replaces everything derived from the previous file — a
    different file may have different columns/parameters, so colMap and
    analysis results can't carry over; standards stay (they describe the
    tab/module, not any one upload) */
export function setRaw(t, raw) {
  const s = getState(t);
  s.raw = raw;
  s.cols = raw.length > 0 ? Object.keys(raw[0]) : [];
  s.colMap = null;
  s.rows = [];
  s.analyzed = false;
  s.refMap = null;
  s.baselineMap = null;
  s.cmpSettings = defaultCmpSettings();
  s.customCmp = [];
}

export function setColMap(t, colMap) {
  getState(t).colMap = colMap;
}

export function getColMap(t) {
  return getState(t).colMap;
}

/** Raw-file column mapped to a logical field (year/loc/st/...), or null */
export function getColVal(t, key) {
  return getState(t).colMap?.fields?.[key] || null;
}

/** Raw-file columns whose mapped role is "Parameter" */
export function getParamCols(t) {
  const cm = getState(t).colMap;
  if (!cm?.params) return [];
  return Object.keys(cm.params);
}

/** Canonical parameter name for a raw column, per the confirmed mapping */
export function resolveCanonical(t, col) {
  return getState(t).colMap?.params?.[col] || col;
}

export function setRows(t, rows) {
  const s = getState(t);
  s.rows = rows;
  s.analyzed = true;
}

export function isAnalyzed(t) {
  return !!getState(t).analyzed;
}

// ── Standards library ─────────────────────────────────────────────────────

export function getStandards(t) {
  return getState(t).standards;
}

/** The one standard entered for a parameter, or null if none set yet */
export function getStandardFor(t, parameter) {
  return getState(t).standards.find(s => s.parameter === parameter) || null;
}

export function addStandard(t, entry) {
  const s = getState(t);
  const id = 'std_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  s.standards.push({ id, decimals: null, ...entry });
  return id;
}

export function updateStandard(t, id, patch) {
  const s = getState(t);
  const i = s.standards.findIndex(x => x.id === id);
  if (i === -1) return;
  s.standards[i] = { ...s.standards[i], ...patch };
}

export function removeStandard(t, id) {
  const s = getState(t);
  s.standards = s.standards.filter(x => x.id !== id);
}

export function setStandards(t, list) {
  getState(t).standards = list;
}

// ── REF / Baseline mapping ────────────────────────────────────────────────

/** { [location]: string[] } — every configured Location maps to zero or
    more REF stations (cross-Location assignment allowed) */
export function setRefMap(t, map) {
  getState(t).refMap = map;
}
export function getRefMap(t) {
  return getState(t).refMap;
}
export function setBaselineMap(t, map) {
  getState(t).baselineMap = map;
}
export function getBaselineMap(t) {
  return getState(t).baselineMap;
}

// ── Depth-level summarization (Seawater only) ─────────────────────────────

export function setDepthSummaryMethod(t, method) {
  getState(t).depthSummaryMethod = method;
}
export function getDepthSummaryMethod(t) {
  return getState(t).depthSummaryMethod;
}

// ── Below-detection-limit (BDL) handling ──────────────────────────────────

export function setBdlMethod(t, method) {
  getState(t).bdlMethod = method;
}
export function getBdlMethod(t) {
  return getState(t).bdlMethod;
}

// ── Statistical significance testing (Location-level comparisons) ────────

export function setStatsMethod(t, method) {
  getState(t).statsMethod = method;
}
export function getStatsMethod(t) {
  return getState(t).statsMethod;
}

// ── Comparison format settings ────────────────────────────────────────────

export function getCmpSettings(t) {
  return getState(t).cmpSettings;
}
export function updateCmpSettings(t, formatKey, patch) {
  const s = getState(t);
  s.cmpSettings[formatKey] = { ...s.cmpSettings[formatKey], ...patch };
}
export function setCmpSettings(t, settings) {
  getState(t).cmpSettings = { ...defaultCmpSettings(), ...settings };
}

// ── Custom comparisons (items 4–10) ───────────────────────────────────────

const CUSTOM_CMP_MAX = 7; // + 3 defaults = 10 total per module, per spec

export function getCustomCmp(t) {
  return getState(t).customCmp;
}

export function addCustomCmp(t, entry) {
  const s = getState(t);
  if (s.customCmp.length >= CUSTOM_CMP_MAX) return null;
  const id = 'cc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  s.customCmp.push({
    id, yearMode: 'match', fixedYear: null, baseYear: null, aggMethod: 'avg', threshold: 20,
    ...entry,
  });
  return id;
}

export function updateCustomCmp(t, id, patch) {
  const s = getState(t);
  const i = s.customCmp.findIndex(x => x.id === id);
  if (i === -1) return;
  s.customCmp[i] = { ...s.customCmp[i], ...patch };
}

export function removeCustomCmp(t, id) {
  const s = getState(t);
  s.customCmp = s.customCmp.filter(x => x.id !== id);
}

export function setCustomCmp(t, list) {
  getState(t).customCmp = list.slice(0, CUSTOM_CMP_MAX);
}

export { TABS };
