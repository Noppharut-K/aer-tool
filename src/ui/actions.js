/**
 * actions.js — Export Excel, Download Template
 */

import { LANG } from '../utils/lang.js';
import { getState, getStandards } from '../core/state.js';
import { TYPE_CFG } from '../core/standards.js';

const CORE_HEADERS = ['Year', 'Project', 'Location', 'Station', 'N_UTM', 'E_UTM', 'Direction from platform'];

export function downloadTemplate(t) {
  const isEN = LANG === 'en';
  const cfg = TYPE_CFG[t];
  const headers = [...CORE_HEADERS];
  if (t === 'sea') headers.push('Depth level');
  const standards = getStandards(t);
  const paramHeaders = standards.length ? standards.map(s => s.parameter) : ['Parameter1', 'Parameter2'];
  headers.push(...paramHeaders);

  const example = {};
  headers.forEach(h => { example[h] = ''; });
  example['Year'] = 2024;
  example['Project'] = 'Sample Project';
  example['Location'] = 'Loc-A';
  example['Station'] = 'ST-A01';
  example['N_UTM'] = 0; example['E_UTM'] = 0;
  example['Direction from platform'] = 'N';
  if (t === 'sea') example['Depth level'] = 'Surface';
  paramHeaders.forEach(p => { example[p] = ''; });

  const wb = window.XLSX.utils.book_new();
  const ws = window.XLSX.utils.json_to_sheet([example], { header: headers });
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 12) }));
  window.XLSX.utils.book_append_sheet(wb, ws, 'Template');
  window.XLSX.writeFile(wb, `${cfg.name}_Template_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function doExport(t) {
  const state = getState(t);
  if (!state.analyzed || !state.rows.length) return;
  const isEN = LANG === 'en';
  const cfg = TYPE_CFG[t];
  const rows = state.rows.map(r => ({
    Year: r.yr, Location: r.loc, Station: r.st,
    ...(t === 'sea' ? { 'Depth level': r.wl } : {}),
    Direction: r.direction,
    Parameter: r.pk, Value: r.val, Unit: r.unit,
    Status: r.sc_status === 'exceed' ? (isEN ? 'Exceeding' : 'เกิน') : r.sc_status === 'pass' ? (isEN ? 'Within limits' : 'ปกติ') : (isEN ? 'Not yet set' : 'ยังไม่ตั้งมาตรฐาน'),
  }));
  const wb = window.XLSX.utils.book_new();
  const ws = window.XLSX.utils.json_to_sheet(rows);
  window.XLSX.utils.book_append_sheet(wb, ws, 'Data');

  const stdRows = getStandards(t).map(s => ({
    Parameter: s.parameter, Direction: s.direction, Value: s.value, Unit: s.unit, Source: s.source,
  }));
  if (stdRows.length) {
    const ws2 = window.XLSX.utils.json_to_sheet(stdRows);
    window.XLSX.utils.book_append_sheet(wb, ws2, isEN ? 'Standards' : 'มาตรฐาน');
  }
  window.XLSX.writeFile(wb, `${cfg.name}_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
