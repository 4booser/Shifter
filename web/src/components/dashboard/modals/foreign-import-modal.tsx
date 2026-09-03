'use client';

import { useState } from 'react';

import { readSession } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { loadCatalogues, reload } from '@/lib/store/calendar';
import { Alert } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';

/**
 * A year of records carried in from whatever somebody used before.
 *
 * Nobody retypes a year. The alternative to importing is not a tidier
 * database — it is the person deciding this app starts empty and theirs does
 * not, and going back to theirs.
 *
 * Two steps, and the first writes nothing. The file goes up, the server
 * guesses which column is which, and the guess arrives here to be corrected.
 * A confident import that filed tips as wages would be indistinguishable from
 * a correct one a month later, which is why the guess is never trusted.
 */

interface Preview {
  header: string[];
  mapping: Record<string, number>;
  total: number;
  problems: string[];
  rows: { date: string; hours: string; earned: string; tips: string; place: string; note: string }[];
}

const FIELDS: { id: string; label: string }[] = [
  { id: 'date', label: 'Date' },
  { id: 'hours', label: 'Hours' },
  { id: 'earned', label: 'Earned' },
  { id: 'tips', label: 'Tips' },
  { id: 'place', label: 'Place' },
  { id: 'note', label: 'Note' },
];

export function ForeignImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, n, num } = useI18n();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [start, setStart] = useState('12:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ days: number; skipped: number; places: number } | null>(null);

  const send = async (path: string, body: FormData) => {
    const response = await fetch(`/shifter/v1/import/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${readSession()?.access_token ?? ''}` },
      body,
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { detail?: string } | null;

      throw new Error(detail?.detail ?? t('Could not read the file.'));
    }

    return response.json();
  };

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];

    if (chosen === undefined) return;

    setError(null);
    setDone(null);
    setFile(chosen);
    setBusy(true);

    try {
      const body = new FormData();

      body.append('file', chosen);

      const read = (await send('csv/preview', body)) as Preview;

      setPreview(read);
      setMapping(read.mapping);
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : t('Could not read the file.'));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (file === null) return;

    setBusy(true);
    setError(null);

    try {
      const body = new FormData();

      body.append('file', file);
      body.append('mapping', JSON.stringify(mapping));
      body.append('start', start);

      setDone((await send('csv', body)) as { days: number; skipped: number; places: number });

      // The import can create places, so the catalogues are reloaded too —
      // a calendar full of days pointing at templates the sidebar has never
      // heard of looks broken in a way nobody can act on.
      await loadCatalogues();
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Could not import the file.'));
    } finally {
      setBusy(false);
    }
  };

  const undated = preview?.problems.find((problem) => problem.startsWith('undated:'));

  return (
    <Modal open={open} onClose={onClose} title={t('Bring in another app’s records')}>
      <p className="field-hint mb-3">
        {t('A CSV from anywhere. Nothing is written until you have looked at the columns below.')}
      </p>

      <input
        type="file"
        accept=".csv,text/csv"
        className="field-input mb-3"
        aria-label={t('Choose a file')}
        onChange={pick}
      />

      {error !== null && <Alert kind="error">{error}</Alert>}

      {done !== null && (
        <Alert kind="good">
          {t('Written')}: {n(done.days, 'days')}
          {done.places > 0 && <>, {t('new places')}: {done.places}</>}
          {done.skipped > 0 && <>, {t('skipped')}: {done.skipped}</>}
        </Alert>
      )}

      {preview !== null && done === null && (
        <>
          <div className="mb-3 flex flex-col gap-2">
            {FIELDS.map((field) => (
              <label key={field.id} className="flex items-center gap-2">
                <span className="w-28 flex-none text-[0.82rem] text-muted">{t(field.label)}</span>
                <select
                  className="field-input flex-1"
                  value={mapping[field.id] ?? -1}
                  onChange={(event) =>
                    setMapping((current) => ({ ...current, [field.id]: Number(event.target.value) }))
                  }
                >
                  <option value={-1}>— {t('not in the file')} —</option>
                  {preview.header.map((name, index) => (
                    <option key={`${name}-${index}`} value={index}>
                      {name || `#${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* The file has hours but no clock. The app does not invent an
              evening out of a row that only says eight hours — the person
              picks the hour and owns that choice. */}
          <label className="mb-3 flex items-center gap-2">
            <span className="w-28 flex-none text-[0.82rem] text-muted">{t('Day starts at')}</span>
            <input
              type="time"
              className="field-input flex-1"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <p className="field-hint mb-3">
            {t('The file has no times in it, so this hour is yours, not the file’s. Only the length of the day comes from the import.')}
          </p>

          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-[0.78rem]">
              <thead>
                <tr className="text-faint">
                  {FIELDS.map((field) => (
                    <th key={field.id} className="px-1 pb-1 text-left font-semibold">
                      {t(field.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr key={index} className="border-t border-(--border)">
                    <td className="px-1 py-1 tabular">{row.date}</td>
                    <td className="px-1 py-1 tabular">{row.hours}</td>
                    <td className="px-1 py-1 tabular">{row.earned}</td>
                    <td className="px-1 py-1 tabular">{row.tips}</td>
                    <td className="px-1 py-1">{row.place}</td>
                    <td className="px-1 py-1">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="field-hint mb-3">
            {t('Rows in the file')}: {preview.total}
            {undated !== undefined && (
              <>
                {' · '}
                <span className="text-warn-read">
                  {t('without a readable date')}: {undated.split(':')[1]}
                </span>
              </>
            )}
            {' · '}
            {t('Days you already have are left as they are.')}
          </p>

          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={busy || (mapping.date ?? -1) < 0}
            onClick={apply}
          >
            {t('Import')}
          </button>
        </>
      )}
    </Modal>
  );
}
