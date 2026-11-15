import {
  DrainageRate,
  FarmSoilInfo,
  SoilMoistureStatus,
  SoilMoistureUnit,
  SoilPhStatus,
  SoilTexture,
} from '../types/farm';
import { PortfolioFieldRecord, SoilLandProfile } from '../types/myFarms';

export type FieldMoistureProvenanceSource =
  | 'farm_measured'
  | 'farm_estimated'
  | 'field_measured'
  | 'field_estimated'
  | 'field_suppressed'
  | 'unavailable';

export type FieldPhProvenanceSource =
  | 'farm_tested'
  | 'field_tested'
  | 'field_suppressed'
  | 'unavailable';

export type FieldTextureProvenanceSource = 'farm' | 'field' | 'field_suppressed' | 'unavailable';

export interface EffectiveFieldSoil {
  texture: SoilTexture;
  textureSource: FieldTextureProvenanceSource;
  drainage: DrainageRate;
  drainageSource: FieldTextureProvenanceSource;

  moistureStatus: SoilMoistureStatus;
  moisturePct: number | null;
  moistureUnit: SoilMoistureUnit;
  moistureDepth: string;
  moistureMethod: string;
  moistureDate: string;
  moistureSource: FieldMoistureProvenanceSource;
  moistureProvenanceLabel: string;
  moistureUnitAmbiguityNote: string | null;
  isVwcCompatibleForBalance: boolean;

  phStatus: SoilPhStatus;
  phValue: number | null;
  phTestDate: string;
  phSource: FieldPhProvenanceSource;
  phProvenanceLabel: string;

  organicMatterPct: number | null;
}

const VALID_MOISTURE_UNITS: ReadonlySet<SoilMoistureUnit> = new Set([
  'volumetric_vwc',
  'gravimetric',
  'available_water_pct',
  'unspecified',
]);

export function normalizeSoilMoistureUnit(unit: unknown): SoilMoistureUnit {
  if (typeof unit === 'string' && VALID_MOISTURE_UNITS.has(unit as SoilMoistureUnit)) {
    return unit as SoilMoistureUnit;
  }
  return 'unspecified';
}

export function formatSoilMoistureUnitLabel(unit?: SoilMoistureUnit): string {
  switch (unit) {
    case 'volumetric_vwc':
      return 'volumetric (% VWC)';
    case 'gravimetric':
      return 'gravimetric (% dry weight)';
    case 'available_water_pct':
      return '% available water capacity';
    default:
      return 'unit unspecified';
  }
}

export function buildMoistureUnitAmbiguityNote(
  moistureStatus: SoilMoistureStatus,
  moisturePct: number | null,
  moistureUnit: SoilMoistureUnit,
  moistureMethod: string
): string | null {
  if (moistureStatus === 'unknown' || moisturePct === null) {
    return null;
  }
  const mentionsTensiometer = /tensiometer/i.test(moistureMethod);

  if (mentionsTensiometer && moistureUnit === 'unspecified') {
    return `Recorded at ${moisturePct}% with method "${moistureMethod.trim()}" and an unspecified unit; tensiometers measure soil matric tension rather than volumetric water content (% VWC).`;
  }
  if (moistureUnit === 'unspecified') {
    return `Recorded moisture (${moisturePct}%) has an unspecified unit/basis and is not assumed to be volumetric water content (% VWC).`;
  }
  if (moistureUnit === 'gravimetric' || moistureUnit === 'available_water_pct') {
    return `Moisture reading (${moisturePct}% ${formatSoilMoistureUnitLabel(moistureUnit)}) is preserved for display and excluded from VWC-based soil-water balance calculations.`;
  }
  if (mentionsTensiometer && moistureUnit === 'volumetric_vwc') {
    return `Method "${moistureMethod.trim()}" is paired with % VWC; confirm the soil-water retention conversion from tension to VWC before irrigation decisions.`;
  }
  return null;
}

type FarmSoilInput =
  | Pick<
      SoilLandProfile,
      | 'texture'
      | 'moistureStatus'
      | 'moisturePct'
      | 'moistureUnit'
      | 'moistureDepth'
      | 'moistureMethod'
      | 'moistureDate'
      | 'phStatus'
      | 'phValue'
      | 'phTestDate'
      | 'drainage'
    > & { organicMatterPct?: number | null }
  | (Pick<
      FarmSoilInfo,
      | 'moistureStatus'
      | 'moisturePct'
      | 'moistureUnit'
      | 'moistureDepth'
      | 'moistureMethod'
      | 'moistureDate'
      | 'phStatus'
      | 'phValue'
      | 'phTestDate'
    > & {
      texture: SoilTexture | '';
      drainage: DrainageRate | '';
      organicMatterPct?: number | null;
    });

/**
 * Single source of truth for field-versus-farm soil inheritance and provenance.
 *
 * Precedence rules:
 * - Undefined override property (`undefined`): inherits the farm-level value and provenance.
 * - Explicit `'unknown'` moisture status: suppresses farm-level moisture inheritance.
 * - Explicit `'estimated'` moisture override: overrides both farm moisture value and any farm `'measured'` label.
 * - Explicit `'not_tested'` pH status: suppresses farm-level tested pH inheritance.
 * - Missing moisture unit never defaults silently to `'volumetric_vwc'`.
 */
export function resolveEffectiveFieldSoil(
  farmSoil: FarmSoilInput,
  fieldOverrides?: PortfolioFieldRecord['soilOverrides']
): EffectiveFieldSoil {
  // 1. Texture
  let texture: SoilTexture;
  let textureSource: FieldTextureProvenanceSource;
  if (fieldOverrides?.texture !== undefined) {
    texture = (fieldOverrides.texture || 'Unknown') as SoilTexture;
    textureSource = texture === 'Unknown' ? 'field_suppressed' : 'field';
  } else {
    texture = (farmSoil.texture || 'Unknown') as SoilTexture;
    textureSource = texture === 'Unknown' ? 'unavailable' : 'farm';
  }

  // 2. Drainage
  let drainage: DrainageRate;
  let drainageSource: FieldTextureProvenanceSource;
  if (fieldOverrides?.drainage !== undefined) {
    drainage = (fieldOverrides.drainage || 'Unknown') as DrainageRate;
    drainageSource = drainage === 'Unknown' ? 'field_suppressed' : 'field';
  } else {
    drainage = (farmSoil.drainage || 'Unknown') as DrainageRate;
    drainageSource = drainage === 'Unknown' ? 'unavailable' : 'farm';
  }

  // 3. Moisture
  let moistureStatus: SoilMoistureStatus;
  let moisturePct: number | null;
  let moistureUnit: SoilMoistureUnit;
  let moistureDepth: string;
  let moistureMethod: string;
  let moistureDate: string;
  let moistureSource: FieldMoistureProvenanceSource;
  let moistureProvenanceLabel: string;

  const overrideStatus = fieldOverrides?.moistureStatus;
  const legacyOverridePctOnly =
    overrideStatus === undefined &&
    typeof fieldOverrides?.moisturePct === 'number' &&
    Number.isFinite(fieldOverrides.moisturePct);

  if (overrideStatus === 'unknown') {
    // Explicit field override to Unknown suppresses farm-level inheritance completely
    moistureStatus = 'unknown';
    moisturePct = null;
    moistureUnit = 'unspecified';
    moistureDepth = '';
    moistureMethod = '';
    moistureDate = '';
    moistureSource = 'field_suppressed';
    moistureProvenanceLabel = 'Unknown / Not measured (field override)';
  } else if (overrideStatus === 'measured' || overrideStatus === 'estimated') {
    moistureStatus = overrideStatus;
    moisturePct =
      typeof fieldOverrides?.moisturePct === 'number' && Number.isFinite(fieldOverrides.moisturePct)
        ? fieldOverrides.moisturePct
        : null;
    moistureUnit = normalizeSoilMoistureUnit(fieldOverrides?.moistureUnit);
    moistureDepth = (fieldOverrides?.moistureDepth ?? '').trim();
    moistureMethod = (fieldOverrides?.moistureMethod ?? '').trim();
    moistureDate = (fieldOverrides?.moistureDate ?? '').trim();
    if (overrideStatus === 'measured') {
      moistureSource = moisturePct !== null ? 'field_measured' : 'unavailable';
      moistureProvenanceLabel = moisturePct !== null ? 'Field measured' : 'Field measured (value missing)';
    } else {
      moistureSource = moisturePct !== null ? 'field_estimated' : 'unavailable';
      moistureProvenanceLabel = moisturePct !== null ? 'Field estimated' : 'Field estimated (value missing)';
    }
  } else if (legacyOverridePctOnly) {
    // Legacy numeric field override without explicit status: never promote to measured
    moistureStatus = 'estimated';
    moisturePct = fieldOverrides!.moisturePct as number;
    moistureUnit = normalizeSoilMoistureUnit(fieldOverrides?.moistureUnit);
    moistureDepth = (fieldOverrides?.moistureDepth ?? '').trim();
    moistureMethod = (fieldOverrides?.moistureMethod ?? '').trim();
    moistureDate = (fieldOverrides?.moistureDate ?? '').trim();
    moistureSource = 'field_estimated';
    moistureProvenanceLabel = 'Field estimated';
  } else {
    // Inherit from farm
    const farmStatus = farmSoil.moistureStatus ?? 'unknown';
    if (farmStatus === 'unknown') {
      moistureStatus = 'unknown';
      moisturePct = null;
      moistureUnit = 'unspecified';
      moistureDepth = '';
      moistureMethod = '';
      moistureDate = '';
      moistureSource = 'unavailable';
      moistureProvenanceLabel = 'Unknown / Not measured';
    } else {
      moistureStatus = farmStatus;
      moisturePct =
        typeof farmSoil.moisturePct === 'number' && Number.isFinite(farmSoil.moisturePct)
          ? farmSoil.moisturePct
          : null;
      moistureUnit = normalizeSoilMoistureUnit(farmSoil.moistureUnit);
      moistureDepth = (farmSoil.moistureDepth ?? '').trim();
      moistureMethod = (farmSoil.moistureMethod ?? '').trim();
      moistureDate = (farmSoil.moistureDate ?? '').trim();
      moistureSource =
        moisturePct === null
          ? 'unavailable'
          : farmStatus === 'measured'
            ? 'farm_measured'
            : 'farm_estimated';
      moistureProvenanceLabel =
        moisturePct === null
          ? 'Unavailable'
          : farmStatus === 'measured'
            ? 'Farm measured'
            : 'Farm estimated';
    }
  }

  const moistureUnitAmbiguityNote = buildMoistureUnitAmbiguityNote(
    moistureStatus,
    moisturePct,
    moistureUnit,
    moistureMethod
  );
  const mentionsTensiometer = /tensiometer/i.test(moistureMethod);
  const isVwcCompatibleForBalance =
    moistureStatus !== 'unknown' &&
    moisturePct !== null &&
    moistureUnit === 'volumetric_vwc' &&
    !mentionsTensiometer;

  // 4. Soil pH
  let phStatus: SoilPhStatus;
  let phValue: number | null;
  let phTestDate: string;
  let phSource: FieldPhProvenanceSource;
  let phProvenanceLabel: string;

  const overridePhStatus = fieldOverrides?.phStatus;
  const legacyOverridePhOnly =
    overridePhStatus === undefined &&
    typeof fieldOverrides?.phValue === 'number' &&
    Number.isFinite(fieldOverrides.phValue);

  if (overridePhStatus === 'not_tested') {
    // Explicit field override to Not tested suppresses farm-level pH inheritance
    phStatus = 'not_tested';
    phValue = null;
    phTestDate = '';
    phSource = 'field_suppressed';
    phProvenanceLabel = 'Not tested (field override)';
  } else if (overridePhStatus === 'tested' || legacyOverridePhOnly) {
    phStatus = 'tested';
    phValue =
      typeof fieldOverrides?.phValue === 'number' && Number.isFinite(fieldOverrides.phValue)
        ? fieldOverrides.phValue
        : null;
    phTestDate = (fieldOverrides?.phTestDate ?? '').trim();
    phSource = phValue !== null ? 'field_tested' : 'unavailable';
    phProvenanceLabel = phValue !== null ? 'Field tested' : 'Field tested (value missing)';
  } else {
    // Inherit from farm
    const farmPhStatus = farmSoil.phStatus ?? 'not_tested';
    if (farmPhStatus === 'tested' && typeof farmSoil.phValue === 'number' && Number.isFinite(farmSoil.phValue)) {
      phStatus = 'tested';
      phValue = farmSoil.phValue;
      phTestDate = (farmSoil.phTestDate ?? '').trim();
      phSource = 'farm_tested';
      phProvenanceLabel = 'Farm tested';
    } else {
      phStatus = 'not_tested';
      phValue = null;
      phTestDate = '';
      phSource = 'unavailable';
      phProvenanceLabel = 'Not tested';
    }
  }

  return {
    texture,
    textureSource,
    drainage,
    drainageSource,
    moistureStatus,
    moisturePct,
    moistureUnit,
    moistureDepth,
    moistureMethod,
    moistureDate,
    moistureSource,
    moistureProvenanceLabel,
    moistureUnitAmbiguityNote,
    isVwcCompatibleForBalance,
    phStatus,
    phValue,
    phTestDate,
    phSource,
    phProvenanceLabel,
    organicMatterPct:
      typeof farmSoil.organicMatterPct === 'number' && Number.isFinite(farmSoil.organicMatterPct)
        ? farmSoil.organicMatterPct
        : null,
  };
}
