import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '@/constants/theme';
import { covers, dayLabel, todayKey } from '@/lib/calendar';
import {
  CalendarDayData,
  CalendarEvent,
  DaySave,
  money,
  ShiftTemplate,
  tint,
  toSavePayload,
} from '@/lib/types';

/**
 * A day, without leaving the month.
 *
 * Tapping a square used to throw a full-screen editor over the calendar, and
 * the question being asked was almost never an editing one — it was "what is
 * that day". So the common answers live here: what is on it, what it paid,
 * and the two or three things anybody actually does next. The editor is still
 * one tap away for everything else.
 */
export function DayPeek({
  date,
  day,
  events,
  templates,
  palette,
  onWrite,
  onOpen,
  onClose,
}: {
  /** Null when nothing is being peeked at. */
  date: string | null;
  day: CalendarDayData | undefined;
  events: CalendarEvent[];
  templates: ShiftTemplate[];
  palette: Palette;
  onWrite: (date: string, payload: DaySave) => Promise<void>;
  onOpen: (date: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = makeStyles(palette);
  const [busy, setBusy] = useState<string | null>(null);

  if (date === null) return null;

  const shifts = day?.shifts ?? [];
  const here = events.filter((entry) => covers(entry.start_date, entry.end_date, date));
  const planned = shifts.filter((entry) => !entry.worked);
  const live = templates.filter((entry) => !entry.archived);

  const write = (label: string, change: (payload: DaySave) => DaySave) => {
    setBusy(label);

    void onWrite(date, change(toSavePayload(day)))
      .then(onClose)
      .finally(() => setBusy(null));
  };

  // The same line the server draws for a painted stroke: a day behind us is
  // worked, one ahead is a plan. Two ways of putting a shift on a day that
  // disagreed about which was which is how a month ends up half wrong.
  const addShift = (template: ShiftTemplate) =>
    write(`add-${template.id}`, (payload) => ({
      ...payload,
      shifts: [
        ...payload.shifts,
        {
          shift_id: template.id,
          worked: date <= todayKey(),
          needs_cover: false,
          actual_start: null,
          actual_end: null,
          break_minutes: null,
          revenue: null,
        },
      ],
    }));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.grabber} />

        <View style={styles.head}>
          <Text style={styles.title}>{dayLabel(date)}</Text>

          {(day?.earned ?? 0) > 0 && <Text style={styles.earned}>{money(day!.earned)}</Text>}
          {(day?.earned ?? 0) === 0 && (day?.planned ?? 0) > 0 && (
            <Text style={styles.plannedMoney}>план {money(day!.planned)}</Text>
          )}
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner}>
          {shifts.map((entry) => (
            <View
              key={entry.shift_id}
              style={[
                styles.shift,
                { borderColor: tint(entry.colour, 0.55) ?? palette.border },
                entry.worked && { backgroundColor: tint(entry.colour, 0.12) ?? palette.accentSoft },
              ]}
            >
              <Text style={styles.shiftMark}>{entry.symbol ?? '🕐'}</Text>

              <View style={styles.shiftText}>
                <Text style={styles.shiftName} numberOfLines={1}>{entry.name}</Text>
                <Text style={styles.shiftMeta}>
                  {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)} ·{' '}
                  {entry.hours.toString().replace('.', ',')} ч
                  {entry.earned > 0 ? ` · ${money(entry.earned)}` : ''}
                </Text>
              </View>

              <Text
                style={[
                  styles.state,
                  entry.worked && styles.stateWorked,
                  entry.needs_cover && styles.stateCover,
                ]}
              >
                {entry.needs_cover ? 'ищу замену' : entry.worked ? 'отработана' : 'план'}
              </Text>
            </View>
          ))}

          {here.map((entry) => (
            <View
              key={entry.id}
              style={[styles.event, { borderColor: tint(entry.colour, 0.55) ?? palette.border }]}
            >
              <Text style={styles.shiftMark}>{entry.symbol ?? '📌'}</Text>
              <View style={styles.shiftText}>
                <Text style={styles.shiftName} numberOfLines={1}>{entry.name}</Text>
                {entry.days > 1 && (
                  <Text style={styles.shiftMeta}>
                    {entry.start_date.slice(8)}–{entry.end_date.slice(8)} · {entry.days} дн.
                  </Text>
                )}
              </View>
            </View>
          ))}

          {(day?.tips ?? 0) > 0 || day?.deductions ? (
            <Text style={styles.extras}>
              {(day?.tips ?? 0) > 0 ? `Чай ${money(day!.tips!)}` : ''}
              {(day?.tips ?? 0) > 0 && (day?.deductions ?? 0) > 0 ? ' · ' : ''}
              {(day?.deductions ?? 0) > 0 ? `Удержания −${money(day!.deductions)}` : ''}
            </Text>
          ) : null}

          {day?.note != null && day.note.trim() !== '' && (
            <Text style={styles.note}>{day.note}</Text>
          )}

          {/* Nothing on the day: the templates themselves are the fastest way
              to say what it is, without the pencil and without the editor. */}
          {shifts.length === 0 && here.length === 0 && (
            <>
              <Text style={styles.emptyHead}>Поставить смену</Text>
              <View style={styles.chips}>
                {live.length === 0 && <Text style={styles.emptyText}>Смен пока нет</Text>}
                {live.map((template) => (
                  <Pressable
                    key={template.id}
                    style={[
                      styles.chip,
                      { borderColor: tint(template.colour, 0.55) ?? palette.border },
                    ]}
                    disabled={busy !== null}
                    onPress={() => addShift(template)}
                  >
                    {busy === `add-${template.id}` ? (
                      <ActivityIndicator size="small" color={palette.accent} />
                    ) : (
                      <>
                        <Text style={styles.chipMark}>{template.symbol ?? '🕐'}</Text>
                        <Text style={styles.chipName}>{template.name}</Text>
                      </>
                    )}
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.actions}>
          {planned.length > 0 && (
            <Pressable
              style={styles.primary}
              disabled={busy !== null}
              onPress={() =>
                write('worked', (payload) => ({
                  ...payload,
                  shifts: payload.shifts.map((entry) => ({ ...entry, worked: true })),
                }))
              }
            >
              {busy === 'worked' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={17} color="#fff" />
                  <Text style={styles.primaryText}>Отработана</Text>
                </>
              )}
            </Pressable>
          )}

          {planned.length > 0 && (
            <Pressable
              style={styles.ghost}
              disabled={busy !== null}
              onPress={() => {
                const asking = planned.every((entry) => entry.needs_cover);

                write('cover', (payload) => ({
                  ...payload,
                  shifts: payload.shifts.map((entry) =>
                    entry.worked ? entry : { ...entry, needs_cover: !asking },
                  ),
                }));
              }}
            >
              {busy === 'cover' ? (
                <ActivityIndicator size="small" color={palette.accent} />
              ) : (
                <Text style={styles.ghostText}>
                  {planned.every((entry) => entry.needs_cover) ? 'Не ищу' : 'Ищу замену'}
                </Text>
              )}
            </Pressable>
          )}

          <Pressable style={styles.ghost} onPress={() => onOpen(date)}>
            <Text style={styles.ghostText}>Открыть</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
    sheet: {
      backgroundColor: palette.background,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 14,
      paddingTop: 8,
      gap: 10,
      maxHeight: '72%',
    },
    grabber: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.border,
    },
    head: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
    title: { flex: 1, fontSize: 20, fontWeight: '800', color: palette.text, letterSpacing: -0.4 },
    earned: { fontSize: 20, fontWeight: '800', color: palette.text, fontVariant: ['tabular-nums'] },
    plannedMoney: { fontSize: 14, fontWeight: '700', color: palette.textSecondary },

    body: { flexGrow: 0 },
    bodyInner: { gap: 8, paddingBottom: 4 },
    shift: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      borderWidth: 1.5,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    event: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    shiftMark: { fontSize: 20 },
    shiftText: { flex: 1, gap: 2 },
    shiftName: { color: palette.text, fontSize: 15, fontWeight: '700' },
    shiftMeta: { color: palette.textSecondary, fontSize: 12.5, fontVariant: ['tabular-nums'] },
    state: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    stateWorked: { color: palette.good },
    stateCover: { color: palette.danger },

    extras: { color: palette.textSecondary, fontSize: 13.5, paddingHorizontal: 2 },
    note: {
      color: palette.text,
      fontSize: 13.5,
      fontStyle: 'italic',
      backgroundColor: palette.backgroundElement,
      borderRadius: 12,
      padding: 10,
    },

    emptyHead: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 2,
    },
    emptyText: { color: palette.textSecondary, fontSize: 13.5 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      borderWidth: 1.5,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 42,
    },
    chipMark: { fontSize: 16 },
    chipName: { color: palette.text, fontSize: 14, fontWeight: '700' },

    actions: { flexDirection: 'row', gap: 8 },
    primary: {
      flex: 1.4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      backgroundColor: palette.accent,
      borderRadius: 16,
      paddingVertical: 14,
    },
    primaryText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
    ghost: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 16,
      paddingVertical: 14,
    },
    ghostText: { color: palette.text, fontWeight: '700', fontSize: 14.5 },
  });
