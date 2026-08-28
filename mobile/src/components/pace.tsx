import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Palette } from '@/constants/theme';
import { t } from '@/lib/i18n';
import { money } from '@/lib/types';
export { running } from '@/lib/pace';

/**
 * Two running totals, this period and the one before it.
 *
 * The comparison already exists as a percentage, and a percentage answers "am
 * I ahead" only after somebody has decided to trust it. A line answers it
 * before they finish looking — and it also answers the question the number
 * cannot: whether the month started slowly and caught up, or started well and
 * stalled, which are two completely different conversations to have with a
 * manager.
 */
export function Pace({
  now,
  before,
  palette,
  height = 132,
}: {
  /** Cumulative money by day of the period, from day one. */
  now: number[];
  before: number[];
  palette: Palette;
  height?: number;
}) {
  const { width: screen } = useWindowDimensions();
  const styles = makeStyles(palette);
  const width = screen - 28 - 26;

  const span = Math.max(now.length, before.length, 2);
  const peak = Math.max(1, ...now, ...before);

  const x = (at: number) => (at / (span - 1)) * width;
  const y = (value: number) => height - (value / peak) * (height - 10) - 4;

  const line = (series: number[]) =>
    series.map((value, at) => `${at === 0 ? 'M' : 'L'} ${x(at)} ${y(value)}`).join(' ');

  const area = (series: number[]) =>
    series.length === 0
      ? ''
      : `${line(series)} L ${x(series.length - 1)} ${height} L ${x(0)} ${height} Z`;

  const last = now[now.length - 1] ?? 0;
  const same = before[Math.min(now.length - 1, before.length - 1)] ?? 0;

  if (now.length < 2) {
    return (
      <Text style={styles.empty}>
        {t('Темп появится, когда в месяце будет хотя бы два дня со сменами.')}
      </Text>
    );
  }

  return (
    <View style={styles.wrap}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="pace" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.accent} stopOpacity="0.22" />
            <Stop offset="1" stopColor={palette.accent} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* The period before, behind and quiet: it is the thing being measured
            against, not a second answer competing for attention. */}
        {before.length > 1 && (
          <Path
            d={line(before)}
            stroke={palette.textSecondary}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
            strokeLinecap="round"
          />
        )}

        <Path d={area(now)} fill="url(#pace)" />
        <Path
          d={line(now)}
          stroke={palette.accent}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Where the line has got to, which is the only point worth marking. */}
        <Circle
          cx={x(now.length - 1)}
          cy={y(last)}
          r={4.5}
          fill={palette.accent}
          stroke={palette.background}
          strokeWidth={2}
        />
      </Svg>

      <View style={styles.legend}>
        <View style={styles.key}>
          <View style={[styles.dash, { backgroundColor: palette.accent }]} />
          <Text style={styles.keyText}>
            {t('сейчас')} · {money(last)}
          </Text>
        </View>
        <View style={styles.key}>
          <View style={[styles.dash, styles.dashed, { backgroundColor: palette.textSecondary }]} />
          <Text style={styles.keyText}>
            {t('было к этому дню')} · {money(same)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    empty: { color: palette.textSecondary, fontSize: 13, paddingVertical: 8 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dash: { width: 14, height: 3, borderRadius: 2 },
    dashed: { opacity: 0.6 },
    keyText: { color: palette.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
  });
