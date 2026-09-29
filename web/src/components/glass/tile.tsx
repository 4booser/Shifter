import type { CSSProperties, ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';

import { Sparkline } from './sparkline';

/**
 * The figure with its label above, a delta chip, a seven-slot sparkline in a
 * well and a footer fact. `hero` makes it the one accent-coloured figure of
 * the screen. `delta` null means «nothing to compare with» and shows «—».
 */
export function Tile({
  label,
  icon,
  figure,
  delta,
  spark,
  sparkHollowLast = false,
  sparkEmpty,
  footer,
  hero = false,
  order,
  className,
}: {
  label: string;
  icon?: string;
  figure: ReactNode;
  /** A percentage, or null for «—», or a ready string such as «+₴210». */
  delta?: number | string | null;
  spark?: number[];
  sparkHollowLast?: boolean;
  /** What the well says when there is nothing to draw. */
  sparkEmpty?: string;
  footer?: ReactNode;
  hero?: boolean;
  order?: number;
  className?: string;
}) {
  const deltaClass =
    typeof delta === 'number' ? (delta > 0 ? 'delta delta-up' : delta < 0 ? 'delta delta-down' : 'delta') : 'delta';
  const deltaText =
    delta === null || delta === undefined
      ? '—'
      : typeof delta === 'number'
        ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(Math.round(delta))}%`
        : delta;

  return (
    <section
      className={`glass pane rise p-3 ${hero ? 'glass-hero glass-over-orb' : ''} ${className ?? ''}`}
      style={order === undefined ? undefined : ({ '--order': order } as CSSProperties)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
          <span className="truncate">{label}</span>
          {delta !== undefined && <span className={deltaClass}>{deltaText}</span>}
        </span>
        {icon !== undefined && <Icon name={icon} size={15} className="shrink-0 text-muted" />}
      </div>
      <div className={`figure mt-2 ${hero ? 'hero-figure text-(--accent-read)' : 'tile-figure'}`}>{figure}</div>
      {(spark !== undefined || sparkEmpty !== undefined) && (
        <div className="glass-well mt-3 flex h-10 items-center px-1.5 py-1">
          {spark !== undefined && spark.length > 0 ? (
            <Sparkline values={spark} hollowLast={sparkHollowLast} />
          ) : (
            <span className="px-1 text-[0.7rem] text-faint">{sparkEmpty}</span>
          )}
        </div>
      )}
      {footer !== undefined && <p className="pane-footer">{footer}</p>}
    </section>
  );
}
