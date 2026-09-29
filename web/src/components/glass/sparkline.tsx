/**
 * Seven fixed slots, filled from the right, so three weeks of records take the
 * right three sevenths and never stretch into a full trend. One value is a
 * dot; none draws nothing. `hollowLast` marks a period that is still running.
 */
export function Sparkline({
  values,
  slots = 7,
  hollowLast = false,
  className,
}: {
  values: number[];
  slots?: number;
  hollowLast?: boolean;
  className?: string;
}) {
  const W = 160;
  const H = 28;
  const shown = values.slice(-slots);
  const lo = Math.min(...shown);
  const hi = Math.max(...shown);
  const step = (W - 12) / (slots - 1);
  const x = (i: number) => 6 + (slots - shown.length + i) * step;
  const y = (v: number) => (hi === lo ? H / 2 : H - 4 - ((v - lo) / (hi - lo)) * (H - 8));
  const points = shown.map((v, i) => [x(i), y(v)] as const);
  const line = hollowLast ? points.slice(0, -1) : points;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`h-full w-full ${className ?? ''}`} aria-hidden="true">
      {line.length > 1 && <polyline points={line.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')} className="line-accent" />}
      {line.length === 1 && <circle cx={line[0][0]} cy={line[0][1]} r={3} fill="var(--accent)" />}
      {hollowLast && last !== undefined && (
        <circle cx={last[0]} cy={last[1]} r={3} fill="var(--surface)" stroke="var(--accent)" strokeWidth={1.5} />
      )}
    </svg>
  );
}
