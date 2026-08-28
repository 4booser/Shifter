import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appear, Loading, Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import { addMonths, currentMonth, dayLabel, monthBounds, todayKey } from '@/lib/calendar';
import { DaysResponse, ShiftTemplate, toSavePayload } from '@/lib/types';
import { Gig, payLine, photosOf, postedAgo, templateFromGig, tradeOf } from '@/lib/gigs';
import { t } from '@/lib/i18n';

type Tab = 'freelance' | 'permanent' | 'mine';

const TAB_LABEL: Record<Tab, string> = {
  freelance: 'Подработки',
  permanent: 'Постоянка',
  mine: 'Мои отклики',
};

/**
 * The board in a pocket. Freelance covers are pinned to an evening, a
 * permanent seat is not, so the two are separate tabs rather than one list
 * with a filter people have to notice.
 */
export default function GigsScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('freelance');
  const [board, setBoard] = useState<Gig[]>([]);
  const [replies, setReplies] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  /** Null is "every trade", which is what somebody opening the board wants. */
  const [trade, setTrade] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Gig | null>(null);

  // Three months of evenings: far enough to plan, short enough to read.
  const window = useMemo(() => {
    const now = currentMonth();

    return { from: todayKey(), to: monthBounds(addMonths(now, 2)).to };
  }, []);

  /**
   * The trades actually on the board, not the whole trade.
   *
   * A filter listing thirty-six jobs when four are hiring is a filter that
   * mostly answers "nothing here" — so the row is built from the listings
   * themselves, and disappears entirely when there is only one kind of work.
   */
  const trades = useMemo(() => {
    const counted = new Map<string, number>();

    for (const gig of board) counted.set(gig.category, (counted.get(gig.category) ?? 0) + 1);

    return [...counted.entries()]
      .sort((one, two) => two[1] - one[1])
      .map(([id, count]) => ({ id, count, ...tradeOf(id) }));
  }, [board]);

  const load = useCallback(async () => {
    try {
      if (tab === 'mine') {
        setReplies(await api<Gig[]>('/shifter/v1/gigs/replies'));
      } else {
        setBoard(
          await api<Gig[]>(
            `/shifter/v1/gigs?from=${window.from}&to=${window.to}&employment=${tab}`,
          ),
        );
      }

      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('Не дотянулись до сервера.'));
    } finally {
      setLoading(false);
    }
  }, [tab, window.from, window.to]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const rows =
    tab === 'mine'
      ? replies
      : trade === null
        ? board
        : board.filter((gig) => gig.category === trade);

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
        <Text style={styles.title}>{t('Биржа')}</Text>

        <View style={styles.tabs}>
          {(Object.keys(TAB_LABEL) as Tab[]).map((value) => (
            <Press
              key={value}
              style={[styles.tab, tab === value && styles.tabOn]}
              onPress={() => setTab(value)}
            >
              <Text style={[styles.tabText, tab === value && styles.tabTextOn]}>
                {t(TAB_LABEL[value])}
              </Text>
            </Press>
          ))}
        </View>

        {tab !== 'mine' && trades.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trades}
          >
            <Press
              style={[styles.trade, trade === null && styles.tradeOn]}
              onPress={() => setTrade(null)}
            >
              <Text style={[styles.tradeText, trade === null && styles.tradeTextOn]}>
                {t('Все')} · {board.length}
              </Text>
            </Press>

            {trades.map((one) => (
              <Press
                key={one.id}
                style={[styles.trade, trade === one.id && styles.tradeOn]}
                onPress={() => setTrade(trade === one.id ? null : one.id)}
              >
                <Text style={[styles.tradeText, trade === one.id && styles.tradeTextOn]}>
                  {one.emoji} {t(one.label)} · {one.count}
                </Text>
              </Press>
            ))}
          </ScrollView>
        )}

        {error !== null && <Text style={styles.error}>{error}</Text>}
        {loading && <Loading colour={palette.backgroundElement} rows={3} height={104} />}

        {!loading && rows.length === 0 && (
          <Text style={styles.empty}>
            {tab === 'mine'
              ? t('Вы ещё никуда не откликались. Загляните в «Подработки» — там смены, которые ищут людей на вечер.')
              : tab === 'permanent'
                ? t('Постоянных мест пока нет. Заглядывайте — их выкладывают заведения города.')
                : t('На ближайшие месяцы подработок нет. Потяните вниз, чтобы обновить.')}
          </Text>
        )}

        {rows.map((gig, index) => (
          <Appear key={gig.id} index={index}>
            <GigCard gig={gig} palette={palette} onOpen={() => setOpen(gig)} />
          </Appear>
        ))}
      </ScrollView>

      <GigSheet
        gig={open}
        palette={palette}
        onClose={() => setOpen(null)}
        onChanged={() => {
          setOpen(null);
          void load();
        }}
      />
    </>
  );
}

function GigCard({
  gig,
  palette,
  onOpen,
}: {
  gig: Gig;
  palette: Palette;
  onOpen: () => void;
}) {
  const styles = makeStyles(palette);
  const trade = tradeOf(gig.category);
  const past = gig.employment === 'freelance' && gig.date < todayKey();
  const photos = photosOf(gig);

  return (
    <Press style={[styles.card, (past || gig.status !== 'open') && styles.cardDim]} onPress={onOpen}>
      {photos.length > 0 && <Image source={{ uri: photos[0] }} style={styles.cardPhoto} />}

      <View style={styles.cardBody}>
        <View style={styles.cardHead}>
          <Text style={styles.cardEmoji}>{trade.emoji}</Text>
          <View style={styles.grow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {gig.title}
            </Text>
            <Text style={styles.cardVenue} numberOfLines={1}>
              {gig.venue} · {gig.city}
            </Text>
          </View>
          {gig.my_response !== null && (
            <Ionicons
              name={gig.my_response.accepted ? 'checkmark-circle' : 'paper-plane'}
              size={20}
              color={gig.my_response.accepted ? palette.good : palette.accent}
            />
          )}
        </View>

        {gig.urgent && <Text style={styles.urgent}>{t('🔴 Нужен сегодня')}</Text>}

        <Text style={styles.cardPay}>{payLine(gig)}</Text>

        {/* What the rate is worth to this reader. A board full of numbers tells
            nobody anything on its own: 250 an hour is generous in one city and
            a pay cut in another, and the app already knows which. Not on your
            own listings — that would answer a question nobody asked. */}
        {!gig.is_mine && gig.worth !== null && (
          <Text
            style={[
              styles.cardWorth,
              gig.worth.difference_percent > 0 && styles.better,
              gig.worth.difference_percent < 0 && styles.worse,
            ]}
          >
            {gig.worth.difference_percent === 0
              ? t('примерно ваш обычный час')
              : `${gig.worth.difference_percent > 0 ? t('выше') : t('ниже')} ${t('вашего обычного часа на')} ${Math.abs(gig.worth.difference_percent)}%`}
          </Text>
        )}

        <Text style={styles.cardMeta}>
          {gig.employment === 'freelance'
            ? `${dayLabel(gig.date)} · ${gig.start}–${gig.end}`
            : gig.schedule !== null && gig.schedule !== ''
              ? gig.schedule
              : t('постоянное место')}
          {' · '}
          {trade.label}
        </Text>

        <View style={styles.cardFoot}>
          <Text style={styles.cardAge}>{postedAgo(gig.created_at)}</Text>
          {gig.employer_rating !== null && (
            <Text style={styles.cardRating}>
              ★ {gig.employer_rating.toFixed(1)} ({gig.employer_count})
            </Text>
          )}
          {gig.responses > 0 && <Text style={styles.cardAge}>откликов: {gig.responses}</Text>}
        </View>
      </View>
    </Press>
  );
}

/**
 * The whole vacancy and the one button that matters. Contacts are shared
 * only by replying, never listed on the board, so a phone number does not
 * become a public directory entry.
 */
function GigSheet({
  gig,
  palette,
  onClose,
  onChanged,
}: {
  gig: Gig | null;
  palette: Palette;
  onClose: () => void;
  onChanged: () => void;
}) {
  const styles = makeStyles(palette);
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setPhoto(0);
    setFailed(null);
    setAdded(false);
    // The contact fields have to go with the rest. A draft left in one listing
    // survived into the next, so the "Позвонить" button on a listing you had
    // been accepted for dialled your own number, and a few words about
    // yourself arrived at a venue you never wrote them for.
    setPhone('');
    setTelegram('');
    setMessage('');
  }, [gig]);

  if (gig === null) {
    return <Modal visible={false} transparent onRequestClose={onClose} />;
  }

  const trade = tradeOf(gig.category);
  const photos = photosOf(gig);

  const respond = async () => {
    setBusy(true);
    setFailed(null);

    try {
      await api(`/shifter/v1/gigs/${gig.id}/respond`, {
        method: 'POST',
        body: {
          message: message.trim() === '' ? null : message.trim(),
          phone: phone.trim() === '' ? null : phone.trim(),
          telegram: telegram.trim() === '' ? null : telegram.trim(),
        },
      });
      onChanged();
    } catch (caught) {
      setFailed(caught instanceof ApiError ? caught.message : t('Отклик не ушёл.'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * The outing, on the calendar, priced by the deal that was struck. The
   * vacancy already says the hours and the pay, so nothing about it needs
   * typing a second time — and a percentage-only gig arrives as a percentage
   * shift rather than a shift worth nothing.
   */
  const addToCalendar = async () => {
    setBusy(true);
    setFailed(null);

    try {
      const template = await api<ShiftTemplate>('/shifter/v1/shifts', {
        method: 'POST',
        body: templateFromGig(gig),
      });

      // The day is sent whole, so whatever is already on it comes back with
      // the new shift rather than being replaced by it.
      const existing = await api<DaysResponse>(
        `/shifter/v1/days?from=${gig.date}&to=${gig.date}`,
      );
      const payload = toSavePayload(existing.days[0]);

      await api(`/shifter/v1/days/${gig.date}`, {
        method: 'PUT',
        body: {
          ...payload,
          shifts: [
            ...payload.shifts,
            {
              shift_id: template.id,
              worked: false,
              needs_cover: false,
              actual_start: null,
              actual_end: null,
              break_minutes: null,
            },
          ],
        },
      });

      setAdded(true);
    } catch (caught) {
      setFailed(caught instanceof ApiError ? caught.message : t('Не добавили в календарь.'));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);

    try {
      await api(`/shifter/v1/gigs/${gig.id}/respond`, { method: 'DELETE' });
      onChanged();
    } catch (caught) {
      setFailed(caught instanceof ApiError ? caught.message : t('Не отозвали.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.sheetContent}>
        <View style={styles.head}>
          <Text style={styles.sheetTitle}>{gig.title}</Text>
          <Press hitSlop={12} onPress={onClose}>
            <Ionicons name="close" size={26} color={palette.textSecondary} />
          </Press>
        </View>

        {photos.length > 0 && (
          <Press onPress={() => setPhoto((at) => (at + 1) % photos.length)}>
            <Image source={{ uri: photos[photo] }} style={styles.sheetPhoto} />
            {photos.length > 1 && (
              <Text style={styles.photoCount}>
                {photo + 1} / {photos.length} · тапните, чтобы листать
              </Text>
            )}
          </Press>
        )}

        <Text style={styles.sheetVenue}>
          {trade.emoji} {gig.venue} · {gig.city}
        </Text>
        <Text style={styles.sheetPay}>{payLine(gig)}</Text>

        <Text style={styles.sheetMeta}>
          {gig.employment === 'freelance'
            ? `${dayLabel(gig.date)}, ${gig.start}–${gig.end}`
            : gig.schedule !== null && gig.schedule !== ''
              ? gig.schedule
              : t('постоянное место')}
          {' · '}
          {trade.label}
          {gig.slots > 1 ? ` · ${t('мест')}: ${gig.slots}` : ''}
        </Text>
        <Text style={styles.sheetPosted}>Опубликовано {postedAgo(gig.created_at)}</Text>

        {gig.details !== null && gig.details !== '' && (
          <Text style={styles.sheetDetails}>{gig.details}</Text>
        )}

        {gig.is_mine ? (
          <Text style={styles.sheetNote}>{t('Это ваша вакансия. Отклики видно на сайте.')}</Text>
        ) : gig.my_response !== null ? (
          <>
            <Text style={styles.sheetNote}>
              {gig.my_response.accepted
                ? t('Вас взяли. Заведение получило ваши контакты.')
                : t('Отклик отправлен. Заведение видит ваши контакты.')}
            </Text>

            {gig.my_response.accepted && gig.employment === 'freelance' && (
              <Press
                style={[styles.primary, (busy || added) && { opacity: 0.6 }]}
                disabled={busy || added}
                onPress={() => void addToCalendar()}
              >
                <Text style={styles.primaryText}>
                  {added
                    ? t('Смена в календаре')
                    : busy
                      ? t('Добавляем…')
                      : `${t('Добавить в календарь')} · ${payLine(gig)}`}
                </Text>
              </Press>
            )}

            {failed !== null && <Text style={styles.error}>{failed}</Text>}
            {!gig.my_response.accepted && (
              <Press style={styles.ghost} disabled={busy} onPress={() => void withdraw()}>
                <Text style={styles.ghostText}>{t('Отозвать отклик')}</Text>
              </Press>
            )}
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>{t('Телефон')}</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+380…"
              placeholderTextColor={palette.textSecondary}
            />

            <Text style={styles.fieldLabel}>{t('Телеграм')}</Text>
            <TextInput
              style={styles.input}
              value={telegram}
              onChangeText={setTelegram}
              autoCapitalize="none"
              placeholder={t("@ник")}
              placeholderTextColor={palette.textSecondary}
            />

            <Text style={styles.fieldLabel}>{t('Пара слов о себе')}</Text>
            <TextInput
              style={[styles.input, styles.inputTall]}
              value={message}
              onChangeText={setMessage}
              multiline
              placeholder={t("Опыт, когда свободны")}
              placeholderTextColor={palette.textSecondary}
            />

            {failed !== null && <Text style={styles.error}>{failed}</Text>}

            <Press
              style={[styles.primary, busy && { opacity: 0.6 }]}
              disabled={busy}
              onPress={() => void respond()}
            >
              <Text style={styles.primaryText}>{busy ? t('Отправляем…') : t('Я выйду')}</Text>
            </Press>

            <Text style={styles.privacy}>{t('Контакты уйдут только этому заведению — на доске их не видно.')}</Text>
          </>
        )}

        {gig.my_response?.accepted === true && phone.trim() !== '' && (
          <Press style={styles.ghost} onPress={() => void Linking.openURL(`tel:${phone.trim()}`)}>
            <Text style={styles.ghostText}>{t('Позвонить')}</Text>
          </Press>
        )}
      </ScrollView>
    </Modal>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 14, paddingBottom: 48, gap: 12 },
    sheetContent: { padding: 20, paddingTop: 64, paddingBottom: 48, gap: 8 },
    title: { color: palette.text, fontSize: 30, fontWeight: '800' },
    grow: { flex: 1 },
    error: { color: palette.danger, fontSize: 13 },
    trades: { gap: 6, paddingRight: 14 },
    trade: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.backgroundElement,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    tradeOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    tradeText: { color: palette.text, fontSize: 12.5, fontWeight: '700' },
    tradeTextOn: { color: '#fff' },
    empty: { color: palette.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 12 },

    tabs: { flexDirection: 'row', gap: 8 },
    tab: {
      flex: 1,
      alignItems: 'center',
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 9,
    },
    tabOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    tabText: { color: palette.text, fontSize: 13, fontWeight: '600' },
    tabTextOn: { color: '#fff' },

    card: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 18,
      overflow: 'hidden',
    },
    cardDim: { opacity: 0.55 },
    cardPhoto: { width: '100%', height: 130, backgroundColor: palette.backgroundSelected },
    cardBody: { padding: 14, gap: 5 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardEmoji: { fontSize: 24 },
    cardTitle: { color: palette.text, fontSize: 16, fontWeight: '700' },
    cardVenue: { color: palette.textSecondary, fontSize: 13, marginTop: 1 },
    cardPay: { color: palette.accent, fontSize: 17, fontWeight: '800' },
    urgent: { color: palette.danger, fontSize: 13, fontWeight: '800' },
    cardWorth: { color: palette.textSecondary, fontSize: 12.5, fontWeight: '600' },
    better: { color: palette.good },
    worse: { color: palette.danger },
    cardMeta: { color: palette.text, fontSize: 13 },
    cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
    cardAge: { color: palette.textSecondary, fontSize: 12 },
    cardRating: { color: palette.good, fontSize: 12, fontWeight: '600' },

    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    sheetTitle: { flex: 1, color: palette.text, fontSize: 24, fontWeight: '800' },
    sheetPhoto: {
      width: '100%',
      height: 220,
      borderRadius: 16,
      marginTop: 10,
      backgroundColor: palette.backgroundElement,
    },
    photoCount: { color: palette.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 6 },
    sheetVenue: { color: palette.text, fontSize: 16, fontWeight: '600', marginTop: 10 },
    sheetPay: { color: palette.accent, fontSize: 22, fontWeight: '800' },
    sheetMeta: { color: palette.text, fontSize: 14 },
    sheetPosted: { color: palette.textSecondary, fontSize: 12 },
    sheetDetails: { color: palette.text, fontSize: 14, lineHeight: 21, marginTop: 8 },
    sheetNote: { color: palette.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 12 },

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
    inputTall: { minHeight: 90, textAlignVertical: 'top' },

    primary: {
      backgroundColor: palette.accent,
      borderRadius: 999,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 16,
    },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    privacy: { color: palette.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 8 },

    ghost: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 14,
    },
    ghostText: { color: palette.text, fontSize: 15, fontWeight: '600' },
  });
