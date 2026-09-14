'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/lib/i18n';
import { MonoStatementItem, dayOf, fromMinor } from '@/lib/mono/mono';
import { categorise } from '@/lib/mono/mono-rules';
import { categoryStyle } from '@/lib/mono/spend-viz';
import { useMono } from '@/lib/mono/store';
import { Money } from '@/components/ui/bits';

/** The statement itself — the rows every figure above is made of. */
export function StatementCard({
  items,
  from,
  to,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
}) {
  const { t, lang } = useI18n();
  const rules = useMono((state) => state.rules);

  const [needle, setNeedle] = useState('');
  const [side, setSide] = useState<'all' | 'out' | 'in'>('all');
  const [shown, setShown] = useState(40);

  const rows = useMemo(() => {
    const query = needle.trim().toLocaleLowerCase();

    return items
      .filter((item) => {
        const day = dayOf(item);

        if (day < from || day > to) return false;
        if (item.hold) return false;
        if (side === 'out' && item.amount >= 0) return false;
        if (side === 'in' && item.amount <= 0) return false;
        if (query !== '' && !item.description.toLocaleLowerCase().includes(query)) return false;

        return true;
      })
      .sort((one, two) => two.time - one.time);
  }, [items, from, to, needle, side]);

  const groups = useMemo(() => {
    const byDay = new Map<string, { items: MonoStatementItem[]; total: number }>();

    for (const item of rows.slice(0, shown)) {
      const day = dayOf(item);
      const group = byDay.get(day) ?? { items: [], total: 0 };

      group.items.push(item);
      group.total += fromMinor(item.amount);
      byDay.set(day, group);
    }

    return [...byDay.entries()];
  }, [rows, shown]);

  if (items.length === 0) return null;

  const said = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });

  const time = (item: MonoStatementItem) =>
    new Date(item.time * 1000).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

  return (
    <section className="card reveal overflow-hidden p-0">
      <div className="card-head">
        <h3 className="card-head-title">{t('The operations themselves')}</h3>
        {/* Три кнопки и поиск на 176 px не влезают в телефон: строка уезжала
            за край и тянула за собой горизонтальную прокрутку всей страницы. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="seg">
            {(
              [
                ['all', t('all of it')],
                ['out', t('spendings')],
                ['in', t('arrivals')],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`seg-btn ${side === id ? 'is-active' : ''}`}
                onClick={() => setSide(id)}
              >
                {label}
              </button>
            ))}
          </span>
          <span className="relative">
            <input
              className="field-input !w-40 max-w-full !py-1.5 !pr-7 !text-[0.85rem]"
              value={needle}
              placeholder={t('Find by name…')}
              onChange={(event) => {
                setNeedle(event.target.value);
                setShown(40);
              }}
            />
            {needle !== '' && (
              <button
                type="button"
                aria-label={t('Clear')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full px-1 text-muted hover:text-ink"
                onClick={() => {
                  setNeedle('');
                  setShown(40);
                }}
              >
                ×
              </button>
            )}
          </span>
        </div>
      </div>

      <div className="card-body !py-0">
        {groups.length === 0 && <p className="field-hint py-3">{t('Nothing matches.')}</p>}

        <div className="flex flex-col">
          {groups.map(([day, group]) => (
            <div key={day} className="border-b border-border py-1.5 last:border-0">
              <div className="flex items-baseline justify-between gap-2 py-0.5">
                <span className="text-[0.78rem] font-bold uppercase tracking-wide text-faint">{said(day)}</span>
                <span className={`tabular text-[0.78rem] font-semibold ${group.total >= 0 ? 'text-good-read' : 'text-muted'}`}>
                  {group.total > 0 ? '+' : ''}
                  <Money value={group.total} />
                </span>
              </div>
              {group.items.map((item) => {
                const category = categorise(item, rules);
                const style = categoryStyle(category);

                return (
                  <div key={item.id} className="flex items-center gap-2.5 py-1">
                    <span
                      className="h-2.5 w-2.5 flex-none rounded-full"
                      style={{ background: item.amount > 0 ? 'var(--good)' : style.hue }}
                      title={item.amount > 0 ? t('arrivals') : category}
                    />
                    <span className="min-w-0 flex-1 truncate text-[0.88rem]" title={item.description}>
                      {item.description}
                    </span>
                    {/* Категория словом, а не только цветом точки: по цвету её знает тот, кто уже посмотрел кольцо наверху. */}
                    <span className="hidden w-44 flex-none sm:block">
                      <span className="chip max-w-full">
                        <span className="truncate">{item.amount > 0 ? t('arrivals') : category}</span>
                      </span>
                    </span>
                    <span className="flex-none text-[0.72rem] text-faint tabular">{time(item)}</span>
                    <span className="w-28 flex-none text-right">
                      <span
                        className={`tabular block text-[0.9rem] font-semibold ${
                          item.amount > 0 ? 'text-good-read' : ''
                        }`}
                      >
                        {item.amount > 0 ? '+' : ''}
                        <Money value={fromMinor(item.amount)} />
                      </span>
                      {/* Кешбэк тем же форматом, что и сумма рядом. */}
                      {item.cashbackAmount > 0 && (
                        <span className="tabular block text-[0.66rem] leading-tight text-good-read" title={t('Cashback returned')}>
                          +<Money value={fromMinor(item.cashbackAmount)} />
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {rows.length > shown && (
        <div className="border-t border-border p-2">
          <button type="button" className="btn btn-quiet btn-sm w-full" onClick={() => setShown(shown + 60)}>
            {t('Show more')} ({rows.length - shown})
          </button>
        </div>
      )}
    </section>
  );
}
