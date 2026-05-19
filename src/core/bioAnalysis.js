/**
 * bioAnalysis.js — Biology indices calculation
 * Logic per module:
 *   Benthos:       ROUNDUP per Phylum → N
 *   Phytoplankton: SUM density directly (no roundup, no phylum grouping)
 *   Zooplankton:   Same as Benthos (ROUNDUP per Phylum)
 *   Larvae:        ROUNDUP per Order → N
 */

function roundup0(x) {
  if (x == null || isNaN(x)) return 0;
  return x >= 0 ? Math.ceil(x) : Math.floor(x);
}

function dominantTaxon(rows, taxonKey, densityKey) {
  if (!rows.length) return '';
  let max = -Infinity, tops = [];
  rows.forEach(r => {
    const v = parseFloat(r[densityKey]);
    if (isNaN(v) || v <= 0) return;
    if (v > max) { max = v; tops = [r[taxonKey]]; }
    else if (v === max) tops.push(r[taxonKey]);
  });
  return tops.join(' / ');
}

export function calcIndicesByPhylum(rows, densityKey, phylumKey) {
  const valid = rows.map(r => ({ d: parseFloat(r[densityKey]), phylum: String(r[phylumKey] || '').trim() })).filter(r => !isNaN(r.d) && r.d > 0);
  const S = valid.length;
  if (S === 0) return { N: NaN, S: 0, H: NaN, Richness: NaN, Evenness: NaN };
  const phylumMap = {};
  valid.forEach(r => { if (!phylumMap[r.phylum]) phylumMap[r.phylum] = 0; phylumMap[r.phylum] += r.d; });
  const N = Object.values(phylumMap).reduce((a, b) => a + roundup0(b), 0);
  if (N <= 0) return { N: NaN, S: 0, H: NaN, Richness: NaN, Evenness: NaN };
  const p = valid.map(r => r.d / N).filter(v => v > 0);
  const H = -p.reduce((a, v) => a + v * Math.log(v), 0);
  return { N, S, H, Richness: S > 1 ? (S-1)/Math.log(N) : NaN, Evenness: S > 1 && isFinite(H) ? H/Math.log(S) : NaN };
}

export function calcIndicesPhyto(rows, densityKey) {
  const vals = rows.map(r => parseFloat(r[densityKey])).filter(v => !isNaN(v) && v > 0);
  const S = vals.length, N = vals.reduce((a, b) => a + b, 0);
  if (S === 0 || N <= 0) return { N: NaN, S: 0, H: NaN, Richness: NaN, Evenness: NaN };
  const p = vals.map(v => v / N).filter(v => v > 0);
  const H = -p.reduce((a, v) => a + v * Math.log(v), 0);
  return { N, S, H, Richness: S > 1 ? (S-1)/Math.log(N) : NaN, Evenness: S > 1 && isFinite(H) ? H/Math.log(S) : NaN };
}

export function calcIndicesByOrder(rows, densityKey, orderKey) {
  const valid = rows.map(r => ({ d: parseFloat(r[densityKey]), order: String(r[orderKey] || '').trim() })).filter(r => !isNaN(r.d) && r.d > 0);
  const S = valid.length;
  if (S === 0) return { N: NaN, S: 0, H: NaN, Richness: NaN, Evenness: NaN };
  const orderMap = {};
  valid.forEach(r => { if (!orderMap[r.order]) orderMap[r.order] = 0; orderMap[r.order] += r.d; });
  const N = Object.values(orderMap).reduce((a, b) => a + roundup0(b), 0);
  if (N <= 0) return { N: NaN, S: 0, H: NaN, Richness: NaN, Evenness: NaN };
  const p = valid.map(r => r.d / N).filter(v => v > 0);
  const H = -p.reduce((a, v) => a + v * Math.log(v), 0);
  return { N, S, H, Richness: S > 1 ? (S-1)/Math.log(N) : NaN, Evenness: S > 1 && isFinite(H) ? H/Math.log(S) : NaN };
}

function getCalcFn(moduleKey) {
  if (moduleKey === 'phytoplankton') return (rows) => calcIndicesPhyto(rows, 'density');
  if (moduleKey === 'larvae')        return (rows) => calcIndicesByOrder(rows, 'density', 'phylum');
  return (rows) => calcIndicesByPhylum(rows, 'density', 'phylum');
}

export function processBio(raw, cols, moduleKey = 'benthos') {
  const { station:stCol, replicate:repCol, phylum:phyCol, taxon:taxCol, density:denCol, year:yrCol, location:locCol } = cols;
  if (!stCol || !repCol || !phyCol || !taxCol || !denCol) return { groups: {} };
  const calcFn = getCalcFn(moduleKey);
  const data = raw.map(r => ({
    station:   String(r[stCol]   || '').trim(),
    replicate: String(r[repCol]  || '').trim(),
    phylum:    String(r[phyCol]  || '').trim(),
    taxon:     String(r[taxCol]  || '').trim(),
    density:   parseFloat(r[denCol]),
    year:      yrCol  ? String(r[yrCol]  || '').trim() : 'ALL',
    location:  locCol ? String(r[locCol] || '').trim() : 'ALL',
  })).filter(r => r.station && r.replicate && r.phylum && r.taxon && !isNaN(r.density) && r.density >= 0);

  const groupMap = {};
  data.forEach(r => {
    const k = r.year + '||' + r.location;
    if (!groupMap[k]) groupMap[k] = { year: r.year, location: r.location, rows: [] };
    groupMap[k].rows.push(r);
  });

  const groups = {};
  Object.entries(groupMap).forEach(([k, g]) => {
    const stations = [...new Set(g.rows.map(r => r.station))].sort();
    const stationData = stations.map(st => {
      const stRows     = g.rows.filter(r => r.station === st);
      const replicates = [...new Set(stRows.map(r => r.replicate))].sort();
      const repIndices = replicates.map(rep => {
        const repRows = stRows.filter(r => r.replicate === rep);
        return { replicate: rep, ...calcFn(repRows), dominant: dominantTaxon(repRows, 'taxon', 'density') };
      });
      const allTaxa = [...new Set(stRows.map(r => r.taxon))];
      const taxonMeans = allTaxa.map(tx => {
        const txRows = stRows.filter(r => r.taxon === tx);
        const phy = txRows[0]?.phylum || '';
        const repVals = replicates.map(rep => stRows.filter(r => r.replicate === rep && r.taxon === tx).reduce((a, r) => a + r.density, 0));
        return { taxon: tx, phylum: phy, meanDensity: repVals.reduce((a,b)=>a+b,0) / repVals.length };
      });
      const meanRows = taxonMeans.map(t => ({ density: t.meanDensity, phylum: t.phylum, taxon: t.taxon }));
      return { station: st, replicates: repIndices, taxonMeans, indices: calcFn(meanRows), dominant: dominantTaxon(meanRows.filter(r=>r.density>0), 'taxon', 'density') };
    });
    groups[k] = { year: g.year, location: g.location, stations: stationData };
  });
  return { groups };
}

// ── Demo Data ─────────────────────────────────────────────────────────────────
let _seed = 99;
function _rnd(min, max) { _seed=(_seed*1664525+1013904223)&0xffffffff; return min+((_seed>>>0)/0xffffffff)*(max-min); }
function _rndInt(min, max) { return Math.round(_rnd(min, max)); }

const STATIONS  = ['ST-01','ST-02','ST-03','ST-04','ST-05'];
const REPS      = ['R1','R2','R3'];
const YEARS     = [2022, 2023];
const LOCATIONS = ['Loc-A','Loc-B'];

const BENTHOS_TAXA = [
  {taxon:'Polychaeta sp.1',  phylum:'Annelida'},   {taxon:'Polychaeta sp.2',  phylum:'Annelida'},
  {taxon:'Bivalvia sp.1',    phylum:'Mollusca'},    {taxon:'Gastropoda sp.1',  phylum:'Mollusca'},
  {taxon:'Amphipoda sp.1',   phylum:'Arthropoda'},  {taxon:'Isopoda sp.1',     phylum:'Arthropoda'},
  {taxon:'Nemertea sp.1',    phylum:'Nemertea'},    {taxon:'Oligochaeta sp.1', phylum:'Annelida'},
];
const PHYTO_TAXA = [
  {taxon:'Coscinodiscus sp.',phylum:'Bacillariophyta'}, {taxon:'Chaetoceros sp.', phylum:'Bacillariophyta'},
  {taxon:'Noctiluca sp.',    phylum:'Dinoflagellata'},  {taxon:'Ceratium sp.',    phylum:'Dinoflagellata'},
  {taxon:'Rhizosolenia sp.', phylum:'Bacillariophyta'}, {taxon:'Skeletonema sp.', phylum:'Bacillariophyta'},
];
const ZOO_TAXA = [
  {taxon:'Copepoda sp.1',    phylum:'Arthropoda'},  {taxon:'Copepoda sp.2',    phylum:'Arthropoda'},
  {taxon:'Chaetognatha sp.', phylum:'Chaetognatha'},{taxon:'Medusae sp.1',     phylum:'Cnidaria'},
  {taxon:'Euphausiacea sp.', phylum:'Arthropoda'},  {taxon:'Appendicularia sp.',phylum:'Chordata'},
];
const LARVAE_TAXA = [
  {taxon:'Engraulidae',  phylum:'Perciformes'},   {taxon:'Scombridae',   phylum:'Perciformes'},
  {taxon:'Clupeidae',    phylum:'Clupeiformes'},  {taxon:'Gobiidae',     phylum:'Perciformes'},
  {taxon:'Penaeidae',    phylum:'Decapoda'},       {taxon:'Sergestidae',  phylum:'Decapoda'},
];

function makeDemoRows(taxa, dMin, dMax) {
  _seed = 99;
  const rows = [];
  LOCATIONS.forEach(loc => YEARS.forEach(yr => STATIONS.forEach(st => REPS.forEach(rep => {
    const n = _rndInt(3, taxa.length);
    const shuffled = [...taxa].sort(() => _rnd(-1,1));
    shuffled.slice(0, n).forEach(tx => rows.push({
      Location: loc, Year: yr, Station: st, Replicate: rep,
      Phylum: tx.phylum, Taxon: tx.taxon,
      Density: parseFloat(_rnd(dMin, dMax).toFixed(2)),
    }));
  }))));
  return rows;
}

export const BIO_DEMO = {
  benthos:       makeDemoRows(BENTHOS_TAXA, 0.5, 120),
  phytoplankton: makeDemoRows(PHYTO_TAXA,  10,  8000),
  zooplankton:   makeDemoRows(ZOO_TAXA,    1,   500),
  larvae:        makeDemoRows(LARVAE_TAXA, 0.1, 50),
};

export const BIO_DEMO_COLS = {
  benthos:       { station:'Station', replicate:'Replicate', phylum:'Phylum', taxon:'Taxon', density:'Density', year:'Year', location:'Location' },
  phytoplankton: { station:'Station', replicate:'Replicate', phylum:'Phylum', taxon:'Taxon', density:'Density', year:'Year', location:'Location' },
  zooplankton:   { station:'Station', replicate:'Replicate', phylum:'Phylum', taxon:'Taxon', density:'Density', year:'Year', location:'Location' },
  larvae:        { station:'Station', replicate:'Replicate', phylum:'Phylum', taxon:'Taxon', density:'Density', year:'Year', location:'Location' },
};
