import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Palette } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { AssistantGap, AssistantMessage, AssistantReport, assistant } from '@/lib/assistant';
import { currentMonth, monthBounds, monthLabel, todayKey } from '@/lib/calendar';

type Tab = 'chat' | 'gaps' | 'report';

const TAB_LABEL: Record<Tab, string> = {
  chat: 'Вопросы',
  gaps: 'Пробелы',
  report: 'Месяц',
};

/** What people actually want to know, offered before they have to phrase it. */
const OPENERS = [
  'Сколько я заработал в этом месяце?',
  'Сколько стоит мой час?',
  'Какой был лучший день?',
  'Сколько принесли чаевые?',
];

/**
 * The assistant in the pocket. Every figure it says was counted by the server
 * from the same days the calendar draws — the model, where there is one, only
 * chooses the words, and each answer says which of the two wrote it.
 */
export default function AssistantScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('chat');
  const [thread, setThread] = useState<AssistantMessage[]>([]);
  const [gaps, setGaps] = useState<AssistantGap[]>([]);
  const [report, setReport] = useState<AssistantReport | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    void assistant.messages().then(setThread).catch(() => undefined);
    void assistant.gaps(todayKey()).then(setGaps).catch(() => undefined);
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim();

      if (question === '' || busy) return;

      setBusy(true);
      setError(null);
      setDraft('');

      // Your own words appear at once: waiting for a round trip to see them
      // typed back is what makes a chat feel broken.
      const mine: AssistantMessage = {
        id: -Date.now(),
        role: 'user',
        text: question,
        source: null,
        created_at: new Date().toISOString(),
      };

      setThread((current) => [...current, mine]);

      try {
        const bounds = monthBounds(currentMonth());
        const answer = await assistant.ask(question, bounds.from, bounds.to, todayKey());

        setThread((current) => [...current, answer]);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Ответ не пришёл.');
        setThread((current) => current.filter((message) => message.id !== mine.id));
        setDraft(question);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const makeReport = async () => {
    setWriting(true);
    setError(null);

    try {
      const bounds = monthBounds(currentMonth());

      setReport(await assistant.report(bounds.from, bounds.to));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Разбор не собрался.');
    } finally {
      setWriting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.head, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Помощник</Text>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={palette.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(Object.keys(TAB_LABEL) as Tab[]).map((value) => (
          <Pressable
            key={value}
            style={[styles.tab, tab === value && styles.tabOn]}
            onPress={() => setTab(value)}
          >
            <Text style={[styles.tabText, tab === value && styles.tabTextOn]}>
              {TAB_LABEL[value]}
              {value === 'gaps' && gaps.length > 0 ? ` · ${gaps.length}` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        ref={scroller}
        style={styles.body}
        contentContainerStyle={styles.bodyInner}
        onContentSizeChange={() => {
          if (tab === 'chat') scroller.current?.scrollToEnd({ animated: true });
        }}
      >
        {error !== null && <Text style={styles.error}>{error}</Text>}

        {tab === 'chat' && (
          <>
            {thread.length === 0 && (
              <Text style={styles.lead}>
                Всё, чем он отвечает, посчитано по вашим сменам — цифры он не выдумывает.
              </Text>
            )}

            {thread.map((message) => (
              <View
                key={message.id}
                style={[styles.bubble, message.role === 'user' ? styles.mine : styles.theirs]}
              >
                <Text style={message.role === 'user' ? styles.mineText : styles.theirsText}>
                  {message.text}
                </Text>
                {message.role === 'assistant' && (
                  <Text style={styles.stamp}>
                    {message.source === 'model'
                      ? 'слова — от нейросети'
                      : 'посчитал и написал сам Shifter'}
                  </Text>
                )}
              </View>
            ))}

            {busy && <ActivityIndicator color={palette.accent} style={{ alignSelf: 'flex-start' }} />}

            {thread.length === 0 && (
              <View style={styles.openers}>
                {OPENERS.map((opener) => (
                  <Pressable key={opener} style={styles.opener} onPress={() => void ask(opener)}>
                    <Text style={styles.openerText}>{opener}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {tab === 'gaps' && (
          <GapList
            gaps={gaps}
            palette={palette}
            onAnswered={(id) => setGaps((current) => current.filter((gap) => gap.id !== id))}
          />
        )}

        {tab === 'report' && (
          <>
            <Text style={styles.lead}>
              Соберём {monthLabel(currentMonth()).toLowerCase()} в короткий разбор: откуда деньги,
              лучший день, как этот месяц сидит против прошлого.
            </Text>

            <Pressable
              style={[styles.primary, writing && { opacity: 0.6 }]}
              disabled={writing}
              onPress={() => void makeReport()}
            >
              <Text style={styles.primaryText}>{writing ? 'Пишем…' : 'Разобрать месяц'}</Text>
            </Pressable>

            {report !== null && (
              <View style={styles.reportCard}>
                <Text style={styles.reportSummary}>{report.summary}</Text>

                <View style={styles.statGrid}>
                  {report.stats.map((stat) => (
                    <View key={stat.label} style={styles.stat}>
                      <Text style={styles.statLabel}>{stat.label}</Text>
                      <Text style={styles.statValue}>{stat.value}</Text>
                    </View>
                  ))}
                </View>

                {report.paragraphs.map((paragraph, index) => (
                  <Text key={index} style={styles.paragraph}>
                    {paragraph}
                  </Text>
                ))}

                <Text style={styles.stamp}>
                  {report.source === 'model'
                    ? 'слова — от нейросети'
                    : 'посчитал и написал сам Shifter'}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {tab === 'chat' && (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            maxLength={500}
            placeholder="Спросите про месяц, день, час…"
            placeholderTextColor={palette.textSecondary}
            onSubmitEditing={() => void ask(draft)}
            returnKeyType="send"
          />
          <Pressable
            style={[styles.send, (busy || draft.trim() === '') && { opacity: 0.4 }]}
            disabled={busy || draft.trim() === ''}
            onPress={() => void ask(draft)}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * The blanks, one card each. Answering writes straight into the day it is
 * about — a question that changes nothing is an interruption, not help.
 */
function GapList({
  gaps,
  palette,
  onAnswered,
}: {
  gaps: AssistantGap[];
  palette: Palette;
  onAnswered: (id: string) => void;
}) {
  const styles = makeStyles(palette);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  if (gaps.length === 0) {
    return <Text style={styles.lead}>Пробелов нет — всё, что было, вы уже отметили.</Text>;
  }

  const answer = async (gap: AssistantGap) => {
    const raw = values[gap.id];

    if (raw === undefined || raw.trim() === '') return;

    setSaving(gap.id);

    try {
      await assistant.answerGap(gap.kind, gap.date, gap.shift_id, Number(raw) || 0);
      onAnswered(gap.id);
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <Text style={styles.lead}>
        Каждый ответ ложится прямо в тот день и делает все итоги честнее.
      </Text>

      {gaps.map((gap) => (
        <View key={gap.id} style={styles.gapCard}>
          <Text style={styles.gapQuestion}>{gap.question}</Text>
          <View style={styles.gapRow}>
            <TextInput
              style={[styles.input, styles.gapInput]}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={palette.textSecondary}
              value={values[gap.id] ?? ''}
              onChangeText={(value) => setValues((current) => ({ ...current, [gap.id]: value }))}
            />
            <Pressable
              style={[styles.gapSave, saving === gap.id && { opacity: 0.6 }]}
              disabled={saving === gap.id}
              onPress={() => void answer(gap)}
            >
              <Text style={styles.gapSaveText}>Записать</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    title: { color: palette.text, fontSize: 26, fontWeight: '800' },

    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
    tab: {
      flex: 1,
      alignItems: 'center',
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 8,
    },
    tabOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    tabText: { color: palette.text, fontSize: 13, fontWeight: '600' },
    tabTextOn: { color: '#fff' },

    body: { flex: 1 },
    bodyInner: { padding: 20, paddingTop: 4, paddingBottom: 28, gap: 10 },
    lead: { color: palette.textSecondary, fontSize: 14, lineHeight: 20 },
    error: { color: palette.danger, fontSize: 13 },

    bubble: { maxWidth: '88%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
    mine: { alignSelf: 'flex-end', backgroundColor: palette.accent },
    mineText: { color: '#fff', fontSize: 15, lineHeight: 21 },
    theirs: {
      alignSelf: 'flex-start',
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
    },
    theirsText: { color: palette.text, fontSize: 15, lineHeight: 21 },
    stamp: { color: palette.textSecondary, fontSize: 11, marginTop: 5 },

    openers: { gap: 8, marginTop: 8 },
    opener: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    openerText: { color: palette.text, fontSize: 13.5 },

    composer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 10,
      borderTopColor: palette.border,
      borderTopWidth: 1,
      backgroundColor: palette.background,
    },
    input: {
      flex: 1,
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 11,
      color: palette.text,
      fontSize: 15,
    },
    send: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },

    gapCard: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      gap: 10,
    },
    gapQuestion: { color: palette.text, fontSize: 14.5, lineHeight: 20 },
    gapRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    gapInput: { borderRadius: 12 },
    gapSave: {
      backgroundColor: palette.accent,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 11,
    },
    gapSaveText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    primary: {
      backgroundColor: palette.accent,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },

    reportCard: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      gap: 10,
      marginTop: 6,
    },
    reportSummary: { color: palette.text, fontSize: 16, fontWeight: '700', lineHeight: 22 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    stat: {
      minWidth: '46%',
      flexGrow: 1,
      backgroundColor: palette.backgroundSelected,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    statLabel: { color: palette.textSecondary, fontSize: 11 },
    statValue: { color: palette.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
    paragraph: { color: palette.text, fontSize: 14, lineHeight: 21 },
  });
