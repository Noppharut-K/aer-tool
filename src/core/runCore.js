/**
 * runCore.js — wide → long unpivot + per-row standard/outlier evaluation
 */

import { getState, setRows, getColVal, getParamCols, resolveCanonical, getStandardFor } from './state.js';
import { checkStandard, computeOutlierStats, isNumericValue } from './analysis.js';

/** Fixed baseline z-score threshold for the row-level dq_flag tag — distinct
    from the dashboard's adjustable-threshold display filter, which
    recomputes live from the UI at render time instead of being baked in here */
const DQ_OUTLIER_Z = 3;

const gM = (row, col) => (col && row[col] != null ? String(row[col]) : '—');

export function runCore(t) {
  const state = getState(t);
  const colArea = getColVal(t, 'area');
  const colProj = getColVal(t, 'project');
  const colLoc = getColVal(t, 'loc');
  const colSt = getColVal(t, 'st');
  const colYr = getColVal(t, 'year');
  const colDir = getColVal(t, 'direction');
  const colUtmN = getColVal(t, 'utmN');
  const colUtmE = getColVal(t, 'utmE');
  const colWl = getColVal(t, 'wl');
  const paramCols = getParamCols(t);

  const rows = [];
  state.raw.forEach(raw => {
    paramCols.forEach(col => {
      if (!isNumericValue(raw[col])) return;
      const val = parseFloat(raw[col]);
      const pk = resolveCanonical(t, col);
      const std = getStandardFor(t, pk);
      rows.push({
        area: gM(raw, colArea),
        proj: gM(raw, colProj),
        loc: gM(raw, colLoc),
        st: gM(raw, colSt),
        yr: colYr && raw[colYr] != null ? parseFloat(raw[colYr]) : null,
        direction: gM(raw, colDir),
        utmN: colUtmN && raw[colUtmN] != null ? parseFloat(raw[colUtmN]) : null,
        utmE: colUtmE && raw[colUtmE] != null ? parseFloat(raw[colUtmE]) : null,
        wl: colWl && raw[colWl] != null ? String(raw[colWl]).trim() : null,
        col, pk, val,
        unit: std?.unit || '',
        sc_status: checkStandard(std, val).status,
        dq_flag: null,
      });
    });
  });

  // Second pass: flag statistical outliers per parameter (fixed baseline
  // threshold — the dashboard's adjustable slider recomputes live instead)
  const byPk = {};
  rows.forEach(r => { (byPk[r.pk] ??= []).push(r); });
  Object.values(byPk).forEach(group => {
    const { isOutlier } = computeOutlierStats(group.map(r => r.val), DQ_OUTLIER_Z);
    group.forEach(r => { if (isOutlier(r.val)) r.dq_flag = 'outlier'; });
  });

  setRows(t, rows);
  return rows;
}
