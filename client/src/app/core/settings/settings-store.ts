import { Service, computed, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Density = 'comfortable' | 'compact';
export type CalendarView = 'week' | 'month' | 'year';

export type Language = 'en' | 'ru' | 'uk';

export interface Settings {
  theme: ThemeMode;
  language: Language;
  /** Masks every money value — for open-plan screens and screenshots. */
  hideAmounts: boolean;
  /** Hex, applied as the accent everything is tinted with. */
  accent: string;
  /** Prefix or suffix on every amount; purely a label. */
  currency: string;
  currencyBefore: boolean;
  density: Density;
  /** Monday-first is the norm for rotas, but not everywhere. */
  mondayFirst: boolean;
  view: CalendarView;
  showEarningsInCells: boolean;
  showShiftNamesInCells: boolean;
  /** Highlight Saturday and Sunday in the grid. */
  highlightWeekends: boolean;
  /** Skip transitions for anyone who finds motion distracting. */
  reduceMotion: boolean;
  /** Corner rounding, in pixels, applied through the radius tokens. */
  roundness: number;
  /** Base font size in pixels; everything else is relative to it. */
  fontScale: number;
  /** Confirm before a drag replaces a run of days. */
  confirmBulk: boolean;
  /** Scales every animation; 0 is the same as reducing motion. */
  motionSpeed: number;
  /** Softens card edges with a translucent, blurred surface. */
  glass: boolean;
  /** Shows the close-the-day nudge on the dashboard. */
  remindUnclosed: boolean;
  /** Keeps the sidebar collapsed for a wider calendar. */
  compactSidebar: boolean;
}

export const ACCENT_PRESETS = [
  { label: 'Navy', value: '#1F3A5F' },
  { label: 'Slate', value: '#3F4A5A' },
  { label: 'Teal', value: '#1F6F6B' },
  { label: 'Forest', value: '#2C6244' },
  { label: 'Plum', value: '#5B3A6E' },
  { label: 'Rust', value: '#9C4A2A' },
];

export const CURRENCY_PRESETS = ['₽', '$', '€', '£', '₴', '₸', '¥', 'zł'];

const DEFAULTS: Settings = {
  theme: 'system',
  language: 'en',
  hideAmounts: false,
  accent: '#1F3A5F',
  currency: '₽',
  currencyBefore: false,
  density: 'comfortable',
  mondayFirst: true,
  view: 'month',
  showEarningsInCells: false,
  showShiftNamesInCells: true,
  highlightWeekends: true,
  reduceMotion: false,
  roundness: 12,
  fontScale: 15,
  confirmBulk: false,
  motionSpeed: 1,
  glass: false,
  remindUnclosed: true,
  compactSidebar: false,
};

const STORAGE_KEY = 'shifter.settings';

/**
 * Appearance lives in the browser rather than on the user record: none of it
 * changes what the numbers are, only how they are shown, and keeping it local
 * means a preference applies instantly with no round trip.
 */
@Service()
export class SettingsStore {
  private readonly _settings = signal<Settings>(read());

  readonly settings = this._settings.asReadonly();

  readonly theme = computed(() => this._settings().theme);
  readonly view = computed(() => this._settings().view);
  readonly mondayFirst = computed(() => this._settings().mondayFirst);
  readonly showEarningsInCells = computed(() => this._settings().showEarningsInCells);
  readonly showShiftNamesInCells = computed(() => this._settings().showShiftNamesInCells);
  readonly highlightWeekends = computed(() => this._settings().highlightWeekends);
  readonly confirmBulk = computed(() => this._settings().confirmBulk);
  readonly hideAmounts = computed(() => this._settings().hideAmounts);
  readonly remindUnclosed = computed(() => this._settings().remindUnclosed);

  constructor() {
    effect(() => {
      const settings = this._settings();

      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      this.apply(settings);
    });
  }

  update<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this._settings.update((current) => ({ ...current, [key]: value }));
  }

  reset(): void {
    this._settings.set({ ...DEFAULTS });
  }

  /** Formats an amount with the chosen currency label. */
  format(amount: number): string {
    const { currency, currencyBefore, hideAmounts } = this._settings();

    // The mask keeps the currency mark so a hidden value still reads as money.
    if (hideAmounts) return currencyBefore ? `${currency}•••` : `••• ${currency}`;
    const text = amount.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

    if (currency === '') return text;

    return currencyBefore ? `${currency}${text}` : `${text} ${currency}`;
  }

  /**
   * Writes the choices onto the document root so plain CSS picks them up; no
   * component needs to know a theme exists.
   */
  private apply(settings: Settings): void {
    const root = document.documentElement;

    root.dataset['theme'] = settings.theme;
    root.dataset['density'] = settings.density;
    root.dataset['motion'] = settings.reduceMotion ? 'reduced' : 'full';
    root.dataset['weekends'] = settings.highlightWeekends ? 'on' : 'off';
    root.dataset['weekstart'] = settings.mondayFirst ? 'mon' : 'sun';
    root.dataset['glass'] = settings.glass ? 'on' : 'off';
    root.dataset['sidebar'] = settings.compactSidebar ? 'compact' : 'full';
    // Every duration in the sheet is multiplied by this, so one slider tunes
    // the whole feel rather than each animation separately. Folded together
    // here because an inline value would otherwise outrank the stylesheet rule
    // that reduced motion relies on.
    root.style.setProperty('--motion', settings.reduceMotion ? '0' : `${settings.motionSpeed}`);
    root.style.setProperty('--radius', `${settings.roundness}px`);
    root.style.setProperty('--radius-lg', `${settings.roundness + 4}px`);
    root.style.setProperty('--font-size', `${settings.fontScale}px`);
    root.style.setProperty('--accent', settings.accent);
    root.style.setProperty('--accent-hover', lighten(settings.accent, 0.14));
    root.style.setProperty('--accent-soft', mixWithWhite(settings.accent, 0.9));
    root.style.setProperty('--ring', hexToRgba(settings.accent, 0.18));
  }
}

function read(): Settings {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) return { ...DEFAULTS };

  try {
    // Spread over the defaults so a settings file written by an older build
    // gains any new keys instead of leaving them undefined.
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
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
  const channels = parse(hex).map((channel) =>
    Math.round(channel + (255 - channel) * amount),
  );

  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function mixWithWhite(hex: string, amount: number): string {
  return lighten(hex, amount);
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);

  return `rgb(${r} ${g} ${b} / ${alpha * 100}%)`;
}
