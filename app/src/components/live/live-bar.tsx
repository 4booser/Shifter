import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coffee, Play, Square, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { calendarApi } from '@/lib/api/calendar';
import { todayKey } from '@/lib/calendar/calendar-date';
import {
  breakLeft,
  cancelLiveShift,
  finishLiveShift,
  formatElapsed,
  liveTick,
  pauseLiveShift,
  resumeLiveShift,
  startLiveShift,
  startTimedBreak,
  useLive,
} from '@/lib/live/live-shift';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/**
 * The shift being worked, pinned under the navigation.
 *
 * It ticks by wall clock rather than by counting its own ticks, so a laptop
 * that slept through half a shift wakes up telling the truth. Only what
 * honestly meters per minute is shown as money: an hourly rate does, a
 * monthly salary does not.
 */
export function LiveBar() {
  const { t } = useI18n();
  const live = useLive((state) => state.live);
  const settings = useSettings((state) => state.settings);
  const client = useQueryClient();
  const [now, setNow] = useState(() => Date.now());

  const templates = useQuery({ queryKey: ['shifts'], queryFn: () => calendarApi.shifts() });

  useEffect(() => {
    if (live === null) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [live]);

  const finish = useMutation({
    mutationFn: () => finishLiveShift(),
    onSuccess: (done) => {
      void client.invalidateQueries({ queryKey: ['days'] });

      if (done !== null) toast.success(`${t('Shift closed')} — ${formatElapsed(done.elapsed)} ${t('on the clock')}`);
    },
    onError: () => toast.error(t('The shift could not be recorded. Try again.')),
  });

  if (live === null) return null;

  const template = templates.data?.find((entry) => entry.id === live.shiftId);

  if (template === undefined) return null;

  const tick = liveTick(template, live, now);
  const left = breakLeft(live, now);
  const paused = live.pausedAt !== null;
  const over = tick.progress >= 1;

  return (
    <div className="border-b border-border bg-surface-2/70">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-5">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'size-2 rounded-full',
              paused ? 'bg-[var(--warn)]' : 'animate-pulse bg-[var(--good)]',
            )}
          />
          <span className="text-sm font-semibold">
            {template.symbol != null && `${template.symbol} `}
            {template.name}
          </span>
        </span>

        <span className="text-lg font-bold tabular tracking-tight">
          {formatElapsed(tick.elapsed)}
        </span>

        {tick.earned !== null && (
          <span className="text-sm font-semibold tabular text-good">
            {formatMoney(settings, Math.round(tick.earned))}
          </span>
        )}

        <span className="field-hint">
          {paused
            ? left === null
              ? t('paused')
              : left > 0
                ? `${t('break, left')} ${formatElapsed(left)}`
                : t('the break is over')
            : over
              ? t('the shift was due to end a while ago')
              : `${t('left to go')} ${formatElapsed(tick.planned - tick.elapsed)}`}
        </span>

        {/* The progress of the planned shift, as a rule under the bar rather
            than a separate widget: it is context, not a headline. */}
        <span className="order-last h-1 w-full overflow-hidden rounded-full bg-border">
          <span
            className="block h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(100, tick.progress * 100)}%`,
              background: over ? 'var(--warn)' : 'var(--good)',
            }}
          />
        </span>

        <span className="ml-auto flex items-center gap-1.5">
          {paused ? (
            <Button size="sm" variant="outline" onClick={resumeLiveShift}>
              <Play className="size-3.5" />
              {t('Resume')}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => startTimedBreak(15)}>
                <Coffee className="size-3.5" />
                15 мин
              </Button>
              <Button size="sm" variant="outline" onClick={pauseLiveShift}>
                Пауза
              </Button>
            </>
          )}
          <Button size="sm" disabled={finish.isPending} onClick={() => finish.mutate()}>
            <Square className="size-3.5" />
            Закончить
          </Button>
          <button
            type="button"
            aria-label={t('Discard the shift without recording anything')}
            title={t('Discard without recording')}
            onClick={cancelLiveShift}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-danger"
          >
            <X className="size-4" />
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * The button that starts one, offered only where it would be honest: a shift
 * planned for today that has not been marked worked yet.
 */
export function StartLive() {
  const live = useLive((state) => state.live);
  const today = todayKey();

  const days = useQuery({
    queryKey: ['days', today, today],
    queryFn: () => calendarApi.days(today, today),
  });
  const templates = useQuery({ queryKey: ['shifts'], queryFn: () => calendarApi.shifts() });

  if (live !== null) return null;

  const planned = (days.data?.days.find((day) => day.date === today)?.shifts ?? []).filter(
    (entry) => !entry.worked,
  );

  if (planned.length === 0) return null;

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {planned.map((entry) => {
        const template = templates.data?.find((one) => one.id === entry.shift_id);

        return (
          <Button
            key={entry.shift_id}
            size="sm"
            variant="outline"
            disabled={template === undefined}
            onClick={() => template !== undefined && startLiveShift(template)}
          >
            <Play className="size-3.5" />
            Начать: {entry.name}
          </Button>
        );
      })}
    </span>
  );
}
