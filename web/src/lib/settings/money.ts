'use client';

import { useSettings } from './store';
import { Settings } from './settings';

/** Formats an amount with the chosen currency label. */
export function formatMoney(settings: Settings, amount: number): string {
  const { currency, currencyBefore, hideAmounts } = settings;

  // The mask keeps the currency mark so a hidden value still reads as money.
  if (hideAmounts) return currencyBefore ? `${currency}•••` : `••• ${currency}`;

  // The sign stands in front of the whole thing: «−₴458», never «₴-458».
  // Half the bank page said one and half the other before this line.
  const sign = amount < 0 ? '−' : '';

  const text = Math.abs(amount).toLocaleString(settings.language, {
    minimumFractionDigits: 0,
    maximumFractionDigits: settings.moneyDecimals,
    useGrouping: settings.groupThousands,
  });

  if (currency === '') return `${sign}${text}`;

  return currencyBefore ? `${sign}${currency}${text}` : `${sign}${text} ${currency}`;
}

/**
 * An amount labelled with an ISO code rather than the person's own symbol.
 * Used where two currencies sit side by side: printing both with the same
 * mark would make the comparison meaningless, which is the whole reason the
 * two figures are next to each other.
 */
export function formatMoneyIn(settings: Settings, code: string, amount: number): string {
  const { hideAmounts } = settings;

  if (hideAmounts) return `••• ${code}`;

  const text = amount.toLocaleString(settings.language, {
    minimumFractionDigits: 0,
    maximumFractionDigits: settings.moneyDecimals,
    useGrouping: settings.groupThousands,
  });

  return `${text} ${code}`;
}

/** Short form for chart axes, where the gutter cannot grow with the number. */
export function formatMoneyCompact(settings: Settings, amount: number): string {
  const { currency, currencyBefore, hideAmounts } = settings;

  if (hideAmounts) return currencyBefore ? `${currency}•••` : `••• ${currency}`;

  const text = amount.toLocaleString(settings.language, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  if (currency === '') return text;

  return currencyBefore ? `${currency}${text}` : `${text} ${currency}`;
}

/** Hook shape: one subscription, both formatters, for components. */
export function useMoney() {
  const settings = useSettings((state) => state.settings);

  return {
    format: (amount: number | null | undefined) => formatMoney(settings, amount ?? 0),
    /**
     * An amount in the currency it is actually in. A place carries its own
     * code, and printing every place's earnings with the app's symbol made a
     * month in Kraków read as a tenfold overstatement of somebody's wages.
     * An empty or unset code means "the same as the app's".
     */
    formatIn: (code: string | null | undefined, amount: number | null | undefined) =>
      code != null && code.length === 3
        ? formatMoneyIn(settings, code, amount ?? 0)
        : formatMoney(settings, amount ?? 0),
    compact: (amount: number | null | undefined) => formatMoneyCompact(settings, amount ?? 0),
    hideAmounts: settings.hideAmounts,
  };
}
