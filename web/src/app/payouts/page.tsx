'use client';

import Link from 'next/link';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import { addMonths, currentMonth, keysBetween, todayKey } from '@/lib/calendar/calendar-date';
import { Payout, PayPeriodRow, Reconciliation } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { Shell } from '@/components/layout/shell';
import { useReveal } from '@/lib/fx';
import { ExpensesPanel } from '@/components/dashboard/expenses-panel';
import { PapersPanel } from '@/components/dashboard/papers-panel';
import { TipJar } from '@/components/dashboard/tip-jar';
import { PayslipCheckModal } from '@/components/dashboard/payslip-check';
import { PayoutModal, PayoutPrefill } from '@/components/dashboard/modals/payout-modal';
import { PayoutLedger } from '@/components/dashboard/payout-ledger';
import { Alert, Money } from '@/components/ui/bits';
import { FlowMoney } from '@/components/ui/flow';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Empty } from '@/components/ui/empty';
import { Icon } from '@/components/ui/icon';
import { useTitle } from '@/lib/use-title';
import { useMono } from '@/lib/mono/store';
import { wageCandidates } from '@/lib/mono/mono';

const MONTHS_BACK = 6;

const STATUS_LABEL: Record<PayPeriodRow['status'], string> = {
  open: 'Being worked',
  due: 'Expected',
  overdue: 'Late',
  partial: 'Advance paid',
  paid: 'Settled',
  short: 'Underpaid',
  over: 'Overpaid',
};

export default function PayoutsPage() {
  const hydrateBank = useMono((state) => state.hydrate);

  useEffect(() => {
    hydrateBank();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell>
      <Payouts />
    </Shell>
  );
}

/**
 * When money is due, from whom, and whether it arrived in full. Two places on
 * different cycles is already more than anyone tracks reliably in their head —
 * which is exactly how a place that quietly pays short goes unnoticed.
 */
function Payouts() {
  const { t, lang, n } = useI18n();

  useTitle('Payouts');
  const revealHost = useReveal<HTMLDivElement>();

  const [data, setData] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthsBack, setMonthsBack] = useState(MONTHS_BACK);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [prefill, setPrefill] = useState<PayoutPrefill | null>(null);
  const [editing, setEditing] = useState<Payout | null>(null);
  const [ledger, setLedger] = useState<Payout[]>([]);
  const [checking, setChecking] = useState<{ locationId: number; on: string } | null>(null);

  /**
   * The stretch the page is about: as far back as the periods reach, and one
   * month ahead. The expenses panel reads the same window so a fare and the
   * wage it ate into are always on screen together.
   */
  const range = useMemo(() => {
    const now = currentMonth();
    const start = addMonths(now, -monthsBack);
    const ahead = addMonths(now, 2);
    const last = new Date(ahead.year, ahead.month - 1, 0);

    return {
      from: `${start.year}-${`${start.month}`.padStart(2, '0')}-01`,
      to: `${last.getFullYear()}-${`${last.getMonth() + 1}`.padStart(2, '0')}-${`${last.getDate()}`.padStart(2, '0')}`,
    };
  }, [monthsBack]);

  const load = useCallback(() => {
    const now = currentMonth();
    const start = addMonths(now, -monthsBack);
    // One month ahead, so a period being worked right now shows up as
    // something to expect rather than disappearing off the end.
    const ahead = addMonths(now, 2);
    const last = new Date(ahead.year, ahead.month - 1, 0);
    const to = `${last.getFullYear()}-${`${last.getMonth() + 1}`.padStart(2, '0')}-${`${last.getDate()}`.padStart(2, '0')}`;

    setLoading(true);

    const from = `${start.year}-${`${start.month}`.padStart(2, '0')}-01`;

    void calendarApi
      .schedule(from, to)
      .then(setData)
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setLoading(false));

    // The raw rows behind the reconciliation, for the ledger section.
    void calendarApi
      .payouts(from, to)
      .then(setLedger)
      .catch(() => setLedger([]));
  }, [monthsBack]);

  useEffect(load, [load]);

  const periods = data?.periods ?? [];
  const shortfalls = data?.shortfalls ?? [];
  const upcoming = periods
    .filter(
      (row) =>
        row.status === 'due' ||
        row.status === 'overdue' ||
        row.status === 'partial' ||
        row.status === 'open',
    )
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
  const settled = periods.filter((row) => row.status === 'paid' || row.status === 'short' || row.status === 'over');

  /** How long until the next money, and how much lands that day. */
  const nextDue = useMemo(() => {
    const today = todayKey();
    const ahead = periods
      .filter((row) => row.paid === 0 && row.due_on >= today && row.expected > 0)
      .sort((a, b) => a.due_on.localeCompare(b.due_on));

    if (ahead.length === 0) return null;

    const next = ahead[0];
    const sameDay = ahead.filter((row) => row.due_on === next.due_on);

    return {
      days: keysBetween(today, next.due_on).length - 1,
      due: next.due_on,
      amount: sameDay.reduce((sum, row) => sum + row.expected, 0),
      where: sameDay.length,
    };
  }, [periods]);

  /** Every settled period as one square, grouped by place and payment. */
  const reliability = useMemo(() => {
    const done = periods.filter((row) => row.status !== 'open');

    if (done.length < 3) return [];

    const groups = new Map<string, { name: string; stream: PayPeriodRow['stream']; rows: PayPeriodRow[] }>();

    for (const row of done) {
      const key = `${row.location_id}:${row.stream}`;
      const group = groups.get(key) ?? { name: row.location_name, stream: row.stream, rows: [] };

      group.rows.push(row);
      groups.set(key, group);
    }

    return [...groups.values()]
      .filter((group) => group.rows.length >= 3)
      .map((group) => {
        const rows = [...group.rows].sort((a, b) => a.period_from.localeCompare(b.period_from));
        const clean = rows.filter((row) => row.status === 'paid' || row.status === 'over').length;

        return { ...group, rows, onTime: Math.round((clean / rows.length) * 100) };
      });
  }, [periods]);

  const label = (key: string) =>
    new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(`${key}T00:00:00`));

  /** "in 3 days" / "5 days late" — a bare date needs mental arithmetic. */
  const relative = (row: PayPeriodRow) => {
    if (row.days_late > 0) return `${n(row.days_late, 'days')} ${t('late')}`;

    const days = Math.round(
      (new Date(`${row.due_on}T00:00:00`).getTime() - new Date(`${todayKey()}T00:00:00`).getTime()) / 86_400_000,
    );

    if (days === 0) return t('today');
    if (days < 0) return label(row.due_on);

    return `${t('in')} ${n(days, 'days')}`;
  };

  const streamChip = (row: { stream: PayPeriodRow['stream'] }) =>
    row.stream === 'commission' ? t('Commission') : row.stream === 'wage' ? t('Wage') : null;

  /** Draws the line, or lifts it. Either way the schedule is re-read. */
  const settle = (row: PayPeriodRow, kind: 'paid' | 'written-off' | null) => {
    void calendarApi
      .settlePeriod(row.location_id, row.period_from, row.stream, kind, null)
      .then(load)
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const record = (row: PayPeriodRow) => {
    setPrefill({ locationId: row.location_id, from: row.period_from, to: row.period_to, expected: row.expected, stream: row.stream });
    setEditing(null);
    setPayoutOpen(true);
  };

  return (
    <div ref={revealHost} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[1.3rem] font-bold tracking-tight">{t('Payouts')}</h1>
        <button
          type="button"
          className="btn btn-primary btn-sm ml-auto"
          onClick={() => {
            setPrefill(null);
            setEditing(null);
            setPayoutOpen(true);
          }}
        >
          <Icon name="plus" size={13} />
          {t('Record a payment')}
        </button>
      </div>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {/* ==== Next money in ==== */}
      {nextDue !== null && (
        <section className="card reveal flex flex-wrap items-center gap-x-6 gap-y-1 p-4">
          <div>
            <span className="field-hint block">{t('Next money in')}</span>
            <FlowMoney value={nextDue.amount} className="text-[1.6rem] font-bold text-good" />
          </div>
          <p className="text-[0.9rem] text-muted">
            {nextDue.days === 0 ? t('today') : nextDue.days === 1 ? t('tomorrow') : `${t('in')} ${n(nextDue.days, 'days')}`} ·{' '}
            {label(nextDue.due)}
            {nextDue.where > 1 && <> · {nextDue.where} {t('payments')}</>}
          </p>
        </section>
      )}

      {/* ==== Shortfall detector, first: the only thing worth acting on today ==== */}
      {shortfalls.map((shortfall) => (
        <section key={`${shortfall.location_id}-${shortfall.stream}`} className="card reveal border-danger/40 bg-(--danger-soft) p-4">
          <h2 className="mb-1 flex items-center gap-2 font-bold text-danger">
            <Icon name="flame" size={16} />
            {t('Underpaid repeatedly')}
          </h2>
          <p className="text-[0.9rem]">
            <strong>{shortfall.location_name}</strong>
            {streamChip(shortfall) && <span className="chip mx-1.5">{streamChip(shortfall)}</span>} {t('has paid short')}{' '}
            <strong>{shortfall.periods}</strong> {t('periods running')}, {t('since')} {label(shortfall.since)}.
          </p>
          <p className="mt-1 text-[1.2rem] font-bold text-danger">
            {t('You are owed')} <Money value={shortfall.total_short} />
          </p>
          <p className="field-hint">{t('Broken down by period below. Take the dates and amounts to whoever does the payroll.')}</p>
        </section>
      ))}

      {/* ==== KPI ==== */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="card reveal p-3">
          <span className="field-hint block">
            {(data?.overdue ?? 0) === (data?.awaited ?? 0) && (data?.awaited ?? 0) > 0
              ? t('Awaited — all of it late')
              : t('Awaited')}
          </span>
          <FlowMoney
            value={data?.awaited ?? 0}
            className={`text-[1.25rem] font-bold ${
              (data?.overdue ?? 0) === (data?.awaited ?? 0) && (data?.awaited ?? 0) > 0 ? 'text-danger' : ''
            }`}
          />
        </div>
        {/* The twin tile only earns its spot when it says something new. */}
        {(data?.overdue ?? 0) !== (data?.awaited ?? 0) && (
          <div className="card reveal p-3">
            <span className="field-hint block">{t('Of that, late')}</span>
            <FlowMoney value={data?.overdue ?? 0} className={`text-[1.25rem] font-bold ${(data?.overdue ?? 0) > 0 ? 'text-danger' : ''}`} />
          </div>
        )}
        <div className="card reveal p-3">
          <span className="field-hint block">{t('Gone missing')}</span>
          <FlowMoney
            // A shortfall somebody has drawn a line under is not still owed:
            // leaving it in this figure is the nagging the line exists to stop.
            value={periods
              .filter((row) => row.settled === null && row.status === 'short')
              .reduce((total, row) => total + (row.expected - row.paid), 0)}
            className="text-[1.25rem] font-bold"
          />
        </div>
      </div>

      {/* ==== Reliability strips ==== */}
      {reliability.length > 0 && (
        <section className="card reveal p-4">
          <h2 className="mb-2 text-[0.98rem] font-bold">{t('How each place has paid')}</h2>
          <div className="flex flex-col gap-2.5">
            {reliability.map((group) => (
              <div key={`${group.name}-${group.stream}`}>
                <p className="mb-1 flex items-center gap-2 text-[0.85rem]">
                  <strong>{group.name}</strong>
                  {streamChip(group) && <span className="chip">{streamChip(group)}</span>}
                  <span className="field-hint">{group.onTime}% {t('on time')}</span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {group.rows.map((row) => (
                    <span
                      key={row.period_from + row.stream}
                      title={`${row.period_from} — ${t(STATUS_LABEL[row.status])}`}
                      className="h-3.5 w-3.5 rounded"
                      style={{
                        background:
                          row.settled !== null
                            ? 'var(--surface-2)'
                            : row.status === 'paid' || row.status === 'over'
                              ? 'var(--good)'
                              : row.status === 'short'
                                ? 'var(--danger)'
                                : row.status === 'overdue'
                                  ? 'var(--warn)'
                                  : row.status === 'partial'
                                    ? 'var(--accent)'
                                    : 'var(--surface-2)',
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ==== Upcoming ==== */}
      <section className="card reveal p-4">
        <h2 className="mb-2 text-[0.98rem] font-bold">{t('Expected')}</h2>
        {loading ? (
          <SkeletonRows rows={3} height="2.75rem" />
        ) : upcoming.length === 0 ? (
          <Empty
            icon="wallet"
            title={t('Nothing on the way yet')}
            action={{ label: t('Set up a place'), href: '/dashboard' }}
          >
            {t('Tell a place when it pays and this page starts checking: what is owed, what is late, and whether what arrived matches what was worked.')}
          </Empty>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {upcoming.map((row) => (
              <PeriodRow key={`${row.location_id}-${row.period_from}-${row.stream}`} row={row} onRecord={record} onSettle={settle} onCheck={(row) => setChecking({ locationId: row.location_id, on: row.period_from })} relative={relative} streamChip={streamChip} />
            ))}
          </ul>
        )}
      </section>

      {/* ==== Settled ==== */}
      {settled.length > 0 && (
        <section className="card reveal p-4">
          <h2 className="mb-2 text-[0.98rem] font-bold">{t('Settled')}</h2>
          <ul className="flex flex-col gap-1.5">
            {settled.map((row) => (
              <PeriodRow key={`${row.location_id}-${row.period_from}-${row.stream}`} row={row} onRecord={record} onSettle={settle} onCheck={(row) => setChecking({ locationId: row.location_id, on: row.period_from })} relative={relative} streamChip={streamChip} />
            ))}
          </ul>
          <button type="button" className="btn btn-quiet btn-sm mt-2" onClick={() => setMonthsBack((months) => months + 6)}>
            {t('Show earlier periods')}
          </button>
        </section>
      )}

      <PayslipCheckModal
        open={checking !== null}
        locationId={checking?.locationId ?? null}
        on={checking?.on ?? ''}
        onClose={() => setChecking(null)}
      />

      {/* ==== What the work cost ==== */}
      {/* The one page somebody can hand to a person who does not have the
          app — which is where every argument about a wage eventually goes. */}
      <p className="field-hint">
        <Link className="text-(--accent) mr-3" href="/contract">
          {t('Questions to ask before you sign')}
        </Link>
        <Link className="text-(--accent)" href="/payslip">
          {t('Payslip for a period')} ›
        </Link>
      </p>

      <ExpensesPanel from={range.from} to={range.to} onChanged={load} />

      {/* Beside the expenses, because this is the page where money arriving
          and money leaving are thought about in the same breath. */}
      <TipJar />

      {/* The papers desk lives with the money pages: a statement is a payout
          question, not a settings question. */}
      <PayoutLedger
        payouts={ledger}
        onEdit={(payout) => {
          setEditing(payout);
          setPrefill(null);
          setPayoutOpen(true);
        }}
        onChanged={load}
      />

      <PapersPanel />

      <PayoutModal
        open={payoutOpen}
        prefill={prefill}
        editing={editing}
        onClose={() => {
          setPayoutOpen(false);
          setEditing(null);
        }}
        onSaved={load}
      />
    </div>
  );
}

function PeriodRow({
  row,
  onRecord,
  onSettle,
  onCheck,
  relative,
  streamChip,
}: {
  row: PayPeriodRow;
  onRecord: (row: PayPeriodRow) => void;
  onSettle: (row: PayPeriodRow, kind: 'paid' | 'written-off' | null) => void;
  onCheck: (row: PayPeriodRow) => void;
  relative: (row: PayPeriodRow) => string;
  streamChip: (row: { stream: PayPeriodRow['stream'] }) => string | null;
}) {
  const { t } = useI18n();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuHost = useRef<HTMLSpanElement>(null);
  const rowKey = `${row.location_id}:${row.period_from}:${row.stream}`;

  // An open menu closes the way every menu on the platform does: a click
  // anywhere else, or Escape. Without this it sat open until the next toggle.
  useEffect(() => {
    if (menuFor === null) return;

    const away = (event: PointerEvent) => {
      if (menuHost.current !== null && !menuHost.current.contains(event.target as Node)) {
        setMenuFor(null);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuFor(null);
    };

    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);

    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [menuFor]);

  // A shortfall somebody has finished arguing about: still short, no longer
  // chased. Only these two states can be closed — an open month has nothing
  // to close yet.
  const chaseable = row.settled === null && (row.status === 'short' || row.status === 'overdue');

  // The statement's side of the story, where a bank is connected: one credit
  // near the due day and near the amount is worth a question mark, and the
  // full is-this-your-wage flow lives on the bank page it links to.
  const bankItems = useMono((state) => state.items);
  const landed = useMemo(() => {
    if (bankItems.length === 0) return null;
    if (row.settled !== null || row.expected <= row.paid || row.stream === 'commission') return null;

    const [candidate] = wageCandidates(
      bankItems,
      {
        locationId: row.location_id,
        locationName: row.location_name,
        periodFrom: row.period_from,
        periodTo: row.period_to,
        amount: row.expected - row.paid,
        due: row.due_on,
      },
      [],
    );

    if (candidate === undefined || Math.abs(candidate.difference) > 0.15) return null;

    return candidate;
  }, [bankItems, row]);

  const tone =
    row.status === 'short' || row.status === 'overdue'
      ? 'border-danger/40'
      : row.status === 'paid' || row.status === 'over'
        ? 'border-good/30'
        : 'border-border';

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-(--radius) border px-3 py-2 ${tone}`}>
      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: row.colour }} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 text-[0.88rem] font-medium">
          {row.location_name}
          {streamChip(row) && <span className="chip">{streamChip(row)}</span>}
          <span
            className={`chip ${
              row.settled !== null
                ? 'text-muted'
                : row.status === 'short' || row.status === 'overdue'
                  ? 'border-danger/40 text-danger'
                  : row.status === 'paid' || row.status === 'over'
                    ? 'border-good/40 text-good'
                    : ''
            }`}
          >
            {t(STATUS_LABEL[row.status])}
          </span>
          {row.settled !== null && (
            <span className="chip text-muted">
              {t(row.settled === 'paid' ? 'Settled off the books' : 'Written off')}
            </span>
          )}
          {landed !== null && (
            <Link href="/bank" className="chip chip-good" title={t('A credit near this amount landed near the due day — the bank page can match it properly.')}>
              {t('on the card?')} +<Money value={landed.total} />
            </Link>
          )}
        </span>
        <span className="field-hint tabular">
          {row.period_from} — {row.period_to} · {relative(row)}
        </span>
      </span>

      <span className="text-right">
        <Money value={row.expected} className="block text-[0.95rem] font-bold" />
        {row.status === 'partial' ? (
          <span className="field-hint tabular block">
            {t('Advance')} <Money value={row.paid_advance} /> · {t('left')}{' '}
            <Money value={row.expected - row.paid} />
          </span>
        ) : (
          row.paid > 0 &&
          row.difference !== 0 && (
            <span className={`text-[0.78rem] tabular ${row.difference < 0 ? 'text-danger' : 'text-good'}`}>
              {row.difference < 0 ? '−' : '+'}
              <Money value={Math.abs(row.difference)} />
            </span>
          )
        )}
      </span>

      {(row.status === 'due' || row.status === 'overdue' || row.status === 'partial') && (
        <button type="button" className="btn btn-sm" onClick={() => onRecord(row)}>
          {t('Record')}
        </button>
      )}

      {/* Not only on a short period: the point is to find the line that is
          wrong, and a period that adds up to the right total can still have
          the night hours in the wrong column. */}
      {row.location_id > 0 && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => onCheck(row)}>
          {t('Check')}
        </button>
      )}

      {/* Closing moves live behind one dot-menu: the audit counted four
          text buttons per row shouting over the figures. */}
      {(chaseable || row.settled !== null) && (
        <span ref={menuHost} className="relative">
          <button
            type="button"
            className="btn btn-quiet btn-sm px-2"
            aria-label={t('Close the question')}
            onClick={() => setMenuFor(menuFor === rowKey ? null : rowKey)}
          >
            ···
          </button>
          {menuFor === rowKey && (
            <span className="absolute right-0 top-full z-20 mt-1 flex w-52 flex-col rounded-(--radius) border border-border bg-surface p-1 shadow-lg">
              {chaseable && (
                <>
                  <button type="button" className="btn btn-quiet btn-sm justify-start" onClick={() => { setMenuFor(null); onSettle(row, 'paid'); }}>
                    {t('Got it in cash')}
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm justify-start text-danger" onClick={() => { setMenuFor(null); onSettle(row, 'written-off'); }}>
                    {t('Let it go')}
                  </button>
                </>
              )}
              {row.settled !== null && (
                <button type="button" className="btn btn-quiet btn-sm justify-start" onClick={() => { setMenuFor(null); onSettle(row, null); }}>
                  {t('Chase it again')}
                </button>
              )}
            </span>
          )}
        </span>
      )}
    </li>
  );
}
