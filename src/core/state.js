/**
 * Application state management
 * Replaces the global S={} object from the original single-file implementation
 *
 * Each tab (sea, sed, sw, air, noise, bio) has its own TabState object.
 */

/** @typedef {Object} TabState
 * @property {any[]}   raw      - Raw rows from uploaded file / demo
 * @property {string[]} cols    - Column names from the uploaded file
 * @property {any[]}   rows     - Processed analysis rows
 * @property {boolean} analyzed - Whether _runCore has completed
 */

/** Create a fresh empty state for a tab */
function createTabState() {
  return {
    raw:      [],
    cols:     [],
    rows:     [],
    analyzed: false,
  };
}

/** Global state map: tabId → TabState */
const _state = {};

const TABS = ['sea', 'sed', 'sw', 'air', 'noise', 'bio'];

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

/** Set raw data for a tab */
export function setRaw(t, raw) {
  if (!_state[t]) _state[t] = createTabState();
  _state[t].raw  = raw;
  _state[t].cols = raw.length > 0 ? Object.keys(raw[0]) : [];
  _state[t].analyzed = false;
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

/** Convenience: get value of a column selector element */
export function getColVal(t, key) {
  return document.getElementById(`${t}-c-${key}`)?.value || null;
}

/** Re-export tab list */
export { TABS };
