import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Calculator,
  ChevronDown,
  ChevronUp,
  Clock,
  FolderKanban,
  Globe2,
  Lightbulb,
  ListChecks,
  Loader2,
  ShieldCheck,
  Sprout,
  XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cancelAssessmentJobApi, fetchAssessmentJobApi } from '../../services/questionnaireApi';
import {
  AssessmentJobEvent,
  AssessmentJobRecord,
  AssessmentResultBundle,
} from '../../types/questionnaire';

interface LiveAssessmentScreenProps {
  job: AssessmentJobRecord;
  isLight: boolean;
  onJobUpdated: (job: AssessmentJobRecord) => void;
  onContinueToRotation: (snapshotId: string, result: AssessmentResultBundle) => void;
  onBackToReview: () => void;
}

const STAGE_META: Array<{
  key: AssessmentJobEvent['stageKey'];
  actionTitle: string;
  thinkingVerb: string;
  icon: 'shield' | 'globe' | 'calc' | 'sprout' | 'folder';
}> = [
  {
    key: 'validate_inputs',
    actionTitle: 'Validated field inputs & coordinates',
    thinkingVerb: 'Checking field setup',
    icon: 'shield',
  },
  {
    key: 'retrieve_evidence',
    actionTitle: 'Fetched live climate & solar data from APIs',
    thinkingVerb: 'Gathering environmental data',
    icon: 'globe',
  },
  {
    key: 'prepare_features',
    actionTitle: 'Calculated climate, GDD & water metrics',
    thinkingVerb: 'Calculating weather & water',
    icon: 'calc',
  },
  {
    key: 'generate_sequences',
    actionTitle: 'Calculated plant requirements & crop rotations',
    thinkingVerb: 'Calculating crop fit',
    icon: 'sprout',
  },
  {
    key: 'save_snapshot',
    actionTitle: 'Organized crop structure & saved field plan',
    thinkingVerb: 'Organizing final plans',
    icon: 'folder',
  },
];

function formatStepDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatThoughtSeconds(
  state: AssessmentJobEvent['state'],
  startedAtIso: string,
  durationMs: number | null,
  nowMs: number,
  thinkingVerb: string
): string {
  if (state === 'running') {
    const startMs = Date.parse(startedAtIso);
    const liveSecs = Math.max(0, Math.floor((nowMs - (Number.isFinite(startMs) ? startMs : nowMs)) / 1000));
    return `${thinkingVerb} · ${liveSecs}s`;
  }
  if (durationMs === null || durationMs === undefined) {
    return 'Thought for <1s';
  }
  if (durationMs < 1000) {
    return `Thought for ${(durationMs / 1000).toFixed(1)}s`;
  }
  const roundedSecs = Math.max(1, Math.round(durationMs / 1000));
  return `Thought for ${roundedSecs} ${roundedSecs === 1 ? 'second' : 'seconds'}`;
}

export const LiveAssessmentScreen: React.FC<LiveAssessmentScreenProps> = ({
  job,
  isLight,
  onJobUpdated,
  onContinueToRotation,
  onBackToReview,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [cancelling, setCancelling] = useState(false);

  const isTerminal =
    job.state === 'complete' ||
    job.state === 'partial' ||
    job.state === 'failed' ||
    job.state === 'cancelled';

  // Live 250ms clock while active so per-second stage and total timers tick smoothly
  useEffect(() => {
    if (isTerminal) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [isTerminal]);

  const totalElapsedMs = useMemo(() => {
    if (isTerminal) {
      if (job.totalDurationMs !== null) return job.totalDurationMs;
      const start = Date.parse(job.startedAt);
      const end = job.completedAt ? Date.parse(job.completedAt) : Date.now();
      return Math.max(0, (Number.isFinite(end) ? end : Date.now()) - (Number.isFinite(start) ? start : Date.now()));
    }
    const start = Date.parse(job.startedAt);
    return Math.max(0, nowMs - (Number.isFinite(start) ? start : nowMs));
  }, [isTerminal, job.totalDurationMs, job.startedAt, job.completedAt, nowMs]);

  // Real-time SSE stream (`onmessage` for default `data:` packets + named fallback + polling safety net)
  useEffect(() => {
    if (isTerminal) return;
    let closed = false;
    let source: EventSource | null = null;

    const pollOnce = async () => {
      try {
        const res = await fetchAssessmentJobApi(job.jobId);
        if (!closed && res.job) {
          onJobUpdated(res.job);
        }
      } catch {
        // Keep polling gracefully
      }
    };

    const handlePacket = (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as { job?: AssessmentJobRecord };
        if (!closed && parsed.job) {
          onJobUpdated(parsed.job);
          return;
        }
      } catch {
        // Fallback to direct fetch
      }
      void pollOnce();
    };

    try {
      source = new EventSource(`/api/rotation-assessments/${encodeURIComponent(job.jobId)}/events`);
      source.onmessage = (ev) => handlePacket(ev.data);
      source.addEventListener('job_event', () => {
        void pollOnce();
      });
      source.addEventListener('job_state', (ev) => {
        handlePacket((ev as MessageEvent).data);
      });
      source.onerror = () => {
        // Polling fallback continues
      };
    } catch {
      // EventSource unsupported -> polling handles updates
    }

    const pollTimer = window.setInterval(() => {
      void pollOnce();
    }, 450);

    return () => {
      closed = true;
      window.clearInterval(pollTimer);
      source?.close();
    };
  }, [job.jobId, isTerminal, onJobUpdated]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await cancelAssessmentJobApi(job.jobId);
      onJobUpdated(res.job);
    } finally {
      setCancelling(false);
    }
  };

  // Strictly include ONLY stages that have already begun or finished in job.events (no pre-shown future steps!)
  const activeStageTimeline = useMemo(() => {
    return STAGE_META.map((meta) => {
      const evs = job.events.filter((e) => e.stageKey === meta.key);
      if (evs.length === 0) return null;
      const topEvent = evs.find((e) => !e.parentEventId) ?? evs[0];
      const children = evs.filter((e) => e.parentEventId);
      return {
        ...meta,
        topEvent,
        children,
        state: topEvent.state,
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [job.events]);

  const cardSurface = isLight
    ? 'fs-qst-subpanel text-[#072622]'
    : 'fs-qst-subpanel text-[#E6F8F3]';
  const subCls = isLight ? 'text-[#245A52]' : 'text-[#A7D9CF]';
  const totalSecs = Math.max(0, Math.round(totalElapsedMs / 1000));

  const renderActionIcon = (kind: (typeof STAGE_META)[number]['icon'], running: boolean) => {
    const cls = `w-4 h-4 shrink-0 ${
      running ? 'text-[#2DD4BF]' : isLight ? 'text-[#0F766E]' : 'text-[#7DD3FC]'
    }`;
    if (kind === 'shield') return <ShieldCheck className={cls} />;
    if (kind === 'globe') return <Globe2 className={cls} />;
    if (kind === 'calc') return <Calculator className={cls} />;
    if (kind === 'sprout') return <Sprout className={cls} />;
    return <FolderKanban className={cls} />;
  };

  return (
    <div className="space-y-5">
      {/* Action History Container (Screenshot-Inspired Progressive Feed) */}
      <div className={`rounded-[24px] overflow-hidden ${cardSurface}`}>
        {/* Top Bar: Action history + live elapsed */}
        <div className="px-5 py-3.5 border-b border-[#0F766E]/12 dark:border-white/12 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <ListChecks className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF] shrink-0" />
            <span className="text-sm font-semibold">Action history</span>
            <span className={`text-xs truncate ${subCls}`}>
              · {job.farmName} ({job.fieldName})
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className={`inline-flex items-center gap-1.5 text-xs font-mono tabular-nums ${subCls}`}>
              {!isTerminal && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2DD4BF]" />}
              <Clock className="w-3.5 h-3.5 opacity-75" />
              <span>
                {isTerminal
                  ? `Ran for ${totalElapsedMs < 1000 ? `${(totalElapsedMs / 1000).toFixed(1)}s` : `${totalSecs}s`}`
                  : `${totalSecs}s`}
              </span>
            </div>

            {!isTerminal && (
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancel}
                className="px-3 py-1 rounded-full text-xs font-semibold border border-rose-400/45 bg-rose-500/12 text-rose-700 dark:text-rose-200 hover:bg-rose-500/22 cursor-pointer"
              >
                {cancelling ? 'Cancelling...' : 'Cancel'}
              </button>
            )}
          </div>
        </div>

        {/* Progressive Live Timeline */}
        <div className="p-5 space-y-5">
          {activeStageTimeline.length === 0 && (
            <div className="flex items-center gap-3 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-[#2DD4BF] shrink-0" />
              <span className={subCls}>Starting analysis...</span>
            </div>
          )}

          {activeStageTimeline.map((st, idx) => {
            const isRunning = st.state === 'running';
            const isFailed = st.state === 'failed' || st.state === 'cancelled';
            // Auto-expand while active if user hasn't explicitly collapsed/toggled it, or follow user toggle
            const isOpen =
              expandedStages[st.key] !== undefined
                ? expandedStages[st.key]
                : isRunning;
            const toggle = () =>
              setExpandedStages((prev) => ({ ...prev, [st.key]: !isOpen }));

            const thoughtText = formatThoughtSeconds(
              st.state,
              st.topEvent.startedAt,
              st.topEvent.durationMs,
              nowMs,
              st.thinkingVerb
            );

            return (
              <motion.div
                key={st.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-2.5"
              >
                {/* 1. Lightbulb Thinking / Elapsed Seconds Row */}
                <div className="flex items-center gap-2.5 text-sm">
                  <Lightbulb
                    className={`w-4 h-4 shrink-0 ${
                      isRunning
                        ? 'text-[#38BDF8] animate-pulse'
                        : isFailed
                          ? 'text-rose-400'
                          : isLight
                            ? 'text-[#0F766E]'
                            : 'text-[#86EFAC]'
                    }`}
                  />
                  <span
                    className={`font-medium tabular-nums ${
                      isRunning
                        ? isLight
                          ? 'text-[#072622]'
                          : 'text-white'
                        : subCls
                    }`}
                  >
                    {thoughtText}
                  </span>
                </div>

                {/* 2. Action Row + Dropdown Button */}
                <div className="pl-0.5 space-y-2">
                  <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={isOpen}
                    className="w-full flex items-start justify-between gap-3 text-left group cursor-pointer rounded-xl py-1 px-1.5 -mx-1.5 hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="mt-0.5">
                        {isFailed ? (
                          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        ) : (
                          renderActionIcon(st.icon, isRunning)
                        )}
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-semibold leading-snug">
                          {isRunning ? st.topEvent.label : st.actionTitle}
                        </div>
                        <div className={`text-xs leading-relaxed ${subCls}`}>
                          {st.children.length > 0 && !isOpen
                            ? `${st.children.length} step${st.children.length === 1 ? '' : 's'} — click to view calculation & API details`
                            : st.topEvent.detail}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      {st.topEvent.durationMs !== null && (
                        <span className={`text-[11px] font-mono tabular-nums ${subCls}`}>
                          {formatStepDuration(st.topEvent.durationMs)}
                        </span>
                      )}
                      {st.children.length > 0 && (
                        <span
                          className={`w-6 h-6 rounded-full grid place-items-center transition-colors ${
                            isLight
                              ? 'bg-[#0F766E]/10 text-[#0F766E] group-hover:bg-[#0F766E]/18'
                              : 'bg-white/[0.08] text-[#99F6E4] group-hover:bg-white/[0.15]'
                          }`}
                        >
                          {isOpen ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* 3. Expandable Dropdown Detail: Sequential Bullets Connected by Downward Arrows */}
                  {isOpen && st.children.length > 0 && (
                    <div
                      className={`ml-6 pl-3.5 py-2 pr-2 rounded-[14px] border space-y-1 ${
                        isLight
                          ? 'bg-white/35 border-[#0F766E]/20'
                          : 'bg-black/20 border-[#38BDF8]/20'
                      }`}
                    >
                      {st.children.map((ch, chIdx) => {
                        const chRunning = ch.state === 'running';
                        return (
                          <React.Fragment key={ch.eventId}>
                            <div className="flex items-start justify-between gap-2.5 text-xs py-1">
                              <div className="flex items-start gap-2 min-w-0">
                                <span
                                  className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                                    chRunning
                                      ? 'bg-[#38BDF8] animate-pulse'
                                      : ch.state === 'skipped'
                                        ? 'bg-slate-400'
                                        : ch.state === 'partial'
                                          ? 'bg-amber-400'
                                          : 'bg-[#2DD4BF]'
                                  }`}
                                />
                                <div className="min-w-0">
                                  <div className="font-medium leading-snug">
                                    {ch.label}
                                  </div>
                                  {ch.detail && (
                                    <div className={`text-[11px] mt-0.5 leading-snug ${subCls}`}>
                                      {ch.detail}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {ch.cacheStatus && (
                                  <span
                                    className={`text-[10px] font-mono ${
                                      ch.cacheStatus === 'live'
                                        ? 'text-emerald-600 dark:text-emerald-300'
                                        : ch.cacheStatus === 'cache'
                                          ? 'text-sky-600 dark:text-sky-300'
                                          : subCls
                                    }`}
                                  >
                                    {ch.cacheStatus === 'cache' &&
                                    ch.cacheAgeMinutes !== undefined &&
                                    ch.cacheAgeMinutes !== null
                                      ? `cached ${ch.cacheAgeMinutes}m`
                                      : ch.cacheStatus}
                                  </span>
                                )}
                                <span className={`text-[11px] font-mono tabular-nums ${subCls}`}>
                                  {chRunning ? '...' : formatStepDuration(ch.durationMs)}
                                </span>
                              </div>
                            </div>

                            {chIdx < st.children.length - 1 && (
                              <div className="pl-0.5 py-0.5 flex items-center" aria-hidden="true">
                                <ArrowDown className="w-3 h-3 text-[#38BDF8]/75" />
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>

                {idx < activeStageTimeline.length - 1 && (
                  <div className="border-b border-[#0F766E]/10 dark:border-white/10 pt-1" />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Continue Action Once Assessment Finishes */}
      {job.result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex justify-end"
        >
          <button
            type="button"
            onClick={() => onContinueToRotation(job.inputSnapshotId, job.result!)}
            className="min-h-[44px] inline-flex items-center gap-2 px-7 py-2.5 rounded-full text-sm font-bold text-[#031F1C] bg-gradient-to-r from-[#14B89A] via-[#2DD4BF] to-[#5EEAD4] shadow-[0_8px_22px_rgba(20,184,154,0.32)] hover:brightness-105 cursor-pointer transition-all"
          >
            <span>Continue to Rotation Planner</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {(job.state === 'failed' || job.state === 'cancelled') && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-rose-500">
            {job.errorMessage || 'Assessment did not finish. You can adjust inputs and retry.'}
          </div>
          <button
            type="button"
            onClick={onBackToReview}
            className="px-4 py-2 rounded-full text-xs font-semibold border border-current/25 cursor-pointer"
          >
            Back to Review
          </button>
        </div>
      )}
    </div>
  );
};
