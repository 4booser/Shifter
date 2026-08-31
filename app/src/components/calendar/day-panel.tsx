import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { ColourField } from '@/components/colour-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calendarApi } from '@/lib/api/calendar';
import {
  CalendarDayData,
  DaySave,
  DeductionReason,
  ShiftTemplate,
  ShiftZone,
  toSavePayload,
} from '@/lib/calendar/models';
import { fromKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

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
  onSaved,
}: {
  day: CalendarDayData | null;
  date: string | null;
  onSaved: () => void;
}) {
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));
  const client = useQueryClient();
  const templates = useQuery({ queryKey: ['shifts'], queryFn: () => calendarApi.shifts() });
  const [opened, setOpened] = useState<number | null>(null);

  const payload = useMemo(() => toSavePayload(day ?? undefined), [day]);

  const save = useMutation({
    mutationFn: (patch: Partial<DaySave>) =>
      calendarApi.saveDay(date!, { ...payload, ...patch }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['days'] });
      onSaved();
    },
    onError: () => toast.error('Не сохранилось — попробуйте ещё раз.'),
  });

  if (date === null) {
    return (
      <aside className="card p-4">
        <p className="field-hint">Выберите день в календаре.</p>
      </aside>
    );
  }

  const worked = day?.shifts.filter((entry) => entry.worked) ?? [];
  const planned = day?.shifts.filter((entry) => !entry.worked) ?? [];
  const shown = [...worked, ...planned];

  const addShift = (template: ShiftTemplate) => {
    save.mutate({
      shifts: [
        ...payload.shifts,
        {
          shift_id: template.id,
          worked: date <= new Date().toISOString().slice(0, 10),
          needs_cover: false,
          actual_start: null,
          actual_end: null,
          break_minutes: null,
          revenue: null,
          guests: null,
        },
      ],
    });
  };

  const dropShift = (shiftId: number) => {
    save.mutate({ shifts: payload.shifts.filter((entry) => entry.shift_id !== shiftId) });
  };

  const toggleWorked = (shiftId: number, worked: boolean) => {
    save.mutate({
      shifts: payload.shifts.map((entry) =>
        entry.shift_id === shiftId ? { ...entry, worked } : entry,
      ),
    });
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
        <p className="field-hint">В этот день смен нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((entry) => (
            <li key={entry.shift_id} className="flex flex-wrap items-start gap-2">
              <button
                type="button"
                aria-label={entry.worked ? 'Отметить как план' : 'Отметить отработанной'}
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
                aria-label={opened === entry.shift_id ? 'Свернуть' : 'Подробнее о смене'}
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
                aria-label="Убрать смену"
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
                    save.mutate({
                      shifts: payload.shifts.map((one) =>
                        one.shift_id === entry.shift_id ? { ...one, ...patch } : one,
                      ),
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}

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
          label="Чаевые"
          initial={day?.tips == null ? '' : `${day.tips}`}
          placeholder="0"
          numeric
          busy={save.isPending}
          onSave={(value) => save.mutate({ tips: value === '' ? null : Number(value.replace(',', '.')) })}
        />

        <div className="grid grid-cols-2 gap-2">
          <Field
            key={`cash-${date}`}
            compact
          label="Из них наличными"
            initial={day?.tips_cash == null ? '' : `${day.tips_cash}`}
            placeholder="0"
            numeric
            busy={save.isPending}
            onSave={(value) =>
              save.mutate({ tips_cash: value === '' ? null : Number(value.replace(',', '.')) })
            }
          />
          <Field
            key={`fine-${date}`}
            compact
          label="Удержали"
            initial={day?.deductions == null ? '' : `${day.deductions}`}
            placeholder="0"
            numeric
            busy={save.isPending}
            onSave={(value) =>
              save.mutate({ deductions: value === '' ? null : Number(value.replace(',', '.')) })
            }
          />
        </div>

        {/* Only once there is something to explain: a reason picker over an
            empty fine is a question about nothing. */}
        {(day?.deductions ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="field-label">За что</span>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((reason) => (
                <button
                  key={reason.value}
                  type="button"
                  onClick={() => save.mutate({ deduction_reason: reason.value })}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                    day?.deduction_reason === reason.value
                      ? 'border-transparent bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground hover:text-ink',
                  )}
                >
                  {reason.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <ColourField
          label="Цвет дня"
          value={day?.colour}
          onPick={(colour) => save.mutate({ colour })}
        />

        <Field
          key={`note-${date}`}
          label="Заметка"
          initial={day?.note ?? ''}
          placeholder="—"
          maxLength={500}
          busy={save.isPending}
          onSave={(value) => save.mutate({ note: value === '' ? null : value })}
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
  { value: 'breakage', label: 'разбили' },
  { value: 'shortfall', label: 'недостача' },
  { value: 'late', label: 'опоздание' },
  { value: 'waste', label: 'списание' },
  { value: 'uniform', label: 'форма' },
  { value: 'other', label: 'другое' },
];

const ZONES: { value: ShiftZone; label: string }[] = [
  { value: 'unset', label: 'не сказано' },
  { value: 'hall', label: 'зал' },
  { value: 'bar', label: 'бар' },
  { value: 'terrace', label: 'терраса' },
  { value: 'banquet', label: 'банкет' },
  { value: 'takeaway', label: 'навынос' },
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
    actual_start?: string | null;
    actual_end?: string | null;
    break_minutes?: number | null;
    revenue?: number | null;
    guests?: number | null;
    zone?: ShiftZone;
  }) => void;
}) {
  const [start, setStart] = useState(entry.actual_start?.slice(0, 5) ?? '');
  const [end, setEnd] = useState(entry.actual_end?.slice(0, 5) ?? '');

  const clockChanged =
    start !== (entry.actual_start?.slice(0, 5) ?? '') ||
    end !== (entry.actual_end?.slice(0, 5) ?? '');

  return (
    <div className="mt-1 flex w-full flex-col gap-3 rounded-xl bg-surface-2 p-3">
      <div className="flex flex-col gap-1">
        <span className="field-label">Отработано по факту</span>
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
        <span className="field-hint">Пусто — считать по плану смены.</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field
          compact
          label="Перерыв, мин"
          initial={entry.break_minutes == null ? '' : `${entry.break_minutes}`}
          placeholder="0"
          numeric
          busy={busy}
          onSave={(value) => onSave({ break_minutes: value === '' ? null : Number(value) })}
        />
        <Field
          compact
          label="Выручка"
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
          label="Гостей"
          initial={entry.guests == null ? '' : `${entry.guests}`}
          placeholder="—"
          numeric
          busy={busy}
          onSave={(value) => onSave({ guests: value === '' ? null : Number(value) })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="field-label">Где работали</span>
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
              {zone.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
