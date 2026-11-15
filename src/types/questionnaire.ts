import { GeoJsonPolygonGeometry } from './maps';

export type QuestionnaireMode = 'create' | 'edit';

export type AnswerProvenanceType =
  | 'farmer_reported'
  | 'farmer_confirmed'
  | 'dataset_estimate'
  | 'lab_result'
  | 'derived'
  | 'ai_interpreted_pending_confirmation'
  | 'unknown'
  | 'not_applicable'
  | 'skipped';

export type AnswerScope = 'farm' | 'field' | 'subfield' | 'season_occurrence';

export type QuestionnaireStageKey =
  | 'field'
  | 'soil'
  | 'water'
  | 'history'
  | 'planning'
  | 'constraints'
  | 'priorities'
  | 'review';

export type GeometryStatus = 'polygon_verified' | 'location_only' | 'none';

export type LocationMethod =
  | 'saved_location'
  | 'geocoded_search'
  | 'browser_gps_confirmed'
  | 'manual_pin'
  | 'manual_coordinates';

export interface CanonicalAnswer<T = unknown> {
  answerId: string;
  questionId: string;
  questionVersion: number;
  farmId: string;
  fieldId: string;
  questionnaireId: string;
  profileVersion: number;
  value: T;
  unit?: string;
  scope: AnswerScope;
  sourceType: AnswerProvenanceType;
  sourceName?: string;
  sourceProduct?: string;
  sourceUrl?: string;
  validTime?: string;
  retrievedAt?: string;
  confirmedAt?: string;
  depth?: string;
  spatialBasis?: string;
  cropStage?: string;
  qualityFlags?: string[];
  confidenceNote?: string;
  notes?: string;
  stale?: boolean;
  staleReason?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ConfirmedLocationRecord {
  locationMethod: LocationMethod;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  timezone: string;
  elevationM?: number | null;
  country?: string;
  adminArea?: string;
  placeLabel: string;
  geocoderProvider?: string;
  confirmedByUser: boolean;
  confirmedAt: string;
  locationVersion: number;
  spatialPrecisionLabel: 'field_pin' | 'town_region_context';
}

export interface FieldGeometryRecord {
  geometryStatus: GeometryStatus;
  polygon: GeoJsonPolygonGeometry | null;
  geodesicAreaHa: number | null;
  perimeterM: number | null;
  centroid: { lat: number; lon: number } | null;
  areaMethod: 'WGS84 Spherical Excess (Chamberlain-Duquette)' | null;
  crs: 'EPSG:4326';
  geometryVersion: number;
  multiplePlotsNote?: string;
  treatAsDistinctFields?: boolean;
}

export interface SoilPhRecord {
  status: 'measured' | 'not_measured' | 'unknown';
  value: number | null;
  method: string;
  sampleDate: string;
  depthValue: number | null;
  depthUnit: 'cm' | 'in';
  labRef?: string;
}

export interface SoilEcRecord {
  status: 'measured' | 'not_measured' | 'unknown';
  value: number | null;
  unit: 'dS/m' | 'mS/cm' | 'uS/cm';
  extractMethod: '1:1' | '1:2' | '1:5' | 'saturated_paste' | 'probe' | 'unknown';
  sampleDate: string;
  depthValue: number | null;
  depthUnit: 'cm' | 'in';
}

export interface SoilOrganicRecord {
  status: 'measured' | 'not_measured' | 'unknown';
  kind: 'organic_matter' | 'organic_carbon';
  value: number | null;
  unit: '%' | 'g/kg';
  method: string;
  sampleDate: string;
  depthValue: number | null;
  depthUnit: 'cm' | 'in';
}

export interface NutrientTestEntry {
  nutrient: 'N' | 'P' | 'K' | 'Other';
  form: string;
  value: number | null;
  unit: 'ppm' | 'mg/kg' | 'kg/ha' | 'lbs/ac' | '%';
  method: string;
  sampleDate: string;
  depthValue: number | null;
  depthUnit: 'cm' | 'in';
}

export interface SoilLimitationItem {
  code:
    | 'shallow_soil'
    | 'hardpan_compaction'
    | 'steep_slope'
    | 'erosion_prone'
    | 'rocky_stony'
    | 'saline_patch'
    | 'low_lying_wet';
  severity: 'mild' | 'moderate' | 'severe';
  scope: 'whole_field' | 'specific_zone';
  zoneNote?: string;
}

export interface IrrigationRoutineRecord {
  frequencyType: 'every_n_days' | 'weekly' | 'stage_dependent' | 'only_when_needed' | 'unknown';
  everyNDays?: number | null;
  preferredTimeOfDay: 'early_morning' | 'evening' | 'night' | 'midday' | 'varies' | 'unknown';
  naturalLanguageNote?: string;
  effectiveDate: string;
  lastConfirmedDate: string;
  isRoutineOnly: true; // Never treated as actual applied water event
}

export interface IrrigationApplicationEstimate {
  status: 'known' | 'not_measured' | 'varies';
  mode: 'mm' | 'm3' | 'litres' | 'flow_and_duration';
  value: number | null;
  flowRate?: number | null;
  flowUnit?: 'L/s' | 'L/min' | 'm3/h' | 'gpm';
  durationHours?: number | null;
}

export interface WaterQualityRecord {
  status:
    | 'no_known_issue'
    | 'some_salinity_concern'
    | 'known_high_salinity'
    | 'other_quality_issue'
    | 'tested_with_lab_results'
    | 'unknown';
  ecValue: number | null;
  ecUnit: 'dS/m' | 'uS/cm' | 'mS/cm';
  tdsPpm: number | null;
  testDate: string;
  method: string;
  note?: string;
}

export interface SeasonalWaterLimitRecord {
  status: 'yes_known' | 'yes_unknown_amount' | 'no_fixed_limit' | 'unknown';
  amount: number | null;
  unit: 'm3' | 'L' | 'mm' | 'hours_at_flow';
  period: 'per_day' | 'per_week' | 'per_season' | 'per_year';
  scope: 'this_field' | 'whole_farm';
  flowRateM3PerHour?: number | null;
}

export interface CropHistorySeasonRecord {
  id: string;
  cropId: string;
  cropName: string;
  botanicalFamily: string;
  seasonYear: number;
  seasonLabel: string;
  plantingMonth?: string;
  harvestMonth?: string;
  status: 'planted' | 'harvested' | 'failed' | 'abandoned';
  areaSharePct: number;
  sourceType: AnswerProvenanceType;
  yieldNote?: string;
}

export interface CurrentCropRecord {
  status: 'no' | 'yes' | 'recently_harvested' | 'preparing' | 'unknown';
  cropId?: string;
  cropName?: string;
  plantingDate?: string;
  dateApproximate?: boolean;
  currentStage?: string;
  stageSource?: 'farmer_observed' | 'externally_estimated';
  expectedHarvestWindow?: string;
  confirmationSource?: AnswerProvenanceType;
}

export interface PestDiseaseRecord {
  id: string;
  cropId: string;
  cropName: string;
  problemName: string;
  seasonYear: string;
  affectedZone: 'whole_field' | 'specific_zone';
  zoneNote?: string;
  sourceType: AnswerProvenanceType;
}

export interface YieldHistoryRecord {
  id: string;
  cropId: string;
  cropName: string;
  seasonYear: number;
  quantity: number;
  unit: 'kg' | 'tonnes' | 'tonnes/ha' | 'kg/ha' | 'bu/ac';
  areaBasisHa: number | null;
  sourceType: AnswerProvenanceType;
}

export type PriorityPresetId =
  | 'save_water'
  | 'rebuild_soil'
  | 'handle_weather'
  | 'balanced'
  | 'prioritise_suitability'
  | 'prioritise_productivity'
  | 'custom';

export interface PriorityVectorRaw {
  presetId: PriorityPresetId;
  waterEfficiency: number;
  soilImprovement: number;
  climateResilience: number;
  cropSuitability: number;
  productivityPotential: number;
}

export interface NormalizedPriorityVector {
  waterEfficiency: number;
  soilImprovement: number;
  climateResilience: number;
  cropSuitability: number;
  productivityPotential: number;
}

export interface ConsentRecord {
  consentId: string;
  acceptedRemoteFetch: boolean;
  policyScope: 'approved_sources_only';
  sharedScopeDescription: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export type QuestionnaireExperienceMode = 'simple' | 'refinement' | 'advanced';

export interface QuestionnaireDraft {
  questionnaireId: string;
  schemaVersion: 1;
  profileVersion: number;
  mode: QuestionnaireMode;
  setupIntent?: 'new_farm' | 'new_field_existing_farm';
  experienceMode?: QuestionnaireExperienceMode;
  refinementQuestionIds?: string[];
  status: 'in_progress' | 'completed' | 'abandoned';
  farmId: string;
  fieldId: string;
  currentQuestionId: string;
  visitedQuestionIds: string[];
  answers: Record<string, CanonicalAnswer>;
  location: ConfirmedLocationRecord | null;
  geometry: FieldGeometryRecord;
  consent: ConsentRecord;
  serverSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeocodedLocationCandidate {
  id: string;
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  country: string;
  adminArea: string;
  timezone: string;
  elevationM: number | null;
  provider: 'open_meteo_geocoding' | 'nominatim_osm';
}

export interface ExternalConnectorInfo {
  id: string;
  name: string;
  role: string;
  status: 'operational' | 'unavailable_paused' | 'not_configured';
  resolution: string;
  provenanceLabel: string;
  note: string;
}

export interface EnvironmentalEvidenceSummary {
  sourceCoverageId: string;
  retrievedAt: string;
  spatialResolutionNote: string;
  connectors: Array<{
    id: string;
    name: string;
    status: 'success' | 'cached' | 'partial' | 'unavailable' | 'failed';
    cacheAgeMinutes?: number | null;
    provenanceLabel: string;
    variables: string[];
    period?: string;
    note: string;
  }>;
  currentWeather?: {
    temperatureC: number | null;
    humidityPct: number | null;
    windKmh: number | null;
    precipitationMm: number | null;
    validTime: string;
    sourceLabel: string;
  } | null;
  forecast7d?: {
    meanTempC: number | null;
    totalPrecipMm: number | null;
    totalEt0Mm: number | null;
    period: string;
    sourceLabel: string;
  } | null;
  historicalClimate?: {
    yearsCovered: number;
    sampleDays: number;
    period: string;
    meanAnnualTempC: number | null;
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
    sourceLabel: string;
  } | null;
  nasaPowerDaily?: {
    sampleDays: number;
    period: string;
    meanTempC: number | null;
    meanPrecipMmDay: number | null;
    meanSolarMjM2Day: number | null;
    meanRhPct: number | null;
    gddBase10Period: number | null;
    sourceLabel: string;
  } | null;
}

export interface MissingDataGapItem {
  id: string;
  questionId?: string;
  label: string;
  impactGroup:
    | 'blocks_calculation'
    | 'reduces_coverage'
    | 'not_applicable'
    | 'source_unavailable'
    | 'needs_confirmation';
  explanation: string;
  howToResolve: string;
}

export interface ReviewRowItem {
  questionId: string;
  groupKey:
    | 'farm_field'
    | 'location_boundary'
    | 'soil_land'
    | 'water_irrigation'
    | 'crop_history'
    | 'planning_horizon'
    | 'constraints'
    | 'management'
    | 'priorities_risk';
  label: string;
  valueDisplay: string;
  unit?: string;
  scope: AnswerScope;
  sourceBadge:
    | 'You provided'
    | 'Farmer-confirmed'
    | 'Dataset estimate'
    | 'Lab result'
    | 'Derived'
    | 'Skipped'
    | 'Unknown'
    | 'Not applicable'
    | 'AI-interpreted — needs confirmation';
  dateLabel?: string;
  warning?: string;
}

export interface ImmutableInputSnapshot {
  inputSnapshotId: string;
  questionnaireId: string;
  schemaVersion: 1;
  inputVersion: number;
  farmId: string;
  fieldId: string;
  farmName: string;
  fieldName: string;
  createdAt: string;
  location: ConfirmedLocationRecord | null;
  geometry: FieldGeometryRecord;
  declaredAreaHa: number | null;
  normalizedPriorities: NormalizedPriorityVector;
  priorityPresetId: PriorityPresetId;
  consent: ConsentRecord;
  answers: Record<string, CanonicalAnswer>;
  reviewRows: ReviewRowItem[];
  missingDataGaps: MissingDataGapItem[];
  canRunAssessment: boolean;
  evidenceCoverageGrade: 'Strong evidence' | 'Some gaps' | 'Limited evidence';
  inputHash: string;
}

export type JobStageState =
  | 'pending'
  | 'running'
  | 'complete'
  | 'partial'
  | 'skipped'
  | 'failed'
  | 'cancelled'
  | 'retrying';

export interface AssessmentJobEvent {
  eventId: string;
  jobId: string;
  stageKey:
    | 'validate_inputs'
    | 'retrieve_evidence'
    | 'prepare_features'
    | 'generate_sequences'
    | 'save_snapshot';
  parentEventId?: string | null;
  label: string;
  detail?: string;
  state: JobStageState;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  sourceId?: string;
  cacheStatus?: 'live' | 'cache' | 'unavailable' | 'not_requested';
  cacheAgeMinutes?: number | null;
  attempt?: number;
  errorCode?: string;
  timestamp: string;
  correlationId: string;
}

export interface AssessmentResultBundle {
  snapshotId: string;
  farmId: string;
  fieldId: string;
  farmName: string;
  fieldName: string;
  engineVersion: string;
  cropKnowledgeVersion: string;
  evidenceCoverageGrade: 'Strong evidence' | 'Some gaps' | 'Limited evidence';
  evidenceCoverageReasons: string[];
  evidence: EnvironmentalEvidenceSummary;
  waterCalculationSummary: {
    et0Method: string;
    et0MmPeriod: number | null;
    effectiveRainMethod: string;
    effectiveRainMmPeriod: number | null;
    irrigationActualMm: number | null;
    irrigationRoutineNote: string | null;
    waterBalanceStatus: 'computed_partial' | 'routine_context_only' | 'unavailable';
    limitationNote: string;
  };
  cropSuitability: Array<{
    cropId: string;
    cropName: string;
    botanicalFamily: string;
    status: 'eligible' | 'caution' | 'infeasible' | 'excluded';
    suitabilityScore: number | null;
    coverageGrade: 'Strong evidence' | 'Some gaps' | 'Limited evidence';
    hardGateFailure?: string;
    limitingFactor: string;
  }>;
  candidateSequences: Array<{
    id: string;
    title: string;
    cropIds: string[];
    cropNames: string[];
    matchScore: number;
    evidenceGrade: 'Strong evidence' | 'Some gaps' | 'Limited evidence';
    waterNote: string;
    soilNote: string;
    tieBreakNote: string;
  }>;
  rejectedSequences: Array<{
    title: string;
    failedRule: string;
  }>;
  noFeasibleCandidateReason?: string;
  generatedAt: string;
}

export interface AssessmentJobRecord {
  jobId: string;
  questionnaireId: string;
  inputSnapshotId: string;
  farmId: string;
  fieldId: string;
  farmName: string;
  fieldName: string;
  idempotencyKey: string;
  correlationId: string;
  state:
    | 'queued'
    | 'running'
    | 'complete'
    | 'partial'
    | 'failed'
    | 'retrying'
    | 'cancelled';
  currentStageKey: AssessmentJobEvent['stageKey'];
  startedAt: string;
  completedAt: string | null;
  totalDurationMs: number | null;
  cancelRequested: boolean;
  events: AssessmentJobEvent[];
  result: AssessmentResultBundle | null;
  errorMessage?: string;
}
