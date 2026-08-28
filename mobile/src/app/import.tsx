import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { api, ApiError, upload } from '@/lib/api';
import { currentMonth, monthBounds, monthLabel } from '@/lib/calendar';
import { CalendarDayData, DaysResponse, ShiftTemplate, toSavePayload } from '@/lib/types';

interface ParsedRow {
  date: string;
  name: string;
  start: string;
  end: string;
}

interface Draft extends ParsedRow {
  /** Which template this row will be written as; null means "skip it". */
  templateId: number | null;
  /** The day already has shifts, so writing would overwrite somebody's work. */
  conflict: boolean;
}

const NAME_KEY = 'shifter.rota-name';

/**
 * The rota photographed on the wall becomes a month on the calendar. The
 * model reads it on the server, the phone shows what it found, and nothing
 * is written until a person has looked at the list.
 */
export default function ImportScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const month = currentMonth();

  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [existing, setExisting] = useState<Map<string, CalendarDayData>>(new Map());
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const bounds = monthBounds(month);
        const [shifts, days] = await Promise.all([
          api<ShiftTemplate[]>('/shifter/v1/shifts'),
          api<DaysResponse>(`/shifter/v1/days?from=${bounds.from}&to=${bounds.to}`),
        ]);

        setTemplates(shifts.filter((item) => !item.archived));
        setExisting(new Map(days.days.map((day) => [day.date, day])));
      } catch {
        setError('Не дотянулись до сервера.');
      }
    })();
    // The month is fixed for the life of this screen, so this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (from: 'camera' | 'library') => {
    const permission =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError(
        from === 'camera'
          ? 'Без доступа к камере снять график не получится.'
          : 'Без доступа к галерее фото не выбрать.',
      );

      return;
    }

    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });

    if (result.canceled) return;

    setPhoto(result.assets[0]);
    setDrafts(null);
    setError(null);
  };

  /** Times first, then the name: two bars can share a name, not a shift. */
  const matchTemplate = (row: ParsedRow): number | null =>
    templates.find((item) => item.start_time === row.start && item.end_time === row.end)?.id ??
    templates.find((item) => item.name.toLowerCase() === row.name.toLowerCase())?.id ??
    null;

  const recognise = async () => {
    if (photo === null || name.trim() === '') return;

    setBusy(true);
    setError(null);

    try {
      const form = new FormData();

      // React Native's FormData takes the file by descriptor, not by blob.
      form.append('photo', {
        uri: photo.uri,
        name: photo.fileName ?? 'rota.jpg',
        type: photo.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      form.append('employee', name.trim());
      form.append('year', `${month.year}`);
      form.append('month', `${month.month}`);

      const data = await upload<{ days: ParsedRow[] }>('/shifter/v1/import/schedule', form);

      setDrafts(
        data.days.map((row) => ({
          ...row,
          templateId: matchTemplate(row),
          conflict: (existing.get(row.date)?.shifts.length ?? 0) > 0,
        })),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? 'Чтение фото на этом сервере не включено.'
          : caught instanceof ApiError
            ? caught.message
            : 'Не смогли прочитать фото.',
      );
    } finally {
      setBusy(false);
    }
  };

  const chosen = (drafts ?? []).filter((row) => row.templateId !== null && !row.conflict);

  const apply = async () => {
    setBusy(true);

    try {
      // A day at a time, the same PUT the day editor sends, so an import and
      // a hand edit end up as the same kind of row. The day is sent whole, so
      // whatever else is already on it — a note, a colour, cash tips — is
      // carried over rather than erased by the import.
      for (const row of chosen) {
        const payload = toSavePayload(existing.get(row.date));

        await api(`/shifter/v1/days/${row.date}`, {
          method: 'PUT',
          body: {
            ...payload,
            shifts: [
              {
                shift_id: row.templateId as number,
                worked: false,
                needs_cover: false,
                actual_start: null,
                actual_end: null,
                break_minutes: null,
              },
            ],
          },
        });
      }

      router.back();
    } catch {
      setError('Часть дней не записалась. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <View style={styles.head}>
        <Text style={styles.title}>График с фото</Text>
        <Press hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={palette.textSecondary} />
        </Press>
      </View>

      <Text style={styles.lead}>
        Снимите график со стены — разберём его на смены за {monthLabel(month).toLowerCase()} и
        покажем, что нашли. Ничего не запишется, пока вы не посмотрите список.
      </Text>

      <Text style={styles.fieldLabel}>Как вы записаны в графике</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Иванов, или АБ"
        placeholderTextColor={palette.textSecondary}
        autoCapitalize="words"
      />

      {photo !== null && <Image source={{ uri: photo.uri }} style={styles.preview} />}

      <View style={styles.pickRow}>
        <Press style={styles.pickButton} onPress={() => void pick('camera')}>
          <Ionicons name="camera-outline" size={20} color={palette.accent} />
          <Text style={styles.pickText}>Снять</Text>
        </Press>
        <Press style={styles.pickButton} onPress={() => void pick('library')}>
          <Ionicons name="images-outline" size={20} color={palette.accent} />
          <Text style={styles.pickText}>Из галереи</Text>
        </Press>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {drafts === null ? (
        <Press
          style={[
            styles.primary,
            (photo === null || busy || name.trim() === '') && styles.primaryOff,
          ]}
          disabled={photo === null || busy || name.trim() === ''}
          onPress={() => void recognise()}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Прочитать график</Text>
          )}
        </Press>
      ) : (
        <>
          <Text style={styles.sectionTitle}>
            {drafts.length === 0 ? 'Ничего не нашли' : `Нашли смен: ${drafts.length}`}
          </Text>

          {drafts.map((row, index) => (
            <View key={`${row.date}-${index}`} style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.rowDate}>{row.date}</Text>
                <Text style={styles.rowMeta}>
                  {row.name} · {row.start}–{row.end}
                </Text>
              </View>

              {row.conflict ? (
                <Text style={styles.rowSkip}>день занят</Text>
              ) : row.templateId === null ? (
                <Text style={styles.rowSkip}>нет шаблона</Text>
              ) : (
                <Press
                  hitSlop={8}
                  onPress={() =>
                    setDrafts((rows) =>
                      (rows ?? []).map((item, at) =>
                        at === index
                          ? { ...item, templateId: item.templateId === null ? matchTemplate(item) : null }
                          : item,
                      ),
                    )
                  }
                >
                  <Ionicons name="checkmark-circle" size={26} color={palette.accent} />
                </Press>
              )}
            </View>
          ))}

          <Press
            style={[styles.primary, (chosen.length === 0 || busy) && styles.primaryOff]}
            disabled={chosen.length === 0 || busy}
            onPress={() => void apply()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Записать {chosen.length} в календарь</Text>
            )}
          </Press>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 20, paddingBottom: 48, gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: palette.text, fontSize: 24, fontWeight: '800' },
    lead: { color: palette.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 4 },
    grow: { flex: 1 },

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

    preview: {
      width: '100%',
      height: 220,
      borderRadius: 16,
      marginTop: 10,
      resizeMode: 'contain',
      backgroundColor: palette.backgroundElement,
    },

    pickRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
    pickButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderColor: palette.accent,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 12,
      backgroundColor: palette.accentSoft,
    },
    pickText: { color: palette.accent, fontSize: 15, fontWeight: '700' },

    error: { color: palette.danger, fontSize: 13 },

    sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '700', marginTop: 10 },
    row: {
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
    rowDate: { color: palette.text, fontSize: 15, fontWeight: '700' },
    rowMeta: { color: palette.textSecondary, fontSize: 12, marginTop: 2 },
    rowSkip: { color: palette.textSecondary, fontSize: 12 },

    primary: {
      backgroundColor: palette.accent,
      borderRadius: 999,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 14,
    },
    primaryOff: { opacity: 0.45 },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
