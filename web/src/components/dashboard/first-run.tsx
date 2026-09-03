'use client';

import { useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import { keysBetween, monthBounds, todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { loadCatalogues, reload } from '@/lib/store/calendar';
import { Alert } from '@/components/ui/bits';

/**
 * Three questions, and then a real number.
 *
 * The old first run was a checklist: it told somebody to add a place, make a
 * shift and paint the calendar, and then left them to do all three. Between
 * registering and seeing anything worth seeing there were half a dozen screens,
 * and people leave in that gap — not because the app is hard, but because it
 * has not yet shown them a single thing they did not already know.
 *
 * So it asks the three things it cannot guess, does the rest itself, and lands
 * on what the month comes to. Everything else — tip-out, meals, night rates,
 * the pay period — is a setting they can find later, once the app has earned
 * the right to ask.
 */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function FirstRun() {
  const { t, n } = useI18n();
  const { format } = useMoney();

  const [step, setStep] = useState(0);
  const [venue, setVenue] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [period, setPeriod] = useState<'hour' | 'day' | 'month'>('hour');
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('02:00');
  const [days, setDays] = useState<number[]>([4, 5]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The days left in this month that fall on the chosen weekdays. Only the
   * rest of the month: filling in days somebody has already worked would be
   * inventing their past on their behalf.
   */
  const dates = useMemo(() => {
    const today = todayKey();
    const bounds = monthBounds(today);

    return keysBetween(today, bounds.to).filter((key) => {
      const date = new Date(`${key}T00:00:00`);

      return days.includes(((date.getDay() + 6) % 7) + 1);
    });
  }, [days]);

  const hours = useMemo(() => {
    const [fromH, fromM] = start.split(':').map(Number);
    const [toH, toM] = end.split(':').map(Number);
    const span = (toH * 60 + toM - (fromH * 60 + fromM) + 1440) % 1440;

    return span === 0 ? 8 : span / 60;
  }, [start, end]);

  const forecast = useMemo(() => {
    if (amount === null || amount <= 0) return 0;

    return period === 'hour'
      ? amount * hours * dates.length
      : period === 'day'
        ? amount * dates.length
        : amount;
  }, [amount, period, hours, dates.length]);

  const finish = async () => {
    if (venue.trim() === '' || amount === null || amount <= 0) return;

    setBusy(true);
    setError(null);

    try {
      // Everything at its default except the three answers. A place has two
      // dozen settings and not one of them is worth a question before the app
      // has shown somebody a number.
      const place = await calendarApi.createLocation({
        name: venue.trim(),
        address: null,
        latitude: null,
        longitude: null,
        colour: '#4488CC',
        pay_period: 'monthly',
        pay_day: 1,
        pay_anchor: null,
        overtime_weekly_hours: 40,
        overtime_multiplier: 1.5,
        night_multiplier: 1,
        night_from: '22:00',
        night_to: '06:00',
        public_holiday_multiplier: 1,
        holiday_country: 'UA',
        tip_out_of_tips_percent: 0,
        tip_out_of_sales_percent: 0,
        meal_deduction: 0,
        auto_break_after_hours: 0,
        auto_break_minutes: 0,
        minimum_hourly: 0,
        commute_minutes: 0,
        commute_cost: 0,
        tax_percent: 0,
        tax_tips: false,
        holiday_percent: 0,
        currency: null,
        sales_pay_period: '',
        sales_pay_day: 1,
        sales_pay_anchor: null,
      });

      const template = await calendarApi.createShift({
        name: t('My shift'),
        symbol: null,
        location_id: place.id,
        start_time: start,
        end_time: end,
        salary_period: period,
        salary_amount: amount,
        break_minutes: 0,
        colour: null,
        revenue_percent: null,
        tip_source: 'personal',
        tip_pool_percent: null,
      });

      // Placed as plans, not as worked: the app has no business claiming
      // somebody turned up to a shift that has not happened.
      if (dates.length > 0) await calendarApi.bulk(dates, template.id, 'add');

      await loadCatalogues();
      reload();
    } catch (caught) {
      setError(apiErrorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <section className="card rise p-4">
      <h2 className="mb-1 text-[1.05rem] font-bold">{t('Sixty seconds and it starts counting')}</h2>
      <p className="field-hint mb-3">
        {t('Three questions. Everything else is a setting you can find later.')}
      </p>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {step === 0 && (
        <div className="flex flex-col gap-2.5">
          <label>
            <span className="field-label">{t('Where do you work?')}</span>
            <input
              className="field-input"
              autoFocus
              maxLength={60}
              placeholder={t('The bar on the corner')}
              value={venue}
              onChange={(event) => setVenue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && venue.trim() !== '') setStep(1);
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary self-end"
            disabled={venue.trim() === ''}
            onClick={() => setStep(1)}
          >
            {t('Next')}
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(['hour', 'day', 'month'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`btn btn-sm ${period === option ? 'btn-primary' : 'btn-quiet'}`}
                aria-pressed={period === option}
                onClick={() => setPeriod(option)}
              >
                {t(option === 'hour' ? 'Per hour' : option === 'day' ? 'Per shift' : 'Per month')}
              </button>
            ))}
          </div>
          <label>
            <span className="field-label">{t('What do they pay?')}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              className="field-input"
              autoFocus
              value={amount ?? ''}
              onChange={(event) =>
                setAmount(event.target.value === '' ? null : Number(event.target.value))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' && amount !== null && amount > 0) setStep(2);
              }}
            />
          </label>
          <div className="flex justify-between">
            <button type="button" className="btn btn-quiet" onClick={() => setStep(0)}>
              {t('Back')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={amount === null || amount <= 0}
              onClick={() => setStep(2)}
            >
              {t('Next')}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">{t('Shifts start')}</span>
              <input
                type="time"
                className="field-input"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">{t('and end')}</span>
              <input
                type="time"
                className="field-input"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </div>

          <div>
            <span className="field-label">{t('Which days, usually?')}</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`btn btn-sm ${days.includes(index + 1) ? 'btn-primary' : 'btn-quiet'}`}
                  aria-pressed={days.includes(index + 1)}
                  onClick={() =>
                    setDays((was) =>
                      was.includes(index + 1)
                        ? was.filter((day) => day !== index + 1)
                        : [...was, index + 1],
                    )
                  }
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </div>

          {/* The point of the whole flow: a number, before anybody has done any
              work. Rounded and labelled as what is left of the month, because
              it is a forecast rather than a wage. */}
          {forecast > 0 && (
            <p className="rounded-(--radius) bg-(--accent-soft) px-3 py-2.5 text-[0.95rem]">
              {t('Rest of the month:')} <b>{format(forecast)}</b>{' '}
              <span className="field-hint">
                {t('over')} {n(dates.length, 'shifts')}
              </span>
            </p>
          )}

          <div className="flex justify-between">
            <button type="button" className="btn btn-quiet" onClick={() => setStep(1)}>
              {t('Back')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void finish()}
            >
              {t(busy ? 'Setting up…' : 'Put it on my calendar')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
