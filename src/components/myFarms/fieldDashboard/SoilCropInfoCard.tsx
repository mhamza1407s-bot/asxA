import React from 'react';
import { Sprout } from 'lucide-react';
import { FieldIntelligenceViewModel } from './fieldDashboardModel';
import soilLoamProfileImg from '../../../assets/images/soil_loam_profile_1794731996141.jpg';

interface SoilCropInfoCardProps {
  model: FieldIntelligenceViewModel;
  onViewDetails: () => void;
}

export const SoilCropInfoCard: React.FC<SoilCropInfoCardProps> = ({
  model,
  onViewDetails,
}) => {
  const { soil } = model;

  return (
    <section
      aria-label="Soil & Crop Information"
      onClick={onViewDetails}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onViewDetails();
        }
      }}
      className="relative rounded-[19px] border border-emerald-700/20 dark:border-[#78CC92]/26 bg-white/75 dark:bg-[#05281A]/72 backdrop-blur-xl shadow-[0_10px_28px_rgba(4,40,26,0.10)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_10px_28px_rgba(0,0,0,0.28)] px-4 py-3 xl:px-5 xl:py-3.5 flex flex-col justify-between gap-2 transition-all cursor-pointer hover:border-emerald-500/50 dark:hover:border-[#35ED91]/55"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-emerald-900/10 dark:border-[#9FD3B8]/16">
        <div className="flex items-center gap-2 min-w-0">
          <Sprout className="w-4.5 h-4.5 text-emerald-600 dark:text-[#13D66B] shrink-0" />
          <h3 className="text-[16px] xl:text-[17.5px] font-bold text-[#05291B] dark:text-white tracking-tight truncate">
            Soil &amp; Crop Information
          </h3>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails();
          }}
          className="text-[12.5px] font-semibold text-emerald-700 dark:text-[#35ED91] hover:underline cursor-pointer whitespace-nowrap"
        >
          View Details →
        </button>
      </div>

      {/* Body: Soil Profile Photo + 2 Spec Columns */}
      <div className="flex flex-col sm:flex-row items-stretch gap-3.5 flex-1">
        <div className="w-full sm:w-[100px] xl:w-[118px] h-[140px] sm:h-auto sm:min-h-[156px] rounded-[12px] overflow-hidden shrink-0 border border-emerald-900/15 dark:border-[#78CC92]/25 shadow-inner">
          <img
            src={soilLoamProfileImg}
            alt="Vertical soil profile cross-section"
            className="w-full h-full object-cover object-center"
          />
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3.5 items-stretch">
          {/* Column 1 */}
          <div className="flex flex-col justify-between py-0.5 space-y-1.5">
            <div>
              <div className="text-[11.5px] text-[#2A5E49] dark:text-[#8EA99A]">Soil Texture</div>
              <div className="text-[14px] xl:text-[15px] font-bold text-[#05291B] dark:text-[#F1F7F3] leading-tight">
                {soil.texture}
                <span className="block text-[10px] font-normal text-[#3C6D59] dark:text-[#8EA99A]">
                  {soil.textureProvenance}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[11.5px] text-[#2A5E49] dark:text-[#8EA99A]">pH</div>
              <div className="text-[14px] xl:text-[15px] font-bold text-[#05291B] dark:text-[#F1F7F3] tabular-nums leading-tight">
                {soil.phLabel}
                <span className="block text-[10px] font-normal text-[#3C6D59] dark:text-[#8EA99A]">
                  {soil.phProvenance}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[11.5px] text-[#2A5E49] dark:text-[#8EA99A]">Organic Matter</div>
              <div className="text-[14px] xl:text-[15px] font-bold text-[#05291B] dark:text-[#F1F7F3] tabular-nums">
                {soil.organicMatterLabel}
              </div>
            </div>
            <div>
              <div className="text-[11.5px] text-[#2A5E49] dark:text-[#8EA99A]">Available Water</div>
              <div className="text-[14px] xl:text-[15px] font-bold text-[#05291B] dark:text-[#F1F7F3] tabular-nums">
                {soil.availableWaterMm !== null && Number.isFinite(soil.availableWaterMm)
                  ? `${soil.availableWaterMm} mm`
                  : 'Unavailable'}
              </div>
            </div>
          </div>

          {/* Column 2 */}
          <div className="border-l border-emerald-900/12 dark:border-[#9FD3B8]/18 pl-3.5 flex flex-col justify-center gap-4">
            <div>
              <div className="text-[11.5px] xl:text-[12px] leading-snug text-[#2A5E49] dark:text-[#C3D3C8]">
                Crop Water Coefficient (Kc)
              </div>
              <div className="mt-1 text-[21px] xl:text-[24px] font-bold text-[#05291B] dark:text-white tabular-nums leading-none">
                {soil.kc.toFixed(2)}
              </div>
            </div>

            <div>
              <div className="text-[11.5px] xl:text-[12px] leading-snug text-[#2A5E49] dark:text-[#C3D3C8]">
                Total Available Water (TAW)
              </div>
              <div className="mt-1 text-[16px] xl:text-[18px] font-bold text-[#05291B] dark:text-white tabular-nums leading-none">
                {soil.tawMm !== null && Number.isFinite(soil.tawMm)
                  ? `${soil.tawMm} mm`
                  : 'Unavailable'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
