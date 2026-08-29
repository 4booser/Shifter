'use client';

import { useMemo } from 'react';

import { useI18n } from '@/lib/i18n';
import { MonoAccount, MonoStatementItem, fromMinor } from '@/lib/mono/mono';
import { balanceCurve } from '@/lib/mono/mono-shape';
import { Money } from '@/components/ui/bits';

/**
 * The top of the bank page: the balance, and the month's curve under it.
 *
 * The curve is the bank's own running balance read off the transactions — the
 * one figure on this page nobody has to trust our arithmetic for. It is an
 * area chart because the question it answers is "how does the month feel",
 * not "what was the value on the 14th"; the exact figures live below.
 */
export function BankHero({
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
  const { t } = useI18n();

  const curve = useMemo(() => balanceCurve(items, from, to), [items, from, to]);

  const width = 640;
  const height = 120;

  const path = useMemo(() => {
    if (curve === null) return null;

    const low = Math.min(...curve.map((point) => point.balance));
    const high = Math.max(...curve.map((point) => point.balance));
    const span = Math.max(1, high - low);

    const x = (index: number) => (index / Math.max(1, curve.length - 1)) * width;
    const y = (value: number) => 14 + (1 - (value - low) / span) * (height - 28);

    const line = curve
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(point.balance).toFixed(1)}`)
      .join(' ');

    return {
      line,
      area: `${line} L ${width} ${height} L 0 ${height} Z`,
      lastX: x(curve.length - 1),
      lastY: y(curve[curve.length - 1].balance),
      low,
      high,
    };
  }, [curve]);

  // The account names the credit limit; the curve alone still knows the
  // balance — its last point is the bank's own figure. client-info failing
  // must not blank the one chart on the page.
  if (account === null && curve === null) return null;

  const balance =
    account !== null
      ? fromMinor(account.balance - account.creditLimit)
      : curve![curve!.length - 1].balance;

  return (
    <section className="card reveal overflow-hidden p-0">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
        <div>
          <span className="field-hint">{t('On the card')}</span>
          <div className="tabular text-[1.9rem] font-bold leading-tight">
            <Money value={balance} />
          </div>
        </div>

        {account !== null && account.creditLimit > 0 && (
          <span className="field-hint tabular">
            {t('of it the bank’s')}: <Money value={fromMinor(account.creditLimit)} />
          </span>
        )}
      </div>

      {path !== null && curve !== null && (
        <div className="mt-2">
          <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="bank-hero-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={path.area} fill="url(#bank-hero-fill)" />
            <path d={path.line} fill="none" stroke="var(--accent)" strokeWidth="2" />
            <circle cx={path.lastX} cy={path.lastY} r="3.5" fill="var(--accent)" />
          </svg>

          <div className="flex justify-between px-4 pb-3 text-[0.72rem] text-faint tabular">
            <span>{curve[0].day.slice(8)}.{curve[0].day.slice(5, 7)}</span>
            <span>
              {t('low')} <Money value={path.low} /> · {t('high')} <Money value={path.high} />
            </span>
            <span>{curve[curve.length - 1].day.slice(8)}.{curve[curve.length - 1].day.slice(5, 7)}</span>
          </div>
        </div>
      )}
    </section>
  );
}
