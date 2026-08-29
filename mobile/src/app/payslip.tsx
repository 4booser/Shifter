import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { shortDate } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import { money } from '@/lib/types';

/**
 * The payslip, line against line — now where the payslip actually is.
 *
 * A payslip is a piece of paper handed over at the bar; the site got this
 * screen first and the site is at home. Here it opens from the very period row
 * somebody is staring at when the figure looks wrong, and every line carries
 * the formula it came from, because "у нас вышло иначе" only wins arguments
 * when it can show its working.
 */

interface PayslipLine {
  kind: string;
  amount: number;
  formula: string;
  hours: number;
  deducted: boolean;
}

interface PayslipCheck {
  location_name: string;
  period_from: string;
  period_to: string;
  hours: number;
  days_worked: number;
  lines: PayslipLine[];
  gross: number;
  net: number;
  holiday_accrued: number;
}

const LINE_LABEL: Record<string, string> = {
  base: 'Ставка',
  extras: 'Надбавки',
  revenue: 'Процент с выручки',
  tips: 'Чаевые',
  tip_out: 'Отдано в общий котёл',
  meals: 'Питание',
  fines: 'Удержания',
  tax: 'Налог',
};

export default function PayslipScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const params = useLocalSearchParams<{ location: string; on: string }>();

  const [check, setCheck] = useState<PayslipCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PayslipCheck>(
      `/shifter/v1/payouts/check?location_id=${params.location}&on=${params.on}`,
    )
      .then(setCheck)
      .catch(() => setError(t('Не удалось собрать расчёт за этот период.')));
  }, [params.location, params.on]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}
    >
      <View style={styles.head}>
        <Text style={styles.title}>{t('Проверка расчётки')}</Text>
        <Press hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={palette.textSecondary} />
        </Press>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {check !== null && (
        <>
          <Text style={styles.lead}>
            {check.location_name} · {shortDate(check.period_from)} — {shortDate(check.period_to)}
            {' · '}
            {Math.round(check.hours)} {t('ч')} · {check.days_worked} {t('дн.')}
          </Text>

          {/* Line by line, each with its own working. The order is the order a
              payslip is written in, so the two can be read side by side. */}
          <View style={styles.card}>
            {check.lines.map((line, index) => (
              <View key={index} style={[styles.line, index > 0 && styles.lineBorder]}>
                <View style={styles.grow}>
                  <Text style={styles.lineName}>{t(LINE_LABEL[line.kind] ?? line.kind)}</Text>
                  <Text style={styles.lineFormula}>{line.formula}</Text>
                </View>
                <Text style={[styles.lineAmount, line.deducted && { color: palette.danger }]}>
                  {line.deducted ? '−' : ''}
                  {money(line.amount)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('Начислено')}</Text>
              <Text style={styles.totalValue}>{money(check.gross)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('На руки')}</Text>
              <Text style={[styles.totalValue, styles.net]}>{money(check.net)}</Text>
            </View>
            {check.holiday_accrued > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t('Отпускные накоплены')}</Text>
                <Text style={styles.totalValue}>{money(check.holiday_accrued)}</Text>
              </View>
            )}
          </View>

          <Text style={styles.hint}>
            {t('Сверьте с бумагой строку за строкой. Разошлось — разошлось в конкретной строке, и это уже разговор, а не ощущение.')}
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 20, paddingBottom: 48, gap: 12 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: palette.text, fontSize: 22, fontWeight: '800' },
    lead: { color: palette.textSecondary, fontSize: 13 },
    error: { color: palette.danger, fontSize: 13.5 },
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      paddingHorizontal: 14,
    },
    line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
    lineBorder: { borderTopWidth: 1, borderTopColor: palette.border },
    grow: { flex: 1, minWidth: 0 },
    lineName: { color: palette.text, fontSize: 14.5, fontWeight: '600' },
    lineFormula: { color: palette.textSecondary, fontSize: 11.5, marginTop: 1 },
    lineAmount: { color: palette.text, fontSize: 15, fontWeight: '700' },
    totals: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      padding: 14,
      gap: 6,
    },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
    totalLabel: { color: palette.textSecondary, fontSize: 13.5 },
    totalValue: { color: palette.text, fontSize: 15, fontWeight: '700' },
    net: { color: palette.good },
    hint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 18 },
  });
