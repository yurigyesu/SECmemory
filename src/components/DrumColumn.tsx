import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DecodedSegment } from '../decoder/engine';

const ROW_HEIGHT = 44;

interface DrumColumnProps {
  segment: DecodedSegment;
  isStandby: boolean;
  isActiveColumn: boolean;
  tabIndex: number;
  onActivateColumn: (slotOrder: number) => void;
  onSelectOption: (slotOrder: number, codeValue: string) => void;
}

export const DrumColumn: React.FC<DrumColumnProps> = ({
  segment,
  isStandby,
  isActiveColumn,
  tabIndex,
  onActivateColumn,
  onSelectOption,
}) => {
  const { slot, value } = segment;
  const options = slot.options;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isProgrammaticRef = useRef(false);
  const programResetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wheelLockRef = useRef(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  const selectedIndex = options.findIndex((opt) => opt.code_value === value);
  const defaultVisualIndex = Math.min(Math.max(0, Math.floor(options.length / 2)), Math.max(0, options.length - 1));
  const targetIndex = selectedIndex >= 0 ? selectedIndex : defaultVisualIndex;

  // Programmatically align scroller with active value without triggering scroll echo
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || slot.is_separator === 1 || options.length === 0) return;

    const desiredTop = targetIndex * ROW_HEIGHT;
    if (Math.abs(scroller.scrollTop - desiredTop) > 2) {
      isProgrammaticRef.current = true;
      scroller.scrollTo({ top: desiredTop, behavior: 'auto' });
      clearTimeout(programResetTimerRef.current);
      programResetTimerRef.current = setTimeout(() => {
        isProgrammaticRef.current = false;
      }, 90);
    }
    setPendingCode(null);
  }, [targetIndex, slot.is_separator, options.length, isStandby]);

  const commitValue = useCallback(
    (codeVal: string) => {
      if (!codeVal) return;
      if (isStandby || codeVal !== value) {
        onSelectOption(slot.slot_order, codeVal);
      }
    },
    [isStandby, value, onSelectOption, slot.slot_order],
  );

  // Native Scroll Snap Events (scrollsnapchanging / scrollsnapchange) + geometric fallback
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || slot.is_separator === 1 || options.length === 0) return;

    const findClosestIndex = (): number => {
      const idx = Math.round(scroller.scrollTop / ROW_HEIGHT);
      return Math.max(0, Math.min(options.length - 1, idx));
    };

    const supportsSnapEvents =
      'onscrollsnapchanging' in Element.prototype && 'onscrollsnapchange' in HTMLElement.prototype;

    if (supportsSnapEvents) {
      const handleSnapChanging = (event: Event) => {
        if (isProgrammaticRef.current) return;
        const snapEvent = event as Event & { snapTargetBlock?: HTMLElement | null };
        const code = snapEvent.snapTargetBlock?.dataset.code ?? null;
        if (code) setPendingCode(code);
      };

      const handleSnapChange = (event: Event) => {
        if (isProgrammaticRef.current) return;
        const snapEvent = event as Event & { snapTargetBlock?: HTMLElement | null };
        const code = snapEvent.snapTargetBlock?.dataset.code;
        setPendingCode(null);
        if (code) commitValue(code);
      };

      scroller.addEventListener('scrollsnapchanging', handleSnapChanging);
      scroller.addEventListener('scrollsnapchange', handleSnapChange);
      return () => {
        scroller.removeEventListener('scrollsnapchanging', handleSnapChanging);
        scroller.removeEventListener('scrollsnapchange', handleSnapChange);
      };
    }

    // Fallback for browsers lacking Scroll Snap Events (Firefox/Safari)
    let rafId: number | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const promoteClosest = () => {
      if (isProgrammaticRef.current) return;
      const idx = findClosestIndex();
      const opt = options[idx];
      setPendingCode(null);
      if (opt) commitValue(opt.code_value);
    };

    const handleScroll = () => {
      if (isProgrammaticRef.current) return;
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const idx = findClosestIndex();
          const opt = options[idx];
          if (opt) setPendingCode(opt.code_value);
        });
      }
      clearTimeout(settleTimer);
      settleTimer = setTimeout(promoteClosest, 110);
    };

    const handleScrollEnd = () => {
      clearTimeout(settleTimer);
      promoteClosest();
    };

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    scroller.addEventListener('scrollend', handleScrollEnd);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      clearTimeout(settleTimer);
      scroller.removeEventListener('scroll', handleScroll);
      scroller.removeEventListener('scrollend', handleScrollEnd);
    };
  }, [options, slot.is_separator, commitValue]);

  const stepIndex = useCallback(
    (delta: number) => {
      if (options.length === 0) return;
      const baseIdx = isStandby
        ? delta > 0
          ? -1
          : options.length
        : selectedIndex >= 0
          ? selectedIndex
          : 0;
      const nextIdx = Math.max(0, Math.min(options.length - 1, baseIdx + delta));
      const nextOpt = options[nextIdx];
      if (!nextOpt) return;

      onActivateColumn(slot.slot_order);
      isProgrammaticRef.current = true;
      scrollerRef.current?.scrollTo({ top: nextIdx * ROW_HEIGHT, behavior: 'smooth' });
      clearTimeout(programResetTimerRef.current);
      programResetTimerRef.current = setTimeout(() => {
        isProgrammaticRef.current = false;
      }, 220);
      commitValue(nextOpt.code_value);
    },
    [options, isStandby, selectedIndex, onActivateColumn, slot.slot_order, commitValue],
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || slot.is_separator === 1 || options.length <= 1) return;

    const handleNativeWheel = (e: WheelEvent) => {
      const delta = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
      if (delta === 0) return;
      e.preventDefault();
      if (wheelLockRef.current) return;
      wheelLockRef.current = true;
      setTimeout(() => {
        wheelLockRef.current = false;
      }, 65);
      stepIndex(delta);
    };

    scroller.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', handleNativeWheel);
    };
  }, [slot.is_separator, options.length, stepIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (slot.is_separator === 1) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      stepIndex(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      stepIndex(-1);
    }
  };

  if (slot.is_separator === 1) {
    return (
      <div className="drum-column-shell" aria-hidden="true">
        <div className="drum-separator-cell">{isStandby ? '—' : '-'}</div>
      </div>
    );
  }

  return (
    <div
      className={`drum-column-shell${isActiveColumn ? ' is-active' : ''}`}
      data-slot-order={slot.slot_order}
      onMouseEnter={() => onActivateColumn(slot.slot_order)}
    >
      <div
        ref={scrollerRef}
        className="drum-scroller"
        tabIndex={tabIndex}
        role="region"
        aria-label={`${slot.label_ko} (${slot.label_en}) 코드 선택 드럼`}
        data-drum-scroller="true"
        onFocus={() => onActivateColumn(slot.slot_order)}
        onKeyDown={handleKeyDown}
      >
        <div className="drum-spacer" aria-hidden="true" />
        {options.map((opt, idx) => {
          const isCurrent = !isStandby && value === opt.code_value;
          const isPending = pendingCode === opt.code_value;
          return (
            <button
              key={opt.id}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              type="button"
              tabIndex={-1}
              data-code={opt.code_value}
              aria-current={isCurrent ? 'true' : undefined}
              title={`${opt.code_value}: ${opt.title_ko}`}
              className={`drum-option-btn${isPending ? ' is-pending' : ''}`}
              onClick={() => {
                onActivateColumn(slot.slot_order);
                isProgrammaticRef.current = true;
                scrollerRef.current?.scrollTo({ top: idx * ROW_HEIGHT, behavior: 'smooth' });
                clearTimeout(programResetTimerRef.current);
                programResetTimerRef.current = setTimeout(() => {
                  isProgrammaticRef.current = false;
                }, 220);
                commitValue(opt.code_value);
              }}
            >
              {opt.short_label}
            </button>
          );
        })}
        <div className="drum-spacer" aria-hidden="true" />
      </div>

      {isStandby && (
        <div className="drum-standby-dash" aria-hidden="true">
          —
        </div>
      )}
    </div>
  );
};
