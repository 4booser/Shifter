import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { monthBounds, WEEK_NAMES, YearMonth } from '@/lib/calendar';
import { buzz } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import {
  cycleStart,
  dayMonth,
  monthWeeks,
  NO_PATTERN,
  patternProblem,
  readDays,
  RosterPattern,
  workingDays,
} from '@/lib/roster';

import { Segments } from './sheet';
import { makeRosterStyles } from './styles';

/** The rhythms a crew actually runs. */
const PRESETS: [number, number][] = [
  [2, 2],
  [3, 3],
  [5, 2],
  [1, 3],
];

/**
 * Which days somebody usually works: by hand, some weekdays, or a rhythm of
 * days on and off anchored on a day it starts. The rhythm is shown on the
 * month itself, lit up live, since a count of days says nothing to anybody.
 */
export function PatternFields({
  pattern,
  at,
  today,
  palette,
  onChange,
}: {
  pattern: RosterPattern;
  /** The month the grid shows. */
  at: YearMonth;
  today: string;
  palette: Palette;
  onChange: (pattern: RosterPattern) => void;
}) {
  const styles = makeRosterStyles(palette);

  // Typed counts as typed, so a field can be empty on its way to another number.
  const [onText, setOnText] = useState(pattern.on === null ? '' : `${pattern.on}`);
  const [offText, setOffText] = useState(pattern.off === null ? '' : `${pattern.off}`);

  const choose = (kind: RosterPattern['kind']) => {
    if (kind === pattern.kind) return;

    if (kind === 'none') onChange(NO_PATTERN);
    else if (kind === 'weekdays') onChange({ ...NO_PATTERN, kind, weekdays: [] });
    else {
      const on = readDays(onText) ?? 2;
      const off = readDays(offText) ?? 2;

      setOnText(`${on}`);
      setOffText(`${off}`);
      onChange({ kind, weekdays: [], on, off, from: pattern.from ?? cycleStart(at, today) });
    }
  };

  const problem = patternProblem(pattern);

  return (
    <>
      <Segments
        options={[
          { value: 'none', label: t('Вручную') },
          { value: 'weekdays', label: t('Дни недели') },
          // Not a phrase: the same in every language.
          { value: 'cycle', label: '2/2, 3/3…' },
        ]}
        value={pattern.kind}
        palette={palette}
        onChange={choose}
      />

      {pattern.kind === 'weekdays' && (
        <View style={styles.weekDays}>
          {WEEK_NAMES.map((day, index) => {
            const on = pattern.weekdays.includes(index + 1);

            return (
              <Press
                key={day}
                style={[styles.weekDay, on && styles.weekDayOn]}
                haptic={false}
                accessibilityLabel={t(day)}
                onPress={() => {
                  buzz.choose();
                  onChange({
                    ...pattern,
                    weekdays: on
                      ? pattern.weekdays.filter((weekday) => weekday !== index + 1)
                      : [...pattern.weekdays, index + 1].sort((one, two) => one - two),
                  });
                }}
              >
                <Text style={[styles.weekDayText, on && styles.weekDayTextOn]}>{t(day)}</Text>
              </Press>
            );
          })}
        </View>
      )}

      {pattern.kind === 'cycle' && (
        <>
          <View style={styles.chipRow}>
            {PRESETS.map(([on, off]) => {
              const held = pattern.on === on && pattern.off === off;

              return (
                <Press
                  key={`${on}/${off}`}
                  style={[styles.chipSmall, held && styles.chipOn]}
                  onPress={() => {
                    setOnText(`${on}`);
                    setOffText(`${off}`);
                    onChange({ ...pattern, on, off });
                  }}
                >
                  <Text style={[styles.chipSmallText, held && styles.chipTextOn]}>
                    {on}/{off}
                  </Text>
                </Press>
              );
            })}
          </View>

          <View style={styles.timeRow}>
            <View style={styles.grow}>
              <Text style={styles.fieldLabel}>{t('Дней работы')}</Text>
              <TextInput
                style={styles.input}
                value={onText}
                onChangeText={(typed) => {
                  setOnText(typed);
                  onChange({ ...pattern, on: readDays(typed) });
                }}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <View style={styles.grow}>
              <Text style={styles.fieldLabel}>{t('Дней отдыха')}</Text>
              <TextInput
                style={styles.input}
                value={offText}
                onChangeText={(typed) => {
                  setOffText(typed);
                  onChange({ ...pattern, off: readDays(typed) });
                }}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>{t('Выходит с')}</Text>
          <MonthPick
            at={at}
            pattern={pattern}
            palette={palette}
            onPick={(from) => onChange({ ...pattern, from })}
          />
        </>
      )}

      {problem !== null && <Text style={styles.error}>{t(problem)}</Text>}
    </>
  );
}

/**
 * The month as a grid, Monday first, with the days the rhythm lands on lit and
 * its first day ringed. A tap moves the first day. One set outside this month
 * is only said, and goes back to the server as it was: looking at a rhythm
 * must never shift it.
 */
function MonthPick({
  at,
  pattern,
  palette,
  onPick,
}: {
  at: YearMonth;
  pattern: RosterPattern;
  palette: Palette;
  onPick: (date: string) => void;
}) {
  const styles = makeRosterStyles(palette);
  const lit = patternProblem(pattern) === null ? workingDays(pattern, at) : new Set<string>();
  const { from, to } = monthBounds(at);
  const elsewhere = pattern.from !== null && (pattern.from < from || pattern.from > to);

  return (
    <>
      {/* The weekdays over the columns, as the web's grid has them; the days say their own date to a screen reader. */}
      <View style={styles.gridWeek} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {WEEK_NAMES.map((day) => (
          <Text key={day} style={styles.gridHead}>
            {t(day)}
          </Text>
        ))}
      </View>
      {monthWeeks(at).map((week, row) => (
        <View key={row} style={styles.gridWeek}>
          {week.map((date, column) =>
            date === null ? (
              <View key={column} style={styles.gridDay} />
            ) : (
              <Press
                key={date}
                style={[styles.gridDay, lit.has(date) && styles.gridDayOn, date === pattern.from && styles.gridDayFrom]}
                scale={0.92}
                accessibilityLabel={dayMonth(date)}
                onPress={() => onPick(date)}
              >
                <Text style={[styles.gridDayText, lit.has(date) && styles.gridDayTextOn]}>
                  {Number(date.slice(8))}
                </Text>
              </Press>
            ),
          )}
        </View>
      ))}

      {elsewhere && (
        <Text style={styles.hint}>
          {t('Выходит с')} {dayMonth(pattern.from as string)} {(pattern.from as string).slice(0, 4)}
        </Text>
      )}
    </>
  );
}
