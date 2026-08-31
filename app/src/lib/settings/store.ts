'use client';

import { create } from 'zustand';

import { DEFAULT_SETTINGS, Settings, ColourScheme } from './settings';

const STORAGE_KEY = 'shifter.settings';

interface SettingsState {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
  setWeekdayShift: (weekday: number, shiftId: number | null) => void;
  clearWeekdayShifts: () => void;
  saveScheme: (scheme: ColourScheme) => void;
  deleteScheme: (id: string) => void;
}

function read(): Settings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };

  // A fresh browser speaks the visitor's language, not the scaffolding's.
  // The audience is ru/uk; the audit found a brand-new session greeting a
  // Ukrainian bartender with «Sign in». Stored choices always win below.
  const spoken = (navigator.languages ?? [navigator.language ?? ''])
    .map((tag) => tag.slice(0, 2).toLowerCase())
    .find((tag) => tag === 'ru' || tag === 'uk');
  const guessed: Settings = { ...DEFAULT_SETTINGS, language: spoken ?? DEFAULT_SETTINGS.language };

  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) return guessed;

  try {
    // Spread over the defaults so a settings file written by an older build
    // gains any new keys instead of leaving them undefined.
    return { ...guessed, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const useSettings = create<SettingsState>((set) => ({
  settings: read(),
  update: (key, value) =>
    set((state) => ({ settings: { ...state.settings, [key]: value } })),
  reset: () => set({ settings: { ...DEFAULT_SETTINGS } }),
  setWeekdayShift: (weekday, shiftId) =>
    set((state) => {
      const next = { ...state.settings.weekdayShifts };

      if (shiftId === null) delete next[weekday];
      else next[weekday] = shiftId;

      return { settings: { ...state.settings, weekdayShifts: next } };
    }),
  clearWeekdayShifts: () =>
    set((state) => ({ settings: { ...state.settings, weekdayShifts: {} } })),
  saveScheme: (scheme) =>
    set((state) => {
      const existing = state.settings.colourSchemes.some((item) => item.id === scheme.id);

      return {
        settings: {
          ...state.settings,
          colourSchemes: existing
            ? state.settings.colourSchemes.map((item) => (item.id === scheme.id ? scheme : item))
            : [...state.settings.colourSchemes, scheme],
        },
      };
    }),
  deleteScheme: (id) =>
    set((state) => ({
      settings: {
        ...state.settings,
        colourSchemes: state.settings.colourSchemes.filter((scheme) => scheme.id !== id),
      },
    })),
}));

/**
 * Persists every change and writes the choices onto the document root so plain
 * CSS picks them up — no component needs to know a theme exists. Subscribed
 * once from the shell rather than per component.
 */
export function bindSettingsToDocument(): () => void {
  const apply = (settings: Settings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

    const root = document.documentElement;

    // Without this the document stays lang="en" forever, so a screen reader
    // pronounces the whole Cyrillic interface with an English voice — which is
    // not an inconvenience, it is unintelligible.
    root.lang = settings.language;

    root.dataset['theme'] = settings.theme;
    root.dataset['density'] = settings.density;
    root.dataset['motion'] = settings.reduceMotion ? 'reduced' : 'full';
    root.dataset['weekends'] = settings.highlightWeekends ? 'on' : 'off';
    root.dataset['glass'] = settings.glass ? 'on' : 'off';
    root.style.setProperty('--motion', settings.reduceMotion ? '0' : `${settings.motionSpeed}`);
    // This front names its radii after what wears them, and scales type by
    // moving the root font size the rem scale is built on — so the slider
    // reaches every heading without a single component knowing about it.
    root.style.setProperty('--radius-field', `${settings.roundness}px`);
    root.style.setProperty('--radius-card', `${settings.roundness + 4}px`);
    root.style.setProperty('--radius', `${settings.roundness}px`);
    root.style.fontSize = `${settings.fontScale}px`;
    root.style.setProperty('--accent', settings.accent);
    root.style.setProperty('--accent-hover', lighten(settings.accent, 0.14));
    root.style.setProperty('--accent-ink', readable(settings.accent));
    root.style.setProperty('--ring', hexToRgba(settings.accent, 0.2));
    root.style.setProperty('--accent-soft', hexToRgba(settings.accent, 0.12));
  };

  apply(useSettings.getState().settings);

  return useSettings.subscribe((state) => apply(state.settings));
}

function parse(hex: string): [number, number, number] {
  const value = hex.replace('#', '');

  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function lighten(hex: string, amount: number): string {
  const channels = parse(hex).map((channel) => Math.round(channel + (255 - channel) * amount));

  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);

  return `rgb(${r} ${g} ${b} / ${alpha * 100}%)`;
}

/** White or near-black, whichever survives on the accent as button ink. */
function readable(hex: string): string {
  const [r, g, b] = parse(hex).map((channel) => {
    const c = channel / 255;

    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#111319' : '#ffffff';
}
