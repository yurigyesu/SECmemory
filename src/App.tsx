import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearLookupHistory,
  deleteCustomChip,
  getCustomChips,
  getDbStats,
  getKnownChips,
  getLookupHistory,
  recordLookupHistory,
  upsertCustomChip,
} from './db/queries';
import {
  exportSqliteUint8Array,
  importSqliteUint8Array,
  initBrowserDb,
  persistDb,
  resetToBundledDb,
} from './db/sqliteClient';
import type {
  CustomChipRow,
  DbStats,
  HistoryRow,
  KnownChipRow,
  SqlExecutor,
} from './db/types';
import { composeCodeFromSlotChange } from './decoder/compose';
import { decodeMemoryCode, type DecodedMemoryResult } from './decoder/engine';
import { CatalogAndDbDrawer } from './components/CatalogAndDbDrawer';
import { CodeInputBar } from './components/CodeInputBar';
import { ScrollDrumDeck } from './components/ScrollDrumDeck';
import { SegmentExplanation } from './components/SegmentExplanation';
import { TopHeader } from './components/TopHeader';
import { syncThemeFromStorage, toggleColorScheme } from './utils/theme';
import {
  buildSpecCopyText,
  copyTextToClipboard,
  readCodeFromUrl,
  syncCodeToUrl,
} from './utils/urlAndCopy';

export const App: React.FC = () => {
  const [db, setDb] = useState<SqlExecutor | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [rawInput, setRawInput] = useState<string>(() => readCodeFromUrl());
  const [activeSlotOrder, setActiveSlotOrder] = useState<number>(4);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [knownChips, setKnownChips] = useState<KnownChipRow[]>([]);
  const [customChips, setCustomChips] = useState<CustomChipRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [stats, setStats] = useState<DbStats | null>(null);

  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refreshDbViews = useCallback((executor: SqlExecutor) => {
    setKnownChips(getKnownChips(executor));
    setCustomChips(getCustomChips(executor));
    setHistory(getLookupHistory(executor));
    setStats(getDbStats(executor));
  }, []);

  useEffect(() => {
    let mounted = true;
    initBrowserDb()
      .then((executor) => {
        if (!mounted) return;
        setDb(executor);
        refreshDbViews(executor);
      })
      .catch((err) => {
        if (!mounted) return;
        setDbError(err instanceof Error ? err.message : 'SQLite 초기화 오류');
      });

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'color-scheme') syncThemeFromStorage();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      mounted = false;
      window.removeEventListener('storage', onStorage);
    };
  }, [refreshDbViews]);

  const decoded: DecodedMemoryResult | null = useMemo(() => {
    if (!db) return null;
    return decodeMemoryCode(db, rawInput);
  }, [db, rawInput]);

  // Keep URL query synced and record valid lookups into SQLite lookup_history
  useEffect(() => {
    if (!db || !decoded) return;
    syncCodeToUrl(rawInput);

    clearTimeout(historyTimerRef.current);
    if (decoded.status === 'decoded' && decoded.canonicalCode) {
      historyTimerRef.current = setTimeout(() => {
        recordLookupHistory(
          db,
          rawInput,
          decoded.canonicalCode,
          decoded.family?.family_key ?? null,
        );
        void persistDb();
        setHistory(getLookupHistory(db));
        setStats(getDbStats(db));
      }, 650);
    }
    return () => clearTimeout(historyTimerRef.current);
  }, [db, decoded, rawInput]);

  const handleSelectOption = useCallback(
    (slotOrder: number, codeValue: string) => {
      if (!db || !decoded) return;
      const familyKey = decoded.family?.family_key ?? 'K4A';
      const result = composeCodeFromSlotChange(
        db,
        decoded.canonicalCode,
        familyKey,
        slotOrder,
        codeValue,
      );
      setRawInput(result.nextCode);
      setActiveSlotOrder(slotOrder);
    },
    [db, decoded],
  );

  const handleExportDb = useCallback(() => {
    const bytes = exportSqliteUint8Array();
    const copy = new Uint8Array(bytes);
    const blob = new Blob([copy], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'secmemory.sqlite';
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleShareUrl = useCallback(async () => {
    if (!decoded || decoded.status === 'empty') return;
    syncCodeToUrl(rawInput);
    const ok = await copyTextToClipboard(window.location.href);
    if (ok) {
      setShareFeedback('링크 복사됨');
      setTimeout(() => setShareFeedback(null), 1800);
    }
  }, [decoded, rawInput]);

  const handleCopySpec = useCallback(async () => {
    if (!decoded || decoded.status === 'empty') return;
    const text = buildSpecCopyText(decoded);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopyFeedback('복사됨');
      setTimeout(() => setCopyFeedback(null), 1800);
    }
  }, [decoded]);

  if (dbError) {
    return (
      <main className="workbench">
        <div className="warning-banner" role="alert">
          데이터베이스 로드 실패: {dbError}
        </div>
      </main>
    );
  }

  if (!db || !decoded) {
    return (
      <main className="workbench">
        <div className="standby-panel">SQLite 메모리 데이터베이스(secmemory.sqlite) 로드 중...</div>
      </main>
    );
  }

  const canShareOrCopy = decoded.status !== 'empty' && decoded.status !== 'unrecognized';

  return (
    <div className="app-shell">
      <TopHeader
        canShareOrCopy={canShareOrCopy}
        shareFeedback={shareFeedback}
        copyFeedback={copyFeedback}
        onOpenCatalog={() => setIsDrawerOpen(true)}
        onShareUrl={handleShareUrl}
        onCopySpec={handleCopySpec}
        onToggleTheme={() => toggleColorScheme()}
      />

      <main className="workbench">
        <CodeInputBar
          rawInput={rawInput}
          decoded={decoded}
          onChangeInput={setRawInput}
          onClearInput={() => setRawInput('')}
        />

        <ScrollDrumDeck
          segments={decoded.segments}
          isStandby={decoded.status === 'empty'}
          activeSlotOrder={activeSlotOrder}
          onActivateColumn={setActiveSlotOrder}
          onSelectOption={handleSelectOption}
        />

        <SegmentExplanation
          decoded={decoded}
          activeSlotOrder={activeSlotOrder}
          onActivateColumn={setActiveSlotOrder}
          onSelectOption={handleSelectOption}
          onPickSampleCode={(code) => setRawInput(code)}
        />
      </main>

      <footer className="app-footer">
        <span className="mono">
          SQLite WASM · secmemory.sqlite ({stats?.knownChipCount ?? 0} chips /{' '}
          {stats?.familyCount ?? 0} families)
        </span>
        <button type="button" className="btn" onClick={handleExportDb}>
          .sqlite 내보내기
        </button>
      </footer>

      <CatalogAndDbDrawer
        isOpen={isDrawerOpen}
        currentCode={decoded.canonicalCode}
        currentFamilyKey={decoded.family?.family_key ?? null}
        knownChips={knownChips}
        customChips={customChips}
        history={history}
        stats={stats}
        onClose={() => setIsDrawerOpen(false)}
        onSelectCode={(code) => setRawInput(code)}
        onSaveCustomChip={async (payload) => {
          upsertCustomChip(db, payload);
          await persistDb();
          refreshDbViews(db);
        }}
        onDeleteCustomChip={async (id) => {
          deleteCustomChip(db, id);
          await persistDb();
          refreshDbViews(db);
        }}
        onClearHistory={async () => {
          clearLookupHistory(db);
          await persistDb();
          refreshDbViews(db);
        }}
        onExportDb={handleExportDb}
        onImportDb={async (file) => {
          const buf = new Uint8Array(await file.arrayBuffer());
          const nextDb = await importSqliteUint8Array(buf);
          setDb(nextDb);
          refreshDbViews(nextDb);
        }}
        onResetDb={async () => {
          const nextDb = await resetToBundledDb();
          setDb(nextDb);
          refreshDbViews(nextDb);
        }}
      />
    </div>
  );
};
export default App;
