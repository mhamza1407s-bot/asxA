import React, { useEffect, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { CropEntry, HotspotKind, PlantHotspot } from '../../types';

interface PlantGuideDrawerProps {
  open: boolean;
  hotspots: PlantHotspot[];
  cropsById: Record<string, CropEntry>;
  onSelectHotspot: (hotspot: PlantHotspot) => void;
  onClose: () => void;
}

const KIND_FILTERS: Array<{ id: 'all' | HotspotKind; label: string }> = [
  { id: 'all', label: 'All (16)' },
  { id: 'crop', label: 'Crops' },
  { id: 'tree', label: 'Trees' },
  { id: 'wildflower', label: 'Wildflowers' },
  { id: 'pasture', label: 'Pasture' },
  { id: 'meadow', label: 'Grass' },
  { id: 'solar', label: 'Solar' },
];

export const PlantGuideDrawer: React.FC<PlantGuideDrawerProps> = ({
  open,
  hotspots,
  cropsById,
  onSelectHotspot,
  onClose,
}) => {
  const [filterKind, setFilterKind] = useState<'all' | HotspotKind>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const filtered = hotspots.filter((h) => {
    if (filterKind !== 'all' && h.kind !== filterKind) return false;
    const crop = cropsById[h.cropId];
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      h.label.toLowerCase().includes(q) ||
      (crop?.name.toLowerCase().includes(q) ?? false) ||
      (crop?.scientificName.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div
      className="fs-drawer-backdrop !justify-start"
      role="dialog"
      aria-modal="true"
      aria-label="Plant Guide directory"
      onClick={onClose}
    >
      <aside
        className="fs-drawer-shell !border-l-0 !border-r border-teal-700/20 dark:border-teal-300/25 relative z-10 w-full max-w-sm h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fs-modal-header px-5 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-teal-600 dark:text-[#2DD4BF]" aria-hidden="true" />
            <h2 className="text-base font-display font-bold text-[#072622] dark:text-[#ECF8F5]">
              Farm &amp; Plant Guide
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Plant Guide"
            className="w-9 h-9 rounded-full border border-teal-700/20 dark:border-teal-300/25 bg-white/60 dark:bg-white/[0.06] flex items-center justify-center text-[#18463F] dark:text-[#C8E4DE] hover:bg-teal-500/15 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-teal-700/15 dark:border-teal-300/15 space-y-3 bg-white/30 dark:bg-white/[0.02]">
          <div className="relative">
            <Search className="w-4 h-4 text-[#2B5E56] dark:text-[#92C2B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter crops, trees, solar..."
              aria-label="Filter Plant Guide items"
              className="w-full min-h-[40px] pl-10 pr-3.5 rounded-full bg-white/75 dark:bg-black/25 border border-teal-700/20 dark:border-teal-300/25 text-xs text-[#072622] dark:text-white placeholder:text-[#2B5E56]/60 dark:placeholder:text-[#92C2B8]/60 focus:outline-none focus:border-teal-600 dark:focus:border-[#2DD4BF]"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterKind(f.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                  filterKind === f.id
                    ? 'bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white border-transparent shadow-sm'
                    : 'bg-white/60 dark:bg-white/[0.05] text-[#18463F] dark:text-[#C8E4DE] border-teal-700/15 dark:border-teal-300/20 hover:bg-teal-500/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto fs-thin-scroll p-3.5 space-y-2" role="list">
          {filtered.map((h) => {
            const crop = cropsById[h.cropId];
            return (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectHotspot(h);
                    onClose();
                  }}
                  className="fs-modal-subpanel w-full text-left p-3.5 hover:border-teal-500/50 hover:bg-teal-500/10 flex items-center gap-3 transition-colors cursor-pointer"
                >
                  <span className="text-2xl shrink-0" aria-hidden="true">
                    {h.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold text-[#072622] dark:text-[#ECF8F5] truncate">
                      {crop?.name ?? h.label}
                    </div>
                    <div className="text-xs text-[#2B5E56] dark:text-[#92C2B8] truncate">
                      {crop?.scientificName ?? h.kind}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/25 text-teal-700 dark:text-[#5EEAD4] shrink-0">
                    {h.kind}
                  </span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="py-8 text-center text-[13px] text-[#2B5E56] dark:text-[#92C2B8]">
              No farm items match "{query}".
            </li>
          )}
        </ul>
      </aside>
    </div>
  );
};
