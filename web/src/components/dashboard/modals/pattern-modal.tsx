'use client';

import { useState } from 'react';

import {
  addMonths,
  currentMonth,
  keysBetween,
  monthBounds,
  shiftDays,
  todayKey,
} from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/lib/settings/store';
import { calendarActions, paintPattern, patternTemplateFor, useCalendar } from '@/lib/store/calendar';
import { Segmented } from '@/components/ui/bits';
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

/**
 * Which shift belongs on which weekday — the shape most people actually
 * describe when asked what they work. With a pattern set, the calendar's
 * paint mode stops needing a template picked first.
 */
export function PatternModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, n } = useI18n();
  const allTemplates = useCalendar((state) => state.templates);
  const templates = allTemplates.filter((template) => !template.archived);
  const month = useCalendar((state) => state.month);
  const settings = useSettings((state) => state.settings);
  const setWeekdayShift = useSettings((state) => state.setWeekdayShift);
  const clearWeekdayShifts = useSettings((state) => state.clearWeekdayShifts);

  const [scope, setScope] = useState<Scope>('month');
  const [months, setMonths] = useState(3);
  const [from, setFrom] = useState(todayKey());
  const [until, setUntil] = useState(shiftDays(todayKey(), 30));

  const weekdays = settings.mondayFirst ? WEEKDAYS : [WEEKDAYS[6], ...WEEKDAYS.slice(0, 6)];
  const hasPattern = Object.values(settings.weekdayShifts).some((id) => typeof id === 'number');

  const dates = (() => {
    if (scope === 'month') {
      const bounds = monthBounds(`${month.year}-${`${month.month}`.padStart(2, '0')}-01`);

      return keysBetween(bounds.from, bounds.to);
    }

    // From today to the end of the last month asked for: "three months ahead"
    // means whole months, not ninety days.
    if (scope === 'ahead') {
      const target = addMonths(currentMonth(), months - 1);
      const bounds = monthBounds(`${target.year}-${`${target.month}`.padStart(2, '0')}-01`);

      return keysBetween(todayKey(), bounds.to);
    }

    return until < from ? [] : keysBetween(from, until);
  })();

  const willPlace = dates.filter((key) => patternTemplateFor(key) !== null).length;

  return (
    <Modal open={open} title={t('Weekly pattern')} onClose={onClose}>
      {templates.length === 0 ? (
        <p className="field-hint">{t('Create a shift first — a pattern needs something to place.')}</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          <p className="field-hint">
            {t('Say what you work on each weekday. Then click the days you actually worked and each one takes its own shift.')}
          </p>

          <ul className="flex flex-col gap-1.5">
            {weekdays.map((weekday) => (
              <li key={weekday.day} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                <span className="text-[0.85rem] font-medium">{t(weekday.label)}</span>
                <select
                  className="field-input"
                  value={settings.weekdayShifts[weekday.day] ?? ''}
                  onChange={(event) =>
                    setWeekdayShift(weekday.day, event.target.value === '' ? null : Number(event.target.value))
                  }
                >
                  <option value="">{t('Nothing')}</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.start_time}–{template.end_time}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>

          <div>
            <span className="field-label">{t('Fill at once')}</span>
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
              <input type="number" min={1} max={12} className="field-input" value={months} onChange={(event) => setMonths(Number(event.target.value) || 1)} inputMode="decimal" />
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
            {willPlace > 0 ? (
              <>
                {t('Will place')} <strong>{n(willPlace, 'shifts')}</strong> {t('over')} {n(dates.length, 'days')}.
              </>
            ) : (
              t('Nothing to place over those dates.')
            )}
          </p>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-quiet" disabled={!hasPattern} onClick={clearWeekdayShifts}>
              {t('Clear')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!hasPattern}
              onClick={() => {
                calendarActions.togglePatternBrush();
                onClose();
              }}
            >
              {t('Click day by day')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!hasPattern || willPlace === 0}
              onClick={() => {
                paintPattern(dates);
                onClose();
              }}
            >
              {t('Fill')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
