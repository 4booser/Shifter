'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { fromKey, keysBetween } from '@/lib/calendar/calendar-date';
import { CHART_H, CHART_W, Column, PAD, PLOT_H, PLOT_W, Tick, niceCeiling, smoothPath } from '@/lib/charts/math';
import { useMoney } from '@/lib/settings/money';

/*
 * The chart kit, following the dataviz method: thin marks with 4px rounded
 * data-ends, one axis, recessive grid, a hover layer on every plot, direct
 * labels only where they earn their place. Series colours ride --s1..--s3 and
 * the accent, all validated for both modes.
 */

export interface AreaPoint {
  label: string;
  value: number;
}

/**
 * The cumulative line, taken seriously.
 *
 * One simple idea — money climbing through the days — executed all the way:
 * a monotone curve instead of a polyline, a layered wash with a glow under
 * the line, the live end of the line breathing, «today» marked where fact
 * hands over to forecast, the goal flagged by name, and a crosshair that
 * answers with this period, the one before, and the gap between them.
 */
export function AreaChart({
  points,
  projection = [],
  comparison = [],
  goal = null,
}: {
  points: AreaPoint[];
  projection?: AreaPoint[];
  comparison?: AreaPoint[];
  goal?: number | null;
}) {
  const { format, compact } = useMoney();
  const [hover, setHover] = useState<number | null>(null);
  const raw = useId().replace(/[«»:]/g, '');

  const max = useMemo(
    () =>
      niceCeiling(
        Math.max(
          1,
          ...points.map((point) => point.value),
          ...projection.map((point) => point.value),
          ...comparison.map((point) => point.value),
          goal ?? 0,
        ),
      ),
    [points, projection, comparison, goal],
  );

  const total = points.length + projection.length;
  const step = total <= 1 ? 0 : PLOT_W / (total - 1);
  const bottom = PAD.top + PLOT_H;

  const place = (list: AreaPoint[], offset: number) =>
    list.map((point, index) => ({
      x: PAD.left + step * (offset + index),
      y: PAD.top + PLOT_H - (point.value / max) * PLOT_H,
      ...point,
    }));

  const coords = place(points, 0);
  const ahead = place(projection, coords.length);
  const projectionCoords = coords.length === 0 ? [] : [coords[coords.length - 1], ...ahead];

  const comparisonCoords = useMemo(() => {
    if (comparison.length < 2) return [];

    const span = comparison.length - 1;

    return comparison.map((point, index) => ({
      x: PAD.left + (PLOT_W * index) / span,
      y: PAD.top + PLOT_H - (point.value / max) * PLOT_H,
      ...point,
    }));
  }, [comparison, max]);

  const goalY = goal === null || goal <= 0 ? null : PAD.top + PLOT_H - (goal / max) * PLOT_H;

  // Hover runs over fact and forecast alike; the tooltip says which is which.
  const all = [...coords, ...ahead];
  const hovered = hover === null ? null : all[hover];
  const hoveredAhead = hover !== null && hover >= coords.length;
  const before = hover === null ? null : (comparison[hover]?.value ?? null);
  const last = coords.at(-1);

  if (coords.length < 2) return null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="block w-full" onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`${raw}-wash`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.3" />
            <stop offset="0.55" stopColor="var(--accent)" stopOpacity="0.08" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          {/* The glow is the line's own light on the wash — a blurred copy,
              never a shadow in grey. */}
          <filter id={`${raw}-glow`} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="5" result="soft" />
            <feMerge>
              <feMergeNode in="soft" />
            </feMerge>
          </filter>
        </defs>

        {[0, max / 2, max].map((value) => {
          const y = PAD.top + PLOT_H - (value / max) * PLOT_H;

          return (
            <g key={value}>
              {value > 0 && <line x1={PAD.left} x2={CHART_W - PAD.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 4" />}
              <text x={PAD.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--faint)">
                {compact(value)}
              </text>
            </g>
          );
        })}

        {comparisonCoords.length > 1 && (
          <path d={smoothPath(comparisonCoords)} fill="none" stroke="var(--faint)" strokeWidth="1.6" opacity="0.5" />
        )}

        <path
          className="fade-in"
          d={`${smoothPath(coords)} L ${coords[coords.length - 1].x} ${bottom} L ${coords[0].x} ${bottom} Z`}
          fill={`url(#${raw}-wash)`}
        />
        {/* The blurred twin under the crisp line — the glow. */}
        <path
          d={smoothPath(coords)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          opacity="0.28"
          filter={`url(#${raw}-glow)`}
        />
        <DrawnPath key={points.length + ':' + (points.at(-1)?.value ?? 0)} d={smoothPath(coords)} />

        {projectionCoords.length > 1 && (
          <path d={smoothPath(projectionCoords)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 5" opacity="0.65" />
        )}

        {/* Fact hands over to forecast here: a quiet meridian named «today». */}
        {ahead.length > 0 && last !== undefined && (
          <g>
            <line x1={last.x} x2={last.x} y1={PAD.top} y2={bottom} stroke="var(--border-strong)" strokeDasharray="3 4" />
            <text x={last.x} y={PAD.top - 4} textAnchor="middle" fontSize="9" fill="var(--faint)">
              {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </text>
          </g>
        )}

        {goalY !== null && (
          <g>
            <line x1={PAD.left} x2={CHART_W - PAD.right} y1={goalY} y2={goalY} stroke="var(--good)" strokeWidth="1.5" strokeDasharray="6 4" />
            <text x={CHART_W - PAD.right} y={goalY - 5} textAnchor="end" fontSize="10" fontWeight="700" fill="var(--good)">
              {compact(goal ?? 0)}
            </text>
          </g>
        )}

        {/* The live end of the line, breathing — only while a forecast says
            the period is still running. */}
        {ahead.length > 0 && last !== undefined && (
          <g>
            <circle className="chart-pulse" cx={last.x} cy={last.y} r="10" fill="var(--accent)" />
            <circle cx={last.x} cy={last.y} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}

        {hovered && (
          <>
            <line x1={hovered.x} x2={hovered.x} y1={PAD.top} y2={bottom} stroke="var(--border-strong)" />
            <circle cx={hovered.x} cy={hovered.y} r="4.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
            {before !== null && hover !== null && comparisonCoords[hover] !== undefined && (
              <circle cx={comparisonCoords[hover].x} cy={comparisonCoords[hover].y} r="3" fill="var(--faint)" stroke="var(--surface)" strokeWidth="1.5" />
            )}
          </>
        )}

        {/* Hit targets, wider than the marks. */}
        {all.map((point, index) => (
          <rect
            key={index}
            x={point.x - Math.max(3, step / 2)}
            y={PAD.top}
            width={Math.max(6, step)}
            height={PLOT_H}
            fill="transparent"
            onPointerEnter={() => setHover(index)}
          />
        ))}
      </svg>

      {hovered && (
        <div
          className="card pointer-events-none absolute top-1 z-10 -translate-x-1/2 px-2.5 py-1.5 text-[0.78rem] shadow-(--shadow-lg)"
          style={{ left: `${(hovered.x / CHART_W) * 100}%` }}
        >
          <span className="field-hint block">{hovered.label}</span>
          <strong className="tabular">
            {hoveredAhead ? '≈ ' : ''}
            {format(hovered.value)}
          </strong>
          {before !== null && before > 0 && !hoveredAhead && (
            <span className="field-hint block tabular">
              ×{(hovered.value / before).toFixed(2)} · {format(before)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Single-series columns with an optional planned overlay on the caps. */
export function ColumnChart({
  columns,
  ticks,
  labelEvery = 1,
}: {
  columns: Column[];
  ticks: Tick[];
  labelEvery?: number;
}) {
  const { format, compact } = useMoney();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId().replace(/[«»:]/g, '');

  const bottom = PAD.top + PLOT_H;
  const peak = columns.reduce((best, entry, index) => (entry.earned > (columns[best]?.earned ?? 0) ? index : best), 0);
  const hovered = hover === null ? null : columns[hover];

  // The average of the days that actually earned, drawn as a quiet line the
  // bars are measured against.
  const earners = columns.filter((entry) => entry.earned > 0);
  const average = earners.length > 1 ? earners.reduce((sum, entry) => sum + entry.earned, 0) / earners.length : null;
  const ceiling = ticks.at(-1)?.value ?? 1;
  const averageY = average === null ? null : bottom - (average / ceiling) * PLOT_H;

  /** Rounded at the data end, square at the baseline, per the mark spec. */
  const columnPath = (x: number, y: number, width: number, height: number) => {
    const r = Math.min(4, width / 2, height);

    return `M ${x} ${y + height} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + width - r} ${y} Q ${x + width} ${y} ${x + width} ${y + r} L ${x + width} ${y + height} Z`;
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="block w-full" onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="color-mix(in srgb, var(--accent) 45%, var(--surface))" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick.value}>
            {tick.value > 0 && <line x1={PAD.left} x2={CHART_W - PAD.right} y1={tick.y} y2={tick.y} stroke="var(--border)" strokeDasharray="2 4" opacity="0.6" />}
            <text x={PAD.left - 8} y={tick.y + 3} textAnchor="end" fontSize="10" fill="var(--faint)">
              {compact(tick.value)}
            </text>
          </g>
        ))}

        {averageY !== null && (
          <g>
            <line x1={PAD.left} x2={CHART_W - PAD.right} y1={averageY} y2={averageY} stroke="var(--warn)" strokeDasharray="5 4" opacity="0.7" />
            <text x={CHART_W - PAD.right} y={averageY - 5} textAnchor="end" fontSize="9.5" fontWeight="600" fill="var(--warn)">
              ≈ {compact(average ?? 0)}
            </text>
          </g>
        )}

        {columns.map((entry, index) => (
          <g key={`${entry.label}-${index}`}>
            {/* A day with nothing keeps its place as a dot on the baseline:
                the rhythm of offs is part of the picture. */}
            {entry.earnedHeight === 0 && entry.plannedHeight === 0 && (
              <circle cx={entry.centre} cy={bottom - 2} r="1.6" fill="var(--border-strong)" />
            )}
            {entry.earnedHeight > 0 && (
              <path
                className="grow-y"
                style={{ ['--i' as string]: index % 16 }}
                d={columnPath(entry.x, bottom - entry.earnedHeight, entry.width, entry.earnedHeight)}
                fill={`url(#${gradientId})`}
                stroke={index === peak ? 'color-mix(in srgb, var(--accent) 70%, white 25%)' : 'none'}
                strokeWidth={index === peak ? 1 : 0}
                opacity={hover === null || hover === index ? 1 : 0.4}
              />
            )}
            {entry.plannedHeight > 0 && (
              <path
                d={columnPath(entry.x, bottom - entry.earnedHeight - entry.plannedHeight, entry.width, entry.plannedHeight)}
                fill="var(--accent)"
                opacity="0.25"
              />
            )}
            {index % labelEvery === 0 && (
              <text x={entry.centre} y={bottom + 14} textAnchor="middle" fontSize="9.5" fill="var(--faint)">
                {entry.label}
              </text>
            )}
            {index === peak && entry.earned > 0 && (
              <text x={entry.centre} y={bottom - entry.earnedHeight - entry.plannedHeight - 5} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="var(--muted)">
                {compact(entry.earned)}
              </text>
            )}
            <rect
              x={entry.x - 2}
              y={PAD.top}
              width={entry.width + 4}
              height={PLOT_H}
              fill="transparent"
              onPointerEnter={() => setHover(index)}
            />
          </g>
        ))}
      </svg>

      {hovered && (
        <div
          className="card pointer-events-none absolute top-1 z-10 -translate-x-1/2 px-2.5 py-1.5 text-[0.78rem] shadow-(--shadow-lg)"
          style={{ left: `${(hovered.centre / CHART_W) * 100}%` }}
        >
          <span className="field-hint block">{hovered.label}</span>
          <strong className="tabular">{format(hovered.earned)}</strong>
          {hovered.planned > 0 && <span className="field-hint block tabular">+{format(hovered.planned)}</span>}
        </div>
      )}
    </div>
  );
}

/** A year of work at a glance: sequential ramp of the accent, one hue. */
export function Heatmap({ values, from, to }: { values: ReadonlyMap<string, number>; from: string; to: string }) {
  const { format } = useMoney();
  const [hover, setHover] = useState<{ key: string; value: number } | null>(null);

  const weeks = useMemo(() => {
    const keys = keysBetween(from, to);

    if (keys.length === 0) return [];

    const peak = Math.max(1, ...keys.map((key) => values.get(key) ?? 0));
    const offset = (fromKey(keys[0]).getDay() + 6) % 7;
    const columns: ({ key: string; level: number; value: number } | null)[][] = [];
    let column: ({ key: string; level: number; value: number } | null)[] = new Array(offset).fill(null);

    for (const key of keys) {
      const value = values.get(key) ?? 0;

      column.push({ key, value, level: value === 0 ? 0 : Math.min(4, Math.ceil((value / peak) * 4)) });

      if (column.length === 7) {
        columns.push(column);
        column = [];
      }
    }

    if (column.length > 0) columns.push(column);

    return columns;
  }, [values, from, to]);

  const LEVELS = ['var(--surface-2)', 'color-mix(in srgb, var(--heat) 25%, var(--surface-2))', 'color-mix(in srgb, var(--heat) 45%, var(--surface-2))', 'color-mix(in srgb, var(--heat) 70%, var(--surface-2))', 'var(--heat)'];

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-1" onPointerLeave={() => setHover(null)}>
        {/* w-max + mx-auto: a short year sits centred; a long one scrolls. */}
        <div className="mx-auto flex w-max gap-[3px]">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="fade-in flex flex-none flex-col gap-[3px]" style={{ ['--i' as string]: weekIndex % 30 }}>
            {week.map((cell, dayIndex) =>
              cell === null ? (
                <span key={dayIndex} className="h-2.5 w-2.5" />
              ) : (
                <span
                  key={cell.key}
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: LEVELS[cell.level] }}
                  onPointerEnter={() => setHover({ key: cell.key, value: cell.value })}
                />
              ),
            )}
          </div>
        ))}
        </div>
      </div>
      {hover && (
        <div className="card absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 text-[0.78rem] shadow-(--shadow-lg)">
          <span className="field-hint">{hover.key}</span> <strong className="tabular">{format(hover.value)}</strong>
        </div>
      )}
    </div>
  );
}

/** A single ratio against a limit. */
export function ProgressRing({ percent, size = 120 }: { percent: number; size?: number }) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" stroke="var(--surface-2)" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        fill="none"
        stroke={clamped >= 100 ? 'var(--good)' : 'var(--accent)'}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        style={{ transition: 'stroke-dashoffset calc(0.6s * var(--motion)) ease' }}
      />
    </svg>
  );
}

/**
 * The frame around a chart made of elements: a value axis down the left,
 * gridlines across, marks projected in. Shared so six div-charts share one
 * reading instead of six.
 */
export function Plot({
  max,
  scale = 'money',
  height = '10rem',
  tight = false,
  overlay,
  children,
}: {
  max: number;
  scale?: 'money' | 'percent' | 'plain';
  height?: string;
  tight?: boolean;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { compact } = useMoney();
  const ceiling = niceCeiling(Math.max(1, max));
  const steps = tight ? 2 : 4;
  const ticks = Array.from({ length: steps + 1 }, (_, index) => {
    const value = (ceiling / steps) * index;

    return {
      value,
      at: (index / steps) * 100,
      label: scale === 'percent' ? `${Math.round(value)}%` : scale === 'plain' ? `${Math.round(value)}` : compact(value),
    };
  });

  return (
    <div className="grid grid-cols-[3.2rem_1fr] gap-2">
      <div className="relative" style={{ height }} aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick.value} className="absolute right-0 translate-y-1/2 text-[0.66rem] text-faint tabular" style={{ bottom: `${tick.at}%` }}>
            {tick.label}
          </span>
        ))}
      </div>
      <div className="relative" style={{ height }}>
        {ticks.map(
          (tick) =>
            tick.value > 0 && (
              <span key={tick.value} className="absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${tick.at}%` }} />
            ),
        )}
        {overlay}
        <div className="absolute inset-0 flex items-end gap-1">{children}</div>
      </div>
    </div>
  );
}

/** The ceiling Plot uses, for callers that scale their own marks. */
export { niceCeiling };


/** A line that draws itself: the dash offset needs the real path length. */
function DrawnPath({ d }: { d: string }) {
  const ref = useRef<SVGPathElement>(null);

  useEffect(() => {
    const path = ref.current;

    if (path === null) return;

    path.style.setProperty('--len', String(path.getTotalLength()));
    path.classList.add('draw-line');
  }, [d]);

  return <path ref={ref} d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />;
}
