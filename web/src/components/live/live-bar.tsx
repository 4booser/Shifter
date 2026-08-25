'use client';

import { useEffect, useRef, useState } from 'react';

import { useI18n } from '@/lib/i18n';
import {
  cancelLiveShift,
  finishLiveShift,
  formatElapsed,
  liveTick,
  pauseLiveShift,
  resumeLiveShift,
  useLive,
} from '@/lib/live/live-shift';
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
  const [, force] = useState(0);

  useEffect(() => {
    if (live === null) return;

    const handle = setInterval(() => force((n) => n + 1), 1000);

    return () => clearInterval(handle);
  }, [live]);

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
        className={`chip tabular ${live.pausedAt !== null ? 'border-warn/40 bg-(--warn-soft) text-warn' : 'border-good/40 bg-(--good-soft) text-good'}`}
        onClick={() => setOpen((state) => !state)}
      >
        {live.pausedAt !== null ? '⏸' : <span className="live-dot" />}
        {tick.earned === null ? formatElapsed(tick.elapsed) : <Money value={tick.earned} />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
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
                <strong className="block truncate text-[0.95rem]">{template.name}</strong>
                <span className="field-hint block tabular">{formatElapsed(tick.elapsed)}</span>
                {tick.earned !== null && (
                  <span className="block text-[1.15rem] font-bold text-good tabular">
                    <Money value={tick.earned} />
                  </span>
                )}
              </div>
            </div>
            {live.breakMs + (live.pausedAt === null ? 0 : Date.now() - live.pausedAt) > 0 && (
              <p className="field-hint mt-1.5">
                {t('Breaks')}: {formatElapsed(live.breakMs + (live.pausedAt === null ? 0 : Date.now() - live.pausedAt))}
              </p>
            )}
            <div className="mt-3 flex gap-1.5">
              <button
                type="button"
                className={`btn btn-sm ${live.pausedAt !== null ? 'border-warn/50 bg-(--warn-soft) text-warn' : ''}`}
                title={t(live.pausedAt !== null ? 'Resume' : 'Break')}
                onClick={() => (live.pausedAt !== null ? resumeLiveShift() : pauseLiveShift())}
              >
                {live.pausedAt !== null ? '▶' : '⏸'}
              </button>
              <button type="button" className="btn btn-primary btn-sm flex-1" onClick={finish}>
                {t('Finish shift')}
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  cancelLiveShift();
                  setOpen(false);
                }}
              >
                {t('Cancel')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
