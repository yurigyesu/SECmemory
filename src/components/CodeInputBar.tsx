import React, { useEffect, useRef, useState } from 'react';
import type { DecodedMemoryResult } from '../decoder/engine';
import { markFallbackInteraction, syncFieldAriaValidity } from '../utils/accessibleValidation';

interface CodeInputBarProps {
  rawInput: string;
  decoded: DecodedMemoryResult;
  onChangeInput: (nextValue: string) => void;
  onClearInput: () => void;
}

export const CodeInputBar: React.FC<CodeInputBarProps> = ({
  rawInput,
  decoded,
  onChangeInput,
  onClearInput,
}) => {
  const [isMultiLine, setIsMultiLine] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeControl = isMultiLine ? textareaRef.current : inputRef.current;
  const hasUnrecognizedError = decoded.status === 'unrecognized' && rawInput.trim().length > 0;

  // Keep native constraint validation state aligned with unrecognized status
  useEffect(() => {
    const el = isMultiLine ? textareaRef.current : inputRef.current;
    if (!el) return;
    if (hasUnrecognizedError) {
      el.setCustomValidity(
        decoded.warnings[0] ?? '삼성전자 메모리 코드 형식과 일치하지 않습니다.',
      );
    } else {
      el.setCustomValidity('');
    }
    syncFieldAriaValidity(el, false);
  }, [hasUnrecognizedError, decoded.warnings, isMultiLine, rawInput]);

  // Switch automatically to multi-line view if multi-line text is present
  useEffect(() => {
    if (/\r?\n/.test(rawInput) && !isMultiLine) {
      setIsMultiLine(true);
    }
  }, [rawInput, isMultiLine]);

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (/\r?\n/.test(pasted)) {
      e.preventDefault();
      setIsMultiLine(true);
      onChangeInput(pasted);
    }
  };

  const handleChange = (val: string, target: HTMLElement) => {
    markFallbackInteraction(target, 'input');
    onChangeInput(val);
    syncFieldAriaValidity(target, false);
  };

  const handleBlur = (target: HTMLElement) => {
    markFallbackInteraction(target, 'blur');
    syncFieldAriaValidity(target, true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeControl) {
      markFallbackInteraction(activeControl, 'blur');
      syncFieldAriaValidity(activeControl, true);
      if (hasUnrecognizedError) {
        activeControl.focus();
      }
    }
  };

  const pillSummary =
    decoded.status !== 'empty' && decoded.status !== 'unrecognized' && decoded.family && decoded.summary
      ? `${decoded.family.category} · ${decoded.summary.densityDisplay}${
          decoded.summary.dieRev !== '미지정'
            ? ` · ${decoded.summary.dieRev.replace(/\s*\([^)]*\)$/, '')}`
            : ''
        }`
      : null;

  return (
    <section className="input-section" aria-label="메모리 코드 입력">
      <form onSubmit={handleSubmit} noValidate>
        <div className="input-box-frame">
          <label htmlFor="memory-code-field" className="input-label-tag">
            입력란
          </label>

          {isMultiLine ? (
            <textarea
              ref={textareaRef}
              id="memory-code-field"
              className="code-main-textarea"
              value={rawInput}
              placeholder=""
              aria-invalid="false"
              data-error="code-input-error"
              spellCheck={false}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => handleChange(e.target.value, e.target)}
              onBlur={(e) => handleBlur(e.target)}
            />
          ) : (
            <input
              ref={inputRef}
              id="memory-code-field"
              type="text"
              className="code-main-input"
              value={rawInput}
              placeholder=""
              aria-invalid="false"
              data-error="code-input-error"
              spellCheck={false}
              autoCapitalize="characters"
              autoComplete="off"
              onPaste={handlePaste}
              onChange={(e) => handleChange(e.target.value, e.target)}
              onBlur={(e) => handleBlur(e.target)}
            />
          )}

          <div className="input-right-cluster">
            {pillSummary && <span className="input-summary-pill">{pillSummary}</span>}

            {rawInput.length > 0 && (
              <button
                type="button"
                className="input-clear-btn"
                aria-label="입력 지우기"
                onClick={onClearInput}
              >
                ×
              </button>
            )}

            <button
              type="button"
              className="input-mode-btn"
              aria-pressed={isMultiLine}
              onClick={() => setIsMultiLine((prev) => !prev)}
            >
              3줄 각인
            </button>
          </div>
        </div>

        <div id="code-input-error" className="error-msg">
          {decoded.warnings[0] ?? '인식 가능한 삼성전자 메모리 코드가 아닙니다.'}
        </div>
      </form>

      {(decoded.normalized.manufacturer ||
        decoded.dateCode ||
        decoded.normalized.lotCode ||
        decoded.normalized.isMultiLineTopMarking) && (
        <div className="top-marking-meta" aria-label="실물 칩 각인 메타 정보">
          {decoded.normalized.manufacturer && (
            <span className="meta-chip">
              제조사 <strong>{decoded.normalized.manufacturer}</strong> (Samsung Electronics)
            </span>
          )}
          {decoded.dateCode && (
            <span className="meta-chip">
              제조 주차 <strong>{decoded.dateCode.raw}</strong> ({decoded.dateCode.labelKo})
            </span>
          )}
          {decoded.normalized.lotCode && (
            <span className="meta-chip">
              로트 추적 <strong>{decoded.normalized.lotCode}</strong>
            </span>
          )}
          {decoded.canonicalCode && decoded.normalized.isMultiLineTopMarking && (
            <span className="meta-chip">
              조합 파트넘버 <strong>{decoded.canonicalCode}</strong>
            </span>
          )}
        </div>
      )}
    </section>
  );
};
