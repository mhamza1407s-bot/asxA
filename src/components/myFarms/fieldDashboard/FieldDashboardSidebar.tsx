import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  CloudSun,
  Droplets,
  Info,
  Settings,
  Sprout,
} from 'lucide-react';
import { MyFarmRecord, PortfolioFieldRecord } from '../../../types/myFarms';
import { resolveCropThumbnail } from '../../../lib/myFarmsEngine';

export type FarmWorkspaceSection = 'info' | 'advanced' | 'settings';
export type InfoSubCategory = 'overview' | 'weather' | 'water' | 'soil' | 'risks';

interface FieldDashboardSidebarProps {
  farm: MyFarmRecord;
  fields: PortfolioFieldRecord[];
  selectedFieldId: string | null;
  activeSection: FarmWorkspaceSection;
  activeInfoSubTab: InfoSubCategory;
  riskCount?: number;
  onChangeSection: (section: FarmWorkspaceSection) => void;
  onChangeInfoSubTab: (sub: InfoSubCategory) => void;
  onSelectField: (fieldId: string) => void;
}

const INFO_SUB_ITEMS: Array<{
  id: InfoSubCategory;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'weather', label: 'Weather & Climate', Icon: CloudSun },
  { id: 'water', label: 'Water & Irrigation', Icon: Droplets },
  { id: 'soil', label: 'Soil & Crop Info', Icon: Sprout },
  { id: 'risks', label: 'Risks & Alerts', Icon: AlertTriangle },
];

export const FieldDashboardSidebar: React.FC<FieldDashboardSidebarProps> = ({
  farm,
  fields,
  selectedFieldId,
  activeSection,
  activeInfoSubTab,
  riskCount = 0,
  onChangeSection,
  onChangeInfoSubTab,
  onSelectField,
}) => {
  const [infoExpanded, setInfoExpanded] = useState(true);

  useEffect(() => {
    if (activeSection === 'info') {
      setInfoExpanded(true);
    }
  }, [activeSection]);

  const displayFields =
    fields.length > 0
      ? fields
      : [
          {
            id: '__primary__',
            farmId: farm.id,
            name: 'Primary Block',
            cropName: farm.primaryCrop || 'Wheat',
            status: 'Active' as const,
            activeAlertsCount: farm.assessment.activeAlertsCount,
            versions: [
              {
                versionId: 'v1',
                netAreaHectares: farm.mappedAreaHa || farm.declaredAreaHa || 42,
                perimeterM: farm.perimeterM || 0,
                geometry: farm.geometry as never,
                createdAt: farm.createdAt,
                source: 'farm-fallback',
              },
            ],
          },
        ];

  return (
    <aside
      aria-label="Farm workspace navigation"
      className="fs-dash-panel !rounded-[22px] w-full lg:w-[224px] xl:w-[244px] lg:self-stretch shrink-0 p-3 flex flex-col justify-between gap-4"
    >
      {/* TOP: Farm Title & Primary Workspace Tabs (Information Dropdown, Advanced, Settings) */}
      <div className="space-y-3">
        <div className="px-1.5 pt-0.5 pb-2.5 border-b border-[#072622]/10 dark:border-white/12">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
            {farm.regionLabel || farm.country || 'Farm Workspace'}
          </div>
          <div className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5] truncate mt-0.5">
            {farm.name}
          </div>
        </div>

        <nav aria-label="Workspace sections" className="space-y-1.5">
          {/* Primary Tabs Row (Mobile 3-col, Desktop stacked with Information accordion) */}
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-1.5">
            {/* Information Accordion Header (clicking goes to Information main page; chevron toggles sub-categories) */}
            <button
              type="button"
              aria-expanded={infoExpanded}
              onClick={() => {
                if (activeSection !== 'info' || activeInfoSubTab !== 'overview') {
                  onChangeSection('info');
                  onChangeInfoSubTab('overview');
                  setInfoExpanded(true);
                } else {
                  setInfoExpanded((prev) => !prev);
                }
              }}
              className={`w-full flex items-center justify-center lg:justify-between gap-2 px-3 py-2.5 rounded-[14px] text-xs sm:text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                activeSection === 'info'
                  ? 'bg-gradient-to-r from-[#14B89A]/22 to-[#10B981]/18 dark:from-[#14B89A]/30 dark:to-[#0D9488]/22 border-[#0F766E]/45 dark:border-[#2DD4BF]/60 text-[#042622] dark:text-[#ECF8F5] shadow-[0_0_16px_rgba(20,184,154,0.16)]'
                  : 'bg-white/35 dark:bg-[#042420]/45 border-transparent text-[#1B4D46] dark:text-[#9FD3C8] hover:bg-white/60 dark:hover:bg-[#093A34]/70 hover:border-[#0F766E]/25'
              }`}
            >
              <span className="inline-flex items-center gap-2.5">
                <Info
                  className={`w-4 h-4 shrink-0 ${
                    activeSection === 'info'
                      ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                      : 'text-[#2B5E56] dark:text-[#7BB8AC]'
                  }`}
                />
                <span>Information</span>
              </span>
              <span
                role="button"
                tabIndex={-1}
                aria-label="Toggle Information sub-categories"
                onClick={(e) => {
                  e.stopPropagation();
                  setInfoExpanded((prev) => !prev);
                }}
                className="hidden lg:inline-flex p-0.5 rounded-md hover:bg-emerald-500/15"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
                    infoExpanded ? 'rotate-180' : ''
                  }`}
                />
              </span>
            </button>

            {/* Desktop Expandable Information Sub-Categories */}
            {infoExpanded && (
              <div className="hidden lg:flex flex-col gap-1 pl-2.5 ml-2.5 border-l border-[#0F766E]/25 dark:border-[#2DD4BF]/25 py-0.5">
                {INFO_SUB_ITEMS.map(({ id, label, Icon }) => {
                  const subActive = activeSection === 'info' && activeInfoSubTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        onChangeSection('info');
                        onChangeInfoSubTab(id);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-[11px] text-[12px] font-semibold transition-all cursor-pointer border ${
                        subActive
                          ? 'bg-[#14B89A]/18 dark:bg-[#0D4338]/90 border-[#0F766E]/40 dark:border-[#2DD4BF]/50 text-[#042622] dark:text-[#5EEAD4]'
                          : 'border-transparent text-[#1B4D46] dark:text-[#9BC7BE] hover:bg-white/50 dark:hover:bg-[#08342E]/70'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            subActive
                              ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                              : id === 'risks'
                                ? 'text-amber-600 dark:text-amber-300'
                                : 'text-[#2B5E56] dark:text-[#7BB8AC]'
                          }`}
                        />
                        <span className="truncate">{label}</span>
                      </span>
                      {id === 'risks' && riskCount > 0 && (
                        <span className="text-[10px] font-bold tabular-nums text-amber-700 dark:text-amber-300">
                          {riskCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Advanced & Settings Tabs */}
            {[
              { id: 'advanced' as const, label: 'Advanced', Icon: BarChart3 },
              { id: 'settings' as const, label: 'Settings', Icon: Settings },
            ].map(({ id, label, Icon }) => {
              const active = activeSection === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChangeSection(id)}
                  className={`w-full flex items-center justify-center lg:justify-start gap-2.5 px-3 py-2.5 rounded-[14px] text-xs sm:text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                    active
                      ? 'bg-gradient-to-r from-[#14B89A]/22 to-[#10B981]/18 dark:from-[#14B89A]/30 dark:to-[#0D9488]/22 border-[#0F766E]/45 dark:border-[#2DD4BF]/60 text-[#042622] dark:text-[#ECF8F5] shadow-[0_0_16px_rgba(20,184,154,0.16)]'
                      : 'bg-white/35 dark:bg-[#042420]/45 border-transparent text-[#1B4D46] dark:text-[#9FD3C8] hover:bg-white/60 dark:hover:bg-[#093A34]/70 hover:border-[#0F766E]/25'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active
                        ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                        : 'text-[#2B5E56] dark:text-[#7BB8AC]'
                    }`}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile / Tablet Responsive Sub-Category Strip */}
          {infoExpanded && (
            <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-1 fs-thin-scroll pt-1">
              {INFO_SUB_ITEMS.map(({ id, label, Icon }) => {
                const subActive = activeSection === 'info' && activeInfoSubTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onChangeSection('info');
                      onChangeInfoSubTab(id);
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-semibold whitespace-nowrap shrink-0 cursor-pointer border ${
                      subActive
                        ? 'bg-[#14B89A]/20 dark:bg-[#0D4338]/90 border-[#0F766E]/45 dark:border-[#2DD4BF]/55 text-[#042622] dark:text-[#5EEAD4]'
                        : 'bg-white/40 dark:bg-[#042420]/50 border-transparent text-[#1B4D46] dark:text-[#9BC7BE]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>
      </div>

      {/* BOTTOM: Fields Only */}
      <div className="pt-3 border-t border-[#072622]/10 dark:border-white/12 space-y-2.5">
        <div className="flex items-center justify-between gap-2 px-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#1B4D46] dark:text-[#96C7BE]">
            Fields
          </span>
          <span className="text-[11px] font-bold tabular-nums text-[#0F766E] dark:text-[#2DD4BF]">
            {displayFields.length}
          </span>
        </div>

        <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible lg:max-h-[280px] lg:overflow-y-auto pb-1 lg:pb-0 fs-thin-scroll">
          {displayFields.map((fl, idx) => {
            const fieldLabel = `Field ${String(idx + 1).padStart(2, '0')}`;
            const isSelected =
              selectedFieldId === fl.id || (selectedFieldId === null && idx === 0);
            const areaHa =
              fl.versions?.[0]?.netAreaHectares ??
              (farm.mappedAreaHa > 0 ? farm.mappedAreaHa : farm.declaredAreaHa ?? 0);
            const cropText =
              fl.cropName === 'Corn' ? 'Maize' : fl.cropName || farm.primaryCrop || 'Wheat';
            const hasAlert = fl.status === 'Needs Review' || fl.activeAlertsCount > 0;

            return (
              <button
                key={fl.id}
                type="button"
                onClick={() => {
                  if (fl.id !== '__primary__') {
                    onSelectField(fl.id);
                  }
                  onChangeSection('info');
                  onChangeInfoSubTab('overview');
                }}
                className={`group min-w-[168px] lg:min-w-0 w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[14px] text-left transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-[#14B89A]/16 dark:bg-[#093A34]/85 border-[#0F766E]/45 dark:border-[#2DD4BF]/55 shadow-[0_0_16px_rgba(20,184,154,0.14)]'
                    : 'bg-white/35 dark:bg-[#042420]/45 border-transparent hover:bg-white/60 dark:hover:bg-[#08342E]/70 hover:border-[#0F766E]/25'
                }`}
              >
                <div className="relative w-8 h-8 rounded-[10px] overflow-hidden shrink-0 border border-[#072622]/12 dark:border-white/20">
                  <img
                    src={resolveCropThumbnail(cropText)}
                    alt={cropText}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className={`text-[12.5px] font-bold truncate ${
                        isSelected
                          ? 'text-[#042622] dark:text-[#2DD4BF]'
                          : 'text-[#072622] dark:text-[#E5F6F2]'
                      }`}
                    >
                      {fieldLabel}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        hasAlert
                          ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]'
                          : 'bg-[#14B8A6] shadow-[0_0_8px_rgba(20,184,166,0.7)]'
                      }`}
                      title={hasAlert ? 'Needs review' : 'Healthy'}
                    />
                  </div>

                  <div className="text-[11px] text-[#2B5E56] dark:text-[#9BC7BE] truncate">
                    {fl.name}
                  </div>
                  <div className="text-[10.5px] font-medium text-[#1B4D46] dark:text-[#7FB0A6] tabular-nums truncate">
                    {cropText}
                    {areaHa > 0 ? ` · ${areaHa.toFixed(1)} ha` : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
};

