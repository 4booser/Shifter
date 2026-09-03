import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { ColourField } from '@/components/colour-field';
import { DayEvents } from '@/components/calendar/day-events';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calendarApi } from '@/lib/api/calendar';
import {
  CalendarDayData,
  CalendarEvent,
  DaySave,
  DeductionReason,
  ShiftTemplate,
  ShiftZone,
  toSavePayload,
} from '@/lib/calendar/models';
import { fromKey, todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/**
 * The day, opened and editable.
 *
 * A day is always sent whole — the server replaces it rather than patching —
 * so everything the day holds is carried back on every save, including the
 * things this panel does not show. Dropping a field here would delete it
 * there, which is the one mistake a calendar must never make.
 */
export function DayPanel({
  day,
  date,
  events = [],
  onSaved,
}: {
  day: CalendarDayData | null;
  date: string | null;
  /** Everything overlapping the shown month; the panel picks its own day. */
  events?: CalendarEvent[];
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));
  const client = useQueryClient();
  const templates = useQuery({ queryKey: ['shifts'], queryFn: () => calendarApi.shifts() });
  const [opened, setOpened] = useState<number | null>(null);

  /**
   * Every edit is a function of the day as it stands on the server, read at
   * the moment of saving.
   *
   * A save replaces the whole day, so building one from a snapshot taken when
   * the panel last rendered loses whatever a previous save added: tap a shift
   * chip and type the tips a second later, and the second save — built before
   * the first had come back — sends an empty shift list and takes the shift
   * with it. Re-reading first costs one request and makes that impossible.
   */
  const save = useMutation({
    mutationFn: async (edit: (current: DaySave) => Partial<DaySave>) => {
      const fresh = await calendarApi.days(date!, date!);
      const current = toSavePayload(fresh.days.find((row) => row.date === date));

      return calendarApi.saveDay(date!, { ...current, ...edit(current) });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['days'] });
      onSaved();
    },
    // The server explains itself — cash tips over the total, a day changed on
    // another device — and «попробуйте ещё раз» would be advice to repeat
    // something that will fail the same way.
    onError: (error: Error) => toast.error(error.message),
  });

  if (date === null) {
    return (
      <aside className="card p-4">
        <p className="field-hint">{t('Pick a day in the calendar.')}</p>
      </aside>
    );
  }

  const worked = day?.shifts.filter((entry) => entry.worked) ?? [];
  const planned = day?.shifts.filter((entry) => !entry.worked) ?? [];
  const shown = [...worked, ...planned];

  const addShift = (template: ShiftTemplate) => {
    save.mutate((current) => ({
      shifts: [
        ...current.shifts,
        {
          shift_id: template.id,
          // Local, not UTC: at half past one in Kyiv the UTC date is still
          // yesterday, and a shift added to today would land as a plan.
          worked: date <= todayKey(),
          needs_cover: false,
          actual_start: null,
          actual_end: null,
          break_minutes: null,
          revenue: null,
          guests: null,
        },
      ],
    }));
  };

  const dropShift = (shiftId: number) => {
    save.mutate((current) => ({
      shifts: current.shifts.filter((entry) => entry.shift_id !== shiftId),
    }));
  };

  const toggleWorked = (shiftId: number, worked: boolean) => {
    save.mutate((current) => ({
      shifts: current.shifts.map((entry) =>
        entry.shift_id === shiftId ? { ...entry, worked } : entry,
      ),
    }));
  };

  return (
    <aside className="card flex flex-col gap-3 p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold first-letter:uppercase">
            {fromKey(date).toLocaleDateString('ru', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h2>
          {day != null && day.earned > 0 && (
            <p className="text-2xl font-bold tabular text-good">{money(day.earned)}</p>
          )}
        </div>
        {save.isPending && <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" />}
      </header>

      {shown.length === 0 ? (
        <p className="field-hint">{t('No shifts on this day.')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((entry) => (
            <li key={entry.shift_id} className="flex flex-wrap items-start gap-2">
              <button
                type="button"
                aria-label={entry.worked ? 'Отметить как план' : t('Mark as worked')}
                onClick={() => toggleWorked(entry.shift_id, !entry.worked)}
                className={cn(
                  'mt-0.5 grid size-5 flex-none place-items-center rounded-md border transition-colors',
                  entry.worked
                    ? 'border-transparent bg-[var(--good)] text-white'
                    : 'border-border text-transparent hover:border-border-strong',
                )}
              >
                <Check className="size-3.5" />
              </button>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{entry.name}</span>
                {/* The clock that was actually worked wins over the one the
                    template planned: that is the pair the day was paid on. */}
                <span className="field-hint tabular">
                  {(entry.actual_start ?? entry.start_time).slice(0, 5)}–
                  {(entry.actual_end ?? entry.end_time).slice(0, 5)} · {entry.hours} ч
                  {entry.actual_start != null && ' · по факту'}
                  {entry.worked ? '' : ' · план'}
                </span>
              </span>

              {entry.earned > 0 && (
                <span className="text-sm font-semibold tabular">{money(entry.earned)}</span>
              )}

              <button
                type="button"
                aria-label={opened === entry.shift_id ? 'Свернуть' : t('More about the shift')}
                className="mt-0.5 text-muted-foreground transition-colors hover:text-ink"
                onClick={() =>
                  setOpened((was) => (was === entry.shift_id ? null : entry.shift_id))
                }
              >
                <ChevronDown
                  className={cn(
                    'size-4 transition-transform',
                    opened === entry.shift_id && 'rotate-180',
                  )}
                />
              </button>

              <button
                type="button"
                aria-label={t('Remove the shift')}
                className="mt-0.5 text-muted-foreground transition-colors hover:text-danger"
                onClick={() => dropShift(entry.shift_id)}
              >
                <X className="size-4" />
              </button>

              {opened === entry.shift_id && (
                <ShiftDetail
                  key={`${date}-${entry.shift_id}`}
                  entry={entry}
                  busy={save.isPending}
                  onSave={(patch) =>
                    save.mutate((current) => ({
                      shifts: current.shifts.map((one) =>
                        one.shift_id === entry.shift_id ? { ...one, ...patch } : one,
                      ),
                    }))
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <DayEvents date={date} events={events} />

      {/* Nowhere to go from an empty calendar unless the panel says where the
          shifts are kept. */}
      {templates.data !== undefined &&
        templates.data.filter((template) => !template.archived).length === 0 && (
          <Link
            to="/shifts"
            className="flex items-center gap-1.5 border-t border-border pt-3 text-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
          >
            <Plus className="size-3.5" />
            Сначала заведите смену
          </Link>
        )}

      {/* Adding is one tap per template: the palette people actually keep is
          three or four, and a picker for three items is a picker too many. */}
      {templates.data !== undefined && templates.data.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
          {templates.data
            .filter((template) => !template.archived)
            .filter((template) => !shown.some((entry) => entry.shift_id === template.id))
            .slice(0, 6)
            .map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => addShift(template)}
                className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-surface-2"
              >
                <Plus className="size-3" />
                {template.name}
              </button>
            ))}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-3">
        {/* Keyed by the day: moving to another date remounts the field with
            that day's number in it, which is what an effect would otherwise be
            doing by hand. */}
        <Field
          key={`tips-${date}`}
          label={t('Tips')}
          initial={day?.tips == null ? '' : `${day.tips}`}
          placeholder="0"
          numeric
          busy={save.isPending}
          onSave={(value) => save.mutate(() => ({ tips: value === '' ? null : Number(value.replace(',', '.')) }))}
        />

        <div className="grid grid-cols-2 gap-2">
          <Field
            key={`cash-${date}`}
            compact
          label={t('Of that, cash')}
            initial={day?.tips_cash == null ? '' : `${day.tips_cash}`}
            placeholder="0"
            numeric
            busy={save.isPending}
            onSave={(value) =>
              save.mutate(() => ({ tips_cash: value === '' ? null : Number(value.replace(',', '.')) }))
            }
          />
          <Field
            key={`fine-${date}`}
            compact
          label={t('Withheld')}
            initial={day?.deductions == null ? '' : `${day.deductions}`}
            placeholder="0"
            numeric
            busy={save.isPending}
            onSave={(value) =>
              save.mutate(() => ({ deductions: value === '' ? null : Number(value.replace(',', '.')) }))
            }
          />
        </div>

        {/* Only once there is something to explain: a reason picker over an
            empty fine is a question about nothing. */}
        {(day?.deductions ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="field-label">{t('What for')}</span>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((reason) => (
                <button
                  key={reason.value}
                  type="button"
                  onClick={() => save.mutate(() => ({ deduction_reason: reason.value }))}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                    day?.deduction_reason === reason.value
                      ? 'border-transparent bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground hover:text-ink',
                  )}
                >
                  {t(reason.label)}
                </button>
              ))}
            </div>
          </div>
        )}

        <ColourField
          label={t('The day’s colour')}
          value={day?.colour}
          onPick={(colour) => save.mutate(() => ({ colour }))}
        />

        <Field
          key={`note-${date}`}
          label={t('Note')}
          initial={day?.note ?? ''}
          placeholder="—"
          maxLength={500}
          busy={save.isPending}
          onSave={(value) => save.mutate(() => ({ note: value === '' ? null : value }))}
        />
      </div>
    </aside>
  );
}

function Field({
  label,
  initial,
  placeholder,
  numeric = false,
  maxLength,
  compact = false,
  busy,
  onSave,
}: {
  label: string;
  initial: string;
  placeholder: string;
  numeric?: boolean;
  maxLength?: number;
  /**
   * Saves on leaving the box instead of on a button.
   *
   * The small numbers sit three to a row in a panel a phone's width, and a
   * button beside each one leaves no room for the number it is saving.
   * Stepping out of a field is an unambiguous "done with this one".
   */
  compact?: boolean;
  busy: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const changed = value.trim() !== initial.trim();

  const commit = () => {
    if (changed) onSave(value.trim());
  };

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="field-label">{label}</span>
      <span className="flex min-w-0 gap-2">
        <Input
          inputMode={numeric ? 'decimal' : undefined}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(event) => setValue(event.target.value)}
          onBlur={compact ? commit : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit();
              if (compact) event.currentTarget.blur();
            }
          }}
        />
        {!compact && (
          <Button variant="outline" disabled={busy || !changed} onClick={commit}>
            Сохранить
          </Button>
        )}
      </span>
    </label>
  );
}

const REASONS: { value: DeductionReason; label: string }[] = [
  { value: 'breakage', label: 'breakage' },
  { value: 'shortfall', label: 'shortfall' },
  { value: 'late', label: 'lateness' },
  { value: 'waste', label: 'write-off' },
  { value: 'uniform', label: 'uniform' },
  { value: 'other', label: 'something else' },
];

const ZONES: { value: ShiftZone; label: string }[] = [
  { value: 'unset', label: 'not said' },
  { value: 'hall', label: 'the floor' },
  { value: 'bar', label: 'the bar' },
  { value: 'terrace', label: 'the terrace' },
  { value: 'banquet', label: 'a function' },
  { value: 'takeaway', label: 'takeaway' },
];

/**
 * What a shift was actually worked with.
 *
 * Folded away by default: most days are the plan, and the four people who
 * count covers every night should not make the panel longer for everybody
 * else. Each field saves on its own, and an empty box stays null — "nobody
 * counted" and "nobody came" are different evenings.
 */
function ShiftDetail({
  entry,
  busy,
  onSave,
}: {
  entry: CalendarDayData['shifts'][number];
  busy: boolean;
  onSave: (patch: {
    needs_cover?: boolean;
    actual_start?: string | null;
    actual_end?: string | null;
    break_minutes?: number | null;
    revenue?: number | null;
    guests?: number | null;
    zone?: ShiftZone;
  }) => void;
}) {
  const { t } = useI18n();
  const [start, setStart] = useState(entry.actual_start?.slice(0, 5) ?? '');
  const [end, setEnd] = useState(entry.actual_end?.slice(0, 5) ?? '');

  const clockChanged =
    start !== (entry.actual_start?.slice(0, 5) ?? '') ||
    end !== (entry.actual_end?.slice(0, 5) ?? '');

  return (
    <div className="mt-1 flex w-full flex-col gap-3 rounded-xl bg-surface-2 p-3">
      <div className="flex flex-col gap-1">
        <span className="field-label">{t('Actually worked')}</span>
        <span className="flex items-center gap-2">
          <Input
            type="time"
            className="w-28"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
          <span className="field-hint">—</span>
          <Input
            type="time"
            className="w-28"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !clockChanged}
            onClick={() =>
              onSave(
                // Half a clock prices an interval nobody worked, so the pair
                // is cleared or set together.
                start === '' || end === ''
                  ? { actual_start: null, actual_end: null }
                  : { actual_start: start, actual_end: end },
              )
            }
          >
            Записать
          </Button>
        </span>
        <span className="field-hint">{t('Leave empty to count by the shift’s plan.')}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field
          compact
          label={t('Break, min')}
          initial={entry.break_minutes == null ? '' : `${entry.break_minutes}`}
          placeholder="0"
          numeric
          busy={busy}
          onSave={(value) => onSave({ break_minutes: value === '' ? null : Number(value) })}
        />
        <Field
          compact
          label={t('Takings')}
          initial={entry.revenue == null ? '' : `${entry.revenue}`}
          placeholder="—"
          numeric
          busy={busy}
          onSave={(value) =>
            onSave({ revenue: value === '' ? null : Number(value.replace(',', '.')) })
          }
        />
        <Field
          compact
          label={t('Guests')}
          initial={entry.guests == null ? '' : `${entry.guests}`}
          placeholder="—"
          numeric
          busy={busy}
          onSave={(value) => onSave({ guests: value === '' ? null : Number(value) })}
        />
      </div>

      {/* Asking the crew to take a shift is an edit of your own day, which is
          why it lives here and not on the rota: the rota is where everybody
          else answers. */}
      <button
        type="button"
        role="switch"
        aria-checked={entry.needs_cover}
        disabled={busy || entry.worked}
        onClick={() => onSave({ needs_cover: !entry.needs_cover })}
        className="flex items-center justify-between gap-3 text-left disabled:opacity-50"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{t('Asking for cover')}</span>
          <span className="field-hint">
            {entry.worked
              ? 'Смена уже отработана — передавать нечего.'
              : entry.needs_cover
                ? 'Команда видит это на графике.'
                : t('The shift appears on the rota as «looking for cover».')}
          </span>
        </span>
        <span
          className={cn(
            'relative h-6 w-10 flex-none rounded-full transition-colors',
            entry.needs_cover ? 'bg-[var(--warn)]' : 'bg-surface ring-1 ring-border',
          )}
        >
          <span
            className={cn(
              'absolute top-1 size-4 rounded-full bg-surface-2 shadow-sm transition-all',
              entry.needs_cover ? 'left-5' : 'left-1',
            )}
          />
        </span>
      </button>

      <div className="flex flex-col gap-1.5">
        <span className="field-label">{t('Where you worked')}</span>
        <div className="flex flex-wrap gap-1.5">
          {ZONES.map((zone) => (
            <button
              key={zone.value}
              type="button"
              onClick={() => onSave({ zone: zone.value })}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                (entry.zone ?? 'unset') === zone.value
                  ? 'border-transparent bg-accent text-accent-foreground'
                  : 'border-border text-muted-foreground hover:text-ink',
              )}
            >
              {t(zone.label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
