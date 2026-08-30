import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
import { AccountKeys } from '@/components/account-keys';
import { CalendarFeedCard } from '@/components/calendar-feed';
import { useEye } from '@/lib/eye';
import { t, useLang } from '@/lib/i18n';
import { DeviceSettings, deviceSettings, deviceToken } from '@/lib/notifications';
import { paperRanges, shareAccountantCsv, shareIncomePdf, shareTakeout, PaperRange } from '@/lib/papers-share';

interface Profile {
  login: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  has_password: boolean;
  two_factor: boolean;
  monthly_goal: number | null;
  /** Whether they asked for the month's letter. Off unless they did. */
  monthly_letter: boolean;
}

/**
 * The account, and the two switches worth having on a phone. Everything else
 * a person can change lives on the site — putting a second, thinner editor in
 * the app is how the two start disagreeing about what a setting means.
 */
/**
 * «За какой период?» — the four stretches people are actually asked for.
 * An Alert rather than a date picker on purpose: the paper is for a clerk,
 * and clerks ask in calendar words, not in dates.
 */
function askPeriod(onPicked: (range: PaperRange) => void): void {
  Alert.alert(
    t('За какой период?'),
    undefined,
    [
      ...paperRanges().map((preset) => ({
        text: t(preset.label),
        onPress: () => onPicked(preset.range),
      })),
      { text: t('Отмена'), style: 'cancel' as const },
    ],
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const lang = useLang((state) => state.lang);
  const eyeIsShut = useEye((state) => state.shut);
  const [nudges, setNudges] = useState<DeviceSettings | null>(null);
  const token = deviceToken();

  // Asked for once, with nothing to change: the same call that sets a switch
  // is the one that reads them, so there is no second endpoint to keep in step.
  useEffect(() => {
    if (token === null) return;

    void deviceSettings(token).then(setNudges);
  }, [token]);
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();
  const signOut = useSession((state) => state.signOut);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [locked, setLocked] = useState(false);
  const [kind, setKind] = useState<LockKind>(null);
  const [error, setError] = useState<string | null>(null);

  // The month's letter: the one email frequency that is not an irritation,
  // subscribed to from the device the address was typed on.
  const [letter, setLetter] = useState(false);

  const reloadProfile = useCallback(async () => {
    try {
      const loaded = await api<Profile>('/shifter/v1/account');

      setProfile(loaded);
      setLetter(loaded.monthly_letter);
    } catch {
      setError(t('Профиль не загрузился.'));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLocked(await lockStore.enabled());
      setKind(await lockKind());

      await reloadProfile();
    })();
  }, [reloadProfile]);

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

      <CalendarFeedCard palette={palette} />

      {profile !== null && (
        <AccountKeys
          palette={palette}
          hasPassword={profile.has_password}
          twoFactor={profile.two_factor}
          onChanged={() => void reloadProfile()}
        />
      )}

      {/* Only where the phone actually registered. A simulator has no push
          service, and switches that would do nothing are worse than none. */}
      {token !== null && nudges !== null && (
        <>
          <Text style={styles.section}>{t('Уведомления')}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>{t('Завтра смена')}</Text>
                <Text style={styles.rowHint}>
                  {t('Вечером накануне, в')} {nudges.notify_at}
                </Text>
              </View>
              <Switch
                value={nudges.notify_tomorrow}
                onValueChange={(value) => {
                  setNudges({ ...nudges, notify_tomorrow: value });
                  void deviceSettings(token, { notify_tomorrow: value }).then(
                    (fresh) => fresh !== null && setNudges(fresh),
                  );
                }}
                trackColor={{ true: palette.accent, false: palette.border }}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>{t('Сегодня зарплата')}</Text>
                <Text style={styles.rowHint}>
                  {t('Утром того дня, когда деньги должны прийти.')}
                </Text>
              </View>
              <Switch
                value={nudges.notify_payday}
                onValueChange={(value) => {
                  setNudges({ ...nudges, notify_payday: value });
                  void deviceSettings(token, { notify_payday: value }).then(
                    (fresh) => fresh !== null && setNudges(fresh),
                  );
                }}
                trackColor={{ true: palette.accent, false: palette.border }}
              />
            </View>
          </View>
        </>
      )}

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

      {profile !== null && (
        <>
          <Text style={styles.section}>{t('Письмо месяца')}</Text>
          {profile.email === null ? (
            <Text style={styles.lead}>
              {t('Впишите адрес на сайте — и раз в месяц, после его конца, сюда можно получать итог письмом.')}
            </Text>
          ) : (
            <Press
              style={styles.linkRow}
              onPress={() => {
                const next = !letter;

                // Optimistic and honest about failure: flipped back if the
                // server refuses, never left claiming what did not happen.
                setLetter(next);

                void api('/shifter/v1/account/avatar/letter', {
                  method: 'PUT',
                  body: { on: next },
                }).catch(() => setLetter(!next));
              }}
            >
              <Ionicons
                name={letter ? 'mail' : 'mail-outline'}
                size={20}
                color={letter ? palette.accent : palette.textSecondary}
              />
              <View style={styles.grow}>
                <Text style={styles.linkText}>
                  {letter ? t('Присылать на') : t('Итог месяца письмом')}
                  {letter ? ` ${profile.email}` : ''}
                </Text>
                <Text style={styles.rowHint}>
                  {t('Раз в месяц, когда цифры окончательные. В каждом письме — ссылка, которая их прекращает.')}
                </Text>
              </View>
              <Ionicons
                name={letter ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={letter ? palette.good : palette.textSecondary}
              />
            </Press>
          )}
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

      <Press style={styles.linkRow} onPress={() => router.push('/import-ics')}>
        <Ionicons name="calendar-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Импорт из календаря (.ics)')}</Text>
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      </Press>

      <Press style={styles.linkRow} onPress={() => router.push('/record')}>
        <Ionicons name="ribbon-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Послужной список и хроника')}</Text>
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      </Press>

      <Text style={styles.section}>{t('Бумаги')}</Text>
      <Text style={styles.hint}>
        {t('За этот год, по вашим же записям — и справка честно говорит об этом первой строкой.')}
      </Text>

      <Press
        style={styles.linkRow}
        onPress={() => {
          askPeriod((range) => void shareIncomePdf(lang === 'uk' ? 'ua' : 'ru', range));
        }}
      >
        <Ionicons name="reader-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Справка о доходе (PDF)')}</Text>
        <Ionicons name="share-outline" size={16} color={palette.textSecondary} />
      </Press>

      <Press
        style={styles.linkRow}
        onPress={() => {
          askPeriod((range) => void shareAccountantCsv(range));
        }}
      >
        <Ionicons name="grid-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('CSV бухгалтеру')}</Text>
        <Ionicons name="share-outline" size={16} color={palette.textSecondary} />
      </Press>

      <Press
        style={styles.linkRow}
        onPress={() => {
          void shareTakeout();
        }}
      >
        <Ionicons name="archive-outline" size={20} color={palette.textSecondary} />
        <Text style={styles.linkText}>{t('Скачать весь аккаунт (zip)')}</Text>
        <Ionicons name="share-outline" size={16} color={palette.textSecondary} />
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
    hint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 17 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowTitle: { color: palette.text, fontSize: 15, fontWeight: '600' },
    rowHint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
    lead: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 18 },

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
