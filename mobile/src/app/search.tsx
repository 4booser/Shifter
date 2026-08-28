import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Loading, Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { dayLabel, todayKey } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import { Hit, searchDays, searchStatement } from '@/lib/search';
import { CalendarDayData, DaysResponse, money } from '@/lib/types';
import { useMono } from '@/store/mono';

/**
 * One day out of two years of them.
 *
 * The only way back to a particular shift was scrolling the calendar, which
 * works right up until the thing being looked for is eight months back. What
 * people remember is the note they left, the name of the shift, or the number
 * — and now also who the money came from, because the bank is here too.
 */
export default function SearchScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = makeStyles(palette);

  const statement = useMono((state) => state.items);

  const [query, setQuery] = useState('');
  const [days, setDays] = useState<CalendarDayData[] | null>(null);

  // The whole history in one request. A search that only looked at the month
  // on screen would miss precisely the day being hunted for.
  useEffect(() => {
    const today = todayKey();
    const from = `${Number(today.slice(0, 4)) - 3}-01-01`;

    void api<DaysResponse>(`/shifter/v1/days?from=${from}&to=${today}`)
      .then((response) => setDays(response.days))
      .catch(() => setDays([]));
  }, []);

  const found = useMemo(
    () => ({
      days: searchDays(days ?? [], query),
      money: searchStatement(statement, query),
    }),
    [days, statement, query],
  );

  const open = (hit: Hit) => {
    router.back();
    // Both kinds land on the day: a transaction is only interesting next to
    // the shift it happened around, which is the day sheet's whole job.
    setTimeout(() => router.push(`/day/${hit.date}`), 60);
  };

  const nothing =
    query.trim().length >= 2 && found.days.length === 0 && found.money.length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.field}>
          <Ionicons name="search" size={17} color={palette.textSecondary} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder={t("Заметка, смена, сумма, магазин")}
            placeholderTextColor={palette.textSecondary}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <Press hitSlop={10} haptic={false} onPress={() => router.back()}>
          <Text style={styles.cancel}>{t('Отмена')}</Text>
        </Press>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {days === null && <Loading colour={palette.backgroundElement} rows={3} height={62} />}

        {query.trim().length < 2 && days !== null && (
          <Text style={styles.hint}>{t('Ищет по заметкам, названиям смен и датам. Число ищется как сумма: «3000» найдёт день, где вышло 2 995.')}</Text>
        )}

        {nothing && <Text style={styles.hint}>{t('Ничего не нашлось.')}</Text>}

        {found.days.length > 0 && <Text style={styles.section}>{t('Дни')}</Text>}
        {found.days.map((hit) => (
          <Press key={`d-${hit.date}`} style={styles.row} onPress={() => open(hit)}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>{hit.title}</Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {dayLabel(hit.date)}
                {hit.meta !== '' ? ` · ${hit.meta}` : ''}
              </Text>
            </View>
            {hit.amount > 0 && <Text style={styles.rowSum}>{money(hit.amount)}</Text>}
          </Press>
        ))}

        {found.money.length > 0 && <Text style={styles.section}>{t('По счёту')}</Text>}
        {found.money.map((hit, index) => (
          <Press key={`m-${hit.date}-${index}`} style={styles.row} onPress={() => open(hit)}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>{hit.title}</Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {dayLabel(hit.date)}
                {hit.meta !== '' ? ` · ${hit.meta}` : ''}
              </Text>
            </View>
            <Text style={[styles.rowSum, hit.amount > 0 && styles.rowIn]}>
              {hit.amount > 0 ? '+' : '−'}
              {money(Math.abs(hit.amount))}
            </Text>
          </Press>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingBottom: 10,
    },
    field: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 14,
      paddingHorizontal: 12,
    },
    input: { flex: 1, color: palette.text, fontSize: 15.5, paddingVertical: 11 },
    cancel: { color: palette.accent, fontWeight: '700', fontSize: 14.5 },

    content: { paddingHorizontal: 14, paddingBottom: 40, gap: 7 },
    hint: { color: palette.textSecondary, fontSize: 13.5, lineHeight: 19, paddingVertical: 10 },
    section: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 16,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    rowText: { flex: 1, gap: 2 },
    rowTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    rowMeta: { color: palette.textSecondary, fontSize: 12.5 },
    rowSum: {
      color: palette.text,
      fontSize: 14,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    rowIn: { color: palette.good },
  });
