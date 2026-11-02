import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  AppState,
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

import { Appear, Press, Roll } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import { clockOf, dayLabel } from '@/lib/calendar';
import {
  adoptAnswer,
  adoptBoxes,
  afterFailure,
  createDaySaver,
  dayBoxes,
  dayDraft,
  DayTyped,
  putOn,
  SaveState,
} from '@/lib/day-saver';
import { hearDay, inTurn } from '@/lib/day-writes';
import { clockDue, flipNeedsAnswer, isClock, placedWorked, tidyClock } from '@/lib/shift-window';
import {
  CalendarDayData,
  DEDUCTION_REASONS,
  DaySave,
  DaysResponse,
  DeductionReason,
  SalesPosition,
  ShiftTemplate,
  ShiftZone,
  blankDay,
  hoursOn,
  money,
  plural,
  templateHoursOn,
  tint,
} from '@/lib/types';
import { t } from '@/lib/i18n';
import { buzz } from '@/lib/haptics';
import { useAutoStart } from '@/store/autostart';
import { useLive } from '@/store/live';
import { putDay, useOutbox } from '@/store/outbox';

/** Short on purpose: a list long enough for every venue is one nobody fills in. */
const ZONES: { value: ShiftZone; label: string }[] = [
  { value: 'hall', label: 'Зал' },
  { value: 'bar', label: 'Бар' },
  { value: 'terrace', label: 'Терраса' },
  { value: 'banquet', label: 'Банкет' },
  { value: 'takeaway', label: 'На вынос' },
];

/** One day, editable: which templates are on it, whether they were worked, the tips and the fines. */
export default function DayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  const [day, setDay] = useState<CalendarDayData | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [positions, setPositions] = useState<SalesPosition[]>([]);
  // Keyed by sales_id; rows for archived positions ride along so a save
  // never silently deletes what an older day recorded.
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [tips, setTips] = useState('');
  const [deductions, setDeductions] = useState('');
  const [deductionReason, setDeductionReason] = useState<DeductionReason | null>(null);
  const [tipPool, setTipPool] = useState('');
  const [note, setNote] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [error, setError] = useState<string | null>(null);
  // What is in a clock box while somebody is still typing it, keyed by shift
  // and edge. Half a time never reaches the day: the server reads "23:3" as
  // 23:03, and a save landing mid-word would hand that back into the box.
  const [typingClock, setTypingClock] = useState<Record<string, string>>({});

  const typed: DayTyped = { quantities, tips, tipPool, deductions, deductionReason, note };

  // What the saver reads when an answer lands, long after this render.
  const dayNow = useRef(day);
  const typedNow = useRef(typed);
  const onScreen = useRef(true);

  dayNow.current = day;
  typedNow.current = typed;

  // Through the ref as well: an answer behind this one can land before the next render.
  const fillBoxes = useCallback((boxes: DayTyped) => {
    typedNow.current = boxes;
    setQuantities(boxes.quantities);
    setTips(boxes.tips);
    setTipPool(boxes.tipPool);
    setDeductions(boxes.deductions);
    setDeductionReason(boxes.deductionReason);
    setNote(boxes.note);
  }, []);

  /** Фактически moved under a running clock: the clock goes with it. */
  const followClock = (shown: CalendarDayData) => {
    const running = useLive.getState().live;

    if (running?.date !== date) return;

    const entry = shown.shifts.find((row) => row.shift_id === running.shiftId);

    if (entry !== undefined) useLive.getState().follow(entry);
  };

  // Another device edited this day first. Show both versions and ask; never
  // merge — a silent merge of money is the worst outcome there is.
  const askAboutConflict = async (payload: DaySave) => {
    const theirs = await api<{ days: CalendarDayData[] }>(
      `/shifter/v1/days?from=${date}&to=${date}`,
    ).then((range) => range.days.find((row) => row.date === date)).catch(() => undefined);

    const sayDay = (row: { shifts: unknown[]; tips: number | null; note: string | null } | undefined) =>
      row === undefined
        ? t('пустой день')
        : `${row.shifts.length} см. · чай ${row.tips ?? '—'}${row.note ? ` · «${row.note}»` : ''}`;

    Alert.alert(
      t('День изменён на другом устройстве'),
      `${t('На другом устройстве')}: ${sayDay(theirs)}\n${t('Здесь')}: ${sayDay({ shifts: payload.shifts, tips: payload.tips, note: payload.note })}\n\n${t('Ничего не склеивается — выберите, что оставить.')}`,
      [
        {
          text: t('Оставить их версию'),
          style: 'cancel',
          onPress: () => {
            saver.abandon();
            if (onScreen.current) router.back();
          },
        },
        {
          text: t('Записать мою поверх'),
          style: 'destructive',
          onPress: () => {
            saver.overrule(theirs?.version ?? 0);
            void saver.flush().then(() => {
              if (onScreen.current && saver.clean()) router.back();
            });
          },
        },
      ],
    );
  };

  // One per date, so a date's drafts can never land on another.
  const saver = useMemo(() => {
    // This screen's place in the queue: only its newest draft is worth holding.
    const slot = `${date}:${Date.now()}`;

    return createDaySaver({
      send: async (payload) => {
        const answer = await putDay(date, payload);

        void useOutbox.getState().release(slot);

        return answer;
      },
      adopt: (answer, known, own) => {
        const merged = adoptAnswer(dayNow.current ?? answer, known, answer);
        const boxes = own ? typedNow.current : adoptBoxes(typedNow.current, known, answer);

        dayNow.current = merged;
        setDay((shown) => (shown === null ? merged : adoptAnswer(shown, known, answer)));
        fillBoxes(boxes);
        setError(null);
        followClock(merged);

        return dayDraft(merged, boxes);
      },
      onState: setSaveState,
      onConflict: (payload) => void askAboutConflict(payload),
      onFailed: (caught, payload, known) => {
        const here = onScreen.current;

        if (here) setError(caught instanceof Error ? caught.message : t('Не сохранилось.'));

        const fate = afterFailure(caught, here && AppState.currentState === 'active');

        if (fate === 'refused' && !here) useOutbox.getState().noteRefused();

        if (fate === 'hold') {
          void useOutbox.getState().hold([
            {
              method: 'PUT',
              path: `/shifter/v1/days/${date}`,
              body: payload,
              base: known,
              slot,
              days: [date],
              label: dayLabel(date),
            },
          ]);
        }
      },
    });
    // Everything it reaches for afterwards is a ref or stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    void Promise.all([
      // Behind any clock write still going, whose answer nobody here could
      // hear yet, and after whatever was held for this day: this screen knows
      // nothing of a held draft, and its first save would strand it.
      inTurn(date, () =>
        useOutbox
          .getState()
          .settle(date)
          .then(() => api<DaysResponse>(`/shifter/v1/days?from=${date}&to=${date}`)),
      ),
      api<ShiftTemplate[]>('/shifter/v1/shifts'),
      api<SalesPosition[]>('/shifter/v1/sales').catch(() => [] as SalesPosition[]),
    ])
      .then(([summary, shifts, sold]) => {
        // The server only returns days it has: an untouched date comes back
        // as an empty list, not as a blank day.
        const loaded = summary.days[0] ?? blankDay(date);

        setDay(loaded);
        setTemplates(shifts.filter((template) => !template.archived));
        fillBoxes(dayBoxes(loaded));
        setPositions(sold.filter((position) => !position.archived));
      })
      .catch(() => setError(t('День не загрузился.')));
  }, [date, fillBoxes]);

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

    const hours = hoursOn(template, date);

    setDay({
      ...day,
      shifts: [
        ...day.shifts,
        putOn({
          shift_id: template.id,
          name: template.name,
          symbol: template.symbol,
          colour: template.colour,
          start_time: hours.start_time,
          end_time: hours.end_time,
          // What it will be worth once the server prices it; shown here only
          // so the row reads the same before and after the save.
          hours: templateHoursOn(template, date),
          // Local, not UTC: at half past midnight in Kyiv the UTC date is still yesterday, so a bartender who had just…
          worked: placedWorked(template, date),
          needs_cover: false,
          actual_start: null,
          actual_end: null,
          break_minutes: null,
          earned: 0,
          revenue: null,
          guests: null,
          zone: 'unset' as const,
          revenue_percent: template.revenue_percent,
          auto_closed: false,
        }),
      ],
    });
  };

  /** The share of the pool this day is owed, or null when nothing on it is pooled. */
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
          ? { ...entry, revenue: value.trim() === '' ? null : Number(value.replace(',', '.')) || 0 }
          : entry,
      ),
    });
  };

  /** How many the shift served. */
  const setGuests = (shiftId: number, value: string) => {
    if (day === null) return;

    setDay({
      ...day,
      shifts: day.shifts.map((entry) =>
        entry.shift_id === shiftId
          ? { ...entry, guests: value.trim() === '' ? null : Number(value) || 0 }
          : entry,
      ),
    });
  };

  /** Where in the venue. */
  const setZone = (shiftId: number, zone: ShiftZone) => {
    if (day === null) return;

    setDay({
      ...day,
      shifts: day.shifts.map((entry) =>
        entry.shift_id === shiftId
          ? { ...entry, zone: entry.zone === zone ? 'unset' : zone }
          : entry,
      ),
    });
  };

  /** Asking the team to take this one. Only meaningful while it is still a plan. */
  const setCover = (shiftId: number, needs: boolean) => {
    if (day === null) return;

    const running = useLive.getState().live;
    const handed =
      needs && running?.date === date && running.shiftId === shiftId ? running : null;

    // Whoever asks is not working it: a clock left running would be stopped
    // unrecorded at the close, so it stops here along with what it wrote.
    if (handed !== null) {
      useAutoStart.getState().markFired(handed.shiftId, handed.date);
      useLive.getState().clear();
    }

    setDay({
      ...day,
      shifts: day.shifts.map((entry) =>
        entry.shift_id === shiftId
          ? {
              ...entry,
              needs_cover: needs,
              actual_start:
                handed !== null && entry.actual_start === clockOf(new Date(handed.startedAt))
                  ? null
                  : entry.actual_start,
            }
          : entry,
      ),
    });
  };

  /** What the clock actually said, which is not always what the template said. */
  const setActual = (shiftId: number, edge: 'actual_start' | 'actual_end', value: string) => {
    if (day === null) return;

    const text = value.trim();

    setTypingClock((typing) => ({ ...typing, [`${shiftId}:${edge}`]: value }));

    if (text !== '' && !isClock(text)) return;

    setDay({
      ...day,
      shifts: day.shifts.map((entry) =>
        entry.shift_id === shiftId
          ? { ...entry, [edge]: text === '' ? null : tidyClock(text) }
          : entry,
      ),
    });
  };

  /** Leaving a clock box: whatever was never a whole time goes back to what the day says. */
  const leaveClock = (shiftId: number, edge: 'actual_start' | 'actual_end') => {
    setTypingClock(({ [`${shiftId}:${edge}`]: _left, ...rest }) => rest);
    leaveField();
  };

  const setWorked = (shiftId: number, worked: boolean) => {
    buzz.commit();

    if (day === null) return;

    const template = templates.find((known) => known.id === shiftId);

    setDay({
      ...day,
      shifts: day.shifts.map((entry) =>
        entry.shift_id === shiftId
          ? {
              ...entry,
              worked,
              auto_closed:
                entry.auto_closed || (!worked && flipNeedsAnswer(template, date, entry)),
            }
          : entry,
      ),
    });
  };

  /* Saving without being asked to, the same rule as the web day panel. */
  const drafted = useMemo(
    () => (day === null || day.date !== date ? null : dayDraft(day, typed)),
    // Each box on its own: `typed` is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, date, quantities, tips, tipPool, deductions, deductionReason, note],
  );

  useEffect(() => {
    if (drafted !== null) saver.edit(drafted);
  }, [drafted, saver]);

  const leaveField = () => void saver.flush();

  // Backgrounding the app counts as leaving, and so does closing the screen.
  // Coming back, the day may have closed by itself while nobody was looking.
  useEffect(() => {
    onScreen.current = true;

    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        void saver.flush();

        return;
      }

      void api<DaysResponse>(`/shifter/v1/days?from=${date}&to=${date}`)
        .then((summary) => {
          if (summary.days[0] !== undefined) saver.overhear(summary.days[0]);
        })
        .catch(() => undefined);
    });

    // The clock underneath writes this same day: a start, a close, a discard.
    const stopHearing = hearDay(date, (answer) => saver.overhear(answer, true));

    return () => {
      sub.remove();
      stopHearing();
      onScreen.current = false;
      void saver.flush();
    };
  }, [date, saver]);

  /** Goes back once the day is in, and stays with the reason if it is not. */
  const finish = async () => {
    await saver.flush();

    if (saver.clean()) router.back();
  };

  const saveWord =
    saveState === 'saving' || saveState === 'waiting'
      ? t('Сохраняется…')
      : saveState === 'saved'
        ? t('Сохранено')
        : saveState === 'failed'
          ? t('Не сохранилось — повторить')
          : null;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Press
            onPress={() => {
              // Started here rather than on unmount, so it is in before the
              // calendar underneath reads the day back.
              void saver.flush();
              router.back();
            }}
            hitSlop={10}
          >
            <Ionicons name="close" size={24} color={palette.textSecondary} />
          </Press>
        </View>

        {error !== null && <Text style={styles.error}>{error}</Text>}
        {day === null && error === null && <ActivityIndicator color={palette.accent} />}

        {/* What the day is worth, while it is being changed. The editor used
            to make somebody save and go back to find out. */}
        {day !== null && (day.shifts.length > 0 || (day.tips ?? 0) > 0) && (
          <Appear>
            <View style={styles.worth}>
              <View style={styles.worthHalf}>
                <Roll
                  value={day.earned > 0 ? day.earned : day.planned}
                  prefix="₴"
                  style={[
                    styles.worthValue,
                    day.earned === 0 && day.planned > 0 && styles.worthPlanned,
                  ]}
                />
                <Text style={styles.worthLabel}>
                  {day.earned > 0 ? t('заработано') : t('в плане')}
                </Text>
              </View>
              <View style={styles.worthRule} />
              <View style={styles.worthHalf}>
                <Text style={styles.worthValue}>
                  {day.hours > 0 ? `${day.hours}`.replace('.', ',') : '—'}
                </Text>
                <Text style={styles.worthLabel}>{t('часов')}</Text>
              </View>
              <View style={styles.worthRule} />
              <View style={styles.worthHalf}>
                <Text style={styles.worthValue}>{day.shifts.length}</Text>
                <Text style={styles.worthLabel}>
                  {plural(day.shifts.length, t('смена'), t('смены'), t('смен')).split(' ')[1]}
                </Text>
              </View>
            </View>
          </Appear>
        )}

        {day !== null && (
          <>
            <Text style={styles.section}>{t('Смены')}</Text>
            {templates.length === 0 && (
              <Press style={styles.makeFirst} onPress={() => router.push('/templates')}>
                <Ionicons name="add-circle-outline" size={18} color={palette.accent} />
                <Text style={styles.makeFirstText}>{t('Заведите первую смену')}</Text>
              </Press>
            )}
            <View style={styles.templateWrap}>
              {templates.map((template) => {
                const hours = hoursOn(template, date);

                return (
                  <Press
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
                        {hours.start_time.slice(0, 5)}–{hours.end_time.slice(0, 5)}
                      </Text>
                    </View>
                  </Press>
                );
              })}
            </View>

            {day.shifts.length > 0 && (
              <View style={styles.card}>
                {day.shifts.map((entry) => (
                  <View
                    key={entry.shift_id}
                    style={[
                      styles.workedBlock,
                      { borderLeftColor: tint(entry.colour, 1) ?? palette.accent },
                    ]}
                  >
                    <View style={styles.workedRow}>
                      <Text style={styles.workedLabel}>
                        {entry.symbol ?? '🕐'} {entry.name} · {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)}
                        {entry.earned > 0 ? ` · ${money(entry.earned)}` : ''}
                      </Text>
                      <View style={styles.workedSwitch}>
                        <Text style={styles.workedHint}>{entry.worked ? t('отработана') : t('план')}</Text>
                        <Switch
                          value={entry.worked}
                          onValueChange={(value) => setWorked(entry.shift_id, value)}
                          trackColor={{ true: palette.accent, false: palette.border }}
                        />
                      </View>
                    </View>

                    {/* Closed with nobody watching, on the plan's times unless somebody
                        said otherwise. Worth a look before it is taken as read. */}
                    {entry.worked && entry.auto_closed && (
                      <Text style={styles.closedHint}>
                        {t('Закрылась сама по графику — проверьте время')}
                      </Text>
                    )}

                    {/* The clock, where it differed from the template — and on a
                        shift under way or due today, so it can be said in advance. */}
                    {(entry.worked || (!entry.needs_cover && clockDue(date, entry))) && (
                      <View style={styles.actualRow}>
                        <View style={styles.actualField}>
                          <Text style={styles.fieldLabel}>{t('Пришёл')}</Text>
                          <TextInput
                            style={styles.input}
                            placeholder={entry.start_time.slice(0, 5)}
                            placeholderTextColor={palette.textSecondary}
                            value={typingClock[`${entry.shift_id}:actual_start`] ?? entry.actual_start ?? ''}
                            onChangeText={(value) => setActual(entry.shift_id, 'actual_start', value)}
                            onBlur={() => leaveClock(entry.shift_id, 'actual_start')}
                          />
                        </View>
                        <View style={styles.actualField}>
                          <Text style={styles.fieldLabel}>{t('Ушёл')}</Text>
                          <TextInput
                            style={styles.input}
                            placeholder={entry.end_time.slice(0, 5)}
                            placeholderTextColor={palette.textSecondary}
                            value={typingClock[`${entry.shift_id}:actual_end`] ?? entry.actual_end ?? ''}
                            onChangeText={(value) => setActual(entry.shift_id, 'actual_end', value)}
                            onBlur={() => leaveClock(entry.shift_id, 'actual_end')}
                          />
                        </View>
                      </View>
                    )}

                    {!entry.worked && (
                      <Press
                        style={[styles.cover, entry.needs_cover && styles.coverOn]}
                        onPress={() => setCover(entry.shift_id, !entry.needs_cover)}
                      >
                        <Ionicons
                          name={entry.needs_cover ? 'hand-left' : 'hand-left-outline'}
                          size={15}
                          color={entry.needs_cover ? '#fff' : palette.textSecondary}
                        />
                        <Text style={[styles.coverText, entry.needs_cover && styles.coverTextOn]}>
                          {entry.needs_cover ? t('Ищу замену') : t('Попросить о замене')}
                        </Text>
                      </Press>
                    )}

                    {entry.worked && (
                      <>
                        <Text style={styles.fieldLabel}>{t('Где работали')}</Text>
                        <View style={styles.zones}>
                          {ZONES.map((zone) => (
                            <Press
                              key={zone.value}
                              style={[styles.zone, entry.zone === zone.value && styles.zoneOn]}
                              onPress={() => setZone(entry.shift_id, zone.value)}
                            >
                              <Text
                                style={[
                                  styles.zoneText,
                                  entry.zone === zone.value && styles.zoneTextOn,
                                ]}
                              >
                                {t(zone.label)}
                              </Text>
                            </Press>
                          ))}
                        </View>
                      </>
                    )}

                    {entry.revenue_percent !== null && (
                      <>
                        <Text style={styles.fieldLabel}>
                          Выручка за смену · {entry.revenue_percent}%
                        </Text>
                        <TextInput
                          style={styles.input}
                          keyboardType="numeric"
                          placeholder={t("не считаем")}
                          placeholderTextColor={palette.textSecondary}
                          value={entry.revenue === null ? '' : `${entry.revenue}`}
                          onChangeText={(value) => setRevenue(entry.shift_id, value)}
                          onBlur={leaveField}
                        />

                        {/* Takings alone do not describe an evening: twelve thousand off forty covers is a different night from twelve… */}
                        <Text style={styles.fieldLabel}>{t('Гостей')}</Text>
                        <TextInput
                          style={styles.input}
                          keyboardType="numeric"
                          placeholder={t('никто не считал')}
                          placeholderTextColor={palette.textSecondary}
                          value={entry.guests === null || entry.guests === undefined ? '' : `${entry.guests}`}
                          onChangeText={(value) => setGuests(entry.shift_id, value)}
                          onBlur={leaveField}
                        />

                        {entry.revenue !== null
                          && entry.guests !== null
                          && entry.guests !== undefined
                          && entry.guests > 0 && (
                          <Text style={styles.fieldLabel}>
                            {t('Средний чек')}: {money(Math.round((entry.revenue / entry.guests) * 100) / 100)}
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.sectionRow}>
              <Text style={styles.section}>{t('Деньги дня')}</Text>

              {/* Right beside the numbers, because the numbers are what somebody
                  is watching: no button means this is the only receipt. */}
              {saveWord !== null && (
                <Press
                  hitSlop={8}
                  disabled={saveState !== 'failed'}
                  onPress={leaveField}
                  style={styles.saveMark}
                >
                  {saveState === 'saved' && (
                    <Ionicons name="checkmark" size={14} color={palette.textSecondary} />
                  )}
                  <Text style={[styles.saveWord, saveState === 'failed' && styles.saveWordFailed]}>
                    {saveWord}
                  </Text>
                </Press>
              )}
            </View>
            <View style={styles.moneyRow}>
              <View style={styles.moneyField}>
                <Text style={styles.fieldLabel}>{pooled === null ? t('Чаевые') : t('Общак за день')}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={palette.textSecondary}
                  value={pooled === null ? tips : tipPool}
                  onChangeText={pooled === null ? setTips : setTipPool}
                  onBlur={leaveField}
                />
                {pooled !== null && (
                  <Text style={styles.hintText}>
                    Ваша доля · {pooled}% = {money(((Number(tipPool) || 0) * pooled) / 100)}
                  </Text>
                )}
              </View>
              <View style={styles.moneyField}>
                <Text style={styles.fieldLabel}>{t('Штрафы и недостачи')}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={palette.textSecondary}
                  value={deductions}
                  onChangeText={setDeductions}
                  onBlur={leaveField}
                />
              </View>
            </View>

            {(Number(deductions) || 0) > 0 && (
              <View style={styles.reasonRow}>
                {DEDUCTION_REASONS.map((option) => (
                  <Press
                    key={option.value}
                    style={[
                      styles.reasonChip,
                      deductionReason === option.value && styles.reasonChipOn,
                    ]}
                    onPress={() =>
                      setDeductionReason((current) =>
                        current === option.value ? null : option.value,
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.reasonText,
                        deductionReason === option.value && styles.reasonTextOn,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Press>
                ))}
              </View>
            )}

            {(positions.length > 0 || Object.keys(quantities).length > 0) && (
              <>
                <Text style={styles.section}>{t('Продажи')}</Text>
                <View style={styles.card}>
                  {positions.map((position) => (
                    <View key={position.id} style={styles.saleRow}>
                      <View style={styles.saleGrow}>
                        <Text style={styles.saleName}>{position.name}</Text>
                        <Text style={styles.saleMeta}>
                          {money(position.price)} · {position.percentage}%
                        </Text>
                      </View>
                      <Press
                        hitSlop={6}
                        style={styles.saleStep}
                        onPress={() =>
                          setQuantities((have) => {
                            const next = { ...have };
                            const now = (next[position.id] ?? 0) - 1;

                            if (now <= 0) delete next[position.id];
                            else next[position.id] = now;

                            return next;
                          })
                        }
                      >
                        <Ionicons name="remove" size={18} color={palette.text} />
                      </Press>
                      <Text style={styles.saleCount}>{quantities[position.id] ?? 0}</Text>
                      <Press
                        hitSlop={6}
                        style={styles.saleStep}
                        onPress={() =>
                          setQuantities((have) => ({
                            ...have,
                            [position.id]: (have[position.id] ?? 0) + 1,
                          }))
                        }
                      >
                        <Ionicons name="add" size={18} color={palette.text} />
                      </Press>
                    </View>
                  ))}

                  {Object.keys(quantities)
                    .map(Number)
                    .filter((id) => !positions.some((position) => position.id === id))
                    .map((id) => (
                      <View key={id} style={styles.saleRow}>
                        <View style={styles.saleGrow}>
                          <Text style={styles.saleName}>{t('Позиция из архива')}</Text>
                          <Text style={styles.saleMeta}>{t('редактируется на сайте')}</Text>
                        </View>
                        <Text style={styles.saleCount}>{quantities[id]}</Text>
                      </View>
                    ))}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>{t('Заметка')}</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              multiline
              maxLength={500}
              placeholder={t("Что запомнить об этом дне")}
              placeholderTextColor={palette.textSecondary}
              value={note}
              onChangeText={setNote}
              onBlur={leaveField}
            />

            {/* Where the day stands. Taking the button's old job away without
                saying anything would only move the doubt. */}
            <Text style={styles.savedNote}>
              {saveState === 'saving'
                ? t('Сохраняется…')
                : saveState === 'waiting'
                  ? t('Изменения сохраняются сами')
                  : saveState === 'failed' || saveState === 'conflict'
                    ? t('Не сохранилось.')
                    : t('Сохранено')}
            </Text>

            {/* `Press`, not a raw `Pressable`: NativeWind's transform drops the resolved style when `style` is a function… */}
            <Press style={styles.saveButton} onPress={() => void finish()}>
              <Text style={styles.saveText}>{t('Готово')}</Text>
            </Press>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    zones: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    zone: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    zoneOn: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
    saleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
    saleGrow: { flex: 1 },
    saleName: { color: palette.text, fontSize: 14, fontWeight: '600' },
    saleMeta: { color: palette.textSecondary, fontSize: 12, marginTop: 1 },
    saleStep: {
      width: 32,
      height: 32,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.backgroundElement,
    },
    saleCount: {
      color: palette.text,
      fontSize: 15,
      fontWeight: '700',
      minWidth: 22,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    zoneText: { color: palette.textSecondary, fontSize: 13 },
    zoneTextOn: { color: palette.accent, fontWeight: '700' },
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 18, gap: 10 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 21, fontWeight: '800', color: palette.text },
    error: { color: palette.danger },

    worth: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      paddingVertical: 12,
      marginBottom: 2,
    },
    worthHalf: { flex: 1, alignItems: 'center', gap: 1 },
    worthRule: { width: 1, alignSelf: 'stretch', backgroundColor: palette.border },
    worthValue: {
      color: palette.text,
      fontSize: 19,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    worthPlanned: { color: palette.textSecondary },
    worthLabel: {
      color: palette.textSecondary,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    actualRow: { flexDirection: 'row', gap: 8 },
    actualField: { flex: 1 },
    cover: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 12,
      paddingVertical: 9,
      marginTop: 4,
    },
    coverOn: { backgroundColor: palette.danger, borderColor: palette.danger },
    coverText: { color: palette.textSecondary, fontSize: 13, fontWeight: '700' },
    coverTextOn: { color: '#fff' },
    section: { fontSize: 15, fontWeight: '800', color: palette.text, marginTop: 6 },
    sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    saveMark: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    saveWord: { color: palette.textSecondary, fontSize: 12.5 },
    saveWordFailed: { color: palette.danger, fontWeight: '600' },
    closedHint: { color: palette.textSecondary, fontSize: 12, lineHeight: 16 },
    hintText: { color: palette.textSecondary },
    makeFirst: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderColor: palette.accent,
      borderWidth: 1,
      backgroundColor: palette.accentSoft,
      borderRadius: 999,
      paddingVertical: 12,
    },
    makeFirstText: { color: palette.accent, fontSize: 14, fontWeight: '700' },
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
    workedBlock: { gap: 6, borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 2 },
    workedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    workedLabel: { color: palette.text, flexShrink: 1, fontSize: 13.5 },
    workedSwitch: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    workedHint: { color: palette.textSecondary, fontSize: 12 },
    moneyRow: { flexDirection: 'row', gap: 8 },
    moneyField: { flex: 1, gap: 4 },
    reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    reasonChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
    },
    reasonChipOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    reasonText: { color: palette.textSecondary, fontSize: 13, fontWeight: '600' },
    reasonTextOn: { color: '#fff' },
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
    savedNote: {
      color: palette.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      marginTop: 14,
    },
    saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  });
