import {
  FarmObservationItem,
  FarmTaskItem,
  IrrigationLogItem,
  MyFarmRecord,
  PortfolioFieldRecord,
} from '../../../types/myFarms';
import { LiveWeatherReading } from '../../../services/weather';
import { findCropCatalogItem } from '../../../data/farmCropCatalog';
import { formatRelativeDate, resolveCropThumbnail } from '../../../lib/myFarmsEngine';
import { AreaUnit, SoilMoistureUnit } from '../../../types/farm';
import {
  formatSoilMoistureUnitLabel,
  resolveEffectiveFieldSoil,
} from '../../../lib/soilProvenance';

export interface FieldActionDisplayItem {
  id: string;
  taskId?: string;
  title: string;
  subtitle: string;
  priority: 'High' | 'Medium' | 'Low';
  iconKind: 'water' | 'pest' | 'fertilizer';
  completed: boolean;
}

export interface FieldRiskDisplayItem {
  id: string;
  title: string;
  severityLine: string;
  description: string;
  timeAgo: string;
  kind: 'heat' | 'water' | 'boundary' | 'soil';
}

export interface FieldIntelligenceViewModel {
  fieldCode: string;
  fieldDisplayTitle: string;
  fieldAreaLabel: string;
  areaHa: number;
  statusLabel: string;
  isHealthyStatus: boolean;
  cropName: string;
  cropImageSrc: string;
  variety: string;
  growthStage: string;
  growthProgressPct: number;
  plantedOn: string;
  daysSincePlanting: string;
  estMaturity: string;
  harvestWindow: string;
  cropHealthBadge: 'Healthy' | 'Attention' | 'At Risk';
  cropHealthSummary: string;
  water: {
    cropDemandMmDay: number;
    effectiveRain7dMm: number | null;
    irrigationNeededMm: number | null;
    recommendedCycles: number | null;
    recommendedVolumeM3: number | null;
    recommendedTimeLabel: string;
    soilMoisturePct: number | null;
    soilMoistureUnit: SoilMoistureUnit;
    soilMoistureDepth: string;
    soilMoistureMethod: string;
    soilMoistureDate: string;
    isVwcCompatibleForBalance: boolean;
    moistureProvenanceLabel: string;
    moistureUnitAmbiguityNote: string | null;
    hydraulicAvailabilityReason: string | null;
    soilMoistureStatusText: string;
  };
  soil: {
    texture: string;
    textureProvenance: string;
    phLabel: string;
    phProvenance: string;
    organicMatterLabel: string;
    availableWaterMm: number | null;
    kc: number;
    tawMm: number | null;
  };
  actions: FieldActionDisplayItem[];
  risks: FieldRiskDisplayItem[];
  rotation: {
    previousCrop: string;
    currentCrop: string;
    nextCrop: string;
  };
}

interface CropAgronomyMeta {
  variety: string;
  kc: number;
  maturityDays: number;
  plantedDaysAgo: number;
  stage: string;
  progressPct: number;
  baseDemandMm: number;
  defaultNextCrop: string;
  defaultPrevCrop: string;
}

const CROP_AGRONOMY_PRESETS: Record<string, CropAgronomyMeta> = {
  maize: {
    variety: 'Pioneer P0725',
    kc: 1.15,
    maturityDays: 95,
    plantedDaysAgo: 28,
    stage: 'Mid-Vegetative',
    progressPct: 45,
    baseDemandMm: 5.8,
    defaultNextCrop: 'Soybean',
    defaultPrevCrop: 'Wheat',
  },
  wheat: {
    variety: 'Norwest 553',
    kc: 0.95,
    maturityDays: 115,
    plantedDaysAgo: 42,
    stage: 'Tillering Canopy',
    progressPct: 38,
    baseDemandMm: 4.1,
    defaultNextCrop: 'Field Peas',
    defaultPrevCrop: 'Barley',
  },
  soybean: {
    variety: 'Asgrow AG36X6',
    kc: 1.05,
    maturityDays: 105,
    plantedDaysAgo: 34,
    stage: 'Early Flowering (R1)',
    progressPct: 52,
    baseDemandMm: 4.9,
    defaultNextCrop: 'Winter Wheat',
    defaultPrevCrop: 'Maize',
  },
  barley: {
    variety: 'LCS Odyssey',
    kc: 0.9,
    maturityDays: 92,
    plantedDaysAgo: 31,
    stage: 'Stem Elongation',
    progressPct: 48,
    baseDemandMm: 3.7,
    defaultNextCrop: 'Chickpeas',
    defaultPrevCrop: 'Peas',
  },
  peas: {
    variety: 'CDC Amarillo',
    kc: 0.88,
    maturityDays: 85,
    plantedDaysAgo: 26,
    stage: 'Pod Set & Fill',
    progressPct: 42,
    baseDemandMm: 3.5,
    defaultNextCrop: 'Oats Cover',
    defaultPrevCrop: 'Wheat',
  },
  sunflower: {
    variety: 'N4H302 E',
    kc: 1.02,
    maturityDays: 100,
    plantedDaysAgo: 36,
    stage: 'Bud Initiation',
    progressPct: 46,
    baseDemandMm: 4.6,
    defaultNextCrop: 'Lentils',
    defaultPrevCrop: 'Soybean',
  },
};

function resolveAgronomyPreset(cropName: string): CropAgronomyMeta {
  const lower = cropName.toLowerCase();
  if (lower.includes('corn') || lower.includes('maize')) return CROP_AGRONOMY_PRESETS.maize;
  if (lower.includes('soy')) return CROP_AGRONOMY_PRESETS.soybean;
  if (lower.includes('barley') || lower.includes('oat') || lower.includes('rye')) {
    return CROP_AGRONOMY_PRESETS.barley;
  }
  if (lower.includes('pea') || lower.includes('bean') || lower.includes('lentil') || lower.includes('chickpea')) {
    return CROP_AGRONOMY_PRESETS.peas;
  }
  if (lower.includes('sunflower')) return CROP_AGRONOMY_PRESETS.sunflower;
  return CROP_AGRONOMY_PRESETS.wheat;
}

interface TextureHydraulicRef {
  taw: number | null;
  aw: number | null;
  fcVwc: number | null;
  wpVwc: number | null;
}

function getTextureHydraulics(texture: string): TextureHydraulicRef {
  const t = texture.trim().toLowerCase();
  if (!t || t === 'unknown') {
    return { taw: null, aw: null, fcVwc: null, wpVwc: null };
  }
  if (t.includes('silt')) return { taw: 195, aw: 158, fcVwc: 31, wpVwc: 14 };
  if (t.includes('clay loam')) return { taw: 175, aw: 140, fcVwc: 34, wpVwc: 19 };
  if (t.includes('clay')) return { taw: 185, aw: 148, fcVwc: 39, wpVwc: 23 };
  if (t.includes('loamy sand')) return { taw: 120, aw: 90, fcVwc: 16, wpVwc: 7 };
  if (t.includes('sandy loam')) return { taw: 140, aw: 105, fcVwc: 21, wpVwc: 10 };
  if (t.includes('sand')) return { taw: 105, aw: 78, fcVwc: 12, wpVwc: 5 };
  if (t.includes('loam')) return { taw: 180, aw: 145, fcVwc: 27, wpVwc: 13 };
  return { taw: null, aw: null, fcVwc: null, wpVwc: null };
}

function formatFieldAreaShort(ha: number, unit: AreaUnit): string {
  if (!Number.isFinite(ha) || ha <= 0) return 'Unmapped';
  if (unit === 'acres') {
    const ac = ha * 2.4710538;
    return `${ac.toFixed(1)} ac`;
  }
  return `${ha.toFixed(1)} ha`;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatShortDayMonth(d: Date): string {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export function buildFieldIntelligenceViewModel(params: {
  farm: MyFarmRecord;
  field: PortfolioFieldRecord | null;
  fieldIndex: number;
  liveWeather: LiveWeatherReading | null;
  tasks: FarmTaskItem[];
  observations: FarmObservationItem[];
  irrigationLogs: IrrigationLogItem[];
}): FieldIntelligenceViewModel {
  const { farm, field, fieldIndex, liveWeather, tasks, observations, irrigationLogs } = params;
  const fieldCode = `Field ${String(fieldIndex + 1).padStart(2, '0')}`;
  const rawFieldName = field?.name?.trim() || `${farm.name} Primary Block`;
  const fieldDisplayTitle = rawFieldName.toLowerCase().startsWith('field')
    ? rawFieldName
    : `${fieldCode} – ${rawFieldName}`;

  const areaHa =
    field?.versions?.[0]?.netAreaHectares ??
    (farm.mappedAreaHa > 0 ? farm.mappedAreaHa : farm.declaredAreaHa ?? 42.0);

  const cropNameRaw = field?.cropName || farm.primaryCrop || 'Wheat';
  const cropName = cropNameRaw === 'Corn' ? 'Maize' : cropNameRaw;
  const cropImageSrc = resolveCropThumbnail(field?.cropId || cropName);
  const preset = resolveAgronomyPreset(cropName);
  const catalogMatch = findCropCatalogItem(cropName.toLowerCase()) || findCropCatalogItem(field?.cropId || '');

  // Lifecycle dates anchored deterministically relative to farm creation / field index
  const daysOffset = preset.plantedDaysAgo + fieldIndex * 4;
  const now = new Date();
  const plantedDate = new Date(now.getTime() - daysOffset * 86400000);
  const maturityStart = new Date(plantedDate.getTime() + preset.maturityDays * 86400000);
  const maturityEnd = new Date(maturityStart.getTime() + 10 * 86400000);

  const progressPct = Math.min(
    94,
    Math.max(15, Math.round((daysOffset / preset.maturityDays) * 100))
  );

  // Soil parameters resolved via single-source-of-truth provenance resolver (never fabricate defaults)
  const effSoil = resolveEffectiveFieldSoil(farm.soil, field?.soilOverrides);
  const texture = effSoil.texture || 'Unknown';
  const textureProvenance =
    effSoil.textureSource === 'farm'
      ? 'Inherited from farm'
      : effSoil.textureSource === 'field'
        ? 'Field override'
        : effSoil.textureSource === 'field_suppressed'
          ? 'Field override (Unknown)'
          : 'Unavailable';

  const phLabel =
    effSoil.phValue !== null
      ? effSoil.phValue.toFixed(1)
      : effSoil.phSource === 'field_suppressed'
        ? 'Not tested (field)'
        : 'Not tested';
  const phProvenance = effSoil.phProvenanceLabel;

  const organicMatterLabel =
    effSoil.organicMatterPct !== null ? `${effSoil.organicMatterPct.toFixed(1)}%` : 'Not measured';

  const { taw, aw, fcVwc, wpVwc } = getTextureHydraulics(texture);
  const soilMoisturePct = effSoil.moisturePct;

  const rawTriggerVwc =
    fcVwc !== null && wpVwc !== null ? wpVwc + 0.5 * (fcVwc - wpVwc) : null;
  const canComputeVwcRefill =
    taw !== null &&
    rawTriggerVwc !== null &&
    effSoil.isVwcCompatibleForBalance &&
    soilMoisturePct !== null;
  const belowTextureRaw =
    canComputeVwcRefill && rawTriggerVwc !== null && soilMoisturePct !== null
      ? soilMoisturePct < rawTriggerVwc
      : false;

  const soilMoistureStatusText =
    soilMoisturePct === null
      ? effSoil.moistureProvenanceLabel
      : !effSoil.isVwcCompatibleForBalance
        ? `${formatSoilMoistureUnitLabel(effSoil.moistureUnit)} · excluded from VWC`
        : taw === null
          ? `${effSoil.moistureProvenanceLabel} · % VWC (texture needed)`
          : belowTextureRaw
            ? `Below texture RAW · ${effSoil.moistureProvenanceLabel}`
            : `Within texture RAW · ${effSoil.moistureProvenanceLabel}`;

  const hydraulicAvailabilityReason: string | null =
    taw === null && effSoil.moistureUnitAmbiguityNote
      ? `Soil texture is Unknown (TAW/AW unavailable). ${effSoil.moistureUnitAmbiguityNote}`
      : taw === null
        ? 'Soil texture is Unknown — field capacity, available water, TAW, and irrigation sizing are unavailable.'
        : soilMoisturePct === null
          ? 'Soil moisture is not measured — record a volumetric (% VWC) reading or run the full FAO-56 water balance.'
          : !effSoil.isVwcCompatibleForBalance
            ? effSoil.moistureUnitAmbiguityNote ||
              'Only volumetric (% VWC) readings may enter VWC refill calculations.'
            : null;

  // Water & Irrigation metrics
  const etAdjustment = liveWeather ? Math.max(0.75, Math.min(1.25, liveWeather.tempC / 24)) : 1.0;
  const cropDemandMmDay = Number(
    (
      preset.baseDemandMm * etAdjustment +
      (fieldIndex % 2 === 1 ? 0.3 : 0)
    ).toFixed(1)
  );
  const recentRainMm: number | null =
    liveWeather?.precip24hMm !== undefined && Number.isFinite(liveWeather.precip24hMm)
      ? Number(liveWeather.precip24hMm.toFixed(1))
      : null;

  const recentFieldIrrigationM3 = irrigationLogs
    .filter((l) => !field || !l.fieldId || l.fieldId === field.id)
    .slice(0, 1)
    .reduce((sum, l) => sum + l.volumeM3, 0);

  let irrigationNeededMm: number | null = null;
  let recommendedVolumeM3: number | null = null;
  let recommendedCycles: number | null = null;

  if (canComputeVwcRefill && rawTriggerVwc !== null && soilMoisturePct !== null) {
    const rainOffset = (recentRainMm ?? 0) / 7;
    if (!belowTextureRaw) {
      // Within texture-specific RAW buffer: 0 mm refill required when rain or buffer offsets demand
      const netDraw = cropDemandMmDay - rainOffset - 4.5;
      irrigationNeededMm = netDraw > 0 ? Number(netDraw.toFixed(1)) : 0;
    } else {
      const refill = cropDemandMmDay - rainOffset + (rawTriggerVwc - soilMoisturePct) * 0.45;
      irrigationNeededMm = Math.max(0.5, Number(refill.toFixed(1)));
    }
    recommendedVolumeM3 =
      irrigationNeededMm === 0
        ? 0
        : Math.max(25, Math.round(irrigationNeededMm * areaHa * 10 * 0.98));
    recommendedCycles =
      irrigationNeededMm === 0 ? 0 : irrigationNeededMm > 4.2 ? 2 : 1;
  }

  const isHealthyStatus =
    field?.status !== 'Needs Review' &&
    (field?.activeAlertsCount ?? 0) === 0 &&
    !belowTextureRaw &&
    farm.assessment.status !== 'alert';

  const cropHealthBadge: FieldIntelligenceViewModel['cropHealthBadge'] =
    field?.status === 'Needs Review' || farm.assessment.status === 'alert'
      ? 'At Risk'
      : (field?.activeAlertsCount ?? 0) > 0 || belowTextureRaw
        ? 'Attention'
        : 'Healthy';

  const cropHealthSummary =
    cropHealthBadge === 'Healthy'
      ? `Your ${cropName.toLowerCase()} crop is tracking in the ${preset.stage.toLowerCase()} stage. ${
          observations[0]?.title
            ? `Recent check (${observations[0].observedAt}) logged canopy conditions.`
            : hydraulicAvailabilityReason
              ? 'Note: soil texture or % VWC moisture inputs remain incomplete.'
              : 'Recorded field indicators show no active alerts.'
        }`
      : cropHealthBadge === 'Attention'
        ? `Your ${cropName.toLowerCase()} stand requires attention${
            belowTextureRaw
              ? ' — observed % VWC sits below texture-specific RAW.'
              : ' due to active field advisories.'
          } Review scheduling for ${rawFieldName}.`
        : `Active field review flags or farm alerts detected on ${rawFieldName}. Inspect field records and water status today.`;

  // Build up to 3 prioritized daily actions (merging real field tasks + agronomic defaults)
  const fieldTasks = tasks.filter(
    (t) => !field || !t.fieldId || t.fieldId === field.id
  );
  const mappedTasks: FieldActionDisplayItem[] = fieldTasks.slice(0, 2).map((t) => ({
    id: `task-${t.id}`,
    taskId: t.id,
    title: t.title,
    subtitle: t.dueDate ? `Due ${t.dueDate} · ${t.fieldName || rawFieldName}` : rawFieldName,
    priority: t.priority === 'high' ? 'High' : t.priority === 'low' ? 'Low' : 'Medium',
    iconKind:
      t.category === 'irrigation'
        ? 'water'
        : t.category === 'scouting' || t.category === 'soil'
          ? 'pest'
          : 'fertilizer',
    completed: t.completed,
  }));

  const irrigationAction: FieldActionDisplayItem =
    irrigationNeededMm === null
      ? {
          id: 'default-irrigate',
          title: 'Confirm soil texture & % VWC moisture',
          subtitle: '(Required before computing irrigation depth)',
          priority: 'Medium',
          iconKind: 'water',
          completed: false,
        }
      : irrigationNeededMm === 0
        ? {
            id: 'default-irrigate',
            title: 'Irrigation standby: 0.0 mm due',
            subtitle: '(Within texture-specific RAW buffer)',
            priority: 'Low',
            iconKind: 'water',
            completed: true,
          }
        : {
            id: 'default-irrigate',
            title: `Irrigate: ${irrigationNeededMm.toFixed(1)} mm total`,
            subtitle: `(${recommendedCycles} cycle${(recommendedCycles ?? 1) > 1 ? 's' : ''} ~${recommendedVolumeM3} m³ at 6 PM)`,
            priority: 'High',
            iconKind: 'water',
            completed: recentFieldIrrigationM3 > 0 && !belowTextureRaw,
          };

  const defaultActions: FieldActionDisplayItem[] = [
    irrigationAction,
    {
      id: 'default-pest',
      title: 'Check for potential pests',
      subtitle: cropName.toLowerCase().includes('maize')
        ? '(leaf miners & whorl check)'
        : `(${cropName.toLowerCase()} canopy scouting)`,
      priority: 'Medium',
      iconKind: 'pest',
      completed: false,
    },
    {
      id: 'default-fert',
      title:
        catalogMatch?.nitrogenRole === 'fixer'
          ? 'Inspect rhizobia nodulation'
          : 'Review soil lab N / P / K status',
      subtitle:
        catalogMatch?.nitrogenRole === 'fixer'
          ? '(verify root vigor & foliar K)'
          : '(0–20 cm lab test gates prescription)',
      priority: 'Low',
      iconKind: 'fertilizer',
      completed: false,
    },
  ];

  const actions = [...mappedTasks, ...defaultActions].slice(0, 3);

  // Build Risks & Alerts
  const risks: FieldRiskDisplayItem[] = [];
  if (field?.criticalAlert) {
    risks.push({
      id: 'risk-critical',
      title: 'Field Alert Active',
      severityLine: 'High · Immediate check',
      description: field.criticalAlert,
      timeAgo: formatRelativeDate(field.lastAssessedAt),
      kind: 'boundary',
    });
  }
  if (!liveWeather || liveWeather.tempHighC >= 26) {
    risks.push({
      id: 'risk-heat',
      title: 'Heat Stress Risk',
      severityLine: liveWeather && liveWeather.tempHighC >= 32 ? 'High · Next 2 days' : 'Moderate · Next 2 days',
      description: 'Investigate field shading and consider evening irrigation.',
      timeAgo: '2h ago',
      kind: 'heat',
    });
  } else {
    risks.push({
      id: 'risk-cool',
      title: 'Canopy Humidity Watch',
      severityLine: `Moderate · RH ${liveWeather.humidityPct}%`,
      description: 'Monitor lower leaf moisture after morning dew clears.',
      timeAgo: '2h ago',
      kind: 'heat',
    });
  }

  if (belowTextureRaw && soilMoisturePct !== null) {
    risks.push({
      id: 'risk-water',
      title: 'Below Texture RAW Trigger',
      severityLine: `High · ${soilMoisturePct}% VWC`,
      description: `Volumetric moisture (${soilMoisturePct}%) is below the RAW trigger for ${texture}.`,
      timeAgo: effSoil.moistureDate || 'Current',
      kind: 'water',
    });
  } else if (effSoil.moistureUnitAmbiguityNote) {
    risks.push({
      id: 'risk-water',
      title: 'Moisture Unit Review Required',
      severityLine: `Excluded · ${formatSoilMoistureUnitLabel(effSoil.moistureUnit)}`,
      description: effSoil.moistureUnitAmbiguityNote,
      timeAgo: effSoil.moistureDate || 'Recorded',
      kind: 'water',
    });
  } else if (taw === null || soilMoisturePct === null) {
    risks.push({
      id: 'risk-water',
      title: 'Soil Hydraulics Incomplete',
      severityLine: taw === null ? 'Texture Unknown' : 'Moisture Not Measured',
      description:
        hydraulicAvailabilityReason ||
        'Confirm soil texture and volumetric (% VWC) reading to evaluate depletion.',
      timeAgo: 'Pending',
      kind: 'soil',
    });
  } else {
    risks.push({
      id: 'risk-water',
      title: 'Water Balance Watch',
      severityLine: 'Nominal · Within RAW',
      description: 'Observed % VWC is within texture-specific readily available water.',
      timeAgo: effSoil.moistureDate || 'Current',
      kind: 'water',
    });
  }

  // Build Rotation sequence (Previous -> Current -> Next)
  const previousCrop = field?.previousCrops?.[0] || preset.defaultPrevCrop;
  const planCrops = farm.activePlan?.cropSequence?.map((s) => s.cropName) ?? [];
  const nextFromPlan =
    planCrops.find((c) => !c.toLowerCase().includes(cropName.toLowerCase())) ||
    preset.defaultNextCrop;

  return {
    fieldCode,
    fieldDisplayTitle,
    fieldAreaLabel: formatFieldAreaShort(areaHa, farm.areaUnit),
    areaHa,
    statusLabel: field?.status === 'Needs Review' ? 'Needs Review' : field?.status || 'Active',
    isHealthyStatus,
    cropName,
    cropImageSrc,
    variety: preset.variety,
    growthStage: preset.stage,
    growthProgressPct: progressPct,
    plantedOn: formatShortDate(plantedDate),
    daysSincePlanting: `${daysOffset} Days`,
    estMaturity: `~ ${preset.maturityDays} Days`,
    harvestWindow: `${formatShortDayMonth(maturityStart)} – ${formatShortDayMonth(maturityEnd)}`,
    cropHealthBadge,
    cropHealthSummary,
    water: {
      cropDemandMmDay,
      effectiveRain7dMm: recentRainMm,
      irrigationNeededMm,
      recommendedCycles,
      recommendedVolumeM3,
      recommendedTimeLabel: '6:00 PM',
      soilMoisturePct,
      soilMoistureUnit: effSoil.moistureUnit,
      soilMoistureDepth: effSoil.moistureDepth,
      soilMoistureMethod: effSoil.moistureMethod,
      soilMoistureDate: effSoil.moistureDate,
      isVwcCompatibleForBalance: effSoil.isVwcCompatibleForBalance,
      moistureProvenanceLabel: effSoil.moistureProvenanceLabel,
      moistureUnitAmbiguityNote: effSoil.moistureUnitAmbiguityNote,
      hydraulicAvailabilityReason,
      soilMoistureStatusText,
    },
    soil: {
      texture,
      textureProvenance,
      phLabel,
      phProvenance,
      organicMatterLabel,
      availableWaterMm: aw,
      kc: preset.kc,
      tawMm: taw,
    },
    actions,
    risks: risks.slice(0, 2),
    rotation: {
      previousCrop,
      currentCrop: cropName,
      nextCrop: nextFromPlan,
    },
  };
}
