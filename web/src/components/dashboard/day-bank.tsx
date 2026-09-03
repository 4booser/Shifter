'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useI18n } from '@/lib/i18n';
import { useMono } from '@/lib/mono/store';
import { fromMinor } from '@/lib/mono/mono';
import { Money } from '@/components/ui/bits';

/**
 * What the card saw on this day — the statement's half of the story, under
 * the shift's half. The two rarely meet anywhere else: a person records a
 * shift here and reads the bank there, and the day is the natural joint.
 * Only where the bank is already connected; the panel never asks for it.
 */
export function DayBank({ dayKey }: { dayKey: string }) {
  const { t } = useI18n();
  const items = useMono((state) => state.items);
  const token = useMono((state) => state.token);
  const hydrate = useMono((state) => state.hydrate);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const day = useMemo(() => {
    const start = new Date(`${dayKey}T00:00:00`).getTime() / 1000;
    const end = start + 86_400;

    const rows = items.filter((item) => item.time >= start && item.time < end && !item.hold);
    const spent = rows.filter((item) => item.amount < 0).reduce((sum, item) => sum + fromMinor(-item.amount), 0);
    const came = rows.filter((item) => item.amount > 0).reduce((sum, item) => sum + fromMinor(item.amount), 0);

    return { rows, spent, came };
  }, [items, dayKey]);

  if (token === null || token === undefined || day.rows.length === 0) return null;

  return (
    <section className="card flex flex-col gap-1.5 p-4">
      <button
        type="button"
        className="flex items-baseline justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <h3 className="field-label">{t('The card, this day')}</h3>
        <span className="text-[0.78rem] tabular">
          {day.spent > 0 && <span className="text-danger-read">−<Money value={day.spent} /></span>}
          {day.spent > 0 && day.came > 0 && ' · '}
          {day.came > 0 && <span className="text-good-read">+<Money value={day.came} /></span>}
        </span>
      </button>

      {open && (
        <>
          <ul className="flex flex-col gap-1">
            {day.rows.slice(0, 8).map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-2 text-[0.78rem]">
                <span className="truncate text-muted" title={item.description}>{item.description}</span>
                <span className={`flex-none tabular ${item.amount > 0 ? 'text-good-read' : ''}`}>
                  {item.amount > 0 ? '+' : ''}
                  <Money value={fromMinor(item.amount)} />
                </span>
              </li>
            ))}
          </ul>
          <Link href="/bank" className="text-[0.78rem] font-semibold text-(--accent-read) hover:underline">
            {t('The whole statement')} ›
          </Link>
        </>
      )}
    </section>
  );
}
