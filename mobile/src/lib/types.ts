import { eyeShut } from './eye';

import { t } from '@/lib/i18n';
/** Mirrors the server DTOs the calendar screens touch. */

export interface ShiftTemplate {
  id: number;
  name: string;
  symbol: string | null;
  colour: string | null;
  start_time: string;
  end_time: string;
  salary_period: string;
  salary_amount: number;
  /** A share of the shift's takings, paid on top of the rate. */
  revenue_percent: number | null;
  tip_source: 'personal' | 'pool';
  tip_pool_percent: number | null;
  /** Unpaid minutes inside the shift; already taken off hours. */
  break_minutes: number;
  location_id: number | null;
  archived: boolean;
}

/** "₴200 за час + 3%" — the rate, the percentage, or the two stacked. */
export const rateLine = (template: {
  salary_amount: number;
  salary_period: string;
  revenue_percent: number | null;
}): string => {
  const period =
    template.salary_period === 'hour'
      ? t('за час')
      : template.salary_period === 'day'
        ? t('за смену')
        : template.salary_period === 'week'
          ? t('в неделю')
          : t('в месяц');
  // Not money(): rates can be fractional and rounding ₴85,5 to ₴86 would
  // misquote the contract. The shutter still applies — a wage on a picker
  // is exactly what a shoulder reads first.
  const base =
    template.salary_amount > 0
      ? `${eyeShut() ? '₴•••' : `₴${template.salary_amount}`} ${period}`
      : null;
  const percent = template.revenue_percent === null ? null : `${template.revenue_percent}%`;

  return [base, percent].filter((part) => part !== null).join(' + ') || t('без ставки');
};

/**
 * Paid hours a template is worth: start to end, wrapping midnight, less the
 * break. The server prices the real thing off the placement; this is only for
 * what a client is about to add, and is always labelled as an estimate.
 */
export const templateHours = (template: {
  start_time: string;
  end_time: string;
  break_minutes: number;
}): number => {
  const [fromHour, fromMinute] = template.start_time.split(':').map(Number);
  const [toHour, toMinute] = template.end_time.split(':').map(Number);
  let minutes = toHour * 60 + toMinute - (fromHour * 60 + fromMinute);

  if (minutes <= 0) minutes += 24 * 60;

  return Math.max(0, minutes - (template.break_minutes ?? 0)) / 60;
};

/**
 * Where in the venue a shift was worked. Every waiter knows the terrace tips
 * better than the bar and none of them can say by how much.
 */
export type ShiftZone = 'unset' | 'hall' | 'bar' | 'terrace' | 'banquet' | 'takeaway';

export interface DayShiftEntry {
  shift_id: number;
  name: string;
  symbol: string | null;
  colour: string | null;
  start_time: string;
  end_time: string;
  /** Paid hours: the span less the break. Sent all along, read only now. */
  hours: number;
  worked: boolean;
  needs_cover: boolean;
  actual_start: string | null;
  actual_end: string | null;
  break_minutes: number | null;
  earned: number;
  /** What the shift took, where it was recorded. Null is "not counted". */
  revenue: number | null;
  /** How many it served. Null is "nobody counted", which is not zero. */
  guests: number | null;
  /** Where in the venue. "unset" is an answer: nobody said. */
  zone: ShiftZone;
  /** The agreed share of it, already inside earned. */
  revenue_percent: number | null;
}

export interface CalendarDayData {
  date: string;
  shifts: DayShiftEntry[];
  /**
   * The positions sold that day. The phone does not let anybody edit these
   * yet, but it has to carry them back: a save replaces the day whole, so
   * sending an empty list deleted them and the commission with them.
   */
  sales?: { sales_id: number; quantity: number }[];
  tips: number | null;
  tips_cash: number | null;
  /** What the room took before the split, where the tips are pooled. */
  tip_pool: number | null;
  deductions: number;
  /** Why the day cost money, where it was said. */
  deduction_reason?: DeductionReason | null;
  note: string | null;
  colour: string | null;
  hours: number;
  earned: number;
  planned: number;
  /** Bumped by the server on every save; echoed back in DaySave. */
  version?: number;
}

/** One rate, and the day the bank actually published it. */
export interface RateUsed {
  code: string;
  rate: string;
  on: string;
}

export interface Conversion {
  base_currency: string;
  total_earned: number;
  net_earned: number;
  by_location: {
    location_id: number;
    name: string;
    currency: string;
    earned: number;
    converted: number | null;
  }[];
  rates: RateUsed[];
  /** Currencies with no published rate; their money is not in the totals. */
  unconverted: string[];
}

/**
 * Something that takes a day without paying for it. Events mark time, shifts
 * pay for it — which is why nothing in this shape is money.
 */
export type EventKind = 'ordinary' | 'vacation' | 'sick' | 'dayoff';

export interface CalendarEvent {
  id: number;
  name: string;
  symbol: string | null;
  colour: string;
  start_date: string;
  /** Inclusive, and equal to start_date for a single day. */
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  kind: EventKind;
  /** How many days it covers, both ends included. */
  days: number;
  repeat_weekdays: string | null;
  repeat_until: string | null;
  /** What it cost, per occurrence. Never inside anything earned. */
  cost: number;
  template_id: number | null;
}

/**
 * A repeatable thing that is not work: «английский», «вождение», the gym.
 * The money on it points outward — what it costs, kept beside what a week
 * earns and never folded into it.
 */
export interface EventTemplate {
  id: number;
  name: string;
  symbol: string | null;
  colour: string;
  kind: EventKind;
  start_time: string | null;
  end_time: string | null;
  /** Null is "not counted", which is not zero. */
  cost: number | null;
  archived: boolean;
  hours: number;
}

export interface EventSave {
  name: string;
  symbol: string | null;
  colour: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  kind: EventKind;
  cost?: number;
  template_id?: number | null;
}

/**
 * What the pencil offers under "события". Four of them are the kinds the
 * server treats specially — leave and sickness leave the pace alone — and the
 * rest are the ones people actually asked for by name.
 */
export const EVENT_PRESETS: { kind: EventKind; name: string; symbol: string; colour: string }[] = [
  { kind: 'dayoff', name: 'Выходной', symbol: '\u{1F634}', colour: '#38BDF8' },
  { kind: 'vacation', name: 'Отпуск', symbol: '\u{1F334}', colour: '#22C55E' },
  { kind: 'sick', name: 'Больничный', symbol: '\u{1F912}', colour: '#FF5C7A' },
  { kind: 'ordinary', name: 'Учёба', symbol: '\u{1F4DA}', colour: '#A855F7' },
  { kind: 'ordinary', name: 'Подработка', symbol: '\u{1F4BC}', colour: '#FFA53D' },
  { kind: 'ordinary', name: 'Дела', symbol: '\u{1F4CC}', colour: '#64748B' },
];

export interface DaysResponse {
  days: CalendarDayData[];
  /**
   * Everything overlapping the range, once each rather than repeated on every
   * day it covers. The phone ignored these for a year, which is why a fortnight
   * of leave was invisible on the only screen anybody actually looks at.
   */
  events?: CalendarEvent[];
  total_earned: number;
  /** Shifts in the range that are still ahead — never mixed into the total. */
  planned_earned: number;
  hours: number;
  planned_hours: number;
  days_worked: number;
  days_planned: number;
  /** The server has sent these all along; the phone only now reads them. */
  tips_earned: number;
  net_earned: number;
  deductions: number;
  expenses: number;
  /** Present only where the range mixes currencies and one was asked for. */
  conversion?: Conversion | null;
}

/** An amount labelled with its ISO code, for money that sits beside other money. */
export const moneyIn = (code: string, value: number) =>
  eyeShut() ? `••• ${code}` : `${Math.round(value).toLocaleString('ru')} ${code}`;

export interface DaySave {
  shifts: {
    shift_id: number;
    worked: boolean;
    needs_cover: boolean;
    actual_start: string | null;
    actual_end: string | null;
    break_minutes: number | null;
    /** What this shift took. Null leaves it uncounted, not zero. */
    revenue: number | null;
  }[];
  sales: { sales_id: number; quantity: number }[];
  tips: number | null;
  tips_cash: number | null;
  /** The day's pool before the split; the server works out the share. */
  tip_pool: number | null;
  deductions: number | null;
  deduction_reason?: DeductionReason | null;
  note: string | null;
  colour: string | null;
  /**
   * The version this phone loaded, echoed back so the server can refuse a
   * save over an edit made on another device. Absent keeps last-write-wins.
   */
  version?: number;
}

/**
 * Why a day cost money. Kept short on purpose — a list nobody scrolls is a list
 * people answer honestly, and the note is there for the rest.
 */
export type DeductionReason =
  | 'breakage'
  | 'shortfall'
  | 'late'
  | 'waste'
  | 'uniform'
  | 'other';

export const DEDUCTION_REASONS: { value: DeductionReason; label: string }[] = [
  { value: 'shortfall', label: 'Недостача' },
  { value: 'breakage', label: 'Бой' },
  { value: 'late', label: 'Опоздание' },
  { value: 'waste', label: 'Списание' },
  { value: 'uniform', label: 'Форма' },
  { value: 'other', label: 'Другое' },
];

/**
 * A day the server has never heard of.
 *
 * Only days that exist come back from the range query, so tapping any empty
 * cell handed the day screen `undefined` — it printed "День не загрузился",
 * kept the template palette on screen, and then crashed on the first tap.
 * That is the first thing anybody does with a new account.
 */
export const blankDay = (date: string): CalendarDayData => ({
  date,
  shifts: [],
  sales: [],
  tips: null,
  tips_cash: null,
  tip_pool: null,
  deductions: 0,
  deduction_reason: null,
  note: null,
  colour: null,
  hours: 0,
  earned: 0,
  planned: 0,
});

/** What the work cost, as opposed to what the venue took off somebody. */
export type ExpenseKind = 'transport' | 'uniform' | 'tools' | 'food' | 'training' | 'other';

export const EXPENSE_KINDS: { value: ExpenseKind; label: string }[] = [
  { value: 'transport', label: 'Дорога' },
  { value: 'uniform', label: 'Форма' },
  { value: 'tools', label: 'Инструмент' },
  { value: 'food', label: 'Еда' },
  { value: 'training', label: 'Учёба' },
  { value: 'other', label: 'Другое' },
];

export interface Expense {
  id: number;
  date: string;
  amount: number;
  kind: ExpenseKind;
  note: string | null;
  location_id: number | null;
  location_name: string | null;
}

/** A piece of paper without which somebody is not allowed on shift. */
export type DocumentKind = 'medical' | 'sanitary' | 'certificate' | 'licence' | 'permit' | 'other';

export const DOCUMENT_KINDS: { value: DocumentKind; label: string }[] = [
  { value: 'medical', label: 'Медкнижка' },
  { value: 'sanitary', label: 'Санминимум' },
  { value: 'certificate', label: 'Сертификат' },
  { value: 'licence', label: 'Права' },
  { value: 'permit', label: 'Разрешение' },
  { value: 'other', label: 'Другое' },
];

export interface WorkDocument {
  id: number;
  kind: DocumentKind;
  name: string;
  expires_on: string;
  note: string | null;
  /** Negative once it has run out. Computed on the server, so the phone and
   *  the site cannot disagree about whether something has expired. */
  days_left: number;
  state: 'expired' | 'urgent' | 'soon' | 'fine';
}

export const toSavePayload = (day: CalendarDayData | undefined): DaySave => ({
  shifts: (day?.shifts ?? []).map((entry) => ({
    shift_id: entry.shift_id,
    worked: entry.worked,
    needs_cover: entry.needs_cover,
    actual_start: entry.actual_start,
    actual_end: entry.actual_end,
    break_minutes: entry.break_minutes,
    revenue: entry.revenue,
  })),
  // Carried through untouched. Sending [] here wiped every position recorded
  // on the web, along with its commission, on any save from the phone —
  // including finishing a shift and adding a gig to the calendar.
  sales: (day?.sales ?? []).map((entry) => ({
    sales_id: entry.sales_id,
    quantity: entry.quantity,
  })),
  tips: day?.tips ?? null,
  // Clamped rather than carried: the phone has no field for the cash half, so
  // lowering the total on the phone used to be refused outright by the server
  // — with an English error, and nothing on the phone could unstick it.
  tips_cash:
    day?.tips_cash == null
      ? null
      : Math.min(day.tips_cash, day.tips ?? 0),
  tip_pool: day?.tip_pool ?? null,
  deductions: day?.deductions ?? null,
  deduction_reason: day?.deduction_reason ?? null,
  note: day?.note ?? null,
  colour: day?.colour ?? null,
  version: day?.version ?? 0,
});

export const money = (value: number) =>
  eyeShut() ? '₴•••' : `₴${Math.round(value).toLocaleString('ru')}`;

/**
 * Money the width of a calendar cell: 1 240 becomes "1,2к".
 *
 * The currency sign is left off on purpose — it is already on the total above
 * the grid, and six glyphs do not fit in a square that also has to hold a
 * date. Empty for zero: a cell showing "0" reads as a day that paid nothing,
 * not as a day nobody has filled in.
 */
export const moneyShort = (value: number): string => {
  // A shut eye empties the cell rather than filling the grid with dots:
  // thirty-one •• say less than nothing and shout that something is hidden.
  if (eyeShut()) return '';

  const rounded = Math.round(value);

  if (rounded === 0) return '';
  if (Math.abs(rounded) < 1000) return `${rounded}`;

  const thousands = rounded / 1000;

  return Math.abs(thousands) < 10
    ? `${thousands.toFixed(1).replace('.', ',')}\u043a`
    : `${Math.round(thousands)}\u043a`;
};

/**
 * A '#RRGGBB' with an alpha on it. Anything unparseable comes back null so the
 * caller can fall back to the palette rather than paint a cell 'NaN'.
 */
export const tint = (hex: string | null, alpha: number): string | null => {
  if (hex === null) return null;

  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  const value = parseInt(full, 16);

  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

/**
 * Russian declines after a number, so a count and its word are one call:
 * "1 раз", "2 раза", "5 раз". Getting this wrong is the tell that nobody
 * read the sentence out loud.
 */
export const plural = (count: number, one: string, few: string, many: string): string => {
  const tens = count % 100;
  const units = count % 10;

  if (tens >= 11 && tens <= 14) return `${count} ${many}`;
  if (units === 1) return `${count} ${one}`;
  if (units >= 2 && units <= 4) return `${count} ${few}`;

  return `${count} ${many}`;
};
