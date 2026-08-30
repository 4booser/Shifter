import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native';
import { Circle } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

import { Palette } from '@/constants/theme';
import { running } from '@/lib/pace';
import { t } from '@/lib/i18n';
import { CalendarDayData, money } from '@/lib/types';

/**
 * The period's money as a climb, the way the site draws it: a filled line of
 * what is recorded, and the previous period as a pale ghost underneath — the
 * comparison that turns «₴47 000» into «and last month this day was ₴21 000».
 * GPU-drawn (Victory XL over Skia); a finger on it names the day.
 */
type Row = {
  at: number;
  fact: number | null;
  ghost: number | null;
} & Record<string, unknown>;

function Cursor({ x, y, colour }: { x: SharedValue<number>; y: SharedValue<number>; colour: string }) {
  return <Circle cx={x} cy={y} r={5} color={colour} />;
}

const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export function SkiaEarnedChart({
  palette,
  days,
  from,
  to,
  today,
  ghost,
  format = money,
}: {
  palette: Palette;
  days: CalendarDayData[];
  from: string;
  to: string;
  /** Today's key — the fact line stops here on a period still running. */
  today: string;
  ghost: { days: CalendarDayData[]; from: string; to: string } | null;
  format?: (value: number) => string;
}) {
  const styles = makeStyles(palette);

  const rows = useMemo<Row[]>(() => {
    // The same tested arithmetic Pace used — one running() for both lines.
    const fact = running(days, from, to);
    const length = fact.length;

    if (length < 3 || length > 400) return [];

    const pale = ghost === null ? null : running(ghost.days, ghost.from, ghost.to);

    // A period still running stops its line at today; a finished one runs whole.
    const cut = today >= from && today <= to ? dayCount(from, today) : length;

    return Array.from({ length }, (_, index) => ({
      at: index + 1,
      fact: index < cut ? fact[index] : null,
      ghost: pale !== null && index < pale.length ? pale[index] : null,
    }));
  }, [days, from, to, today, ghost]);

  const { state, isActive } = useChartPressState({ x: 0, y: { fact: 0, ghost: 0 } });
  const [picked, setPicked] = useState<{ at: number; value: number } | null>(null);

  useEffect(() => {
    if (!isActive) {
      setPicked(null);

      return;
    }

    const interval = setInterval(() => {
      const at = Math.round(state.x.value.value);
      const row = rows.find((entry) => entry.at === at);
      const value = row?.fact ?? row?.ghost ?? null;

      if (value !== null) setPicked({ at, value });
    }, 80);

    return () => clearInterval(interval);
  }, [isActive, rows, state]);

  // Nothing recorded, nothing to climb: the card's absence is the empty state.
  if (rows.length === 0 || rows.every((row) => (row.fact ?? 0) === 0)) return null;

  return (
    <View>
      <Text style={styles.hint}>
        {picked !== null
          ? `${t('День')} ${picked.at} — ${format(picked.value)}`
          : ghost !== null
            ? t('Плотная линия — этот период, бледная — прошлый. Веди пальцем — цифры дня.')
            : t('Веди пальцем — цифры дня.')}
      </Text>
      <View style={styles.plot}>
        <CartesianChart
          data={rows}
          xKey="at"
          yKeys={['fact', 'ghost']}
          chartPressState={state}
          axisOptions={{
            lineColor: palette.border,
            labelColor: palette.textSecondary,
            tickCount: { x: 4, y: 3 },
            formatYLabel: (value) =>
              (value ?? 0) >= 1000 ? `${Math.round((value ?? 0) / 1000)}K` : `${Math.round(value ?? 0)}`,
          }}
        >
          {({ points }) => (
            <>
              <Area points={points.fact} y0={220} color={`${palette.accent}26`} curveType="monotoneX" />
              <Line points={points.ghost} color={`${palette.textSecondary}88`} strokeWidth={2} curveType="monotoneX" />
              <Line points={points.fact} color={palette.accent} strokeWidth={3} curveType="monotoneX" />
              {isActive && <Cursor x={state.x.position} y={state.y.fact.position} colour={palette.accent} />}
            </>
          )}
        </CartesianChart>
      </View>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    hint: { color: palette.textSecondary, fontSize: 12, lineHeight: 16, marginBottom: 8 },
    plot: { height: 220 },
  });
