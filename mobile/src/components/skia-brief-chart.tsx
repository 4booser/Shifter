import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native';
import { Circle } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { useDerivedValue } from 'react-native-reanimated';

import { Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { todayKey } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import { CalendarDayData, money } from '@/lib/types';

/**
 * The brief's month, redrawn on the GPU: Victory Native XL over Skia, 60fps
 * pan instead of a tap-only answer. The figures are the same wave-52 maths —
 * cumulative fact to today, the brief's own projection as the dashed tail.
 */
interface BriefFacts {
  monthEarned: number;
  projectedMonth: number | null;
  bestDayAmount: number | null;
  bestDayDate: string | null;
  daysToPayday: number | null;
  goal: number | null;
}

type Row = {
  day: number;
  fact: number | null;
  tail: number | null;
} & Record<string, unknown>;

function Cursor({ x, y, colour }: { x: SharedValue<number>; y: SharedValue<number>; colour: string }) {
  return <Circle cx={x} cy={y} r={5} color={colour} />;
}

export function SkiaBriefChart({ palette, days }: { palette: Palette; days: CalendarDayData[] }) {
  const styles = makeStyles(palette);
  const [facts, setFacts] = useState<BriefFacts | null>(null);

  useEffect(() => {
    void api<BriefFacts>(`/shifter/v1/brief/facts?date=${todayKey()}`)
      .then(setFacts)
      .catch(() => setFacts(null));
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (facts === null) return [];

    const today = todayKey();
    const todayDay = Number(today.slice(8));
    const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    const daysInMonth = new Date(year, month, 0).getDate();
    const earnedBy = new Map(days.map((day) => [Number(day.date.slice(8)), day.earned]));

    const out: Row[] = [];
    let sum = 0;

    for (let day = 1; day <= todayDay; day += 1) {
      sum += earnedBy.get(day) ?? 0;
      out.push({ day, fact: sum, tail: day === todayDay ? sum : null });
    }

    const target = facts.projectedMonth;

    if (target !== null && target > sum && todayDay < daysInMonth) {
      const left = daysInMonth - todayDay;

      for (let step = 1; step <= left; step += 1)
        out.push({ day: todayDay + step, fact: null, tail: sum + ((target - sum) * step) / left });
    }

    return out;
  }, [facts, days]);

  const { state, isActive } = useChartPressState({ x: 0, y: { fact: 0, tail: 0 } });
  const [picked, setPicked] = useState<{ day: number; value: number } | null>(null);

  useDerivedValue(() => {
    // Reading on the UI thread, reporting to JS only when it changes.
    return state.x.value.value;
  });

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const day = Math.round(state.x.value.value);
      const row = rows.find((entry) => entry.day === day);
      const value = row?.fact ?? row?.tail ?? null;

      if (value !== null) setPicked({ day, value });
    }, 80);

    return () => clearInterval(interval);
  }, [isActive, rows, state]);

  if (facts === null || rows.length < 3) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('Месяц, каким его видит сводка')}</Text>
      <Text style={styles.hint}>{t('Плотная линия — записанное; бледная — прогноз сводки. Веди пальцем — цифры дня.')}</Text>

      <View style={styles.plot}>
        <CartesianChart
          data={rows}
          xKey="day"
          yKeys={['fact', 'tail']}
          chartPressState={state}
          axisOptions={{
            lineColor: palette.border,
            labelColor: palette.textSecondary,
            tickCount: { x: 5, y: 3 },
          }}
        >
          {({ points }) => (
            <>
              <Area points={points.fact} y0={200} color={palette.accentSoft} />
              <Line points={points.fact} color={palette.accent} strokeWidth={2.5} curveType="monotoneX" />
              <Line
                points={points.tail}
                color={palette.accent}
                strokeWidth={2}
                opacity={0.5}
                curveType="monotoneX"
              />
              {isActive && (
                <Cursor x={state.x.position} y={state.y.fact.position} colour={palette.accent} />
              )}
            </>
          )}
        </CartesianChart>
      </View>

      {picked !== null && (
        <Text style={styles.answer}>
          {picked.day} · {money(Math.round(picked.value))}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 16,
      marginTop: 12,
    },
    title: { color: palette.text, fontSize: 15, fontWeight: '700' },
    hint: { color: palette.textSecondary, fontSize: 12, marginTop: 3, marginBottom: 10 },
    plot: { height: 190 },
    answer: { color: palette.text, fontSize: 13, fontWeight: '600', marginTop: 8 },
  });
