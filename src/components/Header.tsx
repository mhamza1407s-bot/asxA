import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Database,
  Home,
  Info,
  Map as MapIcon,
  Menu,
  Moon,
  Repeat,
  Settings,
  Sprout,
  Sun,
  X,
} from 'lucide-react';
import { FieldShiftLogoLeaf } from './home/FieldShiftIcons';
import { useDisplayPrefs } from '../context/DisplayPrefsContext';
import { ensureSyncedFarmProfiles, HomeFarmAlert } from '../lib/homeFarmEvaluator';
import { getActiveFarmId, setActiveFarmId } from '../lib/farmStorage';

interface HeaderProps {
  theme: 'dark' | 'light';
  onToggleTheme: (e?: React.MouseEvent<HTMLElement>) => void;
  overlay?: boolean;
}

export const AnchorLogo: React.FC<{ className?: string; plantMode?: boolean }> = ({
  className = 'w-7 h-7',
}) => <FieldShiftLogoLeaf className={className} />;

const NAV_ITEMS = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/my-farms', label: 'My Farms', Icon: Sprout },
  { to: '/rotation', label: 'Rotation', Icon: Repeat },
  { to: '/maps', label: 'Maps', Icon: MapIcon },
  { to: '/data', label: 'Data Sources', Icon: Database },
  { to: '/about', label: 'About', Icon: Info },
] as const;

export const Header: React.FC<HeaderProps> = ({ theme, onToggleTheme, overlay = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isLight = theme === 'light';

  const {
    tempUnit,
    setTempUnit,
    windUnit,
    setWindUnit,
    activeAlerts,
    dismissedCount,
    dismissAlert,
    restoreAlerts,
    farmHealthOverridePct,
  } = useDisplayPrefs();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [selectedAlertModal, setSelectedAlertModal] = useState<HomeFarmAlert | null>(null);
  const [farmsSyncTick, setFarmsSyncTick] = useState(0);

  useEffect(() => {
    const bump = () => setFarmsSyncTick((t) => t + 1);
    window.addEventListener('anchor:farms-updated', bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener('anchor:farms-updated', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  const currentFarm = useMemo(() => {
    const farms = ensureSyncedFarmProfiles();
    const activeId = getActiveFarmId();
    return farms.find((f) => f.id === activeId) ?? farms[0];
  }, [location.pathname, profileMenuOpen, notifOpen, farmsSyncTick]);

  const farmLocationText = currentFarm
    ? currentFarm.location.locationLabel ||
      currentFarm.location.regionOrAddress ||
      (currentFarm.location.lat !== null && currentFarm.location.lon !== null
        ? `${currentFarm.location.lat.toFixed(2)}°, ${currentFarm.location.lon.toFixed(2)}°`
        : 'Coordinates not set')
    : 'No active farm';

  const handleOpenWorkspace = (path = '/analyze?mode=farm') => {
    if (currentFarm) {
      setActiveFarmId(currentFarm.id);
    }
    setProfileMenuOpen(false);
    setSelectedAlertModal(null);
    navigate(path);
  };

  return (
    <>
      <div
        className={`no-print fixed top-0 left-0 right-0 z-40 transition-colors duration-300 ${
          overlay
            ? 'pointer-events-none pt-5 sm:pt-6'
            : isLight
              ? 'bg-[#C4E2DC]/92 backdrop-blur-md border-b border-[#79BEB0]/55 py-3'
              : 'bg-[#041513]/92 backdrop-blur-md border-b border-teal-400/[0.14] py-3'
        }`}
      >
        <div
          className={`max-w-[1520px] w-full mx-auto px-5 sm:px-8 lg:px-14 xl:px-[74px]`}
        >
          <header className="relative z-30 pointer-events-auto flex items-center justify-between gap-4">
            {/* Left Brand Wordmark: Leaf Icon + ANCHOR */}
            <Link
              to="/"
              className="inline-flex items-center gap-3 shrink-0 focus:outline-none group"
              aria-label="ANCHOR Home"
            >
              <FieldShiftLogoLeaf className="w-[44px] h-[44px] sm:w-[49px] sm:h-[49px] shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span
                className={`text-[19px] sm:text-[22px] font-extrabold leading-none tracking-[0.9px] uppercase ${
                  isLight ? 'text-[#072622]' : 'text-[#ECF8F5]'
                }`}
              >
                ANCHOR
              </span>
            </Link>

            {/* Center Floating Glass Pill Nav (Identical across all pages) */}
            <nav
              aria-label="Primary navigation"
              className="hidden lg:flex items-center justify-between gap-1 xl:gap-1.5 h-[55px] px-2 rounded-full w-auto shrink-0"
              style={
                isLight
                  ? {
                      background:
                        'linear-gradient(110deg, rgba(212, 240, 234, 0.72), rgba(182, 224, 214, 0.76), rgba(210, 238, 232, 0.72))',
                      border: '1px solid rgba(72, 184, 164, 0.65)',
                      backdropFilter: 'blur(20px) saturate(140%)',
                      WebkitBackdropFilter: 'blur(20px) saturate(140%)',
                      boxShadow:
                        '0 4px 20px rgba(15, 118, 110, 0.12), inset 0 1px 2px rgba(255, 255, 255, 0.78)',
                    }
                  : {
                      background:
                        'linear-gradient(110deg, rgba(4, 38, 35, 0.84), rgba(3, 24, 22, 0.88), rgba(5, 42, 36, 0.82))',
                      border: '1px solid rgba(45, 198, 174, 0.30)',
                      backdropFilter: 'blur(18px) saturate(145%)',
                      WebkitBackdropFilter: 'blur(18px) saturate(145%)',
                      boxShadow:
                        '0 0 16px rgba(20, 184, 154, 0.12), inset 0 1px 1px rgba(176, 244, 232, 0.08)',
                    }
              }
            >
              {NAV_ITEMS.map(({ to, label, Icon }) => {
                const active =
                  to === '/'
                    ? location.pathname === '/'
                    : location.pathname === to || location.pathname.startsWith(`${to}/`);
                if (active) {
                  return (
                    <Link
                      key={to}
                      to={to}
                      className={`relative inline-flex items-center justify-center gap-2 h-[43px] px-4 xl:px-5 rounded-full text-[13.5px] xl:text-[14px] font-medium whitespace-nowrap shrink-0 transition-all ${
                        isLight ? 'text-[#072622]' : 'text-white'
                      }`}
                      style={
                        isLight
                          ? {
                              background:
                                'linear-gradient(120deg, rgba(164, 228, 214, 0.90), rgba(160, 234, 216, 0.82))',
                              border: '1px solid rgba(15, 118, 110, 0.36)',
                              boxShadow:
                                '0 0 13px rgba(15, 148, 132, 0.20), inset 0 1px 2px rgba(255, 255, 255, 0.78)',
                            }
                          : {
                              background:
                                'linear-gradient(135deg, rgba(20, 184, 154, 0.25), rgba(6, 78, 68, 0.36))',
                              border: '1px solid rgba(45, 212, 191, 0.36)',
                              boxShadow:
                                '0 0 15px rgba(20, 184, 154, 0.16), inset 0 1px 2px rgba(176, 244, 232, 0.12)',
                            }
                      }
                    >
                      <Icon
                        className={`w-[19px] h-[19px] ${
                          isLight ? 'text-[#072622]' : 'text-[#E6FAF5]'
                        }`}
                        strokeWidth={2}
                      />
                      <span>{label}</span>
                      <span
                        aria-hidden="true"
                        className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[56%] h-[2px] rounded-full ${
                          isLight ? 'bg-[#0F766E]' : 'bg-[#2DD4BF]'
                        }`}
                        style={{
                          boxShadow: isLight
                            ? '0 0 8px rgba(15, 118, 110, 0.85)'
                            : '0 0 7px #2DD4BF, 0 0 14px rgba(45, 212, 191, 0.75)',
                        }}
                      />
                    </Link>
                  );
                }

                return (
                  <Link
                    key={to}
                    to={to}
                    className={`inline-flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-3.5 h-[43px] rounded-full text-[13.5px] xl:text-[14px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isLight
                        ? 'text-[#0B3630] hover:bg-white/40'
                        : 'text-[#D0ECE6] hover:text-white hover:bg-white/[0.07]'
                    }`}
                  >
                    <Icon
                      className={`w-[18px] h-[18px] ${
                        isLight ? 'text-[#0B3630]' : 'text-[#D0ECE6]'
                      }`}
                      strokeWidth={1.9}
                    />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right Controls: Theme Switch, Settings, Notifications, Profile Avatar, Mobile Menu */}
            <div className="relative flex items-center gap-2.5 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={(e) => onToggleTheme(e)}
                aria-label={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                className={`relative inline-flex items-center justify-center w-[42px] h-[42px] sm:w-[46px] sm:h-[46px] rounded-full transition-all duration-500 cursor-pointer overflow-hidden ${
                  isLight
                    ? 'bg-[rgba(210,240,234,0.70)] hover:bg-[rgba(226,248,243,0.88)] text-[#072622] border border-[rgba(78,188,168,0.65)]'
                    : 'text-[#ECF8F5] hover:bg-[#09433C]/75 border border-[rgba(45,198,174,0.34)] bg-[rgba(5,38,34,0.66)]'
                }`}
                style={{
                  backdropFilter: 'blur(14px)',
                  boxShadow: isLight
                    ? '0 2px 10px rgba(15, 118, 110, 0.12), inset 0 1px 2px rgba(255, 255, 255, 0.78)'
                    : '0 0 12px rgba(20, 184, 154, 0.14), inset 0 1px 1px rgba(176, 244, 232, 0.10)',
                }}
              >
                <Sun
                  className={`w-[20px] h-[20px] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isLight ? 'text-[#072622] rotate-0 scale-100' : 'text-[#ECF8F5] rotate-0 scale-100'
                  }`}
                  strokeWidth={1.9}
                />
                <Moon className="sr-only" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setSettingsOpen((v) => !v);
                  setNotifOpen(false);
                  setProfileMenuOpen(false);
                }}
                aria-label="Open display preferences"
                title="Display Preferences"
                className={`inline-flex items-center justify-center w-[42px] h-[42px] sm:w-[46px] sm:h-[46px] rounded-full transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-[rgba(210,240,234,0.70)] hover:bg-[rgba(226,248,243,0.88)] text-[#072622] border border-[rgba(78,188,168,0.65)]'
                    : 'text-[#ECF8F5] hover:bg-[#09433C]/75 border border-[rgba(45,198,174,0.34)] bg-[rgba(5,38,34,0.66)]'
                }`}
                style={{
                  backdropFilter: 'blur(14px)',
                  boxShadow: isLight
                    ? '0 2px 10px rgba(15, 118, 110, 0.12), inset 0 1px 2px rgba(255, 255, 255, 0.78)'
                    : '0 0 12px rgba(20, 184, 154, 0.14), inset 0 1px 1px rgba(176, 244, 232, 0.10)',
                }}
              >
                <Settings className="w-[19px] h-[19px]" strokeWidth={1.9} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setSettingsOpen(false);
                  setProfileMenuOpen(false);
                }}
                aria-label="View farm notifications"
                className={`relative inline-flex items-center justify-center w-[42px] h-[42px] sm:w-[46px] sm:h-[46px] rounded-full transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-[rgba(210,240,234,0.70)] hover:bg-[rgba(226,248,243,0.88)] text-[#072622] border border-[rgba(78,188,168,0.65)]'
                    : 'text-[#ECF8F5] hover:bg-[#09433C]/75 border border-[rgba(45,198,174,0.34)] bg-[rgba(5,38,34,0.66)]'
                }`}
                style={{
                  backdropFilter: 'blur(14px)',
                  boxShadow: isLight
                    ? '0 2px 10px rgba(15, 118, 110, 0.12), inset 0 1px 2px rgba(255, 255, 255, 0.78)'
                    : '0 0 12px rgba(20, 184, 154, 0.14), inset 0 1px 1px rgba(176, 244, 232, 0.10)',
                }}
              >
                <Bell
                  className={`w-[20px] h-[20px] ${isLight ? 'text-[#072622]' : 'text-[#ECF8F5]'}`}
                  strokeWidth={1.9}
                />
                {activeAlerts.length > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 w-[8px] h-[8px] rounded-full bg-[#1ED6A8] border border-[#04362C]"
                    style={{
                      boxShadow: '0 0 8px rgba(30, 214, 168, 0.90)',
                    }}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((v) => !v);
                  setNotifOpen(false);
                  setSettingsOpen(false);
                }}
                aria-label="Open farm profile menu"
                className="relative w-[44px] h-[44px] sm:w-[46px] sm:h-[46px] rounded-full shrink-0 cursor-pointer transition-transform hover:scale-105 flex items-center justify-center"
                style={
                  isLight
                    ? {
                        background:
                          'linear-gradient(145deg, rgba(202, 236, 228, 0.84), rgba(172, 220, 208, 0.80))',
                        border: '1.5px solid rgba(72, 184, 164, 0.72)',
                        backdropFilter: 'blur(14px)',
                        boxShadow:
                          '0 2px 10px rgba(15, 118, 110, 0.12), inset 0 1px 2px rgba(255, 255, 255, 0.78)',
                      }
                    : {
                        background:
                          'linear-gradient(145deg, rgba(10, 60, 54, 0.86), rgba(4, 34, 30, 0.90))',
                        border: '1.5px solid rgba(45, 212, 191, 0.46)',
                        backdropFilter: 'blur(14px)',
                        boxShadow:
                          '0 4px 14px rgba(0, 12, 10, 0.42), 0 0 14px rgba(20, 184, 154, 0.22)',
                      }
                }
              >
                <span
                  className={`text-[16px] font-semibold leading-none ${
                    isLight ? 'text-[#072622]' : 'text-[#ECF8F5]'
                  }`}
                >
                  B
                </span>
                <span
                  aria-hidden="true"
                  className={`absolute bottom-0.5 right-0.5 w-[9px] h-[9px] rounded-full bg-[#1ED6A8] border-[1.5px] ${
                    isLight ? 'border-[#D0ECE6]' : 'border-[#042822]'
                  }`}
                  style={{
                    boxShadow: '0 0 8px rgba(30, 214, 168, 0.85)',
                  }}
                />
              </button>

              <button
                type="button"
                onClick={() => setMobileNavOpen((v) => !v)}
                aria-label="Toggle navigation menu"
                aria-expanded={mobileNavOpen}
                className={`lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-full cursor-pointer ${
                  isLight ? 'text-[#072622]' : 'text-[#E6FAF5]'
                }`}
                style={{
                  background: isLight ? 'rgba(210, 240, 234, 0.74)' : 'rgba(5, 40, 36, 0.60)',
                  border: isLight
                    ? '1px solid rgba(78, 188, 168, 0.75)'
                    : '1px solid rgba(45, 212, 191, 0.32)',
                  backdropFilter: 'blur(14px)',
                }}
              >
                {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Notifications Popover */}
              {notifOpen && (
                <div className="fs-glass-card absolute right-0 top-[56px] z-40 w-[320px] rounded-[24px] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[13px] font-semibold ${
                        isLight ? 'text-[#072622]' : 'text-[#ECF8F5]'
                      }`}
                    >
                      Active Field Alerts ({activeAlerts.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      aria-label="Close notifications"
                      className={`cursor-pointer ${
                        isLight ? 'text-[#1B4D46] hover:text-[#072622]' : 'text-[#96C7BE] hover:text-white'
                      }`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {activeAlerts.length === 0 ? (
                    <div
                      className={`p-3 rounded-xl text-[12.5px] space-y-2 ${
                        isLight
                          ? 'bg-white/60 border border-[#A6D4CA] text-[#072622]'
                          : 'bg-white/[0.04] border border-white/10 text-[#CBE8E1]'
                      }`}
                    >
                      <p>
                        No active alerts for {currentFarm?.location.farmName || 'this farm'}. All monitored conditions are nominal.
                      </p>
                      {dismissedCount > 0 && currentFarm && (
                      <button
                        type="button"
                        onClick={() => restoreAlerts(currentFarm.id)}
                        className={`text-[11.5px] font-semibold underline cursor-pointer ${
                          isLight ? 'text-[#0F766E]' : 'text-[#2DD4BF]'
                        }`}
                      >
                        Restore {dismissedCount} dismissed
                      </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="max-h-[250px] overflow-y-auto pr-1 space-y-2 fs-thin-scroll">
                        {activeAlerts.map((al) => (
                          <div
                            key={al.id}
                            className={`flex items-start gap-2 p-2.5 rounded-xl transition-colors ${
                                isLight
                                  ? 'bg-white/60 hover:bg-white/85 border border-[#A6D6CC]'
                                  : 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/10'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAlertModal(al);
                                setNotifOpen(false);
                              }}
                              className="flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={`text-[11px] font-semibold ${
                                    al.severity === 'critical'
                                      ? isLight
                                        ? 'text-[#C91D2A]'
                                        : 'text-[#FF555F]'
                                      : isLight
                                        ? 'text-[#B56200]'
                                        : 'text-[#FFA52E]'
                                  }`}
                                >
                                  Alert · {al.source}
                                </span>
                              </div>
                              <div
                                className={`text-[12.5px] mt-0.5 leading-snug ${
                                  isLight ? 'text-[#072622]' : 'text-[#E6F8F4]'
                                }`}
                              >
                                {al.message}
                              </div>
                            </button>
                            {currentFarm && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissAlert(currentFarm.id, al.id);
                                }}
                                aria-label={`Dismiss ${al.source} alert`}
                                title="Dismiss alert"
                                className={`shrink-0 p-1 rounded-full transition-colors cursor-pointer ${
                                  isLight
                                    ? 'text-[#2B5E56] hover:text-[#072622] hover:bg-black/10'
                                    : 'text-[#92C2B8] hover:text-white hover:bg-white/15'
                                }`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {dismissedCount > 0 && currentFarm && (
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => restoreAlerts(currentFarm.id)}
                            className={`text-[11.5px] font-medium hover:underline cursor-pointer ${
                              isLight ? 'text-[#0F766E]' : 'text-[#2DD4BF]'
                            }`}
                          >
                            Restore {dismissedCount} dismissed
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Quick Settings Popover */}
              {settingsOpen && (
                <div className="fs-glass-card absolute right-0 top-[56px] z-40 w-[285px] rounded-[24px] p-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[13px] font-semibold ${
                        isLight ? 'text-[#072622]' : 'text-[#ECF8F5]'
                      }`}
                    >
                      Display Preferences
                    </span>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(false)}
                      className={`cursor-pointer ${
                        isLight ? 'text-[#2B5E56] hover:text-[#072622]' : 'text-[#92C2B8] hover:text-white'
                      }`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Theme Selector */}
                  <div
                    className={`flex items-center justify-between text-[12.5px] ${
                      isLight ? 'text-[#16463F]' : 'text-[#C2E2DC]'
                    }`}
                  >
                    <span>Atmosphere</span>
                    <div
                      className={`inline-flex rounded-lg p-0.5 border ${
                        isLight ? 'bg-white/70 border-[#A6D6CC]' : 'bg-[#041E1A] border-white/10'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          if (!isLight) onToggleTheme(e);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-all duration-300 ${
                          isLight ? 'bg-[#0F766E] text-white' : 'text-[#92C2B8] hover:text-white'
                        }`}
                      >
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          if (isLight) onToggleTheme(e);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-all duration-300 ${
                          !isLight ? 'bg-[#2DD4BF] text-[#031F1C]' : 'text-[#23524A] hover:text-[#072622]'
                        }`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>

                  <div
                    className={`flex items-center justify-between text-[12.5px] ${
                      isLight ? 'text-[#16463F]' : 'text-[#C2E2DC]'
                    }`}
                  >
                    <span>Temperature</span>
                    <div
                      className={`inline-flex rounded-lg p-0.5 border ${
                        isLight ? 'bg-white/70 border-[#A6D6CC]' : 'bg-[#041E1A] border-white/10'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setTempUnit('C')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                          tempUnit === 'C'
                            ? isLight
                              ? 'bg-[#0F766E] text-white'
                              : 'bg-[#2DD4BF] text-[#031F1C]'
                            : isLight
                              ? 'text-[#23524A]'
                              : 'text-[#92C2B8]'
                        }`}
                      >
                        °C
                      </button>
                      <button
                        type="button"
                        onClick={() => setTempUnit('F')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                          tempUnit === 'F'
                            ? isLight
                              ? 'bg-[#0F766E] text-white'
                              : 'bg-[#2DD4BF] text-[#031F1C]'
                            : isLight
                              ? 'text-[#23524A]'
                              : 'text-[#92C2B8]'
                        }`}
                      >
                        °F
                      </button>
                    </div>
                  </div>

                  <div
                    className={`flex items-center justify-between text-[12.5px] ${
                      isLight ? 'text-[#16463F]' : 'text-[#C2E2DC]'
                    }`}
                  >
                    <span>Wind Speed</span>
                    <div
                      className={`inline-flex rounded-lg p-0.5 border ${
                        isLight ? 'bg-white/70 border-[#A6D6CC]' : 'bg-[#041E1A] border-white/10'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setWindUnit('km/h')}
                        className={`px-2 py-1 rounded-md text-xs font-medium cursor-pointer ${
                          windUnit === 'km/h'
                            ? isLight
                              ? 'bg-[#0F766E] text-white'
                              : 'bg-[#2DD4BF] text-[#031F1C]'
                            : isLight
                              ? 'text-[#23524A]'
                              : 'text-[#92C2B8]'
                        }`}
                      >
                        km/h
                      </button>
                      <button
                        type="button"
                        onClick={() => setWindUnit('mph')}
                        className={`px-2 py-1 rounded-md text-xs font-medium cursor-pointer ${
                          windUnit === 'mph'
                            ? isLight
                              ? 'bg-[#0F766E] text-white'
                              : 'bg-[#2DD4BF] text-[#031F1C]'
                            : isLight
                              ? 'text-[#23524A]'
                              : 'text-[#92C2B8]'
                        }`}
                      >
                        mph
                      </button>
                    </div>
                  </div>

                  <div
                    className={`pt-2 border-t flex items-center justify-between text-xs ${
                      isLight ? 'border-[#B4DDD4]' : 'border-white/10'
                    }`}
                  >
                    <Link
                      to="/data"
                      className={`hover:underline ${
                        isLight ? 'text-[#0F766E] font-medium' : 'text-[#2DD4BF]'
                      }`}
                      onClick={() => setSettingsOpen(false)}
                    >
                      NASA Data Sources
                    </Link>
                    <Link
                      to="/about"
                      className={
                        isLight
                          ? 'text-[#1B4D46] hover:text-[#072622]'
                          : 'text-[#92C2B8] hover:text-white'
                      }
                      onClick={() => setSettingsOpen(false)}
                    >
                      About &amp; AI
                    </Link>
                  </div>
                </div>
              )}

              {/* Profile Popover */}
              {profileMenuOpen && (
                <div className="fs-glass-card absolute right-0 top-[56px] z-40 w-[250px] rounded-[24px] p-4 space-y-2.5">
                  <div
                    className={`text-[13px] font-semibold ${
                      isLight ? 'text-[#072622]' : 'text-[#ECF8F5]'
                    }`}
                  >
                    {currentFarm?.location.farmName || 'Active Farm'}
                  </div>
                  <div className={`text-[12px] ${isLight ? 'text-[#1B4D46]' : 'text-[#9AC7BE]'}`}>
                    {farmLocationText}
                    {farmHealthOverridePct !== null ? ` · ${farmHealthOverridePct}% Health` : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenWorkspace('/analyze?mode=farm')}
                    className="w-full mt-1 py-2 px-3 rounded-xl text-xs font-semibold text-[#031F1C] bg-gradient-to-r from-[#5EEAD4] to-[#14B8A6] hover:brightness-105 transition cursor-pointer"
                  >
                    Open Smart Farm Workspace
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* Mobile Glass Navigation Drawer */}
          {mobileNavOpen && (
            <nav
              aria-label="Mobile navigation"
              className="lg:hidden relative z-30 pointer-events-auto mt-3 fs-glass-card rounded-[24px] p-3 grid grid-cols-2 sm:grid-cols-3 gap-2"
            >
              {NAV_ITEMS.map(({ to, label, Icon }) => {
                const active =
                  to === '/'
                    ? location.pathname === '/'
                    : location.pathname === to || location.pathname.startsWith(`${to}/`);
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMobileNavOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl text-xs font-medium ${
                      active
                        ? isLight
                          ? 'bg-[#0F766E]/18 text-[#072622]'
                          : 'bg-[#2DD4BF]/20 text-white'
                        : isLight
                          ? 'text-[#0B3630] hover:bg-white/60'
                          : 'text-[#CCEAE4] hover:bg-white/10'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        active ? (isLight ? 'text-[#0F766E]' : 'text-[#2DD4BF]') : ''
                      }`}
                    />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      {/* Alert Detail Modal (Accessible from Bell icon on any page) */}
      {selectedAlertModal && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm ${
            isLight ? 'bg-[#072622]/45' : 'bg-[#02120F]/75'
          }`}
          onClick={() => setSelectedAlertModal(null)}
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
                      ? selectedAlertModal.severity === 'critical'
                        ? '#C81E2B'
                        : '#B85D00'
                      : selectedAlertModal.severity === 'critical'
                        ? '#FF555F'
                        : '#FFA52E',
                  }}
                />
                <span
                  className="text-sm font-bold"
                  style={{
                    color: isLight
                      ? selectedAlertModal.severity === 'critical'
                        ? '#C81E2B'
                        : '#B85D00'
                      : selectedAlertModal.severity === 'critical'
                        ? '#FF555F'
                        : '#FFA52E',
                  }}
                >
                  {selectedAlertModal.source} Alert
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAlertModal(null)}
                className={`cursor-pointer ${
                  isLight ? 'text-[#2B5E56] hover:text-[#072622]' : 'text-[#92C2B8] hover:text-white'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <h4 className={`text-lg font-semibold ${isLight ? 'text-[#072622]' : 'text-[#ECF8F5]'}`}>
              {selectedAlertModal.message}
            </h4>
            <p className={`text-sm leading-relaxed ${isLight ? 'text-[#18463F]' : 'text-[#C8E4DE]'}`}>
              {selectedAlertModal.recommendation}
            </p>
            <div
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-mono ${
                isLight
                  ? 'bg-white/70 border-[#A6D6CC] text-[#0F766E]'
                  : 'bg-white/[0.05] border-white/10 text-[#5EEAD4]'
              }`}
            >
              {selectedAlertModal.metric}
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSelectedAlertModal(null)}
                className={`px-4 py-2 rounded-full text-xs font-medium cursor-pointer ${
                  isLight ? 'text-[#16463F] hover:bg-white/70' : 'text-[#C8E4DE] hover:bg-white/10'
                }`}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleOpenWorkspace('/analyze?mode=farm')}
                className="px-4 py-2 rounded-full text-xs font-semibold text-[#031F1C] bg-gradient-to-r from-[#5EEAD4] to-[#14B8A6] hover:brightness-110 cursor-pointer"
              >
                Run Full Farm Analysis →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
