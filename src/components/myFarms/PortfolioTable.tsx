import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  Edit3,
  MapPin,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import {
  MyFarmRecord,
  PortfolioFieldRecord,
  PortfolioFilterState,
} from '../../types/myFarms';
import {
  formatArea,
  formatRelativeDate,
  formatStatusLabel,
  resolveFarmCardImage,
} from '../../lib/myFarmsEngine';

interface PortfolioTableProps {
  farms: MyFarmRecord[];
  fields: PortfolioFieldRecord[];
  filter: PortfolioFilterState;
  viewMode: 'list' | 'grid';
  selectedFarmId: string | null;
  onChangeSort: (sortBy: PortfolioFilterState['sortBy']) => void;
  onOpenDetails: (farmId: string, subTab?: 'overview' | 'fields' | 'settings') => void;
  onRenameFarm: (farm: MyFarmRecord) => void;
  onDeleteFarm: (farm: MyFarmRecord) => void;
}

/**
 * Custom crisp SVG crop illustrations so Active Crop stands out cleanly
 * in both dark midnight-blue glass and light daylight sky-glass views.
 */
const CropIllustration: React.FC<{ cropName?: string | null; className?: string }> = ({
  cropName,
  className = 'w-7 h-7',
}) => {
  const key = (cropName || '').toLowerCase();

  if (key.includes('corn') || key.includes('maize')) {
    return (
      <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
        <path
          d="M18 5C14.5 9.2 13.5 16.5 14.5 23.5C15.1 26.8 16.4 29 18 29C19.6 29 20.9 26.8 21.5 23.5C22.5 16.5 21.5 9.2 18 5Z"
          fill="#F5C438"
          stroke="#D99B16"
          strokeWidth="1.2"
        />
        <path d="M15.2 13H20.8M14.8 17.5H21.2M15.3 22H20.7" stroke="#D99B16" strokeWidth="1" opacity="0.7" />
        <path
          d="M15 28C11.5 25.5 9 20.5 9 14.5C12 16 14 19.5 15.5 24.5"
          fill="#22C55E"
          stroke="#15803D"
          strokeWidth="1.1"
        />
        <path
          d="M21 28C24.5 25.5 27 20.5 27 14.5C24 16 22 19.5 20.5 24.5"
          fill="#4ADE80"
          stroke="#16A34A"
          strokeWidth="1.1"
        />
      </svg>
    );
  }

  if (key.includes('wheat') || key.includes('barley') || key.includes('oat') || key.includes('rye')) {
    const isBarley = key.includes('barley');
    const primary = isBarley ? '#EAB308' : '#F59E0B';
    const highlight = isBarley ? '#FDE047' : '#FCD34D';
    return (
      <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
        <path d="M18 31V9" stroke={primary} strokeWidth="2" strokeLinecap="round" />
        <path d="M18 11C15.5 9.5 14.5 7 15.5 4.8C17.8 6 19 8.2 18 11Z" fill={highlight} />
        <path d="M18 15C14.5 14 12.8 11.4 13.8 9C16.5 10.2 18 12.2 18 15Z" fill={primary} />
        <path d="M18 15C21.5 14 23.2 11.4 22.2 9C19.5 10.2 18 12.2 18 15Z" fill={highlight} />
        <path d="M18 20C14.3 19 12.6 16.4 13.6 14C16.3 15.2 18 17.2 18 20Z" fill={highlight} />
        <path d="M18 20C21.7 19 23.4 16.4 22.4 14C19.7 15.2 18 17.2 18 20Z" fill={primary} />
        <path d="M18 25C14.6 24 13 21.5 13.8 19.2C16.4 20.3 18 22.2 18 25Z" fill={primary} />
        <path d="M18 25C21.4 24 23 21.5 22.2 19.2C19.6 20.3 18 22.2 18 25Z" fill={highlight} />
      </svg>
    );
  }

  if (key.includes('soy') || key.includes('pea') || key.includes('bean') || key.includes('lentil')) {
    return (
      <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
        <path d="M18 30V13" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M18 17C18 11 21.5 6.5 26.5 6.5C26.5 12 22.8 16.8 18 17Z"
          fill="#4ADE80"
          stroke="#15803D"
          strokeWidth="1.1"
        />
        <path
          d="M18 19C18 13.5 14 9 9 9.5C9.5 15 13.2 19 18 19Z"
          fill="#22C55E"
          stroke="#15803D"
          strokeWidth="1.1"
        />
        <path
          d="M18 23.5C18 18 22 14.5 26 15C25.2 20 22 23.5 18 23.5Z"
          fill="#86EFAC"
          stroke="#16A34A"
          strokeWidth="1.1"
        />
      </svg>
    );
  }

  if (key.includes('sunflower')) {
    return (
      <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
        <path d="M18 31V19" stroke="#22C55E" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="18" cy="13" r="8.2" fill="#FACC15" />
        <circle cx="18" cy="13" r="4.2" fill="#78350F" />
        <path d="M18 26C14.5 26 12 24 11.5 21.5C14.2 21.5 16.5 23.2 18 26Z" fill="#4ADE80" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
      <path d="M18 30V14" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M18 19C18 12.5 22.5 7.5 27.5 7.5C27.5 13.8 23 19 18 19Z"
        fill="#4ADE80"
        stroke="#15803D"
        strokeWidth="1.1"
      />
      <path
        d="M18 21C13 21 9 17 9 11.5C14 11.5 18 15.8 18 21Z"
        fill="#10B981"
        stroke="#047857"
        strokeWidth="1.1"
      />
    </svg>
  );
};

const GlassStatusBadge: React.FC<{ status: MyFarmRecord['assessment']['status'] }> = ({
  status,
}) => {
  const label = formatStatusLabel(status);
  if (status === 'good') {
    return (
      <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border border-emerald-500/40 bg-emerald-500/18 text-[#047857] dark:bg-[rgba(6,88,54,0.50)] dark:text-[#34D399] dark:border-[#34D399]/40">
        <span className="w-2.5 h-2.5 rounded-full bg-[#059669] dark:bg-[#22E9A8] shadow-[0_0_8px_rgba(34,233,168,0.65)]" />
        {label}
      </span>
    );
  }
  if (status === 'needs_attention' || status === 'needs_refresh') {
    return (
      <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border border-amber-500/45 bg-amber-400/20 text-[#92400E] dark:bg-[rgba(120,76,12,0.45)] dark:text-[#FFD15C] dark:border-amber-400/45">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-[#FFD15C] shadow-[0_0_8px_rgba(255,209,92,0.6)]" />
        {label}
      </span>
    );
  }
  if (status === 'alert') {
    return (
      <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border border-rose-500/45 bg-rose-500/18 text-[#9F1239] dark:bg-[rgba(128,24,42,0.52)] dark:text-[#FF7A8A] dark:border-rose-400/45">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 dark:bg-[#FF7A8A] shadow-[0_0_8px_rgba(255,122,138,0.6)]" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border border-white/60 bg-white/35 text-[#1B4D46] dark:bg-[rgba(10,58,52,0.44)] dark:text-[#C4E6DF] dark:border-[#5EEAD4]/35">
      <span className="w-2 h-2 rounded-full bg-[#0F766E] dark:bg-[#5EEAD4]" />
      {label}
    </span>
  );
};

export const PortfolioTable: React.FC<PortfolioTableProps> = ({
  farms,
  fields,
  filter,
  viewMode,
  selectedFarmId,
  onChangeSort,
  onOpenDetails,
  onRenameFarm,
  onDeleteFarm,
}) => {
  const [openMenu, setOpenMenu] = useState<{
    farm: MyFarmRecord;
    top: number;
    left: number;
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-farm-actions-trigger="true"]')) return;
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    const onScrollOrResize = () => setOpenMenu(null);

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [openMenu]);

  const handleToggleMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    farm: MyFarmRecord
  ) => {
    e.stopPropagation();
    if (openMenu?.farm.id === farm.id) {
      setOpenMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 104;
    const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth));
    const openUpward = rect.bottom + menuHeight + 12 > window.innerHeight;
    const top = openUpward ? Math.max(12, rect.top - menuHeight - 8) : rect.bottom + 8;
    setOpenMenu({ farm, top, left });
  };

  const renderSortIcon = (col: PortfolioFilterState['sortBy']) => {
    if (filter.sortBy !== col) return null;
    return filter.sortDir === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 inline ml-1 text-[#0F766E] dark:text-[#2DD4BF]" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 inline ml-1 text-[#0F766E] dark:text-[#2DD4BF]" />
    );
  };

  const getAriaSort = (col: PortfolioFilterState['sortBy']) => {
    if (filter.sortBy !== col) return 'none';
    return filter.sortDir === 'asc' ? 'ascending' : 'descending';
  };

  const renderThreeDotsButton = (farm: MyFarmRecord) => {
    const isOpen = openMenu?.farm.id === farm.id;
    return (
      <button
        type="button"
        data-farm-actions-trigger="true"
        onClick={(e) => handleToggleMenu(e, farm)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Actions for ${farm.name}`}
        className={`w-12 h-10 rounded-2xl inline-flex items-center justify-center border transition-all backdrop-blur-md cursor-pointer ${
          isOpen
            ? 'bg-teal-500/25 border-teal-500/70 text-[#072622] dark:bg-[rgba(20,184,154,0.28)] dark:border-[#2DD4BF] dark:text-white'
            : 'bg-white/40 hover:bg-white/65 border-white/75 text-[#072622] dark:bg-[rgba(8,48,44,0.44)] dark:hover:bg-[rgba(14,78,70,0.52)] dark:border-[rgba(94,234,212,0.36)] dark:text-[#D2EFE9]'
        }`}
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>
    );
  };

  const renderPopover = () => {
    if (!openMenu) return null;
    const { farm, top, left } = openMenu;
    return (
      <div
        ref={popoverRef}
        role="menu"
        style={{ top, left }}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[9999] w-48 rounded-2xl border border-white/85 dark:border-[rgba(45,212,191,0.48)] bg-[#E7F4F1]/95 dark:bg-[#05221E]/95 backdrop-blur-2xl shadow-[0_14px_34px_rgba(4,42,36,0.22)] dark:shadow-[0_16px_38px_rgba(0,14,12,0.65),0_0_18px_rgba(20,184,154,0.22)] py-1.5 text-xs font-medium"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpenMenu(null);
            onRenameFarm(farm);
          }}
          className="w-full px-3.5 py-2.5 text-left flex items-center gap-2.5 text-[#072622] dark:text-[#ECF8F5] hover:bg-teal-500/15 dark:hover:bg-[rgba(20,184,154,0.18)] transition-colors cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
          Rename
        </button>
        <div className="my-1 border-t border-[#0F766E]/15 dark:border-[#2DD4BF]/20" />
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpenMenu(null);
            onDeleteFarm(farm);
          }}
          className="w-full px-3.5 py-2.5 text-left flex items-center gap-2.5 text-rose-600 dark:text-[#FF7A8A] hover:bg-rose-500/15 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    );
  };

  /* GRID VIEW — uses exact Home page translucent glass card styling */
  if (viewMode === 'grid') {
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {farms.map((farm, idx) => {
            const fieldCount = fields.filter((fl) => fl.farmId === farm.id).length;
            const displayFields = fieldCount > 0 ? fieldCount : farm.hasBoundary ? 1 : 0;
            const thumbSrc = resolveFarmCardImage(farm.id, idx);
            const isVerified = farm.hasBoundary || farm.assessment.score !== null;
            const alerts = farm.assessment.activeAlertsCount;
            const cropLabel = farm.primaryCrop || 'Mixed Rotation';
            const updatedIso = farm.assessment.assessedAt || farm.updatedAt;

            return (
              <div
                key={farm.id}
                onClick={() => onOpenDetails(farm.id, 'overview')}
                className={`fs-glass-card fs-glass-card-interactive group !rounded-[28px] cursor-pointer ${
                  selectedFarmId === farm.id
                    ? 'ring-2 ring-[#0F766E]/60 dark:ring-[#2DD4BF]/70'
                    : ''
                }`}
              >
                {/* Photographic Cover */}
                <div className="relative h-40 overflow-hidden">
                  <img
                    src={thumbSrc}
                    alt={farm.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#031B18]/90 via-[#031B18]/25 to-transparent" />
                  <div className="absolute top-3 left-3">
                    <GlassStatusBadge status={farm.assessment.status} />
                  </div>
                  <div
                    className="absolute top-3 right-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderThreeDotsButton(farm)}
                  </div>
                  <div className="absolute bottom-3 left-4 right-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-white truncate">{farm.name}</h3>
                      {isVerified && (
                        <span
                          title="Verified mapped parcel"
                          className="w-4 h-4 rounded-[5px] bg-[#0F766E] dark:bg-[#2DD4BF] text-white dark:text-[#031F1C] inline-flex items-center justify-center shrink-0"
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-[#C4E6DF] mt-0.5 truncate">
                      <MapPin className="w-3 h-3 shrink-0 text-[#2DD4BF]" />
                      <span className="truncate">{farm.locationLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3.5 text-xs">
                  <div className="fs-dash-field-item !rounded-2xl grid grid-cols-3 gap-2 px-3 py-2.5">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[#1B4D46] dark:text-[#96C7BE]">
                        Area
                      </div>
                      <div className="font-semibold text-[#072622] dark:text-[#ECF8F5] tabular-nums mt-0.5">
                        {farm.mappedAreaHa > 0
                          ? formatArea(farm.mappedAreaHa, farm.areaUnit)
                          : farm.declaredAreaHa
                            ? formatArea(farm.declaredAreaHa, farm.areaUnit)
                            : 'Unmapped'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[#1B4D46] dark:text-[#96C7BE]">
                        Fields
                      </div>
                      <div className="font-semibold text-[#072622] dark:text-[#ECF8F5] tabular-nums mt-0.5">
                        {displayFields}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[#1B4D46] dark:text-[#96C7BE]">
                        Alerts
                      </div>
                      <div
                        className={`font-semibold tabular-nums mt-0.5 inline-flex items-center gap-1 ${
                          alerts > 0
                            ? 'text-amber-600 dark:text-[#FFD15C]'
                            : 'text-[#0F766E] dark:text-[#2DD4BF]'
                        }`}
                      >
                        <Bell className="w-3.5 h-3.5 fill-current" />
                        {alerts}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <CropIllustration cropName={cropLabel} className="w-6 h-6 shrink-0" />
                      <span className="font-medium text-[#072622] dark:text-[#ECF8F5] truncate">
                        {cropLabel}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#1B4D46] dark:text-[#B8DCD4] tabular-nums shrink-0">
                      {formatRelativeDate(updatedIso)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {renderPopover()}
      </>
    );
  }

  /* LIST / TABLE VIEW — uses exact Home page .fs-dash-panel see-through glass styling */
  return (
    <>
      <div className="fs-dash-panel !rounded-[30px]">
        {/* Desktop 9-Column Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/55 dark:border-[#2DD4BF]/20 text-[13px] font-semibold text-[#1B4D46] dark:text-[#B8DCD4]">
                <th className="py-4 pl-6 pr-3 w-[25%]" aria-sort={getAriaSort('name')}>
                  <button
                    type="button"
                    onClick={() => onChangeSort('name')}
                    className="inline-flex items-center hover:text-[#072622] dark:hover:text-white cursor-pointer"
                  >
                    Farm
                    {renderSortIcon('name')}
                  </button>
                </th>
                <th className="py-4 px-3 w-[12%]">Location</th>
                <th className="py-4 px-3 w-[9%]" aria-sort={getAriaSort('area')}>
                  <button
                    type="button"
                    onClick={() => onChangeSort('area')}
                    className="inline-flex items-center hover:text-[#072622] dark:hover:text-white cursor-pointer"
                  >
                    Area
                    {renderSortIcon('area')}
                  </button>
                </th>
                <th className="py-4 px-3 w-[7%] text-center" aria-sort={getAriaSort('fields')}>
                  <button
                    type="button"
                    onClick={() => onChangeSort('fields')}
                    className="inline-flex items-center hover:text-[#072622] dark:hover:text-white cursor-pointer"
                  >
                    Fields
                    {renderSortIcon('fields')}
                  </button>
                </th>
                <th className="py-4 px-3 w-[13%]">Active Crop</th>
                <th className="py-4 px-3 w-[12%]" aria-sort={getAriaSort('status')}>
                  <button
                    type="button"
                    onClick={() => onChangeSort('status')}
                    className="inline-flex items-center hover:text-[#072622] dark:hover:text-white cursor-pointer"
                  >
                    Status
                    {renderSortIcon('status')}
                  </button>
                </th>
                <th className="py-4 px-3 w-[10%]" aria-sort={getAriaSort('assessedAt')}>
                  <button
                    type="button"
                    onClick={() => onChangeSort('assessedAt')}
                    className="inline-flex items-center hover:text-[#072622] dark:hover:text-white cursor-pointer"
                  >
                    Last Updated
                    {renderSortIcon('assessedAt')}
                  </button>
                </th>
                <th className="py-4 px-3 w-[7%]" aria-sort={getAriaSort('alerts')}>
                  <button
                    type="button"
                    onClick={() => onChangeSort('alerts')}
                    className="inline-flex items-center hover:text-[#072622] dark:hover:text-white cursor-pointer"
                  >
                    Alerts
                    {renderSortIcon('alerts')}
                  </button>
                </th>
                <th className="py-4 pl-3 pr-6 w-[5%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40 dark:divide-[#2DD4BF]/14 text-sm">
              {farms.map((farm, idx) => {
                const fieldCount = fields.filter((fl) => fl.farmId === farm.id).length;
                const displayFields = fieldCount > 0 ? fieldCount : farm.hasBoundary ? 1 : 0;
                const thumbSrc = resolveFarmCardImage(farm.id, idx);
                const isVerified = farm.hasBoundary || farm.assessment.score !== null;
                const alerts = farm.assessment.activeAlertsCount;
                const cropLabel = farm.primaryCrop || 'Mixed Crop';
                const updatedIso = farm.assessment.assessedAt || farm.updatedAt;
                const isSelected = selectedFarmId === farm.id;

                return (
                  <tr
                    key={farm.id}
                    onClick={() => onOpenDetails(farm.id, 'overview')}
                    className={`h-[96px] transition-colors cursor-pointer group ${
                      isSelected
                        ? 'bg-white/35 dark:bg-[rgba(20,184,154,0.16)]'
                        : 'hover:bg-white/25 dark:hover:bg-[rgba(20,184,154,0.13)]'
                    }`}
                  >
                    {/* 1. Farm */}
                    <td className="py-3 pl-6 pr-3">
                      <div className="flex items-center gap-3.5 min-w-[230px]">
                        <img
                          src={thumbSrc}
                          alt={farm.name}
                          className="w-[104px] h-[68px] rounded-xl object-cover shrink-0 border border-white/70 dark:border-[#5EEAD4]/35 shadow-sm"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[15px] text-[#072622] dark:text-[#ECF8F5] truncate group-hover:text-[#0F766E] dark:group-hover:text-[#2DD4BF] transition-colors">
                              {farm.name}
                            </span>
                            {isVerified && (
                              <span
                                title="Verified farm parcel"
                                className="w-4 h-4 rounded-[5px] bg-[#0F766E] dark:bg-[#2DD4BF] text-white dark:text-[#031F1C] inline-flex items-center justify-center shrink-0"
                              >
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </span>
                            )}
                            {farm.isDraft && (
                              <span className="text-[11px] font-semibold text-[#0F766E] dark:text-teal-300">
                                · Draft
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-[#1B4D46] dark:text-[#B8DCD4] mt-1 truncate">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
                            <span className="truncate">{farm.locationLabel}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 2. Location */}
                    <td className="py-3 px-3 text-[13.5px] text-[#1B4D46] dark:text-[#C4E4DD] whitespace-nowrap">
                      {farm.locationLabel}
                    </td>

                    {/* 3. Area */}
                    <td className="py-3 px-3 text-[14px] font-medium text-[#072622] dark:text-[#ECF8F5] tabular-nums whitespace-nowrap">
                      {farm.mappedAreaHa > 0
                        ? formatArea(farm.mappedAreaHa, farm.areaUnit)
                        : farm.declaredAreaHa
                          ? formatArea(farm.declaredAreaHa, farm.areaUnit)
                          : 'Unmapped'}
                    </td>

                    {/* 4. Fields */}
                    <td className="py-3 px-3 text-center text-[15px] font-semibold text-[#072622] dark:text-[#ECF8F5] tabular-nums whitespace-nowrap">
                      {displayFields}
                    </td>

                    {/* 5. Active Crop */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="inline-flex items-center gap-2.5">
                        <CropIllustration cropName={cropLabel} className="w-7 h-7 shrink-0" />
                        <span className="text-[14px] font-medium text-[#072622] dark:text-[#ECF8F5]">
                          {cropLabel}
                        </span>
                      </div>
                    </td>

                    {/* 6. Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <GlassStatusBadge status={farm.assessment.status} />
                    </td>

                    {/* 7. Last Updated */}
                    <td className="py-3 px-3 text-[13.5px] text-[#1B4D46] dark:text-[#C4E4DD] tabular-nums whitespace-nowrap">
                      {formatRelativeDate(updatedIso)}
                    </td>

                    {/* 8. Alerts */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div
                        className={`inline-flex items-center gap-1.5 text-[15px] font-semibold tabular-nums ${
                          alerts > 0
                            ? 'text-amber-600 dark:text-[#FFD15C] drop-shadow-[0_0_8px_rgba(255,209,92,0.35)]'
                            : 'text-[#0F766E] dark:text-[#2DD4BF]'
                        }`}
                      >
                        <Bell className="w-4 h-4 fill-current" />
                        <span>{alerts}</span>
                      </div>
                    </td>

                    {/* 9. Actions */}
                    <td
                      className="py-3 pl-3 pr-6 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {renderThreeDotsButton(farm)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile & Tablet Stacked Home-Style Glass Cards */}
        <div className="lg:hidden divide-y divide-white/40 dark:divide-[#2DD4BF]/14">
          {farms.map((farm, idx) => {
            const fieldCount = fields.filter((fl) => fl.farmId === farm.id).length;
            const displayFields = fieldCount > 0 ? fieldCount : farm.hasBoundary ? 1 : 0;
            const thumbSrc = resolveFarmCardImage(farm.id, idx);
            const isVerified = farm.hasBoundary || farm.assessment.score !== null;
            const alerts = farm.assessment.activeAlertsCount;
            const cropLabel = farm.primaryCrop || 'Mixed Crop';
            const updatedIso = farm.assessment.assessedAt || farm.updatedAt;

            return (
              <div
                key={farm.id}
                onClick={() => onOpenDetails(farm.id, 'overview')}
                className="p-4 space-y-3 hover:bg-white/25 dark:hover:bg-[rgba(20,184,154,0.13)] transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={thumbSrc}
                      alt={farm.name}
                      className="w-20 h-14 rounded-xl object-cover shrink-0 border border-white/70 dark:border-[#5EEAD4]/35"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-[#072622] dark:text-[#ECF8F5] truncate">
                          {farm.name}
                        </span>
                        {isVerified && (
                          <span className="w-4 h-4 rounded-[4px] bg-[#0F766E] dark:bg-[#2DD4BF] text-white dark:text-[#031F1C] inline-flex items-center justify-center shrink-0">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-[#1B4D46] dark:text-[#B8DCD4] mt-0.5 truncate">
                        <MapPin className="w-3 h-3 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
                        <span className="truncate">{farm.locationLabel}</span>
                      </div>
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>{renderThreeDotsButton(farm)}</div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <GlassStatusBadge status={farm.assessment.status} />
                  <div className="flex items-center gap-3 text-[#1B4D46] dark:text-[#C4E4DD] tabular-nums">
                    <span>
                      {farm.mappedAreaHa > 0 ? formatArea(farm.mappedAreaHa, farm.areaUnit) : 'Unmapped'}
                    </span>
                    <span>· {displayFields} fields</span>
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        alerts > 0
                          ? 'text-amber-600 dark:text-[#FFD15C]'
                          : 'text-[#0F766E] dark:text-[#2DD4BF]'
                      }`}
                    >
                      <Bell className="w-3.5 h-3.5 fill-current" />
                      {alerts}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/35 dark:border-[#2DD4BF]/14">
                  <div className="inline-flex items-center gap-1.5 text-[#072622] dark:text-[#ECF8F5]">
                    <CropIllustration cropName={cropLabel} className="w-5 h-5" />
                    <span>{cropLabel}</span>
                  </div>
                  <span className="text-[#1B4D46] dark:text-[#B8DCD4] tabular-nums">
                    {formatRelativeDate(updatedIso)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {renderPopover()}
    </>
  );
};
