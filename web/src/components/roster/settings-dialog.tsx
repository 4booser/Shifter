'use client';

import { useState } from 'react';

import type {
  PositionHoursMode,
  RosterMonth,
  RosterPersonSave,
  RosterPosition,
  RosterPositionSave,
} from '@/lib/api/roster';
import type { WeekHours } from '@/lib/calendar/models';
import { WeekRow, flatOf, rowsOf } from '@/lib/calendar/shift-hours';
import { useI18n } from '@/lib/i18n';
import { useArmed } from '@/lib/live/arm';
import { monthOfKey } from '@/lib/roster/month';
import { HoursDraft, MAX_POSITIONS, POSITION_LENGTH, draftOf, hoursOf, rowsReady } from '@/lib/roster/people';
import { venueLine } from '@/lib/roster/rules';
import { Segmented } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { CrewDays } from './crew-days';
import { OwnHoursFields, WeekRowsEditor } from './hours-editor';

export type SettingsTab = 'hours' | 'positions' | 'days';

/** What a venue opening every day at noon and closing at midnight looks like: the row a first press starts from. */
const EVERY_DAY: WeekRow = { weekdays: [1, 2, 3, 4, 5, 6, 7], start: '12:00', end: '00:00' };

/** The same week either way, whatever order its days were typed in. */
const sameWeek = (one: WeekHours[], two: WeekHours[]): boolean =>
  JSON.stringify(flatOf(rowsOf(one))) === JSON.stringify(flatOf(rowsOf(two)));

/** What the venue's hours do, said where they are set: who takes them, and what a closed day means. */
function VenueHints({ moving }: { moving: boolean }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-1">
      <p className="field-hint">
        {t('Everyone sees these on the schedule. Shifts take these hours for people with no position and for positions set to “Opening to closing”.')}
      </p>
      <p className="field-hint">
        {t('When the venue is closed, the day is grey on the schedule and “Fill the month” puts nobody on it.')}
      </p>
      {moving && <p className="field-hint">{t('Shifts from today that sit at the usual time move to the new one.')}</p>}
    </div>
  );
}

/** The venue's week. Nothing set is a choice too: no day is closed and nobody takes the venue's time. */
function VenueHours({
  stored,
  busy,
  onSave,
}: {
  stored: WeekHours[];
  busy: boolean;
  onSave: (venue: WeekHours[]) => Promise<boolean>;
}) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<WeekRow[]>(() => rowsOf(stored));

  const remove = useArmed(() => {
    void onSave([]).then((saved) => {
      if (saved) setRows([]);
    });
  });

  if (rows.length === 0 && stored.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <VenueHints moving={false} />
        <button type="button" className="btn btn-primary self-start" onClick={() => setRows([EVERY_DAY])}>
          <Icon name="clock" size={14} />
          {t('Set opening hours')}
        </button>
      </div>
    );
  }

  const week = flatOf(rows);
  const line = venueLine(week, lang);

  return (
    <div className="flex flex-col gap-3">
      <WeekRowsEditor
        rows={rows}
        start={EVERY_DAY.start}
        end={EVERY_DAY.end}
        emptyHint={t('Closed on the other days.')}
        onChange={setRows}
      />

      {line !== null && rowsReady(rows) && (
        <p className="flex items-start gap-1.5 text-[0.86rem]">
          <Icon name="clock" size={14} className="mt-0.5 flex-none text-muted" />
          {line}
        </p>
      )}

      <VenueHints moving={stored.length > 0} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || rows.length === 0 || !rowsReady(rows) || sameWeek(week, stored)}
          onClick={() => void onSave(week)}
        >
          {t('Save')}
        </button>
        {stored.length > 0 && (
          <button
            type="button"
            className={`btn btn-sm ${remove.armed ? 'btn-armed' : 'btn-quiet'}`}
            disabled={busy}
            onClick={remove.press}
          >
            <Icon name="trash" size={13} />
            {t(remove.armed ? 'Press again to remove' : 'Remove opening hours')}
          </button>
        )}
      </div>
    </div>
  );
}

/** A position's hours in a few words, for its row in the list. */
export function positionHoursLabel(position: RosterPosition, t: (key: string) => string): string {
  const { mode, start_time, end_time, week_hours } = position.hours;

  if (mode === 'venue') return t('Opening to closing');
  if (mode !== 'own' || start_time === null || end_time === null) return t('No set time');

  return `${start_time}–${end_time}${week_hours.length > 0 ? ` · ${t('varies by day')}` : ''}`;
}

/** One position, new or as it stands. Saved with a button: a change of hours moves shifts already placed, which should not happen a keystroke at a time. */
function PositionForm({
  position,
  positions,
  venueHours,
  busy,
  onSave,
  onRemove,
  onDone,
}: {
  position: RosterPosition | null;
  positions: RosterPosition[];
  venueHours: WeekHours[];
  busy: boolean;
  onSave: (save: RosterPositionSave) => Promise<boolean>;
  onRemove: () => void;
  onDone: () => void;
}) {
  const { t, lang } = useI18n();
  const [name, setName] = useState(position?.name ?? '');
  const [hours, setHours] = useState<HoursDraft<PositionHoursMode>>(() =>
    draftOf(position?.hours ?? { mode: 'none', start_time: null, end_time: null, week_hours: [] }),
  );
  const [problem, setProblem] = useState<string | null>(null);

  const remove = useArmed(onRemove);
  const venue = venueLine(venueHours, lang);
  const clean = hoursOf(hours);

  const save = async () => {
    const trimmed = name.trim();
    const taken = positions.some(
      (other) => other.id !== position?.id && other.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );

    if (trimmed === '') return setProblem(t('Position is required.'));
    if (taken) return setProblem(t('A position with that name is already on this roster.'));
    if (clean === null) return;

    setProblem(null);

    if (await onSave({ name: trimmed, hours: clean })) onDone();
  };

  const modes: { mode: PositionHoursMode; label: string; sub: string | null }[] = [
    { mode: 'none', label: t('No set time'), sub: t('Just who works which day') },
    { mode: 'own', label: t('Own hours'), sub: null },
    { mode: 'venue', label: t('Opening to closing'), sub: venue ?? t('Set opening hours first.') },
  ];

  return (
    <form
      className="flex flex-col gap-3 rounded-(--radius) border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label>
        <span className="field-label">{t('Position')}</span>
        <input
          className="field-input"
          maxLength={POSITION_LENGTH}
          placeholder={t('Bartender, hookah master, admin')}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setProblem(null);
          }}
        />
      </label>
      {problem !== null && <p className="field-hint !text-danger-read">{problem}</p>}

      {/* A list rather than a segmented control, so the long label fits a phone. */}
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t('Hours')}>
        {modes.map(({ mode, label, sub }) => (
          <div key={mode} className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                className="mt-1"
                name="position-hours"
                checked={hours.mode === mode}
                onChange={() => setHours((draft) => ({ ...draft, mode }))}
              />
              <span className="min-w-0">
                <span className="block text-[0.9rem] font-medium">{label}</span>
                {sub !== null && <span className="field-hint block">{sub}</span>}
              </span>
            </label>
            {mode === 'own' && hours.mode === 'own' && (
              <div className="ml-6">
                <OwnHoursFields hours={hours} onChange={setHours} />
              </div>
            )}
          </div>
        ))}
      </div>

      {position !== null && (
        <p className="field-hint">{t('Shifts from today that sit at the usual time move to the new one.')}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy || clean === null}>
          {t('Save')}
        </button>
        <button type="button" className="btn btn-sm btn-quiet" onClick={onDone}>
          {t('Cancel')}
        </button>
      </div>

      {position !== null && (
        <div className="flex flex-col items-start gap-1 border-t border-border pt-2.5">
          <button
            type="button"
            className={`btn btn-sm ${remove.armed ? 'btn-armed' : ''}`}
            disabled={busy}
            onClick={remove.press}
          >
            <Icon name="trash" size={13} />
            {t(remove.armed ? 'Press again to delete' : 'Delete position')}
          </button>
          <p className="field-hint">{t('People keep their place on the schedule, just without this position.')}</p>
        </div>
      )}
    </form>
  );
}

/** The roster's positions, each with its hours, edited in place. */
function Positions({
  positions,
  venueHours,
  busy,
  onAdd,
  onSave,
  onRemove,
}: {
  positions: RosterPosition[];
  venueHours: WeekHours[];
  busy: boolean;
  onAdd: (save: RosterPositionSave) => Promise<RosterPosition | null>;
  onSave: (id: number, save: RosterPositionSave) => Promise<boolean>;
  /** Whether it went. When it did not, the form stays open under the reason. */
  onRemove: (id: number) => Promise<boolean>;
}) {
  const { t } = useI18n();
  // Which one is open: a position's id, 'new', or none.
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  const done = () => setEditing(null);

  return (
    <div className="flex flex-col gap-2">
      {positions.length === 0 && editing !== 'new' && <p className="field-hint">{t('No positions yet.')}</p>}

      <ul className="flex flex-col gap-1.5">
        {positions.map((position) =>
          editing === position.id ? (
            <li key={position.id}>
              <PositionForm
                position={position}
                positions={positions}
                venueHours={venueHours}
                busy={busy}
                onSave={(save) => onSave(position.id, save)}
                onRemove={() =>
                  void onRemove(position.id).then((removed) => {
                    if (removed) done();
                  })
                }
                onDone={done}
              />
            </li>
          ) : (
            <li key={position.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-(--radius) border border-border px-3 py-2 text-left hover:bg-surface-2"
                onClick={() => setEditing(position.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.92rem] font-medium">{position.name}</span>
                  <span className="field-hint block truncate">{positionHoursLabel(position, t)}</span>
                </span>
                <Icon name="sliders" size={14} className="flex-none text-muted" />
              </button>
            </li>
          ),
        )}
      </ul>

      {editing === 'new' ? (
        <PositionForm
          position={null}
          positions={positions}
          venueHours={venueHours}
          busy={busy}
          onSave={async (save) => (await onAdd(save)) !== null}
          onRemove={done}
          onDone={done}
        />
      ) : (
        positions.length < MAX_POSITIONS && (
          <button type="button" className="btn btn-sm self-start" onClick={() => setEditing('new')}>
            <Icon name="plus" size={13} />
            {t('Add a position to the schedule')}
          </button>
        )
      )}
    </div>
  );
}

/** Everything about a roster that is not a day: when the venue opens, its positions, and who works which days. Opened on demand, so it loads on demand. */
export default function RosterSettings({
  tab,
  onTab,
  forFill,
  sheet,
  busy,
  onSaveVenue,
  onAddPosition,
  onSavePosition,
  onRemovePosition,
  onEditPerson,
}: {
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  forFill: boolean;
  sheet: RosterMonth;
  busy: boolean;
  onSaveVenue: (venue: WeekHours[]) => Promise<boolean>;
  onAddPosition: (save: RosterPositionSave) => Promise<RosterPosition | null>;
  onSavePosition: (id: number, save: RosterPositionSave) => Promise<boolean>;
  onRemovePosition: (id: number) => Promise<boolean>;
  onEditPerson: (id: number, save: RosterPersonSave) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      {/* Three short tabs across the dialog, which a 320 px phone still fits. */}
      <div className="[&_.seg-btn]:flex-1 [&_.seg-btn]:!px-1 [&_.seg-btn]:!text-[0.78rem] [&_.seg]:!flex">
        <Segmented<SettingsTab>
          value={tab}
          options={[
            { value: 'hours', label: t('Opening hours') },
            { value: 'positions', label: t('Positions') },
            { value: 'days', label: t('Working days') },
          ]}
          onChange={onTab}
        />
      </div>

      {tab === 'hours' && <VenueHours stored={sheet.venue_hours} busy={busy} onSave={onSaveVenue} />}

      {tab === 'positions' && (
        <Positions
          positions={sheet.positions}
          venueHours={sheet.venue_hours}
          busy={busy}
          onAdd={onAddPosition}
          onSave={onSavePosition}
          onRemove={onRemovePosition}
        />
      )}

      {tab === 'days' &&
        (sheet.people.length === 0 ? (
          <p className="field-hint">{t('Add the people who work here: a name, a position and the days they work. Nobody gets an invitation.')}</p>
        ) : (
          <CrewDays
            people={sheet.people}
            positions={sheet.positions}
            month={monthOfKey(sheet.month)}
            forFill={forFill}
            onEditPerson={onEditPerson}
          />
        ))}
    </div>
  );
}
