import { Service, computed, effect, inject, signal } from '@angular/core';

import { apiErrorMessage } from '../auth/api-error';
import { CalendarApi } from './calendar-api';
import { SettingsStore } from '../settings/settings-store';
import {
  YearMonth,
  addMonths,
  buildMonthGrid,
  buildWeekGrid,
  buildYearGrid,
  currentMonth,
  monthBounds,
  keysBetween,
  monthLabel,
  shiftDays,
  todayKey,
  weekBounds,
} from './calendar-date';
import {
  CalendarDayData,
  DayShiftEntry,
  DaySave,
  DaysResponse,
  EMPTY_SUMMARY,
  Payout,
  PayoutCreate,
  SalesCreate,
  SalesPosition,
  ShiftCreate,
  ShiftTemplate,
  WorkLocation,
  WorkLocationCreate,
  toSavePayload,
} from './calendar.models';

export type SummaryPeriod = 'month' | 'previous' | 'week' | 'all';

export const SUMMARY_PERIODS: { value: SummaryPeriod; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'previous', label: 'Last month' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' },
];

/** Wide enough to mean "everything" without the server needing a special case. */
const ALL_TIME = { from: '2000-01-01', to: '2099-12-31' };

@Service()
export class CalendarStore {
  private readonly api = inject(CalendarApi);
  private readonly settings = inject(SettingsStore);

  private readonly _month = signal<YearMonth>(currentMonth());
  private readonly _selectedDate = signal<string | null>(todayKey());
  private readonly _templates = signal<ShiftTemplate[]>([]);
  private readonly _positions = signal<SalesPosition[]>([]);
  private readonly _days = signal<ReadonlyMap<string, CalendarDayData>>(new Map());
  private readonly _summary = signal<DaysResponse>(EMPTY_SUMMARY);
  private readonly _summaryPeriod = signal<SummaryPeriod>('month');
  private readonly _brush = signal<ShiftTemplate | null>(null);
  private readonly _error = signal<string | null>(null);
  private readonly _saving = signal(false);
  private readonly _payouts = signal<Payout[]>([]);
  private readonly _locations = signal<WorkLocation[]>([]);

  readonly month = this._month.asReadonly();
  readonly selectedDate = this._selectedDate.asReadonly();
  /** Everything, archived included; the palette splits them. */
  readonly allTemplates = this._templates.asReadonly();
  readonly allPositions = this._positions.asReadonly();

  readonly templates = computed(() =>
    this._templates().filter((template) => !template.archived),
  );
  readonly positions = computed(() =>
    this._positions().filter((position) => !position.archived),
  );

  readonly archivedTemplates = computed(() =>
    this._templates().filter((template) => template.archived),
  );
  readonly archivedPositions = computed(() =>
    this._positions().filter((position) => position.archived),
  );
  readonly days = this._days.asReadonly();
  readonly summary = this._summary.asReadonly();
  readonly summaryPeriod = this._summaryPeriod.asReadonly();
  readonly brush = this._brush.asReadonly();
  readonly error = this._error.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly payouts = this._payouts.asReadonly();

  readonly locations = computed(() =>
    this._locations().filter((location) => !location.archived),
  );
  readonly archivedLocations = computed(() =>
    this._locations().filter((location) => location.archived),
  );

  readonly weeks = computed(() => {
    const mondayFirst = this.settings.mondayFirst();

    // Week view keeps the same cell shape, just one row of it, so the grid and
    // everything hanging off it stay identical.
    if (this.settings.view() === 'week') {
      return buildWeekGrid(this._selectedDate() ?? todayKey(), mondayFirst);
    }

    return buildMonthGrid(this._month(), mondayFirst);
  });

  readonly yearMonths = computed(() =>
    buildYearGrid(this._month().year, this.settings.mondayFirst()),
  );

  readonly view = computed(() => this.settings.view());
  readonly label = computed(() => monthLabel(this._month()));

  readonly selectedDay = computed(() => {
    const key = this._selectedDate();

    return key === null ? undefined : this._days().get(key);
  });

  /** Symbol per template id, so a day cell can label itself without a lookup. */
  readonly symbols = computed(() => {
    const map = new Map<number, string>();

    for (const template of this._templates()) {
      map.set(template.id, template.symbol ?? template.name.slice(0, 1).toUpperCase());
    }

    return map;
  });

  /** The grid spills into neighbouring months, so it is loaded, not just the month. */
  private readonly gridRange = computed(() => {
    if (this.settings.view() === 'year') {
      const year = this._month().year;

      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }

    const weeks = this.weeks();

    return { from: weeks[0][0].key, to: weeks[weeks.length - 1][6].key };
  });

  /**
   * The totals period is chosen independently of the calendar: people check
   * last month's earnings while planning the next one.
   */
  private readonly summaryRange = computed(() => {
    const month = this._month();
    const anchor = firstOfMonth(month);

    switch (this._summaryPeriod()) {
      case 'previous':
        return monthBounds(firstOfMonth(addMonths(month, -1)));
      case 'week':
        return weekBounds(todayKey());
      case 'all':
        return ALL_TIME;
      default:
        return monthBounds(anchor);
    }
  });

  constructor() {
    this.loadCatalogues();

    effect(() => {
      const { from, to } = this.gridRange();

      this.loadGrid(from, to);
    });

    effect(() => {
      const { from, to } = this.summaryRange();

      this.loadSummary(from, to);
    });
  }

  previous(): void {
    this._month.update((month) => addMonths(month, -1));
  }

  next(): void {
    this._month.update((month) => addMonths(month, 1));
  }

  today(): void {
    this._month.set(currentMonth());
    this._selectedDate.set(todayKey());
  }

  goToMonth(month: number): void {
    this._month.update((current) => ({ ...current, month }));
  }

  select(key: string): void {
    this._selectedDate.set(key);
  }

  /** The dates the totals cover, for anything that needs to name them. */
  summaryRangeValue(): { from: string; to: string } {
    return this.summaryRange();
  }

  /**
   * Repeats the week before the selected one onto it. Rotas often repeat by
   * habit rather than by formula, which no pattern generator can express.
   */
  copyPreviousWeek(): void {
    const anchor = this._selectedDate() ?? todayKey();
    const target = weekBounds(anchor);
    const source = weekBounds(shiftDays(target.from, -7));

    const targetDays = keysBetween(target.from, target.to);
    const sourceDays = keysBetween(source.from, source.to);

    const days = this._days();
    const byShift = new Map<number, string[]>();

    sourceDays.forEach((key, index) => {
      for (const entry of days.get(key)?.shifts ?? []) {
        const dates = byShift.get(entry.shift_id) ?? [];

        dates.push(targetDays[index]);
        byShift.set(entry.shift_id, dates);
      }
    });

    if (byShift.size === 0) {
      this._error.set('The week before this one has no shifts to copy.');

      return;
    }

    const templates = new Map(this._templates().map((t) => [t.id, t]));

    for (const [shiftId, dates] of byShift) {
      const template = templates.get(shiftId);

      // Archived templates are skipped: the server would reject them anyway.
      if (template === undefined || template.archived) continue;

      this.applyToDates(dates, template);
    }
  }

  createPayout(request: PayoutCreate, done: () => void): void {
    this._error.set(null);

    this.api.createPayout(request).subscribe({
      next: () => {
        this.reloadSummary();
        done();
      },
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  deletePayout(id: number): void {
    this._error.set(null);

    this.api.deletePayout(id).subscribe({
      next: () => this.reloadSummary(),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  setSummaryPeriod(period: SummaryPeriod): void {
    this._summaryPeriod.set(period);
  }

  /** Clicking the active template again drops out of painting mode. */
  toggleBrush(template: ShiftTemplate): void {
    this._brush.update((current) => (current?.id === template.id ? null : template));
  }

  clearBrush(): void {
    this._brush.set(null);
  }

  clearError(): void {
    this._error.set(null);
  }

  /** Single-cell paint, used when a click is not part of a drag. */
  paint(key: string): void {
    const template = this._brush();

    if (template !== null) this.applyToDates([key], template);
  }

  /** Used by the day panel, where the whole day is edited at once. */
  saveDay(key: string, request: DaySave): void {
    const rollback = this._days();

    this._saving.set(true);
    this._error.set(null);

    this.api.saveDay(key, request).subscribe({
      next: (day) => {
        this._saving.set(false);
        this._days.update((map) => new Map(map).set(key, day));
        this.reloadSummary();
      },
      error: (error: unknown) => {
        this._saving.set(false);
        this._days.set(rollback);
        this._error.set(apiErrorMessage(error));
      },
    });
  }

  /**
   * Applies a template across a set of dates in one request. Whether it adds or
   * removes follows the first date: dragging back over a filled run clears it.
   * Cells repaint immediately and roll back together if the call fails.
   */
  applyToDates(keys: string[], template: ShiftTemplate): void {
    if (keys.length === 0) return;

    const mode = this._days()
      .get(keys[0])
      ?.shifts.some((entry) => entry.shift_id === template.id)
      ? 'remove'
      : 'add';

    const rollback = this._days();

    this._days.update((map) => {
      const next = new Map(map);

      for (const key of keys) {
        const day = next.get(key);
        const current = day?.shifts ?? [];

        next.set(key, {
          date: key,
          shifts:
            mode === 'add'
              ? current.some((entry) => entry.shift_id === template.id)
                ? current
                : [...current, placeholderFor(template, key)]
              : current.filter((entry) => entry.shift_id !== template.id),
          sales: day?.sales ?? [],
          tips: day?.tips ?? null,
          note: day?.note ?? null,
          // Left at the previous value: the server owns the pay and hour
          // rules, and guessing them here is how the two drift.
          hours: day?.hours ?? 0,
          earned: day?.earned ?? 0,
          planned: day?.planned ?? 0,
        });
      }

      return next;
    });

    this._saving.set(true);
    this._error.set(null);

    this.api.bulk(keys, template.id, mode).subscribe({
      next: () => {
        this._saving.set(false);
        this.reload();
      },
      error: (error: unknown) => {
        this._saving.set(false);
        this._days.set(rollback);
        this._error.set(apiErrorMessage(error));
      },
    });
  }

  /** Create when id is null, otherwise update in place. */
  saveShift(request: ShiftCreate, id: number | null, done: () => void): void {
    this._error.set(null);

    const call = id === null
      ? this.api.createShift(request)
      : this.api.updateShift(id, request);

    call.subscribe({
      next: (template) => {
        this._templates.update((list) => replace(list, template));

        // Rates feed into every day the template sits on, so the totals and
        // the grid have to come back from the server after an edit.
        if (id !== null) this.reload();

        done();
      },
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  savePosition(request: SalesCreate, id: number | null, done: () => void): void {
    this._error.set(null);

    const call = id === null
      ? this.api.createSales(request)
      : this.api.updateSales(id, request);

    call.subscribe({
      next: (position) => {
        this._positions.update((list) => replace(list, position));
        done();
      },
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  archiveShift(id: number, archived: boolean): void {
    this._error.set(null);

    // An archived template cannot stay as the active brush.
    if (archived && this._brush()?.id === id) this._brush.set(null);

    this.api.archiveShift(id, archived).subscribe({
      next: (template) => this._templates.update((list) => replace(list, template)),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  archivePosition(id: number, archived: boolean): void {
    this._error.set(null);

    this.api.archiveSales(id, archived).subscribe({
      next: (position) => this._positions.update((list) => replace(list, position)),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  private reload(): void {
    const grid = this.gridRange();

    this.loadGrid(grid.from, grid.to);
    this.reloadSummary();
  }

  /** Totals span periods and cross-day rules, so they are refetched, not patched. */
  private reloadSummary(): void {
    const range = this.summaryRange();

    this.loadSummary(range.from, range.to);
  }

  private loadCatalogues(): void {
    this.api.shifts().subscribe({
      next: (templates) => this._templates.set(templates),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });

    this.api.sales().subscribe({
      next: (positions) => this._positions.set(positions),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });

    this.api.locations().subscribe({
      next: (locations) => this._locations.set(locations),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  saveLocation(request: WorkLocationCreate, id: number | null, done: () => void): void {
    this._error.set(null);

    const call = id === null
      ? this.api.createLocation(request)
      : this.api.updateLocation(id, request);

    call.subscribe({
      next: (location) => {
        this._locations.update((list) => replace(list, location));

        // A colour change repaints the calendar, which reads it off the shifts.
        if (id !== null) this.loadCatalogueShifts();

        done();
      },
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  archiveLocation(id: number, archived: boolean): void {
    this._error.set(null);

    this.api.archiveLocation(id, archived).subscribe({
      next: (location) => this._locations.update((list) => replace(list, location)),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  private loadCatalogueShifts(): void {
    this.api.shifts().subscribe({
      next: (templates) => this._templates.set(templates),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });

    this.reload();
  }

  private loadGrid(from: string, to: string): void {
    this.api.days(from, to).subscribe({
      next: (response) =>
        this._days.set(new Map(response.days.map((day) => [day.date, day]))),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  private loadSummary(from: string, to: string): void {
    this.api.days(from, to).subscribe({
      next: (response) => this._summary.set(response),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });

    this.api.payouts(from, to).subscribe({
      next: (payouts) => this._payouts.set(payouts),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }
}

function firstOfMonth({ year, month }: YearMonth): string {
  return `${year}-${`${month}`.padStart(2, '0')}-01`;
}

/** Swaps an updated item in, or appends it when it is new. */
function replace<T extends { id: number }>(list: T[], item: T): T[] {
  const index = list.findIndex((existing) => existing.id === item.id);

  if (index === -1) return [...list, item];

  const next = [...list];
  next[index] = item;

  return next;
}

/**
 * A stand-in entry while the save is in flight. Hours and pay stay at zero
 * rather than being guessed here; the server's answer replaces it a moment
 * later, and duplicating the rate rules is how the two drift apart.
 */
function placeholderFor(template: ShiftTemplate, key: string): DayShiftEntry {
  return {
    shift_id: template.id,
    name: template.name,
    symbol: template.symbol,
    start_time: template.start_time,
    end_time: template.end_time,
    colour: template.location_colour,
    hours: template.hours,
    earned: 0,
    // Matches the server's rule: a date already past is treated as worked.
    worked: key <= todayKey(),
  };
}
