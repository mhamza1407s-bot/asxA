import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, CloudRain, Droplets, Layers, Plus, Sprout } from 'lucide-react';
import { IrrigationLogItem, MyFarmRecord, PortfolioFieldRecord } from '../../../../types/myFarms';
import { FieldAgronomyBundle, InspectableMetric } from '../../../../lib/fieldAgronomyEngine';
import { resolveCropThumbnail } from '../../../../lib/myFarmsEngine';
import { formatSoilMoistureUnitLabel } from '../../../../lib/soilProvenance';
import rootZoneImg from '../../../../assets/images/soil_root_zone_cross_section_1794737932428.jpg';
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
import {
  ComparisonLineSvgChart,
  MixedBalanceSvgChart,
  SmoothLineSvgChart,
  StackedBarSvgChart,
} from './IntelligenceCharts';
import { DisclosureMode } from './SubCategoryHeaderBar';

interface WaterIrrigationViewProps {
  farm: MyFarmRecord;
  fields?: PortfolioFieldRecord[];
  selectedField: PortfolioFieldRecord | null;
  onSelectField?: (fieldId: string) => void;
  bundle: FieldAgronomyBundle;
  irrigationLogs: IrrigationLogItem[];
  areaLabel: string;
  disclosureMode: DisclosureMode;
  onChangeDisclosureMode: (m: DisclosureMode) => void;
  onInspectMetric: (metric: InspectableMetric) => void;
  onAddIrrigation: (payload: Record<string, unknown>) => Promise<void>;
  onOpenWaterConfigDrawer: () => void;
  onOpenSoilDetails?: () => void;
  onRefresh?: () => void;
  refreshLoading?: boolean;
  isOnline?: boolean;
}

export const WaterIrrigationView: React.FC<WaterIrrigationViewProps> = ({
  farm,
  fields = [],
  selectedField,
  onSelectField,
  bundle,
  irrigationLogs,
  disclosureMode,
  onInspectMetric,
  onAddIrrigation,
  onOpenWaterConfigDrawer,
  onOpenSoilDetails,
  onRefresh,
  refreshLoading = false,
  isOnline = true,
}) => {
  const { water, crop, phenology, soil, weather, metricsById, reports, timestamps } = bundle;
  const [period, setPeriod] = useState<ReportingPeriodKey>('14d');
  const [showLogForm, setShowLogForm] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [compareBaseline, setCompareBaseline] = useState<'potential' | 'et0'>('potential');

  const [irrDate, setIrrDate] = useState(
    timestamps.pastWindowEnd ?? new Date().toISOString().slice(0, 10)
  );
  const [irrVolume, setIrrVolume] = useState(
    water.recommendedVolumeM3 !== null && water.recommendedVolumeM3 > 0
      ? String(water.recommendedVolumeM3)
      : '250'
  );
  const [irrNotes, setIrrNotes] = useState('');
  const [savingLog, setSavingLog] = useState(false);

  useEffect(() => {
    setIrrVolume(
      water.recommendedVolumeM3 !== null && water.recommendedVolumeM3 > 0
        ? String(water.recommendedVolumeM3)
        : '250'
    );
    setIrrNotes('');
  }, [bundle.fieldId, water.recommendedVolumeM3]);

  const windowDays = period === '7d' ? 7 : period === '14d' ? 14 : 30;

  const historicalSeries = useMemo(() => {
    const past = water.dailyBalanceSeries.filter((d) => !d.isForecast);
    return past.slice(-windowDays);
  }, [water.dailyBalanceSeries, windowDays]);

  const weatherPastSeries = useMemo(() => {
    return weather.combinedDailySeries.filter((d) => !d.isForecast).slice(-windowDays);
  }, [weather.combinedDailySeries, windowDays]);

  const windowStartIso =
    historicalSeries[0]?.date ?? weatherPastSeries[0]?.date ?? timestamps.pastWindowStart;
  const windowEndIso =
    historicalSeries[historicalSeries.length - 1]?.date ??
    weatherPastSeries[weatherPastSeries.length - 1]?.date ??
    timestamps.pastWindowEnd;
  const windowRangeLabel = formatSubDateRange(windowStartIso, windowEndIso);
  const latestDay = historicalSeries[historicalSeries.length - 1];
  const latestWeatherDay = weatherPastSeries[weatherPastSeries.length - 1];
  const latestDateLabel = formatSubDate(latestDay?.date ?? latestWeatherDay?.date ?? windowEndIso);
  const rain7dRangeLabel = formatSubDateRange(
    historicalSeries[Math.max(0, historicalSeries.length - 7)]?.date ??
      weatherPastSeries[Math.max(0, weatherPastSeries.length - 7)]?.date ??
      windowStartIso,
    windowEndIso
  );
  const lastSyncLabel = formatSubDateTime(
    timestamps.weatherObservedAt ?? timestamps.weatherFetchedAt ?? timestamps.nasaPowerFetchedAt
  );

  const et0Value = weather.et0TodayMm ?? latestDay?.et0Mm ?? latestWeatherDay?.et0Mm ?? null;
  const kcValue = phenology.currentKc;
  const etcValue =
    water.etcPotentialMmDay !== null
      ? water.etcPotentialMmDay
      : et0Value !== null
        ? Number((et0Value * kcValue).toFixed(1))
        : null;

  const demandLinePoints = useMemo(() => {
    const src =
      historicalSeries.length > 0
        ? historicalSeries
        : water.dailyBalanceSeries.slice(0, windowDays);
    if (src.length > 0) {
      return src.map((d) => ({
        label: d.shortDate,
        value: Number(d.etcPotentialMm.toFixed(1)),
      }));
    }
    return weatherPastSeries
      .filter((d) => d.et0Mm !== null)
      .map((d) => ({
        label: d.shortDate,
        value: Number(((d.et0Mm ?? 0) * kcValue).toFixed(1)),
      }));
  }, [historicalSeries, water.dailyBalanceSeries, windowDays, weatherPastSeries, kcValue]);

  const demandAverage = useMemo(() => {
    if (demandLinePoints.length === 0) return etcValue ?? undefined;
    const sum = demandLinePoints.reduce((s, p) => s + p.value, 0);
    return Number((sum / demandLinePoints.length).toFixed(1));
  }, [demandLinePoints, etcValue]);

  // Water Sources stacked bar (chunked to ~7 clean bars across selected period)
  const stackedSourceBars = useMemo(() => {
    if (historicalSeries.length === 0) return [];
    const bucketCount = Math.min(7, historicalSeries.length);
    const step = Math.max(1, Math.ceil(historicalSeries.length / bucketCount));
    const bars: Array<{ label: string; base: number; mid: number; top: number }> = [];
    for (let i = 0; i < historicalSeries.length; i += step) {
      const slice = historicalSeries.slice(i, i + step);
      const rain = slice.reduce((s, d) => s + d.observedRainMm, 0);
      const eff = slice.reduce((s, d) => s + d.effectiveRainMm, 0);
      const irr = slice.reduce((s, d) => s + d.irrigationNetMm, 0);
      bars.push({
        label: slice[slice.length - 1]?.shortDate || '',
        base: Number(rain.toFixed(1)),
        mid: Number(eff.toFixed(1)),
        top: Number(irr.toFixed(1)),
      });
    }
    return bars;
  }, [historicalSeries]);

  // Water Source History rows (combining real weather rain days + farmer irrigation logs with full formatted dates)
  const sourceRecords = useMemo(() => {
    const rows: Array<{
      date: string;
      rainfall: string;
      effectiveRain: string;
      irrigation: string;
      source: string;
    }> = [];

    const fieldIrr = irrigationLogs.filter(
      (l) => l.fieldId === bundle.fieldId || !l.fieldId
    );
    for (const log of fieldIrr.slice(0, 3)) {
      const mmEq = bundle.areaHa > 0 ? log.volumeM3 / (bundle.areaHa * 10) : 0;
      rows.push({
        date: formatSubDate(log.date),
        rainfall: '–',
        effectiveRain: '–',
        irrigation: `${mmEq > 0 ? mmEq.toFixed(1) : log.volumeM3} mm`,
        source: 'Farmer Log',
      });
    }

    const rainyDays = [...historicalSeries]
      .reverse()
      .filter((d) => d.observedRainMm > 0.2)
      .slice(0, 4);
    for (const d of rainyDays) {
      rows.push({
        date: formatSubDate(d.date),
        rainfall: `${d.observedRainMm.toFixed(1)} mm`,
        effectiveRain: `${d.effectiveRainMm.toFixed(1)} mm`,
        irrigation: '–',
        source: 'NASA / Open-Meteo',
      });
    }

    if (rows.length === 0) {
      const latest = historicalSeries.slice(-4).reverse();
      for (const d of latest) {
        rows.push({
          date: formatSubDate(d.date),
          rainfall: `${d.observedRainMm.toFixed(1)} mm`,
          effectiveRain: `${d.effectiveRainMm.toFixed(1)} mm`,
          irrigation: d.irrigationNetMm > 0 ? `${d.irrigationNetMm.toFixed(1)} mm` : '–',
          source: 'Weather API',
        });
      }
    }

    return rows.slice(0, 5);
  }, [historicalSeries, irrigationLogs, bundle.fieldId, bundle.areaHa]);

  // Section 5 Water Balance mixed series (strictly true daily mm values — zero artificial multipliers)
  const balanceMixedData = useMemo(() => {
    return historicalSeries.map((d) => ({
      label: d.shortDate,
      barA: Number(d.effectiveRainMm.toFixed(1)),
      barB: Number(d.irrigationNetMm.toFixed(1)),
      lineA: Number(d.etcAdjMm.toFixed(1)),
      lineB: Number(Math.max(0, d.tawMm - d.drEndMm).toFixed(1)),
    }));
  }, [historicalSeries]);

  const periodTotals = useMemo(() => {
    if (historicalSeries.length > 0) {
      const totalEtc = historicalSeries.reduce((s, d) => s + d.etcAdjMm, 0);
      const totalRain = historicalSeries.reduce((s, d) => s + d.observedRainMm, 0);
      const totalIrr = historicalSeries.reduce((s, d) => s + d.irrigationNetMm, 0);
      const net = totalRain + totalIrr - totalEtc;
      return {
        totalEtc: Number(totalEtc.toFixed(1)) as number | null,
        totalRain: Number(totalRain.toFixed(1)),
        totalIrr: Number(totalIrr.toFixed(1)),
        net: Number(net.toFixed(1)) as number | null,
      };
    }
    const totalRain = weatherPastSeries.reduce((s, d) => s + (d.precipMm ?? 0), 0);
    return {
      totalEtc: null as number | null,
      totalRain: Number(totalRain.toFixed(1)),
      totalIrr: Number(water.confirmedIrrigation30dMm.toFixed(1)),
      net: null as number | null,
    };
  }, [historicalSeries, weatherPastSeries, water.confirmedIrrigation30dMm]);

  // Section 7 Cumulative Water Use vs Reference (pure FAO-56 accumulated totals — zero Math.sin or fake scaling)
  const historicalCompareData = useMemo(() => {
    let cumActual = 0;
    let cumReference = 0;
    return historicalSeries.map((d) => {
      cumActual += d.etcAdjMm;
      cumReference += compareBaseline === 'potential' ? d.etcPotentialMm : d.et0Mm;
      return {
        label: d.shortDate,
        current: Number(cumActual.toFixed(1)),
        baseline: Number(cumReference.toFixed(1)),
      };
    });
  }, [historicalSeries, compareBaseline]);

  const observedRain24h = latestDay?.observedRainMm ?? latestWeatherDay?.precipMm ?? 0;
  const irrigation7dMm =
    historicalSeries.length > 0
      ? historicalSeries.slice(-7).reduce((s, d) => s + d.irrigationNetMm, 0)
      : water.confirmedIrrigation30dMm;

  const availableWaterMm =
    water.tawMm !== null && water.currentDrMm !== null
      ? Math.max(0, Math.round(water.tawMm - water.currentDrMm))
      : null;
  const rootDepthCm = Math.round(phenology.currentZrM * 100);
  const moistureHeroValue =
    water.estimatedMoistureVwcPct !== null
      ? `${water.estimatedMoistureVwcPct}%`
      : water.observedMoisturePct !== null
        ? `${water.observedMoisturePct}%`
        : 'Unavailable';
  const moistureHeroUnit =
    water.estimatedMoistureVwcPct !== null
      ? 'Est. % VWC'
      : water.observedMoisturePct !== null
        ? formatSoilMoistureUnitLabel(water.observedMoistureUnit)
        : 'Soil Moisture';
  const moistureToneText =
    water.estimatedMoistureVwcPct !== null && water.currentDrMm !== null && water.rawMm !== null
      ? water.currentDrMm <= water.rawMm
        ? 'Within RAW buffer'
        : 'Below RAW trigger'
      : water.observedMoisturePct !== null
        ? water.moistureUnitAmbiguityNote
          ? 'Excluded from VWC balance'
          : water.moistureSourceLabel
        : 'Not measured';

  const bestWindowLabel = useMemo(() => {
    if (water.daysUntilRawCrossed === null) {
      return formatSubDateRange(timestamps.forecastStart, timestamps.forecastEnd);
    }
    const baseIso = windowEndIso ?? new Date().toISOString().slice(0, 10);
    const target = new Date(`${baseIso}T12:00:00Z`);
    if (!Number.isNaN(target.getTime())) {
      target.setUTCDate(target.getUTCDate() + Math.max(0, water.daysUntilRawCrossed));
      return formatSubDate(target.toISOString().slice(0, 10));
    }
    return `In ~${water.daysUntilRawCrossed}d`;
  }, [water.daysUntilRawCrossed, windowEndIso, timestamps.forecastStart, timestamps.forecastEnd]);

  const stageTimeline = [
    {
      name: 'Initial',
      range: `${crop.kcIni.toFixed(2)}–${(crop.kcIni + 0.35).toFixed(2)}`,
      active: phenology.stageFao === 'Initial',
    },
    {
      name: 'Development',
      range: `${(crop.kcIni + 0.35).toFixed(2)}–${crop.kcMid.toFixed(2)}`,
      active: phenology.stageFao === 'Crop development',
    },
    {
      name: 'Mid-Season',
      range: `${(crop.kcMid - 0.1).toFixed(2)}–${crop.kcMid.toFixed(2)}`,
      active: phenology.stageFao === 'Mid-season',
    },
    {
      name: 'Late Season',
      range: `${crop.kcEnd.toFixed(2)}–${(crop.kcEnd + 0.3).toFixed(2)}`,
      active: phenology.stageFao === 'Late season',
    },
  ];

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const vol = Number(irrVolume);
    if (!Number.isFinite(vol) || vol <= 0) return;
    setSavingLog(true);
    try {
      await onAddIrrigation({
        fieldId: selectedField?.id ?? null,
        fieldName: selectedField?.name ?? 'Whole Farm',
        date: irrDate,
        volumeM3: vol,
        method:
          selectedField?.waterOverrides?.irrigationMethod ||
          farm.water.irrigationMethod ||
          'Drip irrigation',
        notes: irrNotes.trim(),
      });
      setIrrNotes('');
      setShowLogForm(false);
    } finally {
      setSavingLog(false);
    }
  };

  const cropImg = resolveCropThumbnail(selectedField?.cropId || crop.commonName);

  return (
    <div className="space-y-3.5 w-full">
      {/* Header Region */}
      <IntelligenceHeader
        icon={
          <svg
            viewBox="0 0 36 46"
            fill="none"
            className="w-9 h-11 drop-shadow-[0_4px_12px_rgba(41,185,243,0.45)]"
            aria-hidden="true"
          >
            <path
              d="M18 2C18 2 4 19.2 4 29.5C4 37.5 10.3 44 18 44C25.7 44 32 37.5 32 29.5C32 19.2 18 2 18 2Z"
              fill="url(#waterDropMain)"
            />
            <path
              d="M12.5 24.5C11.2 28.2 12.2 33.4 15.5 36.2"
              stroke="rgba(255,255,255,0.65)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="waterDropMain" x1="10" y1="6" x2="28" y2="42" gradientUnits="userSpaceOnUse">
                <stop stopColor="#8FE7FF" />
                <stop offset="0.5" stopColor="#29B9F3" />
                <stop offset="1" stopColor="#0C72B8" />
              </linearGradient>
            </defs>
          </svg>
        }
        title="Water Intelligence"
        subtitle="Understand how much water this crop is using, how much reaches the root zone, and whether irrigation is needed."
        fieldDisplayName={bundle.fieldDisplayName}
        cropName={crop.commonName}
        stageLabel={phenology.stageFao}
        dateWindowLabel={`Balance: ${windowRangeLabel}`}
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

      {/* Hero Card: Water Status at a Glance */}
      <HeroStatusCard
        imageSrc={cropImg}
        imageAlt={crop.commonName}
        imageTitle={crop.commonName}
        imageSubtitle={`${crop.defaultVariety} · As of ${latestDateLabel}`}
        heading="Water Status at a Glance"
        description={
          water.tawMm === null
            ? `As of ${latestDateLabel}, potential crop demand (ETc) for ${crop.commonName.toLowerCase()} is ${etcValue !== null ? `${etcValue.toFixed(1)} mm/day` : 'unavailable'} with ${periodTotals.totalRain.toFixed(1)} mm observed rainfall (${windowRangeLabel}). ${water.hydraulicAvailabilityReason || 'Root-zone depletion balance is unavailable until soil texture is confirmed.'}`
            : water.triggerActive &&
                water.currentDrMm !== null &&
                water.grossDepthMm !== null &&
                water.recommendedVolumeM3 !== null
              ? `As of ${latestDateLabel}, your ${crop.commonName.toLowerCase()} crop is using an estimated ${etcValue !== null ? etcValue.toFixed(1) : '—'} mm/day. Root-zone depletion (${water.currentDrMm.toFixed(1)} mm) has reached the refill trigger; apply ${water.grossDepthMm} mm (${water.recommendedVolumeM3.toLocaleString()} m³) to restore optimal moisture.`
              : `As of ${latestDateLabel}, your ${crop.commonName.toLowerCase()} crop is using an estimated ${etcValue !== null ? etcValue.toFixed(1) : '—'} mm/day. With ${periodTotals.totalRain.toFixed(1)} mm rainfall (${windowRangeLabel}) and ${moistureHeroValue} (${moistureHeroUnit}), no irrigation is required today.`
        }
        statusTone={water.tawMm === null ? 'warning' : water.triggerActive ? 'warning' : 'good'}
        statusText={
          water.tawMm === null
            ? 'Hydraulics unavailable — confirm soil texture'
            : water.triggerActive && water.grossDepthMm !== null
              ? `Irrigation due: ${water.grossDepthMm} mm gross`
              : 'No action currently indicated'
        }
        metrics={[
          {
            id: 'demand',
            icon: <Droplets className="w-5.5 h-5.5 text-[#29B9F3]" />,
            value: etcValue !== null ? etcValue.toFixed(1) : 'Unavailable',
            unitOrPeriod: 'mm/day',
            label: 'Crop Demand',
            dateLabel: latestDateLabel,
            onClick: () => onInspectMetric(metricsById.water_dr),
          },
          {
            id: 'rain',
            icon: <CloudRain className="w-5.5 h-5.5 text-[#67B8E6]" />,
            value: `${observedRain24h.toFixed(1)} mm`,
            unitOrPeriod: 'Latest Day',
            label: '(Rainfall)',
            dateLabel: latestDateLabel,
            onClick: () => onInspectMetric(metricsById.weather_rain),
          },
          {
            id: 'irrig',
            icon: <Sprout className="w-5.5 h-5.5 text-[#35E887]" />,
            value: `${Math.round(irrigation7dMm)} mm`,
            unitOrPeriod: 'Last 7 days',
            label: '(Irrigation)',
            dateLabel: rain7dRangeLabel,
          },
          {
            id: 'moisture',
            icon: <Layers className="w-5.5 h-5.5 text-[#F7BD31]" />,
            value: moistureHeroValue,
            unitOrPeriod: moistureHeroUnit,
            label: moistureToneText,
            dateLabel: water.observedMoistureDate
              ? formatSubDate(water.observedMoistureDate)
              : latestDateLabel,
            onClick: () => onInspectMetric(metricsById.water_dr),
          },
        ]}
      />

      {/* Section 2: How much water the crop is using */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={2}
          title="How much water the crop is using"
          dateLabel={`As of ${latestDateLabel}`}
          onInspect={() => onInspectMetric(metricsById.water_dr)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_1.12fr] gap-3.5 items-stretch">
          {/* Left: ETo / Kc / ETc + Formula Card */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_210px] gap-3 items-stretch">
            <IntelligenceInset className="grid grid-cols-3 divide-x divide-emerald-900/12 dark:divide-[#64AE7E]/22 py-3">
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">ET₀</div>
                <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {et0Value !== null ? et0Value.toFixed(1) : 'Unavailable'}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">mm/day</div>
              </div>
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">Kc</div>
                <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {kcValue.toFixed(2)}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">{phenology.stageFao}</div>
              </div>
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">ETc</div>
                <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {etcValue !== null ? etcValue.toFixed(1) : 'Unavailable'}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">mm/day</div>
              </div>
            </IntelligenceInset>

            <div className="rounded-[11px] border border-emerald-700/30 dark:border-[#13D987]/35 bg-emerald-500/10 dark:bg-[#05331E]/85 p-3 flex flex-col justify-center">
              <div className="text-[12.5px] font-bold text-[#0F766E] dark:text-[#43E6A1] tabular-nums">
                ETc = ET₀ × Kc
              </div>
              <p className="text-[11.5px] leading-[1.4] text-[#1B4D46] dark:text-[#C4D4CA] mt-1">
                ET₀ represents atmospheric demand, and Kc adjusts it for crop type and growth stage.
              </p>
            </div>
          </div>

          {/* Right: Growth Stage Kc Timeline */}
          <IntelligenceInset className="px-4 py-3 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3]">
              <span>Growth Stage Kc Timeline</span>
              <span className="text-[11px] font-normal text-[#3C6D59] dark:text-[#849B8C]">
                Planted {phenology.plantingDateLabel}
              </span>
            </div>
            <div className="relative pt-2.5 pb-1">
              <div className="h-[2.5px] w-full bg-emerald-900/15 dark:bg-[#64AE7E]/25 rounded-full" />
              <div className="grid grid-cols-4 gap-1 -mt-[8px]">
                {stageTimeline.map((st) => (
                  <div key={st.name} className="flex flex-col items-center text-center">
                    <span
                      className={`rounded-full transition-all ${
                        st.active
                          ? 'w-4 h-4 bg-[#35EC99] ring-4 ring-[#13D987]/25 -mt-[2px]'
                          : 'w-3 h-3 bg-emerald-800/30 dark:bg-[#64AE7E]/55'
                      }`}
                    />
                    <div
                      className={`text-[11.5px] mt-1.5 leading-tight ${
                        st.active
                          ? 'font-bold text-[#05291B] dark:text-white'
                          : 'font-medium text-[#3C6D59] dark:text-[#849B8C]'
                      }`}
                    >
                      {st.name}
                    </div>
                    <div className="text-[10.5px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                      ({st.range})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </IntelligenceInset>
        </div>

        {/* Lower Daily Crop Water Demand Chart */}
        <div className="pt-0.5">
          <div className="flex items-center justify-between text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] mb-1">
            <span>Daily Crop Water Demand</span>
            <span className="text-[11px] font-normal text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
              {windowRangeLabel}
            </span>
          </div>
          <SmoothLineSvgChart
            data={demandLinePoints}
            yUnit="mm/day"
            primaryLabel="ETc Demand"
            primaryColor="#35E887"
            averageValue={demandAverage}
            averageLabel={
              demandAverage !== undefined
                ? `Average (${demandAverage.toFixed(1)} mm/day)`
                : 'Average unavailable'
            }
            height={152}
          />
        </div>
      </IntelligenceCard>

      {/* Section 3: Where the water comes from */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={3}
          title="Where the water comes from"
          dateLabel={windowRangeLabel}
          onInspect={() => onInspectMetric(metricsById.weather_rain)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr_0.46fr] gap-3.5 items-stretch">
          {/* Left: Stacked Bar Chart */}
          <div className="flex flex-col justify-between">
            <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] mb-1">
              Water Sources ({windowRangeLabel})
            </div>
            <StackedBarSvgChart
              data={stackedSourceBars}
              yUnit="mm"
              seriesLabels={['Rainfall', 'Effective Rainfall', 'Irrigation']}
              seriesColors={['#168EDB', '#67B8E6', '#62D96D']}
            />
          </div>

          {/* Center: Compact History Table */}
          <IntelligenceInset className="overflow-hidden flex flex-col justify-between">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead className="bg-emerald-900/8 dark:bg-[#052B1C]/90 border-b border-emerald-900/12 dark:border-[#64AE7E]/20 text-[#2B5E56] dark:text-[#C4D4CA]">
                <tr>
                  <th className="py-2 px-3 font-semibold">Date</th>
                  <th className="py-2 px-2.5 font-semibold">Rainfall</th>
                  <th className="py-2 px-2.5 font-semibold">Eff. Rain</th>
                  <th className="py-2 px-2.5 font-semibold">Irrigation</th>
                  <th className="py-2 px-3 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-900/10 dark:divide-[#64AE7E]/15 tabular-nums">
                {sourceRecords.map((r, i) => (
                  <tr key={`${r.date}-${i}`} className="hover:bg-emerald-500/5">
                    <td className="py-2 px-3 font-medium text-[#2B5E56] dark:text-[#C4D4CA] whitespace-nowrap">
                      {r.date}
                    </td>
                    <td className="py-2 px-2.5 text-[#05291B] dark:text-[#F1F8F3] whitespace-nowrap">
                      {r.rainfall}
                    </td>
                    <td className="py-2 px-2.5 text-[#05291B] dark:text-[#F1F8F3] whitespace-nowrap">
                      {r.effectiveRain}
                    </td>
                    <td className="py-2 px-2.5 font-medium text-[#0F766E] dark:text-[#35EC99] whitespace-nowrap">
                      {r.irrigation}
                    </td>
                    <td className="py-2 px-3 text-[#3C6D59] dark:text-[#849B8C] whitespace-nowrap">
                      {r.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </IntelligenceInset>

          {/* Right: Rainfall vs Effective Rainfall Explanation */}
          <IntelligenceInset className="p-3.5 flex flex-col items-center justify-center text-center gap-2">
            <CloudRain className="w-7 h-7 text-[#32BDF0]" />
            <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] leading-snug">
              Rainfall vs Effective Rainfall
            </div>
            <p className="text-[11.5px] leading-[1.42] text-[#2B5E56] dark:text-[#C4D4CA]">
              Not all rainfall reaches the root zone. Effective rainfall accounts for runoff, infiltration and soil absorption.
            </p>
          </IntelligenceInset>
        </div>
      </IntelligenceCard>

      {/* Section 4: What is happening in the soil */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={4}
          title="What is happening in the soil"
          dateLabel={`As of ${latestDateLabel}`}
          infoText={
            soil.fcVwcPct !== null && soil.wpVwcPct !== null && water.tawMm !== null
              ? `Root-zone depth is estimated at 0–${rootDepthCm} cm for ${crop.commonName} (${phenology.stageFao}). Field capacity ${soil.fcVwcPct}% and wilting point ${soil.wpVwcPct}% determine Total Available Water (${water.tawMm} mm).`
              : water.hydraulicAvailabilityReason ||
                `Root-zone depth is estimated at 0–${rootDepthCm} cm for ${crop.commonName}. Confirm soil texture to compute FC, WP, and TAW.`
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-[235px_1fr_1fr] xl:grid-cols-[235px_1.05fr_0.85fr_1.35fr] gap-3.5 items-center">
          {/* Col 1: Soil Root-Zone Cross-Section */}
          <div className="relative h-[106px] rounded-[11px] overflow-hidden border border-emerald-900/15 dark:border-[#64AE7E]/28">
            <img
              src={rootZoneImg}
              alt="Soil root-zone cross section"
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/70" />
            <div className="absolute right-3 inset-y-2.5 flex items-center gap-1.5 text-white">
              <div className="h-full w-[1.5px] bg-white/85 relative">
                <span className="absolute -top-0.5 -left-[2.5px] w-1.5 h-1.5 border-t border-l border-white rotate-45" />
                <span className="absolute -bottom-0.5 -left-[2.5px] w-1.5 h-1.5 border-b border-r border-white rotate-45" />
              </div>
              <div className="text-[11px] font-semibold leading-tight text-right tabular-nums">
                <div>0–{rootDepthCm} cm</div>
                <div className="text-white/85 font-normal">Root Zone</div>
              </div>
            </div>
          </div>

          {/* Col 2: Soil Moisture Bar */}
          <IntelligenceInset className="p-3.5 space-y-2 h-full flex flex-col justify-center">
            <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">
              Soil Moisture ({latestDateLabel})
            </div>
            {water.estimatedMoistureVwcPct !== null ? (
              <>
                <div className="text-[22px] font-bold leading-none text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
                  {water.estimatedMoistureVwcPct}% VWC
                </div>
                <div className="h-2.5 w-full rounded-full bg-emerald-950/15 dark:bg-[#0D3824] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(8, water.estimatedMoistureVwcPct))}%`,
                      background: 'linear-gradient(90deg, #13D987, #43E6A1)',
                    }}
                  />
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                  Field Capacity {soil.fcVwcPct ?? '—'}% &nbsp;|&nbsp; Wilting Point{' '}
                  {soil.wpVwcPct ?? '—'}%
                </div>
                {water.observedMoisturePct !== null && water.moistureUnitAmbiguityNote && (
                  <div className="text-[10.5px] leading-[1.35] text-amber-800 dark:text-amber-300 pt-1 border-t border-emerald-900/10 dark:border-[#64AE7E]/15">
                    Observed {water.observedMoisturePct}% ({formatSoilMoistureUnitLabel(water.observedMoistureUnit)})
                    {water.observedMoistureDepth ? ` · ${water.observedMoistureDepth}` : ''}
                    {water.observedMoistureMethod ? ` · ${water.observedMoistureMethod}` : ''}
                    {' — '}excluded from VWC balance.
                  </div>
                )}
              </>
            ) : water.observedMoisturePct !== null ? (
              <>
                <div className="text-[22px] font-bold leading-none text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
                  {water.observedMoisturePct}%
                </div>
                <div className="text-[11px] font-semibold text-amber-700 dark:text-[#F8BC37]">
                  {formatSoilMoistureUnitLabel(water.observedMoistureUnit)}
                </div>
                {(water.observedMoistureDepth || water.observedMoistureMethod || water.observedMoistureDate) && (
                  <div className="text-[10.5px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                    {[
                      water.observedMoistureDepth,
                      water.observedMoistureMethod,
                      water.observedMoistureDate ? formatSubDate(water.observedMoistureDate) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
                {water.moistureUnitAmbiguityNote && (
                  <div className="text-[10.5px] leading-[1.35] text-[#2B5E56] dark:text-[#C4D4CA]">
                    {water.moistureUnitAmbiguityNote}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-[20px] font-bold leading-none text-[#3C6D59] dark:text-[#9BB5A6]">
                  Unavailable
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                  FC {soil.fcVwcPct !== null ? `${soil.fcVwcPct}%` : 'Unavailable'} &nbsp;|&nbsp; WP{' '}
                  {soil.wpVwcPct !== null ? `${soil.wpVwcPct}%` : 'Unavailable'}
                </div>
              </>
            )}
          </IntelligenceInset>

          {/* Col 3: Available Water */}
          <IntelligenceInset className="p-3.5 space-y-1.5 h-full flex flex-col justify-center">
            <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">
              Available Water
            </div>
            <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
              {availableWaterMm !== null ? `~ ${availableWaterMm} mm` : 'Unavailable'}
            </div>
            <div className="text-[11.5px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
              {water.tawMm !== null && water.currentDrMm !== null
                ? `TAW: ${water.tawMm} mm · Dr: ${water.currentDrMm.toFixed(1)} mm`
                : 'Soil texture required for TAW & Dr'}
            </div>
          </IntelligenceInset>

          {/* Col 4: Interpretation & View Soil Details Button */}
          <div className="md:col-span-3 xl:col-span-1 flex flex-col justify-between gap-3 h-full pl-0.5">
            <p className="text-[12px] leading-[1.45] text-[#1B4D46] dark:text-[#C4D4CA]">
              {water.tawMm !== null &&
              availableWaterMm !== null &&
              water.currentDrMm !== null &&
              water.rawMm !== null ? (
                <>
                  Your soil can store about {water.tawMm} mm of water in the root zone, with{' '}
                  {availableWaterMm} mm currently available ({latestDateLabel}).{' '}
                  {water.currentDrMm <= water.rawMm
                    ? `This is within the optimal range for ${crop.commonName.toLowerCase()}.`
                    : `Depletion has crossed RAW (${water.rawMm} mm); prepare an irrigation refill.`}
                </>
              ) : (
                water.hydraulicAvailabilityReason ||
                'Soil hydraulic capacity and root-zone depletion status are unavailable until soil texture is confirmed.'
              )}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onOpenSoilDetails || onOpenWaterConfigDrawer}
                className="h-[34px] px-4 rounded-[10px] bg-[#13D987] hover:bg-[#35EC99] text-[#003C2A] text-[12px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>View Soil Details →</span>
              </button>
            </div>
          </div>
        </div>
      </IntelligenceCard>

      {/* Section 5: Water Balance Over Time */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-2.5">
        <SectionHeading
          number={5}
          title="Daily Root-Zone Water Balance Over Time"
          dateLabel={windowRangeLabel}
          onInspect={() => onInspectMetric(metricsById.water_dr)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_235px] gap-3.5 items-stretch">
          {balanceMixedData.length === 0 ? (
            <IntelligenceInset className="p-5 flex items-center justify-center text-center text-[12px] text-[#2B5E56] dark:text-[#849B8C] min-h-[142px]">
              {water.hydraulicAvailabilityReason ||
                'Daily root-zone storage and depletion balance are unavailable until soil texture is confirmed.'}
            </IntelligenceInset>
          ) : (
            <MixedBalanceSvgChart
              data={balanceMixedData}
              yUnit="mm"
              labels={{
                lineA: 'ETc Crop Use (mm/d)',
                barA: 'Effective Rain (mm)',
                barB: 'Irrigation (mm)',
                lineB: 'Soil Storage (mm)',
              }}
            />
          )}

          <IntelligenceInset className="p-3.5 flex flex-col justify-between gap-2">
            <div>
              <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3]">
                {windowDays}-Day Summary
              </div>
              <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                {windowRangeLabel}
              </div>
            </div>
            <div className="divide-y divide-emerald-900/10 dark:divide-[#64AE7E]/18 text-[12px] tabular-nums">
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[#2B5E56] dark:text-[#C4D4CA]">Total ETc Demand</span>
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">
                  {periodTotals.totalEtc !== null
                    ? `${periodTotals.totalEtc.toFixed(1)} mm`
                    : 'Unavailable'}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[#2B5E56] dark:text-[#C4D4CA]">Total Rainfall</span>
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">
                  {periodTotals.totalRain.toFixed(1)} mm
                </span>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[#2B5E56] dark:text-[#C4D4CA]">Total Irrigation</span>
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">
                  {periodTotals.totalIrr.toFixed(1)} mm
                </span>
              </div>
              <div className="pt-2 flex items-center justify-between gap-2">
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">Net Balance</span>
                <span
                  className={`font-bold text-[13px] ${
                    periodTotals.net === null
                      ? 'text-[#3C6D59] dark:text-[#849B8C]'
                      : periodTotals.net >= 0
                        ? 'text-emerald-700 dark:text-[#35EC99]'
                        : 'text-amber-700 dark:text-[#F8BC37]'
                  }`}
                >
                  {periodTotals.net !== null
                    ? `${periodTotals.net >= 0 ? '+' : ''}${periodTotals.net.toFixed(1)} mm`
                    : 'Unavailable'}
                </span>
              </div>
            </div>
          </IntelligenceInset>
        </div>
      </IntelligenceCard>

      {/* Section 6: Irrigation Requirement and Schedule */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={6}
          title="Irrigation Requirement and Schedule"
          dateLabel={`Window: ${bestWindowLabel}`}
          infoText={water.runtimeNote}
        />

        <div className="grid grid-cols-1 md:grid-cols-[260px_200px_1fr_auto] gap-3.5 items-center">
          {/* Recommended Irrigation */}
          <IntelligenceInset className="px-3.5 py-3 flex items-center gap-3">
            <Droplets className="w-8 h-8 text-[#32BDF0] shrink-0" />
            <div className="min-w-0">
              <div className="text-[11.5px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">
                Recommended Irrigation
              </div>
              <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
                {water.grossDepthMm !== null ? `${water.grossDepthMm} mm` : 'Unavailable'}
              </div>
              <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                {water.recommendedVolumeM3 !== null
                  ? `≈ ${water.recommendedVolumeM3.toLocaleString()} m³ for ${bundle.areaHa.toFixed(1)} ha`
                  : 'Requires soil texture & VWC balance'}
              </div>
            </div>
          </IntelligenceInset>

          {/* Schedule Block */}
          <IntelligenceInset className="px-3.5 py-3 flex items-center gap-3">
            <Calendar className="w-5.5 h-5.5 text-[#32BDF0] shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">Schedule Status</div>
              <div className="text-[15px] font-bold text-[#05291B] dark:text-[#F1F8F3]">
                {water.tawMm === null
                  ? 'Texture required'
                  : water.triggerActive
                    ? '1 cycle due'
                    : 'Standby'}
              </div>
              <div className="text-[11px] text-[#2B5E56] dark:text-[#C4D4CA] mt-0.5 tabular-nums">
                Next Window: <strong className="text-[#05291B] dark:text-white">{bestWindowLabel}</strong>
              </div>
            </div>
          </IntelligenceInset>

          {/* Explanatory Recommendation */}
          <p className="text-[12px] leading-[1.45] text-[#1B4D46] dark:text-[#C4D4CA]">
            {water.tawMm === null || water.rawMm === null
              ? water.hydraulicAvailabilityReason ||
                'Confirm soil texture before computing RAW refill triggers and irrigation volume.'
              : water.triggerActive && water.grossDepthMm !== null
                ? `Based on soil moisture (${latestDateLabel}) and forecast, your crop needs ${water.grossDepthMm} mm of irrigation to reach the target root-zone level (${bestWindowLabel}).`
                : `Soil water remains within the readily available buffer (RAW ${water.rawMm} mm) as of ${latestDateLabel}. ${
                    disclosureMode === 'advanced'
                      ? water.runtimeNote
                      : 'Log any applied pulses to keep the water balance calibrated.'
                  }`}
          </p>

          {/* Add to Schedule Button */}
          <button
            type="button"
            onClick={() => setShowLogForm((v) => !v)}
            className="h-[38px] px-4.5 rounded-[10px] bg-[#13D987] hover:bg-[#35EC99] text-[#003C2A] text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Add to Schedule</span>
            <Plus className="w-4 h-4 stroke-[2.6]" />
          </button>
        </div>

        {/* Interactive Irrigation Scheduling / Logging Form */}
        {showLogForm && (
          <form
            onSubmit={handleLogSubmit}
            className="rounded-[11px] border border-emerald-700/25 dark:border-[#13D987]/35 bg-emerald-50/85 dark:bg-[#00190E]/90 p-3.5 flex flex-wrap items-end gap-3"
          >
            <div>
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                Scheduled / Applied Date
              </label>
              <input
                type="date"
                value={irrDate}
                onChange={(e) => setIrrDate(e.target.value)}
                className="px-3 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                Volume (m³)
              </label>
              <input
                type="number"
                min="1"
                step="0.5"
                required
                value={irrVolume}
                onChange={(e) => setIrrVolume(e.target.value)}
                className="w-32 px-3 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white tabular-nums"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                Block / Flow Notes
              </label>
              <input
                type="text"
                value={irrNotes}
                onChange={(e) => setIrrNotes(e.target.value)}
                placeholder="Drip zone cycle or pump run duration…"
                className="w-full px-3 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={savingLog}
              className="h-[36px] px-4 rounded-[8px] bg-[#13D987] text-[#003C2A] text-[12px] font-bold cursor-pointer"
            >
              {savingLog ? 'Saving…' : 'Confirm Irrigation Event'}
            </button>
          </form>
        )}
      </IntelligenceCard>

      {/* Bottom Row: Section 7, Section 8, Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr_240px] gap-3.5 items-stretch">
        {/* Section 7: Cumulative Water Use */}
        <IntelligenceCard className="p-4 lg:p-4.5 flex flex-col justify-between gap-2.5">
          <SectionHeading
            number={7}
            title="Cumulative Water Demand"
            dateLabel={windowRangeLabel}
          />
          {historicalCompareData.length === 0 ? (
            <div className="h-[135px] flex items-center justify-center text-center px-3 text-[12px] text-[#2B5E56] dark:text-[#849B8C]">
              {water.hydraulicAvailabilityReason ||
                'Cumulative adjusted ETc requires confirmed soil texture for daily water balance.'}
            </div>
          ) : (
            <ComparisonLineSvgChart
              data={historicalCompareData}
              yUnit="mm"
              currentLabel="Adjusted ETc (Cum.)"
              baselineLabel={compareBaseline === 'potential' ? 'Potential ETc (Cum.)' : 'Reference ET₀ (Cum.)'}
            />
          )}
        </IntelligenceCard>

        {/* Section 8: Data Sources, Quality & Limitations */}
        <DataQualityCard
          dateLabel={latestDateLabel}
          rows={[
            {
              dataType: 'Weather Data',
              source: weather.providerStatus === 'Connected' ? 'Open-Meteo' : 'Cached NWP',
              updatedDate: latestDateLabel,
              quality: weather.providerStatus === 'Connected' ? 'High' : 'Medium',
              basis: weather.providerStatus === 'Connected' ? 'Live NWP' : 'Cached',
            },
            {
              dataType: 'Rainfall',
              source: weather.nasaPowerStatus === 'Connected' ? 'NASA POWER' : 'Weather API',
              updatedDate: formatSubDate(timestamps.nasaLatestDate ?? timestamps.nasaPowerFetchedAt),
              quality: 'High',
              basis: weather.nasaPowerStatus === 'Connected' ? 'Satellite grid' : 'NWP fallback',
            },
            {
              dataType: 'Soil Data',
              source:
                soil.texture === 'Unknown'
                  ? 'Unknown Texture'
                  : soil.textureSource === 'Farmer-reported'
                    ? 'Field Survey'
                    : 'Pedotransfer',
              updatedDate: formatSubDate(timestamps.soilUpdatedAt),
              quality: soil.texture === 'Unknown' ? 'Low' : soil.textureSource === 'Farmer-reported' ? 'Medium' : 'Low',
              basis: soil.texture === 'Unknown' ? 'Texture missing' : 'Pedotransfer',
            },
            {
              dataType: 'Model',
              source: 'FAO-56',
              updatedDate: latestDateLabel,
              quality: 'High',
              basis: 'FAO-56 Ref.',
            },
          ]}
          onViewDetails={() => onInspectMetric(metricsById.water_dr)}
        />

        {/* Quick Actions */}
        <QuickActionsCard
          onViewFullReport={() => setReportOpen(true)}
          onDownloadPdf={() => window.print()}
          thirdActionLabel={compareBaseline === 'potential' ? 'Compare vs ET₀' : 'Compare vs Potential'}
          onThirdAction={() =>
            setCompareBaseline((b) => (b === 'potential' ? 'et0' : 'potential'))
          }
        />
      </div>

      <FullReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`Water Intelligence — ${bundle.fieldDisplayName}`}
        subtitle={`${crop.commonName} (${crop.defaultVariety}) · ${windowRangeLabel}`}
        stats={[
          {
            label: 'Crop ETc Demand',
            value: etcValue !== null ? `${etcValue.toFixed(1)} mm/d` : 'Unavailable',
          },
          {
            label: 'Soil Moisture',
            value:
              water.estimatedMoistureVwcPct !== null
                ? `${water.estimatedMoistureVwcPct}% VWC`
                : water.observedMoisturePct !== null
                  ? `${water.observedMoisturePct}% (${formatSoilMoistureUnitLabel(water.observedMoistureUnit)})`
                  : 'Unavailable',
          },
          {
            label: 'Available Water',
            value:
              availableWaterMm !== null && water.tawMm !== null
                ? `${availableWaterMm} / ${water.tawMm} mm`
                : 'Unavailable',
          },
          {
            label: 'Net Period Balance',
            value:
              periodTotals.net !== null
                ? `${periodTotals.net >= 0 ? '+' : ''}${periodTotals.net.toFixed(1)} mm`
                : 'Unavailable',
          },
        ]}
        paragraphs={reports.waterSummary}
        onPrint={() => window.print()}
      />
    </div>
  );
};
