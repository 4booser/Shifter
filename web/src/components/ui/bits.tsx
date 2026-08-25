'use client';

import { useEffect, useRef, useState } from 'react';

import { useMoney } from '@/lib/settings/money';
import { Icon } from './icon';

/** Money as text, following the currency/privacy settings. */
export function Money({ value, className }: { value: number | null | undefined; className?: string }) {
  const { format } = useMoney();

  return <span className={`tabular ${className ?? ''}`}>{format(value)}</span>;
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
  const capped = Math.min(999, Math.abs(rounded));

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[0.72rem] font-semibold tabular ${
        up ? 'text-good' : down ? 'text-danger' : 'text-faint'
      }`}
    >
      {rounded !== 0 && <Icon name={rounded > 0 ? 'arrow-up' : 'arrow-down'} size={11} />}
      {rounded > 0 ? '+' : rounded < 0 ? '−' : ''}
      {capped}%
    </span>
  );
}

/**
 * Counts a number up to its value when it changes — the motion says "this just
 * recalculated". Honours reduced motion by jumping straight to the end.
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
  const show = format ?? money;
  const [frame, setFrame] = useState(value);
  const from = useRef(0);

  useEffect(() => {
    const reduced = document.documentElement.dataset['motion'] === 'reduced';

    if (reduced) {
      from.current = value;
      setFrame(value);

      return;
    }

    const start = performance.now();
    const origin = from.current;
    const duration = 650;
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;

      setFrame(origin + (value - origin) * eased);

      if (progress < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={`tabular ${className ?? ''}`}>{show(frame)}</span>;
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
}: {
  colours: { label: string; value: string }[];
  value: string | null;
  onPick: (value: string) => void;
  clearable?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colours.map((option) => (
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
        <button type="button" className="btn btn-quiet btn-sm" onClick={onDismiss}>
          <Icon name="close" size={13} />
        </button>
      )}
    </p>
  );
}
