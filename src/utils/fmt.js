import { LANG } from './lang.js';

/** DEC[type][paramCol] = decimal places (set by user in Settings) */
export const DEC = {};

/** Auto-detect decimal places from sample values */
export function defaultDec(vals) {
  if (!vals || !vals.length) return 2;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const abs = Math.abs(mean);
  if (abs === 0)  return 4;
  if (abs < 0.1)  return 5;
  if (abs < 1)    return 4;
  if (abs < 10)   return 3;
  if (abs < 100)  return 2;
  return 1;
}

/** Format a value using user-defined decimals or auto */
export function fmtD(v, t, col) {
  if (v == null || v === '—') return '—';
  if (typeof v !== 'number' || isNaN(v)) return String(v);
  const d = DEC[t] && DEC[t][col] != null ? DEC[t][col] : null;
  if (d != null) return v.toFixed(d);
  const abs = Math.abs(v);
  if (abs >= 10000) return v.toLocaleString('th', { maximumFractionDigits: 0 });
  if (abs >= 100)   return +v.toFixed(1) + '';
  if (abs >= 10)    return +v.toFixed(2) + '';
  return +v.toPrecision(4) + '';
}

/** Generic number format (no DEC lookup) */
export function fmt(v) {
  if (v == null || v === '—') return '—';
  if (typeof v !== 'number' || isNaN(v)) return v;
  if (Math.abs(v) >= 10000) return v.toLocaleString('th', { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 100)   return +v.toFixed(1) + '';
  if (Math.abs(v) >= 10)    return +v.toFixed(2) + '';
  return +v.toPrecision(4) + '';
}

/** Format a range [min, max] */
export function rng(arr, dec = null) {
  if (!arr || !arr.length) return null;
  const mn = Math.min(...arr), mx = Math.max(...arr);
  const d = dec != null ? dec : (mn < 0.01 ? 4 : mn < 1 ? 3 : mn < 10 ? 2 : 1);
  if (Math.abs(mn - mx) < 0.0001) return mn.toFixed(d);
  return `${mn.toFixed(d)} – ${mx.toFixed(d)}`;
}

/** Format date string to Thai or English readable format */
export function fmtDate(d, isEN = false) {
  if (!d) return null;
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    if (isEN) return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
  } catch (e) {
    return d;
  }
}
