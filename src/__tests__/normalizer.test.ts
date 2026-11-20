import { describe, expect, it } from 'vitest';
import { parseYwwDateCode } from '../decoder/dateCode';
import { normalizeMemoryInput } from '../decoder/normalizer';

describe('Top Marking Normalizer & YWW Date Code Parser', () => {
  it('handles blank input without warnings', () => {
    const res = normalizeMemoryInput('   ');
    expect(res.reconstructedCode).toBe('');
    expect(res.manufacturer).toBeNull();
    expect(res.dateCodeRaw).toBeNull();
  });

  it('normalizes lowercase and single-line codes cleanly', () => {
    const res = normalizeMemoryInput('  k4aag085wb-bcwe  ');
    expect(res.reconstructedCode).toBe('K4AAG085WB-BCWE');
    expect(res.isMultiLineTopMarking).toBe(false);
  });

  it('reconstructs 3-line physical IC marking (SEC YWW SUFFIX + split base + Lot)', () => {
    const res = normalizeMemoryInput('SEC 216 BCWE\nK4AAG08 5WB\nGPB1349R');
    expect(res.manufacturer).toBe('SEC');
    expect(res.dateCodeRaw).toBe('216');
    expect(res.lotCode).toBe('GPB1349R');
    expect(res.reconstructedCode).toBe('K4AAG085WB-BCWE');
    expect(res.isMultiLineTopMarking).toBe(true);
  });

  it('reconstructs single-line spaced physical IC marking with trailing suffix', () => {
    const res = normalizeMemoryInput('SEC 322 K4RAH08 6VB BCQK');
    expect(res.manufacturer).toBe('SEC');
    expect(res.dateCodeRaw).toBe('322');
    expect(res.reconstructedCode).toBe('K4RAH086VB-BCQK');
  });

  it('reconstructs UFS / GDDR6 multi-line top markings', () => {
    const ufs = normalizeMemoryInput('SEC 140 B0E1\nKLUDG4U HDC');
    expect(ufs.reconstructedCode).toBe('KLUDG4UHDC-B0E1');
    expect(ufs.dateCodeRaw).toBe('140');

    const gddr = normalizeMemoryInput('SEC 209 HC16\nK4ZAF32 5BM');
    expect(gddr.reconstructedCode).toBe('K4ZAF325BM-HC16');
  });

  it('infers realistic manufacturing decade from family launch year', () => {
    const ddr4 = parseYwwDateCode('919', 2014, 2026);
    expect(ddr4?.inferredYear).toBe(2019);
    expect(ddr4?.week).toBe(19);
    expect(ddr4?.labelKo).toBe('2019년 19주차');

    const ddr5 = parseYwwDateCode('322', 2021, 2026);
    expect(ddr5?.inferredYear).toBe(2023);
    expect(ddr5?.labelKo).toBe('2023년 22주차');

    const ddr4Recent = parseYwwDateCode('216', 2014, 2026);
    expect(ddr4Recent?.inferredYear).toBe(2022);
  });
});
