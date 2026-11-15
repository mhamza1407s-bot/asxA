import React, { useMemo, useState } from 'react';
import { CloudRain, Flame, RefreshCw, Sun, Thermometer, Wind } from 'lucide-react';
import { PortfolioFieldRecord } from '../../../../types/myFarms';
import { FieldAgronomyBundle, InspectableMetric } from '../../../../lib/fieldAgronomyEngine';
import { ExtendedFieldWeatherResult } from '../../../../services/weather';
import weatherHorizonImg from '../../../../assets/images/weather_field_horizon_1794737932608.jpg';
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

interface WeatherClimateViewProps {
  fields?: PortfolioFieldRecord[];
  selectedField?: PortfolioFieldRecord | null;
  onSelectField?: (fieldId: string) => void;
  bundle: FieldAgronomyBundle;
  extendedWeather: ExtendedFieldWeatherResult | null;
  areaLabel: string;
  tempUnit: 'C' | 'F';
  windUnit: 'km/h' | 'mph';
  disclosureMode: DisclosureMode;
  onChangeDisclosureMode: (m: DisclosureMode) => void;
  onInspectMetric: (metric: InspectableMetric) => void;
  onRefresh: () => void;
  loading: boolean;
  isOnline: boolean;
  weatherError: string | null;
}

export const WeatherClimateView: React.FC<WeatherClimateViewProps> = ({
  fields = [],
  selectedField,
  onSelectField,
  bundle,
  extendedWeather,
  tempUnit,
  windUnit,
  onInspectMetric,
  onRefresh,
  loading,
  isOnline,
  weatherError,
}) => {
  const { weather, crop, phenology, metricsById, reports, timestamps } = bundle;
  const [period, setPeriod] = useState<ReportingPeriodKey>('14d');
  const [reportOpen, setReportOpen] = useState(false);
  const [baselineMode, setBaselineMode] = useState<'precip' | 'temp'>('precip');

  const toDispTemp = (c: number | null | undefined) => {
    if (c === null || c === undefined || !Number.isFinite(c)) return null;
    return tempUnit === 'F' ? Number(((c * 9) / 5 + 32).toFixed(1)) : Number(c.toFixed(1));
  };
  const fmtTemp = (c: number | null | undefined) => {
    const v = toDispTemp(c);
    return v !== null ? `${v}°${tempUnit}` : '—';
  };
  const fmtWind = (kmh: number | null | undefined) => {
    if (kmh === null || kmh === undefined || !Number.isFinite(kmh)) return '—';
    return windUnit === 'mph' ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
  };

  const windowDays = period === '7d' ? 7 : period === '14d' ? 14 : 30;
  const pastSeries = useMemo(
    () => weather.combinedDailySeries.filter((d) => !d.isForecast).slice(-windowDays),
    [weather.combinedDailySeries, windowDays]
  );
  const forecastSeries = useMemo(
    () => weather.combinedDailySeries.filter((d) => d.isForecast),
    [weather.combinedDailySeries]
  );

  const periodStartIso = pastSeries[0]?.date ?? timestamps.pastWindowStart;
  const periodEndIso = pastSeries[pastSeries.length - 1]?.date ?? timestamps.pastWindowEnd;
  const forecastStartIso = forecastSeries[0]?.date ?? timestamps.forecastStart;
  const forecastEndIso = forecastSeries[forecastSeries.length - 1]?.date ?? timestamps.forecastEnd;

  const periodRangeLabel = formatSubDateRange(periodStartIso, periodEndIso);
  const fullHorizonLabel = formatSubDateRange(periodStartIso, forecastEndIso ?? periodEndIso);
  const forecastRangeLabel = formatSubDateRange(forecastStartIso, forecastEndIso);
  const observedStampLabel = formatSubDateTime(
    timestamps.weatherObservedAt ?? timestamps.weatherFetchedAt ?? timestamps.nasaPowerFetchedAt
  );
  const latestDay = pastSeries[pastSeries.length - 1];
  const latestDateLabel = formatSubDate(latestDay?.date ?? periodEndIso);

  const periodRainMm = useMemo(
    () => Number(pastSeries.reduce((s, d) => s + (d.precipMm ?? 0), 0).toFixed(1)),
    [pastSeries]
  );

  const meanTempDisp = toDispTemp(weather.currentTempC ?? latestDay?.tMeanC ?? null);
  const solarToday = latestDay?.solarMjM2 ?? null;

  const tempLinePoints = useMemo(() => {
    const series = [...pastSeries, ...forecastSeries.slice(0, 4)];
    return series
      .filter((d) => d.tMaxC !== null)
      .map((d) => ({
        label: d.shortDate,
        value: toDispTemp(d.tMaxC) ?? 0,
        secondary: toDispTemp(d.tMinC),
      }));
  }, [pastSeries, forecastSeries, tempUnit]);

  const avgTmax = useMemo(() => {
    if (tempLinePoints.length === 0) return toDispTemp(weather.baselineMeanMaxC ?? 24) ?? 24;
    return Number(
      (tempLinePoints.reduce((s, p) => s + p.value, 0) / tempLinePoints.length).toFixed(1)
    );
  }, [tempLinePoints, weather.baselineMeanMaxC, tempUnit]);

  // Section 3: Stacked Rain Bars (Observed vs Forecast)
  const rainStackedBars = useMemo(() => {
    const combined = [...pastSeries.slice(-5), ...forecastSeries.slice(0, 3)];
    return combined.map((d) => ({
      label: d.shortDate,
      base: !d.isForecast ? d.precipMm ?? 0 : 0,
      mid: d.isForecast ? d.precipMm ?? 0 : 0,
      top: d.et0Mm ?? 0,
    }));
  }, [pastSeries, forecastSeries]);

  // Section 3: Weather Comparison Table with Explicit Full Dates
  const tableRows = useMemo(() => {
    const merged = [...pastSeries.slice(-3).reverse(), ...forecastSeries.slice(0, 3)];
    return merged.map((d) => ({
      date: formatSubDate(d.date),
      range: `${toDispTemp(d.tMaxC) ?? '—'}° / ${toDispTemp(d.tMinC) ?? '—'}°`,
      rain: `${(d.precipMm ?? 0).toFixed(1)} mm`,
      et0: d.et0Mm !== null ? `${d.et0Mm.toFixed(1)} mm` : '—',
      source: d.isForecast
        ? 'Open-Meteo Fcst'
        : d.sourceKind === 'NASA POWER'
          ? 'NASA POWER'
          : 'Open-Meteo Obs',
    }));
  }, [pastSeries, forecastSeries, tempUnit]);

  // Section 5: Mixed Thermal + Rainfall + ET0 series
  const mixedClimateData = useMemo(() => {
    return pastSeries.map((d) => ({
      label: d.shortDate,
      barA: Number((d.precipMm ?? 0).toFixed(1)),
      barB: Number((d.gddDay ?? 0).toFixed(1)),
      lineA: Number((d.et0Mm ?? 0).toFixed(1)),
      lineB: Number((toDispTemp(d.tMaxC) ?? 0).toFixed(1)),
    }));
  }, [pastSeries, tempUnit]);

  // Section 7: 21-Year Baseline Comparison (using real NASA POWER climatology baselineMeanMaxC when temp mode active)
  const baselineComparisonData = useMemo(() => {
    if (weather.yearlyBaselineSeries.length > 0 && baselineMode === 'precip') {
      const recentSlice = weather.yearlyBaselineSeries.slice(-6);
      const meanP = weather.rainBaselineMean30dMm ?? 0;
      return recentSlice.map((y) => ({
        label: String(y.year),
        current: Number((y.totalPrecipMm ?? 0).toFixed(1)),
        baseline: Number(meanP.toFixed(1)),
      }));
    }
    const baselineTempNormalC = weather.baselineMeanMaxC ?? latestDay?.tMaxC ?? weather.currentTempC ?? 22;
    const baselineDisp = toDispTemp(baselineTempNormalC) ?? 22;
    return pastSeries.slice(-6).map((d) => ({
      label: d.shortDate,
      current: Number((toDispTemp(d.tMaxC) ?? baselineDisp).toFixed(1)),
      baseline: Number(baselineDisp.toFixed(1)),
    }));
  }, [
    weather.yearlyBaselineSeries,
    weather.rainBaselineMean30dMm,
    weather.baselineMeanMaxC,
    weather.currentTempC,
    latestDay?.tMaxC,
    pastSeries,
    baselineMode,
    tempUnit,
  ]);

  const baselineYearsSpan = useMemo(() => {
    if (weather.yearlyBaselineSeries.length === 0) return periodRangeLabel;
    const firstY = weather.yearlyBaselineSeries[0]?.year;
    const lastY = weather.yearlyBaselineSeries[weather.yearlyBaselineSeries.length - 1]?.year;
    return firstY && lastY ? `Years ${firstY}–${lastY}` : '21-Yr Baseline';
  }, [weather.yearlyBaselineSeries, periodRangeLabel]);

  const thermalThresholds = [
    {
      name: 'Frost Limit',
      range: `${crop.frostThresholdC}°C`,
      active: (weather.currentTempC ?? 20) <= crop.frostThresholdC + 2,
    },
    {
      name: 'Growth Base',
      range: `${crop.tBaseC}°C`,
      active:
        (weather.currentTempC ?? 20) > crop.frostThresholdC + 2 &&
        (weather.currentTempC ?? 20) < crop.tUpperC - 4,
    },
    {
      name: 'Optimal Cap',
      range: `${crop.tUpperC}°C`,
      active:
        (weather.currentTempC ?? 20) >= crop.tUpperC - 4 &&
        (weather.currentTempC ?? 20) < crop.heatThresholdC,
    },
    {
      name: 'Heat Stress',
      range: `${crop.heatThresholdC}°C`,
      active: (weather.currentTempC ?? 20) >= crop.heatThresholdC,
    },
  ];

  const hasStressWarning = weather.heatStressDays30d > 2 || weather.drySpellDays >= 10;
  const hourlyTimeLabel = extendedWeather?.next24hHourly?.[0]?.timeIso
    ? formatSubDateTime(extendedWeather.next24hHourly[0].timeIso)
    : observedStampLabel;

  return (
    <div className="space-y-3.5 w-full">
      <IntelligenceHeader
        icon={
          <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#FBBF24] via-[#38BDF8] to-[#0EA5E9] flex items-center justify-center shadow-[0_4px_14px_rgba(56,189,248,0.35)]">
            <Sun className="w-5.5 h-5.5 text-white" />
          </div>
        }
        title="Weather & Climate Intelligence"
        subtitle="Track field temperature, reference evapotranspiration (ET₀), solar energy, and rainfall against 21-year NASA POWER baselines."
        fieldDisplayName={bundle.fieldDisplayName}
        cropName={crop.commonName}
        stageLabel={phenology.stageFao}
        dateWindowLabel={`Data: ${periodRangeLabel}`}
        fields={fields}
        selectedFieldId={selectedField?.id ?? null}
        onSelectField={onSelectField}
        period={period}
        onChangePeriod={setPeriod}
        updatedLabel={observedStampLabel}
        onRefresh={onRefresh}
        refreshLoading={loading}
        isOnline={isOnline}
      />

      {weatherError && (
        <div className="rounded-[12px] border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[12px] text-amber-900 dark:text-amber-200">
          {weatherError}
        </div>
      )}

      {/* Hero Card: Climate Status at a Glance */}
      <HeroStatusCard
        imageSrc={weatherHorizonImg}
        imageAlt="Field weather horizon"
        imageTitle={bundle.fieldCode}
        imageSubtitle={`${crop.commonName} · ${weather.providerStatus} (${latestDateLabel})`}
        heading="Climate Status at a Glance"
        description={
          reports.weatherSummary[0] ||
          `Gridded observations (${periodRangeLabel}) show ${fmtTemp(weather.currentTempC)} current air temperature, ${weather.humidityPct ?? '—'}% relative humidity, and ${periodRainMm.toFixed(1)} mm rainfall over the last ${windowDays} days.`
        }
        statusTone={hasStressWarning ? 'warning' : 'good'}
        statusText={
          hasStressWarning
            ? `${weather.heatStressDays30d} heat days · ${weather.drySpellDays}d dry spell`
            : 'Thermal & solar profile favourable'
        }
        metrics={[
          {
            id: 'temp',
            icon: <Thermometer className="w-5.5 h-5.5 text-[#F7BD31]" />,
            value: fmtTemp(weather.currentTempC),
            unitOrPeriod: 'Air Temp',
            label: `RH ${weather.humidityPct ?? '—'}%`,
            dateLabel: latestDateLabel,
            onClick: () => onInspectMetric(metricsById.weather_temp),
          },
          {
            id: 'et0',
            icon: <Sun className="w-5.5 h-5.5 text-[#35E887]" />,
            value: weather.et0TodayMm !== null ? weather.et0TodayMm.toFixed(1) : '—',
            unitOrPeriod: 'mm/day',
            label: 'Reference ET₀',
            dateLabel: latestDateLabel,
            onClick: () => onInspectMetric(metricsById.weather_et0),
          },
          {
            id: 'rain',
            icon: <CloudRain className="w-5.5 h-5.5 text-[#29B9F3]" />,
            value: `${periodRainMm.toFixed(1)} mm`,
            unitOrPeriod: `Last ${windowDays}d`,
            label: `Fcst +7d: ${weather.forecastRain7dMm.toFixed(1)} mm`,
            dateLabel: periodRangeLabel,
            onClick: () => onInspectMetric(metricsById.weather_rain),
          },
          {
            id: 'gdd',
            icon: <Flame className="w-5.5 h-5.5 text-[#F97316]" />,
            value: `${phenology.gdd30dAccumulated.toFixed(0)}`,
            unitOrPeriod: '°C·d GDD',
            label: '30d Thermal Sum',
            dateLabel: formatSubDateRange(timestamps.pastWindowStart, timestamps.pastWindowEnd),
          },
        ]}
      />

      {/* Section 2: Thermal Regime & Growing Degree Days */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={2}
          title="Thermal regime, solar energy & crop temperature thresholds"
          dateLabel={`Series: ${fullHorizonLabel}`}
          onInspect={() => onInspectMetric(metricsById.weather_temp)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_1.12fr] gap-3.5 items-stretch">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_215px] gap-3 items-stretch">
            <IntelligenceInset className="grid grid-cols-3 divide-x divide-emerald-900/12 dark:divide-[#64AE7E]/22 py-3">
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">Mean</div>
                <div className="text-[22px] font-bold text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {meanTempDisp !== null ? `${meanTempDisp}°` : '—'}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">
                  °{tempUnit} · {latestDateLabel}
                </div>
              </div>
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">VPD</div>
                <div className="text-[22px] font-bold text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {weather.vpdKpa !== null ? weather.vpdKpa.toFixed(2) : '—'}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">
                  kPa · {latestDateLabel}
                </div>
              </div>
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">Solar</div>
                <div className="text-[22px] font-bold text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {solarToday !== null ? solarToday.toFixed(1) : '—'}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">MJ/m²</div>
              </div>
            </IntelligenceInset>

            <div className="rounded-[11px] border border-emerald-700/30 dark:border-[#13D987]/35 bg-emerald-500/10 dark:bg-[#05331E]/85 p-3 flex flex-col justify-center">
              <div className="text-[12.5px] font-bold text-[#0F766E] dark:text-[#43E6A1] tabular-nums">
                GDD = ((Tmax + Tmin)/2) − Tbase
              </div>
              <p className="text-[11.5px] leading-[1.4] text-[#1B4D46] dark:text-[#C4D4CA] mt-1">
                Base {crop.tBaseC}°C and upper cap {crop.tUpperC}°C govern {crop.commonName.toLowerCase()} thermal pacing.
              </p>
            </div>
          </div>

          <IntelligenceInset className="px-4 py-3 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3]">
              <span>Crop Thermal Threshold Bands ({crop.commonName})</span>
              <span className="text-[11px] font-normal text-[#3C6D59] dark:text-[#849B8C]">
                As of {latestDateLabel}
              </span>
            </div>
            <div className="relative pt-2.5 pb-1">
              <div className="h-[2.5px] w-full bg-emerald-900/15 dark:bg-[#64AE7E]/25 rounded-full" />
              <div className="grid grid-cols-4 gap-1 -mt-[8px]">
                {thermalThresholds.map((th) => (
                  <div key={th.name} className="flex flex-col items-center text-center">
                    <span
                      className={`rounded-full ${
                        th.active
                          ? 'w-4 h-4 bg-[#35EC99] ring-4 ring-[#13D987]/25 -mt-[2px]'
                          : 'w-3 h-3 bg-emerald-800/30 dark:bg-[#64AE7E]/55'
                      }`}
                    />
                    <div
                      className={`text-[11.5px] mt-1.5 leading-tight ${
                        th.active
                          ? 'font-bold text-[#05291B] dark:text-white'
                          : 'font-medium text-[#3C6D59] dark:text-[#849B8C]'
                      }`}
                    >
                      {th.name}
                    </div>
                    <div className="text-[10.5px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                      ({th.range})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </IntelligenceInset>
        </div>

        <div>
          <div className="flex items-center justify-between text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] mb-1">
            <span>Daily Maximum &amp; Minimum Temperature Trajectory</span>
            <span className="text-[11px] font-normal text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
              {fullHorizonLabel}
            </span>
          </div>
          <SmoothLineSvgChart
            data={tempLinePoints}
            yUnit={`°${tempUnit}`}
            primaryLabel="Tmax"
            primaryColor="#35E887"
            secondaryLabel="Tmin"
            secondaryColor="#38BDF8"
            averageValue={avgTmax}
            averageLabel={`Mean Tmax (${avgTmax}°${tempUnit})`}
            height={152}
          />
        </div>
      </IntelligenceCard>

      {/* Section 3: Rainfall & Forecast Separation */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={3}
          title="Observed reanalysis vs Open-Meteo 7-day forecast"
          dateLabel={`Fcst: ${forecastRangeLabel}`}
          onInspect={() => onInspectMetric(metricsById.weather_rain)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr_0.46fr] gap-3.5 items-stretch">
          <div className="flex flex-col justify-between">
            <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] mb-1">
              Precipitation &amp; ET₀ Split
            </div>
            <StackedBarSvgChart
              data={rainStackedBars}
              yUnit="mm"
              seriesLabels={['Observed Rain', 'Forecast Rain', 'ET₀ Demand']}
              seriesColors={['#168EDB', '#67B8E6', '#62D96D']}
            />
          </div>

          <IntelligenceInset className="overflow-hidden flex flex-col justify-between">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead className="bg-emerald-900/8 dark:bg-[#052B1C]/90 border-b border-emerald-900/12 dark:border-[#64AE7E]/20 text-[#2B5E56] dark:text-[#C4D4CA]">
                <tr>
                  <th className="py-2 px-3 font-semibold">Date</th>
                  <th className="py-2 px-2.5 font-semibold">Max / Min</th>
                  <th className="py-2 px-2.5 font-semibold">Rain</th>
                  <th className="py-2 px-2.5 font-semibold">ET₀</th>
                  <th className="py-2 px-3 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-900/10 dark:divide-[#64AE7E]/15 tabular-nums">
                {tableRows.map((r, i) => (
                  <tr key={`${r.date}-${i}`} className="hover:bg-emerald-500/5">
                    <td className="py-2 px-3 font-medium text-[#2B5E56] dark:text-[#C4D4CA] whitespace-nowrap">
                      {r.date}
                    </td>
                    <td className="py-2 px-2.5 text-[#05291B] dark:text-[#F1F8F3] whitespace-nowrap">
                      {r.range}
                    </td>
                    <td className="py-2 px-2.5 text-[#29B9F3] font-medium whitespace-nowrap">
                      {r.rain}
                    </td>
                    <td className="py-2 px-2.5 text-[#05291B] dark:text-[#F1F8F3] whitespace-nowrap">
                      {r.et0}
                    </td>
                    <td className="py-2 px-3 text-[#3C6D59] dark:text-[#849B8C] whitespace-nowrap">
                      {r.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </IntelligenceInset>

          <IntelligenceInset className="p-3.5 flex flex-col items-center justify-center text-center gap-2">
            <CloudRain className="w-7 h-7 text-[#32BDF0]" />
            <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] leading-snug">
              Reanalysis vs NWP Forecast
            </div>
            <p className="text-[11.5px] leading-[1.42] text-[#2B5E56] dark:text-[#C4D4CA]">
              Past rows use NASA POWER / reanalysis ({periodRangeLabel}); upcoming rows use Open-Meteo NWP forecast ({forecastRangeLabel}).
            </p>
          </IntelligenceInset>
        </div>
      </IntelligenceCard>

      {/* Section 4: Atmospheric Demand & Wind Profile */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={4}
          title="Atmospheric demand, humidity & boundary-layer wind"
          dateLabel={`Observed: ${observedStampLabel}`}
          onInspect={() => onInspectMetric(metricsById.weather_et0)}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-[235px_1.05fr_0.85fr_1.35fr] gap-3.5 items-center">
          <IntelligenceInset className="p-3.5 min-h-[106px] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[12px] font-semibold text-[#05291B] dark:text-[#F1F8F3]">
              <span>24h Diurnal Point</span>
              <Sun className="w-4.5 h-4.5 text-[#F7BD31]" />
            </div>
            <div className="text-[21px] font-bold text-[#05291B] dark:text-white tabular-nums">
              {extendedWeather?.next24hHourly?.[0]
                ? `${toDispTemp(extendedWeather.next24hHourly[0].tempC)}°${tempUnit}`
                : fmtTemp(weather.currentTempC)}
            </div>
            <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
              {hourlyTimeLabel} · {weather.pressureHpa ?? '—'} hPa
            </div>
          </IntelligenceInset>

          <IntelligenceInset className="p-3.5 space-y-2 h-full flex flex-col justify-center">
            <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">
              Relative Humidity ({latestDateLabel})
            </div>
            <div className="text-[22px] font-bold leading-none text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
              {weather.humidityPct !== null ? `${weather.humidityPct}%` : '—'}
            </div>
            <div className="h-2.5 w-full rounded-full bg-emerald-950/15 dark:bg-[#0D3824] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(8, weather.humidityPct ?? 50))}%`,
                  background: 'linear-gradient(90deg, #29B9F3, #43E6A1)',
                }}
              />
            </div>
            <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
              Dew Pt {fmtTemp(weather.dewPointC)} · VPD {weather.vpdKpa?.toFixed(2) ?? '—'} kPa
            </div>
          </IntelligenceInset>

          <IntelligenceInset className="p-3.5 space-y-1.5 h-full flex flex-col justify-center">
            <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">
              2 m Wind (u₂)
            </div>
            <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums flex items-center gap-2">
              <Wind className="w-4.5 h-4.5 text-[#43E6A1]" />
              <span>{weather.wind2mMs !== null ? `${weather.wind2mMs.toFixed(1)} m/s` : '—'}</span>
            </div>
            <div className="text-[11.5px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
              Gust Peak: {fmtWind(weather.gustKmh)} ({weather.windDirCompass})
            </div>
          </IntelligenceInset>

          <div className="md:col-span-3 xl:col-span-1 flex flex-col justify-between gap-3 h-full">
            <p className="text-[12px] leading-[1.45] text-[#1B4D46] dark:text-[#C4D4CA]">
              {bundle.spatialCoverageNote}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onInspectMetric(metricsById.weather_et0)}
                className="h-[34px] px-4 rounded-[10px] bg-[#13D987] hover:bg-[#35EC99] text-[#003C2A] text-[12px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>Inspect ET₀ Math →</span>
              </button>
            </div>
          </div>
        </div>
      </IntelligenceCard>

      {/* Section 5: Multi-Series Weather & Heat Over Time */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-2.5">
        <SectionHeading
          number={5}
          title="Thermal Accumulation & Precipitation Over Time"
          dateLabel={periodRangeLabel}
          onInspect={() => onInspectMetric(metricsById.weather_temp)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_235px] gap-3.5 items-stretch">
          <MixedBalanceSvgChart
            data={mixedClimateData}
            yUnit={`°${tempUnit}/mm`}
            labels={{
              lineA: 'ET₀ (mm)',
              barA: 'Rain (mm)',
              barB: 'GDD (°C·d)',
              lineB: `Tmax (°${tempUnit})`,
            }}
            colors={{
              barA: '#2199D6',
              barB: '#74CB5C',
              lineA: '#36D989',
              lineB: '#F7BD31',
            }}
          />

          <IntelligenceInset className="p-3.5 flex flex-col justify-between gap-2">
            <div>
              <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3]">
                {windowDays}-Day Climate Summary
              </div>
              <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                {periodRangeLabel}
              </div>
            </div>
            <div className="divide-y divide-emerald-900/10 dark:divide-[#64AE7E]/18 text-[12px] tabular-nums">
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[#2B5E56] dark:text-[#C4D4CA]">Observed Rain</span>
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">
                  {periodRainMm.toFixed(1)} mm
                </span>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[#2B5E56] dark:text-[#C4D4CA]">21-Yr Normal</span>
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">
                  {weather.rainBaselineMean30dMm !== null ? `${weather.rainBaselineMean30dMm} mm` : '—'}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[#2B5E56] dark:text-[#C4D4CA]">Heat Stress Days</span>
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">
                  {weather.heatStressDays30d} days
                </span>
              </div>
              <div className="pt-2 flex items-center justify-between gap-2">
                <span className="font-semibold text-[#05291B] dark:text-[#F1F8F3]">Rain Anomaly</span>
                <span
                  className={`font-bold text-[13px] ${
                    (weather.rainAnomalyMm ?? 0) >= 0
                      ? 'text-emerald-700 dark:text-[#35EC99]'
                      : 'text-amber-700 dark:text-[#F8BC37]'
                  }`}
                >
                  {weather.rainAnomalyMm !== null
                    ? `${weather.rainAnomalyMm >= 0 ? '+' : ''}${weather.rainAnomalyMm} mm`
                    : '—'}
                </span>
              </div>
            </div>
          </IntelligenceInset>
        </div>
      </IntelligenceCard>

      {/* Section 6: Field Operations Weather Window */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={6}
          title="7-Day Forecast & Field Operations Window"
          dateLabel={forecastRangeLabel}
        />

        <div className="grid grid-cols-1 md:grid-cols-[260px_200px_1fr_auto] gap-3.5 items-center">
          <IntelligenceInset className="px-3.5 py-3 flex items-center gap-3">
            <CloudRain className="w-8 h-8 text-[#32BDF0] shrink-0" />
            <div>
              <div className="text-[11.5px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">
                7-Day Forecast Rain
              </div>
              <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
                {weather.forecastRain7dMm.toFixed(1)} mm
              </div>
              <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                {forecastRangeLabel}
              </div>
            </div>
          </IntelligenceInset>

          <IntelligenceInset className="px-3.5 py-3 space-y-1">
            <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">
              Dry Spell ({periodRangeLabel})
            </div>
            <div className="text-[15.5px] font-bold text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
              {weather.drySpellDays} days (&lt;1 mm)
            </div>
            <div className="text-[11px] text-[#2B5E56] dark:text-[#C4D4CA] tabular-nums">
              Frost Days (30d): {weather.frostDays30d}
            </div>
          </IntelligenceInset>

          <p className="text-[12px] leading-[1.45] text-[#1B4D46] dark:text-[#C4D4CA]">
            {reports.weatherSummary[1] ||
              `Wind gusts near ${fmtWind(weather.gustKmh)} and ${weather.forecastRain7dMm.toFixed(1)} mm forecast rain (${forecastRangeLabel}) should guide spraying, topdressing, and irrigation timing.`}
          </p>

          <button
            type="button"
            disabled={!isOnline || loading}
            onClick={onRefresh}
            className="h-[38px] px-4.5 rounded-[10px] bg-[#13D987] hover:bg-[#35EC99] text-[#003C2A] text-[12.5px] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Syncing…' : 'Sync Weather'}</span>
          </button>
        </div>
      </IntelligenceCard>

      {/* Bottom Row: Section 7, Section 8, Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr_240px] gap-3.5 items-stretch">
        <IntelligenceCard className="p-4 lg:p-4.5 flex flex-col justify-between gap-2.5">
          <SectionHeading
            number={7}
            title="Historical Seasonal Baseline (21-Yr)"
            dateLabel={baselineMode === 'precip' ? baselineYearsSpan : periodRangeLabel}
          />
          <ComparisonLineSvgChart
            data={baselineComparisonData}
            yUnit={baselineMode === 'precip' ? 'mm' : `°${tempUnit}`}
            currentLabel={baselineMode === 'precip' ? 'Annual Window' : 'Daily Tmax'}
            baselineLabel="21-Yr NASA Normal"
          />
        </IntelligenceCard>

        <DataQualityCard
          dateLabel={latestDateLabel}
          rows={[
            {
              dataType: 'Current NWP',
              source: weather.providerStatus === 'Connected' ? 'Open-Meteo' : 'Unavailable',
              updatedDate: latestDateLabel,
              quality: weather.providerStatus === 'Connected' ? 'High' : 'Medium',
              basis: weather.providerStatus === 'Connected' ? 'Live NWP' : 'Unavailable',
            },
            {
              dataType: 'Reanalysis',
              source: weather.nasaPowerStatus === 'Connected' ? 'NASA POWER' : 'Pending',
              updatedDate: formatSubDate(timestamps.nasaLatestDate ?? timestamps.nasaPowerFetchedAt),
              quality: weather.nasaPowerStatus === 'Connected' ? 'High' : 'Medium',
              basis: weather.nasaPowerStatus === 'Connected' ? 'Satellite grid' : 'Pending',
            },
            {
              dataType: 'ET₀ Method',
              source: 'Penman-Monteith',
              updatedDate: latestDateLabel,
              quality: 'High',
              basis: 'FAO-56 Ref.',
            },
            {
              dataType: 'Spatial Grid',
              source: '~9–55 km cell',
              updatedDate: formatSubDate(timestamps.weatherFetchedAt ?? timestamps.nasaPowerFetchedAt),
              quality: 'Medium',
              basis: 'Centroid sample',
            },
          ]}
          onViewDetails={() => onInspectMetric(metricsById.weather_et0)}
        />

        <QuickActionsCard
          onViewFullReport={() => setReportOpen(true)}
          onDownloadPdf={() => window.print()}
          thirdActionLabel={baselineMode === 'precip' ? 'Compare Temp' : 'Compare Rain'}
          onThirdAction={() => setBaselineMode((m) => (m === 'precip' ? 'temp' : 'precip'))}
        />
      </div>

      <FullReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`Weather & Climate Report — ${bundle.fieldDisplayName}`}
        subtitle={`${crop.commonName} · ${periodRangeLabel} · NASA POWER + Open-Meteo NWP`}
        stats={[
          { label: 'Air Temp', value: fmtTemp(weather.currentTempC) },
          { label: 'Reference ET₀', value: weather.et0TodayMm ? `${weather.et0TodayMm.toFixed(2)} mm/d` : '—' },
          { label: `${windowDays}d Rain`, value: `${periodRainMm.toFixed(1)} mm` },
          { label: '30d GDD', value: `${phenology.gdd30dAccumulated.toFixed(0)} °C·d` },
        ]}
        paragraphs={reports.weatherSummary}
        onPrint={() => window.print()}
      />
    </div>
  );
};
