/**
 * comparisons.js — Tab 2 comparison engine (pure computation, no DOM)
 *
 * Two-level aggregation pipeline shared by all formats:
 *   raw analysis rows → station-level (collapses depth readings for
 *   Seawater, via the chosen Avg/Mode/Median method) → location-level
 *   (aggregates station-level values again, same method).
 */

import { getState, getRefMap, getBaselineMap, getDepthSummaryMethod } from './state.js';

/** Avg/Mode/Median of a number array */
export function aggregate(vals, method) {
  if (!vals.length) return null;
  if (method === 'median') {
    const s = [...vals].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  if (method === 'mode') {
    const freq = {};
    let best = vals[0], bestN = 0;
    vals.forEach(v => {
      const k = +v.toFixed(6);
      freq[k] = (freq[k] || 0) + 1;
      if (freq[k] > bestN) { bestN = freq[k]; best = k; }
    });
    return best;
  }
  return vals.reduce((a, b) => a + b, 0) / vals.length; // avg
}

/** Station-level values for one parameter: groups raw rows by (station,
    year) and aggregates — collapses Seawater's depth-level readings via
    the tab's chosen method; a no-op aggregation for Sediment (or for any
    station/year with only one raw reading either way). */
export function getStationLevelValues(t, pk) {
  const method = getDepthSummaryMethod(t);
  const rows = getState(t).rows.filter(r => r.pk === pk);
  const groups = {};
  rows.forEach(r => {
    const k = r.st + '||' + r.yr;
    (groups[k] ??= { st: r.st, loc: r.loc, yr: r.yr, vals: [] }).vals.push(r.val);
  });
  return Object.values(groups).map(g => ({ st: g.st, loc: g.loc, yr: g.yr, val: aggregate(g.vals, method) }));
}

/** Location-level values for one parameter: aggregates station-level
    values (from getStationLevelValues) again, grouped by (location, year) */
export function getLocationLevelValues(t, pk) {
  const method = getDepthSummaryMethod(t);
  const stationVals = getStationLevelValues(t, pk);
  const groups = {};
  stationVals.forEach(sv => {
    const k = sv.loc + '||' + sv.yr;
    (groups[k] ??= { loc: sv.loc, yr: sv.yr, vals: [] }).vals.push(sv.val);
  });
  return Object.values(groups).map(g => ({ loc: g.loc, yr: g.yr, val: aggregate(g.vals, method) }));
}

/** Resolve a Location's configured REF (or Baseline) value for a parameter
    at a given year — aggregates the assigned station(s)' station-level
    values together. Returns null if the Location has no stations assigned
    for this role, or no data exists for the requested year. */
function resolveRoleValue(t, map, loc, pk, yr, yearMode, fixedYear) {
  const stations = map?.[loc];
  if (!stations || !stations.length) return null;
  const targetYr = yearMode === 'fixed' && fixedYear != null ? fixedYear : yr;
  const stationVals = getStationLevelValues(t, pk).filter(
    sv => stations.includes(sv.st) && String(sv.yr) === String(targetYr)
  );
  if (!stationVals.length) return null;
  return aggregate(stationVals.map(sv => sv.val), getDepthSummaryMethod(t));
}

export function getRefValueFor(t, loc, pk, yr, yearMode, fixedYear) {
  return resolveRoleValue(t, getRefMap(t), loc, pk, yr, yearMode, fixedYear);
}
export function getBaselineValueFor(t, loc, pk, yr, yearMode, fixedYear) {
  return resolveRoleValue(t, getBaselineMap(t), loc, pk, yr, yearMode, fixedYear);
}

function pctDiff(compareVal, refVal) {
  if (refVal === 0) return compareVal === 0 ? 0 : Infinity;
  return (compareVal - refVal) / Math.abs(refVal) * 100;
}

function statusFor(diff, threshold) {
  if (diff == null) return 'no_ref';
  return Math.abs(diff) >= threshold ? 'different' : 'close';
}

/** Station vs Reference: each station's own value vs its Location's REF */
export function compareStationVsRef(t, pk, settings) {
  const stationVals = getStationLevelValues(t, pk);
  return stationVals.map(sv => {
    const refVal = getRefValueFor(t, sv.loc, pk, sv.yr, settings.yearMode, settings.fixedYear);
    const diff = refVal != null ? pctDiff(sv.val, refVal) : null;
    return { group: sv.st, loc: sv.loc, yr: sv.yr, compareVal: sv.val, refVal, pctDiff: diff, status: statusFor(diff, settings.threshold) };
  });
}

/** Location vs Baseline: each Location's own value vs its Baseline */
export function compareLocationVsBaseline(t, pk, settings) {
  const locVals = getLocationLevelValues(t, pk);
  return locVals.map(lv => {
    const baseVal = getBaselineValueFor(t, lv.loc, pk, lv.yr, settings.yearMode, settings.fixedYear);
    const diff = baseVal != null ? pctDiff(lv.val, baseVal) : null;
    return { group: lv.loc, loc: lv.loc, yr: lv.yr, compareVal: lv.val, refVal: baseVal, pctDiff: diff, status: statusFor(diff, settings.threshold) };
  });
}

/** Location vs Year: every year's Location value vs the chosen base year's
    value for that same Location */
export function compareLocationVsYear(t, pk, settings) {
  if (settings.baseYear == null) return [];
  const locVals = getLocationLevelValues(t, pk);
  const byLoc = {};
  locVals.forEach(lv => { (byLoc[lv.loc] ??= []).push(lv); });
  const out = [];
  Object.entries(byLoc).forEach(([loc, vals]) => {
    const base = vals.find(v => String(v.yr) === String(settings.baseYear));
    if (!base) return;
    vals.forEach(v => {
      if (String(v.yr) === String(settings.baseYear)) return;
      const diff = pctDiff(v.val, base.val);
      out.push({ group: loc, loc, yr: v.yr, compareVal: v.val, refVal: base.val, pctDiff: diff, status: statusFor(diff, settings.threshold) });
    });
  });
  return out;
}

/** All years present across a tab's analyzed rows, sorted ascending —
    used to populate the "base year" selector for Location vs Year */
export function getAvailableYears(t) {
  return [...new Set(getState(t).rows.map(r => r.yr).filter(y => y != null))].sort((a, b) => a - b);
}

/** All Locations present in the analyzed data, sorted */
export function getAvailableLocations(t) {
  return [...new Set(getState(t).rows.map(r => r.loc))].sort();
}
