import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { dayLabel, pad, todayKey } from '@/lib/calendar';
import { ShiftTemplate } from '@/lib/types';

interface Member {
  user_id: number;
  display_name: string;
  colour: string;
  is_manager: boolean;
}

interface Assignment {
  id: number;
  user_id: number;
  user_name: string;
  date: string;
  title: string;
  start: string;
  end: string;
  note: string | null;
  status: 'draft' | 'published' | 'accepted' | 'declined';
  role: PlanRole;
}

interface Blocked {
  user_id: number;
  date: string;
  reason: string | null;
  mine: boolean;
}

interface CoverageDay {
  date: string;
  roles: { role: PlanRole; count: number }[];
  unset: number;
}

interface Board {
  members: Member[];
  assignments: Assignment[];
  can_plan: boolean;
  blocked: Blocked[];
  coverage: CoverageDay[];
}

type PlanRole = 'bar' | 'kitchen' | 'floor' | 'host' | 'support' | 'manager' | '';

const ROLES: { value: PlanRole; label: string; emoji: string }[] = [
  { value: 'bar', label: 'Бар', emoji: '🍸' },
  { value: 'kitchen', label: 'Кухня', emoji: '🔥' },
  { value: 'floor', label: 'Зал', emoji: '🍽️' },
  { value: 'host', label: 'Хостес', emoji: '💁' },
  { value: 'support', label: 'Подсобка', emoji: '🧼' },
  { value: 'manager', label: 'Менеджер', emoji: '🎩' },
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** The Monday of the week holding this day. */
const weekOf = (key: string): string[] => {
  const date = new Date(`${key}T00:00:00`);
  const monday = new Date(date);

  monday.setDate(monday.getDate() - ((date.getDay() + 6) % 7));

  return Array.from({ length: 7 }, (_, step) => {
    const at = new Date(monday);

    at.setDate(at.getDate() + step);

    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  });
};

/**
 * The manager's board, in a hand. A week scrolls sideways with a person per
 * row, because that is the shape a rota is argued about in — and because the
 * argument happens on the way to work, not at a desk.
 */
export default function BoardScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const [teamId, setTeamId] = useState<number | null>(null);
  const [teams, setTeams] = useState<{ id: number; name: string }[]>([]);
  const [anchor, setAnchor] = useState(todayKey());
  const [board, setBoard] = useState<Board | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [editing, setEditing] = useState<{ userId: number; date: string; id: number | null } | null>(null);
  const [filling, setFilling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => weekOf(anchor), [anchor]);

  useEffect(() => {
    void (async () => {
      try {
        const list = await api<{ id: number; name: string }[]>('/shifter/v1/teams');

        setTeams(list);
        setTeamId((current) => current ?? list[0]?.id ?? null);
      } catch {
        setError('Не дотянулись до сервера.');
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (teamId === null) return;

    try {
      const [data, shifts] = await Promise.all([
        api<Board>(`/shifter/v1/teams/${teamId}/planner?from=${days[0]}&to=${days[6]}`),
        api<ShiftTemplate[]>('/shifter/v1/shifts'),
      ]);

      setBoard(data);
      setTemplates(shifts.filter((item) => !item.archived));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не дотянулись до сервера.');
    }
  }, [teamId, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const shift = (weeks: number) => {
    const date = new Date(`${anchor}T00:00:00`);

    date.setDate(date.getDate() + weeks * 7);
    setAnchor(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
  };

  const publish = async () => {
    if (teamId === null) return;

    setBusy(true);

    try {
      const result = await api<{ published: number; people: number }>(
        `/shifter/v1/teams/${teamId}/planner/publish?from=${days[0]}&to=${days[6]}`,
        { method: 'POST', body: {} },
      );

      setError(
        result.published === 0
          ? 'Публиковать нечего — черновиков нет.'
          : `Опубликовано ${result.published} — люди получат уведомление.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не опубликовалось.');
    } finally {
      setBusy(false);
    }
  };

  const handOut = async (slot: {
    date: string;
    title: string;
    start: string;
    end: string;
    role: PlanRole;
    count: number;
  }) => {
    if (teamId === null) return;

    setBusy(true);

    try {
      const result = await api<{ placed: unknown[]; shortfall: string | null }>(
        `/shifter/v1/teams/${teamId}/planner/fill`,
        { method: 'POST', body: { ...slot, role: slot.role === '' ? null : slot.role } },
      );

      setError(result.shortfall ?? `Раздали ${result.placed.length}.`);
      setFilling(false);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не раздалось.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: Assignment) => {
    if (teamId === null) return;

    try {
      await api(`/shifter/v1/teams/${teamId}/planner/assignments/${entry.id}`, { method: 'DELETE' });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалилось.');
    }
  };

  const blocked = new Set((board?.blocked ?? []).map((row) => `${row.user_id}|${row.date}`));
  const coverage = new Map((board?.coverage ?? []).map((day) => [day.date, day]));
  const drafts = (board?.assignments ?? []).filter((row) => row.status === 'draft').length;

  const cells = (userId: number, date: string) =>
    (board?.assignments ?? []).filter((row) => row.user_id === userId && row.date === date);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.head}>
          <Text style={styles.title}>Доска</Text>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <Ionicons name="close" size={26} color={palette.textSecondary} />
          </Pressable>
        </View>

        {teams.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamRow}>
            {teams.map((team) => (
              <Pressable
                key={team.id}
                style={[styles.chip, team.id === teamId && styles.chipOn]}
                onPress={() => setTeamId(team.id)}
              >
                <Text style={[styles.chipText, team.id === teamId && styles.chipTextOn]}>{team.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.weekNav}>
          <Pressable style={styles.navButton} onPress={() => shift(-1)}>
            <Ionicons name="chevron-back" size={18} color={palette.text} />
          </Pressable>
          <Text style={styles.weekLabel}>
            {days[0].slice(8)}.{days[0].slice(5, 7)} — {days[6].slice(8)}.{days[6].slice(5, 7)}
          </Text>
          <Pressable style={styles.navButton} onPress={() => shift(1)}>
            <Ionicons name="chevron-forward" size={18} color={palette.text} />
          </Pressable>
        </View>

        {error !== null && <Text style={styles.error}>{error}</Text>}
        {board === null && error === null && <ActivityIndicator color={palette.accent} />}

        {board !== null && !board.can_plan && (
          <Text style={styles.lead}>
            Доску ведёт старший команды. Свои смены и кто выходит — во вкладке «График».
          </Text>
        )}

        {board !== null && board.can_plan && (
          <>
            {/* A week does not fit a phone across, so it scrolls the way a
                rota on paper does: sideways, with the names pinned. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.row}>
                  <View style={styles.nameCell} />
                  {days.map((day) => {
                    const cover = coverage.get(day);

                    return (
                      <View key={day} style={styles.dayHead}>
                        <Text style={[styles.dayName, day === todayKey() && styles.today]}>
                          {WEEKDAYS[(new Date(`${day}T00:00:00`).getDay() + 6) % 7]}
                        </Text>
                        <Text style={[styles.dayNumber, day === todayKey() && styles.today]}>
                          {Number(day.slice(8))}
                        </Text>
                        <Text style={styles.dayCover}>
                          {cover === undefined
                            ? 'пусто'
                            : [
                                ...cover.roles.map(
                                  (role) =>
                                    `${ROLES.find((item) => item.value === role.role)?.emoji ?? ''}${role.count}`,
                                ),
                                ...(cover.unset > 0 ? [`·${cover.unset}`] : []),
                              ].join(' ')}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {board.members.map((member) => (
                  <View key={member.user_id} style={styles.row}>
                    <View style={styles.nameCell}>
                      <View style={[styles.dot, { backgroundColor: member.colour }]} />
                      <Text style={styles.nameText} numberOfLines={1}>
                        {member.display_name}
                      </Text>
                    </View>

                    {days.map((day) => (
                      <Pressable
                        key={day}
                        style={[
                          styles.cell,
                          blocked.has(`${member.user_id}|${day}`) && styles.cellBlocked,
                        ]}
                        onPress={() => setEditing({ userId: member.user_id, date: day, id: null })}
                      >
                        {cells(member.user_id, day).map((entry) => (
                          <Pressable
                            key={entry.id}
                            style={[
                              styles.chipCell,
                              entry.status === 'draft' && styles.chipDraft,
                              entry.status === 'declined' && styles.chipDeclined,
                              entry.status === 'accepted' && styles.chipAccepted,
                            ]}
                            onLongPress={() => void remove(entry)}
                          >
                            <Text style={styles.chipCellText} numberOfLines={1}>
                              {entry.role !== ''
                                ? `${ROLES.find((role) => role.value === entry.role)?.emoji} `
                                : ''}
                              {entry.title}
                            </Text>
                            <Text style={styles.chipCellTime}>
                              {entry.start}–{entry.end}
                            </Text>
                          </Pressable>
                        ))}
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.hint}>
              Тап по клетке — поставить смену, долгий тап по смене — убрать. Заштрихованный день
              человек отметил как «не могу».
            </Text>

            <Pressable style={styles.ghost} onPress={() => setFilling(true)}>
              <Text style={styles.ghostText}>🎲 Раздать смену</Text>
            </Pressable>

            <Pressable
              style={[styles.primary, (busy || drafts === 0) && { opacity: 0.5 }]}
              disabled={busy || drafts === 0}
              onPress={() => void publish()}
            >
              <Text style={styles.primaryText}>
                {drafts === 0 ? 'Черновиков нет' : `Опубликовать неделю · ${drafts}`}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <FillSheet
        open={filling}
        days={days}
        templates={templates}
        palette={palette}
        busy={busy}
        onClose={() => setFilling(false)}
        onFill={handOut}
      />

      <CellEditor
        editing={editing}
        teamId={teamId}
        templates={templates}
        palette={palette}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </>
  );
}

/**
 * Handing one slot out. The board decides who — that is the whole reason to
 * ask it rather than tap seven cells — so this collects only what the slot is
 * and how many of it are needed.
 */
function FillSheet({
  open,
  days,
  templates,
  palette,
  busy,
  onClose,
  onFill,
}: {
  open: boolean;
  days: string[];
  templates: ShiftTemplate[];
  palette: Palette;
  busy: boolean;
  onClose: () => void;
  onFill: (slot: {
    date: string;
    title: string;
    start: string;
    end: string;
    role: PlanRole;
    count: number;
  }) => void;
}) {
  const styles = makeStyles(palette);

  const [date, setDate] = useState(days[0]);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('02:00');
  const [role, setRole] = useState<PlanRole>('');
  const [count, setCount] = useState('2');

  useEffect(() => {
    if (!open) return;

    setDate(days[0]);

    if (title === '' && templates.length > 0) {
      setTitle(templates[0].name);
      setStart(templates[0].start_time.slice(0, 5));
      setEnd(templates[0].end_time.slice(0, 5));
    }
    // Opening is the trigger; the last values are deliberately kept.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <ScrollView style={styles.tallSheet} contentContainerStyle={styles.sheetInner}>
        <Text style={styles.sheetTitle}>Раздать смену</Text>
        <Text style={styles.lead}>
          Достанется тем, у кого неделя легче и кто не отметил «не могу». Черновиками — потом можно
          поправить.
        </Text>

        <Text style={styles.fieldLabel}>День</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamRow}>
          {days.map((day) => (
            <Pressable
              key={day}
              style={[styles.chip, day === date && styles.chipOn]}
              onPress={() => setDate(day)}
            >
              <Text style={[styles.chipText, day === date && styles.chipTextOn]}>
                {WEEKDAYS[(new Date(`${day}T00:00:00`).getDay() + 6) % 7]} {Number(day.slice(8))}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.fieldLabel}>Название</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          maxLength={60}
          placeholder="Бар"
          placeholderTextColor={palette.textSecondary}
        />

        <View style={styles.timeRow}>
          <View style={styles.grow}>
            <Text style={styles.fieldLabel}>Начало</Text>
            <TextInput style={styles.input} value={start} onChangeText={setStart} placeholderTextColor={palette.textSecondary} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.fieldLabel}>Конец</Text>
            <TextInput style={styles.input} value={end} onChangeText={setEnd} placeholderTextColor={palette.textSecondary} />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Станция</Text>
        <View style={styles.roleRow}>
          {ROLES.map((item) => (
            <Pressable
              key={item.value}
              style={[styles.chip, role === item.value && styles.chipOn]}
              onPress={() => setRole(role === item.value ? '' : item.value)}
            >
              <Text style={[styles.chipText, role === item.value && styles.chipTextOn]}>
                {item.emoji} {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Сколько человек</Text>
        <TextInput
          style={styles.input}
          value={count}
          onChangeText={setCount}
          keyboardType="numeric"
          placeholderTextColor={palette.textSecondary}
        />

        <Pressable
          style={[styles.primary, (busy || title.trim() === '') && { opacity: 0.5 }]}
          disabled={busy || title.trim() === ''}
          onPress={() =>
            onFill({
              date,
              title: title.trim(),
              start,
              end,
              role,
              count: Math.min(20, Math.max(1, Number(count) || 1)),
            })
          }
        >
          <Text style={styles.primaryText}>{busy ? 'Раздаём…' : 'Раздать'}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

/**
 * One cell. A template fills the hours in a tap, because a manager laying out
 * a week is placing the same three shifts over and over and typing them out
 * each time is how boards stop getting filled in.
 */
function CellEditor({
  editing,
  teamId,
  templates,
  palette,
  onClose,
  onSaved,
}: {
  editing: { userId: number; date: string; id: number | null } | null;
  teamId: number | null;
  templates: ShiftTemplate[];
  palette: Palette;
  onClose: () => void;
  onSaved: () => void;
}) {
  const styles = makeStyles(palette);

  const [title, setTitle] = useState('');
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('02:00');
  const [role, setRole] = useState<PlanRole>('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (editing === null) return;

    setFailed(null);

    // The last station stays: a manager filling a Friday is filling one row
    // of the same station, not seven different ones.
    if (title === '' && templates.length > 0) {
      setTitle(templates[0].name);
      setStart(templates[0].start_time.slice(0, 5));
      setEnd(templates[0].end_time.slice(0, 5));
    }
    // Only when the sheet opens; carrying the last values is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const save = async () => {
    if (editing === null || teamId === null || title.trim() === '') return;

    setBusy(true);
    setFailed(null);

    try {
      await api(`/shifter/v1/teams/${teamId}/planner/assignments`, {
        method: 'POST',
        body: {
          user_id: editing.userId,
          date: editing.date,
          title: title.trim(),
          start,
          end,
          note: null,
          role: role === '' ? null : role,
        },
      });
      onSaved();
    } catch (caught) {
      setFailed(caught instanceof ApiError ? caught.message : 'Не поставилось.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={editing !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>Поставить смену</Text>
        <Text style={styles.lead}>{editing !== null ? dayLabel(editing.date) : ''}</Text>

        {templates.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamRow}>
            {templates.slice(0, 6).map((template) => (
              <Pressable
                key={template.id}
                style={styles.chip}
                onPress={() => {
                  setTitle(template.name);
                  setStart(template.start_time.slice(0, 5));
                  setEnd(template.end_time.slice(0, 5));
                }}
              >
                <Text style={styles.chipText}>
                  {template.symbol ?? '•'} {template.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Text style={styles.fieldLabel}>Название</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          maxLength={60}
          placeholder="Бар"
          placeholderTextColor={palette.textSecondary}
        />

        <View style={styles.timeRow}>
          <View style={styles.grow}>
            <Text style={styles.fieldLabel}>Начало</Text>
            <TextInput style={styles.input} value={start} onChangeText={setStart} placeholder="18:00" placeholderTextColor={palette.textSecondary} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.fieldLabel}>Конец</Text>
            <TextInput style={styles.input} value={end} onChangeText={setEnd} placeholder="02:00" placeholderTextColor={palette.textSecondary} />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Станция</Text>
        <View style={styles.roleRow}>
          {ROLES.map((item) => (
            <Pressable
              key={item.value}
              style={[styles.chip, role === item.value && styles.chipOn]}
              onPress={() => setRole(role === item.value ? '' : item.value)}
            >
              <Text style={[styles.chipText, role === item.value && styles.chipTextOn]}>
                {item.emoji} {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {failed !== null && <Text style={styles.error}>{failed}</Text>}

        <Pressable
          style={[styles.primary, (busy || title.trim() === '') && { opacity: 0.5 }]}
          disabled={busy || title.trim() === ''}
          onPress={() => void save()}
        >
          <Text style={styles.primaryText}>{busy ? 'Ставим…' : 'Поставить'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const CELL = 92;

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 16, paddingBottom: 44, gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: palette.text, fontSize: 26, fontWeight: '800' },
    grow: { flex: 1 },
    error: { color: palette.danger, fontSize: 13 },
    lead: { color: palette.textSecondary, fontSize: 13.5, lineHeight: 19 },
    hint: { color: palette.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 6 },

    teamRow: { gap: 8, paddingVertical: 2 },
    chip: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    chipText: { color: palette.text, fontSize: 12.5 },
    chipTextOn: { color: '#fff' },

    weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
    navButton: { borderColor: palette.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    weekLabel: { color: palette.text, fontSize: 15, fontWeight: '700', minWidth: 120, textAlign: 'center' },

    row: { flexDirection: 'row', alignItems: 'stretch' },
    nameCell: {
      width: 78,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingRight: 6,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    nameText: { color: palette.text, fontSize: 13, flex: 1 },

    dayHead: { width: CELL, alignItems: 'center', paddingBottom: 4 },
    dayName: { color: palette.textSecondary, fontSize: 11, textTransform: 'uppercase' },
    dayNumber: { color: palette.text, fontSize: 15, fontWeight: '800' },
    dayCover: { color: palette.textSecondary, fontSize: 10.5, marginTop: 1 },
    today: { color: palette.accent },

    cell: {
      width: CELL,
      minHeight: 52,
      borderColor: palette.border,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 3,
      gap: 3,
    },
    cellBlocked: { backgroundColor: palette.backgroundSelected },

    chipCell: {
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 4,
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
    },
    chipDraft: { borderStyle: 'dashed' },
    chipDeclined: { borderColor: palette.danger, opacity: 0.6 },
    chipAccepted: { borderColor: palette.good },
    chipCellText: { color: palette.text, fontSize: 11, fontWeight: '600' },
    chipCellTime: { color: palette.textSecondary, fontSize: 10 },

    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: palette.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 34,
      gap: 8,
    },
    sheetTitle: { color: palette.text, fontSize: 20, fontWeight: '800' },
    tallSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: '88%',
      backgroundColor: palette.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    sheetInner: { padding: 20, paddingBottom: 36, gap: 8 },
    fieldLabel: { color: palette.textSecondary, fontSize: 13, marginTop: 6 },
    input: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      color: palette.text,
      fontSize: 16,
    },
    timeRow: { flexDirection: 'row', gap: 10 },
    roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

    primary: {
      backgroundColor: palette.accent,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 14,
    },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    ghost: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 10,
    },
    ghostText: { color: palette.text, fontSize: 14, fontWeight: '600' },
  });
