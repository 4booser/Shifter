'use client';

import NumberFlow from '@number-flow/react';

import { useSettings } from '@/lib/settings/store';

/**
 * A KPI number that travels to its new value instead of teleporting.
 *
 * Big tiles only, on purpose: these are the figures that change while the
 * person watches — a period marked paid, a preset switched, a live shift
 * ticking — and the travel shows the change happening. Rows and tables
 * stay still; a page where every figure dances reads as a slot machine,
 * not a ledger.
 */
export function FlowMoney({
  value,
  className,
  mark,
}: {
  value: number | null | undefined;
  className?: string;
  /**
   * A forced currency mark, prefix-placed. The bank speaks hryvnia whatever
   * label the person picked for wages, and must keep saying so.
   */
  mark?: string;
}) {
  const settings = useSettings((state) => state.settings);
  const { hideAmounts } = settings;
  const currency = mark ?? settings.currency;
  const currencyBefore = mark !== undefined ? true : settings.currencyBefore;

  // The mask keeps the currency mark so a hidden value still reads as money —
  // and never mounts the animated element, so nothing can flash a real digit.
  if (hideAmounts) {
    return (
      <span className={`tabular ${className ?? ''}`.trim()}>
        {currencyBefore ? `${currency}•••` : `••• ${currency}`}
      </span>
    );
  }

  // The sign stands in front of the whole thing — «−₴458», never «₴-458» —
  // matching formatMoney, which learned this the same night.
  const amount = value ?? 0;
  const sign = amount < 0 ? '−' : '';

  return (
    <NumberFlow
      className={`tabular ${className ?? ''}`.trim()}
      value={Math.abs(amount)}
      locales={settings.language}
      format={{
        minimumFractionDigits: 0,
        maximumFractionDigits: settings.moneyDecimals,
        useGrouping: settings.groupThousands,
      }}
      prefix={currencyBefore && currency !== '' ? `${sign}${currency}` : sign === '' ? undefined : sign}
      suffix={!currencyBefore && currency !== '' ? ` ${currency}` : undefined}
    />
  );
}
