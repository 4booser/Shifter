'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/http';
import { todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';

/** One line of a block: a sentence, sometimes a figure worth setting apart. */
interface BriefLine {
  text: string;
  value: string | null;
  /** 'good' or 'warn'. Colour is meaning here, never decoration. */
  tone: 'good' | 'warn' | null;
}

interface BriefBlock {
  kind: string;
  emoji: string;
  title: string;
  lines: BriefLine[];
}

interface Brief {
  date: string;
  headline: string;
  body: string;
  tip: string | null;
  mood: string | null;
  /** "model" when a model worded it, "local" when the app did. */
  source: string;
}

/**
 * The day in words, under the calendar where the page used to trail off.
 * The numbers behind it are the app's own — the model, when configured,
 * only chooses the sentences — and the card says plainly which of the two
 * wrote it, because a reader deserves to know whose voice they are hearing.
 */
export function DailyBrief() {
  const { t } = useI18n();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [blocks, setBlocks] = useState<BriefBlock[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void api<Brief>(`/shifter/v1/brief/today?date=${todayKey()}`)
      .then(setBrief)
      .catch(() => setFailed(true));

    // The blocks are ours in full; the paragraph above them may be the
    // model's. They load apart so one being slow never hides the other.
    void api<BriefBlock[]>(`/shifter/v1/brief/blocks?date=${todayKey()}`)
      .then(setBlocks)
      .catch(() => undefined);
  }, []);

  if (failed) return null;

  if (brief === null) {
    return (
      <section className="card reveal p-4">
        <span className="block h-4 w-40 animate-pulse rounded bg-surface-2" />
        <span className="mt-2 block h-3 w-full animate-pulse rounded bg-surface-2" />
        <span className="mt-1.5 block h-3 w-2/3 animate-pulse rounded bg-surface-2" />
      </section>
    );
  }

  return (
    <section className="card reveal relative overflow-hidden p-4">
      {/* A quiet wash so the card reads as commentary, not another table. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-(--accent-soft)"
      />

      <header className="relative mb-1.5 flex items-baseline gap-2">
        <span className="text-[1.35rem] leading-none">{brief.mood ?? '💡'}</span>
        <h2 className="text-[1.02rem] font-bold leading-tight">{brief.headline}</h2>
        <span className="ml-auto flex-none text-[0.68rem] uppercase tracking-wide text-faint">
          {brief.source === 'model' ? t('written by AI') : t('daily summary')}
        </span>
      </header>

      <p className="relative text-[0.92rem] leading-relaxed text-muted">{brief.body}</p>

      {brief.tip !== null && (
        <p className="relative mt-2.5 rounded-(--radius) bg-surface-2/70 px-3 py-2 text-[0.88rem]">
          <b className="text-(--accent)">{t('Today')}: </b>
          {brief.tip}
        </p>
      )}

      {/* The commonest reaction to a sentence about your money is a question
          about it, so the way to ask one is on the card that prompted it. */}
      {blocks.length > 0 && (
        <div className="relative mt-3.5 grid gap-2.5 sm:grid-cols-2">
          {blocks.map((block) => (
            <section key={block.kind} className="rounded-(--radius) border border-border bg-surface-2/60 p-3">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-[0.82rem] font-bold">
                <span aria-hidden className="text-[0.95rem] leading-none">
                  {block.emoji}
                </span>
                {block.title}
              </h3>

              <ul className="flex flex-col gap-1">
                {block.lines.map((line, index) => (
                  <li key={index} className="flex items-baseline justify-between gap-2 text-[0.84rem]">
                    <span
                      className={
                        line.tone === 'warn' ? 'text-warn' : line.tone === 'good' ? '' : 'text-muted'
                      }
                    >
                      {line.text}
                    </span>
                    {line.value !== null && (
                      <span
                        className={`flex-none font-bold tabular ${
                          line.tone === 'good' ? 'text-good' : line.tone === 'warn' ? 'text-warn' : ''
                        }`}
                      >
                        {line.value}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Link
        href="/assistant"
        className="relative mt-3 inline-flex items-center gap-1 text-[0.85rem] font-semibold text-(--accent) hover:underline"
      >
        {t('Ask about this')}
        <span aria-hidden>›</span>
      </Link>
    </section>
  );
}
