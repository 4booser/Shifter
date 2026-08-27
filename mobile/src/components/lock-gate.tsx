import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { lockKind, LockKind, lockNameBy, lockStore, unlock } from '@/lib/lock';

/** Long enough to answer a call or copy a code, short enough to matter. */
const GRACE_MS = 30_000;

/**
 * The lock, drawn over everything. It closes on the way to the background
 * rather than on the way back, because the screenshot the system takes for
 * the app switcher is taken as the app leaves — cover it late and the
 * switcher still shows a month of earnings to whoever is holding the phone.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);

  const [armed, setArmed] = useState(false);
  const [shut, setShut] = useState(false);
  const [asking, setAsking] = useState(false);
  const [kind, setKind] = useState<LockKind>(null);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    void (async () => {
      const on = await lockStore.enabled();

      setArmed(on);
      setShut(on);
      setKind(await lockKind());
    })();
  }, []);

  const ask = useCallback(async () => {
    if (asking) return;

    setAsking(true);

    try {
      if (await unlock()) setShut(false);
    } finally {
      setAsking(false);
    }
  }, [asking]);

  // Asking the moment the gate appears saves a tap on the commonest path:
  // open the app, look at Face ID, carry on.
  useEffect(() => {
    if (shut && armed) void ask();
    // Re-asking on every `ask` identity change would loop the prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shut, armed]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (!armed) return;

      if (state !== 'active') {
        leftAt.current = Date.now();
        setShut(true);

        return;
      }

      // A glance at a notification should not cost a face scan.
      if (leftAt.current !== null && Date.now() - leftAt.current < GRACE_MS) setShut(false);
    });

    return () => subscription.remove();
  }, [armed]);

  // The gate also has to notice the setting being switched on from settings.
  useEffect(() => {
    const timer = setInterval(() => {
      void lockStore.enabled().then(setArmed);
    }, 4_000);

    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.host}>
      {children}

      {armed && shut && (
        <View style={styles.veil}>
          <Ionicons
            name={kind === 'finger' ? 'finger-print' : 'lock-closed'}
            size={54}
            color={palette.accent}
          />
          <Text style={styles.title}>Shifter закрыт</Text>
          <Text style={styles.lead}>
            Ваши смены и деньги видите только вы. Откройте по {lockNameBy(kind)}.
          </Text>
          <Pressable style={styles.button} onPress={() => void ask()} disabled={asking}>
            <Text style={styles.buttonText}>{asking ? 'Ждём…' : 'Открыть'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const makeStyles = (palette: (typeof Colors)['light']) =>
  StyleSheet.create({
    host: { flex: 1 },
    veil: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: palette.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 32,
    },
    title: { color: palette.text, fontSize: 24, fontWeight: '800' },
    lead: { color: palette.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
    button: {
      backgroundColor: palette.accent,
      borderRadius: 999,
      paddingHorizontal: 34,
      paddingVertical: 14,
      marginTop: 10,
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
