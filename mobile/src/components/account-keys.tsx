import { useState } from 'react';
import { ActivityIndicator, Linking, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';

/**
 * The account's keys — password and the second factor — on the phone.
 *
 * The settings screen's own rule is that editors live on the site so the two
 * clients cannot disagree; keys are not an editor. Changing a password and
 * turning 2FA on are safety moves, and safety that requires finding a laptop
 * is safety postponed.
 */
export function AccountKeys({
  palette,
  hasPassword,
  twoFactor,
  onChanged,
}: {
  palette: Palette;
  hasPassword: boolean;
  twoFactor: boolean;
  onChanged: () => void;
}) {
  const styles = makeStyles(palette);

  return (
    <>
      <Text style={styles.section}>{t('Ключи от аккаунта')}</Text>
      <PasswordCard palette={palette} hasPassword={hasPassword} />
      <TwoFactorCard palette={palette} on={twoFactor} onChanged={onChanged} />
    </>
  );
}

function PasswordCard({ palette, hasPassword }: { palette: Palette; hasPassword: boolean }) {
  const styles = makeStyles(palette);
  const [current, setCurrent] = useState('');
  const [fresh, setFresh] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const ready =
    fresh.length >= 8 && fresh === again && (hasPassword ? current.length > 0 : true);

  const submit = async () => {
    setBusy(true);
    setSaid(null);

    try {
      await api('/shifter/v1/account/password', {
        method: 'PUT',
        body: { current_password: hasPassword ? current : null, new_password: fresh },
      });

      setCurrent('');
      setFresh('');
      setAgain('');
      // The server revokes every other session on purpose; saying so here
      // saves a person from thinking something broke on their second device.
      setSaid({ ok: true, text: t('Пароль сменён. Остальные устройства вышли из аккаунта.') });
    } catch (caught) {
      setSaid({
        ok: false,
        text: caught instanceof ApiError ? caught.message : t('Сеть молчит. Сервер доступен?'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {hasPassword ? t('Смена пароля') : t('Задать пароль')}
      </Text>
      {!hasPassword && (
        <Text style={styles.hint}>{t('Вы входите через Google. Пароль даст вход и без него.')}</Text>
      )}

      {hasPassword && (
        <TextInput
          style={styles.input}
          placeholder={t('Текущий пароль')}
          placeholderTextColor={palette.textSecondary}
          secureTextEntry
          value={current}
          onChangeText={setCurrent}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder={t('Новый пароль')}
        placeholderTextColor={palette.textSecondary}
        secureTextEntry
        value={fresh}
        onChangeText={setFresh}
      />
      <TextInput
        style={styles.input}
        placeholder={t('Новый пароль ещё раз')}
        placeholderTextColor={palette.textSecondary}
        secureTextEntry
        value={again}
        onChangeText={setAgain}
      />

      {said !== null && (
        <Text style={[styles.note, { color: said.ok ? palette.good : palette.danger }]}>
          {said.text}
        </Text>
      )}

      <Press
        style={[styles.button, !ready && styles.buttonOff]}
        disabled={busy || !ready}
        onPress={() => void submit()}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{t('Сменить пароль')}</Text>
        )}
      </Press>
    </View>
  );
}

function TwoFactorCard({
  palette,
  on,
  onChanged,
}: {
  palette: Palette;
  on: boolean;
  onChanged: () => void;
}) {
  const styles = makeStyles(palette);
  const [stage, setStage] = useState<'idle' | 'setup' | 'backup'>('idle');
  const [secret, setSecret] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [code, setCode] = useState('');
  const [backups, setBackups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setSaid(null);

    try {
      await work();
    } catch (caught) {
      setSaid(caught instanceof ApiError ? caught.message : t('Сеть молчит. Сервер доступен?'));
    } finally {
      setBusy(false);
    }
  };

  const begin = () =>
    run(async () => {
      const response = await api<{ secret: string; otpauth_url: string }>(
        '/shifter/v1/auth/2fa/setup',
        { method: 'POST', body: {} },
      );

      setSecret(response.secret);
      setOtpauth(response.otpauth_url);
      setStage('setup');
    });

  const enable = () =>
    run(async () => {
      const response = await api<{ backup_codes: string[] }>('/shifter/v1/auth/2fa/enable', {
        method: 'POST',
        body: { code: code.trim() },
      });

      setBackups(response.backup_codes);
      setCode('');
      setStage('backup');
    });

  const disable = () =>
    run(async () => {
      await api('/shifter/v1/auth/2fa/disable', { method: 'POST', body: { code: code.trim() } });
      setCode('');
      onChanged();
    });

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('Двухфакторный вход')}</Text>

      {on && (
        <>
          <Text style={styles.hint}>
            {t('Включён: после пароля спрашивается код из приложения.')}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t('Код из приложения')}
            placeholderTextColor={palette.textSecondary}
            keyboardType="number-pad"
            maxLength={8}
            value={code}
            onChangeText={setCode}
          />
          {said !== null && <Text style={[styles.note, { color: palette.danger }]}>{said}</Text>}
          <Press
            style={[styles.button, styles.buttonDanger, code.trim().length < 6 && styles.buttonOff]}
            disabled={busy || code.trim().length < 6}
            onPress={() => void disable()}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('Выключить')}</Text>}
          </Press>
        </>
      )}

      {!on && stage === 'idle' && (
        <>
          <Text style={styles.hint}>
            {t('Пароль плюс код из приложения-аутентификатора. Украденного пароля перестаёт хватать.')}
          </Text>
          {said !== null && <Text style={[styles.note, { color: palette.danger }]}>{said}</Text>}
          <Press style={styles.button} disabled={busy} onPress={() => void begin()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('Включить')}</Text>}
          </Press>
        </>
      )}

      {!on && stage === 'setup' && (
        <>
          <Text style={styles.hint}>
            {t('Добавьте ключ в приложение-аутентификатор и введите код из него.')}
          </Text>
          <Press onPress={() => void Linking.openURL(otpauth)}>
            <Text style={styles.link}>{t('Открыть в аутентификаторе')}</Text>
          </Press>
          <Text style={styles.secret} selectable>
            {secret}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t('Код из приложения')}
            placeholderTextColor={palette.textSecondary}
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
          {said !== null && <Text style={[styles.note, { color: palette.danger }]}>{said}</Text>}
          <Press
            style={[styles.button, code.trim().length !== 6 && styles.buttonOff]}
            disabled={busy || code.trim().length !== 6}
            onPress={() => void enable()}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('Подтвердить')}</Text>}
          </Press>
        </>
      )}

      {!on && stage === 'backup' && (
        <>
          <Text style={styles.hint}>
            {t('Восемь резервных кодов — каждый открывает дверь один раз, если телефон с аутентификатором потерян. Сохраните их сейчас: больше они не показываются.')}
          </Text>
          <Text style={styles.secret} selectable>
            {backups.join('\n')}
          </Text>
          <Press
            style={styles.button}
            onPress={() => void Share.share({ message: backups.join('\n') })}
          >
            <Text style={styles.buttonText}>{t('Сохранить коды')}</Text>
          </Press>
          <Press
            style={[styles.button, styles.buttonGhost]}
            onPress={() => {
              setStage('idle');
              setSecret('');
              setBackups([]);
              onChanged();
            }}
          >
            <Text style={[styles.buttonText, { color: palette.text }]}>{t('Сохранил, готово')}</Text>
          </Press>
        </>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    section: {
      color: palette.textSecondary,
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 22,
      marginBottom: 8,
    },
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 14,
      marginBottom: 10,
    },
    cardTitle: { color: palette.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
    hint: { color: palette.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 10 },
    input: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: palette.text,
      marginBottom: 8,
      backgroundColor: palette.background,
    },
    note: { fontSize: 13, marginBottom: 8 },
    link: { color: palette.accent, fontWeight: '600', marginBottom: 8 },
    secret: {
      color: palette.text,
      fontFamily: 'Menlo',
      fontSize: 13,
      lineHeight: 20,
      marginBottom: 10,
    },
    button: {
      backgroundColor: palette.accent,
      borderRadius: 12,
      alignItems: 'center',
      paddingVertical: 11,
    },
    buttonDanger: { backgroundColor: palette.danger },
    buttonGhost: { backgroundColor: 'transparent', marginTop: 6 },
    // Not opacity: Press's own animated style sets opacity at rest and
    // would win the merge. A colour reads as "not yet" just as well.
    buttonOff: { backgroundColor: palette.border },
    buttonText: { color: '#fff', fontWeight: '700' },
  });
