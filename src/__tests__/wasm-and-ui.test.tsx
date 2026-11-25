import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import initSqlJs, { type Database } from 'sql.js';
import { describe, expect, it } from 'vitest';
import { CodeInputBar } from '../components/CodeInputBar';
import { ScrollDrumDeck } from '../components/ScrollDrumDeck';
import { SegmentExplanation } from '../components/SegmentExplanation';
import {
  getCustomChips,
  getDbStats,
  upsertCustomChip,
} from '../db/queries';
import type { SqlExecutor, SqlParam } from '../db/types';
import { decodeMemoryCode } from '../decoder/engine';

function wrapSqlJs(db: Database): SqlExecutor {
  return {
    queryAll<T extends Record<string, unknown>>(sql: string, params: SqlParam[] = []): T[] {
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      stmt.free();
      return rows;
    },
    queryOne<T extends Record<string, unknown>>(sql: string, params: SqlParam[] = []): T | null {
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      const row = stmt.step() ? (stmt.getAsObject() as T) : null;
      stmt.free();
      return row;
    },
    execute(sql: string, params: SqlParam[] = []): void {
      if (params.length > 0) {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        stmt.step();
        stmt.free();
      } else {
        db.run(sql);
      }
    },
  };
}

function loadWasmArrayBuffer(): ArrayBuffer {
  const buf = readFileSync(resolve(process.cwd(), 'public/wasm/sql-wasm.wasm'));
  return Uint8Array.from(buf).buffer;
}

describe('sql.js WASM Runtime & React UI Render Integration', () => {
  it('loads bundled sql-wasm.wasm + secmemory.sqlite and round-trips custom chip binary export', async () => {
    const wasmBinary = loadWasmArrayBuffer();
    const sqliteBytes = readFileSync(resolve(process.cwd(), 'public/db/secmemory.sqlite'));

    const candidate = initSqlJs as unknown as { default?: typeof initSqlJs };
    const init = typeof initSqlJs === 'function' ? initSqlJs : candidate.default!;
    const SQL = await init({
      wasmBinary,
      useOldExtensionFunctions: false,
    });

    const db = new SQL.Database(sqliteBytes);
    const exec = wrapSqlJs(db);

    const stats = getDbStats(exec);
    expect(stats.familyCount).toBe(14);
    expect(stats.knownChipCount).toBe(46);

    const decoded = decodeMemoryCode(exec, 'K4AAG085WB-BCWE');
    expect(decoded.status).toBe('decoded');
    expect(decoded.summary?.densityDisplay).toBe('16 Gb (2 GB)');

    upsertCustomChip(exec, {
      partNumber: 'K4AAG085WB-BCWE',
      familyHint: 'K4A',
      labelKo: 'WASM 테스트 칩',
      notesKo: '바이너리 내보내기 검증용',
    });

    const exported = db.export();
    db.close();

    const reopened = new SQL.Database(exported);
    const reopenedExec = wrapSqlJs(reopened);
    const customList = getCustomChips(reopenedExec);
    expect(customList).toHaveLength(1);
    expect(customList[0].label_ko).toBe('WASM 테스트 칩');
    reopened.close();
  });

  it('renders blank initial state, decoded K4AAG085WB-BCWE, and multi-line top marking cleanly', async () => {
    const wasmBinary = loadWasmArrayBuffer();
    const sqliteBytes = readFileSync(resolve(process.cwd(), 'public/db/secmemory.sqlite'));
    const candidate = initSqlJs as unknown as { default?: typeof initSqlJs };
    const init = typeof initSqlJs === 'function' ? initSqlJs : candidate.default!;
    const SQL = await init({
      wasmBinary,
      useOldExtensionFunctions: false,
    });

    const db = new SQL.Database(sqliteBytes);
    const exec = wrapSqlJs(db);
    const noop = () => {};

    // 1. Blank initial state
    const emptyDecoded = decodeMemoryCode(exec, '');
    const emptyHtml = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(CodeInputBar, {
          rawInput: '',
          decoded: emptyDecoded,
          onChangeInput: noop,
          onClearInput: noop,
        }),
        React.createElement(ScrollDrumDeck, {
          segments: emptyDecoded.segments,
          isStandby: true,
          activeSlotOrder: 4,
          onActivateColumn: noop,
          onSelectOption: noop,
        }),
        React.createElement(SegmentExplanation, {
          decoded: emptyDecoded,
          activeSlotOrder: 4,
          onActivateColumn: noop,
          onSelectOption: noop,
          onPickSampleCode: noop,
        }),
      ),
    );
    expect(emptyHtml).toContain('value=""');
    expect(emptyHtml).toContain('placeholder=""');
    expect(emptyHtml).toContain('drum-standby-dash');
    expect(emptyHtml).toContain('K4AAG085WB-BCWE'); // Quick sample chip button

    // 2. Full part number K4AAG085WB-BCWE
    const ddr4Decoded = decodeMemoryCode(exec, 'K4AAG085WB-BCWE');
    const ddr4Html = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(CodeInputBar, {
          rawInput: 'K4AAG085WB-BCWE',
          decoded: ddr4Decoded,
          onChangeInput: noop,
          onClearInput: noop,
        }),
        React.createElement(ScrollDrumDeck, {
          segments: ddr4Decoded.segments,
          isStandby: false,
          activeSlotOrder: 4,
          onActivateColumn: noop,
          onSelectOption: noop,
        }),
        React.createElement(SegmentExplanation, {
          decoded: ddr4Decoded,
          activeSlotOrder: 4,
          onActivateColumn: noop,
          onSelectOption: noop,
          onPickSampleCode: noop,
        }),
      ),
    );
    expect(ddr4Html).toContain('16 Gb (2 GB)');
    expect(ddr4Html).toContain('DDR4-3200');
    expect(ddr4Html).toContain('B-die');
    expect(ddr4Html).toContain('78-Ball FBGA');
    expect(ddr4Html).toContain('16 GB');
    expect(ddr4Html).toContain('role="region"');
    expect(ddr4Html).toContain('aria-labelledby="breakdown-table-title"');

    // 3. Multi-line physical chip marking
    const multiDecoded = decodeMemoryCode(exec, 'SEC 216 BCWE\nK4AAG08 5WB\nGPB1349R');
    const multiHtml = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(CodeInputBar, {
          rawInput: 'SEC 216 BCWE\nK4AAG08 5WB\nGPB1349R',
          decoded: multiDecoded,
          onChangeInput: noop,
          onClearInput: noop,
        }),
        React.createElement(SegmentExplanation, {
          decoded: multiDecoded,
          activeSlotOrder: 4,
          onActivateColumn: noop,
          onSelectOption: noop,
          onPickSampleCode: noop,
        }),
      ),
    );
    expect(multiHtml).toContain('SEC');
    expect(multiHtml).toContain('2022년 16주차');
    expect(multiHtml).toContain('GPB1349R');
    expect(multiHtml).toContain('K4AAG085WB-BCWE');

    db.close();
  });
});
