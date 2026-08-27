import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';
import { Brief, assistant } from '@/lib/assistant';
import { todayKey } from '@/lib/calendar';

/**
 * The day in words, under the month where the screen used to trail off. The
 * numbers behind it are the app's own; the model, when configured, only picks
 * the sentences. Tapping it opens the thread, because the commonest reaction
 * to a sentence about your money is a question about it.
 */
export function DailyBrief({ palette, onOpen }: { palette: Palette; onOpen: () => void }) {
  const styles = makeStyles(palette);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void assistant
      .brief(todayKey())
      .then(setBrief)
      .catch(() => setFailed(true));
  }, []);

  // A brief is a nicety: a server without it should show nothing rather than
  // an apology for something the reader never asked for.
  if (failed || brief === null) return null;

  return (
    <Pressable style={styles.card} onPress={onOpen}>
      <View style={styles.head}>
        <Text style={styles.mood}>{brief.mood ?? '💡'}</Text>
        <Text style={styles.headline} numberOfLines={2}>
          {brief.headline}
        </Text>
      </View>

      <Text style={styles.body}>{brief.body}</Text>

      {brief.tip !== null && brief.tip !== '' && <Text style={styles.tip}>{brief.tip}</Text>}

      <View style={styles.foot}>
        <Text style={styles.stamp}>
          {brief.source === 'model' ? 'слова — от нейросети' : 'посчитал и написал сам Shifter'}
        </Text>
        <View style={styles.ask}>
          <Text style={styles.askText}>Спросить</Text>
          <Ionicons name="chevron-forward" size={13} color={palette.accent} />
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      gap: 8,
      marginTop: 4,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    mood: { fontSize: 22 },
    headline: { flex: 1, color: palette.text, fontSize: 16, fontWeight: '700', lineHeight: 22 },
    body: { color: palette.text, fontSize: 14, lineHeight: 20 },
    tip: { color: palette.accent, fontSize: 13.5, lineHeight: 19 },
    foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    stamp: { color: palette.textSecondary, fontSize: 11 },
    ask: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    askText: { color: palette.accent, fontSize: 13, fontWeight: '700' },
  });
