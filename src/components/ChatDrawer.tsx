import React, { useEffect, useRef, useState } from 'react';
import { Leaf, Send, X, Loader2 } from 'lucide-react';
import { AnchorAnalysis, ChatMessage } from '../types';
import { askAnchorChat } from '../services/gemini';
import { useMode } from '../context/ModeContext';
import { AIBadge } from './AIBadge';

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
  analysis: AnchorAnalysis | null;
}

const SPACE_SUGGESTED_QUESTIONS = [
  'What is the biggest weather risk here?',
  'Which NASA datasets support this score?',
  'How reliable is the rainfall history for this date?',
  'What backup plans should I prepare?',
];

const PLANT_SUGGESTED_QUESTIONS = [
  'Is this soil & rainfall window safe for planting?',
  'Which frost or heat risks could stress seedlings?',
  'How much irrigation might my field need?',
  'Which NASA datasets support this Grow Score?',
];

export const ChatDrawer: React.FC<ChatDrawerProps> = ({ open, onClose, analysis }) => {
  const { isPlantMode } = useMode();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const suggestedQuestions = isPlantMode ? PLANT_SUGGESTED_QUESTIONS : SPACE_SUGGESTED_QUESTIONS;

  useEffect(() => {
    setMessages([]);
  }, [analysis?.id]);

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
    if (!q || !analysis || loading) return;

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
        place: analysis.place,
        targetDate: analysis.targetDate,
        endDate: analysis.endDate,
        activity: analysis.activityId,
        finalScore: analysis.finalScore,
        dataScore: analysis.deterministic.dataScore,
        verdict: analysis.finalVerdict,
        subScores: analysis.deterministic.subScores,
        powerMeans: analysis.power
          ? {
              yearsAnalyzed: analysis.power.yearsAnalyzed,
              meanMaxC: analysis.power.meanMaxC,
              meanMinC: analysis.power.meanMinC,
              meanPrecipMm: analysis.power.meanPrecipMm,
              meanWindMs: analysis.power.meanWindMs,
              meanHumidityPct: analysis.power.meanHumidityPct,
            }
          : null,
        nearbyEvents: analysis.eonet?.nearbyEvents ?? [],
        dataGaps: analysis.ai?.dataGaps ?? analysis.deterministic.dataGaps,
      };

      const res = await askAnchorChat({
        message: q,
        history: messages.map((m) => ({ role: m.role, text: m.text })),
        context,
        mode: 'anchor',
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
    <div className="fs-drawer-backdrop no-print" role="dialog" aria-modal="true" aria-label="Ask Anchor chat" onClick={onClose}>
      <aside
        className="fs-drawer-shell relative z-10 w-full max-w-md h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fs-modal-header px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isPlantMode && <Leaf className="w-4 h-4 text-teal-600 dark:text-[#2DD4BF]" aria-hidden="true" />}
            <h2 className="text-base font-display font-bold text-[#072622] dark:text-[#ECF8F5]">
              {isPlantMode ? 'Ask Field Guide' : 'Ask Anchor'}
            </h2>
            <AIBadge />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Ask Anchor drawer"
            className="w-9 h-9 rounded-full border border-teal-700/20 dark:border-teal-300/25 bg-white/60 dark:bg-white/[0.06] flex items-center justify-center text-[#18463F] dark:text-[#C8E4DE] hover:bg-teal-500/15 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-teal-700/15 dark:border-teal-300/15 bg-white/35 dark:bg-white/[0.025] text-[13px] text-[#2B5E56] dark:text-[#92C2B8]">
          Grounded strictly in NASA POWER &amp; EONET data for{' '}
          <strong className="text-[#072622] dark:text-[#ECF8F5]">{analysis?.place.name}</strong> on{' '}
          <span className="font-mono text-teal-700 dark:text-[#5EEAD4]">{analysis?.targetDate}</span>.
        </div>

        <div className="flex-1 overflow-y-auto fs-thin-scroll p-6 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-[13px] text-[#2B5E56] dark:text-[#92C2B8]">
                Ask any question about this score or try a suggested prompt:
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((q) => (
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
              <span>Checking NASA dataset context...</span>
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
            placeholder="Ask about rainfall, heat, hazards..."
            className="flex-1 min-h-[44px] px-4 rounded-full bg-white/75 dark:bg-black/25 border border-teal-700/20 dark:border-teal-300/25 text-sm text-[#072622] dark:text-white placeholder:text-[#2B5E56]/60 dark:placeholder:text-[#92C2B8]/60 focus:outline-none focus:border-teal-600 dark:focus:border-[#2DD4BF]"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || !analysis}
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
