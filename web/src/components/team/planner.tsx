'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Assignment,
  AssignmentSave,
  PLAN_ROLES,
  PlanRole,
  PlannerBoard,
  plannerApi,
} from '@/lib/api/team';
import { apiErrorMessage } from '@/lib/api/http';
import { keysBetween, shiftDays, todayKey, weekBounds } from '@/lib/calendar/calendar-date';
import { stagger } from '@/lib/fx';
import { useI18n } from '@/lib/i18n';
import { pushToast } from '@/lib/toast';
import { Sheet, buildXlsx, downloadBlob } from '@/lib/export/xlsx';
import { useCalendar } from '@/lib/store/calendar';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

/**
 * People × days, one week at a time. A manager sketches assignments as
 * drafts nobody else sees, then publishes the week: every person gets one
 * push and the cells wait for their answers — green when accepted, red
 * when declined and needing replanning. Money never appears here.
 */
export function PlannerBoardView({ teamId }: { teamId: number }) {
  const { t, lang, n } = useI18n();
  const templates = useCalendar((state) => state.templates);

  const [anchor, setAnchor] = useState(todayKey());
  const range = useMemo(() => weekBounds(anchor), [anchor]);
  const days = useMemo(() => keysBetween(range.from, range.to), [range]);

  const [board, setBoard] = useState<PlannerBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** The cell being edited: who and which day, plus the form. */
  const [editing, setEditing] = useState<{
    userId: number;
    date: string;
    id: number | null;
    title: string;
    start: string;
    end: string;
    role: PlanRole;
  } | null>(null);

  const refresh = useCallback(() => {
    void plannerApi
      .board(teamId, range.from, range.to)
      .then(setBoard)
      .catch((caught) => setError(apiErrorMessage(caught)));
  }, [teamId, range]);

  useEffect(refresh, [refresh]);

  const byCell = useMemo(() => {
    const map = new Map<string, Assignment[]>();

    for (const entry of board?.assignments ?? []) {
      const key = `${entry.user_id}:${entry.date}`;
      const list = map.get(key) ?? [];

      list.push(entry);
      map.set(key, list);
    }

    return map;
  }, [board]);

  // The week's load per person, declined cells excluded: a refused shift is
  // not work, and the manager reads this column exactly to balance work.
  const load = useMemo(() => {
    const totals = new Map<number, number>();

    for (const entry of board?.assignments ?? []) {
      if (entry.status === 'declined') continue;

      const [sh, sm] = entry.start.split(':').map(Number);
      const [eh, em] = entry.end.split(':').map(Number);
      let hours = eh + em / 60 - (sh + sm / 60);

      if (hours < 0) hours += 24; // an overnight slot wraps past midnight

      totals.set(entry.user_id, (totals.get(entry.user_id) ?? 0) + hours);
    }

    return totals;
  }, [board]);

  // member:date → the reason they cannot work it, so a draft can be argued
  // with while it is still a draft.
  const blocked = useMemo(() => {
    const map = new Map<string, string | null>();

    for (const block of board?.blocked ?? []) map.set(`${block.user_id}:${block.date}`, block.reason);

    return map;
  }, [board]);

  const drafts = (board?.assignments ?? []).filter((entry) => entry.status === 'draft').length;
  const declined = (board?.assignments ?? []).filter((entry) => entry.status === 'declined').length;

  /** Assignments per day, for the coverage strip along the top. */
  const coverage = useMemo(() => {
    const map = new Map<string, number>();

    for (const entry of board?.assignments ?? []) {
      if (entry.status === 'declined') continue;

      map.set(entry.date, (map.get(entry.date) ?? 0) + 1);
    }

    return map;
  }, [board]);

  /**
   * The same days counted by station, straight from the server. "Two bars and
   * nobody in the kitchen" is the sentence a manager is reading the board for,
   * and a head count never says it.
   */
  const stations = useMemo(
    () => new Map((board?.coverage ?? []).map((day) => [day.date, day])),
    [board],
  );

  const save = async () => {
    if (editing === null) return;

    setBusy(true);

    const body: AssignmentSave = {
      user_id: editing.userId,
      date: editing.date,
      title: editing.title,
      start: editing.start,
      end: editing.end,
      note: null,
      role: editing.role,
    };

    try {
      if (editing.id === null) await plannerApi.create(teamId, body);
      else await plannerApi.update(teamId, editing.id, body);

      setEditing(null);
      refresh();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: Assignment) => {
    if (
      entry.status !== 'draft' &&
      !window.confirm(t('This one was already sent. Take it back?'))
    )
      return;

    setBusy(true);

    try {
      await plannerApi.remove(teamId, entry.id);
      setEditing(null);
      refresh();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const copyLastWeek = async () => {
    setBusy(true);

    try {
      const result = await plannerApi.copyWeek(teamId, range.from);

      pushToast({
        icon: '📋',
        title: t('Last week copied'),
        text:
          result.copied === 0
            ? t('Nothing new — every cell was already taken.')
            : n(result.copied, 'assignments'),
      });
      refresh();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  /**
   * The timesheet accounting asks for on the first of the month: people down
   * the side, days across, hours in the cells, totals on both edges. Built
   * from the board that is already on screen, so it can never disagree with
   * what the manager published.
   */
  const exportTimesheet = () => {
    if (board === null) return;

    const header = ['', ...days.map((day) => day.slice(8))];
    const rows: (string | number)[][] = [[...header, 'Итого']];

    for (const member of board.members) {
      const cells = days.map((day) => {
        const assignments = (byCell.get(`${member.user_id}:${day}`) ?? []).filter(
          (entry) => entry.status !== 'declined',
        );

        return assignments.reduce((total, entry) => {
          const [sh, sm] = entry.start.split(':').map(Number);
          const [eh, em] = entry.end.split(':').map(Number);
          let hours = eh + em / 60 - (sh + sm / 60);

          if (hours < 0) hours += 24;

          return total + hours;
        }, 0);
      });

      rows.push([
        member.display_name,
        ...cells.map((hours) => (hours === 0 ? '' : Math.round(hours * 10) / 10)),
        Math.round(cells.reduce((sum, hours) => sum + hours, 0) * 10) / 10,
      ]);
    }

    // The column of daily totals: how many hands the venue bought each day.
    rows.push([
      'Всего',
      ...days.map((_, index) =>
        Math.round(
          rows.slice(1).reduce((sum, row) => sum + (Number(row[index + 1]) || 0), 0) * 10,
        ) / 10,
      ),
      Math.round(rows.slice(1).reduce((sum, row) => sum + (Number(row.at(-1)) || 0), 0) * 10) / 10,
    ]);

    const sheet: Sheet = { name: 'Табель', rows };

    downloadBlob(`timesheet-${range.from}.xlsx`, buildXlsx([sheet]));
    pushToast({ icon: '📄', title: t('Timesheet saved'), text: `${range.from} — ${range.to}` });
  };

  const publish = async () => {
    setBusy(true);

    try {
      const result = await plannerApi.publish(teamId, range.from, range.to);

      pushToast({
        icon: '📣',
        title: t('Week published'),
        text: `${n(result.published, 'assignments')} · ${n(result.people, 'people')}`,
      });
      refresh();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (board === null) {
    return <div className="card shimmer h-48" />;
  }

  if (!board.can_plan) {
    return (
      <div className="card reveal p-4">
        <p className="field-hint">{t('Only the owner or a manager sees the board.')}</p>
      </div>
    );
  }

  const weekLabel = `${range.from.slice(8)}.${range.from.slice(5, 7)} — ${range.to.slice(8)}.${range.to.slice(5, 7)}`;

  const STATUS_LOOK: Record<Assignment['status'], string> = {
    draft: 'border-dashed border-border-strong text-muted',
    published: 'border-(--accent)/50 bg-(--accent-soft)',
    accepted: 'border-good/50 bg-(--good-soft) text-good',
    declined: 'border-danger/50 bg-(--danger-soft) text-danger line-through',
  };

  return (
    <div className="flex flex-col gap-3">
      {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {/* ==== Week toolbar ==== */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm px-2" aria-label={t('Previous')} onClick={() => setAnchor((a) => shiftDays(a, -7))}>
          <Icon name="chevron-left" size={15} />
        </button>
        <strong className="w-32 text-center text-[0.92rem] tabular">{weekLabel}</strong>
        <button type="button" className="btn btn-sm px-2" aria-label={t('Next')} onClick={() => setAnchor((a) => shiftDays(a, 7))}>
          <Icon name="chevron-right" size={15} />
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setAnchor(todayKey())}>
          {t('Today')}
        </button>

        <span className="ml-auto flex items-center gap-2">
          {declined > 0 && (
            <span className="chip border-danger/40 bg-(--danger-soft) text-danger">
              {declined} {t('declined — replan')}
            </span>
          )}
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void copyLastWeek()}>
            {t('Repeat last week')}
          </button>
          <button type="button" className="btn btn-sm" disabled={board === null} onClick={exportTimesheet}>
            📄 {t('Timesheet')}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || drafts === 0} onClick={() => void publish()}>
            <Icon name="check" size={13} />
            {t('Publish the week')}
            {drafts > 0 && ` · ${drafts}`}
          </button>
        </span>
      </div>

      {/* ==== The board ==== */}
      <div className="card overflow-x-auto p-2">
        <table className="w-full min-w-[46rem] border-collapse">
          <thead>
            <tr>
              <th className="w-32 p-1.5 text-left text-[0.72rem] font-semibold uppercase tracking-wide text-faint">
                {t('People')}
              </th>
              {days.map((day) => {
                const covered = coverage.get(day) ?? 0;
                const isToday = day === todayKey();

                return (
                  <th key={day} className="p-1.5 text-center">
                    <span className={`block text-[0.72rem] font-semibold uppercase ${isToday ? 'text-(--accent)' : 'text-faint'}`}>
                      {new Date(`${day}T00:00:00`).toLocaleDateString(lang, { weekday: 'short' })}
                    </span>
                    <span className={`text-[0.82rem] font-bold tabular ${isToday ? 'text-(--accent)' : ''}`}>{day.slice(8)}</span>
                    <span className={`block text-[0.64rem] tabular ${covered === 0 ? 'text-danger' : 'text-faint'}`}>
                      {covered === 0 ? t('empty') : `×${covered}`}
                    </span>

                    {/* Stations, in the order the enum declares them, so a
                        Friday and a Saturday read down the same columns. */}
                    {/* Shown when anything is planned at all: a day whose only
                        cell has no station is exactly the one worth fixing, and
                        hiding the count hides that. */}
                    {((stations.get(day)?.roles.length ?? 0) > 0 ||
                      (stations.get(day)?.unset ?? 0) > 0) && (
                      <span className="mt-0.5 flex flex-wrap justify-center gap-x-1 gap-y-0.5 text-[0.62rem] leading-none">
                        {stations.get(day)?.roles.map((role) => (
                          <span
                            key={role.role}
                            title={t(PLAN_ROLES.find((entry) => entry.value === role.role)?.label ?? role.role)}
                            className="tabular text-muted"
                          >
                            {PLAN_ROLES.find((entry) => entry.value === role.role)?.emoji}
                            {role.count}
                          </span>
                        ))}
                        {(stations.get(day)?.unset ?? 0) > 0 && (
                          <span className="tabular text-faint" title={t('No station set')}>
                            ·{stations.get(day)?.unset}
                          </span>
                        )}
                      </span>
                    )}
                  </th>
                );
              })}
              <th className="w-14 p-1.5 text-right text-[0.72rem] font-semibold uppercase tracking-wide text-faint">
                {t('Hours')}
              </th>
            </tr>
          </thead>
          <tbody>
            {board.members.map((member, rowIndex) => (
              <tr key={member.user_id} className="border-t border-border/60">
                <td className="p-1.5">
                  <span className="flex items-center gap-1.5 text-[0.85rem] font-medium">
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: member.colour }} />
                    <span className="min-w-0 truncate">{member.display_name}</span>
                    {member.is_owner && <span title={t('owner')}>👑</span>}
                    {!member.is_owner && (board.can_grant ? (
                      <button
                        type="button"
                        className={member.is_manager ? '' : 'opacity-25 grayscale hover:opacity-70'}
                        title={t(member.is_manager ? 'Take the board away' : 'Make a manager')}
                        onClick={() =>
                          void plannerApi
                            .setManager(teamId, member.user_id, !member.is_manager)
                            .then(refresh)
                            .catch((caught) => setError(apiErrorMessage(caught)))
                        }
                      >
                        📋
                      </button>
                    ) : (
                      member.is_manager && <span title={t('manager')}>📋</span>
                    ))}
                  </span>
                </td>
                {days.map((day) => {
                  const cell = byCell.get(`${member.user_id}:${day}`) ?? [];
                  const away = blocked.has(`${member.user_id}:${day}`);
                  const clash = away && cell.length > 0;

                  return (
                    <td
                      key={day}
                      title={away ? `${t('Cannot work')}${blocked.get(`${member.user_id}:${day}`) ? `: ${blocked.get(`${member.user_id}:${day}`)}` : ''}` : undefined}
                      className={`group h-14 min-w-24 p-1 align-top ${
                        clash
                          ? 'bg-(--danger-soft)'
                          : away
                            ? 'bg-surface-2/70 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,var(--border)_5px,var(--border)_6px)]'
                            : ''
                      }`}
                    >
                      <span className="flex flex-col gap-1">
                        {cell.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className={`pop rounded-(--radius) border px-1.5 py-0.5 text-left text-[0.7rem] leading-tight ${STATUS_LOOK[entry.status]}`}
                            style={stagger(rowIndex)}
                            title={`${entry.title} · ${entry.start}–${entry.end} · ${t(entry.status)}`}
                            onClick={() =>
                              entry.status === 'draft'
                                ? setEditing({ userId: entry.user_id, date: entry.date, id: entry.id, title: entry.title, start: entry.start, end: entry.end, role: entry.role })
                                : void remove(entry)
                            }
                          >
                            <span className="block truncate font-semibold">
                              {entry.role !== '' && (
                                <span aria-hidden className="mr-0.5">
                                  {PLAN_ROLES.find((role) => role.value === entry.role)?.emoji}
                                </span>
                              )}
                              {entry.title}
                            </span>
                            <span className="tabular">{entry.start}–{entry.end}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          className="hidden rounded-(--radius) border border-dashed border-border-strong px-1.5 py-0.5 text-[0.72rem] text-faint hover:border-(--accent) hover:text-(--accent) group-hover:block"
                          onClick={() =>
                            setEditing({
                              userId: member.user_id,
                              date: day,
                              id: null,
                              title: editing?.title ?? templates[0]?.name ?? '',
                              start: editing?.start ?? templates[0]?.start_time ?? '11:00',
                              end: editing?.end ?? templates[0]?.end_time ?? '22:00',
                              // The station carries over from the last cell:
                              // a manager filling a Friday is filling one row
                              // of the same station, not seven different ones.
                              role: editing?.role ?? '',
                            })
                          }
                        >
                          +
                        </button>
                      </span>
                    </td>
                  );
                })}
                <td className="p-1.5 text-right align-middle">
                  {(load.get(member.user_id) ?? 0) > 0 && (
                    <span className="text-[0.82rem] font-bold tabular">
                      {Number((load.get(member.user_id) ?? 0).toFixed(1))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="field-hint">
        {t('Drafts are yours alone until the week is published. A person accepts an assignment onto their own calendar, at their own rate.')}
      </p>

      {/* ==== Cell editor ==== */}
      {editing !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onClick={() => setEditing(null)}>
          <div className="card rise w-full max-w-xs p-4" onClick={(event) => event.stopPropagation()}>
            <h3 className="mb-2 text-[0.95rem] font-bold">
              {board.members.find((member) => member.user_id === editing.userId)?.display_name} ·{' '}
              {editing.date.slice(8)}.{editing.date.slice(5, 7)}
            </h3>

            {templates.filter((item) => !item.archived).length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {templates.filter((item) => !item.archived).slice(0, 4).map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() =>
                      setEditing({ ...editing, title: template.name, start: template.start_time, end: template.end_time })
                    }
                  >
                    {template.symbol ?? '•'} {template.name}
                  </button>
                ))}
              </div>
            )}

            <label className="mb-2 block">
              <span className="field-label">{t('Title')}</span>
              <input
                className="field-input"
                value={editing.title}
                maxLength={60}
                onChange={(event) => setEditing({ ...editing, title: event.target.value })}
              />
            </label>

            <div className="mb-2">
              <span className="field-label">{t('Station')}</span>
              <div className="flex flex-wrap gap-1">
                {PLAN_ROLES.map((role) => (
                  <button
                    key={role.value}
                    type="button"
                    className={`btn btn-sm ${editing.role === role.value ? 'btn-primary' : 'btn-quiet'}`}
                    onClick={() =>
                      setEditing({ ...editing, role: editing.role === role.value ? '' : role.value })
                    }
                  >
                    {role.emoji} {t(role.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3 flex items-center gap-1.5">
              <input
                type="time"
                className="field-input"
                value={editing.start}
                onChange={(event) => event.target.value && setEditing({ ...editing, start: event.target.value })}
              />
              <span className="text-faint">–</span>
              <input
                type="time"
                className="field-input"
                value={editing.end}
                onChange={(event) => event.target.value && setEditing({ ...editing, end: event.target.value })}
              />
            </div>

            <div className="flex gap-1.5">
              <button type="button" className="btn btn-primary flex-1" disabled={busy || editing.title.trim() === ''} onClick={() => void save()}>
                {t(editing.id === null ? 'Add to the draft' : 'Save')}
              </button>
              {editing.id !== null && (
                <button
                  type="button"
                  className="btn btn-quiet text-danger"
                  aria-label={t('Delete')}
                  onClick={() => {
                    const entry = (board.assignments ?? []).find((item) => item.id === editing.id);

                    if (entry !== undefined) void remove(entry);
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
