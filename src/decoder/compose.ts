import { findFamilyByTopSlots, getFamilyByKey } from '../db/queries';
import type { SqlExecutor } from '../db/types';
import { decodeMemoryCode } from './engine';

export interface ComposeResult {
  nextCode: string;
  switchedFamilyKey: string | null;
}

const DDR5_MODULE_FORM_FACTORS = new Set(['323', '425', '321', '324']);
const DDR4_MODULE_FORM_FACTORS = new Set(['378', '471', '393', '391', '386']);
const DDR4_MODULE_SPEEDS = new Set(['PB', 'RC', 'TD', 'VF', 'WE']);
const DDR5_MODULE_SPEEDS = new Set(['QK', 'WM', 'CP']);

export function composeCodeFromSlotChange(
  db: SqlExecutor,
  currentCode: string,
  currentFamilyKey: string,
  changedSlotOrder: number,
  newValue: string,
): ComposeResult {
  const cleanNew = newValue.trim().toUpperCase();
  const baseFamily = getFamilyByKey(db, currentFamilyKey) ?? getFamilyByKey(db, 'K4A');
  if (!baseFamily) {
    return { nextCode: cleanNew, switchedFamilyKey: null };
  }

  // If starting from blank standby state, hydrate from the active family's default code first
  const sourceCode = currentCode.trim() ? currentCode.trim() : baseFamily.default_code;
  const decoded = decodeMemoryCode(db, sourceCode);
  const activeFamily = decoded.family ?? baseFamily;

  // Cross-family switch check when scrolling slots 1, 2, or 3
  if (changedSlotOrder <= 3) {
    const slot1 =
      changedSlotOrder === 1
        ? cleanNew
        : decoded.segments[0]?.value || activeFamily.root_char;
    const slot2 =
      changedSlotOrder === 2
        ? cleanNew
        : decoded.segments[1]?.value || activeFamily.second_char;
    const slot3 =
      changedSlotOrder === 3
        ? cleanNew
        : decoded.segments[2]?.value || activeFamily.third_char;

    const targetFamily = findFamilyByTopSlots(db, slot1, slot2, slot3);
    if (targetFamily && targetFamily.family_key !== activeFamily.family_key) {
      return {
        nextCode: targetFamily.default_code,
        switchedFamilyKey: targetFamily.family_key,
      };
    }
  }

  // Hydrate any empty slots from default_code so the resulting part number is valid & complete
  const fallbackDecoded = decodeMemoryCode(db, activeFamily.default_code);
  const nextValues = decoded.segments.map((seg, idx) => {
    if (seg.slot.slot_order === changedSlotOrder) {
      return cleanNew;
    }
    if (seg.value && seg.status !== 'empty') {
      return seg.value;
    }
    return fallbackDecoded.segments[idx]?.value ?? '';
  });

  // Smart inner-family sync for M_DIMM (DDR4 vs DDR5 module form factor / generation / speed)
  if (activeFamily.family_key === 'M_DIMM') {
    const formFactor = nextValues[1] ?? '';
    if (changedSlotOrder === 2) {
      if (DDR5_MODULE_FORM_FACTORS.has(formFactor)) {
        nextValues[2] = 'R';
        if (nextValues[3]?.includes('K4')) nextValues[3] = '2GA';
        if (DDR4_MODULE_SPEEDS.has(nextValues[9] ?? '')) nextValues[9] = 'QK';
      } else if (DDR4_MODULE_FORM_FACTORS.has(formFactor)) {
        nextValues[2] = 'A';
        if (nextValues[3]?.includes('GA')) nextValues[3] = '2K4';
        if (DDR5_MODULE_SPEEDS.has(nextValues[9] ?? '')) nextValues[9] = 'TD';
      }
    } else if (changedSlotOrder === 3) {
      if (cleanNew === 'R') {
        if (DDR4_MODULE_FORM_FACTORS.has(formFactor)) nextValues[1] = '323';
        if (nextValues[3]?.includes('K4')) nextValues[3] = '2GA';
        if (DDR4_MODULE_SPEEDS.has(nextValues[9] ?? '')) nextValues[9] = 'QK';
      } else if (cleanNew === 'A') {
        if (DDR5_MODULE_FORM_FACTORS.has(formFactor)) nextValues[1] = '378';
        if (nextValues[3]?.includes('GA')) nextValues[3] = '2K4';
        if (DDR5_MODULE_SPEEDS.has(nextValues[9] ?? '')) nextValues[9] = 'TD';
      }
    }
  }

  return {
    nextCode: nextValues.join(''),
    switchedFamilyKey: null,
  };
}
