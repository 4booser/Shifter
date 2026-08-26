'use client';

import { useState } from 'react';

import { useI18n } from '@/lib/i18n';
import { pluralWord } from '@/lib/i18n/plural';

/**
 * "5 минут назад" that flips to the exact date on a tap and back. Relative
 * time answers the question people actually have — is this listing fresh —
 * and the absolute date stays one tap away for the sceptics.
 */
export function TimeAgo({ iso }: { iso: string }) {
  const { t, lang } = useI18n();
  const [exact, setExact] = useState(false);

  const then = new Date(iso);
  const minutes = Math.max(0, Math.floor((Date.now() - then.getTime()) / 60_000));

  let relative: string;

  if (minutes < 1) relative = t('just now');
  else if (minutes < 60) relative = `${minutes} ${pluralWord(lang, 'minutes', minutes)} ${t('ago')}`;
  else if (minutes < 60 * 24) {
    const hours = Math.floor(minutes / 60);

    relative = `${hours} ${pluralWord(lang, 'hours', hours)} ${t('ago')}`;
  } else {
    const days = Math.floor(minutes / (60 * 24));

    relative = `${days} ${pluralWord(lang, 'days', days)} ${t('ago')}`;
  }

  return (
    <button
      type="button"
      className="cursor-pointer whitespace-nowrap text-faint underline decoration-dotted underline-offset-2 hover:text-muted"
      title={exact ? relative : then.toLocaleString(lang)}
      onClick={(event) => {
        event.stopPropagation();
        setExact((value) => !value);
      }}
    >
      {exact
        ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(then)
        : relative}
    </button>
  );
}
