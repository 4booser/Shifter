'use client';

import { useEffect, useState } from 'react';

import { TaxProfile, TaxReading, taxApi } from '@/lib/api/tax';
import { useI18n } from '@/lib/i18n';
import { Money } from '@/components/ui/bits';

/**
 * The year against the ceiling somebody entered themselves.
 *
 * Simplified-tax rates change by law, by year, by group and by region, and a
 * wrong number here is not an inaccuracy — it is a confident statement about
 * somebody's obligations to the state, made by an app that has never seen
 * their registration. So the app ships no rates at all. Every figure below is
 * multiplication on numbers the person typed off their own paperwork.
 *
 * What it adds is the running total against their own ceiling and roughly when
 * it runs out. Nobody keeps that in their head, and it is exactly the thing
 * people find out about in December.
 */
export function TaxCard() {
  const { t, lang } = useI18n();

  const year = new Date().getFullYear();

  const [reading, setReading] = useState<TaxReading | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TaxProfile>({
    name: '',
    year,
    percent: null,
    fixed_monthly: null,
    social_monthly: null,
    annual_limit: null,
    basis: 'paid',
  });

  const load = () => {
    void taxApi
      .read(year)
      .then((response) => {
        setReading(response);

        if (response.profile !== null) setDraft(response.profile);
      })
      .catch(() => setReading({ profile: null }));
  };

  useEffect(load, [year]);

  if (reading === null) return null;

  const has = reading.profile !== null;

  const number = (value: number | null) => (value === null ? '' : String(value));
  const parse = (value: string) => (value.trim() === '' ? null : Number(value));

  const field = (
    label: string,
    key: 'percent' | 'fixed_monthly' | 'social_monthly' | 'annual_limit',
    hint?: string,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="field-label">{t(label)}</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        className="field-input"
        placeholder={t('not stated')}
        value={number(draft[key])}
        onChange={(event) => setDraft({ ...draft, [key]: parse(event.target.value) })}
      />
      {hint !== undefined && <span className="field-hint">{t(hint)}</span>}
    </label>
  );

  return (
    <section className="card reveal p-4">
      <div className="panel-head mb-2">
        <span>{has ? reading.profile!.name : t('Your tax arrangement')}</span>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(!editing)}>
          {editing ? t('Close') : has ? t('Edit') : t('Set it up')}
        </button>
      </div>

      {!has && !editing && (
        <p className="field-hint">
          {t('Enter the rates from your own registration and this will keep a running total against your own ceiling. It ships no rates of its own — they change by law and by year, and a wrong one here is a confident lie about what you owe.')}
        </p>
      )}

      {has && !editing && (
        <>
          <dl className="flex flex-col gap-1 text-[0.88rem]">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">
                {reading.profile!.basis === 'paid' && reading.fell_back_to_earned !== true
                  ? t('Received this year')
                  : t('Earned this year')}
              </dt>
              <dd className="tabular"><Money value={reading.income ?? 0} /></dd>
            </div>
            {reading.on_income !== null && reading.on_income !== undefined && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">
                  {t('At')} {reading.profile!.percent}%
                </dt>
                <dd className="tabular"><Money value={reading.on_income} /></dd>
              </div>
            )}
            {reading.flat !== null && reading.flat !== undefined && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('Flat, months so far')}</dt>
                <dd className="tabular"><Money value={reading.flat} /></dd>
              </div>
            )}
            {reading.social !== null && reading.social !== undefined && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('Contributions, months so far')}</dt>
                <dd className="tabular"><Money value={reading.social} /></dd>
              </div>
            )}
            <div className="mt-1 flex justify-between gap-2 border-t border-(--border) pt-1 font-semibold">
              <dt>{t('By your own figures')}</dt>
              <dd className="tabular"><Money value={reading.total ?? 0} /></dd>
            </div>
          </dl>

          {/* The half nobody can do in their head. */}
          {reading.limit_used !== null && reading.limit_used !== undefined && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between gap-2 text-[0.84rem]">
                <span className="text-muted">{t('Of your stated ceiling')}</span>
                <span
                  className={`tabular font-semibold ${
                    reading.limit_used >= 0.9 ? 'text-danger' : reading.limit_used >= 0.7 ? 'text-warn' : ''
                  }`}
                >
                  {Math.round(reading.limit_used * 100)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-(--surface-2)">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, reading.limit_used * 100)}%`,
                    background:
                      reading.limit_used >= 0.9
                        ? 'var(--danger)'
                        : reading.limit_used >= 0.7
                          ? 'var(--warn)'
                          : 'var(--accent)',
                  }}
                />
              </div>

              {reading.limit_on !== null && reading.limit_on !== undefined && (
                <p className="field-hint mt-1.5">
                  {t('At this pace you reach it around')}{' '}
                  {new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(
                    new Date(`${reading.limit_on}T12:00:00`),
                  )}
                  {'. '}
                  {t('A straight line through the year so far, nothing cleverer.')}
                </p>
              )}
            </div>
          )}

          {reading.fell_back_to_earned === true && (
            <p className="field-hint mt-2 !text-warn">
              {t('You asked to count money received, and no payments are recorded for this year — this is what the shifts came to instead.')}
            </p>
          )}
        </>
      )}

      {editing && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="field-label">{t('What it is called')}</span>
            <input
              className="field-input"
              maxLength={60}
              placeholder={t('ФОП 2 група')}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>

          {field('Per cent of income', 'percent', 'Leave blank if the arrangement has no percentage. Blank is not zero.')}
          {field('Flat, per month', 'fixed_monthly')}
          {field('Contributions, per month', 'social_monthly')}
          {field('Ceiling for the year', 'annual_limit', 'From your own registration. Nothing here is filled in for you.')}

          <label className="flex flex-col gap-1">
            <span className="field-label">{t('Count')}</span>
            <select
              className="field-input"
              value={draft.basis}
              onChange={(event) => setDraft({ ...draft, basis: event.target.value })}
            >
              <option value="paid">{t('money that arrived')}</option>
              <option value="earned">{t('what the shifts came to')}</option>
            </select>
            <span className="field-hint">
              {t('These are different numbers in a trade that is paid late, and a ceiling is on what arrived.')}
            </span>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={draft.name.trim() === ''}
              onClick={() => {
                void taxApi.save(draft).then(() => {
                  setEditing(false);
                  load();
                });
              }}
            >
              {t('Save')}
            </button>
            {has && (
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  void taxApi.remove(year).then(() => {
                    setEditing(false);
                    load();
                  });
                }}
              >
                {t('Remove')}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
