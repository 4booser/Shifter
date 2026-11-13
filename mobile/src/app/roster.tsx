import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AppState,
  FlatList,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonthJump } from '@/components/month-jump';
import { Loading, Press } from '@/components/motion';
import { FillSheet } from '@/components/roster/fill-sheet';
import { HoursSheet } from '@/components/roster/hours-sheet';
import { PeopleSheet } from '@/components/roster/people-sheet';
import { SettingsSheet, SettingsTab, SheetChange } from '@/components/roster/settings-sheet';
import { Sheet } from '@/components/roster/sheet';
import { makeRosterStyles as makeStyles } from '@/components/roster/styles';
import { Colors, Palette } from '@/constants/theme';
import { API_BASE } from '@/lib/api';
import { currentMonth, dayLabel, monthLabel, todayKey, weekdayOf, YearMonth } from '@/lib/calendar';
import { t, useLangValue } from '@/lib/i18n';
import {
  anyPattern,
  CellEdit,
  cellText,
  dayList,
  fillFrom,
  fillLine,
  goneFromServer,
  hourPairs,
  LinkStep,
  monthKey,
  MOST_ROSTERS,
  pressLink,
  repeatLine,
  restampLine,
  Roster,
  ROSTER_REACH,
  RosterDay,
  rosterLink,
  RosterMonth,
  RosterPerson,
  rosterProblem,
  stepMonth,
  TITLE_MAX,
  undoFill,
  swapEdits,
  undoOf,
  usualPair,
  withEdits,
  withoutPattern,
  withPerson,
  withPosition,
} from '@/lib/roster';
import { rosterApi, rosterSavers } from '@/lib/roster-api';
import { venueLine } from '@/lib/roster-rules';
import { readPast, RosterSaveState } from '@/lib/roster-saver';

/** The most hour pairs offered in the editor: past that it is a shorter way to type them. */
const PAIRS_OFFERED = 6;

/** How long «Отменить» stays after a one-tap put, a swap or a fill. */
const UNDO_FOR = 5_000;

/** Set once the owner has seen what positions, hours and fill are. Read here, not in lib/: the keychain is native. */
const NEWS_KEY = 'roster-news-positions';

const newsUnseen = (): boolean => {
  try {
    return SecureStore.getItem(NEWS_KEY) === null;
  } catch {
    // A keychain that cannot be read is no reason to keep saying it.
    return false;
  }
};

const markNewsSeen = () => {
  try {
    SecureStore.setItem(NEWS_KEY, 'seen');
  } catch {
    // Seen for this run; it may say it once more next time.
  }
};

/** The cell somebody tapped. */
interface Cell {
  person: RosterPerson;
  date: string;
}

/** Which settings are open, and whether a fill sent the owner there. */
interface SettingsOpen {
  tab: SettingsTab;
  forFill: boolean;
}

type Row = { kind: 'day'; day: RosterDay } | { kind: 'fold'; count: number };

/** One person writing the month for a crew who never had to register. */
export default function RosterScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [rosters, setRosters] = useState<Roster[] | null>(null);
  const [rosterId, setRosterId] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [naming, setNaming] = useState<Roster | 'new' | null>(null);
  const [mended, setMended] = useState(0);

  // Of every roster but for the receipt: a failure on the one just left still
  // has to show here, and be retried from here.
  const saveState = useSyncExternalStore(rosterSavers.listen, () => rosterSavers.state(rosterId));

  const load = useCallback(async (): Promise<Roster[] | null> => {
    try {
      const list = await rosterApi.list();

      setRosters(list);
      setRosterId((held) => (list.some((row) => row.id === held) ? held : (list[0]?.id ?? null)));
      setProblem(null);

      return list;
    } catch (caught) {
      setProblem(t(rosterProblem(caught, 'Не получилось.')));

      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Somebody went on another device, and the batch naming them was refused
  // whole, which it would go on being: nothing else gets through until they
  // are out of it. The list answers for any roster, on the screen or not.
  useEffect(
    () =>
      rosterSavers.onRefused((id) => {
        void load().then((list) => {
          if (list === null) return;

          const held = list.find((row) => row.id === id);

          if (held === undefined) {
            rosterSavers.forget(id);

            return;
          }

          if (rosterSavers.absorb(id, held.people.map((person) => person.id))) {
            setProblem(t('Кого-то убрали на другом устройстве, его смены не записались.'));
          }

          setMended((count) => count + 1);
        });
      }),
    [load],
  );

  const roster = rosters?.find((row) => row.id === rosterId) ?? null;

  const startRoster = () => {
    if ((rosters?.length ?? 0) >= MOST_ROSTERS) {
      setProblem(t('Больше 20 графиков не поместится: удалите ненужный.'));

      return;
    }

    setNaming('new');
  };

  const changeRoster = (id: number, change: (row: Roster) => Partial<Roster>) =>
    setRosters((list) => list?.map((row) => (row.id === id ? { ...row, ...change(row) } : row)) ?? list);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Press onPress={() => router.back()} hitSlop={12} accessibilityLabel={t('Закрыть')}>
          <Ionicons name="chevron-down" size={22} color={palette.textSecondary} />
        </Press>
        <Text style={styles.title}>{t('График команды')}</Text>
        {rosters !== null && rosters.length > 0 && (
          <Press style={styles.newButton} onPress={startRoster}>
            <Ionicons name="add" size={15} color={palette.accent} />
            <Text style={styles.newButtonText}>{t('Новый график')}</Text>
          </Press>
        )}
      </View>

      {rosters !== null && rosters.length > 1 && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rosterRow}>
            {rosters.map((row) => (
              <Press
                key={row.id}
                style={[styles.chip, row.id === rosterId && styles.chipOn]}
                onPress={() => setRosterId(row.id)}
              >
                <Text style={[styles.chipText, row.id === rosterId && styles.chipTextOn]} numberOfLines={1}>
                  {row.title}
                </Text>
              </Press>
            ))}
          </ScrollView>
        </View>
      )}

      {problem !== null && <Text style={styles.problem}>{problem}</Text>}

      {rosters === null && problem === null && (
        <Loading colour={palette.backgroundElement} rows={3} height={110} style={styles.pad} />
      )}

      {rosters === null && problem !== null && (
        <Press style={[styles.primary, styles.pad]} onPress={() => void load()}>
          <Text style={styles.primaryText}>{t('Повторить')}</Text>
        </Press>
      )}

      {rosters !== null && rosters.length === 0 && (
        <View style={styles.pad}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Пока ни одного графика')}</Text>
            <Text style={styles.lead}>
              {t('Создайте график, добавьте людей, расставьте смены и отправьте ссылку в общий чат. Регистрироваться никому не надо.')}
            </Text>
            <Press style={styles.primary} onPress={startRoster}>
              <Text style={styles.primaryText}>{t('Создать график')}</Text>
            </Press>
          </View>
        </View>
      )}

      {/* Keyed, so one roster's month and unsaved cells can never land on another's. */}
      {roster !== null && (
        <Book
          key={roster.id}
          roster={roster}
          palette={palette}
          saveState={saveState}
          mended={mended}
          onRename={() => setNaming(roster)}
          onChange={(change) => changeRoster(roster.id, change)}
          onEdit={() => setProblem(null)}
          onGone={load}
        />
      )}

      {naming !== null && (
        <NameSheet
          naming={naming}
          palette={palette}
          onClose={() => setNaming(null)}
          onSaved={(saved) => {
            setNaming(null);
            setProblem(null);
            setRosters((list) =>
              list?.some((row) => row.id === saved.id)
                ? list.map((row) => (row.id === saved.id ? saved : row))
                : [...(list ?? []), saved],
            );
            setRosterId(saved.id);
          }}
          onRemoved={(id) => {
            rosterSavers.forget(id);
            setNaming(null);
            void load();
          }}
        />
      )}
    </View>
  );
}

/** One roster, one month at a time. */
function Book({
  roster,
  palette,
  saveState,
  mended,
  onRename,
  onChange,
  onEdit,
  onGone,
}: {
  roster: Roster;
  palette: Palette;
  saveState: RosterSaveState;
  /** Moves each time a refused batch has been sorted out, which changes what the server holds. */
  mended: number;
  onRename: () => void;
  /** Keeps the roster list in step with what changed here. */
  onChange: (change: (roster: Roster) => Partial<Roster>) => void;
  onEdit: () => void;
  onGone: () => void;
}) {
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();
  const lang = useLangValue();
  const rosterId = roster.id;

  const [at, setAt] = useState<YearMonth>(currentMonth);
  const [month, setMonth] = useState<RosterMonth | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filling, setFilling] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [cell, setCell] = useState<Cell | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  // Settings asked for from the fill menu, held until the menu has gone.
  const [afterFill, setAfterFill] = useState<SettingsOpen | null>(null);
  const [settings, setSettings] = useState<SettingsOpen | null>(null);
  const [undo, setUndo] = useState<CellEdit[] | null>(null);
  const [news, setNews] = useState(newsUnseen);

  // Moved by every read: only the newest read's answer is news.
  const asked = useRef(0);
  const reading = useRef(0);
  const blank = useRef(true);
  // The cells put while a fill is out, or null with none out. They are the
  // owner's, so the fill's «Отменить» has to leave them be.
  const putWhileFilling = useRef<CellEdit[] | null>(null);

  const key = monthKey(at);

  const saver = useMemo(() => rosterSavers.of(rosterId), [rosterId]);

  /** The month as the server has it, with what has not reached it still on top. Resolves with what it showed, or null when a newer read took over. */
  const pull = useCallback(async (): Promise<RosterMonth | null> => {
    asked.current += 1;
    reading.current += 1;

    const ticket = asked.current;
    let shown = null as RosterMonth | null;

    try {
      await readPast(
        saver,
        () => rosterApi.month(rosterId, key),
        (read) => {
          if (ticket !== asked.current) return;

          shown = withEdits(read, saver.unsent());
          setMonth(shown);
          setProblem(null);
        },
        () => blank.current,
      );
    } catch (caught) {
      if (ticket !== asked.current) return null;

      if (goneFromServer(caught)) {
        rosterSavers.forget(rosterId);
        onGone();
      } else setProblem(t(rosterProblem(caught, 'Не получилось.')));
    } finally {
      reading.current -= 1;
    }

    return ticket === asked.current ? shown : null;
  }, [rosterId, key, saver, onGone]);

  // Ahead of the effect below, which has to read it as of this render.
  useEffect(() => {
    blank.current = month === null;
  }, [month]);

  // Backgrounding the app counts as leaving, and so does closing the screen.
  // Coming back, the month may have been written on the web in the meantime.
  useEffect(() => {
    void pull();

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void pull();
      else void saver.settle();
    });

    return () => {
      sub.remove();
      void saver.settle();
    };
  }, [saver, pull]);

  // Counted here, since this also runs for a new month, which is not news.
  const seen = useRef(mended);

  useEffect(() => {
    if (mended === seen.current) return;

    seen.current = mended;
    void pull();
  }, [mended, pull]);

  // «Отменить» is for the moment just after; later it would undo something
  // the owner has already forgotten doing.
  useEffect(() => {
    if (undo === null) return;

    const timer = setTimeout(() => setUndo(null), UNDO_FOR);

    return () => clearTimeout(timer);
  }, [undo]);

  const put = (edit: CellEdit) => {
    setMonth((shown) => (shown === null ? shown : withEdits(shown, [edit])));
    saver.edit(edit);
    putWhileFilling.current?.push(edit);
    setCell(null);
    setProblem(null);
    onEdit();

    // A read still out may be bringing a fill's shifts onto the screen, and
    // this line is all that says what the fill did.
    if (reading.current === 0) setNote(null);
  };

  /** A free person put on at their usual time, in one tap. */
  const putUsual = (person: RosterPerson, date: string) => {
    if (month === null) return;

    const edit: CellEdit = { person_id: person.id, date, hours: usualPair(person, month, date) };

    setUndo(undoOf([edit], month.shifts));
    put(edit);
  };

  /** The cell open in the editor handed to somebody free that day. */
  const swap = (to: RosterPerson) => {
    const shift = cell === null ? undefined : month?.shifts.find((row) => row.person_id === cell.person.id && row.date === cell.date);

    if (month === null || cell === null || shift === undefined) return;

    const edits = swapEdits(shift, cell.person, to, cell.date, month);

    setUndo(undoOf(edits, month.shifts));
    edits.forEach(put);
  };

  const takeBack = () => {
    const edits = undo ?? [];

    setUndo(null);
    edits.forEach(put);
  };

  const go = (next: YearMonth | null) => {
    // A fill reads its own month back when it lands, and would land it under this one.
    if (next === null || filling) return;

    setAt(next);
    setMonth(null);
    setNote(null);
    setProblem(null);
    setPastOpen(false);
    setUndo(null);
  };

  const openSettings = (tab: SettingsTab, forFill = false) => {
    // From the fill menu, settings wait for it to go: iOS drops a screen
    // presented while another is still sliding away, and then never shows
    // settings again until this one is left.
    if (fillOpen) {
      setFillOpen(false);
      setAfterFill({ tab, forFill });
    } else setSettings({ tab, forFill });
  };

  /** Runs one of the fill menu's three, which all work on what the server holds, so what was just changed has to get there first. */
  const filled = async (work: () => Promise<void>) => {
    setFillOpen(false);
    setFilling(true);
    setNote(null);
    setProblem(null);
    setUndo(null);

    try {
      await saver.flush();

      if (!saver.clean()) return;

      await work();
    } catch (caught) {
      setProblem(t(rosterProblem(caught, 'Не получилось.')));
    } finally {
      setFilling(false);
    }
  };

  const fill = async () => {
    if (month === null) return;

    // Fill works from people's days: with nobody's set there is nothing to
    // fill from, and the place to set them is one tap away.
    if (!anyPattern(month.people)) {
      openSettings('days', true);

      return;
    }

    // The month as the press found it. Whatever the owner puts from here on
    // is theirs, and stays put when the fill is taken back.
    const before = month.shifts;
    const theirs: CellEdit[] = [];

    putWhileFilling.current = theirs;

    try {
      await filled(async () => {
        const done = await rosterApi.fill(rosterId, key);
        const after = await pull();

        setNote(fillLine(done, at, withoutPattern(month.people, month.positions)));

        const back = after === null ? [] : undoFill(before, after.shifts, theirs);

        if (back.length > 0) setUndo(back);
      });
    } finally {
      putWhileFilling.current = null;
    }
  };

  const repeat = () =>
    filled(async () => {
      setNote(repeatLine(await rosterApi.repeat(rosterId, key)));
      await pull();
    });

  const clear = () =>
    filled(async () => {
      const { cleared } = await rosterApi.clear(rosterId, key);

      await pull();
      setNote(`${t('Убрано смен')}: ${cleared}.`);
    });

  /** A change to people, positions or the venue's hours, here and in the roster list. A save that moved shifts to a new usual time reads the month again to show them. */
  const changeSheet = (change: SheetChange, restamped = 0) => {
    setMonth((shown) => (shown === null ? shown : { ...shown, ...change(shown) }));
    onChange((row) => change(row));

    if (restamped > 0) {
      setNote(restampLine(restamped));
      void pull();
    }
  };

  const removePerson = async (person: RosterPerson) => {
    const staying = (month?.people ?? []).filter((row) => row.id !== person.id);

    // An «Отменить» still up may name them, and goes with them, as on the
    // web: the server would refuse the batch it rode in, and the screen would
    // blame another device.
    setUndo(null);

    // Their cells may still be on the way, and once they are gone the server
    // refuses the whole batch for naming them.
    await saver.settle();
    await rosterApi.removePerson(rosterId, person.id);
    saver.keep(staying.map((row) => row.id));
    setMonth((shown) =>
      shown === null
        ? shown
        : {
            ...shown,
            people: shown.people.filter((row) => row.id !== person.id),
            shifts: shown.shifts.filter((shift) => shift.person_id !== person.id),
          },
    );
    onChange((row) => ({ people: row.people.filter((one) => one.id !== person.id) }));
  };

  const changeSlug = (slug: string | null) => {
    setMonth((shown) => (shown === null ? shown : { ...shown, share_slug: slug }));
    onChange(() => ({ share_slug: slug }));
  };

  const closeNews = () => {
    markNewsSeen();
    setNews(false);
  };

  const today = todayKey();
  const from = fillFrom(at, today);
  const days =
    month === null ? null : dayList(at, month.people, month.shifts, today, month.positions, month.venue_hours);
  const pairs = hourPairs(month?.shifts ?? []).slice(0, PAIRS_OFFERED);
  const venue = month === null ? null : venueLine(month.venue_hours, lang);
  const peopled = month !== null && month.people.length > 0;
  const shiftAt =
    cell === null
      ? undefined
      : month?.shifts.find((row) => row.person_id === cell.person.id && row.date === cell.date);
  const freeAt =
    cell === null || days === null
      ? []
      : ([...days.coming, ...days.past].find((day) => day.date === cell.date)?.free ?? []);

  const rows: Row[] =
    days === null || !peopled
      ? []
      : [
          ...days.coming.map((day): Row => ({ kind: 'day', day })),
          ...(days.past.length > 0 ? [{ kind: 'fold', count: days.past.length } as const] : []),
          ...(pastOpen ? days.past.map((day): Row => ({ kind: 'day', day })) : []),
        ];

  const saveWord =
    saveState === 'saving' || saveState === 'waiting'
      ? t('Сохраняется…')
      : saveState === 'saved'
        ? t('Сохранено')
        : saveState === 'failed'
          ? t('Не сохранилось — повторить')
          : null;

  return (
    <>
      {/* Above the list rather than in it: this is the only receipt there is,
          and the month runs long enough to scroll it off the screen. «Отменить»
          sits by it for the same reason: a tap far down the month has to see it. */}
      <View style={styles.bookHead}>
        <View style={styles.bookTitleRow}>
          <Press
            style={styles.bookTitlePress}
            onPress={onRename}
            accessibilityLabel={t('Изменить название')}
          >
            <Text style={styles.bookTitle} numberOfLines={1}>
              {roster.title}
            </Text>
            <Ionicons name="pencil" size={13} color={palette.textSecondary} />
          </Press>

          <View style={styles.saveMark}>
            {saveWord !== null && (
              <Press
                hitSlop={8}
                disabled={saveState !== 'failed'}
                onPress={rosterSavers.retry}
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

            {undo !== null && (
              <Press hitSlop={8} style={styles.saveMark} onPress={takeBack}>
                <Ionicons name="arrow-undo-outline" size={14} color={palette.accent} />
                <Text style={styles.undo}>{t('Отменить')}</Text>
              </Press>
            )}
          </View>
        </View>

        <View style={styles.monthRow}>
          <Press
            style={styles.arrow}
            hitSlop={8}
            disabled={stepMonth(at, -1) === null}
            onPress={() => go(stepMonth(at, -1))}
            accessibilityLabel={t('Предыдущий месяц')}
          >
            <Ionicons name="chevron-back" size={20} color={palette.text} />
          </Press>
          <Press onPress={() => setJumping(true)} hitSlop={8}>
            <Text style={styles.monthName}>{monthLabel(at)}</Text>
          </Press>
          <Press
            style={styles.arrow}
            hitSlop={8}
            disabled={stepMonth(at, 1) === null}
            onPress={() => go(stepMonth(at, 1))}
            accessibilityLabel={t('Следующий месяц')}
          >
            <Ionicons name="chevron-forward" size={20} color={palette.text} />
          </Press>
        </View>

        {venue !== null && (
          <Press style={styles.venueLine} scale={0.99} hitSlop={6} onPress={() => openSettings('hours')}>
            <Ionicons name="time-outline" size={14} color={palette.textSecondary} />
            <Text style={styles.venueText}>{venue}</Text>
          </Press>
        )}
      </View>

      {/* Keyed by month, so a month opens at its top rather than wherever the last one was left. */}
      <FlatList
        key={key}
        style={styles.list}
        contentContainerStyle={[styles.listInner, { paddingBottom: insets.bottom + 32 }]}
        data={rows}
        keyExtractor={(row) => (row.kind === 'day' ? row.day.date : 'fold')}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void pull().finally(() => setRefreshing(false));
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.listHead}>
            {problem !== null && <Text style={styles.error}>{problem}</Text>}

            {peopled && news && (
              <View style={styles.newsCard}>
                <Ionicons name="sparkles-outline" size={18} color={palette.accent} />
                <View style={styles.grow}>
                  <Text style={styles.newsText}>
                    {t('Теперь есть должности, часы работы и «Заполнить месяц».')}
                  </Text>
                  <Press
                    hitSlop={8}
                    onPress={() => {
                      closeNews();
                      openSettings('days');
                    }}
                  >
                    <Text style={styles.newsGo}>{t('Настроить')}</Text>
                  </Press>
                </View>
                <Press hitSlop={12} onPress={closeNews} accessibilityLabel={t('Закрыть')}>
                  <Ionicons name="close" size={18} color={palette.textSecondary} />
                </Press>
              </View>
            )}

            {note !== null && <Text style={styles.note}>{note}</Text>}

            {peopled && (
              <View style={styles.actions}>
                <Press style={styles.action} onPress={() => setPeopleOpen(true)}>
                  <Ionicons name="people-outline" size={15} color={palette.accent} />
                  <Text style={styles.actionText}>{t('Люди')}</Text>
                </Press>
                <Press style={[styles.action, filling && styles.dimmed]} disabled={filling} onPress={() => setFillOpen(true)}>
                  <Ionicons name="sparkles-outline" size={15} color={palette.accent} />
                  <Text style={styles.actionText}>{filling ? t('Заполняем…') : t('Заполнить')}</Text>
                  {!filling && <Ionicons name="chevron-down" size={13} color={palette.accent} />}
                </Press>
                <Press
                  style={styles.action}
                  onPress={() => {
                    // Whoever opens the link should see what is on this screen.
                    void saver.settle();
                    setShareOpen(true);
                  }}
                >
                  <Ionicons name="share-outline" size={15} color={palette.accent} />
                  <Text style={styles.actionText}>{t('Поделиться')}</Text>
                </Press>
                <Press style={styles.action} onPress={() => openSettings('hours')}>
                  <Ionicons name="options-outline" size={15} color={palette.accent} />
                  <Text style={styles.actionText}>{t('Настройки')}</Text>
                </Press>
              </View>
            )}

            {peopled && month.shifts.length === 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('В этом месяце смен пока нет')}</Text>
                {anyPattern(month.people) && from !== null ? (
                  <>
                    <Text style={styles.lead}>{t('Заполните его по рабочим дням одной кнопкой.')}</Text>
                    <Press
                      style={[styles.primary, filling && styles.dimmed]}
                      disabled={filling}
                      onPress={() => void fill()}
                    >
                      <Text style={styles.primaryText}>{t('Заполнить месяц')}</Text>
                    </Press>
                  </>
                ) : (
                  <>
                    <Text style={styles.lead}>
                      {t('Отметьте, кто по каким дням работает, и заполните одной кнопкой — или повторите прошлый месяц.')}
                    </Text>
                    <View style={styles.quietRow}>
                      <Press style={styles.quiet} onPress={() => openSettings('days')}>
                        <Text style={styles.quietText}>{t('Рабочие дни')}</Text>
                      </Press>
                      <Press style={[styles.quiet, filling && styles.dimmed]} disabled={filling} onPress={() => void repeat()}>
                        <Text style={styles.quietText}>{t('Как в прошлом месяце')}</Text>
                      </Press>
                    </View>
                  </>
                )}
              </View>
            )}

            {peopled && (
              <Text style={styles.hint}>
                {t('Нажмите на имя — поставите на обычное время; удерживайте — откроется день.')}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          month === null ? (
            problem === null ? (
              <Loading colour={palette.backgroundElement} rows={3} height={110} />
            ) : (
              <Press style={styles.primary} onPress={() => void pull()}>
                <Text style={styles.primaryText}>{t('Повторить')}</Text>
              </Press>
            )
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('Кто работает?')}</Text>
              <Text style={styles.lead}>
                {t('Имя, должность и по каким дням работает. Аккаунты им не нужны.')}
              </Text>
              <Press style={styles.primary} onPress={() => setPeopleOpen(true)}>
                <Text style={styles.primaryText}>{t('Добавить человека')}</Text>
              </Press>
              <Text style={styles.hint}>{t('Часы работы и должности — в Настройках, сейчас или потом.')}</Text>
              <View style={styles.quietRow}>
                <Press style={styles.quiet} onPress={() => openSettings('hours')}>
                  <Text style={styles.quietText}>{t('Часы работы')}</Text>
                </Press>
                <Press style={styles.quiet} onPress={() => openSettings('positions')}>
                  <Text style={styles.quietText}>{t('Должности')}</Text>
                </Press>
              </View>
            </View>
          )
        }
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <DayCard
              day={item.day}
              today={item.day.date === today}
              palette={palette}
              onCell={(person, date) => setCell({ person, date })}
              onFree={putUsual}
            />
          ) : (
            <Press style={styles.fold} onPress={() => setPastOpen((open) => !open)}>
              <Text style={styles.foldText}>
                {t('Прошедшие дни')} · {item.count}
              </Text>
              <Ionicons
                name={pastOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={palette.textSecondary}
              />
            </Press>
          )
        }
      />

      <MonthJump
        open={jumping}
        at={at}
        palette={palette}
        reach={ROSTER_REACH}
        onPick={(picked) => {
          setJumping(false);
          go(picked);
        }}
        onClose={() => setJumping(false)}
      />

      {cell !== null && month !== null && (
        <HoursSheet
          key={`${cell.person.id}|${cell.date}`}
          person={cell.person}
          date={cell.date}
          shift={shiftAt}
          usual={usualPair(cell.person, month, cell.date)}
          pairs={pairs}
          free={freeAt}
          palette={palette}
          onClose={() => setCell(null)}
          onPut={(hours) => put({ person_id: cell.person.id, date: cell.date, hours })}
          onSwap={swap}
        />
      )}

      {/* Kept while it slides away with settings waiting on it, to hear when it has gone. */}
      {(fillOpen || afterFill !== null) && (
        <FillSheet
          open={fillOpen}
          from={from}
          palette={palette}
          onClose={() => setFillOpen(false)}
          onGone={() => {
            if (afterFill !== null) setSettings(afterFill);
            setAfterFill(null);
          }}
          onFill={() => void fill()}
          onRepeat={() => void repeat()}
          onClear={() => void clear()}
        />
      )}

      {peopleOpen && month !== null && (
        <PeopleSheet
          rosterId={rosterId}
          sheet={month}
          at={at}
          today={today}
          palette={palette}
          onClose={() => setPeopleOpen(false)}
          onSaved={(person, restamped) => changeSheet((shown) => withPerson(shown, person), restamped)}
          onPosition={(position) => changeSheet((shown) => withPosition(shown, position))}
          onRemove={removePerson}
        />
      )}

      {settings !== null && month !== null && (
        <SettingsSheet
          rosterId={rosterId}
          sheet={month}
          at={at}
          today={today}
          tab={settings.tab}
          forFill={settings.forFill}
          palette={palette}
          onTab={(tab) => setSettings({ tab, forFill: settings.forFill })}
          onClose={() => setSettings(null)}
          onChange={changeSheet}
        />
      )}

      {shareOpen && month !== null && (
        <ShareSheet
          rosterId={rosterId}
          slug={month.share_slug}
          palette={palette}
          onClose={() => setShareOpen(false)}
          onSlug={changeSlug}
        />
      )}
    </>
  );
}

/** A day of the month, with everyone on it reachable by one tap. */
function DayCard({
  day,
  today,
  palette,
  onCell,
  onFree,
}: {
  day: RosterDay;
  today: boolean;
  palette: Palette;
  /** Opens the day for somebody, on it or not. */
  onCell: (person: RosterPerson, date: string) => void;
  /** Puts somebody free on at their usual time. */
  onFree: (person: RosterPerson, date: string) => void;
}) {
  const styles = makeStyles(palette);

  return (
    <View
      style={[
        styles.dayCard,
        weekdayOf(day.date) >= 5 && styles.dayCardWeekend,
        today && styles.dayCardToday,
        day.closed && styles.dayCardClosed,
      ]}
    >
      <View style={styles.dayHead}>
        <View style={styles.dayTags}>
          <Text style={[styles.dayName, today && styles.dayNameToday]}>{dayLabel(day.date)}</Text>
          {day.closed && <Text style={styles.closedTag}>{t('закрыто')}</Text>}
        </View>
        {today && <Text style={styles.dayToday}>{t('Сегодня')}</Text>}
      </View>

      {day.groups.map(({ position, working }) => (
        <View key={position?.id ?? 'none'} style={styles.chipLine}>
          {day.labelled && (
            <Text style={styles.groupLabel} numberOfLines={1}>
              {position?.name ?? t('Без должности')}
            </Text>
          )}

          {working.map(({ person, shift }) => {
            const hours = cellText(shift);

            return (
              <Press
                key={person.id}
                style={styles.personRow}
                scale={0.985}
                accessibilityLabel={`${person.name}, ${hours ?? t('без времени')}`}
                onPress={() => onCell(person, day.date)}
              >
                <View style={[styles.dot, { backgroundColor: person.colour }]} />
                <Text style={[styles.personName, styles.grow]} numberOfLines={1}>
                  {person.name}
                </Text>
                {hours !== null && <Text style={styles.personHours}>{hours}</Text>}
              </Press>
            );
          })}
        </View>
      ))}

      {day.free.length > 0 && (
        <View style={styles.freeRow}>
          {day.free.map((person) => (
            <Press
              key={person.id}
              style={styles.freeChip}
              onPress={() => onFree(person, day.date)}
              onLongPress={() => onCell(person, day.date)}
              accessibilityLabel={`${t('Поставить')} ${person.name}`}
            >
              <Ionicons name="add" size={13} color={palette.textSecondary} />
              <Text style={styles.freeName} numberOfLines={1}>
                {person.name}
              </Text>
            </Press>
          ))}
        </View>
      )}
    </View>
  );
}

/** The link. Whoever has it sees the month and nothing else, and a new one kills the old at once. */
function ShareSheet({
  rosterId,
  slug,
  palette,
  onClose,
  onSlug,
}: {
  rosterId: number;
  slug: string | null;
  palette: Palette;
  onClose: () => void;
  onSlug: (slug: string | null) => void;
}) {
  const styles = makeStyles(palette);

  const [armed, setArmed] = useState<LinkStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const url = slug === null ? null : rosterLink(API_BASE, slug);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setFailed(null);

    try {
      await work();
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не получилось.')));
    } finally {
      setBusy(false);
    }
  };

  const issue = () =>
    run(async () => {
      const issued = await rosterApi.share(rosterId);

      onSlug(issued.share_slug);
    });

  const turnOff = () =>
    run(async () => {
      await rosterApi.unshare(rosterId);
      onSlug(null);
    });

  /** Both ways of ending the address take a second press: it is in a group chat, and a new link is a different one. */
  const press = (step: LinkStep, go: () => Promise<void>) => {
    const next = pressLink(armed, step);

    setArmed(next.armed);

    if (next.go) void go();
  };

  return (
    <Sheet palette={palette} onClose={onClose}>
      <Text style={styles.sheetTitle}>{t('Ссылка на график')}</Text>
      <Text style={styles.lead}>{t('Любой, у кого есть ссылка, увидит имена и часы.')}</Text>

      {failed !== null && <Text style={styles.error}>{failed}</Text>}

      {url === null ? (
        <Press style={[styles.primary, busy && styles.dimmed]} disabled={busy} onPress={() => void issue()}>
          <Text style={styles.primaryText}>{t('Включить ссылку')}</Text>
        </Press>
      ) : (
        <>
          <Text style={styles.url} selectable numberOfLines={1} ellipsizeMode="middle">
            {url}
          </Text>

          <Press
            style={[styles.primary, busy && styles.dimmed]}
            disabled={busy}
            onPress={() => void Share.share({ message: url }).catch(() => undefined)}
          >
            <Text style={styles.primaryText}>{t('Поделиться ссылкой')}</Text>
          </Press>

          <Press style={styles.ghost} disabled={busy} onPress={() => press('renew', issue)}>
            <Text style={[styles.ghostText, armed === 'renew' && styles.dangerText]}>
              {armed === 'renew' ? t('Старая ссылка перестанет работать. Нажмите ещё раз') : t('Новая ссылка')}
            </Text>
          </Press>

          <Press style={styles.ghost} disabled={busy} onPress={() => press('off', turnOff)}>
            <Text style={[styles.ghostText, styles.dangerText]}>
              {armed === 'off' ? t('Ссылка в чате перестанет работать. Нажмите ещё раз') : t('Выключить')}
            </Text>
          </Press>
        </>
      )}
    </Sheet>
  );
}

/** A new roster's name, or an old one's, with the way out of it. */
function NameSheet({
  naming,
  palette,
  onClose,
  onSaved,
  onRemoved,
}: {
  naming: Roster | 'new';
  palette: Palette;
  onClose: () => void;
  onSaved: (roster: Roster) => void;
  onRemoved: (id: number) => void;
}) {
  const styles = makeStyles(palette);

  const [title, setTitle] = useState(naming === 'new' ? '' : naming.title);
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const save = async () => {
    if (title.trim() === '') return;

    setBusy(true);
    setFailed(null);

    try {
      onSaved(
        naming === 'new'
          ? await rosterApi.create(title.trim())
          : await rosterApi.rename(naming.id, title.trim()),
      );
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не сохранилось.')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (naming === 'new') return;

    if (!arming) {
      setArming(true);

      return;
    }

    setBusy(true);
    setFailed(null);

    try {
      await rosterApi.remove(naming.id);
      onRemoved(naming.id);
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не получилось.')));
      setBusy(false);
    }
  };

  return (
    <Sheet palette={palette} onClose={onClose}>
      <Text style={styles.sheetTitle}>{naming === 'new' ? t('Новый график') : t('Название графика')}</Text>

      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={() => void save()}
        autoFocus={naming === 'new'}
        maxLength={TITLE_MAX}
        placeholder={t('Кальянная на Подоле')}
        placeholderTextColor={palette.textSecondary}
      />

      {failed !== null && <Text style={styles.error}>{failed}</Text>}

      <Press
        style={[styles.primary, (busy || title.trim() === '') && styles.dimmed]}
        disabled={busy || title.trim() === ''}
        onPress={() => void save()}
      >
        <Text style={styles.primaryText}>{naming === 'new' ? t('Создать график') : t('Сохранить')}</Text>
      </Press>

      {naming !== 'new' && (
        <Press style={styles.ghost} disabled={busy} onPress={() => void remove()}>
          <Text style={[styles.ghostText, styles.dangerText]}>
            {arming ? t('Точно удалить? Люди и смены уйдут вместе с ним') : t('Удалить график')}
          </Text>
        </Press>
      )}
    </Sheet>
  );
}
