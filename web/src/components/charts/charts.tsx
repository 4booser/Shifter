'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { formatDayLabelShort, fromKey, keysBetween } from '@/lib/calendar/calendar-date';
import { CHART_H, CHART_W, Column, PAD, PLOT_H, PLOT_W, Tick, niceCeiling, niceFloor, smoothPath } from '@/lib/charts/math';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';

/* The chart kit, following the dataviz method: thin marks with 4px rounded data-ends, one axis, recessive grid… */

export interface AreaPoint {
  label: string;
  value: number;
}

/** The cumulative line, taken seriously. */
export function AreaChart({
  points,
  projection = [],
  comparison = [],
  goal = null,
  emptyNote,
}: {
  points: AreaPoint[];
  projection?: AreaPoint[];
  comparison?: AreaPoint[];
  goal?: number | null;
  /** Said in place of the plot when there is nothing in the stretch. */
  emptyNote: string;
}) {
  const { format, compact } = useMoney();
  const { lang } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const raw = useId().replace(/[«»:]/g, '');

  /* The scale reaches wherever the money went, including down. */
  const values = useMemo(
    () => [
      ...points.map((point) => point.value),
      ...projection.map((point) => point.value),
      ...comparison.map((point) => point.value),
      goal ?? 0,
    ],
    [points, projection, comparison, goal],
  );

  const max = useMemo(() => niceCeiling(Math.max(1, ...values)), [values]);
  const floor = useMemo(() => niceFloor(Math.min(0, ...values)), [values]);
  const span = max - floor;

  const height = (value: number) => ((value - floor) / span) * PLOT_H;

  const total = points.length + projection.length;
  const step = total <= 1 ? 0 : PLOT_W / (total - 1);
  const bottom = PAD.top + PLOT_H;
  // Where nought sits. The same as the baseline until the floor drops under
  // it, and then the wash has to hang from zero rather than from the frame.
  const zeroY = PAD.top + PLOT_H - height(0);

  const place = (list: AreaPoint[], offset: number) =>
    list.map((point, index) => ({
      x: PAD.left + step * (offset + index),
      y: PAD.top + PLOT_H - height(point.value),
      ...point,
    }));

  const coords = place(points, 0);
  const ahead = place(projection, coords.length);
  const projectionCoords = coords.length === 0 ? [] : [coords[coords.length - 1], ...ahead];

  const comparisonCoords = useMemo(() => {
    if (comparison.length < 2) return [];

    /* This used to open with `const span = comparison.length - 1`, which shadowed the outer span — the value range… */
    const lastIndex = comparison.length - 1;

    return comparison.map((point, index) => ({
      x: PAD.left + (PLOT_W * index) / lastIndex,
      y: PAD.top + PLOT_H - ((point.value - floor) / span) * PLOT_H,
      ...point,
    }));
  }, [comparison, floor, span]);

  const goalY = goal === null || goal <= 0 ? null : PAD.top + PLOT_H - height(goal);

  // Hover runs over fact and forecast alike; the tooltip says which is which.
  const all = [...coords, ...ahead];
  const hovered = hover === null ? null : all[hover];
  const hoveredAhead = hover !== null && hover >= coords.length;
  const before = hover === null ? null : (comparison[hover]?.value ?? null);
  const last = coords.at(-1);

  /* A scale nobody earned is not a chart. */
  const anything =
    [...points, ...projection, ...comparison].some((point) => point.value !== 0) ||
    (goal ?? 0) > 0;

  /* A short stretch used to `return null` — no plot, no sentence, and a card left holding a heading and a legend… */
  const hasLine = coords.length > 1;
  const hasComparison = comparisonCoords.length > 1;

  if (!anything || (!hasLine && !hasComparison)) {
    return (
      <p className="grid min-h-32 place-items-center text-center text-[0.85rem] text-faint">
        {emptyNote}
      </p>
    );
  }

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

        {floor < 0 && (
          <line x1={PAD.left} x2={CHART_W - PAD.right} y1={zeroY} y2={zeroY} stroke="var(--border-strong)" />
        )}

        {[floor, (floor + max) / 2, max].map((value) => {
          const y = PAD.top + PLOT_H - height(value);

          return (
            <g key={value}>
              {value !== floor && <line x1={PAD.left} x2={CHART_W - PAD.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 4" />}
              <text x={PAD.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--faint)">
                {compact(value)}
              </text>
            </g>
          );
        })}

        {comparisonCoords.length > 1 && (
          <path d={smoothPath(comparisonCoords)} fill="none" stroke="var(--faint)" strokeWidth="1.6" opacity="0.5" />
        )}

        {/* One worked day is a place on the scale, not a line. */}
        {!hasLine && coords.length === 1 && (
          <circle cx={coords[0].x} cy={coords[0].y} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
        )}

        {hasLine && (
          <>
            <path
              className="fade-in"
              d={`${smoothPath(coords)} L ${coords[coords.length - 1].x} ${zeroY} L ${coords[0].x} ${zeroY} Z`}
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
          </>
        )}

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
              ×{(hovered.value / before).toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {format(before)}
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
  emptyNote,
}: {
  columns: Column[];
  ticks: Tick[];
  labelEvery?: number;
  /** Said in place of the plot when there is nothing in the stretch. */
  emptyNote: string;
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

  // Empty columns still had a ceiling of at least one, so a month with
  // nothing worked drew a full grid labelled in money nobody made.
  if (!columns.some((entry) => entry.earned !== 0 || (entry.planned ?? 0) !== 0)) {
    return (
      <p className="grid min-h-32 place-items-center text-center text-[0.85rem] text-faint">
        {emptyNote}
      </p>
    );
  }

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

/** The five rungs of the heat ramp, coldest first. */
export const HEAT_LEVELS = [
  'var(--surface-2)',
  'color-mix(in srgb, var(--heat) 25%, var(--surface-2))',
  'color-mix(in srgb, var(--heat) 45%, var(--surface-2))',
  'color-mix(in srgb, var(--heat) 70%, var(--surface-2))',
  'var(--heat)',
];

/** A year of work at a glance: sequential ramp of the accent, one hue. */
export function Heatmap({
  values,
  from,
  to,
  fill = false,
  labels = false,
}: {
  values: ReadonlyMap<string, number>;
  from: string;
  to: string;
  /** Тянуть недели по всей ширине родителя, а не стоять квадратами в 16 px. */
  fill?: boolean;
  /** Дни недели слева и месяцы сверху: без них колонка — просто колонка. */
  labels?: boolean;
}) {
  const { format } = useMoney();
  const { lang } = useI18n();
  const [hover, setHover] = useState<{ key: string; value: number } | null>(null);

  const { weeks, months } = useMemo(() => {
    const keys = keysBetween(from, to);

    if (keys.length === 0) return { weeks: [], months: [] };

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

    // Месяц подписывается над той колонкой, в которой он начался.
    const name = new Intl.DateTimeFormat(lang, { month: 'short' });
    const marks: { index: number; label: string }[] = [];
    let last = '';

    columns.forEach((week, index) => {
      const first = week.find((cell) => cell !== null);

      if (first === undefined) return;

      const month = first.key.slice(0, 7);

      if (month === last) return;

      last = month;
      marks.push({ index, label: name.format(fromKey(first.key)) });
    });

    return { weeks: columns, months: marks };
  }, [values, from, to, lang]);

  /* Неделя — колонка, и колонки тянутся под ширину карточки: раньше здесь стояли квадраты ровно в десять… */
  const template = fill
    ? `repeat(${weeks.length}, minmax(6px, 1fr))`
    : `repeat(${weeks.length}, 16px)`;
  const cell = fill ? 'aspect-square w-full' : 'h-4 w-4';
  // Высота подписи месяцев, на которую надо опустить колонку дней недели.
  const gutter = '1.05rem';

  return (
    <div className="relative">
      <div className="flex gap-2" onPointerLeave={() => setHover(null)}>
        {labels && (
          <div className="flex flex-none flex-col text-[0.62rem] font-semibold leading-none text-faint">
            <span aria-hidden style={{ height: gutter }} />
            <div className="grid flex-1 gap-[4px]" style={{ gridTemplateRows: 'repeat(7, 1fr)' }}>
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <span key={day} className="flex items-center capitalize">
                  {/* Семь подписей подряд не помещаются и сливаются; через одну
                      читаются, а ряд всё равно угадывается. */}
                  {day % 2 === 0
                    ? new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(2026, 0, 5 + day))
                    : ''}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
          {labels && months.length > 0 && (
            <div
              aria-hidden
              className="grid gap-[4px] text-[0.62rem] font-semibold leading-none text-faint"
              style={{ gridTemplateColumns: template, height: gutter }}
            >
              {months.map((month, index) => (
                <span
                  key={month.index}
                  className="truncate capitalize"
                  style={{
                    gridColumn: `${month.index + 1} / ${
                      months[index + 1] === undefined ? -1 : months[index + 1].index + 1
                    }`,
                  }}
                >
                  {month.label}
                </span>
              ))}
            </div>
          )}
          <div
            className="mx-auto grid gap-[4px]"
            style={{ gridTemplateColumns: template }}
          >
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="fade-in grid gap-[4px]" style={{ ['--i' as string]: weekIndex % 30 }}>
                {week.map((day, dayIndex) =>
                  day === null ? (
                    <span key={dayIndex} className={cell} />
                  ) : (
                    /* A span cannot be tabbed to and has nothing to announce, so the whole year was mouse-only and silent. */
                    <button
                      type="button"
                      key={day.key}
                      className={`${cell} rounded-[3px]`}
                      style={{ background: HEAT_LEVELS[day.level] }}
                      // Клетка в шесть пикселей не может нести число внутри
                      // себя: величину говорит цвет, точную сумму — подсказка.
                      title={`${formatDayLabelShort(day.key, lang)} · ${format(day.value)}`}
                      aria-label={`${formatDayLabelShort(day.key, lang)} · ${format(day.value)}`}
                      onPointerEnter={() => setHover({ key: day.key, value: day.value })}
                      onFocus={() => setHover({ key: day.key, value: day.value })}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
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

/** The frame around a chart made of elements: a value axis down the left, gridlines across, marks projected in. */
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
