import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { Press } from '@/components/motion';
import { buzz } from '@/lib/haptics';
import { Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { money } from '@/lib/types';

/**
 * The month's goal, finally on the phone — the site had the meter for a
 * season while the pocket could only look at it. View, set, move, clear;
 * the amount is the server's row, so both screens always name one figure.
 */
interface Goal {
  id: number;
  period: string;
  amount: number;
}

export function GoalCard({
  palette,
  earned,
  visible,
}: {
  palette: Palette;
  earned: number;
  /** Only the month span gets the meter, like the site. */
  visible: boolean;
}) {
  const styles = makeStyles(palette);
  const [goal, setGoal] = useState<Goal | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Goal[]>('/shifter/v1/goals')
      .then((rows) => setGoal(rows.find((row) => row.period === 'month') ?? null))
      .catch(() => setGoal(null));
  }, []);

  if (!visible || goal === undefined) return null;

  const save = async () => {
    const amount = Number(draft.replace(',', '.'));

    if (!Number.isFinite(amount) || amount <= 0) return;

    setBusy(true);

    try {
      const saved = await api<Goal>('/shifter/v1/goals', {
        method: 'PUT',
        body: { period: 'month', amount, anchor: null, note: null },
      });

      setGoal(saved);
      setEditing(false);
      buzz.won();
    } catch {
      buzz.lost();
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (goal === null) return;

    setBusy(true);

    try {
      await api<void>(`/shifter/v1/goals/${goal.id}`, { method: 'DELETE' });
      setGoal(null);
      setEditing(false);
      buzz.commit();
    } catch {
      buzz.lost();
    } finally {
      setBusy(false);
    }
  };

  const share = goal === null || goal.amount <= 0 ? 0 : Math.min(1, earned / goal.amount);
  const left = goal === null ? 0 : Math.max(0, goal.amount - earned);

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.cardTitle}>{t('Цель месяца')}</Text>
        {goal !== null && !editing && (
          <Press hitSlop={8} onPress={() => { setDraft(String(goal.amount)); setEditing(true); }}>
            <Text style={styles.editLink}>{t('Изменить')}</Text>
          </Press>
        )}
      </View>

      {goal === null && !editing && (
        <Press style={styles.invite} onPress={() => { setDraft(''); setEditing(true); }}>
          <Text style={styles.inviteText}>
            {t('Задайте сумму — и месяц будет заполнять эту шкалу.')}
          </Text>
        </Press>
      )}

      {editing && (
        <View style={styles.editRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            keyboardType="decimal-pad"
            placeholder="60000"
            placeholderTextColor={palette.textSecondary}
            autoFocus
          />
          <Press style={styles.save} disabled={busy} onPress={() => void save()}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>{t('Сохранить')}</Text>}
          </Press>
          {goal !== null && (
            <Press hitSlop={8} disabled={busy} onPress={() => void clear()}>
              <Text style={styles.clearLink}>{t('Убрать')}</Text>
            </Press>
          )}
        </View>
      )}

      {goal !== null && !editing && (
        <>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: share >= 1 ? palette.good : palette.accent }]} />
          </View>
          <Text style={styles.meta}>
            {money(earned)} {t('из')} {money(goal.amount)}
            {left > 0
              ? ` · ${t('осталось')} ${money(left)}`
              : ` — ${t('взята, дальше всё сверху')}`}
          </Text>
        </>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      gap: 10,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { color: palette.text, fontSize: 16, fontWeight: '700' },
    editLink: { color: palette.accent, fontSize: 13, fontWeight: '700' },
    invite: { paddingVertical: 4 },
    inviteText: { color: palette.textSecondary, fontSize: 13, lineHeight: 18 },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      color: palette.text,
      backgroundColor: palette.background,
    },
    save: {
      backgroundColor: palette.accent,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: 'center',
    },
    saveText: { color: '#fff', fontWeight: '700' },
    clearLink: { color: palette.danger, fontSize: 13, fontWeight: '700' },
    track: { height: 10, borderRadius: 999, backgroundColor: palette.border, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 999 },
    meta: { color: palette.textSecondary, fontSize: 12.5 },
  });
