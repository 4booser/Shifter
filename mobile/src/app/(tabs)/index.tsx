import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DailyBrief } from '@/components/daily-brief';
import { DayPeek } from '@/components/day-peek';
import { MonthGrid, PAGE_HEIGHT } from '@/components/month-grid';
import { MonthJump } from '@/components/month-jump';
import { Brush, brushColour, brushName, brushSymbol, PaintPicker } from '@/components/paint-picker';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import {
  addMonths,
  currentMonth,
  dayLabel,
  monthsBetween,
  monthBounds,
  monthOnly,
  nextDay,
  runsOf,
  sameWeekdaysIn,
  todayKey,
  WEEKDAYS,
  weekdayOf,
  YearMonth,
} from '@/lib/calendar';
import {
  CalendarDayData,
  CalendarEvent,
  DaysResponse,
  DaySave,
  EventSave,
  money,
  ShiftTemplate,
  templateHours,
  toSavePayload,
} from '@/lib/types';
import { LiveShift, useLive } from '@/store/live';
import { ApiError } from '@/lib/api';
import { heldDays, Pending } from '@/lib/outbox';
import { useOutbox } from '@/store/outbox';

/** Three years each way. Further than that and nobody is planning, they are lost. */
const SPAN = 36;
const PAGES = Array.from({ length: SPAN * 2 + 1 }, (_, index) => index);

const monthKeyOf = ({ year, month }: YearMonth) => `${year}-${`${month}`.padStart(2, '0')}`;

interface MonthData {
  days: CalendarDayData[];
  events: CalendarEvent[];
  earned: number;
  planned: number;
  hours: number;
  worked: number;
  aheadDays: number;
}

/**
 * The month, on the platform this app is actually for.
 *
 * Two things drive the whole screen. Months are swiped, not stepped: a chevron
 * asks for a decision and a thumb does not, and moving between months is the
 * single most common thing anybody does here. And the pencil paints — pick a
 * shift, drag across the days you are working, done. Filling a rota used to be
 * one modal per day, which is why nobody ever filled one in past the first week.
 */
export default function CalendarScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const live = useLive((state) => state.live);
  const held = useOutbox((state) => state.pending);
  const refused = useOutbox((state) => state.refused);
  const hydrateOutbox = useOutbox((state) => state.hydrate);
  const holdWrites = useOutbox((state) => state.hold);
  const flushOutbox = useOutbox((state) => state.flush);
  const clearRefused = useOutbox((state) => state.clearRefused);
  const startLive = useLive((state) => state.start);
  const hydrateLive = useLive((state) => state.hydrate);

  // Fixed at mount: the pager's index is an offset from here, and an anchor
  // that moved would slide every page sideways under the finger at midnight.
  const anchor = useRef(currentMonth()).current;
  const pager = useRef<FlatList<number>>(null);
  const sheet = useRef<ScrollView>(null);

  const [index, setIndex] = useState(SPAN);
  const indexAt = useRef(SPAN);
  const [months, setMonths] = useState<Record<string, MonthData>>({});
  const asked = useRef(new Set<string>());
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [picking, setPicking] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [peeking, setPeeking] = useState<string | null>(null);
  const [brush, setBrush] = useState<Brush | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const chosenAt = useRef(new Set<string>());
  const stroke = useRef<'add' | 'remove'>('add');
  const [applying, setApplying] = useState(false);

  const month = addMonths(anchor, index - SPAN);
  const today = todayKey();
  const styles = makeStyles(palette);

  const fetchMonth = useCallback(async (at: YearMonth) => {
    const key = monthKeyOf(at);
    const bounds = monthBounds(at);

    try {
      const response = await api<DaysResponse>(
        `/shifter/v1/days?from=${bounds.from}&to=${bounds.to}`,
      );

      setMonths((was) => ({
        ...was,
        [key]: {
          days: response.days,
          events: response.events ?? [],
          earned: response.total_earned,
          planned: response.planned_earned ?? 0,
          hours: response.hours,
          worked: response.days_worked,
          aheadDays: response.days_planned ?? 0,
        },
      }));
      setError(null);
    } catch {
      // Let it be asked for again rather than leaving a month permanently blank.
      asked.current.delete(key);
      setError('Не дотянулись до сервера.');
    }
  }, []);

  /** The page under the thumb and the two either side of it, so a swipe lands on data. */
  const ensure = useCallback(
    (at: number, force = false) => {
      const going: Promise<void>[] = [];

      for (const delta of [0, 1, -1]) {
        const target = addMonths(anchor, at - SPAN + delta);
        const key = monthKeyOf(target);

        if (!force && asked.current.has(key)) continue;

        asked.current.add(key);
        going.push(fetchMonth(target));
      }

      return Promise.all(going).then(() => undefined);
    },
    [anchor, fetchMonth],
  );

  useEffect(() => {
    void ensure(index);
  }, [index, ensure]);

  // Focus, not mount: returning from the day editor must show the edit.
  useFocusEffect(
    useCallback(() => {
      void hydrateLive();
      asked.current.clear();
      void ensure(indexAt.current, true);

      // Coming back to the screen is the most reliable signal the phone gets
      // that the network might be worth trying again.
      void hydrateOutbox().then(() =>
        flushOutbox().then((sent) => {
          if (sent > 0) void ensure(indexAt.current, true);
        }),
      );

      // Separately and forgivingly: the templates are the pencil's palette and
      // the live shift's rate, and the calendar must not refuse to draw
      // because a second request failed.
      api<ShiftTemplate[]>('/shifter/v1/shifts')
        .then((list) => {
          setTemplates(list);
        })
        .catch(() => undefined);
    }, [hydrateLive, ensure, hydrateOutbox, flushOutbox]),
  );

  const here = months[monthKeyOf(month)];

  // A page shows the neighbouring months' days in its corners, so it reads
  // from all three. The totals above it never do — they are the server's
  // answer for this month, and summing days would quietly disagree with the
  // payslip once overtime or a monthly wage is in play.
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarDayData>();

    for (const delta of [-1, 0, 1]) {
      const data = months[monthKeyOf(addMonths(month, delta))];

      for (const day of data?.days ?? []) map.set(day.date, day);
    }

    return map;
  }, [months, month]);

  const events = useMemo(() => {
    const seen = new Map<number, CalendarEvent>();

    for (const delta of [-1, 0, 1]) {
      const data = months[monthKeyOf(addMonths(month, delta))];

      for (const entry of data?.events ?? []) seen.set(entry.id, entry);
    }

    return [...seen.values()];
  }, [months, month]);

  const waiting = useMemo(() => heldDays(held), [held]);

  const startable = useMemo(() => {
    const plan = byDate.get(today)?.shifts.find((entry) => !entry.worked);

    if (plan === undefined) return null;

    // Only an hourly rate ticks up by the second; a day or a month has no
    // per-second meaning, and inventing one would put a number on screen
    // nobody agreed to.
    const template = templates.find((entry) => entry.id === plan.shift_id);
    const rate =
      template !== undefined && template.salary_period === 'hour'
        ? template.salary_amount
        : null;

    return { ...plan, rate };
  }, [byDate, today, templates]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const at = Math.round(event.nativeEvent.contentOffset.x / width);

    if (at === indexAt.current || at < 0 || at > SPAN * 2) return;

    indexAt.current = at;
    setIndex(at);
  };

  const goTo = (at: number) => {
    const far = Math.abs(at - indexAt.current) > 2;

    indexAt.current = at;
    setIndex(at);
    // Animating a jump of twenty months means watching twenty months go past.
    // Near enough to be a step keeps the animation; a jump is a cut.
    pager.current?.scrollToIndex({ index: at, animated: !far });
  };


  // ---- the pencil ----

  const clearPaint = () => {
    chosenAt.current = new Set();
    setChosen(new Set());
    setBrush(null);
  };

  const onPaint = useCallback((key: string, first: boolean) => {
    const set = chosenAt.current;

    // The cell the finger lands on decides what the whole stroke does. Toggling
    // per cell instead would make a drag back across your own line erase it,
    // which is not what a pencil does.
    if (first) stroke.current = set.has(key) ? 'remove' : 'add';

    if (stroke.current === 'add') {
      if (set.has(key)) return;
      set.add(key);
    } else {
      if (!set.has(key)) return;
      set.delete(key);
    }

    void Haptics.selectionAsync();
    setChosen(new Set(set));
  }, []);

  /**
   * Sends a run of writes, and puts aside whatever the network would not take.
   *
   * The order matters more than the speed: stopping at the first dropped
   * request and holding the rest keeps two edits of one day in the order they
   * were made. A refusal from the server is a different thing and is thrown,
   * because holding a 400 means retrying it forever.
   */
  const post = useCallback(
    async (writes: Omit<Pending, 'id' | 'at'>[]) => {
      const left: Omit<Pending, 'id' | 'at'>[] = [];
      let dropped = false;

      for (const write of writes) {
        if (dropped) {
          left.push(write);
          continue;
        }

        try {
          await api(write.path, { method: write.method, body: write.body ?? undefined });
        } catch (caught) {
          // The server answering "no" is a different thing from never
          // reaching it: only the second is worth holding on to.
          if (caught instanceof ApiError) throw caught;

          dropped = true;
          left.push(write);
        }
      }

      if (left.length > 0) await holdWrites(left);

      return left.length;
    },
    [holdWrites],
  );

  const refresh = useCallback(() => {
    asked.current.clear();

    return ensure(indexAt.current, true);
  }, [ensure]);

  const writeDay = useCallback(
    async (key: string, payload: DaySave) => {
      await post([
        {
          method: 'PUT',
          path: `/shifter/v1/days/${key}`,
          body: payload,
          days: [key],
          label: dayLabel(key),
        },
      ]);
      await refresh();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [post, refresh],
  );

  const apply = async () => {
    if (brush === null || chosen.size === 0) return;

    setApplying(true);
    setError(null);

    const keys = [...chosen].sort();
    const label = `${brushName(brush)} · ${keys.length} ${dayWord(keys.length)}`;
    const writes: Omit<Pending, 'id' | 'at'>[] = [];

    if (brush.kind === 'event') {
      // Contiguous days become one event each: a fortnight of leave reads as
      // "Отпуск, 14 дней" and comes off in one tap rather than fourteen.
      for (const run of runsOf(keys)) {
        const body: EventSave = {
          name: brush.name,
          symbol: brush.symbol,
          colour: brush.colour,
          start_date: run.from,
          end_date: run.to,
          start_time: null,
          end_time: null,
          note: null,
          kind: brush.eventKind,
        };

        writes.push({
          method: 'POST',
          path: '/shifter/v1/events',
          body,
          days: keys.filter((key) => key >= run.from && key <= run.to),
          label,
        });
      }
    } else if (brush.kind === 'shift') {
      // The server has taken a whole stroke in one request since the site
      // learned to drag, and it draws the line between worked and planned
      // itself — behind us is worked, ahead of us is a plan. Twenty separate
      // saves also meant twenty chances for the signal to go.
      writes.push({
        method: 'POST',
        path: '/shifter/v1/days/bulk',
        body: { dates: keys, shift_id: brush.template.id, mode: 'add' },
        days: keys,
        label,
      });
    } else {
      for (const key of keys) {
        const payload: DaySave = toSavePayload(byDate.get(key));

        if (brush.kind === 'erase') {
          if (!payload.shifts.some((entry) => !entry.worked)) continue;

          // The past is not rewritten: a day already worked keeps its shift
          // and the money on it, whatever the eraser is dragged over.
          payload.shifts = payload.shifts.filter((entry) => entry.worked);
        } else if (brush.kind === 'worked') {
          if (!payload.shifts.some((entry) => !entry.worked)) continue;

          // Only what was planned turns over. A day with nothing on it is
          // left alone rather than invented — the pencil says a shift
          // happened, it does not say which one.
          payload.shifts = payload.shifts.map((entry) => ({ ...entry, worked: true }));
        }

        writes.push({
          method: 'PUT',
          path: `/shifter/v1/days/${key}`,
          body: payload,
          days: [key],
          label,
        });
      }

      if (brush.kind === 'erase') {
        // An event only goes if the whole of it was painted over. Rubbing out
        // one day of a fortnight cannot be a request to delete the fortnight.
        const gone = new Set(keys);

        for (const entry of events) {
          let whole = true;

          for (let at = entry.start_date; at <= entry.end_date && whole; at = nextDay(at)) {
            whole = gone.has(at);
          }

          if (whole) {
            writes.push({
              method: 'DELETE',
              path: `/shifter/v1/events/${entry.id}`,
              body: null,
              days: keys,
              label,
            });
          }
        }
      }
    }

    try {
      const kept = await post(writes);

      clearPaint();
      void refresh();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // The bar above already counts the days; this only has to say why they
      // are not on the calendar yet.
      if (kept > 0) setError('Сети нет — сохраним, когда она вернётся.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не сохранилось.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setApplying(false);
    }
  };

  const painted = chosen.size;

  // "Каждый вторник и четверг" is the commonest shape a rota takes, and it is
  // the one the pencil is worst at: eight separate touches spread across the
  // month. One chip does the whole of it.
  const spread = useMemo(() => {
    if (brush === null || chosen.size === 0) return null;

    const rest = sameWeekdaysIn(month, chosen).filter((key) => !chosen.has(key));

    if (rest.length === 0) return null;

    const names = [...new Set([...chosen].map(weekdayOf))].sort().map((at) => WEEKDAYS[at]);

    return { keys: rest, label: `+ все ${names.join(', ')}` };
  }, [brush, chosen, month]);

  const chooseAll = (keys: string[]) => {
    const next = new Set(chosen);

    for (const key of keys) next.add(key);

    chosenAt.current = next;
    setChosen(next);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // What this stroke is about to do, before it does it. Painting a fortnight
  // of evenings is a decision about money, and the number that makes it one
  // was previously only visible after the fact.
  const preview = useMemo(() => {
    if (brush === null) return null;

    const keys = [...chosen];

    if (brush.kind === 'event') {
      return {
        left: `${keys.length}`,
        leftLabel: dayWord(keys.length),
        right: null,
        note: 'События не считаются деньгами — они только занимают день.',
      };
    }

    // Both of these act on the plans a day already has, so they count the same
    // way: how many of the painted days actually have one.
    if (brush.kind === 'erase' || brush.kind === 'worked') {
      const hit = keys.filter((key) =>
        (byDate.get(key)?.shifts ?? []).some((entry) => !entry.worked),
      );
      const amount = hit.reduce((sum, key) => sum + (byDate.get(key)?.planned ?? 0), 0);
      const erasing = brush.kind === 'erase';

      return {
        left: `${hit.length}`,
        leftLabel: hit.length === keys.length ? dayWord(hit.length) : `из ${keys.length}`,
        right: amount > 0 ? `${erasing ? '−' : '+'} ${money(amount)}` : null,
        note: erasing
          ? 'Отработанные дни и их деньги останутся на месте.'
          : 'Плановые смены этих дней станут отработанными.',
      };
    }

    const adds = keys.filter(
      (key) => !(byDate.get(key)?.shifts ?? []).some((entry) => entry.shift_id === brush.template.id),
    );
    const hours = templateHours(brush.template) * adds.length;
    const hourly = brush.template.salary_period === 'hour';
    // The server files a day behind us as worked and one ahead as a plan.
    // Saying so before the stroke lands is the difference between a surprise
    // and a decision.
    const behind = adds.filter((key) => key <= today).length;

    return {
      left: `${adds.length}`,
      leftLabel: adds.length === keys.length ? dayWord(adds.length) : `из ${keys.length}`,
      right: hourly && brush.template.salary_amount > 0
        ? `+ ${money(hours * brush.template.salary_amount)}`
        : null,
      note:
        adds.length === 0
          ? 'Эти дни уже с этой сменой'
          : behind === 0
            ? `Примерно ${Math.round(hours)} ч в план`
            : behind === adds.length
              ? 'Эти дни уже прошли — отметятся отработанными'
              : `${behind} ${dayWord(behind)} отметятся отработанными, остальные — в план`,
    };
  }, [brush, chosen, byDate, today]);

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={sheet}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        scrollEnabled={brush === null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void refresh().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <View style={styles.headerRow}>
          <Pressable
            style={styles.headerText}
            onPress={() => setJumping(true)}
            accessibilityLabel="Перейти к другому месяцу"
          >
            <Text style={styles.month}>{monthOnly(month)}</Text>
            <Text style={styles.year}>{month.year}</Text>
            <Ionicons name="chevron-down" size={15} color={palette.textSecondary} />
          </Pressable>

          {index !== SPAN && (
            <Pressable style={styles.todayChip} onPress={() => goTo(SPAN)}>
              <Ionicons
                name={index > SPAN ? 'arrow-back' : 'arrow-forward'}
                size={13}
                color={palette.accent}
              />
              <Text style={styles.todayChipText}>Сегодня</Text>
            </Pressable>
          )}

          <Pressable onPress={() => router.push('/import')} hitSlop={8}>
            <Ionicons name="camera-outline" size={22} color={palette.textSecondary} />
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
            <Ionicons name="settings-outline" size={21} color={palette.textSecondary} />
          </Pressable>
        </View>

        {brush === null && (
        <View style={styles.stats}>
          <Stat
            styles={styles}
            value={money(here?.earned ?? 0)}
            label="заработано"
            extra={(here?.planned ?? 0) > 0 ? `+ ${money(here!.planned)} впереди` : null}
          />
          <Stat
            styles={styles}
            value={`${here?.worked ?? 0}`}
            label="смен"
            extra={(here?.aheadDays ?? 0) > 0 ? `+ ${here!.aheadDays} в плане` : null}
          />
          <Stat styles={styles} value={`${Math.round(here?.hours ?? 0)}`} label="часов" extra={null} />
        </View>
        )}

        {error !== null && <Text style={styles.error}>{error}</Text>}

        {held.length > 0 && (
          <Pressable
            style={styles.heldBar}
            onPress={() => {
              void flushOutbox().then((sent) => {
                if (sent > 0) void refresh();
              });
            }}
          >
            <Ionicons name="cloud-offline-outline" size={17} color={palette.textSecondary} />
            <Text style={styles.heldText}>
              {waiting.size} {dayWord(waiting.size)} {waiting.size === 1 ? 'ждёт' : 'ждут'} отправки
            </Text>
            <Text style={styles.heldAction}>Отправить</Text>
          </Pressable>
        )}

        {refused > 0 && (
          <Pressable style={styles.refusedBar} onPress={clearRefused}>
            <Ionicons name="alert-circle-outline" size={17} color={palette.danger} />
            <Text style={styles.refusedText}>
              Сервер не принял {refused} {changeWord(refused)}. Проверьте эти дни вручную.
            </Text>
          </Pressable>
        )}

        <FlatList
          ref={pager}
          data={PAGES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // A stroke must not turn into a page turn: while the pencil is out,
          // sideways belongs to the pencil.
          scrollEnabled={brush === null}
          initialScrollIndex={SPAN}
          getItemLayout={(_, at) => ({ length: width, offset: width * at, index: at })}
          keyExtractor={(item) => `${item}`}
          onScroll={onScroll}
          scrollEventThrottle={16}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          style={{ width, height: PAGE_HEIGHT, marginHorizontal: -14 }}
          renderItem={({ item }) => (
            <View style={{ width }}>
              <MonthGrid
                month={addMonths(anchor, item - SPAN)}
                days={byDate}
                events={events}
                today={today}
                held={waiting}
                palette={palette}
                painting={brush !== null}
                selected={chosen}
                paint={
                  brush === null
                    ? null
                    : { colour: brushColour(brush, palette), symbol: brushSymbol(brush) }
                }
                onPaint={onPaint}
                onOpen={setPeeking}
              />
            </View>
          )}
        />

        <Text style={styles.hint}>
          {brush === null
            ? 'Свайпайте месяцы, тапайте день. Карандаш закрашивает сразу несколько.'
            : 'Проведите пальцем по дням — они закрасятся. Ещё раз — снимется.'}
        </Text>

        {brush !== null && painted > 0 && (
          <View style={styles.quickRow}>
            {spread !== null && (
              <Pressable style={styles.quick} onPress={() => chooseAll(spread.keys)}>
                <Text style={styles.quickText}>{spread.label}</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.quick}
              onPress={() => {
                chosenAt.current = new Set();
                setChosen(new Set());
              }}
            >
              <Text style={styles.quickText}>Снять всё</Text>
            </Pressable>
          </View>
        )}

        {preview !== null && painted > 0 && (
          <View style={styles.preview}>
            <View style={styles.previewHalf}>
              <Text style={styles.previewValue}>{preview.left}</Text>
              <Text style={styles.previewLabel}>{preview.leftLabel}</Text>
            </View>

            {preview.right !== null && (
              <>
                <View style={styles.previewRule} />
                <View style={styles.previewHalf}>
                  <Text style={[styles.previewValue, { color: brushColour(brush!, palette) }]}>
                    {preview.right}
                  </Text>
                  <Text style={styles.previewLabel}>
                    {brush!.kind === 'shift' ? 'по ставке' : 'в заработке'}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {preview !== null && painted > 0 && (
          <Text style={styles.previewNote}>{preview.note}</Text>
        )}

        {brush === null && live !== null && (
          <Pressable style={styles.liveCard} onPress={() => router.push('/live')}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              Смена идёт: {live.symbol ?? '🕐'} {live.name} с{' '}
              {new Date(live.startedAt).toTimeString().slice(0, 5)}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={palette.accent} />
          </Pressable>
        )}

        {brush === null && live === null && startable !== null && (
          <Pressable
            style={styles.startButton}
            onPress={() => {
              const shift: LiveShift = {
                date: today,
                shiftId: startable.shift_id,
                name: startable.name,
                symbol: startable.symbol,
                startedAt: new Date().toISOString(),
                hourlyRate: startable.rate,
                plannedEnd: startable.end_time,
              };

              startLive(shift);
              router.push('/live');
            }}
          >
            <Ionicons name="play" size={16} color="#fff" />
            <Text style={styles.startText}>
              Начать смену · {startable.symbol ?? ''} {startable.name}
            </Text>
          </Pressable>
        )}

        {brush === null && (
          <DailyBrief palette={palette} onOpen={() => router.push('/assistant')} />
        )}
      </ScrollView>

      {brush === null ? (
        <Pressable
          style={[styles.pencil, { bottom: insets.bottom + 22 }]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPicking(true);
          }}
          accessibilityLabel="Закрасить дни сменой или событием"
        >
          <Ionicons name="pencil" size={22} color="#fff" />
        </Pressable>
      ) : (
        <View style={[styles.bar, { bottom: insets.bottom + 14 }]}>
          <View style={[styles.barChip, { backgroundColor: brushColour(brush, palette) }]}>
            <Text style={styles.barChipMark}>{brushSymbol(brush) ?? '×'}</Text>
          </View>

          <View style={styles.barText}>
            <Text style={styles.barName} numberOfLines={1}>{brushName(brush)}</Text>
            <Text style={styles.barMeta}>
              {painted === 0 ? 'Выберите дни' : `${painted} ${dayWord(painted)}`}
            </Text>
          </View>

          <Pressable style={styles.barGhost} onPress={clearPaint} hitSlop={6}>
            <Ionicons name="close" size={18} color={palette.textSecondary} />
          </Pressable>

          <Pressable
            style={[styles.barDone, painted === 0 && styles.barDoneOff]}
            disabled={painted === 0 || applying}
            onPress={() => void apply()}
          >
            {applying
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.barDoneText}>Готово</Text>}
          </Pressable>
        </View>
      )}

      <DayPeek
        date={peeking}
        day={peeking === null ? undefined : byDate.get(peeking)}
        events={events}
        templates={templates}
        palette={palette}
        onWrite={writeDay}
        onOpen={(key) => {
          setPeeking(null);
          router.push(`/day/${key}`);
        }}
        onClose={() => setPeeking(null)}
      />

      <MonthJump
        open={jumping}
        at={month}
        palette={palette}
        reach={{ first: addMonths(anchor, -SPAN), last: addMonths(anchor, SPAN) }}
        onPick={(picked) => {
          setJumping(false);
          goTo(SPAN + monthsBetween(anchor, picked));
        }}
        onClose={() => setJumping(false)}
      />

      <PaintPicker
        open={picking}
        templates={templates}
        events={events}
        palette={palette}
        onPick={(picked) => {
          setPicking(false);
          chosenAt.current = new Set();
          setChosen(new Set());
          setBrush(picked);
          sheet.current?.scrollTo({ y: 0, animated: true });
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }}
        onClose={() => setPicking(false)}
        onManage={() => {
          setPicking(false);
          router.push('/templates');
        }}
      />
    </View>
  );
}

function Stat({
  styles,
  value,
  label,
  extra,
}: {
  styles: ReturnType<typeof makeStyles>;
  value: string;
  label: string;
  extra: string | null;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
      {extra !== null && <Text style={styles.statExtra} numberOfLines={1}>{extra}</Text>}
    </View>
  );
}

const changeWord = (count: number) => {
  const tail = count % 10;
  const teen = count % 100;

  if (teen >= 11 && teen <= 14) return 'изменений';
  if (tail === 1) return 'изменение';
  if (tail >= 2 && tail <= 4) return 'изменения';

  return 'изменений';
};

const dayWord = (count: number) => {
  const tail = count % 10;
  const teen = count % 100;

  if (teen >= 11 && teen <= 14) return 'дней';
  if (tail === 1) return 'день';
  if (tail >= 2 && tail <= 4) return 'дня';

  return 'дней';
};

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    // The tab bar floats over the scroll view, so the last card needs
    // room of its own or it reads as cut off.
    content: { paddingHorizontal: 14, paddingBottom: 96, gap: 12 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    headerText: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 7 },
    month: { fontSize: 27, fontWeight: '800', color: palette.text, letterSpacing: -0.7 },
    year: { fontSize: 16, fontWeight: '600', color: palette.textSecondary },
    todayChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: palette.accentSoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    todayChipText: { color: palette.accent, fontWeight: '700', fontSize: 12.5 },

    stats: {
      flexDirection: 'row',
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      paddingVertical: 12,
    },
    stat: { flex: 1, alignItems: 'center', gap: 1, paddingHorizontal: 4 },
    statValue: {
      color: palette.text,
      fontSize: 19,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.4,
    },
    statLabel: {
      color: palette.textSecondary,
      fontSize: 10.5,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    statExtra: { color: palette.accent, fontSize: 11, fontWeight: '600', marginTop: 1 },

    error: { color: palette.danger },

    heldBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    heldText: { flex: 1, color: palette.textSecondary, fontSize: 12.5 },
    heldAction: { color: palette.accent, fontWeight: '700', fontSize: 12.5 },
    refusedBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: palette.danger,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    refusedText: { flex: 1, color: palette.danger, fontSize: 12.5 },

    quickRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
    quick: {
      backgroundColor: palette.accentSoft,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    quickText: { color: palette.accent, fontWeight: '700', fontSize: 13 },

    preview: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 18,
      gap: 18,
    },
    previewHalf: { alignItems: 'center', gap: 1, minWidth: 78 },
    previewRule: { width: 1, alignSelf: 'stretch', backgroundColor: palette.border },
    previewValue: {
      color: palette.text,
      fontSize: 22,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.4,
    },
    previewLabel: {
      color: palette.textSecondary,
      fontSize: 10.5,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    previewNote: {
      color: palette.textSecondary,
      fontSize: 12.5,
      textAlign: 'center',
      paddingHorizontal: 24,
      lineHeight: 17,
    },
    hint: {
      color: palette.textSecondary,
      fontSize: 12.5,
      textAlign: 'center',
      lineHeight: 17,
      paddingHorizontal: 10,
    },

    liveCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.accentSoft,
      borderWidth: 1,
      borderColor: palette.accent,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent },
    liveText: { color: palette.text, fontWeight: '600', flex: 1, fontSize: 13.5 },
    startButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: palette.accent,
      borderRadius: 16,
      paddingVertical: 14,
    },
    startText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },

    pencil: {
      position: 'absolute',
      right: 18,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    bar: {
      position: 'absolute',
      left: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 9,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    barChip: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    barChipMark: { fontSize: 17, color: '#fff' },
    barText: { flex: 1, gap: 1 },
    barName: { color: palette.text, fontSize: 14.5, fontWeight: '700' },
    barMeta: { color: palette.textSecondary, fontSize: 12 },
    barGhost: { padding: 6 },
    barDone: {
      backgroundColor: palette.accent,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingVertical: 10,
      minWidth: 92,
      alignItems: 'center',
    },
    barDoneOff: { opacity: 0.4 },
    barDoneText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  });
