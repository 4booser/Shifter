import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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

import { Loading, Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { addMonths, currentMonth, monthBounds, shortDate, todayKey } from '@/lib/calendar';
import { MonoStatementItem, wageCandidates } from '@/lib/mono';
import { money } from '@/lib/types';
import { useMono } from '@/store/mono';
import { t } from '@/lib/i18n';

type Status = 'open' | 'due' | 'overdue' | 'partial' | 'paid' | 'short' | 'over';

/**
 * The аванс arrives mid-month and the расчёт closes it. Recorded as one kind of
 * payment the advance reads as an underpayment every single month, which is how
 * a warning stops being read.
 */
type PayoutKind = 'settlement' | 'advance' | 'bonus' | 'cash';

const KINDS: { value: PayoutKind; label: string }[] = [
  { value: 'advance', label: 'Аванс' },
  { value: 'settlement', label: 'Расчёт' },
  { value: 'bonus', label: 'Премия' },
  { value: 'cash', label: 'Наличными' },
];

interface PayPeriodRow {
  location_id: number;
  location_name: string;
  colour: string;
  period_from: string;
  period_to: string;
  due_on: string;
  expected: number;
  paid: number;
  difference: number;
  hours: number;
  status: Status;
  days_late: number;
  stream: 'all' | 'wage' | 'commission';
  /** How much of what arrived was an advance. */
  paid_advance: number;
}

interface Shortfall {
  location_id: number;
  location_name: string;
  periods: number;
  total_short: number;
  since: string;
  stream: 'all' | 'wage' | 'commission';
}

interface Reconciliation {
  periods: PayPeriodRow[];
  shortfalls: Shortfall[];
  awaited: number;
  overdue: number;
}

interface Payout {
  id: number;
  period_from: string;
  period_to: string;
  amount: number;
  received_on: string;
  note: string | null;
  location_id: number | null;
  location_name: string | null;
  kind: PayoutKind;
  /** Which of the place's payments this settles: everything, wage or commission. */
  stream: 'all' | 'wage' | 'commission';
}

const STATUS_LABEL: Record<Status, string> = {
  open: 'В работе',
  due: 'Ожидается',
  overdue: 'Просрочено',
  partial: 'Аванс пришёл',
  paid: 'Закрыто',
  short: 'Недоплачено',
  over: 'Переплата',
};

const STREAM_LABEL: Record<PayPeriodRow['stream'], string> = {
  all: '',
  wage: 'ставка',
  commission: 'процент',
};


/**
 * Money owed, money late, money in hand. The site's payouts page in the
 * pocket: the server does the reconciliation, the phone only asks and draws,
 * so "you are owed ₴N" is the same sentence in both places.
 */
export default function PayoutsScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(palette);

  const [data, setData] = useState<Reconciliation | null>(null);
  const [history, setHistory] = useState<Payout[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<PayPeriodRow | null>(null);
  const [editing, setEditing] = useState<Payout | null>(null);
  const statement = useMono((state) => state.items);
  const bankToken = useMono((state) => state.token);
  const payers = useMono((state) => state.payers);

  // Half a year back and a month forward: enough to see what is still owed
  // without asking the server for a lifetime of history on every open.
  const range = useMemo(() => {
    const now = currentMonth();
    return {
      from: monthBounds(addMonths(now, -6)).from,
      to: monthBounds(addMonths(now, 1)).to,
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const [schedule, payouts] = await Promise.all([
        api<Reconciliation>(`/shifter/v1/payouts/schedule?from=${range.from}&to=${range.to}`),
        api<Payout[]>(`/shifter/v1/payouts?from=${range.from}&to=${range.to}`),
      ]);

      setData(schedule);
      setHistory(payouts);
      setError(null);
    } catch {
      setError(t('Не дотянулись до сервера.'));
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const periods = data?.periods ?? [];
  const ahead = periods.filter((row) => row.status !== 'paid' && row.status !== 'over');
  const settled = periods.filter((row) => row.status === 'paid' || row.status === 'over');

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
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('Выплаты')}</Text>
          {/* What the work cost lives next to what it paid: the two are read
              in the same breath and never added together. */}
          <Press style={styles.costsButton} onPress={() => router.push('/costs')}>
            <Ionicons name="receipt-outline" size={15} color={palette.accent} />
            <Text style={styles.costsButtonText}>{t('Траты')}</Text>
          </Press>
        </View>

        {error !== null && <Text style={styles.error}>{error}</Text>}
        {data === null && error === null && (
          <Loading colour={palette.backgroundElement} rows={3} height={110} />
        )}

        {data !== null && (
          <View style={styles.heroRow}>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>{t('Ждём')}</Text>
              <Text style={styles.heroValue}>{money(data.awaited)}</Text>
            </View>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>{t('Просрочено')}</Text>
              <Text style={[styles.heroValue, data.overdue > 0 && { color: palette.danger }]}>
                {money(data.overdue)}
              </Text>
            </View>
          </View>
        )}

        {/* Where an account is not connected, the shortfall above is still only
            the app's own arithmetic. Offered here rather than anywhere else
            because this is the screen somebody is on when they doubt it. */}
        {data !== null && bankToken == null && (data?.shortfalls.length ?? 0) > 0 && (
          <Press style={styles.connect} onPress={() => router.push('/(tabs)/bank')}>
            <Ionicons name="card-outline" size={18} color={palette.accent} />
            <Text style={styles.connectText}>
              {t('Подключите банк — и «недоплатили» станет проверяемым фактом')}
            </Text>
            <Ionicons name="chevron-forward" size={15} color={palette.accent} />
          </Press>
        )}

        {(data?.shortfalls.length ?? 0) > 0 && (
          <View style={styles.warning}>
            <Text style={styles.warningTitle}>{t('Заплатили меньше, чем начислено')}</Text>
            {data?.shortfalls.map((short) => (
              <Text key={`${short.location_id}-${short.stream}`} style={styles.warningLine}>
                {short.location_name}
                {short.stream !== 'all' ? ` · ${t(STREAM_LABEL[short.stream])}` : ''} — не хватает{' '}
                {money(short.total_short)} с {shortDate(short.since)}
              </Text>
            ))}
          </View>
        )}

        {ahead.length > 0 && (
          <Section title={t("Ещё не в кармане")} palette={palette}>
            {ahead.map((row) => (
              <PeriodCard
                key={`${row.location_id}-${row.period_from}-${row.stream}`}
                row={row}
                palette={palette}
                bank={bankSees(row, statement, payers)}
                onMark={() => setPrefill(row)}
                onBank={() => router.push('/(tabs)/bank')}
              />
            ))}
          </Section>
        )}

        {settled.length > 0 && (
          <Section title={t("Закрытые периоды")} palette={palette}>
            {settled.map((row) => (
              <PeriodCard
                key={`${row.location_id}-${row.period_from}-${row.stream}`}
                row={row}
                palette={palette}
                onMark={() => setPrefill(row)}
              />
            ))}
          </Section>
        )}

        {history.length > 0 && (
          <Section title={t("Что уже пришло")} palette={palette}>
            {history.map((payout) => (
              <View key={payout.id} style={styles.payoutRow}>
                {/* The row itself opens the editor: a mistyped sum should be
                    one tap from being right, not delete-and-retype. */}
                <Press style={styles.grow} onPress={() => setEditing(payout)}>
                  <Text style={styles.payoutAmount}>{money(payout.amount)}</Text>
                  <Text style={styles.payoutMeta}>
                    {shortDate(payout.received_on)}
                    {payout.location_name !== null ? ` · ${payout.location_name}` : ''}
                  </Text>
                </Press>
                <Press
                  hitSlop={10}
                  onPress={() => {
                    void api(`/shifter/v1/payouts/${payout.id}`, { method: 'DELETE' }).then(load);
                  }}
                >
                  <Text style={styles.remove}>{t('Убрать')}</Text>
                </Press>
              </View>
            ))}

            {/* The clean slate, asked for out loud. Everything, everywhere —
                not just the half-year on screen — because a ledger that went
                wrong early is easier to retype than to argue with. */}
            <Press
              style={styles.wipeAll}
              onPress={() => {
                Alert.alert(
                  t('Стереть все выплаты?'),
                  t('Уйдут все записанные выплаты и вердикты по периодам — за всё время, без отмены. Смены и заработанное останутся.'),
                  [
                    { text: t('Оставить'), style: 'cancel' },
                    {
                      text: t('Стереть всё'),
                      style: 'destructive',
                      onPress: () => {
                        void api('/shifter/v1/payouts', { method: 'DELETE' }).then(load);
                      },
                    },
                  ],
                );
              }}
            >
              <Text style={styles.wipeAllText}>{t('Стереть все выплаты и заполнить заново')}</Text>
            </Press>
          </Section>
        )}

        {data !== null && periods.length === 0 && history.length === 0 && (
          <Text style={styles.empty}>{t('Ещё нечего сверять. Добавьте место работы и график выплат — и здесь появится, кто сколько должен.')}</Text>
        )}
      </ScrollView>

      <PayoutModal
        row={prefill}
        editing={editing}
        palette={palette}
        onClose={() => {
          setPrefill(null);
          setEditing(null);
        }}
        onSaved={() => {
          setPrefill(null);
          setEditing(null);
          void load();
        }}
      />
    </>
  );
}

function Section({
  title,
  palette,
  children,
}: {
  title: string;
  palette: Palette;
  children: React.ReactNode;
}) {
  const styles = makeStyles(palette);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * What the bank already sees against this period.
 *
 * The reconciliation screen has always been able to say what a place owes.
 * Now, where somebody has connected an account, it can say whether the money
 * is sitting there — which is a different sentence entirely from "we think
 * you are owed this".
 */
const bankSees = (
  row: PayPeriodRow,
  statement: MonoStatementItem[],
  payers: Record<string, string[]>,
): { total: number; when: string } | null => {
  if (statement.length === 0 || row.expected <= row.paid) return null;

  const [best] = wageCandidates(
    statement,
    {
      locationId: row.location_id,
      locationName: row.location_name,
      periodFrom: row.period_from,
      periodTo: row.period_to,
      amount: row.expected - row.paid,
      due: row.due_on,
    },
    payers[`${row.location_id}`] ?? [],
  );

  // Only worth mentioning where it is recognisably this wage. A credit half
  // the size is a different conversation, and this line is not the place for
  // it — the bank tab is.
  if (best === undefined || Math.abs(best.difference) > 0.15) return null;

  return {
    total: best.total,
    when: new Date(best.items[0].time * 1000).toISOString().slice(0, 10),
  };
};

function PeriodCard({
  row,
  palette,
  bank,
  onMark,
  onBank,
}: {
  row: PayPeriodRow;
  palette: Palette;
  bank?: { total: number; when: string } | null;
  onMark: () => void;
  onBank?: () => void;
}) {
  const styles = makeStyles(palette);
  const router = useRouter();
  const tone =
    row.status === 'overdue' || row.status === 'short'
      ? palette.danger
      : row.status === 'paid' || row.status === 'over'
        ? palette.good
        : row.status === 'partial'
          ? palette.accent
          : palette.textSecondary;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.dot, { backgroundColor: row.colour }]} />
        <Text style={styles.cardPlace} numberOfLines={1}>
          {row.location_name}
          {row.stream !== 'all' ? ` · ${t(STREAM_LABEL[row.stream])}` : ''}
        </Text>
        <Text style={[styles.pill, { color: tone, borderColor: tone }]}>
          {t(STATUS_LABEL[row.status])}
        </Text>
      </View>

      <Press
        style={styles.periodRow}
        onPress={() =>
          router.push(`/payslip?location=${row.location_id}&on=${row.period_from}`)
        }
      >
        <Text style={styles.cardPeriod}>
          {shortDate(row.period_from)} — {shortDate(row.period_to)} · {Math.round(row.hours)} ч
        </Text>
        <Text style={styles.checkLink}>{t('по строкам →')}</Text>
      </Press>

      {bank != null && (
        <Press style={styles.bankLine} onPress={onBank}>
          <Ionicons name="card-outline" size={15} color={palette.good} />
          <Text style={styles.bankText} numberOfLines={1}>
            Банк видит {money(bank.total)} · {shortDate(bank.when)}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={palette.good} />
        </Press>
      )}

      <View style={styles.cardFoot}>
        <View style={styles.grow}>
          <Text style={styles.cardExpected}>{money(row.expected)}</Text>
          <Text style={styles.cardDue}>
            {row.status === 'overdue'
              ? `${t('Ждём с')} ${shortDate(row.due_on)} — ${row.days_late} ${t('дн.')}`
              : row.status === 'partial'
                ? `${t('Аванс')} ${money(row.paid_advance)} · ${t('осталось')} ${money(row.expected - row.paid)}`
              : row.paid > 0
                ? `${t('Пришло')} ${money(row.paid)} · ${t('срок')} ${shortDate(row.due_on)}`
                : `${t('Срок')} ${shortDate(row.due_on)}`}
          </Text>
        </View>

        <Press style={styles.markButton} onPress={onMark}>
          <Text style={styles.markText}>{t('Отметить')}</Text>
        </Press>
      </View>
    </View>
  );
}

/**
 * Recording a payment is one number and one date. Everything else is already
 * known from the period the person tapped, so the form is prefilled and a
 * thumb can finish it.
 */
function PayoutModal({
  row,
  editing,
  palette,
  onClose,
  onSaved,
}: {
  row: PayPeriodRow | null;
  /** An already-recorded payment to fix in place, instead of a new one. */
  editing: Payout | null;
  palette: Palette;
  onClose: () => void;
  onSaved: () => void;
}) {
  const styles = makeStyles(palette);
  const [amount, setAmount] = useState('');
  const [received, setReceived] = useState(todayKey());
  const [kind, setKind] = useState<PayoutKind>('settlement');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Fixing an existing payment: everything it already says, editable.
    if (editing !== null) {
      setAmount(`${editing.amount}`);
      setReceived(editing.received_on);
      setKind(editing.kind);
      setFailed(false);

      return;
    }

    if (row === null) return;

    // What is still missing, not the whole period: a second instalment must
    // not re-enter money already recorded.
    const left = Math.max(0, Math.round(row.expected - row.paid));
    setAmount(left > 0 ? `${left}` : '');
    setReceived(todayKey());
    // Money that arrives before the period has finished is an advance almost by
    // definition — nobody settles a month they are still working.
    setKind(row.period_to > todayKey() ? 'advance' : 'settlement');
    setFailed(false);
  }, [row, editing]);

  const save = async () => {
    if (row === null && editing === null) return;

    setSaving(true);

    try {
      if (editing !== null) {
        await api(`/shifter/v1/payouts/${editing.id}`, {
          method: 'PUT',
          body: {
            period_from: editing.period_from,
            period_to: editing.period_to,
            amount: Number(amount.replace(',', '.')) || 0,
            received_on: received,
            location_id: editing.location_id,
            note: editing.note,
            kind,
            stream: editing.stream,
          },
        });
      } else if (row !== null) {
        await api('/shifter/v1/payouts', {
          method: 'POST',
          body: {
            period_from: row.period_from,
            period_to: row.period_to,
            amount: Number(amount.replace(',', '.')) || 0,
            received_on: received,
            location_id: row.location_id,
            note: null,
            kind,
            // The row knows which payment it is and showed it on screen; not
            // sending it booked a commission against the wage, so the commission
            // stayed overdue and the wage flipped to overpaid.
            stream: row.stream,
          },
        });
      }
      onSaved();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={row !== null || editing !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{editing !== null ? t('Поправить выплату') : t('Пришли деньги')}</Text>
        <Text style={styles.sheetMeta}>
          {editing !== null
            ? `${editing.location_name ?? t('Без места')} · ${shortDate(editing.period_from)} — ${shortDate(editing.period_to)}`
            : `${row?.location_name ?? ''} · ${row !== null ? shortDate(row.period_from) : ''} — ${row !== null ? shortDate(row.period_to) : ''}`}
        </Text>

        <Text style={styles.fieldLabel}>{t('Сколько')}</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={palette.textSecondary}
        />

        <Text style={styles.fieldLabel}>{t('Когда')}</Text>
        <TextInput
          style={styles.input}
          value={received}
          onChangeText={setReceived}
          placeholder={t("ГГГГ-ММ-ДД")}
          placeholderTextColor={palette.textSecondary}
        />

        <Text style={styles.fieldLabel}>{t('Что это')}</Text>
        <View style={styles.kindRow}>
          {KINDS.map((option) => (
            <Press
              key={option.value}
              style={[styles.kindChip, kind === option.value && styles.kindChipOn]}
              onPress={() => setKind(option.value)}
            >
              <Text style={[styles.kindText, kind === option.value && styles.kindTextOn]}>
                {t(option.label)}
              </Text>
            </Press>
          ))}
        </View>

        {kind === 'advance' && (
          <Text style={styles.kindHint}>{t('Период останется открытым до расчёта и не будет считаться недоплаченным.')}</Text>
        )}

        {failed && <Text style={styles.error}>{t('Не сохранили. Проверьте сумму и дату.')}</Text>}

        <View style={styles.sheetButtons}>
          <Press style={[styles.sheetButton, styles.sheetGhost]} onPress={onClose}>
            <Text style={styles.sheetGhostText}>{t('Отмена')}</Text>
          </Press>
          <Press
            style={[styles.sheetButton, styles.sheetPrimary, saving && { opacity: 0.6 }]}
            disabled={saving}
            onPress={() => void save()}
          >
            <Text style={styles.sheetPrimaryText}>{saving ? t('Сохраняем…') : editing !== null ? t('Поправить') : t('Записать')}</Text>
          </Press>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 16, paddingBottom: 48, gap: 14 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    costsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
    },
    costsButtonText: { color: palette.accent, fontSize: 13, fontWeight: '700' },
    title: { color: palette.text, fontSize: 30, fontWeight: '800' },
    error: { color: palette.danger, fontSize: 13 },
    empty: { color: palette.textSecondary, fontSize: 14, lineHeight: 20 },
    grow: { flex: 1 },

    heroRow: { flexDirection: 'row', gap: 10 },
    hero: {
      flex: 1,
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      gap: 4,
    },
    heroLabel: { color: palette.textSecondary, fontSize: 13 },
    heroValue: { color: palette.text, fontSize: 24, fontWeight: '800' },

    warning: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.danger,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      gap: 6,
    },
    warningTitle: { color: palette.danger, fontSize: 15, fontWeight: '700' },
    warningLine: { color: palette.text, fontSize: 13, lineHeight: 19 },

    section: { gap: 10 },
    sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '700', marginTop: 6 },

    card: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      gap: 8,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    cardPlace: { color: palette.text, fontSize: 15, fontWeight: '700', flex: 1 },
    pill: {
      fontSize: 11,
      fontWeight: '700',
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    checkLink: { color: palette.accent, fontSize: 12, fontWeight: '600' },
    cardPeriod: { color: palette.textSecondary, fontSize: 13 },
    connect: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: palette.accentSoft,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    connectText: { flex: 1, color: palette.accent, fontSize: 13, fontWeight: '700', lineHeight: 18 },

    bankLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      borderWidth: 1,
      borderColor: palette.good,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginTop: 6,
    },
    bankText: { flex: 1, color: palette.good, fontSize: 12.5, fontWeight: '700' },

    cardFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    cardExpected: { color: palette.text, fontSize: 20, fontWeight: '800' },
    cardDue: { color: palette.textSecondary, fontSize: 12, marginTop: 2 },
    markButton: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accent,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    markText: { color: palette.accent, fontSize: 13, fontWeight: '700' },

    payoutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    payoutAmount: { color: palette.text, fontSize: 16, fontWeight: '700' },
    payoutMeta: { color: palette.textSecondary, fontSize: 12, marginTop: 2 },
    remove: { color: palette.danger, fontSize: 13 },
    wipeAll: { marginTop: 10, paddingVertical: 6 },
    wipeAllText: { color: palette.danger, fontSize: 13, opacity: 0.8 },

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
      gap: 8,
    },
    sheetTitle: { color: palette.text, fontSize: 20, fontWeight: '800' },
    sheetMeta: { color: palette.textSecondary, fontSize: 13, marginBottom: 6 },
    fieldLabel: { color: palette.textSecondary, fontSize: 13, marginTop: 6 },
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
    kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    kindChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
    },
    kindChipOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    kindText: { color: palette.textSecondary, fontSize: 13, fontWeight: '600' },
    kindTextOn: { color: '#fff' },
    kindHint: { color: palette.textSecondary, fontSize: 12, marginTop: 8, lineHeight: 17 },
    sheetButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
    sheetButton: { flex: 1, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
    sheetGhost: { borderColor: palette.border, borderWidth: 1 },
    sheetGhostText: { color: palette.text, fontSize: 15, fontWeight: '600' },
    sheetPrimary: { backgroundColor: palette.accent },
    sheetPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
