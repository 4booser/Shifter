import { useEffect } from 'react';

import { todayKey } from '@/lib/calendar';
import { bankLock, lockStore } from '@/lib/lock';
import { CalendarDayData } from '@/lib/types';
import { WidgetMoney, WidgetMonth, WidgetToday, buildSnapshot, nextShift } from '@/lib/widget';
import { publishSnapshot } from '@/lib/widget-publish';

/**
 * Keeps the widget fed from whatever the screens already know.
 *
 * The widget cannot ask anything — no server, no token, no network — so the
 * app leaves it everything in advance. That happens where the figures are
 * already computed, which is also the only place they are guaranteed to agree
 * with what the person is looking at. Nothing here fetches: a hook that went
 * to the network to feed a widget would cost somebody data every time they
 * opened the calendar, to redraw something they may not have installed.
 *
 * Two screens own different halves of one document. The calendar knows the
 * day and the month; only the bank tab knows what is in anybody's account. So
 * the halves are held here between visits — otherwise opening the calendar
 * would wipe the balance, and opening the bank would wipe the shift, and the
 * widget would say something different depending which screen was last open.
 */

let lastToday: WidgetToday | null = null;
let lastMonth: WidgetMonth | null = null;
let lastMoney: WidgetMoney | null = null;

/**
 * Publishes whatever is currently known, under both locks.
 *
 * The locks are read fresh every time rather than remembered: somebody who has
 * just switched one on expects the next thing the app does to respect it.
 */
async function publish(): Promise<void> {
  // Nothing worth drawing yet. Publishing a half-empty snapshot would replace
  // a good one from the last session with a worse one.
  if (lastToday === null || lastMonth === null) return;

  const [locked, bankLocked] = await Promise.all([lockStore.enabled(), bankLock.enabled()]);

  publishSnapshot(
    buildSnapshot({
      now: new Date(),
      hidden: locked,
      // One sign for the whole widget. A person paid in two currencies has a
      // bigger question than a home screen can answer, and the app's own
      // headline figures already pick one.
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

  // One string rather than eight dependencies: publishing is cheap, and a
  // dependency list of eight eventually goes stale in one of them and leaves
  // the widget a day behind for a reason nobody ever finds.
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
      // Only a day that has happened has earned anything. A planned shift's
      // figure is what it would pay, and a number on a home screen before the
      // shift is a promise this trade breaks often enough without our help.
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
