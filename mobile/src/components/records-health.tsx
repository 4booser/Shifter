import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';

interface Gap {
  kind: string;
  count: number;
  sample: string[];
  hurts: string;
}

const KIND: Record<string, { title: string; hurts: string }> = {
  tips_unsaid: { title: 'Смены без записанных чаевых', hurts: 'занижает «чай по дням недели» и итоги месяца' },
  city_unsaid: { title: 'Места без города', hurts: 'не попадают в «где мой час дороже»' },
  actual_times_unsaid: { title: 'Смены без фактических часов', hurts: 'окна сна меряются по плану, а не по ночи' },
  rate_zero: { title: 'Часовые смены с нулевой ставкой', hurts: 'заработок этих дней — ноль, почти наверняка враньё' },
};

/** The record's health, in the pocket — same map, same silences. */
export function RecordsHealthCard({ palette }: { palette: Palette }) {
  const styles = makeStyles(palette);
  const [gaps, setGaps] = useState<Gap[]>([]);

  useEffect(() => {
    void api<Gap[]>('/shifter/v1/health/records')
      .then(setGaps)
      .catch(() => setGaps([]));
  }, []);

  if (gaps.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('Дозаполнить')}</Text>
      <Text style={styles.hint}>
        {t('Не домашка — карта: каждая строка говорит, что стоит дыра. Список сокращается от заполнения.')}
      </Text>

      {gaps.map((gap) => {
        const known = KIND[gap.kind];

        if (known === undefined) return null;

        return (
          <View key={gap.kind} style={styles.row}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{gap.count}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t(known.title)}</Text>
              <Text style={styles.rowHurts}>
                {t(known.hurts)}
                {gap.sample.length > 0 ? ` · ${gap.sample.join(', ')}` : ''}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: palette.backgroundElement, borderRadius: 16, padding: 14, gap: 8 },
    cardTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    hint: { color: palette.textSecondary, fontSize: 12, lineHeight: 16 },
    row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    badge: {
      minWidth: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: palette.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: { color: palette.accent, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
    rowTitle: { color: palette.text, fontSize: 13.5, fontWeight: '600' },
    rowHurts: { color: palette.textSecondary, fontSize: 12, lineHeight: 16 },
  });
