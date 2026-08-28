import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '@/constants/theme';
import {
  CalendarEvent,
  EVENT_PRESETS,
  EventKind,
  rateLine,
  ShiftTemplate,
  tint,
} from '@/lib/types';

/** What the pencil is loaded with. */
export type Brush =
  | { kind: 'shift'; template: ShiftTemplate }
  | { kind: 'event'; name: string; symbol: string | null; colour: string; eventKind: EventKind }
  | { kind: 'erase' };

export const brushColour = (brush: Brush, palette: Palette): string => {
  if (brush.kind === 'erase') return palette.danger;
  if (brush.kind === 'event') return tint(brush.colour, 1) ?? palette.accent;

  return tint(brush.template.colour, 1) ?? palette.accent;
};

export const brushName = (brush: Brush): string => {
  if (brush.kind === 'erase') return 'Стереть планы';

  return brush.kind === 'event' ? brush.name : brush.template.name;
};

export const brushSymbol = (brush: Brush): string | null =>
  brush.kind === 'erase' ? null : brush.kind === 'event' ? brush.symbol : brush.template.symbol;

/**
 * Picks what the pencil draws with.
 *
 * Shifts and events sit in the same sheet because from the calendar's side of
 * the screen they are the same act — you are saying what a day is. The server
 * keeps them apart for a good reason (shifts pay, events do not), and that
 * distinction shows up as two headings rather than two screens.
 */
export function PaintPicker({
  open,
  templates,
  events,
  palette,
  onPick,
  onClose,
  onManage,
}: {
  open: boolean;
  templates: ShiftTemplate[];
  /** The ones already on the calendar, so a name gets reused rather than retyped. */
  events: CalendarEvent[];
  palette: Palette;
  onPick: (brush: Brush) => void;
  onClose: () => void;
  onManage: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = makeStyles(palette);
  const live = templates.filter((entry) => !entry.archived);

  // The events already drawn, one row per distinct name — a fortnight of leave
  // is one offer to paint more of it, not fourteen.
  const seen = new Map<string, CalendarEvent>();

  for (const entry of events) if (!seen.has(entry.name)) seen.set(entry.name, entry);

  const known = [...seen.values()].filter(
    (entry) => !EVENT_PRESETS.some((preset) => preset.name === entry.name),
  );

  const row = (
    key: string,
    colour: string,
    symbol: string | null,
    name: string,
    meta: string | null,
    brush: Brush,
  ) => (
    <Pressable key={key} style={styles.row} onPress={() => onPick(brush)}>
      <View style={[styles.chip, { backgroundColor: tint(colour, 0.18) ?? palette.accentSoft }]}>
        <Text style={styles.chipMark}>{symbol ?? '●'}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
        {meta !== null && <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>}
      </View>
      <View style={[styles.dot, { backgroundColor: tint(colour, 1) ?? palette.accent }]} />
    </Pressable>
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.grabber} />

        <View style={styles.head}>
          <Text style={styles.title}>Чем закрасить дни</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={palette.textSecondary} />
          </Pressable>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listBody}>
          <Text style={styles.heading}>Смены</Text>

          {live.length === 0 ? (
            <Pressable style={styles.empty} onPress={onManage}>
              <Ionicons name="add-circle-outline" size={18} color={palette.accent} />
              <Text style={styles.emptyText}>Заведите первую смену — потом рисуйте ею месяц</Text>
            </Pressable>
          ) : (
            live.map((template) =>
              row(
                `shift-${template.id}`,
                template.colour ?? palette.accent,
                template.symbol,
                template.name,
                `${template.start_time.slice(0, 5)}–${template.end_time.slice(0, 5)} · ${rateLine(template)}`,
                { kind: 'shift', template },
              ),
            )
          )}

          <Text style={styles.heading}>События</Text>

          {EVENT_PRESETS.map((preset) =>
            row(
              `preset-${preset.name}`,
              preset.colour,
              preset.symbol,
              preset.name,
              preset.kind === 'vacation' || preset.kind === 'sick'
                ? 'Не сбивает темп заработка'
                : null,
              {
                kind: 'event',
                name: preset.name,
                symbol: preset.symbol,
                colour: preset.colour,
                eventKind: preset.kind,
              },
            ),
          )}

          {known.map((entry) =>
            row(
              `known-${entry.id}`,
              entry.colour,
              entry.symbol,
              entry.name,
              'Уже в календаре',
              {
                kind: 'event',
                name: entry.name,
                symbol: entry.symbol,
                colour: entry.colour,
                eventKind: entry.kind,
              },
            ),
          )}

          <Text style={styles.heading}>Ластик</Text>

          {row(
            'erase',
            palette.danger,
            '×',
            'Стереть планы',
            'Отработанные дни не трогает',
            { kind: 'erase' },
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
    sheet: {
      backgroundColor: palette.background,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 14,
      paddingTop: 8,
      maxHeight: '84%',
    },
    grabber: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.border,
      marginBottom: 10,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
    title: { flex: 1, fontSize: 19, fontWeight: '800', color: palette.text, letterSpacing: -0.3 },
    list: { flexGrow: 0 },
    listBody: { paddingBottom: 8, gap: 5 },
    heading: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 10,
      marginBottom: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 16,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    chip: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    chipMark: { fontSize: 17 },
    rowText: { flex: 1, gap: 2 },
    rowName: { color: palette.text, fontSize: 15, fontWeight: '700' },
    rowMeta: { color: palette.textSecondary, fontSize: 12 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    empty: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: palette.border,
      borderRadius: 16,
      padding: 13,
    },
    emptyText: { color: palette.textSecondary, fontSize: 13.5, flex: 1 },
  });
