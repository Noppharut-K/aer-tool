/**
 * Core analysis engine
 * Processes raw rows into analysis rows with standard checks, filters, and stat cards
 */

import { LANG, L, T, Tf } from '../utils/lang.js';
import { STD } from './standards.js';
import { resP, chkStd, chkNoise } from './analysis.js';
import { getState, setRows, getColVal } from './state.js';

/** Get value from a row column, return '-' if missing */
const gM = (row, col) => col && row[col] != null ? String(row[col]) : '-';

/** Get selected REF station names for a tab */
function getRefSet(t) {
  return new Set([...document.querySelectorAll(`.rck-${t}:checked`)].map(c => c.value));
}

/** Get selected Baseline station names for a tab */
function getBsSet(t) {
  return new Set([...document.querySelectorAll(`.bck-${t}:checked`)].map(c => c.value));
}

/** Get noise standards for a tab */
function getNSR(t) {
  const rows = document.querySelectorAll(`#${t}-nsr-list .nsr`);
  const stds = [];
  rows.forEach(row => {
    const id  = row.id;
    const name = document.getElementById(id + '-n')?.value || '';
    const mn   = parseFloat(document.getElementById(id + '-mn')?.value);
    const mx   = parseFloat(document.getElementById(id + '-mx')?.value);
    if (name) stds.push({ name, min: isNaN(mn) ? null : mn, max: isNaN(mx) ? null : mx });
  });
  return stds;
}

/** Get report type filter */
function filterByRtype(rows, t) {
  const colRtype = document.getElementById(t + '-c-rtype')?.value || '';
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
 * @param {string} t - Tab identifier (sea, sed, sw, air, noise, bio)
 */
export function runCore(t) {
  const isEN = LANG === 'en';
  const state = getState(t);

  try {
    // Column mappings
    const colArea  = getColVal(t, 'area');
    const colLoc   = getColVal(t, 'loc');
    const colSt    = getColVal(t, 'st');
    const colYr    = getColVal(t, 'year');
    const colDist  = getColVal(t, 'dist');
    const colDate  = getColVal(t, 'date');

    const refSet   = getRefSet(t);
    const bsSet    = getBsSet(t);
    const nsStds   = t === 'noise' ? getNSR(t) : [];

    // Identify meta vs parameter columns
    const metaCols = new Set(
      ['area','loc','st','depth','dist','year','date']
        .map(k => document.getElementById(`${t}-c-${k}`)?.value)
        .filter(Boolean)
    );
    state.cols
      .filter(c => ['year','round','date','วันที่','ปี'].some(k => c.toLowerCase().includes(k)))
      .forEach(c => metaCols.add(c));

    const paramCols = state.cols.filter(c =>
      !metaCols.has(c) &&
      !c.toUpperCase().startsWith('MRL_') &&
      state.raw.some(r => r[c] != null && !isNaN(parseFloat(r[c])))
    );

    // Apply report type filter
    const rawFiltered = filterByRtype(state.raw, t);

    // Build analysis rows
    const rows = [];
    rawFiltered.forEach(row => {
      const isRef = colSt ? refSet.has(String(row[colSt] || '')) : false;
      paramCols.forEach(col => {
        if (row[col] == null || isNaN(parseFloat(row[col]))) return;
        const v      = parseFloat(row[col]);
        const pk     = resP(col);
        const stdDef = (STD[t] || {})[pk] || {};
        const sc     = t === 'noise' ? chkNoise(v, nsStds) : chkStd(t, pk, v);
        const stName = gM(row, colSt);
        const isBs   = !isRef && bsSet.size > 0 && bsSet.has(stName);

        rows.push({
          area:       gM(row, colArea),
          loc:        gM(row, colLoc),
          st:         stName,
          yr:         colYr && row[colYr] ? parseFloat(row[colYr]) : null,
          date:       colDate && row[colDate] ? String(row[colDate]) : null,
          dist:       colDist && row[colDist] != null ? parseFloat(row[colDist]) : null,
          col, pk, val: v,
          unit:       stdDef.unit  || '',
          label:      stdDef.label || col,
          sc_status:  sc.status,
          sc_msg:     sc.msg,
          is_ref:     isRef,
          is_baseline: isBs,
          exceed:     sc.status === 'exceed' && !isRef && !isBs,
        });
      });
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
    const distColV = document.getElementById(`${t}-c-dist`)?.value;
    const dists = distColV
      ? [...new Set(state.raw.map(r => parseFloat(r[distColV])).filter(v => !isNaN(v)))].sort((a,b) => a-b)
      : [];
    ['st-dist','std-dist'].forEach(id =>
      fillSel(`${t}-${id}`, dists, l.f_all, d => d, d => `${d}m`)
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
