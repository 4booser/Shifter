'use client';

import { useMemo, useState } from 'react';

import { IcsOccurrence, readIcs } from '@/lib/import/ics';
import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import { applyToDates, reload, useCalendar } from '@/lib/store/calendar';
import { useI18n } from '@/lib/i18n';
import { Alert } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';

/**
 * Google Calendar → the rota, with a preview and choices.
 *
 * Every distinct summary becomes one row: this many days, this usual time —
 * and the person says what it is: a shift (pick the template), an event, or
 * skip. Nothing applies until they press the button, and what the reader
 * refused to parse is named out loud instead of quietly missing.
 */
type Fate = { kind: 'skip' } | { kind: 'shift'; templateId: number } | { kind: 'event' };

export function IcsImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, n } = useI18n();
  const templates = useCalendar((state) => state.templates);

  const [parsed, setParsed] = useState<ReturnType<typeof readIcs> | null>(null);
  const [fates, setFates] = useState<Record<string, Fate>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, IcsOccurrence[]>();

    for (const item of parsed?.occurrences ?? []) {
      map.set(item.summary, [...(map.get(item.summary) ?? []), item]);
    }

    return [...map.entries()];
  }, [parsed]);

  const pick = (file: File) => {
    setError(null);
    setDone(null);

    void file.text().then((text) => {
      const read = readIcs(text);

      setParsed(read);

      // A summary that matches a template's name by heart is probably that
      // shift; everything else starts as an event, and skipping is a click.
      const guesses: Record<string, Fate> = {};

      for (const [summary] of new Map(read.occurrences.map((o) => [o.summary, true]))) {
        const match = templates.find(
          (template) => template.name.toLocaleLowerCase() === summary.toLocaleLowerCase(),
        );

        guesses[summary] = match !== undefined
          ? { kind: 'shift', templateId: match.id }
          : { kind: 'event' };
      }

      setFates(guesses);
    });
  };

  const apply = async () => {
    if (parsed === null) return;

    setBusy(true);
    setError(null);

    try {
      let shifts = 0;
      let events = 0;

      for (const [summary, items] of groups) {
        const fate = fates[summary] ?? { kind: 'skip' };

        if (fate.kind === 'skip') continue;

        if (fate.kind === 'shift') {
          const template = templates.find((entry) => entry.id === fate.templateId);

          if (template === undefined) continue;

          await applyToDates(items.map((item) => item.date).sort(), template);
          shifts += items.length;

          continue;
        }

        for (const item of items) {
          await calendarApi.createEvent({
            name: summary,
            symbol: null,
            colour: '#64748b',
            start_date: item.date,
            end_date: item.date,
            start_time: item.start,
            end_time: item.end,
            note: null,
            kind: 'ordinary',
            cost: 0,
          });
          events += 1;
        }
      }

      reload();
      setDone(`${t('Placed')}: ${n(shifts, 'shifts')} · ${n(events, 'events-n')}`);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setParsed(null);
    setFates({});
    setDone(null);
    setError(null);
    onClose();
  };

  return (
    <Modal open={open} title={t('Import from a calendar (.ics)')} onClose={close}>
      <div className="flex flex-col gap-3">
        <p className="field-hint">
          {t('Export your Google/Apple calendar as .ics and drop it here. Nothing applies until you say so.')}
        </p>

        <input
          aria-label={t('Choose a file')}
          type="file"
          accept=".ics,text/calendar"
          className="field-input"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file !== undefined) pick(file);
          }}
        />

        {error && <Alert kind="error">{error}</Alert>}
        {done !== null && <Alert kind="good">{done}</Alert>}

        {parsed !== null && parsed.unparsed.length > 0 && (
          <Alert kind="info">
            {t('Could not read the repetition of:')} {parsed.unparsed.join(', ')}.{' '}
            {t('They are skipped honestly rather than guessed.')}
          </Alert>
        )}

        {groups.length > 0 && (
          <div className="flex flex-col gap-2">
            {groups.map(([summary, items]) => {
              const fate = fates[summary] ?? { kind: 'skip' };
              const usual = items.find((item) => item.start !== null);

              return (
                <div key={summary} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[0.9rem] font-semibold" title={summary}>{summary}</span>
                    <span className="flex-none text-[0.78rem] text-muted tabular">
                      {n(items.length, 'days')}
                      {usual?.start !== null && usual !== undefined && ` · ${usual.start}${usual.end !== null ? `–${usual.end}` : ''}`}
                    </span>
                  </div>
                  <select
                    aria-label={t('What to do with these days')}
                    className="field-input mt-1.5 !py-1.5 !text-[0.85rem]"
                    value={fate.kind === 'shift' ? `shift:${fate.templateId}` : fate.kind}
                    onChange={(event) => {
                      const value = event.target.value;

                      setFates({
                        ...fates,
                        [summary]: value.startsWith('shift:')
                          ? { kind: 'shift', templateId: Number(value.slice(6)) }
                          : value === 'event'
                            ? { kind: 'event' }
                            : { kind: 'skip' },
                      });
                    }}
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={`shift:${template.id}`}>
                        {t('Shift')}: {template.name}
                      </option>
                    ))}
                    <option value="event">{t('An event (not work)')}</option>
                    <option value="skip">{t('Skip')}</option>
                  </select>
                </div>
              );
            })}

            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy ? t('Placing…') : t('Place onto the calendar')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
