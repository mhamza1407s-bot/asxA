import {
  FarmObservationItem,
  FarmTaskItem,
  IrrigationLogItem,
  MyFarmRecord,
  PlanDecisionEvent,
  PortfolioFieldRecord,
} from '../types/myFarms';
import { SoilMoistureUnit, SoilTexture } from '../types/farm';
import { EonetFetchResult, PowerClimateResult } from '../types';
import { ExtendedFieldWeatherResult, LiveWeatherReading } from '../services/weather';
import { formatSoilMoistureUnitLabel, resolveEffectiveFieldSoil } from './soilProvenance';

export const AGRONOMY_ENGINE_VERSION = 'fieldshift-fao56-v1.3.0';
export const CROP_KNOWLEDGE_VERSION = 'fao56-crop-lib-v1.2.0';

export type FactTypeLabel =
  | 'Observed'
  | 'Reanalysis'
  | 'Forecast'
  | 'Modelled'
  | 'Calculated'
  | 'Farmer-reported'
  | 'Lab-measured'
  | 'Mapped estimate'
  | 'Unavailable';

export type ConfidenceLevel = 'High' | 'Moderate' | 'Low' | 'Unavailable';

export interface MetricInputRecord {
  label: string;
  value: string;
  source: string;
}

export interface InspectableMetric {
  id: string;
  title: string;
  question: string;
  valueDisplay: string;
  unit: string;
  period: string;
  timezone: string;
  factType: FactTypeLabel;
  sourceName: string;
  observationTime: string;
  retrievalTime: string;
  spatialResolution: string;
  fieldCoverageNote: string;
  formulaVersion: string;
  formulaDisplay: string;
  inputs: MetricInputRecord[];
  intermediateSteps: string[];
  confidenceLevel: ConfidenceLevel;
  confidencePct?: number;
  limitations: string;
  relatedContext: string;
}

export interface CropKnowledgeEntry {
  id: string;
  commonName: string;
  scientificName: string;
  cropFamily: string;
  defaultVariety: string;
  purpose: string;
  tBaseC: number;
  tUpperC: number;
  heatThresholdC: number;
  frostThresholdC: number;
  criticalHeatNote: string;
  kcIni: number;
  kcMid: number;
  kcEnd: number;
  kcbIni: number;
  kcbMid: number;
  kcbEnd: number;
  stageDays: { ini: number; dev: number; mid: number; late: number };
  stageGdd: { ini: number; dev: number; mid: number; late: number };
  zrMinM: number;
  zrMaxM: number;
  pBase: number;
  sensitiveStages: string;
  optimalPh: [number, number];
  ecThresholdDsM: number;
  drainageTolerance: string;
  uptakePerTonneKg: { n: number; p: number; k: number; targetYieldBasisTHa: number };
  defaultNextCrop: string;
  defaultPrevCrop: string;
  sourceRef: string;
}

export const CROP_KNOWLEDGE_LIBRARY: Record<string, CropKnowledgeEntry> = {
  maize: {
    id: 'maize',
    commonName: 'Maize',
    scientificName: 'Zea mays L.',
    cropFamily: 'Poaceae (C4 Cereal)',
    defaultVariety: 'Pioneer P0725 (Reference Hybrid)',
    purpose: 'Grain / Silage',
    tBaseC: 10,
    tUpperC: 30,
    heatThresholdC: 35,
    frostThresholdC: 2,
    criticalHeatNote: 'Tasseling / silking pollen viability drops above 35 °C',
    kcIni: 0.30,
    kcMid: 1.20,
    kcEnd: 0.35,
    kcbIni: 0.15,
    kcbMid: 1.15,
    kcbEnd: 0.30,
    stageDays: { ini: 20, dev: 30, mid: 35, late: 25 },
    stageGdd: { ini: 180, dev: 520, mid: 1050, late: 1450 },
    zrMinM: 0.30,
    zrMaxM: 1.20,
    pBase: 0.55,
    sensitiveStages: 'Silking, pollination & blister/milk grain fill',
    optimalPh: [5.8, 7.2],
    ecThresholdDsM: 1.7,
    drainageTolerance: 'Moderately well-drained; intolerant of prolonged waterlogging > 48 h',
    uptakePerTonneKg: { n: 22.0, p: 4.1, k: 18.5, targetYieldBasisTHa: 9.0 },
    defaultNextCrop: 'Soybean',
    defaultPrevCrop: 'Wheat',
    sourceRef: 'FAO Irrigation & Drainage Paper 56 (Tables 11, 12, 17, 22)',
  },
  wheat: {
    id: 'wheat',
    commonName: 'Wheat',
    scientificName: 'Triticum aestivum L.',
    cropFamily: 'Poaceae (C3 Cereal)',
    defaultVariety: 'Norwest 553 (Reference Spring/Winter)',
    purpose: 'Grain',
    tBaseC: 4,
    tUpperC: 26,
    heatThresholdC: 31,
    frostThresholdC: -2,
    criticalHeatNote: 'Anthesis & early grain-fill heat stress above 31 °C reduces kernel weight',
    kcIni: 0.30,
    kcMid: 1.15,
    kcEnd: 0.30,
    kcbIni: 0.15,
    kcbMid: 1.10,
    kcbEnd: 0.25,
    stageDays: { ini: 20, dev: 35, mid: 40, late: 25 },
    stageGdd: { ini: 220, dev: 650, mid: 1200, late: 1650 },
    zrMinM: 0.30,
    zrMaxM: 1.20,
    pBase: 0.55,
    sensitiveStages: 'Booting, heading, anthesis & early milk fill',
    optimalPh: [6.0, 7.5],
    ecThresholdDsM: 6.0,
    drainageTolerance: 'Moderately tolerant to brief saturation; vulnerable during germination',
    uptakePerTonneKg: { n: 26.0, p: 4.5, k: 19.0, targetYieldBasisTHa: 5.5 },
    defaultNextCrop: 'Field Peas',
    defaultPrevCrop: 'Barley',
    sourceRef: 'FAO Irrigation & Drainage Paper 56 (Tables 11, 12, 17, 22)',
  },
  soybean: {
    id: 'soybean',
    commonName: 'Soybean',
    scientificName: 'Glycine max (L.) Merr.',
    cropFamily: 'Fabaceae (N-fixing Legume)',
    defaultVariety: 'Asgrow AG36X6 (Reference MG 3)',
    purpose: 'Oilseed / Protein Grain',
    tBaseC: 10,
    tUpperC: 30,
    heatThresholdC: 34,
    frostThresholdC: 2,
    criticalHeatNote: 'Pod set & R1–R4 flowering abortion increases above 34 °C',
    kcIni: 0.40,
    kcMid: 1.15,
    kcEnd: 0.50,
    kcbIni: 0.15,
    kcbMid: 1.10,
    kcbEnd: 0.35,
    stageDays: { ini: 18, dev: 28, mid: 40, late: 22 },
    stageGdd: { ini: 160, dev: 480, mid: 980, late: 1320 },
    zrMinM: 0.25,
    zrMaxM: 0.90,
    pBase: 0.50,
    sensitiveStages: 'Full bloom (R2) through pod-fill (R5)',
    optimalPh: [6.0, 7.0],
    ecThresholdDsM: 5.0,
    drainageTolerance: 'Requires well-aerated root zone for Bradyrhizobium nodulation',
    uptakePerTonneKg: { n: 62.0, p: 6.4, k: 22.0, targetYieldBasisTHa: 3.4 },
    defaultNextCrop: 'Winter Wheat',
    defaultPrevCrop: 'Maize',
    sourceRef: 'FAO Irrigation & Drainage Paper 56 (Tables 11, 12, 17, 22)',
  },
  barley: {
    id: 'barley',
    commonName: 'Barley',
    scientificName: 'Hordeum vulgare L.',
    cropFamily: 'Poaceae (C3 Cereal)',
    defaultVariety: 'LCS Odyssey (Reference Two-Row)',
    purpose: 'Malt / Feed Grain',
    tBaseC: 4,
    tUpperC: 26,
    heatThresholdC: 30,
    frostThresholdC: -2,
    criticalHeatNote: 'Grain-fill temperatures above 30 °C elevate protein & shrink plumpness',
    kcIni: 0.30,
    kcMid: 1.15,
    kcEnd: 0.25,
    kcbIni: 0.15,
    kcbMid: 1.10,
    kcbEnd: 0.20,
    stageDays: { ini: 15, dev: 28, mid: 34, late: 20 },
    stageGdd: { ini: 180, dev: 540, mid: 1020, late: 1380 },
    zrMinM: 0.25,
    zrMaxM: 1.00,
    pBase: 0.55,
    sensitiveStages: 'Stem elongation, heading & milky ripe',
    optimalPh: [6.2, 7.8],
    ecThresholdDsM: 8.0,
    drainageTolerance: 'Tolerates moderate salinity; poor tolerance of wet winter soils',
    uptakePerTonneKg: { n: 21.0, p: 3.8, k: 17.5, targetYieldBasisTHa: 5.0 },
    defaultNextCrop: 'Chickpeas',
    defaultPrevCrop: 'Peas',
    sourceRef: 'FAO Irrigation & Drainage Paper 56 (Tables 11, 12, 17, 22)',
  },
  peas: {
    id: 'peas',
    commonName: 'Field Peas',
    scientificName: 'Pisum sativum L.',
    cropFamily: 'Fabaceae (Pulse)',
    defaultVariety: 'CDC Amarillo (Reference Yellow Pea)',
    purpose: 'Pulse Grain',
    tBaseC: 4,
    tUpperC: 25,
    heatThresholdC: 28,
    frostThresholdC: -1,
    criticalHeatNote: 'Flower/pod abortion accelerates rapidly above 28 °C',
    kcIni: 0.45,
    kcMid: 1.15,
    kcEnd: 0.30,
    kcbIni: 0.15,
    kcbMid: 1.10,
    kcbEnd: 0.25,
    stageDays: { ini: 15, dev: 25, mid: 30, late: 18 },
    stageGdd: { ini: 150, dev: 450, mid: 880, late: 1180 },
    zrMinM: 0.25,
    zrMaxM: 0.80,
    pBase: 0.45,
    sensitiveStages: 'Flat pod to pod-fill (high moisture & cool canopy sensitivity)',
    optimalPh: [6.0, 7.2],
    ecThresholdDsM: 2.5,
    drainageTolerance: 'Sensitive to root rot in compacted/saturated clays',
    uptakePerTonneKg: { n: 45.0, p: 5.2, k: 18.0, targetYieldBasisTHa: 3.0 },
    defaultNextCrop: 'Wheat',
    defaultPrevCrop: 'Barley',
    sourceRef: 'FAO Irrigation & Drainage Paper 56 (Tables 11, 12, 17, 22)',
  },
  sunflower: {
    id: 'sunflower',
    commonName: 'Sunflower',
    scientificName: 'Helianthus annuus L.',
    cropFamily: 'Asteraceae',
    defaultVariety: 'N4H302 E (Reference High-Oleic)',
    purpose: 'Oilseed',
    tBaseC: 8,
    tUpperC: 30,
    heatThresholdC: 34,
    frostThresholdC: 1,
    criticalHeatNote: 'Anthesis heat > 34 °C lowers achene set & oil percentage',
    kcIni: 0.35,
    kcMid: 1.15,
    kcEnd: 0.35,
    kcbIni: 0.15,
    kcbMid: 1.10,
    kcbEnd: 0.25,
    stageDays: { ini: 20, dev: 30, mid: 35, late: 20 },
    stageGdd: { ini: 180, dev: 520, mid: 1020, late: 1380 },
    zrMinM: 0.30,
    zrMaxM: 1.40,
    pBase: 0.45,
    sensitiveStages: 'Budding (R1–R3), flowering (R5) & seed fill',
    optimalPh: [6.0, 7.5],
    ecThresholdDsM: 4.8,
    drainageTolerance: 'Deep taproot scavenges subsoil water; dislikes standing water',
    uptakePerTonneKg: { n: 34.0, p: 5.5, k: 28.0, targetYieldBasisTHa: 2.8 },
    defaultNextCrop: 'Lentils',
    defaultPrevCrop: 'Soybean',
    sourceRef: 'FAO Irrigation & Drainage Paper 56 (Tables 11, 12, 17, 22)',
  },
  vegetables: {
    id: 'vegetables',
    commonName: 'Specialty Vegetables',
    scientificName: 'Mixed Horticultural Crops',
    cropFamily: 'Mixed Annual Horticulture',
    defaultVariety: 'Field Block Cultivar (Unconfirmed)',
    purpose: 'Fresh Market',
    tBaseC: 7,
    tUpperC: 28,
    heatThresholdC: 32,
    frostThresholdC: 1,
    criticalHeatNote: 'Blossom/fruit set heat stress above 32 °C',
    kcIni: 0.50,
    kcMid: 1.05,
    kcEnd: 0.85,
    kcbIni: 0.25,
    kcbMid: 0.98,
    kcbEnd: 0.75,
    stageDays: { ini: 18, dev: 25, mid: 30, late: 15 },
    stageGdd: { ini: 150, dev: 450, mid: 880, late: 1120 },
    zrMinM: 0.20,
    zrMaxM: 0.60,
    pBase: 0.35,
    sensitiveStages: 'Transplant establishment, flowering & fruit sizing',
    optimalPh: [6.0, 6.8],
    ecThresholdDsM: 2.0,
    drainageTolerance: 'Requires high drainage & frequent shallow wetting',
    uptakePerTonneKg: { n: 3.5, p: 0.6, k: 4.2, targetYieldBasisTHa: 35.0 },
    defaultNextCrop: 'Cover Legume',
    defaultPrevCrop: 'Wheat',
    sourceRef: 'FAO Irrigation & Drainage Paper 56 (Vegetable reference tables)',
  },
};

export function resolveCropKnowledge(cropName: string | null | undefined): CropKnowledgeEntry {
  const lower = (cropName || '').toLowerCase();
  if (lower.includes('corn') || lower.includes('maize')) return CROP_KNOWLEDGE_LIBRARY.maize;
  if (lower.includes('soy')) return CROP_KNOWLEDGE_LIBRARY.soybean;
  if (lower.includes('barley') || lower.includes('oat') || lower.includes('rye')) {
    return CROP_KNOWLEDGE_LIBRARY.barley;
  }
  if (lower.includes('pea') || lower.includes('bean') || lower.includes('lentil') || lower.includes('chickpea')) {
    return CROP_KNOWLEDGE_LIBRARY.peas;
  }
  if (lower.includes('sunflower')) return CROP_KNOWLEDGE_LIBRARY.sunflower;
  if (lower.includes('tomato') || lower.includes('lettuce') || lower.includes('onion') || lower.includes('pepper') || lower.includes('veg')) {
    return CROP_KNOWLEDGE_LIBRARY.vegetables;
  }
  return CROP_KNOWLEDGE_LIBRARY.wheat;
}

export interface Fao56Et0Intermediates {
  tMeanC: number;
  u2Ms: number;
  rsMjM2Day: number;
  esKpa: number;
  eaKpa: number;
  vpdKpa: number;
  deltaKpaC: number;
  pAtmKpa: number;
  gammaKpaC: number;
  raMjM2Day: number;
  rsoMjM2Day: number;
  rnsMjM2Day: number;
  rnlMjM2Day: number;
  rnMjM2Day: number;
}

export function computeFao56DailyEt0(params: {
  tMaxC: number | null;
  tMinC: number | null;
  rhMeanPct: number | null;
  wind10mMs: number | null;
  solarKwhM2: number | null;
  latDeg: number;
  elevationM: number;
  doy: number;
}): { et0MmDay: number | null; intermediates: Fao56Et0Intermediates | null } {
  const { tMaxC, tMinC, rhMeanPct, wind10mMs, solarKwhM2, latDeg, elevationM, doy } = params;
  if (
    tMaxC === null ||
    tMinC === null ||
    rhMeanPct === null ||
    wind10mMs === null ||
    solarKwhM2 === null
  ) {
    return { et0MmDay: null, intermediates: null };
  }

  const tMeanC = (tMaxC + tMinC) / 2;
  const u2Ms = Math.max(0.5, wind10mMs * (4.87 / Math.log(67.8 * 10 - 5.42)));
  const rsMjM2Day = Math.max(0.5, solarKwhM2 * 3.6);

  const e0 = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
  const esKpa = 0.5 * (e0(tMaxC) + e0(tMinC));
  const eaKpa = Math.min(esKpa, Math.max(0.05, (rhMeanPct / 100) * esKpa));
  const vpdKpa = Math.max(0, esKpa - eaKpa);

  const deltaKpaC = (4098 * e0(tMeanC)) / Math.pow(tMeanC + 237.3, 2);
  const elev = Math.max(0, elevationM);
  const pAtmKpa = 101.3 * Math.pow((293 - 0.0065 * elev) / 293, 5.26);
  const gammaKpaC = 0.000665 * pAtmKpa;

  // Extraterrestrial radiation Ra (FAO-56 Eqs. 21-25)
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * doy);
  const deltaDecl = 0.409 * Math.sin(((2 * Math.PI) / 365) * doy - 1.39);
  const arg = Math.max(-0.99, Math.min(0.99, -Math.tan(phi) * Math.tan(deltaDecl)));
  const ws = Math.acos(arg);
  const gsc = 0.082; // MJ m-2 min-1
  const raMjM2Day = Math.max(
    1,
    ((24 * 60) / Math.PI) *
      gsc *
      dr *
      (ws * Math.sin(phi) * Math.sin(deltaDecl) + Math.cos(phi) * Math.cos(deltaDecl) * Math.sin(ws))
  );
  const rsoMjM2Day = (0.75 + 2e-5 * elev) * raMjM2Day;
  const rnsMjM2Day = 0.77 * rsMjM2Day; // albedo alpha = 0.23
  const rsRatio = Math.max(0.3, Math.min(1.0, rsMjM2Day / Math.max(1, rsoMjM2Day)));
  const sigma = 4.903e-9; // MJ K-4 m-2 day-1
  const tMaxK4 = Math.pow(tMaxC + 273.16, 4);
  const tMinK4 = Math.pow(tMinC + 273.16, 4);
  const rnlMjM2Day =
    sigma * ((tMaxK4 + tMinK4) / 2) * (0.34 - 0.14 * Math.sqrt(eaKpa)) * (1.35 * rsRatio - 0.35);
  const rnMjM2Day = Math.max(0, rnsMjM2Day - rnlMjM2Day);

  const numer =
    0.408 * deltaKpaC * rnMjM2Day + gammaKpaC * (900 / (tMeanC + 273)) * u2Ms * vpdKpa;
  const denom = deltaKpaC + gammaKpaC * (1 + 0.34 * u2Ms);
  const et0MmDay = Number(Math.max(0.1, numer / Math.max(0.01, denom)).toFixed(2));

  return {
    et0MmDay,
    intermediates: {
      tMeanC: Number(tMeanC.toFixed(2)),
      u2Ms: Number(u2Ms.toFixed(2)),
      rsMjM2Day: Number(rsMjM2Day.toFixed(2)),
      esKpa: Number(esKpa.toFixed(3)),
      eaKpa: Number(eaKpa.toFixed(3)),
      vpdKpa: Number(vpdKpa.toFixed(3)),
      deltaKpaC: Number(deltaKpaC.toFixed(4)),
      pAtmKpa: Number(pAtmKpa.toFixed(2)),
      gammaKpaC: Number(gammaKpaC.toFixed(4)),
      raMjM2Day: Number(raMjM2Day.toFixed(2)),
      rsoMjM2Day: Number(rsoMjM2Day.toFixed(2)),
      rnsMjM2Day: Number(rnsMjM2Day.toFixed(2)),
      rnlMjM2Day: Number(rnlMjM2Day.toFixed(2)),
      rnMjM2Day: Number(rnMjM2Day.toFixed(2)),
    },
  };
}

export interface SoilPedotransferProfile {
  texture: SoilTexture | string;
  textureSource: FactTypeLabel;
  sandPct: number | null;
  siltPct: number | null;
  clayPct: number | null;
  usdaClass: string;
  fcVwcPct: number | null;
  wpVwcPct: number | null;
  awcMmPerM: number | null;
  fcWpSource: FactTypeLabel;
  phValue: number | null;
  phStatusLabel: string;
  phSource: FactTypeLabel;
  organicMatterPct: number | null;
  organicCarbonPct: number | null;
  organicSource: FactTypeLabel;
  bulkDensityGCm3: number | null;
  cecCmolKg: number | null;
  ecDsM: number | null;
  labNMgKg: number | null;
  labPMgKg: number | null;
  labKMgKg: number | null;
  hasFullLabNpk: boolean;
  drainage: string;
  elevationM: number | null;
  slopePct: number | null;
}

const SOIL_PEDOTRANSFER: Record<
  string,
  { sand: number; silt: number; clay: number; fc: number; wp: number; bd: number }
> = {
  Sandy: { sand: 90, silt: 6, clay: 4, fc: 14, wp: 6, bd: 1.58 },
  'Loamy sand': { sand: 82, silt: 12, clay: 6, fc: 18, wp: 8, bd: 1.52 },
  'Sandy loam': { sand: 65, silt: 24, clay: 11, fc: 23, wp: 10, bd: 1.46 },
  Loam: { sand: 42, silt: 38, clay: 20, fc: 29, wp: 14, bd: 1.38 },
  'Silt loam': { sand: 22, silt: 60, clay: 18, fc: 33, wp: 15, bd: 1.32 },
  'Clay loam': { sand: 30, silt: 38, clay: 32, fc: 36, wp: 20, bd: 1.34 },
  Clay: { sand: 20, silt: 28, clay: 52, fc: 42, wp: 26, bd: 1.28 },
};

export interface WeatherSeriesDay {
  date: string;
  shortDate: string;
  isForecast: boolean;
  sourceKind: 'NASA POWER' | 'Open-Meteo NWP' | 'Open-Meteo Forecast';
  tMaxC: number | null;
  tMinC: number | null;
  tMeanC: number | null;
  precipMm: number | null;
  precipProbPct: number | null;
  rhPct: number | null;
  wind2mMs: number | null;
  solarMjM2: number | null;
  vpdKpa: number | null;
  et0Mm: number | null;
  gddDay: number | null;
  gddCumulative: number | null;
  et0Intermediates?: Fao56Et0Intermediates | null;
}

export interface DailyWaterBalancePoint {
  date: string;
  shortDate: string;
  isForecast: boolean;
  et0Mm: number;
  kc: number;
  kcb: number;
  ke: number;
  ks: number;
  etcPotentialMm: number;
  etcAdjMm: number;
  observedRainMm: number;
  forecastRainMm: number;
  runoffMm: number;
  effectiveRainMm: number;
  irrigationNetMm: number;
  deepPercolationMm: number;
  drStartMm: number;
  drEndMm: number;
  rawMm: number;
  tawMm: number;
  moisturePctEst: number;
}

export interface EvaluatedFieldRisk {
  id: string;
  ruleId: string;
  domain: 'Water' | 'Heat' | 'Cold' | 'Rainfall' | 'Soil' | 'Rotation' | 'Regional Hazard';
  title: string;
  severity: 'Critical' | 'High' | 'Moderate' | 'Low';
  confidence: ConfidenceLevel;
  thresholdVsActual: string;
  plausibleMechanism: string;
  competingExplanations: string;
  mitigationSteps: string[];
  status: 'Active' | 'Acknowledged' | 'Watch';
  metricId?: string;
}

export interface FieldAgronomyBundle {
  fieldId: string;
  fieldCode: string;
  fieldDisplayName: string;
  areaHa: number;
  timezone: string;
  spatialCoverageNote: string;
  crop: CropKnowledgeEntry;
  phenology: {
    stageFao: 'Initial' | 'Crop development' | 'Mid-season' | 'Late season';
    stageLabel: string;
    plantingDateLabel: string;
    plantingCertainty: 'Confirmed' | 'Estimated from cycle offset';
    daysElapsedEst: number;
    progressPct: number;
    gdd30dAccumulated: number;
    currentKc: number;
    currentKcb: number;
    currentKe: number;
    currentZrM: number;
    pAdjusted: number;
  };
  weather: {
    providerStatus: 'Connected' | 'Partial' | 'Unavailable';
    nasaPowerStatus: 'Connected' | 'Unavailable';
    currentTempC: number | null;
    apparentTempC: number | null;
    humidityPct: number | null;
    dewPointC: number | null;
    vpdKpa: number | null;
    windKmh: number | null;
    wind2mMs: number | null;
    gustKmh: number | null;
    windDirCompass: string;
    pressureHpa: number | null;
    et0TodayMm: number | null;
    et0MethodLabel: string;
    rainObserved30dMm: number;
    rainBaselineMean30dMm: number | null;
    rainAnomalyMm: number | null;
    rainAnomalyPct: number | null;
    baselineMeanMaxC: number | null;
    baselineMeanMinC: number | null;
    forecastRain7dMm: number;
    drySpellDays: number;
    heatStressDays30d: number;
    frostDays30d: number;
    combinedDailySeries: WeatherSeriesDay[];
    yearlyBaselineSeries: Array<{
      year: number;
      meanMaxC: number | null;
      meanMinC: number | null;
      totalPrecipMm: number | null;
      hotDays: number;
      rainyDays: number;
    }>;
  };
  water: {
    tawMm: number | null;
    rawMm: number | null;
    currentDrMm: number | null;
    depletionPctOfTaw: number | null;
    estimatedMoistureVwcPct: number | null;
    observedMoisturePct: number | null;
    observedMoistureUnit: SoilMoistureUnit;
    observedMoistureDepth: string;
    observedMoistureMethod: string;
    observedMoistureDate: string;
    moistureUnitAmbiguityNote: string | null;
    hydraulicAvailabilityReason: string | null;
    moistureSourceLabel: string;
    currentKs: number | null;
    etcPotentialMmDay: number | null;
    etcAdjMmDay: number | null;
    observedRain30dMm: number;
    effectiveRain30dMm: number;
    confirmedIrrigation30dMm: number;
    confirmedIrrigation30dM3: number;
    forecastRain7dMm: number;
    forecastEtc7dMm: number;
    triggerActive: boolean;
    daysUntilRawCrossed: number | null;
    netRefillMm: number | null;
    assumedEa: number;
    eaSourceLabel: string;
    grossDepthMm: number | null;
    recommendedVolumeM3: number | null;
    flowRateKnown: boolean;
    infiltrationKnown: boolean;
    runtimeNote: string;
    dailyBalanceSeries: DailyWaterBalancePoint[];
  };
  soil: SoilPedotransferProfile;
  nutrients: {
    readinessStatus: 'Blocked — Lab soil NPK required' | 'Partial — Check calibration';
    cropDemandTotalKgHa: { n: number; p: number; k: number };
    previousCropCreditNote: string;
    missingPrerequisites: string[];
  };
  risks: EvaluatedFieldRisk[];
  eonetNearbyCount: number;
  timestamps: {
    weatherFetchedAt: string | null;
    weatherObservedAt: string | null;
    nasaPowerFetchedAt: string | null;
    nasaLatestDate: string | null;
    eonetFetchedAt: string | null;
    soilUpdatedAt: string;
    phTestDate: string | null;
    pastWindowStart: string | null;
    pastWindowEnd: string | null;
    forecastStart: string | null;
    forecastEnd: string | null;
  };
  metricsById: Record<string, InspectableMetric>;
  reports: {
    weatherSummary: string[];
    waterSummary: string[];
    soilCropSummary: string[];
    riskSummary: string[];
  };
}

function getDoy(isoDate: string): number {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return 180;
  const start = Date.UTC(dt.getUTCFullYear(), 0, 0);
  return Math.floor((dt.getTime() - start) / 86400000);
}

export function buildFieldAgronomyBundle(params: {
  farm: MyFarmRecord;
  field: PortfolioFieldRecord | null;
  fieldIndex: number;
  liveWeather: LiveWeatherReading | null;
  extendedWeather: ExtendedFieldWeatherResult | null;
  nasaRecent30: PowerClimateResult | null;
  climateResult: PowerClimateResult | null;
  eonetResult: EonetFetchResult | null;
  irrigationLogs: IrrigationLogItem[];
  tasks: FarmTaskItem[];
  observations: FarmObservationItem[];
  decisions: PlanDecisionEvent[];
}): FieldAgronomyBundle {
  const {
    farm,
    field,
    fieldIndex,
    liveWeather,
    extendedWeather,
    nasaRecent30,
    climateResult,
    eonetResult,
    irrigationLogs,
    tasks,
    observations,
    decisions,
  } = params;

  const fieldId = field?.id ?? `${farm.id}__primary`;
  const fieldCode = `Field ${String(fieldIndex + 1).padStart(2, '0')}`;
  const rawName = field?.name?.trim() || `${farm.name} Primary Block`;
  const fieldDisplayName = rawName.toLowerCase().startsWith('field')
    ? rawName
    : `${fieldCode} – ${rawName}`;
  const areaHa =
    field?.versions?.[0]?.netAreaHectares ??
    (farm.mappedAreaHa > 0 ? farm.mappedAreaHa : farm.declaredAreaHa ?? 42.0);
  const timezone = extendedWeather?.timezone || farm.timezone || 'UTC';
  const lat = farm.centroid?.lat ?? 25.2;
  const elev = farm.soil.elevationM ?? extendedWeather?.elevationM ?? 120;

  const cropNameRaw = field?.cropName || farm.primaryCrop || 'Wheat';
  const crop = resolveCropKnowledge(cropNameRaw);

  // Spatial resolution note (Section 5.3)
  const spatialCoverageNote =
    areaHa < 100
      ? `Field area (${areaHa.toFixed(1)} ha) is smaller than NASA POWER (0.5° ≈ 55 km) & Open-Meteo (~9–25 km) grid cells; weather variables represent gridded regional context sampled at centroid.`
      : `Field (${areaHa.toFixed(1)} ha) sampled at farm/field centroid across Open-Meteo & NASA POWER gridded cells.`;

  // Soil Profile & Pedotransfer (never fabricate Loam priors when soil texture is Unknown)
  const effSoil = resolveEffectiveFieldSoil(farm.soil, field?.soilOverrides);
  const texture = effSoil.texture;
  const pedo = texture !== 'Unknown' && SOIL_PEDOTRANSFER[texture] ? SOIL_PEDOTRANSFER[texture] : null;
  const hasExplicitTexture = pedo !== null;
  const phVal = effSoil.phValue;
  const phStatus = effSoil.phStatus;
  const omPct = effSoil.organicMatterPct;
  const ocPct = omPct !== null ? Number((omPct / 1.724).toFixed(2)) : null;

  const soilProfile: SoilPedotransferProfile = {
    texture: hasExplicitTexture ? texture : 'Unknown',
    textureSource: hasExplicitTexture ? 'Farmer-reported' : 'Unavailable',
    sandPct: pedo ? pedo.sand : null,
    siltPct: pedo ? pedo.silt : null,
    clayPct: pedo ? pedo.clay : null,
    usdaClass: hasExplicitTexture ? texture : 'Unavailable',
    fcVwcPct: pedo ? pedo.fc : null,
    wpVwcPct: pedo ? pedo.wp : null,
    awcMmPerM: pedo ? Math.round((pedo.fc - pedo.wp) * 10) : null,
    fcWpSource: pedo ? 'Mapped estimate' : 'Unavailable',
    phValue: phVal,
    phStatusLabel:
      phVal !== null
        ? `${phVal.toFixed(1)} (${phStatus === 'tested' ? 'Lab tested' : 'Reported'})`
        : effSoil.phSource === 'field_suppressed'
          ? 'Not tested (field override)'
          : 'Not tested',
    phSource: phVal !== null ? (phStatus === 'tested' ? 'Lab-measured' : 'Farmer-reported') : 'Unavailable',
    organicMatterPct: omPct,
    organicCarbonPct: ocPct,
    organicSource: omPct !== null ? 'Farmer-reported' : 'Unavailable',
    bulkDensityGCm3: pedo ? pedo.bd : null,
    cecCmolKg: null,
    ecDsM: farm.water.ecDsM ?? null,
    labNMgKg: null,
    labPMgKg: null,
    labKMgKg: null,
    hasFullLabNpk: false,
    drainage: effSoil.drainage,
    elevationM: farm.soil.elevationM ?? extendedWeather?.elevationM ?? null,
    slopePct: farm.soil.slopePct ?? null,
  };

  // Crop Phenology Position
  const totalDays =
    crop.stageDays.ini + crop.stageDays.dev + crop.stageDays.mid + crop.stageDays.late;
  const offsetSeed = (fieldIndex * 11 + farm.name.length * 3) % Math.max(20, totalDays - 15);
  const daysElapsedEst = Math.max(12, Math.min(totalDays - 5, 24 + offsetSeed));
  const progressPct = Math.round((daysElapsedEst / totalDays) * 100);

  let stageFao: FieldAgronomyBundle['phenology']['stageFao'] = 'Initial';
  let stageLabel = 'Emergence / Early Canopy';
  let currentKc = crop.kcIni;
  let currentKcb = crop.kcbIni;
  let currentZrM = crop.zrMinM;

  if (daysElapsedEst <= crop.stageDays.ini) {
    stageFao = 'Initial';
    stageLabel = 'Vegetative Emergence (Initial)';
    currentKc = crop.kcIni;
    currentKcb = crop.kcbIni;
    currentZrM = crop.zrMinM + (daysElapsedEst / crop.stageDays.ini) * 0.15;
  } else if (daysElapsedEst <= crop.stageDays.ini + crop.stageDays.dev) {
    stageFao = 'Crop development';
    stageLabel = 'Rapid Canopy Expansion (Dev)';
    const f = (daysElapsedEst - crop.stageDays.ini) / crop.stageDays.dev;
    currentKc = crop.kcIni + f * (crop.kcMid - crop.kcIni);
    currentKcb = crop.kcbIni + f * (crop.kcbMid - crop.kcbIni);
    currentZrM = crop.zrMinM + 0.15 + f * (crop.zrMaxM - crop.zrMinM - 0.15);
  } else if (daysElapsedEst <= crop.stageDays.ini + crop.stageDays.dev + crop.stageDays.mid) {
    stageFao = 'Mid-season';
    stageLabel = 'Reproductive / Peak Canopy (Mid)';
    currentKc = crop.kcMid;
    currentKcb = crop.kcbMid;
    currentZrM = crop.zrMaxM;
  } else {
    stageFao = 'Late season';
    stageLabel = 'Maturation & Senescence (Late)';
    const f =
      (daysElapsedEst - crop.stageDays.ini - crop.stageDays.dev - crop.stageDays.mid) /
      crop.stageDays.late;
    currentKc = crop.kcMid + f * (crop.kcEnd - crop.kcMid);
    currentKcb = crop.kcbMid + f * (crop.kcbEnd - crop.kcbMid);
    currentZrM = crop.zrMaxM;
  }

  const plantedDateObj = new Date(Date.now() - daysElapsedEst * 86400000);
  const plantingDateLabel = plantedDateObj.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Assemble Historical (NASA POWER 30d + Open-Meteo pastDaily bridge) + Separate 7d Forecast
  const nasaMap = new Map<string, NonNullable<PowerClimateResult['windowDays']>[number]>();
  for (const d of nasaRecent30?.windowDays ?? []) {
    nasaMap.set(d.date, d);
  }
  const omPastMap = new Map<string, NonNullable<ExtendedFieldWeatherResult['pastDaily']>[number]>();
  for (const d of extendedWeather?.pastDaily ?? []) {
    omPastMap.set(d.date, d);
  }

  const historicalDatesSet = new Set<string>([
    ...Array.from(nasaMap.keys()),
    ...Array.from(omPastMap.keys()),
  ]);
  const sortedHistDates = Array.from(historicalDatesSet).sort();

  const combinedDailySeries: WeatherSeriesDay[] = [];
  let runningGdd = 0;

  for (const dtStr of sortedHistDates) {
    const np = nasaMap.get(dtStr);
    const om = omPastMap.get(dtStr);
    const tMax = np?.tMaxC ?? om?.tMaxC ?? null;
    const tMin = np?.tMinC ?? om?.tMinC ?? null;
    const tMean =
      np?.tMeanC ?? (tMax !== null && tMin !== null ? Number(((tMax + tMin) / 2).toFixed(1)) : null);
    const precip = np?.precipMm ?? om?.precipSumMm ?? null;
    const solarMj =
      np?.solarKwhM2 !== null && np?.solarKwhM2 !== undefined
        ? Number((np.solarKwhM2 * 3.6).toFixed(2))
        : om?.solarMjM2 ?? null;
    const wind2m =
      np?.windMs !== null && np?.windMs !== undefined
        ? Number((np.windMs * 0.748).toFixed(2))
        : om?.windMaxKmh !== null && om?.windMaxKmh !== undefined
          ? Number(((om.windMaxKmh / 3.6) * 0.748).toFixed(2))
          : null;
    const rh = np?.humidityPct ?? null;

    const faoCalc = computeFao56DailyEt0({
      tMaxC: tMax,
      tMinC: tMin,
      rhMeanPct: rh,
      wind10mMs: np?.windMs ?? null,
      solarKwhM2: np?.solarKwhM2 ?? null,
      latDeg: lat,
      elevationM: elev,
      doy: getDoy(dtStr),
    });

    const et0 = faoCalc.et0MmDay ?? om?.et0FaoMm ?? null;
    const vpd = faoCalc.intermediates?.vpdKpa ?? null;

    let gddDay: number | null = null;
    if (tMax !== null && tMin !== null) {
      const capped = Math.min(tMax, crop.tUpperC);
      const floored = Math.max(tMin, crop.tBaseC);
      gddDay = Number(Math.max(0, (capped + floored) / 2 - crop.tBaseC).toFixed(1));
      runningGdd = Number((runningGdd + gddDay).toFixed(1));
    }

    combinedDailySeries.push({
      date: dtStr,
      shortDate: dtStr.slice(5),
      isForecast: false,
      sourceKind: np ? 'NASA POWER' : 'Open-Meteo NWP',
      tMaxC: tMax,
      tMinC: tMin,
      tMeanC: tMean,
      precipMm: precip,
      precipProbPct: null,
      rhPct: rh,
      wind2mMs: wind2m,
      solarMjM2: solarMj,
      vpdKpa: vpd,
      et0Mm: et0,
      gddDay,
      gddCumulative: gddDay !== null ? runningGdd : null,
      et0Intermediates: faoCalc.intermediates,
    });
  }

  // Append explicit Forecast days separately
  for (const fc of extendedWeather?.forecastDaily ?? []) {
    const tMean =
      fc.tMaxC !== null && fc.tMinC !== null
        ? Number(((fc.tMaxC + fc.tMinC) / 2).toFixed(1))
        : null;
    let gddDay: number | null = null;
    if (fc.tMaxC !== null && fc.tMinC !== null) {
      const capped = Math.min(fc.tMaxC, crop.tUpperC);
      const floored = Math.max(fc.tMinC, crop.tBaseC);
      gddDay = Number(Math.max(0, (capped + floored) / 2 - crop.tBaseC).toFixed(1));
    }
    combinedDailySeries.push({
      date: fc.date,
      shortDate: fc.date.slice(5),
      isForecast: true,
      sourceKind: 'Open-Meteo Forecast',
      tMaxC: fc.tMaxC,
      tMinC: fc.tMinC,
      tMeanC: tMean,
      precipMm: fc.precipSumMm,
      precipProbPct: fc.precipProbMaxPct,
      rhPct: null,
      wind2mMs:
        fc.windMaxKmh !== null ? Number(((fc.windMaxKmh / 3.6) * 0.748).toFixed(2)) : null,
      solarMjM2: fc.solarMjM2,
      vpdKpa: null,
      et0Mm: fc.et0FaoMm,
      gddDay,
      gddCumulative: null,
    });
  }

  const pastSeries = combinedDailySeries.filter((d) => !d.isForecast);
  const forecastSeries = combinedDailySeries.filter((d) => d.isForecast);

  const rainObserved30dMm = Number(
    pastSeries.reduce((sum, d) => sum + (d.precipMm ?? 0), 0).toFixed(1)
  );
  const forecastRain7dMm = Number(
    forecastSeries.reduce((sum, d) => sum + (d.precipMm ?? 0), 0).toFixed(1)
  );

  // Baseline comparison from NASA POWER 21-yr climatology (matched to exact pastSeries day count)
  const rainBaselineMean30dMm =
    climateResult?.meanPrecipMm !== null && climateResult?.meanPrecipMm !== undefined && pastSeries.length > 0
      ? Number((climateResult.meanPrecipMm * pastSeries.length).toFixed(1))
      : null;
  const rainAnomalyMm =
    rainBaselineMean30dMm !== null
      ? Number((rainObserved30dMm - rainBaselineMean30dMm).toFixed(1))
      : null;
  const rainAnomalyPct =
    rainAnomalyMm !== null && rainBaselineMean30dMm !== null && rainBaselineMean30dMm > 0
      ? Number(((rainAnomalyMm / rainBaselineMean30dMm) * 100).toFixed(1))
      : null;

  // Dry spell & Heat/Frost exposure counts (past observations only)
  let drySpellDays = 0;
  for (let i = pastSeries.length - 1; i >= 0; i--) {
    if ((pastSeries[i].precipMm ?? 0) < 1.0) drySpellDays++;
    else break;
  }
  const heatStressDays30d = pastSeries.filter(
    (d) => d.tMaxC !== null && d.tMaxC >= crop.heatThresholdC
  ).length;
  const frostDays30d = pastSeries.filter(
    (d) => d.tMinC !== null && d.tMinC <= crop.frostThresholdC
  ).length;

  // Current weather summary values
  const latestPastWithEt0 = [...pastSeries].reverse().find((d) => d.et0Mm !== null);
  const todayForecast = forecastSeries[0];
  const et0TodayMm = todayForecast?.et0Mm ?? latestPastWithEt0?.et0Mm ?? null;
  const et0MethodLabel = todayForecast?.et0Mm
    ? 'Open-Meteo FAO-56 Penman–Monteith'
    : latestPastWithEt0?.et0Intermediates
      ? 'Field Shift FAO-56 Penman–Monteith (NASA POWER)'
      : 'Unavailable (meteorological inputs incomplete)';

  const firstHourly = extendedWeather?.next24hHourly?.[0];
  const curTemp = extendedWeather?.current.tempC ?? liveWeather?.tempC ?? null;
  const curRh = extendedWeather?.current.humidityPct ?? liveWeather?.humidityPct ?? null;
  const curWindKmh = extendedWeather?.current.windKmh ?? liveWeather?.windKmh ?? null;
  const curWind2mMs =
    curWindKmh !== null ? Number(((curWindKmh / 3.6) * 0.748).toFixed(2)) : null;

  // Compute daily FAO-56 Root-Zone Water Balance (Section 12)
  // Guard: soil-water hydraulic capacities (TAW, RAW, Dr) require a known soil texture.
  const avgEtcForP = (et0TodayMm ?? 4.2) * currentKc;
  const pAdjusted = Number(
    Math.max(0.1, Math.min(0.8, crop.pBase + 0.04 * (5 - avgEtcForP))).toFixed(2)
  );

  // Map confirmed irrigation logs for this field or farm-wide fallback
  const fieldIrrLogs = irrigationLogs.filter(
    (l) => l.fieldId === fieldId || (!l.fieldId && areaHa > 0)
  );
  const irrByDate = new Map<string, number>();
  let confirmedIrrigation30dM3 = 0;
  for (const log of fieldIrrLogs) {
    const vol = Number(log.volumeM3) || 0;
    confirmedIrrigation30dM3 += vol;
    const depthMm = areaHa > 0 ? vol / (areaHa * 10) : 0;
    irrByDate.set(log.date, (irrByDate.get(log.date) ?? 0) + depthMm);
  }

  // Only explicitly confirmed volumetric_vwc (non-tensiometer) readings may enter VWC depletion math.
  // Raw readings and metadata remain preserved in observedMoisture* fields regardless of unit.
  const vwcCompatibleMoisturePct =
    effSoil.isVwcCompatibleForBalance && effSoil.moisturePct !== null ? effSoil.moisturePct : null;

  const observedUnitLabel = formatSoilMoistureUnitLabel(effSoil.moistureUnit);
  const moistureSourceLabel =
    effSoil.moistureStatus === 'unknown' || effSoil.moisturePct === null
      ? pedo
        ? 'Modelled FAO-56 Root-Zone Balance'
        : 'Unavailable'
      : effSoil.moistureStatus === 'measured'
        ? effSoil.isVwcCompatibleForBalance
          ? effSoil.moistureProvenanceLabel === 'Field measured'
            ? 'Field Probe Measured (% VWC)'
            : 'Farmer / Probe Measured (% VWC)'
          : `${effSoil.moistureProvenanceLabel} (${observedUnitLabel} — excluded from VWC balance)`
        : effSoil.isVwcCompatibleForBalance
          ? `${effSoil.moistureProvenanceLabel} (% VWC)`
          : `${effSoil.moistureProvenanceLabel} (${observedUnitLabel} — excluded from VWC balance)`;

  const hydraulicAvailabilityReason: string | null = !pedo
    ? effSoil.moistureUnitAmbiguityNote
      ? `Soil texture is Unknown — field capacity, wilting point, TAW, RAW, and root-zone depletion balance are unavailable until soil texture is confirmed. ${effSoil.moistureUnitAmbiguityNote}`
      : 'Soil texture is Unknown — field capacity, wilting point, TAW, RAW, and root-zone depletion balance are unavailable until soil texture is confirmed.'
    : effSoil.moistureUnitAmbiguityNote;

  const irrMethod = field?.waterOverrides?.irrigationMethod || farm.water.irrigationMethod || 'Drip irrigation';
  const assumedEa =
    irrMethod.includes('Drip')
      ? 0.90
      : irrMethod.includes('Sprinkler')
        ? 0.78
        : irrMethod.includes('Flood') || irrMethod.includes('Furrow')
          ? 0.62
          : 0.75;
  const eaSourceLabel = `${irrMethod} assumed textbook Ea = ${(assumedEa * 100).toFixed(0)}% (uncalibrated)`;

  const flowRateKnown = Boolean(farm.water.dailyCapacityKnown && farm.water.dailyCapacityM3);
  const infiltrationKnown = false; // No soil infiltration audit in record yet
  const runtimeNote = !flowRateKnown
    ? 'Exact pump runtime & pulse cycles unavailable: confirm zone flow rate (m³/h) and soil infiltration audit first.'
    : 'Daily capacity exists at farm level, but exact zone flow rate (m³/h) and soil intake rate are required for pulse splitting.';

  const dailyBalanceSeries: DailyWaterBalancePoint[] = [];
  let effectiveRain30dMm = 0;
  let confirmedIrrigation30dMm = 0;
  let forecastEtc7dMm = 0;
  const balanceWindow = pastSeries.slice(-21);

  let tawMm: number | null = null;
  let rawMm: number | null = null;
  let currentDrMm: number | null = null;
  let currentKs: number | null = null;
  let daysUntilRawCrossed: number | null = null;
  let triggerActive = false;
  let netRefillMm: number | null = null;
  let grossDepthMm: number | null = null;
  let recommendedVolumeM3: number | null = null;
  let estimatedMoistureVwcPct: number | null = null;

  if (pedo) {
    tawMm = Math.round(1000 * ((pedo.fc - pedo.wp) / 100) * currentZrM);
    rawMm = Math.round(pAdjusted * tawMm);

    let drPrev =
      vwcCompatibleMoisturePct !== null
        ? Math.max(0, Math.min(tawMm, Math.round(((pedo.fc - vwcCompatibleMoisturePct) / 100) * 1000 * currentZrM)))
        : Math.round(tawMm * 0.34);

    // Observed / Reanalysis historical water balance
    for (const day of balanceWindow) {
      const et0 = day.et0Mm ?? 4.0;
      const drStart = drPrev;
      const ks = drStart <= rawMm ? 1 : Math.max(0, Math.min(1, (tawMm - drStart) / Math.max(1, tawMm - rawMm)));
      const pRain = day.precipMm ?? 0;
      const irrNet = Number((irrByDate.get(day.date) ?? 0).toFixed(2));
      confirmedIrrigation30dMm += irrNet;

      // Simple runoff threshold when daily rain > 22 mm on low drainage/high slope
      const slopeFactor = (soilProfile.slopePct ?? 2) > 5 ? 0.18 : 0.08;
      const runoff = pRain > 22 ? Number(((pRain - 22) * slopeFactor).toFixed(2)) : 0;

      // Surface evaporation Ke pulses gently after wetting events, capped by Kc_max
      const wetted = pRain + irrNet > 2;
      const ke = Number((wetted ? Math.max(0.05, currentKc - currentKcb) : 0.06).toFixed(2));
      const etcPot = Number(((currentKcb + ke) * et0).toFixed(2));
      const etcAdj = Number(((ks * currentKcb + ke) * et0).toFixed(2));

      const rawEnd = drStart - (pRain - runoff) - irrNet + etcAdj;
      const dp = rawEnd < 0 ? Number(Math.abs(rawEnd).toFixed(2)) : 0;
      const drEnd = Number(Math.max(0, Math.min(tawMm, rawEnd)).toFixed(1));
      const effRain = Number(Math.max(0, pRain - runoff - Math.min(dp, pRain)).toFixed(2));
      effectiveRain30dMm += effRain;

      const estVwc = Number((pedo.fc - drEnd / (1000 * currentZrM)).toFixed(1));

      dailyBalanceSeries.push({
        date: day.date,
        shortDate: day.shortDate,
        isForecast: false,
        et0Mm: Number(et0.toFixed(2)),
        kc: Number(currentKc.toFixed(2)),
        kcb: Number(currentKcb.toFixed(2)),
        ke,
        ks: Number(ks.toFixed(2)),
        etcPotentialMm: etcPot,
        etcAdjMm: etcAdj,
        observedRainMm: Number(pRain.toFixed(1)),
        forecastRainMm: 0,
        runoffMm: runoff,
        effectiveRainMm: effRain,
        irrigationNetMm: irrNet,
        deepPercolationMm: dp,
        drStartMm: Number(drStart.toFixed(1)),
        drEndMm: drEnd,
        rawMm,
        tawMm,
        moisturePctEst: Math.max(pedo.wp, Math.min(pedo.fc + 5, estVwc)),
      });

      drPrev = drEnd;
    }

    // If user has explicit VWC measured moisture on field, anchor current Dr cleanly when history was empty
    if (dailyBalanceSeries.length === 0 && vwcCompatibleMoisturePct !== null) {
      drPrev = Math.max(
        0,
        Math.min(tawMm, Math.round(((pedo.fc - vwcCompatibleMoisturePct) / 100) * 1000 * currentZrM))
      );
    }
    currentDrMm = Number(drPrev.toFixed(1));
    currentKs =
      currentDrMm <= rawMm
        ? 1
        : Number(Math.max(0, Math.min(1, (tawMm - currentDrMm) / Math.max(1, tawMm - rawMm))).toFixed(2));

    // Separate 7-Day Forecast Projection (Section 12.5)
    let drProj = currentDrMm;
    daysUntilRawCrossed = currentDrMm >= rawMm ? 0 : null;

    forecastSeries.forEach((fc, idx) => {
      const et0 = fc.et0Mm ?? et0TodayMm ?? 4.2;
      const drStart = drProj;
      const ks = drStart <= rawMm! ? 1 : Math.max(0, Math.min(1, (tawMm! - drStart) / Math.max(1, tawMm! - rawMm!)));
      const pFc = fc.precipMm ?? 0;
      const ke = pFc > 3 ? Math.max(0.05, Number((currentKc - currentKcb).toFixed(2))) : 0.05;
      const etcPot = Number(((currentKcb + ke) * et0).toFixed(2));
      const etcAdj = Number(((ks * currentKcb + ke) * et0).toFixed(2));
      forecastEtc7dMm += etcPot;
      const rawEnd = drStart - pFc + etcAdj;
      const dp = rawEnd < 0 ? Number(Math.abs(rawEnd).toFixed(2)) : 0;
      const drEnd = Number(Math.max(0, Math.min(tawMm!, rawEnd)).toFixed(1));
      if (daysUntilRawCrossed === null && drEnd >= rawMm!) {
        daysUntilRawCrossed = idx + 1;
      }
      const estVwc = Number((pedo.fc - drEnd / (1000 * currentZrM)).toFixed(1));

      dailyBalanceSeries.push({
        date: fc.date,
        shortDate: fc.shortDate,
        isForecast: true,
        et0Mm: Number(et0.toFixed(2)),
        kc: Number(currentKc.toFixed(2)),
        kcb: Number(currentKcb.toFixed(2)),
        ke,
        ks: Number(ks.toFixed(2)),
        etcPotentialMm: etcPot,
        etcAdjMm: etcAdj,
        observedRainMm: 0,
        forecastRainMm: Number(pFc.toFixed(1)),
        runoffMm: 0,
        effectiveRainMm: 0,
        irrigationNetMm: 0,
        deepPercolationMm: dp,
        drStartMm: Number(drStart.toFixed(1)),
        drEndMm: drEnd,
        rawMm: rawMm!,
        tawMm: tawMm!,
        moisturePctEst: Math.max(pedo.wp, Math.min(pedo.fc + 5, estVwc)),
      });
      drProj = drEnd;
    });

    // Irrigation Scheduling Math (Section 13)
    triggerActive = currentDrMm >= rawMm || (daysUntilRawCrossed !== null && daysUntilRawCrossed <= 2);
    const targetPostIrrigationDr = Math.round(rawMm * 0.25);
    netRefillMm = triggerActive
      ? Number(Math.max(0, Math.min(currentDrMm, currentDrMm - targetPostIrrigationDr)).toFixed(1))
      : 0;
    grossDepthMm = netRefillMm > 0 ? Number((netRefillMm / assumedEa).toFixed(1)) : 0;
    recommendedVolumeM3 = Math.round(grossDepthMm * areaHa * 10);

    estimatedMoistureVwcPct =
      vwcCompatibleMoisturePct !== null
        ? Number(vwcCompatibleMoisturePct.toFixed(1))
        : Number(Math.max(pedo.wp, Math.min(pedo.fc, pedo.fc - (currentDrMm / (1000 * currentZrM)) * 100)).toFixed(1));
  } else {
    // Unknown soil texture: preserve irrigation logs and atmospheric ETc demand without fabricating soil hydraulics
    for (const day of balanceWindow) {
      confirmedIrrigation30dMm += Number((irrByDate.get(day.date) ?? 0).toFixed(2));
    }
    forecastSeries.forEach((fc) => {
      const et0 = fc.et0Mm ?? et0TodayMm;
      if (et0 !== null) {
        const pFc = fc.precipMm ?? 0;
        const ke = pFc > 3 ? Math.max(0.05, Number((currentKc - currentKcb).toFixed(2))) : 0.05;
        forecastEtc7dMm += Number(((currentKcb + ke) * et0).toFixed(2));
      }
    });
  }

  // Nutrient Budget Prerequisites (Section 15)
  const targetYield = crop.uptakePerTonneKg.targetYieldBasisTHa;
  const cropDemandTotalKgHa = {
    n: Math.round(crop.uptakePerTonneKg.n * targetYield),
    p: Math.round(crop.uptakePerTonneKg.p * targetYield),
    k: Math.round(crop.uptakePerTonneKg.k * targetYield),
  };
  const missingPrerequisites: string[] = [
    'Laboratory soil-test N, P, K (with extraction method & 0–20/30 cm depth)',
    'Confirmed attainable target yield & cultivar calibration',
    'Manure / prior-legume residue credit quantification',
  ];
  const prevCrop = field?.previousCrops?.[0] || crop.defaultPrevCrop;
  const previousCropCreditNote =
    prevCrop.toLowerCase().includes('soy') || prevCrop.toLowerCase().includes('pea')
      ? `Prior legume (${prevCrop}) may contribute residual N credit; quantify via soil nitrate test before reducing N rate.`
      : `Prior crop (${prevCrop}) provides structural residue context only; exact N mineralization credit unmeasured.`;

  // Risks Evaluation (Section 17)
  const risks: EvaluatedFieldRisk[] = [];
  if (currentDrMm !== null && rawMm !== null && tawMm !== null && currentKs !== null) {
    if (currentDrMm >= rawMm) {
      risks.push({
        id: 'risk-water-depletion',
        ruleId: 'FAO56-WB-01',
        domain: 'Water',
        title: 'Root-Zone Depletion Exceeds RAW',
        severity: currentDrMm >= tawMm * 0.85 ? 'Critical' : 'High',
        confidence: vwcCompatibleMoisturePct !== null ? 'High' : 'Moderate',
        thresholdVsActual: `Depletion Dr ${currentDrMm} mm ≥ RAW ${rawMm} mm (Ks = ${currentKs.toFixed(2)})`,
        plausibleMechanism: 'Transpiration exceeds soil water entry; stomatal closure may limit photosynthesis if unrefilled.',
        competingExplanations: 'Gridded rainfall or unrecorded irrigation event could place actual Dr below modelled value.',
        mitigationSteps: [
          `Inspect root-zone moisture in ${fieldCode} across 0–30 cm depth.`,
          netRefillMm !== null && netRefillMm > 0 && recommendedVolumeM3 !== null
            ? `Review ${netRefillMm} mm net refill (~${recommendedVolumeM3.toLocaleString()} m³ gross across ${areaHa.toFixed(1)} ha).`
            : 'Log recent irrigation events if already watered.',
        ],
        status: 'Active',
        metricId: 'water_dr',
      });
    } else if (daysUntilRawCrossed !== null && daysUntilRawCrossed <= 4) {
      risks.push({
        id: 'risk-water-watch',
        ruleId: 'FAO56-WB-02',
        domain: 'Water',
        title: 'Approaching Readily Available Water (RAW) Trigger',
        severity: 'Moderate',
        confidence: 'Moderate',
        thresholdVsActual: `Projected to cross RAW (${rawMm} mm) in ~${daysUntilRawCrossed} day(s) under forecast ETc`,
        plausibleMechanism: 'Cumulative forecast ETc exceeds forecast precipitation over next 4 days.',
        competingExplanations: 'Convective forecast showers or subsurface capillary rise could delay onset.',
        mitigationSteps: ['Schedule field check and confirm irrigation supply availability prior to trigger window.'],
        status: 'Watch',
        metricId: 'water_dr',
      });
    }
  }

  if (heatStressDays30d > 0) {
    risks.push({
      id: 'risk-heat-exposure',
      ruleId: 'CLIM-HEAT-01',
      domain: 'Heat',
      title: `Crop Heat Threshold Exceedance (>${crop.heatThresholdC} °C)`,
      severity: heatStressDays30d >= 4 ? 'High' : 'Moderate',
      confidence: 'Moderate',
      thresholdVsActual: `${heatStressDays30d} day(s) ≥ ${crop.heatThresholdC} °C in past 30d`,
      plausibleMechanism: crop.criticalHeatNote,
      competingExplanations: 'Canopy transpirational cooling under well-watered conditions can keep tissue cooler than gridded 2 m air temperature.',
      mitigationSteps: ['Inspect reproductive flowers/pollen set during morning scouting; avoid water deficit during heat peaks.'],
      status: 'Active',
      metricId: 'weather_heat',
    });
  }

  if (rainAnomalyPct !== null && rainAnomalyPct <= -30) {
    risks.push({
      id: 'risk-rain-deficit',
      ruleId: 'CLIM-RAIN-01',
      domain: 'Rainfall',
      title: '30-Day Precipitation Deficit vs 21-Yr Baseline',
      severity: rainAnomalyPct <= -55 ? 'High' : 'Moderate',
      confidence: 'High',
      thresholdVsActual: `${rainObserved30dMm} mm observed vs ${rainBaselineMean30dMm} mm 21-yr mean (${rainAnomalyPct}%)`,
      plausibleMechanism: 'Persistent rainfall anomaly reduces non-irrigated soil recharge and raises irrigation dependency.',
      competingExplanations: 'Local convective storms smaller than NASA POWER 0.5° grid may be underrepresented.',
      mitigationSteps: ['Cross-check local rain gauge log and prioritize water supply allocation.'],
      status: 'Active',
      metricId: 'weather_rain',
    });
  }

  risks.push({
    id: 'risk-soil-lab-gap',
    ruleId: 'DATA-SOIL-01',
    domain: 'Soil',
    title: 'Laboratory Soil NPK & EC Measurements Absent',
    severity: 'Low',
    confidence: 'High',
    thresholdVsActual: 'Lab NPK = Not measured · SoilGrids REST paused (15 Nov 2026)',
    plausibleMechanism: 'Precision fertilisation rates and salinity leaching fractions cannot be computed without lab chemistry.',
    competingExplanations: 'Farmer may hold paper lab sheets not yet entered into field profile.',
    mitigationSteps: ['Collect 0–20 cm composite soil cores per field management zone and enter lab NPK/pH/EC.'],
    status: 'Watch',
    metricId: 'soil_nutrients',
  });

  const eonetNearbyCount = eonetResult?.nearbyEvents?.length ?? 0;
  if (eonetNearbyCount > 0 && eonetResult) {
    const nearest = eonetResult.nearbyEvents[0];
    risks.push({
      id: 'risk-eonet-hazard',
      ruleId: 'EONET-HAZ-01',
      domain: 'Regional Hazard',
      title: `NASA EONET Nearby Event: ${nearest.title}`,
      severity: (nearest.distanceKm ?? 999) < 75 ? 'High' : 'Moderate',
      confidence: 'Moderate',
      thresholdVsActual: `${nearest.distanceKm ?? '—'} km from farm coordinates (${nearest.categories.map((c) => c.title).join(', ')})`,
      plausibleMechanism: 'Regional natural hazard logged in NASA EONET v3 may affect smoke/ash, dust, or regional transport.',
      competingExplanations: 'Wide-area satellite detection radius does not imply direct parcel impact.',
      mitigationSteps: ['Verify local emergency bulletins and inspect solar/wind shifts.'],
      status: 'Watch',
    });
  }

  // Build Inspectable Metrics Dictionary (§30)
  const retrievedIso = extendedWeather?.retrievedAt || nasaRecent30?.fetchedAt || new Date().toISOString();
  const metricsById: Record<string, InspectableMetric> = {
    weather_temp: {
      id: 'weather_temp',
      title: 'Air Temperature & Diurnal Range',
      question: 'What is the current gridded air temperature relative to field crop thresholds?',
      valueDisplay: curTemp !== null ? `${curTemp.toFixed(1)} °C` : 'Unavailable',
      unit: '°C (2 m air temperature)',
      period: 'Latest hourly observation & 30d daily window',
      timezone,
      factType: curTemp !== null ? 'Forecast' : 'Unavailable',
      sourceName: extendedWeather?.providerName || 'Open-Meteo NWP',
      observationTime: extendedWeather?.current.time || retrievedIso,
      retrievalTime: retrievedIso,
      spatialResolution: 'Open-Meteo ~9–25 km grid cell; NASA POWER 0.5° × 0.5° (~55 km)',
      fieldCoverageNote: spatialCoverageNote,
      formulaVersion: AGRONOMY_ENGINE_VERSION,
      formulaDisplay: 'Direct 2 m air temperature variable; GDD = max(0, (min(Tmax, Tupper) + max(Tmin, Tbase))/2 - Tbase)',
      inputs: [
        { label: 'Current 2 m Temp', value: curTemp !== null ? `${curTemp} °C` : '—', source: 'Open-Meteo NWP' },
        { label: 'Apparent Temp', value: extendedWeather?.current.apparentTempC !== null ? `${extendedWeather?.current.apparentTempC} °C` : '—', source: 'Open-Meteo' },
        { label: 'Crop Heat Limit', value: `${crop.heatThresholdC} °C`, source: `${crop.commonName} (${CROP_KNOWLEDGE_VERSION})` },
      ],
      intermediateSteps: [
        `Accumulated 30d thermal time: ${runningGdd.toFixed(1)} °C·days (Tbase ${crop.tBaseC} °C, Tupper ${crop.tUpperC} °C).`,
        `Heat exceedance days in past 30d: ${heatStressDays30d} day(s).`,
      ],
      confidenceLevel: curTemp !== null ? 'Moderate' : 'Unavailable',
      limitations: 'Gridded NWP air temperature may differ by 1–3 °C from microclimate inside dense irrigated canopies.',
      relatedContext: `${fieldDisplayName} · ${crop.commonName}`,
    },
    weather_et0: {
      id: 'weather_et0',
      title: 'Reference Evapotranspiration (ET0)',
      question: 'How much atmospheric evaporative demand acts on a well-watered reference grass surface?',
      valueDisplay: et0TodayMm !== null ? `${et0TodayMm.toFixed(2)} mm/d` : 'Unavailable',
      unit: 'mm/day',
      period: 'Current daily / recent NASA POWER 30d',
      timezone,
      factType: todayForecast?.et0Mm ? 'Forecast' : latestPastWithEt0?.et0Intermediates ? 'Calculated' : 'Unavailable',
      sourceName: todayForecast?.et0Mm ? 'Open-Meteo FAO-56 ET0' : 'NASA POWER AG Daily + FAO-56 PM Engine',
      observationTime: todayForecast?.date || latestPastWithEt0?.date || retrievedIso,
      retrievalTime: retrievedIso,
      spatialResolution: 'NASA POWER 0.5° × 0.5° / Open-Meteo NWP grid',
      fieldCoverageNote: spatialCoverageNote,
      formulaVersion: 'FAO-56 Chapter 2 Penman–Monteith (v1.3)',
      formulaDisplay: 'ET0 = [0.408 Δ(Rn - G) + γ(900/(T+273)) u2 (es - ea)] / [Δ + γ(1 + 0.34 u2)]',
      inputs: latestPastWithEt0?.et0Intermediates
        ? [
            { label: 'Tmean', value: `${latestPastWithEt0.et0Intermediates.tMeanC} °C`, source: 'NASA POWER' },
            { label: 'Wind u2 (2 m)', value: `${latestPastWithEt0.et0Intermediates.u2Ms} m/s`, source: 'WS10M × 0.748' },
            { label: 'Net Radiation Rn', value: `${latestPastWithEt0.et0Intermediates.rnMjM2Day} MJ/m²/d`, source: 'ALLSKY_SFC_SW_DWN' },
            { label: 'VPD (es - ea)', value: `${latestPastWithEt0.et0Intermediates.vpdKpa} kPa`, source: 'RH2M & Tmax/Tmin' },
          ]
        : [
            { label: 'Provider ET0', value: et0TodayMm !== null ? `${et0TodayMm} mm/d` : 'Unavailable', source: 'Open-Meteo' },
          ],
      intermediateSteps: latestPastWithEt0?.et0Intermediates
        ? [
            `Δ = ${latestPastWithEt0.et0Intermediates.deltaKpaC} kPa/°C · γ = ${latestPastWithEt0.et0Intermediates.gammaKpaC} kPa/°C`,
            `es = ${latestPastWithEt0.et0Intermediates.esKpa} kPa · ea = ${latestPastWithEt0.et0Intermediates.eaKpa} kPa`,
            `Ra = ${latestPastWithEt0.et0Intermediates.raMjM2Day} MJ/m²/d · Rso = ${latestPastWithEt0.et0Intermediates.rsoMjM2Day} MJ/m²/d · G = 0`,
          ]
        : ['Provider-supplied FAO-56 ET0 from Open-Meteo model grid.'],
      confidenceLevel: et0TodayMm !== null ? 'High' : 'Unavailable',
      limitations: 'Uses gridded solar radiation and wind adjusted from 10 m height; local windbreaks or advective oasis effects are unmeasured.',
      relatedContext: `${fieldDisplayName} · ${et0MethodLabel}`,
    },
    weather_rain: {
      id: 'weather_rain',
      title: '30-Day Observed Rainfall & Anomaly',
      question: 'How much gridded precipitation fell over the past ~30 days vs the 21-year historical norm?',
      valueDisplay: `${rainObserved30dMm.toFixed(1)} mm`,
      unit: 'mm (cumulative observed/reanalysis; forecast excluded)',
      period: `${pastSeries[0]?.date ?? '—'} to ${pastSeries[pastSeries.length - 1]?.date ?? '—'}`,
      timezone,
      factType: nasaRecent30 ? 'Reanalysis' : 'Unavailable',
      sourceName: 'NASA POWER PRECTOTCORR + 21-Yr Baseline Climatology',
      observationTime: pastSeries[pastSeries.length - 1]?.date || retrievedIso,
      retrievalTime: retrievedIso,
      spatialResolution: 'NASA POWER 0.5° × 0.5° (~55 km) MERRA-2/IMERG corrected grid',
      fieldCoverageNote: 'Forecast rainfall (+7d) is strictly excluded from observed rainfall totals.',
      formulaVersion: AGRONOMY_ENGINE_VERSION,
      formulaDisplay: 'anomaly_mm = sum(observed_rain_mm) - (baseline_21y_mean_mm_day × N_days)',
      inputs: [
        { label: 'Observed / Reanalysis Sum', value: `${rainObserved30dMm} mm`, source: `${pastSeries.length} days` },
        { label: '21-Yr Matched Mean', value: rainBaselineMean30dMm !== null ? `${rainBaselineMean30dMm} mm` : 'Loading / N/A', source: 'NASA POWER 2005–2025' },
        { label: '7-Day Forecast Rain', value: `${forecastRain7dMm} mm (separate)`, source: 'Open-Meteo Forecast' },
      ],
      intermediateSteps: [
        `Anomaly: ${rainAnomalyMm !== null ? `${rainAnomalyMm > 0 ? '+' : ''}${rainAnomalyMm} mm (${rainAnomalyPct}%)` : 'Pending baseline'}`,
        `Active consecutive dry spell (<1 mm/d): ${drySpellDays} day(s).`,
      ],
      confidenceLevel: pastSeries.length > 0 ? 'Moderate' : 'Unavailable',
      limitations: '0.5° grid averages convective storm cells; confirm actual catchment with an in-field rain gauge.',
      relatedContext: `${fieldDisplayName} · Rain deficit check`,
    },
    water_dr: (() => {
      const hasHydraulicBalance =
        pedo !== null &&
        currentDrMm !== null &&
        tawMm !== null &&
        rawMm !== null &&
        currentKs !== null;
      const etcPotStr = et0TodayMm !== null ? `${(et0TodayMm * currentKc).toFixed(2)} mm/d` : 'Unavailable';
      const etcAdjStr =
        et0TodayMm !== null && currentKs !== null
          ? `${(et0TodayMm * (currentKs * currentKcb + 0.06)).toFixed(2)} mm/d`
          : 'Unavailable';

      return {
        id: 'water_dr',
        title: 'Root-Zone Water Depletion (Dr) vs RAW / TAW',
        question: 'How close is the crop root zone to water stress and irrigation threshold?',
        valueDisplay: hasHydraulicBalance ? `${currentDrMm!.toFixed(1)} / ${tawMm} mm` : 'Unavailable',
        unit: 'mm root-zone depletion (0 = Field Capacity, TAW = Wilting Point)',
        period: '21-day daily soil-water balance + 7d separate forecast projection',
        timezone,
        factType: hasHydraulicBalance
          ? vwcCompatibleMoisturePct !== null
            ? 'Calculated'
            : 'Modelled'
          : 'Unavailable',
        sourceName: 'FAO-56 Chapter 8 Root-Zone Depletion Balance',
        observationTime: balanceWindow[balanceWindow.length - 1]?.date || retrievedIso,
        retrievalTime: retrievedIso,
        spatialResolution: `Field ${areaHa.toFixed(1)} ha with Zr = ${currentZrM.toFixed(2)} m`,
        fieldCoverageNote: hasHydraulicBalance
          ? `${soilProfile.texture} pedotransfer parameters (${pedo!.fc}% FC, ${pedo!.wp}% WP) + ${fieldIrrLogs.length} logged irrigation event(s).${effSoil.moistureUnitAmbiguityNote ? ` ${effSoil.moistureUnitAmbiguityNote}` : ''}`
          : hydraulicAvailabilityReason || 'Soil texture is Unknown; hydraulic capacity and depletion balance unavailable.',
        formulaVersion: 'FAO-56 Ch. 8 Dual-Kc Balance (v1.3)',
        formulaDisplay: 'Dr_i = clamp(0, TAW, Dr_{i-1} - (P_i - RO_i) - I_i + ETc_adj_i + DP_i); Ks = (TAW - Dr)/(TAW - RAW)',
        inputs: hasHydraulicBalance
          ? [
              { label: 'TAW', value: `${tawMm} mm`, source: `1000 × (${pedo!.fc / 100} - ${pedo!.wp / 100}) × ${currentZrM.toFixed(2)} m` },
              { label: 'RAW (No-stress limit)', value: `${rawMm} mm (p = ${pAdjusted})`, source: `${crop.commonName} ETc-adjusted p` },
              { label: 'Kcb / Ke / Ks', value: `${currentKcb.toFixed(2)} / 0.06 / ${currentKs!.toFixed(2)}`, source: `${stageFao}` },
              {
                label: 'Volumetric Conversion',
                value: `${(recommendedVolumeM3 ?? 0).toLocaleString()} m³`,
                source: `${grossDepthMm ?? 0} mm × ${areaHa.toFixed(1)} ha × 10`,
              },
            ]
          : [
              { label: 'Soil Texture', value: soilProfile.texture, source: soilProfile.textureSource },
              {
                label: 'Observed Moisture',
                value: effSoil.moisturePct !== null ? `${effSoil.moisturePct}% (${observedUnitLabel})` : 'Not recorded',
                source: effSoil.moistureProvenanceLabel,
              },
              {
                label: 'Potential ETc',
                value: etcPotStr,
                source: 'ET0 × Kc (independent of soil texture)',
              },
            ],
        intermediateSteps: hasHydraulicBalance
          ? [
              `Potential ETc = ${etcPotStr} · Adjusted ETc = ${etcAdjStr}.`,
              `Assumed application efficiency Ea = ${(assumedEa * 100).toFixed(0)}% (${irrMethod}); uncalibrated hardware rate.`,
            ]
          : [
              'Soil texture is Unknown — field capacity, wilting point, TAW, RAW, and Ks cannot be calculated without fabricating pedotransfer priors.',
              ...(hydraulicAvailabilityReason ? [hydraulicAvailabilityReason] : []),
            ],
        confidenceLevel: hasHydraulicBalance ? (vwcCompatibleMoisturePct !== null ? 'Moderate' : 'Low') : 'Unavailable',
        limitations: 'Exact irrigation runtime/pulses require confirmed zone pump flow (m³/h) and soil infiltration test.',
        relatedContext: `${fieldDisplayName} · ${irrMethod}`,
      };
    })(),
    soil_nutrients: {
      id: 'soil_nutrients',
      title: 'Soil Profile & Nutrient Budget Readiness',
      question: 'Which soil properties are lab-measured vs pedotransfer estimates, and can NPK rates be computed?',
      valueDisplay: soilProfile.hasFullLabNpk ? 'Ready' : 'Lab NPK Needed',
      unit: 'Laboratory chemical & physical basis',
      period: 'Active soil profile version',
      timezone,
      factType: phVal !== null ? 'Lab-measured' : 'Unavailable',
      sourceName: 'Field Profile + FAO Nutrient Bookkeeping Rules',
      observationTime: effSoil.phTestDate || farm.updatedAt,
      retrievalTime: retrievedIso,
      spatialResolution: `Parcel-level profile (${areaHa.toFixed(1)} ha)`,
      fieldCoverageNote: pedo
        ? 'ISRIC SoilGrids REST endpoint paused as of 15 Nov 2026; using explicit farmer profile & USDA pedotransfer priors.'
        : 'ISRIC SoilGrids REST endpoint paused as of 15 Nov 2026; using explicit farmer profile (pedotransfer hydraulic priors skipped while soil texture is Unknown).',
      formulaVersion: AGRONOMY_ENGINE_VERSION,
      formulaDisplay: 'Fertilizer_rate = max(0, Crop_req - Soil_supply - Residue_credit - Manure_credit - Water_credit) / Recovery',
      inputs: [
        { label: 'Soil Texture', value: `${soilProfile.texture}`, source: soilProfile.textureSource },
        { label: 'Soil pH', value: soilProfile.phStatusLabel, source: soilProfile.phSource },
        { label: 'Organic Matter', value: omPct !== null ? `${omPct}% (OC ${ocPct}%)` : 'Not measured', source: soilProfile.organicSource },
        { label: 'Lab N / P / K', value: 'Not measured', source: 'Blocked until lab core entered' },
      ],
      intermediateSteps: [
        `Reference seasonal crop uptake at ${targetYield} t/ha: N ~${cropDemandTotalKgHa.n} kg/ha, P ~${cropDemandTotalKgHa.p} kg/ha, K ~${cropDemandTotalKgHa.k} kg/ha (uptake != fertilizer rate!).`,
        'Crop uptake cannot prescribe fertilizer doses without soil-test supply and recovery calibration.',
      ],
      confidenceLevel: 'Low',
      limitations: 'Fertilizer kg/ha prescription deliberately suppressed per non-negotiable agronomy safety rules until soil lab results exist.',
      relatedContext: `${fieldDisplayName} · ${crop.commonName}`,
    },
  };

  // Assemble Structured Written Agronomic Reports
  const weatherSummary = [
    `${fieldDisplayName} (${areaHa.toFixed(1)} ha, ${crop.commonName}) experienced ${rainObserved30dMm.toFixed(1)} mm of gridded precipitation over the past ${pastSeries.length} NASA POWER / NWP days${rainAnomalyPct !== null ? `, representing a ${rainAnomalyMm! >= 0 ? '+' : ''}${rainAnomalyMm} mm (${rainAnomalyPct}%) anomaly against the 21-year local baseline (${rainBaselineMean30dMm} mm)` : ''}.`,
    `Thermal time accumulated ${runningGdd.toFixed(1)} °C·days (base ${crop.tBaseC} °C, upper cap ${crop.tUpperC} °C) with ${heatStressDays30d} day(s) exceeding ${crop.heatThresholdC} °C and ${frostDays30d} frost-risk night(s) ≤ ${crop.frostThresholdC} °C.`,
    `Forecast rainfall for the next 7 days (${forecastRain7dMm.toFixed(1)} mm) is tracked strictly separately from observed history so water accounting never mixes predictions into past catch totals.`,
  ];

  const waterSummary =
    pedo !== null && tawMm !== null && rawMm !== null && currentDrMm !== null && currentKs !== null
      ? [
          `At ${stageLabel} (${stageFao}, Zr ≈ ${currentZrM.toFixed(2)} m), ${soilProfile.texture} holds an estimated Total Available Water (TAW) of ${tawMm} mm and Readily Available Water (RAW) of ${rawMm} mm (demand-adjusted p = ${pAdjusted}).`,
          `Current modelled root-zone depletion stands at Dr = ${currentDrMm.toFixed(1)} mm (${Math.round((currentDrMm / Math.max(1, tawMm)) * 100)}% of TAW), giving water-stress factor Ks = ${currentKs.toFixed(2)} and daily crop demand ${et0TodayMm !== null ? `ETc = ${(et0TodayMm * currentKc).toFixed(2)} mm/day` : 'ETc unavailable until ET0 inputs load'}.${effSoil.moistureUnitAmbiguityNote ? ` ${effSoil.moistureUnitAmbiguityNote}` : ''}`,
          triggerActive
            ? `Scheduling trigger is active (Dr approaching/exceeding RAW): recommended net refill is ${netRefillMm ?? 0} mm (${grossDepthMm ?? 0} mm gross at ${(assumedEa * 100).toFixed(0)}% assumed ${irrMethod} efficiency = ${(recommendedVolumeM3 ?? 0).toLocaleString()} m³). ${runtimeNote}`
            : `Depletion remains inside the RAW comfort buffer (${daysUntilRawCrossed !== null ? `projected to cross RAW in ~${daysUntilRawCrossed} day(s)` : 'stable across next 7 days'}); no immediate refill required.`,
        ]
      : [
          `At ${stageLabel} (${stageFao}, Zr ≈ ${currentZrM.toFixed(2)} m), soil texture is Unknown so Total Available Water (TAW) and Readily Available Water (RAW) cannot be calculated without fabricating hydraulic priors.`,
          `Current crop evaporative demand is ${et0TodayMm !== null ? `ETc = ${(et0TodayMm * currentKc).toFixed(2)} mm/day (ET0 ${et0TodayMm.toFixed(2)} mm/day × Kc ${currentKc.toFixed(2)})` : 'unavailable until ET0 inputs load'}, with ${forecastEtc7dMm.toFixed(1)} mm projected over the next 7 days.`,
          effSoil.moisturePct !== null
            ? `Recorded soil moisture (${effSoil.moisturePct}% ${observedUnitLabel}) is preserved for display.${effSoil.moistureUnitAmbiguityNote ? ` ${effSoil.moistureUnitAmbiguityNote}` : ''}`
            : 'Confirm field soil texture and volumetric moisture (% VWC) to activate root-zone depletion scheduling.',
        ];

  const soilCropSummary = [
    pedo !== null
      ? `Soil profile is ${soilProfile.texture} (${soilProfile.textureSource}) with pedotransfer estimates of ${pedo.fc}% Field Capacity and ${pedo.wp}% Wilting Point (${soilProfile.awcMmPerM} mm/m available water capacity). Soil pH is ${soilProfile.phStatusLabel}. Drainage is ${soilProfile.drainage}.`
      : `Soil texture is Unknown (${soilProfile.textureSource}); hydraulic Field Capacity, Wilting Point, and AWC are marked unavailable rather than defaulted to Loam priors. Soil pH is ${soilProfile.phStatusLabel}. Drainage is ${soilProfile.drainage}.`,
    `Note on regional soil maps: ISRIC SoilGrids REST API is publicly paused as of 15 Nov 2026; therefore Soil & Land keeps regional maps marked unavailable rather than faking lab accuracy.`,
    `Nutrient fertilisation prescriptions (N, P, K) remain gated until field soil-test concentrations, extraction method, and target yield calibration are provided. Reference whole-plant uptake at ${targetYield} t/ha is shown solely as educational context.`,
  ];

  const riskSummary = [
    `${risks.length} evaluated condition rule(s) active for ${fieldDisplayName}, led by "${risks[0]?.title ?? 'Baseline monitoring'}". Severity (potential crop impact) and Confidence (evidence strength) are tracked independently.`,
    `Completed management tasks (${tasks.filter((t) => t.completed).length}/${tasks.length}) and ${observations.length} scouting observation(s) remain distinct from automated alert resolution—alerts clear only when subsequent field/weather evidence verifies recovery.`,
    decisions.length > 0
      ? `${decisions.length} crop-rotation decision journal event(s) are recorded for historical traceability across farm versions.`
      : `No rotation change decisions recorded yet; prior crop sequence lists ${prevCrop} → ${crop.commonName}.`,
  ];

  return {
    fieldId,
    fieldCode,
    fieldDisplayName,
    areaHa,
    timezone,
    spatialCoverageNote,
    crop,
    phenology: {
      stageFao,
      stageLabel,
      plantingDateLabel,
      plantingCertainty: 'Estimated from cycle offset',
      daysElapsedEst,
      progressPct,
      gdd30dAccumulated: Number(runningGdd.toFixed(1)),
      currentKc: Number(currentKc.toFixed(2)),
      currentKcb: Number(currentKcb.toFixed(2)),
      currentKe: 0.06,
      currentZrM: Number(currentZrM.toFixed(2)),
      pAdjusted,
    },
    weather: {
      providerStatus: extendedWeather ? 'Connected' : liveWeather ? 'Partial' : 'Unavailable',
      nasaPowerStatus: nasaRecent30 ? 'Connected' : 'Unavailable',
      currentTempC: curTemp,
      apparentTempC: extendedWeather?.current.apparentTempC ?? null,
      humidityPct: curRh,
      dewPointC: firstHourly?.dewPointC ?? null,
      vpdKpa: firstHourly?.vpdKpa ?? latestPastWithEt0?.vpdKpa ?? null,
      windKmh: curWindKmh,
      wind2mMs: curWind2mMs,
      gustKmh: extendedWeather?.current.gustKmh ?? null,
      windDirCompass: extendedWeather?.current.windDirCompass ?? liveWeather?.windDirCompass ?? '—',
      pressureHpa: extendedWeather?.current.surfacePressureHpa ?? null,
      et0TodayMm,
      et0MethodLabel,
      rainObserved30dMm,
      rainBaselineMean30dMm,
      rainAnomalyMm,
      rainAnomalyPct,
      baselineMeanMaxC: climateResult?.meanMaxC ?? null,
      baselineMeanMinC: climateResult?.meanMinC ?? null,
      forecastRain7dMm,
      drySpellDays,
      heatStressDays30d,
      frostDays30d,
      combinedDailySeries,
      yearlyBaselineSeries: (climateResult?.yearlySummaries ?? []).map((y) => ({
        year: y.year,
        meanMaxC: y.meanMaxC,
        meanMinC: y.meanMinC,
        totalPrecipMm: y.totalPrecipMm,
        hotDays: y.hotDaysOverThreshold,
        rainyDays: y.rainyDaysOver5mm,
      })),
    },
    water: {
      tawMm,
      rawMm,
      currentDrMm,
      depletionPctOfTaw:
        currentDrMm !== null && tawMm !== null ? Math.round((currentDrMm / Math.max(1, tawMm)) * 100) : null,
      estimatedMoistureVwcPct,
      observedMoisturePct: effSoil.moisturePct,
      observedMoistureUnit: effSoil.moistureUnit,
      observedMoistureDepth: effSoil.moistureDepth,
      observedMoistureMethod: effSoil.moistureMethod,
      observedMoistureDate: effSoil.moistureDate,
      moistureUnitAmbiguityNote: effSoil.moistureUnitAmbiguityNote,
      hydraulicAvailabilityReason,
      moistureSourceLabel,
      currentKs,
      etcPotentialMmDay: et0TodayMm !== null ? Number((et0TodayMm * currentKc).toFixed(2)) : null,
      etcAdjMmDay:
        et0TodayMm !== null && currentKs !== null
          ? Number((et0TodayMm * (currentKs * currentKcb + 0.06)).toFixed(2))
          : null,
      observedRain30dMm: rainObserved30dMm,
      effectiveRain30dMm: Number(effectiveRain30dMm.toFixed(1)),
      confirmedIrrigation30dMm: Number(confirmedIrrigation30dMm.toFixed(1)),
      confirmedIrrigation30dM3: Math.round(confirmedIrrigation30dM3),
      forecastRain7dMm,
      forecastEtc7dMm: Number(forecastEtc7dMm.toFixed(1)),
      triggerActive,
      daysUntilRawCrossed,
      netRefillMm,
      assumedEa,
      eaSourceLabel,
      grossDepthMm,
      recommendedVolumeM3,
      flowRateKnown,
      infiltrationKnown,
      runtimeNote,
      dailyBalanceSeries,
    },
    soil: soilProfile,
    nutrients: {
      readinessStatus: 'Blocked — Lab soil NPK required',
      cropDemandTotalKgHa,
      previousCropCreditNote,
      missingPrerequisites,
    },
    risks,
    eonetNearbyCount,
    timestamps: {
      weatherFetchedAt: extendedWeather?.retrievedAt || liveWeather?.observedAt || null,
      weatherObservedAt: extendedWeather?.current?.time || liveWeather?.observedAt || null,
      nasaPowerFetchedAt: nasaRecent30?.fetchedAt || climateResult?.fetchedAt || null,
      nasaLatestDate:
        nasaRecent30?.windowDays?.[nasaRecent30.windowDays.length - 1]?.date ||
        nasaRecent30?.targetDate ||
        null,
      eonetFetchedAt: eonetResult?.fetchedAt || null,
      soilUpdatedAt: field?.updatedAt || farm.updatedAt,
      phTestDate: effSoil.phTestDate || null,
      pastWindowStart: pastSeries[0]?.date || null,
      pastWindowEnd: pastSeries[pastSeries.length - 1]?.date || null,
      forecastStart: forecastSeries[0]?.date || null,
      forecastEnd: forecastSeries[forecastSeries.length - 1]?.date || null,
    },
    metricsById,
    reports: {
      weatherSummary,
      waterSummary,
      soilCropSummary,
      riskSummary,
    },
  };
}
