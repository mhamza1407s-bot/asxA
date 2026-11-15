import React from 'react';
import { Crosshair, Satellite, X } from 'lucide-react';
import { SatelliteLiveState } from '../../types';
import { formatCoord } from '../../lib/format';
import { DataBadge } from '../DataBadge';

interface SatelliteCardProps {
  satellite: SatelliteLiveState;
  isFollowing: boolean;
  onToggleFollow: () => void;
  onClose: () => void;
}

export const SatelliteCard: React.FC<SatelliteCardProps> = ({
  satellite,
  isFollowing,
  onToggleFollow,
  onClose,
}) => {
  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-[#1B4734] bg-[#081E15]/95 p-4 text-[#E7F7EE] shadow-2xl space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Satellite className="w-4 h-4 text-[#34D399] shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-display font-semibold truncate">{satellite.meta.name}</h3>
            <p className="text-[11px] text-[#98C2AD] truncate">{satellite.meta.agency}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close satellite card"
          className="p-1 text-[#98C2AD] hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-[#0F2D20] border border-[#1B4734] px-3 py-2">
          <div className="text-[10px] text-[#98C2AD]">Altitude</div>
          <div className="font-mono font-semibold tabular-nums">{satellite.altitudeKm} km</div>
        </div>
        <div className="rounded-xl bg-[#0F2D20] border border-[#1B4734] px-3 py-2">
          <div className="text-[10px] text-[#98C2AD]">Orbital Speed</div>
          <div className="font-mono font-semibold tabular-nums">{satellite.velocityKmS} km/s</div>
        </div>
      </div>

      <div className="text-[11px] font-mono tabular-nums text-[#98C2AD]">
        Sub-satellite: {formatCoord(satellite.lat, true)} · {formatCoord(satellite.lon, false)}
      </div>

      <div className="space-y-1.5 text-xs">
        <p className="text-[#98C2AD]">
          <strong className="text-[#E7F7EE]">Measures:</strong> {satellite.meta.measures}
        </p>
        <p className="text-[#34D399]">
          <strong>Anchor Contribution:</strong> {satellite.meta.anchorContribution}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <DataBadge dataset="CelesTrak GP + SGP4" />
        <button
          type="button"
          onClick={onToggleFollow}
          className={`inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            isFollowing
              ? 'bg-[#34D399] text-[#041D12]'
              : 'bg-[#22C57E] text-[#041D12] font-semibold hover:opacity-95'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isFollowing ? 'Following' : 'Follow'}</span>
        </button>
      </div>
    </div>
  );
};
