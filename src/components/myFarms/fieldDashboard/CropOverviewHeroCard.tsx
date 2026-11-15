import React from 'react';
import {
  AlertTriangle,
  Calendar,
  CalendarCheck2,
  Check,
  Clock,
  Hourglass,
  MapPin,
} from 'lucide-react';
import { FieldIntelligenceViewModel } from './fieldDashboardModel';
import cropHealthLeavesImg from '../../../assets/images/crop_health_leaves_1794731997465.jpg';

interface CropOverviewHeroCardProps {
  model: FieldIntelligenceViewModel;
  onOpenCropHealthDetails?: () => void;
}

export const CropOverviewHeroCard: React.FC<CropOverviewHeroCardProps> = ({
  model,
  onOpenCropHealthDetails,
}) => {
  const statusBadgeColors =
    model.statusLabel === 'Active'
      ? 'bg-[#12CE64] text-[#032613]'
      : model.statusLabel === 'Needs Review'
        ? 'bg-amber-400 text-[#291A02]'
        : 'bg-emerald-200/80 dark:bg-[#1E4B38] text-[#06291D] dark:text-[#D5F0DF]';

  return (
    <section
      aria-label="Crop overview"
      onClick={onOpenCropHealthDetails}
      role={onOpenCropHealthDetails ? 'button' : undefined}
      tabIndex={onOpenCropHealthDetails ? 0 : undefined}
      onKeyDown={(e) => {
        if (onOpenCropHealthDetails && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpenCropHealthDetails();
        }
      }}
      className={`relative overflow-hidden rounded-[20px] border border-emerald-700/20 dark:border-[#78CC92]/28 bg-white/75 dark:bg-[#052418]/78 backdrop-blur-xl shadow-[0_12px_32px_rgba(4,40,26,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.34)] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[24.8fr_28.4fr_23.2fr_23.6fr] lg:h-[220px] xl:h-[244px] 2xl:h-[270px] transition-all ${
        onOpenCropHealthDetails
          ? 'cursor-pointer hover:border-emerald-500/50 dark:hover:border-[#35ED91]/55'
          : ''
      }`}
    >
      {/* Section 1: Full-Bleed Crop Photograph with Right Gradient Mask */}
      <div className="relative h-[180px] md:h-auto lg:h-full overflow-hidden">
        <img
          src={model.cropImageSrc}
          alt={model.cropName}
          className="w-full h-full object-cover object-center"
        />
        <div
          className="hidden dark:block absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, transparent 52%, rgba(4, 30, 19, 0.45) 80%, #052418 100%)',
          }}
        />
        <div
          className="dark:hidden absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, transparent 56%, rgba(236, 253, 245, 0.45) 82%, rgba(255, 255, 255, 0.85) 100%)',
          }}
        />
      </div>

      {/* Section 2: Crop Identity & Growth Stage */}
      <div className="px-4 xl:px-5 py-3 xl:py-4 flex flex-col justify-between gap-2 border-t md:border-t-0 lg:border-r border-emerald-900/10 dark:border-[#A0CDAA]/18 min-w-0">
        <div>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold tracking-tight ${statusBadgeColors}`}
          >
            {model.statusLabel}
          </span>
          <h2 className="mt-1.5 text-[26px] xl:text-[32px] 2xl:text-[36px] font-bold leading-[1.06] tracking-[-0.02em] text-[#05291B] dark:text-[#F3F8F4] truncate">
            {model.cropName}
          </h2>
          <div className="mt-0.5 text-[14px] xl:text-[16px] font-medium text-[#184634] dark:text-white/95 truncate">
            {model.variety}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] xl:text-[13px] text-[#2A5E49] dark:text-[#C6D4CA] tabular-nums">
            <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-[#7CD7A0] shrink-0" />
            <span className="truncate">
              {model.fieldDisplayTitle} · {model.fieldAreaLabel}
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-emerald-900/12 dark:border-[#A0CDAA]/20 space-y-1.5">
          <div className="flex items-center gap-2.5">
            {/* Stylized 3-leaf green plant SVG */}
            <svg viewBox="0 0 56 56" fill="none" className="w-9 h-9 xl:w-10 xl:h-10 shrink-0" aria-hidden="true">
              <path
                d="M28 47V22"
                stroke="#18C96D"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              <path
                d="M28 29C28 19 34 11 45 10C45 20 38 29 28 29Z"
                fill="url(#heroLeafA)"
              />
              <path
                d="M28 33C19 33 11 26 11 16C20 16 28 24 28 33Z"
                fill="url(#heroLeafB)"
              />
              <path
                d="M28 24C24 17 24 10 28 5C32 10 32 17 28 24Z"
                fill="#35ED91"
              />
              <defs>
                <linearGradient id="heroLeafA" x1="28" y1="10" x2="45" y2="29" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#42F59B" />
                  <stop offset="1" stopColor="#0DA95B" />
                </linearGradient>
                <linearGradient id="heroLeafB" x1="11" y1="16" x2="28" y2="33" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#2EE488" />
                  <stop offset="1" stopColor="#09914E" />
                </linearGradient>
              </defs>
            </svg>

            <div className="min-w-0">
              <div className="text-[11.5px] font-medium text-[#2A5E49] dark:text-[#B8CCC0]">
                Growth Stage
              </div>
              <div className="text-[15px] xl:text-[16.5px] font-bold text-[#05291B] dark:text-[#F3F8F4] leading-tight truncate">
                {model.growthStage}
              </div>
            </div>
          </div>

          <div>
            <div className="w-full h-[8px] xl:h-[9px] rounded-full bg-emerald-950/15 dark:bg-[#29483A] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${model.growthProgressPct}%`,
                  background: 'linear-gradient(90deg, #08BC66, #36ED96)',
                  boxShadow: '0 0 12px rgba(29, 229, 126, 0.45)',
                }}
              />
            </div>
            <div className="mt-1 text-right text-[11px] font-medium text-[#2B5D4A] dark:text-[#C6D4CA] tabular-nums">
              ~ {model.growthProgressPct}% Complete
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Planting & Lifecycle Metrics */}
      <div className="px-4 xl:px-5 py-3 xl:py-4 flex flex-col justify-between border-t lg:border-t-0 md:border-r lg:border-r-0 border-emerald-900/10 dark:border-[#A0CDAA]/18">
        <div className="flex items-start gap-3">
          <Calendar className="w-4.5 h-4.5 mt-0.5 text-emerald-700 dark:text-[#9FD3B2] shrink-0" />
          <div className="min-w-0">
            <div className="text-[11.5px] xl:text-[12.5px] text-[#2A5E49] dark:text-[#AECCB8]">Planted On</div>
            <div className="text-[14px] xl:text-[15px] font-semibold text-[#05291B] dark:text-[#F1F7F3] tabular-nums truncate">
              {model.plantedOn}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Clock className="w-4.5 h-4.5 mt-0.5 text-emerald-700 dark:text-[#9FD3B2] shrink-0" />
          <div className="min-w-0">
            <div className="text-[11.5px] xl:text-[12.5px] text-[#2A5E49] dark:text-[#AECCB8]">
              Days Since Planting
            </div>
            <div className="text-[14px] xl:text-[15px] font-semibold text-[#05291B] dark:text-[#F1F7F3] tabular-nums truncate">
              {model.daysSincePlanting}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Hourglass className="w-4.5 h-4.5 mt-0.5 text-emerald-700 dark:text-[#9FD3B2] shrink-0" />
          <div className="min-w-0">
            <div className="text-[11.5px] xl:text-[12.5px] text-[#2A5E49] dark:text-[#AECCB8]">Est. Maturity</div>
            <div className="text-[14px] xl:text-[15px] font-semibold text-[#05291B] dark:text-[#F1F7F3] tabular-nums truncate">
              {model.estMaturity}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <CalendarCheck2 className="w-4.5 h-4.5 mt-0.5 text-emerald-700 dark:text-[#9FD3B2] shrink-0" />
          <div className="min-w-0">
            <div className="text-[11.5px] xl:text-[12.5px] text-[#2A5E49] dark:text-[#AECCB8]">Harvest Window</div>
            <div className="text-[14px] xl:text-[15px] font-semibold text-[#05291B] dark:text-[#F1F7F3] tabular-nums truncate">
              {model.harvestWindow}
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Elevated Crop Health Card with Decorative Bottom-Right Foliage */}
      <div className="p-2">
        <div
          className="relative h-full min-h-[175px] rounded-[16px] border border-emerald-700/20 dark:border-[#78CC92]/30 bg-emerald-50/75 dark:bg-[#0B3524]/75 backdrop-blur-md p-3.5 xl:p-4 overflow-hidden flex flex-col justify-between"
        >
          {/* Decorative Foliage Bottom-Right */}
          <img
            src={cropHealthLeavesImg}
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none absolute right-0 bottom-0 w-[56%] h-[56%] object-cover object-right-bottom opacity-25 dark:opacity-75 dark:mix-blend-lighten"
            style={{
              maskImage:
                'radial-gradient(ellipse at 85% 90%, rgba(0,0,0,0.95) 28%, transparent 78%)',
              WebkitMaskImage:
                'radial-gradient(ellipse at 85% 90%, rgba(0,0,0,0.95) 28%, transparent 78%)',
            }}
          />

          <div className="relative z-10 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[17px] xl:text-[19px] font-bold text-[#05291B] dark:text-white tracking-tight">
                Crop Health
              </h3>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/75 dark:bg-[#07261A]/75 border border-emerald-600/25 dark:border-[#35ED91]/30 shrink-0">
                <span
                  className={`w-5 h-5 rounded-full inline-flex items-center justify-center ${
                    model.cropHealthBadge === 'Healthy'
                      ? 'bg-[#16D979] text-[#032613]'
                      : model.cropHealthBadge === 'Attention'
                        ? 'bg-amber-400 text-[#291A02]'
                        : 'bg-rose-500 text-white'
                  }`}
                >
                  {model.cropHealthBadge === 'Healthy' ? (
                    <Check className="w-3 h-3 stroke-[3]" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 stroke-[2.5]" />
                  )}
                </span>
                <span
                  className={`text-[12.5px] xl:text-[13.5px] font-semibold ${
                    model.cropHealthBadge === 'Healthy'
                      ? 'text-emerald-800 dark:text-[#35ED91]'
                      : model.cropHealthBadge === 'Attention'
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {model.cropHealthBadge}
                </span>
              </div>
            </div>

            <p className="text-[12.5px] xl:text-[13.5px] leading-[1.45] text-[#153F2E] dark:text-[#DCE8E0] max-w-[94%] line-clamp-4">
              {model.cropHealthSummary}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
