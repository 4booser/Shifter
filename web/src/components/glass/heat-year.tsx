'use client';

import { useI18n } from '@/lib/i18n';

import { heatStep, heatThresholds } from './heat-steps';

const CELL = 18;
const PITCH = 22;
const LEFT = 30;
const TOP = 20;

function keyOf(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');

  return `${y}-${m}-${d}`;
}

function parse(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);

  return new Date(y, m - 1, d);
}

/**
 * A calendar of weeks, seven rows, cells that never stretch: from the Monday
 * of `from` to `to`, a day without a record is hollow, a day with one is
 * coloured by the step its value falls in. Wider than the pane it scrolls.
 */
export function HeatYear({
  values,
  from,
  to,
  today,
  format,
  legend = true,
}: {
  /** date key → the day's figure; zero and missing both mean no record. */
  values: Map<string, number>;
  from: string;
  to: string;
  today?: string;
  /** Formats a figure for the legend. */
  format: (value: number) => string;
  legend?: boolean;
}) {
  const { lang, t } = useI18n();
  const first = parse(from);
  const start = new Date(first);

  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));

  const end = parse(to);
  const weeks = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (7 * 86_400_000)) + 1);
  const recorded = [...values.values()].filter((v) => v > 0);
  const step = heatStep(recorded);
  const thresholds = heatThresholds(recorded);
  const counts = [0, 0, 0, 0, 0, 0];

  for (const v of recorded) counts[step(v)] += 1;

  const cells: { x: number; y: number; key: string; value: number | undefined; first: boolean }[] = [];
  const months: { x: number; label: string }[] = [];

  for (let w = 0; w < weeks; w += 1) {
    for (let r = 0; r < 7; r += 1) {
      const day = new Date(start);

      day.setDate(start.getDate() + w * 7 + r);

      if (day > end) continue;

      const key = keyOf(day);
      const x = LEFT + w * PITCH;

      if (day.getDate() === 1 || (w === 0 && r === 0)) {
        months.push({ x, label: day.toLocaleDateString(lang, { month: 'short' }) });
      }

      cells.push({ x, y: TOP + r * PITCH, key, value: values.get(key), first: day.getDate() === 1 });
    }
  }

  const width = LEFT + weeks * PITCH;
  const height = TOP + 7 * PITCH;
  const weekday = (offset: number) => {
    const d = new Date(start);

    d.setDate(start.getDate() + offset);

    return d.toLocaleDateString(lang, { weekday: 'short' });
  };
  const steps = [1, 2, 3, 4, 5] as const;
  const labels =
    thresholds.length === 0
      ? []
      : [
          `${t('up to')} ${format(thresholds[0])}`,
          `${format(thresholds[0])}–${format(thresholds[1])}`,
          `${format(thresholds[1])}–${format(thresholds[2])}`,
          `${format(thresholds[2])}–${format(thresholds[3])}`,
          `${t('above')} ${format(thresholds[3])}`,
        ];

  return (
    <div className="glass-well flex items-stretch gap-6 overflow-x-auto p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="shrink-0"
        role="img"
        aria-label={t('Each cell is a day; the colour is the day’s figure')}
      >
        {months.map((m) => (
          <text key={`${m.x}-${m.label}`} x={m.x} y={12} className="axis">
            {m.label}
          </text>
        ))}
        {[0, 2, 4, 6].map((r) => (
          <text key={r} x={0} y={TOP + r * PITCH + 13} className="axis">
            {weekday(r)}
          </text>
        ))}
        {cells.map((c) =>
          c.value === undefined || c.value <= 0 ? (
            <rect key={c.key} x={c.x} y={c.y} width={CELL} height={CELL} rx={4} fill="none" stroke="var(--border-strong)" />
          ) : (
            <rect
              key={c.key}
              x={c.x}
              y={c.y}
              width={CELL}
              height={CELL}
              rx={4}
              fill={`var(--heat-${step(c.value)})`}
              stroke={c.key === today ? 'var(--text)' : 'none'}
              strokeWidth={c.key === today ? 2 : 0}
            >
              <title>{`${c.key} · ${format(c.value)}`}</title>
            </rect>
          ),
        )}
      </svg>
      {legend && (
        <div className="flex min-w-[13rem] flex-col justify-center border-l border-(--border)/60 pl-5">
          <div className="th">{t('Colour steps')}</div>
          {thresholds.length === 0 ? (
            <p className="mt-2 text-[0.8rem] text-muted">
              {recorded.length} {t('days recorded')} · {t('colour appears after eight different days')}
            </p>
          ) : (
            <div className="mt-2">
              {steps.map((s) => (
                <div
                  key={s}
                  className="flex items-center justify-between gap-3 border-t border-(--border)/50 py-1.5 text-[0.8rem] first:border-t-0"
                >
                  <span className="flex items-center gap-2">
                    <i className="h-3.5 w-3.5 rounded-[4px]" style={{ background: `var(--heat-${s})` }} />
                    <span className="text-muted">{labels[s - 1]}</span>
                  </span>
                  <b className="tabular">{counts[s]}</b>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[0.72rem] text-faint">
            {recorded.length} {t('days recorded')} · {weeks} {t('weeks')} · {t('hollow cell — a day without a record')}
          </p>
        </div>
      )}
    </div>
  );
}
