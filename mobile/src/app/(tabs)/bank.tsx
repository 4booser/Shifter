import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BankAnalysis } from '@/components/bank-analysis';
import { BankLock } from '@/components/bank-lock';
import { BankSpending } from '@/components/bank-spending';
import { BankStatement } from '@/components/bank-statement';
import {
  CategoryMonthsChart,
  MonthlyFlowsChart,
  PaceChart,
  ReserveTile,
} from '@/components/bank-charts';
import { BankLedger } from '@/components/bank-ledger';
import { MoneyGrid } from '@/components/money-grid';
import { Appear, Loading, Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { currentMonth, monthBounds, shortDate, todayKey } from '@/lib/calendar';
import {
  ExpectedWage,
  MonoAccount,
  MonoStatementItem,
  WageMatch,
  currencyOf,
  fromMinor,
  payerKey,
  payerName,
  ratesDay,
  wageCandidates,
  wealth,
  workSpending,
} from '@/lib/mono';
import { recurring } from '@/lib/mono-insights';
import { cashTipOffers, untilPayday, usualDay } from '@/lib/mono-work';
import { CalendarDayData, DaysResponse, money, moneyIn } from '@/lib/types';
import { chosenAccount, loadSetup, saveWatching, useMono } from '@/store/mono';
import { watchForWage } from '@/lib/wage-watch';
import { useWidgetMoney } from '@/lib/use-widget';
import { t } from '@/lib/i18n';
import { LockKind, bankLock, lockKind, lockNameBy } from '@/lib/lock';

/** What the reconciliation endpoint says is still owed. */
interface PayPeriodRow {
  location_id: number;
  location_name: string;
  period_from: string;
  period_to: string;
  due_on: string;
  expected: number;
  paid: number;
  /** Days between the promised day and the money arriving. */
  days_late: number;
  status: string;
  stream: 'all' | 'wage' | 'commission';
}

const KIND_LABEL: Record<string, string> = {
  transport: 'Транспорт',
  uniform: 'Форма',
  tools: 'Инструмент',
  food: 'Еда',
  training: 'Обучение',
  other: 'Другое',
};

/**
 * The bank, and what it lets the app finally say.
 *
 * Shifter has always been able to work out what somebody is owed. It has never
 * been able to say what arrived — that was the person's own word, which is a
 * poor thing to open a conversation with a manager on. monobank knows.
 *
 * The token stays on this phone. Every request on this screen goes either to
 * api.monobank.ua with a token the Shifter server has never seen, or to
 * Shifter with a row the person has explicitly confirmed. Nothing crosses.
 */
export default function BankScreen() {
  const scheme = useColorScheme();
  const cover = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <BankLock palette={cover}>
      <Bank />
    </BankLock>
  );
}

function Bank() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const styles = makeStyles(palette);
  const router = useRouter();

  const mono = useMono();

  // What is counted, and what the bank quoted it at. Both are the person's
  // choices rather than the app's: an account left out stays out, and a total
  // the rates cannot support is not shown as one.
  const purse = useMemo(
    () =>
      wealth(
        (mono.client?.accounts ?? []).filter((entry) => !mono.hidden.includes(entry.id)),
        mono.client?.jars ?? [],
        mono.rates,
      ),
    [mono.client, mono.hidden, mono.rates],
  );
  const ratesOn = useMemo(() => ratesDay(mono.rates), [mono.rates]);
  const account = chosenAccount(mono);

  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PayPeriodRow[] | null>(null);
  const [locked, setLocked] = useState(false);
  /** What the tip rule says should be put aside by now, from the server. */
  const [jarRule, setJarRule] = useState<{
    percent: number;
    saved: number;
    goal: number;
  } | null>(null);
  const [lockWith, setLockWith] = useState<LockKind>(null);
  const [days, setDays] = useState<Map<string, CalendarDayData>>(new Map());
  const [earned, setEarned] = useState(0);
  const [view, setView] = useState<'summary' | 'todo' | 'spending' | 'month' | 'ledger' | 'analysis'>('summary');
  const [saving, setSaving] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    void mono.hydrate();
    void bankLock.enabled().then(setLocked);
    void api<{ percent: number; saved: number; goal: number }>('/shifter/v1/auth/tip-jar')
      .then(setJarRule)
      .catch(() => setJarRule(null));
    void bankLock.enabled().then(setLocked);
    void lockKind().then(setLockWith);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What the app is expecting, and which days were worked — both from Shifter,
  // both without the bank knowing anything about it.
  const loadShifter = useCallback(async () => {
    const today = todayKey();
    const from = `${Number(today.slice(0, 4)) - 1}-${today.slice(5)}`;

    try {
      const [schedule, year] = await Promise.all([
        api<{ periods: PayPeriodRow[] }>(`/shifter/v1/payouts/schedule?from=${from}&to=${today}`),
        api<DaysResponse>(`/shifter/v1/days?from=${from}&to=${today}`),
      ]);

      setPeriods(schedule.periods);
      setDays(new Map(year.days.map((day) => [day.date, day])));

      const month = monthBounds(currentMonth());

      setEarned(
        year.days
          .filter((day) => day.date >= month.from && day.date <= month.to)
          .reduce((sum, day) => sum + day.earned, 0),
      );
    } catch {
      setPeriods([]);
    }
  }, []);

  useEffect(() => {
    if (mono.token !== null && mono.token !== undefined) void loadShifter();
  }, [mono.token, loadShifter]);

  const connect = async () => {
    setProblem(null);

    const answer = await mono.connect(typed);

    if (answer === 'refused') {
      setProblem(t('Банк не принял этот токен. Проверьте, что скопировали его целиком.'));

      return;
    }

    if (answer === 'failed') {
      setProblem(mono.error ?? t('Не дотянулись до банка.'));

      return;
    }

    setTyped('');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ---- what the bank says about the money that was owed ----
  const wages = useMemo(() => {
    if (periods === null || mono.items.length === 0) return [];

    // A credit already recorded as a payout is not a candidate for another
    // one, even if the period still reads as short — it might be short by
    // exactly the amount somebody has yet to be paid.
    const open = mono.items.filter((item) => !mono.used.includes(item.id));

    return periods
      .filter((row) => row.expected > row.paid && row.stream !== 'commission')
      .map((row) => {
        const expected: ExpectedWage = {
          locationId: row.location_id,
          locationName: row.location_name,
          periodFrom: row.period_from,
          periodTo: row.period_to,
          amount: row.expected - row.paid,
          due: row.due_on,
        };

        return {
          row,
          expected,
          matches: wageCandidates(
            open,
            expected,
            mono.payers[`${row.location_id}`] ?? [],
          ).slice(0, 2),
        };
      })
      .filter((entry) => entry.matches.length > 0);
  }, [periods, mono.items, mono.payers, mono.used]);

  // What the phone should look for while the app is closed, written down
  // here because this is where it is worked out. A wake-up the system granted
  // for a few seconds is the wrong place to be calling two services.
  useEffect(() => {
    const soonest = wages
      .map((entry) => entry.expected)
      .sort((one, two) => one.due.localeCompare(two.due))[0] ?? null;

    // The list of wages already announced survives this write. Clearing it
    // whenever the screen recomputes would let one wage be announced twice,
    // which reads as a second payment.
    void loadSetup().then((setup) =>
      saveWatching({
        expected: soonest,
        payers: soonest === null ? [] : mono.payers[`${soonest.locationId}`] ?? [],
        told: setup.watching?.told ?? [],
      }),
    );

    void watchForWage(soonest !== null && mono.accountId !== null);
  }, [wages, mono.payers, mono.accountId]);

  const worked = useMemo(
    () =>
      new Set(
        [...days.values()]
          .filter((day) => day.shifts.some((shift) => shift.worked))
          .map((day) => day.date),
      ),
    [days],
  );

  const spending = useMemo(
    () =>
      workSpending(mono.items, worked)
        // Already written down. A resync brings the same taxi back, and
        // offering it twice is how a fare gets recorded twice.
        .filter((row) => !mono.used.includes(row.item.id))
        .slice(0, 25),
    [mono.items, worked, mono.used],
  );

  /**
   * Cash going onto the card the day after a shift.
   *
   * Half the earnings in this trade are cash and the bank is blind to all of
   * it — but the cash almost always reaches a card within a day, and at that
   * moment the app can ask something nobody else is in a position to ask. It
   * asks. It never records: this is the one kind of money the app knows less
   * about than the person does.
   */
  const cashOffers = useMemo(() => {
    const month = monthBounds(currentMonth());

    return cashTipOffers(
      mono.items,
      [...days.values()],
      month.from,
      month.to,
      new Set(mono.used),
    ).slice(0, 8);
  }, [mono.items, days, mono.used]);

  /** The most recent payday the app knows about, for "how long it lasted". */
  /**
   * How much there is per day until the next money lands.
   *
   * The calendar knows when the wage is due and how much. The bank knows what
   * is left and what still has to leave. Neither application computes this on
   * its own, and it is the question people actually ask on the 22nd.
   */
  const runway = useMemo(() => {
    const account = (mono.client?.accounts ?? []).find((entry) => entry.id === mono.accountId);

    if (account === undefined || periods === null) return null;

    const today = todayKey();
    const due = periods
      .filter((row) => row.due_on >= today && row.expected > row.paid)
      .sort((one, two) => one.due_on.localeCompare(two.due_on))[0];

    if (due === undefined) return null;

    const daysToPay = Math.round(
      (new Date(`${due.due_on}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime())
      / (24 * 60 * 60 * 1000),
    );

    const month = monthBounds(currentMonth());
    // What still has to leave before then: the standing charges the statement
    // itself revealed, not a figure anybody typed.
    const committed = recurring(mono.items, month.from, month.to)
      .filter((row) => row.next <= due.due_on)
      .reduce((sum, row) => sum + row.amount, 0);

    return {
      due,
      state: untilPayday(
        fromMinor(account.balance - account.creditLimit),
        daysToPay,
        committed,
        usualDay(mono.items, month.from, month.to),
      ),
      committed,
    };
  }, [mono.client, mono.accountId, mono.items, periods]);

  // The money half of the widget, written from the same figures this screen
  // shows. Only from here: the calendar screen has no idea what is in
  // anybody's bank, and a widget assembled from two screens would be a widget
  // that disagrees with itself depending which one was opened last.
  useWidgetMoney(
    runway === null || mono.accountId === null
      ? null
      : {
          balance: runway.state?.left ?? null,
          untilPayday: runway.state?.days ?? null,
          perDay: runway.state?.perDay ?? null,
        },
  );

  /**
   * How many things the bank has found that nobody has answered yet.
   *
   * On the segment, because a tab that hides a question behind a scroll is a
   * tab where the question never gets answered.
   */
  const waiting = wages.length + spending.length + cashOffers.length;

  const lastPaid = useMemo(() => {
    const paid = (periods ?? [])
      .filter((row) => row.paid > 0 && row.due_on <= todayKey())
      .sort((one, two) => (one.due_on < two.due_on ? 1 : -1));

    return paid[0]?.due_on ?? null;
  }, [periods]);

  const confirmWage = async (
    row: PayPeriodRow,
    match: WageMatch,
    expected: ExpectedWage,
  ) => {
    const tag = `wage-${match.items.map((item) => item.id).join('-')}`;

    setSaving(tag);

    try {
      // One payout per credit, so an advance stays an advance and the
      // settlement stays a settlement — the app already refuses to call the
      // first one an underpayment, and that only works if both are recorded
      // as what they are.
      for (const item of match.items) {
        await api('/shifter/v1/payouts', {
          method: 'POST',
          body: {
            period_from: row.period_from,
            period_to: row.period_to,
            amount: fromMinor(item.amount),
            received_on: new Date(item.time * 1000).toISOString().slice(0, 10),
            location_id: row.location_id,
            note: payerName(item),
            kind: match.items.length > 1 && item === match.items[0] ? 'advance' : 'settlement',
            stream: row.stream,
          },
        });
      }

      // Every payer in the match, not only the first: one venue pays from a
      // company and from a manager's own card, and learning half of that is
      // what leaves the other half looking like a stranger next month.
      for (const key of match.payers) await mono.rememberPayer(row.location_id, key);

      await mono.markUsed(match.items.map((item) => item.id));

      setDone((was) => [...was, tag]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void loadShifter();
    } catch {
      setProblem(t('Не записалось — попробуйте ещё раз.'));
    } finally {
      setSaving(null);
    }
  };

  /**
   * Records a cash top-up as that day's cash tips.
   *
   * The day is sent whole, as always: the tips figure is one field of a day
   * and patching it alone would drop everything else on it.
   */
  const addCashTip = async (item: MonoStatementItem, day: string) => {
    const tag = `cash-${item.id}`;

    setSaving(tag);

    try {
      const existing = days.get(day);
      const amount = Math.abs(item.amount) / 100;

      await api(`/shifter/v1/days/${day}`, {
        method: 'PUT',
        body: {
          shifts: (existing?.shifts ?? []).map((entry) => ({
            shift_id: entry.shift_id,
            worked: entry.worked,
            needs_cover: entry.needs_cover,
            actual_start: entry.actual_start,
            actual_end: entry.actual_end,
            break_minutes: entry.break_minutes,
            revenue: entry.revenue,
            guests: entry.guests,
            zone: entry.zone,
          })),
          sales: (existing?.sales ?? []).map((entry) => ({
            sales_id: entry.sales_id,
            quantity: entry.quantity,
          })),
          tips: existing?.tips ?? null,
          // Added to whatever was already written down rather than replacing
          // it: somebody may have recorded part of the evening by hand.
          tips_cash: (existing?.tips_cash ?? 0) + amount,
          tip_pool: existing?.tip_pool ?? null,
          tip_out: null,
          deductions: existing?.deductions ?? null,
          deduction_reason: existing?.deduction_reason ?? null,
          note: existing?.note ?? null,
          colour: existing?.colour ?? null,
        },
      });

      await mono.markUsed([item.id]);
      setDone((was) => [...was, tag]);
      void Haptics.selectionAsync();
      void loadShifter();
    } catch {
      setProblem(t('Не записалось — попробуйте ещё раз.'));
    } finally {
      setSaving(null);
    }
  };

  const addExpense = async (item: MonoStatementItem, kind: string, day: string) => {
    const tag = `spend-${item.id}`;

    setSaving(tag);

    try {
      await api('/shifter/v1/expenses', {
        method: 'POST',
        body: {
          date: day,
          amount: fromMinor(-item.amount),
          kind,
          note: item.description,
          location_id: null,
        },
      });

      await mono.markUsed([item.id]);
      setDone((was) => [...was, tag]);
      void Haptics.selectionAsync();
    } catch {
      setProblem(t('Не записалось — попробуйте ещё раз.'));
    } finally {
      setSaving(null);
    }
  };

  // ---- not connected ----
  if (mono.token === null || mono.token === undefined) {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>{t('Банк')}</Text>

          <Text style={styles.lede}>{t('Приложение считает, сколько вам должны. Банк знает, сколько пришло. Пока эти две цифры не встретились, «недоплатили» — это ваши слова, а не факт.')}</Text>

          <View style={styles.promise}>
            <Row palette={palette} icon="lock-closed" text={t("Токен остаётся на этом телефоне. На наш сервер он не уходит никогда.")} />
            <Row palette={palette} icon="eye-outline" text={t("Читаем только выписку по счёту, который вы выберете.")} />
            <Row palette={palette} icon="close-circle-outline" text={t("Платежи невозможны: персональный токен монобанка этого не умеет.")} />
            <Row palette={palette} icon="cash-outline" text={t("Наличные банк не видит — чай наличными вносите как раньше.")} />
          </View>

          <Press
            style={styles.link}
            onPress={() => void Linking.openURL('https://api.monobank.ua/')}
          >
            <Ionicons name="open-outline" size={17} color={palette.accent} />
            <Text style={styles.linkText}>{t('Получить токен на api.monobank.ua')}</Text>
          </Press>

          <Text style={styles.label}>{t('Токен')}</Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            placeholder="u1Abc..."
            placeholderTextColor={palette.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          {problem !== null && <Text style={styles.error}>{problem}</Text>}

          <Press
            style={[styles.primary, typed.trim() === '' && styles.primaryOff]}
            disabled={typed.trim() === '' || mono.busy}
            onPress={() => void connect()}
          >
            {mono.busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>{t('Подключить')}</Text>
            )}
          </Press>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ---- connected ----
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
    >
      <Text style={styles.title}>{t('Банк')}</Text>

      {mono.client !== null && view === 'summary' && (
        <>
          {/*
            What somebody has, across the accounts they chose to count. The
            credit limit never joins it: "12 400 on the card, 2 400 of it
            yours" is two numbers and two different feelings, and adding them
            would tell somebody they are five times richer than they are.
          */}
          <View style={styles.wealth}>
            <Text style={styles.wealthLabel}>{t('Всего своих')}</Text>
            <Text style={styles.wealthValue}>{money(purse.own + purse.jars)}</Text>
            <Text style={styles.wealthMeta}>
              {purse.jars > 0 && `${t('из них в банках')} ${money(purse.jars)}`}
              {purse.jars > 0 && purse.credit > 0 && ' · '}
              {purse.credit > 0 && `${t('кредитных')} ${money(purse.credit)} ${t('сверху')}`}
            </Text>
            {ratesOn !== null && (
              <Text style={styles.wealthRate}>
                {t('по курсу монобанка на')} {ratesOn.slice(8)}.{ratesOn.slice(5, 7)}
              </Text>
            )}
            {purse.unconverted > 0 && (
              <Text style={styles.wealthRate}>
                {purse.unconverted} {t('счёт(а) банк сегодня не котирует — не сложены')}
              </Text>
            )}
          </View>

          <Text style={styles.label}>{t('Счета')}</Text>
          <Text style={styles.hint}>
            {t('Тап — выписка этого счёта. Долгий тап — убрать из общей суммы.')}
          </Text>
          <View style={styles.accounts}>
            {mono.client.accounts.map((entry) => {
              const counted = !mono.hidden.includes(entry.id);

              return (
                <Press
                  key={entry.id}
                  style={[
                    styles.account,
                    entry.id === mono.accountId && styles.accountOn,
                    !counted && styles.accountOut,
                  ]}
                  onPress={() => void mono.chooseAccount(entry.id)}
                  onLongPress={() => void mono.toggleAccount(entry.id, !counted)}
                >
                  <Text
                    style={[styles.accountPan, entry.id === mono.accountId && styles.accountOnText]}
                  >
                    {cardOf(entry)}
                  </Text>
                  <Text style={styles.accountMeta}>
                    {/* The account's own currency, not the app's. Stamping ₴ on a
                        euro balance is exactly the confident lie about money this
                        app does not tell. */}
                    {moneyIn(
                      currencyOf(entry.currencyCode),
                      fromMinor(entry.balance - entry.creditLimit),
                    )}
                  </Text>
                  {!counted && <Text style={styles.accountOutText}>{t('не в сумме')}</Text>}
                </Press>
              );
            })}
          </View>
        </>
      )}

      {/* Jars are not accounts and are never added to one: monobank keeps them
          apart and so does this. They are here because a jar is where tips get
          put aside, which is the only saving most of this trade ever does. */}
      {(mono.client?.jars ?? []).length > 0 && view === 'summary' && (
        <>
          <Text style={styles.label}>{t('Банки')}</Text>
          <View style={styles.accounts}>
            {(mono.client?.jars ?? []).map((jar) => (
              <Press
                key={jar.id}
                style={[styles.jar, jar.id === mono.jarId && styles.jarOn]}
                onPress={() => void mono.chooseJar(jar.id === mono.jarId ? null : jar.id)}
              >
                <Text style={styles.jarName} numberOfLines={1}>{jar.title}</Text>
                <Text style={styles.accountMeta}>
                  {moneyIn(currencyOf(jar.currencyCode), fromMinor(jar.balance))}
                  {jar.goal !== undefined && jar.goal > 0
                    ? ` ${t('из')} ${moneyIn(currencyOf(jar.currencyCode), fromMinor(jar.goal))}`
                    : ''}
                </Text>
                {jar.goal !== undefined && jar.goal > 0 && (
                  <View style={styles.jarTrack}>
                    <View
                      style={[
                        styles.jarFill,
                        { width: `${Math.min(100, (jar.balance / jar.goal) * 100)}%` },
                      ]}
                    />
                  </View>
                )}
                {jar.id === mono.jarId && (
                  <Text style={styles.jarTag}>{t('копилка с чаевых')}</Text>
                )}
              </Press>
            ))}
          </View>
        </>
      )}

      {/*
        What the rule says should be there, against what is actually in the
        jar. The app can only ever compute the first; the bank knows the
        second, and the gap between them is the whole point of connecting one
        to the other.
      */}
      {view === 'summary' && jarRule !== null && jarRule.percent > 0 && (() => {
        const jar = (mono.client?.jars ?? []).find((one) => one.id === mono.jarId);

        if (jar === undefined) {
          return (
            <Text style={styles.hint}>
              {t('Правило откладывать')} {jarRule.percent}% {t('чаевых уже считает')}{' '}
              {money(jarRule.saved)}. {t('Выберите банку выше — и увидите, сколько в ней на самом деле.')}
            </Text>
          );
        }

        // A jar in another currency is not compared with a hryvnia figure.
        // Two numbers under one sign that are not the same money is exactly
        // the confident lie this app does not tell.
        if (jar.currencyCode !== 980) {
          return (
            <Text style={styles.hint}>
              {t('Банка в другой валюте — с гривневым счётчиком её не сравниваем.')}
            </Text>
          );
        }

        const inJar = fromMinor(jar.balance);
        const gap = inJar - jarRule.saved;

        return (
          <View style={styles.runway}>
            <Text style={styles.runwayLabel}>
              {jar.title} · {jarRule.percent}% {t('с чаевых')}
            </Text>
            <Text style={styles.runwayValue}>{money(inJar)}</Text>
            <Text style={styles.runwayMeta}>
              {t('По правилу должно быть')} {money(jarRule.saved)}
              {Math.abs(gap) >= 1 && (
                gap > 0
                  ? ` · ${t('на')} ${money(gap)} ${t('больше')}`
                  : ` · ${t('не хватает')} ${money(-gap)}`
              )}
            </Text>
          </View>
        );
      })()}

      {mono.accountId !== null && (
        <>
          <Press
            style={styles.sync}
            disabled={mono.busy}
            onPress={() => {
              const since =
                mono.syncedTo ?? Math.floor(Date.now() / 1000) - 92 * 24 * 60 * 60;

              void mono.sync(since);
            }}
          >
            {mono.busy ? (
              <>
                <ActivityIndicator color={palette.accent} size="small" />
                <Text style={styles.syncText}>
                  {mono.waiting > 0
                    ? `${t('Банк отвечает раз в минуту')} · ${mono.waiting} ${t('с')}`
                    : mono.progress !== null
                      ? `${t('Загружено')} ${mono.progress.done} ${t('из')} ${mono.progress.total}`
                      : t('Читаем выписку')}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="refresh" size={17} color={palette.accent} />
                <Text style={styles.syncText}>
                  {mono.syncedTo === null
                    ? t('Загрузить выписку за три месяца')
                    : `${t('Обновить')} · ${mono.items.length} ${t('операций')}`}
                </Text>
              </>
            )}
          </Press>

          {mono.progress !== null && mono.progress.total > 1 && (
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${(mono.progress.done / mono.progress.total) * 100}%` },
                ]}
              />
            </View>
          )}

          {/* Going further back is a minute a month, so it is a decision
              somebody makes rather than something the app does on their
              behalf while they wonder why it is slow. */}
          {!mono.busy && mono.syncedTo !== null && (
            <Press
              style={styles.deeper}
              haptic={false}
              onPress={() =>
                void mono.sync(Math.floor(Date.now() / 1000) - 366 * 24 * 60 * 60)
              }
            >
              <Text style={styles.deeperText}>{t('Загрузить год · примерно 12 минут')}</Text>
            </Press>
          )}
        </>
      )}

      {mono.error !== null && <Text style={styles.error}>{mono.error}</Text>}
      {problem !== null && <Text style={styles.error}>{problem}</Text>}

      {mono.items.length > 0 && (
        <View style={styles.segments}>
          {(
            [
              ['summary', t('Сводка')],
              ['todo', waiting > 0 ? `${t('К записи')} · ${waiting}` : t('К записи')],
              ['spending', t('Траты')],
              ['month', t('Месяц')],
              ['ledger', t('Список')],
              ['analysis', t('Работа')],
            ] as const
          ).map(([value, label]) => (
            <Press
              key={value}
              style={[styles.segment, view === value && styles.segmentOn]}
              onPress={() => setView(value)}
            >
              <Text style={[styles.segmentText, view === value && styles.segmentTextOn]}>
                {label}
              </Text>
            </Press>
          ))}
        </View>
      )}

      {view === 'summary' && runway?.state != null && (
        <View style={styles.runway}>
          <Text style={styles.runwayLabel}>
            {t('До')} {shortDate(runway.due.due_on)} — {runway.state.days} {t('дн.')}
          </Text>
          <Text style={styles.runwayValue}>
            {money(Math.max(0, Math.round(runway.state.perDay)))} {t('в день')}
          </Text>
          <Text style={styles.runwayMeta}>
            {money(Math.round(runway.state.left))} {t('на счету')}
            {runway.committed > 0 && `, ${t('из них')} ${money(Math.round(runway.committed))} ${t('уже расписано')}`}
            {runway.state.usual > 0 &&
              ` · ${t('обычно тратите')} ${money(Math.round(runway.state.usual))} ${t('в день')}`}
          </Text>
        </View>
      )}

      {view === 'spending' && (
        <BankSpending
          items={mono.items}
          rules={mono.rules}
          budgets={mono.budgets}
          from={monthBounds(currentMonth()).from}
          to={monthBounds(currentMonth()).to}
          palette={palette}
          onRules={(rules) => void mono.setRules(rules)}
          onBudget={(category, limit) => void mono.setBudget(category, limit)}
        />
      )}

      {/* ==== The web's chart shelf, answering the finger ==== */}
      {view === 'spending' && (
        <>
          <PaceChart
            items={mono.items}
            from={monthBounds(currentMonth()).from}
            to={monthBounds(currentMonth()).to}
            palette={palette}
          />
          <MonthlyFlowsChart items={mono.items} palette={palette} />
          <CategoryMonthsChart items={mono.items} rules={mono.rules} palette={palette} />
          <ReserveTile
            balance={(() => {
              const account = (mono.client?.accounts ?? []).find((entry) => entry.id === mono.accountId);

              return account !== undefined ? fromMinor(account.balance - account.creditLimit) : null;
            })()}
            items={mono.items}
            from={monthBounds(currentMonth()).from}
            to={monthBounds(currentMonth()).to}
            palette={palette}
          />
          <BankStatement
            items={mono.items}
            rules={mono.rules}
            from={monthBounds(currentMonth()).from}
            to={monthBounds(currentMonth()).to}
            palette={palette}
          />
        </>
      )}

      {view === 'month' && (
        <MoneyGrid
          items={mono.items}
          days={days}
          palette={palette}
          anchor={currentMonth()}
          onOpen={(day) => router.push(`/day/${day}`)}
        />
      )}

      {view === 'ledger' && (
        <BankLedger items={mono.items} days={days} palette={palette} />
      )}

      {view === 'analysis' && (
        <BankAnalysis
          items={mono.items}
          days={[...days.values()]}
          periods={periods ?? []}
          month={currentMonth()}
          earned={earned}
          palette={palette}
          paidOn={lastPaid}
          floor={1000}
        />
      )}

      {view === 'summary' && mono.accountId !== null && periods === null && (
        <Loading colour={palette.backgroundElement} rows={2} height={96} />
      )}

      {view === 'todo' && wages.length > 0 && (
        <Text style={styles.section}>{t('Похоже на зарплату')}</Text>
      )}

      {view === 'todo' && wages.map((entry, index) =>
        entry.matches.map((match) => {
          const tag = `wage-${match.items.map((item) => item.id).join('-')}`;

          if (done.includes(tag)) return null;

          return (
            <Appear key={tag} index={index}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {entry.row.location_name} · {shortDate(entry.row.period_from)} — {shortDate(entry.row.period_to)}
                </Text>

                {match.items.map((item) => (
                  <View key={item.id} style={styles.line}>
                    <Text style={styles.lineWhen}>{shortDate(dateOf(item))}</Text>
                    <Text style={styles.lineWho} numberOfLines={1}>{payerName(item)}</Text>
                    <Text style={styles.lineSum}>{money(fromMinor(item.amount))}</Text>
                  </View>
                ))}

                <Text style={styles.against}>
                  Начислено {money(entry.expected.amount)}
                  {Math.abs(match.difference) >= 0.005 && (
                    <Text style={match.difference < 0 ? styles.short : styles.over}>
                      {' '}· {match.difference < 0 ? t('меньше') : t('больше')} на{' '}
                      {Math.abs(Math.round(match.difference * 100))}%
                    </Text>
                  )}
                </Text>

                {!match.known && match.payers.length > 1 && (
                  <Text style={styles.hint}>{t('Два разных плательщика. Подтвердите — и оба запомнятся для этого места.')}</Text>
                )}

                <Press
                  style={styles.confirm}
                  disabled={saving !== null}
                  onPress={() => void confirmWage(entry.row, match, entry.expected)}
                >
                  {saving === tag ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.confirmText}>{t('Это зарплата за период')}</Text>
                  )}
                </Press>
              </View>
            </Appear>
          );
        }),
      )}

      {view === 'todo' && spending.length > 0 && (
        <Text style={styles.section}>{t('Похоже на траты по работе')}</Text>
      )}

      {view === 'todo' && spending.map((row) => {
        const tag = `spend-${row.item.id}`;

        if (done.includes(tag)) return null;

        return (
          <View key={row.item.id} style={styles.spendRow}>
            <View style={styles.spendText}>
              <Text style={styles.spendWho} numberOfLines={1}>{row.item.description}</Text>
              <Text style={styles.spendMeta}>
                {shortDate(row.day)} · {t(KIND_LABEL[row.kind])}
                {row.sure ? '' : t(' · возможно')}
              </Text>
            </View>
            <Text style={styles.spendSum}>{money(fromMinor(-row.item.amount))}</Text>
            <Press
              style={styles.add}
              disabled={saving !== null}
              onPress={() => void addExpense(row.item, row.kind, row.day)}
            >
              {saving === tag ? (
                <ActivityIndicator color={palette.accent} size="small" />
              ) : (
                <Ionicons name="add" size={19} color={palette.accent} />
              )}
            </Press>
          </View>
        );
      })}

      {view === 'todo' && cashOffers.length > 0 && (
        <Text style={styles.section}>{t('Похоже на наличные чаевые')}</Text>
      )}

      {view === 'todo' && cashOffers.map((row) => {
        const tag = `cash-${row.item.id}`;

        if (done.includes(tag)) return null;

        return (
          <View key={row.item.id} style={styles.spendRow}>
            <View style={styles.spendText}>
              <Text style={styles.spendWho} numberOfLines={1}>{row.item.description}</Text>
              <Text style={styles.spendMeta}>
                {shortDate(row.after)} · {t('после смены')}
              </Text>
            </View>
            <Text style={styles.spendSum}>{money(row.amount)}</Text>
            <Press
              style={styles.add}
              disabled={saving !== null}
              onPress={() => void addCashTip(row.item, row.after)}
            >
              {saving === tag ? (
                <ActivityIndicator color={palette.accent} size="small" />
              ) : (
                <Ionicons name="add" size={19} color={palette.accent} />
              )}
            </Press>
          </View>
        );
      })}

      {view === 'todo' && mono.items.length > 0 && wages.length === 0 && spending.length === 0 && cashOffers.length === 0 && (
        <Text style={styles.empty}>{t('В загруженной выписке нечего сопоставить: ни прихода рядом с днём выплаты, ни трат в дни смен. Это нормально — банк не видит наличные, а такси вы могли не брать.')}</Text>
      )}

      {/*
        A lock of its own, separate from the app's. The calendar holds how much
        somebody earns; this holds where they were, what they bought and how
        much they have left — and a phone is handed over to show a photograph.
      */}
      {view === 'summary' && (
        <Press
          style={styles.lockRow}
          haptic={false}
          onPress={() => {
            const next = !locked;

            setLocked(next);
            void bankLock.set(next);
          }}
        >
          <Ionicons
            name={locked ? 'lock-closed' : 'lock-open-outline'}
            size={18}
            color={locked ? palette.accent : palette.textSecondary}
          />
          <Text style={[styles.lockText, locked && { color: palette.accent }]}>
            {locked
              ? `${t('Вкладка закрыта — открывается по')} ${lockNameBy(lockWith)}`
              : t('Закрыть вкладку замком')}
          </Text>
        </Press>
      )}

      {view === 'summary' && (
      <Press style={styles.disconnect} haptic={false} onPress={() => void mono.disconnect()}>
        <Text style={styles.disconnectText}>{t('Отключить банк')}</Text>
      </Press>
      )}

      {view === 'summary' && (
        <Text style={styles.hint}>{t('Отключение стирает токен и выписку с телефона. Отозвать сам токен можно только на api.monobank.ua — приложение этого сделать не может.')}</Text>
      )}
    </ScrollView>
  );
}

/** The local date of a transaction, as the app writes dates. */
const dateOf = (item: MonoStatementItem): string => {
  const at = new Date(item.time * 1000);
  const pad = (value: number) => `${value}`.padStart(2, '0');

  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

const cardOf = (account: MonoAccount): string =>
  account.maskedPan.length > 0 ? `•••• ${account.maskedPan[0].slice(-4)}` : account.type;

function Row({
  palette,
  icon,
  text,
}: {
  palette: Palette;
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  const styles = makeStyles(palette);

  return (
    <View style={styles.promiseRow}>
      <Ionicons name={icon} size={17} color={palette.textSecondary} />
      <Text style={styles.promiseText}>{text}</Text>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 14, paddingBottom: 64, gap: 8 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { flex: 1, fontSize: 24, fontWeight: '800', color: palette.text, letterSpacing: -0.5 },
    lede: { color: palette.textSecondary, fontSize: 13.5, lineHeight: 19 },

    promise: {
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      padding: 13,
      gap: 10,
      marginTop: 6,
    },
    promiseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    promiseText: { flex: 1, color: palette.text, fontSize: 13.5, lineHeight: 18 },

    link: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    linkText: { color: palette.accent, fontWeight: '700', fontSize: 14.5 },

    label: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginTop: 10,
      marginBottom: 3,
    },
    input: {
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: palette.text,
      fontSize: 15.5,
    },
    error: { color: palette.danger, fontSize: 13.5 },
    empty: { color: palette.textSecondary, fontSize: 13.5, lineHeight: 19, paddingVertical: 8 },
    hint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 17 },

    primary: {
      backgroundColor: palette.accent,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 14,
    },
    primaryOff: { opacity: 0.4 },
    primaryText: { color: '#fff', fontWeight: '800', fontSize: 15.5 },

    accounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    runway: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 18,
      padding: 16,
      gap: 2,
    },
    runwayLabel: { color: palette.textSecondary, fontSize: 12.5, fontWeight: '600' },
    runwayValue: { color: palette.text, fontSize: 26, fontWeight: '800' },
    runwayMeta: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 18 },
    jarOn: { borderWidth: 1, borderColor: palette.accent },
    jarTag: { color: palette.accent, fontSize: 10.5, fontWeight: '700', marginTop: 3 },
    wealth: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 18,
      padding: 16,
      gap: 2,
    },
    wealthLabel: { color: palette.textSecondary, fontSize: 12.5, fontWeight: '600' },
    wealthValue: { color: palette.text, fontSize: 32, fontWeight: '800' },
    wealthMeta: { color: palette.textSecondary, fontSize: 12.5 },
    wealthRate: { color: palette.textSecondary, fontSize: 11.5, marginTop: 2 },
    accountOut: { opacity: 0.45 },
    accountOutText: { color: palette.textSecondary, fontSize: 10.5, marginTop: 2 },
    account: {
      borderWidth: 1.5,
      borderColor: palette.border,
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      paddingHorizontal: 13,
      paddingVertical: 10,
      gap: 1,
    },
    accountOn: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
    accountPan: { color: palette.text, fontWeight: '700', fontSize: 14.5, fontVariant: ['tabular-nums'] },
    accountOnText: { color: palette.accent },
    accountMeta: { color: palette.textSecondary, fontSize: 11.5, fontVariant: ['tabular-nums'] },

    jar: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      paddingHorizontal: 13,
      paddingVertical: 10,
      gap: 3,
      minWidth: 140,
    },
    jarName: { color: palette.text, fontWeight: '700', fontSize: 14 },
    jarTrack: {
      height: 5,
      borderRadius: 3,
      backgroundColor: palette.backgroundSelected,
      overflow: 'hidden',
      marginTop: 2,
    },
    jarFill: { height: 5, borderRadius: 3, backgroundColor: palette.good },

    sync: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 16,
      paddingVertical: 13,
      marginTop: 10,
    },
    syncText: { color: palette.accent, fontWeight: '700', fontSize: 14.5 },

    track: {
      height: 6,
      borderRadius: 3,
      backgroundColor: palette.backgroundSelected,
      overflow: 'hidden',
      marginTop: 6,
    },
    fill: { height: 6, borderRadius: 3, backgroundColor: palette.accent },
    deeper: { alignItems: 'center', paddingVertical: 9 },
    deeperText: { color: palette.textSecondary, fontSize: 12.5, fontWeight: '600' },

    segments: { flexDirection: 'row', gap: 6, marginTop: 6, marginBottom: 2 },
    segment: {
      flex: 1,
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.backgroundElement,
      paddingVertical: 9,
    },
    segmentOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    segmentText: { color: palette.text, fontSize: 12.5, fontWeight: '700' },
    segmentTextOn: { color: '#fff' },

    section: {
      color: palette.text,
      fontSize: 16,
      fontWeight: '800',
      marginTop: 18,
      letterSpacing: -0.2,
    },
    card: {
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      padding: 13,
      gap: 7,
    },
    cardTitle: { color: palette.text, fontSize: 14.5, fontWeight: '700' },
    line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    lineWhen: { color: palette.textSecondary, fontSize: 12.5, width: 56, fontVariant: ['tabular-nums'] },
    lineWho: { flex: 1, color: palette.text, fontSize: 13.5 },
    lineSum: { color: palette.text, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
    against: { color: palette.textSecondary, fontSize: 12.5 },
    short: { color: palette.danger, fontWeight: '700' },
    over: { color: palette.good, fontWeight: '700' },
    confirm: {
      backgroundColor: palette.accent,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    confirmText: { color: '#fff', fontWeight: '800', fontSize: 14 },

    spendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    spendText: { flex: 1, gap: 1 },
    spendWho: { color: palette.text, fontSize: 14, fontWeight: '600' },
    spendMeta: { color: palette.textSecondary, fontSize: 12 },
    spendSum: { color: palette.text, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
    add: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: palette.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },

    lockRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      marginTop: 12,
    },
    lockText: { color: palette.textSecondary, fontSize: 14, fontWeight: '600' },
    disconnect: { alignItems: 'center', paddingVertical: 14, marginTop: 12 },
    disconnectText: { color: palette.danger, fontWeight: '600', fontSize: 14 },
  });
