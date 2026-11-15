import React from 'react';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';

export type DisclosureMode = 'simple' | 'advanced';

interface SubCategoryHeaderBarProps {
  title: string;
  subtitle: string;
  fieldCode: string;
  fieldDisplayName: string;
  areaLabel: string;
  cropName: string;
  disclosureMode: DisclosureMode;
  onChangeDisclosureMode: (mode: DisclosureMode) => void;
  freshnessLine: string;
  onRefresh?: () => void;
  refreshLoading?: boolean;
  isOnline?: boolean;
  actionSlot?: React.ReactNode;
}

export const SubCategoryHeaderBar: React.FC<SubCategoryHeaderBarProps> = ({
  title,
  subtitle,
  fieldCode,
  fieldDisplayName,
  areaLabel,
  cropName,
  disclosureMode,
  onChangeDisclosureMode,
  freshnessLine,
  onRefresh,
  refreshLoading,
  isOnline = true,
  actionSlot,
}) => {
  return (
    <header className="fs-dash-panel !rounded-[24px] p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
            <span>{fieldCode}</span>
            <span aria-hidden="true" className="opacity-50">·</span>
            <span className="truncate max-w-[240px]">{fieldDisplayName}</span>
            <span aria-hidden="true" className="opacity-50">·</span>
            <span className="tabular-nums">{areaLabel}</span>
            <span aria-hidden="true" className="opacity-50">·</span>
            <span>{cropName}</span>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-[#05291B] dark:text-[#ECF8F5] tracking-tight">
            {title}
          </h2>
          <p className="text-xs text-[#2B5E56] dark:text-[#96C7BE] leading-relaxed max-w-3xl">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Simple / Advanced Disclosure Toggle (§31) */}
          <div
            role="group"
            aria-label="Detail disclosure mode"
            className="inline-flex items-center rounded-xl border border-emerald-800/18 dark:border-[#78CC92]/28 bg-white/60 dark:bg-[#042419]/80 p-0.5 text-xs font-semibold"
          >
            <button
              type="button"
              onClick={() => onChangeDisclosureMode('simple')}
              className={`px-2.5 py-1.5 rounded-[10px] transition-colors cursor-pointer ${
                disclosureMode === 'simple'
                  ? 'bg-[#0F766E] dark:bg-[#14B89A] text-white dark:text-[#032018]'
                  : 'text-[#1B4D46] dark:text-[#9BC7BE] hover:text-[#05291B] dark:hover:text-white'
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => onChangeDisclosureMode('advanced')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] transition-colors cursor-pointer ${
                disclosureMode === 'advanced'
                  ? 'bg-[#0F766E] dark:bg-[#14B89A] text-white dark:text-[#032018]'
                  : 'text-[#1B4D46] dark:text-[#9BC7BE] hover:text-[#05291B] dark:hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Advanced</span>
            </button>
          </div>

          {onRefresh && (
            <button
              type="button"
              disabled={!isOnline || refreshLoading}
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-800/18 dark:border-[#78CC92]/28 bg-white/60 dark:bg-[#042419]/80 text-xs font-semibold text-[#05291B] dark:text-[#ECF8F5] hover:bg-emerald-500/10 disabled:opacity-45 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshLoading ? 'animate-spin' : ''}`} />
              <span>{refreshLoading ? 'Syncing…' : 'Refresh'}</span>
            </button>
          )}

          {actionSlot}
        </div>
      </div>

      <div className="pt-2.5 border-t border-emerald-900/10 dark:border-white/10 text-[11px] text-[#2B5E56] dark:text-[#8EB8B0] flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{freshnessLine}</span>
      </div>
    </header>
  );
};
