import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appear, Loading, Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import {
  numberOf,
  PAY_PERIODS,
  PayPeriod,
  payLine,
  toPlacePayload,
  WorkPlace,
} from '@/lib/places';
import { tint } from '@/lib/types';

const COLOURS = ['#6366F1', '#14B8A6', '#A855F7', '#FF5C7A', '#FFA53D', '#22C55E', '#38BDF8', '#64748B'];

/**
 * Places of work, on the phone.
 *
 * Settings sent people to the website for this, which is a strange thing for
 * an app whose whole job is money: the place is what decides how the money is
 * counted. When the wage lands, what an hour past forty is worth, what the
 * night pays, what the till takes back for a meal — all of it lived behind a
 * browser somebody was never going to open.
 *
 * The fields the phone does not show are carried through untouched. A place is
 * saved whole, like a day, and sending a shorter object would quietly reset
 * the holiday calendar and the commission cycle to their defaults.
 */
export default function PlacesScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = makeStyles(palette);

  const [places, setPlaces] = useState<WorkPlace[] | null>(null);
  const [editing, setEditing] = useState<WorkPlace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<WorkPlace[]>('/shifter/v1/locations')
      .then((rows) => { setPlaces(rows); setEditing(rows[0] ?? null); }) // TEMP
      .catch(() => setError('Не дотянулись до сервера.'));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (editing !== null) {
    return (
      <PlaceForm
        place={editing}
        palette={palette}
        onDone={() => {
          setEditing(null);
          void load();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const live = (places ?? []).filter((place) => !place.archived);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Места работы</Text>
        <Press hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={palette.textSecondary} />
        </Press>
      </View>

      <Text style={styles.lede}>
        Место решает, как считаются деньги: когда приходит зарплата, что стоит час сверх нормы,
        сколько забирает налог.
      </Text>

      {error !== null && <Text style={styles.error}>{error}</Text>}
      {places === null && error === null && (
        <Loading colour={palette.backgroundElement} rows={2} height={78} />
      )}

      {live.map((place, index) => (
        <Appear key={place.id} index={index}>
          <Press style={styles.card} onPress={() => setEditing(place)}>
            <View style={[styles.dot, { backgroundColor: tint(place.colour, 1) ?? palette.accent }]} />
            <View style={styles.cardText}>
              <Text style={styles.cardName} numberOfLines={1}>{place.name}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {payLine(place)}
                {place.tax_percent > 0 ? ` · налог ${place.tax_percent}%` : ''}
                {place.night_multiplier > 1 ? ` · ночь ×${place.night_multiplier}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.textSecondary} />
          </Press>
        </Appear>
      ))}

      {places !== null && live.length === 0 && (
        <Text style={styles.empty}>
          Мест пока нет. Заведите первое — тогда приложение сможет считать выплаты и сверхурочные.
        </Text>
      )}

      <Press style={styles.add} onPress={() => setEditing(blankPlace())}>
        <Ionicons name="add" size={18} color={palette.accent} />
        <Text style={styles.addText}>Добавить место</Text>
      </Press>
    </ScrollView>
  );
}

const blankPlace = (): WorkPlace => ({
  id: 0,
  name: '',
  address: null,
  colour: COLOURS[0],
  pay_period: 'monthly',
  pay_day: 10,
  pay_anchor: '',
  current_period_from: '',
  current_period_to: '',
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
  archived: false,
  sales_pay_period: '',
  sales_pay_day: 1,
  sales_pay_anchor: '',
  latitude: null,
  longitude: null,
  auto_break_after_hours: 0,
  auto_break_minutes: 0,
  minimum_hourly: 0,
  commute_minutes: 0,
  commute_cost: 0,
});

function PlaceForm({
  place,
  palette,
  onDone,
  onCancel,
}: {
  place: WorkPlace;
  palette: Palette;
  onDone: () => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = makeStyles(palette);

  const [form, setForm] = useState(place);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof WorkPlace>(key: K, value: WorkPlace[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (form.name.trim() === '') {
      setError('У места должно быть название.');

      return;
    }

    setBusy(true);
    setError(null);

    try {
      const body = { ...toPlacePayload(form), name: form.name.trim() };

      if (form.id === 0) await api('/shifter/v1/locations', { method: 'POST', body });
      else await api(`/shifter/v1/locations/${form.id}`, { method: 'PUT', body });

      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не сохранилось.');
      setBusy(false);
    }
  };

  const archive = async () => {
    setBusy(true);

    try {
      await api(`/shifter/v1/locations/${form.id}/archived?value=true`, { method: 'POST', body: {} });
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не получилось.');
      setBusy(false);
    }
  };

  const period = PAY_PERIODS.find((entry) => entry.value === form.pay_period);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{form.id === 0 ? 'Новое место' : form.name || 'Место'}</Text>
          <Press hitSlop={10} onPress={onCancel}>
            <Ionicons name="close" size={24} color={palette.textSecondary} />
          </Press>
        </View>

        {error !== null && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.label}>Название</Text>
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={(value) => set('name', value)}
          maxLength={60}
          placeholder="Бар на углу"
          placeholderTextColor={palette.textSecondary}
        />

        <Text style={styles.label}>Цвет</Text>
        <View style={styles.swatches}>
          {COLOURS.map((colour) => (
            <Press
              key={colour}
              haptic={false}
              style={[
                styles.swatch,
                { backgroundColor: colour },
                form.colour.toUpperCase() === colour && styles.swatchOn,
              ]}
              onPress={() => set('colour', colour)}
            >
              {form.colour.toUpperCase() === colour ? (
                <Ionicons name="checkmark" size={15} color="#fff" />
              ) : null}
            </Press>
          ))}
        </View>

        <Text style={styles.section}>Когда платят</Text>
        <View style={styles.chips}>
          {PAY_PERIODS.map((entry) => (
            <Press
              key={entry.value}
              style={[styles.chip, form.pay_period === entry.value && styles.chipOn]}
              onPress={() => set('pay_period', entry.value as PayPeriod)}
            >
              <Text style={[styles.chipText, form.pay_period === entry.value && styles.chipTextOn]}>
                {entry.label}
              </Text>
            </Press>
          ))}
        </View>

        {(form.pay_period === 'monthly' || form.pay_period === 'semimonthly') && (
          <>
            <Text style={styles.label}>{period?.day ?? 'Число'}</Text>
            <TextInput
              style={styles.input}
              value={`${form.pay_day}`}
              onChangeText={(value) => set('pay_day', Math.min(28, Math.max(1, Math.round(numberOf(value, 1)))))}
              keyboardType="numeric"
              maxLength={2}
            />
            <Text style={styles.hint}>
              {form.pay_period === 'semimonthly'
                ? `Второй раз — через полмесяца, ${form.pay_day + 15}-го.`
                : 'До 28-го: 29-е, 30-е и 31-е есть не в каждом месяце.'}
            </Text>
          </>
        )}

        <Text style={styles.section}>Сверхурочные</Text>
        <View style={styles.pair}>
          <Field
            styles={styles}
            palette={palette}
            label="Часов в неделю"
            value={`${form.overtime_weekly_hours}`}
            onChange={(value) => set('overtime_weekly_hours', numberOf(value, 40))}
          />
          <Field
            styles={styles}
            palette={palette}
            label="Множитель"
            value={`${form.overtime_multiplier}`}
            onChange={(value) => set('overtime_multiplier', numberOf(value, 1.5))}
          />
        </View>
        <Text style={styles.hint}>Час сверх нормы стоит ставку × множитель. 1 — доплаты нет.</Text>

        <Text style={styles.section}>Ночные</Text>
        <View style={styles.trio}>
          <Field
            styles={styles}
            palette={palette}
            label="Множитель"
            value={`${form.night_multiplier}`}
            onChange={(value) => set('night_multiplier', numberOf(value, 1))}
          />
          <Field
            styles={styles}
            palette={palette}
            label="С"
            value={form.night_from.slice(0, 5)}
            onChange={(value) => set('night_from', value)}
            numeric={false}
          />
          <Field
            styles={styles}
            palette={palette}
            label="До"
            value={form.night_to.slice(0, 5)}
            onChange={(value) => set('night_to', value)}
            numeric={false}
          />
        </View>

        <Text style={styles.section}>Что забирают</Text>
        <View style={styles.pair}>
          <Field
            styles={styles}
            palette={palette}
            label="Налог, %"
            value={`${form.tax_percent}`}
            onChange={(value) => set('tax_percent', numberOf(value))}
          />
          <Field
            styles={styles}
            palette={palette}
            label="Обед за смену"
            value={`${form.meal_deduction}`}
            onChange={(value) => set('meal_deduction', numberOf(value))}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Налог и с чаевых</Text>
          <Switch
            value={form.tax_tips}
            onValueChange={(value) => set('tax_tips', value)}
            trackColor={{ true: palette.accent, false: palette.border }}
          />
        </View>

        <View style={styles.pair}>
          <Field
            styles={styles}
            palette={palette}
            label="Отдаём с чая, %"
            value={`${form.tip_out_of_tips_percent}`}
            onChange={(value) => set('tip_out_of_tips_percent', numberOf(value))}
          />
          <Field
            styles={styles}
            palette={palette}
            label="Отдаём с выручки, %"
            value={`${form.tip_out_of_sales_percent}`}
            onChange={(value) => set('tip_out_of_sales_percent', numberOf(value))}
          />
        </View>

        <Text style={styles.section}>Дорога и минимум</Text>
        <View style={styles.trio}>
          <Field
            styles={styles}
            palette={palette}
            label="Мин. в пути"
            value={`${form.commute_minutes}`}
            onChange={(value) => set('commute_minutes', Math.round(numberOf(value)))}
          />
          <Field
            styles={styles}
            palette={palette}
            label="Проезд"
            value={`${form.commute_cost}`}
            onChange={(value) => set('commute_cost', numberOf(value))}
          />
          <Field
            styles={styles}
            palette={palette}
            label="Ставка не ниже"
            value={`${form.minimum_hourly}`}
            onChange={(value) => set('minimum_hourly', numberOf(value))}
          />
        </View>
        <Text style={styles.hint}>
          Дорога считается в одну сторону. «Ставка не ниже» — приложение отметит смену, которая
          вышла дешевле; 0 выключает проверку.
        </Text>

        <Press style={styles.save} disabled={busy} onPress={() => void save()}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>
              {form.id === 0 ? 'Создать место' : 'Сохранить'}
            </Text>
          )}
        </Press>

        {form.id !== 0 && (
          <Press style={styles.archive} haptic={false} disabled={busy} onPress={() => void archive()}>
            <Text style={styles.archiveText}>Убрать место из списка</Text>
          </Press>
        )}

        {form.id !== 0 && (
          <Text style={styles.hint}>
            Смены и деньги, записанные здесь, останутся на месте — место просто перестанет
            предлагаться для новых.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  styles,
  palette,
  label,
  value,
  onChange,
  numeric = true,
}: {
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'numeric' : 'default'}
        placeholderTextColor={palette.textSecondary}
      />
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 14, paddingBottom: 48, gap: 8 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { flex: 1, fontSize: 24, fontWeight: '800', color: palette.text, letterSpacing: -0.5 },
    lede: { color: palette.textSecondary, fontSize: 13.5, lineHeight: 19, marginBottom: 4 },
    error: { color: palette.danger },
    empty: { color: palette.textSecondary, fontSize: 13.5, lineHeight: 19, paddingVertical: 8 },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    dot: { width: 12, height: 12, borderRadius: 6 },
    cardText: { flex: 1, gap: 2 },
    cardName: { color: palette.text, fontSize: 16, fontWeight: '700' },
    cardMeta: { color: palette.textSecondary, fontSize: 12.5 },

    add: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: palette.border,
      borderRadius: 18,
      paddingVertical: 15,
      marginTop: 4,
    },
    addText: { color: palette.accent, fontWeight: '700', fontSize: 15 },

    section: {
      color: palette.text,
      fontSize: 15.5,
      fontWeight: '800',
      marginTop: 16,
      letterSpacing: -0.2,
    },
    label: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginTop: 8,
      marginBottom: 3,
    },
    hint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 17, marginTop: 4 },
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
    field: { flex: 1 },
    pair: { flexDirection: 'row', gap: 8 },
    trio: { flexDirection: 'row', gap: 8 },

    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    swatch: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    swatchOn: { borderColor: palette.text },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    chip: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.backgroundElement,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    chipOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    chipText: { color: palette.text, fontSize: 13.5, fontWeight: '700' },
    chipTextOn: { color: '#fff' },

    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 10,
    },
    switchLabel: { color: palette.text, fontSize: 15, fontWeight: '600' },

    save: {
      backgroundColor: palette.accent,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 22,
    },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 15.5 },
    archive: { alignItems: 'center', paddingVertical: 12 },
    archiveText: { color: palette.danger, fontWeight: '600', fontSize: 14 },
  });
