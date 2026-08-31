import './style.css';
import { LANG, setLang } from './utils/lang.js';
import { TYPE_CFG } from './core/standards.js';
import { getDemoData } from './data/demo.js';
import { getState } from './core/state.js';
import { buildPage } from './ui/buildPage.js';
import { wireEvents, loadDemoInto } from './ui/events.js';
import { renderDashboard } from './ui/renders.js';
import { downloadTemplate, doExport } from './ui/actions.js';
import { buildBioPage } from './ui/buildBioPage.js';

function loadDemo(t) {
  const data = getDemoData()[t];
  if (!data) return;
  loadDemoInto(t, data, {
    name: `Demo: ${TYPE_CFG[t].name}`,
    sub: `${data.length} ${LANG === 'en' ? 'rows' : 'แถว'} · 2 locations · 10 stations · 4 yrs`,
  });
}

function buildAndWire(t, el) {
  buildPage(t, el);
  wireEvents(t, { loadDemo, downloadTemplate, doExport });
  renderDashboard(t);
}

function openPage(t) {
  document.getElementById('page-home').style.display = 'none';
  document.querySelectorAll('.apage').forEach(p => p.classList.remove('show'));
  const el = document.getElementById('page-' + t);
  if (!el) return;
  if (!el.dataset.built) {
    if (t === 'bio') buildBioPage(el);
    else buildAndWire(t, el);
    el.dataset.built = '1';
  }
  el.classList.add('show');
}

function goHome() {
  document.querySelectorAll('.apage').forEach(p => p.classList.remove('show'));
  document.getElementById('page-home').style.display = 'flex';
}

// ── Home events (delegated) ──────────────────────────────────────────────
document.querySelectorAll('.tc[data-tab]').forEach(card => {
  card.addEventListener('click', () => openPage(card.dataset.tab));
});

document.addEventListener('click', e => {
  if (e.target.closest('[data-back]')) goHome();
  if (e.target.closest('.theme-toggle')) toggleTheme();
});

// ── Lang toggle ───────────────────────────────────────────────────────────
function buildHome() {
  const isEN = LANG === 'en';
  document.getElementById('home-title').textContent = isEN ? 'Environmental Data Analysis' : 'วิเคราะห์ข้อมูลสิ่งแวดล้อม';
  document.getElementById('home-sub').textContent = isEN ? 'systematically' : 'อย่างมีระบบ';
  document.getElementById('home-desc').textContent = isEN ? 'Select data type to analyze' : 'เลือกประเภทข้อมูลที่ต้องการวิเคราะห์';
  const cards = {
    sea: { name: 'Seawater', subTH: 'Water quality · Standards · Trends', subEN: 'Water quality · Standards · Trends' },
    sed: { name: 'Sediment', subTH: 'Sediment quality · Standards · Trends', subEN: 'Sediment quality · Standards · Trends' },
    bio: { name: 'Biology', subTH: 'Benthos · Phyto · Zoo · Fish Larvae · Larvae', subEN: 'Benthos · Phyto · Zoo · Fish Larvae · Larvae' },
  };
  document.querySelectorAll('.tc[data-tab]').forEach(card => {
    const cfg = cards[card.dataset.tab]; if (!cfg) return;
    const nameEl = card.querySelector('.tc-name');
    const subEl = card.querySelector('.tc-sub');
    if (nameEl) nameEl.textContent = cfg.name;
    if (subEl) subEl.innerHTML = isEN ? cfg.subEN : cfg.subTH;
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
      buildAndWire(t, el);
      el.dataset.built = '1';
      // Re-render whatever was already loaded, in the new language
      if (state.raw.length) {
        document.getElementById(`${t}-cmd-file`).style.display = 'flex';
        document.getElementById(`${t}-file-name`).textContent = TYPE_CFG[t].name;
        document.getElementById(`${t}-file-meta`).textContent = `${state.raw.length} rows`;
      }
      if (state.colMap) {
        document.getElementById(`${t}-cmd-map`).style.display = 'flex';
        document.getElementById(`${t}-btn-run`).disabled = false;
      }
      document.getElementById(`${t}-btn-export`).disabled = !state.analyzed;
      renderDashboard(t);
    });
  });
});

buildHome();

// ── Theme toggle ──────────────────────────────────────────────────────────
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
