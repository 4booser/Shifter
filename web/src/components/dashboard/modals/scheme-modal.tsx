'use client';

import { useState } from 'react';

import {
  addMonths,
  currentMonth,
  keysBetween,
  monthBounds,
  todayKey,
} from '@/lib/calendar/calendar-date';
import { MARK_COLOURS } from '@/lib/calendar/models';
import { schemeColourFor } from '@/lib/calendar/scheme';
import { ColourScheme } from '@/lib/settings/settings';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/lib/settings/store';
import { applyScheme, useCalendar } from '@/lib/store/calendar';
import { Segmented } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';

type Scope = 'month' | 'ahead' | 'range';

const WEEKDAYS = [
  { day: 1, label: 'Monday' },
  { day: 2, label: 'Tuesday' },
  { day: 3, label: 'Wednesday' },
  { day: 4, label: 'Thursday' },
  { day: 5, label: 'Friday' },
  { day: 6, label: 'Saturday' },
  { day: 0, label: 'Sunday' },
];

/** Saved ways of colouring a calendar: by weekday, or on a rotation. */
export function SchemeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const month = useCalendar((state) => state.month);
  const settings = useSettings((state) => state.settings);
  const saveScheme = useSettings((state) => state.saveScheme);
  const deleteScheme = useSettings((state) => state.deleteScheme);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'weekday' | 'cycle'>('weekday');
  const [byWeekday, setByWeekday] = useState<Partial<Record<number, string>>>({});
  const [cycle, setCycle] = useState<(string | null)[]>([null, null, null, null]);
  const [cycleFrom, setCycleFrom] = useState(todayKey());
  const [scope, setScope] = useState<Scope>('month');
  const [months, setMonths] = useState(3);
  const [from, setFrom] = useState(todayKey());
  const [until, setUntil] = useState(todayKey());

  const weekdays = settings.mondayFirst ? WEEKDAYS : [WEEKDAYS[6], ...WEEKDAYS.slice(0, 6)];

  const valid =
    name.trim().length > 0 &&
    (kind === 'weekday' ? Object.keys(byWeekday).length > 0 : cycle.some((colour) => colour !== null));

  const draft: ColourScheme = { id: editingId ?? 'draft', name, kind, byWeekday, cycle, cycleFrom };

  const dates = (() => {
    if (scope === 'month') {
      const bounds = monthBounds(`${month.year}-${`${month.month}`.padStart(2, '0')}-01`);

      return keysBetween(bounds.from, bounds.to);
    }

    if (scope === 'ahead') {
      const target = addMonths(currentMonth(), months - 1);
      const bounds = monthBounds(`${target.year}-${`${target.month}`.padStart(2, '0')}-01`);

      return keysBetween(todayKey(), bounds.to);
    }

    return until < from ? [] : keysBetween(from, until);
  })();

  const willPaint = dates.filter((date) => schemeColourFor(draft, date) !== undefined).length;

  const startNew = () => {
    setEditingId(null);
    setName('');
    setKind('weekday');
    setByWeekday({});
    setCycle([null, null, null, null]);
    setCycleFrom(todayKey());
  };

  const edit = (scheme: ColourScheme) => {
    setEditingId(scheme.id);
    setName(scheme.name);
    setKind(scheme.kind);
    setByWeekday({ ...scheme.byWeekday });
    setCycle([...scheme.cycle]);
    setCycleFrom(scheme.cycleFrom);
  };

  const save = () => {
    if (!valid) return;

    // Time-based rather than a counter: schemes live in one browser, and a
    // counter would collide with itself after a reset.
    const scheme: ColourScheme = { ...draft, id: editingId ?? `scheme-${Date.now()}`, name: name.trim() };

    saveScheme(scheme);
    setEditingId(scheme.id);
  };

  return (
    <Modal open={open} title={t('Colour schemes')} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        {settings.colourSchemes.length > 0 && (
          <div>
            <span className="field-label">{t('Saved schemes')}</span>
            <ul className="flex flex-col gap-1">
              {settings.colourSchemes.map((scheme) => (
                <li key={scheme.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-(--radius) border px-2.5 py-1.5 text-left ${
                      editingId === scheme.id ? 'border-(--accent)' : 'border-border hover:border-border-strong'
                    }`}
                    onClick={() => edit(scheme)}
                  >
                    <span className="truncate text-[0.88rem] font-medium">{scheme.name}</span>
                    <span className="ml-auto flex gap-0.5">
                      {(scheme.kind === 'weekday'
                        ? weekdays.map((day) => scheme.byWeekday[day.day])
                        : scheme.cycle
                      ).map((colour, index) => (
                        <span
                          key={index}
                          className="h-2.5 w-2.5 rounded-full border border-border"
                          style={{ background: colour ?? 'transparent' }}
                        />
                      ))}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm btn-danger"
                    aria-label={t('Delete')}
                    onClick={() => {
                      deleteScheme(scheme.id);

                      if (editingId === scheme.id) startNew();
                    }}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-quiet btn-sm mt-1" onClick={startNew}>
              {t('New scheme')}
            </button>
          </div>
        )}

        <label>
          <span className="field-label">{t('Name')}</span>
          <input
            className="field-input"
            maxLength={40}
            value={name}
            placeholder={t('Weekends, 2/2, night week…')}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div>
          <span className="field-label">{t('Repeats by')}</span>
          <Segmented
            value={kind}
            options={[
              { value: 'weekday', label: t('Day of week') },
              { value: 'cycle', label: t('Rotation') },
            ]}
            onChange={setKind}
          />
          <p className="field-hint mt-1">
            {t(
              kind === 'weekday'
                ? 'Fixed to the days of the week — for a rota that repeats weekly.'
                : 'Counts days from a start date, so 2/2 and 4/2 keep their step across months.',
            )}
          </p>
        </div>

        {kind === 'weekday' ? (
          <ul className="flex flex-col gap-2">
            {weekdays.map((day) => (
              <li key={day.day}>
                <span className="field-hint">{t(day.label)}</span>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {MARK_COLOURS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`h-5 w-5 rounded-full border-2 ${
                        byWeekday[day.day] === option.value ? 'border-ink' : 'border-transparent'
                      }`}
                      style={{ background: option.value }}
                      title={option.label}
                      onClick={() =>
                        // Clicking the colour already on a weekday clears it.
                        setByWeekday((current) => {
                          const next = { ...current };

                          if (next[day.day] === option.value) delete next[day.day];
                          else next[day.day] = option.value;

                          return next;
                        })
                      }
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="field-label">{t('Cycle length')}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={2}
                  max={31}
                  className="field-input"
                  value={cycle.length}
                  onChange={(event) => {
                    const length = Math.max(2, Math.min(31, Math.round(Number(event.target.value) || 2)));

                    setCycle((current) => Array.from({ length }, (_, index) => current[index] ?? null));
                  }}
                />
              </label>
              <label>
                <span className="field-label">{t('Starting')}</span>
                <input type="date" className="field-input" value={cycleFrom} onChange={(event) => setCycleFrom(event.target.value)} />
              </label>
            </div>

            <ul className="flex flex-col gap-2">
              {cycle.map((colour, index) => (
                <li key={index}>
                  <span className="field-hint">
                    {t('Day')} {index + 1}
                  </span>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {MARK_COLOURS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`h-5 w-5 rounded-full border-2 ${colour === option.value ? 'border-ink' : 'border-transparent'}`}
                        style={{ background: option.value }}
                        title={option.label}
                        onClick={() =>
                          setCycle((current) =>
                            current.map((value, position) =>
                              position === index ? (value === option.value ? null : option.value) : value,
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div>
          <span className="field-label">{t('Apply to')}</span>
          <Segmented
            value={scope}
            options={[
              { value: 'month', label: t('This month') },
              { value: 'ahead', label: t('Months ahead') },
              { value: 'range', label: t('Chosen dates') },
            ]}
            onChange={setScope}
          />
        </div>

        {scope === 'ahead' && (
          <label>
            <span className="field-label">{t('How many months')}</span>
            <input type="number" min={1} max={12} className="field-input" value={months} onChange={(event) => setMonths(Number(event.target.value) || 1)} />
            inputMode="decimal"
          </label>
        )}

        {scope === 'range' && (
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">{t('From')}</span>
              <input type="date" className="field-input" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              <span className="field-label">{t('To')}</span>
              <input type="date" min={from} className="field-input" value={until} onChange={(event) => setUntil(event.target.value)} />
            </label>
          </div>
        )}

        <p className="field-hint">
          {willPaint > 0 ? (
            <>
              {t('Colours')} <strong>{willPaint}</strong> / {dates.length} {t('days')}.
            </>
          ) : (
            t('Nothing to colour over those dates.')
          )}
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" disabled={!valid} onClick={save}>
            {t('Save scheme')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid || willPaint === 0}
            onClick={() => {
              void applyScheme(draft, dates);
              onClose();
            }}
          >
            {t('Colour the calendar')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
