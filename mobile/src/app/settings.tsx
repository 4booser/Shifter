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
import { t, useLang } from '@/lib/i18n';

interface Profile {
  login: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  monthly_goal: number | null;
}

/**
 * The account, and the two switches worth having on a phone. Everything else
 * a person can change lives on the site — putting a second, thinner editor in
 * the app is how the two start disagreeing about what a setting means.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const lang = useLang((state) => state.lang);
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
