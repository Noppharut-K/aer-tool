/**
 * renders2.js — render functions for comparison, trend, chart tabs
 */

import { LANG, L, T } from '../utils/lang.js';
import { fmtD } from '../utils/fmt.js';
import { getState } from '../core/state.js';
import { calcStat, mannKendall } from '../core/analysis.js';
import { mkTbl } from './renders.js';

// ── REF Comparison ────────────────────────────────────────────────────────────
export function renderCMP(t) {
  const isEN          = LANG === 'en';
  const yr            = document.getElementById(`${t}-ref-yr`)?.value  || 'all';
  const p             = document.getElementById(`${t}-ref-p`)?.value   || 'all';
  const grpL          = document.getElementById(`${t}-ref-grp`)?.value || 'location';
  const cmpCVThresh   = parseFloat(document.getElementById(`${t}-ref-cv`)?.value || 30);
  const locF          = document.getElementById(`${t}-ref-loc`)?.value || 'all';
  const l             = L[LANG] || L.th;
  const state         = getState(t);

  let refRows = state.rows.filter(r => r.is_ref);
  if (yr !== 'all') refRows = refRows.filter(r => String(r.yr) === yr);
  if (p  !== 'all') refRows = refRows.filter(r => r.col === p);

  const refMap = {};
  refRows.forEach(r => { if (!refMap[r.pk]) refMap[r.pk] = []; refMap[r.pk].push(r.val); });

  if (!Object.keys(refMap).length) {
    document.getElementById(`${t}-tbl-ref`).innerHTML = `<div class="empty-state"><p>${T('es_noref')}</p></div>`;
    return;
  }

  let rows = state.rows.filter(r => !r.is_ref);
  if (locF !== 'all') rows = rows.filter(r => r.loc === locF);
  if (yr   !== 'all') rows = rows.filter(r => String(r.yr) === yr);
  if (p    !== 'all') rows = rows.filter(r => r.col === p);

  const groups = {};
  rows.forEach(r => {
    const gn = grpL === 'area' ? r.area : grpL === 'station' ? r.st : r.loc;
    const k  = gn + '||' + r.pk + '||' + r.col;
    if (!groups[k]) groups[k] = { gn, col: r.col, pk: r.pk, unit: r.unit, vals: [] };
    groups[k].vals.push(r.val);
  });

  const data = Object.values(groups).map(d => {
    const rv = refMap[d.pk]; if (!rv) return null;
    const rs = calcStat(rv), gs = calcStat(d.vals);
    const pctDiff = rs.mean !== 0 ? (gs.mean - rs.mean) / Math.abs(rs.mean) * 100 : 0;
    const level   = Math.abs(pctDiff) >= cmpCVThresh ? 'diff' : 'close';
    const diff    = (pctDiff >= 0 ? '+' : '') + pctDiff.toFixed(1) + '%';
    const diffLabel = level === 'diff'
      ? (pctDiff > 0 ? T('r_above') : T('r_below'))
      : (isEN ? 'Similar to REF' : 'ใกล้เคียง REF');
    return { gn: d.gn, col: d.col, unit: d.unit, gd: fmtD(gs.mean, t, d.col), rd: fmtD(rs.mean, t, d.col), diff, diffLabel, level, pctDiff, n: d.vals.length };
  }).filter(Boolean);

  const hdr       = grpL === 'area' ? l.th_area : grpL === 'station' ? l.th_st : l.th_loc;
  const refHdrCV  = isEN ? `vs REF (CV ≤ ${cmpCVThresh}%)` : `เปรียบเทียบ REF (CV ≤ ${cmpCVThresh}%)`;

  mkTbl(document.getElementById(`${t}-tbl-ref`),
    [hdr, l.th_p, l.th_gv+' (mean)', l.th_rv+' (mean)', l.th_pct, l.th_diff, l.th_lv, 'n'],
    data,
    d => `<tr>
      <td class="em">${d.gn}</td><td>${d.col}</td>
      <td class="num">${d.gd}</td>
      <td class="num" style="color:var(--text3)">${d.rd}</td>
      <td class="num" style="color:${d.pctDiff>0?'var(--red)':d.pctDiff<0?'var(--blue)':'var(--text2)'}">${d.diff}</td>
      <td class="num" style="font-size:12.5px;color:var(--text2)">${d.diffLabel||'—'}</td>
      <td>${d.level==='diff' ? `<span class="badge badge-red">${T('b_diff')}</span>` : `<span class="badge badge-green">${T('b_close')}</span>`}</td>
      <td class="num">${d.n}</td>
    </tr>`,
    refHdrCV
  );
}

// ── Baseline Comparison ───────────────────────────────────────────────────────
export function renderBS(t) {
  const yr          = document.getElementById(`${t}-bs-yr`)?.value  || 'all';
  const p           = document.getElementById(`${t}-bs-p`)?.value   || 'all';
  const grpL        = document.getElementById(`${t}-bs-grp`)?.value || 'location';
  const bsCVThresh  = parseFloat(document.getElementById(`${t}-bs-cv`)?.value || 30);
  const locF        = document.getElementById(`${t}-bs-loc`)?.value || 'all';
  const isEN        = LANG === 'en';
  const l           = L[LANG] || L.th;
  const state       = getState(t);

  let bsRows = state.rows.filter(r => r.is_baseline);
  if (yr !== 'all') bsRows = bsRows.filter(r => String(r.yr) === yr);
  if (p  !== 'all') bsRows = bsRows.filter(r => r.col === p);

  const bsMap = {};
  bsRows.forEach(r => { if (!bsMap[r.pk]) bsMap[r.pk] = []; bsMap[r.pk].push(r.val); });

  if (!Object.keys(bsMap).length) {
    document.getElementById(`${t}-tbl-bs`).innerHTML = `<div class="empty-state"><p>${isEN?'No Baseline stations selected':'ยังไม่ได้เลือก Baseline Station — เลือกใน Sidebar'}</p></div>`;
    return;
  }

  let rows = state.rows.filter(r => !r.is_ref && !r.is_baseline);
  if (yr   !== 'all') rows = rows.filter(r => String(r.yr) === yr);
  if (p    !== 'all') rows = rows.filter(r => r.col === p);
  if (locF !== 'all') rows = rows.filter(r => r.loc === locF);

  const groups = {};
  rows.forEach(r => {
    const gn = grpL === 'area' ? r.area : grpL === 'station' ? r.st : r.loc;
    const k  = gn + '||' + r.pk + '||' + r.col;
    if (!groups[k]) groups[k] = { gn, col: r.col, pk: r.pk, unit: r.unit, vals: [] };
    groups[k].vals.push(r.val);
  });

  const data = Object.values(groups).map(d => {
    const bv = bsMap[d.pk]; if (!bv) return null;
    const bs = calcStat(bv), gs = calcStat(d.vals);
    if (bs.mean === 0) return null;
    const pctDiff  = (gs.mean - bs.mean) / Math.abs(bs.mean) * 100;
    const diff     = (pctDiff >= 0 ? '+' : '') + pctDiff.toFixed(1) + '%';
    const level    = Math.abs(pctDiff) >= bsCVThresh ? 'diff' : 'close';
    const diffLabel = pctDiff >= bsCVThresh ? T('r_above')
                    : pctDiff <= -bsCVThresh ? T('r_below')
                    : (isEN ? 'Similar to Baseline' : 'ใกล้เคียง Baseline');
    return { gn: d.gn, col: d.col, unit: d.unit, gd: fmtD(gs.mean, t, d.col), rd: fmtD(bs.mean, t, d.col), diff, diffLabel, level, pctDiff, n: d.vals.length };
  }).filter(Boolean);

  const hdr      = grpL === 'area' ? l.th_area : grpL === 'station' ? l.th_st : l.th_loc;
  const bsHdrCV  = isEN ? `vs Baseline (CV ≤ ${bsCVThresh}%)` : `เปรียบเทียบ Baseline (CV ≤ ${bsCVThresh}%)`;

  mkTbl(document.getElementById(`${t}-tbl-bs`),
    [hdr, l.th_p, l.th_gv+' (mean)', isEN?'Baseline (mean)':'Baseline (mean)', l.th_pct, isEN?'Comparison':'ผลเปรียบเทียบ', l.th_lv, 'n'],
    data,
    d => `<tr>
      <td class="em">${d.gn}</td><td>${d.col}</td>
      <td class="num">${d.gd}</td>
      <td class="num" style="color:var(--text3)">${d.rd}</td>
      <td class="num" style="color:${d.pctDiff>0?'var(--red)':d.pctDiff<0?'var(--blue)':'var(--text2)'}">${d.diff}</td>
      <td style="font-size:12.5px;color:var(--text2)">${d.diffLabel||'—'}</td>
      <td>${d.level==='diff' ? `<span class="badge badge-red">${T('b_diff')}</span>` : `<span class="badge badge-green">${T('b_close')}</span>`}</td>
      <td class="num">${d.n}</td>
    </tr>`,
    bsHdrCV
  );
}

// ── Year-over-Year Comparison ─────────────────────────────────────────────────
export function renderYR(t) {
  const locF       = document.getElementById(`${t}-yr-loc`)?.value || 'all';
  const parF       = document.getElementById(`${t}-yr-par`)?.value || 'all';
  const yrGrp      = document.getElementById(`${t}-yr-grp`)?.value || 'location';
  const cvThreshYR = parseFloat(document.getElementById(`${t}-yr-cv`)?.value || 20);
  const isEN       = LANG === 'en';
  const l          = L[LANG] || L.th;
  const state      = getState(t);
  const tblEl      = document.getElementById(`${t}-tbl-yr`);
  if (!tblEl) return;

  if (!state.analyzed) { tblEl.innerHTML = `<div class="empty-state"><p>กด วิเคราะห์ข้อมูล ก่อนครับ</p></div>`; return; }

  const getGrpKey = r => yrGrp === 'station' ? r.st : yrGrp === 'area' ? r.area : r.loc;
  const allYears  = [...new Set(state.rows.filter(r => !r.is_ref && r.yr).map(r => r.yr))].sort();

  if (allYears.length < 2) {
    tblEl.innerHTML = `<div class="empty-state"><p>${T('es_yr')}</p></div>`;
    return;
  }

  const map = {};
  state.rows
    .filter(r => !r.is_ref && r.yr && (locF==='all'||r.loc===locF) && (parF==='all'||r.col===parF))
    .forEach(r => {
      const gk = getGrpKey(r);
      const k  = gk + '||' + r.col;
      if (!map[k]) map[k] = { gn: gk, col: r.col, unit: r.unit, byYr: {} };
      if (!map[k].byYr[r.yr]) map[k].byYr[r.yr] = [];
      map[k].byYr[r.yr].push(r.val);
    });

  const data = Object.values(map).map(d => {
    const yrs  = allYears.filter(y => d.byYr[y]);
    if (yrs.length < 2) return null;
    const vals = yrs.map(y => ({ yr: y, v: calcStat(d.byYr[y]).mean, st: calcStat(d.byYr[y]) }));
    const allMeans = vals.map(v => v.v);
    const base = vals[0].v;
    const pcts = vals.map(v => base && base !== 0 ? ((v.v - base) / Math.abs(base) * 100) : 0);
    const st   = calcStat(allMeans);
    const cv   = st.mean !== 0 ? Math.abs(st.sd / st.mean * 100) : 0;

    let summary, summaryBadge, clusterInfo = '';

    if (cv < cvThreshYR) {
      summary       = isEN ? `Stable (CV=${cv.toFixed(0)}%)` : `ใกล้เคียงกัน (CV=${cv.toFixed(0)}%)`;
      summaryBadge  = 'badge-gray';
    } else {
      // Cluster step
      const yrMeans = vals.map(v => ({ yr: v.yr, mean: v.v }));
      const sorted  = [...yrMeans].sort((a, b) => a.mean - b.mean);
      const clusters = []; let cur = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        const pct = cur[0].mean !== 0 ? Math.abs((sorted[i].mean - cur[cur.length-1].mean) / Math.abs(cur[0].mean) * 100) : 0;
        if (pct > 30) { clusters.push(cur); cur = [sorted[i]]; } else cur.push(sorted[i]);
      }
      clusters.push(cur);
      if (clusters.length >= 2) {
        const lvls    = isEN ? ['low','high'] : ['ต่ำ','สูง'];
        const clSorted = [...clusters].sort((a, b) => a[0].mean - b[0].mean);
        clusterInfo   = clSorted.map((cl, ci) => {
          const yrsStr = cl.sort((a, b) => a.yr - b.yr).map(d => d.yr).join(', ');
          const mn = Math.min(...cl.map(d => d.mean)).toFixed(3);
          const mx = Math.max(...cl.map(d => d.mean)).toFixed(3);
          return (isEN?'Yr ':'ปี ') + yrsStr + ' (' + (lvls[ci < Math.floor(clusters.length/2) ? 0 : 1]) + ': ' + mn + (mn!==mx?'–'+mx:'') + ')';
        }).join(' | ');
      }
      // First vs Last
      const first = vals[0].v, last = vals[vals.length-1].v;
      const overallPct = first && first !== 0 ? (last - first) / Math.abs(first) * 100 : 0;
      const trendStr   = (overallPct >= 0 ? '+' : '') + overallPct.toFixed(1) + '%';
      if (overallPct > 0) {
        summary      = isEN ? `Increasing (${trendStr}, CV=${cv.toFixed(0)}%)` : `เพิ่มขึ้น (${trendStr}, CV=${cv.toFixed(0)}%)`;
        summaryBadge = 'badge-red';
      } else {
        summary      = isEN ? `Decreasing (${trendStr}, CV=${cv.toFixed(0)}%)` : `ลดลง (${trendStr}, CV=${cv.toFixed(0)}%)`;
        summaryBadge = 'badge-blue';
      }
    }
    return { gn: d.gn, col: d.col, unit: d.unit, vals, pcts, summary, summaryBadge, clusterInfo };
  }).filter(Boolean);

  if (!data.length) { tblEl.innerHTML = `<div class="empty-state"><p>${T('es_nodata')}</p></div>`; return; }

  const grpHdr   = yrGrp === 'station' ? l.th_st : yrGrp === 'area' ? l.th_area : l.th_loc;
  const yrHds    = allYears.map(y => `${l.f_yr} ${y}`);
  const yrHdrCV  = isEN ? `Year Comparison (CV ≤ ${cvThreshYR}%)` : `เปรียบเทียบรายปี (CV ≤ ${cvThreshYR}%)`;

  mkTbl(tblEl,
    [grpHdr, l.th_p, l.th_u, ...yrHds, isEN?'Summary':'สรุป'],
    data,
    d => {
      const yrCells = allYears.map((y, i) => {
        const v = d.vals.find(vv => String(vv.yr) === String(y));
        if (!v) return `<td>—</td>`;
        const pct  = d.pcts[d.vals.indexOf(v)];
        const col  = i === 0 ? 'var(--text3)' : Math.abs(pct) >= cvThreshYR ? (pct > 0 ? 'var(--red)' : 'var(--blue)') : 'var(--text)';
        const disp = fmtD(v.v, t, d.col);
        const pctStr = i === 0 ? '' : `<div style="font-size:10px;color:${col};margin-top:1px">${pct>=0?'+':''}${pct.toFixed(1)}%</div>`;
        return `<td class="num" style="color:${col}">${disp}${pctStr}</td>`;
      }).join('');
      return `<tr><td class="em">${d.gn}</td><td>${d.col}</td><td>${d.unit}</td>${yrCells}<td class="num"><span class="badge ${d.summaryBadge}">${d.summary}</span></td></tr>`;
    },
    yrHdrCV
  );
}

// ── Mann-Kendall ──────────────────────────────────────────────────────────────
export function renderMK(t) {
  const pF      = document.getElementById(`${t}-mk-p`)?.value   || 'all';
  const lF      = document.getElementById(`${t}-mk-loc`)?.value || 'all';
  const sigOnly = document.getElementById(`${t}-mk-sig`)?.checked || false;
  const l       = L[LANG] || L.th;
  const state   = getState(t);
  const tblEl   = document.getElementById(`${t}-tbl-mk`);
  if (!tblEl) return;

  const rows = state.rows.filter(r => !r.is_ref && r.yr);
  if (!rows.length || [...new Set(rows.map(r => r.yr))].length < 3) {
    tblEl.innerHTML = `<div class="empty-state"><p>${T('es_mk')}</p></div>`;
    return;
  }

  const map = {};
  rows.forEach(r => {
    if (pF !== 'all' && r.col !== pF) return;
    if (lF !== 'all' && r.loc !== lF) return;
    const k = r.loc + '||' + r.col;
    if (!map[k]) map[k] = { loc: r.loc, col: r.col, unit: r.unit, byYr: {} };
    if (!map[k].byYr[r.yr]) map[k].byYr[r.yr] = [];
    map[k].byYr[r.yr].push(r.val);
  });

  const data = Object.values(map).map(d => {
    const yrs   = Object.keys(d.byYr).map(Number).sort();
    if (yrs.length < 3) return null;
    const means = yrs.map(y => calcStat(d.byYr[y]).mean);
    const mk    = mannKendall(means); if (!mk) return null;
    return { loc: d.loc, col: d.col, unit: d.unit, tau: mk.tau, p: mk.p, sig: mk.sig, slope: mk.slope, trend: mk.tau > 0 ? 'b_up' : 'b_dn', nYrs: yrs.length, yrs, means };
  }).filter(Boolean);

  const filtered = sigOnly ? data.filter(d => d.sig) : data;

  mkTbl(tblEl,
    [l.th_loc, l.th_p, l.th_u, l.th_tau, l.th_pval, l.th_sig, l.th_slope, l.th_trend],
    filtered,
    d => {
      const sigBadge = d.sig
        ? `<span class="badge badge-red">${T('b_sig')} (p=${d.p.toFixed(3)})</span>`
        : `<span class="badge badge-gray">${T('b_nsig')} (p=${d.p.toFixed(3)})</span>`;
      const tBadge = d.trend === 'b_up'
        ? `<span class="badge badge-red">↑ ${T('b_up')}</span>`
        : `<span class="badge badge-blue">↓ ${T('b_dn')}</span>`;
      return `<tr>
        <td class="em">${d.loc}</td><td>${d.col}</td><td>${d.unit}</td>
        <td class="num">${d.tau.toFixed(3)}</td>
        <td class="num">${d.p.toFixed(3)}</td>
        <td class="num">${sigBadge}</td>
        <td class="num">${fmtD(d.slope, t, d.col)} ${T('th_slope_u')}</td>
        <td>${tBadge}</td>
      </tr>`;
    }
  );

  // MK Chart
  const chartEl = document.getElementById(`${t}-mk-chart`);
  if (!chartEl || !window.Chart) return;
  if (state._mkChart) state._mkChart.destroy();
  const sel    = pF === 'all' && filtered.length ? filtered[0].col : pF;
  const toPlot = filtered.filter(d => d.col === sel);
  if (!toPlot.length) return;
  const palette  = ['#1a4fd6','#0d7a52','#b35c00','#6d28d9','#c41a1a','#0891b2'];
  const datasets = toPlot.map((d, i) => ({
    label: d.loc + (d.sig ? ' *' : ''),
    data: d.yrs.map((yr, j) => ({ x: yr, y: d.means[j] })),
    borderColor: palette[i % palette.length],
    backgroundColor: palette[i % palette.length] + '22',
    tension: .3, pointRadius: 5,
    borderDash: d.sig ? [] : [5, 4],
  }));
  state._mkChart = new Chart(chartEl.getContext('2d'), {
    type: 'line', data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: `Mann-Kendall — ${sel} (* = p<0.05)`, color: '#ffffff', font: { size: 15, weight: '700' } },
        legend: { labels: { color: '#9aa0b4', font: { size: 11 } } }
      },
      scales: {
        x: { type: 'linear', ticks: { color: '#e0e0e4', callback: v => Math.round(v) }, grid: { color: 'rgba(255,255,255,.08)' } },
        y: { ticks: { color: '#e0e0e4' }, grid: { color: 'rgba(255,255,255,.08)' }, title: { display: true, text: toPlot[0]?.unit || '', color: '#a8b0c2' } }
      }
    }
  });
}

// ── Chart Tab ─────────────────────────────────────────────────────────────────
export function renderChart(t) {
  const state  = getState(t);
  if (!state.rows.length) return;
  const p    = document.getElementById(`${t}-ch-p`)?.value; if (!p) return;
  const grp  = document.getElementById(`${t}-ch-grp`)?.value || 'station';
  const yr   = document.getElementById(`${t}-ch-yr`)?.value  || 'all';
  const isEN = LANG === 'en';

  let rows = state.rows.filter(r => !r.is_ref && r.col === p);
  if (yr !== 'all') rows = rows.filter(r => String(r.yr) === yr);
  if (!rows.length) return;

  const getGrp = r => grp === 'station' ? r.st : grp === 'area' ? r.area : r.loc;
  const groups = {};
  rows.forEach(r => {
    const gk = getGrp(r);
    if (!groups[gk]) groups[gk] = [];
    groups[gk].push(r.val);
  });

  const chartEl = document.getElementById(`${t}-main-chart`);
  if (!chartEl || !window.Chart) return;
  if (state._mainChart) state._mainChart.destroy();

  const labels  = Object.keys(groups).sort();
  const palette = ['#4dd9c0','#5b8dee','#fb923c','#a78bfa','#f87171','#3dd68c','#fbbf24'];
  const means   = labels.map(k => calcStat(groups[k]).mean);
  const mins    = labels.map(k => calcStat(groups[k]).min);
  const maxs    = labels.map(k => calcStat(groups[k]).max);

  state._mainChart = new Chart(chartEl.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: isEN ? 'Mean' : 'ค่าเฉลี่ย', data: means, backgroundColor: palette[0] + 'cc', borderColor: palette[0], borderWidth: 1.5, borderRadius: 4 },
        { label: isEN ? 'Min' : 'ต่ำสุด',     data: mins,  backgroundColor: palette[2] + '88', borderColor: palette[2], borderWidth: 1, borderRadius: 4 },
        { label: isEN ? 'Max' : 'สูงสุด',     data: maxs,  backgroundColor: palette[1] + '88', borderColor: palette[1], borderWidth: 1, borderRadius: 4 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: `${p} ${yr !== 'all' ? '— ' + yr : ''}`, color: '#ffffff', font: { size: 15, weight: '700' } },
        legend: { labels: { color: '#9aa0b4', font: { size: 11 } } }
      },
      scales: {
        x: { ticks: { color: '#e0e0e4', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.05)' } },
        y: { ticks: { color: '#e0e0e4' }, grid: { color: 'rgba(255,255,255,.08)' }, title: { display: true, text: rows[0]?.unit || '', color: '#a8b0c2' } }
      }
    }
  });
}
