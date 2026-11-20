import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getKnownChips } from '../db/queries';
import type { SqlExecutor, SqlParam } from '../db/types';
import { composeCodeFromSlotChange } from '../decoder/compose';
import { decodeMemoryCode } from '../decoder/engine';

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

describe('Memory Code Decoder & Drum Composer', () => {
  it('returns clean empty standby state when input is blank', () => {
    const res = decodeMemoryCode(db, '');
    expect(res.status).toBe('empty');
    expect(res.canonicalCode).toBe('');
    expect(res.family?.family_key).toBe('K4A');
    expect(res.segments).toHaveLength(12);
    expect(res.segments.every((s) => s.status === 'empty')).toBe(true);
    expect(res.summary).toBeNull();
  });

  it('decodes ALL 45 seeded known chips cleanly with status = decoded', () => {
    const chips = getKnownChips(db);
    expect(chips.length).toBe(45);

    for (const chip of chips) {
      const res = decodeMemoryCode(db, chip.part_number);
      expect(res.status, `Chip ${chip.part_number} failed exact decoding`).toBe('decoded');
      expect(res.canonicalCode).toBe(chip.part_number);
      expect(res.family?.family_key).toBe(chip.family_key);
      expect(res.knownChip?.part_number).toBe(chip.part_number);
    }
  });

  it('decodes K4AAG085WB-BCWE and multi-line top marking accurately', () => {
    const res = decodeMemoryCode(db, 'SEC 216 BCWE\nK4AAG08 5WB\nGPB1349R');
    expect(res.status).toBe('decoded');
    expect(res.canonicalCode).toBe('K4AAG085WB-BCWE');
    expect(res.dateCode?.labelKo).toBe('2022년 16주차');
    expect(res.normalized.lotCode).toBe('GPB1349R');
    expect(res.summary?.densityDisplay).toBe('16 Gb (2 GB)');
    expect(res.summary?.singleChipBandwidthGBs).toBe(3.2);
  });

  it('handles missing hyphen and partial part numbers gracefully', () => {
    const noHyphen = decodeMemoryCode(db, 'K4AAG085WBBCWE');
    expect(noHyphen.canonicalCode).toBe('K4AAG085WB-BCWE');
    expect(noHyphen.status).toBe('decoded');
    expect(noHyphen.segments[8].status).toBe('inferred');
    expect(noHyphen.segments[3].value).toBe('AG');

    const baseOnly = decodeMemoryCode(db, 'K4A8G085WB');
    expect(baseOnly.status).toBe('partial');
    expect(baseOnly.canonicalCode).toBe('K4A8G085WB');
    expect(baseOnly.segments[3].value).toBe('8G');
    expect(baseOnly.segments[11].status).toBe('empty');
  });

  it('calculates GDDR7 PAM3 single-chip bandwidth accurately', () => {
    const res = decodeMemoryCode(db, 'K4VAF325ZC-SC28');
    expect(res.status).toBe('decoded');
    expect(res.summary?.singleChipBandwidthGBs).toBe(112);
    expect(res.summary?.densityDisplay).toBe('16 Gb (2 GB)');
  });

  it('reports unknown segments without throwing and marks unrecognized prefixes', () => {
    const unknownDie = decodeMemoryCode(db, 'K4AAG085WZ-BCWE');
    expect(unknownDie.status).toBe('partial');
    expect(unknownDie.segments[7].status).toBe('unknown');
    expect(unknownDie.segments[3].status).toBe('exact');

    const invalid = decodeMemoryCode(db, 'XYZ123456');
    expect(invalid.status).toBe('unrecognized');
    expect(invalid.warnings.length).toBeGreaterThan(0);
  });

  it('supports bidirectional drum composition and cross-family switching', () => {
    // Starting from empty standby state and selecting 8G on slot 4
    const fromStandby = composeCodeFromSlotChange(db, '', 'K4A', 4, '8G');
    expect(fromStandby.nextCode).toBe('K4A8G085WB-BCWE');
    expect(fromStandby.switchedFamilyKey).toBeNull();

    // Switching generation slot 3 from DDR4 (A) to DDR5 (R)
    const switchToDdr5 = composeCodeFromSlotChange(db, 'K4AAG085WB-BCWE', 'K4A', 3, 'R');
    expect(switchToDdr5.switchedFamilyKey).toBe('K4R');
    expect(switchToDdr5.nextCode).toBe('K4RAH086VB-BCQK');

    // Switching inside M_DIMM from DDR4 UDIMM (378) to DDR5 UDIMM (323)
    const switchDimm = composeCodeFromSlotChange(db, 'M378A2K43CB2-CTD', 'M_DIMM', 2, '323');
    expect(switchDimm.nextCode).toBe('M323R2GA3CB2-CQK');

    // DDR4-2133 (PB) and DDR4-2400 (RC) module decoding & DDR5 switch
    const dimm2133 = decodeMemoryCode(db, 'M378A1K43BB1-CPB');
    expect(dimm2133.status).toBe('decoded');
    expect(dimm2133.summary?.speedMts).toBe(2133);
    expect(dimm2133.summary?.timing).toBe('15-15-15');

    const dimm2400 = decodeMemoryCode(db, 'M378A2K43CB2-CRC');
    expect(dimm2400.status).toBe('decoded');
    expect(dimm2400.summary?.speedMts).toBe(2400);
    expect(dimm2400.summary?.timing).toBe('17-17-17');

    const switch2133ToDdr5 = composeCodeFromSlotChange(db, 'M378A1K43BB1-CPB', 'M_DIMM', 2, '323');
    expect(switch2133ToDdr5.nextCode).toBe('M323R2GA3BB1-CQK');
  });

  it('decodes V-NAND (K9O/K9D/K9U), Z-NAND (K9Q), QLC (K9X), and corrects K90 typos', () => {
    const hdpV8 = decodeMemoryCode(db, 'K9DYGY8J5B-CCK0');
    expect(hdpV8.status).toBe('decoded');
    expect(hdpV8.family?.family_key).toBe('K9');
    expect(hdpV8.summary?.densityDisplay).toBe('16 Tb (2 TB)');
    expect(hdpV8.segments[2].matchedOption?.code_value).toBe('D');

    const zNand = decodeMemoryCode(db, 'K9QHGB8J0M-CCB0');
    expect(zNand.status).toBe('decoded');
    expect(zNand.family?.family_key).toBe('K9');
    expect(zNand.summary?.densityDisplay).toBe('512 Gb (64 GB)');
    expect(zNand.segments[2].matchedOption?.code_value).toBe('Q');

    const typoOdp = decodeMemoryCode(db, 'K90MGY8H5A-CCK0');
    expect(typoOdp.status).toBe('decoded');
    expect(typoOdp.canonicalCode).toBe('K9OMGY8H5A-CCK0');
    expect(typoOdp.summary?.densityDisplay).toBe('2 Tb (256 GB)');
    expect(typoOdp.warnings.some((w) => w.includes('K9O'))).toBe(true);

    // Non-catalog K9 variant verifies dynamic Tb / T × bitWidth formatting
    const dynamicTb = decodeMemoryCode(db, 'K9DYGY8J5A-CCK0');
    expect(dynamicTb.status).toBe('decoded');
    expect(dynamicTb.knownChip).toBeNull();
    expect(dynamicTb.summary?.densityDisplay).toBe('16 Tb (2 TB)');
    expect(dynamicTb.summary?.orgDisplay).toBe('2T × 8');
  });
});
