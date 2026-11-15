import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Database,
  HelpCircle,
  Info,
  Layers,
  MapPin,
  Plus,
  Search,
  Sliders,
  Sprout,
  Trash2,
} from 'lucide-react';
import { AGRICULTURAL_CROP_CATALOG, CROP_CATEGORY_ORDER } from '../../data/farmCropCatalog';
import { QuestionDefinition, PRIORITY_PRESET_VECTORS, getAnswerValue } from '../../lib/questionnaireSchema';
import {
  areaToHectares,
  ecToDsM,
  normalizePriorityVector,
  normalizeSoilOrganic,
  waterVolumeToMm,
} from '../../lib/questionnaireEngine';
import {
  AnswerProvenanceType,
  AnswerScope,
  ConfirmedLocationRecord,
  CropHistorySeasonRecord,
  CurrentCropRecord,
  FieldGeometryRecord,
  IrrigationApplicationEstimate,
  IrrigationRoutineRecord,
  NutrientTestEntry,
  PestDiseaseRecord,
  PriorityPresetId,
  PriorityVectorRaw,
  QuestionnaireDraft,
  SeasonalWaterLimitRecord,
  SoilEcRecord,
  SoilLimitationItem,
  SoilOrganicRecord,
  SoilPhRecord,
  WaterQualityRecord,
  YieldHistoryRecord,
} from '../../types/questionnaire';
import { MyFarmRecord, PortfolioFieldRecord } from '../../types/myFarms';
import { QuestionBoundaryPicker, QuestionLocationPicker } from './QuestionLocationControl';

export interface AnswerSaveOptions {
  unit?: string;
  scope?: AnswerScope;
  sourceType?: AnswerProvenanceType;
  validTime?: string;
  depth?: string;
  notes?: string;
}

interface QuestionAnswerControlsProps {
  question: QuestionDefinition;
  draft: QuestionnaireDraft;
  isLight: boolean;
  savedFarms: MyFarmRecord[];
  savedFields: PortfolioFieldRecord[];
  onSaveAnswer: (questionId: string, value: unknown, opts?: AnswerSaveOptions) => void;
  onSelectMode: (mode: 'create' | 'edit') => void;
  onSelectExistingFarm: (farm: MyFarmRecord) => void;
  onSelectExistingField: (field: PortfolioFieldRecord | 'new' | 'whole_farm') => void;
  onChooseNewFarmSetup?: () => void;
  onChooseExistingFarmForNewField?: (farm?: MyFarmRecord) => void;
  onConfirmLocation: (loc: ConfirmedLocationRecord) => void;
  onUpdateGeometry: (geom: FieldGeometryRecord) => void;
  onUpdateTimezone: (tz: string) => void;
}

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Athens',
  'Africa/Cairo',
  'Africa/Nairobi',
  'Africa/Casablanca',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Australia/Perth',
  'Pacific/Auckland',
];

function getTimezonesList(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof intl.supportedValuesOf === 'function') {
      const vals = intl.supportedValuesOf('timeZone');
      if (Array.isArray(vals) && vals.length > 0) return vals;
    }
  } catch {
    // Fallback list
  }
  return FALLBACK_TIMEZONES;
}

const CARD_BTN_BASE =
  'w-full text-left rounded-[20px] px-5 py-4 transition-all duration-150 cursor-pointer';

function getOptionCardClass(selected: boolean, isLight: boolean): string {
  if (selected) {
    return isLight
      ? 'fs-qst-option fs-qst-option-active text-[#04231E]'
      : 'fs-qst-option fs-qst-option-active text-white';
  }
  return isLight
    ? 'fs-qst-option text-[#0B3630]'
    : 'fs-qst-option text-[#D8F3EC]';
}

function getInputClass(_isLight: boolean): string {
  return 'fs-qst-input';
}

export const QuestionAnswerControls: React.FC<QuestionAnswerControlsProps> = ({
  question,
  draft,
  isLight,
  savedFarms,
  savedFields,
  onSaveAnswer,
  onSelectMode,
  onSelectExistingFarm,
  onSelectExistingField,
  onChooseNewFarmSetup,
  onChooseExistingFarmForNewField,
  onConfirmLocation,
  onUpdateGeometry,
  onUpdateTimezone,
}) => {
  const existingAns = draft.answers[question.id];
  const val = existingAns?.value;

  const [tzFilter, setTzFilter] = useState('');
  const [cropFilter, setCropFilter] = useState('');
  const [farmDropdownOpen, setFarmDropdownOpen] = useState(false);
  const farmDropdownRef = useRef<HTMLDivElement | null>(null);
  const [showSimpleBoundary, setShowSimpleBoundary] = useState(
    draft.geometry.geometryStatus === 'polygon_verified'
  );
  const [newFarmName, setNewFarmName] = useState(() => {
    const q01 = getAnswerValue<{ farmName?: string; mode?: string }>(draft, 'Q01');
    return q01?.mode === 'new' ? q01.farmName || '' : '';
  });
  const [newFarmNote, setNewFarmNote] = useState(() => {
    const q01 = getAnswerValue<{ description?: string }>(draft, 'Q01');
    return q01?.description || '';
  });
  const [showNewFarmForm, setShowNewFarmForm] = useState(() => {
    const q01 = getAnswerValue<{ mode?: string }>(draft, 'Q01');
    return q01?.mode === 'new' || savedFarms.length === 0;
  });

  useEffect(() => {
    if (!farmDropdownOpen) return;
    const onDocDown = (ev: MouseEvent) => {
      if (farmDropdownRef.current && !farmDropdownRef.current.contains(ev.target as Node)) {
        setFarmDropdownOpen(false);
      }
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setFarmDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [farmDropdownOpen]);

  useEffect(() => {
    const q01 = getAnswerValue<{ farmName?: string; mode?: string }>(draft, 'Q01');
    if (q01?.mode === 'new') {
      setNewFarmName(q01.farmName || '');
    } else if (draft.setupIntent === 'new_farm' && !q01?.farmName) {
      setNewFarmName('');
    }
  }, [draft.setupIntent, draft.questionnaireId]);

  const allTimezones = useMemo(() => getTimezonesList(), []);
  const filteredTimezones = useMemo(() => {
    const q = tzFilter.trim().toLowerCase();
    if (!q) return allTimezones.slice(0, 60);
    return allTimezones.filter((tz) => tz.toLowerCase().includes(q)).slice(0, 60);
  }, [allTimezones, tzFilter]);

  const filteredCrops = useMemo(() => {
    const q = cropFilter.trim().toLowerCase();
    return q
      ? AGRICULTURAL_CROP_CATALOG.filter(
          (c) =>
            c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
        )
      : AGRICULTURAL_CROP_CATALOG;
  }, [cropFilter]);

  const inputCls = getInputClass(isLight);
  const subtextCls = isLight ? 'text-[#245A52]' : 'text-[#A7D9CF]';
  const labelCls = isLight ? 'text-[#0B3630]' : 'text-[#DCF6F0]';

  // SIMPLE_1: Entry Choice ("Add a new farm" vs "Add a new field to an existing farm" + Farm Dropdown)
  if (question.controlType === 'simple_entry_choice') {
    const q01 = getAnswerValue<{ mode?: string; farmId?: string; farmName?: string }>(draft, 'Q01') || {};
    const intent = draft.setupIntent;
    const selectedFarm =
      intent === 'new_field_existing_farm'
        ? savedFarms.find((f) => f.id === (q01.farmId || draft.farmId)) ?? null
        : null;

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => {
              setFarmDropdownOpen(false);
              onChooseNewFarmSetup?.();
            }}
            className={`${CARD_BTN_BASE} min-h-[86px] flex items-center ${getOptionCardClass(intent === 'new_farm', isLight)}`}
          >
            <div className="w-full flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="w-10 h-10 rounded-full bg-[#14B89A]/18 border border-[#14B89A]/35 grid place-items-center text-[#0F766E] dark:text-[#2DD4BF] shrink-0">
                  <Plus className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold leading-snug">Add a new farm</div>
                  <p className={`text-xs mt-0.5 leading-snug ${subtextCls}`}>
                    Starts with 1 primary field.
                  </p>
                </div>
              </div>
              {intent === 'new_farm' && (
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF] shrink-0" />
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onChooseExistingFarmForNewField?.();
            }}
            className={`${CARD_BTN_BASE} min-h-[86px] flex items-center ${getOptionCardClass(
              intent === 'new_field_existing_farm',
              isLight
            )}`}
          >
            <div className="w-full flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="w-10 h-10 rounded-full bg-[#14B89A]/18 border border-[#14B89A]/35 grid place-items-center text-[#0F766E] dark:text-[#2DD4BF] shrink-0">
                  <Layers className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold leading-snug">
                    Add a new field to an existing farm
                  </div>
                  <p className={`text-xs mt-0.5 leading-snug ${subtextCls}`}>
                    Pick one of your saved farms below.
                  </p>
                </div>
              </div>
              {intent === 'new_field_existing_farm' && (
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF] shrink-0" />
              )}
            </div>
          </button>
        </div>

        {/* Custom Farm Dropdown when adding a field to an existing farm */}
        {intent === 'new_field_existing_farm' && (
          <div className="fs-qst-subpanel rounded-[22px] p-4 sm:p-5 space-y-2.5">
            <label className={`block text-xs font-bold uppercase tracking-wider ${subtextCls}`}>
              Select farm *
            </label>

            {savedFarms.length === 0 ? (
              <div className={`text-xs leading-relaxed py-2 ${subtextCls}`}>
                No existing farms are saved yet. Select <strong>Add a new farm</strong> above to create your first farm.
              </div>
            ) : (
              <div ref={farmDropdownRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={farmDropdownOpen}
                  onClick={() => setFarmDropdownOpen((v) => !v)}
                  className={`fs-qst-option w-full !rounded-[16px] px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer ${
                    isLight ? 'text-[#072622]' : 'text-[#ECF8F5]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Building2 className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {selectedFarm ? selectedFarm.name : 'Select an existing farm...'}
                      </div>
                      <div className={`text-[11.5px] truncate tabular-nums ${subtextCls}`}>
                        {selectedFarm
                          ? selectedFarm.locationLabel || 'Saved farm location'
                          : `${savedFarms.length} saved farm${savedFarms.length === 1 ? '' : 's'} available`}
                      </div>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                      farmDropdownOpen ? 'rotate-180' : ''
                    } ${isLight ? 'text-[#0F766E]' : 'text-[#5EEAD4]'}`}
                  />
                </button>

                {farmDropdownOpen && (
                  <div
                    role="listbox"
                    aria-label="Select existing farm"
                    className="fs-qst-panel absolute left-0 right-0 top-[calc(100%+8px)] z-50 !rounded-[22px] p-2 space-y-1 shadow-2xl"
                  >
                    <div
                      className={`px-3 py-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider ${
                        isLight ? 'text-[#0F766E]' : 'text-[#5EEAD4]'
                      }`}
                    >
                      <span className="tabular-nums">Select Farm ({savedFarms.length})</span>
                      <span className="font-normal normal-case opacity-80">Saved portfolio</span>
                    </div>

                    <div className="max-h-[240px] overflow-y-auto space-y-1 fs-thin-scroll pr-0.5">
                      {savedFarms.map((farm) => {
                        const isSelected = selectedFarm?.id === farm.id;
                        const fieldCount = savedFields.filter((fld) => fld.farmId === farm.id).length;
                        return (
                          <button
                            key={farm.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              onChooseExistingFarmForNewField?.(farm);
                              setFarmDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-2xl text-left transition-colors cursor-pointer ${
                              isSelected
                                ? isLight
                                  ? 'bg-[#0F766E]/18 text-[#072622]'
                                  : 'bg-[#2DD4BF]/20 text-white'
                                : isLight
                                  ? 'text-[#1B4D46] hover:bg-white/60'
                                  : 'text-[#C8E4DE] hover:bg-white/10'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[13.5px] font-semibold truncate">
                                  {farm.name || 'Unnamed Farm'}
                                </span>
                                <span
                                  className={`text-[10.5px] font-mono tabular-nums shrink-0 px-1.5 py-0.5 rounded-md ${
                                    isLight
                                      ? 'bg-[#0F766E]/12 text-[#0F766E]'
                                      : 'bg-white/10 text-[#99F6E4]'
                                  }`}
                                >
                                  {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
                                </span>
                              </div>
                              <div
                                className={`text-[11.5px] truncate mt-0.5 flex items-center gap-1 ${
                                  isLight ? 'text-[#1B4D46]/80' : 'text-[#9AC7BE]'
                                }`}
                              >
                                <MapPin className="w-3 h-3 shrink-0 opacity-75" />
                                <span className="truncate">
                                  {farm.locationLabel || 'Location pending'}
                                </span>
                              </div>
                            </div>
                            {isSelected && (
                              <Check
                                className={`w-4 h-4 shrink-0 ${
                                  isLight ? 'text-[#0F766E]' : 'text-[#2DD4BF]'
                                }`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // SIMPLE_2: Conditional Farm Name (new farm) OR Field Name (new field on existing farm) + Confirmed Location Pin
  if (question.controlType === 'simple_name_location' || question.controlType === 'simple_field_location') {
    const q01 =
      getAnswerValue<{ mode?: string; farmId?: string; farmName?: string; description?: string }>(
        draft,
        'Q01'
      ) || {};
    const q03 = getAnswerValue<string>(draft, 'Q03') || '';
    const isAddingFieldToExisting =
      draft.setupIntent === 'new_field_existing_farm' && q01.mode === 'existing';
    const parentFarm = isAddingFieldToExisting
      ? savedFarms.find((f) => f.id === (q01.farmId || draft.farmId)) ?? null
      : null;

    return (
      <div className="space-y-5">
        {isAddingFieldToExisting ? (
          <div className="space-y-3">
            <div className="fs-qst-subpanel rounded-[18px] px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Building2 className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF] shrink-0" />
                <div className="min-w-0">
                  <div className={`text-[10.5px] font-bold uppercase tracking-wider ${subtextCls}`}>
                    Parent Farm
                  </div>
                  <div className="text-sm font-semibold truncate">
                    {q01.farmName || parentFarm?.name || 'Existing Farm'}
                  </div>
                </div>
              </div>
              {parentFarm?.locationLabel && (
                <span className={`text-xs truncate max-w-[260px] ${subtextCls}`}>
                  {parentFarm.locationLabel}
                </span>
              )}
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${labelCls}`}>
                New field name *
              </label>
              <input
                type="text"
                value={q03 === 'Primary Field' ? '' : q03}
                onChange={(e) =>
                  onSaveAnswer('Q03', e.target.value, {
                    scope: 'field',
                    sourceType: 'farmer_reported',
                  })
                }
                placeholder="e.g., North Creek Block"
                className={inputCls}
              />
            </div>
          </div>
        ) : (
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${labelCls}`}>
              Farm name *
            </label>
            <input
              type="text"
              value={newFarmName}
              onChange={(e) => {
                const name = e.target.value;
                setNewFarmName(name);
                onSaveAnswer(
                  'Q01',
                  {
                    mode: 'new',
                    farmId: draft.farmId,
                    farmName: name,
                    description: newFarmNote.trim(),
                  },
                  { scope: 'farm', sourceType: 'farmer_reported' }
                );
              }}
              placeholder="e.g., Green Valley Farm"
              className={inputCls}
            />
            <p className={`text-[11.5px] mt-1 ${subtextCls}`}>
              Includes 1 primary field.
            </p>
          </div>
        )}

        {/* Confirmed Location Pin */}
        <div className="space-y-2">
          <div className={`text-xs font-semibold uppercase tracking-wider ${subtextCls}`}>
            {isAddingFieldToExisting ? 'Field location *' : 'Farm location *'}
          </div>
          <QuestionLocationPicker
            location={draft.location}
            savedFarms={savedFarms}
            isLight={isLight}
            suggestedCenter={
              parentFarm?.centroid && Number.isFinite(parentFarm.centroid.lat)
                ? {
                    lat: parentFarm.centroid.lat,
                    lon: parentFarm.centroid.lon,
                    label: parentFarm.name,
                  }
                : null
            }
            onConfirmLocation={onConfirmLocation}
          />
        </div>

        {/* Optional Boundary Polygon Drawer */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowSimpleBoundary((v) => !v)}
            className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
          >
            {showSimpleBoundary
              ? '− Hide boundary map'
              : '+ Draw boundary map (optional)'}
          </button>
          {showSimpleBoundary && (
            <div className="mt-3">
              <QuestionBoundaryPicker
                fieldId={draft.fieldId}
                location={draft.location}
                geometry={draft.geometry}
                isLight={isLight}
                onSaveGeometry={onUpdateGeometry}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // SIMPLE_2: Up to 3 Recent Growing Seasons + Distinct Fallow / Cover Crop Toggle
  if (question.controlType === 'simple_recent_crops') {
    const curQ25 = (draft.answers['Q25']?.value as {
      mode?: string;
      records?: CropHistorySeasonRecord[];
    }) || { mode: 'records', records: [] };
    const records = Array.isArray(curQ25.records) ? curQ25.records.slice(0, 3) : [];
    const curQ26 = (draft.answers['Q26']?.value as {
      status?: string;
      coverCropName?: string;
    }) || { status: 'none' };
    const currentYear = new Date().getFullYear();

    const saveHist = (mode: string, recs: CropHistorySeasonRecord[]) => {
      onSaveAnswer(
        'Q25',
        { mode, records: recs.slice(0, 3) },
        {
          scope: 'season_occurrence',
          sourceType: mode === 'dont_remember' ? 'unknown' : 'farmer_reported',
        }
      );
    };

    const addSeason = () => {
      if (records.length >= 3) return;
      const defaultCrop = AGRICULTURAL_CROP_CATALOG[0];
      const next: CropHistorySeasonRecord[] = [
        ...records,
        {
          id: `hist_${Date.now()}_${records.length}`,
          cropId: defaultCrop?.id || 'wheat',
          cropName: defaultCrop?.name || 'Wheat',
          botanicalFamily: defaultCrop?.category || 'Cereals and grains',
          seasonYear: currentYear - records.length,
          seasonLabel: 'Main Season',
          status: 'harvested',
          areaSharePct: 100,
          sourceType: 'farmer_reported',
        },
      ];
      saveHist('records', next);
    };

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {[
            { mode: 'records', label: 'Recent seasons (up to 3)' },
            { mode: 'new_field', label: 'New field / no prior crop' },
            { mode: 'dont_remember', label: 'Not sure' },
          ].map((btn) => (
            <button
              key={btn.mode}
              type="button"
              onClick={() => saveHist(btn.mode, btn.mode === 'records' ? records : [])}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold border cursor-pointer ${getOptionCardClass(
                curQ25.mode === btn.mode,
                isLight
              )}`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {(curQ25.mode === 'records' || !curQ25.mode) && (
          <div className="space-y-2.5">
            {records.map((rec, idx) => (
              <div
                key={rec.id}
                className="fs-qst-subpanel rounded-[16px] p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
              >
                <div className="sm:col-span-5">
                  <select
                    value={rec.cropId}
                    onChange={(e) => {
                      const crop = AGRICULTURAL_CROP_CATALOG.find((c) => c.id === e.target.value);
                      const next = records.map((r, i) =>
                        i === idx
                          ? {
                              ...r,
                              cropId: e.target.value,
                              cropName: crop?.name || e.target.value,
                              botanicalFamily: crop?.category || 'Other',
                            }
                          : r
                      );
                      saveHist('records', next);
                    }}
                    className={inputCls}
                  >
                    {AGRICULTURAL_CROP_CATALOG.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <select
                    value={rec.seasonLabel}
                    onChange={(e) => {
                      const next = records.map((r, i) =>
                        i === idx ? { ...r, seasonLabel: e.target.value } : r
                      );
                      saveHist('records', next);
                    }}
                    className={inputCls}
                  >
                    <option value="Spring">Spring</option>
                    <option value="Summer">Summer</option>
                    <option value="Autumn">Autumn</option>
                    <option value="Winter">Winter</option>
                    <option value="Main Season">Main Season</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="number"
                    min="1990"
                    max={currentYear + 1}
                    value={rec.seasonYear}
                    onChange={(e) => {
                      const next = records.map((r, i) =>
                        i === idx ? { ...r, seasonYear: Number(e.target.value) || currentYear } : r
                      );
                      saveHist('records', next);
                    }}
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      saveHist(
                        'records',
                        records.filter((_, i) => i !== idx)
                      )
                    }
                    className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-full cursor-pointer"
                    aria-label="Remove season"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {records.length < 3 && (
              <button
                type="button"
                onClick={addSeason}
                className="fs-qst-subpanel inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add season crop ({records.length}/3)
              </button>
            )}
          </div>
        )}

        {/* Explicitly separate Fallow vs Cover Crop selector (Q26) */}
        <div className="pt-3 border-t border-current/10 space-y-2.5">
          <div className={`text-xs font-semibold ${labelCls}`}>
            Any recent fallow or cover crop?
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { id: 'none', label: 'No — cash crops only' },
              { id: 'fallow', label: 'Fallow (unplanted)' },
              { id: 'cover_crop', label: 'Cover crop' },
              { id: 'both', label: 'Both' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  onSaveAnswer(
                    'Q26',
                    { ...curQ26, status: opt.id },
                    { scope: 'season_occurrence', sourceType: 'farmer_reported' }
                  )
                }
                className={`px-3.5 py-2.5 rounded-[14px] text-xs font-semibold border text-left cursor-pointer ${getOptionCardClass(
                  curQ26.status === opt.id,
                  isLight
                )}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {(curQ26.status === 'cover_crop' || curQ26.status === 'both') && (
            <input
              type="text"
              value={curQ26.coverCropName || ''}
              onChange={(e) =>
                onSaveAnswer(
                  'Q26',
                  { ...curQ26, coverCropName: e.target.value },
                  { scope: 'season_occurrence', sourceType: 'farmer_reported' }
                )
              }
              placeholder="Cover crop name (optional)"
              className={inputCls}
            />
          )}
        </div>
      </div>
    );
  }

  // SIMPLE_4: Water Access (Q17) + At Most One Conditional Reliability Follow-Up (Q20)
  if (question.controlType === 'simple_water') {
    const q17Ans = draft.answers['Q17'];
    const q17Val =
      q17Ans?.sourceType === 'unknown'
        ? 'unknown'
        : typeof q17Ans?.value === 'string'
          ? q17Ans.value
          : '';
    const q20Ans = draft.answers['Q20'];
    const q20Val =
      q20Ans?.sourceType === 'unknown'
        ? 'unknown'
        : typeof q20Ans?.value === 'string'
          ? q20Ans.value
          : '';

    const isIrrigated = q17Val === 'irrigation_only' || q17Val === 'both';

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            {
              value: 'rainfall_only',
              label: 'Rain-fed',
              desc: 'Rainfall only.',
            },
            {
              value: 'irrigation_only',
              label: 'Irrigated',
              desc: 'Managed irrigation.',
            },
            {
              value: 'both',
              label: 'Both',
              desc: 'Rain + irrigation.',
            },
            {
              value: 'unknown',
              label: 'Not sure',
              desc: 'Skip for now.',
            },
          ].map((opt) => {
            const selected = q17Val === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onSaveAnswer('Q17', opt.value === 'unknown' ? '__unknown__' : opt.value, {
                    scope: 'field',
                    sourceType: opt.value === 'unknown' ? 'unknown' : 'farmer_reported',
                  })
                }
                className={`${CARD_BTN_BASE} ${getOptionCardClass(selected, isLight)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <p className={`text-[11px] mt-0.5 leading-snug ${subtextCls}`}>
                      {opt.desc}
                    </p>
                  </div>
                  {selected && (
                    <Check className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF] shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Single Material Reliability Follow-Up (only when Irrigated or Both) */}
        {isIrrigated && (
          <div className="pt-4 border-t border-current/10 space-y-2.5">
            <div className={`text-sm font-semibold ${labelCls}`}>
              How reliable is your irrigation? <span className={`text-xs font-normal ${subtextCls}`}>(optional)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { value: 'reliable', label: 'Reliable' },
                { value: 'restricted_dry', label: 'Limited in dry periods' },
                { value: 'highly_variable', label: 'Variable / rationed' },
                { value: 'unknown', label: 'Not sure' },
              ].map((opt) => {
                const selected = q20Val === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      onSaveAnswer('Q20', opt.value === 'unknown' ? '__unknown__' : opt.value, {
                        scope: 'field',
                        sourceType: opt.value === 'unknown' ? 'unknown' : 'farmer_reported',
                      })
                    }
                    className={`px-3.5 py-2.5 rounded-[14px] text-xs font-semibold border text-left cursor-pointer ${getOptionCardClass(
                      selected,
                      isLight
                    )}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Q00: Create vs Edit mode
  if (question.controlType === 'mode_select') {
    const currentMode = (typeof val === 'string' ? val : draft.mode) as 'create' | 'edit';
    return (
      <div className="space-y-3">
        {(question.options || []).map((opt) => {
          const selected = currentMode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelectMode(opt.value as 'create' | 'edit')}
              className={`${CARD_BTN_BASE} ${getOptionCardClass(selected, isLight)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold">{opt.label}</div>
                  {opt.description && (
                    <p className={`text-xs mt-1 leading-relaxed ${subtextCls}`}>
                      {opt.description}
                    </p>
                  )}
                </div>
                <span
                  className={`w-5 h-5 rounded-full border grid place-items-center shrink-0 mt-0.5 ${
                    selected
                      ? isLight
                        ? 'bg-[#0F766E] border-[#0F766E] text-white'
                        : 'bg-[#2DD4BF] border-[#2DD4BF] text-[#031F1C]'
                      : 'border-current/35'
                  }`}
                >
                  {selected && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // Q01: Farm selection or creation
  if (question.controlType === 'farm_select') {
    const q01 = (val as { mode?: string; farmId?: string; farmName?: string; description?: string }) || {};
    return (
      <div className="space-y-4">
        {savedFarms.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold uppercase tracking-wider ${subtextCls}`}>
                Existing farms in portfolio
              </span>
              <button
                type="button"
                onClick={() => setShowNewFarmForm((v) => !v)}
                className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
              >
                {showNewFarmForm ? 'Hide new farm form' : '+ Create a brand-new farm'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
              {savedFarms.map((farm) => {
                const selected = q01.mode === 'existing' && q01.farmId === farm.id;
                return (
                  <button
                    key={farm.id}
                    type="button"
                    onClick={() => {
                      setShowNewFarmForm(false);
                      onSelectExistingFarm(farm);
                    }}
                    className={`${CARD_BTN_BASE} ${getOptionCardClass(selected, isLight)}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{farm.name}</div>
                        <div className={`text-[11px] mt-0.5 truncate ${subtextCls}`}>
                          {farm.locationLabel ||
                            (farm.centroid
                              ? `${farm.centroid.lat.toFixed(2)}°, ${farm.centroid.lon.toFixed(2)}°`
                              : 'Coordinates pending')}
                        </div>
                      </div>
                      {selected && (
                        <Check className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF] shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {(showNewFarmForm || savedFarms.length === 0) && (
          <div
            className="fs-qst-subpanel rounded-[20px] p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
              <Sprout className="w-3.5 h-3.5" />
              <span>New Farm Identity</span>
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${labelCls}`}>
                Farm name *
              </label>
              <input
                type="text"
                value={newFarmName}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewFarmName(name);
                  onSaveAnswer(
                    'Q01',
                    {
                      mode: 'new',
                      farmId: draft.farmId,
                      farmName: name.trim(),
                      description: newFarmNote.trim(),
                    },
                    { scope: 'farm', sourceType: 'farmer_reported' }
                  );
                }}
                placeholder="e.g., Green Valley Estate"
                className={inputCls}
              />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${labelCls}`}>
                Short note (optional)
              </label>
              <input
                type="text"
                value={newFarmNote}
                onChange={(e) => {
                  const note = e.target.value;
                  setNewFarmNote(note);
                  onSaveAnswer(
                    'Q01',
                    {
                      mode: 'new',
                      farmId: draft.farmId,
                      farmName: newFarmName.trim() || 'New Farm',
                      description: note.trim(),
                    },
                    { scope: 'farm', sourceType: 'farmer_reported' }
                  );
                }}
                placeholder="e.g., Family irrigated blocks near river bench"
                className={inputCls}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Q02: Field selection
  if (question.controlType === 'field_select') {
    const q01 = getAnswerValue<{ mode?: string; farmId?: string }>(draft, 'Q01');
    const q02 = (val as { mode?: string; fieldId?: string; fieldName?: string }) || {};
    const farmFields = savedFields.filter((f) => f.farmId === (q01?.farmId || draft.farmId));

    return (
      <div className="space-y-3">
        {farmFields.map((field) => {
          const selected = q02.mode === 'existing' && q02.fieldId === field.id;
          const activeVer =
            field.versions.find((v) => v.geometryVersionId === field.currentVersionId) ??
            field.versions[0];
          const fieldAreaHa = activeVer?.netAreaHectares;
          return (
            <button
              key={field.id}
              type="button"
              onClick={() => onSelectExistingField(field)}
              className={`${CARD_BTN_BASE} ${getOptionCardClass(selected, isLight)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{field.name}</div>
                  <div className={`text-xs mt-0.5 ${subtextCls}`}>
                    {fieldAreaHa ? `${fieldAreaHa.toFixed(2)} ha` : 'Area unrecorded'} ·{' '}
                    {field.cropName || 'No active crop logged'}
                  </div>
                </div>
                {selected && <Check className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />}
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onSelectExistingField('new')}
          className={`${CARD_BTN_BASE} ${getOptionCardClass(q02.mode === 'new', isLight)}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Add a new field on this farm</div>
              <div className={`text-xs mt-0.5 ${subtextCls}`}>
                Create a dedicated field block with its own soil, water, and rotation plan.
              </div>
            </div>
            <Plus className="w-4 h-4 shrink-0" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelectExistingField('whole_farm')}
          className={`${CARD_BTN_BASE} ${getOptionCardClass(q02.mode === 'whole_farm', isLight)}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Treat whole farm as one managed area</div>
              <div className={`text-xs mt-0.5 ${subtextCls}`}>
                Assign one primary field block covering the single managed parcel.
              </div>
            </div>
            <Layers className="w-4 h-4 shrink-0" />
          </div>
        </button>
      </div>
    );
  }

  // Q03: Short text (Field name with trim & duplicate guard)
  if (question.controlType === 'short_text') {
    const q01 = getAnswerValue<{ farmId?: string }>(draft, 'Q01');
    const textVal = typeof val === 'string' ? val : '';
    const duplicate = savedFields.some(
      (f) =>
        f.farmId === (q01?.farmId || draft.farmId) &&
        f.id !== draft.fieldId &&
        f.name.trim().toLowerCase() === textVal.trim().toLowerCase() &&
        textVal.trim().length > 0
    );
    return (
      <div className="space-y-3">
        <label className={`block text-xs font-medium ${labelCls}`}>Field / plot name</label>
        <input
          type="text"
          value={textVal}
          onChange={(e) =>
            onSaveAnswer(question.id, e.target.value, {
              scope: 'field',
              sourceType: 'farmer_reported',
            })
          }
          placeholder="e.g., North Field, Lower Terrace, Plot B"
          className={inputCls}
        />
        {duplicate && (
          <div className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-xs bg-amber-500/15 border border-amber-500/35 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Another field on this farm already has that name. Consider adding a block number.</span>
          </div>
        )}
      </div>
    );
  }

  // Q05: Location Picker
  if (question.controlType === 'location_picker') {
    return (
      <QuestionLocationPicker
        location={draft.location}
        savedFarms={savedFarms}
        isLight={isLight}
        onConfirmLocation={onConfirmLocation}
      />
    );
  }

  // Q06: Boundary Polygon Drawer
  if (question.controlType === 'boundary_polygon') {
    return (
      <QuestionBoundaryPicker
        fieldId={draft.fieldId}
        location={draft.location}
        geometry={draft.geometry}
        isLight={isLight}
        onSaveGeometry={onUpdateGeometry}
      />
    );
  }

  // Q07: Area + unit (never overwrites polygon silently)
  if (question.controlType === 'area_unit') {
    const cur = (val as { status?: string; value?: number | null; unit?: 'hectares' | 'acres' | 'm2' }) || {
      status: 'known',
      value: null,
      unit: 'hectares',
    };
    const polyHa = draft.geometry.geometryStatus === 'polygon_verified' ? draft.geometry.geodesicAreaHa : null;
    const converted =
      cur.status === 'known' && typeof cur.value === 'number' && cur.value > 0
        ? areaToHectares(cur.value, cur.unit || 'hectares')
        : null;

    return (
      <div className="space-y-4">
        {polyHa !== null && (
          <div
            className={`rounded-[16px] px-4 py-3 border flex flex-wrap items-center justify-between gap-2 ${
              isLight
                ? 'bg-[#14B89A]/12 border-[#0F766E]/35 text-[#062B25]'
                : 'bg-[#14B89A]/12 border-[#2DD4BF]/35 text-[#DCF6F0]'
            }`}
          >
            <div className="text-xs">
              <span className="font-semibold">Calculated from boundary polygon:</span>{' '}
              <span>{polyHa.toFixed(2)} ha geodesic (suggestion only)</span>
            </div>
            <button
              type="button"
              onClick={() =>
                onSaveAnswer(
                  'Q07',
                  { status: 'known', value: Number(polyHa.toFixed(2)), unit: 'hectares' },
                  { unit: 'hectares', scope: 'field', sourceType: 'farmer_confirmed' }
                )
              }
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#14B89A] text-[#031F1C] hover:brightness-110 cursor-pointer"
            >
              Use polygon area
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={`block text-xs font-medium mb-1.5 ${labelCls}`}>Area value</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cur.status === 'known' && cur.value !== null && cur.value !== undefined ? cur.value : ''}
              onChange={(e) => {
                const n = e.target.value === '' ? null : Number(e.target.value);
                onSaveAnswer(
                  'Q07',
                  { status: 'known', value: n, unit: cur.unit || 'hectares' },
                  { unit: cur.unit || 'hectares', scope: 'field', sourceType: 'farmer_reported' }
                );
              }}
              placeholder="e.g., 12.5"
              className={inputCls}
            />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${labelCls}`}>Unit</label>
            <select
              value={cur.unit || 'hectares'}
              onChange={(e) => {
                const unit = e.target.value as 'hectares' | 'acres' | 'm2';
                onSaveAnswer(
                  'Q07',
                  { status: 'known', value: cur.value ?? null, unit },
                  { unit, scope: 'field', sourceType: 'farmer_reported' }
                );
              }}
              className={inputCls}
            >
              <option value="hectares">Hectares (ha)</option>
              <option value="acres">Acres (ac)</option>
              <option value="m2">Square metres (m²)</option>
            </select>
          </div>
        </div>

        {converted && (
          <div className={`text-xs ${subtextCls}`}>
            Normalized canonical value:{' '}
            <strong className={labelCls}>{converted.hectares.toFixed(3)} ha</strong>{' '}
            ({Math.round(converted.hectares * 10000).toLocaleString()} m²)
          </div>
        )}
      </div>
    );
  }

  // Q08: Timezone select
  if (question.controlType === 'timezone_select') {
    const resolvedTz =
      (typeof val === 'string' && val) || draft.location?.timezone || 'UTC';
    return (
      <div className="space-y-3">
        <div
          className={`rounded-[16px] px-4 py-3 border ${
            isLight
              ? 'bg-[#14B89A]/12 border-[#0F766E]/35 text-[#062B25]'
              : 'bg-[#14B89A]/12 border-[#2DD4BF]/35 text-[#DCF6F0]'
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
            Active Field Timezone
          </div>
          <div className="text-base font-bold mt-0.5">{resolvedTz}</div>
          <div className={`text-xs mt-1 ${subtextCls}`}>
            Resolved from confirmed coordinates ({draft.location?.placeLabel || 'Pending location'}). Confirm or search below.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
            <input
              type="text"
              value={tzFilter}
              onChange={(e) => setTzFilter(e.target.value)}
              placeholder="Search IANA timezone (e.g. America/Chicago, Europe/Madrid)..."
              className={`${inputCls} pl-9`}
            />
          </div>
          <button
            type="button"
            onClick={() => onUpdateTimezone(resolvedTz)}
            className="px-4 py-2.5 rounded-[14px] text-xs font-semibold bg-[#14B89A] text-[#031F1C] hover:brightness-110 cursor-pointer shrink-0"
          >
            Confirm {resolvedTz.split('/').pop()?.replace('_', ' ')}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
          {filteredTimezones.map((tz) => {
            const selected = resolvedTz === tz;
            return (
              <button
                key={tz}
                type="button"
                onClick={() => onUpdateTimezone(tz)}
                className={`text-left px-3 py-2 rounded-[12px] text-xs font-medium border transition-colors cursor-pointer ${getOptionCardClass(
                  selected,
                  isLight
                )}`}
              >
                {tz}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Q09: Soil texture feel-guide
  if (question.controlType === 'soil_texture') {
    const selectedVal = typeof val === 'string' ? val : '';
    const otherText = existingAns?.notes || '';
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(question.options || []).map((opt) => {
            const selected = selectedVal === opt.value && existingAns?.sourceType !== 'unknown';
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onSaveAnswer('Q09', opt.value, {
                    scope: 'field',
                    sourceType: 'farmer_reported',
                    notes: opt.value === 'other' ? otherText : undefined,
                  })
                }
                className={`${CARD_BTN_BASE} ${getOptionCardClass(selected, isLight)}`}
              >
                <div className="text-sm font-semibold">{opt.label}</div>
                {opt.description && (
                  <p className={`text-[11px] mt-1 leading-snug ${subtextCls}`}>
                    {opt.description}
                  </p>
                )}
              </button>
            );
          })}
        </div>
        {selectedVal === 'other' && (
          <input
            type="text"
            value={otherText}
            onChange={(e) =>
              onSaveAnswer('Q09', 'other', {
                scope: 'field',
                sourceType: 'farmer_reported',
                notes: e.target.value,
              })
            }
            placeholder="Describe soil texture (e.g., peat loam, gravelly chalk)..."
            className={inputCls}
          />
        )}
      </div>
    );
  }

  // Generic single_select (Q04, Q10, Q15, Q17, Q19, Q20, Q39, Q41)
  if (question.controlType === 'single_select') {
    const selectedVal = typeof val === 'string' ? val : '';
    const otherNote = existingAns?.notes || '';
    return (
      <div className="space-y-2.5">
        {(question.options || []).map((opt) => {
          const selected =
            selectedVal === opt.value && existingAns?.sourceType !== 'unknown';
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                onSaveAnswer(question.id, opt.value, {
                  scope: 'field',
                  sourceType: 'farmer_reported',
                  notes: opt.value === 'other' ? otherNote : undefined,
                })
              }
              className={`${CARD_BTN_BASE} ${getOptionCardClass(selected, isLight)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold">{opt.label}</div>
                  {opt.description && (
                    <p className={`text-xs mt-0.5 leading-relaxed ${subtextCls}`}>
                      {opt.description}
                    </p>
                  )}
                </div>
                <span
                  className={`w-5 h-5 rounded-full border grid place-items-center shrink-0 mt-0.5 ${
                    selected
                      ? isLight
                        ? 'bg-[#0F766E] border-[#0F766E] text-white'
                        : 'bg-[#2DD4BF] border-[#2DD4BF] text-[#031F1C]'
                      : 'border-current/35'
                  }`}
                >
                  {selected && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
              </div>
            </button>
          );
        })}

        {selectedVal === 'other' && (
          <input
            type="text"
            value={otherNote}
            onChange={(e) =>
              onSaveAnswer(question.id, 'other', {
                scope: 'field',
                sourceType: 'farmer_reported',
                notes: e.target.value,
              })
            }
            placeholder="Please specify..."
            className={inputCls}
          />
        )}

        {question.id === 'Q41' && (
          <div className="flex items-start gap-2 rounded-[14px] px-3.5 py-2.5 text-xs bg-sky-500/12 border border-sky-400/30 text-sky-900 dark:text-sky-200">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Honest scope notice: Crop price and input margin optimization is reserved for a verified market data release so unverified financial figures are never fabricated.
            </span>
          </div>
        )}
      </div>
    );
  }

  // Generic multi_select (Q18, Q34, Q36)
  if (question.controlType === 'multi_select') {
    const selectedArr = Array.isArray(val) ? (val as string[]) : [];
    const toggleItem = (itemVal: string) => {
      let next: string[];
      if (itemVal === 'none') {
        next = selectedArr.includes('none') ? [] : ['none'];
      } else {
        const filtered = selectedArr.filter((v) => v !== 'none');
        next = filtered.includes(itemVal)
          ? filtered.filter((v) => v !== itemVal)
          : [...filtered, itemVal];
      }
      onSaveAnswer(question.id, next, {
        scope: 'field',
        sourceType: 'farmer_reported',
      });
    };

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(question.options || []).map((opt) => {
            const selected = selectedArr.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleItem(opt.value)}
                className={`${CARD_BTN_BASE} ${getOptionCardClass(selected, isLight)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span
                    className={`w-4 h-4 rounded-[5px] border grid place-items-center shrink-0 ${
                      selected
                        ? isLight
                          ? 'bg-[#0F766E] border-[#0F766E] text-white'
                          : 'bg-[#2DD4BF] border-[#2DD4BF] text-[#031F1C]'
                        : 'border-current/35'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {selectedArr.includes('other') && (
          <input
            type="text"
            value={existingAns?.notes || ''}
            onChange={(e) =>
              onSaveAnswer(question.id, selectedArr, {
                scope: 'field',
                sourceType: 'farmer_reported',
                notes: e.target.value,
              })
            }
            placeholder="Describe other option..."
            className={inputCls}
          />
        )}
      </div>
    );
  }

  // Q11: Soil pH
  if (question.controlType === 'soil_ph') {
    const rec = (val as SoilPhRecord) || {
      status: 'measured',
      value: null,
      method: 'Water 1:1',
      sampleDate: '',
      depthValue: 15,
      depthUnit: 'cm',
      labRef: '',
    };
    const outOfRange = rec.value !== null && (rec.value < 2.5 || rec.value > 10.5);
    const update = (patch: Partial<SoilPhRecord>) => {
      const next = { ...rec, ...patch };
      onSaveAnswer('Q11', next, {
        unit: 'pH',
        scope: 'field',
        sourceType: next.status === 'measured' ? 'lab_result' : 'unknown',
        validTime: next.sampleDate || undefined,
        depth: next.depthValue ? `${next.depthValue} ${next.depthUnit}` : undefined,
      });
    };
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Measured pH (2.5 – 10.5)</label>
            <input
              type="number"
              step="0.1"
              min="2.5"
              max="10.5"
              value={rec.value ?? ''}
              onChange={(e) =>
                update({
                  status: e.target.value === '' ? 'not_measured' : 'measured',
                  value: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="e.g., 6.8"
              className={inputCls}
            />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Test method</label>
            <select
              value={rec.method}
              onChange={(e) => update({ method: e.target.value })}
              className={inputCls}
            >
              <option value="Water 1:1">Lab pH (1:1 Water)</option>
              <option value="CaCl2 0.01M">Lab pH (0.01M CaCl₂)</option>
              <option value="Saturated paste">Saturated Paste pH</option>
              <option value="Field probe">Calibrated Field Probe</option>
              <option value="Unknown">Unknown method</option>
            </select>
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Sample date</label>
            <input
              type="date"
              value={rec.sampleDate}
              onChange={(e) => update({ sampleDate: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Sample depth</label>
              <input
                type="number"
                min="1"
                value={rec.depthValue ?? ''}
                onChange={(e) =>
                  update({ depthValue: e.target.value === '' ? null : Number(e.target.value) })
                }
                placeholder="15"
                className={inputCls}
              />
            </div>
            <div className="w-24">
              <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Unit</label>
              <select
                value={rec.depthUnit}
                onChange={(e) => update({ depthUnit: e.target.value as 'cm' | 'in' })}
                className={inputCls}
              >
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
            </div>
          </div>
        </div>
        {outOfRange && (
          <div className="text-xs text-rose-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Soil pH should normally lie between 2.5 and 10.5.
          </div>
        )}
      </div>
    );
  }

  // Q12: Soil EC (Salinity)
  if (question.controlType === 'soil_ec') {
    const rec = (val as SoilEcRecord) || {
      status: 'measured',
      value: null,
      unit: 'dS/m',
      extractMethod: '1:5',
      sampleDate: '',
      depthValue: 15,
      depthUnit: 'cm',
    };
    const update = (patch: Partial<SoilEcRecord>) => {
      const next = { ...rec, ...patch };
      onSaveAnswer('Q12', next, {
        unit: next.unit,
        scope: 'field',
        sourceType: next.status === 'measured' ? 'lab_result' : 'unknown',
        validTime: next.sampleDate || undefined,
      });
    };
    const norm = rec.value !== null ? ecToDsM(rec.value, rec.unit) : null;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>EC Reading</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={rec.value ?? ''}
              onChange={(e) =>
                update({
                  status: e.target.value === '' ? 'not_measured' : 'measured',
                  value: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="e.g., 1.4"
              className={inputCls}
            />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Unit *</label>
            <select
              value={rec.unit}
              onChange={(e) => update({ unit: e.target.value as SoilEcRecord['unit'] })}
              className={inputCls}
            >
              <option value="dS/m">dS/m</option>
              <option value="mS/cm">mS/cm</option>
              <option value="uS/cm">µS/cm</option>
            </select>
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Extract Method *</label>
            <select
              value={rec.extractMethod}
              onChange={(e) =>
                update({ extractMethod: e.target.value as SoilEcRecord['extractMethod'] })
              }
              className={inputCls}
            >
              <option value="saturated_paste">Saturated Paste (ECe)</option>
              <option value="1:1">1:1 Soil-Water</option>
              <option value="1:2">1:2 Soil-Water</option>
              <option value="1:5">1:5 Soil-Water</option>
              <option value="probe">Direct Soil Probe</option>
              <option value="unknown">Method not listed</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Sample date</label>
            <input
              type="date"
              value={rec.sampleDate}
              onChange={(e) => update({ sampleDate: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Depth</label>
              <input
                type="number"
                value={rec.depthValue ?? ''}
                onChange={(e) =>
                  update({ depthValue: e.target.value === '' ? null : Number(e.target.value) })
                }
                className={inputCls}
              />
            </div>
            <div className="w-24">
              <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Unit</label>
              <select
                value={rec.depthUnit}
                onChange={(e) => update({ depthUnit: e.target.value as 'cm' | 'in' })}
                className={inputCls}
              >
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
            </div>
          </div>
        </div>
        {norm && (
          <div className={`text-xs ${subtextCls}`}>
            Normalized salinity: <strong className={labelCls}>{norm.dsPerM.toFixed(3)} dS/m</strong>{' '}
            ({rec.extractMethod} extract preserved in provenance).
          </div>
        )}
      </div>
    );
  }

  // Q13: Soil Organic Matter vs Organic Carbon
  if (question.controlType === 'soil_organic') {
    const rec = (val as SoilOrganicRecord) || {
      status: 'measured',
      kind: 'organic_matter',
      value: null,
      unit: '%',
      method: 'Loss on ignition',
      sampleDate: '',
      depthValue: 15,
      depthUnit: 'cm',
    };
    const update = (patch: Partial<SoilOrganicRecord>) => {
      const next = { ...rec, ...patch };
      onSaveAnswer('Q13', next, {
        unit: next.unit,
        scope: 'field',
        sourceType: next.status === 'measured' ? 'lab_result' : 'unknown',
        validTime: next.sampleDate || undefined,
      });
    };
    const norm = rec.value !== null ? normalizeSoilOrganic(rec) : null;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { id: 'organic_matter', label: 'Organic Matter (OM)', hint: 'Usually ~1.5% – 6%' },
            { id: 'organic_carbon', label: 'Organic Carbon (OC)', hint: 'Van Bemmelen ~1.724x lower than OM' },
          ].map((k) => {
            const selected = rec.kind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => update({ kind: k.id as SoilOrganicRecord['kind'] })}
                className={`${CARD_BTN_BASE} ${getOptionCardClass(selected, isLight)}`}
              >
                <div className="text-sm font-semibold">{k.label}</div>
                <div className={`text-[11px] mt-0.5 ${subtextCls}`}>{k.hint}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Measured Value</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={rec.value ?? ''}
              onChange={(e) =>
                update({
                  status: e.target.value === '' ? 'not_measured' : 'measured',
                  value: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="e.g., 2.8"
              className={inputCls}
            />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Unit</label>
            <select
              value={rec.unit}
              onChange={(e) => update({ unit: e.target.value as '%' | 'g/kg' })}
              className={inputCls}
            >
              <option value="%">%</option>
              <option value="g/kg">g/kg</option>
            </select>
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Sample date</label>
            <input
              type="date"
              value={rec.sampleDate}
              onChange={(e) => update({ sampleDate: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
        {norm && norm.organicMatterPct !== null && (
          <div className={`text-xs ${subtextCls}`}>
            Stored separately: <strong className={labelCls}>OM ≈ {norm.organicMatterPct.toFixed(2)}%</strong> ·{' '}
            <strong className={labelCls}>OC ≈ {norm.organicCarbonPct?.toFixed(2)}%</strong>
          </div>
        )}
      </div>
    );
  }

  // Q14: Soil Nutrients (N, P, K repeatable entries)
  if (question.controlType === 'soil_nutrients') {
    const list: NutrientTestEntry[] = Array.isArray(val) ? (val as NutrientTestEntry[]) : [];
    const addEntry = () => {
      const next: NutrientTestEntry[] = [
        ...list,
        {
          nutrient: 'P',
          form: 'Olsen P',
          value: null,
          unit: 'ppm',
          method: 'Olsen bicarbonate',
          sampleDate: '',
          depthValue: 15,
          depthUnit: 'cm',
        },
      ];
      onSaveAnswer('Q14', next, { scope: 'field', sourceType: 'lab_result' });
    };
    const updateIdx = (idx: number, patch: Partial<NutrientTestEntry>) => {
      const next = list.map((item, i) => (i === idx ? { ...item, ...patch } : item));
      onSaveAnswer('Q14', next, { scope: 'field', sourceType: 'lab_result' });
    };
    const removeIdx = (idx: number) => {
      const next = list.filter((_, i) => i !== idx);
      onSaveAnswer('Q14', next, { scope: 'field', sourceType: 'lab_result' });
    };

    return (
      <div className="space-y-3">
        {list.map((entry, idx) => (
          <div
            key={idx}
            className="fs-qst-subpanel rounded-[18px] p-3.5 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
                Nutrient Entry #{idx + 1}
              </span>
              <button
                type="button"
                onClick={() => removeIdx(idx)}
                className="text-xs text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select
                value={entry.nutrient}
                onChange={(e) => updateIdx(idx, { nutrient: e.target.value as NutrientTestEntry['nutrient'] })}
                className={inputCls}
              >
                <option value="N">Nitrogen (N)</option>
                <option value="P">Phosphorus (P)</option>
                <option value="K">Potassium (K)</option>
                <option value="Other">Other</option>
              </select>
              <input
                type="text"
                value={entry.form}
                onChange={(e) => updateIdx(idx, { form: e.target.value })}
                placeholder="Form (e.g. NO3-N, Olsen P)"
                className={inputCls}
              />
              <input
                type="number"
                value={entry.value ?? ''}
                onChange={(e) =>
                  updateIdx(idx, { value: e.target.value === '' ? null : Number(e.target.value) })
                }
                placeholder="Value"
                className={inputCls}
              />
              <select
                value={entry.unit}
                onChange={(e) => updateIdx(idx, { unit: e.target.value as NutrientTestEntry['unit'] })}
                className={inputCls}
              >
                <option value="ppm">ppm</option>
                <option value="mg/kg">mg/kg</option>
                <option value="kg/ha">kg/ha</option>
                <option value="lbs/ac">lbs/ac</option>
                <option value="%">%</option>
              </select>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addEntry}
          className="fs-qst-subpanel inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add nutrient test result
        </button>
      </div>
    );
  }

  // Q16: Soil Limitations with severity & scope
  if (question.controlType === 'soil_limitations') {
    const items: SoilLimitationItem[] = Array.isArray(val) ? (val as SoilLimitationItem[]) : [];
    const options: Array<{ code: SoilLimitationItem['code']; label: string }> = [
      { code: 'shallow_soil', label: 'Shallow soil / bedrock' },
      { code: 'hardpan_compaction', label: 'Hardpan / subsoil compaction' },
      { code: 'steep_slope', label: 'Steep slope' },
      { code: 'erosion_prone', label: 'Erosion-prone ground' },
      { code: 'rocky_stony', label: 'Rocky / stony soil' },
      { code: 'saline_patch', label: 'Known saline patch' },
      { code: 'low_lying_wet', label: 'Low-lying wet depression' },
    ];

    const toggle = (code: SoilLimitationItem['code']) => {
      const exists = items.find((i) => i.code === code);
      const next = exists
        ? items.filter((i) => i.code !== code)
        : [...items, { code, severity: 'moderate' as const, scope: 'whole_field' as const }];
      onSaveAnswer('Q16', next, { scope: 'field', sourceType: 'farmer_reported' });
    };

    const updateItem = (code: SoilLimitationItem['code'], patch: Partial<SoilLimitationItem>) => {
      const next = items.map((i) => (i.code === code ? { ...i, ...patch } : i));
      onSaveAnswer('Q16', next, { scope: 'field', sourceType: 'farmer_reported' });
    };

    return (
      <div className="space-y-2.5">
        {options.map((opt) => {
          const active = items.find((i) => i.code === opt.code);
          return (
            <div
              key={opt.code}
              className={`rounded-[16px] p-3 border transition-colors ${getOptionCardClass(
                Boolean(active),
                isLight
              )}`}
            >
              <button
                type="button"
                onClick={() => toggle(opt.code)}
                className="w-full flex items-center justify-between text-left cursor-pointer"
              >
                <span className="text-sm font-semibold">{opt.label}</span>
                <span
                  className={`w-4 h-4 rounded-[5px] border grid place-items-center ${
                    active
                      ? isLight
                        ? 'bg-[#0F766E] border-[#0F766E] text-white'
                        : 'bg-[#2DD4BF] border-[#2DD4BF] text-[#031F1C]'
                      : 'border-current/35'
                  }`}
                >
                  {active && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
              </button>
              {active && (
                <div className="mt-2.5 pt-2.5 border-t border-current/15 grid grid-cols-2 gap-2">
                  <select
                    value={active.severity}
                    onChange={(e) =>
                      updateItem(opt.code, {
                        severity: e.target.value as SoilLimitationItem['severity'],
                      })
                    }
                    className={inputCls}
                  >
                    <option value="mild">Severity: Mild</option>
                    <option value="moderate">Severity: Moderate</option>
                    <option value="severe">Severity: Severe</option>
                  </select>
                  <select
                    value={active.scope}
                    onChange={(e) =>
                      updateItem(opt.code, {
                        scope: e.target.value as SoilLimitationItem['scope'],
                      })
                    }
                    className={inputCls}
                  >
                    <option value="whole_field">Scope: Whole field</option>
                    <option value="specific_zone">Scope: Specific zone</option>
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Q21: Seasonal water limit
  if (question.controlType === 'water_limit') {
    const rec = (val as SeasonalWaterLimitRecord) || {
      status: 'no_fixed_limit',
      amount: null,
      unit: 'm3',
      period: 'per_season',
      scope: 'this_field',
    };
    const update = (patch: Partial<SeasonalWaterLimitRecord>) => {
      const next = { ...rec, ...patch };
      onSaveAnswer('Q21', next, {
        unit: next.unit,
        scope: next.scope === 'whole_farm' ? 'farm' : 'field',
        sourceType: next.status === 'unknown' ? 'unknown' : 'farmer_reported',
      });
    };
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            { id: 'yes_known', label: 'Yes — I know the volume/limit' },
            { id: 'yes_unknown_amount', label: 'Yes — limited, exact amount unknown' },
            { id: 'no_fixed_limit', label: 'No fixed seasonal cap' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => update({ status: opt.id as SeasonalWaterLimitRecord['status'] })}
              className={`${CARD_BTN_BASE} ${getOptionCardClass(rec.status === opt.id, isLight)}`}
            >
              <span className="text-sm font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>
        {rec.status === 'yes_known' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <input
              type="number"
              min="0"
              value={rec.amount ?? ''}
              onChange={(e) =>
                update({ amount: e.target.value === '' ? null : Number(e.target.value) })
              }
              placeholder="Amount"
              className={inputCls}
            />
            <select
              value={rec.unit}
              onChange={(e) => update({ unit: e.target.value as SeasonalWaterLimitRecord['unit'] })}
              className={inputCls}
            >
              <option value="m3">m³</option>
              <option value="L">Litres</option>
              <option value="mm">mm over field</option>
              <option value="hours_at_flow">Pump hours</option>
            </select>
            <select
              value={rec.period}
              onChange={(e) => update({ period: e.target.value as SeasonalWaterLimitRecord['period'] })}
              className={inputCls}
            >
              <option value="per_day">Per day</option>
              <option value="per_week">Per week</option>
              <option value="per_season">Per season</option>
              <option value="per_year">Per year</option>
            </select>
            <select
              value={rec.scope}
              onChange={(e) => update({ scope: e.target.value as SeasonalWaterLimitRecord['scope'] })}
              className={inputCls}
            >
              <option value="this_field">This field only</option>
              <option value="whole_farm">Shared across whole farm</option>
            </select>
          </div>
        )}
      </div>
    );
  }

  // Q22: Irrigation routine (badged Iroutine, distinct from actual events)
  if (question.controlType === 'irrigation_routine') {
    const today = new Date().toISOString().slice(0, 10);
    const rec = (val as IrrigationRoutineRecord) || {
      frequencyType: 'every_n_days',
      everyNDays: 5,
      preferredTimeOfDay: 'early_morning',
      naturalLanguageNote: '',
      effectiveDate: today,
      lastConfirmedDate: today,
      isRoutineOnly: true,
    };
    const update = (patch: Partial<IrrigationRoutineRecord>) => {
      const next: IrrigationRoutineRecord = { ...rec, ...patch, isRoutineOnly: true, lastConfirmedDate: today };
      onSaveAnswer('Q22', next, { scope: 'field', sourceType: 'farmer_reported' });
    };
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Schedule Pattern</label>
            <select
              value={rec.frequencyType}
              onChange={(e) =>
                update({ frequencyType: e.target.value as IrrigationRoutineRecord['frequencyType'] })
              }
              className={inputCls}
            >
              <option value="every_n_days">Every N days</option>
              <option value="weekly">Weekly</option>
              <option value="stage_dependent">Depends on crop stage / weather</option>
              <option value="only_when_needed">Only when needed</option>
            </select>
          </div>
          {rec.frequencyType === 'every_n_days' && (
            <div>
              <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Every how many days?</label>
              <input
                type="number"
                min="1"
                max="60"
                value={rec.everyNDays ?? ''}
                onChange={(e) =>
                  update({ everyNDays: e.target.value === '' ? null : Number(e.target.value) })
                }
                className={inputCls}
              />
            </div>
          )}
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Preferred time of day</label>
            <select
              value={rec.preferredTimeOfDay}
              onChange={(e) =>
                update({
                  preferredTimeOfDay: e.target.value as IrrigationRoutineRecord['preferredTimeOfDay'],
                })
              }
              className={inputCls}
            >
              <option value="early_morning">Early morning</option>
              <option value="evening">Evening</option>
              <option value="night">Night</option>
              <option value="midday">Midday</option>
              <option value="varies">Varies</option>
            </select>
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${labelCls}`}>Routine note (optional)</label>
            <input
              type="text"
              value={rec.naturalLanguageNote || ''}
              onChange={(e) => update({ naturalLanguageNote: e.target.value })}
              placeholder="e.g., Skip turns after >15 mm rain"
              className={inputCls}
            />
          </div>
        </div>
        <div className="text-[11px] flex items-center gap-1.5 opacity-80">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Stored as planned routine (Iroutine) — never treated as verified historical water applied.</span>
        </div>
      </div>
    );
  }

  // Q23: Irrigation amount per event
  if (question.controlType === 'irrigation_amount') {
    const rec = (val as IrrigationApplicationEstimate) || {
      status: 'known',
      mode: 'mm',
      value: null,
      flowRate: null,
      flowUnit: 'm3/h',
      durationHours: null,
    };
    const update = (patch: Partial<IrrigationApplicationEstimate>) => {
      const next = { ...rec, ...patch };
      onSaveAnswer('Q23', next, {
        unit: next.mode,
        scope: 'field',
        sourceType: next.status === 'not_measured' ? 'unknown' : 'farmer_reported',
      });
    };
    const fieldHa =
      draft.geometry.geodesicAreaHa ??
      (() => {
        const q07 = getAnswerValue<{ status?: string; value?: number | null; unit?: 'hectares' | 'acres' | 'm2' }>(
          draft,
          'Q07'
        );
        return q07?.status === 'known' && q07.value ? areaToHectares(q07.value, q07.unit || 'hectares').hectares : null;
      })();
    const mmCalc: { mm: number | null; note: string } = (() => {
      if (rec.status !== 'known') {
        return {
          mm: null,
          note:
            rec.status === 'varies'
              ? 'Application varies too much to estimate — water balance depth stays unavailable.'
              : 'Not measured.',
        };
      }
      if (rec.mode === 'flow_and_duration') {
        if (!rec.flowRate || !rec.durationHours) {
          return { mm: null, note: 'Enter flow rate and runtime hours to compute applied volume.' };
        }
        const m3PerHr =
          rec.flowUnit === 'L/s'
            ? rec.flowRate * 3.6
            : rec.flowUnit === 'L/min'
              ? rec.flowRate * 0.06
              : rec.flowUnit === 'gpm'
                ? rec.flowRate * 0.227124
                : rec.flowRate;
        const totalM3 = m3PerHr * rec.durationHours;
        return waterVolumeToMm(totalM3, 'm3', fieldHa);
      }
      if (rec.value === null || rec.value === undefined) {
        return { mm: null, note: 'Enter an amount above.' };
      }
      return waterVolumeToMm(rec.value, rec.mode === 'litres' ? 'L' : rec.mode, fieldHa);
    })();

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { mode: 'mm', label: 'Millimetres (mm)' },
            { mode: 'm3', label: 'Cubic metres (m³)' },
            { mode: 'litres', label: 'Litres (L)' },
            { mode: 'flow_and_duration', label: 'Flow rate × hours' },
          ].map((m) => (
            <button
              key={m.mode}
              type="button"
              onClick={() => update({ status: 'known', mode: m.mode as IrrigationApplicationEstimate['mode'] })}
              className={`${CARD_BTN_BASE} !py-2.5 text-xs font-semibold ${getOptionCardClass(
                rec.status === 'known' && rec.mode === m.mode,
                isLight
              )}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {rec.status === 'known' && rec.mode !== 'flow_and_duration' && (
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              step="0.1"
              value={rec.value ?? ''}
              onChange={(e) =>
                update({ value: e.target.value === '' ? null : Number(e.target.value) })
              }
              placeholder={`Enter ${rec.mode} applied per event`}
              className={inputCls}
            />
            <span className={`text-sm font-semibold shrink-0 ${labelCls}`}>{rec.mode}</span>
          </div>
        )}

        {rec.status === 'known' && rec.mode === 'flow_and_duration' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="number"
              min="0"
              value={rec.flowRate ?? ''}
              onChange={(e) =>
                update({ flowRate: e.target.value === '' ? null : Number(e.target.value) })
              }
              placeholder="Flow rate"
              className={inputCls}
            />
            <select
              value={rec.flowUnit || 'm3/h'}
              onChange={(e) => update({ flowUnit: e.target.value as IrrigationApplicationEstimate['flowUnit'] })}
              className={inputCls}
            >
              <option value="m3/h">m³/hour</option>
              <option value="L/s">Litres/sec</option>
              <option value="L/min">Litres/min</option>
              <option value="gpm">US gpm</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.25"
              value={rec.durationHours ?? ''}
              onChange={(e) =>
                update({ durationHours: e.target.value === '' ? null : Number(e.target.value) })
              }
              placeholder="Hours run"
              className={inputCls}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => update({ status: 'varies', value: null })}
          className={`px-3.5 py-2 rounded-full text-xs font-medium border cursor-pointer ${getOptionCardClass(
            rec.status === 'varies',
            isLight
          )}`}
        >
          Application amount varies too much to estimate
        </button>

        {mmCalc.mm !== null && (
          <div className={`text-xs ${subtextCls}`}>
            Computed field depth: <strong className={labelCls}>{mmCalc.mm.toFixed(1)} mm</strong> per irrigation.
          </div>
        )}
        {mmCalc.note && (
          <div className="text-xs text-amber-600 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{mmCalc.note}</span>
          </div>
        )}
      </div>
    );
  }

  // Q24: Water quality
  if (question.controlType === 'water_quality') {
    const rec = (val as WaterQualityRecord) || {
      status: 'no_known_issue',
      ecValue: null,
      ecUnit: 'dS/m',
      tdsPpm: null,
      testDate: '',
      method: '',
    };
    const update = (patch: Partial<WaterQualityRecord>) => {
      const next = { ...rec, ...patch };
      onSaveAnswer('Q24', next, {
        unit: next.ecValue !== null ? next.ecUnit : undefined,
        scope: 'field',
        sourceType: next.status === 'tested_with_lab_results' ? 'lab_result' : 'farmer_reported',
        validTime: next.testDate || undefined,
      });
    };
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            { id: 'no_known_issue', label: 'No known quality issue' },
            { id: 'some_salinity_concern', label: 'Some salinity concern' },
            { id: 'known_high_salinity', label: 'Known high salinity' },
            { id: 'tested_with_lab_results', label: 'I have water EC / TDS test results' },
            { id: 'other_quality_issue', label: 'Other quality issue (iron, boron, pH)' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => update({ status: opt.id as WaterQualityRecord['status'] })}
              className={`${CARD_BTN_BASE} ${getOptionCardClass(rec.status === opt.id, isLight)}`}
            >
              <span className="text-sm font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>

        {rec.status === 'tested_with_lab_results' && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <input
              type="number"
              step="0.01"
              value={rec.ecValue ?? ''}
              onChange={(e) =>
                update({ ecValue: e.target.value === '' ? null : Number(e.target.value) })
              }
              placeholder="EC value"
              className={inputCls}
            />
            <select
              value={rec.ecUnit}
              onChange={(e) => update({ ecUnit: e.target.value as WaterQualityRecord['ecUnit'] })}
              className={inputCls}
            >
              <option value="dS/m">dS/m</option>
              <option value="mS/cm">mS/cm</option>
              <option value="uS/cm">µS/cm</option>
            </select>
            <input
              type="number"
              value={rec.tdsPpm ?? ''}
              onChange={(e) =>
                update({ tdsPpm: e.target.value === '' ? null : Number(e.target.value) })
              }
              placeholder="TDS (ppm)"
              className={inputCls}
            />
            <input
              type="date"
              value={rec.testDate}
              onChange={(e) => update({ testDate: e.target.value })}
              className={inputCls}
            />
          </div>
        )}
      </div>
    );
  }

  // Q25: Crop history (up to 5 seasons + new field / don't remember)
  if (question.controlType === 'crop_history') {
    const cur = (val as { mode?: string; records?: CropHistorySeasonRecord[] }) || {
      mode: 'records',
      records: [],
    };
    const records = Array.isArray(cur.records) ? cur.records : [];
    const currentYear = new Date().getFullYear();

    const saveHist = (mode: string, recs: CropHistorySeasonRecord[]) => {
      onSaveAnswer(
        'Q25',
        { mode, records: recs },
        {
          scope: 'season_occurrence',
          sourceType: mode === 'dont_remember' ? 'unknown' : 'farmer_reported',
        }
      );
    };

    const addSeason = () => {
      if (records.length >= 5) return;
      const defaultCrop = AGRICULTURAL_CROP_CATALOG[0];
      const next: CropHistorySeasonRecord[] = [
        ...records,
        {
          id: `hist_${Date.now()}_${records.length}`,
          cropId: defaultCrop?.id || 'wheat',
          cropName: defaultCrop?.name || 'Wheat',
          botanicalFamily: defaultCrop?.category || 'Cereals and grains',
          seasonYear: currentYear - records.length,
          seasonLabel: 'Main Season',
          status: 'harvested',
          areaSharePct: 100,
          sourceType: 'farmer_reported',
        },
      ];
      saveHist('records', next);
    };

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[
            { mode: 'records', label: 'Add recent seasons (up to 5)' },
            { mode: 'new_field', label: 'Field is newly cleared / no prior crop' },
            { mode: 'dont_remember', label: 'I don’t remember' },
          ].map((btn) => (
            <button
              key={btn.mode}
              type="button"
              onClick={() => saveHist(btn.mode, btn.mode === 'records' ? records : [])}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold border cursor-pointer ${getOptionCardClass(
                cur.mode === btn.mode,
                isLight
              )}`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {(cur.mode === 'records' || !cur.mode) && (
          <div className="space-y-2.5">
            {records.map((rec, idx) => (
              <div
                key={rec.id}
                className="fs-qst-subpanel rounded-[16px] p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
              >
                <div className="sm:col-span-4">
                  <select
                    value={rec.cropId}
                    onChange={(e) => {
                      const crop = AGRICULTURAL_CROP_CATALOG.find((c) => c.id === e.target.value);
                      const next = records.map((r, i) =>
                        i === idx
                          ? {
                              ...r,
                              cropId: e.target.value,
                              cropName: crop?.name || e.target.value,
                              botanicalFamily: crop?.category || 'Other',
                            }
                          : r
                      );
                      saveHist('records', next);
                    }}
                    className={inputCls}
                  >
                    {AGRICULTURAL_CROP_CATALOG.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <select
                    value={rec.seasonLabel}
                    onChange={(e) => {
                      const next = records.map((r, i) =>
                        i === idx ? { ...r, seasonLabel: e.target.value } : r
                      );
                      saveHist('records', next);
                    }}
                    className={inputCls}
                  >
                    <option value="Spring">Spring</option>
                    <option value="Summer">Summer</option>
                    <option value="Autumn">Autumn</option>
                    <option value="Winter">Winter</option>
                    <option value="Main Season">Main Season</option>
                    <option value="Off-Season">Off-Season</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="number"
                    min="1990"
                    max={currentYear + 1}
                    value={rec.seasonYear}
                    onChange={(e) => {
                      const next = records.map((r, i) =>
                        i === idx ? { ...r, seasonYear: Number(e.target.value) || currentYear } : r
                      );
                      saveHist('records', next);
                    }}
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <select
                    value={rec.status}
                    onChange={(e) => {
                      const next = records.map((r, i) =>
                        i === idx
                          ? { ...r, status: e.target.value as CropHistorySeasonRecord['status'] }
                          : r
                      );
                      saveHist('records', next);
                    }}
                    className={inputCls}
                  >
                    <option value="harvested">Harvested</option>
                    <option value="planted">Planted</option>
                    <option value="failed">Failed</option>
                    <option value="abandoned">Abandoned</option>
                  </select>
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      saveHist(
                        'records',
                        records.filter((_, i) => i !== idx)
                      )
                    }
                    className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-full cursor-pointer"
                    aria-label="Remove season"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {records.length < 5 && (
              <button
                type="button"
                onClick={addSeason}
                className="fs-qst-subpanel inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add season crop ({records.length}/5)
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Q26: Fallow vs Cover Crop (explicitly kept separate!)
  if (question.controlType === 'fallow_cover') {
    const cur = (val as { status?: string; coverCropName?: string; seasonNote?: string }) || {};
    const update = (patch: Partial<typeof cur>) => {
      const next = { ...cur, ...patch };
      onSaveAnswer('Q26', next, { scope: 'season_occurrence', sourceType: 'farmer_reported' });
    };
    return (
      <div className="space-y-3">
        {[
          { id: 'none', label: 'No — continuous cash crops each season' },
          {
            id: 'fallow',
            label: 'Fallow period (unplanted soil / moisture rest)',
            desc: 'Stored strictly as bare or stubble fallow with minimal transpiration.',
          },
          {
            id: 'cover_crop',
            label: 'Cover crop (living soil-protecting / N-fixing cover)',
            desc: 'Stored separately as a living cover crop (e.g., clover, vetch, ryegrass).',
          },
          { id: 'both', label: 'Both fallow and cover crop in different seasons' },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => update({ status: opt.id })}
            className={`${CARD_BTN_BASE} ${getOptionCardClass(cur.status === opt.id, isLight)}`}
          >
            <div className="text-sm font-semibold">{opt.label}</div>
            {opt.desc && <div className={`text-xs mt-0.5 ${subtextCls}`}>{opt.desc}</div>}
          </button>
        ))}

        {(cur.status === 'cover_crop' || cur.status === 'both') && (
          <input
            type="text"
            value={cur.coverCropName || ''}
            onChange={(e) => update({ coverCropName: e.target.value })}
            placeholder="Cover crop species (e.g., Crimson clover, hairy vetch, oat-rye mix)"
            className={inputCls}
          />
        )}
      </div>
    );
  }

  // Q27: Current crop in ground right now
  if (question.controlType === 'current_crop') {
    const cur = (val as CurrentCropRecord) || { status: 'no' };
    const update = (patch: Partial<CurrentCropRecord>) => {
      const next: CurrentCropRecord = { ...cur, ...patch, confirmationSource: 'farmer_confirmed' };
      onSaveAnswer('Q27', next, { scope: 'field', sourceType: 'farmer_confirmed' });
    };
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            { id: 'no', label: 'No crop planted right now' },
            { id: 'yes', label: 'Yes — crop is currently growing' },
            { id: 'recently_harvested', label: 'Recently harvested' },
            { id: 'preparing', label: 'Preparing soil for next planting' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => update({ status: opt.id as CurrentCropRecord['status'] })}
              className={`${CARD_BTN_BASE} ${getOptionCardClass(cur.status === opt.id, isLight)}`}
            >
              <span className="text-sm font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>

        {cur.status === 'yes' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <select
              value={cur.cropId || ''}
              onChange={(e) => {
                const c = AGRICULTURAL_CROP_CATALOG.find((x) => x.id === e.target.value);
                update({ cropId: e.target.value, cropName: c?.name || e.target.value });
              }}
              className={inputCls}
            >
              <option value="">Select planted crop...</option>
              {AGRICULTURAL_CROP_CATALOG.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={cur.plantingDate || ''}
              onChange={(e) => update({ plantingDate: e.target.value })}
              className={inputCls}
            />
            <input
              type="text"
              value={cur.currentStage || ''}
              onChange={(e) => update({ currentStage: e.target.value, stageSource: 'farmer_observed' })}
              placeholder="Stage (e.g. Vegetative / Flowering)"
              className={inputCls}
            />
          </div>
        )}
      </div>
    );
  }

  // Q28: Recurring pests & diseases
  if (question.controlType === 'pest_disease') {
    const list: PestDiseaseRecord[] = Array.isArray(val) ? (val as PestDiseaseRecord[]) : [];
    const addEntry = () => {
      const next: PestDiseaseRecord[] = [
        ...list,
        {
          id: `pest_${Date.now()}`,
          cropId: 'wheat',
          cropName: 'Wheat',
          problemName: '',
          seasonYear: String(new Date().getFullYear()),
          affectedZone: 'whole_field',
          sourceType: 'farmer_reported',
        },
      ];
      onSaveAnswer('Q28', next, { scope: 'season_occurrence', sourceType: 'farmer_reported' });
    };
    return (
      <div className="space-y-3">
        {list.length === 0 && (
          <div className={`text-xs ${subtextCls}`}>
            No recurring pest or disease pressure recorded yet. Add one below if observed repeatedly, or continue.
          </div>
        )}
        {list.map((p, idx) => (
          <div
            key={p.id}
            className="fs-qst-subpanel rounded-[16px] p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
          >
            <div className="sm:col-span-4">
              <input
                type="text"
                value={p.problemName}
                onChange={(e) => {
                  const next = list.map((x, i) =>
                    i === idx ? { ...x, problemName: e.target.value } : x
                  );
                  onSaveAnswer('Q28', next, { scope: 'season_occurrence', sourceType: 'farmer_reported' });
                }}
                placeholder="Pest / disease (e.g., Root rot, Aphids)"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-3">
              <select
                value={p.cropId}
                onChange={(e) => {
                  const c = AGRICULTURAL_CROP_CATALOG.find((x) => x.id === e.target.value);
                  const next = list.map((x, i) =>
                    i === idx ? { ...x, cropId: e.target.value, cropName: c?.name || e.target.value } : x
                  );
                  onSaveAnswer('Q28', next, { scope: 'season_occurrence', sourceType: 'farmer_reported' });
                }}
                className={inputCls}
              >
                {AGRICULTURAL_CROP_CATALOG.map((c) => (
                  <option key={c.id} value={c.id}>
                    Host: {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <input
                type="text"
                value={p.seasonYear}
                onChange={(e) => {
                  const next = list.map((x, i) =>
                    i === idx ? { ...x, seasonYear: e.target.value } : x
                  );
                  onSaveAnswer('Q28', next, { scope: 'season_occurrence', sourceType: 'farmer_reported' });
                }}
                placeholder="Year"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <select
                value={p.affectedZone}
                onChange={(e) => {
                  const next = list.map((x, i) =>
                    i === idx
                      ? { ...x, affectedZone: e.target.value as 'whole_field' | 'specific_zone' }
                      : x
                  );
                  onSaveAnswer('Q28', next, { scope: 'season_occurrence', sourceType: 'farmer_reported' });
                }}
                className={inputCls}
              >
                <option value="whole_field">Whole field</option>
                <option value="specific_zone">Specific zone</option>
              </select>
            </div>
            <div className="sm:col-span-1 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  onSaveAnswer(
                    'Q28',
                    list.filter((_, i) => i !== idx),
                    { scope: 'season_occurrence', sourceType: 'farmer_reported' }
                  )
                }
                className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-full cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addEntry}
          className="fs-qst-subpanel inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add recurring pest or disease
        </button>
      </div>
    );
  }

  // Q29: Planning Horizon
  if (question.controlType === 'planning_horizon') {
    const cur = (val as { seasons?: number; basis?: 'seasons' | 'calendar_years' | 'growing_cycles' }) || {
      seasons: 4,
      basis: 'seasons',
    };
    const update = (patch: Partial<typeof cur>) => {
      onSaveAnswer('Q29', { ...cur, ...patch }, { scope: 'field', sourceType: 'farmer_reported' });
    };
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => update({ seasons: n })}
              className={`${CARD_BTN_BASE} text-center ${getOptionCardClass(cur.seasons === n, isLight)}`}
            >
              <div className="text-2xl font-bold">{n}</div>
              <div className={`text-xs mt-0.5 ${subtextCls}`}>
                {cur.basis === 'calendar_years'
                  ? 'Calendar years'
                  : cur.basis === 'growing_cycles'
                    ? 'Growing cycles'
                    : 'Seasons'}
              </div>
            </button>
          ))}
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1.5 ${labelCls}`}>Count horizon as:</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'seasons', label: 'Growing seasons' },
              { id: 'calendar_years', label: 'Calendar years' },
              { id: 'growing_cycles', label: 'Sequential crop cycles' },
            ].map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => update({ basis: b.id as typeof cur.basis })}
                className={`px-3 py-2 rounded-[12px] text-xs font-semibold border cursor-pointer ${getOptionCardClass(
                  (cur.basis || 'seasons') === b.id,
                  isLight
                )}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Q30: Crops per typical year
  if (question.controlType === 'crops_per_year') {
    const cur = (val as { count?: string; system?: string }) || { count: '1', system: 'successive' };
    const update = (patch: Partial<typeof cur>) => {
      onSaveAnswer('Q30', { ...cur, ...patch }, { scope: 'field', sourceType: 'farmer_reported' });
    };
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { id: '1', label: '1 crop / year' },
            { id: '2', label: '2 crops / year' },
            { id: '3_plus', label: '3+ cycles / year' },
            { id: 'varies', label: 'Varies by weather' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => update({ count: opt.id })}
              className={`${CARD_BTN_BASE} ${getOptionCardClass(cur.count === opt.id, isLight)}`}
            >
              <span className="text-sm font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>

        {(cur.count === '2' || cur.count === '3_plus') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { id: 'successive', label: 'Successive crops (one after another)' },
              { id: 'intercropping', label: 'Overlapping / intercropping' },
            ].map((sys) => (
              <button
                key={sys.id}
                type="button"
                onClick={() => update({ system: sys.id })}
                className={`${CARD_BTN_BASE} ${getOptionCardClass(cur.system === sys.id, isLight)}`}
              >
                <span className="text-xs font-semibold">{sys.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Q31: Planting & harvest windows
  if (question.controlType === 'planting_windows') {
    const cur = (val as { status?: string; earliestPlantMonth?: string; latestHarvestMonth?: string; reason?: string }) || {
      status: 'flexible',
    };
    const update = (patch: Partial<typeof cur>) => {
      onSaveAnswer('Q31', { ...cur, ...patch }, { scope: 'field', sourceType: 'farmer_reported' });
    };
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            { id: 'flexible', label: 'Flexible — follow regional agronomy windows' },
            { id: 'fixed_planting', label: 'Fixed planting window' },
            { id: 'fixed_harvest', label: 'Fixed harvest deadline' },
            { id: 'contract_labour', label: 'Contract, water, or labour deadline' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => update({ status: opt.id })}
              className={`${CARD_BTN_BASE} ${getOptionCardClass(cur.status === opt.id, isLight)}`}
            >
              <span className="text-sm font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>
        {cur.status && cur.status !== 'flexible' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              value={cur.earliestPlantMonth || ''}
              onChange={(e) => update({ earliestPlantMonth: e.target.value })}
              placeholder="Planting month(s) e.g. Oct–Nov"
              className={inputCls}
            />
            <input
              type="text"
              value={cur.latestHarvestMonth || ''}
              onChange={(e) => update({ latestHarvestMonth: e.target.value })}
              placeholder="Harvest deadline e.g. May"
              className={inputCls}
            />
            <input
              type="text"
              value={cur.reason || ''}
              onChange={(e) => update({ reason: e.target.value })}
              placeholder="Constraint reason"
              className={inputCls}
            />
          </div>
        )}
      </div>
    );
  }

  // Q32 (Required Crops) & Q33 (Excluded Crops)
  if (question.controlType === 'crop_multiselect') {
    const cur = (val as { none?: boolean; crops?: string[] }) || { none: false, crops: [] };
    const selectedCrops = Array.isArray(cur.crops) ? cur.crops : [];

    const toggleCrop = (cropId: string) => {
      const nextCrops = selectedCrops.includes(cropId)
        ? selectedCrops.filter((c) => c !== cropId)
        : [...selectedCrops, cropId];
      onSaveAnswer(
        question.id,
        { none: false, crops: nextCrops },
        { scope: 'field', sourceType: 'farmer_reported' }
      );
    };

    const chooseNone = () => {
      onSaveAnswer(
        question.id,
        { none: true, crops: [] },
        { scope: 'field', sourceType: 'farmer_reported' }
      );
    };

    // Detect Q32 vs Q33 direct overlap conflict
    const otherId = question.id === 'Q32' ? 'Q33' : 'Q32';
    const otherVal = getAnswerValue<{ crops?: string[] }>(draft, otherId);
    const conflictIds = selectedCrops.filter((c) => otherVal?.crops?.includes(c));

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={chooseNone}
            className={`px-4 py-2 rounded-full text-xs font-semibold border cursor-pointer ${getOptionCardClass(
              Boolean(cur.none),
              isLight
            )}`}
          >
            None — no {question.id === 'Q32' ? 'required' : 'excluded'} crops
          </button>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
            <input
              type="text"
              value={cropFilter}
              onChange={(e) => setCropFilter(e.target.value)}
              placeholder="Filter crops by name or family..."
              className={`${inputCls} pl-9`}
            />
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto pr-1 space-y-3">
          {CROP_CATEGORY_ORDER.map((cat) => {
            const group = filteredCrops.filter((c) => c.category === cat);
            if (group.length === 0) return null;
            return (
              <div key={cat}>
                <div className={`text-[10.5px] font-bold uppercase tracking-wider mb-1.5 ${subtextCls}`}>
                  {cat}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.map((crop) => {
                    const selected = !cur.none && selectedCrops.includes(crop.id);
                    return (
                      <button
                        key={crop.id}
                        type="button"
                        onClick={() => toggleCrop(crop.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-colors ${getOptionCardClass(
                          selected,
                          isLight
                        )}`}
                      >
                        {selected && <Check className="w-3 h-3" strokeWidth={3} />}
                        <span>{crop.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {conflictIds.length > 0 && (
          <div className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-xs bg-amber-500/15 border border-amber-500/35 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Conflict: {conflictIds.join(', ')} appears in both Required Crops (Q32) and Excluded Crops (Q33). Exclusions take hard precedence.
            </span>
          </div>
        )}
      </div>
    );
  }

  // Q35: Fertilizer & amendment details
  if (question.controlType === 'fertilizer_detail') {
    const cur = (val as { productType?: string; rate?: number | null; unit?: string; timing?: string }) || {
      productType: '',
      rate: null,
      unit: 'kg/ha',
      timing: 'Pre-plant',
    };
    const update = (patch: Partial<typeof cur>) => {
      onSaveAnswer('Q35', { ...cur, ...patch }, { scope: 'field', sourceType: 'farmer_reported' });
    };
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          value={cur.productType || ''}
          onChange={(e) => update({ productType: e.target.value })}
          placeholder="Product / amendment (e.g., Urea 46-0-0, Dairy compost)"
          className={inputCls}
        />
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            value={cur.rate ?? ''}
            onChange={(e) =>
              update({ rate: e.target.value === '' ? null : Number(e.target.value) })
            }
            placeholder="Rate"
            className={inputCls}
          />
          <select
            value={cur.unit || 'kg/ha'}
            onChange={(e) => update({ unit: e.target.value })}
            className={inputCls}
          >
            <option value="kg/ha">kg/ha</option>
            <option value="tonnes/ha">tonnes/ha</option>
            <option value="lbs/ac">lbs/ac</option>
            <option value="L/ha">L/ha</option>
          </select>
        </div>
        <select
          value={cur.timing || 'Pre-plant'}
          onChange={(e) => update({ timing: e.target.value })}
          className={inputCls}
        >
          <option value="Pre-plant">Pre-plant / incorporation</option>
          <option value="At seeding">At seeding (starter)</option>
          <option value="Top-dress">Mid-season top-dress / fertigation</option>
          <option value="Post-harvest">Post-harvest</option>
        </select>
      </div>
    );
  }

  // Q37 / SIMPLE_4: Priority Preset + Custom toggle
  if (question.controlType === 'priority_preset') {
    const cur =
      (draft.answers['Q37']?.value as { presetId?: PriorityPresetId; customize?: boolean }) || {
        presetId: 'balanced',
        customize: false,
      };
    const presets = Object.entries(PRIORITY_PRESET_VECTORS) as Array<
      [Exclude<PriorityPresetId, 'custom'>, (typeof PRIORITY_PRESET_VECTORS)['balanced']]
    >;
    return (
      <div className="space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {presets.map(([key, meta]) => {
            const selected = cur.presetId === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onSaveAnswer(
                    'Q37',
                    { presetId: key, customize: false },
                    { scope: 'field', sourceType: 'farmer_reported' }
                  )
                }
                className={`${CARD_BTN_BASE} ${getOptionCardClass(selected, isLight)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{meta.label}</div>
                    <p className={`text-[11px] mt-1 leading-snug ${subtextCls}`}>
                      {meta.description}
                    </p>
                  </div>
                  {selected && (
                    <Check className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF] shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {draft.experienceMode === 'advanced' && (
          <button
            type="button"
            onClick={() =>
              onSaveAnswer(
                'Q37',
                { presetId: 'custom', customize: true },
                { scope: 'field', sourceType: 'farmer_reported' }
              )
            }
            className={`${CARD_BTN_BASE} flex items-center justify-between ${getOptionCardClass(
              cur.presetId === 'custom' || Boolean(cur.customize),
              isLight
            )}`}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Sliders className="w-4 h-4" />
              Set my own priorities (open 5-axis weight sliders)
            </span>
            <span className={`text-xs ${subtextCls}`}>Custom vector</span>
          </button>
        )}
      </div>
    );
  }

  // Q38: Priority Weight Sliders (auto-normalized)
  if (question.controlType === 'priority_sliders') {
    const raw: PriorityVectorRaw = (val as PriorityVectorRaw) || {
      presetId: 'custom',
      waterEfficiency: 60,
      soilImprovement: 65,
      climateResilience: 55,
      cropSuitability: 60,
      productivityPotential: 60,
    };
    const norm = normalizePriorityVector(raw);
    const axes: Array<{ key: keyof Omit<PriorityVectorRaw, 'presetId'>; label: string; normPct: number }> = [
      { key: 'waterEfficiency', label: 'Water efficiency', normPct: Math.round(norm.waterEfficiency * 100) },
      { key: 'soilImprovement', label: 'Soil rebuilding & nitrogen cycling', normPct: Math.round(norm.soilImprovement * 100) },
      { key: 'climateResilience', label: 'Climate & weather resilience', normPct: Math.round(norm.climateResilience * 100) },
      { key: 'cropSuitability', label: 'Crop-to-soil suitability', normPct: Math.round(norm.cropSuitability * 100) },
      { key: 'productivityPotential', label: 'Productivity potential', normPct: Math.round(norm.productivityPotential * 100) },
    ];
    return (
      <div className="space-y-3.5">
        {axes.map((ax) => (
          <div key={ax.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold ${labelCls}`}>{ax.label}</span>
              <span className="font-mono text-[#0F766E] dark:text-[#2DD4BF]">
                Raw {raw[ax.key]} · Weight {ax.normPct}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={raw[ax.key]}
              onChange={(e) => {
                const next = { ...raw, presetId: 'custom' as const, [ax.key]: Number(e.target.value) };
                onSaveAnswer('Q38', next, { scope: 'field', sourceType: 'farmer_reported' });
              }}
              className="w-full accent-[#14B89A] cursor-pointer"
            />
          </div>
        ))}
        <div className={`text-[11px] flex items-center gap-1.5 ${subtextCls}`}>
          <Database className="w-3.5 h-3.5 shrink-0" />
          <span>Normalized weights always sum to 100% and rank only candidates that pass hard safety gates.</span>
        </div>
      </div>
    );
  }

  // Q40: Yield history
  if (question.controlType === 'yield_history') {
    const list: YieldHistoryRecord[] = Array.isArray(val) ? (val as YieldHistoryRecord[]) : [];
    const addYield = () => {
      const c = AGRICULTURAL_CROP_CATALOG[0];
      const next: YieldHistoryRecord[] = [
        ...list,
        {
          id: `yld_${Date.now()}`,
          cropId: c?.id || 'wheat',
          cropName: c?.name || 'Wheat',
          seasonYear: new Date().getFullYear() - 1,
          quantity: 0,
          unit: 'tonnes/ha',
          areaBasisHa: null,
          sourceType: 'farmer_reported',
        },
      ];
      onSaveAnswer('Q40', next, { scope: 'season_occurrence', sourceType: 'farmer_reported' });
    };

    return (
      <div className="space-y-3">
        {list.map((y, idx) => (
          <div
            key={y.id}
            className="fs-qst-subpanel rounded-[16px] p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
          >
            <div className="sm:col-span-4">
              <select
                value={y.cropId}
                onChange={(e) => {
                  const c = AGRICULTURAL_CROP_CATALOG.find((x) => x.id === e.target.value);
                  const next = list.map((r, i) =>
                    i === idx ? { ...r, cropId: e.target.value, cropName: c?.name || e.target.value } : r
                  );
                  onSaveAnswer('Q40', next, { scope: 'season_occurrence', sourceType: 'farmer_reported' });
                }}
                className={inputCls}
              >
                {AGRICULTURAL_CROP_CATALOG.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <input
                type="number"
                value={y.seasonYear}
                onChange={(e) => {
                  const next = list.map((r, i) =>
                    i === idx ? { ...r, seasonYear: Number(e.target.value) || 2025 } : r
                  );
                  onSaveAnswer('Q40', next, { scope: 'season_occurrence', sourceType: 'farmer_reported' });
                }}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-3">
              <input
                type="number"
                step="0.1"
                min="0"
                value={y.quantity || ''}
                onChange={(e) => {
                  const next = list.map((r, i) =>
                    i === idx ? { ...r, quantity: Number(e.target.value) || 0 } : r
                  );
                  onSaveAnswer('Q40', next, { scope: 'season_occurrence', sourceType: 'farmer_reported' });
                }}
                placeholder="Yield"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <select
                value={y.unit}
                onChange={(e) => {
                  const next = list.map((r, i) =>
                    i === idx ? { ...r, unit: e.target.value as YieldHistoryRecord['unit'] } : r
                  );
                  onSaveAnswer('Q40', next, { scope: 'season_occurrence', sourceType: 'farmer_reported' });
                }}
                className={inputCls}
              >
                <option value="tonnes/ha">tonnes/ha</option>
                <option value="kg/ha">kg/ha</option>
                <option value="tonnes">tonnes (total)</option>
                <option value="kg">kg (total)</option>
                <option value="bu/ac">bu/ac</option>
              </select>
            </div>
            <div className="sm:col-span-1 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  onSaveAnswer(
                    'Q40',
                    list.filter((_, i) => i !== idx),
                    { scope: 'season_occurrence', sourceType: 'farmer_reported' }
                  )
                }
                className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-full cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addYield}
          className="fs-qst-subpanel inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add historical yield record
        </button>
      </div>
    );
  }

  return (
    <div className="text-xs flex items-center gap-2 opacity-75">
      <HelpCircle className="w-4 h-4" />
      <span>Control ready.</span>
    </div>
  );
};
