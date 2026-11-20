import {
  findFamilyByCode,
  getCustomChipByPartNumber,
  getFamilyByKey,
  getKnownChipByPartNumber,
  getSlotsWithOptions,
} from '../db/queries';
import type {
  CodeOptionRow,
  CustomChipRow,
  FamilyRow,
  KnownChipRow,
  OptionMeta,
  SlotWithOptions,
  SqlExecutor,
} from '../db/types';
import { parseYwwDateCode, type ParsedDateCode } from './dateCode';
import { normalizeMemoryInput, type NormalizedInput } from './normalizer';

export type SegmentMatchStatus = 'exact' | 'inferred' | 'unknown' | 'empty';

export interface DecodedSegment {
  slot: SlotWithOptions;
  value: string;
  matchedOption: CodeOptionRow | null;
  status: SegmentMatchStatus;
  meta: OptionMeta;
}

export interface MemorySpecSummary {
  familyNameKo: string;
  familyNameEn: string;
  category: string;
  densityGb: number | null;
  densityGB: number | null;
  densityDisplay: string;
  bitWidth: number | null;
  orgDisplay: string;
  speedMts: number | null;
  speedGbps: number | null;
  clockMhz: number | null;
  timing: string | null;
  speedDisplay: string;
  singleChipBandwidthGBs: number | null;
  voltage: string;
  dieRev: string;
  packageSpec: string;
  tempRange: string;
}

export interface DecodedMemoryResult {
  status: 'empty' | 'decoded' | 'partial' | 'unrecognized';
  normalized: NormalizedInput;
  canonicalCode: string;
  family: FamilyRow | null;
  segments: DecodedSegment[];
  dateCode: ParsedDateCode | null;
  knownChip: KnownChipRow | null;
  customChip: CustomChipRow | null;
  summary: MemorySpecSummary | null;
  warnings: string[];
}

function safeParseMeta(metaJson: string | null | undefined): OptionMeta {
  if (!metaJson) return {};
  try {
    return JSON.parse(metaJson) as OptionMeta;
  } catch {
    return {};
  }
}

function formatDensity(densityGb: number | null, densityGB: number | null): string {
  if (densityGB !== null && densityGB !== undefined) {
    if (densityGB >= 1024) return `${(densityGB / 1024).toFixed(densityGB % 1024 === 0 ? 0 : 1)} TB`;
    return `${densityGB} GB`;
  }
  if (densityGb !== null && densityGb !== undefined) {
    if (densityGb >= 1024) {
      const tbBits = densityGb / 1024;
      const tbBitsStr = Number.isInteger(tbBits) ? String(tbBits) : tbBits.toFixed(1);
      const gb = densityGb / 8;
      if (gb >= 1024) {
        const tbBytes = gb / 1024;
        const tbBytesStr = Number.isInteger(tbBytes) ? String(tbBytes) : tbBytes.toFixed(1);
        return `${tbBitsStr} Tb (${tbBytesStr} TB)`;
      }
      const gbStr = Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
      return `${tbBitsStr} Tb (${gbStr} GB)`;
    }
    const bytesMB = densityGb * 128; // 1 Gb = 128 MB
    if (bytesMB >= 1024) {
      const gb = bytesMB / 1024;
      const gbStr = Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
      return `${densityGb} Gb (${gbStr} GB)`;
    }
    return `${densityGb} Gb (${bytesMB} MB)`;
  }
  return '미상';
}

function formatOrganization(
  densityGb: number | null,
  bitWidth: number | null,
  category: string,
  fallbackLabel?: string,
): string {
  if (fallbackLabel) return fallbackLabel;
  if (category === 'MODULE' && bitWidth) return `×${bitWidth} 버스 모듈`;
  if (category === 'FLASH') return bitWidth ? `${bitWidth}-Lane / ${bitWidth}-bit` : '관리형 NAND';
  if (densityGb && bitWidth) {
    const wordsMb = (densityGb * 1024) / bitWidth;
    if (wordsMb >= 1024) {
      const gWords = wordsMb / 1024;
      if (gWords >= 1024) {
        const tWords = gWords / 1024;
        const tWordStr = Number.isInteger(tWords) ? `${tWords}T` : `${tWords.toFixed(1)}T`;
        return `${tWordStr} × ${bitWidth}`;
      }
      const wordStr = Number.isInteger(gWords) ? `${gWords}G` : `${gWords.toFixed(1)}G`;
      return `${wordStr} × ${bitWidth}`;
    }
    return `${wordsMb}M × ${bitWidth}`;
  }
  if (bitWidth) return `×${bitWidth}`;
  return '미상';
}

export function decodeMemoryCode(db: SqlExecutor, rawInput: string): DecodedMemoryResult {
  const normalized = normalizeMemoryInput(rawInput);

  if (!normalized.reconstructedCode) {
    const defaultFamily = getFamilyByKey(db, 'K4A');
    const slots = defaultFamily ? getSlotsWithOptions(db, defaultFamily.id) : [];
    return {
      status: 'empty',
      normalized,
      canonicalCode: '',
      family: defaultFamily,
      segments: slots.map((slot) => ({
        slot,
        value: slot.is_separator ? '-' : '',
        matchedOption: null,
        status: 'empty',
        meta: {},
      })),
      dateCode: null,
      knownChip: null,
      customChip: null,
      summary: null,
      warnings: [],
    };
  }

  const family = findFamilyByCode(db, normalized.reconstructedCode);
  if (!family) {
    return {
      status: 'unrecognized',
      normalized,
      canonicalCode: normalized.reconstructedCode,
      family: null,
      segments: [],
      dateCode: null,
      knownChip: null,
      customChip: null,
      summary: null,
      warnings: [
        '인식 가능한 삼성전자 메모리 접두사(K4A, K4R, K4B, K4G, K4Z, K4V, K4E, K4F, K4U, K3L, K9, KLM, KLU, M3xx/M4xx)를 찾지 못했습니다.',
      ],
    };
  }

  const slots = getSlotsWithOptions(db, family.id);
  const code = normalized.reconstructedCode;
  let pos = 0;

  const segments: DecodedSegment[] = [];
  let hasUnknown = false;
  let hasMissingNonSeparator = false;

  for (const slot of slots) {
    if (slot.is_separator === 1) {
      if (pos < code.length && code[pos] === '-') {
        const matched = slot.options[0] ?? null;
        segments.push({
          slot,
          value: '-',
          matchedOption: matched,
          status: 'exact',
          meta: safeParseMeta(matched?.meta_json),
        });
        pos += 1;
      } else if (pos < code.length) {
        const matched = slot.options[0] ?? null;
        segments.push({
          slot,
          value: '-',
          matchedOption: matched,
          status: 'inferred',
          meta: safeParseMeta(matched?.meta_json),
        });
      } else {
        segments.push({
          slot,
          value: '-',
          matchedOption: slot.options[0] ?? null,
          status: 'empty',
          meta: {},
        });
      }
      continue;
    }

    if (pos >= code.length) {
      hasMissingNonSeparator = true;
      segments.push({
        slot,
        value: '',
        matchedOption: null,
        status: 'empty',
        meta: {},
      });
      continue;
    }

    const remaining = code.slice(pos);
    // Greedy longest option match first (e.g. 'LK' before 'L', '378' exact, 'AG' exact)
    const sortedOptions = [...slot.options].sort(
      (a, b) => b.code_value.length - a.code_value.length,
    );
    const matchedOpt = sortedOptions.find((opt) => remaining.startsWith(opt.code_value)) ?? null;

    if (matchedOpt) {
      pos += matchedOpt.code_value.length;
      segments.push({
        slot,
        value: matchedOpt.code_value,
        matchedOption: matchedOpt,
        status: 'exact',
        meta: safeParseMeta(matchedOpt.meta_json),
      });
    } else {
      const slice = remaining.slice(0, slot.char_length);
      pos += slice.length;
      hasUnknown = true;
      segments.push({
        slot,
        value: slice,
        matchedOption: null,
        status: slice.length < slot.char_length ? 'inferred' : 'unknown',
        meta: {},
      });
    }
  }

  // Trailing unrecognized suffix characters
  const trailing = code.slice(pos);
  const warnings = [...normalized.warnings];
  if (trailing) {
    warnings.push(`추가 접미사(${trailing})는 표준 세그먼트 이후 확장 코드로 분리되었습니다.`);
  }

  // Build canonical code cleanly (omit trailing separator if suffix slots are empty)
  let canonical = '';
  const sepIndex = segments.findIndex((seg) => seg.slot.is_separator === 1);
  const hasSuffixValues =
    sepIndex >= 0 && segments.slice(sepIndex + 1).some((seg) => seg.value.length > 0);

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.slot.is_separator === 1) {
      if (hasSuffixValues) canonical += '-';
    } else if (seg.value) {
      canonical += seg.value;
    }
  }

  const knownChip =
    getKnownChipByPartNumber(db, canonical) ??
    getKnownChipByPartNumber(db, normalized.reconstructedCode);
  const customChip =
    getCustomChipByPartNumber(db, canonical) ??
    getCustomChipByPartNumber(db, normalized.reconstructedCode);

  const dateCode = normalized.dateCodeRaw
    ? parseYwwDateCode(normalized.dateCodeRaw, family.launch_year)
    : null;

  const mergedMeta: OptionMeta = {};
  for (const seg of segments) {
    Object.assign(mergedMeta, seg.meta);
  }

  const densityGb = knownChip?.density_gb ?? mergedMeta.densityGb ?? null;
  const densityGB = mergedMeta.densityGB ?? null;
  const bitWidth = knownChip?.bit_width ?? mergedMeta.bitWidth ?? null;
  const speedMts = knownChip?.speed_mts ?? mergedMeta.speedMts ?? null;
  const speedGbps = mergedMeta.speedGbps ?? null;
  const clockMhz = mergedMeta.clockMhz ?? (speedMts ? Math.round(speedMts / 2) : null);
  const timing = knownChip?.timing_label ?? mergedMeta.timing ?? null;

  let singleChipBandwidthGBs: number | null = null;
  if (speedGbps && bitWidth) {
    singleChipBandwidthGBs = Number(((speedGbps * bitWidth) / 8).toFixed(1));
  } else if (speedMts && bitWidth && family.category !== 'FLASH' && family.category !== 'NAND') {
    singleChipBandwidthGBs = Number(((speedMts * bitWidth) / 8000).toFixed(2));
  }

  let speedDisplay = knownChip?.speed_label ?? '';
  if (!speedDisplay) {
    if (speedGbps) {
      speedDisplay = `${speedGbps.toFixed(1)} Gbps/pin${
        singleChipBandwidthGBs ? ` (${singleChipBandwidthGBs} GB/s)` : ''
      }`;
    } else if (speedMts) {
      const unit = family.category === 'FLASH' ? 'MB/s' : 'MT/s';
      speedDisplay = `${speedMts} ${unit}${timing ? ` (CL${timing.split('-')[0]})` : ''}`;
    } else {
      speedDisplay = '표준 속도 (접미사 미지정)';
    }
  }

  const summary: MemorySpecSummary = {
    familyNameKo: family.name_ko,
    familyNameEn: family.name_en,
    category: family.category,
    densityGb,
    densityGB,
    densityDisplay: knownChip?.density_label ?? formatDensity(densityGb, densityGB),
    bitWidth,
    orgDisplay: formatOrganization(densityGb, bitWidth, family.category, knownChip?.org_label),
    speedMts,
    speedGbps,
    clockMhz,
    timing,
    speedDisplay,
    singleChipBandwidthGBs,
    voltage: knownChip?.voltage_label ?? mergedMeta.voltage ?? family.voltage_default ?? '표준',
    dieRev: knownChip?.die_rev ?? mergedMeta.dieRev ?? '미지정',
    packageSpec: knownChip?.package_spec ?? mergedMeta.package ?? family.package_default ?? 'FBGA',
    tempRange: knownChip?.temp_range ?? mergedMeta.temp ?? '0°C ~ 85°C',
  };

  return {
    status: hasUnknown || hasMissingNonSeparator ? 'partial' : 'decoded',
    normalized,
    canonicalCode: canonical || normalized.reconstructedCode,
    family,
    segments,
    dateCode,
    knownChip,
    customChip,
    summary,
    warnings,
  };
}
