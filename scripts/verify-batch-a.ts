import { register } from 'node:module';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';

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

// Minimal in-memory browser global shim so syncFarmToLocalProfiles runs identically under Node/tsx
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
    throw new Error(`Assertion failed: ${msg}\n  Expected: ${String(expected)}\n  Actual:   ${String(actual)}`);
  }
}

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed++;
  console.log(`PASS: ${name}`);
}

async function run(): Promise<void> {
  const { createMyFarmsRouter } = await import('../server/myFarmsRouter');
  const { loadFarmProfiles, parseImportedFarmProfilesJson } = await import('../src/lib/farmStorage');
  const { buildAssessedFarmRecord, syncFarmToLocalProfiles } = await import('../src/lib/myFarmsEngine');
  const { resolveEffectiveFieldSoil } = await import('../src/lib/soilProvenance');
  type MyFarmRecord = import('../src/types/myFarms').MyFarmRecord;
  type SoilLandProfile = import('../src/types/myFarms').SoilLandProfile;

  const baseMeasuredFarmSoil: SoilLandProfile = {
    texture: 'Clay loam',
    moistureStatus: 'measured',
    moisturePct: 31,
    moistureUnit: 'volumetric_vwc',
    moistureDepth: '0-20 cm',
    moistureMethod: 'TDR Probe',
    moistureDate: '2026-11-09',
    phStatus: 'tested',
    phValue: 6.5,
    phTestDate: '2026-10-28',
    organicMatterPct: 3.4,
    drainage: 'Moderately',
    slopePct: 2.0,
    elevationM: 75,
    preparationMethods: [],
    notes: '',
  };

  await test('1. Undefined field overrides inherit farm soil, moisture unit/depth/method/date, and pH', () => {
    const resolvedUndefined = resolveEffectiveFieldSoil(baseMeasuredFarmSoil, undefined);
    assertEqual(resolvedUndefined.texture, 'Clay loam', 'inherits texture');
    assertEqual(resolvedUndefined.textureSource, 'farm', 'texture provenance');
    assertEqual(resolvedUndefined.moistureStatus, 'measured', 'inherits moistureStatus');
    assertEqual(resolvedUndefined.moisturePct, 31, 'inherits moisturePct');
    assertEqual(resolvedUndefined.moistureUnit, 'volumetric_vwc', 'inherits moistureUnit');
    assertEqual(resolvedUndefined.moistureDepth, '0-20 cm', 'inherits moistureDepth');
    assertEqual(resolvedUndefined.moistureMethod, 'TDR Probe', 'inherits moistureMethod');
    assertEqual(resolvedUndefined.moistureDate, '2026-11-09', 'inherits moistureDate');
    assertEqual(resolvedUndefined.moistureSource, 'farm_measured', 'moistureSource');
    assertEqual(resolvedUndefined.isVwcCompatibleForBalance, true, 'VWC compatible when volumetric_vwc');
    assertEqual(resolvedUndefined.phStatus, 'tested', 'inherits phStatus');
    assertEqual(resolvedUndefined.phValue, 6.5, 'inherits phValue');
    assertEqual(resolvedUndefined.phTestDate, '2026-10-28', 'inherits phTestDate');

    const resolvedEmpty = resolveEffectiveFieldSoil(baseMeasuredFarmSoil, {});
    assertEqual(resolvedEmpty.moisturePct, 31, 'empty override inherits moisturePct');
    assertEqual(resolvedEmpty.phValue, 6.5, 'empty override inherits phValue');
  });

  await test('2. Explicit unknown moisture override suppresses farm-level measured moisture inheritance', () => {
    const resolved = resolveEffectiveFieldSoil(baseMeasuredFarmSoil, {
      moistureStatus: 'unknown',
    });
    assertEqual(resolved.moistureStatus, 'unknown', 'moistureStatus suppressed to unknown');
    assertEqual(resolved.moisturePct, null, 'moisturePct suppressed to null');
    assertEqual(resolved.moistureUnit, 'unspecified', 'moistureUnit reset to unspecified');
    assertEqual(resolved.moistureMethod, '', 'farm method cleared');
    assertEqual(resolved.moistureSource, 'field_suppressed', 'source flagged suppressed');
    assertEqual(resolved.isVwcCompatibleForBalance, false, 'excluded from VWC balance');
    assertEqual(resolved.phValue, 6.5, 'unrelated pH still inherits from farm');
  });

  await test('3. Estimated field moisture overrides measured farm moisture and provenance', () => {
    const resolved = resolveEffectiveFieldSoil(baseMeasuredFarmSoil, {
      moistureStatus: 'estimated',
      moisturePct: 26,
      moistureUnit: 'gravimetric',
      moistureDepth: '0-15 cm',
      moistureMethod: 'Hand feel',
      moistureDate: '2026-11-12',
    });
    assertEqual(resolved.moistureStatus, 'estimated', 'status is estimated');
    assertEqual(resolved.moisturePct, 26, 'uses field moisturePct');
    assertEqual(resolved.moistureUnit, 'gravimetric', 'uses field unit');
    assertEqual(resolved.moistureDepth, '0-15 cm', 'uses field depth');
    assertEqual(resolved.moistureMethod, 'Hand feel', 'does not inherit farm TDR Probe');
    assertEqual(resolved.moistureSource, 'field_estimated', 'provenance is field_estimated');
    assert(!/measured/i.test(resolved.moistureProvenanceLabel), 'provenance label must not say measured');
    assertEqual(resolved.isVwcCompatibleForBalance, false, 'gravimetric excluded from VWC balance');
  });

  await test('4. Explicit not_tested field pH override suppresses farm-level tested pH', () => {
    const resolved = resolveEffectiveFieldSoil(baseMeasuredFarmSoil, {
      phStatus: 'not_tested',
    });
    assertEqual(resolved.phStatus, 'not_tested', 'phStatus suppressed to not_tested');
    assertEqual(resolved.phValue, null, 'farm phValue 6.5 suppressed');
    assertEqual(resolved.phTestDate, '', 'farm phTestDate suppressed');
    assertEqual(resolved.phSource, 'field_suppressed', 'phSource flagged suppressed');
    assertEqual(resolved.moisturePct, 31, 'unrelated moisture still inherits from farm');
  });

  await test('5. Measured field moisture and tested field pH overrides apply independent metadata', () => {
    const resolved = resolveEffectiveFieldSoil(
      {
        ...baseMeasuredFarmSoil,
        moistureStatus: 'estimated',
        phStatus: 'not_tested',
        phValue: null,
      },
      {
        texture: 'Sandy loam',
        moistureStatus: 'measured',
        moisturePct: 22,
        moistureUnit: 'volumetric_vwc',
        moistureDepth: '0-30 cm',
        moistureMethod: 'Capacitance probe',
        moistureDate: '2026-11-14',
        phStatus: 'tested',
        phValue: 5.9,
        phTestDate: '2026-11-13',
      }
    );
    assertEqual(resolved.texture, 'Sandy loam', 'field texture override');
    assertEqual(resolved.moistureStatus, 'measured', 'field measured status');
    assertEqual(resolved.moisturePct, 22, 'field moisturePct');
    assertEqual(resolved.moistureUnit, 'volumetric_vwc', 'field moistureUnit');
    assertEqual(resolved.moistureDepth, '0-30 cm', 'field moistureDepth');
    assertEqual(resolved.moistureSource, 'field_measured', 'field_measured provenance');
    assertEqual(resolved.phStatus, 'tested', 'field tested pH status');
    assertEqual(resolved.phValue, 5.9, 'field pH value');
    assertEqual(resolved.phTestDate, '2026-11-13', 'field phTestDate');
    assertEqual(resolved.phSource, 'field_tested', 'field_tested provenance');
  });

  await test('6. Starter/tensiometer percentage without explicit VWC unit is never silently classified as VWC', () => {
    const tensiometerSoil: SoilLandProfile = {
      ...baseMeasuredFarmSoil,
      moistureStatus: 'measured',
      moisturePct: 34,
      moistureUnit: undefined, // legacy starter omission
      moistureDepth: undefined,
      moistureMethod: 'Tensiometer',
    };
    const resolved = resolveEffectiveFieldSoil(tensiometerSoil, undefined);
    assertEqual(resolved.moisturePct, 34, 'preserves observed numeric value');
    assertEqual(resolved.moistureUnit, 'unspecified', 'never defaults missing unit to VWC');
    assertEqual(resolved.isVwcCompatibleForBalance, false, 'excluded from VWC balance');
    assert(
      resolved.moistureUnitAmbiguityNote !== null && /tensiometer/i.test(resolved.moistureUnitAmbiguityNote),
      'flags tensiometer unit ambiguity explicitly'
    );

    const tensiometerEvenIfTaggedVwc = resolveEffectiveFieldSoil(
      { ...tensiometerSoil, moistureUnit: 'volumetric_vwc' },
      undefined
    );
    assertEqual(
      tensiometerEvenIfTaggedVwc.isVwcCompatibleForBalance,
      false,
      'tensiometer method still blocked from naive VWC subtraction'
    );
    assert(tensiometerEvenIfTaggedVwc.moistureUnitAmbiguityNote !== null, 'flags tension-to-VWC check');
  });

  await test('7. Legacy records (FarmProfile JSON & MyFarm snapshots) load cleanly with unit=unspecified', () => {
    const legacyExport = JSON.stringify([
      {
        id: 'legacy-farm-1',
        location: { farmName: 'Legacy Farm', lat: 44.1, lon: -123.1, locationLabel: 'OR' },
        soil: {
          texture: 'Loam',
          moistureStatus: 'measured',
          moisturePct: 29,
          moistureMethod: 'Hand probe',
          moistureDate: '2026-10-01',
          phStatus: 'tested',
          phValue: 6.4,
          phTestDate: '2026-10-01',
          drainage: 'Moderately',
        },
      },
    ]);
    const imported = parseImportedFarmProfilesJson(legacyExport);
    assertEqual(imported.length, 1, 'imports legacy profile');
    assertEqual(imported[0].soil.moistureUnit, 'unspecified', 'legacy profile defaults missing unit to unspecified');
    assertEqual(imported[0].soil.moisturePct, 29, 'preserves legacy moisture reading');

    const legacyAssessed = buildAssessedFarmRecord(
      {
        id: 'farm-legacy-meta',
        name: 'Legacy Meta Farm',
        primaryCrop: 'Wheat',
        locationLabel: 'Polk County',
        regionLabel: 'Willamette Valley',
        country: 'United States',
        timezone: 'America/Los_Angeles',
        centroid: { lat: 44.8, lon: -123.1 },
        geometry: null,
        areaUnit: 'hectares',
        declaredAreaHa: 50,
        mappedAreaHa: 50,
        perimeterM: 0,
        hasBoundary: false,
        areaGapNote: null,
        hasFieldOverlapWarning: false,
        overlapWarningDetail: null,
        isPrivate: true,
        isDraft: false,
        archivedAt: null,
        notes: '',
        versionNumber: 1,
        activePlan: null,
        recommendedPlanId: null,
        recommendedPlanTitle: null,
        soil: {
          ...baseMeasuredFarmSoil,
          moistureUnit: undefined,
          moistureDepth: undefined,
        },
        water: {
          sources: ['Rainwater collection'],
          reliability: 'Usually available',
          dailyCapacityKnown: false,
          dailyCapacityM3: null,
          qualityTested: 'Unknown',
          ecDsM: null,
          salinityPpm: null,
          qualityTestDate: '',
          wateringMethod: '',
          irrigationMethod: 'Unknown',
          irrigationFrequency: 'Unknown',
          rainfallFrequency: 'Weekly',
          estimatedDailyDemandM3: null,
          demandAssumptionNote: '',
        },
        planningHorizon: 'Next year',
        priorities: [],
        challenges: [],
        lastAssessedAt: '2026-11-10T00:00:00.000Z',
        suitabilityScore: 80,
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
      },
      [],
      [],
      []
    );
    assertEqual(legacyAssessed.soil.moisturePct, 31, 'legacy assessed farm preserves moisturePct');
  });

  await test('8. Router moisture metadata persistence, round-trip & syncFarmToLocalProfiles', async () => {
    const dataDir = path.resolve(process.cwd(), '.data');
    const portFile = path.join(dataDir, 'my-farms-portfolio.json');
    const mapsFile = path.join(dataDir, 'maps-workspace.json');
    const portBackup = fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8') : null;
    const mapsBackup = fs.existsSync(mapsFile) ? fs.readFileSync(mapsFile, 'utf8') : null;

    const app = express();
    app.use(express.json());
    app.use('/api/my-farms', createMyFarmsRouter());
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    assert(addr && typeof addr === 'object', 'ephemeral server bound');
    const baseUrl = `http://127.0.0.1:${addr.port}/api/my-farms`;

    try {
      const initialResp = await fetch(`${baseUrl}/portfolio`);
      assertEqual(initialResp.status, 200, 'GET /portfolio succeeds');
      const initialData = (await initialResp.json()) as { farms: Array<Record<string, unknown>> };
      const starterGv = initialData.farms.find((f) => f.id === 'farm-green-valley') as
        | { soil: Record<string, unknown> }
        | undefined;
      assert(starterGv, 'starter farm-green-valley exists');
      assertEqual(starterGv.soil.moistureUnit, 'unspecified', 'starter TDR observation not silently tagged as VWC');

      const createResp = await fetch(`${baseUrl}/farms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Batch A Roundtrip Farm',
          primaryCrop: 'Wheat',
          locationLabel: 'Test Valley',
          initialFieldName: 'Block A',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-123.2, 44.8],
                [-123.19, 44.8],
                [-123.19, 44.81],
                [-123.2, 44.81],
                [-123.2, 44.8],
              ],
            ],
          },
          soil: {
            texture: 'Silt loam',
            moistureStatus: 'measured',
            moisturePct: 19.5,
            moistureUnit: 'gravimetric',
            moistureDepth: '0-25 cm',
            moistureMethod: 'Oven dry core',
            moistureDate: '2026-11-14',
            phStatus: 'tested',
            phValue: 6.4,
            phTestDate: '2026-11-10',
          },
        }),
      });
      assertEqual(createResp.status, 201, 'POST /farms returns 201');
      const createdJson = (await createResp.json()) as {
        farm: MyFarmRecord;
        portfolio: { fields: Array<{ id: string; farmId: string; soilOverrides?: Record<string, unknown> }> };
      };
      assertEqual(createdJson.farm.soil.moistureUnit, 'gravimetric', 'POST persists moistureUnit');
      assertEqual(createdJson.farm.soil.moistureDepth, '0-25 cm', 'POST persists moistureDepth');

      const patchFarmResp = await fetch(`${baseUrl}/farms/${createdJson.farm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soil: {
            moistureUnit: 'volumetric_vwc',
            moistureDepth: '0-30 cm',
          },
        }),
      });
      assertEqual(patchFarmResp.status, 200, 'PATCH /farms updates soil metadata');
      const patchedFarmJson = (await patchFarmResp.json()) as { farm: import('../src/lib/myFarmsEngine').ServerRawFarmDto };
      assertEqual(patchedFarmJson.farm.soil.moistureUnit, 'volumetric_vwc', 'PATCH persists moistureUnit');
      assertEqual(patchedFarmJson.farm.soil.moistureDepth, '0-30 cm', 'PATCH persists moistureDepth');

      const assessedPatched = buildAssessedFarmRecord(patchedFarmJson.farm, [], [], []);
      syncFarmToLocalProfiles(assessedPatched);
      const localProfiles = loadFarmProfiles();
      const synced = localProfiles.find((p) => p.id === createdJson.farm.id);
      assert(synced, 'syncFarmToLocalProfiles stored profile');
      assertEqual(synced.soil.moistureUnit, 'volumetric_vwc', 'synced profile preserves moistureUnit');
      assertEqual(synced.soil.moistureDepth, '0-30 cm', 'synced profile preserves moistureDepth');

      const field = createdJson.portfolio.fields.find((f) => f.farmId === createdJson.farm.id);
      assert(field, 'initial field created');
      const patchFieldResp = await fetch(`${baseUrl}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soilOverrides: {
            moistureStatus: 'estimated',
            moisturePct: 25,
            moistureUnit: 'available_water_pct',
            moistureDepth: '0-15 cm',
            moistureMethod: 'Hand feel',
            moistureDate: '2026-11-15',
            phStatus: 'not_tested',
          },
        }),
      });
      assertEqual(patchFieldResp.status, 200, 'PATCH /fields persists full soilOverrides');
      const afterFieldPatch = (await patchFieldResp.json()) as {
        portfolio: { fields: Array<{ id: string; soilOverrides?: Record<string, unknown> }> };
      };
      const updatedField = afterFieldPatch.portfolio.fields.find((f) => f.id === field.id);
      assert(updatedField?.soilOverrides, 'soilOverrides present after PATCH');
      assertEqual(updatedField.soilOverrides.moistureUnit, 'available_water_pct', 'field override moistureUnit saved');
      assertEqual(updatedField.soilOverrides.moistureDepth, '0-15 cm', 'field override moistureDepth saved');
      assertEqual(updatedField.soilOverrides.moistureMethod, 'Hand feel', 'field override moistureMethod saved');
      assertEqual(updatedField.soilOverrides.moistureDate, '2026-11-15', 'field override moistureDate saved');
      assertEqual(updatedField.soilOverrides.phStatus, 'not_tested', 'field override phStatus saved');

      const clearFieldResp = await fetch(`${baseUrl}/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soilOverrides: null }),
      });
      assertEqual(clearFieldResp.status, 200, 'PATCH /fields accepts soilOverrides: null to revert to farm inherit');
      const afterClear = (await clearFieldResp.json()) as {
        portfolio: { fields: Array<{ id: string; soilOverrides?: Record<string, unknown> }> };
      };
      const clearedField = afterClear.portfolio.fields.find((f) => f.id === field.id);
      assertEqual(clearedField?.soilOverrides, undefined, 'cleared soilOverrides reverts to undefined');
    } finally {
      server.close();
      if (portBackup !== null) fs.writeFileSync(portFile, portBackup, 'utf8');
      if (mapsBackup !== null) fs.writeFileSync(mapsFile, mapsBackup, 'utf8');
    }
  });

  console.log(`\nBatch A Verification: ${passed} passed, 0 failed.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
