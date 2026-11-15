import React from 'react';
import { CheckCircle2, Info, Layers, ShieldAlert, X } from 'lucide-react';
import { InspectableMetric } from '../../../lib/fieldAgronomyEngine';

interface MetricInspectionDrawerProps {
  metric: InspectableMetric | null;
  onClose: () => void;
}

export const MetricInspectionDrawer: React.FC<MetricInspectionDrawerProps> = ({
  metric,
  onClose,
}) => {
  if (!metric) return null;

  const confColor =
    metric.confidenceLevel === 'High'
      ? 'text-emerald-700 dark:text-[#2DD4BF]'
      : metric.confidenceLevel === 'Moderate'
        ? 'text-amber-700 dark:text-amber-300'
        : metric.confidenceLevel === 'Unavailable'
          ? 'text-slate-600 dark:text-slate-300'
          : 'text-rose-700 dark:text-rose-300';

  return (
    <div className="fs-drawer-backdrop z-[65]" onClick={onClose}>
      <aside
        aria-label="Metric calculation and evidence drawer"
        onClick={(e) => e.stopPropagation()}
        className="fs-drawer-shell w-full max-w-xl h-full overflow-y-auto fs-thin-scroll flex flex-col"
      >
        {/* Header */}
        <div className="fs-modal-header sticky top-0 z-10 px-6 py-4 backdrop-blur-xl flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#2DD4BF]">
              <Info className="w-4 h-4" />
              <span>Evidence &amp; Formula Inspector</span>
            </div>
            <h3 className="text-lg font-bold text-[#072622] dark:text-[#ECF8F5] mt-0.5">
              {metric.title}
            </h3>
            <p className="text-[13px] text-[#285E55] dark:text-[#96C7BE] mt-0.5">{metric.question}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close metric inspector"
            className="w-9 h-9 rounded-full bg-black/5 dark:bg-white/[0.07] hover:bg-black/10 dark:hover:bg-white/[0.14] border border-[#0F766E]/15 dark:border-[#2DD4BF]/25 grid place-items-center text-[#1B4D46] dark:text-[#C5E4DD] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-[13px]">
          {/* Primary Value + Fact Type + Confidence */}
          <div className="fs-modal-subpanel p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-medium text-[#285E55] dark:text-[#8EB8B0]">
                Displayed Value
              </div>
              <div className="text-xl font-bold text-[#072622] dark:text-white tabular-nums mt-1">
                {metric.valueDisplay}
              </div>
              <div className="text-xs text-[#285E55] dark:text-[#96C7BE] mt-0.5">{metric.unit}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-[#285E55] dark:text-[#8EB8B0]">Fact Type</div>
              <div className="text-sm font-bold text-[#0F766E] dark:text-[#2DD4BF] mt-1">
                {metric.factType}
              </div>
              <div className="text-xs text-[#285E55] dark:text-[#96C7BE] mt-0.5 truncate">
                {metric.relatedContext}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-[#285E55] dark:text-[#8EB8B0]">
                Evidence Quality
              </div>
              <div className={`text-sm font-bold mt-1 ${confColor}`}>
                {metric.confidenceLevel}
              </div>
              <div className="text-xs text-[#285E55] dark:text-[#96C7BE] mt-0.5">
                {metric.formulaVersion}
              </div>
            </div>
          </div>

          {/* Provenance & Spatial Metadata */}
          <div className="fs-modal-subpanel p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#072622] dark:text-[#ECF8F5]">
              <Layers className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
              <span>Source, Period &amp; Spatial Coverage</span>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <dt className="text-xs text-[#285E55] dark:text-[#8EB8B0]">Source / Product</dt>
                <dd className="font-semibold text-[#072622] dark:text-[#ECF8F5] mt-0.5">
                  {metric.sourceName}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#285E55] dark:text-[#8EB8B0]">Period &amp; Timezone</dt>
                <dd className="font-semibold text-[#072622] dark:text-[#ECF8F5] tabular-nums mt-0.5">
                  {metric.period} · {metric.timezone}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#285E55] dark:text-[#8EB8B0]">Observation Time</dt>
                <dd className="font-medium text-[#1B4D46] dark:text-[#D5EEE9] tabular-nums mt-0.5">
                  {metric.observationTime}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#285E55] dark:text-[#8EB8B0]">Retrieval Time</dt>
                <dd className="font-medium text-[#1B4D46] dark:text-[#D5EEE9] tabular-nums mt-0.5">
                  {new Date(metric.retrievalTime).toLocaleString()}
                </dd>
              </div>
            </dl>
            <div className="pt-3 border-t border-[#0F766E]/12 dark:border-white/10 space-y-1 text-xs">
              <div className="font-semibold text-[#1B4D46] dark:text-[#96C7BE]">
                Spatial Resolution: <span className="font-normal">{metric.spatialResolution}</span>
              </div>
              <div className="text-[#285E55] dark:text-[#8EB8B0] leading-relaxed">
                {metric.fieldCoverageNote}
              </div>
            </div>
          </div>

          {/* Exact Formula & Inputs */}
          <div className="fs-modal-subpanel p-5 space-y-3.5">
            <div className="text-sm font-bold text-[#072622] dark:text-[#ECF8F5]">
              Formula &amp; Exact Calculation Inputs
            </div>
            <div className="rounded-xl bg-[#072622]/5 dark:bg-black/30 border border-[#0F766E]/15 dark:border-white/10 px-3.5 py-2.5 font-mono text-xs text-[#072622] dark:text-[#5EEAD4] overflow-x-auto">
              {metric.formulaDisplay}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#0F766E]/15 dark:border-white/12 text-xs text-[#285E55] dark:text-[#8EB8B0]">
                    <th className="py-2 pr-3 font-semibold">Input Variable</th>
                    <th className="py-2 pr-3 font-semibold">Value</th>
                    <th className="py-2 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0F766E]/10 dark:divide-white/10">
                  {metric.inputs.map((inp) => (
                    <tr key={inp.label}>
                      <td className="py-2 pr-3 font-medium text-[#14433C] dark:text-[#D5EEE9]">
                        {inp.label}
                      </td>
                      <td className="py-2 pr-3 font-bold text-[#072622] dark:text-white tabular-nums">
                        {inp.value}
                      </td>
                      <td className="py-2 text-[#285E55] dark:text-[#96C7BE]">{inp.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Intermediate Steps */}
          <div className="fs-modal-subpanel p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#072622] dark:text-[#ECF8F5]">
              <CheckCircle2 className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
              <span>Intermediate Steps &amp; Assumptions</span>
            </div>
            <ul className="space-y-2 text-[#14433C] dark:text-[#D5EEE9] leading-relaxed">
              {metric.intermediateSteps.map((step, i) => (
                <li key={i} className="tabular-nums">
                  · {step}
                </li>
              ))}
            </ul>
          </div>

          {/* Limitations */}
          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-5 space-y-1.5 text-amber-950 dark:text-amber-200">
            <div className="flex items-center gap-2 text-sm font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Uncertainty &amp; Methodological Limitations</span>
            </div>
            <p className="leading-relaxed text-[13px]">{metric.limitations}</p>
          </div>
        </div>
      </aside>
    </div>
  );
};
