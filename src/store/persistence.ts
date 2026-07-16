import type { StateStorage } from 'zustand/middleware';

export const STORAGE_KEYS = {
  proposals: 'pfcs:proposals:v1',
  library: 'pfcs:library:v1',
} as const;

const AUTOSAVE_DEBOUNCE_MS = 500;

const timers = new Map<string, number>();
const pending = new Map<string, string>();

function flushAll() {
  for (const [key, value] of pending) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // localStorage full or unavailable — nothing more we can do in v1
    }
  }
  pending.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
}

/** localStorage-backed storage that debounces writes (500ms) and flushes on page hide. */
export const debouncedLocalStorage: StateStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => {
    pending.set(key, value);
    const existing = timers.get(key);
    if (existing) window.clearTimeout(existing);
    timers.set(
      key,
      window.setTimeout(() => {
        const v = pending.get(key);
        pending.delete(key);
        timers.delete(key);
        if (v !== undefined) {
          try {
            localStorage.setItem(key, v);
          } catch {
            // ignore quota errors
          }
        }
      }, AUTOSAVE_DEBOUNCE_MS)
    );
  },
  removeItem: (key) => {
    pending.delete(key);
    localStorage.removeItem(key);
  },
};
