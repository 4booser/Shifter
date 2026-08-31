import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { ColourField } from '@/components/colour-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calendarApi } from '@/lib/api/calendar';
import { CalendarDayData, DaySave, ShiftTemplate } from '@/lib/calendar/models';
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

  const payload = useMemo(
    (): DaySave => ({
      shifts: (day?.shifts ?? []).map((entry) => ({
        shift_id: entry.shift_id,
        worked: entry.worked,
        needs_cover: entry.needs_cover,
        actual_start: entry.actual_start,
        actual_end: entry.actual_end,
        break_minutes: entry.break_minutes,
        revenue: entry.revenue,
        guests: entry.guests,
        zone: entry.zone,
      })),
      sales: (day?.sales ?? []).map((row) => ({ sales_id: row.sales_id, quantity: row.quantity })),
      tips: day?.tips ?? null,
      tips_cash: day?.tips_cash ?? null,
      tip_pool: day?.tip_pool ?? null,
      deductions: day?.deductions ?? null,
      deduction_reason: day?.deduction_reason ?? null,
      note: day?.note ?? null,
      colour: day?.colour ?? null,
      version: day?.version,
    }),
    [day],
  );

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
            <li key={entry.shift_id} className="flex items-start gap-2">
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
                <span className="field-hint tabular">
                  {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)} · {entry.hours} ч
                  {entry.worked ? '' : ' · план'}
                </span>
              </span>

              {entry.earned > 0 && (
                <span className="text-sm font-semibold tabular">{money(entry.earned)}</span>
              )}

              <button
                type="button"
                aria-label="Убрать смену"
                className="mt-0.5 text-muted-foreground transition-colors hover:text-danger"
                onClick={() => dropShift(entry.shift_id)}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Adding is one tap per template: the palette people actually keep is
          three or four, and a picker for three items is a picker too many. */}
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
  busy,
  onSave,
}: {
  label: string;
  initial: string;
  placeholder: string;
  numeric?: boolean;
  maxLength?: number;
  busy: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const changed = value.trim() !== initial.trim();

  return (
    <label className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      <span className="flex gap-2">
        <Input
          inputMode={numeric ? 'decimal' : undefined}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && changed) onSave(value.trim());
          }}
        />
        <Button variant="outline" disabled={busy || !changed} onClick={() => onSave(value.trim())}>
          Сохранить
        </Button>
      </span>
    </label>
  );
}
