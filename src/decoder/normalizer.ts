export interface NormalizedInput {
  rawInput: string;
  reconstructedCode: string;
  manufacturer: string | null;
  dateCodeRaw: string | null;
  lotCode: string | null;
  isMultiLineTopMarking: boolean;
  warnings: string[];
}

const BASE_START_RE = /^(K[349L]|M\d{2,3})/;
const FULL_PN_RE = /^(K[349L]|M\d{2,3})[A-Z0-9]{4,12}-[A-Z0-9]{2,6}$/;
const YWW_RE = /^(\d)(0[1-9]|[1-4]\d|5[0-3])$/;
const SUFFIX_CANDIDATE_RE = /^[A-Z0-9]{3,5}$/;

function cleanToken(token: string): string {
  return token
    .trim()
    .toUpperCase()
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '');
}

function isLikelyLotCode(token: string): boolean {
  if (token.length < 6 || token.length > 12) return false;
  if (BASE_START_RE.test(token)) return false;
  return /[A-Z]/.test(token) && /\d/.test(token);
}

function correctCommonOcrMistakes(code: string, warnings: string[]): string {
  if (/^K90(?:$|[A-Z0-9-])/.test(code)) {
    warnings.push(
      "칩 각인 오인 보정: 삼성 NAND 코드에는 'K90'(숫자 0)이 없으며 영문 'K9O'(3-bit TLC 8-Die ODP)로 자동 보정하여 해석했습니다.",
    );
    return `K9O${code.slice(3)}`;
  }
  return code;
}

export function normalizeMemoryInput(rawInput: string): NormalizedInput {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      rawInput,
      reconstructedCode: '',
      manufacturer: null,
      dateCodeRaw: null,
      lotCode: null,
      isMultiLineTopMarking: false,
      warnings: [],
    };
  }

  const hasMultipleLines = /\r?\n/.test(trimmed);
  const rawTokens = trimmed
    .split(/[\s,/;]+/)
    .map(cleanToken)
    .filter(Boolean);

  if (rawTokens.length === 0) {
    return {
      rawInput,
      reconstructedCode: '',
      manufacturer: null,
      dateCodeRaw: null,
      lotCode: null,
      isMultiLineTopMarking: hasMultipleLines,
      warnings: [],
    };
  }

  const warnings: string[] = [];

  // Single token fast path
  if (rawTokens.length === 1) {
    return {
      rawInput,
      reconstructedCode: correctCommonOcrMistakes(rawTokens[0], warnings),
      manufacturer: null,
      dateCodeRaw: null,
      lotCode: null,
      isMultiLineTopMarking: false,
      warnings,
    };
  }

  let manufacturer: string | null = null;
  let dateCodeRaw: string | null = null;
  let lotCode: string | null = null;

  const remaining: string[] = [];
  for (let i = 0; i < rawTokens.length; i += 1) {
    const tok = rawTokens[i];
    if (!manufacturer && tok === 'SEC') {
      manufacturer = 'SEC';
      continue;
    }
    if (!dateCodeRaw && YWW_RE.test(tok) && (manufacturer === 'SEC' || i <= 2)) {
      dateCodeRaw = tok;
      continue;
    }
    remaining.push(tok);
  }

  // Check if a complete hyphenated part number already exists among remaining tokens
  const fullIndex = remaining.findIndex((tok) => FULL_PN_RE.test(tok));
  if (fullIndex >= 0) {
    const fullCode = correctCommonOcrMistakes(remaining[fullIndex], warnings);
    const extras = remaining.filter((_, idx) => idx !== fullIndex);
    const lotCandidate = extras.find((tok) => isLikelyLotCode(tok) || tok.length >= 5);
    lotCode = lotCandidate ?? null;

    return {
      rawInput,
      reconstructedCode: fullCode,
      manufacturer,
      dateCodeRaw,
      lotCode,
      isMultiLineTopMarking: hasMultipleLines || Boolean(manufacturer || dateCodeRaw),
      warnings,
    };
  }

  // Locate where the base part number starts (e.g. K4AAG08, K4A8G08, KLUDG4U, K4RAH08)
  const baseIdx = remaining.findIndex((tok) => BASE_START_RE.test(tok));
  if (baseIdx < 0) {
    const joined = remaining.join('');
    return {
      rawInput,
      reconstructedCode: joined,
      manufacturer,
      dateCodeRaw,
      lotCode,
      isMultiLineTopMarking: hasMultipleLines || Boolean(manufacturer || dateCodeRaw),
      warnings,
    };
  }

  const preTokens = remaining.slice(0, baseIdx);
  let basePart = remaining[baseIdx];
  const postTokens = remaining.slice(baseIdx + 1);

  let suffix: string | null = null;
  const leftover: string[] = [];

  // Suffix on Line 1 before base part number (e.g., "SEC 216 BCWE / K4AAG08 5WB")
  for (const tok of preTokens) {
    if (!suffix && SUFFIX_CANDIDATE_RE.test(tok)) {
      suffix = tok;
    } else {
      leftover.push(tok);
    }
  }

  // Merge split second half of base PN if present (e.g., "K4AAG08" + "5WB" or "K9F1G08" + "U0E")
  let postStart = 0;
  if (postTokens.length > 0) {
    const nextTok = postTokens[0];
    if (
      basePart.length >= 5 &&
      basePart.length <= 9 &&
      /^[A-Z0-9]{2,4}$/.test(nextTok) &&
      !isLikelyLotCode(nextTok)
    ) {
      // Distinguish base tail ("5WB", "6VB", "U0E", "ETD") from a 4-char suffix when pre-suffix already captured
      const isBaseTail =
        nextTok.length <= 3 || (suffix !== null && nextTok.length <= 4 && !/^(BC|BY|HC|SC|BG|MG)/.test(nextTok));
      if (isBaseTail) {
        basePart = `${basePart}${nextTok}`;
        postStart = 1;
      }
    }
  }

  for (let i = postStart; i < postTokens.length; i += 1) {
    const tok = postTokens[i];
    if (!suffix && tok.length >= 3 && tok.length <= 5 && /^[A-Z0-9]{3,5}$/.test(tok) && !isLikelyLotCode(tok)) {
      suffix = tok;
    } else {
      leftover.push(tok);
    }
  }

  if (leftover.length > 0) {
    lotCode = leftover.find((t) => isLikelyLotCode(t)) ?? leftover[0];
  }

  const reconstructedCode = correctCommonOcrMistakes(
    suffix ? `${basePart}-${suffix}` : basePart,
    warnings,
  );

  if (!suffix && (manufacturer || dateCodeRaw)) {
    warnings.push('일부 속도/온도 접미사가 생략된 각인입니다. 기본 파트넘버 기준으로 해석합니다.');
  }

  return {
    rawInput,
    reconstructedCode,
    manufacturer,
    dateCodeRaw,
    lotCode,
    isMultiLineTopMarking: hasMultipleLines || Boolean(manufacturer || dateCodeRaw),
    warnings,
  };
}
