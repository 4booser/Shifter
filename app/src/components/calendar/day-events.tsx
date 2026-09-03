import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plane, Stethoscope, Sun, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { calendarApi } from '@/lib/api/calendar';
import { CalendarEvent, EventKind } from '@/lib/calendar/models';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/**
 * What a day was, when it was not a shift.
 *
 * Leave and sickness are not the same as a day nobody worked: the forecast
 * leaves them out of both its sums, so a fortnight off does not read as a
 * fortnight of falling behind. Marking one is a single tap, because the
 * moment somebody wants to record being ill is not the moment to ask them to
 * fill in a form.
 */
const KINDS: { kind: EventKind; label: string; colour: string; icon: typeof Plane }[] = [
  { kind: 'vacation', label: 'Vacation', colour: '#38BDF8', icon: Plane },
  { kind: 'sick', label: 'Sick leave', colour: '#A855F7', icon: Stethoscope },
  { kind: 'dayoff', label: 'Day off', colour: '#64748B', icon: Sun },
];

export function DayEvents({ date, events }: { date: string; events: CalendarEvent[] }) {
  const { t } = useI18n();
  const client = useQueryClient();

  const refresh = () => void client.invalidateQueries({ queryKey: ['days'] });

  const mark = useMutation({
    mutationFn: (kind: EventKind) => {
      const chosen = KINDS.find((one) => one.kind === kind)!;

      return calendarApi.createEvent({
        name: chosen.label,
        symbol: null,
        colour: chosen.colour,
        start_date: date,
        end_date: date,
        start_time: null,
        end_time: null,
        note: null,
        kind,
      });
    },
    onSuccess: () => {
      refresh();
      toast.success(t('The day is marked'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const drop = useMutation({
    mutationFn: (id: number) => calendarApi.deleteEvent(id),
    onSuccess: refresh,
    onError: () => toast.error(t('Could not remove it.')),
  });

  const onThisDay = events.filter(
    (event) => event.start_date <= date && date <= event.end_date,
  );

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <span className="field-label">{t('A day with no shift')}</span>

      {onThisDay.length > 0 && (
        <ul className="flex flex-col gap-1">
          {onThisDay.map((event) => (
            <li key={event.id} className="flex items-center gap-2">
              <span
                className="size-2 flex-none rounded-full"
                style={{ background: event.colour }}
              />
              <span className="min-w-0 flex-1 truncate text-sm" title={event.name}>{event.name}</span>
              {event.days > 1 && <span className="field-hint">{event.days} {t('d.')}</span>}
              <button
                type="button"
                aria-label={`Убрать: ${event.name}`}
                disabled={drop.isPending}
                onClick={() => drop.mutate(event.id)}
                className="text-muted-foreground transition-colors hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {KINDS.filter((one) => !onThisDay.some((event) => event.kind === one.kind)).map((one) => (
          <button
            key={one.kind}
            type="button"
            disabled={mark.isPending}
            onClick={() => mark.mutate(one.kind)}
            className={cn(
              'flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium',
              'transition-colors hover:bg-surface-2 disabled:opacity-50',
            )}
          >
            <one.icon className="size-3" style={{ color: one.colour }} />
            {t(one.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
