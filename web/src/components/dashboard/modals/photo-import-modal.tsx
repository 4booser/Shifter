'use client';

import { useMemo, useRef, useState } from 'react';

import { readSession } from '@/lib/api/http';
import { useCalendar, placeShifts } from '@/lib/store/calendar';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/lib/settings/store';
import { fireConfetti } from '@/lib/fx';
import { pushToast } from '@/lib/toast';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';

interface ParsedRow {
  date: string;
  name: string;
  start: string;
  end: string;
}

interface Draft extends ParsedRow {
  /** Chosen template, matched by times first; null means "skip this one". */
  templateId: number | null;
  conflict: boolean;
}

/**
 * The rota photographed on the wall becomes a month on the calendar:
 * photo in, model reads it, a person checks the preview, one button
 * writes the lot — and one Cmd+Z takes it back.
 */
export function PhotoImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, n } = useI18n();
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const templates = useCalendar((state) => state.templates);
  const days = useCalendar((state) => state.days);
  const month = useCalendar((state) => state.month);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const active = useMemo(() => templates.filter((item) => !item.archived), [templates]);

  const pick = (chosen: File) => {
    setFile(chosen);
    setDrafts(null);
    setError(null);
    setPreview(URL.createObjectURL(chosen));
  };

  const matchTemplate = (row: ParsedRow): number | null =>
    active.find((item) => item.start_time === row.start && item.end_time === row.end)?.id ??
    active.find((item) => item.name.toLowerCase() === row.name.toLowerCase())?.id ??
    null;

  const recognise = async () => {
    if (file === null || settings.scheduleName.trim() === '') return;

    setBusy(true);
    setError(null);

    try {
      const body = new FormData();

      body.append('photo', file);
      body.append('employee', settings.scheduleName.trim());
      body.append('year', `${month.year}`);
      body.append('month', `${month.month}`);

      const response = await fetch('/shifter/v1/import/schedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${readSession()?.access_token ?? ''}` },
        body,
      });

      if (response.status === 404) {
        setError(t('Photo import is not switched on for this server.'));

        return;
      }

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { detail?: string; title?: string } | null;

        setError(detail?.detail ?? detail?.title ?? t('Could not read the photo.'));

        return;
      }

      const data = (await response.json()) as { days: ParsedRow[] };

      setDrafts(
        data.days.map((row) => ({
          ...row,
          templateId: matchTemplate(row),
          conflict: (days.get(row.date)?.shifts.length ?? 0) > 0,
        })),
      );
    } catch {
      setError(t('Could not read the photo.'));
    } finally {
      setBusy(false);
    }
  };

  const chosen = (drafts ?? []).filter((row) => row.templateId !== null && !row.conflict);

  const apply = async () => {
    await placeShifts(chosen.map((row) => ({ date: row.date, templateId: row.templateId as number })));
    fireConfetti({ y: 0.4 });
    pushToast({ icon: '📸', title: t('Schedule imported'), text: n(chosen.length, 'days') });
    onClose();
    setDrafts(null);
    setFile(null);
    setPreview(null);
  };

  return (
    <Modal open={open} title={t('Import from a photo')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label>
          {/*
            Where the photograph goes.
            
            This app tells somebody that a bank statement never reaches its
            server and that a medical book belongs in a pocket. A photograph
            of a rota leaves the device, goes out to a service that reads it,
            and carries every colleague's name on it — and the dialog said
            nothing at all. Saying it is not a warning, it is the same
            sentence the rest of the app already writes.
          */}
          <p className="field-hint">
            {t('The photo leaves your device: an outside service reads it and sends back the rows. Shifter keeps no copy — only the days you tick below. A rota usually carries other people’s names.')}
          </p>

          <span className="field-label">{t('How you are written in the rota')}</span>
          <input
            className="field-input"
            placeholder={t('e.g. Ivanov, or АБ')}
            value={settings.scheduleName}
            onChange={(event) => update('scheduleName', event.target.value)}
          />
        </label>

        <input
          aria-label={t('Choose a photo')}
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(event) => event.target.files?.[0] && pick(event.target.files[0])}
        />

        <button
          type="button"
          className="grid min-h-32 place-items-center rounded-(--radius) border-2 border-dashed border-border-strong p-3 text-muted hover:border-(--accent)"
          onClick={() => input.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();

            const dropped = event.dataTransfer.files[0];

            if (dropped !== undefined) pick(dropped);
          }}
        >
          {preview === null ? (
            <span className="flex flex-col items-center gap-1.5 text-[0.88rem]">
              <Icon name="download" size={20} className="rotate-180" />
              {t('Drop the rota photo here, or tap to choose')}
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-56 rounded-(--radius) object-contain" />
          )}
        </button>

        {error !== null && <p className="text-[0.85rem] text-danger-read">{error}</p>}

        {drafts === null ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={file === null || busy || settings.scheduleName.trim() === ''}
            onClick={() => void recognise()}
          >
            {busy ? t('Reading…') : t('Read the photo')}
          </button>
        ) : drafts.length === 0 ? (
          <p className="field-hint">{t('Nothing found for that name — check the spelling above.')}</p>
        ) : (
          <>
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {drafts.map((row, index) => (
                <li
                  key={row.date}
                  className={`flex items-center gap-2 rounded-(--radius) border px-2 py-1.5 text-[0.85rem] ${
                    row.conflict ? 'border-warn/40 bg-(--warn-soft)' : row.templateId === null ? 'border-danger/40' : 'border-border'
                  }`}
                >
                  <span className="w-14 flex-none font-semibold tabular">
                    {row.date.slice(8)}.{row.date.slice(5, 7)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {row.name} · {row.start}–{row.end}
                  </span>
                  {row.conflict ? (
                    <span className="text-[0.72rem] font-semibold text-warn-read">{t('day is taken')}</span>
                  ) : (
                    <select
                      aria-label={t('Which shift')}
                      className="field-input !w-32 !px-1.5 !py-0.5 !text-[0.8rem]"
                      value={row.templateId ?? ''}
                      onChange={(event) =>
                        setDrafts((current) =>
                          (current ?? []).map((item, at) =>
                            at === index
                              ? { ...item, templateId: event.target.value === '' ? null : Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">{t('skip')}</option>
                      {active.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-primary" disabled={chosen.length === 0} onClick={() => void apply()}>
              {t('Apply')} · {n(chosen.length, 'days')}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
