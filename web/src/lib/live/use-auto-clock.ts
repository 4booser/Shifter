'use client';

import { useEffect, useRef } from 'react';

import { todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { clockStep, overdueSince } from '@/lib/live/auto-clock';
import {
  dropLiveShift,
  finishLiveShift,
  moveLiveShift,
  startLiveShift,
  syncLive,
  useLive,
} from '@/lib/live/live-shift';
import { loadClockDays, useCalendar } from '@/lib/store/calendar';
import { pushToast } from '@/lib/toast';

const TICK = 30_000;

/** Long enough for the server's minute-long pass to have closed what came due. */
const SERVER_CLOSE = 90_000;

/** The longest gap between asks while a shift past its close still reads as planned. */
const ASK_AT_MOST_EVERY = 15 * 60_000;

/** Opens and closes the live clock on its own, on whatever page the person happens to be, in whatever month the calendar happens to show. */
export function useAutoClock(active: boolean): void {
  const { t } = useI18n();
  const say = useRef(t);

  say.current = t;

  useEffect(() => {
    if (!active) return;

    let running = false;
    let readFor: string | null = null;
    let askedAt = 0;

    const tick = async (fresh = false) => {
      if (running) return;

      running = true;

      try {
        const today = todayKey();

        // A tab left alone has been wrong about the day for as long as it was
        // left, and a clock must not open on a shift the phone already closed.
        if ((fresh || readFor !== today) && (await loadClockDays())) readFor = today;

        const { days, templates } = useCalendar.getState();

        if (templates.length === 0) return;

        const input = { now: Date.now(), today, days, templates, live: useLive.getState().live };
        const step = clockStep(input);

        if (step?.kind === 'open') {
          startLiveShift(step.template, { date: step.date, startedAt: step.startedAt });
        } else if (step?.kind === 'follow') {
          moveLiveShift(step.startedAt);
        } else if (step?.kind === 'drop') {
          dropLiveShift();
        } else if (step?.kind === 'close') {
          const outcome = await finishLiveShift(step.template, { endAt: step.endAt, byItself: true });

          if (outcome === 'written') {
            pushToast({
              icon: '⏰',
              title: say.current('Shift closed on schedule'),
              text: `${step.template.name}: ${say.current('check the times on the day.')}`,
            });
          }
        }

        const overdue = overdueSince(input);

        // Backing off, for a server that will not close this: a zone it reads
        // differently, or a pass that is not running.
        if (
          overdue !== null &&
          input.now - overdue >= SERVER_CLOSE &&
          input.now - askedAt >= Math.min(ASK_AT_MOST_EVERY, (input.now - overdue) / 2)
        ) {
          askedAt = input.now;
          await loadClockDays();
        }
      } finally {
        running = false;
      }
    };

    const wake = () => {
      if (document.visibilityState === 'visible') void tick(true);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'shifter.liveShift') syncLive();
    };

    void tick(true);

    const timer = setInterval(() => void tick(), TICK);

    addEventListener('focus', wake);
    addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', wake);

    // Not left to the next tick: a time typed into Фактически should move the
    // running clock as soon as the save lands.
    const unsubscribe = useCalendar.subscribe((state, before) => {
      if (state.days !== before.days || state.templates !== before.templates) void tick();
    });

    return () => {
      clearInterval(timer);
      removeEventListener('focus', wake);
      removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', wake);
      unsubscribe();
    };
  }, [active]);
}
