import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { statementFileName } from '@/lib/mono-export';

/**
 * Handing the file over.
 *
 * The cache directory rather than documents: this file exists to be passed to
 * another app and then forgotten, and a statement lingering in the app's own
 * storage is a copy of somebody's spending that nobody asked for.
 */
export async function shareStatement(
  csv: string,
  from: string,
  to: string,
): Promise<'shared' | 'unavailable'> {
  if (!(await isAvailableAsync())) return 'unavailable';

  const file = new File(Paths.cache, statementFileName(from, to));

  // Overwritten rather than appended: exporting the same window twice must
  // produce the same file, not the file twice.
  file.create({ overwrite: true });
  file.write(csv);

  await shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Выписка',
  });

  return 'shared';
}
