'use client';

import { useMemo, useState } from 'react';

import { todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { MonoStatementItem, dayOf } from '@/lib/mono/mono';
import { statementCsv, statementFileName } from '@/lib/mono/mono-export';
import { yearOfStanding } from '@/lib/mono/mono-shape';
import { cashback, counterparties, flow, oddities, recurring } from '@/lib/mono/mono-insights';
import { budgetState, categorise, ruleFrom, spendingByRules } from '@/lib/mono/mono-rules';
import { categoryStyle, categoryDeltas, dailySpend, merchantsIn, usualDay } from '@/lib/mono/spend-viz';
import { useMono } from '@/lib/mono/store';
import { downloadBlob } from '@/lib/export/xlsx';
import { Money } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { BankTile } from '@/components/bank/hero';
import { ColumnAxis } from '@/components/bank/charts';

/** «Куда уходят деньги» — the spending half of the bank tab, rebuilt to be читаемо, not merely present. */
/** Everything the spending cards read, computed once per card. */
function useSpend(items: MonoStatementItem[], from: string, to: string) {
  const rules = useMono((state) => state.rules);
  const budgets = useMono((state) => state.budgets);

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
  const days = useMemo(() => dailySpend(items, from, to), [items, from, to]);
  const usual = useMemo(() => usualDay(days), [days]);
  const people = useMemo(() => counterparties(items, from, to), [items, from, to]);
  const standing = useMemo(() => recurring(items, to), [items, to]);
  const odd = useMemo(() => oddities(items, from, to), [items, from, to]);
  const back = useMemo(() => cashback(items, (item) => categorise(item, rules), from, to), [items, rules, from, to]);

  const limits = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    return budgetState(budgets, categories, now.getDate(), daysInMonth);
  }, [budgets, categories]);

  // One denominator for the whole shelf: everything that left the card, holds and cancelled refunds excluded.
  const spentAll = deltas.reduce((sum, row) => sum + row.total, 0);
  const previousAll = previous.reduce((sum, row) => sum + row.total, 0);

  /* Сравнивать можно только законченный отрезок. */
  const finished = to < todayKey();
  const spentDelta =
    finished && previousAll > 0 ? Math.round(((spentAll - previousAll) / previousAll) * 100) : null;

  return {
    rules, budgets, categories, previous, deltas, totals, days, usual,
    people, standing, odd, back, limits, spentAll, spentDelta,
  };
}

/** A sum said in worked hours: the unit this app exists to defend. */
function inHours(value: number, hourWorth: number | null | undefined): string | null {
  if (hourWorth === null || hourWorth === undefined || hourWorth <= 0) return null;

  const hours = value / hourWorth;

  if (hours < 0.75) return null;

  return hours >= 10 ? `${Math.round(hours)}` : `${(Math.round(hours * 2) / 2).toLocaleString('ru')}`;
}

/** ==== The band's tile: what the stretch took ==== */
export function SpentTile({
  items,
  from,
  to,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
}) {
  const { t } = useI18n();
  const { spentAll, spentDelta } = useSpend(items, from, to);

  return (
    <BankTile
      label={t('Went out')}
      icon="flame"
      tone={spentDelta === null ? 'quiet' : spentDelta > 8 ? 'danger' : spentDelta < -8 ? 'good' : 'quiet'}
      value={spentAll <= 0 ? '—' : <Money value={Math.round(spentAll)} />}
      hint={
        spentDelta === null ? (
          <span className="text-faint">{t('the stretch is not over yet')}</span>
        ) : (
          <>
            {spentDelta > 0 ? '▲' : spentDelta < 0 ? '▼' : '='} {Math.abs(spentDelta)}%{' '}
            {t('vs the stretch before')}
          </>
        )
      }
    />
  );
}

/** ==== The ring: the whole month, and the shares it is made of ==== */
export function SpendDonut({
  items,
  from,
  to,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
}) {
  const { t } = useI18n();
  const { deltas, totals, usual, back, spentAll } = useSpend(items, from, to);

  // Проверять надо то, что рисуется, а не то, что загружено.
  if (deltas.length === 0 || spentAll <= 0) return null;

  const head = deltas.slice(0, 4);
  const tail = deltas.slice(4).reduce((sum, row) => sum + row.total, 0);

  const parts = [
    ...head.map((row) => ({ name: row.name, total: row.total, hue: categoryStyle(row.name).hue })),
    ...(tail > 0 ? [{ name: t('everything else'), total: tail, hue: 'var(--faint)' }] : []),
  ];

  // A ring drawn on a circumference of a hundred: every dash length is the
  // share itself, so the arithmetic is the drawing and cannot drift from it.
  let walked = 0;
  const arcs = parts.map((part) => {
    const share = (part.total / spentAll) * 100;
    const arc = { ...part, share, offset: -walked };

    walked += share;

    return arc;
  });

  return (
    <section className="card reveal flex h-full flex-col overflow-hidden p-0">
      <div className="card-head">
        <h3 className="card-head-title">{t('Where the month went')}</h3>
      </div>

      <div className="card-body flex flex-1 flex-col items-center">
        <div className="relative h-40 w-40">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--surface-2)" strokeWidth="3.6" />
            {arcs.map((arc) => (
              <circle
                key={arc.name}
                cx="18"
                cy="18"
                r="15.9155"
                fill="none"
                stroke={arc.hue}
                strokeWidth="3.6"
                strokeDasharray={`${Math.max(0, arc.share - 0.6)} ${100 - Math.max(0, arc.share - 0.6)}`}
                strokeDashoffset={arc.offset}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* Гривна была вбита прямо здесь, а соседние карточки печатали валюту из настроек — на одном экране выходило… */}
            <span className="tabular text-[1.3rem] font-bold leading-tight text-danger-read">
              <Money value={Math.round(spentAll)} />
            </span>
            <span className="field-hint">{t('over this stretch')}</span>
          </div>
        </div>

        <div className="mt-4 grid w-full grid-cols-2 gap-x-4 gap-y-2">
          {arcs.map((arc) => (
            <div key={arc.name} className="min-w-0">
              <div className="flex justify-between gap-2 text-[0.74rem] font-semibold">
                <span className="truncate" title={arc.name}>{arc.name}</span>
                <span className="tabular flex-none text-muted">{Math.round(arc.share)}%</span>
              </div>
              <span className="mt-0.5 block h-1 rounded-full bg-(--surface-2)">
                <span
                  className="block h-1 rounded-full"
                  style={{ width: `${arc.share}%`, background: arc.hue }}
                />
              </span>
            </div>
          ))}
        </div>

        {/* Pushed to the floor of the card: this one shares a row with the ranked table, which is always the taller of… */}
        <div className="mt-auto w-full border-t border-border pt-3 text-[0.82rem]">
          <div className="flex justify-between gap-2">
            <span className="text-muted">{t('Came in')}</span>
            <b className="tabular text-good-read"><Money value={totals.earned} /></b>
          </div>
          {usual > 0 && (
            <div className="flex justify-between gap-2">
              {/* Not «a usual day» plain: the forecast and the reserve tile above both say that about a two-month habit, and… */}
              <span className="text-muted">{t('A day in this stretch costs')}</span>
              <b className="tabular"><Money value={usual} /></b>
            </div>
          )}
        </div>

        {(back.total > 0 || totals.moved > 0 || totals.returned > 0) && (
          <p className="field-hint mt-2 w-full">
            {back.total > 0 && <>{t('Cashback returned')} <Money value={back.total} />. </>}
            {totals.moved > 0 && <><Money value={totals.moved} /> {t('moved between your own accounts — neither income nor spending.')} </>}
            {totals.returned > 0 && <><Money value={totals.returned} /> {t('came back — a purchase and its refund cancel out.')}</>}
          </p>
        )}
      </div>
    </section>
  );
}

/** ==== Categories, ranked, each one openable ==== */
export function SpendCategories({
  items,
  from,
  to,
  hourWorth = null,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
  /** What a worked hour is really worth, when the rota knows it. */
  hourWorth?: number | null;
}) {
  const { t } = useI18n();
  const { rules, deltas, limits, spentAll } = useSpend(items, from, to);
  const setRules = useMono((state) => state.setRules);
  const setBudget = useMono((state) => state.setBudget);

  const [open, setOpen] = useState<string | null>(null);
  const [limitFor, setLimitFor] = useState<string | null>(null);
  const [limitDraft, setLimitDraft] = useState('');

  const shown = deltas.slice(0, 8);
  const tail = deltas.slice(8).reduce((sum, row) => sum + row.total, 0);

  // Ни одной категории за период — рисовать нечего. Заголовок над пустотой
  // хуже отсутствующей карточки.
  if (shown.length === 0) return null;

  return (
    <section className="card reveal flex h-full flex-col overflow-hidden p-0">
      <div className="card-head">
        <h3 className="card-head-title">{t('Where it goes')}</h3>
        <span className="field-hint">{t('Tap a category for the shops in it')}</span>
      </div>

      <div className="card-body flex-1 !pt-0">
        {/* The table's own head. Hidden on a phone, where the columns stack
            and a header would name rows that are no longer beside it. */}
        <div className="hidden items-center gap-3 border-b border-border py-2 sm:flex">
          <span className="field-hint flex-1 font-semibold uppercase">{t('Category')}</span>
          <span className="field-hint w-24 font-semibold uppercase">{t('Volume')}</span>
          <span className="field-hint w-24 text-right font-semibold uppercase">{t('Amount')}</span>
          <span className="field-hint w-12 text-right font-semibold uppercase">{t('Share of the month')}</span>
        </div>

        <div className="flex flex-col">
          {shown.map((row) => {
            const style = categoryStyle(row.name);
            const limit = limits.find((one) => one.category === row.name);
            const share = spentAll > 0 ? row.total / spentAll : 0;
            const isOpen = open === row.name;

            return (
              <div key={row.name} className="border-b border-border last:border-0">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left focus-visible:outline-2 focus-visible:outline-(--accent)"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : row.name)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span
                      className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[0.95rem]"
                      style={{ background: `color-mix(in oklab, ${style.hue} 18%, transparent)` }}
                    >
                      {style.mark}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.9rem] font-semibold" title={row.name}>
                        {row.name}
                      </span>
                      <span className="tabular block text-[0.72rem] text-faint">
                        ×{row.count}
                        {row.percent !== null && (
                          <span className={row.percent > 10 ? 'text-danger-read' : row.percent < -10 ? 'text-good-read' : ''}>
                            {' '}· {row.percent > 0 ? '+' : ''}{row.percent}%
                          </span>
                        )}
                        {row.percent === null && row.previous === 0 && (
                          <span className="text-warn-read"> · {t('new')}</span>
                        )}
                        {limit?.over === true && (
                          <span className="text-danger-read"> · {t('over the limit')}</span>
                        )}
                      </span>
                    </span>
                  </span>

                  {/* The bar is the ranking made visible, so on a phone it moves under the row rather than disappearing with the… */}
                  <span className="order-last w-full sm:order-none sm:w-24">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-(--surface-2)">
                      <span
                        className="block h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${share * 100}%`, background: limit?.over ? 'var(--danger)' : style.hue }}
                      />
                    </span>
                  </span>

                  <span className="w-24 flex-none text-right">
                    <span className="tabular block text-[0.92rem] font-bold">
                      <Money value={row.total} />
                    </span>
                    {inHours(row.total, hourWorth) !== null && (
                      <span className="tabular block text-[0.68rem] leading-tight text-faint">
                        ≈ {inHours(row.total, hourWorth)} {t('h of work')}
                      </span>
                    )}
                  </span>

                  <span className="tabular w-12 flex-none text-right text-[0.8rem] text-muted">
                    {Math.round(share * 100)}%
                  </span>
                </button>

                {/* Plain conditional render. */}
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
      </div>
    </section>
  );
}

/** ==== The daily rhythm ==== */
export function SpendRhythm({
  items,
  from,
  to,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
}) {
  const { days, usual, rules } = useSpend(items, from, to);

  // Тот же счёт, что и у остальных: смотрим на дни периода, а не на объём
  // загруженной выписки.
  if (days.every((day) => day.total === 0)) return null;

  return <DayRhythm days={days} usual={usual} items={items} rules={rules} />;
}

/** ==== Who, most often ==== */
export function SpendPlaces({
  items,
  from,
  to,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
}) {
  const { t } = useI18n();
  const { people } = useSpend(items, from, to);

  if (items.length === 0 || people.length === 0) return null;

  return (
    <section className="card reveal flex h-full flex-col overflow-hidden p-0">
      <div className="card-head">
        <h3 className="card-head-title">{t('Where you actually go')}</h3>
        <span className="field-hint">{t('most often first')}</span>
      </div>

      {/* Чипами это читалось как облако тегов: названия разной длины, суммы вперемешку, и сравнить два места глазами… */}
      <div className="card-body flex-1 !py-0">
        {people.slice(0, 14).map((row) => (
          <div key={row.key} className="flex items-baseline gap-3 border-b border-border py-2 last:border-0">
            <span className="min-w-0 flex-1 truncate text-[0.86rem] font-semibold" title={row.name}>
              {row.name}
            </span>
            <span className="tabular w-24 flex-none text-[0.75rem] text-faint">
              {row.count > 1 ? `×${row.count}` : ''}
            </span>
            <span className="tabular flex-none text-right text-[0.88rem] font-bold">
              <Money value={row.total} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** ==== Standing charges ==== */
export function SpendStanding({
  items,
  from,
  to,
  hourWorth = null,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
  hourWorth?: number | null;
}) {
  const { t } = useI18n();
  const { standing } = useSpend(items, from, to);

  if (items.length === 0) return null;

  const yearly = yearOfStanding(standing.reduce((sum, row) => sum + row.amount, 0));
  const heaviest = Math.max(1, ...standing.map((row) => row.amount));

  return (
    <section className="card reveal flex h-full flex-col overflow-hidden p-0">
      <div className="card-head">
        <h3 className="card-head-title">{t('Comes round by itself')}</h3>
        {standing.length > 0 && (
          <span className="field-hint tabular">
            {t('next around')} {standing[0].next.slice(8)}.{standing[0].next.slice(5, 7)}
          </span>
        )}
      </div>

      <div className="card-body flex flex-1 flex-col">
        {standing.length === 0 ? (
          <p className="field-hint">{t('Nothing repeats month to month yet.')}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
              {standing.map((row) => (
                <div key={row.key}>
                  <div className="flex items-baseline justify-between gap-2 text-[0.85rem]">
                    <span className="min-w-0 flex-1 truncate font-semibold" title={row.name}>
                      {row.name}
                      {row.fresh && <span className="ml-1.5 text-[0.72rem] font-bold text-(--accent-read)">{t('new')}</span>}
                    </span>
                    <span className="tabular flex-none font-semibold">
                      <Money value={row.amount} />
                    </span>
                  </div>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-(--surface-2)">
                    <span
                      className="block h-full rounded-full bg-(--accent)"
                      style={{ width: `${(row.amount / heaviest) * 100}%` }}
                    />
                  </span>
                  <span className="tabular mt-0.5 block text-[0.7rem] text-faint">
                    <Money value={yearOfStanding(row.amount)} />/{t('yr')} · {t('next around')}{' '}
                    {row.next.slice(8)}.{row.next.slice(5, 7)}
                  </span>
                </div>
              ))}
            </div>

            {standing.length > 1 && (
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3">
                <div>
                  <span className="field-hint block font-semibold uppercase">{t('A year of it')}</span>
                  <strong className="tabular text-[1.15rem] font-bold">
                    <Money value={yearly} />
                  </strong>
                </div>
                {inHours(yearly, hourWorth) !== null && (
                  <span className="field-hint text-right">
                    ≈ <strong className="tabular">{inHours(yearly, hourWorth)}</strong> {t('h of work')}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** ==== Oddities ==== */
export function SpendOddities({
  items,
  from,
  to,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
}) {
  const { t } = useI18n();
  const { odd } = useSpend(items, from, to);

  if (items.length === 0 || odd.length === 0) return null;

  return (
    <section className="card reveal flex h-full flex-col overflow-hidden p-0">
      <div className="card-head">
        <h3 className="card-head-title">{t('Unusual this month')}</h3>
        <span className="field-hint">{t('a question, not a finding')}</span>
      </div>

      <div className="card-body flex-1 !py-0">
        {odd.slice(0, 6).map((row) => (
          <div key={row.item.id} className="flex items-baseline gap-3 border-b border-border py-2 last:border-0">
            <span className="min-w-0 flex-1 truncate text-[0.86rem]" title={row.item.description}>
              {row.item.description}
            </span>
            <span className="min-w-0 flex-1 truncate text-[0.76rem] text-faint" title={row.because}>
              {row.because}
            </span>
            {/* `slice(5)` давал «09-01» — обрывок ISO, который читается как «9 января». */}
            <span className="tabular flex-none text-[0.78rem] text-muted">
              {dayOf(row.item).slice(8)}.{dayOf(row.item).slice(5, 7)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** ==== The way out: the statement as a file ==== */
export function StatementDownloadButton({
  items,
  from,
  to,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
}) {
  const { t } = useI18n();
  const rules = useMono((state) => state.rules);

  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={items.length === 0}
      onClick={() => {
        const csv = statementCsv(items, (item) => categorise(item, rules), from, to);

        downloadBlob(
          statementFileName(from, to),
          new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }),
        );
      }}
    >
      <Icon name="download" size={14} className="mr-1.5" />
      {t('Download the statement')}
    </button>
  );
}

/** Inside one category: the shops it is made of, the limit, and teaching. */
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
    <div className="mb-2 rounded-lg bg-(--surface-2)/60 p-3 pl-[2.9rem]">
      <div className="flex flex-col gap-1">
        {merchants.map((shop) => (
          <div key={shop.name} className="flex items-baseline justify-between gap-2 text-[0.84rem]">
            <span className="truncate" title={shop.name}>{shop.name}</span>
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
              className="field-input !w-28 !py-1 !text-[0.85rem]"
              inputMode="numeric"
              value={limitDraft}
              placeholder="5000"
              onChange={(event) => onLimitDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSaveLimit();
              }}
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
                  {limitOver && <span className="text-danger-read"> · {t('over the limit')}</span>}
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

/** The month as thirty-one thin columns, with the usual day drawn as a line. */
function DayRhythm({
  days,
  usual,
  items,
}: {
  days: { day: string; total: number }[];
  usual: number;
  items: MonoStatementItem[];
  rules: ReturnType<typeof useMono.getState>['rules'];
}) {
  const { t } = useI18n();
  const { format } = useMoney();

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

  const said = (day: string) => `${day.slice(8)}.${day.slice(5, 7)}`;

  return (
    <section className="card reveal flex h-full flex-col overflow-hidden p-0">
      <div className="card-head">
        <h3 className="card-head-title">{t('The month, day by day')}</h3>
        {heaviest !== undefined && heaviest.total > 0 && (
          <span className="field-hint tabular">
            {t('Peak')}: {format(Math.round(heaviest.total))} ({said(heaviest.day)})
          </span>
        )}
      </div>

      <div className="card-body flex-1">
        <div className="relative h-44 pr-14">
          <ColumnAxis peak={peak} headroom={100} />

          <div className="relative flex h-full items-end gap-[2px]">
            {days.map((day) => {
              const weekend = [0, 6].includes(new Date(`${day.day}T12:00:00`).getDay());

              return (
                <div
                  key={day.day}
                  className="flex-1 rounded-t-[3px]"
                  style={{
                    height: `${Math.max(1, (day.total / peak) * 100)}%`,
                    background:
                      day.total === 0
                        ? 'var(--surface-2)'
                        : weekend
                          ? 'color-mix(in oklab, var(--accent) 75%, var(--warn))'
                          : 'var(--accent)',
                    opacity: day.total === 0 ? 0.6 : day.day === heaviest?.day ? 1 : 0.78,
                  }}
                  title={`${said(day.day)} — ${format(Math.round(day.total))}`}
                />
              );
            })}
          </div>

          {usual > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-(--warn)"
              style={{ bottom: `${Math.min(98, (usual / peak) * 100)}%` }}
              aria-hidden
            />
          )}
        </div>

        <div className="flex justify-between border-t border-border pr-14 pt-1 text-[0.72rem] text-muted tabular">
          <span>{said(days[0].day)}</span>
          <span>{said(days[days.length - 1].day)}</span>
        </div>

        {usual > 0 && (
          <p className="field-hint mt-1">
            {t('The line is your usual day')} — <Money value={usual} />.{' '}
            {t('A median: one splurge cannot drag it.')}
          </p>
        )}

        {heaviest !== undefined && heaviest.total > 0 && (
          <p className="field-hint mt-1">
            {t('Heaviest')} — {said(heaviest.day)},{' '}
            <b className="tabular"><Money value={heaviest.total} /></b>
            {/* Две покупки в одном месте за день — это «Macbook ×2», а не «Macbook + Macbook»: повторённое название читается… */}
            {heaviestSpent.length > 0 && (
              <>
                :{' '}
                {[...heaviestSpent.reduce((seen, item) => {
                  seen.set(item.description, (seen.get(item.description) ?? 0) + 1);

                  return seen;
                }, new Map<string, number>())]
                  .map(([name, times]) => (times > 1 ? `${name} ×${times}` : name))
                  .join(' + ')}
              </>
            )}
            . {t('A fact, not a reproach.')}
          </p>
        )}
      </div>
    </section>
  );
}
