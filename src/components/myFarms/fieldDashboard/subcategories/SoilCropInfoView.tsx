import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  FlaskConical,
  Layers,
  Mountain,
  Sprout,
} from 'lucide-react';
import { MyFarmRecord, PortfolioFieldRecord } from '../../../../types/myFarms';
import { SoilMoistureStatus, SoilPhStatus, SoilTexture } from '../../../../types/farm';
import { FieldAgronomyBundle, InspectableMetric } from '../../../../lib/fieldAgronomyEngine';
import { resolveCropThumbnail } from '../../../../lib/myFarmsEngine';
import {
  formatSoilMoistureUnitLabel,
  resolveEffectiveFieldSoil,
} from '../../../../lib/soilProvenance';
import rootZoneImg from '../../../../assets/images/soil_root_zone_cross_section_1794737932428.jpg';
import {
  DataQualityCard,
  FullReportModal,
  HeroStatusCard,
  IntelligenceCard,
  IntelligenceHeader,
  IntelligenceInset,
  QuickActionsCard,
  ReportingPeriodKey,
  SectionHeading,
  formatSubDate,
  formatSubDateRange,
  formatSubDateTime,
} from './IntelligenceShell';
import {
  ComparisonLineSvgChart,
  SmoothLineSvgChart,
  StackedBarSvgChart,
} from './IntelligenceCharts';
import { DisclosureMode } from './SubCategoryHeaderBar';

interface SoilCropInfoViewProps {
  farm: MyFarmRecord;
  fields?: PortfolioFieldRecord[];
  selectedField: PortfolioFieldRecord | null;
  onSelectField?: (fieldId: string) => void;
  bundle: FieldAgronomyBundle;
  areaLabel: string;
  disclosureMode: DisclosureMode;
  onChangeDisclosureMode: (m: DisclosureMode) => void;
  onInspectMetric: (metric: InspectableMetric) => void;
  onPatchField: (fieldId: string, patch: Record<string, unknown>) => Promise<void>;
  onOpenSoilDrawer: () => void;
  onRefresh?: () => void;
  refreshLoading?: boolean;
  isOnline?: boolean;
}

export const SoilCropInfoView: React.FC<SoilCropInfoViewProps> = ({
  farm,
  fields = [],
  selectedField,
  onSelectField,
  bundle,
  disclosureMode,
  onInspectMetric,
  onPatchField,
  onOpenSoilDrawer,
  onRefresh,
  refreshLoading = false,
  isOnline = true,
}) => {
  const { soil, crop, phenology, water, nutrients, metricsById, reports, timestamps } = bundle;
  const [period, setPeriod] = useState<ReportingPeriodKey>('14d');
  const [editingFieldSoil, setEditingFieldSoil] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [compareView, setCompareView] = useState<'roots' | 'kc'>('roots');

  const effectiveSoil = useMemo(
    () => resolveEffectiveFieldSoil(farm.soil, selectedField?.soilOverrides),
    [farm.soil, selectedField?.soilOverrides]
  );

  const [texInput, setTexInput] = useState<SoilTexture>(effectiveSoil.texture);
  const [phStatusInput, setPhStatusInput] = useState<SoilPhStatus>(effectiveSoil.phStatus);
  const [phValInput, setPhValInput] = useState<string>(
    effectiveSoil.phValue !== null ? String(effectiveSoil.phValue) : ''
  );
  const [moistStatusInput, setMoistStatusInput] = useState<SoilMoistureStatus>(
    effectiveSoil.moistureStatus
  );
  const [moistValInput, setMoistValInput] = useState<string>(
    effectiveSoil.moisturePct !== null ? String(effectiveSoil.moisturePct) : ''
  );

  useEffect(() => {
    setTexInput(effectiveSoil.texture);
    setPhStatusInput(effectiveSoil.phStatus);
    setPhValInput(effectiveSoil.phValue !== null ? String(effectiveSoil.phValue) : '');
    setMoistStatusInput(effectiveSoil.moistureStatus);
    setMoistValInput(
      effectiveSoil.moisturePct !== null ? String(effectiveSoil.moisturePct) : ''
    );
    setEditingFieldSoil(false);
  }, [bundle.fieldId, selectedField?.updatedAt, farm.updatedAt, effectiveSoil]);

  const d1 = crop.stageDays.ini;
  const d2 = d1 + crop.stageDays.dev;
  const d3 = d2 + crop.stageDays.mid;
  const d4 = d3 + crop.stageDays.late;

  const kcCurvePoints = useMemo(
    () => [
      { label: 'Day 0', value: crop.kcIni, secondary: crop.kcbIni },
      { label: `Day ${d1}`, value: crop.kcIni, secondary: crop.kcbIni },
      {
        label: `Day ${Math.round((d1 + d2) / 2)}`,
        value: Number(((crop.kcIni + crop.kcMid) / 2).toFixed(2)),
        secondary: Number(((crop.kcbIni + crop.kcbMid) / 2).toFixed(2)),
      },
      { label: `Day ${d2}`, value: crop.kcMid, secondary: crop.kcbMid },
      { label: `Day ${d3}`, value: crop.kcMid, secondary: crop.kcbMid },
      { label: `Day ${d4}`, value: crop.kcEnd, secondary: crop.kcbEnd },
    ],
    [crop, d1, d2, d3, d4]
  );

  const soilRetentionBars = useMemo(() => {
    if (
      soil.wpVwcPct === null ||
      soil.fcVwcPct === null ||
      water.estimatedMoistureVwcPct === null
    ) {
      return [];
    }
    return [
      {
        label: 'WP',
        base: soil.wpVwcPct,
        mid: 0,
        top: 0,
      },
      {
        label: 'Current',
        base: Math.min(soil.wpVwcPct, water.estimatedMoistureVwcPct),
        mid: Math.max(0, water.estimatedMoistureVwcPct - soil.wpVwcPct),
        top: 0,
      },
      {
        label: 'FC',
        base: soil.wpVwcPct,
        mid: Math.max(0, water.estimatedMoistureVwcPct - soil.wpVwcPct),
        top: Math.max(0, soil.fcVwcPct - Math.max(soil.wpVwcPct, water.estimatedMoistureVwcPct)),
      },
    ];
  }, [soil.wpVwcPct, soil.fcVwcPct, water.estimatedMoistureVwcPct]);

  const rootGrowthComparison = useMemo(() => {
    const zMin = Math.round(crop.zrMinM * 100);
    const zMax = Math.round(crop.zrMaxM * 100);
    const zMid = Math.round((zMin + zMax) * 0.62);
    const stages = [
      { label: 'Plant', current: zMin, baseline: zMax },
      { label: 'Dev', current: zMid, baseline: zMax },
      { label: 'Mid', current: zMax, baseline: zMax },
      { label: 'Late', current: zMax, baseline: zMax },
    ];
    if (compareView === 'kc') {
      return [
        { label: 'Ini', current: Number((crop.kcIni * 100).toFixed(0)), baseline: Number((crop.kcbIni * 100).toFixed(0)) },
        { label: 'Dev', current: Number((((crop.kcIni + crop.kcMid) * 50)).toFixed(0)), baseline: Number((((crop.kcbIni + crop.kcbMid) * 50)).toFixed(0)) },
        { label: 'Mid', current: Number((crop.kcMid * 100).toFixed(0)), baseline: Number((crop.kcbMid * 100).toFixed(0)) },
        { label: 'Late', current: Number((crop.kcEnd * 100).toFixed(0)), baseline: Number((crop.kcbEnd * 100).toFixed(0)) },
      ];
    }
    return stages;
  }, [crop, compareView]);

  const soilUpdatedLabel = formatSubDateTime(timestamps.soilUpdatedAt);
  const soilUpdatedDate = formatSubDate(timestamps.soilUpdatedAt);
  const phDateLabel = effectiveSoil.phTestDate
    ? formatSubDate(effectiveSoil.phTestDate)
    : timestamps.phTestDate
      ? formatSubDate(timestamps.phTestDate)
      : soil.phValue !== null
        ? soilUpdatedDate
        : 'Not tested';
  const nasaDateLabel = formatSubDate(timestamps.nasaLatestDate ?? timestamps.nasaPowerFetchedAt);
  const weatherDateLabel = formatSubDate(
    timestamps.weatherObservedAt ?? timestamps.weatherFetchedAt
  );
  const moistureAsOfDate =
    water.observedMoistureDate
      ? formatSubDate(water.observedMoistureDate)
      : weatherDateLabel !== 'Pending sync'
        ? weatherDateLabel
        : soilUpdatedDate;
  const pastWindowLabel = formatSubDateRange(timestamps.pastWindowStart, timestamps.pastWindowEnd);
  const totalCycleDays =
    crop.stageDays.ini + crop.stageDays.dev + crop.stageDays.mid + crop.stageDays.late;
  const plantedWindowLabel = `Planted ${phenology.plantingDateLabel} · Day ~${phenology.daysElapsedEst}/${totalCycleDays}`;

  const textureProvenanceLabel =
    effectiveSoil.textureSource === 'farm'
      ? 'Inherited from farm'
      : effectiveSoil.textureSource === 'field'
        ? 'Field override'
        : effectiveSoil.textureSource === 'field_suppressed'
          ? 'Field override (Unknown)'
          : 'Unavailable';

  const evidenceRows = useMemo(
    () => [
      {
        property: 'Soil Texture',
        value: soil.texture,
        evidence: textureProvenanceLabel,
        recorded: soil.texture !== 'Unknown' ? soilUpdatedDate : 'Not set',
        status:
          soil.sandPct !== null
            ? `${soil.sandPct}%S · ${soil.siltPct}%Si · ${soil.clayPct}%C`
            : 'Unconfirmed',
      },
      {
        property: 'FC / WP Retention',
        value:
          soil.fcVwcPct !== null && soil.wpVwcPct !== null
            ? `${soil.fcVwcPct}% / ${soil.wpVwcPct}%`
            : 'Unavailable',
        evidence: soil.fcWpSource,
        recorded: soil.fcVwcPct !== null ? soilUpdatedDate : 'Texture required',
        status: water.tawMm !== null ? `TAW ${water.tawMm} mm` : 'Unavailable',
      },
      {
        property: 'Soil pH (0–20 cm)',
        value: soil.phValue !== null ? soil.phValue.toFixed(1) : 'Not tested',
        evidence: effectiveSoil.phProvenanceLabel,
        recorded: phDateLabel,
        status: `Target ${crop.optimalPh[0]}–${crop.optimalPh[1]}`,
      },
      {
        property: 'Organic Matter',
        value: soil.organicMatterPct !== null ? `${soil.organicMatterPct}%` : 'Not measured',
        evidence: soil.organicSource,
        recorded: soil.organicMatterPct !== null ? soilUpdatedDate : 'Not logged',
        status: soil.organicCarbonPct !== null ? `OC ${soil.organicCarbonPct}%` : 'Add core',
      },
      {
        property: 'DEM Slope / Elev.',
        value: soil.elevationM !== null ? `${Math.round(soil.elevationM)} m` : 'Unavailable',
        evidence: soil.elevationM !== null ? 'Mapped' : 'Unavailable',
        recorded: soil.elevationM !== null ? soilUpdatedDate : 'Pending',
        status: `${soil.slopePct !== null ? `${soil.slopePct.toFixed(1)}% · ` : ''}${soil.drainage}`,
      },
      {
        property: 'Available N / P / K',
        value: soil.hasFullLabNpk ? 'Tested' : 'Not measured',
        evidence: soil.hasFullLabNpk ? 'Lab-measured' : 'Unavailable',
        recorded: soil.hasFullLabNpk ? phDateLabel : 'Not tested',
        status: soil.hasFullLabNpk ? 'Calibrated' : 'Rates gated',
      },
    ],
    [
      soil,
      water.tawMm,
      crop.optimalPh,
      soilUpdatedDate,
      phDateLabel,
      textureProvenanceLabel,
      effectiveSoil.phProvenanceLabel,
    ]
  );

  const stageTimeline = [
    { name: 'Initial', range: `${d1}d · Kc ${crop.kcIni.toFixed(2)}`, active: phenology.stageFao === 'Initial' },
    { name: 'Development', range: `${crop.stageDays.dev}d · Kc↑`, active: phenology.stageFao === 'Crop development' },
    { name: 'Mid-Season', range: `${crop.stageDays.mid}d · Kc ${crop.kcMid.toFixed(2)}`, active: phenology.stageFao === 'Mid-season' },
    { name: 'Late Season', range: `${crop.stageDays.late}d · Kc ${crop.kcEnd.toFixed(2)}`, active: phenology.stageFao === 'Late season' },
  ];

  const handleSaveFieldSoil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedField) {
      onOpenSoilDrawer();
      return;
    }
    setSaving(true);
    try {
      const existingOverrides = selectedField.soilOverrides ?? {};
      const parsedPh =
        phStatusInput === 'tested' && phValInput.trim() !== '' ? Number(phValInput) : null;
      const parsedMoisture =
        moistStatusInput !== 'unknown' && moistValInput.trim() !== ''
          ? Number(moistValInput)
          : null;
      await onPatchField(selectedField.id, {
        soilOverrides: {
          ...existingOverrides,
          texture: texInput,
          phStatus: phStatusInput,
          phValue: parsedPh !== null && Number.isFinite(parsedPh) ? parsedPh : null,
          ...(phStatusInput === 'not_tested' ? { phTestDate: '' } : {}),
          moistureStatus: moistStatusInput,
          moisturePct:
            parsedMoisture !== null && Number.isFinite(parsedMoisture) ? parsedMoisture : null,
          ...(moistStatusInput === 'unknown'
            ? {
                moistureUnit: 'unspecified',
                moistureDepth: '',
                moistureMethod: '',
                moistureDate: '',
              }
            : {}),
        },
      });
      setEditingFieldSoil(false);
    } finally {
      setSaving(false);
    }
  };

  const rootDepthCm = Math.round(phenology.currentZrM * 100);
  const phAligned =
    soil.phValue !== null && soil.phValue >= crop.optimalPh[0] && soil.phValue <= crop.optimalPh[1];
  const cropImg = resolveCropThumbnail(selectedField?.cropId || crop.commonName);

  return (
    <div className="space-y-3.5 w-full">
      <IntelligenceHeader
        icon={
          <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#35EC99] via-[#12B886] to-[#087F5B] flex items-center justify-center shadow-[0_4px_14px_rgba(19,217,135,0.35)]">
            <Sprout className="w-5.5 h-5.5 text-white" />
          </div>
        }
        title="Soil & Crop Intelligence"
        subtitle="Inspect root-zone physical properties, crop coefficient (Kc) progression, and strictly gated NPK nutrient readiness."
        fieldDisplayName={bundle.fieldDisplayName}
        cropName={crop.commonName}
        stageLabel={phenology.stageFao}
        dateWindowLabel={plantedWindowLabel}
        fields={fields}
        selectedFieldId={selectedField?.id ?? null}
        onSelectField={onSelectField}
        period={period}
        onChangePeriod={setPeriod}
        updatedLabel={soilUpdatedLabel}
        onRefresh={onRefresh}
        refreshLoading={refreshLoading}
        isOnline={isOnline}
      />

      {/* Hero Card: Soil & Crop Status at a Glance */}
      <HeroStatusCard
        imageSrc={cropImg}
        imageAlt={crop.commonName}
        imageTitle={crop.commonName}
        imageSubtitle={`${crop.scientificName} · Updated ${soilUpdatedDate}`}
        heading="Soil & Crop Status at a Glance"
        description={
          reports.soilCropSummary[0] ||
          `As of ${soilUpdatedDate}, field soil is classified as ${soil.texture} (${soil.textureSource}) with a ${rootDepthCm} cm active root zone. ${crop.commonName} is in ${phenology.stageFao} (Kc ${phenology.currentKc.toFixed(2)}); fertilizer prescriptions remain safely gated pending 0–20 cm lab chemistry.`
        }
        statusTone={soil.hasFullLabNpk && phAligned ? 'good' : 'warning'}
        statusText={
          soil.hasFullLabNpk
            ? 'Lab soil & crop targets calibrated'
            : 'Lab 0–20 cm NPK test required'
        }
        metrics={[
          {
            id: 'texture',
            icon: <Layers className="w-5.5 h-5.5 text-[#29B9F3]" />,
            value: soil.texture,
            unitOrPeriod: water.tawMm !== null ? `${water.tawMm} mm TAW` : 'TAW unavailable',
            label: 'Soil Class',
            dateLabel: `${textureProvenanceLabel} · ${soilUpdatedDate}`,
            onClick: () => onInspectMetric(metricsById.soil_nutrients),
          },
          {
            id: 'ph',
            icon: <FlaskConical className="w-5.5 h-5.5 text-[#F7BD31]" />,
            value: soil.phValue !== null ? soil.phValue.toFixed(1) : 'Not tested',
            unitOrPeriod: `Opt ${crop.optimalPh[0]}–${crop.optimalPh[1]}`,
            label: 'Soil pH',
            dateLabel:
              soil.phValue !== null
                ? `${effectiveSoil.phProvenanceLabel} · ${phDateLabel}`
                : effectiveSoil.phProvenanceLabel,
            onClick: () => onInspectMetric(metricsById.soil_nutrients),
          },
          {
            id: 'root',
            icon: <Sprout className="w-5.5 h-5.5 text-[#35E887]" />,
            value: `${rootDepthCm} cm`,
            unitOrPeriod: `Kc ${phenology.currentKc.toFixed(2)}`,
            label: 'Root Zone',
            dateLabel: `Planted ${phenology.plantingDateLabel}`,
          },
          {
            id: 'terrain',
            icon: <Mountain className="w-5.5 h-5.5 text-[#67B8E6]" />,
            value: soil.hasFullLabNpk ? 'Ready' : 'Blocked',
            unitOrPeriod: soil.elevationM !== null ? `${Math.round(soil.elevationM)} m ASL` : 'DEM —',
            label: 'NPK Status',
            dateLabel: soil.hasFullLabNpk ? phDateLabel : `Checked ${soilUpdatedDate}`,
            onClick: () => onInspectMetric(metricsById.soil_nutrients),
          },
        ]}
      />

      {/* Section 2: Crop Coefficient & Rooting Lifecycle */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={2}
          title="Crop coefficient progression and root-zone growth"
          dateLabel={`Planted ${phenology.plantingDateLabel} · Day ~${phenology.daysElapsedEst}`}
          onInspect={() => onInspectMetric(metricsById.soil_nutrients)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_1.12fr] gap-3.5 items-stretch">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_210px] gap-3 items-stretch">
            <IntelligenceInset className="grid grid-cols-3 divide-x divide-emerald-900/12 dark:divide-[#64AE7E]/22 py-3">
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">Kc</div>
                <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {phenology.currentKc.toFixed(2)}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">Single</div>
              </div>
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">Kcb</div>
                <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {phenology.currentKcb.toFixed(2)}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">Basal</div>
              </div>
              <div className="px-3 flex flex-col items-center justify-center text-center">
                <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">Zr</div>
                <div className="text-[22px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums mt-0.5">
                  {rootDepthCm}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">cm Depth</div>
              </div>
            </IntelligenceInset>

            <div className="rounded-[11px] border border-emerald-700/30 dark:border-[#13D987]/35 bg-emerald-500/10 dark:bg-[#05331E]/85 p-3 flex flex-col justify-center">
              <div className="text-[12.5px] font-bold text-[#0F766E] dark:text-[#43E6A1] tabular-nums">
                TAW = 1000·(θFC − θWP)·Zr
              </div>
              <p className="text-[11.5px] leading-[1.4] text-[#1B4D46] dark:text-[#C4D4CA] mt-1">
                Cycle Day ~{phenology.daysElapsedEst} ({phenology.progressPct}% complete). Deeper roots expand total soil water capacity.
              </p>
            </div>
          </div>

          <IntelligenceInset className="px-4 py-3 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3]">
              <span>Phenology Stage &amp; Kc Milestone Timeline</span>
              <span className="text-[11px] font-normal text-[#3C6D59] dark:text-[#849B8C]">
                {totalCycleDays}d Cycle
              </span>
            </div>
            <div className="relative pt-2.5 pb-1">
              <div className="h-[2.5px] w-full bg-emerald-900/15 dark:bg-[#64AE7E]/25 rounded-full" />
              <div className="grid grid-cols-4 gap-1 -mt-[8px]">
                {stageTimeline.map((st) => (
                  <div key={st.name} className="flex flex-col items-center text-center">
                    <span
                      className={`rounded-full transition-all ${
                        st.active
                          ? 'w-4 h-4 bg-[#35EC99] ring-4 ring-[#13D987]/25 -mt-[2px]'
                          : 'w-3 h-3 bg-emerald-800/30 dark:bg-[#64AE7E]/55'
                      }`}
                    />
                    <div
                      className={`text-[11.5px] mt-1.5 leading-tight ${
                        st.active
                          ? 'font-bold text-[#05291B] dark:text-white'
                          : 'font-medium text-[#3C6D59] dark:text-[#849B8C]'
                      }`}
                    >
                      {st.name}
                    </div>
                    <div className="text-[10.5px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                      ({st.range})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </IntelligenceInset>
        </div>

        <div className="pt-0.5">
          <div className="flex items-center justify-between text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] mb-1">
            <span>Seasonal Crop Coefficient Curve (Single Kc vs Basal Kcb)</span>
            <span className="text-[11px] font-normal text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
              Planted {phenology.plantingDateLabel} · {totalCycleDays}-day FAO-56 schedule
            </span>
          </div>
          <SmoothLineSvgChart
            data={kcCurvePoints}
            yUnit="Kc"
            yMax={1.4}
            yTicks={[0, 0.35, 0.7, 1.05, 1.4]}
            primaryLabel="Single Kc"
            primaryColor="#35E887"
            secondaryLabel="Basal Kcb"
            secondaryColor="#F7BD31"
            averageValue={phenology.currentKc}
            averageLabel={`Current Kc (${phenology.currentKc.toFixed(2)})`}
            height={152}
          />
        </div>
      </IntelligenceCard>

      {/* Section 3: Soil Physical Evidence & Laboratory Ledger */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={3}
          title="Soil physical evidence and laboratory ledger"
          dateLabel={`Updated ${soilUpdatedDate}`}
          onInspect={() => onInspectMetric(metricsById.soil_nutrients)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[0.84fr_1.42fr_0.46fr] gap-3.5 items-stretch">
          <div className="flex flex-col justify-between gap-2.5">
            <div>
              <div className="flex items-center justify-between text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] mb-1">
                <span>VWC Retention &amp; Soil Fractions</span>
                <span className="text-[11px] font-normal text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                  {moistureAsOfDate}
                </span>
              </div>
              {soilRetentionBars.length === 0 ? (
                <IntelligenceInset className="p-3.5 text-[11.5px] leading-[1.45] text-[#2B5E56] dark:text-[#C4D4CA] min-h-[118px] flex items-center justify-center text-center">
                  {water.hydraulicAvailabilityReason ||
                    'VWC retention bounds (FC / WP) are unavailable until soil texture is confirmed.'}
                </IntelligenceInset>
              ) : (
                <StackedBarSvgChart
                  data={soilRetentionBars}
                  yUnit="%VWC"
                  seriesLabels={['Wilting Pt', 'Available', 'Headroom']}
                  seriesColors={['#F59E0B', '#35E887', '#168EDB']}
                  height={118}
                />
              )}
            </div>

            {soil.sandPct !== null && (
              <IntelligenceInset className="px-3 py-2 space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium text-[#2B5E56] dark:text-[#C4D4CA] tabular-nums">
                  <span>Sand {soil.sandPct}%</span>
                  <span>Silt {soil.siltPct}%</span>
                  <span>Clay {soil.clayPct}%</span>
                </div>
                <div className="h-2 w-full rounded-full overflow-hidden flex bg-black/20">
                  <div style={{ width: `${soil.sandPct}%` }} className="bg-[#F7BD31]" />
                  <div style={{ width: `${soil.siltPct}%` }} className="bg-[#35E887]" />
                  <div style={{ width: `${soil.clayPct}%` }} className="bg-[#29B9F3]" />
                </div>
              </IntelligenceInset>
            )}
          </div>

          {/* Center: Word-Format Evidence Table with Recorded Dates */}
          <IntelligenceInset className="overflow-hidden flex flex-col justify-between">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead className="bg-emerald-900/8 dark:bg-[#052B1C]/90 border-b border-emerald-900/12 dark:border-[#64AE7E]/20 text-[#2B5E56] dark:text-[#C4D4CA]">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Property</th>
                    <th className="py-2 px-2.5 font-semibold">Value</th>
                    <th className="py-2 px-2.5 font-semibold">Evidence</th>
                    <th className="py-2 px-2.5 font-semibold">Recorded</th>
                    <th className="py-2 px-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-900/10 dark:divide-[#64AE7E]/15 tabular-nums">
                  {evidenceRows.map((r) => (
                    <tr key={r.property} className="hover:bg-emerald-500/5">
                      <td className="py-2 px-3 font-medium text-[#05291B] dark:text-[#F1F8F3] whitespace-nowrap">
                        {r.property}
                      </td>
                      <td className="py-2 px-2.5 font-semibold text-[#0F766E] dark:text-[#35EC99] whitespace-nowrap">
                        {r.value}
                      </td>
                      <td className="py-2 px-2.5 text-[#2B5E56] dark:text-[#C4D4CA] whitespace-nowrap">
                        {r.evidence}
                      </td>
                      <td className="py-2 px-2.5 text-[#3C6D59] dark:text-[#9BB5A6] whitespace-nowrap">
                        {r.recorded}
                      </td>
                      <td className="py-2 px-3 text-[#3C6D59] dark:text-[#849B8C] truncate max-w-[160px]">
                        {r.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </IntelligenceInset>

          <IntelligenceInset className="p-3.5 flex flex-col items-center justify-center text-center gap-2">
            <FlaskConical className="w-7 h-7 text-[#F7BD31]" />
            <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3] leading-snug">
              Pedotransfer vs Lab Test
            </div>
            <p className="text-[11.5px] leading-[1.42] text-[#2B5E56] dark:text-[#C4D4CA]">
              Texture pedotransfer estimates physical water bounds, while fertilizer rates remain locked until 0–20 cm lab soil tests are entered.
            </p>
          </IntelligenceInset>
        </div>
      </IntelligenceCard>

      {/* Section 4: What is happening in the soil profile */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={4}
          title="What is happening in the soil profile"
          dateLabel={`As of ${moistureAsOfDate}`}
          infoText={`Root depth 0–${rootDepthCm} cm. ${crop.drainageTolerance}`}
        />

        <div className="grid grid-cols-1 md:grid-cols-[235px_1fr_1fr] xl:grid-cols-[235px_1.05fr_0.85fr_1.35fr] gap-3.5 items-center">
          <div className="relative h-[106px] rounded-[11px] overflow-hidden border border-emerald-900/15 dark:border-[#64AE7E]/28">
            <img
              src={rootZoneImg}
              alt="Soil root-zone profile"
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/70" />
            <div className="absolute right-3 inset-y-2.5 flex items-center gap-1.5 text-white">
              <div className="h-full w-[1.5px] bg-white/85 relative">
                <span className="absolute -top-0.5 -left-[2.5px] w-1.5 h-1.5 border-t border-l border-white rotate-45" />
                <span className="absolute -bottom-0.5 -left-[2.5px] w-1.5 h-1.5 border-b border-r border-white rotate-45" />
              </div>
              <div className="text-[11px] font-semibold leading-tight text-right tabular-nums">
                <div>0–{rootDepthCm} cm</div>
                <div className="text-white/85 font-normal">Root Zone</div>
              </div>
            </div>
          </div>

          <IntelligenceInset className="p-3.5 space-y-2 h-full flex flex-col justify-center">
            <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">
              Root-Zone Moisture ({moistureAsOfDate})
            </div>
            {water.estimatedMoistureVwcPct !== null ? (
              <>
                <div className="text-[22px] font-bold leading-none text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
                  {water.estimatedMoistureVwcPct}% VWC
                </div>
                <div className="h-2.5 w-full rounded-full bg-emerald-950/15 dark:bg-[#0D3824] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(8, water.estimatedMoistureVwcPct))}%`,
                      background: 'linear-gradient(90deg, #13D987, #43E6A1)',
                    }}
                  />
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                  FC {soil.fcVwcPct !== null ? `${soil.fcVwcPct}%` : 'Unavailable'} &nbsp;|&nbsp; WP{' '}
                  {soil.wpVwcPct !== null ? `${soil.wpVwcPct}%` : 'Unavailable'}
                </div>
                {water.observedMoisturePct !== null && water.moistureUnitAmbiguityNote && (
                  <div className="text-[10.5px] leading-[1.35] text-amber-800 dark:text-amber-300 pt-1 border-t border-emerald-900/10 dark:border-[#64AE7E]/15">
                    Observed: {water.observedMoisturePct}% ({formatSoilMoistureUnitLabel(water.observedMoistureUnit)})
                    {water.observedMoistureDepth ? ` · ${water.observedMoistureDepth}` : ''}
                    {water.observedMoistureMethod ? ` · ${water.observedMoistureMethod}` : ''}
                    {' — '}excluded from VWC balance.
                  </div>
                )}
              </>
            ) : water.observedMoisturePct !== null ? (
              <>
                <div className="text-[22px] font-bold leading-none text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
                  {water.observedMoisturePct}%
                </div>
                <div className="text-[11px] font-semibold text-amber-700 dark:text-[#F8BC37]">
                  {formatSoilMoistureUnitLabel(water.observedMoistureUnit)} ·{' '}
                  {effectiveSoil.moistureProvenanceLabel}
                </div>
                {(water.observedMoistureDepth || water.observedMoistureMethod || water.observedMoistureDate) && (
                  <div className="text-[10.5px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                    {[
                      water.observedMoistureDepth,
                      water.observedMoistureMethod,
                      water.observedMoistureDate ? formatSubDate(water.observedMoistureDate) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
                <div className="text-[10.5px] leading-[1.35] text-[#2B5E56] dark:text-[#C4D4CA]">
                  {water.moistureUnitAmbiguityNote ||
                    'VWC water-balance bounds unavailable without confirmed soil texture.'}
                </div>
              </>
            ) : (
              <>
                <div className="text-[20px] font-bold leading-none text-[#3C6D59] dark:text-[#9BB5A6]">
                  Unavailable
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">
                  {effectiveSoil.moistureProvenanceLabel}
                </div>
                <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C] tabular-nums">
                  FC {soil.fcVwcPct !== null ? `${soil.fcVwcPct}%` : 'Unavailable'} &nbsp;|&nbsp; WP{' '}
                  {soil.wpVwcPct !== null ? `${soil.wpVwcPct}%` : 'Unavailable'}
                </div>
              </>
            )}
          </IntelligenceInset>

          <IntelligenceInset className="p-3.5 space-y-1.5 h-full flex flex-col justify-center">
            <div className="text-[12px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">
              AWC &amp; Drainage
            </div>
            <div className="text-[20px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3] tabular-nums">
              {soil.awcMmPerM !== null ? `${soil.awcMmPerM} mm/m` : 'Unavailable'}
            </div>
            <div className="text-[11.5px] text-[#3C6D59] dark:text-[#849B8C] truncate">
              {soil.drainage} · EC &lt;{crop.ecThresholdDsM} dS/m
            </div>
          </IntelligenceInset>

          <div className="md:col-span-3 xl:col-span-1 flex flex-col justify-between gap-3 h-full">
            <p className="text-[12px] leading-[1.45] text-[#1B4D46] dark:text-[#C4D4CA]">
              {reports.soilCropSummary[1] || crop.drainageTolerance}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => (selectedField ? setEditingFieldSoil((v) => !v) : onOpenSoilDrawer())}
                className="h-[34px] px-4 rounded-[10px] bg-[#13D987] hover:bg-[#35EC99] text-[#003C2A] text-[12px] font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{selectedField ? 'Edit Soil / Lab' : 'Edit Farm Soil'}</span>
              </button>
            </div>
          </div>
        </div>

        {editingFieldSoil && selectedField && (
          <form
            onSubmit={handleSaveFieldSoil}
            className="rounded-[11px] border border-emerald-700/25 dark:border-[#13D987]/35 bg-emerald-50/85 dark:bg-[#00190E]/90 p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
          >
            <div>
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                Field Soil Texture
              </label>
              <select
                value={texInput}
                onChange={(e) => setTexInput(e.target.value as SoilTexture)}
                className="w-full px-3 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white"
              >
                {['Unknown', 'Sandy', 'Loamy sand', 'Sandy loam', 'Loam', 'Silt loam', 'Clay loam', 'Clay'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                pH Status
              </label>
              <select
                value={phStatusInput}
                onChange={(e) => setPhStatusInput(e.target.value as SoilPhStatus)}
                className="w-full px-3 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white"
              >
                <option value="not_tested">Not tested</option>
                <option value="tested">Lab tested</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                Lab pH (3.5–9.5)
              </label>
              <input
                type="number"
                step="0.1"
                min="3.5"
                max="9.5"
                disabled={phStatusInput === 'not_tested'}
                value={phValInput}
                onChange={(e) => setPhValInput(e.target.value)}
                className="w-full px-3 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white tabular-nums disabled:opacity-45"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#2B5E56] dark:text-[#C4D4CA] mb-1">
                Moisture ({moistStatusInput}) %
              </label>
              <div className="flex gap-1.5">
                <select
                  value={moistStatusInput}
                  onChange={(e) => setMoistStatusInput(e.target.value as SoilMoistureStatus)}
                  className="w-1/2 px-2.5 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white"
                >
                  <option value="unknown">Unk</option>
                  <option value="estimated">Est</option>
                  <option value="measured">Meas</option>
                </select>
                <input
                  type="number"
                  min="0"
                  max="70"
                  disabled={moistStatusInput === 'unknown'}
                  value={moistValInput}
                  onChange={(e) => setMoistValInput(e.target.value)}
                  className="w-1/2 px-2.5 py-2 rounded-[8px] border border-emerald-900/20 dark:border-[#64AE7E]/30 bg-white dark:bg-[#032317] text-[12px] text-[#05291B] dark:text-white tabular-nums disabled:opacity-45"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="h-[36px] px-4 rounded-[8px] bg-[#13D987] text-[#003C2A] text-[12px] font-bold cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save Override'}
            </button>
          </form>
        )}
      </IntelligenceCard>

      {/* Section 5: Word-Format Nutrient Budget & Readiness Checklist */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={5}
          title={`Nutrient uptake reference & fertilisation readiness (${nutrients.readinessStatus})`}
          dateLabel={`Evaluated ${soilUpdatedDate}`}
          rightSlot={
            <span className="text-[11.5px] font-semibold text-amber-700 dark:text-[#F8BC37]">
              No generic prescription generated
            </span>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3.5 items-stretch">
          <div className="space-y-2.5 flex flex-col justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  nutrient: 'Nitrogen (N)',
                  uptakeKgHa: nutrients.cropDemandTotalKgHa.n,
                  basis: 'Elemental N uptake',
                  note: nutrients.previousCropCreditNote,
                },
                {
                  nutrient: 'Phosphorus (P₂O₅)',
                  uptakeKgHa: nutrients.cropDemandTotalKgHa.p,
                  basis: `~${Math.round(nutrients.cropDemandTotalKgHa.p * 2.29)} kg P₂O₅ eq.`,
                  note: 'Requires Bray/Olsen extraction & soil pH buffer check.',
                },
                {
                  nutrient: 'Potassium (K₂O)',
                  uptakeKgHa: nutrients.cropDemandTotalKgHa.k,
                  basis: `~${Math.round(nutrients.cropDemandTotalKgHa.k * 1.205)} kg K₂O eq.`,
                  note: 'Requires exchangeable K (cmol/kg) and CEC test.',
                },
              ].map((item) => (
                <IntelligenceInset key={item.nutrient} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[12px] font-bold text-[#05291B] dark:text-[#F1F8F3]">
                      {item.nutrient}
                    </span>
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-[#F8BC37]">
                      Lab Req.
                    </span>
                  </div>
                  <div className="text-[16px] font-bold text-[#0F766E] dark:text-[#35EC99] tabular-nums">
                    ~{item.uptakeKgHa} kg/ha
                  </div>
                  <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">
                    {item.basis} @ {crop.uptakePerTonneKg.targetYieldBasisTHa} t/ha ref.
                  </div>
                  <p className="text-[11px] leading-[1.4] text-[#1B4D46] dark:text-[#C4D4CA] pt-1.5 border-t border-emerald-900/10 dark:border-[#64AE7E]/15">
                    {item.note}
                  </p>
                </IntelligenceInset>
              ))}
            </div>

            {disclosureMode === 'advanced' && (
              <div className="rounded-[9px] border border-emerald-700/25 dark:border-[#13D987]/30 bg-emerald-500/8 dark:bg-[#042A19]/75 px-3.5 py-2 text-[11.5px] text-[#1B4D46] dark:text-[#C4D4CA] tabular-nums">
                <strong className="text-[#0F766E] dark:text-[#43E6A1]">Gated Formula:</strong>{' '}
                Fertilizer = max(0, Crop_req − Soil_supply − Residue − Manure − Water_credit) / Recovery
              </div>
            )}
          </div>

          <IntelligenceInset className="p-3.5 flex flex-col justify-between gap-2">
            <div className="text-[12.5px] font-semibold text-[#05291B] dark:text-[#F1F8F3]">
              Missing Prerequisites
            </div>
            <div className="divide-y divide-emerald-900/10 dark:divide-[#64AE7E]/18 text-[11.5px]">
              {nutrients.missingPrerequisites.slice(0, 4).map((req, idx) => (
                <div key={idx} className="py-2 flex items-start gap-2 text-[#1B4D46] dark:text-[#C4D4CA]">
                  <CheckCircle2 className="w-4 h-4 text-[#F8BC37] shrink-0 mt-0.5" />
                  <span className="leading-snug">{req}</span>
                </div>
              ))}
            </div>
          </IntelligenceInset>
        </div>
      </IntelligenceCard>

      {/* Section 6: Field Soil Calibration & Form Access */}
      <IntelligenceCard className="p-4 lg:p-5 space-y-3">
        <SectionHeading
          number={6}
          title="Field soil calibration and agronomic tolerance"
          dateLabel={`pH Check: ${phDateLabel}`}
        />

        <div className="grid grid-cols-1 md:grid-cols-[260px_200px_1fr_auto] gap-3.5 items-center">
          <IntelligenceInset className="px-3.5 py-3 flex items-center gap-3">
            <FlaskConical className="w-8 h-8 text-[#F7BD31] shrink-0" />
            <div>
              <div className="text-[11.5px] font-medium text-[#2B5E56] dark:text-[#C4D4CA]">
                Next Lab Action
              </div>
              <div className="text-[18px] font-bold leading-tight text-[#05291B] dark:text-[#F1F8F3]">
                0–20 cm Core
              </div>
              <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">
                pH, EC, N, Olsen P, Exch. K
              </div>
            </div>
          </IntelligenceInset>

          <IntelligenceInset className="px-3.5 py-3 space-y-1 tabular-nums">
            <div className="text-[11px] text-[#3C6D59] dark:text-[#849B8C]">Crop Tolerance</div>
            <div className="text-[15px] font-bold text-[#05291B] dark:text-[#F1F8F3]">
              pH {crop.optimalPh[0]}–{crop.optimalPh[1]}
            </div>
            <div className="text-[11px] text-[#2B5E56] dark:text-[#C4D4CA]">
              EC Limit: {crop.ecThresholdDsM} dS/m · {phDateLabel}
            </div>
          </IntelligenceInset>

          <p className="text-[12px] leading-[1.45] text-[#1B4D46] dark:text-[#C4D4CA]">
            {crop.sensitiveStages}. Recording composite soil chemistry calibrates pH availability, salinity margin, and unlocks verified NPK dosing.
          </p>

          <button
            type="button"
            onClick={onOpenSoilDrawer}
            className="h-[38px] px-4.5 rounded-[10px] bg-[#13D987] hover:bg-[#35EC99] text-[#003C2A] text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Open Soil Form →</span>
          </button>
        </div>
      </IntelligenceCard>

      {/* Bottom Row: Section 7, Section 8, Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr_240px] gap-3.5 items-stretch">
        <IntelligenceCard className="p-4 lg:p-4.5 flex flex-col justify-between gap-2.5">
          <SectionHeading
            number={7}
            title={compareView === 'roots' ? 'Rooting Depth Expansion (Zr)' : 'Stage Kc vs Basal Kcb (%)'}
            dateLabel={`${totalCycleDays}d Cycle (${pastWindowLabel})`}
          />
          <ComparisonLineSvgChart
            data={rootGrowthComparison}
            yUnit={compareView === 'roots' ? 'cm' : '%'}
            currentLabel={compareView === 'roots' ? 'Active Zr (cm)' : 'Single Kc (×100)'}
            baselineLabel={compareView === 'roots' ? 'Max Crop Zr' : 'Basal Kcb (×100)'}
          />
        </IntelligenceCard>

        <DataQualityCard
          dateLabel={soilUpdatedDate}
          rows={[
            {
              dataType: 'Soil Texture',
              source: textureProvenanceLabel,
              updatedDate: soil.texture !== 'Unknown' ? soilUpdatedDate : 'Not set',
              quality: soil.texture !== 'Unknown' ? 'Medium' : 'Low',
              basis: soil.texture !== 'Unknown' ? 'Pedotransfer' : 'Unavailable',
            },
            {
              dataType: 'Soil pH / OM',
              source: soil.phValue !== null ? effectiveSoil.phProvenanceLabel : 'Not Tested',
              updatedDate: phDateLabel,
              quality: soil.phValue !== null ? 'High' : 'Low',
              basis: soil.phValue !== null ? 'Lab pH' : 'Pending lab',
            },
            {
              dataType: 'Terrain DEM',
              source: soil.elevationM !== null ? 'SRTM ~30–90 m' : 'Pending',
              updatedDate: soil.elevationM !== null ? soilUpdatedDate : 'Pending',
              quality: soil.elevationM !== null ? 'Medium' : 'Low',
              basis: soil.elevationM !== null ? 'Mapped grid' : 'Unavailable',
            },
            {
              dataType: 'Crop Model',
              source: 'FAO-56 Tables',
              updatedDate: phenology.plantingDateLabel,
              quality: 'High',
              basis: 'FAO-56 Ref.',
            },
          ]}
          onViewDetails={() => onInspectMetric(metricsById.soil_nutrients)}
        />

        <QuickActionsCard
          onViewFullReport={() => setReportOpen(true)}
          onDownloadPdf={() => window.print()}
          thirdActionLabel={compareView === 'roots' ? 'Compare Kc Curve' : 'Compare Root Zr'}
          onThirdAction={() => setCompareView((v) => (v === 'roots' ? 'kc' : 'roots'))}
        />
      </div>

      <FullReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`Soil & Crop Intelligence — ${bundle.fieldDisplayName}`}
        subtitle={`${crop.commonName} (${crop.scientificName}) · ${soil.texture} · Updated ${soilUpdatedDate}`}
        stats={[
          { label: 'Soil Texture', value: soil.texture },
          { label: 'Soil pH', value: soil.phValue !== null ? soil.phValue.toFixed(1) : 'Not tested' },
          { label: 'Root Depth Zr', value: `${rootDepthCm} cm` },
          {
            label: 'Total Avail. Water',
            value: water.tawMm !== null ? `${water.tawMm} mm` : 'Unavailable',
          },
        ]}
        paragraphs={reports.soilCropSummary}
        onPrint={() => window.print()}
      />
    </div>
  );
};
