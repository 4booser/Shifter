import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/date-field';
import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import { todayKey } from '@/lib/calendar';
import { Gig, TRADES } from '@/lib/gigs';
import { t } from '@/lib/i18n';

/**
 * The listing, born where the shift fell through. A no-show at 16:40 wants
 * an ad out by 16:42 from the phone in the manager's hand — not after a
 * search for a laptop.
 *
 * The photo rule is the server's, spoken twice while seeding wave 73: at
 * least three venue photos, each a JPEG data URL shrunk by the client. The
 * shrink mirrors the site's numbers — longest side 900, quality stepped
 * down from 0.8 until the URL fits 200k.
 */
interface Draft {
  venue: string;
  title: string;
  details: string;
  category: string;
  employment: 'freelance' | 'permanent';
  date: string;
  start: string;
  end: string;
  payAmount: string;
  payPeriod: 'hour' | 'shift' | 'month';
  payPercent: string;
  city: string;
  slots: string;
  urgent: boolean;
  photos: string[];
}

const DRAFT_KEY = 'shifter.gig-draft';

const BLANK: Draft = {
  venue: '',
  title: '',
  details: '',
  category: 'bartender',
  employment: 'freelance',
  date: todayKey(),
  start: '16:00',
  end: '23:00',
  payAmount: '',
  payPeriod: 'hour',
  payPercent: '',
  city: '',
  slots: '1',
  urgent: false,
  photos: [],
};

async function shrink(uri: string): Promise<string> {
  // The site's loop, phone-side: resize once, then walk quality down until
  // the data URL fits the server's budget.
  for (let quality = 0.8; quality >= 0.35; quality -= 0.1) {
    const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 900 } }], {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    const url = `data:image/jpeg;base64,${out.base64 ?? ''}`;

    if (url.length <= 200_000) return url;
  }

  throw new Error('photo will not fit');
}

const fromGig = (gig: Gig, keepDate: boolean): Draft => ({
  venue: gig.venue,
  title: gig.title,
  details: gig.details ?? '',
  category: gig.category,
  employment: gig.employment,
  date: keepDate ? gig.date : todayKey(),
  start: gig.start.slice(0, 5),
  end: gig.end.slice(0, 5),
  payAmount: gig.pay_amount > 0 ? `${gig.pay_amount}` : '',
  payPeriod: gig.pay_period,
  payPercent: gig.pay_percent === null ? '' : `${gig.pay_percent}`,
  city: gig.city,
  slots: `${gig.slots}`,
  urgent: false,
  photos: gig.photos,
});

export default function CreateGigScreen() {
  const router = useRouter();
  // ?edit=id opens the same form over an existing listing (PUT, replies
  // kept); ?copy=id starts a fresh one from it with today's date — the
  // second Friday should not begin from scratch. Both run in memory:
  // neither may trample a from-zero draft someone left behind.
  const { edit, copy } = useLocalSearchParams<{ edit?: string; copy?: string }>();
  const editId = edit !== undefined ? Number(edit) : null;
  const sourceId = editId ?? (copy !== undefined ? Number(copy) : null);
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [shrinking, setShrinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sourceId !== null) {
      void api<{ gig: Gig }[]>('/shifter/v1/gigs/mine')
        .then((rows) => {
          const found = rows.find((row) => row.gig.id === sourceId)?.gig;

          if (found === undefined) {
            // A stale link or somebody else's id: an empty «edit» form would
            // quietly create a new listing — worse than saying so.
            Alert.alert(t('Объявление не нашлось.'));
            router.back();

            return;
          }

          setDraft(fromGig(found, editId !== null));
        })
        .catch(() => {
          Alert.alert(t('Не дотянулись до сервера.'));
          router.back();
        });

      return;
    }

    void AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => setDraft(raw !== null ? { ...BLANK, ...(JSON.parse(raw) as Draft) } : BLANK))
      .catch(() => setDraft(BLANK));
  }, [sourceId, editId]);

  useEffect(() => {
    if (draft !== null && sourceId === null)
      void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => undefined);
  }, [draft, sourceId]);

  const put = (patch: Partial<Draft>) => setDraft((have) => (have === null ? have : { ...have, ...patch }));

  const ready = useMemo(() => {
    if (draft === null) return false;

    const paid = Number(draft.payAmount) > 0 || draft.payPercent.trim() !== '';

    return (
      draft.venue.trim() !== ''
      && draft.title.trim() !== ''
      && draft.city.trim() !== ''
      && /^\d{4}-\d{2}-\d{2}$/.test(draft.date)
      && /^\d{2}:\d{2}$/.test(draft.start)
      && /^\d{2}:\d{2}$/.test(draft.end)
      && paid
      && draft.photos.length >= 3
    );
  }, [draft]);

  if (draft === null) {
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  const pickPhotos = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 6 - draft.photos.length,
      quality: 1,
    });

    if (picked.canceled) return;

    setShrinking(true);
    setError(null);

    try {
      const shrunk: string[] = [];

      for (const asset of picked.assets) shrunk.push(await shrink(asset.uri));
      put({ photos: [...draft.photos, ...shrunk].slice(0, 6) });
    } catch {
      setError(t('Фото не удалось ужать — попробуйте другое.'));
    } finally {
      setShrinking(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      await api(editId !== null ? `/shifter/v1/gigs/${editId}` : '/shifter/v1/gigs', {
        method: editId !== null ? 'PUT' : 'POST',
        body: {
          venue: draft.venue.trim(),
          category: draft.category,
          employment: draft.employment,
          photos: draft.photos,
          schedule: null,
          title: draft.title.trim(),
          details: draft.details.trim() === '' ? null : draft.details.trim(),
          date: draft.date,
          start: draft.start,
          end: draft.end,
          pay_amount: Number(draft.payAmount) || 0,
          pay_period: draft.payPeriod,
          pay_percent: draft.payPercent.trim() === '' ? null : Number(draft.payPercent) || 0,
          city: draft.city.trim(),
          slots: Math.max(1, Number(draft.slots) || 1),
          urgent: draft.urgent && draft.date === todayKey(),
        },
      });

      if (sourceId === null) await AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined);
      router.replace('/my-listings');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('Сеть молчит. Сервер доступен?'));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
        <View style={styles.head}>
          <Text style={styles.title}>{editId !== null ? t('Изменить объявление') : t('Новое объявление')}</Text>
          <Press hitSlop={12} onPress={() => router.back()}>
            <Ionicons name="close" size={26} color={palette.textSecondary} />
          </Press>
        </View>

        <Text style={styles.label}>{t('Заведение')}</Text>
        <TextInput style={styles.input} value={draft.venue} onChangeText={(venue) => put({ venue })} placeholder={t('Бар «Дым»')} placeholderTextColor={palette.textSecondary} />

        <Text style={styles.label}>{t('Кого ищете')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {Object.entries(TRADES).map(([id, trade]) => (
            <Press key={id} style={[styles.chip, draft.category === id && styles.chipOn]} onPress={() => put({ category: id })}>
              <Text style={[styles.chipText, draft.category === id && styles.chipTextOn]}>
                {trade.emoji} {trade.label}
              </Text>
            </Press>
          ))}
        </ScrollView>

        <Text style={styles.label}>{t('Заголовок')}</Text>
        <TextInput style={styles.input} value={draft.title} onChangeText={(title) => put({ title })} placeholder={t('Бармен на вечер')} placeholderTextColor={palette.textSecondary} />

        <Text style={styles.label}>{t('Детали')}</Text>
        <TextInput style={[styles.input, styles.multiline]} multiline value={draft.details} onChangeText={(details) => put({ details })} placeholder={t('Что за смена, что уметь, как одеться')} placeholderTextColor={palette.textSecondary} />

        <View style={styles.pair}>
          <View style={styles.grow}>
            <Text style={styles.label}>{t('Дата')}</Text>
            <DateField value={draft.date} onChange={(date) => put({ date })} palette={palette} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.label}>{t('Часы')}</Text>
            <View style={styles.pairTight}>
              <TextInput style={[styles.input, styles.grow]} value={draft.start} onChangeText={(start) => put({ start })} placeholder="16:00" placeholderTextColor={palette.textSecondary} />
              <TextInput style={[styles.input, styles.grow]} value={draft.end} onChangeText={(end) => put({ end })} placeholder="23:00" placeholderTextColor={palette.textSecondary} />
            </View>
          </View>
        </View>

        <View style={styles.pair}>
          <View style={styles.grow}>
            <Text style={styles.label}>{t('Оплата')}</Text>
            <TextInput style={styles.input} value={draft.payAmount} onChangeText={(payAmount) => put({ payAmount })} keyboardType="numeric" placeholder="250" placeholderTextColor={palette.textSecondary} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.label}>{t('Период')}</Text>
            <View style={styles.pairTight}>
              {(['hour', 'shift', 'month'] as const).map((period) => (
                <Press key={period} style={[styles.chip, draft.payPeriod === period && styles.chipOn]} onPress={() => put({ payPeriod: period })}>
                  <Text style={[styles.chipText, draft.payPeriod === period && styles.chipTextOn]}>
                    {period === 'hour' ? t('час') : period === 'shift' ? t('смена') : t('месяц')}
                  </Text>
                </Press>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.pair}>
          <View style={styles.grow}>
            <Text style={styles.label}>{t('Город')}</Text>
            <TextInput style={styles.input} value={draft.city} onChangeText={(city) => put({ city })} placeholder="Київ" placeholderTextColor={palette.textSecondary} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.label}>{t('Мест')}</Text>
            <TextInput style={styles.input} value={draft.slots} onChangeText={(slots) => put({ slots })} keyboardType="numeric" placeholder="1" placeholderTextColor={palette.textSecondary} />
          </View>
        </View>

        {draft.date === todayKey() && (
          <View style={styles.urgentRow}>
            <View style={styles.grow}>
              <Text style={styles.rowTitle}>{t('Срочно: не вышли сегодня')}</Text>
              <Text style={styles.rowHint}>{t('Ищущим рядом уйдёт уведомление.')}</Text>
            </View>
            <Switch value={draft.urgent} onValueChange={(urgent) => put({ urgent })} />
          </View>
        )}

        <Text style={styles.label}>
          {t('Фото заведения')} · {draft.photos.length}/6
        </Text>
        <Text style={styles.rowHint}>{t('Минимум три: людям важно видеть, куда они идут.')}</Text>
        <View style={styles.photoRow}>
          {draft.photos.map((photo, index) => (
            <Press key={index} onPress={() => put({ photos: draft.photos.filter((_, at) => at !== index) })}>
              <Image source={{ uri: photo }} style={styles.photo} />
            </Press>
          ))}
          {draft.photos.length < 6 && (
            <Press style={styles.photoAdd} disabled={shrinking} onPress={() => void pickPhotos()}>
              {shrinking ? (
                <ActivityIndicator color={palette.accent} />
              ) : (
                <Ionicons name="add" size={26} color={palette.accent} />
              )}
            </Press>
          )}
        </View>

        {error !== null && <Text style={styles.error}>{error}</Text>}

        <Press style={[styles.submit, !ready && styles.submitOff]} disabled={busy || !ready} onPress={() => void submit()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{editId !== null ? t('Сохранить') : t('Опубликовать')}</Text>}
        </Press>
        {sourceId === null && (
          <Press
            onPress={() => {
              setDraft(BLANK);
              void AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined);
            }}
          >
            <Text style={styles.wipe}>{t('Очистить черновик')}</Text>
          </Press>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 16, paddingBottom: 48 },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    title: { color: palette.text, fontSize: 24, fontWeight: '800' },
    label: { color: palette.textSecondary, fontSize: 12.5, fontWeight: '700', marginTop: 12, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3 },
    input: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: palette.text,
      backgroundColor: palette.backgroundElement,
    },
    multiline: { minHeight: 72, textAlignVertical: 'top' },
    pair: { flexDirection: 'row', gap: 10 },
    pairTight: { flexDirection: 'row', gap: 6 },
    grow: { flex: 1 },
    chipRow: { gap: 6, paddingVertical: 2 },
    chip: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: palette.backgroundElement,
    },
    chipOn: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
    chipText: { color: palette.text, fontSize: 13 },
    chipTextOn: { color: palette.accent, fontWeight: '700' },
    urgentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 14,
      borderWidth: 1,
      borderColor: palette.danger,
      borderRadius: 12,
      padding: 12,
    },
    rowTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
    rowHint: { color: palette.textSecondary, fontSize: 12, marginTop: 2 },
    photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    photo: { width: 72, height: 72, borderRadius: 10 },
    photoAdd: {
      width: 72,
      height: 72,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.accent,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    error: { color: palette.danger, fontSize: 13, marginTop: 10 },
    submit: {
      backgroundColor: palette.accent,
      borderRadius: 14,
      alignItems: 'center',
      paddingVertical: 14,
      marginTop: 16,
    },
    submitOff: { backgroundColor: palette.border },
    submitText: { color: '#fff', fontWeight: '800', fontSize: 15.5 },
    wipe: { color: palette.textSecondary, textAlign: 'center', marginTop: 12, fontSize: 13 },
  });
