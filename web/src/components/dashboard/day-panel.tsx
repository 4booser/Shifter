'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { formatDayLabel, formatDayLabelShort, fromKey, shiftDays, todayKey, weekBounds } from '@/lib/calendar/calendar-date';
import { holidaysInRange } from '@/lib/calendar/holidays';
import {
  CalendarEvent,
  DayShiftEntry,
  MARK_COLOURS,
  NOTE_MAX_LENGTH,
  ShiftTemplate,
  ShiftZone,
} from '@/lib/calendar/models';
import { api } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { BreakTimer } from '@/components/dashboard/break-timer';
import { foldBreak } from '@/lib/calendar/break-timer';
import { useMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { startLiveShift, useLive } from '@/lib/live/live-shift';
import {
  applyToDates,
  calendarActions,
  catalogueActions,
  clearShifts,
  paintColour,
  saveDay,
  useCalendar,
} from '@/lib/store/calendar';
import { Icon } from '@/components/ui/icon';

import type { DeductionReason } from '@/lib/calendar/models';

/**
 * Why a day cost money. Kept short on purpose — a list nobody scrolls is a list
 * people answer honestly, and the note is there for the rest.
 */
const REASONS: { value: DeductionReason; label: string }[] = [
  { value: 'shortfall', label: 'Till came up short' },
  { value: 'breakage', label: 'Breakage' },
  { value: 'late', label: 'Turned up late' },
  { value: 'waste', label: 'Waste' },
  { value: 'uniform', label: 'Uniform' },
  { value: 'other', label: 'Something else' },
];
import { Money, SwatchRow } from '@/components/ui/bits';
import { EventModal } from './modals/event-modal';
import { DayBank } from '@/components/dashboard/day-bank';
import { earnedTone } from '@/lib/tone';

/** Short on purpose: a list long enough for every venue is one nobody fills in. */
const ZONES: { value: ShiftZone; label: string }[] = [
  { value: 'hall', label: 'Hall' },
  { value: 'bar', label: 'Bar' },
  { value: 'terrace', label: 'Terrace' },
  { value: 'banquet', label: 'Banquet' },
  { value: 'takeaway', label: 'Takeaway' },
];

const QUANTITY_STEPS = [1, 3, 5, 10];
const TIP_STEPS = [50, 100, 200, 500];

/**
 * Editing one day as a draft, so typing does not fire a request per keystroke.
 * The draft refills when the date changes, and — the regression the old client
 * shipped a fix for — also picks up a day that arrives after the panel opened
 * on it, filling only what the draft has no answer for.
 */
export function DayPanel() {
  const { t, n, lang, num } = useI18n();
  const { format } = useMoney();
  const settings = useSettings((state) => state.settings);
  const key = useCalendar((state) => state.selectedDate);
  const day = useCalendar((state) => (state.selectedDate === null ? undefined : state.days.get(state.selectedDate)));
  const templates = useCalendar((state) => state.templates);
  const live = useLive((state) => state.live);
  const multiSelected = useCalendar((state) => state.multiSelected);
  const allDays = useCalendar((state) => state.days);

  const templateOf = (shiftId: number): ShiftTemplate | undefined =>
    templates.find((item) => item.id === shiftId && !item.archived);
  const allPositions = useCalendar((state) => state.positions);
  const positions = allPositions.filter((position) => !position.archived);
  const allEvents = useCalendar((state) => state.events);
  const events =
    key === null ? [] : allEvents.filter((event) => event.start_date <= key && event.end_date >= key);
  // What the day's events took. The figure is per occurrence, so a fortnight
  // of leave that cost something cost it once — on the day it started, not on
  // every day it covers. Repeating events arrive already split per occurrence.
  const spent = events.reduce(
    (total, event) => total + (event.start_date === key ? event.cost : 0),
    0,
  );
  const saving = useCalendar((state) => state.saving);

  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [worked, setWorked] = useState<Record<number, boolean>>({});
  const [actualStart, setActualStart] = useState<Record<number, string | null>>({});
  const [actualEnd, setActualEnd] = useState<Record<number, string | null>>({});
  const [cover, setCover] = useState<Record<number, boolean>>({});
  const [tips, setTips] = useState<number | null>(null);
  const [tipsCash, setTipsCash] = useState<number | null>(null);
  const [deductions, setDeductions] = useState<number | null>(null);
  const [deductionReason, setDeductionReason] = useState<DeductionReason | null>(null);
  const [tipPool, setTipPool] = useState<number | null>(null);
  const [revenue, setRevenue] = useState<Record<number, number | null>>({});

  // Minutes a break timer actually counted, added to what the placement
  // already had. A second break on a double is a second break, not a
  // replacement for the first.
  const [breaks, setBreaks] = useState<Record<number, number>>({});
  const [guests, setGuests] = useState<Record<number, number | null>>({});
  const [zone, setZone] = useState<Record<number, ShiftZone>>({});
  const [note, setNote] = useState('');
  const [colour, setColour] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const loadedFor = useRef<string | null>(null);

  // Only a change of date refills the whole draft.
  useEffect(() => {
    if (key === loadedFor.current) return;

    loadedFor.current = key;

    const next: Record<number, number> = {};

    for (const entry of day?.sales ?? []) next[entry.sales_id] = entry.quantity;

    const flags: Record<number, boolean> = {};
    const covers: Record<number, boolean> = {};

    for (const entry of day?.shifts ?? []) {
      flags[entry.shift_id] = entry.worked;
      covers[entry.shift_id] = entry.needs_cover;
    }

    setQuantities(next);
    setWorked(flags);
    setCover(covers);
    setTips(day?.tips ?? null);
    setTipsCash(day?.tips_cash ?? null);
    setTipPool(day?.tip_pool ?? null);
    setRevenue(
      Object.fromEntries((day?.shifts ?? []).map((entry) => [entry.shift_id, entry.revenue])),
    );
    setDeductions(day?.deductions ?? null);
    setDeductionReason(day?.deduction_reason ?? null);
    setNote(day?.note ?? '');
    setColour(day?.colour ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, day]);

  // The day can arrive after the panel opened on it — the month still loading,
  // or a webhook writing while it sits open. Fill only what has no answer yet.
  useEffect(() => {
    if (day === undefined) return;

    setQuantities((current) => {
      const next = { ...current };
      let changed = false;

      for (const entry of day.sales ?? []) {
        if (entry.sales_id in next) continue;

        next[entry.sales_id] = entry.quantity;
        changed = true;
      }

      return changed ? next : current;
    });

    setWorked((current) => {
      const next = { ...current };
      let changed = false;

      for (const entry of day.shifts ?? []) {
        if (entry.shift_id in next) continue;

        next[entry.shift_id] = entry.worked;
        changed = true;
      }

      return changed ? next : current;
    });

    setTips((current) => (current === null && day.tips !== null ? day.tips : current));
    setTipsCash((current) => (current === null && day.tips_cash !== null ? day.tips_cash : current));
    setDeductions((current) => (current === null && day.deductions !== null ? day.deductions : current));
    setNote((current) => (current === '' && (day.note ?? '') !== '' ? (day.note ?? '') : current));
    setColour((current) => (current === null && day.colour !== null ? day.colour : current));
  }, [day]);

  if (multiSelected.size > 1) {
    return <BulkPanel keys={[...multiSelected].sort()} />;
  }

  if (key === null) {
    return (
      <aside className="card w-full p-4">
        <p className="field-hint">{t('Pick a day in the calendar.')}</p>
      </aside>
    );
  }


  const holiday = holidaysInRange(settings.holidayCountry, key, key).get(key)?.name ?? null;
  const belowFloor = day?.below_floor === true;

  // Yesterday's tips, offered as a one-tap copy on a day that has none yet —
  // the commonest amount to enter is the same as the day before.
  const yesterdayTips = allDays.get(shiftDays(key, -1))?.tips ?? null;
  const shifts = day?.shifts ?? [];

  // The share of the pool this day is owed, or null when nothing on it is
  // pooled. Several pooled shifts on one day each take their own slice.
  const pooledShares = shifts
    .map((entry) => templateOf(entry.shift_id))
    .filter((template) => template?.tip_source === 'pool')
    .map((template) => template?.tip_pool_percent ?? 0)
    .filter((share) => share > 0);
  const pooled = pooledShares.length === 0 ? null : pooledShares.reduce((a, b) => a + b, 0);
  const draftSales = positions.reduce((total, position) => {
    const quantity = quantities[position.id] ?? 0;

    return total + quantity * position.price * ((position.percentage ?? 0) / 100);
  }, 0);

  // The break override exists because a break must be recorded when it ends,
  // not when somebody later remembers to press Save. React state has not
  // settled by then, so the finished figure is handed straight in.
  const save = (breakOverride?: Record<number, number>) => {
    const breaksNow = breakOverride ?? breaks;

    void saveDay(key, {
      shifts: shifts.map((entry) => {
        // An explicit null is "back to the plan"; undefined means untouched.
        const start =
          entry.shift_id in actualStart ? actualStart[entry.shift_id] : entry.actual_start;
        const end = entry.shift_id in actualEnd ? actualEnd[entry.shift_id] : entry.actual_end;

        return {
          shift_id: entry.shift_id,
          worked: worked[entry.shift_id] ?? entry.worked,
          needs_cover: !(worked[entry.shift_id] ?? entry.worked) && (cover[entry.shift_id] ?? false),
          actual_start: start !== null && end !== null ? start : null,
          actual_end: start !== null && end !== null ? end : null,
          break_minutes:
            entry.shift_id in breaksNow ? breaksNow[entry.shift_id] : entry.break_minutes,
          revenue: entry.shift_id in revenue ? revenue[entry.shift_id] : entry.revenue,
          guests: entry.shift_id in guests ? guests[entry.shift_id] : entry.guests,
          zone: entry.shift_id in zone ? zone[entry.shift_id] : entry.zone,
        };
      }),
      sales: Object.entries(quantities)
        .map(([id, quantity]) => ({ sales_id: Number(id), quantity }))
        .filter((entry) => entry.quantity > 0),
      tips,
      tips_cash: tipsCash,
      tip_pool: tipPool,
      deductions,
      // A reason without a fine is noise; the server drops it too.
      deduction_reason: deductions !== null && deductions > 0 ? deductionReason : null,
      note: note.trim() === '' ? null : note,
      colour,
      // Echo what was loaded: the server refuses a save over a version this
      // panel never saw, and the conflict modal takes it from there.
      version: day?.version ?? 0,
    });
  };

  // A column of cards, the same shape as the sidebar opposite it. It was one
  // tall card that stuck to the top and scrolled inside itself, which meant
  // two scrollbars fighting over the same wheel and a panel that unpinned
  // halfway down the page.
  return (
    <aside key={key} className="flex w-full flex-col gap-4">
      <section className="card rise p-4">
        {/* Not capitalize: it lifts «сентября» too, and the panel headed
            «Среда, 2 Сентября». The formatter puts the one capital on. */}
        <h2 className="flex items-center gap-2 text-[1rem] font-bold">
          <Icon name="calendar" size={16} className="text-(--accent-read)" />
          {formatDayLabel(key, lang)}
        </h2>
        {belowFloor && (
          <p className="mt-0.5 flex items-center gap-1 text-[0.78rem] text-danger-read">
            <Icon name="flame" size={12} />
            {t('An hour here paid under your floor')}
          </p>
        )}
        {holiday && (
          <p className="mt-0.5 flex items-center gap-1 text-[0.78rem] text-warn-read">
            <Icon name="spark" size={12} />
            {holiday}
          </p>
        )}

        <h3 className="field-label mt-3">{t('Colour')}</h3>
        <SwatchRow
          colours={MARK_COLOURS}
          saveable
          value={colour}
          clearable={colour !== null}
          onPick={(value) => setColour(value === '' || value === colour ? null : value)}
        />
      </section>

      {/* Events */}
      <section className="card p-4">
        <h3 className="panel-head">
          {t('Events')}
          <button
            type="button"
            className="btn btn-quiet btn-sm -my-1"
            onClick={() => {
              setEditingEvent(null);
              setEventOpen(true);
            }}
          >
            <Icon name="plus" size={12} />
            {t('Add')}
          </button>
        </h3>

        {events.length === 0 ? (
          <p className="field-hint">{t('Nothing on this day but work.')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {events.map((event) => (
              <li key={event.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-(--radius) border border-border px-2 py-1.5 text-left text-[0.85rem] hover:border-border-strong"
                  style={{ borderLeft: `3px solid ${event.colour}` }}
                  onClick={() => {
                    setEditingEvent(event);
                    setEventOpen(true);
                  }}
                >
                  <span>{event.symbol ?? '•'}</span>
                  <span className="truncate" title={event.name}>{event.name}</span>
                  {event.start_time && (
                    <span className="ml-auto text-[0.72rem] text-faint">
                      {event.start_time}
                      {event.end_time ? `–${event.end_time}` : ''}
                    </span>
                  )}
                  {event.cost > 0 && (
                    <span className="flex-none text-[0.72rem] text-danger-read tabular">
                      −<Money value={event.cost} />
                    </span>
                  )}
                  {event.days > 1 && (
                    <span className="chip flex-none">{n(event.days, 'days')}</span>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm btn-danger"
                  aria-label={t('Delete')}
                  onClick={() => void catalogueActions.deleteEvent(event.id)}
                >
                  <Icon name="trash" size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Shifts */}
      <section className="card p-4">
        <h3 className="field-label">{t('Shifts')}</h3>

        {shifts.length === 0 ? (
          <p className="field-hint">{t('None. Pick a shift on the left, then click this day.')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shifts.map((entry) => {
              const isWorked = worked[entry.shift_id] ?? entry.worked;
              const wantsCover = cover[entry.shift_id] ?? entry.needs_cover;

              return (
                <li key={entry.shift_id} className="rounded-(--radius) border border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-[0.88rem] font-semibold" title={entry.name}>{entry.name}</span>

                    <button
                      type="button"
                      className={`btn btn-sm flex-none ${isWorked ? 'btn-primary' : ''}`}
                      onClick={() => setWorked((current) => ({ ...current, [entry.shift_id]: !isWorked }))}
                    >
                      <Icon name={isWorked ? 'check' : 'clock'} size={12} />
                      {t(isWorked ? 'Worked' : 'Planned')}
                    </button>
                  </div>
                  {/*
                    Beside the button this line had 106 of the 240 pixels and
                    broke in the middle, leaving a row that opened «· 1 710 ₴».
                    It gets the width under the name instead, and each dot is
                    tied to the figure in front of it so a line can never start
                    with a separator.
                  */}
                  <span className="field-hint block">
                    {entry.start_time}–{entry.end_time}
                    {'\u00A0· '}
                    {num(entry.hours)} {t('h')}
                    {'\u00A0· '}
                    <Money value={entry.earned} />
                  </span>

                  {/* Only a shift that is actually paid a share asks what it
                      took: everybody else would be typing a number nothing
                      reads. */}
                  {entry.revenue_percent !== null && (
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="field-label">
                          {t('Takings this shift')} · {entry.revenue_percent}%
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          className="field-input"
                          placeholder={t('not counted')}
                          value={(entry.shift_id in revenue ? revenue[entry.shift_id] : entry.revenue) ?? ''}
                          onChange={(event) =>
                            setRevenue((current) => ({
                              ...current,
                              [entry.shift_id]: event.target.value === '' ? null : Number(event.target.value),
                            }))
                          }
                        />
                      </label>

                      {/* Takings alone do not describe an evening. Twelve
                          thousand off forty covers is a different night from
                          twelve thousand off a hundred and twenty. */}
                      <label className="block">
                        <span className="field-label">{t('Guests')}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          className="field-input"
                          placeholder={t('nobody counted')}
                          value={(entry.shift_id in guests ? guests[entry.shift_id] : entry.guests) ?? ''}
                          onChange={(event) =>
                            setGuests((current) => ({
                              ...current,
                              [entry.shift_id]: event.target.value === '' ? null : Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>
                  )}

                  {(() => {
                    const took = entry.shift_id in revenue ? revenue[entry.shift_id] : entry.revenue;
                    const came = entry.shift_id in guests ? guests[entry.shift_id] : entry.guests;

                    return took !== null && came !== null && came > 0 ? (
                      <p className="field-hint mt-1 tabular">
                        {t('Average cheque')}: <Money value={Math.round((took / came) * 100) / 100} />
                      </p>
                    ) : null;
                  })()}

                  {/* Where in the venue. Every waiter knows the terrace tips
                      better than the bar and none of them can say by how much,
                      because nobody has written it down against the hours. */}
                  {isWorked && (
                    <div className="mt-1.5">
                      <span className="field-label">{t('Where')}</span>
                      <div className="flex flex-wrap gap-1">
                        {ZONES.map((option) => {
                          const current = entry.shift_id in zone ? zone[entry.shift_id] : entry.zone;

                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`btn btn-sm ${current === option.value ? 'btn-primary' : 'btn-quiet'}`}
                              aria-pressed={current === option.value}
                              onClick={() =>
                                setZone((now) => ({
                                  ...now,
                                  [entry.shift_id]:
                                    current === option.value ? 'unset' : option.value,
                                }))
                              }
                            >
                              {t(option.label)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* The break, counted while it happens — offered only on
                      the day it is, since a countdown on a past day would be
                      writing history. */}
                  {isWorked && key === todayKey() && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <BreakTimer
                        dayKey={key}
                        shiftId={entry.shift_id}
                        planned={templateOf(entry.shift_id)?.break_minutes ?? 30}
                        taken={
                          entry.shift_id in breaks ? breaks[entry.shift_id] : entry.break_minutes
                        }
                        onTaken={(minutes, alreadyTimed) => {
                          const had =
                            entry.shift_id in breaks
                              ? breaks[entry.shift_id]
                              : entry.break_minutes;

                          // The first timed break replaces what the template
                          // assumed; a second one adds. Adding to the
                          // assumption would cost an hour of paid time for a
                          // half-hour break.
                          const next = {
                            ...breaks,
                            [entry.shift_id]: foldBreak(had, minutes, alreadyTimed),
                          };

                          setBreaks(next);
                          save(next);
                        }}
                      />
                    </div>
                  )}

                  {isWorked && (
                    <ActualClockRow
                      entry={entry}
                      start={entry.shift_id in actualStart ? actualStart[entry.shift_id] : entry.actual_start}
                      end={entry.shift_id in actualEnd ? actualEnd[entry.shift_id] : entry.actual_end}
                      onStart={(value) => setActualStart((current) => ({ ...current, [entry.shift_id]: value }))}
                      onEnd={(value) => setActualEnd((current) => ({ ...current, [entry.shift_id]: value }))}
                      onClear={() => {
                        setActualStart((current) => ({ ...current, [entry.shift_id]: null }));
                        setActualEnd((current) => ({ ...current, [entry.shift_id]: null }));
                      }}
                    />
                  )}

                  {!isWorked && (
                    <div className="mt-1.5 flex gap-1.5">
                      {key === todayKey() && live === null && templateOf(entry.shift_id) !== undefined && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm flex-1"
                          onClick={() => startLiveShift(templateOf(entry.shift_id) as ShiftTemplate)}
                        >
                          <Icon name="spark" size={12} />
                          {t('Start shift')}
                        </button>
                      )}
                      <button
                        type="button"
                        className={`btn btn-sm flex-1 ${wantsCover ? 'btn-warn' : 'btn-quiet'}`}
                        title={t('Ask the team to take this shift')}
                        onClick={() => setCover((current) => ({ ...current, [entry.shift_id]: !wantsCover }))}
                      >
                        <Icon name="swap" size={12} />
                        {t(wantsCover ? 'Cover wanted' : 'Need cover?')}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/*
        Everything one Save writes, in one card: what sold, the tips, what the
        day cost, the note. They were four sections and a button floating
        under them, and nothing said which of them the button was for.
      */}
      <section className="card flex flex-col gap-4 p-4">
      {/* Sales */}
      {positions.length > 0 && (
        <section>
          <h3 className="field-label !flex items-center gap-1">
            <Icon name="bag" size={12} />
            {t('Sold today')}
          </h3>

          <ul className="flex flex-col gap-1.5">
            {positions.map((position) => {
              const quantity = quantities[position.id] ?? 0;
              const bump = (delta: number) =>
                setQuantities((current) => ({
                  ...current,
                  [position.id]: Math.max(0, (current[position.id] ?? 0) + delta),
                }));

              return (
                <li
                  key={position.id}
                  className={`rounded-(--radius) border p-2 transition-colors ${
                    quantity > 0 ? 'border-(--accent)/40 bg-(--accent-soft)' : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.86rem] font-medium" title={position.name}>{position.name}</span>
                      <span className="field-hint whitespace-nowrap tabular">
                        {position.price} × {position.percentage ?? 0}%
                        {quantity > 0 && (
                          <span className="font-semibold text-good-read">
                            {' '}= <Money value={quantity * position.price * ((position.percentage ?? 0) / 100)} />
                          </span>
                        )}
                      </span>
                    </span>

                    <span className="flex flex-none items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-sm !px-2 tabular"
                        aria-label="−1"
                        disabled={quantity === 0}
                        onClick={() => bump(-1)}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        className="field-input !w-12 !px-1 text-center font-semibold tabular"
                        value={quantity === 0 ? '' : quantity}
                        placeholder="0"
                        aria-label={position.name}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [position.id]: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                          }))
                        }
                      />
                      <button type="button" className="btn btn-sm !px-2 tabular" aria-label="+1" onClick={() => bump(1)}>
                        +
                      </button>
                    </span>
                  </div>

                  <div className="mt-1.5 flex gap-1">
                    {QUANTITY_STEPS.slice(1).map((step) => (
                      <button key={step} type="button" className="btn btn-quiet btn-sm flex-1 tabular" onClick={() => bump(step)}>
                        +{step}
                      </button>
                    ))}
                    {quantity > 0 && (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm flex-1 !text-danger-read"
                        onClick={() => setQuantities((current) => ({ ...current, [position.id]: 0 }))}
                      >
                        {t('Clear')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {draftSales > 0 && (
            <p className="field-hint mt-1.5">
              {t('Sales so far:')} <Money value={draftSales} className="font-semibold text-ink" />
            </p>
          )}
        </section>
      )}

      {/* Tips */}
      <section>
        <h3 className="field-label !flex items-center gap-1">
          <Icon name="coins" size={12} />
          {t(pooled === null ? 'Tips' : 'Tip pool today')}
        </h3>

        {pooled !== null ? (
          <>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              className="field-input"
              aria-label={t('Tip pool today')}
              value={tipPool ?? ''}
              placeholder="0"
              onChange={(event) =>
                setTipPool(event.target.value === '' ? null : Number(event.target.value))
              }
            />
            <p className="field-hint mt-1">
              {t('Your share')} · {pooled}% ={' '}
              <Money value={((tipPool ?? 0) * pooled) / 100} className="font-semibold text-ink" />
            </p>
          </>
        ) : (
          <>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          className="field-input"
          aria-label={t('Tips')}
          value={tips ?? ''}
          placeholder="0"
          onChange={(event) => setTips(event.target.value === '' ? null : Number(event.target.value))}
        />
        {(tips ?? 0) === 0 && yesterdayTips !== null && yesterdayTips > 0 && (
          <button
            type="button"
            className="btn btn-quiet btn-sm mt-1 w-full"
            onClick={() => setTips(yesterdayTips)}
          >
            <Icon name="repeat" size={12} />
            {t('Copy yesterday’s tips')} · {format(yesterdayTips)}
          </button>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {TIP_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              className="btn btn-quiet btn-sm flex-1 tabular"
              onClick={() => setTips((current) => (current ?? 0) + step)}
            >
              +{step}
            </button>
          ))}
          {(tips ?? 0) > 0 && (
            <button type="button" className="btn btn-quiet btn-sm !text-danger-read" onClick={() => { setTips(null); setTipsCash(null); }}>
              {t('Clear')}
            </button>
          )}
        </div>

        </>
        )}

        {pooled === null && (tips ?? 0) > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <label className="flex-1">
              <span className="field-label">{t('Of that, cash')}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                className="field-input"
                value={tipsCash ?? ''}
                placeholder="0"
                onChange={(event) => setTipsCash(event.target.value === '' ? null : Number(event.target.value))}
              />
            </label>
            <span className="field-hint mt-4">
              {t('Card')}: <Money value={Math.max(0, (tips ?? 0) - (tipsCash ?? 0))} />
            </span>
          </div>
        )}
      </section>

      {/* Deductions */}
      <section>
        <h3 className="field-label !flex items-center gap-1">
          <Icon name="wallet" size={12} />
          {t('Fines and shortfalls')}
        </h3>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          className="field-input"
          aria-label={t('Fines and shortfalls')}
          value={deductions ?? ''}
          placeholder="0"
          onChange={(event) => setDeductions(event.target.value === '' ? null : Number(event.target.value))}
        />

        {deductions !== null && deductions > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REASONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`btn btn-sm ${deductionReason === option.value ? 'btn-primary' : 'btn-quiet'}`}
                aria-pressed={deductionReason === option.value}
                onClick={() =>
                  setDeductionReason((current) => (current === option.value ? null : option.value))
                }
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Note */}
      <section>
        <h3 className="field-label !flex items-center gap-1">
          <Icon name="note" size={12} />
          {t('Note')}
        </h3>
        <textarea
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          className="field-input resize-y"
          aria-label={t('Note')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="field-hint mt-0.5 text-right tabular">
          {note.length} / {NOTE_MAX_LENGTH}
        </p>
      </section>

      <button type="button" className="btn btn-primary w-full" disabled={saving} onClick={() => save()}>
        <Icon name="check" size={15} />
        {saving ? t('Saving…') : t('Save day')}
      </button>

      {/* Saved figures */}
      {day && (
        <dl className="flex flex-col gap-1 border-t border-border pt-3 text-[0.85rem]">
          {day.sales.map((entry) => (
            <div key={entry.sales_id} className="flex justify-between gap-2">
              <dt className="truncate text-muted">
                {entry.name} × {entry.quantity}
              </dt>
              <dd><Money value={entry.earned} /></dd>
            </div>
          ))}
          {day.tip_out > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t('Tip-out')}</dt>
              <dd className="text-danger-read">−<Money value={day.tip_out} /></dd>
            </div>
          )}
          {day.deductions > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t('Deductions')}</dt>
              <dd className="text-danger-read">−<Money value={day.deductions} /></dd>
            </div>
          )}
          <div className="flex justify-between gap-2 border-t border-border pt-1 text-[0.95rem] font-bold">
            <dt>{t('Earned')}</dt>
            <dd className={earnedTone(day.earned)}><Money value={day.earned} /></dd>
          </div>
          {/*
            What the day cost, kept beside what it earned rather than inside
            it. Netting the two would quietly change what "заработано" means,
            and the number people check every evening is that one.
          */}
          {spent > 0 && (
            <>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('Spent')}</dt>
                <dd className="text-danger-read">−<Money value={spent} /></dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('Left over')}</dt>
                <dd className={day.earned - spent < 0 ? 'text-danger-read' : ''}>
                  <Money value={day.earned - spent} />
                </dd>
              </div>
            </>
          )}
          {day.planned > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t('Still planned')}</dt>
              <dd><Money value={day.planned} /></dd>
            </div>
          )}
        </dl>
      )}
      </section>

      <EventModal
        open={eventOpen}
        editing={editingEvent}
        date={key}
        onClose={() => setEventOpen(false)}
      />
      <DayWeek dayKey={key} />
      <DayBank dayKey={key} />
      <DayContext dayKey={key} />
      <DayHistory dayKey={key} />
    </aside>
  );
}

/**
 * The panel's other personality: several days at once. Everything here acts
 * on the whole selection in one write and one undo step, which is the whole
 * point of selecting several days.
 */
function BulkPanel({ keys }: { keys: string[] }) {
  const [showAllColours, setShowAllColours] = useState(false);
  const { t, n, num } = useI18n();
  const { format } = useMoney();
  const templates = useCalendar((state) => state.templates);
  const days = useCalendar((state) => state.days);
  const saving = useCalendar((state) => state.saving);

  const active = templates.filter((item) => !item.archived);
  const earned = keys.reduce((total, key) => total + (days.get(key)?.earned ?? 0), 0);
  const hours = keys.reduce((total, key) => total + (days.get(key)?.hours ?? 0), 0);
  const withShifts = keys.filter((key) => (days.get(key)?.shifts.length ?? 0) > 0).length;

  return (
    <aside className="card rise w-full p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-[1.02rem] font-bold">
          {n(keys.length, 'days')} {t('selected')}
        </h2>
        <button type="button" className="btn btn-quiet btn-sm" onClick={calendarActions.clearMultiSelect}>
          {t('Clear')}
        </button>
      </div>
      <p className="field-hint mb-3">
        {keys[0]?.slice(8)}.{keys[0]?.slice(5, 7)} — {keys.at(-1)?.slice(8)}.{keys.at(-1)?.slice(5, 7)}
        {earned > 0 && <> · {format(earned)}</>}
        {hours > 0 && <> · {num(Math.round(hours * 10) / 10)} {t('h')}</>}
      </p>

      <section className="mb-4">
        <h3 className="field-label">{t('Put a shift on every day')}</h3>
        <div className="flex flex-col gap-1.5">
          {active.map((template) => (
            <button
              key={template.id}
              type="button"
              className="btn justify-start"
              disabled={saving}
              onClick={() => void applyToDates(keys, template)}
            >
              <span>{template.symbol ?? '•'}</span>
              <span className="min-w-0 truncate" title={template.name}>{template.name}</span>
              <span className="ml-auto text-[0.72rem] text-muted">
                {template.start_time}–{template.end_time}
              </span>
            </button>
          ))}
          {active.length === 0 && <p className="field-hint">{t('No shifts yet — create one in the sidebar.')}</p>}
        </div>
      </section>

      <section className="mb-4">
        <h3 className="field-label">{t('Colour')}</h3>
        {/* Eight up front; the whole two dozen — behind one tap. The audit
            counted the full palette eating half the day column. */}
        <div className="flex flex-wrap gap-1.5">
          {(showAllColours ? MARK_COLOURS : MARK_COLOURS.slice(0, 8)).map((option) => (
            <button
              key={option.value}
              type="button"
              className="swatch"
              style={{ background: option.value }}
              title={option.label}
              disabled={saving}
              onClick={() => void paintColour(keys, option.value)}
            />
          ))}
          {!showAllColours && MARK_COLOURS.length > 8 && (
            <button
              type="button"
              className="swatch grid place-items-center border !border-border-strong bg-surface text-[0.62rem] font-bold text-muted"
              title={t('More colours')}
              onClick={() => setShowAllColours(true)}
            >
              +{MARK_COLOURS.length - 8}
            </button>
          )}
          <button
            type="button"
            className="swatch grid place-items-center border !border-border-strong bg-surface text-muted"
            title={t('Erase')}
            disabled={saving}
            onClick={() => void paintColour(keys, null)}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      </section>

      {withShifts > 0 && (
        <button
          type="button"
          className="btn w-full !border-danger/40 !text-danger-read"
          disabled={saving}
          onClick={() => {
            if (window.confirm(`${t('Clear shifts on')} ${n(withShifts, 'days')}?`)) {
              void clearShifts(keys);
            }
          }}
        >
          <Icon name="trash" size={13} />
          {t('Clear shifts')} · {withShifts}
        </button>
      )}
    </aside>
  );
}

/**
 * The recorded clock of a worked shift: came at 10:47, left at 22:30. Both
 * edges or neither — the maths refuses half a truth — and the little delta
 * shows what the honesty is worth against the plan.
 */
function ActualClockRow({
  entry,
  start,
  end,
  onStart,
  onEnd,
  onClear,
}: {
  entry: DayShiftEntry;
  start: string | null;
  end: string | null;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();

  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

  const spanOf = (from: string, to: string) => {
    const span = minutes(to) - minutes(from);

    return (span <= 0 ? span + 24 * 60 : span) - entry.break_minutes;
  };

  const planned = spanOf(entry.start_time, entry.end_time);
  const recorded = start !== null && end !== null ? spanOf(start, end) : null;
  const delta = recorded === null ? 0 : recorded - planned;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.8rem]">
      <span className="field-hint flex-none">{t('Actually')}</span>
      {/* Начало и конец — одна величина, и переносить их порознь нельзя: в
          панели шириной в двести тридцать пикселей «16:00 –» оставалось на
          строке с подписью, а «02:00» уезжало вниз, и промежуток переставал
          читаться промежутком. */}
      <span className="flex flex-none items-center gap-1.5">
      <input
        type="time"
        className="field-input !w-[5.2rem] !px-1.5 !py-0.5 !text-[0.8rem]"
        aria-label={t('Actually started')}
        value={start ?? entry.start_time}
        onChange={(event) => {
          if (event.target.value) {
            onStart(event.target.value);
            if (end === null) onEnd(entry.actual_end ?? entry.end_time);
          }
        }}
      />
      <span className="text-faint">–</span>
      <input
        type="time"
        className="field-input !w-[5.2rem] !px-1.5 !py-0.5 !text-[0.8rem]"
        aria-label={t('Actually finished')}
        value={end ?? entry.end_time}
        onChange={(event) => {
          if (event.target.value) {
            onEnd(event.target.value);
            if (start === null) onStart(entry.actual_start ?? entry.start_time);
          }
        }}
      />
      </span>
      {recorded !== null && delta !== 0 && (
        <span className={`tabular text-[0.72rem] font-semibold ${delta > 0 ? 'text-good-read' : 'text-warn-read'}`}>
          {delta > 0 ? '+' : '−'}{Math.abs(Math.round((delta / 60) * 10) / 10)} {t('h')}
        </span>
      )}
      {(start !== null || entry.actual_start !== null) && (
        <button type="button" className="btn btn-quiet btn-sm !px-1.5" title={t('Back to the plan')} onClick={onClear}>
          ↺
        </button>
      )}
    </div>
  );
}



/**
 * The week this day sits in, day by day.
 *
 * "How is this day" and "how is this week" are asked in the same breath and
 * the panel could only answer the first. Every row is a link, so the week is
 * also how you move around it — which is what the column at the far right of
 * a calendar should have been all along.
 */
function DayWeek({ dayKey }: { dayKey: string }) {
  const { t, num } = useI18n();
  const { format } = useMoney();
  const allDays = useCalendar((state) => state.days);
  const allEvents = useCalendar((state) => state.events);

  const week = useMemo(() => {
    const { from } = weekBounds(dayKey);

    return Array.from({ length: 7 }, (_, index) => {
      const key = shiftDays(from, index);
      const day = allDays.get(key);

      return {
        key,
        earned: day?.earned ?? 0,
        planned: day?.planned ?? 0,
        hours: day?.shifts.reduce((sum, entry) => sum + entry.hours, 0) ?? 0,
        names: (day?.shifts ?? []).map((entry) => entry.name),
        events: allEvents.filter((event) => event.start_date <= key && event.end_date >= key),
      };
    });
  }, [dayKey, allDays, allEvents]);

  const earned = week.reduce((sum, entry) => sum + entry.earned, 0);
  const planned = week.reduce((sum, entry) => sum + entry.planned, 0);
  const hours = week.reduce((sum, entry) => sum + entry.hours, 0);

  return (
    <section className="card flex flex-col gap-1.5 p-4">
      <h3 className="panel-head">
        <span>{t('This week')}</span>
        <span className="tabular text-[0.72rem] font-normal text-faint">
          {num(Math.round(hours * 10) / 10)} {t('h')}
        </span>
      </h3>

      <ul className="flex flex-col">
        {week.map((entry) => {
          const here = entry.key === dayKey;
          const empty = entry.names.length === 0 && entry.events.length === 0;

          return (
            <li key={entry.key}>
              <button
                type="button"
                className={`flex w-full items-baseline gap-2 rounded-(--radius) px-1.5 py-1 text-left text-[0.8rem] transition-colors ${
                  here ? 'bg-(--accent-soft) text-(--accent-read)' : 'hover:bg-surface-2'
                }`}
                onClick={() => calendarActions.select(entry.key)}
              >
                <span className={`w-7 flex-none text-[0.72rem] ${here ? '' : 'text-faint'}`}>
                  {WEEK_LETTERS[(fromKey(entry.key).getDay() + 6) % 7]}
                </span>
                <span className={`min-w-0 flex-1 truncate ${empty ? 'text-faint' : ''}`}>
                  {entry.names.length > 0
                    ? entry.names.join(', ')
                    : entry.events.length > 0
                      ? entry.events.map((event) => event.name).join(', ')
                      : '·'}
                </span>
                <span className="flex-none tabular">
                  {entry.earned > 0 ? (
                    format(entry.earned)
                  ) : entry.planned > 0 ? (
                    <span className="text-muted">{format(entry.planned)}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <dl className="flex flex-col gap-1 border-t border-border pt-1.5 text-[0.8rem]">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t('Earned this week')}</dt>
          <dd className="tabular font-semibold text-good-read"><Money value={earned} /></dd>
        </div>
        {planned > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('Still to come')}</dt>
            <dd className="tabular"><Money value={planned} /></dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/** Single letters: the column is narrow and the day is obvious from position. */
const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday-first, the shape the rest of the calendar speaks. */
const weekdayOf = (key: string): number => (fromKey(key).getDay() + 6) % 7;

/**
 * The day, put next to the days around it.
 *
 * The panel used to end at the earnings line and leave the column short of
 * the calendar beside it — an open corner, and worse, a dead end: the figure
 * for one day means nothing without the fortnight it sits in. This is that
 * fortnight, the same weekday's average, and the day's own paper trail, in
 * the space that was empty.
 *
 * Everything here is read from days already in the store. No request, so it
 * is there the moment the panel opens, and it cannot fail on its own.
 */
function DayContext({ dayKey }: { dayKey: string }) {
  const { t, lang } = useI18n();
  const { format, compact } = useMoney();
  const allDays = useCalendar((state) => state.days);
  const [hover, setHover] = useState<string | null>(null);

  // The fortnight ending on this day, whatever the calendar happens to be
  // showing: a day picked at the start of a month is still read in context.
  const window = useMemo(() => {
    const keys: string[] = [];

    for (let back = 13; back >= 0; back -= 1) keys.push(shiftDays(dayKey, -back));

    return keys.map((key) => ({
      key,
      earned: allDays.get(key)?.earned ?? 0,
      hours: allDays.get(key)?.shifts.reduce((sum, entry) => sum + entry.hours, 0) ?? 0,
    }));
  }, [dayKey, allDays]);

  const worked = window.filter((entry) => entry.earned > 0);
  const peak = Math.max(1, ...window.map((entry) => entry.earned));
  const average = worked.length === 0 ? 0 : worked.reduce((sum, e) => sum + e.earned, 0) / worked.length;
  const here = window.at(-1)!;

  // The same weekday across everything loaded — "your Tuesdays" is the
  // comparison people actually make, and it is the one a month total hides.
  const sameWeekday = [...allDays.values()].filter(
    (entry) => weekdayOf(entry.date) === weekdayOf(dayKey) && entry.earned > 0,
  );
  const weekdayAverage =
    sameWeekday.length === 0
      ? null
      : sameWeekday.reduce((sum, entry) => sum + entry.earned, 0) / sameWeekday.length;

  const shown = hover === null ? here : window.find((entry) => entry.key === hover) ?? here;

  // A scale, so the bars are a measurement rather than a shape.
  const ceiling = Math.ceil(peak / 500) * 500 || 500;
  const ticks = [ceiling, ceiling / 2];

  return (
    <section className="card flex flex-col gap-2 p-4">
      <h3 className="panel-head">
        <span className="flex-none">{t('Last two weeks')}</span>
        <span className="min-w-0 text-right tabular text-[0.72rem] font-normal text-faint">
          {shown.earned > 0 ? format(shown.earned) : t('nothing')}
          {' · '}
          {formatDayLabelShort(shown.key, lang)}
        </span>
      </h3>

      {/*
        pt-2 is the top tick's room. Without it the ceiling label sits half
        above the plot and lands on the heading.
      */}
      <div className="flex h-24 gap-1.5 pt-2">
        {/* The scale gets its own gutter rather than sitting over the bars. */}
        <div className="relative w-9 flex-none">
          {ticks.map((value) => (
            <span
              key={value}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[0.58rem] text-faint tabular"
              style={{ bottom: `${(value / ceiling) * 100}%` }}
            >
              {compact(value)}
            </span>
          ))}
        </div>

        <div
          className="relative flex flex-1 items-end gap-[2px]"
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((value) => (
            <div
              key={value}
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/60"
              style={{ bottom: `${(value / ceiling) * 100}%` }}
            />
          ))}

          {average > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-(--accent)/40"
              style={{ bottom: `${(average / ceiling) * 100}%` }}
            />
          )}

          {window.map((entry) => {
            const today = entry.key === dayKey;
            const height = entry.earned === 0 ? 2 : Math.max(3, (entry.earned / ceiling) * 100);

            return (
              <button
                key={entry.key}
                type="button"
                className="relative flex-1 rounded-t-[4px] transition-opacity"
                style={{
                  height: `${height}%`,
                  background: today
                    ? 'var(--accent)'
                    : entry.earned === 0
                      ? 'var(--border)'
                      : 'color-mix(in srgb, var(--accent) 38%, var(--surface-2))',
                  opacity: hover === null || hover === entry.key ? 1 : 0.55,
                }}
                aria-label={`${formatDayLabel(entry.key, lang)}: ${format(entry.earned)}`}
                onPointerEnter={() => setHover(entry.key)}
                onFocus={() => setHover(entry.key)}
                onClick={() => calendarActions.select(entry.key)}
              />
            );
          })}
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-[0.8rem]">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t('Worked days here')}</dt>
          <dd className="tabular">{worked.length} / 14</dd>
        </div>
        {average > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('Average working day')}</dt>
            <dd className="tabular"><Money value={Math.round(average)} /></dd>
          </div>
        )}
        {/* «В среднем по вторникам ₴0» is not an average anybody wants to
            read; it means no Tuesday has paid yet, which the row above
            already says. */}
        {weekdayAverage !== null && weekdayAverage > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">
              {t('Same weekday, on average')}
            </dt>
            <dd className="tabular">
              <Money value={Math.round(weekdayAverage)} />
              {/* The average has to be something before a day can be a
                  percentage of it: past Tuesdays that all earned nothing gave
                  this day «+Infinity%». */}
              {here.earned > 0 && weekdayAverage > 0 && (
                <span
                  className={`ml-1.5 text-[0.72rem] ${here.earned >= weekdayAverage ? 'text-good-read' : 'text-danger-read'}`}
                >
                  {here.earned >= weekdayAverage ? '+' : '−'}
                  {Math.round(Math.abs((here.earned / weekdayAverage - 1) * 100))}%
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

interface HistoryEntry {
  at: string;
  source: string;
  shift_count: number;
  worked_count: number;
  hours: number;
  earned: number;
  tips: number;
  sales_units: number;
}

/**
 * The day's paper trail.
 *
 * It used to be a collapsed <details> at the very bottom — a line of grey
 * text that answered "where did my tips go" only for somebody who already
 * suspected the answer was there. It is open now, because the panel has the
 * room and because the question it answers is one people ask in a hurry.
 */
function DayHistory({ dayKey }: { dayKey: string }) {
  const { t, lang, num } = useI18n();
  const { format } = useMoney();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    setEntries(null);
    setAll(false);

    let live = true;

    void api<{ entries: HistoryEntry[] }>(`/shifter/v1/days/${dayKey}/history`)
      .then((response) => live && setEntries(response.entries))
      .catch(() => live && setEntries([]));

    return () => {
      live = false;
    };
  }, [dayKey]);

  const SOURCES: Record<string, string> = {
    app: t('you'),
    webhook: t('webhook'),
    assignment: t('the rota board'),
  };

  const shown = entries === null ? [] : all ? entries : entries.slice(0, 4);

  // A day nobody has written to has no history, and a card saying so is a
  // card in the way. Most days are that day.
  if (entries === null || entries.length === 0) return null;

  return (
    <section className="card flex flex-col gap-1.5 p-4">
      <h3 className="field-label">{t('History')}</h3>

      <ul className="flex flex-col gap-1">
        {shown.map((entry, index) => (
          <li
            key={index}
            className="flex items-baseline justify-between gap-2 text-[0.76rem] text-muted tabular"
          >
            <span className="truncate">
              <span className="text-faint">
                {new Date(entry.at).toLocaleString(lang, {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>{' '}
              · {SOURCES[entry.source] ?? entry.source}
              {/* What actually changed, rather than only that something did. */}
              {entry.shift_count > 0 && <> · {entry.shift_count} {t('sh.')}</>}
              {entry.hours > 0 && <> · {num(entry.hours)} {t('h')}</>}
            </span>
            <span className="flex-none">
              {format(entry.earned)}
              {entry.tips > 0 && <span className="text-faint"> +{format(entry.tips)}</span>}
            </span>
          </li>
        ))}
      </ul>

      {entries.length > shown.length && (
        <button
          type="button"
          className="btn btn-quiet btn-sm self-start"
          onClick={() => setAll(true)}
        >
          {t('Show all')} ({entries.length})
        </button>
      )}
    </section>
  );
}
