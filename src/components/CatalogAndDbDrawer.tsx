import React, { useEffect, useRef, useState } from 'react';
import type {
  CustomChipRow,
  DbStats,
  HistoryRow,
  KnownChipRow,
} from '../db/types';

interface CatalogAndDbDrawerProps {
  isOpen: boolean;
  currentCode: string;
  currentFamilyKey: string | null;
  knownChips: KnownChipRow[];
  customChips: CustomChipRow[];
  history: HistoryRow[];
  stats: DbStats | null;
  onClose: () => void;
  onSelectCode: (code: string) => void;
  onSaveCustomChip: (payload: {
    partNumber: string;
    familyHint: string | null;
    labelKo: string;
    notesKo: string;
  }) => Promise<void>;
  onDeleteCustomChip: (id: number) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onExportDb: () => void;
  onImportDb: (file: File) => Promise<void>;
  onResetDb: () => Promise<void>;
}

const CATEGORIES = ['ALL', 'K4A', 'K4R', 'K4B', 'K4G', 'K4Z', 'K4V', 'K3L', 'K9', 'KLM', 'KLU', 'M_DIMM'];

export const CatalogAndDbDrawer: React.FC<CatalogAndDbDrawerProps> = ({
  isOpen,
  currentCode,
  currentFamilyKey,
  knownChips,
  customChips,
  history,
  stats,
  onClose,
  onSelectCode,
  onSaveCustomChip,
  onDeleteCustomChip,
  onClearHistory,
  onExportDb,
  onImportDb,
  onResetDb,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<'catalog' | 'custom' | 'sqlite'>('catalog');
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('ALL');
  const [customPart, setCustomPart] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [dbFeedback, setDbFeedback] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      if (currentCode && !customPart) {
        setCustomPart(currentCode);
      }
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen, currentCode, customPart]);

  const filteredKnown = knownChips.filter((chip) => {
    if (familyFilter !== 'ALL' && chip.family_key !== familyFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toUpperCase();
    return (
      chip.part_number.toUpperCase().includes(q) ||
      chip.marketing_name.toUpperCase().includes(q) ||
      chip.notes_ko.toUpperCase().includes(q) ||
      (chip.die_rev ?? '').toUpperCase().includes(q)
    );
  });

  const handleSaveCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPart.trim() || !customLabel.trim()) return;
    await onSaveCustomChip({
      partNumber: customPart,
      familyHint: currentFamilyKey,
      labelKo: customLabel,
      notesKo: customNotes,
    });
    setCustomLabel('');
    setCustomNotes('');
    setDbFeedback('SQLite user_custom_chips 테이블에 저장되었습니다.');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await onImportDb(file);
      setDbFeedback(`${file.name} 데이터베이스를 성공적으로 불러왔습니다.`);
    } catch (err) {
      setDbFeedback(err instanceof Error ? err.message : '파일 불러오기 실패');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="db-dialog"
      aria-labelledby="db-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-header">
        <h2 id="db-dialog-title" style={{ margin: 0, fontSize: '1.05rem' }}>
          삼성 메모리 카탈로그 & SQLite DB 관리
        </h2>
        <button type="button" className="btn" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="dialog-tabs" role="tablist" aria-label="카탈로그 및 DB 탭">
        <button
          type="button"
          role="tab"
          className={`btn${tab === 'catalog' ? ' btn-primary' : ''}`}
          aria-selected={tab === 'catalog'}
          onClick={() => setTab('catalog')}
        >
          대표 칩 카탈로그 ({knownChips.length})
        </button>
        <button
          type="button"
          role="tab"
          className={`btn${tab === 'custom' ? ' btn-primary' : ''}`}
          aria-selected={tab === 'custom'}
          onClick={() => setTab('custom')}
        >
          커스텀 저장 / 최근 기록 ({customChips.length}/{history.length})
        </button>
        <button
          type="button"
          role="tab"
          className={`btn${tab === 'sqlite' ? ' btn-primary' : ''}`}
          aria-selected={tab === 'sqlite'}
          onClick={() => setTab('sqlite')}
        >
          SQLite DB 파일 관리
        </button>
      </div>

      <div className="dialog-body">
        {dbFeedback && (
          <div className="warning-banner" role="status">
            {dbFeedback}
          </div>
        )}

        {tab === 'catalog' && (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                id="catalog-search"
                name="catalog-search"
                aria-label="대표 칩 카탈로그 검색"
                type="search"
                className="text-input"
                style={{ flex: '1 1 220px' }}
                placeholder="파트넘버, B-die, GDDR7, 32GB 등 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                id="catalog-family-filter"
                name="catalog-family-filter"
                className="text-input"
                style={{ width: 'auto' }}
                aria-label="제품군 필터"
                value={familyFilter}
                onChange={(e) => setFamilyFilter(e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'ALL' ? '전체 제품군' : cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="catalog-list">
              {filteredKnown.map((chip) => (
                <div key={chip.id} className="catalog-item-btn" style={{ flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <code className="mono" style={{ fontWeight: 700, fontSize: '0.96rem' }}>
                        {chip.part_number}
                      </code>
                      <span className="status-badge is-exact">{chip.family_key}</span>
                      <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                        {chip.marketing_name}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', marginTop: '0.2rem' }}>
                      {chip.density_label} · {chip.org_label} · {chip.speed_label} · {chip.voltage_label}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        onSelectCode(chip.part_number);
                        onClose();
                      }}
                    >
                      코드 불러오기
                    </button>
                    {chip.top_marking_sample && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          onSelectCode(chip.top_marking_sample!);
                          onClose();
                        }}
                      >
                        실물 각인 테스트
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'custom' && (
          <>
            <form onSubmit={handleSaveCustom} className="panel-card form-grid">
              <strong style={{ fontSize: '0.92rem' }}>새 커스텀 칩/모듈 SQLite 저장</strong>
              <input
                id="custom-chip-part"
                name="custom-chip-part"
                aria-label="커스텀 칩 파트넘버"
                type="text"
                required
                className="text-input mono"
                placeholder="파트넘버 (예: K4AAG085WB-BCWE)"
                value={customPart}
                onChange={(e) => setCustomPart(e.target.value)}
              />
              <input
                id="custom-chip-label"
                name="custom-chip-label"
                aria-label="커스텀 칩 라벨 및 용도"
                type="text"
                required
                className="text-input"
                placeholder="라벨/용도 (예: 작업실 테스트 서버 램 칩)"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
              <input
                id="custom-chip-notes"
                name="custom-chip-notes"
                aria-label="커스텀 칩 메모"
                type="text"
                className="text-input"
                placeholder="메모 (선택)"
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
              />
              <div>
                <button type="submit" className="btn btn-primary">
                  SQLite에 저장
                </button>
              </div>
            </form>

            <div>
              <h3 style={{ margin: '0.25rem 0 0.5rem', fontSize: '0.92rem' }}>
                저장된 커스텀 칩 ({customChips.length})
              </h3>
              {customChips.length === 0 ? (
                <p style={{ fontSize: '0.83rem', color: 'var(--ink-muted)' }}>
                  아직 저장된 커스텀 칩이 없습니다.
                </p>
              ) : (
                <div className="catalog-list">
                  {customChips.map((item) => (
                    <div key={item.id} className="catalog-item-btn">
                      <div>
                        <code className="mono" style={{ fontWeight: 700 }}>
                          {item.part_number}
                        </code>{' '}
                        <span>— {item.label_ko}</span>
                        {item.notes_ko && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                            {item.notes_ko}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            onSelectCode(item.part_number);
                            onClose();
                          }}
                        >
                          불러오기
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => onDeleteCustomChip(item.id)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: '0.25rem 0 0.5rem', fontSize: '0.92rem' }}>
                  최근 조회 기록 ({history.length})
                </h3>
                {history.length > 0 && (
                  <button type="button" className="btn" onClick={onClearHistory}>
                    기록 비우기
                  </button>
                )}
              </div>
              <div className="catalog-list">
                {history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="catalog-item-btn"
                    onClick={() => {
                      onSelectCode(h.raw_input);
                      onClose();
                    }}
                  >
                    <code className="mono" style={{ fontWeight: 700 }}>
                      {h.normalized_code}
                    </code>
                    <span style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>
                      {h.family_key ?? '미분류'} · {h.looked_up_at.slice(0, 16).replace('T', ' ')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'sqlite' && (
          <div className="panel-card form-grid">
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--ink-secondary)' }}>
              브라우저에서 <code>sql.js</code>(SQLite 3 WASM)로 <code>secmemory.sqlite</code>를
              직접 실행하며, 추가/변경된 내용은 IndexedDB에 자동 저장됩니다.
            </p>

            {stats && (
              <div className="spec-cells-grid">
                <div className="spec-cell">
                  <span className="spec-cell-label">스키마 버전</span>
                  <span className="spec-cell-value mono">{stats.schemaVersion}</span>
                </div>
                <div className="spec-cell">
                  <span className="spec-cell-label">제품군</span>
                  <span className="spec-cell-value mono">{stats.familyCount}</span>
                </div>
                <div className="spec-cell">
                  <span className="spec-cell-label">자리(슬롯)</span>
                  <span className="spec-cell-value mono">{stats.slotCount}</span>
                </div>
                <div className="spec-cell">
                  <span className="spec-cell-label">코드 옵션</span>
                  <span className="spec-cell-value mono">{stats.optionCount}</span>
                </div>
                <div className="spec-cell">
                  <span className="spec-cell-label">대표 칩</span>
                  <span className="spec-cell-value mono">{stats.knownChipCount}</span>
                </div>
                <div className="spec-cell">
                  <span className="spec-cell-label">커스텀 칩</span>
                  <span className="spec-cell-value mono">{stats.customChipCount}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={onExportDb}>
                .sqlite 파일 내보내기
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => fileInputRef.current?.click()}
              >
                .sqlite 파일 불러오기
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await onResetDb();
                  setDbFeedback('초기 번들 secmemory.sqlite로 복원되었습니다.');
                }}
              >
                기본 DB 초기화
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".sqlite,.db,application/x-sqlite3"
                className="visually-hidden"
                onChange={handleImportFile}
              />
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
};
