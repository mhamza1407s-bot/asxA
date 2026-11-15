import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle,
  Check,
  Compass,
  Crosshair,
  Layers,
  MapPin,
  PenTool,
  Redo2,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  ConfirmedLocationRecord,
  FieldGeometryRecord,
  GeocodedLocationCandidate,
} from '../../types/questionnaire';
import { GeoJsonPolygonGeometry, LonLat } from '../../types/maps';
import {
  closeRing,
  computeRingCentroid,
  stripClosingVertex,
  validatePolygonGeometry,
} from '../../lib/mapGeometry';
import { getBaseMapTileSpec } from '../../services/mapsApi';
import {
  resolveTimezoneApi,
  searchLocationsApi,
  validateFieldPolygonApi,
} from '../../services/questionnaireApi';
import { MyFarmRecord } from '../../types/myFarms';

interface LocationPickerProps {
  location: ConfirmedLocationRecord | null;
  savedFarms: MyFarmRecord[];
  isLight: boolean;
  suggestedCenter?: { lat: number; lon: number; label?: string } | null;
  onConfirmLocation: (loc: ConfirmedLocationRecord) => void;
}

export const QuestionLocationPicker: React.FC<LocationPickerProps> = ({
  location,
  savedFarms,
  isLight,
  suggestedCenter,
  onConfirmLocation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeocodedLocationCandidate[]>([]);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [manualLat, setManualLat] = useState(
    location ? String(location.latitude) : ''
  );
  const [manualLon, setManualLon] = useState(
    location ? String(location.longitude) : ''
  );
  const [manualLabel, setManualLabel] = useState(location?.placeLabel || '');
  const [pendingPin, setPendingPin] = useState<{
    lat: number;
    lon: number;
    label: string;
    timezone: string;
    elevationM: number | null;
    country?: string;
    adminArea?: string;
    method: ConfirmedLocationRecord['locationMethod'];
    geocoderProvider?: string;
    precision: ConfirmedLocationRecord['spatialPrecisionLabel'];
  } | null>(
    location
      ? {
          lat: location.latitude,
          lon: location.longitude,
          label: location.placeLabel,
          timezone: location.timezone,
          elevationM: location.elevationM ?? null,
          country: location.country,
          adminArea: location.adminArea,
          method: location.locationMethod,
          geocoderProvider: location.geocoderProvider,
          precision: location.spatialPrecisionLabel,
        }
      : null
  );
  const [coordError, setCoordError] = useState<string | null>(null);
  const [baseMap, setBaseMap] = useState<'satellite' | 'street'>('satellite');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  // Initialize Leaflet pin map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const initLat = pendingPin?.lat ?? suggestedCenter?.lat ?? 42.03;
    const initLon = pendingPin?.lon ?? suggestedCenter?.lon ?? -93.63;
    const initZoom = pendingPin ? 13 : suggestedCenter ? 12 : 3;
    const map = L.map(mapContainerRef.current, {
      center: [initLat, initLon],
      zoom: initZoom,
      zoomControl: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;

    map.on('click', async (ev: L.LeafletMouseEvent) => {
      const lat = Number(ev.latlng.lat.toFixed(5));
      const lon = Number(ev.latlng.lng.toFixed(5));
      setManualLat(String(lat));
      setManualLon(String(lon));
      setCoordError(null);
      let tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      let elev: number | null = null;
      try {
        const tzRes = await resolveTimezoneApi(lat, lon);
        tz = tzRes.timezone;
        elev = tzRes.elevationM;
      } catch {
        // Keep browser fallback
      }
      setPendingPin({
        lat,
        lon,
        label: manualLabel.trim() || `Field Pin (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`,
        timezone: tz,
        elevationM: elev,
        method: 'manual_pin',
        precision: 'field_pin',
      });
    });

    const t = window.setTimeout(() => map.invalidateSize(), 160);
    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    const spec = getBaseMapTileSpec(baseMap);
    tileRef.current = L.tileLayer(spec.url, {
      attribution: spec.attribution,
      maxZoom: spec.maxZoom,
    }).addTo(map);
  }, [baseMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    if (pendingPin) {
      markerRef.current = L.circleMarker([pendingPin.lat, pendingPin.lon], {
        radius: 8,
        color: '#2DD4BF',
        fillColor: '#14B89A',
        fillOpacity: 0.9,
        weight: 2.5,
      }).addTo(map);
      map.setView([pendingPin.lat, pendingPin.lon], Math.max(map.getZoom(), 12), {
        animate: true,
      });
    }
  }, [pendingPin?.lat, pendingPin?.lon]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length < 2) {
      setSearchError('Type at least 2 characters (town, village, region, or postcode).');
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchLocationsApi(searchQuery.trim());
      setCandidates(res.candidates);
      if (res.candidates.length === 0) {
        setSearchError('No matching places found. Try a nearby town or place a pin on the map.');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Geocoding search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectCandidate = (c: GeocodedLocationCandidate) => {
    setManualLat(String(c.lat));
    setManualLon(String(c.lon));
    setManualLabel(c.displayName);
    setCoordError(null);
    setPendingPin({
      lat: c.lat,
      lon: c.lon,
      label: c.displayName,
      timezone: c.timezone,
      elevationM: c.elevationM,
      country: c.country,
      adminArea: c.adminArea,
      method: 'geocoded_search',
      geocoderProvider: c.provider,
      precision: 'town_region_context',
    });
  };

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Browser geolocation is not supported here. Use place search or map pin.');
      return;
    }
    setGpsLoading(true);
    setGpsStatus('Requesting device location permission...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lon = Number(pos.coords.longitude.toFixed(5));
        setManualLat(String(lat));
        setManualLon(String(lon));
        let tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        let elev: number | null = null;
        try {
          const tzRes = await resolveTimezoneApi(lat, lon);
          tz = tzRes.timezone;
          elev = tzRes.elevationM;
        } catch {
          // ignore
        }
        setGpsLoading(false);
        setGpsStatus(
          `GPS fix obtained (±${Math.round(pos.coords.accuracy)} m). Inspect pin on map and click "Confirm This Location".`
        );
        setPendingPin({
          lat,
          lon,
          label: manualLabel.trim() || `GPS Field Pin (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`,
          timezone: tz,
          elevationM: elev,
          method: 'browser_gps_confirmed',
          precision: 'field_pin',
        });
      },
      (err) => {
        setGpsLoading(false);
        setGpsStatus(
          err.code === 1
            ? 'Device location permission denied. Please search by place name, enter coordinates, or click the map.'
            : 'Unable to obtain GPS fix. Use place search or click the map.'
        );
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  };

  const handleApplyManualCoords = async () => {
    const lat = Number(manualLat);
    const lon = Number(manualLon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCoordError('Latitude must be between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setCoordError('Longitude must be between -180 and 180.');
      return;
    }
    if (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) {
      setCoordError('Null-island (0, 0) coordinates rejected — enter real field coordinates.');
      return;
    }
    setCoordError(null);
    let tz = 'UTC';
    let elev: number | null = null;
    try {
      const tzRes = await resolveTimezoneApi(lat, lon);
      tz = tzRes.timezone;
      elev = tzRes.elevationM;
    } catch {
      // ignore
    }
    setPendingPin({
      lat: Number(lat.toFixed(5)),
      lon: Number(lon.toFixed(5)),
      label: manualLabel.trim() || `Coordinates (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`,
      timezone: tz,
      elevationM: elev,
      method: 'manual_coordinates',
      precision: 'field_pin',
    });
  };

  const handleConfirm = () => {
    if (!pendingPin) return;
    onConfirmLocation({
      locationMethod: pendingPin.method,
      latitude: pendingPin.lat,
      longitude: pendingPin.lon,
      timezone: pendingPin.timezone,
      elevationM: pendingPin.elevationM,
      country: pendingPin.country,
      adminArea: pendingPin.adminArea,
      placeLabel: manualLabel.trim() || pendingPin.label,
      geocoderProvider: pendingPin.geocoderProvider,
      confirmedByUser: true,
      confirmedAt: new Date().toISOString(),
      locationVersion: (location?.locationVersion ?? 0) + 1,
      spatialPrecisionLabel: pendingPin.precision,
    });
  };

  const farmsWithCoords = useMemo(
    () => savedFarms.filter((f) => f.centroid && Number.isFinite(f.centroid.lat)),
    [savedFarms]
  );

  return (
    <div className="space-y-4">
      {/* Search + GPS row */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search town, village, region, or postcode..."
            className="fs-qst-input !pl-10"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="min-h-[42px] px-4 py-2.5 rounded-[14px] text-sm font-semibold bg-[#14B89A] text-[#031F1C] hover:brightness-110 transition cursor-pointer shrink-0 disabled:opacity-50"
        >
          {searching ? 'Searching...' : 'Find Place'}
        </button>
        <button
          type="button"
          onClick={handleUseBrowserGps}
          disabled={gpsLoading}
          className={`min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-[14px] text-sm font-medium fs-qst-option cursor-pointer shrink-0 ${
            isLight
              ? 'text-[#072622]'
              : 'text-[#E9F7F4]'
          }`}
        >
          <Crosshair className="w-4 h-4 text-[#14B89A]" />
          <span>{gpsLoading ? 'Locating...' : 'Use Device GPS'}</span>
        </button>
      </form>

      {searchError && (
        <p className="text-xs text-amber-600 dark:text-amber-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {searchError}
        </p>
      )}
      {gpsStatus && (
        <p className="text-xs text-[#0F766E] dark:text-[#73CAD0] flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 shrink-0" />
          {gpsStatus}
        </p>
      )}

      {/* Ranked geocoder candidates (farmer must select explicitly) */}
      {candidates.length > 0 && (
        <div
          className="fs-qst-subpanel rounded-[16px] p-2.5 max-h-44 overflow-y-auto fs-thin-scroll space-y-1.5"
        >
          <p className="text-[11px] uppercase tracking-wider font-semibold opacity-75 px-1">
            Select matching place ({candidates.length} candidates · {candidates[0]?.provider === 'open_meteo_geocoding' ? 'Open-Meteo Geocoding' : 'OSM Nominatim'})
          </p>
          {candidates.map((c) => {
            const isChosen =
              pendingPin &&
              Math.abs(pendingPin.lat - c.lat) < 0.001 &&
              Math.abs(pendingPin.lon - c.lon) < 0.001;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectCandidate(c)}
                className={`w-full text-left px-3 py-2 rounded-[12px] text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                  isChosen
                    ? 'fs-qst-option-active'
                    : isLight
                      ? 'hover:bg-white/45 border border-transparent'
                      : 'hover:bg-white/[0.08] border border-transparent'
                }`}
              >
                <div>
                  <div className="font-semibold">{c.displayName}</div>
                  <div className="opacity-70">
                    {c.lat.toFixed(4)}°, {c.lon.toFixed(4)}° · TZ {c.timezone}
                    {c.elevationM !== null ? ` · ${c.elevationM} m elev.` : ''}
                  </div>
                </div>
                {isChosen && <Check className="w-4 h-4 text-[#2DD4BF] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Quick reuse from existing saved farms */}
      {farmsWithCoords.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="opacity-70">Saved farm pins:</span>
          {farmsWithCoords.slice(0, 4).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                if (!f.centroid) return;
                setManualLat(String(f.centroid.lat));
                setManualLon(String(f.centroid.lon));
                setManualLabel(`${f.name} (${f.locationLabel})`);
                setPendingPin({
                  lat: f.centroid.lat,
                  lon: f.centroid.lon,
                  label: `${f.name} — ${f.locationLabel}`,
                  timezone: f.timezone || 'UTC',
                  elevationM: f.soil.elevationM ?? null,
                  country: f.country,
                  adminArea: f.regionLabel,
                  method: 'saved_location',
                  precision: 'field_pin',
                });
              }}
              className="fs-qst-subpanel px-2.5 py-1 rounded-[10px] hover:brightness-105 transition cursor-pointer"
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Interactive Pin Map */}
      <div className="rounded-[16px] overflow-hidden border border-[#14B89A]/35 relative">
        <div className="flex items-center justify-between px-3 py-2 text-xs bg-[#041D1A]/85 text-[#D8F3ED] border-b border-teal-400/20">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#2DD4BF]" />
            Click anywhere on the map to place or refine your field pin
          </span>
          <button
            type="button"
            onClick={() => setBaseMap((m) => (m === 'satellite' ? 'street' : 'satellite'))}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-white/10 hover:bg-white/20 transition cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            {baseMap === 'satellite' ? 'Satellite' : 'Street'}
          </button>
        </div>
        <div ref={mapContainerRef} className="w-full h-[250px] sm:h-[280px] z-10" />
      </div>

      {/* Manual coordinates & display label */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div>
          <label className="block text-[11px] font-medium opacity-75 mb-1">Latitude (WGS84)</label>
          <input
            type="number"
            step="0.0001"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
            onBlur={handleApplyManualCoords}
            placeholder="e.g. 44.8602"
            className="fs-qst-input !text-xs font-mono tabular-nums"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium opacity-75 mb-1">Longitude (WGS84)</label>
          <input
            type="number"
            step="0.0001"
            value={manualLon}
            onChange={(e) => setManualLon(e.target.value)}
            onBlur={handleApplyManualCoords}
            placeholder="e.g. -123.1462"
            className="fs-qst-input !text-xs font-mono tabular-nums"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium opacity-75 mb-1">Location Label</label>
          <input
            type="text"
            value={manualLabel}
            onChange={(e) => setManualLabel(e.target.value)}
            placeholder="e.g. North Creek Parcel"
            className="fs-qst-input !text-xs"
          />
        </div>
      </div>

      {coordError && (
        <p className="text-xs text-rose-600 dark:text-rose-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {coordError}
        </p>
      )}

      {/* Explicit confirmation bar */}
      {pendingPin && (
        <div
          className={`rounded-[16px] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            location?.confirmedByUser &&
            Math.abs(location.latitude - pendingPin.lat) < 0.00002 &&
            Math.abs(location.longitude - pendingPin.lon) < 0.00002
              ? 'fs-qst-option-active'
              : 'fs-qst-subpanel'
          }`}
        >
          <div className="text-xs space-y-0.5">
            <div className="font-semibold">
              Pin selected: {manualLabel.trim() || pendingPin.label}
            </div>
            <div className="opacity-80 font-mono tabular-nums">
              {pendingPin.lat.toFixed(5)}°, {pendingPin.lon.toFixed(5)}° · TZ {pendingPin.timezone}
              {pendingPin.elevationM !== null ? ` · ${pendingPin.elevationM} m` : ''}
            </div>
            {pendingPin.precision === 'town_region_context' && (
              <div className="text-amber-700 dark:text-amber-300">
                Note: Selected from town/region geocoder — click map to refine exact field pin if needed.
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-[10px] text-xs font-bold bg-[#14B89A] text-[#031F1C] hover:brightness-110 transition cursor-pointer shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
            {location?.confirmedByUser &&
            Math.abs(location.latitude - pendingPin.lat) < 0.00002 &&
            Math.abs(location.longitude - pendingPin.lon) < 0.00002
              ? 'Location Confirmed'
              : 'Confirm This Location'}
          </button>
        </div>
      )}
    </div>
  );
};

interface BoundaryPolygonProps {
  fieldId: string;
  location: ConfirmedLocationRecord | null;
  geometry: FieldGeometryRecord;
  isLight: boolean;
  onSaveGeometry: (geom: FieldGeometryRecord) => void;
}

export const QuestionBoundaryPicker: React.FC<BoundaryPolygonProps> = ({
  fieldId,
  location,
  geometry,
  isLight,
  onSaveGeometry,
}) => {
  const [vertices, setVertices] = useState<LonLat[]>(() => {
    const ring = geometry.polygon?.coordinates?.[0];
    return ring && ring.length >= 3 ? stripClosingVertex(ring) : [];
  });
  const [undoStack, setUndoStack] = useState<LonLat[][]>([]);
  const [redoStack, setRedoStack] = useState<LonLat[][]>([]);
  const [baseMap, setBaseMap] = useState<'satellite' | 'street'>('satellite');
  const [validating, setValidating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [multiPlotNote, setMultiPlotNote] = useState(geometry.multiplePlotsNote || '');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const drawGroupRef = useRef<L.LayerGroup | null>(null);

  const commitVertices = (next: LonLat[]) => {
    setUndoStack((prev) => [...prev.slice(-20), vertices]);
    setRedoStack([]);
    setVertices(next);
    setServerError(null);
  };

  const liveValidation = useMemo(() => {
    if (vertices.length < 3) {
      return {
        valid: false,
        areaHa: 0,
        error: vertices.length > 0 ? `Add ${3 - vertices.length} more corner(s) to close field polygon.` : null,
      };
    }
    const closed = closeRing(vertices);
    const geom: GeoJsonPolygonGeometry = { type: 'Polygon', coordinates: [closed] };
    const check = validatePolygonGeometry(geom, [], null);
    const err = check.issues.find((i) => i.severity === 'error')?.message ?? null;
    return {
      valid: check.valid,
      areaHa: Number((check.netAreaM2 / 10000).toFixed(2)),
      error: err,
    };
  }, [vertices]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const centerLat = location?.latitude ?? 44.86;
    const centerLon = location?.longitude ?? -123.15;
    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLon],
      zoom: location ? 15 : 4,
      zoomControl: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    drawGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const timer = window.setTimeout(() => map.invalidateSize(), 160);
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    const spec = getBaseMapTileSpec(baseMap);
    tileRef.current = L.tileLayer(spec.url, {
      attribution: spec.attribution,
      maxZoom: spec.maxZoom,
    }).addTo(map);
  }, [baseMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (ev: L.LeafletMouseEvent) => {
      const pt: LonLat = [Number(ev.latlng.lng.toFixed(6)), Number(ev.latlng.lat.toFixed(6))];
      commitVertices([...vertices, pt]);
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [vertices]);

  useEffect(() => {
    const grp = drawGroupRef.current;
    if (!grp) return;
    grp.clearLayers();

    if (location) {
      L.circleMarker([location.latitude, location.longitude], {
        radius: 5,
        color: '#F59E0B',
        fillColor: '#F59E0B',
        fillOpacity: 0.9,
      }).addTo(grp);
    }

    if (vertices.length >= 2) {
      const latLngs = vertices.map(([lon, lat]) => [lat, lon] as [number, number]);
      if (vertices.length >= 3) {
        L.polygon(latLngs, {
          color: liveValidation.valid ? '#2DD4BF' : '#EF4444',
          weight: 2.5,
          fillColor: liveValidation.valid ? '#14B89A' : '#EF4444',
          fillOpacity: 0.25,
        }).addTo(grp);
      } else {
        L.polyline(latLngs, { color: '#2DD4BF', weight: 2, dashArray: '4 4' }).addTo(grp);
      }
    }

    vertices.forEach(([lon, lat], idx) => {
      const marker = L.marker([lat, lon], {
        draggable: true,
        icon: L.divIcon({
          className: 'anchor-vertex-handle',
          html: `<div style="width:12px;height:12px;border-radius:9999px;background:${idx === 0 ? '#F59E0B' : '#FFFFFF'};border:2.5px solid #047857;cursor:grab;"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
      }).addTo(grp);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        const next = vertices.map((v, i) =>
          i === idx ? ([Number(pos.lng.toFixed(6)), Number(pos.lat.toFixed(6))] as LonLat) : v
        );
        commitVertices(next);
      });
    });
  }, [vertices, location, liveValidation.valid]);

  const handleSavePolygon = async () => {
    if (vertices.length < 3) return;
    const closed = closeRing(vertices);
    const poly: GeoJsonPolygonGeometry = { type: 'Polygon', coordinates: [closed] };
    setValidating(true);
    setServerError(null);
    try {
      const res = await validateFieldPolygonApi(fieldId || 'new-field', poly);
      onSaveGeometry({
        geometryStatus: 'polygon_verified',
        polygon: res.normalized,
        geodesicAreaHa: res.areaHa,
        perimeterM: res.perimeterM,
        centroid: res.centroid,
        areaMethod: 'WGS84 Spherical Excess (Chamberlain-Duquette)',
        crs: 'EPSG:4326',
        geometryVersion: geometry.geometryVersion + 1,
        multiplePlotsNote: multiPlotNote.trim() || undefined,
      });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Polygon validation failed.');
    } finally {
      setValidating(false);
    }
  };

  const handleLocationOnly = () => {
    onSaveGeometry({
      geometryStatus: 'location_only',
      polygon: null,
      geodesicAreaHa: null,
      perimeterM: null,
      centroid: computeRingCentroid(closeRing(vertices)),
      areaMethod: null,
      crs: 'EPSG:4326',
      geometryVersion: geometry.geometryVersion + 1,
      multiplePlotsNote: multiPlotNote.trim() || undefined,
    });
  };

  return (
    <div className="space-y-3.5">
      <div className="rounded-[16px] overflow-hidden border border-[#14B89A]/35">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs bg-[#041D1A]/85 text-[#D8F3ED] border-b border-teal-400/20">
          <div className="flex items-center gap-1.5">
            <PenTool className="w-3.5 h-3.5 text-[#2DD4BF]" />
            <span>Click field corners on map ({vertices.length} vertices)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (undoStack.length === 0) return;
                setRedoStack((r) => [...r, vertices]);
                setVertices(undoStack[undoStack.length - 1]);
                setUndoStack((u) => u.slice(0, -1));
              }}
              disabled={undoStack.length === 0}
              className="px-2 py-1 rounded bg-white/10 disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
            >
              <Undo2 className="w-3 h-3" /> Undo
            </button>
            <button
              type="button"
              onClick={() => {
                if (redoStack.length === 0) return;
                setUndoStack((u) => [...u, vertices]);
                setVertices(redoStack[redoStack.length - 1]);
                setRedoStack((r) => r.slice(0, -1));
              }}
              disabled={redoStack.length === 0}
              className="px-2 py-1 rounded bg-white/10 disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
            >
              <Redo2 className="w-3 h-3" /> Redo
            </button>
            <button
              type="button"
              onClick={() => commitVertices([])}
              disabled={vertices.length === 0}
              className="px-2 py-1 rounded bg-white/10 text-rose-300 disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
            <button
              type="button"
              onClick={() => setBaseMap((m) => (m === 'satellite' ? 'street' : 'satellite'))}
              className="px-2 py-1 rounded bg-white/10 cursor-pointer inline-flex items-center gap-1"
            >
              <Layers className="w-3 h-3" /> {baseMap === 'satellite' ? 'Satellite' : 'Street'}
            </button>
          </div>
        </div>
        <div ref={mapContainerRef} className="w-full h-[270px] sm:h-[300px] z-10" />
      </div>

      {liveValidation.error && (
        <p className="text-xs text-amber-600 dark:text-amber-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {liveValidation.error}
        </p>
      )}
      {serverError && (
        <p className="text-xs text-rose-600 dark:text-rose-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {serverError}
        </p>
      )}

      <div>
        <label className="block text-[11px] font-medium opacity-75 mb-1">
          Multiple separate plots note (optional — separate plots should be assessed as distinct fields)
        </label>
        <input
          type="text"
          value={multiPlotNote}
          onChange={(e) => setMultiPlotNote(e.target.value)}
          placeholder="e.g. Assessing main North Bench block only"
          className="fs-qst-input !text-xs"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={handleLocationOnly}
          className={`px-3.5 py-2 rounded-[12px] text-xs font-medium transition cursor-pointer ${
            geometry.geometryStatus === 'location_only'
              ? 'fs-qst-option-active'
              : 'fs-qst-subpanel hover:brightness-105'
          }`}
        >
          I only know the general location (skip polygon)
        </button>

        <div className="flex items-center gap-2.5">
          {liveValidation.valid && (
            <span className="text-xs font-mono font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
              ~{liveValidation.areaHa} ha geodesic
            </span>
          )}
          <button
            type="button"
            disabled={!liveValidation.valid || validating}
            onClick={handleSavePolygon}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-xs font-bold bg-[#14B89A] text-[#031F1C] hover:brightness-110 transition cursor-pointer disabled:opacity-45"
          >
            <Check className="w-3.5 h-3.5" />
            {validating ? 'Validating...' : 'Save Field Polygon'}
          </button>
        </div>
      </div>

      {geometry.geometryStatus === 'polygon_verified' && geometry.geodesicAreaHa !== null && (
        <div className="rounded-[12px] p-3 bg-emerald-500/15 border border-emerald-400/40 text-xs flex items-center justify-between">
          <span>
            Verified field boundary saved: <strong>{geometry.geodesicAreaHa.toFixed(2)} ha</strong> ({geometry.perimeterM} m perimeter, WGS84 spherical excess).
          </span>
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
        </div>
      )}
    </div>
  );
};
