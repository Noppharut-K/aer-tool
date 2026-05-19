/** Environmental quality standards database */
export const STD = {
  sea: {
    DO:       { unit:'mg/L',     pcd_min:4.0,                         label:'DO' },
    pH:       { unit:'-',        pcd_min:7.0, pcd_max:8.5,            label:'pH' },
    Mercury:  { unit:'µg/L',     pcd_max:0.1,                         label:'Mercury (Hg)' },
    Cadmium:  { unit:'µg/L',     pcd_max:5.0,                         label:'Cadmium (Cd)' },
    Chromium: { unit:'µg/L',     pcd_max:100,                         label:'Chromium (Cr)' },
    Copper:   { unit:'µg/L',     pcd_max:8.0,                         label:'Copper (Cu)' },
    Lead:     { unit:'µg/L',     pcd_max:8.5,                         label:'Lead (Pb)' },
    Zinc:     { unit:'µg/L',     pcd_max:50,                          label:'Zinc (Zn)' },
    Arsenic:  { unit:'µg/L',     pcd_max:10,                          label:'Arsenic (As)' },
    Manganese:{ unit:'µg/L',     pcd_max:100,                         label:'Manganese (Mn)' },
    Iron:     { unit:'µg/L',     pcd_max:300,                         label:'Iron (Fe)' },
    TPH:      { unit:'µg/L',     pcd_max:0.5,                         label:'TPH' },
    NO3_N:    { unit:'µg/L',     pcd_max:60,                          label:'NO₃-N' },
    Salinity: { unit:'psu',                                            label:'Salinity' },
    Turbidity:{ unit:'NTU',                                            label:'Turbidity' },
    BOD:      { unit:'mg/L',                                           label:'BOD' },
    TSS:      { unit:'mg/L',                                           label:'TSS' },
    Temp:     { unit:'°C',                                             label:'Temperature' },
  },
  sed: {
    Mercury:  { unit:'mg/kg dw', pcd_max:0.4,  erl:0.15, erm:0.71,   label:'Mercury (Hg)' },
    Lead:     { unit:'mg/kg dw', pcd_max:52,   erl:46.7, erm:218,    label:'Lead (Pb)' },
    Cadmium:  { unit:'mg/kg dw', pcd_max:2,    erl:1.2,  erm:9.6,    label:'Cadmium (Cd)' },
    Copper:   { unit:'mg/kg dw', pcd_max:25,   erl:34,   erm:270,    label:'Copper (Cu)' },
    Zinc:     { unit:'mg/kg dw', pcd_max:102,  erl:150,  erm:410,    label:'Zinc (Zn)' },
    Arsenic:  { unit:'mg/kg dw', pcd_max:7,    erl:8.2,  erm:70,     label:'Arsenic (As)' },
    Nickel:   { unit:'mg/kg dw', erl:20.9,     erm:51.6,             label:'Nickel (Ni)' },
    Chromium: { unit:'mg/kg dw', pcd_max:42,   erl:81,   erm:370,    label:'Chromium (Cr)' },
    TPH:      { unit:'mg/kg dw',                                       label:'TPH' },
    TOC:      { unit:'%',                                              label:'TOC' },
    Iron:     { unit:'mg/kg dw',                                       label:'Iron (Fe)' },
    Manganese:{ unit:'mg/kg dw',                                       label:'Manganese (Mn)' },
    Barium:   { unit:'mg/kg dw',                                       label:'Barium (Ba)' },
    Sand:     { unit:'%',                                              label:'Sand' },
    Silt:     { unit:'%',                                              label:'Silt' },
    Clay:     { unit:'%',                                              label:'Clay' },
  },
  sw: {
    DO:       { unit:'mg/L',  pcd_min:4.0, who_min:5.0, epa_min:5.0,         label:'DO' },
    BOD:      { unit:'mg/L',  pcd_max:4.0, who_max:5.0, epa_max:5.0,         label:'BOD' },
    pH:       { unit:'-',     pcd_min:5.0, pcd_max:9.0, who_min:6.5, who_max:9.0, label:'pH' },
    SS:       { unit:'mg/L',  pcd_max:50,  epa_max:30,                        label:'SS' },
    TDS:      { unit:'mg/L',  pcd_max:500, who_max:600,                       label:'TDS' },
    Turbidity:{ unit:'NTU',   pcd_max:100, who_max:5,                         label:'Turbidity' },
    Temp:     { unit:'°C',    pcd_max:35,                                      label:'Temperature' },
    NH3_N:    { unit:'mg/L',  pcd_max:0.5, who_max:1.5,                       label:'NH₃-N' },
    Mercury:  { unit:'µg/L',  pcd_max:2.0, who_max:1.0,                       label:'Mercury (Hg)' },
    Lead:     { unit:'µg/L',  pcd_max:50,  who_max:10,                        label:'Lead (Pb)' },
    Cadmium:  { unit:'µg/L',  pcd_max:5,   who_max:3,                         label:'Cadmium (Cd)' },
  },
  air: {
    PM2_5_24h:   { unit:'µg/m³', pcd_max:37.5, who_max:15,  epa_max:35,  label:'PM2.5 (24h)' },
    PM2_5_annual:{ unit:'µg/m³', pcd_max:25,   who_max:5,   epa_max:12,  label:'PM2.5 (annual)' },
    PM10_24h:    { unit:'µg/m³', pcd_max:120,  who_max:45,  epa_max:150, label:'PM10 (24h)' },
    PM10_annual: { unit:'µg/m³', pcd_max:50,   who_max:15,               label:'PM10 (annual)' },
    O3_8h:       { unit:'ppm',   pcd_max:0.07, who_max:0.06,epa_max:0.07,label:'O₃ (8h)' },
    NO2_1h:      { unit:'ppm',   pcd_max:0.17, epa_max:0.1,              label:'NO₂ (1h)' },
    NO2_annual:  { unit:'ppm',   pcd_max:0.05, who_max:0.005,epa_max:0.053,label:'NO₂ (annual)' },
    SO2_24h:     { unit:'ppm',   pcd_max:0.12, who_max:0.01,epa_max:0.14,label:'SO₂ (24h)' },
    CO_8h:       { unit:'ppm',   pcd_max:9.0,  epa_max:9.0,              label:'CO (8h)' },
  },
  noise: {}
};

/** Parameter name alias map (lowercase key → canonical name) */
export const ALIAS = {
  'do':'DO', 'dissolved oxygen':'DO', 'o2':'DO',
  'bod':'BOD', 'bod5':'BOD', 'ph':'pH',
  'ss':'SS', 'tss':'TSS', 'suspended solids':'SS',
  'tds':'TDS', 'turbidity':'Turbidity', 'ntu':'Turbidity',
  'temp':'Temp', 'temperature':'Temp',
  'nh3_n':'NH3_N', 'nh3-n':'NH3_N', 'ammonia':'NH3_N',
  'salinity':'Salinity', 'no3_n':'NO3_N', 'no3-n':'NO3_N',
  'tph':'TPH', 'toc':'TOC', 'sand':'Sand', 'silt':'Silt', 'clay':'Clay',
  'hg':'Mercury', 'mercury':'Mercury', 'pb':'Lead', 'lead':'Lead',
  'cd':'Cadmium', 'cadmium':'Cadmium', 'cu':'Copper', 'copper':'Copper',
  'zn':'Zinc', 'zinc':'Zinc', 'as':'Arsenic', 'arsenic':'Arsenic',
  'ni':'Nickel', 'nickel':'Nickel', 'cr':'Chromium', 'chromium':'Chromium',
  'fe':'Iron', 'iron':'Iron', 'mn':'Manganese', 'manganese':'Manganese',
  'ba':'Barium', 'barium':'Barium',
  'pm2.5':'PM2_5_24h', 'pm25':'PM2_5_24h', 'pm10':'PM10_24h',
  'o3':'O3_8h', 'no2':'NO2_1h', 'so2':'SO2_24h', 'co':'CO_8h',
};

/** Tab configuration */
export const TYPE_CFG = {
  sea:  { name:'Seawater',      c:'var(--sea-c)',   l:'var(--sea-l)',   b:'var(--sea-b)' },
  sed:  { name:'Sediment',      c:'var(--sed-c)',   l:'var(--sed-l)',   b:'var(--sed-b)' },
  sw:   { name:'Surface Water', c:'var(--sw-c)',    l:'var(--sw-l)',    b:'var(--sw-b)' },
  air:  { name:'Air Quality',   c:'var(--air-c)',   l:'var(--air-l)',   b:'var(--air-b)' },
  noise:{ name:'Noise',         c:'var(--noise-c)', l:'var(--noise-l)', b:'var(--noise-b)' },
  bio:  { name:'Biology',       c:'var(--bio-c)',   l:'var(--bio-l)',   b:'var(--bio-l)' },
};

/** MRL defaults per tab */
export const MRL_DEFAULTS = {
  sea: {
    Mercury:0.05, Lead:1.0, Cadmium:0.5, Copper:1.0, Zinc:5.0,
    Arsenic:1.0, Manganese:5.0, Iron:10.0, TPH:0.05,
  }
};
