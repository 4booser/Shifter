import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import { rateLine, ShiftTemplate } from '@/lib/types';

interface Place {
  id: number;
  name: string;
  colour: string;
  archived: boolean;
}

type Period = 'hour' | 'day' | 'month';

const PERIOD_LABEL: Record<Period, string> = {
  hour: 'за час',
  day: 'за смену',
  month: 'в месяц',
};

/**
 * The shift palette, editable from the phone. Until now the app could place
 * templates and never make one, so a person who only ever opens the app had
 * to go and find a laptop before they could record their first shift.
 */
export default function TemplatesScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const [templates, setTemplates] = useState<ShiftTemplate[] | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [editing, setEditing] = useState<ShiftTemplate | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [shifts, locations] = await Promise.all([
        api<ShiftTemplate[]>('/shifter/v1/shifts'),
        api<Place[]>('/shifter/v1/locations'),
      ]);

      setTemplates(shifts);
      setPlaces(locations.filter((place) => !place.archived));
      setError(null);
    } catch (caught) {
      setTemplates([]);
      setError(caught instanceof ApiError ? caught.message : 'Не дотянулись до сервера.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const archive = async (template: ShiftTemplate, value: boolean) => {
    try {
      await api(`/shifter/v1/shifts/${template.id}/archived?value=${value}`, {
        method: 'POST',
        body: {},
      });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не получилось.');
    }
  };

  const live = (templates ?? []).filter((template) => !template.archived);
  const archived = (templates ?? []).filter((template) => template.archived);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.head}>
          <Text style={styles.title}>Смены</Text>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <Ionicons name="close" size={26} color={palette.textSecondary} />
          </Pressable>
        </View>

        <Text style={styles.lead}>
          Шаблон — это одна ваша смена целиком: часы, ставка, перерыв. Поставили на день — он
          посчитался сам.
        </Text>

        {templates === null && <ActivityIndicator color={palette.accent} />}
        {error !== null && <Text style={styles.error}>{error}</Text>}

        {live.map((template) => (
          <Pressable key={template.id} style={styles.card} onPress={() => setEditing(template)}>
            <Text style={styles.cardEmoji}>{template.symbol ?? '🕐'}</Text>
            <View style={styles.grow}>
              <Text style={styles.cardName}>{template.name}</Text>
              <Text style={styles.cardMeta}>
                {template.start_time.slice(0, 5)}–{template.end_time.slice(0, 5)} ·{' '}
                {rateLine(template)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.textSecondary} />
          </Pressable>
        ))}

        <Pressable style={styles.addRow} onPress={() => setEditing('new')}>
          <Ionicons name="add-circle-outline" size={20} color={palette.accent} />
          <Text style={styles.addText}>Новая смена</Text>
        </Pressable>

        {archived.length > 0 && (
          <>
            <Text style={styles.section}>В архиве</Text>
            {archived.map((template) => (
              <View key={template.id} style={[styles.card, styles.cardDim]}>
                <Text style={styles.cardEmoji}>{template.symbol ?? '🕐'}</Text>
                <View style={styles.grow}>
                  <Text style={styles.cardName}>{template.name}</Text>
                  <Text style={styles.cardMeta}>
                    {template.start_time.slice(0, 5)}–{template.end_time.slice(0, 5)}
                  </Text>
                </View>
                <Pressable hitSlop={8} onPress={() => void archive(template, false)}>
                  <Text style={styles.restore}>Вернуть</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <TemplateEditor
        editing={editing}
        places={places}
        palette={palette}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
        onArchive={(template) => {
          setEditing(null);
          void archive(template, true);
        }}
      />
    </>
  );
}

/**
 * One template. The pay constructor lives here in full — a rate, a share of
 * the takings, or the two together — because a phone that can only express
 * half a deal will quietly price somebody's month wrong.
 */
function TemplateEditor({
  editing,
  places,
  palette,
  onClose,
  onSaved,
  onArchive,
}: {
  editing: ShiftTemplate | 'new' | null;
  places: Place[];
  palette: Palette;
  onClose: () => void;
  onSaved: () => void;
  onArchive: (template: ShiftTemplate) => void;
}) {
  const styles = makeStyles(palette);
  const template = editing === 'new' || editing === null ? null : editing;

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('02:00');
  const [period, setPeriod] = useState<Period>('hour');
  const [amount, setAmount] = useState('');
  const [percent, setPercent] = useState('');
  const [pooled, setPooled] = useState(false);
  const [poolShare, setPoolShare] = useState('');
  const [breakMinutes, setBreakMinutes] = useState('');
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (editing === null) return;

    setFailed(null);
    setName(template?.name ?? '');
    setSymbol(template?.symbol ?? '');
    setStart(template?.start_time.slice(0, 5) ?? '18:00');
    setEnd(template?.end_time.slice(0, 5) ?? '02:00');
    setPeriod(
      template?.salary_period === 'day' || template?.salary_period === 'month'
        ? template.salary_period
        : 'hour',
    );
    setAmount(template === null ? '' : `${template.salary_amount}`);
    setPercent(template?.revenue_percent === null || template === null ? '' : `${template.revenue_percent}`);
    setPooled(template?.tip_source === 'pool');
    setPoolShare(
      template?.tip_pool_percent === null || template === null ? '' : `${template.tip_pool_percent}`,
    );
    setBreakMinutes(template === null || template.break_minutes === 0 ? '' : `${template.break_minutes}`);
    setPlaceId(template?.location_id ?? null);
  }, [editing, template]);

  const save = async () => {
    if (name.trim() === '') {
      setFailed('У смены должно быть название.');

      return;
    }

    setBusy(true);
    setFailed(null);

    const body = {
      name: name.trim(),
      symbol: symbol.trim() === '' ? null : symbol.trim(),
      location_id: placeId,
      start_time: start,
      end_time: end,
      salary_period: period,
      salary_amount: Number(amount.replace(',', '.')) || 0,
      break_minutes: Number(breakMinutes) || 0,
      colour: null,
      revenue_percent: percent.trim() === '' ? null : Number(percent.replace(',', '.')),
      tip_source: pooled ? 'pool' : 'personal',
      tip_pool_percent:
        pooled && poolShare.trim() !== '' ? Number(poolShare.replace(',', '.')) : null,
    };

    try {
      if (template === null) await api('/shifter/v1/shifts', { method: 'POST', body });
      else await api(`/shifter/v1/shifts/${template.id}`, { method: 'PUT', body });

      onSaved();
    } catch (caught) {
      setFailed(caught instanceof ApiError ? caught.message : 'Не сохранилось.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={editing !== null} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.editor}>
          <View style={styles.head}>
            <Text style={styles.title}>{template === null ? 'Новая смена' : 'Смена'}</Text>
            <Pressable hitSlop={12} onPress={onClose}>
              <Ionicons name="close" size={26} color={palette.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                maxLength={40}
                placeholder="Ночь"
                placeholderTextColor={palette.textSecondary}
              />
            </View>
            <View style={{ width: 84 }}>
              <Text style={styles.fieldLabel}>Значок</Text>
              <TextInput
                style={[styles.input, { textAlign: 'center' }]}
                value={symbol}
                onChangeText={setSymbol}
                maxLength={4}
                placeholder="🌙"
                placeholderTextColor={palette.textSecondary}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.fieldLabel}>Начало</Text>
              <TextInput
                style={styles.input}
                value={start}
                onChangeText={setStart}
                placeholder="18:00"
                placeholderTextColor={palette.textSecondary}
              />
            </View>
            <View style={styles.grow}>
              <Text style={styles.fieldLabel}>Конец</Text>
              <TextInput
                style={styles.input}
                value={end}
                onChangeText={setEnd}
                placeholder="02:00"
                placeholderTextColor={palette.textSecondary}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Платят</Text>
          <View style={styles.segmentRow}>
            {(Object.keys(PERIOD_LABEL) as Period[]).map((value) => (
              <Pressable
                key={value}
                style={[styles.segment, period === value && styles.segmentOn]}
                onPress={() => setPeriod(value)}
              >
                <Text style={[styles.segmentText, period === value && styles.segmentTextOn]}>
                  {PERIOD_LABEL[value]}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="Сумма, ₴"
            placeholderTextColor={palette.textSecondary}
          />

          <Text style={styles.fieldLabel}>Плюс процент от выручки</Text>
          <TextInput
            style={styles.input}
            value={percent}
            onChangeText={setPercent}
            keyboardType="numeric"
            placeholder="без процента"
            placeholderTextColor={palette.textSecondary}
          />

          <Text style={styles.fieldLabel}>Неоплачиваемый перерыв, мин</Text>
          <TextInput
            style={styles.input}
            value={breakMinutes}
            onChangeText={setBreakMinutes}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={palette.textSecondary}
          />

          <Text style={styles.fieldLabel}>Чаевые</Text>
          <View style={styles.segmentRow}>
            {([
              [false, 'свои'],
              [true, 'доля общака'],
            ] as const).map(([value, label]) => (
              <Pressable
                key={label}
                style={[styles.segment, pooled === value && styles.segmentOn]}
                onPress={() => setPooled(value)}
              >
                <Text style={[styles.segmentText, pooled === value && styles.segmentTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {pooled && (
            <TextInput
              style={styles.input}
              value={poolShare}
              onChangeText={setPoolShare}
              keyboardType="numeric"
              placeholder="Ваша доля, %"
              placeholderTextColor={palette.textSecondary}
            />
          )}

          {places.length > 0 && (
            <>
              <Text style={styles.fieldLabel}>Место работы</Text>
              <View style={styles.placeRow}>
                <Pressable
                  style={[styles.place, placeId === null && styles.placeOn]}
                  onPress={() => setPlaceId(null)}
                >
                  <Text style={[styles.placeText, placeId === null && styles.placeTextOn]}>
                    без места
                  </Text>
                </Pressable>
                {places.map((place) => (
                  <Pressable
                    key={place.id}
                    style={[styles.place, placeId === place.id && styles.placeOn]}
                    onPress={() => setPlaceId(place.id)}
                  >
                    <Text style={[styles.placeText, placeId === place.id && styles.placeTextOn]}>
                      {place.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {failed !== null && <Text style={styles.error}>{failed}</Text>}

          <Pressable
            style={[styles.primary, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={() => void save()}
          >
            <Text style={styles.primaryText}>{busy ? 'Сохраняем…' : 'Сохранить'}</Text>
          </Pressable>

          {template !== null && (
            <>
              <Pressable style={styles.ghost} onPress={() => onArchive(template)}>
                <Text style={styles.ghostText}>Убрать в архив</Text>
              </Pressable>
              <Text style={styles.hint}>
                Архив не мешает работе, но сохраняет всё заработанное этой сменой.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 18, paddingBottom: 44, gap: 10 },
    editor: { padding: 20, paddingTop: 56, paddingBottom: 48, gap: 8 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: palette.text, fontSize: 26, fontWeight: '800' },
    grow: { flex: 1 },
    row: { flexDirection: 'row', gap: 10 },
    lead: { color: palette.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 4 },
    hint: { color: palette.textSecondary, fontSize: 12, lineHeight: 17, textAlign: 'center' },
    error: { color: palette.danger, fontSize: 13 },
    section: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 12 },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    cardDim: { opacity: 0.6 },
    cardEmoji: { fontSize: 22 },
    cardName: { color: palette.text, fontSize: 15.5, fontWeight: '700' },
    cardMeta: { color: palette.textSecondary, fontSize: 12.5, marginTop: 2 },
    restore: { color: palette.accent, fontSize: 13, fontWeight: '600' },

    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderColor: palette.accent,
      borderWidth: 1,
      backgroundColor: palette.accentSoft,
      borderRadius: 999,
      paddingVertical: 13,
      marginTop: 4,
    },
    addText: { color: palette.accent, fontSize: 15, fontWeight: '700' },

    fieldLabel: { color: palette.textSecondary, fontSize: 13, marginTop: 8 },
    input: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: palette.text,
      fontSize: 16,
    },

    segmentRow: { flexDirection: 'row', gap: 8 },
    segment: {
      flex: 1,
      alignItems: 'center',
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 9,
    },
    segmentOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    segmentText: { color: palette.text, fontSize: 13, fontWeight: '600' },
    segmentTextOn: { color: '#fff' },

    placeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    place: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    placeOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    placeText: { color: palette.text, fontSize: 13 },
    placeTextOn: { color: '#fff' },

    primary: {
      backgroundColor: palette.accent,
      borderRadius: 999,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 18,
    },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    ghost: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 12,
    },
    ghostText: { color: palette.danger, fontSize: 14, fontWeight: '600' },
  });
