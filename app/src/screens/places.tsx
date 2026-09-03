import { ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Building2, MapPin, Pencil, Plus } from 'lucide-react';
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
import { PayPeriodKind, WorkLocation, WorkLocationCreate } from '@/lib/calendar/models';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const PERIOD_LABELS: Record<PayPeriodKind, string> = {
  monthly: 'once a month',
  semimonthly: 'twice a month',
  biweekly: 'every two weeks',
  weekly: 'every week',
};

/** Countries whose public holidays the server already knows. */
const HOLIDAY_COUNTRIES: { value: string; label: string }[] = [
  { value: '', label: 'do not count' },
  { value: 'UA', label: 'Ukraine' },
  { value: 'PL', label: 'Poland' },
  { value: 'DE', label: 'Germany' },
  { value: 'CZ', label: 'Czechia' },
  { value: 'GB', label: 'Britain' },
  { value: 'US', label: 'The United States' },
];

const BLANK: WorkLocationCreate = {
  name: '',
  address: null,
  colour: '#6366F1',
  pay_period: 'monthly',
  pay_day: 10,
  pay_anchor: null,
  overtime_weekly_hours: 40,
  overtime_multiplier: 1,
  night_multiplier: 1,
  night_from: '22:00',
  night_to: '06:00',
  public_holiday_multiplier: 1,
  holiday_country: '',
  tip_out_of_tips_percent: 0,
  tip_out_of_sales_percent: 0,
  meal_deduction: 0,
  tax_percent: 0,
  tax_tips: false,
  holiday_percent: 0,
  currency: null,
  sales_pay_period: '',
  sales_pay_day: 1,
  sales_pay_anchor: null,
  auto_break_after_hours: 0,
  auto_break_minutes: 0,
  minimum_hourly: 0,
  commute_minutes: 0,
  commute_cost: 0,
  city: '',
};

/**
 * Places of work.
 *
 * Everything the app knows that a shift template does not — when the money
 * lands, what the night is worth, what the house keeps — is a property of the
 * place, and until now none of it could be said on this front.
 */
export function Places() {
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const client = useQueryClient();

  const places = useQuery({ queryKey: ['locations'], queryFn: () => calendarApi.locations() });
  const [editing, setEditing] = useState<WorkLocation | 'new' | null>(null);

  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      calendarApi.archiveLocation(id, archived),
    onSuccess: (_, { archived }) => {
      void client.invalidateQueries({ queryKey: ['locations'] });
      toast.success(archived ? t('The place is archived') : t('The place is back'));
    },
    onError: () => toast.error(t('That did not work — try again.')),
  });

  const live = (places.data ?? []).filter((place) => !place.archived);
  const shelved = (places.data ?? []).filter((place) => place.archived);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('Places of work')}</h1>
          <p className="field-hint">{t('When the money arrives, what a night is worth, and what the place withholds.')}</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          {t('A new place')}
        </Button>
      </header>

      {places.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1].map((slot) => (
            <div key={slot} className="card h-32 animate-pulse" />
          ))}
        </div>
      ) : live.length === 0 && shelved.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Building2 className="size-7 text-muted-foreground" />
          <div>
            <p className="font-semibold">{t('No places yet')}</p>
            <p className="field-hint mt-1">
              {t('Shifts work without a place. A place matters when')} <b>{t('when')}</b>{' '}
              {t('the money arrives and what gets deducted matter.')}
            </p>
          </div>
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            {t('Add a place')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              money={(value) => formatMoney(settings, value)}
              onEdit={() => setEditing(place)}
              onArchive={() => archive.mutate({ id: place.id, archived: true })}
            />
          ))}
        </div>
      )}

      {shelved.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="field-label">{t('Archived')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shelved.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                dimmed
                money={(value) => formatMoney(settings, value)}
                onEdit={() => setEditing(place)}
                onArchive={() => archive.mutate({ id: place.id, archived: false })}
              />
            ))}
          </div>
        </section>
      )}

      {editing !== null && (
        <PlaceDialog
          place={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void client.invalidateQueries({ queryKey: ['locations'] });
            void client.invalidateQueries({ queryKey: ['days'] });
            // The pay cycle lives here and the payout dates are read from it.
            void client.invalidateQueries({ queryKey: ['schedule'] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PlaceCard({
  place,
  dimmed = false,
  money,
  onEdit,
  onArchive,
}: {
  place: WorkLocation;
  dimmed?: boolean;
  money: (value: number) => string;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const { t, num } = useI18n();
  // Only the rules that are actually switched on: a card listing every
  // multiplier at ×1 says nothing except that nobody filled the form in.
  const rules = [
    place.night_multiplier > 1 && t('night ×{times}', { times: num(place.night_multiplier) }),
    place.public_holiday_multiplier > 1 && t('holiday ×{times}', { times: num(place.public_holiday_multiplier) }),
    place.overtime_multiplier > 1 &&
      t('over {hours} ×{times}', {
        hours: `${num(place.overtime_weekly_hours)} ${t('h')}`,
        times: num(place.overtime_multiplier),
      }),
    place.tax_percent > 0 && t('tax {percent}%', { percent: num(place.tax_percent) }),
    place.meal_deduction > 0 && t('meals {money}', { money: money(place.meal_deduction) }),
    place.tip_out_of_tips_percent > 0 && t('{percent}% of tips into the pot', { percent: num(place.tip_out_of_tips_percent) }),
    place.holiday_percent > 0 && t('holiday pay {percent}%', { percent: num(place.holiday_percent) }),
    place.minimum_hourly > 0 && t('no less than {rate}', { rate: `${money(place.minimum_hourly)}/${t('h')}` }),
  ].filter((rule): rule is string => typeof rule === 'string');

  return (
    <article className={cn('card flex flex-col gap-2 p-4', dimmed && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <span
          className="mt-1 h-9 w-1.5 flex-none rounded-full"
          style={{ background: place.colour }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{place.name}</p>
          <p className="field-hint">
            {t(PERIOD_LABELS[place.pay_period])}
            {place.pay_period === 'monthly' || place.pay_period === 'semimonthly'
              ? t(', on the {day}th', { day: place.pay_day })
              : ''}
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
            aria-label={place.archived ? t('Bring back from the archive') : t('To the archive')}
            onClick={onArchive}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {place.archived ? (
              <ArchiveRestore className="size-3.5" />
            ) : (
              <Archive className="size-3.5" />
            )}
          </button>
        </span>
      </div>

      {(place.city !== undefined && place.city !== '') || place.address != null ? (
        <p className="field-hint flex items-center gap-1">
          <MapPin className="size-3" />
          {[place.city, place.address].filter((part) => part != null && part !== '').join(', ')}
        </p>
      ) : null}

      {rules.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {rules.map((rule) => (
            <li
              key={rule}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground"
            >
              {rule}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function PlaceDialog({
  place,
  onClose,
  onSaved,
}: {
  place: WorkLocation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<WorkLocationCreate>(
    place === null
      ? BLANK
      : {
          ...BLANK,
          ...place,
          pay_anchor: place.pay_anchor === '' ? null : place.pay_anchor,
          sales_pay_anchor: place.sales_pay_anchor === '' ? null : place.sales_pay_anchor,
          currency: place.currency === '' ? null : place.currency,
          night_from: place.night_from.slice(0, 5),
          night_to: place.night_to.slice(0, 5),
        },
  );

  const set = <Key extends keyof WorkLocationCreate>(key: Key, value: WorkLocationCreate[Key]) =>
    setForm((was) => ({ ...was, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      place === null
        ? calendarApi.createLocation(form)
        : calendarApi.updateLocation(place.id, form),
    onSuccess: () => {
      toast.success(place === null ? t('Place added') : t('Place changed'));
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const byDate = form.pay_period === 'monthly' || form.pay_period === 'semimonthly';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{place === null ? t('A new place') : form.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <Group title={t('What place is it')}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Text
                label={t('Title')}
                value={form.name}
                placeholder={t('The coffee house on the square')}
                onPick={(value) => set('name', value)}
              />
              <Text
                label={t('City')}
                value={form.city ?? ''}
                placeholder={t('Dnipro')}
                onPick={(value) => set('city', value)}
              />
            </div>
            <Text
              label={t('Address')}
              value={form.address ?? ''}
              placeholder="—"
              onPick={(value) => set('address', value === '' ? null : value)}
            />
            <ColourField
              label={t('Colour')}
              value={form.colour}
              onPick={(colour) => set('colour', colour ?? '#6366F1')}
              clearHint={t('back to the plain one')}
            />
          </Group>

          <Group title={t('When they pay')} hint={t('The next payday is taken from here.')}>
            <Pills
              label={t('Cycle')}
              options={(Object.keys(PERIOD_LABELS) as PayPeriodKind[]).map((value) => ({
                value,
                label: t(PERIOD_LABELS[value]),
              }))}
              value={form.pay_period}
              onPick={(value) => set('pay_period', value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {byDate ? (
                <Num
                  label={t('On which day')}
                  value={form.pay_day}
                  onPick={(value) => set('pay_day', value)}
                />
              ) : (
                <label className="flex flex-col gap-1">
                  <span className="field-label">{t('Any day they paid')}</span>
                  <Input
                    type="date"
                    value={form.pay_anchor ?? ''}
                    onChange={(event) =>
                      set('pay_anchor', event.target.value === '' ? null : event.target.value)
                    }
                  />
                  <span className="field-hint">{t('The weeks are counted from it.')}</span>
                </label>
              )}
              <Text
                label={t('Currency, three letters')}
                value={form.currency ?? ''}
                placeholder={t('as in the app')}
                onPick={(value) => set('currency', value === '' ? null : value.toUpperCase())}
              />
            </div>
          </Group>

          <Group title={t('Premiums')} hint={t('×1 means there is no premium.')}>
            <div className="grid gap-2 sm:grid-cols-3">
              <Num
                label={t('Night ×')}
                value={form.night_multiplier}
                onPick={(value) => set('night_multiplier', value)}
              />
              <Time
                label={t('Night from')}
                value={form.night_from}
                onPick={(value) => set('night_from', value)}
              />
              <Time
                label={t('until')}
                value={form.night_to}
                onPick={(value) => set('night_to', value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Num
                label={t('Holiday ×')}
                value={form.public_holiday_multiplier}
                onPick={(value) => set('public_holiday_multiplier', value)}
              />
              <Pills
                label={t('Whose country’s holidays')}
                options={HOLIDAY_COUNTRIES.map((one) => ({ ...one, label: t(one.label) }))}
                value={form.holiday_country}
                onPick={(value) => set('holiday_country', value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Num
                label={t('Overtime after, h a week')}
                value={form.overtime_weekly_hours}
                min={1}
                max={168}
                onPick={(value) => set('overtime_weekly_hours', value)}
              />
              <Num
                label={t('Overtime ×')}
                value={form.overtime_multiplier}
                min={1}
                onPick={(value) => set('overtime_multiplier', value)}
              />
            </div>
            <Num
              label={t('Rate no lower than, per hour')}
              value={form.minimum_hourly ?? 0}
              onPick={(value) => set('minimum_hourly', value)}
            />
          </Group>

          <Group title={t('What is withheld')}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Num
                label={t('To the pool, % of tips')}
                value={form.tip_out_of_tips_percent}
                onPick={(value) => set('tip_out_of_tips_percent', value)}
              />
              <Num
                label={t('To the pool, % of takings')}
                value={form.tip_out_of_sales_percent}
                onPick={(value) => set('tip_out_of_sales_percent', value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Num
                label={t('Meal per shift')}
                value={form.meal_deduction}
                onPick={(value) => set('meal_deduction', value)}
              />
              <Num
                label={t('Tax, %')}
                value={form.tax_percent}
                onPick={(value) => set('tax_percent', value)}
              />
            </div>
            <Switch
              label={t('Tax on tips as well')}
              on={form.tax_tips}
              onPick={(value) => set('tax_tips', value)}
            />
            <Num
              label={t('Holiday pay accrues, %')}
              value={form.holiday_percent}
              onPick={(value) => set('holiday_percent', value)}
            />
          </Group>

          <Group title={t('Break and travel')} hint={t('The break applies itself when the shift is longer.')}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Num
                label={t('Break after, h')}
                value={form.auto_break_after_hours ?? 0}
                onPick={(value) => set('auto_break_after_hours', value)}
              />
              <Num
                label={t('Break, min')}
                value={form.auto_break_minutes ?? 0}
                onPick={(value) => set('auto_break_minutes', value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Num
                label={t('Travel one way, min')}
                value={form.commute_minutes ?? 0}
                onPick={(value) => set('commute_minutes', value)}
              />
              <Num
                label={t('One trip costs')}
                value={form.commute_cost ?? 0}
                onPick={(value) => set('commute_cost', value)}
              />
            </div>
          </Group>
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

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-border pt-4 first:border-0 first:pt-0">
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {hint !== undefined && <p className="field-hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Text({
  label,
  value,
  placeholder,
  onPick,
}: {
  label: string;
  value: string;
  placeholder: string;
  onPick: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onPick(event.target.value)}
      />
    </label>
  );
}

function Num({
  label,
  value,
  min,
  max,
  onPick,
}: {
  label: string;
  value: number;
  /** Where the server has a floor, the field keeps to it rather than letting
      somebody send a number it will refuse in a language they do not read. */
  min?: number;
  max?: number;
  onPick: (value: number) => void;
}) {
  /**
   * The box holds text while it is being typed, and a number only once it is
   * a number.
   *
   * Round-tripping every keystroke through `Number` made a decimal point
   * impossible to enter: «1.» parses to 1, the field re-renders as «1», and
   * the dot is gone before the tenths can be typed — so a night rate of ×1.5
   * or a tax of 19.5% could not be written at all.
   */
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? `${value}`;

  const commit = (raw: string) => {
    const next = Number(raw.replace(',', '.'));

    if (raw.trim() === '' || Number.isNaN(next)) {
      setText(null);

      return;
    }

    const held = min !== undefined && next < min ? min : max !== undefined && next > max ? max : next;

    setText(null);
    onPick(held);
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      <Input
        inputMode="decimal"
        value={shown}
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function Time({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      <Input type="time" value={value} onChange={(event) => onPick(event.target.value)} />
    </label>
  );
}

function Pills<Value extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: Value; label: string }[];
  value: Value;
  onPick: (value: Value) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="field-label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onPick(option.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
              value === option.value
                ? 'border-transparent bg-accent text-accent-foreground'
                : 'border-border text-muted-foreground hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({
  label,
  on,
  onPick,
}: {
  label: string;
  on: boolean;
  onPick: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onPick(!on)}
      className="flex items-center justify-between gap-3 text-left"
    >
      <span className="text-sm font-medium">{label}</span>
      <span
        className={cn(
          'relative h-6 w-10 flex-none rounded-full transition-colors',
          on ? 'bg-[var(--accent)]' : 'bg-surface-2 ring-1 ring-border',
        )}
      >
        <span
          className={cn(
            'absolute top-1 size-4 rounded-full bg-surface shadow-sm transition-all',
            on ? 'left-5' : 'left-1',
          )}
        />
      </span>
    </button>
  );
}
