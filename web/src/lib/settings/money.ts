'use client';

import { useSettings } from './store';
import { Settings } from './settings';

/** Formats an amount with the chosen currency label. */
export function formatMoney(settings: Settings, amount: number): string {
  const { currency, currencyBefore, hideAmounts } = settings;

  // The mask keeps the currency mark so a hidden value still reads as money.
  if (hideAmounts) return currencyBefore ? `${currency}•••` : `••• ${currency}`;

  const text = amount.toLocaleString(settings.language, {
    minimumFractionDigits: 0,
    maximumFractionDigits: settings.moneyDecimals,
    useGrouping: settings.groupThousands,
  });

  if (currency === '') return text;

  return currencyBefore ? `${currency}${text}` : `${text} ${currency}`;
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
    compact: (amount: number | null | undefined) => formatMoneyCompact(settings, amount ?? 0),
    hideAmounts: settings.hideAmounts,
  };
}
