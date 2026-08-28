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
import { ApiError } from '@/lib/api';
import { useSession } from '@/store/session';
import { t } from '@/lib/i18n';

export default function LoginScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const signIn = useSession((state) => state.signIn);
  const register = useSession((state) => state.register);

  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

        if (result === 'two-factor') setError(t('Двухфакторный вход появится в M1 — пока зайдите без него.'));
      } else {
        await register(login.trim(), password, firstName.trim() || t('Я'), lastName.trim() || t('Смена'));
      }
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
