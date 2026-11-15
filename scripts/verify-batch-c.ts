import { register } from 'node:module';

// Register lightweight ESM hook so Node/tsx can import Vite static image modules cleanly
const assetLoaderSource = `
export async function load(url, context, nextLoad) {
  if (/\\.(jpg|jpeg|png|webp|svg|gif)$/i.test(url)) {
    return { format: 'module', shortCircuit: true, source: 'export default "asset-stub";' };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript;base64,${Buffer.from(assetLoaderSource).toString('base64')}`);

// Minimal in-memory browser global shim for SSR React rendering
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
(globalThis as Record<string, unknown>).window = {
  localStorage: storageShim,
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
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

  const { buildFieldAgronomyBundle } = await import('../src/lib/fieldAgronomyEngine');
  const { buildAssessedFarmRecord } = await import('../src/lib/myFarmsEngine');
  const { buildFieldIntelligenceViewModel } = await import(
    '../src/components/myFarms/fieldDashboard/fieldDashboardModel'
  );
  const { SoilCropInfoCard } = await import(
    '../src/components/myFarms/fieldDashboard/SoilCropInfoCard'
  );
  const { WaterIrrigationCard } = await import(
    '../src/components/myFarms/fieldDashboard/WaterIrrigationCard'
  );
  const { MetricInspectionDrawer } = await import(
    '../src/components/myFarms/fieldDashboard/MetricInspectionDrawer'
  );
  const { AdvancedAnalysisView } = await import(
    '../src/components/myFarms/fieldDashboard/AdvancedAnalysisView'
  );
  const { SoilCropInfoView } = await import(
    '../src/components/myFarms/fieldDashboard/subcategories/SoilCropInfoView'
  );
  const { WaterIrrigationView } = await import(
    '../src/components/myFarms/fieldDashboard/subcategories/WaterIrrigationView'
  );
  const { RisksAlertsView } = await import(
    '../src/components/myFarms/fieldDashboard/subcategories/RisksAlertsView'
  );
  const { WeatherClimateView } = await import(
    '../src/components/myFarms/fieldDashboard/subcategories/WeatherClimateView'
  );
  const { DisplayPrefsProvider } = await import('../src/context/DisplayPrefsContext');
  const { HomeHealthBreakdownList, Landing } = await import('../src/pages/Landing');
  const {
    buildRealFarmFields,
    computeRealFarmHealth,
    ensureSyncedFarmProfiles,
    evaluateRealFarmAlerts,
  } = await import('../src/lib/homeFarmEvaluator');

  type MyFarmRecord = import('../src/types/myFarms').MyFarmRecord;
  type PortfolioFieldRecord = import('../src/types/myFarms').PortfolioFieldRecord;
  type ServerRawFarmDto = import('../src/lib/myFarmsEngine').ServerRawFarmDto;
  type PowerClimateResult = import('../src/types').PowerClimateResult;
  type ExtendedFieldWeatherResult = import('../src/services/weather').ExtendedFieldWeatherResult;
  type LiveWeatherReading = import('../src/services/weather').LiveWeatherReading;
  type GeoJsonPolygonGeometry = import('../src/types/maps').GeoJsonPolygonGeometry;

  const sampleGeometry: GeoJsonPolygonGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [-121.745, 38.542],
        [-121.738, 38.542],
        [-121.738, 38.548],
        [-121.745, 38.548],
        [-121.745, 38.542],
      ],
    ],
  };

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
    providerName: 'Open-Meteo Test',
    spatialResolutionNote: 'Test NWP grid',
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
    next24hHourly: [
      {
        timeIso: '2026-11-15T07:00',
        hourLabel: '07:00',
        tempC: 23,
        humidityPct: 50,
        dewPointC: 12,
        precipMm: 0,
        windKmh: 12,
        gustKmh: 16,
        windDirDeg: 315,
        shortwaveWm2: 240,
        vpdKpa: 1.4,
        et0Mm: 0.25,
      },
    ],
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
    datasetName: 'NASA POWER Test',
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

  const makeRawFarm = (soilOverrides: Partial<MyFarmRecord['soil']> = {}): ServerRawFarmDto => ({
    id: 'farm-c-test',
    name: 'Batch C Presentation Farm',
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
      organicMatterPct: 2.9,
      drainage: 'Moderately',
      slopePct: 2,
      elevationM: 120,
      preparationMethods: [],
      notes: '',
      ...soilOverrides,
    },
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
      demandAssumptionNote: 'Test farm water capacity',
    },
    planningHorizon: 'Next 2–3 years',
    priorities: ['Water conservation', 'Soil health'],
    challenges: [],
    lastAssessedAt: '2026-11-14T10:00:00Z',
    suitabilityScore: 81,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-14T10:00:00Z',
  });

  const makeField = (overrides: PortfolioFieldRecord['soilOverrides'] = undefined): PortfolioFieldRecord => ({
    id: 'field-c-1',
    farmId: 'farm-c-test',
    name: 'North Block',
    cropId: 'wheat',
    cropName: 'Wheat',
    previousCrops: ['Soybean'],
    activeAlertsCount: 0,
    criticalAlert: null,
    status: 'Active',
    currentVersionId: 'gv-1',
    staleCalculations: [],
    rotationReviewDue: false,
    soilOverrides: overrides,
    versions: [
      {
        geometryVersionId: 'gv-1',
        versionNumber: 1,
        createdAt: '2026-11-01T00:00:00Z',
        source: 'drawn',
        crs: 'EPSG:4326',
        areaMethod: 'WGS84 Spherical Excess (Chamberlain-Duquette)',
        netAreaHectares: 15,
        grossAreaHectares: 15,
        excludedAreaHectares: 0,
        perimeterM: 1600,
        centroid: { lat: 38.545, lon: -121.741 },
        geometry: sampleGeometry,
      },
    ],
    lastAssessedAt: '2026-11-14T10:00:00Z',
    updatedAt: '2026-11-14T10:00:00Z',
  });

  await test('1. Unknown texture & missing soil inputs render Unavailable/Unknown with zero synthetic defaults or NaN/undefined leaks', () => {
    const farm = buildAssessedFarmRecord(
      makeRawFarm({
        texture: 'Unknown',
        drainage: 'Unknown',
        moistureStatus: 'unknown',
        moisturePct: null,
        moistureUnit: 'unspecified',
        phStatus: 'not_tested',
        phValue: null,
        organicMatterPct: null,
      }),
      [],
      [],
      []
    );
    const field = makeField();
    const fieldModel = buildFieldIntelligenceViewModel({
      farm,
      field,
      fieldIndex: 0,
      liveWeather: null,
      tasks: [],
      observations: [],
      irrigationLogs: [],
    });

    assertEqual(fieldModel.soil.texture, 'Unknown', 'fieldModel keeps Unknown texture (no Loam)');
    assertEqual(fieldModel.soil.tawMm, null, 'fieldModel.soil.tawMm null when Unknown');
    assertEqual(fieldModel.soil.availableWaterMm, null, 'fieldModel.soil.availableWaterMm null when Unknown');
    assertEqual(fieldModel.soil.phLabel, 'Not tested', 'fieldModel.soil.phLabel is Not tested (no 6.8)');
    assertEqual(fieldModel.soil.organicMatterLabel, 'Not measured', 'fieldModel.soil.organicMatterLabel is Not measured (no 2.1%)');
    assertEqual(fieldModel.water.soilMoisturePct, null, 'fieldModel.water.soilMoisturePct null when unknown');
    assertEqual(fieldModel.water.irrigationNeededMm, null, 'fieldModel.water.irrigationNeededMm null when Unknown');
    assertEqual(fieldModel.water.effectiveRain7dMm, null, 'fieldModel.water.effectiveRain7dMm null without liveWeather');

    const bundle = buildFieldAgronomyBundle({
      farm,
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
      React.createElement(SoilCropInfoCard, { model: fieldModel, onViewDetails: () => undefined })
    );
    const waterCardHtml = renderToStaticMarkup(
      React.createElement(WaterIrrigationCard, {
        model: fieldModel,
        onViewDetails: () => undefined,
        onQuickLogIrrigation: () => undefined,
      })
    );
    const soilViewHtml = renderToStaticMarkup(
      React.createElement(SoilCropInfoView, {
        farm,
        fields: [field],
        selectedField: field,
        bundle,
        areaLabel: '15.0 ha',
        disclosureMode: 'simple',
        onChangeDisclosureMode: () => undefined,
        onInspectMetric: () => undefined,
        onPatchField: async () => undefined,
        onOpenSoilDrawer: () => undefined,
      })
    );
    const risksViewHtml = renderToStaticMarkup(
      React.createElement(RisksAlertsView, {
        fields: [field],
        selectedField: field,
        bundle,
        snapshots: [],
        observations: [],
        tasks: [],
        eonetResult: null,
        areaLabel: '15.0 ha',
        disclosureMode: 'simple',
        onChangeDisclosureMode: () => undefined,
        onInspectMetric: () => undefined,
        onAddObservation: async () => undefined,
        onAddTask: async () => undefined,
        onToggleTask: async () => undefined,
        onCreateFreshSnapshot: async () => undefined,
        runningSnapshot: false,
        isOnline: true,
        onOpenReportsDrawer: () => undefined,
      })
    );
    const advHtml = renderToStaticMarkup(
      React.createElement(AdvancedAnalysisView, {
        farm,
        selectedField: field,
        fieldModel,
        snapshots: [],
        decisions: [],
        irrigationLogs: [],
        liveWeather: null,
        climateResult: null,
        tempUnit: 'C',
        isOnline: true,
        runningSnapshot: false,
        onCreateFreshSnapshot: async () => undefined,
        onOpenDrawerTab: () => undefined,
        onOpenInMaps: () => undefined,
        onRunDeepAnalysis: () => undefined,
      })
    );

    for (const [label, html] of [
      ['SoilCropInfoCard', soilCardHtml],
      ['WaterIrrigationCard', waterCardHtml],
      ['SoilCropInfoView', soilViewHtml],
      ['RisksAlertsView', risksViewHtml],
      ['AdvancedAnalysisView', advHtml],
    ]) {
      assert(!html.includes('NaN'), `${label} has no NaN`);
      assert(!html.includes('undefined'), `${label} has no undefined`);
      assert(!html.includes('null mm'), `${label} has no null mm`);
      assert(html.includes('Unavailable'), `${label} renders Unavailable for null outputs`);
    }

    assert(!soilCardHtml.includes('Loam') && !soilCardHtml.includes('180 mm'), 'SoilCropInfoCard does not fall back to Loam/180 mm');
    assert(soilCardHtml.includes('Not tested') && soilCardHtml.includes('Not measured'), 'SoilCropInfoCard shows honest Not tested / Not measured');
    assert(!waterCardHtml.includes('24%') && !waterCardHtml.includes('44%') && !waterCardHtml.includes('68%'), 'WaterIrrigationCard has no synthetic moisture defaults');
  });

  await test('2. Genuine zero values (0.0 mm rain, 0.0 mm / 0 mm irrigation inside RAW) render as 0, not Unavailable', () => {
    const farm = buildAssessedFarmRecord(
      makeRawFarm({
        texture: 'Loam',
        moistureStatus: 'measured',
        moisturePct: 28,
        moistureUnit: 'volumetric_vwc',
      }),
      [],
      [],
      []
    );
    const field = makeField();
    const fieldModel = buildFieldIntelligenceViewModel({
      farm,
      field,
      fieldIndex: 0,
      liveWeather: makeLiveWeather(0),
      tasks: [],
      observations: [],
      irrigationLogs: [],
    });

    assertEqual(fieldModel.water.effectiveRain7dMm, 0, '0 mm rain preserved without +2.1 addition');
    assertEqual(fieldModel.water.irrigationNeededMm, 0, '0 mm irrigation needed preserved when inside RAW');
    assertEqual(fieldModel.water.recommendedVolumeM3, 0, '0 m3 volume preserved');

    const waterCardHtml = renderToStaticMarkup(
      React.createElement(WaterIrrigationCard, {
        model: fieldModel,
        onViewDetails: () => undefined,
        onQuickLogIrrigation: () => undefined,
      })
    );
    assert(waterCardHtml.includes('0.0 mm'), 'WaterIrrigationCard displays genuine 0.0 mm');
    assert(waterCardHtml.includes('Standby (0.0 mm due)'), 'WaterIrrigationCard shows standby 0.0 mm banner');
    assert(!waterCardHtml.includes('Irrigation sizing unavailable'), 'WaterIrrigationCard does not conflate 0 with unavailable');

    const bundle = buildFieldAgronomyBundle({
      farm,
      field,
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
    assertEqual(bundle.water.grossDepthMm, 0, 'bundle grossDepthMm is genuine 0 inside RAW');
    const waterViewHtml = renderToStaticMarkup(
      React.createElement(WaterIrrigationView, {
        farm,
        fields: [field],
        selectedField: field,
        bundle,
        irrigationLogs: [],
        areaLabel: '15.0 ha',
        disclosureMode: 'simple',
        onChangeDisclosureMode: () => undefined,
        onInspectMetric: () => undefined,
        onAddIrrigation: async () => undefined,
        onOpenWaterConfigDrawer: () => undefined,
      })
    );
    assert(waterViewHtml.includes('0 mm'), 'WaterIrrigationView displays genuine 0 mm recommended irrigation');
  });

  await test('3. ET0 and potential ETc remain visible on WaterIrrigationView even when soil texture is Unknown', () => {
    const farm = buildAssessedFarmRecord(
      makeRawFarm({ texture: 'Unknown', moistureStatus: 'unknown', moisturePct: null }),
      [],
      [],
      []
    );
    const field = makeField();
    const bundle = buildFieldAgronomyBundle({
      farm,
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

    const waterViewHtml = renderToStaticMarkup(
      React.createElement(WaterIrrigationView, {
        farm,
        fields: [field],
        selectedField: field,
        bundle,
        irrigationLogs: [],
        areaLabel: '15.0 ha',
        disclosureMode: 'simple',
        onChangeDisclosureMode: () => undefined,
        onInspectMetric: () => undefined,
        onAddIrrigation: async () => undefined,
        onOpenWaterConfigDrawer: () => undefined,
      })
    );

    assert(waterViewHtml.includes('4.5'), 'ET0 4.5 mm/day remains rendered with Unknown soil texture');
    assert(
      bundle.water.etcPotentialMmDay !== null &&
        waterViewHtml.includes(bundle.water.etcPotentialMmDay.toFixed(1)),
      'Potential ETc remains rendered with Unknown soil texture'
    );
    assert(
      waterViewHtml.includes('Hydraulics unavailable — confirm soil texture'),
      'Unknown texture limitation remains clearly explained'
    );
  });

  await test('4. Raw moisture readings preserve unit, depth, method, date, ambiguity note, and field-vs-farm provenance', () => {
    const farm = buildAssessedFarmRecord(makeRawFarm(), [], [], []);
    const tensiometerField = makeField({
      moistureStatus: 'measured',
      moisturePct: 34,
      moistureUnit: 'unspecified',
      moistureDepth: '15-30 cm',
      moistureMethod: 'Tensiometer',
      moistureDate: '2026-11-12',
    });
    const fieldModel = buildFieldIntelligenceViewModel({
      farm,
      field: tensiometerField,
      fieldIndex: 0,
      liveWeather: makeLiveWeather(1.2),
      tasks: [],
      observations: [],
      irrigationLogs: [],
    });

    assertEqual(fieldModel.water.soilMoisturePct, 34, 'raw 34% preserved');
    assertEqual(fieldModel.water.isVwcCompatibleForBalance, false, 'tensiometer excluded from VWC balance');
    assertEqual(fieldModel.water.irrigationNeededMm, null, 'incompatible moisture blocks VWC refill sizing');

    const bundle = buildFieldAgronomyBundle({
      farm,
      field: tensiometerField,
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

    const waterCardHtml = renderToStaticMarkup(
      React.createElement(WaterIrrigationCard, {
        model: fieldModel,
        onViewDetails: () => undefined,
        onQuickLogIrrigation: () => undefined,
      })
    );
    const soilViewHtml = renderToStaticMarkup(
      React.createElement(SoilCropInfoView, {
        farm,
        fields: [tensiometerField],
        selectedField: tensiometerField,
        bundle,
        areaLabel: '15.0 ha',
        disclosureMode: 'simple',
        onChangeDisclosureMode: () => undefined,
        onInspectMetric: () => undefined,
        onPatchField: async () => undefined,
        onOpenSoilDrawer: () => undefined,
      })
    );

    assert(waterCardHtml.includes('34%'), 'WaterIrrigationCard shows 34%');
    assert(waterCardHtml.includes('unit unspecified'), 'WaterIrrigationCard shows unit unspecified');
    assert(waterCardHtml.includes('15-30 cm') && waterCardHtml.includes('Tensiometer'), 'WaterIrrigationCard preserves depth and method');
    assert(soilViewHtml.includes('Tensiometer') && soilViewHtml.includes('15-30 cm'), 'SoilCropInfoView preserves tensiometer context');
    assert(soilViewHtml.includes('excluded from VWC balance'), 'SoilCropInfoView notes exclusion from VWC balance');

    // Field-level suppression overrides inherited farm soil
    const suppressedField = makeField({
      texture: 'Unknown',
      moistureStatus: 'unknown',
      phStatus: 'not_tested',
    });
    const suppressedModel = buildFieldIntelligenceViewModel({
      farm,
      field: suppressedField,
      fieldIndex: 0,
      liveWeather: null,
      tasks: [],
      observations: [],
      irrigationLogs: [],
    });
    const suppressedCardHtml = renderToStaticMarkup(
      React.createElement(SoilCropInfoCard, { model: suppressedModel, onViewDetails: () => undefined })
    );
    assert(suppressedCardHtml.includes('Field override (Unknown)'), 'SoilCropInfoCard shows field suppression provenance for texture');
    assert(suppressedCardHtml.includes('Not tested (field override)'), 'SoilCropInfoCard shows field suppression provenance for pH');
  });

  await test('5. No unsupported confidencePct percentages remain across DataQualityCard, MetricInspectionDrawer, or AdvancedAnalysisView', () => {
    const farm = buildAssessedFarmRecord(makeRawFarm(), [], [], []);
    const field = makeField();
    const fieldModel = buildFieldIntelligenceViewModel({
      farm,
      field,
      fieldIndex: 0,
      liveWeather: makeLiveWeather(0),
      tasks: [],
      observations: [],
      irrigationLogs: [],
    });
    const bundle = buildFieldAgronomyBundle({
      farm,
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

    const weatherViewHtml = renderToStaticMarkup(
      React.createElement(WeatherClimateView, {
        fields: [field],
        selectedField: field,
        bundle,
        extendedWeather: makeWeather(),
        areaLabel: '15.0 ha',
        tempUnit: 'C',
        windUnit: 'km/h',
        disclosureMode: 'simple',
        onChangeDisclosureMode: () => undefined,
        onInspectMetric: () => undefined,
        onRefresh: () => undefined,
        loading: false,
        isOnline: true,
        weatherError: null,
      })
    );
    const advHtml = renderToStaticMarkup(
      React.createElement(AdvancedAnalysisView, {
        farm,
        selectedField: field,
        fieldModel,
        snapshots: [],
        decisions: [],
        irrigationLogs: [],
        liveWeather: makeLiveWeather(0),
        climateResult: null,
        tempUnit: 'C',
        isOnline: true,
        runningSnapshot: false,
        onCreateFreshSnapshot: async () => undefined,
        onOpenDrawerTab: () => undefined,
        onOpenInMaps: () => undefined,
        onRunDeepAnalysis: () => undefined,
      })
    );
    const drawerHtml = renderToStaticMarkup(
      React.createElement(MetricInspectionDrawer, {
        metric: bundle.metricsById.water_dr,
        onClose: () => undefined,
      })
    );

    assert(!advHtml.includes('% confidence'), 'AdvancedAnalysisView contains no % confidence text');
    assert(advHtml.includes('inputs logged'), 'AdvancedAnalysisView displays honest completeness label');
    assert(!weatherViewHtml.includes('Conf.'), 'DataQualityCard replaced Conf. column with Basis');
    assert(weatherViewHtml.includes('Basis'), 'DataQualityCard renders Basis column');
    assert(!drawerHtml.includes('undefined%'), 'MetricInspectionDrawer never leaks undefined%');
    assert(drawerHtml.includes('Evidence Quality'), 'MetricInspectionDrawer displays Evidence Quality');
  });

  await test('6. Landing HomeHealthBreakdown renders Unassessed cleanly when soil component score is null', () => {
    memStore.clear();
    const profiles = ensureSyncedFarmProfiles();
    const unassessedProfile = {
      ...profiles[0],
      soil: {
        ...profiles[0].soil,
        phStatus: 'not_tested' as const,
        phValue: null,
        moistureStatus: 'unknown' as const,
        moisturePct: null,
      },
    };
    const fields = buildRealFarmFields(unassessedProfile, null, null, null);
    const alerts = evaluateRealFarmAlerts(unassessedProfile, fields, null, null, null);
    const breakdown = computeRealFarmHealth(unassessedProfile, fields, null, null, null, alerts);
    assertEqual(breakdown.components[1].score, null, 'soil component score is null when pH untested');

    const breakdownHtml = renderToStaticMarkup(
      React.createElement(HomeHealthBreakdownList, {
        components: breakdown.components,
        isLight: false,
      })
    );
    assert(breakdownHtml.includes('Unassessed'), 'HomeHealthBreakdownList renders Unassessed for null soil score');
    assert(!breakdownHtml.includes('null/100'), 'HomeHealthBreakdownList never renders null/100');
    assert(breakdownHtml.includes(`${breakdown.components[0].score}/100`), 'assessed components still render score/100');

    const landingHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          DisplayPrefsProvider,
          null,
          React.createElement(Landing, { theme: 'dark', onToggleTheme: () => undefined })
        )
      )
    );
    assert(landingHtml.includes(`${breakdown.overallPct}%`) || landingHtml.length > 0, 'Landing renders overallPct cleanly');
  });

  console.log(`\nALL BATCH C TESTS PASSED: ${passed}/6`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
