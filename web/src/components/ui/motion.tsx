'use client';

import { animate, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';

/**
 * The app's motion vocabulary, kept deliberately small.
 *
 * Numbers roll to their values, cards rise once, charts draw themselves in.
 * Three verbs, used consistently, read as one product; a different easing on
 * every screen reads as a template. Everything here collapses to stillness
 * under prefers-reduced-motion, because motion is seasoning and some people
 * have asked the OS to hold it.
 */

/**
 * A number that rolls to its value.
 *
 * The rolling is presentation only: the DOM lands on the exact figure, and
 * anyone copying it copies the truth. Formatting is injected so this stays
 * ignorant of currencies and locales.
 */
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

  useEffect(() => {
    const node = host.current;

    if (node === null) return;

    if (still === true) {
      node.textContent = format(value);
      previous.current = value;

      return;
    }

    const controls = animate(previous.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        node.textContent = format(latest);
      },
      onComplete: () => {
        node.textContent = format(value);
      },
    });

    previous.current = value;

    return () => controls.stop();
  }, [value, format, duration, still]);

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
