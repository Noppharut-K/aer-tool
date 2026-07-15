/**
 * buildBioPage.js — Biology Calculator
 * Migrated from AER_Program.html
 */
import { LANG, L } from '../utils/lang.js';

var BIO_CFG = {
  benthos:  { title:'Benthos',       unit:'Taxon',   lvl1:'Phylum',  lvl2:'Taxon',  indices:'phylum' },
  phyto:    { title:'Phytoplankton', unit:'Species', lvl1:'Division',lvl2:'Species',indices:'direct', hasZone:true },
  zoo:      { title:'Zooplankton',   unit:'Taxon',   lvl1:'Phylum',  lvl2:'Taxon',  indices:'phylum' },
  larvae:   { title:'Fish Larvae',   unit:'Family',  lvl1:'Order',   lvl2:'Family', indices:'order'  }
};

/* Filename-safe module title (strips spaces, e.g. "Fish Larvae" -> "FishLarvae") */
function bioFname(mod) { return BIO_CFG[mod].title.replace(/\s+/g,''); }

var BIO = {
  benthos:  {raw:null, tax:{}, calc:{}, filename:''},
  phyto:    {raw:null, tax:{}, calc:{}, filename:''},
  zoo:      {raw:null, tax:{}, calc:{}, filename:''},
  larvae:   {raw:null, tax:{}, calc:{}, filename:''}
};
window.BIO = BIO;

export function buildBioPage(el) {
  var l = L[LANG]||L.th;
  el.innerHTML = [
    '<div class="ph"><button class="ph-back" id="bio-back-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>'+l.back+'</button><div class="ph-div"></div><div style="display:flex;flex-direction:column;gap:1px"><span class="ph-title">Biology Calculator</span><span class="ph-sub">Benthos &middot; Phytoplankton &middot; Zooplankton &middot; Fish Larvae</span></div></div>',
    '<div class="bio-layout"><div class="bio-tabs" id="bio-tabs-bar">',
    '<button class="bio-tab-btn active" id="bio-btn-benthos">Benthos</button>',
    '<button class="bio-tab-btn" id="bio-btn-phyto">Phytoplankton</button>',
    '<button class="bio-tab-btn" id="bio-btn-zoo">Zooplankton</button>',
    '<button class="bio-tab-btn" id="bio-btn-larvae">Fish Larvae</button>',
    '<button class="bio-tab-btn" id="bio-btn-method">หลักการคำนวน</button>',
    '</div>',
    '<div class="bio-content">',
    '<div id="bio-pane-benthos" class="bio-pane active"></div>',
    '<div id="bio-pane-phyto" class="bio-pane"></div>',
    '<div id="bio-pane-zoo" class="bio-pane"></div>',
    '<div id="bio-pane-larvae" class="bio-pane"></div>',
    '<div id="bio-pane-method" class="bio-pane"></div>',
    '</div></div>'
  ].join('');
  /* Attach events after render */
  var backBtn = document.getElementById('bio-back-btn'); if(backBtn) backBtn.setAttribute('data-back','bio');
  initBioModule('benthos');
  /* Wire tab buttons */
  ['benthos','phyto','zoo','larvae','method'].forEach(function(k){
    var btn = document.getElementById('bio-btn-'+k);
    if(btn) btn.addEventListener('click', function(){ switchBioTab(k, btn); });
  });
}

/* ── Calculation helpers ── */
function bioRoundup0(x){
  x = parseFloat(x);
  if(isNaN(x)) return 0;
  return x>=0 ? Math.ceil(x) : Math.floor(x);
}

function bioDominant(densMap){
  /* densMap = {name: density} */
  var max = -Infinity, tops=[];
  Object.keys(densMap).forEach(function(k){
    var v=parseFloat(densMap[k])||0;
    if(v>max){max=v;tops=[k];}
    else if(v===max&&v>0) tops.push(k);
  });
  return max>0 ? tops.join(' / ') : '';
}

function bioCalcIndices(densities, groups){
  /* densities: array of numbers, groups: array of group strings (phylum/order) */
  var paired = densities.map(function(d,i){return{d:parseFloat(d)||0,g:groups?String(groups[i]||''):'ALL'};}).filter(function(x){return x.d>0;});
  var S = paired.length;
  if(S===0) return {N:NaN,S:0,H:NaN,R:NaN,E:NaN};
  /* group sum then roundup then total N */
  var gSum = {};
  paired.forEach(function(x){ gSum[x.g]=(gSum[x.g]||0)+x.d; });
  var N = Object.values(gSum).reduce(function(a,v){return a+bioRoundup0(v);},0);
  if(N<=0) return {N:NaN,S:0,H:NaN,R:NaN,E:NaN};
  var p = paired.map(function(x){return x.d/N;}).filter(function(v){return v>0;});
  var H = -p.reduce(function(a,pi){return a+pi*Math.log(pi);},0);
  var R = S>1 ? (S-1)/Math.log(N) : NaN;
  var E = S>1 ? H/Math.log(S) : NaN;
  return {N:N,S:S,H:H,R:R,E:E};
}

function bioCalcIndicesPhyto(densities){
  /* Phytoplankton: N = sum of densities directly */
  var dens = densities.map(function(d){return parseFloat(d)||0;}).filter(function(d){return d>0;});
  var S = dens.length;
  if(S===0) return {N:NaN,S:0,H:NaN,R:NaN,E:NaN};
  var N = dens.reduce(function(a,v){return a+v;},0);
  var p = dens.map(function(d){return d/N;}).filter(function(v){return v>0;});
  var H = -p.reduce(function(a,pi){return a+pi*Math.log(pi);},0);
  var R = S>1 ? (S-1)/Math.log(N) : NaN;
  var E = S>1 ? H/Math.log(S) : NaN;
  return {N:N,S:S,H:H,R:R,E:E};
}

function bioF2(x){ return (x==null||isNaN(x)) ? '' : parseFloat(x).toFixed(2); }

/* ── Main Calculate ── */
function bioCalculate(mod){
  var rows = bioGetFilteredRows(mod);
  if(!rows.length){ bioErr(mod,'ไม่มีข้อมูลหลัง filter'); return; }

  var colSt   = (document.getElementById('bio-st-'+mod)||{}).value||'';
  var colRep  = (document.getElementById('bio-rep-'+mod)||{}).value||'';
  var colDen  = (document.getElementById('bio-den-'+mod)||{}).value||'';
  var colLvl1 = (document.getElementById('bio-lvl1-'+mod)||{}).value||'';
  var colLvl2 = (document.getElementById('bio-lvl2-'+mod)||{}).value||'';
  var colCls  = (document.getElementById('bio-class-'+mod)||{}).value||'';
  var colLoc  = (document.getElementById('bio-loc-'+mod)||{}).value||'';
  var colYear = (document.getElementById('bio-year-'+mod)||{}).value||'';
  var colProj = (document.getElementById('bio-proj-'+mod)||{}).value||'';
  var colZone = (document.getElementById('bio-zone-'+mod)||{}).value||'';

  if(!colSt||!colRep||!colDen||!colLvl1||!colLvl2){
    bioErr(mod,'กรุณาเลือก Station, Replicate, Density, '+BIO_CFG[mod].lvl1+', '+BIO_CFG[mod].lvl2);
    return;
  }

  /* Get grouping meta (loc or year+proj+loc) */
  function getMeta(r){
    var parts=[];
    if(colYear) parts.push(String(r[colYear]||'').trim());
    if(colProj) parts.push(String(r[colProj]||'').trim());
    if(colLoc)  parts.push(String(r[colLoc]||'').trim());
    if(colZone) parts.push(String(r[colZone]||'').trim());
    return parts.join('||') || 'ALL';
  }

  /* Group rows by meta */
  var byMeta = {};
  rows.forEach(function(r){
    var den = parseFloat(r[colDen])||0;
    if(den<0) return;
    var key = getMeta(r);
    if(!byMeta[key]) byMeta[key]={rows:[],label:key};
    byMeta[key].rows.push(r);
  });

  /* Build result tables */
  BIO[mod].calc = {};
  var resultDiv = document.getElementById('bio-results-'+mod);
  resultDiv.innerHTML = '';

  /* Collect ALL lvl1s and classes across all meta groups for consistent rows */
  var allLvl1s = [...new Set(rows.map(function(r){return String(r[colLvl1]||'').trim();}).filter(Boolean))].sort();
  /* all classes per lvl1 globally */
  var allClassesByLvl1 = {};
  allLvl1s.forEach(function(lv1){
    allClassesByLvl1[lv1] = [...new Set(rows.filter(function(r){return String(r[colLvl1]||'').trim()===lv1;}).map(function(r){return String(r[colCls]||'').trim();}).filter(Boolean))].sort();
  });

  Object.keys(byMeta).forEach(function(metaKey){
    var grpRows = byMeta[metaKey].rows;
    var stations = [...new Set(grpRows.map(function(r){return String(r[colSt]||'').trim();}))].sort();
    var lvl1s = allLvl1s;

    /* ── Station mean density per lvl1+lvl2 (pivot fill=0) ── */
    /* pivot: {station: {lvl2: {rep: density}}} */
    var pivot = {};
    grpRows.forEach(function(r){
      var st=String(r[colSt]||'').trim(), rep=String(r[colRep]||'').trim(),
          lv1=String(r[colLvl1]||'').trim(), lv2=String(r[colLvl2]||'').trim(),
          den=parseFloat(r[colDen])||0;
      if(!st||!rep||!lv1||!lv2||den<0) return;
      if(!pivot[st]) pivot[st]={};
      var k=lv1+'|||'+lv2;
      if(!pivot[st][k]) pivot[st][k]={};
      pivot[st][k][rep] = (pivot[st][k][rep]||0)+den;
    });

    /* Mean density per station per (lvl1,lvl2) */
    /* stMean: {station: [{lv1,lv2,mean}]} */
    var stMean = {};
    stations.forEach(function(st){
      stMean[st]=[];
      if(!pivot[st]) return;
      /* count total replicates for this station */
      var allRepsForSt = new Set();
      grpRows.forEach(function(r){ if(String(r[colSt]||'').trim()===st) allRepsForSt.add(String(r[colRep]||'').trim()); });
      var nReps = allRepsForSt.size || 1;
      Object.keys(pivot[st]).forEach(function(k){
        var parts=k.split('|||'), lv1=parts[0], lv2=parts[1];
        var reps=pivot[st][k];
        var sum=Object.values(reps).reduce(function(a,v){return a+v;},0);
        var mean=sum/nReps;
        stMean[st].push({lv1:lv1,lv2:lv2,mean:mean});
      });
    });

    /* ── Number of taxa/species per station per lvl1 ── */
    /* count unique lvl2 that appeared (sum density>0 across reps) */
    var stTaxaCount = {}; /* {station: {lvl1: count}} */
    var locTaxaCount = {}; /* {lvl1: Set of lv2} */
    stations.forEach(function(st){
      stTaxaCount[st]={};
      lvl1s.forEach(function(lv1){
        var present = stMean[st].filter(function(x){return x.lv1===lv1&&x.mean>0;}).map(function(x){return x.lv2;});
        stTaxaCount[st][lv1]=present.length;
        if(!locTaxaCount[lv1]) locTaxaCount[lv1]=new Set();
        present.forEach(function(lv2){ locTaxaCount[lv1].add(lv2); });
      });
    });

    /* ── Density per station per lvl1 (ROUNDUP of sum) ── */
    var stDens = {}; /* {station: {lvl1: roundup(sum of mean)}} */
    stations.forEach(function(st){
      stDens[st]={};
      lvl1s.forEach(function(lv1){
        var sum = stMean[st].filter(function(x){return x.lv1===lv1;}).reduce(function(a,x){return a+x.mean;},0);
        stDens[st][lv1]=bioRoundup0(sum);
      });
    });

    /* ── Indices per station (avg across replicates) ── */
    /* First compute per replicate, then average */
    var repIndices = {}; /* {station: [{H,R,E}]} */
    stations.forEach(function(st){
      repIndices[st]=[];
      /* get all reps for this station */
      var stReps = [...new Set(grpRows.filter(function(r){return String(r[colSt]||'').trim()===st;}).map(function(r){return String(r[colRep]||'').trim();}))];
      stReps.forEach(function(rep){
        var repRows = grpRows.filter(function(r){return String(r[colSt]||'').trim()===st&&String(r[colRep]||'').trim()===rep;});
        var dens = repRows.map(function(r){return parseFloat(r[colDen])||0;});
        var grps = colLvl1 ? repRows.map(function(r){return String(r[colLvl1]||'').trim();}) : null;
        var idx = (mod==='phyto') ? bioCalcIndicesPhyto(dens) : bioCalcIndices(dens, grps);
        repIndices[st].push(idx);
      });
    });

    var stIndices = {}; /* {station: {H,R,E}} — mean across reps */
    stations.forEach(function(st){
      var reps = repIndices[st];
      if(!reps.length){ stIndices[st]={H:NaN,R:NaN,E:NaN}; return; }
      stIndices[st]={
        H: reps.reduce(function(a,x){return a+(isNaN(x.H)?0:x.H);},0)/reps.filter(function(x){return !isNaN(x.H);}).length||NaN,
        R: reps.reduce(function(a,x){return a+(isNaN(x.R)?0:x.R);},0)/reps.filter(function(x){return !isNaN(x.R);}).length||NaN,
        E: reps.reduce(function(a,x){return a+(isNaN(x.E)?0:x.E);},0)/reps.filter(function(x){return !isNaN(x.E);}).length||NaN
      };
    });

    /* Location indices = mean of station indices */
    function meanArr(arr){ var v=arr.filter(function(x){return !isNaN(x);}); return v.length?v.reduce(function(a,b){return a+b;})/v.length:NaN; }
    var locH = meanArr(stations.map(function(st){return stIndices[st].H;}));
    var locR = meanArr(stations.map(function(st){return stIndices[st].R;}));
    var locE = meanArr(stations.map(function(st){return stIndices[st].E;}));

    /* ── Dominant ── */
    function getDomSt(st){
      var dm={};
      stMean[st].forEach(function(x){dm[x.lv2]=(dm[x.lv2]||0)+x.mean;});
      return bioDominant(dm);
    }
    var dmLoc = {};
    stations.forEach(function(st){ stMean[st].forEach(function(x){dmLoc[x.lv2]=(dmLoc[x.lv2]||0)+x.mean;}); });

    /* ── Build table ── */
    var unitLabel = BIO_CFG[mod].unit;
    var cols = stations.concat(['Total/Mean']);
    var rows2 = []; /* [{label, values[], isHeader}] */

    /* Section A: Number */
    rows2.push({label:'Number of '+unitLabel, vals:cols.map(function(){return '';}), sec:true});
    lvl1s.forEach(function(lv1){
      var vals = stations.map(function(st){return stTaxaCount[st][lv1]||0;});
      var locTotal = locTaxaCount[lv1]?locTaxaCount[lv1].size:0;
      rows2.push({label:'  '+(mod==='phyto'?'Division: ':mod==='larvae'?'Order: ':'Phylum: ')+lv1, vals:vals.concat([locTotal]), sec:false});

      /* For phyto: show Class breakdown under Division */
      if(mod==='phyto' && colCls){
        var classes = allClassesByLvl1[lv1] || [];
        classes.forEach(function(cls){
          var clsVals = stations.map(function(st){
            return new Set(grpRows.filter(function(r){
              return String(r[colSt]||'').trim()===st &&
                     String(r[colLvl1]||'').trim()===lv1 &&
                     String(r[colCls]||'').trim()===cls;
            }).map(function(r){return String(r[colLvl2]||'').trim();})).size;
          });
          var clsTotal = new Set(grpRows.filter(function(r){
            return String(r[colLvl1]||'').trim()===lv1 &&
                   String(r[colCls]||'').trim()===cls;
          }).map(function(r){return String(r[colLvl2]||'').trim();})).size;
          rows2.push({label:'    Class: '+cls, vals:clsVals.concat([clsTotal]), sec:false, indent:true});
        });
        rows2.push({label:'', vals:cols.map(function(){return '';}), sec:false});
      }
    });
    var totalTaxaSt = stations.map(function(st){return lvl1s.reduce(function(a,lv1){return a+(stTaxaCount[st][lv1]||0);},0);});
    var totalTaxaLoc = Object.values(locTaxaCount).reduce(function(a,s){return a+s.size;},0);
    rows2.push({label:'  Total', vals:totalTaxaSt.concat([totalTaxaLoc]), sec:false, bold:true});
    rows2.push({label:'', vals:cols.map(function(){return '';}), sec:false});

    /* Section B: Density */
    rows2.push({label:'Density', vals:cols.map(function(){return '';}), sec:true});
    lvl1s.forEach(function(lv1){
      var vals = stations.map(function(st){return stDens[st][lv1]||0;});
      var locDen = bioRoundup0(vals.reduce(function(a,v){return a+v;},0)/stations.length);
      var divLabel = '  '+(mod==='phyto'?'Division: ':mod==='larvae'?'Order: ':'Phylum: ')+lv1;
      rows2.push({label:divLabel, vals:vals.concat([locDen]), sec:false});

      /* For phyto: show Class density breakdown */
      if(mod==='phyto' && colCls){
        var classes = allClassesByLvl1[lv1] || [];
        classes.forEach(function(cls){
          var clsDens = stations.map(function(st){
            var sum = stMean[st].filter(function(x){
              return x.lv1===lv1 && String(grpRows.find(function(r){
                return String(r[colLvl2]||'').trim()===x.lv2 && String(r[colLvl1]||'').trim()===lv1;
              })||{})[colCls]===cls ||
              grpRows.some(function(r){return String(r[colLvl2]||'').trim()===x.lv2 && String(r[colCls]||'').trim()===cls && String(r[colLvl1]||'').trim()===lv1;});
            }).reduce(function(a,x){return a+x.mean;},0);
            return bioRoundup0(sum);
          });
          var clsLocDen = bioRoundup0(clsDens.reduce(function(a,v){return a+v;},0)/stations.length);
          rows2.push({label:'    Class: '+cls, vals:clsDens.concat([clsLocDen]), sec:false, indent:true});
        });
        rows2.push({label:'', vals:cols.map(function(){return '';}), sec:false});
      }
    });
    var totalDenSt = stations.map(function(st){return lvl1s.reduce(function(a,lv1){return a+(stDens[st][lv1]||0);},0);});
    var totalDenLoc = bioRoundup0(totalDenSt.reduce(function(a,v){return a+v;},0)/stations.length);
    rows2.push({label:'  Total density', vals:totalDenSt.concat([totalDenLoc]), sec:false, bold:true});
    rows2.push({label:'', vals:cols.map(function(){return '';}), sec:false});

    /* Section C: Indices */
    rows2.push({label:'Indices', vals:cols.map(function(){return '';}), sec:true});
    [['  Diversity (H\')',stIndices,'H',locH],['  Richness',stIndices,'R',locR],['  Evenness',stIndices,'E',locE]].forEach(function(arr){
      var lbl=arr[0],idxObj=arr[1],key=arr[2],locVal=arr[3];
      var vals=stations.map(function(st){return bioF2(idxObj[st][key]);});
      rows2.push({label:lbl, vals:vals.concat([bioF2(locVal)]), sec:false});
    });
    rows2.push({label:'', vals:cols.map(function(){return '';}), sec:false});

    /* Dominant */
    var domVals = stations.map(function(st){return getDomSt(st);}).concat([bioDominant(dmLoc)]);
    rows2.push({label:'Dominant '+unitLabel, vals:domVals, sec:false, bold:true});

    /* ── Store for export ── */
    BIO[mod].calc[metaKey] = {cols:cols, rows:rows2};

    /* ── Render table ── */
    var metaParts = metaKey.split('||');
    var metaLabel = metaKey==='ALL' ? 'All Data' : metaParts.join(' | ');
    var tbl = '<div class="bio-result-title">'+metaLabel+'</div><div class="bio-tbl-wrap"><table>';
    tbl += '<thead><tr><th style="text-align:left">Parameter</th>'+cols.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr></thead><tbody>';
    rows2.forEach(function(row){
      if(row.sec){
        tbl += '<tr><td class="sec-hd" colspan="'+(cols.length+1)+'">'+row.label+'</td></tr>';
      } else if(!row.label&&row.vals.every(function(v){return v==='';})){
        tbl += '<tr><td colspan="'+(cols.length+1)+'" style="height:4px;padding:0"></td></tr>';
      } else {
        var cls = row.bold?'style="font-weight:700"':'';
        tbl += '<tr><td class="row-hd" '+cls+'>'+row.label+'</td>'+row.vals.map(function(v){return '<td '+cls+'>'+v+'</td>';}).join('')+'</tr>';
      }
    });
    tbl += '</tbody></table></div>';
    resultDiv.innerHTML += tbl;
  });

  if(!Object.keys(byMeta).length) bioErr(mod,'ไม่มีข้อมูลหลัง filter');
}

/* ── Export Excel ── */
function bioExport(mod){
  var calc = BIO[mod].calc;
  if(!calc||!Object.keys(calc).length){ bioErr(mod,'กด Calculate ก่อนครับ'); return; }
  var wb = XLSX.utils.book_new();
  Object.keys(calc).forEach(function(metaKey){
    var data = calc[metaKey];
    var sheetData = [['Parameter'].concat(data.cols)];
    data.rows.forEach(function(row){
      sheetData.push([row.label].concat(row.vals));
    });
    var ws = XLSX.utils.aoa_to_sheet(sheetData);
    var sheetName;
    if(mod==='phyto' && metaKey!=='ALL'){
      var parts = metaKey.split('||');
      /* parts: year||proj||loc||zone — want Station_Zone_Year */
      var loc  = parts[2]||'';
      var zone = parts[3]||'';
      var yr   = parts[0]||'';
      sheetName = (loc+'_'+zone+'_'+yr).substring(0,31);
    } else {
      sheetName = (metaKey==='ALL'?'Result':metaKey.replace(/\|\|/g,'_')).substring(0,31);
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });
  var fname = bioFname(mod)+'_Results_'+new Date().toISOString().slice(0,10)+'.xlsx';
  XLSX.writeFile(wb, fname);
}

/* === BIO DEMO DATA === */
var BIO_DEMO=(function(){
  /* ── shared taxa pools ── */
  var BENTHOS_TAXA=[
    {Phylum:'Polychaeta',  Taxon:'Capitella capitata'},
    {Phylum:'Polychaeta',  Taxon:'Nereis diversicolor'},
    {Phylum:'Polychaeta',  Taxon:'Polydora sp.'},
    {Phylum:'Polychaeta',  Taxon:'Prionospio sp.'},
    {Phylum:'Polychaeta',  Taxon:'Glycera sp.'},
    {Phylum:'Crustacea',   Taxon:'Ampelisca sp.'},
    {Phylum:'Crustacea',   Taxon:'Corophium sp.'},
    {Phylum:'Crustacea',   Taxon:'Diastylis sp.'},
    {Phylum:'Mollusca',    Taxon:'Tellina sp.'},
    {Phylum:'Mollusca',    Taxon:'Nucula sp.'},
    {Phylum:'Mollusca',    Taxon:'Macoma sp.'},
    {Phylum:'Echinodermata',Taxon:'Amphiura sp.'},
  ];
  var PHYTO_TAXA=[
    {Division:'Bacillariophyta', Class:'Bacillariophyceae', Species:'Chaetoceros sp.'},
    {Division:'Bacillariophyta', Class:'Bacillariophyceae', Species:'Skeletonema sp.'},
    {Division:'Bacillariophyta', Class:'Bacillariophyceae', Species:'Nitzschia sp.'},
    {Division:'Bacillariophyta', Class:'Bacillariophyceae', Species:'Coscinodiscus sp.'},
    {Division:'Bacillariophyta', Class:'Bacillariophyceae', Species:'Rhizosolenia sp.'},
    {Division:'Dinoflagellata',  Class:'Dinophyceae',       Species:'Ceratium sp.'},
    {Division:'Dinoflagellata',  Class:'Dinophyceae',       Species:'Noctiluca sp.'},
    {Division:'Dinoflagellata',  Class:'Dinophyceae',       Species:'Protoperidinium sp.'},
    {Division:'Cyanophyta',      Class:'Cyanophyceae',      Species:'Trichodesmium sp.'},
  ];
  var ZOO_TAXA=[
    {Phylum:'Copepoda',    Taxon:'Acartia sp.'},
    {Phylum:'Copepoda',    Taxon:'Paracalanus sp.'},
    {Phylum:'Copepoda',    Taxon:'Temora sp.'},
    {Phylum:'Copepoda',    Taxon:'Oncaea sp.'},
    {Phylum:'Chaetognatha',Taxon:'Sagitta sp.'},
    {Phylum:'Medusozoa',   Taxon:'Aurelia sp.'},
    {Phylum:'Euphausiacea',Taxon:'Euphausia sp.'},
    {Phylum:'Ostracoda',   Taxon:'Cypridina sp.'},
  ];
  var LARVAE_TAXA=[
    {Order:'Decapoda',   Family:'Penaeidae'},
    {Order:'Decapoda',   Family:'Sergestidae'},
    {Order:'Decapoda',   Family:'Portunidae'},
    {Order:'Mysidacea',  Family:'Mysidae'},
    {Order:'Amphipoda',  Family:'Gammaridae'},
    {Order:'Clupeiformes',Family:'Clupeidae'},
    {Order:'Perciformes', Family:'Sciaenidae'},
  ];

  var LOCS=['Loc-A','Loc-B'];
  var STS={
    'Loc-A':['ST-A01','ST-A02','ST-A03','ST-A04','ST-A05'],
    'Loc-B':['ST-B01','ST-B02','ST-B03','ST-B04','ST-B05'],
  };
  var YEARS=[2020,2021,2022,2023];
  var REPS=['1','2','3'];
  var ZONES=['Surface','Euphotic'];

  /* seed-based density variation per year/station */
  function d(base, yr, st, taxa){
    var s=(yr*31+st.charCodeAt(st.length-1)*17+taxa.charCodeAt(0)*7)%100;
    return Math.max(5, Math.round(base*(0.65+s/100)));
  }

  var benthos=[], phyto=[], zoo=[], larvae=[];

  LOCS.forEach(function(loc){
    STS[loc].forEach(function(st){
      YEARS.forEach(function(yr){
        REPS.forEach(function(rep){
          /* benthos: 6-9 taxa per replicate, vary by yr */
          var nTaxa=6+Math.abs((yr-2020+parseInt(st.slice(-2)))%4);
          BENTHOS_TAXA.slice(0,nTaxa).forEach(function(tx){
            var base=tx.Phylum==='Polychaeta'?100:tx.Phylum==='Crustacea'?55:35;
            benthos.push({Year:String(yr),Project:'EIA-Demo',Location:loc,Station:st,Replicate:rep,
              Phylum:tx.Phylum,Taxon:tx.Taxon,Density:d(base,yr,st,tx.Taxon)});
          });
          /* zoo: 4-6 taxa */
          var nZoo=4+((yr+parseInt(rep))%3);
          ZOO_TAXA.slice(0,nZoo).forEach(function(tx){
            var base=tx.Phylum==='Copepoda'?700:tx.Phylum==='Chaetognatha'?180:120;
            zoo.push({Year:String(yr),Project:'EIA-Demo',Location:loc,Station:st,Replicate:rep,
              Phylum:tx.Phylum,Taxon:tx.Taxon,Density:d(base,yr,st,tx.Taxon)});
          });
          /* larvae: 3-5 taxa */
          var nLarv=3+((yr+parseInt(st.slice(-2)))%3);
          LARVAE_TAXA.slice(0,nLarv).forEach(function(tx){
            var base=tx.Order==='Decapoda'?300:tx.Order==='Mysidacea'?100:80;
            larvae.push({Year:String(yr),Project:'EIA-Demo',Location:loc,Station:st,Replicate:rep,
              Order:tx.Order,Family:tx.Family,Density:d(base,yr,st,tx.Family)});
          });
        });
        /* phyto: 2 zones × 2 reps × 5-7 species */
        ZONES.forEach(function(zone){
          ['1','2'].forEach(function(rep){
            var nSp=5+((yr+parseInt(st.slice(-2))+ZONES.indexOf(zone))%3);
            PHYTO_TAXA.slice(0,nSp).forEach(function(tx){
              var base=zone==='Surface'?(tx.Division==='Bacillariophyta'?2000:300):(tx.Division==='Bacillariophyta'?1000:180);
              phyto.push({Year:String(yr),Project:'EIA-Demo',Location:loc,Station:st,Replicate:rep,Zone:zone,
                Division:tx.Division,Class:tx.Class,Species:tx.Species,Density:d(base,yr,st,tx.Species)});
            });
          });
        });
      });
    });
  });

  return {benthos:benthos, phyto:phyto, zoo:zoo, larvae:larvae};
})();

function bioLoadDemo(mod) {
  var data = BIO_DEMO[mod];
  if(!data) return;
  BIO[mod].raw = data;
  BIO[mod].filename = 'Demo_'+mod+'.xlsx';
  var fi = document.getElementById('bio-fi-'+mod);
  if(fi){ fi.textContent = '\u2713 Demo data loaded \u2014 '+data.length+' rows'; fi.style.display='block'; }
  var errEl = document.getElementById('bio-err-'+mod);
  if(errEl) errEl.style.display='none';
  bioPopulateCols(mod, Object.keys(data[0]));
  bioAutoDetect(mod, Object.keys(data[0]));
  var mapping = document.getElementById('bio-mapping-'+mod);
  if(mapping) mapping.style.display='block';
  bioUpdateFilters(mod);
}

function initBioMethod() {
  var pane = document.getElementById('bio-pane-method');
  if(!pane) return;
  pane.dataset.built = '1';
  pane.innerHTML = [
    '<div style="max-width:820px;margin:0 auto">',
    '<h3 style="font-size:16px;font-weight:800;color:var(--bio-c);margin-bottom:4px">หลักการคำนวน</h3>',
    '<p style="font-size:12px;color:var(--text3);margin-bottom:20px">Biology Calculator ใช้สูตรมาตรฐานสากลสำหรับการวิเคราะห์ความหลากหลายทางชีวภาพ</p>',

    /* ── Section 1: Notation ── */
    '<div class="bio-section">สัญลักษณ์และคำนิยาม</div>',
    '<div class="bio-tbl-wrap"><table><thead><tr><th>สัญลักษณ์</th><th>ความหมาย</th></tr></thead><tbody>',
    '<tr><td><b>S</b></td><td>จำนวน Taxa/Species ที่พบ (Density &gt; 0) ในกลุ่มตัวอย่าง</td></tr>',
    '<tr><td><b>N</b></td><td>ความหนาแน่นรวม (Total Density) — คำนวณตามวิธีของแต่ละกลุ่ม</td></tr>',
    '<tr><td><b>p<sub>i</sub></b></td><td>สัดส่วนความหนาแน่นของ Taxa i = Density<sub>i</sub> / N</td></tr>',
    '<tr><td><b>H\'</b></td><td>Shannon Diversity Index</td></tr>',
    '<tr><td><b>d</b></td><td>Margalef Species Richness</td></tr>',
    '<tr><td><b>J\'</b></td><td>Pielou Evenness Index</td></tr>',
    '</tbody></table></div>',

    /* ── Section 2: N calculation ── */
    '<div class="bio-section">การคำนวณ N (Total Density)</div>',
    '<div style="background:var(--white);border-radius:var(--rm);padding:14px 16px;margin-bottom:14px">',
    '<p style="font-size:12.5px;font-weight:700;color:var(--navy);margin-bottom:8px">Benthos &amp; Zooplankton (Phylum-based)</p>',
    '<p style="font-size:12.5px;color:var(--text2);line-height:1.8">',
    '1. รวม Density ของแต่ละ Phylum: <code>Phylum<sub>sum</sub> = &Sigma; Density</code><br>',
    '2. ROUNDUP ค่าผลรวมของแต่ละ Phylum ทีละตัว<br>',
    '3. N = &Sigma; ROUNDUP(Phylum<sub>sum</sub>)',
    '</p>',
    '</div>',
    '<div style="background:var(--white);border-radius:var(--rm);padding:14px 16px;margin-bottom:14px">',
    '<p style="font-size:12.5px;font-weight:700;color:var(--navy);margin-bottom:8px">Phytoplankton (Direct sum)</p>',
    '<p style="font-size:12.5px;color:var(--text2);line-height:1.8">',
    'N = &Sigma; Density ทุก Species ที่ Density &gt; 0 (ไม่มีการ ROUNDUP ก่อนรวม)',
    '</p>',
    '</div>',
    '<div style="background:var(--white);border-radius:var(--rm);padding:14px 16px;margin-bottom:14px">',
    '<p style="font-size:12.5px;font-weight:700;color:var(--navy);margin-bottom:8px">Fish Larvae (Order-based)</p>',
    '<p style="font-size:12.5px;color:var(--text2);line-height:1.8">',
    '1. รวม Density ของแต่ละ Order: <code>Order<sub>sum</sub> = &Sigma; Density</code><br>',
    '2. N = &Sigma; ROUNDUP(Order<sub>sum</sub>)',
    '</p>',
    '</div>',

    /* ── Section 3: Indices ── */
    '<div class="bio-section">ดัชนีความหลากหลาย</div>',
    '<div style="background:var(--white);border-radius:var(--rm);padding:14px 16px;margin-bottom:10px">',
    '<p style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:6px">Shannon Diversity Index (H\')</p>',
    '<p style="font-size:14px;text-align:center;padding:10px;background:var(--white);border-radius:var(--rs);font-family:\'Georgia\',serif;color:var(--text);margin-bottom:8px">',
    'H\' = &minus;&Sigma; p<sub>i</sub> &times; ln(p<sub>i</sub>)',
    '</p>',
    '<p style="font-size:12px;color:var(--text3)">เมื่อ p<sub>i</sub> = n<sub>i</sub>/N, คำนวณเฉพาะ Taxa ที่ p<sub>i</sub> &gt; 0</p>',
    '<p style="font-size:12px;color:var(--text3);margin-top:4px">H\' = 0 &rarr; มีเพียง 1 species | H\' สูง &rarr; ความหลากหลายสูง</p>',
    '</div>',
    '<div style="background:var(--white);border-radius:var(--rm);padding:14px 16px;margin-bottom:10px">',
    '<p style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:6px">Margalef Species Richness (d)</p>',
    '<p style="font-size:14px;text-align:center;padding:10px;background:var(--white);border-radius:var(--rs);font-family:\'Georgia\',serif;color:var(--text);margin-bottom:8px">',
    'd = (S &minus; 1) / ln(N)',
    '</p>',
    '<p style="font-size:12px;color:var(--text3)">ใช้ได้เมื่อ S &gt; 1 เท่านั้น ถ้า S = 1 จะได้ d = 0</p>',
    '</div>',
    '<div style="background:var(--white);border-radius:var(--rm);padding:14px 16px;margin-bottom:14px">',
    '<p style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:6px">Pielou Evenness (J\')</p>',
    '<p style="font-size:14px;text-align:center;padding:10px;background:var(--white);border-radius:var(--rs);font-family:\'Georgia\',serif;color:var(--text);margin-bottom:8px">',
    'J\' = H\' / ln(S)',
    '</p>',
    '<p style="font-size:12px;color:var(--text3)">J\' อยู่ระหว่าง 0–1 | J\' = 1 หมายความว่าทุก Taxa มีความหนาแน่นเท่ากัน</p>',
    '</div>',

    /* ── Section 4: Replicate averaging ── */
    '<div class="bio-section">การเฉลี่ยข้ามซ้ำ (Replicate Averaging)</div>',
    '<div style="background:var(--white);border-radius:var(--rm);padding:14px 16px;margin-bottom:14px">',
    '<p style="font-size:12.5px;color:var(--text2);line-height:1.9">',
    '<b style="color:var(--navy)">Step 1:</b> คำนวณดัชนีแยกต่างหากสำหรับแต่ละ Replicate<br>',
    '<b style="color:var(--navy)">Step 2:</b> ค่าดัชนีของ Station = Mean ของดัชนีจากทุก Replicate ที่มีข้อมูล<br>',
    '<b style="color:var(--navy)">Step 3:</b> ค่าดัชนีของ Location = Mean ของดัชนีจากทุก Station<br>',
    '<b style="color:var(--navy)">Density:</b> ใช้ Pivot table เพื่อ fill 0 สำหรับ Taxa ที่ไม่ปรากฏใน replicate นั้น',
    '</p>',
    '</div>',

    /* ── Section 5: Dominant ── */
    '<div class="bio-section">Dominant Species/Taxon</div>',
    '<div style="background:var(--white);border-radius:var(--rm);padding:14px 16px;margin-bottom:14px">',
    '<p style="font-size:12.5px;color:var(--text2);line-height:1.8">',
    'Species/Taxon ที่มีค่าเฉลี่ย Density สูงสุด (Station-weighted mean)<br>',
    'กรณีมีค่าเท่ากันหลายตัว จะแสดงทุกตัวคั่นด้วย " / "',
    '</p>',
    '</div>',

    /* ── Section 6: Reference ── */
    '<div class="bio-section">อ้างอิง</div>',
    '<div class="bio-tbl-wrap"><table><thead><tr><th>สูตร/วิธี</th><th>อ้างอิง</th></tr></thead><tbody>',
    '<tr><td>Shannon Diversity Index (H\')</td><td>Shannon & Weaver (1949)</td></tr>',
    '<tr><td>Margalef Richness (d)</td><td>Margalef (1958)</td></tr>',
    '<tr><td>Pielou Evenness (J\')</td><td>Pielou (1966)</td></tr>',
    '<tr><td>ROUNDUP Phylum density</td><td>Standard practice in Thai EIA monitoring</td></tr>',
    '</tbody></table></div>',

    '</div>'
  ].join('');
}

/* === BIO SUB-TAB SWITCHER === */
function bioSubTab(mod, tab, btn) {
  document.querySelectorAll('#bio-pane-'+mod+' .bio-sub-btn').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  document.getElementById('bio-results-'+mod).style.display = tab==='calc' ? 'block' : 'none';
  document.getElementById('bio-taxsummary-'+mod).style.display = tab==='tax' ? 'block' : 'none';
  var repDiv = document.getElementById('bio-byrep-'+mod);
  if(repDiv) repDiv.style.display = tab==='rep' ? 'block' : 'none';
}

/* === TAXONOMY SUMMARY === */
function bioTaxSummary(mod) {
  var rows = bioGetFilteredRows(mod);
  if(!rows.length) { bioErr(mod,'ไม่มีข้อมูลหลัง filter'); return; }

  var colSt   = (document.getElementById('bio-st-'+mod)||{}).value||'';
  var colRep  = (document.getElementById('bio-rep-'+mod)||{}).value||'';
  var colDen  = (document.getElementById('bio-den-'+mod)||{}).value||'';
  var colLvl1 = (document.getElementById('bio-lvl1-'+mod)||{}).value||'';
  var colLvl2 = (document.getElementById('bio-lvl2-'+mod)||{}).value||'';
  var colCls  = (document.getElementById('bio-class-'+mod)||{}).value||'';
  var colYear = (document.getElementById('bio-year-'+mod)||{}).value||'';
  var colProj = (document.getElementById('bio-proj-'+mod)||{}).value||'';
  var colLoc  = (document.getElementById('bio-loc-'+mod)||{}).value||'';

  /* Available taxonomy levels */
  var levels = [];
  if(colLvl1) levels.push({key:'lvl1', col:colLvl1, label: mod==='larvae'?'Order': mod==='phyto'?'Division':'Phylum'});
  if(colCls)  levels.push({key:'class',col:colCls,  label:'Class'});
  if(colLvl2) levels.push({key:'lvl2', col:colLvl2, label: mod==='larvae'?'Family': mod==='phyto'?'Species':'Taxon'});

  if(!levels.length) { bioErr(mod,'กรุณาเลือก taxonomy columns ก่อน'); return; }

  /* Build station mean density per taxon (fill 0 for missing in replicate) */
  function getStMean(grpRows) {
    var pivot = {};
    grpRows.forEach(function(r){
      var st=String(r[colSt]||'').trim(), rep=String(r[colRep]||'').trim(),
          lv2=colLvl2?String(r[colLvl2]||'').trim():'?',
          den=parseFloat(r[colDen])||0;
      if(!st||!rep||den<0) return;
      if(!pivot[st]) pivot[st]={};
      if(!pivot[st][lv2]) pivot[st][lv2]={};
      pivot[st][lv2][rep]=(pivot[st][lv2][rep]||0)+den;
    });
    /* mean across reps per station per taxon */
    var stMean = {};
    Object.keys(pivot).forEach(function(st){
      stMean[st]={};
      Object.keys(pivot[st]).forEach(function(lv2){
        var reps=Object.values(pivot[st][lv2]);
        stMean[st][lv2]=reps.reduce(function(a,v){return a+v;},0)/reps.length;
      });
    });
    return stMean;
  }

  function getDominant(grpRows) {
    if(!colLvl2) return '';
    var stMean = getStMean(grpRows);
    /* location mean = mean across stations */
    var locSum={};
    Object.keys(stMean).forEach(function(st){
      Object.keys(stMean[st]).forEach(function(lv2){
        locSum[lv2]=(locSum[lv2]||0)+stMean[st][lv2];
      });
    });
    return bioDominant(locSum);
  }

  function getDomLevel(grpRows, levelCol) {
    if(!levelCol||!colLvl2) return '';
    var stMean = getStMean(grpRows);
    /* map lv2->level */
    var lv2ToLevel={};
    grpRows.forEach(function(r){
      var lv2=String(r[colLvl2]||'').trim(), lv=String(r[levelCol]||'').trim();
      if(lv2&&lv) lv2ToLevel[lv2]=lv;
    });
    var locLevelSum={};
    Object.keys(stMean).forEach(function(st){
      Object.keys(stMean[st]).forEach(function(lv2){
        var lv=lv2ToLevel[lv2]||'?';
        locLevelSum[lv]=(locLevelSum[lv]||0)+stMean[st][lv2];
      });
    });
    return bioDominant(locLevelSum);
  }

  function countUniq(grpRows, col) {
    return col ? new Set(grpRows.filter(function(r){var v=String(r[col]||'').trim();return v&&v.toLowerCase()!='nan'&&parseFloat(r[colDen]||0)>0;}).map(function(r){return String(r[col]||'').trim();})).size : 0;
  }

  function buildRow(keyObj, grpRows) {
    var row = Object.assign({}, keyObj);
    levels.forEach(function(lv){
      row['n_'+lv.label] = countUniq(grpRows, lv.col);
    });
    /* dominants */
    if(colLvl2) row['dom_'+levels[levels.length-1].label] = getDominant(grpRows);
    levels.slice(0,-1).forEach(function(lv){
      row['dom_'+lv.label] = getDomLevel(grpRows, lv.col);
    });
    return row;
  }

  /* Present rows only (density > 0) */
  var present = rows.filter(function(r){return parseFloat(r[colDen]||0)>0;});

  /* Group functions */
  function groupBy(data, cols) {
    var groups={};
    data.forEach(function(r){
      var key=cols.map(function(c){return String(r[c]||'').trim();}).join('|||');
      if(!groups[key]) groups[key]={key:{},rows:[]};
      cols.forEach(function(c){ groups[key].key[c]=String(r[c]||'').trim(); });
      groups[key].rows.push(r);
    });
    return groups;
  }

  function makeTable(groups, groupCols) {
    var rows2 = Object.values(groups).map(function(g){ return buildRow(g.key, g.rows); });
    if(!rows2.length) return null;
    var countCols = levels.map(function(lv){return 'n_'+lv.label;});
    var domCols   = levels.map(function(lv){return 'dom_'+lv.label;}).reverse();
    var allCols   = groupCols.concat(countCols).concat(domCols);
    return {cols: allCols, rows: rows2};
  }

  /* Build all group tables */
  var tables = {};
  var groupSets = [];
  if(colYear)                                         groupSets.push({label:'By Year',             cols:[colYear]});
  if(colProj)                                         groupSets.push({label:'By Project',          cols:[colProj]});
  if(colLoc)                                          groupSets.push({label:'By Location',         cols:[colLoc]});
  if(colYear&&colProj&&colLoc)                        groupSets.push({label:'By Year+Project+Loc', cols:[colYear,colProj,colLoc]});
  if(colYear&&colProj&&colLvl1)                       groupSets.push({label:'By Year+Project+'+levels[0].label, cols:[colYear,colProj,colLvl1]});

  groupSets.forEach(function(gs){
    var groups = groupBy(present, gs.cols);
    var tbl = makeTable(groups, gs.cols);
    if(tbl) tables[gs.label] = tbl;
  });

  /* Store for export */
  BIO[mod].tax = tables;

  /* Render */
  var div = document.getElementById('bio-taxsummary-'+mod);
  div.innerHTML = '';

  /* Filter selector */
  var filterHtml = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">';
  filterHtml += '<span style="font-size:12px;color:var(--text3)">แสดงตาราง:</span>';
  Object.keys(tables).forEach(function(lbl,i){
    filterHtml += '<button class="bio-btn-outline'+(i===0?' bio-tax-active':'')+'" style="font-size:11px;padding:4px 10px" onclick="bioShowTaxTable(\''+mod+'\',\''+lbl+'\',this)">'+lbl+'</button>';
  });
  filterHtml += '<button class="bio-btn-outline" style="font-size:11px;padding:4px 10px;margin-left:auto" onclick="bioExportTax(\''+mod+'\')">Export Excel</button>';
  filterHtml += '</div>';
  filterHtml += '<div id="bio-tax-tbl-'+mod+'"></div>';
  div.innerHTML = filterHtml;

  if(Object.keys(tables).length) bioShowTaxTable(mod, Object.keys(tables)[0], div.querySelector('.bio-tax-active'));
}

function bioShowTaxTable(mod, lbl, btn) {
  /* highlight active button */
  var div = document.getElementById('bio-taxsummary-'+mod);
  div.querySelectorAll('.bio-btn-outline').forEach(function(b){b.classList.remove('bio-tax-active');b.style.background='';b.style.color='';});
  if(btn){btn.style.background='var(--bio-l)';btn.style.color='var(--bio-c)';}

  var tbl = BIO[mod].tax[lbl];
  if(!tbl){ document.getElementById('bio-tax-tbl-'+mod).innerHTML='<p style="color:var(--text3);font-size:12px">ไม่มีข้อมูล</p>'; return; }

  var h = '<div class="bio-result-title">'+lbl+'</div><div class="bio-tbl-wrap"><table>';
  h += '<thead><tr>'+tbl.cols.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr></thead><tbody>';
  tbl.rows.sort(function(a,b){
    var ka=tbl.cols.map(function(c){return String(a[c]||'');}).join('|');
    var kb=tbl.cols.map(function(c){return String(b[c]||'');}).join('|');
    return ka.localeCompare(kb);
  }).forEach(function(row){
    h += '<tr>'+tbl.cols.map(function(c){
      var v=row[c]!=null?row[c]:'';
      var isNum = String(c).startsWith('n_');
      return '<td'+(isNum?' style="font-weight:600;color:var(--navy)"':'')+'>'+v+'</td>';
    }).join('')+'</tr>';
  });
  h += '</tbody></table></div>';
  document.getElementById('bio-tax-tbl-'+mod).innerHTML = h;
}

function bioExportTax(mod) {
  var tax = BIO[mod].tax;
  if(!tax||!Object.keys(tax).length){ bioErr(mod,'กด Calculate ก่อนครับ'); return; }
  var wb = XLSX.utils.book_new();
  Object.keys(tax).forEach(function(lbl){
    var tbl = tax[lbl];
    var data = [tbl.cols].concat(tbl.rows.map(function(row){ return tbl.cols.map(function(c){return row[c]!=null?row[c]:'';});}));
    var ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, lbl.substring(0,31));
  });
  XLSX.writeFile(wb, bioFname(mod)+'_TaxSummary_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

/* Update bioCalculate to also run taxonomy summary */
var _origBioCalc = bioCalculate;
bioCalculate = function(mod) {
  _origBioCalc(mod);
  bioTaxSummary(mod);
};

/* === EXCEL TEMPLATE DOWNLOAD === */
/* Unified "EcoData" header — matches the lab's real data files, same
   30 columns across all 4 Bio modules (Benthos/Phyto/Zoo/Larvae) */
var BIO_ECODATA_HEADERS = [
  'No','Year','Project name','Field','Offshore Petroleum Phase','Report Type','Sampling Type',
  'Location','Station name','X_ind_Propose','Y_ind_Propose','X_ind_Actual','Y_ind_Actual',
  'Different Distance_(P/A)','Distance from Location','Depth','Replication','Water Level (Phytoplankton)',
  'Taxa_Group','Phylum','Class','Subclass','Order','Suborder','Family','Genus','species',
  'Density','Unit','Remark'
];

function bioDownloadTemplate(mod) {
  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet([BIO_ECODATA_HEADERS]);
  ws['!cols'] = BIO_ECODATA_HEADERS.map(function(){return {wch:16};});
  XLSX.utils.book_append_sheet(wb, ws, 'EcoData');
  XLSX.writeFile(wb, bioFname(mod)+'_Template.xlsx');
}

/* === THEME TOGGLE === */

var BIO_DEMO=(function(){
  /* ── shared taxa pools ── */
  var BENTHOS_TAXA=[
    {Phylum:'Polychaeta',  Taxon:'Capitella capitata'},
    {Phylum:'Polychaeta',  Taxon:'Nereis diversicolor'},
    {Phylum:'Polychaeta',  Taxon:'Polydora sp.'},
    {Phylum:'Polychaeta',  Taxon:'Prionospio sp.'},
    {Phylum:'Polychaeta',  Taxon:'Glycera sp.'},
    {Phylum:'Crustacea',   Taxon:'Ampelisca sp.'},
    {Phylum:'Crustacea',   Taxon:'Corophium sp.'},
    {Phylum:'Crustacea',   Taxon:'Diastylis sp.'},
    {Phylum:'Mollusca',    Taxon:'Tellina sp.'},
    {Phylum:'Mollusca',    Taxon:'Nucula sp.'},
    {Phylum:'Mollusca',    Taxon:'Macoma sp.'},
    {Phylum:'Echinodermata',Taxon:'Amphiura sp.'},
  ];
  var PHYTO_TAXA=[
    {Division:'Bacillariophyta', Class:'Bacillariophyceae', Species:'Chaetoceros sp.'},
    {Division:'Bacillariophyta', Class:'Bacillariophyceae', Species:'Skeletonema sp.'},
    {Division:'Bacillariophyta', Class:'Bacillariophyceae', Species:'Nitzschia sp.'},
    {Division:'Bacillariophyta', Class:'Bacillariophyceae', Species:'Coscinodiscus sp.'},
    {Division:'Bacillariophyta', Class:'Bacillariophyceae', Species:'Rhizosolenia sp.'},
    {Division:'Dinoflagellata',  Class:'Dinophyceae',       Species:'Ceratium sp.'},
    {Division:'Dinoflagellata',  Class:'Dinophyceae',       Species:'Noctiluca sp.'},
    {Division:'Dinoflagellata',  Class:'Dinophyceae',       Species:'Protoperidinium sp.'},
    {Division:'Cyanophyta',      Class:'Cyanophyceae',      Species:'Trichodesmium sp.'},
  ];
  var ZOO_TAXA=[
    {Phylum:'Copepoda',    Taxon:'Acartia sp.'},
    {Phylum:'Copepoda',    Taxon:'Paracalanus sp.'},
    {Phylum:'Copepoda',    Taxon:'Temora sp.'},
    {Phylum:'Copepoda',    Taxon:'Oncaea sp.'},
    {Phylum:'Chaetognatha',Taxon:'Sagitta sp.'},
    {Phylum:'Medusozoa',   Taxon:'Aurelia sp.'},
    {Phylum:'Euphausiacea',Taxon:'Euphausia sp.'},
    {Phylum:'Ostracoda',   Taxon:'Cypridina sp.'},
  ];
  var LARVAE_TAXA=[
    {Order:'Decapoda',   Family:'Penaeidae'},
    {Order:'Decapoda',   Family:'Sergestidae'},
    {Order:'Decapoda',   Family:'Portunidae'},
    {Order:'Mysidacea',  Family:'Mysidae'},
    {Order:'Amphipoda',  Family:'Gammaridae'},
    {Order:'Clupeiformes',Family:'Clupeidae'},
    {Order:'Perciformes', Family:'Sciaenidae'},
  ];

  var LOCS=['Loc-A','Loc-B'];
  var STS={
    'Loc-A':['ST-A01','ST-A02','ST-A03','ST-A04','ST-A05'],
    'Loc-B':['ST-B01','ST-B02','ST-B03','ST-B04','ST-B05'],
  };
  var YEARS=[2020,2021,2022,2023];
  var REPS=['1','2','3'];
  var ZONES=['Surface','Euphotic'];

  /* seed-based density variation per year/station */
  function d(base, yr, st, taxa){
    var s=(yr*31+st.charCodeAt(st.length-1)*17+taxa.charCodeAt(0)*7)%100;
    return Math.max(5, Math.round(base*(0.65+s/100)));
  }

  var benthos=[], phyto=[], zoo=[], larvae=[];

  LOCS.forEach(function(loc){
    STS[loc].forEach(function(st){
      YEARS.forEach(function(yr){
        REPS.forEach(function(rep){
          /* benthos: 6-9 taxa per replicate, vary by yr */
          var nTaxa=6+Math.abs((yr-2020+parseInt(st.slice(-2)))%4);
          BENTHOS_TAXA.slice(0,nTaxa).forEach(function(tx){
            var base=tx.Phylum==='Polychaeta'?100:tx.Phylum==='Crustacea'?55:35;
            benthos.push({Year:String(yr),Project:'EIA-Demo',Location:loc,Station:st,Replicate:rep,
              Phylum:tx.Phylum,Taxon:tx.Taxon,Density:d(base,yr,st,tx.Taxon)});
          });
          /* zoo: 4-6 taxa */
          var nZoo=4+((yr+parseInt(rep))%3);
          ZOO_TAXA.slice(0,nZoo).forEach(function(tx){
            var base=tx.Phylum==='Copepoda'?700:tx.Phylum==='Chaetognatha'?180:120;
            zoo.push({Year:String(yr),Project:'EIA-Demo',Location:loc,Station:st,Replicate:rep,
              Phylum:tx.Phylum,Taxon:tx.Taxon,Density:d(base,yr,st,tx.Taxon)});
          });
          /* larvae: 3-5 taxa */
          var nLarv=3+((yr+parseInt(st.slice(-2)))%3);
          LARVAE_TAXA.slice(0,nLarv).forEach(function(tx){
            var base=tx.Order==='Decapoda'?300:tx.Order==='Mysidacea'?100:80;
            larvae.push({Year:String(yr),Project:'EIA-Demo',Location:loc,Station:st,Replicate:rep,
              Order:tx.Order,Family:tx.Family,Density:d(base,yr,st,tx.Family)});
          });
        });
        /* phyto: 2 zones × 2 reps × 5-7 species */
        ZONES.forEach(function(zone){
          ['1','2'].forEach(function(rep){
            var nSp=5+((yr+parseInt(st.slice(-2))+ZONES.indexOf(zone))%3);
            PHYTO_TAXA.slice(0,nSp).forEach(function(tx){
              var base=zone==='Surface'?(tx.Division==='Bacillariophyta'?2000:300):(tx.Division==='Bacillariophyta'?1000:180);
              phyto.push({Year:String(yr),Project:'EIA-Demo',Location:loc,Station:st,Replicate:rep,Zone:zone,
                Division:tx.Division,Class:tx.Class,Species:tx.Species,Density:d(base,yr,st,tx.Species)});
            });
          });
        });
      });
    });
  });

  return {benthos:benthos, phyto:phyto, zoo:zoo, larvae:larvae};
})();


function initBioModule(mod) {
  var pane = document.getElementById('bio-pane-'+mod);
  if(!pane) return;
  pane.dataset.built = '1';
  var cfg = BIO_CFG[mod];
  var lvl1Label = mod==='larvae'?'Order':(mod==='phyto'?'Division':'Phylum');
  var lvl2Label = mod==='larvae'?'Family':(mod==='phyto'?'Species':'Taxon');
  var h = [];

  /* Title */
  h.push('<div style="font-size:15px;font-weight:800;color:var(--bio-c);margin-bottom:16px">'+cfg.title+'</div>');

  /* Upload + buttons row */
  h.push('<div style="display:flex;align-items:stretch;gap:10px;margin-bottom:12px">');
  h.push('  <div class="bio-upload" style="flex:1;min-height:64px;cursor:pointer" onclick="var f=document.getElementById(\'bio-file-'+mod+'\');f.value=\'\';f.click()">');
  h.push('    <input type="file" id="bio-file-'+mod+'" accept=".xlsx,.xls" onchange="bioLoadFile(\''+mod+'\',this)">');
  h.push('    <div class="bio-upload-lbl">Click to upload Excel (.xlsx)</div>');
  h.push('    <div class="bio-upload-sub">Long format — 1 row per specimen</div>');
  h.push('  </div>');
  h.push('  <div style="display:flex;flex-direction:column;gap:8px;justify-content:center;flex-shrink:0">');
  h.push('    <button class="bio-btn-outline" onclick="bioLoadDemo(\''+mod+'\')" style="white-space:nowrap">Load Demo</button>');
  h.push('    <button class="bio-btn-outline" onclick="bioDownloadTemplate(\''+mod+'\')" style="white-space:nowrap">Download Template</button>');
  h.push('  </div>');
  h.push('</div>');
  h.push('<div id="bio-fi-'+mod+'" style="display:none" class="bio-fi"></div>');
  h.push('<div id="bio-err-'+mod+'" style="display:none" class="bio-err"></div>');

  /* Mapping */
  h.push('<div id="bio-mapping-'+mod+'" style="display:none">');

  /* Meta columns */
  h.push('  <div class="bio-section">Meta Columns</div>');
  h.push('  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;margin-bottom:18px">');
  h.push('    <div class="bio-field"><label>Year</label><select id="bio-year-'+mod+'"><option value="">(none)</option></select></div>');
  h.push('    <div class="bio-field"><label>Project</label><select id="bio-proj-'+mod+'"><option value="">(none)</option></select></div>');
  h.push('    <div class="bio-field"><label>Location</label><select id="bio-loc-'+mod+'"><option value="">(none)</option></select></div>');
  if(cfg.hasZone) h.push('    <div class="bio-field"><label>Zone *</label><select id="bio-zone-'+mod+'"><option value="">(none)</option></select></div>');
  h.push('    <div class="bio-field"><label>Station *</label><select id="bio-st-'+mod+'"></select></div>');
  h.push('    <div class="bio-field"><label>Replicate *</label><select id="bio-rep-'+mod+'"></select></div>');
  h.push('    <div class="bio-field"><label>Density *</label><select id="bio-den-'+mod+'"></select></div>');
  h.push('  </div>');

  /* Taxonomy columns */
  h.push('  <div class="bio-section">Taxonomy Columns</div>');
  h.push('  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;margin-bottom:18px">');
  h.push('    <div class="bio-field"><label>'+lvl1Label+' *</label><select id="bio-lvl1-'+mod+'"><option value="">(none)</option></select></div>');
  h.push('    <div class="bio-field"><label>Class</label><select id="bio-class-'+mod+'"><option value="">(none)</option></select></div>');
  if(mod!=='phyto'&&mod!=='larvae'){
    h.push('    <div class="bio-field"><label>Order</label><select id="bio-order-'+mod+'"><option value="">(none)</option></select></div>');
    h.push('    <div class="bio-field"><label>Family</label><select id="bio-family-'+mod+'"><option value="">(none)</option></select></div>');
    h.push('    <div class="bio-field"><label>Genus</label><select id="bio-genus-'+mod+'"><option value="">(none)</option></select></div>');
  }
  h.push('    <div class="bio-field"><label>'+lvl2Label+' *</label><select id="bio-lvl2-'+mod+'"><option value="">(none)</option></select></div>');
  h.push('  </div>');

  /* Filter */
  h.push('  <div class="bio-section">Filter</div>');
  h.push('  <div id="bio-filters-'+mod+'" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px"></div>');

  /* Replicate */
  h.push('  <div class="bio-section">Replicate</div>');
  h.push('  <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:18px">');
  h.push('    <div class="bio-radio-group">');
  h.push('      <label><input type="radio" name="bio-rep-mode-'+mod+'" value="all" checked onchange="bioRepChange(\''+mod+'\')"> All</label>');
  h.push('      <label><input type="radio" name="bio-rep-mode-'+mod+'" value="n" onchange="bioRepChange(\''+mod+'\')"> Select n</label>');
  h.push('      <label><input type="radio" name="bio-rep-mode-'+mod+'" value="pick" onchange="bioRepChange(\''+mod+'\')"> Pick</label>');
  h.push('    </div>');
  h.push('    <div id="bio-rep-ctrl-'+mod+'"></div>');
  h.push('  </div>');

  /* Action buttons */
  h.push('  <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:14px;border-top:1px solid var(--border)">');
  h.push('    <button class="bio-btn" onclick="bioCalculate(\''+mod+'\')">Calculate</button>');
  if(mod==='benthos'||mod==='phyto') h.push('    <button class="bio-btn-outline" onclick="bioCalculateByRep(\''+mod+'\')" style="border-color:var(--navy);color:var(--navy)">Calculate by Rep</button>');
  h.push('    <div class="bio-export-wrap" style="position:relative;display:inline-block">');
  h.push('      <button class="bio-btn-outline" onclick="bioToggleExportMenu(\''+mod+'\')" style="display:flex;align-items:center;gap:6px">Export <span style="font-size:10px">▼</span></button>');
  h.push('      <div id="bio-export-menu-'+mod+'" style="display:none;position:absolute;top:100%;left:0;background:var(--white);border:1px solid var(--border);border-radius:var(--rs);box-shadow:var(--sh-l);z-index:100;min-width:210px;padding:4px 0">');
  h.push('        <div class="bio-export-item" onclick="bioExport(\''+mod+'\');bioToggleExportMenu(\''+mod+'\')" style="padding:8px 14px;cursor:pointer;font-size:12px">Export Calculate (.xlsx)</div>');
  if(mod==='benthos'||mod==='phyto') h.push('        <div class="bio-export-item" onclick="bioExportByRep(\''+mod+'\');bioToggleExportMenu(\''+mod+'\')" style="padding:8px 14px;cursor:pointer;font-size:12px">Export by Rep (.xlsx)</div>');
  h.push('        <div class="bio-export-item" onclick="bioExportTax(\''+mod+'\');bioToggleExportMenu(\''+mod+'\')" style="padding:8px 14px;cursor:pointer;font-size:12px">Export Summary (.xlsx)</div>');
  if(mod==='benthos'||mod==='phyto'){
    h.push('        <div class="bio-export-item" onclick="bioExportLongByRep(\''+mod+'\');bioToggleExportMenu(\''+mod+'\')" style="padding:8px 14px;cursor:pointer;font-size:12px">Export Long Format (.xlsx)</div>');
  } else {
    h.push('        <div class="bio-export-item" onclick="bioExportLongMean(\''+mod+'\');bioToggleExportMenu(\''+mod+'\')" style="padding:8px 14px;cursor:pointer;font-size:12px">Export Long Format (.xlsx)</div>');
  }
  h.push('      </div>');
  h.push('    </div>');
  h.push('  </div>');
  h.push('</div>');

  /* Results sub-tabs */
  h.push('<div style="display:flex;gap:0;margin-top:20px;border-bottom:1.5px solid var(--border)">');
  h.push('  <button class="bio-sub-btn active" id="bio-sub-calc-'+mod+'" onclick="bioSubTab(\''+mod+'\',\'calc\',this)">Calculate</button>');
  h.push('  <button class="bio-sub-btn" id="bio-sub-tax-'+mod+'" onclick="bioSubTab(\''+mod+'\',\'tax\',this)">Taxonomy Summary</button>');
  if(mod==='benthos'||mod==='phyto') h.push('  <button class="bio-sub-btn" id="bio-sub-rep-'+mod+'" onclick="bioSubTab(\''+mod+'\',\'rep\',this)">By Replicate</button>');
  h.push('</div>');
  h.push('<div id="bio-results-'+mod+'" class="bio-result"></div>');
  h.push('<div id="bio-taxsummary-'+mod+'" class="bio-result" style="display:none"></div>');
  h.push('<div id="bio-byrep-'+mod+'" class="bio-result" style="display:none"></div>');

  pane.innerHTML = h.join('');
}


/* ── Load file ── */

function bioLoadFile(mod, input) {
  var file = input.files[0];
  if(!file) return;
  input.value = '';
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb = XLSX.read(e.target.result, {type:'array'});
      BIO[mod]._wb = wb;
      BIO[mod].filename = file.name;
      if(wb.SheetNames.length === 1){
        bioLoadSheet(mod, wb.SheetNames[0]);
      } else {
        /* Show sheet selector */
        var errEl = document.getElementById('bio-err-'+mod);
        var fiEl  = document.getElementById('bio-fi-'+mod);
        fiEl.style.display = 'none';
        errEl.style.display = 'none';
        var existing = document.getElementById('bio-sheet-sel-'+mod);
        if(existing) existing.remove();
        var div = document.createElement('div');
        div.id = 'bio-sheet-sel-'+mod;
        div.style = 'margin:8px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap';
        div.innerHTML = '<span style="font-size:12px;color:var(--text3)">เลือก Sheet:</span>'
          + '<select id="bio-sheet-dd-'+mod+'" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:var(--rs);background:var(--white);color:var(--text)"></select>'
          + '<button class="bio-btn-outline" style="font-size:12px;padding:4px 10px" onclick="bioConfirmSheet(\'' + mod + '\')">โหลด</button>';
        /* Sheet names come from the uploaded file — build options via DOM
           API so a name containing a quote can't corrupt the value attr */
        var sheetSel = div.querySelector('#bio-sheet-dd-'+mod);
        wb.SheetNames.forEach(function(s){
          var opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s;
          sheetSel.appendChild(opt);
        });
        var mapping = document.getElementById('bio-mapping-'+mod);
        mapping.parentNode.insertBefore(div, mapping);
      }
    } catch(ex) { bioErr(mod,'อ่านไฟล์ไม่ได้: '+ex.message); }
  };
  reader.readAsArrayBuffer(file);
}

function bioConfirmSheet(mod) {
  var dd = document.getElementById('bio-sheet-dd-'+mod);
  if(!dd) return;
  var sheetName = dd.value;
  var sel = document.getElementById('bio-sheet-sel-'+mod);
  if(sel) sel.remove();
  bioLoadSheet(mod, sheetName);
}

function bioLoadSheet(mod, sheetName) {
  try {
    var wb = BIO[mod]._wb;
    var ws = wb.Sheets[sheetName];
    var rows = XLSX.utils.sheet_to_json(ws, {defval:''});
    if(!rows.length) { bioErr(mod,'ไม่พบข้อมูลในไฟล์'); return; }
    BIO[mod].raw = rows;
    document.getElementById('bio-fi-'+mod).textContent = '✓ '+BIO[mod].filename+' ['+sheetName+'] — '+rows.length.toLocaleString()+' rows';
    document.getElementById('bio-fi-'+mod).style.display = 'block';
    document.getElementById('bio-err-'+mod).style.display = 'none';
    bioPopulateCols(mod, Object.keys(rows[0]));
    document.getElementById('bio-mapping-'+mod).style.display = 'block';
    bioAutoDetect(mod, Object.keys(rows[0]));
    bioUpdateFilters(mod);
  } catch(ex) { bioErr(mod,'อ่านไฟล์ไม่ได้: '+ex.message); }
}

function bioErr(mod, msg) {
  var el = document.getElementById('bio-err-'+mod);
  if(el){ el.textContent = msg; el.style.display='block'; }
}

function bioPopulateCols(mod, cols) {
  var ids = ['year','proj','loc','st','rep','den','lvl1','lvl2','class','order','family','genus'];
  if(BIO_CFG[mod].hasZone) ids.push('zone');
  ids.forEach(function(k){
    var sel = document.getElementById('bio-'+k+'-'+mod);
    if(!sel) return;
    var hasNone = sel.options[0] && sel.options[0].value==='';
    sel.innerHTML = '';
    if(hasNone){
      var noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '(none)';
      sel.appendChild(noneOpt);
    }
    /* Column headers come from the uploaded file — build options via DOM
       API so a header containing a quote can't corrupt the value attr */
    cols.forEach(function(c){
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
    sel.onchange = function(){ bioUpdateFilters(mod); };
  });
}

/* Exact column names from the standard EcoData template — tried before
   the fuzzy keyword search below so ambiguous fuzzy matches (e.g. every
   module's file has both "Phylum" and "Order" columns, but Larvae's
   lvl1 should be "Order") resolve correctly */
var BIO_EXACT_MAP = {
  year:'Year', proj:'Project name', loc:'Location', st:'Station name',
  rep:'Replication', den:'Density', class:'Class', order:'Order',
  family:'Family', genus:'Genus'
};
var BIO_EXACT_LVL = {
  benthos: { lvl1:'Phylum', lvl2:'species' },
  phyto:   { lvl1:'Phylum', lvl2:'species', zone:'Water Level (Phytoplankton)' },
  zoo:     { lvl1:'Phylum', lvl2:'species' },
  larvae:  { lvl1:'Order',  lvl2:'Family' }
};

function bioAutoDetect(mod, cols) {
  var map = {
    year:['year','ปี'], proj:['project','proj'], loc:['location','loc','บริเวณ'],
    zone:['zone','โซน'], st:['station','สถานี'], rep:['replic','ซ้ำ'],
    den:['density','ความหนาแน่น'], lvl1:['phylum','division','order','ไฟลัม'],
    lvl2:['taxon','species','specie','family','แท็กซอน'],
    class:['class','คลาส'], order:['order','ออเดอร์'], family:['family','แฟมิลี'], genus:['genus','จีนัส']
  };
  var exactLvl = BIO_EXACT_LVL[mod] || {};
  Object.keys(map).forEach(function(k){
    var sel = document.getElementById('bio-'+k+'-'+mod);
    if(!sel) return;
    var exactTarget = exactLvl[k] || BIO_EXACT_MAP[k];
    var found = exactTarget && cols.find(function(c){ return c.trim().toLowerCase() === exactTarget.toLowerCase(); });
    if(!found) found = cols.find(function(c){ return map[k].some(function(kw){ return c.toLowerCase().includes(kw); }); });
    if(found) sel.value = found;
  });
}

/* ── Filters ── */

function bioUpdateFilters(mod) {
  var raw = BIO[mod].raw;
  if(!raw) return;
  var filterDiv = document.getElementById('bio-filters-'+mod);
  if(!filterDiv) return;
  var yearCol = (document.getElementById('bio-year-'+mod)||{}).value||'';
  var projCol = (document.getElementById('bio-proj-'+mod)||{}).value||'';
  var locCol  = (document.getElementById('bio-loc-'+mod)||{}).value||'';
  filterDiv.innerHTML = '';
  var any = false;
  [[yearCol,'bio-f-year-'+mod,'Year'],[projCol,'bio-f-proj-'+mod,'Project'],[locCol,'bio-f-loc-'+mod,'Location']].forEach(function(triple){
    var col=triple[0],fid=triple[1],lbl=triple[2];
    if(!col) return;
    any = true;
    var vals = [...new Set(raw.map(function(r){return String(r[col]||'').trim();}).filter(Boolean))].sort();
    /* Build via DOM API (not string concat) so values containing quotes/
       special chars aren't corrupted, which was silently excluding all
       rows for that value (e.g. a project name with a " in it) */
    var field = document.createElement('div');
    field.className = 'bio-field';
    var label = document.createElement('label');
    label.textContent = lbl;
    var sel = document.createElement('select');
    sel.id = fid;
    sel.multiple = true;
    sel.style.height = '72px';
    sel.style.fontSize = '11px';
    vals.forEach(function(v){
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      opt.selected = true;
      sel.appendChild(opt);
    });
    field.appendChild(label);
    field.appendChild(sel);
    filterDiv.appendChild(field);
  });
  if(!any){
    var hint = document.createElement('span');
    hint.style.fontSize = '12px';
    hint.style.color = 'var(--text3)';
    hint.textContent = 'เลือก Year/Project/Location columns ก่อน';
    filterDiv.appendChild(hint);
  }
  bioUpdateRepOptions(mod);
}

function bioGetFilteredRows(mod) {
  var raw = BIO[mod].raw || [];
  var repCol = (document.getElementById('bio-rep-'+mod)||{}).value||'';
  var yearCol = (document.getElementById('bio-year-'+mod)||{}).value||'';
  var projCol = (document.getElementById('bio-proj-'+mod)||{}).value||'';
  var locCol  = (document.getElementById('bio-loc-'+mod)||{}).value||'';

  /* meta filters */
  function getSelected(id){
    var el=document.getElementById(id); if(!el) return null;
    return [...el.options].filter(function(o){return o.selected;}).map(function(o){return o.value;});
  }
  var yPick = getSelected('bio-f-year-'+mod);
  var pPick = getSelected('bio-f-proj-'+mod);
  var lPick = getSelected('bio-f-loc-'+mod);

  var rows = raw.filter(function(r){
    if(yearCol && yPick && !yPick.includes(String(r[yearCol]||'').trim())) return false;
    if(projCol && pPick && !pPick.includes(String(r[projCol]||'').trim())) return false;
    if(locCol  && lPick && !lPick.includes(String(r[locCol]||'').trim())) return false;
    return true;
  });

  /* rep filter */
  if(repCol){
    var mode = document.querySelector('input[name="bio-rep-mode-'+mod+'"]:checked');
    var modeVal = mode ? mode.value : 'all';
    if(modeVal==='n'){
      var nSlider = document.querySelector('#bio-rep-ctrl-'+mod+' input[type=range]');
      if(nSlider){
        var n = parseInt(nSlider.value);
        var allReps = [...new Set(rows.map(function(r){return String(r[repCol]||'').trim();}).filter(Boolean))].sort(function(a,b){return parseFloat(a)-parseFloat(b)||a.localeCompare(b);});
        var chosen = allReps.slice(0,n);
        rows = rows.filter(function(r){ return chosen.includes(String(r[repCol]||'').trim()); });
      }
    } else if(modeVal==='pick'){
      var el = document.getElementById('bio-rep-pick-'+mod);
      if(el){
        var picked = [...el.options].filter(function(o){return o.selected;}).map(function(o){return o.value;});
        rows = rows.filter(function(r){ return picked.includes(String(r[repCol]||'').trim()); });
      }
    }
  }
  return rows;
}

/* ── Calculation helpers ── */

function bioRepChange(mod) {
  var mode = document.querySelector('input[name="bio-rep-mode-'+mod+'"]:checked');
  if(!mode) return;
  var ctrl = document.getElementById('bio-rep-ctrl-'+mod);
  var raw = BIO[mod].raw;
  var repCol = (document.getElementById('bio-rep-'+mod)||{}).value||'';
  if(!raw||!repCol){ ctrl.innerHTML=''; return; }
  var repVals = [...new Set(raw.map(function(r){return String(r[repCol]||'').trim();}).filter(Boolean))].sort(function(a,b){return parseFloat(a)-parseFloat(b)||a.localeCompare(b);});
  if(mode.value==='n'){
    ctrl.innerHTML = '<input type="range" min="1" max="'+repVals.length+'" value="'+repVals.length+'" style="width:120px" oninput="this.nextElementSibling.textContent=this.value"> <span>'+repVals.length+'</span>';
  } else if(mode.value==='pick'){
    ctrl.innerHTML = '';
    var pickSel = document.createElement('select');
    pickSel.multiple = true;
    pickSel.style.height = '64px';
    pickSel.style.fontSize = '11px';
    pickSel.id = 'bio-rep-pick-'+mod;
    /* Replicate values come from the uploaded file — build options via
       DOM API so a value containing a quote can't corrupt the value attr */
    repVals.forEach(function(v){
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      opt.selected = true;
      pickSel.appendChild(opt);
    });
    ctrl.appendChild(pickSel);
  } else {
    ctrl.innerHTML = '<span style="font-size:11px;color:var(--text3)">All replicates</span>';
  }
}

function bioUpdateRepOptions(mod) { bioRepChange(mod); }

function switchBioTab(mod, btn) {
  var BIO_ACTIVE = mod;
  document.querySelectorAll('#page-bio .bio-tab-btn').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  document.querySelectorAll('#page-bio .bio-pane').forEach(function(p){p.classList.remove('active');});
  var pane = document.getElementById('bio-pane-'+mod);
  if(pane) pane.classList.add('active');
  if(!pane.dataset.built){
    if(mod==='method') initBioMethod();
    else initBioModule(mod);
  }
}

/* ── Module config ── */
function bioCalculateByRep(mod) {
  var rows = bioGetFilteredRows(mod);
  if(!rows.length){ bioErr(mod,'ไม่มีข้อมูลหลัง filter'); return; }

  var colSt   = (document.getElementById('bio-st-'+mod)||{}).value||'';
  var colRep  = (document.getElementById('bio-rep-'+mod)||{}).value||'';
  var colDen  = (document.getElementById('bio-den-'+mod)||{}).value||'';
  var colLvl1 = (document.getElementById('bio-lvl1-'+mod)||{}).value||'';
  var colLvl2 = (document.getElementById('bio-lvl2-'+mod)||{}).value||'';
  var colYear = (document.getElementById('bio-year-'+mod)||{}).value||'';
  var colProj = (document.getElementById('bio-proj-'+mod)||{}).value||'';
  var colLoc  = (document.getElementById('bio-loc-'+mod)||{}).value||'';
  var colZone = (document.getElementById('bio-zone-'+mod)||{}).value||'';

  if(!colSt||!colRep||!colDen||!colLvl1||!colLvl2){
    bioErr(mod,'กรุณาเลือก Station, Replicate, Density, '+BIO_CFG[mod].lvl1+', '+BIO_CFG[mod].lvl2);
    return;
  }

  /* Get meta key */
  function getMeta(r){
    var parts=[];
    if(colYear) parts.push(String(r[colYear]||'').trim());
    if(colProj) parts.push(String(r[colProj]||'').trim());
    if(colLoc)  parts.push(String(r[colLoc]||'').trim());
    if(colZone) parts.push(String(r[colZone]||'').trim());
    return parts.join('||') || 'ALL';
  }

  /* Group by meta */
  var byMeta = {};
  rows.forEach(function(r){
    var den = parseFloat(r[colDen])||0;
    if(den<0) return;
    var key = getMeta(r);
    if(!byMeta[key]) byMeta[key]={rows:[]};
    byMeta[key].rows.push(r);
  });

  /* All lvl1s globally */
  var allLvl1s = [...new Set(rows.map(function(r){return String(r[colLvl1]||'').trim();}).filter(Boolean))].sort();

  var resultDiv = document.getElementById('bio-byrep-'+mod);
  resultDiv.innerHTML = '';

  Object.keys(byMeta).forEach(function(metaKey){
    var grpRows = byMeta[metaKey].rows;
    var stations = [...new Set(grpRows.map(function(r){return String(r[colSt]||'').trim();}))].sort();
    var reps = [...new Set(grpRows.map(function(r){return String(r[colRep]||'').trim();}))].sort();

    reps.forEach(function(rep){
      var repRows = grpRows.filter(function(r){return String(r[colRep]||'').trim()===rep;});

      /* Build pivot for this rep */
      var pivot = {};
      repRows.forEach(function(r){
        var st=String(r[colSt]||'').trim();
        var lv1=String(r[colLvl1]||'').trim();
        var lv2=String(r[colLvl2]||'').trim();
        var den=parseFloat(r[colDen])||0;
        if(!st||!lv1||!lv2||den<0) return;
        if(!pivot[st]) pivot[st]={};
        var k=lv1+'|||'+lv2;
        pivot[st][k]=(pivot[st][k]||0)+den;
      });

      /* Build table rows */
      var cols = stations.concat(['Total']);
      var rows2 = [];

      /* Number of taxon */
      rows2.push({label:'Number of '+BIO_CFG[mod].unit, vals:cols.map(function(){return '';}), sec:true});
      allLvl1s.forEach(function(lv1){
        var vals = stations.map(function(st){
          if(!pivot[st]) return 0;
          return Object.keys(pivot[st]).filter(function(k){return k.startsWith(lv1+'|||')&&pivot[st][k]>0;}).length;
        });
        var total = new Set(repRows.filter(function(r){return String(r[colLvl1]||'').trim()===lv1&&parseFloat(r[colDen]||0)>0;}).map(function(r){return String(r[colLvl2]||'').trim();})).size;
        var prefix = mod==='phyto'?'Division: ':mod==='larvae'?'Order: ':'Phylum: ';
        rows2.push({label:'  '+prefix+lv1, vals:vals.concat([total]), sec:false});
      });
      var totalTaxaSt = stations.map(function(st){
        if(!pivot[st]) return 0;
        return new Set(Object.keys(pivot[st]).filter(function(k){return pivot[st][k]>0;}).map(function(k){return k.split('|||')[1];})).size;
      });
      var totalTaxaAll = new Set(repRows.filter(function(r){return parseFloat(r[colDen]||0)>0;}).map(function(r){return String(r[colLvl2]||'').trim();})).size;
      rows2.push({label:'  Total', vals:totalTaxaSt.concat([totalTaxaAll]), sec:false, bold:true});
      rows2.push({label:'', vals:cols.map(function(){return '';}), sec:false});

      /* Density */
      rows2.push({label:'Density', vals:cols.map(function(){return '';}), sec:true});
      allLvl1s.forEach(function(lv1){
        var vals = stations.map(function(st){
          if(!pivot[st]) return 0;
          var sum = Object.keys(pivot[st]).filter(function(k){return k.startsWith(lv1+'|||');}).reduce(function(a,k){return a+pivot[st][k];},0);
          return bioRoundup0(sum);
        });
        var total = bioRoundup0(vals.reduce(function(a,v){return a+v;},0)/stations.length);
        var prefix = mod==='phyto'?'Division: ':mod==='larvae'?'Order: ':'Phylum: ';
        rows2.push({label:'  '+prefix+lv1, vals:vals.concat([total]), sec:false});
      });
      var totalDenSt = stations.map(function(st){
        if(!pivot[st]) return 0;
        return bioRoundup0(Object.values(pivot[st]).reduce(function(a,v){return a+v;},0));
      });
      var totalDenAll = bioRoundup0(totalDenSt.reduce(function(a,v){return a+v;},0)/stations.length);
      rows2.push({label:'  Total density', vals:totalDenSt.concat([totalDenAll]), sec:false, bold:true});
      rows2.push({label:'', vals:cols.map(function(){return '';}), sec:false});

      /* Indices per station for this rep */
      rows2.push({label:'Indices', vals:cols.map(function(){return '';}), sec:true});
      var stIdx = {};
      stations.forEach(function(st){
        var stRepRows = repRows.filter(function(r){return String(r[colSt]||'').trim()===st;});
        var dens = stRepRows.map(function(r){return parseFloat(r[colDen])||0;});
        var grps = stRepRows.map(function(r){return String(r[colLvl1]||'').trim();});
        stIdx[st] = (mod==='phyto') ? bioCalcIndicesPhyto(dens) : bioCalcIndices(dens, grps);
      });
      function meanRepArr(arr){ var v=arr.filter(function(x){return !isNaN(x);}); return v.length?v.reduce(function(a,b){return a+b;})/v.length:NaN; }
      [["  Diversity (H')",'H'],['  Richness','R'],['  Evenness','E']].forEach(function(pair){
        var lbl=pair[0], key=pair[1];
        var vals = stations.map(function(st){return bioF2(stIdx[st][key]);});
        var locVal = bioF2(meanRepArr(stations.map(function(st){return stIdx[st][key];})));
        rows2.push({label:lbl, vals:vals.concat([locVal]), sec:false});
      });
      rows2.push({label:'', vals:cols.map(function(){return '';}), sec:false});

      /* Dominant */
      var domVals = stations.map(function(st){
        var dm={};
        if(pivot[st]) Object.keys(pivot[st]).forEach(function(k){var lv2=k.split('|||')[1];dm[lv2]=(dm[lv2]||0)+pivot[st][k];});
        return bioDominant(dm);
      });
      var dmAll={};
      stations.forEach(function(st){if(pivot[st]) Object.keys(pivot[st]).forEach(function(k){var lv2=k.split('|||')[1];dmAll[lv2]=(dmAll[lv2]||0)+pivot[st][k];});});
      rows2.push({label:'Dominant '+BIO_CFG[mod].unit, vals:domVals.concat([bioDominant(dmAll)]), sec:false, bold:true});

      /* Render table */
      var metaParts = metaKey.split('||');
      var metaLabel = metaKey==='ALL' ? 'All Data' : metaParts.join(' | ');
      var tbl = '<div class="bio-result-title">'+metaLabel+' | Rep '+rep+'</div>';
      tbl += '<div class="bio-tbl-wrap"><table>';
      tbl += '<thead><tr><th style="text-align:left">Parameter</th>'+cols.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr></thead><tbody>';
      rows2.forEach(function(row){
        if(row.sec){
          tbl += '<tr><td class="sec-hd" colspan="'+(cols.length+1)+'">'+row.label+'</td></tr>';
        } else if(!row.label&&row.vals.every(function(v){return v==='';})){
          tbl += '<tr><td colspan="'+(cols.length+1)+'" style="height:4px;padding:0"></td></tr>';
        } else {
          var cls = row.bold?'style="font-weight:700"':'';
          tbl += '<tr><td class="row-hd" '+cls+'>'+row.label+'</td>'+row.vals.map(function(v){return '<td '+cls+'>'+v+'</td>';}).join('')+'</tr>';
        }
      });
      tbl += '</tbody></table></div>';
      resultDiv.innerHTML += tbl;
    });
  });

  /* Switch to By Replicate tab */
  var repBtn = document.getElementById('bio-sub-rep-'+mod);
  if(repBtn) bioSubTab(mod, 'rep', repBtn);
}

window.bioLoadDemo = bioLoadDemo;
window.bioDownloadTemplate = bioDownloadTemplate;
window.bioCalculate = bioCalculate;
window.bioExport = bioExport;
window.bioExportTax = bioExportTax;
window.bioSubTab = bioSubTab;
window.bioShowTaxTable = bioShowTaxTable;
window.switchBioTab = switchBioTab;
window.bioRepChange = bioRepChange;
window.bioLoadFile = bioLoadFile;
function bioExportByRep(mod) {
  var div = document.getElementById('bio-byrep-'+mod);
  if(!div||!div.innerHTML){ bioErr(mod,'กด Calculate by Rep ก่อนครับ'); return; }

  var wb = window.XLSX.utils.book_new();
  var tables = div.querySelectorAll('table');
  var titles = div.querySelectorAll('.bio-result-title');

  /* Group tables by location (meta key = everything except rep) */
  var sheetMap = {}; /* sheetName -> [[rows]] */
  tables.forEach(function(tbl, i){
    var title = titles[i] ? titles[i].textContent.trim() : ('Rep_'+i);
    /* title format: "2026 | EIA | Loc-A | Rep 1" — strip last " | Rep X" */
    var sheetName = title.replace(/\s*\|\s*Rep\s*\S+\s*$/,'').replace(/\s*\|\s*/g,'_').replace(/[\/:*?\[\]]/g,'_').substring(0,31) || 'Result';
    if(!sheetMap[sheetName]) sheetMap[sheetName] = [];

    /* Add title row */
    sheetMap[sheetName].push([title]);

    tbl.querySelectorAll('tr').forEach(function(tr){
      var row = [];
      tr.querySelectorAll('th,td').forEach(function(td){
        row.push(td.textContent.trim());
      });
      sheetMap[sheetName].push(row);
    });
    /* Add empty row between reps */
    sheetMap[sheetName].push([]);
  });

  Object.keys(sheetMap).forEach(function(sheetName){
    var ws = window.XLSX.utils.aoa_to_sheet(sheetMap[sheetName]);
    var origName = sheetName;
    var suffix = 1;
    while(wb.SheetNames && wb.SheetNames.indexOf(sheetName)>=0){
      sheetName = (origName.substring(0,28)+'_'+suffix).substring(0,31);
      suffix++;
    }
    window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  var fname = bioFname(mod)+'_ByRep_'+new Date().toISOString().slice(0,10)+'.xlsx';
  window.XLSX.writeFile(wb, fname);
}

function bioToggleExportMenu(mod) {
  var menu = document.getElementById('bio-export-menu-'+mod);
  if(!menu) return;
  var isOpen = menu.style.display !== 'none';
  document.querySelectorAll('[id^="bio-export-menu-"]').forEach(function(m){ m.style.display='none'; });
  if(!isOpen){
    menu.style.display = 'block';
    setTimeout(function(){
      document.addEventListener('click', function closeMenu(e){
        if(!e.target.closest('.bio-export-wrap')){
          menu.style.display='none';
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 10);
  }
}

function bioExportLong(mod) {
  var raw = BIO[mod].raw;
  if(!raw||!raw.length){ bioErr(mod,'กรุณา Upload ข้อมูลก่อนครับ'); return; }
  var wb = window.XLSX.utils.book_new();
  var ws = window.XLSX.utils.json_to_sheet(raw);
  window.XLSX.utils.book_append_sheet(wb, ws, 'Long Format');
  var fname = bioFname(mod)+'_LongFormat_'+new Date().toISOString().slice(0,10)+'.xlsx';
  window.XLSX.writeFile(wb, fname);
}

/* Meta columns to include in long format export */
var BIO_META_COLS = [
  'Year','Project name','Field','Offshore Petroleum Phase',
  'Report Type','Sampling Type','Location','Station name',
  'X_ind_Propose','Y_ind_Propose','X_ind_Actual','Y_ind_Actual',
  'Different Distance_(P/A)','Distance from Location','Depth',
  'Replication','Water Level (Phytoplankton)'
];

/* Also try alternate spellings — includes the short headers used by
   the built-in "Download Template" (Station/Project/Replicate) since
   they don't match the full official template's column names */
var BIO_META_COLS_ALT = {
  'Project name':  ['Project name','Project'],
  'Station name':  ['Station name','Station'],
  'Replication':   ['Replication','Replicate'],
  'X_ind_Propose': ['X_ind_Propose','X_Ind_Propose','X_ind_propose'],
  'Y_ind_Propose': ['Y_ind_Propose','Y_Ind_Propose','Y_ind_propose'],
  'X_ind_Actual':  ['X_ind_Actual','X_Ind_Actual'],
  'Y_ind_Actual':  ['Y_ind_Actual','Y_Ind_Actual'],
  'Different Distance_(P/A)': ['Different Distance_(P/A)','Different Distance (P/A)'],
  'Water Level (Phytoplankton)': ['Water Level (Phytoplankton)','Water Level(Phytoplankton)']
};

function bioGetMetaRow(mod, station, rep, year, zone) {
  var raw = BIO[mod].raw || [];
  var colSt   = (document.getElementById('bio-st-'+mod)||{}).value||'';
  var colRep  = (document.getElementById('bio-rep-'+mod)||{}).value||'';
  var colYear = (document.getElementById('bio-year-'+mod)||{}).value||'';
  var colZone = (document.getElementById('bio-zone-'+mod)||{}).value||'';
  /* Find first matching row */
  var match = raw.find(function(r){
    var stMatch   = !colSt   || String(r[colSt]||'').trim()   === String(station).trim();
    var repMatch  = !colRep  || String(r[colRep]||'').trim()  === String(rep).trim();
    var yrMatch   = !colYear || !year || String(r[colYear]||'').trim() === String(year).trim();
    var zoneMatch = !colZone || !zone || String(r[colZone]||'').trim() === String(zone).trim();
    return stMatch && repMatch && yrMatch && zoneMatch;
  }) || {};
  /* Build meta object */
  var meta = {};
  BIO_META_COLS.forEach(function(col){
    var val = match[col];
    if(val===undefined){
      /* Try alternate spellings */
      var alts = (BIO_META_COLS_ALT[col]||[]);
      for(var ai=0;ai<alts.length;ai++){
        if(match[alts[ai]]!==undefined){ val=match[alts[ai]]; break; }
      }
    }
    if(val===undefined){
      /* Try case-insensitive */
      var key = Object.keys(match).find(function(k){ return k.toLowerCase()===col.toLowerCase(); });
      val = key ? match[key] : '';
    }
    meta[col] = (val===null||val===undefined) ? '' : val;
  });
  /* Carried straight from the source row — callers fall back to a
     computed default if the source file left these blank */
  meta['Taxa_Group'] = (match['Taxa_Group']==null) ? '' : match['Taxa_Group'];
  meta['Unit']        = (match['Unit']==null) ? '' : match['Unit'];
  meta['Remark']       = (match['Remark']==null) ? '' : match['Remark'];
  return meta;
}

function bioExportLongByRep(mod) {
  var div = document.getElementById('bio-byrep-'+mod);
  if(!div||!div.innerHTML){ bioErr(mod,'กด Calculate by Rep ก่อนครับ'); return; }

  var colYear = (document.getElementById('bio-year-'+mod)||{}).value||'';
  var colProj = (document.getElementById('bio-proj-'+mod)||{}).value||'';
  var colLoc  = (document.getElementById('bio-loc-'+mod)||{}).value||'';
  var colSt   = (document.getElementById('bio-st-'+mod)||{}).value||'';
  var taxaGroupDefault = BIO_CFG[mod].title;
  var unitDenDefault = mod==='zoo' ? 'Individual/m3' : mod==='larvae' ? 'Individual/1000m3' : 'Individual/m2';

  var rows = [];

  /* Get all result titles - format: "Year | Project | Location | Rep X" */
  var titles = div.querySelectorAll('.bio-result-title');
  var tables = div.querySelectorAll('table');

  tables.forEach(function(tbl, i){
    var title = titles[i] ? titles[i].textContent.trim() : '';
    var parts = title.split('|').map(function(p){return p.trim();});
    /* parts: Year, Project, Location, [Zone,] Rep X */
    var year = parts[0]||'';
    var proj = parts[1]||'';
    var loc  = parts[2]||'';
    var repPart = parts[parts.length-1]||'';
    var rep = repPart.replace('Rep','').trim();

    /* Parse table rows */
    var inDensity = false;
    var inIndices = false;
    var stCols = [];
    var totalDenBySt = {};
    var totalTaxaBySt = {};
    var indexBySt = {};

    tbl.querySelectorAll('tr').forEach(function(tr, ri){
      var cells = Array.from(tr.querySelectorAll('th,td')).map(function(td){return td.textContent.trim();});
      if(!cells.length) return;

      if(ri===0){
        /* Header row - get station names */
        stCols = cells.slice(1, cells.length-1); /* exclude Parameter and Total/Mean */
        stCols.forEach(function(st){ totalDenBySt[st]=0; totalTaxaBySt[st]=0; indexBySt[st]={}; });
        return;
      }

      var label = cells[0];
      var vals  = cells.slice(1);

      if(label==='Density'||label.includes('NUMBER OF')||label.includes('Number of')){
        inDensity = label==='Density';
        inIndices = false;
        return;
      }
      if(label==='Indices'){ inIndices=true; inDensity=false; return; }
      if(label==='') return;

      /* Total density row */
      if(label==='Total density'||label==='  Total density'){
        stCols.forEach(function(st,si){
          totalDenBySt[st] = parseFloat(vals[si])||0;
        });
        return;
      }

      /* Total taxa row */
      if(label==='  Total'||label==='Total'){
        stCols.forEach(function(st,si){
          totalTaxaBySt[st] = parseFloat(vals[si])||0;
        });
        return;
      }

      /* Index rows */
      if(inIndices){
        var idxName = '';
        if(label.includes("Diversity (H')")|| label.includes("Diversity")) idxName = 'Shannon diversity index';
        else if(label.includes('Evenness')) idxName = 'Evenness index';
        else if(label.includes('Richness')) idxName = 'Richness index';
        if(idxName){
          stCols.forEach(function(st,si){
            indexBySt[st][idxName] = vals[si]!==''?vals[si]:'-';
          });
        }
      }
    });

    /* Build output rows per station */
    stCols.forEach(function(st){
      var meta = bioGetMetaRow(mod, st, rep, year, parts[3]||'');
      var baseRow = Object.assign({}, meta, {'Taxa_Group': meta['Taxa_Group'] || taxaGroupDefault});
      rows.push(Object.assign({}, baseRow, {'Parameter':'Total number of species','Value':totalTaxaBySt[st]||0,'Unit':'Taxa'}));
      rows.push(Object.assign({}, baseRow, {'Parameter':'Total density','Value':totalDenBySt[st]||0,'Unit':meta['Unit']||unitDenDefault}));
      rows.push(Object.assign({}, baseRow, {'Parameter':'Shannon diversity index','Value':indexBySt[st]['Shannon diversity index']||'-','Unit':'-'}));
      rows.push(Object.assign({}, baseRow, {'Parameter':'Evenness index','Value':indexBySt[st]['Evenness index']||'-','Unit':'-'}));
      rows.push(Object.assign({}, baseRow, {'Parameter':'Richness index','Value':indexBySt[st]['Richness index']||'-','Unit':'-'}));
    });
  });

  if(!rows.length){ bioErr(mod,'ไม่มีข้อมูล'); return; }

  var wb = window.XLSX.utils.book_new();
  var ws = window.XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = BIO_META_COLS.concat(['Taxa_Group','Unit','Remark','Parameter','Value']).map(function(){return {wch:16};});
  window.XLSX.utils.book_append_sheet(wb, ws, 'Long Format by Rep');
  var fname = bioFname(mod)+'_LongFormat_ByRep_'+new Date().toISOString().slice(0,10)+'.xlsx';
  window.XLSX.writeFile(wb, fname);
}

function bioExportLongMean(mod) {
  var calc = BIO[mod].calc;
  if(!calc||!Object.keys(calc).length){ bioErr(mod,'กด Calculate ก่อนครับ'); return; }

  var taxaGroupDefault = BIO_CFG[mod].title;
  var unitDenDefault = mod==='zoo' ? 'Individual/m3' : mod==='larvae' ? 'Individual/1000m3' : 'Individual/m2';
  var rows = [];

  Object.keys(calc).forEach(function(metaKey){
    var data = calc[metaKey];
    var parts = metaKey.split('||');
    var year = parts[0]||'';
    var proj = parts[1]||'';
    var loc  = parts[2]||'';

    /* Get station columns (exclude Total/Mean) */
    var stCols = data.cols.slice(0, data.cols.length-1);

    /* Parse rows */
    var totalTaxaBySt = {};
    var totalDenBySt  = {};
    var indexBySt     = {};
    stCols.forEach(function(st){ totalTaxaBySt[st]=0; totalDenBySt[st]=0; indexBySt[st]={}; });

    data.rows.forEach(function(row){
      var label = (row.label||'').trim();
      if(label==='  Total' || label==='Total'){
        stCols.forEach(function(st,si){ totalTaxaBySt[st]=parseFloat(row.vals[si])||0; });
      }
      if(label==='  Total density' || label==='Total density'){
        stCols.forEach(function(st,si){ totalDenBySt[st]=parseFloat(row.vals[si])||0; });
      }
      if(label.includes("Diversity (H')")||label.includes('Diversity')){
        stCols.forEach(function(st,si){ indexBySt[st]['Shannon diversity index']=row.vals[si]!==''?row.vals[si]:'-'; });
      }
      if(label.includes('Evenness')){
        stCols.forEach(function(st,si){ indexBySt[st]['Evenness index']=row.vals[si]!==''?row.vals[si]:'-'; });
      }
      if(label.includes('Richness')){
        stCols.forEach(function(st,si){ indexBySt[st]['Richness index']=row.vals[si]!==''?row.vals[si]:'-'; });
      }
    });

    stCols.forEach(function(st){
      var meta = bioGetMetaRow(mod, st, '1', year);
      var baseRow = Object.assign({}, meta, {'Replication': 1, 'Taxa_Group': meta['Taxa_Group'] || taxaGroupDefault});
      rows.push(Object.assign({},baseRow,{'Parameter':'Total number of species','Value':totalTaxaBySt[st]||0,'Unit':'Taxa'}));
      rows.push(Object.assign({},baseRow,{'Parameter':'Total density','Value':totalDenBySt[st]||0,'Unit':meta['Unit']||unitDenDefault}));
      rows.push(Object.assign({},baseRow,{'Parameter':'Shannon diversity index','Value':indexBySt[st]['Shannon diversity index']||'-','Unit':'-'}));
      rows.push(Object.assign({},baseRow,{'Parameter':'Evenness index','Value':indexBySt[st]['Evenness index']||'-','Unit':'-'}));
      rows.push(Object.assign({},baseRow,{'Parameter':'Richness index','Value':indexBySt[st]['Richness index']||'-','Unit':'-'}));
    });
  });

  if(!rows.length){ bioErr(mod,'ไม่มีข้อมูล'); return; }

  var wb = window.XLSX.utils.book_new();
  var ws = window.XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = BIO_META_COLS.concat(['Taxa_Group','Unit','Remark','Parameter','Value']).map(function(){return {wch:16};});
  window.XLSX.utils.book_append_sheet(wb, ws, 'Long Format');
  var fname = bioFname(mod)+'_LongFormat_'+new Date().toISOString().slice(0,10)+'.xlsx';
  window.XLSX.writeFile(wb, fname);
}

window.bioCalculateByRep = bioCalculateByRep;
window.bioExportByRep = bioExportByRep;
window.bioToggleExportMenu = bioToggleExportMenu;
window.bioExportLong = bioExportLong;
window.bioExportLongByRep = bioExportLongByRep;
window.bioExportLongMean = bioExportLongMean;
window.bioConfirmSheet = bioConfirmSheet;
window.bioLoadSheet = bioLoadSheet;
window.bioGetMetaRow = bioGetMetaRow;
