import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';

/**
 * What to ask before signing — on the device that is in the room.
 *
 * A contract is handed across a table, and the site is at home. The rules are
 * the site's exactly: every line is a question, nothing is a finding, and the
 * text is not kept anywhere.
 */

const QUESTIONS: Record<string, string> = {
  rate: 'Ставка не написана. Спросите, сколько за час или смену и в каком пункте это сказано.',
  paid_on: 'Нет даты выплаты. Спросите, какого числа приходят деньги и что если это выходной.',
  hours: 'Нет рабочих часов. Спросите, сколько их в неделю и кто составляет график.',
  overtime: 'Ничего про часы сверх нормы. Спросите, как считаются и по какой ставке.',
  tips: 'Про чаевые ничего. Спросите, чьи они, общий ли котёл и кто делит.',
  deductions: 'Ничего про удержания. Спросите, что могут удержать и на каком основании.',
  breaks: 'Нет перерыва. Спросите, сколько длится и оплачивается ли.',
  trial: 'Нет испытательного срока. Спросите, есть ли он и отличается ли ставка.',
  notice: 'Ничего про увольнение. Спросите, за сколько предупреждает каждая сторона.',
  holiday: 'Нет отпуска. Спросите, сколько дней в году и как их берут.',
};

const ALSO: Record<string, string> = {
  deductions: 'Про удержания сказано. Попросите пример: что именно считается недостачей и кто это решает.',
  tips: 'Про чаевые сказано. Спросите раздел в цифрах и кто может его поменять.',
};

export default function ContractScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [text, setText] = useState('');
  const [result, setResult] = useState<{ read: boolean; missing: string[]; also: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}>
        <View style={styles.head}>
          <Text style={styles.title}>{t('Вопросы к договору')}</Text>
          <Press hitSlop={12} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={palette.textSecondary} />
          </Press>
        </View>

        <Text style={styles.lead}>
          {t('Вставьте текст — здесь ищут темы, о которых договор молчит, и подсказывают, что спросить. Никаких оценок условий; текст никуда не сохраняется.')}
        </Text>

        <TextInput
          style={styles.input}
          multiline
          placeholder={t('Текст договора')}
          placeholderTextColor={palette.textSecondary}
          value={text}
          onChangeText={setText}
        />

        <Press
          style={[styles.primary, (busy || text.trim() === '') && { opacity: 0.5 }]}
          disabled={busy || text.trim() === ''}
          onPress={() => {
            setBusy(true);

            void api<{ read: boolean; missing: string[]; also: string[] }>(
              '/shifter/v1/contract/questions',
              { body: { text } },
            )
              .then(setResult)
              .catch(() => setResult(null))
              .finally(() => setBusy(false));
          }}
        >
          <Text style={styles.primaryText}>{t('О чём спросить?')}</Text>
        </Press>

        {result !== null && !result.read && (
          <Text style={styles.hint}>
            {t('Слишком коротко для договора — вставьте целиком.')}
          </Text>
        )}

        {result !== null && result.read && result.missing.length === 0 && (
          <Text style={[styles.hint, { color: palette.good }]}>
            {t('Обо всём этом там сказано. Это не значит, что условия справедливые, — пункты всё равно прочитайте.')}
          </Text>
        )}

        {result !== null && result.read && result.missing.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('В договоре об этом ничего')}</Text>
            {result.missing.map((topic) => (
              <Text key={topic} style={styles.question}>
                — {t(QUESTIONS[topic] ?? topic)}
              </Text>
            ))}
          </View>
        )}

        {result !== null && result.read && result.also.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Стоит спросить в любом случае')}</Text>
            {result.also.map((topic) => (
              <Text key={topic} style={styles.question}>
                — {t(ALSO[topic] ?? topic)}
              </Text>
            ))}
          </View>
        )}

        {result !== null && result.read && (
          <Text style={styles.hint}>
            {t('Это вопросы, а не выводы: приложение не знает, что законно, и не притворяется.')}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 20, paddingBottom: 48, gap: 12 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: palette.text, fontSize: 22, fontWeight: '800' },
    lead: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
    input: {
      minHeight: 140,
      color: palette.text,
      fontSize: 13.5,
      backgroundColor: palette.backgroundElement,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 12,
      textAlignVertical: 'top',
    },
    primary: {
      backgroundColor: palette.accent,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
    },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      padding: 14,
      gap: 8,
    },
    cardTitle: { color: palette.text, fontSize: 14.5, fontWeight: '700' },
    question: { color: palette.text, fontSize: 13.5, lineHeight: 19 },
    hint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 18 },
  });
