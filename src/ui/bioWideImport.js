/**
 * bioWideImport.js — "Import Lab Report" panel for the Biology Calculator.
 *
 * Reads a lab report in wide format (taxa down the rows, stations/samples
 * across the columns), converts it to long format with the Marine Bio Data
 * Converter engine (src/core/bioConverter.js), shows the converter's QA
 * summary, and hands the rows straight to the module's column mapping — no
 * download/re-upload step.
 *
 * Settings live in memory only (AER resets every session; no localStorage).
 */
import { MBC } from '../core/bioConverter.js';

/* AER column-mapping selects (bio-<key>-<mod>) → converter output column */
var MAP_BASE = { year:'Year', proj:'Project', loc:'Location', st:'Station', rep:'Replicate', den:'Density', class:'Class' };
var MAP_MOD = {
  benthos: { lvl1:'Phylum',   order:'Order', family:'Family', genus:'', lvl2:'Taxon' },
  zoo:     { lvl1:'Phylum',   order:'Order', family:'Family', genus:'', lvl2:'Taxon' },
  larvae2: { lvl1:'Phylum',   order:'Order', family:'Family', genus:'', lvl2:'Taxon' },
  phyto:   { lvl1:'Division', zone:'Zone',   lvl2:'Species' },
  larvae:  { lvl1:'Order',    lvl2:'Family' }
};

var W = {}; /* per-module panel state */
var HOOKS = null;

function st(mod){
  if(!W[mod]) W[mod] = { wb:null, fileName:'', sheet:'', rows:null, structure:null, meta:null,
                         excluded:{}, locs:{}, settings:{}, result:null, fields:{year:'',project:''} };
  return W[mod];
}
function profileOf(mod){ return MBC.PROFILES[mod]; }

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function fmt(n){ return (Math.round(n*1000)/1000).toLocaleString(); }
function $w(mod, sel){ var host = document.getElementById('bio-wide-'+mod); return host ? host.querySelector(sel) : null; }

function curSettings(mod){
  var p = profileOf(mod), s = st(mod).settings;
  return {
    keepZero: s.keepZero != null ? s.keepZero : p.keepZero,
    rankRowPolicy: s.rankRowPolicy || p.rankRowPolicy,
    stripParen: s.stripParen != null ? s.stripParen : p.stripParen,
    zoneSplit: s.zoneSplit != null ? s.zoneSplit : p.zoneSplit,
    dupTaxon: s.dupTaxon || p.dupTaxon,
    cleanMarkers: s.cleanMarkers != null ? s.cleanMarkers : true,
    markerRank: s.markerRank != null ? s.markerRank : true,
    fixClass: s.fixClass != null ? s.fixClass : true
  };
}

/* ── Public entry points ─────────────────────────────────────────────── */

/* hooks.loadRows(mod, rows, label, map, filename) loads converted rows into the module */
export function bioWideInit(hooks){ HOOKS = hooks; }

/* "Import Lab Report" tile: a file was picked → open the panel with it */
export function bioWideFile(mod, input){
  var file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  renderShell(mod);
  handleFile(mod, file);
}

/* A wide sheet arrived through the normal upload: continue in the panel */
export function bioWideFromWorkbook(mod, wb, fileName, sheet){
  var s = st(mod);
  s.wb = wb; s.fileName = fileName;
  renderShell(mod);
  fillSheetSelect(mod);
  loadSheet(mod, sheet);
}

/* True when a sheet looks like a lab report (has the "Taxonomic categories" header) */
export function bioWideLooksWide(ws){
  if(!ws || typeof XLSX === 'undefined') return false;
  var rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:true, blankrows:true});
  for(var r=0; r<Math.min(25, rows.length); r++){
    var row = rows[r] || [];
    for(var c=0; c<row.length; c++){
      if(String(row[c] == null ? '' : row[c]).toLowerCase().indexOf('taxonomic categor') >= 0) return true;
    }
  }
  return false;
}

/* ── Panel ──────────────────────────────────────────────────────────── */

function renderShell(mod){
  var host = document.getElementById('bio-wide-'+mod);
  if(!host) return;
  host.style.display = 'block';
  if(host.dataset.ready) return;
  host.dataset.ready = '1';
  var p = profileOf(mod);
  host.innerHTML =
    '<div class="bw-head">' +
      '<div><div class="bw-title">นำเข้ารายงานแล็บ (Wide format) · ' + esc(p.name) + '</div>' +
      '<div class="bw-sub">แปลงตารางรายงานผลจากห้องปฏิบัติการ (Taxa เป็นแถว สถานี/Sample เป็นคอลัมน์) เป็นข้อมูลสำหรับคำนวณโดยตรง</div></div>' +
      '<button type="button" class="bw-close" title="ปิด" aria-label="ปิด">&times;</button>' +
    '</div>' +
    '<div class="bw-filebar">' +
      '<span class="bw-fname"></span>' +
      '<div class="bio-field bw-sheet-field" style="display:none"><label>Sheet</label><select class="bw-sheet"></select></div>' +
    '</div>' +
    '<div class="bw-status bw-guess" hidden></div>' +
    '<div class="bw-body" hidden>' +
      '<div class="bw-grid">' +
        '<div class="bio-field"><label>Year</label><input type="text" class="bw-year" placeholder="เช่น 2026"></div>' +
        '<div class="bio-field"><label>Project</label><input type="text" class="bw-project" placeholder="ชื่อ / รหัสโครงการ"></div>' +
      '</div>' +
      '<div class="bw-struct"></div>' +
      '<details class="bw-settings"><summary>ตั้งค่าการแปลง · ' + esc(p.name) + '</summary><div class="bw-settings-body"></div></details>' +
      '<div class="bw-actions">' +
        '<button type="button" class="bio-btn bw-convert">แปลงและนำเข้า</button>' +
        '<button type="button" class="bio-btn-outline bw-download" disabled>ดาวน์โหลดไฟล์ที่แปลง (.xlsx)</button>' +
      '</div>' +
      '<div class="bw-status bw-convert-status" hidden></div>' +
      '<div class="bw-result"></div>' +
    '</div>' +
    '<div class="bw-credit">ตัวแปลงข้อมูล: Marine Bio Data Converter v3.1 — Marine Environmental Research &amp; EIA Team</div>';

  host.querySelector('.bw-close').addEventListener('click', function(){ host.style.display = 'none'; });
  host.querySelector('.bw-sheet').addEventListener('change', function(){ loadSheet(mod, this.value); });
  [['.bw-year','year'],['.bw-project','project']].forEach(function(pair){
    host.querySelector(pair[0]).addEventListener('input', function(){ st(mod).fields[pair[1]] = this.value; invalidate(mod); });
  });
  host.querySelector('.bw-convert').addEventListener('click', function(){ convert(mod); });
  host.querySelector('.bw-download').addEventListener('click', function(){ download(mod); });
}

function showStatus(mod, cls, html, type){
  var el = $w(mod, cls); if(!el) return;
  el.innerHTML = html; el.className = 'bw-status ' + cls.slice(1) + ' bw-' + type; el.hidden = false;
}
function hideStatus(mod, cls){ var el = $w(mod, cls); if(el){ el.hidden = true; el.innerHTML = ''; } }

function handleFile(mod, file){
  var s = st(mod);
  if(!/\.(xlsx|xls)$/i.test(file.name)){ showStatus(mod, '.bw-guess', 'ไฟล์ต้องเป็น .xlsx หรือ .xls', 'error'); return; }
  $w(mod, '.bw-fname').textContent = file.name + ' · กำลังอ่าน…';
  file.arrayBuffer().then(function(buf){
    s.wb = XLSX.read(buf, {type:'array'});
    s.fileName = file.name;
    fillSheetSelect(mod);
    /* Lab report files usually also carry a long "Query" sheet — open the
       first sheet that has the "Taxonomic categories" header instead */
    var pick = s.wb.SheetNames.find(function(n){ return bioWideLooksWide(s.wb.Sheets[n]); }) || s.wb.SheetNames[0];
    loadSheet(mod, pick);
  }).catch(function(err){
    $w(mod, '.bw-fname').textContent = '';
    showStatus(mod, '.bw-guess', 'ไม่สามารถอ่านไฟล์ได้: ' + esc(err.message), 'error');
  });
}

function fillSheetSelect(mod){
  var s = st(mod), sel = $w(mod, '.bw-sheet');
  sel.innerHTML = '';
  s.wb.SheetNames.forEach(function(n){ var o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
  $w(mod, '.bw-sheet-field').style.display = s.wb.SheetNames.length > 1 ? '' : 'none';
}

function loadSheet(mod, name){
  var s = st(mod), p = profileOf(mod);
  s.sheet = name; s.result = null;
  $w(mod, '.bw-sheet').value = name;
  var ws = s.wb.Sheets[name];
  s.rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:true, blankrows:true});
  $w(mod, '.bw-fname').textContent = s.fileName + ' · Sheet: ' + name + ' · ' + s.rows.length + ' แถว';
  $w(mod, '.bw-result').innerHTML = '';
  $w(mod, '.bw-download').disabled = true;
  hideStatus(mod, '.bw-convert-status');
  hideStatus(mod, '.bw-guess');
  try{
    s.structure = MBC.detectStructure(s.rows);
  }catch(err){
    s.structure = null;
    $w(mod, '.bw-body').hidden = true;
    showStatus(mod, '.bw-guess', esc(err.message), 'error');
    return;
  }
  s.meta = MBC.detectMeta(s.rows, s.structure);
  /* default exclusions of this parameter (e.g. Fish Larvae "Reference") */
  s.excluded = {};
  s.locs = {};
  var defaults = p.excludeStations.map(function(x){ return x.toLowerCase(); });
  eachStation(s, function(stn){ if(defaults.indexOf(stn.name.toLowerCase()) >= 0) s.excluded[stn.name] = true; });

  var notes = [];
  if(s.meta.project){ s.fields.project = s.meta.project; notes.push('Project'); }
  if(s.meta.year){ s.fields.year = s.meta.year; notes.push('Year ' + s.meta.year); }
  $w(mod, '.bw-year').value = s.fields.year;
  $w(mod, '.bw-project').value = s.fields.project;

  var guess = s.meta.paramId || MBC.guessParameter(s.rows, s.structure);
  var guessOk = !guess || guess === mod || (mod === 'larvae2' && (guess === 'zoo' || guess === 'larvae'));
  var html = [];
  if(notes.length) html.push('อ่านจากหัวรายงาน: <b>' + notes.map(esc).join(' · ') + '</b>' + (s.meta.unit ? ' · หน่วย ' + esc(s.meta.unit) : '') + ' (แก้ไขได้ในช่องด้านล่าง)');
  if(!guessOk) html.push('ไฟล์นี้มีลักษณะคล้ายข้อมูล <b>' + esc(MBC.PROFILES[guess].name) + ' (' + esc(MBC.PROFILES[guess].nameTh) + ')</b> แต่กำลังนำเข้าในแท็บ ' + esc(p.name) + ' — โปรดตรวจสอบว่าเปิดถูกแท็บ');
  if(html.length) showStatus(mod, '.bw-guess', html.join('<br>'), guessOk ? 'info' : 'warn');

  $w(mod, '.bw-body').hidden = false;
  renderStructure(mod);
  renderSettings(mod);
}

function eachStation(s, fn){ if(s.structure) s.structure.groups.forEach(function(g){ g.stations.forEach(fn); }); }

/* columns of a station that hold at least one value anywhere in the data */
function filledCols(s, stn){
  return stn.cols.filter(function(c){
    for(var r = s.structure.dataStartRow; r < s.rows.length; r++){
      var pv = MBC.parseValue((s.rows[r] || [])[c]);
      if(pv.ok || pv.bad) return true;
    }
    return false;
  });
}

function renderStructure(mod){
  var s = st(mod), x = s.structure, host = $w(mod, '.bw-struct');
  var h = '<div class="bw-struct-meta">หัวตาราง: แถว <b>' + (x.headerRowIdx+1) + '</b>' +
    (x.hasSubHeader ? ' · แถว Sample: <b>' + (x.headerRowIdx+2) + '</b>' : '') +
    ' · ข้อมูลเริ่มแถว <b>' + (x.dataStartRow+1) + '</b> · สถานี <b>' + x.totalStations + '</b>' +
    ' · คอลัมน์ข้อมูล <b>' + x.totalCols + '</b></div>' +
    '<div class="bw-hint">คลิกที่สถานีเพื่อรวม/ไม่รวมในการแปลง</div><div class="bw-chips"></div>';
  host.innerHTML = h;
  var chips = host.querySelector('.bw-chips');
  var notes = [];
  eachStation(s, function(stn){
    var off = !!s.excluded[stn.name];
    var nFilled = filledCols(s, stn).length;
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'bw-chip' + (off ? ' off' : '');
    chip.setAttribute('aria-pressed', off ? 'false' : 'true');
    chip.title = 'replicate: ' + stn.reps.join(', ');
    chip.innerHTML = '<span class="bw-box"></span><span>' + esc(stn.name) + '</span><span class="bw-reps">' + stn.cols.length + ' rep</span>';
    chip.addEventListener('click', function(){
      if(s.excluded[stn.name]) delete s.excluded[stn.name]; else s.excluded[stn.name] = true;
      renderStructure(mod); invalidate(mod);
    });
    chips.appendChild(chip);
    if(!x.hasSubHeader && nFilled < stn.cols.length)
      notes.push(esc(stn.name) + ': ตรวจพบ ' + stn.cols.length + ' คอลัมน์ แต่มีข้อมูลเพียง ' + nFilled + ' คอลัมน์ — คอลัมน์ว่างจะไม่ถูกนับเป็น replicate');
  });
  if(x.usedFallback) notes.unshift('ไม่พบคำว่า Taxonomic categories — ใช้แถวที่ ' + (x.headerRowIdx+1) + ' เป็นหัวตาราง โปรดตรวจสอบ');
  var repCounts = {};
  eachStation(s, function(stn){ repCounts[stn.cols.length] = 1; });
  if(Object.keys(repCounts).length > 1) notes.push('จำนวน replicate ไม่เท่ากันในแต่ละสถานี (' + Object.keys(repCounts).sort().join(', ') + ')');
  renderLocations(mod, host);
  if(notes.length){
    var n = document.createElement('div');
    n.className = 'bw-status bw-info';
    n.innerHTML = notes.join('<br>');
    host.appendChild(n);
  }
}

/* One file often covers several locations (e.g. NNN-A04, NNN-B01, Reference),
   so Location is set per station. Default: the station code before its last
   "-" (SL12-1 → SL12), as in the original tool. */
function locOf(s, stn){ return s.locs[stn.name] != null ? s.locs[stn.name] : MBC.locationOf(stn.name); }

function renderLocations(mod, host){
  var s = st(mod);
  var box = document.createElement('details');
  box.className = 'bw-locs';
  box.open = true;
  box.innerHTML = '<summary>Location ของแต่ละสถานี</summary>' +
    '<div class="bw-hint">ค่าเริ่มต้นคือรหัสสถานีก่อนเครื่องหมาย "-" ตัวสุดท้าย (SL12-1 → SL12) — แก้ได้ เช่น NNNA041 → NNN-A04</div>' +
    '<div class="bw-loc-grid"></div>';
  var grid = box.querySelector('.bw-loc-grid');
  eachStation(s, function(stn){
    if(s.excluded[stn.name]) return;
    var lab = document.createElement('label');
    lab.className = 'bw-loc';
    var name = document.createElement('span');
    name.textContent = stn.name;
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.value = locOf(s, stn);
    inp.addEventListener('input', function(){ s.locs[stn.name] = inp.value; invalidate(mod); });
    lab.appendChild(name); lab.appendChild(inp);
    grid.appendChild(lab);
  });
  host.appendChild(box);
}

/* Apply the per-station Locations to converted rows (Station is the cleaned
   or the raw header name, depending on the footnote-marker setting) */
function applyLocations(s, rows){
  var m = {};
  eachStation(s, function(stn){ var l = String(locOf(s, stn)).trim() || stn.name; m[stn.name] = l; m[stn.rawName] = l; });
  rows.forEach(function(r){ if(m[r.Station] != null) r.Location = m[r.Station]; });
}

function opt(v, label, cur){ return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }
function chk(id, on, title, small){
  return '<label class="bw-check"><input type="checkbox" data-k="' + id + '"' + (on ? ' checked' : '') + '><span>' + title + '<small>' + small + '</small></span></label>';
}

function renderSettings(mod){
  var p = profileOf(mod), s = curSettings(mod), host = $w(mod, '.bw-settings-body');
  var h = '<div class="bw-grid">';
  h += '<div class="bio-field"><label>แถวลำดับชั้นที่มีค่า</label><select data-k="rankRowPolicy">' +
    opt('keep', 'เก็บไว้ (Taxon = "Class: X")', s.rankRowPolicy) +
    opt('familyAndBelow', 'เก็บเฉพาะระดับวงศ์ลงไป', s.rankRowPolicy) +
    opt('drop', 'ไม่เก็บ (เฉพาะระดับชนิด)', s.rankRowPolicy) +
    '</select><span class="bw-hint">เช่น Class Oligochaeta ที่นับรวมไม่แยกชนิด</span></div>';
  if(!p.genus){
    h += '<div class="bio-field"><label>ชื่อ Taxon ซ้ำต่างวงศ์</label><select data-k="dupTaxon">' +
      opt('keep', 'คงเดิม (แยกด้วยคอลัมน์ Family)', s.dupTaxon) +
      opt('family', 'เติมวงศ์เฉพาะชื่อที่ซ้ำ', s.dupTaxon) +
      opt('familyAll', 'เติมวงศ์ให้ juvenile / sp. / unidentified ทุกแถว', s.dupTaxon) +
      '</select><span class="bw-hint">ตัวอย่าง: Juvenile crab (Euryplacidae)</span></div>';
  }
  if(p.id === 'phyto'){
    h += '<div class="bio-field"><label>Sample ชั้นผิวน้ำต่อสถานี</label><input type="number" min="0" max="20" data-k="zoneSplit" value="' + s.zoneSplit + '">' +
      '<span class="bw-hint">Sample 1–N = Surface ที่เหลือ = Euphotic · 0 = ไม่แยก</span></div>';
  }
  h += '</div>';
  h += chk('keepZero', s.keepZero, 'เก็บค่า 0 ที่บันทึกไว้', 'เปิดเมื่อค่า 0 หมายถึง "ตรวจแล้วไม่พบ" และต้องการเก็บไว้ในข้อมูล');
  h += chk('stripParen', s.stripParen, 'ตัดข้อความในวงเล็บท้ายชื่อ', '"Chaetoceros curvisetus (chain)" → "Chaetoceros curvisetus"');
  h += chk('cleanMarkers', s.cleanMarkers, 'ล้างเครื่องหมายเชิงอรรถ * และ #', '"*Bivalvia larvae" → "Bivalvia larvae", "WP49-3A#" → "WP49-3A"');
  h += chk('markerRank', s.markerRank, 'ไม่ให้ taxon กลุ่มใหญ่รับวงศ์ของแถวข้างบน', 'เช่น "Bivalvia larvae" ที่อยู่ท้าย Family Solemyidae → เก็บเฉพาะ Class Bivalvia');
  if(p.ranks.indexOf('Class') >= 0 && p.ranks.indexOf('Order') >= 0)
    h += chk('fixClass', s.fixClass, 'ตรวจ Class จากตารางอ้างอิงอันดับ (Order)', 'แก้เฉพาะกรณีขัดกันชัดเจน เช่น Order Isopoda อยู่ใต้ Class Copepoda → Malacostraca');
  host.innerHTML = h;
  host.querySelectorAll('[data-k]').forEach(function(el){
    el.addEventListener('change', function(){
      var k = el.dataset.k, v;
      if(el.type === 'checkbox') v = el.checked;
      else if(k === 'zoneSplit'){ v = parseInt(el.value, 10); if(isNaN(v) || v < 0) v = 0; }
      else v = el.value;
      st(mod).settings[k] = v;
      invalidate(mod);
    });
  });
}

function invalidate(mod){
  var s = st(mod);
  if(!s.result) return;
  s.result = null;
  $w(mod, '.bw-download').disabled = true;
  showStatus(mod, '.bw-convert-status', 'มีการเปลี่ยนแปลงการตั้งค่า — กด <b>แปลงและนำเข้า</b> อีกครั้งเพื่อนำข้อมูลชุดใหม่ไปคำนวณ', 'info');
}

function buildOptions(mod){
  var s = st(mod), c = curSettings(mod);
  return {
    keepZero: c.keepZero, rankRowPolicy: c.rankRowPolicy, stripParen: c.stripParen,
    zoneSplit: c.zoneSplit, dupTaxon: c.dupTaxon,
    cleanMarkers: c.cleanMarkers, markerRank: c.markerRank, fixClass: c.fixClass,
    excludeStations: Object.keys(s.excluded),
    meta: { year: s.fields.year.trim(), project: s.fields.project.trim(), location: '',
            parameter: s.meta ? s.meta.parameter : '', unit: s.meta ? s.meta.unit : '' }
  };
}

/* AER counts a station's replicates from the rows present, so a replicate with
   no organisms at all would silently drop out of the divisor. When the header
   names its samples explicitly (Sample1, Sample2 …) a replicate column is real
   even if empty, so add one zero-density row without taxonomy to keep it
   counted. A single-row header gives no such proof (trailing blank columns
   would otherwise become fake replicates), so nothing is added there. */
function emptyReplicateRows(s, res, opts, profile){
  var out = [];
  if(!s.structure.hasSubHeader) return out;
  var have = {};
  res.rows.forEach(function(r){ have[r.Station + '|' + r.Replicate + '|' + (r.Zone || '')] = 1; });
  var zs = opts.zoneSplit, excluded = {};
  opts.excludeStations.forEach(function(n){ excluded[n] = 1; });
  eachStation(s, function(stn){
    if(excluded[stn.name]) return;
    var stName = opts.cleanMarkers ? stn.name : stn.rawName;
    stn.reps.forEach(function(rep, i){
      if(!String(stn.subLabels[i] || '').trim()) return;
      /* same Zone/Replicate split the converter applies (transform) */
      var zone = '', r = rep;
      if(zs > 0){ zone = rep <= zs ? 'Surface' : 'Euphotic'; r = rep <= zs ? rep : rep - zs; }
      if(have[stName + '|' + r + '|' + zone]) return;
      have[stName + '|' + r + '|' + zone] = 1;
      var rec = {};
      profile.columns.forEach(function(k){ rec[k] = ''; });
      rec.Year = /^\d{4}$/.test(opts.meta.year || '') ? parseInt(opts.meta.year, 10) : (opts.meta.year || '');
      rec.Project = opts.meta.project || '';
      rec.Location = opts.meta.location || MBC.locationOf(stn.name);
      rec.Station = stName;
      if(profile.columns.indexOf('Zone') >= 0) rec.Zone = zone;
      rec.Replicate = r;
      rec.Density = 0;
      out.push(rec);
    });
  });
  return out;
}

function convert(mod){
  var s = st(mod), p = profileOf(mod);
  if(!s.rows || !s.structure) return;
  var opts = buildOptions(mod), res;
  try{
    res = MBC.transform(s.rows, s.structure, p, opts);
    res.source = MBC.sourceSum(s.rows, s.structure, opts);
  }catch(err){
    showStatus(mod, '.bw-convert-status', 'เกิดข้อผิดพลาด: ' + esc(err.message), 'error');
    return;
  }
  res.opts = opts;
  if(!res.rows.length){
    s.result = null;
    showStatus(mod, '.bw-convert-status', 'แปลงเสร็จ แต่ไม่พบข้อมูลที่ตรงตามเงื่อนไข — ตรวจสอบว่าเปิดถูกแท็บ หรือปรับการตั้งค่าการแปลง', 'error');
    $w(mod, '.bw-result').innerHTML = '';
    return;
  }
  var data = res.rows.map(function(r){ var o = {}; p.columns.forEach(function(c){ o[c] = r[c]; }); return o; });
  res.emptyReps = emptyReplicateRows(s, res, opts, p);
  data = data.concat(res.emptyReps);
  applyLocations(s, data);
  res.data = data;
  s.result = res;

  /* mapping for this module; Year/Project/Zone left unmapped when blank */
  var map = Object.assign({}, MAP_BASE, MAP_MOD[mod]);
  ['year','proj','zone'].forEach(function(k){
    var col = map[k];
    if(col && !data.some(function(r){ return String(r[col] == null ? '' : r[col]).trim() !== ''; })) map[k] = '';
  });
  if(HOOKS && HOOKS.loadRows){
    HOOKS.loadRows(mod, data, s.fileName + ' [' + s.sheet + '] · แปลงจากรายงานแล็บ', map, s.fileName);
  }
  showStatus(mod, '.bw-convert-status', 'นำเข้าแล้ว ' + data.length.toLocaleString() + ' แถว และจับคู่คอลัมน์ให้อัตโนมัติ — ตรวจทานด้านล่าง แล้วกด <b>Calculate</b>', 'success');
  $w(mod, '.bw-download').disabled = false;
  renderResult(mod, res);
}

function uniq(arr){ var m = {}; arr.forEach(function(x){ if(x !== '' && x != null) m[x] = 1; }); return Object.keys(m).length; }

function issueBlock(title, lines, openIfAny){
  if(!lines.length) return '';
  return '<details class="bw-issue"' + (openIfAny ? ' open' : '') + '><summary>' + title + '<span class="bw-cnt">' + lines.length + '</span></summary><ul>' +
    lines.slice(0, 300).map(function(l){ return '<li>' + l + '</li>'; }).join('') +
    (lines.length > 300 ? '<li>… และอีก ' + (lines.length - 300) + ' รายการ</li>' : '') + '</ul></details>';
}

function renderResult(mod, res){
  var p = profileOf(mod), data = res.rows;
  var topRank = p.ranks[0], taxKey = p.genus ? 'Species' : 'Taxon';
  var items = [
    ['แถวที่ได้', res.data.length.toLocaleString()],
    ['สถานี', uniq(data.map(function(r){ return r.Station; }))],
    [topRank, uniq(data.map(function(r){ return r[topRank]; }))],
    [p.genus ? 'Species' : 'Taxa', uniq(data.map(function(r){ return r[taxKey]; }))],
    ['ยอดรวม Density', fmt(res.total)]
  ];
  var accounted = res.total + res.droppedSum;
  var diff = res.source.sum - accounted;
  var balanced = Math.abs(diff) < 1e-6;
  var clean = balanced && !res.warnings.length && !res.dropped.length;
  var h = '<div class="bw-stats">' + items.map(function(it){ return '<div class="bw-stat"><span>' + it[0] + '</span><b>' + it[1] + '</b></div>'; }).join('') + '</div>';
  h += '<div class="bw-qa"><div class="bw-qa-head"><span>QA · ตรวจทานความครบถ้วน</span>' +
    '<span class="bw-badge ' + (clean ? 'ok' : 'warn') + '">' + (clean ? 'ยอดรวมตรงกับต้นฉบับ' : (balanced ? 'ยอดรวมตรง · มีรายการต้องตรวจ' : 'ยอดรวมไม่ตรง ต่าง ' + fmt(diff))) + '</span></div>' +
    '<div class="bw-recon">' +
      '<span>ยอดรวมเซลล์ตัวเลขในต้นฉบับ (สถานีที่เลือก ไม่รวมแถวสรุป)</span><b>' + fmt(res.source.sum) + '</b>' +
      '<span>ยอดรวมในผลลัพธ์</span><b>' + fmt(res.total) + '</b>' +
      '<span>แถวที่ไม่เก็บตามกฎลำดับชั้น</span><b>' + fmt(res.droppedSum) + '</b>' +
      '<span class="bw-tot">ส่วนต่าง</span><b class="bw-tot">' + fmt(diff) + '</b>' +
    '</div>';
  h += issueBlock('ค่าที่ไม่ใช่ตัวเลข (ไม่ได้นำเข้า)', res.warnings.map(function(w){
    return 'แถว ' + w.row + ' · ' + esc(w.station) + ' · ' + esc(w.taxon) + ' → <code>' + esc(w.raw) + '</code>'; }), true);
  h += issueBlock('Replicate ที่ไม่พบสิ่งมีชีวิต (เพิ่มแถว Density 0 เพื่อให้นับเป็น replicate)', res.emptyReps.map(function(r){
    return esc(r.Station) + (r.Zone ? ' · ' + esc(r.Zone) : '') + ' · Replicate ' + esc(r.Replicate); }), true);
  h += issueBlock('แถวที่มีค่าแต่ไม่เก็บตามกฎลำดับชั้น', res.dropped.map(function(d){
    return 'แถว ' + d.row + ' · ' + esc(d.label) + ' (' + esc(d.reason) + ') รวม ' + fmt(d.sum); }), false);
  h += issueBlock('ชื่อ Taxon ซ้ำต่างวงศ์', res.duplicates.map(function(d){
    return '<code>' + esc(d.taxon) + '</code> พบใน ' + d.families.map(esc).join(', '); }), false);
  h += issueBlock('Class ไม่ตรงกับอันดับ (Order) ตามตารางอ้างอิง', (res.classIssues || []).map(function(c){
    return 'Order <b>' + esc(c.order) + '</b> อยู่ใต้ Class ' + esc(c.from) + (c.fixed ? ' → แก้เป็น <b>' + esc(c.to) + '</b>' : ' (ควรเป็น ' + esc(c.to) + ' · ไม่ได้แก้)') +
      ' · ' + c.rows.toLocaleString() + ' แถว รวม ' + fmt(c.sum); }), true);
  h += issueBlock('ปรับลำดับชั้นอัตโนมัติ (taxon กลุ่มใหญ่ / มีเครื่องหมาย)', (res.adjusted || []).map(function(a){
    return 'แถว ' + a.row + ' · <code>' + esc(a.label) + '</code> ไม่รับ ' + esc(a.removed); }), false);
  h += issueBlock('สถานีที่มีเครื่องหมายในต้นฉบับ (โปรดตรวจความหมาย)', (res.markedStations || []).map(function(m){
    return '<code>' + esc(m.raw) + '</code>' + (res.opts.cleanMarkers ? ' → ' + esc(m.station) : ''); }), true);
  h += issueBlock('แถวสรุปที่ข้าม', res.skippedLabels.map(function(x){ return 'แถว ' + x.row + ' · ' + esc(x.label); }), false);
  h += '</div>';
  $w(mod, '.bw-result').innerHTML = h;
}

/* ── Download (converted long table + QA_Log, as in the original tool) ── */

function qaSheet(mod){
  var s = st(mod), r = s.result, o = r.opts, p = profileOf(mod), aoa = [];
  aoa.push(['Marine Bio Data Converter v3.1 — QA Log (via AER Biology Calculator)']);
  aoa.push(['Converted at', new Date().toLocaleString()]);
  aoa.push(['Source file', s.fileName]);
  aoa.push(['Sheet', s.sheet]);
  aoa.push(['Parameter', p.name + ' (' + p.nameTh + ')']);
  aoa.push(['Rank rows with values', o.rankRowPolicy]);
  aoa.push(['Keep zero', o.keepZero ? 'Yes' : 'No']);
  aoa.push(['Strip parentheses', o.stripParen ? 'Yes' : 'No']);
  if(p.id === 'phyto') aoa.push(['Surface samples per station', o.zoneSplit]);
  if(!p.genus) aoa.push(['Duplicate taxon handling', o.dupTaxon]);
  aoa.push(['Clean footnote markers (* #)', o.cleanMarkers ? 'Yes' : 'No']);
  aoa.push(['Group taxa without family from row above', o.markerRank ? 'Yes' : 'No']);
  aoa.push(['Check Class against Order reference', o.fixClass ? 'Yes (fix clear conflicts)' : 'No (flag only)']);
  aoa.push(['Excluded stations', o.excludeStations.join(', ') || '-']);
  aoa.push(['Year / Project used', (o.meta.year || '-') + ' / ' + (o.meta.project || '-')]);
  aoa.push([]);
  aoa.push(['Source total (selected stations)', r.source.sum]);
  aoa.push(['Output total', r.total]);
  aoa.push(['Dropped by rank rule', r.droppedSum]);
  aoa.push(['Difference', r.source.sum - r.total - r.droppedSum]);
  aoa.push(['Output rows', r.data.length]);
  aoa.push([]);
  aoa.push(['Type', 'Source row', 'Detail', 'Value']);
  r.warnings.forEach(function(w){ aoa.push(['Non-numeric value', w.row, w.station + ' · ' + w.taxon, w.raw]); });
  r.emptyReps.forEach(function(e){ aoa.push(['Empty replicate (Density 0 row added)', '', e.Station + (e.Zone ? ' · ' + e.Zone : '') + ' · Rep ' + e.Replicate, 0]); });
  r.dropped.forEach(function(d){ aoa.push(['Dropped (rank rule)', d.row, d.label + ' — ' + d.reason, d.sum]); });
  r.duplicates.forEach(function(d){ aoa.push(['Duplicate taxon', '', d.taxon, d.families.join(', ')]); });
  (r.classIssues || []).forEach(function(c){ aoa.push([c.fixed ? 'Class corrected' : 'Class conflict (not fixed)', '', 'Order ' + c.order + ': ' + c.from + ' → ' + c.to, c.rows + ' rows, total ' + c.sum]); });
  (r.adjusted || []).forEach(function(a){ aoa.push(['Rank adjusted', a.row, a.label, 'removed: ' + a.removed]); });
  (r.markedStations || []).forEach(function(m){ aoa.push(['Station marker', '', m.raw, o.cleanMarkers ? '→ ' + m.station : 'kept']); });
  r.skippedLabels.forEach(function(x){ aoa.push(['Summary row skipped', x.row, x.label, '']); });
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:34},{wch:12},{wch:48},{wch:18}];
  return ws;
}

function download(mod){
  var s = st(mod), p = profileOf(mod);
  if(!s.result) return;
  try{
    var ws = XLSX.utils.json_to_sheet(s.result.data, {header: p.columns});
    ws['!cols'] = p.columns.map(function(c){ return {wch: c === 'Taxon' || c === 'Species' ? 30 : (c === 'Density' || c === 'Replicate' || c === 'Year') ? 10 : 16}; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, p.sheetName);
    XLSX.utils.book_append_sheet(wb, qaSheet(mod), 'QA_Log');
    var d = new Date();
    var ts = d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '_' + String(d.getHours()).padStart(2,'0') + String(d.getMinutes()).padStart(2,'0');
    XLSX.writeFile(wb, s.fileName.replace(/\.(xlsx|xls)$/i, '') + '_' + p.id + '_' + ts + '.xlsx');
  }catch(err){
    showStatus(mod, '.bw-convert-status', 'ดาวน์โหลดไม่สำเร็จ: ' + esc(err.message), 'error');
  }
}
