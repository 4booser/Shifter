import { useEffect } from 'react';

import { todayKey } from '@/lib/calendar';
import { eyeShut } from '@/lib/eye';
import { bankLock, lockStore } from '@/lib/lock';
import { CalendarDayData } from '@/lib/types';
import { WidgetMoney, WidgetMonth, WidgetToday, buildSnapshot, nextShift } from '@/lib/widget';
import { publishSnapshot } from '@/lib/widget-publish';

/** Keeps the widget fed from whatever the screens already know. */

let lastToday: WidgetToday | null = null;
let lastMonth: WidgetMonth | null = null;
let lastMoney: WidgetMoney | null = null;

/** Publishes whatever is currently known, under both locks. */
async function publish(): Promise<void> {
  // Nothing worth drawing yet. Publishing a half-empty snapshot would replace
  // a good one from the last session with a worse one.
  if (lastToday === null || lastMonth === null) return;

  const [locked, bankLocked] = await Promise.all([lockStore.enabled(), bankLock.enabled()]);
  // The eye pulls the same lever the app lock does: the widget stands on
  // the most public glass the phone has.
  const shuttered = locked || eyeShut();

  publishSnapshot(
    buildSnapshot({
      now: new Date(),
      hidden: shuttered,
      // One sign for the whole widget.
      currency: '₴',
      bankHidden: bankLocked,
      today: lastToday,
      month: lastMonth,
      money: lastMoney,
    }),
  );
}

/** The calendar's half: today's shift and the month it sits in. */
export function useWidget(input: {
  /** Today's row, where the loaded month contains it. */
  today: CalendarDayData | undefined;
  /** The month's days, for finding what comes after today. */
  days: CalendarDayData[];
  monthLabel: string;
  monthEarned: number;
  monthGoal: number | null;
  monthDays: number;
}): void {
  const { today, days, monthLabel, monthEarned, monthGoal, monthDays } = input;

  // Only worth working out where today has nothing on it: a person mid-shift
  // is not asking what is next.
  const next = (today?.shifts.length ?? 0) > 0 ? null : nextShift(days, todayKey());

  const shift = today?.shifts.find((entry) => entry.worked) ?? today?.shifts[0] ?? null;

  // One string rather than eight dependencies: publishing is cheap, and a dependency list of eight eventually…
  const signature = JSON.stringify([
    today?.date,
    today?.earned,
    next?.inDays,
    next?.name,
    shift?.name,
    shift?.start_time,
    shift?.end_time,
    shift?.worked,
    monthLabel,
    monthEarned,
    monthGoal,
    monthDays,
  ]);

  useEffect(() => {
    lastToday = {
      shift: shift?.name ?? null,
      start: shift?.start_time.slice(0, 5) ?? null,
      end: shift?.end_time.slice(0, 5) ?? null,
      worked: shift?.worked ?? false,
      // Only a day that has happened has earned anything.
      earned: shift?.worked === true ? (today?.earned ?? null) : null,
      next,
    };

    lastMonth = { label: monthLabel, earned: monthEarned, goal: monthGoal, days: monthDays };

    void publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}

/** The bank's half. Null where no bank is connected — not a balance of nothing. */
export function useWidgetMoney(money: WidgetMoney | null): void {
  const signature = JSON.stringify(money);

  useEffect(() => {
    lastMoney = money;

    void publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}

/** Today's row out of a loaded month, or nothing where the month is elsewhere. */
export const todayIn = (days: CalendarDayData[]): CalendarDayData | undefined =>
  days.find((day) => day.date === todayKey());
