import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { money } from '@/lib/types';

/**
 * The record and its back room, on the phone.
 *
 * The front half is the CV the web shows: real shifts, real hours, the
 * places and their stretches — the thing worth showing to somebody with no
 * reason to believe you. The back half is the chronicle: first day, last
 * day, what each place came to, and the private note the server keeps off
 * every shared endpoint. The person most likely to need either is standing
 * in a corridor holding a phone.
 */
interface HistoryPlace {
  name: string;
  from: string;
  to: string;
  shifts: number;
  hours: number;
  per_hour: number | null;
  currency: string;
}

interface WorkHistory {
  shifts: number;
  hours: number;
  months: number;
  first_month: string | null;
  last_month: string | null;
  places: HistoryPlace[];
  roles: string[];
}

interface Chapter {
  location_id: number;
  name: string;
  first_day: string | null;
  last_day: string | null;
  days: number;
  hours: number;
  earned: number;
  rate_first: number | null;
  rate_last: number | null;
  current: boolean;
  note: string | null;
}

export default function RecordScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [history, setHistory] = useState<WorkHistory | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    try {
      const [record, chronicle] = await Promise.all([
        api<WorkHistory>('/shifter/v1/history?money=false'),
        api<Chapter[]>('/shifter/v1/papers/chronicle').catch(() => []),
      ]);

      setHistory(record);
      setChapters(chronicle);
      setError(null);
    } catch {
      setError(t('Не дотянулись до сервера.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveNote = (locationId: number) => {
    const note = draft.trim() === '' ? null : draft.trim();

    setEditing(null);

    void api(`/shifter/v1/papers/chronicle/${locationId}/note`, {
      method: 'PUT',
      body: { note },
    }).then(load).catch(() => setError(t('Не сохранилось.')));
  };

  const saidMonth = (key: string | null) => {
    if (key === null) return '';

    const [year, month] = key.split('-');

    return `${new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('ru', { month: 'short' })} ${year}`;
  };

  const saidDay = (key: string | null) =>
    key === null ? '' : new Date(key).toLocaleDateString('ru', { month: 'short', year: 'numeric' });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('Послужной список')}</Text>
        <Press onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={palette.textSecondary} />
        </Press>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}
      {history === null && error === null && <ActivityIndicator color={palette.accent} />}

      {history !== null && history.shifts === 0 && (
        <Text style={styles.hint}>
          {t('Пока нечего показывать. Месяц отмеченных смен — уже история, которую не стыдно открыть.')}
        </Text>
      )}

      {history !== null && history.shifts > 0 && (
        <>
          <Text style={styles.lead}>
            {t('Всё отсюда — из смен, которые вы правда записали. Поэтому это можно показывать тому, у кого нет причин вам верить.')}
          </Text>

          <View style={styles.figures}>
            <View style={styles.figure}>
              <Text style={styles.figureValue}>{history.months}</Text>
              <Text style={styles.figureLabel}>{t('мес. в профессии')}</Text>
            </View>
            <View style={styles.figure}>
              <Text style={styles.figureValue}>{history.shifts}</Text>
              <Text style={styles.figureLabel}>{t('смен')}</Text>
            </View>
            <View style={styles.figure}>
              <Text style={styles.figureValue}>{Math.round(history.hours)}</Text>
              <Text style={styles.figureLabel}>{t('часов')}</Text>
            </View>
            <View style={styles.figure}>
              <Text style={styles.figureValue}>{history.places.length}</Text>
              <Text style={styles.figureLabel}>{t('мест')}</Text>
            </View>
          </View>

          {history.places.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('Где')}</Text>
              {history.places.map((place) => (
                <View key={place.name} style={styles.placeRow}>
                  <View style={styles.grow}>
                    <Text style={styles.placeName}>{place.name}</Text>
                    <Text style={styles.placeMeta}>
                      {saidMonth(place.from)} — {saidMonth(place.to)}
                    </Text>
                  </View>
                  <Text style={styles.placeFigures}>
                    {place.shifts} {t('см.')} · {Math.round(place.hours)} {t('ч')}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {history.roles.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('На чём стояли')}</Text>
              <View style={styles.roles}>
                {history.roles.map((role) => (
                  <Text key={role} style={styles.role}>
                    {role}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      {chapters.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Ваша хроника')}</Text>
          <Text style={styles.hint}>
            {t('Только для вас: этот раздел не попадает в общую карточку. Место записать, как оно было.')}
          </Text>

          {chapters.map((chapter) => (
            <View key={chapter.location_id} style={styles.chapter}>
              <View style={styles.chapterHead}>
                <Text style={styles.placeName}>{chapter.name}</Text>
                <Text style={styles.placeMeta}>
                  {saidDay(chapter.first_day)} — {chapter.current ? t('сейчас') : saidDay(chapter.last_day)}
                </Text>
              </View>
              <Text style={styles.placeMeta}>
                {chapter.days} {t('дн.')} · {money(chapter.earned)}
                {chapter.rate_first !== null &&
                  chapter.rate_last !== null &&
                  chapter.rate_last !== chapter.rate_first &&
                  ` · ${t('ставка')} ${money(chapter.rate_first)} → ${money(chapter.rate_last)}`}
              </Text>

              {editing === chapter.location_id ? (
                <>
                  <TextInput
                    style={styles.noteInput}
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    maxLength={500}
                    placeholder={t('Почему закончилось — для себя')}
                    placeholderTextColor={palette.textSecondary}
                  />
                  <View style={styles.noteButtons}>
                    <Press style={styles.noteSave} onPress={() => saveNote(chapter.location_id)}>
                      <Text style={styles.noteSaveText}>{t('Сохранить')}</Text>
                    </Press>
                    <Press onPress={() => setEditing(null)} hitSlop={8}>
                      <Text style={styles.noteCancel}>{t('Отмена')}</Text>
                    </Press>
                  </View>
                </>
              ) : (
                <Press
                  onPress={() => {
                    setEditing(chapter.location_id);
                    setDraft(chapter.note ?? '');
                  }}
                >
                  {chapter.note !== null ? (
                    <Text style={styles.note}>«{chapter.note}»</Text>
                  ) : (
                    <Text style={styles.noteAdd}>{t('Добавить приватную заметку')}</Text>
                  )}
                </Press>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 16, paddingBottom: 48, gap: 12 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { color: palette.text, fontSize: 22, fontWeight: '800' },
    lead: { color: palette.textSecondary, fontSize: 13, lineHeight: 18 },
    error: { color: palette.danger, fontSize: 13 },
    hint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 17 },
    figures: { flexDirection: 'row', gap: 8 },
    figure: {
      flex: 1,
      backgroundColor: palette.backgroundElement,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center',
    },
    figureValue: { color: palette.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
    figureLabel: { color: palette.textSecondary, fontSize: 11 },
    card: { backgroundColor: palette.backgroundElement, borderRadius: 16, padding: 14, gap: 8 },
    cardTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    grow: { flex: 1 },
    placeName: { color: palette.text, fontSize: 14, fontWeight: '600' },
    placeMeta: { color: palette.textSecondary, fontSize: 12 },
    placeFigures: { color: palette.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
    roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    role: {
      color: palette.text,
      fontSize: 12.5,
      backgroundColor: palette.backgroundSelected,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    chapter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 8, gap: 3 },
    chapterHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
    note: { color: palette.text, fontSize: 13, fontStyle: 'italic', marginTop: 2 },
    noteAdd: { color: palette.accent, fontSize: 12.5, marginTop: 2 },
    noteInput: {
      color: palette.text,
      backgroundColor: palette.background,
      borderRadius: 10,
      padding: 10,
      minHeight: 60,
      fontSize: 13,
      textAlignVertical: 'top',
    },
    noteButtons: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    noteSave: { backgroundColor: palette.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
    noteSaveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    noteCancel: { color: palette.textSecondary, fontSize: 13 },
  });
