import type { ReactNode } from 'react';

import { heatStep } from './heat-steps';

/**
 * Twenty-four segments of fifteen degrees, midnight at the top, each coloured
 * by the step its hour's value falls in; hours without a record stay hollow.
 */
export function ClockRing24({
  hours,
  size = 192,
  children,
  label,
}: {
  /** Twenty-four values, one per hour starting at 00:00; 0 means no record. */
  hours: number[];
  size?: number;
  children?: ReactNode;
  label?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 22;
  const width = 11;
  const present = hours.filter((h) => h > 0);
  const step = heatStep(present);
  const gap = 1.6;

  const arc = (i: number) => {
    const a0 = ((i * 15 + gap - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * 15 - gap - 90) * Math.PI) / 180;

    return `M ${(cx + r * Math.cos(a0)).toFixed(2)} ${(cy + r * Math.sin(a0)).toFixed(2)} A ${r} ${r} 0 0 1 ${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)}`;
  };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
        {hours.map((value, i) => (
          <path
            key={i}
            d={arc(i)}
            fill="none"
            strokeWidth={width}
            stroke={value > 0 ? `var(--heat-${step(value)})` : 'var(--border-strong)'}
            opacity={value > 0 ? 1 : 0.45}
          />
        ))}
        {[
          [0, cx, 11, 'middle'],
          [6, size - 6, cy + 4, 'end'],
          [12, cx, size - 4, 'middle'],
          [18, 6, cy + 4, 'start'],
        ].map(([h, x, y, anchor]) => (
          <text key={h} x={x} y={y} textAnchor={anchor as 'middle' | 'end' | 'start'} className="axis">
            {h}
          </text>
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
