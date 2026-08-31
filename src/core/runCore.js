/**
 * Core analysis engine
 * Processes raw rows into analysis rows with standard checks, filters, and stat cards
 */

import { LANG, L, T, Tf } from '../utils/lang.js';
import { chkStd, computeOutlierStats } from './analysis.js';
import { getState, setRows, getColVal, getParamCols, resolveCanonical, getEffectiveStd, getRefMap, getBaselineMap, getRefStationsFor, getBaselineStationsFor } from './state.js';

/** Fixed baseline z-score threshold for row-level dq_flag tagging — separate
    from Overview's adjustable-threshold display filter (renders.js), which
    recomputes live from the UI input instead of being baked in here */
const DQ_OUTLIER_Z = 3;

/** Get value from a row column, return '-' if missing */
const gM = (row, col) => col && row[col] != null ? String(row[col]) : '-';

/** Get the tab-wide set of REF station names — the union of every Location's
    configured REF stations (see the per-Location sidebar UI, refBaselineUI.js) */
function getRefSet(t) {
  return new Set(Object.values(getRefMap(t) ?? {}).flat());
}

/** Baseline equivalent of getRefSet() */
function getBsSet(t) {
  return new Set(Object.values(getBaselineMap(t) ?? {}).flat());
}

/** Values for a Location's OWN configured REF stations (cross-Location
    assignment is allowed, so these aren't necessarily physically within
    `location`) — falls back to the whole tab-wide REF pool if no
    per-Location mapping has been configured yet, so existing REF/Baseline
    picks keep working exactly as before a user visits the new sidebar UI */
export function getRefValsForLocation(t, location, pk) {
  const refStations = getRefStationsFor(t, location);
  return getState(t).rows
    .filter(r => r.is_ref && r.pk === pk && (refStations === null || refStations.includes(r.st)))
    .map(r => r.val);
}

/** Baseline equivalent of getRefValsForLocation() */
export function getBaselineValsForLocation(t, location, pk) {
  const bsStations = getBaselineStationsFor(t, location);
  return getState(t).rows
    .filter(r => r.is_baseline && r.pk === pk && (bsStations === null || bsStations.includes(r.st)))
    .map(r => r.val);
}

/** Get report type filter */
function filterByRtype(rows, t) {
  const colRtype = getColVal(t, 'rtype') || '';
  if (!colRtype) return rows;
  const sel = document.getElementById(t + '-rtype-sel');
  const selected = sel ? [...sel.querySelectorAll('input:checked')].map(i => i.value) : [];
  if (!selected.length) return rows;
  return rows.filter(r => selected.includes(String(r[colRtype] || '').trim()));
}

/** Populate a <select> element with options */
function fillSel(id, items, allLabel, valueMapper = x => x, labelMapper = x => x) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '';
  /* Built via DOM API (not string concat) — a location/parameter name
     containing a quote would otherwise truncate the option's value
     attribute, silently breaking that filter option */
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.className = 'f-all-opt';
  allOpt.textContent = allLabel;
  sel.appendChild(allOpt);
  items.forEach(x => {
    const opt = document.createElement('option');
    opt.value = valueMapper(x);
    opt.textContent = labelMapper(x);
    sel.appendChild(opt);
  });
}

/**
 * Main analysis engine — processes raw data and updates UI
 * @param {string} t - Tab identifier (sea, sed, bio)
 */
export function runCore(t) {
  const isEN = LANG === 'en';
  const state = getState(t);

  try {
    // Column mappings
    const colArea    = getColVal(t, 'area');
    const colProject = getColVal(t, 'project');
    const colLoc     = getColVal(t, 'loc');
    const colSt      = getColVal(t, 'st');
    const colYr      = getColVal(t, 'year');
    const colDist    = getColVal(t, 'dist');
    const colDirection = getColVal(t, 'direction');
    const colUtmN    = getColVal(t, 'utmN');
    const colUtmE    = getColVal(t, 'utmE');
    const colDate    = getColVal(t, 'date');
    const colWL      = getColVal(t, 'wl');

    const refSet   = getRefSet(t);
    const bsSet    = getBsSet(t);

    // Parameter columns come straight from the confirmed column mapping
    // (role = "Parameter"), no more DOM-scraping/heuristic detection.
    const paramCols = getParamCols(t);

    // Apply report type filter
    const rawFiltered = filterByRtype(state.raw, t);

    // Build analysis rows
    const rows = [];
    rawFiltered.forEach(row => {
      const isRef = colSt ? refSet.has(String(row[colSt] || '')) : false;
      paramCols.forEach(col => {
        if (row[col] == null || isNaN(parseFloat(row[col]))) return;
        const v      = parseFloat(row[col]);
        const pk     = resolveCanonical(t, col);
        const stdDef = getEffectiveStd(t, pk) || {};
        const sc     = chkStd(t, pk, v);
        const stName = gM(row, colSt);
        const isBs   = !isRef && bsSet.size > 0 && bsSet.has(stName);

        rows.push({
          area:       gM(row, colArea),
          proj:       gM(row, colProject),
          loc:        gM(row, colLoc),
          st:         stName,
          yr:         colYr && row[colYr] ? parseFloat(row[colYr]) : null,
          date:       colDate && row[colDate] ? String(row[colDate]) : null,
          dist:       colDist && row[colDist] != null ? parseFloat(row[colDist]) : null,
          direction:  gM(row, colDirection),
          utmN:       colUtmN && row[colUtmN] != null ? parseFloat(row[colUtmN]) : null,
          utmE:       colUtmE && row[colUtmE] != null ? parseFloat(row[colUtmE]) : null,
          wl:         colWL  && row[colWL]  != null ? String(row[colWL]).trim() : null,
          col, pk, val: v,
          unit:       stdDef.unit  || '',
          label:      stdDef.label || col,
          sc_status:  sc.status,
          sc_msg:     sc.msg,
          is_ref:     isRef,
          is_baseline: isBs,
          exceed:     sc.status === 'exceed' && !isRef && !isBs,
          dq_flag:    null, // set below, once each column's full value distribution is known
        });
      });
    });

    // Second pass: flag statistical outliers per parameter column, using a
    // fixed baseline threshold — distinct from Overview's adjustable-threshold
    // *display* filter, which is computed live at render time instead
    const byCol = {};
    rows.forEach(r => { (byCol[r.col] ??= []).push(r); });
    Object.values(byCol).forEach(group => {
      const { isOutlier } = computeOutlierStats(group.map(r => r.val), DQ_OUTLIER_Z);
      group.forEach(r => { if (isOutlier(r.val)) r.dq_flag = 'outlier'; });
    });

    // Save processed rows to state
    setRows(t, rows);

    // ── Stat cards ────────────────────────────────────────────────────────────
    const nr  = rows.filter(r => !r.is_ref);
    const er  = nr.filter(r => r.exceed);
    const allP = new Set(nr.map(r => r.col));
    const excP = new Set(er.map(r => r.col));

    _setCard(t, 'sc-st', new Set(nr.map(r => r.st)).size);
    _setCard(t, 'sc-p',  allP.size);
    _setCard(t, 'sc-ep', excP.size);
    _setCard(t, 'sc-es', new Set(er.map(r => r.st)).size);
    _setCard(t, 'sc-ok', [...allP].filter(p => !excP.has(p)).length);

    // ── Populate filter dropdowns ─────────────────────────────────────────────
    const l      = L[LANG] || L.th;
    const years  = [...new Set(rows.filter(r => r.yr).map(r => r.yr))].sort();
    const params = [...new Set(rows.map(r => r.col))].sort();
    const locs   = [...new Set(nr.map(r => r.loc))].sort();
    const areas  = [...new Set(rows.filter(r => !r.is_ref && !r.is_baseline).map(r => r.area))].sort();

    // Year selectors
    ['ov','st','std','ref','ch','raw','para'].forEach(tab =>
      fillSel(`${t}-${tab}-yr`, years, l.f_all)
    );
    // Param selectors
    ['ov','st','std','ref','mk'].forEach(tab =>
      fillSel(`${t}-${tab}-p`, params, l.f_all)
    );
    // Location selectors
    ['yr-loc','mk-loc','ov-loc','std-loc','para-loc'].forEach(id =>
      fillSel(`${t}-${id}`, locs, l.f_all)
    );
    ['ref-loc','bs-loc'].forEach(id =>
      fillSel(`${t}-${id}`, locs, l.f_all)
    );
    // Area selectors
    ['ref-area','bs-area'].forEach(id =>
      fillSel(`${t}-${id}`, areas, l.f_all)
    );
    // Baseline selectors
    fillSel(`${t}-bs-yr`, years, l.f_all);
    fillSel(`${t}-bs-p`,  params, l.f_all);
    fillSel(`${t}-yr-par`, params, l.f_all);

    // Distance filter
    const distColV = getColVal(t, 'dist');
    const dists = distColV
      ? [...new Set(state.raw.map(r => parseFloat(r[distColV])).filter(v => !isNaN(v)))].sort((a,b) => a-b)
      : [];
    ['st-dist','std-dist'].forEach(id =>
      fillSel(`${t}-${id}`, dists, l.f_all, d => d, d => `${d}m`)
    );

    // Water Level filter (sea) — a station can have multiple water levels
    // (e.g. Surface/Bottom), varying by site, so it's filtered like Distance
    const wls = [...new Set(rows.filter(r => r.wl).map(r => r.wl))].sort();
    ['ov-wl','st-wl','std-wl'].forEach(id =>
      fillSel(`${t}-${id}`, wls, l.f_all)
    );

    // Chart param selector
    const cp = document.getElementById(`${t}-ch-p`);
    if (cp) {
      cp.innerHTML = '';
      const selOpt = document.createElement('option');
      selOpt.value = '';
      selOpt.textContent = l.f_sel;
      cp.appendChild(selOpt);
      params.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        cp.appendChild(opt);
      });
      if (params[0]) cp.value = params[0];
    }

    return { rows, years, params, locs, nr };

  } catch (err) {
    console.error('[runCore]', err);
    throw err;
  }
}

/** Helper: set text content of a stat card element */
function _setCard(t, id, value) {
  const el = document.getElementById(`${t}-${id}`);
  if (el) el.textContent = value;
}
