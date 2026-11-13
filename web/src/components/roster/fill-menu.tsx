'use client';

import { useEffect, useRef, useState } from 'react';

import { fromKey } from '@/lib/calendar/calendar-date';
import { useEscape } from '@/lib/a11y';
import { useI18n } from '@/lib/i18n';
import { useArmed } from '@/lib/live/arm';
import { Icon } from '@/components/ui/icon';

/** A button of the month's toolbar: snug on a phone, where the three of them share one row at 360 px, «Налаштування» included. */
export const TOOLBAR_BUTTON = 'btn btn-sm max-sm:!gap-1 max-sm:!px-1.5 max-sm:!text-[0.75rem]';

/** The leading icon of a toolbar button. Under 360 px the words alone fit the row, down to 320 in Ukrainian; with the icons they did not. */
export const TOOLBAR_ICON = 'max-[360px]:hidden';

/**
 * The ways to fill a month, in one menu: by everybody's working days first,
 * since copying last month by weekday breaks a 2/2 rhythm, then last month,
 * then starting over. Filling and clearing both start at the owner's today, so
 * a month already over has only the copy left.
 */
export function FillMenu({
  over,
  from,
  busy,
  onFill,
  onRepeat,
  onClear,
}: {
  /** The month is already over. */
  over: boolean;
  /** yyyy-MM-dd, where filling and clearing start; null for a month already over. */
  from: string | null;
  busy: boolean;
  onFill: () => void;
  onRepeat: () => void;
  onClear: () => void;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);

  const close = () => setOpen(false);
  const clear = useArmed(() => {
    close();
    onClear();
  });

  // Focus can be outside it, say after a press on the page; then the page's Escape is the one.
  useEscape(open, close);

  // A press anywhere else puts it away, as a menu does.
  useEffect(() => {
    if (!open) return;

    const away = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', away);

    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const choose = (act: () => void) => () => {
    close();
    act();
  };

  const date = from === null ? '' : new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(fromKey(from));
  const overTitle = over ? t('That month is over.') : undefined;

  if (busy) {
    return (
      <button type="button" className={TOOLBAR_BUTTON} disabled>
        <Icon name="spark" size={14} className={TOOLBAR_ICON} />
        {t('Fill in')}
        <Icon name="chevron-right" size={12} className="rotate-90" />
      </button>
    );
  }

  return (
    <details
      ref={menu}
      className="relative"
      open={open}
      onKeyDown={(event) => {
        // Escape here is the menu's: it must not also put down the tool in hand.
        // React listens on the document itself, beside the page's own Escape and
        // ahead of it, so only stopping the others there keeps it from running.
        // The element's own word, since its toggle reaches the state a moment later.
        if (event.key !== 'Escape' || !event.currentTarget.open) return;

        event.nativeEvent.stopImmediatePropagation();
        close();
      }}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);

        if (!event.currentTarget.open) clear.disarm();
      }}
    >
      <summary className={`${TOOLBAR_BUTTON} list-none`}>
        <Icon name="spark" size={14} className={TOOLBAR_ICON} />
        {t('Fill in')}
        <Icon name="chevron-right" size={12} className={`transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </summary>

      <div className="card absolute left-0 z-30 mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col p-1.5 shadow-(--shadow-lg)">
        <button
          type="button"
          className="flex flex-col items-start rounded px-2.5 py-2 text-left hover:bg-surface-2 disabled:opacity-50 disabled:hover:bg-transparent"
          disabled={over}
          title={overTitle}
          onClick={choose(onFill)}
        >
          <span className="text-[0.88rem] font-semibold">{t('By working days')}</span>
          <span className="field-hint">{t('Each person on their days and hours')}</span>
        </button>
        <button
          type="button"
          className="rounded px-2.5 py-2 text-left text-[0.88rem] font-semibold hover:bg-surface-2"
          onClick={choose(onRepeat)}
        >
          {t('As last month')}
        </button>

        <hr className="my-1 border-border" />

        <button
          type="button"
          className={`rounded px-2.5 py-2 text-left text-[0.88rem] disabled:opacity-50 ${clear.armed ? 'btn-armed' : 'text-danger-read hover:bg-surface-2'}`}
          disabled={over}
          title={overTitle}
          onClick={clear.press}
        >
          {clear.armed ? `${t('Press again to clear shifts from')} ${date}` : t('Clear the month')}
        </button>
      </div>
    </details>
  );
}
