import { register } from 'node:module';

// Register lightweight ESM hook so Node/tsx can import Vite static image modules cleanly
const assetLoaderSource = `
export async function load(url, context, nextLoad) {
  if (/\\.(jpg|jpeg|png|webp|svg|gif|css)$/i.test(url)) {
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

  const { createEmptyFarmProfile } = await import('../src/lib/farmStorage');
  const { FarmQuestionnaire } = await import('../src/components/farmAnalysis/FarmQuestionnaire');
  const {
    AddFarmWizardModal,
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
    AllPlansComparisonModal,
    applyFieldSelectionToDraft,
    buildGeminiExplainPayload,
    CropSuitabilityDetailModal,
    PlanDetailEvidenceModal,
  } = await import('../src/components/rotation/RotationModals');
  const {
    buildInitialRotationDraft,
    runRotationPlannerEngine,
  } = await import('../src/lib/rotationPlannerEngine');
  const { buildRotationPlanPdfBytes } = await import('../src/lib/rotationPdfExport');
  const { buildAssessedFarmRecord } = await import('../src/lib/myFarmsEngine');

  type ServerRawFarmDto = import('../src/lib/myFarmsEngine').ServerRawFarmDto;
  type PortfolioFieldRecord = import('../src/types/myFarms').PortfolioFieldRecord;
  type SavedFarmSnapshot = import('../src/types/myFarms').SavedFarmSnapshot;

  const makeRawFarm = (soilOverrides: Record<string, unknown> = {}): ServerRawFarmDto => ({
    id: 'farm-d-1',
    name: 'Batch D Test Farm',
    primaryCrop: 'Wheat',
    locationLabel: 'Davis, CA',
    regionLabel: 'California',
    country: 'United States',
    timezone: 'UTC',
    centroid: { lat: 38.5449, lon: -121.7405 },
    geometry: null,
    areaUnit: 'hectares',
    declaredAreaHa: 24,
    mappedAreaHa: 24,
    perimeterM: 2000,
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
      moisturePct: 26,
      moistureUnit: 'volumetric_vwc',
      moistureDepth: '0-20 cm',
      moistureMethod: 'TDR Probe',
      moistureDate: '2026-11-10',
      phStatus: 'tested',
      phValue: 6.7,
      phTestDate: '2026-11-01',
      organicMatterPct: 2.5,
      drainage: 'Moderately',
      slopePct: 1.5,
      elevationM: 45,
      preparationMethods: [],
      notes: '',
      ...soilOverrides,
    } as ServerRawFarmDto['soil'],
    water: {
      sources: ['Groundwater / Well'],
      reliability: 'Always available',
      dailyCapacityKnown: true,
      dailyCapacityM3: 240,
      estimatedDailyDemandM3: 140,
      qualityTested: 'Yes',
      ecDsM: 0.6,
      salinityPpm: 384,
      qualityTestDate: '2026-11-01',
      wateringMethod: 'Artificial irrigation',
      irrigationMethod: 'Drip irrigation',
      irrigationFrequency: 'Every 2–3 days',
      rainfallFrequency: 'Rarely',
      demandAssumptionNote: '',
    },
    planningHorizon: 'Next 2–3 years',
    priorities: ['Water conservation', 'Improving soil health'],
    challenges: [],
    lastAssessedAt: '2026-11-12T08:00:00Z',
    suitabilityScore: 80,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-12T08:00:00Z',
  });

  const makeField = (
    id: string,
    name: string,
    overrides?: PortfolioFieldRecord['soilOverrides']
  ): PortfolioFieldRecord => ({
    id,
    farmId: 'farm-d-1',
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
    lastAssessedAt: '2026-11-12T08:00:00Z',
    updatedAt: '2026-11-12T08:00:00Z',
  });

  // 1. FarmQuestionnaire: No fabricated 35% soil-moisture prefill
  await test('1. FarmQuestionnaire removes 35% soil-moisture prefill and preserves measured/estimated/unknown without inventing values', () => {
    const src = fs.readFileSync('src/components/farmAnalysis/FarmQuestionnaire.tsx', 'utf8');
    assert(!src.includes('?? 35'), 'FarmQuestionnaire source must not contain ?? 35 default');

    const measuredWithoutReading = createEmptyFarmProfile('Measured Null Test');
    measuredWithoutReading.currentStage = 2;
    measuredWithoutReading.soil.moistureStatus = 'measured';
    measuredWithoutReading.soil.moisturePct = null;

    const html = renderToStaticMarkup(
      React.createElement(FarmQuestionnaire, {
        profile: measuredWithoutReading,
        onChange: () => undefined,
        onSaveProgress: () => undefined,
        onFinishToDashboard: () => undefined,
      })
    );
    assert(html.includes('Not entered'), 'Measured status with null reading renders Not entered');
    assert(html.includes('No numeric reading stored yet'), 'Clarifies no numeric reading is stored yet');
    assert(!html.includes('35%'), 'Does not render fabricated 35% reading');
    assert(html.includes('id="moisture-pct-input"'), 'Explicit numeric moisture input present');
  });

  // 2. AddFarmWizardModal: Moisture status, unit, depth, method, date, pH test date & legacy hydration
  await test('2. AddFarmWizardModal preserves moisture status & unit, does not assume VWC, and keeps optional inputs non-forced', () => {
    const blank = createFreshBlankDraft();
    assertEqual(blank.soilMoistureStatus, 'unknown', 'Blank draft defaults moistureStatus to unknown');
    assertEqual(blank.soilMoistureUnit, 'unspecified', 'Blank draft defaults moistureUnit to unspecified (never VWC)');

    // Measured with missing unit should preserve unspecified (no VWC assumption) & genuine 0
    const zeroDraft = {
      ...blank,
      name: 'Zero Moisture Plot',
      soilTexture: 'Loam' as const,
      soilMoistureStatus: 'measured' as const,
      soilMoistureStr: '0',
      soilMoistureUnit: 'unspecified' as const,
      soilMoistureDepth: '0-20 cm',
      soilMoistureMethod: 'Tensiometer',
      soilMoistureDate: '2026-11-14',
      soilPhTested: true,
      soilPhStr: '6.8',
      soilPhTestDate: '2026-11-10',
    };
    const payload = buildAddFarmSubmissionPayload(zeroDraft, {
      hasCoords: true,
      parsedLat: 38.5,
      parsedLon: -121.7,
      saveAsDraft: false,
    });
    const soil = payload.soil as Record<string, unknown>;
    assertEqual(soil.moistureStatus, 'measured', 'Preserves measured moistureStatus');
    assertEqual(soil.moisturePct, 0, 'Preserves genuine 0% moisture reading');
    assertEqual(soil.moistureUnit, 'unspecified', 'Does not assume VWC when unit is unspecified');
    assertEqual(soil.moistureDepth, '0-20 cm', 'Preserves measurement depth');
    assertEqual(soil.moistureMethod, 'Tensiometer', 'Preserves measurement method');
    assertEqual(soil.moistureDate, '2026-11-14', 'Preserves measurement date');
    assertEqual(soil.phTestDate, '2026-11-10', 'Preserves pH test date');

    // Empty optional fields when measured remain null/empty (never forced)
    const partialMeasuredPayload = buildAddFarmSubmissionPayload(
      { ...blank, name: 'Partial Plot', soilMoistureStatus: 'estimated' },
      { hasCoords: false, parsedLat: NaN, parsedLon: NaN, saveAsDraft: false }
    );
    const partialSoil = partialMeasuredPayload.soil as Record<string, unknown>;
    assertEqual(partialSoil.moistureStatus, 'estimated', 'Preserves estimated status');
    assertEqual(partialSoil.moisturePct, null, 'Optional moisture reading stays null when omitted');
    assertEqual(partialSoil.moistureUnit, 'unspecified', 'Optional moisture unit stays unspecified');

    // Legacy localStorage draft hydration backwards compatibility
    const legacyHydrated = hydrateAddFarmDraft({ name: 'Legacy Draft', soilMoistureKnown: true, soilMoistureStr: '22' });
    assertEqual(legacyHydrated.soilMoistureStatus, 'measured', 'Hydrates legacy soilMoistureKnown=true as measured');
    assertEqual(legacyHydrated.soilMoistureUnit, 'unspecified', 'Hydrates legacy draft without assuming VWC');

    memStore.set(
      'anchor_myfarms_add_draft_v1',
      JSON.stringify({ step: 4, soilMoistureStatus: 'measured', soilPhTested: true })
    );
    const wizardHtml = renderToStaticMarkup(
      React.createElement(AddFarmWizardModal, {
        open: true,
        existingNames: [],
        onClose: () => undefined,
        onComplete: async () => undefined,
      })
    );
    assert(wizardHtml.includes('Add New Farm'), 'AddFarmWizardModal renders cleanly');
    assert(wizardHtml.includes('id="wizard-moisture-status"'), 'Step 4 renders moisture status input');
    assert(wizardHtml.includes('id="wizard-moisture-unit"'), 'Step 4 renders moisture unit input');
    assert(wizardHtml.includes('id="wizard-moisture-depth"'), 'Step 4 renders moisture depth input');
    assert(wizardHtml.includes('id="wizard-moisture-method"'), 'Step 4 renders moisture method input');
    assert(wizardHtml.includes('id="wizard-moisture-date"'), 'Step 4 renders moisture date input');
    assert(wizardHtml.includes('id="wizard-ph-date"'), 'Step 4 renders pH test date input');
    memStore.clear();
  });

  // 3. Legacy records & snapshots remain readable without reinterpreting historical units
  await test('3. Legacy SavedFarmSnapshot without soilContext remains readable without reinterpreting current defaults', () => {
    const legacySnapshot: SavedFarmSnapshot = {
      id: 'snap-legacy-1',
      farmId: 'farm-d-1',
      generatedAt: '2025-05-01T12:00:00Z',
      modelVersion: 'v1.0-legacy',
      triggerReason: 'Manual check',
      suitabilityScore: 76,
      completenessPct: 80,
      weatherWindowSummary: 'Warm dry spell',
      dataAvailability: {
        nasaPower: 'available',
        openMeteo: 'available',
        nasaEonet: 'available',
        soilLab: 'measured',
      },
      recommendations: [],
      keyMetrics: {
        meanTempC: 19,
        precipMmDay: 1.2,
        et0MmDay: 4.5,
        soilMoisturePct: 28,
        phValue: 6.5,
        mappedAreaHa: 24,
      },
    };
    const legacyContextText = formatSnapshotHistoricalContext(legacySnapshot);
    assert(
      legacyContextText.includes('unit unrecorded (historical snapshot)'),
      'Legacy snapshot renders unit unrecorded (historical snapshot) without reinterpreting via current defaults'
    );
    assert(!legacyContextText.includes('Volumetric'), 'Legacy snapshot must not assume Volumetric VWC');
  });

  // 4. FarmDetailWorkspace snapshot builder removes thresholds & confidencePct and captures provenance
  await test('4. FarmDetailWorkspace snapshots remove synthetic confidence & 19/24/42 thresholds and capture soilContext provenance', () => {
    const farm = buildAssessedFarmRecord(makeRawFarm(), [], [], []);
    const tensiometerField = makeField('f-tensiometer', 'South Tensiometer Block', {
      moistureStatus: 'measured',
      moisturePct: 33,
      moistureUnit: 'unspecified',
      moistureDepth: '15-30 cm',
      moistureMethod: 'Tensiometer',
      moistureDate: '2026-11-11',
    });

    const snapPayload = buildSnapshotCreationPayload({
      farm,
      selectedField: tensiometerField,
      meanTemp: 20.5,
      precip: 12,
      weatherSummary: 'Dry autumn week',
      nasaAvail: 'available',
      meteoAvail: 'available',
      eonetAvail: 'available',
      hazardPenalty: 0,
    });

    assert(!('confidencePct' in snapPayload), 'Snapshot payload must not generate confidencePct');
    const recs = snapPayload.recommendations as string[];
    assert(
      !recs.some((r) => r.includes('VWC deficit') || r.includes('<21')),
      'Snapshot recommendations do not fabricate VWC deficit thresholds'
    );
    const soilCtx = snapPayload.soilContext as SavedFarmSnapshot['soilContext'];
    assert(Boolean(soilCtx), 'Snapshot captures soilContext');
    assertEqual(soilCtx?.moistureUnit, 'unspecified', 'Snapshot preserves field-level unspecified unit');
    assertEqual(soilCtx?.moistureMethod, 'Tensiometer', 'Snapshot preserves field-level method');
    assertEqual(soilCtx?.moistureDepth, '15-30 cm', 'Snapshot preserves field-level depth');
  });

  // 5. Rotation.tsx: No offline fabricated fallback data; uses real farms & honest unavailable rendering
  await test('5. Rotation.tsx maps real farm profiles without fabricating missing soil/water/location values', () => {
    const src = fs.readFileSync('src/pages/Rotation.tsx', 'utf8');
    assert(!src.includes('Green Valley Farm'), 'Rotation.tsx contains no fabricated Green Valley Farm fallback');
    assert(!src.includes('Ames, Iowa'), 'Rotation.tsx contains no fabricated Ames, Iowa fallback');
    assert(!src.includes('confidencePct}%'), 'Rotation.tsx UI renders no confidencePct%');

    const emptyProfile = createEmptyFarmProfile('Honest Blank Farm');
    const mapped = mapFarmProfilesToRotationFarms([emptyProfile]);
    assertEqual(mapped.length, 1, 'Mapped 1 farm profile');
    const farm = mapped[0];
    assertEqual(farm.name, 'Honest Blank Farm', 'Preserves farm name');
    assertEqual(farm.centroid, null, 'Does not fabricate coordinates');
    assertEqual(farm.soil.texture, 'Unknown', 'Does not fabricate Loam texture');
    assertEqual(farm.soil.moisturePct, null, 'Does not fabricate 24% moisture');
    assertEqual(farm.soil.phValue, null, 'Does not fabricate 6.6 pH');
    assertEqual(farm.water.dailyCapacityM3, null, 'Does not fabricate 420 m3 water capacity');
    assertEqual(farm.assessment.score, null, 'Does not fabricate score 91');
    assertEqual(farm.assessment.confidencePct, undefined, 'Does not fabricate confidencePct 84');

    memStore.clear();
    memStore.set('anchor_farm_profiles_v1', JSON.stringify([emptyProfile]));
    const rotationHtml = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(RotationPage))
    );
    assert(!rotationHtml.includes('NaN') && !rotationHtml.includes('undefined%'), 'Rotation page renders cleanly without NaN or undefined%');
    assert(!rotationHtml.includes('Confidence:'), 'Rotation showcase does not render Confidence:');
  });

  // 6. RotationModals: resolveEffectiveFieldSoil on field switching with overrides & suppressions
  await test('6. RotationModals applyFieldSelectionToDraft respects field overrides, explicit suppressions, and reverting to farm defaults', () => {
    const farm = buildAssessedFarmRecord(makeRawFarm(), [], [], []);
    const baseDraft = buildInitialRotationDraft(farm, []);

    const overriddenField = makeField('f-clay', 'South Clay Block', {
      texture: 'Clay loam',
      moistureStatus: 'estimated',
      moisturePct: 18,
      moistureUnit: 'gravimetric',
      moistureDepth: '0-30 cm',
      moistureMethod: 'Auger sample',
      moistureDate: '2026-11-12',
      phStatus: 'tested',
      phValue: 7.4,
    });
    const suppressedField = makeField('f-suppressed', 'Untested Block', {
      texture: 'Unknown',
      moistureStatus: 'unknown',
      phStatus: 'not_tested',
      drainage: 'Unknown',
    });
    const plainField = makeField('f-plain', 'Inherited Block');

    const d1 = applyFieldSelectionToDraft(baseDraft, farm, overriddenField);
    assertEqual(d1.soilTexture, 'Clay loam', 'Applies field texture override');
    assertEqual(d1.soilMoistureUnit, 'gravimetric', 'Applies field moisture unit override');
    assertEqual(d1.soilPh, 7.4, 'Applies field pH override');

    const d2 = applyFieldSelectionToDraft(d1, farm, suppressedField);
    assertEqual(d2.soilTexture, 'Unknown', 'Respects explicit field texture suppression');
    assertEqual(d2.soilTextureProvenance, 'unknown', 'Suppressed texture marks provenance unknown');
    assertEqual(d2.soilMoistureStatus, 'unknown', 'Respects explicit moisture suppression');
    assertEqual(d2.soilMoisturePct, null, 'Suppressed moisture clears value to null');
    assertEqual(d2.soilPh, null, 'Respects explicit pH not_tested suppression');
    assertEqual(d2.soilPhProvenance, 'unknown', 'Suppressed pH marks provenance unknown');

    const d3 = applyFieldSelectionToDraft(d2, farm, plainField);
    assertEqual(d3.soilTexture, 'Loam', 'Reverts to inherited farm texture when switching to plain field');
    assertEqual(d3.soilMoistureUnit, 'volumetric_vwc', 'Reverts to inherited farm moistureUnit');
    assertEqual(d3.soilPh, 6.7, 'Reverts to inherited farm pH');
  });

  // 7. RotationModals: Gemini payload omits confidencePct and evidence modals omit Evidence Confidence
  await test('7. Gemini explanation payload omits confidencePct while keeping required fields, and modals show no Evidence Confidence', () => {
    const farm = buildAssessedFarmRecord(makeRawFarm(), [], [], []);
    const draft = buildInitialRotationDraft(farm, []);
    const engine = runRotationPlannerEngine(farm, [], draft);
    const plan = engine.candidates[0];
    assert(Boolean(plan), 'Engine produces at least one candidate');

    const geminiPayload = buildGeminiExplainPayload(engine, plan, draft) as Record<string, unknown>;
    assert(!('confidencePct' in geminiPayload), 'Gemini payload omits confidencePct');
    const selectedRot = geminiPayload.selectedRotation as Record<string, unknown>;
    assert(!('confidencePct' in selectedRot), 'Gemini selectedRotation omits confidencePct');
    assertEqual(geminiPayload.farmName, engine.farmName, 'Preserves farmName');
    assertEqual(geminiPayload.soilTexture, draft.soilTexture, 'Preserves soilTexture');
    assert(Array.isArray(selectedRot.steps) && selectedRot.steps.length > 0, 'Preserves steps');

    const detailHtml = renderToStaticMarkup(
      React.createElement(PlanDetailEvidenceModal, {
        open: true,
        plan,
        engine,
        draft,
        onDownloadPdf: () => undefined,
        onRequestSave: () => undefined,
        onClose: () => undefined,
      })
    );
    assert(!detailHtml.includes('Evidence Confidence'), 'PlanDetailEvidenceModal removes Evidence Confidence');
    assert(detailHtml.includes('Data Availability'), 'PlanDetailEvidenceModal shows honest Data Availability');

    const compareHtml = renderToStaticMarkup(
      React.createElement(AllPlansComparisonModal, {
        open: true,
        engine,
        draft,
        previewPlanId: plan.id,
        onSelectPlan: () => undefined,
        onClose: () => undefined,
      })
    );
    assert(!compareHtml.includes('Conf:'), 'AllPlansComparisonModal removes Conf:');

    const suitHtml = renderToStaticMarkup(
      React.createElement(CropSuitabilityDetailModal, {
        open: true,
        initialTab: 'suitability',
        selectedStep: null,
        suitabilityList: engine.cropSuitability,
        farmName: farm.name,
        onClose: () => undefined,
      })
    );
    assert(!suitHtml.includes('confidence') && !suitHtml.includes('Confidence'), 'CropSuitabilityDetailModal contains no synthetic confidence label');
  });

  // 8. rotationPdfExport: Removes Evidence Confidence row and preserves provenance/data availability
  await test('8. rotationPdfExport removes Evidence Confidence row and includes moisture/pH provenance and Data Availability', () => {
    const farm = buildAssessedFarmRecord(makeRawFarm(), [], [], []);
    const draft = buildInitialRotationDraft(farm, []);
    const engine = runRotationPlannerEngine(farm, [], draft);
    const plan = engine.candidates[0];
    const pdfBytes = buildRotationPlanPdfBytes(engine, plan, draft);
    const pdfText = Buffer.from(pdfBytes).toString('latin1');
    const normalizedPdfLines = Array.from(pdfText.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g))
      .map((m) => m[1].replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\'))
      .join(' ');

    assert(pdfText.startsWith('%PDF-1.4'), 'Generates valid PDF 1.4 header');
    assert(!normalizedPdfLines.includes('Evidence Confidence'), 'PDF removes Evidence Confidence row');
    assert(normalizedPdfLines.includes('Soil Moisture & Provenance:'), 'PDF includes Soil Moisture & Provenance line');
    assert(normalizedPdfLines.includes('Data Availability:'), 'PDF includes honest Data Availability line');
    assert(normalizedPdfLines.includes('TDR Probe'), 'PDF preserves measurement method');
    assert(normalizedPdfLines.includes('0-20 cm'), 'PDF preserves measurement depth');
  });

  // 9. PlanDecisionJournal & existing rotation workflow remain intact without confidencePct
  await test('9. PlanDecisionJournal omits Data confidence % while preserving candidates and decision history', () => {
    const farm = buildAssessedFarmRecord(makeRawFarm(), [], [], []);
    const field = makeField('f-1', 'North Block');
    const html = renderToStaticMarkup(
      React.createElement(PlanDecisionJournal, {
        farm,
        fields: [field],
        decisions: [],
        onRecordDecision: async () => undefined,
      })
    );
    assert(!html.includes('Data confidence'), 'PlanDecisionJournal removes Data confidence %');
    assert(html.includes('Suitability '), 'PlanDecisionJournal preserves suitability score display');
    assert(html.includes('Select as Active Plan'), 'PlanDecisionJournal preserves plan decision controls');
  });

  console.log(`\nALL BATCH D TESTS PASSED: ${passed}/9`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
