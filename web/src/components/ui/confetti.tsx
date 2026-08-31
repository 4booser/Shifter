'use client';

import { useEffect, useState } from 'react';

const HUES = ['var(--accent)', 'var(--good)', 'var(--warn)', 'var(--s1)', 'var(--s2)', 'var(--s3)'];

/**
 * A one-second shower over the card that earned it. Pure CSS, no library,
 * and nothing at all under reduced motion — a milestone is worth a breath
 * of colour, not a physics engine.
 */
export function ConfettiBurst() {
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    const handle = setTimeout(() => setAlive(false), 1_700);

    return () => clearTimeout(handle);
  }, []);

  if (!alive) return null;

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 26 }, (_, index) => {
        const left = (index * 37) % 100;
        const delay = ((index * 13) % 40) / 100;
        const spin = ((index * 47) % 360);
        const size = 5 + ((index * 7) % 6);

        return (
          <span
            key={index}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              background: HUES[index % HUES.length],
              width: size,
              height: size * 0.6,
              transform: `rotate(${spin}deg)`,
            }}
          />
        );
      })}
    </span>
  );
}
