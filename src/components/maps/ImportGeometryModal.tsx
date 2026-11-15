import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCode2, Upload, X } from 'lucide-react';
import { ImportedFeatureCandidate, MapFieldRecord } from '../../types/maps';
import { formatArea, parseImportedBoundariesFile } from '../../lib/mapGeometry';

interface ImportGeometryModalProps {
  open: boolean;
  farmName: string;
  areaUnit: 'hectares' | 'acres';
  existingFields: MapFieldRecord[];
  onClose: () => void;
  onConfirmImport: (
    validCandidates: Array<{ name: string; geometry: NonNullable<ImportedFeatureCandidate['geometry']> }>
  ) => Promise<void>;
}

export const ImportGeometryModal: React.FC<ImportGeometryModalProps> = ({
  open,
  farmName,
  areaUnit,
  existingFields,
  onClose,
  onConfirmImport,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [formatLabel, setFormatLabel] = useState<string>('');
  const [crsAssumption, setCrsAssumption] = useState<string>('');
  const [candidates, setCandidates] = useState<ImportedFeatureCandidate[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setParseError(null);
    setFilename(file.name);
    try {
      const text = await file.text();
      const res = parseImportedBoundariesFile(file.name, text, existingFields);
      setFormatLabel(res.format);
      setCrsAssumption(res.crsAssumption);
      setCandidates(res.candidates);
      if (res.candidates.length === 0) {
        setParseError('No geographic features detected in this file.');
      }
    } catch (err) {
      setCandidates([]);
      setParseError(err instanceof Error ? err.message : 'Unable to parse geometry file.');
    }
  };

  const selectedValid = candidates.filter((c) => c.selected && c.geometry && c.validation?.valid);

  return (
    <div
      className="fs-modal-backdrop !z-[900]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import Field Boundaries"
        className="fs-modal-shell w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fs-modal-header px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-[#072622] dark:text-[#ECF8F5]">
              Import Field Boundaries (GeoJSON / KML)
            </h3>
            <p className="text-[13px] text-[#2B5E56] dark:text-[#92C2B8] mt-0.5">
              Target farm: <span className="text-teal-700 dark:text-[#5EEAD4] font-semibold">{farmName}</span> · Preview &amp; validate before committing
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import modal"
            className="w-9 h-9 rounded-full flex items-center justify-center border border-teal-700/20 dark:border-teal-300/25 bg-white/60 dark:bg-white/[0.06] text-[#18463F] dark:text-[#C8E4DE] hover:bg-teal-500/15 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto fs-thin-scroll text-[13px]">
          {/* File Drop / Picker */}
          <div className="fs-modal-subpanel p-5 border-dashed text-center space-y-3">
            <FileCode2 className="w-8 h-8 text-teal-600 dark:text-[#2DD4BF] mx-auto" />
            <div className="text-[13.5px] text-[#18463F] dark:text-[#C8E4DE]">
              Select a <code className="font-mono font-semibold text-teal-700 dark:text-[#5EEAD4]">.geojson</code>,{' '}
              <code className="font-mono font-semibold text-teal-700 dark:text-[#5EEAD4]">.json</code>, or{' '}
              <code className="font-mono font-semibold text-teal-700 dark:text-[#5EEAD4]">.kml</code> boundary file
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".geojson,.json,.kml,application/geo+json,application/vnd.google-earth.kml+xml"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white font-semibold text-xs cursor-pointer hover:brightness-105 shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{filename ? 'Choose Another File' : 'Select Boundary File'}</span>
            </button>
          </div>

          {parseError && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/35 text-[13px] text-rose-700 dark:text-rose-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-300 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {filename && !parseError && (
            <div className="fs-modal-subpanel p-4 text-[13px] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#072622] dark:text-[#ECF8F5]">{filename}</span>
                <span className="text-teal-700 dark:text-[#5EEAD4] font-mono text-xs">{formatLabel}</span>
              </div>
              <div className="text-xs text-[#2B5E56] dark:text-[#92C2B8]">
                CRS Assumption: {crsAssumption} · Detected features: {candidates.length} (
                {candidates.filter((c) => c.validation?.valid).length} valid,{' '}
                {candidates.filter((c) => !c.validation?.valid).length} rejected)
              </div>
            </div>
          )}

          {candidates.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#2B5E56] dark:text-[#92C2B8]">
                Detected Features Preview (Invalid features are explicitly listed below)
              </div>
              {candidates.map((cand, idx) => {
                const isValid = Boolean(cand.validation?.valid && cand.geometry);
                return (
                  <div
                    key={cand.index}
                    className={`p-3.5 rounded-2xl border text-[13px] space-y-2 ${
                      isValid
                        ? 'fs-modal-subpanel'
                        : 'bg-rose-500/10 border-rose-500/35'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2.5 font-medium text-[#072622] dark:text-white flex-1 min-w-0">
                        <input
                          type="checkbox"
                          disabled={!isValid}
                          checked={cand.selected && isValid}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setCandidates((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, selected: checked } : c))
                            );
                          }}
                        />
                        <input
                          type="text"
                          value={cand.suggestedName}
                          disabled={!isValid}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCandidates((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, suggestedName: val } : c))
                            );
                          }}
                          aria-label={`Field name for feature ${cand.index}`}
                          className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-white/75 dark:bg-black/25 border border-teal-700/20 dark:border-teal-300/25 text-[13px] text-[#072622] dark:text-white disabled:opacity-60"
                        />
                      </label>
                      <span className="text-xs font-mono text-[#18463F] dark:text-[#C8E4DE] shrink-0 tabular-nums">
                        {cand.validation ? formatArea(cand.validation.netAreaM2, areaUnit) : cand.rawGeometryType}
                      </span>
                    </div>

                    {isValid ? (
                      <div className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          Valid {cand.rawGeometryType} · {cand.validation?.vertexCount} vertices
                          {cand.validation?.holeCount ? ` · ${cand.validation.holeCount} exclusion hole(s)` : ''}
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-rose-700 dark:text-rose-200 flex items-start gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Rejected: {cand.error}</span>
                      </div>
                    )}

                    {cand.validation?.issues
                      .filter((iss) => iss.severity === 'warning')
                      .map((warn, wi) => (
                        <div key={wi} className="text-xs text-amber-700 dark:text-amber-300">
                          Warning: {warn.message}
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="fs-modal-footer px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-[#2B5E56] dark:text-[#92C2B8]">
            Existing boundaries will not be overwritten.
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-semibold text-[#18463F] dark:text-[#C8E4DE] hover:bg-teal-500/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedValid.length === 0 || importing}
              onClick={async () => {
                setImporting(true);
                try {
                  await onConfirmImport(
                    selectedValid.map((c) => ({
                      name: c.suggestedName.trim() || `Imported Field ${c.index}`,
                      geometry: c.geometry!,
                    }))
                  );
                  onClose();
                } finally {
                  setImporting(false);
                }
              }}
              className="px-5 py-2 rounded-full text-xs font-semibold bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white hover:brightness-105 disabled:opacity-45 cursor-pointer shadow-sm"
            >
              {importing
                ? 'Importing...'
                : `Import ${selectedValid.length} Valid ${selectedValid.length === 1 ? 'Boundary' : 'Boundaries'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
