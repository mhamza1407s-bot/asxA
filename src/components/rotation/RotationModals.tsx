import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  Filter,
  Info,
  Loader2,
  Scale,
  Search,
  ShieldAlert,
  Sprout,
  X,
} from 'lucide-react';
import {
  compareRotationPlans,
  CropSeasonStepDetail,
  CropSuitabilityEvaluation,
  formatShortPlanDate,
  getPriorityPreset,
  normalizePriorityWeights,
  RotationEngineOutput,
  RotationPlanCandidate,
  RotationWizardDraft,
} from '../../lib/rotationPlannerEngine';
import { DrainageRate, SoilTexture, WaterReliability, WateringMethod } from '../../types/farm';
import { MyFarmRecord, PlanDecisionReasonCode, PortfolioFieldRecord } from '../../types/myFarms';
import { formatSoilMoistureUnitLabel, normalizeSoilMoistureUnit, resolveEffectiveFieldSoil } from '../../lib/soilProvenance';
import { resolveRotationCropImage, ROTATION_MEDIA } from './RotationVisuals';

export function applyFieldSelectionToDraft(
  prev: RotationWizardDraft,
  farm: MyFarmRecord | undefined,
  found: PortfolioFieldRecord | undefined
): RotationWizardDraft {
  const prevCrop =
    found?.previousCrops?.[0] ||
    found?.cropName ||
    farm?.primaryCrop ||
    prev.recentCrops[0]?.cropName ||
    "I don't remember";

  const effSoil = farm
    ? resolveEffectiveFieldSoil(farm.soil, found?.soilOverrides)
    : null;

  const nextTexture: SoilTexture = effSoil
    ? effSoil.texture
    : (found?.soilOverrides?.texture ?? prev.soilTexture);
  const nextTextureProvenance = effSoil
    ? effSoil.textureSource === 'unavailable' || effSoil.textureSource === 'field_suppressed'
      ? 'unknown'
      : 'from_field_data'
    : nextTexture === 'Unknown'
      ? 'unknown'
      : 'from_field_data';

  const nextPh = effSoil ? effSoil.phValue : (found?.soilOverrides?.phValue ?? prev.soilPh);
  const nextPhProvenance = effSoil
    ? effSoil.phValue !== null
      ? effSoil.phStatus === 'tested'
        ? 'farmer_confirmed'
        : 'farmer_reported'
      : 'unknown'
    : nextPh !== null
      ? 'farmer_confirmed'
      : 'unknown';

  const nextDrainage = effSoil
    ? effSoil.drainage
    : (found?.soilOverrides?.drainage ?? prev.drainage);

  const nextWaterReliability =
    (found?.waterOverrides?.reliability as WaterReliability | undefined) ||
    farm?.water.reliability ||
    prev.waterReliability;

  return {
    ...prev,
    fieldId: found?.id ?? null,
    fieldName: found?.name || prev.farmName,
    soilTexture: nextTexture,
    soilTextureProvenance: nextTextureProvenance,
    soilPh: nextPh,
    soilPhProvenance: nextPhProvenance,
    drainage: nextDrainage,
    soilMoisturePct: effSoil ? effSoil.moisturePct : prev.soilMoisturePct,
    soilMoistureStatus: effSoil ? effSoil.moistureStatus : prev.soilMoistureStatus,
    soilMoistureUnit: effSoil ? effSoil.moistureUnit : prev.soilMoistureUnit,
    soilMoistureDepth: effSoil ? effSoil.moistureDepth : prev.soilMoistureDepth,
    soilMoistureMethod: effSoil ? effSoil.moistureMethod : prev.soilMoistureMethod,
    soilMoistureDate: effSoil ? effSoil.moistureDate : prev.soilMoistureDate,
    moistureUnitAmbiguityNote: effSoil
      ? effSoil.moistureUnitAmbiguityNote
      : prev.moistureUnitAmbiguityNote,
    soilOrganicMatterPct: effSoil ? effSoil.organicMatterPct : prev.soilOrganicMatterPct,
    waterReliability: nextWaterReliability,
    recentCrops: [
      {
        seasonLabel: `Season -1 (${prev.recentCropYear})`,
        cropName: prevCrop,
      },
    ],
    recentCropDisplay:
      prevCrop === "I don't remember"
        ? 'Unknown history'
        : `${prevCrop} (${prev.recentCropYear})`,
  };
}

export function buildGeminiExplainPayload(
  engine: RotationEngineOutput,
  plan: RotationPlanCandidate,
  draft: RotationWizardDraft
) {
  return {
    farmName: engine.farmName,
    fieldName: engine.fieldName,
    soilTexture: draft.soilTexture,
    waterSource: draft.waterSourceSummary,
    waterReliability: draft.waterReliability,
    excludedRestrictedCrops: draft.excludedCrops,
    selectedRotation: {
      planCode: plan.planCode,
      title: plan.title,
      matchScore: plan.matchScore,
      steps: plan.steps.map((s) => ({
        season: s.seasonLabel,
        year: s.yearLabel,
        crop: s.cropName,
        family: s.plainFamily,
        durationDays: s.durationDays,
        etcMm: s.etcMmEstimate,
        nBalanceKgHa: s.nitrogenBalanceKgHa,
      })),
      risks: plan.risks.map((r) => r.shortWarning),
    },
  };
}

const INPUT_CLASS =
  'w-full h-11 px-3.5 rounded-xl bg-white/80 dark:bg-[#04231F]/80 border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[13.5px] text-[#072622] dark:text-[#ECF8F5] placeholder:text-[#3E6B63]/70 dark:placeholder:text-[#7EB5AA]/60 focus:outline-none focus:border-[#0F766E] dark:focus:border-[#2DD4BF] transition-colors';

const CLOSE_BTN_CLASS =
  'w-9 h-9 rounded-full bg-black/5 dark:bg-white/[0.07] hover:bg-black/10 dark:hover:bg-white/[0.14] border border-[#0F766E]/15 dark:border-[#2DD4BF]/25 grid place-items-center text-[#1B4D46] dark:text-[#C5E4DD] hover:text-[#072622] dark:hover:text-white transition-colors cursor-pointer shrink-0';

const PRIMARY_CTA_CLASS =
  'inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full text-[13px] font-bold text-[#031F1C] bg-gradient-to-r from-[#5EEAD4] via-[#2DD4BF] to-[#24E982] hover:brightness-105 shadow-[0_6px_18px_rgba(20,184,154,0.28)] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer whitespace-nowrap';

const SECONDARY_BTN_CLASS =
  'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full bg-white/70 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[13px] font-semibold text-[#072622] dark:text-[#ECF8F5] disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap';

// ---------------------------------------------------------------------------
// 1. Edit Inputs Guided Questionnaire & Review Modal
// ---------------------------------------------------------------------------
interface EditInputsWizardModalProps {
  open: boolean;
  initialStep?: number;
  draft: RotationWizardDraft;
  farms: MyFarmRecord[];
  fields: PortfolioFieldRecord[];
  onSwitchFarm: (farmId: string) => void;
  onSaveDraftAndRun: (nextDraft: RotationWizardDraft, syncToServer: boolean) => Promise<void> | void;
  onClose: () => void;
}

const WIZARD_STEPS = [
  { id: 'field', label: 'Farm & Field', required: true },
  { id: 'soil', label: 'Soil & Lab', required: true },
  { id: 'water', label: 'Water Supply', required: true },
  { id: 'history', label: 'Crop History', required: true },
  { id: 'horizon', label: 'Horizon & Cover', required: true },
  { id: 'priorities', label: 'Priorities', required: true },
  { id: 'review', label: 'Review & Run', required: false },
];

const CROP_HISTORY_CHOICES = [
  'Wheat',
  'Maize',
  'Soybean',
  'Chickpea',
  'Barley',
  'Sorghum',
  'Sunflower',
  'Peas',
  'Cover Crop',
  'Fallow',
  "I don't remember",
];
const CONSTRAINT_CROPS = [
  'Wheat',
  'Chickpea',
  'Sorghum',
  'Maize',
  'Soybean',
  'Barley',
  'Sunflower',
  'Peas',
  'Cover Crop',
];

export const EditInputsWizardModal: React.FC<EditInputsWizardModalProps> = ({
  open,
  initialStep = 0,
  draft,
  farms,
  fields,
  onSwitchFarm,
  onSaveDraftAndRun,
  onClose,
}) => {
  const [step, setStep] = useState(initialStep);
  const [local, setLocal] = useState<RotationWizardDraft>(draft);
  const [syncToServer, setSyncToServer] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showOptionalSoil, setShowOptionalSoil] = useState(false);

  const wasOpenRef = useRef(false);
  const lastFarmIdRef = useRef(draft.farmId);

  React.useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    const farmSwitched = open && lastFarmIdRef.current !== draft.farmId;
    if (justOpened || farmSwitched) {
      setLocal(draft);
      if (justOpened) {
        setStep(Math.max(0, Math.min(WIZARD_STEPS.length - 1, initialStep)));
      }
      lastFarmIdRef.current = draft.farmId;
    }
    wasOpenRef.current = open;
  }, [open, draft, initialStep]);

  const farmFields = useMemo(
    () => fields.filter((f) => f.farmId === local.farmId),
    [fields, local.farmId]
  );

  const normalized = useMemo(
    () => normalizePriorityWeights(local.priorities),
    [local.priorities]
  );

  if (!open) return null;

  const currentMeta = WIZARD_STEPS[step];

  const handleApply = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSaveDraftAndRun(local, syncToServer);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fs-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Crop rotation planning inputs wizard"
      onClick={onClose}
    >
      <div
        className="fs-modal-shell w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="fs-modal-header px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0F766E] dark:text-[#24E982]">
              <span>Step {Math.min(step + 1, 7)} of 7</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#285E55] dark:text-[#96C7BE]">{currentMeta.label}</span>
            </div>
            <h3 className="text-xl font-bold text-[#072622] dark:text-white mt-0.5">
              Configure Field &amp; Rotation Inputs
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#285E55] dark:text-[#96C7BE] hidden sm:inline">
              Autosaved locally
            </span>
            <button
              type="button"
              onClick={onClose}
              className={CLOSE_BTN_CLASS}
              aria-label="Close wizard"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step tabs */}
        <div className="px-6 py-2.5 border-b border-[#0F766E]/12 dark:border-[#2DD4BF]/15 bg-white/30 dark:bg-black/15 flex items-center gap-1.5 overflow-x-auto fs-thin-scroll">
          {WIZARD_STEPS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(idx)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                idx === step
                  ? 'bg-[#0F766E] dark:bg-[#2DD4BF] text-white dark:text-[#03211D] shadow-sm'
                  : 'text-[#1B4D46] dark:text-[#A8D6CD] hover:bg-white/60 dark:hover:bg-white/10'
              }`}
            >
              {idx + 1}. {s.label}
            </button>
          ))}
        </div>

        {/* 2-Region Body */}
        <div className="flex-1 overflow-y-auto fs-thin-scroll p-6 grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-6">
          {/* Left Primary Question */}
          <div className="space-y-4">
            {step === 0 && (
              <>
                <div>
                  <h4 className="text-base font-bold text-[#072622] dark:text-white">
                    Select Farm &amp; Field Block
                  </h4>
                  <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] mt-1 leading-relaxed">
                    Rotations are calibrated per field soil profile, water allocation, and boundary record.
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                      Active Farm
                    </label>
                    <select
                      value={local.farmId}
                      onChange={(e) => onSwitchFarm(e.target.value)}
                      className={INPUT_CLASS}
                    >
                      {farms.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.locationLabel || 'Portfolio farm'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                      Target Field Block
                    </label>
                    {farmFields.length > 0 ? (
                      <select
                        value={local.fieldId ?? ''}
                        onChange={(e) => {
                          const found = farmFields.find((ff) => ff.id === e.target.value);
                          const activeFarm = farms.find((fm) => fm.id === local.farmId);
                          setLocal((prev) => applyFieldSelectionToDraft(prev, activeFarm, found));
                        }}
                        className={INPUT_CLASS}
                      >
                        {farmFields.map((ff) => (
                          <option key={ff.id} value={ff.id}>
                            {ff.name} ({ff.cropName || 'Unassigned crop'} · {ff.status})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={local.fieldName}
                        onChange={(e) => setLocal((p) => ({ ...p, fieldName: e.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="Field 01 — Main Block"
                      />
                    )}
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div>
                  <h4 className="text-base font-bold text-[#072622] dark:text-white">
                    Topsoil Texture &amp; Lab Profile
                  </h4>
                  <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] mt-1 leading-relaxed">
                    Texture regulates root anchorage, aeration, drainage speed, and plant-available water storage.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(
                    [
                      'Loam',
                      'Silt loam',
                      'Sandy loam',
                      'Clay loam',
                      'Sandy',
                      'Clay',
                      'Loamy sand',
                      'Unknown',
                    ] as SoilTexture[]
                  ).map((tex) => {
                    const selected = local.soilTexture === tex;
                    return (
                      <button
                        key={tex}
                        type="button"
                        onClick={() =>
                          setLocal((p) => ({
                            ...p,
                            soilTexture: tex,
                            soilTextureProvenance: tex === 'Unknown' ? 'unknown' : 'farmer_confirmed',
                          }))
                        }
                        className={`h-11 px-3 rounded-xl text-[13px] font-semibold border transition-all cursor-pointer ${
                          selected
                            ? 'bg-[#0F766E] dark:bg-[#24E982]/20 border-[#0F766E] dark:border-[#24E982] text-white dark:text-[#42F89A]'
                            : 'bg-white/70 dark:bg-white/[0.05] border-[#0F766E]/20 dark:border-white/12 text-[#14433C] dark:text-[#D5EEE9] hover:border-[#0F766E]/50 dark:hover:border-[#2DD4BF]/50'
                        }`}
                      >
                        {tex}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowOptionalSoil((v) => !v)}
                    className="text-[13px] font-semibold text-[#0F766E] dark:text-[#5EEAD4] hover:underline cursor-pointer"
                  >
                    {showOptionalSoil
                      ? 'Hide optional lab & drainage fields'
                      : '+ Improve precision: Add Soil pH, Drainage & Organic Matter'}
                  </button>
                </div>

                {showOptionalSoil && (
                  <div className="fs-modal-subpanel grid grid-cols-1 sm:grid-cols-3 gap-3.5 p-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                        Soil pH (optional)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="3.5"
                        max="9.5"
                        value={local.soilPh ?? ''}
                        onChange={(e) =>
                          setLocal((p) => ({
                            ...p,
                            soilPh: e.target.value === '' ? null : Number(e.target.value),
                            soilPhProvenance: e.target.value === '' ? 'unknown' : 'farmer_confirmed',
                          }))
                        }
                        placeholder="e.g. 6.6"
                        className={`${INPUT_CLASS} tabular-nums`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                        Drainage Rate
                      </label>
                      <select
                        value={local.drainage}
                        onChange={(e) =>
                          setLocal((p) => ({ ...p, drainage: e.target.value as DrainageRate }))
                        }
                        className={INPUT_CLASS}
                      >
                        {(
                          [
                            'Unknown',
                            'Very slowly',
                            'Slowly',
                            'Moderately',
                            'Quickly',
                            'Very quickly',
                          ] as DrainageRate[]
                        ).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                        Organic Matter (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="20"
                        value={local.soilOrganicMatterPct ?? ''}
                        onChange={(e) =>
                          setLocal((p) => ({
                            ...p,
                            soilOrganicMatterPct: e.target.value === '' ? null : Number(e.target.value),
                          }))
                        }
                        placeholder="e.g. 2.3"
                        className={`${INPUT_CLASS} tabular-nums`}
                      />
                    </div>
                    <div className="sm:col-span-3 pt-2 border-t border-[#0F766E]/12 dark:border-white/10 text-xs text-[#285E55] dark:text-[#96C7BE]">
                      Soil moisture provenance:{' '}
                      <strong className="text-[#072622] dark:text-white">
                        {local.soilMoistureStatus === 'unknown' || local.soilMoisturePct === null
                          ? 'Unknown / Not measured'
                          : `${local.soilMoistureStatus ?? 'reported'} · ${local.soilMoisturePct}% (${formatSoilMoistureUnitLabel(normalizeSoilMoistureUnit(local.soilMoistureUnit))})`}
                      </strong>
                      {local.soilMoistureDepth ? ` · Depth: ${local.soilMoistureDepth}` : ''}
                      {local.soilMoistureMethod ? ` · Method: ${local.soilMoistureMethod}` : ''}
                      {local.soilMoistureDate ? ` · Date: ${local.soilMoistureDate}` : ''}
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <h4 className="text-base font-bold text-[#072622] dark:text-white">
                    Water Source &amp; Supply Reliability
                  </h4>
                  <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] mt-1 leading-relaxed">
                    Separates precipitation from supplemental irrigation capacity so high-demand crops are never overstated.
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-2">
                      Watering Regime
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        {
                          label: 'Rain + Irrigation',
                          method: 'Hybrid (rainfall and irrigation)' as WateringMethod,
                        },
                        {
                          label: 'Rain-fed only',
                          method: 'Rain-fed agriculture' as WateringMethod,
                        },
                        {
                          label: 'Full Irrigation',
                          method: 'Artificial irrigation' as WateringMethod,
                        },
                      ].map((opt) => {
                        const selected = local.waterSourceSummary === opt.label;
                        return (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() =>
                              setLocal((p) => ({
                                ...p,
                                waterSourceSummary: opt.label,
                                wateringMethod: opt.method,
                                waterProvenance: 'farmer_confirmed',
                              }))
                            }
                            className={`h-11 px-3.5 rounded-xl text-[13px] font-semibold border cursor-pointer transition-all ${
                              selected
                                ? 'bg-[#0F766E] dark:bg-[#2DD4BF]/20 border-[#0F766E] dark:border-[#2DD4BF] text-white dark:text-[#5EEAD4]'
                                : 'bg-white/70 dark:bg-white/[0.05] border-[#0F766E]/20 dark:border-white/12 text-[#14433C] dark:text-[#D5EEE9]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                        Supply Reliability
                      </label>
                      <select
                        value={local.waterReliability}
                        onChange={(e) =>
                          setLocal((p) => ({
                            ...p,
                            waterReliability: e.target.value as WaterReliability,
                          }))
                        }
                        className={INPUT_CLASS}
                      >
                        {(
                          [
                            'Always available',
                            'Usually available',
                            'Sometimes limited',
                            'Frequently limited',
                            'Highly unreliable',
                            'Unknown',
                          ] as WaterReliability[]
                        ).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                        Daily Water Cap (m³/day, optional)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={local.dailyWaterCapM3 ?? ''}
                        onChange={(e) =>
                          setLocal((p) => ({
                            ...p,
                            dailyWaterCapM3: e.target.value === '' ? null : Number(e.target.value),
                          }))
                        }
                        placeholder="e.g. 420"
                        className={`${INPUT_CLASS} tabular-nums`}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <h4 className="text-base font-bold text-[#072622] dark:text-white">
                    Recent Crop History
                  </h4>
                  <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] mt-1 leading-relaxed">
                    Prevents back-to-back same-family monocultures and captures legume residual nitrogen carryover.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                      Most Recent Crop
                    </label>
                    <select
                      value={local.recentCrops[0]?.cropName || 'Wheat'}
                      onChange={(e) => {
                        const crop = e.target.value;
                        const nextList = [...local.recentCrops];
                        nextList[0] = {
                          seasonLabel: `Season -1 (${local.recentCropYear})`,
                          cropName: crop,
                        };
                        setLocal((p) => ({
                          ...p,
                          recentCrops: nextList,
                          recentCropDisplay:
                            crop === "I don't remember"
                              ? 'Unknown history'
                              : `${crop} (${p.recentCropYear})`,
                        }));
                      }}
                      className={INPUT_CLASS}
                    >
                      {CROP_HISTORY_CHOICES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                      Harvest Year
                    </label>
                    <input
                      type="number"
                      min="2020"
                      max="2030"
                      value={local.recentCropYear}
                      onChange={(e) => {
                        const yr = Number(e.target.value) || 2026;
                        const cName = local.recentCrops[0]?.cropName || 'Wheat';
                        setLocal((p) => ({
                          ...p,
                          recentCropYear: yr,
                          recentCropDisplay: `${cName} (${yr})`,
                        }));
                      }}
                      className={`${INPUT_CLASS} tabular-nums`}
                    />
                  </div>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div>
                  <h4 className="text-base font-bold text-[#072622] dark:text-white">
                    Planning Horizon &amp; Cover vs Fallow Preference
                  </h4>
                  <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] mt-1 leading-relaxed">
                    Growing seasons and calendar years are tracked separately so double-crop cycles remain explicit.
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-2">
                      Growing Seasons to Plan
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {([3, 4, 5] as const).map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() =>
                            setLocal((p) => ({
                              ...p,
                              planningHorizonSeasons: cnt,
                              planningHorizonLabel:
                                cnt === 4
                                  ? '4 Seasons'
                                  : cnt === 3
                                    ? 'Next 2–3 years'
                                    : 'Next 5 years',
                            }))
                          }
                          className={`h-11 rounded-xl text-[13px] font-semibold border cursor-pointer transition-all ${
                            local.planningHorizonSeasons === cnt
                              ? 'bg-[#0F766E] dark:bg-[#2DD4BF]/20 border-[#0F766E] dark:border-[#2DD4BF] text-white dark:text-[#5EEAD4]'
                              : 'bg-white/70 dark:bg-white/[0.05] border-[#0F766E]/20 dark:border-white/12 text-[#14433C] dark:text-[#D5EEE9]'
                          }`}
                        >
                          {cnt} Seasons
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                        Seasons per Calendar Year
                      </label>
                      <select
                        value={local.cropsPerYear}
                        onChange={(e) =>
                          setLocal((p) => ({ ...p, cropsPerYear: Number(e.target.value) as 1 | 2 }))
                        }
                        className={INPUT_CLASS}
                      >
                        <option value={1}>1 main season / year</option>
                        <option value={2}>2 seasons / year (double-crop)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                        Off-Season Soil Rest Choice
                      </label>
                      <select
                        value={local.coverOrFallowPreference}
                        onChange={(e) =>
                          setLocal((p) => ({
                            ...p,
                            coverOrFallowPreference:
                              e.target.value as RotationWizardDraft['coverOrFallowPreference'],
                          }))
                        }
                        className={INPUT_CLASS}
                      >
                        <option value="auto">Auto-decide (Soil/Water rules)</option>
                        <option value="cover_crop">Planted Cover Crop</option>
                        <option value="fallow">Fallow (moisture conservation)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-base font-bold text-[#072622] dark:text-white">
                      Priority Weights &amp; Crop Constraints
                    </h4>
                    <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] mt-0.5">
                      Weights normalize to 100% with an anti-domination clamp so a single priority never hides constraints.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(
                      [
                        { id: 'balanced', label: 'Balanced' },
                        { id: 'water_first', label: 'Water Save' },
                        { id: 'soil_recovery', label: 'Soil Health' },
                        { id: 'max_output', label: 'Productivity' },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          setLocal((p) => ({ ...p, priorities: getPriorityPreset(preset.id) }))
                        }
                        className="px-3 py-1 rounded-full bg-white/75 dark:bg-white/[0.08] hover:bg-white dark:hover:bg-white/15 border border-[#0F766E]/20 dark:border-white/15 text-xs font-semibold text-[#14433C] dark:text-[#D5EEE9] cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="fs-modal-subpanel space-y-3 p-4">
                  {(
                    [
                      { key: 'soilHealth', label: 'Soil Health', color: '#10B981' },
                      { key: 'waterSaving', label: 'Water Saving', color: '#2DD4BF' },
                      { key: 'productivity', label: 'Productivity', color: '#F59E0B' },
                      { key: 'climateResilience', label: 'Climate Resilience', color: '#38BDF8' },
                      { key: 'cropSuitability', label: 'Crop Suitability', color: '#0D9488' },
                    ] as const
                  ).map((item) => {
                    const effectivePct = Math.round(normalized.weights[item.key] * 100);
                    return (
                      <div
                        key={item.key}
                        className="grid grid-cols-[140px_1fr_54px] items-center gap-3"
                      >
                        <span className="text-[13px] font-medium text-[#14433C] dark:text-[#D5EEE9]">
                          {item.label}
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="60"
                          value={local.priorities[item.key]}
                          onChange={(e) =>
                            setLocal((p) => ({
                              ...p,
                              priorities: {
                                ...p.priorities,
                                [item.key]: Number(e.target.value),
                              },
                            }))
                          }
                          className="accent-[#0F766E] dark:accent-[#24E982] cursor-pointer"
                        />
                        <span
                          className="text-right text-[13px] font-mono font-bold tabular-nums"
                          style={{ color: item.color }}
                        >
                          {effectivePct}%
                        </span>
                      </div>
                    );
                  })}
                  {normalized.conflictWarning && (
                    <p className="text-xs text-amber-700 dark:text-[#FFAD28] pt-1">
                      {normalized.conflictWarning}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-2">
                      Exclude Crops (hard filter)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {CONSTRAINT_CROPS.map((crop) => {
                        const excluded = local.excludedCrops.includes(crop);
                        return (
                          <button
                            key={crop}
                            type="button"
                            onClick={() =>
                              setLocal((p) => ({
                                ...p,
                                excludedCrops: excluded
                                  ? p.excludedCrops.filter((c) => c !== crop)
                                  : [...p.excludedCrops, crop],
                                requiredCrops: excluded
                                  ? p.requiredCrops
                                  : p.requiredCrops.filter((c) => c !== crop),
                              }))
                            }
                            className={`px-3 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
                              excluded
                                ? 'bg-rose-500/20 border-rose-500/60 text-rose-700 dark:text-rose-200'
                                : 'bg-white/70 dark:bg-white/[0.05] border-[#0F766E]/20 dark:border-white/15 text-[#14433C] dark:text-[#D5EEE9]'
                            }`}
                          >
                            {excluded ? `✕ ${crop}` : crop}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-2">
                      Require Crops (must include)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {CONSTRAINT_CROPS.map((crop) => {
                        const required = local.requiredCrops.includes(crop);
                        return (
                          <button
                            key={crop}
                            type="button"
                            onClick={() =>
                              setLocal((p) => ({
                                ...p,
                                requiredCrops: required
                                  ? p.requiredCrops.filter((c) => c !== crop)
                                  : [...p.requiredCrops, crop],
                                excludedCrops: required
                                  ? p.excludedCrops
                                  : p.excludedCrops.filter((c) => c !== crop),
                              }))
                            }
                            className={`px-3 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
                              required
                                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-800 dark:text-[#42F89A]'
                                : 'bg-white/70 dark:bg-white/[0.05] border-[#0F766E]/20 dark:border-white/15 text-[#14433C] dark:text-[#D5EEE9]'
                            }`}
                          >
                            {required ? `✓ ${crop}` : crop}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 6 && (
              <>
                <div>
                  <h4 className="text-base font-bold text-[#072622] dark:text-white">
                    Review Stage &amp; Data Provenance
                  </h4>
                  <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] mt-1 leading-relaxed">
                    Confirm each input and source before re-running candidate generation and deterministic scoring.
                  </p>
                </div>
                <div className="fs-modal-subpanel overflow-hidden divide-y divide-[#0F766E]/12 dark:divide-white/10 text-[13px]">
                  {[
                    {
                      label: 'Farm & Field',
                      val: `${local.farmName} · ${local.fieldName}`,
                      src: 'Field registry',
                      go: 0,
                    },
                    {
                      label: 'Soil Texture / pH',
                      val: `${local.soilTexture}${local.soilPh ? ` · pH ${local.soilPh}` : ''}`,
                      src: local.soilTextureProvenance.replace(/_/g, ' '),
                      go: 1,
                    },
                    {
                      label: 'Water Regime',
                      val: `${local.waterSourceSummary} (${local.waterReliability})`,
                      src: local.waterProvenance.replace(/_/g, ' '),
                      go: 2,
                    },
                    {
                      label: 'Recent Crop',
                      val: local.recentCropDisplay,
                      src: 'Crop history',
                      go: 3,
                    },
                    {
                      label: 'Horizon',
                      val: `${local.planningHorizonSeasons} Seasons (${local.cropsPerYear}/yr)`,
                      src: 'Plan setting',
                      go: 4,
                    },
                    {
                      label: 'Exclusions',
                      val: local.excludedCrops.length ? local.excludedCrops.join(', ') : 'None',
                      src: 'Hard constraint',
                      go: 5,
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div>
                        <span className="text-[#285E55] dark:text-[#8EB8B0]">{row.label}: </span>
                        <span className="font-semibold text-[#072622] dark:text-white">
                          {row.val}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-[#0F766E] dark:text-[#5EEAD4] capitalize">
                          {row.src}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStep(row.go)}
                          className="text-xs font-semibold text-[#059669] dark:text-[#24E982] hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <label className="flex items-center gap-2.5 text-[13px] text-[#14433C] dark:text-[#C5E4DD] cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={syncToServer}
                    onChange={(e) => setSyncToServer(e.target.checked)}
                    className="rounded accent-[#0F766E] dark:accent-[#24E982]"
                  />
                  Also sync updated soil, water, and horizon parameters to this farm&apos;s persistent portfolio record
                </label>
              </>
            )}
          </div>

          {/* Right Context Panel */}
          <aside className="fs-modal-subpanel p-5 space-y-4 h-fit">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#0F766E] dark:text-[#5EEAD4]">
                Why we ask
              </div>
              <p className="text-[13px] text-[#14433C] dark:text-[#D5EEE9] mt-2 leading-relaxed">
                {step === 0 &&
                  'Soil, drainage, and crop history are field-specific rather than averaged across all blocks on a farm.'}
                {step === 1 &&
                  'Texture and soil pH regulate nutrient mineralization and screen out crops sensitive to waterlogging or acidity.'}
                {step === 2 &&
                  'Honest water reliability prevents high-ET crops like maize from ranking #1 when pump capacity is limited.'}
                {step === 3 &&
                  'Knowing your last cash crop prevents consecutive same-family disease cycles and accounts for nitrogen carryovers.'}
                {step === 4 &&
                  'Distinguishing growing seasons from calendar years aligns crop durations with local frost-free planting windows.'}
                {step === 5 &&
                  'Priority weights adjust the objective score while keeping raw water, soil, and agronomic constraints unchanged.'}
                {step === 6 &&
                  'Your active saved plan stays untouched until you explicitly confirm saving a replacement.'}
              </p>
            </div>
            <div className="border-t border-[#0F766E]/15 dark:border-white/10 pt-3.5">
              <div className="text-xs font-bold uppercase tracking-wider text-[#059669] dark:text-[#24E982]">
                Data transparency
              </div>
              <p className="text-[13px] text-[#285E55] dark:text-[#96C7BE] mt-1.5 leading-relaxed">
                Unknown inputs are flagged honestly as data gaps instead of assuming ideal field values.
              </p>
            </div>
            <div className="border-t border-[#0F766E]/15 dark:border-white/10 pt-3.5 space-y-2 text-[13px]">
              <div className="font-bold text-[#072622] dark:text-white">Current Draft Snapshot</div>
              <div className="flex justify-between text-[#1B4D46] dark:text-[#BEE3DC]">
                <span>Soil:</span>
                <span className="font-semibold text-[#072622] dark:text-white">{local.soilTexture}</span>
              </div>
              <div className="flex justify-between text-[#1B4D46] dark:text-[#BEE3DC]">
                <span>Water:</span>
                <span className="font-semibold text-[#072622] dark:text-white">{local.waterSourceSummary}</span>
              </div>
              <div className="flex justify-between text-[#1B4D46] dark:text-[#BEE3DC]">
                <span>Recent:</span>
                <span className="font-semibold text-[#072622] dark:text-white">{local.recentCropDisplay}</span>
              </div>
              <div className="flex justify-between text-[#1B4D46] dark:text-[#BEE3DC]">
                <span>Horizon:</span>
                <span className="font-semibold text-[#072622] dark:text-white">{local.planningHorizonSeasons} Seasons</span>
              </div>
            </div>
          </aside>
        </div>

        {/* Footer navigation */}
        <div className="fs-modal-footer px-6 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className={SECONDARY_BTN_CLASS}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2.5">
            {step < WIZARD_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))}
                className={SECONDARY_BTN_CLASS}
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : null}
            <button
              type="button"
              disabled={submitting}
              onClick={handleApply}
              className={PRIMARY_CTA_CLASS}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" strokeWidth={2.8} />
              )}
              <span>Run Analysis &amp; Update Plan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. Full Technical Details & Agronomy Evidence Modal
// ---------------------------------------------------------------------------
interface PlanDetailEvidenceModalProps {
  open: boolean;
  plan: RotationPlanCandidate;
  engine: RotationEngineOutput;
  draft: RotationWizardDraft;
  onDownloadPdf: () => void;
  onRequestSave: () => void;
  onClose: () => void;
}

export const PlanDetailEvidenceModal: React.FC<PlanDetailEvidenceModalProps> = ({
  open,
  plan,
  engine,
  draft,
  onDownloadPdf,
  onRequestSave,
  onClose,
}) => {
  const [advancedMode, setAdvancedMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ summary: string; questions: string[] } | null>(null);
  const [aiStatusNote, setAiStatusNote] = useState<string | null>(null);

  if (!open) return null;

  const handleAskAgronomist = async () => {
    setAiLoading(true);
    setAiStatusNote(null);
    try {
      const res = await fetch('/api/gemini/farm-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGeminiExplainPayload(engine, plan, draft)),
      });
      const json = (await res.json()) as {
        available?: boolean;
        reason?: string;
        explanation?: {
          plainLanguageSummary?: string;
          questionsForLocalAdvisor?: string[];
        } | null;
      };
      if (json.available && json.explanation?.plainLanguageSummary) {
        setAiResult({
          summary: json.explanation.plainLanguageSummary,
          questions: json.explanation.questionsForLocalAdvisor ?? [],
        });
      } else {
        setAiStatusNote(
          json.reason ||
            'Plain-language explainer unavailable right now — all FAO-56 and legume nitrogen calculations are complete below.'
        );
      }
    } catch {
      setAiStatusNote('Plain-language explainer unavailable offline — full calculation evidence is shown below.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div
      className="fs-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Rotation plan technical details and evidence"
      onClick={onClose}
    >
      <div
        className="fs-modal-shell w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fs-modal-header px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#0F766E] dark:text-[#24E982]">
              <span>{plan.planCode}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                Match Score {plan.matchScore}/100 (±{plan.uncertaintyMarginPts} pts)
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-[#0D9488] dark:text-[#5EEAD4] tabular-nums">
                {plan.dataGaps.length === 0
                  ? 'Local inputs complete'
                  : `${plan.dataGaps.length} input gap${plan.dataGaps.length === 1 ? '' : 's'}`}
              </span>
            </div>
            <h3 className="text-xl font-bold text-[#072622] dark:text-white mt-0.5">{plan.title}</h3>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="inline-flex rounded-full p-1 bg-white/75 dark:bg-black/25 border border-[#0F766E]/20 dark:border-white/15 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setAdvancedMode(false)}
                className={`px-3.5 py-1 rounded-full cursor-pointer transition-colors ${
                  !advancedMode
                    ? 'bg-[#0F766E] dark:bg-[#24E982] text-white dark:text-[#042318]'
                    : 'text-[#1B4D46] dark:text-[#A8D6CD]'
                }`}
              >
                Farmer View
              </button>
              <button
                type="button"
                onClick={() => setAdvancedMode(true)}
                className={`px-3.5 py-1 rounded-full cursor-pointer transition-colors ${
                  advancedMode
                    ? 'bg-[#0F766E] dark:bg-[#2DD4BF] text-white dark:text-[#04211D]'
                    : 'text-[#1B4D46] dark:text-[#A8D6CD]'
                }`}
              >
                Agronomy View
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={CLOSE_BTN_CLASS}
              aria-label="Close plan details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto fs-thin-scroll p-6 space-y-6">
          {/* Summary KPI strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="fs-modal-subpanel p-4 space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#285E55] dark:text-[#8EB8B0]">
                Match Score Range
              </div>
              <div className="text-lg font-bold text-[#072622] dark:text-white tabular-nums">
                {Math.max(0, plan.matchScore - plan.uncertaintyMarginPts)}–
                {Math.min(100, plan.matchScore + plan.uncertaintyMarginPts)} / 100
              </div>
              <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] leading-relaxed">
                Reflects alignment across Soil ({plan.components.soilHealth}%), Water (
                {plan.components.waterEfficiency}%), Output ({plan.components.productivity}%), &amp; Diversity (
                {plan.components.diversity}%).
              </p>
            </div>

            <div className="fs-modal-subpanel p-4 space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#285E55] dark:text-[#8EB8B0]">
                Data Availability &amp; Gaps
              </div>
              <div className="text-lg font-bold text-[#0F766E] dark:text-[#5EEAD4] tabular-nums">
                {plan.dataGaps.length === 0
                  ? 'No missing core inputs'
                  : `${plan.dataGaps.length} input gap${plan.dataGaps.length === 1 ? '' : 's'} logged`}
              </div>
              <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] leading-relaxed">
                {plan.confidenceReason}
              </p>
            </div>

            <div className="fs-modal-subpanel p-4 space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#285E55] dark:text-[#8EB8B0]">
                Fallow vs Cover Crop Rule
              </div>
              <div className="text-lg font-bold text-[#059669] dark:text-[#24E982]">
                {plan.fallowVsCoverDecision.chosen}
              </div>
              <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] leading-relaxed">
                {plan.fallowVsCoverDecision.reason}
              </p>
            </div>
          </div>

          {/* Season-by-season trajectory table */}
          <div className="fs-modal-subpanel overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#0F766E]/15 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 bg-white/40 dark:bg-white/[0.03]">
              <h4 className="text-sm font-bold text-[#072622] dark:text-white">
                Season-by-Season Agronomic Trajectory
              </h4>
              <span className="text-xs text-[#285E55] dark:text-[#96C7BE]">
                Year &amp; growing season tracked separately
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead className="bg-[#0F766E]/8 dark:bg-[#05352E]/60 text-xs font-semibold text-[#1B4D46] dark:text-[#A8D6CD]">
                  <tr>
                    <th className="py-3 px-4">Year</th>
                    <th className="py-3 px-4">Season</th>
                    <th className="py-3 px-4">Crop &amp; Family</th>
                    <th className="py-3 px-4">Window &amp; Duration</th>
                    <th className="py-3 px-4 text-right">ETc Demand</th>
                    <th className="py-3 px-4 text-right">N Balance</th>
                    {advancedMode && <th className="py-3 px-4">Carryover &amp; Disease Break</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0F766E]/12 dark:divide-white/10">
                  {plan.steps.map((s) => (
                    <tr
                      key={s.occurrenceId}
                      className="hover:bg-white/45 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono text-[#285E55] dark:text-[#96C7BE] whitespace-nowrap">
                        {s.yearLabel}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#072622] dark:text-white whitespace-nowrap">
                        {s.seasonLabel}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#072622] dark:text-white">{s.cropName}</div>
                        <div className="text-xs text-[#285E55] dark:text-[#96C7BE]">
                          {advancedMode ? s.botanicalFamily : s.plainFamily}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[#14433C] dark:text-[#D5EEE9]">
                        <div className="font-medium">~{s.durationDays} days</div>
                        <div className="text-xs text-[#285E55] dark:text-[#96C7BE]">
                          {s.plantingWindow} → {s.harvestWindow}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-[#0F766E] dark:text-[#5EEAD4]">
                        {s.etcMmEstimate} mm
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono tabular-nums font-bold ${
                          s.nitrogenBalanceKgHa >= 0
                            ? 'text-[#059669] dark:text-[#24E982]'
                            : 'text-[#D97706] dark:text-[#FFAD28]'
                        }`}
                      >
                        {s.nitrogenBalanceKgHa >= 0
                          ? `+${s.nitrogenBalanceKgHa}`
                          : s.nitrogenBalanceKgHa}{' '}
                        kg/ha
                      </td>
                      {advancedMode && (
                        <td className="py-3.5 px-4 text-xs text-[#14433C] dark:text-[#D5EEE9] max-w-xs leading-relaxed">
                          <div>{s.legumeCarryoverNote}</div>
                          <div className="text-[#285E55] dark:text-[#96C7BE] mt-1">
                            {s.diseaseBreakNote}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Risks & Mitigations */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Material Risks &amp; Practical Mitigations
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {plan.risks.map((risk) => (
                <div
                  key={risk.id}
                  className="p-4 rounded-2xl bg-rose-500/[0.08] dark:bg-rose-950/35 border border-rose-500/30 space-y-2 text-[13px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#072622] dark:text-white">
                      Season {risk.seasonNumber} · {risk.cropName}
                    </span>
                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                      {risk.severity} severity · {risk.confidence} conf.
                    </span>
                  </div>
                  <p className="text-[#4C1D24] dark:text-[#F4CED6] leading-relaxed">{risk.cause}</p>
                  <p className="text-[#072622] dark:text-white font-medium leading-relaxed">
                    Mitigation: {risk.mitigation}
                  </p>
                  <p className="text-xs text-[#7F1D1D]/80 dark:text-rose-200/75">
                    Confirming check: {risk.confirmingData}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Provenance & Plain-Language Explanation */}
          <div className="fs-modal-subpanel p-4 space-y-3 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[#1B4D46] dark:text-[#BEE3DC]">
                <span className="font-semibold text-[#072622] dark:text-white">
                  Model Provenance:
                </span>{' '}
                {engine.engineVersion} · {engine.cropKnowledgeVersion} · Review-by{' '}
                {plan.reviewByDate}
              </div>
              <button
                type="button"
                disabled={aiLoading}
                onClick={handleAskAgronomist}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-[#0F766E]/12 dark:bg-[#2DD4BF]/18 border border-[#0F766E]/35 dark:border-[#2DD4BF]/40 text-xs font-semibold text-[#072622] dark:text-[#5EEAD4] hover:bg-[#0F766E]/20 dark:hover:bg-[#2DD4BF]/28 transition-colors cursor-pointer"
              >
                {aiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <BookOpen className="w-3.5 h-3.5" />
                )}
                <span>Generate Plain-Language Summary</span>
              </button>
            </div>
            {aiResult && (
              <div className="p-4 rounded-xl bg-white/75 dark:bg-[#04231F]/80 border border-[#0F766E]/20 dark:border-[#2DD4BF]/30 space-y-2">
                <p className="text-[#072622] dark:text-[#ECF8F5] leading-relaxed">
                  {aiResult.summary}
                </p>
                {aiResult.questions.length > 0 && (
                  <div className="text-xs text-[#1B4D46] dark:text-[#BEE3DC]">
                    <span className="font-semibold text-[#0F766E] dark:text-[#5EEAD4]">
                      Checklist for local advisor:{' '}
                    </span>
                    {aiResult.questions.join(' · ')}
                  </div>
                )}
              </div>
            )}
            {aiStatusNote && (
              <p className="text-xs text-[#285E55] dark:text-[#96C7BE]">{aiStatusNote}</p>
            )}
          </div>
        </div>

        <div className="fs-modal-footer px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onDownloadPdf} className={SECONDARY_BTN_CLASS}>
            <Download className="w-4 h-4" />
            <span>Download Plan PDF</span>
          </button>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={onClose} className={SECONDARY_BTN_CLASS}>
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onRequestSave();
              }}
              className={PRIMARY_CTA_CLASS}
            >
              Save as Active Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. View All Plans & Head-to-Head Comparison Modal
// ---------------------------------------------------------------------------
interface AllPlansComparisonModalProps {
  open: boolean;
  engine: RotationEngineOutput;
  draft: RotationWizardDraft;
  previewPlanId: string;
  onSelectPlan: (planId: string) => void;
  onClose: () => void;
}

export const AllPlansComparisonModal: React.FC<AllPlansComparisonModalProps> = ({
  open,
  engine,
  draft,
  previewPlanId,
  onSelectPlan,
  onClose,
}) => {
  const [leftId, setLeftId] = useState(engine.candidates[0]?.id ?? '');
  const [rightId, setRightId] = useState(
    engine.candidates[1]?.id ?? engine.candidates[0]?.id ?? ''
  );
  const [showRejected, setShowRejected] = useState(false);

  React.useEffect(() => {
    if (open) {
      setLeftId(previewPlanId || engine.candidates[0]?.id || '');
      setRightId(
        engine.candidates.find((c) => c.id !== (previewPlanId || engine.candidates[0]?.id))?.id ??
          engine.candidates[0]?.id ??
          ''
      );
    }
  }, [open, previewPlanId, engine.candidates]);

  if (!open) return null;

  const leftPlan = engine.candidates.find((c) => c.id === leftId) ?? engine.candidates[0];
  const rightPlan =
    engine.candidates.find((c) => c.id === rightId) ?? engine.candidates[1] ?? engine.candidates[0];
  const comparison =
    leftPlan && rightPlan
      ? compareRotationPlans(leftPlan, rightPlan, engine.normalizedWeights.weights)
      : null;

  return (
    <div
      className="fs-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Compare all rotation plans"
      onClick={onClose}
    >
      <div
        className="fs-modal-shell w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fs-modal-header px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-[#0F766E]/15 dark:bg-[#24E982]/15 border border-[#0F766E]/30 dark:border-[#24E982]/35 grid place-items-center text-[#0F766E] dark:text-[#24E982]">
              <Scale className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-xl font-bold text-[#072622] dark:text-white">
                All Ranked Plans &amp; Head-to-Head Matrix
              </h3>
              <p className="text-[13px] text-[#285E55] dark:text-[#96C7BE]">
                {engine.candidates.length} valid sequences calculated for {draft.farmName} (
                {draft.planningHorizonSeasons} seasons)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={CLOSE_BTN_CLASS}
            aria-label="Close comparison matrix"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto fs-thin-scroll p-6 space-y-6">
          {/* Ranked Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {engine.candidates.map((cand) => {
              const isSelected = cand.id === previewPlanId;
              return (
                <div
                  key={cand.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#0F766E]/12 dark:bg-[#0A3A33]/75 border-[#0F766E] dark:border-[#24E982]'
                      : 'fs-modal-subpanel'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0F766E] dark:text-[#24E982]">
                        #{cand.rank} {cand.planCode}
                        {cand.isRecommended ? ' · Recommended' : ''}
                      </span>
                      <span className="text-base font-mono font-extrabold text-[#072622] dark:text-white tabular-nums">
                        {cand.matchScore}/100
                      </span>
                    </div>
                    <div className="text-sm font-bold text-[#072622] dark:text-white mt-1.5">
                      {cand.title}
                    </div>
                    <div className="text-xs text-[#285E55] dark:text-[#96C7BE] mt-1 leading-relaxed">
                      {cand.subtitle}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-[#1B4D46] dark:text-[#C5E4DD] tabular-nums">
                      <span>ETc: {cand.totalWaterDemandMm} mm</span>
                      <span>Soil: {cand.components.soilHealth}%</span>
                      <span>
                        N: {cand.netNitrogenBalanceKgHa >= 0 ? '+' : ''}
                        {cand.netNitrogenBalanceKgHa}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectPlan(cand.id);
                      onClose();
                    }}
                    className={`w-full h-9 rounded-full text-xs font-bold cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#0F766E] dark:bg-[#24E982] text-white dark:text-[#042318]'
                        : 'bg-white/75 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 text-[#072622] dark:text-white border border-[#0F766E]/20 dark:border-white/15'
                    }`}
                  >
                    {isSelected ? 'Currently Previewing' : `Select ${cand.planCode}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Head-to-Head side-by-side comparator */}
          {comparison && (
            <div className="fs-modal-subpanel p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-base font-bold text-[#072622] dark:text-white">
                  Head-to-Head Comparison
                </h4>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={leftPlan.id}
                    onChange={(e) => setLeftId(e.target.value)}
                    className="h-9 px-3 rounded-xl bg-white/80 dark:bg-[#04231F] border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[#072622] dark:text-white font-semibold"
                  >
                    {engine.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.planCode}: {c.title}
                      </option>
                    ))}
                  </select>
                  <span className="text-[#285E55] dark:text-[#96C7BE] font-semibold">vs</span>
                  <select
                    value={rightPlan.id}
                    onChange={(e) => setRightId(e.target.value)}
                    className="h-9 px-3 rounded-xl bg-white/80 dark:bg-[#04231F] border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[#072622] dark:text-white font-semibold"
                  >
                    {engine.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.planCode}: {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#0F766E]/15 dark:border-white/10 text-xs text-[#285E55] dark:text-[#96C7BE]">
                      <th className="py-2.5 text-left font-semibold">Criterion</th>
                      <th className="py-2.5 text-left font-semibold">{leftPlan.planCode}</th>
                      <th className="py-2.5 text-left font-semibold">{rightPlan.planCode}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0F766E]/10 dark:divide-white/10">
                    {comparison.rows.map((row) => (
                      <tr key={row.criterion}>
                        <td className="py-2.5 text-[#14433C] dark:text-[#D5EEE9] font-medium">
                          {row.criterion}
                        </td>
                        <td
                          className={`py-2.5 font-mono tabular-nums ${
                            row.winner === 'left'
                              ? 'text-[#059669] dark:text-[#24E982] font-bold'
                              : 'text-[#072622] dark:text-white'
                          }`}
                        >
                          {row.leftValue}
                        </td>
                        <td
                          className={`py-2.5 font-mono tabular-nums ${
                            row.winner === 'right'
                              ? 'text-[#059669] dark:text-[#24E982] font-bold'
                              : 'text-[#072622] dark:text-white'
                          }`}
                        >
                          {row.rightValue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 rounded-xl bg-[#0F766E]/10 dark:bg-[#063831]/60 border border-[#0F766E]/20 dark:border-[#2DD4BF]/25 text-[13px]">
                <div className="font-bold text-[#0F766E] dark:text-[#24E982]">
                  {comparison.conclusionHeadline}
                </div>
                <p className="text-[#14433C] dark:text-[#D5EEE9] mt-1 leading-relaxed">
                  {comparison.conclusionDetail}
                </p>
              </div>
            </div>
          )}

          {/* Rejected candidates under hard constraints */}
          <div className="fs-modal-subpanel overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRejected((v) => !v)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-[13px] font-semibold text-[#072622] dark:text-[#D5EEE9] hover:bg-white/40 dark:hover:bg-white/5 cursor-pointer"
            >
              <span>
                Filtered Out Under Field Constraints ({engine.rejectedCandidates.length} evaluated)
              </span>
              <ChevronRight
                className={`w-4 h-4 transition-transform ${showRejected ? 'rotate-90' : ''}`}
              />
            </button>
            {showRejected && (
              <div className="p-5 pt-1 space-y-2.5 text-[13px]">
                {engine.rejectedCandidates.length === 0 ? (
                  <p className="text-[#285E55] dark:text-[#96C7BE]">
                    All candidate sequences satisfied hard agronomic constraints.
                  </p>
                ) : (
                  engine.rejectedCandidates.map((rej) => (
                    <div
                      key={rej.id}
                      className="p-3.5 rounded-xl bg-rose-500/[0.08] dark:bg-rose-950/35 border border-rose-500/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#072622] dark:text-white">
                          {rej.sequenceText}
                        </span>
                        <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                          {rej.failureCategory}
                        </span>
                      </div>
                      <div className="text-[#4C1D24] dark:text-[#F4CED6] mt-1">
                        {rej.failedConstraint}
                      </div>
                      <div className="text-xs text-[#7F1D1D]/80 dark:text-rose-200/75 mt-1">
                        Computed: {rej.computedValue} · Required Threshold: {rej.thresholdValue}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 4. Crop Occurrence & Single-Crop Suitability Explorer Modal ("Learn More")
// ---------------------------------------------------------------------------
interface CropSuitabilityDetailModalProps {
  open: boolean;
  initialTab: 'occurrence' | 'suitability';
  selectedStep: CropSeasonStepDetail | null;
  suitabilityList: CropSuitabilityEvaluation[];
  farmName: string;
  onClose: () => void;
}

export const CropSuitabilityDetailModal: React.FC<CropSuitabilityDetailModalProps> = ({
  open,
  initialTab,
  selectedStep,
  suitabilityList,
  farmName,
  onClose,
}) => {
  const [tab, setTab] = useState<'occurrence' | 'suitability'>(initialTab);
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('All');
  const [expandedCropId, setExpandedCropId] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTab(initialTab);
      setExpandedCropId(null);
    }
  }, [open, initialTab, selectedStep?.occurrenceId]);

  if (!open) return null;

  const filteredCrops = suitabilityList.filter((item) => {
    const matchesSearch =
      !search.trim() ||
      item.cropName.toLowerCase().includes(search.toLowerCase()) ||
      item.scientificName.toLowerCase().includes(search.toLowerCase());
    const matchesFam = familyFilter === 'All' || item.plainFamily === familyFilter;
    return matchesSearch && matchesFam;
  });

  return (
    <div
      className="fs-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Crop detail and single-crop suitability"
      onClick={onClose}
    >
      <div
        className="fs-modal-shell w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Crisp Header */}
        <div className="fs-modal-header px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-full bg-[#0F766E]/15 dark:bg-[#24E982]/15 border border-[#0F766E]/30 dark:border-[#24E982]/35 grid place-items-center text-[#0F766E] dark:text-[#24E982] shrink-0">
              <Sprout className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-[#072622] dark:text-white truncate">
                {tab === 'occurrence' && selectedStep
                  ? `${selectedStep.cropName} — ${selectedStep.seasonLabel}`
                  : `Crop Suitability & Rotation Guide · ${farmName}`}
              </h3>
              <p className="text-[13px] text-[#285E55] dark:text-[#96C7BE] mt-0.5">
                Individual crop fit against {farmName}&apos;s field soil, pH, water, and climate profile
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="inline-flex rounded-full p-1 bg-white/75 dark:bg-black/25 border border-[#0F766E]/20 dark:border-white/15 text-xs font-semibold">
              {selectedStep && (
                <button
                  type="button"
                  onClick={() => setTab('occurrence')}
                  className={`px-3.5 py-1 rounded-full cursor-pointer transition-colors ${
                    tab === 'occurrence'
                      ? 'bg-[#0F766E] dark:bg-[#24E982] text-white dark:text-[#042318]'
                      : 'text-[#1B4D46] dark:text-[#A8D6CD]'
                  }`}
                >
                  Rotation Stage
                </button>
              )}
              <button
                type="button"
                onClick={() => setTab('suitability')}
                className={`px-3.5 py-1 rounded-full cursor-pointer transition-colors ${
                  tab === 'suitability'
                    ? 'bg-[#0F766E] dark:bg-[#2DD4BF] text-white dark:text-[#04211D]'
                    : 'text-[#1B4D46] dark:text-[#A8D6CD]'
                }`}
              >
                All Crops ({suitabilityList.length})
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={CLOSE_BTN_CLASS}
              aria-label="Close suitability details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto fs-thin-scroll p-6 space-y-5">
          {tab === 'occurrence' && selectedStep && (
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 items-start">
              <div className="space-y-3">
                <div className="rounded-2xl overflow-hidden border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 shadow-md">
                  <img
                    src={resolveRotationCropImage(selectedStep.cropId)}
                    alt={selectedStep.cropName}
                    className="w-full h-52 object-cover"
                  />
                </div>
                <div className="fs-modal-subpanel px-4 py-3 text-[13px] flex items-center justify-between">
                  <span className="text-[#285E55] dark:text-[#96C7BE]">Schedule Window</span>
                  <span className="font-bold text-[#072622] dark:text-white">
                    {selectedStep.yearLabel}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="fs-modal-subpanel p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#285E55] dark:text-[#8EB8B0]">
                      Crop Family
                    </div>
                    <div className="text-base font-bold text-[#072622] dark:text-white mt-1">
                      {selectedStep.plainFamily}
                    </div>
                    <div className="text-xs text-[#285E55] dark:text-[#96C7BE] mt-0.5">
                      {selectedStep.botanicalFamily}
                    </div>
                  </div>
                  <div className="fs-modal-subpanel p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#285E55] dark:text-[#8EB8B0]">
                      Cycle &amp; Timing
                    </div>
                    <div className="text-base font-bold text-[#072622] dark:text-white mt-1 tabular-nums">
                      ~{selectedStep.durationDays} days
                    </div>
                    <div className="text-xs text-[#285E55] dark:text-[#96C7BE] mt-0.5">
                      {selectedStep.plantingWindow}
                    </div>
                  </div>
                  <div className="fs-modal-subpanel p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#285E55] dark:text-[#8EB8B0]">
                      Water &amp; Nitrogen
                    </div>
                    <div className="text-base font-bold text-[#0F766E] dark:text-[#5EEAD4] mt-1 tabular-nums">
                      {selectedStep.etcMmEstimate} mm ETc
                    </div>
                    <div
                      className={`text-xs font-bold mt-0.5 tabular-nums ${
                        selectedStep.nitrogenBalanceKgHa >= 0
                          ? 'text-[#059669] dark:text-[#24E982]'
                          : 'text-[#D97706] dark:text-[#FFAD28]'
                      }`}
                    >
                      {selectedStep.nitrogenBalanceKgHa >= 0
                        ? `+${selectedStep.nitrogenBalanceKgHa}`
                        : selectedStep.nitrogenBalanceKgHa}{' '}
                      kg N/ha
                    </div>
                  </div>
                </div>

                <div className="fs-modal-subpanel p-5 space-y-3 text-[13.5px]">
                  <h4 className="text-sm font-bold text-[#072622] dark:text-white">
                    Agronomic Role in This Rotation
                  </h4>
                  <p className="text-[#14433C] dark:text-[#D5EEE9] leading-relaxed">
                    {selectedStep.rationale}
                  </p>
                  <div className="pt-2 border-t border-[#0F766E]/12 dark:border-white/10 space-y-2">
                    <div className="flex items-start gap-2 text-[#059669] dark:text-[#24E982] font-medium">
                      <Check className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2.6} />
                      <span>{selectedStep.legumeCarryoverNote}</span>
                    </div>
                    <div className="flex items-start gap-2 text-[#1B4D46] dark:text-[#BEE3DC]">
                      <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#0F766E] dark:text-[#5EEAD4]" />
                      <span>{selectedStep.diseaseBreakNote}</span>
                    </div>
                    {selectedStep.fallowVsCoverReason && (
                      <div className="flex items-start gap-2 text-[#0F766E] dark:text-[#5EEAD4]">
                        <Sprout className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{selectedStep.fallowVsCoverReason}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'suitability' && (
            <>
              {/* Clean Info Callout */}
              <div className="fs-modal-subpanel px-5 py-3.5 flex items-start gap-3 text-[13.5px] text-[#14433C] dark:text-[#D5EEE9]">
                <Info className="w-4 h-4 text-[#0F766E] dark:text-[#5EEAD4] shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Each percentage measures how closely a single crop matches your field&apos;s soil texture, pH, drainage, water supply, and climate baseline. Click any crop card below to view every factor breakdown.
                </p>
              </div>

              {/* Filter Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-[#285E55] dark:text-[#8EB8B0] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search crops by common or botanical name..."
                    className="w-full h-10 pl-10 pr-3.5 rounded-full bg-white/80 dark:bg-[#04231F]/80 border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[13px] text-[#072622] dark:text-white placeholder:text-[#3E6B63]/70 dark:placeholder:text-[#7EB5AA]/60 focus:outline-none focus:border-[#0F766E] dark:focus:border-[#2DD4BF]"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-[#285E55] dark:text-[#8EB8B0] mr-1" />
                  {['All', 'Cereal', 'Legume', 'Oilseed', 'Cover Crop'].map((fam) => (
                    <button
                      key={fam}
                      type="button"
                      onClick={() => setFamilyFilter(fam)}
                      className={`h-8 px-3.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                        familyFilter === fam
                          ? 'bg-[#0F766E] dark:bg-[#2DD4BF] text-white dark:text-[#04211D]'
                          : 'bg-white/70 dark:bg-white/[0.06] text-[#14433C] dark:text-[#C5E4DD] border border-[#0F766E]/20 dark:border-white/15 hover:bg-white dark:hover:bg-white/12'
                      }`}
                    >
                      {fam}
                    </button>
                  ))}
                </div>
              </div>

              {/* Spacious 2-Column Suitability Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCrops.map((crop) => {
                  const isExpanded = expandedCropId === crop.cropId;
                  const factorsToShow = isExpanded ? crop.factors : crop.factors.slice(0, 4);
                  const scoreColor =
                    crop.status === 'excluded'
                      ? 'text-rose-600 dark:text-rose-400'
                      : (crop.matchScore ?? 0) >= 80
                        ? 'text-[#059669] dark:text-[#24E982]'
                        : 'text-[#D97706] dark:text-[#FFAD28]';

                  return (
                    <div
                      key={crop.cropId}
                      className="fs-modal-subpanel p-5 flex flex-col justify-between gap-4 hover:border-[#0F766E]/40 dark:hover:border-[#2DD4BF]/45 transition-colors"
                    >
                      {/* Top Header Row */}
                      <div className="flex items-center gap-3.5">
                        <img
                          src={resolveRotationCropImage(crop.cropId)}
                          alt={crop.cropName}
                          className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-[#0F766E]/20 dark:border-[#2DD4BF]/25 shadow-sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <h4 className="text-base font-bold text-[#072622] dark:text-white truncate">
                              {crop.cropName}
                            </h4>
                            <span className={`text-sm font-mono font-extrabold tabular-nums shrink-0 ${scoreColor}`}>
                              {crop.matchScore !== null ? `${crop.matchScore}% Fit` : 'Excluded'}
                            </span>
                          </div>
                          <div className="text-xs text-[#285E55] dark:text-[#96C7BE] mt-0.5">
                            {crop.plainFamily} · <span className="italic">{crop.scientificName}</span>
                          </div>
                          <div className="text-xs font-medium text-[#0F766E] dark:text-[#5EEAD4] mt-0.5">
                            {crop.missingToImprove.length > 0
                              ? `Missing: ${crop.missingToImprove.join(', ')}`
                              : `Limiting factor: ${crop.limitingFactor}`}
                          </div>
                        </div>
                      </div>

                      {/* Clean Factor Bars */}
                      <div className="space-y-2.5">
                        {factorsToShow.map((f) => {
                          const barPct = f.score ?? 0;
                          const barColor =
                            barPct >= 80
                              ? 'bg-gradient-to-r from-[#0D9488] to-[#24E982]'
                              : barPct >= 60
                                ? 'bg-gradient-to-r from-[#0D9488] to-[#2DD4BF]'
                                : 'bg-gradient-to-r from-[#D97706] to-[#FBBF24]';
                          return (
                            <div key={f.key} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-[#14433C] dark:text-[#D5EEE9]">
                                  {f.label}
                                </span>
                                <span className="font-mono font-bold tabular-nums text-[#072622] dark:text-white">
                                  {f.score !== null ? `${f.score}%` : 'Missing data'}
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-[#0F766E]/12 dark:bg-white/10 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${barColor} transition-all duration-300`}
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                              {isExpanded && (f.detail || f.statusText) && (
                                <p className="text-xs text-[#285E55] dark:text-[#96C7BE] leading-snug pt-0.5">
                                  {f.detail || f.statusText}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer Summary & Toggle */}
                      <div className="pt-3 border-t border-[#0F766E]/12 dark:border-white/10 flex items-center justify-between gap-3">
                        <p className="text-xs text-[#1B4D46] dark:text-[#BEE3DC] leading-snug flex-1">
                          <span className="font-semibold text-[#072622] dark:text-white">
                            Primary constraint:{' '}
                          </span>
                          {crop.limitingFactor}
                        </p>
                        {crop.factors.length > 4 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCropId((prev) =>
                                prev === crop.cropId ? null : crop.cropId
                              )
                            }
                            className="text-xs font-semibold text-[#0F766E] dark:text-[#5EEAD4] hover:underline shrink-0 cursor-pointer"
                          >
                            {isExpanded ? 'Show less' : `All ${crop.factors.length} factors`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 5. Confirm Save Active Plan Modal
// ---------------------------------------------------------------------------
interface ConfirmSavePlanModalProps {
  open: boolean;
  farm: MyFarmRecord;
  plan: RotationPlanCandidate;
  onConfirmSave: (reasonCode: PlanDecisionReasonCode, reasonNote: string) => Promise<void>;
  onClose: () => void;
}

export const ConfirmSavePlanModal: React.FC<ConfirmSavePlanModalProps> = ({
  open,
  farm,
  plan,
  onConfirmSave,
  onClose,
}) => {
  const [reasonCode, setReasonCode] = useState<PlanDecisionReasonCode>('agronomic_fit');
  const [reasonNote, setReasonNote] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setReasonCode('agronomic_fit');
      setReasonNote('');
      setSaving(false);
    }
  }, [open, plan.id]);

  if (!open) return null;

  const priorTitle = farm.activePlan?.title || 'No active rotation plan yet';

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onConfirmSave(reasonCode, reasonNote);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fs-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm saving active rotation plan"
      onClick={onClose}
    >
      <div
        className="fs-modal-shell w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fs-modal-header px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-[#0F766E] dark:text-[#24E982]" />
            <h3 className="text-lg font-bold text-[#072622] dark:text-white">
              Confirm Active Rotation Plan
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={CLOSE_BTN_CLASS}
            aria-label="Close save confirmation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13.5px]">
          <p className="text-[#14433C] dark:text-[#D5EEE9] leading-relaxed">
            Saving sets a new active plan version for{' '}
            <strong className="text-[#072622] dark:text-white">{farm.name}</strong> and preserves
            all prior versions inside your rotation decision journal.
          </p>

          <div className="fs-modal-subpanel p-4 space-y-2 text-[13px]">
            <div>
              <span className="text-[#285E55] dark:text-[#96C7BE]">Previous Active Plan: </span>
              <span className="font-medium text-[#072622] dark:text-white">{priorTitle}</span>
            </div>
            <div className="flex items-center gap-2 text-[#059669] dark:text-[#24E982] font-bold">
              <ArrowRight className="w-4 h-4 shrink-0" />
              <span>
                New Active ({plan.planCode}, {plan.matchScore}/100): {plan.title}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
              Primary Decision Reason
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as PlanDecisionReasonCode)}
              className={INPUT_CLASS}
            >
              <option value="agronomic_fit">Best agronomic &amp; soil health fit</option>
              <option value="water">Water conservation / reliability alignment</option>
              <option value="cost">Fertiliser / input cost reduction</option>
              <option value="equipment">Matches current machinery &amp; planting windows</option>
              <option value="market">Local market / contract demand</option>
              <option value="management_preference">Farmer management preference</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
              Field Note (optional)
            </label>
            <textarea
              rows={2}
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="e.g. Locking Plan A for 2026–2029 cycles across North Block..."
              className="w-full p-3 rounded-xl bg-white/80 dark:bg-[#04231F]/80 border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[13px] text-[#072622] dark:text-white placeholder:text-[#3E6B63]/70 dark:placeholder:text-[#7EB5AA]/60 focus:outline-none focus:border-[#0F766E] dark:focus:border-[#2DD4BF]"
            />
          </div>
        </div>

        <div className="fs-modal-footer px-6 py-4 flex items-center justify-end gap-2.5">
          <button type="button" onClick={onClose} className={SECONDARY_BTN_CLASS}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className={PRIMARY_CTA_CLASS}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" strokeWidth={2.8} />
            )}
            <span>Confirm &amp; Save Active Plan</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 6. Review Gate Modal
// ---------------------------------------------------------------------------
export const ReviewGateModal: React.FC<{
  open: boolean;
  engine: RotationEngineOutput;
  onEditInputs: () => void;
  onComparePlans: () => void;
  onDismissTrigger: (id: string) => void;
  onClose: () => void;
}> = ({ open, engine, onEditInputs, onComparePlans, onDismissTrigger, onClose }) => {
  if (!open) return null;
  const { reviewGate } = engine;

  return (
    <div
      className="fs-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Rotation review gate status"
      onClick={onClose}
    >
      <div
        className="fs-modal-shell w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fs-modal-header px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Compass className="w-5 h-5 text-[#0F766E] dark:text-[#24E982]" />
            <h3 className="text-lg font-bold text-[#072622] dark:text-white">
              Plan Review Status: {reviewGate.badgeLabel}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={CLOSE_BTN_CLASS}
            aria-label="Close review status"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13.5px]">
          <div className="text-xs text-[#285E55] dark:text-[#96C7BE] tabular-nums">
            Last checked: {formatShortPlanDate(reviewGate.lastCheckedAt)} · Next scheduled review:{' '}
            {engine.candidates[0]?.reviewByDate}
          </div>
          {reviewGate.triggers.length === 0 ? (
            <div className="fs-modal-subpanel p-4 text-[#14433C] dark:text-[#D5EEE9] leading-relaxed">
              All field boundaries, water constraints, and crop exclusions remain aligned with your current plan.
            </div>
          ) : (
            reviewGate.triggers.map((trig) => (
              <div
                key={trig.id}
                className="p-4 rounded-2xl bg-amber-500/[0.10] dark:bg-amber-950/35 border border-amber-500/35 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#072622] dark:text-white">{trig.dependency}</span>
                  <span className="text-xs font-semibold text-amber-700 dark:text-[#FFAD28]">
                    {trig.ruleVersion}
                  </span>
                </div>
                <p className="text-[#452A06] dark:text-[#F4E1C0] leading-relaxed">{trig.reason}</p>
                <p className="text-xs text-[#285E55] dark:text-[#96C7BE]">
                  Assumption affected: {trig.assumptionAffected}
                </p>
                {trig.severity === 'review_suggested' && (
                  <button
                    type="button"
                    onClick={() => onDismissTrigger(trig.id)}
                    className="text-xs font-semibold text-[#0F766E] dark:text-[#5EEAD4] hover:underline cursor-pointer"
                  >
                    Dismiss suggestion
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="fs-modal-footer px-6 py-4 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onComparePlans();
            }}
            className={SECONDARY_BTN_CLASS}
          >
            Compare Alternatives
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEditInputs();
            }}
            className={PRIMARY_CTA_CLASS}
          >
            Review Inputs
          </button>
        </div>
      </div>
    </div>
  );
};
