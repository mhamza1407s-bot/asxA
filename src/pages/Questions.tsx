import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Compass,
  HelpCircle,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import { setActiveFarmId, upsertFarmProfile } from '../lib/farmStorage';
import { buildAssessedFarmRecord, syncFarmToLocalProfiles } from '../lib/myFarmsEngine';
import { fetchMyFarmsPortfolio } from '../services/myFarmsApi';
import {
  ALL_QUESTION_BY_ID,
  getActiveQuestionRoute,
  getAnswerValue,
} from '../lib/questionnaireSchema';
import {
  buildImmutableSnapshot,
  isChecklistQuestionCompleted,
  mapSnapshotToFarmProfile,
  mapSnapshotToRotationDraft,
} from '../lib/questionnaireEngine';
import {
  clearActiveQuestionnaireDraft,
  createBlankQuestionnaireDraft,
  loadActiveAssessmentJobId,
  loadActiveQuestionnaireDraft,
  saveActiveAssessmentJobId,
  saveActiveQuestionnaireDraft,
  saveLocalSnapshotBundle,
} from '../lib/questionnaireStorage';
import { saveRotationDraft } from '../lib/rotationPlannerEngine';
import {
  autosaveQuestionAnswer,
  createReviewSnapshotApi,
  createServerQuestionnaireDraft,
  fetchAssessmentJobApi,
  fetchQuestionnaireRegistry,
  submitAssessmentJobApi,
} from '../services/questionnaireApi';
import {
  AssessmentJobRecord,
  AssessmentResultBundle,
  CanonicalAnswer,
  ConfirmedLocationRecord,
  ExternalConnectorInfo,
  FieldGeometryRecord,
  QuestionnaireDraft,
} from '../types/questionnaire';
import { MyFarmRecord, PortfolioFieldRecord } from '../types/myFarms';
import { AnswerSaveOptions, QuestionAnswerControls } from '../components/questions/QuestionAnswerControls';
import { QuestionReviewPanel } from '../components/questions/QuestionReviewPanel';
import { LiveAssessmentScreen } from '../components/questions/LiveAssessmentScreen';

interface QuestionsProps {
  theme: 'dark' | 'light';
}

const DEFAULT_CONNECTORS: ExternalConnectorInfo[] = [
  {
    id: 'open_meteo_forecast',
    name: 'Open-Meteo Forecast',
    role: 'Short-range weather, precipitation & ET₀',
    status: 'operational',
    resolution: 'Point / grid (~1–11 km)',
    provenanceLabel: 'Dataset estimate (Open-Meteo Forecast)',
    note: 'Live 7-day meteorological forecast.',
  },
  {
    id: 'open_meteo_archive',
    name: 'Open-Meteo ERA5 Historical Archive',
    role: 'Multi-year daily temperature, rainfall, ET₀ & GDD',
    status: 'operational',
    resolution: 'ERA5 ~9–25 km daily reanalysis',
    provenanceLabel: 'Dataset estimate (ERA5 Archive)',
    note: 'Covers dry, typical, and wet year climate quantiles.',
  },
  {
    id: 'nasa_power',
    name: 'NASA POWER Daily UTC',
    role: 'Satellite-derived solar irradiance, RH & thermal time',
    status: 'operational',
    resolution: '0.5° × 0.625° gridded UTC daily',
    provenanceLabel: 'Dataset estimate (NASA POWER)',
    note: 'All missing -999 sentinels stripped transparently.',
  },
  {
    id: 'isric_soilgrids',
    name: 'ISRIC SoilGrids REST Service',
    role: 'Mapped global soil property priors',
    status: 'unavailable_paused',
    resolution: '250 m predicted grid',
    provenanceLabel: 'Unavailable — REST API paused upstream',
    note: 'Paused upstream per platform spec — relying on farmer feel-guide and lab results.',
  },
];

function makeCanonicalAnswer(
  draft: QuestionnaireDraft,
  questionId: string,
  value: unknown,
  opts?: AnswerSaveOptions
): CanonicalAnswer {
  const q = ALL_QUESTION_BY_ID[questionId];
  const prev = draft.answers[questionId];
  const now = new Date().toISOString();
  return {
    answerId: prev?.answerId || `ans_${questionId}_${Date.now()}`,
    questionId,
    questionVersion: q?.version ?? 1,
    farmId: draft.farmId,
    fieldId: draft.fieldId,
    questionnaireId: draft.questionnaireId,
    profileVersion: draft.profileVersion,
    value,
    unit: opts?.unit ?? prev?.unit,
    scope: opts?.scope ?? prev?.scope ?? 'field',
    sourceType: opts?.sourceType ?? 'farmer_reported',
    validTime: opts?.validTime,
    depth: opts?.depth,
    notes: opts?.notes,
    confirmedAt: now,
    stale: false,
    staleReason: undefined,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    version: (prev?.version ?? 0) + 1,
  };
}

export const Questions: React.FC<QuestionsProps> = ({ theme }) => {
  const isLight = theme === 'light';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const prefersReducedMotion = useReducedMotion();

  const [draft, setDraft] = useState<QuestionnaireDraft>(() => {
    const modeParam = searchParams.get('mode');
    const existing = loadActiveQuestionnaireDraft();
    if (modeParam === 'create' && !existing) {
      const fresh = createBlankQuestionnaireDraft('create');
      saveActiveQuestionnaireDraft(fresh);
      return fresh;
    }
    if (existing && existing.status === 'in_progress') {
      return existing;
    }
    const fresh = createBlankQuestionnaireDraft(modeParam === 'edit' ? 'edit' : 'create');
    saveActiveQuestionnaireDraft(fresh);
    return fresh;
  });

  const [direction, setDirection] = useState<1 | -1>(1);
  const [savedFarms, setSavedFarms] = useState<MyFarmRecord[]>([]);
  const [savedFields, setSavedFields] = useState<PortfolioFieldRecord[]>([]);
  const [connectors, setConnectors] = useState<ExternalConnectorInfo[]>(DEFAULT_CONNECTORS);
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [activeJob, setActiveJob] = useState<AssessmentJobRecord | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  const serverCreatedRef = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const modeParam = searchParams.get('mode');
    const resetParam = searchParams.get('new');
    if (resetParam === '1') {
      const fresh = createBlankQuestionnaireDraft(modeParam === 'edit' ? 'edit' : 'create');
      saveActiveQuestionnaireDraft(fresh);
      setDraft(fresh);
      setActiveJob(null);
      saveActiveAssessmentJobId(null);
      serverCreatedRef.current = false;
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    fetchMyFarmsPortfolio()
      .then((res) => {
        if (cancelled) return;
        const active = (res.farms || []).filter((f) => !f.archivedAt);
        const assessed = active.map((f) =>
          buildAssessedFarmRecord(f, res.fields || [], res.observations || [], res.tasks || [])
        );
        setSavedFarms(assessed);
        setSavedFields(res.fields || []);
        for (const a of assessed) syncFarmToLocalProfiles(a);
      })
      .catch(() => {
        // Offline portfolio fallback
      });

    fetchQuestionnaireRegistry()
      .then((reg) => {
        if (!cancelled && Array.isArray(reg.connectors)) {
          setConnectors(reg.connectors);
        }
      })
      .catch(() => {
        // Use built-in defaults
      });

    const pendingJobId = loadActiveAssessmentJobId();
    if (pendingJobId) {
      fetchAssessmentJobApi(pendingJobId)
        .then((res) => {
          if (!cancelled && res.job) {
            setActiveJob(res.job);
          }
        })
        .catch(() => {
          saveActiveAssessmentJobId(null);
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (serverCreatedRef.current) return;
    serverCreatedRef.current = true;
    createServerQuestionnaireDraft(draft)
      .then(() => setSyncState('saved'))
      .catch(() => setSyncState('offline'));
  }, [draft.questionnaireId]);

  const persistDraft = useCallback(
    (updater: (prev: QuestionnaireDraft) => QuestionnaireDraft, syncQuestionId?: string) => {
      setDraft((prev) => {
        const next = {
          ...updater(prev),
          updatedAt: new Date().toISOString(),
        };
        saveActiveQuestionnaireDraft(next);
        if (syncQuestionId) {
          setSyncState('saving');
          if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = window.setTimeout(() => {
            autosaveQuestionAnswer(
              next.questionnaireId,
              syncQuestionId,
              next,
              next.answers[syncQuestionId]
            )
              .then(() => setSyncState('saved'))
              .catch(() => setSyncState('offline'));
          }, 280);
        }
        return next;
      });
    },
    []
  );

  const expMode = draft.experienceMode || 'simple';
  const visibleRoute = useMemo(() => getActiveQuestionRoute(draft), [draft]);
  const currentIndex = useMemo(() => {
    const idx = visibleRoute.findIndex((q) => q.id === draft.currentQuestionId);
    return idx >= 0 ? idx : 0;
  }, [visibleRoute, draft.currentQuestionId]);
  const currentQuestion = visibleRoute[currentIndex] ?? visibleRoute[0];

  const coreQuestionSteps = useMemo(
    () => visibleRoute.filter((q) => q.controlType !== 'review'),
    [visibleRoute]
  );

  useEffect(() => {
    setWhyOpen(false);
  }, [currentQuestion.id]);

  const handleSaveAnswer = useCallback(
    (questionId: string, value: unknown, opts?: AnswerSaveOptions) => {
      setValidationError(null);
      persistDraft((prev) => {
        const qDef = ALL_QUESTION_BY_ID[questionId];
        const nextAnswers: Record<string, CanonicalAnswer> = {
          ...prev.answers,
          [questionId]: makeCanonicalAnswer(prev, questionId, value, opts),
        };
        if (qDef?.invalidatesDownstream) {
          for (const targetId of qDef.invalidatesDownstream) {
            if (nextAnswers[targetId]) {
              nextAnswers[targetId] = {
                ...nextAnswers[targetId],
                stale: true,
                staleReason: `${qDef.title} changed — please verify this answer.`,
              };
            }
          }
        }
        return {
          ...prev,
          answers: nextAnswers,
          visitedQuestionIds: prev.visitedQuestionIds.includes(questionId)
            ? prev.visitedQuestionIds
            : [...prev.visitedQuestionIds, questionId],
        };
      }, questionId);
    },
    [persistDraft]
  );

  const handleSelectMode = useCallback(
    (mode: 'create' | 'edit') => {
      setValidationError(null);
      persistDraft((prev) => {
        if (mode === 'create' && prev.mode !== 'create') {
          const fresh = createBlankQuestionnaireDraft('create');
          fresh.experienceMode = prev.experienceMode || 'simple';
          fresh.currentQuestionId = fresh.experienceMode === 'advanced' ? 'Q00' : 'SIMPLE_1';
          return fresh;
        }
        return {
          ...prev,
          mode,
          answers: {
            ...prev.answers,
            Q00: makeCanonicalAnswer(prev, 'Q00', mode, {
              scope: 'farm',
              sourceType: 'farmer_reported',
            }),
          },
        };
      }, 'Q00');
    },
    [persistDraft]
  );

  const handleSelectExistingFarm = useCallback(
    (farm: MyFarmRecord) => {
      setValidationError(null);
      persistDraft((prev) => ({
        ...prev,
        farmId: farm.id,
        answers: {
          ...prev.answers,
          Q01: makeCanonicalAnswer(
            prev,
            'Q01',
            {
              mode: 'existing',
              farmId: farm.id,
              farmName: farm.name,
              description: farm.locationLabel || '',
            },
            { scope: 'farm', sourceType: 'farmer_confirmed' }
          ),
        },
      }), 'Q01');
    },
    [persistDraft]
  );

  const handleSelectExistingField = useCallback(
    (choice: PortfolioFieldRecord | 'new' | 'whole_farm') => {
      setValidationError(null);
      persistDraft((prev) => {
        if (choice === 'new' || choice === 'whole_farm') {
          const newFieldId = `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          return {
            ...prev,
            fieldId: newFieldId,
            answers: {
              ...prev.answers,
              Q02: makeCanonicalAnswer(
                prev,
                'Q02',
                {
                  mode: choice,
                  fieldId: newFieldId,
                  fieldName: choice === 'whole_farm' ? 'Main Farm Block' : '',
                },
                { scope: 'field', sourceType: 'farmer_reported' }
              ),
            },
          };
        }

        const nextAnswers: Record<string, CanonicalAnswer> = {
          ...prev.answers,
          Q02: makeCanonicalAnswer(
            prev,
            'Q02',
            { mode: 'existing', fieldId: choice.id, fieldName: choice.name },
            { scope: 'field', sourceType: 'farmer_confirmed' }
          ),
          Q03: makeCanonicalAnswer(prev, 'Q03', choice.name, {
            scope: 'field',
            sourceType: 'farmer_confirmed',
          }),
        };
        const activeVer =
          choice.versions.find((v) => v.geometryVersionId === choice.currentVersionId) ??
          choice.versions[0];
        const polyGeom =
          activeVer?.geometry && activeVer.geometry.type === 'Polygon'
            ? activeVer.geometry
            : null;
        const nextGeom: FieldGeometryRecord = polyGeom
          ? {
              geometryStatus: 'polygon_verified',
              polygon: polyGeom,
              geodesicAreaHa: activeVer?.netAreaHectares ?? null,
              perimeterM: activeVer?.perimeterM ?? null,
              centroid: activeVer?.centroid ?? null,
              areaMethod: 'WGS84 Spherical Excess (Chamberlain-Duquette)',
              crs: 'EPSG:4326',
              geometryVersion: prev.geometry.geometryVersion + 1,
            }
          : prev.geometry;

        return {
          ...prev,
          fieldId: choice.id,
          geometry: nextGeom,
          answers: nextAnswers,
        };
      }, 'Q02');
    },
    [persistDraft]
  );

  const handleChooseNewFarmSetup = useCallback(() => {
    setValidationError(null);
    persistDraft((prev) => {
      const prevQ01 = prev.answers.Q01?.value as { mode?: string; farmName?: string } | undefined;
      const switchingFromExisting =
        prev.setupIntent === 'new_field_existing_farm' || prevQ01?.mode === 'existing';
      const nextFarmId = switchingFromExisting
        ? `farm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        : prev.farmId;
      const nextFieldId = switchingFromExisting
        ? `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        : prev.fieldId;
      const preservedFarmName =
        !switchingFromExisting && prevQ01?.mode === 'new' ? prevQ01.farmName || '' : '';

      const nextAnswers: Record<string, CanonicalAnswer> = {
        ...prev.answers,
        Q00: makeCanonicalAnswer(prev, 'Q00', 'create', {
          scope: 'farm',
          sourceType: 'farmer_reported',
        }),
        Q01: makeCanonicalAnswer(
          prev,
          'Q01',
          { mode: 'new', farmId: nextFarmId, farmName: preservedFarmName },
          { scope: 'farm', sourceType: 'farmer_reported' }
        ),
        Q02: makeCanonicalAnswer(
          prev,
          'Q02',
          { mode: 'whole_farm', fieldId: nextFieldId, fieldName: 'Primary Field' },
          { scope: 'field', sourceType: 'farmer_reported' }
        ),
        Q03: makeCanonicalAnswer(prev, 'Q03', 'Primary Field', {
          scope: 'field',
          sourceType: 'farmer_reported',
        }),
      };

      if (switchingFromExisting) {
        delete nextAnswers.Q05;
        delete nextAnswers.Q08;
      }

      return {
        ...prev,
        mode: 'create',
        setupIntent: 'new_farm',
        farmId: nextFarmId,
        fieldId: nextFieldId,
        location: switchingFromExisting ? null : prev.location,
        answers: nextAnswers,
      };
    }, 'Q01');
  }, [persistDraft]);

  const handleChooseExistingFarmForNewField = useCallback(
    (farm?: MyFarmRecord) => {
      setValidationError(null);
      persistDraft((prev) => {
        const wasNewFarm = prev.setupIntent === 'new_farm';
        const prevQ01 = prev.answers.Q01?.value as { mode?: string } | undefined;
        const prevQ02 = prev.answers.Q02?.value as { mode?: string } | undefined;
        const nextAnswers: Record<string, CanonicalAnswer> = {
          ...prev.answers,
          Q00: makeCanonicalAnswer(prev, 'Q00', 'create', {
            scope: 'farm',
            sourceType: 'farmer_reported',
          }),
        };

        if (!farm) {
          if (wasNewFarm || prevQ01?.mode === 'new') {
            delete nextAnswers.Q01;
            delete nextAnswers.Q05;
            delete nextAnswers.Q08;
          }
          if (prevQ02?.mode === 'whole_farm' && nextAnswers.Q03?.value === 'Primary Field') {
            delete nextAnswers.Q02;
            delete nextAnswers.Q03;
          }
          return {
            ...prev,
            mode: 'create',
            setupIntent: 'new_field_existing_farm',
            location: wasNewFarm ? null : prev.location,
            answers: nextAnswers,
          };
        }

        const switchingFarm = prev.farmId !== farm.id || wasNewFarm || prevQ01?.mode !== 'existing';
        const nextFieldId =
          prev.fieldId && !switchingFarm
            ? prev.fieldId
            : `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const existingFieldName =
          !switchingFarm &&
          typeof prev.answers.Q03?.value === 'string' &&
          prev.answers.Q03.value !== 'Primary Field'
            ? prev.answers.Q03.value
            : '';

        nextAnswers.Q01 = makeCanonicalAnswer(
          prev,
          'Q01',
          {
            mode: 'existing',
            farmId: farm.id,
            farmName: farm.name,
            description: farm.locationLabel || '',
          },
          { scope: 'farm', sourceType: 'farmer_confirmed' }
        );
        nextAnswers.Q02 = makeCanonicalAnswer(
          prev,
          'Q02',
          {
            mode: 'new',
            fieldId: nextFieldId,
            fieldName: existingFieldName,
          },
          { scope: 'field', sourceType: 'farmer_reported' }
        );

        if (switchingFarm || nextAnswers.Q03?.value === 'Primary Field') {
          delete nextAnswers.Q03;
        }
        if (switchingFarm) {
          delete nextAnswers.Q05;
          delete nextAnswers.Q08;
        }

        return {
          ...prev,
          mode: 'create',
          setupIntent: 'new_field_existing_farm',
          farmId: farm.id,
          fieldId: nextFieldId,
          location: switchingFarm ? null : prev.location,
          answers: nextAnswers,
        };
      }, 'Q01');
    },
    [persistDraft]
  );

  const handleConfirmLocation = useCallback(
    (loc: ConfirmedLocationRecord) => {
      setValidationError(null);
      persistDraft((prev) => ({
        ...prev,
        location: loc,
        answers: {
          ...prev.answers,
          Q05: makeCanonicalAnswer(prev, 'Q05', loc, {
            scope: 'field',
            sourceType: 'farmer_confirmed',
          }),
          Q08: makeCanonicalAnswer(prev, 'Q08', loc.timezone, {
            scope: 'field',
            sourceType: loc.geocoderProvider ? 'farmer_confirmed' : 'derived',
          }),
        },
      }), 'Q05');
    },
    [persistDraft]
  );

  const handleUpdateGeometry = useCallback(
    (geom: FieldGeometryRecord) => {
      setValidationError(null);
      persistDraft((prev) => ({
        ...prev,
        geometry: geom,
        answers: {
          ...prev.answers,
          Q06: makeCanonicalAnswer(prev, 'Q06', geom.geometryStatus, {
            unit: geom.geodesicAreaHa ? 'hectares' : undefined,
            scope: 'field',
            sourceType: geom.geometryStatus === 'polygon_verified' ? 'derived' : 'skipped',
          }),
        },
      }), 'Q06');
    },
    [persistDraft]
  );

  const handleUpdateTimezone = useCallback(
    (tz: string) => {
      setValidationError(null);
      persistDraft((prev) => ({
        ...prev,
        location: prev.location ? { ...prev.location, timezone: tz } : prev.location,
        answers: {
          ...prev.answers,
          Q08: makeCanonicalAnswer(prev, 'Q08', tz, {
            scope: 'field',
            sourceType: 'farmer_confirmed',
          }),
        },
      }), 'Q08');
    },
    [persistDraft]
  );

  const validateCurrentStep = useCallback((): string | null => {
    const q = currentQuestion;
    if (!q.required) return null;

    if (q.id === 'SIMPLE_1') {
      if (!draft.setupIntent) {
        return 'Please choose whether you are adding a new farm or adding a new field to an existing farm.';
      }
      if (draft.setupIntent === 'new_field_existing_farm') {
        const q01 = getAnswerValue<{ mode?: string; farmId?: string }>(draft, 'Q01');
        if (q01?.mode !== 'existing' || !q01?.farmId) {
          return 'Please pick which existing farm this new field belongs to from the dropdown.';
        }
      }
      return null;
    }

    if (q.id === 'SIMPLE_2') {
      if (draft.setupIntent === 'new_field_existing_farm') {
        const q03 = getAnswerValue<string>(draft, 'Q03');
        if (!q03 || !q03.trim() || q03.trim() === 'Primary Field') {
          return 'Please enter a name for this new field.';
        }
      } else {
        const q01 = getAnswerValue<{ farmName?: string }>(draft, 'Q01');
        if (!q01?.farmName?.trim()) {
          return 'Please enter a name for your new farm.';
        }
      }
      if (!draft.location) {
        return 'Please confirm your location pin via search, device GPS, map click, or coordinates.';
      }
      return null;
    }

    if (q.id === 'SIMPLE_3') {
      const q25 = draft.answers['Q25']?.value as { mode?: string; records?: unknown[] } | undefined;
      if (!q25) {
        return 'Please add at least one recent crop, or choose "Field is new" / "I don’t remember".';
      }
      if (q25.mode === 'records' && (!Array.isArray(q25.records) || q25.records.length === 0)) {
        return 'Add at least one crop row above, or select "Field is new" / "I don’t remember".';
      }
      return null;
    }

    if (q.id === 'SIMPLE_4') {
      if (!draft.answers['Q17']) {
        return 'Please select Rain-fed, Irrigated, Both, or Not sure.';
      }
      return null;
    }

    if (q.id === 'SIMPLE_5') {
      if (!draft.answers['Q37']) {
        return 'Choose a main goal to continue.';
      }
      return null;
    }

    if (q.id === 'Q01') {
      const q01 = getAnswerValue<{ farmName?: string }>(draft, 'Q01');
      if (!q01?.farmName?.trim()) return 'Please select an existing farm or enter a new farm name.';
    }
    if (q.id === 'Q02') {
      const q02 = getAnswerValue<{ mode?: string }>(draft, 'Q02');
      if (!q02?.mode) return 'Please choose a field option to continue.';
    }
    if (q.id === 'Q03') {
      const q03 = getAnswerValue<string>(draft, 'Q03');
      if (!q03 || !q03.trim()) return 'Please give this field a name.';
    }
    if (q.id === 'Q05' && !draft.location) {
      return 'Please confirm a farm location via search, GPS, map pin, or coordinates.';
    }
    if (q.id === 'Q08' && !draft.location?.timezone && !draft.answers['Q08']?.value) {
      return 'Please confirm the local timezone.';
    }
    if (q.id === 'Q17' && !draft.answers['Q17']) {
      return 'Please select how this field normally receives water.';
    }
    if (q.id === 'Q25' && !draft.answers['Q25']) {
      return 'Please add recent crops or choose "Field is newly cleared" / "I don’t remember".';
    }
    if (q.id === 'Q29') {
      if (expMode === 'advanced') return null;
      const q29 = getAnswerValue<{ seasons?: number }>(draft, 'Q29');
      if (!q29?.seasons) return 'Please choose 3, 4, or 5 seasons.';
    }
    if (q.id === 'Q32' && expMode !== 'advanced' && !draft.answers['Q32']) {
      return 'Select any required crops or click "None".';
    }
    if (q.id === 'Q33' && expMode !== 'advanced' && !draft.answers['Q33']) {
      return 'Select any crops to avoid or click "None".';
    }
    if (q.id === 'Q37' && !draft.answers['Q37']) {
      return 'Choose a rotation priority preset or open custom sliders.';
    }
    return null;
  }, [currentQuestion, draft, expMode]);

  const goToQuestion = useCallback(
    (targetId: string, dir: 1 | -1) => {
      setValidationError(null);
      setDirection(dir);
      persistDraft((prev) => ({
        ...prev,
        currentQuestionId: targetId,
        visitedQuestionIds: prev.visitedQuestionIds.includes(targetId)
          ? prev.visitedQuestionIds
          : [...prev.visitedQuestionIds, targetId],
      }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [persistDraft]
  );

  const handleNext = () => {
    const err = validateCurrentStep();
    if (err) {
      setValidationError(err);
      return;
    }

    // Keep single-field default for New Farm, and sync Q02 fieldName when adding a field to an existing farm
    if (currentQuestion.id === 'SIMPLE_2') {
      if (draft.setupIntent === 'new_field_existing_farm') {
        const q03 = getAnswerValue<string>(draft, 'Q03')?.trim() || '';
        if (q03) {
          handleSaveAnswer(
            'Q02',
            { mode: 'new', fieldId: draft.fieldId, fieldName: q03 },
            { scope: 'field', sourceType: 'farmer_reported' }
          );
        }
      } else {
        const q03 = getAnswerValue<string>(draft, 'Q03');
        if (!q03 || !q03.trim()) {
          handleSaveAnswer('Q03', 'Primary Field', {
            scope: 'field',
            sourceType: 'derived',
          });
        }
      }
    }

    const nextQ = visibleRoute[currentIndex + 1];
    if (nextQ) {
      goToQuestion(nextQ.id, 1);
    }
  };

  const handleBack = () => {
    const prevQ = visibleRoute[currentIndex - 1];
    if (prevQ) {
      goToQuestion(prevQ.id, -1);
    }
  };

  const handleUnknownOrSkip = () => {
    const q = currentQuestion;
    if (q.id === 'SIMPLE_3') {
      handleSaveAnswer(
        'Q25',
        { mode: 'dont_remember', records: [] },
        { scope: 'season_occurrence', sourceType: 'unknown' }
      );
    } else if (q.id === 'SIMPLE_4') {
      handleSaveAnswer('Q17', '__unknown__', {
        scope: 'field',
        sourceType: 'unknown',
      });
    } else if (q.id === 'Q32' || q.id === 'Q33') {
      handleSaveAnswer(
        q.id,
        { none: true, crops: [] },
        { scope: 'field', sourceType: 'skipped' }
      );
    } else {
      const isUnknown = q.allowsUnknown;
      handleSaveAnswer(q.id, isUnknown ? '__unknown__' : '__skipped__', {
        scope: 'field',
        sourceType: isUnknown ? 'unknown' : 'skipped',
      });
    }

    const nextQ = visibleRoute[currentIndex + 1];
    if (nextQ) goToQuestion(nextQ.id, 1);
  };

  const handleEditFromReview = (qId: string) => {
    if (qId.startsWith('SIMPLE_')) {
      setValidationError(null);
      setDirection(-1);
      persistDraft((prev) => ({
        ...prev,
        experienceMode: 'simple',
        currentQuestionId: qId,
      }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const mapToSimple: Record<string, string> = {
      Q00: 'SIMPLE_1',
      Q01: draft.setupIntent === 'new_field_existing_farm' ? 'SIMPLE_1' : 'SIMPLE_2',
      Q02: 'SIMPLE_1',
      Q03: 'SIMPLE_2',
      Q05: 'SIMPLE_2',
      Q25: 'SIMPLE_3',
      Q17: 'SIMPLE_4',
      Q37: 'SIMPLE_5',
    };
    if (mapToSimple[qId]) {
      setValidationError(null);
      setDirection(-1);
      persistDraft((prev) => ({
        ...prev,
        experienceMode: 'simple',
        currentQuestionId: mapToSimple[qId],
      }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setValidationError(null);
    setDirection(-1);
    persistDraft((prev) => ({
      ...prev,
      experienceMode: 'advanced',
      currentQuestionId: qId,
      visitedQuestionIds: prev.visitedQuestionIds.includes(qId)
        ? prev.visitedQuestionIds
        : [...prev.visitedQuestionIds, qId],
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartDeeperAccuracy = () => {
    const nextDraft: QuestionnaireDraft = { ...draft, experienceMode: 'advanced' };
    const deeperRoute = getActiveQuestionRoute(nextDraft).filter((q) => q.controlType !== 'review');
    if (deeperRoute.length === 0) {
      showToast('All optional accuracy questions are already completed.', 'info');
      return;
    }
    const firstIncomplete = deeperRoute.find((q) => !isChecklistQuestionCompleted(draft, q.id));
    const targetId = (firstIncomplete ?? deeperRoute[0]).id;

    setValidationError(null);
    setDirection(1);
    persistDraft((prev) => ({
      ...prev,
      experienceMode: 'advanced',
      currentQuestionId: targetId,
      visitedQuestionIds: prev.visitedQuestionIds.includes(targetId)
        ? prev.visitedQuestionIds
        : [...prev.visitedQuestionIds, targetId],
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveAndExitDraft = () => {
    saveActiveQuestionnaireDraft({ ...draft, status: 'in_progress' });
    showToast('Draft saved. You can resume anytime from the Questions tab.', 'success');
    navigate('/');
  };

  const handleDiscardDraft = () => {
    clearActiveQuestionnaireDraft();
    showToast('Questionnaire draft cleared.', 'info');
    navigate('/');
  };

  const handleRunAssessment = async () => {
    setSubmittingAssessment(true);
    try {
      const reviewRes = await createReviewSnapshotApi(draft.questionnaireId, draft);
      const snap = reviewRes.snapshot;
      saveLocalSnapshotBundle(snap, null);

      const idempotencyKey = `run_${snap.inputSnapshotId}_${snap.inputHash}`;
      const jobRes = await submitAssessmentJobApi({
        questionnaireId: draft.questionnaireId,
        inputSnapshotId: snap.inputSnapshotId,
        idempotencyKey,
        draft,
      });

      saveActiveAssessmentJobId(jobRes.job.jobId);
      setActiveJob(jobRes.job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to start assessment.';
      showToast(msg, 'error');
    } finally {
      setSubmittingAssessment(false);
    }
  };

  const handleContinueToRotation = (snapshotId: string, result: AssessmentResultBundle) => {
    const snap = buildImmutableSnapshot(draft, draft.profileVersion);
    snap.inputSnapshotId = snapshotId;
    saveLocalSnapshotBundle(snap, result);

    const rotDraft = mapSnapshotToRotationDraft(snap, result);
    saveRotationDraft(rotDraft);
    upsertFarmProfile(mapSnapshotToFarmProfile(snap));
    setActiveFarmId(snap.farmId);
    window.dispatchEvent(new CustomEvent('anchor:farms-updated'));

    clearActiveQuestionnaireDraft();
    navigate(`/rotation?snapshotId=${encodeURIComponent(snapshotId)}`);
  };

  const subCls = isLight ? 'text-[#245A52]' : 'text-[#A7D9CF]';
  const headingCls = isLight ? 'text-[#072622]' : 'text-white';
  const isReviewScreen = currentQuestion.controlType === 'review';
  const showResetLink =
    currentIndex > 0 || Object.keys(draft.answers).length > 1 || draft.location !== null;

  // Honest step progress tracking (Simple Mode never exposes 43-question count)
  const stepRatioPct = useMemo(() => {
    if (visibleRoute.length <= 1) return 100;
    return Math.round(((currentIndex + 1) / visibleRoute.length) * 100);
  }, [currentIndex, visibleRoute.length]);

  const headerProgressLabel = useMemo(() => {
    if (activeJob) return 'Running Live Field Assessment';
    if (isReviewScreen) return 'Summary & Checklist';
    if (expMode === 'advanced' || expMode === 'refinement') {
      return `Optional Deeper Accuracy · Question ${currentIndex + 1} of ${coreQuestionSteps.length}`;
    }
    return `Step ${currentIndex + 1} of ${coreQuestionSteps.length}`;
  }, [activeJob, isReviewScreen, expMode, currentIndex, coreQuestionSteps.length]);

  return (
    <div className="relative min-h-screen w-full overflow-x-clip">
      {/* Dual-Theme Atmospheric Rural Landscape Backdrop */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <img
          src="/assets/aistudio/image_f90e4497.png"
          alt=""
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ${
            isLight ? 'opacity-0' : 'opacity-100'
          }`}
        />
        <img
          src="/assets/aistudio/image_73994810.png"
          alt=""
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ${
            isLight ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className="absolute inset-0"
          style={{
            background: isLight
              ? 'radial-gradient(circle at 50% 42%, rgba(226, 250, 246, 0.30), transparent 62%)'
              : 'radial-gradient(circle at 50% 25%, rgba(20, 184, 154, 0.18), transparent 58%), linear-gradient(180deg, rgba(3, 18, 16, 0.56) 0%, rgba(2, 14, 12, 0.72) 100%)',
          }}
        />
      </div>

      {/* Centered Single-Column Workspace */}
      <div
        className={`relative z-10 w-full mx-auto px-4 sm:px-6 pt-24 pb-12 min-h-screen flex flex-col items-center ${
          isReviewScreen || activeJob ? 'max-w-[880px]' : 'max-w-[760px]'
        }`}
      >
        {/* TOP TRACKING BAR */}
        <div className="w-full fs-qst-topbar px-5 py-4 sm:px-6 mb-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-full bg-[#14B89A]/18 border border-[#14B89A]/35 grid place-items-center text-[#0F766E] dark:text-[#2DD4BF] shrink-0">
                <Sparkles className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#0F766E] dark:text-[#2DD4BF]">
                  {draft.mode === 'edit'
                    ? 'Update Field Profile'
                    : draft.setupIntent === 'new_field_existing_farm'
                      ? 'Add New Field'
                      : 'Add New Farm'}
                </div>
                <div className={`text-[15px] sm:text-base font-bold leading-tight tabular-nums ${headingCls}`}>
                  {headerProgressLabel}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!activeJob && !isReviewScreen && (expMode === 'advanced' || expMode === 'refinement' || draft.visitedQuestionIds.includes('REVIEW')) && (
                <button
                  type="button"
                  onClick={() => goToQuestion('REVIEW', 1)}
                  className={`min-h-[34px] whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                    isLight
                      ? 'bg-[#14B89A]/16 hover:bg-[#14B89A]/26 border-[#0F766E]/40 text-[#062B25]'
                      : 'bg-[#14B89A]/20 hover:bg-[#14B89A]/30 border-[#2DD4BF]/45 text-[#E6F8F3]'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  Back to summary
                </button>
              )}

              <span
                className={`min-h-[34px] whitespace-nowrap shrink-0 inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold border ${
                  syncState === 'saving'
                    ? isLight
                      ? 'bg-amber-50/60 border-amber-500/40 text-amber-800'
                      : 'bg-amber-500/12 border-amber-400/40 text-amber-200'
                    : isLight
                      ? 'bg-white/30 border-[#0F766E]/25 text-[#0B5A52]'
                      : 'bg-white/[0.06] border-[#2DD4BF]/35 text-[#7CEAD9]'
                }`}
              >
                {syncState === 'saving'
                  ? 'Saving...'
                  : syncState === 'offline'
                    ? 'Saved locally'
                    : 'Draft synced'}
              </span>

              {!activeJob && (
                <>
                  <button
                    type="button"
                    onClick={handleSaveAndExitDraft}
                    className={`min-h-[34px] whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-all ${
                      isLight
                        ? 'bg-white/92 hover:bg-white border-white text-[#072622] shadow-[0_2px_8px_rgba(6,56,52,0.08)]'
                        : 'bg-white/[0.10] hover:bg-white/[0.16] border-white/[0.20] text-[#E6F8F3]'
                    }`}
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save &amp; exit
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscardDraft}
                    title="Discard draft"
                    className="min-h-[34px] whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border border-rose-400/50 bg-rose-500/[0.07] text-rose-600 dark:text-rose-300 hover:bg-rose-500/[0.14] cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Discard
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Segmented Step Progress Rail */}
          {!activeJob && expMode !== 'advanced' && (
            <div className="grid gap-2 pt-0.5" style={{ gridTemplateColumns: `repeat(${visibleRoute.length}, minmax(0, 1fr))` }}>
              {visibleRoute.map((stepQ, idx) => {
                const isCurrent = idx === currentIndex;
                const isCompleted = idx < currentIndex;
                const canJump = isCompleted || isCurrent || draft.visitedQuestionIds.includes(stepQ.id);
                const stepTitle = stepQ.controlType === 'review' ? 'Summary' : stepQ.title;
                return (
                  <button
                    key={stepQ.id}
                    type="button"
                    disabled={!canJump}
                    title={stepTitle}
                    aria-label={stepTitle}
                    onClick={() => {
                      if (canJump) goToQuestion(stepQ.id, idx >= currentIndex ? 1 : -1);
                    }}
                    className="group py-0.5 cursor-pointer disabled:cursor-default"
                  >
                    <div
                      className={`h-[7px] w-full rounded-full transition-all duration-300 ${
                        isCurrent
                          ? 'bg-gradient-to-r from-[#10B981] via-[#14B89A] to-[#2DD4BF] shadow-[0_0_10px_rgba(20,184,154,0.48)]'
                          : isCompleted
                            ? 'bg-[#14B89A]/80'
                            : isLight
                              ? 'bg-[#0F766E]/15'
                              : 'bg-white/14'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {!activeJob && expMode === 'advanced' && (
            <div
              role="progressbar"
              aria-valuenow={stepRatioPct}
              aria-valuemin={0}
              aria-valuemax={100}
              className={`w-full h-2 rounded-full overflow-hidden ${
                isLight ? 'bg-[#0F766E]/15' : 'bg-white/12'
              }`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#10B981] via-[#14B89A] to-[#2DD4BF] transition-all duration-300 ease-out shadow-[0_0_12px_rgba(20,184,154,0.5)]"
                style={{ width: `${stepRatioPct}%` }}
              />
            </div>
          )}
        </div>

        {/* CENTERED ONE-BY-ONE QUESTION CARD */}
        {activeJob ? (
          <div className="w-full fs-qst-panel px-6 py-7 sm:px-9 sm:py-8">
            <LiveAssessmentScreen
              job={activeJob}
              isLight={isLight}
              onJobUpdated={(updated) => setActiveJob(updated)}
              onContinueToRotation={handleContinueToRotation}
              onBackToReview={() => {
                setActiveJob(null);
                saveActiveAssessmentJobId(null);
                goToQuestion('REVIEW', -1);
              }}
            />
          </div>
        ) : (
          <div className="w-full flex-1 flex flex-col justify-start sm:justify-center pt-1 sm:pt-0">
            <div className="w-full fs-qst-panel !overflow-visible px-6 py-7 sm:px-10 sm:py-9">
              <AnimatePresence mode="wait" initial={false} custom={direction}>
                <motion.div
                  key={currentQuestion.id}
                  custom={direction}
                  initial={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, x: direction * 30 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, x: direction * -30 }
                  }
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-6"
                >
                  {expMode === 'advanced' && !isReviewScreen && (
                    <div className="fs-qst-subpanel rounded-[18px] px-4 py-3 text-center">
                      <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#0F766E] dark:text-[#2DD4BF]">
                        Optional Deeper Accuracy
                      </div>
                      <p className={`text-xs mt-0.5 ${subCls}`}>
                        Deepen your accuracy with these optional advanced questions — skip any you don&apos;t know, or return to summary anytime.
                      </p>
                    </div>
                  )}

                  {/* Single Question Header */}
                  <div className="text-center max-w-[580px] mx-auto">
                    <div className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#0F766E] dark:text-[#2DD4BF]">
                      {isReviewScreen ? 'Summary & Checklist' : currentQuestion.sectionLabel}
                    </div>
                    <h1
                      className={`text-[25px] sm:text-[31px] font-bold tracking-[-0.02em] leading-[1.2] text-balance mt-2 ${headingCls}`}
                    >
                      {isReviewScreen
                        ? 'Review your answers'
                        : currentQuestion.id === 'SIMPLE_2'
                          ? draft.setupIntent === 'new_field_existing_farm'
                            ? 'Name your field and set its location'
                            : 'Name your farm and set its location'
                          : currentQuestion.farmerQuestion}
                    </h1>
                    <p className={`text-sm mt-2.5 leading-relaxed max-w-[540px] mx-auto ${subCls}`}>
                      {isReviewScreen
                        ? 'Click any question below to edit it, or deepen your accuracy with optional advanced questions.'
                        : currentQuestion.id === 'SIMPLE_2'
                          ? draft.setupIntent === 'new_field_existing_farm'
                            ? 'Enter a field name and pin where it sits.'
                            : 'Enter your farm name and pin its location.'
                          : currentQuestion.explanation}
                    </p>
                  </div>

                  {/* Interactive Control OR 1-Card Review Checklist */}
                  {currentQuestion.controlType === 'review' ? (
                    <QuestionReviewPanel
                      draft={draft}
                      connectors={connectors}
                      isLight={isLight}
                      submitting={submittingAssessment}
                      onEditQuestion={handleEditFromReview}
                      onStartDeeperAccuracy={handleStartDeeperAccuracy}
                      onToggleConsent={(accepted) => {
                        persistDraft((prev) => ({
                          ...prev,
                          consent: {
                            ...prev.consent,
                            acceptedRemoteFetch: accepted,
                            acceptedAt: accepted ? new Date().toISOString() : null,
                            revokedAt: accepted ? null : new Date().toISOString(),
                          },
                        }));
                      }}
                      onRunAssessment={handleRunAssessment}
                    />
                  ) : (
                    <QuestionAnswerControls
                      question={currentQuestion}
                      draft={draft}
                      isLight={isLight}
                      savedFarms={savedFarms}
                      savedFields={savedFields}
                      onSaveAnswer={handleSaveAnswer}
                      onSelectMode={handleSelectMode}
                      onSelectExistingFarm={handleSelectExistingFarm}
                      onSelectExistingField={handleSelectExistingField}
                      onChooseNewFarmSetup={handleChooseNewFarmSetup}
                      onChooseExistingFarmForNewField={handleChooseExistingFarmForNewField}
                      onConfirmLocation={handleConfirmLocation}
                      onUpdateGeometry={handleUpdateGeometry}
                      onUpdateTimezone={handleUpdateTimezone}
                    />
                  )}

                  {/* Optional Collapsible "Why we ask" inside centered card */}
                  {!isReviewScreen && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setWhyOpen((v) => !v)}
                        aria-expanded={whyOpen}
                        className={`inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer hover:underline ${subCls}`}
                      >
                        <Compass className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                        <span>Why we ask this</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-150 ${
                            whyOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {whyOpen && (
                        <div
                          className={`mt-2.5 fs-qst-subpanel rounded-[16px] px-4 py-3 text-xs leading-relaxed ${
                            isLight ? 'text-[#1B4D46]' : 'text-[#B8E6DC]'
                          }`}
                        >
                          {currentQuestion.whyWeAsk}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Inline Validation Feedback */}
                  {validationError && (
                    <div className="rounded-[14px] px-4 py-2.5 text-xs font-medium bg-rose-500/15 border border-rose-400/40 text-rose-700 dark:text-rose-200">
                      {validationError}
                    </div>
                  )}

                  {/* Prominent Back / Skip / Next (Forward) Controls */}
                  {currentQuestion.controlType !== 'review' && (
                    <div className="pt-5 border-t border-[#0F766E]/12 dark:border-white/12 flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        disabled={currentIndex === 0}
                        onClick={handleBack}
                        className={`min-h-[42px] inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed transition-all ${
                          isLight
                            ? 'bg-white/65 hover:bg-white/90 border-white/80 text-[#0B3630] shadow-[0_2px_10px_rgba(6,56,52,0.06)]'
                            : 'bg-white/[0.08] hover:bg-white/[0.15] border-white/[0.16] text-[#DCF6F0]'
                        }`}
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back</span>
                      </button>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {(currentQuestion.allowsUnknown || !currentQuestion.required || expMode === 'refinement' || expMode === 'advanced') && (
                          <button
                            type="button"
                            onClick={handleUnknownOrSkip}
                            className={`min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                              isLight
                                ? 'bg-white/55 hover:bg-white/85 border-[#0F766E]/22 text-[#1B4D46]'
                                : 'bg-white/[0.05] hover:bg-white/[0.11] border-white/[0.14] text-[#A7D9CF]'
                            }`}
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                            <span>
                              {expMode === 'refinement' || expMode === 'advanced'
                                ? 'Skip for now'
                                : currentQuestion.unknownLabel || 'Skip for now'}
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleNext}
                          className="min-h-[44px] inline-flex items-center gap-2 px-7 py-2.5 rounded-full text-sm font-bold text-[#031F1C] bg-gradient-to-r from-[#14B89A] via-[#2DD4BF] to-[#5EEAD4] shadow-[0_8px_22px_rgba(20,184,154,0.32)] hover:brightness-105 cursor-pointer transition-all"
                        >
                          <span>
                            {currentIndex === visibleRoute.length - 2
                              ? 'Next: Summary'
                              : 'Next'}
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Subtle Reset Link Centered Below Card (shown once user progresses or answers) */}
            {showResetLink && (
              <div className="mt-4 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const fresh = createBlankQuestionnaireDraft('create');
                    saveActiveQuestionnaireDraft(fresh);
                    setDraft(fresh);
                    setValidationError(null);
                    showToast('Started a fresh questionnaire.', 'info');
                  }}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium hover:underline cursor-pointer ${subCls}`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Start over from Step 1</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
