import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { api, API_BASE } from '@/lib/api';
import { t } from '@/lib/i18n';

/**
 * The site's calendar-subscription card, on the device the calendar actually
 * lives on. The link is secret and the share sheet is the honest way to move
 * it into Google/Apple Calendar; money never travels through the feed.
 */
export function CalendarFeedCard({ palette }: { palette: Palette }) {
  const styles = makeStyles(palette);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ token: string | null }>('/shifter/v1/feed')
      .then((response) => setToken(response.token))
      .catch(() => setToken(null));
  }, []);

  if (token === undefined) return null;

  const url = token === null ? null : `${API_BASE}/feed/${token}.ics`;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);

    try {
      await work();
    } catch {
      // The card stays as it was; the next tap tries again.
    } finally {
      setBusy(false);
    }
  };

  const turnOn = () =>
    run(async () => {
      const response = await api<{ token: string }>('/shifter/v1/feed', { method: 'POST', body: {} });

      setToken(response.token);
    });

  const turnOff = () =>
    Alert.alert(t('Выключить фид?'), t('Подписанные календари перестанут обновляться.'), [
      { text: t('Оставить'), style: 'cancel' },
      {
        text: t('Выключить'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await api('/shifter/v1/feed', { method: 'DELETE' });
            setToken(null);
          }),
      },
    ]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('Календарная подписка')}</Text>
      <Text style={styles.hint}>
        {t('Смены сами появляются в Google или Apple Calendar. Передаются времена и названия — деньги никогда.')}
      </Text>

      {url === null ? (
        <Press style={styles.button} disabled={busy} onPress={() => void turnOn()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('Включить фид')}</Text>}
        </Press>
      ) : (
        <>
          <Text style={styles.url} numberOfLines={1} ellipsizeMode="middle">
            {url}
          </Text>
          <View style={styles.rowButtons}>
            <Press
              style={[styles.button, styles.grow]}
              disabled={busy}
              onPress={() => void Share.share({ message: url })}
            >
              <Text style={styles.buttonText}>{t('Поделиться ссылкой')}</Text>
            </Press>
            <Press style={[styles.button, styles.ghost]} disabled={busy} onPress={turnOff}>
              <Text style={[styles.buttonText, { color: palette.danger }]}>{t('Выключить')}</Text>
            </Press>
          </View>
        </>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 14,
      marginBottom: 10,
    },
    title: { color: palette.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
    hint: { color: palette.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 10 },
    url: {
      color: palette.textSecondary,
      fontFamily: 'Menlo',
      fontSize: 11.5,
      marginBottom: 10,
    },
    rowButtons: { flexDirection: 'row', gap: 8 },
    grow: { flex: 1 },
    button: {
      backgroundColor: palette.accent,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      paddingHorizontal: 14,
    },
    ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.danger },
    buttonText: { color: '#fff', fontWeight: '700' },
  });
