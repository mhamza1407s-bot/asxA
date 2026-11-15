import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createQuestionnaireRouter } from '../server/questionnaireRouter';
import {
  analyzeMissingDataAndReview,
  areaToHectares,
  buildImmutableSnapshot,
  computeDailyGdd,
  ecToDsM,
  estimateEffectiveRainfallMm,
  evaluateSnapshotAssessment,
  extractDailyClimateFeatures,
  normalizePriorityVector,
  normalizeSoilOrganic,
  waterVolumeToMm,
} from '../src/lib/questionnaireEngine';
import {
  getActiveQuestionRoute,
  getVisibleQuestionRoute,
  selectHighImpactRefinementIds,
} from '../src/lib/questionnaireSchema';
import { createBlankQuestionnaireDraft } from '../src/lib/questionnaireStorage';
import { CanonicalAnswer, EnvironmentalEvidenceSummary, QuestionnaireDraft } from '../src/types/questionnaire';

function makeAns(draft: QuestionnaireDraft, qId: string, value: unknown, sourceType: CanonicalAnswer['sourceType'] = 'farmer_reported'): CanonicalAnswer {
  const now = new Date().toISOString();
  return {
    answerId: `a_${qId}`,
    questionId: qId,
    questionVersion: 1,
    farmId: draft.farmId,
    fieldId: draft.fieldId,
    questionnaireId: draft.questionnaireId,
    profileVersion: 1,
    value,
    scope: 'field',
    sourceType,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

async function runTests() {
  console.log('0. Testing v1.1 Simple Mode defaults, prefill skip, compact review & <=3 refinement...');
  const freshSimple = createBlankQuestionnaireDraft('create');
  assert.equal(freshSimple.experienceMode, 'simple');
  assert.equal(freshSimple.currentQuestionId, 'SIMPLE_1');
  assert.equal((freshSimple.answers.Q29?.value as { seasons?: number })?.seasons, 3);
  assert.equal((freshSimple.answers.Q37?.value as { presetId?: string })?.presetId, 'balanced');

  const simpleRoute = getActiveQuestionRoute(freshSimple).map((q) => q.id);
  assert.deepEqual(simpleRoute, ['SIMPLE_1', 'SIMPLE_2', 'SIMPLE_3', 'SIMPLE_4', 'SIMPLE_5', 'REVIEW']);

  const newFarmDraft = createBlankQuestionnaireDraft('create');
  newFarmDraft.setupIntent = 'new_farm';
  newFarmDraft.answers.Q01 = makeAns(newFarmDraft, 'Q01', { mode: 'new', farmId: newFarmDraft.farmId, farmName: 'Single Field Ranch' });
  newFarmDraft.answers.Q02 = makeAns(newFarmDraft, 'Q02', { mode: 'whole_farm', fieldId: newFarmDraft.fieldId, fieldName: 'Primary Field' });
  newFarmDraft.answers.Q03 = makeAns(newFarmDraft, 'Q03', 'Primary Field');
  newFarmDraft.location = {
    locationMethod: 'saved_location',
    latitude: 36.7,
    longitude: -119.7,
    timezone: 'America/Los_Angeles',
    placeLabel: 'Fresno',
    confirmedByUser: true,
    confirmedAt: new Date().toISOString(),
    locationVersion: 1,
    spatialPrecisionLabel: 'field_pin',
  };
  newFarmDraft.answers.Q17 = makeAns(newFarmDraft, 'Q17', 'rainfall_only');
  newFarmDraft.answers.Q25 = makeAns(newFarmDraft, 'Q25', { mode: 'new_field', records: [] });
  newFarmDraft.consent.acceptedRemoteFetch = true;
  newFarmDraft.consent.acceptedAt = new Date().toISOString();
  const newFarmReview = analyzeMissingDataAndReview(newFarmDraft);
  assert.equal(newFarmReview.canRunAssessment, true);
  const newFarmSnap = buildImmutableSnapshot(newFarmDraft, 1);
  assert.equal(newFarmSnap.farmName, 'Single Field Ranch');
  assert.equal(newFarmSnap.fieldName, 'Primary Field');

  const newFieldExistingFarmDraft = createBlankQuestionnaireDraft('create');
  newFieldExistingFarmDraft.setupIntent = 'new_field_existing_farm';
  newFieldExistingFarmDraft.farmId = 'existing_farm_1';
  newFieldExistingFarmDraft.answers.Q01 = makeAns(newFieldExistingFarmDraft, 'Q01', { mode: 'existing', farmId: 'existing_farm_1', farmName: 'Valley Crest' });
  newFieldExistingFarmDraft.answers.Q02 = makeAns(newFieldExistingFarmDraft, 'Q02', { mode: 'new', fieldId: newFieldExistingFarmDraft.fieldId, fieldName: 'South Terrace' });
  newFieldExistingFarmDraft.answers.Q03 = makeAns(newFieldExistingFarmDraft, 'Q03', 'South Terrace');
  newFieldExistingFarmDraft.answers.Q17 = makeAns(newFieldExistingFarmDraft, 'Q17', 'both');
  newFieldExistingFarmDraft.answers.Q25 = makeAns(newFieldExistingFarmDraft, 'Q25', { mode: 'dont_remember', records: [] });
  newFieldExistingFarmDraft.location = newFarmDraft.location;
  newFieldExistingFarmDraft.consent = newFarmDraft.consent;
  const newFieldSnap = buildImmutableSnapshot(newFieldExistingFarmDraft, 1);
  assert.equal(newFieldSnap.canRunAssessment, true);
  assert.equal(newFieldSnap.farmName, 'Valley Crest');
  assert.equal(newFieldSnap.fieldName, 'South Terrace');

  const prefilledEdit = createBlankQuestionnaireDraft('edit');
  prefilledEdit.answers.Q01 = makeAns(prefilledEdit, 'Q01', { mode: 'existing', farmId: 'f1', farmName: 'Saved Farm' });
  prefilledEdit.answers.Q03 = makeAns(prefilledEdit, 'Q03', 'North Block');
  prefilledEdit.location = {
    locationMethod: 'saved_location',
    latitude: 36.7,
    longitude: -119.7,
    timezone: 'America/Los_Angeles',
    placeLabel: 'Fresno',
    confirmedByUser: true,
    confirmedAt: new Date().toISOString(),
    locationVersion: 1,
    spatialPrecisionLabel: 'field_pin',
  };
  prefilledEdit.currentQuestionId = 'SIMPLE_3';
  const skippedStep1Route = getActiveQuestionRoute(prefilledEdit).map((q) => q.id);
  assert.deepEqual(skippedStep1Route, ['SIMPLE_3', 'SIMPLE_4', 'SIMPLE_5', 'REVIEW']);

  prefilledEdit.answers.Q17 = makeAns(prefilledEdit, 'Q17', 'rainfall_only');
  const rainfedRefinement = selectHighImpactRefinementIds(prefilledEdit);
  assert.ok(rainfedRefinement.length <= 3 && rainfedRefinement.length > 0);
  assert.ok(!rainfedRefinement.includes('Q19'), 'Rain-fed field must not ask irrigation method');

  const simpleReview = analyzeMissingDataAndReview(prefilledEdit);
  const reviewRowIds = simpleReview.reviewRows.map((r) => r.questionId);
  assert.ok(!reviewRowIds.includes('Q04'), 'Simple review must omit unasked Q04');
  assert.ok(!reviewRowIds.includes('Q35'), 'Simple review must omit unasked Q35');
  assert.ok(!reviewRowIds.includes('Q41'), 'Simple review must omit unasked Q41');

  console.log('1. Testing unit conversions & soil/water normalization...');
  assert.equal(Math.round(areaToHectares(10, 'acres').hectares * 1000) / 1000, 4.047);
  assert.equal(areaToHectares(25000, 'm2').hectares, 2.5);
  assert.equal(ecToDsM(1500, 'uS/cm').dsPerM, 1.5);
  assert.equal(ecToDsM(2.2, 'mS/cm').dsPerM, 2.2);

  const omCheck = normalizeSoilOrganic({
    status: 'measured',
    kind: 'organic_matter',
    value: 3.448,
    unit: '%',
    method: 'LOI',
    sampleDate: '2026-01-10',
    depthValue: 15,
    depthUnit: 'cm',
  });
  assert.equal(omCheck.organicMatterPct, 3.448);
  assert.equal(Math.round((omCheck.organicCarbonPct || 0) * 100) / 100, 2);

  // 100 m3 over 2 ha = 5 mm (100 * 1000 L / (2 * 10,000) = 5)
  assert.equal(waterVolumeToMm(100, 'm3', 2).mm, 5);
  assert.equal(waterVolumeToMm(100, 'm3', null).mm, null);

  console.log('2. Testing priority normalization, GDD, Peff & multi-year climate extraction...');
  const norm = normalizePriorityVector({
    presetId: 'custom',
    waterEfficiency: 80,
    soilImprovement: 40,
    climateResilience: 40,
    cropSuitability: 20,
    productivityPotential: 20,
  });
  const sum =
    norm.waterEfficiency +
    norm.soilImprovement +
    norm.climateResilience +
    norm.cropSuitability +
    norm.productivityPotential;
  assert.ok(Math.abs(sum - 1) < 1e-6);

  assert.equal(computeDailyGdd(12, 28, 10, 30), 10);
  assert.equal(computeDailyGdd(4, 8, 10, 30), 0);
  assert.ok(estimateEffectiveRainfallMm(100) > 0 && estimateEffectiveRainfallMm(100) < 100);

  // Only 2 years -> dryTypicalWetYears must honestly say unavailable
  const twoYrSeries = Array.from({ length: 730 }, (_, i) => {
    const d = new Date(Date.UTC(2023, 0, 1 + i));
    return {
      date: d.toISOString().slice(0, 10),
      tminC: 10,
      tmaxC: 24,
      tmeanC: 17,
      precipMm: 1.5,
      et0Mm: 3.5,
    };
  });
  const feat = extractDailyClimateFeatures(twoYrSeries);
  assert.equal(feat.dryTypicalWetYears.available, false);

  console.log('3. Testing conditional branching (Q00-Q41)...');
  const rainfedDraft = createBlankQuestionnaireDraft('create');
  rainfedDraft.answers.Q10 = makeAns(rainfedDraft, 'Q10', 'no');
  rainfedDraft.answers.Q17 = makeAns(rainfedDraft, 'Q17', 'rainfall_only');
  rainfedDraft.answers.Q34 = makeAns(rainfedDraft, 'Q34', ['no_till']);
  rainfedDraft.answers.Q37 = makeAns(rainfedDraft, 'Q37', { presetId: 'balanced', customize: false });
  const rainfedIds = getVisibleQuestionRoute(rainfedDraft).map((q) => q.id);
  assert.ok(!rainfedIds.includes('Q11'));
  assert.ok(!rainfedIds.includes('Q18'));
  assert.ok(!rainfedIds.includes('Q22'));
  assert.ok(!rainfedIds.includes('Q35'));
  assert.ok(!rainfedIds.includes('Q38'));

  const irrDraft = createBlankQuestionnaireDraft('create');
  irrDraft.answers.Q10 = makeAns(irrDraft, 'Q10', 'yes_full');
  irrDraft.answers.Q17 = makeAns(irrDraft, 'Q17', 'irrigation_only');
  irrDraft.answers.Q34 = makeAns(irrDraft, 'Q34', ['synthetic_fertilizer']);
  irrDraft.answers.Q37 = makeAns(irrDraft, 'Q37', { presetId: 'custom', customize: true });
  const irrIds = getVisibleQuestionRoute(irrDraft).map((q) => q.id);
  assert.ok(irrIds.includes('Q11') && irrIds.includes('Q12'));
  assert.ok(irrIds.includes('Q18') && irrIds.includes('Q22') && irrIds.includes('Q24'));
  assert.ok(irrIds.includes('Q35') && irrIds.includes('Q38'));

  console.log('4. Testing deterministic snapshot & hard-gate weighted-geometric evaluation...');
  const fullDraft = createBlankQuestionnaireDraft('create');
  fullDraft.location = {
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
  fullDraft.consent.acceptedRemoteFetch = true;
  fullDraft.consent.acceptedAt = new Date().toISOString();
  fullDraft.answers.Q01 = makeAns(fullDraft, 'Q01', { mode: 'new', farmId: fullDraft.farmId, farmName: 'San Joaquin Test Ranch' });
  fullDraft.answers.Q03 = makeAns(fullDraft, 'Q03', 'West Block');
  fullDraft.answers.Q09 = makeAns(fullDraft, 'Q09', 'loam');
  fullDraft.answers.Q10 = makeAns(fullDraft, 'Q10', 'yes_full');
  fullDraft.answers.Q11 = makeAns(fullDraft, 'Q11', {
    status: 'measured',
    value: 7.1,
    method: '1:1',
    sampleDate: '2026-02-15',
    depthValue: 15,
    depthUnit: 'cm',
  }, 'lab_result');
  fullDraft.answers.Q12 = makeAns(fullDraft, 'Q12', {
    status: 'measured',
    value: 6.2, // High salinity -> should hard-fail sensitive crops like maize/soybean!
    unit: 'dS/m',
    extractMethod: 'saturated_paste',
    sampleDate: '2026-02-15',
    depthValue: 15,
    depthUnit: 'cm',
  }, 'lab_result');
  fullDraft.answers.Q17 = makeAns(fullDraft, 'Q17', 'both');
  fullDraft.answers.Q25 = makeAns(fullDraft, 'Q25', { mode: 'new_field', records: [] });
  fullDraft.answers.Q29 = makeAns(fullDraft, 'Q29', { seasons: 4, basis: 'seasons' });
  fullDraft.answers.Q32 = makeAns(fullDraft, 'Q32', { none: true, crops: [] });
  fullDraft.answers.Q33 = makeAns(fullDraft, 'Q33', { none: true, crops: [] });
  fullDraft.answers.Q37 = makeAns(fullDraft, 'Q37', { presetId: 'save_water', customize: false });

  const snap1 = buildImmutableSnapshot(fullDraft, 1);
  const snap2 = buildImmutableSnapshot(fullDraft, 1);
  assert.equal(snap1.inputHash, snap2.inputHash);
  assert.equal(snap1.canRunAssessment, true);

  const mockEvidence: EnvironmentalEvidenceSummary = {
    sourceCoverageId: 'ev_test',
    retrievedAt: new Date().toISOString(),
    spatialResolutionNote: 'Test grid',
    connectors: [
      { id: 'open_meteo_forecast', name: 'Open-Meteo Forecast', status: 'success', provenanceLabel: 'Live', variables: ['temp'], note: 'ok' },
      { id: 'open_meteo_archive', name: 'Open-Meteo ERA5', status: 'success', provenanceLabel: 'ERA5', variables: ['temp'], note: 'ok' },
      { id: 'nasa_power', name: 'NASA POWER', status: 'success', provenanceLabel: 'POWER', variables: ['solar'], note: 'ok' },
      { id: 'soilgrids_isric', name: 'SoilGrids', status: 'unavailable', provenanceLabel: 'Paused', variables: [], note: 'paused' },
    ],
    historicalClimate: {
      yearsCovered: 5,
      sampleDays: 1825,
      period: '2021–2025',
      meanAnnualTempC: 18.2,
      meanAnnualPrecipMm: 290,
      meanAnnualEt0Mm: 1450,
      frostDaysPerYear: 10,
      heatDaysOver35PerYear: 48,
      maxDrySpellDays: 95,
      gddBase10Annual: 3100,
      dryTypicalWetYears: { available: true, dryYear: { year: 2021, precipMm: 180 }, typicalYear: { year: 2023, precipMm: 290 }, wetYear: { year: 2024, precipMm: 410 } },
      sourceLabel: 'ERA5',
    },
  };

  const res1 = evaluateSnapshotAssessment(snap1, mockEvidence);
  const res2 = evaluateSnapshotAssessment(snap1, mockEvidence);
  assert.deepEqual(res1.candidateSequences, res2.candidateSequences);
  const maizeFit = res1.cropSuitability.find((c) => c.cropId === 'maize');
  const barleyFit = res1.cropSuitability.find((c) => c.cropId === 'barley');
  assert.equal(maizeFit?.status, 'infeasible', 'Maize should fail salinity gate at 6.2 dS/m');
  assert.notEqual(barleyFit?.status, 'infeasible', 'Barley tolerates 6.2 dS/m');

  console.log('5. Testing Express questionnaireRouter endpoints (ephemeral server)...');
  const app = express();
  app.use(express.json());
  app.use('/api', createQuestionnaireRouter());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 3000}`;

  try {
    const regRes = await fetch(`${baseUrl}/api/questionnaires/rotation/v1`);
    assert.equal(regRes.status, 200);
    const regJson = (await regRes.json()) as { connectors: Array<{ id: string; status: string }> };
    const soilgrids = regJson.connectors.find((c) => c.id === 'isric_soilgrids');
    assert.equal(soilgrids?.status, 'unavailable_paused');

    const createRes = await fetch(`${baseUrl}/api/rotation-questionnaires`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullDraft),
    });
    assert.equal(createRes.status, 201);

    const geomRes = await fetch(`${baseUrl}/api/fields/${encodeURIComponent(fullDraft.fieldId)}/geometry/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygon: {
          type: 'Polygon',
          coordinates: [
            [
              [-119.775, 36.745],
              [-119.770, 36.745],
              [-119.770, 36.750],
              [-119.775, 36.750],
              [-119.775, 36.745],
            ],
          ],
        },
      }),
    });
    assert.equal(geomRes.status, 200);
    const geomJson = (await geomRes.json()) as { ok: boolean; areaHa: number };
    assert.equal(geomJson.ok, true);
    assert.ok(geomJson.areaHa > 15 && geomJson.areaHa < 40);

    const reviewRes = await fetch(`${baseUrl}/api/rotation-questionnaires/${encodeURIComponent(fullDraft.questionnaireId)}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: fullDraft }),
    });
    assert.equal(reviewRes.status, 200);
    const reviewJson = (await reviewRes.json()) as { snapshot: { inputSnapshotId: string } };
    assert.ok(reviewJson.snapshot.inputSnapshotId.startsWith('snap_'));

    const jobRes = await fetch(`${baseUrl}/api/rotation-assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionnaireId: fullDraft.questionnaireId,
        inputSnapshotId: reviewJson.snapshot.inputSnapshotId,
        idempotencyKey: `idem_${Date.now()}`,
        draft: fullDraft,
      }),
    });
    assert.equal(jobRes.status, 202);
    const jobJson = (await jobRes.json()) as { job: { jobId: string } };
    assert.ok(jobJson.job.jobId.startsWith('job_'));

    // Poll until terminal state (tests live Open-Meteo + NASA POWER or graceful offline handling)
    let terminalState = '';
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const checkRes = await fetch(`${baseUrl}/api/rotation-assessments/${encodeURIComponent(jobJson.job.jobId)}`);
      const checkJson = (await checkRes.json()) as { job: { state: string; events: unknown[] } };
      if (['complete', 'partial', 'failed', 'cancelled'].includes(checkJson.job.state)) {
        terminalState = checkJson.job.state;
        assert.ok(checkJson.job.events.length >= 4);
        break;
      }
    }
    assert.ok(terminalState === 'complete' || terminalState === 'partial', `Expected complete/partial, got ${terminalState}`);
    console.log(`ALL QUESTIONNAIRE ENGINE & API TESTS PASSED (job terminal state: ${terminalState}).`);
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
