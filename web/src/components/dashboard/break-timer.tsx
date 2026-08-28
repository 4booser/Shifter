'use client';

import { useEffect, useState } from 'react';

import {
  BREAK_KEY,
  BreakRun,
  clock,
  readRun,
  remaining,
  runaway,
  taken,
} from '@/lib/calendar/break-timer';
import { useI18n } from '@/lib/i18n';

/**
 * The break, counted while it is happening.
 *
 * A break nobody started on time is a break nobody takes; the shift swallows
 * it and the hours quietly stop matching the day. One button and a countdown
 * are the whole fix.
 *
 * It writes down the minutes that passed and not the minutes that were meant
 * to — an overrun shows in the open and lands in the record. It is offered only
 * on the day it is, because a countdown started on a day in the past would be
 * writing history.
 */
export function BreakTimer({
  dayKey,
  shiftId,
  planned,
  taken: already,
  onTaken,
}: {
  dayKey: string;
  shiftId: number;
  /** What this shift allows for a break; the countdown, never the record. */
  planned: number;
  /** Minutes already on this placement, so the button can say so. */
  taken: number;
  onTaken: (minutes: number) => void;
}) {
  const { t } = useI18n();

  const [run, setRun] = useState<BreakRun | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Read back out of the browser rather than out of React state: somebody on
  // a break has certainly closed the tab, and a countdown that dies with it
  // is a countdown nobody starts twice.
  useEffect(() => {
    setRun(readRun(window.localStorage.getItem(BREAK_KEY), dayKey));
  }, [dayKey]);

  useEffect(() => {
    if (run === null) return;

    const tick = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(tick);
  }, [run]);

  const mine = run !== null && run.shiftId === shiftId;

  // The whole point of the countdown is the moment it ends, which is exactly
  // the moment nobody is looking at the screen. Fired once — a notification
  // that repeats every second is a reason to switch notifications off.
  const [told, setTold] = useState(false);

  useEffect(() => {
    if (run === null || told) return;
    if (remaining(run, now) > 0) return;

    setTold(true);

    if ('Notification' in window && Notification.permission === 'granted') {
      // The wording says the break is over and stops there. It does not tell
      // anybody to go back — that is not the app's place, and the timer keeps
      // counting either way.
      new Notification(t('Break is over'), { body: t('The timer keeps counting until you say you are back.') });
    }
  }, [run, now, told, t]);

  const finish = (write: boolean) => {
    if (run === null) return;

    window.localStorage.removeItem(BREAK_KEY);
    setRun(null);

    // A break left running for three hours is a shut laptop, not a break.
    // Writing it would put a number nobody typed into somebody's paid hours.
    if (write && !runaway(run, Date.now())) onTaken(taken(run, Date.now()));
  };

  if (run !== null && !mine) return null;

  if (run === null) {
    return (
      <button
        type="button"
        className="btn btn-quiet btn-sm !px-2"
        onClick={() => {
          const started: BreakRun = {
            dayKey,
            shiftId,
            startedAt: Date.now(),
            // Thirty where the shift does not say: the length of a break in
            // every kitchen in Europe, and it only drives the countdown.
            planned: planned > 0 ? planned : 30,
          };

          window.localStorage.setItem(BREAK_KEY, JSON.stringify(started));
          setRun(started);
          setNow(Date.now());
          setTold(false);

          // Asked at the one moment it makes sense — a break is exactly the
          // time somebody is not looking at the screen.
          if ('Notification' in window && Notification.permission === 'default') {
            void Notification.requestPermission();
          }
        }}
      >
        ☕ {t('Break')}
        {already > 0 && <span className="ml-1 text-faint tabular">{already}m</span>}
      </button>
    );
  }

  const left = remaining(run, now);
  const over = left < 0;
  const gone = runaway(run, now);

  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`tabular text-[0.82rem] font-semibold ${over ? 'text-warn' : 'text-accent'}`}
        title={t('Time on break')}
      >
        ☕ {clock(left)}
      </span>

      {/* A break that has run for hours is a shut laptop. The button stops
          offering to write it rather than silently writing something else. */}
      <button type="button" className="btn btn-sm !px-2" onClick={() => finish(!gone)}>
        {gone ? t('Discard') : t('I am back')}
      </button>
    </span>
  );
}
