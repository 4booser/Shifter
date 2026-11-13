import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { YearMonth } from '@/lib/calendar';
import { t, useLangValue } from '@/lib/i18n';
import {
  draftOf,
  draftProblem,
  HoursDraft,
  hoursOf,
  patternLabel,
  patternProblem,
  POSITION_MAX,
  positionHoursLine,
  PositionHoursMode,
  positionTaken,
  POSITIONS_MOST,
  RosterPattern,
  RosterPerson,
  RosterPosition,
  rosterProblem,
  RosterSheet,
  withoutPosition,
  withPerson,
  withPosition,
} from '@/lib/roster';
import { rosterApi } from '@/lib/roster-api';
import { byPosition, venueLine } from '@/lib/roster-rules';
import { toWeekHours, toWeekRows, WeekRow, weekRowsProblem } from '@/lib/week-rows';

import { OwnHoursFields, WeekRowsEditor } from './hours-fields';
import { PatternFields } from './pattern-fields';
import { ChipScroll, FullSheet, Segments } from './sheet';
import { makeRosterStyles } from './styles';

export type SettingsTab = 'hours' | 'positions' | 'days';

/** A change to the roster as the server answered it, and how many shifts it moved to a new usual time. */
export type SheetChange = (sheet: RosterSheet) => RosterSheet;

/** How long the crew's list waits after somebody's last tap before it saves them. */
const QUIET = 600;

/** The usual hours a venue is given at first, every day: the owner changes what differs. */
const FIRST_HOURS: WeekRow[] = [{ days: [1, 2, 3, 4, 5, 6, 7], start: '12:00', end: '00:00' }];

/**
 * What the roster runs on: the venue's hours, the positions and their hours,
 * and who works which days. Every change goes straight to the server, which
 * moves the shifts still to come that sat at the old usual time.
 */
export function SettingsSheet({
  rosterId,
  sheet,
  at,
  today,
  tab,
  forFill,
  palette,
  onTab,
  onClose,
  onChange,
}: {
  rosterId: number;
  sheet: RosterSheet;
  at: YearMonth;
  today: string;
  tab: SettingsTab;
  /** Opened by a fill that found nobody with working days. */
  forFill: boolean;
  palette: Palette;
  onTab: (tab: SettingsTab) => void;
  onClose: () => void;
  onChange: (change: SheetChange, restamped: number) => void;
}) {
  const styles = makeRosterStyles(palette);

  return (
    <FullSheet title={t('Настройки графика')} palette={palette} onClose={onClose}>
      <Segments
        options={[
          { value: 'hours', label: t('Часы работы') },
          { value: 'positions', label: t('Должности') },
          { value: 'days', label: t('Рабочие дни') },
        ]}
        value={tab}
        palette={palette}
        onChange={onTab}
      />

      <View style={styles.tabBody}>
        {tab === 'hours' && <VenueHours rosterId={rosterId} sheet={sheet} palette={palette} onChange={onChange} />}
        {tab === 'positions' && <Positions rosterId={rosterId} sheet={sheet} palette={palette} onChange={onChange} />}
        {tab === 'days' && (
          <CrewDays
            rosterId={rosterId}
            sheet={sheet}
            at={at}
            today={today}
            forFill={forFill}
            palette={palette}
            onChange={onChange}
          />
        )}
      </View>
    </FullSheet>
  );
}

/** The days the venue opens and its hours on each: the rest are closed. */
function VenueHours({
  rosterId,
  sheet,
  palette,
  onChange,
}: {
  rosterId: number;
  sheet: RosterSheet;
  palette: Palette;
  onChange: (change: SheetChange, restamped: number) => void;
}) {
  const styles = makeRosterStyles(palette);
  const lang = useLangValue();

  const [rows, setRows] = useState<WeekRow[]>(() => toWeekRows(sheet.venue_hours));
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const problem = weekRowsProblem(rows);
  const hours = problem === null ? toWeekHours(rows) : [];
  const preview = venueLine(hours, lang);

  const send = async (venue: typeof hours) => {
    setBusy(true);
    setFailed(null);

    try {
      const answer = await rosterApi.saveVenueHours(rosterId, venue);

      onChange((shown) => ({ ...shown, venue_hours: answer.venue_hours }), answer.restamped);
      setRows(toWeekRows(answer.venue_hours));
      setSaved(true);
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не сохранилось.')));
    } finally {
      setBusy(false);
      setArming(false);
    }
  };

  if (sheet.venue_hours.length === 0 && rows.length === 0) {
    return (
      <>
        <Text style={styles.lead}>
          {t('Видно всем в графике. По этим часам ставятся смены тех, у кого нет должности, и должностей «С открытия до закрытия».')}
        </Text>
        <Text style={styles.lead}>
          {t('Когда заведение закрыто, день в графике серый, и «Заполнить месяц» никого на него не ставит.')}
        </Text>
        {failed !== null && <Text style={styles.error}>{failed}</Text>}
        <Press
          style={styles.primary}
          onPress={() => {
            setSaved(false);
            setRows(FIRST_HOURS);
          }}
        >
          <Text style={styles.primaryText}>{t('Указать часы работы')}</Text>
        </Press>
      </>
    );
  }

  return (
    <>
      <WeekRowsEditor
        rows={rows}
        start="12:00"
        end="00:00"
        footnote={t('В остальные дни закрыто.')}
        palette={palette}
        onChange={(next) => {
          setSaved(false);
          setRows(next);
        }}
      />

      {preview !== null && (
        <View style={styles.venueLine}>
          <Ionicons name="time-outline" size={14} color={palette.textSecondary} />
          <Text style={styles.venueText}>{preview}</Text>
        </View>
      )}

      <Text style={styles.hint}>{t('Смены с сегодняшнего дня, стоящие на обычное время, перейдут на новое.')}</Text>

      {problem !== null && <Text style={styles.error}>{t(problem)}</Text>}
      {failed !== null && <Text style={styles.error}>{failed}</Text>}

      <Press
        style={[styles.primary, (busy || hours.length === 0) && styles.dimmed]}
        disabled={busy || hours.length === 0}
        onPress={() => void send(hours)}
      >
        <Text style={styles.primaryText}>{saved ? t('Сохранено') : t('Сохранить')}</Text>
      </Press>

      {sheet.venue_hours.length > 0 && (
        <Press
          style={styles.ghost}
          disabled={busy}
          onPress={() => (arming ? void send([]) : setArming(true))}
        >
          <Text style={[styles.ghostText, styles.dangerText]}>
            {arming ? t('Точно убрать часы работы? Нажмите ещё раз') : t('Убрать часы работы')}
          </Text>
        </Press>
      )}
    </>
  );
}

/** The roster's positions, each with where its hours come from. */
function Positions({
  rosterId,
  sheet,
  palette,
  onChange,
}: {
  rosterId: number;
  sheet: RosterSheet;
  palette: Palette;
  onChange: (change: SheetChange, restamped: number) => void;
}) {
  const styles = makeRosterStyles(palette);

  const [open, setOpen] = useState<number | 'new' | null>(null);

  const ordered = [...sheet.positions].sort((one, two) => one.id - two.id);

  return (
    <>
      {ordered.map((position) => (
        <View key={position.id}>
          <Press
            style={styles.positionRow}
            scale={0.99}
            onPress={() => setOpen((was) => (was === position.id ? null : position.id))}
          >
            <View style={styles.grow}>
              <Text style={styles.personName} numberOfLines={1}>
                {position.name}
              </Text>
              <Text style={styles.personPosition} numberOfLines={1}>
                {positionHoursLine(position.hours)}
              </Text>
            </View>
            <Ionicons
              name={open === position.id ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={palette.textSecondary}
            />
          </Press>

          {open === position.id && (
            <PositionForm
              key={position.id}
              rosterId={rosterId}
              position={position}
              sheet={sheet}
              palette={palette}
              onDone={() => setOpen(null)}
              onChange={onChange}
            />
          )}
        </View>
      ))}

      {open === 'new' ? (
        <PositionForm
          key="new"
          rosterId={rosterId}
          position={null}
          sheet={sheet}
          palette={palette}
          onDone={() => setOpen(null)}
          onChange={onChange}
        />
      ) : (
        sheet.positions.length < POSITIONS_MOST && (
          <Press style={styles.weekAdd} onPress={() => setOpen('new')}>
            <Ionicons name="add" size={16} color={palette.accent} />
            <Text style={styles.weekAddText}>{t('Добавить должность')}</Text>
          </Press>
        )
      )}
    </>
  );
}

/** One position's name and hours, opened in place under its row. */
function PositionForm({
  rosterId,
  position,
  sheet,
  palette,
  onDone,
  onChange,
}: {
  rosterId: number;
  /** Null for a new one. */
  position: RosterPosition | null;
  sheet: RosterSheet;
  palette: Palette;
  onDone: () => void;
  onChange: (change: SheetChange, restamped: number) => void;
}) {
  const styles = makeRosterStyles(palette);
  const lang = useLangValue();

  const [name, setName] = useState(position?.name ?? '');
  const [draft, setDraft] = useState<HoursDraft<PositionHoursMode>>(() =>
    draftOf(position?.hours ?? { mode: 'none', start_time: null, end_time: null, week_hours: [] }),
  );
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const venue = venueLine(sheet.venue_hours, lang);

  const modes: { mode: PositionHoursMode; label: string; sub: string | null }[] = [
    { mode: 'none', label: t('Без времени'), sub: t('Просто кто в какой день') },
    { mode: 'own', label: t('Свои часы'), sub: null },
    { mode: 'venue', label: t('С открытия до закрытия'), sub: venue ?? t('Сначала укажите часы работы.') },
  ];

  const save = async () => {
    const wanted = name.trim();

    if (wanted === '') return;

    if (positionTaken(sheet.positions, wanted, position?.id ?? null)) {
      setFailed(t('Такая должность уже есть.'));

      return;
    }

    const problem = draftProblem(draft);

    if (problem !== null) {
      setFailed(t(problem));

      return;
    }

    setBusy(true);
    setFailed(null);

    const body = { name: wanted, hours: hoursOf(draft) };

    try {
      if (position === null) {
        const added = await rosterApi.addPosition(rosterId, body);

        onChange((shown) => withPosition(shown, added), 0);
      } else {
        const { restamped, ...saved } = await rosterApi.updatePosition(rosterId, position.id, body);

        onChange((shown) => withPosition(shown, saved), restamped);
      }

      onDone();
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не сохранилось.')));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (position === null) return;

    if (!arming) {
      setArming(true);

      return;
    }

    setBusy(true);
    setFailed(null);

    try {
      const { restamped } = await rosterApi.removePosition(rosterId, position.id);

      onChange((shown) => withoutPosition(shown, position.id), restamped);
      onDone();
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не получилось.')));
      setBusy(false);
    }
  };

  return (
    <View style={[styles.weekRow, styles.tabBody]}>
      <Text style={styles.fieldLabel}>{t('Должность')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        autoFocus={position === null}
        maxLength={POSITION_MAX}
        placeholder={t('Бармен, кальянщик, админ')}
        placeholderTextColor={palette.textSecondary}
      />

      {modes.map(({ mode, label, sub }) => (
        <View key={mode}>
          <Press style={styles.radio} scale={0.99} onPress={() => setDraft({ ...draft, mode })}>
            <Ionicons
              name={draft.mode === mode ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={draft.mode === mode ? palette.accent : palette.textSecondary}
            />
            <View style={styles.grow}>
              <Text style={styles.radioText}>{label}</Text>
              {sub !== null && <Text style={styles.radioSub}>{sub}</Text>}
            </View>
          </Press>

          {mode === 'own' && draft.mode === 'own' && (
            <OwnHoursFields draft={draft} palette={palette} onChange={setDraft} />
          )}
        </View>
      ))}

      {position !== null && (
        <Text style={styles.hint}>{t('Смены с сегодняшнего дня, стоящие на обычное время, перейдут на новое.')}</Text>
      )}

      {failed !== null && <Text style={styles.error}>{failed}</Text>}

      <Press
        style={[styles.primary, (busy || name.trim() === '') && styles.dimmed]}
        disabled={busy || name.trim() === ''}
        onPress={() => void save()}
      >
        <Text style={styles.primaryText}>{t('Сохранить')}</Text>
      </Press>

      {position !== null && (
        <Press style={styles.ghost} disabled={busy} onPress={() => void remove()}>
          <Text style={[styles.ghostText, styles.dangerText]}>
            {arming ? t('Точно удалить? Люди останутся, просто без должности') : t('Удалить должность')}
          </Text>
        </Press>
      )}
    </View>
  );
}

/** What a person in the crew's list has been changed to and not yet heard back about. */
interface Pending {
  position_id: number | null;
  pattern: RosterPattern;
}

/**
 * The whole crew's position and working days on one screen, so ten people are
 * set up without opening ten forms. A row shows a change at once and saves it
 * once the taps on it stop.
 */
function CrewDays({
  rosterId,
  sheet,
  at,
  today,
  forFill,
  palette,
  onChange,
}: {
  rosterId: number;
  sheet: RosterSheet;
  at: YearMonth;
  today: string;
  forFill: boolean;
  palette: Palette;
  onChange: (change: SheetChange, restamped: number) => void;
}) {
  const styles = makeRosterStyles(palette);

  const [changed, setChanged] = useState<Record<number, Pending>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // Read when a save goes out, which is after the render that queued it.
  const latest = useRef({ sheet, onChange });
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const queued = useRef(new Map<number, Pending>());
  const flying = useRef(new Map<number, Promise<void>>());

  useEffect(() => {
    latest.current = { sheet, onChange };
  }, [sheet, onChange]);

  /** The person's latest change, as it stands when its turn comes. */
  const save = async (personId: number) => {
    const pending = queued.current.get(personId);
    const person = latest.current.sheet.people.find((one) => one.id === personId);

    queued.current.delete(personId);

    if (pending === undefined || person === undefined) return;

    try {
      const { restamped, ...saved } = await rosterApi.updatePerson(rosterId, personId, {
        name: person.name,
        colour: person.colour,
        position_id: pending.position_id,
        hours: person.hours,
        pattern: pending.pattern,
      });

      latest.current.onChange((shown) => withPerson(shown, saved), restamped);
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не сохранилось.')));
    }
  };

  /** One save per person at a time, so an older answer never lands over a newer one. */
  const send = (personId: number) => {
    timers.current.delete(personId);

    const run = (flying.current.get(personId) ?? Promise.resolve()).then(() => save(personId));

    flying.current.set(personId, run);

    return run;
  };

  // Closing the sheet does not lose a change still waiting out its quiet.
  useEffect(() => {
    const waiting = timers.current;

    return () => {
      for (const [personId, timer] of waiting) {
        clearTimeout(timer);
        void send(personId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A row as the owner last left it, saved or not. */
  const shownOf = (person: RosterPerson): Pending =>
    changed[person.id] ?? { position_id: person.position_id, pattern: person.pattern };

  const change = (person: RosterPerson, over: Partial<Pending>) => {
    const next = { ...shownOf(person), ...over };

    setChanged((was) => ({ ...was, [person.id]: next }));
    setFailed(null);

    const waiting = timers.current.get(person.id);

    if (waiting !== undefined) clearTimeout(waiting);

    // Half a rhythm is not sent: the row says what is missing.
    if (patternProblem(next.pattern) !== null) {
      timers.current.delete(person.id);
      queued.current.delete(person.id);

      return;
    }

    queued.current.set(person.id, next);
    timers.current.set(person.id, setTimeout(() => void send(person.id), QUIET));
  };

  return (
    <>
      {forFill && (
        <Text style={styles.lead}>
          {t('Отметьте, кто по каким дням работает, и нажмите «Заполнить месяц» ещё раз.')}
        </Text>
      )}

      {failed !== null && <Text style={styles.error}>{failed}</Text>}

      {byPosition(sheet.people, sheet.positions).map((person) => {
        const shown = shownOf(person);

        return (
          <View key={person.id} style={styles.crewRow}>
            <View style={styles.crewHead}>
              <View style={[styles.dot, { backgroundColor: person.colour }]} />
              <Text style={[styles.personName, styles.grow]} numberOfLines={1}>
                {person.name}
              </Text>
              <Press
                style={[styles.chipSmall, open === person.id && styles.chipOn]}
                onPress={() => setOpen((was) => (was === person.id ? null : person.id))}
              >
                <Text style={[styles.chipSmallText, open === person.id && styles.chipTextOn]} numberOfLines={1}>
                  {patternLabel(shown.pattern, at)}
                </Text>
              </Press>
            </View>

            {sheet.positions.length > 0 && (
              <ChipScroll palette={palette}>
                {[null, ...sheet.positions].map((position) => {
                  const on = (position?.id ?? null) === shown.position_id;

                  return (
                    <Press
                      key={position?.id ?? 'none'}
                      style={[styles.chipSmall, on && styles.chipOn]}
                      onPress={() => change(person, { position_id: position?.id ?? null })}
                    >
                      <Text style={[styles.chipSmallText, on && styles.chipTextOn]} numberOfLines={1}>
                        {position?.name ?? t('Без должности')}
                      </Text>
                    </Press>
                  );
                })}
              </ChipScroll>
            )}

            {open === person.id && (
              <PatternFields
                pattern={shown.pattern}
                at={at}
                today={today}
                palette={palette}
                onChange={(pattern) => change(person, { pattern })}
              />
            )}
          </View>
        );
      })}
    </>
  );
}
