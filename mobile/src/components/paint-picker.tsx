import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import {
  CalendarEvent,
  EVENT_PRESETS,
  EventKind,
  EventTemplate,
  rateLine,
  ShiftTemplate,
  tint,
} from '@/lib/types';
import { t } from '@/lib/i18n';

/**
 * What the pencil is loaded with.
 *
 * Two of these draw something and two of them do something. They share a
 * sheet because they share a motion — you say which days, once — and keeping
 * "mark these worked" behind a modal per day is what made a week of shifts a
 * ten-minute job.
 */
export type Brush =
  | { kind: 'shift'; template: ShiftTemplate }
  | {
      kind: 'event';
      name: string;
      symbol: string | null;
      colour: string;
      eventKind: EventKind;
      /** From a palette entry: the usual hours and what one costs. */
      startTime?: string | null;
      endTime?: string | null;
      cost?: number;
      templateId?: number | null;
    }
  | { kind: 'worked' }
  | { kind: 'erase' };

export const brushColour = (brush: Brush, palette: Palette): string => {
  switch (brush.kind) {
    case 'erase': return palette.danger;
    case 'worked': return palette.good;
    case 'event': return tint(brush.colour, 1) ?? palette.accent;
    default: return tint(brush.template.colour, 1) ?? palette.accent;
  }
};

export const brushName = (brush: Brush): string => {
  switch (brush.kind) {
    case 'erase': return t('Стереть планы');
    case 'worked': return t('Отметить отработанными');
    case 'event': return brush.name;
    default: return brush.template.name;
  }
};

export const brushSymbol = (brush: Brush): string | null => {
  switch (brush.kind) {
    case 'erase': return null;
    case 'worked': return '\u2713';
    case 'event': return brush.symbol;
    default: return brush.template.symbol;
  }
};

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
  eventTemplates,
  events,
  palette,
  money,
  onPick,
  onClose,
  onManage,
}: {
  open: boolean;
  templates: ShiftTemplate[];
  /** The palette proper: things somebody set up to happen again. */
  eventTemplates: EventTemplate[];
  /** The ones already on the calendar, so a name gets reused rather than retyped. */
  events: CalendarEvent[];
  palette: Palette;
  money: (amount: number) => string;
  onPick: (brush: Brush) => void;
  onClose: () => void;
  onManage: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = makeStyles(palette);
  const live = templates.filter((entry) => !entry.archived);
  const kinds = eventTemplates.filter((entry) => !entry.archived);

  // The events already drawn, one row per distinct name — a fortnight of leave
  // is one offer to paint more of it, not fourteen.
  const seen = new Map<string, CalendarEvent>();

  for (const entry of events) if (!seen.has(entry.name)) seen.set(entry.name, entry);

  const known = [...seen.values()].filter(
    (entry) =>
      !EVENT_PRESETS.some((preset) => preset.name === entry.name) &&
      !kinds.some((entry2) => entry2.name === entry.name),
  );

  const row = (
    key: string,
    colour: string,
    symbol: string | null,
    name: string,
    meta: string | null,
    brush: Brush,
  ) => (
    <Press key={key} style={styles.row} onPress={() => onPick(brush)}>
      <View style={[styles.chip, { backgroundColor: tint(colour, 0.18) ?? palette.accentSoft }]}>
        <Text style={styles.chipMark}>{symbol ?? '●'}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
        {meta !== null && <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>}
      </View>
      <View style={[styles.dot, { backgroundColor: tint(colour, 1) ?? palette.accent }]} />
    </Press>
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.grabber} />

        <View style={styles.head}>
          <Text style={styles.title}>{t('Чем закрасить дни')}</Text>
          <Press onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={palette.textSecondary} />
          </Press>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listBody}>
          <Text style={styles.heading}>{t('Смены')}</Text>

          {live.length === 0 ? (
            <Press style={styles.empty} onPress={onManage}>
              <Ionicons name="add-circle-outline" size={18} color={palette.accent} />
              <Text style={styles.emptyText}>{t('Заведите первую смену — потом рисуйте ею месяц')}</Text>
            </Press>
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

          <Text style={styles.heading}>{t('События')}</Text>

          {/*
            The palette first, presets under it: somebody who set up
            «английский» wants it at the top, not below four defaults.
          */}
          {kinds.map((entry) =>
            row(
              `type-${entry.id}`,
              entry.colour,
              entry.symbol,
              entry.name,
              [
                entry.start_time === null
                  ? null
                  : `${entry.start_time}–${entry.end_time}`,
                entry.cost === null ? null : `−${money(entry.cost)}`,
              ]
                .filter((part) => part !== null)
                .join(' · ') || null,
              {
                kind: 'event',
                name: entry.name,
                symbol: entry.symbol,
                colour: entry.colour,
                eventKind: entry.kind,
                startTime: entry.start_time,
                endTime: entry.end_time,
                cost: entry.cost ?? 0,
                templateId: entry.id,
              },
            ),
          )}

          {EVENT_PRESETS.map((preset) =>
            row(
              `preset-${preset.name}`,
              preset.colour,
              preset.symbol,
              t(preset.name),
              preset.kind === 'vacation' || preset.kind === 'sick'
                ? t('Не сбивает темп заработка')
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
              t('Уже в календаре'),
              {
                kind: 'event',
                name: entry.name,
                symbol: entry.symbol,
                colour: entry.colour,
                eventKind: entry.kind,
              },
            ),
          )}

          <Text style={styles.heading}>{t('Действия')}</Text>

          {row(
            'worked',
            palette.good,
            '\u2713',
            t('Отметить отработанными'),
            t('Планы этих дней станут деньгами'),
            { kind: 'worked' },
          )}

          {row(
            'erase',
            palette.danger,
            '×',
            t('Стереть планы'),
            t('Отработанные дни и их деньги остаются'),
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
