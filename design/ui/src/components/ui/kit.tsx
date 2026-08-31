import { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Примитивы макета — в манере shadcn/ui, но на своей палитре.
 *
 * Ни один из них ничего не делает: кнопка не нажимается, поле не вводится,
 * переключатель не переключается. Это макет, и его задача — показать, как
 * выглядит состояние, а не как оно достигается.
 */

/* ── кнопка ───────────────────────────────────────────────────────────── */

const button = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-field)] font-semibold transition-colors select-none',
  {
    variants: {
      tone: {
        // Латунь — единственное действие, которое кричит. На экране их не
        // бывает двух: иначе ни одно не главное.
        go: 'bg-brass text-night hover:bg-brass-lit',
        line: 'border border-paper/17 text-paper hover:bg-paper/5',
        quiet: 'text-dim hover:text-paper',
        danger: 'border border-taken/60 text-taken hover:bg-taken/10',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
        icon: 'size-9',
      },
    },
    defaultVariants: { tone: 'line', size: 'md' },
  },
);

export function Button({
  className,
  tone,
  size,
  children,
}: VariantProps<typeof button> & { className?: string; children: ReactNode }) {
  return <span className={cn(button({ tone, size }), className)}>{children}</span>;
}

/* ── карточка ─────────────────────────────────────────────────────────── */

export function Card({
  title,
  hint,
  right,
  className,
  bodyClass,
  children,
}: {
  title?: string;
  hint?: string;
  right?: ReactNode;
  className?: string;
  bodyClass?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cn('card p-4', className)}>
      {(title !== undefined || right !== undefined) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title !== undefined && <h3 className="text-base font-bold">{title}</h3>}
            {hint !== undefined && <p className="hint mt-0.5">{hint}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/* ── поле ─────────────────────────────────────────────────────────────── */

export function Field({
  label,
  value,
  placeholder,
  area = false,
  className,
}: {
  label?: string;
  value?: string;
  placeholder?: string;
  area?: boolean;
  className?: string;
}) {
  const empty = value === undefined || value === '';

  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label !== undefined && <span className="lbl">{label}</span>}
      <span
        className={cn(
          'flex rounded-[var(--radius-field)] border border-paper/17 bg-night px-3 py-2.5',
          'font-mono text-sm tabular',
          area ? 'min-h-20 items-start font-sans' : 'min-h-10 items-center',
          empty && 'text-faint',
        )}
      >
        {empty ? placeholder : value}
      </span>
    </label>
  );
}

/* ── пилюли ───────────────────────────────────────────────────────────── */

export function Pills({
  options,
  value,
  className,
}: {
  options: string[];
  value?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((option) => (
        <span
          key={option}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium',
            option === value
              ? 'border-brass bg-brass font-semibold text-night'
              : 'border-paper/17 text-dim',
          )}
        >
          {option}
        </span>
      ))}
    </div>
  );
}

/* ── переключатель ────────────────────────────────────────────────────── */

export function Switch({ on = false, label, hint }: { on?: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint !== undefined && <span className="hint">{hint}</span>}
      </span>
      <span
        className={cn(
          'relative h-[22px] w-[38px] flex-none rounded-full border',
          on ? 'border-brass bg-brass' : 'border-paper/17 bg-raised',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] size-3.5 rounded-full',
            on ? 'left-[19px] bg-night' : 'left-[3px] bg-faint',
          )}
        />
      </span>
    </div>
  );
}

/* ── полосы ───────────────────────────────────────────────────────────── */

export interface BarRow {
  name: string;
  under?: string;
  share: number;
  value: string;
  tone?: 'brass' | 'money' | 'taken' | 'quiet';
}

export function Bars({ rows }: { rows: BarRow[] }) {
  const paint = {
    brass: 'bg-brass',
    money: 'bg-money',
    taken: 'bg-taken',
    quiet: 'bg-edge-firm',
  };

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <div
          key={row.name}
          className="grid grid-cols-[minmax(4.5rem,auto)_1fr_minmax(3.5rem,auto)] items-center gap-3"
        >
          <span className="min-w-0">
            <span className="block truncate text-xs">{row.name}</span>
            {row.under !== undefined && <span className="lbl">{row.under}</span>}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-raised">
            <span
              className={cn('block h-full rounded-full', paint[row.tone ?? 'quiet'])}
              style={{ width: `${Math.max(2, row.share)}%` }}
            />
          </span>
          <span className="text-right font-mono text-xs tabular">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── одна полоса, разрезанная на части ────────────────────────────────── */

export function Split({ parts }: { parts: { name: string; share: number; colour: string }[] }) {
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts.map((part) => (
          <span key={part.name} style={{ width: `${part.share}%`, background: part.colour }} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((part) => (
          <span key={part.name} className="flex items-center gap-1.5 text-xs text-dim">
            <span className="size-2 rounded-full" style={{ background: part.colour }} />
            {part.name}
            <b className="font-semibold text-paper tabular">{part.share}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── пустое состояние ─────────────────────────────────────────────────── */

export function Empty({
  glyph,
  title,
  said,
  action,
}: {
  glyph: ReactNode;
  title: string;
  said: string;
  action?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-paper/17 px-6 py-12 text-center">
      <span className="text-brass">{glyph}</span>
      <div>
        <h3 className="text-base font-bold">{title}</h3>
        <p className="hint mx-auto mt-1 max-w-md">{said}</p>
      </div>
      {action !== undefined && <Button tone="go">{action}</Button>}
    </div>
  );
}

/* ── окно поверх экрана ───────────────────────────────────────────────── */

/**
 * Затемнение и окно посередине.
 *
 * Закрывается щелчком по фону и по «Отмена» — единственное поведение, которое
 * каркасу нужно: окно, которое нельзя закрыть, невозможно и посмотреть.
 */
export function Over({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/70 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-[600px]" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ── модальное окно ───────────────────────────────────────────────────── */

export function Modal({
  title,
  said,
  wide = false,
  foot,
  children,
}: {
  title: string;
  said?: string;
  wide?: boolean;
  foot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative grid place-items-center overflow-hidden rounded-[var(--radius-card)] border border-paper/9 bg-night px-5 py-10">
      {/* Свет сверху: окно приподнято над экраном, а не вклеено в него. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% -10%, rgba(224,164,91,0.09), transparent 60%)',
        }}
      />
      <div
        className={cn(
          'relative flex w-full flex-col gap-3.5 rounded-[18px] border border-paper/17 bg-table p-5',
          'shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]',
          wide ? 'max-w-[560px]' : 'max-w-[430px]',
        )}
      >
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          {said !== undefined && <p className="hint mt-0.5">{said}</p>}
        </div>
        {children}
        {foot !== undefined && <div className="mt-1 flex gap-2 [&>*]:flex-1">{foot}</div>}
      </div>
    </div>
  );
}
