'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '@/lib/i18n';
import { MonoAccount, MonoStatementItem, dayOf } from '@/lib/mono/mono';
import { statementCsv, statementFileName } from '@/lib/mono/mono-export';
import { yearOfStanding } from '@/lib/mono/mono-shape';
import { cashback, counterparties, flow, oddities, recurring } from '@/lib/mono/mono-insights';
import { budgetState, categorise, ruleFrom, spendingByRules } from '@/lib/mono/mono-rules';
import { categoryStyle, categoryDeltas, dailySpend, merchantsIn, usualDay } from '@/lib/mono/spend-viz';
import { useMono } from '@/lib/mono/store';
import { downloadBlob } from '@/lib/export/xlsx';
import { CountUp } from '@/components/ui/motion';
import { Money } from '@/components/ui/bits';

/**
 * «Куда уходят деньги» — the spending half of the bank tab, rebuilt to be
 * читаемо, not merely present.
 *
 * The grammar: one stacked bar that always sums to the month, category rows
 * that open into the actual shops, a daily rhythm with the usual day drawn
 * as a line, and last month standing next to everything as a signed percent.
 * Colour follows the category, never its rank. Every figure comes из
 * выписки and nowhere else; estimates have no seat at this table.
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

  const [open, setOpen] = useState<string | null>(null);
  const [limitFor, setLimitFor] = useState<string | null>(null);
  const [limitDraft, setLimitDraft] = useState('');

  // Last month, for the «а раньше» column: same width window ending where
  // this one starts.
  const previousRange = useMemo(() => {
    const start = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    const width = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const prevEnd = new Date(start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - (width - 1) * 86400000);
    const key = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    return { from: key(prevStart), to: key(prevEnd) };
  }, [from, to]);

  const categories = useMemo(() => spendingByRules(items, rules, from, to), [items, rules, from, to]);
  const previous = useMemo(
    () => spendingByRules(items, rules, previousRange.from, previousRange.to),
    [items, rules, previousRange],
  );
  const deltas = useMemo(() => categoryDeltas(categories, previous), [categories, previous]);
  const totals = useMemo(() => flow(items, from, to), [items, from, to]);
  const previousTotals = useMemo(
    () => flow(items, previousRange.from, previousRange.to),
    [items, previousRange],
  );
  const days = useMemo(() => dailySpend(items, from, to), [items, from, to]);
  const usual = useMemo(() => usualDay(days), [days]);
  const people = useMemo(() => counterparties(items, from, to), [items, from, to]);
  const standing = useMemo(() => recurring(items, from, to), [items, from, to]);
  const odd = useMemo(() => oddities(items, from, to), [items, from, to]);
  const back = useMemo(() => cashback(items, (item) => categorise(item, rules), from, to), [items, rules, from, to]);

  const limits = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    return budgetState(budgets, categories, now.getDate(), daysInMonth);
  }, [budgets, categories]);

  if (items.length === 0) return null;

  // One denominator for the whole card: everything that left the card,
  // holds and cancelled refunds excluded. flow() keeps transfers out of its
  // totals — right for «пришло/ушло наружу», wrong here, because the rows
  // below show «Переводы» as a category and a bar must sum to its own list.
  const spentAll = deltas.reduce((sum, row) => sum + row.total, 0);
  const previousAll = previous.reduce((sum, row) => sum + row.total, 0);

  const spentDelta =
    previousAll > 0 ? Math.round(((spentAll - previousAll) / previousAll) * 100) : null;

  const shown = deltas.slice(0, 8);
  const tail = deltas.slice(8).reduce((sum, row) => sum + row.total, 0);

  return (
    <>
      {/* ==== The headline: what the month took ==== */}
      <section className="card reveal p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="field-hint">{t('Spent over this stretch')}</span>
            <div className="tabular text-[2rem] font-extrabold leading-tight text-danger">
              <CountUp value={spentAll} format={(v) => `₴${Math.round(v).toLocaleString('ru')}`} />
            </div>
            {spentDelta !== null && (
              <span
                className={`tabular text-[0.82rem] font-semibold ${
                  spentDelta > 8 ? 'text-danger' : spentDelta < -8 ? 'text-good' : 'text-muted'
                }`}
              >
                {spentDelta > 0 ? '▲' : spentDelta < 0 ? '▼' : '='} {Math.abs(spentDelta)}%{' '}
                {t('vs the stretch before')}
              </span>
            )}
          </div>
          <div className="text-right">
            <div className="text-[0.85rem]">
              <span className="text-muted">{t('Came in')}</span>{' '}
              <b className="tabular text-good"><Money value={totals.earned} /></b>
            </div>
            {usual > 0 && (
              <div className="text-[0.85rem]">
                <span className="text-muted">{t('A usual day costs')}</span>{' '}
                <b className="tabular"><Money value={usual} /></b>
              </div>
            )}
          </div>
        </div>

        {/* One bar that always sums to the month. Colour belongs to the
            category; the 2px gaps are what keep neighbours readable. */}
        <div className="mt-4 flex h-7 w-full gap-[2px] overflow-hidden rounded-lg" role="img" aria-label={t('Spending by category, one bar')}>
          {shown.map((row) => (
            <button
              key={row.name}
              type="button"
              className="group relative h-full min-w-[6px] cursor-pointer transition-[flex-grow] duration-300"
              style={{ flexGrow: row.total, flexBasis: 0, background: categoryStyle(row.name).hue }}
              title={`${row.name} — ₴${Math.round(row.total).toLocaleString('ru')}`}
              onClick={() => setOpen(open === row.name ? null : row.name)}
            >
              {row.total / spentAll > 0.14 && (
                <span className="pointer-events-none absolute inset-0 grid place-items-center text-[0.7rem] font-bold text-white/95">
                  {Math.round((row.total / spentAll) * 100)}%
                </span>
              )}
            </button>
          ))}
          {tail > 0 && (
            <div
              className="h-full min-w-[6px]"
              style={{ flexGrow: tail, flexBasis: 0, background: 'var(--surface-2)' }}
              title={t('everything else')}
            />
          )}
        </div>

        {(back.total > 0 || totals.moved > 0 || totals.returned > 0) && (
          <p className="field-hint mt-2">
            {back.total > 0 && <>{t('Cashback returned')} <Money value={back.total} />. </>}
            {totals.moved > 0 && <><Money value={totals.moved} /> {t('moved between your own accounts — neither income nor spending.')} </>}
            {totals.returned > 0 && <><Money value={totals.returned} /> {t('came back — a purchase and its refund cancel out.')}</>}
          </p>
        )}
      </section>

      {/* ==== Categories, each one openable ==== */}
      <section className="card reveal p-4">
        <h3 className="mb-2 text-[0.98rem] font-bold">{t('Where it goes')}</h3>

        <div className="flex flex-col">
          {shown.map((row) => {
            const style = categoryStyle(row.name);
            const limit = limits.find((one) => one.category === row.name);
            const share = spentAll > 0 ? row.total / spentAll : 0;
            const isOpen = open === row.name;

            return (
              <div key={row.name} className="border-b border-border py-2 last:border-0">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : row.name)}
                >
                  <span
                    className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[0.95rem]"
                    style={{ background: `color-mix(in oklab, ${style.hue} 18%, transparent)` }}
                  >
                    {style.mark}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[0.9rem] font-semibold">{row.name}</span>
                      <span className="tabular flex-none text-[0.92rem] font-bold">
                        <Money value={row.total} />
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--surface-2)">
                        <span
                          className="block h-full rounded-full transition-[width] duration-500"
                          style={{ width: `${share * 100}%`, background: limit?.over ? 'var(--danger)' : style.hue }}
                        />
                      </span>
                      <span className="tabular flex-none text-[0.72rem] text-faint">
                        ×{row.count}
                        {row.percent !== null && (
                          <span className={row.percent > 10 ? 'text-danger' : row.percent < -10 ? 'text-good' : ''}>
                            {' '}· {row.percent > 0 ? '+' : ''}{row.percent}%
                          </span>
                        )}
                        {row.percent === null && row.previous === 0 && (
                          <span className="text-warn"> · {t('new')}</span>
                        )}
                      </span>
                    </span>
                  </span>
                </button>

                {/* Plain conditional render. Framer wedged twice on this page
                    (a height tween, then an opacity one) while something held
                    the main thread; a panel that simply appears beats any
                    charm that can freeze at half-open. */}
                {isOpen && (
                    <div className="bank-open">
                      <CategoryInside
                        items={items}
                        rules={rules}
                        category={row.name}
                        from={from}
                        to={to}
                        previous={row.previous}
                        limit={limit?.limit ?? null}
                        limitOver={limit?.over ?? false}
                        editingLimit={limitFor === row.name}
                        limitDraft={limitDraft}
                        onLimitDraft={setLimitDraft}
                        onEditLimit={() => {
                          setLimitFor(row.name);
                          setLimitDraft(limit === undefined ? '' : `${limit.limit}`);
                        }}
                        onSaveLimit={() => {
                          setBudget(row.name, Number(limitDraft.replace(',', '.')) || 0);
                          setLimitFor(null);
                        }}
                        onTeach={(item, category) => setRules([ruleFrom(item, category), ...rules])}
                      />
                    </div>
                  )}
              </div>
            );
          })}
        </div>

        {tail > 0 && (
          <p className="field-hint mt-2">
            {t('everything else')}: <Money value={tail} />
          </p>
        )}
      </section>

      {/* ==== The daily rhythm ==== */}
      <DayRhythm days={days} usual={usual} items={items} rules={rules} />

      {/* ==== Who, most often ==== */}
      <section className="card reveal p-4">
        <h3 className="mb-2 text-[0.98rem] font-bold">{t('Where you actually go')}</h3>
        <div className="flex flex-wrap gap-1.5">
          {people.slice(0, 14).map((row) => (
            <span key={row.key} className="chip !py-1.5 text-[0.82rem]" title={`×${row.count}`}>
              <span className="max-w-40 truncate">{row.name}</span>
              <b className="tabular"><Money value={row.total} /></b>
              {row.count > 2 && <span className="text-faint">×{row.count}</span>}
            </span>
          ))}
        </div>
      </section>

      {/* ==== Standing charges ==== */}
      <section className="card reveal p-4">
        <h3 className="mb-1 text-[0.98rem] font-bold">{t('Comes round by itself')}</h3>
        {standing.length === 0 ? (
          <p className="field-hint">{t('Nothing repeats month to month yet.')}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {standing.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-2 text-[0.88rem]">
                <span className="truncate">{row.name}</span>
                <span className="tabular flex-none">
                  <Money value={row.amount} />
                  <span className="ml-1 text-[0.72rem] text-faint">
                    · <Money value={yearOfStanding(row.amount)} />/{t('yr')} ·{' '}
                    {t('next around')} {row.next.slice(8)}.{row.next.slice(5, 7)}
                  </span>
                </span>
              </div>
            ))}
            {standing.length > 1 && (
              <p className="field-hint mt-1">
                {t('All of it together')}:{' '}
                <strong className="tabular">
                  <Money value={yearOfStanding(standing.reduce((sum, row) => sum + row.amount, 0))} />
                </strong>{' '}
                {t('a year')}
              </p>
            )}
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
 * Inside one category: the shops it is made of, the limit, and teaching.
 * This is where «на отъебись» ends — a category that cannot answer «а это
 * что вообще?» is a label, not an explanation.
 */
function CategoryInside({
  items,
  rules,
  category,
  from,
  to,
  previous,
  limit,
  limitOver,
  editingLimit,
  limitDraft,
  onLimitDraft,
  onEditLimit,
  onSaveLimit,
  onTeach,
}: {
  items: MonoStatementItem[];
  rules: ReturnType<typeof useMono.getState>['rules'];
  category: string;
  from: string;
  to: string;
  previous: number;
  limit: number | null;
  limitOver: boolean;
  editingLimit: boolean;
  limitDraft: string;
  onLimitDraft: (value: string) => void;
  onEditLimit: () => void;
  onSaveLimit: () => void;
  onTeach: (item: MonoStatementItem, category: string) => void;
}) {
  const { t } = useI18n();

  const merchants = useMemo(
    () => merchantsIn(items, rules, category, from, to),
    [items, rules, category, from, to],
  );

  return (
    <div className="mt-2 rounded-lg bg-(--surface-2)/60 p-3 pl-[2.9rem]">
      <div className="flex flex-col gap-1">
        {merchants.map((shop) => (
          <div key={shop.name} className="flex items-baseline justify-between gap-2 text-[0.84rem]">
            <span className="truncate">{shop.name}</span>
            <span className="tabular flex-none">
              <Money value={shop.total} />
              {shop.count > 1 && <span className="ml-1 text-[0.72rem] text-faint">×{shop.count}</span>}
            </span>
          </div>
        ))}
      </div>

      {previous > 0 && (
        <p className="field-hint mt-2">
          {t('Last stretch this was')} <Money value={previous} />.
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {editingLimit ? (
          <>
            <input
              className="field-input !w-28 !py-1 text-[0.85rem]"
              inputMode="numeric"
              value={limitDraft}
              placeholder="5000"
              onChange={(event) => onLimitDraft(event.target.value)}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={onSaveLimit}>
              {t('Keep')}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onEditLimit}>
            {limit === null
              ? t('Set a monthly limit')
              : (
                <>
                  {t('Limit')}: <Money value={limit} />
                  {limitOver && <span className="text-danger"> · {t('over the limit')}</span>}
                </>
              )}
          </button>
        )}
      </div>
      <p className="field-hint mt-1">
        {t('The limit is a line you drew, not advice. It lives in this browser.')}
      </p>
    </div>
  );
}

/**
 * The month as thirty-one thin columns, with the usual day drawn as a line.
 * The heaviest day gets named — a bar without a story is just geometry.
 */
function DayRhythm({
  days,
  usual,
  items,
  rules,
}: {
  days: { day: string; total: number }[];
  usual: number;
  items: MonoStatementItem[];
  rules: ReturnType<typeof useMono.getState>['rules'];
}) {
  const { t } = useI18n();

  const peak = Math.max(1, ...days.map((day) => day.total));
  const heaviest = days.reduce((best, day) => (day.total > best.total ? day : best), days[0]);

  const heaviestSpent = useMemo(() => {
    if (heaviest === undefined || heaviest.total === 0) return [];

    return items
      .filter((item) => item.amount < 0 && !item.hold && dayOf(item) === heaviest.day)
      .sort((one, two) => one.amount - two.amount)
      .slice(0, 3);
  }, [items, heaviest]);

  if (days.every((day) => day.total === 0)) return null;

  return (
    <section className="card reveal p-4">
      <h3 className="mb-1 text-[0.98rem] font-bold">{t('The month, day by day')}</h3>
      {usual > 0 && (
        <p className="field-hint mb-2">
          {t('The line is your usual day')} — <Money value={usual} />.{' '}
          {t('A median: one splurge cannot drag it.')}
        </p>
      )}

      <div className="relative">
        <div className="flex h-24 items-end gap-[2px]">
          {days.map((day) => {
            const weekend = [0, 6].includes(new Date(`${day.day}T12:00:00`).getDay());

            return (
              <div
                key={day.day}
                className="group relative flex-1 rounded-t-[3px]"
                style={{
                  height: `${Math.max(2, (day.total / peak) * 100)}%`,
                  background:
                    day.total === 0
                      ? 'var(--surface-2)'
                      : weekend
                        ? 'color-mix(in oklab, var(--accent) 75%, var(--warn))'
                        : 'var(--accent)',
                  opacity: day.total === 0 ? 0.6 : day.day === heaviest?.day ? 1 : 0.78,
                }}
                title={`${day.day.slice(8)}.${day.day.slice(5, 7)} — ₴${Math.round(day.total).toLocaleString('ru')}`}
              />
            );
          })}
        </div>
        {usual > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-(--warn)"
            style={{ bottom: `${Math.min(96, (usual / peak) * 96)}px` }}
            aria-hidden
          />
        )}
      </div>

      {heaviest !== undefined && heaviest.total > 0 && (
        <p className="field-hint mt-2">
          {t('Heaviest')} — {heaviest.day.slice(8)}.{heaviest.day.slice(5, 7)},{' '}
          <b className="tabular"><Money value={heaviest.total} /></b>
          {heaviestSpent.length > 0 && (
            <>: {heaviestSpent.map((item) => item.description).join(' + ')}</>
          )}
          . {t('A fact, not a reproach.')}
        </p>
      )}
    </section>
  );
}
