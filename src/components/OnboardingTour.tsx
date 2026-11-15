import React, { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { dismissTour } from '../lib/storage';

interface OnboardingTourProps {
  onClose: () => void;
}

const STEPS = [
  {
    title: '1. Pick Any Place & Future Date',
    body: 'Search any city, field, or trail worldwide and pick your target date weeks or months ahead. Anchor pulls 20+ years of NASA POWER daily climate records for that exact calendar window.',
  },
  {
    title: '2. Transparent Two-Stage Scoring',
    body: 'First, pure TypeScript formulas compute 6 sub-scores from NASA POWER & EONET v3. Then Gemini AI reviews context and may adjust by at most ±10 points with explicit reasoning.',
  },
  {
    title: '3. Explore Real Satellites & Crops',
    body: 'On the Home globe, track 11 real NASA Earth-observing satellites live, click land to analyze anywhere, or visit 12 global 3D farms with live Crop Health Scores.',
  },
];

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ onClose }) => {
  const [stepIdx, setStepIdx] = useState(0);

  const finish = () => {
    dismissTour();
    onClose();
  };

  const current = STEPS[stepIdx];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Anchor Quick Tour"
      className="fs-modal-shell fixed bottom-5 left-5 z-50 max-w-sm w-[calc(100vw-2.5rem)] p-5 no-print"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-xs font-mono font-semibold text-teal-700 dark:text-[#5EEAD4]">
          Quick Tour · {stepIdx + 1} / {STEPS.length}
        </span>
        <button
          type="button"
          onClick={finish}
          aria-label="Dismiss tour"
          className="w-7 h-7 rounded-full flex items-center justify-center border border-teal-700/15 dark:border-teal-300/20 text-[#2B5E56] dark:text-[#92C2B8] hover:text-[#072622] dark:hover:text-white cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <h3 className="text-base font-display font-bold text-[#072622] dark:text-[#ECF8F5] mb-1.5">
        {current.title}
      </h3>
      <p className="text-[13px] text-[#18463F] dark:text-[#C8E4DE] leading-relaxed mb-5">{current.body}</p>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={finish}
          className="text-xs font-semibold text-[#2B5E56] dark:text-[#92C2B8] hover:text-[#072622] dark:hover:text-white cursor-pointer"
        >
          Skip tour
        </button>

        {stepIdx < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStepIdx((i) => i + 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white hover:brightness-105 cursor-pointer shadow-sm"
          >
            <span>Next</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white hover:brightness-105 cursor-pointer shadow-sm"
          >
            <span>Got it</span>
          </button>
        )}
      </div>
    </div>
  );
};
