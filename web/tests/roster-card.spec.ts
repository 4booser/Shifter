import { describe, expect, it } from 'vitest';

import type { RosterMonth, RosterPerson } from '@/lib/api/roster';
import { WEEKDAY_LABELS } from '@/lib/calendar/calendar-date';
import type { WeekHours } from '@/lib/calendar/models';
import { rosterCardData, rosterCardLayout } from '@/lib/export/roster-card';
import { rosterDays } from '@/lib/roster/month';
import { INHERIT, NO_PATTERN } from '@/lib/roster/people';
import { venueLine } from '@/lib/roster/rules';

/** Well over the widest thing a cell holds: digits run about 0.6 em and a colon less, so «22:30» is under 2.8. */
const WIDEST_HOURS_IN_EMS = 2.8;

/** What iOS will still draw. Past it a canvas comes back blank with no error. */
const CANVAS_AREA_LIMIT = 16_777_216;

const canvasOf = (days: number, people: number) => {
  const layout = rosterCardLayout(days, people);

  return { width: layout.width * layout.scale, height: layout.height * layout.scale };
};

describe('the card’s geometry', () => {
  it.each([28, 29, 30, 31])('gives %i days room for every column', (days) => {
    const layout = rosterCardLayout(days, 8);

    expect(layout.width).toBe(layout.pad * 2 + layout.nameWidth + days * layout.columnWidth);
  });

  it('keeps every column as wide on a long month: more days make a wider picture, not smaller text', () => {
    const short = rosterCardLayout(28, 8);
    const long = rosterCardLayout(31, 8);

    expect(long.columnWidth).toBe(short.columnWidth);
    expect(long.hoursFont).toBe(short.hoursFont);
    expect(long.width).toBeGreaterThan(short.width);
  });

  it('fits hours with minutes on both lines inside a column', () => {
    const { columnWidth, hoursFont } = rosterCardLayout(31, 8);

    expect(hoursFont * WIDEST_HOURS_IN_EMS).toBeLessThanOrEqual(columnWidth - 3);
  });

  it('keeps the hours big enough to read on a phone once zoomed', () => {
    expect(rosterCardLayout(31, 60).hoursFont).toBeGreaterThanOrEqual(14);
  });

  it('stacks two lines inside a row, one clear of the other', () => {
    const { hoursLines, hoursFont, rowHeight } = rosterCardLayout(31, 8);

    expect(hoursLines[1] - hoursLines[0]).toBeGreaterThanOrEqual(hoursFont);
    expect(hoursLines[0] - hoursFont).toBeGreaterThanOrEqual(0);
    expect(hoursLines[1]).toBeLessThan(rowHeight);
  });

  it('grows a row for every person', () => {
    const one = rosterCardLayout(30, 1);
    const sixty = rosterCardLayout(30, 60);

    expect(sixty.height - one.height).toBe(59 * one.rowHeight);
    expect(one.height).toBe(one.headerHeight + one.dayHeight + one.rowHeight + one.footerHeight);
  });

  it('stays inside what a chat keeps sharp, for an ordinary team', () => {
    const { width, height } = canvasOf(31, 12);

    expect(Math.max(width, height)).toBeLessThanOrEqual(2560);
  });

  it('never draws below life size, however many people: smaller would be unreadable, not just soft', () => {
    expect(rosterCardLayout(31, 60).scale).toBe(1);
  });

  it('stays sharp on a small roster, and not sharper than it has to be', () => {
    expect(rosterCardLayout(28, 2).scale).toBeGreaterThan(1.5);
    expect(rosterCardLayout(7, 1).scale).toBe(2);
  });

  it.each([
    [31, 60],
    [31, 1],
    [28, 60],
  ])('stays a canvas a phone can draw at %i days and %i people', (days, people) => {
    const { width, height } = canvasOf(days, people);

    expect(width * height).toBeLessThan(CANVAS_AREA_LIMIT);
  });

  it('still makes a picture of a roster with nobody on it', () => {
    const layout = rosterCardLayout(30, 0);

    expect(layout.height).toBeGreaterThan(0);
    expect(layout.scale).toBeGreaterThan(0);
  });
});

const person = (id: number, name: string, position: [number, string] | null, colour: string): RosterPerson => ({
  id,
  name,
  position_id: position?.[0] ?? null,
  position: position?.[1] ?? null,
  colour,
  hours: INHERIT,
  pattern: NO_PATTERN,
});

/** Open all week but Sunday. */
const VENUE: WeekHours[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time: '12:00', end_time: '00:00' }));

describe('the card’s data', () => {
  const sheet: RosterMonth = {
    id: 1,
    title: 'Бар',
    share_slug: 'abcdefghjkmn',
    month: '2026-11',
    venue_hours: [],
    positions: [{ id: 4, name: 'Кальяны', hours: { mode: 'none', start_time: null, end_time: null, week_hours: [] } }],
    people: [person(1, 'Толик', [4, 'Кальяны'], '#6366f1'), person(2, 'Гриша', null, '#d97706')],
    shifts: [
      { person_id: 1, date: '2026-11-02', start_time: '11:30', end_time: '22:00' },
      { person_id: 2, date: '2026-11-30', start_time: '18:00', end_time: '00:00' },
    ],
  };

  const labels = { period: 'Ноябрь 2026', summary: '2 человека · 2 смены', weekdays: WEEKDAY_LABELS, venue: null };
  const days = rosterDays({ year: 2026, month: 11 }, '2026-11-02');
  const data = rosterCardData(sheet, days, labels);

  it('holds one cell per day for every person', () => {
    expect(data.days).toHaveLength(30);
    expect(data.rows.map((row) => row.cells.length)).toEqual([30, 30]);
  });

  it('stacks the hours, and leaves a day off empty', () => {
    expect(data.rows[0].cells[1]).toEqual(['11:30', '22']);
    expect(data.rows[0].cells[0]).toBeNull();
    expect(data.rows[1].cells[29]).toEqual(['18', '24']);
  });

  it('heads each column with its weekday and date, Monday first', () => {
    expect(data.days[1]).toEqual({ weekday: 'Mon', dayOfMonth: 2, weekend: false, monday: true, closed: false });
    expect(data.days[0]).toEqual({ weekday: 'Sun', dayOfMonth: 1, weekend: true, monday: false, closed: false });
  });

  it('draws a day with no time as a filled cell with no text', () => {
    const bare = rosterCardData(
      { ...sheet, shifts: [{ person_id: 2, date: '2026-11-03', start_time: null, end_time: null }] },
      days,
      labels,
    );

    expect(bare.rows[1].cells[2]).toBe('bare');
    expect(bare.rows[1].cells[1]).toBeNull();
  });

  it('marks closed days', () => {
    const shut = rosterCardData({ ...sheet, venue_hours: VENUE }, rosterDays({ year: 2026, month: 11 }, '2026-11-02', VENUE), labels);

    expect(shut.days.filter((day) => day.closed).map((day) => day.dayOfMonth)).toEqual([1, 8, 15, 22, 29]);
    expect(data.days.some((day) => day.closed)).toBe(false);
  });

  it('makes room for the opening hours under the title', () => {
    const plain = rosterCardLayout(30, 8);
    const venue = rosterCardLayout(30, 8, true);
    const line = venueLine(VENUE, 'ru');

    expect(venue.headerHeight).toBe(112);
    expect(venue.height - plain.height).toBe(16);
    expect(rosterCardData(sheet, days, { ...labels, venue: line }).venue).toBe('Пн–Сб 12:00–00:00 · Вс закрыто');
  });

  it('keeps its height when there are no opening hours', () => {
    expect(rosterCardLayout(30, 8).headerHeight).toBe(96);
    expect(rosterCardLayout(30, 8, false)).toEqual(rosterCardLayout(30, 8));
    expect(data.venue).toBeNull();
  });

  it('draws people in position order', () => {
    const crew = rosterCardData(
      {
        ...sheet,
        people: [person(1, 'Гриша', null, '#d97706'), person(2, 'Толик', [4, 'Кальяны'], '#6366f1'), person(3, 'Паша', null, '#0891b2')],
      },
      days,
      labels,
    );

    expect(crew.rows.map((row) => [row.name, row.position])).toEqual([
      ['Толик', 'Кальяны'],
      ['Гриша', null],
      ['Паша', null],
    ]);
  });

  it('carries the names, positions and colours and not the link', () => {
    expect(data.rows[0]).toMatchObject({ name: 'Толик', position: 'Кальяны', colour: '#6366f1' });
    expect(JSON.stringify(data)).not.toContain(sheet.share_slug);
  });
});
