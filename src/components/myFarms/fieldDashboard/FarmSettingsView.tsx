import React, { useEffect, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  Edit3,
  Map as MapIcon,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { AreaUnit } from '../../../types/farm';
import { MyFarmRecord } from '../../../types/myFarms';

interface FarmSettingsViewProps {
  farm: MyFarmRecord;
  onOpenRename: (farm: MyFarmRecord) => void;
  onRunDeepAnalysis: (farm: MyFarmRecord) => void;
  onOpenDelete: (farm: MyFarmRecord) => void;
  onPatchFarm: (
    farm: MyFarmRecord,
    patch: Record<string, unknown>,
    label: string
  ) => Promise<void>;
  onOpenDuplicate: (farm: MyFarmRecord) => void;
  onOpenExport: (farm: MyFarmRecord) => void;
  onArchiveToggle: (farm: MyFarmRecord) => void;
  onOpenInMaps: (farm: MyFarmRecord) => void;
}

export const FarmSettingsView: React.FC<FarmSettingsViewProps> = ({
  farm,
  onOpenRename,
  onRunDeepAnalysis,
  onOpenDelete,
  onPatchFarm,
  onOpenDuplicate,
  onOpenExport,
  onArchiveToggle,
  onOpenInMaps,
}) => {
  const [regionLabel, setRegionLabel] = useState(farm.regionLabel);
  const [timezone, setTimezone] = useState(farm.timezone);
  const [declaredArea, setDeclaredArea] = useState(
    farm.declaredAreaHa !== null ? String(farm.declaredAreaHa) : ''
  );
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(farm.areaUnit);
  const [notes, setNotes] = useState(farm.notes);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRegionLabel(farm.regionLabel);
    setTimezone(farm.timezone);
    setDeclaredArea(farm.declaredAreaHa !== null ? String(farm.declaredAreaHa) : '');
    setAreaUnit(farm.areaUnit);
    setNotes(farm.notes);
  }, [farm.id, farm.updatedAt, farm.regionLabel, farm.timezone, farm.declaredAreaHa, farm.areaUnit, farm.notes]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onPatchFarm(
        farm,
        {
          regionLabel: regionLabel.trim(),
          timezone: timezone.trim(),
          declaredAreaHa: declaredArea ? Number(declaredArea) : null,
          areaUnit,
          notes: notes.trim(),
        },
        `Updated Settings for ${farm.name}`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 xl:space-y-5">
      {/* Primary Farm Actions: Rename, Re-analyse (Rotation Questionnaire), Delete */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Rename Farm */}
        <section className="fs-dash-panel !rounded-[26px] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-[#14B89A]/15 dark:bg-[#2DD4BF]/15 border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 inline-flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-[#0F766E] dark:text-[#2DD4BF]" />
            </div>
            <h3 className="text-base font-bold text-[#072622] dark:text-[#ECF8F5]">
              Rename Farm
            </h3>
            <p className="text-xs text-[#1B4D46] dark:text-[#96C7BE] leading-relaxed">
              Current name:{' '}
              <span className="font-semibold text-[#072622] dark:text-[#ECF8F5]">{farm.name}</span>.
              Updates automatically across My Farms, Maps, Header, and saved reports.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenRename(farm)}
            className="w-full py-2.5 px-4 rounded-xl border border-[#0F766E]/40 dark:border-[#2DD4BF]/45 bg-white/60 dark:bg-[#06322D]/70 hover:bg-white/85 dark:hover:bg-[#09433C]/85 text-xs font-bold text-[#072622] dark:text-[#DFF4EF] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Rename Farm
          </button>
        </section>

        {/* 2. Re-analyse Farm (opens Rotation questionnaire on Analysis page) */}
        <section className="fs-dash-panel !rounded-[26px] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-600/25 dark:border-teal-400/30 inline-flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-teal-700 dark:text-[#2DD4BF]" />
            </div>
            <h3 className="text-base font-bold text-[#072622] dark:text-[#ECF8F5]">
              Re-analyse Farm
            </h3>
            <p className="text-xs text-[#1B4D46] dark:text-[#96C7BE] leading-relaxed">
              Return to the Analysis page to answer the crop history &amp; rotation questionnaire
              and recompute suitability with live NASA POWER &amp; EONET checks.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onRunDeepAnalysis(farm)}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#2DD4BF] to-[#0D9488] hover:brightness-105 text-[#031F1C] text-xs font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Re-analyse Rotation &amp; Farm
          </button>
        </section>

        {/* 3. Delete Farm */}
        <section className="fs-dash-panel !rounded-[26px] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 inline-flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <h3 className="text-base font-bold text-[#072622] dark:text-[#ECF8F5]">
              Delete Farm
            </h3>
            <p className="text-xs text-[#1B4D46] dark:text-[#96C7BE] leading-relaxed">
              Permanently remove <span className="font-semibold">{farm.name}</span>, its mapped
              boundaries, and logs. Requires double confirmation before deletion.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenDelete(farm)}
            className="w-full py-2.5 px-4 rounded-xl border border-rose-500/45 bg-rose-500/12 hover:bg-rose-500/22 text-xs font-bold text-rose-700 dark:text-rose-300 inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Farm
          </button>
        </section>
      </div>

      {/* Farm Configuration & Data Tools */}
      <form onSubmit={handleSaveConfig} className="fs-dash-panel !rounded-[28px] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#072622]/10 dark:border-white/10">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
              Workspace Preferences
            </div>
            <h3 className="text-lg font-bold text-[#072622] dark:text-[#ECF8F5] mt-0.5">
              Farm Configuration &amp; Units
            </h3>
          </div>

          <button
            type="button"
            onClick={() => onOpenInMaps(farm)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#072622]/15 dark:border-white/15 bg-white/45 dark:bg-[#052D28]/60 text-xs font-semibold text-[#072622] dark:text-[#DFF4EF] hover:bg-white/75 dark:hover:bg-[#093D37]/80 transition-colors cursor-pointer"
          >
            <MapIcon className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#2DD4BF]" />
            Open Boundaries in Maps
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
          <div>
            <label className="block font-semibold text-[#1B4D46] dark:text-[#96C7BE] mb-1.5">
              Region label
            </label>
            <input
              type="text"
              value={regionLabel}
              onChange={(e) => setRegionLabel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#072622]/15 dark:border-white/15 bg-white/60 dark:bg-[#042420]/75 text-[#072622] dark:text-[#ECF8F5]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#1B4D46] dark:text-[#96C7BE] mb-1.5">
              Timezone
            </label>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#072622]/15 dark:border-white/15 bg-white/60 dark:bg-[#042420]/75 text-[#072622] dark:text-[#ECF8F5]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#1B4D46] dark:text-[#96C7BE] mb-1.5">
              Declared whole-farm area (ha)
            </label>
            <input
              type="number"
              step="0.1"
              value={declaredArea}
              onChange={(e) => setDeclaredArea(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#072622]/15 dark:border-white/15 bg-white/60 dark:bg-[#042420]/75 text-[#072622] dark:text-[#ECF8F5] tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#1B4D46] dark:text-[#96C7BE] mb-1.5">
              Area display unit
            </label>
            <select
              value={areaUnit}
              onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}
              className="w-full px-3 py-2 rounded-xl border border-[#072622]/15 dark:border-white/15 bg-white/60 dark:bg-[#042420]/75 text-[#072622] dark:text-[#ECF8F5]"
            >
              <option value="hectares">Hectares (ha)</option>
              <option value="acres">Acres (ac)</option>
            </select>
          </div>
        </div>

        <div className="text-xs">
          <label className="block font-semibold text-[#1B4D46] dark:text-[#96C7BE] mb-1.5">
            Farm operational notes
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Record irrigation pump constraints, soil sampling notes, or seasonal reminders…"
            className="w-full p-3 rounded-xl border border-[#072622]/15 dark:border-white/15 bg-white/60 dark:bg-[#042420]/75 text-[#072622] dark:text-[#ECF8F5]"
          />
        </div>

        <div className="pt-2 border-t border-[#072622]/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenDuplicate(farm)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#072622]/15 dark:border-white/15 bg-white/45 dark:bg-[#052D28]/60 text-xs font-semibold text-[#072622] dark:text-[#DFF4EF] hover:bg-white/75 dark:hover:bg-[#093D37]/80 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate Farm
            </button>
            <button
              type="button"
              onClick={() => onOpenExport(farm)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#072622]/15 dark:border-white/15 bg-white/45 dark:bg-[#052D28]/60 text-xs font-semibold text-[#072622] dark:text-[#DFF4EF] hover:bg-white/75 dark:hover:bg-[#093D37]/80 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON / GeoJSON
            </button>
            <button
              type="button"
              onClick={() => onArchiveToggle(farm)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#072622]/15 dark:border-white/15 bg-white/45 dark:bg-[#052D28]/60 text-xs font-semibold text-[#072622] dark:text-[#DFF4EF] hover:bg-white/75 dark:hover:bg-[#093D37]/80 cursor-pointer"
            >
              {farm.archivedAt ? (
                <ArchiveRestore className="w-3.5 h-3.5" />
              ) : (
                <Archive className="w-3.5 h-3.5" />
              )}
              {farm.archivedAt ? 'Unarchive Farm' : 'Archive Farm'}
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#2DD4BF] to-[#0D9488] text-[#031F1C] text-xs font-bold hover:brightness-105 disabled:opacity-50 transition-all cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
};
