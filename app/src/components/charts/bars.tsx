import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Bars read as rows.
 *
 * Laid out with grid rather than SVG: the label, the bar and the figure line
 * up as three columns, the numbers stay selectable text, and nothing has to
 * be re-measured when the panel changes width. The bar is the comparison; the
 * figure beside it is the answer.
 */
export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** What to print at the end of the row. The value, said properly. */
  shown: string;
  /** A second line under the label, where the row needs a caveat. */
  hint?: string;
  colour?: string;
}

export function Bars({
  rows,
  empty = 'Пока нечего показать.',
  highlight,
}: {
  rows: BarRow[];
  empty?: string;
  /** The row worth pointing at — drawn in the accent, the rest in a quiet ink. */
  highlight?: string;
}) {
  if (rows.length === 0) return <p className="field-hint">{empty}</p>;

  const peak = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(4.5rem,auto)_1fr_auto] items-center gap-2">
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium" title={row.label}>{row.label}</span>
            {row.hint !== undefined && <span className="field-hint">{row.hint}</span>}
          </span>

          <span className="h-2.5 min-w-0 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(2, (Math.abs(row.value) / peak) * 100)}%`,
                background:
                  row.colour ??
                  (highlight === row.key ? 'var(--accent)' : 'var(--border-strong)'),
              }}
            />
          </span>

          <span className="text-xs font-semibold tabular">{row.shown}</span>
        </li>
      ))}
    </ul>
  );
}

export interface SplitPart {
  key: string;
  label: string;
  value: number;
  colour: string;
}

/**
 * One bar cut into what it is made of, with the parts named underneath.
 *
 * A two-pixel gap of the page's own ground between segments, so touching
 * colours stay two things rather than one gradient. Parts too thin to see are
 * still named in the legend — the point of the chart is often the sliver.
 */
export function Split({ parts, total }: { parts: SplitPart[]; total: string }) {
  const shown = parts.filter((part) => part.value > 0);
  const sum = shown.reduce((all, part) => all + part.value, 0);

  if (sum <= 0) return <p className="field-hint">Пока не из чего складываться.</p>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tabular">{total}</span>
      </div>

      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {shown.map((part) => (
          <span
            key={part.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(part.value / sum) * 100}%`, background: part.colour }}
          />
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {shown.map((part) => (
          <li key={part.key} className="flex items-center gap-1.5">
            <span
              className="size-2 flex-none rounded-full"
              style={{ background: part.colour }}
            />
            <span className="text-xs text-muted-foreground">{part.label}</span>
            <span className="text-xs font-semibold tabular">
              {Math.round((part.value / sum) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A card with one question at the top of it. */
export function Panel({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('card flex flex-col gap-3 p-4', className)}>
      <div>
        <h2 className="text-sm font-bold">{title}</h2>
        {hint !== undefined && <p className="field-hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
