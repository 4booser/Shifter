'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  addMonths,
  currentMonth,
  keysBetween,
  monthBounds,
  shiftDays,
  todayKey,
  weekBounds,
} from '@/lib/calendar/calendar-date';
import { readableInk } from '@/lib/calendar/contrast';
import { apiErrorMessage } from '@/lib/api/http';
import {
  AcceptedCover,
  MEMBER_COLOURS,
  Rota,
  RotaEntry,
  Team,
  Visibility,
  teamApi,
} from '@/lib/api/team';
import { MyAssignments } from '@/components/team/my-assignments';
import { PlannerBoardView } from '@/components/team/planner';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/fx';
import { Shell } from '@/components/layout/shell';
import { SwapsPanel } from '@/components/team/swaps';
import { AvailabilityStrip } from '@/components/team/availability';
import { HandoverPanel } from '@/components/team/handover';
import { PoolPanel } from '@/components/team/pool';
import { LeavePanel } from '@/components/team/leave';
import { drawRotaCard } from '@/lib/export/rota-card';
import { tightTurnarounds } from '@/lib/calendar/on-shift';
import { OnShiftNow } from '@/components/dashboard/on-shift-now';
import { currentCardTheme } from '@/lib/export/share-card';
import { downloadBlob } from '@/lib/export/xlsx';
import { Alert, Money, Segmented } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

type Span = 'week' | 'month';

export default function SchedulePage() {
  return (
    <Shell>
      <Schedule />
    </Shell>
  );
}

/**
 * The shared rota. What anyone is paid reaches this page only for people who
 * deliberately switched sharing on; the server does not read the column for
 * anybody else, and nothing here can flip somebody else's switch.
 */
function Schedule() {
  const revealHost = useReveal<HTMLDivElement>();
  const { t, lang, n } = useI18n();

  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [rota, setRota] = useState<Rota | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [span, setSpan] = useState<Span>('month');
  const [anchor, setAnchor] = useState(todayKey());
  const [colourBy, setColourBy] = useState<'person' | 'shift'>('person');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const [handedOver, setHandedOver] = useState<AcceptedCover | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [mode, setMode] = useState<'rota' | 'planner'>('rota');

  const range = useMemo(
    () =>
      span === 'week'
        ? weekBounds(anchor)
        : monthBounds(`${month.year}-${`${month.month}`.padStart(2, '0')}-01`),
    [span, anchor, month],
  );

  useEffect(() => {
    void teamApi
      .list()
      .then((list) => {
        setTeams(list);

        if (list.length > 0) setSelected((current) => current ?? list[0].id);
      })
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => {
    if (selected === null) return;

    void teamApi
      .rota(selected, range.from, range.to)
      .then(setRota)
      .catch((caught) => setError(apiErrorMessage(caught)));
  }, [selected, range]);

  useEffect(refresh, [refresh]);

  const days = keysBetween(range.from, range.to);
  const you = rota?.members.find((member) => member.is_you) ?? null;

  // member:date → the gig-board outing chip; the rota is exactly where a
  // colleague's busy Saturday matters.
  const outings = useMemo(() => {
    const map = new Map<string, { employment: string; start: string; end: string }>();

    for (const outing of rota?.gig_outings ?? []) map.set(`${outing.member_id}:${outing.date}`, outing);

    return map;
  }, [rota]);

  /** Rows are people, columns are days — built once, not per cell. */
  const grid = useMemo(() => {
    if (rota === null) return [];

    const byMember = new Map<number, Map<string, RotaEntry[]>>();

    for (const entry of rota.entries) {
      const member = byMember.get(entry.member_id) ?? new Map<string, RotaEntry[]>();

      member.set(entry.date, [...(member.get(entry.date) ?? []), entry]);
      byMember.set(entry.member_id, member);
    }

    return rota.members.map((member) => ({
      member,
      cells: days.map((key) => {
        const entries = byMember.get(member.member_id)?.get(key) ?? [];

        return { key, entries, hours: entries.reduce((total, entry) => total + entry.hours, 0) };
      }),
    }));
  }, [rota, days]);

  const coverRequests = useMemo(() => {
    if (rota === null) return [];

    const names = new Map(rota.members.map((member) => [member.member_id, member.display_name]));

    return rota.entries
      .filter((entry) => entry.needs_cover)
      .map((entry) => ({ ...entry, who: names.get(entry.member_id) ?? '' }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rota]);

  const uncovered = (rota?.days ?? []).filter((day) => day.on_shift === 0 && day.date >= todayKey());

  const names = useMemo(
    () => new Map((rota?.members ?? []).map((member) => [member.member_id, member.display_name])),
    [rota],
  );

  const tight = useMemo(
    () => tightTurnarounds((rota?.entries ?? []).filter((entry) => entry.date >= todayKey())),
    [rota],
  );

  const focusEntries = useMemo(() => {
    if (focusDay === null || rota === null) return [];

    const names = new Map(rota.members.map((member) => [member.member_id, member.display_name]));

    return rota.entries
      .filter((entry) => entry.date === focusDay)
      .map((entry) => ({ ...entry, who: names.get(entry.member_id) ?? '' }))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [focusDay, rota]);

  const sharers = useMemo(() => {
    const members = (rota?.members ?? []).filter(
      (member) => member.earned !== null && (member.shares_earnings || member.is_you),
    );

    return [...members].sort((a, b) => (b.earned ?? 0) - (a.earned ?? 0));
  }, [rota]);

  const run = async (call: Promise<unknown>) => {
    setBusy(true);
    setError(null);

    try {
      await call;
      refresh();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const markColour = (entry: RotaEntry) =>
    colourBy === 'person' ? entry.member_colour : (entry.colour ?? entry.member_colour);

  const rangeLabel =
    span === 'month'
      ? new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(new Date(month.year, month.month - 1, 1))
      : `${range.from.slice(8)}–${range.to.slice(8)} ${new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(`${range.from}T00:00:00`))}`;

  const shareWeek = () => {
    if (rota === null) return;

    // Always one week: a month of columns is unreadable in a chat. In month
    // view the exported week is the one holding today.
    const bounds = span === 'week' ? range : weekBounds(todayKey());
    const weekDays = keysBetween(bounds.from, bounds.to);
    const byMember = new Map<number, Map<string, RotaEntry[]>>();

    for (const entry of rota.entries) {
      if (entry.date < bounds.from || entry.date > bounds.to) continue;

      const perDay = byMember.get(entry.member_id) ?? new Map<string, RotaEntry[]>();
      const list = perDay.get(entry.date) ?? [];

      list.push(entry);
      perDay.set(entry.date, list);
      byMember.set(entry.member_id, perDay);
    }

    const short = (time: string) => time.slice(0, 5);
    const shifts = rota.entries.filter((entry) => entry.date >= bounds.from && entry.date <= bounds.to).length;

    void drawRotaCard(
      {
        teamName: rota.team_name,
        period: `${bounds.from.slice(8)}.${bounds.from.slice(5, 7)} — ${bounds.to.slice(8)}.${bounds.to.slice(5, 7)}`,
        dayLabels: weekDays.map((key) =>
          `${new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(`${key}T00:00:00`))} ${key.slice(8)}`,
        ),
        rows: rota.members.map((member) => ({
          name: member.display_name,
          colour: member.colour,
          cells: weekDays.map((key) =>
            (byMember.get(member.member_id)?.get(key) ?? []).map(
              (entry) => `${entry.shift_name} ${short(entry.start_time)}–${short(entry.end_time)}`,
            ),
          ),
        })),
        totalLabel: n(shifts, 'shifts'),
      },
      currentCardTheme(),
    )
      .then((blob) => downloadBlob(`rota-${bounds.from}.png`, blob))
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const step = (delta: number) => {
    if (span === 'week') setAnchor((key) => shiftDays(key, delta * 7));
    else setMonth((current) => addMonths(current, delta));
  };

  if (!loading && teams.length === 0) {
    return (
      <div ref={revealHost} className="mx-auto max-w-md">
        <div className="card reveal p-6 text-center">
          <Icon name="users" size={32} className="mx-auto mb-2 text-muted" />
          <h1 className="mb-1 text-[1.1rem] font-bold">{t('No team yet')}</h1>
          <p className="field-hint mb-3">{t('Share a rota with your crew: who is on and when, without anyone’s money.')}</p>
          <a href="/team" className="btn btn-primary w-full">
            {t('Join or start a team')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div ref={revealHost} className="flex flex-col gap-4">
      {/* ==== Toolbar ==== */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[1.3rem] font-bold capitalize tracking-tight">
          {mode === 'planner' ? t('Planning') : rangeLabel}
        </h1>

        <div className="seg">
          {(
            [
              { value: 'rota' as const, label: 'Rota' },
              { value: 'planner' as const, label: 'Planning' },
            ]
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              className={`seg-btn ${mode === option.value ? 'is-active' : ''}`}
              onClick={() => setMode(option.value)}
            >
              {t(option.label)}
            </button>
          ))}
        </div>

        {teams.length > 1 && (
          <select
          aria-label={t('Team')}
            className="field-input w-auto"
            value={selected ?? ''}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Segmented
            value={colourBy}
            options={[
              { value: 'person', label: t('By person') },
              { value: 'shift', label: t('By shift') },
            ]}
            onChange={setColourBy}
          />
          <Segmented
            value={span}
            options={[
              { value: 'week', label: t('Week') },
              { value: 'month', label: t('Month') },
            ]}
            onChange={setSpan}
          />
          {mode === 'rota' && (
            <button type="button" className="btn btn-sm" disabled={rota === null} title={t('Week as a picture, for the group chat')} onClick={shareWeek}>
              <Icon name="download" size={14} />
              {t('Picture')}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => { setAnchor(todayKey()); setMonth(currentMonth()); }}>
            {t('Today')}
          </button>
          <button type="button" className="btn btn-sm px-2" aria-label={t('Previous')} onClick={() => step(-1)}>
            <Icon name="chevron-left" size={16} />
          </button>
          <button type="button" className="btn btn-sm px-2" aria-label={t('Next')} onClick={() => step(1)}>
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      </div>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {/* ==== The manager's board replaces the rota entirely ==== */}
      {mode === 'planner' && selected !== null && <PlannerBoardView teamId={selected} />}

      {/*
        Two shifts on one person with too little between them, while it is
        still a plan — the only moment it can be moved without a conversation.

        "Looks like" and never "breaks". The app does not know anybody's
        contract, their country's exemptions, or what they agreed to; it knows
        two times and the distance between them.
      */}
      {mode === 'rota' && tight.length > 0 && (
        <Alert kind="info">
          <span className="flex flex-col gap-0.5">
            <strong>{t('Looks like a short turnaround')}</strong>
            {tight.slice(0, 4).map((row) => (
              <span key={`${row.before.day_shift_id}-${row.after.day_shift_id}`} className="field-hint">
                {names.get(row.memberId) ?? '—'}: {row.before.date.slice(8)}.
                {row.before.date.slice(5, 7)} {t('to')} {row.before.end_time} →{' '}
                {row.after.date.slice(8)}.{row.after.date.slice(5, 7)} {t('from')}{' '}
                {row.after.start_time} · {row.gap} {t('h')}
              </span>
            ))}
          </span>
        </Alert>
      )}

      {/* ==== Who is on the floor right now ==== */}
      {mode === 'rota' && <OnShiftNow rota={rota} />}

      {/* ==== Assignments waiting for the caller's answer ==== */}
      {mode === 'rota' && selected !== null && <MyAssignments teamId={selected} onAnswered={refresh} />}

      {/* ==== A handover just happened ==== */}
      {handedOver !== null && (
        <Alert kind="good" onDismiss={() => setHandedOver(null)}>
          {t('Handed over')}: {handedOver.shift_name} · {handedOver.date} {handedOver.start_time}–{handedOver.end_time} →{' '}
          {handedOver.taken_by}. {t('They add it to their own calendar with their own rate.')}
        </Alert>
      )}

      {mode === 'rota' && (
      <>
      {/* ==== The days this person cannot work ==== */}
      {selected !== null && (
        <AvailabilityStrip teamId={selected} from={range.from} to={range.to} onChanged={refresh} />
      )}

      {/* ==== The pool: one number instead of five ==== */}
      {selected !== null && <PoolPanel teamId={selected} />}

      {/* ==== The handover: read before the shift, written after it ==== */}
      {selected !== null && <HandoverPanel teamId={selected} />}

      {/* ==== Time off: a stretch of days that needs an answer ==== */}
      {selected !== null && <LeavePanel teamId={selected} onChanged={refresh} />}

      {/* ==== Swaps: pending trades and the button that starts one ==== */}
      {selected !== null && rota !== null && rota.members.length > 1 && (
        <SwapsPanel teamId={selected} rota={rota} onChanged={refresh} />
      )}

      {/* ==== Cover requests ==== */}
      {coverRequests.length > 0 && (
        <section className="card reveal border-warn/40 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[0.98rem] font-bold text-warn">
            <Icon name="swap" size={15} />
            {t('Looking for cover')}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {coverRequests.map((entry) => {
              const yourOffer = entry.offers.find((offer) => offer.is_you && !offer.accepted) ?? null;

              return (
                <li key={entry.day_shift_id} className="flex flex-wrap items-center gap-2 text-[0.88rem]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.member_colour }} />
                  <strong>{entry.who}</strong> · {entry.date} · {entry.shift_name} {entry.start_time}–{entry.end_time}

                  {entry.is_mine ? (
                    <span className="ml-auto flex flex-wrap items-center gap-1.5">
                      {entry.offers.filter((offer) => !offer.accepted).map((offer) => (
                        <span key={offer.offer_id} className="chip">
                          {offer.display_name}
                          <button
                            type="button"
                            className="ml-1 font-semibold text-good"
                            disabled={busy}
                            onClick={() =>
                              void run(teamApi.acceptCover(selected!, offer.offer_id).then(setHandedOver))
                            }
                          >
                            {t('Accept')}
                          </button>
                        </span>
                      ))}
                      {entry.offers.filter((offer) => !offer.accepted).length === 0 && (
                        <span className="field-hint">{t('No offers yet')}</span>
                      )}
                    </span>
                  ) : yourOffer !== null ? (
                    <button
                      type="button"
                      className="btn btn-sm ml-auto"
                      disabled={busy}
                      onClick={() => void run(teamApi.withdrawCover(selected!, yourOffer.offer_id))}
                    >
                      {t('Withdraw offer')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm ml-auto"
                      disabled={busy}
                      onClick={() => void run(teamApi.offerCover(selected!, entry.day_shift_id))}
                    >
                      {t('I can take it')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ==== Gaps ==== */}
      {uncovered.length > 0 && (
        <p className="field-hint">
          {t('Days nobody is on')}: {uncovered.map((day) => day.date.slice(8)).join(', ')}
        </p>
      )}

      {/* ==== The grid ==== */}
      <section className="card reveal overflow-x-auto p-3">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left text-[0.78rem] font-semibold text-muted">
                {rota?.team_name}
              </th>
              {days.map((key) => {
                const weekendDay = [0, 6].includes(new Date(`${key}T00:00:00`).getDay());

                return (
                  <th
                    key={key}
                    className={`min-w-7 px-0.5 py-1 text-center text-[0.68rem] font-medium ${
                      key === todayKey() ? 'text-(--accent)' : weekendDay ? 'text-warn' : 'text-faint'
                    }`}
                  >
                    <button type="button" onClick={() => setFocusDay((current) => (current === key ? null : key))}>
                      {key.slice(8)}
                    </button>
                  </th>
                );
              })}
              <th className="px-2 py-1 text-right text-[0.72rem] font-semibold text-muted">{t('Hours')}</th>
            </tr>
          </thead>
          <tbody>
            {grid.map(({ member, cells }) => (
              <tr key={member.member_id} className="border-t border-border">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2 py-1.5 text-[0.82rem]">
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: member.colour }} />
                  {member.display_name}
                  {member.is_you && <span className="field-hint"> · {t('you')}</span>}
                </td>
                {cells.map((cell) => (
                  <td key={cell.key} className={`px-0.5 py-1 text-center ${cell.key === todayKey() ? 'bg-(--accent-soft)' : ''}`}>
                    <div className="flex flex-col items-center gap-0.5">
                      {outings.has(`${member.member_id}:${cell.key}`) && (
                        <span
                          className="text-[0.7rem]"
                          title={`${outings.get(`${member.member_id}:${cell.key}`)!.employment === 'permanent' ? t('Starts a permanent job') : t('Out on a gig')} · ${outings.get(`${member.member_id}:${cell.key}`)!.start}–${outings.get(`${member.member_id}:${cell.key}`)!.end}`}
                        >
                          {outings.get(`${member.member_id}:${cell.key}`)!.employment === 'permanent' ? '🏢' : '✨'}
                        </span>
                      )}
                      {cell.entries.map((entry) => (
                        <span
                          key={entry.day_shift_id}
                          title={`${entry.shift_name} ${entry.start_time}–${entry.end_time}${entry.needs_cover ? ` · ${t('cover wanted')}` : ''}`}
                          className={`grid h-4.5 w-4.5 place-items-center rounded text-[0.6rem] font-bold leading-none ${
                            entry.needs_cover ? 'animate-pulse' : ''
                          } ${entry.worked ? '' : 'opacity-55'}`}
                          style={{ background: markColour(entry), color: readableInk(markColour(entry)) }}
                        >
                          {entry.symbol ?? entry.shift_name.charAt(0)}
                        </span>
                      ))}
                    </div>
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right text-[0.82rem] tabular">{Math.round(member.hours * 10) / 10}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ==== One day, opened ==== */}
      {focusDay !== null && focusEntries.length > 0 && (
        <section className="card reveal p-4">
          <h2 className="mb-2 text-[0.98rem] font-bold tabular">{focusDay}</h2>
          <ul className="flex flex-col gap-1.5">
            {focusEntries.map((entry) => (
              <li key={entry.day_shift_id} className="flex flex-wrap items-center gap-2 text-[0.88rem]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.member_colour }} />
                <strong>{entry.who}</strong> · {entry.shift_name} · {entry.start_time}–{entry.end_time} · {entry.hours}h
                {entry.pay !== null && (
                  <span className="chip">
                    <Money value={entry.pay} />
                  </span>
                )}
                {entry.is_mine && entry.visibility !== null && (
                  <span className="ml-auto flex items-center gap-1">
                    {(['default', 'shown', 'hidden'] as Visibility[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`btn btn-sm ${entry.visibility === option ? 'btn-primary' : 'btn-quiet'}`}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            teamApi.setVisibility(entry.day_shift_id, option === 'default' ? null : option === 'shown'),
                          )
                        }
                      >
                        {t(option === 'default' ? 'Default' : option === 'shown' ? 'Shown' : 'Hidden')}
                      </button>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ==== You on this rota + who shares ==== */}
      <div className="grid gap-3 lg:grid-cols-2">
        {you !== null && (
          <section className="card reveal p-4">
            <h2 className="mb-2 text-[0.98rem] font-bold">{t('You, on this rota')}</h2>

            <div className="mb-3 flex gap-2">
              <input
                className="field-input"
                defaultValue={you.display_name}
                maxLength={40}
                onChange={(event) => setNameDraft(event.target.value)}
                aria-label={t('Display name')}
              />
              <button
                type="button"
                className="btn"
                disabled={busy || nameDraft.trim() === '' || nameDraft === you.display_name}
                onClick={() => void run(teamApi.updateMembership(selected!, { display_name: nameDraft.trim() }))}
              >
                {t('Rename')}
              </button>
            </div>

            <span className="field-label">{t('Your colour')}</span>
            <div className="mb-3 flex gap-1.5">
              {MEMBER_COLOURS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  className={`swatch ${you.colour.toUpperCase() === colour.toUpperCase() ? 'is-active' : ''}`}
                  style={{ background: colour }}
                  disabled={busy}
                  onClick={() => void run(teamApi.updateMembership(selected!, { colour }))}
                />
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-[0.88rem]">
                <input
                  type="checkbox"
                  checked={you.shares_earnings}
                  disabled={busy}
                  onChange={(event) => void run(teamApi.updateMembership(selected!, { share_earnings: event.target.checked }))}
                />
                {t('Share my earnings with this crew')}
              </label>
              <label className="flex items-center gap-2 text-[0.88rem]">
                <input
                  type="checkbox"
                  checked={you.private_by_default === true}
                  disabled={busy}
                  onChange={(event) =>
                    void run(teamApi.updateMembership(selected!, { private_by_default: event.target.checked }))
                  }
                />
                {t('Hide my shifts unless I show them')}
              </label>
              {(you.hidden ?? 0) > 0 && (
                <p className="field-hint">
                  {you.hidden} {t('of your shifts are hidden from the crew')}
                </p>
              )}
            </div>
          </section>
        )}

        {/*
          What this week costs, before it is published rather than after.
          The decision about a shift is made in advance, and after publishing
          it is awkward to unmake.

          Counted only from the people who share their rate, and signed as
          exactly that. Estimating a payroll from guessed rates is precisely
          the confident lie about money this project does not tell anywhere
          else, and a manager quoting a made-up number at a meeting is worse
          than a manager with no number.
        */}
        {sharers.length > 0 && (
          <section className="card reveal p-4">
            <h2 className="mb-1 text-[0.98rem] font-bold">{t('What this week costs')}</h2>
            <p className="text-[1.5rem] font-extrabold tracking-tight">
              <Money value={sharers.reduce((sum, member) => sum + (member.earned ?? 0), 0)} />
            </p>
            <p className="field-hint mb-3">
              {t('Only the')} {sharers.length} {t('of')} {rota?.members.length}{' '}
              {t('who share their rate. The rest are not estimated.')}
              {sharers.reduce((sum, member) => sum + member.hours, 0) > 0 && (
                <>
                  {' · '}
                  <Money
                    value={
                      sharers.reduce((sum, member) => sum + (member.earned ?? 0), 0)
                      / sharers.reduce((sum, member) => sum + member.hours, 0)
                    }
                  />
                  /{t('h')}
                </>
              )}
            </p>

            <h3 className="mb-1 text-[0.9rem] font-bold">{t('Who shares their earnings')}</h3>
            <p className="field-hint mb-2">
              {(rota?.members ?? []).filter((member) => member.shares_earnings).length} / {rota?.members.length}{' '}
              {t('of the crew share')}
            </p>
            <ul className="flex flex-col gap-1.5">
              {sharers.map((member) => (
                <li key={member.member_id} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-[0.85rem]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="h-2 w-2 flex-none rounded-full" style={{ background: member.colour }} />
                    <span className="truncate">{member.display_name}</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-(--accent)"
                      style={{
                        width: `${((member.earned ?? 0) / Math.max(1, ...sharers.map((sharer) => sharer.earned ?? 0))) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="tabular">
                    <Money value={member.earned ?? 0} />
                    {member.hours > 0 && member.earned !== null && (
                      <span className="field-hint"> · <Money value={member.earned / member.hours} />/h</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      </>
      )}
    </div>
  );
}
