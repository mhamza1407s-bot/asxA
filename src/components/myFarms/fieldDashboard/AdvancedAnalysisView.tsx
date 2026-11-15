import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  CloudRain,
  Compass,
  Droplets,
  GitCompare,
  Layers,
  Map as MapIcon,
  RefreshCw,
  Satellite,
  Sprout,
  TrendingUp,
} from 'lucide-react';
import {
  IrrigationLogItem,
  MyFarmRecord,
  MyFarmsSubTab,
  PlanDecisionEvent,
  PortfolioFieldRecord,
  SavedFarmSnapshot,
} from '../../../types/myFarms';
import { PowerClimateResult } from '../../../types';
import { LiveWeatherReading } from '../../../services/weather';
import {
  computeWaterBalance,
  formatArea,
  formatRelativeDate,
  generateRotationCandidatesForFarm,
} from '../../../lib/myFarmsEngine';
import { FieldIntelligenceViewModel } from './fieldDashboardModel';
import { formatSoilMoistureUnitLabel } from '../../../lib/soilProvenance';

interface AdvancedAnalysisViewProps {
  farm: MyFarmRecord;
  selectedField: PortfolioFieldRecord | null;
  fieldModel: FieldIntelligenceViewModel;
  snapshots: SavedFarmSnapshot[];
  decisions: PlanDecisionEvent[];
  irrigationLogs: IrrigationLogItem[];
  liveWeather: LiveWeatherReading | null;
  climateResult: PowerClimateResult | null;
  tempUnit: 'C' | 'F';
  isOnline: boolean;
  runningSnapshot: boolean;
  onCreateFreshSnapshot: () => Promise<void>;
  onOpenDrawerTab: (tab: MyFarmsSubTab) => void;
  onOpenInMaps: (farm: MyFarmRecord) => void;
  onRunDeepAnalysis: (farm: MyFarmRecord) => void;
}

export const AdvancedAnalysisView: React.FC<AdvancedAnalysisViewProps> = ({
  farm,
  selectedField,
  fieldModel,
  snapshots,
  decisions,
  irrigationLogs,
  liveWeather,
  climateResult,
  tempUnit,
  isOnline,
  runningSnapshot,
  onCreateFreshSnapshot,
  onOpenDrawerTab,
  onOpenInMaps,
  onRunDeepAnalysis,
}) => {
  const waterBalance = useMemo(() => computeWaterBalance(farm), [farm]);
  const rotationCandidates = useMemo(() => generateRotationCandidatesForFarm(farm), [farm]);
  const topCandidate = rotationCandidates[0] ?? null;

  // Chronological order for trend plotting (oldest -> newest)
  const chronologicalSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt)),
    [snapshots]
  );

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [compareLeftId, setCompareLeftId] = useState<string>(
    snapshots[1]?.id ?? snapshots[0]?.id ?? ''
  );
  const [compareRightId, setCompareRightId] = useState<string>(snapshots[0]?.id ?? '');

  const compareLeft =
    snapshots.find((s) => s.id === compareLeftId) ?? snapshots[1] ?? snapshots[0] ?? null;
  const compareRight = snapshots.find((s) => s.id === compareRightId) ?? snapshots[0] ?? null;

  const fmtTemp = (c: number | null | undefined) => {
    if (c === null || c === undefined || !Number.isFinite(c)) return '—';
    return tempUnit === 'F' ? `${Math.round((c * 9) / 5 + 32)} °F` : `${c.toFixed(1)} °C`;
  };

  const totalIrrigationM3 = useMemo(
    () => irrigationLogs.reduce((acc, item) => acc + (Number(item.volumeM3) || 0), 0),
    [irrigationLogs]
  );

  const farmDecisions = useMemo(
    () =>
      decisions
        .filter((d) => d.farmId === farm.id)
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
    [decisions, farm.id]
  );

  // SVG chart coordinate builder for chronological snapshots
  const chartModel = useMemo(() => {
    if (chronologicalSnapshots.length === 0) return null;
    const width = 680;
    const height = 210;
    const padX = 40;
    const padY = 24;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const count = chronologicalSnapshots.length;

    const points = chronologicalSnapshots.map((s, i) => {
      const x = count === 1 ? padX + innerW / 2 : padX + (i / (count - 1)) * innerW;
      const scoreVal = s.suitabilityScore;
      const moistureVal = s.keyMetrics?.soilMoisturePct ?? null;
      const yScore =
        scoreVal !== null ? padY + innerH - (Math.max(0, Math.min(100, scoreVal)) / 100) * innerH : null;
      const yMoisture =
        moistureVal !== null
          ? padY + innerH - (Math.max(0, Math.min(100, moistureVal)) / 100) * innerH
          : null;
      return {
        snapshot: s,
        x,
        yScore,
        yMoisture,
        scoreVal,
        moistureVal,
      };
    });

    const scorePts = points.filter((p): p is typeof p & { yScore: number } => p.yScore !== null);
    const moisturePts = points.filter(
      (p): p is typeof p & { yMoisture: number } => p.yMoisture !== null
    );

    const scorePath =
      scorePts.length >= 2
        ? scorePts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yScore.toFixed(1)}`).join(' ')
        : '';
    const scoreAreaPath =
      scorePts.length >= 2
        ? `${scorePath} L ${scorePts[scorePts.length - 1].x.toFixed(1)} ${(padY + innerH).toFixed(1)} L ${scorePts[0].x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`
        : '';
    const moisturePath =
      moisturePts.length >= 2
        ? moisturePts
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yMoisture.toFixed(1)}`)
            .join(' ')
        : '';

    return {
      width,
      height,
      padX,
      padY,
      innerH,
      points,
      scorePath,
      scoreAreaPath,
      moisturePath,
    };
  }, [chronologicalSnapshots]);

  const activePoint =
    chartModel && hoveredIdx !== null
      ? chartModel.points[hoveredIdx] ?? null
      : chartModel
        ? chartModel.points[chartModel.points.length - 1] ?? null
        : null;

  const diagnosticFactors = [
    {
      label: 'Soil Moisture Reserve',
      valueLabel:
        fieldModel.water.soilMoisturePct !== null
          ? `${fieldModel.water.soilMoisturePct}% (${
              fieldModel.water.isVwcCompatibleForBalance
                ? '% VWC'
                : formatSoilMoistureUnitLabel(fieldModel.water.soilMoistureUnit)
            }) · ${fieldModel.water.moistureProvenanceLabel}`
          : fieldModel.water.moistureProvenanceLabel,
      pct: fieldModel.water.soilMoisturePct ?? 0,
      tone:
        fieldModel.water.soilMoisturePct === null
          ? 'from-slate-400 to-slate-500'
          : 'from-[#38BFEF] to-[#0D9488]',
    },
    {
      label: 'Data Completeness',
      valueLabel: `${farm.assessment.completenessPct}% inputs logged`,
      pct: farm.assessment.completenessPct,
      tone: 'from-[#2DD4BF] to-[#0F766E]',
    },
    {
      label: 'Water Supply Coverage',
      valueLabel:
        waterBalance.coveragePct !== null
          ? `${waterBalance.coveragePct}% (${waterBalance.supplyM3Day} / ${waterBalance.demandM3Day} m³/d)`
          : farm.water.reliability || 'Not metered',
      pct: waterBalance.coveragePct !== null ? Math.min(100, waterBalance.coveragePct) : 35,
      tone:
        waterBalance.status === 'deficit'
          ? 'from-amber-400 to-rose-500'
          : 'from-[#2DD4BF] to-[#0D9488]',
    },
    {
      label: 'Canopy Lifecycle Progress',
      valueLabel: `${fieldModel.growthProgressPct}% (${fieldModel.growthStage})`,
      pct: fieldModel.growthProgressPct,
      tone: 'from-[#5EEAD4] to-[#14B89A]',
    },
  ];

  const hasAdvisories = Boolean(
    farm.hasFieldOverlapWarning ||
      farm.areaGapNote ||
      farm.assessment.worstFieldReason ||
      farm.assessment.freshnessState === 'stale'
  );

  return (
    <div className="space-y-4 xl:space-y-5">
      {/* Top KPI Summary Strip — matches My Farms & Home glassmorphism */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="fs-dash-panel !rounded-[24px] p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#1B4D46] dark:text-[#96C7BE]">
            <span>Suitability Score</span>
            <Activity className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-[#072622] dark:text-[#ECF8F5] tabular-nums">
            {farm.assessment.score !== null ? `${farm.assessment.score}/100` : 'Unassessed'}
          </div>
          <div className="text-xs text-[#2B5E56] dark:text-[#8EB8B0] tabular-nums">
            {farm.assessment.completenessPct}% inputs logged ·{' '}
            {farm.assessment.score !== null ? 'Suitability assessed' : 'Required inputs missing'}
          </div>
        </div>

        <div className="fs-dash-panel !rounded-[24px] p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#1B4D46] dark:text-[#96C7BE]">
            <span>Water Balance</span>
            <Droplets className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-[#072622] dark:text-[#ECF8F5] tabular-nums">
            {waterBalance.coveragePct !== null
              ? `${waterBalance.coveragePct}%`
              : farm.water.wateringMethod === 'Rain-fed agriculture'
                ? 'Rain-fed'
                : 'Unmetered'}
          </div>
          <div className="text-xs text-[#2B5E56] dark:text-[#8EB8B0] tabular-nums">
            {waterBalance.supplyM3Day !== null && waterBalance.demandM3Day !== null
              ? `${waterBalance.supplyM3Day} m³/d supply · ${waterBalance.demandM3Day} m³/d demand`
              : `${farm.water.reliability || 'Reliability unspecified'}`}
          </div>
        </div>

        <div className="fs-dash-panel !rounded-[24px] p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#1B4D46] dark:text-[#96C7BE]">
            <span>{fieldModel.fieldCode} Soil &amp; Crop</span>
            <Sprout className="w-4 h-4 text-[#0D9488] dark:text-[#34D399]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-[#072622] dark:text-[#ECF8F5] tabular-nums">
            {fieldModel.soil.texture} · pH {fieldModel.soil.phLabel}
          </div>
          <div className="text-xs text-[#2B5E56] dark:text-[#8EB8B0] tabular-nums">
            Kc {fieldModel.soil.kc} ·{' '}
            {fieldModel.soil.tawMm !== null ? `TAW ${fieldModel.soil.tawMm} mm` : 'TAW Unavailable'} ·{' '}
            {fieldModel.areaHa.toFixed(1)} ha
          </div>
        </div>

        <div className="fs-dash-panel !rounded-[24px] p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#1B4D46] dark:text-[#96C7BE]">
            <span>21-Yr Climate Window</span>
            <CloudRain className="w-4 h-4 text-[#0F766E] dark:text-[#5EEAD4]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-[#072622] dark:text-[#ECF8F5] tabular-nums">
            {climateResult && climateResult.meanMaxC !== null && climateResult.meanMinC !== null
              ? `${fmtTemp(climateResult.meanMaxC)} / ${fmtTemp(climateResult.meanMinC)}`
              : liveWeather
                ? fmtTemp(liveWeather.tempC)
                : 'Unavailable'}
          </div>
          <div className="text-xs text-[#2B5E56] dark:text-[#8EB8B0] tabular-nums">
            {climateResult?.meanPrecipMm !== null && climateResult?.meanPrecipMm !== undefined
              ? `${climateResult.meanPrecipMm.toFixed(2)} mm/d NASA POWER mean`
              : farm.centroid
                ? 'Open-Meteo & NASA POWER ready'
                : 'Add farm coordinates'}
          </div>
        </div>
      </div>

      {/* SECTION 1: DEEP ANALYSIS */}
      <div className="grid grid-cols-1 xl:grid-cols-[58%_42%] gap-4 xl:gap-5">
        {/* Left Panel: Deep Agronomic Factor Breakdown & Rotation Fit */}
        <section className="fs-dash-panel !rounded-[28px] p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#072622]/10 dark:border-white/10">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
                Deep Analysis · {selectedField?.name ?? fieldModel.fieldCode}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-[#072622] dark:text-[#ECF8F5] mt-0.5">
                Agronomic Suitability &amp; Rotation Fit
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!isOnline || runningSnapshot}
                onClick={onCreateFreshSnapshot}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#0F766E]/35 dark:border-[#2DD4BF]/40 bg-white/55 dark:bg-[#06322D]/60 text-xs font-semibold text-[#072622] dark:text-[#DFF4EF] hover:bg-white/80 dark:hover:bg-[#09433C]/80 disabled:opacity-45 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${runningSnapshot ? 'animate-spin' : ''}`} />
                {runningSnapshot ? 'Sampling…' : 'New Snapshot'}
              </button>
              <button
                type="button"
                onClick={() => onRunDeepAnalysis(farm)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#2DD4BF] to-[#0D9488] text-[#031F1C] text-xs font-bold shadow-sm hover:brightness-105 transition-all cursor-pointer whitespace-nowrap"
              >
                <span>Open Full Analysis</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Real Factor Bars */}
          <div className="space-y-3.5">
            {diagnosticFactors.map((factor) => (
              <div key={factor.label} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#072622] dark:text-[#DFF4EF]">
                    {factor.label}
                  </span>
                  <span className="font-medium text-[#1B4D46] dark:text-[#96C7BE] tabular-nums">
                    {factor.valueLabel}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-[#072622]/10 dark:bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${factor.tone} transition-all duration-500`}
                    style={{
                      width: `${factor.pct <= 0 ? 0 : Math.max(4, Math.min(100, factor.pct))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Rotation Sequence Intelligence */}
          <div className="fs-dash-field-item !rounded-[20px] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sprout className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF]" />
                <span className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5]">
                  {farm.activePlan ? `Active Plan: ${farm.activePlan.title}` : 'Recommended Rotation Sequence'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpenDrawerTab('rotation')}
                className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer whitespace-nowrap"
              >
                Compare Plans →
              </button>
            </div>

            {topCandidate && (
              <>
                <p className="text-xs text-[#1B4D46] dark:text-[#B8DCD4] leading-relaxed">
                  {topCandidate.title} · {topCandidate.primaryBenefit} · Est. seasonal water{' '}
                  <span className="font-semibold tabular-nums">
                    {topCandidate.waterDemandMmEstimate} mm
                  </span>{' '}
                  ({topCandidate.soilImpactLabel}).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {topCandidate.steps.map((step) => (
                    <div
                      key={step.cycleLabel}
                      className="rounded-xl border border-[#072622]/10 dark:border-white/12 bg-white/45 dark:bg-[#042420]/55 px-3 py-2.5"
                    >
                      <div className="text-[11px] font-medium text-[#2B5E56] dark:text-[#8EB8B0]">
                        {step.cycleLabel}
                      </div>
                      <div className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5] mt-0.5">
                        {step.cropName}
                      </div>
                      <div className="text-[11px] text-[#1B4D46] dark:text-[#A5CEC6] mt-0.5">
                        {step.waterNeedBand} water demand
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Right Panel: Advisories, Terrain & Satellite Context */}
        <section className="fs-dash-panel !rounded-[28px] p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#072622]/10 dark:border-white/10">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
                  Diagnostics &amp; Context
                </div>
                <h2 className="text-lg font-bold text-[#072622] dark:text-[#ECF8F5] mt-0.5">
                  Spatial, Soil &amp; Satellite Audit
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onOpenInMaps(farm)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#072622]/15 dark:border-white/15 bg-white/45 dark:bg-[#052D28]/60 text-xs font-semibold text-[#072622] dark:text-[#DFF4EF] hover:bg-white/75 dark:hover:bg-[#093D37]/80 transition-colors cursor-pointer whitespace-nowrap"
              >
                <MapIcon className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
                Maps
              </button>
            </div>

            {/* Operational Advisories */}
            {hasAdvisories ? (
              <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3.5 space-y-1.5 text-xs text-amber-950 dark:text-amber-200">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Active Advisories
                </div>
                {farm.assessment.worstFieldReason && (
                  <div>
                    · <strong>{farm.assessment.worstFieldName || 'Priority Block'}:</strong>{' '}
                    {farm.assessment.worstFieldReason}
                  </div>
                )}
                {farm.hasFieldOverlapWarning && farm.overlapWarningDetail && (
                  <div>· {farm.overlapWarningDetail}</div>
                )}
                {farm.areaGapNote && <div>· {farm.areaGapNote}</div>}
                {farm.assessment.staleReasons.map((sr, i) => (
                  <div key={i}>· {sr}</div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-3.5 flex items-start gap-2.5 text-xs text-[#08332E] dark:text-[#A7F3D0]">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-teal-600 dark:text-[#2DD4BF]" />
                <div>
                  <div className="font-bold">All Spatial &amp; Moisture Checks Nominal</div>
                  <p className="opacity-85 mt-0.5">
                    No polygon overlaps, boundary gaps, or stale assessment flags detected on{' '}
                    {farm.name}.
                  </p>
                </div>
              </div>
            )}

            {/* Soil, Terrain & Boundary Summary Grid */}
            <div className="grid grid-cols-2 gap-2.5 text-xs tabular-nums">
              <div className="rounded-xl border border-[#072622]/10 dark:border-white/10 bg-white/40 dark:bg-[#042420]/55 p-3">
                <div className="text-[#2B5E56] dark:text-[#8EB8B0] flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5" />
                  Elevation &amp; Slope
                </div>
                <div className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5] mt-1">
                  {farm.soil.elevationM !== null ? `${Math.round(farm.soil.elevationM)} m` : '—'} ·{' '}
                  {farm.soil.slopePct !== null ? `${farm.soil.slopePct.toFixed(1)}%` : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-[#072622]/10 dark:border-white/10 bg-white/40 dark:bg-[#042420]/55 p-3">
                <div className="text-[#2B5E56] dark:text-[#8EB8B0] flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  Mapped Area
                </div>
                <div className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5] mt-1">
                  {farm.mappedAreaHa > 0 ? formatArea(farm.mappedAreaHa, farm.areaUnit) : 'Unmapped'}
                </div>
              </div>
            </div>

            {/* Latest Snapshot Recommendations */}
            {snapshots[0]?.recommendations && snapshots[0].recommendations.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#1B4D46] dark:text-[#96C7BE]">
                  Latest Snapshot Recommendations
                </div>
                <ul className="space-y-1.5 text-xs text-[#072622] dark:text-[#D5ECE6]">
                  {snapshots[0].recommendations.slice(0, 3).map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#2DD4BF] shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Satellite Resolution Honesty Note */}
          <div className="rounded-2xl border border-[#0F766E]/25 dark:border-[#2DD4BF]/25 bg-[#14B89A]/8 p-3.5 flex items-start gap-2.5 text-xs text-[#072622] dark:text-[#CCE8E1]">
            <Satellite className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">Satellite &amp; Remote Sensing Coverage</div>
              <p className="text-[11.5px] leading-relaxed text-[#1B4D46] dark:text-[#96C7BE]">
                NASA GIBS MODIS (250 m / 6.25 ha pixel) and VIIRS (375 m) provide regional cloud &amp;
                surface context; parcel-level scouting and soil lab records govern field alerts.
              </p>
              <button
                type="button"
                onClick={() => onOpenDrawerTab('soil')}
                className="text-[11.5px] font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
              >
                Update Soil &amp; Terrain Probe →
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* SECTION 2: HISTORICAL TRENDS */}
      <section className="fs-dash-panel !rounded-[28px] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#072622]/10 dark:border-white/10">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
              Historical Trends
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#072622] dark:text-[#ECF8F5] mt-0.5 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#0F766E] dark:text-[#2DD4BF]" />
              Suitability, Soil Moisture &amp; Irrigation Trajectory
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-[#1B4D46] dark:text-[#96C7BE]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E] dark:bg-[#2DD4BF]" />
              Suitability Score (/100)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] dark:bg-[#5EEAD4]" />
              Recorded Soil Moisture (%)
            </span>
          </div>
        </div>

        {/* Multi-Metric SVG Chart or Empty / Single-Snapshot State */}
        {!chartModel || chronologicalSnapshots.length === 0 ? (
          <div className="fs-chart-grid rounded-2xl border border-[#072622]/12 dark:border-white/12 p-8 text-center space-y-3">
            <div className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5]">
              No Historical Snapshots Recorded Yet
            </div>
            <p className="text-xs text-[#1B4D46] dark:text-[#96C7BE] max-w-md mx-auto">
              Generate snapshots over the season to track how weather shifts, soil lab updates, and
              irrigation logs alter field suitability over time.
            </p>
            <button
              type="button"
              disabled={!isOnline || runningSnapshot}
              onClick={onCreateFreshSnapshot}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#2DD4BF] to-[#0D9488] text-[#031F1C] text-xs font-bold disabled:opacity-45 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${runningSnapshot ? 'animate-spin' : ''}`} />
              {runningSnapshot ? 'Generating…' : 'Generate First Snapshot'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-stretch">
            <div className="fs-chart-grid relative rounded-2xl border border-[#072622]/12 dark:border-white/12 p-4">
              <svg
                viewBox={`0 0 ${chartModel.width} ${chartModel.height}`}
                className="w-full h-[210px] overflow-visible"
                role="img"
                aria-label="Suitability and soil moisture historical trend chart"
              >
                <defs>
                  <linearGradient id="fsTrendScoreFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {[0, 25, 50, 75, 100].map((tick) => {
                  const y =
                    chartModel.padY + chartModel.innerH - (tick / 100) * chartModel.innerH;
                  return (
                    <g key={tick}>
                      <line
                        x1={chartModel.padX}
                        y1={y}
                        x2={chartModel.width - chartModel.padX}
                        y2={y}
                        stroke="currentColor"
                        className="text-[#072622]/12 dark:text-white/12"
                        strokeDasharray="3 4"
                      />
                      <text
                        x={chartModel.padX - 8}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-[#2B5E56] dark:fill-[#8EB8B0] text-[10px] tabular-nums"
                      >
                        {tick}
                      </text>
                    </g>
                  );
                })}

                {chartModel.scoreAreaPath && (
                  <path d={chartModel.scoreAreaPath} fill="url(#fsTrendScoreFill)" />
                )}
                {chartModel.scorePath && (
                  <path
                    d={chartModel.scorePath}
                    fill="none"
                    stroke="#14B89A"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {chartModel.moisturePath && (
                  <path
                    d={chartModel.moisturePath}
                    fill="none"
                    stroke="#5EEAD4"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {chartModel.points.map((pt, idx) => (
                  <g
                    key={pt.snapshot.id}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => setHoveredIdx(idx)}
                  >
                    {pt.yScore !== null && (
                      <circle
                        cx={pt.x}
                        cy={pt.yScore}
                        r={hoveredIdx === idx ? 6 : 4.5}
                        fill="#2DD4BF"
                        stroke="#031F1C"
                        strokeWidth="1.5"
                      />
                    )}
                    {pt.yMoisture !== null && (
                      <circle
                        cx={pt.x}
                        cy={pt.yMoisture}
                        r={hoveredIdx === idx ? 5.5 : 4}
                        fill="#5EEAD4"
                        stroke="#031F1C"
                        strokeWidth="1.5"
                      />
                    )}
                    <text
                      x={pt.x}
                      y={chartModel.height - 4}
                      textAnchor="middle"
                      className="fill-[#2B5E56] dark:fill-[#96C7BE] text-[10px] tabular-nums"
                    >
                      {new Date(pt.snapshot.generatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </text>
                  </g>
                ))}
              </svg>

              {chronologicalSnapshots.length === 1 && (
                <div className="mt-2 text-center text-[11px] text-[#2B5E56] dark:text-[#96C7BE]">
                  1 baseline snapshot recorded — run another snapshot later to plot a multi-point trajectory.
                </div>
              )}
            </div>

            {/* Active / Hovered Point Detail Card */}
            <div className="fs-dash-field-item !rounded-[20px] p-4 flex flex-col justify-between gap-3">
              {activePoint ? (
                <>
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF] flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Selected Point
                    </div>
                    <div className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5] tabular-nums">
                      {new Date(activePoint.snapshot.generatedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="text-[11.5px] text-[#2B5E56] dark:text-[#96C7BE]">
                      {activePoint.snapshot.triggerReason}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs tabular-nums">
                    <div className="rounded-xl border border-[#072622]/10 dark:border-white/10 bg-white/45 dark:bg-[#042420]/60 p-2.5">
                      <div className="text-[11px] text-[#2B5E56] dark:text-[#8EB8B0]">Score</div>
                      <div className="text-base font-bold text-[#072622] dark:text-[#ECF8F5]">
                        {activePoint.scoreVal !== null ? `${activePoint.scoreVal}/100` : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#072622]/10 dark:border-white/10 bg-white/45 dark:bg-[#042420]/60 p-2.5">
                      <div className="text-[11px] text-[#2B5E56] dark:text-[#8EB8B0]">Moisture</div>
                      <div className="text-base font-bold text-[#072622] dark:text-[#ECF8F5]">
                        {activePoint.moistureVal !== null ? `${activePoint.moistureVal}%` : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#072622]/10 dark:border-white/10 bg-white/45 dark:bg-[#042420]/60 p-2.5">
                      <div className="text-[11px] text-[#2B5E56] dark:text-[#8EB8B0]">Mean Temp</div>
                      <div className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5]">
                        {fmtTemp(activePoint.snapshot.keyMetrics?.meanTempC)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#072622]/10 dark:border-white/10 bg-white/45 dark:bg-[#042420]/60 p-2.5">
                      <div className="text-[11px] text-[#2B5E56] dark:text-[#8EB8B0]">Precip</div>
                      <div className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5]">
                        {activePoint.snapshot.keyMetrics?.precipMmDay !== null &&
                        activePoint.snapshot.keyMetrics?.precipMmDay !== undefined
                          ? `${activePoint.snapshot.keyMetrics.precipMmDay.toFixed(1)} mm/d`
                          : '—'}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Snapshot Diff Comparator + Irrigation & Decision Logs */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Left: Snapshot Comparator */}
          <div className="fs-dash-field-item !rounded-[20px] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-bold text-[#072622] dark:text-[#ECF8F5]">
                <GitCompare className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
                Compare Saved Snapshots
              </div>
              {snapshots.length >= 2 && compareLeft && compareRight && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <select
                    value={compareLeft.id}
                    onChange={(e) => setCompareLeftId(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-[#072622]/15 dark:border-white/15 bg-white/70 dark:bg-[#042420] text-[#072622] dark:text-[#DFF4EF]"
                  >
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.generatedAt).toLocaleDateString()} ({s.modelVersion})
                      </option>
                    ))}
                  </select>
                  <span className="text-[#2B5E56] dark:text-[#8EB8B0]">vs</span>
                  <select
                    value={compareRight.id}
                    onChange={(e) => setCompareRightId(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-[#072622]/15 dark:border-white/15 bg-white/70 dark:bg-[#042420] text-[#072622] dark:text-[#DFF4EF]"
                  >
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.generatedAt).toLocaleDateString()} ({s.modelVersion})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {snapshots.length >= 2 && compareLeft && compareRight ? (
              <div className="grid grid-cols-3 gap-2.5 text-xs tabular-nums">
                <div className="rounded-xl border border-[#072622]/10 dark:border-white/10 bg-white/45 dark:bg-[#042420]/60 p-3">
                  <div className="text-[#2B5E56] dark:text-[#8EB8B0]">Baseline</div>
                  <div className="text-lg font-bold text-[#072622] dark:text-[#ECF8F5] mt-0.5">
                    {compareLeft.suitabilityScore ?? '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-[#072622]/10 dark:border-white/10 bg-white/45 dark:bg-[#042420]/60 p-3">
                  <div className="text-[#2B5E56] dark:text-[#8EB8B0]">Comparison</div>
                  <div className="text-lg font-bold text-[#072622] dark:text-[#ECF8F5] mt-0.5">
                    {compareRight.suitabilityScore ?? '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-[#072622]/10 dark:border-white/10 bg-white/45 dark:bg-[#042420]/60 p-3">
                  <div className="text-[#2B5E56] dark:text-[#8EB8B0]">Delta</div>
                  <div className="text-lg font-bold text-[#072622] dark:text-[#ECF8F5] mt-0.5">
                    {compareLeft.suitabilityScore !== null && compareRight.suitabilityScore !== null
                      ? `${compareRight.suitabilityScore - compareLeft.suitabilityScore >= 0 ? '+' : ''}${
                          compareRight.suitabilityScore - compareLeft.suitabilityScore
                        }`
                      : '—'}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#2B5E56] dark:text-[#96C7BE]">
                At least 2 saved assessment snapshots are needed to inspect side-by-side score,
                moisture, and climate deltas.
              </p>
            )}
          </div>

          {/* Right: Irrigation Volume & Plan Decision Audit */}
          <div className="fs-dash-field-item !rounded-[20px] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5]">
                Irrigation &amp; Plan History
              </div>
              <span className="text-xs font-semibold text-[#1B4D46] dark:text-[#96C7BE] tabular-nums">
                {irrigationLogs.length} runs · {totalIrrigationM3.toFixed(0)} m³
              </span>
            </div>

            {irrigationLogs.length === 0 && farmDecisions.length === 0 ? (
              <div className="text-xs text-[#2B5E56] dark:text-[#96C7BE] space-y-2">
                <p>No irrigation runs or rotation plan decisions have been logged for this farm yet.</p>
                <button
                  type="button"
                  onClick={() => onOpenDrawerTab('water')}
                  className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
                >
                  Log First Irrigation Run →
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto fs-thin-scroll text-xs">
                {irrigationLogs.slice(0, 4).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-[#072622]/8 dark:border-white/8"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-[#072622] dark:text-[#ECF8F5] tabular-nums">
                        {log.date}
                      </span>
                      <span className="text-[#2B5E56] dark:text-[#96C7BE]">
                        {' '}
                        · {log.fieldName} · {log.method}
                      </span>
                    </div>
                    <span className="font-bold text-[#072622] dark:text-[#ECF8F5] tabular-nums shrink-0">
                      {log.volumeM3} m³
                    </span>
                  </div>
                ))}
                {farmDecisions.slice(0, 3).map((dec) => (
                  <div
                    key={dec.id}
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-[#072622]/8 dark:border-white/8"
                  >
                    <div className="min-w-0 truncate text-[#1B4D46] dark:text-[#CCE8E1]">
                      <span className="font-semibold text-[#072622] dark:text-[#ECF8F5]">
                        {dec.newPlan?.title || dec.candidateTitle}
                      </span>{' '}
                      · {dec.action}
                    </div>
                    <span className="text-[11px] text-[#2B5E56] dark:text-[#8EB8B0] tabular-nums shrink-0">
                      {formatRelativeDate(dec.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
