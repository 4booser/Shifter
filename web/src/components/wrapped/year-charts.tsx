'use client';

import { DaysResponse, DeductionSplit, ExpenseSplit, ZoneTotal } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { Money } from '@/components/ui/bits';
import { RankBars } from '@/components/charts/glass-charts';

/**
 * The year's other chapters, each one a question the page could not answer
 * before: what the money was made of, where the tips actually happened, what
 * the rate did, what the work cost and what was taken off it.
 *
 * Every card disappears when its fact is missing. A year with no fines should
 * not carry an empty «fines» card explaining that nothing happened.
 */

/** What the year's money was made of, as one bar with its parts named. */
export function MadeOf({ summary }: { summary: DaysResponse }) {
  const { t, lang } = useI18n();
  const { format } = useMoney();

  /*
   * The parts have to add up to the year.
   *
   * They did not. Two of the things the server folds into a year's earnings
   * were missing — the overtime premium and the wage paid by period, both of
   * them money — and so were the deductions and the tip-out, which are money
   * going the other way. A card headed «из чего сложился год» summed to
   * ₴362 886 beside a headline of ₴359 396, and then quoted percentages of
   * its own wrong total. The gap was exactly the deductions less the
   * overtime, which is to say: two mistakes that nearly hid each other.
   *
   * Grouped the way the report's own bar groups the same money, and into the
   * five series slots the palette actually has. A premium is a premium
   * whether the clock or the calendar earned it; a wage is a wage whether it
   * arrived per shift or per month, and the row says which it was.
   */
  const wage = summary.shifts_earned - summary.revenue_earned;
  const premiums = summary.premium_earned + summary.overtime_earned;

  const wageName =
    wage > 0 && summary.period_earned > 0
      ? `${t('Shifts')} ${t('and')} ${t('Wage by period').toLocaleLowerCase(lang)}`
      : summary.period_earned > 0
        ? t('Wage by period')
        : t('Shifts');

  const parts = [
    { name: wageName, value: wage + summary.period_earned, hue: 'var(--s1)' },
    { name: t('Tips'), value: summary.tips_earned, hue: 'var(--s3)' },
    { name: t('A share of the takings'), value: summary.revenue_earned, hue: 'var(--s4)' },
    { name: t('Premiums'), value: premiums, hue: 'var(--s2)' },
    { name: t('Sales'), value: summary.sales_earned, hue: 'var(--s5)' },
  ].filter((part) => part.value > 0);

  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const taken = summary.deductions + summary.tip_out;

  if (parts.length < 2 || total <= 0) return null;

  return (
    <section className="card reveal p-4">
      <h2 className="mb-2 text-[0.98rem] font-bold">{t('What the year was made of')}</h2>

      <div className="flex h-5 gap-[2px] overflow-hidden rounded-full">
        {parts.map((part) => (
          <span
            key={part.name}
            className="grow-w"
            style={{ width: `${(part.value / total) * 100}%`, background: part.hue }}
            title={`${part.name} — ${format(part.value)}`}
          />
        ))}
      </div>

      <ul className="mt-2.5 flex flex-col gap-1">
        {parts.map((part) => (
          <li key={part.name} className="flex items-baseline justify-between gap-2 text-[0.86rem]">
            <span className="flex min-w-0 items-center gap-1.5">
              <i className="size-2 flex-none rounded-full" style={{ background: part.hue }} />
              <span className="truncate">{part.name}</span>
            </span>
            <span className="flex-none tabular">
              <Money value={part.value} />{' '}
              <span className="text-faint">{Math.round((part.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>

      {taken > 0 && (
        <dl className="mt-2.5 flex flex-col gap-1 border-t border-border pt-2.5 text-[0.86rem]">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted">{t('Withheld')}</dt>
            <dd className="tabular text-danger-read">−<Money value={taken} /></dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 font-bold">
            <dt>{t('Earned')}</dt>
            <dd className="tabular"><Money value={summary.total_earned} /></dd>
          </div>
        </dl>
      )}
    </section>
  );
}

/** Which corner of the room tipped, per hour standing in it. */
export function ZoneTips({ zones }: { zones: ZoneTotal[] }) {
  const { t } = useI18n();
  const { format } = useMoney();

  const named: Record<string, string> = {
    hall: t('Hall'),
    bar: t('Bar'),
    terrace: t('Terrace'),
    banquet: t('Banquets'),
    takeaway: t('Takeaway'),
    unset: t('Not said'),
  };

  const rows = zones
    .filter((zone) => zone.tips_per_hour > 0 && zone.zone !== 'unset')
    .sort((one, two) => two.tips_per_hour - one.tips_per_hour);

  if (rows.length < 2) return null;

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1 text-[0.98rem] font-bold">{t('Where the tips happened')}</h2>
      <p className="field-hint mb-2">{t('Per hour spent standing there — the comparison the argument is about.')}</p>

      <RankBars
        rows={rows.map((zone) => ({
          name: named[zone.zone] ?? zone.zone,
          value: Math.round(zone.tips_per_hour),
          caption: `${Math.round(zone.hours)} ${t('h')}`,
        }))}
        format={(value) => `${format(value)}/${t('h')}`}
        labelWidth="6.5rem"
      />
    </section>
  );
}

/** Every time the rate moved, and what the move has come to since. */
export function RaiseTrail({ summary }: { summary: DaysResponse }) {
  const { t, lang } = useI18n();

  if (summary.raises.length === 0) return null;

  return (
    <section className="card reveal p-4">
      <h2 className="mb-2 text-[0.98rem] font-bold">{t('What your rate did')}</h2>

      <ul className="flex flex-col gap-2">
        {summary.raises.slice(0, 6).map((raise) => {
          const up = raise.after >= raise.before;
          const percent =
            raise.before > 0 ? Math.round((raise.after / raise.before - 1) * 100) : null;

          return (
            <li key={`${raise.shift_id}-${raise.on}`} className="flex flex-wrap items-baseline gap-x-2 text-[0.88rem]">
              <span className="tabular text-faint">
                {new Date(`${raise.on}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short' })}
              </span>
              <span className="font-medium">{raise.shift_name}</span>
              <span className="tabular">
                <Money value={raise.before} /> → <Money value={raise.after} />
              </span>
              {percent !== null && percent !== 0 && (
                <span className={`tabular font-semibold ${up ? 'text-good-read' : 'text-danger-read'}`}>
                  {up ? '+' : '−'}
                  {Math.abs(percent)}%
                </span>
              )}
              {raise.worth_since > 0 && (
                <span className="field-hint">
                  {t('worth')} <Money value={raise.worth_since} /> {t('since')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What the work cost to get to, and what was taken off it on the way. */
export function CostOfWork({
  expenses,
  total,
  travelShare,
  withheld,
  fines,
}: {
  expenses: ExpenseSplit[];
  total: number;
  travelShare: number | null;
  withheld: number;
  fines: DeductionSplit[];
}) {
  const { t } = useI18n();
  const { format } = useMoney();

  const kinds: Record<string, string> = {
    travel: t('Getting there'),
    uniform: t('Uniform'),
    food: t('Food at work'),
    tools: t('Tools'),
    training: t('Training'),
    other: t('Other'),
  };
  const reasons: Record<string, string> = {
    shortfall: t('Till came up short'),
    breakage: t('Breakage'),
    late: t('Turned up late'),
    waste: t('Waste'),
    uniform: t('Uniform'),
    meal: t('Meals'),
    other: t('Something else'),
    unsaid: t('No reason recorded'),
  };

  const spent = expenses.filter((row) => row.amount > 0);
  const taken = fines.filter((row) => row.amount > 0);

  /*
   * The bars have to add up to the figure above them.
   *
   * «Удержано · 16 770 ₴» sat over a list of fines summing to ₴3 250,
   * because the server splits by reason only what somebody wrote a reason
   * for. The rest of a withholding is the staff meal, charged by the place's
   * own rule with nothing to explain — and it was the larger part of the
   * two. A reader saw a total four times its own breakdown and concluded the
   * chart was broken.
   *
   * The meal is a row now, worked out as what the reasons do not cover.
   */
  const explained = taken.reduce((sum, row) => sum + row.amount, 0);
  const meals = Math.round((withheld - explained) * 100) / 100;
  const rows =
    meals > 0
      ? [...taken, { reason: 'meal', amount: meals, days: 0 }]
      : taken;

  if (spent.length === 0 && taken.length === 0) return null;

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1 text-[0.98rem] font-bold">{t('What the work cost')}</h2>
      <p className="field-hint mb-3">
        {t('Never subtracted from anything above: take-home is what arrived, and these happened around it.')}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {spent.length > 0 && (
          <div>
            <span className="field-label">{t('Spent to work')} · {format(total)}</span>
            <RankBars
              rows={spent.map((row) => ({
                name: kinds[row.kind] ?? row.kind,
                value: row.amount,
                caption: `×${row.count}`,
              }))}
              format={(value) => format(value)}
              labelWidth="7rem"
            />
            {travelShare !== null && (
              <p className="field-hint mt-1">
                {t('The travelling ate')} {travelShare}% {t('of the tips')}
              </p>
            )}
          </div>
        )}

        {taken.length > 0 && (
          <div>
            <span className="field-label">{t('Withheld')} · {format(withheld)}</span>
            <RankBars
              rows={rows.map((row) => ({
                // A reason the map does not know still has to have a name:
                // the fallback printed the raw key, and a blank key printed
                // a bar with no label at all.
                name: reasons[row.reason] ?? (row.reason.trim() === '' ? reasons.unsaid : row.reason),
                value: row.amount,
                caption: row.days > 0 ? `${row.days} ${t('d.')}` : '',
              }))}
              format={(value) => format(value)}
              // Семи ремов не хватало на «Причина не записана»: подпись
              // обрезалась до «Причина не за…», и строка про удержание
              // переставала говорить, за что удержали.
              labelWidth="10rem"
            />
          </div>
        )}
      </div>
    </section>
  );
}

/** The room, counted: people served, what they left, what a bill came to. */
export function RoomCounted({ summary }: { summary: DaysResponse }) {
  const { t } = useI18n();

  if (summary.guests_counted <= 0) return null;

  const perGuest =
    summary.guests_counted > 0 ? summary.tips_earned / summary.guests_counted : 0;

  return (
    <section className="card reveal p-4">
      <h2 className="mb-2 text-[0.98rem] font-bold">{t('The room, counted')}</h2>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <span className="block text-[1.35rem] font-bold tabular">
            {summary.guests_counted.toLocaleString()}
          </span>
          <span className="field-hint">{t('guests served')}</span>
        </div>
        <div>
          <span className="block text-[1.35rem] font-bold tabular text-good-read">
            <Money value={Math.round(perGuest * 100) / 100} />
          </span>
          <span className="field-hint">{t('a guest in tips')}</span>
        </div>
        <div>
          <span className="block text-[1.35rem] font-bold tabular">
            {summary.average_cheque === null ? '·' : <Money value={Math.round(summary.average_cheque)} />}
          </span>
          <span className="field-hint">{t('average cheque')}</span>
        </div>
      </div>
    </section>
  );
}

/** Money that is owed rather than paid: tax set aside, holiday accrued. */
export function OwedLater({ summary }: { summary: DaysResponse }) {
  const { t } = useI18n();

  if (summary.tax <= 0 && summary.holiday_accrued <= 0) return null;

  return (
    <section className="card reveal p-4">
      <h2 className="mb-2 text-[0.98rem] font-bold">{t('Counted, but not in your hand')}</h2>

      <dl className="grid gap-2 sm:grid-cols-2">
        {summary.tax > 0 && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="field-hint">{t('Tax across the year')}</dt>
            <dd className="tabular font-semibold">
              <Money value={summary.tax} />
            </dd>
          </div>
        )}
        {summary.net_earned > 0 && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="field-hint">{t('Take-home after it')}</dt>
            <dd className="tabular font-semibold text-good-read">
              <Money value={summary.net_earned} />
            </dd>
          </div>
        )}
        {summary.holiday_accrued > 0 && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="field-hint">{t('Holiday accrued')}</dt>
            <dd className="tabular font-semibold">
              <Money value={summary.holiday_accrued} />
            </dd>
          </div>
        )}
        {summary.tip_out > 0 && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="field-hint">{t('Handed to support staff')}</dt>
            <dd className="tabular font-semibold">
              <Money value={summary.tip_out} />
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
