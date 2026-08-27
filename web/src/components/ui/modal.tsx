'use client';

import { useEffect, useId, useRef } from 'react';

import { useI18n } from '@/lib/i18n';
import { Icon } from './icon';

/**
 * Wraps the native dialog element, which brings the backdrop, Escape handling,
 * focus trapping and inertness of the page behind it for free.
 */
export function Modal({
  open,
  title,
  wide = false,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();

  // Without this every modal in the app announces itself as "dialog" and
  // nothing else — the heading is right there on screen and was never
  // connected to it.
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;

    if (dialog === null) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'is-wide' : ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // The backdrop is painted by the dialog itself, so a click on it
        // reports the dialog as the target.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="card flex max-h-[88vh] flex-col overflow-hidden shadow-(--shadow-lg)">
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 id={titleId} className="text-[1.02rem] font-semibold">{title}</h2>
          <button type="button" className="btn btn-quiet btn-sm -mr-1.5" onClick={onClose} aria-label={t('Close')}>
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
