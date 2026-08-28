import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Appear, Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { dayLabel } from '@/lib/calendar';
import { byDay, categoryOf, fromMinor, MonoStatementItem, payerName } from '@/lib/mono';
import { CalendarDayData, money, tint } from '@/lib/types';
import { t } from '@/lib/i18n';

/**
 * The statement, day by day, with the shift standing beside it.
 *
 * This is where the two halves of the app meet. A bank app shows what left
 * the account on Tuesday; a shift app shows that Tuesday was a twelve-hour
 * close. Together they answer questions neither could: the taxi was after the
 * night shift, the money went the day after the wage landed, the week with no
 * shifts is also the week the balance did not move.
 */
export function BankLedger({
  items,
  days,
  palette,
  limit = 120,
}: {
  items: MonoStatementItem[];
  days: Map<string, CalendarDayData>;
  palette: Palette;
  limit?: number;
}) {
  const styles = makeStyles(palette);
  const [only, setOnly] = useState<'all' | 'in' | 'out' | 'shift'>('all');
  const [query, setQuery] = useState('');
  const [least, setLeast] = useState('');

  // A statement of four hundred lines answers nothing. These four questions
  // are the ones anybody actually opens it with.
  const needle = query.trim().toLocaleLowerCase();
  const floor = Number(least.replace(',', '.')) || 0;

  // Three months of statement is a thousand lines. Without a search that is an
  // archive rather than data, and the answer people want is usually a sum
  // rather than a list — so the sum is above it.
  const matching = useMemo(
    () =>
      items.filter((item) => {
        if (only === 'in' && item.amount <= 0) return false;
        if (only === 'out' && item.amount >= 0) return false;
        if (floor > 0 && Math.abs(item.amount) / 100 < floor) return false;
        if (needle !== '' && !item.description.toLocaleLowerCase().includes(needle)) return false;

        return true;
      }),
    [items, only, needle, floor],
  );

  const found = useMemo(
    () => ({
      count: matching.length,
      total: matching.reduce((sum, item) => sum + Math.abs(item.amount) / 100, 0),
    }),
    [matching],
  );

  const grouped = useMemo(() => {
    const rows = byDay(matching);

    return (only === 'shift'
      ? rows.filter((row) => (days.get(row.day)?.shifts ?? []).some((shift) => shift.worked))
      : rows
    ).slice(0, limit);
  }, [matching, only, days, limit]);

  const filters = (
    <>
    <View style={styles.searchRow}>
      <Ionicons name="search" size={16} color={palette.textSecondary} />
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder={t('Найти по названию')}
        placeholderTextColor={palette.textSecondary}
      />
      <TextInput
        style={styles.least}
        value={least}
        onChangeText={setLeast}
        keyboardType="decimal-pad"
        placeholder={t('от')}
        placeholderTextColor={palette.textSecondary}
      />
    </View>

    {(needle !== '' || floor > 0) && (
      <Text style={styles.foundText}>
        {t('Нашлось')} {found.count} {t('на')} {money(found.total)}
      </Text>
    )}

    <View style={styles.filters}>
      {(
        [
          ['all', t('Всё')],
          ['in', t('Приходы')],
          ['out', t('Траты')],
          ['shift', t('В дни смен')],
        ] as const
      ).map(([value, label]) => (
        <Press
          key={value}
          style={[styles.filter, only === value && styles.filterOn]}
          onPress={() => setOnly(value)}
        >
          <Text style={[styles.filterText, only === value && styles.filterTextOn]}>{label}</Text>
        </Press>
      ))}
    </View>
    </>
  );

  if (grouped.length === 0) {
    return (
      <View style={styles.list}>
        {items.length > 0 && filters}
        <Text style={styles.empty}>
          {items.length === 0
            ? t('Выписка пока не загружена. Нажмите «Обновить» — банк отдаёт её окнами по месяцу, не чаще раза в минуту.')
            : t('Под этот отбор ничего не попало.')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {filters}
      {grouped.map((row, index) => {
        const day = days.get(row.day);
        const shifts = (day?.shifts ?? []).filter((shift) => shift.worked);

        return (
          <Appear key={row.day} index={index}>
            <View style={styles.day}>
              <View style={styles.dayHead}>
                <Text style={styles.dayName}>{dayLabel(row.day)}</Text>

                {shifts.length > 0 && (
                  <View style={styles.shifts}>
                    {shifts.map((shift) => (
                      <View
                        key={shift.shift_id}
                        style={[
                          styles.shift,
                          { backgroundColor: tint(shift.colour, 0.18) ?? palette.accentSoft },
                        ]}
                      >
                        <Text style={styles.shiftText}>
                          {shift.symbol ?? '🕐'} {shift.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.dayTotals}>
                  {row.income > 0 && (
                    <Text style={styles.dayIn}>+{money(row.income)}</Text>
                  )}
                  {row.spent > 0 && (
                    <Text style={styles.dayOut}>−{money(row.spent)}</Text>
                  )}
                </View>
              </View>

              {row.items.map((item) => (
                <View key={item.id} style={styles.line}>
                  <Text style={styles.lineWho} numberOfLines={1}>
                    {item.amount > 0 ? payerName(item) : item.description}
                  </Text>
                  <Text style={styles.lineWhat} numberOfLines={1}>
                    {categoryOf(item.mcc)}
                  </Text>

                  {item.hold && (
                    <Ionicons name="hourglass-outline" size={12} color={palette.textSecondary} />
                  )}

                  <Text style={[styles.lineSum, item.amount > 0 && styles.lineIn]}>
                    {item.amount > 0 ? '+' : '−'}
                    {money(fromMinor(Math.abs(item.amount)))}
                  </Text>
                </View>
              ))}
            </View>
          </Appear>
        );
      })}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    list: { gap: 8 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.backgroundElement,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    search: { flex: 1, color: palette.text, fontSize: 14, paddingVertical: 10 },
    least: {
      width: 68,
      color: palette.text,
      fontSize: 14,
      paddingVertical: 10,
      textAlign: 'right',
    },
    foundText: { color: palette.textSecondary, fontSize: 13, marginBottom: 8 },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
    filter: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.backgroundElement,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    filterOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    filterText: { color: palette.text, fontSize: 12.5, fontWeight: '700' },
    filterTextOn: { color: '#fff' },

    empty: { color: palette.textSecondary, fontSize: 13.5, lineHeight: 19, paddingVertical: 12 },
    day: {
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 7,
    },
    dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    dayName: { color: palette.text, fontSize: 14, fontWeight: '800' },
    shifts: { flexDirection: 'row', gap: 5, flexShrink: 1 },
    shift: { borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 },
    shiftText: { color: palette.text, fontSize: 11.5, fontWeight: '600' },
    dayTotals: { marginLeft: 'auto', alignItems: 'flex-end' },
    dayIn: { color: palette.good, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
    dayOut: { color: palette.textSecondary, fontSize: 12.5, fontVariant: ['tabular-nums'] },

    line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    lineWho: { flex: 1, color: palette.text, fontSize: 13.5 },
    lineWhat: { color: palette.textSecondary, fontSize: 11, maxWidth: 124 },
    lineSum: {
      color: palette.text,
      fontSize: 13.5,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      minWidth: 72,
      textAlign: 'right',
    },
    lineIn: { color: palette.good },
  });
