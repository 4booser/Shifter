import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet, Text, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { t } from '@/lib/i18n';
import { LockKind, bankLock, lockKind, lockNameBy, unlock } from '@/lib/lock';

/** Long enough to answer a call or copy a code, short enough to matter. */
const GRACE_MS = 30_000;

/**
 * The bank tab, behind its own lock.
 *
 * The calendar holds how much somebody earns. This holds where they were, what
 * they bought and how much they have left — a different order of thing, and
 * one worth locking even by somebody who leaves the rest of the app open. A
 * phone is handed over to show a photograph, not a statement.
 *
 * It shuts on the way out rather than on the way back, because the screenshot
 * the system takes for the app switcher is taken as the app leaves.
 */
export function BankLock({
  palette,
  children,
}: {
  palette: Palette;
  children: React.ReactNode;
}) {
  const styles = makeStyles(palette);

  const [armed, setArmed] = useState(false);
  const [shut, setShut] = useState(false);
  const [asking, setAsking] = useState(false);
  const [kind, setKind] = useState<LockKind>(null);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    void (async () => {
      const on = await bankLock.enabled();

      setArmed(on);
      setShut(on);
      setKind(await lockKind());
    })();
  }, []);

  const ask = useCallback(async () => {
    if (asking) return;

    setAsking(true);

    try {
      if (await unlock(t('Откройте банк'))) setShut(false);
    } finally {
      setAsking(false);
    }
  }, [asking]);

  useEffect(() => {
    if (!armed) return;

    const listener = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        const away = leftAt.current === null ? Infinity : Date.now() - leftAt.current;

        if (away > GRACE_MS) setShut(true);

        leftAt.current = null;

        return;
      }

      // Shut now, while the switcher's snapshot is still being taken.
      leftAt.current = Date.now();
      setShut(true);
    });

    return () => listener.remove();
  }, [armed]);

  if (!armed || !shut) return <>{children}</>;

  return (
    <View style={styles.cover}>
      <Ionicons name="lock-closed" size={34} color={palette.textSecondary} />
      <Text style={styles.title}>{t('Банк под замком')}</Text>
      <Text style={styles.note}>
        {t('Выписка — это где вы были и что покупали.')}
      </Text>

      <Press style={styles.button} disabled={asking} onPress={() => void ask()}>
        <Text style={styles.buttonText}>
          {asking ? t('Ждём…') : `${t('Открыть по')} ${lockNameBy(kind)}`}
        </Text>
      </Press>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    cover: {
      flex: 1,
      backgroundColor: palette.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: 32,
    },
    title: { color: palette.text, fontSize: 20, fontWeight: '800' },
    note: {
      color: palette.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    button: {
      marginTop: 8,
      backgroundColor: palette.accent,
      borderRadius: 999,
      paddingVertical: 14,
      paddingHorizontal: 28,
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
