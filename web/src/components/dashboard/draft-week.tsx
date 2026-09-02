'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api/http';
import { shiftDays, todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { applyToDates, useCalendar } from '@/lib/store/calendar';
import { CountUp } from '@/components/ui/motion';
import { Money } from '@/components/ui/bits';

/**
 * «Если возьму эти смены» — the calculation everybody does in their head
 * before saying yes to a подработка, done by the server instead.
 *
 * Ghost days on a fortnight strip, priced live by /days/price. Nothing is
 * saved while the ghosts are ghosts, and the price is the server's own
 * arithmetic over the real week the ghosts would join — which is the only way
 * the fifth shift can honestly come out dearer than the fourth.
 */

interface Priced {
  base_pay: number;
  hours: number;
  overtime_extra: number;
  overtime_hours: number;
  total: number;
}

export function DraftWeek() {
  const { t, n, lang } = useI18n();

  const templates = useCalendar((state) => state.templates);
  const live = templates.filter((template) => !template.archived);

  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [priced, setPriced] = useState<Priced | null>(null);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(false);

  const fortnight = useMemo(
    () => Array.from({ length: 14 }, (_, index) => shiftDays(todayKey(), index + 1)),
    [],
  );

  // Priced on every change, debounced a touch so a quick run of taps costs
  // one request rather than five.
  useEffect(() => {
    if (templateId === null || picked.size === 0) {
      setPriced(null);

      return;
    }

    const held = setTimeout(() => {
      void api<Priced>('/shifter/v1/days/price', {
        body: { shift_id: templateId, dates: [...picked] },
      })
        .then(setPriced)
        .catch(() => setPriced(null));
    }, 250);

    return () => clearTimeout(held);
  }, [templateId, picked]);

  const chosen = live.find((template) => template.id === templateId);

  const weekday = (key: string) =>
    new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(`${key}T12:00:00`));

  return (
    <section className="card reveal p-4">
      <div className="panel-head mb-1">
        <span>{t('What if I take these shifts')}</span>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(!open)}>
          {open ? t('Close') : t('Try it')}
        </button>
      </div>

      {!open && (
        <p className="field-hint">
          {t('Sketch a fortnight before agreeing to it. Priced by the server against your real week — the fifth shift knows about the four before it.')}
        </p>
      )}

      {open && (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {live.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`chip ${template.id === templateId ? 'chip-accent' : ''}`}
                onClick={() => setTemplateId(template.id === templateId ? null : template.id)}
              >
                {template.symbol ?? ''} {template.name}
              </button>
            ))}
          </div>

          {/* The fortnight, tomorrow first. Ghosts toggle on tap. */}
          <div className="grid grid-cols-7 gap-1.5">
            {fortnight.map((key) => {
              const ghost = picked.has(key);

              return (
                <button
                  key={key}
                  type="button"
                  disabled={templateId === null}
                  className={`flex flex-col items-center rounded-(--radius) border px-1 py-1.5 text-[0.72rem] transition-colors ${
                    ghost
                      ? 'border-(--accent) bg-(--accent-soft) text-(--accent-read)'
                      : 'border-border text-muted hover:border-border-strong'
                  } ${templateId === null ? 'opacity-40' : ''}`}
                  onClick={() => {
                    const next = new Set(picked);

                    if (ghost) next.delete(key);
                    else next.add(key);

                    setPicked(next);
                    setPlaced(false);
                  }}
                >
                  <span>{weekday(key)}</span>
                  <span className="tabular font-semibold">{key.slice(8)}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence>
            {priced !== null && picked.size > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                  <span className="tabular text-[1.4rem] font-bold">
                    +<CountUp value={priced.total} format={(v) => `₴${Math.round(v).toLocaleString('ru')}`} />
                  </span>
                  <span className="text-[0.86rem] text-muted tabular">
                    {n(picked.size, 'shifts')} · {Math.round(priced.hours)} {t('h')}
                  </span>
                </div>

                {/* The whole reason this card exists: the hours past the line
                    are named, with the premium they carry. */}
                {priced.overtime_extra > 0 && (
                  <p className="mt-1 text-[0.86rem] text-warn">
                    {Math.round(priced.overtime_hours)} {t('h')}{' '}
                    {t('of this crosses the overtime line')} — +
                    <Money value={priced.overtime_extra} /> {t('on top of the base.')}
                  </p>
                )}

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary flex-1"
                    disabled={busy || chosen === undefined}
                    onClick={() => {
                      if (chosen === undefined) return;

                      setBusy(true);

                      void applyToDates([...picked].sort(), chosen)
                        .then(() => {
                          setPlaced(true);
                          setPicked(new Set());
                          setPriced(null);
                        })
                        .finally(() => setBusy(false));
                    }}
                  >
                    {t('Turn into a plan')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => {
                      setPicked(new Set());
                      setPriced(null);
                    }}
                  >
                    {t('Drop the draft')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {placed && (
            <p className="mt-2 text-[0.86rem] text-good">
              {t('Placed as planned shifts — the calendar has them now.')}
            </p>
          )}

          <p className="field-hint mt-2">
            {t('Ghosts cost nothing and save nothing. The price is the server’s, against the real week they would join.')}
          </p>
        </>
      )}
    </section>
  );
}
