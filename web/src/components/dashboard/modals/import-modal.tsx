'use client';

import { useMemo, useState } from 'react';

import { ImportPreview, ImportRow, readSpreadsheet } from '@/lib/export/import';
import { useI18n } from '@/lib/i18n';
import { importDays, useCalendar } from '@/lib/store/calendar';
import { Alert } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';

/**
 * Bringing a spreadsheet in. Nothing is written until the preview has been
 * looked at: an import that half-succeeds is worse than one that never ran.
 */
export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, n } = useI18n();
  const templates = useCalendar((state) => state.templates);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  /** Templates are matched by name, so an unknown name is worth flagging. */
  const rows = useMemo<ImportRow[]>(() => {
    if (preview === null) return [];

    const known = new Set(templates.map((template) => template.name.toLowerCase()));

    return preview.rows.map((row) =>
      row.problem === null && row.shift !== null && !known.has(row.shift.toLowerCase())
        ? { ...row, problem: 'No shift with that name.' }
        : row,
    );
  }, [preview, templates]);

  const usable = rows.filter((row) => row.problem === null);

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file === undefined) return;

    setError(null);
    setDone(null);
    setFileName(file.name);

    try {
      setPreview(await readSpreadsheet(file));
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : 'Could not read the file.');
    }
  };

  const apply = async () => {
    if (usable.length === 0) return;

    setBusy(true);

    const written = await importDays(
      usable.map((row) => ({
        date: row.date,
        shift: row.shift,
        tips: row.tips,
        tipsCash: row.tipsCash,
        deductions: row.deductions,
        note: row.note,
      })),
    );

    setBusy(false);
    setDone(written);
  };

  return (
    <Modal open={open} wide title={t('Import a spreadsheet')} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <p className="field-hint">{t('CSV or XLSX. One row per day; a column named date is the only one required.')}</p>

        <input type="file" accept=".csv,.xlsx,text/csv" className="field-input" onChange={(event) => void pick(event)} />
          aria-label={t('Choose a file')}

        {error && <Alert>{t(error)}</Alert>}
        {done !== null && (
          <Alert kind="good">
            {n(done, 'days')} {t('imported')}
          </Alert>
        )}

        {preview !== null && (
          <>
            <p className="flex gap-3 text-[0.85rem]">
              <span className="font-semibold text-good">
                {usable.length} {t('ready')}
              </span>
              {rows.length - usable.length > 0 && (
                <span className="font-semibold text-danger">
                  {rows.length - usable.length} {t('skipped')}
                </span>
              )}
              <span className="field-hint">{fileName}</span>
            </p>

            <div className="max-h-72 overflow-auto rounded-(--radius) border border-border">
              <table className="w-full text-[0.82rem]">
                <thead className="sticky top-0 bg-surface-2 text-left">
                  <tr>
                    {['Date', 'Shift', 'Tips', 'Note'].map((column) => (
                      <th key={column} className="px-2.5 py-1.5 font-semibold">
                        {t(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.line} className={row.problem !== null ? 'opacity-45' : ''} title={row.problem ?? ''}>
                      <td className="px-2.5 py-1 tabular">{row.date}</td>
                      <td className="px-2.5 py-1">{row.shift ?? '—'}</td>
                      <td className="px-2.5 py-1 tabular">{row.tips ?? '—'}</td>
                      <td className="px-2.5 py-1">{row.problem !== null ? t(row.problem) : (row.note ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t('Close')}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || usable.length === 0} onClick={() => void apply()}>
            {t(busy ? 'Importing…' : 'Import')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
