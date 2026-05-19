/**
 * renderPara.js — Auto-paragraph generation for report tab
 * Sea water, Sediment, and Generic paragraph generators
 */

import { LANG, L, T } from '../utils/lang.js';
import { STD } from '../core/standards.js';
import { getState } from '../core/state.js';
import { calcStat, calcMean, calcCV } from '../core/analysis.js';

/** MRL (Minimum Reporting Level) system */
export const MRL_DEFAULTS = {
  sea: {
    Mercury:0.05, Lead:1.0, Cadmium:0.5, Copper:1.0, Zinc:5.0,
    Arsenic:1.0, Manganese:5.0, Iron:10.0, TPH:0.05,
    NO3_N:null, Salinity:null, Turbidity:null, BOD:null, TSS:null, Temp:null
  }
};
export const MRL = {};

export function getMRL(t, col) {
  if (MRL[t] && MRL[t][col] != null) return MRL[t][col];
  if (MRL_DEFAULTS[t] && MRL_DEFAULTS[t][col] != null) return MRL_DEFAULTS[t][col];
  return null;
}

export function saveMRL(t) {
  try { localStorage.setItem('aer-mrl-' + t, JSON.stringify(MRL[t] || {})); } catch(e) {}
}

export function loadMRL(t) {
  try {
    const s = localStorage.getItem('aer-mrl-' + t);
    if (s) MRL[t] = JSON.parse(s);
  } catch(e) {}
}

// Load saved MRL on startup
['sea','sed','sw','air','noise'].forEach(t => loadMRL(t));


export function renderParaSea(t){
  const state = getState(t);
  const isEN=LANG==='en';
  const s=state;
  const yr=document.getElementById(t+'-para-yr')?.value||'all';
  const locF=document.getElementById(t+'-para-loc')?.value||'all';
  const refCVThresh=parseFloat(document.getElementById(t+'-ref-cv')?.value||30);
  const bsCVThresh=parseFloat(document.getElementById(t+'-bs-cv')?.value||30);
  const yrCVThresh=parseFloat(document.getElementById(t+'-yr-cv')?.value||20);
  const yrMethod=document.querySelector('input[name="yr-method-'+t+'"]:checked')?.value||'all';

  let rows=state.rows.filter(r=>!r.is_ref&&!r.is_baseline);
  if(yr!=='all') rows=rows.filter(r=>String(r.yr)===yr);
  if(locF!=='all') rows=rows.filter(r=>r.loc===locF);

  const refRows=state.rows.filter(r=>r.is_ref);
  const bsRows=state.rows.filter(r=>r.is_baseline);

  const years=[...new Set(rows.filter(r=>r.yr).map(r=>r.yr))].sort((a,b)=>b-a);
  const locs=[...new Set(rows.map(r=>r.loc))].sort();

  if(!years.length||!locs.length) return `<span style="color:var(--text3)">${T('es_nodata')}</span>`;

  const physParams=['Temp','pH','DO','Salinity'];
  const metalParams=['Mercury','Lead','Cadmium','Copper','Zinc','Arsenic','Manganese','Iron','TPH'];

  function rng(arr,col){
    if(!arr||!arr.length) return null;
    const mn=Math.min(...arr),mx=Math.max(...arr);
    const dec=mn<0.01?4:mn<1?3:mn<10?2:1;
    return mn===mx?mn.toFixed(dec):`${mn.toFixed(dec)} – ${mx.toFixed(dec)}`;
  }
  function getVals(rows,col){return rows.filter(r=>r.col===col).map(r=>r.val);}
  function getUnit(col){return (STD[t]||{})[col]?.unit||'';}
  // calcMean imported
function _calcMeanLocal(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;}
  // calcCV imported
function _calcCVLocal(arr){
    if(arr.length<2) return 0;
    const m=calcMean(arr);
    if(m===0) return 0;
    const sd=Math.sqrt(arr.reduce((a,b)=>a+(b-m)**2,0)/arr.length);
    return Math.abs(sd/m*100);
  }

  /* date formatter */
  function fmtDate(d){
    if(!d) return null;
    try{
      const dt=new Date(d);
      if(isNaN(dt)) return d;
      if(isEN) return dt.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
      const months=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
    }catch(e){return d;}
  }

  const blocks=[];

  /* ═══════════════════════════════════
     SECTION A: ย่อหน้าแยกปี (current year analysis)
  ═══════════════════════════════════ */
  const secABlocks=[];
  locs.forEach(loc=>{
    years.forEach(yr2=>{
      const yrRows=rows.filter(r=>r.loc===loc&&String(r.yr)===String(yr2));
      if(!yrRows.length) return;

      const sts=[...new Set(yrRows.map(r=>r.st))];
      const n=sts.length;

      /* depth range */
      const rawYrLoc=state.raw.filter(r=>{
        const cLoc=document.getElementById(t+'-c-loc')?.value;
        const cYr=document.getElementById(t+'-c-year')?.value;
        return cLoc&&r[cLoc]===loc&&(yr==='all'||!cYr||String(r[cYr])===String(yr2));
      });
      const depths=rawYrLoc.map(r=>parseFloat(r['Water_Depth'])).filter(v=>!isNaN(v));
      const depthStr=depths.length?rng(depths):null;

      /* date range */
      const datCol=document.getElementById(t+'-c-date')?.value;
      const dates=datCol?rawYrLoc.map(r=>r[datCol]).filter(Boolean):[];
      let dateRangeStr='';
      if(dates.length){
        const sorted=[...dates].sort();
        const dFirst=fmtDate(sorted[0]),dLast=fmtDate(sorted[sorted.length-1]);
        dateRangeStr=dFirst===dLast?dFirst:`${dFirst} – ${dLast}`;
      }

      /* S1: Overview */
      let s1=isEN
        ?`Seawater quality at ${loc} (Year ${yr2}, ${n} station${n>1?'s':''})`
        :`คุณภาพน้ำทะเลบริเวณ ${loc} ปี ${yr2} ทั้งหมด ${n} สถานี`;
      if(depthStr) s1+=isEN?`, water depth ${depthStr} m`:`มีความลึกอยู่ในช่วง ${depthStr} เมตร`;
      s1+='.';

      /* S2: Physical */
      const physParts=physParams.map(col=>{
        const vals=getVals(yrRows,col);
        if(!vals.length) return null;
        const r2=rng(vals);
        const u=getUnit(col);
        const label=isEN?col:({'Temp':'อุณหภูมิ','pH':'ความเป็นกรด–ด่าง','DO':'ปริมาณออกซิเจนละลาย','Salinity':'ความเค็ม'}[col]||col);
        return `${label} ${r2} ${u}`.trim();
      }).filter(Boolean);
      const s2=physParts.length?(isEN?`Physical parameters: ${physParts.join(', ')}.`:`น้ำทะเลมี${physParts.join(' และ')}.`):'';

      /* S3: MRL */
      const belowMRL=[];
      metalParams.forEach(col=>{
        const mrlVal=getMRL(t,col);
        if(mrlVal==null) return;
        const vals=getVals(yrRows,col);
        if(vals.length&&vals.every(v=>v<mrlVal)) belowMRL.push(col);
      });
      const s3=belowMRL.length?(isEN
        ?`Parameters below MRL: ${belowMRL.join(', ')}.`
        :`โลหะหนักและสารปนเปื้อนที่มีค่าต่ำกว่า MRL ได้แก่ ${belowMRL.join(', ')}.`):'';

      /* S4: Standard + REF + Baseline */
      const exceedParams=[...new Set(yrRows.filter(r=>r.sc_status==='exceed').map(r=>r.col))];
      const stdOK=exceedParams.length===0;

      /* REF diff */
      const refDiff=[];
      if(refRows.length){
        [...new Set(yrRows.map(r=>r.col))].forEach(col=>{
          const gVals=getVals(yrRows,col);
          const rVals=getVals(refRows.filter(r=>yr==='all'||String(r.yr)===String(yr2)),col);
          if(!gVals.length||!rVals.length) return;
          const rMean=calcMean(rVals);
          if(rMean===0) return;
          if(Math.abs((calcMean(gVals)-rMean)/rMean*100)>=refCVThresh) refDiff.push(col);
        });
      }

      /* Baseline diff */
      const bsDiff=[];
      if(bsRows.length){
        [...new Set(yrRows.map(r=>r.col))].forEach(col=>{
          const gVals=getVals(yrRows,col);
          const bVals=getVals(bsRows,col);
          if(!gVals.length||!bVals.length) return;
          const bMean=calcMean(bVals);
          if(bMean===0) return;
          if(Math.abs((calcMean(gVals)-bMean)/bMean*100)>=bsCVThresh) bsDiff.push(col);
        });
      }

      /* คำนวณ ratio REF และ Baseline */
      const allParams=[...new Set(yrRows.map(r=>r.col))];
      const refCloseRatio=refRows.length&&allParams.length
        ?(allParams.length-refDiff.length)/allParams.length:1;
      const bsCloseRatio=bsRows.length&&allParams.length
        ?(allParams.length-bsDiff.length)/allParams.length:1;
      const refMostlyClose=refCloseRatio>=0.6;
      const bsMostlyClose=bsCloseRatio>=0.6;

      let s4=stdOK
        ?(isEN?'All parameters were within standard limits.':'เมื่อเปรียบเทียบกับค่ามาตรฐานคุณภาพน้ำทะเล พบว่ามีค่าอยู่ในเกณฑ์มาตรฐาน')
        :(isEN?'Most parameters were within standard limits.':'เมื่อเปรียบเทียบกับค่ามาตรฐานคุณภาพน้ำทะเล พบว่าส่วนใหญ่มีค่าอยู่ในเกณฑ์มาตรฐาน');

      if(refRows.length){
        if(refMostlyClose){
          s4+=refDiff.length===0
            ?(isEN?' Values were close to the reference station.':', และมีค่าใกล้เคียงกับสถานีอ้างอิง')
            :(isEN?` Values were mostly close to the reference station, except: ${refDiff.join(', ')}.`
              :` มีค่าใกล้เคียงกับสถานีอ้างอิง ยกเว้น ${refDiff.join(', ')} ที่มีค่าแตกต่างจากสถานีอ้างอิง`);
        } else {
          s4+=refDiff.length
            ?(isEN?` Values were mostly different from the reference station, except: ${refDiff.length<allParams.length-refDiff.length?refDiff.join(', '):allParams.filter(p=>!refDiff.includes(p)).join(', ')} which were close.`
              :` มีค่าแตกต่างจากสถานีอ้างอิง ยกเว้น ${allParams.filter(p=>!refDiff.includes(p)).join(', ')} ที่มีค่าใกล้เคียงกัน`)
            :(isEN?' Values were different from the reference station.':', มีค่าแตกต่างจากสถานีอ้างอิง');
        }
      }
      if(bsRows.length){
        if(bsMostlyClose){
          s4+=bsDiff.length===0
            ?(isEN?' Values were close to Baseline.':', เมื่อเปรียบเทียบกับ Baseline พบว่ามีค่าใกล้เคียงกัน')
            :(isEN?` Values were mostly close to Baseline, except: ${bsDiff.join(', ')}.`
              :` เมื่อเปรียบเทียบกับ Baseline พบว่ามีค่าใกล้เคียงกัน ยกเว้น ${bsDiff.join(', ')} ที่มีค่าแตกต่างจาก Baseline`);
        } else {
          s4+=bsDiff.length
            ?(isEN?` Values were mostly different from Baseline, except: ${allParams.filter(p=>!bsDiff.includes(p)).join(', ')} which were close.`
              :` เมื่อเปรียบเทียบกับ Baseline พบว่ามีค่าแตกต่างกัน ยกเว้น ${allParams.filter(p=>!bsDiff.includes(p)).join(', ')} ที่มีค่าใกล้เคียงกัน`)
            :(isEN?' Values were different from Baseline.':', เมื่อเปรียบเทียบกับ Baseline พบว่ามีค่าแตกต่างกัน');
        }
      }
      if(!s4.endsWith('.')) s4+='.';

      /* S5: Exception */
      let s5='';
      if(exceedParams.length){
        const excDetails=exceedParams.map(col=>{
          const excVals=yrRows.filter(r=>r.col===col&&r.sc_status==='exceed').map(r=>r.val);
          const r2=rng(excVals);
          const u=getUnit(col);
          const excSts=[...new Set(yrRows.filter(r=>r.col===col&&r.sc_status==='exceed').map(r=>r.st))];
          const depCol=document.getElementById(t+'-c-depth')?.value;
          const rawExc=state.raw.filter(r=>{const cs=document.getElementById(t+'-c-st')?.value;return cs&&excSts.includes(String(r[cs]));});
          const excDepths=depCol?[...new Set(rawExc.map(r=>r[depCol]).filter(Boolean))]:[];
          const dp=excDepths.length?` (${excDepths.join(', ')})`:'';
          return isEN?`${col}${dp}: ${r2} ${u}`.trim():`${col}${dp} มีค่า ${r2} ${u}`.trim();
        });
        s5=isEN
          ?`However, the following parameters exceeded the standard: ${excDetails.join('; ')}.`
          :`อย่างไรก็ตาม พบว่า ${excDetails.join(' และ')} ซึ่งเกินค่ามาตรฐาน.`;
      }

      const parts=[s1,s2,s3,s4,s5].filter(Boolean);
      secABlocks.push(`<div data-loc="${loc}" style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed var(--border)">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${loc} — ${yr2}</div>
        <p style="line-height:1.75;font-size:13.5px;color:var(--text);margin:0">${parts.join(' ')}</p>
      </div>`);
    });
  });

  /* ═══════════════════════════════════
     SECTION B: เปรียบเทียบรายปี (ต่อ Location)
  ═══════════════════════════════════ */
  const secBBlocks=[];
  if(years.length>=2){
    locs.forEach(loc=>{
      const locRows=rows.filter(r=>r.loc===loc&&r.yr);
      if(!locRows.length) return;

      const allYrs=[...new Set(locRows.map(r=>r.yr))].sort((a,b)=>a-b);
      if(allYrs.length<2) return;

      /* per-year info: n stations + date range */
      const yrInfos=[];
      [...allYrs].reverse().forEach(yr2=>{
        const yrRows2=locRows.filter(r=>String(r.yr)===String(yr2));
        const sts=[...new Set(yrRows2.map(r=>r.st))];
        const datCol=document.getElementById(t+'-c-date')?.value;
        const rawYr=state.raw.filter(r=>{
          const cLoc=document.getElementById(t+'-c-loc')?.value;
          const cYr=document.getElementById(t+'-c-year')?.value;
          return cLoc&&r[cLoc]===loc&&cYr&&String(r[cYr])===String(yr2);
        });
        const dates=datCol?rawYr.map(r=>r[datCol]).filter(Boolean).sort():[];
        let dateStr='';
        if(dates.length){
          const d1=fmtDate(dates[0]),d2=fmtDate(dates[dates.length-1]);
          dateStr=d1===d2?d1:`${d1} – ${d2}`;
        }
        yrInfos.push({yr:yr2,n:sts.length,dateStr});
      });

      /* S1: Overview — ช่วงปี + แต่ละปี */
      const yrRange=`${allYrs[0]}–${allYrs[allYrs.length-1]}`;
      let s1=isEN
        ?`Year-over-year comparison for ${loc} (${yrRange}): `
        :`การเปรียบเทียบข้อมูลผลการติดตามของบริเวณ ${loc} ตั้งแต่ปี ${yrRange} `;

      s1+=yrInfos.map(({yr:y,n,dateStr})=>
        isEN
          ?`Year ${y}: ${n} station${n>1?'s':''}${dateStr?` (${dateStr})`:''}`
          :`ปี ${y} ดำเนินการเก็บตัวอย่าง${dateStr?`วันที่ ${dateStr} `:''}จำนวน ${n} สถานี`
      ).join(isEN?'; ':' ')+'.';

      /* Analyze each parameter: CV → First vs Last */
      const params=[...new Set(locRows.map(r=>r.col))];
      const stable=[],increasing=[],decreasing=[];

      params.forEach(col=>{
        const byYr={};
        allYrs.forEach(y=>{
          const vals=getVals(locRows.filter(r=>String(r.yr)===String(y)),col);
          if(vals.length) byYr[y]=calcMean(vals);
        });
        const yrs=Object.keys(byYr).map(Number).sort((a,b)=>a-b);
        if(yrs.length<2) return;
        const means=yrs.map(y=>byYr[y]);

        /* Step 1: CV */
        const cv=calcCV(means);
        if(cv<yrCVThresh){ stable.push(col); return; }

        /* Step 2: First vs Last */
        const first=means[0],last=means[means.length-1];
        const overallPct=first&&first!==0?(last-first)/Math.abs(first)*100:0;
        if(overallPct>0) increasing.push({col,firstYr:yrs[0],lastYr:yrs[yrs.length-1]});
        else decreasing.push({col,firstYr:yrs[0],lastYr:yrs[yrs.length-1]});
      });

      /* S2: Summary + Exception */
      const latestYr=allYrs[allYrs.length-1];
      const prevRange=allYrs.length===2
        ?`${allYrs[0]}`
        :`${allYrs[0]}–${allYrs[allYrs.length-2]}`;

      /* คำนวณ % stable จากข้อมูลจริง */
      const totalParams=stable.length+increasing.length+decreasing.length;
      const stableRatio=totalParams>0?stable.length/totalParams:1;
      const mostlyStable=stableRatio>=0.6;

      let s2=isEN
        ?(mostlyStable
          ?`Overall, seawater quality in ${latestYr} was mostly similar to ${prevRange}`
          :`Overall, seawater quality in ${latestYr} showed mostly different values compared to ${prevRange}`)
        :(mostlyStable
          ?`สรุปได้ว่าคุณภาพน้ำทะเลปี ${latestYr} ส่วนใหญ่มีค่าใกล้เคียงกับปี ${prevRange}`
          :`สรุปได้ว่าคุณภาพน้ำทะเลปี ${latestYr} ส่วนใหญ่มีค่าแตกต่างจากปี ${prevRange}`);

      const excParts=[];
      if(increasing.length){
        /* group by firstYr-lastYr range */
        const grp={};
        increasing.forEach(({col,firstYr,lastYr})=>{
          const k=`${firstYr}-${lastYr}`;
          if(!grp[k]) grp[k]={cols:[],firstYr,lastYr};
          grp[k].cols.push(col);
        });
        Object.values(grp).forEach(({cols,firstYr,lastYr})=>{
          excParts.push(isEN
            ?`${cols.join(', ')} showed an increasing trend from ${firstYr} to ${lastYr}`
            :`ความเข้มข้นของ ${cols.join(' ')} มีแนวโน้มเพิ่มขึ้นจากปี ${firstYr} ถึง ${lastYr}`);
        });
      }
      if(decreasing.length){
        const grp={};
        decreasing.forEach(({col,firstYr,lastYr})=>{
          const k=`${firstYr}-${lastYr}`;
          if(!grp[k]) grp[k]={cols:[],firstYr,lastYr};
          grp[k].cols.push(col);
        });
        Object.values(grp).forEach(({cols,firstYr,lastYr})=>{
          excParts.push(isEN
            ?`${cols.join(', ')} showed a decreasing trend from ${firstYr} to ${lastYr}`
            :`ความเข้มข้นของ ${cols.join(' ')} มีแนวโน้มลดลงจากปี ${firstYr} ถึง ${lastYr}`);
        });
      }

      if(excParts.length){
        s2+=isEN?`. However, ${excParts.join('; ')}.`
          :` ยกเว้นพารามิเตอร์ ${excParts.join(' และ')}.`;
      } else {
        s2+='.';
      }

      secBBlocks.push(`<div data-loc="${loc}" style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed var(--border)">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${loc}</div>
        <p style="line-height:1.75;font-size:13.5px;color:var(--text);margin:0">${[s1,s2].filter(Boolean).join(' ')}</p>
      </div>`);
    });
  }
  /* แยก Section A และ B มี header ใหญ่คั่น */
  const allBlocks=[];

  if(secABlocks.length){
    allBlocks.push(`<div style="font-size:17px;font-weight:900;color:var(--navy);letter-spacing:-.2px;padding:6px 0 8px;border-bottom:3px solid var(--navy);margin-bottom:12px">${isEN?'Annual Report':'รายงานประจำปี'}</div>`);
    allBlocks.push(...secABlocks);
  }
  if(secBBlocks.length){
    allBlocks.push(`<div style="font-size:17px;font-weight:900;color:var(--navy);letter-spacing:-.2px;padding:6px 0 8px;border-bottom:3px solid var(--navy);margin-bottom:12px;margin-top:${secABlocks.length?'20px':'0'}">${isEN?'Year-over-Year Comparison':'เปรียบเทียบรายปี'}</div>`);
    allBlocks.push(...secBBlocks);
  }

  return allBlocks.length
    ?allBlocks.join('')
    :`<span style="color:var(--text3)">${T('es_nodata')}</span>`;
}



export function renderParaSed(t){
  const state = getState(t);
  const isEN=LANG==='en';
  const s=state;
  const yr=document.getElementById(t+'-para-yr')?.value||'all';
  const locF=document.getElementById(t+'-para-loc')?.value||'all';
  const refCVThresh=parseFloat(document.getElementById(t+'-ref-cv')?.value||30);
  const bsCVThresh=parseFloat(document.getElementById(t+'-bs-cv')?.value||30);
  const yrCVThresh=parseFloat(document.getElementById(t+'-yr-cv')?.value||20);

  let rows=state.rows.filter(r=>!r.is_ref&&!r.is_baseline);
  if(yr!=='all') rows=rows.filter(r=>String(r.yr)===yr);
  if(locF!=='all') rows=rows.filter(r=>r.loc===locF);

  const refRows=state.rows.filter(r=>r.is_ref);
  const bsRows=state.rows.filter(r=>r.is_baseline);
  const years=[...new Set(rows.filter(r=>r.yr).map(r=>r.yr))].sort((a,b)=>b-a);
  const locs=[...new Set(rows.map(r=>r.loc))].sort();

  if(!years.length||!locs.length) return `<span style="color:var(--text3)">${T('es_nodata')}</span>`;

  const textureParams=['Sand','Silt','Clay'];
  const metalParams=['Mercury','Lead','Cadmium','Copper','Zinc','Arsenic','Nickel','Chromium','Manganese','Iron','Barium'];

  function rng(arr,dec){
    if(!arr||!arr.length) return null;
    const mn=Math.min(...arr),mx=Math.max(...arr);
    const d=dec!=null?dec:(mn<1?3:mn<10?2:1);
    if(Math.abs(mn-mx)<0.0001) return mn.toFixed(d);
    return `${mn.toFixed(d)} – ${mx.toFixed(d)}`;
  }
  function getVals(rows,col){return rows.filter(r=>r.col===col).map(r=>r.val);}
  function getUnit(col){return (STD[t]||{})[col]?.unit||'';}
  // calcMean imported
function _calcMeanLocal(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;}
  // calcCV imported
function _calcCVLocal(arr){
    if(arr.length<2) return 0;
    const m=calcMean(arr);
    if(m===0) return 0;
    const sd=Math.sqrt(arr.reduce((a,b)=>a+(b-m)**2,0)/arr.length);
    return Math.abs(sd/m*100);
  }

  /* get dominant texture label */
  function getDominant(sand,silt,clay){
    const vals=[{k:'Sand',v:sand},{k:'Silt',v:silt},{k:'Clay',v:clay}].filter(x=>x.v!=null);
    if(!vals.length) return null;
    vals.sort((a,b)=>b.v-a.v);
    return vals;
  }

  /* get raw vals per station from state.raw */
  function getRawVals(loc,yr2,col){
    const cLoc=document.getElementById(t+'-c-loc')?.value;
    const cYr=document.getElementById(t+'-c-year')?.value;
    const cSt=document.getElementById(t+'-c-st')?.value;
    const cDist=document.getElementById(t+'-c-dist')?.value;
    return state.raw.filter(r=>
      cLoc&&r[cLoc]===loc&&
      (!cYr||String(r[cYr])===String(yr2))&&
      r[col]!=null&&r[col]!==''
    ).map(r=>({
      st:cSt?r[cSt]:'',
      dist:cDist&&r[cDist]!=null?parseFloat(r[cDist]):null,
      val:parseFloat(r[col])
    })).filter(r=>!isNaN(r.val));
  }

  const secABlocks=[];

  locs.forEach(loc=>{
    years.forEach(yr2=>{
      const yrRows=rows.filter(r=>r.loc===loc&&String(r.yr)===String(yr2));
      if(!yrRows.length) return;
      const sts=[...new Set(yrRows.map(r=>r.st))];
      const n=sts.length;

      /* ── S1: Texture ── */
      /* get raw texture vals per station */
      const sandRaw=getRawVals(loc,yr2,'Sand');
      const siltRaw=getRawVals(loc,yr2,'Silt');
      const clayRaw=getRawVals(loc,yr2,'Clay');

      let s1='';
      if(sandRaw.length&&siltRaw.length&&clayRaw.length){
        const sandVals=sandRaw.map(r=>r.val);
        const siltVals=siltRaw.map(r=>r.val);
        const clayVals=clayRaw.map(r=>r.val);
        const sMean=calcMean(sandVals),slMean=calcMean(siltVals),cMean=calcMean(clayVals);
        const ranked=getDominant(sMean,slMean,cMean);
        const dominant=ranked[0].k;

        const textureStr=ranked.map(x=>{
          const vals=x.k==='Sand'?sandVals:x.k==='Silt'?siltVals:clayVals;
          return `${x.k} (${rng(vals,2)})`;
        }).join(' > ');

        s1=isEN
          ?`Sediment quality at ${loc} (Year ${yr2}, ${n} station${n>1?'s':''}) — sediment type is predominantly ${dominant}: ${textureStr}.`
          :`คุณภาพดินตะกอนพื้นท้องทะเลบริเวณ ${loc} ปี ${yr2} ทั้งหมด ${n} สถานี ดินตะกอนส่วนใหญ่เป็น ${dominant} โดยมีอัตราส่วนของ ${textureStr}`;

        /* compare texture with REF */
        if(refRows.length){
          const refSand=calcMean(getVals(refRows,'Sand'));
          const refSilt=calcMean(getVals(refRows,'Silt'));
          const refClay=calcMean(getVals(refRows,'Clay'));
          const refRanked=getDominant(refSand,refSilt,refClay);
          if(refRanked&&refRanked[0].k!==dominant){
            const refStr=refRanked.map(x=>`${x.k}(${x.v.toFixed(2)})`).join(' > ');
            s1+=isEN
              ?` This differs from the reference station (${refStr}).`
              :` ซึ่งแตกต่างจากสถานีอ้างอิงที่มีลักษณะดินตะกอนเป็น ${refStr}`;
          } else {
            s1+=isEN
              ?' Texture is similar to the reference station.'
              :' ซึ่งเป็นลักษณะดินตะกอนเช่นเดียวกับสถานีอ้างอิง';
          }
        }

        /* find stations with different dominant texture */
        /* group by dominant texture per distance */
        const distGroups={};
        sandRaw.forEach((r,i)=>{
          if(r.dist==null) return;
          if(!distGroups[r.dist]) distGroups[r.dist]={sand:[],silt:[],clay:[]};
          distGroups[r.dist].sand.push(r.val);
          if(siltRaw[i]) distGroups[r.dist].silt.push(siltRaw[i].val);
          if(clayRaw[i]) distGroups[r.dist].clay.push(clayRaw[i].val);
        });
        const diffDists=[];
        Object.entries(distGroups).forEach(([dist,g])=>{
          if(!g.sand.length||!g.silt.length||!g.clay.length) return;
          const dRanked=getDominant(calcMean(g.sand),calcMean(g.silt),calcMean(g.clay));
          if(dRanked&&dRanked[0].k!==dominant){
            const dStr=dRanked.map(x=>{
              const vals=x.k==='Sand'?g.sand:x.k==='Silt'?g.silt:g.clay;
              return `${x.k} (${rng(vals,2)})`;
            }).join(' > ');
            diffDists.push({dist:parseFloat(dist),str:dStr,dominant:dRanked[0].k});
          }
        });
        if(diffDists.length){
          diffDists.sort((a,b)=>a.dist-b.dist);
          const distRangeStr=diffDists.length>1
            ?`${diffDists[0].dist}–${diffDists[diffDists.length-1].dist}`
            :`${diffDists[0].dist}`;
          s1+=isEN
            ?` However, stations at ${distRangeStr} m show ${diffDists[0].dominant}-dominant texture (${diffDists[0].str}).`
            :` ในขณะที่ระยะห่าง ${distRangeStr} เมตร มีลักษณะดินตะกอนส่วนใหญ่เป็น ${diffDists[0].str}`;
        }
        if(!s1.endsWith('.')) s1+='.';
      }

      /* ── S2: TPH ── */
      const tphVals=getVals(yrRows,'TPH');
      let s2='';
      if(tphVals.length){
        const tphRef=getVals(refRows,'TPH');
        const u=getUnit('TPH');
        s2=isEN
          ?`TPH ranged from ${rng(tphVals)} ${u}.`
          :`TPH มีค่าอยู่ในช่วง ${rng(tphVals)} ${u}`;
        if(tphRef.length){
          const refMean=calcMean(tphRef),studyMean=calcMean(tphVals);
          const pctDiff=refMean?Math.abs((studyMean-refMean)/refMean*100):0;
          s2+=pctDiff<refCVThresh
            ?(isEN?' Values were close to the reference station.':', มีค่าใกล้เคียงกับสถานีอ้างอิง')
            :(isEN?' Values differed from the reference station.':', มีค่าแตกต่างจากสถานีอ้างอิง');
        }
        if(!s2.endsWith('.')) s2+='.';
      }

      /* ── S3: Metals + ERL/ERM ── */
      const exceedDetails=[];
      const totalSts=sts.length;
      metalParams.forEach(col=>{
        const std=STD[t]?.[col];
        if(!std) return;
        const rawVals=getRawVals(loc,yr2,col);
        if(!rawVals.length) return;
        const allStsForCol=[...new Set(rawVals.map(r=>r.st))];
        const exceedRaw=rawVals.filter(r=>{
          if(std.pcd_max&&r.val>std.pcd_max) return true;
          if(std.erl&&r.val>std.erl) return true;
          return false;
        });
        if(!exceedRaw.length) return;

        const u=std.unit||'';

        /* determine which threshold exceeded (use max val across all exceed) */
        const allExcVals=exceedRaw.map(r=>r.val);
        let threshStr='';
        if(std.erm&&allExcVals.some(v=>v>std.erm)){
          threshStr=isEN?`exceeds ERM (${std.erm} ${u})`:`สูงกว่าค่า ERM (${std.erm} ${u})`;
        } else if(std.erl&&allExcVals.some(v=>v>std.erl)){
          threshStr=isEN?`exceeds ERL (${std.erl} ${u})`:`สูงกว่าค่า ERL (${std.erl} ${u})`;
        } else if(std.pcd_max){
          threshStr=isEN?`exceeds standard (${std.pcd_max} ${u})`:`เกินเกณฑ์มาตรฐาน (${std.pcd_max} ${u})`;
        }

        /* group by distance — each distance gets its own station desc + range */
        const distMap={};
        exceedRaw.forEach(r=>{
          const k=r.dist!=null?String(r.dist):'—';
          if(!distMap[k]) distMap[k]=[];
          distMap[k].push(r);
        });
        const distParts=Object.entries(distMap)
          .sort((a,b)=>parseFloat(a[0])-parseFloat(b[0]))
          .map(([dist,raws])=>{
            const distSts=[...new Set(raws.map(r=>r.st))];
            const allStsAtDist=[...new Set(rawVals.filter(r=>String(r.dist)===dist).map(r=>r.st))];
            const nonExc=allStsAtDist.filter(s=>!distSts.includes(s));
            const ratio=distSts.length/Math.max(allStsAtDist.length,1);
            let stDesc='';
            if(ratio===1) stDesc=isEN?'all stations':'ทุกสถานี';
            else if(ratio>0.5) stDesc=isEN?`except ${nonExc.join(', ')}`:`ยกเว้น ${nonExc.join(', ')}`;
            else stDesc=isEN?`(${distSts.join(', ')})`:`(${distSts.join(', ')})`;
            const vals=raws.map(r=>r.val);
            const distLabel=dist==='—'?'':(isEN?`at ${dist} m`:`ที่ระยะ ${dist} เมตร`);
            return isEN
              ?`${distLabel} ${stDesc}: ${rng(vals)} ${u}`
              :`${distLabel} ${stDesc} มีค่า ${rng(vals)} ${u}`;
          });

        exceedDetails.push({col,distParts,threshStr});
      });

      let s3='';
      if(exceedDetails.length){
        const excStr=exceedDetails.map(({col,distParts,threshStr})=>{
          const partsStr=distParts.join(isEN?', ':' ');
          return isEN
            ?`${col} — ${partsStr} (${threshStr})`
            :`${col} ${partsStr} ซึ่ง${threshStr}`;
        }).join(isEN?'; ':' และ');
        s3=isEN
          ?`Most metals were within sediment quality criteria. However, ${excStr}.`
          :`ปริมาณความเข้มข้นของโลหะและโลหะหนักส่วนใหญ่มีค่าอยู่ในเกณฑ์คุณภาพตะกอนดินชายฝั่งทะเล ยกเว้น ${excStr}`;
        if(!s3.endsWith('.')) s3+='.';
      } else {
        s3=isEN
          ?'All metals were within sediment quality criteria.'
          :'ปริมาณความเข้มข้นของโลหะและโลหะหนักทุกพารามิเตอร์มีค่าอยู่ในเกณฑ์คุณภาพตะกอนดินชายฝั่งทะเล';
        if(!s3.endsWith('.')) s3+='.';
      }

      /* ── S4: REF comparison ── */
      const allParams=[...new Set(yrRows.map(r=>r.col))].filter(c=>!textureParams.includes(c)&&c!=='TPH');
      const refDiff=[];
      if(refRows.length){
        allParams.forEach(col=>{
          const gVals=getVals(yrRows,col);
          const rVals=getVals(refRows,col);
          if(!gVals.length||!rVals.length) return;
          const rMean=calcMean(rVals);
          if(rMean===0) return;
          if(Math.abs((calcMean(gVals)-rMean)/rMean*100)>=refCVThresh) refDiff.push(col);
        });
      }
      const refCloseRatio=allParams.length?(allParams.length-refDiff.length)/allParams.length:1;
      const refMostlyClose=refCloseRatio>=0.6;

      let s4='';
      if(refRows.length){
        if(refMostlyClose){
          s4=refDiff.length===0
            ?(isEN?`Sediment quality at ${loc} was close to the reference station.`
              :`คุณภาพดินตะกอนพื้นท้องทะเลบริเวณ ${loc} ส่วนใหญ่มีค่าใกล้เคียงกับสถานีอ้างอิง`)
            :(isEN?`Sediment quality at ${loc} was mostly close to the reference station, except ${refDiff.join(', ')} which were higher.`
              :`คุณภาพดินตะกอนพื้นท้องทะเลบริเวณ ${loc} ส่วนใหญ่มีค่าใกล้เคียงกับสถานีอ้างอิง ยกเว้น ${refDiff.join(', ')} ที่มีค่าสูงกว่าสถานีอ้างอิง`);
        } else {
          s4=refDiff.length
            ?(isEN?`Sediment quality at ${loc} was mostly different from the reference station, except ${allParams.filter(p=>!refDiff.includes(p)).join(', ')} which were close.`
              :`คุณภาพดินตะกอนพื้นท้องทะเลบริเวณ ${loc} ส่วนใหญ่มีค่าแตกต่างจากสถานีอ้างอิง ยกเว้น ${allParams.filter(p=>!refDiff.includes(p)).join(', ')} ที่มีค่าใกล้เคียงกัน`)
            :(isEN?`Sediment quality at ${loc} was different from the reference station.`
              :`คุณภาพดินตะกอนพื้นท้องทะเลบริเวณ ${loc} มีค่าแตกต่างจากสถานีอ้างอิง`);
        }
        if(!s4.endsWith('.')) s4+='.';
      }

      /* ── S5: Baseline comparison ── */
      const bsDiff=[];
      if(bsRows.length){
        allParams.forEach(col=>{
          const gVals=getVals(yrRows,col);
          const bVals=getVals(bsRows,col);
          if(!gVals.length||!bVals.length) return;
          const bMean=calcMean(bVals);
          if(bMean===0) return;
          if(Math.abs((calcMean(gVals)-bMean)/bMean*100)>=bsCVThresh) bsDiff.push(col);
        });
      }
      const bsCloseRatio=allParams.length?(allParams.length-bsDiff.length)/allParams.length:1;
      const bsMostlyClose=bsCloseRatio>=0.6;

      let s5='';
      if(bsRows.length){
        if(bsMostlyClose){
          s5=bsDiff.length===0
            ?(isEN?`Values were close to Baseline.`
              :`เมื่อเปรียบเทียบกับ Baseline พบว่ามีค่าใกล้เคียงกัน`)
            :(isEN?`Values were mostly close to Baseline, except ${bsDiff.join(', ')} which were higher.`
              :`เมื่อเปรียบเทียบกับ Baseline พบว่ามีค่าใกล้เคียงกัน ยกเว้น ${bsDiff.join(', ')} ที่มีค่าสูงกว่า Baseline`);
        } else {
          s5=bsDiff.length
            ?(isEN?`Values were mostly different from Baseline, except ${allParams.filter(p=>!bsDiff.includes(p)).join(', ')} which were close.`
              :`เมื่อเปรียบเทียบกับ Baseline พบว่ามีค่าแตกต่างกัน ยกเว้น ${allParams.filter(p=>!bsDiff.includes(p)).join(', ')} ที่มีค่าใกล้เคียงกัน`)
            :(isEN?`Values were different from Baseline.`
              :`เมื่อเปรียบเทียบกับ Baseline พบว่ามีค่าแตกต่างกัน`);
        }
        if(!s5.endsWith('.')) s5+='.';
      }

      const parts=[s1,s2,s3,s4,s5].filter(Boolean);
      secABlocks.push(`<div data-loc="${loc}" style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed var(--border)">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${loc} — ${yr2}</div>
        <p style="line-height:1.75;font-size:13.5px;color:var(--text);margin:0">${parts.join(' ')}</p>
      </div>`);
    });
  });

  /* ── Section B: Year-over-year (same logic as Sea) ── */
  const secBBlocks=[];
  if(years.length>=2){
    locs.forEach(loc=>{
      const locRows=rows.filter(r=>r.loc===loc&&r.yr);
      if(!locRows.length) return;
      const allYrs=[...new Set(locRows.map(r=>r.yr))].sort((a,b)=>a-b);
      if(allYrs.length<2) return;

      const yrInfos=[];
      [...allYrs].reverse().forEach(yr2=>{
        const sts=[...new Set(locRows.filter(r=>String(r.yr)===String(yr2)).map(r=>r.st))];
        const datCol=document.getElementById(t+'-c-date')?.value;
        const rawYr=state.raw.filter(r=>{
          const cLoc=document.getElementById(t+'-c-loc')?.value;
          const cYr=document.getElementById(t+'-c-year')?.value;
          return cLoc&&r[cLoc]===loc&&cYr&&String(r[cYr])===String(yr2);
        });
        const dates=datCol?rawYr.map(r=>r[datCol]).filter(Boolean).sort():[];
        let dateStr='';
        if(dates.length){
          const months=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
          function fmtD(d){try{const dt=new Date(d);return isEN?dt.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):`${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;}catch(e){return d;}}
          const d1=fmtD(dates[0]),d2=fmtD(dates[dates.length-1]);
          dateStr=d1===d2?d1:`${d1} – ${d2}`;
        }
        yrInfos.push({yr:yr2,n:sts.length,dateStr});
      });

      const yrRange=`${allYrs[0]}–${allYrs[allYrs.length-1]}`;
      let s1=isEN?`Year-over-year comparison for ${loc} (${yrRange}): `:
        `การเปรียบเทียบข้อมูลผลการติดตามของบริเวณ ${loc} ตั้งแต่ปี ${yrRange} `;
      s1+=yrInfos.map(({yr:y,n,dateStr})=>
        isEN?`Year ${y}: ${n} station${n>1?'s':''}${dateStr?` (${dateStr})`:''}`
          :`ปี ${y} ดำเนินการเก็บตัวอย่าง${dateStr?`วันที่ ${dateStr} `:''}จำนวน ${n} สถานี`
      ).join(isEN?'; ':' ')+'.';

      const params=[...new Set(locRows.map(r=>r.col))];
      const stable=[],increasing=[],decreasing=[];
      params.forEach(col=>{
        const byYr={};
        allYrs.forEach(y=>{
          const vals=getVals(locRows.filter(r=>String(r.yr)===String(y)),col);
          if(vals.length) byYr[y]=calcMean(vals);
        });
        const yrs=Object.keys(byYr).map(Number).sort((a,b)=>a-b);
        if(yrs.length<2) return;
        const means=yrs.map(y=>byYr[y]);
        const cv=calcCV(means);
        if(cv<yrCVThresh){stable.push(col);return;}
        const first=means[0],last=means[means.length-1];
        const pct=first&&first!==0?(last-first)/Math.abs(first)*100:0;
        if(pct>0) increasing.push({col,firstYr:yrs[0],lastYr:yrs[yrs.length-1]});
        else decreasing.push({col,firstYr:yrs[0],lastYr:yrs[yrs.length-1]});
      });

      const total=stable.length+increasing.length+decreasing.length;
      const mostlyStable=total>0?stable.length/total>=0.6:true;
      const latestYr=allYrs[allYrs.length-1];
      const prevRange=allYrs.length===2?`${allYrs[0]}`:`${allYrs[0]}–${allYrs[allYrs.length-2]}`;

      let s2=isEN
        ?(mostlyStable?`Overall, sediment quality in ${latestYr} was mostly similar to ${prevRange}`
          :`Overall, sediment quality in ${latestYr} showed mostly different values compared to ${prevRange}`)
        :(mostlyStable?`สรุปได้ว่าคุณภาพดินตะกอนปี ${latestYr} ส่วนใหญ่มีค่าใกล้เคียงกับปี ${prevRange}`
          :`สรุปได้ว่าคุณภาพดินตะกอนปี ${latestYr} ส่วนใหญ่มีค่าแตกต่างจากปี ${prevRange}`);

      const excParts=[];
      if(increasing.length){
        const grp={};
        increasing.forEach(({col,firstYr,lastYr})=>{const k=`${firstYr}-${lastYr}`;if(!grp[k])grp[k]={cols:[],firstYr,lastYr};grp[k].cols.push(col);});
        Object.values(grp).forEach(({cols,firstYr,lastYr})=>excParts.push(isEN
          ?`${cols.join(', ')} showed an increasing trend from ${firstYr} to ${lastYr}`
          :`ความเข้มข้นของ ${cols.join(' ')} มีแนวโน้มเพิ่มขึ้นจากปี ${firstYr} ถึง ${lastYr}`));
      }
      if(decreasing.length){
        const grp={};
        decreasing.forEach(({col,firstYr,lastYr})=>{const k=`${firstYr}-${lastYr}`;if(!grp[k])grp[k]={cols:[],firstYr,lastYr};grp[k].cols.push(col);});
        Object.values(grp).forEach(({cols,firstYr,lastYr})=>excParts.push(isEN
          ?`${cols.join(', ')} showed a decreasing trend from ${firstYr} to ${lastYr}`
          :`ความเข้มข้นของ ${cols.join(' ')} มีแนวโน้มลดลงจากปี ${firstYr} ถึง ${lastYr}`));
      }

      s2+=excParts.length
        ?(isEN?`. However, ${excParts.join('; ')}.`:` ยกเว้นพารามิเตอร์ ${excParts.join(' และ')}.`)
        :'.';

      secBBlocks.push(`<div data-loc="${loc}" style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed var(--border)">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${loc}</div>
        <p style="line-height:1.75;font-size:13.5px;color:var(--text);margin:0">${[s1,s2].filter(Boolean).join(' ')}</p>
      </div>`);
    });
  }

  const allBlocks=[];
  if(secABlocks.length){
    allBlocks.push(`<div style="font-size:17px;font-weight:900;color:var(--navy);letter-spacing:-.2px;padding:6px 0 8px;border-bottom:3px solid var(--navy);margin-bottom:12px">${isEN?'Annual Report':'รายงานประจำปี'}</div>`);
    allBlocks.push(...secABlocks);
  }
  if(secBBlocks.length){
    allBlocks.push(`<div style="font-size:17px;font-weight:900;color:var(--navy);letter-spacing:-.2px;padding:6px 0 8px;border-bottom:3px solid var(--navy);margin-bottom:12px;margin-top:${secABlocks.length?'20px':'0'}">${isEN?'Year-over-Year Comparison':'เปรียบเทียบรายปี'}</div>`);
    allBlocks.push(...secBBlocks);
  }

  return allBlocks.length
    ?allBlocks.join('')
    :`<span style="color:var(--text3)">${T('es_nodata')}</span>`;
}



export function renderParaGeneric(t){
  const state = getState(t);
  const isEN=LANG==='en';
  const s=state;
  let rows=state.rows.filter(r=>!r.is_ref&&!r.is_baseline);
  const locs=[...new Set(rows.map(r=>r.loc))];
  const paras=[];
  locs.forEach(loc=>{
    const locRows=rows.filter(r=>r.loc===loc);
    const excP=[...new Set(locRows.filter(r=>r.sc_status==='exceed').map(r=>r.col))];
    let p=isEN?`${loc}: `:`บริเวณ ${loc}: `;
    p+=!excP.length
      ?(isEN?'All parameters within standard.':'พารามิเตอร์ทั้งหมดอยู่ในเกณฑ์มาตรฐาน')
      :(isEN?'Exceeded: ':'เกินมาตรฐาน: ')+excP.join(', ');
    paras.push(p);
  });
  return `<div style="line-height:1.85;font-size:14px;white-space:pre-wrap">${paras.join('\n\n')||T('es_nodata')}</div>`;
}

