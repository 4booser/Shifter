import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { todayKey } from '@/lib/calendar';
import {
  DOCUMENT_KINDS,
  DocumentKind,
  EXPENSE_KINDS,
  Expense,
  ExpenseKind,
  money,
  plural,
  WorkDocument,
} from '@/lib/types';

/**
 * What the work costs, and the papers that gate a shift.
 *
 * Both belong on the phone. An expense is recorded in the moment the money
 * leaves — a taxi at four in the morning is not a thing anybody opens a laptop
 * for — and a medical book is remembered while standing in the clinic queue,
 * not while sitting at a desk.
 */
export default function CostsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [documents, setDocuments] = useState<WorkDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<ExpenseKind>('transport');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const [docKind, setDocKind] = useState<DocumentKind>('medical');
  const [docName, setDocName] = useState('');
  const [docUntil, setDocUntil] = useState('');
  const [addingDoc, setAddingDoc] = useState(false);

  // The month so far. Long enough to see a pattern, short enough that the
  // list is still a list rather than an archive.
  const from = `${todayKey().slice(0, 8)}01`;
  const to = todayKey();

  const load = useCallback(async () => {
    try {
      const [spent, papers] = await Promise.all([
        api<Expense[]>(`/shifter/v1/expenses?from=${from}&to=${to}`),
        api<WorkDocument[]>('/shifter/v1/documents'),
      ]);

      setExpenses(spent);
      setDocuments(papers);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не дотянулись до сервера.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const addExpense = async () => {
    const value = Number(amount.replace(',', '.')) || 0;

    if (value <= 0) return;

    try {
      await api<Expense>('/shifter/v1/expenses', {
        method: 'POST',
        body: {
          date: todayKey(),
          amount: value,
          kind,
          note: note.trim() === '' ? null : note.trim(),
          location_id: null,
        },
      });
      setAmount('');
      setNote('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не сохранилось.');
    }
  };

  const removeExpense = async (id: number) => {
    try {
      await api(`/shifter/v1/expenses/${id}`, { method: 'DELETE' });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалилось.');
    }
  };

  const addDocument = async () => {
    if (docName.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(docUntil)) return;

    try {
      await api<WorkDocument>('/shifter/v1/documents', {
        method: 'POST',
        body: { kind: docKind, name: docName.trim(), expires_on: docUntil, note: null },
      });
      setDocName('');
      setDocUntil('');
      setAddingDoc(false);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не сохранилось.');
    }
  };

  const total = expenses.reduce((sum, row) => sum + row.amount, 0);
  const pressing = documents.filter((row) => row.state !== 'fine');

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-down" size={22} color={palette.textSecondary} />
        </Pressable>
        <Text style={styles.title}>Что стоит работа</Text>
      </View>

      {loading ? (
        <Loading colour={palette.backgroundElement} rows={3} height={86} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error !== null && <Text style={styles.error}>{error}</Text>}

          {/* ==== Papers first: an expired one costs a shift tomorrow ==== */}
          {pressing.length > 0 && (
            <View style={[styles.card, styles.alarm]}>
              {pressing.map((paper) => (
                <Text key={paper.id} style={styles.alarmText}>
                  {paper.name} —{' '}
                  {paper.days_left < 0
                    ? 'закончился'
                    : `осталось ${plural(paper.days_left, 'день', 'дня', 'дней')}`}
                </Text>
              ))}
            </View>
          )}

          {/* ==== What the work cost ==== */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Траты за месяц</Text>
            <Text style={styles.cardHint}>
              Из заработка не вычитается — это деньги, которые ушли уже потом.
            </Text>

            <View style={styles.chipRow}>
              {EXPENSE_KINDS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.chip, kind === option.value && styles.chipOn]}
                  onPress={() => setKind(option.value)}
                >
                  <Text style={[styles.chipText, kind === option.value && styles.chipTextOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.grow]}
                keyboardType="numeric"
                placeholder="Сколько"
                placeholderTextColor={palette.textSecondary}
                value={amount}
                onChangeText={setAmount}
              />
              <TextInput
                style={[styles.input, styles.grow]}
                maxLength={200}
                placeholder="Заметка"
                placeholderTextColor={palette.textSecondary}
                value={note}
                onChangeText={setNote}
              />
              <Pressable style={styles.primary} onPress={() => void addExpense()}>
                <Text style={styles.primaryText}>+</Text>
              </Pressable>
            </View>

            {expenses.length === 0 ? (
              <Text style={styles.cardHint}>За этот месяц ничего не записано.</Text>
            ) : (
              <>
                <Text style={styles.total}>−{money(total)}</Text>
                {expenses.map((row) => (
                  <View key={row.id} style={styles.itemRow}>
                    <Text style={styles.itemDate}>{row.date.slice(8)}</Text>
                    <Text style={styles.itemKind}>
                      {EXPENSE_KINDS.find((k) => k.value === row.kind)?.label ?? 'Другое'}
                    </Text>
                    <Text style={styles.itemNote} numberOfLines={1}>
                      {row.note ?? ''}
                    </Text>
                    <Text style={styles.itemAmount}>{money(row.amount)}</Text>
                    <Pressable onPress={() => void removeExpense(row.id)} hitSlop={10}>
                      <Ionicons name="close" size={16} color={palette.textSecondary} />
                    </Pressable>
                  </View>
                ))}
              </>
            )}
          </View>

          {/* ==== The papers that gate a shift ==== */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Документы</Text>
              <Pressable onPress={() => setAddingDoc((was) => !was)} hitSlop={10}>
                <Text style={styles.link}>{addingDoc ? 'Отмена' : 'Добавить'}</Text>
              </Pressable>
            </View>
            <Text style={styles.cardHint}>
              Храним только дату. Фотография медкнижки должна лежать в кармане, а не на сервере.
            </Text>

            {addingDoc && (
              <>
                <View style={styles.chipRow}>
                  {DOCUMENT_KINDS.map((option) => (
                    <Pressable
                      key={option.value}
                      style={[styles.chip, docKind === option.value && styles.chipOn]}
                      onPress={() => {
                        setDocKind(option.value);
                        if (docName.trim() === '') setDocName(option.label);
                      }}
                    >
                      <Text
                        style={[styles.chipText, docKind === option.value && styles.chipTextOn]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.grow]}
                    maxLength={80}
                    placeholder="Как называется"
                    placeholderTextColor={palette.textSecondary}
                    value={docName}
                    onChangeText={setDocName}
                  />
                  <TextInput
                    style={[styles.input, styles.grow]}
                    placeholder="ГГГГ-ММ-ДД"
                    placeholderTextColor={palette.textSecondary}
                    value={docUntil}
                    onChangeText={setDocUntil}
                  />
                  <Pressable style={styles.primary} onPress={() => void addDocument()}>
                    <Text style={styles.primaryText}>+</Text>
                  </Pressable>
                </View>
              </>
            )}

            {documents.length === 0 ? (
              <Text style={styles.cardHint}>Пока ничего не записано.</Text>
            ) : (
              documents.map((paper) => (
                <View key={paper.id} style={styles.itemRow}>
                  <Text style={styles.itemNote} numberOfLines={1}>
                    {paper.name}
                  </Text>
                  <Text style={styles.itemDate}>{paper.expires_on}</Text>
                  <Text
                    style={[
                      styles.itemKind,
                      paper.state === 'expired' && styles.bad,
                      paper.state === 'urgent' && styles.bad,
                    ]}
                  >
                    {paper.days_left < 0
                      ? 'просрочен'
                      : plural(paper.days_left, 'день', 'дня', 'дней')}
                  </Text>
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
    alarm: { borderColor: palette.danger },
    alarmText: { color: palette.danger, fontSize: 14, fontWeight: '600' },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { color: palette.text, fontSize: 16, fontWeight: '800' },
    cardHint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 17 },
    link: { color: palette.accent, fontSize: 14, fontWeight: '700' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
    },
    chipOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    chipText: { color: palette.textSecondary, fontSize: 13, fontWeight: '600' },
    chipTextOn: { color: '#fff' },
    row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    grow: { flex: 1 },
    input: {
      backgroundColor: palette.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: palette.text,
      fontSize: 15,
    },
    primary: {
      backgroundColor: palette.accent,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    total: { color: palette.danger, fontSize: 22, fontWeight: '800' },
    itemRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 5 },
    itemDate: { color: palette.textSecondary, fontSize: 12, minWidth: 22 },
    itemKind: { color: palette.textSecondary, fontSize: 12 },
    bad: { color: palette.danger, fontWeight: '700' },
    itemNote: { flex: 1, color: palette.text, fontSize: 14 },
    itemAmount: { color: palette.text, fontSize: 14, fontWeight: '700' },
  });
