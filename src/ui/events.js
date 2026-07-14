/**
 * events.js — wires up all event handlers for analysis pages
 * Called after buildPage() for each tab
 */

import { LANG, T, Tf } from '../utils/lang.js';
import { getState, setRaw } from '../core/state.js';

// ── Progress helpers ──────────────────────────────────────────────────────────

export function showProgress(title) {
  const ov = document.getElementById('progress-overlay');
  if (ov) { ov.style.display = 'flex'; }
  const pl = document.getElementById('progress-label');
  if (pl) pl.textContent = title || 'กำลังวิเคราะห์ข้อมูล...';
  const pb = document.getElementById('progress-bar');
  if (pb) pb.style.width = '0%';
}

export function updateProgress(pct, step) {
  const pb = document.getElementById('progress-bar');
  if (pb) pb.style.width = pct + '%';
  const ps = document.getElementById('progress-sub');
  if (ps) ps.textContent = step || '';
}

export function hideProgress() {
  const ov = document.getElementById('progress-overlay');
  if (ov) ov.style.display = 'none';
}

// ── Status bar ────────────────────────────────────────────────────────────────

export function setSt(t, msg, v = 'idle') {
  const el = document.getElementById(`${t}-status`);
  if (!el) return;
  el.className = `sbar sbar-${v}`;
  el.innerHTML = (v === 'loading' ? '<span class="spinner"></span>' : '') + msg;
}

// ── File handling ─────────────────────────────────────────────────────────────

export function handleFile(t, file) {
  if (!file) return;
  const reader = new FileReader();
  const isCSV = file.name.endsWith('.csv');

  reader.onload = e => {
    try {
      const wb = isCSV
        ? XLSX.read(e.target.result, { type: 'binary' })
        : XLSX.read(e.target.result, { type: 'array' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

      setRaw(t, data);
      setupCols(t);
      runDQ(t);

      document.getElementById(`${t}-btn-run`).disabled = false;

      const fi = document.getElementById(`${t}-finfo`);
      fi.style.display = 'block';
      fi.innerHTML = `<b>${file.name}</b> — ${data.length} ${T('fi_rows')}, ${getState(t).cols.length} cols`;

      setSt(t, Tf('loaded', file.name, data.length), 'ok');
    } catch (err) {
      setSt(t, T('err') + err.message, 'err');
    }
  };

  isCSV ? reader.readAsBinaryString(file) : reader.readAsArrayBuffer(file);
}

// ── Column setup ──────────────────────────────────────────────────────────────

export function setupCols(t) {
  const state = getState(t);
  const cols  = state.cols;

  const kw = {
    area:  ['area','พื้นที่'],
    loc:   ['location','loc','บริเวณ'],
    st:    ['station','สถานี'],
    depth: ['depth','ความลึก'],
    dist:  ['distance','ระยะ'],
    year:  ['year','ปี'],
    date:  ['date','วันที่','sampling_date'],
    rtype: ['report_type','reporttype','ประเภท'],
  };

  ['area','loc','st','depth','dist','year','date','rtype'].forEach(k => {
    const el = document.getElementById(`${t}-c-${k}`);
    if (!el) return;
    const isOptional = ['depth','dist','year','date'].includes(k);
    el.innerHTML = '';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = isOptional ? T('col_none') : T('col_auto');
    el.appendChild(noneOpt);
    /* Column headers come from the uploaded file — build options via DOM
       API so a header containing a quote can't corrupt the value attr */
    cols.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      el.appendChild(opt);
    });
    const match = cols.find(c => (kw[k] || []).some(w => c.toLowerCase().includes(w)));
    if (match) el.value = match;
  });

  rebuildRef(t);

  // Re-build ref list when station column changes
  document.getElementById(`${t}-c-st`)?.addEventListener('change', () => rebuildRef(t));
  // Build rtype filter when rtype column changes
  document.getElementById(`${t}-c-rtype`)?.addEventListener('change', () => buildRtypeFilter(t));
}

// ── REF / Baseline station list ───────────────────────────────────────────────

export function rebuildRef(t) {
  const state = getState(t);
  const sc    = document.getElementById(`${t}-c-st`)?.value;

  ['reflist','bslist'].forEach(listId => {
    const el  = document.getElementById(`${t}-${listId}`);
    if (!el) return;
    if (!sc || !state.raw.length) {
      el.innerHTML = `<p style="font-size:12px;color:var(--text3);padding:4px">${T('es_raw')}</p>`;
      return;
    }
    const cls = listId === 'reflist' ? `rck-${t}` : `bck-${t}`;
    const sts = [...new Set(state.raw.map(r => String(r[sc] || '')).filter(Boolean))].sort();
    el.innerHTML = '';
    /* Station names come from the uploaded file — build via DOM API so a
       name containing a quote can't corrupt the checkbox's value attr
       (which would silently misclassify that station as ref/baseline) */
    sts.forEach(s => {
      const label = document.createElement('label');
      label.className = 'ref-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = s;
      cb.className = cls;
      const span = document.createElement('span');
      span.textContent = s;
      label.appendChild(cb);
      label.appendChild(span);
      el.appendChild(label);
    });
  });
}

// ── Report type filter ────────────────────────────────────────────────────────

export function buildRtypeFilter(t) {
  const state    = getState(t);
  const colRtype = document.getElementById(`${t}-c-rtype`)?.value || '';
  const block    = document.getElementById(`${t}-rtype-block`);
  const body     = document.getElementById(`${t}-rtype-body`);
  if (!block || !body) return;
  if (!colRtype) { block.style.display = 'none'; return; }

  const raw    = state.raw;
  const types  = [...new Set(raw.map(r => String(r[colRtype] || '').trim()).filter(Boolean))].sort();
  const blanks = raw.filter(r => !String(r[colRtype] || '').trim()).length;

  block.style.display = 'block';
  body.innerHTML = blanks > 0
    ? `<div style="font-size:11px;color:var(--amber);background:var(--amber-l);padding:6px 8px;border-radius:var(--rs);margin-bottom:8px;border:1px solid var(--amber-m)">⚠️ พบ ${blanks} rows ที่ไม่มีค่า Report_Type — จะถูก exclude</div>`
    : '';
  /* Report type values come from the uploaded file — build checkboxes via
     DOM API so a value containing a quote can't corrupt the value attr */
  types.forEach(tp => {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);padding:4px 0;cursor:pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `rtype-${t}-${tp.replace(/[^a-zA-Z0-9]/g,'_')}`;
    cb.value = tp;
    cb.checked = true;
    cb.style.accentColor = 'var(--navy)';
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + tp));
    body.appendChild(label);
  });
}

// ── Data Quality Check ────────────────────────────────────────────────────────

export function runDQ(t) {
  const state = getState(t);
  if (!state.raw.length) return;

  const metaCols  = new Set(['area','loc','st','depth','dist','year','date'].map(k => document.getElementById(`${t}-c-${k}`)?.value).filter(Boolean));
  const paramCols = state.cols.filter(c => !metaCols.has(c) && !c.toUpperCase().startsWith('MRL_'));
  const issues    = [];

  paramCols.forEach(col => {
    const missing    = state.raw.filter(r => r[col] == null || r[col] === '').length;
    const missingPct = Math.round(missing / state.raw.length * 100);
    if (missingPct > 0) issues.push({ type: 'missing', col, count: missing, pct: missingPct });

    const nonNum = state.raw.filter(r => r[col] != null && r[col] !== '' && isNaN(parseFloat(r[col]))).map(r => String(r[col]));
    if (nonNum.length > 0) issues.push({ type: 'nonnumeric', col, vals: [...new Set(nonNum)].slice(0, 3) });

    const nums = state.raw.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    if (nums.length >= 3) {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const sd   = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
      if (sd > 0) {
        const ext = nums.filter(v => Math.abs((v - mean) / sd) > 5);
        if (ext.length > 0) issues.push({ type: 'extreme', col, vals: ext.slice(0, 3) });
      }
    }
  });

  const wrap = document.getElementById(`${t}-dq-wrap`);
  if (!wrap) return;

  if (!issues.length) {
    wrap.innerHTML = `<div class="dq-wrap dq-ok"><div class="dq-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>${T('dq_ok')}</div></div>`;
    return;
  }

  const items = issues.map(i => {
    if (i.type === 'missing')     return `<div class="dq-item">⚠️ <b>${i.col}</b>: ${T('dq_missing')} (${i.count} rows, ${i.pct}%)</div>`;
    if (i.type === 'nonnumeric')  return `<div class="dq-item">⚠️ <b>${i.col}</b>: ${T('dq_nonnumeric')} — ${i.vals.join(', ')}</div>`;
    if (i.type === 'extreme')     return `<div class="dq-item">⚠️ <b>${i.col}</b>: ${T('dq_extreme')} — ${i.vals.map(v => v.toFixed(3)).join(', ')}</div>`;
    return '';
  }).join('');

  wrap.innerHTML = `<div class="dq-wrap"><div class="dq-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${T('dq_title')}</div>${items}</div>`;
}

// ── Tab switching ─────────────────────────────────────────────────────────────

export function swTab(t, i, renderFns) {
  document.querySelectorAll(`#page-${t} .tab-pane`).forEach(p => p.classList.remove('active'));
  document.querySelectorAll(`#page-${t} .tab-btn`).forEach(b => b.classList.remove('active'));
  document.getElementById(`${t}-pane-${i}`)?.classList.add('active');
  document.querySelectorAll(`#page-${t} .tab-btn`)[i]?.classList.add('active');

  const state = getState(t);
  if (state.analyzed && renderFns) {
    const fn = renderFns[i];
    if (fn) fn(t);
  }
}

// ── Comparison sub-tab switching ──────────────────────────────────────────────

export function swCmp(t, mode) {
  document.getElementById(`${t}-cmp-ref`).style.display = mode === 'ref' ? 'block' : 'none';
  document.getElementById(`${t}-cmp-bs`).style.display  = mode === 'bs'  ? 'block' : 'none';
  document.getElementById(`${t}-cmp-yr`).style.display  = mode === 'yr'  ? 'block' : 'none';
  document.querySelectorAll(`#page-${t} .cmp-btn`).forEach(b => b.classList.remove('active'));
}

// ── Wire all event listeners for a tab ───────────────────────────────────────

export function wireEvents(t, { loadDemo, runAnalysis, renderFns, downloadTemplate, openSettings, doExport, copyPara }) {
  const el = document.getElementById(`page-${t}`);
  if (!el) return;

  // File input
  const fi = document.getElementById(`${t}-fi`);
  if (fi) fi.addEventListener('change', () => handleFile(t, fi.files[0]));

  // Drag and drop
  const dz = document.getElementById(`${t}-dz`);
  if (dz) {
    dz.addEventListener('click', () => fi?.click());
    dz.addEventListener('file-dropped', e => handleFile(t, e.detail));
  }

  // Demo button
  el.querySelectorAll(`[data-demo="${t}"]`).forEach(btn =>
    btn.addEventListener('click', () => loadDemo(t))
  );

  // Run analysis
  el.querySelectorAll(`[data-run="${t}"]`).forEach(btn =>
    btn.addEventListener('click', () => runAnalysis(t))
  );

  // Download template
  el.querySelectorAll(`[data-template="${t}"]`).forEach(btn =>
    btn.addEventListener('click', () => downloadTemplate(t))
  );

  // Settings
  el.querySelectorAll(`[data-settings="${t}"]`).forEach(btn =>
    btn.addEventListener('click', () => openSettings(t))
  );

  // Export Excel
  el.querySelectorAll(`[data-export="${t}"]`).forEach(btn =>
    btn.addEventListener('click', () => doExport(t))
  );

  // Copy paragraph
  el.querySelectorAll(`[data-copy-para="${t}"]`).forEach(btn =>
    btn.addEventListener('click', () => copyPara(t))
  );

  // Tab buttons
  el.querySelectorAll('.tab-btn[data-idx]').forEach(btn =>
    btn.addEventListener('click', () => swTab(t, parseInt(btn.dataset.idx), renderFns))
  );

  // Comparison sub-tabs
  el.querySelectorAll(`.cmp-btn[data-cmp="${t}"]`).forEach(btn => {
    btn.addEventListener('click', () => {
      swCmp(t, btn.dataset.mode);
      btn.classList.add('active');
      const state = getState(t);
      if (state.analyzed) {
        if (btn.dataset.mode === 'yr' && renderFns?.yr)   renderFns.yr(t);
        if (btn.dataset.mode === 'bs' && renderFns?.bs)   renderFns.bs(t);
        if (btn.dataset.mode === 'ref' && renderFns?.ref) renderFns.ref(t);
      }
    });
  });

  // Slider live updates + re-render
  const sliders = [
    { id: `${t}-bs-cv`,  label: `${t}-bs-cvv`,  render: renderFns?.bs  },
    { id: `${t}-ref-cv`, label: `${t}-ref-cvv`, render: renderFns?.ref },
    { id: `${t}-yr-cv`,  label: `${t}-yr-cvv`,  render: renderFns?.yr  },
  ];
  sliders.forEach(({ id, label, render }) => {
    const slider = document.getElementById(id);
    const lbl    = document.getElementById(label);
    if (!slider) return;
    slider.addEventListener('input', () => {
      if (lbl) lbl.textContent = slider.value + '%';
      const state = getState(t);
      if (state.analyzed && render) render(t);
    });
  });

  // REF/BS group selectors
  [`${t}-bs-grp`, `${t}-ref-grp`, `${t}-yr-grp`].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      const state = getState(t);
      if (!state.analyzed) return;
      if (id.includes('-bs-'))  renderFns?.bs?.(t);
      if (id.includes('-ref-')) renderFns?.ref?.(t);
      if (id.includes('-yr-'))  renderFns?.yr?.(t);
    });
  });

  // Filter dropdowns — re-render on change
  const filterMap = [
    [`${t}-ov-yr`,  renderFns?.ov],
    [`${t}-ov-loc`, renderFns?.ov],
    [`${t}-ov-p`,   renderFns?.ov],
    [`${t}-st-grp`, renderFns?.st],
    [`${t}-st-yr`,  renderFns?.st],
    [`${t}-st-p`,   renderFns?.st],
    [`${t}-st-outlier`, renderFns?.st],
    [`${t}-std-yr`, renderFns?.std],
    [`${t}-std-loc`,renderFns?.std],
    [`${t}-std-p`,  renderFns?.std],
    [`${t}-std-show`,renderFns?.std],
    [`${t}-ref-yr`, renderFns?.ref],
    [`${t}-ref-p`,  renderFns?.ref],
    [`${t}-ref-loc`,renderFns?.ref],
    [`${t}-bs-yr`,  renderFns?.bs],
    [`${t}-bs-p`,   renderFns?.bs],
    [`${t}-bs-loc`, renderFns?.bs],
    [`${t}-yr-loc`, renderFns?.yr],
    [`${t}-yr-par`, renderFns?.yr],
    [`${t}-mk-p`,   renderFns?.mk],
    [`${t}-mk-loc`, renderFns?.mk],
    [`${t}-mk-sig`, renderFns?.mk],
    [`${t}-para-yr`,  renderFns?.para],
    [`${t}-para-loc`, renderFns?.para],
    [`${t}-ch-p`,   renderFns?.chart],
    [`${t}-ch-grp`, renderFns?.chart],
    [`${t}-ch-yr`,  renderFns?.chart],
    [`${t}-raw-yr`, renderFns?.raw],
  ];
  filterMap.forEach(([id, fn]) => {
    if (!fn) return;
    const sel = document.getElementById(id);
    if (!sel) return;
    const evt = sel.type === 'checkbox' ? 'change' : 'change';
    sel.addEventListener(evt, () => { if (getState(t).analyzed) fn(t); });
  });
}
