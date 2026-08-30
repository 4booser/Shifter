import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalendarFeedCard } from '@/components/calendar-feed';
import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { t, useLang } from '@/lib/i18n';
import { paperRanges, shareAccountantCsv, shareIncomePdf, shareTakeout, PaperRange } from '@/lib/papers-share';

/**
 * «За какой период?» — the four stretches people are actually asked for.
 * An Alert rather than a date picker on purpose: the paper is for a clerk,
 * and clerks ask in calendar words, not in dates.
 */
function askPeriod(onPicked: (range: PaperRange) => void): void {
  Alert.alert(
    t('За какой период?'),
    undefined,
    [
      ...paperRanges().map((preset) => ({
        text: t(preset.label),
        onPress: () => onPicked(preset.range),
      })),
      { text: t('Отмена'), style: 'cancel' as const },
    ],
  );
}

/**
 * The two directions records travel: in from a calendar, out as papers.
 * Everything here produces or consumes a file; nothing here is a setting
 * you flip.
 */
export default function SettingsDataScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const lang = useLang((state) => state.lang);
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.head}>
        <Text style={styles.title}>{t('Календарь и бумаги')}</Text>
        <Press hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={palette.textSecondary} />
        </Press>
      </View>

      <CalendarFeedCard palette={palette} />

      <Press style={styles.linkRow} onPress={() => router.push('/import-ics')}>
        <Ionicons name="calendar-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Импорт из календаря (.ics)')}</Text>
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      </Press>

      <Text style={styles.section}>{t('Бумаги')}</Text>
      <Text style={styles.hint}>
        {t('За этот год, по вашим же записям — и справка честно говорит об этом первой строкой.')}
      </Text>

      <Press
        style={styles.linkRow}
        onPress={() => {
          askPeriod((range) => void shareIncomePdf(lang === 'uk' ? 'ua' : 'ru', range));
        }}
      >
        <Ionicons name="reader-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Справка о доходе (PDF)')}</Text>
        <Ionicons name="share-outline" size={16} color={palette.textSecondary} />
      </Press>

      <Press
        style={styles.linkRow}
        onPress={() => {
          askPeriod((range) => void shareAccountantCsv(range));
        }}
      >
        <Ionicons name="grid-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('CSV бухгалтеру')}</Text>
        <Ionicons name="share-outline" size={16} color={palette.textSecondary} />
      </Press>

      <Press
        style={styles.linkRow}
        onPress={() => {
          void shareTakeout();
        }}
      >
        <Ionicons name="archive-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Скачать весь аккаунт (zip)')}</Text>
        <Ionicons name="share-outline" size={16} color={palette.textSecondary} />
      </Press>
    </ScrollView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 20, paddingBottom: 48, gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: palette.text, fontSize: 26, fontWeight: '800' },
    section: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 10 },
    hint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 17 },

    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    linkText: { color: palette.text, fontSize: 14, flex: 1 },
  });
