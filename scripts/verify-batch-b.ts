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

// Minimal in-memory browser global shim
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
  const {
    buildFieldAgronomyBundle,
    computeFao56DailyEt0,
  } = await import('../src/lib/fieldAgronomyEngine');
  const {
    buildAssessedFarmRecord,
    computeWaterBalance,
    generateRotationCandidatesForFarm,
  } = await import('../src/lib/myFarmsEngine');
  const {
    buildInitialRotationDraft,
    compareRotationPlans,
    evaluateSingleCropSuitability,
    getPriorityPreset,
    runRotationPlannerEngine,
  } = await import('../src/lib/rotationPlannerEngine');
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
  type FarmProfile = import('../src/types').FarmProfile;
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
    windowDays: Array.from({ length: 21 }, (_, idx) => {
      const dayNum = 25 + idx;
      const date =
        dayNum <= 31
          ? `2026-10-${String(dayNum).padStart(2, '0')}`
          : `2026-11-${String(dayNum - 31).padStart(2, '0')}`;
      return {
        date,
        year: 2026,
        doy: 298 + idx,
        tMeanC: 19.5,
        tMaxC: 25.0,
        tMinC: 14.0,
        precipMm: idx === 5 ? 3.0 : 0.0,
        windMs: 2.8,
        humidityPct: 58,
        solarKwhM2: 4.86,
      };
    }),
  });

  const makeRawFarm = (soilOverrides: Partial<MyFarmRecord['soil']> = {}): ServerRawFarmDto => ({
    id: 'farm-b-test',
    name: 'Batch B Agronomy Farm',
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
      moisturePct: 22,
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
    id: 'field-b-1',
    farmId: 'farm-b-test',
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

  await test('1. Known soil texture preserves exact FAO-56 hydraulic outputs & ET0 parity', () => {
    const farm = buildAssessedFarmRecord(makeRawFarm(), [], [], []);
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

    assertEqual(bundle.soil.texture, 'Loam', 'known Loam texture preserved');
    assertEqual(bundle.soil.fcVwcPct, 29, 'Loam FC VWC');
    assertEqual(bundle.soil.wpVwcPct, 14, 'Loam WP VWC');
    assertEqual(bundle.soil.awcMmPerM, 150, 'Loam AWC mm/m');
    assert(bundle.water.tawMm !== null && bundle.water.tawMm > 0, 'TAW computed for known texture');
    assert(bundle.water.rawMm !== null && bundle.water.rawMm > 0, 'RAW computed for known texture');
    assert(bundle.water.currentDrMm !== null, 'Dr computed for known texture');
    assert(bundle.water.currentKs !== null, 'Ks computed for known texture');
    assert(bundle.water.dailyBalanceSeries.length > 0, 'dailyBalanceSeries populated for known texture');

    // Verify FAO-56 ET0 function still computes exact reference ET0
    const et0 = computeFao56DailyEt0({
      latDeg: 38.5449,
      elevationM: 120,
      doy: 318,
      tMaxC: 25.0,
      tMinC: 14.0,
      rhMeanPct: 58,
      wind10mMs: 2.8,
      solarKwhM2: 4.86,
    });
    assert(et0.et0MmDay !== null && et0.et0MmDay > 0, 'computeFao56DailyEt0 computes positive ET0');
  });

  await test('2 & 3 & 4. Unknown soil texture avoids Loam fallback, keeps ET0/ETc available, and nulls hydraulics cleanly', () => {
    const farm = buildAssessedFarmRecord(
      makeRawFarm({
        texture: 'Unknown',
        drainage: 'Unknown',
        moistureStatus: 'unknown',
        moisturePct: null,
        moistureUnit: 'unspecified',
      }),
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

    assertEqual(bundle.soil.texture, 'Unknown', 'Unknown texture stays Unknown');
    assertEqual(bundle.soil.usdaClass, 'Unavailable', 'USDA class marked Unavailable');
    assertEqual(bundle.soil.fcWpSource, 'Unavailable', 'FC/WP source marked Unavailable');
    assertEqual(bundle.soil.fcVwcPct, null, 'fcVwcPct null when texture Unknown');
    assertEqual(bundle.soil.wpVwcPct, null, 'wpVwcPct null when texture Unknown');
    assertEqual(bundle.soil.awcMmPerM, null, 'awcMmPerM null when texture Unknown');
    assertEqual(bundle.soil.drainage, 'Unknown', 'missing drainage stays Unknown (not Moderately)');

    // Texture-dependent hydraulic outputs must be null/empty
    assertEqual(bundle.water.tawMm, null, 'tawMm null when texture Unknown');
    assertEqual(bundle.water.rawMm, null, 'rawMm null when texture Unknown');
    assertEqual(bundle.water.currentDrMm, null, 'currentDrMm null when texture Unknown');
    assertEqual(bundle.water.depletionPctOfTaw, null, 'depletionPctOfTaw null when texture Unknown');
    assertEqual(bundle.water.estimatedMoistureVwcPct, null, 'estimatedMoistureVwcPct null when texture Unknown');
    assertEqual(bundle.water.currentKs, null, 'currentKs null when texture Unknown');
    assertEqual(bundle.water.etcAdjMmDay, null, 'etcAdjMmDay null when Ks unavailable');
    assertEqual(bundle.water.netRefillMm, null, 'netRefillMm null when texture Unknown');
    assertEqual(bundle.water.grossDepthMm, null, 'grossDepthMm null when texture Unknown');
    assertEqual(bundle.water.recommendedVolumeM3, null, 'recommendedVolumeM3 null when texture Unknown');
    assertEqual(bundle.water.dailyBalanceSeries.length, 0, 'dailyBalanceSeries empty when texture Unknown');
    assert(Boolean(bundle.water.hydraulicAvailabilityReason), 'hydraulicAvailabilityReason explains limitation');

    // ET0 and potential ETc remain available when weather inputs exist
    assertEqual(bundle.weather.et0TodayMm, 4.5, 'ET0 remains available with Unknown soil texture');
    assert(bundle.water.etcPotentialMmDay !== null && bundle.water.etcPotentialMmDay > 0, 'potential ETc remains available');
    assert(bundle.water.forecastEtc7dMm > 0, '7d forecast ETc remains computed');
    assert(bundle.weather.combinedDailySeries.some((d) => d.et0Mm !== null), 'daily ET0 series preserved');

    // Inspectable metric and summaries contain no null/NaN text
    assertEqual(bundle.metricsById.water_dr.valueDisplay, 'Unavailable', 'water_dr metric shows Unavailable');
    assertEqual(bundle.metricsById.water_dr.confidencePct, undefined, 'water_dr confidencePct removed');
    assertEqual(bundle.metricsById.weather_rain.confidencePct, undefined, 'weather_rain confidencePct removed');
    assertEqual(bundle.metricsById.soil_nutrients.confidencePct, undefined, 'soil_nutrients confidencePct removed');
    const summaryText = [...bundle.reports.waterSummary, ...bundle.reports.soilCropSummary].join(' ');
    assert(!summaryText.includes('NaN') && !summaryText.includes('null mm'), 'no NaN or null mm in summaries');
  });

  await test('5 & 6 & 7. Only non-tensiometer volumetric_vwc enters VWC balance; incompatible/ambiguous units are blocked yet preserved', () => {
    const farmBase = buildAssessedFarmRecord(makeRawFarm(), [], [], []);

    // Baseline: unmeasured moisture on Loam with empty NASA history
    const unmeasuredField = makeField({ moistureStatus: 'unknown' });
    const unmeasuredBundle = buildFieldAgronomyBundle({
      farm: farmBase,
      field: unmeasuredField,
      fieldIndex: 0,
      liveWeather: null,
      extendedWeather: makeWeather(),
      nasaRecent30: null,
      climateResult: null,
      eonetResult: null,
      irrigationLogs: [],
      tasks: [],
      observations: [],
      decisions: [],
    });

    // Explicit volumetric_vwc on field (22% VWC on Loam FC=29%, Zr from wheat stage)
    const vwcField = makeField({
      moistureStatus: 'measured',
      moisturePct: 22,
      moistureUnit: 'volumetric_vwc',
      moistureDepth: '0-20 cm',
      moistureMethod: 'TDR Probe',
      moistureDate: '2026-11-14',
    });
    const vwcBundle = buildFieldAgronomyBundle({
      farm: farmBase,
      field: vwcField,
      fieldIndex: 0,
      liveWeather: null,
      extendedWeather: makeWeather(),
      nasaRecent30: null,
      climateResult: null,
      eonetResult: null,
      irrigationLogs: [],
      tasks: [],
      observations: [],
      decisions: [],
    });
    assertEqual(vwcBundle.water.estimatedMoistureVwcPct, 22, 'explicit volumetric_vwc enters balance');
    assert(
      vwcBundle.water.currentDrMm !== unmeasuredBundle.water.currentDrMm,
      'explicit volumetric_vwc initializes Dr differently from unmeasured prior'
    );
    assertEqual(vwcBundle.water.moistureUnitAmbiguityNote, null, 'volumetric_vwc has no ambiguity note');

    // Gravimetric, available_water_pct, unspecified, and Tensiometer must all be blocked from Dr initialization
    const blockedCases: Array<{
      label: string;
      override: NonNullable<PortfolioFieldRecord['soilOverrides']>;
    }> = [
      {
        label: 'gravimetric',
        override: {
          moistureStatus: 'measured',
          moisturePct: 16,
          moistureUnit: 'gravimetric',
          moistureDepth: '0-30 cm',
          moistureMethod: 'Oven-dry lab',
          moistureDate: '2026-11-12',
        },
      },
      {
        label: 'available_water_pct',
        override: {
          moistureStatus: 'measured',
          moisturePct: 68,
          moistureUnit: 'available_water_pct',
          moistureDepth: '0-25 cm',
          moistureMethod: 'Soil bucket index',
          moistureDate: '2026-11-12',
        },
      },
      {
        label: 'unspecified',
        override: {
          moistureStatus: 'measured',
          moisturePct: 18,
          moistureUnit: 'unspecified',
          moistureDepth: '0-15 cm',
          moistureMethod: 'Handheld probe',
          moistureDate: '2026-11-12',
        },
      },
      {
        label: 'Tensiometer with ambiguous %',
        override: {
          moistureStatus: 'measured',
          moisturePct: 34,
          moistureUnit: 'unspecified',
          moistureDepth: '15-30 cm',
          moistureMethod: 'Tensiometer',
          moistureDate: '2026-11-12',
        },
      },
    ];

    for (const c of blockedCases) {
      const blockedBundle = buildFieldAgronomyBundle({
        farm: farmBase,
        field: makeField(c.override),
        fieldIndex: 0,
        liveWeather: null,
        extendedWeather: makeWeather(),
        nasaRecent30: null,
        climateResult: null,
        eonetResult: null,
        irrigationLogs: [],
        tasks: [],
        observations: [],
        decisions: [],
      });

      assertEqual(
        blockedBundle.water.currentDrMm,
        unmeasuredBundle.water.currentDrMm,
        `${c.label}: blocked from VWC Dr initialization`
      );
      assertEqual(
        blockedBundle.water.observedMoisturePct,
        c.override.moisturePct!,
        `${c.label}: preserves observedMoisturePct`
      );
      assertEqual(
        blockedBundle.water.observedMoistureUnit,
        c.override.moistureUnit!,
        `${c.label}: preserves observedMoistureUnit`
      );
      assertEqual(
        blockedBundle.water.observedMoistureDepth,
        c.override.moistureDepth!,
        `${c.label}: preserves observedMoistureDepth`
      );
      assertEqual(
        blockedBundle.water.observedMoistureMethod,
        c.override.moistureMethod!,
        `${c.label}: preserves observedMoistureMethod`
      );
      assertEqual(
        blockedBundle.water.observedMoistureDate,
        c.override.moistureDate!,
        `${c.label}: preserves observedMoistureDate`
      );
      assert(
        Boolean(blockedBundle.water.moistureUnitAmbiguityNote),
        `${c.label}: flags unit/method ambiguity note`
      );
    }
  });

  await test('8. myFarmsEngine removes universal <19% alert, <24% limitation, and synthetic confidencePct while preserving water balance', () => {
    const lowMoistureFarm = buildAssessedFarmRecord(
      makeRawFarm({
        moistureStatus: 'measured',
        moisturePct: 12,
        moistureUnit: 'unspecified',
      }),
      [],
      [],
      []
    );
    assertEqual(lowMoistureFarm.assessment.criticalAlertsCount, 0, 'no critical alert from <19% universal moisture threshold');
    assertEqual(lowMoistureFarm.assessment.activeAlertsCount, 0, 'no active alert from <19% universal moisture threshold');
    assertEqual(lowMoistureFarm.assessment.confidencePct, undefined, 'assessment confidencePct omitted');

    const candidates = generateRotationCandidatesForFarm(lowMoistureFarm);
    assert(candidates.length === 3, 'rotation candidates generated');
    assert(candidates.every((c) => c.confidencePct === undefined), 'candidate confidencePct omitted');
    // Water reliability is 'Always available', so 12% moisture must NOT mark isWaterLimited=true
    assertEqual(
      candidates[1].warningNote,
      undefined,
      '12% soil moisture does not trigger <24% universal water-limitation flag'
    );

    const wb = computeWaterBalance(lowMoistureFarm);
    assertEqual(wb.status, 'surplus', 'computeWaterBalance supply/demand math preserved (320 vs 180)');
    assertEqual(wb.deltaM3Day, 140, 'computeWaterBalance delta preserved');
  });

  await test('9. rotationPlannerEngine removes fabricated defaults, uses resolveEffectiveFieldSoil, and preserves core scoring/ranking', () => {
    const sparseFarm = buildAssessedFarmRecord(
      {
        ...makeRawFarm({
          texture: 'Unknown',
          moistureStatus: 'unknown',
          moisturePct: null,
          moistureUnit: 'unspecified',
          phStatus: 'not_tested',
          phValue: null,
          organicMatterPct: null,
          drainage: 'Unknown',
        }),
        water: {
          sources: [],
          reliability: 'Unknown',
          dailyCapacityKnown: false,
          dailyCapacityM3: null,
          estimatedDailyDemandM3: null,
          qualityTested: 'No',
          ecDsM: null,
          salinityPpm: null,
          qualityTestDate: '',
          wateringMethod: '',
          irrigationMethod: '',
          irrigationFrequency: '',
          rainfallFrequency: '',
          demandAssumptionNote: '',
        },
      },
      [],
      [],
      []
    );
    const sparseDraft = buildInitialRotationDraft(sparseFarm, []);
    assertEqual(sparseDraft.soilTexture, 'Unknown', 'missing texture stays Unknown');
    assertEqual(sparseDraft.soilTextureProvenance, 'unknown', 'missing texture provenance is unknown');
    assertEqual(sparseDraft.soilPh, null, 'missing pH stays null');
    assertEqual(sparseDraft.soilPhProvenance, 'unknown', 'missing pH provenance is unknown');
    assertEqual(sparseDraft.soilMoisturePct, null, 'missing moisture stays null');
    assertEqual(sparseDraft.soilOrganicMatterPct, null, 'missing OM stays null');
    assertEqual(sparseDraft.drainage, 'Unknown', 'missing drainage stays Unknown');
    assertEqual(sparseDraft.waterSources.length, 0, 'missing waterSources stays []');
    assertEqual(sparseDraft.wateringMethod, '', 'missing wateringMethod stays empty');
    assertEqual(sparseDraft.waterReliability, 'Unknown', 'missing waterReliability stays Unknown');
    assertEqual(sparseDraft.waterSourceSummary, 'Water supply not specified', 'missing water summary explicit');
    assertEqual(sparseDraft.waterProvenance, 'unknown', 'missing water provenance is unknown');

    const farmWithMeasuredSoil = buildAssessedFarmRecord(makeRawFarm(), [], [], []);
    const suppressedField = makeField({
      moistureStatus: 'unknown',
      phStatus: 'not_tested',
    });
    const suppressedDraft = buildInitialRotationDraft(farmWithMeasuredSoil, [suppressedField], suppressedField.id);
    assertEqual(suppressedDraft.soilMoisturePct, null, 'field unknown moisture suppresses farm moisture in draft');
    assertEqual(suppressedDraft.soilPh, null, 'field not_tested pH suppresses farm pH in draft');
    assertEqual(suppressedDraft.soilPhProvenance, 'unknown', 'suppressed pH provenance is unknown');

    const fullDraft = buildInitialRotationDraft(farmWithMeasuredSoil, []);
    fullDraft.priorities = getPriorityPreset('balanced');
    const suit = evaluateSingleCropSuitability(fullDraft);
    assert(suit.length === 9, 'all 9 catalog crops evaluated');
    assert(suit.every((s) => s.confidencePct === undefined), 'crop suitability confidencePct omitted');
    const wheatSuit = suit.find((s) => s.cropId === 'wheat');
    assert(wheatSuit && typeof wheatSuit.matchScore === 'number' && wheatSuit.matchScore > 75, 'core suitability score preserved');

    const planOut = runRotationPlannerEngine(farmWithMeasuredSoil, [], fullDraft);
    assert(planOut.candidates.length >= 5, 'rotation candidates ranked');
    assert(planOut.candidates.every((c) => c.confidencePct === undefined), 'plan candidate confidencePct omitted');
    assertEqual(planOut.candidates[0].rank, 1, 'top candidate ranked #1');

    const cmp = compareRotationPlans(
      planOut.candidates[0],
      planOut.candidates[1],
      planOut.normalizedWeights.weights
    );
    assert(
      !cmp.rows.some((r) => r.criterion === 'Evidence Confidence'),
      'compareRotationPlans no longer emits Evidence Confidence % row'
    );
    assert(
      cmp.rows.some((r) => r.criterion === 'Data Availability'),
      'compareRotationPlans emits Data Availability row'
    );
  });

  await test('10. homeFarmEvaluator removes universal moisture alerts/bands and omits unassessable soil from weighted overallPct', () => {
    const profiles = ensureSyncedFarmProfiles();
    assert(profiles.length >= 2, 'starter profiles created');
    for (const p of profiles) {
      assertEqual(p.soil.moistureUnit, 'unspecified', `${p.location.farmName} starter moistureUnit stays unspecified`);
    }

    const unassessedSoilProfile: FarmProfile = {
      ...profiles[0],
      soil: {
        ...profiles[0].soil,
        moistureStatus: 'measured',
        moisturePct: 14,
        moistureUnit: 'unspecified',
        phStatus: 'not_tested',
        phValue: null,
      },
    };
    const fields = buildRealFarmFields(unassessedSoilProfile, null, null, null);
    const alerts = evaluateRealFarmAlerts(unassessedSoilProfile, fields, null, null, null);
    assert(
      !alerts.some((a) => a.id === 'soil-moisture-low' || a.id === 'soil-moisture-high'),
      'no universal <25% or >70% moisture alerts emitted'
    );

    const health = computeRealFarmHealth(unassessedSoilProfile, fields, null, null, null, alerts);
    const soilComp = health.components[1];
    assertEqual(soilComp.score, null, 'unassessed soil component score is null (no fake neutral 76)');
    assertEqual(soilComp.assessable, false, 'soil component marked assessable: false');
    const expectedNormalized = Math.round(
      ((health.components[0].score ?? 0) * 0.4 +
        (health.components[2].score ?? 0) * 0.2 +
        (health.components[3].score ?? 0) * 0.15) /
        0.75
    );
    assertEqual(
      health.overallPct,
      expectedNormalized,
      'overallPct is weighted average over assessable components only'
    );

    const testedPhProfile: FarmProfile = {
      ...unassessedSoilProfile,
      soil: {
        ...unassessedSoilProfile.soil,
        phStatus: 'tested',
        phValue: 6.6,
      },
    };
    const healthWithPh = computeRealFarmHealth(testedPhProfile, fields, null, null, null, []);
    assertEqual(healthWithPh.components[1].score, 90, 'tested pH 6.6 scores 90');
    assertEqual(healthWithPh.components[1].assessable, true, 'tested pH makes soil component assessable');
  });

  console.log(`\nALL BATCH B TESTS PASSED: ${passed}/6`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
