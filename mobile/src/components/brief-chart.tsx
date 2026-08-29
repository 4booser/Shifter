import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';

// The web's --warn pair; the palette has no amber of its own yet.
const AMBER = { light: '#a16207', dark: '#e0a63c' };
import { api } from '@/lib/api';
import { todayKey } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import { CalendarDayData, money } from '@/lib/types';

/**
 * The web's brief chart, in the pocket: the month as a climbing line of
 * columns. Solid columns are recorded days — the same days the grid above
 * draws; the pale tail is the brief's own projectedMonth, drawn ghosted
 * because it is a guess. No cursor here, so a tap answers with the figure.
 */
interface BriefFacts {
  monthEarned: number;
  projectedMonth: number | null;
  bestDayAmount: number | null;
  bestDayDate: string | null;
  daysToPayday: number | null;
  goal: number | null;
}

export function BriefChart({ palette, days }: { palette: Palette; days: CalendarDayData[] }) {
  const styles = makeStyles(palette);
  const amber = useColorScheme() === 'dark' ? AMBER.dark : AMBER.light;
  const [facts, setFacts] = useState<BriefFacts | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    void api<BriefFacts>(`/shifter/v1/brief/facts?date=${todayKey()}`)
      .then(setFacts)
      .catch(() => setFacts(null));
  }, []);

  const line = useMemo(() => {
    if (facts === null) return null;

    const today = todayKey();
    const todayDay = Number(today.slice(8));
    const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    const daysInMonth = new Date(year, month, 0).getDate();

    const earnedBy = new Map(days.map((day) => [Number(day.date.slice(8)), day.earned]));
    const fact: number[] = [];
    let sum = 0;

    for (let day = 1; day <= todayDay; day += 1) {
      sum += earnedBy.get(day) ?? 0;
      fact.push(sum);
    }

    // The tail climbs evenly from today's fact to the brief's own figure —
    // an estimate drawn at the estimate's pace, not a forecast per day.
    const tail: number[] = [];
    const target = facts.projectedMonth;

    if (target !== null && target > sum && todayDay < daysInMonth) {
      const left = daysInMonth - todayDay;

      for (let step = 1; step <= left; step += 1)
        tail.push(sum + ((target - sum) * step) / left);
    }

    // "06.08" is how the server writes the best day; only this month's is on
    // this chart.
    let bestDay: number | null = null;

    if (facts.bestDayDate !== null) {
      const [dd, mm] = facts.bestDayDate.split('.').map(Number);

      if (mm === month) bestDay = dd;
    }

    const payday =
      facts.daysToPayday !== null && todayDay + facts.daysToPayday <= daysInMonth
        ? todayDay + facts.daysToPayday
        : null;

    return { fact, tail, daysInMonth, todayDay, bestDay, payday };
  }, [facts, days]);

  if (facts === null || line === null) return null;
  if (line.fact.at(-1) === 0 && line.tail.length === 0) return null;

  const peak = Math.max(1, line.fact.at(-1) ?? 0, line.tail.at(-1) ?? 0, facts.goal ?? 0);
  const columns = [...line.fact, ...line.tail];
  const chosen = picked !== null ? columns[picked] : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('Месяц, каким его видит сводка')}</Text>
      <Text style={styles.hint}>
        {t('Плотные столбики — записанное; бледные — прогноз сводки. Тап — цифры дня.')}
      </Text>

      <View style={styles.chartBox}>
        {facts.goal !== null && facts.goal <= peak && (
          <View style={[styles.goalLine, { bottom: `${(facts.goal / peak) * 100}%` }]} />
        )}
        <View style={styles.row}>
          {columns.map((value, index) => {
            const day = index + 1;
            const projected = day > line.todayDay;

            return (
              <Press
                key={day}
                style={[styles.cell, picked === index && styles.cellOn]}
                onPress={() => setPicked(picked === index ? null : index)}
              >
                {line.bestDay === day && <View style={[styles.mark, { backgroundColor: palette.good }]} />}
                {line.payday === day && <View style={[styles.mark, { backgroundColor: amber }]} />}
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(2, (value / peak) * 100)}%`,
                      backgroundColor: palette.accent,
                      opacity: projected ? 0.28 : 1,
                    },
                  ]}
                />
              </Press>
            );
          })}
        </View>
      </View>

      {chosen !== null && picked !== null && (
        <Text style={styles.answer}>
          {picked + 1 > line.todayDay
            ? `${picked + 1} · ${t('прогноз сводки')} · ${money(chosen)}`
            : `${picked + 1} · ${money(chosen)}`}
        </Text>
      )}

      <Text style={styles.legend}>
        {facts.goal !== null ? t('Линия поперёк — цель.') : ''}
        {line.bestDay !== null ? ` ${t('Зелёная точка — лучший день.')}` : ''}
        {line.payday !== null ? ` ${t('Янтарная — день зарплаты.')}` : ''}
      </Text>
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
    chartBox: { height: 110, justifyContent: 'flex-end' },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: '100%' },
    cell: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'stretch' },
    cellOn: { backgroundColor: palette.border, borderRadius: 3 },
    bar: { borderTopLeftRadius: 2, borderTopRightRadius: 2 },
    mark: {
      alignSelf: 'center',
      width: 5,
      height: 5,
      borderRadius: 3,
      marginBottom: 2,
    },
    goalLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: palette.textSecondary,
      opacity: 0.55,
    },
    answer: { color: palette.text, fontSize: 13, fontWeight: '600', marginTop: 8 },
    legend: { color: palette.textSecondary, fontSize: 11, marginTop: 6 },
  });
