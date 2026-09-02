'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AssistantGap, AssistantMessage, AssistantReport, assistantApi } from '@/lib/api/assistant';
import { apiErrorMessage } from '@/lib/api/http';
import {
  YearMonth,
  addMonths,
  currentMonth,
  monthBounds,
  monthLabel,
  todayKey,
  weekBounds,
} from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { Shell } from '@/components/layout/shell';
import { RaiseCasePanel } from '@/components/dashboard/raise-case';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { useTitle } from '@/lib/use-title';

export default function AssistantPage() {
  return (
    <Shell>
      <Assistant />
    </Shell>
  );
}

/** monthBounds works from a day inside the month, so the first of it will do. */
const firstOf = ({ year, month }: YearMonth) => `${year}-${`${month}`.padStart(2, '0')}-01`;

type Span = 'day' | 'week' | 'month' | 'year';

const SPAN_LABEL: Record<Span, string> = {
  day: 'Today',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

/**
 * The days a written-out period covers. Only the month is navigable: nobody
 * asks to have the third week of last April written out, and a picker for it
 * would cost more attention than it saves.
 */
function spanBounds(span: Span, month: YearMonth): { from: string; to: string } {
  if (span === 'day') return { from: todayKey(), to: todayKey() };

  if (span === 'week') return weekBounds(todayKey());

  if (span === 'year') {
    const year = currentMonth().year;

    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  return monthBounds(firstOf(month));
}

/** What people actually want to know, offered before they have to phrase it. */
const OPENERS = [
  'Сколько я заработал в этом месяце?',
  'Сколько стоит мой час?',
  'Когда придут деньги?',
  'Какой был лучший день?',
  'Сколько принесли чаевые?',
  'Где я заработал больше?',
];

/**
 * The assistant. Three things live here and they belong together: the thread,
 * the blanks it would like filled, and a written-out period on demand. Every
 * figure it quotes was counted by the same code the calendar uses — the model,
 * where there is one, only chooses the words, and each answer says which of
 * the two wrote it.
 */
function Assistant() {
  const { t, lang } = useI18n();

  useTitle('Assistant');

  const [thread, setThread] = useState<AssistantMessage[]>([]);
  const [gaps, setGaps] = useState<AssistantGap[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<YearMonth>(currentMonth());
  const [span, setSpan] = useState<Span>('month');
  const [report, setReport] = useState<AssistantReport | null>(null);
  const [writing, setWriting] = useState(false);

  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void assistantApi.messages().then(setThread).catch(() => undefined);
    void assistantApi.gaps(todayKey(), lang).then(setGaps).catch(() => undefined);
  }, [lang]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.length, busy]);

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim();

      if (question === '' || busy) return;

      setBusy(true);
      setError(null);
      setDraft('');

      // The question shows immediately: waiting for a round trip to see your
      // own words typed back is the thing that makes a chat feel broken.
      const mine: AssistantMessage = {
        id: -Date.now(),
        role: 'user',
        text: question,
        source: null,
        created_at: new Date().toISOString(),
      };

      setThread((current) => [...current, mine]);

      try {
        const bounds = monthBounds(firstOf(currentMonth()));
        const answer = await assistantApi.ask(question, bounds.from, bounds.to, todayKey());

        setThread((current) => [...current, answer]);
      } catch (caught) {
        setError(apiErrorMessage(caught));
        setThread((current) => current.filter((message) => message.id !== mine.id));
        setDraft(question);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const makeReport = async () => {
    setWriting(true);
    setError(null);

    try {
      const bounds = spanBounds(span, month);

      setReport(await assistantApi.report(bounds.from, bounds.to));
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setWriting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      {/* ==== The thread ==== */}
      <section className="card flex min-h-[26rem] flex-col gap-3 p-4">
        <header className="flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-[1.05rem] font-bold">
            <Icon name="spark" size={16} className="text-(--accent)" />
            {t('Ask about your own months')}
          </h1>
          {thread.length > 0 && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                void assistantApi.clear().then(() => setThread([]));
              }}
            >
              <Icon name="trash" size={12} />
              {t('Clear')}
            </button>
          )}
        </header>

        {thread.length === 0 && (
          <p className="field-hint">
            {t('Everything it answers with was counted from your own shifts — it never invents a figure.')}
          </p>
        )}

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
          {thread.map((message) => (
            <article
              key={message.id}
              className={
                message.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-(--radius) bg-(--accent) px-3 py-2 text-[0.9rem] text-white'
                  : 'mr-auto max-w-[92%] rounded-(--radius) border border-border bg-surface-2 px-3 py-2 text-[0.9rem]'
              }
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.role === 'assistant' && (
                <p className="mt-1 text-[0.7rem] text-muted">
                  {message.source === 'model' ? t('worded by the model') : t('counted and worded by Shifter')}
                </p>
              )}
            </article>
          ))}

          {busy && (
            <div className="mr-auto flex gap-1 rounded-(--radius) border border-border bg-surface-2 px-3 py-2.5">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </div>
          )}

          <div ref={bottom} />
        </div>

        {error !== null && <Alert>{error}</Alert>}

        {thread.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {OPENERS.map((opener) => (
              <button
                key={opener}
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => void ask(opener)}
              >
                {opener}
              </button>
            ))}
          </div>
        )}

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft);
          }}
        >
          <input
            className="field-input flex-1"
            value={draft}
            maxLength={500}
            placeholder={t('Ask about a month, a day, an hour…')}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || draft.trim() === ''}>
            <Icon name="spark" size={14} />
            {t('Ask')}
          </button>
        </form>
      </section>

      <div className="flex flex-col gap-4">
        <GapCards gaps={gaps} onAnswered={(id) => setGaps((current) => current.filter((gap) => gap.id !== id))} />

        {/* ==== The written-out period ==== */}

      {/* ==== The conversation about money, prepared in advance ==== */}
      <RaiseCasePanel />
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="flex items-center gap-2 text-[1rem] font-bold">
            <Icon name="note" size={15} className="text-(--accent)" />
            {t('A period, written out')}
          </h2>

          <div className="flex gap-1.5">
            {(['day', 'week', 'month', 'year'] as Span[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`btn btn-sm flex-1 ${span === option ? 'btn-primary' : 'btn-quiet'}`}
                onClick={() => setSpan(option)}
              >
                {t(SPAN_LABEL[option])}
              </button>
            ))}
          </div>

          {span === 'month' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('Previous month')}
                className="btn btn-quiet btn-sm"
                onClick={() => setMonth((at) => addMonths(at, -1))}
              >
                ‹
              </button>
              <span className="flex-1 text-center text-[0.9rem] font-semibold tabular">
                {monthLabel(month, lang)}
              </span>
              <button
                type="button"
                aria-label={t('Next month')}
                className="btn btn-quiet btn-sm"
                onClick={() => setMonth((at) => addMonths(at, 1))}
              >
                ›
              </button>
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary"
            disabled={writing}
            onClick={() => void makeReport()}
          >
            {writing ? t('Writing…') : t('Write it out')}
          </button>

          {report !== null && (
            <article className="flex flex-col gap-3 border-t border-border pt-3">
              <p className="text-[0.95rem] font-semibold">{report.summary}</p>

              <ul className="grid grid-cols-2 gap-1.5">
                {report.stats.map((stat) => (
                  <li key={stat.label} className="rounded-(--radius) bg-surface-2 px-2.5 py-2">
                    <span className="block text-[0.7rem] text-muted">{stat.label}</span>
                    <span className="block text-[0.95rem] font-bold tabular">{stat.value}</span>
                  </li>
                ))}
              </ul>

              {report.paragraphs.map((paragraph, index) => (
                <p key={index} className="text-[0.88rem] leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}

              <p className="text-[0.7rem] text-muted">
                {report.source === 'model' ? t('worded by the model') : t('counted and worded by Shifter')}
              </p>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * The blanks, one card each. Answering one writes straight into the day it is
 * about, which is the whole reason to ask: a question that changes nothing is
 * an interruption, not an assistant.
 */
function GapCards({ gaps, onAnswered }: { gaps: AssistantGap[]; onAnswered: (id: string) => void }) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  if (gaps.length === 0) return null;

  const answer = async (gap: AssistantGap) => {
    const raw = values[gap.id];

    if (raw === undefined || raw.trim() === '') return;

    setSaving(gap.id);

    try {
      await assistantApi.answerGap(gap.kind, gap.date, gap.shift_id, Number(raw));
      onAnswered(gap.id);
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="flex items-center gap-2 text-[1rem] font-bold">
        <Icon name="target" size={15} className="text-(--accent)" />
        {t('Fill in the blanks')}
      </h2>
      <p className="field-hint">
        {t('Each answer lands straight on that day and makes every total truer.')}
      </p>

      {gaps.map((gap) => (
        <div key={gap.id} className="rounded-(--radius) border border-border p-3">
          <p className="text-[0.88rem]">{gap.question}</p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              className="field-input flex-1"
              placeholder="0"
              value={values[gap.id] ?? ''}
              onChange={(event) =>
                setValues((current) => ({ ...current, [gap.id]: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') void answer(gap);
              }}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving === gap.id}
              onClick={() => void answer(gap)}
            >
              <Icon name="check" size={12} />
              {t('Save')}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
