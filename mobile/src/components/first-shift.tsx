import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { ShiftTemplate } from '@/lib/types';

type Period = 'hour' | 'day' | 'month';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'hour', label: 'за час' },
  { id: 'day', label: 'за смену' },
  { id: 'month', label: 'в месяц' },
];

/** The shapes this trade actually works, so most people never type a time. */
const SHAPES = [
  { name: 'Вечер', symbol: '🍸', start: '17:00', end: '01:00' },
  { name: 'День', symbol: '☕', start: '09:00', end: '17:00' },
  { name: 'Ночь', symbol: '🌙', start: '22:00', end: '07:00' },
  { name: 'Утро', symbol: '🥐', start: '07:00', end: '15:00' },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The first shift, and with it the first number.
 *
 * A new account opened on an empty grid under three zeros, and the way out was
 * a settings screen two taps away that nothing pointed at. This is the whole
 * of what the app needs before it can count: when you work and what it pays.
 * The place is asked for because it unlocks paydays, and left optional because
 * a field somebody cannot answer is a reason to close the app.
 */
export function FirstShift({
  open,
  palette,
  onDone,
  onClose,
}: {
  open: boolean;
  palette: Palette;
  /** Hands back the created template so the pencil can be loaded with it. */
  onDone: (template: ShiftTemplate) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = makeStyles(palette);

  const [venue, setVenue] = useState('');
  const [name, setName] = useState('Вечер');
  const [symbol, setSymbol] = useState('🍸');
  const [start, setStart] = useState('17:00');
  const [end, setEnd] = useState('01:00');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<Period>('hour');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (name.trim() === '') {
      setError('У смены должно быть название.');

      return;
    }

    if (!TIME.test(start) || !TIME.test(end)) {
      setError('Время пишется как 18:00.');

      return;
    }

    setBusy(true);
    setError(null);

    try {
      // Everything at its default except the answers. A place has two dozen
      // settings and not one of them is worth a question before the app has
      // shown somebody a number.
      let placeId: number | null = null;

      if (venue.trim() !== '') {
        const place = await api<{ id: number }>('/shifter/v1/locations', {
          body: {
            name: venue.trim(),
            address: null,
            colour: '#6366F1',
            pay_period: 'Monthly',
            pay_day: 10,
            pay_anchor: null,
            overtime_weekly_hours: 40,
            overtime_multiplier: 1.5,
            night_multiplier: 1,
            night_from: '22:00',
            night_to: '06:00',
            public_holiday_multiplier: 1,
            holiday_country: 'UA',
            tip_out_of_tips_percent: 0,
            tip_out_of_sales_percent: 0,
            meal_deduction: 0,
            tax_percent: 0,
            tax_tips: false,
            holiday_percent: 0,
            currency: '',
          },
        });

        placeId = place.id;
      }

      const template = await api<ShiftTemplate>('/shifter/v1/shifts', {
        body: {
          name: name.trim(),
          symbol: symbol.trim() === '' ? null : symbol.trim(),
          location_id: placeId,
          start_time: start,
          end_time: end,
          salary_period: period,
          salary_amount: Number(amount.replace(',', '.')) || 0,
          break_minutes: 0,
          colour: null,
          revenue_percent: null,
          tip_source: 'personal',
          tip_pool_percent: null,
        },
      });

      onDone(template);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не сохранилось.');
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grabber} />

          <View style={styles.head}>
            <Text style={styles.title}>Ваша смена</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={palette.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.body}>
            <View style={styles.shapes}>
              {SHAPES.map((shape) => (
                <Pressable
                  key={shape.name}
                  style={[styles.shape, name === shape.name && styles.shapeOn]}
                  onPress={() => {
                    setName(shape.name);
                    setSymbol(shape.symbol);
                    setStart(shape.start);
                    setEnd(shape.end);
                  }}
                >
                  <Text style={styles.shapeMark}>{shape.symbol}</Text>
                  <Text style={[styles.shapeName, name === shape.name && styles.shapeNameOn]}>
                    {shape.name}
                  </Text>
                  <Text style={styles.shapeTime}>
                    {shape.start}–{shape.end}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.label}>Название</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  maxLength={40}
                  placeholder="Вечер"
                  placeholderTextColor={palette.textSecondary}
                />
              </View>
              <View style={{ width: 76 }}>
                <Text style={styles.label}>Значок</Text>
                <TextInput
                  style={[styles.input, { textAlign: 'center' }]}
                  value={symbol}
                  onChangeText={setSymbol}
                  maxLength={4}
                  placeholder="🍸"
                  placeholderTextColor={palette.textSecondary}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.label}>Начало</Text>
                <TextInput
                  style={styles.input}
                  value={start}
                  onChangeText={setStart}
                  placeholder="17:00"
                  placeholderTextColor={palette.textSecondary}
                />
              </View>
              <View style={styles.grow}>
                <Text style={styles.label}>Конец</Text>
                <TextInput
                  style={styles.input}
                  value={end}
                  onChangeText={setEnd}
                  placeholder="01:00"
                  placeholderTextColor={palette.textSecondary}
                />
              </View>
            </View>

            <Text style={styles.label}>Сколько платят</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.grow]}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="220"
                placeholderTextColor={palette.textSecondary}
              />
              <View style={styles.periods}>
                {PERIODS.map((entry) => (
                  <Pressable
                    key={entry.id}
                    style={[styles.period, period === entry.id && styles.periodOn]}
                    onPress={() => setPeriod(entry.id)}
                  >
                    <Text
                      style={[styles.periodText, period === entry.id && styles.periodTextOn]}
                    >
                      {entry.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Text style={styles.label}>Где, если хотите считать выплаты</Text>
            <TextInput
              style={styles.input}
              value={venue}
              onChangeText={setVenue}
              maxLength={60}
              placeholder="Бар на углу"
              placeholderTextColor={palette.textSecondary}
            />

            {error !== null && <Text style={styles.error}>{error}</Text>}
          </View>

          <Pressable style={styles.done} disabled={busy} onPress={() => void save()}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="pencil" size={17} color="#fff" />
                <Text style={styles.doneText}>Создать и закрасить месяц</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
    sheet: {
      backgroundColor: palette.background,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 14,
      paddingTop: 8,
      gap: 10,
      maxHeight: '92%',
    },
    grabber: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.border,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { flex: 1, fontSize: 20, fontWeight: '800', color: palette.text, letterSpacing: -0.4 },
    body: { gap: 6, paddingBottom: 6 },

    shapes: { flexDirection: 'row', gap: 8 },
    shape: {
      flex: 1,
      alignItems: 'center',
      gap: 1,
      paddingVertical: 8,
      borderRadius: 15,
      borderWidth: 1.5,
      borderColor: palette.border,
      backgroundColor: palette.backgroundElement,
    },
    shapeOn: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
    shapeMark: { fontSize: 19 },
    shapeName: { color: palette.text, fontSize: 13, fontWeight: '700' },
    shapeNameOn: { color: palette.accent },
    shapeTime: { color: palette.textSecondary, fontSize: 10.5, fontVariant: ['tabular-nums'] },

    row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
    grow: { flex: 1 },
    label: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginTop: 4,
      marginBottom: 2,
    },
    input: {
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: palette.text,
      fontSize: 15.5,
    },
    periods: { flexDirection: 'row', gap: 5 },
    period: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: 10,
      paddingVertical: 11,
    },
    periodOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    periodText: { color: palette.textSecondary, fontSize: 12.5, fontWeight: '700' },
    periodTextOn: { color: '#fff' },

    error: { color: palette.danger, fontSize: 13.5, marginTop: 6 },
    done: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: palette.accent,
      borderRadius: 16,
      paddingVertical: 14,
    },
    doneText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
