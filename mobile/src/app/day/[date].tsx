import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { CalendarDayData, DaysResponse, money, ShiftTemplate, toSavePayload } from '@/lib/types';

/**
 * One day, editable: which templates are on it, whether they were worked,
 * the tips and the fines. The same PUT the web sends — one server, one
 * truth, whichever pocket the edit came from.
 */
export default function DayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  const [day, setDay] = useState<CalendarDayData | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [tips, setTips] = useState('');
  const [deductions, setDeductions] = useState('');
  const [tipPool, setTipPool] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api<DaysResponse>(`/shifter/v1/days?from=${date}&to=${date}`),
      api<ShiftTemplate[]>('/shifter/v1/shifts'),
    ])
      .then(([summary, shifts]) => {
        const loaded = summary.days[0];

        setDay(loaded);
        setTemplates(shifts.filter((template) => !template.archived));
        setTips(loaded.tips === null ? '' : `${loaded.tips}`);
        setDeductions(loaded.deductions === 0 ? '' : `${loaded.deductions}`);
        setTipPool(loaded.tip_pool === null ? '' : `${loaded.tip_pool}`);
        setNote(loaded.note ?? '');
      })
      .catch(() => setError('День не загрузился.'));
  }, [date]);

  const styles = makeStyles(palette);
  const title = useMemo(() => {
    const raw = new Date(`${date}T00:00:00`).toLocaleDateString('ru', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    return raw[0].toUpperCase() + raw.slice(1);
  }, [date]);

  const onDay = new Set((day?.shifts ?? []).map((entry) => entry.shift_id));

  const toggleTemplate = (template: ShiftTemplate) => {
    if (day === null) return;

    if (onDay.has(template.id)) {
      setDay({ ...day, shifts: day.shifts.filter((entry) => entry.shift_id !== template.id) });

      return;
    }

    setDay({
      ...day,
      shifts: [
        ...day.shifts,
        {
          shift_id: template.id,
          name: template.name,
          symbol: template.symbol,
          colour: template.colour,
          start_time: template.start_time,
          end_time: template.end_time,
          worked: date <= new Date().toISOString().slice(0, 10),
          needs_cover: false,
          actual_start: null,
          actual_end: null,
          break_minutes: null,
          earned: 0,
          revenue: null,
          revenue_percent: template.revenue_percent,
        },
      ],
    });
  };

  /**
   * The share of the pool this day is owed, or null when nothing on it is
   * pooled. Several pooled shifts on one day each take their own slice.
   */
  const pooledShares = (day?.shifts ?? [])
    .map((entry) => templates.find((template) => template.id === entry.shift_id))
    .filter((template) => template?.tip_source === 'pool')
    .map((template) => template?.tip_pool_percent ?? 0)
    .filter((share) => share > 0);
  const pooled = pooledShares.length === 0 ? null : pooledShares.reduce((a, b) => a + b, 0);

  const setRevenue = (shiftId: number, value: string) => {
    if (day === null) return;

    setDay({
      ...day,
      shifts: day.shifts.map((entry) =>
        entry.shift_id === shiftId
          // Empty is "not counted", which is not the same answer as zero.
          ? { ...entry, revenue: value.trim() === '' ? null : Number(value) || 0 }
          : entry,
      ),
    });
  };

  const setWorked = (shiftId: number, worked: boolean) => {
    if (day === null) return;

    setDay({
      ...day,
      shifts: day.shifts.map((entry) =>
        entry.shift_id === shiftId ? { ...entry, worked } : entry,
      ),
    });
  };

  const save = async () => {
    if (day === null) return;

    setBusy(true);
    setError(null);

    try {
      const payload = toSavePayload(day);

      payload.tips = tips.trim() === '' ? null : Number(tips) || 0;
      payload.tip_pool = tipPool.trim() === '' ? null : Number(tipPool) || 0;
      payload.deductions = deductions.trim() === '' ? null : Number(deductions) || 0;
      payload.note = note.trim() === '' ? null : note.trim();

      await api(`/shifter/v1/days/${date}`, { method: 'PUT', body: payload });
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не сохранилось.');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={24} color={palette.textSecondary} />
          </Pressable>
        </View>

        {error !== null && <Text style={styles.error}>{error}</Text>}
        {day === null && error === null && <ActivityIndicator color={palette.accent} />}

        {day !== null && (
          <>
            <Text style={styles.section}>Смены</Text>
            {templates.length === 0 && (
              <Text style={styles.hintText}>Шаблонов пока нет — заведите смену на сайте, и она появится здесь.</Text>
            )}
            <View style={styles.templateWrap}>
              {templates.map((template) => (
                <Pressable
                  key={template.id}
                  style={[styles.template, onDay.has(template.id) && styles.templateOn]}
                  onPress={() => toggleTemplate(template)}
                >
                  <Text style={styles.templateEmoji}>{template.symbol ?? '🕐'}</Text>
                  <View>
                    <Text style={[styles.templateName, onDay.has(template.id) && styles.templateNameOn]}>
                      {template.name}
                    </Text>
                    <Text style={styles.templateTime}>
                      {template.start_time.slice(0, 5)}–{template.end_time.slice(0, 5)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>

            {day.shifts.length > 0 && (
              <View style={styles.card}>
                {day.shifts.map((entry) => (
                  <View key={entry.shift_id} style={styles.workedBlock}>
                    <View style={styles.workedRow}>
                      <Text style={styles.workedLabel}>
                        {entry.symbol ?? '🕐'} {entry.name} · {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)}
                        {entry.earned > 0 ? ` · ${money(entry.earned)}` : ''}
                      </Text>
                      <View style={styles.workedSwitch}>
                        <Text style={styles.workedHint}>{entry.worked ? 'отработана' : 'план'}</Text>
                        <Switch
                          value={entry.worked}
                          onValueChange={(value) => setWorked(entry.shift_id, value)}
                          trackColor={{ true: palette.accent, false: palette.border }}
                        />
                      </View>
                    </View>

                    {entry.revenue_percent !== null && (
                      <>
                        <Text style={styles.fieldLabel}>
                          Выручка за смену · {entry.revenue_percent}%
                        </Text>
                        <TextInput
                          style={styles.input}
                          keyboardType="numeric"
                          placeholder="не считаем"
                          placeholderTextColor={palette.textSecondary}
                          value={entry.revenue === null ? '' : `${entry.revenue}`}
                          onChangeText={(value) => setRevenue(entry.shift_id, value)}
                        />
                      </>
                    )}
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.section}>Деньги дня</Text>
            <View style={styles.moneyRow}>
              <View style={styles.moneyField}>
                <Text style={styles.fieldLabel}>{pooled === null ? 'Чаевые' : 'Общак за день'}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={palette.textSecondary}
                  value={pooled === null ? tips : tipPool}
                  onChangeText={pooled === null ? setTips : setTipPool}
                />
                {pooled !== null && (
                  <Text style={styles.hintText}>
                    Ваша доля · {pooled}% = {money(((Number(tipPool) || 0) * pooled) / 100)}
                  </Text>
                )}
              </View>
              <View style={styles.moneyField}>
                <Text style={styles.fieldLabel}>Штрафы и недостачи</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={palette.textSecondary}
                  value={deductions}
                  onChangeText={setDeductions}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Заметка</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              multiline
              maxLength={500}
              placeholder="Что запомнить об этом дне"
              placeholderTextColor={palette.textSecondary}
              value={note}
              onChangeText={setNote}
            />

            <Pressable
              style={({ pressed }) => [styles.saveButton, pressed && { opacity: 0.85 }]}
              disabled={busy}
              onPress={() => void save()}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Сохранить день</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 18, gap: 10 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 21, fontWeight: '800', color: palette.text },
    error: { color: palette.danger },
    section: { fontSize: 15, fontWeight: '800', color: palette.text, marginTop: 6 },
    hintText: { color: palette.textSecondary },
    templateWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    template: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.backgroundElement,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    templateOn: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
    templateEmoji: { fontSize: 18 },
    templateName: { color: palette.text, fontWeight: '700', fontSize: 14 },
    templateNameOn: { color: palette.accent },
    templateTime: { color: palette.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
    card: {
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 16,
      padding: 12,
      gap: 10,
    },
    workedBlock: { gap: 6 },
    workedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    workedLabel: { color: palette.text, flexShrink: 1, fontSize: 13.5 },
    workedSwitch: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    workedHint: { color: palette.textSecondary, fontSize: 12 },
    moneyRow: { flexDirection: 'row', gap: 8 },
    moneyField: { flex: 1, gap: 4 },
    fieldLabel: { color: palette.textSecondary, fontSize: 12.5, fontWeight: '600' },
    input: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.backgroundElement,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: palette.text,
      fontSize: 16,
    },
    noteInput: { minHeight: 70, textAlignVertical: 'top' },
    saveButton: {
      backgroundColor: palette.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  });
