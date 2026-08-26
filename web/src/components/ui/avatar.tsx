'use client';

import { useEffect, useRef } from 'react';

/**
 * The face used everywhere a person appears. Three kinds:
 * photo — a small JPEG data URL; preset — "emoji|#colour"; weave — a
 * deterministic thread pattern grown from a seed (for us: the person's own
 * punch-card), unique the way a work schedule is. Fallback: initials.
 */
export function Avatar({
  kind,
  data,
  name,
  size = 32,
}: {
  kind: string | null;
  data: string | null;
  name: string;
  size?: number;
}) {
  if (kind === 'photo' && data !== null) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={data} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }

  if (kind === 'preset' && data !== null && data.includes('|')) {
    const [emoji, colour] = data.split('|');

    return (
      <span
        className="grid flex-none place-items-center rounded-full"
        style={{ width: size, height: size, background: colour, fontSize: size * 0.55 }}
        aria-hidden
      >
        {emoji}
      </span>
    );
  }

  if (kind === 'weave' && data !== null) {
    return <Weave seed={data} size={size} />;
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <span
      className="grid flex-none place-items-center rounded-full bg-(--accent) font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {initials || '•'}
    </span>
  );
}

/** Tiny deterministic PRNG so the same seed always weaves the same cloth. */
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An avatar woven from a schedule. The seed encodes 7×4 intensity cells
 * (the person's real hours by weekday × week); threads run vertical for
 * worked weight, horizontal for the accent, giving everyone a cloth as
 * individual as their rota. Falls back to hashing the raw seed string.
 */
export function Weave({ seed, size = 32 }: { seed: string; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;

    if (node === null) return;

    const scale = 2;
    const px = size * scale;

    node.width = px;
    node.height = px;

    const ctx = node.getContext('2d');

    if (ctx === null) return;

    let hash = 0;

    for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;

    const random = mulberry(hash);
    const accentHue = Math.floor(random() * 360);
    const cells = seed.match(/\d/g)?.map(Number) ?? [];

    ctx.fillStyle = `oklch(0.24 0.03 ${accentHue})`;
    ctx.fillRect(0, 0, px, px);

    const bands = 9;
    const band = px / bands;

    for (let i = 0; i < bands; i++) {
      // Weight from real schedule digits where present; woven noise otherwise.
      const weight = cells.length > 0 ? (cells[i % cells.length] ?? 0) / 9 : random();
      const vertical = i % 2 === 0;
      const light = 0.45 + weight * 0.4;

      ctx.fillStyle = `oklch(${light} ${0.11 + weight * 0.12} ${(accentHue + (vertical ? 0 : 40)) % 360})`;

      if (vertical) ctx.fillRect(i * band, 0, band * 0.72, px);
      else ctx.fillRect(0, i * band, px, band * 0.72);
    }
  }, [seed, size]);

  return <canvas ref={canvas} className="flex-none rounded-full" style={{ width: size, height: size }} aria-hidden />;
}
