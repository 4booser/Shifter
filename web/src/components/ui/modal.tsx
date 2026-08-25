'use client';

import { useEffect, useRef } from 'react';

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
      onClose={onClose}
      onClick={(event) => {
        // The backdrop is painted by the dialog itself, so a click on it
        // reports the dialog as the target.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="card flex max-h-[88vh] flex-col overflow-hidden shadow-(--shadow-lg)">
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[1.02rem] font-semibold">{title}</h2>
          <button type="button" className="btn btn-quiet btn-sm -mr-1.5" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
