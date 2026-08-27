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
      ? 'за час'
      : template.salary_period === 'day'
        ? 'за смену'
        : template.salary_period === 'week'
          ? 'в неделю'
          : 'в месяц';
  const base = template.salary_amount > 0 ? `₴${template.salary_amount} ${period}` : null;
  const percent = template.revenue_percent === null ? null : `${template.revenue_percent}%`;

  return [base, percent].filter((part) => part !== null).join(' + ') || 'без ставки';
};

export interface DayShiftEntry {
  shift_id: number;
  name: string;
  symbol: string | null;
  colour: string | null;
  start_time: string;
  end_time: string;
  worked: boolean;
  needs_cover: boolean;
  actual_start: string | null;
  actual_end: string | null;
  break_minutes: number | null;
  earned: number;
  /** What the shift took, where it was recorded. Null is "not counted". */
  revenue: number | null;
  /** The agreed share of it, already inside earned. */
  revenue_percent: number | null;
}

export interface CalendarDayData {
  date: string;
  shifts: DayShiftEntry[];
  tips: number | null;
  tips_cash: number | null;
  /** What the room took before the split, where the tips are pooled. */
  tip_pool: number | null;
  deductions: number;
  note: string | null;
  colour: string | null;
  hours: number;
  earned: number;
  planned: number;
}

export interface DaysResponse {
  days: CalendarDayData[];
  total_earned: number;
  hours: number;
  days_worked: number;
}

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
  note: string | null;
  colour: string | null;
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
  sales: [],
  tips: day?.tips ?? null,
  tips_cash: day?.tips_cash ?? null,
  tip_pool: day?.tip_pool ?? null,
  deductions: day?.deductions ?? null,
  note: day?.note ?? null,
  colour: day?.colour ?? null,
});

export const money = (value: number) => `₴${Math.round(value).toLocaleString('ru')}`;
