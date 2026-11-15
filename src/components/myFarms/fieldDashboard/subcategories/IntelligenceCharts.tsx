import React, { useState } from 'react';

function buildSmoothSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export interface SmoothLinePoint {
  label: string;
  value: number;
  secondary?: number | null;
}

export const SmoothLineSvgChart: React.FC<{
  data: SmoothLinePoint[];
  yUnit: string;
  yMax?: number;
  yTicks?: number[];
  primaryLabel: string;
  primaryColor?: string;
  averageValue?: number;
  averageLabel?: string;
  secondaryLabel?: string;
  secondaryColor?: string;
  height?: number;
}> = ({
  data,
  yUnit,
  yMax: forcedYMax,
  yTicks: forcedTicks,
  primaryLabel,
  primaryColor = '#35E887',
  averageValue,
  averageLabel,
  secondaryLabel,
  secondaryColor = '#38BDF8',
  height = 148,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-[135px] flex items-center justify-center text-[12px] text-[#2B5E56] dark:text-[#849B8C]">
        Waiting for meteorological time series.
      </div>
    );
  }

  const width = 920;
  const padL = 42;
  const padR = 16;
  const padT = 12;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allVals = [
    ...data.map((d) => d.value),
    ...data.map((d) => d.secondary ?? 0),
    averageValue ?? 0,
  ];
  const rawMax = Math.max(1, ...allVals);
  const yMax = forcedYMax ?? Math.ceil((rawMax * 1.15) / 2) * 2;
  const ticks = forcedTicks ?? [0, Number((yMax * 0.25).toFixed(1)), Number((yMax * 0.5).toFixed(1)), Number((yMax * 0.75).toFixed(1)), yMax];

  const xFor = (i: number) =>
    data.length === 1 ? padL + plotW / 2 : padL + (i / (data.length - 1)) * plotW;
  const yFor = (v: number) => padT + plotH - (Math.max(0, Math.min(yMax, v)) / yMax) * plotH;

  const primaryPts = data.map((d, i) => ({ x: xFor(i), y: yFor(d.value) }));
  const primaryPath = buildSmoothSvgPath(primaryPts);
  const areaPath =
    primaryPts.length > 1
      ? `${primaryPath} L ${primaryPts[primaryPts.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${primaryPts[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
      : '';

  const hasSecondary = data.some((d) => d.secondary !== null && d.secondary !== undefined);
  const secondaryPts = hasSecondary
    ? data.map((d, i) => ({ x: xFor(i), y: yFor(d.secondary ?? 0) }))
    : [];
  const secondaryPath = hasSecondary ? buildSmoothSvgPath(secondaryPts) : '';

  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const avgY = averageValue !== undefined ? yFor(averageValue) : null;
  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="relative w-full select-none">
      <div className="flex flex-wrap items-center justify-end gap-4 text-[11.5px] text-[#2B5E56] dark:text-[#C4D4CA] mb-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-[2px] inline-block relative" style={{ backgroundColor: primaryColor }}>
            <span
              className="w-1.5 h-1.5 rounded-full absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ backgroundColor: primaryColor }}
            />
          </span>
          <span>{primaryLabel}</span>
        </span>
        {averageValue !== undefined && (
          <span className="inline-flex items-center gap-1.5 text-[#3C6D59] dark:text-[#849B8C]">
            <span className="w-3.5 border-t border-dashed border-[#849B8C] inline-block" />
            <span>{averageLabel || `Average (${averageValue.toFixed(1)} ${yUnit})`}</span>
          </span>
        )}
        {hasSecondary && secondaryLabel && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 border-t border-dashed inline-block" style={{ borderColor: secondaryColor }} />
            <span>{secondaryLabel}</span>
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={`areaGrad-${primaryLabel.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.20" />
            <stop offset="100%" stopColor={primaryColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid + Y Axis Labels */}
        {ticks.map((t) => {
          const y = yFor(t);
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="rgba(130, 180, 145, 0.14)"
                strokeWidth="1"
              />
              <text
                x={padL - 7}
                y={y + 3.5}
                textAnchor="end"
                fontSize="11"
                fill="currentColor"
                className="text-[#3C6D59] dark:text-[#849B8C] tabular-nums"
              >
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Vertical Unit Label */}
        <text
          x={11}
          y={padT + plotH / 2}
          textAnchor="middle"
          fontSize="11"
          transform={`rotate(-90 11 ${padT + plotH / 2})`}
          fill="currentColor"
          className="text-[#3C6D59] dark:text-[#849B8C]"
        >
          {yUnit}
        </text>

        {/* Vertical Grid Lines & X Labels */}
        {data.map((d, i) => {
          const show = i % labelStep === 0 || i === data.length - 1;
          if (!show) return null;
          const x = xFor(i);
          return (
            <g key={`${d.label}-${i}`}>
              <line
                x1={x}
                y1={padT}
                x2={x}
                y2={padT + plotH}
                stroke="rgba(130, 180, 145, 0.10)"
                strokeWidth="1"
              />
              <text
                x={x}
                y={height - 5}
                textAnchor="middle"
                fontSize="11"
                fill="currentColor"
                className="text-[#3C6D59] dark:text-[#C4D4CA] tabular-nums"
              >
                {d.label}
              </text>
            </g>
          );
        })}

        {/* Average Dashed Reference Line */}
        {avgY !== null && (
          <line
            x1={padL}
            y1={avgY}
            x2={width - padR}
            y2={avgY}
            stroke="rgba(132, 155, 140, 0.65)"
            strokeWidth="1.2"
            strokeDasharray="4 4"
          />
        )}

        {/* Secondary Dashed Line */}
        {hasSecondary && secondaryPath && (
          <path
            d={secondaryPath}
            fill="none"
            stroke={secondaryColor}
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {/* Area & Primary Smooth Line */}
        {areaPath && (
          <path d={areaPath} fill={`url(#areaGrad-${primaryLabel.replace(/\W/g, '')})`} />
        )}
        <path
          d={primaryPath}
          fill="none"
          stroke={primaryColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Circular Markers */}
        {primaryPts.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={hoverIdx === i ? 4 : 2.3}
            fill={primaryColor}
            className="transition-all duration-100"
          />
        ))}

        {/* Hover Hit Areas */}
        {data.map((_, i) => {
          const x = xFor(i);
          const sliceW = data.length > 1 ? plotW / (data.length - 1) : plotW;
          return (
            <rect
              key={`hit-${i}`}
              x={x - sliceW / 2}
              y={padT}
              width={sliceW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              className="cursor-crosshair"
            />
          );
        })}
      </svg>

      {hovered && hoverIdx !== null && (
        <div className="pointer-events-none absolute top-5 left-12 z-20 rounded-[8px] border border-emerald-700/30 dark:border-[#5AA975]/45 bg-white/95 dark:bg-[#021A10]/95 px-2.5 py-1 text-[10.5px] shadow-lg tabular-nums">
          <span className="font-semibold text-[#05291B] dark:text-white">{hovered.label}:</span>{' '}
          <span className="font-bold" style={{ color: primaryColor }}>
            {hovered.value.toFixed(1)} {yUnit}
          </span>
          {hovered.secondary !== null && hovered.secondary !== undefined && (
            <span className="ml-2 text-[#2B5E56] dark:text-[#C4D4CA]">
              · {secondaryLabel}: {hovered.secondary.toFixed(1)} {yUnit}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export interface StackedBarPoint {
  label: string;
  base: number;
  mid: number;
  top: number;
}

export const StackedBarSvgChart: React.FC<{
  data: StackedBarPoint[];
  yUnit: string;
  seriesLabels: [string, string, string];
  seriesColors?: [string, string, string];
  height?: number;
}> = ({
  data,
  yUnit,
  seriesLabels,
  seriesColors = ['#168EDB', '#67B8E6', '#62D96D'],
  height = 132,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-[132px] flex items-center justify-center text-[12px] text-[#2B5E56] dark:text-[#849B8C]">
        No rainfall or irrigation events in selected window.
      </div>
    );
  }

  const width = 420;
  const padL = 36;
  const padR = 10;
  const padT = 10;
  const padB = 20;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const totals = data.map((d) => d.base + d.mid + d.top);
  const rawMax = Math.max(10, ...totals);
  const yMax = Math.ceil(rawMax / 20) * 20;
  const ticks = [0, Math.round(yMax / 3), Math.round((yMax * 2) / 3), yMax];
  const yFor = (v: number) => padT + plotH - (Math.min(yMax, Math.max(0, v)) / yMax) * plotH;

  const colW = plotW / data.length;
  const barW = Math.min(20, Math.max(8, colW * 0.56));
  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="relative w-full select-none space-y-1.5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {ticks.map((t) => {
          const y = yFor(t);
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="rgba(130, 180, 145, 0.14)"
                strokeWidth="1"
              />
              <text
                x={padL - 5}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill="currentColor"
                className="text-[#3C6D59] dark:text-[#849B8C] tabular-nums"
              >
                {t}
              </text>
            </g>
          );
        })}

        <text
          x={9}
          y={padT + plotH / 2}
          textAnchor="middle"
          fontSize="9"
          transform={`rotate(-90 9 ${padT + plotH / 2})`}
          fill="currentColor"
          className="text-[#3C6D59] dark:text-[#849B8C]"
        >
          {yUnit}
        </text>

        {data.map((d, i) => {
          const cx = padL + i * colW + colW / 2;
          const x = cx - barW / 2;
          const hBase = (d.base / yMax) * plotH;
          const hMid = (d.mid / yMax) * plotH;
          const hTop = (d.top / yMax) * plotH;
          const yBase = padT + plotH - hBase;
          const yMid = yBase - hMid;
          const yTop = yMid - hTop;

          return (
            <g
              key={`${d.label}-${i}`}
              onMouseEnter={() => setHoverIdx(i)}
              className="cursor-pointer"
            >
              <rect x={x} y={padT} width={barW} height={plotH} fill="transparent" />
              {hBase > 0 && (
                <rect x={x} y={yBase} width={barW} height={hBase} fill={seriesColors[0]} rx="1.5" />
              )}
              {hMid > 0 && (
                <rect x={x} y={yMid} width={barW} height={hMid} fill={seriesColors[1]} rx="1.5" />
              )}
              {hTop > 0 && (
                <rect x={x} y={yTop} width={barW} height={hTop} fill={seriesColors[2]} rx="1.5" />
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-3.5 text-[11px] text-[#2B5E56] dark:text-[#C4D4CA]">
        {seriesLabels.map((lbl, idx) => (
          <span key={lbl} className="inline-flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-[2px] inline-block"
              style={{ backgroundColor: seriesColors[idx] }}
            />
            <span>{lbl}</span>
          </span>
        ))}
      </div>

      {hovered && (
        <div className="pointer-events-none absolute top-1 right-2 z-20 rounded-[8px] border border-emerald-700/30 dark:border-[#5AA975]/45 bg-white/95 dark:bg-[#021A10]/95 px-2 py-1 text-[10px] shadow-lg tabular-nums">
          <div className="font-semibold text-[#05291B] dark:text-white">{hovered.label}</div>
          <div className="text-[#2B5E56] dark:text-[#C4D4CA]">
            {seriesLabels[0]}: {hovered.base.toFixed(1)} · {seriesLabels[1]}: {hovered.mid.toFixed(1)} · {seriesLabels[2]}: {hovered.top.toFixed(1)} {yUnit}
          </div>
        </div>
      )}
    </div>
  );
};

export interface MixedBalancePoint {
  label: string;
  barA: number; // Effective Rainfall
  barB: number; // Irrigation
  lineA: number; // ETc Demand (or Tmax)
  lineB: number; // Soil Storage (or ET0)
}

export const MixedBalanceSvgChart: React.FC<{
  data: MixedBalancePoint[];
  yUnit: string;
  labels: { barA: string; barB: string; lineA: string; lineB: string };
  colors?: { barA: string; barB: string; lineA: string; lineB: string };
  height?: number;
}> = ({
  data,
  yUnit,
  labels,
  colors = {
    barA: '#2199D6',
    barB: '#74CB5C',
    lineA: '#36D989',
    lineB: '#F7BD31',
  },
  height = 142,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-[135px] flex items-center justify-center text-[12px] text-[#2B5E56] dark:text-[#849B8C]">
        Waiting for daily balance history.
      </div>
    );
  }

  const width = 760;
  const padL = 38;
  const padR = 12;
  const padT = 10;
  const padB = 24;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const rawMax = Math.max(
    15,
    ...data.map((d) => Math.max(d.barA + d.barB, d.lineA, d.lineB))
  );
  const yMax = Math.ceil(rawMax / 25) * 25;
  const ticks = [0, Math.round(yMax / 3), Math.round((yMax * 2) / 3), yMax];

  const xFor = (i: number) =>
    data.length === 1 ? padL + plotW / 2 : padL + (i / (data.length - 1)) * plotW;
  const yFor = (v: number) => padT + plotH - (Math.max(0, Math.min(yMax, v)) / yMax) * plotH;

  const ptsA = data.map((d, i) => ({ x: xFor(i), y: yFor(d.lineA) }));
  const ptsB = data.map((d, i) => ({ x: xFor(i), y: yFor(d.lineB) }));
  const pathA = buildSmoothSvgPath(ptsA);
  const pathB = buildSmoothSvgPath(ptsB);
  const barW = Math.min(20, Math.max(7, (plotW / data.length) * 0.48));
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="relative w-full select-none">
      <div className="flex flex-wrap items-center justify-end gap-3.5 text-[11.5px] text-[#2B5E56] dark:text-[#C4D4CA] mb-1.5">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-[2px] inline-block" style={{ backgroundColor: colors.lineA }} />
          <span>{labels.lineA}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-[2px] inline-block" style={{ backgroundColor: colors.barA }} />
          <span>{labels.barA}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-[2px] inline-block" style={{ backgroundColor: colors.barB }} />
          <span>{labels.barB}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-[2px] inline-block" style={{ backgroundColor: colors.lineB }} />
          <span>{labels.lineB}</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {ticks.map((t) => {
          const y = yFor(t);
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="rgba(130, 180, 145, 0.14)"
                strokeWidth="1"
              />
              <text
                x={padL - 5}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill="currentColor"
                className="text-[#3C6D59] dark:text-[#849B8C] tabular-nums"
              >
                {t}
              </text>
            </g>
          );
        })}

        <text
          x={9}
          y={padT + plotH / 2}
          textAnchor="middle"
          fontSize="9"
          transform={`rotate(-90 9 ${padT + plotH / 2})`}
          fill="currentColor"
          className="text-[#3C6D59] dark:text-[#849B8C]"
        >
          {yUnit}
        </text>

        {/* Bars rendered first */}
        {data.map((d, i) => {
          const cx = xFor(i);
          const x = cx - barW / 2;
          const hA = (d.barA / yMax) * plotH;
          const hB = (d.barB / yMax) * plotH;
          const yA = padT + plotH - hA;
          const yB = yA - hB;
          return (
            <g key={`bar-${i}`}>
              {hA > 0 && (
                <rect x={x} y={yA} width={barW} height={hA} fill={colors.barA} fillOpacity="0.82" rx="1.5" />
              )}
              {hB > 0 && (
                <rect x={x} y={yB} width={barW} height={hB} fill={colors.barB} fillOpacity="0.88" rx="1.5" />
              )}
            </g>
          );
        })}

        {/* Lines rendered on top */}
        <path
          d={pathA}
          fill="none"
          stroke={colors.lineA}
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d={pathB}
          fill="none"
          stroke={colors.lineB}
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        {ptsB.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={hoverIdx === i ? 3.8 : 2.2}
            fill={colors.lineB}
          />
        ))}

        {/* X Labels */}
        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null;
          const x = xFor(i);
          return (
            <text
              key={`xl-${i}`}
              x={x}
              y={height - 4}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              className="text-[#3C6D59] dark:text-[#C4D4CA] tabular-nums"
            >
              {d.label}
            </text>
          );
        })}

        {/* Hover Hit Areas */}
        {data.map((_, i) => {
          const x = xFor(i);
          const sliceW = data.length > 1 ? plotW / (data.length - 1) : plotW;
          return (
            <rect
              key={`hit-${i}`}
              x={x - sliceW / 2}
              y={padT}
              width={sliceW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              className="cursor-crosshair"
            />
          );
        })}
      </svg>

      {hovered && (
        <div className="pointer-events-none absolute top-5 left-10 z-20 rounded-[8px] border border-emerald-700/30 dark:border-[#5AA975]/45 bg-white/95 dark:bg-[#021A10]/95 px-2.5 py-1 text-[10px] shadow-lg tabular-nums">
          <span className="font-semibold text-[#05291B] dark:text-white">{hovered.label}:</span>{' '}
          <span style={{ color: colors.lineB }} className="font-bold">
            {labels.lineB} {hovered.lineB.toFixed(1)}
          </span>{' '}
          · <span style={{ color: colors.lineA }}>{labels.lineA} {hovered.lineA.toFixed(1)}</span> ·{' '}
          <span>{labels.barA} {hovered.barA.toFixed(1)}</span>
          {hovered.barB > 0 && <span> · {labels.barB} {hovered.barB.toFixed(1)}</span>}
        </div>
      )}
    </div>
  );
};

export const ComparisonLineSvgChart: React.FC<{
  data: Array<{ label: string; current: number; baseline: number }>;
  yUnit: string;
  currentLabel?: string;
  baselineLabel?: string;
  height?: number;
}> = ({
  data,
  yUnit,
  currentLabel = 'Current Period',
  baselineLabel = 'Previous Year',
  height = 138,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-[135px] flex items-center justify-center text-[12px] text-[#2B5E56] dark:text-[#849B8C]">
        Historical comparison pending.
      </div>
    );
  }

  const width = 400;
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const rawMax = Math.max(10, ...data.flatMap((d) => [d.current, d.baseline]));
  const yMax = Math.ceil(rawMax / 25) * 25;
  const ticks = [0, Math.round(yMax / 3), Math.round((yMax * 2) / 3), yMax];

  const xFor = (i: number) =>
    data.length === 1 ? padL + plotW / 2 : padL + (i / (data.length - 1)) * plotW;
  const yFor = (v: number) => padT + plotH - (Math.max(0, Math.min(yMax, v)) / yMax) * plotH;

  const curPts = data.map((d, i) => ({ x: xFor(i), y: yFor(d.current) }));
  const basePts = data.map((d, i) => ({ x: xFor(i), y: yFor(d.baseline) }));
  const curPath = buildSmoothSvgPath(curPts);
  const basePath = buildSmoothSvgPath(basePts);
  const labelStep = Math.max(1, Math.ceil(data.length / 4));
  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="relative w-full select-none space-y-1.5">
      <div className="flex items-center justify-center gap-4 text-[11px] text-[#2B5E56] dark:text-[#C4D4CA]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-[2px] bg-[#35E887] inline-block" />
          <span>{currentLabel}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 border-t border-dashed border-[#38BDF8] inline-block" />
          <span>{baselineLabel}</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {ticks.map((t) => {
          const y = yFor(t);
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="rgba(130, 180, 145, 0.14)"
                strokeWidth="1"
              />
              <text
                x={padL - 5}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill="currentColor"
                className="text-[#3C6D59] dark:text-[#849B8C] tabular-nums"
              >
                {t}
              </text>
            </g>
          );
        })}

        <text
          x={8}
          y={padT + plotH / 2}
          textAnchor="middle"
          fontSize="9"
          transform={`rotate(-90 8 ${padT + plotH / 2})`}
          fill="currentColor"
          className="text-[#3C6D59] dark:text-[#849B8C]"
        >
          {yUnit}
        </text>

        <path
          d={basePath}
          fill="none"
          stroke="#38BDF8"
          strokeWidth="1.5"
          strokeDasharray="3.5 3"
        />
        <path d={curPath} fill="none" stroke="#35E887" strokeWidth="1.9" strokeLinecap="round" />
        {curPts.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={hoverIdx === i ? 3.5 : 2.1}
            fill="#35E887"
          />
        ))}

        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={`cx-${i}`}
              x={xFor(i)}
              y={height - 3}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              className="text-[#3C6D59] dark:text-[#C4D4CA] tabular-nums"
            >
              {d.label}
            </text>
          );
        })}

        {data.map((_, i) => {
          const x = xFor(i);
          const sliceW = data.length > 1 ? plotW / (data.length - 1) : plotW;
          return (
            <rect
              key={`chit-${i}`}
              x={x - sliceW / 2}
              y={padT}
              width={sliceW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              className="cursor-crosshair"
            />
          );
        })}
      </svg>

      {hovered && (
        <div className="pointer-events-none absolute top-4 right-2 z-20 rounded-[8px] border border-emerald-700/30 dark:border-[#5AA975]/45 bg-white/95 dark:bg-[#021A10]/95 px-2 py-1 text-[10px] shadow-lg tabular-nums">
          <span className="font-semibold">{hovered.label}:</span>{' '}
          <span className="text-[#35E887] font-bold">{hovered.current.toFixed(1)}</span> vs{' '}
          <span className="text-[#38BDF8]">{hovered.baseline.toFixed(1)} {yUnit}</span>
        </div>
      )}
    </div>
  );
};
