import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { DeviceSettings, deviceSettings, deviceToken } from '@/lib/notifications';

interface Profile {
  email: string | null;
  monthly_letter: boolean;
}

/** One switch row: title, hint, and the switch itself. */
function NudgeRow(props: {
  title: string;
  hint: string;
  value: boolean;
  onFlip: (value: boolean) => void;
  palette: Palette;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={props.styles.row}>
      <View style={props.styles.grow}>
        <Text style={props.styles.rowTitle}>{props.title}</Text>
        <Text style={props.styles.rowHint}>{props.hint}</Text>
      </View>
      <Switch
        value={props.value}
        onValueChange={props.onFlip}
        trackColor={{ true: props.palette.accent, false: props.palette.border }}
      />
    </View>
  );
}

/**
 * Everything that arrives on its own: the three pushes and the month's
 * letter. On a simulator there is no push service — the screen says so
 * instead of showing switches that would do nothing.
 */
export default function SettingsAlertsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const token = deviceToken();
  const [nudges, setNudges] = useState<DeviceSettings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [letter, setLetter] = useState(false);

  useEffect(() => {
    if (token !== null) void deviceSettings(token).then(setNudges);

    void api<Profile>('/shifter/v1/account')
      .then((loaded) => {
        setProfile(loaded);
        setLetter(loaded.monthly_letter);
      })
      .catch(() => setProfile(null));
  }, [token]);

  const flip = (patch: Partial<DeviceSettings>) => {
    if (token === null || nudges === null) return;

    setNudges({ ...nudges, ...patch });
    void deviceSettings(token, patch).then((fresh) => fresh !== null && setNudges(fresh));
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.head}>
        <Text style={styles.title}>{t('Уведомления')}</Text>
        <Press hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={palette.textSecondary} />
        </Press>
      </View>

      {token === null ? (
        <Text style={styles.lead}>
          {t('Пуш-служба на этом устройстве не зарегистрирована — переключатели появятся на настоящем телефоне.')}
        </Text>
      ) : nudges === null ? (
        <ActivityIndicator color={palette.accent} />
      ) : (
        <View style={styles.card}>
          <NudgeRow
            title={t('Завтра смена')}
            hint={`${t('Вечером накануне, в')} ${nudges.notify_at}`}
            value={nudges.notify_tomorrow}
            onFlip={(value) => flip({ notify_tomorrow: value })}
            palette={palette}
            styles={styles}
          />
          <NudgeRow
            title={t('Сегодня зарплата')}
            hint={t('Утром того дня, когда деньги должны прийти.')}
            value={nudges.notify_payday}
            onFlip={(value) => flip({ notify_payday: value })}
            palette={palette}
            styles={styles}
          />
          <NudgeRow
            title={t('Вчера не закрыт')}
            hint={t('Вечером, если смена записана, а чаевых и продаж нет.')}
            value={nudges.notify_unclosed}
            onFlip={(value) => flip({ notify_unclosed: value })}
            palette={palette}
            styles={styles}
          />
        </View>
      )}

      <Text style={styles.section}>{t('Письмо месяца')}</Text>
      {profile === null || profile.email === null ? (
        <Text style={styles.lead}>
          {t('Почтового адреса ещё нет. Впишите его в «Аккаунт и ключи» — и итог месяца можно получать письмом.')}
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

    card: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      gap: 14,
    },
    section: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 10 },
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
  });
