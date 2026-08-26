'use client';

import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { formatDayLabel, keyOf, todayKey } from '@/lib/calendar/calendar-date';
import { whatIfBaseline, whatIfProject, WhatIfBaseline } from '@/lib/calendar/whatif';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { Money } from '@/components/ui/bits';

const round = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Two dials and a target: turn "what if I picked up one more shift a week"
 * into a monthly figure and a date. The baseline is the person's own last
 * eight weeks, fetched here so the card stays honest whatever period the
 * page above it is showing.
 */
export function WhatIfCard({ suggestedTarget }: { suggestedTarget: number | null }) {
  const { t, lang } = useI18n();
  const settings = useSettings((state) => state.settings);

  const [baseline, setBaseline] = useState<WhatIfBaseline | null | 'loading'>('loading');
  const [shiftsPerWeek, setShiftsPerWeek] = useState(3);
  const [perShift, setPerShift] = useState(1000);
  const [target, setTarget] = useState(0);
  // The "vs your pace" line only makes sense once a dial has actually moved:
  // at rest the rounded defaults sit a few hryvnias off the exact baseline,
  // and a red delta the person never caused reads as a bug.
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const today = todayKey();
    const from = keyOf(new Date(Date.now() - 55 * 86_400_000));

    void calendarApi
      .days(from, today)
      .then((response) => {
        const base = whatIfBaseline(response.days, today);

        setBaseline(base);

        if (base !== null) {
          setShiftsPerWeek(round(base.shiftsPerWeek, 0.5) || 0.5);
          setPerShift(round(base.perShift, 50) || 50);
        }
      })
      .catch(() => setBaseline(null));
  }, []);

  useEffect(() => {
    if (suggestedTarget !== null && suggestedTarget > 0) setTarget(suggestedTarget);
  }, [suggestedTarget]);

  const result = useMemo(
    () => whatIfProject(perShift, shiftsPerWeek, target, 0),
    [perShift, shiftsPerWeek, target],
  );

  // What the same dials say about today's real pace, for the "vs now" line.
  const paceNow = useMemo(
    () =>
      baseline !== null && baseline !== 'loading'
        ? whatIfProject(baseline.perShift, baseline.shiftsPerWeek, 0, 0)
        : null,
    [baseline],
  );

  if (baseline === 'loading') return null;

  if (baseline === null) {
    return (
      <section className="card reveal p-4">
        <h2 className="text-[0.98rem] font-bold">{t('What if')}</h2>
        <p className="field-hint mt-1">
          {t('Work a few shifts first — then this card can play with your pace.')}
        </p>
      </section>
    );
  }

  const monthlyDelta = paceNow === null ? 0 : result.monthly - paceNow.monthly;
  const sliderMax = Math.max(2000, round(baseline.perShift * 2.5, 50));

  return (
    <section className="card reveal p-4">
      <header className="mb-2.5">
        <h2 className="text-[0.98rem] font-bold">{t('What if')}</h2>
        <p className="field-hint">{t('Turn the dials — the money and the date follow.')}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <label>
            <span className="field-hint flex justify-between">
              <span>{t('Shifts a week')}</span>
              <b className="tabular text-ink">{shiftsPerWeek}</b>
            </span>
            <input
              type="range"
              min={0.5}
              max={7}
              step={0.5}
              className="w-full"
              value={shiftsPerWeek}
              onChange={(event) => {
                setTouched(true);
                setShiftsPerWeek(Number(event.target.value));
              }}
            />
          </label>

          <label>
            <span className="field-hint flex justify-between">
              <span>{t('One shift brings')}</span>
              <b className="tabular text-ink">{formatMoney(settings, perShift)}</b>
            </span>
            <input
              type="range"
              min={50}
              max={sliderMax}
              step={50}
              className="w-full"
              value={Math.min(perShift, sliderMax)}
              onChange={(event) => {
                setTouched(true);
                setPerShift(Number(event.target.value));
              }}
            />
          </label>

          <label>
            <span className="field-hint">{t('Aiming for')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              className="field-input mt-0.5 w-full"
              value={target === 0 ? '' : target}
              placeholder={formatMoney(settings, round(result.monthly * 3, 1000) || 30_000)}
              onChange={(event) => setTarget(Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
        </div>

        <div className="grid content-center gap-1 rounded-(--radius) bg-surface-2/60 p-3 text-center">
          <p className="text-[1.45rem] font-bold tabular">
            <Money value={Math.round(result.monthly)} />
            <span className="text-[0.8rem] font-semibold text-muted"> / {t('month')}</span>
          </p>
          <p className="field-hint">
            <Money value={Math.round(result.weekly)} /> {t('a week at this pace')}
          </p>

          {touched && paceNow !== null && Math.abs(monthlyDelta) >= 1 && (
            <p className={`text-[0.85rem] font-semibold ${monthlyDelta > 0 ? 'text-good' : 'text-danger'}`}>
              {monthlyDelta > 0 ? '+' : '−'}
              {formatMoney(settings, Math.round(Math.abs(monthlyDelta)))} {t('vs your real pace')}
            </p>
          )}

          {target > 0 && result.etaKey !== null && !result.reached && (
            <p className="mt-1 border-t border-line pt-2 text-[0.85rem]">
              <Money value={target} className="font-semibold" />
              {' — '}
              {t('in about')}{' '}
              <b className="tabular">
                {result.extraShifts} {t('shifts')}
              </b>
              , {formatDayLabel(result.etaKey, lang)}
            </p>
          )}
          {target > 0 && result.reached && (
            <p className="mt-1 border-t border-line pt-2 text-[0.85rem] font-semibold text-good">
              {t('Reached')} 🎉
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
