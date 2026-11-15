import React from 'react';
import { ClipboardCheck, Droplets, Leaf, PackageCheck } from 'lucide-react';
import { FieldActionDisplayItem, FieldIntelligenceViewModel } from './fieldDashboardModel';

interface TodayActionsCardProps {
  model: FieldIntelligenceViewModel;
  onToggleTask: (taskId: string, completed: boolean) => void;
  onViewFullActionPlan: () => void;
}

const ActionIcon: React.FC<{ kind: FieldActionDisplayItem['iconKind'] }> = ({ kind }) => {
  if (kind === 'water') {
    return (
      <Droplets className="w-5 h-5 text-sky-500 dark:text-[#38BFEF] fill-sky-500/40 dark:fill-[#38BFEF]/70 shrink-0" />
    );
  }
  if (kind === 'pest') {
    return (
      <Leaf className="w-5 h-5 text-amber-500 dark:text-[#FFBE32] shrink-0" />
    );
  }
  return (
    <PackageCheck className="w-5 h-5 text-emerald-700 dark:text-[#A3BFA8] shrink-0" />
  );
};

export const TodayActionsCard: React.FC<TodayActionsCardProps> = ({
  model,
  onToggleTask,
  onViewFullActionPlan,
}) => {
  return (
    <section
      aria-label="What You Need to Do Today"
      onClick={onViewFullActionPlan}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onViewFullActionPlan();
        }
      }}
      className="relative rounded-[19px] border border-emerald-700/20 dark:border-[#78CC92]/26 bg-white/75 dark:bg-[#05281A]/72 backdrop-blur-xl shadow-[0_10px_28px_rgba(4,40,26,0.10)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_10px_28px_rgba(0,0,0,0.28)] px-4 py-3 xl:px-5 xl:py-3.5 flex flex-col justify-between gap-2 transition-all cursor-pointer hover:border-emerald-500/50 dark:hover:border-[#35ED91]/55"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2 pb-1.5 border-b border-emerald-900/10 dark:border-[#9FD3B8]/16">
          <ClipboardCheck className="w-4.5 h-4.5 text-emerald-600 dark:text-[#13D66B] shrink-0" />
          <h3 className="text-[16px] xl:text-[17.5px] font-bold text-[#05291B] dark:text-white tracking-tight truncate">
            What You Need to Do Today
          </h3>
        </div>

        <div className="space-y-1.5">
          {model.actions.map((item) => {
            const badgeStyle =
              item.priority === 'High'
                ? 'bg-emerald-600/18 text-emerald-800 dark:bg-[#0E482A] dark:text-[#35ED91] border-emerald-600/25 dark:border-[#13D66B]/30'
                : item.priority === 'Medium'
                  ? 'bg-amber-500/18 text-amber-800 dark:bg-[#49360A] dark:text-[#FFBE32] border-amber-500/25 dark:border-[#FFBE32]/30'
                  : 'bg-emerald-950/10 text-[#2A5E49] dark:bg-[#23372D] dark:text-[#B5C6BC] border-emerald-900/15 dark:border-white/10';

            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2.5 py-0.5 px-1.5 -mx-1.5 rounded-xl hover:bg-emerald-500/10 dark:hover:bg-[#0D3927]/60 transition-colors"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {item.taskId ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleTask(item.taskId!, !item.completed);
                      }}
                      title={item.completed ? 'Mark task incomplete' : 'Mark task complete'}
                      className="mt-0.5 cursor-pointer shrink-0"
                    >
                      <ActionIcon kind={item.iconKind} />
                    </button>
                  ) : (
                    <div className="mt-0.5">
                      <ActionIcon kind={item.iconKind} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div
                      className={`text-[13px] xl:text-[13.5px] font-semibold leading-snug truncate ${
                        item.completed
                          ? 'line-through text-emerald-900/50 dark:text-[#8EA99A]'
                          : 'text-[#05291B] dark:text-[#F1F7F3]'
                      }`}
                    >
                      {item.title}
                    </div>
                    <div className="text-[11.5px] xl:text-[12px] text-[#2A5E49] dark:text-[#C3D3C8] truncate">
                      {item.subtitle}
                    </div>
                  </div>
                </div>

                <span
                  className={`shrink-0 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${badgeStyle}`}
                >
                  {item.priority}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary CTA Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onViewFullActionPlan();
        }}
        className="w-full h-[38px] xl:h-[40px] rounded-[12px] text-[13.5px] xl:text-[14px] font-bold text-[#032012] transition-all hover:brightness-105 active:scale-[0.99] shadow-[0_6px_20px_rgba(19,214,107,0.28)] cursor-pointer shrink-0"
        style={{
          background: 'linear-gradient(100deg, #17D85D, #08B957)',
        }}
      >
        View Full Action Plan →
      </button>
    </section>
  );
};
