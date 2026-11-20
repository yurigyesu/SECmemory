const STORAGE_KEY = 'color-scheme';

export type SchemeOverride = 'light' | 'dark' | 'system';

export function getSystemScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredScheme(): 'light' | 'dark' | null {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === 'light' || val === 'dark' ? val : null;
  } catch {
    return null;
  }
}

export function getRenderedScheme(): 'light' | 'dark' {
  return getStoredScheme() ?? getSystemScheme();
}

function applyMetaContent(content: 'light' | 'dark' | 'light dark'): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = content;
  }
}

export function toggleColorScheme(): 'light' | 'dark' {
  const currentRendered = getRenderedScheme();
  const target: 'light' | 'dark' = currentRendered === 'dark' ? 'light' : 'dark';
  const system = getSystemScheme();

  if (target === system) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore private-mode storage errors
    }
    applyMetaContent('light dark');
  } else {
    try {
      localStorage.setItem(STORAGE_KEY, target);
    } catch {
      // Ignore private-mode storage errors
    }
    applyMetaContent(target);
  }

  return target;
}

export function syncThemeFromStorage(): void {
  const stored = getStoredScheme();
  applyMetaContent(stored ?? 'light dark');
}
