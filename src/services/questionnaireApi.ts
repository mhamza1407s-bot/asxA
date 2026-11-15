import {
  AssessmentJobRecord,
  AssessmentResultBundle,
  CanonicalAnswer,
  ExternalConnectorInfo,
  GeocodedLocationCandidate,
  ImmutableInputSnapshot,
  QuestionnaireDraft,
} from '../types/questionnaire';
import { GeoJsonPolygonGeometry } from '../types/maps';

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Unexpected response from server (${res.status}).`);
  }
  if (!res.ok) {
    const errMsg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed with HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return data as T;
}

export async function fetchQuestionnaireRegistry(): Promise<{
  schemaVersion: number;
  engineVersion: string;
  cropKnowledgeVersion: string;
  connectors: ExternalConnectorInfo[];
}> {
  const res = await fetch('/api/questionnaires/rotation/v1');
  return parseJsonOrThrow(res);
}

export async function searchLocationsApi(query: string): Promise<{
  query: string;
  candidates: GeocodedLocationCandidate[];
}> {
  const res = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`);
  return parseJsonOrThrow(res);
}

export async function resolveTimezoneApi(
  lat: number,
  lon: number
): Promise<{
  lat: number;
  lon: number;
  timezone: string;
  elevationM: number | null;
  provider: string;
}> {
  const res = await fetch(`/api/locations/timezone?lat=${lat}&lon=${lon}`);
  return parseJsonOrThrow(res);
}

export async function createServerQuestionnaireDraft(
  draft: QuestionnaireDraft
): Promise<{ draft: QuestionnaireDraft; syncedAt: string }> {
  const res = await fetch('/api/rotation-questionnaires', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  return parseJsonOrThrow(res);
}

export async function loadServerQuestionnaireDraft(
  id: string
): Promise<{ draft: QuestionnaireDraft }> {
  const res = await fetch(`/api/rotation-questionnaires/${encodeURIComponent(id)}`);
  return parseJsonOrThrow(res);
}

export async function autosaveQuestionAnswer(
  questionnaireId: string,
  questionId: string,
  draft: QuestionnaireDraft,
  answer?: CanonicalAnswer
): Promise<{ draft: QuestionnaireDraft; syncedAt: string }> {
  const res = await fetch(
    `/api/rotation-questionnaires/${encodeURIComponent(questionnaireId)}/answers/${encodeURIComponent(questionId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft, answer }),
    }
  );
  return parseJsonOrThrow(res);
}

export async function validateFieldPolygonApi(
  fieldId: string,
  polygon: GeoJsonPolygonGeometry
): Promise<{
  ok: true;
  normalized: GeoJsonPolygonGeometry;
  areaHa: number;
  perimeterM: number;
  centroid: { lat: number; lon: number };
}> {
  const res = await fetch(`/api/fields/${encodeURIComponent(fieldId)}/geometry/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polygon }),
  });
  return parseJsonOrThrow(res);
}

export async function createReviewSnapshotApi(
  questionnaireId: string,
  draft: QuestionnaireDraft
): Promise<{ snapshot: ImmutableInputSnapshot }> {
  const res = await fetch(
    `/api/rotation-questionnaires/${encodeURIComponent(questionnaireId)}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    }
  );
  return parseJsonOrThrow(res);
}

export async function saveProfileAndExitApi(
  questionnaireId: string,
  draft: QuestionnaireDraft
): Promise<{ snapshot: ImmutableInputSnapshot; farmId: string; fieldId: string }> {
  const res = await fetch(
    `/api/rotation-questionnaires/${encodeURIComponent(questionnaireId)}/save-profile`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    }
  );
  return parseJsonOrThrow(res);
}

export async function submitAssessmentJobApi(payload: {
  questionnaireId: string;
  inputSnapshotId: string;
  idempotencyKey: string;
  draft?: QuestionnaireDraft;
}): Promise<{ job: AssessmentJobRecord; deduplicated: boolean }> {
  const res = await fetch('/api/rotation-assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res);
}

export async function fetchAssessmentJobApi(
  jobId: string
): Promise<{ job: AssessmentJobRecord }> {
  const res = await fetch(`/api/rotation-assessments/${encodeURIComponent(jobId)}`);
  return parseJsonOrThrow(res);
}

export async function cancelAssessmentJobApi(
  jobId: string
): Promise<{ job: AssessmentJobRecord }> {
  const res = await fetch(`/api/rotation-assessments/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
  return parseJsonOrThrow(res);
}

export async function fetchImmutableSnapshotApi(snapshotId: string): Promise<{
  snapshot: ImmutableInputSnapshot;
  result: AssessmentResultBundle | null;
}> {
  const res = await fetch(`/api/rotation-input-snapshots/${encodeURIComponent(snapshotId)}`);
  return parseJsonOrThrow(res);
}
