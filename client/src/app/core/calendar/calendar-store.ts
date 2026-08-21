import { Service, computed, effect, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

import { apiErrorMessage } from '../auth/api-error';
import { CalendarApi } from './calendar-api';
import { OfflineQueue } from '../offline/offline-queue';
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
import { ColourScheme } from '../settings/settings-store';
import { holidaysInRange } from './holidays';
import {
  CalendarDayData,
  CalendarEvent,
  DayShiftEntry,
  DaySave,
  DaysResponse,
  EMPTY_SUMMARY,
  EventSave,
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

/** How much of the calendar one click of the colour brush covers. */
export type PaintScope = 'day' | 'week' | 'month';

export const PAINT_SCOPES: { value: PaintScope; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

@Service()
export class CalendarStore {
  private readonly api = inject(CalendarApi);
  private readonly settings = inject(SettingsStore);
  private readonly queue = inject(OfflineQueue);

  /** Month and weekday names follow the chosen language, like the rest of the UI. */
  private readonly locale = computed(() => this.settings.settings().language);

  private readonly _month = signal<YearMonth>(currentMonth());
  private readonly _selectedDate = signal<string | null>(todayKey());
  private readonly _templates = signal<ShiftTemplate[]>([]);
  private readonly _positions = signal<SalesPosition[]>([]);
  private readonly _days = signal<ReadonlyMap<string, CalendarDayData>>(new Map());
  private readonly _summary = signal<DaysResponse>(EMPTY_SUMMARY);
  private readonly _previousSummary = signal<DaysResponse>(EMPTY_SUMMARY);
  private readonly _summaryPeriod = signal<SummaryPeriod>('month');
  private readonly _brush = signal<ShiftTemplate | null>(null);
  private readonly _patternBrush = signal(false);
  private readonly _colourBrush = signal<string | null>(null);
  private readonly _paintScope = signal<PaintScope>('day');
  private readonly _events = signal<CalendarEvent[]>([]);
  private readonly _error = signal<string | null>(null);
  private readonly _saving = signal(false);
  private readonly _payouts = signal<Payout[]>([]);
  private readonly _locations = signal<WorkLocation[]>([]);
  private readonly _trend = signal<MonthTotal[]>([]);
  private readonly _undo = signal<UndoStep | null>(null);

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
  readonly patternBrush = this._patternBrush.asReadonly();
  readonly colourBrush = this._colourBrush.asReadonly();
  readonly paintScope = this._paintScope.asReadonly();
  readonly events = this._events.asReadonly();

  /**
   * Events spread across every day they cover, so a cell can ask one question.
   * Built once per change rather than filtered per cell: a month grid asks
   * forty-two times, and a fortnight of leave would be scanned each time.
   */
  readonly eventsByDate = computed(() => {
    const spread = new Map<string, CalendarEvent[]>();

    for (const event of this._events()) {
      for (const key of keysBetween(event.start_date, event.end_date)) {
        const existing = spread.get(key);

        if (existing === undefined) spread.set(key, [event]);
        else existing.push(event);
      }
    }

    return spread as ReadonlyMap<string, readonly CalendarEvent[]>;
  });

  /** Public holidays for whatever is on screen, or nothing when none is chosen. */
  readonly holidays = computed(() => {
    const { from, to } = this.gridRange();

    return holidaysInRange(this.settings.holidayCountry(), from, to);
  });
  readonly error = this._error.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly payouts = this._payouts.asReadonly();
  readonly trend = this._trend.asReadonly();
  /** The equivalent window just before the one on screen, for the arrows. */
  readonly previousSummary = this._previousSummary.asReadonly();

  /** The last reversible change, or null when there is nothing to take back. */
  readonly undoStep = this._undo.asReadonly();

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
    buildYearGrid(this._month().year, this.settings.mondayFirst(), this.locale()),
  );

  readonly view = computed(() => this.settings.view());
  readonly label = computed(() => monthLabel(this._month(), this.locale()));

  /**
   * Past days with a worked shift and nothing else recorded. Tips and sales are
   * entered at the end of a shift and are the easiest thing to forget, so the
   * dashboard nudges rather than letting the month quietly under-report.
   */
  readonly unclosedDays = computed(() => {
    const today = todayKey();

    return [...this._days().values()]
      .filter(
        (day) =>
          day.date < today &&
          day.shifts.some((entry) => entry.worked) &&
          (day.tips ?? 0) === 0 &&
          day.sales.length === 0,
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  });

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

    // Whatever the queue managed to send is now on the server; the grid on
    // screen still shows the local copy, so it is re-read.
    this.queue.flushed.subscribe(() => {
      const { from, to } = this.gridRange();

      this.loadGrid(from, to);
      this.reloadSummary();
    });

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

  /**
   * Jumps to a date from somewhere else in the app: moves the calendar to its
   * month and selects it, so the day panel opens on the right day rather than
   * on a date that is no longer in view.
   */
  openDate(key: string): void {
    this._month.set({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
    this._selectedDate.set(key);
  }

  /**
   * Six months of totals ending at the month on screen. One summary request per
   * month rather than one big range: overtime and period wages are computed per
   * range, so a single span would smear them across month boundaries.
   */
  loadTrend(): void {
    const anchor = this._month();
    const months = Array.from({ length: 6 }, (_, index) => addMonths(anchor, index - 5));

    forkJoin(
      months.map((month) => {
        const { from, to } = monthBounds(
          `${month.year}-${`${month.month}`.padStart(2, '0')}-01`,
        );

        return this.api.days(from, to);
      }),
    ).subscribe({
      next: (responses) =>
        this._trend.set(
          responses.map((response, index) => ({
            label: monthShortLabel(months[index], this.locale()),
            earned: response.total_earned,
            planned: response.planned_earned,
            hours: response.hours,
          })),
        ),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
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
    this._patternBrush.set(false);
    this._brush.update((current) => (current?.id === template.id ? null : template));
  }

  /**
   * The other painting mode: instead of one template everywhere, each day
   * takes whatever the weekly pattern puts on its weekday. Clicking the days
   * worked is then the whole interaction — no picking a shift first, and no
   * rotation arithmetic for anyone whose week is simply not the same twice.
   */
  togglePatternBrush(): void {
    this._brush.set(null);
    this._patternBrush.update((on) => !on);
  }

  clearBrush(): void {
    this._brush.set(null);
    this._patternBrush.set(false);
    this._colourBrush.set(null);
  }

  /**
   * The colour brush. Picking one puts the calendar into colouring mode, and
   * clicking the same swatch again drops out of it — the same gesture as the
   * shift palette, so there is one rule to learn rather than two.
   */
  toggleColourBrush(colour: string | null): void {
    this._brush.set(null);
    this._patternBrush.set(false);
    this._colourBrush.update((current) => (current === colour ? null : colour));
  }

  /** Whether a click paints the day, its week, or its whole month. */
  setPaintScope(scope: PaintScope): void {
    this._paintScope.set(scope);
  }

  /** The dates one click covers, given the scope in force. */
  scopeOf(key: string): string[] {
    const scope = this._paintScope();

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

  /**
   * Colours a set of days in one request. Repainting is optimistic — the cells
   * change under the finger and roll back together if the call fails, which is
   * the only way a month of colour feels like painting rather than waiting.
   */
  paintColour(keys: string[], colour: string | null): void {
    if (keys.length === 0) return;

    const rollback = this._days();

    this.remember('Coloured days', keys);

    this._days.update((map) => {
      const next = new Map(map);

      for (const key of keys) {
        const day = next.get(key);

        // A day with nothing on it and no colour is not worth inventing here;
        // the server creates the row, and the reload brings it back.
        if (day === undefined && colour === null) continue;

        next.set(key, { ...(day ?? blankDay(key)), colour });
      }

      return next;
    });

    this._saving.set(true);
    this._error.set(null);

    this.api.colourDays(keys.map((date) => ({ date, colour }))).subscribe({
      next: (days) => {
        this._saving.set(false);
        this._days.update((map) => {
          const next = new Map(map);

          for (const day of days) next.set(day.date, day);

          return next;
        });
      },
      error: (error: unknown) => {
        this._saving.set(false);
        this._days.set(rollback);
        this._error.set(apiErrorMessage(error));
      },
    });
  }

  /**
   * Lays a saved scheme over a stretch of dates. A weekday scheme asks each
   * date which day of the week it is; a cycle counts days from its start, so
   * it survives months of different lengths without drifting.
   */
  applyScheme(scheme: ColourScheme, keys: string[]): void {
    const days = keys
      .map((date) => ({ date, colour: schemeColourFor(scheme, date) }))
      .filter((entry) => entry.colour !== undefined) as
        { date: string; colour: string | null }[];

    if (days.length === 0) return;

    const rollback = this._days();

    this.remember('Applied a colour scheme', days.map((entry) => entry.date));

    this._days.update((map) => {
      const next = new Map(map);

      for (const entry of days) {
        const day = next.get(entry.date);

        if (day === undefined && entry.colour === null) continue;

        next.set(entry.date, { ...(day ?? blankDay(entry.date)), colour: entry.colour });
      }

      return next;
    });

    this._saving.set(true);
    this._error.set(null);

    this.api.colourDays(days).subscribe({
      next: (updated) => {
        this._saving.set(false);
        this._days.update((map) => {
          const next = new Map(map);

          for (const day of updated) next.set(day.date, day);

          return next;
        });
      },
      error: (error: unknown) => {
        this._saving.set(false);
        this._days.set(rollback);
        this._error.set(apiErrorMessage(error));
      },
    });
  }

  /** Which template the pattern would place on a given date, if any. */
  patternTemplateFor(key: string): ShiftTemplate | null {
    const weekday = new Date(`${key}T00:00:00`).getDay();
    const id = this.settings.weekdayShifts()[weekday];

    if (id === undefined) return null;

    return this._templates().find((template) => template.id === id) ?? null;
  }

  clearError(): void {
    this._error.set(null);
  }

  /** Single-cell paint, used when a click is not part of a drag. */
  paint(key: string): void {
    const template = this._brush() ?? (this._patternBrush() ? this.patternTemplateFor(key) : null);

    if (template !== null) this.applyToDates([key], template);
  }

  /**
   * A drag in pattern mode. The dates go out grouped by which template lands
   * on them — one request per distinct shift rather than one per day, and a
   * week of three different shifts costs three calls instead of seven.
   */
  paintPattern(keys: string[]): void {
    const byTemplate = new Map<number, { template: ShiftTemplate; dates: string[] }>();

    for (const key of keys) {
      const template = this.patternTemplateFor(key);

      // A weekday with nothing assigned is left alone rather than cleared:
      // dragging across a week should not wipe the days off in it.
      if (template === null) continue;

      const group = byTemplate.get(template.id);

      if (group === undefined) byTemplate.set(template.id, { template, dates: [key] });
      else group.dates.push(key);
    }

    for (const { template, dates } of byTemplate.values()) {
      this.applyToDates(dates, template);
    }
  }

  /**
   * The colour a person puts on a day by hand. Sent as a whole-day save like
   * everything else, on top of what the day already holds.
   */
  setDayColour(key: string, colour: string | null): void {
    const existing = this._days().get(key);

    this.saveDay(key, { ...toSavePayload(existing), colour });
  }

  saveEvent(request: EventSave, id: number | null, done: () => void): void {
    this._error.set(null);
    this._saving.set(true);

    const call = id === null
      ? this.api.createEvent(request)
      : this.api.updateEvent(id, request);

    call.subscribe({
      next: (event) => {
        this._saving.set(false);

        // Replace in place when it existed, so an edit that moves an event out
        // of the month on screen disappears from it rather than lingering.
        this._events.update((list) =>
          id === null ? [...list, event] : list.map((item) => (item.id === id ? event : item)),
        );

        done();
      },
      error: (error: unknown) => {
        this._saving.set(false);
        this._error.set(apiErrorMessage(error));
      },
    });
  }

  deleteEvent(id: number): void {
    this._error.set(null);

    this.api.deleteEvent(id).subscribe({
      next: () => this._events.update((list) => list.filter((item) => item.id !== id)),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  /**
   * Writes imported rows one day at a time. Sequential rather than parallel:
   * the API upserts per date, and a burst of parallel writes is exactly the
   * shape that trips the rate limiter. Returns how many actually landed.
   */
  async importDays(
    rows: {
      date: string;
      shift: string | null;
      tips: number | null;
      tipsCash: number | null;
      deductions: number | null;
      note: string | null;
    }[],
  ): Promise<number> {
    const byName = new Map(
      this._templates().map((template) => [template.name.toLowerCase(), template]),
    );

    let written = 0;

    for (const row of rows) {
      const template = row.shift === null ? null : byName.get(row.shift.toLowerCase());

      // The existing day is the base, so importing tips onto a day that
      // already has shifts on it does not wipe them.
      const existing = this._days().get(row.date);

      const payload: DaySave = {
        ...toSavePayload(existing),
        shifts: template === undefined || template === null
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
        const day = await new Promise<CalendarDayData>((resolve, reject) => {
          this.api.saveDay(row.date, payload).subscribe({ next: resolve, error: reject });
        });

        this._days.update((map) => new Map(map).set(row.date, day));
        written += 1;
      } catch (error: unknown) {
        this._error.set(apiErrorMessage(error));

        break;
      }
    }

    if (written > 0) this.reloadSummary();

    return written;
  }

  /** Used by the day panel, where the whole day is edited at once. */
  saveDay(key: string, request: DaySave): void {
    const rollback = this._days();

    this.remember('Edited a day', [key]);

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

        // A connection failure is not the user's mistake, and their day is not
        // theirs to lose: it goes to the queue and the cell keeps what they
        // typed. Anything the server actually answered is a real error and
        // does roll back.
        if (isOffline(error)) {
          void this.queue.enqueue(key, request);

          return;
        }

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

    this.remember('Painted shifts', keys);

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
          tips_cash: day?.tips_cash ?? null,
          tip_out: day?.tip_out ?? 0,
          deductions: day?.deductions ?? 0,
          note: day?.note ?? null,
          // Painting shifts says nothing about the colour someone put on the
          // day, so it survives the repaint.
          colour: day?.colour ?? null,
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
  /**
   * Keeps what the given days looked like before they are changed. Only one
   * step deep: a full history would need the server to agree about ordering,
   * and one level covers the mistake people actually make — the last one.
   */
  private remember(label: string, keys: string[]): void {
    const days = this._days();

    this._undo.set({
      label,
      entries: keys.map((date) => ({ date, payload: toSavePayload(days.get(date)) })),
    });
  }

  /** Puts the remembered days back, one request each, and clears the step. */
  async undo(): Promise<void> {
    const step = this._undo();

    if (step === null) return;

    this._undo.set(null);
    this._saving.set(true);

    for (const entry of step.entries) {
      try {
        const day = await new Promise<CalendarDayData>((resolve, reject) => {
          this.api.saveDay(entry.date, entry.payload).subscribe({ next: resolve, error: reject });
        });

        this._days.update((map) => new Map(map).set(entry.date, day));
      } catch (error: unknown) {
        this._error.set(apiErrorMessage(error));

        break;
      }
    }

    this._saving.set(false);
    this.reloadSummary();
  }

  /** Drops the offer without touching anything. */
  dismissUndo(): void {
    this._undo.set(null);
  }

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

  /** The server refuses when history points at it, and says so. */
  /**
   * `onConflict` fires when the server refuses because templates still use the
   * place. The caller decides what to offer next, rather than the store
   * guessing — the second attempt destroys history and is not the store's call.
   */
  deleteLocation(id: number, detach = false, onConflict?: (message: string) => void): void {
    this._error.set(null);

    this.api.deleteLocation(id, detach).subscribe({
      next: () => {
        this._locations.update((list) => list.filter((item) => item.id !== id));

        // The templates that pointed at it lost their colour and rules, and
        // the calendar reads both off them.
        if (detach) {
          this.loadCatalogueShifts();
          this.reload();
        }
      },
      error: (error: unknown) => {
        const message = apiErrorMessage(error);

        if (onConflict !== undefined && isConflict(error)) {
          onConflict(message);

          return;
        }

        this._error.set(message);
      },
    });
  }

  deletePosition(id: number): void {
    this._error.set(null);

    this.api.deleteSales(id).subscribe({
      next: () =>
        this._positions.update((list) => list.filter((item) => item.id !== id)),
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
      next: (response) => {
        this._days.set(new Map(response.days.map((day) => [day.date, day])));
        this._events.set(response.events);
      },
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }

  private loadSummary(from: string, to: string): void {
    this.api.days(from, to).subscribe({
      next: (response) => this._summary.set(response),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });

    // The window of the same length immediately before, so every figure on
    // screen can say which way it moved. A failure here only costs the arrows.
    const span = keysBetween(from, to).length;
    const previousTo = shiftDays(from, -1);

    this.api.days(shiftDays(previousTo, -(span - 1)), previousTo).subscribe({
      next: (response) => this._previousSummary.set(response),
      error: () => this._previousSummary.set(EMPTY_SUMMARY),
    });

    this.api.payouts(from, to).subscribe({
      next: (payouts) => this._payouts.set(payouts),
      error: (error: unknown) => this._error.set(apiErrorMessage(error)),
    });
  }
}

/**
 * Status 0 is a request that never reached anyone; 503 is what the service
 * worker answers with when it has nothing cached. Both mean "no network",
 * as opposed to a server that considered the request and refused it.
 */
export interface UndoStep {
  label: string;
  /** What those days looked like before the change. */
  entries: { date: string; payload: DaySave }[];
}

function isOffline(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;

  return status === 0 || status === 503 || !navigator.onLine;
}

/**
 * A day the calendar knows nothing about yet. Used only to hold a colour while
 * the request is in flight — every figure on it is left at zero because the
 * server owns them, and the reload replaces the whole thing regardless.
 */
function blankDay(date: string): CalendarDayData {
  return {
    date,
    shifts: [],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    hours: 0,
    earned: 0,
    planned: 0,
  };
}

/**
 * What a scheme puts on a given date, or undefined when it says nothing about
 * it — which is different from saying "no colour". A weekday with nothing
 * assigned is left exactly as it was; only an explicit null clears.
 */
export function schemeColourFor(scheme: ColourScheme, date: string): string | null | undefined {
  if (scheme.kind === 'weekday') {
    const weekday = new Date(`${date}T00:00:00`).getDay();

    return scheme.byWeekday[weekday];
  }

  const length = scheme.cycle.length;

  if (length === 0) return undefined;

  // Counted in whole days from the start rather than in weeks, so a rotation
  // that is not a multiple of seven does not drift as months change length.
  const start = Date.parse(`${scheme.cycleFrom}T00:00:00Z`);
  const here = Date.parse(`${date}T00:00:00Z`);
  const offset = Math.round((here - start) / 86_400_000);

  // Modulo that stays positive before the start date, so a cycle laid over
  // earlier days repeats backwards rather than falling off the front.
  return scheme.cycle[((offset % length) + length) % length];
}

/** The server saying "not like that" rather than "no": there is a way through. */
function isConflict(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 409;
}

export interface MonthTotal {
  label: string;
  earned: number;
  planned: number;
  hours: number;
}

function monthShortLabel({ year, month }: YearMonth, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(
    new Date(year, month - 1, 1),
  );
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
    needs_cover: false,
  };
}
