import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { SkiaClimb } from '@/components/skia-climb';
import { MonoStatementItem } from '@/lib/mono';
import { CategoryRule } from '@/lib/mono-rules';
import {
  categoryMonths,
  categoryStyle,
  cumulativeSpend,
  dailySpend,
  monthlyFlows,
  usualDay,
} from '@/lib/spend-viz';
import { t } from '@/lib/i18n';
import { money } from '@/lib/types';
import { todayKey } from '@/lib/calendar';

/*
 * The web's chart shelf, in the pocket. The phone has no cursor, so every
 * chart answers the finger instead: tap a column and the figures appear in
 * a line under the chart. Same mirrored arithmetic, same stable colours.
 */

const monthName = (key: string) =>
  new Date(`${key}-15T12:00:00`).toLocaleDateString('ru', { month: 'short' });

/** ==== In against out, month by month — tap a month for its figures ==== */
/** Thousands said short, for a label the width of half a column. */
const kShort = (value: number): string =>
  value >= 1000 ? `${Math.round(value / 1000)}K` : `${Math.round(value)}`;

export function MonthlyFlowsChart({
  items,
  palette,
}: {
  items: MonoStatementItem[];
  palette: Palette;
}) {
  const styles = makeStyles(palette);
  const rows = useMemo(() => monthlyFlows(items, 6), [items]);
  const shown = rows.filter((row) => row.earned > 0 || row.spent > 0);
  const [picked, setPicked] = useState<number | null>(null);

  if (shown.length < 2) return null;

  const peak = Math.max(1, ...shown.map((row) => Math.max(row.earned, row.spent)));
  const chosen = picked !== null ? shown[picked] : null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('Пришло против ушло, по месяцам')}</Text>
      <Text style={styles.hint}>{t('Переводы не входят ни в один столбик. Тап по месяцу — цифры.')}</Text>

      <View style={styles.columnsRow}>
        {shown.map((row, index) => (
          <Press
            key={row.month}
            style={[styles.columnCell, picked === index && styles.columnCellOn]}
            onPress={() => setPicked(picked === index ? null : index)}
          >
            {/* The current month wears its figures; the past answers a tap. */}
            {index === shown.length - 1 && (
              <Text style={styles.pairTag}>
                <Text style={{ color: palette.good }}>+{kShort(row.earned)}</Text>{' '}
                <Text style={{ color: palette.danger }}>−{kShort(row.spent)}</Text>
              </Text>
            )}
            <View style={styles.pairRow}>
              <View
                style={[
                  styles.pairBar,
                  {
                    height: `${Math.max(3, (row.earned / peak) * 100)}%`,
                    backgroundColor: palette.good,
                    opacity: index === shown.length - 1 ? 1 : 0.75,
                  },
                ]}
              />
              <View
                style={[
                  styles.pairBar,
                  {
                    height: `${Math.max(3, (row.spent / peak) * 100)}%`,
                    backgroundColor: palette.danger,
                    opacity: index === shown.length - 1 ? 0.95 : 0.7,
                  },
                ]}
              />
            </View>
            <Text style={styles.monthLabel}>{monthName(row.month)}</Text>
          </Press>
        ))}
      </View>

      {chosen !== null && (
        <Text style={styles.answer}>
          {monthName(chosen.month)}: <Text style={{ color: palette.good }}>+{money(chosen.earned)}</Text>{' '}
          <Text style={{ color: palette.danger }}>−{money(chosen.spent)}</Text>{' '}
          <Text style={{ color: chosen.earned - chosen.spent >= 0 ? palette.good : palette.danger }}>
            = {money(chosen.earned - chosen.spent)}
          </Text>
        </Text>
      )}
    </View>
  );
}

/** ==== The mix by month — tap a column for the breakdown ==== */
export function CategoryMonthsChart({
  items,
  rules,
  palette,
}: {
  items: MonoStatementItem[];
  rules: CategoryRule[];
  palette: Palette;
}) {
  const styles = makeStyles(palette);
  const rows = useMemo(() => categoryMonths(items, rules, 6), [items, rules]);
  const shown = rows.filter((row) => row.parts.length > 0);
  const [picked, setPicked] = useState<number | null>(null);

  if (shown.length < 2) return null;

  const peak = Math.max(1, ...shown.map((row) => row.parts.reduce((sum, part) => sum + part.total, 0)));
  const chosen = picked !== null ? shown[picked] : null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('Состав трат по месяцам')}</Text>
      <Text style={styles.hint}>{t('Категория держит свой цвет и место. Тап — разбор месяца.')}</Text>

      <View style={styles.columnsRow}>
        {shown.map((row, index) => {
          const total = row.parts.reduce((sum, part) => sum + part.total, 0);

          return (
            <Press
              key={row.month}
              style={[styles.columnCell, picked === index && styles.columnCellOn]}
              onPress={() => setPicked(picked === index ? null : index)}
            >
              <View style={[styles.stackHolder, { height: `${Math.max(4, (total / peak) * 100)}%` }]}>
                {row.parts.map((part) => (
                  <View
                    key={part.name}
                    style={{
                      flexGrow: part.total,
                      flexBasis: 1,
                      backgroundColor: categoryStyle(part.name).hue,
                      opacity: 0.9,
                      marginTop: 1,
                    }}
                  />
                ))}
              </View>
              <Text style={styles.monthLabel}>{monthName(row.month)}</Text>
            </Press>
          );
        })}
      </View>

      {/* The colours, named — the tap answers with figures, the legend
          answers the cheaper question without one. */}
      <View style={styles.legendRow}>
        {[...new Map(shown.flatMap((row) => row.parts).map((part) => [part.name, part])).keys()]
          .slice(0, 6)
          .map((name) => (
            <View key={name} style={styles.legendItem}>
              <View style={[styles.partDot, { backgroundColor: categoryStyle(name).hue }]} />
              <Text style={styles.legendName}>{name}</Text>
            </View>
          ))}
      </View>

      {chosen !== null && (
        <View style={{ gap: 2 }}>
          {chosen.parts.map((part) => (
            <View key={part.name} style={styles.partRow}>
              <View style={[styles.partDot, { backgroundColor: categoryStyle(part.name).hue }]} />
              <Text style={styles.partName}>{part.name}</Text>
              <Text style={styles.partValue}>{money(part.total)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** ==== The pace: this month racing the last, tap for the day ==== */
export function PaceChart({
  items,
  from,
  to,
  palette,
}: {
  items: MonoStatementItem[];
  from: string;
  to: string;
  palette: Palette;
}) {
  const styles = makeStyles(palette);

  const previousRange = useMemo(() => {
    const start = new Date(`${from}T12:00:00`);
    const prevEnd = new Date(start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
    const key = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    return { from: key(prevStart), to: key(prevEnd) };
  }, [from]);

  const now = useMemo(() => cumulativeSpend(items, from, to), [items, from, to]);
  const before = useMemo(
    () => cumulativeSpend(items, previousRange.from, previousRange.to),
    [items, previousRange],
  );
  const [picked, setPicked] = useState<number | null>(null);

  // Local, never toISOString: at 02:00 in Kyiv the UTC day is still
  // yesterday, and this chart drew a blank card every 1st because of it.
  const todayIndex = now.findIndex((point) => point.day === todayKey());
  const fact = todayIndex >= 0 ? now.slice(0, todayIndex + 1) : now;
  const days = Math.max(fact.length, before.length);

  // Nothing spent yet this stretch — a title over an empty plot says less
  // than no card at all.
  if (days < 3 || (fact.at(-1)?.total ?? 0) === 0) return null;

  const chosen =
    picked !== null
      ? {
          day: picked,
          now: picked <= fact.length ? (fact[picked - 1]?.total ?? null) : null,
          before: before[picked - 1]?.total ?? null,
        }
      : null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('Темп')}</Text>
      <Text style={styles.hint}>
        {t('Серая линия — прошлый месяц теми же днями. Веди пальцем — цифры дня.')}
      </Text>

      <SkiaClimb
        fact={now.map((point) => point.total)}
        ghost={before.map((point) => point.total)}
        cut={fact.length}
        palette={palette}
        height={180}
        onPick={setPicked}
      />

      {chosen !== null && (
        <Text style={styles.answer}>
          {t('День')} {chosen.day}:{' '}
          {chosen.now !== null && <Text style={{ fontWeight: '700', color: palette.text }}>{money(chosen.now)}</Text>}
          {chosen.before !== null && (
            <Text style={{ color: palette.textSecondary }}> · {t('прошлый месяц')} {money(chosen.before)}</Text>
          )}
        </Text>
      )}
    </View>
  );
}

/** ==== The reserve tile ==== */
export function ReserveTile({
  balance,
  items,
  from,
  to,
  palette,
}: {
  balance: number | null;
  items: MonoStatementItem[];
  from: string;
  to: string;
  palette: Palette;
}) {
  const styles = makeStyles(palette);
  const usual = useMemo(() => usualDay(dailySpend(items, from, to)), [items, from, to]);

  if (balance === null || usual <= 0) return null;

  const days = Math.floor(balance / usual);

  return (
    <View style={styles.card}>
      <Text style={styles.hint}>{t('При обычном дне остатка хватит на')}</Text>
      <Text style={styles.reserveValue}>{days} {t('дн.')}</Text>
      <Text style={styles.hint}>
        {money(balance)} ÷ {money(usual)}/{t('день')}. {t('Арифметика, не обещание.')}
      </Text>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: palette.backgroundElement, borderRadius: 16, padding: 14, gap: 8 },
    cardTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    hint: { color: palette.textSecondary, fontSize: 12, lineHeight: 16 },
    columnsRow: { flexDirection: 'row', height: 110, alignItems: 'flex-end', gap: 4 },
    columnCell: { flex: 1, height: '100%', justifyContent: 'flex-end', borderRadius: 8, paddingBottom: 2 },
    columnCellOn: { backgroundColor: palette.backgroundSelected },
    pairRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2, flex: 1 },
    pairBar: { width: '26%', borderTopLeftRadius: 3, borderTopRightRadius: 3, opacity: 0.85 },
    pairTag: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
    legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendName: { color: palette.textSecondary, fontSize: 11 },
    monthLabel: { color: palette.textSecondary, fontSize: 10.5, textAlign: 'center', marginTop: 3 },
    stackHolder: { width: '58%', alignSelf: 'center', flexDirection: 'column-reverse', borderRadius: 4, overflow: 'hidden' },
    answer: { color: palette.text, fontSize: 13, fontVariant: ['tabular-nums'] },
    partRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    partDot: { width: 8, height: 8, borderRadius: 4 },
    partName: { color: palette.text, fontSize: 12.5, flex: 1 },
    partValue: { color: palette.text, fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
    paceRow: { flexDirection: 'row', height: 90, alignItems: 'flex-end', gap: 1 },
    paceCell: { flex: 1, height: '100%', justifyContent: 'flex-end' },
    paceBars: { flex: 1, justifyContent: 'flex-end' },
    paceGhost: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: palette.border, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
    paceFact: { borderTopLeftRadius: 2, borderTopRightRadius: 2, opacity: 0.85 },
    reserveValue: { color: palette.text, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  });
