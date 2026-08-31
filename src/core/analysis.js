/**
 * analysis.js — pure calculation helpers (no DOM, no state)
 */

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

/** Check a value against a single standard entry (see state.js's StdEntry).
    Returns { status: 'no_std'|'exceed'|'pass' } */
export function checkStandard(std, value) {
  if (!std) return { status: 'no_std' };
  const exceeds = std.direction === 'min' ? value < std.value : value > std.value;
  return { status: exceeds ? 'exceed' : 'pass' };
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
