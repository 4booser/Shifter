import { useEffect, useRef, useState } from 'react';

/**
 * The width a chart actually has, measured.
 *
 * An SVG with a viewBox and `width: 100%` scales its height with its width,
 * so the same chart is 260px tall in a side panel and 520px tall across a
 * desktop — which is how a page ends up with one graph and nothing else on
 * it. Measuring instead keeps the height the chart was designed at and lets
 * only the horizontal axis stretch.
 */
export function useChartWidth(fallback = 720): [React.RefObject<HTMLDivElement | null>, number] {
  const host = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = host.current;

    if (node === null) return;

    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;

      // Rounded: a fractional pixel from a flex layout would otherwise
      // re-render the chart on every scrollbar appearing anywhere.
      if (measured > 0) setWidth(Math.round(measured));
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return [host, width];
}
