/**
 * runAnalysis.js — orchestrates the analysis pipeline: runCore → render
 */

import { getState } from './state.js';
import { runCore } from './runCore.js';

/**
 * @param {string} t
 * @param {() => void} onDone - re-render callback (dashboard + KPI strip)
 */
export function runAnalysis(t, onDone) {
  const state = getState(t);
  if (!state.raw.length || !state.colMap) return;
  runCore(t);
  onDone?.();
}
