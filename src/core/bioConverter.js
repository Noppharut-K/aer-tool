/**
 * bioConverter.js — wide-format lab report → long format, for the Biology
 * Calculator's "Import lab report" panel.
 *
 * The engine below is Marine Bio Data Converter v3.1 (Marine Environmental
 * Research & EIA Team), copied unchanged apart from this ES-module wrapper.
 * Keep it that way so fixes from the original tool can be pasted straight in;
 * AER-specific additions live after the engine (see LARVAE2 below).
 */

export var MBC = (function(){

  // ---------------------------------------------------------------
  // 1) PARAMETER PROFILES
  //    แต่ละพารามิเตอร์มีกฎการคำนวณ/โครงสร้างผลลัพธ์ของตัวเอง
  // ---------------------------------------------------------------
  var PROFILES = {
    benthos: {
      id: "benthos",
      name: "Benthos",
      nameTh: "สัตว์หน้าดิน",
      ranks: ["Phylum","Class","Order","Family"],
      rankRowPolicy: "keep",          // แถวลำดับชั้นที่มีค่า ให้เก็บ (Taxon = "Family: X")
      keepZero: false,
      stripParen: false,
      zoneSplit: 0,                   // 0 = ไม่แบ่ง Zone
      genus: false,
      dupTaxon: "keep",
      excludeStations: [],
      columns: ["Year","Project","Location","Station","Replicate","Phylum","Class","Order","Family","Taxon","Density"],
      sheetName: "Benthos",
      unitHint: "ind/m²"
    },
    phyto: {
      id: "phyto",
      name: "Phytoplankton",
      nameTh: "แพลงก์ตอนพืช",
      ranks: ["Division","Class","Order","Family"],
      rankRowPolicy: "drop",          // เก็บเฉพาะระดับชนิด (Taxon)
      keepZero: true,                 // ค่า 0 ที่บันทึกไว้ถือเป็นข้อมูล
      stripParen: true,               // ตัดข้อความในวงเล็บท้ายชื่อ
      zoneSplit: 2,                   // Sample 1–2 = Surface, 3+ = Euphotic
      genus: true,
      dupTaxon: "keep",
      excludeStations: [],
      columns: ["Year","Project","Location","Station","Zone","Replicate","Division","Class","Order","Family","Genus","Species","Density"],
      sheetName: "Phytoplankton",
      unitHint: "cells/L"
    },
    zoo: {
      id: "zoo",
      name: "Zooplankton",
      nameTh: "แพลงก์ตอนสัตว์",
      ranks: ["Phylum","Class","Order","Family"],
      rankRowPolicy: "keep",
      keepZero: false,
      stripParen: false,
      zoneSplit: 0,
      genus: false,
      dupTaxon: "keep",
      excludeStations: [],
      columns: ["Year","Project","Location","Station","Replicate","Phylum","Class","Order","Family","Taxon","Density"],
      sheetName: "Zooplankton",
      unitHint: "ind/m³"
    },
    larvae: {
      id: "larvae",
      name: "Fish Larvae",
      nameTh: "ลูกปลาวัยอ่อน",
      ranks: ["Phylum","Subphylum","Class","Subclass","Order","Family"],
      rankRowPolicy: "familyAndBelow", // เก็บเฉพาะระดับวงศ์ลงไป
      keepZero: false,
      stripParen: false,
      zoneSplit: 0,
      genus: false,
      dupTaxon: "keep",
      excludeStations: ["Reference","Station"],
      columns: ["Year","Project","Location","Station","Replicate","Phylum","Subphylum","Class","Subclass","Order","Family","Taxon","Density"],
      sheetName: "Fish Larvae",
      unitHint: "ind/1000 m³"
    }
  };

  var ALL_RANK_WORDS = ["kingdom","phylum","subphylum","division","superclass","class","subclass","infraclass","superorder","order","suborder","infraorder","superfamily","family","subfamily"];

  var SKIP_LABEL_PATTERNS = [
    /^total\b/i, /^grand total/i, /^sum\b/i, /^number of (taxa|species|individual)/i,
    /^no\.? of (taxa|species)/i, /^diversity/i, /^richness/i, /^evenness/i,
    /^dominance/i, /^shannon/i, /^simpson/i, /^remark/i, /^note\b/i,
    /^taxonomic categor/i, /\bunit\b.*:/i, /^\(?unit/i
  ];

  // ตารางอ้างอิง อันดับ (Order) -> ชั้น (Class) ที่เสถียรตามระบบอนุกรมวิธานปัจจุบัน (WoRMS)
  // ใช้ตรวจกรณีหัวลำดับชั้นในรายงานวางผิดตำแหน่ง เช่น Order Amphipoda อยู่ใต้ Class Copepoda
  // ไม่รวมกลุ่มที่การจัดชั้นยังต่างกันตามสำนัก (Polychaeta, ปลา, แพลงก์ตอนพืช)
  var ORDER_CLASS = {
    amphipoda:"Malacostraca", isopoda:"Malacostraca", cumacea:"Malacostraca", tanaidacea:"Malacostraca",
    mysida:"Malacostraca", decapoda:"Malacostraca", stomatopoda:"Malacostraca", euphausiacea:"Malacostraca",
    lophogastrida:"Malacostraca",
    calanoida:"Copepoda", cyclopoida:"Copepoda", harpacticoida:"Copepoda", poecilostomatoida:"Copepoda",
    siphonostomatoida:"Copepoda",
    myodocopida:"Ostracoda", halocyprida:"Ostracoda", podocopida:"Ostracoda",
    arcida:"Bivalvia", lucinida:"Bivalvia", cardiida:"Bivalvia", myida:"Bivalvia", venerida:"Bivalvia",
    nuculida:"Bivalvia", nuculanida:"Bivalvia", solemyida:"Bivalvia", pectinida:"Bivalvia",
    mytilida:"Bivalvia", ostreida:"Bivalvia", adapedonta:"Bivalvia", galeommatida:"Bivalvia",
    neogastropoda:"Gastropoda", littorinimorpha:"Gastropoda", cephalaspidea:"Gastropoda",
    aplysiida:"Gastropoda", pteropoda:"Gastropoda", trochida:"Gastropoda", nudibranchia:"Gastropoda",
    spatangoida:"Echinoidea", clypeasteroida:"Echinoidea", camarodonta:"Echinoidea",
    holothuriida:"Holothuroidea", apodida:"Holothuroidea", dendrochirotida:"Holothuroidea",
    amphilepidida:"Ophiuroidea", ophiurida:"Ophiuroidea", ophiacanthida:"Ophiuroidea",
    valvatida:"Asteroidea", paxillosida:"Asteroidea"
  };
  var KNOWN_CLASSES = {};
  Object.keys(ORDER_CLASS).forEach(function(k){ KNOWN_CLASSES[ORDER_CLASS[k].toLowerCase()] = 1; });

  var DASHES = {"-":1,"–":1,"—":1,"−":1,"--":1,"n.d.":1,"nd":1,"":1};

  // ---------------------------------------------------------------
  // 2) TEXT HELPERS
  // ---------------------------------------------------------------
  function str(v){ return v == null ? "" : String(v); }
  function clean(v){ return str(v).replace(/\t/g," ").replace(/ /g," ").replace(/\s+/g," ").trim(); }
  function lower(v){ return clean(v).toLowerCase(); }
  function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

  function stripParen(s){
    var i = s.indexOf("(");
    return i > 0 ? s.slice(0,i).trim() : s;
  }

  function isTaxMarker(v){ return lower(v).indexOf("taxonomic categor") >= 0; }

  // เครื่องหมายเชิงอรรถในรายงานแล็บ: "*Bivalvia larvae", "**Brachyuran zoea", "WP49-3A#"
  function splitTaxonMarker(s){
    var m = s.match(/^([*#†‡]+)\s*(.*)$/);
    return m ? {mark:m[1], name:clean(m[2])} : {mark:"", name:s};
  }
  function splitStationMarker(s){
    var m = s.match(/^(.*?)\s*([*#†‡]+)$/);
    return m && m[1] ? {mark:m[2], name:clean(m[1])} : {mark:"", name:s};
  }

  function looksLikeSampleLabel(v){
    if(typeof v !== "string") return false;   // ตัวเลขในเซลล์ = ข้อมูล ไม่ใช่ป้ายชื่อ sample
    var s = lower(v);
    if(!s) return false;
    return /^(sample|samp|rep|replicate|r|s|grab|tow|haul|net)\s*[-_.#]?\s*\d+$/.test(s) || /^\d{1,2}$/.test(s) || /^(sample|rep(licate)?)\b/.test(s);
  }

  function digitsOf(v){
    var m = str(v).match(/\d+/);
    return m ? parseInt(m[0],10) : null;
  }

  // แปลงค่า density: คืน {ok:true,value} / {skip:true} / {bad:true,raw}
  function parseValue(v){
    if(v == null) return {skip:true};
    if(typeof v === "number"){ return isFinite(v) ? {ok:true,value:v} : {skip:true}; }
    if(typeof v === "boolean") return {bad:true, raw:String(v)};
    var s = clean(v);
    if(DASHES[s.toLowerCase()]) return {skip:true};
    if(/^#(value|div\/0|n\/a|ref|num|name|null)/i.test(s)) return {skip:true, error:s};
    var t = s.replace(/,/g,"");
    if(/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return {ok:true,value:parseFloat(t)};
    return {bad:true, raw:s};
  }

  // ระบุลำดับชั้นจากข้อความ เช่น "PHYLUM Annelida" -> {rank:"Phylum", name:"Annelida"}
  function parseRank(text, profile){
    var s = clean(text);
    if(!s) return null;
    var m = s.match(/^([A-Za-z]+)\s*[:.]?\s*(.*)$/);
    if(m){
      var w = m[1].toLowerCase();
      for(var i=0;i<profile.ranks.length;i++){
        if(profile.ranks[i].toLowerCase() === w){
          return {rank: profile.ranks[i], name: clean(m[2]), keywordOnly: clean(m[2]) === ""};
        }
      }
      if(ALL_RANK_WORDS.indexOf(w) >= 0 && m[2] && /^[A-Z]/.test(clean(m[2]))){
        // ลำดับชั้นที่ไม่ได้อยู่ในโปรไฟล์ (เช่น Suborder) -> ไม่ใช่ taxon จริง
        return {rank: "_other", name: clean(m[2]), word: cap(w), keywordOnly:false};
      }
    }
    return {rank: "Taxon", name: s, keywordOnly:false};
  }

  // ---------------------------------------------------------------
  // 3) STRUCTURE DETECTION
  //    รองรับทั้ง (ก) แถวหัวเดียว: สถานี + เซลล์ว่างต่อท้าย = replicate
  //    และ (ข) หัวสองแถว: แถวสถานี + แถว Sample1/Sample2...
  // ---------------------------------------------------------------
  function detectStructure(rows){
    var maxSearch = Math.min(25, rows.length);
    var headerRowIdx = -1;
    for(var i=0;i<maxSearch && headerRowIdx<0;i++){
      var row = rows[i] || [];
      for(var c=0;c<row.length;c++){ if(isTaxMarker(row[c])){ headerRowIdx = i; break; } }
    }
    var usedFallback = false;
    if(headerRowIdx < 0){
      // fallback: แถวแรกที่มีข้อความในคอลัมน์ A และมีหัวคอลัมน์อื่นอย่างน้อย 1 ช่อง
      for(var j=0;j<maxSearch;j++){
        var r = rows[j] || [];
        var filled = r.filter(function(x){ return clean(x) !== ""; }).length;
        if(clean(r[0]) && filled >= 2){ headerRowIdx = j; usedFallback = true; break; }
      }
    }
    if(headerRowIdx < 0) throw new Error("ไม่พบแถวหัวตาราง (Taxonomic categories) ใน 25 แถวแรก โปรดตรวจสอบไฟล์");

    var header = rows[headerRowIdx] || [];
    var nextRow = rows[headerRowIdx+1] || [];

    // ตรวจว่าแถวถัดไปเป็น sub-header (Sample1, Sample2 ...) หรือไม่
    var sampleCount = 0;
    for(var k=1;k<nextRow.length;k++){ if(looksLikeSampleLabel(nextRow[k])) sampleCount++; }
    var firstNext = clean(nextRow[0]);
    var hasSubHeader = sampleCount >= 2 && (firstNext === "" || /sample|rep|unit|ind|cell|no\./i.test(firstNext));

    var width = Math.max(header.length, hasSubHeader ? nextRow.length : 0);
    var groups = [];
    var curGroup = null, curStation = null;
    var taxCols = [];
    if(!usedFallback){
      for(var c2=0;c2<width;c2++){ if(isTaxMarker(header[c2])) taxCols.push(c2); }
    } else {
      taxCols = [0];
    }

    function closeStation(){ if(curStation && curGroup){ curGroup.stations.push(curStation); } curStation = null; }

    for(var col=0; col<width; col++){
      var h = clean(header[col]);
      if(taxCols.indexOf(col) >= 0){
        closeStation();
        curGroup = {taxCol: col, stations: []};
        groups.push(curGroup);
        continue;
      }
      if(!curGroup) continue;
      var sub = hasSubHeader ? clean(nextRow[col]) : "";
      if(h){
        closeStation();
        var sm = splitStationMarker(h);
        curStation = {name: sm.name, rawName: h, mark: sm.mark, cols: [], subLabels: []};
      }
      if(curStation){
        // ถ้ามี sub-header แต่คอลัมน์นี้ว่างทั้งหัวและ sub ให้ข้าม (คอลัมน์ว่างคั่น)
        if(hasSubHeader && !h && !sub) continue;
        curStation.cols.push(col);
        curStation.subLabels.push(sub);
      }
    }
    closeStation();

    // คำนวณหมายเลข replicate
    groups.forEach(function(g){
      g.stations.forEach(function(st){
        st.reps = st.cols.map(function(_, idx){
          var d = digitsOf(st.subLabels[idx]);
          return d != null ? d : idx + 1;
        });
      });
    });

    var dataStartRow = headerRowIdx + (hasSubHeader ? 2 : 1);
    while(dataStartRow < rows.length){
      var dr = rows[dataStartRow] || [];
      var first = clean(dr[groups.length ? groups[0].taxCol : 0]);
      if(!first){ dataStartRow++; continue; }
      if(/unit/i.test(first) && !/[A-Z][a-z]+ [a-z]+/.test(first)){ dataStartRow++; continue; }
      if(/^(sample|replicate|rep\b)/i.test(first)){ dataStartRow++; continue; }
      break;
    }

    var totalStations = 0, totalCols = 0;
    groups.forEach(function(g){ totalStations += g.stations.length; g.stations.forEach(function(s){ totalCols += s.cols.length; }); });
    if(!groups.length || !totalStations) throw new Error("ไม่พบคอลัมน์สถานีในแถวหัวตาราง โปรดตรวจสอบรูปแบบไฟล์");

    return {headerRowIdx: headerRowIdx, hasSubHeader: hasSubHeader, dataStartRow: dataStartRow,
            groups: groups, totalStations: totalStations, totalCols: totalCols, usedFallback: usedFallback};
  }

  // เดาพารามิเตอร์จากคำในคอลัมน์อนุกรมวิธาน
  function guessParameter(rows, structure){
    var txt = [];
    var tc = structure.groups[0].taxCol;
    for(var r=structure.dataStartRow; r<Math.min(rows.length, structure.dataStartRow+400); r++){
      txt.push(lower((rows[r]||[])[tc]));
    }
    var all = " " + txt.join(" | ") + " ";
    var score = {benthos:0, phyto:0, zoo:0, larvae:0};
    if(/\bdivision\b/.test(all)) score.phyto += 5;
    if(/bacillariophyta|dinophyta|cyanophyta|chlorophyta|diatom/.test(all)) score.phyto += 4;
    if(/\bsubphylum\b|\bsubclass\b/.test(all)) score.larvae += 3;
    if(/actinopterygii|teleostei|engraulidae|gobiidae|clupeidae|larva/.test(all)) score.larvae += 3;
    if(/copepod|calanoida|cyclopoida|chaetognatha|nauplius|zoea|appendicularia/.test(all)) score.zoo += 4;
    if(/polychaeta|annelida|bivalvia|nemertea|sipuncula|amphipoda/.test(all)) score.benthos += 4;
    var best = null, bestV = 0;
    Object.keys(score).forEach(function(k){ if(score[k] > bestV){ best = k; bestV = score[k]; } });
    return best;
  }

  // ---------------------------------------------------------------
  // 4) TRANSFORM (Wide -> Long)
  // ---------------------------------------------------------------
  function transform(rows, structure, profile, opts){
    opts = opts || {};
    var keepZero = opts.keepZero != null ? opts.keepZero : profile.keepZero;
    var rankPolicy = opts.rankRowPolicy || profile.rankRowPolicy;
    var useStrip = opts.stripParen != null ? opts.stripParen : profile.stripParen;
    var zoneSplit = opts.zoneSplit != null ? opts.zoneSplit : profile.zoneSplit;
    var dupMode = opts.dupTaxon || profile.dupTaxon;
    var excluded = {};
    (opts.excludeStations || []).forEach(function(n){ excluded[n] = 1; });
    var meta = opts.meta || {};

    var ranks = profile.ranks;
    var out = [];
    var warnings = [];
    var skippedLabels = [];
    var dropped = [];
    var droppedSum = 0;
    var log = {rows:0, taxonRows:0, rankRows:0, skippedRows:0};

    var cleanMarkers = opts.cleanMarkers !== false;   // ล้าง * / # ออกจากชื่อ
    var markerRank = opts.markerRank !== false;       // ปรับลำดับชั้นของ taxon กลุ่มใหญ่/ที่มีเครื่องหมาย
    var adjusted = [], adjustedRows = {};             // บันทึกแถวที่ปรับลำดับชั้น
    var fixClass = opts.fixClass !== false;           // แก้ Class ตามตารางอ้างอิงเมื่อขัดกันชัดเจน
    var classIssues = {};                             // key -> {order, from, to, fixed, rows, sum}
    var hasClassOrder = ranks.indexOf("Class") >= 0 && ranks.indexOf("Order") >= 0;
    function checkClass(rs){
      if(!hasClassOrder || !rs.Order) return {state:rs, issue:null};
      var ref = ORDER_CLASS[lower(rs.Order)];
      if(!ref || lower(rs.Class) === ref.toLowerCase()) return {state:rs, issue:null};
      var canFix = fixClass && !!KNOWN_CLASSES[lower(rs.Class)];
      var key = rs.Order + "|" + rs.Class;
      if(!classIssues[key]) classIssues[key] = {order: rs.Order, from: rs.Class || "(ว่าง)", to: ref, fixed: canFix, rows: 0, sum: 0};
      if(!canFix) return {state:rs, issue:classIssues[key]};
      var s2 = {}; ranks.forEach(function(k){ s2[k] = rs[k]; }); s2.Class = ref;
      return {state:s2, issue:classIssues[key]};
    }
    var markedStations = [];

    // ตรวจค่าเฉพาะในบล็อกเดียวกัน (รายงานแล็บมีหลายบล็อกเรียงข้างกัน)
    function hasAnyValue(row, group){
      var st = group.stations;
      for(var s=0;s<st.length;s++) for(var c=0;c<st[s].cols.length;c++){
        var p = parseValue(row[st[s].cols[c]]);
        if(p.ok) return true;
      }
      return false;
    }

    // taxon ที่ชื่อมีชื่อลำดับชั้นที่สูงกว่าอยู่ (เช่น "Bivalvia larvae" ใต้ Class Bivalvia)
    // หรือมีเครื่องหมายเชิงอรรถ -> ไม่ควรรับวงศ์/อันดับของแถวข้างบน
    function rankStateFor(name, mark, state){
      var s = {}; ranks.forEach(function(k){ s[k] = state[k]; });
      if(!markerRank) return {state:s, changed:false};
      var words = lower(name).split(/[\s,()]+/);
      var cut = -1;
      for(var i=ranks.length-2; i>=0; i--){
        var v = lower(state[ranks[i]]);
        if(v && words.indexOf(v) >= 0){ cut = i; break; }
      }
      if(cut < 0 && mark) cut = ranks.length - 2;     // มีเครื่องหมายแต่ไม่พบชื่อ -> ไม่รับวงศ์
      var changed = false;
      if(cut >= 0){
        for(var z=cut+1; z<ranks.length; z++){ if(s[ranks[z]]){ s[ranks[z]] = ""; changed = true; } }
      }
      return {state:s, changed:changed};
    }

    structure.groups.forEach(function(g){ g.stations.forEach(function(st){
      if(st.mark && !excluded[st.name]) markedStations.push({station: st.name, raw: st.rawName});
    }); });

    // แต่ละกลุ่ม (block) มีคอลัมน์อนุกรมวิธานของตัวเอง แต่ใช้ลำดับแถวเดียวกัน
    structure.groups.forEach(function(group){
      var state = {}; ranks.forEach(function(r){ state[r] = ""; });
      var awaitRank = null;

      for(var r = structure.dataStartRow; r < rows.length; r++){
        var row = rows[r] || [];
        var label = clean(row[group.taxCol]);
        if(!label) continue;
        if(SKIP_LABEL_PATTERNS.some(function(p){ return p.test(label); })){
          if(group === structure.groups[0]) skippedLabels.push({row:r+1, label:label});
          continue;
        }
        if(useStrip){ label = stripParen(label); if(!label) continue; }
        var tm = splitTaxonMarker(label);
        var taxMark = tm.mark;
        if(taxMark){ label = tm.name; if(!label) continue; }

        var parsed = parseRank(label, profile);
        var anyVal = hasAnyValue(row, group);

        // รูปแบบ "Division" บรรทัดหนึ่ง + ชื่อบรรทัดถัดไป (ไม่มีค่า)
        if(parsed.keywordOnly){ awaitRank = parsed.rank; continue; }
        if(awaitRank && parsed.rank === "Taxon" && !anyVal){
          parsed = {rank: awaitRank, name: label};
        }
        awaitRank = null;

        var isRank = parsed.rank !== "Taxon" && parsed.rank !== "_other";
        if(isRank){
          var idx = ranks.indexOf(parsed.rank);
          state[parsed.rank] = parsed.name;
          for(var z=idx+1; z<ranks.length; z++) state[ranks[z]] = "";
          if(group === structure.groups[0]) log.rankRows++;
        } else if(group === structure.groups[0] && parsed.rank === "Taxon") {
          log.taxonRows++;
        }

        // ลำดับชั้นที่ใช้กับแถวนี้ (taxon กลุ่มใหญ่/มีเครื่องหมาย ไม่รับวงศ์ของแถวข้างบน)
        var rowState = state;
        if(parsed.rank === "Taxon"){
          var rs = rankStateFor(parsed.name, taxMark, state);
          rowState = rs.state;
          if(rs.changed && anyVal && !adjustedRows[r]){
            adjustedRows[r] = 1;
            var fromTxt = [];
            ranks.forEach(function(k){ if(state[k] !== rowState[k]) fromTxt.push(k + " " + state[k]); });
            adjusted.push({row:r+1, label:(taxMark||"") + parsed.name, removed: fromTxt.join(", ")});
          }
        }
        var cc = checkClass(rowState);
        rowState = cc.state;
        var classIssue = cc.issue;
        var rowName = parsed.name;
        if(taxMark && !cleanMarkers) rowName = taxMark + parsed.name;

        // นโยบายแถวลำดับชั้น
        var dropReason = "";
        if(parsed.rank === "_other"){
          if(rankPolicy === "drop") dropReason = "ลำดับชั้นนอกโปรไฟล์ (" + parsed.word + ")";
          else if(!anyVal) continue;
          else if(rankPolicy === "familyAndBelow" && !state.Family) dropReason = "สูงกว่าระดับวงศ์";
        } else if(isRank){
          if(rankPolicy === "drop") dropReason = "แถวลำดับชั้น (" + parsed.rank + ")";
          else if(rankPolicy === "familyAndBelow" && parsed.rank !== "Family") dropReason = "สูงกว่าระดับวงศ์";
        } else {
          if(rankPolicy === "familyAndBelow" && !rowState.Family) dropReason = "ไม่มีวงศ์กำกับ";
        }
        if(dropReason){
          if(anyVal){
            var dsum = 0;
            group.stations.forEach(function(st){
              if(excluded[st.name]) return;
              st.cols.forEach(function(c){ var p = parseValue(row[c]); if(p.ok) dsum += p.value; });
            });
            droppedSum += dsum;
            dropped.push({row:r+1, label:label, reason:dropReason, sum:dsum});
          }
          continue;
        }
        if(!anyVal && !keepZero) continue;

        var taxonLabel = isRank ? (parsed.rank + ": " + parsed.name)
                       : parsed.rank === "_other" ? (parsed.word + ": " + parsed.name)
                       : rowName;

        group.stations.forEach(function(st){
          if(excluded[st.name]) return;
          var nReps = st.cols.length;
          st.cols.forEach(function(colIdx, i){
            var pv = parseValue(row[colIdx]);
            if(pv.bad){
              warnings.push({row:r+1, col:colIdx, station:st.name, taxon:taxonLabel, raw:pv.raw});
              return;
            }
            if(!pv.ok) return;
            if(pv.value === 0 && !keepZero) return;
            var rep = st.reps[i];
            var rec = {};
            profile.columns.forEach(function(k){ rec[k] = ""; });
            rec.Year = /^\d{4}$/.test(meta.year || "") ? parseInt(meta.year,10) : (meta.year || "");
            rec.Project = meta.project || "";
            rec.Location = meta.location || locationOf(st.name);
            rec.Station = cleanMarkers ? st.name : st.rawName;
            ranks.forEach(function(k){ rec[k] = rowState[k]; });
            if(zoneSplit > 0){
              rec.Zone = rep <= zoneSplit ? "Surface" : "Euphotic";
              rec.Replicate = rep <= zoneSplit ? rep : rep - zoneSplit;
            } else {
              rec.Replicate = rep;
            }
            if(profile.genus){
              var sp = parsed.rank === "Taxon" ? parsed.name : "";
              if(sp && taxMark && !cleanMarkers) sp = taxMark + sp;
              rec.Species = sp;
              rec.Genus = sp ? sp.split(" ")[0] : "";
            } else {
              rec.Taxon = taxonLabel;
            }
            rec.Density = pv.value;
            if(classIssue){ classIssue.rows++; classIssue.sum += pv.value; }
            rec._family = rowState.Family || "";
            rec._row = r + 1;
            out.push(rec);
          });
        });
      }
    });

    // จัดการชื่อ Taxon ซ้ำต่าง Family
    var dupInfo = findDuplicateTaxa(out);
    if(dupMode === "family" && !profile.genus){
      out.forEach(function(rec){
        if(dupInfo.names[rec.Taxon] && rec._family) rec.Taxon = rec.Taxon + " (" + rec._family + ")";
      });
    } else if(dupMode === "familyAll" && !profile.genus){
      out.forEach(function(rec){
        if(rec._family && rec.Taxon.indexOf(":") < 0 && /\b(juvenile|larva|larvae|unidentified|unid\.?|sp\.?|spp\.?)\b/i.test(rec.Taxon)){
          rec.Taxon = rec.Taxon + " (" + rec._family + ")";
        }
      });
    }

    var inputSum = 0;
    out.forEach(function(rec){ inputSum += rec.Density; });

    return {rows: out, warnings: warnings, skippedLabels: skippedLabels, dropped: dropped, droppedSum: droppedSum,
            duplicates: dupInfo.list, log: log, total: inputSum, adjusted: adjusted, markedStations: markedStations,
            classIssues: Object.keys(classIssues).map(function(k){ return classIssues[k]; }).filter(function(c){ return c.rows > 0; })};
  }

  // ---------------------------------------------------------------
  // 5) METADATA จากหัวรายงานแล็บ (Project name:, Parameter:, ปี)
  // ---------------------------------------------------------------
  function detectMeta(rows, structure){
    var meta = {project:"", parameter:"", paramId:"", year:"", sampleType:"", unit:""};
    var lim = structure ? structure.headerRowIdx : Math.min(15, rows.length);
    function scan(text){
      var s = clean(text); if(!s) return;
      var m;
      if(!meta.project && (m = s.match(/^project(?:\s*name)?\s*[:：]\s*(.+)$/i))) meta.project = m[1];
      else if(!meta.parameter && (m = s.match(/^parameter\s*[:：]\s*(.+)$/i))) meta.parameter = m[1];
      else if(!meta.sampleType && (m = s.match(/^sample\s*type\s*[:：]\s*(.+)$/i))) meta.sampleType = m[1];
    }
    for(var r=0; r<lim; r++){
      var row = rows[r] || [];
      for(var c=0; c<Math.min(row.length, 30); c++) scan(row[c]);
    }
    if(structure){
      var ur = rows[structure.dataStartRow-1] || [];
      var ut = clean(ur[structure.groups[0].taxCol]);
      var um = ut.match(/unit\s*[:：]?\s*([^)]+)\)?/i);
      if(um) meta.unit = clean(um[1]);
    }
    var y = meta.project.match(/\b(20\d{2}|25\d{2})\b/g);
    if(y){ var yy = parseInt(y[y.length-1],10); meta.year = String(yy > 2400 ? yy - 543 : yy); }
    var p = lower(meta.parameter);
    if(/phyto/.test(p)) meta.paramId = "phyto";
    else if(/zoo/.test(p)) meta.paramId = "zoo";
    else if(/larva|ichthyo|fish/.test(p)) meta.paramId = "larvae";
    else if(/benth|macrofauna/.test(p)) meta.paramId = "benthos";
    return meta;
  }

  // ---------------------------------------------------------------
  // 6) ตารางนำเข้ามาตรฐาน: รวมทุกบล็อกเป็นตารางเดียว (คอลัมน์อนุกรมวิธาน 1 คอลัมน์)
  // ---------------------------------------------------------------
  function toWide(rows, structure, opts){
    opts = opts || {};
    var meta = opts.meta || {};
    var cleanMarkers = opts.cleanMarkers !== false;
    var excluded = {}; (opts.excludeStations||[]).forEach(function(n){ excluded[n]=1; });
    var g0 = structure.groups[0];
    var stations = [];
    structure.groups.forEach(function(g){ g.stations.forEach(function(st){ if(!excluded[st.name]) stations.push({g:g, st:st}); }); });
    var aoa = [], merges = [], mismatches = [];
    aoa.push([(meta.parameter || "") + (meta.project ? " — " + meta.project : "")]);
    aoa.push([]);
    var h1 = ["Taxonomic categories"], h2 = [meta.unit ? "Unit: " + meta.unit : ""];
    stations.forEach(function(o){
      var start = h1.length;
      o.st.cols.forEach(function(_, i){
        h1.push(i === 0 ? (cleanMarkers ? o.st.name : o.st.rawName) : null);
        h2.push("Sample" + o.st.reps[i]);
      });
      if(o.st.cols.length > 1) merges.push({s:{r:2,c:start}, e:{r:2,c:start+o.st.cols.length-1}});
    });
    aoa.push(h1); aoa.push(h2);
    var firstData = aoa.length;
    for(var r=structure.dataStartRow; r<rows.length; r++){
      var row = rows[r] || [];
      var label = clean(row[g0.taxCol]);
      if(!label) continue;
      if(SKIP_LABEL_PATTERNS.some(function(p){ return p.test(label); })) continue;
      structure.groups.forEach(function(g){
        if(g === g0) return;
        var l2 = clean(row[g.taxCol]);
        if(l2 && l2 !== label) mismatches.push({row:r+1, a:label, b:l2});
      });
      var line = [label];
      stations.forEach(function(o){
        o.st.cols.forEach(function(c){
          var v = row[c];
          line.push(v == null ? null : (typeof v === "string" ? clean(v) : v));
        });
      });
      aoa.push(line);
    }
    var lastData = aoa.length - 1;
    var tot = ["Total"];
    for(var k=1; k<h2.length; k++){
      var s = 0;
      for(var q=firstData; q<=lastData; q++){ var p = parseValue(aoa[q][k]); if(p.ok) s += p.value; }
      tot.push({v:s, f:"SUM(" + colName(k) + (firstData+1) + ":" + colName(k) + (lastData+1) + ")"});
    }
    aoa.push(tot);
    return {aoa:aoa, merges:merges, mismatches:mismatches, nStations:stations.length};
  }

  function colName(i){ var s = ""; i++; while(i > 0){ var m = (i-1) % 26; s = String.fromCharCode(65+m) + s; i = Math.floor((i-1)/26); } return s; }

  function findDuplicateTaxa(out){
    var map = {};
    out.forEach(function(rec){
      var t = rec.Taxon || rec.Species;
      if(!t || String(t).indexOf(":") >= 0) return;
      if(!map[t]) map[t] = {};
      map[t][rec._family || "(ไม่ระบุ)"] = 1;
    });
    var names = {}, list = [];
    Object.keys(map).forEach(function(t){
      var fams = Object.keys(map[t]);
      if(fams.length > 1){ names[t] = 1; list.push({taxon:t, families:fams}); }
    });
    return {names:names, list:list};
  }

  function locationOf(station){
    var s = clean(station);
    var i = s.lastIndexOf("-");
    return i > 0 ? s.slice(0,i) : s;
  }

  // ยอดรวมจากต้นฉบับ (ทุกแถวที่ไม่ใช่สรุป) ไว้ตรวจทาน
  function sourceSum(rows, structure, opts){
    opts = opts || {};
    var excluded = {}; (opts.excludeStations||[]).forEach(function(n){ excluded[n]=1; });
    var sum = 0, cells = 0;
    structure.groups.forEach(function(g){
      for(var r=structure.dataStartRow; r<rows.length; r++){
        var row = rows[r] || [];
        var label = clean(row[g.taxCol]);
        if(!label || SKIP_LABEL_PATTERNS.some(function(p){ return p.test(label); })) continue;
        g.stations.forEach(function(st){
          if(excluded[st.name]) return;
          st.cols.forEach(function(c){ var p = parseValue(row[c]); if(p.ok){ sum += p.value; cells++; } });
        });
      }
    });
    return {sum:sum, cells:cells};
  }

  return {
    PROFILES: PROFILES,
    detectStructure: detectStructure,
    guessParameter: guessParameter,
    transform: transform,
    sourceSum: sourceSum,
    detectMeta: detectMeta,
    toWide: toWide,
    parseValue: parseValue,
    parseRank: parseRank,
    locationOf: locationOf
  };
})();

/* AER's "Larvae" module (non-fish larvae, Phylum-based) has no profile in the
   original tool. Its lab tables share the Zooplankton layout — Phylum › Class ›
   Order › Family headings with rank rows that carry values kept as taxa — so it
   reuses the Zooplankton rules under its own id/name. */
MBC.PROFILES.larvae2 = Object.assign({}, MBC.PROFILES.zoo, {
  id: "larvae2",
  name: "Larvae",
  nameTh: "แพลงก์ตอนสัตว์วัยอ่อน",
  sheetName: "Larvae",
  excludeStations: []
});
