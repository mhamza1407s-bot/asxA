import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Globe,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  FarmObservationItem,
  FarmTaskItem,
  PortfolioFieldRecord,
  SavedFarmSnapshot,
} from '../../../../types/myFarms';
import { EonetFetchResult } from '../../../../types';
import { FieldAgronomyBundle, InspectableMetric } from '../../../../lib/fieldAgronomyEngine';
import riskCanopyImg from '../../../../assets/images/risk_canopy_inspection_1794737932566.jpg';
import {
  DataQualityCard,
  FullReportModal,
  HeroStatusCard,
  IntelligenceCard,
  IntelligenceHeader,
  IntelligenceInset,
  QuickActionsCard,
  ReportingPeriodKey,
  SectionHeading,
  formatSubDate,
  formatSubDateRange,
  formatSubDateTime,
} from './IntelligenceShell';
import { ComparisonLineSvgChart, SmoothLineSvgChart } from './IntelligenceCharts';
import { DisclosureMode } from './SubCategoryHeaderBar';

interface RisksAlertsViewProps {
  fields?: PortfolioFieldRecord[];
  selectedField: PortfolioFieldRecord | null;
  onSelectField?: (fieldId: string) => void;
  bundle: FieldAgronomyBundle;
  observations: FarmObservationItem[];
  tasks: FarmTaskItem[];
  snapshots: SavedFarmSnapshot[];
  eonetResult: EonetFetchResult | null;
  areaLabel: string;
  disclosureMode: DisclosureMode;
  onChangeDisclosureMode: (m: DisclosureMode) => void;
  onInspectMetric: (metric: InspectableMetric) => void;
  onAddObservation: (payload: Record<string, unknown>) => Promise<void>;
  onAddTask: (payload: Record<string, unknown>) => Promise<void>;
  onToggleTask: (taskId: string, completed: boolean) => Promise<void>;
  onCreateFreshSnapshot: () => Promise<void>;
  runningSnapshot: boolean;
  isOnline: boolean;
  onOpenReportsDrawer: () => void;
  onRefresh?: () => void;
  refreshLoading?: boolean;
}

export const RisksAlertsView: React.FC<RisksAlertsViewProps> = ({
  fields = [],
  selectedField,
  onSelectField,
  bundle,
  observations,
  tasks,
  snapshots,
  eonetResult,
  disclosureMode,
  onInspectMetric,
  onAddObservation,
  onAddTask,
  onToggleTask,
  onCreateFreshSnapshot,
  runningSnapshot,
  isOnline,
  onOpenReportsDrawer,
  onRefresh,
  refreshLoading = false,
}) => {
  const { risks, water, weather, crop, phenology, reports, metricsById, timestamps } = bundle;

  const [period, setPeriod] = useState<ReportingPeriodKey>('14d');
  const [reportOpen, setReportOpen] = useState(false);
  const [expandedRiskId, setExpandedRiskId] = useState<string | null>(null);
  const [alertStates, setAlertStates] = useState<
    Record<string, 'Active' | 'Acknowledged' | 'Snoozed'>
  >({});

  const [showAddForm, setShowAddForm] = useState<'none' | 'task' | 'obs'>('none');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskPriority, setTaskPriority] = useState<'high' | 'normal' | 'low'>('normal');
  const [obsTitle, setObsTitle] = useState('');
  const [obsDetail, setObsDetail] = useState('');
  const [obsCategory, setObsCategory] =
    useState<FarmObservationItem['category']>('scouting');

  const windowDays = period === '7d' ? 7 : period === '14d' ? 14 : 30;

  const pastBalance = useMemo(
    () => water.dailyBalanceSeries.filter((d) => !d.isForecast),
    [water.dailyBalanceSeries]
  );
  const forecastBalance = useMemo(
    () => water.dailyBalanceSeries.filter((d) => d.isForecast),
    [water.dailyBalanceSeries]
  );
  const slicedPast = useMemo(() => {
    const src = pastBalance.length > 0 ? pastBalance : water.dailyBalanceSeries;
    return src.slice(-windowDays);
  }, [pastBalance, water.dailyBalanceSeries, windowDays]);

  const depletionWindowLabel = formatSubDateRange(
    slicedPast[0]?.date ?? timestamps.pastWindowStart,
    slicedPast[slicedPast.length - 1]?.date ?? timestamps.pastWindowEnd
  );
  const latestDateLabel = formatSubDate(
    slicedPast[slicedPast.length - 1]?.date ?? timestamps.pastWindowEnd
  );
  const pastWindowLabel = formatSubDateRange(
    timestamps.pastWindowStart,
    timestamps.pastWindowEnd
  );
  const forecastWindowLabel = formatSubDateRange(
    timestamps.forecastStart ?? forecastBalance[0]?.date,
    timestamps.forecastEnd ?? forecastBalance[forecastBalance.length - 1]?.date
  );
  const lastSyncLabel = formatSubDateTime(
    timestamps.weatherObservedAt ??
      timestamps.weatherFetchedAt ??
      timestamps.eonetFetchedAt ??
      timestamps.soilUpdatedAt
  );
  const eonetDateLabel = formatSubDate(
    eonetResult?.nearbyEvents?.[0]?.date ?? timestamps.eonetFetchedAt
  );
  const soilDateLabel = formatSubDate(timestamps.soilUpdatedAt);
  const weatherEvalDate = formatSubDate(
    timestamps.weatherObservedAt ?? timestamps.weatherFetchedAt ?? timestamps.pastWindowEnd
  );

  const depletionLineData = useMemo(() => {
    return slicedPast.map((d) => ({
      label: d.shortDate,
      value: Math.round((d.drEndMm / Math.max(1, d.rawMm)) * 100),
      secondary: Math.round((1 - d.ks) * 100),
    }));
  }, [slicedPast]);

  const compareSeriesData = useMemo(() => {
    const past = pastBalance.slice(-7);
    const fcst = forecastBalance.slice(0, 7);
    const maxLen = Math.max(past.length, fcst.length);
    if (maxLen === 0) return [];
    const rows: Array<{ label: string; current: number; baseline: number }> = [];
    for (let i = 0; i < maxLen; i++) {
      const p = past[i];
      const f = fcst[i];
      const fPct = f ? Math.round((f.drEndMm / Math.max(1, f.rawMm)) * 100) : null;
      const pPct = p ? Math.round((p.drEndMm / Math.max(1, p.rawMm)) * 100) : null;
      rows.push({
        label: f?.shortDate || p?.shortDate || '',
        current: fPct ?? pPct ?? 0,
        baseline: pPct ?? fPct ?? 0,
      });
    }
    return rows;
  }, [pastBalance, forecastBalance]);

  const fieldTasks = useMemo(
    () => tasks.filter((t) => t.fieldId === bundle.fieldId || !t.fieldId),
    [tasks, bundle.fieldId]
  );
  const fieldObs = useMemo(
    () => observations.filter((o) => o.fieldId === bundle.fieldId || !o.fieldId),
    [observations, bundle.fieldId]
  );

  const highCount = risks.filter(
    (r) => r.severity === 'Critical' || r.severity === 'High'
  ).length;
  const moderateCount = risks.filter((r) => r.severity === 'Moderate').length;
  const openTasksCount = fieldTasks.filter((t) => !t.completed).length;
  const currentDepletionPctOfRaw =
    water.currentDrMm !== null && water.rawMm !== null
      ? Math.round((water.currentDrMm / Math.max(1, water.rawMm)) * 100)
      : null;

  const latestObsDate = fieldObs[0]?.observedAt ? formatSubDate(fieldObs[0].observedAt) : 'None logged';
  const latestSnapshotDate = snapshots[0]?.generatedAt
    ? formatSubDateTime(snapshots[0].generatedAt)
    : 'No snapshots yet';

  const escalationLadder = [
    { name: 'Watch', range: 'Ks 1.00', active: highCount === 0 && moderateCount === 0 && !water.triggerActive },
    { name: 'Advisory', range: 'Moderate', active: highCount === 0 && (moderateCount > 0 || water.triggerActive) },
    { name: 'Trigger', range: 'High Rule', active: highCount === 1 },
    { name: 'Critical', range: '2+ High', active: highCount >= 2 },
  ];

  const heroTone: 'good' | 'warning' | 'alert' =
    highCount >= 2 ? 'alert' : highCount === 1 || moderateCount > 0 ? 'warning' : 'good';

  const resolveRuleDate = (domain: string): string => {
    const d = domain.toLowerCase();
    if (d.includes('eonet') || d.includes('hazard') || d.includes('regional')) {
      return eonetDateLabel;
    }
    if (d.includes('soil') || d.includes('nutrient') || d.includes('ph')) {
      return timestamps.phTestDate ? formatSubDate(timestamps.phTestDate) : soilDateLabel;
    }
    return weatherEvalDate;
  };

  return (
    <div className="space-y-3.5 w-full">
      <IntelligenceHeader
        icon={
          <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#F8BC37] via-[#F97316] to-[#DC2626] flex items-center justify-center shadow-[0_4px_14px_rgba(249,115,22,0.35)]">
            <ShieldAlert className="w-5.5 h-5.5 text-white" />
          </div>
        }
        title="Risks, Alerts & Field History"
        subtitle="Rule-based agronomic stress evaluation separating severity from evidence confidence, alongside scouting logs, tasks, and snapshots."
        fieldDisplayName={bundle.fieldDisplayName}
        cropName={crop.commonName}
        stageLabel={phenology.stageFao}
        dateWindowLabel={`Evaluated: ${depletionWindowLabel}`}
        fields={fields}
        selectedFieldId={selectedField?.id ?? null}
        onSelectField={onSelectField}
        period={period}
        onChangePeriod={setPeriod}
        updatedLabel={lastSyncLabel}
        onRefresh={onRefresh}
        refreshLoading={refreshLoading}
        isOnline={isOnline}
      />

      {/* Hero Card: Risk Posture at a Glance */}
      <HeroStatusCard
        imageSrc={riskCanopyImg}
        imageAlt="Field risk canopy inspection"
        imageTitle={bundle.fieldCode}
        imageSubtitle={`${crop.commonName} · ${risks.length} rules evaluated (${latestDateLabel})`}
        heading="Risk Posture at a Glance"
        description={
          reports.riskSummary[0] ||
          `As of ${latestDateLabel}, evaluating ${risks.length} agronomic rules across water deficit, thermal extremes, soil pH/NPK readiness, and regional EONET hazards. Task completion remains separate from field risk resolution.`
        }
        statusTone={heroTone}
        statusText={
          highCount > 0
            ? `${highCount} High / Critical rule${highCount > 1 ? 's' : ''} flagged`
            : moderateCount > 0
              ? `${moderateCount} Watch advisory active`
              : 'All evaluated stress triggers nominal'
        }
        metrics={[
          {
            id: 'rules',
            icon: <ShieldAlert className="w-5.5 h-5.5 text-[#FF6B6B]" />,
            value: highCount > 0 ? `${highCount} High` : `${moderateCount} Watch`,
            unitOrPeriod: `${risks.length} evaluated`,
            label: 'Active Rules',
            dateLabel: latestDateLabel,
            onClick: () => onInspectMetric(metricsById.water_dr),
          },
          {
            id: 'ks',
            icon: <AlertTriangle className="w-5.5 h-5.5 text-[#F7BD31]" />,
            value: water.currentKs !== null ? `Ks ${water.currentKs.toFixed(2)}` : 'Unavailable',
            unitOrPeriod:
              currentDepletionPctOfRaw !== null
                ? `${currentDepletionPctOfRaw}% RAW`
                : 'Texture required',
            label: 'Stress Index',
            dateLabel: latestDateLabel,
            onClick: () => onInspectMetric(metricsById.water_dr),
          },
          {
            id: 'eonet',
            icon: <Globe className="w-5.5 h-5.5 text-[#29B9F3]" />,
            value: `${bundle.eonetNearbyCount}`,
            unitOrPeriod: 'Within 300 km',
            label: 'NASA EONET',
            dateLabel: eonetDateLabel,
          },
          {
            id: 'tasks',
            icon: <ClipboardList className="w-5.5 h-5.5 text-[#35E887]" />,
            value: `${openTasksCount}`,
            unitOrPeriod: `${fieldObs.length} scouting logs`,
            label: 'Open Tasks',
            dateLabel: latestObsDate,
          },
        ]}
      />

      {/* Section 2: Stress Factor & Daily Depletion Timeline */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={2}
          title="Root-zone stress factor and depletion ratio"
          dateLabel={`As of ${latestDateLabel}`}
          onInspect={() => onInspectMetric(metricsById.water_dr)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_1.12fr] gap-3.5 items-stretch">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_210px] gap-3 items-stretch">
            <IntelligenceInset className="grid grid-cols-3 divide-x divide-emerald-900/12 dark:divide-[#64AE7E]/22 py-3">
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">Ks</div>
                <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {water.currentKs !== null ? water.currentKs.toFixed(2) : 'Unavailable'}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">Factor</div>
              </div>
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">Dr/RAW</div>
                <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {currentDepletionPctOfRaw !== null ? `${currentDepletionPctOfRaw}%` : 'Unavailable'}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">Trigger</div>
              </div>
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">Heat / Dry</div>
                <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {weather.heatStressDays30d}/{weather.drySpellDays}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">Window Days</div>
              </div>
            </IntelligenceInset>

            <div className="rounded-[11px] border border-emerald-700/30 dark:border-[#13D987]/35 bg-emerald-500/10 dark:bg-[#05331E]/85 p-3 flex flex-col justify-center">
              <div className="text-[12.5px] font-bold text-[#0F766E] dark:text-[#43E6A1] tabular-nums">
                Ks = (TAW − Dr)/(TAW − RAW)
              </div>
              <p className="text-[11.5px] leading-[1.4] text-[#1B4D46] dark:text-[#C4D4CA] mt-1">
                {water.rawMm !== null
                  ? `When depletion Dr crosses 100% of RAW (${water.rawMm} mm), transpiration throttles (Ks < 1.0).`
                  : water.hydraulicAvailabilityReason ||
                    'Soil texture is required before RAW and Ks depletion stress can be calculated.'}
              </p>
            </div>
          </div>

          <IntelligenceInset className="px-4 py-3 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3]">
              <span>Alert Escalation Posture Ladder</span>
              <span className="text-[11px] font-normal text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                {latestDateLabel}
              </span>
            </div>
            <div className="relative pt-2.5 pb-1">
              <div className="h-[2.5px] w-full bg-emerald-900/15 dark:bg-[#64AE7E]/25 rounded-full" />
              <div className="grid grid-cols-4 gap-1 -mt-[8px]">
                {escalationLadder.map((step) => (
                  <div key={step.name} className="flex flex-col items-center text-center">
                    <span
                      className={`rounded-full transition-all ${
                        step.active
                          ? 'w-4 h-4 bg-[#35EC99] ring-4 ring-[#13D987]/25 -mt-[2px]'
                          : 'w-3 h-3 bg-emerald-800/30 dark:bg-[#64AE7E]/55'
                      }`}
                    />
                    <div
                      className={`text-[11.5px] mt-1.5 leading-tight ${
                        step.active
                          ? 'font-bold text-[#05291B] dark:text-white'
                          : 'font-medium text-[#3C6D59] dark:text-[#849B8C]'
                      }`}
                    >
                      {step.name}
                    </div>
                    <div className="text-[10.5px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                      ({step.range})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </IntelligenceInset>
        </div>

        <div className="pt-0.5">
          <div className="flex items-center justify-between text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] mb-1">
            <span>Daily Root-Zone Depletion (% of RAW Limit)</span>
            <span className="text-[11px] font-normal text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
              {depletionWindowLabel}
            </span>
          </div>
          {depletionLineData.length === 0 ? (
            <div className="h-[135px] flex items-center justify-center text-center px-4 text-[12px] text-[#2B5E56] dark:text-[#849B8C]">
              {water.hydraulicAvailabilityReason ||
                'Root-zone depletion series is unavailable until soil texture and weather history are available.'}
            </div>
          ) : (
            <SmoothLineSvgChart
              data={depletionLineData}
              yUnit="%"
              primaryLabel="Dr as % of RAW"
              primaryColor="#35E887"
              secondaryLabel="Stress Intensity (1−Ks)%"
              secondaryColor="#F7BD31"
              averageValue={100}
              averageLabel="100% RAW Refill Trigger"
              height={152}
            />
          )}
        </div>
      </IntelligenceCard>

      {/* Section 3: Word-Format Evaluated Risk Register & Diagnostic Guardrail */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={3}
          title={`Evaluated field risk register (${risks.length})`}
          dateLabel={`Evaluated ${latestDateLabel}`}
          infoText="Severity reflects agronomic impact; Confidence reflects underlying measurement evidence. Acknowledge/Snooze does not delete or falsify underlying rules."
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_0.52fr] gap-3.5 items-stretch">
          <IntelligenceInset className="overflow-hidden flex flex-col justify-between">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead className="bg-emerald-900/8 dark:bg-[#052B1C]/90 border-b border-emerald-900/12 dark:border-[#64AE7E]/20 text-[#2B5E56] dark:text-[#C4D4CA]">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Risk Rule</th>
                    <th className="py-2 px-2.5 font-semibold">Threshold vs Actual</th>
                    <th className="py-2 px-2.5 font-semibold">Evaluated</th>
                    <th className="py-2 px-2.5 font-semibold">Severity</th>
                    <th className="py-2 px-2.5 font-semibold">Confidence</th>
                    <th className="py-2 px-3 font-semibold text-right">Lifecycle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-900/10 dark:divide-[#64AE7E]/15">
                  {risks.map((r) => {
                    const state = alertStates[r.id] || r.status;
                    const sevCls =
                      r.severity === 'Critical' || r.severity === 'High'
                        ? 'text-rose-700 dark:text-[#FF7A7A]'
                        : r.severity === 'Moderate'
                          ? 'text-amber-700 dark:text-[#F8BC37]'
                          : 'text-emerald-700 dark:text-[#35EC99]';
                    const isExpanded = expandedRiskId === r.id;
                    const evalDate = resolveRuleDate(r.domain);

                    return (
                      <React.Fragment key={r.id}>
                        <tr className="hover:bg-emerald-500/5">
                          <td className="py-2.5 px-3 align-top">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedRiskId((cur) => (cur === r.id ? null : r.id))
                              }
                              className="text-left cursor-pointer group"
                            >
                              <div className="font-semibold text-[#05291B] dark:text-[#F1F8F3] group-hover:text-[#35EC99]">
                                {r.title}
                              </div>
                              <div className="text-[10.5px] text-[#3C6D59] dark:text-[#849B8C]">
                                {r.ruleId} · {r.domain} · {state}
                              </div>
                            </button>
                          </td>
                          <td className="py-2.5 px-2.5 align-top text-[#1B4D46] dark:text-[#C4D4CA] tabular-nums max-w-[230px]">
                            {r.thresholdVsActual}
                          </td>
                          <td className="py-2.5 px-2.5 align-top text-[#3C6D59] dark:text-[#9BB5A6] tabular-nums whitespace-nowrap">
                            {evalDate}
                          </td>
                          <td className={`py-2.5 px-2.5 align-top font-bold whitespace-nowrap ${sevCls}`}>
                            {r.severity}
                          </td>
                          <td className="py-2.5 px-2.5 align-top font-medium text-[#2B5E56] dark:text-[#C4D4CA] whitespace-nowrap">
                            {r.confidence}
                          </td>
                          <td className="py-2.5 px-3 align-top text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setAlertStates((prev) => ({ ...prev, [r.id]: 'Acknowledged' }))
                                }
                                className="px-2.5 py-1 rounded-[6px] border border-emerald-800/20 dark:border-[#64AE7E]/30 text-[11px] font-semibold hover:bg-emerald-500/15 cursor-pointer"
                              >
                                Ack
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setAlertStates((prev) => ({ ...prev, [r.id]: 'Snoozed' }))
                                }
                                className="px-2.5 py-1 rounded-[6px] border border-emerald-800/20 dark:border-[#64AE7E]/30 text-[11px] font-semibold hover:bg-emerald-500/15 cursor-pointer"
                              >
                                Snooze
                              </button>
                              {r.metricId && metricsById[r.metricId] && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const m = r.metricId ? metricsById[r.metricId] : undefined;
                                    if (m) onInspectMetric(m);
                                  }}
                                  className="px-2 py-1 text-[11px] font-bold text-[#0F766E] dark:text-[#35EC99] hover:underline cursor-pointer"
                                >
                                  Evidence →
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {(isExpanded || disclosureMode === 'advanced') && (
                          <tr className="bg-emerald-500/5 dark:bg-[#042416]/65">
                            <td colSpan={6} className="px-3.5 py-2 text-[11.5px] text-[#1B4D46] dark:text-[#C4D4CA]">
                              <strong>Mechanism:</strong> {r.plausibleMechanism}{' '}
                              <span className="text-[#3C6D59] dark:text-[#849B8C]">
                                · <strong>Competing explanation:</strong> {r.competingExplanations}
                              </span>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </IntelligenceInset>

          <IntelligenceInset className="p-3.5 flex flex-col items-center justify-center text-center gap-2">
            <ShieldAlert className="w-7 h-7 text-[#F8BC37]" />
            <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] leading-snug">
              Diagnostic Guardrail
            </div>
            <p className="text-[11.5px] leading-[1.42] text-[#2B5E56] dark:text-[#C4D4CA]">
              Weather variables never auto-diagnose fungal/insect disease or prescribe pesticide sprays without scouting confirmation.
            </p>
          </IntelligenceInset>
        </div>
      </IntelligenceCard>

      {/* Section 4: Scouting Observations & Regional NASA EONET Hazards */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={4}
          title="Scouting observations and NASA EONET hazards"
          dateLabel={`EONET Synced: ${eonetDateLabel}`}
          infoText="Regional hazards query NASA EONET open natural events within 300 km of the field centroid."
        />

        <div className="grid grid-cols-1 md:grid-cols-[245px_1fr_auto] gap-3.5 items-stretch">
          <IntelligenceInset className="p-3.5 flex flex-col justify-center gap-1.5">
            <div className="flex items-center justify-between text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">
              <span>NASA EONET (&lt;300 km)</span>
              <Globe className="w-4.5 h-4.5 text-[#29B9F3]" />
            </div>
            <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
              {bundle.eonetNearbyCount} Open
            </div>
            <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] truncate">
              {eonetResult?.nearbyEvents?.[0]?.title
                ? `${eonetResult.nearbyEvents[0].title} (${formatSubDate(eonetResult.nearbyEvents[0].date)})`
                : `No nearby events (${eonetDateLabel})`}
            </div>
          </IntelligenceInset>

          <IntelligenceInset className="p-3 max-h-[140px] overflow-y-auto fs-thin-scroll space-y-2 text-[12px]">
            {fieldObs.length === 0 ? (
              <div className="h-full min-h-[76px] flex items-center justify-center text-[#3C6D59] dark:text-[#849B8C]">
                No field scouting notes logged for {bundle.fieldCode} yet.
              </div>
            ) : (
              fieldObs.map((ob) => (
                <div
                  key={ob.id}
                  className="flex items-start justify-between gap-2.5 pb-2 border-b last:border-b-0 border-emerald-900/10 dark:border-[#64AE7E]/15"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[#05291B] dark:text-[#F1F8F3] truncate">
                      {ob.title}
                    </div>
                    <div className="text-[11.5px] text-[#2B5E56] dark:text-[#C4D4CA] truncate">
                      {ob.detail}
                    </div>
                  </div>
                  <span className="text-[11px] text-[#3C6D59] dark:text-[#9BB5A6] tabular-nums shrink-0">
                    {formatSubDate(ob.observedAt)}
                  </span>
                </div>
              ))
            )}
          </IntelligenceInset>

          <div className="flex flex-col justify-center">
            <button
              type="button"
              onClick={() => setShowAddForm((s) => (s === 'obs' ? 'none' : 'obs'))}
              className="h-[38px] px-4.5 rounded-[10px] bg-[#13D987] hover:bg-[#35EC99] text-[#003C2A] text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 stroke-[2.6]" />
              <span>Scouting Note</span>
            </button>
          </div>
        </div>

        {showAddForm === 'obs' && (
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
                provenance: 'Reported',
              });
              setObsTitle('');
              setObsDetail('');
              setShowAddForm('none');
            }}
            className="rounded-[11px] border border-emerald-700/25 dark:border-[#13D987]/35 bg-emerald-50/85 dark:bg-[#00190E]/90 p-3.5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
          >
            <div>
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                Category
              </label>
              <select
                value={obsCategory}
                onChange={(e) => setObsCategory(e.target.value as FarmObservationItem['category'])}
                className="w-full px-3 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white"
              >
                <option value="scouting">Field scouting</option>
                <option value="pest_disease">Pest / disease check</option>
                <option value="soil_lab">Soil lab</option>
                <option value="weather_impact">Weather impact</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                Headline
              </label>
              <input
                type="text"
                required
                value={obsTitle}
                onChange={(e) => setObsTitle(e.target.value)}
                placeholder="e.g., Leaf curl check north edge"
                className="w-full px-3 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                Field Evidence Detail
              </label>
              <input
                type="text"
                required
                value={obsDetail}
                onChange={(e) => setObsDetail(e.target.value)}
                placeholder="Sample zone & symptom notes…"
                className="w-full px-3 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="h-[36px] px-4 rounded-[8px] bg-[#13D987] text-[#003C2A] text-[12px] font-bold cursor-pointer"
            >
              Save Scouting Log
            </button>
          </form>
        )}
      </IntelligenceCard>

      {/* Section 5: Field Action Tasks & Mitigation Summary */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={5}
          title={`Field action tasks & mitigation checklist (${openTasksCount} open)`}
          dateLabel={`Updated ${latestDateLabel}`}
          rightSlot={
            <button
              type="button"
              onClick={() => setShowAddForm((s) => (s === 'task' ? 'none' : 'task'))}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[8px] border border-emerald-700/25 dark:border-[#49DAB0]/35 text-[11.5px] font-semibold text-[#0F766E] dark:text-[#35EC99] hover:bg-emerald-500/10 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Task</span>
            </button>
          }
        />

        {showAddForm === 'task' && (
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
              setShowAddForm('none');
            }}
            className="rounded-[11px] border border-emerald-700/25 dark:border-[#13D987]/35 bg-emerald-50/85 dark:bg-[#00190E]/90 p-3.5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
          >
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                Task Title
              </label>
              <input
                type="text"
                required
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g., Sample 0–20 cm soil NPK cores"
                className="w-full px-3 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                Priority &amp; Due Date
              </label>
              <div className="flex gap-1.5">
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as 'high' | 'normal' | 'low')}
                  className="w-1/2 px-2.5 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white"
                >
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
                <input
                  type="date"
                  value={taskDue}
                  onChange={(e) => setTaskDue(e.target.value)}
                  className="w-1/2 px-2.5 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              className="h-[36px] px-4 rounded-[8px] bg-[#13D987] text-[#003C2A] text-[12px] font-bold cursor-pointer"
            >
              Create Task
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3.5 items-stretch">
          <IntelligenceInset className="p-3 max-h-[175px] overflow-y-auto fs-thin-scroll space-y-1.5 text-[12px]">
            {fieldTasks.length === 0 ? (
              <div className="h-[100px] flex items-center justify-center text-[#3C6D59] dark:text-[#849B8C]">
                No tasks assigned to {bundle.fieldCode}. Use &ldquo;+ Add Task&rdquo; above to schedule scouting or mitigation.
              </div>
            ) : (
              fieldTasks.map((t) => (
                <label
                  key={t.id}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-[8px] hover:bg-emerald-500/8 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={t.completed}
                    onChange={(e) => onToggleTask(t.id, e.target.checked)}
                    className="mt-0.5 accent-[#13D987]"
                  />
                  <div className="flex-1 min-w-0 flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`font-medium ${
                        t.completed
                          ? 'line-through text-[#3C6D59] dark:text-[#849B8C]'
                          : 'text-[#05291B] dark:text-[#F1F8F3]'
                      }`}
                    >
                      {t.title}
                    </span>
                    <span className="text-[11px] text-[#3C6D59] dark:text-[#9BB5A6] tabular-nums">
                      {t.priority} · {t.dueDate ? `Due ${formatSubDate(t.dueDate)}` : `Logged ${formatSubDate(t.createdAt)}`}
                    </span>
                  </div>
                </label>
              ))
            )}
          </IntelligenceInset>

          <IntelligenceInset className="p-3.5 flex flex-col justify-between gap-2">
            <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3]">
              Mitigation Summary
            </div>
            <div className="divide-y divide-emerald-900/10 dark:divide-[#64AE7E]/18 text-[12px] tabular-nums">
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[#2B5E56] dark:text-[#C4D4CA]">High / Crit Rules</span>
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">{highCount}</span>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[#2B5E56] dark:text-[#C4D4CA]">Open Tasks</span>
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">{openTasksCount}</span>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[#2B5E56] dark:text-[#C4D4CA]">Scouting Notes</span>
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">{fieldObs.length}</span>
              </div>
              <div className="pt-2 flex items-center justify-between gap-2">
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">Saved Snapshots</span>
                <span className="font-bold text-[#0F766E] dark:text-[#35EC99]">{snapshots.length}</span>
              </div>
            </div>
          </IntelligenceInset>
        </div>
      </IntelligenceCard>

      {/* Section 6: Analysis Snapshots & Audit Trail */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={6}
          title="Analysis snapshots and immutable audit trail"
          dateLabel={latestSnapshotDate}
        />

        <div className="grid grid-cols-1 md:grid-cols-[260px_200px_1fr_auto] gap-3.5 items-center">
          <IntelligenceInset className="px-3.5 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-[#35EC99] shrink-0" />
            <div className="min-w-0">
              <div className="text-[11.5px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">
                Latest Snapshot Score
              </div>
              <div className="text-[20px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
                {snapshots[0]?.suitabilityScore !== null && snapshots[0]?.suitabilityScore !== undefined
                  ? `${snapshots[0].suitabilityScore}/100`
                  : `${snapshots.length} Saved`}
              </div>
              <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] truncate tabular-nums">
                {latestSnapshotDate}
              </div>
            </div>
          </IntelligenceInset>

          <IntelligenceInset className="px-3.5 py-3 space-y-1 tabular-nums">
            <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">Snapshot Count</div>
            <div className="text-[16px] font-bold text-[#05291B] dark:text-[#F1F8F3]">
              {snapshots.length} Immutable
            </div>
            <button
              type="button"
              onClick={onOpenReportsDrawer}
              className="text-[11.5px] font-semibold text-[#0F766E] dark:text-[#35EC99] hover:underline cursor-pointer"
            >
              Compare Reports →
            </button>
          </IntelligenceInset>

          <p className="text-[12px] leading-[1.45] text-[#1B4D46] dark:text-[#C4D4CA]">
            {snapshots[0]?.weatherWindowSummary ||
              reports.riskSummary[1] ||
              'Capture an immutable analysis snapshot to freeze current stress rules, weather baselines, and crop phenology for side-by-side comparison.'}
          </p>

          <button
            type="button"
            disabled={!isOnline || runningSnapshot}
            onClick={onCreateFreshSnapshot}
            className="h-[38px] px-4.5 rounded-[10px] bg-[#13D987] hover:bg-[#35EC99] text-[#003C2A] text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${runningSnapshot ? 'animate-spin' : ''}`} />
            <span>{runningSnapshot ? 'Saving…' : 'Save Snapshot'}</span>
          </button>
        </div>
      </IntelligenceCard>

      {/* Bottom Row: Section 7, Section 8, Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr_240px] gap-3.5 items-stretch">
        <IntelligenceCard className="p-4 lg:p-4.5 flex flex-col justify-between gap-2.5">
          <SectionHeading
            number={7}
            title="Forecast vs Observed Depletion (%)"
            dateLabel={`${pastWindowLabel} vs ${forecastWindowLabel}`}
          />
          {compareSeriesData.length === 0 ? (
            <div className="h-[135px] flex items-center justify-center text-center px-3 text-[12px] text-[#2B5E56] dark:text-[#849B8C]">
              {water.hydraulicAvailabilityReason ||
                'Forecast vs observed depletion requires confirmed soil texture.'}
            </div>
          ) : (
            <ComparisonLineSvgChart
              data={compareSeriesData}
              yUnit="%"
              currentLabel="7-Day Forecast"
              baselineLabel="Past Observed"
            />
          )}
        </IntelligenceCard>

        <DataQualityCard
          dateLabel={latestDateLabel}
          rows={[
            {
              dataType: 'Rule Engine',
              source: 'FAO-56 Thresholds',
              updatedDate: latestDateLabel,
              quality: 'High',
              basis: 'FAO-56 Rules',
            },
            {
              dataType: 'EONET Feed',
              source: 'NASA Open Events',
              updatedDate: eonetDateLabel,
              quality: 'High',
              basis: 'NASA Open API',
            },
            {
              dataType: 'Stress Inputs',
              source: weather.providerStatus === 'Connected' ? 'Open-Meteo' : 'Cached NWP',
              updatedDate: weatherEvalDate,
              quality:
                water.currentKs === null
                  ? 'Low'
                  : weather.providerStatus === 'Connected'
                    ? 'High'
                    : 'Medium',
              basis:
                water.currentKs === null
                  ? 'Texture missing'
                  : weather.providerStatus === 'Connected'
                    ? 'Live NWP + Soil'
                    : 'Cached + Soil',
            },
            {
              dataType: 'Scouting Logs',
              source: fieldObs.length > 0 ? 'Farmer Reported' : 'None Logged',
              updatedDate: latestObsDate,
              quality: fieldObs.length > 0 ? 'Medium' : 'Low',
              basis: fieldObs.length > 0 ? `${fieldObs.length} logged` : 'Not logged',
            },
          ]}
          onViewDetails={() => onInspectMetric(metricsById.water_dr)}
        />

        <QuickActionsCard
          onViewFullReport={() => setReportOpen(true)}
          onDownloadPdf={() => window.print()}
          thirdActionLabel="Compare Reports"
          onThirdAction={onOpenReportsDrawer}
        />
      </div>

      <FullReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`Risks & Field History — ${bundle.fieldDisplayName}`}
        subtitle={`${crop.commonName} · ${risks.length} Rules Evaluated · Evaluated ${latestDateLabel}`}
        stats={[
          { label: 'High / Crit Risks', value: `${highCount}` },
          {
            label: 'Stress Factor Ks',
            value: water.currentKs !== null ? water.currentKs.toFixed(2) : 'Unavailable',
          },
          { label: 'Open Tasks', value: `${openTasksCount}` },
          { label: 'EONET (<300 km)', value: `${bundle.eonetNearbyCount}` },
        ]}
        paragraphs={reports.riskSummary}
        onPrint={() => window.print()}
      />
    </div>
  );
};
