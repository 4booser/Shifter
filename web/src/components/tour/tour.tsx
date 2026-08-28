'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useDialogKeys } from '@/lib/a11y';
import { useI18n } from '@/lib/i18n';

/**
 * A one-time spotlight walk over what is new: shade everything, ring one
 * thing, say one sentence about it. Steps whose targets are not on the page
 * are skipped, so the tour survives layout changes without breaking.
 */

const SEEN_KEY = 'shifter.tour.v1';

/** Anything can start the tour by firing this; the palette does. */
export const TOUR_EVENT = 'shifter:tour';

interface Step {
  target: string;
  title: string;
  text: string;
}

const STEPS: Step[] = [
  {
    target: 'tiles',
    title: 'Your month at a glance',
    text: 'Pace, goal, payday, streak — every tile opens the page that explains it, and the Tiles button lets you choose and reorder them.',
  },
  {
    target: 'daypanel',
    title: 'The day, in one column',
    text: 'Shifts, tips and sales for whichever day is selected. On today, a planned shift can be started live — the header will count your money as you work.',
  },
  {
    target: 'sidebar',
    title: 'Places, shifts, brushes',
    text: 'Pick a shift and paint it across the calendar; patterns, colour schemes and last week live here too.',
  },
  {
    target: 'palette',
    title: 'Everything is one key away',
    text: 'Cmd+K — or this button — opens the command palette: pages, themes, starting a shift, the monthly report.',
  },
];

interface Placed {
  rect: DOMRect;
  step: Step;
}

export function FeatureTour() {
  const { t } = useI18n();
  const [steps, setSteps] = useState<Step[]>([]);
  const [index, setIndex] = useState(0);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const begin = useCallback(() => {
    const present = STEPS.filter(
      (step) => document.querySelector(`[data-tour="${step.target}"]`) !== null,
    );

    if (present.length === 0) return;

    setSteps(present);
    setIndex(0);
  }, []);

  // First visit: wait for the dashboard to settle, then offer the walk.
  useEffect(() => {
    const onDemand = () => begin();

    addEventListener(TOUR_EVENT, onDemand);

    let handle = 0;

    if (localStorage.getItem(SEEN_KEY) === null) {
      handle = window.setTimeout(() => {
        if (document.querySelector('[data-tour="tiles"]') !== null) begin();
      }, 2200);
    }

    return () => {
      removeEventListener(TOUR_EVENT, onDemand);
      clearTimeout(handle);
    };
  }, [begin]);

  const step = steps[index];

  // Measure the target, and keep measuring while the page moves under us.
  useEffect(() => {
    if (step === undefined) {
      setPlaced(null);

      return;
    }

    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);

      if (el === null) {
        setPlaced(null);

        return;
      }

      setPlaced({ rect: el.getBoundingClientRect(), step });
    };

    const el = document.querySelector(`[data-tour="${step.target}"]`);

    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    // After the smooth scroll has had a moment to land.
    const settle = setTimeout(measure, 350);

    measure();
    addEventListener('resize', measure);
    addEventListener('scroll', measure, { passive: true });

    return () => {
      clearTimeout(settle);
      removeEventListener('resize', measure);
      removeEventListener('scroll', measure);
    };
  }, [step]);

  // Above the early return, because hooks cannot be conditional — and because
  // a tour with no way out is the worst overlay to be stuck behind.
  const finish = useCallback(() => {
    localStorage.setItem(SEEN_KEY, 'seen');
    setSteps([]);
  }, []);

  useDialogKeys(steps.length > 0, root, finish);

  if (step === undefined || placed === null || steps.length === 0) return null;

  const { rect } = placed;
  const below = rect.bottom + 200 < innerHeight;
  const clamp = (value: number) => Math.max(12, Math.min(value, innerHeight - 210));
  const cardTop = below ? clamp(rect.bottom + 14) : undefined;
  const cardBottom = below ? undefined : Math.max(12, Math.min(innerHeight - rect.top + 14, innerHeight - 180));
  const cardLeft = Math.max(12, Math.min(rect.left + rect.width / 2 - 160, innerWidth - 332));

  return (
    <div ref={root} className="fixed inset-0 z-[97]" role="dialog" aria-modal="true" aria-label={t('Feature tour')}>
      <div className="absolute inset-0" onClick={finish} />
      <div
        className="tour-ring"
        style={{
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
        }}
      />
      <div
        key={index}
        className="tour-card"
        style={{ top: cardTop, bottom: cardBottom, left: cardLeft }}
      >
        <strong className="block text-[0.95rem]">{t(step.title)}</strong>
        <p className="field-hint mt-1">{t(step.text)}</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="flex gap-1">
            {steps.map((_, dot) => (
              <span
                key={dot}
                className={`h-1.5 w-1.5 rounded-full ${dot === index ? 'bg-(--accent)' : 'bg-surface-2'}`}
              />
            ))}
          </span>
          <button type="button" className="btn btn-quiet btn-sm ml-auto" onClick={finish}>
            {t('Skip')}
          </button>
          {index > 0 && (
            <button type="button" className="btn btn-sm" onClick={() => setIndex(index - 1)}>
              {t('Back')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => (index + 1 < steps.length ? setIndex(index + 1) : finish())}
          >
            {index + 1 < steps.length ? t('Next') : t('Got it')}
          </button>
        </div>
      </div>
    </div>
  );
}
