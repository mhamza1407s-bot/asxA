import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { EonetFetchResult, FarmProfile, PowerClimateResult } from '../types';
import { getActiveFarmId, setActiveFarmId } from '../lib/farmStorage';
import { getDefaultTargetDate } from '../lib/format';
import {
  buildRealFarmFields,
  computeRealFarmHealth,
  ensureSyncedFarmProfiles,
  evaluateRealFarmAlerts,
  getWeeklyFarmHealthSlots,
  HomeFarmAlert,
  HomeFieldView,
  HomeHealthBreakdown,
  recordDailyFarmHealth,
} from '../lib/homeFarmEvaluator';
import { fetchLiveFarmWeather, LiveWeatherReading } from '../services/weather';
import { fetchNasaPowerClimatology } from '../services/nasaPower';
import { fetchEonetEvents } from '../services/eonet';
import { fetchMyFarmsPortfolio } from '../services/myFarmsApi';
import { buildAssessedFarmRecord, syncFarmToLocalProfiles } from '../lib/myFarmsEngine';
import { useDisplayPrefs } from '../context/DisplayPrefsContext';
import { MistyCloudTransition } from '../components/home/MistyCloudTransition';
import {
  DarkHeroSection,
  DarkMoonAndOrbitsOverlay,
  LightSunHaloOverlay,
} from '../components/home/DarkHeroSection';
import { Page2Dashboard } from '../components/home/Page2Dashboard';

interface LandingProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const HomeHealthBreakdownList: React.FC<{
  components: HomeHealthBreakdown['components'];
  isLight: boolean;
}> = ({ components, isLight }) => (
  <div className="space-y-3">
    {components.map((c) => {
      const isAssessed = c.score !== null && Number.isFinite(c.score);
      return (
        <div
          key={c.label}
          className={`p-3.5 rounded-2xl border space-y-1.5 ${
            isLight ? 'bg-white/65 border-[#A6D6CC]' : 'bg-white/[0.04] border-white/10'
          }`}
        >
          <div className="flex items-center justify-between text-sm">
            <span className={`font-medium ${isLight ? 'text-[#072622]' : 'text-[#E6FAF5]'}`}>
              {c.label}
            </span>
            <span
              className={`font-mono font-bold tabular-nums ${
                isAssessed
                  ? isLight
                    ? 'text-[#0F766E]'
                    : 'text-[#2DD4BF]'
                  : isLight
                    ? 'text-[#4B6B65]'
                    : 'text-[#89A8A1]'
              }`}
            >
              {isAssessed ? `${c.score}/100` : 'Unassessed'}
            </span>
          </div>
          <div
            className={`h-1.5 rounded-full overflow-hidden ${
              isLight ? 'bg-[#BFE4DC]' : 'bg-white/10'
            }`}
          >
            {isAssessed && (
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#0D9488] to-[#2DD4BF]"
                style={{ width: `${c.score}%` }}
              />
            )}
          </div>
          <p className={`text-xs ${isLight ? 'text-[#1B4D46]' : 'text-[#9AC7BE]'}`}>{c.detail}</p>
        </div>
      );
    })}
  </div>
);

export const Landing: React.FC<LandingProps> = ({ theme }) => {
  const navigate = useNavigate();
  const isLight = theme === 'light';
  const {
    tempUnit,
    windUnit,
    setLiveAlerts,
    dismissAlert,
    dismissedAlertIds,
    refreshDismissedForFarm,
    setFarmHealthOverridePct,
  } = useDisplayPrefs();

  // Real synced farm profiles shared across Home, Header, and My Farms
  const [farms, setFarms] = useState<FarmProfile[]>(() => ensureSyncedFarmProfiles());
  const [selectedFarmId, setSelectedFarmId] = useState<string>(() => {
    const savedActive = getActiveFarmId();
    const list = ensureSyncedFarmProfiles();
    if (savedActive && list.some((f) => f.id === savedActive)) return savedActive;
    return list[0]?.id ?? '';
  });

  useEffect(() => {
    const syncLocal = () => {
      const latest = ensureSyncedFarmProfiles();
      setFarms(latest);
      setSelectedFarmId((prev) =>
        latest.some((f) => f.id === prev) ? prev : latest[0]?.id ?? ''
      );
    };
    window.addEventListener('anchor:farms-updated', syncLocal);
    window.addEventListener('storage', syncLocal);
    return () => {
      window.removeEventListener('anchor:farms-updated', syncLocal);
      window.removeEventListener('storage', syncLocal);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMyFarmsPortfolio()
      .then((portfolio) => {
        if (cancelled || !Array.isArray(portfolio.farms)) return;
        const activeFarms = portfolio.farms.filter((f) => !f.archivedAt);
        for (const rawFarm of activeFarms) {
          const assessed = buildAssessedFarmRecord(
            rawFarm,
            portfolio.fields ?? [],
            portfolio.observations ?? [],
            portfolio.tasks ?? []
          );
          syncFarmToLocalProfiles(assessed);
        }
        if (!cancelled) {
          const latest = ensureSyncedFarmProfiles();
          setFarms(latest);
          setSelectedFarmId((prev) =>
            latest.some((f) => f.id === prev) ? prev : latest[0]?.id ?? ''
          );
        }
      })
      .catch(() => {
        // Offline or server unavailable; continue with local synced profiles
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentFarm = useMemo(
    () => farms.find((f) => f.id === selectedFarmId) ?? farms[0],
    [farms, selectedFarmId]
  );

  // Modals
  const [activeAlert, setActiveAlert] = useState<HomeFarmAlert | null>(null);
  const [activeField, setActiveField] = useState<HomeFieldView | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // Live API Telemetry State (Open-Meteo + NASA POWER + NASA EONET v3)
  const [liveWeather, setLiveWeather] = useState<LiveWeatherReading | null>(null);
  const [powerData, setPowerData] = useState<PowerClimateResult | null>(null);
  const [eonetData, setEonetData] = useState<EonetFetchResult | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const [refreshSpinning, setRefreshSpinning] = useState(false);
  const [ringAnimated, setRingAnimated] = useState(false);

  // Fetch live meteorological & NASA satellite data for the active farm's coordinates
  const loadFarmTelemetry = useCallback(async (farm: FarmProfile) => {
    const lat = farm.location.lat ?? 42.0308;
    const lon = farm.location.lon ?? -93.6319;
    setTelemetryLoading(true);
    setTelemetryError(null);

    const targetDate = getDefaultTargetDate();
    const [weatherRes, powerRes, eonetRes] = await Promise.allSettled([
      fetchLiveFarmWeather(lat, lon),
      fetchNasaPowerClimatology(lat, lon, targetDate, undefined, 'farming'),
      fetchEonetEvents(lat, lon, 300),
    ]);

    if (weatherRes.status === 'fulfilled') {
      setLiveWeather(weatherRes.value);
    } else {
      setLiveWeather(null);
    }

    if (powerRes.status === 'fulfilled') {
      setPowerData(powerRes.value);
    } else {
      setPowerData(null);
    }

    if (eonetRes.status === 'fulfilled') {
      setEonetData(eonetRes.value);
    } else {
      setEonetData(null);
    }

    if (
      weatherRes.status === 'rejected' &&
      powerRes.status === 'rejected' &&
      eonetRes.status === 'rejected'
    ) {
      setTelemetryError('Unable to reach live weather & NASA APIs right now.');
    }

    setLastSyncedAt(Date.now());
    setTelemetryLoading(false);
  }, []);

  useEffect(() => {
    if (!currentFarm) return;
    setActiveFarmId(currentFarm.id);
    loadFarmTelemetry(currentFarm);
  }, [currentFarm, loadFarmTelemetry]);

  useEffect(() => {
    const timer = window.setTimeout(() => setRingAnimated(true), 80);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!currentFarm) return;
    refreshDismissedForFarm(currentFarm.id);
  }, [currentFarm, refreshDismissedForFarm]);

  // Derive real fields, real conditional alerts, and calculated overall farm health
  const realFields = useMemo(
    () => buildRealFarmFields(currentFarm, liveWeather, powerData, eonetData),
    [currentFarm, liveWeather, powerData, eonetData]
  );

  const realAlerts = useMemo(
    () => evaluateRealFarmAlerts(currentFarm, realFields, liveWeather, powerData, eonetData),
    [currentFarm, realFields, liveWeather, powerData, eonetData]
  );

  useEffect(() => {
    if (currentFarm) {
      setLiveAlerts(currentFarm.id, realAlerts);
    }
  }, [currentFarm, realAlerts, setLiveAlerts]);

  const activeAlerts = useMemo(
    () => realAlerts.filter((a) => !dismissedAlertIds.includes(a.id)),
    [realAlerts, dismissedAlertIds]
  );

  const dismissedCount = realAlerts.length - activeAlerts.length;

  const handleDismissAlert = useCallback(
    (alertId: string) => {
      if (!currentFarm) return;
      dismissAlert(currentFarm.id, alertId);
    },
    [currentFarm, dismissAlert]
  );

  const healthBreakdown = useMemo(
    () =>
      computeRealFarmHealth(
        currentFarm,
        realFields,
        liveWeather,
        powerData,
        eonetData,
        realAlerts
      ),
    [currentFarm, realFields, liveWeather, powerData, eonetData, realAlerts]
  );

  // Persist today's real farm health reading for the Weekly Daily Health graph & Header summary
  useEffect(() => {
    if (!currentFarm) return;
    recordDailyFarmHealth(currentFarm.id, healthBreakdown.overallPct);
    setFarmHealthOverridePct(healthBreakdown.overallPct);
  }, [currentFarm, healthBreakdown.overallPct, lastSyncedAt, setFarmHealthOverridePct]);

  const { slots: weeklySlots, deltaVsPrevious } = useMemo(
    () => getWeeklyFarmHealthSlots(currentFarm.id),
    [currentFarm.id, healthBreakdown.overallPct, lastSyncedAt]
  );

  const handleRefreshConditions = async () => {
    setRefreshSpinning(true);
    await loadFarmTelemetry(currentFarm);
    setRefreshSpinning(false);
  };

  const handleOpenWorkspace = (path = '/analyze?mode=farm') => {
    setActiveFarmId(currentFarm.id);
    navigate(path);
  };

  const farmLocationText =
    currentFarm.location.locationLabel ||
    currentFarm.location.regionOrAddress ||
    (currentFarm.location.lat !== null && currentFarm.location.lon !== null
      ? `${currentFarm.location.lat.toFixed(2)}°, ${currentFarm.location.lon.toFixed(2)}°`
      : 'Coordinates not set');

  const scrollToDashboard = useCallback(() => {
    const el = document.getElementById('farm-dashboard');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <div
      className={`relative min-h-screen w-full overflow-x-clip transition-colors duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] selection:bg-[#2DD4BF]/30 ${
        isLight
          ? 'bg-[#C2DFD9] text-[#072622] selection:text-[#04241F]'
          : 'bg-[#041513] text-[#ECF8F5] selection:text-white'
      }`}
      style={{ fontFamily: '"Inter", "Manrope", sans-serif' }}
    >
      {/* ===================================================================== */}
      {/* PAGE 1 HERO SECTION (Scrolls upward naturally with top landscape)     */}
      {/* Dark: image_baca392f | Light: image_1c65eb53                          */}
      {/* ===================================================================== */}
      <div className="relative z-10 min-h-screen flex flex-col overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <img
            src="/assets/aistudio/image_baca392f.png"
            alt=""
            className={`absolute inset-0 w-full h-full object-cover object-center transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isLight ? 'opacity-0 scale-[1.03]' : 'opacity-100 scale-100'
            }`}
          />
          <img
            src="/assets/aistudio/image_1c65eb53.png"
            alt=""
            className={`absolute inset-0 w-full h-full object-cover object-center transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isLight ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03]'
            }`}
          />

          {/* Directional atmospheric scrims matching Night & Daytime specifications */}
          <div
            className="absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              background: isLight
                ? 'linear-gradient(90deg, rgba(212, 240, 234, 0.22) 0%, rgba(206, 236, 230, 0.10) 34%, transparent 66%), linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0%, transparent 50%, rgba(0, 32, 28, 0.12) 100%)'
                : 'linear-gradient(90deg, rgba(3, 18, 16, 0.72) 0%, rgba(4, 24, 22, 0.48) 28%, rgba(4, 28, 24, 0.08) 46%, rgba(3, 20, 18, 0.04) 68%, rgba(3, 18, 16, 0.18) 100%), linear-gradient(180deg, rgba(3, 18, 16, 0.56) 0%, rgba(4, 24, 22, 0.12) 26%, rgba(4, 22, 20, 0.02) 50%, rgba(3, 18, 16, 0.18) 70%, rgba(3, 15, 13, 0.56) 100%)',
            }}
          />

          {/* Celestial bloom & geospatial overlays */}
          {isLight ? <LightSunHaloOverlay /> : <DarkMoonAndOrbitsOverlay />}
        </div>

        <DarkHeroSection
          isLight={isLight}
          onExplorePlatform={() => handleOpenWorkspace('/analyze?mode=farm')}
          onScrollToDashboard={scrollToDashboard}
        />
      </div>

      {/* ===================================================================== */}
      {/* MISTY HYPER-REALISTIC ANIMATED CLOUDY OVERLAY BETWEEN THE 2 SECTIONS  */}
      {/* ===================================================================== */}
      <MistyCloudTransition isLight={isLight} />

      {/* ===================================================================== */}
      {/* PAGE 2 BELOW: Scrolls up to replace Page 1, then stays sticky while   */}
      {/* the cards scroll smoothly over it!                                    */}
      {/* Dark: image_f90e4497 | Light: image_73994810                          */}
      {/* ===================================================================== */}
      <div id="farm-dashboard" className="relative z-10 overflow-x-clip">
        {/* Sticky background layer inside Page 2 container (dual-layer cross-dissolve) */}
        <div
          aria-hidden="true"
          className="sticky top-0 h-screen w-full -mb-[100vh] pointer-events-none z-0 overflow-hidden"
        >
          <img
            src="/assets/aistudio/image_f90e4497.png"
            alt=""
            className={`absolute inset-0 w-full h-full object-cover object-center transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isLight ? 'opacity-0 scale-[1.03]' : 'opacity-100 scale-100'
            }`}
          />
          <img
            src="/assets/aistudio/image_73994810.png"
            alt=""
            className={`absolute inset-0 w-full h-full object-cover object-center brightness-[0.80] contrast-[1.03] saturate-[0.94] transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isLight ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03]'
            }`}
          />
          {/* Soft upper edge feather so Page 2 meets the drifting mist cleanly */}
          <div
            className="absolute inset-x-0 top-0 h-32 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              background: isLight
                ? 'linear-gradient(180deg, rgba(186, 226, 218, 0.52) 0%, rgba(186, 226, 218, 0.18) 55%, rgba(186, 226, 218, 0) 100%)'
                : 'linear-gradient(180deg, rgba(4, 22, 20, 0.72) 0%, rgba(4, 22, 20, 0.28) 55%, rgba(4, 22, 20, 0) 100%)',
            }}
          />
          {/* Subtle readability scrim */}
          <div
            className="absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              background: isLight
                ? 'linear-gradient(180deg, rgba(8, 42, 36, 0.14) 0%, rgba(8, 38, 34, 0.16) 70%, rgba(5, 28, 24, 0.26) 100%)'
                : 'linear-gradient(180deg, rgba(3, 20, 18, 0.16) 0%, rgba(3, 20, 18, 0.28) 65%, rgba(2, 14, 12, 0.50) 100%)',
            }}
          />
        </div>

        {/* Scrolling Three-Panel Luminous Glass Dashboard over sticky Page 2 farm landscape */}
        <Page2Dashboard
          isLight={isLight}
          currentFarm={currentFarm}
          farms={farms}
          onSelectFarm={setSelectedFarmId}
          realFields={realFields}
          activeAlerts={activeAlerts}
          dismissedCount={dismissedCount}
          weeklySlots={weeklySlots}
          deltaVsPrevious={deltaVsPrevious}
          healthBreakdown={healthBreakdown}
          liveWeather={liveWeather}
          telemetryLoading={telemetryLoading}
          telemetryError={telemetryError}
          lastSyncedAt={lastSyncedAt}
          refreshSpinning={refreshSpinning}
          ringAnimated={ringAnimated}
          tempUnit={tempUnit}
          windUnit={windUnit}
          farmLocationText={farmLocationText}
          onRefresh={handleRefreshConditions}
          onOpenBreakdown={() => setBreakdownOpen(true)}
          onSelectAlert={setActiveAlert}
          onDismissAlert={handleDismissAlert}
          onSelectField={setActiveField}
          onViewAllFields={() => handleOpenWorkspace('/my-farms')}
          onOpenWorkspace={() => handleOpenWorkspace('/my-farms')}
        />
      </div>

      {/* HEALTH CALCULATION BREAKDOWN MODAL */}
      {breakdownOpen && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm ${
            isLight ? 'bg-[#072622]/45' : 'bg-[#02120F]/75'
          }`}
          onClick={() => setBreakdownOpen(false)}
        >
          <div
            className="fs-glass-card w-full max-w-lg rounded-[30px] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4
                  className={`text-lg font-semibold ${
                    isLight ? 'text-[#072622]' : 'text-[#ECF8F5]'
                  }`}
                >
                  Farm Health Calculation ({healthBreakdown.overallPct}%)
                </h4>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-[#1B4D46]' : 'text-[#9AC7BE]'}`}>
                  Deterministic score for {currentFarm.location.farmName || 'Active Farm'} · {farmLocationText}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBreakdownOpen(false)}
                className={`cursor-pointer ${
                  isLight ? 'text-[#2B5E56] hover:text-[#072622]' : 'text-[#92C2B8] hover:text-white'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <HomeHealthBreakdownList components={healthBreakdown.components} isLight={isLight} />

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setBreakdownOpen(false)}
                className={`px-4 py-2 rounded-full text-xs font-medium cursor-pointer ${
                  isLight
                    ? 'text-[#16463F] hover:bg-white/70'
                    : 'text-[#C8E4DE] hover:bg-white/10'
                }`}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setBreakdownOpen(false);
                  handleOpenWorkspace('/analyze?mode=farm');
                }}
                className="px-4 py-2 rounded-full text-xs font-semibold text-[#031F1C] bg-gradient-to-r from-[#5EEAD4] to-[#14B8A6] hover:brightness-110 cursor-pointer"
              >
                Open Full Farm Report →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALERT DETAIL MODAL */}
      {activeAlert && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm ${
            isLight ? 'bg-[#072622]/45' : 'bg-[#02120F]/75'
          }`}
          onClick={() => setActiveAlert(null)}
        >
          <div
            className="fs-glass-card w-full max-w-md rounded-[28px] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertTriangle
                  className="w-5 h-5"
                  style={{
                    color: isLight
                      ? activeAlert.severity === 'critical'
                        ? '#C81E2B'
                        : '#B85D00'
                      : activeAlert.severity === 'critical'
                        ? '#FF555F'
                        : '#FFA52E',
                  }}
                />
                <span
                  className="text-sm font-bold"
                  style={{
                    color: isLight
                      ? activeAlert.severity === 'critical'
                        ? '#C81E2B'
                        : '#B85D00'
                      : activeAlert.severity === 'critical'
                        ? '#FF555F'
                        : '#FFA52E',
                  }}
                >
                  {activeAlert.source} Alert
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveAlert(null)}
                className={`cursor-pointer ${
                  isLight ? 'text-[#2B5E56] hover:text-[#072622]' : 'text-[#92C2B8] hover:text-white'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <h4
              className={`text-lg font-semibold ${isLight ? 'text-[#072622]' : 'text-[#ECF8F5]'}`}
            >
              {activeAlert.message}
            </h4>
            <p
              className={`text-sm leading-relaxed ${
                isLight ? 'text-[#18463F]' : 'text-[#C8E4DE]'
              }`}
            >
              {activeAlert.recommendation}
            </p>
            <div
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-mono ${
                isLight
                  ? 'bg-white/70 border-[#A6D6CC] text-[#0F766E]'
                  : 'bg-white/[0.05] border-white/10 text-[#5EEAD4]'
              }`}
            >
              {activeAlert.metric}
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActiveAlert(null)}
                className={`px-4 py-2 rounded-full text-xs font-medium cursor-pointer ${
                  isLight
                    ? 'text-[#16463F] hover:bg-white/70'
                    : 'text-[#C8E4DE] hover:bg-white/10'
                }`}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveAlert(null);
                  handleOpenWorkspace('/analyze?mode=farm');
                }}
                className="px-4 py-2 rounded-full text-xs font-semibold text-[#031F1C] bg-gradient-to-r from-[#5EEAD4] to-[#14B8A6] hover:brightness-110 cursor-pointer"
              >
                Run Full Farm Analysis →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIELD DETAIL MODAL */}
      {activeField && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm ${
            isLight ? 'bg-[#072622]/45' : 'bg-[#02120F]/75'
          }`}
          onClick={() => setActiveField(null)}
        >
          <div
            className="fs-glass-card w-full max-w-md rounded-[28px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-44">
              <img
                src={activeField.image}
                alt={`${activeField.name} ${activeField.cropName}`}
                className="w-full h-full object-cover"
              />
              <div
                className={`absolute inset-0 bg-gradient-to-t via-transparent to-transparent ${
                  isLight ? 'from-[#E2F3EF]' : 'from-[#031D1A]'
                }`}
              />
              <button
                type="button"
                onClick={() => setActiveField(null)}
                aria-label="Close field details"
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4
                    className={`text-xl font-semibold ${
                      isLight ? 'text-[#072622]' : 'text-[#ECF8F5]'
                    }`}
                  >
                    {activeField.name}
                  </h4>
                  <p
                    className={`text-sm font-medium ${
                      isLight ? 'text-[#0F766E]' : 'text-[#2DD4BF]'
                    }`}
                  >
                    {activeField.cropName}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    isLight
                      ? 'bg-[#0F766E]/15 text-[#065F46] border-[#0F766E]/35'
                      : 'bg-[#2DD4BF]/18 text-[#5EEAD4] border-[#2DD4BF]/35'
                  }`}
                >
                  {activeField.rotationLabel}
                </span>
              </div>
              <p
                className={`text-sm leading-relaxed ${
                  isLight ? 'text-[#18463F]' : 'text-[#C8E4DE]'
                }`}
              >
                {activeField.notes}
              </p>
              <div
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs ${
                  isLight
                    ? 'bg-white/70 border-[#A6D6CC]'
                    : 'bg-white/[0.05] border-white/10'
                }`}
              >
                <span className={isLight ? 'text-[#1B4D46]' : 'text-[#9AC7BE]'}>
                  Nitrogen Profile
                </span>
                <span
                  className={`font-mono font-semibold capitalize ${
                    isLight ? 'text-[#047857]' : 'text-[#34D399]'
                  }`}
                >
                  {activeField.nitrogenRole}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveField(null)}
                  className={`px-4 py-2 rounded-full text-xs font-medium cursor-pointer ${
                    isLight
                      ? 'text-[#16463F] hover:bg-white/70'
                      : 'text-[#C8E4DE] hover:bg-white/10'
                  }`}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveField(null);
                    handleOpenWorkspace('/analyze?mode=farm');
                  }}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-[#031F1C] bg-gradient-to-r from-[#5EEAD4] to-[#14B8A6] hover:brightness-110 cursor-pointer"
                >
                  Plan Rotation for {activeField.name} →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
