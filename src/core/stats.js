/**
 * stats.js — Welch's t-test and Mann-Whitney U significance tests, pure
 * math, no DOM/state. No JS stats library exists in this project, so
 * p-values are computed from standard, self-contained numerical
 * approximations (normal CDF via the classic erf approximation;
 * t-distribution p-value via the regularized incomplete beta function,
 * evaluated with a continued fraction — both textbook "Numerical Recipes"
 * methods, not anything novel).
 *
 * Both public functions return { p, n1, n2 } on success, or
 * { p: null, n1, n2, reason: 'insufficient' } when either sample has
 * fewer than MIN_N values — below that floor a p-value isn't meaningfully
 * interpretable, so callers should show "not enough data" instead of a
 * number rather than trust a fabricated result.
 */

const MIN_N = 3;

// ── Normal distribution (Abramowitz & Stegun 7.1.26 erf approximation) ────

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCDF(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// ── t-distribution p-value via regularized incomplete beta ────────────────

function logGamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(x, a, b) {
  const MAXIT = 200, EPS = 3e-7, FPMIN = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(x, a, b)) / a
    : 1 - (bt * betacf(1 - x, b, a)) / b;
}

/** Two-tailed p-value for a t statistic with the given degrees of freedom */
function tTwoTailedP(t, df) {
  const x = df / (df + t * t);
  return regularizedIncompleteBeta(x, df / 2, 0.5);
}

// ── Public tests ────────────────────────────────────────────────────────

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function variance(arr, m) { return arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1); }

/** Welch's t-test (unequal-variance) — no assumption that the two groups
    share the same variance, a safer default than Student's t-test here
    since nothing guarantees a Location and its Baseline have similar
    spread. */
export function tTest(sampleA, sampleB) {
  const n1 = sampleA.length, n2 = sampleB.length;
  if (n1 < MIN_N || n2 < MIN_N) return { p: null, n1, n2, reason: 'insufficient' };
  const m1 = mean(sampleA), m2 = mean(sampleB);
  const v1 = variance(sampleA, m1), v2 = variance(sampleB, m2);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (se === 0) return { p: m1 === m2 ? 1 : 0, n1, n2 };
  const t = (m1 - m2) / se;
  const df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  return { p: tTwoTailedP(Math.abs(t), df), n1, n2 };
}

/** Mann-Whitney U test (rank-based, no normality assumption) — p-value via
    the normal approximation with continuity and tie correction, standard
    practice once samples are past the tiny-n range this function already
    refuses to run on. */
export function mannWhitneyU(sampleA, sampleB) {
  const n1 = sampleA.length, n2 = sampleB.length;
  if (n1 < MIN_N || n2 < MIN_N) return { p: null, n1, n2, reason: 'insufficient' };

  const combined = [
    ...sampleA.map(v => ({ v, g: 'a' })),
    ...sampleB.map(v => ({ v, g: 'b' })),
  ].sort((x, y) => x.v - y.v);

  const ranks = new Array(combined.length);
  let tieCorrection = 0;
  for (let i = 0; i < combined.length;) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j++;
    const avgRank = (i + 1 + (j + 1)) / 2; // 1-indexed rank positions
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    const tieSize = j - i + 1;
    if (tieSize > 1) tieCorrection += tieSize ** 3 - tieSize;
    i = j + 1;
  }

  let rankSumA = 0;
  combined.forEach((c, idx) => { if (c.g === 'a') rankSumA += ranks[idx]; });
  const U1 = rankSumA - (n1 * (n1 + 1)) / 2;

  const N = n1 + n2;
  const meanU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt((n1 * n2 / 12) * (N + 1 - tieCorrection / (N * (N - 1))));
  if (sigmaU === 0) return { p: 1, n1, n2 };

  const z = (Math.abs(U1 - meanU) - 0.5) / sigmaU; // continuity correction
  const p = 2 * (1 - normalCDF(z));
  return { p: Math.min(p, 1), n1, n2 };
}
