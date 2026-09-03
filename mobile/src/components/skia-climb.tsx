import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native';
import { Circle } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

import { Palette } from '@/constants/theme';

/**
 * A cumulative line racing its own past: the generic climb every «pace»
 * card draws — earnings against last month, spending against last month.
 * Callers hand in two running totals; this draws the filled line, the grey
 * ghost, and reports which day a finger is on. What the day means — money
 * earned, money gone — is the caller's sentence to write.
 */
type Row = {
  at: number;
  fact: number | null;
  ghost: number | null;
} & Record<string, unknown>;

function Cursor({ x, y, colour }: { x: SharedValue<number>; y: SharedValue<number>; colour: string }) {
  return <Circle cx={x} cy={y} r={5} color={colour} />;
}

export function SkiaClimb({
  fact,
  ghost,
  cut,
  palette,
  height = 220,
  onPick,
}: {
  /** Running total for every day of the period, first to last. */
  fact: number[];
  /** The previous period's running total, in its own length. */
  ghost: number[] | null;
  /** Days actually lived: the fact line stops here, 1-based. */
  cut: number;
  palette: Palette;
  height?: number;
  /** Fires with the 1-based day under the finger, null when it lifts. */
  onPick?: (at: number | null) => void;
}) {
  const rows = useMemo<Row[]>(
    () =>
      Array.from({ length: fact.length }, (_, index) => ({
        at: index + 1,
        fact: index < cut ? fact[index] : null,
        ghost: ghost !== null && index < ghost.length ? ghost[index] : null,
      })),
    [fact, ghost, cut],
  );

  const { state, isActive } = useChartPressState({ x: 0, y: { fact: 0, ghost: 0 } });

  useEffect(() => {
    if (onPick !== undefined && !isActive) onPick(null);
  }, [isActive, onPick]);

  /*
   * The finger's position, watched where it lives.
   *
   * This used to be a timer reading the shared value twelve times a second
   * from the JS thread — which is both the thing Reanimated's strict mode
   * warns about and a poll that keeps running between two frames that say
   * the same thing. A reaction fires when the number changes, and only then.
   */
  useAnimatedReaction(
    () => Math.round(state.x.value.value),
    (at, before) => {
      if (at === before || onPick === undefined) return;
      if (at >= 1 && at <= rows.length) runOnJS(onPick)(at);
    },
    [rows.length, onPick],
  );

  if (rows.length < 3) return null;

  return (
    <View style={[styles.plot, { height }]}>
      <CartesianChart
        data={rows}
        xKey="at"
        yKeys={['fact', 'ghost']}
        chartPressState={state}
        axisOptions={{
          lineColor: palette.border,
          tickCount: { x: 4, y: 3 },
        }}
      >
        {({ points }) => (
          <>
            <Area points={points.fact} y0={height} color={`${palette.accent}26`} curveType="monotoneX" />
            <Line
              points={points.ghost}
              color={`${palette.textSecondary}88`}
              strokeWidth={2}
              curveType="monotoneX"
            />
            <Line points={points.fact} color={palette.accent} strokeWidth={3} curveType="monotoneX" />
            {isActive && <Cursor x={state.x.position} y={state.y.fact.position} colour={palette.accent} />}
          </>
        )}
      </CartesianChart>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { width: '100%' },
});
