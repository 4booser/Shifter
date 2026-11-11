'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { Roster, RosterMonth, RosterPerson, RosterPersonSave, rosterApi } from '@/lib/api/roster';
import {
  WEEKDAY_LABELS,
  addMonths,
  currentMonth,
  formatDayLabelShort,
  monthLabel,
} from '@/lib/calendar/calendar-date';
import { drawRosterCard, rosterCardData } from '@/lib/export/roster-card';
import { currentCardTheme } from '@/lib/export/share-card';
import { downloadBlob } from '@/lib/export/xlsx';
import { useReveal } from '@/lib/fx';
import { useEscape } from '@/lib/a11y';
import { useI18n } from '@/lib/i18n';
import { useArmed } from '@/lib/live/arm';
import { Brush, brushesOf } from '@/lib/roster/brushes';
import { RosterEdit, aboutPerson, applyEdit, editKey, overlay, stamp } from '@/lib/roster/edits';
import { cellKey, cellsOf, monthKey, rosterDays } from '@/lib/roster/month';
import { namesOf, nextColour } from '@/lib/roster/people';
import { useRosterSaves } from '@/lib/roster/use-saves';
import { useTitle } from '@/lib/use-title';
import { useWide } from '@/lib/use-wide';
import { BrushForm, CellForm, NewRosterForm, PersonForm } from '@/components/roster/editors';
import { PeopleStrip } from '@/components/roster/people-strip';
import { RosterDays } from '@/components/roster/roster-days';
import { BrushRow, RosterTable } from '@/components/roster/roster-table';
import { SaveLine } from '@/components/roster/save-line';
import { ShareBody } from '@/components/roster/share-dialog';
import { Shell } from '@/components/layout/shell';
import { Alert } from '@/components/ui/bits';
import { Empty } from '@/components/ui/empty';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { SkeletonRows } from '@/components/ui/skeleton';

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
  | { kind: 'roster' };

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

  const [brush, setBrush] = useState<Brush | null>(null);
  const [made, setMade] = useState<Brush[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const key = monthKey(month);
  const days = useMemo(() => rosterDays(month), [month]);
  const ready = sheet !== null && sheet.id === selected && sheet.month === key;

  const reads = useRef(0);

  // Always the latest read. A step that waits on the server must not call the
  // load it closed over: the owner may have moved month by then, and that older
  // read would take the place of the one the screen is waiting for.
  const reload = useRef<() => Promise<void>>(async () => undefined);

  const { state, failure, queueFor, flush } = useRosterSaves(({ error: refusal, went, kept }) => {
    // Nothing the screen says about that batch is true any more, so the
    // server's word replaces it along with its reason for refusing.
    const known = [...(sheet?.people ?? []), ...(rosters ?? []).flatMap((roster) => roster.people)];
    const names = namesOf(went, known);

    setError(
      went.length === 0
        ? apiErrorMessage(refusal)
        : `${t('No longer on this schedule')}${names === '' ? '' : `: ${names}`}. ${t(kept > 0 ? 'Edits for them were dropped, the rest were kept.' : 'Edits for them were dropped.')}`,
    );
    void reload.current();
  });

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

  const load = useCallback(async () => {
    if (selected === null) return;

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

      if (ticket === reads.current) setSheet(overlay(read, queue.pending()));
    } catch (caught) {
      if (ticket === reads.current) setError(apiErrorMessage(caught));
    }
  }, [selected, key, queueFor]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    reload.current = load;
  }, [load]);

  useEscape(brush !== null, () => setBrush(null));

  const shifts = ready ? sheet.shifts : null;
  const cells = useMemo(() => cellsOf(shifts ?? []), [shifts]);

  const brushes = useMemo(
    () => brushesOf(shifts ?? [], brush === null ? made : [...made, brush]),
    [shifts, made, brush],
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

    queueFor(selected).put(editKey(change), change);
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

  /** What the last month or roster had to say is not about the next one. */
  const moveOn = () => {
    setError(null);
    setNotice(null);
  };

  const step = (delta: number) => {
    moveOn();
    setMonth((current) => addMonths(current, delta));
  };

  const openCell = (personId: number, date: string) => setDialog({ kind: 'cell', personId, date });

  const pressCell = (personId: number, date: string) => {
    if (brush === null) openCell(personId, date);
    else edit(stamp(cells.get(cellKey(personId, date)), personId, date, brush));
  };

  const setCell = (personId: number, date: string, hours: Brush) =>
    edit({
      kind: 'set',
      shift: { person_id: personId, date, start_time: hours.start, end_time: hours.end },
    });

  const createRoster = (title: string) =>
    run(async () => {
      const roster = await rosterApi.create(title);

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

      const queue = queueFor(selected);

      await queue.settled();

      // The save line already says so. Filling the month now could put a shift
      // into a cell one of those edits was clearing.
      if (queue.state() === 'failed') return;

      const { added, kept } = await rosterApi.repeat(selected, key);

      await reload.current();

      setNotice(
        added + kept === 0
          ? t('Last month is empty, so there is nothing to repeat.')
          : `${t('Added')}: ${n(added, 'shifts')}. ${t('Already there')}: ${n(kept, 'shifts')}.`,
      );
    });

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
    });

    void drawRosterCard(data, currentCardTheme())
      .then((blob) => downloadBlob(`grafik-${sheet.month}.png`, blob))
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const label = monthLabel(month, lang);
  const failedToOpen = error !== null && (rosters === null || (selected !== null && !ready));

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

      {dialog?.kind === 'cell' && dialogPerson !== null && (
        <CellForm
          key={`${dialog.personId}:${dialog.date}`}
          shift={cells.get(cellKey(dialog.personId, dialog.date)) ?? null}
          brushes={brushes}
          focused={wide}
          onSet={(hours) => setCell(dialog.personId, dialog.date, hours)}
          onClear={() => edit({ kind: 'clear', person_id: dialog.personId, date: dialog.date })}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'person' && (
        <PersonForm
          key={dialog.person?.id ?? 'new'}
          person={dialog.person}
          suggested={nextColour(sheet?.people ?? [])}
          busy={busy}
          onAdd={addPerson}
          onEdit={(id, save) => edit({ kind: 'person', id, save })}
          onRemove={removePerson}
        />
      )}

      {dialog?.kind === 'brush' && (
        <BrushForm
          onMade={(hours) => {
            setMade((list) => [...list, hours]);
            setBrush(hours);
            setDialog(null);
          }}
        />
      )}

      {dialog?.kind === 'share' && (
        <ShareBody slug={sheet?.share_slug ?? null} busy={busy} onShare={() => void share()} onUnshare={() => void unshare()} />
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

        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          <button type="button" className="btn btn-sm" disabled={!ready || busy} onClick={() => void repeat()}>
            <Icon name="repeat" size={14} />
            {t('Repeat last month')}
          </button>
          <button type="button" className="btn btn-sm" disabled={!ready} onClick={() => setDialog({ kind: 'share' })}>
            <Icon name={(sheet?.share_slug ?? null) === null ? 'share' : 'link'} size={14} />
            {t('Share')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!ready || sheet.shifts.length === 0}
            title={t('Download as a picture')}
            onClick={download}
          >
            <Icon name="download" size={14} />
            {t('Picture')}
          </button>
        </div>
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
          icon="user"
          title={t('Nobody on this schedule yet')}
          action={{ label: t('Add a person'), onClick: () => setDialog({ kind: 'person', person: null }) }}
        >
          {t('Add the people who work here, with their position and a colour. They are only names: nobody gets an invitation.')}
        </Empty>
      )}

      {ready && sheet.people.length > 0 && (
        <>
          <SaveLine state={state} failure={failure} onRetry={flush} />

          {/* ==== Who ==== */}
          <PeopleStrip
            people={sheet.people}
            onPerson={(person) => setDialog({ kind: 'person', person })}
            onAdd={() => setDialog({ kind: 'person', person: null })}
          />

          {sheet.shifts.length === 0 && (
            <Alert kind="info">
              <span className="flex flex-wrap items-center gap-2">
                {t(wide ? 'This month is empty. Pick hours above the table and click the days, or bring over last month.' : 'This month is empty. Tap a person under a day to give them hours, or bring over last month.')}
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void repeat()}>
                  {t('Repeat last month')}
                </button>
              </span>
            </Alert>
          )}

          {wide ? (
            <>
              <BrushRow
                brushes={brushes}
                active={brush}
                onPick={setBrush}
                onMake={() => setDialog({ kind: 'brush' })}
              />
              <RosterTable
                days={days}
                people={sheet.people}
                cells={cells}
                onCell={pressCell}
                onPerson={(person) => setDialog({ kind: 'person', person })}
              />
            </>
          ) : (
            <RosterDays days={days} people={sheet.people} shifts={sheet.shifts} onCell={openCell} />
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
