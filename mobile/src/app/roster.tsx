import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ReactNode,
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
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonthJump } from '@/components/month-jump';
import { Loading, Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { API_BASE } from '@/lib/api';
import { currentMonth, dayLabel, monthLabel, todayKey, weekdayOf, YearMonth } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import {
  CellEdit,
  compactHours,
  crossesMidnight,
  dayList,
  goneFromServer,
  hourPairs,
  HourPair,
  hoursProblem,
  LinkStep,
  monthKey,
  MOST_PEOPLE,
  MOST_ROSTERS,
  NAME_MAX,
  nextColour,
  POSITION_MAX,
  pressLink,
  readClock,
  repeatLine,
  Roster,
  ROSTER_COLOURS,
  ROSTER_REACH,
  RosterDay,
  rosterLink,
  RosterMonth,
  RosterPerson,
  rosterProblem,
  stepMonth,
  TITLE_MAX,
  withEdits,
} from '@/lib/roster';
import { rosterApi, rosterSavers } from '@/lib/roster-api';
import { readPast, RosterSaveState } from '@/lib/roster-saver';

/** The most hour pairs offered in the editor: past that it is a shorter way to type them. */
const PAIRS_OFFERED = 6;

/** The cell somebody tapped. */
interface Cell {
  person: RosterPerson;
  date: string;
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

  const changeRoster = (id: number, over: Partial<Roster>) =>
    setRosters((list) => list?.map((row) => (row.id === id ? { ...row, ...over } : row)) ?? list);

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
          onChange={(over) => changeRoster(roster.id, over)}
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
  onChange: (over: Partial<Roster>) => void;
  onEdit: () => void;
  onGone: () => void;
}) {
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();
  const rosterId = roster.id;

  const [at, setAt] = useState<YearMonth>(currentMonth);
  const [month, setMonth] = useState<RosterMonth | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [cell, setCell] = useState<Cell | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Moved by every read: only the newest read's answer is news.
  const asked = useRef(0);
  const reading = useRef(0);
  const blank = useRef(true);

  const key = monthKey(at);

  const saver = useMemo(() => rosterSavers.of(rosterId), [rosterId]);

  /** The month as the server has it, with what has not reached it still on top. */
  const pull = useCallback(async () => {
    asked.current += 1;
    reading.current += 1;

    const ticket = asked.current;

    try {
      await readPast(
        saver,
        () => rosterApi.month(rosterId, key),
        (read) => {
          if (ticket !== asked.current) return;

          setMonth(withEdits(read, saver.unsent()));
          setProblem(null);
        },
        () => blank.current,
      );
    } catch (caught) {
      if (ticket !== asked.current) return;

      if (goneFromServer(caught)) {
        rosterSavers.forget(rosterId);
        onGone();
      } else setProblem(t(rosterProblem(caught, 'Не получилось.')));
    } finally {
      reading.current -= 1;
    }
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

  const put = (edit: CellEdit) => {
    setMonth((shown) => (shown === null ? shown : withEdits(shown, [edit])));
    saver.edit(edit);
    setCell(null);
    setProblem(null);
    onEdit();

    // A read still out may be bringing a repeat's shifts onto the screen, and
    // this line is all that says what the repeat did.
    if (reading.current === 0) setNote(null);
  };

  const go = (next: YearMonth | null) => {
    // A repeat reads its own month back when it lands, and would land it under this one.
    if (next === null || repeating) return;

    setAt(next);
    setMonth(null);
    setNote(null);
    setProblem(null);
    setPastOpen(false);
  };

  const repeat = async () => {
    setRepeating(true);
    setNote(null);
    setProblem(null);

    try {
      // The server repeats what it holds, so what was just changed has to get there first.
      await saver.flush();

      if (!saver.clean()) return;

      setNote(repeatLine(await rosterApi.repeat(rosterId, key)));
      await pull();
    } catch (caught) {
      setProblem(t(rosterProblem(caught, 'Не получилось.')));
    } finally {
      setRepeating(false);
    }
  };

  const changePeople = (people: RosterPerson[]) => {
    const here = new Set(people.map((person) => person.id));

    setMonth((shown) =>
      shown === null
        ? shown
        : { ...shown, people, shifts: shown.shifts.filter((shift) => here.has(shift.person_id)) },
    );
    onChange({ people });
  };

  const removePerson = async (person: RosterPerson) => {
    const people = (month?.people ?? []).filter((row) => row.id !== person.id);

    // Their cells may still be on the way, and once they are gone the server
    // refuses the whole batch for naming them.
    await saver.settle();
    await rosterApi.removePerson(rosterId, person.id);
    saver.keep(people.map((row) => row.id));
    changePeople(people);
  };

  const changeSlug = (slug: string | null) => {
    setMonth((shown) => (shown === null ? shown : { ...shown, share_slug: slug }));
    onChange({ share_slug: slug });
  };

  const today = todayKey();
  const days = month === null ? null : dayList(at, month.people, month.shifts, today);
  const pairs = hourPairs(month?.shifts ?? []).slice(0, PAIRS_OFFERED);
  const shiftAt =
    cell === null
      ? undefined
      : month?.shifts.find((row) => row.person_id === cell.person.id && row.date === cell.date);

  const rows: Row[] =
    days === null || month === null || month.people.length === 0
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
          and the month runs long enough to scroll it off the screen. */}
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
            {note !== null && <Text style={styles.note}>{note}</Text>}

            {month !== null && month.people.length > 0 && (
              <View style={styles.actions}>
                <Press style={styles.action} onPress={() => setPeopleOpen(true)}>
                  <Ionicons name="people-outline" size={15} color={palette.accent} />
                  <Text style={styles.actionText}>{t('Люди')}</Text>
                </Press>
                <Press style={styles.action} disabled={repeating} onPress={() => void repeat()}>
                  <Ionicons name="repeat" size={15} color={palette.accent} />
                  <Text style={styles.actionText}>
                    {repeating ? t('Повторяем…') : t('Повторить прошлый месяц')}
                  </Text>
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
              </View>
            )}

            {month !== null && month.people.length > 0 && month.shifts.length === 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('В этом месяце смен пока нет')}</Text>
                <Text style={styles.lead}>
                  {t('Нажмите на имя в нужный день или повторите прошлый месяц.')}
                </Text>
              </View>
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
              <Text style={styles.cardTitle}>{t('Добавьте людей')}</Text>
              <Text style={styles.lead}>
                {t('Толик, Гриша, Паша: имя и должность, и можно ставить смены. Аккаунты им не нужны.')}
              </Text>
              <Press style={styles.primary} onPress={() => setPeopleOpen(true)}>
                <Text style={styles.primaryText}>{t('Добавить человека')}</Text>
              </Press>
            </View>
          )
        }
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <DayCard
              day={item.day}
              today={item.day.date === today}
              palette={palette}
              onCell={setCell}
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

      {cell !== null && (
        <HoursSheet
          key={`${cell.person.id}|${cell.date}`}
          cell={cell}
          shift={shiftAt}
          pairs={pairs}
          palette={palette}
          onClose={() => setCell(null)}
          onPut={(hours) => put({ person_id: cell.person.id, date: cell.date, hours })}
        />
      )}

      {peopleOpen && month !== null && (
        <PeopleSheet
          rosterId={rosterId}
          people={month.people}
          palette={palette}
          onClose={() => setPeopleOpen(false)}
          onChange={changePeople}
          onRemove={removePerson}
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
}: {
  day: RosterDay;
  today: boolean;
  palette: Palette;
  onCell: (cell: Cell) => void;
}) {
  const styles = makeStyles(palette);

  return (
    <View
      style={[
        styles.dayCard,
        weekdayOf(day.date) >= 5 && styles.dayCardWeekend,
        today && styles.dayCardToday,
      ]}
    >
      <View style={styles.dayHead}>
        <Text style={[styles.dayName, today && styles.dayNameToday]}>{dayLabel(day.date)}</Text>
        {today && <Text style={styles.dayToday}>{t('Сегодня')}</Text>}
      </View>

      {day.working.map(({ person, shift }) => (
        <Press
          key={person.id}
          style={styles.personRow}
          scale={0.985}
          onPress={() => onCell({ person, date: day.date })}
        >
          <View style={[styles.dot, { backgroundColor: person.colour }]} />
          <View style={styles.grow}>
            <Text style={styles.personName} numberOfLines={1}>
              {person.name}
            </Text>
            {person.position !== null && (
              <Text style={styles.personPosition} numberOfLines={1}>
                {person.position}
              </Text>
            )}
          </View>
          <Text style={styles.personHours}>{compactHours(shift.start_time, shift.end_time)}</Text>
        </Press>
      ))}

      {day.free.length > 0 && (
        <View style={styles.freeRow}>
          {day.free.map((person) => (
            <Press
              key={person.id}
              style={styles.freeChip}
              onPress={() => onCell({ person, date: day.date })}
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

/** A sheet that rises with the keyboard and goes when the dim behind it is tapped. Mounted only while open, so nothing typed in it can outlive it. */
function Sheet({
  palette,
  onClose,
  children,
}: {
  palette: Palette;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      {/* A full-screen «tap outside to close». */}
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel={t('Закрыть')}
        onPress={onClose}
      />
      <KeyboardAvoidingView
        style={styles.sheetHolder}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={[styles.sheetInner, { paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Hours for one cell. The month's own pairs come first: on a phone those are the whole job. */
function HoursSheet({
  cell,
  shift,
  pairs,
  palette,
  onClose,
  onPut,
}: {
  cell: Cell;
  shift: HourPair | undefined;
  pairs: HourPair[];
  palette: Palette;
  onClose: () => void;
  onPut: (hours: HourPair | null) => void;
}) {
  const styles = makeStyles(palette);
  const opening = shift ?? pairs[0];

  const [start, setStart] = useState(opening?.start_time ?? '');
  const [end, setEnd] = useState(opening?.end_time ?? '');
  const [failed, setFailed] = useState<string | null>(null);

  const opens = readClock(start);
  const closes = readClock(end);
  const overnight = opens !== null && closes !== null && opens !== closes && crossesMidnight(opens, closes);

  const save = () => {
    const problem = hoursProblem(start, end);

    if (problem !== null) setFailed(t(problem));
    else onPut({ start_time: opens as string, end_time: closes as string });
  };

  return (
    <Sheet palette={palette} onClose={onClose}>
      <Text style={styles.sheetTitle} numberOfLines={1}>
        {cell.person.name}
      </Text>
      <Text style={styles.lead}>{dayLabel(cell.date)}</Text>

      {pairs.length > 0 && (
        <View style={styles.pairRow}>
          {pairs.map((pair) => {
            const held = shift?.start_time === pair.start_time && shift?.end_time === pair.end_time;

            return (
              <Press
                key={`${pair.start_time}|${pair.end_time}`}
                style={[styles.chip, held && styles.chipOn]}
                onPress={() => onPut(pair)}
              >
                <Text style={[styles.chipText, held && styles.chipTextOn]}>
                  {compactHours(pair.start_time, pair.end_time)}
                </Text>
              </Press>
            );
          })}
        </View>
      )}

      <View style={styles.timeRow}>
        <View style={styles.grow}>
          <Text style={styles.fieldLabel}>{t('Начало')}</Text>
          <TextInput
            style={styles.input}
            value={start}
            onChangeText={setStart}
            keyboardType="numbers-and-punctuation"
            placeholder="11:00"
            placeholderTextColor={palette.textSecondary}
          />
        </View>
        <View style={styles.grow}>
          <Text style={styles.fieldLabel}>{t('Конец')}</Text>
          <TextInput
            style={styles.input}
            value={end}
            onChangeText={setEnd}
            onSubmitEditing={save}
            keyboardType="numbers-and-punctuation"
            placeholder="22:00"
            placeholderTextColor={palette.textSecondary}
          />
        </View>
      </View>

      {overnight && <Text style={styles.hint}>{t('Закончится на следующий день.')}</Text>}
      {failed !== null && <Text style={styles.error}>{failed}</Text>}

      <Press style={styles.primary} onPress={save}>
        <Text style={styles.primaryText}>{t('Поставить')}</Text>
      </Press>

      {shift !== undefined && (
        <Press style={styles.ghost} onPress={() => onPut(null)}>
          <Text style={[styles.ghostText, styles.dangerText]}>{t('Убрать смену')}</Text>
        </Press>
      )}
    </Sheet>
  );
}

/** Who is on the roster. Names, not accounts: nobody here ever signs in. */
function PeopleSheet({
  rosterId,
  people,
  palette,
  onClose,
  onChange,
  onRemove,
}: {
  rosterId: number;
  people: RosterPerson[];
  palette: Palette;
  onClose: () => void;
  onChange: (people: RosterPerson[]) => void;
  onRemove: (person: RosterPerson) => Promise<void>;
}) {
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();
  const nameBox = useRef<TextInput>(null);

  const [editing, setEditing] = useState<RosterPerson | null>(null);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [colour, setColour] = useState(nextColour(people));
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const pick = (person: RosterPerson | null, around = people) => {
    setEditing(person);
    setName(person?.name ?? '');
    setPosition(person?.position ?? '');
    setColour(person?.colour ?? nextColour(around));
    setArming(false);
    setFailed(null);
  };

  const save = async () => {
    if (name.trim() === '') return;

    if (editing === null && people.length >= MOST_PEOPLE) {
      setFailed(t('В одном графике не больше 60 человек.'));

      return;
    }

    setBusy(true);
    setFailed(null);

    const body = {
      name: name.trim(),
      position: position.trim() === '' ? null : position.trim(),
      colour,
    };

    try {
      const saved =
        editing === null
          ? await rosterApi.addPerson(rosterId, body)
          : await rosterApi.updatePerson(rosterId, editing.id, body);
      const next =
        editing === null
          ? [...people, saved]
          : people.map((row) => (row.id === saved.id ? saved : row));

      onChange(next);
      pick(null, next);

      // Tolik, Grisha and Pasha go in one after another.
      if (editing === null) nameBox.current?.focus();
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не сохранилось.')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (editing === null) return;

    if (!arming) {
      setArming(true);

      return;
    }

    setBusy(true);
    setFailed(null);

    try {
      await onRemove(editing);
      pick(null, people.filter((row) => row.id !== editing.id));
    } catch (caught) {
      setFailed(t(rosterProblem(caught, 'Не получилось.')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.editor,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.editorHead}>
            <Text style={styles.sheetTitle}>{editing === null ? t('Добавить человека') : editing.name}</Text>
            <Press hitSlop={12} onPress={onClose} accessibilityLabel={t('Закрыть')}>
              <Ionicons name="close" size={26} color={palette.textSecondary} />
            </Press>
          </View>

          <Text style={styles.fieldLabel}>{t('Имя')}</Text>
          <TextInput
            ref={nameBox}
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            autoCapitalize="words"
            placeholder={t('Толик')}
            placeholderTextColor={palette.textSecondary}
          />

          <Text style={styles.fieldLabel}>{t('Должность')}</Text>
          <TextInput
            style={styles.input}
            value={position}
            onChangeText={setPosition}
            onSubmitEditing={() => void save()}
            maxLength={POSITION_MAX}
            placeholder={t('Кальяны, бар, админ')}
            placeholderTextColor={palette.textSecondary}
          />

          <Text style={styles.fieldLabel}>{t('Цвет')}</Text>
          <View style={styles.swatches}>
            {ROSTER_COLOURS.map((swatch) => (
              <Press
                key={swatch}
                style={[styles.swatch, { backgroundColor: swatch }, colour === swatch && styles.swatchOn]}
                onPress={() => setColour(swatch)}
                accessibilityLabel={`${t('Цвет')} ${swatch}`}
              >
                <Ionicons name="checkmark" size={15} color={colour === swatch ? '#fff' : 'transparent'} />
              </Press>
            ))}
          </View>

          {failed !== null && <Text style={styles.error}>{failed}</Text>}

          <Press
            style={[styles.primary, (busy || name.trim() === '') && styles.dimmed]}
            disabled={busy || name.trim() === ''}
            onPress={() => void save()}
          >
            <Text style={styles.primaryText}>{editing === null ? t('Добавить') : t('Сохранить')}</Text>
          </Press>

          {editing !== null && (
            <>
              <Press style={styles.ghost} disabled={busy} onPress={() => void remove()}>
                <Text style={[styles.ghostText, styles.dangerText]}>
                  {arming ? t('Точно убрать? Его смены уйдут тоже') : t('Убрать из графика')}
                </Text>
              </Press>
              <Press style={styles.ghost} disabled={busy} onPress={() => pick(null)}>
                <Text style={styles.ghostText}>{t('Отмена')}</Text>
              </Press>
            </>
          )}

          {people.length > 0 && (
            <View style={styles.peopleList}>
              {people.map((person) => (
                <Press key={person.id} style={styles.personLine} onPress={() => pick(person)}>
                  <View style={[styles.dot, { backgroundColor: person.colour }]} />
                  <View style={styles.grow}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {person.name}
                    </Text>
                    {person.position !== null && (
                      <Text style={styles.personPosition} numberOfLines={1}>
                        {person.position}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
                </Press>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
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

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    title: { flex: 1, color: palette.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
    newButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderColor: palette.accent,
      borderWidth: 1,
      backgroundColor: palette.accentSoft,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    newButtonText: { color: palette.accent, fontSize: 13, fontWeight: '700' },
    grow: { flex: 1 },
    pad: { marginHorizontal: 14 },
    problem: { color: palette.danger, fontSize: 13, paddingHorizontal: 14, paddingBottom: 6 },
    note: { color: palette.textSecondary, fontSize: 13, lineHeight: 18 },
    error: { color: palette.danger, fontSize: 13 },
    lead: { color: palette.textSecondary, fontSize: 14, lineHeight: 20 },
    hint: { color: palette.textSecondary, fontSize: 12, lineHeight: 17 },

    rosterRow: { gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
    chip: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      maxWidth: 220,
    },
    chipOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    chipText: { color: palette.text, fontSize: 13, fontWeight: '600' },
    chipTextOn: { color: '#fff' },

    card: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      gap: 8,
    },
    cardTitle: { color: palette.text, fontSize: 17, fontWeight: '700' },

    bookHead: { paddingHorizontal: 14, paddingBottom: 8, gap: 8 },
    bookTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    bookTitlePress: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    bookTitle: { color: palette.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
    saveMark: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
    saveWord: { color: palette.textSecondary, fontSize: 12.5 },
    saveWordFailed: { color: palette.danger, fontWeight: '600' },
    monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    arrow: { padding: 6 },
    monthName: { color: palette.text, fontSize: 16, fontWeight: '700' },

    list: { flex: 1 },
    listInner: { paddingHorizontal: 14 },
    listHead: { gap: 10, paddingBottom: 10 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderColor: palette.border,
      borderWidth: 1,
      backgroundColor: palette.backgroundElement,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    actionText: { color: palette.accent, fontSize: 13, fontWeight: '600' },

    dayCard: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
      marginBottom: 10,
    },
    dayCardWeekend: { backgroundColor: palette.backgroundSelected },
    dayCardToday: { borderColor: palette.accent },
    dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dayName: { color: palette.text, fontSize: 14, fontWeight: '700' },
    dayNameToday: { color: palette.accent },
    dayToday: { color: palette.accent, fontSize: 12, fontWeight: '700' },
    personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    personName: { color: palette.text, fontSize: 15, fontWeight: '600' },
    personPosition: { color: palette.textSecondary, fontSize: 12 },
    personHours: { color: palette.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
    freeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    freeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
      maxWidth: 160,
    },
    freeName: { color: palette.textSecondary, fontSize: 12.5 },
    fold: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 10,
    },
    foldText: { color: palette.textSecondary, fontSize: 13, fontWeight: '600' },

    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheetHolder: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      flexGrow: 0,
      maxHeight: '86%',
      backgroundColor: palette.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    sheetInner: { padding: 20, gap: 10 },
    sheetTitle: { flexShrink: 1, color: palette.text, fontSize: 20, fontWeight: '800' },
    pairRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    timeRow: { flexDirection: 'row', gap: 10 },
    fieldLabel: { color: palette.textSecondary, fontSize: 13, marginBottom: 4 },
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
    url: { color: palette.textSecondary, fontFamily: 'Menlo', fontSize: 12 },

    editor: { padding: 16, gap: 8 },
    editorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    swatch: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchOn: { borderWidth: 2, borderColor: palette.text },
    peopleList: { marginTop: 14 },
    personLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderTopColor: palette.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingVertical: 10,
    },

    primary: {
      backgroundColor: palette.accent,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 6,
    },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    dimmed: { opacity: 0.5 },
    ghost: {
      alignItems: 'center',
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    ghostText: { color: palette.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
    dangerText: { color: palette.danger },
  });
