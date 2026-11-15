import React, { useMemo, useState } from 'react';
import { Cloud, CloudRain, RefreshCw, Sun } from 'lucide-react';
import { HourlyTempPoint, LiveWeatherReading } from '../../../services/weather';
import { useDisplayPrefs } from '../../../context/DisplayPrefsContext';

interface GrowingConditionsCardProps {
  liveWeather: LiveWeatherReading | null;
  loading: boolean;
  isOnline: boolean;
  onRefresh: () => void;
  onOpenWeatherDetails?: () => void;
}

const FALLBACK_HOURLY: HourlyTempPoint[] = [
  { hourLabel: '6AM', tempC: 22 },
  { hourLabel: '8AM', tempC: 24 },
  { hourLabel: '10AM', tempC: 27 },
  { hourLabel: '12PM', tempC: 30 },
  { hourLabel: '2PM', tempC: 31 },
  { hourLabel: '4PM', tempC: 29 },
  { hourLabel: '6PM', tempC: 26 },
  { hourLabel: '8PM', tempC: 24 },
];

const FALLBACK_DAYS = [
  { dayLabel: 'Mon', weatherCode: 0, maxC: 31, minC: 23 },
  { dayLabel: 'Tue', weatherCode: 0, maxC: 32, minC: 24 },
  { dayLabel: 'Wed', weatherCode: 1, maxC: 33, minC: 25 },
];

function buildSmoothBezierPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX.toFixed(1)} ${p0.y.toFixed(1)}, ${midX.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

const ForecastMiniIcon: React.FC<{ code: number }> = ({ code }) => {
  if (code >= 51) {
    return <CloudRain className="w-4 h-4 text-sky-400 shrink-0" />;
  }
  if (code === 2 || code === 3 || code === 45 || code === 48) {
    return <Cloud className="w-4 h-4 text-amber-300 shrink-0" />;
  }
  return <Sun className="w-4 h-4 text-[#FFC12D] fill-[#FFC12D]/80 shrink-0" />;
};

export const GrowingConditionsCard: React.FC<GrowingConditionsCardProps> = ({
  liveWeather,
  loading,
  isOnline,
  onRefresh,
  onOpenWeatherDetails,
}) => {
  const { tempUnit, windUnit } = useDisplayPrefs();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const convTemp = (c: number) => (tempUnit === 'F' ? Math.round((c * 9) / 5 + 32) : Math.round(c));
  const unitSuffix = tempUnit === 'F' ? '°F' : '°C';
  const convWind = (kmh: number) =>
    windUnit === 'mph' ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;

  const tempNow = liveWeather?.tempC ?? 29;
  const tempLow = liveWeather?.tempLowC ?? 22;
  const tempHigh = liveWeather?.tempHighC ?? 32;
  const humidity = liveWeather?.humidityPct ?? 62;
  const windKmh = liveWeather?.windKmh ?? 12;
  const windDir = liveWeather?.windDirCompass ?? 'NE';
  const rain24h = liveWeather?.precip24hMm ?? liveWeather?.precipMm ?? 0;
  const condition = liveWeather?.conditionLabel ?? 'Partly Cloudy';

  const observedTimeLabel = useMemo(() => {
    if (!liveWeather?.observedAt) {
      return new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    const parsed = new Date(liveWeather.observedAt);
    if (Number.isNaN(parsed.getTime())) return 'Live';
    return parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }, [liveWeather?.observedAt]);

  const hourlyPoints =
    liveWeather?.hourlyTemps && liveWeather.hourlyTemps.length >= 4
      ? liveWeather.hourlyTemps
      : FALLBACK_HOURLY;

  const forecastRows =
    liveWeather?.dailyForecast && liveWeather.dailyForecast.length >= 3
      ? liveWeather.dailyForecast.slice(0, 3)
      : FALLBACK_DAYS;

  // Compute SVG points for 340 x 104 inner plotting box
  const chartGeom = useMemo(() => {
    const minVal = Math.min(...hourlyPoints.map((p) => convTemp(p.tempC)), tempUnit === 'F' ? 50 : 10);
    const maxVal = Math.max(...hourlyPoints.map((p) => convTemp(p.tempC)), tempUnit === 'F' ? 104 : 40);
    const lo = Math.floor(minVal / 5) * 5;
    const hi = Math.ceil(maxVal / 5) * 5;
    const span = Math.max(10, hi - lo);

    const left = 36;
    const right = 330;
    const top = 14;
    const bottom = 78;

    const coords = hourlyPoints.map((pt, i) => {
      const val = convTemp(pt.tempC);
      const x = left + (i / Math.max(1, hourlyPoints.length - 1)) * (right - left);
      const y = bottom - ((val - lo) / span) * (bottom - top);
      return { x, y, label: pt.hourLabel, val };
    });

    const path = buildSmoothBezierPath(coords);
    const areaPath =
      coords.length > 1
        ? `${path} L ${coords[coords.length - 1].x.toFixed(1)} ${bottom} L ${coords[0].x.toFixed(1)} ${bottom} Z`
        : '';

    const peakIdx = coords.reduce(
      (best, cur, idx, arr) => (cur.val > arr[best].val ? idx : best),
      0
    );

    return {
      coords,
      path,
      areaPath,
      peakIdx,
      ticks: [hi, Math.round((hi + lo) / 2), lo],
      left,
      right,
      top,
      bottom,
    };
  }, [hourlyPoints, tempUnit]);

  return (
    <section
      aria-label="Today's Growing Conditions"
      onClick={onOpenWeatherDetails}
      role={onOpenWeatherDetails ? 'button' : undefined}
      tabIndex={onOpenWeatherDetails ? 0 : undefined}
      onKeyDown={(e) => {
        if (onOpenWeatherDetails && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpenWeatherDetails();
        }
      }}
      className={`relative rounded-[19px] border border-emerald-700/20 dark:border-[#78CC92]/26 bg-white/75 dark:bg-[#05281A]/72 backdrop-blur-xl shadow-[0_10px_28px_rgba(4,40,26,0.10)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_10px_28px_rgba(0,0,0,0.28)] px-4 py-3 xl:px-5 xl:py-3.5 flex flex-col justify-between gap-2 transition-all ${
        onOpenWeatherDetails
          ? 'cursor-pointer hover:border-emerald-500/50 dark:hover:border-[#35ED91]/55'
          : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-1.5 border-b border-emerald-900/10 dark:border-[#9FD3B8]/15">
        <div>
          <h3 className="text-[16.5px] xl:text-[18px] font-bold text-[#05291B] dark:text-white tracking-tight leading-tight">
            Today&apos;s Growing Conditions
          </h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-medium">
            <span className="text-emerald-700 dark:text-[#35ED91] font-semibold">
              {liveWeather ? 'Live' : 'Baseline'}
            </span>
            <span className="text-[#3C6D59] dark:text-[#8EA99A]">• {observedTimeLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenWeatherDetails && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenWeatherDetails();
              }}
              className="text-[12px] font-semibold text-emerald-700 dark:text-[#35ED91] hover:underline cursor-pointer"
            >
              Climate →
            </button>
          )}
          <button
            type="button"
            disabled={!isOnline || loading}
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            title="Refresh live Open-Meteo weather"
            className="p-1.5 rounded-lg border border-emerald-700/20 dark:border-[#78CC92]/25 text-emerald-800 dark:text-[#8BCF9C] hover:bg-emerald-500/10 disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Upper Split: Current Weather + Atmospheric Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-[46%_54%] items-center gap-2.5">
        <div className="flex items-center gap-3">
          {/* Partly Cloudy Weather SVG Illustration */}
          <svg viewBox="0 0 92 78" fill="none" className="w-[64px] h-[54px] xl:w-[72px] xl:h-[60px] shrink-0" aria-hidden="true">
            <circle cx="34" cy="30" r="15" fill="url(#sunCore)" />
            <g stroke="#FFC738" strokeWidth="3" strokeLinecap="round">
              <line x1="34" y1="7" x2="34" y2="11" />
              <line x1="11" y1="30" x2="15" y2="30" />
              <line x1="18" y1="14" x2="21" y2="17" />
              <line x1="50" y1="14" x2="47" y2="17" />
              <line x1="18" y1="46" x2="21" y2="43" />
            </g>
            <path
              d="M27 59H67C74.18 59 80 53.63 80 47C80 40.91 75.09 35.89 68.79 35.12C66.68 27.6 59.78 22 51.5 22C41.83 22 34 29.83 34 39.5C34 40.07 34.03 40.63 34.08 41.18C27.27 41.97 22 47.46 22 54.1C22 56.81 24.24 59 27 59Z"
              fill="url(#cloudGrad)"
            />
            <defs>
              <linearGradient id="sunCore" x1="22" y1="16" x2="46" y2="44" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFE169" />
                <stop offset="1" stopColor="#F59E0B" />
              </linearGradient>
              <linearGradient id="cloudGrad" x1="35" y1="24" x2="68" y2="60" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFFFFF" />
                <stop offset="1" stopColor="#CBD5E1" />
              </linearGradient>
            </defs>
          </svg>

          <div className="min-w-0">
            <div className="text-[28px] xl:text-[32px] font-bold leading-none text-[#05291B] dark:text-white tabular-nums">
              {convTemp(tempNow)}
              {unitSuffix}
            </div>
            <div className="mt-1 text-[12.5px] xl:text-[13px] font-medium text-[#2A5E49] dark:text-[#C3D3C8] truncate">
              {condition}
            </div>
          </div>
        </div>

        <div className="sm:border-l border-emerald-900/12 dark:border-[#9FD3B8]/20 sm:pl-4 space-y-0.5 text-[12.5px] xl:text-[13px] tabular-nums">
          <div className="font-semibold text-[#05291B] dark:text-[#F1F7F3]">
            Min {convTemp(tempLow)}
            {unitSuffix} <span className="mx-1.5 opacity-40">|</span> Max {convTemp(tempHigh)}
            {unitSuffix}
          </div>
          <div className="text-[#1A4A37] dark:text-[#C3D3C8]">
            Humidity <strong className="font-semibold text-[#05291B] dark:text-white">{humidity}%</strong>
          </div>
          <div className="text-[#1A4A37] dark:text-[#C3D3C8]">
            Wind{' '}
            <strong className="font-semibold text-[#05291B] dark:text-white">
              {convWind(windKmh)} {windDir}
            </strong>
          </div>
          <div className="text-[#1A4A37] dark:text-[#C3D3C8]">
            Rain (24h){' '}
            <strong className="font-semibold text-[#05291B] dark:text-white">{rain24h} mm</strong>
          </div>
        </div>
      </div>

      {/* Lower Split: SVG Temperature Curve + Next 3 Days Card */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_164px] gap-3 items-end">
        {/* Transparent Hourly Curve Chart */}
        <div className="relative w-full">
          <svg
            viewBox="0 0 345 96"
            className="w-full h-[82px] xl:h-[92px] overflow-visible"
            role="img"
            aria-label="Hourly temperature curve"
          >
            <defs>
              <linearGradient id="tempFillGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFC12D" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#FFC12D" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Horizontal grid lines & Y-axis labels */}
            {chartGeom.ticks.map((tickVal, idx) => {
              const y =
                chartGeom.top + (idx / Math.max(1, chartGeom.ticks.length - 1)) * (chartGeom.bottom - chartGeom.top);
              return (
                <g key={`${tickVal}-${idx}`}>
                  <text
                    x="28"
                    y={y + 4}
                    textAnchor="end"
                    className="fill-[#2A5E49] dark:fill-[#8EA99A] text-[10px] tabular-nums"
                  >
                    {tickVal}°
                  </text>
                  <line
                    x1={chartGeom.left}
                    y1={y}
                    x2={chartGeom.right}
                    y2={y}
                    stroke="currentColor"
                    className="text-emerald-950/12 dark:text-[#8BCF9C]/18"
                    strokeWidth="1"
                  />
                </g>
              );
            })}

            {/* Area & Curve */}
            {chartGeom.areaPath && <path d={chartGeom.areaPath} fill="url(#tempFillGrad)" />}
            <path
              d={chartGeom.path}
              fill="none"
              stroke="#FFC12D"
              strokeWidth="2.6"
              strokeLinecap="round"
            />

            {/* Data Dots + Hover Targets */}
            {chartGeom.coords.map((pt, idx) => {
              const isPeak = idx === chartGeom.peakIdx;
              const isHovered = hoveredIdx === idx;
              return (
                <g
                  key={pt.label}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="cursor-pointer"
                >
                  {(isPeak || isHovered) && (
                    <circle cx={pt.x} cy={pt.y} r="7" fill="#FFC12D" fillOpacity="0.26" />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isPeak || isHovered ? 4 : 2.6}
                    fill={isPeak || isHovered ? '#FFFDF5' : '#FFC12D'}
                    stroke="#FFC12D"
                    strokeWidth={isPeak || isHovered ? 2 : 0}
                  />
                  <circle cx={pt.x} cy={pt.y} r="10" fill="transparent" />
                </g>
              );
            })}

            {/* X-axis Labels (6AM, 12PM, 6PM) */}
            {chartGeom.coords
              .filter((_, idx) => idx === 0 || idx === 3 || idx === 6)
              .map((pt) => (
                <text
                  key={`x-${pt.label}`}
                  x={pt.x}
                  y="93"
                  textAnchor="middle"
                  className="fill-[#2A5E49] dark:fill-[#C3D3C8] text-[10px] font-medium"
                >
                  {pt.label}
                </text>
              ))}
          </svg>

          {hoveredIdx !== null && chartGeom.coords[hoveredIdx] && (
            <div className="pointer-events-none absolute top-0 right-2 px-2 py-0.5 rounded-md bg-[#042419]/90 text-[#FFE169] text-[11px] font-semibold tabular-nums border border-[#FFC12D]/40">
              {chartGeom.coords[hoveredIdx].label}: {chartGeom.coords[hoveredIdx].val}
              {unitSuffix}
            </div>
          )}
        </div>

        {/* Embedded Next 3 Days Mini Forecast Card */}
        <div className="rounded-[14px] border border-emerald-700/20 dark:border-[#78CC92]/26 bg-emerald-50/80 dark:bg-[#041D13]/75 px-3 py-2.5 space-y-1.5">
          <div className="text-[12.5px] font-bold text-[#05291B] dark:text-[#F1F7F3]">
            Next 3 Days
          </div>
          <div className="space-y-1">
            {forecastRows.map((d) => (
              <div
                key={d.dayLabel}
                className="flex items-center justify-between text-[12px] tabular-nums"
              >
                <div className="flex items-center gap-1.5 text-[#1A4A37] dark:text-[#DCE8E0] font-medium">
                  <ForecastMiniIcon code={d.weatherCode} />
                  <span>{d.dayLabel}</span>
                </div>
                <span className="font-semibold text-[#05291B] dark:text-[#F1F7F3]">
                  {convTemp(d.maxC)}°/{convTemp(d.minC)}°
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
