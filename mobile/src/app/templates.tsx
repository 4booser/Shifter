import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/motion';
import { useAutoStart } from '@/store/autostart';
import { Colors, Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import { EventKind, EventTemplate, money, rateLine, ShiftTemplate } from '@/lib/types';
import { t } from '@/lib/i18n';

interface Place {
  id: number;
  name: string;
  colour: string;
  archived: boolean;
}

// The week was missing here, so a weekly template opened as hourly and saving
// it without touching anything priced it forty times high. The server has
// always accepted it and the phone's own rate line already prints "в неделю".
type Period = 'hour' | 'day' | 'week' | 'month';

const PERIOD_LABEL: Record<Period, string> = {
  hour: 'за час',
  day: 'за смену',
  week: 'в неделю',
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
  const [eventTypes, setEventTypes] = useState<EventTemplate[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [editing, setEditing] = useState<ShiftTemplate | 'new' | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventTemplate | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoRules = useAutoStart((state) => state.rules);
  const setAutoRule = useAutoStart((state) => state.setRule);
  const hydrateAuto = useAutoStart((state) => state.hydrate);

  useEffect(() => {
    void hydrateAuto();
  }, [hydrateAuto]);

  /** "18:00" ± minutes, clamped to the day. */
  const nudge = (time: string, delta: number): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const total = Math.max(0, Math.min(23 * 60 + 59, hours * 60 + minutes + delta));

    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  const load = useCallback(async () => {
    try {
      const [shifts, locations, events] = await Promise.all([
        api<ShiftTemplate[]>('/shifter/v1/shifts'),
        api<Place[]>('/shifter/v1/locations'),
        api<EventTemplate[]>('/shifter/v1/event-templates'),
      ]);

      setTemplates(shifts);
      setEventTypes(events);
      setPlaces(locations.filter((place) => !place.archived));
      setError(null);
    } catch (caught) {
      setTemplates([]);
      setError(caught instanceof ApiError ? caught.message : t('Не дотянулись до сервера.'));
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
      setError(caught instanceof ApiError ? caught.message : t('Не получилось.'));
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
          <Text style={styles.title}>{t('Смены')}</Text>
          <Press hitSlop={12} onPress={() => router.back()}>
            <Ionicons name="close" size={26} color={palette.textSecondary} />
          </Press>
        </View>

        <Text style={styles.lead}>{t('Шаблон — это одна ваша смена целиком: часы, ставка, перерыв. Поставили на день — он посчитался сам.')}</Text>

        {templates === null && <ActivityIndicator color={palette.accent} />}
        {error !== null && <Text style={styles.error}>{error}</Text>}

        {live.map((template) => {
          const auto = autoRules.find((rule) => rule.shiftId === template.id);

          return (
            <View key={template.id} style={styles.cardStack}>
              <Press style={styles.card} onPress={() => setEditing(template)}>
                <Text style={styles.cardEmoji}>{template.symbol ?? '🕐'}</Text>
                <View style={styles.grow}>
                  <Text style={styles.cardName}>{template.name}</Text>
                  <Text style={styles.cardMeta}>
                    {template.start_time.slice(0, 5)}–{template.end_time.slice(0, 5)} ·{' '}
                    {rateLine(template)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.textSecondary} />
              </Press>

              {/* Starts itself, at the hour they chose — or by the button, as
                  always. Only on days the calendar actually plans it. */}
              <View style={styles.autoRow}>
                <Press
                  style={styles.autoToggle}
                  onPress={() =>
                    setAutoRule(
                      template.id,
                      auto === undefined ? template.start_time.slice(0, 5) : null,
                    )
                  }
                >
                  <Ionicons
                    name={auto === undefined ? 'play-circle-outline' : 'play-circle'}
                    size={18}
                    color={auto === undefined ? palette.textSecondary : palette.accent}
                  />
                  <Text style={[styles.autoText, auto !== undefined && { color: palette.accent }]}>
                    {auto === undefined
                      ? t('Запускать саму в день по плану')
                      : `${t('Начнётся сама в')} ${auto.at}`}
                  </Text>
                </Press>

                {auto !== undefined && (
                  <View style={styles.autoTimes}>
                    {[-30, -15, 15, 30].map((delta) => (
                      <Press
                        key={delta}
                        style={styles.autoNudge}
                        onPress={() => setAutoRule(template.id, nudge(auto.at, delta))}
                      >
                        <Text style={styles.autoNudgeText}>
                          {delta > 0 ? `+${delta}` : delta}
                        </Text>
                      </Press>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        })}

        <Press style={styles.addRow} onPress={() => setEditing('new')}>
          <Ionicons name="add-circle-outline" size={20} color={palette.accent} />
          <Text style={styles.addText}>{t('Новая смена')}</Text>
        </Press>

        <Text style={styles.section}>{t('События')}</Text>
        <Text style={styles.lead}>
          {t('Всё, что не работа: английский, вождение, зал. У события есть время и трата — она считается отдельно от заработка.')}
        </Text>

        {eventTypes
          .filter((entry) => !entry.archived)
          .map((entry) => (
            <Press key={entry.id} style={styles.card} onPress={() => setEditingEvent(entry)}>
              <Text style={styles.cardEmoji}>{entry.symbol ?? '📌'}</Text>
              <View style={styles.grow}>
                <Text style={styles.cardName}>{entry.name}</Text>
                <Text style={styles.cardMeta}>
                  {[
                    entry.start_time === null
                      ? t('весь день')
                      : `${entry.start_time}–${entry.end_time}`,
                    entry.cost === null ? null : `−${money(entry.cost)}`,
                  ]
                    .filter((part) => part !== null)
                    .join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textSecondary} />
            </Press>
          ))}

        <Press style={styles.addRow} onPress={() => setEditingEvent('new')}>
          <Ionicons name="add-circle-outline" size={20} color={palette.accent} />
          <Text style={styles.addText}>{t('Новое событие')}</Text>
        </Press>

        {archived.length > 0 && (
          <>
            <Text style={styles.section}>{t('В архиве')}</Text>
            {archived.map((template) => (
              <View key={template.id} style={[styles.card, styles.cardDim]}>
                <Text style={styles.cardEmoji}>{template.symbol ?? '🕐'}</Text>
                <View style={styles.grow}>
                  <Text style={styles.cardName}>{template.name}</Text>
                  <Text style={styles.cardMeta}>
                    {template.start_time.slice(0, 5)}–{template.end_time.slice(0, 5)}
                  </Text>
                </View>
                <Press hitSlop={8} onPress={() => void archive(template, false)}>
                  <Text style={styles.restore}>{t('Вернуть')}</Text>
                </Press>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <EventTypeEditor
        editing={editingEvent}
        palette={palette}
        onClose={() => setEditingEvent(null)}
        onSaved={() => {
          setEditingEvent(null);
          void load();
        }}
      />

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
 * One kind of non-working thing: «английский», «вождение», the gym.
 *
 * The cost field is the reason this is not just the shift editor with fewer
 * boxes. Money here runs the other way, and the note under it says so — what
 * a lesson takes is never subtracted from what a week earned, it sits beside
 * it, because the figure people check each evening has to keep meaning the
 * same thing.
 */
function EventTypeEditor({
  editing,
  palette,
  onClose,
  onSaved,
}: {
  editing: EventTemplate | 'new' | null;
  palette: Palette;
  onClose: () => void;
  onSaved: () => void;
}) {
  const styles = makeStyles(palette);
  const item = editing === 'new' || editing === null ? null : editing;

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [colour, setColour] = useState(EVENT_COLOURS[0]);
  const [kind, setKind] = useState<EventKind>('ordinary');
  const [timed, setTimed] = useState(true);
  const [start, setStart] = useState('19:00');
  const [end, setEnd] = useState('20:30');
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (editing === null) return;

    setFailed(null);
    setName(item?.name ?? '');
    setSymbol(item?.symbol ?? '');
    setColour(item?.colour ?? EVENT_COLOURS[0]);
    setKind(item?.kind ?? 'ordinary');
    setTimed(item === null ? true : item.start_time !== null);
    setStart(item?.start_time ?? '19:00');
    setEnd(item?.end_time ?? '20:30');
    // An empty box is "not counted", a zero is "it was free this time". The
    // two are different answers and the server keeps them apart.
    setCost(item?.cost === null || item === undefined || item === null ? '' : `${item.cost}`);
  }, [editing, item]);

  const save = async () => {
    if (name.trim() === '') {
      setFailed(t('У события должно быть название.'));

      return;
    }

    setBusy(true);
    setFailed(null);

    const body = {
      name: name.trim(),
      symbol: symbol.trim() === '' ? null : symbol.trim(),
      colour,
      kind,
      start_time: timed ? start : null,
      end_time: timed ? end : null,
      cost: cost.trim() === '' ? null : Number(cost.replace(',', '.')),
    };

    try {
      if (item === null) await api('/shifter/v1/event-templates', { method: 'POST', body });
      else await api(`/shifter/v1/event-templates/${item.id}`, { method: 'PUT', body });

      onSaved();
    } catch (caught) {
      setFailed(caught instanceof ApiError ? caught.message : t('Не сохранилось.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (item === null) return;

    setBusy(true);

    try {
      await api(`/shifter/v1/event-templates/${item.id}`, { method: 'DELETE' });
      onSaved();
    } catch (caught) {
      setFailed(caught instanceof ApiError ? caught.message : t('Не получилось.'));
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
            <Text style={styles.title}>
              {item === null ? t('Новое событие') : t('Событие')}
            </Text>
            <Press hitSlop={12} onPress={onClose}>
              <Ionicons name="close" size={26} color={palette.textSecondary} />
            </Press>
          </View>

          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.fieldLabel}>{t('Название')}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                maxLength={40}
                placeholder={t('Английский')}
                placeholderTextColor={palette.textSecondary}
              />
            </View>
            <View style={{ width: 84 }}>
              <Text style={styles.fieldLabel}>{t('Значок')}</Text>
              <TextInput
                style={[styles.input, { textAlign: 'center' }]}
                value={symbol}
                onChangeText={setSymbol}
                maxLength={4}
                placeholder="📚"
                placeholderTextColor={palette.textSecondary}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>{t('Цвет')}</Text>
          <View style={styles.swatches}>
            {EVENT_COLOURS.map((value) => (
              <Press
                key={value}
                style={[
                  styles.swatch,
                  { backgroundColor: value },
                  colour === value && styles.swatchOn,
                ]}
                onPress={() => setColour(value)}
              >
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={colour === value ? '#fff' : 'transparent'}
                />
              </Press>
            ))}
          </View>

          <Press style={styles.toggleRow} onPress={() => setTimed((was) => !was)}>
            <Ionicons
              name={timed ? 'checkbox' : 'square-outline'}
              size={22}
              color={timed ? palette.accent : palette.textSecondary}
            />
            <Text style={styles.toggleText}>{t('Проходит в определённое время')}</Text>
          </Press>

          {timed && (
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.fieldLabel}>{t('Начало')}</Text>
                <TextInput
                  style={styles.input}
                  value={start}
                  onChangeText={setStart}
                  placeholder="19:00"
                  placeholderTextColor={palette.textSecondary}
                />
              </View>
              <View style={styles.grow}>
                <Text style={styles.fieldLabel}>{t('Конец')}</Text>
                <TextInput
                  style={styles.input}
                  value={end}
                  onChangeText={setEnd}
                  placeholder="20:30"
                  placeholderTextColor={palette.textSecondary}
                />
              </View>
            </View>
          )}

          <Text style={styles.fieldLabel}>{t('Стоит за раз')}</Text>
          <TextInput
            style={styles.input}
            value={cost}
            onChangeText={setCost}
            keyboardType="decimal-pad"
            placeholder={t('Пусто — не считаем')}
            placeholderTextColor={palette.textSecondary}
          />
          <Text style={styles.hint}>
            {t('Считается отдельно от заработка — из него не вычитается.')}
          </Text>

          <Text style={styles.fieldLabel}>{t('Тип')}</Text>
          <View style={styles.segmentRow}>
            {(['ordinary', 'vacation', 'sick', 'dayoff'] as EventKind[]).map((value) => (
              <Press
                key={value}
                style={[styles.segment, kind === value && styles.segmentOn]}
                onPress={() => setKind(value)}
              >
                <Text style={[styles.segmentText, kind === value && styles.segmentTextOn]}>
                  {t(KIND_LABEL[value])}
                </Text>
              </Press>
            ))}
          </View>
          <Text style={styles.hint}>
            {t('Отпуск и больничный не сбивают темп заработка, обычные события — считаются как есть.')}
          </Text>

          {failed !== null && <Text style={styles.error}>{failed}</Text>}

          <Press
            style={[styles.primary, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={() => void save()}
          >
            <Text style={styles.primaryText}>{busy ? t('Сохраняем…') : t('Сохранить')}</Text>
          </Press>

          {item !== null && (
            <Press style={styles.ghost} disabled={busy} onPress={() => void remove()}>
              <Text style={styles.ghostText}>{t('Удалить')}</Text>
            </Press>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The same six the web offers, so a palette made there looks the same here. */
const EVENT_COLOURS = ['#38BDF8', '#22C55E', '#FF5C7A', '#A855F7', '#FFA53D', '#64748B'];

const KIND_LABEL: Record<EventKind, string> = {
  ordinary: 'Обычное',
  vacation: 'Отпуск',
  sick: 'Больничный',
  dayoff: 'Выходной',
};

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
      template !== null && template.salary_period in PERIOD_LABEL
        ? (template.salary_period as Period)
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
      setFailed(t('У смены должно быть название.'));

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
      // Carried, not cleared. The contract defaults this to absent precisely so
      // an older client cannot wipe it; sending an explicit null threw away a
      // colour chosen on the web the moment the template was opened here.
      colour: template?.colour ?? null,
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
      setFailed(caught instanceof ApiError ? caught.message : t('Не сохранилось.'));
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
            <Text style={styles.title}>{template === null ? t('Новая смена') : t('Смена')}</Text>
            <Press hitSlop={12} onPress={onClose}>
              <Ionicons name="close" size={26} color={palette.textSecondary} />
            </Press>
          </View>

          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.fieldLabel}>{t('Название')}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                maxLength={40}
                placeholder={t("Ночь")}
                placeholderTextColor={palette.textSecondary}
              />
            </View>
            <View style={{ width: 84 }}>
              <Text style={styles.fieldLabel}>{t('Значок')}</Text>
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
              <Text style={styles.fieldLabel}>{t('Начало')}</Text>
              <TextInput
                style={styles.input}
                value={start}
                onChangeText={setStart}
                placeholder="18:00"
                placeholderTextColor={palette.textSecondary}
              />
            </View>
            <View style={styles.grow}>
              <Text style={styles.fieldLabel}>{t('Конец')}</Text>
              <TextInput
                style={styles.input}
                value={end}
                onChangeText={setEnd}
                placeholder="02:00"
                placeholderTextColor={palette.textSecondary}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>{t('Платят')}</Text>
          <View style={styles.segmentRow}>
            {(Object.keys(PERIOD_LABEL) as Period[]).map((value) => (
              <Press
                key={value}
                style={[styles.segment, period === value && styles.segmentOn]}
                onPress={() => setPeriod(value)}
              >
                <Text style={[styles.segmentText, period === value && styles.segmentTextOn]}>
                  {t(PERIOD_LABEL[value])}
                </Text>
              </Press>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder={t("Сумма, ₴")}
            placeholderTextColor={palette.textSecondary}
          />

          <Text style={styles.fieldLabel}>{t('Плюс процент от выручки')}</Text>
          <TextInput
            style={styles.input}
            value={percent}
            onChangeText={setPercent}
            keyboardType="numeric"
            placeholder={t("без процента")}
            placeholderTextColor={palette.textSecondary}
          />

          <Text style={styles.fieldLabel}>{t('Неоплачиваемый перерыв, мин')}</Text>
          <TextInput
            style={styles.input}
            value={breakMinutes}
            onChangeText={setBreakMinutes}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={palette.textSecondary}
          />

          <Text style={styles.fieldLabel}>{t('Чаевые')}</Text>
          <View style={styles.segmentRow}>
            {([
              [false, t('свои')],
              [true, t('доля общака')],
            ] as const).map(([value, label]) => (
              <Press
                key={label}
                style={[styles.segment, pooled === value && styles.segmentOn]}
                onPress={() => setPooled(value)}
              >
                <Text style={[styles.segmentText, pooled === value && styles.segmentTextOn]}>
                  {label}
                </Text>
              </Press>
            ))}
          </View>

          {pooled && (
            <TextInput
              style={styles.input}
              value={poolShare}
              onChangeText={setPoolShare}
              keyboardType="numeric"
              placeholder={t("Ваша доля, %")}
              placeholderTextColor={palette.textSecondary}
            />
          )}

          {places.length > 0 && (
            <>
              <Text style={styles.fieldLabel}>{t('Место работы')}</Text>
              <View style={styles.placeRow}>
                <Press
                  style={[styles.place, placeId === null && styles.placeOn]}
                  onPress={() => setPlaceId(null)}
                >
                  <Text style={[styles.placeText, placeId === null && styles.placeTextOn]}>{t('без места')}</Text>
                </Press>
                {places.map((place) => (
                  <Press
                    key={place.id}
                    style={[styles.place, placeId === place.id && styles.placeOn]}
                    onPress={() => setPlaceId(place.id)}
                  >
                    <Text style={[styles.placeText, placeId === place.id && styles.placeTextOn]}>
                      {place.name}
                    </Text>
                  </Press>
                ))}
              </View>
            </>
          )}

          {failed !== null && <Text style={styles.error}>{failed}</Text>}

          <Press
            style={[styles.primary, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={() => void save()}
          >
            <Text style={styles.primaryText}>{busy ? t('Сохраняем…') : t('Сохранить')}</Text>
          </Press>

          {template !== null && (
            <>
              <Press style={styles.ghost} onPress={() => onArchive(template)}>
                <Text style={styles.ghostText}>{t('Убрать в архив')}</Text>
              </Press>
              <Text style={styles.hint}>{t('Архив не мешает работе, но сохраняет всё заработанное этой сменой.')}</Text>
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

    cardStack: { gap: 0 },
    autoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
      paddingBottom: 10,
      marginTop: -6,
    },
    autoToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
    autoText: { color: palette.textSecondary, fontSize: 12.5 },
    autoTimes: { flexDirection: 'row', gap: 4 },
    autoNudge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
    },
    autoNudgeText: { color: palette.textSecondary, fontSize: 11.5 },

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
    swatches: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    swatch: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    swatchOn: { borderColor: palette.text },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    toggleText: { color: palette.text, fontSize: 14, flex: 1 },
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
