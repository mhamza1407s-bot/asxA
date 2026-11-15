import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ChevronRight,
  ChevronsRight,
  HelpCircle,
  PenTool,
  Plus,
  Search,
  Sprout,
  Trash2,
  X,
} from 'lucide-react';
import { FarmHealthStatus, FarmMapRecord } from '../../types/maps';
import { FarmThumbnail } from './FarmThumbnail';

interface FarmSidebarProps {
  farms: FarmMapRecord[];
  selectedFarmId: string | null;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSelectFarm: (farmId: string) => void;
  onEditFarm: (farm: FarmMapRecord) => void;
  onDeleteFarm: (farm: FarmMapRecord) => void;
  deletingFarmId?: string | null;
  onOpenAddFarm: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  loading?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const STATUS_BADGE_MAP: Record<
  FarmHealthStatus,
  {
    label: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    dotColor: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  healthy: {
    label: 'Healthy',
    bgClass: 'bg-emerald-50 dark:bg-[#103828]',
    textClass: 'text-emerald-700 dark:text-[#4CEB87]',
    borderClass: 'border-emerald-200 dark:border-[#1E6342]',
    dotColor: '#22C55E',
    Icon: Activity,
  },
  moderate: {
    label: 'Moderate',
    bgClass: 'bg-amber-50 dark:bg-[#3A2B11]',
    textClass: 'text-amber-700 dark:text-[#F9B938]',
    borderClass: 'border-amber-200 dark:border-[#74511B]',
    dotColor: '#F59E0B',
    Icon: AlertTriangle,
  },
  at_risk: {
    label: 'At Risk',
    bgClass: 'bg-rose-50 dark:bg-[#3F141A]',
    textClass: 'text-rose-700 dark:text-[#FB5A67]',
    borderClass: 'border-rose-200 dark:border-[#7A242D]',
    dotColor: '#EF4444',
    Icon: AlertOctagon,
  },
  no_data: {
    label: 'No Data',
    bgClass: 'bg-slate-100 dark:bg-[#222C36]',
    textClass: 'text-slate-600 dark:text-[#B4BFC9]',
    borderClass: 'border-slate-200 dark:border-[#3E4B59]',
    dotColor: '#8C96A0',
    Icon: HelpCircle,
  },
};

export const FarmSidebar: React.FC<FarmSidebarProps> = ({
  farms,
  selectedFarmId,
  searchQuery,
  onSearchQueryChange,
  onSelectFarm,
  onEditFarm,
  onDeleteFarm,
  deletingFarmId = null,
  onOpenAddFarm,
  collapsed,
  onToggleCollapse,
  loading = false,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const [openMenuFarmId, setOpenMenuFarmId] = useState<string | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenuFarmId) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-farm-action-menu="true"]')) return;
      setOpenMenuFarmId(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuFarmId(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuFarmId]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredFarms = normalizedQuery
    ? farms.filter((f) => {
        const nameMatch = f.name.toLowerCase().includes(normalizedQuery);
        const cropMatch = (f.crop ?? '').toLowerCase().includes(normalizedQuery);
        const locMatch = f.locationLabel.toLowerCase().includes(normalizedQuery);
        return nameMatch || cropMatch || locMatch;
      })
    : farms;

  // Desktop collapsed icon rail
  if (collapsed && !mobileOpen) {
    return (
      <aside
        aria-label="My Farms sidebar (collapsed)"
        className="hidden md:flex w-[68px] shrink-0 h-full flex-col items-center justify-between py-3.5 bg-gradient-to-b from-[#ECF7F4] to-[#D7ECE6] dark:from-[#05201D] dark:to-[#041513] border-r border-teal-200/80 dark:border-teal-400/15 select-none z-20"
      >
        <div className="flex flex-col items-center gap-3 w-full">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand My Farms panel"
            aria-label="Expand My Farms panel"
            className="w-10 h-10 rounded-xl bg-white hover:bg-teal-50 border border-teal-200 text-[#0F766E] dark:bg-white/[0.04] dark:hover:bg-white/[0.1] dark:border-teal-400/20 dark:text-[#2DD4BF] flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>

          <div className="w-8 h-px bg-teal-200/70 dark:bg-teal-400/15" />

          <div className="flex flex-col items-center gap-2 w-full px-2 overflow-y-auto fs-thin-scroll max-h-[calc(100dvh-210px)]">
            {farms.map((farm) => {
              const isSelected = farm.id === selectedFarmId;
              const badge = STATUS_BADGE_MAP[farm.healthStatus] ?? STATUS_BADGE_MAP.no_data;
              return (
                <button
                  key={farm.id}
                  type="button"
                  onClick={() => onSelectFarm(farm.id)}
                  title={`${farm.name} (${farm.areaHa.toFixed(1)} ha)`}
                  aria-label={`Select ${farm.name}`}
                  className={`relative w-11 h-11 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-teal-600 bg-teal-50 shadow-sm dark:border-[#2DD4BF] dark:bg-[#093A34] dark:shadow-[0_0_12px_rgba(45,212,191,0.28)]'
                      : 'border-teal-200/80 bg-white hover:border-teal-300 dark:border-teal-400/15 dark:bg-[#072824] dark:hover:border-teal-400/35'
                  }`}
                >
                  <Sprout className="w-4 h-4 text-[#0F766E] dark:text-teal-100" />
                  <span
                    className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full"
                    style={{ backgroundColor: badge.dotColor }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenAddFarm}
          title="Add Farm"
          aria-label="Add Farm"
          className="w-11 h-11 rounded-xl border border-teal-700 bg-gradient-to-b from-[#14B89A] to-[#0F766E] dark:border-[#2DD4BF]/70 dark:from-[#0A3D36] dark:to-[#062823] text-white flex items-center justify-center shadow-md dark:shadow-[0_0_14px_rgba(20,184,154,0.25)] hover:brightness-110 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
        </button>
      </aside>
    );
  }

  const sidebarContent = (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-[#ECF7F4] via-[#E2F2EE] to-[#D5EAE4] text-[#072622] dark:from-[#05201D] dark:via-[#041A17] dark:to-[#031411] dark:text-[#E5F6F2] select-none">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center">
            <Sprout className="w-5 h-5 text-[#0F766E] dark:text-[#2DD4BF]" strokeWidth={2.2} />
          </div>
          <h1 className="text-[20px] font-semibold tracking-tight text-[#072622] dark:text-white leading-none">
            My Farms
          </h1>
        </div>

        {mobileOpen && onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close farms drawer"
            className="w-8 h-8 rounded-lg hover:bg-teal-100/80 text-[#1B4D46] hover:text-[#072622] dark:hover:bg-white/[0.08] dark:text-teal-200/70 dark:hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Local Farms Search Input */}
      <div className="px-4 pb-3">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#0F766E]/70 dark:text-teal-300/70 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search farms..."
            aria-label="Search saved farms"
            className="w-full h-10 pl-10 pr-9 rounded-lg bg-white border border-teal-200 text-[13.5px] text-[#072622] placeholder:text-[#1B4D46]/70 focus:outline-none focus:border-teal-600 dark:bg-[#072824] dark:border-teal-400/20 dark:text-[#E5F6F2] dark:placeholder:text-[#96C7BE]/70 dark:focus:border-[#2DD4BF]/70 transition-colors shadow-2xs dark:shadow-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              aria-label="Clear farm search"
              className="absolute right-2.5 text-[#1B4D46] hover:text-[#072622] dark:text-teal-200/70 dark:hover:text-white p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Independent Scrollable Farm Card List */}
      <div
        ref={listContainerRef}
        className="flex-1 min-h-0 overflow-y-auto fs-thin-scroll px-4 pb-3 space-y-2.5"
      >
        {loading && farms.length === 0 ? (
          <div className="space-y-2.5 pt-1">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-[94px] rounded-xl bg-white border border-teal-200 dark:bg-[#072824] dark:border-teal-400/15 p-2.5 flex items-center gap-3 animate-pulse"
              >
                <div className="w-[74px] h-[74px] rounded-lg bg-teal-100 dark:bg-white/[0.06]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-32 rounded bg-teal-100 dark:bg-white/[0.08]" />
                  <div className="h-3 w-24 rounded bg-teal-50 dark:bg-white/[0.06]" />
                  <div className="h-5 w-20 rounded-full bg-teal-50 dark:bg-white/[0.06]" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredFarms.length === 0 ? (
          <div className="py-12 px-4 text-center rounded-xl border border-dashed border-teal-300 bg-white/80 dark:border-teal-400/20 dark:bg-[#05201D]">
            <p className="text-sm font-medium text-[#072622] dark:text-[#E5F6F2]">
              {farms.length === 0 ? 'No farms saved yet' : 'No farms found'}
            </p>
            <p className="text-xs text-[#1B4D46] dark:text-[#96C7BE] mt-1">
              {farms.length === 0
                ? 'Click + Add Farm below to draw or import a boundary.'
                : 'Try another farm name.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange('')}
                className="mt-3 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-[#0F766E] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-xs font-medium dark:text-[#2DD4BF] cursor-pointer"
              >
                Reset search
              </button>
            )}
          </div>
        ) : (
          filteredFarms.map((farm, idx) => {
            const isSelected = farm.id === selectedFarmId;
            const badge = STATUS_BADGE_MAP[farm.healthStatus] ?? STATUS_BADGE_MAP.no_data;
            const StatusIcon = badge.Icon;
            const isMenuOpen = openMenuFarmId === farm.id;
            const openUpward = filteredFarms.length > 2 && idx >= filteredFarms.length - 1;
            const isDeleting = deletingFarmId === farm.id;

            return (
              <div
                key={farm.id}
                className={`relative rounded-xl flex items-center transition-all ${
                  isMenuOpen ? 'z-30' : 'z-0'
                } ${
                  isSelected
                    ? 'border-[1.5px] border-teal-600 bg-gradient-to-r from-teal-50 via-emerald-50/40 to-white shadow-[0_6px_18px_rgba(15,118,110,0.12)] dark:border-[#2DD4BF] dark:from-[#093A34] dark:via-[#072E29] dark:to-[#05201D] dark:shadow-[0_0_20px_rgba(20,184,154,0.18)]'
                    : 'border border-teal-200/85 bg-white/95 hover:border-teal-300 hover:bg-white shadow-2xs dark:shadow-none dark:border-teal-400/15 dark:bg-[#072824]/95 dark:hover:border-teal-400/30 dark:hover:bg-[#09332D]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuFarmId(null);
                    onSelectFarm(farm.id);
                    onCloseMobile?.();
                  }}
                  aria-pressed={isSelected}
                  className="flex-1 min-w-0 text-left p-2.5 pr-1 flex items-center gap-3 cursor-pointer rounded-l-xl focus:outline-none"
                >
                  <FarmThumbnail
                    geometry={farm.geometry}
                    centroid={farm.centroid}
                    status={farm.healthStatus}
                    selected={isSelected}
                  />

                  <div className="flex-1 min-w-0 py-0.5">
                    <div className="text-[15px] font-semibold text-[#072622] dark:text-white truncate leading-tight">
                      {farm.name}
                    </div>
                    <div className="text-[13px] text-[#1B4D46] dark:text-[#96C7BE] mt-0.5 truncate tabular-nums">
                      {farm.areaHa.toFixed(1)} ha • {farm.crop || 'Crop not recorded'}
                    </div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                      >
                        <StatusIcon className="w-3 h-3 shrink-0" />
                        <span>{badge.label}</span>
                      </span>
                    </div>
                  </div>
                </button>

                {/* Right-arrow actions dropdown trigger */}
                <div data-farm-action-menu="true" className="relative pr-2 shrink-0 flex items-center">
                  <button
                    type="button"
                    aria-label={`Actions for ${farm.name}`}
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuFarmId((prev) => (prev === farm.id ? null : farm.id));
                    }}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                      isMenuOpen
                        ? 'bg-teal-50 text-[#0F766E] dark:bg-white/[0.12] dark:text-[#2DD4BF]'
                        : isSelected
                          ? 'text-[#072622] hover:bg-teal-100/70 dark:text-white dark:hover:bg-white/[0.1]'
                          : 'text-[#1B4D46]/80 hover:text-[#072622] hover:bg-teal-50 dark:text-teal-200/60 dark:hover:text-teal-50 dark:hover:bg-white/[0.08]'
                    }`}
                  >
                    <ChevronRight
                      className={`w-4 h-4 transition-transform duration-150 ${
                        isMenuOpen ? 'rotate-90' : ''
                      }`}
                    />
                  </button>

                  {isMenuOpen && (
                    <div
                      role="menu"
                      aria-label={`${farm.name} options`}
                      className={`absolute right-1 ${
                        openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                      } w-36 rounded-xl border border-teal-200 bg-white shadow-xl dark:border-teal-400/20 dark:bg-[#062420] dark:shadow-[0_14px_30px_rgba(0,0,0,0.65)] py-1 z-50 overflow-hidden`}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuFarmId(null);
                          onEditFarm(farm);
                          onCloseMobile?.();
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-[#072622] hover:bg-teal-50 hover:text-[#0F766E] dark:text-teal-100 dark:hover:bg-white/[0.08] dark:hover:text-[#2DD4BF] flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <PenTool className="w-3.5 h-3.5 shrink-0" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={isDeleting}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuFarmId(null);
                          onDeleteFarm(farm);
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/15 disabled:opacity-50 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Fixed Bottom Footer CTA */}
      <div className="shrink-0 px-4 py-3.5 border-t border-teal-200/80 bg-[#D5EAE4] dark:border-teal-400/15 dark:bg-[#031714]">
        <button
          type="button"
          onClick={() => {
            onOpenAddFarm();
            onCloseMobile?.();
          }}
          className="w-full h-11 rounded-xl border border-teal-600 bg-gradient-to-r from-[#0F766E] via-[#14B8A6] to-[#059669] dark:border-[#2DD4BF]/70 dark:from-[#0B463E] dark:via-[#0E564C] dark:to-[#083831] text-white font-semibold text-[15px] inline-flex items-center justify-center gap-2 shadow-md dark:shadow-[0_0_18px_rgba(20,184,154,0.22),inset_0_1px_0_rgba(94,234,212,0.22)] hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          <span>Add Farm</span>
        </button>
      </div>
    </div>
  );

  if (mobileOpen) {
    return (
      <div className="fixed inset-0 z-[700] md:hidden flex">
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/65 backdrop-blur-xs"
          onClick={onCloseMobile}
        />
        <aside
          aria-label="My Farms drawer"
          className="relative w-[min(90vw,380px)] h-full border-r border-teal-200 dark:border-teal-400/15 shadow-2xl z-10"
        >
          {sidebarContent}
        </aside>
      </div>
    );
  }

  return (
    <aside
      aria-label="My Farms sidebar"
      className="hidden md:flex w-[360px] lg:w-[388px] shrink-0 h-full border-r border-teal-200 dark:border-teal-400/15 z-20"
    >
      {sidebarContent}
    </aside>
  );
};
