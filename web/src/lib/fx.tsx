'use client';

import { useEffect, useRef } from 'react';

/**
 * Motion utilities. Everything respects the reduced-motion setting through the
 * --motion custom property the settings store maintains — a duration
 * multiplied by zero is no animation at all.
 */

/**
 * Reveals `.reveal` children in a stagger. Deliberately not an
 * IntersectionObserver: background windows throttle those into never firing,
 * and a card that never appears is worse than one that animated off-screen.
 * Runs after every render and only touches elements not yet revealed, so
 * content that arrives later joins the cascade instead of missing it.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const host = ref.current;

    if (host === null) return;

    const fresh = [...host.querySelectorAll<HTMLElement>('.reveal:not(.in)')];

    if (fresh.length === 0) return;

    fresh.forEach((el, index) => {
      el.style.setProperty('--i', String(index % 12));
      // Synchronous on purpose: the animation carries its own from-state, and
      // a requestAnimationFrame here never fires in a throttled window.
      el.classList.add('in');
    });
  });

  return ref;
}

/**
 * The safety net under useReveal: a MutationObserver that catches `.reveal`
 * elements arriving outside any host's render — a badge wall that fetches
 * before it draws, a panel mounted by someone else's state. Without this,
 * anything revealed after its page's last render stays at opacity 0 forever.
 * Mounted once from the shell.
 */
export function RevealObserver() {
  useEffect(() => {
    let order = 0;

    const admit = (el: HTMLElement) => {
      el.style.setProperty('--i', String(order % 12));
      order += 1;
      el.classList.add('in');
    };

    const sweep = (root: ParentNode) => {
      if (root instanceof HTMLElement && root.matches('.reveal:not(.in)')) admit(root);

      root.querySelectorAll?.<HTMLElement>('.reveal:not(.in)').forEach(admit);
    };

    sweep(document.body);

    const observer = new MutationObserver((mutations) => {
      order = 0;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) sweep(node);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}

/** Sets --i on children so CSS staggers them; cheap and rerender-safe. */
export function stagger(index: number): React.CSSProperties {
  return { ['--i' as string]: index };
}

// ==== Confetti ====

interface ConfettiOptions {
  /** 0..1 viewport coordinates of the burst origin. */
  x?: number;
  y?: number;
  count?: number;
}

/**
 * A one-off confetti burst on a throwaway canvas. Imperative because the
 * moments that deserve confetti (a finished shift, an unlocked badge) are
 * events, not state. The canvas ignores pointers and removes itself when the
 * last particle leaves the screen.
 */
export function fireConfetti({ x = 0.5, y = 0.4, count = 140 }: ConfettiOptions = {}): void {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset['motion'] === 'reduced') return;
  // A hidden tab gets no frames, so a burst fired into one hangs in mid-air
  // until somebody comes back — and if nobody does, a full-screen canvas sits
  // over the page for the rest of the session.
  if (document.visibilityState === 'hidden') return;

  const canvas = document.createElement('canvas');
  const scale = Math.min(2, devicePixelRatio || 1);

  canvas.width = innerWidth * scale;
  canvas.height = innerHeight * scale;
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:200';
  document.body.appendChild(canvas);

  const context = canvas.getContext('2d');

  if (context === null) {
    canvas.remove();

    return;
  }

  context.scale(scale, scale);

  const accent =
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4F46E5';
  const colours = [accent, '#eb6834', '#1baf7a', '#f2c832', '#3987e5', '#d95dc0'];

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    colour: string;
    spin: number;
    angle: number;
    /** Sway phase, so strips flutter instead of falling straight. */
    sway: number;
  }

  const particles: Particle[] = Array.from({ length: count }, () => {
    const direction = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;

    return {
      x: innerWidth * x,
      y: innerHeight * y,
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed - 7,
      size: 4 + Math.random() * 5,
      colour: colours[Math.floor(Math.random() * colours.length)],
      spin: (Math.random() - 0.5) * 0.3,
      angle: Math.random() * Math.PI,
      sway: Math.random() * Math.PI * 2,
    };
  });

  let frame = 0;

  const tick = () => {
    context.clearRect(0, 0, innerWidth, innerHeight);
    frame += 1;

    let alive = 0;

    for (const p of particles) {
      p.vy += 0.22;
      p.vx *= 0.99;
      p.x += p.vx + Math.sin(frame / 12 + p.sway) * 0.8;
      p.y += p.vy;
      p.angle += p.spin;

      if (p.y > innerHeight + 20) continue;

      alive += 1;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.angle);
      context.fillStyle = p.colour;
      // A strip, not a square: the fold as it rotates is what reads as paper.
      context.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      context.restore();
    }

    if (alive > 0) requestAnimationFrame(tick);
    else stop();
  };

  // Leaving mid-burst freezes the animation where it stands; the paper is not
  // worth keeping, so it goes with the tab's attention.
  const stop = () => {
    document.removeEventListener('visibilitychange', hide);
    canvas.remove();
  };

  const hide = () => {
    if (document.visibilityState === 'hidden') stop();
  };

  document.addEventListener('visibilitychange', hide);

  requestAnimationFrame(tick);
}

// ==== Pointer-reactive surfaces ====

/**
 * One delegated listener pair powering two effects everywhere at once:
 * `.glow` surfaces get --mx/--my for a cursor-following sheen, and `.tilt`
 * surfaces lean toward the pointer. Mounted once from the shell; elements
 * opt in by class alone, so new tiles get the physics for free.
 */
export function PointerFx() {
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (document.documentElement.dataset['motion'] === 'reduced') return;

      const target = (event.target as Element | null)?.closest<HTMLElement>('.glow, .tilt');

      if (target === null || target === undefined) return;

      const box = target.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width;
      const py = (event.clientY - box.top) / box.height;

      if (target.classList.contains('glow')) {
        target.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
        target.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      }

      if (target.classList.contains('tilt')) {
        target.style.setProperty('--tilt-y', `${((px - 0.5) * 6).toFixed(2)}deg`);
        target.style.setProperty('--tilt-x', `${((0.5 - py) * 6).toFixed(2)}deg`);
      }
    };

    const leave = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>('.tilt');

      target?.style.setProperty('--tilt-x', '0deg');
      target?.style.setProperty('--tilt-y', '0deg');
    };

    // pointerout bubbles; pointerleave does not, so delegation needs -out.
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerout', leave, { passive: true });

    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerout', leave);
    };
  }, []);

  return null;
}

/**
 * Material-style press ripples on every .btn, delegated the same way. The
 * span cleans itself up on animationend, so a button never accumulates them.
 */
export function PressRipple() {
  useEffect(() => {
    const press = (event: PointerEvent) => {
      if (document.documentElement.dataset['motion'] === 'reduced') return;

      const button = (event.target as Element | null)?.closest<HTMLElement>('.btn');

      if (button === null || button === undefined) return;

      const box = button.getBoundingClientRect();
      const span = document.createElement('span');
      const size = Math.max(box.width, box.height) * 2;

      span.className = 'ripple';
      span.style.width = span.style.height = `${size}px`;
      span.style.left = `${event.clientX - box.left - size / 2}px`;
      span.style.top = `${event.clientY - box.top - size / 2}px`;
      span.addEventListener('animationend', () => span.remove());
      button.appendChild(span);
    };

    document.addEventListener('pointerdown', press, { passive: true });

    return () => document.removeEventListener('pointerdown', press);
  }, []);

  return null;
}
