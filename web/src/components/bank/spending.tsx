'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/lib/i18n';
import { MonoAccount, MonoStatementItem, dayOf } from '@/lib/mono/mono';
import { statementCsv, statementFileName } from '@/lib/mono/mono-export';
import { FlowWords, balance, spareNames } from '@/lib/mono/mono-flow';
import {
  cashback,
  counterparties,
  flow,
  incomeSources,
  oddities,
  recurring,
} from '@/lib/mono/mono-insights';
import { budgetState, categorise, ruleFrom, spendingByRules } from '@/lib/mono/mono-rules';
import { useMono } from '@/lib/mono/store';
import { downloadBlob } from '@/lib/export/xlsx';
import { Money } from '@/components/ui/bits';

/**
 * The spending half of the bank tab: what the phone shows, on a wider screen.
 *
 * Every figure is the phone's own function. The only thing written here is
 * markup.
 */
export function BankSpending({
  items,
  from,
  to,
  account,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
  account: MonoAccount | null;
}) {
  const { t } = useI18n();

  const rules = useMono((state) => state.rules);
  const budgets = useMono((state) => state.budgets);
  const setRules = useMono((state) => state.setRules);
  const setBudget = useMono((state) => state.setBudget);

  const [view, setView] = useState<'categories' | 'who' | 'standing'>('categories');
  const [teaching, setTeaching] = useState<MonoStatementItem | null>(null);

  const categories = useMemo(
    () => spendingByRules(items, rules, from, to),
    [items, rules, from, to],
  );
  const people = useMemo(() => counterparties(items, from, to), [items, from, to]);
  const standing = useMemo(() => recurring(items, from, to), [items, from, to]);
  const odd = useMemo(() => oddities(items, from, to), [items, from, to]);
  const totals = useMemo(() => flow(items, from, to), [items, from, to]);
  const sources = useMemo(() => incomeSources(items, from, to), [items, from, to]);
  const back = useMemo(
    () => cashback(items, (item) => categorise(item, rules), from, to),
    [items, rules, from, to],
  );

  const limits = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    return budgetState(budgets, categories, now.getDate(), daysInMonth);
  }, [budgets, categories]);

  const words: FlowWords = useMemo(
    () => ({
      rest: t('everything else'),
      fromBalance: t('from the balance'),
      leftOver: t('left over'),
    }),
    [t],
  );

  if (items.length === 0) return null;

  const peak = Math.max(1, ...categories.map((row) => row.total));

  return (
    <>
      {/* ==== In, out, kept ==== */}
      <section className="card reveal p-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            [t('Came in'), totals.earned, 'text-good'],
            [t('Went out'), totals.spent, 'text-danger'],
            [t('Left'), totals.left, ''],
          ].map(([label, value, tone]) => (
            <div key={label as string}>
              <span className="field-hint">{label as string}</span>
              <div className={`tabular text-[1.15rem] font-bold ${tone as string}`}>
                <Money value={value as number} />
              </div>
            </div>
          ))}
        </div>

        {back.total > 0 && (
          <p className="field-hint mt-2">
            {t('Cashback returned')} <Money value={back.total} />
          </p>
        )}
        {totals.moved > 0 && (
          <p className="field-hint mt-1">
            <Money value={totals.moved} />{' '}
            {t('moved between your own accounts — neither income nor spending.')}
          </p>
        )}
        {totals.returned > 0 && (
          <p className="field-hint mt-1">
            <Money value={totals.returned} />{' '}
            {t('came back — a purchase and its refund cancel out.')}
          </p>
        )}
      </section>

      {/* ==== The month as one picture ==== */}
      <FlowPicture
        sources={sources.map((row) => ({ name: row.name, total: row.total }))}
        categories={categories.map((row) => ({ name: row.name, total: row.total }))}
        earned={totals.earned}
        spent={totals.spent}
        words={words}
      />

      {/* ==== The three views ==== */}
      <section className="card reveal p-4">
        <div className="mb-3 flex gap-1.5">
          {(
            [
              ['categories', t('By category')],
              ['who', t('To whom')],
              ['standing', t('Standing')],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`btn btn-sm ${view === id ? 'btn-primary' : 'btn-quiet'}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'categories' && (
          <div className="flex flex-col gap-2">
            {categories.map((row) => {
              const limit = limits.find((one) => one.category === row.name);

              return (
                <div key={row.name}>
                  <div className="flex items-baseline justify-between gap-2 text-[0.88rem]">
                    <span>{row.name}</span>
                    <span className="tabular font-semibold">
                      <Money value={row.total} />
                      {limit !== undefined && (
                        <span className={`ml-1 text-[0.72rem] ${limit.over ? 'text-danger' : 'text-faint'}`}>
                          / <Money value={limit.limit} />
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-(--surface-2)">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(row.total / peak) * 100}%`,
                        background: limit?.over ? 'var(--danger)' : 'var(--accent)',
                      }}
                    />
                  </div>
                </div>
              );
            })}

            <p className="field-hint mt-1">
              {t('Limits and categories are edited on the row — your rules beat the terminal’s code.')}
            </p>
          </div>
        )}

        {view === 'who' && (
          <div className="flex flex-col gap-1.5">
            {people.slice(0, 20).map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-2 text-[0.88rem]">
                <span className="truncate">{row.name}</span>
                <span className="tabular flex-none font-semibold">
                  <Money value={row.total} />
                  <span className="ml-1 text-[0.72rem] text-faint">×{row.count}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {view === 'standing' && (
          <div className="flex flex-col gap-1.5">
            {standing.length === 0 && (
              <p className="field-hint">{t('Nothing repeats month to month yet.')}</p>
            )}
            {standing.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-2 text-[0.88rem]">
                <span className="truncate">{row.name}</span>
                <span className="tabular flex-none">
                  <Money value={row.amount} />
                  <span className="ml-1 text-[0.72rem] text-faint">
                    {t('next around')} {row.next.slice(8)}.{row.next.slice(5, 7)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ==== Oddities ==== */}
      {odd.length > 0 && (
        <section className="card reveal p-4">
          <div className="panel-head mb-2">
            <span>{t('Unusual this month')}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {odd.slice(0, 6).map((row) => (
              <div key={row.item.id} className="flex items-baseline justify-between gap-2 text-[0.86rem]">
                <span className="truncate">{row.item.description}</span>
                <span className="tabular flex-none text-muted">{dayOf(row.item).slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ==== The way out ==== */}
      <button
        type="button"
        className="btn w-full"
        onClick={() => {
          const csv = statementCsv(items, (item) => categorise(item, rules), from, to);

          downloadBlob(
            statementFileName(from, to),
            new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }),
          );
        }}
      >
        {t('Download the statement')}
      </button>
    </>
  );
}

/**
 * The month as ribbons: sources pool in the middle and fan out to categories.
 *
 * The same balance() as the phone draws with, in SVG. Money is fungible, so no
 * ribbon runs from a source straight to a category — that would be a claim
 * about which hryvnia went where, and the data cannot support it.
 */
function FlowPicture({
  sources,
  categories,
  earned,
  spent,
  words,
}: {
  sources: { name: string; total: number }[];
  categories: { name: string; total: number }[];
  earned: number;
  spent: number;
  words: FlowWords;
}) {
  const { t } = useI18n();

  const sides = useMemo(
    () => balance(sources, categories, earned, spent, 5, words),
    [sources, categories, earned, spent, words],
  );

  const spare = spareNames(words);

  if (sides.total <= 0 || sides.left.length === 0 || sides.right.length === 0) return null;

  const width = 640;
  const height = 26 * Math.max(sides.left.length, sides.right.length) + 30;
  const column = 10;
  const middle = width / 2 - column / 2;
  const gap = 3;

  const usable = (count: number) => height - gap * Math.max(0, count - 1);

  const place = (bands: { total: number }[]) => {
    const scale = usable(bands.length) / sides.total;
    let y = 0;

    return bands.map((band) => {
      const at = y;

      y += band.total * scale + gap;

      return { y: at, h: Math.max(2, band.total * scale) };
    });
  };

  const leftAt = place(sides.left);
  const rightAt = place(sides.right);

  const ribbon = (
    x1: number, y1: number, h1: number, x2: number, y2: number, h2: number,
  ): string => {
    const c1 = x1 + (x2 - x1) * 0.42;
    const c2 = x2 - (x2 - x1) * 0.42;

    return [
      `M ${x1} ${y1}`,
      `C ${c1} ${y1} ${c2} ${y2} ${x2} ${y2}`,
      `L ${x2} ${y2 + h2}`,
      `C ${c2} ${y2 + h2} ${c1} ${y1 + h1} ${x1} ${y1 + h1}`,
      'Z',
    ].join(' ');
  };

  let poolIn = 0;
  let poolOut = 0;

  return (
    <section className="card reveal p-4">
      <div className="panel-head mb-2">
        <span>{t('Where the month went')}</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: '30rem' }}>
          {sides.left.map((band, index) => {
            const at = leftAt[index];
            const share = (at.h / usable(sides.left.length)) * height;
            const y = poolIn;

            poolIn += share;

            return (
              <path
                key={`in-${band.name}`}
                d={ribbon(column, at.y, at.h, middle, y, share)}
                fill={spare.has(band.name) ? 'var(--danger)' : 'var(--accent)'}
                opacity={0.28 + 0.1 * ((sides.left.length - index) / sides.left.length)}
              />
            );
          })}

          {sides.right.map((band, index) => {
            const at = rightAt[index];
            const share = (at.h / usable(sides.right.length)) * height;
            const y = poolOut;

            poolOut += share;

            return (
              <path
                key={`out-${band.name}`}
                d={ribbon(middle + column, y, share, width - column, at.y, at.h)}
                fill={spare.has(band.name) ? 'var(--good)' : 'var(--warn)'}
                opacity={0.28 + 0.1 * ((sides.right.length - index) / sides.right.length)}
              />
            );
          })}

          <rect x={middle} y={0} width={column} height={height} rx={3} fill="var(--text)" opacity={0.2} />
        </svg>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[0.82rem]">
        <div className="flex flex-col gap-0.5">
          {sides.left.map((band) => (
            <div key={`ll-${band.name}`} className="flex justify-between gap-2">
              <span className="truncate text-muted">{band.name}</span>
              <span className="tabular flex-none"><Money value={band.total} /></span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-0.5">
          {sides.right.map((band) => (
            <div key={`rl-${band.name}`} className="flex justify-between gap-2">
              <span className="truncate text-muted">{band.name}</span>
              <span className="tabular flex-none"><Money value={band.total} /></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
