export interface ParsedDateCode {
  raw: string;
  yearDigit: number;
  week: number;
  inferredYear: number;
  labelKo: string;
  ambiguousYears: number[];
}

export function parseYwwDateCode(
  rawCode: string,
  launchYear = 2014,
  referenceYear = 2026,
): ParsedDateCode | null {
  const match = rawCode.trim().match(/^(\d)(0[1-9]|[1-4]\d|5[0-3])$/);
  if (!match) return null;

  const yearDigit = Number(match[1]);
  const week = Number(match[2]);

  const candidates: number[] = [];
  const startDecade = Math.floor(Math.max(2000, launchYear) / 10) * 10;
  for (let decade = startDecade; decade <= referenceYear + 10; decade += 10) {
    const year = decade + yearDigit;
    if (year >= launchYear - 1 && year <= referenceYear) {
      candidates.push(year);
    }
  }

  let inferredYear = candidates[candidates.length - 1];
  if (inferredYear === undefined) {
    // Fallback to nearest decade <= referenceYear
    const currentDecade = Math.floor(referenceYear / 10) * 10;
    const candidate = currentDecade + yearDigit;
    inferredYear = candidate <= referenceYear ? candidate : candidate - 10;
    candidates.push(inferredYear);
  }

  return {
    raw: rawCode,
    yearDigit,
    week,
    inferredYear,
    labelKo: `${inferredYear}년 ${String(week).padStart(2, '0')}주차`,
    ambiguousYears: candidates,
  };
}
