import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/store/session';
import { t } from '@/lib/i18n';

// Closes the auth popup on web once Google sends the browser back; a no-op on the phones.
WebBrowser.maybeCompleteAuthSession();

/** The server names the client id for this platform, or nothing — and then there is no button. */
interface GoogleConfig {
  client_id: string | null;
  ios_client_id: string | null;
  android_client_id: string | null;
}

/** Its own component: the provider hook throws without a platform client id, so it mounts only once the config has named one. */
function GoogleButton({
  clientId,
  busy,
  styles,
  onBusy,
  onCredential,
  onError,
}: {
  clientId: string;
  busy: boolean;
  styles: ReturnType<typeof makeStyles>;
  onBusy: (busy: boolean) => void;
  onCredential: (credential: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  // Only the platform's own id is handed over; the web id has no business on a phone.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    Platform.OS === 'ios' ? { iosClientId: clientId } : { androidClientId: clientId },
  );

  useEffect(() => {
    if (response === null) return;

    if (response.type !== 'success') {
      // A closed sheet is not an error; anything else Google says is.
      if (response.type === 'error') onError(response.error?.message ?? t('Google не отдал токен. Попробуйте ещё раз.'));
      onBusy(false);

      return;
    }

    const credential = response.params.id_token;

    if (credential === undefined || credential === '') {
      onError(t('Google не отдал токен. Попробуйте ещё раз.'));
      onBusy(false);

      return;
    }

    void onCredential(credential);
    // The callbacks are recreated every render; the response is the one thing that changes.
  }, [response]);

  return (
    <Press
      style={[styles.quietButton, (busy || request === null) && styles.buttonOff]}
      disabled={busy || request === null}
      onPress={() => {
        onBusy(true);
        void promptAsync().catch(() => onBusy(false));
      }}
    >
      <Text style={styles.quietButtonText}>{t('Войти с аккаунтом Google')}</Text>
    </Press>
  );
}

export default function LoginScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const signIn = useSession((state) => state.signIn);
  const completeTwoFactor = useSession((state) => state.completeTwoFactor);
  const register = useSession((state) => state.register);
  const googleSignIn = useSession((state) => state.googleSignIn);

  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ticket means the password already held; only the code is missing.
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');
  // The back door: an email in, a letter out, no telling whether the
  // address was known — that silence is the server's own contract.
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [letterSent, setLetterSent] = useState(false);
  const autoTried = useRef(false);
  // The platform's Google client id, once the server has named one; null until then and when there is none.
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  // Simulator convenience only: EXPO_PUBLIC_AUTOLOGIN="login:password" signs straight in, because AppleScript…
  useEffect(() => {
    const auto = process.env.EXPO_PUBLIC_AUTOLOGIN;

    if (!__DEV__ || auto === undefined || auto === '' || autoTried.current) return;

    autoTried.current = true;
    const [autoLogin, autoPassword] = auto.split(':');

    void signIn(autoLogin, autoPassword).catch(() => setError(t('Автологин не прошёл.')));
  }, [signIn]);

  useEffect(() => {
    let cancelled = false;

    api<GoogleConfig>('/shifter/v1/auth/google/config')
      .then((config) => {
        if (cancelled) return;

        const id = (Platform.OS === 'ios' ? config.ios_client_id : Platform.OS === 'android' ? config.android_client_id : null)?.trim();

        setGoogleClientId(id !== undefined && id !== '' ? id : null);
      })
      // No config is just no button; the password form does not depend on it.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const withGoogle = async (credential: string) => {
    setError(null);

    try {
      await googleSignIn(credential);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('Сеть молчит. Сервер доступен?'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      if (mode === 'in') {
        const result = await signIn(login.trim(), password);

        if (result !== 'ok') setTicket(result.ticket);
      } else {
        await register(login.trim(), password, firstName.trim() || t('Я'), lastName.trim() || t('Смена'));
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('Сеть молчит. Сервер доступен?'));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (ticket === null || code.trim() === '') return;

    setBusy(true);
    setError(null);

    try {
      await completeTwoFactor(ticket, code);
    } catch (caught) {
      // The wave-54 lock answers 429 with its own words; show them rather than a generic shrug.
      setError(caught instanceof ApiError ? caught.message : t('Сеть молчит. Сервер доступен?'));
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async () => {
    if (email.trim() === '') return;

    setBusy(true);
    setError(null);

    try {
      await api('/shifter/v1/auth/password/forgot', { body: { email: email.trim() } });
      setLetterSent(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('Сеть молчит. Сервер доступен?'));
    } finally {
      setBusy(false);
    }
  };

  const styles = makeStyles(palette);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Text style={styles.logoLetter}>S</Text>
          </View>
          <Text style={styles.brand}>Shifter</Text>
        </View>
        {forgot ? (
          <>
            <Text style={styles.lede}>
              {letterSent
                ? t('Если адрес известен, письмо уже идёт. Ссылка из него откроет сайт и даст задать новый пароль.')
                : t('Куда прислать ссылку для нового пароля?')}
            </Text>
            {!letterSent && (
              <TextInput
                style={styles.input}
                placeholder={t('Почта')}
                placeholderTextColor={palette.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={() => void submitForgot()}
              />
            )}

            {error !== null && <Text style={styles.error}>{error}</Text>}

            {!letterSent && (
              <Press
                style={styles.button}
                disabled={busy || email.trim() === ''}
                onPress={() => void submitForgot()}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('Прислать письмо')}</Text>}
              </Press>
            )}

            <Press
              onPress={() => {
                setForgot(false);
                setLetterSent(false);
                setEmail('');
                setError(null);
              }}
            >
              <Text style={styles.switch}>{t('Назад ко входу')}</Text>
            </Press>
          </>
        ) : ticket !== null ? (
          <>
            <Text style={styles.lede}>
              {t('Пароль верен. Введите код из приложения-аутентификатора — или один из восьми резервных.')}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t('Код из приложения')}
              placeholderTextColor={palette.textSecondary}
              keyboardType="number-pad"
              autoFocus
              maxLength={8}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => void submitCode()}
            />

            {error !== null && <Text style={styles.error}>{error}</Text>}

            <Press
              style={styles.button}
              disabled={busy || code.trim().length < 6}
              onPress={() => void submitCode()}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('Подтвердить')}</Text>}
            </Press>

            <Press
              onPress={() => {
                setTicket(null);
                setCode('');
                setError(null);
              }}
            >
              <Text style={styles.switch}>{t('Назад ко входу')}</Text>
            </Press>
          </>
        ) : (
          <>
          <Text style={styles.lede}>
            {mode === 'in' ? t('Смены, деньги и команда — в кармане.') : t('Минута — и календарь начнёт считать за вас.')}
          </Text>

          {mode === 'up' && (
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, styles.nameInput]}
                placeholder={t("Имя")}
                placeholderTextColor={palette.textSecondary}
                value={firstName}
                onChangeText={setFirstName}
              />
              <TextInput
                style={[styles.input, styles.nameInput]}
                placeholder={t("Фамилия")}
                placeholderTextColor={palette.textSecondary}
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
          )}
          <TextInput
            style={styles.input}
            placeholder={t("Логин")}
            placeholderTextColor={palette.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            value={login}
            onChangeText={setLogin}
          />
          <TextInput
            style={styles.input}
            placeholder={t("Пароль")}
            placeholderTextColor={palette.textSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
          />

          {error !== null && <Text style={styles.error}>{error}</Text>}

          {/* `Press`, not a raw `Pressable`. */}
          <Press
            style={[
              styles.button,
              (busy || login.trim() === '' || password === '') && styles.buttonOff,
            ]}
            disabled={busy || login.trim() === '' || password === ''}
            onPress={() => void submit()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{mode === 'in' ? t('Войти') : t('Создать аккаунт')}</Text>
            )}
          </Press>

          {mode === 'in' && googleClientId !== null && (
            <GoogleButton
              clientId={googleClientId}
              busy={busy}
              styles={styles}
              onBusy={setBusy}
              onCredential={withGoogle}
              onError={setError}
            />
          )}

          <Press onPress={() => setMode(mode === 'in' ? 'up' : 'in')}>
            <Text style={styles.switch}>
              {mode === 'in' ? t('Впервые тут? Создать аккаунт') : t('Уже есть аккаунт? Войти')}
            </Text>
          </Press>
            {mode === 'in' && (
              <Press onPress={() => setForgot(true)}>
                <Text style={styles.switch}>{t('Забыли пароль?')}</Text>
              </Press>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background, justifyContent: 'center', padding: 20 },
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 24,
      gap: 12,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    nameRow: { flexDirection: 'row', gap: 8 },
    nameInput: { flex: 1 },
    logo: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { color: '#fff', fontSize: 20, fontWeight: '800' },
    brand: { fontSize: 24, fontWeight: '800', color: palette.text, letterSpacing: -0.5 },
    lede: { color: palette.textSecondary, fontSize: 15, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: palette.text,
      backgroundColor: palette.background,
    },
    error: { color: palette.danger, fontSize: 13.5 },
    button: {
      backgroundColor: palette.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    buttonOff: { opacity: 0.45 },
    pressed: { opacity: 0.85 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    quietButton: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
      backgroundColor: palette.background,
    },
    quietButtonText: { color: palette.text, fontSize: 16, fontWeight: '600' },
    switch: { color: palette.accent, textAlign: 'center', paddingVertical: 6, fontWeight: '600' },
  });
