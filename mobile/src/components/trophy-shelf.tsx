import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { money } from '@/lib/types';

interface Cheer {
  period: string;
  period_from: string;
  amount: number;
}

interface Shelf {
  weekly_streak: number;
  cheers: Cheer[];
}

const PERIOD: Record<string, string> = {
  day: 'дневная',
  week: 'недельная',
  month: 'месячная',
  year: 'годовая',
};

/** The trophy shelf, in the pocket: crossed goals kept as they stood. */
export function TrophyShelf({ palette }: { palette: Palette }) {
  const styles = makeStyles(palette);
  const [shelf, setShelf] = useState<Shelf | null>(null);

  useEffect(() => {
    void api<Shelf>('/shifter/v1/goals/history')
      .then(setShelf)
      .catch(() => setShelf(null));
  }, []);

  if (shelf === null || shelf.cheers.length === 0) return null;

  const said = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'short' });

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.cardTitle}>{t('Полка')}</Text>
        {shelf.weekly_streak >= 2 && (
          <Text style={styles.streak}>
            {shelf.weekly_streak} {t('нед. подряд')}
          </Text>
        )}
      </View>
      <Text style={styles.hint}>
        {t('Закрытые цели, как они стояли: планка поднялась — кубки не переехали.')}
      </Text>

      <View style={styles.row}>
        {shelf.cheers.slice(0, 12).map((cheer) => (
          <View key={`${cheer.period}-${cheer.period_from}`} style={styles.chip}>
            <Text style={styles.chipText}>
              🏆 {money(cheer.amount)}{' '}
              <Text style={styles.chipMeta}>
                {t(PERIOD[cheer.period] ?? cheer.period)} · {said(cheer.period_from)}
              </Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: palette.backgroundElement, borderRadius: 16, padding: 14, gap: 6 },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    cardTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    streak: { color: palette.good, fontSize: 12.5, fontWeight: '700' },
    hint: { color: palette.textSecondary, fontSize: 12, lineHeight: 16 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    chip: {
      backgroundColor: palette.background,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    chipText: { color: palette.text, fontSize: 12.5, fontVariant: ['tabular-nums'] },
    chipMeta: { color: palette.textSecondary, fontSize: 11.5 },
  });
