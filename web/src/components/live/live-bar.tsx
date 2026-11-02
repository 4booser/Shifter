'use client';

import { useEffect, useRef, useState } from 'react';

import { useEscape } from '@/lib/a11y';
import { useI18n } from '@/lib/i18n';
import {
  finishLiveShift,
  formatElapsed,
  liveEntry,
  liveTick,
  breakLeft,
  pauseLiveShift,
  resumeLiveShift,
  startTimedBreak,
  useLive,
} from '@/lib/live/live-shift';
import { useDiscard } from '@/lib/live/arm';
import { FORGOTTEN_AFTER, clockOf, liveWindow, planCloses, planEndsClock } from '@/lib/live/auto-clock';
import { pushToast } from '@/lib/toast';
import { useCalendar } from '@/lib/store/calendar';
import { Money } from '@/components/ui/bits';

/** How long past its planned end a shift nobody closes is left before anything is said. */
const OVERDUE_AFTER = 30 * 60_000;

/** The header's live-shift pill: proof the clock is running from any page. */
export function LiveBar() {
  const { t } = useI18n();
  const live = useLive((state) => state.live);
  const templates = useCalendar((state) => state.templates);
  const [open, setOpen] = useState(false);
  useEscape(open, () => setOpen(false));
  const [, force] = useState(0);
  const discard = useDiscard(() => setOpen(false));

  useEffect(() => {
    if (live === null) return;

    const handle = setInterval(() => force((n) => n + 1), 1000);

    return () => clearInterval(handle);
  }, [live]);

  const left = breakLeft(live, Date.now());
  const breakNudged = useRef(false);

  /** One nudge when a timed break runs out. */
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
  const say = useRef(t);

  say.current = t;

  // Half an hour past the planned end deserves one nudge; sixteen hours on
  // the clock is a forgotten shift, not a worked one — close it at that. A
  // clock the plan is going to stop needs neither, and a shift planned longer
  // than sixteen hours is not forgotten until that half hour has gone too. `t`
  // stays out of the list: it is a new function every render, this bar renders
  // every second, and the minute would start over before it ever ran out.
  useEffect(() => {
    if (live === null) {
      overdueNudged.current = false;

      return;
    }

    const template = templates.find((item) => item.id === live.shiftId);

    if (template === undefined) return;

    const nudge = () => {
      if (overdueNudged.current) return;

      overdueNudged.current = true;
      pushToast({
        icon: '⏰',
        title: say.current('Shift over?'),
        text: say.current('The planned end passed a while ago — finish or keep going.'),
      });
    };

    const check = setInterval(() => {
      const entry = liveEntry(live);

      if (planEndsClock(template, live, entry)) return;

      const closes = planCloses(template, live, entry);
      const planned = closes > live.startedAt;
      const overdue = planned && Date.now() > closes + OVERDUE_AFTER;

      if (Date.now() - live.startedAt > FORGOTTEN_AFTER && (overdue || !planned)) {
        // Nobody pressed this, so it goes the way any close goes: on a fresh
        // read of the day, and with no overlay for a shift nobody was watching.
        // A clock the day would not let close keeps running, so somebody is told.
        void finishLiveShift(template, { byItself: true, atLimit: true }).then((outcome) => {
          if (outcome === 'wait') nudge();
          if (outcome !== 'written') return;

          pushToast({
            icon: '⏰',
            title: say.current('Shift closed after sixteen hours'),
            text: `${template.name}: ${say.current('check the times on the day.')}`,
          });
        });

        return;
      }

      if (overdue) nudge();
    }, 60_000);

    return () => clearInterval(check);
  }, [live, templates]);

  if (live === null) return null;

  const template = templates.find((item) => item.id === live.shiftId);

  if (template === undefined) return null;

  const entry = liveEntry(live);
  const closesAt = planEndsClock(template, live, entry) ? clockOf(liveWindow(template, live, entry).closes) : null;
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
        title={closesAt === null ? undefined : `${t('Closes by itself at')} ${closesAt}`}
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
                {/* Said for what it is. */}
                {tick.earned !== null && (
                  <span className="block text-[1.15rem] font-bold text-good-read tabular">
                    <Money value={tick.earned} />{' '}
                    <span className="text-[0.72rem] font-normal text-muted">{t('at the rate')}</span>
                  </span>
                )}
              </div>
            </div>
            {closesAt !== null && (
              <p className="field-hint mt-1.5 tabular">
                {t('Closes by itself at')} {closesAt}
              </p>
            )}
            {live.breakMs + (live.pausedAt === null ? 0 : Date.now() - live.pausedAt) > 0 && (
              <p className="field-hint mt-1.5">
                {t('Breaks')}: {formatElapsed(live.breakMs + (live.pausedAt === null ? 0 : Date.now() - live.pausedAt))}
              </p>
            )}
            {/* A break of a stated length, counted down. */}
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

            {/* Three controls abreast never fitted the panel: the word on the primary button was clipped by its own border. */}
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
