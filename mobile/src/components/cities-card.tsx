import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { money } from '@/lib/types';

interface CityRow {
  city: string;
  hours: number;
  days: number;
  per_hour: number;
  market: { median: number; low: number; high: number; employers: number } | null;
}

/**
 * «Где мой час дороже» — the same card the web stats page shows, with the
 * same silences: fewer than two tagged cities and it stays off the screen,
 * and the market line appears only where the public sample cleared the
 * anonymity bar on the server.
 */
export function CitiesCard({ palette }: { palette: Palette }) {
  const styles = makeStyles(palette);

  const [rows, setRows] = useState<CityRow[]>([]);

  useEffect(() => {
    void api<CityRow[]>('/shifter/v1/gigs/cities')
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (rows.length < 2) return null;

  const top = rows[0].per_hour;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('Ваши города')}</Text>
      <Text style={styles.hint}>{t('Своя ставка в час, сезон против сезона.')}</Text>

      {rows.map((row) => (
        <View key={row.city} style={styles.row}>
          <Text style={styles.city}>{row.city}</Text>
          <View style={styles.track}>
            <View
              style={[styles.bar, { width: `${Math.max(8, (row.per_hour / top) * 100)}%` }]}
            />
          </View>
          <Text style={styles.rate}>{money(row.per_hour)}/{t('ч')}</Text>
        </View>
      ))}

      {rows.filter((row) => row.market !== null).map((row) => (
        <Text key={`m-${row.city}`} style={styles.market}>
          {t('Биржа в')} {row.city}: {money(row.market!.low)}–{money(row.market!.high)}/{t('ч')},{' '}
          {t('медиана')} {money(row.market!.median)}
        </Text>
      ))}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: palette.backgroundElement, borderRadius: 16, padding: 14, gap: 6 },
    cardTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    hint: { color: palette.textSecondary, fontSize: 12, marginBottom: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    city: { color: palette.text, fontSize: 13, fontWeight: '600', width: 84 },
    track: { flex: 1, height: 12, borderRadius: 6, backgroundColor: palette.background, overflow: 'hidden' },
    bar: { height: '100%', borderRadius: 6, backgroundColor: palette.accent, opacity: 0.55 },
    rate: { color: palette.text, fontSize: 12.5, fontWeight: '700', width: 76, textAlign: 'right', fontVariant: ['tabular-nums'] },
    market: { color: palette.textSecondary, fontSize: 12, marginTop: 2 },
  });
