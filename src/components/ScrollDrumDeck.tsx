import React, { useEffect, useRef } from 'react';
import type { DecodedSegment } from '../decoder/engine';
import { DrumColumn } from './DrumColumn';

interface ScrollDrumDeckProps {
  segments: DecodedSegment[];
  isStandby: boolean;
  activeSlotOrder: number;
  onActivateColumn: (slotOrder: number) => void;
  onSelectOption: (slotOrder: number, codeValue: string) => void;
}

export const ScrollDrumDeck: React.FC<ScrollDrumDeckProps> = ({
  segments,
  isStandby,
  activeSlotOrder,
  onActivateColumn,
  onSelectOption,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Roving tabindex fallback for browsers without native focusgroup support
  useEffect(() => {
    const group = stageRef.current;
    if (!group || 'focusGroup' in HTMLElement.prototype) return;

    const getColumns = () =>
      Array.from(group.querySelectorAll<HTMLElement>('[data-drum-scroller="true"]'));

    const syncTabIndex = () => {
      const cols = getColumns();
      const activeIdx = cols.findIndex((el) => el === document.activeElement);
      const fallbackIdx = cols.findIndex(
        (el) => Number(el.closest('[data-slot-order]')?.getAttribute('data-slot-order')) === activeSlotOrder,
      );
      const targetIdx = activeIdx >= 0 ? activeIdx : Math.max(0, fallbackIdx);
      cols.forEach((el, idx) => {
        el.tabIndex = idx === targetIdx ? 0 : -1;
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const cols = getColumns();
      const current = cols.indexOf(document.activeElement as HTMLElement);
      if (current < 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      const next = (current + delta + cols.length) % cols.length;
      cols.forEach((el, idx) => {
        el.tabIndex = idx === next ? 0 : -1;
      });
      cols[next].focus({ preventScroll: true });
    };

    group.addEventListener('focusin', syncTabIndex);
    group.addEventListener('keydown', handleKeyDown, true);
    syncTabIndex();

    return () => {
      group.removeEventListener('focusin', syncTabIndex);
      group.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [segments.length, activeSlotOrder]);

  if (segments.length === 0) {
    return null;
  }

  return (
    <section className="drum-section" aria-label="스크롤로 코드 변경">
      <div className="drum-eyebrow-row">
        <span className="drum-eyebrow">스크롤로 변경</span>
        <span className="drum-hint">휠 · 클릭 · ↑↓←→ 키로 각 자리 코드 탐색</span>
      </div>

      <div className="drum-deck-scroll">
        <div className="drum-deck-inner">
          <div className="drum-headers-row" aria-hidden="true">
            {segments.map((seg) => (
              <div
                key={seg.slot.id}
                className={`drum-slot-header${seg.slot.slot_order === activeSlotOrder ? ' is-active' : ''}`}
              >
                {seg.slot.is_separator ? '' : seg.slot.label_ko}
              </div>
            ))}
          </div>

          <div
            ref={stageRef}
            className="drum-matrix-stage"
            {...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
          >
            <div className="drum-active-bar" aria-hidden="true" />
            {segments.map((seg) => {
              const firstNonSep = segments.find((s) => s.slot.is_separator === 0)?.slot.slot_order ?? 1;
              const isTabTarget =
                seg.slot.slot_order === activeSlotOrder ||
                (activeSlotOrder === 0 && seg.slot.slot_order === firstNonSep);

              return (
                <DrumColumn
                  key={seg.slot.id}
                  segment={seg}
                  isStandby={isStandby}
                  isActiveColumn={!isStandby && seg.slot.slot_order === activeSlotOrder}
                  tabIndex={isTabTarget ? 0 : -1}
                  onActivateColumn={onActivateColumn}
                  onSelectOption={onSelectOption}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
