/**
 * Application state management
 * Replaces the global S={} object from the original single-file implementation
 *
 * Each tab (sea, sed, bio) has its own TabState object.
 */

/** @typedef {Object} TabState
 * @property {any[]}   raw      - Raw rows from uploaded file / demo
 * @property {string[]} cols    - Column names from the uploaded file
 * @property {any[]}   rows     - Processed analysis rows
 * @property {boolean} analyzed - Whether _runCore has completed
 * @property {?Object} colMap   - Confirmed column mapping (see columnMapping.js), null until confirmed
 * @property {boolean} mappingConfirmed - Whether colMap has been confirmed for the current upload
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

/** Re-export tab list */
export { TABS };
