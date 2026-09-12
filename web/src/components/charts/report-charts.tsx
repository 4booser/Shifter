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

const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface DonutSlice {
  label: string;
  value: number;
  colour: string;
}

/** Shares of one whole with the total in the middle; hover names the slice. */
export function Donut({ slices, centreLabel }: { slices: DonutSlice[]; centreLabel: string }) {
  const { format, compact } = useMoney();
  const [hover, setHover] = useState<number | null>(null);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0) return null;

  const size = 190;
  const centre = size / 2;
  const radius = 74;
  const circumference = 2 * Math.PI * radius;
  const gap = slices.length > 1 ? 2.5 : 0;

  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" onPointerLeave={() => setHover(null)}>
        {slices.map((slice, index) => {
          const share = slice.value / total;
          const length = Math.max(0, share * circumference - gap);
          const start = offset;

          offset += share * circumference;

          return (
            <circle
              key={slice.label}
              className="donut-arc"
              style={stagger(index)}
              cx={centre}
              cy={centre}
              r={radius}
              fill="none"
              stroke={slice.colour}
              strokeWidth={hover === index ? 26 : 20}
              strokeLinecap="butt"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-start}
              opacity={hover === null || hover === index ? 1 : 0.35}
              onPointerEnter={() => setHover(index)}
            />
          );
        })}
        <g className="rotate-90" style={{ transformOrigin: 'center' }}>
          <text x={centre} y={centre - 2} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--ink)">
            {hover === null ? compact(total) : compact(slices[hover].value)}
          </text>
          <text x={centre} y={centre + 14} textAnchor="middle" fontSize="9.5" fill="var(--faint)">
            {hover === null ? centreLabel : slices[hover].label}
          </text>
        </g>
      </svg>

      <ul className="flex min-w-40 flex-col gap-1.5">
        {slices.map((slice, index) => (
          <li
            key={slice.label}
            className="flex cursor-default items-center gap-2 text-[0.82rem]"
            style={{ opacity: hover === null || hover === index ? 1 : 0.45 }}
            onPointerEnter={() => setHover(index)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: slice.colour }} />
            <span className="min-w-0 flex-1 truncate" title={slice.label}>{slice.label}</span>
            <span className="tabular text-muted">{Math.round((slice.value / total) * 100)}%</span>
            <span className="tabular font-semibold">{format(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
