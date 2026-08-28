'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  WEEKDAY_LABELS,
  WEEKDAY_LABELS_SUNDAY,
  buildMonthGrid,
  buildWeekGrid,
  buildYearGrid,
  keysBetween,
  monthLabel,
  todayKey,
  weekBounds,
} from '@/lib/calendar/calendar-date';
import { readableInk } from '@/lib/calendar/contrast';
import { spokenDay } from '@/lib/calendar/spoken';
import { holidaysInRange } from '@/lib/calendar/holidays';
import { MARK_COLOURS } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import {
  applyToDates,
  calendarActions,
  catalogueActions,
  clearShifts,
  moveShift,
  paintColour,
  paintPattern,
  patternTemplateFor,
  scopeOf,
  useCalendar,
} from '@/lib/store/calendar';
import { shiftDays } from '@/lib/calendar/calendar-date';
import { Icon } from '@/components/ui/icon';

/** One line inside a calendar cell: a shift placed on the day, or an event. */
interface CellEntry {
  kind: 'shift' | 'event';
  /** Set on shifts, so one can be picked up and carried to another day. */
  shiftId: number | null;
  symbol: string;
  name: string;
  colour: string | null;
  planned: boolean;
  time: string | null;
}

const MAX_CELL_ENTRIES = 3;

const SCOPES = [
  { value: 'day' as const, label: 'Day' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
];

export function MonthGrid({
  onSearch,
  onSettings,
}: {
  onSearch?: () => void;
  onSettings?: () => void;
}) {
  const { t, lang } = useI18n();
  const { format } = useMoney();
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const state = useCalendar();

  const [anchor, setAnchor] = useState<string | null>(null);
  const [dragging, setDragging] = useState<ReadonlySet<string>>(new Set());
  const [colourBarOpen, setColourBarOpen] = useState(false);

  /** A shift being carried between days; null when nothing is in the air. */
  const [carry, setCarry] = useState<{ from: string; shiftId: number; name: string; colour: string | null } | null>(null);
  const [carryOver, setCarryOver] = useState<string | null>(null);
  const carryGhost = useRef<HTMLDivElement>(null);
  const carryCandidate = useRef<{ from: string; shiftId: number; name: string; colour: string | null; x: number; y: number; holdTimer: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const weekdays = settings.mondayFirst ? WEEKDAY_LABELS : WEEKDAY_LABELS_SUNDAY;
  const painting =
    state.brush !== null || state.eventBrush !== null || state.patternBrush || state.colourBrush !== null;

  const weeks = useMemo(
    () =>
      settings.view === 'week'
        ? buildWeekGrid(state.selectedDate ?? todayKey(), settings.mondayFirst)
        : buildMonthGrid(state.month, settings.mondayFirst),
    [settings.view, settings.mondayFirst, state.selectedDate, state.month],
  );

  const yearMonths = useMemo(
    () => (settings.view === 'year' ? buildYearGrid(state.month.year, settings.mondayFirst, lang) : []),
    [settings.view, state.month.year, settings.mondayFirst, lang],
  );

  const holidays = useMemo(() => {
    const from = weeks[0]?.[0]?.key ?? todayKey();
    const to = weeks.at(-1)?.[6]?.key ?? todayKey();

    return holidaysInRange(
      settings.holidayCountry,
      settings.view === 'year' ? `${state.month.year}-01-01` : from,
      settings.view === 'year' ? `${state.month.year}-12-31` : to,
    );
  }, [settings.holidayCountry, settings.view, weeks, state.month.year]);

  /**
   * Events spread across every day they cover, built once per change: a month
   * grid asks forty-two times, and a fortnight of leave would be scanned each
   * time otherwise.
   */
  const eventsByDate = useMemo(() => {
    const spread = new Map<string, { symbol: string; name: string; colour: string; time: string | null }[]>();

    for (const event of state.events) {
      for (const key of keysBetween(event.start_date, event.end_date)) {
        const list = spread.get(key) ?? [];

        list.push({
          symbol: event.symbol ?? '•',
          name: event.name,
          colour: event.colour,
          time: timeLabel(settings.cellTimes, event.start_time, event.end_time),
        });
        spread.set(key, list);
      }
    }

    return spread;
  }, [state.events, settings.cellTimes]);

  /** What the current week has earned so far — the number checked most often. */
  const weekEarned = useMemo(() => {
    const { from, to } = weekBounds(todayKey());

    return keysBetween(from, to).reduce((total, key) => total + (state.days.get(key)?.earned ?? 0), 0);
  }, [state.days]);

  const entries = (key: string): CellEntry[] => {
    const day = state.days.get(key);

    const shifts: CellEntry[] = (day?.shifts ?? []).map((entry) => ({
      kind: 'shift',
      shiftId: entry.shift_id,
      symbol: entry.symbol ?? entry.name.slice(0, 1).toUpperCase(),
      name: entry.name,
      colour: entry.colour,
      planned: !entry.worked,
      time: timeLabel(settings.cellTimes, entry.start_time, entry.end_time),
    }));

    return shifts.concat(
      (eventsByDate.get(key) ?? []).map((event) => ({
        kind: 'event',
        shiftId: null,
        symbol: event.symbol,
        name: event.name,
        colour: event.colour,
        planned: false,
        time: event.time,
      })),
    );
  };

  /** The dates a gesture covers, widened by the paint scope while colouring. */
  const spread = (keys: string[]): string[] => {
    if (state.colourBrush === null || state.paintScope === 'day') return keys;

    const widened = new Set<string>();

    for (const key of keys) for (const day of scopeOf(key)) widened.add(day);

    return [...widened];
  };

  const onPointerDown = (key: string, event: React.PointerEvent) => {
    if (!painting) {
      // Cmd-click grows a selection; Shift-click spans from the current day.
      if (event.metaKey || event.ctrlKey) {
        calendarActions.toggleMultiSelect(key);

        return;
      }

      if (event.shiftKey) {
        calendarActions.rangeSelect(key);

        return;
      }

      calendarActions.clearMultiSelect();
      calendarActions.select(key);

      return;
    }

    calendarActions.select(key);
    event.preventDefault();
    setAnchor(key);
    setDragging(new Set(spread([key])));
  };

  const onPointerEnter = (key: string) => {
    if (anchor === null) return;

    setDragging(new Set(spread(keysBetween(anchor, key))));
  };

  const onPointerUp = () => {
    const { brush, eventBrush, patternBrush, colourBrush } = state;
    const keys = [...dragging];

    setAnchor(null);
    setDragging(new Set());

    if (keys.length === 0) return;
    if (brush === null && eventBrush === null && !patternBrush && colourBrush === null) return;

    // Opt-in guard: a stray drag over a month is easy to do by accident.
    if (keys.length > 1 && settings.confirmBulk) {
      const what =
        colourBrush !== null
          ? t('this colour')
          : eventBrush !== null
            ? `"${eventBrush.name}"`
            : brush === null
              ? t('the weekly pattern')
              : `"${brush.name}"`;

      if (!window.confirm(`${t('Apply')} ${what} → ${keys.length} ${t('days')}?`)) return;
    }

    // The eraser is armed as an empty string so "no brush" and "the brush that
    // removes colour" stay different states; the store only knows null.
    if (colourBrush !== null) void paintColour(keys, colourBrush === '' ? null : colourBrush);
    else if (eventBrush !== null) void catalogueActions.paintEvent(keys, eventBrush);
    else if (brush === null) paintPattern(keys);
    else void applyToDates(keys, brush);
  };

  // The carry gesture lives on the window: a shift picked up in one cell is
  // dropped wherever the pointer lets go, and a ghost chip rides along.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const candidate = carryCandidate.current;

      if (candidate !== null && carry === null) {
        const distance = Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y);

        // A mouse commits by moving; a finger that moves early is scrolling.
        if (event.pointerType === 'touch' && distance > 12) {
          clearTimeout(candidate.holdTimer);
          carryCandidate.current = null;

          return;
        }

        if (event.pointerType !== 'touch' && distance > 7) {
          setCarry(candidate);
          carryCandidate.current = null;
        }
      }

      const ghost = carryGhost.current;

      if (ghost !== null) {
        ghost.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 8}px)`;
      }

      // Touch never fires enter on the cells underneath; hit-test instead.
      if (carry !== null && event.pointerType === 'touch') {
        const cell = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>('[data-day]');

        setCarryOver(cell?.dataset['day'] ?? null);
      }
    };

    const up = (event: PointerEvent) => {
      const candidate = carryCandidate.current;

      if (candidate !== null) {
        clearTimeout(candidate.holdTimer);
        carryCandidate.current = null;
      }

      if (carry !== null) {
        if (carryOver !== null && carryOver !== carry.from) {
          void moveShift(carry.from, carryOver, carry.shiftId, event.altKey);
        }

        setCarry(null);
        setCarryOver(null);
      }
    };

    const cancel = () => {
      if (carryCandidate.current !== null) {
        clearTimeout(carryCandidate.current.holdTimer);
        carryCandidate.current = null;
      }

      setCarry(null);
      setCarryOver(null);
    };

    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);

    return () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
    };
  }, [carry, carryOver]);

  const pickUp = (key: string, entry: CellEntry, event: React.PointerEvent) => {
    if (painting || entry.kind !== 'shift' || entry.shiftId === null) return;

    const candidate = {
      from: key,
      shiftId: entry.shiftId,
      name: entry.name,
      colour: entry.colour,
      x: event.clientX,
      y: event.clientY,
      // A held finger commits without moving; 350ms reads as intent.
      holdTimer: window.setTimeout(() => {
        if (carryCandidate.current === candidate) {
          setCarry(candidate);
          carryCandidate.current = null;
        }
      }, 350),
    };

    carryCandidate.current = candidate;
  };

  /** Keyboard drives the grid: arrows walk days, digits place shifts. */
  const onGridKeyDown = (event: React.KeyboardEvent) => {
    const key = state.selectedDate ?? todayKey();

    const go = (next: string) => {
      event.preventDefault();
      calendarActions.clearMultiSelect();

      const inGrid = weeks.some((week) => week.some((day) => day.key === next));

      if (inGrid) calendarActions.select(next);
      else calendarActions.openDate(next);

      requestAnimationFrame(() =>
        gridRef.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus(),
      );
    };

    switch (event.key) {
      case 'ArrowLeft': return go(shiftDays(key, -1));
      case 'ArrowRight': return go(shiftDays(key, 1));
      case 'ArrowUp': return go(shiftDays(key, -7));
      case 'ArrowDown': return go(shiftDays(key, 7));
      case 'Escape':
        calendarActions.clearMultiSelect();
        calendarActions.clearBrush();

        return;
      case 't':
      case 'T':
        event.preventDefault();
        calendarActions.today();

        return;
      case 'Backspace':
      case 'Delete': {
        const targets = state.multiSelected.size > 1 ? [...state.multiSelected] : [key];
        const filled = targets.filter((date) => (state.days.get(date)?.shifts.length ?? 0) > 0);

        if (filled.length === 0) return;

        event.preventDefault();

        if (window.confirm(`${t('Clear shifts on')} ${filled.length} ${t('days')}?`)) {
          void clearShifts(filled);
        }

        return;
      }
      default: {
        // 1..9 place the n-th shift from the sidebar on the selection.
        const index = Number(event.key);

        if (!Number.isInteger(index) || index < 1) return;

        const template = state.templates.filter((item) => !item.archived)[index - 1];

        if (template === undefined) return;

        event.preventDefault();

        const targets = state.multiSelected.size > 1 ? [...state.multiSelected] : [key];

        void applyToDates(targets, template);
      }
    }
  };

  const dayColour = (key: string) => state.days.get(key)?.colour ?? null;

  const hoursOf = (key: string) =>
    (state.days.get(key)?.shifts ?? []).reduce((total, entry) => total + entry.hours, 0);

  const extras = (key: string) => {
    const day = state.days.get(key);

    return day !== undefined && (day.sales.length > 0 || (day.tips ?? 0) > 0 || !!day.note);
  };

  /** A horizontal flick on touch turns the page; painting and carrying win. */
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (event: React.TouchEvent) => {
    if (painting || carry !== null) return;

    swipe.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const from = swipe.current;

    swipe.current = null;

    if (from === null || painting || carry !== null) return;

    const dx = event.changedTouches[0].clientX - from.x;
    const dy = event.changedTouches[0].clientY - from.y;

    if (Math.abs(dx) < 64 || Math.abs(dy) > 48) return;

    if (dx < 0) calendarActions.next();
    else calendarActions.previous();
  };

  return (
    <section
      className="card min-w-0 p-3 sm:p-4"
      onPointerUp={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ==== Toolbar ==== */}
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-[1.15rem] font-bold capitalize tracking-tight">
          {monthLabel(state.month, lang)}
        </h2>

        {weekEarned > 0 && (
          <span className="chip border-good/30 bg-(--good-soft) text-good">
            {t('This week')}: {format(weekEarned)}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="seg">
            {(['week', 'month', 'year'] as const).map((view) => (
              <button
                key={view}
                type="button"
                className={`seg-btn ${settings.view === view ? 'is-active' : ''}`}
                onClick={() => update('view', view)}
              >
                {t(view === 'week' ? 'Week' : view === 'month' ? 'Month' : 'Year')}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`btn btn-sm ${colourBarOpen ? 'btn-primary' : ''}`}
            onClick={() => {
              setColourBarOpen((open) => !open);

              // Leaving the bar drops the brush with it: a colour still armed
              // behind a closed panel is how a stray click repaints a week.
              if (colourBarOpen) calendarActions.toggleColourBrush(null);
            }}
          >
            <Icon name="brush" size={14} />
            {t('Colour')}
          </button>

          <button type="button" className="btn btn-sm" onClick={calendarActions.today}>
            {t('Today')}
          </button>

          {onSearch && (
            <button type="button" className="btn btn-sm" onClick={onSearch} title="⌘K">
              <Icon name="search" size={14} />
            </button>
          )}
          {onSettings && (
            <button type="button" className="btn btn-sm" onClick={onSettings} aria-label={t('Settings')}>
              <Icon name="sliders" size={14} />
              <span className="hidden sm:inline">{t('Settings')}</span>
            </button>
          )}

          <button type="button" className="btn btn-sm px-2" aria-label={t('Previous')} onClick={calendarActions.previous}>
            <Icon name="chevron-left" size={16} />
          </button>
          <button type="button" className="btn btn-sm px-2" aria-label={t('Next')} onClick={calendarActions.next}>
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      </header>

      {/* ==== Colour bar ==== */}
      {colourBarOpen && (
        <div className="rise mb-3 flex flex-wrap items-center gap-3 rounded-(--radius) border border-border bg-surface-2 p-2.5">
          <div className="seg">
            {SCOPES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`seg-btn ${state.paintScope === option.value ? 'is-active' : ''}`}
                onClick={() => calendarActions.setPaintScope(option.value)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MARK_COLOURS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`swatch ${state.colourBrush === option.value ? 'is-active' : ''}`}
                style={{ background: option.value }}
                title={option.label}
                aria-pressed={state.colourBrush === option.value}
                onClick={() => calendarActions.toggleColourBrush(option.value)}
              />
            ))}
            {/* Clearing is a colour you can paint with. */}
            <button
              type="button"
              className={`swatch grid place-items-center border border-border-strong bg-surface text-muted ${
                state.colourBrush === '' ? 'is-active' : ''
              }`}
              title={t('Erase')}
              onClick={() => calendarActions.toggleColourBrush('')}
            >
              <Icon name="close" size={12} />
            </button>
          </div>

          {state.colourBrush !== null && (
            <span className="field-hint">
              {t(state.colourBrush === '' ? 'Click to clear' : 'Click to paint')}
            </span>
          )}
        </div>
      )}

      {/* ==== Brush banner ==== */}
      {state.eventBrush !== null && (
        <p className="field-hint mt-1">
          {t('Placing')} <strong>{state.eventBrush.name}</strong> —{' '}
          {t('click a day, or drag across several')}
        </p>
      )}

      {(state.brush !== null || state.patternBrush) && (
        <p className="rise mb-3 flex flex-wrap items-center gap-2 rounded-(--radius) border border-(--accent)/40 bg-(--accent-soft) px-3 py-2 text-[0.85rem]">
          <Icon name="brush" size={14} />
          {state.brush !== null ? (
            <>
              {t('Placing')} <strong>{state.brush.name}</strong> — {t('click a day, or drag across several')}
            </>
          ) : (
            <>{t('Placing the weekly pattern')} — {t('click the days you work and each takes its own shift')}</>
          )}
          <button type="button" className="btn btn-sm ml-auto" onClick={calendarActions.clearBrush}>
            <Icon name="check" size={13} />
            {t('Done')}
          </button>
        </p>
      )}

      {/* ==== Year view ==== */}
      {settings.view === 'year' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {yearMonths.map((month) => (
            <button
              key={month.month}
              type="button"
              className="card p-3 text-left transition-transform hover:-translate-y-0.5"
              onClick={() => {
                update('view', 'month');
                calendarActions.goToMonth(month.month);
              }}
            >
              <span className="mb-2 block text-[0.85rem] font-semibold capitalize">{month.label}</span>
              <span className="grid grid-cols-7 gap-[3px]">
                {month.weeks.flat().map((day) => {
                  const mark = dayColour(day.key) ?? entries(day.key)[0]?.colour;
                  const earned = state.days.get(day.key)?.earned ?? 0;

                  return (
                    <span
                      key={day.key}
                      role="button"
                      title={earned > 0 ? `${day.key.slice(8)}.${day.key.slice(5, 7)} · ${format(earned)}` : undefined}
                      className={`h-2 w-2 rounded-[3px] ${day.inCurrentMonth ? '' : 'opacity-25'} hover:outline hover:outline-1 hover:outline-(--accent)`}
                      style={{
                        background:
                          entries(day.key).length > 0 || dayColour(day.key)
                            ? (mark ?? 'var(--accent)')
                            : 'var(--surface-2)',
                        outline: day.isToday ? '1.5px solid var(--accent)' : undefined,
                      }}
                      onClick={(event) => {
                        // The month card underneath also navigates; the day wins.
                        event.stopPropagation();
                        update('view', 'month');
                        calendarActions.openDate(day.key);
                      }}
                    />
                  );
                })}
              </span>
            </button>
          ))}
        </div>
      ) : (
        /* ==== Month / week grid ==== */
        <div
          key={`${state.month.year}-${state.month.month}-${settings.view}`}
          ref={gridRef}
          role="grid"
          aria-label={monthLabel(state.month, lang)}
          className="grid grid-cols-7 gap-1 sm:gap-1.5"
          onKeyDown={onGridKeyDown}
        >
          {weekdays.map((name) => (
            <div
              key={name}
              className={`px-1 pb-1 text-center text-[0.7rem] font-semibold uppercase tracking-wide ${
                settings.highlightWeekends && (name === 'Sat' || name === 'Sun') ? 'text-warn' : 'text-faint'
              }`}
            >
              {t(name)}
            </div>
          ))}

          {weeks.flat().map((day, cellIndex) => {
            const colour = dayColour(day.key);
            const ink = colour === null ? null : readableInk(colour);
            const list = entries(day.key);
            const visible = list.slice(0, MAX_CELL_ENTRIES);
            const hidden = list.length - visible.length;
            const holiday = holidays.get(day.key)?.name ?? null;
            const hours = hoursOf(day.key);
            const selected = day.key === state.selectedDate;
            const picked = state.multiSelected.has(day.key);
            const carryTarget = carry !== null && carryOver === day.key && day.key !== carry.from;
            const dragged = dragging.has(day.key) || carryTarget;
            const weekend = settings.highlightWeekends && isWeekend(day.key);
            const patternHint =
              state.patternBrush && list.length === 0 ? patternTemplateFor(day.key)?.name ?? null : null;
            const fill = settings.dayFill;

            return (
              <button
                key={day.key}
                type="button"
                title={holiday ?? undefined}
                // The whole day in one sentence. A screen reader used to read
                // the painted fragments in whatever order they landed, which
                // is a decoration of a day rather than a day.
                aria-label={spokenDay({
                  date: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(
                    new Date(`${day.key}T12:00:00`),
                  ),
                  entries: list.map((entry) => entry.name),
                  hours: hours > 0 ? `${Math.round(hours * 10) / 10} ${t('h')}` : null,
                  earned:
                    settings.hideAmounts || (state.days.get(day.key)?.earned ?? 0) <= 0
                      ? null
                      : format(state.days.get(day.key)!.earned),
                  holiday,
                  selected,
                }).join(' · ')}
                aria-pressed={selected}
                aria-selected={picked || selected}
                data-day={day.key}
                tabIndex={selected ? 0 : -1}
                className={`group cell-in relative flex min-h-[4.6rem] flex-col gap-0.5 overflow-hidden rounded-(--radius) border p-1 text-left transition-all sm:min-h-(--cell-min) sm:p-(--pad-cell) ${
                  day.inCurrentMonth ? '' : 'opacity-45'
                } ${dragged ? 'scale-[0.97] border-(--accent) ring-2 ring-(--ring)' : picked ? 'border-(--accent) bg-(--accent-soft)' : selected ? 'ring-pulse border-(--accent)' : 'border-transparent hover:border-border-strong'} ${
                  painting ? 'cursor-crosshair' : ''
                }`}
                style={{
                  ...({ '--i': cellIndex } as React.CSSProperties),
                  background:
                    colour !== null && (fill === 'full' || fill === 'wash')
                      ? fill === 'full'
                        ? colour
                        : `color-mix(in srgb, ${colour} 22%, var(--surface))`
                      : weekend
                        ? 'var(--surface-2)'
                        : 'var(--surface)',
                  color: colour !== null && fill === 'full' ? (ink ?? undefined) : undefined,
                  boxShadow: colour !== null && fill === 'outline' ? `inset 0 0 0 2px ${colour}` : undefined,
                }}
                onPointerDown={(event) => onPointerDown(day.key, event)}
                onPointerEnter={() => {
                  onPointerEnter(day.key);

                  if (carry !== null) setCarryOver(day.key);
                }}
              >
                {/* The quieter day-colour treatments. */}
                {colour !== null && fill === 'edge' && (
                  <span className="absolute inset-y-0 left-0 w-1" style={{ background: colour }} />
                )}
                {colour !== null && fill === 'underline' && (
                  <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: colour }} />
                )}
                {colour !== null && fill === 'corner' && (
                  <span
                    className="absolute right-0 top-0 h-0 w-0 border-l-[14px] border-t-[14px] border-l-transparent"
                    style={{ borderTopColor: colour }}
                  />
                )}

                <span className="flex items-center gap-1">
                  <span
                    className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[0.78rem] font-semibold tabular ${
                      day.isToday ? 'text-(--accent-ink)' : ''
                    }`}
                    style={day.isToday ? { background: 'var(--accent)' } : undefined}
                  >
                    {day.dayOfMonth}
                  </span>

                  {holiday && <Icon name="spark" size={10} className="flex-none text-warn" />}
                  {extras(day.key) && <span className="text-[0.6rem] tracking-tighter text-faint">•••</span>}

                  {hours > 0 && (
                    <span className="ml-auto hidden text-[0.66rem] font-medium text-muted tabular sm:inline">
                      {round1(hours)}h
                    </span>
                  )}
                </span>

                <span className="flex min-h-0 flex-1 flex-col gap-[3px]">
                  {visible.map((entry, index) => (
                    <span
                      key={`${entry.name}-${index}`}
                      className="pop"
                      title={entry.time === null ? entry.name : `${entry.name} · ${entry.time}`}
                      style={{
                        opacity:
                          carry !== null && carry.from === day.key && carry.shiftId === entry.shiftId ? 0.3 : undefined,
                        touchAction: entry.kind === 'shift' ? 'none' : undefined,
                        cursor: entry.kind === 'shift' && !painting ? 'grab' : undefined,
                      }}
                      onPointerDown={(event) => pickUp(day.key, entry, event)}
                    >
                      <CellMark entry={entry} look={settings.shiftLook} showName={settings.showShiftNamesInCells} />
                    </span>
                  ))}
                  {hidden > 0 && <span className="text-[0.64rem] font-medium text-faint">+{hidden}</span>}
                  {patternHint && (
                    <span className="rounded border border-dashed border-border-strong px-1 text-[0.66rem] text-faint">
                      {patternHint}
                    </span>
                  )}
                </span>

                {settings.showEarningsInCells && (state.days.get(day.key)?.earned ?? 0) > 0 && (
                  <span className="text-[0.66rem] font-semibold text-good tabular">
                    {format(state.days.get(day.key)!.earned)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* The chip riding under the pointer while a shift is carried. */}
      {carry !== null && (
        <div
          ref={carryGhost}
          className="pointer-events-none fixed left-0 top-0 z-50 rounded-full border border-(--accent) bg-(--surface) px-2.5 py-1 text-[0.78rem] font-semibold shadow-(--shadow-lg)"
          style={{ transform: 'translate(-200px, -200px)' }}
        >
          {carry.name}
          <span className="ml-1.5 text-[0.66rem] font-normal text-muted">
            {carryOver !== null && carryOver !== carry.from ? `→ ${carryOver.slice(8)}` : t('drop on a day')}
          </span>
        </div>
      )}

      {state.multiSelected.size > 1 && (
        <p className="rise mt-2 flex items-center gap-2 rounded-(--radius) border border-(--accent)/40 bg-(--accent-soft) px-3 py-1.5 text-[0.82rem]">
          <Icon name="check" size={13} />
          {state.multiSelected.size} {t('days selected')} — {t('actions moved to the panel on the right')}
          <button type="button" className="btn btn-quiet btn-sm ml-auto" onClick={calendarActions.clearMultiSelect}>
            {t('Clear')}
          </button>
        </p>
      )}
    </section>
  );
}

/** One mark inside a cell, honouring the chosen look. */
function CellMark({
  entry,
  look,
  showName,
}: {
  entry: CellEntry;
  look: 'dot' | 'mark' | 'chip' | 'bar';
  showName: boolean;
}) {
  const colour = entry.colour ?? 'var(--accent)';
  const planned = entry.planned ? 'opacity-60' : '';

  if (look === 'bar') {
    const ink = entry.colour ? readableInk(entry.colour) : 'var(--accent-ink)';

    return (
      <span
        className={`flex min-w-0 items-center gap-1 rounded px-1 py-px text-[0.68rem] font-medium leading-4 ${planned}`}
        style={{ background: colour, color: ink, borderLeft: entry.kind === 'event' ? '2px dotted rgb(255 255 255/.6)' : undefined }}
      >
        <span>{entry.symbol}</span>
        {showName && <span className="truncate">{entry.name}</span>}
        {entry.time && <span className="ml-auto hidden opacity-80 sm:inline">{entry.time}</span>}
      </span>
    );
  }

  if (look === 'chip') {
    return (
      <span
        className={`flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-px text-[0.66rem] leading-4 ${planned}`}
        style={{ borderColor: colour, color: 'var(--text)' }}
      >
        <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: colour }} />
        {showName && <span className="truncate">{entry.name}</span>}
        {entry.time && <span className="hidden text-faint sm:inline">{entry.time}</span>}
      </span>
    );
  }

  if (look === 'dot') {
    return (
      <span className={`flex min-w-0 items-center gap-1 text-[0.68rem] leading-4 ${planned}`}>
        <span className="h-2 w-2 flex-none rounded-full" style={{ background: colour }} />
        {showName && <span className="truncate text-muted">{entry.name}</span>}
      </span>
    );
  }

  // 'mark' — the emoji badge.
  return (
    <span className={`flex min-w-0 items-center gap-1 text-[0.68rem] leading-4 ${planned}`}>
      <span
        className="grid h-4 w-4 flex-none place-items-center rounded text-[0.62rem]"
        style={{ background: `color-mix(in srgb, ${colour} 22%, transparent)` }}
      >
        {entry.symbol}
      </span>
      {showName && <span className="truncate">{entry.name}</span>}
      {entry.time && <span className="ml-auto hidden text-faint sm:inline">{entry.time}</span>}
    </span>
  );
}

function timeLabel(mode: 'none' | 'start' | 'range', start: string | null, end: string | null): string | null {
  if (mode === 'none' || start === null) return null;

  return mode === 'start' || end === null ? start : `${start}–${end}`;
}

function isWeekend(key: string): boolean {
  const day = new Date(`${key}T00:00:00`).getDay();

  return day === 0 || day === 6;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
