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
        up ? 'text-good' : down ? 'text-danger' : 'text-faint'
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
      ? 'border-danger/30 bg-(--danger-soft) text-danger'
      : kind === 'good'
        ? 'border-good/30 bg-(--good-soft) text-good'
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
