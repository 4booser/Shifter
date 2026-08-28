'use client';

import { useEffect, useRef, useState } from 'react';

import { formatDayLabel, shiftDays, todayKey } from '@/lib/calendar/calendar-date';
import { holidaysInRange } from '@/lib/calendar/holidays';
import { CalendarEvent, DayShiftEntry, MARK_COLOURS, NOTE_MAX_LENGTH, ShiftTemplate } from '@/lib/calendar/models';
import { api } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
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

const QUANTITY_STEPS = [1, 3, 5, 10];
const TIP_STEPS = [50, 100, 200, 500];

/**
 * Editing one day as a draft, so typing does not fire a request per keystroke.
 * The draft refills when the date changes, and — the regression the old client
 * shipped a fix for — also picks up a day that arrives after the panel opened
 * on it, filling only what the draft has no answer for.
 */
export function DayPanel() {
  const { t, lang } = useI18n();
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
  // What the day's events took. Never netted off anything automatically.
  const spent = events.reduce((total, event) => total + event.cost, 0);
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

  const save = () => {
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
          break_minutes: entry.break_minutes,
          revenue: entry.shift_id in revenue ? revenue[entry.shift_id] : entry.revenue,
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
    });
  };

  return (
    <aside
      key={key}
      className="card rise flex w-full flex-col gap-4 p-4 lg:sticky lg:top-[4.25rem] lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto"
    >
      <div>
        <h2 className="flex items-center gap-2 text-[1rem] font-bold capitalize">
          <Icon name="calendar" size={16} className="text-(--accent)" />
          {formatDayLabel(key, lang)}
        </h2>
        {belowFloor && (
          <p className="mt-0.5 flex items-center gap-1 text-[0.78rem] text-danger">
            <Icon name="flame" size={12} />
            {t('An hour here paid under your floor')}
          </p>
        )}
        {holiday && (
          <p className="mt-0.5 flex items-center gap-1 text-[0.78rem] text-warn">
            <Icon name="spark" size={12} />
            {holiday}
          </p>
        )}
      </div>

      {/* Colour */}
      <section>
        <h3 className="field-label">{t('Colour')}</h3>
        <SwatchRow
          colours={MARK_COLOURS}
          value={colour}
          clearable={colour !== null}
          onPick={(value) => setColour(value === '' || value === colour ? null : value)}
        />
      </section>

      {/* Events */}
      <section>
        <h3 className="field-label flex items-center justify-between">
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
                  <span className="truncate">{event.name}</span>
                  {event.start_time && (
                    <span className="ml-auto text-[0.72rem] text-faint">
                      {event.start_time}
                      {event.end_time ? `–${event.end_time}` : ''}
                    </span>
                  )}
                  {event.cost > 0 && (
                    <span className="flex-none text-[0.72rem] text-danger tabular">
                      −<Money value={event.cost} />
                    </span>
                  )}
                  {event.days > 1 && (
                    <span className="chip flex-none">{event.days} {t('days')}</span>
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
      <section>
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
                    <span className="min-w-0">
                      <span className="block truncate text-[0.88rem] font-semibold">{entry.name}</span>
                      <span className="field-hint">
                        {entry.start_time}–{entry.end_time} · {entry.hours}h · <Money value={entry.earned} />
                      </span>
                    </span>

                    <button
                      type="button"
                      className={`btn btn-sm flex-none ${isWorked ? 'btn-primary' : ''}`}
                      onClick={() => setWorked((current) => ({ ...current, [entry.shift_id]: !isWorked }))}
                    >
                      <Icon name={isWorked ? 'check' : 'clock'} size={12} />
                      {t(isWorked ? 'Worked' : 'Planned')}
                    </button>
                  </div>

                  {/* Only a shift that is actually paid a share asks what it
                      took: everybody else would be typing a number nothing
                      reads. */}
                  {entry.revenue_percent !== null && (
                    <label className="mt-1.5 block">
                      <span className="field-label">
                        {t('Takings this shift')} · {entry.revenue_percent}%
                      </span>
                      <input
                        type="number"
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
                        className={`btn btn-sm flex-1 ${wantsCover ? 'border-warn/50 bg-(--warn-soft) text-warn' : 'btn-quiet'}`}
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

      {/* Sales */}
      {positions.length > 0 && (
        <section>
          <h3 className="field-label flex items-center gap-1">
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
                      <span className="block truncate text-[0.86rem] font-medium">{position.name}</span>
                      <span className="field-hint whitespace-nowrap tabular">
                        {position.price} × {position.percentage ?? 0}%
                        {quantity > 0 && (
                          <span className="font-semibold text-good">
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
                        className="btn btn-quiet btn-sm flex-1 text-danger"
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
        <h3 className="field-label flex items-center gap-1">
          <Icon name="coins" size={12} />
          {t(pooled === null ? 'Tips' : 'Tip pool today')}
        </h3>

        {pooled !== null ? (
          <>
            <input
              type="number"
              min={0}
              className="field-input"
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
          min={0}
          className="field-input"
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
            <button type="button" className="btn btn-quiet btn-sm text-danger" onClick={() => { setTips(null); setTipsCash(null); }}>
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
        <h3 className="field-label flex items-center gap-1">
          <Icon name="wallet" size={12} />
          {t('Fines and shortfalls')}
        </h3>
        <input
          type="number"
          min={0}
          className="field-input"
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
        <h3 className="field-label flex items-center gap-1">
          <Icon name="note" size={12} />
          {t('Note')}
        </h3>
        <textarea
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          className="field-input resize-y"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="field-hint mt-0.5 text-right tabular">
          {note.length} / {NOTE_MAX_LENGTH}
        </p>
      </section>

      <button type="button" className="btn btn-primary w-full" disabled={saving} onClick={save}>
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
              <dd className="text-danger">−<Money value={day.tip_out} /></dd>
            </div>
          )}
          {day.deductions > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t('Deductions')}</dt>
              <dd className="text-danger">−<Money value={day.deductions} /></dd>
            </div>
          )}
          <div className="flex justify-between gap-2 border-t border-border pt-1 text-[0.95rem] font-bold">
            <dt>{t('Earned')}</dt>
            <dd className="text-good"><Money value={day.earned} /></dd>
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
                <dd className="text-danger">−<Money value={spent} /></dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('Left over')}</dt>
                <dd className={day.earned - spent < 0 ? 'text-danger' : ''}>
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

      <EventModal
        open={eventOpen}
        editing={editingEvent}
        date={key}
        onClose={() => setEventOpen(false)}
      />
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
  const { t, n } = useI18n();
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
        {hours > 0 && <> · {Math.round(hours * 10) / 10}h</>}
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
              <span className="min-w-0 truncate">{template.name}</span>
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
        <div className="flex flex-wrap gap-1.5">
          {MARK_COLOURS.map((option) => (
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
          <button
            type="button"
            className="swatch grid place-items-center border border-border-strong bg-surface text-muted"
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
          className="btn w-full border-danger/40 text-danger"
          disabled={saving}
          onClick={() => {
            if (window.confirm(`${t('Clear shifts on')} ${withShifts} ${t('days')}?`)) {
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
      <input
        type="time"
        className="field-input !w-[5.6rem] !px-1.5 !py-0.5 !text-[0.8rem]"
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
        className="field-input !w-[5.6rem] !px-1.5 !py-0.5 !text-[0.8rem]"
        value={end ?? entry.end_time}
        onChange={(event) => {
          if (event.target.value) {
            onEnd(event.target.value);
            if (start === null) onStart(entry.actual_start ?? entry.start_time);
          }
        }}
      />
      {recorded !== null && delta !== 0 && (
        <span className={`tabular text-[0.72rem] font-semibold ${delta > 0 ? 'text-good' : 'text-warn'}`}>
          {delta > 0 ? '+' : '−'}{Math.abs(Math.round((delta / 60) * 10) / 10)}h
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
 * The day's paper trail, folded away until asked. Each line is a snapshot
 * after a write — the answer to "where did my tips go" is reading these
 * top to bottom.
 */
function DayHistory({ dayKey }: { dayKey: string }) {
  const { t, lang } = useI18n();
  const { format } = useMoney();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setEntries(null);
    setOpen(false);
  }, [dayKey]);

  const load = () => {
    if (entries !== null) return;

    void api<{ entries: HistoryEntry[] }>(`/shifter/v1/days/${dayKey}/history`)
      .then((response) => setEntries(response.entries))
      .catch(() => setEntries([]));
  };

  const SOURCES: Record<string, string> = {
    app: t('you'),
    webhook: t('webhook'),
    assignment: t('the rota board'),
  };

  return (
    <details
      className="border-t border-border pt-2"
      open={open}
      onToggle={(event) => {
        setOpen((event.target as HTMLDetailsElement).open);
        if ((event.target as HTMLDetailsElement).open) load();
      }}
    >
      <summary className="cursor-pointer text-[0.78rem] font-semibold text-muted hover:text-ink">
        {t('History')}
      </summary>
      {entries === null ? (
        <p className="field-hint mt-1.5">…</p>
      ) : entries.length === 0 ? (
        <p className="field-hint mt-1.5">{t('No writes recorded yet.')}</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {entries.map((entry, index) => (
            <li key={index} className="text-[0.75rem] text-muted tabular">
              <span className="text-faint">
                {new Date(entry.at).toLocaleString(lang, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>{' '}
              · {SOURCES[entry.source] ?? entry.source} · {entry.shift_count} {t('sh.')} ·{' '}
              {format(entry.earned)}
              {entry.tips > 0 && <> · {t('tips')} {format(entry.tips)}</>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
