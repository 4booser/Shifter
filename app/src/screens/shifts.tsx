import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Clock, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { ColourField } from '@/components/colour-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { calendarApi } from '@/lib/api/calendar';
import {
  SALARY_PERIODS,
  SalaryPeriod,
  ShiftCreate,
  ShiftTemplate,
  TipSource,
} from '@/lib/calendar/models';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const PERIOD_LABELS: Record<SalaryPeriod, string> = {
  hour: 'per hour',
  day: 'per day',
  week: 'per week',
  month: 'per month',
};

const BLANK: ShiftCreate = {
  name: '',
  symbol: null,
  location_id: null,
  colour: null,
  start_time: '09:00',
  end_time: '17:00',
  salary_period: 'hour',
  salary_amount: null,
  revenue_percent: null,
  tip_source: 'personal',
  tip_pool_percent: null,
  break_minutes: 0,
};

/**
 * The shifts somebody works, as templates.
 *
 * Everything else in the app is built out of these, so this is the screen a
 * new account has to meet first — which is why the empty state is a form and
 * not an apology.
 */
export function Shifts() {
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const client = useQueryClient();

  const shifts = useQuery({ queryKey: ['shifts'], queryFn: () => calendarApi.shifts() });
  const places = useQuery({ queryKey: ['locations'], queryFn: () => calendarApi.locations() });

  const [editing, setEditing] = useState<ShiftTemplate | 'new' | null>(null);

  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      calendarApi.archiveShift(id, archived),
    onSuccess: (_, { archived }) => {
      void client.invalidateQueries({ queryKey: ['shifts'] });
      toast.success(archived ? t('The shift is archived') : t('The shift is back'));
    },
    onError: () => toast.error(t('That did not work — try again.')),
  });

  const live = (shifts.data ?? []).filter((shift) => !shift.archived);
  const shelved = (shifts.data ?? []).filter((shift) => shift.archived);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('Shifts')}</h1>
          <p className="field-hint">
            Шаблон помнит часы и ставку — в календаре смена ставится одним нажатием.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          {t('New shift')}
        </Button>
      </header>

      {shifts.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((slot) => (
            <div key={slot} className="card h-32 animate-pulse" />
          ))}
        </div>
      ) : live.length === 0 && shelved.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Clock className="size-7 text-muted-foreground" />
          <div>
            <p className="font-semibold">{t('No shifts yet')}</p>
            <p className="field-hint mt-1">
              Заведите ту, что работаете чаще всего, — остальное приложение построит вокруг неё.
            </p>
          </div>
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            Завести первую
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              money={(value) => formatMoney(settings, value)}
              onEdit={() => setEditing(shift)}
              onArchive={() => archive.mutate({ id: shift.id, archived: true })}
            />
          ))}
        </div>
      )}

      {shelved.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="field-label">{t('Archived')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shelved.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                dimmed
                money={(value) => formatMoney(settings, value)}
                onEdit={() => setEditing(shift)}
                onArchive={() => archive.mutate({ id: shift.id, archived: false })}
              />
            ))}
          </div>
        </section>
      )}

      {editing !== null && (
        <ShiftDialog
          shift={editing === 'new' ? null : editing}
          places={places.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void client.invalidateQueries({ queryKey: ['shifts'] });
            void client.invalidateQueries({ queryKey: ['days'] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ShiftCard({
  shift,
  dimmed = false,
  money,
  onEdit,
  onArchive,
}: {
  shift: ShiftTemplate;
  dimmed?: boolean;
  money: (value: number) => string;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const { t } = useI18n();
  const pay =
    shift.salary_amount == null
      ? shift.revenue_percent == null
        ? t('no rate')
        : `${shift.revenue_percent}% с выручки`
      : `${money(shift.salary_amount)} ${t(PERIOD_LABELS[shift.salary_period])}`;

  return (
    <article className={cn('card flex flex-col gap-2 p-4', dimmed && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <span
          className="mt-1 h-9 w-1.5 flex-none rounded-full"
          style={{ background: shift.effective_colour ?? 'var(--border-strong)' }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {shift.symbol != null && `${shift.symbol} `}
            {shift.name}
          </p>
          <p className="field-hint tabular">
            {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} · {shift.hours} ч
            {shift.break_minutes > 0 && ` · перерыв ${shift.break_minutes} мин`}
          </p>
        </div>
        <span className="flex flex-none gap-1">
          <button
            type="button"
            aria-label={t('Change')}
            onClick={onEdit}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={shift.archived ? t('Bring back from the archive') : t('To the archive')}
            onClick={onArchive}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {shift.archived ? (
              <ArchiveRestore className="size-3.5" />
            ) : (
              <Archive className="size-3.5" />
            )}
          </button>
        </span>
      </div>

      <p className="text-sm font-semibold tabular">{pay}</p>

      <p className="field-hint">
        {shift.location_name ?? t('no place')}
        {shift.tip_source === 'pool' &&
          ` · пул${shift.tip_pool_percent == null ? '' : ` ${shift.tip_pool_percent}%`}`}
        {shift.revenue_percent != null &&
          shift.salary_amount != null &&
          ` · +${shift.revenue_percent}% с выручки`}
      </p>
    </article>
  );
}

function ShiftDialog({
  shift,
  places,
  onClose,
  onSaved,
}: {
  shift: ShiftTemplate | null;
  places: { id: number; name: string; colour: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<ShiftCreate>(
    shift == null
      ? BLANK
      : {
          name: shift.name,
          symbol: shift.symbol,
          location_id: shift.location_id,
          colour: shift.colour,
          start_time: shift.start_time.slice(0, 5),
          end_time: shift.end_time.slice(0, 5),
          salary_period: shift.salary_period,
          salary_amount: shift.salary_amount,
          revenue_percent: shift.revenue_percent,
          tip_source: shift.tip_source,
          tip_pool_percent: shift.tip_pool_percent,
          break_minutes: shift.break_minutes,
        },
  );

  const set = <Key extends keyof ShiftCreate>(key: Key, value: ShiftCreate[Key]) =>
    setForm((was) => ({ ...was, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      shift == null ? calendarApi.createShift(form) : calendarApi.updateShift(shift.id, form),
    onSuccess: () => {
      toast.success(shift == null ? t('Shift created') : t('Shift changed'));
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{shift == null ? t('New shift') : form.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[4.5rem_1fr] gap-2">
            <label className="flex flex-col gap-1">
              <span className="field-label">{t('Badge')}</span>
              <Input
                value={form.symbol ?? ''}
                placeholder="🍸"
                maxLength={2}
                onChange={(event) => set('symbol', event.target.value || null)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="field-label">{t('Title')}</span>
              <Input
                value={form.name}
                placeholder={t('The bar, evening')}
                autoFocus
                onChange={(event) => set('name', event.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="field-label">{t('Starts')}</span>
              <Input
                type="time"
                value={form.start_time}
                onChange={(event) => set('start_time', event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="field-label">{t('Ends')}</span>
              <Input
                type="time"
                value={form.end_time}
                onChange={(event) => set('end_time', event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="field-label">{t('Break, min')}</span>
              <Input
                inputMode="numeric"
                value={`${form.break_minutes}`}
                onChange={(event) => set('break_minutes', Number(event.target.value) || 0)}
              />
            </label>
          </div>

          {/* The end before the start is a night shift, not a mistake — say so,
              because the hours it counts look wrong until you know. */}
          {form.end_time <= form.start_time && (
            <p className="field-hint">{t('The shift runs past midnight — the hours count through to morning.')}</p>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="field-label">{t('Paid')}</span>
            <div className="flex flex-wrap gap-1.5">
              {SALARY_PERIODS.map((period) => (
                <button
                  key={period.value}
                  type="button"
                  onClick={() => set('salary_period', period.value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                    form.salary_period === period.value
                      ? 'border-transparent bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground hover:text-ink',
                  )}
                >
                  {t(PERIOD_LABELS[period.value])}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="field-label">{t('Wage')}</span>
              <Input
                inputMode="decimal"
                value={form.salary_amount == null ? '' : `${form.salary_amount}`}
                placeholder="0"
                onChange={(event) =>
                  set(
                    'salary_amount',
                    event.target.value.trim() === ''
                      ? null
                      : Number(event.target.value.replace(',', '.')),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="field-label">{t('% of takings')}</span>
              <Input
                inputMode="decimal"
                value={form.revenue_percent == null ? '' : `${form.revenue_percent}`}
                placeholder="—"
                onChange={(event) =>
                  set(
                    'revenue_percent',
                    event.target.value.trim() === ''
                      ? null
                      : Number(event.target.value.replace(',', '.')),
                  )
                }
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="field-label">{t('Tips')}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['personal', t('your own')],
                  ['pool', t('from the shared pool')],
                ] as [TipSource, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('tip_source', value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                    form.tip_source === value
                      ? 'border-transparent bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
              {form.tip_source === 'pool' && (
                <Input
                  className="w-24"
                  inputMode="decimal"
                  placeholder={t('share %')}
                  value={form.tip_pool_percent == null ? '' : `${form.tip_pool_percent}`}
                  onChange={(event) =>
                    set(
                      'tip_pool_percent',
                      event.target.value.trim() === ''
                        ? null
                        : Number(event.target.value.replace(',', '.')),
                    )
                  }
                />
              )}
            </div>
          </div>

          {places.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="field-label">{t('Place')}</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => set('location_id', null)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                    form.location_id === null
                      ? 'border-transparent bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground hover:text-ink',
                  )}
                >
                  {t('no place')}
                </button>
                {places.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => set('location_id', place.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                      form.location_id === place.id
                        ? 'border-transparent bg-accent text-accent-foreground'
                        : 'border-border text-muted-foreground hover:text-ink',
                    )}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ background: place.colour }}
                    />
                    {place.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ColourField
            label={t('The shift’s colour')}
            value={form.colour}
            onPick={(colour) => set('colour', colour)}
            clearHint={form.location_id === null ? t('no colour') : t('the place’s colour')}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={form.name.trim() === '' || save.isPending}
            onClick={() => save.mutate()}
          >
            {t('Keep')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
