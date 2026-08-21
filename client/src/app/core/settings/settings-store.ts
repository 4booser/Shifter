import { Service, computed, effect, signal } from '@angular/core';

/**
 * Two neutrals each side of the line, then four tinted grounds. The tints stay
 * desaturated: this is a screen someone keeps open through a shift, and a
 * ground with real colour in it makes the coloured shift marks unreadable.
 * 'gradient' is 'night' with a lit corner rather than a separate palette.
 */
export type ThemeMode =
  | 'system'
  | 'light'
  | 'grey'
  | 'sand'
  | 'mint'
  | 'dark'
  | 'night'
  | 'ocean'
  | 'plum'
  | 'gradient';

/** Only these two answer the system preference; the rest are explicit choices. */
export const THEME_PRESETS: { value: ThemeMode; label: string; dark: boolean }[] = [
  { value: 'system', label: 'System', dark: false },
  { value: 'light', label: 'Light', dark: false },
  { value: 'grey', label: 'Grey', dark: false },
  { value: 'sand', label: 'Sand', dark: false },
  { value: 'mint', label: 'Mint', dark: false },
  { value: 'dark', label: 'Dark', dark: true },
  { value: 'night', label: 'Night', dark: true },
  { value: 'ocean', label: 'Ocean', dark: true },
  { value: 'plum', label: 'Plum', dark: true },
  { value: 'gradient', label: 'Gradient', dark: true },
];
export type Density = 'comfortable' | 'compact';
export type CalendarView = 'week' | 'month' | 'year';

export type Language = 'en' | 'ru' | 'uk';

/**
 * How much of a shift's clock time a calendar cell shows. Off by default: on a
 * month grid the times are the first thing to turn a cell into mush, and the
 * people who want them want them badly.
 */
export type CellTimes = 'none' | 'start' | 'range';

/**
 * How a day wears the colour put on it. A bar reads as an annotation and keeps
 * the cell's own contrast; a full wash reads as a category and is easier to
 * scan across a month, at the cost of everything sitting on tinted ground.
 * Neither is right for everyone, which is why it is a setting.
 */
/** How loud a hand-picked day colour is drawn. Ordered quietest to loudest. */
export type DayFill = 'outline' | 'corner' | 'underline' | 'edge' | 'wash' | 'full';

/**
 * How a shift is drawn inside a day. The shift's own colour was only ever a
 * few pixels of emoji badge, which is hard to tell apart down a column; these
 * give it more or less of the row. Ordered quietest to loudest.
 */
export type ShiftLook = 'dot' | 'mark' | 'chip' | 'bar';

/**
 * Which template belongs on which weekday, keyed by day number the way
 * Date#getDay counts them — 0 is Sunday. Used by the calendar's paint mode:
 * with a pattern set, clicking a Tuesday puts the Tuesday shift on it without
 * anyone having to pick one first.
 */
export type WeekdayShifts = Partial<Record<number, number>>;

/**
 * A named way of colouring a calendar. Two shapes, because people describe
 * their week in two different ways:
 *
 *   byWeekday — "Saturdays and Sundays green, Mondays red". Fixed to the days
 *   of the week, so it lines up with a rota that repeats weekly.
 *
 *   cycle — a run of colours repeated from a start date, which is how a 2/2 or
 *   4/2 rotation works: it has nothing to do with which weekday it falls on.
 *
 * A scheme uses one or the other. Both at once would need a rule about which
 * wins, and there is no answer to that anyone would remember.
 */
export interface ColourScheme {
  id: string;
  name: string;
  kind: 'weekday' | 'cycle';
  /** Weekday number as Date#getDay counts it, 0 being Sunday. */
  byWeekday: Partial<Record<number, string>>;
  /** One entry per day of the cycle; null leaves that day alone. */
  cycle: (string | null)[];
  /** Where the cycle starts counting, as 'YYYY-MM-DD'. */
  cycleFrom: string;
}

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
  /**
   * Decimals shown on money. Two is exact; none suits anyone paid in round
   * numbers, for whom a trailing ",5" on every figure is noise. Only the
   * display rounds — every total is still summed at full precision.
   */
  moneyDecimals: 0 | 2;
  /** Group thousands ("12 500" against "12500"). */
  groupThousands: boolean;
  /** Which window the statistics page opens on. */
  statsPeriod: string;
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
  /** Sends a system notification about days left open. */
  notifyUnclosed: boolean;
  /** Says what is on tomorrow, at the same hour as the nudge above. */
  notifyTomorrow: boolean;
  /** "HH:mm" — after the shift rather than during it. */
  notifyAt: string;
  /** Whether calendar cells carry the shift's times, and how much of them. */
  cellTimes: CellTimes;
  /** Whether a coloured day is washed through or marked down one edge. */
  dayFill: DayFill;
  /** How much of a cell row a shift's own colour takes. */
  shiftLook: ShiftLook;
  /** ISO country code for the public holidays to mark. Empty shows none. */
  holidayCountry: string;
  /** The weekly pattern paint mode places. */
  weekdayShifts: WeekdayShifts;
  /** Saved ways of colouring a calendar, by weekday or on a rotation. */
  colourSchemes: ColourScheme[];
}

/**
 * The accent tints buttons, links and the ring around a focused field. The
 * first set here were chosen to be quiet and ended up flat: at the sizes the
 * accent actually appears — a 2px ring, a small chip — a desaturated colour
 * reads as grey. These are lifted enough to survive that without turning the
 * interface into a toy.
 */
/**
 * Three steps across each hue rather than one, because the accent sits behind
 * text as often as beside it: the deep step holds white, the mid step is the
 * default, and the light step is for anyone running a dark theme who wants the
 * accent to read as a highlight rather than a block.
 */
export const ACCENT_PRESETS = [
  { label: 'Indigo', value: '#3730A3' },
  { label: 'Indigo', value: '#4F46E5' },
  { label: 'Indigo light', value: '#818CF8' },
  { label: 'Ocean', value: '#075985' },
  { label: 'Ocean', value: '#0284C7' },
  { label: 'Ocean light', value: '#38BDF8' },
  { label: 'Teal', value: '#115E59' },
  { label: 'Teal', value: '#0D9488' },
  { label: 'Teal light', value: '#2DD4BF' },
  { label: 'Emerald', value: '#15803D' },
  { label: 'Emerald', value: '#16A34A' },
  { label: 'Emerald light', value: '#4ADE80' },
  { label: 'Violet', value: '#5B21B6' },
  { label: 'Violet', value: '#7C3AED' },
  { label: 'Violet light', value: '#A78BFA' },
  { label: 'Coral', value: '#9F1239' },
  { label: 'Coral', value: '#E11D48' },
  { label: 'Coral light', value: '#FB7185' },
  { label: 'Amber', value: '#B45309' },
  { label: 'Amber', value: '#D97706' },
  { label: 'Amber light', value: '#FBBF24' },
  { label: 'Rose', value: '#9D174D' },
  { label: 'Rose', value: '#DB2777' },
  { label: 'Rose light', value: '#F472B6' },
  { label: 'Graphite', value: '#1E293B' },
  { label: 'Graphite', value: '#334155' },
  { label: 'Graphite light', value: '#64748B' },
];

export const CURRENCY_PRESETS = ['$', '€', '£', '₴', 'zł', 'Kč', '₸', '¥'];

/**
 * The windows the statistics page offers. Here rather than on that page so the
 * settings modal can offer the same list without importing a lazy route and
 * dragging the whole statistics chunk onto the dashboard.
 *
 * 'custom' is deliberately absent: it means "the two dates in those boxes",
 * which is not a thing a page can open on.
 */
export const STATS_PERIODS: { value: string; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'previous', label: 'Last month' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

const DEFAULTS: Settings = {
  theme: 'system',
  language: 'en',
  hideAmounts: false,
  accent: '#4F46E5',
  currency: '$',
  currencyBefore: false,
  moneyDecimals: 2,
  groupThousands: true,
  statsPeriod: 'month',
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
  notifyUnclosed: false,
  notifyTomorrow: false,
  notifyAt: '21:00',
  cellTimes: 'none',
  dayFill: 'edge',
  shiftLook: 'mark',
  holidayCountry: '',
  weekdayShifts: {},
  colourSchemes: [],
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
  readonly statsPeriod = computed(() => this._settings().statsPeriod);
  readonly remindUnclosed = computed(() => this._settings().remindUnclosed);
  readonly cellTimes = computed(() => this._settings().cellTimes);
  readonly dayFill = computed(() => this._settings().dayFill);
  readonly shiftLook = computed(() => this._settings().shiftLook);
  readonly holidayCountry = computed(() => this._settings().holidayCountry);
  readonly weekdayShifts = computed(() => this._settings().weekdayShifts);
  readonly colourSchemes = computed(() => this._settings().colourSchemes);

  /** Whether the weekly pattern has anything in it to place. */
  readonly hasWeekdayPattern = computed(() =>
    Object.values(this._settings().weekdayShifts).some((id) => typeof id === 'number'),
  );

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

  /** One weekday of the pattern. Null clears it, leaving that day unpainted. */
  setWeekdayShift(weekday: number, shiftId: number | null): void {
    this._settings.update((current) => {
      const next = { ...current.weekdayShifts };

      if (shiftId === null) delete next[weekday];
      else next[weekday] = shiftId;

      return { ...current, weekdayShifts: next };
    });
  }

  clearWeekdayShifts(): void {
    this.update('weekdayShifts', {});
  }

  /** Adds a scheme or replaces the one with the same id. */
  saveScheme(scheme: ColourScheme): void {
    this._settings.update((current) => {
      const existing = current.colourSchemes.some((item) => item.id === scheme.id);

      return {
        ...current,
        colourSchemes: existing
          ? current.colourSchemes.map((item) => (item.id === scheme.id ? scheme : item))
          : [...current.colourSchemes, scheme],
      };
    });
  }

  deleteScheme(id: string): void {
    this._settings.update((current) => ({
      ...current,
      colourSchemes: current.colourSchemes.filter((scheme) => scheme.id !== id),
    }));
  }

  /**
   * The language the app is set to, for grouping marks and the words Intl puts
   * in a compact number. Passing `undefined` used Chrome's own locale instead,
   * so an English interface said "100 тис. $" on a chart axis.
   */
  private readonly locale = computed(() => this._settings().language);

  /** Formats an amount with the chosen currency label. */
  format(amount: number): string {
    const { currency, currencyBefore, hideAmounts } = this._settings();

    // The mask keeps the currency mark so a hidden value still reads as money.
    if (hideAmounts) return currencyBefore ? `${currency}•••` : `••• ${currency}`;
    const { moneyDecimals, groupThousands } = this._settings();
    const text = amount.toLocaleString(this.locale(), {
      minimumFractionDigits: 0,
      maximumFractionDigits: moneyDecimals,
      useGrouping: groupThousands,
    });

    if (currency === '') return text;

    return currencyBefore ? `${currency}${text}` : `${text} ${currency}`;
  }

  /**
   * Short form for chart axes, where the gutter is a fixed number of SVG units
   * and cannot grow with the number: "50 000 ₴" does not fit and loses its first
   * digit to the clip, "50K ₴" does. Only the axis uses this — a tooltip has the
   * room to show the amount in full.
   */
  formatCompact(amount: number): string {
    const { currency, currencyBefore, hideAmounts } = this._settings();

    if (hideAmounts) return currencyBefore ? `${currency}•••` : `••• ${currency}`;
    const text = amount.toLocaleString(this.locale(), {
      notation: 'compact',
      maximumFractionDigits: 1,
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
    const stored = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };

    // The rouble was the default for a while, so browsers carry it whether or
    // not anyone chose it. It is gone from the presets, and leaving it in the
    // stored value would keep it on screen for exactly the people who never
    // picked it. Anyone who wants it back can type it: the field is free text.
    if (stored.currency === '₽') stored.currency = DEFAULTS.currency;

    return stored;
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
