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

/** Year-to-date: the stretch a clerk actually asks about. */
function thisYear(): { from: string; to: string } {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);

  return { from: `${iso.slice(0, 4)}-01-01`, to: iso };
}

export function shareIncomePdf(lang: 'ru' | 'ua') {
  const { from, to } = thisYear();

  return pull(
    `/shifter/v1/papers/income.pdf?from=${from}&to=${to}&lang=${lang}`,
    `income-${from}-${to}.pdf`,
    'application/pdf',
    'com.adobe.pdf',
    'Справка о доходе',
  );
}

export function shareAccountantCsv() {
  const { from, to } = thisYear();

  return pull(
    `/shifter/v1/papers/accountant.csv?from=${from}&to=${to}`,
    `income-${from}-${to}.csv`,
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
