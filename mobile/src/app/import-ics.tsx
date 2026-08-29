import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { IcsOccurrence, readIcs } from '@/lib/ics';
import { t } from '@/lib/i18n';
import { CalendarDayData, ShiftTemplate, toSavePayload } from '@/lib/types';

/**
 * Google Calendar → the rota, on the phone: the same small reader the web
 * uses (mirrored, tested), the same preview, the same honesty about rules
 * it refused to parse. Nothing applies until the button.
 */
type Fate = { kind: 'skip' } | { kind: 'shift'; templateId: number } | { kind: 'event' };

export default function ImportIcsScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [parsed, setParsed] = useState<ReturnType<typeof readIcs> | null>(null);
  const [fates, setFates] = useState<Record<string, Fate>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, IcsOccurrence[]>();

    for (const item of parsed?.occurrences ?? []) {
      map.set(item.summary, [...(map.get(item.summary) ?? []), item]);
    }

    return [...map.entries()];
  }, [parsed]);

  const pick = async () => {
    setError(null);
    setDone(null);

    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/calendar', 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
    });

    if (picked.canceled || picked.assets.length === 0) return;

    try {
      const text = await new File(picked.assets[0].uri).text();
      const read = readIcs(text);
      const known = await api<ShiftTemplate[]>('/shifter/v1/shifts?archived=false');

      setTemplates(known);
      setParsed(read);

      const guesses: Record<string, Fate> = {};

      for (const [summary] of new Map(read.occurrences.map((o) => [o.summary, true]))) {
        const match = known.find(
          (template) => template.name.toLocaleLowerCase() === summary.toLocaleLowerCase(),
        );

        guesses[summary] = match !== undefined
          ? { kind: 'shift', templateId: match.id }
          : { kind: 'event' };
      }

      setFates(guesses);
    } catch {
      setError(t('Файл не прочитался как календарь.'));
    }
  };

  const apply = async () => {
    if (parsed === null) return;

    setBusy(true);
    setError(null);

    try {
      let shifts = 0;
      let events = 0;

      for (const [summary, items] of groups) {
        const fate = fates[summary] ?? { kind: 'skip' };

        if (fate.kind === 'skip') continue;

        if (fate.kind === 'shift') {
          for (const item of items) {
            // The day is always sent whole: fetch what stands, append the
            // placement, save — the same rule every client obeys.
            const range = await api<{ days: CalendarDayData[] }>(
              `/shifter/v1/days?from=${item.date}&to=${item.date}`,
            );
            const day = range.days.find((row) => row.date === item.date);
            const payload = toSavePayload(day);

            if (payload.shifts.some((entry) => entry.shift_id === fate.templateId)) continue;

            payload.shifts.push({
              shift_id: fate.templateId,
              worked: false,
              needs_cover: false,
              actual_start: null,
              actual_end: null,
              break_minutes: null,
              revenue: null,
            });

            await api(`/shifter/v1/days/${item.date}`, { method: 'PUT', body: payload });
            shifts += 1;
          }

          continue;
        }

        for (const item of items) {
          await api('/shifter/v1/events', {
            method: 'POST',
            body: {
              name: summary,
              symbol: null,
              colour: '#64748b',
              start_date: item.date,
              end_date: item.date,
              start_time: item.start,
              end_time: item.end,
              note: null,
              kind: 'ordinary',
              cost: 0,
            },
          });
          events += 1;
        }
      }

      setDone(`${t('Разложено')}: ${shifts} ${t('см.')} · ${events} ${t('соб.')}`);
    } catch {
      setError(t('Не всё разложилось — проверьте календарь.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('Импорт из календаря')}</Text>
        <Press onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={palette.textSecondary} />
        </Press>
      </View>

      <Text style={styles.hint}>
        {t('Выгрузите Google/Apple календарь в .ics и выберите файл. Ничего не применится, пока вы не скажете.')}
      </Text>

      <Press style={styles.pickButton} onPress={() => void pick()}>
        <Ionicons name="document-outline" size={18} color="#fff" />
        <Text style={styles.pickText}>{t('Выбрать .ics файл')}</Text>
      </Press>

      {error !== null && <Text style={styles.error}>{error}</Text>}
      {done !== null && <Text style={styles.done}>{done}</Text>}

      {parsed !== null && parsed.unparsed.length > 0 && (
        <Text style={styles.hint}>
          {t('Не разобрали повторение у')}: {parsed.unparsed.join(', ')}. {t('Честно пропущены, а не угаданы.')}
        </Text>
      )}

      {groups.map(([summary, items]) => {
        const fate = fates[summary] ?? { kind: 'skip' };
        const usual = items.find((item) => item.start !== null);

        return (
          <View key={summary} style={styles.group}>
            <View style={styles.groupHead}>
              <Text style={styles.groupName} numberOfLines={1}>{summary}</Text>
              <Text style={styles.groupMeta}>
                {items.length} {t('дн.')}
                {usual?.start != null ? ` · ${usual.start}${usual.end !== null ? `–${usual.end}` : ''}` : ''}
              </Text>
            </View>
            <View style={styles.fates}>
              {templates.map((template) => (
                <Press
                  key={template.id}
                  style={[
                    styles.fate,
                    fate.kind === 'shift' && fate.templateId === template.id && styles.fateOn,
                  ]}
                  onPress={() => setFates({ ...fates, [summary]: { kind: 'shift', templateId: template.id } })}
                >
                  <Text
                    style={[
                      styles.fateText,
                      fate.kind === 'shift' && fate.templateId === template.id && styles.fateTextOn,
                    ]}
                  >
                    {template.name}
                  </Text>
                </Press>
              ))}
              <Press
                style={[styles.fate, fate.kind === 'event' && styles.fateOn]}
                onPress={() => setFates({ ...fates, [summary]: { kind: 'event' } })}
              >
                <Text style={[styles.fateText, fate.kind === 'event' && styles.fateTextOn]}>
                  {t('Событие')}
                </Text>
              </Press>
              <Press
                style={[styles.fate, fate.kind === 'skip' && styles.fateOn]}
                onPress={() => setFates({ ...fates, [summary]: { kind: 'skip' } })}
              >
                <Text style={[styles.fateText, fate.kind === 'skip' && styles.fateTextOn]}>
                  {t('Пропустить')}
                </Text>
              </Press>
            </View>
          </View>
        );
      })}

      {groups.length > 0 && (
        <Press style={styles.applyButton} onPress={() => void apply()}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.applyText}>{t('Разложить по календарю')}</Text>
          )}
        </Press>
      )}
    </ScrollView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 16, paddingBottom: 48, gap: 10 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { color: palette.text, fontSize: 22, fontWeight: '800' },
    hint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 17 },
    error: { color: palette.danger, fontSize: 13 },
    done: { color: palette.good, fontSize: 13, fontWeight: '700' },
    pickButton: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: palette.accent,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
    group: { backgroundColor: palette.backgroundElement, borderRadius: 14, padding: 12, gap: 8 },
    groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
    groupName: { color: palette.text, fontSize: 14.5, fontWeight: '700', flex: 1 },
    groupMeta: { color: palette.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
    fates: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    fate: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: palette.background },
    fateOn: { backgroundColor: palette.accent },
    fateText: { color: palette.textSecondary, fontSize: 12.5 },
    fateTextOn: { color: '#fff', fontWeight: '700' },
    applyButton: {
      backgroundColor: palette.accent,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
    },
    applyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
