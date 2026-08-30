import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMono } from '@/store/mono';
import { chargesAhead, recurring } from '@/lib/mono-insights';

import { BriefChart } from '@/components/brief-chart';
import { DailyBrief } from '@/components/daily-brief';
import { DayPeek } from '@/components/day-peek';
import { Floating } from '@/components/floating';
import { FirstShift } from '@/components/first-shift';
import { MonthGrid, PAGE_HEIGHT } from '@/components/month-grid';
import { MonthJump } from '@/components/month-jump';
import { Appear, Press } from '@/components/motion';
import { Brush, brushColour, brushName, brushSymbol, PaintPicker } from '@/components/paint-picker';
import { Colors, Palette } from '@/constants/theme';
import { todayIn, useWidget } from '@/lib/use-widget';
import { api } from '@/lib/api';
import {
  addMonths,
  currentMonth,
  dayLabel,
  monthsBetween,
  monthBounds,
  monthLabel,
  monthOnly,
  nextDay,
  runsOf,
  sameWeekdaysIn,
  todayKey,
  weekOf,
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
  EventTemplate,
  money,
  ShiftTemplate,
  templateHours,
  toSavePayload,
} from '@/lib/types';
import { WorkPlace } from '@/lib/places';
import { forgotten, LiveShift, useLive } from '@/store/live';
import { useAutoStart } from '@/store/autostart';
import { dueAutoStart } from '@/lib/autostart';
import { ApiError } from '@/lib/api';
import { heldDays, Pending } from '@/lib/outbox';
import { useOutbox } from '@/store/outbox';
import { t } from '@/lib/i18n';

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
  const [eventTypes, setEventTypes] = useState<EventTemplate[]>([]);
  const [places, setPlaces] = useState<WorkPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [picking, setPicking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [peeking, setPeeking] = useState<string | null>(null);
  const [brush, setBrush] = useState<Brush | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const chosenAt = useRef(new Set<string>());
  const stroke = useRef<'add' | 'remove'>('add');
  const [applying, setApplying] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [undoing, setUndoing] = useState(false);

  const month = addMonths(anchor, index - SPAN);
  const today = todayKey();
  // The bank's rhythm on the calendar: days a standing charge usually
  // lands, projected with the same mirrored library the web grid uses.
  const bankItems = useMono((state) => state.items);
  const hydrateMono = useMono((state) => state.hydrate);

  useEffect(() => {
    void hydrateMono();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paymentDays = useMemo(() => {
    if (bankItems.length === 0) return new Set<string>();

    const back = new Date(Date.now() - 62 * 86400000).toISOString().slice(0, 10);
    const standing = recurring(bankItems, back, today);

    return new Set(chargesAhead(standing, today, 62).map((charge) => charge.on));
  }, [bankItems, today]);
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
      setError(t('Не дотянулись до сервера.'));
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
        .then(setTemplates)
        .catch(() => undefined);

      // The other half of the pencil's palette: English on Tuesdays, driving
      // on Saturdays — the things a week is made of that are not shifts.
      api<EventTemplate[]>('/shifter/v1/event-templates')
        .then(setEventTypes)
        .catch(() => undefined);

      // Only for the weekly threshold, which is a property of the place. A
      // calendar that cannot say "you are at 38 of 40" lets somebody find out
      // on the payslip.
      api<WorkPlace[]>('/shifter/v1/locations')
        .then(setPlaces)
        .catch(() => undefined);
    }, [hydrateLive, ensure, hydrateOutbox, flushOutbox]),
  );

  const here = months[monthKeyOf(month)];

  // Everything the widget is allowed to know, written from the figures this
  // screen has already computed — so what somebody sees on their home screen
  // and what they see when they open the app cannot disagree.
  //
  // Only from the month that actually contains today: swiping to March must
  // not leave a widget claiming March is the current month.
  const thisMonth = months[monthKeyOf(currentMonth())];

  useWidget({
    today: todayIn(thisMonth?.days ?? []),
    days: thisMonth?.days ?? [],
    monthLabel: monthLabel(currentMonth()),
    monthEarned: thisMonth?.earned ?? 0,
    monthGoal: null,
    monthDays: thisMonth?.worked ?? 0,
  });

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

  /**
   * Hours already worked this week, against the place's own threshold.
   *
   * The site has warned about overtime before the line for months; the phone,
   * which is what somebody has in their hand when a manager asks them to stay
   * on, said nothing at all.
   */
  const week = useMemo(() => {
    const keys = weekOf(today);
    const hours = keys.reduce((sum, key) => sum + (byDate.get(key)?.hours ?? 0), 0);

    if (hours <= 0) return null;

    // The lowest threshold among the places actually worked this week: two
    // jobs with different rules is not a reason to warn about neither.
    const worked = new Set(
      keys.flatMap((key) => (byDate.get(key)?.shifts ?? []).map((shift) => shift.shift_id)),
    );
    const ids = new Set(
      templates.filter((one) => worked.has(one.id)).map((one) => one.location_id),
    );
    const limits = places
      .filter((place) => ids.has(place.id) && place.overtime_weekly_hours > 0)
      .map((place) => place.overtime_weekly_hours);

    return { hours, limit: limits.length > 0 ? Math.min(...limits) : null };
  }, [byDate, today, templates, places]);

  // The shifts that start themselves, checked on focus and on a slow tick.
  //
  // A tick rather than a timer to the exact second: the app may be closed at
  // 18:00 and opened at 18:20, and the same check answers both — the decision
  // logic backdates the clock to the chosen hour either way.
  const autoRules = useAutoStart((state) => state.rules);
  const autoFired = useAutoStart((state) => state.fired);
  const hydrateAuto = useAutoStart((state) => state.hydrate);
  const markFired = useAutoStart((state) => state.markFired);

  useEffect(() => {
    void hydrateAuto();
  }, [hydrateAuto]);

  useEffect(() => {
    const check = () => {
      const planned = (byDate.get(today)?.shifts ?? [])
        .filter((entry) => !entry.worked)
        .map((entry) => ({ shiftId: entry.shift_id }));

      const due = dueAutoStart({
        rules: autoRules,
        planned,
        liveRunning: useLive.getState().live !== null,
        firedToday: autoFired.day === today ? autoFired.shiftIds : [],
        now: Date.now(),
        today,
      });

      if (due === null) return;

      const plan = byDate.get(today)?.shifts.find((entry) => entry.shift_id === due.shiftId);
      const template = templates.find((entry) => entry.id === due.shiftId);

      if (plan === undefined) return;

      // Fired before started, so a crash between the two cannot loop the
      // start — the worse failure is starting twice, not missing once.
      markFired(due.shiftId, today);

      startLive({
        date: today,
        shiftId: plan.shift_id,
        name: plan.name,
        symbol: plan.symbol,
        // The chosen hour, not the moment the app opened: an auto-start is a
        // statement about when work began.
        startedAt: due.startedAt,
        hourlyRate:
          template !== undefined && template.salary_period === 'hour'
            ? template.salary_amount
            : null,
        plannedStart: plan.start_time,
        plannedEnd: plan.end_time,
      });
    };

    check();

    const tick = setInterval(check, 30_000);

    return () => clearInterval(tick);
  }, [autoRules, autoFired, byDate, today, templates, startLive, markFired]);

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

    setUndo(null);
    indexAt.current = at;
    setIndex(at);
  };

  const goTo = (at: number) => {
    const far = Math.abs(at - indexAt.current) > 2;

    setUndo(null);
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
      const answers: unknown[] = [];
      let dropped = false;

      for (const write of writes) {
        if (dropped) {
          left.push(write);
          continue;
        }

        try {
          answers.push(
            await api(write.path, { method: write.method, body: write.body ?? undefined }),
          );
        } catch (caught) {
          // The server answering "no" is a different thing from never
          // reaching it: only the second is worth holding on to.
          if (caught instanceof ApiError) throw caught;

          dropped = true;
          left.push(write);
        }
      }

      if (left.length > 0) await holdWrites(left);

      return { kept: left.length, answers };
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
    // What these days looked like before the stroke, captured before anything
    // is mutated. It is the whole of the undo for the brushes that change a
    // day rather than add to it.
    const before: { key: string; payload: DaySave }[] = [];
    const wiped: EventSave[] = [];

    if (brush.kind === 'event') {
      // Contiguous days become one event each: a fortnight of leave reads as
      // "Отпуск, 14 дней" and comes off in one tap rather than fourteen.
      //
      // Unless it costs. Two lessons on Monday and Tuesday are two lessons at
      // 400 apiece, not one two-day event at 400 — so a priced brush writes a
      // row per day and the arithmetic stays what anybody means by it.
      const runs = (brush.cost ?? 0) > 0
        ? keys.map((key) => ({ from: key, to: key }))
        : runsOf(keys);

      for (const run of runs) {
        const body: EventSave = {
          name: brush.name,
          symbol: brush.symbol,
          colour: brush.colour,
          start_date: run.from,
          end_date: run.to,
          start_time: brush.startTime ?? null,
          end_time: brush.endTime ?? null,
          note: null,
          kind: brush.eventKind,
          cost: brush.cost ?? 0,
          template_id: brush.templateId ?? null,
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

        before.push({ key, payload: toSavePayload(byDate.get(key)) });

        if (brush.kind === 'erase') {
          if (!payload.shifts.some((entry) => !entry.worked)) {
            before.pop();
            continue;
          }

          // The past is not rewritten: a day already worked keeps its shift
          // and the money on it, whatever the eraser is dragged over.
          payload.shifts = payload.shifts.filter((entry) => entry.worked);
        } else if (brush.kind === 'worked') {
          if (!payload.shifts.some((entry) => !entry.worked)) {
            before.pop();
            continue;
          }

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
            wiped.push({
              name: entry.name,
              symbol: entry.symbol,
              colour: entry.colour,
              start_date: entry.start_date,
              end_date: entry.end_date,
              start_time: entry.start_time,
              end_time: entry.end_time,
              note: entry.note,
              kind: entry.kind,
            });
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
      const { kept, answers } = await post(writes);

      clearPaint();
      void refresh();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Offered only when the whole stroke went. Undoing something still
      // sitting in the queue would mean unpicking the queue, and a button
      // that sometimes means one thing and sometimes another is worse than
      // no button.
      setUndo(kept > 0 ? null : undoFor(brush, keys, before, wiped, answers, label));

      // The bar above already counts the days; this only has to say why they
      // are not on the calendar yet.
      if (kept > 0) setError(t('Сети нет — сохраним, когда она вернётся.'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Не сохранилось.'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setApplying(false);
    }
  };

  const takeBack = async () => {
    if (undo === null) return;

    setUndoing(true);

    try {
      await post(writesToUndo(undo));
      setUndo(null);
      void refresh();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Не отменилось.'));
    } finally {
      setUndoing(false);
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

    return { keys: rest, label: `+ ${t('все')} ${names.join(', ')}` };
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
      // A lesson at 400 costs 400 each time it comes round, so the bar shows
      // what the whole stroke will cost — and marks it as money leaving.
      const each = brush.cost ?? 0;

      return {
        left: `${keys.length}`,
        leftLabel: dayWord(keys.length),
        right: each > 0 ? `− ${money(each * keys.length)}` : null,
        note:
          each > 0
            ? t('Трата считается отдельно — из заработка не вычитается.')
            : t('События не считаются деньгами — они только занимают день.'),
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
        leftLabel: hit.length === keys.length ? dayWord(hit.length) : `${t('из')} ${keys.length}`,
        right: amount > 0 ? `${erasing ? '−' : '+'} ${money(amount)}` : null,
        note: erasing
          ? t('Отработанные дни и их деньги останутся на месте.')
          : t('Плановые смены этих дней станут отработанными.'),
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
      leftLabel: adds.length === keys.length ? dayWord(adds.length) : `${t('из')} ${keys.length}`,
      right: hourly && brush.template.salary_amount > 0
        ? `+ ${money(hours * brush.template.salary_amount)}`
        : null,
      note:
        adds.length === 0
          ? t('Эти дни уже с этой сменой')
          : behind === 0
            ? `${t('Примерно')} ${Math.round(hours)} ${t('ч в план')}`
            : behind === adds.length
              ? t('Эти дни уже прошли — отметятся отработанными')
              : `${behind} ${dayWord(behind)} ${t('отметятся отработанными, остальные — в план')}`,
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
          <Press
            style={styles.headerText}
            onPress={() => setJumping(true)}
            accessibilityLabel={t("Перейти к другому месяцу")}
          >
            <Text style={styles.month}>{monthOnly(month)}</Text>
            <Text style={styles.year}>{month.year}</Text>
            <Ionicons name="chevron-down" size={15} color={palette.textSecondary} />
          </Press>

          {index !== SPAN && (
            <Press style={styles.todayChip} onPress={() => goTo(SPAN)}>
              <Ionicons
                name={index > SPAN ? 'arrow-back' : 'arrow-forward'}
                size={13}
                color={palette.accent}
              />
              <Text style={styles.todayChipText}>{t('Сегодня')}</Text>
            </Press>
          )}

          <Press onPress={() => router.push('/search')} hitSlop={8}>
            <Ionicons name="search" size={21} color={palette.textSecondary} />
          </Press>
          <Press onPress={() => router.push('/import')} hitSlop={8}>
            <Ionicons name="camera-outline" size={22} color={palette.textSecondary} />
          </Press>
          <Press onPress={() => router.push('/settings')} hitSlop={8}>
            <Ionicons name="settings-outline" size={21} color={palette.textSecondary} />
          </Press>
        </View>

        {brush === null && templates.length === 0 && here !== undefined && (
          <Press style={styles.begin} onPress={() => setStarting(true)}>
            <Text style={styles.beginMark}>🍸</Text>
            <View style={styles.beginText}>
              <Text style={styles.beginTitle}>{t('Начните со своей смены')}</Text>
              <Text style={styles.beginBody}>{t('Когда вы работаете и сколько платят — дальше календарь считает сам.')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.accent} />
          </Press>
        )}

        {brush === null && templates.length > 0 && (
        <Appear>
        <View style={styles.stats}>
          <Stat
            styles={styles}
            value={money(here?.earned ?? 0)}
            label={t("заработано")}
            extra={(here?.planned ?? 0) > 0 ? `+ ${money(here!.planned)} ${t('впереди')}` : null}
          />
          <Stat
            styles={styles}
            value={`${here?.worked ?? 0}`}
            label={t("смен")}
            extra={(here?.aheadDays ?? 0) > 0 ? `+ ${here!.aheadDays} ${t('в плане')}` : null}
          />
          <Stat styles={styles} value={`${Math.round(here?.hours ?? 0)}`} label={t("часов")} extra={null} />
        </View>
        </Appear>
        )}

        {error !== null && <Text style={styles.error}>{error}</Text>}

        {held.length > 0 && (
          <Press
            style={styles.heldBar}
            onPress={() => {
              void flushOutbox().then((sent) => {
                if (sent > 0) void refresh();
              });
            }}
          >
            <Ionicons name="cloud-offline-outline" size={17} color={palette.textSecondary} />
            <Text style={styles.heldText}>
              {waiting.size} {dayWord(waiting.size)} {waiting.size === 1 ? t('ждёт') : t('ждут')} отправки
            </Text>
            <Text style={styles.heldAction}>{t('Отправить')}</Text>
          </Press>
        )}

        {refused > 0 && (
          <Press style={styles.refusedBar} onPress={clearRefused}>
            <Ionicons name="alert-circle-outline" size={17} color={palette.danger} />
            <Text style={styles.refusedText}>
              Сервер не принял {refused} {changeWord(refused)}. Проверьте эти дни вручную.
            </Text>
          </Press>
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
                paymentDays={paymentDays}
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
            ? t('Свайпайте месяцы, тапайте день. Карандаш закрашивает сразу несколько.') + ' ◆'
            : t('Проведите пальцем по дням — они закрасятся. Ещё раз — снимется.')}
        </Text>

        {brush !== null && painted > 0 && (
          <View style={styles.quickRow}>
            {spread !== null && (
              <Press style={styles.quick} onPress={() => chooseAll(spread.keys)}>
                <Text style={styles.quickText}>{spread.label}</Text>
              </Press>
            )}
            <Press
              style={styles.quick}
              onPress={() => {
                chosenAt.current = new Set();
                setChosen(new Set());
              }}
            >
              <Text style={styles.quickText}>{t('Снять всё')}</Text>
            </Press>
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
                    {brush!.kind === 'shift' ? t('по ставке') : t('в заработке')}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {preview !== null && painted > 0 && (
          <Text style={styles.previewNote}>{preview.note}</Text>
        )}

        {brush === null && week !== null && week.limit !== null && (
          <Appear index={1}>
            <View
              style={[
                styles.week,
                week.hours >= week.limit && styles.weekOver,
                week.hours >= week.limit * 0.9 && week.hours < week.limit && styles.weekNear,
              ]}
            >
              <Ionicons
                name={week.hours >= week.limit ? 'alert-circle' : 'time-outline'}
                size={17}
                color={week.hours >= week.limit ? palette.danger : palette.textSecondary}
              />
              <Text style={styles.weekText}>
                {t('На этой неделе')} {`${Math.round(week.hours * 10) / 10}`.replace('.', ',')} {t('из')}{' '}
                {week.limit} {t('ч')}
                {week.hours >= week.limit
                  ? ` · ${t('дальше идут сверхурочные')}`
                  : week.hours >= week.limit * 0.9
                    ? ` · ${t('норма почти вышла')}`
                    : ''}
              </Text>
            </View>
          </Appear>
        )}

        {brush === null && live !== null && (
          <Appear index={1}>
          <Press
            style={[styles.liveCard, forgotten(live, Date.now()) && styles.liveCardOverdue]}
            onPress={() => router.push('/live')}
          >
            <View style={[styles.liveDot, forgotten(live, Date.now()) && { backgroundColor: palette.danger }]} />
            <Text style={styles.liveText}>
              {forgotten(live, Date.now())
                ? `${t('Смена всё ещё идёт')} — ${t('план кончился в')} ${live.plannedEnd.slice(0, 5)}`
                : `Смена идёт: ${live.symbol ?? '🕐'} ${live.name} с ${new Date(live.startedAt).toTimeString().slice(0, 5)}`}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={palette.accent} />
          </Press>
          </Appear>
        )}

        {brush === null && live === null && startable !== null && (
          <Press
            style={styles.startButton}
            onPress={() => {
              const shift: LiveShift = {
                date: today,
                shiftId: startable.shift_id,
                name: startable.name,
                symbol: startable.symbol,
                startedAt: new Date().toISOString(),
                hourlyRate: startable.rate,
                plannedStart: startable.start_time,
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
          </Press>
        )}

        {brush === null && (
          <Appear index={2}>
            <DailyBrief palette={palette} onOpen={() => router.push('/assistant')} />
            <BriefChart palette={palette} days={thisMonth?.days ?? []} />
          </Appear>
        )}
      </ScrollView>

      {brush === null && undo !== null && (
        <Floating palette={palette} style={[styles.bar, { bottom: insets.bottom + 14 }]}>
          <Ionicons name="checkmark-circle" size={22} color={palette.good} />
          <Text style={styles.barName} numberOfLines={1}>{undo.label}</Text>
          <Press style={styles.barGhost} onPress={() => setUndo(null)} hitSlop={6}>
            <Ionicons name="close" size={18} color={palette.textSecondary} />
          </Press>
          <Press
            style={styles.barDone}
            disabled={undoing}
            onPress={() => void takeBack()}
          >
            {undoing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.barDoneText}>{t('Отменить')}</Text>}
          </Press>
        </Floating>
      )}

      {brush === null ? (
        <Press
          style={[styles.pencil, { bottom: insets.bottom + (undo === null ? 22 : 84) }]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setUndo(null);
            setPicking(true);
          }}
          accessibilityLabel={t("Закрасить дни сменой или событием")}
        >
          <Ionicons name="pencil" size={22} color="#fff" />
        </Press>
      ) : (
        <Floating palette={palette} style={[styles.bar, { bottom: insets.bottom + 14 }]}>
          <View style={[styles.barChip, { backgroundColor: brushColour(brush, palette) }]}>
            <Text style={styles.barChipMark}>{brushSymbol(brush) ?? '×'}</Text>
          </View>

          <View style={styles.barText}>
            <Text style={styles.barName} numberOfLines={1}>{brushName(brush)}</Text>
            <Text style={styles.barMeta}>
              {painted === 0 ? t('Выберите дни') : `${painted} ${dayWord(painted)}`}
            </Text>
          </View>

          <Press style={styles.barGhost} onPress={clearPaint} hitSlop={6}>
            <Ionicons name="close" size={18} color={palette.textSecondary} />
          </Press>

          <Press
            style={[styles.barDone, painted === 0 && styles.barDoneOff]}
            disabled={painted === 0 || applying}
            onPress={() => void apply()}
          >
            {applying
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.barDoneText}>{t('Готово')}</Text>}
          </Press>
        </Floating>
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

      <FirstShift
        open={starting}
        palette={palette}
        onDone={(template) => {
          setStarting(false);
          setTemplates([template]);
          // Straight into the pencil with it. The point of the question was
          // never the template — it was the month somebody wants filled in.
          setBrush({ kind: 'shift', template });
          sheet.current?.scrollTo({ y: 0, animated: true });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        onClose={() => setStarting(false)}
      />

      <PaintPicker
        open={picking}
        templates={templates}
        eventTemplates={eventTypes}
        events={events}
        palette={palette}
        money={money}
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
          setStarting(true);
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

/**
 * What one stroke did, in the form that puts it back.
 *
 * A stroke across twenty days with the wrong template used to cost twenty
 * passes with the eraser. Adding is exactly reversible through the same bulk
 * call; the brushes that change a day instead carry the day as it was.
 */
type Undo =
  | { kind: 'shift'; templateId: number; dates: string[]; label: string }
  | { kind: 'event'; ids: number[]; label: string }
  | {
      kind: 'days';
      before: { key: string; payload: DaySave }[];
      /**
       * Events the eraser took off. Put back as new ones rather than restored:
       * the id is gone, and nobody has ever looked at one.
       */
      events: EventSave[];
      label: string;
    };

const undoFor = (
  brush: Brush,
  keys: string[],
  before: { key: string; payload: DaySave }[],
  wiped: EventSave[],
  answers: unknown[],
  label: string,
): Undo | null => {
  if (brush.kind === 'shift') {
    return { kind: 'shift', templateId: brush.template.id, dates: keys, label };
  }

  if (brush.kind === 'event') {
    const ids = answers
      .map((answer) => (answer as { id?: number } | null)?.id)
      .filter((id): id is number => typeof id === 'number');

    return ids.length === 0 ? null : { kind: 'event', ids, label };
  }

  return before.length === 0 && wiped.length === 0
    ? null
    : { kind: 'days', before, events: wiped, label };
};

const writesToUndo = (undo: Undo): Omit<Pending, 'id' | 'at'>[] => {
  if (undo.kind === 'shift') {
    return [{
      method: 'POST',
      path: '/shifter/v1/days/bulk',
      body: { dates: undo.dates, shift_id: undo.templateId, mode: 'remove' },
      days: undo.dates,
      label: undo.label,
    }];
  }

  if (undo.kind === 'event') {
    return undo.ids.map((id) => ({
      method: 'DELETE' as const,
      path: `/shifter/v1/events/${id}`,
      body: null,
      days: [],
      label: undo.label,
    }));
  }

  return [
    ...undo.before.map((entry) => ({
      method: 'PUT' as const,
      path: `/shifter/v1/days/${entry.key}`,
      body: entry.payload,
      days: [entry.key],
      label: undo.label,
    })),
    ...undo.events.map((event) => ({
      method: 'POST' as const,
      path: '/shifter/v1/events',
      body: event,
      days: [],
      label: undo.label,
    })),
  ];
};

const changeWord = (count: number) => {
  const tail = count % 10;
  const teen = count % 100;

  if (teen >= 11 && teen <= 14) return t('изменений');
  if (tail === 1) return t('изменение');
  if (tail >= 2 && tail <= 4) return t('изменения');

  return t('изменений');
};

const dayWord = (count: number) => {
  const tail = count % 10;
  const teen = count % 100;

  if (teen >= 11 && teen <= 14) return t('дней');
  if (tail === 1) return t('день');
  if (tail >= 2 && tail <= 4) return t('дня');

  return t('дней');
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

    begin: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: palette.accentSoft,
      borderWidth: 1.5,
      borderColor: palette.accent,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    beginMark: { fontSize: 26 },
    beginText: { flex: 1, gap: 3 },
    beginTitle: { color: palette.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
    beginBody: { color: palette.textSecondary, fontSize: 13, lineHeight: 18 },

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

    week: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    weekNear: { borderColor: palette.accent },
    weekOver: { borderColor: palette.danger, backgroundColor: `${palette.danger}12` },
    weekText: { flex: 1, color: palette.text, fontSize: 13, fontVariant: ['tabular-nums'] },

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
    liveCardOverdue: { borderColor: palette.danger },
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
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    barChip: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    barChipMark: { fontSize: 17, color: '#fff' },
    barText: { flex: 1, gap: 1 },
    barName: { flex: 1, color: palette.text, fontSize: 14.5, fontWeight: '700' },
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
