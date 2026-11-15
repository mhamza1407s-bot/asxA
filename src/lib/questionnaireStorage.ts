import {
  AssessmentResultBundle,
  ImmutableInputSnapshot,
  QuestionnaireDraft,
  QuestionnaireMode,
} from '../types/questionnaire';

const ACTIVE_DRAFT_KEY = 'anchor_active_questionnaire_draft_v1';
const SNAPSHOT_CACHE_KEY = 'anchor_questionnaire_snapshots_v1';
const ACTIVE_JOB_KEY = 'anchor_active_assessment_job_v1';

export const QUESTIONNAIRE_CHANGED_EVENT = 'anchor:questionnaire-changed';

export function emitQuestionnaireChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(QUESTIONNAIRE_CHANGED_EVENT));
}

export function createBlankQuestionnaireDraft(mode: QuestionnaireMode = 'create'): QuestionnaireDraft {
  const now = new Date().toISOString();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const farmId = mode === 'create' ? `farm-${suffix}` : '';
  const fieldId = mode === 'create' ? `field-${suffix}` : '';
  const questionnaireId = `qst_${suffix}`;

  return {
    questionnaireId,
    schemaVersion: 1,
    profileVersion: 1,
    mode,
    setupIntent: mode === 'edit' ? 'new_field_existing_farm' : undefined,
    experienceMode: 'simple',
    refinementQuestionIds: [],
    status: 'in_progress',
    farmId,
    fieldId,
    currentQuestionId: 'SIMPLE_1',
    visitedQuestionIds: ['SIMPLE_1'],
    answers: {
      Q00: {
        answerId: `ans_Q00_${Date.now()}`,
        questionId: 'Q00',
        questionVersion: 1,
        farmId,
        fieldId,
        questionnaireId,
        profileVersion: 1,
        value: mode,
        scope: 'field',
        sourceType: 'farmer_reported',
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
      Q29: {
        answerId: `ans_Q29_${Date.now()}`,
        questionId: 'Q29',
        questionVersion: 1,
        farmId,
        fieldId,
        questionnaireId,
        profileVersion: 1,
        value: { seasons: 3, basis: 'seasons' },
        scope: 'field',
        sourceType: 'derived',
        notes: 'Disclosed Simple Mode default (3 growing seasons; editable in review)',
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
      Q37: {
        answerId: `ans_Q37_${Date.now()}`,
        questionId: 'Q37',
        questionVersion: 1,
        farmId,
        fieldId,
        questionnaireId,
        profileVersion: 1,
        value: { presetId: 'balanced', customize: false },
        scope: 'field',
        sourceType: 'farmer_reported',
        notes: 'Balanced plan preselected default (visible and editable)',
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
    },
    location: null,
    geometry: {
      geometryStatus: 'none',
      polygon: null,
      geodesicAreaHa: null,
      perimeterM: null,
      centroid: null,
      areaMethod: null,
      crs: 'EPSG:4326',
      geometryVersion: 0,
    },
    consent: {
      consentId: `consent_${suffix}`,
      acceptedRemoteFetch: false,
      policyScope: 'approved_sources_only',
      sharedScopeDescription:
        'Only confirmed field coordinates, boundary geometry (if provided), and requested date windows are sent to Open-Meteo and NASA POWER.',
      acceptedAt: null,
      revokedAt: null,
    },
    serverSyncedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function loadActiveQuestionnaireDraft(): QuestionnaireDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuestionnaireDraft;
    if (!parsed || typeof parsed.questionnaireId !== 'string') return null;
    if (parsed.status !== 'in_progress') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveQuestionnaireDraft(draft: QuestionnaireDraft): void {
  if (typeof window === 'undefined') return;
  try {
    const toSave: QuestionnaireDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
    };
    if (toSave.status !== 'in_progress') {
      window.localStorage.removeItem(ACTIVE_DRAFT_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(toSave));
    }
    emitQuestionnaireChanged();
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function clearActiveQuestionnaireDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACTIVE_DRAFT_KEY);
    window.localStorage.removeItem(ACTIVE_JOB_KEY);
    emitQuestionnaireChanged();
  } catch {
    // Ignore
  }
}

/**
 * Controls whether the "Questions" item appears in the global Header navbar.
 * Returns true ONLY while a questionnaire session is open / half-answered (in_progress).
 */
export function hasActiveIncompleteQuestionnaireDraft(): boolean {
  const draft = loadActiveQuestionnaireDraft();
  return Boolean(draft && draft.status === 'in_progress');
}

export function saveActiveAssessmentJobId(jobId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!jobId) window.localStorage.removeItem(ACTIVE_JOB_KEY);
    else window.localStorage.setItem(ACTIVE_JOB_KEY, jobId);
  } catch {
    // Ignore
  }
}

export function loadActiveAssessmentJobId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_JOB_KEY);
  } catch {
    return null;
  }
}

export function saveLocalSnapshotBundle(
  snapshot: ImmutableInputSnapshot,
  result?: AssessmentResultBundle | null
): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_CACHE_KEY);
    const list: Array<{ snapshot: ImmutableInputSnapshot; result: AssessmentResultBundle | null }> = raw
      ? JSON.parse(raw)
      : [];
    const next = [
      { snapshot, result: result ?? null },
      ...list.filter((item) => item.snapshot?.inputSnapshotId !== snapshot.inputSnapshotId),
    ].slice(0, 15);
    window.localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
}

export function loadLocalSnapshotBundle(
  snapshotId: string
): { snapshot: ImmutableInputSnapshot; result: AssessmentResultBundle | null } | null {
  if (typeof window === 'undefined' || !snapshotId) return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const list: Array<{ snapshot: ImmutableInputSnapshot; result: AssessmentResultBundle | null }> =
      JSON.parse(raw);
    return list.find((item) => item.snapshot?.inputSnapshotId === snapshotId) ?? null;
  } catch {
    return null;
  }
}
