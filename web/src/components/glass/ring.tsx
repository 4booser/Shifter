import type { ReactNode } from 'react';

/** A progress ring, 10px stroke on a faint track, with whatever sits in the middle. */
export function Ring({
  value,
  size = 112,
  stroke = 10,
  children,
  label,
}: {
  /** 0..1, clamped. */
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = Math.max(0, Math.min(1, value));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} opacity={0.6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(share * c).toFixed(2)} ${c.toFixed(2)}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** The half ring for «enough for N days»: a gauge from empty to a year. */
export function HalfRing({
  value,
  size = 150,
  stroke = 12,
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const half = Math.PI * r;
  const share = Math.max(0, Math.min(1, value));
  const cx = size / 2;
  const cy = size / 2;
  const d = `M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size / 2 + stroke }}>
      <svg viewBox={`0 0 ${size} ${size / 2 + stroke}`} width={size} height={size / 2 + stroke} role="img" aria-label={label}>
        <path d={d} fill="none" stroke="var(--border)" strokeWidth={stroke} strokeLinecap="round" opacity={0.6} />
        <path
          d={d}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(share * half).toFixed(2)} ${half.toFixed(2)}`}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center">{children}</div>
    </div>
  );
}
