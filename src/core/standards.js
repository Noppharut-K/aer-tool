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
};

/** Tab configuration */
export const TYPE_CFG = {
  sea:  { name:'Seawater',      c:'var(--sea-c)',   l:'var(--sea-l)',   b:'var(--sea-b)' },
  sed:  { name:'Sediment',      c:'var(--sed-c)',   l:'var(--sed-l)',   b:'var(--sed-b)' },
  bio:  { name:'Biology',       c:'var(--bio-c)',   l:'var(--bio-l)',   b:'var(--bio-l)' },
};

/** MRL defaults per tab */
export const MRL_DEFAULTS = {
  sea: {
    Mercury:0.05, Lead:1.0, Cadmium:0.5, Copper:1.0, Zinc:5.0,
    Arsenic:1.0, Manganese:5.0, Iron:10.0, TPH:0.05,
  }
};
