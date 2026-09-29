/**
 * One linear scale per axis, at most four hairlines, an area that ends at the
 * last recorded point, the last value labelled, and — only when the page says
 * so — a dashed continuation and a goal line. Everything is drawn in tokens.
 */
export interface LinePoint {
  /** Position on the x axis in the chart's own unit (a day index, a week). */
  x: number;
  y: number;
}

export function LineChart({
  points,
  xMax,
  yMax,
  yTicks,
  xTicks,
  lastLabel,
  muted,
  goal,
  forecast,
  today,
  height = 300,
  legend,
  label,
}: {
  points: LinePoint[];
  xMax: number;
  yMax: number;
  /** Values with their labels; at most four are drawn. */
  yTicks: { value: number; label: string }[];
  xTicks: { value: number; label: string }[];
  lastLabel?: string;
  /** The previous period, in muted ink. */
  muted?: LinePoint[];
  goal?: { value: number; label: string };
  /** A dashed line from the last point, drawn only when the caller has enough records. */
  forecast?: { to: LinePoint; label: string };
  today?: number;
  height?: number;
  legend?: { label: string; kind: 'accent' | 'muted' | 'goal' | 'forecast' }[];
  label?: string;
}) {
  const W = 760;
  const H = height;
  const PAD_L = 58;
  const PAD_R = 24;
  const PAD_T = 22;
  const PAD_B = 30;
  const sx = (x: number) => PAD_L + (x / Math.max(1, xMax)) * (W - PAD_L - PAD_R);
  const sy = (y: number) => PAD_T + (1 - y / Math.max(1, yMax)) * (H - PAD_T - PAD_B);
  const path = (pts: LinePoint[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const area =
    points.length > 1 && last !== undefined
      ? `${path(points)} L ${sx(last.x).toFixed(1)} ${sy(0).toFixed(1)} L ${sx(points[0].x).toFixed(1)} ${sy(0).toFixed(1)} Z`
      : '';
  const gradient = `line-fill-${Math.round(yMax)}-${points.length}`;
  const swatch = {
    accent: 'var(--accent)',
    muted: 'var(--muted)',
    goal: 'var(--good)',
    forecast: 'var(--accent)',
  };

  return (
    <div className="relative">
      {legend !== undefined && (
        <div className="mb-2 flex flex-wrap justify-end gap-3 text-[0.72rem] text-muted">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <i
                className="inline-block h-0.5 w-4 rounded"
                style={{
                  background: swatch[item.kind],
                  opacity: item.kind === 'muted' ? 0.7 : 1,
                  ...(item.kind === 'goal' || item.kind === 'forecast' ? { backgroundImage: `repeating-linear-gradient(90deg, ${swatch[item.kind]} 0 4px, transparent 4px 7px)`, background: 'none' } : {}),
                }}
              />
              {item.label}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label={label}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity={0.26} />
            <stop offset="1" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {yTicks.slice(0, 4).map((tick) => (
          <g key={tick.label}>
            <line x1={PAD_L} y1={sy(tick.value)} x2={W - PAD_R} y2={sy(tick.value)} className="chart-grid" />
            <text x={PAD_L - 8} y={sy(tick.value) + 4} textAnchor="end" className="axis">
              {tick.label}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={tick.label} x={sx(tick.value)} y={H - 8} textAnchor="middle" className="axis">
            {tick.label}
          </text>
        ))}
        {goal !== undefined && goal.value <= yMax && (
          <g>
            <line x1={PAD_L} y1={sy(goal.value)} x2={W - PAD_R} y2={sy(goal.value)} stroke="var(--good)" strokeWidth={1.5} strokeDasharray="7 6" />
            <text x={W - PAD_R} y={sy(goal.value) - 6} textAnchor="end" fill="var(--good)" fontSize={11} fontWeight={700}>
              {goal.label}
            </text>
          </g>
        )}
        {muted !== undefined && muted.length > 1 && <path d={path(muted)} className="line-muted" opacity={0.65} />}
        {area !== '' && <path d={area} fill={`url(#${gradient})`} />}
        {points.length > 1 && <path d={path(points)} className="line-accent" />}
        {forecast !== undefined && last !== undefined && (
          <g>
            <path d={`M ${sx(last.x).toFixed(1)} ${sy(last.y).toFixed(1)} L ${sx(forecast.to.x).toFixed(1)} ${sy(forecast.to.y).toFixed(1)}`} className="line-accent" strokeDasharray="5 6" opacity={0.65} />
            <text x={sx(forecast.to.x)} y={sy(forecast.to.y) - 8} textAnchor="end" className="axis">
              {forecast.label}
            </text>
          </g>
        )}
        {today !== undefined && (
          <line x1={sx(today)} y1={PAD_T} x2={sx(today)} y2={sy(0)} stroke="var(--border-strong)" strokeDasharray="4 5" />
        )}
        {last !== undefined && (
          <circle cx={sx(last.x)} cy={sy(last.y)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        )}
      </svg>
      {last !== undefined && lastLabel !== undefined && (
        <span
          className="tip"
          style={{
            left: `${Math.min(88, (sx(last.x) / W) * 100)}%`,
            top: `${Math.max(0, (sy(last.y) / H) * 100 - 14)}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {lastLabel}
        </span>
      )}
    </div>
  );
}
