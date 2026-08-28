import { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { Appear, Press, Roll } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { addMonths, monthBounds, monthGrid, monthOnly, todayKey, WEEKDAYS, YearMonth } from '@/lib/calendar';
import { byDay, MonoStatementItem, periodTotals } from '@/lib/mono';
import { CalendarDayData, moneyShort, tint } from '@/lib/types';
import { t } from '@/lib/i18n';

const CELL = 60;
const SPAN = 24;
const PAGES = Array.from({ length: SPAN * 2 + 1 }, (_, index) => index);

/**
 * The month in money.
 *
 * The calendar answers "when did I work". This answers "what did the money do"
 * over exactly the same squares, which is the only way to see that the week
 * with three closes is also the week nothing was left by Sunday. Green is what
 * came in, and it wins the cell — a day the wage landed is a day about the
 * wage, whatever else was spent on it.
 */
export function MoneyGrid({
  items,
  days,
  palette,
  anchor,
  onOpen,
}: {
  items: MonoStatementItem[];
  days: Map<string, CalendarDayData>;
  palette: Palette;
  anchor: YearMonth;
  /** A cell is a day like any other: tapping it opens the day. */
  onOpen: (date: string) => void;
}) {
  const { width } = useWindowDimensions();
  const styles = makeStyles(palette);

  const [index, setIndex] = useState(SPAN);
  const month = addMonths(anchor, index - SPAN);
  const today = todayKey();

  const money = useMemo(() => new Map(byDay(items).map((row) => [row.day, row])), [items]);
  const bounds = monthBounds(month);
  const totals = periodTotals(items, bounds.from, bounds.to);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const at = Math.round(event.nativeEvent.contentOffset.x / width);

    if (at !== index && at >= 0 && at <= SPAN * 2) setIndex(at);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.month}>
          {monthOnly(month)} {month.year}
        </Text>
        <View style={styles.totals}>
          <Roll value={totals.income} prefix="+₴" style={styles.in} />
          <Roll value={totals.spent} prefix="−₴" style={styles.out} />
        </View>
      </View>

      <View style={styles.weekHead}>
        {WEEKDAYS.map((name, at) => (
          <Text key={name} style={[styles.weekDay, at > 4 && styles.weekDayRest]}>
            {t(name)}
          </Text>
        ))}
      </View>

      <FlatList
        data={PAGES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={SPAN}
        getItemLayout={(_, at) => ({ length: width, offset: width * at, index: at })}
        keyExtractor={(item) => `${item}`}
        onScroll={onScroll}
        scrollEventThrottle={16}
        windowSize={3}
        initialNumToRender={1}
        style={{ width, height: CELL * 6, marginHorizontal: -14 }}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 12 }}>
            {chunk(monthGrid(addMonths(anchor, item - SPAN))).map((row) => (
              <View key={row[0].key} style={styles.row}>
                {row.map((cell) => {
                  const day = money.get(cell.key);
                  const shift = days.get(cell.key)?.shifts[0];
                  const net = (day?.income ?? 0) - (day?.spent ?? 0);

                  return (
                    <Press
                      key={cell.key}
                      haptic={false}
                      style={[styles.slot, !cell.inMonth && styles.slotOutside]}
                      onPress={() => onOpen(cell.key)}
                    >
                      <View
                        style={[
                          styles.cell,
                          (day?.income ?? 0) > 0 && styles.cellIn,
                          (day?.income ?? 0) === 0 && (day?.spent ?? 0) > 0 && styles.cellOut,
                        ]}
                      >
                        <Text
                          style={[
                            styles.number,
                            cell.key === today && styles.numberToday,
                          ]}
                        >
                          {Number(cell.key.slice(8))}
                        </Text>

                        {day !== undefined && (
                          <Text
                            style={[styles.sum, net > 0 ? styles.sumIn : styles.sumOut]}
                            numberOfLines={1}
                          >
                            {net > 0 ? '+' : '−'}
                            {moneyShort(Math.abs(net))}
                          </Text>
                        )}

                        {shift !== undefined && (
                          <View
                            style={[
                              styles.dot,
                              { backgroundColor: tint(shift.colour, 1) ?? palette.accent },
                            ]}
                          />
                        )}
                      </View>
                    </Press>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      />
    </View>
  );
}

const chunk = <T,>(all: T[]): T[][] => {
  const rows: T[][] = [];

  for (let at = 0; at < all.length; at += 7) rows.push(all.slice(at, at + 7));

  return rows;
};

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    wrap: { gap: 6 },
    head: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
    month: { flex: 1, color: palette.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
    totals: { alignItems: 'flex-end' },
    in: { color: palette.good, fontSize: 14.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
    out: { color: palette.textSecondary, fontSize: 12.5, fontVariant: ['tabular-nums'] },

    weekHead: { flexDirection: 'row' },
    weekDay: {
      flex: 1,
      textAlign: 'center',
      color: palette.textSecondary,
      fontSize: 10.5,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    weekDayRest: { color: palette.accent, opacity: 0.75 },

    row: { flexDirection: 'row', height: CELL },
    slot: { flex: 1, height: CELL, padding: 2 },
    slotOutside: { opacity: 0.3 },
    cell: {
      flex: 1,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    cellIn: { backgroundColor: `${palette.good}22`, borderColor: `${palette.good}55` },
    cellOut: { backgroundColor: palette.backgroundSelected },
    number: { color: palette.textSecondary, fontSize: 12, fontWeight: '600' },
    numberToday: {
      color: '#fff',
      backgroundColor: palette.accent,
      overflow: 'hidden',
      borderRadius: 9,
      minWidth: 18,
      lineHeight: 18,
      textAlign: 'center',
      fontWeight: '800',
    },
    sum: { fontSize: 9.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
    sumIn: { color: palette.good },
    sumOut: { color: palette.textSecondary },
    dot: { width: 5, height: 5, borderRadius: 3, marginTop: 1 },
  });
