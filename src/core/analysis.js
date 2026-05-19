import { STD, ALIAS } from './standards.js';

/** Resolve parameter name via alias map */
export function resP(c) {
  return ALIAS[c.toLowerCase().trim()] || c;
}

/** Check value against standard thresholds */
export function chkStd(t, pk, v) {
  if (t === 'noise') return { status: 'no_std', msg: '—' };
  const s = (STD[t] || {})[pk];
  if (!s) return { status: 'no_std', msg: '—' };
  const exc = [];
  if (s.pcd_max != null && v > s.pcd_max) exc.push(`PCD(${s.pcd_max})`);
  if (s.pcd_min != null && v < s.pcd_min) exc.push(`PCD(${s.pcd_min})`);
  if (s.erl     != null && v > s.erl)     exc.push(`ERL(${s.erl})`);
  if (s.erm     != null && v > s.erm)     exc.push(`ERM(${s.erm})`);
  if (s.who_max != null && v > s.who_max) exc.push(`WHO(${s.who_max})`);
  if (s.who_min != null && v < s.who_min) exc.push(`WHO(${s.who_min})`);
  if (s.epa_max != null && v > s.epa_max) exc.push(`EPA(${s.epa_max})`);
  return exc.length
    ? { status: 'exceed', msg: 'เกิน ' + exc.join(', ') }
    : { status: 'pass',   msg: 'ผ่าน' };
}

/** Check noise value against custom standards */
export function chkNoise(v, stds) {
  const exc = stds.filter(s => (s.max != null && v > s.max) || (s.min != null && v < s.min));
  return exc.length
    ? { status: 'exceed', msg: 'เกิน ' + exc.map(s => s.name).join(', ') }
    : { status: 'pass',   msg: 'ผ่าน' };
}

/** Descriptive statistics for an array of numbers */
export function calcStat(arr) {
  if (!arr || !arr.length) return null;
  const s = [...arr].sort((a, b) => a - b), n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const med  = s[Math.floor(n / 2)];
  const sdRaw = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const sd = sdRaw < 1e-10 ? 0 : sdRaw;
  const fr = {};
  arr.forEach(v => { const k = +v.toFixed(6); fr[k] = (fr[k] || 0) + 1; });
  const mf   = Math.max(...Object.values(fr));
  const mode = +Object.keys(fr).find(k => fr[k] === mf);
  return { n, mean, min: s[0], max: s[n - 1], med, sd, mode };
}

/** Mean of an array */
export function calcMean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/** CV (Coefficient of Variation) as % */
export function calcCV(arr) {
  if (arr.length < 2) return 0;
  const m = calcMean(arr);
  if (m === 0) return 0;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
  return Math.abs(sd / m * 100);
}

/** Normal CDF approximation (for Mann-Kendall p-value) */
function normCDF(z) {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z);
  const t = 1 / (1 + p * z);
  const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t * Math.exp(-z*z);
  return 0.5 * (1 + sign * y);
}

/** Mann-Kendall trend test + Sen's Slope */
export function mannKendall(vals) {
  const n = vals.length;
  if (n < 3) return null;
  let S = 0;
  for (let i = 0; i < n-1; i++)
    for (let j = i+1; j < n; j++)
      S += Math.sign(vals[j] - vals[i]);
  const varS = n*(n-1)*(2*n+5)/18;
  const z = S > 0 ? (S-1)/Math.sqrt(varS) : S < 0 ? (S+1)/Math.sqrt(varS) : 0;
  const p = 2 * (1 - normCDF(Math.abs(z)));
  const slopes = [];
  for (let i = 0; i < n-1; i++)
    for (let j = i+1; j < n; j++)
      slopes.push((vals[j] - vals[i]) / (j - i));
  slopes.sort((a, b) => a - b);
  const slope = slopes[Math.floor(slopes.length / 2)];
  return { S, tau: S/(n*(n-1)/2), z, p, slope, sig: p < 0.05 };
}

/** CV-based year-over-year trend analysis
 *  Returns { stable, increasing, decreasing } arrays
 *  increasing/decreasing: [{col, firstYr, lastYr}]
 */
export function analyzeYearTrend(locRows, allYrs, cvThreshold) {
  const params = [...new Set(locRows.map(r => r.col))];
  const stable = [], increasing = [], decreasing = [];

  params.forEach(col => {
    const byYr = {};
    allYrs.forEach(y => {
      const vals = locRows.filter(r => String(r.yr) === String(y) && r.col === col).map(r => r.val);
      if (vals.length) byYr[y] = calcMean(vals);
    });
    const yrs   = Object.keys(byYr).map(Number).sort((a, b) => a - b);
    if (yrs.length < 2) return;
    const means = yrs.map(y => byYr[y]);
    const cv    = calcCV(means);
    if (cv < cvThreshold) { stable.push(col); return; }
    const pct = means[0] !== 0 ? (means[means.length-1] - means[0]) / Math.abs(means[0]) * 100 : 0;
    if (pct > 0) increasing.push({ col, firstYr: yrs[0], lastYr: yrs[yrs.length-1] });
    else         decreasing.push({ col, firstYr: yrs[0], lastYr: yrs[yrs.length-1] });
  });

  return { stable, increasing, decreasing };
}


export function fmt(v){
  if(v==null||v==='—') return'—';if(typeof v!=='number'||isNaN(v)) return v;
  if(Math.abs(v)>=10000) return v.toLocaleString('th',{maximumFractionDigits:0});
  if(Math.abs(v)>=100) return+v.toFixed(1)+'';
  if(Math.abs(v)>=10)  return+v.toFixed(2)+'';
  return+v.toPrecision(4)+'';
}

export function fmtD(v,t,col){
  if(v==null||v==='—') return'—';
  if(typeof v!=='number'||isNaN(v)) return String(v);
  const d=DEC[t]&&DEC[t][col]!=null?DEC[t][col]:null;
  if(d!=null) return v.toFixed(d);
  /* fallback auto */
  const abs=Math.abs(v);
  if(abs>=10000) return v.toLocaleString('th',{maximumFractionDigits:0});
  if(abs>=100) return+v.toFixed(1)+'';
  if(abs>=10)  return+v.toFixed(2)+'';
  return+v.toPrecision(4)+'';
}
