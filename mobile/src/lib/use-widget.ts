import { useEffect } from 'react';

import { todayKey } from '@/lib/calendar';
import { bankLock, lockStore } from '@/lib/lock';
import { CalendarDayData } from '@/lib/types';
import { buildSnapshot } from '@/lib/widget';
import { publishSnapshot } from '@/lib/widget-publish';

/**
 * Keeps the widget fed from whatever the screen already knows.
 *
 * The widget cannot ask anything — no server, no token, no network — so the
 * app has to leave it everything in advance. This runs where the figures are
 * already computed, which is also the only place they are guaranteed to agree
 * with what the person is looking at.
 *
 * It does not fetch. A hook that went to the network to feed a widget would
 * cost somebody data every time they opened the calendar, to redraw something
 * they may not have installed.
 */
export function useWidget(input: {
  /** Today's row, where the loaded month contains it. */
  today: CalendarDayData | undefined;
  monthLabel: string;
  monthEarned: number;
  monthGoal: number | null;
  monthDays: number;
  /** Null where no bank is connected — which is not a balance of nothing. */
  money: { balance: number | null; untilPayday: number | null; perDay: number | null } | null;
}): void {
  const { today, monthLabel, monthEarned, monthGoal, monthDays, money } = input;

  // The whole snapshot as one dependency: publishing is cheap, and a
  // dependency list of eight things is a list that eventually goes stale in
  // one of them and leaves the widget a day behind for a reason nobody finds.
  const signature = JSON.stringify([
    today?.date,
    today?.earned,
    today?.shifts.map((entry) => [entry.name, entry.start_time, entry.end_time, entry.worked]),
    monthLabel,
    monthEarned,
    monthGoal,
    monthDays,
    money,
  ]);

  useEffect(() => {
    let cancelled = false;

    // Both locks are read fresh rather than remembered: somebody who has just
    // switched the lock on expects the next thing the app does to respect it.
    void Promise.all([lockStore.enabled(), bankLock.enabled()]).then(([locked, bankLocked]) => {
      if (cancelled) return;

      const shift = today?.shifts.find((entry) => entry.worked)
        ?? today?.shifts[0]
        ?? null;

      publishSnapshot(
        buildSnapshot({
          now: new Date(),
          hidden: locked,
          bankHidden: bankLocked,
          today: {
            shift: shift?.name ?? null,
            start: shift?.start_time.slice(0, 5) ?? null,
            end: shift?.end_time.slice(0, 5) ?? null,
            worked: shift?.worked ?? false,
            // Only a day that has happened has earned anything. A planned
            // shift's figure is what it would pay, and a number on a home
            // screen before the shift is a promise this trade breaks often
            // enough without our help.
            earned: shift?.worked === true ? (today?.earned ?? null) : null,
          },
          month: {
            label: monthLabel,
            earned: monthEarned,
            goal: monthGoal,
            days: monthDays,
          },
          money,
        }),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [signature, today, monthLabel, monthEarned, monthGoal, monthDays, money]);
}

/** Today's row out of a loaded month, or nothing where the month is elsewhere. */
export const todayIn = (days: CalendarDayData[]): CalendarDayData | undefined =>
  days.find((day) => day.date === todayKey());
