'use client';

import { useState } from 'react';

import { Punchcard, WaterfallStep } from '@/lib/charts/report-math';
import { stagger } from '@/lib/fx';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';

/*
 * The report visualisations: a waterfall of how the money assembled itself,
 * and a punchcard of when the work happens. Same rules as the chart kit —
 * one axis, thin marks, text in ink, hover everywhere.
 */

const W = 720;
const H = 240;
const PAD = { top: 26, right: 12, bottom: 26, left: 12 };

/** Sources climb, deductions hang, totals land — money as a staircase. */
export function WaterfallChart({ steps }: { steps: WaterfallStep[] }) {
  const { t } = useI18n();
  const { format, compact } = useMoney();
  const [hover, setHover] = useState<number | null>(null);

  if (steps.length === 0) return null;

  const peak = Math.max(...steps.map((step) => step.to), 1);
  const plotH = H - PAD.top - PAD.bottom;
  const plotW = W - PAD.left - PAD.right;
  const slot = plotW / steps.length;
  const width = Math.min(56, slot * 0.62);

  const y = (value: number) => PAD.top + plotH - (value / peak) * plotH;

  const colour = (step: WaterfallStep) =>
    step.kind === 'plus' ? 'var(--accent)' : step.kind === 'minus' ? 'var(--warn)' : 'var(--good)';

  const hovered = hover === null ? null : steps[hover];
  const hoveredX = hover === null ? 0 : PAD.left + slot * hover + slot / 2;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" onPointerLeave={() => setHover(null)}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--border)" />

        {steps.map((step, index) => {
          const x = PAD.left + slot * index + (slot - width) / 2;
          const top = y(step.to);
          const height = Math.max(2, y(step.from) - y(step.to));
          const next = steps[index + 1];

          return (
            <g key={step.key}>
              {/* The connector carrying the running total to the next bar. */}
              {next !== undefined && next.kind !== 'total' && (
                <line
                  x1={x + width}
                  x2={PAD.left + slot * (index + 1) + (slot - width) / 2}
                  y1={step.kind === 'minus' ? y(step.from) : top}
                  y2={step.kind === 'minus' ? y(step.from) : top}
                  stroke="var(--border-strong)"
                  strokeDasharray="3 3"
                />
              )}
              <rect
                className="grow-y"
                style={stagger(index)}
                x={x}
                y={top}
                width={width}
                height={height}
                rx="4"
                fill={colour(step)}
                opacity={hover === null || hover === index ? (step.kind === 'minus' ? 0.85 : 1) : 0.4}
              />
              <text x={x + width / 2} y={top - 6} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--muted)">
                {step.kind === 'minus' ? `−${compact(step.value)}` : compact(step.value)}
              </text>
              <text x={x + width / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--faint)">
                {t(step.key)}
              </text>
              <rect
                x={PAD.left + slot * index}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onPointerEnter={() => setHover(index)}
              />
            </g>
          );
        })}
      </svg>

      {hovered !== null && (
        <div
          className="card pointer-events-none absolute top-0 z-10 -translate-x-1/2 px-2.5 py-1.5 text-[0.78rem] shadow-(--shadow-lg)"
          style={{ left: `${(hoveredX / W) * 100}%` }}
        >
          <span className="field-hint block">{t(hovered.key)}</span>
          <strong className="tabular">
            {hovered.kind === 'minus' ? '−' : ''}
            {format(hovered.value)}
          </strong>
        </div>
      )}
    </div>
  );
}

const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Weekday × starting hour. Bubble area says how often that slot is worked,
 * colour how much its hour pays — the two questions of any second job.
 */
export function PunchcardChart({ card }: { card: Punchcard }) {
  const { t } = useI18n();
  const { format } = useMoney();
  const [hover, setHover] = useState<number | null>(null);

  const hours: number[] = [];

  for (let hour = card.hourFrom; hour <= card.hourTo; hour += 1) hours.push(hour);

  const cellSize = 2.1;
  const hovered = hover === null ? null : card.cells[hover];

  return (
    <div className="relative overflow-x-auto">
      <div
        className="grid min-w-[24rem] gap-[3px]"
        style={{ gridTemplateColumns: `2.2rem repeat(${hours.length}, minmax(0, 1fr))` }}
        onPointerLeave={() => setHover(null)}
      >
        {WEEKDAY_KEYS.map((name, weekday) => (
          <div key={name} className="contents">
            <span className="flex items-center text-[0.68rem] text-faint">{t(name)}</span>
            {hours.map((hour) => {
              const index = card.cells.findIndex((cell) => cell.weekday === weekday && cell.hour === hour);
              const cell = index === -1 ? null : card.cells[index];
              const share = cell === null ? 0 : Math.sqrt(cell.count / card.maxCount);
              const heat = cell === null || card.maxPerHour === 0 ? 0 : cell.perHour / card.maxPerHour;

              return (
                <span
                  key={hour}
                  className="relative flex items-center justify-center"
                  style={{ height: `${cellSize}rem` }}
                  onPointerEnter={() => cell !== null && setHover(index)}
                >
                  <span className="absolute inset-[42%] rounded-full bg-(--surface-2)" />
                  {cell !== null && (
                    <span
                      className="pop relative rounded-full"
                      style={{
                        width: `${Math.max(0.5, share * cellSize * 0.92)}rem`,
                        height: `${Math.max(0.5, share * cellSize * 0.92)}rem`,
                        background: `color-mix(in srgb, var(--accent) ${25 + heat * 75}%, var(--surface-2))`,
                        outline: hover === index ? '2px solid var(--accent)' : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  )}
                </span>
              );
            })}
          </div>
        ))}

        <span />
        {hours.map((hour) => (
          <span key={hour} className="text-center text-[0.64rem] text-faint tabular">
            {hour}
          </span>
        ))}
      </div>

      {hovered !== null && (
        <div className="card pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 text-[0.78rem] shadow-(--shadow-lg)">
          <span className="field-hint block">
            {t(WEEKDAY_KEYS[hovered.weekday])} · {hovered.hour}:00 · ×{hovered.count}
          </span>
          <strong className="tabular">{format(hovered.perHour)}</strong>{' '}
          <span className="field-hint">{t('per hour')}</span>
        </div>
      )}
    </div>
  );
}
