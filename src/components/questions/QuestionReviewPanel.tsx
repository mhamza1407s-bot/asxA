import React, { useMemo } from 'react';
import {
  ArrowRight,
  Check,
  Info,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  analyzeMissingDataAndReview,
  buildReviewChecklist,
} from '../../lib/questionnaireEngine';
import {
  ExternalConnectorInfo,
  QuestionnaireDraft,
} from '../../types/questionnaire';

interface QuestionReviewPanelProps {
  draft: QuestionnaireDraft;
  connectors?: ExternalConnectorInfo[];
  isLight: boolean;
  submitting: boolean;
  onEditQuestion: (questionId: string) => void;
  onStartDeeperAccuracy: () => void;
  onToggleConsent: (accepted: boolean) => void;
  onRunAssessment: () => void;
}

export const QuestionReviewPanel: React.FC<QuestionReviewPanelProps> = ({
  draft,
  isLight,
  submitting,
  onEditQuestion,
  onStartDeeperAccuracy,
  onToggleConsent,
  onRunAssessment,
}) => {
  const analysis = useMemo(() => analyzeMissingDataAndReview(draft), [draft]);
  const checklist = useMemo(() => buildReviewChecklist(draft), [draft]);

  const completedCount = checklist.filter((item) => item.status === 'completed').length;
  const requiredMissingCount = checklist.filter((item) => item.status === 'required').length;
  const hasOptionalItems = checklist.some((item) => !item.required);

  const cardSurface = isLight
    ? 'fs-qst-subpanel text-[#072622]'
    : 'fs-qst-subpanel text-[#E6F8F3]';
  const subCls = isLight ? 'text-[#245A52]' : 'text-[#A7D9CF]';

  return (
    <div className="space-y-5">
      {/* 1 Long Checklist Card */}
      <div className={`rounded-[24px] overflow-hidden ${cardSurface}`}>
        <div className="px-5 py-3.5 border-b border-[#0F766E]/12 dark:border-white/12 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-wider tabular-nums text-[#0F766E] dark:text-[#2DD4BF]">
            All Questions · {completedCount} of {checklist.length} completed
          </div>

          <div className={`flex flex-wrap items-center gap-3.5 text-[11px] font-medium ${subCls}`}>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/60 text-emerald-600 dark:text-emerald-400 grid place-items-center">
                <Check className="w-2.5 h-2.5" strokeWidth={3} />
              </span>
              <span>Completed</span>
            </span>
            {hasOptionalItems && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full bg-amber-400/25 border-2 border-amber-400 inline-block" />
                <span>Optional</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full bg-rose-500/25 border-2 border-rose-500 inline-block" />
              <span>Required</span>
            </span>
          </div>
        </div>

        <div className="divide-y divide-[#0F766E]/10 dark:divide-white/10">
          {checklist.map((item) => (
            <button
              key={item.questionId}
              type="button"
              onClick={() => onEditQuestion(item.questionId)}
              className={`w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left cursor-pointer transition-colors ${
                isLight ? 'hover:bg-white/45' : 'hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className={`w-6 pt-0.5 text-xs font-mono font-bold tabular-nums shrink-0 ${subCls}`}
                >
                  {item.questionNumber}.
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-snug">
                    {item.questionText}
                  </div>
                  {item.answerSummary && (
                    <div className="text-xs mt-0.5 font-medium text-[#0F766E] dark:text-[#2DD4BF] break-words">
                      {item.answerSummary}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex items-center" aria-label={item.status}>
                {item.status === 'completed' ? (
                  <span
                    title="Completed"
                    className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/60 text-emerald-600 dark:text-emerald-400 grid place-items-center"
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                ) : item.status === 'required' ? (
                  <span
                    title="Required — not completed"
                    className="w-5 h-5 rounded-full bg-rose-500/25 border-2 border-rose-500 inline-block"
                  />
                ) : (
                  <span
                    title="Optional — not completed"
                    className="w-5 h-5 rounded-full bg-amber-400/25 border-2 border-amber-400 inline-block"
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Remote Data Consent Tick Box */}
      <div
        className={`rounded-[22px] p-4 transition-all ${
          draft.consent.acceptedRemoteFetch
            ? 'fs-qst-option-active'
            : 'fs-qst-subpanel'
        }`}
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <button
            type="button"
            role="checkbox"
            aria-checked={draft.consent.acceptedRemoteFetch}
            onClick={() => onToggleConsent(!draft.consent.acceptedRemoteFetch)}
            className={`mt-0.5 w-5 h-5 rounded-[6px] border grid place-items-center shrink-0 cursor-pointer transition-colors ${
              draft.consent.acceptedRemoteFetch
                ? 'bg-[#14B89A] border-[#14B89A] text-[#031F1C]'
                : 'border-current/45 bg-transparent'
            }`}
          >
            {draft.consent.acceptedRemoteFetch && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
          </button>
          <div className="text-xs leading-relaxed">
            <div className="font-bold flex items-center gap-1.5 text-sm">
              <ShieldCheck className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
              <span>Allow live weather &amp; climate lookup</span>
            </div>
            <p className={`mt-1 ${subCls}`}>
              Send my confirmed field coordinates to <strong>Open-Meteo</strong> and{' '}
              <strong>NASA POWER</strong> to compute local crop fit.
            </p>
          </div>
        </label>
      </div>

      {/* 2 Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          type="button"
          disabled={!analysis.canRunAssessment || submitting}
          onClick={onRunAssessment}
          className="min-h-[44px] inline-flex items-center gap-2.5 px-7 py-2.5 rounded-full text-sm font-bold text-[#031F1C] bg-gradient-to-r from-[#14B89A] via-[#2DD4BF] to-[#5EEAD4] shadow-[0_8px_22px_rgba(20,184,154,0.32)] hover:brightness-105 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-all"
        >
          <span>{submitting ? 'Starting...' : 'Get rotations now'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onStartDeeperAccuracy}
          className={`fs-qst-option min-h-[42px] inline-flex items-center gap-2 px-5 py-2.5 !rounded-full text-sm font-semibold cursor-pointer ${
            isLight ? 'text-[#0B3630]' : 'text-[#E6F8F3]'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
          <span>Deepen accuracy</span>
        </button>
      </div>

      {!analysis.canRunAssessment && (
        <div className={`text-xs flex items-center gap-1.5 ${subCls}`}>
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>
            {requiredMissingCount > 0
              ? 'Complete any red required items above and tick the allow box to get rotations now.'
              : 'Tick the allow box above to get rotations now.'}
          </span>
        </div>
      )}
    </div>
  );
};
