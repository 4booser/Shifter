'use client';

import type { RosterPattern } from '@/lib/api/roster';
import { WEEKDAY_LABELS, YearMonth, fromKey, todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { monthKey, monthWeeks } from '@/lib/roster/month';
import { worksOn } from '@/lib/roster/rules';
import { Segmented } from '@/components/ui/bits';

/** The rhythms most crews run, a tap each. */
const PRESETS: [number, number][] = [
  [2, 2],
  [3, 3],
  [5, 2],
  [1, 3],
];

/** Where a new rhythm starts: today when it is in the month on screen, its 1st otherwise. */
const startOf = (month: YearMonth, today = todayKey()): string =>
  today.startsWith(monthKey(month)) ? today : `${monthKey(month)}-01`;

/**
 * The month on screen as a calendar, the days the rhythm works filled in as it
 * changes, and a tap on any of them to start it there. A first day outside the
 * month is shown as a line and left as it is, so a rhythm set in another month
 * never moves for being looked at.
 */
export function MonthPick({
  month,
  pattern,
  onPick,
}: {
  month: YearMonth;
  pattern: RosterPattern;
  onPick: (from: string) => void;
}) {
  const { t, lang } = useI18n();
  const say = (date: string) =>
    new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(fromKey(date));
  const outside = pattern.from !== null && !pattern.from.startsWith(monthKey(month));

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1 text-center text-[0.68rem] font-medium text-faint" aria-hidden>
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{t(label)}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthWeeks(month)
          .flat()
          .map((date, index) => {
            if (date === null) return <span key={`pad-${index}`} />;

            const works = worksOn(pattern, date);
            const first = date === pattern.from;

            return (
              <button
                key={date}
                type="button"
                className={`btn btn-sm !px-0 tabular ${works ? '!border-transparent !bg-(--accent-soft) font-bold !text-(--accent-read)' : 'btn-quiet'} ${first ? 'ring-2 ring-(--accent)' : ''}`}
                aria-label={say(date)}
                aria-pressed={first}
                data-works={works || undefined}
                onClick={() => onPick(date)}
              >
                {Number(date.slice(8))}
              </button>
            );
          })}
      </div>
      {outside && pattern.from !== null && (
        <p className="field-hint">
          {t('Starts on')} {say(pattern.from)}
        </p>
      )}
    </div>
  );
}

/** Which days somebody usually works: by hand, some weekdays, or a rhythm of days on and off. */
export function PatternFields({
  pattern,
  month,
  onChange,
}: {
  pattern: RosterPattern;
  month: YearMonth;
  onChange: (pattern: RosterPattern) => void;
}) {
  const { t } = useI18n();

  const cycle = (on: number | null, off: number | null) =>
    onChange({ ...pattern, kind: 'cycle', on, off, from: pattern.from ?? startOf(month) });

  const count = (value: string): number | null => (value === '' ? null : Number(value));

  return (
    <div className="flex flex-col gap-2.5">
      {/* Across the box and tighter than a page's, so the three fit a 320 px phone. */}
      <div className="[&_.seg-btn]:flex-1 [&_.seg-btn]:!px-1.5 [&_.seg]:!flex">
        <Segmented<RosterPattern['kind']>
          value={pattern.kind}
          options={[
            { value: 'none', label: t('By hand') },
            { value: 'weekdays', label: t('Days of the week') },
            // Not a phrase, so nothing to translate.
            { value: 'cycle', label: '2/2, 3/3…' },
          ]}
          onChange={(kind) =>
            kind === 'cycle' ? cycle(pattern.on ?? 2, pattern.off ?? 2) : onChange({ ...pattern, kind })
          }
        />
      </div>

      {pattern.kind === 'weekdays' && (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((label, day) => {
              const picked = pattern.weekdays.includes(day + 1);

              return (
                <button
                  key={label}
                  type="button"
                  className={`btn btn-sm !px-0 ${picked ? 'btn-primary' : 'btn-quiet'}`}
                  aria-pressed={picked}
                  onClick={() =>
                    onChange({
                      ...pattern,
                      weekdays: picked
                        ? pattern.weekdays.filter((one) => one !== day + 1)
                        : [...pattern.weekdays, day + 1].sort((one, two) => one - two),
                    })
                  }
                >
                  {t(label)}
                </button>
              );
            })}
          </div>
          {pattern.weekdays.length === 0 && <p className="field-hint !text-danger-read">{t('Pick at least one day.')}</p>}
        </div>
      )}

      {pattern.kind === 'cycle' && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([on, off]) => {
              const chosen = pattern.on === on && pattern.off === off;

              return (
                <button
                  key={`${on}/${off}`}
                  type="button"
                  className={`chip tabular !text-[0.82rem] ${chosen ? 'chip-accent' : 'hover:bg-surface-2'}`}
                  aria-pressed={chosen}
                  onClick={() => cycle(on, off)}
                >
                  {on}/{off}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">{t('Days on')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                className="field-input"
                value={pattern.on ?? ''}
                onChange={(event) => cycle(count(event.target.value), pattern.off)}
              />
            </label>
            <label>
              <span className="field-label">{t('Days off')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                className="field-input"
                value={pattern.off ?? ''}
                onChange={(event) => cycle(pattern.on, count(event.target.value))}
              />
            </label>
          </div>

          <div>
            <span className="field-label">{t('Starts on')}</span>
            <MonthPick month={month} pattern={pattern} onPick={(from) => onChange({ ...pattern, from })} />
          </div>
        </div>
      )}
    </div>
  );
}
