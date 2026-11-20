import React from 'react';
import type { DecodedMemoryResult, SegmentMatchStatus } from '../decoder/engine';
import { ModuleCalculator } from './ModuleCalculator';

interface SegmentExplanationProps {
  decoded: DecodedMemoryResult;
  activeSlotOrder: number;
  onActivateColumn: (slotOrder: number) => void;
  onSelectOption: (slotOrder: number, codeValue: string) => void;
  onPickSampleCode: (code: string) => void;
}

const QUICK_SAMPLES = [
  { code: 'K4AAG085WB-BCWE', label: 'DDR4 16Gb B-die' },
  { code: 'K4RAH086VB-BCQK', label: 'DDR5 16Gb 4800' },
  { code: 'K4ZAF325BM-HC16', label: 'GDDR6 16Gb 16Gbps' },
  { code: 'K4VAF325ZC-SC28', label: 'GDDR7 16Gb 28Gbps' },
  { code: 'K3LK7K70BM-BGCP', label: 'LPDDR5 64Gb PoP' },
  { code: 'KLUDG4UHDC-B0E1', label: 'UFS 3.1 128GB' },
  { code: 'K9DYGY8J5B-CCK0', label: 'V8 TLC 16Tb HDP' },
  { code: 'M378A2K43CB2-CTD', label: 'DDR4 16GB UDIMM' },
];

const STATUS_LABEL: Record<SegmentMatchStatus, string> = {
  exact: '공식 규격 일치',
  inferred: '추정 / 자동보정',
  unknown: '미정의 코드',
  empty: '미입력',
};

export const SegmentExplanation: React.FC<SegmentExplanationProps> = ({
  decoded,
  activeSlotOrder,
  onActivateColumn,
  onSelectOption,
  onPickSampleCode,
}) => {
  if (decoded.status === 'empty') {
    return (
      <section className="explanation-section" aria-labelledby="explanation-heading">
        <div className="section-heading-row">
          <h2 id="explanation-heading" className="section-title">
            각 코드 부분 설명
          </h2>
        </div>

        <div className="standby-panel">
          <p className="standby-lead">
            상단 <strong>입력란</strong>에 삼성전자 메모리 마킹 코드(단일 라인 또는{' '}
            <code>SEC YWW ...</code> 다중 줄 각인)를 입력하거나, 위 <strong>스크롤 드럼</strong>에서
            원하는 자리를 선택해 조합하면 각 코드 구간의 상세 규격이 표시됩니다.
          </p>

          <div className="sample-chip-list" aria-label="빠른 샘플 코드">
            {QUICK_SAMPLES.map((sample) => (
              <button
                key={sample.code}
                type="button"
                className="sample-chip-btn"
                onClick={() => onPickSampleCode(sample.code)}
              >
                <code>{sample.code}</code>
                <span>{sample.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (decoded.status === 'unrecognized') {
    return (
      <section className="explanation-section" aria-labelledby="explanation-heading">
        <div className="section-heading-row">
          <h2 id="explanation-heading" className="section-title">
            각 코드 부분 설명
          </h2>
        </div>

        <div className="standby-panel">
          <p className="standby-lead">
            입력한 <code>{decoded.canonicalCode}</code>에서 삼성전자 메모리 표준 접두사를 찾지
            못했습니다. 아래 대표 코드 형식을 참고하거나 클릭해 바로 확인해 보세요.
          </p>
          <div className="sample-chip-list">
            {QUICK_SAMPLES.map((sample) => (
              <button
                key={sample.code}
                type="button"
                className="sample-chip-btn"
                onClick={() => onPickSampleCode(sample.code)}
              >
                <code>{sample.code}</code>
                <span>{sample.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const nonSepSegments = decoded.segments.filter((s) => s.slot.is_separator === 0);
  const focusedSegment =
    nonSepSegments.find((s) => s.slot.slot_order === activeSlotOrder) ??
    nonSepSegments.find((s) => s.slot.slot_order === 4) ??
    nonSepSegments[0];

  const summary = decoded.summary!;

  return (
    <section className="explanation-section" aria-labelledby="explanation-heading">
      <div className="section-heading-row">
        <h2 id="explanation-heading" className="section-title">
          각 코드 부분 설명
        </h2>
        <span className={`status-badge is-${decoded.status === 'decoded' ? 'exact' : 'inferred'}`}>
          {decoded.status === 'decoded' ? '✓ 전체 세그먼트 규격 일치' : '◐ 부분/추정 해석 포함'}
        </span>
      </div>

      {decoded.warnings.length > 0 && (
        <div className="warning-banner" role="status">
          {decoded.warnings.join(' · ')}
        </div>
      )}

      <div className="explanation-top-grid">
        {focusedSegment && (
          <div className="panel-card spotlight-card" aria-label="선택된 코드 자리 집중 설명">
            <div className="spotlight-badge">{focusedSegment.value || '—'}</div>
            <div className="spotlight-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h3 className="spotlight-title">
                  {focusedSegment.slot.label_ko} ({focusedSegment.slot.label_en}):{' '}
                  {focusedSegment.matchedOption?.title_ko ??
                    (focusedSegment.value ? `미정의 코드 (${focusedSegment.value})` : '미입력')}
                </h3>
                <span className={`status-badge is-${focusedSegment.status}`}>
                  {STATUS_LABEL[focusedSegment.status]}
                </span>
              </div>

              <p className="spotlight-desc">
                {focusedSegment.matchedOption?.detail_ko ?? focusedSegment.slot.help_ko}
              </p>

              <div className="spotlight-options-row" aria-label="이 자리 후보 옵션">
                {focusedSegment.slot.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`pill-option${opt.code_value === focusedSegment.value ? ' is-current' : ''}`}
                    title={opt.title_ko}
                    onClick={() => onSelectOption(focusedSegment.slot.slot_order, opt.code_value)}
                  >
                    {opt.code_value}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="panel-card spec-strip-card" aria-label="핵심 스펙 요약">
          <div className="spec-cells-grid">
            <div className="spec-cell">
              <span className="spec-cell-label">제품군</span>
              <span className="spec-cell-value">{summary.category}</span>
            </div>
            <div className="spec-cell">
              <span className="spec-cell-label">용량</span>
              <span className="spec-cell-value">{summary.densityDisplay}</span>
            </div>
            <div className="spec-cell">
              <span className="spec-cell-label">구성</span>
              <span className="spec-cell-value mono">{summary.orgDisplay}</span>
            </div>
            <div className="spec-cell">
              <span className="spec-cell-label">동작 속도</span>
              <span className="spec-cell-value">{summary.speedDisplay}</span>
            </div>
            <div className="spec-cell">
              <span className="spec-cell-label">전압</span>
              <span className="spec-cell-value mono">{summary.voltage}</span>
            </div>
            <div className="spec-cell">
              <span className="spec-cell-label">다이 리비전</span>
              <span className="spec-cell-value">{summary.dieRev}</span>
            </div>
            <div className="spec-cell">
              <span className="spec-cell-label">패키지</span>
              <span className="spec-cell-value">{summary.packageSpec}</span>
            </div>
            {decoded.dateCode && (
              <div className="spec-cell">
                <span className="spec-cell-label">제조 주차</span>
                <span className="spec-cell-value">{decoded.dateCode.labelKo}</span>
              </div>
            )}
          </div>

          <ModuleCalculator summary={summary} />
        </div>
      </div>

      {decoded.knownChip && (
        <div className="panel-card" aria-label="공식 레퍼런스 칩 노트">
          <strong>{decoded.knownChip.marketing_name}</strong> — {decoded.knownChip.notes_ko}
        </div>
      )}

      {decoded.customChip && (
        <div className="panel-card" aria-label="사용자 저장 메모">
          <strong>사용자 등록 칩 ({decoded.customChip.label_ko})</strong>
          {decoded.customChip.notes_ko ? ` — ${decoded.customChip.notes_ko}` : ''}
        </div>
      )}

      <div
        tabIndex={0}
        role="region"
        aria-labelledby="breakdown-table-title"
        className="table-wrapper"
      >
        <table className="breakdown-table">
          <caption id="breakdown-table-title" className="visually-hidden">
            {decoded.canonicalCode} 세그먼트별 상세 해석표
          </caption>
          <thead>
            <tr>
              <th>코드</th>
              <th>항목</th>
              <th>상세 해석</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {nonSepSegments.map((seg) => {
              const isActive = seg.slot.slot_order === focusedSegment?.slot.slot_order;
              return (
                <tr
                  key={seg.slot.id}
                  className={isActive ? 'is-row-active' : undefined}
                  onClick={() => onActivateColumn(seg.slot.slot_order)}
                >
                  <th>{seg.value || '—'}</th>
                  <td>
                    <strong>{seg.slot.label_ko}</strong>{' '}
                    <span style={{ color: 'var(--ink-muted)', fontSize: '0.78rem' }}>
                      ({seg.slot.label_en})
                    </span>
                  </td>
                  <td>
                    {seg.matchedOption ? (
                      <>
                        <strong>{seg.matchedOption.title_ko}</strong>
                        <span style={{ color: 'var(--ink-secondary)' }}>
                          {' '}
                          — {seg.matchedOption.detail_ko}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--ink-secondary)' }}>{seg.slot.help_ko}</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge is-${seg.status}`}>
                      {STATUS_LABEL[seg.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
