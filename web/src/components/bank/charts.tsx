'use client';

import { useMemo } from 'react';

import { todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { MonoAccount, MonoStatementItem, fromMinor } from '@/lib/mono/mono';
import { CategoryRule } from '@/lib/mono/mono-rules';
import { habitualDay } from '@/lib/mono/mono-work';
import { balanceCurve } from '@/lib/mono/mono-shape';
import {
  categoryMonths,
  categoryStyle,
  cumulativeSpend,
  monthlyFlows,
} from '@/lib/mono/spend-viz';
import { smoothPath } from '@/lib/charts/math';
import { ChartTip, CrossHair, useChartHover } from '@/components/charts/hover';
import { Money } from '@/components/ui/bits';
import { BankTile } from '@/components/bank/hero';

/* The bank's chart shelf. */

const monthName = (key: string, lang: string) =>
  new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(`${key}-15T12:00:00`));

/** A column chart's axis: the tallest value named, and two rules under it at thirds of it. */
export function ColumnAxis({ peak, headroom = 92 }: { peak: number; headroom?: number }) {
  const { compact } = useMoney();

  const at = (share: number) => `${100 - share * headroom}%`;

  // Above the columns, not under them: the bars are positioned too, and the later element wins — the peak's own…
  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      {[1, 2 / 3, 1 / 3].map((share) => (
        <div
          key={share}
          className="absolute inset-x-0 border-t border-dashed border-border"
          style={{ top: at(share) }}
        >
          <span className="absolute -top-2 right-0 bg-surface pl-1 text-[0.66rem] text-faint tabular">
            {compact(Math.round(peak * share))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One dot and one word: which colour is which, without a pointer. */
export function ChartLegend({ of }: { of: { colour: string; name: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {of.map((entry) => (
        <span key={entry.name} className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-muted">
          <i className="h-2 w-2 flex-none rounded-full" style={{ background: entry.colour }} />
          {entry.name}
        </span>
      ))}
    </div>
  );
}

/** ==== The band's tile: how many usual days the balance holds ==== */
export function ReserveTile({
  account,
  items,
  from,
  to,
}: {
  account: MonoAccount | null;
  items: MonoStatementItem[];
  from: string;
  to: string;
}) {
  const { t, n } = useI18n();
  const { format } = useMoney();

  /* The same habit the forecast beside it is drawn from. */
  const usual = useMemo(
    () => habitualDay(items, todayKey() > to ? to : todayKey()),
    [items, to],
  );

  // The same fallback the hero uses: the curve's last point is the bank's own stamped figure.
  const curve = useMemo(() => balanceCurve(items, from, to), [items, from, to]);
  const balance = account !== null
    ? fromMinor(account.balance - account.creditLimit)
    : curve !== null
      ? curve[curve.length - 1].balance
      : null;

  const days = balance === null || usual <= 0 ? null : Math.floor(balance / usual);

  return (
    <BankTile
      label={t('Enough for')}
      icon="shield"
      value={days === null ? '—' : n(days, 'days')}
      hint={
        days === null
          ? <span className="text-faint">{t('not enough statement to divide')}</span>
          : `${format(Math.round(balance!))} ÷ ${format(Math.round(usual))}`
      }
      note={t('Arithmetic, not a promise — the forecast below knows about paydays, this line does not.')}
    />
  );
}

/** ==== The band's tile: what a day costs when nothing special happens ==== */
export function UsualDayTile({ items, to }: { items: MonoStatementItem[]; to: string }) {
  const { t } = useI18n();

  const usual = useMemo(
    () => habitualDay(items, todayKey() > to ? to : todayKey()),
    [items, to],
  );

  return (
    <BankTile
      label={t('An ordinary day')}
      icon="cup"
      value={usual <= 0 ? '—' : <Money value={Math.round(usual)} />}
      hint={<span className="text-faint">{t('an average over three months')}</span>}
      note={t('Every day with a record on it, averaged — the figure the forecast walks the month with.')}
    />
  );
}

/** ==== Money in against money out, month by month ==== */
export function MonthlyFlowsCard({ items }: { items: MonoStatementItem[] }) {
  const { t, lang } = useI18n();
  const rows = useMemo(() => monthlyFlows(items, 6), [items]);
  const { ref, hover, onMove, onLeave } = useChartHover<(typeof rows)[number]>();

  const shown = rows.filter((row) => row.earned > 0 || row.spent > 0);

  if (shown.length < 2) return null;

  const peak = Math.max(1, ...shown.map((row) => Math.max(row.earned, row.spent)));
  /* Ширина месяца с потолком. */
  const width = Math.min(100 / shown.length, 24);

  return (
    <section className="card reveal flex h-full flex-col overflow-hidden p-0">
      <div className="card-head">
        <h3 className="card-head-title">{t('In against out, month by month')}</h3>
        <ChartLegend
          of={[
            { colour: 'var(--good)', name: t('Came in') },
            { colour: 'var(--danger)', name: t('Went out') },
          ]}
        />
      </div>

      <div className="card-body flex-1">
        <div
          ref={ref}
          className="relative h-44 pr-14"
          onMouseMove={(event) => {
            const box = ref.current?.getBoundingClientRect();

            if (box === undefined) return;

            onMove(
              event,
              shown.map((row, index) => ({ x: ((index + 0.5) * box.width) / shown.length, datum: row })),
            );
          }}
          onMouseLeave={onLeave}
        >
          {hover !== null && <CrossHair x={hover.x} />}
          {hover !== null && (
            <ChartTip x={hover.x}>
              <b>{monthName(hover.datum.month, lang)}</b>
              <div className="text-good-read tabular">+<Money value={hover.datum.earned} /></div>
              <div className="text-danger-read tabular">−<Money value={hover.datum.spent} /></div>
              <div className={`tabular ${hover.datum.earned - hover.datum.spent >= 0 ? 'text-good-read' : 'text-danger-read'}`}>
                = <Money value={hover.datum.earned - hover.datum.spent} />
              </div>
            </ChartTip>
          )}

          <ColumnAxis peak={peak} />

          <div className="relative flex h-full items-end justify-center">
            {shown.map((row, index) => {
              const latest = index === shown.length - 1;

              return (
                <div key={row.month} className="flex h-full items-end justify-center gap-1" style={{ width: `${width}%` }}>
                  <div className="relative flex h-full w-[26%] items-end">
                    <div
                      className="w-full rounded-t-[3px] bg-(--good)"
                      style={{ height: `${Math.max(2, (row.earned / peak) * 92)}%`, opacity: latest ? 1 : 0.75 }}
                    />
                    {/* Округление до тысяч в первые дни месяца превращает подпись в «+0K», и столбик выглядит сломанным, а не… */}
                    {latest && (
                      <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full text-[0.68rem] font-semibold text-good-read tabular">
                        {row.earned >= 1000 ? `+${Math.round(row.earned / 1000)}K` : <>+<Money value={row.earned} /></>}
                      </span>
                    )}
                  </div>
                  <div className="relative flex h-full w-[26%] items-end">
                    <div
                      className="w-full rounded-t-[3px] bg-(--danger)"
                      style={{ height: `${Math.max(2, (row.spent / peak) * 92)}%`, opacity: latest ? 0.95 : 0.7 }}
                    />
                    {latest && (
                      <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full text-[0.68rem] font-semibold text-danger-read tabular">
                        {row.spent >= 1000 ? `−${Math.round(row.spent / 1000)}K` : <>−<Money value={row.spent} /></>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-center border-t border-border pt-1 pr-14">
          {shown.map((row) => (
            <span key={row.month} className="text-center text-[0.72rem] text-muted" style={{ width: `${width}%` }}>
              {monthName(row.month, lang)}
            </span>
          ))}
        </div>

        <p className="field-hint mt-1">{t('Transfers stay out of both columns.')}</p>
      </div>
    </section>
  );
}

/** ==== The spending mix, month by month ==== */
export function CategoryMonthsCard({
  items,
  rules,
}: {
  items: MonoStatementItem[];
  rules: CategoryRule[];
}) {
  const { t, lang } = useI18n();
  const rows = useMemo(() => categoryMonths(items, rules, 6), [items, rules]);
  const { ref, hover, onMove, onLeave } = useChartHover<(typeof rows)[number]>();

  const shown = rows.filter((row) => row.parts.length > 0);

  if (shown.length < 2) return null;

  const peak = Math.max(1, ...shown.map((row) => row.parts.reduce((sum, part) => sum + part.total, 0)));
  const width = 100 / shown.length;

  // The colours, named. Hover answers with figures; the legend answers the
  // cheaper question — which stripe is which — without a pointer.
  const named = [...new Map(
    shown.flatMap((row) => row.parts).map((part) => [part.name, part] as const),
  ).keys()].slice(0, 6);

  return (
    <section className="card reveal flex h-full flex-col overflow-hidden p-0">
      <div className="card-head">
        <h3 className="card-head-title">{t('The mix, month by month')}</h3>
        <ChartLegend of={named.map((name) => ({ colour: categoryStyle(name).hue, name }))} />
      </div>

      <div className="card-body flex-1">
        <div
          ref={ref}
          className="relative h-44 pr-14"
          onMouseMove={(event) => {
            const box = ref.current?.getBoundingClientRect();

            if (box === undefined) return;

            onMove(
              event,
              shown.map((row, index) => ({ x: ((index + 0.5) * box.width) / shown.length, datum: row })),
            );
          }}
          onMouseLeave={onLeave}
        >
          {hover !== null && <CrossHair x={hover.x} />}
          {hover !== null && (
            <ChartTip x={hover.x}>
              <b>{monthName(hover.datum.month, lang)}</b>
              {hover.datum.parts.map((part) => (
                <div key={part.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1">
                    <i className="h-2 w-2 rounded-full" style={{ background: categoryStyle(part.name).hue }} />
                    {part.name}
                  </span>
                  <span className="tabular"><Money value={part.total} /></span>
                </div>
              ))}
            </ChartTip>
          )}

          <ColumnAxis peak={peak} />

          <div className="relative flex h-full items-end">
            {shown.map((row) => {
              const total = row.parts.reduce((sum, part) => sum + part.total, 0);

              return (
                <div key={row.month} className="flex h-full items-end justify-center" style={{ width: `${width}%` }}>
                  <div
                    className="flex w-[52%] flex-col-reverse overflow-hidden rounded-t-[4px]"
                    style={{ height: `${Math.max(3, (total / peak) * 92)}%` }}
                  >
                    {row.parts.map((part) => (
                      <div
                        key={part.name}
                        style={{
                          flexGrow: part.total,
                          flexBasis: 1,
                          background: categoryStyle(part.name).hue,
                          opacity: 0.88,
                          marginTop: 1,
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex border-t border-border pt-1 pr-14">
          {shown.map((row) => (
            <span key={row.month} className="text-center text-[0.72rem] text-muted" style={{ width: `${width}%` }}>
              {monthName(row.month, lang)}
            </span>
          ))}
        </div>

        <p className="field-hint mt-1">{t('A category keeps its colour and its slot — what changes is how much of the column it takes.')}</p>
      </div>
    </section>
  );
}

/** ==== This month's pace against last month's ==== */
export function SpendPaceCard({
  items,
  from,
  to,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
}) {
  const { t } = useI18n();
  const { compact } = useMoney();

  const previousRange = useMemo(() => {
    const start = new Date(`${from}T12:00:00`);
    const prevEnd = new Date(start.getTime() - 86400000);
    const key = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);

    return { from: key(prevStart), to: key(prevEnd) };
  }, [from]);

  const now = useMemo(() => cumulativeSpend(items, from, to), [items, from, to]);
  const before = useMemo(
    () => cumulativeSpend(items, previousRange.from, previousRange.to),
    [items, previousRange],
  );

  const { ref, hover, onMove, onLeave } = useChartHover<{ day: number; now: number | null; before: number | null }>();

  const days = Math.max(now.length, before.length);
  const nowLast = [...now].reverse().find((point) => point.total > 0);
  const beforeTotal = before.at(-1)?.total ?? 0;

  if (days < 3 || (nowLast === undefined && beforeTotal === 0)) return null;

  const peak = Math.max(1, now.at(-1)?.total ?? 0, beforeTotal);
  const W = 560;
  const H = 150;
  // The strip on the right the axis labels live in.
  const gutter = 56;
  const x = (index: number) => (index / (days - 1)) * W;
  const y = (value: number) => H - (value / peak) * (H - 14) - 6;

  const path = (line: { total: number }[]) =>
    smoothPath(line.map((point, index) => ({ x: x(index), y: y(point.total) })));

  // Today's index inside the current month, so the fact line stops at today
  // instead of flatlining to the month's end.
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayIndex = now.findIndex((point) => point.day === todayIso);
  const factLine = todayIndex >= 0 ? now.slice(0, todayIndex + 1) : now;

  return (
    <section className="card reveal flex h-full flex-col overflow-hidden p-0">
      <div className="card-head">
        <h3 className="card-head-title">{t('The pace')}</h3>
        <ChartLegend
          of={[
            { colour: 'var(--accent)', name: t('This month') },
            { colour: 'var(--faint)', name: t('last month') },
          ]}
        />
      </div>

      <div className="card-body flex-1">
        <div
          ref={ref}
          className="relative h-44 pr-14"
          onMouseMove={(event) => {
            const box = ref.current?.getBoundingClientRect();

            if (box === undefined) return;

            onMove(
              event,
              Array.from({ length: days }, (_, index) => ({
                x: (index / (days - 1)) * (box.width - gutter),
                datum: {
                  day: index + 1,
                  now: index < factLine.length ? factLine[index].total : null,
                  before: index < before.length ? before[index].total : null,
                },
              })),
            );
          }}
          onMouseLeave={onLeave}
        >
          {/* The axis the running total never had: the month's end value is
              the one figure this chart is about. */}
          <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
            {[1, 2 / 3, 1 / 3].map((share) => (
              <div
                key={share}
                className="absolute inset-x-0 border-t border-dashed border-border"
                // The same mapping the line uses: y = H − value/peak·(H−14) − 6, said as a percentage of the box.
                style={{ top: `${96 - 90.67 * share}%` }}
              >
                <span className="absolute -top-2 right-0 bg-surface pl-1 text-[0.66rem] text-faint tabular">
                  {compact(Math.round(peak * share))}
                </span>
              </div>
            ))}
          </div>

          {hover !== null && <CrossHair x={hover.x} />}
          {hover !== null && (
            <ChartTip x={hover.x}>
              <b>{t('Day')} {hover.datum.day}</b>
              {hover.datum.now !== null && (
                <div className="tabular">{t('now')}: <Money value={hover.datum.now} /></div>
              )}
              {hover.datum.before !== null && (
                <div className="tabular text-muted">{t('last month')}: <Money value={hover.datum.before} /></div>
              )}
            </ChartTip>
          )}

          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="absolute left-0 top-0 h-full w-[calc(100%-3.5rem)]"
            preserveAspectRatio="none"
            role="img"
            aria-label={t('The pace')}
          >
            {before.length > 1 && (
              <path
                d={path(before)} fill="none" stroke="var(--faint)" strokeWidth="2"
                strokeDasharray="4 5" vectorEffect="non-scaling-stroke"
              />
            )}
            {factLine.length > 1 && (
              <path
                d={path(factLine)} fill="none" stroke="var(--accent)" strokeWidth="2.5"
                strokeLinecap="round" vectorEffect="non-scaling-stroke"
              />
            )}
            {factLine.length > 0 && (
              <circle
                cx={x(factLine.length - 1)}
                cy={y(factLine[factLine.length - 1].total)}
                r="3.5"
                fill="var(--accent)"
                stroke="var(--surface)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        </div>

        <div className="flex justify-between border-t border-border pr-14 pt-1 text-[0.72rem] text-muted tabular">
          <span>{t('Day')} 1</span>
          <span>{t('Day')} {days}</span>
        </div>

        <p className="field-hint mt-1">
          {t('Running total against last month, day for day. Faster is visible by the third day, not the thirtieth.')}
        </p>
      </div>
    </section>
  );
}
