'use client';

import { create } from 'zustand';

import { calendarApi } from '../api/calendar';
import { apiErrorMessage, HttpError } from '../api/http';
import {
  YearMonth,
  addMonths,
  buildMonthGrid,
  buildWeekGrid,
  currentMonth,
  keysBetween,
  monthBounds,
  shiftDays,
  todayKey,
  weekBounds,
} from '../calendar/calendar-date';
import {
  CalendarDayData,
  CalendarEvent,
  EventTemplate,
  EventTemplateSave,
  DaySave,
  DayShiftEntry,
  DaysResponse,
  EMPTY_SUMMARY,
  EventSave,
  Payout,
  SalesPosition,
  ShiftTemplate,
  WorkLocation,
  fineOf,
  toSavePayload,
} from '../calendar/models';
import { replayEdits } from '../calendar/day-draft';
import { schemeColourFor } from '../calendar/scheme';
import { hoursOn, workedByDefault } from '../calendar/shift-hours';
import { ColourScheme } from '../settings/settings';
import { useSettings } from '../settings/store';
import { PendingDay, offlineQueue } from './offline';

export type SummaryPeriod = 'month' | 'previous' | 'week' | 'all';

export const SUMMARY_PERIODS: { value: SummaryPeriod; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'previous', label: 'Last month' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' },
];

/** Wide enough to mean "everything" without the server needing a special case. */
export const ALL_TIME = { from: '2000-01-01', to: '2099-12-31' };

export type PaintScope = 'day' | 'week' | 'month';

export type DayStatus = 'saving' | 'queued' | 'failed';

export interface UndoStep {
  label: string;
  entries: { date: string; payload: DaySave }[];
}

interface CalendarState {
  month: YearMonth;
  selectedDate: string | null;
  templates: ShiftTemplate[];
  positions: SalesPosition[];
  locations: WorkLocation[];
  days: ReadonlyMap<string, CalendarDayData>;
  events: CalendarEvent[];
  eventTemplates: EventTemplate[];
  summary: DaysResponse;
  previousSummary: DaysResponse;
  summaryPeriod: SummaryPeriod;
  payouts: Payout[];
  brush: ShiftTemplate | null;
  /** The palette entry being placed on days: «английский» onto Tue and Thu. */
  eventBrush: EventTemplate | null;
  patternBrush: boolean;
  colourBrush: string | null;
  paintScope: PaintScope;
  error: string | null;
  /** Whether anything is on its way to the server. */
  saving: boolean;
  /** Where a date's saves stand, for a panel to say so beside its fields. A date with nothing to report is absent. */
  dayStatus: ReadonlyMap<string, DayStatus>;
  /** Newest last; capped, and cleared of redo by any fresh change. */
  undoStack: UndoStep[];
  redoStack: UndoStep[];
  /** The banner can be waved away without forgetting the history. */
  undoVisible: boolean;
  /** Extra selected days beyond selectedDate; empty means single-day mode. */
  multiSelected: ReadonlySet<string>;
  pendingOffline: number;
  /** A save refused because another device edited the day first. */
  conflict: DayConflict | null;
  /** Counted up when a panel's edits are given up, so it starts over from the day. */
  draftsDropped: number;
}

/** Two sides of one day, put to the person. */
interface DayConflict {
  date: string;
  mine: DaySave;
  /** The queued copy the answer also settles. */
  queuedAt?: number;
  /** The version the other side stood at when the person was asked, which is all the answer can speak for. */
  askedOn?: number;
  /** For a save refused over a queued copy, the day it was typed on: what it says beyond the copy is what differs from this. */
  typedOn?: DaySave;
}

/** The calendar's state and every write against it. */
export const useCalendar = create<CalendarState>(() => ({
  month: currentMonth(),
  selectedDate: todayKey(),
  templates: [],
  positions: [],
  locations: [],
  days: new Map(),
  events: [],
  eventTemplates: [],
  summary: EMPTY_SUMMARY,
  previousSummary: EMPTY_SUMMARY,
  summaryPeriod: 'month',
  payouts: [],
  brush: null,
  eventBrush: null,
  patternBrush: false,
  colourBrush: null,
  paintScope: 'day',
  error: null,
  saving: false,
  dayStatus: new Map(),
  undoStack: [],
  redoStack: [],
  undoVisible: false,
  multiSelected: new Set(),
  pendingOffline: 0,
  conflict: null,
  draftsDropped: 0,
}));

const set = useCalendar.setState;
const get = useCalendar.getState;

// ==== Ranges ====

export function gridRange(): { from: string; to: string } {
  const view = useSettings.getState().settings.view;
  const mondayFirst = useSettings.getState().settings.mondayFirst;

  if (view === 'year') {
    const year = get().month.year;

    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const weeks =
    view === 'week'
      ? buildWeekGrid(get().selectedDate ?? todayKey(), mondayFirst)
      : buildMonthGrid(get().month, mondayFirst);

  return { from: weeks[0][0].key, to: weeks[weeks.length - 1][6].key };
}

export function summaryRange(): { from: string; to: string } {
  const month = get().month;
  const anchor = `${month.year}-${`${month.month}`.padStart(2, '0')}-01`;

  switch (get().summaryPeriod) {
    case 'previous': {
      const previous = addMonths(month, -1);

      return monthBounds(`${previous.year}-${`${previous.month}`.padStart(2, '0')}-01`);
    }
    case 'week':
      return weekBounds(todayKey());
    case 'all':
      return ALL_TIME;
    default:
      return monthBounds(anchor);
  }
}

// ==== Loads ====

export async function loadCatalogues(): Promise<void> {
  try {
    const [templates, positions, locations, eventTemplates] = await Promise.all([
      calendarApi.shifts(),
      calendarApi.sales(),
      calendarApi.locations(),
      // Forgivingly: the newest of the four, and the sidebar must not go
      // blank because one palette failed to load.
      calendarApi.eventTemplates().catch(() => []),
    ]);

    set({ templates, positions, locations, eventTemplates });
  } catch (error) {
    set({ error: apiErrorMessage(error) });
  }
}

export async function loadGrid(): Promise<void> {
  const { from, to } = gridRange();

  try {
    const [response, queued] = await Promise.all([calendarApi.days(from, to), offlineQueue.all()]);

    set((state) => {
      const days = new Map(response.days.map((day) => [day.date, day]));

      // The clock watches these two whatever month is on screen.
      for (const key of clockKeys()) {
        const held = state.days.get(key);

        if ((key < from || key > to) && held !== undefined) days.set(key, held);
      }

      for (const [key, held] of state.days) {
        const read = days.get(key);

        if (lanes.has(key) || (read !== undefined && behind(read, held))) days.set(key, held);
      }

      for (const { date } of queued) {
        const day = date >= from && date <= to ? withQueued(date, days.get(date), queued) : undefined;

        if (day !== undefined) days.set(date, day);
      }

      return { days, events: response.events };
    });
  } catch (error) {
    set({ error: apiErrorMessage(error) });
  }
}

/** Whether a read was overtaken by what the store already holds. A read can leave before a save and answer after it, and taking it in would send the next save on a version the server has moved past. */
function behind(read: CalendarDayData, held: CalendarDayData | undefined): boolean {
  return (read.version ?? 0) < (held?.version ?? 0);
}

/** The two dates a shift running now can belong to. */
function clockKeys(): [string, string] {
  const today = todayKey();

  return [shiftDays(today, -1), today];
}

/** Reads the clock's two days into the store, on any page and in any month. False where the server could not be asked. */
export async function loadClockDays(): Promise<boolean> {
  const [from, to] = clockKeys();

  try {
    const [{ days }, queued] = await Promise.all([calendarApi.days(from, to, { fresh: true }), offlineQueue.all()]);
    let moved = false;

    set((state) => {
      const next = new Map(state.days);

      for (const read of days) {
        const day = withQueued(read.date, read, queued) as CalendarDayData;
        const held = next.get(day.date);

        // A date with a save on the wire is about to be answered by something
        // newer than this read, and a lower version already has been.
        if (lanes.has(day.date) || behind(day, held)) continue;
        if (JSON.stringify(day) === JSON.stringify(held)) continue;

        next.set(day.date, day);
        moved = true;
      }

      return moved ? { days: next } : state;
    });

    if (moved) void loadSummary();

    return true;
  } catch {
    return false;
  }
}

/** One date as the server has it right now, and apart from it whatever the server has yet to hear. Throws where it cannot be asked. */
async function readDay(key: string): Promise<{ day: CalendarDayData | undefined; pending: PendingDay | undefined }> {
  const [{ days }, queued] = await Promise.all([calendarApi.days(key, key, { fresh: true }), offlineQueue.all()]);

  return { day: days.find((item) => item.date === key), pending: queued.find((item) => item.date === key) };
}

/** Lets a read into the store, unless the store already knows better. */
function takeIn(day: CalendarDayData): void {
  set((state) => {
    const held = state.days.get(day.date);

    if (lanes.has(day.date) || behind(day, held)) return state;
    if (JSON.stringify(day) === JSON.stringify(held)) return state;

    return { days: new Map(state.days).set(day.date, day) };
  });
}

export async function loadSummary(): Promise<void> {
  const { from, to } = summaryRange();

  try {
    const summary = await calendarApi.days(from, to);

    set({ summary });
  } catch (error) {
    set({ error: apiErrorMessage(error) });
  }

  // The window of the same length immediately before, so every figure on
  // screen can say which way it moved. A failure here only costs the arrows.
  const span = keysBetween(from, to).length;
  const previousTo = shiftDays(from, -1);

  try {
    const previous = await calendarApi.days(shiftDays(previousTo, -(span - 1)), previousTo);

    set({ previousSummary: previous });
  } catch {
    set({ previousSummary: EMPTY_SUMMARY });
  }

  try {
    set({ payouts: await calendarApi.payouts(from, to) });
  } catch (error) {
    set({ error: apiErrorMessage(error) });
  }
}

export function reload(): void {
  void loadGrid();
  void loadSummary();
}

// ==== Navigation ====

export const calendarActions = {
  previous: () => {
    set((state) => ({ month: addMonths(state.month, -1) }));
    reload();
  },
  next: () => {
    set((state) => ({ month: addMonths(state.month, 1) }));
    reload();
  },
  today: () => {
    set({ month: currentMonth(), selectedDate: todayKey() });
    reload();
  },
  goToMonth: (month: number) => {
    set((state) => ({ month: { ...state.month, month } }));
    reload();
  },
  select: (key: string) => set({ selectedDate: key }),
  /** Jumps to a date from somewhere else in the app. */
  openDate: (key: string) => {
    set({
      month: { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) },
      selectedDate: key,
    });
    reload();
  },
  setSummaryPeriod: (period: SummaryPeriod) => {
    set({ summaryPeriod: period });
    void loadSummary();
  },
  clearError: () => set({ error: null }),
  dismissUndo: () => set({ undoVisible: false }),

  /** Cmd-click: a day joins or leaves the selection. */
  toggleMultiSelect: (key: string) =>
    set((state) => {
      const next = new Set(state.multiSelected);

      // The anchor day is part of the selection the first time it grows.
      if (next.size === 0 && state.selectedDate !== null) next.add(state.selectedDate);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      if (next.size <= 1) return { multiSelected: new Set<string>() };

      return { multiSelected: next };
    }),

  /** Shift-click: everything between the current day and this one. */
  rangeSelect: (key: string) =>
    set((state) => {
      const from = state.selectedDate ?? key;

      return { multiSelected: new Set(keysBetween(from, key)) };
    }),

  clearMultiSelect: () => set({ multiSelected: new Set<string>() }),

  // ==== Brushes ====

  toggleBrush: (template: ShiftTemplate) =>
    set((state) => ({
      patternBrush: false,
      colourBrush: null,
      eventBrush: null,
      brush: state.brush?.id === template.id ? null : template,
    })),
  toggleEventBrush: (template: EventTemplate) =>
    set((state) => ({
      patternBrush: false,
      colourBrush: null,
      brush: null,
      eventBrush: state.eventBrush?.id === template.id ? null : template,
    })),
  togglePatternBrush: () =>
    set((state) => ({ brush: null, colourBrush: null, eventBrush: null, patternBrush: !state.patternBrush })),
  toggleColourBrush: (colour: string | null) =>
    set((state) => ({
      brush: null,
      eventBrush: null,
      patternBrush: false,
      colourBrush: state.colourBrush === colour ? null : colour,
    })),
  clearBrush: () => set({ brush: null, eventBrush: null, patternBrush: false, colourBrush: null }),
  setPaintScope: (scope: PaintScope) => set({ paintScope: scope }),
};

/** The dates one click covers, given the scope in force. */
export function scopeOf(key: string): string[] {
  const scope = get().paintScope;

  if (scope === 'week') {
    const { from, to } = weekBounds(key);

    return keysBetween(from, to);
  }

  if (scope === 'month') {
    const { from, to } = monthBounds(key);

    return keysBetween(from, to);
  }

  return [key];
}

/** Which template the weekly pattern would place on a date, if any. */
export function patternTemplateFor(key: string): ShiftTemplate | null {
  const weekday = new Date(`${key}T00:00:00`).getDay();
  const id = useSettings.getState().settings.weekdayShifts[weekday];

  if (id === undefined) return null;

  return get().templates.find((template) => template.id === id) ?? null;
}

// ==== Undo ====

const UNDO_DEPTH = 20;

/** Keeps what the given days looked like before they are changed. */
function remember(label: string, keys: string[]): void {
  const days = get().days;

  const step: UndoStep = {
    label,
    entries: keys.map((date) => ({ date, payload: toSavePayload(days.get(date)) })),
  };

  set((state) => ({
    undoStack: [...state.undoStack.slice(-(UNDO_DEPTH - 1)), step],
    redoStack: [],
    undoVisible: true,
  }));
}

/** What the same days look like right now, for the opposite stack. */
function snapshot(step: UndoStep): UndoStep {
  const days = get().days;

  return {
    label: step.label,
    entries: step.entries.map(({ date }) => ({ date, payload: toSavePayload(days.get(date)) })),
  };
}

async function applyStep(step: UndoStep): Promise<void> {
  set({ saving: true });

  for (const entry of step.entries) {
    try {
      const day = await calendarApi.saveDay(entry.date, entry.payload);

      set((state) => ({ days: new Map(state.days).set(entry.date, day) }));
    } catch (error) {
      set({ error: apiErrorMessage(error) });
      break;
    }
  }

  set({ saving: false });
  void loadSummary();
}

export async function undo(): Promise<void> {
  const step = get().undoStack.at(-1);

  if (step === undefined) return;

  const mirror = snapshot(step);

  set((state) => ({
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, mirror],
  }));

  await applyStep(step);
}

export async function redo(): Promise<void> {
  const step = get().redoStack.at(-1);

  if (step === undefined) return;

  const mirror = snapshot(step);

  set((state) => ({
    redoStack: state.redoStack.slice(0, -1),
    undoStack: [...state.undoStack.slice(-(UNDO_DEPTH - 1)), mirror],
    undoVisible: true,
  }));

  await applyStep(step);
}

// ==== Writes ====

const isConflict = (error: unknown): boolean => error instanceof HttpError && error.status === 409;

function isOffline(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;

  // A TypeError from fetch is a request that never reached anyone, as opposed
  // to a server that considered it and refused.
  return error instanceof TypeError;
}

export interface SaveOptions {
  /** False for a write the app made by itself: there is nothing of the person's to take back. */
  undoable?: boolean;
  /** A 409 reported rather than put to the person, for a write that answers it by reading the day again. */
  quietConflict?: boolean;
  /** The read this save was built on, where that is fresher than the day in the store. */
  builtOn?: CalendarDayData;
}

/** Where a save ended up. */
export type SaveOutcome = 'landed' | 'queued' | 'conflict' | 'failed';

/** One date's saves: at most one on the wire, and only the newest behind it, since each is the whole day. */
interface Lane {
  waiting: DaySave | null;
  /** The day as the store held it when the waiting save joined, which is what it was built on. */
  waitingOn: CalendarDayData | undefined;
  /** Whether the save at the head was built on a read of its own, so that what waits behind it never saw it. */
  readItsOwn: boolean;
  /** What to put back if a save is refused: the last the server agreed to. */
  rollback: CalendarDayData | undefined;
  /** The queued copy this lane's saves were built on, by when it was queued. */
  carries: number | undefined;
  drained: Promise<SaveOutcome>;
}

const lanes = new Map<string, Lane>();

/** Lanes opened so far, so a read can tell whether a save slipped past it. */
let opened = 0;

function statusOf(key: string, status: DayStatus | null): void {
  set((state) => {
    const next = new Map(state.dayStatus);

    if (status === null) next.delete(key);
    else next.set(key, status);

    return { dayStatus: next };
  });
}

/** Resolves once nothing is left to send for a date. Whoever builds a day from the store waits here first, or it would be built from what a save is about to replace. */
export function daySettled(key: string): Promise<unknown> {
  return lanes.get(key)?.drained ?? Promise.resolve();
}

/** Puts a date back on what the server last agreed to. */
function rollBack(key: string, day: CalendarDayData | undefined): void {
  set((state) => {
    const next = new Map(state.days);

    if (day === undefined) next.delete(key);
    else next.set(key, day);

    return { days: next };
  });
}

/** Saves for one date run one after another, never side by side: two at once would carry the same version, and the second would come back a 409 the person did nothing to earn. */
export function saveDay(key: string, request: DaySave, options: SaveOptions = {}): Promise<SaveOutcome> {
  const running = lanes.get(key);

  if (running !== undefined) {
    // Each save is the whole day, so the newest says everything the one it
    // replaces would have.
    running.waiting = request;
    running.waitingOn = get().days.get(key);

    return running.drained;
  }

  if (options.undoable !== false) remember('Edited a day', [key]);

  const base = options.builtOn ?? get().days.get(key);
  const lane: Lane = {
    waiting: request,
    waitingOn: undefined,
    readItsOwn: 'builtOn' in options,
    rollback: base,
    carries: base?.queued_at,
    drained: Promise.resolve('landed'),
  };

  lanes.set(key, lane);
  opened += 1;
  statusOf(key, 'saving');
  set({ saving: true, error: null });

  lane.drained = drain(key, lane, options.quietConflict === true);

  return lane.drained;
}

async function drain(key: string, lane: Lane, quietConflict: boolean): Promise<SaveOutcome> {
  const first = lane.waiting;
  let landed = false;

  // What became of the save that opened the lane, the one its caller is waiting
  // to hear about. A newer day going out behind it does not carry what it said.
  let outcome: SaveOutcome | undefined;

  while (lane.waiting !== null) {
    const request = lane.waiting;
    const readItsOwn = lane.readItsOwn;

    lane.waiting = null;
    lane.readItsOwn = false;

    try {
      const day = await calendarApi.saveDay(key, request);

      landed = true;
      outcome ??= 'landed';
      lane.rollback = day;
      set((state) => ({ days: new Map(state.days).set(key, day) }));

      // Written against the version this save has just replaced. One sent
      // without a version asked for last-write-wins and keeps it.
      const next = lane.waiting as DaySave | null;

      if (next !== null && next.version !== undefined && day.version !== undefined) {
        lane.waiting = readItsOwn ? overLanded(next, lane.waitingOn, day) : { ...next, version: day.version };
      }
    } catch (error) {
      // Refused for what it said, which is no verdict on the newer day behind
      // it. That one goes out and answers for itself; only a save with nothing
      // behind it ends the lane as failed. A 409 or a dead network would only
      // repeat, and have paths of their own for the newest.
      if (lane.waiting !== null && !isConflict(error) && !isOffline(error)) {
        outcome ??= 'failed';

        continue;
      }

      const newest = lane.waiting ?? request;

      // Closed before anything below waits on the network, so a save that
      // arrives meanwhile opens a lane of its own instead of going unsent.
      finish(key);

      const ended = await refused(key, lane, newest, error, quietConflict && !landed && newest === request);

      if (landed) void loadSummary();

      return outcome ?? (newest === first ? ended : 'failed');
    }
  }

  statusOf(key, null);
  finish(key);

  // A queued copy this save was built on has now been said; sent later it would
  // only come back a 409 and hold up everything behind it. One it was not built
  // on still holds something nothing else does.
  if (get().pendingOffline > 0) {
    const queued = (await offlineQueue.all()).find((item) => item.date === key);

    if (queued?.queuedAt === lane.carries) await offlineQueue.remove(key);
    else if (queued !== undefined) statusOf(key, 'queued');

    set({ pendingOffline: (await offlineQueue.all()).length });
  }

  void loadSummary();

  return outcome ?? 'landed';
}

/** A save made while a write from a read of its own was out: it never saw that write, and on the new version it would undo it. Only what it changed goes over the answer. Where both changed one thing it keeps its old version, to be refused and put to the person. */
function overLanded(waiting: DaySave, builtOn: CalendarDayData | undefined, landed: CalendarDayData): DaySave {
  const { day, contested } = replayEdits(waiting, toSavePayload(builtOn), toSavePayload(landed));

  return { ...day, version: contested ? waiting.version : landed.version };
}

function finish(key: string): void {
  lanes.delete(key);
  set({ saving: lanes.size > 0 });
}

/** What goes in the queue for a save that could not go out. A copy already there holds what nothing else does: a save built on it has said all that. One it was not built on goes under it: what the save itself changed is the newest word, whichever way the copy had that field, and the copy keeps what only it holds. */
function queueEntry(key: string, body: DaySave, lane: Lane, held: PendingDay | undefined): PendingDay {
  const queuedAt = Date.now();

  if (held === undefined) return { date: key, body, queuedAt, base: toSavePayload(lane.rollback) };
  if (held.queuedAt === lane.carries) return { date: key, body, queuedAt, base: held.base };

  // Laid over the copy and over what it was edited on alike, so that what the
  // save changed stops counting as the copy's edit. It was typed over the day
  // as the store had it, so a field it only carried across says nothing.
  const built = toSavePayload(lane.rollback);
  const { day, contested } = replayEdits(
    replayEdits(body, built, held.body).day,
    replayEdits(body, built, held.base ?? toSavePayload(undefined)).day,
    body,
  );

  return { date: key, body: { ...day, version: contested ? held.body.version : body.version }, queuedAt, base: held.base };
}

async function refused(
  key: string,
  lane: Lane,
  newest: DaySave,
  error: unknown,
  quietConflict: boolean,
): Promise<SaveOutcome> {
  // Another device got there first.
  if (isConflict(error)) {
    if (quietConflict) {
      rollBack(key, lane.rollback);
      statusOf(key, null);

      return 'conflict';
    }

    // Said before the load, which leaves a date under a conflict as the server
    // has it: that is the side the person is being shown.
    statusOf(key, null);
    set({ conflict: { date: key, mine: newest, queuedAt: lane.carries, typedOn: toSavePayload(lane.rollback) } });
    await loadGrid();
    set((state) =>
      state.conflict?.date === key
        ? { conflict: { ...state.conflict, askedOn: state.days.get(key)?.version } }
        : state,
    );

    return 'conflict';
  }

  // A connection failure is not the user's mistake, and their day is not
  // theirs to lose: it goes to the queue and the cell keeps what they typed.
  if (isOffline(error)) {
    const pending = queueEntry(key, newest, lane, (await offlineQueue.all()).find((item) => item.date === key));

    if (await offlineQueue.put(pending)) {
      statusOf(key, 'queued');
      // On the store too: each later save is built from there and sent whole,
      // and landing or queueing one that lacks this would lose it. Not under a
      // question still open on this date, though, where the store is the other
      // side as the person is being shown it. The question takes this instead,
      // or answering it would answer with what this save has just replaced.
      set((state) =>
        state.conflict?.date === key
          ? { conflict: { ...state.conflict, mine: pending.body, queuedAt: pending.queuedAt, typedOn: undefined } }
          : {
              days: new Map(state.days).set(key, {
                ...layOver(key, state.days.get(key), pending.body),
                queued_at: pending.queuedAt,
              }),
            },
      );
      // Counted from the queue, which holds one entry per date however many
      // times a date was saved into it.
      set({ pendingOffline: (await offlineQueue.all()).length });

      return 'queued';
    }

    // The browser refused to hold it — private browsing does. Say so and
    // put the cell back, rather than leave the day looking saved.
  }

  rollBack(key, lane.rollback);
  statusOf(key, 'failed');
  set({ error: apiErrorMessage(error) });

  return 'failed';
}

export interface RewriteOptions {
  undoable?: boolean;
  /** Decides from the server's word or not at all: where it cannot be asked the write waits, instead of acting on the held copy. */
  freshOnly?: boolean;
}

/** What became of rewriting a day: `left` where the change decided against writing, `unread` where nothing could be read to change. */
export type RewriteOutcome = SaveOutcome | 'left' | 'unread';

/**
 * Reads a day, changes it, writes it back on the version it read, for the
 * writes the app makes by itself: the store's copy may be hours old, and a day
 * is always sent whole. `change` answers false to leave the day as it is. It is
 * given `day` as the server said it, which is what decides whether the shift is
 * still there to write on, and `built`, the same with whatever is queued replayed
 * in, which is what the payload came from. A day that moved between the read and
 * the write is read once more rather than given up on.
 */
export async function rewriteDay(
  key: string,
  change: (payload: DaySave, day: CalendarDayData | undefined, built: CalendarDayData | undefined) => boolean,
  { undoable = false, freshOnly = false }: RewriteOptions = {},
): Promise<RewriteOutcome> {
  for (let attempt = 0; ; attempt += 1) {
    let day: CalendarDayData | undefined;
    let pending: PendingDay | undefined;

    try {
      let before: number;

      // Asked after the read too: a save that opened meanwhile makes what was
      // read out of date, even one already answered, and if it is still out
      // its version would carry this write straight over it.
      do {
        await daySettled(key);
        before = opened;
        ({ day, pending } = await readDay(key));
      } while (lanes.has(key) || opened !== before);
    } catch (error) {
      day = get().days.get(key);
      pending = undefined;

      if (freshOnly) return 'unread';

      // Nothing to build on, and a blank day sent whole wipes the real one.
      if (day === undefined) {
        set({ error: apiErrorMessage(error) });

        return 'unread';
      }
    }

    // A queued edit rides along only where it takes nothing from this read. One
    // that would is the person's to settle, and waits in the queue to be asked.
    const queued = pending === undefined ? undefined : laidOver(key, day, pending);
    const rides = queued !== undefined && !queued.contested;
    const built = rides ? queued.day : day;
    const payload = rides ? queued.edits : toSavePayload(day);

    if (!change(payload, day, built)) {
      const shown = queued?.day ?? day;

      if (shown !== undefined) takeIn(shown);

      return 'left';
    }

    const outcome = await saveDay(
      key,
      { ...payload, version: day?.version ?? 0 },
      { undoable, builtOn: built, quietConflict: freshOnly || attempt === 0 },
    );

    if (outcome !== 'conflict' || attempt > 0) return outcome;
  }
}

/** Sends everything waiting, oldest first. A date that cannot go holds up no other; only a dead network ends the run. */
export async function flushOffline(): Promise<void> {
  const pending = await offlineQueue.all();
  let sent = 0;

  // A save that lands looks here before it tidies the queue up.
  set({ pendingOffline: pending.length });

  for (const { date } of [...pending].sort((a, b) => a.queuedAt - b.queuedAt)) {
    const outcome = await sendQueuedDay(date);

    if (outcome === 'landed') sent += 1;
    if (outcome === 'queued' || outcome === 'unread') break;
  }

  const left = await offlineQueue.all();

  for (const { date } of left) {
    if (!get().dayStatus.has(date) && get().conflict?.date !== date) statusOf(date, 'queued');
  }

  set({ pendingOffline: left.length });

  // Each save that landed has already asked for the money.
  if (sent > 0) void loadGrid();
}

/** Sends one date's queued copy down its lane, so nothing typed meanwhile goes out beside it. */
async function sendQueuedDay(date: string): Promise<RewriteOutcome> {
  await daySettled(date);

  const entry = (await offlineQueue.all()).find((item) => item.date === date);

  // Said already by a save built on it, or about to be.
  if (entry === undefined || lanes.has(date)) return 'left';

  const outcome = await saveDay(date, entry.body, {
    undoable: false,
    quietConflict: true,
    builtOn: { ...(get().days.get(date) ?? blankDay(date)), queued_at: entry.queuedAt },
  });

  return outcome === 'conflict' ? replayQueuedDay(date) : outcome;
}

/** A queued copy whose version has gone: what it changed goes over the day as it stands. Where both sides changed one thing the person is asked, as they are for a save of their own. */
async function replayQueuedDay(date: string): Promise<RewriteOutcome> {
  let read: Awaited<ReturnType<typeof readDay>>;

  try {
    read = await readDay(date);
  } catch {
    return 'unread';
  }

  if (read.pending === undefined) return 'left';

  const { edits, contested } = laidOver(date, read.day, read.pending);

  if (!contested) {
    return rewriteDay(date, (_payload, _day, built) => built?.queued_at !== undefined, { freshOnly: true });
  }

  // One at a time: the next date's turn comes once this one is answered. It
  // stays queued until then, since the answer may never come from this tab.
  if (get().conflict === null) {
    rollBack(date, read.day);
    statusOf(date, null);
    set({
      conflict: {
        date,
        mine: { ...edits, version: read.pending.body.version },
        queuedAt: read.pending.queuedAt,
        askedOn: read.day?.version ?? 0,
      },
    });
  }

  return 'left';
}

/** Takes a queued copy out once nothing is left in it to go. */
async function dropQueuedDay(date: string): Promise<void> {
  await offlineQueue.remove(date);
  set({ pendingOffline: (await offlineQueue.all()).length });
}

/** The person kept the other side of a queued copy. What both sides changed goes that way and no more: the rest of the copy has no quarrel with anybody, and for a finish it is the only record left, the clock having stopped. A day that cannot be read leaves it waiting, to be asked about again. */
async function yieldQueuedDay(date: string): Promise<void> {
  let read: Awaited<ReturnType<typeof readDay>>;

  try {
    read = await readDay(date);
  } catch {
    statusOf(date, 'queued');

    return;
  }

  const { day, pending } = read;

  if (pending === undefined) return;

  const now = toSavePayload(day);
  const { day: edits, moved } = replayEdits(pending.body, baseOf(pending, day, now), now, true);

  if (!moved) {
    await dropQueuedDay(date);

    return;
  }

  await offlineQueue.put({ ...pending, body: { ...edits, version: day?.version ?? 0 }, base: now });
}

/** The person kept their side of a queued copy. The answer may have stood open while the day moved on, and it speaks for what both sides changed and no more: the copy goes over the day as it stands, that going its way. A day that cannot be read sends what the person was shown, on the version it was shown against, so that a move since is refused instead of overwritten. */
async function insistQueuedDay({ date, mine, queuedAt, askedOn, typedOn }: DayConflict): Promise<void> {
  let read: Awaited<ReturnType<typeof readDay>>;

  try {
    await daySettled(date);
    read = await readDay(date);
  } catch {
    await saveDay(
      date,
      { ...mine, version: askedOn ?? mine.version },
      { builtOn: { ...(get().days.get(date) ?? blankDay(date)), queued_at: queuedAt } },
    );

    return;
  }

  const { day, pending } = read;

  // Said already, and nothing was typed on top of it.
  if (pending === undefined && typedOn === undefined) return;

  const now = toSavePayload(day);
  const queued = pending === undefined ? now : replayEdits(pending.body, baseOf(pending, day, now), now).day;
  const edits = typedOn === undefined ? queued : replayEdits(mine, typedOn, queued).day;

  await saveDay(
    date,
    { ...edits, version: day?.version ?? 0 },
    { builtOn: { ...(day ?? blankDay(date)), queued_at: pending?.queuedAt ?? queuedAt } },
  );
}

/** Applies a template across a set of dates in one request. */
export async function applyToDates(keys: string[], template: ShiftTemplate): Promise<void> {
  if (keys.length === 0) return;

  remember('Painted shifts', keys);

  const mode = get()
    .days.get(keys[0])
    ?.shifts.some((entry) => entry.shift_id === template.id)
    ? 'remove'
    : 'add';

  const rollback = get().days;

  set((state) => {
    const next = new Map(state.days);

    for (const key of keys) {
      const day = next.get(key);
      const current = day?.shifts ?? [];

      next.set(key, {
        ...(day ?? blankDay(key)),
        shifts:
          mode === 'add'
            ? current.some((entry) => entry.shift_id === template.id)
              ? current
              : [...current, placeholderFor(template, key)]
            : current.filter((entry) => entry.shift_id !== template.id),
      });
    }

    return { days: next, saving: true, error: null };
  });

  try {
    const painted = await calendarApi.bulk(keys, template.id, mode);

    // The stroke moved the version, and the read below takes a moment. Only the
    // version: these days come back without the names of what else is on them.
    // A tip typed in that moment would be refused over this person's own paint.
    set((state) => {
      const next = new Map(state.days);

      for (const { date, version } of painted) {
        const held = next.get(date);

        if (held !== undefined) next.set(date, { ...held, version });
      }

      return { days: next, saving: false };
    });
    reload();
  } catch (error) {
    set({ saving: false, days: rollback, error: apiErrorMessage(error) });
  }
}

/** A drag in pattern mode: the dates go out grouped by which template lands on them — one request per distinct… */
export function paintPattern(keys: string[]): void {
  const byTemplate = new Map<number, { template: ShiftTemplate; dates: string[] }>();

  for (const key of keys) {
    const template = patternTemplateFor(key);

    // A weekday with nothing assigned is left alone rather than cleared.
    if (template === null) continue;

    const group = byTemplate.get(template.id);

    if (group === undefined) byTemplate.set(template.id, { template, dates: [key] });
    else group.dates.push(key);
  }

  for (const { template, dates } of byTemplate.values()) void applyToDates(dates, template);
}

/** Colours a set of days in one request, optimistically. */
export async function paintColour(keys: string[], colour: string | null): Promise<void> {
  if (keys.length === 0) return;

  const rollback = get().days;

  remember('Coloured days', keys);

  set((state) => {
    const next = new Map(state.days);

    for (const key of keys) {
      const day = next.get(key);

      // A day with nothing on it and no colour is not worth inventing here.
      if (day === undefined && colour === null) continue;

      next.set(key, { ...(day ?? blankDay(key)), colour });
    }

    return { days: next, saving: true, error: null };
  });

  try {
    const days = await calendarApi.colourDays(keys.map((date) => ({ date, colour })));

    set((state) => {
      const next = new Map(state.days);

      for (const day of days) next.set(day.date, day);

      return { days: next, saving: false };
    });
  } catch (error) {
    set({ saving: false, days: rollback, error: apiErrorMessage(error) });
  }
}

/** Lays a saved scheme over a stretch of dates. */
export async function applyScheme(scheme: ColourScheme, keys: string[]): Promise<void> {
  const days = keys
    .map((date) => ({ date, colour: schemeColourFor(scheme, date) }))
    .filter((entry) => entry.colour !== undefined) as { date: string; colour: string | null }[];

  if (days.length === 0) return;

  const rollback = get().days;

  remember('Applied a colour scheme', days.map((entry) => entry.date));

  set((state) => {
    const next = new Map(state.days);

    for (const entry of days) {
      const day = next.get(entry.date);

      if (day === undefined && entry.colour === null) continue;

      next.set(entry.date, { ...(day ?? blankDay(entry.date)), colour: entry.colour });
    }

    return { days: next, saving: true, error: null };
  });

  try {
    const updated = await calendarApi.colourDays(days);

    set((state) => {
      const next = new Map(state.days);

      for (const day of updated) next.set(day.date, day);

      return { days: next, saving: false };
    });
  } catch (error) {
    set({ saving: false, days: rollback, error: apiErrorMessage(error) });
  }
}

/** Repeats the week before the selected one onto it. */
export function copyPreviousWeek(): void {
  const anchor = get().selectedDate ?? todayKey();
  const target = weekBounds(anchor);
  const source = weekBounds(shiftDays(target.from, -7));

  const targetDays = keysBetween(target.from, target.to);
  const sourceDays = keysBetween(source.from, source.to);

  const days = get().days;
  const byShift = new Map<number, string[]>();

  sourceDays.forEach((key, index) => {
    for (const entry of days.get(key)?.shifts ?? []) {
      const dates = byShift.get(entry.shift_id) ?? [];

      dates.push(targetDays[index]);
      byShift.set(entry.shift_id, dates);
    }
  });

  if (byShift.size === 0) {
    set({ error: 'The week before this one has no shifts to copy.' });

    return;
  }

  const templates = new Map(get().templates.map((t) => [t.id, t]));

  for (const [shiftId, dates] of byShift) {
    const template = templates.get(shiftId);

    if (template === undefined || template.archived) continue;

    void applyToDates(dates, template);
  }
}

// ==== Catalogue writes ====

function replace<T extends { id: number }>(list: T[], item: T): T[] {
  const index = list.findIndex((existing) => existing.id === item.id);

  if (index === -1) return [...list, item];

  const next = [...list];

  next[index] = item;

  return next;
}

/** Carries one shift from a day to another — the drag-and-drop write. */
export async function moveShift(
  from: string,
  to: string,
  shiftId: number,
  copy: boolean,
): Promise<void> {
  if (from === to) return;

  const days = get().days;
  const source = days.get(from);
  const entry = source?.shifts.find((item) => item.shift_id === shiftId);

  if (entry === undefined) return;

  remember(copy ? 'Copied a shift' : 'Moved a shift', [from, to]);

  const target = toSavePayload(days.get(to));

  if (!target.shifts.some((item) => item.shift_id === shiftId)) {
    target.shifts.push({ shift_id: shiftId, worked: entry.worked, needs_cover: entry.needs_cover });
  }

  const origin = toSavePayload(source);

  if (!copy) origin.shifts = origin.shifts.filter((item) => item.shift_id !== shiftId);

  set({ saving: true, error: null });

  try {
    const savedTarget = await calendarApi.saveDay(to, target);

    set((state) => ({ days: new Map(state.days).set(to, savedTarget) }));

    if (!copy) {
      const savedOrigin = await calendarApi.saveDay(from, origin);

      set((state) => ({ days: new Map(state.days).set(from, savedOrigin) }));
    }
  } catch (error) {
    set({ error: apiErrorMessage(error) });
  }

  set({ saving: false });
  void loadSummary();
}

/** Places specific templates on specific days — the import's write path. */
export async function placeShifts(entries: { date: string; templateId: number }[]): Promise<void> {
  const days = get().days;
  const fresh = entries.filter(
    (entry) => !days.get(entry.date)?.shifts.some((item) => item.shift_id === entry.templateId),
  );

  if (fresh.length === 0) return;

  remember('Imported shifts', fresh.map((entry) => entry.date));
  set({ saving: true, error: null });

  for (const entry of fresh) {
    const payload = toSavePayload(get().days.get(entry.date));
    const template = get().templates.find((item) => item.id === entry.templateId);

    payload.shifts.push({
      shift_id: entry.templateId,
      worked: template === undefined ? entry.date <= todayKey() : workedByDefault(template, entry.date, Date.now()),
      needs_cover: false,
    });

    try {
      const saved = await calendarApi.saveDay(entry.date, payload);

      set((state) => ({ days: new Map(state.days).set(entry.date, saved) }));
    } catch (error) {
      set({ error: apiErrorMessage(error), saving: false });

      return;
    }
  }

  set({ saving: false });
  void loadSummary();
}

/** Removes every shift from the given days; tips, sales and notes stay. */
export async function clearShifts(keys: string[]): Promise<void> {
  const days = get().days;
  const dirty = keys.filter((key) => (days.get(key)?.shifts.length ?? 0) > 0);

  if (dirty.length === 0) return;

  remember('Cleared shifts', dirty);
  set({ saving: true, error: null });

  for (const key of dirty) {
    const payload = toSavePayload(days.get(key));

    payload.shifts = [];

    try {
      const saved = await calendarApi.saveDay(key, payload);

      set((state) => ({ days: new Map(state.days).set(key, saved) }));
    } catch (error) {
      set({ error: apiErrorMessage(error) });
      break;
    }
  }

  set({ saving: false });
  void loadSummary();
}

export const catalogueActions = {
  async saveShift(request: Parameters<typeof calendarApi.createShift>[0], id: number | null) {
    const template = id === null
      ? await calendarApi.createShift(request)
      : await calendarApi.updateShift(id, request);

    set((state) => ({ templates: replace(state.templates, template) }));

    // Rates feed into every day the template sits on.
    if (id !== null) reload();
  },

  async savePosition(request: Parameters<typeof calendarApi.createSales>[0], id: number | null) {
    const position = id === null
      ? await calendarApi.createSales(request)
      : await calendarApi.updateSales(id, request);

    set((state) => ({ positions: replace(state.positions, position) }));
  },

  async saveLocation(request: Parameters<typeof calendarApi.createLocation>[0], id: number | null) {
    const location = id === null
      ? await calendarApi.createLocation(request)
      : await calendarApi.updateLocation(id, request);

    set((state) => ({ locations: replace(state.locations, location) }));

    // A colour change repaints the calendar, which reads it off the shifts.
    if (id !== null) {
      set({ templates: await calendarApi.shifts() });
      reload();
    }
  },

  async archiveShift(id: number, archived: boolean) {
    if (archived && get().brush?.id === id) set({ brush: null });

    const template = await calendarApi.archiveShift(id, archived);

    set((state) => ({ templates: replace(state.templates, template) }));
  },

  async archivePosition(id: number, archived: boolean) {
    const position = await calendarApi.archiveSales(id, archived);

    set((state) => ({ positions: replace(state.positions, position) }));
  },

  async archiveLocation(id: number, archived: boolean) {
    const location = await calendarApi.archiveLocation(id, archived);

    set((state) => ({ locations: replace(state.locations, location) }));
  },

  async deletePosition(id: number) {
    await calendarApi.deleteSales(id);
    set((state) => ({ positions: state.positions.filter((item) => item.id !== id) }));
  },

  /** `onConflict` fires when templates still use the place — the caller offers detach. */
  async deleteLocation(id: number, detach: boolean, onConflict?: (message: string) => void) {
    try {
      await calendarApi.deleteLocation(id, detach);
      set((state) => ({ locations: state.locations.filter((item) => item.id !== id) }));

      if (detach) {
        set({ templates: await calendarApi.shifts() });
        reload();
      }
    } catch (error) {
      if (error instanceof HttpError && error.status === 409 && onConflict) {
        onConflict(error.message);

        return;
      }

      set({ error: apiErrorMessage(error) });
    }
  },

  async saveEventTemplate(request: EventTemplateSave, id: number | null) {
    const saved = id === null
      ? await calendarApi.createEventTemplate(request)
      : await calendarApi.updateEventTemplate(id, request);

    set((state) => ({
      eventTemplates:
        id === null
          ? [...state.eventTemplates, saved]
          : state.eventTemplates.map((item) => (item.id === id ? saved : item)),
    }));
  },

  async archiveEventTemplate(id: number, value: boolean) {
    await calendarApi.archiveEventTemplate(id, value);
    set((state) => ({
      eventTemplates: state.eventTemplates.map((item) =>
        item.id === id ? { ...item, archived: value } : item,
      ),
    }));
  },

  async deleteEventTemplate(id: number) {
    await calendarApi.deleteEventTemplate(id);
    set((state) => ({ eventTemplates: state.eventTemplates.filter((item) => item.id !== id) }));
  },

  /** Puts one palette entry on a run of days — or lifts it off again. */
  async paintEvent(keys: string[], template: EventTemplate) {
    if (keys.length === 0) return;

    const { events } = get();

    for (const key of keys) {
      // Same template on this exact day — matched by template first, and by
      // name for events placed before templates carried ids.
      const already = events.find(
        (item) =>
          item.start_date === key &&
          item.end_date === key &&
          (item.template_id === template.id || (item.template_id == null && item.name === template.name)),
      );

      if (already !== undefined) {
        await catalogueActions.deleteEvent(already.id);

        continue;
      }

      await catalogueActions.saveEvent(
        {
          name: template.name,
          symbol: template.symbol,
          colour: template.colour,
          kind: template.kind,
          start_date: key,
          end_date: key,
          start_time: template.start_time,
          end_time: template.end_time,
          note: null,
          cost: template.cost ?? 0,
          template_id: template.id,
        },
        null,
      );
    }
  },

  async saveEvent(request: EventSave, id: number | null) {
    const event = id === null
      ? await calendarApi.createEvent(request)
      : await calendarApi.updateEvent(id, request);

    set((state) => ({
      events:
        id === null
          ? [...state.events, event]
          : state.events.map((item) => (item.id === id ? event : item)),
    }));
  },

  async deleteEvent(id: number) {
    await calendarApi.deleteEvent(id);
    set((state) => ({ events: state.events.filter((item) => item.id !== id) }));
  },

  async createPayout(request: Parameters<typeof calendarApi.createPayout>[0]) {
    await calendarApi.createPayout(request);
    void loadSummary();
  },

  async updatePayout(id: number, request: Parameters<typeof calendarApi.createPayout>[0]) {
    await calendarApi.updatePayout(id, request);
    void loadSummary();
  },

  async deletePayout(id: number) {
    await calendarApi.deletePayout(id);
    void loadSummary();
  },

  /** Conflict, resolved их way: keep what the map already reloaded. A queued copy gives up only what was contested. */
  async dropConflict() {
    const { conflict } = get();

    set((state) => ({ conflict: null, draftsDropped: state.draftsDropped + 1 }));

    if (conflict?.queuedAt === undefined) return;

    await yieldQueuedDay(conflict.date);
    await flushOffline();
  },

  /** Conflict, put down unanswered. A queued copy is the only place its edit lives, so it stays and is asked about again on the next flush. A panel's draft has nowhere to wait. */
  async leaveConflict() {
    const { conflict } = get();

    if (conflict === null) return;

    if (conflict.queuedAt === undefined) {
      await catalogueActions.dropConflict();

      return;
    }

    set((state) => ({ conflict: null, draftsDropped: state.draftsDropped + 1 }));
    statusOf(conflict.date, 'queued');
    await loadGrid();
  },

  /** Conflict, resolved my way: rewrite mine over the version the person was asked about, so a move since is refused and asked again rather than overwritten. A queued copy goes over a fresh read instead. */
  async overwriteConflict() {
    const { conflict } = get();

    if (conflict === null) return;

    const { date, mine, queuedAt, askedOn } = conflict;

    set({ conflict: null });

    if (queuedAt === undefined) {
      await saveDay(date, { ...mine, version: askedOn ?? mine.version });

      return;
    }

    await insistQueuedDay(conflict);
    await flushOffline();
  },

  /** Wipes the whole payment ledger. The asking-out-loud happens in the UI. */
  async wipePayouts() {
    const { deleted } = await calendarApi.wipePayouts();

    void loadSummary();

    return deleted;
  },
};

// ==== Helpers ====

function blankDay(date: string): CalendarDayData {
  return {
    date,
    version: 0,
    shifts: [],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_pool: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    below_floor: false,
    hours: 0,
    earned: 0,
    planned: 0,
  };
}

/** A day as it will read once a save lands, for saying so ahead of the server. */
function layOver(key: string, day: CalendarDayData | undefined, body: DaySave): CalendarDayData {
  const { templates, positions } = get();
  const base = day ?? blankDay(key);
  const fine = body.deductions ?? 0;

  return {
    ...base,
    shifts: body.shifts.flatMap((item) => {
      const template = templates.find((entry) => entry.id === item.shift_id);
      const entry =
        base.shifts.find((held) => held.shift_id === item.shift_id) ??
        (template === undefined ? undefined : placeholderFor(template, key));

      if (entry === undefined) return [];

      // A press still on its way is this save's to say now, whichever way it went.
      return [{ ...entry, ...item, break_minutes: item.break_minutes ?? entry.break_minutes, cover_asked: undefined }];
    }),
    sales: body.sales.map((item) => {
      const position = positions.find((entry) => entry.id === item.sales_id);

      return {
        sales_id: item.sales_id,
        name: position?.name ?? '',
        unit_price: position?.price ?? 0,
        percentage: position?.percentage ?? 0,
        earned: 0,
        ...base.sales.find((held) => held.sales_id === item.sales_id),
        quantity: item.quantity,
      };
    }),
    tips: body.tips,
    tips_cash: body.tips_cash,
    tip_pool: body.tip_pool,
    // The meal money stays as it was: only the fine is the save's to change.
    deductions: base.deductions - (fineOf(base) ?? 0) + fine,
    fine,
    deduction_reason: body.deduction_reason ?? null,
    note: body.note,
    colour: body.colour,
  };
}

/** A day read, with what is queued for it replayed over it. */
interface LaidOver {
  day: CalendarDayData;
  /** The same as a payload: `day` drops a shift placed on a template not loaded yet. */
  edits: DaySave;
  contested: boolean;
}

/** What a queued copy was edited on. For one queued before bases were kept: on its own version nothing moved under it, and on another all it can vouch for is the fields it filled in. */
function baseOf(pending: PendingDay, day: CalendarDayData | undefined, now: DaySave): DaySave {
  return pending.base ?? (pending.body.version === day?.version ? now : toSavePayload(undefined));
}

function laidOver(key: string, day: CalendarDayData | undefined, pending: PendingDay): LaidOver {
  const now = toSavePayload(day);
  const { day: edits, contested } = replayEdits(pending.body, baseOf(pending, day, now), now);
  const laid = layOver(key, day, edits);

  return {
    day: {
      ...laid,
      // Left on the copy's own version, so whatever is built on this is refused
      // and the person asked, instead of carried over what the other side said.
      version: contested ? (pending.body.version ?? laid.version) : laid.version,
      queued_at: pending.queuedAt,
    },
    edits,
    contested,
  };
}

/** A day for showing, with what is still queued for it put back: the server has not heard it, and a day read without it would be sent whole without it. Never for deciding on: the read itself says what the day is. */
function withQueued(key: string, day: CalendarDayData | undefined, queued: PendingDay[]): CalendarDayData | undefined {
  const pending = queued.find((item) => item.date === key);

  // Put to the person already: what the conflict shows as theirs stays theirs
  // until they answer.
  return pending === undefined || get().conflict?.date === key ? day : laidOver(key, day, pending).day;
}

/** A stand-in entry while the save is in flight. */
function placeholderFor(template: ShiftTemplate, key: string): DayShiftEntry {
  const { start_time, end_time, hours } = hoursOn(template, key);

  return {
    shift_id: template.id,
    name: template.name,
    symbol: template.symbol,
    start_time,
    end_time,
    revenue: null,
    guests: null,
    zone: 'unset' as const,
    revenue_percent: template.revenue_percent,
    colour: template.effective_colour,
    hours,
    earned: 0,
    worked: workedByDefault(template, key, Date.now()),
    needs_cover: false,
    actual_start: null,
    actual_end: null,
    break_minutes: template.break_minutes,
    auto_closed: false,
  };
}

/** Writes imported rows one day at a time, sequentially. Returns the count. */
export async function importDays(
  rows: {
    date: string;
    shift: string | null;
    tips: number | null;
    tipsCash: number | null;
    deductions: number | null;
    note: string | null;
  }[],
): Promise<number> {
  const byName = new Map(get().templates.map((template) => [template.name.toLowerCase(), template]));

  let written = 0;

  for (const row of rows) {
    const template = row.shift === null ? null : byName.get(row.shift.toLowerCase());
    const existing = get().days.get(row.date);

    const payload: DaySave = {
      ...toSavePayload(existing),
      shifts:
        template === undefined || template === null
          ? (existing?.shifts ?? []).map((entry) => ({
              shift_id: entry.shift_id,
              worked: entry.worked,
              needs_cover: entry.needs_cover,
            }))
          : [{ shift_id: template.id, worked: true, needs_cover: false }],
      tips: row.tips ?? existing?.tips ?? null,
      tips_cash: row.tipsCash ?? existing?.tips_cash ?? null,
      deductions: row.deductions ?? fineOf(existing),
      note: row.note ?? existing?.note ?? null,
    };

    try {
      const day = await calendarApi.saveDay(row.date, payload);

      set((state) => ({ days: new Map(state.days).set(row.date, day) }));
      written += 1;
    } catch (error) {
      set({ error: apiErrorMessage(error) });
      break;
    }
  }

  if (written > 0) void loadSummary();

  return written;
}
