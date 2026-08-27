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

/**
 * Where a shift's tips come from. Personal tips are what this person was
 * handed; a pool share is a slice of what the room took, and the two cannot
 * be the same field without one of them being a lie.
 */
export type TipSource = 'personal' | 'pool';

export interface ShiftTemplate {
  id: number;
  name: string;
  symbol: string | null;
  location_id: number | null;
  location_name: string | null;
  location_colour: string | null;
  /** The template's own colour, or null when it borrows the place's. */
  colour: string | null;
  /** What to draw: own colour first, the place's as a fallback. */
  effective_colour: string | null;
  /** "HH:mm". */
  start_time: string;
  end_time: string;
  salary_period: SalaryPeriod;
  salary_amount: number | null;
  /** A share of the shift's takings, paid on top of the rate. Null means none. */
  revenue_percent: number | null;
  tip_source: TipSource;
  /** This person's slice of the pool, where the tips are pooled. */
  tip_pool_percent: number | null;
  /** Unpaid minutes inside the shift. */
  break_minutes: number;
  /** Paid hours, breaks already deducted. */
  hours: number;
  archived: boolean;
}

export interface ShiftCreate {
  name: string;
  symbol: string | null;
  location_id: number | null;
  /** '#RRGGBB', or null to go back to the place's colour. */
  colour: string | null;
  start_time: string;
  end_time: string;
  salary_period: SalaryPeriod;
  salary_amount: number | null;
  revenue_percent: number | null;
  tip_source: TipSource;
  tip_pool_percent: number | null;
  break_minutes: number;
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
  /** 1 means the place pays no night premium at all. */
  night_multiplier: number;
  night_from: string;
  night_to: string;
  public_holiday_multiplier: number;
  /** '' means no holiday calendar, so no holiday premium. */
  holiday_country: string;
  tip_out_of_tips_percent: number;
  tip_out_of_sales_percent: number;
  meal_deduction: number;
  /** Withheld at source, as a percent. */
  tax_percent: number;
  tax_tips: boolean;
  /** Accrued for later, never part of what was earned now. */
  holiday_percent: number;
  /** Empty means "whatever the app is set to". */
  currency: string;
  archived: boolean;
  /**
   * Empty where the sales commission arrives with everything else. Set where it
   * settles on its own cycle — the common case being a wage paid twice a month
   * against a percentage paid once.
   */
  sales_pay_period: PayPeriodKind | '';
  sales_pay_day: number;
  sales_pay_anchor: string;
  latitude: number | null;
  longitude: number | null;
  /** Hours after which an unpaid break applies itself. 0 is off. */
  auto_break_after_hours: number;
  auto_break_minutes: number;
  /** The hourly rate this person will not go under here. 0 is off. */
  minimum_hourly: number;
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
  night_multiplier: number;
  night_from: string;
  night_to: string;
  public_holiday_multiplier: number;
  holiday_country: string;
  tip_out_of_tips_percent: number;
  tip_out_of_sales_percent: number;
  meal_deduction: number;
  tax_percent: number;
  tax_tips: boolean;
  holiday_percent: number;
  /** Null means "use the app's currency". */
  currency: string | null;
  /** Empty leaves the commission on the main cycle. */
  sales_pay_period: PayPeriodKind | '';
  sales_pay_day: number;
  sales_pay_anchor: string | null;
  latitude?: number | null;
  longitude?: number | null;
  auto_break_after_hours?: number;
  auto_break_minutes?: number;
  minimum_hourly?: number;
}

export interface LocationTotal {
  location_id: number;
  name: string;
  colour: string;
  hours: number;
  earned: number;
  days_worked: number;
  tips: number;
  sales: number;
  tip_out: number;
  deductions: number;
  /** Everything the place produced per paid hour. */
  per_hour: number;
  tax: number;
  /** earned minus tax. */
  net: number;
  holiday: number;
  currency: string;
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
  /** What the shift took, where it was recorded. Null is "not counted". */
  revenue: number | null;
  /** The agreed share of it, already inside earned. */
  revenue_percent: number | null;
  /** False means planned rather than done. */
  worked: boolean;
  /** Asking the team to take this one. */
  needs_cover: boolean;
  /** "HH:mm" where the recorded clock differs from the plan; both or neither. */
  actual_start: string | null;
  actual_end: string | null;
  /** Unpaid minutes inside the shift as placed on this day. */
  break_minutes: number;
}

/**
 * Something that occupies days without being work. Mirrors EventDto, and like
 * it has nowhere to put money: events mark time, shifts pay for it.
 */
export type EventKind = 'ordinary' | 'vacation' | 'sick' | 'dayoff';

export interface CalendarEvent {
  id: number;
  name: string;
  symbol: string | null;
  colour: string;
  /** 'YYYY-MM-DD'. */
  start_date: string;
  /** Inclusive, and equal to start_date for a single day. */
  end_date: string;
  /** "HH:mm", or null when it lasts all day. */
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  /** Leave and sickness leave the pace alone; ordinary events never touched it. */
  kind: EventKind;
  /** How many days it covers, both ends included. */
  days: number;
  /** Monday-first weekday numbers, comma-joined; null = a one-off. */
  repeat_weekdays: string | null;
  repeat_until: string | null;
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
  repeat_weekdays?: string | null;
  repeat_until?: string | null;
  kind: EventKind;
}

export interface CalendarDayData {
  /** 'YYYY-MM-DD', the same shape as the calendar grid keys. */
  date: string;
  shifts: DayShiftEntry[];
  sales: DaySale[];
  tips: number | null;
  tips_cash: number | null;
  /** What the room took before the split, where the tips are pooled. */
  tip_pool: number | null;
  /** Handed to support staff; already deducted from earned. */
  tip_out: number;
  /** Meal withholding plus fines; already deducted from earned. */
  deductions: number;
  /** Why the day cost money, where it was said. */
  deduction_reason?: DeductionReason | null;
  note: string | null;
  /** Set by hand, as '#RRGGBB'. Null means the cell colours itself. */
  colour: string | null;
  /** A worked shift on this day paid less per hour than its place's floor. */
  below_floor: boolean;
  /** Paid hours of the shifts marked worked. */
  hours: number;
  earned: number;
  planned: number;
}

/** The range response: days plus the totals worked out for them. */
/** One rate, and the day the bank actually published it. */
export interface RateUsed {
  code: string;
  rate: string;
  on: string;
}

export interface ConvertedPlace {
  location_id: number;
  name: string;
  currency: string;
  earned: number;
  /** Null where this currency had no rate; its money is not in the totals. */
  converted: number | null;
}

export interface Conversion {
  base_currency: string;
  total_earned: number;
  net_earned: number;
  by_location: ConvertedPlace[];
  rates: RateUsed[];
  /** Currencies the bank had no rate for, named rather than counted as one-to-one. */
  unconverted: string[];
}

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
  /** Handed to support staff; already deducted from total_earned. */
  tip_out: number;
  /** Meals withheld plus fines across the range. */
  deductions: number;
  /**
   * The fines alone, split by what caused them, largest first. Five broken
   * glasses and one till shortfall add up the same and mean completely
   * different things.
   */
  deductions_by_reason: DeductionSplit[];
  /**
   * Every time the rate moved on a shift worked in the range, newest first.
   * Read out of the placements, so it records money that actually changed
   * hands rather than what a template said at some point.
   */
  raises: Raise[];
  tax: number;
  /** total_earned minus tax. */
  net_earned: number;
  /** Owed later; deliberately outside every other total. */
  holiday_accrued: number;
  /** More than one entry means the totals mix currencies. */
  currencies: string[];
  /**
   * The range restated in one currency. Present only where more than one was
   * earned in and the client asked for it — converting a range already in one
   * currency is noise, and noise beside money is how people stop reading
   * totals.
   */
  conversion: Conversion | null;
  by_location: LocationTotal[];
  overtime_hours: number;
  overtime_earned: number;
  /** Hours inside a place's night window, premium places only. */
  night_hours: number;
  /** What night and public-holiday rules added on top of the base. */
  premium_earned: number;
  /** The share of the takings across the range, already inside shifts_earned. */
  revenue_earned: number;
  /** What those shifts took, where it was recorded. */
  revenue_counted: number;
  /**
   * Everything overlapping the range, once each rather than repeated on every
   * day it covers. The store spreads them across the cells.
   */
  events: CalendarEvent[];
}

/** Why a day cost money. 'unsaid' is the bucket for fines nobody labelled. */
export type DeductionReason =
  | 'breakage'
  | 'shortfall'
  | 'late'
  | 'waste'
  | 'uniform'
  | 'other';

/** Fines of one kind over a range: how much, and on how many days. */
export interface DeductionSplit {
  reason: DeductionReason | 'unsaid';
  amount: number;
  days: number;
}

/** One change of rate: when, between what, and what it has come to since. */
export interface Raise {
  shift_id: number;
  shift_name: string;
  location_name: string | null;
  on: string;
  before: number;
  after: number;
  /** hour, day, week or month — the two rates are always in the same one. */
  period: 'hour' | 'day' | 'week' | 'month';
  /** What the change has come to since, against work actually done. */
  worth_since: number;
  days_ago: number;
}

export interface Payout {
  id: number;
  period_from: string;
  period_to: string;
  amount: number;
  received_on: string;
  note: string | null;
  /** Null when the payment was not attributed to a place. */
  location_id: number | null;
  location_name: string | null;
  /** What kind of payment it is; see PayoutKind. */
  kind: PayoutKind;
}

/**
 * The аванс arrives mid-month and the расчёт closes it. Recorded as one kind of
 * payment they look like an underpayment every single month, which is how a
 * warning stops being read.
 */
export type PayoutKind = 'settlement' | 'advance' | 'bonus' | 'cash';

export interface PayoutCreate {
  period_from: string;
  period_to: string;
  amount: number;
  received_on: string;
  note: string | null;
  location_id: number | null;
  /** Which of the place's payments this settles; 'all' where it pays everything. */
  stream: 'all' | 'wage' | 'commission';
  kind: PayoutKind;
}

/** How long a goal covers. */
export type GoalPeriod = 'day' | 'week' | 'month' | 'year';

/**
 * An amount to aim for. A null anchor is a standing goal — every month, every
 * day, whichever the period is; an anchor names one period alone, and beats the
 * standing goal for that period.
 */
export interface Goal {
  id: number;
  period: GoalPeriod;
  amount: number;
  anchor: string | null;
  note: string | null;
  /** The stretch this goal governs right now. */
  current_from: string;
  current_to: string;
}

export interface GoalSave {
  period: GoalPeriod;
  amount: number;
  /** Any date inside the period being named; null for the standing goal. */
  anchor: string | null;
  note: string | null;
}

/** One pay period at one place: what is owed, what came, where that leaves it. */
export interface PayPeriodRow {
  location_id: number;
  location_name: string;
  colour: string;
  period_from: string;
  period_to: string;
  /** When the money is due, from the place's own pay day. */
  due_on: string;
  /** Take-home for the period: earned less tax withheld. */
  expected: number;
  paid: number;
  /** paid minus expected; negative is a shortfall. */
  difference: number;
  hours: number;
  /**
   * 'partial' is an advance with the settlement still to come: money is
   * outstanding, but nobody has done anything wrong yet.
   */
  status: 'open' | 'due' | 'overdue' | 'partial' | 'paid' | 'short' | 'over';
  days_late: number;
  /**
   * Which payment this row is. 'all' where a place settles everything at once;
   * 'wage' and 'commission' where the percentage runs on its own cycle, in
   * which case two rows can cover overlapping days without being duplicates.
   */
  stream: 'all' | 'wage' | 'commission';
  /**
   * Set where this shortfall has been closed: 'paid' if the money arrived off
   * the books, 'written-off' if it never will. Both stop it counting as owed;
   * only one of them is good news.
   */
  settled: 'paid' | 'written-off' | null;
  settled_note: string | null;
  /** How much of what arrived was an advance. */
  paid_advance: number;
}

/** A place that has come up short more than once running. */
export interface Shortfall {
  location_id: number;
  location_name: string;
  periods: number;
  /** How much is missing, as a positive amount. */
  total_short: number;
  since: string;
  /** Which payment is short, where a place settles more than one. */
  stream: 'all' | 'wage' | 'commission';
}

export interface Reconciliation {
  periods: PayPeriodRow[];
  shortfalls: Shortfall[];
  /** Everything still owed across every place. */
  awaited: number;
  /** Owed and past its due date. */
  overdue: number;
}

/** A day is always sent whole, never patched. */
export interface DaySave {
  shifts: {
    shift_id: number;
    worked: boolean;
    needs_cover: boolean;
    actual_start?: string | null;
    actual_end?: string | null;
    break_minutes?: number | null;
    /** What this shift took. Null leaves it uncounted, not zero. */
    revenue?: number | null;
  }[];
  tips_cash: number | null;
  deductions: number | null;
  deduction_reason?: DeductionReason | null;
  sales: { sales_id: number; quantity: number }[];
  tips: number | null;
  /** The day's pool before the split; the server works out the share. */
  tip_pool: number | null;
  note: string | null;
  /** '#RRGGBB', or null to clear it. */
  colour: string | null;
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
  tip_out: 0,
  deductions: 0,
  deductions_by_reason: [],
  raises: [],
  tax: 0,
  net_earned: 0,
  holiday_accrued: 0,
  currencies: [],
  conversion: null,
  by_location: [],
  overtime_hours: 0,
  night_hours: 0,
  premium_earned: 0,
  overtime_earned: 0,
  revenue_earned: 0,
  revenue_counted: 0,
  events: [],
};

/**
 * The swatches offered for days and events. Bright on purpose: these sit as
 * small marks on a pale grid, and a muted colour at that size reads as grey.
 * Each one holds its own against both themes rather than only against white.
 */
/**
 * Two rows of hues, then a deep step under each. A mark is a few millimetres
 * across, so the hues stay far apart round the wheel — the point is telling two
 * shifts apart at a glance, not covering the spectrum. The deep row exists
 * because the bright row disappears against a light ground when a whole day is
 * filled rather than outlined.
 */
export const MARK_COLOURS: { label: string; value: string }[] = [
  { label: 'Coral', value: '#FF5C7A' },
  { label: 'Amber', value: '#FFA53D' },
  { label: 'Lemon', value: '#F5C518' },
  { label: 'Lime', value: '#5CD65C' },
  { label: 'Emerald', value: '#22C55E' },
  { label: 'Teal', value: '#14B8A6' },
  { label: 'Sky', value: '#38BDF8' },
  { label: 'Indigo', value: '#6366F1' },
  { label: 'Violet', value: '#A855F7' },
  { label: 'Magenta', value: '#EC4899' },
  { label: 'Slate', value: '#64748B' },
  { label: 'Graphite', value: '#334155' },

  { label: 'Rosewood', value: '#B91C4A' },
  { label: 'Rust', value: '#C2620E' },
  { label: 'Ochre', value: '#A16207' },
  { label: 'Moss', value: '#3F7A24' },
  { label: 'Pine', value: '#15803D' },
  { label: 'Deep teal', value: '#0F766E' },
  { label: 'Deep sky', value: '#0369A1' },
  { label: 'Deep indigo', value: '#4338CA' },
  { label: 'Deep violet', value: '#6D28D9' },
  { label: 'Plum', value: '#A21CAF' },
  { label: 'Clay', value: '#8D6E63' },
  { label: 'Ink', value: '#1E293B' },
];

/** Turns a stored day back into the payload the save endpoint expects. */
export function toSavePayload(day: CalendarDayData | undefined): DaySave {
  return {
    shifts: (day?.shifts ?? []).map((entry) => ({
      shift_id: entry.shift_id,
      worked: entry.worked,
      needs_cover: entry.needs_cover,
      // The recorded clock survives every unrelated edit of the day.
      actual_start: entry.actual_start,
      actual_end: entry.actual_end,
      break_minutes: entry.break_minutes,
      revenue: entry.revenue,
    })),
    sales: (day?.sales ?? []).map((entry) => ({
      sales_id: entry.sales_id,
      quantity: entry.quantity,
    })),
    tips: day?.tips ?? null,
    tips_cash: day?.tips_cash ?? null,
    tip_pool: day?.tip_pool ?? null,
    deductions: day?.deductions ?? null,
    deduction_reason: day?.deduction_reason ?? null,
    note: day?.note ?? null,
    colour: day?.colour ?? null,
  };
}

/**
 * "350 / hour + 3%", or just the half that exists. A stacked deal is the
 * ordinary case in hospitality, so the label has to be able to say both.
 */
export function rateLabel(template: ShiftTemplate): string {
  const amount = template.salary_amount;
  const base = amount === null ? `per ${template.salary_period}` : `${amount} / ${template.salary_period}`;

  return template.revenue_percent === null
    ? base
    : amount === null
      ? `${template.revenue_percent}%`
      : `${base} + ${template.revenue_percent}%`;
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

/**
 * What to call a place in a sentence. Shifts with no place land in a
 * synthetic bucket the server names in English; that name is a placeholder,
 * not a title, and no localised screen should read it out loud.
 */
export const placeName = (total: { location_id: number; name: string }, unplaced: string): string =>
  total.location_id === 0 ? unplaced : total.name;
