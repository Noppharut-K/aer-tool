/**
 * buildPage — generates the HTML for each analysis tab page
 * Called once when user clicks a type card on the home screen
 */

import { LANG, L } from '../utils/lang.js';
import { TYPE_CFG, STD } from '../core/standards.js';

/** Build the standard reference table for tab pane 8 */
function buildStdRef(t) {
  const s = STD[t] || {};
  if (!Object.keys(s).length)
    return `<div class="empty-state"><p>กำหนดมาตรฐานใน Sidebar</p></div>`;

  const isSed = t === 'sed';
  const ths = isSed
    ? ['Parameter','Name','Unit','PCD Max','ERL','ERM']
    : ['Parameter','Name','Unit','PCD Min','PCD Max','WHO','EPA'];

  const rows = Object.entries(s).map(([k, v]) =>
    isSed
      ? `<tr><td class="em num">${k}</td><td>${v.label||''}</td><td>${v.unit||''}</td><td>${v.pcd_max??'—'}</td><td>${v.erl??'—'}</td><td>${v.erm??'—'}</td></tr>`
      : `<tr><td class="em num">${k}</td><td>${v.label||''}</td><td>${v.unit||''}</td><td>${v.pcd_min??'—'}</td><td>${v.pcd_max??'—'}</td><td>${v.who_max??v.who_min??'—'}</td><td>${v.epa_max??v.epa_min??'—'}</td></tr>`
  ).join('');

  return `<div class="tbl-wrap"><table><thead><tr>${ths.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * Build and inject HTML for an analysis page
 * @param {string} t  - Tab ID (sea, sed, sw, air, noise)
 * @param {HTMLElement} el - Target container element
 */
export function buildPage(t, el) {
  const cfg = TYPE_CFG[t];
  const l   = L[LANG] || L.th;
  const isEN = LANG === 'en';

  el.innerHTML = `
  <!-- Page Header -->
  <div class="ph">
    <button class="ph-back" data-back="${t}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      ${l.back}
    </button>
    <div class="ph-div"></div>
    <div style="display:flex;flex-direction:column;gap:1px">
      <span class="ph-title">${cfg.name}</span>
      <span class="ph-sub">${(l.type_th||{})[t]||''}</span>
    </div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
      <button class="btn btn-outline btn-sm" data-settings="${t}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2m0 16v2m7.07-5.07l-1.41-1.41M4.93 19.07l1.41-1.41M22 12h-2M4 12H2"/></svg>
        Settings
      </button>
      <button class="btn btn-outline btn-sm demo-btn" data-demo="${t}">${l.demo}</button>
      <button class="btn btn-outline btn-sm" id="${t}-btn-xl" disabled data-export="${t}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${l.export}
      </button>
    </div>
  </div>

  <!-- Layout: Sidebar + Content -->
  <div class="layout">

    <!-- ── SIDEBAR ─────────────────────────────────────────────── -->
    <aside class="sb">

      <!-- Upload -->
      <div class="sb-block">
        <div class="sb-title sb-upload-lbl">${l.upload}</div>
        <div class="dropzone" id="${t}-dz">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin:0 auto;display:block"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          <p class="dz-p">${l.dz_p}</p>
          <small class="dz-s">${l.dz_s}</small>
          <input type="file" id="${t}-fi" accept=".xlsx,.xls,.csv">
        </div>
        <div id="${t}-finfo" style="display:none;margin-top:8px;font-size:12px;color:var(--blue);background:var(--blue-l);padding:7px 10px;border-radius:var(--rs);border:1px solid var(--blue-m);"></div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <button class="btn btn-outline btn-sm btn-full" data-template="${t}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Template
          </button>
          <div style="margin-top:5px;font-size:11px;color:var(--text3)">ดาวน์โหลด template Excel พร้อม headers</div>
        </div>
      </div>

      <!-- Column Mapping -->
      <div class="sb-block collapsible collapsed">
        <div class="sb-title" data-toggle-sb>${l.cols}</div>
        <div class="sb-body">
          ${['area','loc','st'].map(k=>`
            <div class="field">
              <label>${l['col_'+k]}</label>
              <select id="${t}-c-${k}"><option value="" class="f-all-opt">${l.col_auto}</option></select>
            </div>`).join('')}
          ${t==='sea' ? `<div class="field"><label>${l.col_depth}</label><select id="${t}-c-depth"><option value="">${l.col_none}</option></select></div>` : ''}
          ${t==='sea' ? `<div class="field"><label>${l.col_wl}</label><select id="${t}-c-wl"><option value="">${l.col_none}</option></select></div>` : ''}
          ${t==='sed' ? `<div class="field"><label>${l.col_dist}</label><select id="${t}-c-dist"><option value="">${l.col_none}</option></select></div>` : ''}
          <div class="field">
            <label>${l.col_year}</label>
            <select id="${t}-c-year"><option value="">${l.col_none}</option></select>
          </div>
          <div class="field">
            <label style="font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px">${isEN?'Sampling Date':'วันที่เก็บตัวอย่าง'}</label>
            <select id="${t}-c-date"><option value="">${l.col_none}</option></select>
          </div>
          <div class="field">
            <label>${l.col_rtype}</label>
            <select id="${t}-c-rtype"><option value="">${l.col_none}</option></select>
          </div>
        </div>
      </div>

      <!-- Report Type Filter -->
      <div class="sb-block" id="${t}-rtype-block" style="display:none">
        <div class="sb-title">${l.rtype_sec}</div>
        <div class="sb-body" id="${t}-rtype-body" style="padding:4px 8px 8px"></div>
      </div>

      <!-- Baseline Stations -->
      <div class="sb-block collapsible collapsed">
        <div class="sb-title" data-toggle-sb>Baseline Stations</div>
        <div class="sb-body">
          <div class="ref-list" id="${t}-bslist"><p style="font-size:12px;color:var(--text3);padding:4px">${l.es_raw}</p></div>
        </div>
      </div>

      <!-- REF Stations -->
      <div class="sb-block collapsible collapsed">
        <div class="sb-title" data-toggle-sb>${l.ref_sec}</div>
        <div class="sb-body">
          <div class="ref-list" id="${t}-reflist"><p style="font-size:12px;color:var(--text3);padding:4px">${l.es_raw}</p></div>
        </div>
      </div>

      <!-- Baseline Comparison -->
      <div class="sb-block collapsible collapsed">
        <div class="sb-title" data-toggle-sb>${isEN?'Baseline Comparison':'เทียบ Baseline'}</div>
        <div class="sb-body">
          <div class="field">
            <label class="bs-grp-lbl">${l.ref_grp_lbl}</label>
            <select id="${t}-bs-grp">
              <option value="location" selected>${l.o_loc}</option>
              <option value="station">${l.o_st}</option>
              <option value="area">${l.o_area}</option>
            </select>
          </div>
          <div class="field">
            <label style="font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px">CV THRESHOLD</label>
            <div class="range-row">
              <input type="range" id="${t}-bs-cv" min="5" max="100" step="5" value="30">
              <span class="range-val" id="${t}-bs-cvv">30%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- REF Comparison -->
      <div class="sb-block collapsible collapsed">
        <div class="sb-title sb-rc-title" data-toggle-sb>${l.refcmp}</div>
        <div class="sb-body">
          <div class="field">
            <label class="rc-grp-lbl">${l.ref_grp_lbl}</label>
            <select id="${t}-ref-grp">
              <option value="location" selected>${l.o_loc}</option>
              <option value="station">${l.o_st}</option>
              <option value="area">${l.o_area}</option>
            </select>
          </div>
          <div class="field">
            <label style="font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px">CV THRESHOLD</label>
            <div class="range-row">
              <input type="range" id="${t}-ref-cv" min="5" max="100" step="5" value="30">
              <span class="range-val" id="${t}-ref-cvv">30%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Year Comparison -->
      <div class="sb-block collapsible collapsed">
        <div class="sb-title sb-yr-title" data-toggle-sb>${l.yrcmp}</div>
        <div class="sb-body">
          <div class="field">
            <label class="yr-grp-lbl">${l.ref_grp_lbl}</label>
            <select id="${t}-yr-grp">
              <option value="location" selected>${l.o_loc}</option>
              <option value="station">${l.o_st}</option>
              <option value="area">${l.o_area}</option>
            </select>
          </div>
          <div class="field">
            <label style="font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px">CV THRESHOLD</label>
            <div class="range-row">
              <input type="range" id="${t}-yr-cv" min="5" max="100" step="5" value="20">
              <span class="range-val" id="${t}-yr-cvv">20%</span>
            </div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">ต่างกันเกินนี้ = แสดงรายละเอียด</div>
          </div>
        </div>
      </div>

      <!-- Noise Standards -->
      ${t==='noise' ? `
      <div class="sb-block">
        <div class="sb-title sb-ns-title">${l.ns_sec}</div>
        <div id="${t}-nsr-list"></div>
        <button class="btn btn-outline btn-sm btn-full ns-add-btn" style="margin-top:6px" data-nsr-add="${t}">${l.ns_add}</button>
        <div class="ns-hint" style="margin-top:6px;font-size:10.5px;color:var(--text4)">${l.ns_hint}</div>
      </div>` : ''}

      <!-- Run Analysis -->
      <div class="sb-block">
        <button class="btn btn-primary btn-full" id="${t}-btn-run" disabled data-run="${t}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          ${l.run}
        </button>
        <div class="sbar sbar-idle" id="${t}-status" style="margin-top:8px">${l.wait}</div>
      </div>

    </aside>

    <!-- ── CONTENT ──────────────────────────────────────────────── -->
    <div class="content">
      <div class="tabs-bar">
        ${l.tabs.map((tab,i) => `<button class="tab-btn${i===0?' active':''}" data-tab="${t}" data-idx="${i}">${tab}</button>`).join('')}
      </div>
      <div class="content-body">

        <!-- 0: Overview -->
        <div class="tab-pane active" id="${t}-pane-0">
          <div id="${t}-dq-wrap"></div>
          <div class="stat-row">
            <div class="sc sc-blue"><div class="lbl">${l.sc[0]}</div><div class="val" id="${t}-sc-st">—</div><div class="sub">${l.sc_sub[0]}</div></div>
            <div class="sc sc-blue"><div class="lbl">${l.sc[1]}</div><div class="val" id="${t}-sc-p">—</div><div class="sub">${l.sc_sub[1]}</div></div>
            <div class="sc sc-red"><div class="lbl">${l.sc[2]}</div><div class="val" id="${t}-sc-ep">—</div><div class="sub">${l.sc_sub[2]}</div></div>
            <div class="sc sc-amber"><div class="lbl">${l.sc[3]}</div><div class="val" id="${t}-sc-es">—</div><div class="sub">${l.sc_sub[3]}</div></div>
            <div class="sc sc-green"><div class="lbl">${l.sc[4]}</div><div class="val" id="${t}-sc-ok">—</div><div class="sub">${l.sc_sub[4]}</div></div>
          </div>
          <div class="sh tl-sh">${l.tl_title}</div>
          <div class="tl-grid" id="${t}-tl-grid"><div class="empty-state"><p>${l.es_ov}</p><small>${l.es_ov2}</small></div></div>
          <div class="sh" style="margin-top:16px">Overview Table</div>
          <div class="filter-bar">
            <div class="field"><label class="fl-yr">${l.f_yr}</label><select id="${t}-ov-yr"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            <div class="field"><label class="fl-loc">${l.f_loc}</label><select id="${t}-ov-loc"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            <div class="field"><label class="fl-p">${l.f_p}</label><select id="${t}-ov-p"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            ${t==='sea'?`<div class="field"><label>${l.col_wl}</label><select id="${t}-ov-wl"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>`:''}
          </div>
          <div class="tbl-wrap" id="${t}-tbl-ov"><div class="empty-state"><p>${l.es_ov}</p></div></div>
        </div>

        <!-- 1: Statistics -->
        <div class="tab-pane" id="${t}-pane-1">
          <div class="filter-bar">
            <div class="field"><label class="fl-grp">${l.f_grp}</label><select id="${t}-st-grp"><option value="param">${l.g_p}</option><option value="loc">${l.g_lp}</option><option value="station">${l.g_sp}</option></select></div>
            <div class="field"><label>Outlier</label><select id="${t}-st-outlier"><option value="none">None</option><option value="z2">Z-score &gt; 2σ</option><option value="z3">Z-score &gt; 3σ</option><option value="iqr">IQR (1.5×)</option></select></div>
            <div class="field"><label class="fl-yr">${l.f_yr}</label><select id="${t}-st-yr"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            <div class="field"><label class="fl-p">${l.f_p}</label><select id="${t}-st-p"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            ${t==='sed'?`<div class="field"><label>Distance</label><select id="${t}-st-dist"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>`:''}
            ${t==='sea'?`<div class="field"><label>${l.col_wl}</label><select id="${t}-st-wl"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>`:''}
          </div>
          <div class="tbl-wrap" id="${t}-tbl-st"><div class="empty-state"><p>${l.es_ana}</p></div></div>
        </div>

        <!-- 2: Standards -->
        <div class="tab-pane" id="${t}-pane-2">
          <div class="filter-bar">
            <div class="field"><label class="fl-yr">${l.f_yr}</label><select id="${t}-std-yr"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            <div class="field"><label class="fl-loc">${l.f_loc}</label><select id="${t}-std-loc"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            <div class="field"><label class="fl-p">${l.f_p}</label><select id="${t}-std-p"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            <div class="field"><label>${l.f_show}</label><select id="${t}-std-show"><option value="all">${l.f_all}</option><option value="exceed">${l.f_exc}</option></select></div>
            ${t==='sed'?`<div class="field"><label>Distance</label><select id="${t}-std-dist"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>`:''}
            ${t==='sea'?`<div class="field"><label>${l.col_wl}</label><select id="${t}-std-wl"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>`:''}
          </div>
          <div class="tbl-wrap" id="${t}-tbl-std"><div class="empty-state"><p>${l.es_ana}</p></div></div>
        </div>

        <!-- 3: Comparison -->
        <div class="tab-pane" id="${t}-pane-3">
          <div style="display:flex;gap:8px;margin-bottom:14px;">
            <button class="btn btn-outline btn-sm cmp-btn active" data-cmp="${t}" data-mode="ref">${isEN?'vs REF':'เทียบ REF'}</button>
            <button class="btn btn-outline btn-sm cmp-btn" data-cmp="${t}" data-mode="bs">${isEN?'vs Baseline':'เทียบ Baseline'}</button>
            <button class="btn btn-outline btn-sm cmp-btn" data-cmp="${t}" data-mode="yr">${isEN?'Year Comparison':'เทียบรายปี'}</button>
          </div>
          <div id="${t}-cmp-ref">
            <div class="filter-bar">
              <div class="field"><label class="fl-yr">${l.f_yr}</label><select id="${t}-ref-yr"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
              <div class="field"><label>${l.th_loc}</label><select id="${t}-ref-loc"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
              <div class="field"><label class="fl-p">${l.f_p}</label><select id="${t}-ref-p"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            </div>
            <div class="tbl-wrap" id="${t}-tbl-ref"><div class="empty-state"><p>${l.es_ref}</p></div></div>
          </div>
          <div id="${t}-cmp-bs" style="display:none">
            <div class="filter-bar">
              <div class="field"><label class="fl-yr">${l.f_yr}</label><select id="${t}-bs-yr"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
              <div class="field"><label>${l.th_loc}</label><select id="${t}-bs-loc"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
              <div class="field"><label class="fl-p">${l.f_p}</label><select id="${t}-bs-p"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            </div>
            <div class="tbl-wrap" id="${t}-tbl-bs"><div class="empty-state"><p>${isEN?'Select Baseline Stations in the sidebar first':'เลือก Baseline Station ใน Sidebar ก่อน'}</p></div></div>
          </div>
          <div id="${t}-cmp-yr" style="display:none">
            <div class="filter-bar">
              <div class="field"><label class="fl-loc">${l.f_loc}</label><select id="${t}-yr-loc"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
              <div class="field"><label class="fl-p">${l.f_p}</label><select id="${t}-yr-par"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            </div>
            <div class="tbl-wrap" id="${t}-tbl-yr"><div class="empty-state"><p>${l.es_yr}</p></div></div>
          </div>
        </div>

        <!-- 4: Trend -->
        <div class="tab-pane" id="${t}-pane-4">
          <div class="filter-bar">
            <div class="field"><label class="fl-p">${l.f_p}</label><select id="${t}-mk-p"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            <div class="field"><label class="fl-loc">${l.f_loc}</label><select id="${t}-mk-loc"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            <div class="field" style="align-self:flex-end">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;text-transform:none;font-size:12.5px;color:var(--text2)">
                <input type="checkbox" id="${t}-mk-sig" style="accent-color:var(--blue);width:14px;height:14px">
                <span class="fl-mk-sig">${l.mk_sig_lbl}</span>
              </label>
            </div>
          </div>
          <div class="tbl-wrap" id="${t}-tbl-mk"><div class="empty-state"><p>${l.es_mk}</p></div></div>
          <div class="chart-box" style="height:340px;margin-top:14px;"><canvas id="${t}-mk-chart"></canvas></div>
        </div>

        <!-- 5: Report -->
        <div class="tab-pane" id="${t}-pane-5">
          <div class="filter-bar">
            <div class="field"><label class="fl-yr para-yr-lbl">${l.para_yr_lbl}</label><select id="${t}-para-yr"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            <div class="field"><label class="fl-loc para-loc-lbl">${l.para_loc_lbl}</label><select id="${t}-para-loc"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
            <button class="btn btn-outline btn-sm para-copy-btn" style="align-self:flex-end" data-copy-para="${t}">${l.para_copy}</button>
          </div>
          <div class="para-draft-notice para-notice-text">${l.para_notice}</div>
          <div class="para-box" id="${t}-para-box"><span style="color:var(--text3)">${l.es_ana}</span></div>
        </div>

        <!-- 6: Chart -->
        <div class="tab-pane" id="${t}-pane-6">
          <div class="filter-bar">
            <div class="field"><label class="fl-p">${l.f_p}</label><select id="${t}-ch-p"><option value="">${l.f_sel}</option></select></div>
            <div class="field"><label class="fl-grp">${l.f_grp}</label><select id="${t}-ch-grp"><option value="station">${l.o_st}</option><option value="location">${l.o_loc}</option></select></div>
            <div class="field"><label class="fl-yr">${l.f_yr}</label><select id="${t}-ch-yr"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
          </div>
          <div class="chart-box" style="height:420px;"><canvas id="${t}-main-chart"></canvas></div>
        </div>

        <!-- 7: Raw Data -->
        <div class="tab-pane" id="${t}-pane-7">
          <div class="filter-bar">
            <div class="field"><label class="fl-yr">${l.f_yr}</label><select id="${t}-raw-yr"><option value="all" class="f-all-opt">${l.f_all}</option></select></div>
          </div>
          <div class="tbl-wrap" id="${t}-tbl-raw"><div class="empty-state"><p>${l.es_raw}</p></div></div>
        </div>

        <!-- 8: Standard Reference -->
        <div class="tab-pane" id="${t}-pane-8">
          ${buildStdRef(t)}
        </div>

      </div><!-- /content-body -->
    </div><!-- /content -->
  </div><!-- /layout -->
  `;

  // Setup drag-and-drop on dropzone
  const dz = document.getElementById(`${t}-dz`);
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file) dz.dispatchEvent(new CustomEvent('file-dropped', { detail: file }));
    });
  }

  // Setup collapsible sidebar blocks
  el.querySelectorAll('[data-toggle-sb]').forEach(title => {
    title.addEventListener('click', () => {
      title.closest('.sb-block')?.classList.toggle('collapsed');
    });
  });

  // Setup slider live updates
  [
    [`${t}-bs-cv`, `${t}-bs-cvv`],
    [`${t}-ref-cv`, `${t}-ref-cvv`],
    [`${t}-yr-cv`, `${t}-yr-cvv`],
  ].forEach(([sliderId, labelId]) => {
    const slider = document.getElementById(sliderId);
    const label  = document.getElementById(labelId);
    if (slider && label) {
      slider.addEventListener('input', () => { label.textContent = slider.value + '%'; });
    }
  });
}
