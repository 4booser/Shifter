'use client';

import { useState } from 'react';

import { api } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/fx';
import { Shell } from '@/components/layout/shell';
import { Alert } from '@/components/ui/bits';

/**
 * What to ask before signing.
 *
 * People sign these without reading them, and the reason is not laziness: four
 * pages of somebody else's lawyer, and no way to know which of it matters.
 * What matters in this trade is a short unchanging list, and the useful thing
 * is not an opinion about the document but a list of what it is silent about.
 *
 * Every line here is a question. Nothing on this page says a term is unfair,
 * unusual or unlawful — the app cannot know that, and being wrong about it
 * costs somebody their job rather than costing us a bug report.
 */

const QUESTIONS: Record<string, string> = {
  rate: 'The rate is not written down. Ask what it is per hour or per shift, and where in the contract it says so.',
  paid_on: 'No payment date. Ask which day of the month the money comes, and what happens when it falls on a weekend.',
  hours: 'No working hours. Ask how many a week are expected and who decides the rota.',
  overtime: 'Nothing about hours beyond the norm. Ask how they are counted and what they are paid at.',
  tips: 'Tips are not mentioned. Ask whose they are, whether they are pooled, and who decides the split.',
  deductions: 'Nothing about money being taken off. Ask what can be deducted, by whom, and with what proof.',
  breaks: 'No break. Ask how long it is and whether it is paid.',
  trial: 'No trial period. Ask whether there is one, how long, and whether the rate differs during it.',
  notice: 'Nothing about leaving. Ask how much notice each side gives.',
  holiday: 'No holiday. Ask how many days a year and how they are booked.',
};

const ALSO: Record<string, string> = {
  deductions: 'It does mention deductions. Ask for an example: what exactly counts as a shortfall, and who decides it happened.',
  tips: 'It does mention tips. Ask what the split is in numbers, and who can change it.',
};

export default function ContractPage() {
  const { t } = useI18n();

  useReveal();

  const [text, setText] = useState('');
  const [result, setResult] = useState<{ read: boolean; missing: string[]; also: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const check = () => {
    setBusy(true);

    void api<{ read: boolean; missing: string[]; also: string[] }>(
      '/shifter/v1/contract/questions',
      { body: { text } },
    )
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setBusy(false));
  };

  return (
    <Shell>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-3 py-4">
        <section className="card reveal p-4">
          <h1 className="mb-1 text-[1.1rem] font-bold">{t('Questions to ask before you sign')}</h1>
          <p className="field-hint mb-3">
            {t('Paste the contract. This looks for the handful of things a hospitality contract should say, and asks about the ones it does not. It does not judge any term, and it does not keep the text.')}
          </p>

          <textarea
            className="field-input min-h-[10rem] font-mono !text-[0.82rem]"
            placeholder={t('The text of the contract')}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />

          <button
            type="button"
            className="btn btn-primary mt-3 w-full"
            disabled={busy || text.trim() === ''}
            onClick={check}
          >
            {t('What should I ask?')}
          </button>
        </section>

        {result !== null && !result.read && (
          <Alert kind="info">
            {t('That is too short to read as a contract. Paste the whole thing — a heading tells it nothing.')}
          </Alert>
        )}

        {result !== null && result.read && result.missing.length === 0 && (
          <Alert kind="good">
            {t('It mentions all of them. That is not the same as them being fair — read the clauses.')}
          </Alert>
        )}

        {result !== null && result.read && result.missing.length > 0 && (
          <section className="card reveal p-4">
            <h2 className="mb-2 text-[0.98rem] font-bold">{t('Not mentioned anywhere in it')}</h2>
            <ul className="flex flex-col gap-2.5">
              {result.missing.map((topic) => (
                <li key={topic} className="flex gap-2 text-[0.9rem]">
                  <span className="text-faint">—</span>
                  <span>{t(QUESTIONS[topic] ?? topic)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result !== null && result.read && result.also.length > 0 && (
          <section className="card reveal p-4">
            <h2 className="mb-2 text-[0.98rem] font-bold">{t('Worth asking anyway')}</h2>
            <ul className="flex flex-col gap-2.5">
              {result.also.map((topic) => (
                <li key={topic} className="flex gap-2 text-[0.9rem]">
                  <span className="text-faint">—</span>
                  <span>{t(ALSO[topic] ?? topic)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result !== null && result.read && (
          <p className="field-hint">
            {t('These are questions, not findings. Nothing here says a term is unusual or unlawful — that is not something this app can know.')}
          </p>
        )}
      </div>
    </Shell>
  );
}
