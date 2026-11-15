import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { EventEmitter } from 'events';
import {
  AssessmentJobEvent,
  AssessmentJobRecord,
  AssessmentResultBundle,
  CanonicalAnswer,
  EnvironmentalEvidenceSummary,
  ExternalConnectorInfo,
  GeocodedLocationCandidate,
  ImmutableInputSnapshot,
  QuestionnaireDraft,
} from '../src/types/questionnaire';
import {
  DailyWeatherSample,
  QUESTIONNAIRE_CROP_KB_VERSION,
  QUESTIONNAIRE_ENGINE_VERSION,
  buildImmutableSnapshot,
  evaluateSnapshotAssessment,
  extractDailyClimateFeatures,
  mapSnapshotToFarmProfile,
} from '../src/lib/questionnaireEngine';
import { QUESTIONNAIRE_SCHEMA_VERSION, QUESTION_CATALOGUE } from '../src/lib/questionnaireSchema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '.data');
const STORE_PATH = path.join(DATA_DIR, 'questionnaires-store.json');
const PORTFOLIO_STORE_PATH = path.join(DATA_DIR, 'my-farms-portfolio.json');
const MAPS_STORE_PATH = path.join(DATA_DIR, 'maps-workspace.json');

interface CachedApiEntry {
  key: string;
  fetchedAt: string;
  expiresAt: number;
  data: unknown;
}

interface QuestionnaireStore {
  drafts: Record<string, QuestionnaireDraft>;
  snapshots: Record<string, ImmutableInputSnapshot>;
  jobs: Record<string, AssessmentJobRecord>;
  results: Record<string, AssessmentResultBundle>;
  idempotencyIndex: Record<string, string>; // key -> jobId
  apiCache: Record<string, CachedApiEntry>;
}

const jobEmitters = new Map<string, EventEmitter>();

function getJobEmitter(jobId: string): EventEmitter {
  let em = jobEmitters.get(jobId);
  if (!em) {
    em = new EventEmitter();
    em.setMaxListeners(50);
    jobEmitters.set(jobId, em);
  }
  return em;
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function readStore(): QuestionnaireStore {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      const empty: QuestionnaireStore = {
        drafts: {},
        snapshots: {},
        jobs: {},
        results: {},
        idempotencyIndex: {},
        apiCache: {},
      };
      writeJsonAtomic(STORE_PATH, empty);
      return empty;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<QuestionnaireStore>;
    return {
      drafts: parsed.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {},
      snapshots: parsed.snapshots && typeof parsed.snapshots === 'object' ? parsed.snapshots : {},
      jobs: parsed.jobs && typeof parsed.jobs === 'object' ? parsed.jobs : {},
      results: parsed.results && typeof parsed.results === 'object' ? parsed.results : {},
      idempotencyIndex:
        parsed.idempotencyIndex && typeof parsed.idempotencyIndex === 'object'
          ? parsed.idempotencyIndex
          : {},
      apiCache: parsed.apiCache && typeof parsed.apiCache === 'object' ? parsed.apiCache : {},
    };
  } catch {
    return {
      drafts: {},
      snapshots: {},
      jobs: {},
      results: {},
      idempotencyIndex: {},
      apiCache: {},
    };
  }
}

function writeStore(store: QuestionnaireStore): void {
  writeJsonAtomic(STORE_PATH, store);
}

// ============================================================================
// Geodesic Polygon Validation Helpers (EPSG:4326 -> m² / ha)
// ============================================================================

const EARTH_RADIUS_M = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;
type LonLat = [number, number];

function stripClosing(ring: LonLat[]): LonLat[] {
  if (ring.length < 2) return ring;
  const f = ring[0];
  const l = ring[ring.length - 1];
  if (Math.abs(f[0] - l[0]) < 1e-10 && Math.abs(f[1] - l[1]) < 1e-10) {
    return ring.slice(0, -1);
  }
  return ring;
}

function closeRing(ring: LonLat[]): LonLat[] {
  if (ring.length === 0) return [];
  const f = ring[0];
  const l = ring[ring.length - 1];
  if (Math.abs(f[0] - l[0]) < 1e-11 && Math.abs(f[1] - l[1]) < 1e-11) return ring;
  return [...ring, [f[0], f[1]]];
}

function orient(a: LonLat, b: LonLat, c: LonLat): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: LonLat, b: LonLat, c: LonLat): boolean {
  return (
    Math.min(a[0], c[0]) - 1e-12 <= b[0] &&
    b[0] <= Math.max(a[0], c[0]) + 1e-12 &&
    Math.min(a[1], c[1]) - 1e-12 <= b[1] &&
    b[1] <= Math.max(a[1], c[1]) + 1e-12
  );
}

function segmentsIntersect(a1: LonLat, a2: LonLat, b1: LonLat, b2: LonLat): boolean {
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);
  if (
    ((o1 > 1e-12 && o2 < -1e-12) || (o1 < -1e-12 && o2 > 1e-12)) &&
    ((o3 > 1e-12 && o4 < -1e-12) || (o3 < -1e-12 && o4 > 1e-12))
  ) {
    return true;
  }
  if (Math.abs(o1) <= 1e-12 && onSegment(a1, b1, a2)) return true;
  if (Math.abs(o2) <= 1e-12 && onSegment(a1, b2, a2)) return true;
  if (Math.abs(o3) <= 1e-12 && onSegment(b1, a1, b2)) return true;
  if (Math.abs(o4) <= 1e-12 && onSegment(b1, a2, b2)) return true;
  return false;
}

function validateAndMeasurePolygon(coordinates: LonLat[][]): {
  ok: true;
  normalized: { type: 'Polygon'; coordinates: LonLat[][] };
  areaHa: number;
  perimeterM: number;
  centroid: { lat: number; lon: number };
} | { ok: false; error: string } {
  const ext = coordinates[0];
  if (!Array.isArray(ext) || stripClosing(ext).length < 3) {
    return { ok: false, error: 'Polygon exterior must have at least 3 distinct vertices.' };
  }
  const clean = stripClosing(ext).map(([lon, lat]) => [Number(lon), Number(lat)] as LonLat);
  if (
    clean.some(
      ([lon, lat]) =>
        !Number.isFinite(lon) ||
        !Number.isFinite(lat) ||
        lon < -180 ||
        lon > 180 ||
        lat < -90 ||
        lat > 90
    )
  ) {
    return { ok: false, error: 'Geometry contains out-of-range WGS84 coordinates.' };
  }
  for (let i = 0; i < clean.length; i++) {
    for (let j = i + 2; j < clean.length; j++) {
      if (i === 0 && j === clean.length - 1) continue;
      if (segmentsIntersect(clean[i], clean[(i + 1) % clean.length], clean[j], clean[(j + 1) % clean.length])) {
        return { ok: false, error: 'Field boundary edges self-intersect; adjust overlapping vertices.' };
      }
    }
  }
  const closed = closeRing(clean);
  const n = closed.length - 1;
  let areaTotal = 0;
  for (let i = 0; i < n; i++) {
    const lon1 = closed[i][0] * DEG_TO_RAD;
    const lat2 = closed[(i + 1) % n][1] * DEG_TO_RAD;
    const lon3 = closed[(i + 2) % n][0] * DEG_TO_RAD;
    areaTotal += (lon3 - lon1) * Math.sin(lat2);
  }
  const areaM2 = Math.abs((areaTotal * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  if (areaM2 < 25) {
    return { ok: false, error: 'Polygon enclosed area is under 25 m².' };
  }

  let perim = 0;
  for (let i = 0; i < n; i++) {
    const a = closed[i];
    const b = closed[i + 1];
    const lat1 = a[1] * DEG_TO_RAD;
    const lat2 = b[1] * DEG_TO_RAD;
    const dLat = (b[1] - a[1]) * DEG_TO_RAD;
    const dLon = (b[0] - a[0]) * DEG_TO_RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    perim += 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  const centroidLon = clean.reduce((s, p) => s + p[0], 0) / clean.length;
  const centroidLat = clean.reduce((s, p) => s + p[1], 0) / clean.length;

  return {
    ok: true,
    normalized: { type: 'Polygon', coordinates: [closed] },
    areaHa: Number((areaM2 / 10000).toFixed(3)),
    perimeterM: Math.round(perim),
    centroid: { lat: Number(centroidLat.toFixed(6)), lon: Number(centroidLon.toFixed(6)) },
  };
}

// ============================================================================
// Sync Completed Questionnaire Farm/Field into Portfolio & Maps JSON Stores
// ============================================================================

function syncSnapshotToPortfolioAndMaps(
  snapshot: ImmutableInputSnapshot,
  result?: AssessmentResultBundle | null
): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const profile = mapSnapshotToFarmProfile(snapshot);
    const now = new Date().toISOString();
    const areaHa = snapshot.geometry.geodesicAreaHa ?? snapshot.declaredAreaHa ?? 25;
    const centroid = snapshot.location
      ? { lat: snapshot.location.latitude, lon: snapshot.location.longitude }
      : snapshot.geometry.centroid;

    // 1. Update my-farms-portfolio.json
    let port: Record<string, Record<string, unknown>> & {
      farmMeta: Record<string, unknown>;
      fieldMeta: Record<string, unknown>;
      snapshots: unknown[];
    } = {
      farmMeta: {},
      fieldMeta: {},
      decisions: [],
      observations: [],
      tasks: [],
      irrigationLogs: [],
      snapshots: [],
      appliedOpIds: [],
    } as never;

    if (fs.existsSync(PORTFOLIO_STORE_PATH)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(PORTFOLIO_STORE_PATH, 'utf8'));
        port = { ...port, ...parsed };
      } catch {
        // use clean fallback
      }
    }

    const topPlan = result?.candidateSequences[0] ?? null;
    const topCropScore =
      result?.cropSuitability
        .filter((c) => typeof c.suitabilityScore === 'number')
        .sort((a, b) => (b.suitabilityScore ?? 0) - (a.suitabilityScore ?? 0))[0]?.suitabilityScore ??
      null;

    const existingFarmMeta = port.farmMeta[snapshot.farmId] as Record<string, unknown> | undefined;

    port.farmMeta[snapshot.farmId] = existingFarmMeta
      ? {
          ...existingFarmMeta,
          farmId: snapshot.farmId,
          name: (existingFarmMeta.name as string | undefined) || snapshot.farmName,
          versionNumber: Math.max(Number(existingFarmMeta.versionNumber || 1), snapshot.inputVersion),
          recommendedPlanId: (existingFarmMeta.recommendedPlanId as string | null) ?? topPlan?.id ?? null,
          recommendedPlanTitle: (existingFarmMeta.recommendedPlanTitle as string | null) ?? topPlan?.title ?? null,
          lastAssessedAt: result ? now : (existingFarmMeta.lastAssessedAt as string | null) ?? null,
          suitabilityScore: (existingFarmMeta.suitabilityScore as number | null) ?? topPlan?.matchScore ?? topCropScore,
          updatedAt: now,
        }
      : {
          farmId: snapshot.farmId,
          name: snapshot.farmName,
          primaryCrop: profile.crops.currentCrops[0] || profile.crops.previousCycle1[0] || topPlan?.cropNames[0] || null,
          locationLabel: snapshot.location?.placeLabel || 'Confirmed location',
          regionLabel: snapshot.location?.adminArea || snapshot.location?.placeLabel || 'Confirmed location',
          country: snapshot.location?.country || 'Unspecified',
          timezone: snapshot.location?.timezone || 'UTC',
          centroid,
          areaUnit: 'hectares',
          declaredAreaHa: snapshot.declaredAreaHa,
          isPrivate: true,
          isDraft: false,
          archivedAt: null,
          deletedAt: null,
          versionNumber: snapshot.inputVersion,
          notes: `Assessed via Field Shift Questionnaire (${snapshot.evidenceCoverageGrade}).`,
          activePlan: null,
          recommendedPlanId: topPlan?.id ?? null,
          recommendedPlanTitle: topPlan?.title ?? null,
          soil: {
            texture: profile.soil.texture || 'Unknown',
            moistureStatus: 'unknown',
            moisturePct: null,
            moistureUnit: 'unspecified',
            moistureDepth: '',
            moistureMethod: '',
            moistureDate: '',
            phStatus: profile.soil.phStatus,
            phValue: profile.soil.phValue,
            phTestDate: profile.soil.phTestDate,
            organicMatterPct: null,
            drainage: profile.soil.drainage || 'Unknown',
            slopePct: null,
            elevationM: snapshot.location?.elevationM ?? null,
            preparationMethods: [],
            notes: '',
          },
          water: {
            sources: profile.water.sources,
            reliability: profile.water.reliability || 'Unknown',
            dailyCapacityKnown: false,
            dailyCapacityM3: null,
            qualityTested: profile.water.qualityTested || 'Unknown',
            ecDsM: profile.water.ecValue,
            salinityPpm: profile.water.salinityValue,
            qualityTestDate: profile.water.qualityTestDate,
            wateringMethod: profile.water.wateringMethod,
            irrigationMethod: profile.water.irrigationMethod || 'Unknown',
            irrigationFrequency: profile.water.irrigationFrequency || 'Unknown',
            rainfallFrequency: 'Unknown',
            estimatedDailyDemandM3: null,
            demandAssumptionNote:
              result?.waterCalculationSummary.limitationNote ||
              'Captured from field questionnaire.',
          },
          planningHorizon: profile.planning.horizon,
          priorities: profile.planning.priorities,
          challenges: [],
          lastAssessedAt: result ? now : null,
          suitabilityScore: topPlan?.matchScore ?? topCropScore,
          createdAt: snapshot.createdAt,
          updatedAt: now,
        };

    const existingFieldMeta = port.fieldMeta[snapshot.fieldId] as Record<string, unknown> | undefined;
    port.fieldMeta[snapshot.fieldId] = {
      ...(existingFieldMeta ?? {}),
      fieldId: snapshot.fieldId,
      previousCrops: profile.crops.previousCycle1.concat(profile.crops.previousCycle2),
      rotationReviewDue: Boolean(existingFieldMeta?.rotationReviewDue ?? false),
      activeAlertsCount: Number(existingFieldMeta?.activeAlertsCount ?? 0),
      lastAssessedAt: result ? now : (existingFieldMeta?.lastAssessedAt as string | null) ?? null,
      notes: (existingFieldMeta?.notes as string | undefined) || `Field profile ${snapshot.inputSnapshotId}`,
    };

    if (result) {
      const snapSummary = {
        id: snapshot.inputSnapshotId,
        farmId: snapshot.farmId,
        fieldId: snapshot.fieldId,
        fieldName: snapshot.fieldName,
        generatedAt: result.generatedAt,
        modelVersion: result.engineVersion,
        triggerReason: 'Field Questionnaire Assessment Run',
        suitabilityScore: topPlan?.matchScore ?? topCropScore,
        completenessPct: Math.round(
          (snapshot.reviewRows.filter((r) => r.sourceBadge !== 'Skipped' && r.sourceBadge !== 'Unknown').length /
            Math.max(1, snapshot.reviewRows.length)) *
            100
        ),
        weatherWindowSummary: result.evidence.historicalClimate
          ? `ERA5 ${result.evidence.historicalClimate.yearsCovered}y daily: ${result.evidence.historicalClimate.meanAnnualTempC ?? '--'} °C mean, ${result.evidence.historicalClimate.meanAnnualPrecipMm ?? '--'} mm/yr precip`
          : 'Open-Meteo current & NASA POWER daily climate context',
        dataAvailability: {
          nasaPower: result.evidence.nasaPowerDaily ? 'available' : 'unavailable',
          openMeteo: result.evidence.currentWeather ? 'available' : 'unavailable',
          nasaEonet: 'unavailable',
          soilLab: profile.soil.phStatus === 'tested' ? 'measured' : 'missing',
        },
        keyMetrics: {
          meanTempC: result.evidence.historicalClimate?.meanAnnualTempC ?? result.evidence.nasaPowerDaily?.meanTempC ?? null,
          precipMmDay:
            result.evidence.historicalClimate?.meanAnnualPrecipMm !== null &&
            result.evidence.historicalClimate?.meanAnnualPrecipMm !== undefined
              ? Number((result.evidence.historicalClimate.meanAnnualPrecipMm / 365).toFixed(2))
              : null,
          et0MmDay:
            result.evidence.historicalClimate?.meanAnnualEt0Mm !== null &&
            result.evidence.historicalClimate?.meanAnnualEt0Mm !== undefined
              ? Number((result.evidence.historicalClimate.meanAnnualEt0Mm / 365).toFixed(2))
              : null,
          soilMoisturePct: null,
          phValue: profile.soil.phValue,
          mappedAreaHa: areaHa,
        },
        soilContext: {
          texture: profile.soil.texture || 'Unknown',
          moistureStatus: 'unknown',
          moistureUnit: 'unspecified',
          moistureDepth: '',
          moistureMethod: '',
          moistureDate: '',
          phStatus: profile.soil.phStatus,
          phTestDate: profile.soil.phTestDate,
          drainage: profile.soil.drainage || 'Unknown',
        },
        recommendations: result.candidateSequences.slice(0, 2).map((c) => `${c.title} (${c.matchScore}/100 fit)`),
      };
      port.snapshots = [
        snapSummary,
        ...port.snapshots.filter((s) => (s as { id?: string }).id !== snapshot.inputSnapshotId),
      ];
    }

    writeJsonAtomic(PORTFOLIO_STORE_PATH, port);

    // 2. Sync field (polygon or location-only) and new polygon farm into maps-workspace.json
    const hasVerifiedPoly =
      snapshot.geometry.geometryStatus === 'polygon_verified' &&
      Boolean(snapshot.geometry.polygon) &&
      Boolean(centroid);

    if (hasVerifiedPoly || Boolean(existingFarmMeta) || centroid) {
      let maps: {
        farms: Array<Record<string, unknown>>;
        fields: Array<Record<string, unknown>>;
        discoveryOptIns: unknown[];
        messages: unknown[];
        blockedPublicIds: string[];
      } = { farms: [], fields: [], discoveryOptIns: [], messages: [], blockedPublicIds: [] };
      if (fs.existsSync(MAPS_STORE_PATH)) {
        try {
          maps = { ...maps, ...JSON.parse(fs.readFileSync(MAPS_STORE_PATH, 'utf8')) };
        } catch {
          // ignore
        }
      }

      const existingMapFarm = maps.farms.find((f) => f.id === snapshot.farmId);
      if (hasVerifiedPoly && snapshot.geometry.polygon && centroid && !existingMapFarm) {
        const mapFarm = {
          id: snapshot.farmId,
          name: snapshot.farmName,
          crop: profile.crops.currentCrops[0] || profile.crops.previousCycle1[0] || null,
          locationLabel: snapshot.location?.placeLabel || 'Confirmed polygon',
          geometry: snapshot.geometry.polygon,
          areaM2: Math.round((snapshot.geometry.geodesicAreaHa ?? areaHa) * 10000),
          areaHa: snapshot.geometry.geodesicAreaHa ?? areaHa,
          perimeterM: snapshot.geometry.perimeterM ?? 0,
          centroid,
          labelPoint: centroid,
          healthStatus: topPlan && topPlan.matchScore >= 75 ? 'healthy' : result ? 'moderate' : 'no_data',
          assessment: {
            farmId: snapshot.farmId,
            status: topPlan && topPlan.matchScore >= 75 ? 'healthy' : result ? 'moderate' : 'no_data',
            score: topPlan?.matchScore ?? null,
            assessedAt: now,
            assessmentVersion: result?.engineVersion || 'questionnaire-v1',
            explanation: topPlan ? `Recommended sequence: ${topPlan.title}` : 'Saved from questionnaire',
          },
          versionNumber: 1,
          boundaryHistory: [
            {
              versionNumber: 1,
              geometry: snapshot.geometry.polygon,
              areaM2: Math.round((snapshot.geometry.geodesicAreaHa ?? areaHa) * 10000),
              changedAt: now,
              changeReason: 'Drawn during farm questionnaire',
            },
          ],
          createdAt: snapshot.createdAt,
          updatedAt: now,
          deletedAt: null,
        };
        maps.farms = [mapFarm, ...maps.farms.filter((f) => f.id !== snapshot.farmId)];
      }

      const existingField = maps.fields.find((f) => f.id === snapshot.fieldId);
      const existingVersions = Array.isArray(existingField?.versions)
        ? (existingField!.versions as unknown[])
        : [];

      if (hasVerifiedPoly && snapshot.geometry.polygon && centroid) {
        const verId = `${snapshot.fieldId}-v1`;
        const mapField = {
          id: snapshot.fieldId,
          farmId: snapshot.farmId,
          name: snapshot.fieldName,
          cropName: profile.crops.currentCrops[0] || undefined,
          status: 'Active',
          currentVersionId: verId,
          versions: [
            {
              geometryVersionId: verId,
              versionNumber: 1,
              createdAt: now,
              source: 'drawn',
              crs: 'EPSG:4326',
              areaMethod: 'WGS84 Spherical Excess (Chamberlain-Duquette)',
              grossAreaHectares: snapshot.geometry.geodesicAreaHa ?? areaHa,
              netAreaHectares: snapshot.geometry.geodesicAreaHa ?? areaHa,
              excludedAreaHectares: 0,
              perimeterM: snapshot.geometry.perimeterM ?? 0,
              centroid,
              geometry: snapshot.geometry.polygon,
            },
          ],
          staleCalculations: [],
          updatedAt: now,
        };
        maps.fields = [mapField, ...maps.fields.filter((f) => f.id !== snapshot.fieldId)];
      } else if (existingVersions.length === 0) {
        const mapField = {
          id: snapshot.fieldId,
          farmId: snapshot.farmId,
          name: snapshot.fieldName,
          cropName: profile.crops.currentCrops[0] || undefined,
          status: 'Active',
          currentVersionId: (existingField?.currentVersionId as string) || '',
          versions: [],
          staleCalculations: [],
          updatedAt: now,
        };
        maps.fields = [mapField, ...maps.fields.filter((f) => f.id !== snapshot.fieldId)];
      }
      writeJsonAtomic(MAPS_STORE_PATH, maps);
    }
  } catch (err) {
    console.warn('Non-fatal portfolio sync warning:', err instanceof Error ? err.message : err);
  }
}

// ============================================================================
// External Provider Adapters with Retry, Timeout & Cache-Hit Honesty
// ============================================================================

const CONNECTOR_REGISTRY: ExternalConnectorInfo[] = [
  {
    id: 'open_meteo_geocoding',
    name: 'Open-Meteo Geocoding API',
    role: 'Place search candidates, admin regions, elevation & IANA timezone',
    status: 'operational',
    resolution: 'Named locality / coordinate point',
    provenanceLabel: 'Open-Meteo Geocoding',
    note: 'Requires explicit farmer selection from ranked results.',
  },
  {
    id: 'open_meteo_forecast',
    name: 'Open-Meteo Weather & Forecast API',
    role: 'Current modelled conditions & 7-day daily forecast (Tmin/Tmax/Precip/ET0)',
    status: 'operational',
    resolution: '~11 km NWP model grid',
    provenanceLabel: 'Open-Meteo Modelled Forecast',
    note: 'Short-range NWP context only; never used as multi-year climate baseline.',
  },
  {
    id: 'open_meteo_archive',
    name: 'Open-Meteo Historical Weather API (ERA5)',
    role: '6-year daily historical reanalysis (Tmin, Tmax, Precip, ET0 FAO-56)',
    status: 'operational',
    resolution: '~11–25 km ERA5-Land reanalysis cell',
    provenanceLabel: 'ERA5 Reanalysis (not local weather station)',
    note: 'Supports GDD, frost/heat days, dry spells, and dry/typical/wet quantiles.',
  },
  {
    id: 'nasa_power_daily',
    name: 'NASA POWER Daily Point API (UTC)',
    role: '3-year daily meteorological & solar irradiance series (T2M, PRECTOTCORR, ALLSKY)',
    status: 'operational',
    resolution: '0.5° × 0.625° MERRA-2 / CERES grid cell',
    provenanceLabel: 'NASA POWER Daily (UTC, regional grid)',
    note: 'Cross-checks temperature, precipitation, and solar radiation.',
  },
  {
    id: 'isric_soilgrids',
    name: 'ISRIC SoilGrids REST Service',
    role: 'Mapped global soil property priors (texture/pH/OC)',
    status: 'unavailable_paused',
    resolution: '250 m predicted grid',
    provenanceLabel: 'Unavailable — REST API paused upstream',
    note: 'Per ISRIC status notice (15 Nov 2026), REST endpoint is paused upstream and is NOT queried.',
  },
];

async function fetchWithRetry(url: string, timeoutMs = 9500, retries = 1): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (resp.ok || (resp.status >= 400 && resp.status < 500 && resp.status !== 429)) {
        return resp;
      }
      lastErr = new Error(`HTTP ${resp.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Network request failed');
}

function getCachedExternal<T>(
  store: QuestionnaireStore,
  cacheKey: string
): { hit: true; data: T; ageMinutes: number } | { hit: false } {
  const entry = store.apiCache[cacheKey];
  if (!entry) return { hit: false };
  if (Date.now() > entry.expiresAt) return { hit: false };
  const ageMs = Math.max(0, Date.now() - Date.parse(entry.fetchedAt));
  return {
    hit: true,
    data: entry.data as T,
    ageMinutes: Math.max(1, Math.round(ageMs / 60000)),
  };
}

function setCachedExternal(
  store: QuestionnaireStore,
  cacheKey: string,
  data: unknown,
  ttlMinutes = 180
): void {
  store.apiCache[cacheKey] = {
    key: cacheKey,
    fetchedAt: new Date().toISOString(),
    expiresAt: Date.now() + ttlMinutes * 60 * 1000,
    data,
  };
  // Keep cache bounded to 120 entries
  const keys = Object.keys(store.apiCache);
  if (keys.length > 120) {
    keys
      .sort((a, b) => store.apiCache[a].expiresAt - store.apiCache[b].expiresAt)
      .slice(0, keys.length - 120)
      .forEach((k) => delete store.apiCache[k]);
  }
}

// ============================================================================
// Job Event Helper & Async Assessment Runner
// ============================================================================

function emitJobEvent(
  store: QuestionnaireStore,
  job: AssessmentJobRecord,
  ev: AssessmentJobEvent
): void {
  const existingIdx = job.events.findIndex((e) => e.eventId === ev.eventId);
  if (existingIdx >= 0) {
    job.events[existingIdx] = ev;
  } else {
    job.events.push(ev);
  }
  store.jobs[job.jobId] = job;
  writeStore(store);
  getJobEmitter(job.jobId).emit('message', { type: 'event', event: ev, job });
}

function updateJobStatus(store: QuestionnaireStore, job: AssessmentJobRecord): void {
  store.jobs[job.jobId] = job;
  writeStore(store);
  getJobEmitter(job.jobId).emit('message', { type: 'job_update', job });
}

async function runAssessmentJobAsync(
  jobId: string,
  snapshot: ImmutableInputSnapshot
): Promise<void> {
  const store = readStore();
  const job = store.jobs[jobId];
  if (!job) return;

  const corr = job.correlationId;
  const checkCancelled = (): boolean => {
    const fresh = readStore().jobs[jobId];
    return Boolean(fresh?.cancelRequested);
  };

  const startStage = (
    stageKey: AssessmentJobEvent['stageKey'],
    label: string,
    detail: string,
    parentEventId: string | null = null,
    sourceId?: string
  ): AssessmentJobEvent => {
    const now = new Date().toISOString();
    const ev: AssessmentJobEvent = {
      eventId: `ev_${stageKey}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      jobId,
      stageKey,
      parentEventId,
      label,
      detail,
      state: 'running',
      startedAt: now,
      completedAt: null,
      durationMs: null,
      sourceId,
      timestamp: now,
      correlationId: corr,
    };
    job.currentStageKey = stageKey;
    job.state = 'running';
    emitJobEvent(store, job, ev);
    return ev;
  };

  const finishEvent = (
    ev: AssessmentJobEvent,
    state: AssessmentJobEvent['state'],
    patch: Partial<AssessmentJobEvent> = {}
  ): void => {
    const end = new Date().toISOString();
    const dur = Math.max(1, Date.parse(end) - Date.parse(ev.startedAt));
    const updated: AssessmentJobEvent = {
      ...ev,
      ...patch,
      state,
      completedAt: end,
      durationMs: dur,
      timestamp: end,
    };
    emitJobEvent(store, job, updated);
  };

  try {
    // ------------------------------------------------------------------------
    // Stage 1: Validate inputs
    // ------------------------------------------------------------------------
    const s1 = startStage(
      'validate_inputs',
      'Validate field inputs & consent',
      'Checking farm/field identity, coordinate bounds, and remote-data consent.'
    );
    const s1a = startStage(
      'validate_inputs',
      'Check farm, field IDs & consent record',
      `Verifying snapshot ${snapshot.inputSnapshotId}`,
      s1.eventId
    );
    if (!snapshot.consent.acceptedRemoteFetch) {
      finishEvent(s1a, 'failed', { errorCode: 'CONSENT_REQUIRED', detail: 'Remote data retrieval consent was not confirmed.' });
      finishEvent(s1, 'failed', { errorCode: 'CONSENT_REQUIRED' });
      job.state = 'failed';
      job.completedAt = new Date().toISOString();
      job.errorMessage = 'Remote data retrieval consent is required before contacting external APIs.';
      updateJobStatus(store, job);
      return;
    }
    if (!snapshot.location) {
      finishEvent(s1a, 'failed', { errorCode: 'LOCATION_MISSING', detail: 'Confirmed location coordinates are missing.' });
      finishEvent(s1, 'failed', { errorCode: 'LOCATION_MISSING' });
      job.state = 'failed';
      job.completedAt = new Date().toISOString();
      job.errorMessage = 'Confirmed field coordinates are required.';
      updateJobStatus(store, job);
      return;
    }
    finishEvent(s1a, 'complete');

    const s1b = startStage(
      'validate_inputs',
      'Check geometry & spatial sampling basis',
      snapshot.geometry.geometryStatus === 'polygon_verified'
        ? `Verified polygon (${snapshot.geometry.geodesicAreaHa?.toFixed(2)} ha geodesic)`
        : 'Location-only point mode (no field polygon drawn)',
      s1.eventId
    );
    finishEvent(s1b, 'complete');
    finishEvent(s1, 'complete');

    if (checkCancelled()) {
      job.state = 'cancelled';
      job.completedAt = new Date().toISOString();
      updateJobStatus(store, job);
      return;
    }

    // ------------------------------------------------------------------------
    // Stage 2: Retrieve external evidence (real API calls + honest caching)
    // ------------------------------------------------------------------------
    const lat = snapshot.location.latitude;
    const lon = snapshot.location.longitude;
    const tz = encodeURIComponent(snapshot.location.timezone || 'UTC');
    const cellKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;

    const s2 = startStage(
      'retrieve_evidence',
      'Retrieve external weather & climate evidence',
      `Requesting verified climate datasets for ${lat.toFixed(3)}°, ${lon.toFixed(3)}°.`
    );

    const connectorsUsed: EnvironmentalEvidenceSummary['connectors'] = [];
    let currentWeather: EnvironmentalEvidenceSummary['currentWeather'] = null;
    let forecast7d: EnvironmentalEvidenceSummary['forecast7d'] = null;
    let historicalSeries: DailyWeatherSample[] = [];
    let nasaSeries: DailyWeatherSample[] = [];
    let nasaMeanRh: number | null = null;
    let nasaMeanSolar: number | null = null;

    // 2a. Open-Meteo Current + 7-day Forecast
    const evForecast = startStage(
      'retrieve_evidence',
      'Open-Meteo current & 7-day forecast',
      'Modelled NWP short-range weather context',
      s2.eventId,
      'open_meteo_forecast'
    );
    try {
      const cacheKey = `om_forecast:${cellKey}:${snapshot.location.timezone}`;
      const cached = getCachedExternal<Record<string, unknown>>(store, cacheKey);
      let data: Record<string, unknown>;
      let cacheStatus: 'live' | 'cache' = 'live';
      let cacheAgeMinutes: number | null = null;

      if (cached.hit) {
        data = cached.data;
        cacheStatus = 'cache';
        cacheAgeMinutes = cached.ageMinutes;
      } else {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration&timezone=${tz}&forecast_days=7`;
        const resp = await fetchWithRetry(url, 8500, 1);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        data = (await resp.json()) as Record<string, unknown>;
        setCachedExternal(store, cacheKey, data, 30);
      }

      const cur = (data.current ?? {}) as Record<string, number | string>;
      const daily = (data.daily ?? {}) as Record<string, Array<number | string>>;
      const tmaxArr = Array.isArray(daily.temperature_2m_max) ? (daily.temperature_2m_max as number[]) : [];
      const tminArr = Array.isArray(daily.temperature_2m_min) ? (daily.temperature_2m_min as number[]) : [];
      const precipArr = Array.isArray(daily.precipitation_sum) ? (daily.precipitation_sum as number[]) : [];
      const et0Arr = Array.isArray(daily.et0_fao_evapotranspiration)
        ? (daily.et0_fao_evapotranspiration as number[])
        : [];

      currentWeather = {
        temperatureC: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null,
        humidityPct: typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null,
        windKmh: typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : null,
        precipitationMm: typeof cur.precipitation === 'number' ? cur.precipitation : null,
        validTime: typeof cur.time === 'string' ? cur.time : new Date().toISOString(),
        sourceLabel: 'Open-Meteo Modelled Current',
      };

      const meanT =
        tmaxArr.length > 0 && tminArr.length === tmaxArr.length
          ? Number(
              (
                tmaxArr.reduce((acc, v, i) => acc + (v + tminArr[i]) / 2, 0) / tmaxArr.length
              ).toFixed(1)
            )
          : null;
      forecast7d = {
        meanTempC: meanT,
        totalPrecipMm: Number(precipArr.reduce((s, v) => s + (v || 0), 0).toFixed(1)),
        totalEt0Mm:
          et0Arr.length > 0 ? Number(et0Arr.reduce((s, v) => s + (v || 0), 0).toFixed(1)) : null,
        period: 'Next 7 days (NWP forecast)',
        sourceLabel: 'Open-Meteo 7-day Forecast',
      };

      connectorsUsed.push({
        id: 'open_meteo_forecast',
        name: 'Open-Meteo Forecast API',
        status: cacheStatus === 'cache' ? 'cached' : 'success',
        cacheAgeMinutes,
        provenanceLabel: 'Modelled current & 7-day forecast',
        variables: ['temperature_2m', 'relative_humidity_2m', 'precipitation_sum', 'et0_fao_evapotranspiration'],
        period: 'Current + 7 days',
        note:
          cacheStatus === 'cache'
            ? `Served from cache (${cacheAgeMinutes} min old); short-range NWP only.`
            : 'Fetched live short-range NWP context.',
      });

      finishEvent(evForecast, 'complete', {
        cacheStatus,
        cacheAgeMinutes,
        label:
          cacheStatus === 'cache'
            ? `Open-Meteo forecast (cached · ${cacheAgeMinutes}m ago)`
            : 'Open-Meteo current & 7-day forecast',
      });
    } catch (err) {
      connectorsUsed.push({
        id: 'open_meteo_forecast',
        name: 'Open-Meteo Forecast API',
        status: 'failed',
        provenanceLabel: 'Request failed',
        variables: [],
        note: err instanceof Error ? err.message : 'Forecast endpoint unreachable.',
      });
      finishEvent(evForecast, 'partial', {
        errorCode: 'OPEN_METEO_FORECAST_ERR',
        detail: 'Forecast unavailable; continuing with historical climate series.',
      });
    }

    if (checkCancelled()) {
      job.state = 'cancelled';
      job.completedAt = new Date().toISOString();
      updateJobStatus(store, job);
      return;
    }

    // 2b. Open-Meteo ERA5 Historical Archive (6 full years for quantiles, GDD & ET0)
    const endArchive = new Date(Date.now() - 6 * 86400000);
    const startArchive = new Date(endArchive.getFullYear() - 6, 0, 1);
    const startArchStr = startArchive.toISOString().slice(0, 10);
    const endArchStr = endArchive.toISOString().slice(0, 10);

    const evArchive = startStage(
      'retrieve_evidence',
      'Open-Meteo Historical Archive (ERA5 reanalysis)',
      `Daily series ${startArchStr} to ${endArchStr}`,
      s2.eventId,
      'open_meteo_archive'
    );
    try {
      const cacheKey = `om_archive:${cellKey}:${startArchStr}:${endArchStr}`;
      const cached = getCachedExternal<Record<string, unknown>>(store, cacheKey);
      let data: Record<string, unknown>;
      let cacheStatus: 'live' | 'cache' = 'live';
      let cacheAgeMinutes: number | null = null;

      if (cached.hit) {
        data = cached.data;
        cacheStatus = 'cache';
        cacheAgeMinutes = cached.ageMinutes;
      } else {
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startArchStr}&end_date=${endArchStr}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration&timezone=${tz}`;
        const resp = await fetchWithRetry(url, 12000, 1);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        data = (await resp.json()) as Record<string, unknown>;
        setCachedExternal(store, cacheKey, data, 720);
      }

      const daily = (data.daily ?? {}) as Record<string, Array<number | string | null>>;
      const dates = Array.isArray(daily.time) ? (daily.time as string[]) : [];
      const tmax = Array.isArray(daily.temperature_2m_max) ? (daily.temperature_2m_max as Array<number | null>) : [];
      const tmin = Array.isArray(daily.temperature_2m_min) ? (daily.temperature_2m_min as Array<number | null>) : [];
      const tmean = Array.isArray(daily.temperature_2m_mean) ? (daily.temperature_2m_mean as Array<number | null>) : [];
      const prec = Array.isArray(daily.precipitation_sum) ? (daily.precipitation_sum as Array<number | null>) : [];
      const et0 = Array.isArray(daily.et0_fao_evapotranspiration)
        ? (daily.et0_fao_evapotranspiration as Array<number | null>)
        : [];

      historicalSeries = dates.map((d, i) => ({
        date: d,
        tmaxC: tmax[i] ?? null,
        tminC: tmin[i] ?? null,
        tmeanC: tmean[i] ?? null,
        precipMm: prec[i] ?? null,
        et0Mm: et0[i] ?? null,
      }));

      connectorsUsed.push({
        id: 'open_meteo_archive',
        name: 'Open-Meteo Historical Weather API',
        status: cacheStatus === 'cache' ? 'cached' : 'success',
        cacheAgeMinutes,
        provenanceLabel: 'ERA5 Reanalysis (not a local weather-station observation)',
        variables: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'et0_fao_evapotranspiration'],
        period: `${startArchStr} to ${endArchStr}`,
        note: `${historicalSeries.length} daily reanalysis points retrieved.`,
      });

      finishEvent(evArchive, 'complete', {
        cacheStatus,
        cacheAgeMinutes,
        label:
          cacheStatus === 'cache'
            ? `Open-Meteo ERA5 archive (cached · ${cacheAgeMinutes}m ago)`
            : `Open-Meteo ERA5 historical daily (${historicalSeries.length} days)`,
      });
    } catch (err) {
      connectorsUsed.push({
        id: 'open_meteo_archive',
        name: 'Open-Meteo Historical Weather API',
        status: 'failed',
        provenanceLabel: 'Reanalysis request failed',
        variables: [],
        note: err instanceof Error ? err.message : 'Archive API unreachable.',
      });
      finishEvent(evArchive, 'partial', {
        errorCode: 'OPEN_METEO_ARCHIVE_ERR',
        detail: 'ERA5 archive unavailable; falling back to NASA POWER daily where available.',
      });
    }

    if (checkCancelled()) {
      job.state = 'cancelled';
      job.completedAt = new Date().toISOString();
      updateJobStatus(store, job);
      return;
    }

    // 2c. NASA POWER Daily Point API (UTC, last 3 full years)
    const nasaEnd = new Date(Date.now() - 10 * 86400000);
    const nasaStart = new Date(nasaEnd.getFullYear() - 3, nasaEnd.getMonth(), nasaEnd.getDate());
    const nasaStartCompact = nasaStart.toISOString().slice(0, 10).replace(/-/g, '');
    const nasaEndCompact = nasaEnd.toISOString().slice(0, 10).replace(/-/g, '');

    const evPower = startStage(
      'retrieve_evidence',
      'NASA POWER Daily Agro-Climate API (UTC)',
      `0.5° grid daily meteorological & solar series (${nasaStartCompact}–${nasaEndCompact})`,
      s2.eventId,
      'nasa_power_daily'
    );
    try {
      const cacheKey = `nasa_power_daily:${cellKey}:${nasaStartCompact}:${nasaEndCompact}`;
      const cached = getCachedExternal<Record<string, unknown>>(store, cacheKey);
      let data: Record<string, unknown>;
      let cacheStatus: 'live' | 'cache' = 'live';
      let cacheAgeMinutes: number | null = null;

      if (cached.hit) {
        data = cached.data;
        cacheStatus = 'cache';
        cacheAgeMinutes = cached.ageMinutes;
      } else {
        const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${nasaStartCompact}&end=${nasaEndCompact}&time-standard=UTC&format=JSON`;
        const resp = await fetchWithRetry(url, 13000, 1);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        data = (await resp.json()) as Record<string, unknown>;
        setCachedExternal(store, cacheKey, data, 720);
      }

      const props = (data.properties ?? {}) as { parameter?: Record<string, Record<string, number>> };
      const param = props.parameter ?? {};
      const t2mMap = param.T2M ?? {};
      const tmaxMap = param.T2M_MAX ?? {};
      const tminMap = param.T2M_MIN ?? {};
      const precMap = param.PRECTOTCORR ?? {};
      const swMap = param.ALLSKY_SFC_SW_DWN ?? {};
      const rhMap = param.RH2M ?? {};

      const cleanVal = (v: number | undefined): number | null =>
        typeof v === 'number' && v > -900 && Number.isFinite(v) ? v : null;

      let rhSum = 0;
      let rhCount = 0;
      let swSum = 0;
      let swCount = 0;

      nasaSeries = Object.keys(t2mMap)
        .sort()
        .map((ymd) => {
          const isoDate = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
          const rh = cleanVal(rhMap[ymd]);
          const sw = cleanVal(swMap[ymd]);
          if (rh !== null) {
            rhSum += rh;
            rhCount++;
          }
          if (sw !== null) {
            swSum += sw;
            swCount++;
          }
          return {
            date: isoDate,
            tmeanC: cleanVal(t2mMap[ymd]),
            tmaxC: cleanVal(tmaxMap[ymd]),
            tminC: cleanVal(tminMap[ymd]),
            precipMm: cleanVal(precMap[ymd]),
            solarMjM2: sw,
            rhPct: rh,
          };
        });

      nasaMeanRh = rhCount > 0 ? Number((rhSum / rhCount).toFixed(1)) : null;
      nasaMeanSolar = swCount > 0 ? Number((swSum / swCount).toFixed(2)) : null;

      connectorsUsed.push({
        id: 'nasa_power_daily',
        name: 'NASA POWER Daily API (UTC)',
        status: cacheStatus === 'cache' ? 'cached' : 'success',
        cacheAgeMinutes,
        provenanceLabel: 'NASA POWER Daily (0.5° MERRA-2/CERES grid, UTC)',
        variables: ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'ALLSKY_SFC_SW_DWN', 'RH2M'],
        period: `${nasaStartCompact} to ${nasaEndCompact}`,
        note: `${nasaSeries.length} UTC daily records retrieved.`,
      });

      finishEvent(evPower, 'complete', {
        cacheStatus,
        cacheAgeMinutes,
        label:
          cacheStatus === 'cache'
            ? `NASA POWER daily UTC (cached · ${cacheAgeMinutes}m ago)`
            : `NASA POWER daily UTC (${nasaSeries.length} days)`,
      });
    } catch (err) {
      connectorsUsed.push({
        id: 'nasa_power_daily',
        name: 'NASA POWER Daily API (UTC)',
        status: 'failed',
        provenanceLabel: 'NASA POWER request failed',
        variables: [],
        note: err instanceof Error ? err.message : 'NASA POWER daily endpoint unreachable.',
      });
      finishEvent(evPower, 'partial', {
        errorCode: 'NASA_POWER_DAILY_ERR',
        detail: 'NASA POWER daily unavailable; ERA5 archive covers primary climate metrics.',
      });
    }

    // 2d. ISRIC SoilGrids (Honest skipped status per spec §6.2 & §17)
    const evSoil = startStage(
      'retrieve_evidence',
      'ISRIC SoilGrids mapped soil prior',
      'Paused upstream by ISRIC; skipped honestly without faking live status',
      s2.eventId,
      'isric_soilgrids'
    );
    connectorsUsed.push({
      id: 'isric_soilgrids',
      name: 'ISRIC SoilGrids REST',
      status: 'unavailable',
      provenanceLabel: 'Unavailable — paused upstream (not queried)',
      variables: [],
      note: 'SoilGrids REST service paused upstream; farmer soil feel & lab tests used instead.',
    });
    finishEvent(evSoil, 'skipped', {
      cacheStatus: 'not_requested',
      detail: 'Skipped — SoilGrids REST API paused upstream.',
    });

    const anyClimateRetrieved = historicalSeries.length > 0 || nasaSeries.length > 0;
    finishEvent(s2, anyClimateRetrieved ? 'complete' : 'partial');

    if (checkCancelled()) {
      job.state = 'cancelled';
      job.completedAt = new Date().toISOString();
      updateJobStatus(store, job);
      return;
    }

    // ------------------------------------------------------------------------
    // Stage 3: Prepare climate & water features
    // ------------------------------------------------------------------------
    const s3 = startStage(
      'prepare_features',
      'Calculating climate & water metrics',
      'Extracting thermal time, weather extremes, and effective rainfall.'
    );

    const s3a = startStage(
      'prepare_features',
      'Computed GDD (base 10°C), frost days & heat extremes',
      `Analyzed ${historicalSeries.length || nasaSeries.length} daily records across recent seasons`,
      s3.eventId
    );
    const primarySeries = historicalSeries.length > 0 ? historicalSeries : nasaSeries;
    const histFeatures = extractDailyClimateFeatures(primarySeries);
    const nasaFeatures = extractDailyClimateFeatures(nasaSeries);

    const evidence: EnvironmentalEvidenceSummary = {
      sourceCoverageId: `cov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      retrievedAt: new Date().toISOString(),
      spatialResolutionNote:
        snapshot.geometry.geometryStatus === 'polygon_verified' && (snapshot.geometry.geodesicAreaHa ?? 0) < 50
          ? `Field area (${snapshot.geometry.geodesicAreaHa?.toFixed(2)} ha) is smaller than ERA5 (~11 km) & NASA POWER (0.5°) grid cells; weather/climate metrics represent regional grid context.`
          : 'ERA5 (~11 km) and NASA POWER (0.5°) represent regional meteorological grid cells.',
      connectors: connectorsUsed,
      currentWeather,
      forecast7d,
      historicalClimate:
        historicalSeries.length > 0
          ? {
              yearsCovered: histFeatures.yearsCovered,
              sampleDays: histFeatures.sampleDays,
              period: `${startArchStr} to ${endArchStr}`,
              meanAnnualTempC: histFeatures.meanTempC,
              meanAnnualPrecipMm: histFeatures.meanAnnualPrecipMm,
              meanAnnualEt0Mm: histFeatures.meanAnnualEt0Mm,
              frostDaysPerYear: histFeatures.frostDaysPerYear,
              heatDaysOver35PerYear: histFeatures.heatDaysOver35PerYear,
              maxDrySpellDays: histFeatures.maxDrySpellDays,
              gddBase10Annual: histFeatures.gddBase10Annual,
              dryTypicalWetYears: histFeatures.dryTypicalWetYears,
              sourceLabel: 'Open-Meteo ERA5 Historical Reanalysis',
            }
          : null,
      nasaPowerDaily:
        nasaSeries.length > 0
          ? {
              sampleDays: nasaFeatures.sampleDays,
              period: `${nasaStartCompact} to ${nasaEndCompact}`,
              meanTempC: nasaFeatures.meanTempC,
              meanPrecipMmDay:
                nasaFeatures.meanAnnualPrecipMm !== null
                  ? Number((nasaFeatures.meanAnnualPrecipMm / 365).toFixed(2))
                  : null,
              meanSolarMjM2Day: nasaMeanSolar,
              meanRhPct: nasaMeanRh,
              gddBase10Period: nasaFeatures.gddBase10Annual,
              sourceLabel: 'NASA POWER Daily Point API (UTC)',
            }
          : null,
    };
    finishEvent(s3a, 'complete', {
      detail:
        histFeatures.gddBase10Annual !== null
          ? `Mean ${histFeatures.meanTempC ?? '—'}°C · ${histFeatures.gddBase10Annual} GDD/yr · ${histFeatures.meanAnnualPrecipMm ?? '—'} mm rain/yr`
          : `Analyzed ${primarySeries.length} daily samples`,
    });

    const s3b = startStage(
      'prepare_features',
      'Calculated USDA-SCS effective rainfall (Peff) vs. ET0',
      'Checking water balance and field evidence coverage.',
      s3.eventId
    );
    finishEvent(s3b, snapshot.evidenceCoverageGrade === 'Strong evidence' ? 'complete' : 'partial', {
      detail: `Evidence coverage: ${snapshot.evidenceCoverageGrade}`,
    });
    finishEvent(s3, 'complete');

    // ------------------------------------------------------------------------
    // Stage 4: Deterministic crop suitability & rotation sequence screening
    // ------------------------------------------------------------------------
    const s4 = startStage(
      'generate_sequences',
      'Calculating plant requirements & crop rotations',
      'Evaluating crop thresholds, botanical family breaks, and field priorities.'
    );
    const s4a = startStage(
      'generate_sequences',
      'Calculated plant temperature, GDD, pH & water requirements',
      `Running agronomic formulas (${QUESTIONNAIRE_ENGINE_VERSION})`,
      s4.eventId
    );
    const result = evaluateSnapshotAssessment(snapshot, evidence);
    const feasibleCropCount = result.cropSuitability.filter((c) => c.status !== 'infeasible').length;
    finishEvent(s4a, 'complete', {
      detail: `${feasibleCropCount}/${result.cropSuitability.length} crops passed thermal, soil & water checks`,
    });

    const s4b = startStage(
      'generate_sequences',
      'Screened botanical family breaks & sequence rules',
      'Checking multi-season crop diversity and recent crop history.',
      s4.eventId
    );
    finishEvent(s4b, 'complete', {
      detail: `${result.candidateSequences.length} feasible rotation sequence(s) built`,
    });

    const s4c = startStage(
      'generate_sequences',
      'Ranked crop rotations using field priority weights',
      'Ordering candidate plans without overriding hard limits.',
      s4.eventId
    );
    const bestSeq = result.candidateSequences[0];
    finishEvent(s4c, 'complete', {
      detail: bestSeq ? `Top match: ${bestSeq.title} (${bestSeq.matchScore}/100)` : 'No feasible sequence matched all constraints',
    });
    finishEvent(s4, 'complete');

    // ------------------------------------------------------------------------
    // Stage 5: Save immutable snapshot & update portfolio
    // ------------------------------------------------------------------------
    const s5 = startStage(
      'save_snapshot',
      'Organizing crop structure & saving profile',
      'Building final rotation summary and syncing field records.'
    );
    const s5a = startStage(
      'save_snapshot',
      'Organized crop plans & water summary',
      `Prepared ${result.candidateSequences.length} structured plan(s) for Rotation Planner`,
      s5.eventId
    );
    const latestStore = readStore();
    latestStore.results[snapshot.inputSnapshotId] = result;
    if (latestStore.drafts[snapshot.questionnaireId]) {
      latestStore.drafts[snapshot.questionnaireId].status = 'completed';
      latestStore.drafts[snapshot.questionnaireId].updatedAt = new Date().toISOString();
    }
    finishEvent(s5a, 'complete');

    const s5b = startStage(
      'save_snapshot',
      'Saved verified snapshot to My Farms & Maps',
      `Synced ${snapshot.farmName} · ${snapshot.fieldName}`,
      s5.eventId
    );
    syncSnapshotToPortfolioAndMaps(snapshot, result);
    finishEvent(s5b, 'complete');

    finishEvent(s5, 'complete');

    const completedAt = new Date().toISOString();
    job.state = anyClimateRetrieved ? 'complete' : 'partial';
    job.completedAt = completedAt;
    job.totalDurationMs = Math.max(1, Date.parse(completedAt) - Date.parse(job.startedAt));
    job.result = result;
    latestStore.jobs[job.jobId] = job;
    writeStore(latestStore);
    getJobEmitter(job.jobId).emit('message', { type: 'job_update', job });
  } catch (err) {
    const failedAt = new Date().toISOString();
    job.state = 'failed';
    job.completedAt = failedAt;
    job.totalDurationMs = Math.max(1, Date.parse(failedAt) - Date.parse(job.startedAt));
    job.errorMessage = err instanceof Error ? err.message : 'Unexpected assessment execution error.';
    updateJobStatus(readStore(), job);
  }
}

// ============================================================================
// Express Router Factory
// ============================================================================

export function createQuestionnaireRouter(): express.Router {
  const router = express.Router();

  // 1. Versioned schema & connector registry
  router.get('/questionnaires/rotation/v1', (_req, res) => {
    res.json({
      schemaVersion: QUESTIONNAIRE_SCHEMA_VERSION,
      engineVersion: QUESTIONNAIRE_ENGINE_VERSION,
      cropKnowledgeVersion: QUESTIONNAIRE_CROP_KB_VERSION,
      questionCount: QUESTION_CATALOGUE.length,
      connectors: CONNECTOR_REGISTRY,
    });
  });

  // 2. Geocoding search proxy (Open-Meteo Geocoding primary + Nominatim fallback)
  router.get('/locations/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      res.status(400).json({ error: 'Enter at least 2 characters to search for a place.' });
      return;
    }

    const candidates: GeocodedLocationCandidate[] = [];
    try {
      const omUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
      const resp = await fetchWithRetry(omUrl, 7500, 1);
      if (resp.ok) {
        const json = (await resp.json()) as {
          results?: Array<{
            id: number;
            name: string;
            latitude: number;
            longitude: number;
            elevation?: number;
            country?: string;
            admin1?: string;
            admin2?: string;
            timezone?: string;
          }>;
        };
        if (Array.isArray(json.results)) {
          for (const item of json.results) {
            const adminParts = [item.admin2, item.admin1, item.country].filter(Boolean);
            candidates.push({
              id: `om_${item.id}`,
              name: item.name,
              displayName: [item.name, ...adminParts].join(', '),
              lat: Number(item.latitude.toFixed(5)),
              lon: Number(item.longitude.toFixed(5)),
              country: item.country || 'Unspecified',
              adminArea: [item.admin2, item.admin1].filter(Boolean).join(', '),
              timezone: item.timezone || 'UTC',
              elevationM: typeof item.elevation === 'number' ? Math.round(item.elevation) : null,
              provider: 'open_meteo_geocoding',
            });
          }
        }
      }
    } catch {
      // Fall through to Nominatim fallback
    }

    if (candidates.length === 0) {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`;
        const resp = await fetch(nomUrl, {
          headers: { Accept: 'application/json', 'User-Agent': 'FieldShift-Agricultural-App/1.0' },
          signal: AbortSignal.timeout(7000),
        });
        if (resp.ok) {
          const arr = (await resp.json()) as Array<{
            place_id: number;
            display_name: string;
            lat: string;
            lon: string;
            address?: { country?: string; state?: string; county?: string };
          }>;
          for (const item of arr) {
            candidates.push({
              id: `nom_${item.place_id}`,
              name: item.display_name.split(',')[0],
              displayName: item.display_name,
              lat: Number(Number(item.lat).toFixed(5)),
              lon: Number(Number(item.lon).toFixed(5)),
              country: item.address?.country || 'Unspecified',
              adminArea: [item.address?.county, item.address?.state].filter(Boolean).join(', '),
              timezone: 'UTC',
              elevationM: null,
              provider: 'nominatim_osm',
            });
          }
        }
      } catch {
        // Ignore
      }
    }

    res.json({ query: q, candidates });
  });

  // 3. Resolve IANA timezone & elevation for manual pins or browser GPS
  router.get('/locations/timezone', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      res.status(400).json({ error: 'Valid latitude and longitude required.' });
      return;
    }
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=1&daily=temperature_2m_max`;
      const resp = await fetchWithRetry(url, 7000, 1);
      if (resp.ok) {
        const data = (await resp.json()) as { timezone?: string; elevation?: number };
        res.json({
          lat,
          lon,
          timezone: data.timezone || 'UTC',
          elevationM: typeof data.elevation === 'number' ? Math.round(data.elevation) : null,
          provider: 'open_meteo_forecast_metadata',
        });
        return;
      }
    } catch {
      // fallback
    }
    res.json({ lat, lon, timezone: 'UTC', elevationM: null, provider: 'fallback_utc' });
  });

  // 4. Create or resume questionnaire draft
  router.post('/rotation-questionnaires', (req, res) => {
    const draft = req.body as QuestionnaireDraft;
    if (!draft || typeof draft.questionnaireId !== 'string') {
      res.status(400).json({ error: 'Valid questionnaire draft object required.' });
      return;
    }
    const store = readStore();
    const saved: QuestionnaireDraft = {
      ...draft,
      serverSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.drafts[saved.questionnaireId] = saved;
    writeStore(store);
    res.status(201).json({ draft: saved, syncedAt: saved.serverSyncedAt });
  });

  router.get('/rotation-questionnaires/:id', (req, res) => {
    const store = readStore();
    const draft = store.drafts[req.params.id];
    if (!draft) {
      res.status(404).json({ error: 'Questionnaire draft not found.' });
      return;
    }
    res.json({ draft });
  });

  // 5. Autosave individual question answer (and location/geometry/consent updates)
  router.put('/rotation-questionnaires/:id/answers/:questionId', (req, res) => {
    const store = readStore();
    const body = req.body as {
      draft?: QuestionnaireDraft;
      answer?: CanonicalAnswer;
      expectedVersion?: number;
    };
    const existing = store.drafts[req.params.id];
    const now = new Date().toISOString();

    if (body.draft) {
      const nextDraft: QuestionnaireDraft = {
        ...body.draft,
        questionnaireId: req.params.id,
        profileVersion: (existing?.profileVersion ?? body.draft.profileVersion ?? 1) + (body.answer ? 1 : 0),
        serverSyncedAt: now,
        updatedAt: now,
      };
      if (body.answer) {
        nextDraft.answers = {
          ...nextDraft.answers,
          [req.params.questionId]: {
            ...body.answer,
            updatedAt: now,
          },
        };
      }
      store.drafts[req.params.id] = nextDraft;
      writeStore(store);
      res.json({ draft: nextDraft, syncedAt: now });
      return;
    }

    if (!existing || !body.answer) {
      res.status(400).json({ error: 'Missing questionnaire draft or answer payload.' });
      return;
    }

    existing.answers[req.params.questionId] = { ...body.answer, updatedAt: now };
    existing.profileVersion += 1;
    existing.serverSyncedAt = now;
    existing.updatedAt = now;
    store.drafts[req.params.id] = existing;
    writeStore(store);
    res.json({ draft: existing, syncedAt: now });
  });

  // 6. Validate field boundary polygon
  router.post('/fields/:fieldId/geometry/validate', (req, res) => {
    const schema = z.object({
      polygon: z.object({
        type: z.literal('Polygon'),
        coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
      }),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid GeoJSON Polygon payload.' });
      return;
    }
    const result = validateAndMeasurePolygon(parsed.data.polygon.coordinates as LonLat[][]);
    if (!result.ok) {
      res.status(422).json({ error: result.error });
      return;
    }
    res.json({
      fieldId: req.params.fieldId,
      crs: 'EPSG:4326',
      areaMethod: 'WGS84 Spherical Excess (Chamberlain-Duquette)',
      ...result,
    });
  });

  // 7. Create immutable review snapshot
  router.post('/rotation-questionnaires/:id/review', (req, res) => {
    const store = readStore();
    const draftPayload = (req.body?.draft as QuestionnaireDraft | undefined) || store.drafts[req.params.id];
    if (!draftPayload) {
      res.status(404).json({ error: 'Questionnaire draft not found.' });
      return;
    }
    store.drafts[req.params.id] = draftPayload;
    const snapshot = buildImmutableSnapshot(draftPayload, draftPayload.profileVersion);
    store.snapshots[snapshot.inputSnapshotId] = snapshot;
    writeStore(store);
    res.json({ snapshot });
  });

  // 8. Save profile & exit (completes questionnaire and persists farm/field without running remote analysis)
  router.post('/rotation-questionnaires/:id/save-profile', (req, res) => {
    const store = readStore();
    const draftPayload = (req.body?.draft as QuestionnaireDraft | undefined) || store.drafts[req.params.id];
    if (!draftPayload) {
      res.status(404).json({ error: 'Questionnaire draft not found.' });
      return;
    }
    const completedDraft: QuestionnaireDraft = {
      ...draftPayload,
      status: 'completed',
      updatedAt: new Date().toISOString(),
    };
    const snapshot = buildImmutableSnapshot(completedDraft, completedDraft.profileVersion);
    store.drafts[req.params.id] = completedDraft;
    store.snapshots[snapshot.inputSnapshotId] = snapshot;
    writeStore(store);
    syncSnapshotToPortfolioAndMaps(snapshot, null);
    res.json({ snapshot, farmId: snapshot.farmId, fieldId: snapshot.fieldId });
  });

  // 9. Submit assessment job (idempotent)
  router.post('/rotation-assessments', (req, res) => {
    const schema = z.object({
      questionnaireId: z.string().min(1),
      inputSnapshotId: z.string().min(1),
      idempotencyKey: z.string().min(4),
      draft: z.unknown().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid assessment submission payload.' });
      return;
    }

    const store = readStore();
    const existingJobId = store.idempotencyIndex[parsed.data.idempotencyKey];
    if (existingJobId && store.jobs[existingJobId]) {
      res.status(202).json({ job: store.jobs[existingJobId], deduplicated: true });
      return;
    }

    let snapshot = store.snapshots[parsed.data.inputSnapshotId];
    if (!snapshot && parsed.data.draft) {
      const d = parsed.data.draft as QuestionnaireDraft;
      snapshot = buildImmutableSnapshot(d, d.profileVersion);
      store.snapshots[snapshot.inputSnapshotId] = snapshot;
    }
    if (!snapshot) {
      res.status(404).json({ error: 'Input snapshot not found. Please review inputs first.' });
      return;
    }
    if (!snapshot.canRunAssessment) {
      res.status(422).json({
        error: 'Required inputs or remote-data consent are incomplete.',
        blockers: snapshot.missingDataGaps.filter((g) => g.impactGroup === 'blocks_calculation'),
      });
      return;
    }

    const now = new Date().toISOString();
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const job: AssessmentJobRecord = {
      jobId,
      questionnaireId: snapshot.questionnaireId,
      inputSnapshotId: snapshot.inputSnapshotId,
      farmId: snapshot.farmId,
      fieldId: snapshot.fieldId,
      farmName: snapshot.farmName,
      fieldName: snapshot.fieldName,
      idempotencyKey: parsed.data.idempotencyKey,
      correlationId: `corr_${Date.now().toString(36)}`,
      state: 'queued',
      currentStageKey: 'validate_inputs',
      startedAt: now,
      completedAt: null,
      totalDurationMs: null,
      cancelRequested: false,
      events: [],
      result: null,
    };

    store.jobs[jobId] = job;
    store.idempotencyIndex[parsed.data.idempotencyKey] = jobId;
    writeStore(store);

    // Fire durable background run
    setTimeout(() => {
      void runAssessmentJobAsync(jobId, snapshot);
    }, 30);

    res.status(202).json({ job, deduplicated: false });
  });

  // 10. Read job status & snapshot
  router.get('/rotation-assessments/:jobId', (req, res) => {
    const store = readStore();
    const job = store.jobs[req.params.jobId];
    if (!job) {
      res.status(404).json({ error: 'Assessment job not found.' });
      return;
    }
    res.json({ job });
  });

  // 11. SSE live progress stream
  router.get('/rotation-assessments/:jobId/events', (req, res) => {
    const store = readStore();
    const job = store.jobs[req.params.jobId];
    if (!job) {
      res.status(404).json({ error: 'Assessment job not found.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendPacket = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // Replay current state & events immediately so reconnects never miss history
    sendPacket({ type: 'snapshot', job });

    if (job.state === 'complete' || job.state === 'partial' || job.state === 'failed' || job.state === 'cancelled') {
      res.end();
      return;
    }

    const emitter = getJobEmitter(job.jobId);
    const onMsg = (msg: { type: string; job?: AssessmentJobRecord }) => {
      sendPacket(msg);
      const st = msg.job?.state;
      if (st === 'complete' || st === 'partial' || st === 'failed' || st === 'cancelled') {
        cleanup();
        res.end();
      }
    };
    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    const cleanup = () => {
      clearInterval(keepAlive);
      emitter.off('message', onMsg);
    };

    emitter.on('message', onMsg);
    req.on('close', cleanup);
  });

  // 12. Best-effort cancellation
  router.post('/rotation-assessments/:jobId/cancel', (req, res) => {
    const store = readStore();
    const job = store.jobs[req.params.jobId];
    if (!job) {
      res.status(404).json({ error: 'Assessment job not found.' });
      return;
    }
    job.cancelRequested = true;
    if (job.state === 'queued' || job.state === 'running') {
      job.state = 'cancelled';
      job.completedAt = new Date().toISOString();
    }
    store.jobs[job.jobId] = job;
    writeStore(store);
    getJobEmitter(job.jobId).emit('message', { type: 'job_update', job });
    res.json({ job });
  });

  // 13. Retrieve immutable input snapshot & assessment result
  router.get('/rotation-input-snapshots/:snapshotId', (req, res) => {
    const store = readStore();
    const snapshot = store.snapshots[req.params.snapshotId];
    if (!snapshot) {
      res.status(404).json({ error: 'Input snapshot not found.' });
      return;
    }
    res.json({
      snapshot,
      result: store.results[req.params.snapshotId] ?? null,
    });
  });

  return router;
}
