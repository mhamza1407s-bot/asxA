import { register } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import http from 'node:http';

// Stub static image/asset imports so Node/tsx can import Vite modules cleanly
const assetLoaderSource = `
export async function load(url, context, nextLoad) {
  if (/\\.(jpg|jpeg|png|webp|svg|gif|css)$/i.test(url)) {
    return { format: 'module', shortCircuit: true, source: 'export default "asset-stub";' };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript;base64,${Buffer.from(assetLoaderSource).toString('base64')}`);

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
(globalThis as Record<string, unknown>).sessionStorage = storageShim;
(globalThis as Record<string, unknown>).window = {
  localStorage: storageShim,
  sessionStorage: storageShim,
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  scrollTo: () => undefined,
  matchMedia: () => ({
    matches: false,
    media: '',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }),
  location: { pathname: '/', search: '', href: 'http://localhost:3000/' },
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  screen: {},
  navigator: {
    userAgent: 'node-ssr-test',
    language: 'en-US',
  },
};
(globalThis as Record<string, unknown>).document = {
  documentElement: {
    style: {},
    classList: { toggle: () => undefined, add: () => undefined, remove: () => undefined },
  },
  head: { appendChild: () => undefined },
  body: { appendChild: () => undefined },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  createElement: () => ({
    style: {},
    setAttribute: () => undefined,
    appendChild: () => undefined,
    getContext: () => null,
    getElementsByTagName: () => [],
  }),
  createTextNode: () => ({}),
  getElementsByTagName: () => [],
};
if (typeof (globalThis as Record<string, unknown>).CustomEvent === 'undefined') {
  (globalThis as Record<string, unknown>).CustomEvent = class CustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
}
if (typeof (globalThis as Record<string, unknown>).ResizeObserver === 'undefined') {
  (globalThis as Record<string, unknown>).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILES = [
  'questionnaires-store.json',
  'my-farms-portfolio.json',
  'maps-workspace.json',
];

function backupDataFiles(): Map<string, string | null> {
  const backups = new Map<string, string | null>();
  for (const name of DATA_FILES) {
    const p = path.join(DATA_DIR, name);
    backups.set(name, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
  }
  return backups;
}

function restoreDataFiles(backups: Map<string, string | null>): void {
  for (const [name, content] of backups.entries()) {
    const p = path.join(DATA_DIR, name);
    if (content === null) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } else {
      fs.writeFileSync(p, content, 'utf8');
    }
  }
}

async function run(): Promise<void> {
  const backups = backupDataFiles();
  try {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { MemoryRouter } = await import('react-router-dom');
    const { ModeProvider } = await import('../src/context/ModeContext');
    const { DisplayPrefsProvider } = await import('../src/context/DisplayPrefsContext');
    const { ToastProvider } = await import('../src/components/Toast');
    const { Header } = await import('../src/components/Header');
    const { MyFarms } = await import('../src/pages/MyFarms');
    const { Questions } = await import('../src/pages/Questions');
    const { Rotation } = await import('../src/pages/Rotation');
    const { FarmQuestionnaire } = await import('../src/components/farmAnalysis/FarmQuestionnaire');
    const { createEmptyFarmProfile } = await import('../src/lib/farmStorage');
    const { createBlankQuestionnaireDraft, saveActiveQuestionnaireDraft, clearActiveQuestionnaireDraft } =
      await import('../src/lib/questionnaireStorage');
    const { buildImmutableSnapshot, mapSnapshotToRotationDraft } = await import('../src/lib/questionnaireEngine');
    const { createQuestionnaireRouter } = await import('../server/questionnaireRouter');

    const wrap = (initialEntry: string, node: React.ReactElement) =>
      React.createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        React.createElement(
          ModeProvider,
          null,
          React.createElement(
            DisplayPrefsProvider,
            null,
            React.createElement(ToastProvider, null, node)
          )
        )
      );

    // 1. Source & SSR verification for FarmQuestionnaire pH 6.5 bug fix
    const fqSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/farmAnalysis/FarmQuestionnaire.tsx'),
      'utf8'
    );
    assert.equal(fqSource.includes('?? 6.5'), false, 'FarmQuestionnaire.tsx must contain zero ?? 6.5 fallbacks');

    const profile = createEmptyFarmProfile('pH Null Test');
    profile.currentStage = 2;
    profile.soil.phStatus = 'tested';
    profile.soil.phValue = null;

    const fqHtml = renderToStaticMarkup(
      wrap(
        '/analyze?mode=farm',
        React.createElement(FarmQuestionnaire, {
          profile,
          onChange: () => undefined,
          onSaveProgress: () => undefined,
          onFinishToDashboard: () => undefined,
        })
      )
    );
    assert.ok(fqHtml.includes('Not entered'), 'FarmQuestionnaire Stage 2 with phStatus=tested and phValue=null must render Not entered');
    assert.ok(fqHtml.includes('id="soil-ph-input"'), 'FarmQuestionnaire Stage 2 must include explicit numeric pH input');
    assert.ok(!fqHtml.includes('pH 6.5'), 'FarmQuestionnaire Stage 2 must not fabricate pH 6.5');
    console.log('PASS: 1. FarmQuestionnaire pH 6.5 removal verified (source + SSR Stage 2)');

    // 2. Stage 1A hardening on mapSnapshotToRotationDraft & syncSnapshotToPortfolioAndMaps
    const draft = createBlankQuestionnaireDraft('create');
    draft.location = {
      locationMethod: 'geocoded_search',
      latitude: 36.7468,
      longitude: -119.7726,
      timezone: 'America/Los_Angeles',
      elevationM: 90,
      country: 'United States',
      adminArea: 'California',
      placeLabel: 'Fresno, CA',
      geocoderProvider: 'open_meteo_geocoding',
      confirmedByUser: true,
      confirmedAt: new Date().toISOString(),
      locationVersion: 1,
      spatialPrecisionLabel: 'field_pin',
    };
    draft.geometry = {
      geometryStatus: 'polygon_verified',
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [-119.775, 36.745],
            [-119.77, 36.745],
            [-119.77, 36.75],
            [-119.775, 36.75],
            [-119.775, 36.745],
          ],
        ],
      },
      geodesicAreaHa: 24.8,
      perimeterM: 1995,
      centroid: { lat: 36.7475, lon: -119.7725 },
      crs: 'EPSG:4326',
      areaMethod: 'WGS84 Spherical Excess (Chamberlain-Duquette)',
      geometryVersion: 1,
    };
    draft.consent.acceptedRemoteFetch = true;
    draft.consent.acceptedAt = new Date().toISOString();
    const now = new Date().toISOString();
    const ans = (qId: string, value: unknown) => ({
      answerId: `a_${qId}`,
      questionId: qId,
      questionVersion: 1,
      farmId: draft.farmId,
      fieldId: draft.fieldId,
      questionnaireId: draft.questionnaireId,
      profileVersion: 1,
      value,
      scope: 'field' as const,
      sourceType: 'farmer_reported' as const,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    draft.answers.Q01 = ans('Q01', { mode: 'new', farmId: draft.farmId, farmName: 'Stage1A Integration Farm' });
    draft.answers.Q03 = ans('Q03', 'Block Alpha');
    draft.answers.Q09 = ans('Q09', 'loam');
    draft.answers.Q10 = ans('Q10', 'yes_full');
    draft.answers.Q11 = ans('Q11', { status: 'measured', value: 6.8, method: '1:1', sampleDate: '2026-03-01', depthValue: 15, depthUnit: 'cm' });
    draft.answers.Q17 = ans('Q17', 'both');
    draft.answers.Q18 = ans('Q18', ['well_groundwater', 'river_stream']);
    draft.answers.Q25 = ans('Q25', { mode: 'new_field', records: [] });

    const snap = buildImmutableSnapshot(draft, 1);
    const rotDraft = mapSnapshotToRotationDraft(snap, null);
    assert.equal(rotDraft.soilMoistureStatus, 'unknown');
    assert.equal(rotDraft.soilMoistureUnit, 'unspecified');
    assert.equal(rotDraft.soilMoistureDepth, '');
    assert.equal(rotDraft.soilMoistureMethod, '');
    assert.equal(rotDraft.soilMoistureDate, '');
    assert.equal(rotDraft.moistureUnitAmbiguityNote, null);
    assert.deepEqual(rotDraft.waterSources, ['Groundwater / Well', 'River / Stream']);

    const app = express();
    app.use(express.json());
    app.use('/api', createQuestionnaireRouter());
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 3000}`;

    try {
      const reviewRes = await fetch(
        `${baseUrl}/api/rotation-questionnaires/${encodeURIComponent(draft.questionnaireId)}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft }),
        }
      );
      assert.equal(reviewRes.status, 200);
      const reviewJson = (await reviewRes.json()) as { snapshot: { inputSnapshotId: string } };

      const jobRes = await fetch(`${baseUrl}/api/rotation-assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionnaireId: draft.questionnaireId,
          inputSnapshotId: reviewJson.snapshot.inputSnapshotId,
          idempotencyKey: `idem_int_${Date.now()}`,
          draft,
        }),
      });
      assert.equal(jobRes.status, 202);
      const jobJson = (await jobRes.json()) as { job: { jobId: string } };

      let terminalState = '';
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const checkRes = await fetch(`${baseUrl}/api/rotation-assessments/${encodeURIComponent(jobJson.job.jobId)}`);
        const checkJson = (await checkRes.json()) as { job: { state: string } };
        if (['complete', 'partial', 'failed', 'cancelled'].includes(checkJson.job.state)) {
          terminalState = checkJson.job.state;
          break;
        }
      }
      assert.ok(terminalState === 'complete' || terminalState === 'partial', `Expected complete/partial, got ${terminalState}`);

      const pf = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'my-farms-portfolio.json'), 'utf8'));
      const mw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'maps-workspace.json'), 'utf8'));

      const farmMeta = pf.farmMeta[draft.farmId];
      assert.ok(farmMeta, 'Synced farmMeta must exist');
      assert.equal(farmMeta.soil.moistureUnit, 'unspecified');
      assert.equal(farmMeta.soil.moistureDepth, '');

      const syncedSnap = pf.snapshots.find((s: { farmId: string }) => s.farmId === draft.farmId);
      assert.ok(syncedSnap, 'Synced portfolio snapshot must exist');
      assert.equal('confidencePct' in syncedSnap, false, 'Synced snapshot must NOT emit fabricated confidencePct');
      assert.ok(syncedSnap.soilContext, 'Synced snapshot must include Stage 1A soilContext');
      assert.equal(syncedSnap.soilContext.moistureUnit, 'unspecified');
      assert.equal(syncedSnap.soilContext.phStatus, 'tested');

      const mapFarm = (mw.farms || []).find((f: { id: string }) => f.id === draft.farmId);
      assert.ok(mapFarm, 'Synced maps farm must exist');
      if (mapFarm?.assessment) {
        assert.equal('confidence' in mapFarm.assessment, false, 'Maps farm assessment must NOT emit synthetic confidence');
      }
    } finally {
      server.close();
    }
    console.log('PASS: 2. Stage 1A hardening on router sync & rotation draft mapping verified');

    // 3. SSR verification for Questions, Header, MyFarms, Rotation
    clearActiveQuestionnaireDraft();
    const headerWithoutDraftHtml = renderToStaticMarkup(
      wrap('/', React.createElement(Header, { theme: 'dark', onToggleTheme: () => undefined, overlay: true }))
    );
    assert.ok(headerWithoutDraftHtml.includes('My Farms'), 'Header must render core nav items');
    assert.equal(headerWithoutDraftHtml.includes('href="/questions"'), false, 'Header omits Questions nav pill when no active draft on /');

    saveActiveQuestionnaireDraft(draft);
    const headerWithDraftHtml = renderToStaticMarkup(
      wrap('/', React.createElement(Header, { theme: 'dark', onToggleTheme: () => undefined, overlay: true }))
    );
    assert.ok(headerWithDraftHtml.includes('href="/questions"'), 'Header must dynamically show Questions nav item when active draft exists');
    clearActiveQuestionnaireDraft();

    const headerSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Header.tsx'), 'utf8');
    assert.ok(headerSrc.includes("navigate('/questions?mode=create&new=1')") && headerSrc.includes('Guided Field Questionnaire'));

    const questionsHtml = renderToStaticMarkup(
      wrap('/questions?mode=create&new=1', React.createElement(Questions, { theme: 'dark' }))
    );
    assert.ok(questionsHtml.length > 500, 'Questions page dark SSR must render substantive UI');
    assert.ok(questionsHtml.includes('fs-qst-topbar'), 'Questions dark SSR must render fs-qst-topbar');
    assert.ok(questionsHtml.includes('fs-qst-panel'), 'Questions dark SSR must render fs-qst-panel');
    assert.ok(questionsHtml.includes('fs-qst-option'), 'Questions dark SSR must render fs-qst-option');

    const questionsLightHtml = renderToStaticMarkup(
      wrap('/questions?mode=create&new=1', React.createElement(Questions, { theme: 'light' }))
    );
    assert.ok(questionsLightHtml.length > 500, 'Questions page light SSR must render substantive UI');
    assert.ok(questionsLightHtml.includes('fs-qst-topbar'), 'Questions light SSR must render fs-qst-topbar');
    assert.ok(questionsLightHtml.includes('fs-qst-panel'), 'Questions light SSR must render fs-qst-panel');
    assert.ok(questionsLightHtml.includes('fs-qst-option'), 'Questions light SSR must render fs-qst-option');

    const { QuestionReviewPanel } = await import('../src/components/questions/QuestionReviewPanel');
    const { LiveAssessmentScreen } = await import('../src/components/questions/LiveAssessmentScreen');
    const { QuestionAnswerControls } = await import('../src/components/questions/QuestionAnswerControls');
    const { ALL_QUESTION_BY_ID } = await import('../src/lib/questionnaireSchema');

    const reviewHtml = renderToStaticMarkup(
      wrap(
        '/questions',
        React.createElement(QuestionReviewPanel, {
          draft,
          isLight: true,
          submitting: false,
          onEditQuestion: () => undefined,
          onStartDeeperAccuracy: () => undefined,
          onToggleConsent: () => undefined,
          onRunAssessment: () => undefined,
        })
      )
    );
    assert.ok(reviewHtml.includes('fs-qst-subpanel'), 'QuestionReviewPanel SSR must use fs-qst-subpanel');
    assert.ok(reviewHtml.includes('Get rotations now'), 'QuestionReviewPanel SSR must preserve Get rotations now CTA');

    const assessmentHtml = renderToStaticMarkup(
      wrap(
        '/questions',
        React.createElement(LiveAssessmentScreen, {
          job: {
            jobId: 'job_ssr_1',
            questionnaireId: draft.questionnaireId,
            inputSnapshotId: snap.inputSnapshotId,
            farmId: draft.farmId,
            fieldId: draft.fieldId,
            idempotencyKey: 'idem_ssr',
            correlationId: 'corr_ssr_1',
            farmName: 'Stage1A Integration Farm',
            fieldName: 'Block Alpha',
            state: 'running',
            currentStageKey: 'retrieve_evidence',
            startedAt: new Date().toISOString(),
            completedAt: null,
            totalDurationMs: null,
            cancelRequested: false,
            events: [
              {
                eventId: 'ev_1',
                jobId: 'job_ssr_1',
                stageKey: 'validate_inputs',
                label: 'Checking coordinates',
                detail: 'Validating WGS84 pin',
                state: 'complete',
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                durationMs: 120,
                timestamp: new Date().toISOString(),
                correlationId: 'corr_ssr_1',
              },
            ],
            result: null,
          },
          isLight: false,
          onJobUpdated: () => undefined,
          onContinueToRotation: () => undefined,
          onBackToReview: () => undefined,
        })
      )
    );
    assert.ok(assessmentHtml.includes('fs-qst-subpanel'), 'LiveAssessmentScreen SSR must use fs-qst-subpanel');
    assert.ok(assessmentHtml.includes('Action history'), 'LiveAssessmentScreen SSR must render Action history');

    const q17Html = renderToStaticMarkup(
      wrap(
        '/questions',
        React.createElement(QuestionAnswerControls, {
          question: ALL_QUESTION_BY_ID['Q17'],
          draft,
          isLight: true,
          savedFarms: [],
          savedFields: [],
          onSaveAnswer: () => undefined,
          onSelectMode: () => undefined,
          onSelectExistingFarm: () => undefined,
          onSelectExistingField: () => undefined,
          onConfirmLocation: () => undefined,
          onUpdateGeometry: () => undefined,
          onUpdateTimezone: () => undefined,
        })
      )
    );
    assert.ok(q17Html.includes('fs-qst-option'), 'Q17 QuestionAnswerControls SSR must use fs-qst-option');

    for (const rel of [
      'src/pages/Questions.tsx',
      'src/components/questions/QuestionAnswerControls.tsx',
      'src/components/questions/QuestionLocationControl.tsx',
      'src/components/questions/QuestionReviewPanel.tsx',
      'src/components/questions/LiveAssessmentScreen.tsx',
    ]) {
      const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      assert.equal(content.includes('fs-dash-'), false, `${rel} must not contain leftover fs-dash-* classes`);
    }

    const myFarmsHtml = renderToStaticMarkup(
      wrap('/my-farms', React.createElement(MyFarms))
    );
    assert.ok(myFarmsHtml.includes('Guided Questionnaire'), 'MyFarms must expose Guided Questionnaire button');
    assert.ok(myFarmsHtml.includes('Add Farm'), 'MyFarms must preserve Add Farm button');

    const rotationHtml = renderToStaticMarkup(
      wrap('/rotation', React.createElement(Rotation))
    );
    assert.ok(rotationHtml.includes('Questions'), 'Rotation must expose Questions button');
    assert.ok(rotationHtml.includes('Compare Any 2 Rotations'), 'Rotation Batch 2/2.1 Comparison section must remain intact');

    const rotationSnapshotHtml = renderToStaticMarkup(
      wrap(`/rotation?snapshotId=${encodeURIComponent(snap.inputSnapshotId)}`, React.createElement(Rotation))
    );
    assert.ok(rotationSnapshotHtml.length > 500, 'Rotation ?snapshotId= route SSR must render cleanly');

    console.log('PASS: 3. SSR checks passed for Questions (dark & light), Review, LiveAssessment, Q17, Header, MyFarms, and Rotation');
  } finally {
    restoreDataFiles(backups);
  }
}

run().catch((err) => {
  console.error('Questions integration verification failed:', err);
  process.exit(1);
});
