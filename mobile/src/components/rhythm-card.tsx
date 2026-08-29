import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { money } from '@/lib/types';
import { todayKey } from '@/lib/calendar';

interface RestWindow {
  ended: string;
  resumed: string;
  hours: number;
  short: boolean;
}

interface RestRead {
  threshold: number;
  windows: RestWindow[];
  short_count: number;
  shortest: number | null;
}

interface FatigueVerdict {
  fresh_per_hour: number;
  deep_per_hour: number;
  percent: number;
  noticeable: boolean;
}

/**
 * The rota's rhythm on the phone: the same sentences the web says, and the
 * same silences. No advice — a close-then-open shown as the night it was.
 */
export function RhythmCard({ palette }: { palette: Palette }) {
  const styles = makeStyles(palette);

  const [rest, setRest] = useState<RestRead | null>(null);
  const [fatigue, setFatigue] = useState<FatigueVerdict | null>(null);

  useEffect(() => {
    void api<RestRead>(
      (() => {
        const today = new Date();
        const back = new Date(today.getTime() - 30 * 86400000);

        return `/shifter/v1/rhythm/rest?from=${back.toISOString().slice(0, 10)}&to=${todayKey()}`;
      })(),
    )
      .then(setRest)
      .catch(() => setRest(null));

    // 204 deserialises to undefined: too little data is an answer, not an error.
    void api<FatigueVerdict | undefined>('/shifter/v1/rhythm/fatigue')
      .then((verdict) => setFatigue(verdict ?? null))
      .catch(() => setFatigue(null));
  }, []);

  const windows = (rest?.windows ?? []).slice(-7);
  const worthFatigue = fatigue !== null && fatigue.noticeable;

  if (windows.length === 0 && !worthFatigue) return null;

  const said = (iso: string) => {
    const date = new Date(iso);

    return `${date.toLocaleDateString('ru', { day: 'numeric', month: 'short' })}, ${date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('Ночи между сменами')}</Text>
      <Text style={styles.hint}>
        {t('От ухода до выхода — по вашей же записи, без советов.')}
      </Text>

      {windows.map((window) => (
        <View key={window.ended} style={styles.row}>
          <Text style={styles.when}>{said(window.ended)}</Text>
          <View style={styles.track}>
            <View
              style={[
                styles.bar,
                {
                  width: `${Math.min(100, (window.hours / 16) * 100)}%`,
                  backgroundColor: window.short ? palette.danger : palette.accent,
                  opacity: window.short ? 0.75 : 0.5,
                },
              ]}
            />
          </View>
          <Text style={[styles.hours, window.short && { color: palette.danger }]}>
            {window.hours} {t('ч')}
          </Text>
        </View>
      ))}

      {rest !== null && rest.short_count > 0 && (
        <Text style={styles.summary}>
          {t('Ночей короче')} {rest.threshold} {t('ч')}: {rest.short_count}{' '}
          {t('за месяц; самая короткая —')} {rest.shortest} {t('ч')}.
        </Text>
      )}

      {worthFatigue && fatigue !== null && (
        <Text style={styles.summary}>
          {t('Длинные серии видно в чае: день один-два —')} {money(fatigue.fresh_per_hour)}/{t('ч')},{' '}
          {t('к шестому —')} {money(fatigue.deep_per_hour)}/{t('ч')} ({fatigue.percent > 0 ? '+' : '−'}
          {Math.abs(fatigue.percent)}%). {t('Совпадение, не причина.')}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      padding: 14,
      gap: 6,
    },
    cardTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    hint: { color: palette.textSecondary, fontSize: 12, marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    when: { color: palette.textSecondary, fontSize: 11.5, width: 92, fontVariant: ['tabular-nums'] },
    track: { flex: 1, height: 12, borderRadius: 6, backgroundColor: palette.background, overflow: 'hidden' },
    bar: { height: '100%', borderRadius: 6 },
    hours: { color: palette.text, fontSize: 12, fontWeight: '600', width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
    summary: { color: palette.text, fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  });
