'use client';

import { useCallback, useEffect, useState } from 'react';

import { downloadBlob } from '@/lib/export/xlsx';
import { currentCardTheme } from '@/lib/export/share-card';
import { drawStoryCard } from '@/lib/export/story-card';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/ui/icon';

/**
 * The year, one fact at a time.
 *
 * The page below already says all of this, and nobody has ever shared a page.
 * People share cards — one number, full bleed, thumb-sized to advance — and a
 * year of somebody's work is worth more than a screenshot of a dashboard with
 * a browser bar across the top.
 *
 * Every card can be saved as an image on its own, so the one worth posting can
 * go without the five that are nobody's business. And money can be taken off
 * all of them before any of that happens: plenty of people will happily post
 * that they worked 212 shifts and would never post what they were paid for
 * them.
 */
export interface Story {
  /** The eyebrow: "2026", "Лучший день". */
  label: string;
  /** The number itself, already formatted. Empty where the card has none. */
  value: string;
  /** The line under it. */
  meta: string;
  /** True where `value` is money, so hiding amounts can blank it. */
  money?: boolean;
  /** Up to three supporting lines for the saved image. */
  lines?: string[];
}

export function Stories({
  stories,
  rhythm,
  year,
  onClose,
}: {
  stories: Story[];
  /** 0..1 per weekday, Monday first — the rhythm strip on the saved image. */
  rhythm: number[];
  year: number;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const [at, setAt] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);

  const shown = stories.filter((story) => story.value !== '' || story.meta !== '');
  const story = shown[Math.min(at, shown.length - 1)];

  const step = useCallback(
    (by: number) =>
      setAt((was) => {
        const next = was + by;

        if (next < 0) return 0;
        if (next >= shown.length) {
          onClose();

          return was;
        }

        return next;
      }),
    [shown.length, onClose],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' || event.key === ' ') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [step, onClose]);

  if (story === undefined) return null;

  const value = hidden && story.money === true ? '•••' : story.value;

  const save = () => {
    setSaving(true);

    void drawStoryCard(
      {
        period: story.label,
        earned: value,
        meta: story.meta,
        lines: (story.lines ?? []).map((line) => (hidden ? line.replace(/[\d\s]+[^\s]*$/, '•••') : line)),
        rhythm,
        brand: 'shifter.ink',
      },
      currentCardTheme(),
    )
      .then((blob) => downloadBlob(`shifter-${year}-${at + 1}.png`, blob))
      .catch(() => undefined)
      .finally(() => setSaving(false));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-(--surface-1)"
      role="dialog"
      aria-modal="true"
      aria-label={t('Your year')}
    >
      {/* The progress bars, the way a story has them: how many are left is the
          only thing that makes somebody willing to start. */}
      <div className="flex gap-1 p-3">
        {shown.map((entry, index) => (
          <span
            key={entry.label}
            className={`h-1 flex-1 rounded-full ${index <= at ? 'bg-(--accent)' : 'bg-surface-2'}`}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 px-3">
        <button
          type="button"
          className={`btn btn-sm ${hidden ? 'btn-primary' : 'btn-quiet'}`}
          aria-pressed={hidden}
          onClick={() => setHidden((was) => !was)}
        >
          {t('Hide amounts')}
        </button>
        <button type="button" className="btn btn-quiet btn-sm" disabled={saving} onClick={save}>
          <Icon name="download" size={13} />
          {t('Save this card')}
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm ml-auto"
          aria-label={t('Close')}
          onClick={onClose}
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      {/* The whole middle is the advance control, which is how a story works
          on a phone. The arrow keys and the buttons above cover everybody who
          is not holding one. */}
      <button
        type="button"
        className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
        aria-label={t('Next')}
        onClick={() => step(1)}
      >
        <span className="text-[0.8rem] font-bold uppercase tracking-[0.14em] text-(--accent)">
          {story.label}
        </span>
        <span className="text-[clamp(2.6rem,14vw,5.5rem)] font-extrabold leading-none tracking-tight tabular">
          {value}
        </span>
        <span className="max-w-prose text-[1.05rem] text-muted">{story.meta}</span>
      </button>

      <div className="flex justify-between p-3">
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={at === 0}
          onClick={() => step(-1)}
        >
          {t('Back')}
        </button>
        <span className="field-hint self-center tabular">
          {at + 1} / {shown.length}
        </span>
        <button type="button" className="btn btn-sm" onClick={() => step(1)}>
          {t(at === shown.length - 1 ? 'Done' : 'Next')}
        </button>
      </div>
    </div>
  );
}
