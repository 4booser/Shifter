/**
 * Vertical bars on one linear scale: rounded at the data end only, a 2px
 * surface gap between neighbours, the maximum and the last value labelled,
 * at most four hairlines. `second` draws a paired series beside each bar.
 */
export function Bars({
  items,
  max,
  height = 180,
  yTicks,
  format,
  labelMax = true,
  labelLast = false,
  emphasis,
  label,
}: {
  items: { label: string; value: number; second?: number; muted?: boolean; dashed?: boolean }[];
  max?: number;
  height?: number;
  yTicks?: { value: number; label: string }[];
  format: (value: number) => string;
  labelMax?: boolean;
  labelLast?: boolean;
  /** Indices drawn in full accent; the rest use the third heat step. */
  emphasis?: number[];
  label?: string;
}) {
  const W = 600;
  const H = height;
  const PAD_T = 22;
  const PAD_B = 26;
  const PAD_R = 46;
  const top = max ?? Math.max(1, ...items.map((i) => Math.max(i.value, i.second ?? 0)));
  const slot = (W - PAD_R) / Math.max(1, items.length);
  const paired = items.some((i) => i.second !== undefined);
  const bw = Math.min(paired ? 18 : 28, slot * (paired ? 0.36 : 0.6));
  const sy = (v: number) => PAD_T + (1 - v / top) * (H - PAD_T - PAD_B);
  const maxIndex = items.reduce((best, item, i) => (item.value > items[best].value ? i : best), 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label={label}>
      {(yTicks ?? []).slice(0, 4).map((tick) => (
        <g key={tick.label}>
          <line x1={0} y1={sy(tick.value)} x2={W - PAD_R} y2={sy(tick.value)} className="chart-grid" />
          <text x={W - PAD_R + 6} y={sy(tick.value) + 4} className="axis">
            {tick.label}
          </text>
        </g>
      ))}
      {items.map((item, i) => {
        const cx = slot * i + slot / 2;
        const x = paired ? cx - bw - 1 : cx - bw / 2;
        const y = sy(item.value);
        const h = Math.max(0, sy(0) - y);
        const fill = item.muted ? 'var(--surface-2)' : emphasis === undefined || emphasis.includes(i) ? 'var(--accent)' : 'var(--heat-3)';
        const labelled = (labelMax && i === maxIndex) || (labelLast && i === items.length - 1);

        return (
          <g key={item.label}>
            {h > 0 && (
              <path
                d={`M ${x} ${sy(0)} V ${y + 4} Q ${x} ${y} ${x + 4} ${y} H ${x + bw - 4} Q ${x + bw} ${y} ${x + bw} ${y + 4} V ${sy(0)} Z`}
                fill={fill}
                stroke={item.dashed ? 'var(--accent)' : 'none'}
                strokeDasharray={item.dashed ? '3 3' : undefined}
              />
            )}
            {item.second !== undefined && item.second > 0 && (
              <path
                d={`M ${cx + 1} ${sy(0)} V ${sy(item.second) + 4} Q ${cx + 1} ${sy(item.second)} ${cx + 5} ${sy(item.second)} H ${cx + bw - 3} Q ${cx + bw + 1} ${sy(item.second)} ${cx + bw + 1} ${sy(item.second) + 4} V ${sy(0)} Z`}
                fill="var(--s3)"
              />
            )}
            {labelled && item.value > 0 && (
              <text x={paired ? x + bw / 2 : cx} y={y - 6} textAnchor="middle" className="axis" fill="var(--text)" fontWeight={700}>
                {format(item.value)}
              </text>
            )}
            <text x={cx} y={H - 8} textAnchor="middle" className="axis">
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** A horizontal share bar in a well: `share` 0..1, rounded at the data end. */
export function ShareBar({ share, tone = 'accent', className }: { share: number; tone?: 'accent' | 's1' | 's2' | 's3' | 'danger'; className?: string }) {
  const colour = tone === 'accent' ? 'var(--accent)' : tone === 'danger' ? 'var(--danger)' : `var(--${tone})`;

  return (
    <div className={`glass-well h-2 overflow-hidden ${className ?? ''}`}>
      <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(0, Math.min(100, share * 100))}%`, background: colour }} />
    </div>
  );
}
