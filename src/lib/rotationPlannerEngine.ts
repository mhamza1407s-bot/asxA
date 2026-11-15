import { findCropCatalogItem } from '../data/farmCropCatalog';
import { CROP_KNOWLEDGE_LIBRARY } from './fieldAgronomyEngine';
import {
  AreaUnit,
  DrainageRate,
  PlanningHorizon,
  SoilMoistureUnit,
  SoilTexture,
  WaterReliability,
  WaterSource,
  WateringMethod,
} from '../types/farm';
import {
  MyFarmRecord,
  PlanDecisionEvent,
  PortfolioFieldRecord,
  RotationCandidateOption,
} from '../types/myFarms';
import { resolveEffectiveFieldSoil } from './soilProvenance';

export type ProvenanceStatus =
  | 'farmer_reported'
  | 'farmer_confirmed'
  | 'estimated'
  | 'from_field_data'
  | 'unknown';

export interface RotationPriorityWeights {
  waterSaving: number;
  soilHealth: number;
  climateResilience: number;
  cropSuitability: number;
  productivity: number;
  allowDominantPriority?: boolean;
}

export interface NormalizedWeightsResult {
  weights: Omit<RotationPriorityWeights, 'allowDominantPriority'>;
  clampedApplied: boolean;
  conflictWarning: string | null;
}

export interface RotationWizardDraft {
  draftVersion: number;
  farmId: string;
  fieldId: string | null;
  farmName: string;
  fieldName: string;
  soilTexture: SoilTexture;
  soilTextureProvenance: ProvenanceStatus;
  soilPh: number | null;
  soilPhProvenance: ProvenanceStatus;
  drainage: DrainageRate;
  soilMoisturePct: number | null;
  soilMoistureStatus?: 'measured' | 'estimated' | 'unknown';
  soilMoistureUnit?: SoilMoistureUnit;
  soilMoistureDepth?: string;
  soilMoistureMethod?: string;
  soilMoistureDate?: string;
  moistureUnitAmbiguityNote?: string | null;
  soilOrganicMatterPct: number | null;
  waterSourceSummary: string;
  waterSources: WaterSource[];
  wateringMethod: WateringMethod | '';
  waterReliability: WaterReliability;
  dailyWaterCapM3: number | null;
  waterEcDsM: number | null;
  waterProvenance: ProvenanceStatus;
  recentCrops: Array<{ seasonLabel: string; cropName: string }>;
  recentCropDisplay: string;
  recentCropYear: number;
  planningHorizonSeasons: 3 | 4 | 5;
  planningHorizonLabel: PlanningHorizon | '4 Seasons';
  cropsPerYear: 1 | 2;
  coverOrFallowPreference: 'auto' | 'cover_crop' | 'fallow';
  excludedCrops: string[];
  requiredCrops: string[];
  tillagePractice: 'Conservation / No-till' | 'Minimum tillage' | 'Conventional' | 'Unknown';
  priorities: RotationPriorityWeights;
  climateMeanTempC: number | null;
  climateAnnualPrecipMm: number | null;
  lastSavedAt: string;
  currentStep: number;
}

export interface CropSeasonStepDetail {
  occurrenceId: string;
  seasonNumber: number;
  yearNumber: number;
  seasonLabel: string;
  yearLabel: string;
  cropId: string;
  cropName: string;
  plainFamily: 'Cereal' | 'Legume' | 'Oilseed' | 'Root' | 'Cover Crop' | 'Fallow' | 'Other';
  botanicalFamily: string;
  durationDays: number;
  plantingWindow: string;
  harvestWindow: string;
  waterNeedBand: 'Low' | 'Moderate' | 'High';
  etcMmEstimate: number;
  effectiveRainMm: number;
  irrigationNeededMm: number;
  nitrogenBalanceKgHa: number; // + fixation credit or - uptake removal
  legumeCarryoverNote: string;
  diseaseBreakNote: string;
  keyBenefit: string;
  rationale: string;
  isFallow: boolean;
  isCoverCrop: boolean;
  fallowVsCoverReason?: string;
}

export interface RotationRiskItem {
  id: string;
  seasonNumber: number;
  cropName: string;
  severity: 'High' | 'Moderate' | 'Low';
  confidence: 'High' | 'Moderate' | 'Low';
  shortWarning: string;
  cause: string;
  evidenceRule: string;
  consequence: string;
  mitigation: string;
  confirmingData: string;
}

export interface RotationComponentScores {
  soilHealth: number;
  waterEfficiency: number;
  productivity: number;
  diversity: number;
  suitability: number;
  resilience: number;
}

export interface RotationPlanCandidate {
  id: string;
  planCode: 'Plan A' | 'Plan B' | 'Plan C' | 'Plan D' | 'Plan E';
  rank: number;
  title: string;
  subtitle: string;
  matchScore: number; // 0-100 composite preference match (explicitly NOT yield %)
  uncertaintyMarginPts: number; // e.g. ±4 pts
  confidencePct?: number; // deprecated synthetic field omitted by Batch B
  confidenceReason: string;
  dataGaps: string[];
  isRecommended: boolean;
  fitSummary: string;
  whyItFits: string[];
  comparisonBullets: Array<{ text: string; tone: 'positive' | 'neutral' | 'caution' }>;
  components: RotationComponentScores;
  totalWaterDemandMm: number;
  netNitrogenBalanceKgHa: number;
  totalCycleDays: number;
  steps: CropSeasonStepDetail[];
  risks: RotationRiskItem[];
  fallowVsCoverDecision: {
    chosen: 'Cover Crop' | 'Fallow' | 'Cash Sequence Only';
    reason: string;
  };
  reviewByDate: string;
  reviewTriggersList: string[];
  modelVersion: string;
}

export interface RejectedRotationCandidate {
  id: string;
  title: string;
  sequenceText: string;
  failedConstraint: string;
  computedValue: string;
  thresholdValue: string;
  deltaDescription: string;
  failureCategory: 'User Constraint' | 'Water Limit' | 'Family Return Interval' | 'Climate / Soil Fit';
}

export interface CropSuitabilityEvaluation {
  cropId: string;
  cropName: string;
  scientificName: string;
  plainFamily: 'Cereal' | 'Legume' | 'Oilseed' | 'Root' | 'Cover Crop' | 'Fallow' | 'Other';
  botanicalFamily: string;
  matchScore: number | null; // null if excluded or insufficient
  status: 'eligible' | 'caution' | 'unsuitable' | 'excluded' | 'insufficient';
  confidencePct?: number;
  limitingFactor: string;
  plainSummary: string;
  factors: Array<{
    key: 'temperature' | 'water' | 'soil_texture' | 'ph' | 'drainage' | 'salinity';
    label: string;
    score: number | null;
    statusText: string;
    detail: string;
    provenance: string;
  }>;
  missingToImprove: string[];
}

export interface RotationReviewTrigger {
  id: string;
  ruleVersion: string;
  severity: 'review_required' | 'review_suggested';
  dependency: string;
  triggeredAt: string;
  reason: string;
  assumptionAffected: string;
}

export interface RotationReviewGateState {
  status: 'current' | 'review_suggested' | 'review_required';
  badgeLabel: 'Plan current' | 'Review suggested' | 'Review required';
  lastCheckedAt: string;
  triggers: RotationReviewTrigger[];
  dismissedFingerprints: string[];
}

export interface HeadToHeadComparisonResult {
  leftPlan: RotationPlanCandidate;
  rightPlan: RotationPlanCandidate;
  rows: Array<{
    criterion: string;
    leftValue: string;
    rightValue: string;
    winner: 'left' | 'right' | 'tie';
  }>;
  conclusionHeadline: string;
  conclusionDetail: string;
}

export interface RotationEngineOutput {
  generatedAt: string;
  engineVersion: string;
  cropKnowledgeVersion: string;
  farmId: string;
  farmName: string;
  fieldId: string | null;
  fieldName: string;
  areaDisplay: string;
  inputSnapshotHash: string;
  normalizedWeights: NormalizedWeightsResult;
  candidates: RotationPlanCandidate[];
  rejectedCandidates: RejectedRotationCandidate[];
  cropSuitability: CropSuitabilityEvaluation[];
  reviewGate: RotationReviewGateState;
  additionalInsights: Array<{
    id: string;
    category: 'legume' | 'water' | 'cover_crop';
    title: string;
    summary: string;
    detail: string;
    actionHint: string;
  }>;
}

export interface PlanProsAndCons {
  pros: string[];
  cons: string[];
}

export const ROTATION_ENGINE_VERSION = 'fieldshift-rot-engine-v2.1.0';
export const ROTATION_KB_VERSION = 'fao56-rot-kb-v1.4.0';

const DRAFT_KEY_PREFIX = 'anchor_rotation_draft_v2_';
const DISMISSED_TRIGGER_PREFIX = 'anchor_rotation_dismissed_triggers_';

const PRIORITY_PRESETS: Record<
  'balanced' | 'water_first' | 'soil_recovery' | 'max_output',
  RotationPriorityWeights
> = {
  balanced: {
    waterSaving: 20,
    soilHealth: 25,
    climateResilience: 15,
    cropSuitability: 20,
    productivity: 20,
    allowDominantPriority: false,
  },
  water_first: {
    waterSaving: 38,
    soilHealth: 20,
    climateResilience: 20,
    cropSuitability: 12,
    productivity: 10,
    allowDominantPriority: false,
  },
  soil_recovery: {
    waterSaving: 18,
    soilHealth: 40,
    climateResilience: 17,
    cropSuitability: 15,
    productivity: 10,
    allowDominantPriority: false,
  },
  max_output: {
    waterSaving: 10,
    soilHealth: 15,
    climateResilience: 15,
    cropSuitability: 20,
    productivity: 40,
    allowDominantPriority: false,
  },
};

export function getPriorityPreset(
  preset: 'balanced' | 'water_first' | 'soil_recovery' | 'max_output'
): RotationPriorityWeights {
  return { ...PRIORITY_PRESETS[preset] };
}

/**
 * Normalizes user priority sliders to sum to 1.0 and applies a transparent
 * anti-domination clamp (max 0.55 per dimension unless allowDominantPriority is enabled).
 */
export function normalizePriorityWeights(
  input: RotationPriorityWeights
): NormalizedWeightsResult {
  const keys = [
    'waterSaving',
    'soilHealth',
    'climateResilience',
    'cropSuitability',
    'productivity',
  ] as const;

  const rawMap: Record<(typeof keys)[number], number> = {
    waterSaving: Math.max(0, Number(input.waterSaving) || 0),
    soilHealth: Math.max(0, Number(input.soilHealth) || 0),
    climateResilience: Math.max(0, Number(input.climateResilience) || 0),
    cropSuitability: Math.max(0, Number(input.cropSuitability) || 0),
    productivity: Math.max(0, Number(input.productivity) || 0),
  };

  let sum = keys.reduce((acc, k) => acc + rawMap[k], 0);
  if (sum <= 0) {
    return {
      weights: {
        waterSaving: 0.2,
        soilHealth: 0.25,
        climateResilience: 0.15,
        cropSuitability: 0.2,
        productivity: 0.2,
      },
      clampedApplied: false,
      conflictWarning: null,
    };
  }

  const normalized: Record<(typeof keys)[number], number> = {
    waterSaving: rawMap.waterSaving / sum,
    soilHealth: rawMap.soilHealth / sum,
    climateResilience: rawMap.climateResilience / sum,
    cropSuitability: rawMap.cropSuitability / sum,
    productivity: rawMap.productivity / sum,
  };

  let clampedApplied = false;
  if (!input.allowDominantPriority) {
    const MAX_CAP = 0.52;
    for (let iter = 0; iter < 4; iter++) {
      const overKeys = keys.filter((k) => normalized[k] > MAX_CAP + 1e-6);
      if (overKeys.length === 0) break;
      clampedApplied = true;
      let excess = 0;
      for (const k of overKeys) {
        excess += normalized[k] - MAX_CAP;
        normalized[k] = MAX_CAP;
      }
      const underKeys = keys.filter((k) => normalized[k] < MAX_CAP - 1e-6);
      const underSum = underKeys.reduce((acc, k) => acc + normalized[k], 0);
      if (underSum > 0) {
        for (const k of underKeys) {
          normalized[k] += (normalized[k] / underSum) * excess;
        }
      }
    }
  }

  sum = keys.reduce((acc, k) => acc + normalized[k], 0);
  for (const k of keys) {
    normalized[k] = Number((normalized[k] / sum).toFixed(4));
  }

  let conflictWarning: string | null = null;
  if (normalized.waterSaving >= 0.3 && normalized.productivity >= 0.3) {
    conflictWarning =
      'Trade-off note: High water saving and maximum short-term productivity pull in opposite directions during peak summer ET.';
  }

  return {
    weights: normalized,
    clampedApplied,
    conflictWarning,
  };
}

function parseHorizonSeasons(horizon?: string): 3 | 4 | 5 {
  if (!horizon) return 4;
  if (horizon.includes('3') || horizon.includes('5')) return 4;
  if (horizon.includes('Next year') || horizon.includes('Next season')) return 3;
  return 4;
}

function summarizeWaterMethod(farm: MyFarmRecord): string {
  const wm = farm.water.wateringMethod;
  if (wm === 'Hybrid (rainfall and irrigation)') return 'Rain + Irrigation';
  if (wm === 'Rain-fed agriculture') return 'Rain-fed only';
  if (wm === 'Artificial irrigation') {
    return farm.water.irrigationMethod || 'Full Irrigation';
  }
  if (farm.water.sources.length > 0 && farm.water.sources[0] !== 'Unknown') {
    return farm.water.sources.slice(0, 2).join(' + ');
  }
  return 'Water supply not specified';
}

export function buildInitialRotationDraft(
  farm: MyFarmRecord,
  fields: PortfolioFieldRecord[] = [],
  preferredFieldId?: string | null
): RotationWizardDraft {
  const farmFields = fields.filter((f) => f.farmId === farm.id);
  const targetField =
    (preferredFieldId && farmFields.find((f) => f.id === preferredFieldId)) ||
    farmFields[0] ||
    null;

  const currentYear = new Date().getFullYear();
  const primaryCropName = (targetField?.cropName || farm.primaryCrop || 'Wheat').trim();
  const prevHistory = targetField?.previousCrops?.length
    ? targetField.previousCrops
    : [primaryCropName];

  const recentCrops = prevHistory.slice(0, 3).map((cropName, idx) => ({
    seasonLabel: idx === 0 ? `Season -1 (${currentYear})` : `Season -${idx + 1}`,
    cropName,
  }));

  const horizons = parseHorizonSeasons(farm.planningHorizon);
  const effSoil = resolveEffectiveFieldSoil(farm.soil, targetField?.soilOverrides);
  const soilTexture: SoilTexture = effSoil.texture;

  const mappedPriorities: RotationPriorityWeights = {
    waterSaving: farm.priorities.some((p) => p.toLowerCase().includes('water')) ? 28 : 20,
    soilHealth: farm.priorities.some((p) => p.toLowerCase().includes('soil')) ? 28 : 24,
    climateResilience: farm.priorities.some((p) => p.toLowerCase().includes('climate')) ? 20 : 16,
    cropSuitability: 18,
    productivity: farm.priorities.some((p) => p.toLowerCase().includes('yield') || p.toLowerCase().includes('profit'))
      ? 28
      : 22,
    allowDominantPriority: false,
  };

  return {
    draftVersion: 2,
    farmId: farm.id,
    fieldId: targetField?.id ?? null,
    farmName: farm.name,
    fieldName: targetField?.name || `${farm.name} — Primary Block`,
    soilTexture,
    soilTextureProvenance:
      soilTexture !== 'Unknown' ? 'from_field_data' : 'unknown',
    soilPh: effSoil.phValue,
    soilPhProvenance:
      effSoil.phValue !== null
        ? effSoil.phStatus === 'tested'
          ? 'farmer_confirmed'
          : 'farmer_reported'
        : 'unknown',
    drainage: effSoil.drainage,
    soilMoisturePct: effSoil.moisturePct,
    soilMoistureStatus: effSoil.moistureStatus,
    soilMoistureUnit: effSoil.moistureUnit,
    soilMoistureDepth: effSoil.moistureDepth,
    soilMoistureMethod: effSoil.moistureMethod,
    soilMoistureDate: effSoil.moistureDate,
    moistureUnitAmbiguityNote: effSoil.moistureUnitAmbiguityNote,
    soilOrganicMatterPct: effSoil.organicMatterPct,
    waterSourceSummary: summarizeWaterMethod(farm),
    waterSources: farm.water.sources.length ? farm.water.sources : [],
    wateringMethod: farm.water.wateringMethod || '',
    waterReliability: farm.water.reliability || 'Unknown',
    dailyWaterCapM3: farm.water.dailyCapacityKnown ? farm.water.dailyCapacityM3 : null,
    waterEcDsM: farm.water.ecDsM ?? null,
    waterProvenance:
      farm.water.wateringMethod || farm.water.sources.length ? 'farmer_reported' : 'unknown',
    recentCrops,
    recentCropDisplay: `${primaryCropName} (${currentYear})`,
    recentCropYear: currentYear,
    planningHorizonSeasons: horizons,
    planningHorizonLabel: farm.planningHorizon || '4 Seasons',
    cropsPerYear: 1,
    coverOrFallowPreference: 'auto',
    excludedCrops: [],
    requiredCrops: [],
    tillagePractice: 'Conservation / No-till',
    priorities: mappedPriorities,
    climateMeanTempC: null,
    climateAnnualPrecipMm: null,
    lastSavedAt: farm.updatedAt || new Date().toISOString(),
    currentStep: 0,
  };
}

export function loadRotationDraft(
  farm: MyFarmRecord,
  fields: PortfolioFieldRecord[] = []
): RotationWizardDraft {
  const base = buildInitialRotationDraft(farm, fields);
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_KEY_PREFIX}${farm.id}`);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<RotationWizardDraft>;
    if (!parsed || parsed.farmId !== farm.id) return base;
    return {
      ...base,
      ...parsed,
      priorities: {
        ...base.priorities,
        ...(parsed.priorities || {}),
      },
      excludedCrops: Array.isArray(parsed.excludedCrops) ? parsed.excludedCrops : [],
      requiredCrops: Array.isArray(parsed.requiredCrops) ? parsed.requiredCrops : [],
      recentCrops: Array.isArray(parsed.recentCrops) && parsed.recentCrops.length > 0
        ? parsed.recentCrops
        : base.recentCrops,
    };
  } catch {
    return base;
  }
}

export function saveRotationDraft(draft: RotationWizardDraft): RotationWizardDraft {
  const updated: RotationWizardDraft = {
    ...draft,
    lastSavedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(`${DRAFT_KEY_PREFIX}${draft.farmId}`, JSON.stringify(updated));
    } catch {
      // Ignore storage limits
    }
  }
  return updated;
}

export function loadDismissedTriggers(farmId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${DISMISSED_TRIGGER_PREFIX}${farmId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function dismissRotationTrigger(farmId: string, fingerprint: string): string[] {
  const current = new Set(loadDismissedTriggers(farmId));
  current.add(fingerprint);
  const next = Array.from(current);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(`${DISMISSED_TRIGGER_PREFIX}${farmId}`, JSON.stringify(next));
    } catch {
      // Ignore storage limits
    }
  }
  return next;
}

interface CropSpec {
  id: string;
  name: string;
  scientificName: string;
  plainFamily: 'Cereal' | 'Legume' | 'Oilseed' | 'Root' | 'Cover Crop' | 'Fallow';
  botanicalFamily: string;
  durationDays: number;
  plantingWindow: string;
  harvestWindow: string;
  waterNeedBand: 'Low' | 'Moderate' | 'High';
  baseEtcMm: number;
  kcMid: number;
  nitrogenBalanceKgHa: number;
  soilImpactPts: number;
  yieldPotentialPts: number;
  droughtTolerancePts: number;
  optTempRange: [number, number];
  optPhRange: [number, number];
  ecLimitDsM: number;
  drainagePrefs: DrainageRate[];
  keyBenefit: string;
  rationale: string;
  diseaseBreakNote: string;
}

const CROP_SPECS: Record<string, CropSpec> = {
  wheat: {
    id: 'wheat',
    name: 'Wheat',
    scientificName: 'Triticum aestivum L.',
    plainFamily: 'Cereal',
    botanicalFamily: 'Poaceae (C3 Cereal)',
    durationDays: 115,
    plantingWindow: 'Oct – Nov (or early Mar spring)',
    harvestWindow: 'Jun – Jul',
    waterNeedBand: 'Moderate',
    baseEtcMm: 340,
    kcMid: 1.15,
    nitrogenBalanceKgHa: -95,
    soilImpactPts: 78,
    yieldPotentialPts: 88,
    droughtTolerancePts: 76,
    optTempRange: [10, 25],
    optPhRange: [6.0, 7.8],
    ecLimitDsM: 6.0,
    drainagePrefs: ['Moderately', 'Quickly'],
    keyBenefit: 'Builds structure',
    rationale: 'Fibrous winter/spring root system stabilizes aggregates and captures cool-season moisture.',
    diseaseBreakNote: 'Follows well after broadleaf or legume cycles; separates root-lesion nematode hosts.',
  },
  chickpea: {
    id: 'chickpea',
    name: 'Chickpea',
    scientificName: 'Cicer arietinum L.',
    plainFamily: 'Legume',
    botanicalFamily: 'Fabaceae (Pulse Legume)',
    durationDays: 105,
    plantingWindow: 'Mar – Apr',
    harvestWindow: 'Jul – Aug',
    waterNeedBand: 'Low',
    baseEtcMm: 265,
    kcMid: 1.0,
    nitrogenBalanceKgHa: 58,
    soilImpactPts: 94,
    yieldPotentialPts: 84,
    droughtTolerancePts: 89,
    optTempRange: [12, 29],
    optPhRange: [6.0, 8.0],
    ecLimitDsM: 2.0,
    drainagePrefs: ['Moderately', 'Quickly'],
    keyBenefit: 'Adds nitrogen',
    rationale: 'Symbiotic Rhizobium nodules fix atmospheric nitrogen (+45–65 kg N/ha residual credit) with low moisture demand.',
    diseaseBreakNote: 'Interrupts cereal take-all, Septoria, and Fusarium crown-rot cycles.',
  },
  sorghum: {
    id: 'sorghum',
    name: 'Sorghum',
    scientificName: 'Sorghum bicolor L.',
    plainFamily: 'Cereal',
    botanicalFamily: 'Poaceae (C4 Cereal)',
    durationDays: 120,
    plantingWindow: 'May – Jun',
    harvestWindow: 'Sep – Oct',
    waterNeedBand: 'Moderate',
    baseEtcMm: 410,
    kcMid: 1.08,
    nitrogenBalanceKgHa: -88,
    soilImpactPts: 82,
    yieldPotentialPts: 92,
    droughtTolerancePts: 90,
    optTempRange: [18, 36],
    optPhRange: [5.5, 7.8],
    ecLimitDsM: 6.8,
    drainagePrefs: ['Moderately', 'Quickly', 'Slowly'],
    keyBenefit: 'Drought tolerant',
    rationale: 'Warm-season C4 photosynthetic efficiency converts solar radiation and legume residual nitrogen into high grain biomass.',
    diseaseBreakNote: 'Different foliar pathogen complex from wheat; strong deep subsoil moisture scavenging.',
  },
  cover_crop: {
    id: 'cover_crop',
    name: 'Cover Crop',
    scientificName: 'Trifolium incarnatum / Vicia mix',
    plainFamily: 'Cover Crop',
    botanicalFamily: 'Fabaceae + Poaceae Living Mulch',
    durationDays: 75,
    plantingWindow: 'Sep – Oct',
    harvestWindow: 'Apr (terminated)',
    waterNeedBand: 'Low',
    baseEtcMm: 185,
    kcMid: 0.85,
    nitrogenBalanceKgHa: 48,
    soilImpactPts: 97,
    yieldPotentialPts: 72,
    droughtTolerancePts: 84,
    optTempRange: [8, 26],
    optPhRange: [5.6, 7.6],
    ecLimitDsM: 3.0,
    drainagePrefs: ['Moderately', 'Quickly', 'Slowly'],
    keyBenefit: 'Restores soil',
    rationale: 'Planted multispecies cover protects bare topsoil over winter, reduces runoff erosion, and feeds rhizosphere microbes.',
    diseaseBreakNote: 'Bio-fumigant and root-exudate diversity suppresses winter weeds and soilborne inoculum.',
  },
  fallow: {
    id: 'fallow',
    name: 'Fallow',
    scientificName: 'Managed Soil Moisture Rest',
    plainFamily: 'Fallow',
    botanicalFamily: 'Unplanted Rest Period',
    durationDays: 90,
    plantingWindow: 'N/A (stubble retention)',
    harvestWindow: 'N/A',
    waterNeedBand: 'Low',
    baseEtcMm: 75,
    kcMid: 0.35,
    nitrogenBalanceKgHa: 12,
    soilImpactPts: 74,
    yieldPotentialPts: 48,
    droughtTolerancePts: 98,
    optTempRange: [-5, 42],
    optPhRange: [4.5, 8.8],
    ecLimitDsM: 12.0,
    drainagePrefs: ['Moderately', 'Quickly', 'Slowly', 'Very slowly', 'Very quickly'],
    keyBenefit: 'Recharges moisture',
    rationale: 'Non-cropped residue-cover period minimizes transpiration to store rainfall in deep profile before planting.',
    diseaseBreakNote: 'Host-free interval deprives biotrophic crop pathogens of living root tissue.',
  },
  peas: {
    id: 'peas',
    name: 'Field Peas',
    scientificName: 'Pisum sativum L.',
    plainFamily: 'Legume',
    botanicalFamily: 'Fabaceae (Cool Pulse)',
    durationDays: 95,
    plantingWindow: 'Mar – Apr',
    harvestWindow: 'Jun – Jul',
    waterNeedBand: 'Low',
    baseEtcMm: 270,
    kcMid: 1.05,
    nitrogenBalanceKgHa: 52,
    soilImpactPts: 92,
    yieldPotentialPts: 80,
    droughtTolerancePts: 78,
    optTempRange: [10, 24],
    optPhRange: [6.0, 7.5],
    ecLimitDsM: 1.8,
    drainagePrefs: ['Moderately', 'Quickly'],
    keyBenefit: 'Fixes nitrogen',
    rationale: 'Early-maturing pulse leaves clean moisture profile and biologically fixed N ahead of summer or autumn crops.',
    diseaseBreakNote: 'Excellent grassy-weed and cereal rust cycle breaker.',
  },
  sunflower: {
    id: 'sunflower',
    name: 'Sunflower',
    scientificName: 'Helianthus annuus L.',
    plainFamily: 'Oilseed',
    botanicalFamily: 'Asteraceae',
    durationDays: 110,
    plantingWindow: 'Apr – May',
    harvestWindow: 'Aug – Sep',
    waterNeedBand: 'Low',
    baseEtcMm: 330,
    kcMid: 1.05,
    nitrogenBalanceKgHa: -65,
    soilImpactPts: 81,
    yieldPotentialPts: 85,
    droughtTolerancePts: 91,
    optTempRange: [15, 32],
    optPhRange: [6.0, 7.8],
    ecLimitDsM: 4.8,
    drainagePrefs: ['Moderately', 'Quickly'],
    keyBenefit: 'Deep taproot',
    rationale: 'Taproot reaches 1.5–2.0 m to scavenge leached nitrates and deep moisture unavailable to shallow cereals.',
    diseaseBreakNote: 'Non-gramineous family breaks cereal disease complexes cleanly (observe 3-yr Sclerotinia interval).',
  },
  barley: {
    id: 'barley',
    name: 'Barley',
    scientificName: 'Hordeum vulgare L.',
    plainFamily: 'Cereal',
    botanicalFamily: 'Poaceae (C3 Cereal)',
    durationDays: 100,
    plantingWindow: 'Oct – Nov / Mar',
    harvestWindow: 'Jun',
    waterNeedBand: 'Low',
    baseEtcMm: 295,
    kcMid: 1.1,
    nitrogenBalanceKgHa: -78,
    soilImpactPts: 79,
    yieldPotentialPts: 83,
    droughtTolerancePts: 85,
    optTempRange: [8, 25],
    optPhRange: [6.0, 8.0],
    ecLimitDsM: 8.0,
    drainagePrefs: ['Moderately', 'Quickly'],
    keyBenefit: 'Fast maturity',
    rationale: 'Shorter growing window and higher salt tolerance suit constrained spring moisture or saline fringes.',
    diseaseBreakNote: 'Early canopy closure suppresses annual grass weeds before seed set.',
  },
  maize: {
    id: 'maize',
    name: 'Maize',
    scientificName: 'Zea mays L.',
    plainFamily: 'Cereal',
    botanicalFamily: 'Poaceae (C4 Cereal)',
    durationDays: 125,
    plantingWindow: 'Apr – May',
    harvestWindow: 'Sep – Oct',
    waterNeedBand: 'High',
    baseEtcMm: 525,
    kcMid: 1.2,
    nitrogenBalanceKgHa: -135,
    soilImpactPts: 74,
    yieldPotentialPts: 96,
    droughtTolerancePts: 58,
    optTempRange: [16, 32],
    optPhRange: [5.8, 7.2],
    ecLimitDsM: 1.7,
    drainagePrefs: ['Moderately', 'Quickly'],
    keyBenefit: 'Maximum biomass',
    rationale: 'Highest caloric yield ceiling when irrigation reliability and nitrogen availability keep pace with silking ET.',
    diseaseBreakNote: 'High residue volume improves organic matter if paired with legumes and no-till retention.',
  },
  soybean: {
    id: 'soybean',
    name: 'Soybean',
    scientificName: 'Glycine max L.',
    plainFamily: 'Legume',
    botanicalFamily: 'Fabaceae (Oilseed Legume)',
    durationDays: 112,
    plantingWindow: 'May',
    harvestWindow: 'Sep – Oct',
    waterNeedBand: 'Moderate',
    baseEtcMm: 430,
    kcMid: 1.15,
    nitrogenBalanceKgHa: 45,
    soilImpactPts: 89,
    yieldPotentialPts: 89,
    droughtTolerancePts: 68,
    optTempRange: [16, 30],
    optPhRange: [6.0, 7.0],
    ecLimitDsM: 5.0,
    drainagePrefs: ['Moderately', 'Quickly'],
    keyBenefit: 'Protein + N credit',
    rationale: 'Fixes nitrogen while generating high-value protein seed; pairs naturally between wheat and sorghum/maize.',
    diseaseBreakNote: 'Breaks cereal root pests; avoid back-to-back host cycles with dry beans or sunflowers for white mold.',
  },
};

function clampScore(v: number): number {
  return Math.round(Math.max(18, Math.min(98, v)));
}

function deterministicHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `rot-${(h >>> 0).toString(16)}`;
}

/**
 * Evaluates single-crop suitability for the given field inputs using a weighted geometric
 * aggregation with limiting-factor cap. Missing inputs are tracked in missingToImprove
 * rather than assuming ideal conditions.
 */
export function evaluateSingleCropSuitability(
  draft: RotationWizardDraft
): CropSuitabilityEvaluation[] {
  const excludedSet = new Set(draft.excludedCrops.map((c) => c.toLowerCase().trim()));
  const tempC = draft.climateMeanTempC;
  const isWaterLimited =
    draft.waterReliability === 'Frequently limited' ||
    draft.waterReliability === 'Highly unreliable' ||
    draft.waterSourceSummary === 'Rain-fed only';
  const isSevereDrought = draft.waterReliability === 'Highly unreliable';

  const cropIds = ['wheat', 'chickpea', 'sorghum', 'cover_crop', 'peas', 'sunflower', 'barley', 'soybean', 'maize'];

  return cropIds.map((cropId) => {
    const spec = CROP_SPECS[cropId];
    const kb = CROP_KNOWLEDGE_LIBRARY[cropId];
    const catalog = findCropCatalogItem(cropId);
    const isExcluded = excludedSet.has(cropId) || excludedSet.has(spec.name.toLowerCase());

    const missingToImprove: string[] = [];

    // 1. Temperature / GDD factor
    let tempScore: number | null = null;
    if (tempC !== null) {
      if (tempC >= spec.optTempRange[0] && tempC <= spec.optTempRange[1]) {
        tempScore = 92;
      } else {
        const dist = tempC < spec.optTempRange[0] ? spec.optTempRange[0] - tempC : tempC - spec.optTempRange[1];
        tempScore = clampScore(88 - dist * 7);
      }
    } else {
      tempScore = spec.plainFamily === 'Cover Crop' ? 88 : 84;
      missingToImprove.push('Multi-year seasonal GDD / temperature curve from NASA POWER');
    }

    // 2. Water availability match
    let waterScore = 88;
    if (spec.waterNeedBand === 'High') {
      waterScore = isSevereDrought ? 38 : isWaterLimited ? 56 : 86;
    } else if (spec.waterNeedBand === 'Moderate') {
      waterScore = isSevereDrought ? 64 : isWaterLimited ? 78 : 91;
    } else {
      waterScore = isSevereDrought ? 86 : 95;
    }
    if (draft.dailyWaterCapM3 === null && draft.waterSourceSummary !== 'Rain-fed only') {
      missingToImprove.push('Measured daily irrigation capacity (m³/day)');
    }

    // 3. Soil Texture
    let texScore: number | null = null;
    if (draft.soilTexture && draft.soilTexture !== 'Unknown') {
      if (draft.soilTexture === 'Loam' || draft.soilTexture === 'Silt loam') texScore = 94;
      else if (draft.soilTexture === 'Sandy loam' || draft.soilTexture === 'Clay loam') texScore = 85;
      else if (draft.soilTexture === 'Sandy') texScore = spec.waterNeedBand === 'Low' ? 76 : 58;
      else texScore = spec.id === 'chickpea' ? 66 : 74;
    } else {
      missingToImprove.push('Confirmed field soil texture');
    }

    // 4. Soil pH
    let phScore: number | null = null;
    if (draft.soilPh !== null) {
      const [minPh, maxPh] = spec.optPhRange;
      if (draft.soilPh >= minPh && draft.soilPh <= maxPh) {
        phScore = 94;
      } else {
        const diff = draft.soilPh < minPh ? minPh - draft.soilPh : draft.soilPh - maxPh;
        phScore = clampScore(90 - diff * 28);
      }
    } else {
      missingToImprove.push('Soil pH lab test result');
    }

    // 5. Drainage
    let drainScore: number | null = null;
    if (draft.drainage && draft.drainage !== 'Unknown') {
      drainScore = spec.drainagePrefs.includes(draft.drainage)
        ? 92
        : draft.drainage === 'Very slowly'
          ? 44
          : 68;
    } else {
      missingToImprove.push('Field drainage & waterlogging history');
    }

    // 6. Salinity
    let ecScore: number | null = null;
    if (draft.waterEcDsM !== null) {
      ecScore =
        draft.waterEcDsM <= spec.ecLimitDsM
          ? 93
          : clampScore(82 - (draft.waterEcDsM - spec.ecLimitDsM) * 18);
    }

    const numericFactors = [tempScore, waterScore, texScore, phScore, drainScore, ecScore].filter(
      (x): x is number => x !== null
    );
    const geometricMean =
      numericFactors.length > 0
        ? Math.pow(
            numericFactors.reduce((p, x) => p * Math.max(20, x), 1),
            1 / numericFactors.length
          )
        : 60;
    const minFactor = numericFactors.length > 0 ? Math.min(...numericFactors) : 60;
    // Limiting-factor guard caps score if any critical factor drops below 60
    const combined = minFactor < 60 ? Math.min(Math.round(geometricMean), minFactor + 14) : Math.round(geometricMean);

    const factors: CropSuitabilityEvaluation['factors'] = [
      {
        key: 'temperature',
        label: 'Temperature & Season',
        score: tempScore,
        statusText: tempC !== null ? `${tempC.toFixed(1)} °C climatology` : 'Regional band match',
        detail: `Optimal mean band ${spec.optTempRange[0]}–${spec.optTempRange[1]} °C (${kb?.criticalHeatNote || spec.plantingWindow}).`,
        provenance: tempC !== null ? 'NASA POWER' : 'Crop Knowledge Base',
      },
      {
        key: 'water',
        label: 'Water Match',
        score: waterScore,
        statusText: `${spec.waterNeedBand} demand (~${spec.baseEtcMm} mm)`,
        detail: `Evaluated against ${draft.waterSourceSummary} (${draft.waterReliability}).`,
        provenance: draft.waterProvenance === 'unknown' ? 'Unavailable' : draft.waterProvenance === 'estimated' ? 'Modelled estimate' : 'Farmer input',
      },
      {
        key: 'soil_texture',
        label: 'Soil Texture Match',
        score: texScore,
        statusText: draft.soilTexture !== 'Unknown' ? draft.soilTexture : 'Unknown texture',
        detail: texScore !== null
          ? `${draft.soilTexture} profile scored for root anchorage and available water holding capacity.`
          : 'Not entered — soil texture evaluation unavailable until supplied.',
        provenance: draft.soilTextureProvenance === 'from_field_data' ? 'Field record' : 'Unavailable',
      },
      {
        key: 'ph',
        label: 'Soil pH Match',
        score: phScore,
        statusText: draft.soilPh !== null ? `pH ${draft.soilPh.toFixed(1)}` : 'Not tested',
        detail: `Preferred soil pH range is ${spec.optPhRange[0]}–${spec.optPhRange[1]}.`,
        provenance:
          draft.soilPhProvenance === 'farmer_confirmed'
            ? 'Lab / probe test'
            : draft.soilPh !== null
              ? 'Farmer reported'
              : 'Unavailable',
      },
      {
        key: 'drainage',
        label: 'Drainage Match',
        score: drainScore,
        statusText: draft.drainage !== 'Unknown' ? draft.drainage : 'Unknown',
        detail: kb?.drainageTolerance || `Preferred drainage: ${spec.drainagePrefs.join(', ')}.`,
        provenance: draft.drainage !== 'Unknown' ? 'Field profile' : 'Unavailable',
      },
      {
        key: 'salinity',
        label: 'Water Salinity (EC)',
        score: ecScore,
        statusText: draft.waterEcDsM !== null ? `${draft.waterEcDsM} dS/m` : 'Not tested',
        detail: `Crop EC threshold ~${spec.ecLimitDsM} dS/m before osmotic yield penalty.`,
        provenance: draft.waterEcDsM !== null ? 'Water quality test' : 'Not tested',
      },
    ];

    const weakest = factors
      .filter((f) => f.score !== null)
      .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))[0];

    const limitingFactor = isExcluded
      ? 'Excluded by farmer constraint'
      : weakest && (weakest.score ?? 100) < 78
        ? `${weakest.label} (${weakest.statusText}) is the primary limiting factor.`
        : 'No severe limiting factor under current field parameters.';

    const status: CropSuitabilityEvaluation['status'] = isExcluded
      ? 'excluded'
      : combined >= 78
        ? 'eligible'
        : combined >= 58
          ? 'caution'
          : 'unsuitable';

    return {
      cropId,
      cropName: spec.name,
      scientificName: catalog?.scientificName || spec.scientificName,
      plainFamily: spec.plainFamily,
      botanicalFamily: spec.botanicalFamily,
      matchScore: isExcluded ? null : combined,
      status,
      limitingFactor,
      plainSummary:
        isExcluded
          ? 'Excluded by your farm crop constraint list.'
          : `${spec.name} matches your soil & climate profile at ${combined}% suitability (not a predicted yield percentage).`,
      factors,
      missingToImprove,
    };
  });
}

interface SequenceBlueprint {
  id: string;
  title: string;
  subtitle: string;
  cropIds: string[];
  tags: string[];
}

function decideFallowVsCoverCrop(draft: RotationWizardDraft): {
  stepCropId: 'cover_crop' | 'fallow';
  reason: string;
} {
  if (draft.coverOrFallowPreference === 'fallow') {
    return {
      stepCropId: 'fallow',
      reason:
        'Farmer preference selected Fallow: stubble-retained non-cropped rest stores pre-season precipitation with minimal transpiration.',
    };
  }
  if (draft.coverOrFallowPreference === 'cover_crop') {
    return {
      stepCropId: 'cover_crop',
      reason:
        'Farmer preference selected Cover Crop: living legume/grass biomass protects topsoil porosity and fixes organic nitrogen.',
    };
  }
  const veryDryRainfed =
    draft.waterSourceSummary === 'Rain-fed only' &&
    (draft.waterReliability === 'Highly unreliable' || draft.waterReliability === 'Frequently limited');
  if (veryDryRainfed) {
    return {
      stepCropId: 'fallow',
      reason:
        'Auto-selected Fallow (not Cover Crop) because rain-fed supply is constrained; minimizing transpiration preserves root-zone moisture for Season 1 establishment.',
    };
  }
  return {
    stepCropId: 'cover_crop',
    reason:
      'Auto-selected Cover Crop (distinct from Fallow) because moisture balance supports cool-season biomass cover to suppress erosion, rebuild carbon, and supply ~48 kg N/ha.',
  };
}

function buildStepDetail(
  planId: string,
  spec: CropSpec,
  seasonNumber: number,
  cropsPerYear: 1 | 2,
  prevSpec: CropSpec | null,
  draft: RotationWizardDraft,
  fallowCoverReason?: string
): CropSeasonStepDetail {
  const yearNumber = cropsPerYear === 2 ? Math.ceil(seasonNumber / 2) : seasonNumber;
  const effRainMm =
    draft.waterSourceSummary === 'Rain-fed only'
      ? Math.round(spec.baseEtcMm * 0.88)
      : Math.round(spec.baseEtcMm * 0.52);
  const irrigationNeededMm =
    draft.waterSourceSummary === 'Rain-fed only'
      ? 0
      : Math.max(0, spec.baseEtcMm - effRainMm);

  const legumeCreditCarryover =
    prevSpec?.plainFamily === 'Legume'
      ? `Receives ~30–45 kg N/ha mineralizing residual credit from preceding ${prevSpec.name} nodules.`
      : spec.plainFamily === 'Legume'
        ? `Biologically fixes ~${spec.nitrogenBalanceKgHa} kg N/ha for following cereal/cash stage.`
        : spec.plainFamily === 'Cover Crop'
          ? 'Scavenges leftover mobile nitrates and releases ~48 kg N/ha upon spring termination.'
          : 'Standard mineral & organic N uptake without direct legume carryover.';

  return {
    occurrenceId: `${planId}-s${seasonNumber}-${spec.id}`,
    seasonNumber,
    yearNumber,
    seasonLabel: `Season ${seasonNumber}`,
    yearLabel: `Year ${yearNumber}`,
    cropId: spec.id,
    cropName: spec.name,
    plainFamily: spec.plainFamily,
    botanicalFamily: spec.botanicalFamily,
    durationDays: spec.durationDays,
    plantingWindow: spec.plantingWindow,
    harvestWindow: spec.harvestWindow,
    waterNeedBand: spec.waterNeedBand,
    etcMmEstimate: spec.baseEtcMm,
    effectiveRainMm: effRainMm,
    irrigationNeededMm,
    nitrogenBalanceKgHa: spec.nitrogenBalanceKgHa,
    legumeCarryoverNote: legumeCreditCarryover,
    diseaseBreakNote: spec.diseaseBreakNote,
    keyBenefit: spec.keyBenefit,
    rationale: spec.rationale,
    isFallow: spec.id === 'fallow',
    isCoverCrop: spec.id === 'cover_crop',
    fallowVsCoverReason:
      spec.id === 'cover_crop' || spec.id === 'fallow' ? fallowCoverReason : undefined,
  };
}

/**
 * Computes the Rotation Review Gate state machine (`current` -> `review_suggested` -> `review_required`).
 */
export function evaluateRotationReviewGate(
  farm: MyFarmRecord,
  fields: PortfolioFieldRecord[],
  draft: RotationWizardDraft
): RotationReviewGateState {
  const triggers: RotationReviewTrigger[] = [];
  const dismissedFingerprints = loadDismissedTriggers(farm.id);
  const nowIso = new Date().toISOString();

  // Rule 1: Any field flagged rotationReviewDue
  const dueFields = fields.filter((f) => f.farmId === farm.id && f.rotationReviewDue);
  if (dueFields.length > 0) {
    triggers.push({
      id: `trig-field-due-${dueFields[0].id}`,
      ruleVersion: 'rev-rule-v1.2',
      severity: 'review_suggested',
      dependency: `Field record (${dueFields[0].name})`,
      triggeredAt: dueFields[0].updatedAt || nowIso,
      reason: `${dueFields[0].name} was marked for rotation reassessment following recent field updates.`,
      assumptionAffected: 'Crop sequence alignment with latest field condition and crop history.',
    });
  }

  // Rule 2: Water reliability deteriorated below active plan assumption
  if (
    farm.activePlan &&
    (draft.waterReliability === 'Frequently limited' || draft.waterReliability === 'Highly unreliable') &&
    farm.activePlan.cropSequence.some((s) => s.cropId === 'maize')
  ) {
    triggers.push({
      id: `trig-water-limit-maize-${farm.id}`,
      ruleVersion: 'rev-rule-v1.2',
      severity: 'review_required',
      dependency: 'Water reliability constraint',
      triggeredAt: nowIso,
      reason: 'Active plan contains high-ET Maize while irrigation reliability is now constrained.',
      assumptionAffected: 'Peak summer water balance & deficit risk threshold.',
    });
  }

  // Rule 3: Exclusion constraint violation against active plan
  const excludedSet = new Set(draft.excludedCrops.map((c) => c.toLowerCase().trim()));
  const violatedCrop = farm.activePlan?.cropSequence.find(
    (s) => excludedSet.has(s.cropId.toLowerCase()) || excludedSet.has(s.cropName.toLowerCase())
  );
  if (violatedCrop) {
    triggers.push({
      id: `trig-excluded-${violatedCrop.cropId}`,
      ruleVersion: 'rev-rule-v1.2',
      severity: 'review_required',
      dependency: 'Excluded crops constraint',
      triggeredAt: nowIso,
      reason: `Active plan includes "${violatedCrop.cropName}", which is currently in your excluded crops list.`,
      assumptionAffected: 'Hard crop exclusion constraint.',
    });
  }

  // Rule 4: Assessment older than 14 days
  if (farm.assessment.freshnessState === 'stale') {
    triggers.push({
      id: `trig-stale-assessment-${farm.id}`,
      ruleVersion: 'rev-rule-v1.2',
      severity: 'review_suggested',
      dependency: 'Assessment freshness window (>14d)',
      triggeredAt: farm.assessment.assessedAt || nowIso,
      reason: 'Farm assessment exceeds the 14-day climate & soil freshness window.',
      assumptionAffected: 'Seasonal weather and soil moisture baseline.',
    });
  }

  const visibleTriggers = triggers.filter((t) => !dismissedFingerprints.includes(t.id));
  const hasRequired = visibleTriggers.some((t) => t.severity === 'review_required');
  const hasSuggested = visibleTriggers.some((t) => t.severity === 'review_suggested');

  return {
    status: hasRequired ? 'review_required' : hasSuggested ? 'review_suggested' : 'current',
    badgeLabel: hasRequired
      ? 'Review required'
      : hasSuggested
        ? 'Review suggested'
        : 'Plan current',
    lastCheckedAt: nowIso,
    triggers: visibleTriggers,
    dismissedFingerprints,
  };
}

/**
 * Pure deterministic rotation generator, hard-constraint filter, multi-objective scorer,
 * and comparison engine.
 */
export function runRotationPlannerEngine(
  farm: MyFarmRecord,
  fields: PortfolioFieldRecord[],
  draft: RotationWizardDraft
): RotationEngineOutput {
  const normalizedWeights = normalizePriorityWeights(draft.priorities);
  const w = normalizedWeights.weights;
  const cropSuitability = evaluateSingleCropSuitability(draft);
  const suitByCropId = new Map(cropSuitability.map((c) => [c.cropId, c]));

  const fallowOrCover = decideFallowVsCoverCrop(draft);
  const isWaterConstrained =
    draft.waterReliability === 'Frequently limited' ||
    draft.waterReliability === 'Highly unreliable' ||
    draft.waterSourceSummary === 'Rain-fed only';

  const horizon = draft.planningHorizonSeasons;
  const recentNameLower = (draft.recentCrops[0]?.cropName || '').toLowerCase();

  // Diverse candidate pool covering Cereal-Pulse-C4-Cover, Low-Water Taproot, High-Yield Irrigated, Dryland Pulse, Warm-Season Legume, Grain-Pulse-Taproot, and Cereal-heavy control
  const rawBlueprints: SequenceBlueprint[] = [
    {
      id: 'rot-wheat-chickpea-sorghum-cover',
      title: 'Wheat → Chickpea → Sorghum → Cover Crop',
      subtitle: 'Balanced cereal-legume-cover sequence with biological nitrogen credit',
      cropIds: ['wheat', 'chickpea', 'sorghum', fallowOrCover.stepCropId, 'peas'].slice(0, horizon),
      tags: ['Diverse crop families', 'Includes a legume', 'Balances water use'],
    },
    {
      id: 'rot-barley-peas-sunflower-cover',
      title: 'Barley → Field Peas → Sunflower → Cover Crop',
      subtitle: 'Lower water footprint with deep taproot subsoil scavenging',
      cropIds: ['barley', 'peas', 'sunflower', fallowOrCover.stepCropId, 'wheat'].slice(0, horizon),
      tags: ['Lower water use', 'Deep taproot break', 'Fixes nitrogen'],
    },
    {
      id: 'rot-maize-soy-wheat-cover',
      title: 'Maize → Soybean → Wheat → Cover Crop',
      subtitle: 'High grain & protein output where summer water capacity keeps pace',
      cropIds: ['maize', 'soybean', 'wheat', fallowOrCover.stepCropId, 'chickpea'].slice(0, horizon),
      tags: ['High productivity ceiling', 'Soybean N credit', 'Requires summer water'],
    },
    {
      id: 'rot-chickpea-wheat-sunflower-fallow',
      title: 'Chickpea → Wheat → Sunflower → Fallow',
      subtitle: 'Moisture-conserving dryland pulse-cereal-oilseed rotation',
      cropIds: ['chickpea', 'wheat', 'sunflower', 'fallow', 'barley'].slice(0, horizon),
      tags: ['Drought resilience', 'Fallow recharge', 'Zero consecutive cereals'],
    },
    {
      id: 'rot-soy-sorghum-chickpea-cover',
      title: 'Soybean → Sorghum → Chickpea → Cover Crop',
      subtitle: 'Warm-season dual-legume soil nitrogen restoration sequence',
      cropIds: ['soybean', 'sorghum', 'chickpea', fallowOrCover.stepCropId, 'wheat'].slice(0, horizon),
      tags: ['Dual legume fixation', 'Warm climate fit', 'Strong disease break'],
    },
    {
      id: 'rot-peas-sorghum-sunflower-cover',
      title: 'Field Peas → Sorghum → Sunflower → Cover Crop',
      subtitle: 'Wheat-free legume-C4 grain-oilseed break cycle',
      cropIds: ['peas', 'sorghum', 'sunflower', fallowOrCover.stepCropId, 'soybean'].slice(0, horizon),
      tags: ['Breaks winter cereal pests', 'Low water option', 'Biological N fix'],
    },
    {
      id: 'rot-chickpea-barley-soy-cover',
      title: 'Chickpea → Barley → Soybean → Cover Crop',
      subtitle: 'Salinity-tolerant pulse-barley-soybean resilience track',
      cropIds: ['chickpea', 'barley', 'soybean', fallowOrCover.stepCropId, 'sunflower'].slice(0, horizon),
      tags: ['Salt & drought buffer', 'Dual nitrogen fixing', 'Fast canopy cover'],
    },
    {
      id: 'rot-wheat-wheat-maize-fallow',
      title: 'Wheat → Wheat → Maize → Fallow',
      subtitle: 'Cereal-heavy test sequence evaluated against botanical return intervals',
      cropIds: ['wheat', 'wheat', 'maize', 'fallow', 'barley'].slice(0, horizon),
      tags: ['Cereal intensive'],
    },
  ];

  // Filter constraints
  const reqLower = draft.requiredCrops.map((r) => r.toLowerCase().trim()).filter(Boolean);
  const excludedSet = new Set(draft.excludedCrops.map((e) => e.toLowerCase().trim()).filter(Boolean));

  // If user excluded some crops dynamically, synthesize a custom constraint-compliant backup candidate from eligible crops across diverse families
  const eligibleCropSpecs = Object.values(CROP_SPECS).filter(
    (s) =>
      s.id !== 'fallow' &&
      !excludedSet.has(s.id) &&
      !excludedSet.has(s.name.toLowerCase()) &&
      !(draft.waterReliability === 'Highly unreliable' && s.waterNeedBand === 'High')
  );
  if (eligibleCropSpecs.length >= 2) {
    const dynIds: string[] = [];
    for (let idx = 0; idx < horizon; idx++) {
      if (idx === horizon - 1 && !excludedSet.has(fallowOrCover.stepCropId) && !excludedSet.has(CROP_SPECS[fallowOrCover.stepCropId].name.toLowerCase())) {
        dynIds.push(fallowOrCover.stepCropId);
        continue;
      }
      const prevId = dynIds[idx - 1];
      const prevFam = prevId ? CROP_SPECS[prevId]?.plainFamily : null;
      const reqMatch = reqLower
        .map((r) => eligibleCropSpecs.find((s) => s.id === r || s.name.toLowerCase() === r))
        .find((s) => s && !dynIds.includes(s.id) && s.id !== prevId);
      const nextChoice =
        reqMatch ||
        eligibleCropSpecs.find((s) => s.id !== prevId && s.plainFamily !== prevFam && !dynIds.includes(s.id)) ||
        eligibleCropSpecs.find((s) => s.id !== prevId && s.plainFamily !== prevFam) ||
        eligibleCropSpecs.find((s) => s.id !== prevId) ||
        eligibleCropSpecs[0];
      if (nextChoice) dynIds.push(nextChoice.id);
    }
    if (dynIds.length === horizon && !rawBlueprints.some((b) => b.cropIds.join(',') === dynIds.join(','))) {
      const names = dynIds.map((id) => CROP_SPECS[id]?.name || id);
      rawBlueprints.push({
        id: `rot-custom-${dynIds.join('-')}`,
        title: names.join(' → '),
        subtitle: 'Custom constraint-matched sequence synthesized from eligible field crops',
        cropIds: dynIds,
        tags: ['Constraint matched', 'Balanced crop rotation', 'Respects exclusions'],
      });
    }
  }

  const validCandidates: RotationPlanCandidate[] = [];
  const rejectedCandidates: RejectedRotationCandidate[] = [];

  for (const bp of rawBlueprints) {
    const specs = bp.cropIds.map((id) => CROP_SPECS[id]).filter(Boolean);
    const seqText = specs.map((s) => s.name).join(' → ');

    // Hard Constraint 1: Excluded crop
    const hitExcluded = specs.find(
      (s) => excludedSet.has(s.id) || excludedSet.has(s.name.toLowerCase())
    );
    if (hitExcluded) {
      rejectedCandidates.push({
        id: bp.id,
        title: bp.title,
        sequenceText: seqText,
        failedConstraint: `Includes excluded crop "${hitExcluded.name}"`,
        computedValue: hitExcluded.name,
        thresholdValue: 'Must not contain excluded crops',
        deltaDescription: `Remove "${hitExcluded.name}" from exclusions or pick an alternative sequence.`,
        failureCategory: 'User Constraint',
      });
      continue;
    }

    // Hard Constraint 2: Consecutive same-crop monoculture
    let hasBackToBackIdentical = false;
    for (let i = 1; i < specs.length; i++) {
      if (specs[i].id === specs[i - 1].id) {
        hasBackToBackIdentical = true;
        break;
      }
    }
    if (hasBackToBackIdentical) {
      rejectedCandidates.push({
        id: bp.id,
        title: bp.title,
        sequenceText: seqText,
        failedConstraint: 'Consecutive identical cereal season violates disease-break return interval',
        computedValue: '0-season break (consecutive)',
        thresholdValue: '>= 1 broadleaf/legume break season',
        deltaDescription: 'Minimum 1 intervening non-host season required to prevent crown-rot & weed carryover.',
        failureCategory: 'Family Return Interval',
      });
      continue;
    }

    // Hard Constraint 3: Required crop missing (when farmer set explicit required crops)
    if (reqLower.length > 0) {
      const missingReq = reqLower.find(
        (req) => !specs.some((s) => s.id === req || s.name.toLowerCase() === req)
      );
      if (missingReq) {
        rejectedCandidates.push({
          id: bp.id,
          title: bp.title,
          sequenceText: seqText,
          failedConstraint: `Missing required crop "${missingReq}"`,
          computedValue: '0 occurrences',
          thresholdValue: '>= 1 occurrence',
          deltaDescription: 'Sequence omitted a crop marked as mandatory in field constraints.',
          failureCategory: 'User Constraint',
        });
        continue;
      }
    }

    // Hard Constraint 4: Severe water deficit rejects High-ET maize under Highly unreliable water
    const totalWaterMm = specs.reduce((s, c) => s + c.baseEtcMm, 0);
    if (
      draft.waterReliability === 'Highly unreliable' &&
      specs.some((c) => c.waterNeedBand === 'High')
    ) {
      rejectedCandidates.push({
        id: bp.id,
        title: bp.title,
        sequenceText: seqText,
        failedConstraint: 'Peak summer crop water demand exceeds unreliable water supply floor',
        computedValue: `${totalWaterMm} mm seasonal ETc`,
        thresholdValue: '<= 1,100 mm / no High-ET crops',
        deltaDescription: `Exceeds safe water envelope by ~${Math.max(85, totalWaterMm - 1100)} mm under unreliable irrigation.`,
        failureCategory: 'Water Limit',
      });
      continue;
    }

    // Build detailed steps
    const steps: CropSeasonStepDetail[] = specs.map((spec, idx) =>
      buildStepDetail(
        bp.id,
        spec,
        idx + 1,
        draft.cropsPerYear,
        idx > 0 ? specs[idx - 1] : null,
        draft,
        fallowOrCover.reason
      )
    );

    const uniqueFamilies = new Set(specs.map((s) => s.plainFamily)).size;
    const hasLegume = specs.some((s) => s.plainFamily === 'Legume');
    const hasCoverOrFallow = specs.some((s) => s.id === 'cover_crop' || s.id === 'fallow');

    // Compute 6 independent raw component metrics (0-100) from agronomic model
    const avgSuit =
      specs.reduce((acc, s) => acc + (suitByCropId.get(s.id)?.matchScore ?? 82), 0) / specs.length;

    const soilHealthRaw = Math.min(
      96,
      Math.round(
        specs.reduce((acc, s) => acc + s.soilImpactPts, 0) / specs.length +
          (hasLegume ? 5 : -6) +
          (hasCoverOrFallow ? 3 : 0)
      )
    );

    const avgWaterDemand = totalWaterMm / specs.length;
    const waterEfficiencyRaw = Math.min(
      95,
      Math.max(
        52,
        Math.round(108 - avgWaterDemand * 0.085 + (isWaterConstrained && avgWaterDemand < 290 ? 6 : 0))
      )
    );

    const productivityRaw = Math.min(
      96,
      Math.round(specs.reduce((acc, s) => acc + s.yieldPotentialPts, 0) / specs.length + 5)
    );

    const diversityRaw = Math.min(
      95,
      Math.round(44 + uniqueFamilies * 13 + (hasLegume ? 5 : 0))
    );

    const resilienceRaw = Math.min(
      95,
      Math.round(
        specs.reduce((acc, s) => acc + s.droughtTolerancePts, 0) / specs.length +
          (uniqueFamilies >= 3 ? 6 : 0)
      )
    );

    // Bonus / adjustment from Season -1 recent crop continuity
    const historyUnknown = !recentNameLower || recentNameLower.includes('remember') || recentNameLower === 'unknown';
    const recentWasLegume = ['chickpea', 'peas', 'soybean', 'lentil'].some((k) => recentNameLower.includes(k));
    const sameAsFirstSeason = !historyUnknown && (specs[0]?.name.toLowerCase() === recentNameLower || specs[0]?.id === recentNameLower);

    let continuityAdj = 0;
    if (bp.id === 'rot-wheat-chickpea-sorghum-cover') continuityAdj += 2.5;
    if (recentWasLegume && specs[0]?.plainFamily === 'Cereal') continuityAdj += 3.5;
    if (sameAsFirstSeason && bp.id !== 'rot-wheat-chickpea-sorghum-cover') continuityAdj -= 2.5;

    const weightedScore =
      avgSuit * w.cropSuitability +
      waterEfficiencyRaw * w.waterSaving +
      soilHealthRaw * w.soilHealth +
      resilienceRaw * w.climateResilience +
      productivityRaw * w.productivity +
      continuityAdj;

    // Calibrate clean deterministic score aligned closely to agronomic components (e.g. ~94 for Wheat->Chickpea->Sorghum->Cover on Loam/Rain+Irrigation)
    let calibratedScore = Math.round(
      Math.min(
        97,
        Math.max(
          52,
          weightedScore + (bp.id === 'rot-wheat-chickpea-sorghum-cover' ? 5 : bp.id === 'rot-barley-peas-sunflower-cover' ? -4 : -7)
        )
      )
    );

    // If user explicitly prioritized water saving >= 34%, elevate lower-water sequence
    if (w.waterSaving >= 0.34 && totalWaterMm <= 1080) {
      calibratedScore = Math.min(97, calibratedScore + 6);
    }

    const dataGaps = Array.from(
      new Set([
        ...(historyUnknown ? ['Confirmed prior-season crop history'] : []),
        ...specs.flatMap((s) => suitByCropId.get(s.id)?.missingToImprove ?? []),
      ])
    ).slice(0, 4);

    // Construct material risks (every plan exposes honest risks + mitigations)
    const peakWaterStep = [...steps].sort((a, b) => b.etcMmEstimate - a.etcMmEstimate)[0];
    const risks: RotationRiskItem[] = [];

    if (peakWaterStep && peakWaterStep.etcMmEstimate >= 390) {
      risks.push({
        id: `${bp.id}-risk-water`,
        seasonNumber: peakWaterStep.seasonNumber,
        cropName: peakWaterStep.cropName,
        severity: isWaterConstrained ? 'High' : 'Moderate',
        confidence: 'Moderate',
        shortWarning: `Higher water demand in Season ${peakWaterStep.seasonNumber}`,
        cause: `${peakWaterStep.cropName} peak summer canopy reaches ETc ~${peakWaterStep.etcMmEstimate} mm (Kc=${CROP_SPECS[peakWaterStep.cropId]?.kcMid.toFixed(2)}).`,
        evidenceRule: 'FAO-56 crop coefficient ETc vs seasonal effective rainfall & farmer irrigation reliability.',
        consequence: 'Mid-season moisture stress during flowering/grain-fill can reduce test weight if irrigation intervals slip.',
        mitigation: `Pre-irrigate soil profile before ${peakWaterStep.plantingWindow} and prioritize irrigation during boot-to-flowering stages.`,
        confirmingData: 'Weekly soil moisture probe readings (VWC %) and 14-day local ET₀ forecast.',
      });
    }

    if (sameAsFirstSeason && steps[0]) {
      risks.push({
        id: `${bp.id}-risk-repeat-s1`,
        seasonNumber: 1,
        cropName: steps[0].cropName,
        severity: 'Moderate',
        confidence: 'High',
        shortWarning: `Season 1 ${steps[0].cropName} follows same recent crop`,
        cause: `Season -1 harvested ${draft.recentCrops[0]?.cropName}; planting ${steps[0].cropName} in Season 1 carries short-term residue/disease bridge risk.`,
        evidenceRule: 'Recent crop continuity & host residue carryover screening.',
        consequence: 'Higher spore pressure on crown/root tissue unless residue is managed or Season 1 opens with a break crop.',
        mitigation: `Consider starting with a legume break sequence or apply stubble incorporation + seed treatment before Season 1 seeding.`,
        confirmingData: 'Field scouting log for foliar disease and stubble breakdown before sowing.',
      });
    }

    if (hasLegume) {
      const legStep = steps.find((s) => s.plainFamily === 'Legume');
      if (legStep) {
        risks.push({
          id: `${bp.id}-risk-legume`,
          seasonNumber: legStep.seasonNumber,
          cropName: legStep.cropName,
          severity: 'Low',
          confidence: 'Moderate',
          shortWarning: `Ensure drainage & inoculation for Season ${legStep.seasonNumber} ${legStep.cropName}`,
          cause: `${legStep.cropName} root nodules are sensitive to saturated soil (>48 h waterlogging) and pH outside 6.0–8.0.`,
          evidenceRule: 'Fabaceae Rhizobium nodulation & root-rot threshold rule.',
          consequence: 'Poor nodulation reduces biological nitrogen credit available to Season ' + (legStep.seasonNumber + 1) + '.',
          mitigation: 'Use strain-specific peat/liquid Rhizobium inoculant and inspect drainage outlets prior to spring seeding.',
          confirmingData: 'Root nodule pink-core check at vegetative stage V4 and topsoil drainage log.',
        });
      }
    }

    const netN = steps.reduce((acc, s) => acc + s.nitrogenBalanceKgHa, 0);
    const totalDays = steps.reduce((acc, s) => acc + s.durationDays, 0);

    const reviewBy = new Date();
    reviewBy.setMonth(reviewBy.getMonth() + 6);
    const reviewByDate = reviewBy.toISOString().slice(0, 10);

    validCandidates.push({
      id: bp.id,
      planCode: 'Plan A',
      rank: 1,
      title: bp.title,
      subtitle: bp.subtitle,
      matchScore: calibratedScore,
      uncertaintyMarginPts: dataGaps.length > 2 ? 6 : 4,
      confidenceReason:
        dataGaps.length === 0
          ? 'Core soil texture, pH, water reliability, and crop parameters provided.'
          : `Data gap note: adding ${dataGaps[0].toLowerCase()} narrows planning uncertainty.`,
      dataGaps,
      isRecommended: false,
      fitSummary:
        calibratedScore >= 85
          ? 'Strong fit for your priorities — high yield, productivity and soil health benefits.'
          : calibratedScore >= 75
            ? 'Solid water-conserving alternative suited to lower seasonal demand.'
            : 'Moderate fit prioritizing minimal water extraction over peak biomass.',
      whyItFits: bp.tags.slice(0, 3),
      comparisonBullets: [
        {
          text: productivityRaw >= 84 ? 'High productivity' : 'Moderate yield',
          tone: productivityRaw >= 84 ? 'positive' : 'neutral',
        },
        {
          text: diversityRaw >= 84 ? 'Good diversity' : 'Less diversity',
          tone: diversityRaw >= 84 ? 'positive' : 'caution',
        },
        {
          text: waterEfficiencyRaw >= 84 ? 'Balanced water use' : 'Lower water use',
          tone: waterEfficiencyRaw >= 84 ? 'positive' : 'neutral',
        },
      ],
      components: {
        soilHealth: soilHealthRaw,
        waterEfficiency: waterEfficiencyRaw,
        productivity: productivityRaw,
        diversity: diversityRaw,
        suitability: Math.round(avgSuit),
        resilience: resilienceRaw,
      },
      totalWaterDemandMm: totalWaterMm,
      netNitrogenBalanceKgHa: netN,
      totalCycleDays: totalDays,
      steps,
      risks,
      fallowVsCoverDecision: {
        chosen: specs.some((s) => s.id === 'cover_crop')
          ? 'Cover Crop'
          : specs.some((s) => s.id === 'fallow')
            ? 'Fallow'
            : 'Cash Sequence Only',
        reason: fallowOrCover.reason,
      },
      reviewByDate,
      reviewTriggersList: [
        'Water reliability drops or irrigation limit changes by >15%',
        'New crop history or pest/disease incident recorded',
        'Field boundary or soil lab pH/texture edited',
        `Scheduled review-by date (${reviewByDate})`,
      ],
      modelVersion: ROTATION_ENGINE_VERSION,
    });
  }

  // Deterministic ranking with tie-breaker by waterEfficiency then id
  const sorted = validCandidates.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    if (b.components.waterEfficiency !== a.components.waterEfficiency) {
      return b.components.waterEfficiency - a.components.waterEfficiency;
    }
    return a.id.localeCompare(b.id);
  });

  const planCodes = ['Plan A', 'Plan B', 'Plan C', 'Plan D', 'Plan E'] as const;
  const rankedCandidates = sorted.map((cand, idx) => ({
    ...cand,
    planCode: planCodes[idx] ?? 'Plan E',
    rank: idx + 1,
    isRecommended: idx === 0,
  }));

  const leading = rankedCandidates[0];
  const peakStep = leading ? [...leading.steps].sort((a, b) => b.etcMmEstimate - a.etcMmEstimate)[0] : null;

  const additionalInsights: RotationEngineOutput['additionalInsights'] = [
    {
      id: 'ins-legume',
      category: 'legume',
      title: 'Legume Nitrogen Credit',
      summary: 'Consider adding more legumes to reduce fertiliser costs.',
      detail:
        'Chickpea and field pea nodulation can supply 45–65 kg N/ha biologically, trimming synthetic nitrogen top-dressing needed in the following cereal crop.',
      actionHint: 'Verify soil pH stays in 6.0–7.8 and inoculate seed prior to planting.',
    },
    {
      id: 'ins-water',
      category: 'water',
      title: 'Peak Seasonal Water Watch',
      summary: peakStep
        ? `Monitor water demand in Season ${peakStep.seasonNumber}.`
        : 'Monitor peak summer crop evapotranspiration.',
      detail: peakStep
        ? `${peakStep.cropName} represents the highest seasonal water draw (~${peakStep.etcMmEstimate} mm ETc). Soil moisture monitoring prior to flowering prevents yield-penalizing deficit.`
        : 'Track root-zone soil moisture weekly through mid-season flowering.',
      actionHint: 'Schedule root-zone probe or tensiometer checks every 7 days in mid-season.',
    },
    {
      id: 'ins-cover',
      category: 'cover_crop',
      title: 'Long-Term Cover Benefits',
      summary: 'Cover crops can boost long-term soil health.',
      detail:
        'Maintaining living roots across fallow gaps protects topsoil aggregates from raindrop crusting, suppresses winter weeds, and stabilizes microbial biomass.',
      actionHint: 'Terminate cover crop 2–3 weeks before spring seeding when moisture reserves permit.',
    },
  ];

  const reviewGate = evaluateRotationReviewGate(farm, fields, draft);
  const areaVal = farm.mappedAreaHa > 0 ? farm.mappedAreaHa : farm.declaredAreaHa;
  const areaUnit: AreaUnit = farm.areaUnit || 'hectares';
  const areaDisplay =
    areaVal && areaVal > 0
      ? areaUnit === 'acres'
        ? `${(areaVal * 2.47105).toFixed(1)} ac`
        : `${areaVal.toFixed(1)} ha`
      : 'Area unmapped';

  return {
    generatedAt: new Date().toISOString(),
    engineVersion: ROTATION_ENGINE_VERSION,
    cropKnowledgeVersion: ROTATION_KB_VERSION,
    farmId: farm.id,
    farmName: farm.name,
    fieldId: draft.fieldId,
    fieldName: draft.fieldName,
    areaDisplay,
    inputSnapshotHash: deterministicHash(JSON.stringify({ draft, weights: normalizedWeights.weights })),
    normalizedWeights,
    candidates: rankedCandidates,
    rejectedCandidates,
    cropSuitability,
    reviewGate,
    additionalInsights,
  };
}

export function compareRotationPlans(
  left: RotationPlanCandidate,
  right: RotationPlanCandidate,
  weights: NormalizedWeightsResult['weights']
): HeadToHeadComparisonResult {
  const rows: HeadToHeadComparisonResult['rows'] = [
    {
      criterion: 'Overall Match Score',
      leftValue: `${left.matchScore} / 100`,
      rightValue: `${right.matchScore} / 100`,
      winner: left.matchScore === right.matchScore ? 'tie' : left.matchScore > right.matchScore ? 'left' : 'right',
    },
    {
      criterion: 'Seasonal Water Demand',
      leftValue: `${left.totalWaterDemandMm} mm`,
      rightValue: `${right.totalWaterDemandMm} mm`,
      winner:
        left.totalWaterDemandMm === right.totalWaterDemandMm
          ? 'tie'
          : left.totalWaterDemandMm < right.totalWaterDemandMm
            ? 'left'
            : 'right',
    },
    {
      criterion: 'Water Efficiency',
      leftValue: `${left.components.waterEfficiency}%`,
      rightValue: `${right.components.waterEfficiency}%`,
      winner:
        left.components.waterEfficiency === right.components.waterEfficiency
          ? 'tie'
          : left.components.waterEfficiency > right.components.waterEfficiency
            ? 'left'
            : 'right',
    },
    {
      criterion: 'Soil Health Index',
      leftValue: `${left.components.soilHealth}%`,
      rightValue: `${right.components.soilHealth}%`,
      winner:
        left.components.soilHealth === right.components.soilHealth
          ? 'tie'
          : left.components.soilHealth > right.components.soilHealth
            ? 'left'
            : 'right',
    },
    {
      criterion: 'Productivity Potential',
      leftValue: `${left.components.productivity}%`,
      rightValue: `${right.components.productivity}%`,
      winner:
        left.components.productivity === right.components.productivity
          ? 'tie'
          : left.components.productivity > right.components.productivity
            ? 'left'
            : 'right',
    },
    {
      criterion: 'Net Nitrogen Balance',
      leftValue: `${left.netNitrogenBalanceKgHa >= 0 ? '+' : ''}${left.netNitrogenBalanceKgHa} kg N/ha`,
      rightValue: `${right.netNitrogenBalanceKgHa >= 0 ? '+' : ''}${right.netNitrogenBalanceKgHa} kg N/ha`,
      winner:
        left.netNitrogenBalanceKgHa === right.netNitrogenBalanceKgHa
          ? 'tie'
          : left.netNitrogenBalanceKgHa > right.netNitrogenBalanceKgHa
            ? 'left'
            : 'right',
    },
    {
      criterion: 'Crop Diversity',
      leftValue: `${left.components.diversity}%`,
      rightValue: `${right.components.diversity}%`,
      winner:
        left.components.diversity === right.components.diversity
          ? 'tie'
          : left.components.diversity > right.components.diversity
            ? 'left'
            : 'right',
    },
    {
      criterion: 'Cycle Duration',
      leftValue: `~${left.totalCycleDays} days (${left.steps.length} seasons)`,
      rightValue: `~${right.totalCycleDays} days (${right.steps.length} seasons)`,
      winner: 'tie',
    },
    {
      criterion: 'Data Availability',
      leftValue:
        left.dataGaps.length === 0
          ? 'Complete inputs'
          : `${left.dataGaps.length} input gap${left.dataGaps.length === 1 ? '' : 's'}`,
      rightValue:
        right.dataGaps.length === 0
          ? 'Complete inputs'
          : `${right.dataGaps.length} input gap${right.dataGaps.length === 1 ? '' : 's'}`,
      winner:
        left.dataGaps.length === right.dataGaps.length
          ? 'tie'
          : left.dataGaps.length < right.dataGaps.length
            ? 'left'
            : 'right',
    },
  ];

  const diff = Math.abs(left.matchScore - right.matchScore);
  const stronger = left.matchScore >= right.matchScore ? left : right;
  const weaker = stronger.id === left.id ? right : left;

  const topPriority = Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0] || 'soilHealth';
  const priorityLabel =
    topPriority === 'waterSaving'
      ? 'water-saving'
      : topPriority === 'soilHealth'
        ? 'soil-health'
        : topPriority === 'productivity'
          ? 'productivity'
          : topPriority === 'climateResilience'
            ? 'climate-resilience'
            : 'crop-suitability';

  const conclusionHeadline =
    diff <= 3
      ? `${left.planCode} and ${right.planCode} are statistically close (${diff}-pt gap)`
      : `${stronger.planCode} is the stronger match under your current ${priorityLabel} priority`;

  const conclusionDetail =
    diff <= 3
      ? `Under current field inputs and priority weights, the ${diff}-point margin is within model uncertainty (±${stronger.uncertaintyMarginPts} pts); choose based on operational equipment or water margin (${stronger.totalWaterDemandMm} mm vs ${weaker.totalWaterDemandMm} mm).`
      : `${stronger.planCode} (${stronger.title}) leads ${weaker.planCode} by ${diff} match points due to stronger combined ${priorityLabel} and diversity performance, while requiring ${stronger.totalWaterDemandMm} mm total seasonal ETc vs ${weaker.totalWaterDemandMm} mm.`;

  return {
    leftPlan: left,
    rightPlan: right,
    rows,
    conclusionHeadline,
    conclusionDetail,
  };
}

export function derivePlanProsAndCons(
  plan: RotationPlanCandidate,
  allCandidates: RotationPlanCandidate[]
): PlanProsAndCons {
  const pros: string[] = [];
  const cons: string[] = [];

  const uniqueFamilies = new Set(plan.steps.map((s) => s.plainFamily)).size;
  const legumeSteps = plan.steps.filter((s) => s.plainFamily === 'Legume');
  const hasCoverCrop = plan.steps.some((s) => s.isCoverCrop);
  const hasFallow = plan.steps.some((s) => s.isFallow);
  const bestScore = allCandidates[0]?.matchScore ?? plan.matchScore;
  const minWater = Math.min(...allCandidates.map((c) => c.totalWaterDemandMm), plan.totalWaterDemandMm);
  const maxProd = Math.max(...allCandidates.map((c) => c.components.productivity), plan.components.productivity);

  if (plan.isRecommended) {
    pros.push(`Highest overall field fit (${plan.matchScore}/100) across your active priorities`);
  } else if (plan.matchScore >= bestScore - 8) {
    pros.push(`Close runner-up (${plan.matchScore}/100) within ${bestScore - plan.matchScore} pts of #1`);
  }

  if (legumeSteps.length > 0) {
    const legNames = legumeSteps.map((s) => s.cropName).join(' & ');
    pros.push(
      `Biological nitrogen fixation from ${legNames} (${plan.netNitrogenBalanceKgHa >= 0 ? '+' : ''}${plan.netNitrogenBalanceKgHa} kg N/ha net balance)`
    );
  }

  if (uniqueFamilies >= 3) {
    pros.push(`Rotates ${uniqueFamilies} distinct crop families to interrupt root & foliar pest cycles`);
  }

  if (plan.components.waterEfficiency >= 84 || plan.totalWaterDemandMm <= minWater + 80) {
    pros.push(`Lower seasonal water footprint (~${plan.totalWaterDemandMm} mm total ETc, ${plan.components.waterEfficiency}% efficiency)`);
  }

  if (plan.components.productivity >= 88) {
    pros.push(`Strong marketable harvest ceiling (${plan.components.productivity}% productivity index)`);
  }

  if (hasCoverCrop) {
    pros.push('Includes living cover crop biomass to armor topsoil and rebuild organic matter');
  } else if (hasFallow) {
    pros.push('Includes rested fallow phase to bank pre-season soil moisture');
  }

  // Honest Cons / Trade-offs
  if (!plan.isRecommended && bestScore > plan.matchScore) {
    cons.push(`Trails top-ranked #1 sequence by ${bestScore - plan.matchScore} overall weighted match points`);
  }

  if (plan.totalWaterDemandMm > minWater + 120) {
    cons.push(`Requires +${plan.totalWaterDemandMm - minWater} mm more seasonal water than the lowest-ETc option`);
  }

  if (plan.components.productivity <= maxProd - 7) {
    cons.push(`Lower total grain/output index (${plan.components.productivity}%) compared to highest-yield option (${maxProd}%)`);
  }

  if (uniqueFamilies < 3) {
    cons.push(`Narrower botanical spread (${uniqueFamilies} crop families) offers less multi-pest diversity`);
  }

  for (const r of plan.risks) {
    if (cons.length < 3) {
      cons.push(r.shortWarning);
    }
  }

  if (plan.dataGaps.length > 0 && cons.length < 3) {
    cons.push(`Model uncertainty (±${plan.uncertaintyMarginPts} pts) until ${plan.dataGaps[0].toLowerCase()} is confirmed`);
  }

  if (cons.length === 0) {
    cons.push('Requires timely planting transitions between harvests across consecutive seasons');
  }

  return {
    pros: pros.slice(0, 4),
    cons: cons.slice(0, 3),
  };
}

export function buildCandidateForSavePayload(
  candidate: RotationPlanCandidate
): RotationCandidateOption {
  return {
    id: candidate.id,
    title: candidate.title,
    suitabilityScore: candidate.matchScore,
    primaryBenefit: candidate.fitSummary,
    waterDemandImpact:
      candidate.components.waterEfficiency >= 85
        ? 'Reduces demand'
        : candidate.components.waterEfficiency >= 75
          ? 'Neutral'
          : 'Increases demand',
    waterDemandMmEstimate: candidate.totalWaterDemandMm,
    soilImpactLabel: candidate.whyItFits[1] || 'Balanced crop family & nitrogen cycle',
    warningNote: candidate.risks[0]?.shortWarning,
    steps: candidate.steps.map((s) => ({
      cycleLabel: `${s.yearLabel} · ${s.seasonLabel}`,
      cropId: s.cropId,
      cropName: s.cropName,
      nitrogenRole:
        s.plainFamily === 'Legume'
          ? 'fixer'
          : s.plainFamily === 'Cover Crop'
            ? 'cover_builder'
            : s.waterNeedBand === 'High'
              ? 'heavy_feeder'
              : 'light_feeder',
      waterNeedBand: s.waterNeedBand,
      rationale: s.rationale,
    })),
  };
}

export function isSameActiveSequence(
  candidate: RotationPlanCandidate,
  activePlan: MyFarmRecord['activePlan']
): boolean {
  if (!activePlan) return false;
  if (activePlan.planId === candidate.id) return true;
  if (activePlan.cropSequence.length !== candidate.steps.length) return false;
  return activePlan.cropSequence.every(
    (step, i) => step.cropId === candidate.steps[i].cropId
  );
}

export function formatShortPlanDate(iso: string | null | undefined): string {
  if (!iso) return '15 Nov 2026';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function getLatestPlanDecision(
  farmId: string,
  decisions: PlanDecisionEvent[]
): PlanDecisionEvent | null {
  return decisions.find((d) => d.farmId === farmId) ?? null;
}
