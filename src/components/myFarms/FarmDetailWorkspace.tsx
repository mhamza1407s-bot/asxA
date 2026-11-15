import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CloudSun,
  Copy,
  Download,
  Droplets,
  Edit3,
  FileBarChart2,
  GitCompare,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Satellite,
  Settings as SettingsIcon,
  Sprout,
  Trash2,
  X,
} from 'lucide-react';
import {
  FarmObservationItem,
  FarmTaskItem,
  IrrigationLogItem,
  MyFarmRecord,
  MyFarmsSubTab,
  PlanDecisionAction,
  PlanDecisionEvent,
  PlanDecisionReasonCode,
  PortfolioFieldRecord,
  RotationCandidateOption,
  SavedFarmSnapshot,
} from '../../types/myFarms';
import {
  AreaUnit,
  DrainageRate,
  IrrigationMethod,
  SoilMoistureStatus,
  SoilMoistureUnit,
  SoilPhStatus,
  SoilTexture,
  WateringMethod,
  WaterReliability,
  WaterSource,
} from '../../types/farm';
import { GeoJsonPolygonGeometry } from '../../types/maps';
import {
  computeWaterBalance,
  formatArea,
  formatRelativeDate,
  resolveCropThumbnail,
} from '../../lib/myFarmsEngine';
import {
  buildMoistureUnitAmbiguityNote,
  formatSoilMoistureUnitLabel,
  normalizeSoilMoistureUnit,
  resolveEffectiveFieldSoil,
} from '../../lib/soilProvenance';
import { useDisplayPrefs } from '../../context/DisplayPrefsContext';
import {
  ExtendedFieldWeatherResult,
  fetchFieldExtendedWeather,
  fetchLiveFarmWeather,
  LiveWeatherReading,
} from '../../services/weather';
import { fetchNasaPowerClimatology, fetchNasaPowerRecent30Days } from '../../services/nasaPower';
import { fetchEonetEvents } from '../../services/eonet';
import { EonetFetchResult, PowerClimateResult } from '../../types';
import { FieldBoundaryEditorMap } from './FieldBoundaryEditorMap';
import { PlanDecisionJournal } from './PlanDecisionJournal';
import { ProvenanceText } from './StatusIndicators';
import { buildFieldIntelligenceViewModel } from './fieldDashboard/fieldDashboardModel';
import {
  buildFieldAgronomyBundle,
  InspectableMetric,
} from '../../lib/fieldAgronomyEngine';
import {
  FarmWorkspaceSection,
  FieldDashboardSidebar,
  InfoSubCategory,
} from './fieldDashboard/FieldDashboardSidebar';
import { CropOverviewHeroCard } from './fieldDashboard/CropOverviewHeroCard';
import { GrowingConditionsCard } from './fieldDashboard/GrowingConditionsCard';
import { WaterIrrigationCard } from './fieldDashboard/WaterIrrigationCard';
import { SoilCropInfoCard } from './fieldDashboard/SoilCropInfoCard';
import { TodayActionsCard } from './fieldDashboard/TodayActionsCard';
import { RisksAndRotationColumn } from './fieldDashboard/RisksAndRotationColumn';
import { AdvancedAnalysisView } from './fieldDashboard/AdvancedAnalysisView';
import { FarmSettingsView } from './fieldDashboard/FarmSettingsView';
import { MetricInspectionDrawer } from './fieldDashboard/MetricInspectionDrawer';
import { DisclosureMode } from './fieldDashboard/subcategories/SubCategoryHeaderBar';
import { WeatherClimateView } from './fieldDashboard/subcategories/WeatherClimateView';
import { WaterIrrigationView } from './fieldDashboard/subcategories/WaterIrrigationView';
import { SoilCropInfoView } from './fieldDashboard/subcategories/SoilCropInfoView';
import { RisksAlertsView } from './fieldDashboard/subcategories/RisksAlertsView';

const DRAWER_TABS: Array<{
  id: MyFarmsSubTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Farm Overview', Icon: Activity },
  { id: 'fields', label: 'Fields & Map', Icon: Layers },
  { id: 'water', label: 'Water & Irrigation', Icon: Droplets },
  { id: 'soil', label: 'Soil & Land', Icon: ClipboardList },
  { id: 'actions', label: 'Actions & Logs', Icon: CalendarCheck },
  { id: 'rotation', label: 'Rotation Plan', Icon: Sprout },
  { id: 'weather', label: 'Climate Baseline', Icon: CloudSun },
  { id: 'vegetation', label: 'Satellite', Icon: Satellite },
  { id: 'reports', label: 'Past Analyses', Icon: FileBarChart2 },
  { id: 'settings', label: 'Farm Settings', Icon: SettingsIcon },
];

interface FarmDetailWorkspaceProps {
  farm: MyFarmRecord;
  allFields: PortfolioFieldRecord[];
  decisions: PlanDecisionEvent[];
  observations: FarmObservationItem[];
  tasks: FarmTaskItem[];
  irrigationLogs: IrrigationLogItem[];
  snapshots: SavedFarmSnapshot[];
  activeTab: MyFarmsSubTab;
  isOnline: boolean;
  syncBarSlot?: React.ReactNode;
  onChangeTab: (tab: MyFarmsSubTab) => void;
  onBackToPortfolio: () => void;
  onPatchFarm: (farm: MyFarmRecord, patch: Record<string, unknown>, label: string) => Promise<void>;
  onCreateField: (payload: Record<string, unknown>) => Promise<void>;
  onPatchField: (fieldId: string, patch: Record<string, unknown>) => Promise<void>;
  onSaveFieldBoundary: (fieldId: string, geometry: GeoJsonPolygonGeometry, editReason?: string) => Promise<void>;
  onDeleteField: (fieldId: string) => Promise<void>;
  onRecordDecision: (payload: {
    fieldId: string | null;
    fieldName: string;
    action: PlanDecisionAction;
    candidate: RotationCandidateOption;
    isRecommendedPlan: boolean;
    reasonCode: PlanDecisionReasonCode;
    reasonNote: string;
  }) => Promise<void>;
  onAddObservation: (payload: Record<string, unknown>) => Promise<void>;
  onAddTask: (payload: Record<string, unknown>) => Promise<void>;
  onToggleTask: (taskId: string, completed: boolean) => Promise<void>;
  onAddIrrigation: (payload: Record<string, unknown>) => Promise<void>;
  onCreateSnapshot: (payload: Record<string, unknown>) => Promise<void>;
  onOpenRename: (farm: MyFarmRecord) => void;
  onOpenDuplicate: (farm: MyFarmRecord) => void;
  onOpenExport: (farm: MyFarmRecord) => void;
  onArchiveToggle: (farm: MyFarmRecord) => void;
  onOpenDelete: (farm: MyFarmRecord) => void;
  onOpenInMaps: (farm: MyFarmRecord) => void;
  onRunDeepAnalysis: (farm: MyFarmRecord) => void;
}

export function formatSnapshotHistoricalContext(snapshot: SavedFarmSnapshot): string {
  const ctx = snapshot.soilContext;
  const parts: string[] = [];

  if (ctx?.texture) {
    parts.push(`Texture: ${ctx.texture}`);
  }

  const rawMoisture = snapshot.keyMetrics?.soilMoisturePct ?? null;
  if (ctx?.moistureStatus === 'unknown' || (ctx?.moistureStatus && rawMoisture === null)) {
    parts.push(`Moisture: ${ctx.moistureStatus === 'unknown' ? 'Unknown / not measured' : `${ctx.moistureStatus} (value not entered)`}`);
  } else if (rawMoisture !== null) {
    const unitLabel = ctx?.moistureUnit
      ? formatSoilMoistureUnitLabel(ctx.moistureUnit)
      : 'unit unrecorded (historical snapshot)';
    const statusLabel = ctx?.moistureStatus ? `${ctx.moistureStatus} ` : '';
    const detailBits = [
      ctx?.moistureDepth ? `depth ${ctx.moistureDepth}` : '',
      ctx?.moistureMethod ? `method ${ctx.moistureMethod}` : '',
      ctx?.moistureDate ? `date ${ctx.moistureDate}` : '',
    ].filter(Boolean);
    parts.push(
      `Moisture: ${statusLabel}${rawMoisture}% (${unitLabel})${detailBits.length ? ` · ${detailBits.join(', ')}` : ''}`
    );
  } else {
    parts.push('Moisture: Not recorded');
  }

  const rawPh = snapshot.keyMetrics?.phValue ?? null;
  if (rawPh !== null) {
    parts.push(`pH ${rawPh}${ctx?.phTestDate ? ` (${ctx.phTestDate})` : ''}`);
  } else if (ctx?.phStatus === 'not_tested') {
    parts.push('pH: Not tested');
  }

  return parts.join(' | ');
}

export function buildSnapshotCreationPayload(params: {
  farm: MyFarmRecord;
  selectedField: PortfolioFieldRecord | null;
  meanTemp: number | null;
  precip: number | null;
  weatherSummary: string;
  nasaAvail: 'available' | 'unavailable';
  meteoAvail: 'available' | 'unavailable';
  eonetAvail: 'available' | 'unavailable';
  hazardPenalty: number;
}): Record<string, unknown> {
  const {
    farm,
    selectedField,
    meanTemp,
    precip,
    weatherSummary,
    nasaAvail,
    meteoAvail,
    eonetAvail,
    hazardPenalty,
  } = params;

  const effSoil = resolveEffectiveFieldSoil(farm.soil, selectedField?.soilOverrides);
  const moisture = effSoil.moistureStatus !== 'unknown' ? effSoil.moisturePct : null;
  const ph = effSoil.phStatus === 'tested' ? effSoil.phValue : null;
  const hasEnough =
    farm.centroid !== null &&
    (ph !== null || effSoil.texture !== 'Unknown' || farm.water.reliability !== 'Unknown');

  let score: number | null = null;
  if (hasEnough) {
    let s = 74;
    if (ph !== null) {
      if (ph >= 6.0 && ph <= 7.2) s += 6;
      else if (ph < 5.3 || ph > 8.2) s -= 12;
    }
    if (
      farm.water.reliability === 'Frequently limited' ||
      farm.water.reliability === 'Highly unreliable'
    ) {
      s -= 16;
    } else if (farm.water.reliability === 'Always available') {
      s += 5;
    }
    s -= hazardPenalty;
    score = Math.max(12, Math.min(96, Math.round(s)));
  }

  const recs: string[] = [];
  if (effSoil.moistureUnitAmbiguityNote) {
    recs.push(effSoil.moistureUnitAmbiguityNote);
  }
  if (moisture === null) {
    recs.push(
      'Soil moisture not measured: record a calibrated reading with unit and sampling depth when available.'
    );
  }
  if (ph === null) {
    recs.push('Soil pH untested: submit composite 0–20 cm cores before next fertiliser cycle.');
  }
  if (
    farm.water.reliability === 'Frequently limited' ||
    farm.water.reliability === 'Highly unreliable'
  ) {
    recs.push('Align peak-ET crop stage outside constrained supply months.');
  }
  if (recs.length === 0) {
    recs.push(
      'Recorded soil chemistry, water reliability, and recent weather observations have been captured without threshold assumptions.'
    );
  }

  return {
    fieldId: selectedField?.id ?? null,
    fieldName: selectedField?.name ?? 'Whole Farm',
    modelVersion: 'power-eonet-v2.2',
    triggerReason: 'Manual field intelligence snapshot',
    suitabilityScore: score,
    completenessPct: farm.assessment.completenessPct,
    weatherWindowSummary: weatherSummary,
    dataAvailability: {
      nasaPower: nasaAvail,
      openMeteo: meteoAvail,
      nasaEonet: eonetAvail,
      soilLab:
        effSoil.moistureStatus === 'measured' || effSoil.phStatus === 'tested'
          ? 'measured'
          : effSoil.moistureStatus === 'estimated'
            ? 'estimated'
            : 'missing',
    },
    keyMetrics: {
      meanTempC: meanTemp,
      precipMmDay: precip,
      et0MmDay: null,
      soilMoisturePct: moisture,
      phValue: ph,
      mappedAreaHa: farm.mappedAreaHa,
    },
    soilContext: {
      texture: effSoil.texture,
      moistureStatus: effSoil.moistureStatus,
      moistureUnit: effSoil.moistureUnit,
      moistureDepth: effSoil.moistureDepth,
      moistureMethod: effSoil.moistureMethod,
      moistureDate: effSoil.moistureDate,
      moistureProvenanceLabel: effSoil.moistureProvenanceLabel,
      phStatus: effSoil.phStatus,
      phTestDate: effSoil.phTestDate,
      phProvenanceLabel: effSoil.phProvenanceLabel,
      drainage: effSoil.drainage,
    },
    recommendations: recs,
  };
}

export const FarmDetailWorkspace: React.FC<FarmDetailWorkspaceProps> = ({
  farm,
  allFields,
  decisions,
  observations,
  tasks,
  irrigationLogs,
  snapshots,
  activeTab,
  isOnline,
  syncBarSlot,
  onChangeTab,
  onBackToPortfolio,
  onPatchFarm,
  onCreateField,
  onPatchField,
  onSaveFieldBoundary,
  onDeleteField,
  onRecordDecision,
  onAddObservation,
  onAddTask,
  onToggleTask,
  onAddIrrigation,
  onCreateSnapshot,
  onOpenRename,
  onOpenDuplicate,
  onOpenExport,
  onArchiveToggle,
  onOpenDelete,
  onOpenInMaps,
  onRunDeepAnalysis,
}) => {
  const { tempUnit, windUnit } = useDisplayPrefs();

  const farmFields = useMemo(
    () => allFields.filter((f) => f.farmId === farm.id),
    [allFields, farm.id]
  );
  const farmObservations = useMemo(
    () => observations.filter((o) => o.farmId === farm.id),
    [observations, farm.id]
  );
  const farmTasks = useMemo(
    () => tasks.filter((t) => t.farmId === farm.id),
    [tasks, farm.id]
  );
  const farmIrrigation = useMemo(
    () => irrigationLogs.filter((l) => l.farmId === farm.id),
    [irrigationLogs, farm.id]
  );
  const farmSnapshots = useMemo(
    () =>
      snapshots
        .filter((s) => s.farmId === farm.id)
        .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt)),
    [snapshots, farm.id]
  );

  // Active Workspace Section ('info' | 'advanced' | 'settings') + Info Sub-Category
  const [workspaceSection, setWorkspaceSection] = useState<FarmWorkspaceSection>('info');
  const [infoSubTab, setInfoSubTab] = useState<InfoSubCategory>('overview');
  const [disclosureMode, setDisclosureMode] = useState<DisclosureMode>('simple');
  const [inspectedMetric, setInspectedMetric] = useState<InspectableMetric | null>(null);

  // Selected Field State
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    farmFields[0]?.id ?? null
  );
  // Slide-over / Modal Drawer State for Drill-Down Views
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = (tab: MyFarmsSubTab) => {
    onChangeTab(tab);
    setDrawerOpen(true);
  };

  useEffect(() => {
    setWorkspaceSection('info');
    setInfoSubTab('overview');
  }, [farm.id]);

  useEffect(() => {
    if (farmFields.length > 0 && !farmFields.some((f) => f.id === selectedFieldId)) {
      setSelectedFieldId(farmFields[0].id);
    } else if (farmFields.length === 0) {
      setSelectedFieldId(null);
    }
  }, [farm.id, farmFields.length]);

  const selectedFieldIndex = useMemo(() => {
    if (farmFields.length === 0) return 0;
    const idx = farmFields.findIndex((f) => f.id === selectedFieldId);
    return idx >= 0 ? idx : 0;
  }, [farmFields, selectedFieldId]);

  const selectedField = useMemo(
    () => farmFields[selectedFieldIndex] ?? null,
    [farmFields, selectedFieldIndex]
  );

  // Fields & Map Table State
  const [fieldTableFilter, setFieldTableFilter] = useState<
    'all' | 'alerts' | 'rotation_due' | 'missing_soil'
  >('all');
  const [pendingNewFieldGeom, setPendingNewFieldGeom] = useState<{
    geometry: GeoJsonPolygonGeometry;
    areaHa: number;
  } | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldCrop, setNewFieldCrop] = useState(farm.primaryCrop || 'Wheat');
  const [confirmDeleteFieldId, setConfirmDeleteFieldId] = useState<string | null>(null);

  const filteredComparisonFields = useMemo(() => {
    return farmFields.filter((f) => {
      if (fieldTableFilter === 'alerts') {
        return f.status === 'Needs Review' || f.activeAlertsCount > 0;
      }
      if (fieldTableFilter === 'rotation_due') {
        return f.rotationReviewDue;
      }
      if (fieldTableFilter === 'missing_soil') {
        return !f.soilSummary && !f.soilOverrides?.texture;
      }
      return true;
    });
  }, [farmFields, fieldTableFilter]);

  // Soil form state synced on farm change
  const [soilForm, setSoilForm] = useState(() => ({
    ...farm.soil,
    moistureUnit: normalizeSoilMoistureUnit(farm.soil.moistureUnit),
    moistureDepth: farm.soil.moistureDepth ?? '',
    moistureMethod: farm.soil.moistureMethod ?? '',
    moistureDate: farm.soil.moistureDate ?? '',
    phTestDate: farm.soil.phTestDate ?? '',
  }));
  const [savingSoil, setSavingSoil] = useState(false);
  const [demProbeLoading, setDemProbeLoading] = useState(false);

  useEffect(() => {
    setSoilForm({
      ...farm.soil,
      moistureUnit: normalizeSoilMoistureUnit(farm.soil.moistureUnit),
      moistureDepth: farm.soil.moistureDepth ?? '',
      moistureMethod: farm.soil.moistureMethod ?? '',
      moistureDate: farm.soil.moistureDate ?? '',
      phTestDate: farm.soil.phTestDate ?? '',
    });
  }, [farm.id, farm.updatedAt]);

  // Water form state
  const [waterForm, setWaterForm] = useState(farm.water);
  const [savingWater, setSavingWater] = useState(false);
  const [irrDate, setIrrDate] = useState(new Date().toISOString().slice(0, 10));
  const [irrVolume, setIrrVolume] = useState('');
  const [irrNotes, setIrrNotes] = useState('');

  useEffect(() => {
    setWaterForm(farm.water);
  }, [farm.id, farm.updatedAt]);

  const waterBalance = useMemo(() => computeWaterBalance(farm), [farm]);

  // Live Weather, Extended Forecast/History, NASA POWER 30d + 21-Yr & EONET State
  const [liveWeather, setLiveWeather] = useState<LiveWeatherReading | null>(null);
  const [extendedWeather, setExtendedWeather] = useState<ExtendedFieldWeatherResult | null>(null);
  const [nasaRecent30, setNasaRecent30] = useState<PowerClimateResult | null>(null);
  const [climateResult, setClimateResult] = useState<PowerClimateResult | null>(null);
  const [eonetResult, setEonetResult] = useState<EonetFetchResult | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const loadWeatherAndClimate = async () => {
    if (!farm.centroid) {
      setWeatherError('Add farm coordinates to fetch gridded weather and NASA POWER climate data.');
      return;
    }
    if (!isOnline) {
      setWeatherError('Offline — live weather and NASA POWER fetch disabled until connection returns.');
      return;
    }
    setWeatherLoading(true);
    setWeatherError(null);
    const todayIso = new Date().toISOString().slice(0, 10);
    try {
      const [wRes, extRes, p30Res, pRes, eRes] = await Promise.allSettled([
        fetchLiveFarmWeather(farm.centroid.lat, farm.centroid.lon),
        fetchFieldExtendedWeather(farm.centroid.lat, farm.centroid.lon),
        fetchNasaPowerRecent30Days(farm.centroid.lat, farm.centroid.lon),
        fetchNasaPowerClimatology(farm.centroid.lat, farm.centroid.lon, todayIso, undefined, 'farming'),
        fetchEonetEvents(farm.centroid.lat, farm.centroid.lon, 300),
      ]);
      if (wRes.status === 'fulfilled') setLiveWeather(wRes.value);
      if (extRes.status === 'fulfilled') setExtendedWeather(extRes.value);
      if (p30Res.status === 'fulfilled') setNasaRecent30(p30Res.value);
      if (pRes.status === 'fulfilled') setClimateResult(pRes.value);
      if (eRes.status === 'fulfilled') setEonetResult(eRes.value);
      if (
        wRes.status === 'rejected' &&
        extRes.status === 'rejected' &&
        p30Res.status === 'rejected' &&
        pRes.status === 'rejected'
      ) {
        setWeatherError('Unable to reach Open-Meteo or NASA POWER right now.');
      }
    } finally {
      setWeatherLoading(false);
    }
  };

  useEffect(() => {
    if (farm.centroid && isOnline) {
      loadWeatherAndClimate();
    } else {
      setLiveWeather(null);
      setExtendedWeather(null);
      setNasaRecent30(null);
      setClimateResult(null);
      setEonetResult(null);
    }
  }, [farm.id, isOnline]);

  // Actions & Observations Form
  const [obsTitle, setObsTitle] = useState('');
  const [obsCategory, setObsCategory] = useState<FarmObservationItem['category']>('scouting');
  const [obsDetail, setObsDetail] = useState('');
  const [obsProvenance, setObsProvenance] = useState<'Measured' | 'Reported'>('Reported');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskPriority, setTaskPriority] = useState<'high' | 'normal' | 'low'>('normal');

  // Past Analyses Compare State
  const [compareLeftId, setCompareLeftId] = useState<string>(farmSnapshots[1]?.id ?? farmSnapshots[0]?.id ?? '');
  const [compareRightId, setCompareRightId] = useState<string>(farmSnapshots[0]?.id ?? '');
  const [runningSnapshot, setRunningSnapshot] = useState(false);

  useEffect(() => {
    setCompareRightId(farmSnapshots[0]?.id ?? '');
    setCompareLeftId(farmSnapshots[1]?.id ?? farmSnapshots[0]?.id ?? '');
  }, [farm.id, farmSnapshots.length]);

  const compareLeft = farmSnapshots.find((s) => s.id === compareLeftId) ?? null;
  const compareRight = farmSnapshots.find((s) => s.id === compareRightId) ?? null;

  // Settings Region / Area Unit local edits
  const [settingsRegion, setSettingsRegion] = useState(farm.regionLabel);
  const [settingsTz, setSettingsTz] = useState(farm.timezone);
  const [settingsDeclaredArea, setSettingsDeclaredArea] = useState(
    farm.declaredAreaHa !== null ? String(farm.declaredAreaHa) : ''
  );
  const [settingsAreaUnit, setSettingsAreaUnit] = useState<AreaUnit>(farm.areaUnit);
  const [settingsNotes, setSettingsNotes] = useState(farm.notes);

  useEffect(() => {
    setSettingsRegion(farm.regionLabel);
    setSettingsTz(farm.timezone);
    setSettingsDeclaredArea(farm.declaredAreaHa !== null ? String(farm.declaredAreaHa) : '');
    setSettingsAreaUnit(farm.areaUnit);
    setSettingsNotes(farm.notes);
  }, [farm.id, farm.updatedAt]);

  const fieldModel = useMemo(
    () =>
      buildFieldIntelligenceViewModel({
        farm,
        field: selectedField,
        fieldIndex: selectedFieldIndex,
        liveWeather,
        tasks: farmTasks,
        observations: farmObservations,
        irrigationLogs: farmIrrigation,
      }),
    [farm, selectedField, selectedFieldIndex, liveWeather, farmTasks, farmObservations, farmIrrigation]
  );

  const agronomyBundle = useMemo(
    () =>
      buildFieldAgronomyBundle({
        farm,
        field: selectedField,
        fieldIndex: selectedFieldIndex,
        liveWeather,
        extendedWeather,
        nasaRecent30,
        climateResult,
        eonetResult,
        irrigationLogs: farmIrrigation,
        tasks: farmTasks,
        observations: farmObservations,
        decisions,
      }),
    [
      farm,
      selectedField,
      selectedFieldIndex,
      liveWeather,
      extendedWeather,
      nasaRecent30,
      climateResult,
      eonetResult,
      farmIrrigation,
      farmTasks,
      farmObservations,
      decisions,
    ]
  );

  const fmtTemp = (c: number | null | undefined) => {
    if (c === null || c === undefined || !Number.isFinite(c)) return '—';
    return tempUnit === 'F' ? `${Math.round((c * 9) / 5 + 32)} °F` : `${c.toFixed(1)} °C`;
  };
  const fmtWind = (kmh: number | null | undefined) => {
    if (kmh === null || kmh === undefined || !Number.isFinite(kmh)) return '—';
    return windUnit === 'mph' ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
  };

  const handleSaveSoil = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSoil(true);
    try {
      const normalizedUnit =
        soilForm.moistureStatus === 'unknown'
          ? 'unspecified'
          : normalizeSoilMoistureUnit(soilForm.moistureUnit);
      const sanitizedSoil = {
        ...soilForm,
        moisturePct: soilForm.moistureStatus === 'unknown' ? null : soilForm.moisturePct,
        moistureUnit: normalizedUnit,
        moistureDepth: soilForm.moistureStatus === 'unknown' ? '' : (soilForm.moistureDepth ?? '').trim(),
        moistureMethod: soilForm.moistureStatus === 'unknown' ? '' : (soilForm.moistureMethod ?? '').trim(),
        moistureDate: soilForm.moistureStatus === 'unknown' ? '' : (soilForm.moistureDate ?? '').trim(),
        phValue: soilForm.phStatus === 'not_tested' ? null : soilForm.phValue,
        phTestDate: soilForm.phStatus === 'not_tested' ? '' : (soilForm.phTestDate ?? '').trim(),
      };
      await onPatchFarm(farm, { soil: sanitizedSoil }, `Updated Soil & Land for ${farm.name}`);
    } finally {
      setSavingSoil(false);
    }
  };

  const handleProbeTerrainSlope = async () => {
    if (!farm.centroid || !isOnline) return;
    setDemProbeLoading(true);
    try {
      const resp = await fetch('/api/maps/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: farm.centroid.lat,
          lon: farm.centroid.lon,
          observationDate: new Date().toISOString().slice(0, 10),
          fieldAreaHectares: farm.mappedAreaHa || null,
        }),
      });
      if (!resp.ok) return;
      const json = (await resp.json()) as {
        datasets?: Array<{ layerId: string; metrics?: Array<{ label: string; value: string }> }>;
      };
      const elevDs = json.datasets?.find((d) => d.layerId === 'elevation_terrain');
      const elevM = Number(elevDs?.metrics?.find((m) => m.label.includes('Elevation'))?.value);
      const slopeVal = Number(elevDs?.metrics?.find((m) => m.label.includes('Slope'))?.value);
      setSoilForm((prev) => ({
        ...prev,
        elevationM: Number.isFinite(elevM) ? elevM : prev.elevationM,
        slopePct: Number.isFinite(slopeVal) ? slopeVal : prev.slopePct,
      }));
    } finally {
      setDemProbeLoading(false);
    }
  };

  const handleSaveWater = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWater(true);
    try {
      await onPatchFarm(farm, { water: waterForm }, `Updated Water Intelligence for ${farm.name}`);
    } finally {
      setSavingWater(false);
    }
  };

  const handleCreateFreshSnapshot = async () => {
    if (!isOnline) return;
    setRunningSnapshot(true);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      let weatherSummary = 'No coordinates set; baseline profile check only.';
      let meanTemp: number | null = null;
      let precip: number | null = null;
      let nasaAvail: 'available' | 'unavailable' = 'unavailable';
      let meteoAvail: 'available' | 'unavailable' = 'unavailable';
      let eonetAvail: 'available' | 'unavailable' = 'unavailable';
      let hazardPenalty = 0;

      if (farm.centroid) {
        const [pRes, wRes, eRes] = await Promise.allSettled([
          fetchNasaPowerClimatology(farm.centroid.lat, farm.centroid.lon, todayIso, undefined, 'farming'),
          fetchLiveFarmWeather(farm.centroid.lat, farm.centroid.lon),
          fetchEonetEvents(farm.centroid.lat, farm.centroid.lon, 30),
        ]);
        if (pRes.status === 'fulfilled') {
          nasaAvail = 'available';
          const p = pRes.value;
          meanTemp = p.meanMaxC !== null && p.meanMinC !== null ? Number(((p.meanMaxC + p.meanMinC) / 2).toFixed(1)) : null;
          precip = p.meanPrecipMm;
          weatherSummary = `NASA POWER (${p.yearsAnalyzed.length}y window): ${p.meanMaxC?.toFixed(1) ?? '—'}/${p.meanMinC?.toFixed(1) ?? '—'} °C, ${p.meanPrecipMm?.toFixed(2) ?? '—'} mm/d.`;
        }
        if (wRes.status === 'fulfilled') {
          meteoAvail = 'available';
          setLiveWeather(wRes.value);
          if (meanTemp === null) meanTemp = wRes.value.tempC;
          if (precip === null) precip = wRes.value.precipMm;
        }
        if (eRes.status === 'fulfilled') {
          eonetAvail = 'available';
          if (eRes.value.nearbyEvents.length > 0) hazardPenalty = 10;
        }
      }

      const snapshotPayload = buildSnapshotCreationPayload({
        farm,
        selectedField,
        meanTemp,
        precip,
        weatherSummary,
        nasaAvail,
        meteoAvail,
        eonetAvail,
        hazardPenalty,
      });

      await onCreateSnapshot(snapshotPayload);
    } finally {
      setRunningSnapshot(false);
    }
  };

  const activeCrumbSuffix =
    workspaceSection === 'info'
      ? infoSubTab === 'weather'
        ? 'Weather & Climate'
        : infoSubTab === 'water'
          ? 'Water & Irrigation'
          : infoSubTab === 'soil'
            ? 'Soil & Crop Info'
            : infoSubTab === 'risks'
              ? 'Risks & Alerts'
              : null
      : workspaceSection === 'advanced'
        ? 'Advanced'
        : 'Settings';

  return (
    <div className="space-y-2.5">
      {/* Compact Single-Line Breadcrumb: My Farms (to starter page) > Farm Name (non-clickable) > Field 01 (to Information Overview) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 min-h-[26px]">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
          <button
            type="button"
            onClick={onBackToPortfolio}
            className="inline-flex items-center gap-1.5 font-medium text-[#072622] dark:text-[#D5ECE6] hover:text-[#0F766E] dark:hover:text-[#2DD4BF] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[2]" />
            <span>My Farms</span>
          </button>

          <ChevronRight className="w-3 h-3 text-[#2B5E56] dark:text-[#7BB8AC]" />

          <span className="font-normal text-[#1B4D46] dark:text-[#96C7BE] select-text">
            {farm.name}
          </span>

          <ChevronRight className="w-3 h-3 text-[#2B5E56] dark:text-[#7BB8AC]" />

          <button
            type="button"
            onClick={() => {
              setWorkspaceSection('info');
              setInfoSubTab('overview');
            }}
            className={`font-semibold transition-colors cursor-pointer ${
              workspaceSection === 'info' && infoSubTab === 'overview'
                ? 'text-[#072622] dark:text-[#ECF8F5] hover:text-[#0F766E] dark:hover:text-[#2DD4BF]'
                : 'text-[#0F766E] dark:text-[#2DD4BF] hover:underline'
            }`}
          >
            {fieldModel.fieldCode}
          </button>

          {activeCrumbSuffix && (
            <>
              <ChevronRight className="w-3 h-3 text-[#2B5E56] dark:text-[#7BB8AC]" />
              <span className="font-semibold text-[#072622] dark:text-[#ECF8F5]">
                {activeCrumbSuffix}
              </span>
            </>
          )}
        </nav>

        {syncBarSlot && <div className="flex items-center gap-2">{syncBarSlot}</div>}
      </div>

      {/* Main Layout: Sidebar always present + Full-Width Main Workspace */}
      <div className="flex flex-col lg:flex-row items-stretch gap-3.5 xl:gap-4">
        <FieldDashboardSidebar
          farm={farm}
          fields={farmFields}
          selectedFieldId={selectedField?.id ?? null}
          activeSection={workspaceSection}
          activeInfoSubTab={infoSubTab}
          riskCount={agronomyBundle.risks.length}
          onChangeSection={setWorkspaceSection}
          onChangeInfoSubTab={setInfoSubTab}
          onSelectField={(id) => setSelectedFieldId(id)}
        />

        <div className="flex-1 min-w-0 w-full space-y-2.5 xl:space-y-3">
          {workspaceSection === 'info' && infoSubTab === 'overview' && (
            <>
              {/* ROW 1: Full-Width Main Crop Overview Hero Card */}
              <CropOverviewHeroCard
                model={fieldModel}
                onOpenCropHealthDetails={() => setInfoSubTab('soil')}
              />

              {/* ROW 2: Growing Conditions (44%) | Water & Irrigation (56%) */}
              <div className="grid grid-cols-1 lg:grid-cols-[44fr_56fr] gap-2.5 xl:gap-3 items-stretch">
                <GrowingConditionsCard
                  liveWeather={liveWeather}
                  loading={weatherLoading}
                  isOnline={isOnline}
                  onRefresh={loadWeatherAndClimate}
                  onOpenWeatherDetails={() => setInfoSubTab('weather')}
                />

                <WaterIrrigationCard
                  model={fieldModel}
                  onViewDetails={() => setInfoSubTab('water')}
                  onQuickLogIrrigation={() => setInfoSubTab('water')}
                />
              </div>

              {/* ROW 3: Soil & Crop Info (42.5%) | Today's Actions (29.5%) | Risks & Crop Rotation (28%) */}
              <div className="grid grid-cols-1 lg:grid-cols-[42.5fr_29.5fr_28fr] gap-2.5 xl:gap-3 items-stretch">
                <SoilCropInfoCard
                  model={fieldModel}
                  onViewDetails={() => setInfoSubTab('soil')}
                />

                <TodayActionsCard
                  model={fieldModel}
                  onToggleTask={(taskId, completed) => onToggleTask(taskId, completed)}
                  onViewFullActionPlan={() => setInfoSubTab('risks')}
                />

                <RisksAndRotationColumn
                  model={fieldModel}
                  onViewAllRisks={() => setInfoSubTab('risks')}
                  onOpenRotationPlanner={() => openDrawer('rotation')}
                />
              </div>
            </>
          )}

          {workspaceSection === 'info' && infoSubTab === 'weather' && (
            <WeatherClimateView
              fields={farmFields}
              selectedField={selectedField}
              onSelectField={(id) => setSelectedFieldId(id)}
              bundle={agronomyBundle}
              extendedWeather={extendedWeather}
              areaLabel={fieldModel.fieldAreaLabel}
              tempUnit={tempUnit}
              windUnit={windUnit}
              disclosureMode={disclosureMode}
              onChangeDisclosureMode={setDisclosureMode}
              onInspectMetric={setInspectedMetric}
              onRefresh={loadWeatherAndClimate}
              loading={weatherLoading}
              isOnline={isOnline}
              weatherError={weatherError}
            />
          )}

          {workspaceSection === 'info' && infoSubTab === 'water' && (
            <WaterIrrigationView
              farm={farm}
              fields={farmFields}
              selectedField={selectedField}
              onSelectField={(id) => setSelectedFieldId(id)}
              bundle={agronomyBundle}
              irrigationLogs={farmIrrigation}
              areaLabel={fieldModel.fieldAreaLabel}
              disclosureMode={disclosureMode}
              onChangeDisclosureMode={setDisclosureMode}
              onInspectMetric={setInspectedMetric}
              onAddIrrigation={onAddIrrigation}
              onOpenWaterConfigDrawer={() => openDrawer('water')}
              onOpenSoilDetails={() => setInfoSubTab('soil')}
              onRefresh={loadWeatherAndClimate}
              refreshLoading={weatherLoading}
              isOnline={isOnline}
            />
          )}

          {workspaceSection === 'info' && infoSubTab === 'soil' && (
            <SoilCropInfoView
              farm={farm}
              fields={farmFields}
              selectedField={selectedField}
              onSelectField={(id) => setSelectedFieldId(id)}
              bundle={agronomyBundle}
              areaLabel={fieldModel.fieldAreaLabel}
              disclosureMode={disclosureMode}
              onChangeDisclosureMode={setDisclosureMode}
              onInspectMetric={setInspectedMetric}
              onPatchField={onPatchField}
              onOpenSoilDrawer={() => openDrawer('soil')}
              onRefresh={loadWeatherAndClimate}
              refreshLoading={weatherLoading}
              isOnline={isOnline}
            />
          )}

          {workspaceSection === 'info' && infoSubTab === 'risks' && (
            <RisksAlertsView
              fields={farmFields}
              selectedField={selectedField}
              onSelectField={(id) => setSelectedFieldId(id)}
              bundle={agronomyBundle}
              observations={farmObservations}
              tasks={farmTasks}
              snapshots={farmSnapshots}
              eonetResult={eonetResult}
              areaLabel={fieldModel.fieldAreaLabel}
              disclosureMode={disclosureMode}
              onChangeDisclosureMode={setDisclosureMode}
              onInspectMetric={setInspectedMetric}
              onAddObservation={onAddObservation}
              onAddTask={onAddTask}
              onToggleTask={onToggleTask}
              onCreateFreshSnapshot={handleCreateFreshSnapshot}
              runningSnapshot={runningSnapshot}
              isOnline={isOnline}
              onOpenReportsDrawer={() => openDrawer('reports')}
              onRefresh={loadWeatherAndClimate}
              refreshLoading={weatherLoading}
            />
          )}

          {workspaceSection === 'advanced' && (
            <AdvancedAnalysisView
              farm={farm}
              selectedField={selectedField}
              fieldModel={fieldModel}
              snapshots={farmSnapshots}
              decisions={decisions}
              irrigationLogs={farmIrrigation}
              liveWeather={liveWeather}
              climateResult={climateResult}
              tempUnit={tempUnit}
              isOnline={isOnline}
              runningSnapshot={runningSnapshot}
              onCreateFreshSnapshot={handleCreateFreshSnapshot}
              onOpenDrawerTab={openDrawer}
              onOpenInMaps={onOpenInMaps}
              onRunDeepAnalysis={onRunDeepAnalysis}
            />
          )}

          {workspaceSection === 'settings' && (
            <FarmSettingsView
              farm={farm}
              onOpenRename={onOpenRename}
              onRunDeepAnalysis={onRunDeepAnalysis}
              onOpenDelete={onOpenDelete}
              onPatchFarm={onPatchFarm}
              onOpenDuplicate={onOpenDuplicate}
              onOpenExport={onOpenExport}
              onArchiveToggle={onArchiveToggle}
              onOpenInMaps={onOpenInMaps}
            />
          )}
        </div>
      </div>

      {/* Interactive Drill-Down Workspace Drawer (preserves all editing, maps, rotation journal & logs) */}
      {drawerOpen && (
        <div
          className="fs-drawer-backdrop !z-[65]"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="fs-drawer-shell relative w-full max-w-4xl h-full overflow-y-auto fs-thin-scroll flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Field and Farm Management Workspace"
          >
            {/* Drawer Header */}
            <div className="fs-modal-header sticky top-0 z-20 px-6 py-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-[#2DD4BF]">
                    {farm.name} · {fieldModel.fieldDisplayTitle}
                  </div>
                  <h2 className="text-xl font-bold text-[#072622] dark:text-[#ECF8F5] mt-0.5">
                    Field &amp; Farm Management Workspace
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close workspace drawer"
                  className="w-9 h-9 rounded-full flex items-center justify-center border border-teal-700/20 dark:border-teal-300/25 bg-white/70 dark:bg-white/[0.06] text-[#18463F] dark:text-[#C8E4DE] hover:bg-teal-500/15 cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 fs-thin-scroll">
                {DRAWER_TABS.map(({ id, label, Icon }) => {
                  const active = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onChangeTab(id)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                        active
                          ? 'bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white shadow-sm'
                          : 'border border-teal-700/15 dark:border-teal-300/20 bg-white/55 dark:bg-white/[0.04] text-[#18463F] dark:text-[#C8E4DE] hover:bg-teal-500/10'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-5 text-[13px] flex-1">
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {(farm.hasFieldOverlapWarning ||
                    farm.areaGapNote ||
                    farm.assessment.worstFieldReason ||
                    farm.assessment.freshnessState === 'stale') && (
                    <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 space-y-2 text-[13px] text-amber-900 dark:text-amber-200 leading-relaxed">
                      <div className="font-bold flex items-center gap-2 text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        Operational &amp; Spatial Advisories
                      </div>
                      {farm.assessment.worstFieldReason && (
                        <div>
                          · <strong>Priority Risk ({farm.assessment.worstFieldName || 'Field Monitor'}):</strong>{' '}
                          {farm.assessment.worstFieldReason}
                        </div>
                      )}
                      {farm.hasFieldOverlapWarning && farm.overlapWarningDetail && (
                        <div>
                          · <strong>Polygon Overlap:</strong> {farm.overlapWarningDetail}
                        </div>
                      )}
                      {farm.areaGapNote && (
                        <div>
                          · <strong>Area Reconciliation:</strong> {farm.areaGapNote}
                        </div>
                      )}
                      {farm.assessment.staleReasons.map((sr, i) => (
                        <div key={i}>· {sr}</div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                    <div className="fs-modal-subpanel p-4">
                      <div className="text-xs font-medium text-[#2B5E56] dark:text-[#92C2B8]">Suitability Score</div>
                      <div className="text-2xl font-bold text-[#072622] dark:text-[#ECF8F5] tabular-nums mt-1">
                        {farm.assessment.score !== null ? `${farm.assessment.score}/100` : 'Unassessed'}
                      </div>
                      <div className="text-xs text-[#2B5E56] dark:text-[#92C2B8] mt-1 tabular-nums">
                        {farm.assessment.completenessPct}% inputs logged
                      </div>
                    </div>
                    <div className="fs-modal-subpanel p-4">
                      <div className="text-xs font-medium text-[#2B5E56] dark:text-[#92C2B8]">Mapped Area</div>
                      <div className="text-2xl font-bold text-[#072622] dark:text-[#ECF8F5] tabular-nums mt-1">
                        {farm.mappedAreaHa > 0 ? formatArea(farm.mappedAreaHa, farm.areaUnit) : 'Unmapped'}
                      </div>
                      <div className="text-xs text-[#2B5E56] dark:text-[#92C2B8] mt-1 tabular-nums">
                        {farm.declaredAreaHa ? `Declared ${formatArea(farm.declaredAreaHa, farm.areaUnit)}` : 'No declared area'}
                      </div>
                    </div>
                    <div className="fs-modal-subpanel p-4">
                      <div className="text-xs font-medium text-[#2B5E56] dark:text-[#92C2B8]">Completeness</div>
                      <div className="text-2xl font-bold text-[#072622] dark:text-[#ECF8F5] tabular-nums mt-1">
                        {farm.assessment.completenessPct}%
                      </div>
                      <div className="text-xs text-[#2B5E56] dark:text-[#92C2B8] mt-1">
                        {formatRelativeDate(farm.assessment.assessedAt)}
                      </div>
                    </div>
                    <div className="fs-modal-subpanel p-4">
                      <div className="text-xs font-medium text-[#2B5E56] dark:text-[#92C2B8]">Active Plan</div>
                      <div className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5] truncate mt-2">
                        {farm.activePlan ? farm.activePlan.title : 'None selected'}
                      </div>
                    </div>
                  </div>

                  <div className="fs-modal-subpanel p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-bold text-[#072622] dark:text-[#ECF8F5]">Assessment Summary</h3>
                      <button
                        type="button"
                        disabled={!isOnline || runningSnapshot}
                        onClick={handleCreateFreshSnapshot}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-teal-700/20 dark:border-teal-300/25 bg-white/70 dark:bg-white/[0.06] text-xs font-semibold text-[#072622] dark:text-[#ECF8F5] hover:bg-teal-500/15 disabled:opacity-45 cursor-pointer transition-colors"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${runningSnapshot ? 'animate-spin' : ''}`} />
                        {runningSnapshot ? 'Refreshing…' : 'Save Snapshot'}
                      </button>
                    </div>
                    <p className="text-[13.5px] text-[#18463F] dark:text-[#C8E4DE] leading-relaxed">{farm.assessment.summary}</p>
                  </div>
                </div>
              )}

              {activeTab === 'fields' && (
                <div className="space-y-4">
                  <FieldBoundaryEditorMap
                    center={farm.centroid}
                    farmGeometry={farm.geometry}
                    fields={farmFields}
                    selectedFieldId={selectedField?.id ?? null}
                    areaUnit={farm.areaUnit}
                    onSelectField={(id) => setSelectedFieldId(id)}
                    onSavePolygon={async ({ geometry, areaHa, mode, editingFieldId, editReason }) => {
                      if (mode === 'edit' && editingFieldId) {
                        await onSaveFieldBoundary(editingFieldId, geometry, editReason);
                      } else {
                        setPendingNewFieldGeom({ geometry, areaHa });
                        setNewFieldName(`Field Block ${farmFields.length + 1}`);
                      }
                    }}
                  />

                  {pendingNewFieldGeom && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!newFieldName.trim()) return;
                        await onCreateField({
                          farmId: farm.id,
                          name: newFieldName.trim(),
                          cropId: newFieldCrop.toLowerCase(),
                          cropName: newFieldCrop.trim() || undefined,
                          status: 'Active',
                          geometry: pendingNewFieldGeom.geometry,
                        });
                        setPendingNewFieldGeom(null);
                      }}
                      className="rounded-xl border border-emerald-500/45 bg-emerald-500/10 p-4 flex flex-wrap items-end gap-3"
                    >
                      <div className="flex-1 min-w-[180px]">
                        <label className="block font-semibold text-[var(--text-primary)] mb-1">
                          Name newly drawn field ({formatArea(pendingNewFieldGeom.areaHa, farm.areaUnit)})
                        </label>
                        <input
                          type="text"
                          value={newFieldName}
                          onChange={(e) => setNewFieldName(e.target.value)}
                          required
                          className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                        />
                      </div>
                      <div className="w-40">
                        <label className="block font-semibold text-[var(--text-primary)] mb-1">Crop</label>
                        <input
                          type="text"
                          value={newFieldCrop}
                          onChange={(e) => setNewFieldCrop(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                        />
                      </div>
                      <button type="submit" className="px-3.5 py-2 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer">
                        Save Field
                      </button>
                      <button type="button" onClick={() => setPendingNewFieldGeom(null)} className="px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] cursor-pointer">
                        Discard
                      </button>
                    </form>
                  )}

                  {selectedField && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={resolveCropThumbnail(selectedField.cropId || selectedField.cropName)}
                          alt={selectedField.cropName || selectedField.name}
                          className="w-10 h-10 rounded-lg object-cover border border-[var(--border)]"
                        />
                        <div>
                          <h3 className="text-sm font-bold text-[var(--text-primary)]">{selectedField.name}</h3>
                          <div className="text-[var(--text-secondary)] tabular-nums">
                            {formatArea(selectedField.versions[0]?.netAreaHectares ?? 0, farm.areaUnit)} ·{' '}
                            {selectedField.versions[0]?.perimeterM ?? 0} m perimeter
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedField.status}
                          onChange={(e) => onPatchField(selectedField.id, { status: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                        >
                          {['Active', 'Planned', 'Fallow', 'Needs Review'].map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        {confirmDeleteFieldId === selectedField.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteField(selectedField.id);
                                setConfirmDeleteFieldId(null);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer"
                            >
                              Confirm Delete
                            </button>
                            <button type="button" onClick={() => setConfirmDeleteFieldId(null)} className="px-2 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteFieldId(selectedField.id)}
                            className="p-1.5 rounded-lg border border-[var(--border)] text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                            title="Delete field"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        All Fields ({farmFields.length})
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { id: 'all', label: 'All' },
                          { id: 'alerts', label: 'Alerts' },
                          { id: 'rotation_due', label: 'Rotation due' },
                          { id: 'missing_soil', label: 'Missing soil' },
                        ].map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setFieldTableFilter(f.id as typeof fieldTableFilter)}
                            className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                              fieldTableFilter === f.id
                                ? 'bg-[var(--accent)] text-white'
                                : 'border border-[var(--border)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      {filteredComparisonFields.map((fl) => (
                        <div
                          key={fl.id}
                          onClick={() => setSelectedFieldId(fl.id)}
                          className="px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-[var(--bg-elevated)]/40 cursor-pointer"
                        >
                          <div>
                            <div className="font-semibold text-[var(--text-primary)]">{fl.name}</div>
                            <div className="text-[var(--text-secondary)]">{fl.cropName || 'Unassigned'} · {fl.status}</div>
                          </div>
                          <div className="tabular-nums font-semibold text-[var(--text-primary)]">
                            {fl.versions[0] ? formatArea(fl.versions[0].netAreaHectares, farm.areaUnit) : 'Unmapped'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'rotation' && (
                <PlanDecisionJournal
                  farm={farm}
                  fields={farmFields}
                  decisions={decisions}
                  onRecordDecision={onRecordDecision}
                />
              )}

              {activeTab === 'soil' && (
                <form onSubmit={handleSaveSoil} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">Soil &amp; Land Parameters</h3>
                      <p className="text-[var(--text-secondary)]">Explicit unknown/estimated states preserved.</p>
                    </div>
                    {farm.centroid && (
                      <button
                        type="button"
                        disabled={!isOnline || demProbeLoading}
                        onClick={handleProbeTerrainSlope}
                        className="px-3 py-1.5 rounded-lg border border-[var(--border)] font-semibold text-[var(--text-primary)] disabled:opacity-45 cursor-pointer"
                      >
                        {demProbeLoading ? 'Sampling DEM…' : 'Sample SRTM Elevation & Slope'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">Soil texture</label>
                      <select
                        value={soilForm.texture}
                        onChange={(e) => setSoilForm((s) => ({ ...s, texture: e.target.value as SoilTexture }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                      >
                        {['Unknown', 'Sandy', 'Loamy sand', 'Sandy loam', 'Loam', 'Silt loam', 'Clay loam', 'Clay'].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">Drainage</label>
                      <select
                        value={soilForm.drainage}
                        onChange={(e) => setSoilForm((s) => ({ ...s, drainage: e.target.value as DrainageRate }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                      >
                        {['Unknown', 'Very slowly', 'Slowly', 'Moderately', 'Quickly', 'Very quickly'].map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">Organic matter (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="30"
                        value={soilForm.organicMatterPct ?? ''}
                        onChange={(e) =>
                          setSoilForm((s) => ({
                            ...s,
                            organicMatterPct: e.target.value === '' ? null : Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">Moisture basis</label>
                      <select
                        value={soilForm.moistureStatus}
                        onChange={(e) => {
                          const nextStatus = e.target.value as SoilMoistureStatus;
                          setSoilForm((s) => ({
                            ...s,
                            moistureStatus: nextStatus,
                            moisturePct: nextStatus === 'unknown' ? null : s.moisturePct,
                            moistureUnit: nextStatus === 'unknown' ? 'unspecified' : s.moistureUnit,
                            moistureDepth: nextStatus === 'unknown' ? '' : s.moistureDepth,
                            moistureMethod: nextStatus === 'unknown' ? '' : s.moistureMethod,
                            moistureDate: nextStatus === 'unknown' ? '' : s.moistureDate,
                          }));
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                      >
                        <option value="unknown">Unknown</option>
                        <option value="estimated">Estimated</option>
                        <option value="measured">Measured (Probe / Lab)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">
                        Moisture ({formatSoilMoistureUnitLabel(normalizeSoilMoistureUnit(soilForm.moistureUnit))})
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        disabled={soilForm.moistureStatus === 'unknown'}
                        value={soilForm.moisturePct ?? ''}
                        onChange={(e) =>
                          setSoilForm((s) => ({
                            ...s,
                            moisturePct: e.target.value === '' ? null : Number(e.target.value),
                          }))
                        }
                        placeholder={soilForm.moistureStatus === 'unknown' ? 'Unknown' : 'Enter reading'}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] disabled:opacity-45 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">Moisture unit / basis</label>
                      <select
                        disabled={soilForm.moistureStatus === 'unknown'}
                        value={normalizeSoilMoistureUnit(soilForm.moistureUnit)}
                        onChange={(e) =>
                          setSoilForm((s) => ({ ...s, moistureUnit: e.target.value as SoilMoistureUnit }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] disabled:opacity-45"
                      >
                        <option value="unspecified">Unspecified / Not sure</option>
                        <option value="volumetric_vwc">Volumetric (% VWC)</option>
                        <option value="gravimetric">Gravimetric (% dry weight)</option>
                        <option value="available_water_pct">% Available water capacity</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">Sampling depth</label>
                      <input
                        type="text"
                        disabled={soilForm.moistureStatus === 'unknown'}
                        value={soilForm.moistureDepth ?? ''}
                        onChange={(e) => setSoilForm((s) => ({ ...s, moistureDepth: e.target.value }))}
                        placeholder="e.g., 0–20 cm"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] disabled:opacity-45"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">Measurement method</label>
                      <input
                        type="text"
                        disabled={soilForm.moistureStatus === 'unknown'}
                        value={soilForm.moistureMethod ?? ''}
                        onChange={(e) => setSoilForm((s) => ({ ...s, moistureMethod: e.target.value }))}
                        placeholder="e.g., TDR probe, tensiometer"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] disabled:opacity-45"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">Moisture measurement date</label>
                      <input
                        type="date"
                        disabled={soilForm.moistureStatus === 'unknown'}
                        value={soilForm.moistureDate ?? ''}
                        onChange={(e) => setSoilForm((s) => ({ ...s, moistureDate: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] disabled:opacity-45 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">pH test status</label>
                      <select
                        value={soilForm.phStatus}
                        onChange={(e) => {
                          const nextPhStatus = e.target.value as SoilPhStatus;
                          setSoilForm((s) => ({
                            ...s,
                            phStatus: nextPhStatus,
                            phValue: nextPhStatus === 'not_tested' ? null : s.phValue,
                            phTestDate: nextPhStatus === 'not_tested' ? '' : s.phTestDate,
                          }));
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                      >
                        <option value="not_tested">Not tested</option>
                        <option value="tested">Lab tested</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">Soil pH (0–14)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="14"
                        disabled={soilForm.phStatus === 'not_tested'}
                        value={soilForm.phValue ?? ''}
                        onChange={(e) =>
                          setSoilForm((s) => ({
                            ...s,
                            phValue: e.target.value === '' ? null : Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] disabled:opacity-45 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">pH test date</label>
                      <input
                        type="date"
                        disabled={soilForm.phStatus === 'not_tested'}
                        value={soilForm.phTestDate ?? ''}
                        onChange={(e) => setSoilForm((s) => ({ ...s, phTestDate: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] disabled:opacity-45 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">Elevation / Slope</label>
                      <div className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 tabular-nums text-[var(--text-primary)]">
                        {soilForm.elevationM !== null ? `${Math.round(soilForm.elevationM)} m` : '—'} ·{' '}
                        {soilForm.slopePct !== null ? `${soilForm.slopePct.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                  </div>
                  {buildMoistureUnitAmbiguityNote(
                    soilForm.moistureStatus,
                    soilForm.moisturePct,
                    normalizeSoilMoistureUnit(soilForm.moistureUnit),
                    soilForm.moistureMethod ?? ''
                  ) && (
                    <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                      {buildMoistureUnitAmbiguityNote(
                        soilForm.moistureStatus,
                        soilForm.moisturePct,
                        normalizeSoilMoistureUnit(soilForm.moistureUnit),
                        soilForm.moistureMethod ?? ''
                      )}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button type="submit" disabled={savingSoil} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold cursor-pointer">
                      {savingSoil ? 'Saving…' : 'Save Soil & Land'}
                    </button>
                  </div>
                </form>
              )}

              {activeTab === 'water' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">Water Supply vs Estimated Demand</h3>
                      <ProvenanceText kind={waterBalance.status === 'insufficient' ? 'unavailable' : 'calculated'} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 tabular-nums">
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
                        <div className="text-[var(--text-secondary)]">Measured Daily Capacity</div>
                        <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                          {waterBalance.supplyM3Day !== null ? `${waterBalance.supplyM3Day} m³/day` : 'Not metered'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
                        <div className="text-[var(--text-secondary)]">Estimated Crop Demand</div>
                        <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                          {waterBalance.demandM3Day !== null ? `${waterBalance.demandM3Day} m³/day` : 'Insufficient data'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
                        <div className="text-[var(--text-secondary)]">Net Balance</div>
                        <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                          {waterBalance.deltaM3Day !== null
                            ? `${waterBalance.deltaM3Day > 0 ? '+' : ''}${waterBalance.deltaM3Day} m³/day (${waterBalance.coveragePct}%)`
                            : 'Unavailable'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleSaveWater} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-4">
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">Supply &amp; Irrigation Configuration</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block font-medium text-[var(--text-secondary)] mb-1">Primary source</label>
                        <select
                          value={waterForm.sources[0] || 'Unknown'}
                          onChange={(e) => setWaterForm((w) => ({ ...w, sources: [e.target.value as WaterSource] }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                        >
                          {['Unknown', 'Groundwater / Well', 'River / Stream', 'Reservoir', 'Canal', 'Rainwater collection', 'Recycled water', 'Other'].map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-medium text-[var(--text-secondary)] mb-1">Reliability</label>
                        <select
                          value={waterForm.reliability}
                          onChange={(e) => setWaterForm((w) => ({ ...w, reliability: e.target.value as WaterReliability }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                        >
                          {['Unknown', 'Always available', 'Usually available', 'Sometimes limited', 'Frequently limited', 'Highly unreliable'].map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-medium text-[var(--text-secondary)] mb-1">Daily capacity (m³/day)</label>
                        <input
                          type="number"
                          min="0"
                          value={waterForm.dailyCapacityM3 ?? ''}
                          onChange={(e) => setWaterForm((w) => ({ ...w, dailyCapacityKnown: Boolean(e.target.value), dailyCapacityM3: e.target.value ? Number(e.target.value) : null }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-[var(--text-secondary)] mb-1">Watering system</label>
                        <select
                          value={waterForm.wateringMethod}
                          onChange={(e) => setWaterForm((w) => ({ ...w, wateringMethod: e.target.value as WateringMethod }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                        >
                          <option value="">Unspecified</option>
                          <option value="Rain-fed agriculture">Rain-fed agriculture</option>
                          <option value="Artificial irrigation">Artificial irrigation</option>
                          <option value="Hybrid (rainfall and irrigation)">Hybrid (rainfall and irrigation)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-medium text-[var(--text-secondary)] mb-1">Irrigation method</label>
                        <select
                          value={waterForm.irrigationMethod}
                          onChange={(e) => setWaterForm((w) => ({ ...w, irrigationMethod: e.target.value as IrrigationMethod }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                        >
                          {['Unknown', 'Drip irrigation', 'Sprinkler irrigation', 'Flood irrigation', 'Furrow irrigation', 'Manual watering', 'Other'].map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-medium text-[var(--text-secondary)] mb-1">Water EC (dS/m)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={waterForm.ecDsM ?? ''}
                          onChange={(e) => setWaterForm((w) => ({ ...w, qualityTested: e.target.value ? 'Yes' : w.qualityTested, ecDsM: e.target.value ? Number(e.target.value) : null }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] tabular-nums"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button type="submit" disabled={savingWater} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold cursor-pointer">
                        {savingWater ? 'Saving…' : 'Save Water Settings'}
                      </button>
                    </div>
                  </form>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-3">
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">Logged Irrigation Runs ({farmIrrigation.length})</h4>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const vol = Number(irrVolume);
                        if (!Number.isFinite(vol) || vol <= 0) return;
                        await onAddIrrigation({
                          fieldId: selectedField?.id ?? null,
                          fieldName: selectedField?.name ?? 'Whole Farm',
                          date: irrDate,
                          volumeM3: vol,
                          method: waterForm.irrigationMethod || 'Drip irrigation',
                          notes: irrNotes.trim(),
                        });
                        setIrrVolume('');
                        setIrrNotes('');
                      }}
                      className="flex flex-wrap gap-2 items-end"
                    >
                      <div>
                        <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Date</label>
                        <input type="date" value={irrDate} onChange={(e) => setIrrDate(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Volume (m³)</label>
                        <input type="number" min="1" step="0.5" value={irrVolume} onChange={(e) => setIrrVolume(e.target.value)} placeholder="e.g., 225" required className="w-28 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] tabular-nums" />
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <label className="block text-[11px] text-[var(--text-secondary)] mb-1">Notes</label>
                        <input type="text" value={irrNotes} onChange={(e) => setIrrNotes(e.target.value)} placeholder="Block & pump duration…" className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]" />
                      </div>
                      <button type="submit" className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-white font-semibold cursor-pointer">
                        Log Run
                      </button>
                    </form>

                    {farmIrrigation.length > 0 && (
                      <div className="divide-y divide-[var(--border)] pt-2">
                        {farmIrrigation.map((l) => (
                          <div key={l.id} className="py-2 flex items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-[var(--text-primary)] tabular-nums">{l.date}</span>
                              <span className="text-[var(--text-secondary)]"> · {l.method} {l.notes ? `· ${l.notes}` : ''}</span>
                            </div>
                            <span className="font-semibold text-[var(--text-primary)] tabular-nums">{l.volumeM3} m³</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'weather' && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        Local Weather &amp; NASA POWER 21-Year Baseline
                      </h3>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        Open-Meteo NWP (~11 km cell) &amp; NASA POWER (~50 km / 0.5° cell).
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!isOnline || weatherLoading}
                      onClick={loadWeatherAndClimate}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] font-semibold text-[var(--text-primary)] disabled:opacity-45 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${weatherLoading ? 'animate-spin' : ''}`} />
                      {weatherLoading ? 'Fetching…' : 'Reload Feeds'}
                    </button>
                  </div>
                  {weatherError && (
                    <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-200">
                      {weatherError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
                      <div className="text-[var(--text-secondary)]">Current Temp</div>
                      <div className="text-lg font-bold text-[var(--text-primary)] mt-1">{liveWeather ? fmtTemp(liveWeather.tempC) : '—'}</div>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
                      <div className="text-[var(--text-secondary)]">10m Wind</div>
                      <div className="text-lg font-bold text-[var(--text-primary)] mt-1">{liveWeather ? fmtWind(liveWeather.windKmh) : '—'}</div>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
                      <div className="text-[var(--text-secondary)]">21-Yr High / Low</div>
                      <div className="text-lg font-bold text-[var(--text-primary)] mt-1">
                        {climateResult ? `${fmtTemp(climateResult.meanMaxC)} / ${fmtTemp(climateResult.meanMinC)}` : '—'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
                      <div className="text-[var(--text-secondary)]">Historical Rain</div>
                      <div className="text-lg font-bold text-[var(--text-primary)] mt-1">
                        {climateResult?.meanPrecipMm !== null && climateResult?.meanPrecipMm !== undefined ? `${climateResult.meanPrecipMm.toFixed(2)} mm/d` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'vegetation' && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
                  <div className="border-b border-[var(--border)] pb-3">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      Vegetation &amp; Satellite Coverage Honesty Disclosure
                    </h3>
                    <ProvenanceText kind="remote_sensing" detail="NASA GIBS MODIS 250 m / VIIRS 375 m" />
                  </div>
                  <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3.5 space-y-1.5 text-emerald-950 dark:text-emerald-200 leading-relaxed">
                    <div className="font-bold">Why plant-level field NDVI is not fabricated here</div>
                    <p>
                      Public <strong>NASA GIBS</strong> orbital true-color streams (MODIS Terra 250 m, Suomi NPP VIIRS 375 m) cover <strong>6.25 hectares</strong> per pixel. Parcel-level vegetation status remains transparently scoped until Sentinel-2 or field scouting observations are supplied.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'actions' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-3">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Scouting &amp; Lab Observations</h3>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!obsTitle.trim() || !obsDetail.trim()) return;
                        await onAddObservation({
                          fieldId: selectedField?.id ?? null,
                          fieldName: selectedField?.name ?? 'Whole Farm',
                          category: obsCategory,
                          title: obsTitle.trim(),
                          detail: obsDetail.trim(),
                          observedAt: new Date().toISOString().slice(0, 10),
                          provenance: obsProvenance,
                        });
                        setObsTitle('');
                        setObsDetail('');
                      }}
                      className="space-y-2.5 pb-3 border-b border-[var(--border)]"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <select value={obsCategory} onChange={(e) => setObsCategory(e.target.value as FarmObservationItem['category'])} className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]">
                          <option value="scouting">Field scouting</option>
                          <option value="soil_lab">Soil lab</option>
                          <option value="pest_disease">Pest / disease</option>
                          <option value="weather_impact">Weather impact</option>
                          <option value="management">Management action</option>
                        </select>
                        <select value={obsProvenance} onChange={(e) => setObsProvenance(e.target.value as 'Measured' | 'Reported')} className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]">
                          <option value="Reported">Farmer-reported</option>
                          <option value="Measured">Measured / Probe</option>
                        </select>
                      </div>
                      <input type="text" value={obsTitle} onChange={(e) => setObsTitle(e.target.value)} placeholder="Observation headline…" required className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]" />
                      <textarea rows={2} value={obsDetail} onChange={(e) => setObsDetail(e.target.value)} placeholder="Details…" required className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]" />
                      <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white font-semibold cursor-pointer">
                        <Plus className="w-3.5 h-3.5" />
                        Log Observation
                      </button>
                    </form>
                    <div className="space-y-2 max-h-72 overflow-y-auto fs-thin-scroll">
                      {farmObservations.map((ob) => (
                        <div key={ob.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/35 p-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[var(--text-primary)]">{ob.title}</span>
                            <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">{ob.observedAt}</span>
                          </div>
                          <p className="text-[var(--text-secondary)]">{ob.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-3">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Action Checklist</h3>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!taskTitle.trim()) return;
                        await onAddTask({
                          fieldId: selectedField?.id ?? null,
                          fieldName: selectedField?.name ?? 'Whole Farm',
                          title: taskTitle.trim(),
                          category: 'scouting',
                          dueDate: taskDue || null,
                          priority: taskPriority,
                        });
                        setTaskTitle('');
                        setTaskDue('');
                      }}
                      className="space-y-2 pb-3 border-b border-[var(--border)]"
                    >
                      <input type="text" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Add operational task…" required className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]" />
                      <div className="flex flex-wrap gap-2">
                        <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]" />
                        <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as 'high' | 'normal' | 'low')} className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]">
                          <option value="high">High priority</option>
                          <option value="normal">Normal priority</option>
                          <option value="low">Low priority</option>
                        </select>
                        <button type="submit" className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white font-semibold cursor-pointer">
                          Add Task
                        </button>
                      </div>
                    </form>
                    <div className="space-y-2 max-h-72 overflow-y-auto fs-thin-scroll">
                      {farmTasks.map((t) => (
                        <label key={t.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/35 cursor-pointer">
                          <input type="checkbox" checked={t.completed} onChange={(e) => onToggleTask(t.id, e.target.checked)} className="mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className={`font-semibold ${t.completed ? 'line-through text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>{t.title}</div>
                            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 tabular-nums">{t.priority} priority {t.dueDate ? `· Due ${t.dueDate}` : ''}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'reports' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        Risks &amp; Assessment Snapshots ({farmSnapshots.length})
                      </h3>
                      <p className="text-[var(--text-secondary)] mt-0.5">
                        Audit how weather, soil updates, and model versions shifted suitability over time.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!isOnline || runningSnapshot}
                      onClick={handleCreateFreshSnapshot}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold disabled:opacity-45 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${runningSnapshot ? 'animate-spin' : ''}`} />
                      {runningSnapshot ? 'Generating…' : 'Generate Fresh Snapshot'}
                    </button>
                  </div>

                  {farmSnapshots.length >= 2 && compareLeft && compareRight && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-1.5">
                          <GitCompare className="w-4 h-4 text-[var(--accent)]" />
                          Compare Two Reports
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select value={compareLeftId} onChange={(e) => setCompareLeftId(e.target.value)} className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]">
                            {farmSnapshots.map((s) => (
                              <option key={s.id} value={s.id}>{new Date(s.generatedAt).toLocaleDateString()} ({s.modelVersion})</option>
                            ))}
                          </select>
                          <span className="text-[var(--text-secondary)]">vs</span>
                          <select value={compareRightId} onChange={(e) => setCompareRightId(e.target.value)} className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]">
                            {farmSnapshots.map((s) => (
                              <option key={s.id} value={s.id}>{new Date(s.generatedAt).toLocaleDateString()} ({s.modelVersion})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 tabular-nums">
                        <div className="rounded-lg border border-[var(--border)] p-3">
                          <div className="text-[var(--text-secondary)]">Baseline Score</div>
                          <div className="text-base font-bold">{compareLeft.suitabilityScore ?? 'Unassessed'}</div>
                        </div>
                        <div className="rounded-lg border border-[var(--border)] p-3">
                          <div className="text-[var(--text-secondary)]">Comparison Score</div>
                          <div className="text-base font-bold">{compareRight.suitabilityScore ?? 'Unassessed'}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {farmSnapshots.map((s) => (
                    <div key={s.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-[var(--text-primary)] tabular-nums">{new Date(s.generatedAt).toLocaleString()}</span>
                          <span className="text-[var(--text-secondary)]"> · {s.triggerReason}</span>
                        </div>
                        <div className="font-bold text-[var(--text-primary)] tabular-nums">
                          {s.suitabilityScore !== null ? `Score ${s.suitabilityScore}/100` : 'Unassessed'}
                        </div>
                      </div>
                      <p className="text-[var(--text-secondary)]">{s.weatherWindowSummary}</p>
                      <p className="text-xs text-[var(--text-secondary)] tabular-nums">
                        {formatSnapshotHistoricalContext(s)}
                      </p>
                      {s.recommendations.map((r, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[var(--text-primary)]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Farm Configuration &amp; Units</h3>
                        <p className="text-[var(--text-secondary)]">Changes synchronize across Portfolio, Maps, and Analysis.</p>
                      </div>
                      <button type="button" onClick={() => onOpenRename(farm)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer">
                        <Edit3 className="w-3.5 h-3.5" />
                        Rename Farm
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-medium text-[var(--text-secondary)] mb-1">Region label</label>
                        <input type="text" value={settingsRegion} onChange={(e) => setSettingsRegion(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]" />
                      </div>
                      <div>
                        <label className="block font-medium text-[var(--text-secondary)] mb-1">Timezone</label>
                        <input type="text" value={settingsTz} onChange={(e) => setSettingsTz(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]" />
                      </div>
                      <div>
                        <label className="block font-medium text-[var(--text-secondary)] mb-1">Declared whole-farm area (ha)</label>
                        <input type="number" step="0.1" value={settingsDeclaredArea} onChange={(e) => setSettingsDeclaredArea(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] tabular-nums" />
                      </div>
                      <div>
                        <label className="block font-medium text-[var(--text-secondary)] mb-1">Preferred area display unit</label>
                        <select value={settingsAreaUnit} onChange={(e) => setSettingsAreaUnit(e.target.value as AreaUnit)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]">
                          <option value="hectares">Hectares (ha)</option>
                          <option value="acres">Acres (ac)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block font-medium text-[var(--text-secondary)] mb-1">Notes</label>
                      <textarea rows={2} value={settingsNotes} onChange={(e) => setSettingsNotes(e.target.value)} className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]" />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          onPatchFarm(
                            farm,
                            {
                              regionLabel: settingsRegion.trim(),
                              timezone: settingsTz.trim(),
                              declaredAreaHa: settingsDeclaredArea ? Number(settingsDeclaredArea) : null,
                              areaUnit: settingsAreaUnit,
                              notes: settingsNotes.trim(),
                            },
                            `Updated Settings for ${farm.name}`
                          )
                        }
                        className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold hover:brightness-110 cursor-pointer"
                      >
                        Save Settings
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-700 dark:text-emerald-300">
                      <Lock className="w-4 h-4" />
                      Privacy &amp; Data Isolation
                    </div>
                    <div className="pt-2 border-t border-[var(--border)] flex flex-wrap gap-2.5">
                      <button type="button" onClick={() => onOpenDuplicate(farm)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer">
                        <Copy className="w-3.5 h-3.5" />
                        Duplicate Farm…
                      </button>
                      <button type="button" onClick={() => onOpenExport(farm)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer">
                        <Download className="w-3.5 h-3.5" />
                        Export JSON / GeoJSON
                      </button>
                      <button type="button" onClick={() => onArchiveToggle(farm)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer">
                        {farm.archivedAt ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                        {farm.archivedAt ? 'Unarchive Farm' : 'Archive Farm'}
                      </button>
                      <button type="button" onClick={() => onOpenDelete(farm)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-500/40 bg-rose-500/10 font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Farm Permanently…
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inspectable Metric Calculation & Evidence Drawer (§30) */}
      <MetricInspectionDrawer
        metric={inspectedMetric}
        onClose={() => setInspectedMetric(null)}
      />
    </div>
  );
};
