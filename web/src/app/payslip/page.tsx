'use client';

import { useCallback, useEffect, useState } from 'react';

import { accountApi } from '@/lib/api/auth';
import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import { monthBounds, todayKey } from '@/lib/calendar/calendar-date';
import { DaysResponse, Reconciliation } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { Alert, Money } from '@/components/ui/bits';
import { Shell } from '@/components/layout/shell';

/**
 * One page somebody can hand to a person who does not have the app.
 *
 * Showing a manager a phone screen works. Sending it to an accountant, a
 * landlord or a bank does not, and that is where every argument about a wage
 * eventually goes. So: a period, the hours, the rate, what was added, what was
 * taken off, and the total — printed from the browser, with no library and no
 * server round trip to make a file nobody can check.
 *
 * It signs itself. This is what the app counted from what somebody recorded;
 * it is not a payroll document and saying so plainly is what makes it usable
 * as evidence rather than as a claim.
 */
export default function PayslipPage() {
  return (
    <Shell>
      <Payslip />
    </Shell>
  );
}

function Payslip() {
  const { t } = useI18n();

  const [from, setFrom] = useState(monthBounds(todayKey()).from);
  const [to, setTo] = useState(monthBounds(todayKey()).to);
  const [range, setRange] = useState<DaysResponse | null>(null);
  const [who, setWho] = useState<string>('');
  const [periods, setPeriods] = useState<Reconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);

    void calendarApi
      .days(from, to)
      .then(setRange)
      .catch((caught) => setError(apiErrorMessage(caught)));
  }, [from, to]);

  useEffect(load, [load]);

  useEffect(() => {
    void accountApi
      .get()
      .then((profile) => setWho(`${profile.first_name} ${profile.last_name ?? ''}`.trim()))
      .catch(() => setWho(''));

    // The pay periods the places themselves define, over the last half year:
    // "the last one" should mean what the employer means by it rather than a
    // calendar month somebody guessed at.
    const back = new Date();

    back.setMonth(back.getMonth() - 6);

    void calendarApi
      .schedule(back.toISOString().slice(0, 10), todayKey())
      .then(setPeriods)
      .catch(() => setPeriods(null));
  }, []);

  const known = (periods?.periods ?? [])
    .slice(0, 8)
    .map((row) => ({ from: row.period_from, to: row.period_to, name: row.location_name }));

  return (
    <div className="print-report mx-auto flex max-w-3xl flex-col gap-4">
      <div className="no-print flex flex-wrap items-end gap-3">
        <label>
          <span className="field-label">{t('From')}</span>
          <input
            type="date"
            className="field-input"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          <span className="field-label">{t('To')}</span>
          <input
            type="date"
            className="field-input"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>

        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          {t('Print')}
        </button>
      </div>

      {known.length > 0 && (
        <div className="no-print flex flex-wrap gap-1.5">
          {known.map((period) => (
            <button
              key={`${period.name}-${period.from}`}
              type="button"
              className={`btn btn-sm ${from === period.from && to === period.to ? 'btn-primary' : ''}`}
              onClick={() => {
                setFrom(period.from);
                setTo(period.to);
              }}
            >
              {period.name} · {period.from.slice(5)}–{period.to.slice(5)}
            </button>
          ))}
        </div>
      )}

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {range !== null && (
        <article className="card p-6">
          <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
            <div>
              <h1 className="text-[1.2rem] font-extrabold tracking-tight">{t('Payslip')}</h1>
              {who !== '' && <p className="field-hint">{who}</p>}
            </div>
            <p className="field-hint tabular">
              {from} — {to}
            </p>
          </header>

          <Section title={t('Hours')}>
            <Row label={t('Worked')} value={`${range.hours} ${t('h')}`} />
            <Row label={t('Days worked')} value={`${range.days_worked}`} />
            {range.overtime_hours > 0 && (
              <Row label={t('Of which overtime')} value={`${range.overtime_hours} ${t('h')}`} />
            )}
            {range.night_hours > 0 && (
              <Row label={t('Of which night')} value={`${range.night_hours} ${t('h')}`} />
            )}
          </Section>

          <Section title={t('Earned')}>
            <Row label={t('Shifts')} money={range.shifts_earned} />
            {range.period_earned > 0 && (
              <Row label={t('Wage by period')} money={range.period_earned} />
            )}
            {range.sales_earned > 0 && <Row label={t('Sales')} money={range.sales_earned} />}
            {range.revenue_earned > 0 && (
              <Row
                label={`${t('Share of takings')} · ${t('from')} ${range.revenue_counted}`}
                money={range.revenue_earned}
              />
            )}
            {range.tips_earned > 0 && <Row label={t('Tips')} money={range.tips_earned} />}
            {range.overtime_earned > 0 && (
              <Row label={t('Overtime')} money={range.overtime_earned} />
            )}
            {range.premium_earned > 0 && (
              <Row label={t('Night and holiday premiums')} money={range.premium_earned} />
            )}
          </Section>

          {(range.tip_out > 0 || range.deductions > 0 || range.tax > 0) && (
            <Section title={t('Taken off')}>
              {range.tip_out > 0 && <Row label={t('Tip-out')} money={-range.tip_out} />}
              {range.deductions_by_reason.map((row) => (
                <Row key={row.reason} label={t(REASONS[row.reason] ?? row.reason)} money={-row.amount} />
              ))}
              {range.deductions > 0 && range.deductions_by_reason.length === 0 && (
                <Row label={t('Deductions')} money={-range.deductions} />
              )}
              {range.tax > 0 && <Row label={t('Tax withheld')} money={-range.tax} />}
            </Section>
          )}

          <div className="mt-4 flex items-baseline justify-between gap-3 border-t-2 border-ink pt-3">
            <span className="text-[1.05rem] font-extrabold">{t('Take-home')}</span>
            <span className="text-[1.35rem] font-extrabold tracking-tight tabular">
              <Money value={range.net_earned} />
            </span>
          </div>

          {/*
            Below the line, on purpose. Holiday is owed later and an expense
            happened after the money arrived; folding either into the total
            would stop this page agreeing with what actually reached an
            account, which is the only thing it is good for.
          */}
          {(range.holiday_accrued > 0 || range.expenses > 0) && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="field-hint mb-2">{t('Beside the total, not inside it')}</p>
              {range.holiday_accrued > 0 && (
                <Row label={t('Holiday accrued')} money={range.holiday_accrued} />
              )}
              {range.expenses > 0 && (
                <Row label={t('What the work cost')} money={-range.expenses} />
              )}
            </div>
          )}

          <footer className="mt-5 border-t border-border pt-3">
            <p className="field-hint">
              {t('Counted by the app from days that were recorded in it. Not a payroll document.')}
            </p>
            <p className="field-hint tabular">
              {t('Printed')} {todayKey()}
              {range.currencies.length > 1 && ` · ${t('mixes')} ${range.currencies.join(', ')}`}
            </p>
          </footer>
        </article>
      )}
    </div>
  );
}

const REASONS: Record<string, string> = {
  shortfall: 'Till came up short',
  breakage: 'Breakage',
  late: 'Turned up late',
  waste: 'Waste',
  uniform: 'Uniform',
  other: 'Something else',
  meal: 'Meals',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="field-label">{title}</h2>
      <dl className="flex flex-col gap-1">{children}</dl>
    </section>
  );
}

function Row({ label, value, money }: { label: string; value?: string; money?: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[0.9rem]">
      <dt className="min-w-0 truncate text-muted">{label}</dt>
      <dd className="flex-none tabular">
        {money !== undefined ? (
          <span className={money < 0 ? 'text-danger' : ''}>
            {money < 0 && '−'}
            <Money value={Math.abs(money)} />
          </span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
