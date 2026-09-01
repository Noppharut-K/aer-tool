/**
 * report.js — narrative Report tab data layer (pure, no DOM). Aggregates
 * what Data Overview and Comparison already compute (standards exceedance,
 * default + custom comparison results) into per-group summaries, grouped
 * by Station, Location, or Year. No new statistics — this is a thin
 * summarization/filtering layer over the existing engine.
 */

import { getState, getParamCols, resolveCanonical, getStandardFor, getCmpSettings, getCustomCmp, getRefMap, getBaselineMap } from './state.js';
import { compareStationVsRef, compareLocationVsBaseline, compareLocationVsYear, compareCustom } from './comparisons.js';

const GRAIN_ROWKEY = { station: 'st', location: 'loc', year: 'yr' };

function allParams(t) {
  return [...new Set(getParamCols(t).map(c => resolveCanonical(t, c)))].sort();
}

export function getReportGroups(t, grain) {
  const rows = getState(t).rows;
  const key = GRAIN_ROWKEY[grain];
  const keys = [...new Set(rows.map(r => r[key]))].filter(k => k != null).sort();
  return keys.map(k => summarizeGroup(t, grain, k, rows.filter(r => r[key] === k)));
}

function summarizeGroup(t, grain, key, rows) {
  const years = [...new Set(rows.map(r => r.yr))].filter(y => y != null).sort((a, b) => a - b);
  const stationCount = new Set(rows.map(r => r.st)).size;
  const locationCount = new Set(rows.map(r => r.loc)).size;
  const loc = grain === 'station' ? rows[0]?.loc ?? null : null;

  const byPk = {};
  rows.forEach(r => { (byPk[r.pk] ??= []).push(r); });

  const exceeding = [];
  let notSetCount = 0;
  Object.entries(byPk).forEach(([pk, prows]) => {
    const std = getStandardFor(t, pk);
    if (!std) { notSetCount++; return; }
    const badRows = prows.filter(r => r.sc_status === 'exceed');
    if (!badRows.length) return;
    const worst = badRows.reduce((a, b) => Math.abs(b.val - std.value) > Math.abs(a.val - std.value) ? b : a);
    exceeding.push({ pk, value: worst.val, unit: worst.unit, std, exceedCount: badRows.length });
  });

  return {
    key, grain, n: rows.length, paramCount: Object.keys(byPk).length,
    years, stationCount, locationCount, loc,
    exceeding, notSetCount,
    diffing: getComparisonHighlights(t, grain, key),
  };
}

function getComparisonHighlights(t, grain, key) {
  const out = [];
  const params = allParams(t);
  const cmpSettings = getCmpSettings(t);
  const customs = getCustomCmp(t);

  if (grain === 'year') {
    params.forEach(pk => {
      compareStationVsRef(t, pk, cmpSettings.stRef).forEach(r => { if (String(r.yr) === String(key) && r.status === 'different') out.push({ pk, pctDiff: r.pctDiff, fmt: 'Station vs Reference' }); });
      compareLocationVsBaseline(t, pk, cmpSettings.locBase).forEach(r => { if (String(r.yr) === String(key) && r.status === 'different') out.push({ pk, pctDiff: r.pctDiff, fmt: 'Location vs Baseline' }); });
      compareLocationVsYear(t, pk, cmpSettings.locYear).forEach(r => { if (String(r.yr) === String(key) && r.status === 'different') out.push({ pk, pctDiff: r.pctDiff, fmt: 'Location vs Year' }); });
      customs.forEach(def => { compareCustom(t, pk, def).forEach(r => { if (String(r.yr) === String(key) && r.status === 'different') out.push({ pk, pctDiff: r.pctDiff, fmt: def.name }); }); });
    });
    return out;
  }

  const subjectKind = grain === 'station' ? 'station' : 'location';
  params.forEach(pk => {
    if (subjectKind === 'station') {
      compareStationVsRef(t, pk, cmpSettings.stRef).forEach(r => { if (r.group === key && r.status === 'different') out.push({ pk, pctDiff: r.pctDiff, fmt: 'Station vs Reference' }); });
    } else {
      compareLocationVsBaseline(t, pk, cmpSettings.locBase).forEach(r => { if (r.group === key && r.status === 'different') out.push({ pk, pctDiff: r.pctDiff, fmt: 'Location vs Baseline' }); });
      compareLocationVsYear(t, pk, cmpSettings.locYear).forEach(r => { if (r.group === key && r.status === 'different') out.push({ pk, pctDiff: r.pctDiff, fmt: 'Location vs Year' }); });
    }
    customs.forEach(def => {
      if (def.subjectKind !== subjectKind) return;
      compareCustom(t, pk, def).forEach(r => { if (r.group === key && r.status === 'different') out.push({ pk, pctDiff: r.pctDiff, fmt: def.name }); });
    });
  });
  return out;
}

/** Whether the tab has any REF/Baseline configured at all — used to decide
    whether the comparison sentence applies or should be omitted entirely. */
export function hasAnyComparisonConfigured(t) {
  const ref = getRefMap(t), base = getBaselineMap(t);
  return !!((ref && Object.keys(ref).length) || (base && Object.keys(base).length));
}
