'use client';

import { useEffect, useState } from 'react';

import { assistantApi, RaiseCase } from '@/lib/api/assistant';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';

/**
 * The conversation about money, prepared in advance.
 *
 * People do not fail to ask for a raise because they lack nerve. They fail
 * because when the moment comes they have nothing but a feeling, and a feeling
 * loses to "business has been slow" every time. The evidence has been
 * accumulating here the whole while — how long the rate has stood still, how
 * this place compares to the others they actually work, how many shifts they
 * covered for somebody else at short notice.
 *
 * It says "not yet" out loud when that is the answer. An app that talks
 * somebody into a conversation they will lose has done them harm.
 */
export function RaiseCasePanel() {
  const { t, n } = useI18n();
  const { format } = useMoney();

  const [cases, setCases] = useState<RaiseCase[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    void assistantApi
      .raise()
      .then(setCases)
      .catch(() => setCases([]));
  }, []);

  if (cases.length === 0) return null;

  return (
    <section className="card reveal p-4">
      <h2 className="text-[0.98rem] font-bold">{t('Asking for more')}</h2>
      <p className="field-hint mb-2.5">
        {t('Everything below is your own record. Nothing here is an opinion.')}
      </p>

      <div className="flex flex-col gap-2.5">
        {cases.map((entry) => (
          <article
            key={entry.location_id}
            className={`rounded-(--radius) border p-3 ${
              entry.worth_asking ? 'border-good/40' : 'border-border'
            }`}
          >
            <header className="flex flex-wrap items-baseline gap-x-2">
              <b className="text-[0.95rem]">{entry.location_name}</b>
              <span className="field-hint tabular">
                {format(entry.per_hour)}
                {t('/hour')} · {n(entry.months_here, 'months')}
              </span>
              {entry.worth_asking && (
                <span className="chip ml-auto border-good/40 text-good">
                  {t('There is a case')}
                </span>
              )}
            </header>

            {entry.points.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1 pl-4 text-[0.87rem]">
                {entry.points.map((point) => (
                  <li key={point} className="list-disc">
                    {point}
                  </li>
                ))}
              </ul>
            )}

            {/* Said plainly rather than hidden. Being told "not yet" by an app
                is cheaper than being told it by a manager. */}
            {entry.weakness !== null && (
              <p className="field-hint mt-2 border-l-2 border-border pl-2.5">{entry.weakness}</p>
            )}

            {entry.message !== null && (
              <>
                <pre className="mt-2 whitespace-pre-wrap rounded-(--radius) bg-surface-2 p-2.5 text-[0.85rem]">
                  {entry.message}
                </pre>
                <button
                  type="button"
                  className="btn btn-sm mt-2"
                  onClick={() => {
                    void navigator.clipboard.writeText(entry.message ?? '');
                    setCopied(entry.location_id);
                  }}
                >
                  {t(copied === entry.location_id ? 'Copied' : 'Copy the message')}
                </button>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
