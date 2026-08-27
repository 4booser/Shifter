import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
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
import { rateLine, ShiftTemplate } from '@/lib/types';

interface Team {
  id: number;
  name: string;
  is_owner: boolean;
  member_count: number;
  invite_code: string | null;
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
}

interface Blocked {
  user_id: number;
  date: string;
  reason: string | null;
  mine: boolean;
}

interface Board {
  members: { user_id: number; display_name: string; is_manager: boolean }[];
  assignments: Assignment[];
  can_plan: boolean;
  can_grant: boolean;
  blocked: Blocked[];
}

interface RotaMember {
  member_id: number;
  display_name: string;
  is_you: boolean;
  colour: string;
}

interface RotaEntry {
  day_shift_id: number;
  member_id: number;
  date: string;
  shift_name: string;
  member_colour: string;
  start_time: string;
  end_time: string;
  needs_cover: boolean;
  is_mine: boolean;
}

/** A crew member going out on the board that day — the fact, not the money. */
interface RotaGig {
  member_id: number;
  date: string;
  employment: 'freelance' | 'permanent';
  start: string;
  end: string;
}

/** A swap in flight: two shifts and two agreements. */
interface Swap {
  id: number;
  mine: boolean;
  proposer_name: string;
  target_name: string;
  proposer_date: string;
  proposer_shift: string;
  proposer_start: string;
  proposer_end: string;
  target_date: string;
  target_shift: string;
  target_start: string;
  target_end: string;
  note: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
}

interface Rota {
  team_name: string;
  members: RotaMember[];
  entries: RotaEntry[];
  gig_outings: RotaGig[];
}

/** Fourteen days: the horizon a crew actually argues about. */
const HORIZON = 14;

const windowDates = (): string[] => {
  const today = new Date(`${todayKey()}T00:00:00`);

  return Array.from({ length: HORIZON }, (_, step) => {
    const at = new Date(today);

    at.setDate(at.getDate() + step);

    // Local parts, not toISOString: east of Greenwich that reads a local
    // midnight as the previous day, and the fortnight starts yesterday.
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  });
};

/**
 * The crew's fortnight, from the crew's side. A manager's wall-sized board
 * does not fit a phone and does not need to: what a person opens their
 * phone for is what they are working, what they have been offered, and
 * which days they have already said no to.
 */
export default function ScheduleScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const dates = useMemo(windowDates, []);
  const span = { from: dates[0], to: dates[dates.length - 1] };

  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [rota, setRota] = useState<Rota | null>(null);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [mine, setMine] = useState<Assignment[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [accepting, setAccepting] = useState<Assignment | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await api<Team[]>('/shifter/v1/teams');

        setTeams(list);
        setTeamId((current) => current ?? list[0]?.id ?? null);
      } catch {
        setTeams([]);
        setError('Не дотянулись до сервера.');
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (teamId === null) return;

    try {
      const [boardData, rotaData, mineData, shifts, swapRows] = await Promise.all([
        api<Board>(`/shifter/v1/teams/${teamId}/planner?from=${span.from}&to=${span.to}`),
        api<Rota>(`/shifter/v1/teams/${teamId}/rota?from=${span.from}&to=${span.to}`),
        api<Assignment[]>(`/shifter/v1/teams/${teamId}/planner/mine`),
        api<ShiftTemplate[]>('/shifter/v1/shifts'),
        api<Swap[]>(`/shifter/v1/teams/${teamId}/swaps`),
      ]);

      setBoard(boardData);
      setRota(rotaData);
      setSwaps(swapRows);
      setMine(mineData);
      setTemplates(shifts.filter((item) => !item.archived));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не дотянулись до сервера.');
    }
  }, [teamId, span.from, span.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (assignment: Assignment, templateId: number | null) => {
    if (teamId === null) return;

    try {
      await api(
        `/shifter/v1/teams/${teamId}/planner/assignments/${assignment.id}/${templateId === null ? 'decline' : 'accept'}`,
        { method: 'POST', body: templateId === null ? {} : { template_id: templateId } },
      );
      setAccepting(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не отправилось.');
    }
  };

  const decideSwap = async (swap: Swap, take: boolean) => {
    if (teamId === null) return;

    try {
      await api(
        `/shifter/v1/teams/${teamId}/swaps/${swap.id}/${take ? 'accept' : 'withdraw'}`,
        { method: 'POST', body: {} },
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не получилось.');
    }
  };

  const blockDay = async (date: string) => {
    if (teamId === null) return;

    try {
      await api(`/shifter/v1/teams/${teamId}/planner/availability`, {
        method: 'POST',
        body: { date, reason: null },
      });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не сохранилось.');
    }
  };

  const offered = mine.filter((row) => row.status === 'published');
  const blockedDays = new Set((board?.blocked ?? []).filter((row) => row.mine).map((row) => row.date));

  const names = new Map((rota?.members ?? []).map((member) => [member.member_id, member]));
  const shiftsByDate = new Map<string, RotaEntry[]>();
  const gigsByDate = new Map<string, RotaGig[]>();

  for (const entry of rota?.entries ?? [])
    shiftsByDate.set(entry.date, [...(shiftsByDate.get(entry.date) ?? []), entry]);

  for (const outing of rota?.gig_outings ?? [])
    gigsByDate.set(outing.date, [...(gigsByDate.get(outing.date) ?? []), outing]);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <Text style={styles.title}>График</Text>

        {teams === null && <ActivityIndicator color={palette.accent} />}

        {teams !== null && teams.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Вы пока не в команде</Text>
            <Text style={styles.lead}>
              Попросите у старшего код приглашения — и увидите общий график, свои смены и кто
              выходит вместе с вами.
            </Text>
            <Pressable style={styles.primary} onPress={() => setJoining(true)}>
              <Text style={styles.primaryText}>Ввести код</Text>
            </Pressable>
          </View>
        )}

        {teams !== null && teams.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamRow}>
            {teams.map((team) => (
              <Pressable
                key={team.id}
                style={[styles.teamChip, team.id === teamId && styles.teamChipOn]}
                onPress={() => setTeamId(team.id)}
              >
                <Text style={[styles.teamChipText, team.id === teamId && styles.teamChipTextOn]}>
                  {team.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {error !== null && <Text style={styles.error}>{error}</Text>}

        {offered.length > 0 && (
          <View style={styles.offerBox}>
            <Text style={styles.offerTitle}>Вам предложили смены</Text>
            {offered.map((row) => (
              <View key={row.id} style={styles.offerRow}>
                <View style={styles.grow}>
                  <Text style={styles.offerWhen}>{dayLabel(row.date)}</Text>
                  <Text style={styles.offerWhat}>
                    {row.title} · {row.start}–{row.end}
                  </Text>
                </View>
                <Pressable style={styles.yes} onPress={() => setAccepting(row)}>
                  <Text style={styles.yesText}>Беру</Text>
                </Pressable>
                <Pressable style={styles.no} onPress={() => void decide(row, null)}>
                  <Text style={styles.noText}>Не могу</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {swaps.filter((swap) => swap.status === 'pending').length > 0 && (
          <View style={styles.swapBox}>
            <Text style={styles.offerTitle}>Обмены сменами</Text>
            {swaps
              .filter((swap) => swap.status === 'pending')
              .map((swap) => (
                <View key={swap.id} style={styles.swapRow}>
                  <Text style={styles.swapWho}>
                    {swap.mine
                      ? `Вы предложили ${swap.target_name}`
                      : `${swap.proposer_name} предлагает обмен`}
                  </Text>
                  <Text style={styles.swapWhat}>
                    {dayLabel(swap.proposer_date)} · {swap.proposer_shift} {swap.proposer_start}–
                    {swap.proposer_end}
                  </Text>
                  <Text style={styles.swapArrow}>⇅</Text>
                  <Text style={styles.swapWhat}>
                    {dayLabel(swap.target_date)} · {swap.target_shift} {swap.target_start}–
                    {swap.target_end}
                  </Text>
                  {swap.note !== null && swap.note !== '' && (
                    <Text style={styles.swapNote}>«{swap.note}»</Text>
                  )}

                  {/* Only the other side can agree; the proposer can only take
                      it back, which is why these are not the same button. */}
                  <Pressable
                    style={[swap.mine ? styles.no : styles.yes, styles.swapButton]}
                    onPress={() => void decideSwap(swap, !swap.mine)}
                  >
                    <Text style={swap.mine ? styles.noText : styles.yesText}>
                      {swap.mine ? 'Отозвать' : 'Согласиться'}
                    </Text>
                  </Pressable>
                </View>
              ))}
          </View>
        )}

        {teamId !== null && board !== null && (
          <>
            <Text style={styles.sectionTitle}>Кто выходит</Text>

            {dates.map((date) => {
              const rows = shiftsByDate.get(date) ?? [];
              const outings = gigsByDate.get(date) ?? [];
              const blocked = blockedDays.has(date);

              return (
                <View key={date} style={styles.dayCard}>
                  <View style={styles.dayHead}>
                    <Text style={[styles.dayName, date === todayKey() && styles.dayNameToday]}>
                      {dayLabel(date)}
                    </Text>
                    <Pressable hitSlop={8} onPress={() => void blockDay(date)}>
                      <Text style={[styles.block, blocked && styles.blockOn]}>
                        {blocked ? 'не могу ✓' : 'не могу'}
                      </Text>
                    </Pressable>
                  </View>

                  {rows.length === 0 && outings.length === 0 ? (
                    <Text style={styles.dayEmpty}>никого не поставили</Text>
                  ) : (
                    <>
                      {rows.map((entry) => (
                        <View key={entry.day_shift_id} style={styles.personRow}>
                          <View style={[styles.dot, { backgroundColor: entry.member_colour }]} />
                          <Text style={styles.personName} numberOfLines={1}>
                            {names.get(entry.member_id)?.display_name ?? 'кто-то'}
                            {entry.is_mine ? ' · вы' : ''}
                          </Text>
                          {entry.needs_cover && <Text style={styles.cover}>ищет замену</Text>}
                          <Text style={styles.personWhen}>
                            {entry.start_time}–{entry.end_time}
                          </Text>
                        </View>
                      ))}

                      {/* A crew member going out on the board is not absent —
                          they are working somewhere else, and the crew planning
                          around them needs to know which kind. */}
                      {outings.map((outing, at) => (
                        <View key={`gig-${outing.member_id}-${at}`} style={styles.personRow}>
                          <View style={[styles.dot, { backgroundColor: palette.textSecondary }]} />
                          <Text style={styles.personName} numberOfLines={1}>
                            {names.get(outing.member_id)?.display_name ?? 'кто-то'}
                          </Text>
                          <Text style={styles.outing}>
                            {outing.employment === 'freelance' ? 'фриланс' : 'постоянка'}
                          </Text>
                          <Text style={styles.personWhen}>
                            {outing.start}–{outing.end}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <JoinModal
        open={joining}
        palette={palette}
        onClose={() => setJoining(false)}
        onJoined={async (team) => {
          setJoining(false);
          setTeams((list) => [...(list ?? []), team]);
          setTeamId(team.id);
        }}
      />

      <TemplateModal
        assignment={accepting}
        templates={templates}
        palette={palette}
        onClose={() => setAccepting(null)}
        onPick={(templateId) => {
          if (accepting !== null) void decide(accepting, templateId);
        }}
        onMade={() => void load()}
      />
    </>
  );
}

/**
 * Accepting a shift means it lands on your own calendar, and a shift on your
 * calendar has to be priced. Rather than making somebody leave, build a
 * template on the site and come back, this offers to make one out of the
 * shift they are being offered: the hours are already known, and the terms
 * are two fields and a choice.
 */
function TemplateModal({
  assignment,
  templates,
  palette,
  onClose,
  onPick,
  onMade,
}: {
  assignment: Assignment | null;
  templates: ShiftTemplate[];
  palette: Palette;
  onClose: () => void;
  onPick: (templateId: number) => void;
  onMade: () => void;
}) {
  const styles = makeStyles(palette);

  const [making, setMaking] = useState(false);
  const [period, setPeriod] = useState<'hour' | 'day' | 'month'>('hour');
  const [amount, setAmount] = useState('');
  const [percent, setPercent] = useState('');
  const [pooled, setPooled] = useState(false);
  const [poolShare, setPoolShare] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    setMaking(templates.length === 0);
    setAmount('');
    setPercent('');
    setPooled(false);
    setPoolShare('');
    setFailed(null);
  }, [assignment, templates.length]);

  const create = async () => {
    if (assignment === null) return;

    setBusy(true);
    setFailed(null);

    try {
      // The hours come from the shift being offered — they are the one part
      // nobody should have to retype.
      const made = await api<ShiftTemplate>('/shifter/v1/shifts', {
        method: 'POST',
        body: {
          name: assignment.title,
          symbol: null,
          location_id: null,
          start_time: assignment.start,
          end_time: assignment.end,
          salary_period: period,
          salary_amount: Number(amount.replace(',', '.')) || 0,
          break_minutes: 0,
          colour: null,
          revenue_percent: percent.trim() === '' ? null : Number(percent.replace(',', '.')),
          tip_source: pooled ? 'pool' : 'personal',
          tip_pool_percent: pooled && poolShare.trim() !== '' ? Number(poolShare.replace(',', '.')) : null,
        },
      });

      onMade();
      onPick(made.id);
    } catch (caught) {
      setFailed(caught instanceof ApiError ? caught.message : 'Шаблон не создался.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={assignment !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <ScrollView style={styles.tallSheet} contentContainerStyle={styles.tallSheetInner}>
        <Text style={styles.sheetTitle}>Чем считать эту смену</Text>
        <Text style={styles.lead}>
          {assignment !== null
            ? `${assignment.title} · ${dayLabel(assignment.date)}, ${assignment.start}–${assignment.end}`
            : ''}
        </Text>

        {!making && (
          <>
            {templates.map((template) => (
              <Pressable key={template.id} style={styles.templateRow} onPress={() => onPick(template.id)}>
                <View style={styles.grow}>
                  <Text style={styles.templateName}>{template.name}</Text>
                  <Text style={styles.templateTime}>
                    {template.start_time}–{template.end_time} · {rateLine(template)}
                  </Text>
                </View>
              </Pressable>
            ))}

            <Pressable style={styles.ghostRow} onPress={() => setMaking(true)}>
              <Ionicons name="add-circle-outline" size={20} color={palette.accent} />
              <Text style={styles.ghostRowText}>Новый шаблон по этой смене</Text>
            </Pressable>
          </>
        )}

        {making && (
          <>
            <Text style={styles.fieldLabel}>Платят</Text>
            <View style={styles.segmentRow}>
              {([
                ['hour', 'за час'],
                ['day', 'за смену'],
                ['month', 'в месяц'],
              ] as const).map(([value, label]) => (
                <Pressable
                  key={value}
                  style={[styles.segment, period === value && styles.segmentOn]}
                  onPress={() => setPeriod(value)}
                >
                  <Text style={[styles.segmentText, period === value && styles.segmentTextOn]}>
                    {label}
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
            <Text style={styles.hint}>
              Ставку и процент можно взять вместе — тогда каждый день будет спрашивать выручку
              смены.
            </Text>

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
              <>
                <TextInput
                  style={styles.input}
                  value={poolShare}
                  onChangeText={setPoolShare}
                  keyboardType="numeric"
                  placeholder="Ваша доля, %"
                  placeholderTextColor={palette.textSecondary}
                />
                <Text style={styles.hint}>
                  Каждый день вводите общак — вашу долю посчитаем сами.
                </Text>
              </>
            )}

            {failed !== null && <Text style={styles.error}>{failed}</Text>}

            <Pressable
              style={[styles.primary, busy && { opacity: 0.6 }]}
              disabled={busy}
              onPress={() => void create()}
            >
              <Text style={styles.primaryText}>
                {busy ? 'Создаём…' : 'Создать и взять смену'}
              </Text>
            </Pressable>

            {templates.length > 0 && (
              <Pressable style={styles.ghostRow} onPress={() => setMaking(false)}>
                <Text style={styles.ghostRowText}>Выбрать из готовых</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </Modal>
  );
}

function JoinModal({
  open,
  palette,
  onClose,
  onJoined,
}: {
  open: boolean;
  palette: Palette;
  onClose: () => void;
  onJoined: (team: Team) => void;
}) {
  const styles = makeStyles(palette);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setFailed(null);

    try {
      onJoined(
        await api<Team>('/shifter/v1/teams/join', {
          method: 'POST',
          body: { invite_code: code.trim(), display_name: null },
        }),
      );
      setCode('');
    } catch (caught) {
      setFailed(caught instanceof ApiError ? caught.message : 'Код не подошёл.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>Код приглашения</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="ABCD-1234"
          placeholderTextColor={palette.textSecondary}
        />
        {failed !== null && <Text style={styles.error}>{failed}</Text>}
        <Pressable
          style={[styles.primary, (busy || code.trim() === '') && { opacity: 0.5 }]}
          disabled={busy || code.trim() === ''}
          onPress={() => void join()}
        >
          <Text style={styles.primaryText}>{busy ? 'Заходим…' : 'Войти в команду'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 14, paddingBottom: 48, gap: 10 },
    title: { color: palette.text, fontSize: 30, fontWeight: '800' },
    grow: { flex: 1 },
    error: { color: palette.danger, fontSize: 13 },
    lead: { color: palette.textSecondary, fontSize: 14, lineHeight: 20 },

    card: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      gap: 8,
    },
    cardTitle: { color: palette.text, fontSize: 17, fontWeight: '700' },

    teamRow: { gap: 8, paddingVertical: 2 },
    teamChip: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    teamChipOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    teamChipText: { color: palette.text, fontSize: 13, fontWeight: '600' },
    teamChipTextOn: { color: '#fff' },

    offerBox: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accent,
      borderWidth: 1,
      borderRadius: 18,
      padding: 14,
      gap: 10,
    },
    offerTitle: { color: palette.text, fontSize: 16, fontWeight: '700' },
    offerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    offerWhen: { color: palette.text, fontSize: 14, fontWeight: '700' },
    offerWhat: { color: palette.textSecondary, fontSize: 12, marginTop: 2 },
    yes: {
      backgroundColor: palette.accent,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    yesText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    no: { borderColor: palette.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
    noText: { color: palette.textSecondary, fontSize: 13 },

    sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '700', marginTop: 8 },
    swapBox: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 14,
      gap: 10,
    },
    swapRow: {
      borderTopColor: palette.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 10,
      gap: 3,
    },
    swapWho: { color: palette.text, fontSize: 14, fontWeight: '700' },
    swapWhat: { color: palette.textSecondary, fontSize: 13 },
    swapArrow: { color: palette.accent, fontSize: 13, fontWeight: '700' },
    swapNote: { color: palette.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
    // A column parent would stretch these to the full width otherwise.
    swapButton: { alignSelf: 'flex-start', marginTop: 8 },
    dayCard: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 6,
    },
    dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dayName: { color: palette.text, fontSize: 14, fontWeight: '700' },
    dayNameToday: { color: palette.accent },
    block: { color: palette.textSecondary, fontSize: 12 },
    blockOn: { color: palette.danger, fontWeight: '700' },
    dayEmpty: { color: palette.textSecondary, fontSize: 12 },
    personRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    cover: { color: palette.danger, fontSize: 11 },
    outing: {
      color: palette.textSecondary,
      fontSize: 11,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 1,
      overflow: 'hidden',
    },
    personName: { color: palette.text, fontSize: 14, flex: 1 },
    personWhen: { color: palette.textSecondary, fontSize: 12 },

    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: palette.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 36,
      gap: 10,
    },
    sheetTitle: { color: palette.text, fontSize: 20, fontWeight: '800' },
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
    tallSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: '86%',
      backgroundColor: palette.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    tallSheetInner: { padding: 20, paddingBottom: 40, gap: 10 },
    hint: { color: palette.textSecondary, fontSize: 12, lineHeight: 17 },
    fieldLabel: { color: palette.textSecondary, fontSize: 13, marginTop: 8 },
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
    ghostRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 13,
      marginTop: 6,
    },
    ghostRowText: { color: palette.accent, fontSize: 14, fontWeight: '600' },
    templateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    templateName: { color: palette.text, fontSize: 15, fontWeight: '600' },
    templateTime: { color: palette.textSecondary, fontSize: 13 },

    primary: {
      backgroundColor: palette.accent,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 6,
    },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
