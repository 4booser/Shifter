import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Appear } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { dayLabel } from '@/lib/calendar';
import { byDay, categoryOf, fromMinor, MonoStatementItem, payerName } from '@/lib/mono';
import { CalendarDayData, money, tint } from '@/lib/types';

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
  const grouped = byDay(items).slice(0, limit);

  if (grouped.length === 0) {
    return (
      <Text style={styles.empty}>
        Выписка пока не загружена. Нажмите «Обновить» — банк отдаёт её окнами по месяцу, не чаще
        раза в минуту.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
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
