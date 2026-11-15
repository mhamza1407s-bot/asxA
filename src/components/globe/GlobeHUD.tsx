import React, { useEffect, useState } from 'react';

interface GlobeHUDProps {
  satCount: number;
  eventCount: number;
  isFallbackTle: boolean;
  timeScale: number;
  onChangeTimeScale: (scale: number) => void;
  showIssGroundTrack: boolean;
  onToggleIssTrack: () => void;
}

export const GlobeHUD: React.FC<GlobeHUDProps> = ({
  satCount,
  eventCount,
  isFallbackTle,
  timeScale,
  onChangeTimeScale,
  showIssGroundTrack,
  onToggleIssTrack,
}) => {
  const [utcTime, setUtcTime] = useState(() => new Date().toISOString().slice(11, 19));

  useEffect(() => {
    const id = window.setInterval(() => {
      setUtcTime(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-auto rounded-xl border border-[#1B4734] bg-[#081E15]/88 px-3.5 py-2.5 text-[11px] font-mono text-[#E7F7EE] space-y-2 shadow-lg max-w-xs">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 tabular-nums">
        <span className="text-[#34D399]">UTC {utcTime}</span>
        <span aria-hidden="true" className="text-[#98C2AD]">·</span>
        <span>{satCount} satellites</span>
        <span aria-hidden="true" className="text-[#98C2AD]">·</span>
        <span>{eventCount} events</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[#98C2AD]">Orbit speed:</span>
        {[1, 60, 600].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChangeTimeScale(s)}
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
              timeScale === s
                ? 'bg-[#22C57E] text-[#041D12] font-semibold'
                : 'bg-[#0F2D20] text-[#98C2AD] hover:text-white'
            }`}
          >
            {s}×
          </button>
        ))}

        <button
          type="button"
          onClick={onToggleIssTrack}
          className={`px-2 py-0.5 rounded text-[11px] font-sans transition-colors cursor-pointer ${
            showIssGroundTrack
              ? 'bg-[#F5B83D] text-[#041D12] font-semibold'
              : 'bg-[#0F2D20] text-[#98C2AD] hover:text-white'
          }`}
        >
          ISS track
        </button>
      </div>

      {isFallbackTle && (
        <div className="text-[10px] text-[#F5B83D]">
          Positions approximate (offline TLE catalog)
        </div>
      )}
    </div>
  );
};
