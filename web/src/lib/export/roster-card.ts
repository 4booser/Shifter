import type { RosterMonth } from '../api/roster';
import { readableInk } from '../calendar/contrast';
import { pairOf, stackedHours } from '../roster/hours';
import { RosterDay, cellKey, cellsOf } from '../roster/month';
import { byPosition } from '@/lib/roster/rules';
import { CardTheme } from './share-card';

export interface RosterCardRow {
  name: string;
  position: string | null;
  colour: string;
  /** One entry per day: the hours on two lines, 'bare' for a day with no set time, or null for a day off. */
  cells: ([string, string] | 'bare' | null)[];
}

export interface RosterCardDay {
  /** "Пн", already in the reader's language. */
  weekday: string;
  dayOfMonth: number;
  weekend: boolean;
  monday: boolean;
  /** The venue does not open that day. */
  closed: boolean;
}

export interface RosterCardData {
  title: string;
  period: string;
  /** The venue's week in one line, under the title; null with no opening hours set. */
  venue: string | null;
  days: RosterCardDay[];
  rows: RosterCardRow[];
  /** "8 человек · 124 смены". */
  summary: string;
}

export interface RosterCardLayout {
  width: number;
  height: number;
  /** Canvas pixels per unit below. */
  scale: number;
  pad: number;
  nameWidth: number;
  columnWidth: number;
  /** Where the table starts: the day headers, then the first row. */
  headerHeight: number;
  dayHeight: number;
  rowHeight: number;
  footerHeight: number;
  /** Hours are the point of the picture, so the size is fixed and the picture grows around it. */
  hoursFont: number;
  /** Baselines of the two stacked lines, from the top of a row. */
  hoursLines: [number, number];
}

const PAD = 40;
const NAME_W = 176;
const COLUMN_W = 46;
const HEADER_H = 96;
/** The header with a line of opening hours under the title. */
const HEADER_VENUE_H = 112;
const DAY_H = 52;
const ROW_H = 54;
const FOOTER_H = 56;
const HOURS_FONT = 15;

/** Past this chats start shrinking a picture on the way through, which costs more sharpness than drawing it smaller does. */
const CHAT_SIDE = 2560;

/** The month's geometry. A column stays wide enough for 11:30 at a size that survives a chat, so a long month makes a wider picture and never smaller text. */
export function rosterCardLayout(days: number, people: number, venue = false): RosterCardLayout {
  const header = venue ? HEADER_VENUE_H : HEADER_H;
  const width = PAD * 2 + NAME_W + days * COLUMN_W;
  const height = header + DAY_H + people * ROW_H + FOOTER_H;

  return {
    width,
    height,
    scale: Math.min(2, Math.max(1, CHAT_SIDE / Math.max(width, height))),
    pad: PAD,
    nameWidth: NAME_W,
    columnWidth: COLUMN_W,
    headerHeight: header,
    dayHeight: DAY_H,
    rowHeight: ROW_H,
    footerHeight: FOOTER_H,
    hoursFont: HOURS_FONT,
    hoursLines: [ROW_H / 2 - 4, ROW_H / 2 + 14],
  };
}

/** A month and its labels, laid out as rows of cells, with nothing left to look up while drawing. */
export function rosterCardData(
  sheet: RosterMonth,
  days: RosterDay[],
  labels: { period: string; summary: string; weekdays: string[]; venue: string | null },
): RosterCardData {
  const cells = cellsOf(sheet.shifts);

  return {
    title: sheet.title,
    period: labels.period,
    venue: labels.venue,
    summary: labels.summary,
    days: days.map((day) => ({
      weekday: labels.weekdays[day.weekday],
      dayOfMonth: day.dayOfMonth,
      weekend: day.weekend,
      monday: day.weekday === 0,
      closed: day.closed,
    })),
    // In the order every other list of them goes: by position.
    rows: byPosition(sheet.people, sheet.positions).map((person) => ({
      name: person.name,
      position: person.position,
      colour: person.colour,
      cells: days.map((day) => {
        const shift = cells.get(cellKey(person.id, day.key));

        if (shift === undefined) return null;

        const pair = pairOf(shift);

        return pair === null ? 'bare' : stackedHours(pair.start, pair.end);
      }),
    })),
  };
}

const FONT = 'system-ui, -apple-system, sans-serif';

/** The month as one PNG, sized for a group chat. */
export function drawRosterCard(data: RosterCardData, theme: CardTheme): Promise<Blob> {
  const layout = rosterCardLayout(data.days.length, data.rows.length, data.venue !== null);
  const { width, height, scale, pad, nameWidth, columnWidth, headerHeight, dayHeight, rowHeight } = layout;

  const canvas = document.createElement('canvas');

  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');

  if (ctx === null) return Promise.reject(new Error('canvas'));

  ctx.scale(scale, scale);

  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, width, height);

  const clip = (text: string, max: number, font: string) => {
    ctx.font = font;

    if (ctx.measureText(text).width <= max) return text;

    let cut = text;

    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);

    return `${cut}…`;
  };

  // Header: the roster's title carries the card; the month sits quietly right.
  const periodFont = `500 19px ${FONT}`;

  ctx.font = periodFont;

  const periodWidth = ctx.measureText(data.period).width;
  const titleFont = `700 30px ${FONT}`;

  ctx.fillStyle = theme.text;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(clip(data.title, width - pad * 2 - periodWidth - 32, titleFont), pad, 62);

  ctx.fillStyle = theme.muted;
  ctx.font = periodFont;
  ctx.textAlign = 'right';
  ctx.fillText(data.period, width - pad, 62);
  ctx.textAlign = 'left';

  if (data.venue !== null) {
    const venueFont = `500 15px ${FONT}`;

    ctx.fillText(clip(data.venue, width - pad * 2, venueFont), pad, 88);
  }

  const gridX = pad + nameWidth;
  const gridY = headerHeight;
  const gridBottom = gridY + dayHeight + data.rows.length * rowHeight;

  // Weekends first, so everything else lands on top of the tint. A day the
  // venue is closed is darker than a weekend, the way the page greys it.
  ctx.fillStyle = theme.border;
  data.days.forEach((day, index) => {
    if (!day.weekend && !day.closed) return;

    ctx.globalAlpha = day.closed ? 0.85 : 0.45;
    ctx.fillRect(gridX + columnWidth * index, gridY, columnWidth, gridBottom - gridY);
  });
  ctx.globalAlpha = 1;

  // The table has no week grid, so a rule before each Monday says where weeks begin.
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  data.days.forEach((day, index) => {
    if (!day.monday || index === 0) return;

    const x = Math.round(gridX + columnWidth * index) + 0.5;

    ctx.beginPath();
    ctx.moveTo(x, gridY);
    ctx.lineTo(x, gridBottom);
    ctx.stroke();
  });

  // Day headers.
  ctx.textAlign = 'center';
  data.days.forEach((day, index) => {
    const x = gridX + columnWidth * (index + 0.5);

    ctx.fillStyle = day.weekend && !day.closed ? theme.text : theme.muted;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(day.weekday, x, gridY + 20);
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(`${day.dayOfMonth}`, x, gridY + 41);
  });
  ctx.textAlign = 'left';

  data.rows.forEach((row, rowIndex) => {
    const y = gridY + dayHeight + rowIndex * rowHeight;

    ctx.strokeStyle = theme.border;
    ctx.beginPath();
    ctx.moveTo(pad, y + 0.5);
    ctx.lineTo(width - pad, y + 0.5);
    ctx.stroke();

    ctx.fillStyle = row.colour;
    ctx.beginPath();
    ctx.arc(pad + 7, y + rowHeight / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    const nameFont = `600 16px ${FONT}`;
    const positionFont = `500 13px ${FONT}`;
    const named = nameWidth - 34;

    ctx.fillStyle = theme.text;
    ctx.font = nameFont;
    ctx.fillText(clip(row.name, named, nameFont), pad + 22, row.position === null ? y + rowHeight / 2 + 6 : y + 24);

    if (row.position !== null) {
      ctx.fillStyle = theme.muted;
      ctx.font = positionFont;
      ctx.fillText(clip(row.position, named, positionFont), pad + 22, y + 42);
    }

    row.cells.forEach((cell, dayIndex) => {
      if (cell === null) return;

      const x = gridX + columnWidth * dayIndex;

      ctx.fillStyle = row.colour;
      ctx.fillRect(x + 1.5, y + 2, columnWidth - 3, rowHeight - 4);

      // They work and nobody said when: the colour says the first, a dot the second.
      if (cell === 'bare') {
        ctx.fillStyle = readableInk(row.colour);
        ctx.beginPath();
        ctx.arc(x + columnWidth / 2, y + rowHeight / 2, 4, 0, Math.PI * 2);
        ctx.fill();

        return;
      }

      // Stacked, because side by side thirty-one of these would need a picture no chat keeps sharp.
      ctx.fillStyle = readableInk(row.colour);
      ctx.font = `700 ${layout.hoursFont}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(cell[0], x + columnWidth / 2, y + layout.hoursLines[0]);
      ctx.fillText(cell[1], x + columnWidth / 2, y + layout.hoursLines[1]);
      ctx.textAlign = 'left';
    });
  });

  ctx.strokeStyle = theme.border;
  ctx.beginPath();
  ctx.moveTo(pad, gridBottom + 0.5);
  ctx.lineTo(width - pad, gridBottom + 0.5);
  ctx.stroke();

  ctx.fillStyle = theme.muted;
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText(data.summary, pad, height - 22);

  ctx.fillStyle = theme.accent;
  ctx.font = `700 15px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('Shifter', width - pad, height - 22);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('png')) : resolve(blob)),
      'image/png',
    );
  });
}
