import { useId, useMemo, useState } from 'react';

import { levelWindow, smoothPath } from '@/lib/charts/math';
import { useChartWidth } from '@/lib/charts/measure';
import { formatMoney, formatMoneyCompact } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { useI18n } from '@/lib/i18n';

/**
 * The cumulative climb: what the period earned, day by day, against the one
 * before it.
 *
 * A monotone curve that cannot invent a peak the month never had, a wash and
 * a glow under it, the previous period as a grey ghost, and a crosshair that
 * answers with both figures and the multiple between them.
 */
export interface ClimbPoint {
  label: string;
  value: number;
}

export function Climb({
  points,
  ghost = [],
  height = 260,
  floor = 'zero',
}: {
  points: ClimbPoint[];
  ghost?: ClimbPoint[];
  height?: number;
  /**
   * Where the y axis starts.
   *
   * A cumulative climb starts at nought — that is what makes it a climb, and
   * the wash under it is a real quantity. A *level* — a bank balance, a
   * runway — does not: a month moving between ₴55K and ₴62K drawn from zero
   * is a straight line under a block of colour, which is every number the
   * chart was asked to show, thrown away. Those pass 'data', and with a
   * clipped axis the fill goes too: area over a floor that is not zero
   * overstates the change it is drawn from.
   */
  floor?: 'zero' | 'data';
}) {
  const { lang } = useI18n();
  const settings = useSettings((state) => state.settings);
  const raw = useId().replace(/[«»:]/g, '');
  const [hover, setHover] = useState<number | null>(null);

  const [host, width] = useChartWidth();

  const all = [...points, ...ghost].map((point) => point.value);
  const window = floor === 'zero'
    ? { base: 0, peak: Math.max(1, ...all) }
    : levelWindow(all);
  const { base, peak } = window;
  const span = Math.max(1, peak - base);

  // The gutter has to hold the longest label it will print. Fixed at 52 it
  // clipped the first glyph off «₴62,4 тис.» — the balance chart's own top
  // tick, cut in half by the card's edge.
  const ticks = [base, base + span / 2, peak];
  const widest = Math.max(...ticks.map((value) => formatMoneyCompact(settings, value).length));
  const pad = { top: 18, right: 16, bottom: 26, left: Math.max(52, 14 + widest * 6) };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const line = useMemo(
    () =>
      points.map((point, index) => ({
        ...point,
        x: pad.left + (plotW * index) / Math.max(1, points.length - 1),
        y: pad.top + plotH - ((point.value - base) / span) * plotH,
      })),
    [points, base, span, plotW, plotH, pad.left, pad.top],
  );

  const pale = useMemo(
    () =>
      ghost.map((point, index) => ({
        ...point,
        x: pad.left + (plotW * index) / Math.max(1, ghost.length - 1),
        y: pad.top + plotH - ((point.value - base) / span) * plotH,
      })),
    [ghost, base, span, plotW, plotH, pad.left, pad.top],
  );

  if (line.length < 2) return null;

  const at = hover === null ? null : line[hover];
  const before = hover === null ? null : (ghost[hover]?.value ?? null);
  const step = plotW / Math.max(1, line.length - 1);

  return (
    <div className="relative" ref={host}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block"
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${raw}-wash`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="0.6" stopColor="var(--accent)" stopOpacity="0.07" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((value) => {
          const y = pad.top + plotH - ((value - base) / span) * plotH;

          return (
            <g key={value}>
              {value > base && (
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 5" />
              )}
              <text x={pad.left - 10} y={y + 3} textAnchor="end" fontSize="10" fill="var(--faint)">
                {formatMoneyCompact(settings, value)}
              </text>
            </g>
          );
        })}

        {pale.length > 1 && (
          <path d={smoothPath(pale)} fill="none" stroke="var(--faint)" strokeWidth="1.8" opacity="0.55" />
        )}

        {floor === 'zero' && (
          <path
            d={`${smoothPath(line)} L ${line[line.length - 1].x} ${pad.top + plotH} L ${line[0].x} ${pad.top + plotH} Z`}
            fill={`url(#${raw}-wash)`}
          />
        )}
        <path
          d={smoothPath(line)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          opacity="0.22"
          style={{ filter: 'blur(5px)' }}
        />
        <path
          d={smoothPath(line)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {at !== null && (
          <>
            <line x1={at.x} x2={at.x} y1={pad.top} y2={pad.top + plotH} stroke="var(--border-strong)" />
            <circle cx={at.x} cy={at.y} r="4.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </>
        )}

        {line.map((point, index) => (
          <rect
            key={index}
            x={point.x - step / 2}
            y={pad.top}
            width={Math.max(6, step)}
            height={plotH}
            fill="transparent"
            onPointerEnter={() => setHover(index)}
          />
        ))}
      </svg>

      {at !== null && (
        <div
          className="card pointer-events-none absolute top-1 z-10 -translate-x-1/2 px-2.5 py-1.5 text-xs"
          style={{ left: `${(at.x / width) * 100}%` }}
        >
          <span className="field-hint block">{at.label}</span>
          <strong className="tabular">{formatMoney(settings, at.value)}</strong>
          {before !== null && before > 0 && (
            <span className="field-hint block tabular">
              ×{(at.value / before).toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ·{' '}
              {formatMoney(settings, before)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
