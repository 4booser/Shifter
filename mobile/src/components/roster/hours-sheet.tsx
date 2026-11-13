import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { dayLabel } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import {
  compactHours,
  crossesMidnight,
  HourPair,
  hoursProblem,
  NO_TIME,
  readClock,
  RosterPerson,
  RosterShift,
  sameHours,
} from '@/lib/roster';
import { HoursPair } from '@/lib/roster-rules';

import { Sheet } from './sheet';
import { makeRosterStyles } from './styles';

/**
 * One cell. Their usual time and no set time come first, then the month's own
 * pairs, which on a phone are most of the job; then typed hours, and for a
 * day somebody works, who else could take it.
 */
export function HoursSheet({
  person,
  date,
  shift,
  usual,
  pairs,
  free,
  palette,
  onClose,
  onPut,
  onSwap,
}: {
  person: RosterPerson;
  date: string;
  shift: RosterShift | undefined;
  /** What one tap would have put: their default time, or no time. */
  usual: HourPair;
  pairs: HoursPair[];
  /** Who is free that day, in list order. */
  free: RosterPerson[];
  palette: Palette;
  onClose: () => void;
  onPut: (hours: HourPair | null) => void;
  onSwap: (to: RosterPerson) => void;
}) {
  const styles = makeRosterStyles(palette);
  const held: HourPair | null = shift === undefined ? null : { start_time: shift.start_time, end_time: shift.end_time };
  const timedUsual = usual.start_time !== null && usual.end_time !== null ? (usual as HoursPair) : null;
  // The usual pair has its own chip above, so the month's row leaves it out, as the web's does.
  const others = timedUsual === null ? pairs : pairs.filter((pair) => !sameHours(pair, timedUsual));

  // A day with no time opens empty: there is nothing to edit in it yet.
  const opening: HoursPair | null =
    held === null ? (timedUsual ?? pairs[0] ?? null) : held.start_time === null ? null : (held as HoursPair);

  const [start, setStart] = useState(opening?.start_time ?? '');
  const [end, setEnd] = useState(opening?.end_time ?? '');
  const [failed, setFailed] = useState<string | null>(null);

  const opens = readClock(start);
  const closes = readClock(end);
  const overnight = opens !== null && closes !== null && opens !== closes && crossesMidnight(opens, closes);

  const save = () => {
    const problem = hoursProblem(start, end);

    if (problem !== null) setFailed(t(problem));
    else onPut({ start_time: opens as string, end_time: closes as string });
  };

  const chip = (key: string, label: string, on: boolean, put: () => void) => (
    <Press key={key} style={[styles.chip, on && styles.chipOn]} onPress={put}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Press>
  );

  return (
    <Sheet palette={palette} onClose={onClose}>
      <Text style={styles.sheetTitle} numberOfLines={1}>
        {person.name}
      </Text>
      <Text style={styles.lead}>{dayLabel(date)}</Text>

      <View style={styles.pairRow}>
        {timedUsual !== null &&
          chip(
            'usual',
            `${t('Как обычно')} · ${compactHours(timedUsual.start_time, timedUsual.end_time)}`,
            sameHours(held, timedUsual),
            () => onPut(timedUsual),
          )}
        {chip('bare', t('Без времени'), sameHours(held, NO_TIME), () => onPut(NO_TIME))}
      </View>

      {others.length > 0 && (
        <View style={styles.pairRow}>
          {others.map((pair) =>
            chip(
              `${pair.start_time}|${pair.end_time}`,
              compactHours(pair.start_time, pair.end_time),
              sameHours(held, pair),
              () => onPut(pair),
            ),
          )}
        </View>
      )}

      <View style={styles.timeRow}>
        <View style={styles.grow}>
          <Text style={styles.fieldLabel}>{t('Начало')}</Text>
          <TextInput
            style={styles.input}
            value={start}
            onChangeText={setStart}
            keyboardType="numbers-and-punctuation"
            placeholder="11:00"
            placeholderTextColor={palette.textSecondary}
          />
        </View>
        <View style={styles.grow}>
          <Text style={styles.fieldLabel}>{t('Конец')}</Text>
          <TextInput
            style={styles.input}
            value={end}
            onChangeText={setEnd}
            onSubmitEditing={save}
            keyboardType="numbers-and-punctuation"
            placeholder="22:00"
            placeholderTextColor={palette.textSecondary}
          />
        </View>
      </View>

      {overnight && <Text style={styles.hint}>{t('Закончится на следующий день.')}</Text>}
      {failed !== null && <Text style={styles.error}>{failed}</Text>}

      {shift !== undefined && free.length > 0 && (
        <>
          <Text style={styles.fieldLabel}>{t('Заменить на:')}</Text>
          <View style={styles.pairRow}>
            {free.map((other) => (
              <Press key={other.id} style={styles.freeChip} onPress={() => onSwap(other)}>
                <View style={[styles.dot, { backgroundColor: other.colour }]} />
                <Text style={styles.freeName} numberOfLines={1}>
                  {other.name}
                </Text>
              </Press>
            ))}
          </View>
        </>
      )}

      <Press style={styles.primary} onPress={save}>
        <Text style={styles.primaryText}>{t('Поставить')}</Text>
      </Press>

      {shift !== undefined && (
        <Press style={styles.ghost} onPress={() => onPut(null)}>
          <Text style={[styles.ghostText, styles.dangerText]}>{t('Убрать смену')}</Text>
        </Press>
      )}
    </Sheet>
  );
}
