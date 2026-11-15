import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy, Download, Edit3, Trash2, X } from 'lucide-react';
import { MyFarmRecord } from '../../types/myFarms';

interface RenameFarmModalProps {
  farm: MyFarmRecord | null;
  existingNames: string[];
  onClose: () => void;
  onConfirm: (farm: MyFarmRecord, newName: string) => Promise<void>;
}

export const RenameFarmModal: React.FC<RenameFarmModalProps> = ({
  farm,
  existingNames,
  onClose,
  onConfirm,
}) => {
  const [name, setName] = useState(farm?.name || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(farm?.name || '');
    setError('');
  }, [farm]);

  if (!farm) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Farm name cannot be blank.');
      return;
    }
    if (
      existingNames.some(
        (n) => n.trim().toLowerCase() === trimmed.toLowerCase() && trimmed.toLowerCase() !== farm.name.trim().toLowerCase()
      )
    ) {
      setError(`Another farm named "${trimmed}" already exists.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm(farm, trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rename farm.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fs-modal-backdrop" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="fs-modal-shell w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-base font-bold text-[#072622] dark:text-white">
            <Edit3 className="w-4 h-4 text-[#0F766E] dark:text-[#24E982]" />
            <span>Rename Farm</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/[0.07] hover:bg-black/10 dark:hover:bg-white/[0.14] grid place-items-center text-[#1B4D46] dark:text-[#C5E4DD] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] leading-relaxed">
          Renames <strong className="text-[#072622] dark:text-white">{farm.name}</strong> everywhere across My Farms, Maps, Smart Farm Analysis, Header selector, and saved reports.
        </p>

        <div>
          <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
            New farm name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            autoFocus
            maxLength={120}
            className="w-full h-11 px-3.5 rounded-xl border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 bg-white/80 dark:bg-[#04231F]/80 text-sm text-[#072622] dark:text-white focus:outline-none focus:border-[#0F766E] dark:focus:border-[#2DD4BF]"
          />
          {error && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-full bg-white/70 dark:bg-white/[0.06] border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[13px] font-semibold text-[#072622] dark:text-[#ECF8F5] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 px-5 rounded-full bg-gradient-to-r from-[#5EEAD4] via-[#2DD4BF] to-[#24E982] text-[#031F1C] text-[13px] font-bold hover:brightness-105 disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving…' : 'Save Name'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface DuplicateFarmModalProps {
  farm: MyFarmRecord | null;
  fieldCount: number;
  onClose: () => void;
  onConfirm: (farm: MyFarmRecord, opts: { newName: string; includeFields: boolean; includeHistory: boolean }) => Promise<void>;
}

export const DuplicateFarmModal: React.FC<DuplicateFarmModalProps> = ({
  farm,
  fieldCount,
  onClose,
  onConfirm,
}) => {
  const [newName, setNewName] = useState(farm ? `${farm.name} (Copy)` : '');
  const [includeFields, setIncludeFields] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNewName(farm ? `${farm.name} (Copy)` : '');
    setIncludeFields(true);
    setIncludeHistory(false);
  }, [farm]);

  if (!farm) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await onConfirm(farm, { newName: newName.trim(), includeFields, includeHistory });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fs-modal-backdrop" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="fs-modal-shell w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-base font-bold text-[#072622] dark:text-white">
            <Copy className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
            <span>Duplicate Farm Configuration</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close duplicate dialog"
            className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/[0.07] hover:bg-black/10 dark:hover:bg-white/[0.14] grid place-items-center text-[#1B4D46] dark:text-[#C5E4DD] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] leading-relaxed">
          Creates an independent farm entry starting from{' '}
          <strong className="text-[#072622] dark:text-white">{farm.name}</strong>’s soil and water
          settings:
        </p>

        <div>
          <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
            Duplicate farm name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            className="w-full h-11 px-3.5 rounded-xl border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 bg-white/80 dark:bg-[#04231F]/80 text-sm text-[#072622] dark:text-white focus:outline-none focus:border-[#0F766E] dark:focus:border-[#2DD4BF]"
          />
        </div>

        <div className="space-y-2.5 text-[13px]">
          <label className="fs-modal-subpanel flex items-start gap-3 p-3.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeFields}
              onChange={(e) => setIncludeFields(e.target.checked)}
              className="mt-1 accent-[#0F766E] dark:accent-[#24E982]"
            />
            <span>
              <strong className="block text-[#072622] dark:text-white">
                Copy mapped fields ({fieldCount})
              </strong>
              <span className="text-xs text-[#285E55] dark:text-[#96C7BE]">
                Clones field boundaries into independent polygons.
              </span>
            </span>
          </label>
          <label className="fs-modal-subpanel flex items-start gap-3 p-3.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeHistory}
              onChange={(e) => setIncludeHistory(e.target.checked)}
              className="mt-1 accent-[#0F766E] dark:accent-[#24E982]"
            />
            <span>
              <strong className="block text-[#072622] dark:text-white">
                Carry active rotation plan &amp; decision log
              </strong>
              <span className="text-xs text-[#285E55] dark:text-[#96C7BE]">
                Leave unchecked to start with a clean rotation slate.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-full bg-white/70 dark:bg-white/[0.06] border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[13px] font-semibold text-[#072622] dark:text-[#ECF8F5] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 px-5 rounded-full bg-gradient-to-r from-[#5EEAD4] via-[#2DD4BF] to-[#24E982] text-[#031F1C] text-[13px] font-bold hover:brightness-105 cursor-pointer"
          >
            {saving ? 'Duplicating…' : 'Create Duplicate'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface DeleteFarmModalProps {
  farm: MyFarmRecord | null;
  downstreamCounts: {
    fields: number;
    decisions: number;
    observations: number;
    tasks: number;
    snapshots: number;
  };
  isActiveFarm: boolean;
  onClose: () => void;
  onConfirm: (farm: MyFarmRecord) => Promise<void>;
}

export const DeleteFarmModal: React.FC<DeleteFarmModalProps> = ({
  farm,
  downstreamCounts,
  isActiveFarm,
  onClose,
  onConfirm,
}) => {
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1);
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setConfirmStep(1);
    setConfirmName('');
    setDeleting(false);
  }, [farm]);

  if (!farm) return null;

  const matches = confirmName.trim().toLowerCase() === farm.name.trim().toLowerCase();

  const handleDelete = async () => {
    if (confirmStep !== 2 || !matches) return;
    setDeleting(true);
    try {
      await onConfirm(farm);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fs-modal-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="fs-modal-shell w-full max-w-md p-6 space-y-4 border-rose-500/45"
        role="alertdialog"
        aria-labelledby="delete-farm-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex items-center gap-2.5 text-rose-600 dark:text-rose-300 font-bold text-base"
            id="delete-farm-title"
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>
              {confirmStep === 1 ? 'Delete Farm — Step 1 of 2' : 'Final Confirmation — Step 2 of 2'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close delete dialog"
            className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/[0.07] hover:bg-black/10 dark:hover:bg-white/[0.14] grid place-items-center text-[#1B4D46] dark:text-[#C5E4DD] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {confirmStep === 1 ? (
          <>
            <p className="text-[13px] text-[#1B4D46] dark:text-[#BEE3DC] leading-relaxed">
              Are you sure you want to delete{' '}
              <strong className="text-[#072622] dark:text-white">{farm.name}</strong>? This
              permanently removes the farm and all associated records across My Farms and Maps.
            </p>

            <div className="fs-modal-subpanel p-4 text-[13px] space-y-1.5">
              <div className="font-bold text-[#072622] dark:text-white">
                Records that will be permanently removed:
              </div>
              <div className="text-[#1B4D46] dark:text-[#BEE3DC] tabular-nums">
                · {downstreamCounts.fields} mapped field{downstreamCounts.fields === 1 ? '' : 's'}{' '}
                &amp; boundary history
              </div>
              <div className="text-[#1B4D46] dark:text-[#BEE3DC] tabular-nums">
                · {downstreamCounts.decisions} rotation decision entr
                {downstreamCounts.decisions === 1 ? 'y' : 'ies'}
              </div>
              <div className="text-[#1B4D46] dark:text-[#BEE3DC] tabular-nums">
                · {downstreamCounts.observations} observation
                {downstreamCounts.observations === 1 ? '' : 's'}, {downstreamCounts.tasks} task
                {downstreamCounts.tasks === 1 ? '' : 's'}, {downstreamCounts.snapshots} report
                {downstreamCounts.snapshots === 1 ? '' : 's'}
              </div>
              {isActiveFarm && (
                <div className="text-amber-700 dark:text-amber-300 font-semibold pt-1">
                  · Active Farm — workspace will switch automatically to the next farm.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-full bg-white/70 dark:bg-white/[0.06] border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[13px] font-semibold text-[#072622] dark:text-[#ECF8F5] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setConfirmStep(2)}
                className="h-10 px-5 rounded-full bg-rose-600 text-white text-[13px] font-bold hover:bg-rose-700 cursor-pointer"
              >
                Continue to Confirm
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] text-rose-700 dark:text-rose-200 leading-relaxed font-medium">
              Second confirmation required: deleting <strong>{farm.name}</strong> cannot be undone.
            </p>

            <div>
              <label className="block text-xs font-semibold text-[#14433C] dark:text-[#C5E4DD] mb-1.5">
                Type <strong className="text-[#072622] dark:text-white">{farm.name}</strong> to
                permanently delete:
              </label>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={farm.name}
                autoFocus
                className="w-full h-11 px-3.5 rounded-xl border border-rose-400/50 bg-white/85 dark:bg-[#041814]/90 text-sm text-[#072622] dark:text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-between items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmStep(1)}
                className="h-10 px-4 rounded-full bg-white/70 dark:bg-white/[0.06] border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[13px] font-semibold text-[#072622] dark:text-[#ECF8F5] cursor-pointer"
              >
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 px-4 rounded-full bg-white/70 dark:bg-white/[0.06] border border-[#0F766E]/25 dark:border-[#2DD4BF]/30 text-[13px] font-semibold text-[#072622] dark:text-[#ECF8F5] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!matches || deleting}
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-rose-600 text-white text-[13px] font-bold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{deleting ? 'Deleting…' : 'Confirm Delete'}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface ExportFarmModalProps {
  farm: MyFarmRecord | null;
  onClose: () => void;
  onDownloadJson: (farm: MyFarmRecord) => void;
  onDownloadGeoJson: (farm: MyFarmRecord) => void;
}

export const ExportFarmModal: React.FC<ExportFarmModalProps> = ({
  farm,
  onClose,
  onDownloadJson,
  onDownloadGeoJson,
}) => {
  if (!farm) return null;
  return (
    <div className="fs-modal-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="fs-modal-shell w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-base font-bold text-[#072622] dark:text-white">
            <Download className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
            <span>Export {farm.name}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/[0.07] hover:bg-black/10 dark:hover:bg-white/[0.14] grid place-items-center text-[#1B4D46] dark:text-[#C5E4DD] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              onDownloadJson(farm);
              onClose();
            }}
            className="fs-modal-subpanel w-full p-4 hover:border-[#0F766E]/45 dark:hover:border-[#2DD4BF]/45 text-left transition-colors cursor-pointer"
          >
            <div className="text-[13.5px] font-bold text-[#072622] dark:text-white">
              Complete Farm Record (JSON)
            </div>
            <div className="text-xs text-[#285E55] dark:text-[#96C7BE] mt-1 leading-relaxed">
              Includes fields, soil/water logs, rotation decisions, tasks, and report snapshots.
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onDownloadGeoJson(farm);
              onClose();
            }}
            disabled={!farm.hasBoundary}
            className="fs-modal-subpanel w-full p-4 hover:border-[#0F766E]/45 dark:hover:border-[#2DD4BF]/45 text-left disabled:opacity-45 transition-colors cursor-pointer"
          >
            <div className="text-[13.5px] font-bold text-[#072622] dark:text-white">
              Field Boundaries (WGS84 GeoJSON)
            </div>
            <div className="text-xs text-[#285E55] dark:text-[#96C7BE] mt-1 leading-relaxed">
              {farm.hasBoundary
                ? 'Standard EPSG:4326 FeatureCollection compatible with QGIS and GIS tools.'
                : 'Unavailable — draw or import a boundary first.'}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
