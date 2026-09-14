'use client';

import { useCallback, useRef, useState } from 'react';

/** The hover layer every bank chart shares. */
export interface HoverPoint<T> {
  /** Horizontal position inside the container, px. */
  x: number;
  datum: T;
}

export function useChartHover<T>() {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverPoint<T> | null>(null);

  const onMove = useCallback(
    (event: React.MouseEvent, points: { x: number; datum: T }[]) => {
      const box = ref.current?.getBoundingClientRect();

      if (box === undefined || points.length === 0) return;

      const x = event.clientX - box.left;
      let best = points[0];

      for (const point of points) {
        if (Math.abs(point.x - x) < Math.abs(best.x - x)) best = point;
      }

      setHover({ x: best.x, datum: best.datum });
    },
    [],
  );

  const onLeave = useCallback(() => setHover(null), []);

  return { ref, hover, onMove, onLeave };
}

/** The floating answer. */
export function ChartTip({
  x,
  children,
}: {
  x: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 min-w-28 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.78rem] shadow-(--shadow-lg)"
      style={{ left: `clamp(3.5rem, ${x}px, calc(100% - 3.5rem))` }}
    >
      {children}
    </div>
  );
}

/** The vertical crosshair under the tooltip. */
export function CrossHair({ x }: { x: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 w-px bg-(--border-strong)"
      style={{ left: x }}
      aria-hidden
    />
  );
}
