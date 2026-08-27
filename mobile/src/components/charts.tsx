import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';
import { money } from '@/lib/types';

/**
 * The month as bars. The current period glows, the tallest is bold, the rest
 * stay quiet — the same reading order the web charts use, so somebody who
 * knows one client can read the other without learning anything new.
 */
export function MonthBars({
  rows,
  palette,
}: {
  rows: { label: string; value: number; current?: boolean }[];
  palette: Palette;
}) {
  const peak = Math.max(1, ...rows.map((row) => row.value));
  const styles = makeStyles(palette);

  return (
    <View style={styles.rows}>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={[styles.rowLabel, row.current === true && styles.rowLabelCurrent]}>{row.label}</Text>
          <View style={styles.track}>
            {/* A month with nothing earned draws nothing at all: the minimum
                sliver is for a small amount, not for the absence of one, and
                an empty box would still show its own outline. */}
            {row.value > 0 && (
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.max(4, (row.value / peak) * 100)}%`,
                    backgroundColor: row.current === true ? palette.accent : palette.accentSoft,
                    borderColor: palette.accent,
                    borderWidth: row.current === true ? 0 : 1,
                  },
                ]}
              />
            )}
          </View>
          <Text style={[styles.rowValue, row.value === peak && styles.rowValuePeak]}>
            {row.value > 0 ? money(row.value) : '·'}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Where the money came from, as one bar. Every slice keeps a visible sliver,
 * because a small source is still a source and a zero-width rectangle is a
 * lie about it.
 */
export function MoneyFlow({
  parts,
  palette,
}: {
  parts: { name: string; value: number; colour: string }[];
  palette: Palette;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const styles = makeStyles(palette);

  if (total <= 0) return null;

  const width = 320;
  const height = 26;
  let offset = 0;

  return (
    <View style={styles.flow}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {parts.map((part) => {
          const share = Math.max(0.02, part.value / total);
          const barWidth = share * width;
          const x = offset;

          offset += barWidth;

          return (
            <Rect
              key={part.name}
              x={x + 1}
              y={0}
              width={Math.max(2, barWidth - 2)}
              height={height}
              rx={7}
              fill={part.colour}
            />
          );
        })}
      </Svg>
      <View style={styles.legend}>
        {parts.map((part) => (
          <View key={part.name} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: part.colour }]} />
            <Text style={styles.legendName}>{part.name}</Text>
            <Text style={styles.legendValue}>{money(part.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The hours of the day as a ring of arcs: a day is a circle, and midnight
 * sitting next to 23:00 is exactly the fact this chart exists to show.
 */
export function ClockRing({ hours, palette }: { hours: number[]; palette: Palette }) {
  const size = 190;
  const centre = size / 2;
  const radius = 74;
  const peak = Math.max(1, ...hours);
  const styles = makeStyles(palette);
  const busiest = hours.indexOf(peak);

  const arc = (hour: number, weight: number) => {
    const from = (hour * 15 - 90 + 1.5) * (Math.PI / 180);
    const to = ((hour + 1) * 15 - 90 - 1.5) * (Math.PI / 180);
    const inner = radius - 8 - weight * 22;

    const x1 = centre + Math.cos(from) * radius;
    const y1 = centre + Math.sin(from) * radius;
    const x2 = centre + Math.cos(to) * radius;
    const y2 = centre + Math.sin(to) * radius;
    const x3 = centre + Math.cos(to) * inner;
    const y3 = centre + Math.sin(to) * inner;
    const x4 = centre + Math.cos(from) * inner;
    const y4 = centre + Math.sin(from) * inner;

    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 0 0 ${x4} ${y4} Z`;
  };

  return (
    <View style={styles.dial}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="dial" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.accent} stopOpacity="0.95" />
            <Stop offset="1" stopColor={palette.accent} stopOpacity="0.55" />
          </LinearGradient>
        </Defs>
        <Circle cx={centre} cy={centre} r={radius - 30} fill="none" stroke={palette.border} strokeWidth={1} />
        {hours.map((value, hour) => (
          <Path
            key={hour}
            d={arc(hour, value / peak)}
            fill={value > 0 ? 'url(#dial)' : palette.backgroundSelected}
          />
        ))}
      </Svg>
      <View style={styles.dialCentre} pointerEvents="none">
        <Text style={styles.dialHour}>{`${busiest}`.padStart(2, '0')}:00</Text>
        <Text style={styles.dialLabel}>лучший час</Text>
      </View>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    rows: { gap: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowLabel: { width: 38, color: palette.textSecondary, fontSize: 12 },
    rowLabelCurrent: { color: palette.text, fontWeight: '700' },
    track: { flex: 1, height: 18, borderRadius: 9, backgroundColor: palette.backgroundSelected, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 9 },
    rowValue: { width: 74, textAlign: 'right', color: palette.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
    rowValuePeak: { color: palette.text, fontWeight: '700' },
    flow: { gap: 10 },
    legend: { gap: 4 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    legendName: { flex: 1, color: palette.textSecondary, fontSize: 13 },
    legendValue: { color: palette.text, fontWeight: '600', fontSize: 13, fontVariant: ['tabular-nums'] },
    dial: { alignItems: 'center', justifyContent: 'center' },
    dialCentre: { position: 'absolute', alignItems: 'center' },
    dialHour: { color: palette.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
    dialLabel: { color: palette.textSecondary, fontSize: 11 },
  });
