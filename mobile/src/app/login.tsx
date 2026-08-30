import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

export default function LoginScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const signIn = useSession((state) => state.signIn);
  const completeTwoFactor = useSession((state) => state.completeTwoFactor);
  const register = useSession((state) => state.register);

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

  // Simulator convenience only: EXPO_PUBLIC_AUTOLOGIN="login:password"
  // signs straight in, because AppleScript cannot tap a simulator without
  // accessibility grants. Dev builds read env at bundle time; stores never
  // see this path taken.
  useEffect(() => {
    const auto = process.env.EXPO_PUBLIC_AUTOLOGIN;

    if (!__DEV__ || auto === undefined || auto === '' || autoTried.current) return;

    autoTried.current = true;
    const [autoLogin, autoPassword] = auto.split(':');

    void signIn(autoLogin, autoPassword).catch(() => setError(t('Автологин не прошёл.')));
  }, [signIn]);

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
      // The wave-54 lock answers 429 with its own words; show them rather
      // than a generic shrug. An expired ticket lands here too and its
      // message says to sign in again.
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
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                disabled={busy || email.trim() === ''}
                onPress={() => void submitForgot()}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('Прислать письмо')}</Text>}
              </Pressable>
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

            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              disabled={busy || code.trim().length < 6}
              onPress={() => void submitCode()}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('Подтвердить')}</Text>}
            </Pressable>

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

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            disabled={busy || login.trim() === '' || password === ''}
            onPress={() => void submit()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{mode === 'in' ? t('Войти') : t('Создать аккаунт')}</Text>
            )}
          </Pressable>

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
    pressed: { opacity: 0.85 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    switch: { color: palette.accent, textAlign: 'center', paddingVertical: 6, fontWeight: '600' },
  });
