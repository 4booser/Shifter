import { StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';
import { WEEKDAYS } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import { bestWeekday, WeekdayRate } from '@/lib/rhythm';
import { money } from '@/lib/types';

/**
 * What each day of the week is worth, by the hour.
 *
 * The screen already says which hour pays best. Which day pays best is the
 * more useful question, because it is the one somebody answers every week
 * when the rota goes up — and until now they answered it from memory.
 */
export function Weekdays({ rows, palette }: { rows: WeekdayRate[]; palette: Palette }) {
  const styles = makeStyles(palette);
  const peak = Math.max(1, ...rows.map((row) => row.perHour ?? 0));
  const verdict = bestWeekday(rows);
  const worked = rows.filter((row) => row.days > 0);

  if (worked.length === 0) {
    return <Text style={styles.empty}>{t('Пока не по чему сравнивать дни недели.')}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.bars}>
        {rows.map((row) => {
          const share = (row.perHour ?? 0) / peak;
          const best = verdict !== null && verdict.best.weekday === row.weekday;

          return (
            <View key={row.weekday} style={styles.column}>
              <Text style={[styles.value, best && styles.valueBest]} numberOfLines={1}>
                {row.perHour === null ? '·' : Math.round(row.perHour)}
              </Text>

              <View style={styles.track}>
                {/* Nothing at all for a day nobody has worked: an empty column
                    is the honest shape for "no answer", and a stub would read
                    as a bad day. */}
                {row.perHour !== null && (
                  <View
                    style={[
                      styles.fill,
                      { height: `${Math.max(6, share * 100)}%` },
                      best && { backgroundColor: palette.good },
                    ]}
                  />
                )}
              </View>

              <Text style={[styles.day, best && styles.dayBest]}>
                {t(WEEKDAYS[row.weekday])}
              </Text>
            </View>
          );
        })}
      </View>

      {verdict !== null && (
        <Text style={styles.verdict}>
          {t(WEEKDAYS[verdict.best.weekday])} {t('приносит')}{' '}
          {money(verdict.best.perHour ?? 0)}/{t('ч')} — {t('против')}{' '}
          {money(verdict.worst.perHour ?? 0)} {t('в')} {t(WEEKDAYS[verdict.worst.weekday])}.
        </Text>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    wrap: { gap: 10 },
    empty: { color: palette.textSecondary, fontSize: 13, paddingVertical: 8 },
    bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 116 },
    column: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
    value: {
      color: palette.textSecondary,
      fontSize: 10.5,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    valueBest: { color: palette.good },
    track: { flex: 1, width: '100%', justifyContent: 'flex-end' },
    fill: { width: '100%', borderRadius: 6, backgroundColor: palette.accent },
    day: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    dayBest: { color: palette.good },
    verdict: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 17 },
  });
