import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api, API_BASE } from '@/lib/api';
import { lockKind, LockKind, lockNameBy, lockStore, unlock } from '@/lib/lock';
import { useSession } from '@/store/session';
import { useEye } from '@/lib/eye';
import { t, useLang } from '@/lib/i18n';
import { buzz } from '@/lib/haptics';

interface Profile {
  login: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  /** Hours of rest that count as enough between shifts. */
  rest_hours: number;
}

/**
 * The hub. Device-local switches live here — language, the eye, the lock —
 * because flipping them must never wait on the network. Everything that
 * talks to the server got a screen of its own: keys, alerts, papers.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const lang = useLang((state) => state.lang);
  const eyeIsShut = useEye((state) => state.shut);
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();
  const signOut = useSession((state) => state.signOut);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [locked, setLocked] = useState(false);
  const [kind, setKind] = useState<LockKind>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLocked(await lockStore.enabled());
      setKind(await lockKind());

      try {
        setProfile(await api<Profile>('/shifter/v1/account'));
      } catch {
        setError(t('Профиль не загрузился.'));
      }
    })();
  }, []);

  const [rest, setRest] = useState<number | null>(null);

  useEffect(() => {
    if (profile !== null) setRest(profile.rest_hours);
  }, [profile]);

  const chooseRest = async (hours: number) => {
    buzz.choose();
    setRest(hours);

    try {
      await api('/shifter/v1/auth/rest', { method: 'PUT', body: { rest_hours: hours } });
    } catch {
      buzz.lost();
      setRest(profile?.rest_hours ?? null);
    }
  };

  const toggleLock = async (on: boolean) => {
    // Turning it on without proving you can open it is how somebody locks
    // themselves out of their own month.
    if (on && !(await unlock())) return;

    await lockStore.set(on);
    setLocked(on);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.head}>
        <Text style={styles.title}>{t('Настройки')}</Text>
        <Press hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={palette.textSecondary} />
        </Press>
      </View>

      {profile === null && error === null && <ActivityIndicator color={palette.accent} />}
      {error !== null && <Text style={styles.error}>{error}</Text>}

      {profile !== null && (
        <View style={styles.card}>
          <Text style={styles.name}>
            {profile.first_name} {profile.last_name ?? ''}
          </Text>
          <Text style={styles.meta}>{profile.login}</Text>
          {profile.email !== null && <Text style={styles.meta}>{profile.email}</Text>}
        </View>
      )}

      <Press style={styles.linkRow} onPress={() => router.push('/settings-keys')}>
        <Ionicons name="key-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Аккаунт и ключи — пароль, 2FA, почта')}</Text>
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      </Press>

      <Press style={styles.linkRow} onPress={() => router.push('/settings-alerts')}>
        <Ionicons name="notifications-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Уведомления — пуши и письмо месяца')}</Text>
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      </Press>

      <Press style={styles.linkRow} onPress={() => router.push('/settings-data')}>
        <Ionicons name="calendar-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Календарь и бумаги — .ics, PDF, CSV')}</Text>
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      </Press>

      <Text style={styles.section}>{t('Язык')}</Text>
      <View style={styles.langRow}>
        {(
          [
            ['ru', 'Русский'],
            ['uk', 'Українська'],
          ] as const
        ).map(([code, name]) => (
          <Press
            key={code}
            style={[styles.lang, lang === code && styles.langOn]}
            onPress={() => useLang.getState().choose(code)}
          >
            <Text style={[styles.langText, lang === code && styles.langTextOn]}>{name}</Text>
          </Press>
        ))}
      </View>

      <Text style={styles.section}>{t('Приватность')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={styles.rowTitle}>{t('Скрыть суммы')}</Text>
            <Text style={styles.rowHint}>{t('Цифры станут ₴••• на всех экранах')}</Text>
          </View>
          <Switch value={eyeIsShut} onValueChange={(value) => useEye.getState().set(value)} />
        </View>
      </View>

      <Text style={styles.section}>{t('Замок')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={styles.rowTitle}>
              {kind === null ? t('Замок недоступен') : `${t('Открывать по')} ${lockNameBy(kind)}`}
            </Text>
            <Text style={styles.rowHint}>
              {kind === null
                ? t('На этом телефоне не настроен ни Face ID, ни отпечаток, ни код.')
                : t('Сколько вы зарабатываете — видите только вы, даже если телефон дали подержать.')}
            </Text>
          </View>
          <Switch
            value={locked}
            disabled={kind === null}
            onValueChange={(value) => void toggleLock(value)}
            trackColor={{ true: palette.accent, false: palette.border }}
          />
        </View>
      </View>

      {rest !== null && (
        <>
          <Text style={styles.section}>{t('Отдых между сменами')}</Text>
          <View style={styles.card}>
            <Text style={styles.rowHint}>
              {t('Сколько часов от ухода до выхода считать нормой. Меньше — сводка скажет «закрытие и открытие подряд».')}
            </Text>
            <View style={styles.restRow}>
              {[8, 10, 11, 12, 14].map((hours) => (
                <Press
                  key={hours}
                  style={[styles.restChip, rest === hours && styles.restChipOn]}
                  onPress={() => void chooseRest(hours)}
                >
                  <Text style={[styles.restChipText, rest === hours && styles.restChipTextOn]}>
                    {hours}{t('ч')}
                  </Text>
                </Press>
              ))}
            </View>
          </View>
        </>
      )}

      <Text style={styles.section}>{t('Ваша работа')}</Text>
      <Press style={styles.linkRow} onPress={() => router.push('/templates')}>
        <Ionicons name="time-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Шаблоны смен — часы, ставка, процент')}</Text>
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      </Press>

      <Press style={styles.linkRow} onPress={() => router.push('/places')}>
        <Ionicons name="business-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Места работы — выплаты, налог, ночные')}</Text>
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      </Press>

      <Press style={styles.linkRow} onPress={() => router.push('/contract')}>
        <Ionicons name="document-text-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Вопросы к договору — до подписи')}</Text>
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      </Press>

      <Press style={styles.linkRow} onPress={() => router.push('/record')}>
        <Ionicons name="ribbon-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Послужной список и хроника')}</Text>
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      </Press>

      <Text style={styles.section}>{t('Остальное')}</Text>
      <Press
        style={styles.linkRow}
        onPress={() => void Linking.openURL('https://www.shifter.ink/account')}
      >
        <Ionicons name="person-circle-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Профиль и аватар — на сайте')}</Text>
        <Ionicons name="open-outline" size={16} color={palette.textSecondary} />
      </Press>

      <Press
        style={styles.linkRow}
        onPress={() => void Linking.openURL('https://www.shifter.ink/roadmap')}
      >
        <Ionicons name="map-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Что нового и что дальше')}</Text>
        <Ionicons name="open-outline" size={16} color={palette.textSecondary} />
      </Press>

      <Press style={styles.signOut} onPress={signOut}>
        <Ionicons name="log-out-outline" size={18} color={palette.danger} />
        <Text style={styles.signOutText}>{t('Выйти')}</Text>
      </Press>

      <Text style={styles.build}>{API_BASE}</Text>
    </ScrollView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 20, paddingBottom: 48, gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: palette.text, fontSize: 26, fontWeight: '800' },
    grow: { flex: 1 },
    error: { color: palette.danger, fontSize: 13 },

    card: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      gap: 4,
    },
    name: { color: palette.text, fontSize: 18, fontWeight: '700' },
    meta: { color: palette.textSecondary, fontSize: 13 },

    langRow: { flexDirection: 'row', gap: 8 },
    lang: {
      flex: 1,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      paddingVertical: 13,
    },
    langOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    langText: { color: palette.text, fontSize: 15, fontWeight: '700' },
    langTextOn: { color: '#fff' },

    section: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowTitle: { color: palette.text, fontSize: 15, fontWeight: '600' },
    rowHint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 3 },

    restRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    restChip: {
      flex: 1,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 12,
      paddingVertical: 10,
    },
    restChipOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    restChipText: { color: palette.text, fontSize: 14, fontWeight: '600' },
    restChipTextOn: { color: '#fff' },

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

    signOut: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 14,
      marginTop: 16,
    },
    signOutText: { color: palette.danger, fontSize: 15, fontWeight: '600' },
    build: { color: palette.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 14 },
  });
