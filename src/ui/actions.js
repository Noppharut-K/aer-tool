/**
 * actions.js — Export, Copy, Settings, Template, MRL
 * Migrated from AER_Program.html
 */
import { LANG } from '../utils/lang.js';
import { getState } from '../core/state.js';
import { STD, TYPE_CFG } from '../core/standards.js';
import { calcStat, fmt, mannKendall } from '../core/analysis.js';
import { setSt } from './events.js';
import { renderOV, renderST, renderSTD } from './renders.js';
import { renderCMP, renderMK } from './renders2.js';
import { renderParaSea, renderParaSed, renderParaGeneric } from './renderPara.js';

/* Re-render the report paragraph box — mirrors the dispatch in main.js's
   renderFns.para (there's no single exported renderPara to reuse) */
function renderPara(t) {
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
}

var MRL_DEFAULTS={
  sea:{
    Mercury:0.05, Lead:1.0, Cadmium:0.5, Copper:1.0, Zinc:5.0,
    Arsenic:1.0, Manganese:5.0, Iron:10.0, TPH:0.05,
    NO3_N:null, Salinity:null, Turbidity:null, BOD:null, TSS:null, Temp:null
  }
};
var MRL={}; /* MRL[type][paramCol] = detection limit */

/* Escape a parameter/column name (from the uploaded file) before it goes
   into an HTML attribute or text node — a name containing a quote would
   otherwise truncate the attribute value it's placed in */
function escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function doExport(t){
  if(!getState(t).analyzed) return;
  const wb=window.XLSX.utils.book_new();
  const isEN=LANG==='en';

  /* Read current filters from each tab */
  const ovYr=document.getElementById(t+'-ov-yr')?.value||'all';
  const ovP =document.getElementById(t+'-ov-p')?.value||'all';
  const stYr=document.getElementById(t+'-st-yr')?.value||'all';
  const stP =document.getElementById(t+'-st-p')?.value||'all';
  const stGrp=document.getElementById(t+'-st-grp')?.value||'param';
  const stdYr=document.getElementById(t+'-std-yr')?.value||'all';
  const stdP =document.getElementById(t+'-std-p')?.value||'all';
  const stdShow=document.getElementById(t+'-std-show')?.value||'all';
  const mkP =document.getElementById(t+'-mk-p')?.value||'all';
  const mkLoc=document.getElementById(t+'-mk-loc')?.value||'all';

  const applyFilt=(rows,yr,p)=>{
    let r=rows.filter(rr=>!rr.is_ref);
    if(yr!=='all') r=r.filter(rr=>String(rr.yr??'—')===yr);
    if(p!=='all')  r=r.filter(rr=>rr.col===p);
    return r;
  };

  /* Overview sheet — filtered */
  const ovRows=applyFilt(getState(t).rows,ovYr,ovP);
  const ovMap={};
  ovRows.forEach(r=>{
    const k=r.col+'||'+(r.yr??'—');
    if(!ovMap[k])ovMap[k]={Parameter:r.col,Year:r.yr??'—',Unit:r.unit,vals:[],excSt:new Set()};
    ovMap[k].vals.push(r.val);if(r.exceed)ovMap[k].excSt.add(r.st);
  });
  window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.json_to_sheet(Object.values(ovMap).map(d=>{
    const st=calcStat(d.vals);
    const allSt=new Set(ovRows.filter(r=>r.col===d.Parameter&&String(r.yr??'—')===String(d.Year)).map(r=>r.st));
    return{Parameter:d.Parameter,Year:d.Year,Unit:d.Unit,n:st.n,
      Min:fmt(st.min),Max:fmt(st.max),Mean:fmt(st.mean),SD:fmt(st.sd),
      [isEN?'Exceeded Stations':'สถานีที่เกินมาตรฐาน']:[...d.excSt].join(', ')||'—',
      [isEN?'Count':'จำนวนสถานีที่เกิน']:d.excSt.size,
      [isEN?'% Exceeded':'% สถานีที่เกิน']:allSt.size?Math.round(d.excSt.size/allSt.size*100)+'%':'—'};
  })),isEN?'Overview':'ภาพรวม');

  /* Statistics sheet — filtered */
  const stRows=applyFilt(getState(t).rows,stYr,stP);
  const stMap={};
  stRows.forEach(r=>{
    const k=(stGrp==='param'?r.col:stGrp==='loc'?r.loc+'||'+r.col:r.st+'||'+r.loc+'||'+r.col);
    if(!stMap[k])stMap[k]={loc:r.loc,st:r.st,col:r.col,unit:r.unit,vals:[]};
    stMap[k].vals.push(r.val);
  });
  window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.json_to_sheet(Object.values(stMap).map(d=>{
    const st=calcStat(d.vals);
    return{Location:d.loc,Station:d.st,Parameter:d.col,Unit:d.unit,
      n:st.n,Min:fmt(st.min),Max:fmt(st.max),Mean:fmt(st.mean),
      Median:fmt(st.med),Mode:fmt(st.mode),SD:fmt(st.sd)};
  })),isEN?'Statistics':'สถิติ');

  /* Standards sheet — filtered */
  let stdRows=applyFilt(getState(t).rows,stdYr,stdP).filter(r=>r.sc_status!=='no_std');
  if(stdShow==='exceed') stdRows=stdRows.filter(r=>r.exceed);
  window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.json_to_sheet(stdRows.map(r=>({
    Year:r.yr??'—',Location:r.loc,Station:r.st,Parameter:r.col,
    [isEN?'Measured Value':'ค่าที่วัดได้']:r.val,Unit:r.unit,
    [isEN?'Standard Comparison':'ผลเทียบมาตรฐาน']:r.sc_msg
  }))),isEN?'Standards':'เทียบมาตรฐาน');

  /* Mann-Kendall sheet — filtered */
  const mkData=[];
  const mkMap={};
  const mkRows=getState(t).rows.filter(r=>!r.is_ref&&r.yr&&(mkP==='all'||r.col===mkP)&&(mkLoc==='all'||r.loc===mkLoc));
  mkRows.forEach(r=>{
    const k=r.loc+'||'+r.col;
    if(!mkMap[k])mkMap[k]={loc:r.loc,col:r.col,unit:r.unit,byYr:{}};
    if(!mkMap[k].byYr[r.yr])mkMap[k].byYr[r.yr]=[];
    mkMap[k].byYr[r.yr].push(r.val);
  });
  Object.values(mkMap).forEach(d=>{
    const yrs=Object.keys(d.byYr).map(Number).sort();if(yrs.length<3) return;
    const means=yrs.map(y=>calcStat(d.byYr[y]).mean);
    const mk=mannKendall(means);if(!mk) return;
    mkData.push({Location:d.loc,Parameter:d.col,Unit:d.unit,
      'Kendall τ':mk.tau.toFixed(3),'p-value':mk.p.toFixed(3),
      [isEN?'Significant (p<0.05)':'มีนัยสำคัญ (p<0.05)']:mk.sig?(isEN?'Yes':'ใช่'):(isEN?'No':'ไม่'),
      [isEN?"Sen's Slope":"Sen's Slope"]:fmt(mk.slope)+(isEN?'/yr':'/ปี'),
      [isEN?'Trend':'แนวโน้ม']:mk.tau>0?(isEN?'Increasing':'เพิ่มขึ้น'):(isEN?'Decreasing':'ลดลง')});
  });
  if(mkData.length) window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.json_to_sheet(mkData),'Mann-Kendall');

  const dateStr=new Date().toISOString().slice(0,10);
  window.XLSX.writeFile(wb,`AER_${TYPE_CFG[t].name}_${dateStr}.xlsx`);
}

/* ══════════════════════════════════════
   DEMO DATA
══════════════════════════════════════ */
/* ── Demo date helper ── */
(function(){
  var _s=42;
  window._dr=function(min,max,dec){
    _s=(_s*1664525+1013904223)&0xffffffff;
    var v=min+((_s>>>0)/0xffffffff)*(max-min);
    return dec!=null?parseFloat(v.toFixed(dec)):v;
  };
})();

function copyPara(t){
  const box=document.getElementById(t+'-para-box');
  if(!box) return;
  navigator.clipboard.writeText(box.textContent).then(()=>setSt(t,'คัดลอกแล้ว ✓','ok'));
}

/* Chart */

function openSettings(t){
    if(!getState(t).rows||!getState(t).rows.length){
    alert(LANG==='en'?'Load data first':'โหลดข้อมูลก่อน');
    return;
  }
  if(!window.DEC) window.DEC={}; if(!window.DEC[t]) window.DEC[t]={};
  if(!MRL[t]) MRL[t]={};
  const paramMap={};
  getState(t).rows.forEach(r=>{
    if(!paramMap[r.col]) paramMap[r.col]={unit:r.unit,vals:[]};
    if(paramMap[r.col].vals.length<50) paramMap[r.col].vals.push(r.val);
  });
  const isEN=LANG==='en';
  const overlay=document.createElement('div');
  overlay.className='settings-overlay';
  overlay.id='settings-overlay-'+t;

  const decRows=Object.entries(paramMap).map(([col,d])=>{
    const def=defaultDec(d.vals);
    const cur=DEC[t][col]!=null?DEC[t][col]:def;
    const sample=d.vals[0]!=null?parseFloat(d.vals[0]).toFixed(cur):'—';
    return `<div class="settings-row">
      <div>
        <div class="settings-param">${escHtml(col)}</div>
        <div style="font-size:11px;color:var(--text3)">${escHtml(d.unit)}</div>
      </div>
      <div class="settings-preview" id="prev-${t}-${col.replace(/[^a-z0-9]/gi,'_')}">${sample}</div>
      <input type="number" class="settings-input" min="0" max="8" value="${cur}"
        data-col="${escHtml(col)}" data-type="${t}">
    </div>`;
  }).join('');

  const mrlRows=Object.entries(paramMap).map(([col,d])=>{
    const cur=getMRL(t,col);
    return `<div class="settings-row">
      <div>
        <div class="settings-param">${escHtml(col)}</div>
        <div style="font-size:11px;color:var(--text3)">${escHtml(d.unit)}</div>
      </div>
      <div style="font-size:11px;color:var(--text3)">${cur!=null?'default: '+cur:'—'}</div>
      <input type="number" class="settings-input" min="0" step="any"
        value="${cur!=null?cur:''}" placeholder="—"
        data-col="${escHtml(col)}" id="mrl-inp-${t}-${col.replace(/[^a-z0-9]/gi,'_')}">
    </div>`;
  }).join('');

  overlay.innerHTML=`
    <div class="settings-box" style="max-width:560px;overflow:hidden">
      <div class="settings-title">${isEN?'Settings':'ตั้งค่า'}</div>
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:12px;flex-shrink:0">
        <button id="stab-dec-${t}" onclick="switchSTab('${t}','dec')"
          style="padding:7px 18px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--navy);border-bottom:2px solid var(--navy)">
          ${isEN?'Decimals':'ทศนิยม'}
        </button>
        <button id="stab-mrl-${t}" onclick="switchSTab('${t}','mrl')"
          style="padding:7px 18px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--text3);border-bottom:2px solid transparent">
          MRL
        </button>
      </div>
      <div id="spane-dec-${t}" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0">
        <div class="settings-sub" style="flex-shrink:0">${isEN?'Set decimal places per parameter.':'ตั้งจำนวนทศนิยมต่อ parameter'}</div>
        <div class="settings-table-wrap" style="flex:1;overflow-y:auto;min-height:0">
          <div class="settings-row settings-row-hd">
            <div>Parameter</div><div>${isEN?'Preview':'ตัวอย่าง'}</div><div>${isEN?'Decimals':'ทศนิยม'}</div>
          </div>${decRows}
        </div>
      </div>
      <div id="spane-mrl-${t}" style="display:none;flex:1;overflow:hidden;flex-direction:column;min-height:0">
        <div class="settings-sub" style="flex-shrink:0">${isEN?'Set MRL ต่อ parameter ปล่อยว่าง = ไม่ตรวจ MRL':'Set Minimum Reporting Limit per parameter. Leave blank = no MRL check.'}</div>
        <div class="settings-table-wrap" style="flex:1;overflow-y:auto;min-height:0">
          <div class="settings-row settings-row-hd">
            <div>Parameter</div><div>${isEN?'Default':'Default'}</div><div>MRL</div>
          </div>${mrlRows}
        </div>
      </div>
      <div class="settings-footer" style="flex-shrink:0">
        <button class="btn btn-outline btn-sm" onclick="resetSettingsTab('${t}')">${isEN?'Reset':'รีเซ็ต'}</button>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('settings-overlay-${t}').remove()">${isEN?'Cancel':'ยกเลิก'}</button>
          <button class="btn btn-primary btn-sm" onclick="applySettings('${t}')">${isEN?'Save':'บันทึก'}</button>
        </div>
      </div>
    </div>`;
  document.getElementById('page-'+t).appendChild(overlay);
  /* Wired programmatically (not inline onclick) so a column name
     containing a quote can't break out of a JS string literal */
  overlay.querySelectorAll(`#spane-dec-${t} .settings-input`).forEach(inp => {
    inp.addEventListener('input', () => previewDec(inp, t, inp.dataset.col));
  });
}

function applySettings(t){
  if(!window.DEC) window.DEC={}; if(!window.DEC[t]) window.DEC[t]={};
  if(!MRL[t]) MRL[t]={};
  /* save decimals */
  document.querySelectorAll(`#settings-overlay-${t} #spane-dec-${t} .settings-input`).forEach(inp=>{
    const col=inp.dataset.col;
    const d=parseInt(inp.value);
    if(!isNaN(d)&&d>=0&&d<=8) DEC[t][col]=d;
  });
  /* save MRL */
  document.querySelectorAll(`#settings-overlay-${t} #spane-mrl-${t} input`).forEach(inp=>{
    const col=inp.dataset.col;
    const v=parseFloat(inp.value);
    MRL[t][col]=isNaN(v)?null:v;
  });
  saveMRL(t);
  document.getElementById('settings-overlay-'+t)?.remove();
  if(getState(t).analyzed){renderOV(t);renderST(t);renderSTD(t);renderCMP(t);renderMK(t);renderPara(t);}
}

function resetSettingsTab(t){
  /* check which tab is active */
  const mrlPane=document.getElementById('spane-mrl-'+t);
  if(mrlPane&&mrlPane.style.display!=='none'){
    document.querySelectorAll(`#settings-overlay-${t} #spane-mrl-${t} input`).forEach(inp=>{
      const col=inp.dataset.col;
      const def=MRL_DEFAULTS[t]?.[col];
      inp.value=def!=null?def:'';
    });
  } else {
    DEC[t]={};
    document.querySelectorAll(`#settings-overlay-${t} #spane-dec-${t} .settings-input`).forEach(inp=>{
      const col=inp.dataset.col;
            const vals=getState(t).rows.filter(r=>r.col===col).map(r=>r.val);
      inp.value=defaultDec(vals);
      previewDec(inp,t,col);
    });
  }
}

function switchSTab(t,tab){
  ['dec','mrl'].forEach(k=>{
    document.getElementById('spane-'+k+'-'+t).style.display=k===tab?'flex':'none';
    const btn=document.getElementById('stab-'+k+'-'+t);
    btn.style.color=k===tab?'var(--navy)':'var(--text3)';
    btn.style.borderBottom=k===tab?'2px solid var(--navy)':'2px solid transparent';
  });
}

function getMRL(t,col){
  if(MRL[t]&&MRL[t][col]!=null) return MRL[t][col];
  if(MRL_DEFAULTS[t]&&MRL_DEFAULTS[t][col]!=null) return MRL_DEFAULTS[t][col];
  return null;
}

function loadMRL(t){
  try{
    const s=localStorage.getItem('aer-mrl-'+t);
    if(s) MRL[t]=JSON.parse(s);
  }catch(e){}
}
['sea','sed','sw','air','noise'].forEach(t=>loadMRL(t));

function saveMRL(t){
  try{ localStorage.setItem('aer-mrl-'+t, JSON.stringify(MRL[t]||{})); }catch(e){}
}

function downloadTemplate(t){
  const wb = window.XLSX.utils.book_new();
  const isEN = LANG==='en';

  /* Meta columns per type */
  const meta = {
    sea:   ['Area','Location','Station','Depth','Water_Depth','Year','Date','Report_Type'],
    sed:   ['Area','Location','Station','Distance','Year','Date','Report_Type'],
    sw:    ['Area','Location','Station','Year','Date','Report_Type'],
    air:   ['Area','Location','Station','Year','Date','Report_Type'],
    noise: ['Area','Location','Station','Year','Date','Report_Type']
  };

  /* Parameter columns — generate from STD database */
  const paramCols = t==='noise'
    ? ['Leq_day','Leq_night','Lmax','L90']
    : Object.keys(STD[t]||{});

  const headers = [...(meta[t]||[]), ...paramCols];

  /* Example row */
  const ex = {};
  headers.forEach(h => ex[h] = '');
  ex['Area'] = 'Gulf';
  ex['Location'] = 'Loc-A';
  ex['Station'] = 'ST-A1';
  if(headers.includes('Year'))        ex['Year'] = 2023;
  if(headers.includes('Date'))        ex['Date'] = '2023-02-01';
  if(headers.includes('Depth'))       ex['Depth'] = 'Surface';
  if(headers.includes('Water_Depth')) ex['Water_Depth'] = 25;
  if(headers.includes('Distance'))    ex['Distance'] = 500;
  ex['Report_Type'] = 'EIA';
  /* Fill example parameter values */
  paramCols.forEach(function(p){
    var std = (STD[t]||{})[p];
    if(!std) return;
    if(std.pcd_max!=null) ex[p] = parseFloat((std.pcd_max*0.5).toFixed(4));
    else if(std.pcd_min!=null) ex[p] = parseFloat((std.pcd_min*1.2).toFixed(4));
    else ex[p] = '';
  });

  /* Note row */
  const note = {};
  note[(meta[t]||[])[0]] = isEN
    ? 'Note: REF="REF" for reference stations | Report_Type="EIA" or "Additional" | leave blank = excluded'
    : 'หมายเหตุ: REF ใส่ "REF" สำหรับสถานีอ้างอิง | Report_Type ใส่ "EIA" หรือ "Additional" | ปล่อยว่าง = ไม่นำมาคำนวณ';

  const ws = window.XLSX.utils.json_to_sheet([ex, note], {header: headers});

  /* Style: column widths */
  ws['!cols'] = headers.map(function(h){
    return {wch: Math.max(h.length+2, 14)};
  });

  window.XLSX.utils.book_append_sheet(wb, ws, 'Template');

  /* Sheet 2: Parameters reference */
  const paramRows = Object.entries(STD[t]||{}).map(function([k,v]){
    return {
      Parameter: k,
      Label: v.label||k,
      Unit: v.unit||'',
      'PCD Max': v.pcd_max!=null?v.pcd_max:'—',
      'PCD Min': v.pcd_min!=null?v.pcd_min:'—',
      'ERL': v.erl!=null?v.erl:'—',
      'ERM': v.erm!=null?v.erm:'—',
      'WHO Max': v.who_max!=null?v.who_max:'—',
      Note: v.note||''
    };
  });
  if(paramRows.length){
    const ws2 = window.XLSX.utils.json_to_sheet(paramRows);
    ws2['!cols'] = [{wch:16},{wch:28},{wch:12},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:30}];
    window.XLSX.utils.book_append_sheet(wb, ws2, isEN?'Parameters':'พารามิเตอร์');
  }

  /* Sheet 3: Instructions */
  const instrRows = [
    {'คำอธิบาย': isEN?'Column Instructions':'คำอธิบาย Column', 'รายละเอียด': ''},
    {'คำอธิบาย': 'Area', 'รายละเอียด': isEN?'Study area name':'ชื่อพื้นที่ศึกษา'},
    {'คำอธิบาย': 'Location', 'รายละเอียด': isEN?'Sampling location (group of stations)':'บริเวณเก็บตัวอย่าง (กลุ่มสถานี)'},
    {'คำอธิบาย': 'Station', 'รายละเอียด': isEN?'Station ID':'รหัสสถานี'},
    {'คำอธิบาย': 'Year', 'รายละเอียด': isEN?'Sampling year (number)':'ปีที่เก็บตัวอย่าง (ตัวเลข)'},
    {'คำอธิบาย': 'Report_Type', 'รายละเอียด': isEN?'EIA or Additional (filter by report type)':'EIA หรือ Additional (ใช้ filter แยกรายงาน)'},
    {'คำอธิบาย': 'REF', 'รายละเอียด': isEN?'Type "REF" for reference station, "BL" for baseline, leave blank for study stations':'ใส่ "REF" สำหรับสถานีอ้างอิง "BL" สำหรับ Baseline ปล่อยว่างสำหรับสถานีทั่วไป'},
    {'คำอธิบาย': t==='sea'?'Depth':'Distance', 'รายละเอียด': t==='sea'?(isEN?'Sample depth (Surface/20m/40m/Bottom)':'ระดับความลึก (Surface/20m/40m/Bottom)'):(isEN?'Distance from source (m)':'ระยะห่างจากแหล่งกำเนิด (เมตร)')},
  ];
  const ws3 = window.XLSX.utils.json_to_sheet(instrRows);
  ws3['!cols'] = [{wch:18},{wch:60}];
  window.XLSX.utils.book_append_sheet(wb, ws3, isEN?'Instructions':'คำอธิบาย');

  const fname = (TYPE_CFG[t]?TYPE_CFG[t].name:t)+'_Template_'+new Date().toISOString().slice(0,10)+'.xlsx';
  window.XLSX.writeFile(wb, fname);
}

function defaultDec(vals){
  if(!vals||!vals.length) return 2;
  const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
  const abs=Math.abs(mean);
  if(abs===0) return 4;
  if(abs<0.1)  return 5;
  if(abs<1)    return 4;
  if(abs<10)   return 3;
  if(abs<100)  return 2;
  return 1;
}

function previewDec(input,t,col){
  const d=parseInt(input.value);
  if(isNaN(d)||d<0||d>8) return;
  const safeCol=col.replace(/[^a-z0-9]/gi,'_');
  const prev=document.getElementById(`prev-${t}-${safeCol}`);
  if(!prev) return;
  const s=getState(t);
  const sample=s.rows.find(r=>r.col===col)?.val;
  if(sample!=null) prev.textContent=parseFloat(sample).toFixed(d);
}
/* Called from inline onclick="" in the settings modal markup — must be
   global since this module's top-level functions aren't otherwise
   reachable from an HTML attribute event handler */
window.switchSTab = switchSTab;
window.resetSettingsTab = resetSettingsTab;
window.applySettings = applySettings;

export { doExport, copyPara, openSettings, downloadTemplate, getMRL, loadMRL, saveMRL };
