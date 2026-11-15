export interface ResolvedUserLocation {
  lat: number;
  lon: number;
  source: 'gps' | 'ip';
  city?: string;
  region?: string;
  country?: string;
}

function getBrowserGpsPosition(timeoutMs = 4500): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Browser geolocation is not supported.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: timeoutMs,
      maximumAge: 60_000,
    });
  });
}

async function fetchIpLocationFromUrl(
  url: string,
  parse: (data: Record<string, unknown>) => ResolvedUserLocation | null,
  timeoutMs = 4000
): Promise<ResolvedUserLocation | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as Record<string, unknown>;
    return parse(json);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Resolves the user's current coordinates via browser GPS first, and falls back
 * to approximate IP geolocation when GPS is blocked/unavailable (e.g., in embedded iframes).
 */
export async function resolveUserLocation(): Promise<ResolvedUserLocation> {
  try {
    const pos = await getBrowserGpsPosition(4500);
    const lat = Number(pos.coords.latitude.toFixed(5));
    const lon = Number(pos.coords.longitude.toFixed(5));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon, source: 'gps' };
    }
  } catch {
    // Fall through to IP-based location fallback
  }

  // 1. Direct client IP lookup via ipwho.is (uses browser's public IP directly)
  const ipWho = await fetchIpLocationFromUrl('https://ipwho.is/', (d) => {
    if (d.success === false) return null;
    const lat = Number(d.latitude);
    const lon = Number(d.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      source: 'ip',
      city: typeof d.city === 'string' ? d.city : undefined,
      region: typeof d.region === 'string' ? d.region : undefined,
      country: typeof d.country === 'string' ? d.country : undefined,
    };
  });
  if (ipWho) return ipWho;

  // 2. Direct client IP backup via GeoJS
  const geoJs = await fetchIpLocationFromUrl('https://get.geojs.io/v1/ip/geo.json', (d) => {
    const lat = Number(d.latitude);
    const lon = Number(d.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      source: 'ip',
      city: typeof d.city === 'string' ? d.city : undefined,
      region: typeof d.region === 'string' ? d.region : undefined,
      country: typeof d.country === 'string' ? d.country : undefined,
    };
  });
  if (geoJs) return geoJs;

  // 3. Server-side forwarded-IP fallback
  const serverGeo = await fetchIpLocationFromUrl('/api/geolocate', (d) => {
    const lat = Number(d.lat);
    const lon = Number(d.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      source: 'ip',
      city: typeof d.city === 'string' ? d.city : undefined,
      region: typeof d.region === 'string' ? d.region : undefined,
      country: typeof d.country === 'string' ? d.country : undefined,
    };
  });
  if (serverGeo) return serverGeo;

  throw new Error('Location permission denied and approximate lookup is unavailable.');
}
