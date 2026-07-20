/**
 * runAnalysis.js — orchestrates the full analysis pipeline
 * runCore → populate dropdowns → render active tab
 */

import { LANG, T, Tf } from '../utils/lang.js';
import { getState } from '../core/state.js';
import { runCore } from '../core/runCore.js';
import { showProgress, updateProgress, hideProgress, setSt, TAB_IDX_MAP } from '../ui/events.js';
import { renderOV, renderRAW } from '../ui/renders.js';

/**
 * Run full analysis for a tab
 * @param {string} t - Tab ID
 * @param {Object} renderFns - Map of render functions { ov, st, std, ... }
 */
export function runAnalysis(t, renderFns = {}) {
  const state = getState(t);
  if (!state.raw.length) return;

  const isEN = LANG === 'en';
  showProgress(isEN ? 'Analyzing data...' : 'กำลังวิเคราะห์ข้อมูล...');
  updateProgress(5, isEN ? 'Preparing...' : 'เตรียมข้อมูล...');
  setSt(t, 'กำลังวิเคราะห์...', 'loading');

  setTimeout(() => {
    const isEN = LANG === 'en';
    try {
      updateProgress(20, isEN ? 'Processing rows...' : 'ประมวลผลข้อมูล...');
      const { rows, years, params, locs, nr } = runCore(t);

      updateProgress(75, isEN ? 'Rendering...' : 'แสดงผล...');

      // Render overview (always)
      renderOV(t);
      renderRAW(t);

      // Render active tab if not overview
      const activePane = document.querySelector(`#page-${t} .tab-pane.active`);
      const activeIdx  = activePane ? parseInt(activePane.id.replace(`${t}-pane-`, '')) : 0;
      const activeFn = renderFns[TAB_IDX_MAP[activeIdx]];
      if (activeFn) activeFn(t);

      updateProgress(100, isEN ? 'Done!' : 'เสร็จสิ้น!');
      setTimeout(hideProgress, 500);

      document.getElementById(`${t}-btn-xl`).disabled = false;
      setSt(t, Tf('ok', nr.length, params.length, locs.length), 'ok');

    } catch (err) {
      hideProgress();
      setSt(t, '❌ Error: ' + err.message, 'err');
      console.error('[runAnalysis]', err);
    }
  }, 30);
}
