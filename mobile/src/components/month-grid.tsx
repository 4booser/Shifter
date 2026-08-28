import { useRef } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';
import { covers, GridCell, monthGrid, YearMonth } from '@/lib/calendar';
import { CalendarDayData, CalendarEvent, moneyShort, tint } from '@/lib/types';

/** Six rows of a fixed height, so a page never changes size under a thumb. */
export const CELL_HEIGHT = 62;
export const GRID_HEIGHT = CELL_HEIGHT * 6;
const HEAD_HEIGHT = 22;
/** What one page of the pager measures, head included. */
export const PAGE_HEIGHT = GRID_HEIGHT + HEAD_HEIGHT;

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export interface PaintTarget {
  colour: string;
  /** Null for the eraser, which has nothing to draw with. */
  symbol: string | null;
}

/**
 * One month, drawn and painted.
 *
 * The grid does its own hit testing rather than handing every cell a press
 * handler, because a finger dragged across a row has to paint every cell it
 * crosses — and a Pressable only ever hears about the one it started in. Six
 * rows of seven, no gaps between the touch areas, so the arithmetic from a
 * coordinate to a day is exact.
 */
export function MonthGrid({
  month,
  days,
  events,
  today,
  held,
  palette,
  painting,
  selected,
  paint,
  onPaint,
  onOpen,
}: {
  month: YearMonth;
  days: Map<string, CalendarDayData>;
  events: CalendarEvent[];
  today: string;
  /** Days whose last edit has not reached the server yet. */
  held: Set<string>;
  palette: Palette;
  painting: boolean;
  selected: Set<string>;
  paint: PaintTarget | null;
  /** `first` is true for the cell the finger landed on, which sets the mode. */
  onPaint: (key: string, first: boolean) => void;
  onOpen: (key: string) => void;
}) {
  const styles = makeStyles(palette);
  const cells = monthGrid(month);
  const rows: GridCell[][] = [];

  for (let at = 0; at < 42; at += 7) rows.push(cells.slice(at, at + 7));

  // Measured rather than assumed: the page is the window's width, but the
  // padding around it is a style, and guessing it would put the finger a
  // column off at the edges. Refs rather than locals — a re-render would
  // otherwise wipe the measurement, and onLayout does not fire again to
  // replace it.
  const width = useRef(0);
  const last = useRef<string | null>(null);

  const at = (x: number, y: number): string | null => {
    if (width.current <= 0) return null;

    const column = Math.floor(x / (width.current / 7));
    const row = Math.floor(y / CELL_HEIGHT);

    if (column < 0 || column > 6 || row < 0 || row > 5) return null;

    return cells[row * 7 + column].key;
  };

  const brush = Gesture.Pan()
    .minDistance(0)
    .enabled(painting)
    .onBegin((event) => {
      const key = at(event.x, event.y);

      last.current = key;
      if (key !== null) onPaint(key, true);
    })
    .onUpdate((event) => {
      const key = at(event.x, event.y);

      if (key === null || key === last.current) return;

      last.current = key;
      onPaint(key, false);
    })
    .onFinalize(() => {
      last.current = null;
    })
    .runOnJS(true);

  // A tap outside paint mode opens the day. Kept separate from the pan so the
  // pager below still gets the horizontal swipes it lives on.
  const open = Gesture.Tap()
    .enabled(!painting)
    .maxDistance(12)
    .onEnd((event) => {
      const key = at(event.x, event.y);

      if (key !== null) onOpen(key);
    })
    .runOnJS(true);

  return (
    <View style={styles.page}>
      <View style={styles.weekHead}>
        {WEEKDAYS.map((name, index) => (
          <Text key={name} style={[styles.weekDay, index > 4 && styles.weekDayRest]}>
            {name}
          </Text>
        ))}
      </View>

      <GestureDetector gesture={Gesture.Exclusive(brush, open)}>
        <View
          style={styles.grid}
          onLayout={(event) => {
            width.current = event.nativeEvent.layout.width;
          }}
        >
          {rows.map((row) => (
            <View key={row[0].key} style={styles.row}>
              {row.map((cell) => (
                <Cell
                  key={cell.key}
                  cell={cell}
                  day={days.get(cell.key)}
                  events={events.filter((entry) => covers(entry.start_date, entry.end_date, cell.key))}
                  today={today}
                  held={held.has(cell.key)}
                  palette={palette}
                  styles={styles}
                  chosen={selected.has(cell.key)}
                  paint={paint}
                />
              ))}
            </View>
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

function Cell({
  cell,
  day,
  events,
  today,
  held,
  palette,
  styles,
  chosen,
  paint,
}: {
  cell: GridCell;
  day: CalendarDayData | undefined;
  events: CalendarEvent[];
  today: string;
  held: boolean;
  palette: Palette;
  styles: ReturnType<typeof makeStyles>;
  chosen: boolean;
  paint: PaintTarget | null;
}) {
  const shifts = day?.shifts ?? [];
  const worked = shifts.some((entry) => entry.worked);
  const cover = shifts.some((entry) => entry.needs_cover);
  const colour = shifts[0]?.colour ?? day?.colour ?? null;
  const accent = tint(colour, 1) ?? palette.accent;
  const isToday = cell.key === today;
  const rest = new Date(`${cell.key}T00:00:00`).getDay() % 6 === 0;

  // Worked days are filled, planned ones only outlined. The distinction is the
  // whole point of the screen: one is money, the other is a promise.
  const face = [
    styles.card,
    worked && { backgroundColor: tint(colour, 0.2) ?? palette.accentSoft, borderColor: 'transparent' },
    !worked && shifts.length > 0 && { borderColor: tint(colour, 0.65) ?? palette.accent },
    cover && !worked && styles.cardCover,
    chosen && {
      borderColor: paint?.colour ?? palette.accent,
      backgroundColor: tint(paint?.colour ?? null, 0.22) ?? palette.accentSoft,
      borderWidth: 2,
    },
  ];

  return (
    <View style={[styles.slot, !cell.inMonth && styles.slotOutside]}>
      <View style={face}>
        {events.length > 0 && (
          <View style={styles.stripe}>
            {events.slice(0, 3).map((entry) => (
              <View
                key={entry.id}
                style={[styles.stripePart, { backgroundColor: tint(entry.colour, 1) ?? palette.accent }]}
              />
            ))}
          </View>
        )}

        <Text
          style={[
            styles.number,
            rest && styles.numberRest,
            shifts.length > 0 && styles.numberBusy,
            isToday && styles.numberToday,
          ]}
        >
          {Number(cell.key.slice(8))}
        </Text>

        <Text style={styles.marks} numberOfLines={1}>
          {[
            ...shifts.slice(0, 2).map((entry) => entry.symbol ?? '●'),
            ...events.slice(0, 2).map((entry) => entry.symbol ?? ''),
          ]
            .join('')
            .slice(0, 4)}
        </Text>

        {worked
          ? <Text style={[styles.money, { color: accent }]} numberOfLines={1}>
              {moneyShort(day?.earned ?? 0)}
            </Text>
          : <View style={styles.moneyGap} />}
      </View>

      {chosen && (
        <View style={[styles.tick, { backgroundColor: paint?.colour ?? palette.accent }]}>
          <Text style={styles.tickMark}>{paint?.symbol === null ? '×' : '✓'}</Text>
        </View>
      )}

      {held && !chosen && <View style={styles.held} />}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    page: { paddingHorizontal: 12 },
    weekHead: { flexDirection: 'row', height: HEAD_HEIGHT, paddingBottom: 6 },
    weekDay: {
      flex: 1,
      textAlign: 'center',
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    weekDayRest: { color: palette.accent, opacity: 0.75 },
    grid: { height: GRID_HEIGHT },
    row: { flexDirection: 'row', height: CELL_HEIGHT },
    // The touch area is the whole seventh; the card inside it is what you see,
    // which is how two cells can look separated without leaving a dead gap
    // between them for a dragging finger to fall into.
    slot: { flex: 1, height: CELL_HEIGHT, padding: 2.5 },
    slotOutside: { opacity: 0.32 },
    card: {
      flex: 1,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      gap: 1,
    },
    cardCover: { borderStyle: 'dashed', borderColor: palette.danger },
    stripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, flexDirection: 'row' },
    stripePart: { flex: 1, height: 3 },
    number: { color: palette.textSecondary, fontSize: 13, fontWeight: '600' },
    numberRest: { color: palette.accent, opacity: 0.7 },
    numberBusy: { color: palette.text, fontWeight: '700' },
    numberToday: {
      color: '#fff',
      backgroundColor: palette.accent,
      overflow: 'hidden',
      borderRadius: 9,
      minWidth: 18,
      lineHeight: 18,
      textAlign: 'center',
      fontWeight: '800',
    },
    marks: { fontSize: 11, height: 14, lineHeight: 14 },
    money: { fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
    moneyGap: { height: 12 },
    tick: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tickMark: { color: '#fff', fontSize: 10, fontWeight: '900', lineHeight: 12 },
    // Hollow on purpose: the day is on its way, not recorded. A filled mark
    // would say the server has it.
    held: {
      position: 'absolute',
      top: 3,
      right: 3,
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: palette.textSecondary,
    },
  });
