'use client';

import { ReactNode } from 'react';

/**
 * The one container every chart lives in — the fix for "графики по размеру
 * не подходят". A chart never chooses its own size again: the card names an
 * aspect, the plot fills it, headers and legends sit on one grid, and an
 * empty window collapses to a single quiet line instead of a page of air.
 */
export type ChartAspect = 'strip' | 'wide' | 'column' | 'square';

const ASPECT: Record<ChartAspect, string> = {
  /** 16:5 — cumulative ribbons (brief, pace). */
  strip: 'aspect-[16/5]',
  /** 16:9 — the general plot. */
  wide: 'aspect-[16/9]',
  /** 4:3 — bars with labels under them. */
  column: 'aspect-[4/3]',
  /** 1:1 — rings and clocks. */
  square: 'aspect-square',
};

export function ChartCard({
  title,
  hint,
  right,
  aspect = 'wide',
  empty = null,
  footer,
  children,
}: {
  title: string;
  hint?: string;
  /** A figure or an action pinned to the header's right edge. */
  right?: ReactNode;
  aspect?: ChartAspect;
  /**
   * A sentence when there is nothing honest to draw. Non-null collapses the
   * card to the header plus this line — 40px of truth instead of 300px of
   * skeleton bars.
   */
  empty?: string | null;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="panel flex flex-col p-4">
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[0.95rem] font-bold">{title}</h2>
          {hint !== undefined && <p className="mt-0.5 text-[0.75rem] text-muted">{hint}</p>}
        </div>
        {right !== undefined && <div className="shrink-0 tabular text-[0.9rem] font-semibold">{right}</div>}
      </header>

      {empty !== null ? (
        <p className="mt-1 rounded-lg border border-dashed border-border px-3 py-2 text-[0.8rem] text-muted">
          {empty}
        </p>
      ) : (
        <>
          <div className={`chart-grow relative w-full ${ASPECT[aspect]}`}>{children}</div>
          {footer !== undefined && <div className="mt-2 text-[0.72rem] text-muted">{footer}</div>}
        </>
      )}
    </section>
  );
}
