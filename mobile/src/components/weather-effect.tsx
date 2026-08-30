import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { todayKey } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import { money } from '@/lib/types';

/**
 * The web's rain card, in the pocket — same wording, same refusal to claim
 * cause. Only places where the gap is worth a sentence are shown at all:
 * a card reporting a four per cent wobble teaches people it reports noise.
 */
interface WeatherEffect {
  location_id: number;
  place: string;
  wet_days: number;
  dry_days: number;
  wet_per_hour: number;
  dry_per_hour: number;
  percent: number;
  worth: boolean;
}

export function WeatherEffectCard({ palette }: { palette: Palette }) {
  const styles = makeStyles(palette);
  const [places, setPlaces] = useState<WeatherEffect[] | null>(null);

  useEffect(() => {
    void api<{ places: WeatherEffect[] }>(`/shifter/v1/weather/effect?today=${todayKey()}`)
      .then((response) => setPlaces(response.places))
      .catch(() => setPlaces([]));
  }, []);

  const worth = (places ?? []).filter((place) => place.worth);

  if (worth.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('Дождь — в вашей собственной статистике')}</Text>
      <Text style={styles.hint}>
        {t('Ваши дни, ваше место и открытый архив погоды. Это совпадение, а не причина.')}
      </Text>

      {worth.map((place) => (
        <View key={place.location_id} style={styles.row}>
          <View style={styles.head}>
            <Text style={styles.place}>{place.place}</Text>
            <Text style={[styles.percent, { color: place.percent < 0 ? palette.danger : palette.good }]}>
              {place.percent > 0 ? '+' : '−'}{Math.abs(place.percent)}%
            </Text>
          </View>
          <Text style={styles.rates}>
            🌧 {money(place.wet_per_hour)}/{t('ч')} · {place.wet_days} {t('дн')}{'   '}
            ☀️ {money(place.dry_per_hour)}/{t('ч')} · {place.dry_days} {t('дн')}
          </Text>
        </View>
      ))}

      <Text style={styles.footer}>
        {t('Чаевые в час в дождливые дни против сухих. Ставка от погоды не зависит, поэтому в расчёт не идёт.')}
      </Text>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 16,
      marginTop: 12,
    },
    title: { color: palette.text, fontSize: 15, fontWeight: '700' },
    hint: { color: palette.textSecondary, fontSize: 12, marginTop: 3, marginBottom: 10, lineHeight: 16 },
    row: { marginBottom: 10 },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    place: { color: palette.text, fontSize: 14, fontWeight: '600' },
    percent: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
    rates: { color: palette.textSecondary, fontSize: 12.5, marginTop: 2 },
    footer: { color: palette.textSecondary, fontSize: 11.5, lineHeight: 15, marginTop: 4 },
  });
