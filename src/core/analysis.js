/**
 * analysis.js — pure calculation helpers (no DOM, no state)
 */

/** Whether a raw cell value is a genuine number, not just something
    parseFloat() would partially parse (e.g. parseFloat("2020-05-10")
    silently succeeds as 2020 — Number() correctly rejects it as NaN since
    it requires the WHOLE string to be numeric). Used for column
    auto-detection and row-level parsing so date-like or otherwise
    non-numeric text never gets mistaken for a parameter value. */
export function isNumericValue(v) {
  if (v == null || v === '') return false;
  if (typeof v === 'number') return !isNaN(v);
  return String(v).trim() !== '' && !isNaN(Number(v));
}

// "<0.01", "<=0.01", "< 0.01 mg/L" — captures the leading number, tolerant
// of trailing units/text since lab reports commonly append them
const BDL_LIMIT_PATTERN = /^<\s*=?\s*([\d.]+)/;
// Bare non-detect markers with no usable limit number
const BDL_BARE_PATTERN = /^(nd|n\.d\.|bdl|<\s*loq|<\s*dl|<\s*mdl|trace|not[\s-]?detected|non[\s-]?detect(?:ed)?)$/i;

/** Whether a raw cell value is a below-detection-limit marker rather than
    a genuine number or a data error — "<0.01" (captures the limit) or a
    bare non-detect marker like "ND"/"N.D."/"BDL"/"<LOQ"/"trace" (no limit
    available). Returns { limit: number|null } or null if the value
    doesn't look like a BDL marker. */
export function parseBdl(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(BDL_LIMIT_PATTERN);
  if (m) return { limit: parseFloat(m[1]) };
  if (BDL_BARE_PATTERN.test(s)) return { limit: null };
  return null;
}

/** Whether a raw cell value is either a genuine number or a recognized
    BDL marker — used where a column only needs a yes/no "does this look
    like a parameter value" check (e.g. auto-detecting Parameter columns),
    as opposed to isNumericValue's stricter "is this a number right now". */
export function isNumericOrBdl(v) {
  return isNumericValue(v) || !!parseBdl(v);
}

/** Descriptive statistics for an array of numbers */
export function calcStat(arr) {
  if (!arr || !arr.length) return null;
  const s = [...arr].sort((a, b) => a - b), n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const med = s[Math.floor(n / 2)];
  const sdRaw = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const sd = sdRaw < 1e-10 ? 0 : sdRaw;
  return { n, mean, min: s[0], max: s[n - 1], med, sd };
}

/** Z-score outlier stats for one column's full value distribution */
export function computeOutlierStats(colVals, zThreshold) {
  const mean = colVals.reduce((a, b) => a + b, 0) / colVals.length;
  const sd = Math.sqrt(colVals.reduce((a, b) => a + (b - mean) ** 2, 0) / colVals.length);
  return {
    mean, sd,
    isOutlier: v => sd > 0 && Math.abs((v - mean) / sd) > zThreshold,
  };
}

/** Sort a parameter's standard entries from least to most severe. A "max"
    standard gets more severe as its threshold rises (harder to breach,
    worse when you do — e.g. Watch=50 then Critical=100); a "min" standard
    gets more severe as its threshold falls. This derives severity purely
    from direction + value, so multi-tier standards need no explicit rank
    field — the numbers already encode it. */
export function sortStdEntriesBySeverity(entries) {
  if (!entries.length) return entries;
  const dir = entries[0].direction;
  return [...entries].sort((a, b) => dir === 'min' ? b.value - a.value : a.value - b.value);
}

/** Among a parameter's severity-sorted entries, the most severe one whose
    tier label appears in `presentLabels` (a Set of tier strings, or `null`
    for the untiered case — matching how sc_tier is stored on rows) — or
    null if none match. Used to resolve "the worst tier breached" when
    multiple readings in a displayed group/summary breach different tiers
    of the same parameter. */
export function worstTierAmong(sortedEntries, presentLabels) {
  for (let i = sortedEntries.length - 1; i >= 0; i--) {
    const label = sortedEntries[i].tier || null;
    if (presentLabels.has(label)) return label;
  }
  return null;
}

/** Check a value against every tier of a parameter's standard (see
    state.js's StdEntry / getStandardsFor — entries must already be
    severity-sorted least → most severe, e.g. via sortStdEntriesBySeverity).
    Returns { status: 'no_std'|'exceed'|'pass', tier? } — tier is the label
    of the most severe breached entry ('' entries report tier: null). */
export function checkStandardTiers(entries, value) {
  if (!entries.length) return { status: 'no_std' };
  const breached = entries.filter(s => s.direction === 'min' ? value < s.value : value > s.value);
  if (!breached.length) return { status: 'pass' };
  const worst = breached[breached.length - 1];
  return { status: 'exceed', tier: worst.tier || null };
}

/** Format a number for display, honoring a per-parameter decimal override
    when set, else a sensible auto scale */
export function fmtVal(v, decimals) {
  if (v == null || isNaN(v)) return '—';
  if (decimals != null) return v.toFixed(decimals);
  const abs = Math.abs(v);
  if (abs >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (abs >= 100) return v.toFixed(1);
  if (abs >= 10) return v.toFixed(2);
  if (abs === 0) return '0';
  return v.toPrecision(3);
}
