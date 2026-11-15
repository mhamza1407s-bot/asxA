import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { RotationPlanCandidate } from '../../lib/rotationPlannerEngine';

export interface RotationSelectDropdownProps {
  id: string;
  labelId?: string;
  slotLabel: string;
  otherSlotLabel?: string;
  plans: RotationPlanCandidate[];
  selectedPlan: RotationPlanCandidate;
  otherSelectedPlanId?: string;
  accent?: 'emerald' | 'teal';
  onSelect: (planId: string) => void;
  onOpenChange?: (open: boolean) => void;
}

export const RotationSelectDropdown: React.FC<RotationSelectDropdownProps> = ({
  id,
  labelId,
  slotLabel,
  otherSlotLabel,
  plans,
  selectedPlan,
  otherSelectedPlanId,
  accent = 'emerald',
  onSelect,
  onOpenChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(() => {
    const idx = plans.findIndex((p) => p.id === selectedPlan.id);
    return idx >= 0 ? idx : 0;
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const listboxId = `${id}-listbox`;

  const setOpenState = useCallback(
    (next: boolean, restoreTriggerFocus = false) => {
      setIsOpen(next);
      onOpenChange?.(next);
      if (next) {
        const selectedIdx = plans.findIndex((p) => p.id === selectedPlan.id);
        setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
        requestAnimationFrame(() => {
          listboxRef.current?.focus({ preventScroll: true });
        });
      } else if (restoreTriggerFocus) {
        requestAnimationFrame(() => {
          triggerRef.current?.focus({ preventScroll: true });
        });
      }
    },
    [onOpenChange, plans, selectedPlan.id]
  );

  // Sync highlighted option when external selection or candidate list changes
  useEffect(() => {
    const idx = plans.findIndex((p) => p.id === selectedPlan.id);
    if (idx >= 0) {
      setHighlightedIndex(idx);
    } else if (plans.length > 0) {
      setHighlightedIndex(0);
    }
  }, [plans, selectedPlan.id]);

  // Ensure highlighted option scrolls smoothly into view inside the listbox
  useEffect(() => {
    if (!isOpen) return;
    const activeEl = optionRefs.current[highlightedIndex];
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, highlightedIndex]);

  // Dismiss on outside click or focus leaving the component
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        setOpenState(false, false);
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        setOpenState(false, false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [isOpen, setOpenState]);

  const handleCommit = useCallback(
    (planId: string) => {
      onSelect(planId);
      setOpenState(false, true);
    },
    [onSelect, setOpenState]
  );

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (plans.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) {
        const selectedIdx = plans.findIndex((p) => p.id === selectedPlan.id);
        const startIdx =
          selectedIdx >= 0
            ? selectedIdx
            : e.key === 'ArrowUp'
              ? plans.length - 1
              : 0;
        setHighlightedIndex(startIdx);
        setOpenState(true);
      } else if (e.key === 'ArrowDown') {
        setHighlightedIndex((prev) => (prev + 1) % plans.length);
      } else if (e.key === 'ArrowUp') {
        setHighlightedIndex((prev) => (prev - 1 + plans.length) % plans.length);
      } else {
        const chosen = plans[highlightedIndex];
        if (chosen) handleCommit(chosen.id);
      }
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      setOpenState(false, true);
    }
  };

  const handleListboxKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (plans.length === 0) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % plans.length);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + plans.length) % plans.length);
        break;
      }
      case 'Home': {
        e.preventDefault();
        setHighlightedIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        setHighlightedIndex(plans.length - 1);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const chosen = plans[highlightedIndex];
        if (chosen) handleCommit(chosen.id);
        break;
      }
      case 'Escape': {
        e.preventDefault();
        setOpenState(false, true);
        break;
      }
      case 'Tab': {
        setOpenState(false, false);
        break;
      }
      default:
        break;
    }
  };

  const isEmerald = accent === 'emerald';
  const highlightedPlan = plans[highlightedIndex] ?? selectedPlan;

  return (
    <div ref={containerRef} className={`relative w-full ${isOpen ? 'z-40' : 'z-10'}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-labelledby={labelId ? `${labelId} ${id}-value` : undefined}
        aria-label={
          labelId
            ? undefined
            : `${slotLabel}: Rank #${selectedPlan.rank} ${selectedPlan.planCode} ${selectedPlan.title}, ${selectedPlan.matchScore} out of 100`
        }
        onClick={() => setOpenState(!isOpen, isOpen)}
        onKeyDown={handleTriggerKeyDown}
        className={`w-full h-11 px-3.5 rounded-xl flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer border focus-visible:outline-none focus-visible:ring-2 ${
          isOpen
            ? isEmerald
              ? 'bg-white/95 dark:bg-[#06312B] border-[#0F766E]/60 dark:border-[#24E982]/70 ring-2 ring-[#0F766E]/20 dark:ring-[#24E982]/20 shadow-md'
              : 'bg-white/95 dark:bg-[#06312B] border-[#0F766E]/60 dark:border-[#5EEAD4]/70 ring-2 ring-[#0F766E]/20 dark:ring-[#5EEAD4]/20 shadow-md'
            : 'bg-white/75 dark:bg-[#04231F]/80 hover:bg-white/95 dark:hover:bg-[#06312B] border-[#0F766E]/25 dark:border-[#2DD4BF]/35 hover:border-[#0F766E]/50 dark:hover:border-[#2DD4BF]/60'
        } ${
          isEmerald
            ? 'focus-visible:ring-[#0F766E]/45 dark:focus-visible:ring-[#24E982]/55'
            : 'focus-visible:ring-[#0F766E]/45 dark:focus-visible:ring-[#5EEAD4]/55'
        }`}
      >
        <span id={`${id}-value`} className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={`font-mono text-[11px] font-bold tabular-nums shrink-0 ${
              isEmerald
                ? 'text-[#0F766E] dark:text-[#24E982]'
                : 'text-[#0F766E] dark:text-[#5EEAD4]'
            }`}
          >
            #{selectedPlan.rank}
          </span>
          <span className="text-[13px] font-semibold text-[#072622] dark:text-white truncate min-w-0 flex-1">
            {selectedPlan.planCode}: {selectedPlan.title}
          </span>
        </span>

        <span className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[11.5px] font-bold tabular-nums text-[#1B4D46] dark:text-[#5EEAD4]">
            {selectedPlan.matchScore}/100
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            } text-[#0F766E] dark:text-[#5EEAD4]`}
            aria-hidden="true"
          />
        </span>
      </button>

      {isOpen && (
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-label={labelId ? undefined : `${slotLabel} options`}
          aria-activedescendant={
            highlightedPlan ? `${id}-option-${highlightedPlan.id}` : undefined
          }
          onKeyDown={handleListboxKeyDown}
          className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl bg-[#F4FBF9] dark:bg-[#052622] border border-[#0F766E]/25 dark:border-[#2DD4BF]/40 p-1.5 shadow-2xl max-h-72 overflow-y-auto fs-thin-scroll space-y-0.5 focus:outline-none"
        >
          {plans.map((cand, idx) => {
            const isSelected = cand.id === selectedPlan.id;
            const isHighlighted = idx === highlightedIndex;
            const isInOtherSlot = Boolean(otherSelectedPlanId && cand.id === otherSelectedPlanId);

            return (
              <button
                key={cand.id}
                ref={(el) => {
                  optionRefs.current[idx] = el;
                }}
                id={`${id}-option-${cand.id}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                onMouseEnter={() => setHighlightedIndex(idx)}
                onClick={() => handleCommit(cand.id)}
                className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer ${
                  isSelected
                    ? isEmerald
                      ? 'bg-[#0F766E]/14 dark:bg-[#24E982]/16 text-[#072622] dark:text-white font-semibold'
                      : 'bg-[#0F766E]/14 dark:bg-[#2DD4BF]/18 text-[#072622] dark:text-white font-semibold'
                    : isHighlighted
                      ? 'bg-[#0F766E]/10 dark:bg-white/[0.10] text-[#072622] dark:text-white'
                      : 'text-[#14433C] dark:text-[#CBE8E1] hover:bg-[#0F766E]/8 dark:hover:bg-white/[0.08]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`font-mono text-[11px] font-bold tabular-nums shrink-0 w-5 ${
                        isEmerald
                          ? 'text-[#0F766E] dark:text-[#24E982]'
                          : 'text-[#0F766E] dark:text-[#5EEAD4]'
                      }`}
                    >
                      #{cand.rank}
                    </span>
                    <span className="text-[12.5px] truncate min-w-0 flex-1">
                      {cand.planCode}: {cand.title}
                    </span>
                  </div>
                  {isInOtherSlot && otherSlotLabel && (
                    <div className="text-[10.5px] font-normal text-[#285E55] dark:text-[#8BC4B9] pl-7 mt-0.5">
                      Currently compared in {otherSlotLabel}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[11.5px] font-semibold tabular-nums text-[#1B4D46] dark:text-[#5EEAD4]">
                    {cand.matchScore}/100
                  </span>
                  <span className="text-[10px] font-normal tabular-nums text-[#355D56] dark:text-[#8EB8B0] hidden sm:inline">
                    (±{cand.uncertaintyMarginPts})
                  </span>
                  {isSelected && (
                    <Check
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isEmerald
                          ? 'text-[#0F766E] dark:text-[#24E982]'
                          : 'text-[#0F766E] dark:text-[#5EEAD4]'
                      }`}
                      strokeWidth={2.8}
                      aria-hidden="true"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
