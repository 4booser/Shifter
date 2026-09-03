'use client';

import { useEffect, useRef, useState } from 'react';

import { useEscape } from '@/lib/a11y';
import { useI18n } from '@/lib/i18n';
import {
  cancelLiveShift,
  finishLiveShift,
  formatElapsed,
  liveTick,
  breakLeft,
  pauseLiveShift,
  resumeLiveShift,
  startTimedBreak,
  useLive,
} from '@/lib/live/live-shift';
import { useArmed } from '@/lib/live/arm';
import { pushToast } from '@/lib/toast';
import { useCalendar } from '@/lib/store/calendar';
import { Money } from '@/components/ui/bits';

/**
 * The header's live-shift pill: proof the clock is running from any page.
 * Ticks once a second — the money creeping up while you pour drinks is the
 * whole point.
 */
export function LiveBar() {
  const { t } = useI18n();
  const live = useLive((state) => state.live);
  const templates = useCalendar((state) => state.templates);
  const [open, setOpen] = useState(false);
  useEscape(open, () => setOpen(false));
  const [, force] = useState(0);
  const discard = useArmed(() => {
    cancelLiveShift();
    setOpen(false);
  });

  useEffect(() => {
    if (live === null) return;

    const handle = setInterval(() => force((n) => n + 1), 1000);

    return () => clearInterval(handle);
  }, [live]);

  const left = breakLeft(live, Date.now());
  const breakNudged = useRef(false);

  /**
   * One nudge when a timed break runs out.
   *
   * The point of a timed break is the end of it, and the person taking one is
   * in a staff room with their phone face down. A toast is what the app has;
   * it does not ask for notification permission for this.
   */
  useEffect(() => {
    if (left === null || left > 0) {
      if (left === null) breakNudged.current = false;

      return;
    }

    if (breakNudged.current) return;

    breakNudged.current = true;
    pushToast({ icon: '☕', title: t('Break is over'), text: t('The clock is running again.') });
  }, [left, t]);

  const overdueNudged = useRef(false);

  // Half an hour past the planned end deserves one nudge; sixteen hours on
  // the clock is a forgotten shift, not a worked one — close it at that.
  useEffect(() => {
    if (live === null) {
      overdueNudged.current = false;

      return;
    }

    const template = templates.find((item) => item.id === live.shiftId);

    if (template === undefined) return;

    const check = setInterval(() => {
      const onClock = Date.now() - live.startedAt;

      if (onClock > 16 * 3600_000) {
        void finishLiveShift(template);

        return;
      }

      if (overdueNudged.current) return;

      const [hours, minutes] = template.end_time.split(':').map(Number);
      const plannedEnd = new Date(live.startedAt);

      plannedEnd.setHours(hours, minutes, 0, 0);

      // An end before the start is tomorrow's side of midnight.
      if (plannedEnd.getTime() <= live.startedAt) plannedEnd.setDate(plannedEnd.getDate() + 1);

      if (Date.now() > plannedEnd.getTime() + 30 * 60_000) {
        overdueNudged.current = true;
        pushToast({ icon: '⏰', title: t('Shift over?'), text: t('The planned end passed a while ago — finish or keep going.') });
      }
    }, 60_000);

    return () => clearInterval(check);
  }, [live, templates, t]);

  if (live === null) return null;

  const template = templates.find((item) => item.id === live.shiftId);

  if (template === undefined) return null;

  const tick = liveTick(template, live, Date.now());
  const share = Math.min(1, tick.progress);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;

  const finish = () => {
    setOpen(false);
    void finishLiveShift(template);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className={`chip tabular ${live.pausedAt !== null ? 'chip-warn' : 'chip-good'}`}
        onClick={() => setOpen((state) => !state)}
      >
        {live.pausedAt !== null ? '⏸' : <span className="live-dot" />}
        {tick.earned === null ? formatElapsed(tick.elapsed) : <Money value={tick.earned} />}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              discard.disarm();
              setOpen(false);
            }}
          />
          <div className="card absolute right-0 z-50 mt-1.5 w-64 p-4 shadow-(--shadow-lg) rise">
            <div className="flex items-center gap-3">
              <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90 flex-none">
                <circle className="ring-track" cx="40" cy="40" r={radius} fill="none" strokeWidth="7" />
                <circle
                  className="ring-fill"
                  cx="40"
                  cy="40"
                  r={radius}
                  fill="none"
                  strokeWidth="7"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - share)}
                />
              </svg>
              <div className="min-w-0">
                <strong className="block truncate text-[0.95rem]" title={template.name}>{template.name}</strong>
                <span className="field-hint block tabular">{formatElapsed(tick.elapsed)}</span>
                {/*
                  Said for what it is. The counter is the rate multiplied by
                  the clock — it knows nothing of the night premium, the
                  overtime the week is heading for, the tips not yet counted
                  or a percentage of the till, all of which the recorded day
                  will carry. Teaching it those rules would be a second copy
                  of arithmetic the server owns, which is the fault this
                  project has spent a week removing; naming the figure costs
                  nothing and claims nothing.
                */}
                {tick.earned !== null && (
                  <span className="block text-[1.15rem] font-bold text-good-read tabular">
                    <Money value={tick.earned} />{' '}
                    <span className="text-[0.72rem] font-normal text-muted">{t('at the rate')}</span>
                  </span>
                )}
              </div>
            </div>
            {live.breakMs + (live.pausedAt === null ? 0 : Date.now() - live.pausedAt) > 0 && (
              <p className="field-hint mt-1.5">
                {t('Breaks')}: {formatElapsed(live.breakMs + (live.pausedAt === null ? 0 : Date.now() - live.pausedAt))}
              </p>
            )}
            {/*
              A break of a stated length, counted down. A break nobody started
              on time is a break nobody takes, and one nobody ended on time is
              one somebody gets shouted at for — and a room with a rush on has
              nobody watching a clock.
            */}
            {left !== null && (
              <p
                className={`mt-1.5 text-[0.92rem] font-semibold tabular ${
                  left <= 0 ? 'text-warn-read' : ''
                }`}
              >
                {left <= 0
                  ? t('Break is over')
                  : `${t('Back in')} ${formatElapsed(left)}`}
              </p>
            )}

            {live.pausedAt === null && (
              <div className="mt-2.5">
                {/* Three equal buttons on one row: wrapped inline they left
                    the third stranded on a line of its own. */}
                <span className="field-hint block">{t('Break for')}</span>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {[15, 30, 45].map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className="btn btn-sm !px-0"
                      onClick={() => startTimedBreak(minutes)}
                    >
                      {minutes} {t('min')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/*
              Three controls abreast never fitted the panel: the word on the
              primary button was clipped by its own border. Finishing the shift
              is what this panel is for, so it gets the width, and throwing the
              shift away drops to a row of its own where a thumb aiming for
              «finish» cannot land on it.
            */}
            <div className="mt-3 flex gap-1.5">
              <button
                type="button"
                className={`btn btn-sm flex-none ${live.pausedAt !== null ? 'btn-warn' : ''}`}
                title={t(live.pausedAt !== null ? 'Resume' : 'Break')}
                onClick={() => (live.pausedAt !== null ? resumeLiveShift() : pauseLiveShift())}
              >
                {live.pausedAt !== null ? '▶' : '⏸'}
              </button>
              <button type="button" className="btn btn-primary btn-sm min-w-0 flex-1" onClick={finish}>
                {t('Finish shift')}
              </button>
            </div>
            <button
              type="button"
              className={`btn btn-sm mt-1.5 w-full ${discard.armed ? 'btn-armed' : 'btn-quiet'}`}
              onClick={discard.press}
            >
              {discard.armed ? t('Press again to discard') : t('Discard shift')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
