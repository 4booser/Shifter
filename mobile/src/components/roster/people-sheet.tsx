import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { YearMonth } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import {
  draftOf,
  draftProblem,
  HoursDraft,
  hoursOf,
  INHERIT,
  MOST_PEOPLE,
  NAME_MAX,
  nextColour,
  nextFrom,
  NO_PATTERN,
  patternLabel,
  patternProblem,
  PersonHoursMode,
  POSITION_MAX,
  positionTaken,
  POSITIONS_MOST,
  ROSTER_COLOURS,
  RosterPattern,
  RosterPerson,
  RosterPosition,
  rosterProblem,
  RosterSheet,
} from '@/lib/roster';
import { rosterApi } from '@/lib/roster-api';
import { byPosition } from '@/lib/roster-rules';

import { OwnHoursFields } from './hours-fields';
import { PatternFields } from './pattern-fields';
import { ChipScroll, FullSheet, Fold, Segments } from './sheet';
import { makeRosterStyles } from './styles';

/** A new position starts with no set time: opening hours are not when the staff come in. */
const NO_SET_TIME: RosterPosition['hours'] = { mode: 'none', start_time: null, end_time: null, week_hours: [] };

/** Who is on the roster, what they do and when they usually work. Names, not accounts: nobody here ever signs in. */
export function PeopleSheet({
  rosterId,
  sheet,
  at,
  today,
  palette,
  onClose,
  onSaved,
  onPosition,
  onRemove,
}: {
  rosterId: number;
  sheet: RosterSheet;
  /** The month shown, which the usual-days grid shows too. */
  at: YearMonth;
  today: string;
  palette: Palette;
  onClose: () => void;
  /** A person as the server answered, and how many shifts moved to their new usual time. */
  onSaved: (person: RosterPerson, restamped: number) => void;
  onPosition: (position: RosterPosition) => void;
  onRemove: (person: RosterPerson) => Promise<void>;
}) {
  const styles = makeRosterStyles(palette);
  const nameBox = useRef<TextInput>(null);
  const { people, positions } = sheet;

  const [editing, setEditing] = useState<RosterPerson | null>(null);
  const [name, setName] = useState('');
  const [colour, setColour] = useState(nextColour(people));
  const [positionId, setPositionId] = useState<number | null>(null);
  const [hours, setHours] = useState<HoursDraft<PersonHoursMode>>(draftOf(INHERIT));
  const [pattern, setPattern] = useState<RosterPattern>(NO_PATTERN);
  const [daysOpen, setDaysOpen] = useState(true);
  const [ownOpen, setOwnOpen] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const pick = (person: RosterPerson | null) => {
    setEditing(person);
    setName(person?.name ?? '');
    setColour(person?.colour ?? nextColour(people));
    setPositionId(person?.position_id ?? null);
    setHours(draftOf(person?.hours ?? INHERIT));
    setPattern(person?.pattern ?? NO_PATTERN);
    setDaysOpen(person === null || person.pattern.kind !== 'none');
    setOwnOpen(person?.hours.mode === 'own');
    setNaming(null);
    setArming(false);
    setFailed(null);
  };

  const addPosition = async () => {
    const wanted = (naming ?? '').trim();

    if (wanted === '' || wanted.length > POSITION_MAX) return;

    if (positionTaken(positions, wanted)) {
      setFailed(t('Такая должность уже есть.'));

      return;
    }

    if (positions.length >= POSITIONS_MOST) {
      setFailed(t('Больше 20 должностей не поместится.'));

      return;
    }

    setBusy(true);
    setFailed(null);

    try {
      const added = await rosterApi.addPosition(rosterId, { name: wanted, hours: NO_SET_TIME });

      onPosition(added);
      setPositionId(added.id);
      setNaming(null);
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не сохранилось.')));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (name.trim() === '') return;

    if (editing === null && people.length >= MOST_PEOPLE) {
      setFailed(t('В одном графике не больше 60 человек.'));

      return;
    }

    const problem = draftProblem(hours) ?? patternProblem(pattern);

    if (problem !== null) {
      setFailed(t(problem));

      return;
    }

    setBusy(true);
    setFailed(null);

    const body = { name: name.trim(), colour, position_id: positionId, hours: hoursOf(hours), pattern };

    try {
      if (editing === null) {
        const added = await rosterApi.addPerson(rosterId, body);

        onSaved(added, 0);

        // Tolik, Grisha and Pasha go in one after another, and are mostly the
        // same kind: only the name and the colour move on, and the second of
        // a 2/2 pair takes the days the first one is off.
        setName('');
        setColour(nextColour([...people, added]));
        setPattern(nextFrom(pattern));
        nameBox.current?.focus();
      } else {
        const { restamped, ...saved } = await rosterApi.updatePerson(rosterId, editing.id, body);

        onSaved(saved, restamped);
        pick(null);
      }
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не сохранилось.')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (editing === null) return;

    if (!arming) {
      setArming(true);

      return;
    }

    setBusy(true);
    setFailed(null);

    try {
      await onRemove(editing);
      pick(null);
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не получилось.')));
    } finally {
      setBusy(false);
    }
  };

  const inherited = positionId === null ? t('Как у заведения') : t('Как у должности');

  return (
    <FullSheet
      title={editing === null ? t('Добавить человека') : editing.name}
      palette={palette}
      onClose={onClose}
    >
      <Text style={styles.fieldLabel}>{t('Имя')}</Text>
      <TextInput
        ref={nameBox}
        style={styles.input}
        value={name}
        onChangeText={setName}
        maxLength={NAME_MAX}
        autoCapitalize="words"
        placeholder={t('Толик')}
        placeholderTextColor={palette.textSecondary}
      />

      <Text style={styles.fieldLabel}>{t('Должность')}</Text>
      {naming === null ? (
        <ChipScroll palette={palette}>
          {[null, ...positions].map((position) => {
            const on = (position?.id ?? null) === positionId;

            return (
              <Press
                key={position?.id ?? 'none'}
                style={[styles.chipSmall, on && styles.chipOn]}
                onPress={() => setPositionId(position?.id ?? null)}
              >
                <Text style={[styles.chipSmallText, on && styles.chipTextOn]} numberOfLines={1}>
                  {position?.name ?? t('Без должности')}
                </Text>
              </Press>
            );
          })}
          <Press style={styles.chipSmall} onPress={() => setNaming('')}>
            <Text style={[styles.chipSmallText, styles.quietText]}>+ {t('Новая должность')}</Text>
          </Press>
        </ChipScroll>
      ) : (
        <View style={styles.weekTimes}>
          <TextInput
            style={[styles.input, styles.grow]}
            value={naming}
            onChangeText={setNaming}
            onSubmitEditing={() => void addPosition()}
            autoFocus
            maxLength={POSITION_MAX}
            placeholder={t('Бармен, кальянщик, админ')}
            placeholderTextColor={palette.textSecondary}
          />
          <Press
            style={[styles.quiet, (busy || naming.trim() === '') && styles.dimmed]}
            disabled={busy || naming.trim() === ''}
            onPress={() => void addPosition()}
          >
            <Text style={styles.quietText}>{t('Добавить')}</Text>
          </Press>
          <Press hitSlop={8} onPress={() => setNaming(null)} accessibilityLabel={t('Отмена')}>
            <Ionicons name="close-circle" size={22} color={palette.textSecondary} />
          </Press>
        </View>
      )}

      <Text style={styles.fieldLabel}>{t('Цвет')}</Text>
      <View style={styles.swatches}>
        {ROSTER_COLOURS.map((swatch) => (
          <Press
            key={swatch}
            style={[styles.swatch, { backgroundColor: swatch }, colour === swatch && styles.swatchOn]}
            onPress={() => setColour(swatch)}
            accessibilityLabel={`${t('Цвет')} ${swatch}`}
          >
            <Ionicons name="checkmark" size={15} color={colour === swatch ? '#fff' : 'transparent'} />
          </Press>
        ))}
      </View>

      <Fold
        title={t('Рабочие дни')}
        summary={patternLabel(pattern, at)}
        open={daysOpen}
        palette={palette}
        onToggle={() => setDaysOpen((open) => !open)}
      >
        <PatternFields
          key={editing?.id ?? 'new'}
          pattern={pattern}
          at={at}
          today={today}
          palette={palette}
          onChange={setPattern}
        />
      </Fold>

      <Fold
        title={t('Свои часы')}
        summary={hours.mode === 'own' ? `${hours.start}–${hours.end}` : inherited}
        open={ownOpen}
        palette={palette}
        onToggle={() => setOwnOpen((open) => !open)}
      >
        <Segments
          options={[
            { value: 'inherit', label: inherited },
            { value: 'own', label: t('Свои часы') },
          ]}
          value={hours.mode}
          palette={palette}
          onChange={(mode: PersonHoursMode) => setHours({ ...hours, mode })}
        />
        {hours.mode === 'own' && <OwnHoursFields draft={hours} palette={palette} onChange={setHours} />}
      </Fold>

      {editing !== null && (
        <Text style={styles.hint}>{t('Смены с сегодняшнего дня, стоящие на обычное время, перейдут на новое.')}</Text>
      )}

      {failed !== null && <Text style={styles.error}>{failed}</Text>}

      <Press
        style={[styles.primary, (busy || name.trim() === '') && styles.dimmed]}
        disabled={busy || name.trim() === ''}
        onPress={() => void save()}
      >
        <Text style={styles.primaryText}>{editing === null ? t('Добавить') : t('Сохранить')}</Text>
      </Press>

      {editing !== null && (
        <>
          <Press style={styles.ghost} disabled={busy} onPress={() => void remove()}>
            <Text style={[styles.ghostText, styles.dangerText]}>
              {arming ? t('Точно убрать? Его смены уйдут тоже') : t('Убрать из графика')}
            </Text>
          </Press>
          <Press style={styles.ghost} disabled={busy} onPress={() => pick(null)}>
            <Text style={styles.ghostText}>{t('Отмена')}</Text>
          </Press>
        </>
      )}

      {people.length > 0 && (
        <View style={styles.peopleList}>
          {byPosition(people, positions).map((person) => (
            <Press key={person.id} style={styles.personLine} onPress={() => pick(person)}>
              <View style={[styles.dot, { backgroundColor: person.colour }]} />
              <View style={styles.grow}>
                <Text style={styles.personName} numberOfLines={1}>
                  {person.name}
                </Text>
                {person.position !== null && (
                  <Text style={styles.personPosition} numberOfLines={1}>
                    {person.position}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
            </Press>
          ))}
        </View>
      )}
    </FullSheet>
  );
}
