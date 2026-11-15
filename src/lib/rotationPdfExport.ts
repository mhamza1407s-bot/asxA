import {
  formatShortPlanDate,
  RotationEngineOutput,
  RotationPlanCandidate,
  RotationWizardDraft,
} from './rotationPlannerEngine';
import { formatSoilMoistureUnitLabel, normalizeSoilMoistureUnit } from './soilProvenance';

function sanitizePdfText(input: string): string {
  // Strip/map non-Latin1 characters cleanly so PDF Helvetica font renders accurately
  const replaced = input
    .replace(/→/g, '->')
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/±/g, '+/-')
    .replace(/°/g, ' deg ')
    .replace(/³/g, '3')
    .replace(/₀/g, '0')
    .replace(/[^\x20-\x7E]/g, ' ');
  return replaced
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars = 84): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Generates a real valid standalone PDF 1.4 binary document containing farm inputs,
 * input provenance, match score, season-by-season crop sequence, reasons,
 * risk mitigations, and ranked comparison.
 */
export function buildRotationPlanPdfBytes(
  engine: RotationEngineOutput,
  selectedPlan: RotationPlanCandidate,
  draft: RotationWizardDraft
): Uint8Array {
  const pagesOps: string[][] = [[]];
  let y = 758;

  const ensureRoom = (needed = 18) => {
    if (y - needed < 46) {
      pagesOps.push([]);
      y = 758;
    }
  };

  const currentOps = () => pagesOps[pagesOps.length - 1];

  const pushText = (text: string, size = 10, bold = false, x = 44, indent = 0) => {
    ensureRoom(size + 5);
    const font = bold ? '/F2' : '/F1';
    currentOps().push(`BT ${font} ${size} Tf 1 0 0 1 ${x + indent} ${y} Tm (${sanitizePdfText(text)}) Tj ET`);
    y -= size + 4.5;
  };

  const pushParagraph = (text: string, size = 9.5, x = 44) => {
    for (const line of wrapText(text, 88)) {
      pushText(line, size, false, x);
    }
  };

  const pushDivider = () => {
    ensureRoom(16);
    currentOps().push(`0.82 0.86 0.92 RG 0.6 w 44 ${y + 3} m 568 ${y + 3} l S`);
    y -= 10;
  };

  // Header
  pushText('ANCHOR FIELD SHIFT - CROP ROTATION PLAN REPORT', 15, true, 44);
  pushText(
    `Farm: ${engine.farmName} | Field: ${engine.fieldName} (${engine.areaDisplay}) | Generated: ${formatShortPlanDate(engine.generatedAt)}`,
    9.5,
    false,
    44
  );
  pushText(
    `Engine: ${engine.engineVersion} | Knowledge Base: ${engine.cropKnowledgeVersion} | Snapshot: ${engine.inputSnapshotHash}`,
    8.5,
    false,
    44
  );
  y -= 4;
  pushDivider();

  // Farm Inputs
  pushText('1. FARM INPUT PARAMETERS & PROVENANCE', 11, true, 44);
  pushText(
    `- Soil Texture: ${draft.soilTexture} (${draft.soilTextureProvenance.replace(/_/g, ' ')}) | Drainage: ${draft.drainage} | pH: ${draft.soilPh ?? 'Not tested'} (${draft.soilPhProvenance.replace(/_/g, ' ')})`,
    9.5,
    false,
    44
  );
  const moistureSummary =
    draft.soilMoistureStatus === 'unknown' || draft.soilMoisturePct === null
      ? 'Not measured / Unknown'
      : `${draft.soilMoisturePct}% (${formatSoilMoistureUnitLabel(normalizeSoilMoistureUnit(draft.soilMoistureUnit))}) | Status: ${draft.soilMoistureStatus ?? 'reported'} | Depth: ${draft.soilMoistureDepth || 'unspecified'} | Method: ${draft.soilMoistureMethod || 'unspecified'} | Date: ${draft.soilMoistureDate || 'unspecified'}`;
  pushParagraph(`- Soil Moisture & Provenance: ${moistureSummary}`, 9.3, 44);
  if (draft.moistureUnitAmbiguityNote) {
    pushParagraph(`- Moisture Caveat: ${draft.moistureUnitAmbiguityNote}`, 9.0, 44);
  }
  pushText(
    `- Water Source: ${draft.waterSourceSummary} | Reliability: ${draft.waterReliability} (${draft.waterProvenance.replace(/_/g, ' ')})`,
    9.5,
    false,
    44
  );
  pushText(
    `- Recent Crop History: ${draft.recentCropDisplay} | Planning Horizon: ${draft.planningHorizonSeasons} Seasons (${draft.cropsPerYear}/yr)`,
    9.5,
    false,
    44
  );
  if (draft.excludedCrops.length > 0 || draft.requiredCrops.length > 0) {
    pushText(
      `- Constraints -> Excluded: ${draft.excludedCrops.join(', ') || 'None'} | Required: ${draft.requiredCrops.join(', ') || 'None'}`,
      9.2,
      false,
      44
    );
  }
  y -= 4;
  pushDivider();

  // Selected Recommendation Summary
  pushText(`2. SELECTED PLAN: ${selectedPlan.planCode.toUpperCase()} - ${selectedPlan.title}`, 11, true, 44);
  pushText(
    `Match Score: ${selectedPlan.matchScore}/100 (+/-${selectedPlan.uncertaintyMarginPts} pts) | Agronomic Fit Index (not guaranteed yield)`,
    10,
    true,
    44
  );
  pushParagraph(selectedPlan.fitSummary, 9.5, 44);
  pushParagraph(
    `Data Availability: ${selectedPlan.confidenceReason} | Gaps: ${selectedPlan.dataGaps.length > 0 ? selectedPlan.dataGaps.join('; ') : 'None logged'}`,
    9.0,
    44
  );
  pushText(
    `Component Indices -> Soil Health: ${selectedPlan.components.soilHealth}% | Water Efficiency: ${selectedPlan.components.waterEfficiency}% | Productivity: ${selectedPlan.components.productivity}% | Diversity: ${selectedPlan.components.diversity}%`,
    9,
    false,
    44
  );
  pushText(
    `Seasonal Totals -> Total ETc Demand: ${selectedPlan.totalWaterDemandMm} mm | Net Nitrogen Balance: ${selectedPlan.netNitrogenBalanceKgHa >= 0 ? '+' : ''}${selectedPlan.netNitrogenBalanceKgHa} kg N/ha | Cycle: ~${selectedPlan.totalCycleDays} days`,
    9,
    false,
    44
  );
  y -= 4;
  pushDivider();

  // Sequence Table
  pushText('3. SEASON-BY-SEASON CROP SEQUENCE', 11, true, 44);
  for (const step of selectedPlan.steps) {
    pushText(
      `${step.seasonLabel} (${step.yearLabel}): ${step.cropName} [${step.plainFamily}] | ~${step.durationDays} days | ETc: ${step.etcMmEstimate} mm | N: ${step.nitrogenBalanceKgHa >= 0 ? '+' : ''}${step.nitrogenBalanceKgHa} kg/ha`,
      9.5,
      true,
      44
    );
    pushParagraph(`   Benefit: ${step.keyBenefit} - ${step.rationale}`, 8.8, 44);
  }
  y -= 4;
  pushDivider();

  // Reasons & Fallow vs Cover
  pushText('4. AGRONOMIC RATIONALE & FALLOW VS COVER CROP DECISION', 11, true, 44);
  for (const r of selectedPlan.whyItFits) {
    pushText(`+ ${r}`, 9.5, false, 44);
  }
  pushParagraph(`Fallow vs Cover Crop Rule: ${selectedPlan.fallowVsCoverDecision.reason}`, 9, 44);
  y -= 4;
  pushDivider();

  // Risks & Mitigations
  pushText('5. IDENTIFIED RISKS & MITIGATION ACTIONS', 11, true, 44);
  for (const risk of selectedPlan.risks) {
    pushText(`[${risk.severity} Risk | Season ${risk.seasonNumber} ${risk.cropName}] ${risk.shortWarning}`, 9.5, true, 44);
    pushParagraph(`   Cause: ${risk.cause} Mitigation: ${risk.mitigation}`, 8.8, 44);
  }
  y -= 4;
  pushDivider();

  // Comparison
  pushText('6. RANKED PLAN COMPARISON', 11, true, 44);
  for (const cand of engine.candidates.slice(0, 4)) {
    pushText(
      `#${cand.rank} ${cand.planCode} (${cand.matchScore}/100, Water ${cand.totalWaterDemandMm} mm, Soil ${cand.components.soilHealth}%): ${cand.title}`,
      9,
      false,
      44
    );
  }
  pushText(`Review By Date: ${selectedPlan.reviewByDate} (Note: Plan scores reflect priority fit, not guaranteed biological yield.)`, 8.5, false, 44);

  // Assemble PDF objects with dynamic 1..N pages
  const pageCount = pagesOps.length;
  const fontRegularNum = 3 + pageCount * 2;
  const fontBoldNum = 4 + pageCount * 2;
  const pageRefs: string[] = [];
  const pageAndStreamObjects: string[] = [];

  for (let i = 0; i < pageCount; i++) {
    const pageObjNum = 3 + i * 2;
    const contentObjNum = 4 + i * 2;
    const streamStr = pagesOps[i].join('\n');
    pageRefs.push(`${pageObjNum} 0 R`);
    pageAndStreamObjects.push(
      `${pageObjNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontRegularNum} 0 R /F2 ${fontBoldNum} 0 R >> >> >> endobj`
    );
    pageAndStreamObjects.push(
      `${contentObjNum} 0 obj << /Length ${streamStr.length} >>\nstream\n${streamStr}\nendstream\nendobj`
    );
  }

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    `2 0 obj << /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageCount} >> endobj`,
    ...pageAndStreamObjects,
    `${fontRegularNum} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`,
    `${fontBoldNum} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj + '\n';
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function downloadRotationPlanPdf(
  engine: RotationEngineOutput,
  selectedPlan: RotationPlanCandidate,
  draft: RotationWizardDraft
): string {
  const bytes = buildRotationPlanPdfBytes(engine, selectedPlan, draft);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const slug = engine.farmName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'farm';
  const filename = `${slug}-${selectedPlan.planCode.toLowerCase().replace(/\s+/g, '-')}-rotation-plan.pdf`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return filename;
}

export function downloadRotationPlanJson(
  engine: RotationEngineOutput,
  selectedPlan: RotationPlanCandidate,
  draft: RotationWizardDraft
): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    farm: {
      id: engine.farmId,
      name: engine.farmName,
      fieldId: engine.fieldId,
      fieldName: engine.fieldName,
      area: engine.areaDisplay,
    },
    inputs: draft,
    selectedPlan,
    rankedAlternatives: engine.candidates,
    rejectedCandidates: engine.rejectedCandidates,
    reviewGate: engine.reviewGate,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const slug = engine.farmName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'farm';
  const filename = `${slug}-rotation-plan-export.json`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return filename;
}
