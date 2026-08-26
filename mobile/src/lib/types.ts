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
  archived: boolean;
}

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
}

export interface CalendarDayData {
  date: string;
  shifts: DayShiftEntry[];
  tips: number | null;
  tips_cash: number | null;
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
  }[];
  sales: { sales_id: number; quantity: number }[];
  tips: number | null;
  tips_cash: number | null;
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
  })),
  sales: [],
  tips: day?.tips ?? null,
  tips_cash: day?.tips_cash ?? null,
  deductions: day?.deductions ?? null,
  note: day?.note ?? null,
  colour: day?.colour ?? null,
});

export const money = (value: number) => `₴${Math.round(value).toLocaleString('ru')}`;
