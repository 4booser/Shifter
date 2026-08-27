/**
 * Appearance and behaviour, stored in the browser under the same key the
 * previous client used — an upgrade must not cost anyone their theme, accent
 * or saved colour schemes. None of this changes what the numbers are, only how
 * they are shown, and keeping it local means a preference applies instantly.
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

/** Only 'system' answers the OS preference; the rest are explicit choices. */
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
export type CellTimes = 'none' | 'start' | 'range';
/** How loud a hand-picked day colour is drawn. Ordered quietest to loudest. */
export type DayFill = 'outline' | 'corner' | 'underline' | 'edge' | 'wash' | 'full';
/** How much of a cell row a shift's own colour takes. Quietest to loudest. */
export type ShiftLook = 'dot' | 'mark' | 'chip' | 'bar';

/** Weekday number as Date#getDay counts it (0 = Sunday) to a template id. */
export type WeekdayShifts = Partial<Record<number, number>>;

/**
 * A named way of colouring a calendar: fixed to weekdays, or a run of colours
 * repeating from a start date — the two shapes people describe a week in.
 */
export interface ColourScheme {
  id: string;
  name: string;
  kind: 'weekday' | 'cycle';
  byWeekday: Partial<Record<number, string>>;
  cycle: (string | null)[];
  cycleFrom: string;
}

export interface Settings {
  theme: ThemeMode;
  language: Language;
  hideAmounts: boolean;
  accent: string;
  currency: string;
  currencyBefore: boolean;
  moneyDecimals: 0 | 2;
  groupThousands: boolean;
  statsPeriod: string;
  density: Density;
  mondayFirst: boolean;
  view: CalendarView;
  showEarningsInCells: boolean;
  showShiftNamesInCells: boolean;
  highlightWeekends: boolean;
  reduceMotion: boolean;
  roundness: number;
  fontScale: number;
  confirmBulk: boolean;
  motionSpeed: number;
  glass: boolean;
  remindUnclosed: boolean;
  compactSidebar: boolean;
  notifyUnclosed: boolean;
  notifyTomorrow: boolean;
  notifyPayday: boolean;
  notifyDigest: boolean;
  /** Warns while the week can still be changed, never after. */
  notifyOvertime: boolean;
  notifyAt: string;
  cellTimes: CellTimes;
  dayFill: DayFill;
  shiftLook: ShiftLook;
  holidayCountry: string;
  weekdayShifts: WeekdayShifts;
  colourSchemes: ColourScheme[];
  /** Visible dashboard tiles in order; null means the default set. */
  dashboardTiles: string[] | null;
  /** How the person is written in the wall rota, for the photo import. */
  scheduleName: string;
  /** A short chime and a buzz when a live shift lands. */
  clockOutChime: boolean;
}

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

export const STATS_PERIODS: { value: string; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'previous', label: 'Last month' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

export const DEFAULT_SETTINGS: Settings = {
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
  notifyPayday: false,
  notifyDigest: false,
  notifyOvertime: false,
  notifyAt: '21:00',
  cellTimes: 'none',
  dayFill: 'edge',
  shiftLook: 'mark',
  holidayCountry: '',
  weekdayShifts: {},
  colourSchemes: [],
  dashboardTiles: null,
  scheduleName: '',
  clockOutChime: false,
};
