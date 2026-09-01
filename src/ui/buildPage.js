/**
 * buildPage.js — page shell for the redesigned Seawater / Sediment modules
 */

import { LANG } from '../utils/lang.js';
import { TYPE_CFG } from '../core/standards.js';

const ICONS = {
  sea: `<path d="M2 12c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M2 17c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M2 7c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/>`,
  sed: `<ellipse cx="12" cy="17" rx="9" ry="3"/><path d="M3 17V7a9 3 0 0118 0v10"/><path d="M12 14V4"/>`,
};

export function buildPage(t, el) {
  const cfg = TYPE_CFG[t];
  const isEN = LANG === 'en';

  el.innerHTML = `
  <div class="ph">
    <button class="ph-back" data-back="${t}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      ${isEN ? 'Home' : 'หน้าหลัก'}
    </button>
    <div class="ph-div"></div>
    <span class="ph-title">${cfg.name}</span>
  </div>

  <div class="module-shell accent-${cfg.accent}">
    <div class="page-head">
      <span class="module-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS[t]}</svg>${cfg.name}</span>
      <h1 id="${t}-view-title">${isEN ? 'Data Overview' : 'ข้อมูลพื้นฐาน'}</h1>
    </div>

    <div class="view-nav">
      <button class="view-nav-btn active" data-view-btn="dashboard">${isEN ? 'Data Overview' : 'ข้อมูลพื้นฐาน'}</button>
      <button class="view-nav-btn" data-view-btn="standards">${isEN ? 'Standards' : 'มาตรฐานอ้างอิง'}</button>
      <button class="view-nav-btn" data-view-btn="refmap">${isEN ? 'REF / Baseline' : 'REF / Baseline'}</button>
      <button class="view-nav-btn" data-view-btn="comparison">${isEN ? 'Comparison' : 'เปรียบเทียบ'}</button>
      <button class="view-nav-btn" data-view-btn="report">${isEN ? 'Report' : 'รายงาน'}</button>
    </div>

    <div class="view-pane active" id="${t}-view-dashboard">
      <div class="command-bar">
        <input type="file" id="${t}-fi" accept=".xlsx,.xls,.csv" style="display:none">
        <div class="cmd-file" id="${t}-cmd-file" style="display:none">
          <span class="file-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg></span>
          <span><div class="file-name" id="${t}-file-name"></div><div class="file-meta" id="${t}-file-meta"></div></span>
        </div>
        <button class="btn" id="${t}-btn-upload" data-upload="${t}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          ${isEN ? 'Upload file' : 'อัปโหลดไฟล์'}
        </button>
        <button class="btn" data-demo="${t}">${isEN ? 'Load demo' : 'ทดลอง Demo'}</button>
        <div class="cmd-map" id="${t}-cmd-map" style="display:none">
          <span class="dot"></span> <span id="${t}-cmd-map-text">${isEN ? 'Columns mapped' : 'จับคู่คอลัมน์แล้ว'}</span>
          <a href="#" data-editmap="${t}">— ${isEN ? 'edit' : 'แก้ไข'}</a>
        </div>
        <div class="cmd-spacer"></div>
        <button class="btn" data-template="${t}">${isEN ? 'Download Template' : 'Download Template'}</button>
        <button class="btn" id="${t}-btn-importcfg" data-importcfg="${t}" disabled>${isEN ? 'Import Config' : 'นำเข้าการตั้งค่า'}</button>
        <button class="btn" id="${t}-btn-exportcfg" data-exportcfg="${t}" disabled>${isEN ? 'Export Config' : 'ส่งออกการตั้งค่า'}</button>
        <button class="btn" id="${t}-btn-export" data-export="${t}" disabled>${isEN ? 'Export' : 'Export'}</button>
        <button class="btn btn-primary" id="${t}-btn-run" data-run="${t}" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          ${isEN ? 'Run analysis' : 'วิเคราะห์ข้อมูล'}
        </button>
      </div>

      <div id="${t}-dq-wrap"></div>

      <div id="${t}-dash-body">
      <div id="${t}-kpi-strip" class="kpi-strip"></div>

      <div class="toolbar" id="${t}-toolbar">
        <div class="field-picker">
          <button type="button" class="btn field-picker-btn" data-fp-toggle="${t}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            ${isEN ? 'Columns:' : 'จัดกลุ่ม:'} <b id="${t}-fp-summary">Year + Location</b>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;margin-left:1px"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="field-popover" id="${t}-fp-popover">
            <div class="field-popover-hd">${isEN ? 'Quick picks' : 'เลือกด่วน'}</div>
            <div class="fp-presets">
              <button type="button" class="fp-preset" data-t="${t}" data-preset="overview">${isEN ? 'Overview' : 'ภาพรวม'}</button>
              <button type="button" class="fp-preset" data-t="${t}" data-preset="location">${isEN ? 'By location' : 'แยกตามพื้นที่'}</button>
              <button type="button" class="fp-preset" data-t="${t}" data-preset="station">${isEN ? 'By station' : 'แยกตามสถานี'}</button>
            </div>
            <div class="field-popover-hd field-popover-hd-2">${isEN ? 'Group table by' : 'จัดกลุ่มตาราง'}</div>
            <label><input type="checkbox" class="fp-check" data-t="${t}" value="year" checked> ${isEN ? 'Year' : 'ปี'}</label>
            <label><input type="checkbox" class="fp-check" data-t="${t}" value="loc" checked> Location</label>
            <label><input type="checkbox" class="fp-check" data-t="${t}" value="st"> Station</label>
            ${t === 'sea' ? `<label><input type="checkbox" class="fp-check" data-t="${t}" value="wl"> ${isEN ? 'Depth level' : 'ระดับความลึก'}</label>` : ''}
            <div class="field-popover-hint">${isEN ? 'Parameter is always shown.' : 'Parameter จะแสดงอยู่ในตารางเสมอ'}</div>
          </div>
        </div>
        <div class="toolbar-divider"></div>
        <div class="pill-field"><label>${isEN ? 'Outlier σ×' : 'Outlier σ×'}</label><input type="number" id="${t}-outlier" min="0" step="0.5" value="3"></div>
        <div class="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="${t}-search" placeholder="${isEN ? 'Search parameter, station, location…' : 'ค้นหา parameter, station, location…'}">
        </div>
      </div>

      <div class="table-card" id="${t}-table-card"></div>
      </div>
    </div>

    <div class="view-pane" id="${t}-view-standards">
      <div id="${t}-standards-root"></div>
    </div>

    <div class="view-pane" id="${t}-view-refmap">
      <div id="${t}-refmap-root"></div>
    </div>

    <div class="view-pane" id="${t}-view-comparison">
      <div id="${t}-comparison-root"></div>
    </div>

    <div class="view-pane" id="${t}-view-report">
      <div id="${t}-report-root"></div>
    </div>
  </div>

  <input type="file" id="${t}-importmap-fi" accept=".json" style="display:none">
  `;
}
