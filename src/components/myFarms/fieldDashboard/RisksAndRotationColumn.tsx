import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Droplets,
  RefreshCw,
} from 'lucide-react';
import { FieldIntelligenceViewModel } from './fieldDashboardModel';

interface RisksAndRotationColumnProps {
  model: FieldIntelligenceViewModel;
  onViewAllRisks: () => void;
  onOpenRotationPlanner: () => void;
}

export const RisksAndRotationColumn: React.FC<RisksAndRotationColumnProps> = ({
  model,
  onViewAllRisks,
  onOpenRotationPlanner,
}) => {
  return (
    <div className="flex flex-col gap-2.5 xl:gap-3 justify-between h-full">
      {/* Top Card: Risks & Alerts */}
      <section
        aria-label="Risks & Alerts"
        onClick={onViewAllRisks}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onViewAllRisks();
          }
        }}
        className="flex-1 rounded-[19px] border border-emerald-700/20 dark:border-[#78CC92]/24 bg-white/75 dark:bg-[#052518]/76 backdrop-blur-xl shadow-[0_10px_28px_rgba(4,40,26,0.10)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_10px_28px_rgba(0,0,0,0.28)] px-4 py-3 flex flex-col justify-between gap-2 transition-all cursor-pointer hover:border-emerald-500/50 dark:hover:border-[#35ED91]/55"
      >
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-emerald-900/10 dark:border-[#9FD3B8]/15">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-[#FF4545] fill-rose-500/20 dark:fill-[#FF4545]/20 shrink-0" />
            <h3 className="text-[16px] xl:text-[17px] font-bold text-[#05291B] dark:text-white tracking-tight">
              Risks &amp; Alerts
            </h3>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewAllRisks();
            }}
            className="text-[12px] font-semibold text-emerald-700 dark:text-[#35ED91] hover:underline cursor-pointer whitespace-nowrap"
          >
            View All →
          </button>
        </div>

        <div className="divide-y divide-emerald-900/10 dark:divide-[#9FD3B8]/14 flex-1 flex flex-col justify-center">
          {model.risks.map((risk) => (
            <div
              key={risk.id}
              className="py-1.5 first:pt-0 last:pb-0 flex items-start gap-2.5 group"
            >
              <div className="w-8 h-8 rounded-[9px] bg-amber-500/15 dark:bg-[#49360A]/85 border border-amber-500/25 dark:border-[#FFBE32]/25 flex items-center justify-center shrink-0 mt-0.5">
                {risk.kind === 'water' ? (
                  <Droplets className="w-4 h-4 text-amber-600 dark:text-[#FFBE32]" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-[#FFBE32]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] xl:text-[13px] font-bold text-amber-700 dark:text-[#FFBE32] truncate group-hover:underline">
                    {risk.title}
                  </span>
                  <span className="text-[10.5px] text-[#3C6D59] dark:text-[#8EA99A] tabular-nums shrink-0">
                    {risk.timeAgo}
                  </span>
                </div>
                <div className="text-[11px] font-medium text-[#1E4F3D] dark:text-[#D5E4DC]">
                  {risk.severityLine}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#9BB3A6] truncate">
                  {risk.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom Card: Crop Rotation Overview */}
      <section
        aria-label="Crop Rotation Overview"
        onClick={onOpenRotationPlanner}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenRotationPlanner();
          }
        }}
        className="rounded-[18px] border border-emerald-700/20 dark:border-[#78CC92]/26 bg-white/75 dark:bg-[#05281A]/74 backdrop-blur-xl shadow-[0_8px_24px_rgba(4,40,26,0.10)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.28)] px-4 py-2.5 cursor-pointer hover:border-emerald-500/50 transition-all group"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-[#13D66B]" />
            <h3 className="text-[13px] xl:text-[13.5px] font-bold text-[#05291B] dark:text-[#F1F7F3] tracking-tight">
              Crop Rotation Overview
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-[#35ED91] opacity-80 group-hover:opacity-100">
            Plan →
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1.15fr_auto_1fr] items-center gap-1.5 text-center">
          <div className="py-0.5 px-1">
            <div className="text-[10.5px] text-[#3C6D59] dark:text-[#8EA99A]">Previous</div>
            <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#E6F4EC] truncate">
              {model.rotation.previousCrop}
            </div>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-emerald-600 dark:text-[#13D66B] shrink-0" />

          <div className="py-1 px-2 rounded-[9px] bg-emerald-600/15 dark:bg-[#0E432C]/90 border border-emerald-600/30 dark:border-[#35ED91]/35">
            <div className="text-[10px] font-semibold text-emerald-800 dark:text-[#35ED91]">
              Current
            </div>
            <div className="text-[12.5px] font-bold text-[#05291B] dark:text-white truncate">
              {model.rotation.currentCrop}
            </div>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-emerald-600 dark:text-[#13D66B] shrink-0" />

          <div className="py-0.5 px-1">
            <div className="text-[10.5px] text-[#3C6D59] dark:text-[#8EA99A]">Next</div>
            <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#E6F4EC] truncate">
              {model.rotation.nextCrop}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
