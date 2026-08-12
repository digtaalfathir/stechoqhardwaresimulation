import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
export type Lang = 'en' | 'id';

export interface Settings {
  theme: Theme;
  lang: Lang;
}

const KEY = 'shs.settings';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function load(): Settings {
  const fallback: Settings = { theme: systemTheme(), lang: 'en' };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      theme: parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : fallback.theme,
      lang: parsed.lang === 'id' || parsed.lang === 'en' ? parsed.lang : fallback.lang,
    };
  } catch {
    // Private mode or corrupted value — defaults are always usable.
    return fallback;
  }
}

let state: Settings = load();
const listeners = new Set<() => void>();

/** The document is the single source of truth for the applied theme/language. */
function apply() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.lang = state.lang;
}

function set(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  apply();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Not persisting is survivable; the session still works.
  }
  for (const fn of listeners) fn();
}

export const setTheme = (theme: Theme) => set({ theme });
export const setLang = (lang: Lang) => set({ lang });

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const snapshot = () => state;

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

apply();
