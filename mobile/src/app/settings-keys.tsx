import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useSession } from '@/store/session';
import { t } from '@/lib/i18n';

interface Profile {
  login: string;
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
  const [arming, setArming] = useState(false);
  const [confirmLogin, setConfirmLogin] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [removing, setRemoving] = useState(false);
  const [removeSaid, setRemoveSaid] = useState<string | null>(null);
  const signOut = useSession((state) => state.signOut);

  const removeAccount = async () => {
    setRemoving(true);
    setRemoveSaid(null);

    try {
      await api('/shifter/v1/account', {
        method: 'DELETE',
        body: {
          password: confirmPassword === '' ? null : confirmPassword,
          confirm_login: confirmLogin.trim(),
        },
      });
      await signOut();
    } catch (caught) {
      setRemoveSaid(caught instanceof ApiError ? caught.message : t('Сеть молчит. Сервер доступен?'));
    } finally {
      setRemoving(false);
    }
  };

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

          {/* The red zone, last on purpose. The App Store also requires the
              account to be deletable from inside the app — but mostly this is
              simply the person's own data, and the door out belongs to them. */}
          <Text style={styles.sectionDanger}>{t('Удалить аккаунт')}</Text>
          <View style={styles.card}>
            <Text style={styles.rowHint}>
              {t('Уйдёт всё: дни, смены, места, история. Обратной дороги нет.')}
            </Text>
            {!arming ? (
              <Press style={styles.dangerDoor} onPress={() => setArming(true)}>
                <Text style={styles.dangerDoorText}>{t('Я понимаю — показать форму')}</Text>
              </Press>
            ) : (
              <>
                <TextInput
                  style={[styles.emailInput, { marginTop: 8 }]}
                  placeholder={profile.login}
                  placeholderTextColor={palette.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={confirmLogin}
                  onChangeText={setConfirmLogin}
                />
                {profile.has_password && (
                  <TextInput
                    style={[styles.emailInput, { marginTop: 8 }]}
                    placeholder={t('Пароль')}
                    placeholderTextColor={palette.textSecondary}
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                )}
                <Press
                  style={[styles.dangerGo, confirmLogin.trim() !== profile.login && styles.dangerGoOff]}
                  disabled={removing || confirmLogin.trim() !== profile.login}
                  onPress={() => {
                    Alert.alert(
                      t('Точно удалить аккаунт?'),
                      t('Это навсегда.'),
                      [
                        { text: t('Отмена'), style: 'cancel' },
                        {
                          text: t('Удалить'),
                          style: 'destructive',
                          onPress: () => void removeAccount(),
                        },
                      ],
                    );
                  }}
                >
                  {removing ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.dangerGoText}>{t('Удалить навсегда')}</Text>
                  )}
                </Press>
                {removeSaid !== null && <Text style={[styles.rowHint, { color: palette.danger }]}>{removeSaid}</Text>}
              </>
            )}
          </View>
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
    sectionDanger: { color: palette.danger, fontSize: 16, fontWeight: '700', marginTop: 18 },
    dangerDoor: {
      alignItems: 'center',
      borderColor: palette.danger,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 11,
      marginTop: 10,
    },
    dangerDoorText: { color: palette.danger, fontSize: 14, fontWeight: '700' },
    dangerGo: {
      backgroundColor: palette.danger,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 10,
    },
    dangerGoOff: { opacity: 0.4 },
    dangerGoText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    emailSaveText: { color: '#fff', fontWeight: '700' },
  });
