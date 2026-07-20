/** Seeded pseudo-random number generator for reproducible demo data */
let _seed = 42;
function _dr(min, max, dec) {
  _seed = (_seed * 1664525 + 1013904223) & 0xffffffff;
  const v = min + ((_seed >>> 0) / 0xffffffff) * (max - min);
  return dec != null ? parseFloat(v.toFixed(dec)) : v;
}

/** Get sampling date for a location/year/stationIndex */
function _demoDate(loc, yr, stIdx) {
  const bases = {
    'Loc-A':      { 2020:'2020-05-11', 2021:'2021-05-13', 2022:'2022-05-10', 2023:'2023-02-01' },
    'Loc-B':      { 2020:'2020-05-22', 2021:'2021-05-24', 2022:'2022-05-21', 2023:'2023-02-12' },
    'Offshore':   { 2020:'2020-05-10', 2021:'2021-05-12', 2022:'2022-05-09', 2023:'2023-02-01' },
    'Baseline':   { 2019:'2019-11-05' },
    'River':      { 2020:'2020-06-01', 2021:'2021-06-03', 2022:'2022-06-02', 2023:'2023-03-01' },
    'Province':   { 2020:'2020-05-11', 2021:'2021-05-13', 2022:'2022-05-10', 2023:'2023-02-01' },
    'Site':       { 2020:'2020-05-11', 2021:'2021-05-13', 2022:'2022-05-10', 2023:'2023-02-01' },
    'Background': { 2020:'2020-05-10', 2021:'2021-05-12', 2022:'2022-05-09', 2023:'2023-02-01' },
  };
  const base = (bases[loc] || {})[yr];
  if (!base) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + (stIdx || 0));
  return d.toISOString().slice(0, 10);
}

// ── SEA ──────────────────────────────────────────────────────────────────────
const SEA_DEPTHS = ['Surface', '20m', '40m', 'Bottom'];
const SEA_STS_A  = ['ST-A01','ST-A02','ST-A03','ST-A04','ST-A05','ST-A06','ST-A07','ST-A08','ST-A09','ST-A10'];
const SEA_STS_B  = ['ST-B01','ST-B02','ST-B03','ST-B04','ST-B05','ST-B06','ST-B07','ST-B08','ST-B09','ST-B10'];
const SEA_YRS    = [2020, 2021, 2022, 2023];
const depF = { Surface:1, '20m':0.92, '40m':0.82, Bottom:0.70 };
const depT = { Surface:0, '20m':-0.8, '40m':-1.6, Bottom:-2.8 };

function seaRow(loc, st, yr, dep, wd, base, si) {
  const df = depF[dep] || 1, dt = depT[dep] || 0;
  return {
    Area:'Gulf', Location:loc, Station:st, Depth:dep, 'Water Level':dep, Water_Depth:wd, Year:yr,
    Date: _demoDate(loc, yr, si || 0), Report_Type:'EIA',
    DO:        parseFloat(((base.DO) * df * _dr(0.88, 1.12)).toFixed(2)),
    pH:        parseFloat((_dr(base.pH - 0.15, base.pH + 0.15, 2)).toFixed(2)),
    Mercury:   parseFloat((base.Hg  * _dr(0.7,  1.3 )).toFixed(4)),
    Lead:      parseFloat((base.Pb  * _dr(0.75, 1.25)).toFixed(3)),
    Copper:    parseFloat((base.Cu  * _dr(0.7,  1.3 )).toFixed(3)),
    Zinc:      parseFloat((base.Zn  * _dr(0.8,  1.2 )).toFixed(2)),
    Arsenic:   parseFloat((base.As  * _dr(0.75, 1.25)).toFixed(3)),
    Salinity:  parseFloat((_dr(base.Sal - 0.5, base.Sal + 0.5, 1)).toFixed(1)),
    Temp:      parseFloat((base.Tmp + dt + _dr(-0.4, 0.4)).toFixed(1)),
    TSS:       parseFloat((base.TSS * (1 + (1 - df) * 0.6) * _dr(0.7, 1.3)).toFixed(1)),
    BOD:       parseFloat((base.BOD * _dr(0.8,  1.2 )).toFixed(2)),
    NO3_N:     parseFloat((base.NO3 * _dr(0.7,  1.3 )).toFixed(2)),
    Turbidity: parseFloat((base.Turb * (1 + (1 - df) * 0.5) * _dr(0.7, 1.3)).toFixed(1)),
    Manganese: parseFloat((base.Mn  * _dr(0.75, 1.25)).toFixed(2)),
    Iron:      parseFloat((base.Fe  * _dr(0.75, 1.25)).toFixed(1)),
    TPH:       parseFloat((base.TPH * _dr(0.6,  1.4 )).toFixed(3)),
  };
}

const BASE_REF = { DO:6.9,pH:8.15,Hg:0.018,Pb:2.2,Cu:2.8,Zn:14,As:3.1,Sal:32.5,Tmp:27.8,TSS:6, BOD:0.9,NO3:12,Turb:3.2,Mn:8, Fe:42, TPH:0.08 };
const BASE_BL  = { DO:6.5,pH:8.05,Hg:0.022,Pb:3.1,Cu:3.6,Zn:17,As:4.0,Sal:31.8,Tmp:28.3,TSS:9, BOD:1.2,NO3:18,Turb:5.1,Mn:12,Fe:58, TPH:0.12 };
const BASE_A = [
  {DO:6.1,pH:7.98,Hg:0.028,Pb:4.2,Cu:4.5,Zn:20,As:5.2,Sal:31.5,Tmp:29.0,TSS:11,BOD:1.5,NO3:22,Turb:6.8,Mn:18,Fe:78, TPH:0.18},
  {DO:5.9,pH:7.95,Hg:0.031,Pb:4.5,Cu:4.8,Zn:21,As:5.5,Sal:31.4,Tmp:29.1,TSS:12,BOD:1.6,NO3:24,Turb:7.2,Mn:19,Fe:82, TPH:0.19},
  {DO:5.7,pH:7.92,Hg:0.035,Pb:5.0,Cu:5.1,Zn:22,As:5.8,Sal:31.2,Tmp:29.3,TSS:13,BOD:1.7,NO3:26,Turb:7.8,Mn:21,Fe:88, TPH:0.22},
  {DO:6.0,pH:7.96,Hg:0.030,Pb:4.6,Cu:4.9,Zn:21,As:5.4,Sal:31.3,Tmp:29.2,TSS:12,BOD:1.6,NO3:23,Turb:7.0,Mn:20,Fe:85, TPH:0.20},
  {DO:5.8,pH:7.93,Hg:0.033,Pb:4.8,Cu:5.0,Zn:21,As:5.6,Sal:31.1,Tmp:29.4,TSS:13,BOD:1.7,NO3:25,Turb:7.5,Mn:20,Fe:86, TPH:0.21},
  {DO:6.2,pH:7.99,Hg:0.027,Pb:4.3,Cu:4.6,Zn:20,As:5.1,Sal:31.6,Tmp:28.9,TSS:11,BOD:1.5,NO3:21,Turb:6.5,Mn:17,Fe:76, TPH:0.17},
  {DO:5.6,pH:7.91,Hg:0.036,Pb:5.1,Cu:5.3,Zn:23,As:6.0,Sal:31.0,Tmp:29.5,TSS:14,BOD:1.8,NO3:27,Turb:8.2,Mn:22,Fe:92, TPH:0.23},
  {DO:6.3,pH:8.00,Hg:0.026,Pb:4.1,Cu:4.4,Zn:19,As:5.0,Sal:31.7,Tmp:28.8,TSS:10,BOD:1.4,NO3:20,Turb:6.2,Mn:16,Fe:74, TPH:0.16},
  {DO:5.5,pH:7.90,Hg:0.038,Pb:5.3,Cu:5.5,Zn:24,As:6.2,Sal:30.9,Tmp:29.6,TSS:15,BOD:1.9,NO3:28,Turb:8.8,Mn:23,Fe:96, TPH:0.25},
  {DO:6.4,pH:8.01,Hg:0.025,Pb:4.0,Cu:4.3,Zn:19,As:4.9,Sal:31.8,Tmp:28.7,TSS:10,BOD:1.4,NO3:19,Turb:6.0,Mn:16,Fe:72, TPH:0.15},
];
const BASE_B = [
  {DO:5.8,pH:7.88,Hg:0.032,Pb:5.5,Cu:5.8,Zn:26,As:6.5,Sal:30.5,Tmp:30.2,TSS:17,BOD:2.0,NO3:30,Turb:9.5, Mn:25,Fe:105,TPH:0.28},
  {DO:5.5,pH:7.85,Hg:0.036,Pb:5.9,Cu:6.2,Zn:28,As:6.9,Sal:30.2,Tmp:30.5,TSS:19,BOD:2.2,NO3:33,Turb:10.2,Mn:27,Fe:112,TPH:0.31},
  {DO:5.3,pH:7.82,Hg:0.040,Pb:6.3,Cu:6.6,Zn:30,As:7.3,Sal:29.9,Tmp:30.8,TSS:21,BOD:2.4,NO3:36,Turb:11.0,Mn:29,Fe:120,TPH:0.34},
  {DO:5.6,pH:7.86,Hg:0.035,Pb:5.7,Cu:6.0,Zn:27,As:6.7,Sal:30.3,Tmp:30.4,TSS:18,BOD:2.1,NO3:31,Turb:9.8, Mn:26,Fe:108,TPH:0.29},
  {DO:5.4,pH:7.83,Hg:0.038,Pb:6.1,Cu:6.4,Zn:29,As:7.1,Sal:30.0,Tmp:30.7,TSS:20,BOD:2.3,NO3:34,Turb:10.5,Mn:28,Fe:116,TPH:0.32},
  {DO:6.0,pH:7.90,Hg:0.030,Pb:5.2,Cu:5.5,Zn:25,As:6.2,Sal:30.7,Tmp:29.9,TSS:16,BOD:1.9,NO3:28,Turb:9.0, Mn:24,Fe:100,TPH:0.26},
  {DO:5.2,pH:7.80,Hg:0.042,Pb:6.5,Cu:6.8,Zn:31,As:7.5,Sal:29.7,Tmp:31.0,TSS:22,BOD:2.5,NO3:37,Turb:11.5,Mn:30,Fe:125,TPH:0.36},
  {DO:5.9,pH:7.89,Hg:0.031,Pb:5.4,Cu:5.7,Zn:26,As:6.4,Sal:30.6,Tmp:30.0,TSS:17,BOD:2.0,NO3:29,Turb:9.2, Mn:25,Fe:103,TPH:0.27},
  {DO:5.1,pH:7.79,Hg:0.044,Pb:6.7,Cu:7.0,Zn:32,As:7.7,Sal:29.5,Tmp:31.2,TSS:23,BOD:2.6,NO3:39,Turb:12.0,Mn:31,Fe:130,TPH:0.38},
  {DO:6.1,pH:7.91,Hg:0.029,Pb:5.1,Cu:5.4,Zn:24,As:6.1,Sal:30.8,Tmp:29.8,TSS:16,BOD:1.8,NO3:27,Turb:8.8, Mn:24,Fe:98, TPH:0.25},
];

function buildSea() {
  const rows = [];
  SEA_YRS.forEach(yr => SEA_DEPTHS.forEach(dep => rows.push(seaRow('Offshore','REF-01',yr,dep,72,BASE_REF,0))));
  SEA_DEPTHS.forEach(dep => rows.push(seaRow('Baseline','BL-01',2019,dep,55,BASE_BL,0)));
  SEA_STS_A.forEach((st,i) => SEA_YRS.forEach(yr => SEA_DEPTHS.forEach(dep => rows.push(seaRow('Loc-A',st,yr,dep,75+i,BASE_A[i],i)))));
  SEA_STS_B.forEach((st,i) => SEA_YRS.forEach(yr => SEA_DEPTHS.forEach(dep => rows.push(seaRow('Loc-B',st,yr,dep,52+i,BASE_B[i],i)))));
  return rows;
}

// ── SED ──────────────────────────────────────────────────────────────────────
const SED_STS_A  = ['ST-A01','ST-A02','ST-A03','ST-A04','ST-A05','ST-A06','ST-A07','ST-A08','ST-A09','ST-A10'];
const SED_STS_B  = ['ST-B01','ST-B02','ST-B03','ST-B04','ST-B05','ST-B06','ST-B07','ST-B08','ST-B09','ST-B10'];
const SED_DIST_A = [150,250,400,600,800,1000,1300,1600,2000,2500];
const SED_DIST_B = [200,350,550,750,950,1200,1500,1900,2400,3000];
const SED_YRS    = [2020,2021,2022,2023];

function buildSed() {
  const rows = [];
  SED_YRS.forEach(yr => rows.push({
    Area:'Gulf',Location:'Offshore',Station:'REF-01',Distance:0,Year:yr,Date:_demoDate('Offshore',yr,0),Report_Type:'EIA',
    Mercury:parseFloat((_dr(0.04,0.07)).toFixed(4)),Lead:parseFloat((_dr(7,10)).toFixed(2)),
    Cadmium:parseFloat((_dr(0.18,0.26)).toFixed(3)),Copper:parseFloat((_dr(5.5,8.0)).toFixed(2)),
    Zinc:parseFloat((_dr(40,52)).toFixed(1)),Arsenic:parseFloat((_dr(4.2,6.1)).toFixed(2)),
    Nickel:parseFloat((_dr(15,19)).toFixed(2)),Chromium:parseFloat((_dr(30,45)).toFixed(1)),
    TPH:parseFloat((_dr(12,20)).toFixed(1)),TOC:parseFloat((_dr(0.6,1.0)).toFixed(2)),
    Sand:parseFloat((_dr(58,66)).toFixed(1)),Silt:parseFloat((_dr(24,32)).toFixed(1)),Clay:parseFloat((_dr(8,13)).toFixed(1)),
    Manganese:parseFloat((_dr(80,120)).toFixed(1)),Iron:parseFloat((_dr(8000,12000)).toFixed(0)),Barium:parseFloat((_dr(80,130)).toFixed(1)),
  }));
  rows.push({Area:'Gulf',Location:'Baseline',Station:'BL-01',Distance:0,Year:2019,Date:_demoDate('Baseline',2019,0),Report_Type:'EIA',
    Mercury:0.068,Lead:11.2,Cadmium:0.22,Copper:8.5,Zinc:52,Arsenic:5.8,Nickel:18.5,Chromium:42,
    TPH:18,TOC:1.1,Sand:54,Silt:33,Clay:13,Manganese:105,Iron:10200,Barium:118});
  SED_STS_A.forEach((st,i) => {
    const dist = SED_DIST_A[i];
    SED_YRS.forEach(yr => rows.push({
      Area:'Gulf',Location:'Loc-A',Station:st,Distance:dist,Year:yr,Date:_demoDate('Loc-A',yr,i),Report_Type:'EIA',
      Mercury: i<3 ? parseFloat((_dr(0.15,0.55)).toFixed(4)) : parseFloat((_dr(0.04,0.12)).toFixed(4)),
      Lead:    parseFloat((13+dist/600+_dr(-1,1)).toFixed(2)),
      Cadmium: parseFloat((0.22+dist/80000+_dr(-0.02,0.02)).toFixed(3)),
      Copper:  parseFloat((9.5+dist/1200+_dr(-0.5,0.5)).toFixed(2)),
      Zinc:    parseFloat((60+dist/250+_dr(-3,3)).toFixed(1)),
      Arsenic: parseFloat((6.2+dist/1500+_dr(-0.3,0.3)).toFixed(2)),
      Nickel:  i<5 ? parseFloat((_dr(20.5,24)).toFixed(2)) : parseFloat((_dr(16,20)).toFixed(2)),
      Chromium:parseFloat((35+i*2+_dr(-2,2)).toFixed(1)),
      TPH:     parseFloat((24+dist/600+_dr(-2,2)).toFixed(1)),
      TOC:     parseFloat((1.3+dist/6000+_dr(-0.05,0.05)).toFixed(2)),
      Sand:    parseFloat(Math.max(20,55-dist/350+_dr(-2,2)).toFixed(1)),
      Silt:    parseFloat((30+dist/500+_dr(-1.5,1.5)).toFixed(1)),
      Clay:    parseFloat((12+dist/700+_dr(-1,1)).toFixed(1)),
      Manganese:parseFloat((110+i*8+_dr(-5,5)).toFixed(1)),
      Iron:    parseFloat((11000+i*400+_dr(-300,300)).toFixed(0)),
      Barium:  parseFloat((120+i*15+_dr(-8,8)).toFixed(1)),
    }));
  });
  SED_STS_B.forEach((st,i) => {
    const dist = SED_DIST_B[i];
    SED_YRS.forEach(yr => rows.push({
      Area:'Gulf',Location:'Loc-B',Station:st,Distance:dist,Year:yr,Date:_demoDate('Loc-B',yr,i),Report_Type:'EIA',
      Mercury: parseFloat((0.10+dist/22000+_dr(-0.01,0.01)).toFixed(4)),
      Lead:    parseFloat((15+dist/550+_dr(-1,1)).toFixed(2)),
      Cadmium: parseFloat((0.25+dist/75000+_dr(-0.02,0.02)).toFixed(3)),
      Copper:  parseFloat((11+dist/1100+_dr(-0.5,0.5)).toFixed(2)),
      Zinc:    parseFloat((68+dist/230+_dr(-3,3)).toFixed(1)),
      Arsenic: parseFloat((7.0+dist/1400+_dr(-0.3,0.3)).toFixed(2)),
      Nickel:  parseFloat((18+i*0.5+_dr(-1,1)).toFixed(2)),
      Chromium:parseFloat((38+i*2+_dr(-2,2)).toFixed(1)),
      TPH:     parseFloat((28+dist/550+_dr(-2,2)).toFixed(1)),
      TOC:     parseFloat((1.5+dist/5500+_dr(-0.05,0.05)).toFixed(2)),
      Sand:    parseFloat(Math.max(18,52-dist/320+_dr(-2,2)).toFixed(1)),
      Silt:    parseFloat((33+dist/480+_dr(-1.5,1.5)).toFixed(1)),
      Clay:    parseFloat((14+dist/650+_dr(-1,1)).toFixed(1)),
      Manganese:parseFloat((125+i*9+_dr(-5,5)).toFixed(1)),
      Iron:    parseFloat((12500+i*450+_dr(-300,300)).toFixed(0)),
      Barium:  parseFloat((135+i*18+_dr(-8,8)).toFixed(1)),
    }));
  });
  return rows;
}

// ── SW ───────────────────────────────────────────────────────────────────────
const SW_STS_A = ['SW-A01','SW-A02','SW-A03','SW-A04','SW-A05','SW-A06','SW-A07','SW-A08','SW-A09','SW-A10'];
const SW_STS_B = ['SW-B01','SW-B02','SW-B03','SW-B04','SW-B05','SW-B06','SW-B07','SW-B08','SW-B09','SW-B10'];
const SW_YRS   = [2020,2021,2022,2023];

function swRow(loc,st,yr,si,bDO,bBOD,bpH,bSS,bTDS,bTurb,bNH3,bHg,bPb,bCd){
  return {Area:'Basin',Location:loc,Station:st,Year:yr,Date:_demoDate(loc.includes('Loc')?loc:'River',yr,si||0),Report_Type:'EIA',
    DO:parseFloat((bDO*_dr(0.88,1.12)).toFixed(2)),BOD:parseFloat((bBOD*_dr(0.80,1.20)).toFixed(2)),
    pH:parseFloat((_dr(bpH-0.2,bpH+0.2)).toFixed(2)),SS:parseFloat((bSS*_dr(0.75,1.25)).toFixed(1)),
    TDS:parseFloat((bTDS*_dr(0.88,1.12)).toFixed(0)),Turbidity:parseFloat((bTurb*_dr(0.75,1.25)).toFixed(1)),
    Temp:parseFloat((_dr(27.5,31.5)).toFixed(1)),NH3_N:parseFloat((bNH3*_dr(0.70,1.30)).toFixed(3)),
    Mercury:parseFloat((bHg*_dr(0.7,1.3)).toFixed(5)),Lead:parseFloat((bPb*_dr(0.75,1.25)).toFixed(4)),
    Cadmium:parseFloat((bCd*_dr(0.7,1.3)).toFixed(5)),
  };
}

function buildSw() {
  const rows = [];
  SW_YRS.forEach(yr => rows.push(swRow('River','REF-01',yr,0,7.4,1.2,7.7,10,165,6.5,0.03,0.0004,0.003,0.0003)));
  rows.push(swRow('Baseline','BL-01',2019,0,6.8,1.8,7.6,14,195,9.2,0.06,0.0006,0.004,0.0005));
  SW_STS_A.forEach((st,i) => SW_YRS.forEach(yr => rows.push(swRow('Loc-A',st,yr,i,6.2-i*0.12,2.2+i*0.18,7.55-i*0.02,18+i*2.5,210+i*8,12+i*1.5,0.08+i*0.015,0.0006+i*0.00005,0.004+i*0.0004,0.0005+i*0.00003))));
  SW_STS_B.forEach((st,i) => SW_YRS.forEach(yr => rows.push(swRow('Loc-B',st,yr,i,5.9-i*0.10,2.8+i*0.22,7.48-i*0.02,22+i*3.0,240+i*10,15+i*1.8,0.12+i*0.018,0.0008+i*0.00006,0.005+i*0.0005,0.0006+i*0.00004))));
  return rows;
}

// ── AIR ──────────────────────────────────────────────────────────────────────
const AIR_STS_A = ['AIR-A01','AIR-A02','AIR-A03','AIR-A04','AIR-A05','AIR-A06','AIR-A07','AIR-A08','AIR-A09','AIR-A10'];
const AIR_STS_B = ['AIR-B01','AIR-B02','AIR-B03','AIR-B04','AIR-B05','AIR-B06','AIR-B07','AIR-B08','AIR-B09','AIR-B10'];
const AIR_YRS   = [2020,2021,2022,2023];

function airRow(loc,st,yr,si,b25,b10,bO3,bNO2,bSO2,bCO){
  return {Area:'Province',Location:loc,Station:st,Year:yr,Date:_demoDate('Province',yr,si||0),Report_Type:'EIA',
    PM2_5_24h:parseFloat((b25*_dr(0.82,1.18)).toFixed(1)),PM2_5_annual:parseFloat((b25*0.65*_dr(0.88,1.12)).toFixed(1)),
    PM10_24h:parseFloat((b10*_dr(0.80,1.20)).toFixed(1)),PM10_annual:parseFloat((b10*0.62*_dr(0.88,1.12)).toFixed(1)),
    O3_8h:parseFloat((bO3*_dr(0.80,1.20)).toFixed(4)),NO2_1h:parseFloat((bNO2*_dr(0.78,1.22)).toFixed(4)),
    NO2_annual:parseFloat((bNO2*0.55*_dr(0.85,1.15)).toFixed(4)),SO2_24h:parseFloat((bSO2*_dr(0.75,1.25)).toFixed(4)),
    CO_8h:parseFloat((bCO*_dr(0.82,1.18)).toFixed(2)),
  };
}

function buildAir() {
  const rows = [];
  AIR_YRS.forEach(yr => rows.push(airRow('Background','REF-01',yr,0,16,32,0.052,0.019,0.008,1.1)));
  rows.push(airRow('Background','BL-01',2019,0,14,29,0.048,0.017,0.007,0.95));
  AIR_STS_A.forEach((st,i) => AIR_YRS.forEach(yr => rows.push(airRow('Loc-A',st,yr,i,26+i*1.2,46+i*2.0,0.062+i*0.001,0.032+i*0.001,0.018+i*0.001,1.8+i*0.08))));
  AIR_STS_B.forEach((st,i) => AIR_YRS.forEach(yr => rows.push(airRow('Loc-B',st,yr,i,29+i*1.4,52+i*2.2,0.068+i*0.001,0.036+i*0.0012,0.022+i*0.0012,2.1+i*0.09))));
  return rows;
}

// ── NOISE ─────────────────────────────────────────────────────────────────────
const NST_A     = ['NST-A01','NST-A02','NST-A03','NST-A04','NST-A05','NST-A06','NST-A07','NST-A08','NST-A09','NST-A10'];
const NST_B     = ['NST-B01','NST-B02','NST-B03','NST-B04','NST-B05','NST-B06','NST-B07','NST-B08','NST-B09','NST-B10'];
const NOISE_YRS = [2020,2021,2022,2023];

function noiseRow(loc,st,yr,si,bDay,bNight,bMax,bL90){
  return {Area:'Site',Location:loc,Station:st,Year:yr,Date:_demoDate('Site',yr,si||0),Report_Type:'EIA',
    Leq_day:parseFloat((bDay*_dr(0.95,1.05)).toFixed(1)),Leq_night:parseFloat((bNight*_dr(0.94,1.06)).toFixed(1)),
    Lmax:parseFloat((bMax*_dr(0.93,1.07)).toFixed(1)),L90:parseFloat((bL90*_dr(0.92,1.08)).toFixed(1)),
  };
}

function buildNoise() {
  const rows = [];
  NOISE_YRS.forEach(yr => rows.push(noiseRow('Background','REF-01',yr,0,48,38,65,35)));
  rows.push(noiseRow('Background','BL-01',2019,0,46,36,62,33));
  NST_A.forEach((st,i) => NOISE_YRS.forEach(yr => rows.push(noiseRow('Loc-A',st,yr,i,62+i*1.2,52+i*0.9,78+i*1.5,46+i*0.8))));
  NST_B.forEach((st,i) => NOISE_YRS.forEach(yr => rows.push(noiseRow('Loc-B',st,yr,i,66+i*1.3,55+i*1.0,82+i*1.6,49+i*0.9))));
  return rows;
}

/** Generate all demo data (lazy — called once on first use) */
let _cache = null;
export function getDemoData() {
  if (!_cache) {
    _seed = 42; // reset seed for reproducibility
    _cache = {
      sea:   buildSea(),
      sed:   buildSed(),
      sw:    buildSw(),
      air:   buildAir(),
      noise: buildNoise(),
    };
  }
  return _cache;
}

export const DEMO_AUTO_TICKS = {
  ref: 'REF-01',
  baseline: 'BL-01',
};
