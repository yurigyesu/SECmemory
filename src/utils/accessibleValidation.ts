let announcerNode: HTMLDivElement | null = null;
let announceTimer: ReturnType<typeof setTimeout> | undefined;
let announcedField: Element | null = null;
const flagged = new WeakSet<Element>();
const announced = new WeakSet<Element>();
const dirtyFallback = new WeakMap<Element, { hasInteracted: boolean; hasBlurred: boolean }>();

function getAnnouncer(): HTMLDivElement {
  if (!announcerNode && typeof document !== 'undefined') {
    announcerNode = document.createElement('div');
    announcerNode.setAttribute('aria-live', 'polite');
    announcerNode.className = 'visually-hidden';
    document.body.append(announcerNode);
  }
  return announcerNode!;
}

function linkError(el: HTMLElement, shown: boolean): void {
  const errorId = el.dataset.error;
  if (!errorId) return;
  const ids = (el.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (shown) ids.push(errorId);
  if (ids.length > 0) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
}

function announceError(el: HTMLElement): void {
  const errorId = el.dataset.error;
  if (!errorId) return;
  const errorEl = document.getElementById(errorId);
  if (!errorEl) return;

  const announcer = getAnnouncer();
  const text = errorEl.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text) return;

  clearTimeout(announceTimer);
  announcer.textContent = '';
  announcedField = el;
  announceTimer = setTimeout(() => {
    announcer.textContent = text;
  }, 450);
}

export function syncFieldAriaValidity(el: HTMLElement | null, announce = false): void {
  if (!el || !el.matches('input, select, textarea')) return;

  const supportsUserInvalid = typeof CSS !== 'undefined' && CSS.supports('selector(:user-invalid)');
  let isInvalid = false;

  if (supportsUserInvalid) {
    isInvalid = el.matches(':user-invalid');
  } else if ('validity' in el) {
    const state = dirtyFallback.get(el);
    const valid = (el as HTMLInputElement).validity.valid;
    if (state?.hasBlurred || state?.hasInteracted) {
      isInvalid = !valid;
      el.classList.toggle('user-invalid-fallback', isInvalid);
      el.classList.toggle('user-valid-fallback', !isInvalid);
    }
  }

  if (isInvalid) {
    if (announce && !announced.has(el)) {
      announceError(el);
      announced.add(el);
    }
    el.setAttribute('aria-invalid', 'true');
    linkError(el, true);
    flagged.add(el);
  } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
    el.setAttribute('aria-invalid', 'false');
    linkError(el, false);
    flagged.delete(el);
    announced.delete(el);
    if (announcedField === el && announcerNode) {
      clearTimeout(announceTimer);
      announcerNode.textContent = '';
    }
  }
}

export function markFallbackInteraction(
  el: HTMLElement | null,
  eventType: 'input' | 'blur' | 'invalid',
): void {
  if (!el) return;
  const state = dirtyFallback.get(el) ?? { hasInteracted: false, hasBlurred: false };
  if (eventType === 'input') state.hasInteracted = true;
  if (eventType === 'blur') state.hasBlurred = true;
  if (eventType === 'invalid') {
    state.hasInteracted = true;
    state.hasBlurred = true;
  }
  dirtyFallback.set(el, state);
}
