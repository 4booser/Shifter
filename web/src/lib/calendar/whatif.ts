import { fromKey, keyOf, todayKey } from './calendar-date';
import { CalendarDayData } from './models';

/** Midday, so a DST hour gained or lost inside the span cannot move the date. */
const noon = (key: string) => fromKey(key).getTime() + 43_200_000;

/** How far back the pace is measured. Eight weeks: recent, but not one odd week. */
const WINDOW_DAYS = 56;

export interface WhatIfBaseline {
  /** Average take of one worked day inside the window. */
  perShift: number;
  shiftsPerWeek: number;
  /** Worked days the averages stand on. */
  sample: number;
}

/**
 * Measures the person's actual pace from the last eight weeks: how often they
 * work and what one shift brings on average. Days count as worked when money
 * landed on them — a planned-but-empty day teaches nothing about pace.
 */
export function whatIfBaseline(
  days: CalendarDayData[],
  today = todayKey(),
): WhatIfBaseline | null {
  const start = keyOf(new Date(noon(today) - (WINDOW_DAYS - 1) * 86_400_000));
  const worked = days.filter(
    (day) => day.date >= start && day.date <= today && day.earned > 0,
  );

  if (worked.length === 0) return null;

  // The window is fixed even when the first worked day is late in it: someone
  // who started last week genuinely works "two shifts per eight weeks" so far,
  // and stretching their young pace over the full window would flatter nobody
  // — it under-promises, which is the safe direction for a projection.
  const total = worked.reduce((sum, day) => sum + day.earned, 0);

  return {
    perShift: total / worked.length,
    shiftsPerWeek: (worked.length / WINDOW_DAYS) * 7,
    sample: worked.length,
  };
}

export interface WhatIfResult {
  weekly: number;
  monthly: number;
  /** Null when the dial is at zero, or the target is already banked. */
  weeksToTarget: number | null;
  etaKey: string | null;
  /** Whole shifts still to work before the target. */
  extraShifts: number | null;
  reached: boolean;
}

/**
 * Turns the two dials — shifts per week and money per shift — into an income
 * and a date. Pure arithmetic on purpose: the honesty of the answer is the
 * caller's sliders, not a model.
 */
export function whatIfProject(
  perShift: number,
  shiftsPerWeek: number,
  target: number,
  already: number,
  today = todayKey(),
): WhatIfResult {
  const weekly = Math.max(0, perShift) * Math.max(0, shiftsPerWeek);
  // Average Gregorian month, so 12 × monthly meets the year-end figure.
  const monthly = weekly * (365.25 / 7 / 12);

  const gap = target - already;

  if (gap <= 0 && target > 0) {
    return { weekly, monthly, weeksToTarget: 0, etaKey: today, extraShifts: 0, reached: true };
  }

  if (weekly <= 0 || target <= 0) {
    return { weekly, monthly, weeksToTarget: null, etaKey: null, extraShifts: null, reached: false };
  }

  const weeks = gap / weekly;
  const eta = keyOf(new Date(noon(today) + Math.ceil(weeks * 7) * 86_400_000));

  return {
    weekly,
    monthly,
    weeksToTarget: weeks,
    etaKey: eta,
    extraShifts: Math.ceil(gap / Math.max(1, perShift)),
    reached: false,
  };
}
