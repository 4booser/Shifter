import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Appear, Roll } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { monthBounds, shortDate, YearMonth } from '@/lib/calendar';
import { moneyLasted, MonoStatementItem, periodTotals, spendingByCategory } from '@/lib/mono';
import { closingCosts, punctuality, realHourly, spendingByDayKind } from '@/lib/mono-work';
import { CalendarDayData, money } from '@/lib/types';
import { t } from '@/lib/i18n';

/** The matcher's own kinds, in the words somebody would use. */
const KIND_NAMES: Record<string, string> = {
  transport: 'дорога',
  food: 'еда',
  uniform: 'форма',
  tools: 'инструмент',
  training: 'учёба',
  other: 'прочее',
};

/**
 * What the work brought and what it cost, side by side with what the month
 * actually did with the money.
 *
 * The left-hand figures are Shifter's — computed from shifts and rates. The
 * right-hand ones are the bank's. They are never added together and never
 * averaged: one is what should have happened and the other is what did, and
 * the whole point of putting them on one screen is that a person can see the
 * gap for themselves.
 */
export function BankAnalysis({
  items,
  days,
  periods,
  month,
  earned,
  palette,
  /** Where a payday landed, so "how long it lasted" has somewhere to start. */
  paidOn,
  floor,
}: {
  items: MonoStatementItem[];
  /** The rota, which is the half of this arithmetic the bank does not have. */
  days: CalendarDayData[];
  /** Pay periods, so "does this place pay on time" has a history to read. */
  periods: Parameters<typeof punctuality>[0];
  month: YearMonth;
  /** What Shifter says was earned this month. */
  earned: number;
  palette: Palette;
  paidOn: string | null;
  floor: number;
}) {
  const styles = makeStyles(palette);
  const bounds = monthBounds(month);
  const totals = periodTotals(items, bounds.from, bounds.to);
  const categories = spendingByCategory(items, bounds.from, bounds.to);
  const peak = Math.max(1, ...categories.map((row) => row.total));
  const lasted = paidOn === null ? null : moneyLasted(items, paidOn, floor);

  // The three questions neither application can answer alone.
  const rate = realHourly(items, days, bounds.from, bounds.to);
  const split = spendingByDayKind(items, days, bounds.from, bounds.to);
  const closing = closingCosts(items, days, bounds.from, bounds.to);
  const paying = punctuality(periods);

  if (items.length === 0) {
    return (
      <Text style={styles.empty}>{t('Пока нечего анализировать — загрузите выписку.')}</Text>
    );
  }

  return (
    <View style={styles.list}>
      <Appear>
        <View style={styles.twin}>
          <View style={styles.half}>
            <Text style={styles.halfLabel}>{t('Начислено')}</Text>
            <Roll value={earned} prefix="₴" style={styles.halfValue} />
            <Text style={styles.halfWho}>{t('считает Shifter')}</Text>
          </View>
          <View style={styles.rule} />
          <View style={styles.half}>
            <Text style={styles.halfLabel}>{t('Пришло на счёт')}</Text>
            <Roll value={totals.income} prefix="₴" style={[styles.halfValue, { color: palette.good }]} />
            <Text style={styles.halfWho}>{t('говорит банк')}</Text>
          </View>
        </View>
      </Appear>

      {/* Never subtracted from the wage: the money left after it arrived, and
          taking it off would stop the app agreeing with anybody's payslip. */}
      <Appear index={1}>
        <View style={styles.strip}>
          <View style={styles.cell}>
            <Roll value={totals.spent} prefix="₴" style={styles.cellValue} />
            <Text style={styles.cellLabel}>{t('потрачено')}</Text>
          </View>
          <View style={styles.cellRule} />
          <View style={styles.cell}>
            <Roll value={totals.cashback} prefix="₴" style={styles.cellValue} />
            <Text style={styles.cellLabel}>{t('кешбэк')}</Text>
          </View>
          <View style={styles.cellRule} />
          <View style={styles.cell}>
            <Text style={styles.cellValue}>
              {lasted === null ? '—' : `${lasted}`}
            </Text>
            <Text style={styles.cellLabel}>{t('дней хватило')}</Text>
          </View>
        </View>
      </Appear>

      {lasted !== null && paidOn !== null && (
        <Text style={styles.note}>
          С {shortDate(paidOn)} до дня, когда на счету осталось меньше {money(floor)}.
        </Text>
      )}

      {rate !== null && (
        <Appear index={2}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Сколько на самом деле стоит час')}</Text>
            <View style={styles.rateRow}>
              <View style={styles.rateHalf}>
                <Text style={styles.rateBig}>{money(Math.round(rate.headline))}</Text>
                <Text style={styles.rateLabel}>{t('по графику')}</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={palette.textSecondary} />
              <View style={styles.rateHalf}>
                <Text style={[styles.rateBig, { color: palette.accent }]}>
                  {money(Math.round(rate.real))}
                </Text>
                <Text style={styles.rateLabel}>{t('после трат на работу')}</Text>
              </View>
            </View>
            {/* Only spending that lands on a working day and in a category
                that can plausibly be about work. Counting the supermarket
                would make every job look ruinous and would be about
                groceries. */}
            <Text style={styles.cardNote}>
              {t('За')} {Math.round(rate.hours)} {t('ч работа принесла')} {money(rate.earned)}
              {rate.costs > 0
                ? `, ${t('а добраться и поесть на смене стоило')} ${money(rate.costs)}.`
                : `. ${t('Трат на работу в выписке не нашлось.')}`}
            </Text>
          </View>
        </Appear>
      )}

      {split !== null && split.onShift > split.off && (
        <Appear index={3}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Рабочий день против выходного')}</Text>
            <Text style={styles.cardNote}>
              {t('В день со сменой уходит на')} {money(Math.round(split.onShift - split.off))}{' '}
              {t('больше')} — {money(Math.round(split.onShift))} {t('против')}{' '}
              {money(Math.round(split.off))}.
              {split.differences.length > 0 && (
                <>
                  {' '}
                  {t('Больше всего разницы в категории')}{' '}
                  {t(KIND_NAMES[split.differences[0].kind] ?? split.differences[0].kind)}.
                </>
              )}
            </Text>
            <Text style={styles.cardFaint}>
              {split.onShiftDays} {t('рабочих дней и')} {split.offDays} {t('выходных в этом месяце')}
            </Text>
          </View>
        </Appear>
      )}

      {closing.closings > 0 && (
        <Appear index={4}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Во что обошлись закрытия')}</Text>
            <Text style={styles.cardNote}>
              {closing.closings} {t('закрытий принесли')} {money(closing.earned)}
              {closing.ride > 0
                ? `, ${t('а дорога домой после них забрала')} ${money(closing.ride)}.`
                : `. ${t('Поездок домой после них в выписке нет.')}`}
            </Text>
          </View>
        </Appear>
      )}

      {paying.map((row) => (
        <Appear key={row.locationId} index={5}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{row.place} — {t('платит')}</Text>
            <Text style={styles.cardNote}>
              {row.averageLate < 0.5
                ? t('Вовремя.')
                : `${t('В среднем на')} ${Math.round(row.averageLate * 10) / 10} ${t('дн. позже обещанного.')}`}
              {row.worstLate > 0 && ` ${t('Худший раз —')} ${row.worstLate} ${t('дн.')}`}
            </Text>
            {/* Late and short are different complaints and different
                conversations; one number supporting both supports neither. */}
            {row.short > 0 && (
              <Text style={styles.cardNote}>
                {t('И')} {row.short} {t('раз пришло меньше, чем должны были — это отдельный разговор.')}
              </Text>
            )}
            <Text style={styles.cardFaint}>
              {t('Последние:')}{' '}
              {row.recent
                .map((one) => (one.late <= 0 ? t('вовремя') : `+${one.late}`))
                .join(' · ')}
              {' · '}
              {t('всего периодов')}: {row.settled}
            </Text>
          </View>
        </Appear>
      ))}

      {categories.length > 0 && (
        <Appear index={2}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Куда ушли')}</Text>

            {categories.slice(0, 8).map((row) => (
              <View key={row.name} style={styles.bar}>
                <Text style={styles.barName} numberOfLines={1}>{row.name}</Text>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${Math.max(3, (row.total / peak) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.barValue}>{money(row.total)}</Text>
              </View>
            ))}
          </View>
        </Appear>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    list: { gap: 10 },
    empty: { color: palette.textSecondary, fontSize: 13.5, paddingVertical: 12 },

    twin: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      paddingVertical: 14,
    },
    half: { flex: 1, alignItems: 'center', gap: 2 },
    rule: { width: 1, alignSelf: 'stretch', backgroundColor: palette.border },
    halfLabel: {
      color: palette.textSecondary,
      fontSize: 10.5,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    halfValue: {
      color: palette.text,
      fontSize: 21,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.4,
      textAlign: 'center',
    },
    halfWho: { color: palette.textSecondary, fontSize: 11 },

    strip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      paddingVertical: 12,
    },
    cell: { flex: 1, alignItems: 'center', gap: 1 },
    cellRule: { width: 1, alignSelf: 'stretch', backgroundColor: palette.border },
    cellValue: {
      color: palette.text,
      fontSize: 16.5,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    cellLabel: {
      color: palette.textSecondary,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    note: { color: palette.textSecondary, fontSize: 12.5, textAlign: 'center', lineHeight: 17 },

    card: {
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      padding: 13,
      gap: 8,
    },
    cardTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
    cardNote: { color: palette.text, fontSize: 13, lineHeight: 19 },
    cardFaint: { color: palette.textSecondary, fontSize: 12 },
    rateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
    rateHalf: { flex: 1, alignItems: 'center', gap: 2 },
    rateBig: {
      color: palette.text,
      fontSize: 24,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    rateLabel: { color: palette.textSecondary, fontSize: 11.5, textAlign: 'center' },
    bar: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    barName: { color: palette.text, fontSize: 12.5, width: 132 },
    track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: palette.backgroundSelected },
    fill: { height: 8, borderRadius: 4, backgroundColor: palette.accent },
    barValue: {
      color: palette.text,
      fontSize: 12.5,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      minWidth: 66,
      textAlign: 'right',
    },
  });
