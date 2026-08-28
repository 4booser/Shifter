import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Loading } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import { dayLabel, todayKey } from '@/lib/calendar';
import { money, plural } from '@/lib/types';

/**
 * The two things a shift needs from the shift before it: what the room took,
 * and what went wrong.
 *
 * Both belong on the phone rather than the site, because both are entered
 * while standing up — the tin is counted at the bar, and the note about the
 * grinder is written on the way out of the door.
 */
interface PoolShare {
  user_id: number;
  name: string;
  percent: number;
  amount: number;
  mine: boolean;
}

interface Pool {
  date: string;
  amount: number;
  entered_by: string | null;
  shares: PoolShare[];
  /** What the percentages do not add up to. Often the house's slice. */
  unallocated: number;
}

interface Handover {
  date: string;
  text: string;
  by: string | null;
  updated_at: string | null;
}

interface StopItem {
  id: number;
  kind: 'stop' | 'broken';
  name: string;
  raised_by: string;
  raised_on: string;
  days: number;
  cleared: boolean;
}

export default function CrewScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const team = Number(teamId);
  const date = todayKey();

  const [pool, setPool] = useState<Pool | null>(null);
  const [note, setNote] = useState<Handover | null>(null);
  const [stops, setStops] = useState<StopItem[]>([]);
  const [amount, setAmount] = useState('');
  const [text, setText] = useState('');
  const [adding, setAdding] = useState<'stop' | 'broken' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!Number.isFinite(team)) return;

    try {
      const [poolData, handover] = await Promise.all([
        api<Pool>(`/shifter/v1/teams/${team}/planner/pool?date=${date}`),
        api<{ note: Handover; stops: StopItem[] }>(
          `/shifter/v1/teams/${team}/planner/handover?date=${date}`,
        ),
      ]);

      setPool(poolData);
      setAmount(poolData.amount === 0 ? '' : `${poolData.amount}`);
      setNote(handover.note);
      setText(handover.note.text);
      setStops(handover.stops);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не дотянулись до сервера.');
    } finally {
      setLoading(false);
    }
  }, [team, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePool = async () => {
    try {
      setPool(
        await api<Pool>(`/shifter/v1/teams/${team}/planner/pool`, {
          method: 'POST',
          body: { date, amount: Number(amount.replace(',', '.')) || 0 },
        }),
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не сохранилось.');
    }
  };

  const saveNote = async () => {
    try {
      setNote(
        await api<Handover>(`/shifter/v1/teams/${team}/planner/handover`, {
          method: 'POST',
          body: { date, text },
        }),
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не сохранилось.');
    }
  };

  const raise = async () => {
    if (adding === null || name.trim() === '') return;

    try {
      setStops(
        await api<StopItem[]>(`/shifter/v1/teams/${team}/planner/handover/stops`, {
          method: 'POST',
          body: { kind: adding, name: name.trim() },
        }),
      );
      setName('');
      setAdding(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не сохранилось.');
    }
  };

  const clear = async (id: number) => {
    try {
      setStops(
        await api<StopItem[]>(`/shifter/v1/teams/${team}/planner/handover/stops/${id}`, {
          method: 'DELETE',
        }),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не сохранилось.');
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-down" size={22} color={palette.textSecondary} />
        </Pressable>
        <Text style={styles.title}>Смена · {dayLabel(date)}</Text>
      </View>

      {loading ? (
        <Loading colour={palette.backgroundElement} rows={3} height={86} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error !== null && <Text style={styles.error}>{error}</Text>}

          {/* ==== The tin, counted once ==== */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Общак</Text>
            <Text style={styles.cardHint}>
              Считает кто-то один. Доли — из ваших же смен.
            </Text>

            <View style={styles.poolRow}>
              <TextInput
                style={[styles.input, styles.grow]}
                keyboardType="numeric"
                placeholder="Сколько собрал зал"
                placeholderTextColor={palette.textSecondary}
                value={amount}
                onChangeText={setAmount}
              />
              <Pressable style={styles.primary} onPress={() => void savePool()}>
                <Text style={styles.primaryText}>Столько</Text>
              </Pressable>
            </View>

            {pool !== null && pool.entered_by !== null && (
              <Text style={styles.cardHint}>Посчитал {pool.entered_by}</Text>
            )}

            {(pool?.shares ?? []).map((share) => (
              <View
                key={share.user_id}
                style={[styles.shareRow, share.mine && styles.shareMine]}
              >
                <Text style={styles.shareName} numberOfLines={1}>
                  {share.name}
                  {share.mine ? ' · вы' : ''}
                </Text>
                <Text style={styles.sharePercent}>{share.percent}%</Text>
                <Text style={styles.shareAmount}>{money(share.amount)}</Text>
              </View>
            ))}

            {/* Not an error: a house often keeps a slice. But a slice that
                disappears into the arithmetic is not fine. */}
            {pool !== null && pool.unallocated !== 0 && (
              <Text style={styles.cardHint}>
                Не роздано {money(pool.unallocated)} — либо доля заведения, либо у кого-то не
                проставлен процент.
              </Text>
            )}
          </View>

          {/* ==== What the next shift needs to know ==== */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Передача</Text>
            <Text style={styles.cardHint}>
              {note?.by !== null && note?.by !== undefined
                ? `Последним писал ${note.by}`
                : 'За сегодня ещё ничего не оставили.'}
            </Text>

            <TextInput
              style={[styles.input, styles.note]}
              multiline
              maxLength={1000}
              placeholder="Кухня без буррата с восьми. Кофемолка шумит. В девять стол на двадцать."
              placeholderTextColor={palette.textSecondary}
              value={text}
              onChangeText={setText}
            />
            <Pressable style={styles.primary} onPress={() => void saveNote()}>
              <Text style={styles.primaryText}>Оставить следующей смене</Text>
            </Pressable>
          </View>

          {/* ==== The stop list, which does not reset at midnight ==== */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Стоп-лист и поломки</Text>

            <View style={styles.kindRow}>
              <Pressable
                style={[styles.chip, adding === 'stop' && styles.chipOn]}
                onPress={() => setAdding(adding === 'stop' ? null : 'stop')}
              >
                <Text style={[styles.chipText, adding === 'stop' && styles.chipTextOn]}>
                  Закончилось
                </Text>
              </Pressable>
              <Pressable
                style={[styles.chip, adding === 'broken' && styles.chipOn]}
                onPress={() => setAdding(adding === 'broken' ? null : 'broken')}
              >
                <Text style={[styles.chipText, adding === 'broken' && styles.chipTextOn]}>
                  Сломалось
                </Text>
              </Pressable>
            </View>

            {adding !== null && (
              <View style={styles.poolRow}>
                <TextInput
                  style={[styles.input, styles.grow]}
                  autoFocus
                  maxLength={80}
                  placeholder={adding === 'stop' ? 'Мартини' : 'Кофемолка'}
                  placeholderTextColor={palette.textSecondary}
                  value={name}
                  onChangeText={setName}
                  onSubmitEditing={() => void raise()}
                />
                <Pressable style={styles.primary} onPress={() => void raise()}>
                  <Text style={styles.primaryText}>Внести</Text>
                </Pressable>
              </View>
            )}

            {stops.length === 0 ? (
              <Text style={styles.cardHint}>Ничего не не хватает. Пусть так и будет.</Text>
            ) : (
              stops.map((item) => (
                <View key={item.id} style={styles.stopRow}>
                  <Text
                    style={[styles.stopKind, item.kind === 'broken' && styles.stopBroken]}
                  >
                    {item.kind === 'broken' ? 'сломано' : 'нет'}
                  </Text>
                  <Text style={styles.stopName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {/* Three weeks broken is a different conversation from this
                      morning, and only the number says which. */}
                  <Text style={styles.stopMeta}>
                    {item.days > 0 ? plural(item.days, 'день', 'дня', 'дней') : 'сегодня'}
                  </Text>
                  <Pressable onPress={() => void clear(item.id)} hitSlop={10}>
                    <Ionicons name="checkmark" size={18} color={palette.good} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    title: { color: palette.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
    content: { padding: 14, gap: 12, paddingBottom: 44 },
    error: { color: palette.danger, fontSize: 14 },
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 14,
      gap: 8,
    },
    cardTitle: { color: palette.text, fontSize: 16, fontWeight: '800' },
    cardHint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 17 },
    input: {
      backgroundColor: palette.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: palette.text,
      fontSize: 16,
    },
    note: { minHeight: 96, textAlignVertical: 'top' },
    grow: { flex: 1 },
    poolRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    primary: {
      backgroundColor: palette.accent,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      alignItems: 'center',
    },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    shareRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 10,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    shareMine: { backgroundColor: palette.accentSoft },
    shareName: { flex: 1, color: palette.text, fontSize: 15, fontWeight: '600' },
    sharePercent: { color: palette.textSecondary, fontSize: 12 },
    shareAmount: { color: palette.text, fontSize: 15, fontWeight: '800' },
    kindRow: { flexDirection: 'row', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
    },
    chipOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    chipText: { color: palette.textSecondary, fontSize: 13, fontWeight: '600' },
    chipTextOn: { color: '#fff' },
    stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    stopKind: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    stopBroken: { color: palette.danger },
    stopName: { flex: 1, color: palette.text, fontSize: 15, fontWeight: '600' },
    stopMeta: { color: palette.textSecondary, fontSize: 12 },
  });
