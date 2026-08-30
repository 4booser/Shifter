import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountKeys } from '@/components/account-keys';
import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { ApiError, api } from '@/lib/api';
import { t } from '@/lib/i18n';

interface Profile {
  email: string | null;
  has_password: boolean;
  two_factor: boolean;
}

/**
 * The keys to the account: the address «forgot password» writes to, the
 * password itself, and the second factor. One screen, because these three
 * are what somebody checks after a phone goes missing.
 */
export default function SettingsKeysScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSaid, setEmailSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const reloadProfile = useCallback(async () => {
    try {
      const loaded = await api<Profile>('/shifter/v1/account');

      setProfile(loaded);
      setEmailDraft(loaded.email ?? '');
    } catch {
      setError(t('Профиль не загрузился.'));
    }
  }, []);

  useEffect(() => {
    void reloadProfile();
  }, [reloadProfile]);

  const saveEmail = async () => {
    setEmailBusy(true);
    setEmailSaid(null);

    try {
      // Empty clears the address — and the letter subscription with it,
      // which the server does on its own and the reload will show.
      await api('/shifter/v1/account/avatar/email', {
        method: 'PUT',
        body: { email: emailDraft.trim() === '' ? null : emailDraft.trim() },
      });
      await reloadProfile();
      setEmailSaid({ ok: true, text: t('Сохранено.') });
    } catch (caught) {
      setEmailSaid({
        ok: false,
        text: caught instanceof ApiError ? caught.message : t('Сеть молчит. Сервер доступен?'),
      });
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.head}>
        <Text style={styles.title}>{t('Аккаунт и ключи')}</Text>
        <Press hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={palette.textSecondary} />
        </Press>
      </View>

      {profile === null && error === null && <ActivityIndicator color={palette.accent} />}
      {error !== null && <Text style={styles.error}>{error}</Text>}

      {profile !== null && (
        <>
          <Text style={styles.section}>{t('Почта')}</Text>
          <View style={styles.card}>
            <Text style={styles.rowHint}>
              {t('Адрес нужен «забыли пароль» и письму месяца. Он не публикуется.')}
            </Text>
            <View style={styles.emailRow}>
              <TextInput
                style={[styles.emailInput]}
                placeholder="you@example.com"
                placeholderTextColor={palette.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={emailDraft}
                onChangeText={setEmailDraft}
              />
              <Press
                style={[styles.emailSave, emailDraft.trim() === (profile.email ?? '') && styles.emailSaveOff]}
                disabled={emailBusy || emailDraft.trim() === (profile.email ?? '')}
                onPress={() => void saveEmail()}
              >
                {emailBusy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.emailSaveText}>{t('Сохранить')}</Text>
                )}
              </Press>
            </View>
            {emailSaid !== null && (
              <Text style={[styles.rowHint, { color: emailSaid.ok ? palette.good : palette.danger }]}>
                {emailSaid.text}
              </Text>
            )}
          </View>

          <AccountKeys
            palette={palette}
            hasPassword={profile.has_password}
            twoFactor={profile.two_factor}
            onChanged={() => void reloadProfile()}
          />
        </>
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
    error: { color: palette.danger, fontSize: 13 },

    card: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      gap: 4,
    },
    section: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 10 },
    rowHint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
    emailRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    emailInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      color: palette.text,
      backgroundColor: palette.background,
    },
    emailSave: {
      backgroundColor: palette.accent,
      borderRadius: 10,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emailSaveOff: { backgroundColor: palette.border },
    emailSaveText: { color: '#fff', fontWeight: '700' },
  });
