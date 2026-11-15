import {
  AnswerProvenanceType,
  AssessmentResultBundle,
  CanonicalAnswer,
  CropHistorySeasonRecord,
  CurrentCropRecord,
  EnvironmentalEvidenceSummary,
  ImmutableInputSnapshot,
  IrrigationApplicationEstimate,
  IrrigationRoutineRecord,
  MissingDataGapItem,
  NormalizedPriorityVector,
  PriorityPresetId,
  PriorityVectorRaw,
  QuestionnaireDraft,
  ReviewRowItem,
  SeasonalWaterLimitRecord,
  SoilEcRecord,
  SoilOrganicRecord,
  SoilPhRecord,
  WaterQualityRecord,
} from '../types/questionnaire';
import {
  DrainageRate,
  FarmProfile,
  PlanningHorizon,
  SoilTexture,
  WaterReliability,
  WaterSource,
  WateringMethod,
} from '../types/farm';
import {
  PRIORITY_PRESET_VECTORS,
  QUESTION_BY_ID,
  QuestionDefinition,
  SIMPLE_COVERED_ADVANCED_IDS,
  SIMPLE_QUESTION_CATALOGUE,
  getAnswerValue,
  getDeeperAccuracyRoute,
  getVisibleQuestionRoute,
  isSimpleStep1Prefilled,
} from './questionnaireSchema';
import { RotationWizardDraft } from './rotationPlannerEngine';

export const QUESTIONNAIRE_ENGINE_VERSION = 'fs-qst-engine-v1.0.0';
export const QUESTIONNAIRE_CROP_KB_VERSION = 'fs-crop-kb-v1.0.0';

export function stableHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `qhash_${(h >>> 0).toString(16)}`;
}

// ============================================================================
// 1. Unit Conversions (preserving original unit metadata)
// ============================================================================

export function areaToHectares(
  value: number,
  unit: 'hectares' | 'acres' | 'm2'
): { hectares: number; conversionNote: string } {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Area must be a positive number.');
  }
  if (unit === 'hectares') {
    return { hectares: Number(value.toFixed(4)), conversionNote: 'Native hectares' };
  }
  if (unit === 'acres') {
    return {
      hectares: Number((value * 0.40468564224).toFixed(4)),
      conversionNote: `${value} ac × 0.404686 ha/ac`,
    };
  }
  return {
    hectares: Number((value / 10000).toFixed(4)),
    conversionNote: `${value} m² ÷ 10,000`,
  };
}

export function ecToDsM(
  value: number,
  unit: 'dS/m' | 'mS/cm' | 'uS/cm'
): { dsPerM: number; conversionNote: string } {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Electrical conductivity must be non-negative.');
  }
  if (unit === 'dS/m' || unit === 'mS/cm') {
    return { dsPerM: Number(value.toFixed(4)), conversionNote: `1 ${unit} = 1 dS/m` };
  }
  return {
    dsPerM: Number((value / 1000).toFixed(4)),
    conversionNote: `${value} µS/cm ÷ 1000 = dS/m`,
  };
}

export function normalizeSoilOrganic(rec: SoilOrganicRecord): {
  organicMatterPct: number | null;
  organicCarbonPct: number | null;
  assumptionNote: string | null;
} {
  if (rec.status !== 'measured' || rec.value === null || !Number.isFinite(rec.value)) {
    return { organicMatterPct: null, organicCarbonPct: null, assumptionNote: null };
  }
  const pct = rec.unit === 'g/kg' ? rec.value / 10 : rec.value;
  if (rec.kind === 'organic_matter') {
    return {
      organicMatterPct: Number(pct.toFixed(3)),
      organicCarbonPct: Number((pct / 1.724).toFixed(3)),
      assumptionNote: 'Farmer reported Organic Matter; OC estimated using standard 1.724 factor (original OM retained).',
    };
  }
  return {
    organicMatterPct: Number((pct * 1.724).toFixed(3)),
    organicCarbonPct: Number(pct.toFixed(3)),
    assumptionNote: 'Farmer reported Organic Carbon; OM estimated using Van Bemmelen 1.724 factor (original OC retained).',
  };
}

export function waterVolumeToMm(
  amount: number,
  unit: 'mm' | 'm3' | 'L',
  areaHa: number | null
): { mm: number | null; note: string } {
  if (!Number.isFinite(amount) || amount < 0) {
    return { mm: null, note: 'Invalid water quantity.' };
  }
  if (unit === 'mm') {
    return { mm: Number(amount.toFixed(2)), note: 'Direct depth in mm.' };
  }
  if (!areaHa || areaHa <= 0) {
    return {
      mm: null,
      note: `Cannot convert ${amount} ${unit} to mm without a verified field area.`,
    };
  }
  const liters = unit === 'm3' ? amount * 1000 : amount;
  // 1 mm over 1 ha (10,000 m2) = 10,000 L = 10 m3
  const mm = liters / (areaHa * 10000);
  return {
    mm: Number(mm.toFixed(2)),
    note: `${amount} ${unit} distributed over ${areaHa.toFixed(2)} ha`,
  };
}

// ============================================================================
// 2. Priority Normalization
// ============================================================================

export function resolvePriorityVector(draft: QuestionnaireDraft): PriorityVectorRaw {
  const q37 = getAnswerValue<{ presetId?: PriorityPresetId; customize?: boolean }>(draft, 'Q37');
  const q38 = getAnswerValue<Partial<PriorityVectorRaw>>(draft, 'Q38');
  const presetId: PriorityPresetId = q37?.presetId ?? 'balanced';

  if (presetId !== 'custom' && !q37?.customize && PRIORITY_PRESET_VECTORS[presetId]) {
    return {
      presetId,
      ...PRIORITY_PRESET_VECTORS[presetId].vector,
    };
  }

  const base =
    presetId !== 'custom' && PRIORITY_PRESET_VECTORS[presetId]
      ? PRIORITY_PRESET_VECTORS[presetId].vector
      : PRIORITY_PRESET_VECTORS.balanced.vector;

  return {
    presetId,
    waterEfficiency: typeof q38?.waterEfficiency === 'number' ? q38.waterEfficiency : base.waterEfficiency,
    soilImprovement: typeof q38?.soilImprovement === 'number' ? q38.soilImprovement : base.soilImprovement,
    climateResilience: typeof q38?.climateResilience === 'number' ? q38.climateResilience : base.climateResilience,
    cropSuitability: typeof q38?.cropSuitability === 'number' ? q38.cropSuitability : base.cropSuitability,
    productivityPotential:
      typeof q38?.productivityPotential === 'number' ? q38.productivityPotential : base.productivityPotential,
  };
}

export function normalizePriorityVector(raw: PriorityVectorRaw): NormalizedPriorityVector {
  const w = Math.max(0, Number(raw.waterEfficiency) || 0);
  const s = Math.max(0, Number(raw.soilImprovement) || 0);
  const c = Math.max(0, Number(raw.climateResilience) || 0);
  const u = Math.max(0, Number(raw.cropSuitability) || 0);
  const p = Math.max(0, Number(raw.productivityPotential) || 0);
  const sum = w + s + c + u + p;
  if (sum <= 0) {
    const def = PRIORITY_PRESET_VECTORS.balanced.vector;
    const defSum =
      def.waterEfficiency +
      def.soilImprovement +
      def.climateResilience +
      def.cropSuitability +
      def.productivityPotential;
    return {
      waterEfficiency: Number((def.waterEfficiency / defSum).toFixed(4)),
      soilImprovement: Number((def.soilImprovement / defSum).toFixed(4)),
      climateResilience: Number((def.climateResilience / defSum).toFixed(4)),
      cropSuitability: Number((def.cropSuitability / defSum).toFixed(4)),
      productivityPotential: Number((def.productivityPotential / defSum).toFixed(4)),
    };
  }
  return {
    waterEfficiency: Number((w / sum).toFixed(4)),
    soilImprovement: Number((s / sum).toFixed(4)),
    climateResilience: Number((c / sum).toFixed(4)),
    cropSuitability: Number((u / sum).toFixed(4)),
    productivityPotential: Number((p / sum).toFixed(4)),
  };
}

// ============================================================================
// 3. Climate & Water Feature Extraction (from real daily series)
// ============================================================================

export interface DailyWeatherSample {
  date: string; // YYYY-MM-DD
  tmaxC: number | null;
  tminC: number | null;
  tmeanC: number | null;
  precipMm: number | null;
  et0Mm?: number | null;
  solarMjM2?: number | null;
  rhPct?: number | null;
}

export function computeDailyGdd(
  tminC: number,
  tmaxC: number,
  tBaseC: number,
  tUpperCapC?: number
): number {
  const cappedMax = tUpperCapC !== undefined ? Math.min(tmaxC, tUpperCapC) : tmaxC;
  const flooredMin = Math.max(tminC, tBaseC);
  const effMax = Math.max(cappedMax, tBaseC);
  const avg = (effMax + flooredMin) / 2;
  return Math.max(0, avg - tBaseC);
}

export function extractDailyClimateFeatures(series: DailyWeatherSample[]): {
  sampleDays: number;
  yearsCovered: number;
  meanTempC: number | null;
  meanAnnualPrecipMm: number | null;
  meanAnnualEt0Mm: number | null;
  frostDaysPerYear: number | null;
  heatDaysOver35PerYear: number | null;
  maxDrySpellDays: number | null;
  gddBase10Annual: number | null;
  dryTypicalWetYears: {
    available: boolean;
    reason?: string;
    dryYear?: { year: number; precipMm: number };
    typicalYear?: { year: number; precipMm: number };
    wetYear?: { year: number; precipMm: number };
  };
} {
  const validDays = series.filter((d) => d.date && d.date.length >= 10);
  if (validDays.length === 0) {
    return {
      sampleDays: 0,
      yearsCovered: 0,
      meanTempC: null,
      meanAnnualPrecipMm: null,
      meanAnnualEt0Mm: null,
      frostDaysPerYear: null,
      heatDaysOver35PerYear: null,
      maxDrySpellDays: null,
      gddBase10Annual: null,
      dryTypicalWetYears: { available: false, reason: 'No daily meteorological samples retrieved.' },
    };
  }

  let tempSum = 0;
  let tempCount = 0;
  let frostCount = 0;
  let heat35Count = 0;
  let gdd10Sum = 0;
  let gddDays = 0;

  let curDry = 0;
  let maxDry = 0;
  let hasPrecipData = false;

  const byYear: Record<string, { precip: number; et0: number; et0Days: number; days: number }> = {};

  for (const d of validDays) {
    const yr = d.date.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = { precip: 0, et0: 0, et0Days: 0, days: 0 };
    byYear[yr].days++;

    const meanT =
      d.tmeanC !== null
        ? d.tmeanC
        : d.tmaxC !== null && d.tminC !== null
          ? (d.tmaxC + d.tminC) / 2
          : null;
    if (meanT !== null && Number.isFinite(meanT)) {
      tempSum += meanT;
      tempCount++;
    }
    if (d.tminC !== null && Number.isFinite(d.tminC) && d.tminC <= 0) {
      frostCount++;
    }
    if (d.tmaxC !== null && Number.isFinite(d.tmaxC) && d.tmaxC >= 35) {
      heat35Count++;
    }
    if (d.tminC !== null && d.tmaxC !== null && Number.isFinite(d.tminC) && Number.isFinite(d.tmaxC)) {
      gdd10Sum += computeDailyGdd(d.tminC, d.tmaxC, 10, 30);
      gddDays++;
    }
    if (d.precipMm !== null && Number.isFinite(d.precipMm)) {
      hasPrecipData = true;
      byYear[yr].precip += d.precipMm;
      if (d.precipMm < 1.0) {
        curDry++;
        if (curDry > maxDry) maxDry = curDry;
      } else {
        curDry = 0;
      }
    }
    if (d.et0Mm !== null && d.et0Mm !== undefined && Number.isFinite(d.et0Mm)) {
      byYear[yr].et0 += d.et0Mm;
      byYear[yr].et0Days++;
    }
  }

  // Only treat years with >= 330 days as complete annual records for quantile/annual baselines
  const completeYears = Object.entries(byYear)
    .filter(([, info]) => info.days >= 330)
    .map(([yr, info]) => ({
      year: Number(yr),
      precipMm: Number(info.precip.toFixed(1)),
      et0Mm: info.et0Days >= 300 ? Number(info.et0.toFixed(1)) : null,
    }))
    .sort((a, b) => a.precipMm - b.precipMm);

  const yearsFactor = validDays.length / 365.25;
  const meanTempC = tempCount > 0 ? Number((tempSum / tempCount).toFixed(2)) : null;

  const meanAnnualPrecipMm =
    completeYears.length > 0 && hasPrecipData
      ? Number(
          (completeYears.reduce((s, y) => s + y.precipMm, 0) / completeYears.length).toFixed(1)
        )
      : null;

  const et0Years = completeYears.filter((y) => y.et0Mm !== null);
  const meanAnnualEt0Mm =
    et0Years.length > 0
      ? Number((et0Years.reduce((s, y) => s + (y.et0Mm ?? 0), 0) / et0Years.length).toFixed(1))
      : null;

  const frostDaysPerYear =
    yearsFactor >= 0.9 ? Number((frostCount / yearsFactor).toFixed(1)) : null;
  const heatDaysOver35PerYear =
    yearsFactor >= 0.9 ? Number((heat35Count / yearsFactor).toFixed(1)) : null;
  const gddBase10Annual =
    gddDays >= 300 ? Math.round((gdd10Sum / gddDays) * 365) : null;

  let dryTypicalWetYears: ReturnType<typeof extractDailyClimateFeatures>['dryTypicalWetYears'];
  if (completeYears.length >= 5) {
    const dryIdx = Math.max(0, Math.floor((completeYears.length - 1) * 0.15));
    const midIdx = Math.floor((completeYears.length - 1) * 0.5);
    const wetIdx = Math.min(completeYears.length - 1, Math.ceil((completeYears.length - 1) * 0.85));
    dryTypicalWetYears = {
      available: true,
      dryYear: { year: completeYears[dryIdx].year, precipMm: completeYears[dryIdx].precipMm },
      typicalYear: { year: completeYears[midIdx].year, precipMm: completeYears[midIdx].precipMm },
      wetYear: { year: completeYears[wetIdx].year, precipMm: completeYears[wetIdx].precipMm },
    };
  } else {
    dryTypicalWetYears = {
      available: false,
      reason: `Not enough complete historical years (${completeYears.length}/5 minimum) to identify dry, typical, and wet quantiles.`,
    };
  }

  return {
    sampleDays: validDays.length,
    yearsCovered: completeYears.length,
    meanTempC,
    meanAnnualPrecipMm,
    meanAnnualEt0Mm,
    frostDaysPerYear,
    heatDaysOver35PerYear,
    maxDrySpellDays: hasPrecipData ? maxDry : null,
    gddBase10Annual,
    dryTypicalWetYears,
  };
}

/**
 * Documented effective rainfall estimate (USDA-SCS monthly/annual attenuation proxy):
 * never treats raw precipitation P as 100% effective rainfall Peff.
 */
export function estimateEffectiveRainfallMm(precipMm: number): number {
  if (!Number.isFinite(precipMm) || precipMm <= 0) return 0;
  // Attenuates heavy storm runoff/deep percolation above moderate daily totals
  const monthlyAvg = precipMm / 12;
  const effMonthly =
    monthlyAvg <= 250
      ? (monthlyAvg * (125 - 0.2 * monthlyAvg)) / 125
      : 125 + 0.1 * monthlyAvg;
  return Number(Math.max(0, effMonthly * 12).toFixed(1));
}

// ============================================================================
// 4. Typed Crop Knowledge Subset for Questionnaire Assessment
// ============================================================================

export interface QuestionnaireCropRule {
  cropId: string;
  cropName: string;
  botanicalFamily: string;
  plainFamily: 'Cereal' | 'Legume' | 'Oilseed' | 'Cover Crop' | 'Fallow';
  tBaseC: number;
  gddRequired: number;
  optTempRange: [number, number];
  hardTempRange: [number, number];
  optPhRange: [number, number];
  hardPhRange: [number, number];
  ecLimitDsM: number;
  kcMid: number;
  seasonalEtcMmTypical: number;
  waterNeedBand: 'Low' | 'Moderate' | 'High';
  waterloggingTolerant: boolean;
  nitrogenCreditKgHa: number;
  familyReturnIntervalSeasons: number;
  durationDays: number;
  sourceTag: string;
}

export const QUESTIONNAIRE_CROP_LIBRARY: QuestionnaireCropRule[] = [
  {
    cropId: 'wheat',
    cropName: 'Wheat',
    botanicalFamily: 'Poaceae',
    plainFamily: 'Cereal',
    tBaseC: 4,
    gddRequired: 1650,
    optTempRange: [10, 24],
    hardTempRange: [2, 33],
    optPhRange: [6.0, 7.8],
    hardPhRange: [5.0, 8.6],
    ecLimitDsM: 6.0,
    kcMid: 1.15,
    seasonalEtcMmTypical: 350,
    waterNeedBand: 'Moderate',
    waterloggingTolerant: false,
    nitrogenCreditKgHa: -95,
    familyReturnIntervalSeasons: 1,
    durationDays: 115,
    sourceTag: 'FAO-56 Crop Table 12 / USDA Salinity',
  },
  {
    cropId: 'barley',
    cropName: 'Barley',
    botanicalFamily: 'Poaceae',
    plainFamily: 'Cereal',
    tBaseC: 4,
    gddRequired: 1400,
    optTempRange: [8, 24],
    hardTempRange: [1, 33],
    optPhRange: [6.0, 8.0],
    hardPhRange: [5.2, 8.8],
    ecLimitDsM: 8.0,
    kcMid: 1.1,
    seasonalEtcMmTypical: 295,
    waterNeedBand: 'Low',
    waterloggingTolerant: false,
    nitrogenCreditKgHa: -78,
    familyReturnIntervalSeasons: 1,
    durationDays: 100,
    sourceTag: 'FAO-56 / FAO Salinity Tolerance',
  },
  {
    cropId: 'chickpea',
    cropName: 'Chickpea',
    botanicalFamily: 'Fabaceae',
    plainFamily: 'Legume',
    tBaseC: 5,
    gddRequired: 1350,
    optTempRange: [12, 27],
    hardTempRange: [6, 34],
    optPhRange: [6.0, 8.0],
    hardPhRange: [5.4, 8.5],
    ecLimitDsM: 2.0,
    kcMid: 1.0,
    seasonalEtcMmTypical: 265,
    waterNeedBand: 'Low',
    waterloggingTolerant: false,
    nitrogenCreditKgHa: 55,
    familyReturnIntervalSeasons: 2,
    durationDays: 105,
    sourceTag: 'FAO-56 / Pulse Agronomic Guide',
  },
  {
    cropId: 'peas',
    cropName: 'Field Peas',
    botanicalFamily: 'Fabaceae',
    plainFamily: 'Legume',
    tBaseC: 4,
    gddRequired: 1200,
    optTempRange: [10, 23],
    hardTempRange: [4, 30],
    optPhRange: [6.0, 7.5],
    hardPhRange: [5.3, 8.2],
    ecLimitDsM: 1.8,
    kcMid: 1.05,
    seasonalEtcMmTypical: 270,
    waterNeedBand: 'Low',
    waterloggingTolerant: false,
    nitrogenCreditKgHa: 50,
    familyReturnIntervalSeasons: 2,
    durationDays: 95,
    sourceTag: 'FAO-56 / Cool-Season Pulse Reference',
  },
  {
    cropId: 'soybean',
    cropName: 'Soybean',
    botanicalFamily: 'Fabaceae',
    plainFamily: 'Legume',
    tBaseC: 10,
    gddRequired: 1350,
    optTempRange: [16, 29],
    hardTempRange: [10, 35],
    optPhRange: [6.0, 7.0],
    hardPhRange: [5.3, 7.9],
    ecLimitDsM: 5.0,
    kcMid: 1.15,
    seasonalEtcMmTypical: 430,
    waterNeedBand: 'Moderate',
    waterloggingTolerant: false,
    nitrogenCreditKgHa: 45,
    familyReturnIntervalSeasons: 2,
    durationDays: 112,
    sourceTag: 'FAO-56 / Soybean Physiology Baseline',
  },
  {
    cropId: 'sorghum',
    cropName: 'Sorghum',
    botanicalFamily: 'Poaceae',
    plainFamily: 'Cereal',
    tBaseC: 10,
    gddRequired: 1550,
    optTempRange: [18, 34],
    hardTempRange: [12, 40],
    optPhRange: [5.5, 7.8],
    hardPhRange: [5.0, 8.6],
    ecLimitDsM: 6.8,
    kcMid: 1.08,
    seasonalEtcMmTypical: 400,
    waterNeedBand: 'Moderate',
    waterloggingTolerant: true,
    nitrogenCreditKgHa: -88,
    familyReturnIntervalSeasons: 1,
    durationDays: 120,
    sourceTag: 'FAO-56 / C4 Drought Cereal Reference',
  },
  {
    cropId: 'sunflower',
    cropName: 'Sunflower',
    botanicalFamily: 'Asteraceae',
    plainFamily: 'Oilseed',
    tBaseC: 7,
    gddRequired: 1450,
    optTempRange: [15, 31],
    hardTempRange: [8, 37],
    optPhRange: [6.0, 7.8],
    hardPhRange: [5.4, 8.4],
    ecLimitDsM: 4.8,
    kcMid: 1.05,
    seasonalEtcMmTypical: 330,
    waterNeedBand: 'Low',
    waterloggingTolerant: false,
    nitrogenCreditKgHa: -65,
    familyReturnIntervalSeasons: 3,
    durationDays: 110,
    sourceTag: 'FAO-56 / Asteraceae Sclerotinia Interval Guide',
  },
  {
    cropId: 'maize',
    cropName: 'Maize',
    botanicalFamily: 'Poaceae',
    plainFamily: 'Cereal',
    tBaseC: 10,
    gddRequired: 1450,
    optTempRange: [16, 31],
    hardTempRange: [10, 36],
    optPhRange: [5.8, 7.2],
    hardPhRange: [5.2, 8.0],
    ecLimitDsM: 1.7,
    kcMid: 1.2,
    seasonalEtcMmTypical: 525,
    waterNeedBand: 'High',
    waterloggingTolerant: false,
    nitrogenCreditKgHa: -135,
    familyReturnIntervalSeasons: 1,
    durationDays: 125,
    sourceTag: 'FAO-56 / Maize Irrigation & Salinity Table',
  },
  {
    cropId: 'cover_crop',
    cropName: 'Cover Crop (Clover / Vetch Mix)',
    botanicalFamily: 'Fabaceae + Poaceae',
    plainFamily: 'Cover Crop',
    tBaseC: 4,
    gddRequired: 850,
    optTempRange: [8, 26],
    hardTempRange: [2, 34],
    optPhRange: [5.6, 7.6],
    hardPhRange: [4.8, 8.3],
    ecLimitDsM: 3.0,
    kcMid: 0.85,
    seasonalEtcMmTypical: 185,
    waterNeedBand: 'Low',
    waterloggingTolerant: true,
    nitrogenCreditKgHa: 45,
    familyReturnIntervalSeasons: 0,
    durationDays: 75,
    sourceTag: 'Conservation Cover Crop Baseline',
  },
  {
    cropId: 'fallow',
    cropName: 'Fallow (Stubble Rest)',
    botanicalFamily: 'Unplanted Rest',
    plainFamily: 'Fallow',
    tBaseC: 0,
    gddRequired: 0,
    optTempRange: [-5, 42],
    hardTempRange: [-15, 48],
    optPhRange: [4.5, 8.8],
    hardPhRange: [4.0, 9.5],
    ecLimitDsM: 12.0,
    kcMid: 0.35,
    seasonalEtcMmTypical: 75,
    waterNeedBand: 'Low',
    waterloggingTolerant: true,
    nitrogenCreditKgHa: 10,
    familyReturnIntervalSeasons: 0,
    durationDays: 90,
    sourceTag: 'Stubble Moisture Conservation Model',
  },
];

// ============================================================================
// 5. Missing-Data Analyzer & Review Snapshot Builder
// ============================================================================

function formatSourceBadge(sourceType?: AnswerProvenanceType): ReviewRowItem['sourceBadge'] {
  switch (sourceType) {
    case 'farmer_confirmed':
      return 'Farmer-confirmed';
    case 'dataset_estimate':
      return 'Dataset estimate';
    case 'lab_result':
      return 'Lab result';
    case 'derived':
      return 'Derived';
    case 'skipped':
      return 'Skipped';
    case 'unknown':
      return 'Unknown';
    case 'not_applicable':
      return 'Not applicable';
    case 'ai_interpreted_pending_confirmation':
      return 'AI-interpreted — needs confirmation';
    case 'farmer_reported':
    default:
      return 'You provided';
  }
}

export function extractFarmAndFieldNames(draft: QuestionnaireDraft): {
  farmName: string;
  fieldName: string;
} {
  const q01 = getAnswerValue<{ farmName?: string; mode?: string }>(draft, 'Q01');
  const q03 = getAnswerValue<string>(draft, 'Q03');
  const q02 = getAnswerValue<{ fieldName?: string }>(draft, 'Q02');
  const farmName = (q01?.farmName || '').trim() || 'New Farm';
  const fieldName =
    (typeof q03 === 'string' && q03.trim()) ||
    (q02?.fieldName || '').trim() ||
    'Primary Field';
  return { farmName, fieldName };
}

export function extractDeclaredAreaHa(draft: QuestionnaireDraft): number | null {
  const q07 = getAnswerValue<{ status?: string; value?: number | null; unit?: 'hectares' | 'acres' | 'm2' }>(
    draft,
    'Q07'
  );
  if (!q07 || q07.status !== 'known' || typeof q07.value !== 'number' || q07.value <= 0) {
    return null;
  }
  return areaToHectares(q07.value, q07.unit || 'hectares').hectares;
}

export interface ChecklistRowItem {
  questionId: string;
  questionNumber: number;
  questionText: string;
  title: string;
  required: boolean;
  completed: boolean;
  status: 'completed' | 'optional' | 'required';
  answerSummary: string | null;
}

const REQUIRED_CHECKLIST_IDS = new Set(['Q01', 'Q03', 'Q05', 'Q17', 'Q25', 'Q29', 'Q37']);

function formatQuestionReviewDisplay(
  draft: QuestionnaireDraft,
  q: QuestionDefinition
): {
  valueDisplay: string;
  sourceBadge: ReviewRowItem['sourceBadge'];
  dateLabel?: string;
  warning?: string;
} {
  const ans = draft.answers[q.id];
  let valueDisplay = 'Not answered';
  let sourceBadge: ReviewRowItem['sourceBadge'] = ans
    ? formatSourceBadge(ans.sourceType)
    : 'Skipped';
  let warning: string | undefined = ans?.stale ? ans.staleReason || 'Upstream input changed — please re-confirm' : undefined;
  let dateLabel: string | undefined = ans?.validTime || ans?.confirmedAt?.slice(0, 10);

  if (q.id === 'Q05') {
    if (draft.location) {
      valueDisplay = `${draft.location.placeLabel} (${draft.location.latitude.toFixed(4)}°, ${draft.location.longitude.toFixed(4)}°)`;
      sourceBadge = 'Farmer-confirmed';
      dateLabel = draft.location.confirmedAt.slice(0, 10);
      if (draft.location.spatialPrecisionLabel === 'town_region_context') {
        warning = 'Town/region centroid — weather grids reflect regional context rather than exact field pin.';
      }
    } else {
      valueDisplay = 'Location not confirmed';
      sourceBadge = 'Unknown';
    }
  } else if (q.id === 'Q06') {
    if (draft.geometry.geometryStatus === 'polygon_verified' && draft.geometry.geodesicAreaHa !== null) {
      valueDisplay = `Verified polygon (${draft.geometry.geodesicAreaHa.toFixed(2)} ha geodesic)`;
      sourceBadge = 'Derived';
    } else if (draft.geometry.geometryStatus === 'location_only') {
      valueDisplay = 'Location-only (no field polygon drawn)';
      sourceBadge = 'Skipped';
      warning = 'Field-level boundary skipped; environmental grids use point context only.';
    } else {
      valueDisplay = 'No polygon drawn';
      sourceBadge = 'Skipped';
    }
  } else if (q.id === 'Q08') {
    const tz = draft.location?.timezone || (typeof ans?.value === 'string' ? ans.value : '');
    valueDisplay = tz || 'Timezone not set';
    sourceBadge = draft.location?.geocoderProvider ? 'Farmer-confirmed' : formatSourceBadge(ans?.sourceType);
  } else if (ans) {
    if (ans.sourceType === 'unknown') {
      valueDisplay = q.unknownLabel || 'Unknown';
    } else if (ans.sourceType === 'skipped') {
      valueDisplay = 'Skipped for now';
    } else if (typeof ans.value === 'string') {
      const opt = q.options?.find((o) => o.value === ans.value);
      valueDisplay = opt ? opt.label : ans.value;
    } else if (Array.isArray(ans.value)) {
      if (ans.value.length === 0) {
        valueDisplay = 'None selected';
      } else if (q.id === 'Q25') {
        const recs = ans.value as CropHistorySeasonRecord[];
        valueDisplay = recs.map((r) => `${r.cropName} (${r.seasonLabel} ${r.seasonYear})`).join(' → ');
      } else if (q.id === 'Q14') {
        valueDisplay = `${ans.value.length} nutrient result(s)`;
      } else if (q.id === 'Q16') {
        valueDisplay = `${ans.value.length} limitation(s) noted`;
      } else if (q.id === 'Q28') {
        valueDisplay = `${ans.value.length} recurring issue(s)`;
      } else if (q.id === 'Q40') {
        valueDisplay = `${ans.value.length} yield record(s)`;
      } else {
        valueDisplay = ans.value
          .map((v) =>
            typeof v === 'string'
              ? q.options?.find((o) => o.value === v)?.label || v
              : JSON.stringify(v)
          )
          .join(', ');
      }
    } else if (ans.value && typeof ans.value === 'object') {
      const obj = ans.value as Record<string, unknown>;
      if (q.id === 'Q01') {
        valueDisplay = `${String(obj.farmName || 'New Farm')}${obj.description ? ` — ${String(obj.description)}` : ''}`;
      } else if (q.id === 'Q02') {
        valueDisplay = String(obj.fieldName || obj.mode || 'Field selected');
      } else if (q.id === 'Q07') {
        valueDisplay =
          obj.status === 'known' && obj.value
            ? `${obj.value} ${String(obj.unit || 'hectares')}`
            : 'Not sure';
      } else if (q.id === 'Q11') {
        const ph = obj as unknown as SoilPhRecord;
        valueDisplay = ph.status === 'measured' && ph.value !== null ? `pH ${ph.value} (${ph.method || 'test'}, ${ph.depthValue ?? '?'}${ph.depthUnit})` : 'Not measured';
        dateLabel = ph.sampleDate || dateLabel;
      } else if (q.id === 'Q12') {
        const ec = obj as unknown as SoilEcRecord;
        valueDisplay = ec.status === 'measured' && ec.value !== null ? `${ec.value} ${ec.unit} (${ec.extractMethod})` : 'Not measured';
        dateLabel = ec.sampleDate || dateLabel;
      } else if (q.id === 'Q13') {
        const om = obj as unknown as SoilOrganicRecord;
        valueDisplay =
          om.status === 'measured' && om.value !== null
            ? `${om.kind === 'organic_matter' ? 'OM' : 'OC'} ${om.value}${om.unit}`
            : 'Not measured';
        dateLabel = om.sampleDate || dateLabel;
      } else if (q.id === 'Q21') {
        const lim = obj as unknown as SeasonalWaterLimitRecord;
        valueDisplay =
          lim.status === 'yes_known' && lim.amount !== null
            ? `${lim.amount} ${lim.unit} ${lim.period.replace('_', ' ')} (${lim.scope === 'this_field' ? 'This field' : 'Whole farm'})`
            : lim.status === 'yes_unknown_amount'
              ? 'Limited (amount unknown)'
              : lim.status === 'no_fixed_limit'
                ? 'No fixed limit'
                : 'Unknown';
      } else if (q.id === 'Q22') {
        const r = obj as unknown as IrrigationRoutineRecord;
        valueDisplay =
          r.frequencyType === 'every_n_days'
            ? `Routine: every ${r.everyNDays ?? '?'} days (${r.preferredTimeOfDay.replace('_', ' ')})`
            : `Routine: ${r.frequencyType.replace(/_/g, ' ')}`;
        warning = 'Planned routine only (not measured applied irrigation events).';
      } else if (q.id === 'Q23') {
        const est = obj as unknown as IrrigationApplicationEstimate;
        valueDisplay =
          est.status === 'known'
            ? est.mode === 'flow_and_duration'
              ? `~${est.flowRate ?? '?'} ${est.flowUnit} × ${est.durationHours ?? '?'} h`
              : `~${est.value ?? '?'} ${est.mode} per event`
            : est.status === 'varies'
              ? 'Varies'
              : 'Not measured';
      } else if (q.id === 'Q24') {
        const wq = obj as unknown as WaterQualityRecord;
        valueDisplay =
          wq.status === 'tested_with_lab_results' && wq.ecValue !== null
            ? `Tested: ${wq.ecValue} ${wq.ecUnit}`
            : wq.status.replace(/_/g, ' ');
      } else if (q.id === 'Q25') {
        const hist = obj as { mode?: string; records?: CropHistorySeasonRecord[] };
        valueDisplay =
          hist.mode === 'records' && Array.isArray(hist.records) && hist.records.length > 0
            ? hist.records.map((r) => `${r.cropName} (${r.seasonLabel} ${r.seasonYear})`).join(' → ')
            : hist.mode === 'new_field'
              ? 'New field (no prior crop history)'
              : 'Farmer does not remember';
      } else if (q.id === 'Q26') {
        const fc = obj as { status?: string; coverCropName?: string };
        valueDisplay =
          fc.status === 'cover_crop'
            ? `Cover Crop${fc.coverCropName ? `: ${fc.coverCropName}` : ''}`
            : String(fc.status || 'Unknown').replace(/_/g, ' ');
      } else if (q.id === 'Q27') {
        const cur = obj as unknown as CurrentCropRecord;
        valueDisplay =
          cur.status === 'yes' && cur.cropName
            ? `Currently planted: ${cur.cropName}${cur.plantingDate ? ` (planted ${cur.plantingDate})` : ''}`
            : cur.status.replace(/_/g, ' ');
      } else if (q.id === 'Q29') {
        const h = obj as { seasons?: number; basis?: string };
        valueDisplay = `${h.seasons ?? 4} ${h.basis || 'seasons'}`;
      } else if (q.id === 'Q30') {
        const cpy = obj as { count?: string; system?: string };
        valueDisplay =
          cpy.count === '2' || cpy.count === '3_plus'
            ? `${cpy.count === '3_plus' ? '3+' : '2'} cycles/year (${cpy.system || 'successive'})`
            : String(cpy.count || '1').replace(/_/g, ' ');
      } else if (q.id === 'Q31') {
        const pw = obj as { hasFixedWindows?: boolean; plantingWindow?: string; harvestWindow?: string };
        valueDisplay = pw.hasFixedWindows
          ? [pw.plantingWindow, pw.harvestWindow].filter(Boolean).join(' · ') || 'Fixed windows set'
          : 'Flexible dates';
      } else if (q.id === 'Q32' || q.id === 'Q33') {
        const cc = obj as { none?: boolean; crops?: string[] };
        valueDisplay = cc.none || !cc.crops?.length ? 'None' : cc.crops.join(', ');
      } else if (q.id === 'Q37') {
        const p = obj as { presetId?: PriorityPresetId };
        valueDisplay =
          p.presetId && p.presetId !== 'custom'
            ? PRIORITY_PRESET_VECTORS[p.presetId]?.label || p.presetId
            : 'Custom weights';
      } else if (q.id === 'Q38') {
        valueDisplay = 'Custom priority weights configured';
      } else {
        valueDisplay = JSON.stringify(obj);
      }
    }
  }

  return { valueDisplay, sourceBadge, dateLabel, warning };
}

export function isChecklistQuestionCompleted(draft: QuestionnaireDraft, qId: string): boolean {
  if (qId === 'Q01') {
    return Boolean(getAnswerValue<{ farmName?: string }>(draft, 'Q01')?.farmName?.trim());
  }
  if (qId === 'Q03') {
    const val = getAnswerValue<string>(draft, 'Q03')?.trim() || '';
    if (draft.setupIntent === 'new_field_existing_farm') {
      return Boolean(val && val !== 'Primary Field');
    }
    return Boolean(val);
  }
  if (qId === 'Q05') {
    return Boolean(draft.location?.confirmedByUser);
  }
  if (qId === 'Q06') {
    return draft.geometry.geometryStatus === 'polygon_verified';
  }
  if (qId === 'Q07') {
    const q07 = getAnswerValue<{ status?: string; value?: number | null }>(draft, 'Q07');
    return Boolean(q07?.status === 'known' && typeof q07.value === 'number' && q07.value > 0);
  }
  if (qId === 'Q08') {
    return Boolean(draft.location?.timezone || getAnswerValue<string>(draft, 'Q08'));
  }
  if (qId === 'Q17') {
    return Boolean(draft.answers['Q17']);
  }
  if (qId === 'Q25') {
    const q25 = draft.answers['Q25']?.value as { mode?: string; records?: unknown[] } | undefined;
    if (!q25) return false;
    if (q25.mode === 'records') return Array.isArray(q25.records) && q25.records.length > 0;
    return true;
  }
  if (qId === 'Q29') {
    return Boolean(getAnswerValue<{ seasons?: number }>(draft, 'Q29')?.seasons);
  }
  if (qId === 'Q37') {
    return Boolean(getAnswerValue<{ presetId?: string }>(draft, 'Q37')?.presetId);
  }

  const ans = draft.answers[qId];
  if (!ans) return false;
  if (ans.sourceType === 'skipped' || ans.sourceType === 'unknown') return false;

  if (qId === 'Q11' || qId === 'Q12' || qId === 'Q13') {
    const rec = ans.value as { status?: string } | undefined;
    return rec?.status === 'measured';
  }
  if (qId === 'Q14') {
    return Array.isArray(ans.value) && ans.value.length > 0;
  }
  if (qId === 'Q21' || qId === 'Q22' || qId === 'Q23' || qId === 'Q24') {
    const rec = ans.value as { status?: string; frequencyType?: string } | undefined;
    if (
      rec?.status === 'unknown' ||
      rec?.status === 'not_measured' ||
      rec?.frequencyType === 'unknown'
    ) {
      return false;
    }
  }
  if (qId === 'Q27') {
    const cur = ans.value as { status?: string } | undefined;
    if (cur?.status === 'unknown') return false;
  }
  return true;
}

function buildSimpleChecklistItems(draft: QuestionnaireDraft): ChecklistRowItem[] {
  const simpleQs =
    draft.mode === 'edit' && isSimpleStep1Prefilled(draft)
      ? SIMPLE_QUESTION_CATALOGUE.slice(2)
      : SIMPLE_QUESTION_CATALOGUE;

  return simpleQs.map((q, idx) => {
    let questionText = q.farmerQuestion;
    let completed = false;
    let answerSummary: string | null = null;

    if (q.id === 'SIMPLE_1') {
      const q01 = getAnswerValue<{ mode?: string; farmId?: string; farmName?: string }>(draft, 'Q01');
      if (draft.setupIntent === 'new_farm') {
        completed = true;
        answerSummary = 'Add a new farm';
      } else if (draft.setupIntent === 'new_field_existing_farm') {
        completed = Boolean(q01?.mode === 'existing' && q01?.farmId);
        if (completed) {
          answerSummary = `Add field to ${q01?.farmName || 'existing farm'}`;
        }
      }
    } else if (q.id === 'SIMPLE_2') {
      questionText =
        draft.setupIntent === 'new_field_existing_farm'
          ? 'Name your field and set its location'
          : 'Name your farm and set its location';
      const q01 = getAnswerValue<{ farmName?: string }>(draft, 'Q01');
      const q03 = getAnswerValue<string>(draft, 'Q03')?.trim() || '';
      const hasName =
        draft.setupIntent === 'new_field_existing_farm'
          ? Boolean(q03 && q03 !== 'Primary Field')
          : Boolean(q01?.farmName?.trim());
      const hasLoc = Boolean(draft.location?.confirmedByUser);
      completed = hasName && hasLoc;
      if (completed && draft.location) {
        const displayName =
          draft.setupIntent === 'new_field_existing_farm'
            ? q03
            : q01?.farmName?.trim() || 'Farm';
        answerSummary = `${displayName} · ${draft.location.placeLabel}`;
      }
    } else if (q.id === 'SIMPLE_3') {
      completed = isChecklistQuestionCompleted(draft, 'Q25');
      if (completed) {
        answerSummary = formatQuestionReviewDisplay(draft, QUESTION_BY_ID['Q25']).valueDisplay;
      }
    } else if (q.id === 'SIMPLE_4') {
      completed = isChecklistQuestionCompleted(draft, 'Q17');
      if (completed) {
        answerSummary = formatQuestionReviewDisplay(draft, QUESTION_BY_ID['Q17']).valueDisplay;
      }
    } else if (q.id === 'SIMPLE_5') {
      completed = isChecklistQuestionCompleted(draft, 'Q37');
      if (completed) {
        answerSummary = formatQuestionReviewDisplay(draft, QUESTION_BY_ID['Q37']).valueDisplay;
      }
    }

    return {
      questionId: q.id,
      questionNumber: idx + 1,
      questionText,
      title: q.title,
      required: q.required,
      completed,
      status: completed ? 'completed' : q.required ? 'required' : 'optional',
      answerSummary,
    };
  });
}

export function buildReviewChecklist(draft: QuestionnaireDraft): ChecklistRowItem[] {
  const simpleItems = buildSimpleChecklistItems(draft);
  if (draft.experienceMode !== 'advanced') {
    return simpleItems;
  }

  const deeperQs = getDeeperAccuracyRoute(draft).filter(
    (q) =>
      q.id !== 'REVIEW' &&
      q.id !== 'Q00' &&
      q.id !== 'Q02' &&
      !SIMPLE_COVERED_ADVANCED_IDS.has(q.id)
  );

  const deeperItems: ChecklistRowItem[] = deeperQs.map((q, idx) => {
    const required = REQUIRED_CHECKLIST_IDS.has(q.id);
    const completed = isChecklistQuestionCompleted(draft, q.id);
    const status: ChecklistRowItem['status'] = completed
      ? 'completed'
      : required
        ? 'required'
        : 'optional';

    let answerSummary: string | null = null;
    if (completed) {
      const formatted = formatQuestionReviewDisplay(draft, q);
      answerSummary = formatted.valueDisplay;
    }

    return {
      questionId: q.id,
      questionNumber: simpleItems.length + idx + 1,
      questionText: q.farmerQuestion,
      title: q.title,
      required,
      completed,
      status,
      answerSummary,
    };
  });

  return [...simpleItems, ...deeperItems];
}

export function analyzeMissingDataAndReview(draft: QuestionnaireDraft): {
  reviewRows: ReviewRowItem[];
  missingDataGaps: MissingDataGapItem[];
  canRunAssessment: boolean;
  evidenceCoverageGrade: 'Strong evidence' | 'Some gaps' | 'Limited evidence';
} {
  const isAdvanced = draft.experienceMode === 'advanced';
  const fullRoute = getVisibleQuestionRoute(draft);
  const q17Pre = getAnswerValue<string>(draft, 'Q17');
  const coreIds = new Set<string>([
    'Q01',
    'Q03',
    'Q05',
    'Q08',
    'Q25',
    ...(draft.answers['Q26'] ? ['Q26'] : []),
    'Q17',
    ...(q17Pre === 'irrigation_only' || q17Pre === 'both' ? ['Q20'] : []),
    'Q29',
    'Q37',
    ...(draft.geometry.geometryStatus === 'polygon_verified' ? ['Q06'] : []),
    ...(draft.refinementQuestionIds || []),
  ]);
  const route = isAdvanced
    ? fullRoute
    : fullRoute.filter((q) => q.id !== 'REVIEW' && (coreIds.has(q.id) || Boolean(draft.answers[q.id])));

  const reviewRows: ReviewRowItem[] = [];
  const gaps: MissingDataGapItem[] = [];

  const groupMap: Record<string, ReviewRowItem['groupKey']> = {
    Q00: 'farm_field',
    Q01: 'farm_field',
    Q02: 'farm_field',
    Q03: 'farm_field',
    Q04: 'farm_field',
    Q05: 'location_boundary',
    Q06: 'location_boundary',
    Q07: 'location_boundary',
    Q08: 'location_boundary',
    Q09: 'soil_land',
    Q10: 'soil_land',
    Q11: 'soil_land',
    Q12: 'soil_land',
    Q13: 'soil_land',
    Q14: 'soil_land',
    Q15: 'soil_land',
    Q16: 'soil_land',
    Q17: 'water_irrigation',
    Q18: 'water_irrigation',
    Q19: 'water_irrigation',
    Q20: 'water_irrigation',
    Q21: 'water_irrigation',
    Q22: 'water_irrigation',
    Q23: 'water_irrigation',
    Q24: 'water_irrigation',
    Q25: 'crop_history',
    Q26: 'crop_history',
    Q27: 'crop_history',
    Q28: 'crop_history',
    Q29: 'planning_horizon',
    Q30: 'planning_horizon',
    Q31: 'planning_horizon',
    Q32: 'constraints',
    Q33: 'constraints',
    Q34: 'management',
    Q35: 'management',
    Q36: 'management',
    Q37: 'priorities_risk',
    Q38: 'priorities_risk',
    Q39: 'priorities_risk',
    Q40: 'priorities_risk',
    Q41: 'priorities_risk',
  };

  for (const q of route) {
    if (q.id === 'REVIEW') continue;
    const ans = draft.answers[q.id];
    const { valueDisplay, sourceBadge, dateLabel, warning } = formatQuestionReviewDisplay(draft, q);

    reviewRows.push({
      questionId: q.id,
      groupKey: groupMap[q.id] || 'farm_field',
      label: q.title,
      valueDisplay,
      unit: ans?.unit,
      scope: ans?.scope || 'field',
      sourceBadge,
      dateLabel,
      warning,
    });
  }

  // Missing-Data Categorization (Spec §9.3)
  const q17 = getAnswerValue<string>(draft, 'Q17');
  const q29 = getAnswerValue<{ seasons?: number }>(draft, 'Q29');
  const q37 = getAnswerValue<{ presetId?: PriorityPresetId }>(draft, 'Q37');
  const q25 = draft.answers['Q25'];

  if (!draft.location) {
    gaps.push({
      id: 'gap-location',
      questionId: 'Q05',
      label: 'Confirmed field coordinates',
      impactGroup: 'blocks_calculation',
      explanation: 'A confirmed farm/field point is required to fetch local weather, climate, and timezone.',
      howToResolve: 'Return to Location Pin (Q05) and confirm a search result, map pin, or coordinates.',
    });
  }
  if (!q17) {
    gaps.push({
      id: 'gap-q17',
      questionId: 'Q17',
      label: 'Water access mode (Q17)',
      impactGroup: 'blocks_calculation',
      explanation: 'Must know whether the field is rain-fed, irrigated, both, or unknown.',
      howToResolve: 'Answer Q17 (Water Access Mode).',
    });
  }
  if (!q25) {
    gaps.push({
      id: 'gap-q25',
      questionId: 'Q25',
      label: 'Crop history state (Q25)',
      impactGroup: 'blocks_calculation',
      explanation: 'Record recent crops or explicitly select "I don’t remember" / "Field is new".',
      howToResolve: 'Complete Q25 (Recent Crops Grown).',
    });
  }
  if (!q29?.seasons) {
    gaps.push({
      id: 'gap-q29',
      questionId: 'Q29',
      label: 'Planning horizon (Q29)',
      impactGroup: 'blocks_calculation',
      explanation: 'Need an explicit number of seasons to generate sequences.',
      howToResolve: 'Select 3, 4, or 5 seasons in Q29.',
    });
  }
  if (!q37?.presetId) {
    gaps.push({
      id: 'gap-q37',
      questionId: 'Q37',
      label: 'Rotation priorities (Q37)',
      impactGroup: 'blocks_calculation',
      explanation: 'Select a priority preset or custom weights before ranking sequences.',
      howToResolve: 'Choose a preset in Q37.',
    });
  }
  if (!draft.consent.acceptedRemoteFetch) {
    gaps.push({
      id: 'gap-consent',
      label: 'Remote data retrieval consent',
      impactGroup: 'blocks_calculation',
      explanation: 'Confirm consent below before sending coordinates to Open-Meteo and NASA POWER.',
      howToResolve: 'Check the remote data consent box below.',
    });
  }

  // Optional coverage improvements (calm, non-blocking phrasing in Simple Mode)
  if (draft.geometry.geometryStatus !== 'polygon_verified') {
    gaps.push({
      id: 'gap-polygon',
      questionId: 'Q06',
      label: 'Field boundary polygon (optional)',
      impactGroup: 'reduces_coverage',
      explanation: 'First-pass assessment runs cleanly in location-only mode; adding a boundary polygon refines field-scale area checks.',
      howToResolve: 'Optional: outline the boundary on Maps or in optional accuracy questions.',
    });
  }

  const q09 = draft.answers['Q09'];
  if (!q09 || q09.sourceType === 'unknown' || q09.sourceType === 'skipped') {
    gaps.push({
      id: 'gap-soil-texture',
      questionId: 'Q09',
      label: 'Soil texture (optional)',
      impactGroup: 'reduces_coverage',
      explanation: 'Soil texture is left unmeasured rather than assumed ideal; crop suitability scores reflect available weather & water data.',
      howToResolve: 'Optional: answer the feel-guide soil texture question if you want soil-fit refinement.',
    });
  }

  const q10 = getAnswerValue<string>(draft, 'Q10');
  if (q10 !== 'yes_full' && q10 !== 'yes_partial') {
    gaps.push({
      id: 'gap-soil-lab',
      questionId: 'Q10',
      label: 'Soil lab test (optional)',
      impactGroup: 'reduces_coverage',
      explanation: 'Lab pH and salinity checks are skipped for now unless you choose to enter soil test results.',
      howToResolve: 'Optional: add soil test values anytime via Improve Accuracy.',
    });
  }

  // SoilGrids paused upstream
  gaps.push({
    id: 'gap-soilgrids-unavailable',
    label: 'ISRIC SoilGrids REST API',
    impactGroup: 'source_unavailable',
    explanation: 'ISRIC SoilGrids REST endpoint is paused upstream; mapped soil priors are currently unavailable.',
    howToResolve: 'First-pass assessment uses Open-Meteo ERA5, NASA POWER, and any details you share.',
  });

  if (q17 === 'rainfall_only') {
    gaps.push({
      id: 'gap-irr-na',
      label: 'Irrigation source, routine & quality (Q18–Q24)',
      impactGroup: 'not_applicable',
      explanation: 'Skipped because the field is purely rain-fed.',
      howToResolve: 'No action needed unless supplemental irrigation is added later.',
    });
  }

  const staleAnswers = Object.values(draft.answers).filter((a) => a.stale);
  for (const sa of staleAnswers) {
    gaps.push({
      id: `gap-stale-${sa.questionId}`,
      questionId: sa.questionId,
      label: `${QUESTION_BY_ID[sa.questionId]?.title || sa.questionId} needs re-confirmation`,
      impactGroup: 'needs_confirmation',
      explanation: sa.staleReason || 'An upstream answer changed after this value was saved.',
      howToResolve: `Click Edit on ${sa.questionId} to confirm.`,
    });
  }

  const hasBlockers = gaps.some((g) => g.impactGroup === 'blocks_calculation');
  const reducesCount = gaps.filter((g) => g.impactGroup === 'reduces_coverage').length;
  const evidenceCoverageGrade: 'Strong evidence' | 'Some gaps' | 'Limited evidence' =
    reducesCount === 0 ? 'Strong evidence' : reducesCount <= 2 ? 'Some gaps' : 'Limited evidence';

  return {
    reviewRows,
    missingDataGaps: gaps,
    canRunAssessment: !hasBlockers,
    evidenceCoverageGrade,
  };
}

export function buildImmutableSnapshot(
  draft: QuestionnaireDraft,
  inputVersion = 1
): ImmutableInputSnapshot {
  const { farmName, fieldName } = extractFarmAndFieldNames(draft);
  const rawPriority = resolvePriorityVector(draft);
  const normalizedPriorities = normalizePriorityVector(rawPriority);
  const analysis = analyzeMissingDataAndReview(draft);
  const declaredAreaHa = extractDeclaredAreaHa(draft);
  const hashSource = JSON.stringify({
    farmId: draft.farmId,
    fieldId: draft.fieldId,
    location: draft.location ? [draft.location.latitude, draft.location.longitude, draft.location.timezone] : null,
    geometryVersion: draft.geometry.geometryVersion,
    answers: Object.fromEntries(
      Object.entries(draft.answers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, { value: v.value, unit: v.unit, sourceType: v.sourceType }])
    ),
    normalizedPriorities,
  });

  return {
    inputSnapshotId: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    questionnaireId: draft.questionnaireId,
    schemaVersion: 1,
    inputVersion,
    farmId: draft.farmId,
    fieldId: draft.fieldId,
    farmName,
    fieldName,
    createdAt: new Date().toISOString(),
    location: draft.location,
    geometry: draft.geometry,
    declaredAreaHa,
    normalizedPriorities,
    priorityPresetId: rawPriority.presetId,
    consent: draft.consent,
    answers: draft.answers,
    reviewRows: analysis.reviewRows,
    missingDataGaps: analysis.missingDataGaps,
    canRunAssessment: analysis.canRunAssessment,
    evidenceCoverageGrade: analysis.evidenceCoverageGrade,
    inputHash: stableHash(hashSource),
  };
}

// ============================================================================
// 6. Deterministic Crop Suitability & Sequence Search (consumes Snapshot)
// ============================================================================

export function evaluateSnapshotAssessment(
  snapshot: ImmutableInputSnapshot,
  evidence: EnvironmentalEvidenceSummary
): AssessmentResultBundle {
  const ans = (qid: string) => snapshot.answers[qid]?.value;
  const ansProvenance = (qid: string) => snapshot.answers[qid]?.sourceType;

  const q09 = ans('Q09') as string | undefined;
  const q10 = ans('Q10') as string | undefined;
  const q11 = ans('Q11') as SoilPhRecord | undefined;
  const q12 = ans('Q12') as SoilEcRecord | undefined;
  const q15 = ans('Q15') as string | undefined;
  const q17 = ans('Q17') as string | undefined;
  const q20 = ans('Q20') as string | undefined;
  const q22 = ans('Q22') as IrrigationRoutineRecord | undefined;
  const q23 = ans('Q23') as IrrigationApplicationEstimate | undefined;
  const q24 = ans('Q24') as WaterQualityRecord | undefined;
  const q25 = ans('Q25') as { mode?: string; records?: CropHistorySeasonRecord[] } | undefined;
  const q29 = ans('Q29') as { seasons?: number } | undefined;
  const q32 = ans('Q32') as { crops?: string[]; none?: boolean } | undefined;
  const q33 = ans('Q33') as { crops?: string[]; none?: boolean } | undefined;

  const meanTempC = evidence.historicalClimate?.meanAnnualTempC ?? evidence.nasaPowerDaily?.meanTempC ?? null;
  const annualPrecipMm = evidence.historicalClimate?.meanAnnualPrecipMm ?? null;
  const annualEt0Mm = evidence.historicalClimate?.meanAnnualEt0Mm ?? null;
  const effectiveRainMm = annualPrecipMm !== null ? estimateEffectiveRainfallMm(annualPrecipMm) : null;

  const phMeasured =
    (q10 === 'yes_full' || q10 === 'yes_partial') && q11?.status === 'measured' && q11.value !== null
      ? q11.value
      : null;

  const soilEcDsM =
    (q10 === 'yes_full' || q10 === 'yes_partial') && q12?.status === 'measured' && q12.value !== null
      ? ecToDsM(q12.value, q12.unit).dsPerM
      : null;
  const waterEcDsM =
    q24?.status === 'tested_with_lab_results' && q24.ecValue !== null
      ? ecToDsM(q24.ecValue, q24.ecUnit).dsPerM
      : null;
  const effectiveEcDsM =
    soilEcDsM !== null && waterEcDsM !== null
      ? Math.max(soilEcDsM, waterEcDsM)
      : soilEcDsM ?? waterEcDsM;

  const waterlogged = q15 === 'pools_waterlogs' || q15 === 'stays_wet_long';
  const rainfedOnly = q17 === 'rainfall_only';
  const waterConstrained =
    rainfedOnly && annualPrecipMm !== null && annualPrecipMm < 360 ||
    q20 === 'unreliable_rationed' ||
    q20 === 'restricted_dry' ||
    q20 === 'highly_variable';

  const excludedIds = new Set(
    (q33?.crops || []).map((c) => c.toLowerCase().trim())
  );
  const requiredIds = (q32?.crops || []).map((c) => c.toLowerCase().trim());

  const recentRecords: CropHistorySeasonRecord[] = Array.isArray(q25?.records) ? q25.records : [];
  const mostRecentFamily = recentRecords[0]?.botanicalFamily || null;

  const EPS = 0.05;

  const cropSuitability = QUESTIONNAIRE_CROP_LIBRARY.map((crop) => {
    const isExcluded =
      excludedIds.has(crop.cropId) || excludedIds.has(crop.cropName.toLowerCase());
    if (isExcluded) {
      return {
        cropId: crop.cropId,
        cropName: crop.cropName,
        botanicalFamily: crop.botanicalFamily,
        status: 'excluded' as const,
        suitabilityScore: null,
        coverageGrade: snapshot.evidenceCoverageGrade,
        limitingFactor: 'Excluded by farmer constraint (Q33)',
      };
    }

    // Hard feasibility gate BEFORE preferences
    if (meanTempC !== null && (meanTempC < crop.hardTempRange[0] || meanTempC > crop.hardTempRange[1])) {
      return {
        cropId: crop.cropId,
        cropName: crop.cropName,
        botanicalFamily: crop.botanicalFamily,
        status: 'infeasible' as const,
        suitabilityScore: null,
        coverageGrade: snapshot.evidenceCoverageGrade,
        hardGateFailure: `Mean temperature (${meanTempC.toFixed(1)} °C) outside feasible range (${crop.hardTempRange[0]}–${crop.hardTempRange[1]} °C).`,
        limitingFactor: 'Hard climate temperature limit',
      };
    }
    if (phMeasured !== null && (phMeasured < crop.hardPhRange[0] || phMeasured > crop.hardPhRange[1])) {
      return {
        cropId: crop.cropId,
        cropName: crop.cropName,
        botanicalFamily: crop.botanicalFamily,
        status: 'infeasible' as const,
        suitabilityScore: null,
        coverageGrade: snapshot.evidenceCoverageGrade,
        hardGateFailure: `Measured soil pH (${phMeasured.toFixed(1)}) outside crop tolerance (${crop.hardPhRange[0]}–${crop.hardPhRange[1]}).`,
        limitingFactor: 'Hard soil pH tolerance floor',
      };
    }
    if (effectiveEcDsM !== null && effectiveEcDsM > crop.ecLimitDsM * 1.45) {
      return {
        cropId: crop.cropId,
        cropName: crop.cropName,
        botanicalFamily: crop.botanicalFamily,
        status: 'infeasible' as const,
        suitabilityScore: null,
        coverageGrade: snapshot.evidenceCoverageGrade,
        hardGateFailure: `Measured EC (${effectiveEcDsM.toFixed(2)} dS/m) exceeds severe osmotic limit (${crop.ecLimitDsM} dS/m threshold).`,
        limitingFactor: 'Hard salinity limit',
      };
    }
    if (rainfedOnly && annualPrecipMm !== null && annualPrecipMm < 240 && crop.waterNeedBand === 'High') {
      return {
        cropId: crop.cropId,
        cropName: crop.cropName,
        botanicalFamily: crop.botanicalFamily,
        status: 'infeasible' as const,
        suitabilityScore: null,
        coverageGrade: snapshot.evidenceCoverageGrade,
        hardGateFailure: `Rain-fed annual precipitation (${annualPrecipMm} mm) cannot satisfy high-ET demand (~${crop.seasonalEtcMmTypical} mm).`,
        limitingFactor: 'Hard rain-fed water deficit',
      };
    }

    // Supported factor scoring on [0..1] (never assign 1.0 to missing inputs!)
    const factorScores: Array<{ weight: number; score: number; label: string }> = [];

    if (meanTempC !== null) {
      let fTemp = 1.0;
      if (meanTempC < crop.optTempRange[0]) {
        fTemp = Math.max(0.25, 1 - (crop.optTempRange[0] - meanTempC) * 0.08);
      } else if (meanTempC > crop.optTempRange[1]) {
        fTemp = Math.max(0.25, 1 - (meanTempC - crop.optTempRange[1]) * 0.08);
      }
      factorScores.push({ weight: 0.30, score: fTemp, label: 'Temperature regime' });
    }

    // Water factor
    let fWater = 0.78;
    if (crop.waterNeedBand === 'High') {
      fWater = waterConstrained ? 0.38 : rainfedOnly ? 0.62 : 0.90;
    } else if (crop.waterNeedBand === 'Moderate') {
      fWater = waterConstrained ? 0.68 : 0.88;
    } else {
      fWater = waterConstrained ? 0.92 : 0.94;
    }
    if (q17 && ansProvenance('Q17') !== 'unknown') {
      factorScores.push({ weight: 0.28, score: fWater, label: 'Water supply alignment' });
    }

    // Soil texture factor (only when provided)
    if (q09 && ansProvenance('Q09') !== 'unknown' && ansProvenance('Q09') !== 'skipped') {
      let fTex = 0.85;
      if (q09 === 'loam' || q09 === 'silt_loam') fTex = 0.96;
      else if (q09 === 'sandy_loam' || q09 === 'clay_loam') fTex = 0.86;
      else if (q09 === 'sand' || q09 === 'loamy_sand') fTex = crop.waterNeedBand === 'Low' ? 0.78 : 0.56;
      else if (q09 === 'clay') fTex = crop.waterloggingTolerant ? 0.82 : 0.66;
      factorScores.push({ weight: 0.16, score: fTex, label: 'Soil texture fit' });
    }

    // Soil pH factor (only when measured)
    if (phMeasured !== null) {
      let fPh = 0.95;
      if (phMeasured < crop.optPhRange[0]) {
        fPh = Math.max(0.3, 0.92 - (crop.optPhRange[0] - phMeasured) * 0.35);
      } else if (phMeasured > crop.optPhRange[1]) {
        fPh = Math.max(0.3, 0.92 - (phMeasured - crop.optPhRange[1]) * 0.35);
      }
      factorScores.push({ weight: 0.14, score: fPh, label: 'Measured soil pH' });
    }

    // Drainage factor (only when provided)
    if (q15 && ansProvenance('Q15') !== 'unknown' && ansProvenance('Q15') !== 'skipped') {
      const fDrain = waterlogged ? (crop.waterloggingTolerant ? 0.82 : 0.42) : 0.92;
      factorScores.push({ weight: 0.12, score: fDrain, label: 'Field drainage' });
    }

    // Weighted geometric mean: 100 * exp(sum(w_i * ln(max(EPS, f_i))))
    const totalW = factorScores.reduce((s, f) => s + f.weight, 0);
    let suitabilityScore: number | null = null;
    let limitingFactor = 'Insufficient local inputs for weighted suitability';
    if (totalW > 0) {
      const logSum = factorScores.reduce(
        (acc, f) => acc + (f.weight / totalW) * Math.log(Math.max(EPS, f.score)),
        0
      );
      suitabilityScore = Math.round(Math.min(98, Math.max(15, 100 * Math.exp(logSum))));
      const weakest = [...factorScores].sort((a, b) => a.score - b.score)[0];
      limitingFactor =
        weakest.score < 0.75
          ? `${weakest.label} (${Math.round(weakest.score * 100)}% factor fit)`
          : 'No severe limiting factor across available evidence';
    }

    const coveredFactors = factorScores.length;
    const coverageGrade: 'Strong evidence' | 'Some gaps' | 'Limited evidence' =
      coveredFactors >= 4 ? 'Strong evidence' : coveredFactors >= 2 ? 'Some gaps' : 'Limited evidence';

    return {
      cropId: crop.cropId,
      cropName: crop.cropName,
      botanicalFamily: crop.botanicalFamily,
      status: (suitabilityScore !== null && suitabilityScore >= 72
        ? 'eligible'
        : 'caution') as 'eligible' | 'caution',
      suitabilityScore,
      coverageGrade,
      limitingFactor,
    };
  });

  // Deterministic Sequence Search over horizon (3, 4, or 5 seasons; 3 default for Simple Mode)
  const seasonsCount = Math.min(5, Math.max(3, q29?.seasons ?? 3));
  const feasibleCrops = cropSuitability.filter(
    (c) => c.status === 'eligible' || c.status === 'caution'
  );
  const feasibleIds = new Set(feasibleCrops.map((c) => c.cropId));

  const templateBlueprints: Array<{ id: string; title: string; cropIds: string[]; focus: string }> = [
    {
      id: 'seq-wheat-chickpea-sorghum-cover',
      title: 'Winter Wheat → Chickpea → Sorghum → Cover Crop',
      cropIds: ['wheat', 'chickpea', 'sorghum', 'cover_crop', 'wheat'],
      focus: 'Balanced nitrogen fixation + C3/C4 cereal break',
    },
    {
      id: 'seq-barley-peas-sunflower-fallow',
      title: 'Barley → Field Peas → Sunflower → Fallow',
      cropIds: ['barley', 'peas', 'sunflower', 'fallow', 'barley'],
      focus: 'Low-water drought resilience & taproot scavenging',
    },
    {
      id: 'seq-wheat-peas-cover-barley',
      title: 'Wheat → Field Peas → Cover Crop → Barley',
      cropIds: ['wheat', 'peas', 'cover_crop', 'barley', 'peas'],
      focus: 'Soil structure & living organic matter rebuilding',
    },
    {
      id: 'seq-soybean-wheat-maize-cover',
      title: 'Soybean → Wheat → Maize → Cover Crop',
      cropIds: ['soybean', 'wheat', 'maize', 'cover_crop', 'soybean'],
      focus: 'High biomass & grain productivity where water permits',
    },
    {
      id: 'seq-chickpea-barley-sunflower-peas',
      title: 'Chickpea → Barley → Sunflower → Field Peas',
      cropIds: ['chickpea', 'barley', 'sunflower', 'peas', 'sorghum'],
      focus: 'Multi-family broadleaf/cereal diversification',
    },
  ];

  const rejectedSequences: Array<{ title: string; failedRule: string }> = [];
  const validCandidates: AssessmentResultBundle['candidateSequences'] = [];
  const weights = snapshot.normalizedPriorities;

  for (const bp of templateBlueprints) {
    const seqIds = bp.cropIds.slice(0, seasonsCount);

    // 1. Check excluded / infeasible crops
    const badCrop = seqIds.find((id) => !feasibleIds.has(id));
    if (badCrop) {
      const evalRec = cropSuitability.find((c) => c.cropId === badCrop);
      rejectedSequences.push({
        title: bp.title,
        failedRule: evalRec?.hardGateFailure || evalRec?.limitingFactor || `Crop ${badCrop} unavailable`,
      });
      continue;
    }

    // 2. Check required crops
    const missingReq = requiredIds.find(
      (reqId) => !seqIds.includes(reqId) && !seqIds.some((id) => id.includes(reqId))
    );
    if (missingReq) {
      rejectedSequences.push({
        title: bp.title,
        failedRule: `Omits farmer-required crop (${missingReq}) within ${seasonsCount}-season horizon`,
      });
      continue;
    }

    // 3. Family return interval against immediate previous season
    const firstCropRule = QUESTIONNAIRE_CROP_LIBRARY.find((c) => c.cropId === seqIds[0]);
    if (
      mostRecentFamily &&
      firstCropRule &&
      firstCropRule.plainFamily !== 'Cover Crop' &&
      firstCropRule.plainFamily !== 'Fallow' &&
      mostRecentFamily.toLowerCase().includes(firstCropRule.botanicalFamily.toLowerCase())
    ) {
      rejectedSequences.push({
        title: bp.title,
        failedRule: `Repeats botanical family (${firstCropRule.botanicalFamily}) immediately after last recorded season`,
      });
      continue;
    }

    const rules = seqIds.map((id) => QUESTIONNAIRE_CROP_LIBRARY.find((c) => c.cropId === id)!);
    const avgSuit =
      rules.reduce((s, r) => {
        const sc = cropSuitability.find((c) => c.cropId === r.cropId)?.suitabilityScore ?? 65;
        return s + sc;
      }, 0) / rules.length;

    const avgEtc = rules.reduce((s, r) => s + r.seasonalEtcMmTypical, 0) / rules.length;
    const waterScore = Math.max(30, Math.min(98, 115 - (avgEtc - 220) * 0.2));
    const hasLegume = rules.some((r) => r.plainFamily === 'Legume');
    const hasCover = rules.some((r) => r.plainFamily === 'Cover Crop');
    const soilScore = Math.min(98, 60 + (hasLegume ? 18 : 0) + (hasCover ? 16 : 0));
    const lowWaterCount = rules.filter((r) => r.waterNeedBand === 'Low').length;
    const resilienceScore = Math.min(98, 56 + lowWaterCount * 12);
    const prodScore = Math.min(98, Math.round(52 + rules.filter((r) => r.plainFamily === 'Cereal' || r.plainFamily === 'Oilseed').length * 14));

    const matchScore = Math.round(
      weights.waterEfficiency * waterScore +
        weights.soilImprovement * soilScore +
        weights.climateResilience * resilienceScore +
        weights.cropSuitability * avgSuit +
        weights.productivityPotential * prodScore
    );

    validCandidates.push({
      id: bp.id,
      title: bp.title,
      cropIds: seqIds,
      cropNames: rules.map((r) => r.cropName),
      matchScore,
      evidenceGrade: snapshot.evidenceCoverageGrade,
      waterNote: `Mean crop ETc proxy ~${Math.round(avgEtc)} mm/season (${bp.focus}).`,
      soilNote: hasLegume
        ? 'Includes legume biological N fixation + diverse rooting architecture.'
        : 'Focused on moisture preservation and low-demand residue.',
      tieBreakNote: `Deterministic score ${matchScore} (input hash ${snapshot.inputHash}).`,
    });
  }

  validCandidates.sort((a, b) => b.matchScore - a.matchScore || a.id.localeCompare(b.id));

  // Water calculation honesty check
  const hasActualIrrigationAmount = q23?.status === 'known' && q23.value !== null;
  const irrigationRoutineNote =
    q22 && q22.frequencyType !== 'unknown'
      ? `Routine reported (${q22.frequencyType.replace(/_/g, ' ')}) — stored strictly as Iroutine, not actual applied water I.`
      : null;

  return {
    snapshotId: snapshot.inputSnapshotId,
    farmId: snapshot.farmId,
    fieldId: snapshot.fieldId,
    farmName: snapshot.farmName,
    fieldName: snapshot.fieldName,
    engineVersion: QUESTIONNAIRE_ENGINE_VERSION,
    cropKnowledgeVersion: QUESTIONNAIRE_CROP_KB_VERSION,
    evidenceCoverageGrade: snapshot.evidenceCoverageGrade,
    evidenceCoverageReasons: snapshot.missingDataGaps
      .filter((g) => g.impactGroup === 'reduces_coverage' || g.impactGroup === 'source_unavailable')
      .map((g) => g.label),
    evidence,
    waterCalculationSummary: {
      et0Method:
        annualEt0Mm !== null
          ? 'Open-Meteo ERA5 daily FAO-56 reference evapotranspiration (et0_fao_evapotranspiration)'
          : 'Unavailable (insufficient historical ET0 series)',
      et0MmPeriod: annualEt0Mm,
      effectiveRainMethod: 'USDA-SCS monthly precipitation attenuation Peff (never raw P = Peff)',
      effectiveRainMmPeriod: effectiveRainMm,
      irrigationActualMm: hasActualIrrigationAmount && q23?.mode === 'mm' ? q23.value : null,
      irrigationRoutineNote,
      waterBalanceStatus:
        annualEt0Mm !== null && effectiveRainMm !== null
          ? hasActualIrrigationAmount
            ? 'computed_partial'
            : 'routine_context_only'
          : 'unavailable',
      limitationNote: rainfedOnly
        ? 'Rain-fed field: no applied irrigation events included.'
        : hasActualIrrigationAmount
          ? 'Single-event estimate captured; soil AWC and deep drainage require root-zone sensors for full daily balance.'
          : 'Routine-only or unmetered irrigation: exact applied millimetres remain unknown.',
    },
    cropSuitability,
    candidateSequences: validCandidates,
    rejectedSequences,
    noFeasibleCandidateReason:
      validCandidates.length === 0
        ? 'No feasible crop sequence passed all hard agronomic and farmer-confirmed exclusion/requirement rules.'
        : undefined,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 7. Handoff Conversion: Questionnaire Snapshot -> FarmProfile & RotationDraft
// ============================================================================

export function mapSnapshotToFarmProfile(snapshot: ImmutableInputSnapshot): FarmProfile {
  const now = new Date().toISOString();
  const { farmName } = extractFarmAndFieldNames(snapshot as unknown as QuestionnaireDraft);
  const ans = snapshot.answers;
  const q09 = ans['Q09']?.value as string | undefined;
  const q10 = ans['Q10']?.value as string | undefined;
  const q11 = ans['Q11']?.value as SoilPhRecord | undefined;
  const q15 = ans['Q15']?.value as string | undefined;
  const q17 = ans['Q17']?.value as string | undefined;
  const q18 = ans['Q18']?.value as string[] | undefined;
  const q19 = ans['Q19']?.value as string | undefined;
  const q20 = ans['Q20']?.value as string | undefined;
  const q24 = ans['Q24']?.value as WaterQualityRecord | undefined;
  const q25 = ans['Q25']?.value as { mode?: string; records?: CropHistorySeasonRecord[] } | undefined;
  const q27 = ans['Q27']?.value as CurrentCropRecord | undefined;
  const q29 = ans['Q29']?.value as { seasons?: number } | undefined;
  const q33 = ans['Q33']?.value as { crops?: string[]; none?: boolean } | undefined;

  const textureMap: Record<string, SoilTexture> = {
    sand: 'Sandy',
    loamy_sand: 'Loamy sand',
    sandy_loam: 'Sandy loam',
    loam: 'Loam',
    silt_loam: 'Silt loam',
    clay_loam: 'Clay loam',
    clay: 'Clay',
  };
  const drainMap: Record<string, DrainageRate> = {
    drains_quickly: 'Quickly',
    drains_normally: 'Moderately',
    stays_wet_long: 'Slowly',
    pools_waterlogs: 'Very slowly',
  };
  const wateringMap: Record<string, WateringMethod> = {
    rainfall_only: 'Rain-fed agriculture',
    irrigation_only: 'Artificial irrigation',
    both: 'Hybrid (rainfall and irrigation)',
  };
  const reliabilityMap: Record<string, WaterReliability> = {
    reliable: 'Always available',
    usually_reliable: 'Usually available',
    restricted_dry: 'Sometimes limited',
    unreliable_rationed: 'Frequently limited',
    highly_variable: 'Highly unreliable',
  };
  const irrSourceMap: Record<string, WaterSource> = {
    well_groundwater: 'Groundwater / Well',
    river_stream: 'River / Stream',
    canal: 'Canal',
    reservoir_pond: 'Reservoir',
    treated_reclaimed: 'Recycled water',
    other: 'Other',
  };

  const recentRecs = Array.isArray(q25?.records) ? q25.records : [];
  const horizonMap: Record<number, PlanningHorizon> = {
    3: 'Next year',
    4: 'Next 2–3 years',
    5: 'Next 5 years',
  };

  return {
    id: snapshot.farmId,
    createdAt: snapshot.createdAt,
    updatedAt: now,
    currentStage: 5,
    completedStages: [1, 2, 3, 4, 5],
    location: {
      farmName,
      locationLabel: snapshot.location?.placeLabel || 'Confirmed location',
      regionOrAddress: snapshot.location?.adminArea || snapshot.location?.country || '',
      lat: snapshot.location?.latitude ?? null,
      lon: snapshot.location?.longitude ?? null,
      country: snapshot.location?.country,
      entryMode: snapshot.location?.locationMethod === 'browser_gps_confirmed' ? 'gps' : 'search',
    },
    areaValue: snapshot.geometry.geodesicAreaHa ?? snapshot.declaredAreaHa ?? null,
    areaUnit: 'hectares',
    soil: {
      texture: (q09 && textureMap[q09]) || 'Unknown',
      moistureStatus: 'unknown',
      moisturePct: null,
      moistureUnit: 'unspecified',
      moistureDepth: '',
      moistureMethod: '',
      moistureDate: '',
      phStatus: (q10 === 'yes_full' || q10 === 'yes_partial') && q11?.status === 'measured' ? 'tested' : 'not_tested',
      phValue: q11?.status === 'measured' ? q11.value : null,
      phTestDate: q11?.sampleDate || '',
      drainage: (q15 && drainMap[q15]) || 'Unknown',
      preparationMethods: [],
      preparationOther: '',
    },
    water: {
      sources: Array.isArray(q18) && q18.length > 0 ? q18.map((s) => irrSourceMap[s] || 'Other') : ['Unknown'],
      sourcesOther: '',
      reliability: (q20 && reliabilityMap[q20]) || 'Unknown',
      availableQuantityKnown: 'Unknown',
      availableQuantityValue: null,
      availableQuantityUnit: 'm³/day',
      qualityTested: q24?.status === 'tested_with_lab_results' ? 'Yes' : 'No',
      ecValue: q24?.ecValue ?? null,
      ecUnit: q24?.ecUnit === 'mS/cm' ? 'mS/cm' : q24?.ecUnit === 'uS/cm' ? 'µS/cm' : 'dS/m',
      salinityValue: q24?.tdsPpm ?? null,
      salinityUnit: 'ppm',
      qualityTestDate: q24?.testDate || '',
      wateringMethod: (q17 && wateringMap[q17]) || '',
      irrigationMethod:
        q19 === 'drip' || q19 === 'subsurface_drip'
          ? 'Drip irrigation'
          : q19 === 'sprinkler' || q19 === 'centre_pivot'
            ? 'Sprinkler irrigation'
            : q19 === 'surface_furrow'
              ? 'Furrow irrigation'
              : q19 === 'basin_flood'
                ? 'Flood irrigation'
                : 'Unknown',
      irrigationMethodOther: '',
      irrigationFrequency: 'Unknown',
      rainfallFrequency: 'Unknown',
    },
    crops: {
      previousCycle1: recentRecs[0] ? [recentRecs[0].cropId] : [],
      previousCycle2: recentRecs[1] ? [recentRecs[1].cropId] : [],
      previousCycle3: recentRecs[2] ? [recentRecs[2].cropId] : [],
      currentCrops: q27?.status === 'yes' && q27.cropId ? [q27.cropId] : [],
      plannedCrops: [],
      noRestrictions: Boolean(q33?.none),
      restrictedCrops: q33?.crops || [],
      restrictedOther: '',
      fertiliserType: 'Unknown',
      fertiliserDetails: '',
    },
    planning: {
      horizon: horizonMap[q29?.seasons ?? 3] || 'Next year',
      priorities: [PRIORITY_PRESET_VECTORS[snapshot.priorityPresetId === 'custom' ? 'balanced' : snapshot.priorityPresetId].label] as FarmProfile['planning']['priorities'],
      annualCycles: '1',
      growingSeasons: ['Spring', 'Autumn'],
      challenges: [],
      primaryChallenge: '',
      challengeOther: '',
    },
  };
}

export function mapSnapshotToRotationDraft(
  snapshot: ImmutableInputSnapshot,
  result?: AssessmentResultBundle | null
): RotationWizardDraft {
  const ans = snapshot.answers;
  const q09 = ans['Q09']?.value as string | undefined;
  const q10 = ans['Q10']?.value as string | undefined;
  const q11 = ans['Q11']?.value as SoilPhRecord | undefined;
  const q13 = ans['Q13']?.value as SoilOrganicRecord | undefined;
  const q15 = ans['Q15']?.value as string | undefined;
  const q17 = ans['Q17']?.value as string | undefined;
  const q18 = ans['Q18']?.value as string[] | undefined;
  const q20 = ans['Q20']?.value as string | undefined;
  const q24 = ans['Q24']?.value as WaterQualityRecord | undefined;
  const q25 = ans['Q25']?.value as { mode?: string; records?: CropHistorySeasonRecord[] } | undefined;
  const q26 = ans['Q26']?.value as { status?: string } | undefined;
  const q29 = ans['Q29']?.value as { seasons?: number } | undefined;
  const q30 = ans['Q30']?.value as { count?: string } | undefined;
  const q32 = ans['Q32']?.value as { crops?: string[] } | undefined;
  const q33 = ans['Q33']?.value as { crops?: string[] } | undefined;
  const q34 = ans['Q34']?.value as string[] | undefined;

  const textureMap: Record<string, SoilTexture> = {
    sand: 'Sandy',
    loamy_sand: 'Loamy sand',
    sandy_loam: 'Sandy loam',
    loam: 'Loam',
    silt_loam: 'Silt loam',
    clay_loam: 'Clay loam',
    clay: 'Clay',
  };
  const drainMap: Record<string, DrainageRate> = {
    drains_quickly: 'Quickly',
    drains_normally: 'Moderately',
    stays_wet_long: 'Slowly',
    pools_waterlogs: 'Very slowly',
  };
  const reliabilityMap: Record<string, WaterReliability> = {
    reliable: 'Always available',
    usually_reliable: 'Usually available',
    restricted_dry: 'Sometimes limited',
    unreliable_rationed: 'Frequently limited',
    highly_variable: 'Highly unreliable',
  };
  const irrSourceMap: Record<string, WaterSource> = {
    well_groundwater: 'Groundwater / Well',
    river_stream: 'River / Stream',
    canal: 'Canal',
    reservoir_pond: 'Reservoir',
    treated_reclaimed: 'Recycled water',
    other: 'Other',
  };

  const recentRecs = Array.isArray(q25?.records) ? q25.records : [];
  const om = q13 ? normalizeSoilOrganic(q13).organicMatterPct : null;
  const horizonSeasons: 3 | 4 | 5 =
    q29?.seasons === 5 ? 5 : q29?.seasons === 4 ? 4 : 3;

  const n = snapshot.normalizedPriorities;
  const waterSourceSummary =
    q17 === 'rainfall_only'
      ? 'Rain-fed only'
      : q17 === 'irrigation_only'
        ? 'Artificial irrigation'
        : 'Rain + Irrigation';
  const mappedWaterSources: WaterSource[] =
    Array.isArray(q18) && q18.length > 0
      ? q18.map((s) => irrSourceMap[s] || 'Other')
      : q17 === 'rainfall_only'
        ? ['Rainwater collection']
        : ['Unknown'];

  return {
    draftVersion: 2,
    farmId: snapshot.farmId,
    fieldId: snapshot.fieldId,
    farmName: snapshot.farmName,
    fieldName: snapshot.fieldName,
    soilTexture: (q09 && textureMap[q09]) || 'Unknown',
    soilTextureProvenance: q09 && ans['Q09']?.sourceType !== 'unknown' ? 'farmer_reported' : 'unknown',
    soilPh: (q10 === 'yes_full' || q10 === 'yes_partial') && q11?.status === 'measured' ? q11.value : null,
    soilPhProvenance: (q10 === 'yes_full' || q10 === 'yes_partial') && q11?.status === 'measured' ? 'farmer_confirmed' : 'unknown',
    drainage: (q15 && drainMap[q15]) || 'Unknown',
    soilMoisturePct: null,
    soilMoistureStatus: 'unknown',
    soilMoistureUnit: 'unspecified',
    soilMoistureDepth: '',
    soilMoistureMethod: '',
    soilMoistureDate: '',
    moistureUnitAmbiguityNote: null,
    soilOrganicMatterPct: om,
    waterSourceSummary,
    waterSources: mappedWaterSources,
    wateringMethod:
      q17 === 'rainfall_only'
        ? 'Rain-fed agriculture'
        : q17 === 'irrigation_only'
          ? 'Artificial irrigation'
          : 'Hybrid (rainfall and irrigation)',
    waterReliability: (q20 && reliabilityMap[q20]) || 'Unknown',
    dailyWaterCapM3: null,
    waterEcDsM:
      q24?.status === 'tested_with_lab_results' && q24.ecValue !== null
        ? ecToDsM(q24.ecValue, q24.ecUnit).dsPerM
        : null,
    waterProvenance: q17 ? 'farmer_reported' : 'unknown',
    recentCrops:
      recentRecs.length > 0
        ? recentRecs.map((r) => ({ seasonLabel: `${r.seasonLabel} (${r.seasonYear})`, cropName: r.cropName }))
        : [{ seasonLabel: 'Prior History', cropName: 'Unknown / New Field' }],
    recentCropDisplay:
      recentRecs[0] ? `${recentRecs[0].cropName} (${recentRecs[0].seasonYear})` : 'Not recorded',
    recentCropYear: recentRecs[0]?.seasonYear || new Date().getFullYear(),
    planningHorizonSeasons: horizonSeasons,
    planningHorizonLabel: `${horizonSeasons} Seasons` as unknown as PlanningHorizon,
    cropsPerYear: q30?.count === '2' || q30?.count === '3_plus' ? 2 : 1,
    coverOrFallowPreference:
      q26?.status === 'cover_crop' ? 'cover_crop' : q26?.status === 'fallow' ? 'fallow' : 'auto',
    excludedCrops: q33?.crops || [],
    requiredCrops: q32?.crops || [],
    tillagePractice:
      Array.isArray(q34) && q34.includes('no_till')
        ? 'Conservation / No-till'
        : Array.isArray(q34) && q34.includes('reduced_tillage')
          ? 'Minimum tillage'
          : Array.isArray(q34) && q34.includes('conventional_tillage')
            ? 'Conventional'
            : 'Unknown',
    priorities: {
      waterSaving: Math.round(n.waterEfficiency * 100),
      soilHealth: Math.round(n.soilImprovement * 100),
      climateResilience: Math.round(n.climateResilience * 100),
      cropSuitability: Math.round(n.cropSuitability * 100),
      productivity: Math.round(n.productivityPotential * 100),
      allowDominantPriority: false,
    },
    climateMeanTempC: result?.evidence.historicalClimate?.meanAnnualTempC ?? null,
    climateAnnualPrecipMm: result?.evidence.historicalClimate?.meanAnnualPrecipMm ?? null,
    lastSavedAt: snapshot.createdAt,
    currentStep: 0,
  };
}
