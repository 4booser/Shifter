import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { MonoStatementItem, dayOf, fromMinor } from '@/lib/mono';
import { CategoryRule, categorise } from '@/lib/mono-rules';
import { categoryStyle } from '@/lib/spend-viz';
import { t } from '@/lib/i18n';
import { money } from '@/lib/types';

/**
 * The statement itself, in the pocket — the rows every figure above is made
 * of. Day headers carry the day's signed total; the dot carries the
 * category's colour; search answers as you type. Forty rows, then «ещё».
 */
export function BankStatement({
  items,
  rules,
  from,
  to,
  palette,
}: {
  items: MonoStatementItem[];
  rules: CategoryRule[];
  from: string;
  to: string;
  palette: Palette;
}) {
  const styles = makeStyles(palette);

  const [needle, setNeedle] = useState('');
  const [side, setSide] = useState<'all' | 'out' | 'in'>('all');
  const [shown, setShown] = useState(40);

  const rows = useMemo(() => {
    const query = needle.trim().toLocaleLowerCase();

    return items
      .filter((item) => {
        const day = dayOf(item);

        if (day < from || day > to) return false;
        if (item.hold) return false;
        if (side === 'out' && item.amount >= 0) return false;
        if (side === 'in' && item.amount <= 0) return false;
        if (query !== '' && !item.description.toLocaleLowerCase().includes(query)) return false;

        return true;
      })
      .sort((one, two) => two.time - one.time);
  }, [items, from, to, needle, side]);

  const groups = useMemo(() => {
    const byDay = new Map<string, { items: MonoStatementItem[]; total: number }>();

    for (const item of rows.slice(0, shown)) {
      const day = dayOf(item);
      const group = byDay.get(day) ?? { items: [], total: 0 };

      group.items.push(item);
      group.total += fromMinor(item.amount);
      byDay.set(day, group);
    }

    return [...byDay.entries()];
  }, [rows, shown]);

  if (items.length === 0) return null;

  const said = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'short' });

  const timeOf = (item: MonoStatementItem) =>
    new Date(item.time * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('Сами операции')}</Text>

      <View style={styles.filters}>
        {(
          [
            ['all', t('всё')],
            ['out', t('траты')],
            ['in', t('поступления')],
          ] as const
        ).map(([id, label]) => (
          <Press
            key={id}
            style={[styles.filter, side === id && styles.filterOn]}
            onPress={() => setSide(id)}
          >
            <Text style={[styles.filterText, side === id && styles.filterTextOn]}>{label}</Text>
          </Press>
        ))}
      </View>

      <TextInput
        style={styles.search}
        value={needle}
        onChangeText={(value) => {
          setNeedle(value);
          setShown(40);
        }}
        placeholder={t('Найти по названию…')}
        placeholderTextColor={palette.textSecondary}
      />

      {groups.length === 0 && <Text style={styles.hint}>{t('Ничего не совпало.')}</Text>}

      {groups.map(([day, group]) => (
        <View key={day} style={styles.group}>
          <View style={styles.groupHead}>
            <Text style={styles.groupDay}>{said(day)}</Text>
            <Text style={[styles.groupTotal, group.total >= 0 && { color: palette.good }]}>
              {group.total > 0 ? '+' : ''}{money(group.total)}
            </Text>
          </View>
          {group.items.map((item) => {
            const category = categorise(item, rules);

            return (
              <View key={item.id} style={styles.row}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: item.amount > 0 ? palette.good : categoryStyle(category).hue },
                  ]}
                />
                <Text style={styles.rowName} numberOfLines={1}>{item.description}</Text>
                <Text style={styles.rowTime}>{timeOf(item)}</Text>
                {item.cashbackAmount > 0 && (
                  <Text style={styles.rowBack}>+{(item.cashbackAmount / 100).toFixed(2)}</Text>
                )}
                <Text style={[styles.rowAmount, item.amount > 0 && { color: palette.good }]}>
                  {item.amount > 0 ? '+' : ''}{money(fromMinor(item.amount))}
                </Text>
              </View>
            );
          })}
        </View>
      ))}

      {rows.length > shown && (
        <Press style={styles.more} onPress={() => setShown(shown + 60)}>
          <Text style={styles.moreText}>{t('Показать ещё')} ({rows.length - shown})</Text>
        </Press>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: palette.backgroundElement, borderRadius: 16, padding: 14, gap: 8 },
    cardTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    hint: { color: palette.textSecondary, fontSize: 12 },
    filters: { flexDirection: 'row', gap: 6 },
    filter: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: palette.background },
    filterOn: { backgroundColor: palette.accent },
    filterText: { color: palette.textSecondary, fontSize: 12.5 },
    filterTextOn: { color: '#fff', fontWeight: '700' },
    search: {
      color: palette.text,
      backgroundColor: palette.background,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13.5,
    },
    group: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 6, gap: 3 },
    groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    groupDay: { color: palette.textSecondary, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase' },
    groupTotal: { color: palette.textSecondary, fontSize: 11.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    rowName: { color: palette.text, fontSize: 13.5, flex: 1 },
    rowTime: { color: palette.textSecondary, fontSize: 11, fontVariant: ['tabular-nums'] },
    rowBack: { color: palette.good, fontSize: 11, fontVariant: ['tabular-nums'] },
    rowAmount: { color: palette.text, fontSize: 13.5, fontWeight: '600', width: 86, textAlign: 'right', fontVariant: ['tabular-nums'] },
    more: { alignItems: 'center', paddingVertical: 8 },
    moreText: { color: palette.accent, fontSize: 13, fontWeight: '600' },
  });
