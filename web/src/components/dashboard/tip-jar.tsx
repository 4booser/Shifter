'use client';

import { useCallback, useEffect, useState } from 'react';

import { TipJarState, accountApi } from '@/lib/api/auth';
import { apiErrorMessage } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { Alert, Money } from '@/components/ui/bits';

const SHARES = [5, 10, 15, 20, 30];

/**
 * A share of tips, set aside on paper.
 *
 * Tips are the only money in this trade that arrives in cash and leaves
 * without a trace. "Save a bit" is advice nobody can follow — a bit of nothing
 * in particular is nothing — but a percent of a figure the app already knows
 * is a number somebody can act on tonight.
 *
 * Nothing here moves any money. The app has no business touching anybody's
 * account, and "you meant to have put aside 4 200 by now" turns out to be the
 * useful part anyway.
 */
export function TipJar() {
  const { t } = useI18n();

  const [state, setState] = useState<TipJarState | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void accountApi
      .tipJar()
      .then((next) => {
        setState(next);
        setGoal(next.goal > 0 ? next.goal : null);
      })
      .catch(() => setState(null));
  }, []);

  useEffect(load, [load]);

  const save = async (percent: number, target: number) => {
    setBusy(true);
    setError(null);

    try {
      await accountApi.setTipJar(percent, target);
      load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (state === null) return null;

  const on = state.percent > 0;
  const towards = state.goal > 0 ? Math.min(100, (state.saved / state.goal) * 100) : null;

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1 text-[0.98rem] font-bold">{t('Tips put aside')}</h2>
      <p className="field-hint mb-3">
        {t('Nothing is moved. The app only counts what the rule says should be there by now.')}
      </p>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={`btn btn-sm ${on ? '' : 'btn-primary'}`}
          disabled={busy}
          onClick={() => void save(0, 0)}
        >
          {t('Off')}
        </button>
        {SHARES.map((share) => (
          <button
            key={share}
            type="button"
            className={`btn btn-sm ${state.percent === share ? 'btn-primary' : ''}`}
            disabled={busy}
            aria-pressed={state.percent === share}
            onClick={() => void save(share, goal ?? 0)}
          >
            {share}%
          </button>
        ))}
      </div>

      {on && (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[1.5rem] font-extrabold tracking-tight text-good-read">
              <Money value={state.saved} />
            </span>
            <span className="field-hint">
              {state.percent}% {t('of')} <Money value={state.tips_since} /> {t('in tips')}
              {state.from !== null && ` · ${t('since')} ${state.from.slice(8)}.${state.from.slice(5, 7)}`}
            </span>
          </div>

          {towards !== null && (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-(--good)"
                  style={{ width: `${towards}%` }}
                />
              </div>
              <p className="field-hint mt-1">
                {Math.round(towards)}% {t('of')} <Money value={state.goal} />
                {/* A date only where there is enough of a run behind it. Three
                    days of tips extrapolated months out is arithmetic dressed
                    as a promise. */}
                {state.reaches !== null && (
                  <>
                    {' · '}
                    {t('at this pace, by')} {state.reaches.slice(8)}.{state.reaches.slice(5, 7)}
                  </>
                )}
              </p>
            </>
          )}

          <label className="mt-3 block">
            <span className="field-label">{t('What it is for')}</span>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                className="field-input"
                placeholder={t('No target, just a total')}
                value={goal ?? ''}
                onChange={(event) =>
                  setGoal(event.target.value === '' ? null : Number(event.target.value))
                }
              />
              <button
                type="button"
                className="btn"
                disabled={busy || (goal ?? 0) === state.goal}
                onClick={() => void save(state.percent, goal ?? 0)}
              >
                {t('Save')}
              </button>
            </div>
          </label>
        </>
      )}
    </section>
  );
}
