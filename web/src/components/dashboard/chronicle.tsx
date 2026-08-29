'use client';

import { useCallback, useEffect, useState } from 'react';

import { Chapter, papersApi } from '@/lib/api/papers';
import { apiErrorMessage } from '@/lib/api/http';
import { useMoney } from '@/lib/settings/money';
import { useI18n } from '@/lib/i18n';
import { Alert } from '@/components/ui/bits';

/**
 * The private chronicle: the CV's other half, the one that never prints.
 *
 * The public record is shaped for showing. This is shaped for remembering —
 * first day, last day, what the whole place came to, the rate at each end,
 * and one line the record cannot derive: why it ended, in your own words.
 * «Ушёл из-за штрафов» is exactly the sentence a person needs back two years
 * later and exactly the sentence that must never reach a stranger, so the
 * server keeps it off the card endpoint entirely rather than trusting a
 * checkbox to hide it.
 */
export function Chronicle() {
  const { t, n, lang } = useI18n();
  const { format } = useMoney();

  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void papersApi
      .chronicle()
      .then(setChapters)
      .catch((caught) => setError(apiErrorMessage(caught)));
  }, []);

  useEffect(load, [load]);

  const save = (locationId: number) => {
    const note = draft.trim() === '' ? null : draft.trim();

    setEditing(null);

    void papersApi
      .note(locationId, note)
      .then(load)
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const said = (key: string | null) => {
    if (key === null) return '';

    const date = new Date(key);

    return `${date.toLocaleDateString(lang, { month: 'short', year: 'numeric' })}`;
  };

  if (chapters === null || chapters.length === 0) {
    return error === null ? null : <Alert onDismiss={() => setError(null)}>{error}</Alert>;
  }

  return (
    <section className="card reveal p-4 print:hidden">
      <h2 className="mb-1 text-[0.98rem] font-bold">{t('Your chronicle')}</h2>
      <p className="field-hint mb-3">
        {t('Only for you: this section never prints and never reaches the shared card. The place to write down what actually happened.')}
      </p>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="flex flex-col gap-3">
        {chapters.map((chapter) => (
          <div key={chapter.location_id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-bold">{chapter.name}</span>
              <span className="text-[0.8rem] text-muted">
                {said(chapter.first_day)} — {chapter.current ? t('now') : said(chapter.last_day)}
              </span>
              <span className="ml-auto text-[0.8rem] text-muted tabular">
                {n(chapter.days, 'days')} · {format(chapter.earned)}
              </span>
            </div>

            {chapter.rate_first !== null &&
              chapter.rate_last !== null &&
              chapter.rate_last !== chapter.rate_first && (
                <p className="mt-1 text-[0.8rem] text-muted">
                  {t('Rate went from')} {format(chapter.rate_first)}/{t('h')} {t('to')}{' '}
                  {format(chapter.rate_last)}/{t('h')}
                </p>
              )}

            {editing === chapter.location_id ? (
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  className="field-input min-h-16"
                  maxLength={500}
                  value={draft}
                  placeholder={t('Why it ended, for your own eyes')}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => save(chapter.location_id)}
                  >
                    {t('Keep')}
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(null)}>
                    {t('Cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="mt-2 block text-left text-[0.85rem] text-muted hover:text-ink"
                onClick={() => {
                  setEditing(chapter.location_id);
                  setDraft(chapter.note ?? '');
                }}
              >
                {chapter.note !== null ? (
                  <span className="italic">«{chapter.note}»</span>
                ) : (
                  <span className="underline decoration-dotted underline-offset-2">
                    {t('Add a private note — why it ended, what to remember')}
                  </span>
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
