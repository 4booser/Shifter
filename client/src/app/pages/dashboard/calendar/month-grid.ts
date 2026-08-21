import { Component, computed, inject, signal } from '@angular/core';
import { TPipe } from '../../../core/i18n/i18n';

import {
  WEEKDAY_LABELS,
  todayKey,
  weekBounds,
  keysBetween as allKeys,
  WEEKDAY_LABELS_SUNDAY,
  keysBetween,
} from '../../../core/calendar/calendar-date';
import { CalendarStore, PAINT_SCOPES, PaintScope } from '../../../core/calendar/calendar-store';
import { MARK_COLOURS } from '../../../core/calendar/calendar.models';
import { SettingsStore } from '../../../core/settings/settings-store';
import { Icon } from '../../../shared/icon/icon';
import { MoneyPipe } from '../../../shared/money/money-pipe';

/** One line inside a calendar cell: a shift placed on the day, or an event. */
export interface CellEntry {
  kind: 'shift' | 'event';
  symbol: string;
  name: string;
  colour: string | null;
  /** A shift that has not been worked yet. Events are never planned. */
  planned: boolean;
  /** Null unless the person asked for times in cells. */
  time: string | null;
}

const MaxCellEntries = 3;

@Component({
  selector: 'app-month-grid',
  imports: [TPipe, Icon, MoneyPipe],
  templateUrl: './month-grid.html',
})
export class MonthGrid {
  private readonly store = inject(CalendarStore);
  private readonly settings = inject(SettingsStore);

  protected readonly weekdays = computed(() =>
    this.settings.mondayFirst() ? WEEKDAY_LABELS : WEEKDAY_LABELS_SUNDAY,
  );
  protected readonly view = this.store.view;
  protected readonly yearMonths = this.store.yearMonths;
  protected readonly showEarnings = this.settings.showEarningsInCells;

  /** What the current week has earned so far — the number checked most often. */
  protected readonly weekEarned = computed(() => {
    const { from, to } = weekBounds(todayKey());
    const days = this.store.days();

    return allKeys(from, to).reduce(
      (total, key) => total + (days.get(key)?.earned ?? 0),
      0,
    );
  });

  protected earned(key: string): number {
    return this.store.days().get(key)?.earned ?? 0;
  }

  protected setView(value: 'week' | 'month' | 'year'): void {
    this.settings.update('view', value);
  }

  /** Jumping to a month from the year overview. */
  protected openMonth(month: number): void {
    this.settings.update('view', 'month');
    this.store.goToMonth(month);
  }
  protected readonly weeks = this.store.weeks;
  protected readonly label = this.store.label;
  protected readonly selected = this.store.selectedDate;
  protected readonly brush = this.store.brush;
  protected readonly patternBrush = this.store.patternBrush;
  protected readonly colourBrush = this.store.colourBrush;
  protected readonly paintScope = this.store.paintScope;
  protected readonly scopes = PAINT_SCOPES;
  protected readonly colours = MARK_COLOURS;

  /** Any painting mode: all of them make a click change the day under it. */
  protected readonly painting = computed(
    () => this.brush() !== null || this.patternBrush() || this.colourBrush() !== null,
  );

  /** Open only while colouring; the palette is long and steals the calendar. */
  protected readonly colourBarOpen = signal(false);

  protected toggleColourBar(): void {
    const open = !this.colourBarOpen();

    this.colourBarOpen.set(open);

    // Leaving the bar drops the brush with it: a colour still armed behind a
    // closed panel is how a stray click repaints a week.
    if (!open) this.store.toggleColourBrush(null);
  }

  protected pickColour(colour: string | null): void {
    this.store.toggleColourBrush(colour);
  }

  protected setScope(scope: PaintScope): void {
    this.store.setPaintScope(scope);
  }

  /** Where the drag started; null when no drag is in progress. */
  private readonly anchor = signal<string | null>(null);
  protected readonly dragging = signal<ReadonlySet<string>>(new Set());

  protected previous(): void {
    this.store.previous();
  }

  protected next(): void {
    this.store.next();
  }

  protected today(): void {
    this.store.today();
  }

  protected clearBrush(): void {
    this.store.clearBrush();
  }

  /**
   * A drag only makes sense with a template picked. Pointer capture is
   * deliberately not taken: the grid needs pointerenter on the other cells to
   * keep firing as the finger or cursor moves across them.
   */
  protected onPointerDown(key: string, event: PointerEvent): void {
    this.store.select(key);

    if (!this.painting()) return;

    event.preventDefault();

    this.anchor.set(key);

    // A week or a month lights up from the first press rather than only once
    // the finger moves, so the scope is visible before anything is committed.
    this.dragging.set(new Set(this.spread([key])));
  }

  protected onPointerEnter(key: string): void {
    const from = this.anchor();

    if (from === null) return;

    this.dragging.set(new Set(this.spread(keysBetween(from, key))));
  }

  /**
   * The dates a gesture covers. Dragging picks a run of days; the scope then
   * widens each of them to its week or its month, so "week" plus a two-day
   * drag means both of those weeks rather than an argument about which one.
   */
  private spread(keys: string[]): string[] {
    if (this.colourBrush() === null || this.paintScope() === 'day') return keys;

    const widened = new Set<string>();

    for (const key of keys) {
      for (const day of this.store.scopeOf(key)) widened.add(day);
    }

    return [...widened];
  }

  /** Bound on the window so releasing outside the grid still commits. */
  protected onPointerUp(): void {
    const template = this.brush();
    const pattern = this.patternBrush();
    const colour = this.colourBrush();
    const keys = [...this.dragging()];

    this.anchor.set(null);
    this.dragging.set(new Set());

    if (keys.length === 0) return;

    if (template === null && !pattern && colour === null) return;

    // Opt-in guard: a stray drag over a month is easy to do by accident.
    if (keys.length > 1 && this.settings.confirmBulk()) {
      const what = colour !== null
        ? 'this colour'
        : template === null
          ? 'the weekly pattern'
          : `"${template.name}"`;

      if (!window.confirm(`Apply ${what} to ${keys.length} days?`)) return;
    }

    // The eraser is armed as an empty string so that "no brush" and "the brush
    // that removes colour" stay different states; the store only knows null.
    if (colour !== null) this.store.paintColour(keys, colour === '' ? null : colour);
    else if (template === null) this.store.paintPattern(keys);
    else this.store.applyToDates(keys, template);
  }

  protected isDragged(key: string): boolean {
    return this.dragging().has(key);
  }

  /**
   * Shifts and events as one list, because a cell has one strip of room and
   * they compete for it. Shifts lead: they are what the day is paid for.
   */
  protected entries(key: string): CellEntry[] {
    const day = this.store.days().get(key);
    const events = this.store.eventsByDate().get(key) ?? [];

    const shifts: CellEntry[] = (day?.shifts ?? []).map((entry) => ({
      kind: 'shift',
      symbol: entry.symbol ?? entry.name.slice(0, 1).toUpperCase() ?? '•',
      name: entry.name,
      colour: entry.colour,
      planned: !entry.worked,
      time: this.timeLabel(entry.start_time, entry.end_time),
    }));

    return shifts.concat(
      events.map((event) => ({
        kind: 'event',
        symbol: event.symbol ?? '•',
        name: event.name,
        colour: event.colour,
        planned: false,
        time: this.timeLabel(event.start_time, event.end_time),
      })),
    );
  }

  /**
   * Cells are small and a fourth line is what turns one into a smudge. Three
   * fit; anything beyond that is counted rather than listed, and the day panel
   * has the room to show them properly.
   */
  protected visibleEntries(key: string): CellEntry[] {
    const all = this.entries(key);

    return all.length > MaxCellEntries ? all.slice(0, MaxCellEntries) : all;
  }

  protected hiddenCount(key: string): number {
    return Math.max(0, this.entries(key).length - MaxCellEntries);
  }

  /** Honours the setting: nothing, when it starts, or the whole span. */
  private timeLabel(start: string | null, end: string | null): string | null {
    const mode = this.settings.cellTimes();

    if (mode === 'none' || start === null) return null;

    return mode === 'start' || end === null ? start : `${start}–${end}`;
  }

  /** The colour put on the day by hand, which overrides nothing else. */
  protected dayColour(key: string): string | null {
    return this.store.days().get(key)?.colour ?? null;
  }

  protected readonly dayFill = this.settings.dayFill;

  protected holidayName(key: string): string | null {
    return this.store.holidays().get(key)?.name ?? null;
  }

  /**
   * What the weekly pattern would place here, so the cells say what a click
   * will do before it does it.
   */
  protected patternHint(key: string): string | null {
    if (!this.patternBrush()) return null;

    return this.store.patternTemplateFor(key)?.name ?? null;
  }

  /** Planned hours matter too, so the cell shows whichever the day has. */
  protected hoursOf(key: string): number {
    const day = this.store.days().get(key);

    if (day === undefined) return 0;

    return day.shifts.reduce((total, entry) => total + entry.hours, 0);
  }


  /** Anything recorded beyond shifts: sales, tips or a note. */
  protected extras(key: string): boolean {
    const day = this.store.days().get(key);

    if (day === undefined) return false;

    return day.sales.length > 0 || (day.tips ?? 0) > 0 || !!day.note;
  }
}
