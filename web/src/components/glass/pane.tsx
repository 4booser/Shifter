import type { CSSProperties, ReactNode } from 'react';

/**
 * A glass pane: what it is on the left, one control or figure on the right,
 * the body, and a footer fact pinned to the bottom so neighbours in a row
 * line up. `hero` is the thick pane (one per screen); `overOrb` raises the
 * surface where the pane lies over the brightest orb.
 */
export function Pane({
  title,
  hint,
  aside,
  footer,
  hero = false,
  overOrb = false,
  order,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  hint?: string;
  aside?: ReactNode;
  footer?: ReactNode;
  hero?: boolean;
  overOrb?: boolean;
  /** Position in the page-load stagger. */
  order?: number;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`glass pane rise ${hero ? 'glass-hero' : ''} ${overOrb ? 'glass-over-orb' : ''} ${className ?? ''}`}
      style={order === undefined ? undefined : ({ '--order': order } as CSSProperties)}
    >
      {(title !== undefined || aside !== undefined) && (
        <header className="pane-head">
          <div className="min-w-0">
            {title !== undefined && <h2 className="pane-title">{title}</h2>}
            {hint !== undefined && <p className="pane-hint">{hint}</p>}
          </div>
          {aside !== undefined && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
        </header>
      )}
      <div className={`pane-body ${bodyClassName ?? ''}`}>
        {children}
        {footer !== undefined && <p className="pane-footer">{footer}</p>}
      </div>
    </section>
  );
}

/** A pane with nothing to show does not exist as a box: it is this one line, with the action that would fill it. */
export function Strip({
  children,
  action,
  order,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  order?: number;
  className?: string;
}) {
  return (
    <div
      className={`glass pane rise flex-row items-center justify-between gap-3 px-4 py-3 text-[0.85rem] ${className ?? ''}`}
      style={order === undefined ? undefined : ({ '--order': order } as CSSProperties)}
    >
      <span className="min-w-0 text-muted">{children}</span>
      {action !== undefined && <span className="shrink-0">{action}</span>}
    </div>
  );
}

/** A twelve-column row; children carry `col-span-*` (8+4, 6+6, 4+4+4) and stretch to one height. */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12 ${className ?? ''}`}>{children}</div>;
}

/** A capsule control or chip on glass; `active` makes it solid accent. */
export function Pill({
  children,
  active = false,
  className,
  tone,
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
  tone?: 'good' | 'warn' | 'danger';
}) {
  const ink =
    tone === 'good' ? 'text-good-read' : tone === 'warn' ? 'text-warn-read' : tone === 'danger' ? 'text-danger-read' : '';

  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 text-[0.74rem] font-semibold tabular ${
        active ? 'active-pill rounded-full' : `glass-pill ${ink}`
      } ${className ?? ''}`}
    >
      {children}
    </span>
  );
}
