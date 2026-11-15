import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Lock,
  Search,
  Shapes,
  Upload,
  X,
} from 'lucide-react';
import { GeocodePlaceResult, reverseGeocode, searchPlacesDetailed } from '../../services/geocode';
import { resolveUserLocation } from '../../services/geolocation';
import { GeoJsonPolygonGeometry } from '../../types/maps';
import {
  AreaUnit,
  DrainageRate,
  SoilMoistureStatus,
  SoilMoistureUnit,
  SoilTexture,
  WaterReliability,
  WaterSource,
} from '../../types/farm';
import { buildStarterRectanglePolygon, formatArea } from '../../lib/myFarmsEngine';
import { normalizeSoilMoistureUnit } from '../../lib/soilProvenance';
import { FieldBoundaryEditorMap } from './FieldBoundaryEditorMap';

const DRAFT_STORAGE_KEY = 'anchor_myfarms_add_draft_v1';

export interface WizardDraftState {
  step: number;
  name: string;
  primaryCrop: string;
  regionLabel: string;
  country: string;
  timezone: string;
  latStr: string;
  lonStr: string;
  locationLabel: string;
  boundaryMode: 'draw' | 'starter' | 'import' | 'skip';
  geometry: GeoJsonPolygonGeometry | null;
  mappedAreaHa: number;
  initialFieldName: string;
  declaredAreaStr: string;
  areaUnit: AreaUnit;
  soilTexture: SoilTexture;
  soilMoistureStatus: SoilMoistureStatus;
  soilMoistureKnown?: boolean;
  soilMoistureStr: string;
  soilMoistureUnit: SoilMoistureUnit;
  soilMoistureDepth: string;
  soilMoistureMethod: string;
  soilMoistureDate: string;
  soilPhTested: boolean;
  soilPhStr: string;
  soilPhTestDate: string;
  drainage: DrainageRate;
  waterSource: WaterSource;
  waterReliability: WaterReliability;
  notes: string;
}

export function createFreshBlankDraft(): WizardDraftState {
  return {
    step: 1,
    name: '',
    primaryCrop: '',
    regionLabel: '',
    country: 'United States',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    latStr: '',
    lonStr: '',
    locationLabel: '',
    boundaryMode: 'draw',
    geometry: null,
    mappedAreaHa: 0,
    initialFieldName: 'Main Block',
    declaredAreaStr: '',
    areaUnit: 'hectares',
    soilTexture: 'Unknown',
    soilMoistureStatus: 'unknown',
    soilMoistureStr: '',
    soilMoistureUnit: 'unspecified',
    soilMoistureDepth: '',
    soilMoistureMethod: '',
    soilMoistureDate: '',
    soilPhTested: false,
    soilPhStr: '',
    soilPhTestDate: '',
    drainage: 'Unknown',
    waterSource: 'Unknown',
    waterReliability: 'Unknown',
    notes: '',
  };
}

export function hydrateAddFarmDraft(raw: Partial<WizardDraftState> | null | undefined): WizardDraftState {
  const base = createFreshBlankDraft();
  if (!raw || typeof raw !== 'object') return base;
  const legacyKnown = raw.soilMoistureStatus === undefined && raw.soilMoistureKnown === true;
  const status: SoilMoistureStatus =
    raw.soilMoistureStatus === 'measured' ||
    raw.soilMoistureStatus === 'estimated' ||
    raw.soilMoistureStatus === 'unknown'
      ? raw.soilMoistureStatus
      : legacyKnown
        ? 'measured'
        : 'unknown';
  return {
    ...base,
    ...raw,
    soilMoistureStatus: status,
    soilMoistureUnit: normalizeSoilMoistureUnit(raw.soilMoistureUnit),
    soilMoistureDepth: typeof raw.soilMoistureDepth === 'string' ? raw.soilMoistureDepth : '',
    soilMoistureMethod: typeof raw.soilMoistureMethod === 'string' ? raw.soilMoistureMethod : '',
    soilMoistureDate: typeof raw.soilMoistureDate === 'string' ? raw.soilMoistureDate : '',
    soilPhTestDate: typeof raw.soilPhTestDate === 'string' ? raw.soilPhTestDate : '',
  };
}

export function buildAddFarmSubmissionPayload(
  draft: WizardDraftState,
  options: {
    hasCoords: boolean;
    parsedLat: number;
    parsedLon: number;
    saveAsDraft: boolean;
  }
): Record<string, unknown> {
  const { hasCoords, parsedLat, parsedLon, saveAsDraft } = options;
  const declNum = Number(draft.declaredAreaStr);
  const declaredHa =
    draft.declaredAreaStr.trim() && Number.isFinite(declNum) && declNum > 0
      ? Number((draft.areaUnit === 'acres' ? declNum / 2.4710538 : declNum).toFixed(2))
      : null;

  const moistureTrimmed = draft.soilMoistureStr.trim();
  const parsedMoistureNum = moistureTrimmed !== '' ? Number(moistureTrimmed) : NaN;
  const moisturePct =
    draft.soilMoistureStatus !== 'unknown' && Number.isFinite(parsedMoistureNum)
      ? Math.max(0, Math.min(100, parsedMoistureNum))
      : null;

  const phTrimmed = draft.soilPhStr.trim();
  const parsedPhNum = phTrimmed !== '' ? Number(phTrimmed) : NaN;
  const phValue =
    draft.soilPhTested && Number.isFinite(parsedPhNum) ? parsedPhNum : null;

  return {
    name: draft.name.trim(),
    primaryCrop: draft.primaryCrop.trim() || null,
    locationLabel:
      draft.locationLabel.trim() ||
      draft.regionLabel.trim() ||
      (hasCoords ? `${parsedLat.toFixed(3)}°, ${parsedLon.toFixed(3)}°` : 'Location pending'),
    regionLabel: draft.regionLabel.trim() || draft.locationLabel.trim() || 'Unspecified',
    country: draft.country.trim() || 'Unspecified',
    timezone: draft.timezone.trim() || 'UTC',
    centroid: hasCoords ? { lat: parsedLat, lon: parsedLon } : null,
    geometry: draft.boundaryMode === 'skip' ? null : draft.geometry,
    declaredAreaHa: declaredHa,
    areaUnit: draft.areaUnit,
    isDraft: saveAsDraft,
    notes: draft.notes.trim(),
    initialFieldName: draft.geometry ? draft.initialFieldName.trim() || 'Main Block' : undefined,
    soil: {
      texture: draft.soilTexture,
      moistureStatus: draft.soilMoistureStatus,
      moisturePct,
      moistureUnit:
        draft.soilMoistureStatus === 'unknown'
          ? 'unspecified'
          : normalizeSoilMoistureUnit(draft.soilMoistureUnit),
      moistureDepth: draft.soilMoistureStatus === 'unknown' ? '' : draft.soilMoistureDepth.trim(),
      moistureMethod: draft.soilMoistureStatus === 'unknown' ? '' : draft.soilMoistureMethod.trim(),
      moistureDate: draft.soilMoistureStatus === 'unknown' ? '' : draft.soilMoistureDate.trim(),
      phStatus: draft.soilPhTested ? 'tested' : 'not_tested',
      phValue,
      phTestDate: draft.soilPhTested ? draft.soilPhTestDate.trim() : '',
      drainage: draft.drainage,
    },
    water: {
      sources: [draft.waterSource],
      reliability: draft.waterReliability,
    },
  };
}

interface AddFarmWizardModalProps {
  open: boolean;
  existingNames: string[];
  onClose: () => void;
  onComplete: (payload: Record<string, unknown>) => Promise<void>;
}

export const AddFarmWizardModal: React.FC<AddFarmWizardModalProps> = ({
  open,
  existingNames,
  onClose,
  onComplete,
}) => {
  const [draft, setDraft] = useState<WizardDraftState>(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) return hydrateAddFarmDraft(JSON.parse(saved) as Partial<WizardDraftState>);
    } catch {
      // Ignore
    }
    return createFreshBlankDraft();
  });

  const [hasSavedDraftBanner, setHasSavedDraftBanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodePlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [geoStatus, setGeoStatus] = useState<string>('');
  const [geoJsonText, setGeoJsonText] = useState('');
  const [importError, setImportError] = useState('');
  const [stepError, setStepError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Check if there was a leftover incomplete draft when opened
  useEffect(() => {
    if (!open) return;
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WizardDraftState>;
        if (parsed.name && parsed.name.trim()) {
          setHasSavedDraftBanner(true);
        }
      }
    } catch {
      // Ignore
    }
  }, [open]);

  // Persist draft automatically while open so reloading/closing never drops progress
  useEffect(() => {
    if (!open) return;
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Ignore quota errors on draft scratch
    }
  }, [draft, open]);

  if (!open) return null;

  const parsedLat = Number(draft.latStr);
  const parsedLon = Number(draft.lonStr);
  const hasCoords =
    draft.latStr.trim() !== '' &&
    draft.lonStr.trim() !== '' &&
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLon) &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLon >= -180 &&
    parsedLon <= 180;

  const handleStartBlank = () => {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraft(createFreshBlankDraft());
    setHasSavedDraftBanner(false);
    setStepError('');
  };

  const handlePlaceSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    setGeoStatus('');
    try {
      const list = await searchPlacesDetailed(searchQuery);
      setSearchResults(list);
      if (list.length === 0) setGeoStatus('No matching places found.');
    } catch (err) {
      setGeoStatus(err instanceof Error ? err.message : 'Location search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleBrowserGeolocation = async () => {
    setGeoStatus('Detecting your location…');
    try {
      const loc = await resolveUserLocation();
      const lat = Number(loc.lat.toFixed(5));
      const lon = Number(loc.lon.toFixed(5));
      const place = await reverseGeocode(lat, lon).catch(() => null);
      const fallbackLabel = [loc.city, loc.region].filter(Boolean).join(', ');
      setDraft((d) => ({
        ...d,
        latStr: String(lat),
        lonStr: String(lon),
        locationLabel:
          d.locationLabel ||
          place?.name ||
          fallbackLabel ||
          `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
        regionLabel: d.regionLabel || place?.displayName || fallbackLabel || d.regionLabel,
        country: place?.country || loc.country || d.country,
      }));
      setGeoStatus(
        loc.source === 'ip'
          ? `Approximate location detected (${place?.name || fallbackLabel || `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`}).`
          : `Located (${lat.toFixed(4)}°, ${lon.toFixed(4)}°).`
      );
    } catch {
      setGeoStatus('Location unavailable in this browser. Search a place or enter coordinates above.');
    }
  };

  const handleGenerateStarterRect = () => {
    if (!hasCoords) {
      setStepError('Enter or select farm coordinates in Step 2 first.');
      return;
    }
    const decl = Number(draft.declaredAreaStr);
    const targetHa = Number.isFinite(decl) && decl > 0
      ? draft.areaUnit === 'acres'
        ? decl / 2.4710538
        : decl
      : 25;
    const starter = buildStarterRectanglePolygon(parsedLat, parsedLon, targetHa);
    setDraft((d) => ({
      ...d,
      boundaryMode: 'starter',
      geometry: { type: 'Polygon', coordinates: starter.coordinates },
      mappedAreaHa: starter.areaHa,
    }));
    setStepError('');
  };

  const handleParseGeoJson = () => {
    setImportError('');
    try {
      const raw = JSON.parse(geoJsonText) as Record<string, unknown>;
      let coords: unknown = null;
      if (raw.type === 'FeatureCollection' && Array.isArray(raw.features) && raw.features[0]) {
        coords = (raw.features[0] as { geometry?: { coordinates?: unknown } }).geometry?.coordinates;
      } else if (raw.type === 'Feature') {
        coords = (raw.geometry as { coordinates?: unknown })?.coordinates;
      } else if (raw.type === 'Polygon') {
        coords = raw.coordinates;
      }
      if (!Array.isArray(coords) || !Array.isArray(coords[0]) || coords[0].length < 3) {
        setImportError('Paste a valid GeoJSON Polygon, Feature, or FeatureCollection.');
        return;
      }
      const geom: GeoJsonPolygonGeometry = {
        type: 'Polygon',
        coordinates: coords as [number, number][][],
      };
      setDraft((d) => ({
        ...d,
        boundaryMode: 'import',
        geometry: geom,
      }));
    } catch {
      setImportError('Invalid JSON syntax.');
    }
  };

  const validateAndNext = () => {
    setStepError('');
    if (draft.step === 1) {
      const trimmed = draft.name.trim();
      if (!trimmed) {
        setStepError('Enter a unique name for this farm.');
        return;
      }
      if (existingNames.some((n) => n.trim().toLowerCase() === trimmed.toLowerCase())) {
        setStepError(`A farm named "${trimmed}" already exists.`);
        return;
      }
    }
    if (draft.step === 2 && (draft.latStr.trim() || draft.lonStr.trim()) && !hasCoords) {
      setStepError('Latitude must be -90..90 and Longitude must be -180..180.');
      return;
    }
    setDraft((d) => ({ ...d, step: Math.min(5, d.step + 1) }));
  };

  const handleSubmit = async (saveAsDraft: boolean) => {
    if (!draft.name.trim()) {
      setStepError('Farm name is required.');
      return;
    }
    setSubmitting(true);
    setStepError('');
    try {
      const payload = buildAddFarmSubmissionPayload(draft, {
        hasCoords,
        parsedLat,
        parsedLon,
        saveAsDraft,
      });
      await onComplete(payload);
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      setDraft(createFreshBlankDraft());
      onClose();
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Unable to save farm.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fs-modal-backdrop"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fs-modal-shell w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-farm-wizard-title"
      >
        {/* Header */}
        <div className="fs-modal-header px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <h2 id="add-farm-wizard-title" className="text-lg font-bold text-[#072622] dark:text-[#ECF8F5]">
              Add New Farm · Step {draft.step} of 5
            </h2>
            <p className="text-[13px] text-[#2B5E56] dark:text-[#92C2B8] mt-0.5">
              Starts blank — unknown soil or boundary items remain clearly unassessed until provided.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {hasSavedDraftBanner && (
              <button
                type="button"
                onClick={handleStartBlank}
                className="px-3.5 py-1.5 rounded-full border border-teal-700/20 dark:border-teal-300/25 bg-white/60 dark:bg-white/[0.06] text-xs font-medium text-[#18463F] dark:text-[#C8E4DE] hover:bg-teal-500/10 cursor-pointer"
              >
                Discard draft &amp; start blank
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close wizard"
              className="w-9 h-9 rounded-full flex items-center justify-center border border-teal-700/20 dark:border-teal-300/25 bg-white/60 dark:bg-white/[0.06] text-[#18463F] dark:text-[#C8E4DE] hover:bg-teal-500/15 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Track */}
        <div className="px-6 py-3 border-b border-teal-700/15 dark:border-teal-300/15 bg-white/35 dark:bg-white/[0.025] flex items-center gap-2 text-xs overflow-x-auto fs-thin-scroll">
          {['1. Identity', '2. Location', '3. Boundary', '4. Agronomy', '5. Review'].map((label, i) => {
            const num = i + 1;
            const active = draft.step === num;
            const done = draft.step > num;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (num < draft.step) setDraft((d) => ({ ...d, step: num }));
                }}
                className={`px-3.5 py-1.5 rounded-full whitespace-nowrap font-semibold transition-colors ${
                  active
                    ? 'bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white shadow-sm'
                    : done
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 cursor-pointer hover:bg-emerald-500/25'
                      : 'text-[#2B5E56] dark:text-[#92C2B8]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 fs-thin-scroll text-[13.5px]">
          {draft.step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Farm name *
                  </label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g., Alder Creek Block"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Primary crop (optional)
                  </label>
                  <input
                    type="text"
                    value={draft.primaryCrop}
                    onChange={(e) => setDraft((d) => ({ ...d, primaryCrop: e.target.value }))}
                    placeholder="e.g., Winter Wheat, Maize, or leave blank"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Region / County label
                  </label>
                  <input
                    type="text"
                    value={draft.regionLabel}
                    onChange={(e) => setDraft((d) => ({ ...d, regionLabel: e.target.value }))}
                    placeholder="e.g., Willamette Valley, OR"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Timezone
                  </label>
                  <input
                    type="text"
                    value={draft.timezone}
                    onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2.5">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Private by default:</strong> Farm names, field polygons, soil logs, and reports stay isolated inside your workspace and never publish to community discovery unless explicitly opted in later.
                </span>
              </div>
            </div>
          )}

          {draft.step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-[200px] flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handlePlaceSearch();
                      }
                    }}
                    placeholder="Search city, valley, or address…"
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-sm text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={handlePlaceSearch}
                    disabled={searching}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    {searching ? 'Searching…' : 'Search'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleBrowserGeolocation}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  Use Device GPS
                </button>
              </div>

              {geoStatus && <p className="text-xs text-[var(--text-secondary)]">{geoStatus}</p>}

              {searchResults.length > 0 && (
                <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)] max-h-36 overflow-y-auto fs-thin-scroll text-xs">
                  {searchResults.map((res, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setDraft((d) => ({
                          ...d,
                          latStr: res.lat.toFixed(5),
                          lonStr: res.lon.toFixed(5),
                          locationLabel: res.displayName.split(',').slice(0, 2).join(', ').trim(),
                          regionLabel: d.regionLabel || res.displayName.split(',').slice(1, 3).join(', ').trim(),
                          country: res.country || d.country,
                        }));
                        setSearchResults([]);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-[var(--bg-elevated)] flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="truncate text-[var(--text-primary)]">{res.displayName}</span>
                      <span className="tabular-nums text-[var(--text-secondary)] shrink-0">
                        {res.lat.toFixed(2)}°, {res.lon.toFixed(2)}°
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Latitude (°)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={draft.latStr}
                    onChange={(e) => setDraft((d) => ({ ...d, latStr: e.target.value }))}
                    placeholder="e.g., 44.855"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] tabular-nums text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Longitude (°)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={draft.lonStr}
                    onChange={(e) => setDraft((d) => ({ ...d, lonStr: e.target.value }))}
                    placeholder="e.g., -123.150"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] tabular-nums text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Location label
                  </label>
                  <input
                    type="text"
                    value={draft.locationLabel}
                    onChange={(e) => setDraft((d) => ({ ...d, locationLabel: e.target.value }))}
                    placeholder="City / Locality"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <FieldBoundaryEditorMap
                center={hasCoords ? { lat: parsedLat, lon: parsedLon } : { lat: 44.855, lon: -123.15 }}
                farmGeometry={null}
                fields={[]}
                initialMode="pick_point"
                heightClassName="h-[240px]"
                onPickPoint={(lat, lon) => {
                  setDraft((d) => ({
                    ...d,
                    latStr: lat.toFixed(5),
                    lonStr: lon.toFixed(5),
                    locationLabel: d.locationLabel || `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
                  }));
                }}
              />
            </div>
          )}

          {draft.step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  { id: 'draw', label: 'Draw polygon' },
                  { id: 'starter', label: 'Quick parcel box' },
                  { id: 'import', label: 'Paste GeoJSON' },
                  { id: 'skip', label: 'Skip / Add later' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({ ...d, boundaryMode: opt.id as WizardDraftState['boundaryMode'] }))
                    }
                    className={`py-2 px-3 rounded-lg border font-semibold cursor-pointer ${
                      draft.boundaryMode === opt.id
                        ? 'border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--text-primary)]'
                        : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {draft.boundaryMode === 'draw' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        First field name
                      </label>
                      <input
                        type="text"
                        value={draft.initialFieldName}
                        onChange={(e) => setDraft((d) => ({ ...d, initialFieldName: e.target.value }))}
                        className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-xs text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                  <FieldBoundaryEditorMap
                    center={hasCoords ? { lat: parsedLat, lon: parsedLon } : { lat: 44.855, lon: -123.15 }}
                    farmGeometry={draft.geometry}
                    fields={[]}
                    areaUnit={draft.areaUnit}
                    initialMode="draw"
                    heightClassName="h-[270px]"
                    onSavePolygon={({ geometry, areaHa, centroid }) => {
                      setDraft((d) => ({
                        ...d,
                        geometry,
                        mappedAreaHa: areaHa,
                        latStr: d.latStr || String(centroid.lat),
                        lonStr: d.lonStr || String(centroid.lon),
                      }));
                    }}
                  />
                </div>
              )}

              {draft.boundaryMode === 'starter' && (
                <div className="fs-modal-subpanel p-4 space-y-3 text-[13px]">
                  <p className="text-[#18463F] dark:text-[#C8E4DE] leading-relaxed">
                    Generates a starter polygon around your Step 2 coordinate using your approximate area so you can refine exact vertices later.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateStarterRect}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white text-xs font-semibold hover:brightness-105 cursor-pointer shadow-sm"
                  >
                    <Shapes className="w-3.5 h-3.5" />
                    Generate Parcel Boundary
                  </button>
                  {draft.geometry && (
                    <div className="text-emerald-700 dark:text-emerald-300 font-medium tabular-nums">
                      Starter polygon ready ({formatArea(draft.mappedAreaHa, draft.areaUnit)} measured geodesic).
                    </div>
                  )}
                </div>
              )}

              {draft.boundaryMode === 'import' && (
                <div className="space-y-2 text-xs">
                  <label className="block font-medium text-[var(--text-secondary)]">
                    Paste WGS84 GeoJSON Polygon or FeatureCollection:
                  </label>
                  <textarea
                    rows={4}
                    value={geoJsonText}
                    onChange={(e) => setGeoJsonText(e.target.value)}
                    placeholder='{"type":"Polygon","coordinates":[[[-123.15,44.86],[-123.14,44.86],[-123.14,44.85],[-123.15,44.85],[-123.15,44.86]]]}'
                    className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] font-mono text-[11px] text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={handleParseGeoJson}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] font-semibold cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Validate &amp; Attach GeoJSON
                  </button>
                  {importError && <p className="text-rose-600 dark:text-rose-400">{importError}</p>}
                  {draft.geometry && !importError && (
                    <p className="text-emerald-700 dark:text-emerald-300 font-medium">GeoJSON boundary attached.</p>
                  )}
                </div>
              )}

              {draft.boundaryMode === 'skip' && (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-xs text-[var(--text-secondary)]">
                  Boundary skipped — farm will register as an unmapped record until fields are added in <strong>Fields &amp; Map</strong>.
                </div>
              )}
            </div>
          )}

          {draft.step === 4 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Declared whole-farm area
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={draft.declaredAreaStr}
                    onChange={(e) => setDraft((d) => ({ ...d, declaredAreaStr: e.target.value }))}
                    placeholder="Optional"
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-sm text-[var(--text-primary)] tabular-nums"
                  />
                  <select
                    value={draft.areaUnit}
                    onChange={(e) => setDraft((d) => ({ ...d, areaUnit: e.target.value as AreaUnit }))}
                    className="px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                  >
                    <option value="hectares">hectares</option>
                    <option value="acres">acres</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Soil texture
                </label>
                <select
                  value={draft.soilTexture}
                  onChange={(e) => setDraft((d) => ({ ...d, soilTexture: e.target.value as SoilTexture }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-sm text-[var(--text-primary)]"
                >
                  {['Unknown', 'Sandy', 'Loamy sand', 'Sandy loam', 'Loam', 'Silt loam', 'Clay loam', 'Clay'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/35 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="wizard-moisture-status" className="font-medium text-[var(--text-primary)]">
                    Soil moisture status (optional)
                  </label>
                  <select
                    id="wizard-moisture-status"
                    value={draft.soilMoistureStatus}
                    onChange={(e) => {
                      const nextStatus = e.target.value as SoilMoistureStatus;
                      setDraft((d) => ({
                        ...d,
                        soilMoistureStatus: nextStatus,
                        soilMoistureStr: nextStatus === 'unknown' ? '' : d.soilMoistureStr,
                        soilMoistureUnit: nextStatus === 'unknown' ? 'unspecified' : d.soilMoistureUnit,
                        soilMoistureDepth: nextStatus === 'unknown' ? '' : d.soilMoistureDepth,
                        soilMoistureMethod: nextStatus === 'unknown' ? '' : d.soilMoistureMethod,
                        soilMoistureDate: nextStatus === 'unknown' ? '' : d.soilMoistureDate,
                      }));
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                  >
                    <option value="unknown">Unknown / Not measured</option>
                    <option value="estimated">Estimated (hand / feel)</option>
                    <option value="measured">Measured (sensor / lab)</option>
                  </select>
                </div>

                {draft.soilMoistureStatus !== 'unknown' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    <div>
                      <label htmlFor="wizard-moisture-pct" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Moisture reading (%, optional)
                      </label>
                      <input
                        id="wizard-moisture-pct"
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={draft.soilMoistureStr}
                        onChange={(e) => setDraft((d) => ({ ...d, soilMoistureStr: e.target.value }))}
                        placeholder="Optional, e.g. 26"
                        className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor="wizard-moisture-unit" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Moisture unit / basis (optional)
                      </label>
                      <select
                        id="wizard-moisture-unit"
                        value={draft.soilMoistureUnit}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, soilMoistureUnit: e.target.value as SoilMoistureUnit }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                      >
                        <option value="unspecified">Unspecified / Not sure</option>
                        <option value="volumetric_vwc">Volumetric (% VWC)</option>
                        <option value="gravimetric">Gravimetric (% dry weight)</option>
                        <option value="available_water_pct">% Available water capacity</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="wizard-moisture-depth" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Measurement depth (optional)
                      </label>
                      <input
                        id="wizard-moisture-depth"
                        type="text"
                        value={draft.soilMoistureDepth}
                        onChange={(e) => setDraft((d) => ({ ...d, soilMoistureDepth: e.target.value }))}
                        placeholder="e.g., 0–20 cm"
                        className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label htmlFor="wizard-moisture-method" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Measurement method (optional)
                      </label>
                      <input
                        id="wizard-moisture-method"
                        type="text"
                        value={draft.soilMoistureMethod}
                        onChange={(e) => setDraft((d) => ({ ...d, soilMoistureMethod: e.target.value }))}
                        placeholder="e.g., TDR probe, tensiometer"
                        className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label htmlFor="wizard-moisture-date" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Measurement date (optional)
                      </label>
                      <input
                        id="wizard-moisture-date"
                        type="date"
                        value={draft.soilMoistureDate}
                        onChange={(e) => setDraft((d) => ({ ...d, soilMoistureDate: e.target.value }))}
                        className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-[var(--text-secondary)]">Recorded transparently as Unknown.</div>
                )}
              </div>

              <div className="sm:col-span-2 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/35 space-y-2.5">
                <label className="flex items-center gap-2 font-medium text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.soilPhTested}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        soilPhTested: e.target.checked,
                        soilPhStr: e.target.checked ? d.soilPhStr : '',
                        soilPhTestDate: e.target.checked ? d.soilPhTestDate : '',
                      }))
                    }
                  />
                  Lab soil pH tested (optional)
                </label>
                {draft.soilPhTested ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="wizard-ph-value" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Soil pH reading (0–14, optional)
                      </label>
                      <input
                        id="wizard-ph-value"
                        type="number"
                        step="0.1"
                        min="0"
                        max="14"
                        value={draft.soilPhStr}
                        onChange={(e) => setDraft((d) => ({ ...d, soilPhStr: e.target.value }))}
                        placeholder="Optional, e.g., 6.5"
                        className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor="wizard-ph-date" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        pH test date (optional)
                      </label>
                      <input
                        id="wizard-ph-date"
                        type="date"
                        value={draft.soilPhTestDate}
                        onChange={(e) => setDraft((d) => ({ ...d, soilPhTestDate: e.target.value }))}
                        className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-[var(--text-secondary)]">Recorded transparently as Not tested.</div>
                )}
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Primary water source
                </label>
                <select
                  value={draft.waterSource}
                  onChange={(e) => setDraft((d) => ({ ...d, waterSource: e.target.value as WaterSource }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-sm text-[var(--text-primary)]"
                >
                  {['Unknown', 'Groundwater / Well', 'River / Stream', 'Reservoir', 'Canal', 'Rainwater collection', 'Recycled water', 'Other'].map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Supply reliability
                </label>
                <select
                  value={draft.waterReliability}
                  onChange={(e) => setDraft((d) => ({ ...d, waterReliability: e.target.value as WaterReliability }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-sm text-[var(--text-primary)]"
                >
                  {['Unknown', 'Always available', 'Usually available', 'Sometimes limited', 'Frequently limited', 'Highly unreliable'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {draft.step === 5 && (
            <div className="space-y-4 text-xs">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4 space-y-2">
                <div className="font-bold text-sm text-[var(--text-primary)]">{draft.name || 'Unnamed Farm'}</div>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-[var(--text-secondary)]">
                  <div>Location: <strong className="text-[var(--text-primary)]">{draft.locationLabel || (hasCoords ? `${parsedLat.toFixed(3)}°, ${parsedLon.toFixed(3)}°` : 'Pending')}</strong></div>
                  <div>Crop: <strong className="text-[var(--text-primary)]">{draft.primaryCrop || 'Not specified'}</strong></div>
                  <div>Mapped boundary: <strong className="text-[var(--text-primary)]">{draft.geometry && draft.boundaryMode !== 'skip' ? `${draft.mappedAreaHa > 0 ? formatArea(draft.mappedAreaHa, draft.areaUnit) : 'Attached'}` : 'None (unmapped)'}</strong></div>
                  <div>Soil texture: <strong className="text-[var(--text-primary)]">{draft.soilTexture}</strong></div>
                  <div>Water source: <strong className="text-[var(--text-primary)]">{draft.waterSource}</strong></div>
                  <div>Visibility: <strong className="text-emerald-700 dark:text-emerald-300">Private workspace only</strong></div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] p-3 text-[var(--text-secondary)] space-y-1">
                <div className="font-semibold text-[var(--text-primary)]">Attribution &amp; Map Limits Disclosure</div>
                <p>
                  Place search uses OpenStreetMap Nominatim (attribution © OpenStreetMap contributors); map imagery uses Esri World Imagery / OSM tiles; geodesic areas use WGS84 Chamberlain–Duquette spherical excess.
                </p>
              </div>
            </div>
          )}

          {stepError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {stepError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="fs-modal-footer px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {draft.step > 1 && (
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, step: d.step - 1 }))}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-teal-700/20 dark:border-teal-300/25 bg-white/70 dark:bg-white/[0.06] text-xs font-semibold text-[#072622] dark:text-[#ECF8F5] hover:bg-teal-500/10 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
            <button
              type="button"
              disabled={submitting || !draft.name.trim()}
              onClick={() => handleSubmit(true)}
              className="px-4 py-2 rounded-full border border-teal-700/20 dark:border-teal-300/25 text-xs font-medium text-[#2B5E56] dark:text-[#92C2B8] hover:text-[#072622] dark:hover:text-white disabled:opacity-45 cursor-pointer"
            >
              Save as Draft
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {draft.step < 5 ? (
              <button
                type="button"
                onClick={validateAndNext}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white text-xs font-semibold hover:brightness-105 cursor-pointer shadow-sm"
              >
                Continue
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit(false)}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-semibold hover:brightness-105 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                {submitting ? 'Creating Farm…' : 'Create Farm'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
