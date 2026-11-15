import React, { useEffect, useRef, useState } from 'react';
import { Leaf, Loader2, Send, X } from 'lucide-react';
import { ChatMessage, FarmAnalysisReport, FarmProfile } from '../../types';
import { askAnchorChat } from '../../services/gemini';
import { AIBadge } from '../AIBadge';

interface FarmChatDrawerProps {
  open: boolean;
  onClose: () => void;
  profile: FarmProfile;
  report: FarmAnalysisReport | null;
}

const FARM_SUGGESTED_QUESTIONS = [
  'Which information gaps matter most on my farm right now?',
  'How do my soil and watering choices interact?',
  'What rotation options avoid my restricted crops?',
  'What should I test before applying fertiliser or lime?',
];

export const FarmChatDrawer: React.FC<FarmChatDrawerProps> = ({
  open,
  onClose,
  profile,
  report,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([]);
  }, [profile.id, report?.generatedAt]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!open) return null;

  const sendQuestion = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: q,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const context = {
        farmProfile: {
          farmName: profile.location.farmName || 'Unnamed Farm',
          location: profile.location.locationLabel || profile.location.regionOrAddress || 'Unspecified',
          coordinates:
            profile.location.lat !== null && profile.location.lon !== null
              ? { lat: profile.location.lat, lon: profile.location.lon }
              : null,
          area: profile.areaValue ? `${profile.areaValue} ${profile.areaUnit}` : 'Unspecified',
          soil: profile.soil,
          water: profile.water,
          crops: profile.crops,
          planning: profile.planning,
        },
        deterministicAnalysis: report
          ? {
              completenessPct: report.completenessPct,
              missingDataSummary: report.missingDataSummary,
              excludedRestrictedCrops: report.excludedRestrictedCrops,
              externalData: {
                powerSummary: report.externalDataStatus.powerSummary,
                eonetSummary: report.externalDataStatus.eonetSummary,
              },
              sections: report.sections.map((s) => ({
                key: s.key,
                title: s.title,
                status: s.status,
                summary: s.summary,
                insufficientNotice: s.insufficientNotice,
                items: s.items.map((it) => ({
                  title: it.title,
                  detail: it.detail,
                  basis: it.basis,
                  missingInfo: it.missingInfo,
                })),
              })),
            }
          : null,
      };

      const res = await askAnchorChat({
        message: q,
        history: messages.map((m) => ({ role: m.role, text: m.text })),
        context,
        mode: 'farm',
      });

      const botMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: res.reply,
        timestamp: new Date().toISOString(),
        isFallback: res.isFallback,
      };
      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fs-drawer-backdrop no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Ask Anchor about your farm"
      onClick={onClose}
    >
      <aside
        className="fs-drawer-shell relative z-10 w-full max-w-md h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fs-modal-header px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Leaf className="w-4 h-4 text-teal-600 dark:text-[#2DD4BF]" aria-hidden="true" />
            <h2 className="text-base font-display font-bold text-[#072622] dark:text-[#ECF8F5]">
              Ask Anchor · Farm Guide
            </h2>
            <AIBadge />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Farm Guide drawer"
            className="w-9 h-9 rounded-full border border-teal-700/20 dark:border-teal-300/25 bg-white/60 dark:bg-white/[0.06] flex items-center justify-center text-[#18463F] dark:text-[#C8E4DE] hover:bg-teal-500/15 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-teal-700/15 dark:border-teal-300/15 bg-white/35 dark:bg-white/[0.025] text-[13px] text-[#2B5E56] dark:text-[#92C2B8]">
          Answers are grounded strictly in your saved farm profile, deterministic recommendations, and NASA context for{' '}
          <strong className="text-[#072622] dark:text-[#ECF8F5]">
            {profile.location.farmName || 'this farm'}
          </strong>
          .
        </div>

        <div className="flex-1 overflow-y-auto fs-thin-scroll p-6 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-[13px] text-[#2B5E56] dark:text-[#92C2B8]">
                Ask for plain-language explanations of any section or test priority:
              </p>
              <div className="flex flex-col gap-2">
                {FARM_SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => sendQuestion(q)}
                    className="fs-modal-subpanel text-left text-[13px] px-4 py-2.5 text-[#072622] dark:text-[#ECF8F5] hover:border-teal-500/50 hover:bg-teal-500/10 transition-colors cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white shadow-sm'
                    : 'fs-modal-subpanel text-[#072622] dark:text-[#ECF8F5]'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-[13px] text-[#2B5E56] dark:text-[#92C2B8]">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600 dark:text-[#2DD4BF]" />
              <span>Reviewing saved farm context...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(input);
          }}
          className="fs-modal-footer p-4 flex items-center gap-2.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your soil, water, rotation..."
            className="flex-1 min-h-[44px] px-4 rounded-full bg-white/75 dark:bg-black/25 border border-teal-700/20 dark:border-teal-300/25 text-sm text-[#072622] dark:text-white placeholder:text-[#2B5E56]/60 dark:placeholder:text-[#92C2B8]/60 focus:outline-none focus:border-teal-600 dark:focus:border-[#2DD4BF]"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className="w-11 h-11 rounded-full bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white flex items-center justify-center disabled:opacity-45 hover:brightness-105 cursor-pointer shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </aside>
    </div>
  );
};
