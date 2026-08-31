/**
 * Application state management
 * Replaces the global S={} object from the original single-file implementation
 *
 * Each tab (sea, sed, bio) has its own TabState object.
 */

import { STD } from './standards.js';

/** @typedef {Object} TabState
 * @property {any[]}   raw      - Raw rows from uploaded file / demo
 * @property {string[]} cols    - Column names from the uploaded file
 * @property {any[]}   rows     - Processed analysis rows
 * @property {boolean} analyzed - Whether _runCore has completed
 * @property {?Object} colMap   - Confirmed column mapping (see columnMapping.js), null until confirmed
 * @property {boolean} mappingConfirmed - Whether colMap has been confirmed for the current upload
 * @property {?Object} stdOverrides - Per-parameter standards overrides (see setStdOverrides()), null = none
 * @property {?Object} refMap      - { [location]: string[] } REF stations per Location, null = none configured
 * @property {?Object} baselineMap - { [location]: string[] } Baseline stations per Location, null = none configured
 */

/** Create a fresh empty state for a tab */
function createTabState() {
  return {
    raw:      [],
    cols:     [],
    rows:     [],
    analyzed: false,
    colMap:   null,   // see setColMap() — null until the mapping screen is confirmed
    mappingConfirmed: false,
    stdOverrides: null, // see setStdOverrides() — NOT reset by setRaw(): standards
                         // belong to the tab (sea/sed), not to any one uploaded file
    refMap:      null, // see setRefMap() — reset by setRaw(): station names are file-specific
    baselineMap: null, // see setBaselineMap() — same reasoning
  };
}

/** Global state map: tabId → TabState */
const _state = {};

const TABS = ['sea', 'sed', 'bio'];

// Initialise all tabs
TABS.forEach(t => { _state[t] = createTabState(); });

/** Get state for a tab (creates if missing) */
export function getState(t) {
  if (!_state[t]) _state[t] = createTabState();
  return _state[t];
}

/** Reset state for a tab */
export function resetState(t) {
  _state[t] = createTabState();
}

/** Set raw data for a tab — clears any previously confirmed column mapping,
    since a new upload may have a different structure and per the "no
    persistence" rule the mapping screen must always be re-confirmed */
export function setRaw(t, raw) {
  if (!_state[t]) _state[t] = createTabState();
  _state[t].raw  = raw;
  _state[t].cols = raw.length > 0 ? Object.keys(raw[0]) : [];
  _state[t].analyzed = false;
  _state[t].colMap = null;
  _state[t].mappingConfirmed = false;
  _state[t].refMap = null;
  _state[t].baselineMap = null;
}

/** Set analysis rows for a tab */
export function setRows(t, rows) {
  if (!_state[t]) _state[t] = createTabState();
  _state[t].rows     = rows;
  _state[t].analyzed = true;
}

/** Check if tab has been analyzed */
export function isAnalyzed(t) {
  return !!(_state[t] && _state[t].analyzed);
}

/** Get raw rows */
export function getRaw(t) {
  return _state[t]?.raw || [];
}

/** Get processed rows */
export function getRows(t) {
  return _state[t]?.rows || [];
}

/** Get column names */
export function getCols(t) {
  return _state[t]?.cols || [];
}

/** Get the raw-file column mapped to a logical field (year/loc/st/...),
    from the confirmed column-mapping screen — replaces the old DOM read
    of a sidebar <select>, which no longer exists */
export function getColVal(t, key) {
  return _state[t]?.colMap?.fields?.[key] || null;
}

/** Store the confirmed column mapping for a tab (see columnMapping.js for
    the exact shape: { version, fields, params, depthSummaryMethod, sourceColumns }) */
export function setColMap(t, colMap) {
  if (!_state[t]) _state[t] = createTabState();
  _state[t].colMap = colMap;
  _state[t].mappingConfirmed = true;
}

/** Get the full confirmed column-mapping object for a tab (or null) */
export function getColMap(t) {
  return _state[t]?.colMap || null;
}

/** Whether this tab's column mapping has been confirmed for the current upload */
export function isMappingConfirmed(t) {
  return !!_state[t]?.mappingConfirmed;
}

/** Raw-file columns whose mapped role is "Parameter" and are included */
export function getParamCols(t) {
  const cm = _state[t]?.colMap;
  if (!cm || !cm.params) return [];
  return Object.keys(cm.params).filter(c => cm.params[c].include);
}

/** Canonical parameter name for a raw column, per the confirmed mapping
    (falls back to the raw column name itself if unmapped) */
export function resolveCanonical(t, col) {
  return _state[t]?.colMap?.params?.[col]?.canonical || col;
}

/** Store per-parameter standards overrides for a tab (see actions.js's
    Standards tab for the editing UI). Shape: { [param]: { source?, pcd_min?,
    pcd_max?, erl?, erm?, who_min?, who_max?, epa_min?, epa_max?, mrl? } } */
export function setStdOverrides(t, overrides) {
  if (!_state[t]) _state[t] = createTabState();
  _state[t].stdOverrides = overrides;
}

/** Get the raw overrides object for a tab (or null if none set) */
export function getStdOverrides(t) {
  return _state[t]?.stdOverrides || null;
}

/** Effective standard definition for one parameter: base STD[t][param] with
    any override merged in field-by-field (override wins per-field, base
    fills in anything the override doesn't set). If the param exists only as
    an override (net-new), the override alone is returned. */
export function getEffectiveStd(t, param) {
  const base = STD[t]?.[param];
  const ov   = _state[t]?.stdOverrides?.[param];
  if (!base && !ov) return null;
  return { ...(base || {}), ...(ov || {}) };
}

/** Effective standards dict for a whole tab: base ∪ overrides */
export function getEffectiveStdAll(t) {
  const base = STD[t] || {};
  const ov   = _state[t]?.stdOverrides || {};
  const keys = new Set([...Object.keys(base), ...Object.keys(ov)]);
  const out = {};
  keys.forEach(k => { out[k] = { ...(base[k] || {}), ...(ov[k] || {}) }; });
  return out;
}

/** Effective MRL (Minimum Reporting Level) for a parameter — a field on the
    same override object as thresholds, not a separate store */
export function getEffectiveMRL(t, param) {
  return getEffectiveStd(t, param)?.mrl ?? null;
}

/** Store the per-Location REF station map for a tab: { [location]: string[] } */
export function setRefMap(t, map) {
  if (!_state[t]) _state[t] = createTabState();
  _state[t].refMap = map;
}

/** Get the per-Location REF station map for a tab (or null if none configured) */
export function getRefMap(t) {
  return _state[t]?.refMap || null;
}

/** Store the per-Location Baseline station map for a tab: { [location]: string[] } */
export function setBaselineMap(t, map) {
  if (!_state[t]) _state[t] = createTabState();
  _state[t].baselineMap = map;
}

/** Get the per-Location Baseline station map for a tab (or null if none configured) */
export function getBaselineMap(t) {
  return _state[t]?.baselineMap || null;
}

/** REF stations configured for a given Location (cross-Location assignment
    allowed — the returned stations aren't necessarily within `location`
    themselves). Returns null if no per-Location mapping exists at all yet
    (caller should fall back to whatever legacy behavior makes sense), or an
    empty array if the Location exists in the map but has no REF stations set. */
export function getRefStationsFor(t, location) {
  const m = getRefMap(t);
  if (!m) return null;
  return m[location] || [];
}

/** Baseline equivalent of getRefStationsFor() */
export function getBaselineStationsFor(t, location) {
  const m = getBaselineMap(t);
  if (!m) return null;
  return m[location] || [];
}

/** Re-export tab list */
export { TABS };
