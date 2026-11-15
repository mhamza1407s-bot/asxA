import { TtlCache, fetchWithTimeout } from '../lib/cache';

export interface HourlyTempPoint {
  hourLabel: string;
  tempC: number;
}

export interface DailyForecastPoint {
  dayLabel: string;
  weatherCode: number;
  maxC: number;
  minC: number;
}

export interface LiveWeatherReading {
  tempC: number;
  tempHighC: number;
  tempLowC: number;
  humidityPct: number;
  humidityDeltaPct: number;
  windKmh: number;
  windDirCompass: string;
  precipMm: number;
  precip24hMm?: number;
  weatherCode: number;
  conditionLabel: string;
  observedAt: string;
  isDay: boolean;
  humiditySeries: number[];
  windSeries: number[];
  hourlyTemps?: HourlyTempPoint[];
  dailyForecast?: DailyForecastPoint[];
}

const weatherCache = new TtlCache<LiveWeatherReading>(10 * 60 * 1000);

function describeWmoCode(code: number): string {
  if (code === 0) return 'Sunny';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 57) return 'Light drizzle';
  if (code >= 61 && code <= 63) return 'Light rain';
  if (code >= 65 && code <= 67) return 'Heavy rain';
  if (code >= 71 && code <= 77) return 'Snowfall';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Partly cloudy';
}

function degreesToCompass(deg: number | undefined): string {
  if (typeof deg !== 'number' || Number.isNaN(deg)) return 'NW';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    is_day?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    relative_humidity_2m?: number[];
    wind_speed_10m?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
  };
}

export async function fetchLiveFarmWeather(
  lat: number,
  lon: number
): Promise<LiveWeatherReading> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = weatherCache.get(key);
  if (cached) return cached;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day` +
    `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=4&timezone=auto`;

  const resp = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 8000);
  if (!resp.ok) {
    throw new Error(`Weather service returned HTTP ${resp.status}`);
  }

  const json = (await resp.json()) as OpenMeteoResponse;
  const cur = json.current;
  if (!cur || typeof cur.temperature_2m !== 'number') {
    throw new Error('Weather service returned incomplete data');
  }

  const tempC = Math.round(cur.temperature_2m);
  const humidityPct = Math.round(cur.relative_humidity_2m ?? 60);
  const windKmh = Math.round(cur.wind_speed_10m ?? 10);

  const rawHumidity = json.hourly?.relative_humidity_2m ?? [];
  const rawWind = json.hourly?.wind_speed_10m ?? [];
  const sampleRealSeries = (arr: unknown): number[] => {
    if (!Array.isArray(arr)) return [];
    const valid = arr.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v)
    );
    if (valid.length < 2) return [];
    if (valid.length <= 9) return valid.map((v) => Math.round(v));
    const step = (valid.length - 1) / 8;
    return Array.from({ length: 9 }, (_, i) => Math.round(valid[Math.round(i * step)]));
  };

  const humiditySeries = sampleRealSeries(rawHumidity.slice(0, 24));
  const windSeries = sampleRealSeries(rawWind.slice(0, 24));
  const humidityDeltaPct =
    humiditySeries.length >= 2
      ? humidityPct - humiditySeries[Math.max(0, humiditySeries.length - 3)]
      : 0;

  // Sample today's 6AM to 8PM (indices 6, 8, 10, 12, 14, 16, 18, 20)
  const rawTemps = json.hourly?.temperature_2m ?? [];
  const targetHours = [
    { idx: 6, label: '6AM' },
    { idx: 8, label: '8AM' },
    { idx: 10, label: '10AM' },
    { idx: 12, label: '12PM' },
    { idx: 14, label: '2PM' },
    { idx: 16, label: '4PM' },
    { idx: 18, label: '6PM' },
    { idx: 20, label: '8PM' },
  ];
  const hourlyTemps: HourlyTempPoint[] = targetHours
    .map((h) => ({
      hourLabel: h.label,
      tempC:
        typeof rawTemps[h.idx] === 'number' && Number.isFinite(rawTemps[h.idx])
          ? Math.round(rawTemps[h.idx])
          : tempC,
    }));

  const dailyTimes = json.daily?.time ?? [];
  const dailyCodes = json.daily?.weather_code ?? [];
  const dailyMax = json.daily?.temperature_2m_max ?? [];
  const dailyMin = json.daily?.temperature_2m_min ?? [];
  const dailyForecast: DailyForecastPoint[] = [1, 2, 3]
    .filter((i) => typeof dailyMax[i] === 'number' && typeof dailyMin[i] === 'number')
    .map((i) => {
      const iso = dailyTimes[i];
      const dt = iso ? new Date(`${iso}T12:00:00`) : new Date(Date.now() + i * 86400000);
      const dayLabel = dt.toLocaleDateString(undefined, { weekday: 'short' });
      return {
        dayLabel,
        weatherCode: dailyCodes[i] ?? 0,
        maxC: Math.round(dailyMax[i]),
        minC: Math.round(dailyMin[i]),
      };
    });

  const maxDaily = dailyMax[0];
  const minDaily = dailyMin[0];
  const precip24h = json.daily?.precipitation_sum?.[0];

  const code = cur.weather_code ?? 2;
  const reading: LiveWeatherReading = {
    tempC,
    tempHighC: typeof maxDaily === 'number' ? Math.round(maxDaily) : tempC + 4,
    tempLowC: typeof minDaily === 'number' ? Math.round(minDaily) : tempC - 7,
    humidityPct,
    humidityDeltaPct,
    windKmh,
    windDirCompass: degreesToCompass(cur.wind_direction_10m),
    precipMm: Number((cur.precipitation ?? 0).toFixed(1)),
    precip24hMm:
      typeof precip24h === 'number' && Number.isFinite(precip24h)
        ? Number(precip24h.toFixed(1))
        : Number((cur.precipitation ?? 0).toFixed(1)),
    weatherCode: code,
    conditionLabel: describeWmoCode(code),
    observedAt: cur.time ?? new Date().toISOString(),
    isDay: cur.is_day === 1,
    humiditySeries,
    windSeries,
    hourlyTemps,
    dailyForecast,
  };

  weatherCache.set(key, reading);
  return reading;
}

export interface ExtendedHourlyPoint {
  timeIso: string;
  hourLabel: string;
  tempC: number | null;
  humidityPct: number | null;
  dewPointC: number | null;
  precipMm: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  windDirDeg: number | null;
  shortwaveWm2: number | null;
  vpdKpa: number | null;
  et0Mm: number | null;
}

export interface ExtendedDailyPoint {
  date: string;
  dayLabel: string;
  isForecast: boolean;
  weatherCode: number;
  conditionLabel: string;
  tMaxC: number | null;
  tMinC: number | null;
  precipSumMm: number | null;
  precipProbMaxPct: number | null;
  windMaxKmh: number | null;
  gustMaxKmh: number | null;
  windDirDeg: number | null;
  solarMjM2: number | null;
  et0FaoMm: number | null;
}

export interface ExtendedFieldWeatherResult {
  lat: number;
  lon: number;
  gridLat: number | null;
  gridLon: number | null;
  elevationM: number | null;
  timezone: string;
  timezoneAbbreviation: string;
  retrievedAt: string;
  providerName: string;
  spatialResolutionNote: string;
  current: {
    time: string | null;
    tempC: number | null;
    apparentTempC: number | null;
    humidityPct: number | null;
    precipMm: number | null;
    windKmh: number | null;
    gustKmh: number | null;
    windDirCompass: string;
    surfacePressureHpa: number | null;
    weatherCode: number;
    conditionLabel: string;
  };
  pastDaily: ExtendedDailyPoint[];
  forecastDaily: ExtendedDailyPoint[];
  next24hHourly: ExtendedHourlyPoint[];
}

const extendedWeatherCache = new TtlCache<ExtendedFieldWeatherResult>(10 * 60 * 1000);

interface OpenMeteoExtendedResponse {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    wind_gusts_10m?: number;
    surface_pressure?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    relative_humidity_2m?: Array<number | null>;
    dew_point_2m?: Array<number | null>;
    precipitation?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    wind_gusts_10m?: Array<number | null>;
    wind_direction_10m?: Array<number | null>;
    shortwave_radiation?: Array<number | null>;
    vapour_pressure_deficit?: Array<number | null>;
    et0_fao_evapotranspiration?: Array<number | null>;
  };
  daily?: {
    time?: string[];
    weather_code?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
    wind_speed_10m_max?: Array<number | null>;
    wind_gusts_10m_max?: Array<number | null>;
    wind_direction_10m_dominant?: Array<number | null>;
    shortwave_radiation_sum?: Array<number | null>;
    et0_fao_evapotranspiration?: Array<number | null>;
  };
}

function cleanNum(v: number | null | undefined, digits = 2): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Number(v.toFixed(digits));
}

export async function fetchFieldExtendedWeather(
  lat: number,
  lon: number
): Promise<ExtendedFieldWeatherResult> {
  const key = `ext:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = extendedWeatherCache.get(key);
  if (cached) return cached;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&past_days=14&forecast_days=7` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure` +
    `&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,shortwave_radiation,vapour_pressure_deficit,et0_fao_evapotranspiration` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,shortwave_radiation_sum,et0_fao_evapotranspiration` +
    `&timezone=auto`;

  const resp = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 10000);
  if (!resp.ok) {
    throw new Error(`Extended weather service returned HTTP ${resp.status}`);
  }

  const json = (await resp.json()) as OpenMeteoExtendedResponse;
  const dailyTimes = json.daily?.time ?? [];
  const currentDateStr = json.current?.time?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  const pastDaily: ExtendedDailyPoint[] = [];
  const forecastDaily: ExtendedDailyPoint[] = [];

  for (let i = 0; i < dailyTimes.length; i++) {
    const date = dailyTimes[i];
    const isForecast = date >= currentDateStr;
    const dt = new Date(`${date}T12:00:00Z`);
    const dayLabel = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    const wmo = json.daily?.weather_code?.[i] ?? 2;
    const pt: ExtendedDailyPoint = {
      date,
      dayLabel,
      isForecast,
      weatherCode: wmo,
      conditionLabel: describeWmoCode(wmo),
      tMaxC: cleanNum(json.daily?.temperature_2m_max?.[i], 1),
      tMinC: cleanNum(json.daily?.temperature_2m_min?.[i], 1),
      precipSumMm: cleanNum(json.daily?.precipitation_sum?.[i], 2),
      precipProbMaxPct: cleanNum(json.daily?.precipitation_probability_max?.[i], 0),
      windMaxKmh: cleanNum(json.daily?.wind_speed_10m_max?.[i], 1),
      gustMaxKmh: cleanNum(json.daily?.wind_gusts_10m_max?.[i], 1),
      windDirDeg: cleanNum(json.daily?.wind_direction_10m_dominant?.[i], 0),
      solarMjM2: cleanNum(json.daily?.shortwave_radiation_sum?.[i], 2),
      et0FaoMm: cleanNum(json.daily?.et0_fao_evapotranspiration?.[i], 2),
    };
    if (isForecast) {
      forecastDaily.push(pt);
    } else {
      pastDaily.push(pt);
    }
  }

  const hTimes = json.hourly?.time ?? [];
  const curTimePrefix = json.current?.time?.slice(0, 13) ?? '';
  let startHourIdx = hTimes.findIndex((t) => t.startsWith(curTimePrefix));
  if (startHourIdx < 0) {
    startHourIdx = Math.max(0, hTimes.findIndex((t) => t >= currentDateStr));
  }
  const next24hHourly: ExtendedHourlyPoint[] = [];
  for (let i = startHourIdx; i < Math.min(hTimes.length, startHourIdx + 24); i++) {
    const t = hTimes[i];
    const hourNum = Number(t.slice(11, 13));
    const hourLabel = Number.isFinite(hourNum)
      ? `${hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum}${hourNum >= 12 ? 'PM' : 'AM'}`
      : t.slice(11, 16);
    next24hHourly.push({
      timeIso: t,
      hourLabel,
      tempC: cleanNum(json.hourly?.temperature_2m?.[i], 1),
      humidityPct: cleanNum(json.hourly?.relative_humidity_2m?.[i], 0),
      dewPointC: cleanNum(json.hourly?.dew_point_2m?.[i], 1),
      precipMm: cleanNum(json.hourly?.precipitation?.[i], 2),
      windKmh: cleanNum(json.hourly?.wind_speed_10m?.[i], 1),
      gustKmh: cleanNum(json.hourly?.wind_gusts_10m?.[i], 1),
      windDirDeg: cleanNum(json.hourly?.wind_direction_10m?.[i], 0),
      shortwaveWm2: cleanNum(json.hourly?.shortwave_radiation?.[i], 0),
      vpdKpa: cleanNum(json.hourly?.vapour_pressure_deficit?.[i], 2),
      et0Mm: cleanNum(json.hourly?.et0_fao_evapotranspiration?.[i], 2),
    });
  }

  const cur = json.current ?? {};
  const curCode = cur.weather_code ?? 2;

  const result: ExtendedFieldWeatherResult = {
    lat: Number(lat.toFixed(4)),
    lon: Number(lon.toFixed(4)),
    gridLat: typeof json.latitude === 'number' ? Number(json.latitude.toFixed(4)) : null,
    gridLon: typeof json.longitude === 'number' ? Number(json.longitude.toFixed(4)) : null,
    elevationM: typeof json.elevation === 'number' ? Math.round(json.elevation) : null,
    timezone: json.timezone ?? 'UTC',
    timezoneAbbreviation: json.timezone_abbreviation ?? 'UTC',
    retrievedAt: new Date().toISOString(),
    providerName: 'Open-Meteo NWP Forecast & Seamless Reanalysis',
    spatialResolutionNote: 'Open-Meteo gridded cell (~9–25 km depending on regional NWP model)',
    current: {
      time: cur.time ?? null,
      tempC: cleanNum(cur.temperature_2m, 1),
      apparentTempC: cleanNum(cur.apparent_temperature, 1),
      humidityPct: cleanNum(cur.relative_humidity_2m, 0),
      precipMm: cleanNum(cur.precipitation, 2),
      windKmh: cleanNum(cur.wind_speed_10m, 1),
      gustKmh: cleanNum(cur.wind_gusts_10m, 1),
      windDirCompass: degreesToCompass(cur.wind_direction_10m),
      surfacePressureHpa: cleanNum(cur.surface_pressure, 1),
      weatherCode: curCode,
      conditionLabel: describeWmoCode(curCode),
    },
    pastDaily,
    forecastDaily,
    next24hHourly,
  };

  extendedWeatherCache.set(key, result);
  return result;
}

