# Components — shared UI primitives

The web front keeps its primitives in `web/src/components/ui/`. They are
deliberately few: identity lives in the `globals.css` classes (`.card`,
`.btn`, `.chip`, `.field-*`), so most "components" in this codebase are a
className away and there is no Button component at all.

## `web/src/components/ui/bits.tsx`

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';

import { useMoney } from '@/lib/settings/money';
import { Icon } from './icon';
import { CountUp as TravelNumber } from './motion';
import { usePalette } from '@/lib/settings/palette';

/** Money as text, following the currency/privacy settings. */
export function Money({
  value,
  className,
  currency,
}: {
  value: number | null | undefined;
  className?: string;
  /**
   * The code this amount is actually in, where it is not the app's own. A
   * place keeps its own currency, and stamping ₴ on złoty is the one kind of
   * mistake about money this app must never make.
   */
  currency?: string | null;
}) {
  const { format, formatIn } = useMoney();

  return (
    <span className={`tabular ${className ?? ''}`}>
      {currency == null ? format(value) : formatIn(currency, value)}
    </span>
  );
}

/**
 * The small arrow beside a number: up in green, down in red, a dash when there
 * is nothing to compare against. Arrow and sign both carry the direction, so
 * the meaning survives without the colour.
 */
export function Delta({ percent, invert = false }: { percent: number | null; invert?: boolean }) {
  if (percent === null) {
    return <span className="text-[0.72rem] text-faint" aria-hidden="true">—</span>;
  }

  // Rounded first, so "+0.4%" never draws a green arrow next to "0%".
  const rounded = Math.round(percent);
  const up = rounded > 0 !== invert && rounded !== 0;
  const down = rounded < 0 !== invert && rounded !== 0;
  // Past a thousand per cent the figure stops being a comparison, and the cap
  // printed «−999%» as though somebody had measured it. It reads «>999%» now,
  // with the arrow carrying the direction the sign gave up.
  const size = Math.abs(rounded);
  const offScale = size >= 1000;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[0.72rem] font-semibold tabular ${
        up ? 'text-good-read' : down ? 'text-danger-read' : 'text-faint'
      }`}
    >
      {rounded !== 0 && <Icon name={rounded > 0 ? 'arrow-up' : 'arrow-down'} size={11} />}
      {offScale ? '>' : rounded > 0 ? '+' : rounded < 0 ? '−' : ''}
      {offScale ? 999 : size}%
    </span>
  );
}

/**
 * Counts a number up to its value when it changes — the motion says "this just
 * recalculated". Money by default; a custom format keeps hours and counters
 * honest. One animation engine for the whole app: the framer CountUp in
 * ui/motion.tsx does the travelling, this wrapper only adds the money default
 * (a second rAF implementation lived here once and the two drifted).
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const { format: money } = useMoney();

  return (
    <span className={`tabular ${className ?? ''}`}>
      <TravelNumber value={value} format={format ?? money} />
    </span>
  );
}

/** A labelled on/off row with the same look everywhere. */
export function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-(--radius) px-1 py-1.5 text-left hover:bg-surface-2"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
    >
      <span
        className="relative h-5 w-9 flex-none rounded-full border transition-colors"
        style={{
          background: on ? 'var(--accent)' : 'var(--surface-2)',
          borderColor: on ? 'var(--accent)' : 'var(--border-strong)',
        }}
      >
        <span
          className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all"
          style={{ left: on ? 'calc(100% - 1.125rem)' : '0.125rem' }}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.9rem]">{label}</span>
        {hint && <span className="field-hint block">{hint}</span>}
      </span>
    </button>
  );
}

/** One row of mutually exclusive options. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: 'sm';
}) {
  return (
    <div className="seg" role="group">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={`seg-btn ${size === 'sm' ? 'px-2 py-1 text-[0.74rem]' : ''} ${
            value === option.value ? 'is-active' : ''
          }`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The calendar swatch strip; empty string is the eraser, null means unset. */
export function SwatchRow({
  colours,
  value,
  onPick,
  clearable = false,
  fold = 8,
  saveable = false,
}: {
  colours: { label: string; value: string }[];
  value: string | null;
  onPick: (value: string) => void;
  clearable?: boolean;
  /** Colours shown up front; the rest sit behind a +N. 0 folds nothing. */
  fold?: number;
  /** Offer the saved palette above the row, and a star to add to it. */
  saveable?: boolean;
}) {
  const { t } = useI18n();
  const [unfolded, setUnfolded] = useState(false);
  const saved = usePalette((state) => state.colours);
  const loadPalette = usePalette((state) => state.load);
  const savePalette = usePalette((state) => state.save);
  const forgetPalette = usePalette((state) => state.forget);

  useEffect(() => {
    if (saveable) loadPalette();
  }, [saveable, loadPalette]);
  // The picked colour must never hide behind the fold — pull it forward.
  const shown =
    unfolded || fold === 0 || colours.length <= fold
      ? colours
      : (() => {
          const head = colours.slice(0, fold);

          if (value !== null && !head.some((option) => option.value === value)) {
            const picked = colours.find((option) => option.value === value);

            if (picked !== undefined) head[fold - 1] = picked;
          }

          return head;
        })();

  const kept = value !== null && saved.includes(value.toUpperCase());

  return (
    <div className="flex flex-col gap-1.5">
      {saveable && saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-faint">
            {t('Mine')}
          </span>
          {saved.map((colour) => (
            <button
              key={colour}
              type="button"
              className={`swatch ${value?.toUpperCase() === colour ? 'is-active' : ''}`}
              style={{ background: colour }}
              title={`${colour} — ${t('long press to forget')}`}
              onClick={() => onPick(colour)}
              onContextMenu={(event) => {
                event.preventDefault();
                forgetPalette(colour);
              }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
      {shown.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`swatch ${value === option.value ? 'is-active' : ''}`}
          style={{ background: option.value }}
          title={option.label}
          aria-pressed={value === option.value}
          onClick={() => onPick(option.value)}
        />
      ))}
      {shown.length < colours.length && (
        <button
          type="button"
          className="swatch grid place-items-center border !border-border-strong bg-surface text-[0.6rem] font-bold text-muted"
          title="More"
          onClick={() => setUnfolded(true)}
        >
          +{colours.length - shown.length}
        </button>
      )}
      {clearable && (
        <button
          type="button"
          className={`swatch grid place-items-center border border-border-strong bg-surface text-muted ${
            value === '' ? 'is-active' : ''
          }`}
          title="Clear"
          onClick={() => onPick('')}
        >
          <Icon name="close" size={12} />
        </button>
      )}

      {/* Keeping a colour is a star, not a menu: one tap while it is picked
          puts it in the palette every picker in the app then offers. */}
      {saveable && value !== null && value !== '' && !kept && (
        <button
          type="button"
          className="swatch grid place-items-center border !border-border-strong bg-surface text-muted"
          title={t('Save this colour')}
          onClick={() => savePalette(value)}
        >
          <span className="text-[0.7rem] font-bold leading-none">+</span>
        </button>
      )}
      </div>
    </div>
  );
}

/** Inline error/notice strips. */
export function Alert({
  kind = 'error',
  children,
  onDismiss,
}: {
  kind?: 'error' | 'good' | 'info';
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const { t } = useI18n();

  const tone =
    kind === 'error'
      ? 'border-danger/30 bg-(--danger-soft) text-danger-read'
      : kind === 'good'
        ? 'border-good/30 bg-(--good-soft) text-good-read'
        : 'border-border bg-surface-2 text-muted';

  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`flex items-center gap-2 rounded-(--radius) border px-3 py-2 text-[0.85rem] ${tone}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {onDismiss && (
        // The icon is decorative, so without a label this reads as just
        // "button" — on nearly every error banner in the app.
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label={t('Dismiss')}
          onClick={onDismiss}
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </p>
  );
}
```

## `web/src/components/ui/icon.tsx`

```tsx
/**
 * Inline SVG icons, stroke follows currentColor. Same set as before plus a few
 * the new layout needs; drawn on a 24-box at 1.8 stroke.
 */

const PATHS: Record<string, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  'chevron-left': <path d="M15 6l-6 6 6 6" />,
  // Buttons that sat in a row of stroked icons wearing a colour emoji
  // instead. An emoji is somebody else's drawing at somebody else's weight,
  // and it changes shape between a Mac and a phone.
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10.5 5.5h3" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.5h3.2l1.6-2.5h7.4l1.6 2.5h3.2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="14" r="3.4" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4L11.4 6.2" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0L5 12.6a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.5s6.5-6.1 6.5-11a6.5 6.5 0 1 0-13 0c0 4.9 6.5 11 6.5 11Z" />
      <circle cx="12" cy="10.5" r="2.5" />
    </>
  ),
  cup: (
    <>
      <path d="M4.5 8h12v7a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8Z" />
      <path d="M16.5 10h1.5a2.5 2.5 0 0 1 0 5h-1.5M6 4.5v1.5M10.5 4v2M15 4.5v1.5" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3.5 21.5 20H2.5L12 3.5Z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  send: <path d="M20.5 3.5 3.5 10.2l6.6 2.7 2.7 6.6L20.5 3.5ZM10.1 12.9l3.8-3.8" />,
  share: (
    <>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="M8.2 10.8 15.8 6.7M8.2 13.2l7.6 4.1" />
    </>
  ),
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="3" />
      <path d="M5 6.5V12c0 1.66 3.13 3 7 3s7-1.34 7-3V6.5M5 12v5.5c0 1.66 3.13 3 7 3s7-1.34 7-3V12" />
    </>
  ),
  note: (
    <>
      <path d="M6 3.5h9.5L20 8v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M15 3.5V8h5M9 12.5h6M9 16h4" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12.5H6L5 8Z" />
      <path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" />
    </>
  ),
  repeat: <path d="M4 9a6 6 0 0 1 6-5h6m0 0-3-3m3 3-3 3M20 15a6 6 0 0 1-6 5H8m0 0 3 3m-3-3 3-3" />,
  brush: (
    <>
      <path d="M14 3l7 7-8.5 8.5a3 3 0 0 1-4.24 0l-2.76-2.76a3 3 0 0 1 0-4.24L14 3Z" />
      <path d="M8 21H3v-5" />
    </>
  ),
  logout: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10" />,
  check: <path d="M4.5 12.5 10 18 19.5 6.5" />,
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M16 15h2" />
    </>
  ),
  sliders: (
    <path d="M5 7h6m4 0h4M5 12h10m4 0h0M5 17h2m4 0h8M11 5v4M17 10v4M9 15v4" strokeLinecap="round" />
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-8M21 20H3" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M4 4l16 16M9.9 5a9.6 9.6 0 0 1 2.1-.23c6 0 9.5 7.23 9.5 7.23a17.6 17.6 0 0 1-3.14 4M6.6 6.6C4 8.4 2.5 12 2.5 12S6 19.23 12 19.23a9.3 9.3 0 0 0 5.4-1.83" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7m3 0-1 13.5H7L6 7M10 11v6M14 11v6" />,
  flame: <path d="M12 2.5s6.5 5.3 6.5 11a6.5 6.5 0 0 1-13 0c0-2 1-4 2.5-5.5 0 2 .8 3 2 3.5C9.5 8 10.5 5 12 2.5Z" />,
  trophy: (
    <>
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H4.5v1.5A3.5 3.5 0 0 0 8 10M16 5h3.5v1.5A3.5 3.5 0 0 1 16 10M12 14v4m-4 3h8m-6.5-3h5" />
    </>
  ),
  'arrow-up': <path d="M12 19V5m0 0-6 6m6-6 6 6" />,
  'arrow-down': <path d="M12 5v14m0 0-6-6m6 6 6-6" />,
  spark: <path d="M12 2.5 14 9l6.5 2-6.5 2.5L12 20l-2-6.5L3.5 11 10 9l2-6.5Z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.4a3.5 3.5 0 0 1 0 6.2M18.5 14.5c1.9.9 2.5 2.9 2.5 5.5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c0-4.1 3.4-7 7.5-7s7.5 2.9 7.5 7" />
    </>
  ),
  swap: <path d="M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3" />,
  moon: <path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a7 7 0 0 0 9.5 9.5Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  download: <path d="M12 4v10m0 0-4-4m4 4 4-4M5 20h14" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" />
    </>
  ),
  shield: (
    <path d="M12 3 5 6v5c0 4.4 3 8.4 7 10 4-1.6 7-5.6 7-10V6l-7-3zM9 11.5l2 2 4-4.5" />
  ),
  doc: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15.5" r="4.5" />
      <path d="m11.5 12 8.5-8.5M17 6.5 20 9.5M14.5 9l2 2" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ flex: 'none' }}
    >
      {PATHS[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}
```

## `web/src/components/ui/empty.tsx`

```tsx
'use client';

import Link from 'next/link';

import { Icon } from '@/components/ui/icon';

/**
 * What a tab says before it has anything to say. Every empty screen answers
 * the same two questions — what is this for, and what do I press — because a
 * blank panel with one grey sentence teaches nobody anything and reads like
 * something failed to load.
 */
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  /** The one thing worth doing from here. A link, or a button that does it. */
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className="card reveal flex flex-col items-center gap-2 p-8 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-(--accent-soft) text-(--accent-read)">
        <Icon name={icon} size={20} />
      </span>

      <p className="text-[1.02rem] font-bold">{title}</p>
      <p className="field-hint max-w-[34rem]">{children}</p>

      {action !== undefined &&
        (action.href !== undefined ? (
          <Link href={action.href} className="btn btn-primary mt-1.5">
            {action.label}
          </Link>
        ) : (
          <button type="button" className="btn btn-primary mt-1.5" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
```

## `web/src/components/ui/modal.tsx`

```tsx
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
```

## `web/src/components/ui/flow.tsx`

```tsx
'use client';

import NumberFlow from '@number-flow/react';

import { useSettings } from '@/lib/settings/store';

/**
 * A KPI number that travels to its new value instead of teleporting.
 *
 * Big tiles only, on purpose: these are the figures that change while the
 * person watches — a period marked paid, a preset switched, a live shift
 * ticking — and the travel shows the change happening. Rows and tables
 * stay still; a page where every figure dances reads as a slot machine,
 * not a ledger.
 */
export function FlowMoney({
  value,
  className,
  mark,
}: {
  value: number | null | undefined;
  className?: string;
  /**
   * The mark this amount is actually in, where it is not the label the person
   * picked for wages. A bank statement is in the account's own currency and
   * must keep saying so.
   *
   * It used to force the mark in front of the figure as well, which is a
   * separate question and one the person has already answered: «На карте
   * ₴84 214» stood two lines above «минимум 84 214 ₴», the same number
   * spelled two ways inside one card. Which currency is the statement's
   * business; which side of the digits it stands on is the reader's.
   */
  mark?: string;
}) {
  const settings = useSettings((state) => state.settings);
  const { hideAmounts } = settings;
  const currency = mark ?? settings.currency;
  const currencyBefore = settings.currencyBefore;

  // The mask keeps the currency mark so a hidden value still reads as money —
  // and never mounts the animated element, so nothing can flash a real digit.
  if (hideAmounts) {
    return (
      <span className={`tabular ${className ?? ''}`.trim()}>
        {currencyBefore ? `${currency}•••` : `••• ${currency}`}
      </span>
    );
  }

  // The sign stands in front of the whole thing — «−₴458», never «₴-458» —
  // matching formatMoney, which learned this the same night.
  const amount = value ?? 0;
  const sign = amount < 0 ? '−' : '';

  return (
    <NumberFlow
      className={`tabular ${className ?? ''}`.trim()}
      value={Math.abs(amount)}
      locales={settings.language}
      format={{
        minimumFractionDigits: 0,
        maximumFractionDigits: settings.moneyDecimals,
        useGrouping: settings.groupThousands,
      }}
      prefix={currencyBefore && currency !== '' ? `${sign}${currency}` : sign === '' ? undefined : sign}
      suffix={!currencyBefore && currency !== '' ? ` ${currency}` : undefined}
    />
  );
}
```

## `web/src/components/ui/skeleton.tsx`

```tsx
/**
 * The shape of what is coming, instead of a sentence about it. A block the
 * size of the real thing keeps the page from jumping when the data lands,
 * and a short stack reads as «a list is on its way» without pretending to
 * be the list.
 */
export function Skeleton({ height, className }: { height?: string; className?: string }) {
  return <div aria-hidden className={`skeleton ${className ?? ''}`.trim()} style={{ height }} />;
}

export function SkeletonRows({
  rows = 3,
  height = '3.5rem',
  className,
}: {
  rows?: number;
  height?: string;
  className?: string;
}) {
  return (
    <div aria-busy="true" className={`flex flex-col gap-2 ${className ?? ''}`.trim()}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={height} className="w-full" />
      ))}
    </div>
  );
}
```

## `web/src/components/ui/avatar.tsx`

```tsx
'use client';

import { useEffect, useRef } from 'react';

/**
 * The face used everywhere a person appears. Three kinds:
 * photo — a small JPEG data URL; preset — "emoji|#colour"; weave — a
 * deterministic thread pattern grown from a seed (for us: the person's own
 * punch-card), unique the way a work schedule is. Fallback: initials.
 */
export function Avatar({
  kind,
  data,
  name,
  size = 32,
}: {
  kind: string | null;
  data: string | null;
  name: string;
  size?: number;
}) {
  if (kind === 'photo' && data !== null) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={data} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }

  if (kind === 'preset' && data !== null && data.includes('|')) {
    const [emoji, colour] = data.split('|');

    return (
      <span
        className="grid flex-none place-items-center rounded-full"
        style={{ width: size, height: size, background: colour, fontSize: size * 0.55 }}
        aria-hidden
      >
        {emoji}
      </span>
    );
  }

  if (kind === 'weave' && data !== null) {
    return <Weave seed={data} size={size} />;
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <span
      className="grid flex-none place-items-center rounded-full bg-(--accent) font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {initials || '•'}
    </span>
  );
}

/** Tiny deterministic PRNG so the same seed always weaves the same cloth. */
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An avatar woven from a schedule. The seed encodes 7×4 intensity cells
 * (the person's real hours by weekday × week); threads run vertical for
 * worked weight, horizontal for the accent, giving everyone a cloth as
 * individual as their rota. Falls back to hashing the raw seed string.
 */
export function Weave({ seed, size = 32 }: { seed: string; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;

    if (node === null) return;

    const scale = 2;
    const px = size * scale;

    node.width = px;
    node.height = px;

    const ctx = node.getContext('2d');

    if (ctx === null) return;

    let hash = 0;

    for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;

    const random = mulberry(hash);
    const accentHue = Math.floor(random() * 360);
    const cells = seed.match(/\d/g)?.map(Number) ?? [];

    ctx.fillStyle = `oklch(0.24 0.03 ${accentHue})`;
    ctx.fillRect(0, 0, px, px);

    const bands = 9;
    const band = px / bands;

    for (let i = 0; i < bands; i++) {
      // Weight from real schedule digits where present; woven noise otherwise.
      const weight = cells.length > 0 ? (cells[i % cells.length] ?? 0) / 9 : random();
      const vertical = i % 2 === 0;
      const light = 0.45 + weight * 0.4;

      ctx.fillStyle = `oklch(${light} ${0.11 + weight * 0.12} ${(accentHue + (vertical ? 0 : 40)) % 360})`;

      if (vertical) ctx.fillRect(i * band, 0, band * 0.72, px);
      else ctx.fillRect(0, i * band, px, band * 0.72);
    }
  }, [seed, size]);

  return <canvas ref={canvas} className="flex-none rounded-full" style={{ width: size, height: size }} aria-hidden />;
}
```

## `web/src/components/ui/motion.tsx`

```tsx
'use client';

import { animate, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';

/**
 * The app's motion vocabulary, kept deliberately small.
 *
 * Numbers roll to their values, cards rise once, charts draw themselves in.
 * Three verbs, used consistently, read as one product; a different easing on
 * every screen reads as a template. Everything here collapses to stillness
 * under prefers-reduced-motion, because motion is seasoning and some people
 * have asked the OS to hold it.
 */

/**
 * A number that rolls to its value.
 *
 * The rolling is presentation only: the DOM lands on the exact figure, and
 * anyone copying it copies the truth. Formatting is injected so this stays
 * ignorant of currencies and locales.
 */
export function CountUp({
  value,
  format,
  duration = 0.9,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const still = useReducedMotion();
  const previous = useRef(0);

  /*
   * `format` держим в ref, а не в зависимостях.
   *
   * Вызывающие передают его стрелкой прямо в JSX, и на каждом рендере это
   * новая функция — эффект перезапускался постоянно. Отменённая анимация
   * успевала дописать своё число поверх нового, и на отчёте за август
   * «Заработано» показывало 0 ₴ при 22 отработанных днях и ₴39 638 на руки:
   * React передавал 47 485,9, а в узел попадал ноль от прошлого месяца.
   */
  const shape = useRef(format);

  shape.current = format;

  useEffect(() => {
    const node = host.current;

    if (node === null) return;

    /*
     * Ни анимации, ни половины числа в фоновой вкладке.
     *
     * Скрытая вкладка не получает кадров rAF: прогон замирает там, где его
     * застали, и на панели остаётся «10 679 ₴» вместо 22 230 и «59.3» вместо
     * 123.5 — ровно 48% пути у всех тайлов разом. Пока никто не смотрит,
     * катиться незачем, а вот показывать середину пути нельзя никогда.
     */
    if (still === true || document.visibilityState === 'hidden') {
      node.textContent = shape.current(value);
      previous.current = value;

      return;
    }

    // Остановленная анимация не имеет права писать: без этого флага
    // последний кадр отменённого прогона выигрывает гонку у актуального.
    let live = true;

    const controls = animate(previous.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        if (live) node.textContent = shape.current(latest);
      },
      onComplete: () => {
        if (live) node.textContent = shape.current(value);
      },
    });

    previous.current = value;

    return () => {
      live = false;
      controls.stop();
    };
  }, [value, duration, still]);

  // The real value is in the DOM before any animation runs, so a crawler, a
  // screen reader or a paused tab all read the truth.
  return <span ref={host}>{format(value)}</span>;
}

/** A card that rises into place once, in the app's one easing. */
export function Rise({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const still = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={still === true ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** An SVG path that draws itself left to right. */
export function DrawnPath(props: React.ComponentProps<typeof motion.path>) {
  const still = useReducedMotion();

  return (
    <motion.path
      {...props}
      initial={still === true ? false : { pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
    />
  );
}
```

