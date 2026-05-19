import './style.css';
import { L, LANG, setLang } from './utils/lang.js';
import { TYPE_CFG } from './core/standards.js';
import { getDemoData, DEMO_AUTO_TICKS } from './data/demo.js';
import { getState, setRaw } from './core/state.js';
import { buildPage } from './ui/buildPage.js';
import { wireEvents, setSt, setupCols, runDQ } from './ui/events.js';
import { renderOV, renderST, renderSTD, renderRAW } from './ui/renders.js';
import { renderCMP, renderBS, renderYR, renderMK, renderChart } from './ui/renders2.js';
import { renderParaSea, renderParaSed, renderParaGeneric } from './ui/renderPara.js';
import { runAnalysis } from './core/runAnalysis.js';
import { buildBioPage } from './ui/buildBioPage.js';
import { doExport, openSettings, downloadTemplate, getMRL, loadMRL } from './ui/actions.js';

const renderFns = {
  ov:    renderOV,
  st:    renderST,
  std:   renderSTD,
  raw:   renderRAW,
  ref:   renderCMP,
  bs:    renderBS,
  yr:    renderYR,
  mk:    renderMK,
  chart: renderChart,
  para: t => {
    const box = document.getElementById(`${t}-para-box`);
    if (!box) return;
    try {
      if (t === 'sea') box.innerHTML = renderParaSea(t);
      else if (t === 'sed') box.innerHTML = renderParaSed(t);
      else box.innerHTML = renderParaGeneric(t);
    } catch(e) {
      box.innerHTML = `<span style="color:var(--red)">Error: ${e.message}</span>`;
      console.error(e);
    }
  },
};

function loadDemo(t) {
  const data = getDemoData()[t];
  if (!data) return;
  setRaw(t, data);
  setupCols(t);
  runDQ(t);
  document.getElementById(`${t}-btn-run`).disabled = false;
  const fi = document.getElementById(`${t}-finfo`);
  fi.style.display = 'block';
  fi.innerHTML = `<b>Demo: ${TYPE_CFG[t].name}</b> — ${data.length} rows · 2 locations · 10 stations · 4 yrs`;
  setSt(t, 'โหลด Demo สำเร็จ กด "วิเคราะห์ข้อมูล" เพื่อเริ่ม', 'ok');
  setTimeout(() => {
    document.querySelectorAll(`.rck-${t}`).forEach(cb => { if (cb.value === DEMO_AUTO_TICKS.ref) cb.checked = true; });
    document.querySelectorAll(`.bck-${t}`).forEach(cb => { if (cb.value === DEMO_AUTO_TICKS.baseline) cb.checked = true; });
  }, 80);
}

function openPage(t) {
  document.getElementById('page-home').style.display = 'none';
  document.querySelectorAll('.apage').forEach(p => p.classList.remove('show'));
  const el = document.getElementById('page-' + t);
  if (!el) return;
  if (!el.dataset.built) {
    if (t === 'bio') {
      buildBioPage(el);
    } else {
      buildPage(t, el);
      wireEvents(t, {
        loadDemo,
        runAnalysis: t => runAnalysis(t, renderFns),
        renderFns,
        downloadTemplate: t => downloadTemplate(t),
        openSettings:     t => openSettings(t, renderFns),
        doExport:         t => doExport(t),
        copyPara:         t => {
          const box = document.getElementById(`${t}-para-box`);
          if (box) navigator.clipboard.writeText(box.textContent).then(() => setSt(t,'คัดลอกแล้ว ✓','ok'));
        },
      });
    }
    el.dataset.built = '1';
  }
  el.classList.add('show');
}

function goHome() {
  document.querySelectorAll('.apage').forEach(p => p.classList.remove('show'));
  document.getElementById('page-home').style.display = 'flex';
}

// ── Home events (delegated) ───────────────────────────────────────────────────
document.querySelectorAll('.tc[data-tab]').forEach(card => {
  card.addEventListener('click', () => openPage(card.dataset.tab));
});

document.addEventListener('click', e => {
  if (e.target.closest('[data-back]')) goHome();
  if (e.target.closest('.theme-toggle')) toggleTheme();
});

// ── Lang toggle ───────────────────────────────────────────────────────────────
function buildHome() {
  const isEN = LANG === 'en';
  document.getElementById('home-title').textContent = isEN ? 'Environmental Data Analysis' : 'วิเคราะห์ข้อมูลสิ่งแวดล้อม';
  document.getElementById('home-sub').textContent   = isEN ? 'systematically' : 'อย่างมีระบบ';
  document.getElementById('home-desc').textContent  = isEN ? 'Select data type to analyze' : 'เลือกประเภทข้อมูลที่ต้องการวิเคราะห์';
  const cards = {
    sea:   { name:'Seawater',      subTH:'คุณภาพน้ำทะเล<br>Thai PCD 2564',             subEN:'Seawater Quality<br>Thai PCD 2564' },
    sed:   { name:'Sediment',      subTH:'ดินตะกอนพื้นท้องทะเล<br>Thai PCD + ERL/ERM', subEN:'Marine Sediment<br>Thai PCD + ERL/ERM' },
    sw:    { name:'Surface Water', subTH:'คุณภาพน้ำผิวดิน<br>Thai PCD + WHO + EPA',     subEN:'Surface Water Quality<br>Thai PCD + WHO + EPA' },
    air:   { name:'Air Quality',   subTH:'คุณภาพอากาศ<br>PM2.5, PM10, NO₂',            subEN:'Air Quality<br>PM2.5, PM10, NO₂' },
    noise: { name:'Noise',         subTH:'ระดับเสียง<br>กำหนดมาตรฐานเองได้',            subEN:'Noise Level<br>Custom Standards' },
    bio:   { name:'Biology',       subTH:'Benthos · Phytoplankton<br>Zooplankton · Larvae', subEN:'Benthos · Phytoplankton<br>Zooplankton · Larvae' },
  };
  document.querySelectorAll('.tc[data-tab]').forEach(card => {
    const cfg = cards[card.dataset.tab]; if (!cfg) return;
    const nameEl = card.querySelector('.tc-name');
    const subEl  = card.querySelector('.tc-sub');
    if (nameEl) nameEl.textContent = cfg.name;
    if (subEl)  subEl.innerHTML = isEN ? cfg.subEN : cfg.subTH;
  });
}

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.lang === LANG) return;
    setLang(btn.dataset.lang);
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    buildHome();
    document.querySelectorAll('.apage[data-built]').forEach(el => {
      const t = el.id.replace('page-', '');
      if (t === 'bio') return; // Bio doesn't need rebuild
      const state = getState(t);
      el.innerHTML = '';
      delete el.dataset.built;
      buildPage(t, el);
      wireEvents(t, {
        loadDemo,
        runAnalysis: t => runAnalysis(t, renderFns),
        renderFns,
        downloadTemplate: t => downloadTemplate(t),
        openSettings:     t => openSettings(t, renderFns),
        doExport:         t => doExport(t),
        copyPara:         t => {
          const box = document.getElementById(`${t}-para-box`);
          if (box) navigator.clipboard.writeText(box.textContent).then(() => setSt(t,'คัดลอกแล้ว ✓','ok'));
        },
      });
      el.dataset.built = '1';
      if (state.analyzed) runAnalysis(t, renderFns);
    });
  });
});

buildHome();

// ── Theme toggle ──────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('aer-theme');
  if (saved === 'dark') document.body.classList.add('dark');
  updateThemeBtn();
}

function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('aer-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  updateThemeBtn();
}

function updateThemeBtn() {
  const isDark = document.body.classList.contains('dark');
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.textContent = isDark ? '☀ Light' : '☾ Dark';
  });
}

initTheme();

// ── Load saved MRL ────────────────────────────────────────────────────────────
['sea','sed','sw','air','noise'].forEach(t => loadMRL(t));