import { register } from 'node:module';

// Register lightweight ESM hook so Node/tsx can import Vite static assets & CSS cleanly
const assetLoaderSource = `
export async function load(url, context, nextLoad) {
  if (/\\.(jpg|jpeg|png|webp|svg|gif|css)$/i.test(url)) {
    return { format: 'module', shortCircuit: true, source: 'export default "asset-stub";' };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript;base64,${Buffer.from(assetLoaderSource).toString('base64')}`);

// Minimal browser global shim for SSR React rendering under Node
const memStore = new Map<string, string>();
const storageShim = {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => {
    memStore.set(k, v);
  },
  removeItem: (k: string) => {
    memStore.delete(k);
  },
  clear: () => memStore.clear(),
  key: (i: number) => Array.from(memStore.keys())[i] ?? null,
  get length() {
    return memStore.size;
  },
};
(globalThis as Record<string, unknown>).localStorage = storageShim;
if (typeof (globalThis as Record<string, unknown>).navigator === 'undefined') {
  (globalThis as Record<string, unknown>).navigator = {
    userAgent: 'Mozilla/5.0 (Node SSR)',
    platform: 'Linux',
  };
}
(globalThis as Record<string, unknown>).document = {
  documentElement: { style: {} },
  createElement: () => ({
    style: {},
    setAttribute: () => undefined,
    getContext: () => null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
  getElementsByTagName: () => [],
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};
(globalThis as Record<string, unknown>).window = {
  localStorage: storageShim,
  document: (globalThis as Record<string, unknown>).document,
  navigator: (globalThis as Record<string, unknown>).navigator,
  devicePixelRatio: 1,
  screen: { width: 1440, height: 900 },
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  scrollTo: () => undefined,
  setTimeout: globalThis.setTimeout,
  print: () => undefined,
  location: { pathname: '/' },
};
if (typeof (globalThis as Record<string, unknown>).CustomEvent === 'undefined') {
  (globalThis as Record<string, unknown>).CustomEvent = class CustomEvent {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
}

let passed = 0;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${msg}\n  Expected: ${String(expected)}\n  Actual:   ${String(actual)}`
    );
  }
}

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed++;
  console.log(`PASS: ${name}`);
}

async function run(): Promise<void> {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { MemoryRouter } = await import('react-router-dom');
  const fs = await import('node:fs');

  const { resolveEffectiveFieldSoil, normalizeSoilMoistureUnit } =
    await import('../src/lib/soilProvenance');
  const { generateDeterministicFarmAnalysis } = await import('../src/lib/farmAnalysisEngine');
  const { createEmptyFarmProfile } = await import('../src/lib/farmStorage');
  const { buildFieldAgronomyBundle } = await import('../src/lib/fieldAgronomyEngine');
  const { buildAssessedFarmRecord } = await import('../src/lib/myFarmsEngine');
  const {
    buildRealFarmFields,
    computeRealFarmHealth,
    evaluateRealFarmAlerts,
  } = await import('../src/lib/homeFarmEvaluator');
  const {
    buildInitialRotationDraft,
    runRotationPlannerEngine,
  } = await import('../src/lib/rotationPlannerEngine');
  const { buildRotationPlanPdfBytes } = await import('../src/lib/rotationPdfExport');
  const { buildFieldIntelligenceViewModel } = await import(
    '../src/components/myFarms/fieldDashboard/fieldDashboardModel'
  );
  const { WaterIrrigationCard } = await import(
    '../src/components/myFarms/fieldDashboard/WaterIrrigationCard'
  );
  const { SoilCropInfoCard } = await import(
    '../src/components/myFarms/fieldDashboard/SoilCropInfoCard'
  );
  const { SoilCropInfoView } = await import(
    '../src/components/myFarms/fieldDashboard/subcategories/SoilCropInfoView'
  );
  const { WaterIrrigationView } = await import(
    '../src/components/myFarms/fieldDashboard/subcategories/WaterIrrigationView'
  );
  const { FarmQuestionnaire } = await import('../src/components/farmAnalysis/FarmQuestionnaire');
  const {
    buildAddFarmSubmissionPayload,
    createFreshBlankDraft,
    hydrateAddFarmDraft,
  } = await import('../src/components/myFarms/AddFarmWizardModal');
  const {
    buildSnapshotCreationPayload,
    formatSnapshotHistoricalContext,
  } = await import('../src/components/myFarms/FarmDetailWorkspace');
  const { PlanDecisionJournal } = await import('../src/components/myFarms/PlanDecisionJournal');
  const { mapFarmProfilesToRotationFarms, Rotation: RotationPage } = await import('../src/pages/Rotation');
  const {
    applyFieldSelectionToDraft,
    buildGeminiExplainPayload,
    PlanDetailEvidenceModal,
  } = await import('../src/components/rotation/RotationModals');
  const { HomeHealthBreakdownList } = await import('../src/pages/Landing');

  type ServerRawFarmDto = import('../src/lib/myFarmsEngine').ServerRawFarmDto;
  type PortfolioFieldRecord = import('../src/types/myFarms').PortfolioFieldRecord;
  type SavedFarmSnapshot = import('../src/types/myFarms').SavedFarmSnapshot;
  type ExtendedFieldWeatherResult = import('../src/services/weather').ExtendedFieldWeatherResult;
  type LiveWeatherReading = import('../src/services/weather').LiveWeatherReading;
  type PowerClimateResult = import('../src/types').PowerClimateResult;

  const makeLiveWeather = (precip24hMm = 0): LiveWeatherReading => ({
    tempC: 22.0,
    tempHighC: 25.0,
    tempLowC: 13.0,
    humidityPct: 54,
    humidityDeltaPct: 0,
    windKmh: 12.6,
    windDirCompass: 'NW',
    precipMm: precip24hMm,
    precip24hMm,
    weatherCode: 1,
    conditionLabel: 'Mainly clear',
    observedAt: '2026-11-15T06:00:00Z',
    isDay: true,
    humiditySeries: [54],
    windSeries: [12.6],
  });

  const makeWeather = (): ExtendedFieldWeatherResult => ({
    lat: 38.5449,
    lon: -121.7405,
    gridLat: 38.55,
    gridLon: -121.75,
    elevationM: 120,
    timezone: 'UTC',
    timezoneAbbreviation: 'UTC',
    retrievedAt: '2026-11-15T06:00:00Z',
    providerName: 'Open-Meteo Regression',
    spatialResolutionNote: 'Test grid',
    current: {
      time: '2026-11-15T06:00',
      tempC: 22.4,
      apparentTempC: 21.8,
      humidityPct: 54,
      precipMm: 0,
      windKmh: 12.6,
      gustKmh: 18.0,
      windDirCompass: 'NW',
      surfacePressureHpa: 1014,
      weatherCode: 1,
      conditionLabel: 'Mainly clear',
    },
    next24hHourly: [],
    pastDaily: [],
    forecastDaily: Array.from({ length: 7 }, (_, i) => ({
      date: `2026-11-${String(15 + i).padStart(2, '0')}`,
      dayLabel: `Day ${i + 1}`,
      isForecast: true,
      weatherCode: 1,
      conditionLabel: 'Mainly clear',
      tMaxC: 26,
      tMinC: 14,
      precipSumMm: 0,
      precipProbMaxPct: 10,
      windMaxKmh: 15,
      gustMaxKmh: 22,
      windDirDeg: 315,
      solarMjM2: 18,
      et0FaoMm: 4.5,
    })),
  });

  const makeNasaRecent = (): PowerClimateResult => ({
    lat: 38.5449,
    lon: -121.7405,
    targetDate: '2026-11-14',
    yearsAnalyzed: [2026],
    datasetName: 'NASA POWER Regression',
    endpointUrl: 'https://power.larc.nasa.gov/api/temporal/daily/point',
    fetchedAt: '2026-11-15T06:00:00Z',
    meanMaxC: 25.2,
    meanMinC: 13.8,
    meanTempC: 19.5,
    meanPrecipMm: 0.4,
    meanWindMs: 2.8,
    meanHumidityPct: 58,
    meanSolarKwhM2: 4.86,
    yearlySummaries: [],
    windowDays: Array.from({ length: 14 }, (_, idx) => ({
      date: `2026-11-${String(1 + idx).padStart(2, '0')}`,
      year: 2026,
      doy: 305 + idx,
      tMeanC: 19.5,
      tMaxC: 25.0,
      tMinC: 14.0,
      precipMm: 0.0,
      windMs: 2.8,
      humidityPct: 58,
      solarKwhM2: 4.86,
    })),
  });

  const makeRawFarm = (soilOverrides: Partial<ServerRawFarmDto['soil']> = {}): ServerRawFarmDto => ({
    id: 'farm-s1a',
    name: 'Stage 1A Regression Farm',
    primaryCrop: 'Wheat',
    locationLabel: 'Davis, CA',
    regionLabel: 'California',
    country: 'United States',
    timezone: 'UTC',
    centroid: { lat: 38.5449, lon: -121.7405 },
    geometry: null,
    areaUnit: 'hectares',
    declaredAreaHa: 30,
    mappedAreaHa: 30,
    perimeterM: 2200,
    hasBoundary: true,
    areaGapNote: null,
    hasFieldOverlapWarning: false,
    overlapWarningDetail: null,
    isPrivate: false,
    isDraft: false,
    archivedAt: null,
    notes: '',
    versionNumber: 1,
    activePlan: null,
    recommendedPlanId: null,
    recommendedPlanTitle: null,
    soil: {
      texture: 'Loam',
      moistureStatus: 'measured',
      moisturePct: 28,
      moistureUnit: 'volumetric_vwc',
      moistureDepth: '0-20 cm',
      moistureMethod: 'TDR Probe',
      moistureDate: '2026-11-14',
      phStatus: 'tested',
      phValue: 6.7,
      phTestDate: '2026-11-01',
      organicMatterPct: 2.8,
      drainage: 'Moderately',
      slopePct: 2,
      elevationM: 120,
      preparationMethods: [],
      notes: '',
      ...soilOverrides,
    } as ServerRawFarmDto['soil'],
    water: {
      sources: ['Groundwater / Well'],
      reliability: 'Always available',
      dailyCapacityKnown: true,
      dailyCapacityM3: 320,
      estimatedDailyDemandM3: 180,
      qualityTested: 'Yes',
      ecDsM: 0.7,
      salinityPpm: 448,
      qualityTestDate: '2026-11-01',
      wateringMethod: 'Artificial irrigation',
      irrigationMethod: 'Drip irrigation',
      irrigationFrequency: 'Every 2–3 days',
      rainfallFrequency: 'Rarely',
      demandAssumptionNote: '',
    },
    planningHorizon: 'Next 2–3 years',
    priorities: ['Water conservation', 'Soil health'],
    challenges: [],
    lastAssessedAt: '2026-11-14T10:00:00Z',
    suitabilityScore: 81,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-14T10:00:00Z',
  });

  const makeField = (
    id: string,
    name: string,
    overrides?: PortfolioFieldRecord['soilOverrides']
  ): PortfolioFieldRecord => ({
    id,
    farmId: 'farm-s1a',
    name,
    cropId: 'wheat',
    cropName: 'Wheat',
    previousCrops: ['Chickpea'],
    activeAlertsCount: 0,
    criticalAlert: null,
    status: 'Active',
    currentVersionId: 'gv-1',
    staleCalculations: [],
    rotationReviewDue: false,
    soilOverrides: overrides,
    versions: [],
    lastAssessedAt: '2026-11-14T10:00:00Z',
    updatedAt: '2026-11-14T10:00:00Z',
  });

  // 1. Soil Provenance End-to-End Pipeline
  await test('1. Soil provenance survives Wizard -> AssessedFarm -> Field overrides/suppressions -> Snapshot without silent VWC coercion', () => {
    const wizardDraft = {
      ...createFreshBlankDraft(),
      name: 'Pipeline Block',
      soilTexture: 'Sandy loam' as const,
      soilMoistureStatus: 'measured' as const,
      soilMoistureStr: '31',
      soilMoistureUnit: 'gravimetric' as const,
      soilMoistureDepth: '0-30 cm',
      soilMoistureMethod: 'Oven-dry gravimetric',
      soilMoistureDate: '2026-11-13',
      soilPhTested: true,
      soilPhStr: '6.9',
      soilPhTestDate: '2026-11-05',
    };
    const submitted = buildAddFarmSubmissionPayload(wizardDraft, {
      hasCoords: true,
      parsedLat: 38.54,
      parsedLon: -121.74,
      saveAsDraft: false,
    });
    const soilSub = submitted.soil as ServerRawFarmDto['soil'];
    assertEqual(soilSub.moistureUnit, 'gravimetric', 'Wizard submission preserves gravimetric unit');
    assertEqual(soilSub.moistureDepth, '0-30 cm', 'Wizard submission preserves depth');

    const farm = buildAssessedFarmRecord(makeRawFarm(soilSub), [], [], []);
    assertEqual(farm.soil.moistureUnit, 'gravimetric', 'Assessed farm retains gravimetric unit');

    // Field-level explicit suppression overrides farm-level measured data
    const suppressedField = makeField('f-sup', 'Suppressed Block', {
      texture: 'Unknown',
      moistureStatus: 'unknown',
      phStatus: 'not_tested',
    });
    const resolvedSup = resolveEffectiveFieldSoil(farm.soil, suppressedField.soilOverrides);
    assertEqual(resolvedSup.texture, 'Unknown', 'Suppression overrides farm texture');
    assertEqual(resolvedSup.textureSource, 'field_suppressed', 'Texture marked field_suppressed');
    assertEqual(resolvedSup.moistureStatus, 'unknown', 'Suppression overrides moistureStatus');
    assertEqual(resolvedSup.moisturePct, null, 'Suppression nulls moisturePct');
    assertEqual(resolvedSup.phValue, null, 'Suppression nulls phValue');

    // Field-level estimated override with independent metadata
    const estField = makeField('f-est', 'Estimated Block', {
      moistureStatus: 'estimated',
      moisturePct: 22,
      moistureUnit: 'unspecified',
      moistureMethod: 'Hand feel',
    });
    const resolvedEst = resolveEffectiveFieldSoil(farm.soil, estField.soilOverrides);
    assertEqual(resolvedEst.moistureStatus, 'estimated', 'Field estimated status overrides measured farm');
    assertEqual(resolvedEst.moistureUnit, 'unspecified', 'Field estimated unit stays unspecified');
    assert(!resolvedEst.isVwcCompatibleForBalance, 'Unspecified estimate excluded from VWC balance');

    // Legacy compatibility
    assertEqual(normalizeSoilMoistureUnit(undefined), 'unspecified', 'Missing legacy moistureUnit normalizes to unspecified');
    const legacyDraft = hydrateAddFarmDraft({ name: 'Legacy', soilMoistureKnown: true, soilMoistureStr: '24' });
    assertEqual(legacyDraft.soilMoistureStatus, 'measured', 'Legacy wizard draft hydrates known flag');
    assertEqual(legacyDraft.soilMoistureUnit, 'unspecified', 'Legacy wizard draft never assumes VWC');
    const legacyProfile = createEmptyFarmProfile('Legacy Profile');
    legacyProfile.soil.moistureStatus = 'measured';
    legacyProfile.soil.moisturePct = 27;
    delete legacyProfile.soil.moistureUnit;
    const legacyEffective = resolveEffectiveFieldSoil(legacyProfile.soil, undefined);
    assertEqual(legacyEffective.moistureUnit, 'unspecified', 'Legacy FarmProfile without moistureUnit defaults to unspecified');
  });

  // 2. Scientific Calculations: Unknown Texture vs Known FAO-56 Parity & VWC Compatibility
  await test('2. Scientific engines keep Unknown texture hydraulics null while preserving ET0/ETc & known-texture FAO-56 parity', () => {
    // Known Loam VWC
    const knownFarm = buildAssessedFarmRecord(makeRawFarm(), [], [], []);
    const knownField = makeField('f-known', 'Known Loam');
    const knownBundle = buildFieldAgronomyBundle({
      farm: knownFarm,
      field: knownField,
      fieldIndex: 0,
      liveWeather: makeLiveWeather(0),
      extendedWeather: makeWeather(),
      nasaRecent30: makeNasaRecent(),
      climateResult: null,
      eonetResult: null,
      irrigationLogs: [],
      tasks: [],
      observations: [],
      decisions: [],
    });
    assert(knownBundle.soil.fcVwcPct !== null && knownBundle.soil.wpVwcPct !== null, 'Known Loam computes FC/WP');
    assert(knownBundle.water.tawMm !== null && knownBundle.water.rawMm !== null, 'Known Loam computes TAW/RAW');
    assert(knownBundle.water.estimatedMoistureVwcPct !== null, 'volumetric_vwc TDR reading enters VWC balance');

    // Tensiometer / non-VWC reading must be excluded from VWC balance even on Loam
    const tensField = makeField('f-tens', 'Tensiometer Block', {
      moistureStatus: 'measured',
      moisturePct: 32,
      moistureUnit: 'volumetric_vwc',
      moistureMethod: 'Tensiometer',
    });
    const tensBundle = buildFieldAgronomyBundle({
      farm: knownFarm,
      field: tensField,
      fieldIndex: 0,
      liveWeather: makeLiveWeather(0),
      extendedWeather: makeWeather(),
      nasaRecent30: makeNasaRecent(),
      climateResult: null,
      eonetResult: null,
      irrigationLogs: [],
      tasks: [],
      observations: [],
      decisions: [],
    });
    const tensModel = buildFieldIntelligenceViewModel({
      farm: knownFarm,
      field: tensField,
      fieldIndex: 0,
      liveWeather: makeLiveWeather(0),
      tasks: [],
      observations: [],
      irrigationLogs: [],
    });
    assertEqual(tensModel.water.isVwcCompatibleForBalance, false, 'Tensiometer method excluded from VWC balance');
    assertEqual(tensModel.water.irrigationNeededMm, null, 'Incompatible moisture unit blocks VWC irrigation sizing');
    assert(Boolean(tensBundle.water.moistureUnitAmbiguityNote), 'Tensiometer unit ambiguity note is surfaced');
    assertEqual(tensBundle.water.observedMoisturePct, 32, 'Raw 32% preserved for display');

    // Unknown texture keeps ET0 & potential ETc while nulling TAW/RAW/FC/WP
    const unkFarm = buildAssessedFarmRecord(
      makeRawFarm({ texture: 'Unknown', moistureStatus: 'unknown', moisturePct: null }),
      [],
      [],
      []
    );
    const unkBundle = buildFieldAgronomyBundle({
      farm: unkFarm,
      field: makeField('f-unk', 'Unknown Texture Block'),
      fieldIndex: 0,
      liveWeather: makeLiveWeather(0),
      extendedWeather: makeWeather(),
      nasaRecent30: makeNasaRecent(),
      climateResult: null,
      eonetResult: null,
      irrigationLogs: [],
      tasks: [],
      observations: [],
      decisions: [],
    });
    assertEqual(unkBundle.soil.fcVwcPct, null, 'Unknown texture nulls fcVwcPct');
    assertEqual(unkBundle.water.tawMm, null, 'Unknown texture nulls tawMm');
    assertEqual(unkBundle.water.rawMm, null, 'Unknown texture nulls rawMm');
    assert(unkBundle.weather.et0TodayMm !== null && unkBundle.weather.et0TodayMm > 0, 'Unknown texture retains ET0');
    assert(unkBundle.water.etcPotentialMmDay !== null && unkBundle.water.etcPotentialMmDay > 0, 'Unknown texture retains potential ETc');

    // Farm analysis engine completeness vs caveats
    const analysisProfile = createEmptyFarmProfile('Regression Analysis Farm');
    analysisProfile.location.farmName = 'Regression Analysis Farm';
    analysisProfile.location.lat = 38.54;
    analysisProfile.location.lon = -121.74;
    analysisProfile.soil.moistureStatus = 'measured';
    analysisProfile.soil.moisturePct = 29;
    analysisProfile.soil.moistureUnit = 'unspecified';
    const report = generateDeterministicFarmAnalysis(analysisProfile, null, null);
    const moistureItem = report.sections.find((s) => s.key === 'A')?.items.find((i) => i.title.includes('29%'));
    assert(
      Boolean(moistureItem && moistureItem.detail.includes('cannot classify 29% as dry, moderate, or wet')),
      'FarmAnalysis keeps raw 29% without unsupported moderate threshold classification'
    );
  });

  // 3. Farm Health, Rotation, & No Synthetic Thresholds/Confidence
  await test('3. Farm health and rotation remove thresholds, fabricated defaults, and synthetic confidencePct while keeping ranking intact', () => {
    // Home evaluator: 17% moisture triggers NO universal moisture alert; untested soil becomes null component score
    const fp = createEmptyFarmProfile('Home Health Regression');
    fp.location.lat = 38.54;
    fp.location.lon = -121.74;
    fp.soil.texture = 'Loam';
    fp.soil.moistureStatus = 'measured';
    fp.soil.moisturePct = 17;
    fp.soil.moistureUnit = 'volumetric_vwc';
    fp.soil.phStatus = 'not_tested';
    fp.soil.phValue = null;
    const hFields = buildRealFarmFields(fp, makeLiveWeather(0), makeNasaRecent(), null);
    const hAlerts = evaluateRealFarmAlerts(fp, hFields, makeLiveWeather(0), makeNasaRecent(), null);
    assert(
      !hAlerts.some((a) => a.message.toLowerCase().includes('moisture')),
      'HomeFarmEvaluator raises no universal moisture threshold alert'
    );
    const health = computeRealFarmHealth(fp, hFields, makeLiveWeather(0), makeNasaRecent(), null, hAlerts);
    assertEqual(health.components[1].score, null, 'Untested pH produces null soil health score');
    const breakdownHtml = renderToStaticMarkup(
      React.createElement(HomeHealthBreakdownList, { components: health.components, isLight: false })
    );
    assert(breakdownHtml.includes('Unassessed') && !breakdownHtml.includes('null/100'), 'Landing renders Unassessed for null soil score');

    // Rotation mapping from blank profile produces no fabricated fallback
    const blankRotFarm = mapFarmProfilesToRotationFarms([createEmptyFarmProfile('Honest Blank')])[0];
    assertEqual(blankRotFarm.soil.texture, 'Unknown', 'Rotation mapper preserves Unknown texture');
    assertEqual(blankRotFarm.soil.moisturePct, null, 'Rotation mapper preserves null moisture');
    assertEqual(blankRotFarm.assessment.confidencePct, undefined, 'Assessed farm has no confidencePct');

    // Rotation engine & field switching + Gemini payload
    const fullFarm = buildAssessedFarmRecord(makeRawFarm(), [], [], []);
    const fieldA = makeField('f-a', 'Clay Field', {
      texture: 'Clay',
      moistureStatus: 'measured',
      moisturePct: 30,
      moistureUnit: 'volumetric_vwc',
      phStatus: 'tested',
      phValue: 7.2,
    });
    const fieldB = makeField('f-b', 'Suppressed Field', {
      texture: 'Unknown',
      moistureStatus: 'unknown',
      phStatus: 'not_tested',
    });
    const draft0 = buildInitialRotationDraft(fullFarm, [fieldA, fieldB], fieldA.id);
    assertEqual(draft0.soilTexture, 'Clay', 'Initial rotation draft picks up fieldA override');
    const draftSwitched = applyFieldSelectionToDraft(draft0, fullFarm, fieldB);
    assertEqual(draftSwitched.soilTexture, 'Unknown', 'Field switching applies explicit suppression');
    assertEqual(draftSwitched.soilMoisturePct, null, 'Field switching suppresses moisturePct');
    assertEqual(draftSwitched.soilPh, null, 'Field switching suppresses pH');

    const engineOut = runRotationPlannerEngine(fullFarm, [fieldA], draft0);
    assert(engineOut.candidates.length >= 2, 'Rotation planner generates ranked candidates');
    assertEqual(engineOut.candidates[0].confidencePct, undefined, 'Rotation candidate has no confidencePct');
    const geminiPayload = buildGeminiExplainPayload(engineOut, engineOut.candidates[0], draft0) as Record<string, unknown>;
    assert(!('confidencePct' in geminiPayload), 'Gemini payload omits confidencePct');
  });

  // 4. UI, Zero-vs-Unavailable, Legacy Snapshots, PDF Export, & Audit Regression Checks
  await test('4. UI renders zero leaks, distinguishes 0 from Unavailable, preserves legacy snapshots & PDF provenance, and passes source audit', () => {
    const farm = buildAssessedFarmRecord(
      makeRawFarm({ texture: 'Loam', moistureStatus: 'measured', moisturePct: 28, moistureUnit: 'volumetric_vwc' }),
      [],
      [],
      []
    );
    const field = makeField('f-zero', 'Zero Rain Block');

    // Genuine 0 mm rain / 0 mm irrigation vs Unavailable
    const zeroModel = buildFieldIntelligenceViewModel({
      farm,
      field,
      fieldIndex: 0,
      liveWeather: makeLiveWeather(0),
      tasks: [],
      observations: [],
      irrigationLogs: [],
    });
    assertEqual(zeroModel.water.effectiveRain7dMm, 0, 'Genuine 0 mm rain preserved');
    assertEqual(zeroModel.water.irrigationNeededMm, 0, 'Genuine 0 mm irrigation preserved');
    const waterCardHtml = renderToStaticMarkup(
      React.createElement(WaterIrrigationCard, {
        model: zeroModel,
        onViewDetails: () => undefined,
        onQuickLogIrrigation: () => undefined,
      })
    );
    assert(waterCardHtml.includes('0.0 mm') && !waterCardHtml.includes('Irrigation sizing unavailable'), 'Genuine 0.0 mm renders cleanly without Unavailable');

    // Unknown texture UI check (no NaN / undefined / null mm)
    const unkFarm = buildAssessedFarmRecord(
      makeRawFarm({ texture: 'Unknown', moistureStatus: 'unknown', moisturePct: null, phStatus: 'not_tested', phValue: null }),
      [],
      [],
      []
    );
    const unkModel = buildFieldIntelligenceViewModel({
      farm: unkFarm,
      field,
      fieldIndex: 0,
      liveWeather: null,
      tasks: [],
      observations: [],
      irrigationLogs: [],
    });
    const unkBundle = buildFieldAgronomyBundle({
      farm: unkFarm,
      field,
      fieldIndex: 0,
      liveWeather: null,
      extendedWeather: makeWeather(),
      nasaRecent30: makeNasaRecent(),
      climateResult: null,
      eonetResult: null,
      irrigationLogs: [],
      tasks: [],
      observations: [],
      decisions: [],
    });
    const soilCardHtml = renderToStaticMarkup(
      React.createElement(SoilCropInfoCard, { model: unkModel, onViewDetails: () => undefined })
    );
    const waterViewHtml = renderToStaticMarkup(
      React.createElement(WaterIrrigationView, {
        farm: unkFarm,
        fields: [field],
        selectedField: field,
        bundle: unkBundle,
        irrigationLogs: [],
        areaLabel: '10.0 ha',
        disclosureMode: 'simple',
        onChangeDisclosureMode: () => undefined,
        onInspectMetric: () => undefined,
        onAddIrrigation: async () => undefined,
        onOpenWaterConfigDrawer: () => undefined,
      })
    );
    const soilViewHtml = renderToStaticMarkup(
      React.createElement(SoilCropInfoView, {
        farm: unkFarm,
        fields: [field],
        selectedField: field,
        bundle: unkBundle,
        areaLabel: '10.0 ha',
        disclosureMode: 'simple',
        onChangeDisclosureMode: () => undefined,
        onInspectMetric: () => undefined,
        onPatchField: async () => undefined,
        onOpenSoilDrawer: () => undefined,
      })
    );

    for (const [name, html] of [
      ['SoilCropInfoCard', soilCardHtml],
      ['WaterIrrigationView', waterViewHtml],
      ['SoilCropInfoView', soilViewHtml],
    ]) {
      assert(!html.includes('NaN'), `${name} has zero NaN`);
      assert(!html.includes('undefined'), `${name} has zero undefined`);
      assert(!html.includes('null mm'), `${name} has zero null mm`);
    }

    // Legacy snapshot without soilContext must not assume VWC
    const legacySnap: SavedFarmSnapshot = {
      id: 'snap-old',
      farmId: farm.id,
      generatedAt: '2025-04-01T10:00:00Z',
      modelVersion: 'v1',
      triggerReason: 'Manual',
      suitabilityScore: 72,
      completenessPct: 75,
      weatherWindowSummary: 'Clear',
      dataAvailability: { nasaPower: 'available', openMeteo: 'available', nasaEonet: 'available', soilLab: 'measured' },
      keyMetrics: { meanTempC: 18, precipMmDay: 1, et0MmDay: 4, soilMoisturePct: 26, phValue: 6.4, mappedAreaHa: 30 },
      recommendations: [],
    };
    const legacyText = formatSnapshotHistoricalContext(legacySnap);
    assert(legacyText.includes('unit unrecorded (historical snapshot)'), 'Legacy snapshot preserves missing historical unit');

    // New snapshot builder omits confidencePct and preserves soilContext
    const newSnap = buildSnapshotCreationPayload({
      farm,
      selectedField: makeField('f-ctx', 'Method Block', {
        moistureStatus: 'measured',
        moisturePct: 29,
        moistureUnit: 'gravimetric',
        moistureDepth: '0-25 cm',
        moistureMethod: 'Gravimetric core',
      }),
      meanTemp: 19,
      precip: 4,
      weatherSummary: 'Dry',
      nasaAvail: 'available',
      meteoAvail: 'available',
      eonetAvail: 'available',
      hazardPenalty: 0,
    });
    assert(!('confidencePct' in newSnap), 'New snapshot payload contains no confidencePct');

    // Questionnaire no 35% prefill
    const qProfile = createEmptyFarmProfile('Q Check');
    qProfile.currentStage = 2;
    qProfile.soil.moistureStatus = 'measured';
    qProfile.soil.moisturePct = null;
    const qHtml = renderToStaticMarkup(
      React.createElement(FarmQuestionnaire, {
        profile: qProfile,
        onChange: () => undefined,
        onSaveProgress: () => undefined,
        onFinishToDashboard: () => undefined,
      })
    );
    assert(qHtml.includes('Not entered') && !qHtml.includes('35%'), 'Questionnaire shows Not entered without 35% prefill');

    // Decision journal & PDF export & Rotation page
    const journalHtml = renderToStaticMarkup(
      React.createElement(PlanDecisionJournal, {
        farm,
        fields: [field],
        decisions: [],
        onRecordDecision: async () => undefined,
      })
    );
    assert(!journalHtml.includes('Data confidence'), 'PlanDecisionJournal removes Data confidence');

    const draft = buildInitialRotationDraft(farm, [field]);
    const engine = runRotationPlannerEngine(farm, [field], draft);
    const modalHtml = renderToStaticMarkup(
      React.createElement(PlanDetailEvidenceModal, {
        open: true,
        plan: engine.candidates[0],
        engine,
        draft,
        onDownloadPdf: () => undefined,
        onRequestSave: () => undefined,
        onClose: () => undefined,
      })
    );
    assert(!modalHtml.includes('Evidence Confidence'), 'PlanDetailEvidenceModal removes Evidence Confidence');

    const pdfBytes = buildRotationPlanPdfBytes(engine, engine.candidates[0], draft);
    const pdfRaw = Buffer.from(pdfBytes).toString('latin1');
    const pdfLines = Array.from(pdfRaw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g))
      .map((m) => m[1].replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\'))
      .join(' ');
    assert(!pdfLines.includes('Evidence Confidence'), 'PDF export removes Evidence Confidence');
    assert(pdfLines.includes('Data Availability:') && pdfLines.includes('Soil Moisture & Provenance:'), 'PDF export retains provenance and availability');

    memStore.clear();
    memStore.set('anchor_farm_profiles_v1', JSON.stringify([createEmptyFarmProfile('Empty Rotation Farm')]));
    const rotHtml = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(RotationPage))
    );
    assert(!rotHtml.includes('Green Valley Farm') && !rotHtml.includes('Confidence:'), 'Rotation page renders real data honestly');

    // Static regression audit checks on key Stage 1A files
    const qSrc = fs.readFileSync('src/components/farmAnalysis/FarmQuestionnaire.tsx', 'utf8');
    const soilViewSrc = fs.readFileSync('src/components/myFarms/fieldDashboard/subcategories/SoilCropInfoView.tsx', 'utf8');
    assert(!qSrc.includes('?? 35'), 'Source audit: FarmQuestionnaire has no ?? 35 default');
    assert(soilViewSrc.includes('...existingOverrides'), 'Source audit: SoilCropInfoView preserves existing soilOverride metadata on save');
  });

  console.log(`\nALL STAGE 1A CONSOLIDATED TESTS PASSED: ${passed}/4`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
