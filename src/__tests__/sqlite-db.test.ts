import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findFamilyByCode,
  findFamilyByTopSlots,
  getAllFamilies,
  getDbStats,
  getKnownChipByPartNumber,
  getKnownChips,
  getSlotsWithOptions,
} from '../db/queries';
import type { SqlExecutor, SqlParam } from '../db/types';

let rawDb: DatabaseSync;
let db: SqlExecutor;

beforeAll(() => {
  const dbPath = resolve(process.cwd(), 'public/db/secmemory.sqlite');
  rawDb = new DatabaseSync(dbPath, { open: true });
  db = {
    queryAll<T extends Record<string, unknown>>(sql: string, params: SqlParam[] = []): T[] {
      return rawDb.prepare(sql).all(...params) as T[];
    },
    queryOne<T extends Record<string, unknown>>(sql: string, params: SqlParam[] = []): T | null {
      return (rawDb.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    execute(sql: string, params: SqlParam[] = []): void {
      rawDb.prepare(sql).run(...params);
    },
  };
});

afterAll(() => {
  rawDb?.close();
});

describe('SQLite Database Integrity & Queries', () => {
  it('passes SQLite integrity_check and foreign_key_check', () => {
    const integrity = rawDb.prepare('PRAGMA integrity_check;').get() as Record<string, string>;
    expect(Object.values(integrity)[0]).toBe('ok');

    const fkIssues = rawDb.prepare('PRAGMA foreign_key_check;').all();
    expect(fkIssues).toHaveLength(0);
  });

  it('contains all 14 memory families and 30+ verified known chips', () => {
    const stats = getDbStats(db);
    expect(stats.familyCount).toBe(14);
    expect(stats.knownChipCount).toBeGreaterThanOrEqual(30);
    expect(stats.slotCount).toBeGreaterThan(100);
    expect(stats.optionCount).toBeGreaterThan(300);

    const families = getAllFamilies(db);
    expect(families.map((f) => f.family_key)).toEqual(
      expect.arrayContaining(['K4A', 'K4R', 'K4B', 'K4G', 'K4Z', 'K4V', 'K4E', 'K4F', 'K4U', 'K3L', 'K9', 'KLM', 'KLU', 'M_DIMM']),
    );
  });

  it('retrieves K4AAG085WB-BCWE and DDR4 slot schema cleanly', () => {
    const chip = getKnownChipByPartNumber(db, 'K4AAG085WB-BCWE');
    expect(chip).not.toBeNull();
    expect(chip?.density_gb).toBe(16);
    expect(chip?.speed_mts).toBe(3200);
    expect(chip?.die_rev).toContain('B-die');

    const family = findFamilyByCode(db, 'K4AAG085WB-BCWE');
    expect(family?.family_key).toBe('K4A');

    const slots = getSlotsWithOptions(db, family!.id);
    expect(slots).toHaveLength(12);
    expect(slots[3].options.some((o) => o.code_value === 'AG')).toBe(true);
  });

  it('supports cross-family top slot queries and catalog search', () => {
    expect(findFamilyByTopSlots(db, 'K', '4', 'R')?.family_key).toBe('K4R');
    expect(findFamilyByTopSlots(db, 'K', '4', 'V')?.family_key).toBe('K4V');
    expect(findFamilyByTopSlots(db, 'K', 'L', 'U')?.family_key).toBe('KLU');
    expect(findFamilyByTopSlots(db, 'M', '378', 'A')?.family_key).toBe('M_DIMM');

    const gddrChips = getKnownChips(db, 'GDDR7');
    expect(gddrChips.length).toBeGreaterThanOrEqual(3);
  });
});
