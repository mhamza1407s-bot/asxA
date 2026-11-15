import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  Download,
  FileText,
  GitCompare,
  Info,
  Leaf,
  MapPin,
  RefreshCw,
  Sprout,
  X,
} from 'lucide-react';
import { PortfolioFieldRecord } from '../../../../types/myFarms';

export type ReportingPeriodKey = '7d' | '14d' | '30d';

export const REPORTING_PERIOD_OPTIONS: Array<{ key: ReportingPeriodKey; label: string; days: number }> = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '14d', label: 'Last 14 days', days: 14 },
  { key: '30d', label: 'Last 30 days', days: 30 },
];

export function formatSubDate(iso?: string | null): string {
  if (!iso) return 'Pending sync';
  const trimmed = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const dt = new Date(`${trimmed}T12:00:00Z`);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatSubShortDate(iso?: string | null): string {
  if (!iso) return '—';
  const trimmed = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const dt = new Date(`${trimmed}T12:00:00Z`);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatSubDateTime(iso?: string | null): string {
  if (!iso) return 'Awaiting live sync';
  const trimmed = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return formatSubDate(trimmed);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSubDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return 'Window syncing';
  if (start && end) {
    if (start === end) return formatSubDate(start);
    return `${formatSubShortDate(start)} – ${formatSubDate(end)}`;
  }
  return formatSubDate(start || end);
}

export const IntelligenceCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <section
    className={`rounded-[16px] border border-emerald-800/20 dark:border-[#41915F]/32 bg-white/88 dark:bg-gradient-to-br dark:from-[#083722]/88 dark:to-[#011F13]/92 backdrop-blur-[13px] shadow-[0_6px_18px_rgba(4,40,24,0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_22px_rgba(0,0,0,0.22)] overflow-hidden transition-colors duration-200 ${className}`}
  >
    {children}
  </section>
);

export const IntelligenceInset: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`rounded-[11px] border border-emerald-900/12 dark:border-[#64AE7E]/22 bg-emerald-50/75 dark:bg-[#00170E]/72 ${className}`}
  >
    {children}
  </div>
);

export const SectionHeading: React.FC<{
  number: number;
  title: string;
  saturatedBadge?: boolean;
  infoText?: string;
  dateLabel?: string;
  onInspect?: () => void;
  rightSlot?: React.ReactNode;
}> = ({ number, title, saturatedBadge = false, infoText, dateLabel, onInspect, rightSlot }) => {
  const [openTip, setOpenTip] = useState(false);

  return (
    <div className="relative flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`w-[24px] h-[24px] rounded-full inline-flex items-center justify-center shrink-0 text-[12.5px] font-bold tabular-nums ${
            saturatedBadge
              ? 'bg-[#13D987] text-[#003C2A]'
              : 'bg-[#49DAB0] text-[#003C2A]'
          }`}
        >
          {number}
        </span>
        <h2 className="text-[16px] sm:text-[17px] font-semibold tracking-[-0.01em] text-[#05291B] dark:text-[#F1F8F3] truncate">
          {title}
        </h2>
        {(infoText || onInspect) && (
          <button
            type="button"
            onClick={() => {
              if (onInspect) onInspect();
              else setOpenTip((v) => !v);
            }}
            aria-label={`About ${title}`}
            className="w-4.5 h-4.5 rounded-full inline-flex items-center justify-center border border-emerald-800/30 dark:border-[#849B8C]/45 text-[#2B5E56] dark:text-[#849B8C] hover:text-[#0F766E] dark:hover:text-[#43E6A1] hover:border-[#12D987]/60 transition-colors cursor-pointer shrink-0"
          >
            <Info className="w-3 h-3" />
          </button>
        )}
      </div>
      {(dateLabel || rightSlot) && (
        <div className="flex items-center gap-2.5 shrink-0">
          {dateLabel && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-800/18 dark:border-[#4A9A6C]/32 bg-emerald-50/70 dark:bg-[#042416]/75 text-[11px] font-medium text-[#2B5E56] dark:text-[#B8D0C2] tabular-nums">
              <Calendar className="w-3 h-3 text-[#0F766E] dark:text-[#43E6A1] shrink-0" />
              <span>{dateLabel}</span>
            </span>
          )}
          {rightSlot}
        </div>
      )}

      {openTip && infoText && !onInspect && (
        <div className="absolute left-8 top-8 z-30 max-w-md rounded-[10px] border border-emerald-700/30 dark:border-[#49DAB0]/40 bg-white dark:bg-[#032317] p-3 text-[12px] leading-relaxed text-[#1B4D46] dark:text-[#C4D4CA] shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <span>{infoText}</span>
            <button
              type="button"
              onClick={() => setOpenTip(false)}
              className="text-[#849B8C] hover:text-white cursor-pointer"
              aria-label="Close note"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface IntelligenceHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  fieldDisplayName: string;
  cropName: string;
  stageLabel: string;
  dateWindowLabel?: string;
  fields?: PortfolioFieldRecord[];
  selectedFieldId?: string | null;
  onSelectField?: (fieldId: string) => void;
  period: ReportingPeriodKey;
  onChangePeriod: (p: ReportingPeriodKey) => void;
  updatedLabel: string;
  onRefresh?: () => void;
  refreshLoading?: boolean;
  isOnline?: boolean;
  extraAction?: React.ReactNode;
}

export const IntelligenceHeader: React.FC<IntelligenceHeaderProps> = ({
  icon,
  title,
  subtitle,
  fieldDisplayName,
  cropName,
  stageLabel,
  dateWindowLabel,
  fields = [],
  selectedFieldId,
  onSelectField,
  period,
  onChangePeriod,
  updatedLabel,
  onRefresh,
  refreshLoading = false,
  isOnline = true,
  extraAction,
}) => {
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);
  const periodRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) {
        setPeriodMenuOpen(false);
      }
      if (fieldRef.current && !fieldRef.current.contains(e.target as Node)) {
        setFieldMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const currentPeriodLabel =
    REPORTING_PERIOD_OPTIONS.find((o) => o.key === period)?.label || 'Last 14 days';

  return (
    <header className="space-y-3 pt-0.5 pb-0.5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        {/* Left: Gradient Icon + Title + Subtitle */}
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-10 h-11 shrink-0 flex items-center justify-center mt-0.5">{icon}</div>
          <div className="min-w-0">
            <h1 className="text-[26px] sm:text-[30px] font-bold tracking-[-0.02em] leading-tight text-[#05291B] dark:text-[#F1F8F3]">
              {title}
            </h1>
            <p className="text-[13px] leading-snug text-[#2B5E56] dark:text-[#C0D1C6] mt-1 max-w-3xl">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Right: Period Dropdown + Last Updated + Circular Refresh Button */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {extraAction}
            <div className="relative" ref={periodRef}>
              <button
                type="button"
                onClick={() => setPeriodMenuOpen((v) => !v)}
                className="h-[36px] px-4 rounded-full inline-flex items-center gap-2 border border-emerald-800/25 dark:border-[#5AA975]/40 bg-white/85 dark:bg-[#042416]/90 text-[12.5px] font-medium text-[#05291B] dark:text-[#F1F8F3] shadow-[0_0_12px_rgba(19,217,135,0.12)] hover:border-[#12D987]/60 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>{currentPeriodLabel}</span>
                <ChevronDown className="w-4 h-4 text-[#2B5E56] dark:text-[#C0D1C6]" />
              </button>
              {periodMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-44 rounded-[12px] border border-emerald-800/25 dark:border-[#5AA975]/40 bg-white dark:bg-[#032317] shadow-xl py-1 z-40">
                  {REPORTING_PERIOD_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        onChangePeriod(opt.key);
                        setPeriodMenuOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-[12.5px] flex items-center justify-between cursor-pointer ${
                        opt.key === period
                          ? 'bg-emerald-500/15 text-[#0F766E] dark:text-[#35EC99] font-semibold'
                          : 'text-[#1B4D46] dark:text-[#C0D1C6] hover:bg-emerald-500/10'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {opt.key === period && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-right">
            <div className="text-[11px] leading-[1.35] text-[#2B5E56] dark:text-[#849B8C] tabular-nums">
              <span>Last synced: </span>
              <span className="text-[#1B4D46] dark:text-[#C4D4CA] font-semibold">{updatedLabel}</span>
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={!isOnline || refreshLoading}
                title={isOnline ? 'Refresh meteorological & field data' : 'Offline'}
                aria-label="Refresh dashboard data"
                className="w-7.5 h-7.5 rounded-full inline-flex items-center justify-center border border-emerald-700/25 dark:border-[#13D987]/45 bg-emerald-500/10 dark:bg-[#052B1C] text-[#0F766E] dark:text-[#13D987] hover:bg-emerald-500/20 disabled:opacity-45 cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Context Badges + Active Data Period */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative" ref={fieldRef}>
          <button
            type="button"
            onClick={() => {
              if (fields.length > 1 && onSelectField) setFieldMenuOpen((v) => !v);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-emerald-800/20 dark:border-[#4A9A6C]/35 bg-white/75 dark:bg-[#042416]/85 text-[12px] font-medium text-[#05291B] dark:text-[#E7F4EC] ${
              fields.length > 1 ? 'cursor-pointer hover:border-[#12D987]/55' : 'cursor-default'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#43E6A1] shrink-0" />
            <span className="truncate max-w-[240px]">{fieldDisplayName}</span>
            {fields.length > 1 && <ChevronDown className="w-3.5 h-3.5 opacity-70" />}
          </button>

          {fieldMenuOpen && fields.length > 1 && onSelectField && (
            <div className="absolute left-0 mt-1.5 w-60 rounded-[12px] border border-emerald-800/25 dark:border-[#5AA975]/40 bg-white dark:bg-[#032317] shadow-xl py-1 z-40">
              {fields.map((fl, idx) => {
                const active = fl.id === selectedFieldId;
                return (
                  <button
                    key={fl.id}
                    type="button"
                    onClick={() => {
                      onSelectField(fl.id);
                      setFieldMenuOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-[12px] flex items-center justify-between gap-2 cursor-pointer ${
                      active
                        ? 'bg-emerald-500/15 text-[#0F766E] dark:text-[#35EC99] font-semibold'
                        : 'text-[#1B4D46] dark:text-[#C0D1C6] hover:bg-emerald-500/10'
                    }`}
                  >
                    <span className="truncate">
                      Field {String(idx + 1).padStart(2, '0')} · {fl.name}
                    </span>
                    <span className="text-[11px] opacity-75 shrink-0">{fl.cropName || 'Crop'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-emerald-800/20 dark:border-[#4A9A6C]/35 bg-white/75 dark:bg-[#042416]/85 text-[12px] font-medium text-[#05291B] dark:text-[#E7F4EC]">
          <Sprout className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#43E6A1] shrink-0" />
          <span>{cropName}</span>
        </span>

        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-emerald-800/20 dark:border-[#4A9A6C]/35 bg-white/75 dark:bg-[#042416]/85 text-[12px] font-medium text-[#05291B] dark:text-[#E7F4EC]">
          <Leaf className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#43E6A1] shrink-0" />
          <span>{stageLabel}</span>
        </span>

        {dateWindowLabel && (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-emerald-800/20 dark:border-[#4A9A6C]/35 bg-white/75 dark:bg-[#042416]/85 text-[12px] font-medium text-[#05291B] dark:text-[#E7F4EC] tabular-nums">
            <Calendar className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#43E6A1] shrink-0" />
            <span>{dateWindowLabel}</span>
          </span>
        )}
      </div>
    </header>
  );
};

export interface HeroMetricItem {
  id: string;
  icon: React.ReactNode;
  value: string;
  unitOrPeriod: string;
  label: string;
  subLabel?: string;
  dateLabel?: string;
  onClick?: () => void;
}

interface HeroStatusCardProps {
  imageSrc: string;
  imageAlt: string;
  imageTitle: string;
  imageSubtitle: string;
  heading: string;
  description: string;
  statusTone: 'good' | 'warning' | 'alert';
  statusText: string;
  metrics: [HeroMetricItem, HeroMetricItem, HeroMetricItem, HeroMetricItem];
}

export const HeroStatusCard: React.FC<HeroStatusCardProps> = ({
  imageSrc,
  imageAlt,
  imageTitle,
  imageSubtitle,
  heading,
  description,
  statusTone,
  statusText,
  metrics,
}) => {
  const pillStyle =
    statusTone === 'good'
      ? 'bg-emerald-500/12 dark:bg-[#052C1B]/95 border-emerald-600/30 dark:border-[#22C55E]/35 text-emerald-800 dark:text-[#35EC99]'
      : statusTone === 'warning'
        ? 'bg-amber-500/12 dark:bg-[#2C2005]/90 border-amber-500/35 text-amber-800 dark:text-[#F8BC37]'
        : 'bg-rose-500/12 dark:bg-[#2D080D]/90 border-rose-500/35 text-rose-800 dark:text-[#FF7A7A]';

  const iconCircleStyle =
    statusTone === 'good'
      ? 'bg-[#12D987] text-[#00301E]'
      : statusTone === 'warning'
        ? 'bg-[#F8BC37] text-[#291A02]'
        : 'bg-[#FF4949] text-white';

  return (
    <IntelligenceCard className="grid grid-cols-1 md:grid-cols-[240px_1fr] xl:grid-cols-[255px_minmax(0,380px)_1fr] min-h-[195px]">
      {/* Left: Crop / Field Photograph with Scrim */}
      <div className="relative h-[170px] md:h-auto min-h-[195px] overflow-hidden bg-[#032014]">
        <img
          src={imageSrc}
          alt={imageAlt}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/28 to-transparent"
        />
        <div className="absolute left-4 bottom-3.5 right-3.5 text-white">
          <div className="text-[21px] font-bold leading-tight tracking-tight">{imageTitle}</div>
          <div className="text-[12.5px] text-white/85 truncate">{imageSubtitle}</div>
        </div>
      </div>

      {/* Middle: Status Explanation */}
      <div className="p-4 sm:px-5 sm:py-4 flex flex-col justify-between gap-3 xl:border-r border-emerald-900/12 dark:border-[#82B791]/22">
        <div className="space-y-2">
          <h2 className="text-[17.5px] font-semibold tracking-[-0.01em] text-[#05291B] dark:text-[#F1F8F3]">
            {heading}
          </h2>
          <p className="text-[13px] leading-[1.48] text-[#1B4D46] dark:text-[#C4D4CA] line-clamp-4">
            {description}
          </p>
        </div>

        <div>
          <span
            className={`inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1 rounded-full border text-[12px] font-semibold ${pillStyle}`}
          >
            <span
              className={`w-[20px] h-[20px] rounded-full inline-flex items-center justify-center shrink-0 ${iconCircleStyle}`}
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </span>
            <span className="truncate">{statusText}</span>
          </span>
        </div>
      </div>

      {/* Right: 4 Equal Vertical-Divided Metric Columns */}
      <div className="md:col-span-2 xl:col-span-1 grid grid-cols-2 sm:grid-cols-4 border-t xl:border-t-0 border-emerald-900/12 dark:border-[#82B791]/20">
        {metrics.map((m, idx) => (
          <div
            key={m.id}
            onClick={m.onClick}
            className={`px-3.5 py-4 flex flex-col items-center justify-center text-center gap-1.5 ${
              idx > 0 ? 'sm:border-l border-emerald-900/10 dark:border-[#82B791]/18' : ''
            } ${idx >= 2 ? 'border-t sm:border-t-0 border-emerald-900/10 dark:border-[#82B791]/18' : ''} ${
              m.onClick ? 'cursor-pointer hover:bg-emerald-500/8 transition-colors' : ''
            }`}
          >
            <div className="h-6.5 flex items-center justify-center">{m.icon}</div>
            <div className="text-[22px] sm:text-[24px] font-bold leading-none tracking-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
              {m.value}
            </div>
            <div className="text-[11.5px] leading-[1.25] font-medium text-[#2B5E56] dark:text-[#C0D1C6] tabular-nums">
              {m.unitOrPeriod}
            </div>
            <div className="text-[11px] leading-[1.3] text-[#3C6D59] dark:text-[#849B8C]">
              <div>{m.label}</div>
              {m.subLabel && <div>{m.subLabel}</div>}
              {m.dateLabel && (
                <div className="mt-0.5 text-[10.5px] font-medium text-[#2B5E56] dark:text-[#9FC3AD] tabular-nums">
                  {m.dateLabel}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </IntelligenceCard>
  );
};

export interface DataQualityRow {
  dataType: string;
  source: string;
  quality: 'High' | 'Medium' | 'Low';
  basis: string;
  updatedDate?: string;
}

export const DataQualityCard: React.FC<{
  rows: DataQualityRow[];
  dateLabel?: string;
  onViewDetails: () => void;
}> = ({ rows, dateLabel, onViewDetails }) => (
  <IntelligenceCard className="p-4 lg:p-4.5 flex flex-col justify-between gap-3 h-full">
    <SectionHeading
      number={8}
      title="Data Sources, Quality & Limitations"
      dateLabel={dateLabel}
      saturatedBadge
    />

    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-[12px]">
        <thead className="border-b border-emerald-900/12 dark:border-[#64AE7E]/22 text-[11px] text-[#3C6D59] dark:text-[#849B8C]">
          <tr>
            <th className="py-1.5 pr-2 font-semibold">Metric</th>
            <th className="py-1.5 pr-2 font-semibold">Source</th>
            <th className="py-1.5 pr-2 font-semibold">Date</th>
            <th className="py-1.5 pr-2 font-semibold">Quality</th>
            <th className="py-1.5 text-right font-semibold">Basis</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-emerald-900/10 dark:divide-[#64AE7E]/16">
          {rows.map((r) => {
            const qualCls =
              r.quality === 'High'
                ? 'text-emerald-700 dark:text-[#28E58B]'
                : r.quality === 'Medium'
                  ? 'text-amber-700 dark:text-[#F8BC37]'
                  : 'text-rose-700 dark:text-[#FF4949]';
            return (
              <tr key={r.dataType} className="hover:bg-emerald-500/5">
                <td className="py-2 pr-2 font-medium text-[#05291B] dark:text-[#F1F8F3] whitespace-nowrap">
                  {r.dataType}
                </td>
                <td className="py-2 pr-2 text-[#2B5E56] dark:text-[#C4D4CA] truncate max-w-[130px]">
                  {r.source}
                </td>
                <td className="py-2 pr-2 text-[#3C6D59] dark:text-[#9BB5A6] tabular-nums whitespace-nowrap">
                  {r.updatedDate || 'Live'}
                </td>
                <td className={`py-2 pr-2 font-semibold whitespace-nowrap ${qualCls}`}>
                  {r.quality}
                </td>
                <td className="py-2 text-right font-medium text-[#1B4D46] dark:text-[#C4D4CA] whitespace-nowrap">
                  {r.basis}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="flex justify-end pt-0.5">
      <button
        type="button"
        onClick={onViewDetails}
        className="text-[12px] font-semibold text-[#0F766E] dark:text-[#35EC99] hover:underline cursor-pointer"
      >
        View Details →
      </button>
    </div>
  </IntelligenceCard>
);

export const QuickActionsCard: React.FC<{
  onViewFullReport: () => void;
  onDownloadPdf: () => void;
  thirdActionLabel?: string;
  onThirdAction: () => void;
}> = ({
  onViewFullReport,
  onDownloadPdf,
  thirdActionLabel = 'Compare Periods',
  onThirdAction,
}) => (
  <IntelligenceCard className="p-4 lg:p-4.5 flex flex-col justify-between gap-3 h-full">
    <div className="flex items-center gap-2">
      <span className="w-[24px] h-[24px] rounded-[7px] inline-flex items-center justify-center bg-emerald-500/15 dark:bg-[#49DAB0]/20 text-[#0F766E] dark:text-[#49DAB0] shrink-0">
        <FileText className="w-4 h-4" />
      </span>
      <h2 className="text-[15.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3]">
        Quick Actions
      </h2>
    </div>

    <div className="flex flex-col gap-2.5 flex-1 justify-center">
      <button
        type="button"
        onClick={onViewFullReport}
        className="h-[40px] px-3.5 rounded-[10px] border border-emerald-800/20 dark:border-[#64AE7E]/28 bg-emerald-50/70 dark:bg-[#05291A]/85 hover:border-[#12D987]/55 hover:bg-emerald-500/12 text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] inline-flex items-center gap-2.5 transition-colors cursor-pointer whitespace-nowrap"
      >
        <FileText className="w-4 h-4 text-[#0F766E] dark:text-[#C4D4CA] shrink-0" />
        <span className="truncate">View Full Report</span>
      </button>

      <button
        type="button"
        onClick={onDownloadPdf}
        className="h-[40px] px-3.5 rounded-[10px] border border-emerald-800/20 dark:border-[#64AE7E]/28 bg-emerald-50/70 dark:bg-[#05291A]/85 hover:border-[#12D987]/55 hover:bg-emerald-500/12 text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] inline-flex items-center gap-2.5 transition-colors cursor-pointer whitespace-nowrap"
      >
        <Download className="w-4 h-4 text-[#0F766E] dark:text-[#C4D4CA] shrink-0" />
        <span className="truncate">Download PDF</span>
      </button>

      <button
        type="button"
        onClick={onThirdAction}
        className="h-[40px] px-3.5 rounded-[10px] border border-emerald-800/20 dark:border-[#64AE7E]/28 bg-emerald-50/70 dark:bg-[#05291A]/85 hover:border-[#12D987]/55 hover:bg-emerald-500/12 text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] inline-flex items-center gap-2.5 transition-colors cursor-pointer whitespace-nowrap"
      >
        <GitCompare className="w-4 h-4 text-[#0F766E] dark:text-[#C4D4CA] shrink-0" />
        <span className="truncate">{thirdActionLabel}</span>
      </button>
    </div>
  </IntelligenceCard>
);

export const FullReportModal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  paragraphs: string[];
  stats: Array<{ label: string; value: string }>;
  onPrint: () => void;
}> = ({ open, onClose, title, subtitle, paragraphs, stats, onPrint }) => {
  if (!open) return null;
  return (
    <div
      className="fs-modal-backdrop z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fs-modal-shell w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        <div className="fs-modal-header px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#0F766E] dark:text-[#24E982]">
              Field Shift Agronomic Report
            </div>
            <h3 className="text-xl font-bold text-[#072622] dark:text-white mt-0.5">{title}</h3>
            <p className="text-[13px] text-[#285E55] dark:text-[#96C7BE] mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report"
            className="w-9 h-9 rounded-full bg-black/5 dark:bg-white/[0.07] hover:bg-black/10 dark:hover:bg-white/[0.14] border border-[#0F766E]/15 dark:border-[#2DD4BF]/25 grid place-items-center text-[#1B4D46] dark:text-[#C5E4DD] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 flex-1 overflow-y-auto fs-thin-scroll">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="fs-modal-subpanel p-3.5">
                <div className="text-xs font-medium text-[#285E55] dark:text-[#96C7BE]">
                  {s.label}
                </div>
                <div className="text-base font-bold text-[#072622] dark:text-white tabular-nums mt-1">
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <div className="fs-modal-subpanel p-5 space-y-3 text-[13.5px] leading-relaxed text-[#14433C] dark:text-[#D5EEE9]">
            {paragraphs.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>
        </div>

        <div className="fs-modal-footer px-6 py-4 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-full bg-white/70 dark:bg-white/[0.06] hover:bg-white dark:hover:bg-white/[0.12] border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[13px] font-semibold text-[#072622] dark:text-[#ECF8F5] cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-gradient-to-r from-[#5EEAD4] via-[#2DD4BF] to-[#24E982] text-[#031F1C] text-[13px] font-bold hover:brightness-105 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Save / Print PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
