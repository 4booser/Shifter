'use client';

import { useMemo } from 'react';

import { useI18n } from '@/lib/i18n';
import { MonoAccount, MonoStatementItem, markOf, fromMinor } from '@/lib/mono/mono';
import { balanceCurve } from '@/lib/mono/mono-shape';
import { smoothPath } from '@/lib/charts/math';
import { Icon } from '@/components/ui/icon';
import { Money } from '@/components/ui/bits';
import { FlowMoney } from '@/components/ui/flow';

/**
 * The band of figures across the top of the bank, and the one filled card in
 * it.
 *
 * Before this the balance owned a card two thirds of the page wide, the reserve
 * owned another, and everything else queued underneath — so the short cards on
 * the right ran out while the left column kept going, leaving empty rectangles
 * a screen and a half tall. A row of tiles has no such quarrel: five figures,
 * one of them filled, and the row ends where the shortest tile ends.
 */

/**
 * One quiet tile: what it is, the figure, and the small line that says how it
 * moved. A tile never disappears when its arithmetic comes out empty — a hole
 * in the band reads as a broken page, so the figure becomes «—» and the hint
 * says why.
 */
export function BankTile({
  label,
  icon,
  value,
  hint,
  note,
  tone = 'quiet',
}: {
  label: string;
  icon: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /**
   * The sentence a tile has no room for — how the figure was arrived at, what
   * it does not know. A tile that drops the caveat is a tile that promises.
   */
  note?: string;
  /** Colour for the hint line only; the figure itself is always the page's ink. */
  tone?: 'quiet' | 'good' | 'danger' | 'warn';
}) {
  const ink =
    tone === 'good'
      ? 'text-good-read'
      : tone === 'danger'
        ? 'text-danger-read'
        : tone === 'warn'
          ? 'text-warn-read'
          : 'text-muted';

  return (
    // Justified: the quiet tiles are stretched to the filled one's height by
    // the grid, and left to themselves they hung their figure at the top with
    // a hand's width of nothing under it.
    <div className="tile justify-between" title={note}>
      <span className="tile-label w-full justify-between">
        <span className="truncate">{label}</span>
        <Icon name={icon} size={15} className="text-faint" />
      </span>
      <span className="mt-auto block">
        <span className="tile-value block">{value}</span>
        {hint !== undefined && (
          <span className={`block text-[0.72rem] font-semibold tabular ${ink}`}>{hint}</span>
        )}
      </span>
    </div>
  );
}

/**
 * «На карте» — the filled tile, with the month's own balance curve along its
 * floor.
 *
 * The curve is the bank's own running balance read off the transactions: the
 * one figure on this page nobody has to trust our arithmetic for. At a tile's
 * size it is a sparkline and says only «how did the month feel» — the day the
 * balance was lowest is written under it in figures, because a sparkline that
 * small cannot be read to the hryvnia and should not pretend to be.
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

  const width = 240;
  const height = 48;

  const path = useMemo(() => {
    if (curve === null) return null;

    const low = Math.min(...curve.map((point) => point.balance));
    const high = Math.max(...curve.map((point) => point.balance));
    const span = Math.max(1, high - low);

    const x = (index: number) => (index / Math.max(1, curve.length - 1)) * width;
    const y = (value: number) => 6 + (1 - (value - low) / span) * (height - 14);

    const line = smoothPath(curve.map((point, index) => ({ x: x(index), y: y(point.balance) })));

    return { line, area: `${line} L ${width} ${height} L 0 ${height} Z`, low, high };
  }, [curve]);

  // The account names the credit limit; the curve alone still knows the
  // balance — its last point is the bank's own figure. client-info failing
  // must not blank the one chart on the page.
  if (account === null && curve === null) return null;

  const balance =
    account !== null
      ? fromMinor(account.balance - account.creditLimit)
      : curve![curve!.length - 1].balance;

  const card = account?.maskedPan[0]?.slice(-4) ?? account?.iban.slice(-4) ?? null;

  return (
    <div className="tile tile--hero col-span-2 justify-between">
      <span className="tile-label w-full justify-between">
        <span>{t('On the card')}</span>
        {/* A chip on the accent, mixed from the accent's own ink — `chip-accent`
            is drawn for the page's ground and goes near-invisible here. */}
        {card !== null && (
          <span
            className="chip tabular"
            style={{
              borderColor: 'color-mix(in srgb, var(--accent-ink) 35%, transparent)',
              background: 'color-mix(in srgb, var(--accent-ink) 16%, transparent)',
              color: 'var(--accent-ink)',
            }}
          >
            •••{card}
          </span>
        )}
      </span>

      <div className="tabular text-[1.75rem] font-bold leading-tight">
        {/* The statement's own currency, not a hryvnia stamped on whatever
            the card is actually in. */}
        <FlowMoney
          value={Math.round(balance)}
          mark={account === null ? undefined : markOf(account.currencyCode)}
        />
      </div>

      {path !== null && curve !== null && (
        <>
          <div className="text-[0.7rem] tabular opacity-80">
            {t('low')} <Money value={Math.round(path.low)} /> · {t('high')}{' '}
            <Money value={Math.round(path.high)} />
            {account !== null && account.creditLimit > 0 && (
              <>
                {' · '}
                {t('of it the bank’s')} <Money value={fromMinor(account.creditLimit)} />
              </>
            )}
          </div>

          {/* Bled to the tile's edges: a sparkline with a gutter under it
              reads as a chart missing its axis. Height stated, not inferred —
              a five-to-one viewBox on a four-hundred-pixel tile worked out to
              eighty-six pixels of sparkline, and the whole band was stretched
              to the filled tile's height. */}
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="-mx-[0.95rem] -mb-[0.85rem] mt-1 block h-12 w-[calc(100%+1.9rem)]"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path d={path.area} fill="var(--accent-ink)" opacity="0.14" />
            <path
              d={path.line}
              fill="none"
              stroke="var(--accent-ink)"
              strokeWidth="1.6"
              strokeLinejoin="round"
              opacity="0.75"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </>
      )}
    </div>
  );
}
