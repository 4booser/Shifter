import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Target } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calendarApi } from '@/lib/api/calendar';
import { Goal, GoalPeriod } from '@/lib/calendar/models';
import { todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const PERIODS: { value: GoalPeriod; label: string }[] = [
  { value: 'week', label: 'per week' },
  { value: 'month', label: 'per month' },
  { value: 'year', label: 'per year' },
];

/**
 * The month against what somebody said they wanted from it.
 *
 * The bar is the answer, but the sentence under it is the useful part: not
 * «68%», which nobody can act on, but how much is left and how many days
 * there are to earn it in — and, once the month is far enough along to mean
 * anything, whether the current pace gets there.
 */
export function GoalCard() {
  const { t, n } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));
  const client = useQueryClient();

  const goals = useQuery({ queryKey: ['goals'], queryFn: () => calendarApi.goals() });
  const [editing, setEditing] = useState(false);

  /*
   * Whichever goal exists — the form offers a week and a year as well as a
   * month, and a card that only read months would make those choices do
   * nothing.
   *
   * The newest wins where there are several. Saving upserts by period, so
   * changing «в неделю» back to «в месяц» leaves both on the account, and the
   * server hands them back in period order: reading the first would have kept
   * showing the abandoned weekly goal and made the edit look like a no-op.
   */
  const goal =
    [...(goals.data ?? [])].sort((one, two) => two.id - one.id)[0] ?? null;

  /* The stretch a goal governs comes from the server — a week runs Monday to
     Sunday there, and re-deriving that here is how the two quietly disagree. */
  const window = useQuery({
    queryKey: ['days', goal?.current_from, goal?.current_to],
    queryFn: () => calendarApi.days(goal!.current_from, goal!.current_to),
    enabled: goal !== null,
  });

  if (goals.isPending) return null;

  if (goal === null || editing) {
    return (
      <GoalForm
        goal={goal}
        onClose={() => setEditing(false)}
        onSaved={() => {
          void client.invalidateQueries({ queryKey: ['goals'] });
          setEditing(false);
        }}
      />
    );
  }

  const earned = window.data?.total_earned ?? 0;
  const share = Math.min(1, goal.amount > 0 ? earned / goal.amount : 0);
  const left = Math.max(0, goal.amount - earned);
  const done = left === 0;

  const today = todayKey();
  const daysLeft =
    goal.current_to < today
      ? 0
      : Math.round(
          (new Date(`${goal.current_to}T12:00:00`).getTime() -
            new Date(`${today}T12:00:00`).getTime()) /
            86_400_000,
        ) + 1;
  const perDay = daysLeft > 0 ? left / daysLeft : 0;

  return (
    <section className="card flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="field-hint flex items-center gap-1.5">
          <Target className="size-3.5" />
          {t('Goal')} {t(PERIOD_LABELS[goal.period])}
        </span>
        <button
          type="button"
          aria-label={t('Change the goal')}
          onClick={() => setEditing(true)}
          className="text-muted-foreground transition-colors hover:text-ink"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      <p className="text-2xl font-bold tabular">
        {money(earned)}
        <span className="text-base font-semibold text-muted-foreground">
          {' '}
          {t('of')} {money(goal.amount)}
        </span>
      </p>

      <span className="h-2 overflow-hidden rounded-full bg-surface-2">
        <span
          className="block h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${Math.max(1, share * 100)}%`,
            background: done ? 'var(--good)' : 'var(--accent)',
          }}
        />
      </span>

      <p className={cn('field-hint', done && 'text-good')}>
        {done
          ? t('The goal is met — everything further is on top.')
          : daysLeft > 0
            ? t('{left} left over {days} — {perDay} a day.', {
                left: money(left),
                days: n(daysLeft, 'days'),
                perDay: money(perDay),
              })
            : t('Short by {money}.', { money: money(left) })}
      </p>
    </section>
  );
}

const PERIOD_LABELS: Record<GoalPeriod, string> = {
  day: 'per day',
  week: 'per week',
  month: 'per month',
  year: 'per year',
};

function GoalForm({
  goal,
  onClose,
  onSaved,
}: {
  goal: Goal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const [amount, setAmount] = useState(goal === null ? '' : `${goal.amount}`);
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? 'month');

  const save = useMutation({
    mutationFn: async () => {
      const saved = await calendarApi.saveGoal({
        period,
        amount: Number(amount.replace(',', '.')),
        // Null: a standing goal, the same every month. A goal for one
        // particular March is a different feature and nobody asked for it.
        anchor: null,
        note: null,
      });

      // Changing the period of a goal is editing it, not adding a second one.
      // The server upserts by period, so the old one has to go explicitly or
      // the account quietly collects a goal per period ever chosen.
      if (goal !== null && goal.period !== period) {
        await calendarApi.deleteGoal(goal.id).catch(() => undefined);
      }

      return saved;
    },
    onSuccess: () => {
      toast.success(t('Goal set'));
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const valid = Number(amount.replace(',', '.')) > 0;

  return (
    <section className="card flex flex-col gap-2.5 p-4">
      <span className="field-hint flex items-center gap-1.5">
        <Target className="size-3.5" />
        {goal === null ? t('Set a goal') : t('Change the goal')}
      </span>

      {goal === null && (
        <p className="field-hint">{t('How much you want to earn. The app works out what that is per day.')}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map((one) => (
          <button
            key={one.value}
            type="button"
            onClick={() => setPeriod(one.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
              period === one.value
                ? 'border-transparent bg-accent text-accent-foreground'
                : 'border-border text-muted-foreground hover:text-ink',
            )}
          >
            {one.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          inputMode="decimal"
          value={amount}
          placeholder={settings.currency}
          autoFocus={goal !== null}
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && valid) save.mutate();
          }}
        />
        <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
          {t('Keep')}
        </Button>
        {goal !== null && (
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
        )}
      </div>
    </section>
  );
}
