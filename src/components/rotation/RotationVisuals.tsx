import React from 'react';
import wheatImg from '../../assets/images/crop_wheat_1790789261580.jpg';
import chickpeaImg from '../../assets/images/crop_chickpea_pods_1794746173460.jpg';
import sorghumImg from '../../assets/images/crop_sorghum_grain_1794746174107.jpg';
import coverCropImg from '../../assets/images/crop_cover_clover_1794746175027.jpg';
import barleyImg from '../../assets/images/crop_barley_1790791046594.jpg';
import peasImg from '../../assets/images/crop_beans_1790789288018.jpg';
import maizeImg from '../../assets/images/crop_maize_1790789298341.jpg';
import soyImg from '../../assets/images/crop_soybean_1790791011503.jpg';
import sunflowerImg from '../../assets/images/crop_sunflower_1790791032279.jpg';
import heroSunsetImg from '../../assets/images/rotation_hero_sunset_1794746173892.jpg';
import seedlingImg from '../../assets/images/rotation_soil_seedling_1794746175973.jpg';
import loamSoilImg from '../../assets/images/soil_loam_profile_1794731996141.jpg';
import { CropSeasonStepDetail } from '../../lib/rotationPlannerEngine';

export const ROTATION_MEDIA = {
  heroSunset: heroSunsetImg,
  seedling: seedlingImg,
  loamSoil: loamSoilImg,
};

export function resolveRotationCropImage(cropId: string): string {
  const key = cropId.toLowerCase().trim();
  if (key.includes('chickpea')) return chickpeaImg;
  if (key.includes('sorghum')) return sorghumImg;
  if (key.includes('cover') || key.includes('clover')) return coverCropImg;
  if (key.includes('barley')) return barleyImg;
  if (key.includes('pea') || key.includes('lentil') || key.includes('bean')) return peasImg;
  if (key.includes('maize') || key.includes('corn')) return maizeImg;
  if (key.includes('soy')) return soyImg;
  if (key.includes('sunflower')) return sunflowerImg;
  if (key.includes('fallow')) return loamSoilImg;
  return wheatImg;
}

export const RotationLogoSvg: React.FC<{ className?: string }> = ({
  className = 'w-[62px] h-[62px]',
}) => (
  <svg
    viewBox="0 0 72 72"
    fill="none"
    className={className}
    style={{
      filter:
        'drop-shadow(0 0 9px rgba(36, 233, 130, 0.58)) drop-shadow(0 0 18px rgba(36, 233, 130, 0.24))',
    }}
    aria-hidden="true"
  >
    {/* Top curved clockwise arc + arrowhead */}
    <path
      d="M17 29C20.5 19.5 29.5 13 40 13C49.5 13 57.5 18.8 61 27"
      stroke="#24E982"
      strokeWidth="4.6"
      strokeLinecap="round"
    />
    <path
      d="M54 27L62.5 28.5L63 19.5"
      stroke="#24E982"
      strokeWidth="4.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Bottom curved clockwise arc + arrowhead */}
    <path
      d="M55 43C51.5 52.5 42.5 59 32 59C22.5 59 14.5 53.2 11 45"
      stroke="#24E982"
      strokeWidth="4.6"
      strokeLinecap="round"
    />
    <path
      d="M18 45L9.5 43.5L9 52.5"
      stroke="#24E982"
      strokeWidth="4.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Central young crop sprout motif */}
    <path
      d="M36 47V32"
      stroke="#42F89A"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    <path
      d="M36 35C36 27.5 42.5 23 48.5 24.5C47.5 31.5 42.5 35.5 36 35Z"
      fill="#24E982"
    />
    <path
      d="M36 38.5C36 31.5 29.5 27.5 24 29C25 35.5 29.8 39 36 38.5Z"
      fill="#42F89A"
    />
  </svg>
);

export const GlossyWaterDropletIcon: React.FC<{ className?: string }> = ({
  className = 'w-5 h-5',
}) => (
  <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
    <defs>
      <radialGradient id="rotWaterDrop" cx="38%" cy="34%" r="65%">
        <stop offset="0%" stopColor="#9CEBFF" />
        <stop offset="55%" stopColor="#29BDFB" />
        <stop offset="100%" stopColor="#1268D4" />
      </radialGradient>
    </defs>
    <path
      d="M14 3.5C14 3.5 6.5 12.2 6.5 17.5C6.5 21.64 9.86 25 14 25C18.14 25 21.5 21.64 21.5 17.5C21.5 12.2 14 3.5 14 3.5Z"
      fill="url(#rotWaterDrop)"
    />
    <path
      d="M10.4 17.2C10.4 19.3 11.7 21 13.5 21.4"
      stroke="rgba(255,255,255,0.68)"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export interface CircularGaugeProps {
  value: number;
  maxValue?: number;
  color: string;
  trackColor?: string;
  size?: number;
  stroke?: number;
  glowColor?: string;
  children?: React.ReactNode;
}

export const CircularMetricGauge: React.FC<CircularGaugeProps> = ({
  value,
  maxValue = 100,
  color,
  trackColor = 'rgba(13, 64, 58, 0.52)',
  size = 82,
  stroke = 6,
  glowColor,
  children,
}) => {
  const clamped = Math.max(0, Math.min(maxValue, value));
  const pct = clamped / maxValue;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gapFraction = 0.06; // subtle crisp gap matching reference rings
  const arcLength = circumference * (1 - gapFraction);
  const dashLength = arcLength * pct;
  const rotationDeg = -90 + (gapFraction * 360) / 2;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="rgba(4, 28, 25, 0.42)"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dashLength} ${circumference}`}
          transform={`rotate(${rotationDeg} ${size / 2} ${size / 2})`}
          style={{
            filter: glowColor ? `drop-shadow(0 0 6px ${glowColor})` : undefined,
            transition: 'stroke-dasharray 500ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {children}
      </div>
    </div>
  );
};

function renderBotanicalPlant(cropId: string, cx: number, soilY: number, isActive: boolean) {
  const id = cropId.toLowerCase();
  const scale = isActive ? 1.07 : 1;

  if (id === 'fallow') {
    // Low stubble residue on rested soil
    return (
      <g transform={`translate(${cx}, ${soilY}) scale(${scale})`}>
        {[-26, -14, -3, 9, 22].map((dx, i) => (
          <path
            key={i}
            d={`M ${dx} 1 L ${dx + (i % 2 ? 3 : -2)} -9`}
            stroke="#B69B66"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.78"
          />
        ))}
        <ellipse cx="0" cy="-2" rx="34" ry="4" fill="#6F5638" opacity="0.55" />
      </g>
    );
  }

  if (id === 'cover_crop' || id.includes('clover')) {
    // Dense crimson clover / green ground cover canopy
    const stems = [-42, -30, -18, -7, 4, 16, 28, 40];
    return (
      <g transform={`translate(${cx}, ${soilY}) scale(${scale})`}>
        {stems.map((dx, i) => {
          const h = 19 + (i % 3) * 6;
          return (
            <g key={i}>
              <path
                d={`M ${dx} 1 Q ${dx + (i % 2 ? 2 : -2)} ${-h * 0.55} ${dx} ${-h}`}
                stroke="#37A857"
                strokeWidth="2.1"
                fill="none"
              />
              <ellipse cx={dx - 5} cy={-h + 2} rx="6" ry="3.8" fill="#52D669" transform={`rotate(-18 ${dx - 5} ${-h + 2})`} />
              <ellipse cx={dx + 5} cy={-h + 2} rx="6" ry="3.8" fill="#3CC55B" transform={`rotate(18 ${dx + 5} ${-h + 2})`} />
              <ellipse cx={dx} cy={-h - 2} rx="5.2" ry="4" fill="#6BE67D" />
              {i % 3 === 1 && (
                <ellipse cx={dx + 1} cy={-h - 6} rx="3.2" ry="4.2" fill="#D94865" />
              )}
            </g>
          );
        })}
      </g>
    );
  }

  if (id.includes('sorghum') || id.includes('maize')) {
    const isMaize = id.includes('maize');
    const stalks = [-28, -10, 9, 28];
    return (
      <g transform={`translate(${cx}, ${soilY}) scale(${scale})`}>
        {stalks.map((dx, i) => {
          const h = i === 1 || i === 2 ? 62 : 48;
          return (
            <g key={i}>
              <path
                d={`M ${dx} 1 Q ${dx + 1.5} ${-h * 0.5} ${dx} ${-h}`}
                stroke={isMaize ? '#3CA852' : '#5EA847'}
                strokeWidth="2.8"
                strokeLinecap="round"
                fill="none"
              />
              {/* Broad leaves */}
              <path
                d={`M ${dx} ${-h * 0.35} Q ${dx - 16} ${-h * 0.48} ${dx - 22} ${-h * 0.25}`}
                stroke="#4BC95E"
                strokeWidth="3.2"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d={`M ${dx} ${-h * 0.52} Q ${dx + 15} ${-h * 0.65} ${dx + 22} ${-h * 0.44}`}
                stroke="#3DB852"
                strokeWidth="3.2"
                strokeLinecap="round"
                fill="none"
              />
              {/* Mature Sorghum grain panicle or Maize tassel */}
              {isMaize ? (
                <path
                  d={`M ${dx} ${-h} L ${dx - 5} ${-h - 8} M ${dx} ${-h} L ${dx} ${-h - 10} M ${dx} ${-h} L ${dx + 5} ${-h - 8}`}
                  stroke="#E5C85E"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              ) : (
                <ellipse
                  cx={dx}
                  cy={-h - 7}
                  rx={i === 1 ? 7.2 : 5.5}
                  ry={i === 1 ? 13 : 10}
                  fill="#B45724"
                  stroke="#D97C3A"
                  strokeWidth="1.2"
                />
              )}
            </g>
          );
        })}
      </g>
    );
  }

  if (id.includes('chickpea') || id.includes('pea') || id.includes('soy')) {
    const stems = [-28, -14, 0, 15, 29];
    return (
      <g transform={`translate(${cx}, ${soilY}) scale(${scale})`}>
        {stems.map((dx, i) => {
          const h = 34 + (i % 2) * 10;
          return (
            <g key={i}>
              <path
                d={`M ${dx} 1 Q ${dx + (i % 2 ? 3 : -3)} ${-h * 0.55} ${dx} ${-h}`}
                stroke="#41B65A"
                strokeWidth="2.2"
                fill="none"
              />
              {[-0.35, -0.58, -0.82].map((f, j) => (
                <g key={j}>
                  <ellipse cx={dx - 6} cy={h * f} rx="5" ry="2.8" fill="#5EDB6E" transform={`rotate(-25 ${dx - 6} ${h * f})`} />
                  <ellipse cx={dx + 6} cy={h * f - 2} rx="5" ry="2.8" fill="#46C45B" transform={`rotate(25 ${dx + 6} ${h * f - 2})`} />
                </g>
              ))}
              {/* Hanging legume pods */}
              <ellipse cx={dx + 3} cy={-h * 0.45} rx="3.4" ry="5" fill="#90E65A" />
              {i % 2 === 0 && <ellipse cx={dx - 4} cy={-h * 0.65} rx="3" ry="4.5" fill="#A6F06A" />}
            </g>
          );
        })}
      </g>
    );
  }

  if (id.includes('sunflower')) {
    const stems = [-22, 0, 22];
    return (
      <g transform={`translate(${cx}, ${soilY}) scale(${scale})`}>
        {stems.map((dx, i) => {
          const h = i === 1 ? 52 : 42;
          return (
            <g key={i}>
              <path d={`M ${dx} 1 L ${dx} ${-h}`} stroke="#49B456" strokeWidth="2.6" />
              <ellipse cx={dx - 8} cy={-h * 0.45} rx="8" ry="4" fill="#47BD58" transform={`rotate(-20 ${dx - 8} ${-h * 0.45})`} />
              <circle cx={dx} cy={-h} r="9" fill="#FFCA28" />
              <circle cx={dx} cy={-h} r="5.2" fill="#4A2E14" />
            </g>
          );
        })}
      </g>
    );
  }

  // Default: Wheat / Barley / Young cereal grass & golden heads
  const blades = [-36, -24, -14, -4, 6, 17, 27, 37];
  return (
    <g transform={`translate(${cx}, ${soilY}) scale(${scale})`}>
      {blades.map((dx, i) => {
        const h = 24 + (i % 4) * 7;
        const isGoldenHead = i % 2 === 1;
        return (
          <g key={i}>
            <path
              d={`M ${dx} 1 Q ${dx + (i - 3.5) * 1.4} ${-h * 0.55} ${dx + (i - 3.5) * 2.1} ${-h}`}
              stroke={isGoldenHead ? '#9BB854' : '#4BC55D'}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            {isGoldenHead && (
              <ellipse
                cx={dx + (i - 3.5) * 2.1}
                cy={-h - 4}
                rx="3.2"
                ry="7"
                fill="#E8BD56"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

export const BotanicalCropTimelineSvg: React.FC<{
  steps: CropSeasonStepDetail[];
  selectedSeason: number;
  onSelectSeason: (seasonNumber: number) => void;
}> = ({ steps, selectedSeason, onSelectSeason }) => {
  const width = 1160;
  const height = 118;
  const soilY = 90;
  const count = Math.max(1, steps.length);
  const startX = 148;
  const endX = 1012;
  const stepSpan = count > 1 ? (endX - startX) / (count - 1) : 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-[108px] sm:h-[120px] xl:h-[128px] select-none overflow-visible"
      role="img"
      aria-label="Crop rotation sequence botanical growth timeline"
    >
      <defs>
        <linearGradient id="rotSoilFadeMask" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="7%" stopColor="white" stopOpacity="1" />
          <stop offset="93%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="rotSoilEdgeMask">
          <rect x="0" y="0" width={width} height={height} fill="url(#rotSoilFadeMask)" />
        </mask>
        <linearGradient id="rotSoilBand" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7C5633" />
          <stop offset="45%" stopColor="#523720" />
          <stop offset="100%" stopColor="#1B1622" />
        </linearGradient>
        <linearGradient id="rotHorizonLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(45, 198, 174, 0.1)" />
          <stop offset="12%" stopColor="rgba(45, 212, 191, 0.55)" />
          <stop offset="88%" stopColor="rgba(45, 212, 191, 0.55)" />
          <stop offset="100%" stopColor="rgba(45, 198, 174, 0.1)" />
        </linearGradient>
      </defs>

      <g mask="url(#rotSoilEdgeMask)">
        {/* Continuous textured rich agricultural soil bed */}
        <path
          d={`M 24 ${soilY + 1} Q 290 ${soilY - 2}, 580 ${soilY + 1} T 1136 ${soilY} L 1136 ${soilY + 14} L 24 ${soilY + 14} Z`}
          fill="url(#rotSoilBand)"
        />
        {/* Subtle fine soil crumb highlights */}
        {Array.from({ length: 46 }).map((_, idx) => (
          <circle
            key={idx}
            cx={48 + idx * 23}
            cy={soilY + 4 + (idx % 3) * 2.5}
            r={idx % 2 === 0 ? 1.5 : 1}
            fill={idx % 3 === 0 ? '#9D7348' : '#3B2614'}
            opacity="0.7"
          />
        ))}
        {/* Botanical crops growing natively above each season */}
        {steps.map((step, i) => {
          const cx = count === 1 ? width / 2 : startX + i * stepSpan;
          const active = selectedSeason === step.seasonNumber;
          return (
            <g
              key={step.occurrenceId}
              className="cursor-pointer transition-opacity duration-200"
              opacity={selectedSeason === 0 || active ? 1 : 0.78}
              onClick={() => onSelectSeason(step.seasonNumber)}
            >
              {renderBotanicalPlant(step.cropId, cx, soilY, active)}
            </g>
          );
        })}
      </g>

      {/* Crisp horizontal connector track */}
      <line
        x1="28"
        y1={soilY + 16}
        x2={width - 28}
        y2={soilY + 16}
        stroke="url(#rotHorizonLine)"
        strokeWidth="1.6"
      />

      {/* Interactive Season Marker Dots on connector track */}
      {steps.map((step, i) => {
        const cx = count === 1 ? width / 2 : startX + i * stepSpan;
        const cy = soilY + 16;
        const isBlue = i === 2 || step.waterNeedBand === 'High';
        const ringColor = isBlue ? '#279EFF' : '#24E982';
        const active = selectedSeason === step.seasonNumber;
        return (
          <g
            key={step.occurrenceId}
            className="cursor-pointer"
            onClick={() => onSelectSeason(step.seasonNumber)}
          >
            <circle
              cx={cx}
              cy={cy}
              r={active ? 11 : 8}
              fill={ringColor}
              opacity={active ? 0.28 : 0.16}
            />
            <circle
              cx={cx}
              cy={cy}
              r={active ? 6.2 : 5.2}
              fill={ringColor}
              style={{
                filter: `drop-shadow(0 0 6px ${ringColor})`,
              }}
            />
            <circle cx={cx} cy={cy} r={2.3} fill="#F5F7FF" />
          </g>
        );
      })}
    </svg>
  );
};
