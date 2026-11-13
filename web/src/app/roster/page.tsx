'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import {
  Roster,
  RosterMonth,
  RosterPerson,
  RosterPersonSave,
  RosterPosition,
  RosterPositionSave,
  rosterApi,
} from '@/lib/api/roster';
import {
  WEEKDAY_LABELS,
  addMonths,
  currentMonth,
  formatDayLabelShort,
  monthLabel,
  todayKey,
} from '@/lib/calendar/calendar-date';
import type { WeekHours } from '@/lib/calendar/models';
import { drawRosterCard, rosterCardData } from '@/lib/export/roster-card';
import { currentCardTheme } from '@/lib/export/share-card';
import { downloadBlob } from '@/lib/export/xlsx';
import { useReveal } from '@/lib/fx';
import { useEscape } from '@/lib/a11y';
import { useI18n } from '@/lib/i18n';
import { useArmed } from '@/lib/live/arm';
import { Brush, Tool, USUAL, brushesOf, toolInUse } from '@/lib/roster/brushes';
import {
  RosterEdit,
  aboutPerson,
  applyEdit,
  editKey,
  fillNotice,
  fillScope,
  fillUndo,
  overlay,
  press,
  swap,
  undoOf,
  usualFor,
} from '@/lib/roster/edits';
import { cellKey, cellsOf, fillFrom, monthKey, rosterDays } from '@/lib/roster/month';
import { markNewsSeen, newsSeen } from '@/lib/roster/news';
import { namesOf, nextColour } from '@/lib/roster/people';
import { byPosition, hasUsualTime, positionGroups, venueLine } from '@/lib/roster/rules';
import { behindSaves } from '@/lib/roster/saves';
import { createUndo } from '@/lib/roster/undo';
import { useRosterSaves } from '@/lib/roster/use-saves';
import { useTitle } from '@/lib/use-title';
import { useWide } from '@/lib/use-wide';
import { BrushForm, CellForm, NewRosterForm, PersonForm } from '@/components/roster/editors';
import { FillMenu, TOOLBAR_BUTTON, TOOLBAR_ICON } from '@/components/roster/fill-menu';
import { PeopleStrip } from '@/components/roster/people-strip';
import { RosterDays } from '@/components/roster/roster-days';
import { RosterTable, ToolRow } from '@/components/roster/roster-table';
import { SaveLine } from '@/components/roster/save-line';
import type { SettingsTab } from '@/components/roster/settings-dialog';
import { ShareBody } from '@/components/roster/share-dialog';
import { Shell } from '@/components/layout/shell';
import { Alert } from '@/components/ui/bits';
import { Empty } from '@/components/ui/empty';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { SkeletonRows } from '@/components/ui/skeleton';

/** Opened on demand, so it is fetched on demand: the page stays inside its weight budget. */
const RosterSettings = dynamic(() => import('@/components/roster/settings-dialog'), {
  ssr: false,
  loading: () => <SkeletonRows rows={2} height="3rem" />,
});

export default function RosterPage() {
  return (
    <Shell>
      <RosterDesk />
    </Shell>
  );
}

/** What is open over the page: one thing at a time, so one dialog holds them all. */
type Dialog =
  | { kind: 'cell'; personId: number; date: string }
  | { kind: 'person'; person: RosterPerson | null }
  | { kind: 'brush' }
  | { kind: 'share' }
  | { kind: 'roster' }
  | { kind: 'settings'; tab: SettingsTab; forFill?: boolean };

/** The roster's title, kept on the page as typed: an emptied box is a word in progress, and leaving it puts the old title back. */
function TitleField({ value, onChange }: { value: string; onChange: (title: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);

  return (
    <input
      className="field-input min-w-40 flex-1 !text-[1.05rem] font-bold"
      aria-label={t('Title')}
      maxLength={60}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);

        if (event.target.value.trim() !== '') onChange(event.target.value.trim());
      }}
      onBlur={() => {
        if (draft.trim() === '') setDraft(value);
      }}
    />
  );
}

/** One owner writing one month for people who will never open this page. */
function RosterDesk() {
  const revealHost = useReveal<HTMLDivElement>();
  const { t, lang, n } = useI18n();
  const wide = useWide();

  useTitle('Schedule for a team');

  const [rosters, setRosters] = useState<Roster[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [sheet, setSheet] = useState<RosterMonth | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Undefined until the owner picks a tool, and kept across months and rosters once they do.
  const [picked, setPicked] = useState<Tool | null | undefined>(undefined);
  const [made, setMade] = useState<Brush[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [undoing, setUndoing] = useState<RosterEdit[] | null>(null);
  const [undo] = useState(() => createUndo(setUndoing));
  const [newsGone, setNewsGone] = useState(false);

  const key = monthKey(month);
  const venueHours = sheet?.venue_hours;
  const days = useMemo(() => rosterDays(month, todayKey(), venueHours ?? []), [month, venueHours]);
  const ready = sheet !== null && sheet.id === selected && sheet.month === key;

  const reads = useRef(0);

  // Always the latest read. A step that waits on the server must not call the
  // load it closed over: the owner may have moved month by then, and that older
  // read would take the place of the one the screen is waiting for.
  const reload = useRef<() => Promise<RosterMonth | null>>(async () => null);

  // The cells the owner changes while a fill is out, which its undo must leave alone.
  const touchedInFill = useRef<Set<string> | null>(null);

  const { state, failure, queueFor, flush } = useRosterSaves(
    ({ error: refusal, went, kept, positionGone }) => {
      // Nothing the screen says about that batch is true any more, so the
      // server's word replaces it along with its reason for refusing.
      const known = [...(sheet?.people ?? []), ...(rosters ?? []).flatMap((roster) => roster.people)];
      const names = namesOf(went, known);

      setError(
        went.length === 0
          ? positionGone
            ? t('Position does not exist.')
            : apiErrorMessage(refusal)
          : `${t('No longer on this schedule')}${names === '' ? '' : `: ${names}`}. ${t(kept > 0 ? 'Edits for them were dropped, the rest were kept.' : 'Edits for them were dropped.')}`,
      );
      void reload.current();
    },
    (rosterId) => {
      // Where the server put their shifts, which the screen only guessed at.
      if (rosterId === selected) void reload.current();
    },
  );

  const loadList = useCallback(() => {
    setError(null);

    void rosterApi
      .list()
      .then((list) => {
        setRosters(list);
        setSelected((current) => current ?? list[0]?.id ?? null);
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  }, []);

  useEffect(loadList, [loadList]);

  /** Reads the month, with what has not landed laid over it, and says what it put on the screen. */
  const load = useCallback(async (): Promise<RosterMonth | null> => {
    if (selected === null) return null;

    reads.current += 1;

    const ticket = reads.current;
    const queue = queueFor(selected);

    try {
      let read: RosterMonth;
      let edited: number;

      // Round again when a change arrives behind the read: it can land first,
      // and then it is neither in the answer nor pending to be laid over it.
      do {
        await queue.settled();
        edited = queue.revision();
        read = await rosterApi.month(selected, key);
      } while (queue.revision() !== edited);

      const shown = overlay(read, queue.pending());

      if (ticket === reads.current) setSheet(shown);

      return shown;
    } catch (caught) {
      if (ticket === reads.current) setError(apiErrorMessage(caught));

      return null;
    }
  }, [selected, key, queueFor]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    reload.current = load;
  }, [load]);

  const usualReady = ready && hasUsualTime(sheet.people, sheet.positions, sheet.venue_hours);
  const tool = toolInUse(picked, usualReady);

  useEscape(tool !== null && dialog === null, () => setPicked(null));

  const shifts = ready ? sheet.shifts : null;
  const cells = useMemo(() => cellsOf(shifts ?? []), [shifts]);
  const people = ready ? sheet.people : null;
  const positions = ready ? sheet.positions : null;
  const groups = useMemo(() => positionGroups(people ?? [], positions ?? []), [people, positions]);

  const brushes = useMemo(
    () => brushesOf(shifts ?? [], tool?.kind === 'hours' ? [...made, tool.brush] : made),
    [shifts, made, tool],
  );

  /** Shows a change at once and leaves the sending to the queue. */
  const edit = (change: RosterEdit) => {
    if (selected === null) return;

    setSheet((current) => (current === null ? current : applyEdit(current, change)));

    if (change.kind === 'title') {
      setRosters((list) =>
        list === null ? list : list.map((one) => (one.id === selected ? { ...one, title: change.title } : one)),
      );
    }

    // An undo that would put this cell back would now wipe this edit out too.
    undo.touch(change);
    touchedInFill.current?.add(editKey(change));
    queueFor(selected).put(editKey(change), change);
  };

  /** Edits made in one tap, with the way back offered for a few seconds: offered after them, or they would count as a later change to their own cells. */
  const undoable = (changes: RosterEdit[]) => {
    const back = undoOf(changes, cells);

    changes.forEach(edit);
    undo.offer(back);
  };

  /** A save that changes the roster itself, laid on the month on screen and on its entry in the list alike. */
  const patchRoster = (change: <R extends Roster>(roster: R) => R) => {
    setSheet((current) => (current === null || current.id !== selected ? current : change(current)));
    setRosters((list) => (list === null ? list : list.map((one) => (one.id === selected ? change(one) : one))));
  };

  /** One request the page waits on, its failure said where the page can see it. */
  const run = async (call: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await call();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  /** What the last month or roster had to say is not about the next one, and neither is its undo. */
  const moveOn = () => {
    setError(null);
    setNotice(null);
    undo.drop();
  };

  const step = (delta: number) => {
    moveOn();
    setMonth((current) => addMonths(current, delta));
  };

  const personById = (personId: number) => sheet?.people.find((person) => person.id === personId);

  const usualOf = (personId: number, date: string): Brush | null => {
    const person = personById(personId);

    return sheet === null || person === undefined ? null : usualFor(person, sheet, date);
  };

  const openCell = (personId: number, date: string) => setDialog({ kind: 'cell', personId, date });

  const pressCell = (personId: number, date: string) => {
    if (tool === null) return openCell(personId, date);

    const result = press(tool, cells.get(cellKey(personId, date)), personId, date, usualOf(personId, date));

    if (result === 'open') openCell(personId, date);
    else undoable([result]);
  };

  /** The phone's free name: on at their usual time, or with no set time when nothing gives one. */
  const putUsual = (personId: number, date: string) => {
    const result = press(USUAL, undefined, personId, date, usualOf(personId, date));

    if (result !== 'open') undoable([result]);
  };

  const swapCell = (fromId: number, toId: number, date: string) =>
    undoable(swap(cells.get(cellKey(fromId, date)), fromId, toId, date, usualOf(fromId, date), usualOf(toId, date)));

  const setCell = (personId: number, date: string, hours: Brush | null) =>
    edit({
      kind: 'set',
      shift: { person_id: personId, date, start_time: hours?.start ?? null, end_time: hours?.end ?? null },
    });

  const createRoster = (title: string) =>
    run(async () => {
      const roster = await rosterApi.create(title);

      moveOn();
      setRosters((list) => [...(list ?? []), roster]);
      setSelected(roster.id);
      setDialog(null);
    });

  const deleteRoster = useArmed(() => {
    void run(async () => {
      if (selected === null) return;

      const queue = queueFor(selected);

      queue.drop(() => true);
      await queue.settled();
      await rosterApi.remove(selected);

      const left = (rosters ?? []).filter((one) => one.id !== selected);

      undo.drop();
      setRosters(left);
      setSelected(left[0]?.id ?? null);
      setSheet(null);
    });
  });

  const addPerson = async (save: RosterPersonSave): Promise<boolean> => {
    let added = false;

    await run(async () => {
      if (selected === null) return;

      const person = await rosterApi.addPerson(selected, save);

      setSheet((current) => (current === null ? current : { ...current, people: [...current.people, person] }));
      added = true;
    });

    return added;
  };

  const removePerson = (personId: number) => {
    setDialog(null);

    void run(async () => {
      if (selected === null) return;

      const queue = queueFor(selected);

      undo.drop();
      setSheet((current) =>
        current === null
          ? current
          : {
              ...current,
              people: current.people.filter((person) => person.id !== personId),
              shifts: current.shifts.filter((shift) => shift.person_id !== personId),
            },
      );

      // Left in the queue, one cell of theirs would fail the batch it rides in.
      queue.drop(aboutPerson(personId));

      try {
        await queue.settled();
        await rosterApi.removePerson(selected, personId);
      } catch (caught) {
        void reload.current();

        throw caught;
      }
    });
  };

  const repeat = () =>
    run(async () => {
      if (selected === null) return;

      // The save line already says so if a batch failed. Filling the month now
      // could put a shift into a cell one of those edits was clearing.
      const repeated = await behindSaves(queueFor(selected), () => rosterApi.repeat(selected, key));

      if (repeated === null) return;

      await reload.current();

      setNotice(
        repeated.added + repeated.kept === 0
          ? t('Last month is empty, so there is nothing to repeat.')
          : `${t('Added')}: ${n(repeated.added, 'shifts')}. ${t('Already there')}: ${n(repeated.kept, 'shifts')}.`,
      );
    });

  const fill = () =>
    run(async () => {
      if (selected === null || !ready) return;

      const scope = fillScope(sheet.people);

      // Nothing would come of it: the press is better spent marking the days.
      if (scope === 'ask') {
        setDialog({ kind: 'settings', tab: 'days', forFill: true });

        return;
      }

      const start = { id: selected, month: key, was: cells };
      const touched = new Set<string>();

      touchedInFill.current = touched;

      try {
        const filled = await behindSaves(queueFor(selected), () => rosterApi.fill(selected, key));

        if (filled === null) return;

        // The latest read, which is of whatever is on screen by now.
        const after = await reload.current();
        const back = after === null ? null : fillUndo(start, after, touched);

        // The read failed and says so itself, or the owner went to another month
        // or roster while the fill was out: its undo and its notice would be
        // about one no longer on the screen.
        if (back === null) return;

        undo.offer(back);
        setNotice(fillNotice(filled, `${key}-01`, scope.leftOut, t, lang));
      } finally {
        if (touchedInFill.current === touched) touchedInFill.current = null;
      }
    });

  const clearMonth = () =>
    run(async () => {
      if (selected === null) return;

      const cleared = await behindSaves(queueFor(selected), () => rosterApi.clear(selected, key));

      if (cleared === null) return;

      undo.drop();
      await reload.current();
      setNotice(`${t('Shifts cleared')}: ${cleared.cleared}.`);
    });

  /** After a save that moved shifts already placed: the server has them, so the screen reads them back and says how many. */
  const restamped = async (count: number) => {
    if (count === 0) return;

    await reload.current();
    setNotice(`${t('Time updated in shifts already placed')}: ${count}.`);
  };

  const saveVenueHours = async (venue: WeekHours[]): Promise<boolean> => {
    let saved = false;

    await run(async () => {
      if (selected === null) return;

      const answer = await rosterApi.saveVenueHours(selected, venue);

      patchRoster((roster) => ({ ...roster, venue_hours: answer.venue_hours }));
      saved = true;
      await restamped(answer.restamped);
    });

    return saved;
  };

  const addPosition = async (save: RosterPositionSave): Promise<RosterPosition | null> => {
    let added: RosterPosition | null = null;

    await run(async () => {
      if (selected === null) return;

      const position = await rosterApi.addPosition(selected, save);

      patchRoster((roster) => ({ ...roster, positions: [...roster.positions, position] }));
      added = position;
    });

    return added;
  };

  const savePosition = async (positionId: number, save: RosterPositionSave): Promise<boolean> => {
    let saved = false;

    await run(async () => {
      if (selected === null) return;

      const answer = await rosterApi.updatePosition(selected, positionId, save);
      const position: RosterPosition = { id: answer.id, name: answer.name, hours: answer.hours };

      patchRoster((roster) => ({
        ...roster,
        positions: roster.positions.map((one) => (one.id === positionId ? position : one)),
        people: roster.people.map((person) =>
          person.position_id === positionId ? { ...person, position: position.name } : person,
        ),
      }));
      saved = true;
      await restamped(answer.restamped);
    });

    return saved;
  };

  /** Whether it went: the form stays open when it did not, with the reason above it. */
  const removePosition = async (positionId: number): Promise<boolean> => {
    let removed = false;

    await run(async () => {
      if (selected === null) return;

      // A queued edit may be moving somebody onto it; it lands first, or the delete waits.
      const answer = await behindSaves(queueFor(selected), () => rosterApi.removePosition(selected, positionId));

      // The save line says why, but it is behind the dialog, where the press would seem to do nothing.
      if (answer === null) {
        setError(t('Changes made before this have not saved, so the position stays. Try again.'));

        return;
      }

      patchRoster((roster) => ({
        ...roster,
        positions: roster.positions.filter((one) => one.id !== positionId),
        people: roster.people.map((person) =>
          person.position_id === positionId ? { ...person, position_id: null, position: null } : person,
        ),
      }));
      removed = true;
      await restamped(answer.restamped);
    });

    return removed;
  };

  const setSlug = (slug: string | null) =>
    setSheet((current) => (current === null ? current : { ...current, share_slug: slug }));

  const share = () =>
    run(async () => {
      if (selected !== null) setSlug((await rosterApi.share(selected)).share_slug);
    });

  const unshare = () =>
    run(async () => {
      if (selected === null) return;

      await rosterApi.unshare(selected);
      setSlug(null);
    });

  const download = () => {
    if (!ready) return;

    const data = rosterCardData(sheet, days, {
      period: label,
      summary: `${n(sheet.people.length, 'people')} · ${n(sheet.shifts.length, 'shifts')}`,
      weekdays: WEEKDAY_LABELS.map((day) => t(day)),
      venue: venueLine(sheet.venue_hours, lang),
    });

    void drawRosterCard(data, currentCardTheme())
      .then((blob) => downloadBlob(`grafik-${sheet.month}.png`, blob))
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const openSettings = (tab: SettingsTab) => setDialog({ kind: 'settings', tab });

  const seeNews = (then?: () => void) => {
    markNewsSeen();
    setNewsGone(true);
    then?.();
  };

  const label = monthLabel(month, lang);
  const failedToOpen = error !== null && (rosters === null || (selected !== null && !ready));
  const from = fillFrom(month);
  const venue = ready ? venueLine(sheet.venue_hours, lang) : null;

  const dialogPerson =
    dialog?.kind === 'cell' ? (sheet?.people.find((person) => person.id === dialog.personId) ?? null) : null;

  const dialogTitle =
    dialog === null
      ? ''
      : dialog.kind === 'cell'
        ? `${dialogPerson?.name ?? ''} · ${formatDayLabelShort(dialog.date, lang)}`
        : dialog.kind === 'person'
          ? (dialog.person?.name ?? t('Add a person'))
          : dialog.kind === 'brush'
            ? t('Other hours')
            : dialog.kind === 'share'
              ? t('Share this schedule')
              : dialog.kind === 'settings'
                ? t('Schedule settings')
                : t('New schedule');

  const dialogs = (
    <Modal
      open={dialog !== null}
      title={dialogTitle}
      onClose={() => {
        // Said inside the dialog, so it has been read and goes with it.
        setDialog(null);
        setError(null);
      }}
    >
      {error !== null && dialog !== null && (
        <div className="mb-3">
          <Alert onDismiss={() => setError(null)}>{error}</Alert>
        </div>
      )}

      {dialog?.kind === 'cell' && dialogPerson !== null && sheet !== null && (
        <CellForm
          key={`${dialog.personId}:${dialog.date}`}
          shift={cells.get(cellKey(dialog.personId, dialog.date)) ?? null}
          usual={usualOf(dialog.personId, dialog.date)}
          brushes={brushes}
          free={byPosition(sheet.people, sheet.positions).filter(
            (person) => !cells.has(cellKey(person.id, dialog.date)),
          )}
          focused={wide}
          onSet={(hours) => setCell(dialog.personId, dialog.date, hours)}
          onClear={() => edit({ kind: 'clear', person_id: dialog.personId, date: dialog.date })}
          onSwap={(personId) => swapCell(dialog.personId, personId, dialog.date)}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'person' && (
        <PersonForm
          key={dialog.person?.id ?? 'new'}
          person={dialog.person}
          suggested={nextColour(sheet?.people ?? [])}
          positions={sheet?.positions ?? []}
          venueHours={sheet?.venue_hours ?? []}
          month={month}
          busy={busy}
          onAdd={addPerson}
          onEdit={(id, save) => edit({ kind: 'person', id, save })}
          onRemove={removePerson}
          onAddPosition={(name) => addPosition({ name, hours: { mode: 'none', start_time: null, end_time: null, week_hours: [] } })}
        />
      )}

      {dialog?.kind === 'brush' && (
        <BrushForm
          onMade={(hours) => {
            setMade((list) => [...list, hours]);
            setPicked({ kind: 'hours', brush: hours });
            setDialog(null);
          }}
        />
      )}

      {dialog?.kind === 'share' && (
        <ShareBody
          slug={sheet?.share_slug ?? null}
          busy={busy}
          onShare={() => void share()}
          onUnshare={() => void unshare()}
          onPicture={download}
          pictured={ready && sheet.shifts.length > 0}
        />
      )}

      {dialog?.kind === 'settings' && ready && (
        <RosterSettings
          tab={dialog.tab}
          onTab={(tab) => setDialog({ kind: 'settings', tab, forFill: dialog.forFill })}
          forFill={dialog.forFill === true}
          sheet={sheet}
          busy={busy}
          onSaveVenue={saveVenueHours}
          onAddPosition={addPosition}
          onSavePosition={savePosition}
          onRemovePosition={removePosition}
          onEditPerson={(id, save) => edit({ kind: 'person', id, save })}
        />
      )}

      {dialog?.kind === 'roster' && <NewRosterForm busy={busy} onCreate={(title) => void createRoster(title)} />}
    </Modal>
  );

  if (rosters !== null && rosters.length === 0) {
    return (
      <div ref={revealHost} className="mx-auto max-w-md">
        <Empty
          icon="users"
          title={t('No schedule yet')}
          action={{ label: t('Make a schedule'), onClick: () => setDialog({ kind: 'roster' }) }}
        >
          {t('Name it, add the people, fill in their shifts and share one link with the group chat. They never have to register.')}
        </Empty>
        {dialogs}
      </div>
    );
  }

  const anyDays = ready && sheet.people.some((person) => person.pattern.kind !== 'none');

  return (
    <div ref={revealHost} className="flex flex-col gap-3">
      {/* ==== Which roster ==== */}
      <div className="flex flex-wrap items-center gap-2">
        {sheet !== null && sheet.id === selected ? (
          <TitleField key={sheet.id} value={sheet.title} onChange={(title) => edit({ kind: 'title', title })} />
        ) : (
          <span className="h-10 min-w-40 flex-1" />
        )}

        {rosters !== null && rosters.length > 1 && (
          <select
            aria-label={t('Which schedule')}
            className="field-input !w-auto max-w-48"
            value={selected ?? ''}
            onChange={(event) => {
              moveOn();
              setSelected(Number(event.target.value));
            }}
          >
            {rosters.map((roster) => (
              <option key={roster.id} value={roster.id}>
                {roster.title}
              </option>
            ))}
          </select>
        )}

        <button type="button" className="btn btn-sm" onClick={() => setDialog({ kind: 'roster' })}>
          <Icon name="plus" size={14} />
          {t('New schedule')}
        </button>
      </div>

      {/* ==== Which month, and what to do with it ==== */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button type="button" className="btn btn-sm !px-2" aria-label={t('Previous')} onClick={() => step(-1)}>
              <Icon name="chevron-left" size={16} />
            </button>
            <h1 className="min-w-36 text-center text-[1.05rem] font-bold tracking-tight">{label}</h1>
            <button type="button" className="btn btn-sm !px-2" aria-label={t('Next')} onClick={() => step(1)}>
              <Icon name="chevron-right" size={16} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1 sm:ml-auto sm:gap-1.5">
            <FillMenu
              over={from === null}
              from={from}
              busy={!ready || busy}
              onFill={() => void fill()}
              onRepeat={() => void repeat()}
              onClear={() => void clearMonth()}
            />
            <button type="button" className={TOOLBAR_BUTTON} disabled={!ready || busy} onClick={() => setDialog({ kind: 'share' })}>
              <Icon name={(sheet?.share_slug ?? null) === null ? 'share' : 'link'} size={14} className={TOOLBAR_ICON} />
              {t('Share')}
            </button>
            <button type="button" className={TOOLBAR_BUTTON} disabled={!ready || busy} onClick={() => openSettings('hours')}>
              <Icon name="sliders" size={14} className={TOOLBAR_ICON} />
              {t('Settings')}
            </button>
          </div>
        </div>

        {venue !== null && (
          <button
            type="button"
            className="field-hint flex items-start gap-1.5 self-start rounded text-left hover:text-(--text)"
            onClick={() => openSettings('hours')}
          >
            <Icon name="clock" size={13} className="mt-px flex-none" />
            <span className="sr-only">{t('Opening hours')}: </span>
            {venue}
          </button>
        )}
      </div>

      {error !== null && dialog === null && (
        <Alert onDismiss={failedToOpen ? undefined : () => setError(null)}>
          <span className="flex flex-wrap items-center gap-2">
            {error}
            {failedToOpen && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setError(null);

                  if (rosters === null) loadList();
                  else void load();
                }}
              >
                {t('Try again')}
              </button>
            )}
          </span>
        </Alert>
      )}

      {notice !== null && (
        <Alert kind="good" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {!ready && !failedToOpen && <SkeletonRows rows={3} height="5rem" />}

      {ready && sheet.people.length === 0 && (
        <Empty
          icon="users"
          title={t('Who works here?')}
          action={{ label: t('Add a person'), onClick: () => setDialog({ kind: 'person', person: null }) }}
          after={
            <p className="field-hint mt-2 flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
              {t('Opening hours and positions are in Settings, now or later.')}
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => openSettings('hours')}>
                <Icon name="clock" size={13} />
                {t('Opening hours')}
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => openSettings('positions')}>
                <Icon name="users" size={13} />
                {t('Positions')}
              </button>
            </p>
          }
        >
          {t('Add the people who work here: a name, a position and the days they work. Nobody gets an invitation.')}
        </Empty>
      )}

      {ready && sheet.people.length > 0 && (
        <>
          {!newsGone && !newsSeen() && (
            <Alert kind="info" onDismiss={() => seeNews()}>
              <span className="flex flex-wrap items-center gap-2">
                {t('Now there are positions, opening hours and “Fill the month”.')}
                <button type="button" className="btn btn-sm" onClick={() => seeNews(() => openSettings('days'))}>
                  {t('Set up')}
                </button>
              </span>
            </Alert>
          )}

          <SaveLine
            state={state}
            failure={failure}
            onRetry={flush}
            undo={undoing === null ? undefined : () => undo.take().forEach(edit)}
          />

          {/* ==== Who ==== */}
          <PeopleStrip
            people={sheet.people}
            positions={sheet.positions}
            onPerson={(person) => setDialog({ kind: 'person', person })}
            onAdd={() => setDialog({ kind: 'person', person: null })}
          />

          {sheet.shifts.length === 0 && (
            <Alert kind="info">
              {anyDays && from !== null ? (
                <span className="flex flex-wrap items-center gap-2">
                  {t('This month is empty. Fill it from people’s working days in one press.')}
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void fill()}>
                    <Icon name="spark" size={13} />
                    {t('Fill the month')}
                  </button>
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  {t('This month is empty. Mark who works which days and fill it in one press, or bring over last month.')}
                  <button type="button" className="btn btn-sm" onClick={() => openSettings('days')}>
                    {t('Working days')}
                  </button>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void repeat()}>
                    {t('As last month')}
                  </button>
                </span>
              )}
            </Alert>
          )}

          {wide ? (
            <>
              <ToolRow brushes={brushes} tool={tool} onTool={setPicked} onMake={() => setDialog({ kind: 'brush' })} />
              <RosterTable
                days={days}
                groups={groups}
                labelled={sheet.positions.length > 0}
                cells={cells}
                onCell={pressCell}
                onCellMenu={openCell}
                onPerson={(person) => setDialog({ kind: 'person', person })}
              />
            </>
          ) : (
            <RosterDays
              days={days}
              people={sheet.people}
              positions={sheet.positions}
              shifts={sheet.shifts}
              onCell={openCell}
              onFree={putUsual}
              onFreeMenu={openCell}
            />
          )}
        </>
      )}

      {sheet !== null && sheet.id === selected && (
        <button
          type="button"
          className={`btn btn-sm mt-3 self-start ${deleteRoster.armed ? 'btn-armed' : 'btn-quiet'}`}
          disabled={busy}
          onClick={deleteRoster.press}
        >
          <Icon name="trash" size={14} />
          {t(deleteRoster.armed ? 'Press again to delete' : 'Delete this schedule')}
        </button>
      )}

      {dialogs}
    </div>
  );
}
