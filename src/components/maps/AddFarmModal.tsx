import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  MapPin,
  PenTool,
  Sprout,
  Upload,
  X,
} from 'lucide-react';
import { FarmGeoJsonGeometry, FarmMapRecord } from '../../types/maps';
import {
  computeFarmGeometryMetrics,
  parseImportedBoundariesFile,
} from '../../lib/mapGeometry';
import { createWorkspaceFarm } from '../../services/mapsApi';
import { loadFarmProfiles } from '../../lib/farmStorage';
import { loadRecentAnalyses } from '../../lib/storage';
import { getCropDisplayName } from '../../data/farmCropCatalog';

export interface AnalyzedFarmCandidate {
  id: string;
  name: string;
  crop: string | null;
  locationLabel: string;
  lat: number;
  lon: number;
  analyzedAt: string;
}

export interface PendingFarmDraftMeta {
  name: string;
  crop: string | null;
  locationLabel?: string;
  notes?: string;
  center?: { lat: number; lon: number };
}

interface AddFarmModalProps {
  open: boolean;
  existingFarms: FarmMapRecord[];
  onStartDrawOnMap: (meta: PendingFarmDraftMeta) => void;
  onClose: () => void;
  onFarmCreated: (farm: Awaited<ReturnType<typeof createWorkspaceFarm>>) => void;
}

export function getUnmappedAnalyzedFarms(existingFarms: FarmMapRecord[]): AnalyzedFarmCandidate[] {
  const mappedNames = new Set(
    existingFarms.map((f) => f.name.trim().toLowerCase()).filter(Boolean)
  );
  const seenNames = new Set<string>();
  const results: AnalyzedFarmCandidate[] = [];

  // 1. Smart Farm Workspace profiles where an analysis report has been generated and coordinates exist
  const profiles = loadFarmProfiles();
  for (const p of profiles) {
    const rawName = p.location?.farmName?.trim() ?? '';
    const lat = p.location?.lat;
    const lon = p.location?.lon;
    if (
      !p.lastReportGeneratedAt ||
      !rawName ||
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      continue;
    }
    const key = rawName.toLowerCase();
    if (mappedNames.has(key) || seenNames.has(key)) continue;
    seenNames.add(key);

    const firstCropId = p.crops?.currentCrops?.[0] || p.crops?.plannedCrops?.[0] || '';
    const cropLabel = firstCropId ? getCropDisplayName(firstCropId) : null;
    const locLabel =
      p.location.locationLabel?.trim() || p.location.regionOrAddress?.trim() || '';

    results.push({
      id: p.id,
      name: rawName,
      crop: cropLabel,
      locationLabel: locLabel,
      lat,
      lon,
      analyzedAt: p.lastReportGeneratedAt,
    });
  }

  // 2. Site analyses performed specifically for farming/agriculture with coordinates
  const recent = loadRecentAnalyses();
  for (const item of recent) {
    if (item.activityId !== 'farming') continue;
    const rawName = item.place?.name?.trim() ?? '';
    const lat = item.place?.lat;
    const lon = item.place?.lon;
    if (
      !rawName ||
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      continue;
    }
    const key = rawName.toLowerCase();
    if (mappedNames.has(key) || seenNames.has(key)) continue;
    seenNames.add(key);

    results.push({
      id: item.id,
      name: rawName,
      crop: null,
      locationLabel: item.place.displayName || rawName,
      lat,
      lon,
      analyzedAt: item.createdAt,
    });
  }

  return results;
}

const CROP_SUGGESTIONS = ['Wheat', 'Corn', 'Soybeans', 'Barley', 'Alfalfa', 'Rice', 'Cotton', 'Orchard'];

export const AddFarmModal: React.FC<AddFarmModalProps> = ({
  open,
  existingFarms,
  onStartDrawOnMap,
  onClose,
  onFarmCreated,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nameFieldRef = useRef<HTMLDivElement | null>(null);

  const [selectedCandidate, setSelectedCandidate] = useState<AnalyzedFarmCandidate | null>(null);
  const [crop, setCrop] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showImportSection, setShowImportSection] = useState(false);

  const [importedGeometry, setImportedGeometry] = useState<FarmGeoJsonGeometry | null>(null);
  const [importFilename, setImportFilename] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Compute eligible analyzed unmapped farms whenever modal opens or existingFarms updates
  const analyzedFarms = useMemo(() => {
    if (!open) return [];
    return getUnmappedAnalyzedFarms(existingFarms);
  }, [open, existingFarms]);

  const importedMetrics = useMemo(() => {
    if (!importedGeometry) return null;
    return computeFarmGeometryMetrics(importedGeometry);
  }, [importedGeometry]);

  // Reset modal state on close, and auto-open suggestions when opening with candidates
  useEffect(() => {
    if (!open) {
      setSelectedCandidate(null);
      setCrop('');
      setLocationLabel('');
      setNotes('');
      setDropdownOpen(false);
      setShowImportSection(false);
      setImportedGeometry(null);
      setImportFilename('');
      setImportError(null);
      setFormError(null);
    } else if (analyzedFarms.length > 0) {
      setDropdownOpen(true);
    }
  }, [open, analyzedFarms.length]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (nameFieldRef.current && !nameFieldRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [dropdownOpen]);

  if (!open) return null;

  const resetLocalState = () => {
    setSelectedCandidate(null);
    setCrop('');
    setLocationLabel('');
    setNotes('');
    setDropdownOpen(false);
    setShowImportSection(false);
    setImportedGeometry(null);
    setImportFilename('');
    setImportError(null);
    setFormError(null);
  };

  const handleSelectAnalyzedFarm = (candidate: AnalyzedFarmCandidate) => {
    setSelectedCandidate(candidate);
    setCrop(candidate.crop || '');
    setLocationLabel(candidate.locationLabel || '');
    setDropdownOpen(false);
    setFormError(null);
  };

  const handleProceedToDraw = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedCandidate) {
      setFormError('Please select a farm from the analyzed farm suggestions.');
      setDropdownOpen(true);
      return;
    }

    // If user uploaded a boundary file instead of drawing on map, save directly
    if (showImportSection && importedGeometry) {
      void handleSaveImportedFarm();
      return;
    }

    const meta: PendingFarmDraftMeta = {
      name: selectedCandidate.name,
      crop: crop.trim() || selectedCandidate.crop || null,
      locationLabel: locationLabel.trim() || selectedCandidate.locationLabel || undefined,
      notes: notes.trim() || undefined,
      center: { lat: selectedCandidate.lat, lon: selectedCandidate.lon },
    };
    resetLocalState();
    onStartDrawOnMap(meta);
  };

  const handleSaveImportedFarm = async () => {
    if (!importedGeometry || !selectedCandidate) return;
    setSaving(true);
    setFormError(null);
    try {
      const created = await createWorkspaceFarm({
        name: selectedCandidate.name,
        crop: crop.trim() || selectedCandidate.crop || null,
        locationLabel: locationLabel.trim() || selectedCandidate.locationLabel || undefined,
        notes: notes.trim() || undefined,
        geometry: importedGeometry,
      });
      resetLocalState();
      onFarmCreated(created);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save imported farm. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    setImportFilename(file.name);
    try {
      const text = await file.text();
      const parsed = parseImportedBoundariesFile(file.name, text);
      const valid = parsed.candidates.find((c) => c.geometry && c.validation?.valid);
      if (!valid || !valid.geometry) {
        const firstErr =
          parsed.candidates.find((c) => c.error)?.error ||
          'No valid Polygon feature found in this file.';
        setImportedGeometry(null);
        setImportError(firstErr);
        return;
      }
      setImportedGeometry(valid.geometry);
    } catch (err) {
      setImportedGeometry(null);
      setImportError(err instanceof Error ? err.message : 'Unable to parse file.');
    }
  };

  return (
    <div
      className="fs-modal-backdrop !z-[900]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-farm-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="fs-modal-shell w-full max-w-lg overflow-visible flex flex-col"
      >
        <div className="fs-modal-header px-6 py-5 flex items-start justify-between gap-4 rounded-t-[28px]">
          <div>
            <h2 id="add-farm-modal-title" className="text-lg font-bold text-[#072622] dark:text-[#ECF8F5]">
              Add Farm to Map
            </h2>
            <p className="text-[13px] text-[#2B5E56] dark:text-[#92C2B8] mt-0.5">
              Choose an analyzed farm from your suggestions to draw on the map.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Add Farm modal"
            className="w-9 h-9 rounded-full border border-teal-700/20 dark:border-teal-300/25 bg-white/60 dark:bg-white/[0.06] text-[#18463F] dark:text-[#C8E4DE] hover:bg-teal-500/15 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleProceedToDraw} className="p-6 space-y-5">
          {/* Farm Name Selector (Suggestions Only) */}
          <div ref={nameFieldRef} className="relative">
            <label htmlFor="farm-name-selector" className="block text-xs font-semibold text-[#18463F] dark:text-[#C8E4DE] mb-1.5">
              Farm Name <span className="text-rose-500 dark:text-rose-400">*</span>
            </label>
            <button
              id="farm-name-selector"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
              onClick={() => setDropdownOpen((o) => !o)}
              className={`w-full h-11 pl-4 pr-10 rounded-2xl bg-white/75 dark:bg-black/25 border text-sm text-left flex items-center justify-between transition-colors cursor-pointer ${
                dropdownOpen
                  ? 'border-teal-600 dark:border-[#2DD4BF]'
                  : 'border-teal-700/20 dark:border-teal-300/25 hover:border-teal-600/45'
              }`}
            >
              {selectedCandidate ? (
                <span className="flex items-center gap-2 min-w-0">
                  <Sprout className="w-4 h-4 text-teal-600 dark:text-[#2DD4BF] shrink-0" />
                  <span className="text-[#072622] dark:text-white font-semibold truncate">{selectedCandidate.name}</span>
                  <span className="text-xs font-mono text-teal-700 dark:text-[#5EEAD4] shrink-0">
                    {selectedCandidate.lat.toFixed(2)}, {selectedCandidate.lon.toFixed(2)}
                  </span>
                </span>
              ) : (
                <span className="text-[#2B5E56] dark:text-[#92C2B8] truncate">
                  {analyzedFarms.length > 0
                    ? 'Choose a farm from analyzed suggestions...'
                    : 'No analyzed farms available'}
                </span>
              )}
              <ChevronDown
                className={`w-4 h-4 text-[#2B5E56] dark:text-[#92C2B8] absolute right-3.5 top-1/2 -translate-y-1/2 transition-transform ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Analyzed Farms Suggestions Dropdown */}
            {dropdownOpen && (
              <div
                role="listbox"
                aria-label="Analyzed farm suggestions"
                className="fs-modal-shell absolute left-0 right-0 top-full mt-2 z-50 !rounded-2xl overflow-hidden"
              >
                <div className="px-4 py-2 fs-modal-header text-xs font-semibold uppercase tracking-wider text-[#2B5E56] dark:text-[#92C2B8] flex items-center justify-between">
                  <span>Analyzed Farms (Not on Maps)</span>
                  <span>{analyzedFarms.length}</span>
                </div>

                {analyzedFarms.length === 0 ? (
                  <div className="px-5 py-6 text-center space-y-1.5">
                    <div className="text-sm font-semibold text-[#072622] dark:text-[#ECF8F5]">No farm suggestions</div>
                    <p className="text-[13px] text-[#2B5E56] dark:text-[#92C2B8] leading-relaxed">
                      No analyzed farms with coordinates are waiting to be mapped. Analyze a farm first to select it here.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto fs-thin-scroll divide-y divide-teal-700/10 dark:divide-teal-300/15">
                    {analyzedFarms.map((item) => {
                      const isPicked = selectedCandidate?.id === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={isPicked}
                          onClick={() => handleSelectAnalyzedFarm(item)}
                          className={`w-full text-left px-4 py-3 transition-colors flex items-start justify-between gap-3 cursor-pointer ${
                            isPicked
                              ? 'bg-teal-500/15 dark:bg-teal-400/15'
                              : 'hover:bg-teal-500/10'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#072622] dark:text-white truncate flex items-center gap-2">
                              <Sprout className="w-3.5 h-3.5 text-teal-600 dark:text-[#2DD4BF] shrink-0" />
                              <span className="truncate">{item.name}</span>
                            </div>
                            <div className="text-xs text-[#2B5E56] dark:text-[#92C2B8] truncate mt-0.5 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-[#5EEAD4] shrink-0" />
                              <span className="truncate">
                                {item.locationLabel || `${item.lat.toFixed(4)}, ${item.lon.toFixed(4)}`}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs font-mono text-teal-700 dark:text-[#5EEAD4] tabular-nums">
                              {item.lat.toFixed(3)}, {item.lon.toFixed(3)}
                            </div>
                            {item.crop && (
                              <div className="text-xs text-[#2B5E56] dark:text-[#92C2B8] mt-0.5">{item.crop}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Optional Primary Crop & Location Label */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="farm-crop-input" className="block text-xs font-semibold text-[#18463F] dark:text-[#C8E4DE] mb-1.5">
                Primary Crop
              </label>
              <input
                id="farm-crop-input"
                type="text"
                list="farm-crop-options"
                value={crop}
                onChange={(e) => setCrop(e.target.value)}
                placeholder="Optional (e.g., Wheat)"
                maxLength={80}
                className="w-full h-11 px-3.5 rounded-2xl bg-white/75 dark:bg-black/25 border border-teal-700/20 dark:border-teal-300/25 text-sm text-[#072622] dark:text-white placeholder:text-[#2B5E56]/60 dark:placeholder:text-[#92C2B8]/60 focus:outline-none focus:border-teal-600 dark:focus:border-[#2DD4BF]"
              />
              <datalist id="farm-crop-options">
                {CROP_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="farm-location-input" className="block text-xs font-semibold text-[#18463F] dark:text-[#C8E4DE] mb-1.5">
                Location Label
              </label>
              <input
                id="farm-location-input"
                type="text"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="Optional region"
                maxLength={120}
                className="w-full h-11 px-3.5 rounded-2xl bg-white/75 dark:bg-black/25 border border-teal-700/20 dark:border-teal-300/25 text-sm text-[#072622] dark:text-white placeholder:text-[#2B5E56]/60 dark:placeholder:text-[#92C2B8]/60 focus:outline-none focus:border-teal-600 dark:focus:border-[#2DD4BF]"
              />
            </div>
          </div>

          {/* Optional GeoJSON / KML Boundary Import Toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowImportSection((s) => !s)}
              className="text-xs font-semibold text-teal-700 dark:text-[#5EEAD4] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{showImportSection ? 'Hide GeoJSON / KML import' : 'Or import a GeoJSON / KML boundary file'}</span>
            </button>

            {showImportSection && (
              <div className="fs-modal-subpanel mt-3 p-4 border-dashed text-center space-y-2.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".geojson,.json,.kml,application/geo+json,application/vnd.google-earth.kml+xml"
                  className="hidden"
                  onChange={(e) => handleImportFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 dark:bg-white/[0.08] border border-teal-700/20 dark:border-teal-300/25 hover:bg-teal-500/10 text-xs font-semibold text-[#072622] dark:text-white cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-teal-600 dark:text-[#2DD4BF]" />
                  <span>{importFilename || 'Choose .geojson or .kml file'}</span>
                </button>
                {importError && (
                  <div className="text-left p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/35 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500 dark:text-rose-400" />
                    <span>{importError}</span>
                  </div>
                )}
                {importedGeometry && importedMetrics && (
                  <div className="text-left p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/35 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Valid polygon loaded ({importedMetrics.areaHa.toFixed(1)} ha)</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {formError && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/35 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-teal-700/15 dark:border-teal-300/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-semibold text-[#2B5E56] dark:text-[#92C2B8] hover:bg-teal-500/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedCandidate || saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white text-xs font-semibold hover:brightness-105 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer shadow-sm"
            >
              {showImportSection && importedGeometry ? (
                <span>{saving ? 'Saving Farm...' : 'Save Imported Farm'}</span>
              ) : (
                <>
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Draw Boundary on Map</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
