/**
 * report.js — Report tab data layer (pure, no DOM). Aggregates what Data
 * Overview and Comparison already compute into structured per-Station /
 * per-Location summaries: standards status, exceedances (with station
 * attribution at Location level), Min-Max ranges (Location level), and
 * multi-year trends against itself / Reference / Baseline. No new
 * statistics — everything is a filtered read of getStationLevelValues /
 * getLocationLevelValues / compareCustom (comparisons.js) and
 * getStandardsFor / calcStat.
 */

import { getState, getParamCols, resolveCanonical, getStandardsFor, getCmpSettings, getDepthSummaryMethod, getRefMap, getBaselineMap } from './state.js';
import { getStationLevelValues, getLocationLevelValues, compareCustom } from './comparisons.js';
import { calcStat } from './analysis.js';

const GRAIN_ROWKEY = { station: 'st', location: 'loc' };

function allParams(t) {
  return [...new Set(getParamCols(t).map(c => resolveCanonical(t, c)))].sort();
}

function sortedYears(rows) {
  return [...new Set(rows.map(r => r.yr))].filter(y => y != null).sort((a, b) => a - b);
}

/** First-year → last-year % change; null if <2 points or a null/zero base */
function trendDirection(points, field) {
  if (points.length < 2) return null;
  const first = points[0][field], last = points[points.length - 1][field];
  if (first == null || last == null || !isFinite(first) || !isFinite(last) || first === 0) return null;
  const pct = (last - first) / Math.abs(first) * 100;
  return Math.abs(pct) < 5 ? { label: 'stable', pct } : { label: pct > 0 ? 'up' : 'down', pct };
}

/** Exceeding parameters within a set of rows (already filtered to one
    Station or Location). At Location level (attributeStation) this dedupes
    to one entry per (parameter, station) pair, showing that station's
    worst reading — so the reader knows exactly which station exceeded.
    "Worst" ranks by severity tier first (a Critical breach always outranks
    a Watch breach), then by distance from that tier's own threshold. */
function getExceeding(t, rows, attributeStation) {
  const byPk = {};
  rows.forEach(r => { (byPk[r.pk] ??= []).push(r); });
  const exceeding = [];
  let notSetCount = 0, passCount = 0;
  Object.entries(byPk).forEach(([pk, prows]) => {
    const stds = getStandardsFor(t, pk); // severity-sorted least → most severe
    if (!stds.length) { notSetCount++; return; }
    const rankOf = tier => stds.findIndex(s => (s.tier || null) === tier);
    const isWorse = (b, a) => {
      const rb = rankOf(b.sc_tier), ra = rankOf(a.sc_tier);
      if (rb !== ra) return rb > ra;
      return Math.abs(b.val - stds[rb].value) > Math.abs(a.val - stds[ra].value);
    };
    const badRows = prows.filter(r => r.sc_status === 'exceed');
    if (!badRows.length) { passCount++; return; }
    const pushEntry = (r, st) => {
      const rank = rankOf(r.sc_tier);
      const std = stds[rank];
      exceeding.push({
        pk, ...(st != null ? { st } : {}), value: r.val, unit: r.unit, yr: r.yr, std,
        tier: std.tier || null, isMostSevere: rank === stds.length - 1,
      });
    };
    if (attributeStation) {
      const byStation = {};
      badRows.forEach(r => {
        const cur = byStation[r.st];
        if (!cur || isWorse(r, cur)) byStation[r.st] = r;
      });
      Object.entries(byStation).forEach(([st, r]) => pushEntry(r, st));
    } else {
      const worst = badRows.reduce((a, b) => isWorse(b, a) ? b : a);
      pushEntry(worst);
    }
  });
  return { exceeding, notSetCount, passCount };
}

/** When a Location's assigned Baseline station(s) only ever have data for
    a single year (the common "one-time baseline survey done once before a
    project starts" pattern), pin the trend comparison to that year instead
    of same-year matching — 'match' mode would otherwise never find an
    overlapping year against the subject's own (typically later, multi-
    year) readings, and the "Trend vs Baseline" section would always come
    back empty. A Baseline that does span multiple years keeps using
    'match' (the more meaningful behavior when a real per-year baseline
    exists). */
function singleBaselineYear(t, baselineStations) {
  if (!baselineStations?.length) return null;
  const years = [...new Set(getState(t).rows.filter(r => baselineStations.includes(r.st)).map(r => r.yr))].filter(y => y != null);
  return years.length === 1 ? years[0] : null;
}

/** Multi-year REF/Baseline comparison for one parameter and one specific
    subject (Station or Location), via compareCustom — same engine Tab 2's
    Custom Comparison builder uses, just filtered to one group and every
    year (not only 'different' years) to show the trend. Same-year matching
    by default; pass `fixedYear` to pin every point at a single Baseline
    year instead (see singleBaselineYear). */
function refBaselineTrend(t, pk, subjectKind, refKind, groupKey, method, threshold, fixedYear) {
  const def = {
    subjectKind, refKind, aggMethod: method, threshold,
    yearMode: fixedYear != null ? 'fixed' : 'match', fixedYear: fixedYear ?? null,
  };
  return compareCustom(t, pk, def)
    .filter(r => r.group === groupKey && r.refVal != null)
    .sort((a, b) => a.yr - b.yr);
}

export function getReportGroups(t, grain) {
  const rows = getState(t).rows;
  const key = GRAIN_ROWKEY[grain];
  const keys = [...new Set(rows.map(r => r[key]))].filter(k => k != null).sort();
  return keys.map(k => grain === 'station'
    ? summarizeStation(t, k, rows.filter(r => r.st === k))
    : summarizeLocation(t, k, rows.filter(r => r.loc === k)));
}

function summarizeStation(t, key, rows) {
  const loc = rows[0]?.loc ?? null;
  const years = sortedYears(rows);
  const method = getDepthSummaryMethod(t);
  const params = [...new Set(rows.map(r => r.pk))].sort();
  const cmpSettings = getCmpSettings(t);
  const { exceeding, notSetCount, passCount } = getExceeding(t, rows, false);

  const selfTrend = params.map(pk => {
    const points = getStationLevelValues(t, pk, method).filter(v => v.st === key).sort((a, b) => a.yr - b.yr);
    return { pk, points, trend: trendDirection(points, 'val') };
  }).filter(x => x.points.length >= 2);

  const hasRef = !!(getRefMap(t)?.[loc]?.length);
  const refTrend = hasRef ? params.map(pk => {
    const points = refBaselineTrend(t, pk, 'station', 'reference', key, method, cmpSettings.stRef.threshold);
    return { pk, points, trend: trendDirection(points, 'pctDiff') };
  }).filter(x => x.points.length) : [];

  const baselineStations = getBaselineMap(t)?.[loc];
  const hasBaseline = !!baselineStations?.length;
  const baselineFixedYear = hasBaseline ? singleBaselineYear(t, baselineStations) : null;
  const baselineTrend = hasBaseline ? params.map(pk => {
    const points = refBaselineTrend(t, pk, 'station', 'baseline', key, method, cmpSettings.stRef.threshold, baselineFixedYear);
    return { pk, points, trend: trendDirection(points, 'pctDiff') };
  }).filter(x => x.points.length) : [];

  return {
    grain: 'station', key, loc, n: rows.length, paramCount: params.length, years,
    exceeding, notSetCount, passCount, selfTrend, hasRef, refTrend, hasBaseline, baselineTrend,
  };
}

function summarizeLocation(t, key, rows) {
  const years = sortedYears(rows);
  const method = getDepthSummaryMethod(t);
  const params = [...new Set(rows.map(r => r.pk))].sort();
  const cmpSettings = getCmpSettings(t);
  const stationCount = new Set(rows.map(r => r.st)).size;
  const { exceeding, notSetCount, passCount } = getExceeding(t, rows, true);

  const minMax = params.map(pk => {
    const prows = rows.filter(r => r.pk === pk);
    const st = calcStat(prows.map(r => r.val));
    return { pk, min: st.min, max: st.max, unit: prows[0]?.unit };
  });

  const selfTrend = params.map(pk => {
    const points = getLocationLevelValues(t, pk, method).filter(v => v.loc === key).sort((a, b) => a.yr - b.yr);
    return { pk, points, trend: trendDirection(points, 'val') };
  }).filter(x => x.points.length >= 2);

  const baselineStations = getBaselineMap(t)?.[key];
  const hasBaseline = !!baselineStations?.length;
  const baselineFixedYear = hasBaseline ? singleBaselineYear(t, baselineStations) : null;
  const baselineTrend = hasBaseline ? params.map(pk => {
    const points = refBaselineTrend(t, pk, 'location', 'baseline', key, method, cmpSettings.locBase.threshold, baselineFixedYear);
    return { pk, points, trend: trendDirection(points, 'pctDiff') };
  }).filter(x => x.points.length) : [];

  return {
    grain: 'location', key, n: rows.length, paramCount: params.length, years, stationCount,
    exceeding, notSetCount, passCount, minMax, selfTrend, hasBaseline, baselineTrend,
  };
}
