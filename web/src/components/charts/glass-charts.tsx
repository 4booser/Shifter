'use client';

import { useId, useMemo, useState } from 'react';

import { formatDayLabel, fromKey, keysBetween, todayKey, formatDayLabelShort } from '@/lib/calendar/calendar-date';
import { TipDay, WaterfallStep, WeekBand } from '@/lib/charts/report-math';
import { stagger } from '@/lib/fx';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { smoothPath } from '@/lib/charts/math';
import { earnedTone } from '@/lib/tone';

/*
 * The second-generation chart kit: fewer axes, bigger marks, direct labels,
 * one gradient language. Every form here was redrawn for the sparse case —
 * one month of data, one working slot — because that is what a new account
 * looks at for weeks.
 */

const GRAD_TOP = 'var(--accent)';
const GRAD_BOTTOM = 'color-mix(in srgb, var(--accent) 45%, var(--surface))';

/** A shared vertical gradient; the id is per-instance so charts can coexist. */
function useBarGradient(): [string, React.ReactNode] {
  const id = useId().replace(/[«»:]/g, '');

  return [
    id,
    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={GRAD_TOP} />
      <stop offset="1" stopColor={GRAD_BOTTOM} />
    </linearGradient>,
  ];
}

// ==== Twelve months, readable with one month of data ====

export interface MonthBarRow {
  label: string;
  value: number;
  current?: boolean;
}

/**
 * Horizontal rows instead of a forest of empty columns: a year with one
 * lived month reads as one strong bar and eleven quiet tracks, not as a
 * broken chart. The best month carries its value; the current one glows.
 */
export function MonthBars({ rows }: { rows: MonthBarRow[] }) {
  const { format, compact } = useMoney();
  const [hover, setHover] = useState<number | null>(null);

  const peak = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className="flex flex-col gap-[7px]" onPointerLeave={() => setHover(null)}>
      {rows.map((row, index) => {
        const share = row.value / peak;
        const best = row.value === peak && row.value > 0;

        // A month with nothing in it earns eight pixels, not a full row of
        // grey skeleton — ten of those were most of the card.
        if (row.value === 0 && !row.current) {
          return (
            <div key={row.label} className="flex h-2 items-center gap-2.5">
              <span className="w-9 flex-none text-right text-[0.62rem] capitalize text-faint">{row.label}</span>
              <span className="h-px min-w-0 flex-1 bg-border" />
            </div>
          );
        }

        return (
          <div
            key={row.label}
            className="group flex items-center gap-2.5"
            onPointerEnter={() => setHover(index)}
          >
            <span
              className={`w-9 flex-none text-right text-[0.72rem] capitalize tabular ${
                row.current ? 'font-bold text-(--accent-read)' : 'text-faint'
              }`}
            >
              {row.label}
            </span>
            <span className="relative h-[18px] min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
              {row.value > 0 && (
                <span
                  className="grow-w absolute inset-y-0 left-0 rounded-full"
                  style={{
                    ['--i' as string]: index,
                    width: `${Math.max(2.5, share * 100)}%`,
                    background: `linear-gradient(90deg, ${GRAD_BOTTOM}, ${GRAD_TOP})`,
                    boxShadow: best ? '0 0 12px color-mix(in srgb, var(--accent) 55%, transparent)' : undefined,
                    opacity: hover === null || hover === index ? 1 : 0.4,
                  }}
                />
              )}
            </span>
            <span
              className={`w-20 flex-none whitespace-nowrap text-right text-[0.78rem] tabular ${
                best ? 'font-bold' : row.value > 0 ? 'text-muted' : 'text-faint'
              }`}
            >
              {row.value > 0 ? (hover === index ? format(row.value) : compact(row.value)) : '·'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ==== How the money assembled — a flow, not a staircase ====

/**
 * The waterfall, retold in one sentence: sources stack into one wide bar,
 * deductions hang under it as chips, and the two numbers that matter stand
 * at full size. Small components stay visible because the bar enforces a
 * minimum share — a 105 of sales next to 16 000 of shifts is a sliver, but
 * a visible one.
 */
export function MoneyFlow({ steps }: { steps: WaterfallStep[] }) {
  const { t } = useI18n();
  const { format } = useMoney();
  const [hover, setHover] = useState<string | null>(null);

  const sources = steps.filter((step) => step.kind === 'plus');
  const cuts = steps.filter((step) => step.kind === 'minus');
  const gross = steps.find((step) => step.kind === 'total' && step.key === 'Gross');
  const net = steps.find((step) => step.kind === 'total' && step.key === 'Net');

  if (sources.length === 0 || gross === undefined) return null;

  const total = sources.reduce((sum, step) => sum + step.value, 0);
  const TINTS = ['var(--s1)', 'var(--s3)', 'var(--s2)', 'var(--accent)'];

  return (
    <div className="flex flex-col gap-3">
      {/* The assembly bar: every source, gap-separated, minimum 2% visible. */}
      <div className="flex h-9 gap-[3px] overflow-hidden rounded-(--radius)" onPointerLeave={() => setHover(null)}>
        {sources.map((step, index) => (
          <span
            key={step.key}
            className="fade-in relative min-w-0 transition-[flex-grow] duration-500"
            style={{
              ['--i' as string]: index,
              flexGrow: Math.max(step.value / total, 0.02),
              flexBasis: 0,
              background: `linear-gradient(180deg, color-mix(in srgb, ${TINTS[index % TINTS.length]} 88%, white 6%), ${TINTS[index % TINTS.length]})`,
              opacity: hover === null || hover === step.key ? 1 : 0.35,
            }}
            onPointerEnter={() => setHover(step.key)}
          />
        ))}
      </div>

      {/* Legend with the amounts, one line per source. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {sources.map((step, index) => (
          <span
            key={step.key}
            className="flex cursor-default items-center gap-1.5 text-[0.82rem]"
            style={{ opacity: hover === null || hover === step.key ? 1 : 0.4 }}
            onPointerEnter={() => setHover(step.key)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: TINTS[index % TINTS.length] }} />
            <span className="text-muted">{t(step.key)}</span>
            <span className="font-semibold tabular">{format(step.value)}</span>
            <span className="text-[0.7rem] text-faint tabular">{Math.round((step.value / total) * 100)}%</span>
          </span>
        ))}
      </div>

      {/* Gross, the cuts, net — the sentence itself. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
        <span>
          {/* Not «Earned»: the page's own headline uses that word for the
              figure with the cuts already taken out, and this one is the
              figure they come out of. */}
          <span className="field-hint block">{t('Before cuts')}</span>
          <span className="text-[1.35rem] font-bold tracking-tight tabular">{format(gross.value)}</span>
        </span>

        {cuts.map((step) => (
          <span
            key={step.key}
            className="rounded-full border border-warn/35 bg-(--warn-soft) px-2.5 py-1 text-[0.8rem] font-semibold text-warn-read tabular"
          >
            − {format(step.value)} <span className="font-normal opacity-80">{t(step.key)}</span>
          </span>
        ))}

        {net !== undefined && (
          <>
            <span className="text-faint">→</span>
            <span>
              <span className="field-hint block">{t('Net')}</span>
              <span className={`text-[1.35rem] font-bold tracking-tight tabular ${earnedTone(net.value)}`}>
                {format(net.value)}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ==== The shape of the week: seven bands on a 24-hour track ====

const BAND_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function WeekBandsChart({ bands }: { bands: WeekBand[] }) {
  const { t } = useI18n();
  const { format } = useMoney();
  const [hover, setHover] = useState<number | null>(null);

  const byDay = useMemo(() => new Map(bands.map((band) => [band.weekday, band])), [bands]);
  const maxCount = Math.max(1, ...bands.map((band) => band.count));
  const span = Math.max(24, ...bands.map((band) => band.to));

  const clock = (value: number) => {
    const hour = Math.floor(value) % 24;
    const minute = Math.round((value % 1) * 60);

    return `${hour}:${`${minute}`.padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-[7px]" onPointerLeave={() => setHover(null)}>
      {/* The axis, said out loud: the ticks below mean these hours. */}
      <div className="flex items-center gap-2.5" aria-hidden>
        <span className="w-7 flex-none" />
        <span className="relative h-3 min-w-0 flex-1">
          {[6, 12, 18].map((hour) => (
            <span
              key={hour}
              className="absolute -translate-x-1/2 text-[0.62rem] text-faint tabular"
              style={{ left: `${(hour / span) * 100}%` }}
            >
              {hour}:00
            </span>
          ))}
        </span>
        <span className="w-24 flex-none" />
      </div>
      {BAND_DAYS.map((name, weekday) => {
        const band = byDay.get(weekday);

        return (
          <div key={name} className="flex items-center gap-2.5" onPointerEnter={() => setHover(weekday)}>
            <span className={`w-7 flex-none text-[0.72rem] ${band !== undefined ? 'font-semibold' : 'text-faint'}`}>
              {t(name)}
            </span>
            <span className="relative h-[18px] min-w-0 flex-1 rounded-full bg-surface-2">
              {/* Quiet ticks at the quarters of the day. */}
              {[6, 12, 18].map((hour) => (
                <span
                  key={hour}
                  className="absolute inset-y-[4px] w-px bg-(--border-strong)"
                  style={{ left: `${(hour / span) * 100}%` }}
                />
              ))}
              {band !== undefined && (
                <span
                  className="grow-w absolute inset-y-0 rounded-full"
                  style={{
                    ['--i' as string]: weekday,
                    left: `${(band.from / span) * 100}%`,
                    width: `${Math.max(3, ((band.to - band.from) / span) * 100)}%`,
                    background: `linear-gradient(90deg, ${GRAD_BOTTOM}, ${GRAD_TOP})`,
                    opacity: (hover === null || hover === weekday ? 1 : 0.35) * (0.55 + 0.45 * (band.count / maxCount)),
                  }}
                />
              )}
            </span>
            <span className="w-24 flex-none text-right text-[0.74rem] text-muted tabular">
              {band === undefined ? (
                <span className="text-faint">·</span>
              ) : hover === weekday ? (
                <strong className="text-ink">{format(band.perHour)}/h</strong>
              ) : (
                <>
                  {clock(band.from)}–{clock(band.to)} <span className="text-faint">×{band.count}</span>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ==== Ranked bars: magnitude with a scale, not a pill with a number ====

/**
 * Horizontal bars for «which of these earns most» questions. The scale is
 * visible — quarter gridlines and a labelled peak — the champion row reads
 * bold at full ink, and the rest stand back until hovered. One hue, because
 * the rows are ranks of one measure, not different things.
 */
export function RankBars({
  rows,
  format,
  labelWidth = '6rem',
}: {
  rows: { name: string; value: number; caption?: string }[];
  format: (value: number) => string;
  labelWidth?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const peak = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className="flex flex-col gap-1.5" onPointerLeave={() => setHover(null)}>
      {rows.map((row, index) => {
        const champion = row.value === peak;

        return (
          <div
            key={row.name}
            className="grid items-center gap-2 text-[0.85rem]"
            style={{ gridTemplateColumns: `${labelWidth} 1fr auto` }}
            onPointerEnter={() => setHover(index)}
          >
            <span className={`truncate ${champion ? 'font-semibold text-ink' : 'text-muted'}`}>
              {row.name}
            </span>
            <span className="relative h-3.5 min-w-0 rounded-full bg-surface-2">
              {[0.25, 0.5, 0.75].map((tick) => (
                <span
                  key={tick}
                  className="absolute inset-y-[3px] w-px bg-(--border-strong) opacity-60"
                  style={{ left: `${tick * 100}%` }}
                />
              ))}
              {row.value > 0 && (
                <span
                  className="grow-w absolute inset-y-0 rounded-full"
                  style={{
                    ['--i' as string]: index,
                    width: `${Math.max(2, (row.value / peak) * 100)}%`,
                    background: `linear-gradient(90deg, ${GRAD_BOTTOM}, ${GRAD_TOP})`,
                    opacity: hover === null || hover === index ? (champion ? 1 : 0.7) : 0.3,
                  }}
                />
              )}
            </span>
            <span className={`text-right tabular ${champion ? 'font-bold' : 'text-muted'}`}>
              {hover === index && row.caption !== undefined ? row.caption : format(row.value)}
            </span>
          </div>
        );
      })}
      {/* What the full width means, so the bars are a chart and not a mood. */}
      <div className="grid items-center gap-2" style={{ gridTemplateColumns: `${labelWidth} 1fr auto` }} aria-hidden>
        <span />
        <span className="flex justify-between text-[0.62rem] text-faint tabular">
          <span>0</span>
          <span>{format(peak / 2)}</span>
          <span>{format(peak)}</span>
        </span>
        <span />
      </div>
    </div>
  );
}

// ==== Around the clock: a ring, not petals ====

export function ClockRing({ hours }: { hours: number[] }) {
  const { t } = useI18n();
  const { format, compact } = useMoney();
  const [hover, setHover] = useState<number | null>(null);

  const size = 240;
  const centre = size / 2;
  const radius = 88;
  const thickness = 26;
  const peakValue = Math.max(...hours, 1);
  const peakHour = hours.indexOf(Math.max(...hours));
  const total = hours.reduce((sum, value) => sum + value, 0);

  const arc = (hour: number) => {
    // Midnight at the top; 15° per hour with a 2.5° breathing gap.
    const a0 = (hour / 24) * 360 - 90 + 1.25;
    const a1 = ((hour + 1) / 24) * 360 - 90 - 1.25;
    const rad = (angle: number) => [centre + radius * Math.cos((angle * Math.PI) / 180), centre + radius * Math.sin((angle * Math.PI) / 180)] as const;
    const [x0, y0] = rad(a0);
    const [x1, y1] = rad(a1);

    return `M ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x1} ${y1}`;
  };

  const shown = hover ?? (total > 0 ? peakHour : null);

  return (
    <div className="relative mx-auto max-w-[16rem]">
      <svg viewBox={`0 0 ${size} ${size}`} className="block w-full" onPointerLeave={() => setHover(null)}>
        {hours.map((value, hour) => {
          const heat = value / peakValue;

          return (
            <path
              key={hour}
              className="fade-in"
              style={stagger(hour % 24)}
              d={arc(hour)}
              fill="none"
              strokeWidth={hover === hour ? thickness + 6 : thickness}
              strokeLinecap="butt"
              stroke={
                value === 0
                  ? 'var(--surface-2)'
                  : `color-mix(in srgb, var(--accent) ${18 + heat * 82}%, var(--surface-2))`
              }
              opacity={hover === null || hover === hour ? 1 : 0.35}
              onPointerEnter={() => setHover(hour)}
            />
          );
        })}

        {[0, 6, 12, 18].map((hour) => {
          const angle = ((hour / 24) * 360 - 90) * (Math.PI / 180);
          const x = centre + (radius + thickness / 2 + 12) * Math.cos(angle);
          const y = centre + (radius + thickness / 2 + 12) * Math.sin(angle);

          return (
            <text key={hour} x={x} y={y + 3.5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--faint)">
              {hour}
            </text>
          );
        })}

        <text x={centre} y={centre - 10} textAnchor="middle" fontSize="12" fill="var(--muted)">
          {shown === null ? t('quiet') : `${shown}:00–${(shown + 1) % 24}:00`}
        </text>
        <text x={centre} y={centre + 14} textAnchor="middle" fontSize="19" fontWeight="800" fill="var(--ink)">
          {shown === null ? '—' : compact(hours[shown])}
        </text>
        {shown !== null && shown === peakHour && hover === null && (
          <text x={centre} y={centre + 32} textAnchor="middle" fontSize="10" fill="var(--faint)">
            {t('the best hour')}
          </text>
        )}
      </svg>
      <span className="sr-only">{total > 0 ? format(total) : ''}</span>
    </div>
  );
}

// ==== The paying hour, week by week: a zoomed line, not an empty area ====

export interface TrendPoint {
  hours?: number;
  label: string;
  value: number;
}

export function TrendLine({ points }: { points: TrendPoint[] }) {
  const { format } = useMoney();
  const [id, gradient] = useBarGradient();
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = 200;
  const PAD = { top: 30, right: 76, bottom: 34, left: 46 };

  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  // A zoomed window shows drift, but a window without a scale reads as
  // nonsense — so the frame carries real ticks, and the floor never dips
  // below zero: an hourly rate has no negative half-plane.
  const floor = Math.max(0, low === high ? low * 0.85 : low - (high - low) * 0.3);
  const ceiling = low === high ? high * 1.15 || 1 : high + (high - low) * 0.3;

  const x = (index: number) =>
    PAD.left + (points.length === 1 ? (W - PAD.left - PAD.right) / 2 : ((W - PAD.left - PAD.right) * index) / (points.length - 1));
  const y = (value: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (value - floor) / (ceiling - floor));

  const path = smoothPath(points.map((point, index) => ({ x: x(index), y: y(point.value) })));
  const last = points.at(-1);
  const first = points[0];
  const change = first !== undefined && last !== undefined && first.value > 0 ? ((last.value - first.value) / first.value) * 100 : null;

  if (points.length === 0 || last === undefined) return null;

  const ticks = [floor, (floor + ceiling) / 2, ceiling];
  const maxHours = Math.max(1, ...points.map((point) => point.hours ?? 0));
  const area = `${path} L ${x(points.length - 1)} ${H - PAD.bottom} L ${x(0)} ${H - PAD.bottom} Z`;
  // Labels near the top edge would leave the frame; flip them under the dot.
  const labelY = (value: number) => (y(value) < PAD.top + 16 ? y(value) + 20 : y(value) - 12);
  const every = Math.max(1, Math.ceil(points.length / 10));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" onPointerLeave={() => setHover(null)}>
        <defs>{gradient}</defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray="2 5" />
            <text x={PAD.left - 6} y={y(tick) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--faint)">
              {format(Math.round(tick))}
            </text>
          </g>
        ))}

        {/* Hours behind each week, as quiet context: a spike priced on two
            hours is a different fact than one priced on forty. */}
        {points.map((point, index) =>
          point.hours !== undefined && point.hours > 0 ? (
            <rect
              key={`h-${index}`}
              x={x(index) - 5}
              y={H - PAD.bottom - (point.hours / maxHours) * 16}
              width={10}
              height={(point.hours / maxHours) * 16}
              rx={2}
              fill="var(--surface-2)"
            />
          ) : null,
        )}

        {points.length > 1 && <path d={area} fill={`url(#${id})`} opacity="0.14" />}
        {points.length > 1 && (
          <path d={path} fill="none" stroke={`url(#${id})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {points.map((point, index) => (
          <g key={index}>
            <circle
              cx={x(index)}
              cy={y(point.value)}
              r={index === points.length - 1 ? 6 : hover === index ? 5.5 : 3.5}
              fill={index === points.length - 1 ? 'var(--accent)' : 'var(--surface)'}
              stroke="var(--accent)"
              strokeWidth="2.5"
              className="pop"
              style={stagger(index)}
            />
            {(hover === index || index === points.length - 1) && (
              <text
                x={Math.min(x(index), W - PAD.right - 4)}
                y={labelY(point.value)}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="var(--ink)"
              >
                {format(point.value)}
                {point.hours !== undefined ? ` · ${Math.round(point.hours)}ч` : ''}
              </text>
            )}
            {(index % every === 0 || index === points.length - 1) && (
              <text x={x(index)} y={H - 6} textAnchor="middle" fontSize="9.5" fill="var(--faint)">
                {point.label}
              </text>
            )}
            <rect
              x={x(index) - (W - PAD.left - PAD.right) / Math.max(1, points.length - 1) / 2}
              y={0}
              width={(W - PAD.left - PAD.right) / Math.max(1, points.length - 1)}
              height={H}
              fill="transparent"
              onPointerEnter={() => setHover(index)}
            />
          </g>
        ))}

        {change !== null && Math.abs(change) >= 0.5 && (
          <text
            x={W - PAD.right + 12}
            y={Math.max(PAD.top + 10, Math.min(H - PAD.bottom - 4, y(last.value) + 4))}
            fontSize="12.5"
            fontWeight="800"
            fill={change >= 0 ? 'var(--good)' : 'var(--danger)'}
          >
            {change >= 0 ? '↑' : '↓'} {Math.abs(Math.round(change))}%
          </text>
        )}
      </svg>
    </div>
  );
}


/**
 * The range, day by day, shaped like what it is. A month is drawn as an
 * actual calendar — big cells, day numbers, money in the fill — because
 * that is how people think about a month. Anything longer becomes month
 * strips with a total on the right, so a year is twelve readable rows
 * rather than a field of 10px dots lost in an empty card.
 */
export function DaysAtGlance({
  values,
  from,
  to,
}: {
  values: ReadonlyMap<string, number>;
  from: string;
  to: string;
}) {
  const { lang } = useI18n();
  const { format } = useMoney();
  const [hover, setHover] = useState<string | null>(null);

  const keys = useMemo(() => keysBetween(from, to), [from, to]);
  const peak = useMemo(() => Math.max(1, ...keys.map((key) => values.get(key) ?? 0)), [keys, values]);
  const today = todayKey();

  const fill = (value: number) =>
    value === 0
      ? 'var(--surface-2)'
      : `color-mix(in srgb, var(--heat) ${25 + Math.round((value / peak) * 75)}%, var(--surface-2))`;

  const readout =
    hover !== null ? (
      <>
        <b className="text-ink">{formatDayLabel(hover, lang)}</b>
        {' · '}
        {(values.get(hover) ?? 0) > 0 ? format(values.get(hover) ?? 0) : '—'}
      </>
    ) : (
      <>
        {keys.filter((key) => (values.get(key) ?? 0) > 0).length} / {keys.length}
      </>
    );

  // ==== A month: the calendar itself ====
  if (keys.length <= 45) {
    const offset = (fromKey(keys[0]).getDay() + 6) % 7;
    const cells: (string | null)[] = [...new Array<null>(offset).fill(null), ...keys];
    const weekdays = Array.from({ length: 7 }, (_, day) =>
      new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(2024, 0, day + 1)),
    );

    return (
      <div onPointerLeave={() => setHover(null)}>
        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((name) => (
            <span key={name} className="pb-0.5 text-center text-[0.62rem] font-semibold uppercase tracking-wide text-faint">
              {name}
            </span>
          ))}
          {cells.map((key, index) =>
            key === null ? (
              <span key={`pad-${index}`} />
            ) : (
              <button
                type="button"
                key={key}
                className={`relative h-11 rounded-(--radius) text-left transition-transform hover:scale-[1.05] ${key === today ? 'ring-2 ring-(--accent)' : ''}`}
                style={{ background: fill(values.get(key) ?? 0) }}
                onPointerEnter={() => setHover(key)}
                onFocus={() => setHover(key)}
              >
                <span className={`absolute left-1.5 top-1 text-[0.64rem] font-semibold tabular ${(values.get(key) ?? 0) > 0 ? 'text-ink/70' : 'text-faint'}`}>
                  {Number(key.slice(8))}
                </span>
                {(values.get(key) ?? 0) > 0 && (
                  <span className="absolute bottom-1 right-1.5 hidden text-[0.7rem] font-bold tabular sm:block">
                    {format(values.get(key) ?? 0)}
                  </span>
                )}
              </button>
            ),
          )}
        </div>
        <p className="field-hint mt-2 tabular">{readout}</p>
      </div>
    );
  }

  // ==== Longer: one strip per month, totals on the right ====
  const months = new Map<string, string[]>();

  for (const key of keys) {
    const month = key.slice(0, 7);
    const list = months.get(month) ?? [];

    list.push(key);
    months.set(month, list);
  }

  return (
    <div onPointerLeave={() => setHover(null)}>
      <div className="flex flex-col gap-1">
        {[...months.entries()].map(([month, days]) => {
          const total = days.reduce((sum, key) => sum + (values.get(key) ?? 0), 0);

          return (
            <div key={month} className="grid grid-cols-[2.6rem_1fr_auto] items-center gap-2">
              <span className="text-[0.72rem] font-semibold capitalize text-muted">
                {new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(`${month}-15T00:00:00`))}
              </span>
              <span className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(31, minmax(0, 1fr))' }}>
                {days.map((key) => (
                  /* Three hundred and sixty-five buttons with nothing in
                     them: a screen reader read «button» once a day for a
                     year. Each one says its date and its figure. */
                  <button
                    type="button"
                    key={key}
                    className={`h-5 rounded-[3px] ${key === today ? 'ring-1 ring-(--accent)' : ''}`}
                    style={{ background: fill(values.get(key) ?? 0), gridColumnStart: Number(key.slice(8)) }}
                    aria-label={`${formatDayLabelShort(key, lang)} · ${format(values.get(key) ?? 0)}`}
                    onPointerEnter={() => setHover(key)}
                    onFocus={() => setHover(key)}
                  />
                ))}
              </span>
              <span className={`min-w-16 text-right text-[0.78rem] font-semibold tabular ${total === 0 ? 'text-faint' : ''}`}>
                {total === 0 ? '·' : format(total)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="field-hint mt-2 tabular">{readout}</p>
    </div>
  );
}

/**
 * Which nights actually tip. The bar is the average a day of that weekday
 * brings; the number beside it is what share of the day that was, because
 * ₴400 on a ₴4 000 night and ₴400 on a ₴800 one are not the same result.
 */
export function TipWeek({ rows }: { rows: TipDay[] }) {
  const { t, n } = useI18n();
  const { format } = useMoney();

  const peak = Math.max(1, ...rows.map((row) => row.average));
  const byDay = new Map(rows.map((row) => [row.weekday, row]));
  const best = rows.reduce<TipDay | null>(
    (top, row) => (top === null || row.average > top.average ? row : top),
    null,
  );

  return (
    <div className="flex flex-col gap-[7px]">
      {BAND_DAYS.map((name, weekday) => {
        const row = byDay.get(weekday);

        return (
          <div key={name} className="flex items-center gap-2.5">
            <span
              className={`w-7 flex-none text-[0.72rem] ${
                row !== undefined ? 'font-semibold' : 'text-faint'
              }`}
            >
              {t(name)}
            </span>

            <span className="relative h-[18px] min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
              {row !== undefined && row.average > 0 && (
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.max(4, (row.average / peak) * 100)}%`,
                    background: row.weekday === best?.weekday ? 'var(--accent)' : 'var(--s3)',
                  }}
                />
              )}
            </span>

            <span className="w-[8.5rem] flex-none text-right text-[0.72rem] tabular">
              {row === undefined ? (
                <span className="text-faint">·</span>
              ) : (
                <>
                  <b>{format(Math.round(row.average))}</b>
                  <span className="text-muted"> · {Math.round(row.share * 100)}%</span>
                </>
              )}
            </span>
          </div>
        );
      })}

      {best !== null && (
        <p className="field-hint mt-1">
          {t('Best for tips:')} <b className="text-ink">{t(BAND_DAYS[best.weekday])}</b>
          {' · '}
          {/* Russian has three forms after a number, so the count and the
              word are one call rather than a ternary. */}
          {t('averaging')} {format(Math.round(best.average))} {t('across')} {n(best.days, 'days')}
        </p>
      )}
    </div>
  );
}
