/**
 * runCore.js — wide → long unpivot + per-row standard/outlier evaluation
 */

import { getState, setRows, getColVal, getColMap, getParamCols, resolveCanonical, getStandardsFor, getBdlMethod } from './state.js';
import { checkStandardTiers, computeOutlierStats, isNumericValue, parseBdl } from './analysis.js';

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
  const bdlMethod = getBdlMethod(t);
  const layout = getColMap(t)?.layout || 'wide';

  const rows = [];

  /** Builds and pushes one long-format row, shared by both the wide
      (one column per parameter) and long (Parameter name + Value
      columns) unpivot paths below. `unitOverride`/`mrlOverride` let the
      long path supply per-row data the wide path never has — a Unit
      column (wins over the Standards Library's configured unit) and an
      MRL/detection-limit column (wins over both the BDL marker's own
      captured limit and the Standards Library's fixed fallback, since
      a real per-row limit is more accurate than one static number). */
  const pushRow = (raw, col, pk, cell, unitOverride, mrlOverride) => {
    const bdl = parseBdl(cell);
    if (!isNumericValue(cell) && !bdl) return;
    if (bdl && bdlMethod === 'exclude') return;

    const stds = getStandardsFor(t, pk);
    const std = stds[0]; // tier metadata (unit, fallback DL) shared across a parameter's tiers
    let val;
    if (!bdl) {
      val = parseFloat(cell);
    } else if (bdlMethod === 'half') {
      const limit = mrlOverride != null ? mrlOverride : (bdl.limit != null ? bdl.limit : std?.bdlFallbackLimit);
      val = limit != null ? limit / 2 : 0;
    } else {
      val = 0; // 'zero' method
    }
    const sc = checkStandardTiers(stds, val);
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
      unit: unitOverride || std?.unit || '',
      sc_status: sc.status,
      sc_tier: sc.tier ?? null,
      dq_flag: null,
      is_bdl: !!bdl,
      bdl_limit: bdl?.limit ?? null,
    });
  };

  if (layout === 'long') {
    const colParamName = getColVal(t, 'paramName');
    const colValue = getColVal(t, 'value');
    const colUnit = getColVal(t, 'unit');
    const colMrl = getColVal(t, 'mrl');
    state.raw.forEach(raw => {
      const pk = colParamName && raw[colParamName] != null ? String(raw[colParamName]).trim() : '';
      if (!pk) return;
      const unitOverride = colUnit && raw[colUnit] != null && raw[colUnit] !== '' ? String(raw[colUnit]).trim() : null;
      const mrlOverride = colMrl && isNumericValue(raw[colMrl]) ? parseFloat(raw[colMrl]) : null;
      pushRow(raw, colValue, pk, raw[colValue], unitOverride, mrlOverride);
    });
  } else {
    const paramCols = getParamCols(t);
    state.raw.forEach(raw => {
      paramCols.forEach(col => pushRow(raw, col, resolveCanonical(t, col), raw[col], null, null));
    });
  }

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
