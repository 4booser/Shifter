import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { API_BASE, getSession } from '@/lib/api';

/**
 * The papers, handed over as files.
 *
 * Same rule as the bank statement: written to cache, overwritten on repeat,
 * because these files exist to be passed to another app — a bank clerk's
 * inbox, an accountant's spreadsheet — and then forgotten.
 */
async function pull(path: string, name: string, mime: string, uti: string, title: string):
  Promise<'shared' | 'unavailable' | 'failed'> {
  if (!(await isAvailableAsync())) return 'unavailable';

  const token = getSession()?.access_token ?? '';
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return 'failed';

  const bytes = new Uint8Array(await response.arrayBuffer());

  const file = new File(Paths.cache, name);

  file.create({ overwrite: true });
  file.write(bytes);

  await shareAsync(file.uri, { mimeType: mime, UTI: uti, dialogTitle: title });

  return 'shared';
}

export interface PaperRange {
  from: string;
  to: string;
}

/**
 * The stretches people are actually asked for. A bank wants «за полгода»,
 * an accountant wants a закрытый quarter or month — the default stays the
 * year to date, which is what a clerk means by «справку».
 */
export function paperRanges(): { label: string; range: PaperRange }[] {
  const today = new Date();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const to = iso(today);
  const year = to.slice(0, 4);

  const firstOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastMonthEnd = new Date(firstOfMonth.getTime() - 86400000);
  const lastMonthStart = new Date(Date.UTC(lastMonthEnd.getUTCFullYear(), lastMonthEnd.getUTCMonth(), 1));

  const quarter = Math.floor(today.getUTCMonth() / 3);
  const prevQuarterStart = new Date(Date.UTC(today.getUTCFullYear(), quarter * 3 - 3, 1));
  const prevQuarterEnd = new Date(Date.UTC(today.getUTCFullYear(), quarter * 3, 0));

  const threeBack = new Date(today.getTime() - 91 * 86400000);

  return [
    { label: 'С начала года', range: { from: `${year}-01-01`, to } },
    { label: 'Последние 3 месяца', range: { from: iso(threeBack), to } },
    { label: 'Прошлый месяц', range: { from: iso(lastMonthStart), to: iso(lastMonthEnd) } },
    { label: 'Прошлый квартал', range: { from: iso(prevQuarterStart), to: iso(prevQuarterEnd) } },
  ];
}

export function shareIncomePdf(lang: 'ru' | 'ua', range: PaperRange) {
  return pull(
    `/shifter/v1/papers/income.pdf?from=${range.from}&to=${range.to}&lang=${lang}`,
    `income-${range.from}-${range.to}.pdf`,
    'application/pdf',
    'com.adobe.pdf',
    'Справка о доходе',
  );
}

export function shareAccountantCsv(range: PaperRange) {
  return pull(
    `/shifter/v1/papers/accountant.csv?from=${range.from}&to=${range.to}`,
    `income-${range.from}-${range.to}.csv`,
    'text/csv',
    'public.comma-separated-values-text',
    'CSV бухгалтеру',
  );
}

export function shareTakeout() {
  return pull(
    '/shifter/v1/account/export',
    `shifter-export-${new Date().toISOString().slice(0, 10)}.zip`,
    'application/zip',
    'public.zip-archive',
    'Весь аккаунт',
  );
}
