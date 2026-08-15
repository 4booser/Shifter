/**
 * Mirrors the contracts in src/Application/Features/business/DTOs. Money and
 * hours are computed server-side; the client only displays what it is given.
 */

export type SalaryPeriod = 'hour' | 'day' | 'week' | 'month';

export const SALARY_PERIODS: { value: SalaryPeriod; label: string }[] = [
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export interface ShiftTemplate {
  id: number;
  name: string;
  symbol: string | null;
  location_id: number | null;
  location_name: string | null;
  location_colour: string | null;
  /** "HH:mm". */
  start_time: string;
  end_time: string;
  salary_period: SalaryPeriod;
  salary_amount: number | null;
  /** Paid hours, breaks already deducted. */
  hours: number;
  archived: boolean;
}

export interface ShiftCreate {
  name: string;
  symbol: string | null;
  location_id: number | null;
  start_time: string;
  end_time: string;
  salary_period: SalaryPeriod;
  salary_amount: number | null;
}

export type PayPeriodKind = 'monthly' | 'semimonthly' | 'biweekly' | 'weekly';

export const PAY_PERIODS: { value: PayPeriodKind; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'weekly', label: 'Weekly' },
];

export interface WorkLocation {
  id: number;
  name: string;
  address: string | null;
  colour: string;
  pay_period: PayPeriodKind;
  pay_day: number;
  pay_anchor: string;
  current_period_from: string;
  current_period_to: string;
  overtime_weekly_hours: number;
  overtime_multiplier: number;
  archived: boolean;
}

export interface WorkLocationCreate {
  name: string;
  address: string | null;
  colour: string;
  pay_period: PayPeriodKind;
  pay_day: number;
  pay_anchor: string | null;
  overtime_weekly_hours: number;
  overtime_multiplier: number;
}

export interface LocationTotal {
  location_id: number;
  name: string;
  colour: string;
  hours: number;
  earned: number;
}

export interface SalesPosition {
  id: number;
  name: string;
  price: number;
  /** Percent of the price kept per unit, e.g. 7.5. */
  percentage: number | null;
  archived: boolean;
}

export interface SalesCreate {
  name: string;
  price: number;
  percentage: number | null;
}

export interface DaySale {
  sales_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  percentage: number;
  earned: number;
}

export interface DayShiftEntry {
  shift_id: number;
  name: string;
  symbol: string | null;
  colour: string | null;
  start_time: string;
  end_time: string;
  hours: number;
  earned: number;
  /** False means planned rather than done. */
  worked: boolean;
}

export interface CalendarDayData {
  /** 'YYYY-MM-DD', the same shape as the calendar grid keys. */
  date: string;
  shifts: DayShiftEntry[];
  sales: DaySale[];
  tips: number | null;
  note: string | null;
  /** Paid hours of the shifts marked worked. */
  hours: number;
  earned: number;
  planned: number;
}

/** The range response: days plus the totals worked out for them. */
export interface DaysResponse {
  days: CalendarDayData[];
  hours: number;
  planned_hours: number;
  shifts_earned: number;
  sales_earned: number;
  tips_earned: number;
  /** Weekly and monthly wages, counted once per period they cover. */
  period_earned: number;
  total_earned: number;
  planned_earned: number;
  days_worked: number;
  days_planned: number;
  /** Payouts whose period ends inside the range. */
  paid: number;
  /** paid minus total_earned: negative means short. */
  difference: number;
  by_location: LocationTotal[];
  overtime_hours: number;
  overtime_earned: number;
}

export interface Payout {
  id: number;
  period_from: string;
  period_to: string;
  amount: number;
  received_on: string;
  note: string | null;
}

export interface PayoutCreate {
  period_from: string;
  period_to: string;
  amount: number;
  received_on: string;
  note: string | null;
}

/** A day is always sent whole, never patched. */
export interface DaySave {
  shifts: { shift_id: number; worked: boolean }[];
  sales: { sales_id: number; quantity: number }[];
  tips: number | null;
  note: string | null;
}

export const NOTE_MAX_LENGTH = 500;

export const EMPTY_SUMMARY: DaysResponse = {
  days: [],
  hours: 0,
  planned_hours: 0,
  shifts_earned: 0,
  sales_earned: 0,
  tips_earned: 0,
  period_earned: 0,
  total_earned: 0,
  planned_earned: 0,
  days_worked: 0,
  days_planned: 0,
  paid: 0,
  difference: 0,
  by_location: [],
  overtime_hours: 0,
  overtime_earned: 0,
};

/** Turns a stored day back into the payload the save endpoint expects. */
export function toSavePayload(day: CalendarDayData | undefined): DaySave {
  return {
    shifts: (day?.shifts ?? []).map((entry) => ({
      shift_id: entry.shift_id,
      worked: entry.worked,
    })),
    sales: (day?.sales ?? []).map((entry) => ({
      sales_id: entry.sales_id,
      quantity: entry.quantity,
    })),
    tips: day?.tips ?? null,
    note: day?.note ?? null,
  };
}

/** "350 / hour", or just the period when no amount is set. */
export function rateLabel(template: ShiftTemplate): string {
  const amount = template.salary_amount;

  return amount === null ? `per ${template.salary_period}` : `${amount} / ${template.salary_period}`;
}

export interface EmojiGroup {
  label: string;
  emojis: string[];
}

/**
 * Grouped by the kind of work rather than thrown together, so picking one is a
 * glance instead of a scan. Everything here reads at 10px in a calendar cell —
 * busy glyphs turn to mush at that size and are left out.
 */
export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    label: 'Time of day',
    emojis: ['☀️', '🌤️', '🌅', '🌆', '🌙', '🌃', '⭐️', '🕐'],
  },
  {
    label: 'Food and drink',
    emojis: ['☕️', '🍺', '🍸', '🍽️', '🍕', '🍔', '🥐', '🧋', '🍳', '🥂'],
  },
  {
    label: 'Retail and service',
    emojis: ['🛍️', '💳', '🧾', '📦', '🏪', '💈', '💇', '🧴', '🪒', '🧺'],
  },
  {
    label: 'Trades and transport',
    emojis: ['🔧', '🔨', '🪚', '🚚', '🚕', '🚜', '🏗️', '⚡️', '🪜', '🧱'],
  },
  {
    label: 'Care and health',
    emojis: ['🏥', '💊', '🩺', '🚑', '🧑‍⚕️', '🦷', '🐕', '👶'],
  },
  {
    label: 'Desk and study',
    emojis: ['💻', '📊', '📞', '🎧', '✏️', '📚', '🖥️', '🗂️'],
  },
  {
    label: 'Facilities',
    emojis: ['🧹', '🧽', '🔑', '🛎️', '🚪', '🪣', '🌿', '🛡️'],
  },
  {
    label: 'Status',
    emojis: ['✅', '❗️', '⏸️', '🏖️', '🤒', '🎓', '✈️', '🏠'],
  },
];

/** Flat list, kept for anything that just needs "is this one of ours". */
export const SHIFT_EMOJIS = EMOJI_GROUPS.flatMap((group) => group.emojis);
