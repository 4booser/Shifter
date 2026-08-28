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
  toSavePayload,
} from '../calendar/models';
import { schemeColourFor } from '../calendar/scheme';
import { ColourScheme } from '../settings/settings';
import { useSettings } from '../settings/store';
import { offlineQueue } from './offline';

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
  saving: boolean;
  /** Newest last; capped, and cleared of redo by any fresh change. */
  undoStack: UndoStep[];
  redoStack: UndoStep[];
  /** The banner can be waved away without forgetting the history. */
  undoVisible: boolean;
  /** Extra selected days beyond selectedDate; empty means single-day mode. */
  multiSelected: ReadonlySet<string>;
  pendingOffline: number;
}

/**
 * The calendar's state and every write against it. A plain zustand store:
 * actions live beside it as functions, optimistic updates roll back together,
 * and the ranges reload from the server because it owns the money rules.
 */
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
  undoStack: [],
  redoStack: [],
  undoVisible: false,
  multiSelected: new Set(),
  pendingOffline: 0,
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
    const response = await calendarApi.days(from, to);

    set({
      days: new Map(response.days.map((day) => [day.date, day])),
      events: response.events,
    });
  } catch (error) {
    set({ error: apiErrorMessage(error) });
  }
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

/**
 * Keeps what the given days looked like before they are changed. A capped
 * stack: deep enough to walk back a whole painting session, shallow enough
 * that memory never notices. A fresh change forfeits whatever was redoable —
 * the timeline has branched and the old branch is gone.
 */
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

function isOffline(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;

  // A TypeError from fetch is a request that never reached anyone, as opposed
  // to a server that considered it and refused.
  return error instanceof TypeError;
}

export async function saveDay(key: string, request: DaySave): Promise<void> {
  const rollback = get().days;

  remember('Edited a day', [key]);
  set({ saving: true, error: null });

  try {
    const day = await calendarApi.saveDay(key, request);

    set((state) => ({ saving: false, days: new Map(state.days).set(key, day) }));
    void loadSummary();
  } catch (error) {
    set({ saving: false });

    // A connection failure is not the user's mistake, and their day is not
    // theirs to lose: it goes to the queue and the cell keeps what they typed.
    if (isOffline(error)) {
      await offlineQueue.put({ date: key, body: request, queuedAt: Date.now() });
      set((state) => ({ pendingOffline: state.pendingOffline + 1 }));

      return;
    }

    set({ days: rollback, error: apiErrorMessage(error) });
  }
}

/** Sends everything waiting, oldest first; stops at the first failure. */
export async function flushOffline(): Promise<void> {
  const pending = await offlineQueue.all();

  let sent = 0;

  for (const entry of [...pending].sort((a, b) => a.queuedAt - b.queuedAt)) {
    try {
      await calendarApi.saveDay(entry.date, entry.body);
      await offlineQueue.remove(entry.date);
      sent += 1;
    } catch {
      break;
    }
  }

  set({ pendingOffline: pending.length - sent });

  if (sent > 0) reload();
}

/**
 * Applies a template across a set of dates in one request. Whether it adds or
 * removes follows the first date: dragging back over a filled run clears it.
 * Cells repaint immediately and roll back together if the call fails.
 */
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
    await calendarApi.bulk(keys, template.id, mode);
    set({ saving: false });
    reload();
  } catch (error) {
    set({ saving: false, days: rollback, error: apiErrorMessage(error) });
  }
}

/**
 * A drag in pattern mode: the dates go out grouped by which template lands on
 * them — one request per distinct shift rather than one per day.
 */
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

/**
 * Repeats the week before the selected one onto it. Rotas often repeat by
 * habit rather than by formula, which no pattern generator can express.
 */
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

/**
 * Carries one shift from a day to another — the drag-and-drop write. Both
 * days change under a single undo step; dropping onto a day that already
 * holds the shift just removes it from the source, so dragging twice cannot
 * mint duplicates. Copying leaves the source alone.
 */
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

/**
 * Places specific templates on specific days — the import's write path. One
 * remember covers the lot, so a whole recognised month is one Cmd+Z. Days
 * already holding the template are left alone rather than doubled.
 */
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

    payload.shifts.push({
      shift_id: entry.templateId,
      worked: entry.date <= todayKey(),
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

  /**
   * Puts one palette entry on a run of days. Each day gets its own event
   * rather than one spanning the range: «английский» on Tuesday and Thursday
   * is two lessons and two prices, not a three-day event.
   */
  async paintEvent(keys: string[], template: EventTemplate) {
    if (keys.length === 0) return;

    for (const key of keys) {
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

  async deletePayout(id: number) {
    await calendarApi.deletePayout(id);
    void loadSummary();
  },
};

// ==== Helpers ====

function blankDay(date: string): CalendarDayData {
  return {
    date,
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

/**
 * A stand-in entry while the save is in flight. Hours and pay stay at zero
 * rather than guessed; the server's answer replaces it a moment later.
 */
function placeholderFor(template: ShiftTemplate, key: string): DayShiftEntry {
  return {
    shift_id: template.id,
    name: template.name,
    symbol: template.symbol,
    start_time: template.start_time,
    end_time: template.end_time,
    revenue: null,
    revenue_percent: template.revenue_percent,
    colour: template.effective_colour,
    hours: template.hours,
    earned: 0,
    // Matches the server's rule: a date already past is treated as worked.
    worked: key <= todayKey(),
    needs_cover: false,
    actual_start: null,
    actual_end: null,
    break_minutes: template.break_minutes,
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
      deductions: row.deductions ?? existing?.deductions ?? null,
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
