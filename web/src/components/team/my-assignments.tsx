'use client';

import { useCallback, useEffect, useState } from 'react';

import { Assignment, plannerApi } from '@/lib/api/team';
import { apiErrorMessage } from '@/lib/api/http';
import { fireConfetti } from '@/lib/fx';
import { useI18n } from '@/lib/i18n';
import { pushToast } from '@/lib/toast';
import { loadCatalogues, reload, useCalendar } from '@/lib/store/calendar';
import { Icon } from '@/components/ui/icon';

/**
 * The person's half of the board: what the manager proposed, waiting for a
 * yes. Accepting picks one of their own shift templates — the assignment
 * plans the time, the template prices it — and lands on their calendar at
 * the assignment's hours.
 */
export function MyAssignments({ teamId, onAnswered }: { teamId: number; onAnswered?: () => void }) {
  const { t, lang } = useI18n();
  const templates = useCalendar((state) => state.templates);
  const active = templates.filter((item) => !item.archived);

  const [rows, setRows] = useState<Assignment[]>([]);
  const [choice, setChoice] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void plannerApi
      .mine(teamId)
      .then(setRows)
      .catch(() => setRows([]));
  }, [teamId]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (active.length === 0) void loadCatalogues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rows.length === 0) return null;

  /** The template whose clock matches the slot, else the first one. */
  const matchFor = (row: Assignment): number | undefined =>
    (active.find((item) => item.start_time === row.start && item.end_time === row.end) ?? active[0])?.id;

  const answer = async (row: Assignment, accept: boolean) => {
    setBusy(row.id);
    setError(null);

    try {
      if (accept) {
        const templateId = choice[row.id] ?? matchFor(row);

        if (templateId === undefined) {
          setError(t('Create a shift first — the assignment needs your rate.'));

          return;
        }

        await plannerApi.accept(teamId, row.id, templateId);
        fireConfetti({ y: 0.3, count: 80 });
        pushToast({ icon: '✅', title: t('On your calendar'), text: `${row.title} · ${row.date.slice(8)}.${row.date.slice(5, 7)}` });
        reload();
      } else {
        await plannerApi.decline(teamId, row.id);
      }

      refresh();
      onAnswered?.();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card reveal border-(--accent)/40 p-4">
      <h2 className="mb-1 flex items-center gap-2 text-[0.98rem] font-bold">
        📋 {t('Shifts proposed to you')}
        <span className="chip chip-accent">{rows.length}</span>
      </h2>
      <p className="field-hint mb-3">{t('Accepting places the shift on your calendar with your own rate.')}</p>

      {error !== null && <p className="mb-2 text-[0.85rem] text-danger">{error}</p>}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-(--radius) border border-border p-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9rem] font-semibold">
                {row.title}
                <span className="ml-2 font-normal text-muted tabular">
                  {new Date(`${row.date}T00:00:00`).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' })} · {row.start}–{row.end}
                </span>
              </span>
            </span>

            {active.length > 1 && (
              <select
                className="field-input !w-36 !py-1 !text-[0.82rem]"
                value={choice[row.id] ?? matchFor(row)}
                onChange={(event) => setChoice((current) => ({ ...current, [row.id]: Number(event.target.value) }))}
              >
                {active.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            )}

            <button type="button" className="btn btn-primary btn-sm" disabled={busy === row.id} onClick={() => void answer(row, true)}>
              <Icon name="check" size={13} />
              {t('Accept')}
            </button>
            <button type="button" className="btn btn-quiet btn-sm !text-danger" disabled={busy === row.id} onClick={() => void answer(row, false)}>
              {t('Decline')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
