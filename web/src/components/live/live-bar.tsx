'use client';

import { useEffect, useState } from 'react';

import { useI18n } from '@/lib/i18n';
import {
  cancelLiveShift,
  finishLiveShift,
  formatElapsed,
  liveTick,
  useLive,
} from '@/lib/live/live-shift';
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

  if (live === null) return null;

  const template = templates.find((item) => item.id === live.shiftId);

  if (template === undefined) return null;

  const tick = liveTick(template, live.startedAt, Date.now());
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
        className="chip border-good/40 bg-(--good-soft) text-good tabular"
        onClick={() => setOpen((state) => !state)}
      >
        <span className="live-dot" />
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
            <div className="mt-3 flex gap-1.5">
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
