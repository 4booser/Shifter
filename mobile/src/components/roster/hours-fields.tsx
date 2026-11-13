import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { WEEK_NAMES } from '@/lib/calendar';
import { buzz } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { HoursDraft } from '@/lib/roster';
import { toggleWeekday, WeekRow } from '@/lib/week-rows';

import { makeRosterStyles } from './styles';

/**
 * Rows of weekdays that share one pair of times, a weekday in one row only.
 * The template form's editor, copied for the roster rather than shared: the
 * venue's hours read it as the open days, a person's and a position's as the
 * days that run other hours than the usual pair.
 */
export function WeekRowsEditor({
  rows,
  start,
  end,
  footnote,
  palette,
  onChange,
}: {
  rows: WeekRow[];
  /** What a new row starts from. */
  start: string;
  end: string;
  /** What the days in no row are. */
  footnote: string;
  palette: Palette;
  onChange: (rows: WeekRow[]) => void;
}) {
  const styles = makeRosterStyles(palette);

  const setTime = (at: number, change: Partial<WeekRow>) =>
    onChange(rows.map((row, index) => (index === at ? { ...row, ...change } : row)));

  return (
    <>
      {rows.map((row, at) => (
        <View key={at} style={styles.weekRow}>
          <View style={styles.weekDays}>
            {WEEK_NAMES.map((day, index) => {
              const on = row.days.includes(index + 1);

              return (
                <Press
                  key={day}
                  style={[styles.weekDay, on && styles.weekDayOn]}
                  haptic={false}
                  accessibilityLabel={t(day)}
                  onPress={() => {
                    buzz.choose();
                    onChange(toggleWeekday(rows, at, index + 1));
                  }}
                >
                  <Text style={[styles.weekDayText, on && styles.weekDayTextOn]}>{t(day)}</Text>
                </Press>
              );
            })}
          </View>

          <View style={styles.weekTimes}>
            <TextInput
              style={[styles.input, styles.grow]}
              value={row.start}
              onChangeText={(value) => setTime(at, { start: value })}
              keyboardType="numbers-and-punctuation"
              placeholder={start}
              placeholderTextColor={palette.textSecondary}
              accessibilityLabel={t('Начало')}
            />
            <TextInput
              style={[styles.input, styles.grow]}
              value={row.end}
              onChangeText={(value) => setTime(at, { end: value })}
              keyboardType="numbers-and-punctuation"
              placeholder={end}
              placeholderTextColor={palette.textSecondary}
              accessibilityLabel={t('Конец')}
            />
            <Press
              hitSlop={8}
              accessibilityLabel={t('Удалить')}
              onPress={() => {
                buzz.choose();
                onChange(rows.filter((_, index) => index !== at));
              }}
            >
              <Ionicons name="close-circle" size={22} color={palette.textSecondary} />
            </Press>
          </View>
        </View>
      ))}

      <Press
        style={styles.weekAdd}
        onPress={() => {
          buzz.choose();
          onChange([...rows, { days: [], start, end }]);
        }}
      >
        <Ionicons name="add" size={16} color={palette.accent} />
        <Text style={styles.weekAddText}>{t('Ещё дни')}</Text>
      </Press>

      <Text style={styles.hint}>{footnote}</Text>
    </>
  );
}

/** A usual pair of their own, and the weekdays that run other hours, the way a template has them. */
export function OwnHoursFields<Mode extends string>({
  draft,
  palette,
  onChange,
}: {
  draft: HoursDraft<Mode>;
  palette: Palette;
  onChange: (draft: HoursDraft<Mode>) => void;
}) {
  const styles = makeRosterStyles(palette);

  return (
    <>
      <View style={styles.timeRow}>
        <View style={styles.grow}>
          <Text style={styles.fieldLabel}>{t('Начало')}</Text>
          <TextInput
            style={styles.input}
            value={draft.start}
            onChangeText={(start) => onChange({ ...draft, start })}
            keyboardType="numbers-and-punctuation"
            placeholder="18:00"
            placeholderTextColor={palette.textSecondary}
          />
        </View>
        <View style={styles.grow}>
          <Text style={styles.fieldLabel}>{t('Конец')}</Text>
          <TextInput
            style={styles.input}
            value={draft.end}
            onChangeText={(end) => onChange({ ...draft, end })}
            keyboardType="numbers-and-punctuation"
            placeholder="02:00"
            placeholderTextColor={palette.textSecondary}
          />
        </View>
      </View>

      {draft.rows.length === 0 ? (
        <Press
          style={styles.radio}
          onPress={() => {
            buzz.choose();
            onChange({ ...draft, rows: [{ days: [], start: draft.start, end: draft.end }] });
          }}
        >
          <Ionicons name="calendar-outline" size={21} color={palette.textSecondary} />
          <View style={styles.grow}>
            <Text style={styles.radioText}>{t('Другие часы по дням недели')}</Text>
            <Text style={styles.radioSub}>{t('Например, пятница до 23:00, а выходные с 13:00.')}</Text>
          </View>
        </Press>
      ) : (
        <>
          <Text style={styles.fieldLabel}>{t('Другие часы по дням недели')}</Text>
          <WeekRowsEditor
            rows={draft.rows}
            start={draft.start}
            end={draft.end}
            footnote={`${t('Остальные дни')} — ${draft.start}–${draft.end}`}
            palette={palette}
            onChange={(rows) => onChange({ ...draft, rows })}
          />
        </>
      )}
    </>
  );
}
