import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '@/constants/theme';
import { currentMonth, YearMonth } from '@/lib/calendar';

const MONTHS = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

/**
 * Twelve buttons and a year.
 *
 * Swiping is right for the month either side of you and wrong for the one
 * eight months out, which is nine flicks and a lost place. Deliberately says
 * nothing about money: it could only tell the truth about months already
 * loaded, and a grid where half the squares carry a figure and half do not is
 * worse than one that carries none.
 */
export function MonthJump({
  open,
  at,
  palette,
  reach,
  onPick,
  onClose,
}: {
  open: boolean;
  at: YearMonth;
  palette: Palette;
  /** How far the pager goes either way, in months. */
  reach: { first: YearMonth; last: YearMonth };
  onPick: (month: YearMonth) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = makeStyles(palette);
  const today = currentMonth();

  const index = ({ year, month }: YearMonth) => year * 12 + month;
  const within = (month: YearMonth) =>
    index(month) >= index(reach.first) && index(month) <= index(reach.last);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />

        <View style={styles.yearRow}>
          <Pressable
            style={styles.arrow}
            hitSlop={8}
            disabled={!within({ year: at.year - 1, month: 12 })}
            onPress={() => onPick({ year: at.year - 1, month: at.month })}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={within({ year: at.year - 1, month: 12 }) ? palette.text : palette.border}
            />
          </Pressable>

          <Text style={styles.year}>{at.year}</Text>

          <Pressable
            style={styles.arrow}
            hitSlop={8}
            disabled={!within({ year: at.year + 1, month: 1 })}
            onPress={() => onPick({ year: at.year + 1, month: at.month })}
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={within({ year: at.year + 1, month: 1 }) ? palette.text : palette.border}
            />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {MONTHS.map((name, offset) => {
            const month = { year: at.year, month: offset + 1 };
            const here = month.month === at.month && month.year === at.year;
            const now = month.month === today.month && month.year === today.year;
            const reachable = within(month);

            return (
              <Pressable
                key={name}
                style={[styles.month, here && styles.monthHere, now && !here && styles.monthNow]}
                disabled={!reachable}
                onPress={() => onPick(month)}
              >
                <Text
                  style={[
                    styles.monthText,
                    here && styles.monthTextHere,
                    !reachable && styles.monthTextOff,
                  ]}
                >
                  {name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable style={styles.today} onPress={() => onPick(today)}>
          <Ionicons name="today-outline" size={16} color={palette.accent} />
          <Text style={styles.todayText}>Вернуться к сегодня</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
    sheet: {
      backgroundColor: palette.background,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 14,
    },
    grabber: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.border,
    },
    yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
    arrow: { padding: 6 },
    year: {
      fontSize: 22,
      fontWeight: '800',
      color: palette.text,
      fontVariant: ['tabular-nums'],
      minWidth: 78,
      textAlign: 'center',
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    month: {
      width: '23.2%',
      paddingVertical: 14,
      borderRadius: 15,
      alignItems: 'center',
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
    },
    monthHere: { backgroundColor: palette.accent, borderColor: palette.accent },
    monthNow: { borderColor: palette.accent, borderWidth: 2 },
    monthText: { color: palette.text, fontSize: 14.5, fontWeight: '700' },
    monthTextHere: { color: '#fff' },
    monthTextOff: { color: palette.border },
    today: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 12,
    },
    todayText: { color: palette.accent, fontWeight: '700', fontSize: 14.5 },
  });
