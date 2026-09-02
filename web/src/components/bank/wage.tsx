'use client';

import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { Reconciliation } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { ExpectedWage, MonoStatementItem, WageMatch, wageCandidates } from '@/lib/mono/mono';
import { Alert, Money } from '@/components/ui/bits';

/**
 * The wage, matched against what the app expected.
 *
 * The reconciliation already knows what each place owes and when. The
 * statement knows what arrived. Putting the two side by side is the single
 * most useful thing a bank tab inside a shift tracker can do — and it is a
 * question, never an announcement: the app matched a credit against a figure
 * it computed itself, and the person is the one who knows whether that credit
 * is their wage.
 */
export function BankWage({
  items,
  onRecorded,
}: {
  items: MonoStatementItem[];
  onRecorded?: () => void;
}) {
  const { t, lang } = useI18n();

  const [owed, setOwed] = useState<Reconciliation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const pad = (value: number) => String(value).padStart(2, '0');
    const key = (date: Date) =>
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    void calendarApi
      .schedule(key(from), key(today))
      .then(setOwed)
      .catch(() => setOwed(null));
  }, []);

  const matches = useMemo(() => {
    if (owed === null || items.length === 0) return [];

    return owed.periods
      .filter((row) => row.expected > row.paid && row.stream !== 'commission')
      .map((row) => {
        const expected: ExpectedWage = {
          locationId: row.location_id,
          locationName: row.location_name,
          periodFrom: row.period_from,
          periodTo: row.period_to,
          amount: row.expected - row.paid,
          due: row.due_on,
        };

        // The cutoff the phone's background watcher already uses: beyond a
        // third out, a credit is not this wage arriving — it is something
        // else, and offering it teaches people the card guesses.
        const candidates = wageCandidates(items, expected, [])
          .filter((match) => Math.abs(match.difference) <= 0.35)
          .slice(0, 2);

        return { row, expected, candidates };
      })
      .filter((entry) => entry.candidates.length > 0);
  }, [owed, items]);

  if (matches.length === 0) return null;

  const record = async (
    entry: (typeof matches)[number],
    match: WageMatch,
  ) => {
    const id = entry.row.location_id + entry.row.period_from;

    setBusy(id);

    try {
      await calendarApi.createPayout({
        location_id: entry.row.location_id,
        period_from: entry.row.period_from,
        period_to: entry.row.period_to,
        amount: match.total,
        received_on: new Date(match.items[0].time * 1000).toISOString().slice(0, 10),
        note: null,
        stream: entry.row.stream,
        // It settles the period — that is what matching it against the
        // reconciliation means.
        kind: 'settlement',
      });

      setDone(id);
      onRecorded?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card reveal !border-(--accent)/30 p-4">
      <div className="panel-head mb-2">
        <span>{t('Looks like a wage arrived')}</span>
      </div>

      <div className="flex flex-col gap-3">
        {matches.map((entry) => {
          const id = entry.row.location_id + entry.row.period_from;

          if (done === id) {
            return (
              <Alert key={id} kind="good">
                {t('Recorded as a payout for')} {entry.row.location_name}.
              </Alert>
            );
          }

          return (
            <div key={id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2 text-[0.9rem]">
                <span className="font-semibold">{entry.row.location_name}</span>
                <span className="tabular text-muted">
                  {t('owed')} <Money value={entry.expected.amount} />
                </span>
              </div>

              {entry.candidates.map((match, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius) border border-border px-3 py-2"
                >
                  <div className="min-w-0 text-[0.84rem]">
                    <span className="tabular font-semibold"><Money value={match.total} /></span>
                    {match.items.length > 1 && (
                      <span className="ml-1 text-faint">
                        · {t('two transfers that add up')}
                      </span>
                    )}
                    <span
                      className={`ml-2 tabular text-[0.78rem] ${
                        Math.abs(match.difference) <= 0.02
                          ? 'text-good-read'
                          : match.difference < 0
                            ? 'text-warn-read'
                            : 'text-muted'
                      }`}
                    >
                      {match.difference === 0
                        ? t('to the hryvnia')
                        : `${match.difference > 0 ? '+' : '−'}${Math.round(Math.abs(match.difference) * 100)}%`}
                    </span>
                    <div className="truncate text-[0.76rem] text-faint">
                      {match.items
                        .map((item) =>
                          `${new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' })
                            .format(new Date(item.time * 1000))} · ${item.description}`)
                        .join(' + ')}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm flex-none"
                    disabled={busy === id}
                    onClick={() => void record(entry, match)}
                  >
                    {t('Record as the payout')}
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <p className="field-hint mt-2">
        {t('A guess, offered for one tap of confirmation — never recorded by itself.')}
      </p>
    </section>
  );
}
