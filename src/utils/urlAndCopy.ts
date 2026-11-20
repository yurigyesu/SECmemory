import type { DecodedMemoryResult } from '../decoder/engine';

export function readCodeFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get('code')?.trim() ?? '';
}

export function syncCodeToUrl(code: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (code.trim()) {
    url.searchParams.set('code', code.trim());
  } else {
    url.searchParams.delete('code');
  }
  window.history.replaceState(null, '', url.toString());
}

export function buildSpecCopyText(decoded: DecodedMemoryResult): string {
  if (decoded.status === 'empty' || !decoded.summary || !decoded.family) {
    return '';
  }
  const lines = [
    `[SECmemory] ${decoded.canonicalCode}`,
    `- 제품군: ${decoded.family.name_ko} (${decoded.family.name_en})`,
    `- 용량: ${decoded.summary.densityDisplay}`,
    `- 구성: ${decoded.summary.orgDisplay}`,
    `- 속도: ${decoded.summary.speedDisplay}`,
    `- 전압: ${decoded.summary.voltage}`,
    `- 다이 리비전: ${decoded.summary.dieRev}`,
    `- 패키지: ${decoded.summary.packageSpec}`,
  ];
  if (decoded.dateCode) {
    lines.push(`- 제조 주차: ${decoded.dateCode.labelKo} (${decoded.dateCode.raw})`);
  }
  if (decoded.normalized.lotCode) {
    lines.push(`- Lot 코드: ${decoded.normalized.lotCode}`);
  }
  lines.push('');
  lines.push('세그먼트별 해석:');
  for (const seg of decoded.segments) {
    if (seg.slot.is_separator) continue;
    const desc = seg.matchedOption
      ? `${seg.matchedOption.title_ko} — ${seg.matchedOption.detail_ko}`
      : seg.value
        ? '미정의 코드'
        : '미입력';
    lines.push(`  [${seg.value || '-'}] ${seg.slot.label_ko}: ${desc}`);
  }
  return lines.join('\n');
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
