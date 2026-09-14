'use client';

import { animate, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';

/** The app's motion vocabulary, kept deliberately small. */

/** A number that rolls to its value. */
export function CountUp({
  value,
  format,
  duration = 0.9,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const still = useReducedMotion();
  const previous = useRef(0);

  /* `format` держим в ref, а не в зависимостях. */
  const shape = useRef(format);

  shape.current = format;

  useEffect(() => {
    const node = host.current;

    if (node === null) return;

    /* Ни анимации, ни половины числа в фоновой вкладке. */
    if (still === true || document.visibilityState === 'hidden') {
      node.textContent = shape.current(value);
      previous.current = value;

      return;
    }

    // Остановленная анимация не имеет права писать: без этого флага
    // последний кадр отменённого прогона выигрывает гонку у актуального.
    let live = true;

    const controls = animate(previous.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        if (live) node.textContent = shape.current(latest);
      },
      onComplete: () => {
        if (live) node.textContent = shape.current(value);
      },
    });

    previous.current = value;

    return () => {
      live = false;
      controls.stop();
    };
  }, [value, duration, still]);

  // The real value is in the DOM before any animation runs, so a crawler, a
  // screen reader or a paused tab all read the truth.
  return <span ref={host}>{format(value)}</span>;
}

/** A card that rises into place once, in the app's one easing. */
export function Rise({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const still = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={still === true ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** An SVG path that draws itself left to right. */
export function DrawnPath(props: React.ComponentProps<typeof motion.path>) {
  const still = useReducedMotion();

  return (
    <motion.path
      {...props}
      initial={still === true ? false : { pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
    />
  );
}
