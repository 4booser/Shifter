import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError, api } from '@/lib/api/http';
import {
  RosterMonth,
  RosterPerson,
  RosterPersonSave,
  RosterPosition,
  RosterShift,
  refusedForGood,
  rosterApi,
  sendEdits,
} from '@/lib/api/roster';
import type { WeekHours } from '@/lib/calendar/models';
import { BARE, Brush, USUAL, brushesOf } from '@/lib/roster/brushes';
import { ListedDay, dayList } from '@/lib/roster/day-list';
import {
  RosterEdit,
  aboutPerson,
  applyEdit,
  editKey,
  fillNotice,
  fillUndo,
  overlay,
  peopleGone,
  personOf,
  personSave,
  press,
  stamp,
  swap,
  undoOf,
  usualFor,
} from '@/lib/roster/edits';
import { cellText, compactHours, runsOvernight, stackedHours, validHours } from '@/lib/roster/hours';
import { cellKey, cellsOf, fillFrom, monthKey, monthOfKey, monthWeeks, rosterDays } from '@/lib/roster/month';
import {
  INHERIT,
  NO_PATTERN,
  PersonFields,
  ROSTER_COLOURS,
  cleanPerson,
  draftOf,
  namesOf,
  nextColour,
  nextFrom,
  patternLabel,
} from '@/lib/roster/people';

vi.mock('@/lib/api/http', async (original) => ({
  ...(await original<typeof import('@/lib/api/http')>()),
  api: vi.fn(),
}));

const person = (id: number, name: string, positionId: number | null = null): RosterPerson => ({
  id,
  name,
  position_id: positionId,
  position: null,
  colour: '#6366f1',
  hours: INHERIT,
  pattern: NO_PATTERN,
});

const shift = (personId: number, date: string, start = '11:00', end = '22:00'): RosterShift => ({
  person_id: personId,
  date,
  start_time: start,
  end_time: end,
});

/** A day they work with no set time. */
const bare = (personId: number, date: string): RosterShift => ({ person_id: personId, date, start_time: null, end_time: null });

const sheet = (over: Partial<RosterMonth> = {}): RosterMonth => ({
  id: 1,
  title: 'Бар',
  share_slug: null,
  month: '2026-11',
  venue_hours: [],
  positions: [],
  people: [person(1, 'Толик'), person(2, 'Гриша')],
  shifts: [],
  ...over,
});

/** Mon–Thu 12–00, Fri–Sat 12–02, closed on Sunday: the fixture's bar. */
const BAR: WeekHours[] = [
  ...[1, 2, 3, 4].map((weekday) => ({ weekday, start_time: '12:00', end_time: '00:00' })),
  ...[5, 6].map((weekday) => ({ weekday, start_time: '12:00', end_time: '02:00' })),
];

const position = (id: number, name: string, hours: RosterPosition['hours'] = { mode: 'none', start_time: null, end_time: null, week_hours: [] }): RosterPosition => ({ id, name, hours });

const BARMAN = position(1, 'Бармен', { mode: 'own', start_time: '18:00', end_time: '02:00', week_hours: [] });
const HOOKAH = position(2, 'Кальянщик');

const saveOf = (name: string, over: Partial<RosterPersonSave> = {}): RosterPersonSave => ({
  name,
  colour: '#059669',
  position_id: null,
  hours: INHERIT,
  pattern: NO_PATTERN,
  ...over,
});

/** Everyone working a day, whatever their position. */
const onOf = (entry: ListedDay) => entry.groups.flatMap((group) => group.on);

describe('the month grid', () => {
  it.each([
    [2026, 2, 28],
    [2028, 2, 29],
    [2026, 11, 30],
    [2026, 10, 31],
    [2026, 12, 31],
  ])('holds every day of %i-%i', (year, month, length) => {
    const days = rosterDays({ year, month }, '2000-01-01');
    const key = monthKey({ year, month });

    expect(days).toHaveLength(length);
    expect(days[0].key).toBe(`${key}-01`);
    expect(days[length - 1].key).toBe(`${key}-${length}`);
    expect(days.map((day) => day.dayOfMonth)).toEqual(Array.from({ length }, (_, index) => index + 1));
  });

  it('counts the week from Monday', () => {
    const days = rosterDays({ year: 2026, month: 11 }, '2000-01-01');

    // The first of November 2026 is a Sunday, the second a Monday.
    expect(days[0].weekday).toBe(6);
    expect(days[1].weekday).toBe(0);
  });

  it('marks Saturdays and Sundays and nothing else', () => {
    const days = rosterDays({ year: 2026, month: 11 }, '2000-01-01');

    expect(days.filter((day) => day.weekend).map((day) => day.dayOfMonth)).toEqual([1, 7, 8, 14, 15, 21, 22, 28, 29]);
  });

  it('marks today once, and not in any other month', () => {
    const november = rosterDays({ year: 2026, month: 11 }, '2026-11-02');
    const december = rosterDays({ year: 2026, month: 12 }, '2026-11-02');

    expect(november.filter((day) => day.isToday).map((day) => day.key)).toEqual(['2026-11-02']);
    expect(december.some((day) => day.isToday)).toBe(false);
  });

  it('writes a month the way the server names it, and reads it back', () => {
    expect(monthKey({ year: 2026, month: 3 })).toBe('2026-03');
    expect(monthOfKey('2026-03')).toEqual({ year: 2026, month: 3 });
  });

  it('finds a shift by its person and date', () => {
    const cells = cellsOf([shift(1, '2026-11-02'), shift(2, '2026-11-02', '12:00')]);

    expect(cells.get(cellKey(2, '2026-11-02'))?.start_time).toBe('12:00');
    expect(cells.get(cellKey(1, '2026-11-03'))).toBeUndefined();
  });

  it('marks closed days only when opening hours are set', () => {
    expect(rosterDays({ year: 2026, month: 11 }, '2000-01-01').some((day) => day.closed)).toBe(false);

    const closed = rosterDays({ year: 2026, month: 11 }, '2000-01-01', BAR).filter((day) => day.closed);

    expect(closed.map((day) => day.dayOfMonth)).toEqual([1, 8, 15, 22, 29]);
  });

  it('fills from today in this month, from the 1st in a later one, not at all in one gone by', () => {
    expect(fillFrom({ year: 2026, month: 11 }, '2026-11-13')).toBe('2026-11-13');
    expect(fillFrom({ year: 2026, month: 11 }, '2026-11-01')).toBe('2026-11-01');
    expect(fillFrom({ year: 2026, month: 11 }, '2026-11-30')).toBe('2026-11-30');
    expect(fillFrom({ year: 2026, month: 12 }, '2026-11-13')).toBe('2026-12-01');
    expect(fillFrom({ year: 2026, month: 10 }, '2026-11-13')).toBeNull();
  });

  it('lays a month out in weeks from Monday, padded either side', () => {
    const weeks = monthWeeks({ year: 2026, month: 11 });

    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks[1][0]).toBe('2026-11-02');
    expect(weeks.flat().filter((day) => day !== null)).toHaveLength(30);
    expect(weeks.at(-1)).toEqual(['2026-11-30', null, null, null, null, null, null]);
  });
});

describe('compact hours', () => {
  it.each([
    ['11:00', '22:00', '11-22'],
    ['11:30', '22:00', '11:30-22'],
    ['11:00', '22:45', '11-22:45'],
    ['09:00', '18:00', '9-18'],
    ['09:30', '18:15', '9:30-18:15'],
    ['00:00', '08:00', '0-8'],
    ['22:00', '06:00', '22-6'],
    ['18:00', '00:00', '18-24'],
    ['18:00', '00:30', '18-0:30'],
  ])('writes %s to %s as %s, the way the public page does', (start, end, text) => {
    expect(compactHours(start, end)).toBe(text);
  });

  it('stacks the same text on two lines', () => {
    expect(stackedHours('11:30', '22:00')).toEqual(['11:30', '22']);
    expect(stackedHours('18:00', '00:00')).toEqual(['18', '24']);
  });

  it('takes an end before the start, which runs into the next day', () => {
    expect(validHours('22:00', '06:00')).toBe(true);
    expect(runsOvernight('22:00', '06:00')).toBe(true);
    expect(runsOvernight('11:00', '22:00')).toBe(false);
  });

  it('refuses a shift that starts and ends at the same minute', () => {
    expect(validHours('11:00', '11:00')).toBe(false);
    expect(runsOvernight('11:00', '11:00')).toBe(false);
  });

  it.each([
    ['', '22:00'],
    ['11:00', ''],
    ['24:00', '22:00'],
    ['11:60', '22:00'],
    ['1:00', '22:00'],
  ])('refuses %j to %j', (start, end) => {
    expect(validHours(start, end)).toBe(false);
  });
});

describe('the brushes', () => {
  it('holds each pair of hours once', () => {
    const shifts = [shift(1, '2026-11-02'), shift(2, '2026-11-02'), shift(1, '2026-11-03', '12:00', '23:00')];

    expect(brushesOf(shifts)).toEqual([
      { start: '11:00', end: '22:00' },
      { start: '12:00', end: '23:00' },
    ]);
  });

  it('keeps to the clock, so a brush does not move as it is stamped', () => {
    const fewEarly = [shift(1, '2026-11-02', '09:00', '18:00')];
    const manyLate = Array.from({ length: 9 }, (_, index) => shift(2, `2026-11-1${index}`, '15:00', '23:00'));

    expect(brushesOf([...manyLate, ...fewEarly]).map((brush) => brush.start)).toEqual(['09:00', '15:00']);
  });

  it('tells two shifts starting together apart by their end', () => {
    const shifts = [shift(1, '2026-11-02', '11:00', '23:00'), shift(2, '2026-11-02', '11:00', '22:00')];

    expect(brushesOf(shifts).map((brush) => brush.end)).toEqual(['22:00', '23:00']);
  });

  it('adds a pair made by hand, without doubling one in use', () => {
    const made = [{ start: '10:00', end: '20:00' }, { start: '11:00', end: '22:00' }];

    expect(brushesOf([shift(1, '2026-11-02')], made)).toEqual(made);
  });

  it('has nothing to offer in an empty month', () => {
    expect(brushesOf([])).toEqual([]);
  });

  it('leaves a day with no time out of the brushes', () => {
    expect(brushesOf([shift(1, '2026-11-02'), bare(2, '2026-11-02')])).toEqual([{ start: '11:00', end: '22:00' }]);
    expect(cellText(bare(2, '2026-11-02'))).toBeNull();
    expect(cellText(shift(1, '2026-11-02'))).toBe('11-22');
  });
});

describe('the list by day', () => {
  const people = [person(1, 'Толик'), person(2, 'Гриша'), person(3, 'Паша')];
  const november = (today: string) => rosterDays({ year: 2026, month: 11 }, today);

  it('puts today first, then what is ahead, and lays the rest aside', () => {
    const { ahead, past } = dayList(november('2026-11-10'), people, []);

    expect(ahead[0].day.key).toBe('2026-11-10');
    expect(ahead[1].day.key).toBe('2026-11-11');
    expect(ahead[ahead.length - 1].day.key).toBe('2026-11-30');
    expect(past.map((entry) => entry.day.dayOfMonth)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('has nothing past on the first of the month, and only today ahead on the last', () => {
    expect(dayList(november('2026-11-01'), people, []).past).toEqual([]);

    const lastDay = dayList(november('2026-11-30'), people, []);

    expect(lastDay.ahead.map((entry) => entry.day.key)).toEqual(['2026-11-30']);
    expect(lastDay.past).toHaveLength(29);
  });

  it('runs any other month in date order', () => {
    const { ahead, past } = dayList(november('2026-12-05'), people, []);

    expect(past).toEqual([]);
    expect(ahead[0].day.key).toBe('2026-11-01');
    expect(ahead).toHaveLength(30);
  });

  it('keeps an empty day: that is where the next shift goes', () => {
    const { ahead } = dayList(november('2026-11-01'), people, [shift(1, '2026-11-02')]);

    expect(onOf(ahead[0])).toEqual([]);
    expect(ahead[0].off.map((one) => one.name)).toEqual(['Толик', 'Гриша', 'Паша']);
  });

  it('orders a day by who starts first, and leaves the rest to be tapped', () => {
    const shifts = [shift(1, '2026-11-02', '15:00', '23:00'), shift(3, '2026-11-02', '09:00', '18:00')];
    const { ahead } = dayList(november('2026-11-02'), people, shifts);

    expect(onOf(ahead[0]).map((entry) => entry.person.name)).toEqual(['Паша', 'Толик']);
    expect(ahead[0].off.map((one) => one.name)).toEqual(['Гриша']);
  });

  it('lists a night shift on the day it starts', () => {
    const shifts = [shift(1, '2026-11-02', '22:00', '06:00')];
    const { ahead } = dayList(november('2026-11-02'), people, shifts);

    expect(onOf(ahead[0])).toHaveLength(1);
    expect(onOf(ahead[1])).toEqual([]);
  });

  it('groups the people of a day by position, in the positions’ order', () => {
    const crew = [person(1, 'Толик', 2), person(2, 'Гриша'), person(3, 'Паша', 1), person(4, 'Женя', 2), person(5, 'Оля', 1)];
    const shifts = [1, 2, 3, 4].map((id) => shift(id, '2026-11-02'));
    const { ahead } = dayList(november('2026-11-02'), crew, shifts, [BARMAN, HOOKAH]);
    const [day] = ahead;

    expect(day.labelled).toBe(true);
    expect(day.groups.map((group) => [group.position?.name ?? null, group.on.map((entry) => entry.person.id)])).toEqual([
      ['Бармен', [3]],
      ['Кальянщик', [1, 4]],
      [null, [2]],
    ]);
    expect(day.off.map((one) => one.id)).toEqual([5]);
  });

  it('labels nothing on a roster with no positions', () => {
    const { ahead } = dayList(november('2026-11-02'), people, [shift(1, '2026-11-02')], []);

    expect(ahead[0].labelled).toBe(false);
    expect(ahead[0].groups.map((group) => group.position)).toEqual([null]);
  });

  it('puts days with no time after the timed ones, in people order', () => {
    const crew = [...people, person(4, 'Женя')];
    const shifts = [bare(1, '2026-11-02'), shift(2, '2026-11-02', '15:00'), bare(3, '2026-11-02'), shift(4, '2026-11-02', '09:00')];
    const { ahead } = dayList(november('2026-11-02'), crew, shifts);

    expect(onOf(ahead[0]).map((entry) => entry.person.id)).toEqual([4, 2, 1, 3]);
  });

  it('marks a day the venue is closed', () => {
    const days = rosterDays({ year: 2026, month: 11 }, '2026-11-01', BAR);
    const { ahead } = dayList(days, people, []);

    expect(ahead[0].day.closed).toBe(true);
    expect(ahead[1].day.closed).toBe(false);
  });
});

describe('an edit', () => {
  const set = (date: string, start = '11:00'): RosterEdit => ({ kind: 'set', shift: shift(1, date, start) });

  it('shares a key with a later word on the same thing', () => {
    expect(editKey(set('2026-11-02'))).toBe(editKey(set('2026-11-02', '12:00')));
    expect(editKey(set('2026-11-02'))).toBe(editKey({ kind: 'clear', person_id: 1, date: '2026-11-02' }));
    expect(editKey(set('2026-11-02'))).not.toBe(editKey(set('2026-11-03')));
    expect(editKey({ kind: 'title', title: 'a' })).toBe(editKey({ kind: 'title', title: 'b' }));
  });

  it('knows which queued edits die with a person, and does not take a neighbour with them', () => {
    const about = aboutPerson(5);

    expect(about('person:5')).toBe(true);
    expect(about('cell:5:2026-11-02')).toBe(true);
    expect(about('cell:55:2026-11-02')).toBe(false);
    expect(about('person:55')).toBe(false);
    expect(about('title')).toBe(false);
  });

  it('fills a cell, and replaces what it held', () => {
    const once = applyEdit(sheet(), set('2026-11-02'));
    const twice = applyEdit(once, set('2026-11-02', '12:00'));

    expect(once.shifts).toEqual([shift(1, '2026-11-02')]);
    expect(twice.shifts).toEqual([shift(1, '2026-11-02', '12:00')]);
  });

  it('clears only its own cell', () => {
    const full = sheet({ shifts: [shift(1, '2026-11-02'), shift(2, '2026-11-02'), shift(1, '2026-11-03')] });
    const cleared = applyEdit(full, { kind: 'clear', person_id: 1, date: '2026-11-02' });

    expect(cleared.shifts).toEqual([shift(2, '2026-11-02'), shift(1, '2026-11-03')]);
  });

  it('leaves a month alone when the edit belongs to another', () => {
    const november = sheet();

    expect(applyEdit(november, set('2026-12-02'))).toBe(november);
  });

  it('changes a title and a person', () => {
    const save = saveOf('Анатолий');
    const renamed = applyEdit(sheet(), { kind: 'title', title: 'Кухня' });
    const changed = applyEdit(sheet(), { kind: 'person', id: 2, save });

    expect(renamed.title).toBe('Кухня');
    expect(changed.people[1]).toEqual({ id: 2, position: null, ...save });
    expect(changed.people[0].name).toBe('Толик');
  });

  it('knows whose it is, and a title is nobody’s', () => {
    expect(personOf({ kind: 'set', shift: shift(4, '2026-11-02') })).toBe(4);
    expect(personOf({ kind: 'clear', person_id: 5, date: '2026-11-02' })).toBe(5);
    expect(personOf({ kind: 'person', id: 6, save: saveOf('Паша') })).toBe(6);
    expect(personOf({ kind: 'title', title: 'Кухня' })).toBeNull();
  });

  it('finds who a batch names that the roster has lost, each once', () => {
    const edits: RosterEdit[] = [
      { kind: 'set', shift: shift(1, '2026-11-02') },
      { kind: 'set', shift: shift(9, '2026-11-02') },
      { kind: 'clear', person_id: 9, date: '2026-11-03' },
      { kind: 'person', id: 8, save: saveOf('Паша') },
      { kind: 'title', title: 'Кухня' },
    ];

    expect(peopleGone(edits, [person(1, 'Толик')])).toEqual([9, 8]);
    expect(peopleGone(edits, [person(1, 'Толик'), person(8, 'Паша'), person(9, 'Гриша')])).toEqual([]);
  });

  it('keeps what has not landed on top of a read', () => {
    const read = sheet({ shifts: [shift(2, '2026-11-02')] });
    const shown = overlay(read, [set('2026-11-05'), { kind: 'clear', person_id: 2, date: '2026-11-02' }]);

    expect(shown.shifts).toEqual([shift(1, '2026-11-05')]);
  });

  it('shows a person’s new position by its name at once', () => {
    const month = sheet({ positions: [BARMAN, HOOKAH] });
    const moved = applyEdit(month, { kind: 'person', id: 1, save: saveOf('Толик', { position_id: 2 }) });

    expect(moved.people[0]).toMatchObject({ position_id: 2, position: 'Кальянщик' });
    expect(applyEdit(moved, { kind: 'person', id: 1, save: saveOf('Толик') }).people[0].position).toBeNull();
  });

  it('fills a cell with no time', () => {
    const filled = applyEdit(sheet({ shifts: [shift(1, '2026-11-02')] }), { kind: 'set', shift: bare(1, '2026-11-02') });

    expect(filled.shifts).toEqual([bare(1, '2026-11-02')]);
  });

  describe('when a person changes position', () => {
    // Today is Friday the 13th; with no position Толик takes the bar's 12–00 on a Monday.
    const month = sheet({
      venue_hours: BAR,
      positions: [BARMAN, HOOKAH],
      shifts: [
        shift(1, '2026-11-09', '12:00', '00:00'),
        shift(1, '2026-11-16', '12:00', '00:00'),
        shift(1, '2026-11-17', '14:00', '23:00'),
        bare(1, '2026-11-23'),
        shift(2, '2026-11-16', '12:00', '00:00'),
      ],
    });
    const edit: RosterEdit = { kind: 'person', id: 1, save: saveOf('Толик', { position_id: 1 }) };
    const moved = applyEdit(month, edit, '2026-11-13');

    it('moves the shifts at the old usual time when a person changes position', () => {
      expect(moved.shifts).toEqual([
        shift(1, '2026-11-09', '12:00', '00:00'),
        shift(1, '2026-11-16', '18:00', '02:00'),
        shift(1, '2026-11-17', '14:00', '23:00'),
        bare(1, '2026-11-23'),
        shift(2, '2026-11-16', '12:00', '00:00'),
      ]);
    });

    it('moving them again over a read that already has it changes nothing', () => {
      expect(applyEdit(moved, edit, '2026-11-13')).toEqual(moved);
    });
  });
});

describe('a stamp', () => {
  const brush = { start: '11:00', end: '22:00' };

  it('fills an empty cell', () => {
    expect(stamp(undefined, 1, '2026-11-02', brush)).toEqual({ kind: 'set', shift: shift(1, '2026-11-02') });
  });

  it('clears the same shift', () => {
    expect(stamp(shift(1, '2026-11-02'), 1, '2026-11-02', brush)).toEqual({
      kind: 'clear',
      person_id: 1,
      date: '2026-11-02',
    });
  });

  it('paints over other hours rather than clearing them', () => {
    expect(stamp(shift(1, '2026-11-02', '12:00', '23:00'), 1, '2026-11-02', brush)).toEqual({
      kind: 'set',
      shift: shift(1, '2026-11-02'),
    });
  });

  it('takes a shift ending elsewhere for different hours', () => {
    expect(stamp(shift(1, '2026-11-02', '11:00', '23:00'), 1, '2026-11-02', brush).kind).toBe('set');
  });
});

describe('the people on a roster', () => {
  const wearing = (...colours: string[]) => colours.map((colour, index) => ({ ...person(index, 'x'), colour }));

  it('gives the next person a colour nobody wears', () => {
    expect(nextColour([])).toBe(ROSTER_COLOURS[0]);
    expect(nextColour(wearing(ROSTER_COLOURS[0], ROSTER_COLOURS[2]))).toBe(ROSTER_COLOURS[1]);
  });

  it('goes round again once the palette is used up', () => {
    expect(ROSTER_COLOURS).toContain(nextColour(wearing(...ROSTER_COLOURS)));
  });

  it('holds only what the server accepts', () => {
    for (const colour of ROSTER_COLOURS) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('names those who went, and skips anybody the page never knew', () => {
    expect(namesOf([1, 7, 2], [person(1, 'Толик'), person(2, 'Гриша')])).toBe('Толик, Гриша');
    expect(namesOf([7], [person(1, 'Толик')])).toBe('');
  });

  it('trims a form into exactly what the server keeps', () => {
    const fields: PersonFields = {
      name: '  Толик ',
      colour: '#6366f1',
      positionId: 3,
      hours: draftOf(INHERIT),
      pattern: { kind: 'weekdays', weekdays: [5, 1, 3], on: 2, off: 2, from: '2026-11-03' },
    };

    expect(cleanPerson(fields)).toEqual({
      name: 'Толик',
      colour: '#6366f1',
      position_id: 3,
      hours: INHERIT,
      pattern: { kind: 'weekdays', weekdays: [1, 3, 5], on: null, off: null, from: null },
    });
  });
});

describe('a save the server answered', () => {
  it.each([
    [400, 'A shift cannot start and end at the same minute.'],
    [404, 'Person does not exist.'],
  ])('is let go on a %i: asking again gets the same answer', (status, message) => {
    expect(refusedForGood(new HttpError(status, message))).toBe(true);
  });

  it.each([401, 408, 429, 500, 503])('is kept on a %i, which may pass', (status) => {
    expect(refusedForGood(new HttpError(status, 'Later.'))).toBe(false);
  });

  it('is kept when it never landed', () => {
    expect(refusedForGood(new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('the requests', () => {
  const call = vi.mocked(api);

  beforeEach(() => {
    call.mockReset();
    call.mockResolvedValue(undefined);
  });

  it('asks the server itself for both reads, past the worker’s copy', async () => {
    await rosterApi.list();
    await rosterApi.month(7, '2026-11');

    expect(call.mock.calls).toEqual([
      ['/shifter/v1/rosters', { fresh: true }],
      ['/shifter/v1/rosters/7/month/2026-11?bare=1', { fresh: true }],
    ]);
  });

  it('sends a batch of cells as one request, whatever the mix', async () => {
    await sendEdits(7, [
      { kind: 'set', shift: shift(1, '2026-11-02') },
      { kind: 'clear', person_id: 2, date: '2026-11-03' },
      { kind: 'set', shift: shift(2, '2026-11-04') },
    ]);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith('/shifter/v1/rosters/7/cells', {
      method: 'PUT',
      body: {
        set: [shift(1, '2026-11-02'), shift(2, '2026-11-04')],
        clear: [{ person_id: 2, date: '2026-11-03' }],
      },
    });
  });

  it('sends a title and a person one at a time, and no empty save of cells', async () => {
    const order: string[] = [];
    let open = 0;

    call.mockImplementation(async (path) => {
      open += 1;
      expect(open).toBe(1);
      order.push(path);
      await Promise.resolve();
      open -= 1;

      return undefined as never;
    });

    await sendEdits(7, [
      { kind: 'title', title: 'Кухня' },
      { kind: 'person', id: 3, save: saveOf('Паша') },
    ]);

    expect(order).toEqual(['/shifter/v1/rosters/7', '/shifter/v1/rosters/7/people/3']);
  });

  it('sends the cells first, since on the way out of a page only the first request is sure to leave', async () => {
    await sendEdits(7, [
      { kind: 'title', title: 'Кухня' },
      { kind: 'person', id: 3, save: saveOf('Паша') },
      { kind: 'set', shift: shift(1, '2026-11-02') },
    ]);

    expect(call.mock.calls.map(([path]) => path)).toEqual([
      '/shifter/v1/rosters/7/cells',
      '/shifter/v1/rosters/7',
      '/shifter/v1/rosters/7/people/3',
    ]);
  });

  it('sends a cell set after its person’s edit behind that edit, and every other cell first', async () => {
    await sendEdits(7, [
      { kind: 'person', id: 3, save: saveOf('Паша') },
      { kind: 'set', shift: shift(3, '2026-11-23') },
      { kind: 'set', shift: shift(1, '2026-11-23') },
      { kind: 'title', title: 'Кухня' },
      { kind: 'clear', person_id: 3, date: '2026-11-24' },
    ]);

    expect(call.mock.calls.map(([path, options]) => [path, options?.body])).toEqual([
      ['/shifter/v1/rosters/7/cells', { set: [shift(1, '2026-11-23')], clear: [] }],
      ['/shifter/v1/rosters/7/people/3', saveOf('Паша')],
      ['/shifter/v1/rosters/7/cells', { set: [shift(3, '2026-11-23')], clear: [] }],
      ['/shifter/v1/rosters/7', { title: 'Кухня' }],
      ['/shifter/v1/rosters/7/cells', { set: [], clear: [{ person_id: 3, date: '2026-11-24' }] }],
    ]);
  });

  it('asks for a request that outlives the page only when told to', async () => {
    const edits: RosterEdit[] = [
      { kind: 'set', shift: shift(1, '2026-11-02') },
      { kind: 'title', title: 'Кухня' },
      { kind: 'person', id: 3, save: saveOf('Паша') },
    ];

    await sendEdits(7, edits, true);

    expect(call.mock.calls.map(([, options]) => options?.keepalive)).toEqual([true, true, true]);

    call.mockClear();
    await sendEdits(7, edits);

    expect(call.mock.calls.map(([, options]) => options?.keepalive)).toEqual([undefined, undefined, undefined]);
  });

  it('stops at the first refusal, so the queue can keep the whole batch', async () => {
    call.mockRejectedValueOnce(new Error('down'));

    await expect(
      sendEdits(7, [
        { kind: 'title', title: 'Кухня' },
        { kind: 'set', shift: shift(1, '2026-11-02') },
      ]),
    ).rejects.toThrow('down');

    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('the undo of a fill', () => {
  const was = cellsOf([shift(1, '2026-11-16')]);
  const start = { id: 1, month: '2026-11', was };
  const filled = sheet({ shifts: [shift(1, '2026-11-16'), shift(1, '2026-11-17'), shift(2, '2026-11-17')] });

  it('clears only the cells the fill found empty', () => {
    expect(fillUndo(start, filled, new Set())).toEqual([
      { kind: 'clear', person_id: 1, date: '2026-11-17' },
      { kind: 'clear', person_id: 2, date: '2026-11-17' },
    ]);
  });

  it('has nothing to offer once the screen has gone to another month or roster', () => {
    // October as read after the owner pressed ‹ while November filled: none of it was ever empty to the fill.
    const october = sheet({ month: '2026-10', shifts: [shift(1, '2026-10-05'), shift(2, '2026-10-06')] });

    expect(fillUndo(start, october, new Set())).toBeNull();
    expect(fillUndo(start, { ...filled, id: 2 }, new Set())).toBeNull();
  });

  it('leaves alone a cell the owner set while the fill was out', () => {
    const touched = new Set([editKey({ kind: 'set', shift: shift(2, '2026-11-17') })]);

    expect(fillUndo(start, filled, touched)).toEqual([{ kind: 'clear', person_id: 1, date: '2026-11-17' }]);
  });
});

describe('a press', () => {
  const day = '2026-11-02';
  const usual: Brush = { start: '12:00', end: '00:00' };

  it('puts the usual time in an empty cell', () => {
    expect(press(USUAL, undefined, 1, day, usual)).toEqual({ kind: 'set', shift: shift(1, day, '12:00', '00:00') });
  });

  it('clears a cell already at the usual time', () => {
    expect(press(USUAL, shift(1, day, '12:00', '00:00'), 1, day, usual)).toEqual({ kind: 'clear', person_id: 1, date: day });
  });

  it('a click with the usual tool on other hours opens the cell', () => {
    expect(press(USUAL, shift(1, day, '14:00', '23:00'), 1, day, usual)).toBe('open');
    expect(press(USUAL, bare(1, day), 1, day, usual)).toBe('open');
  });

  it('puts no time in an empty cell', () => {
    expect(press(BARE, undefined, 1, day, usual)).toEqual({ kind: 'set', shift: bare(1, day) });
  });

  it('clears a cell that already has no time', () => {
    expect(press(BARE, bare(1, day), 1, day, usual)).toEqual({ kind: 'clear', person_id: 1, date: day });
  });

  it('a click with no time on a cell with hours opens it', () => {
    expect(press(BARE, shift(1, day, '12:00', '00:00'), 1, day, usual)).toBe('open');
  });

  it('puts no time with the usual tool when nothing gives a time', () => {
    expect(press(USUAL, undefined, 1, day, null)).toEqual({ kind: 'set', shift: bare(1, day) });
    expect(press(USUAL, bare(1, day), 1, day, null)).toEqual({ kind: 'clear', person_id: 1, date: day });
    expect(press(USUAL, shift(1, day), 1, day, null)).toBe('open');
  });

  it('an hour brush still replaces other hours', () => {
    const hours = { kind: 'hours' as const, brush: { start: '11:00', end: '22:00' } };

    expect(press(hours, shift(1, day, '12:00', '23:00'), 1, day, usual)).toEqual({ kind: 'set', shift: shift(1, day) });
    expect(press(hours, bare(1, day), 1, day, usual)).toEqual({ kind: 'set', shift: shift(1, day) });
    expect(press(hours, shift(1, day), 1, day, usual)).toEqual({ kind: 'clear', person_id: 1, date: day });
  });

  it('knows a person’s usual time from their position and the venue', () => {
    const month = sheet({ venue_hours: BAR, positions: [BARMAN, HOOKAH] });

    expect(usualFor(person(1, 'Толик'), month, '2026-11-02')).toEqual({ start: '12:00', end: '00:00' });
    expect(usualFor(person(1, 'Толик'), month, '2026-11-01')).toBeNull();
    expect(usualFor(person(1, 'Толик', 1), month, '2026-11-01')).toEqual({ start: '18:00', end: '02:00' });
    expect(usualFor(person(1, 'Толик', 2), month, '2026-11-02')).toBeNull();
  });
});

describe('a swap and an undo', () => {
  const day = '2026-11-02';
  const tolik: Brush = { start: '12:00', end: '00:00' };
  const grisha: Brush = { start: '18:00', end: '02:00' };

  it('a swap keeps hand-set hours and otherwise takes the new person’s usual time', () => {
    const clear: RosterEdit = { kind: 'clear', person_id: 1, date: day };

    expect(swap(shift(1, day, '12:00', '00:00'), 1, 2, day, tolik, grisha)).toEqual([
      clear,
      { kind: 'set', shift: shift(2, day, '18:00', '02:00') },
    ]);
    expect(swap(shift(1, day, '14:00', '23:00'), 1, 2, day, tolik, grisha)).toEqual([
      clear,
      { kind: 'set', shift: shift(2, day, '14:00', '23:00') },
    ]);
    expect(swap(bare(1, day), 1, 2, day, tolik, grisha)).toEqual([clear, { kind: 'set', shift: bare(2, day) }]);
    expect(swap(bare(1, day), 1, 2, day, null, grisha)).toEqual([
      clear,
      { kind: 'set', shift: shift(2, day, '18:00', '02:00') },
    ]);
  });

  it('undo puts back what the cell held', () => {
    const cells = cellsOf([shift(1, day), bare(2, day)]);
    const edits: RosterEdit[] = [
      { kind: 'clear', person_id: 1, date: day },
      { kind: 'set', shift: shift(2, day) },
      { kind: 'set', shift: shift(3, day) },
      { kind: 'set', shift: shift(3, day, '09:00', '18:00') },
      { kind: 'title', title: 'Кухня' },
    ];

    expect(undoOf(edits, cells)).toEqual([
      { kind: 'set', shift: shift(1, day) },
      { kind: 'set', shift: bare(2, day) },
      { kind: 'clear', person_id: 3, date: day },
    ]);
  });
});

describe('people', () => {
  const fields = (over: Partial<PersonFields> = {}): PersonFields => ({
    name: 'Толик',
    colour: '#6366f1',
    positionId: null,
    hours: draftOf(INHERIT),
    pattern: NO_PATTERN,
    ...over,
  });

  const own = (start: string, end: string, rows: PersonFields['hours']['rows'] = []): PersonFields['hours'] => ({
    mode: 'own',
    start,
    end,
    rows,
  });

  it('holds a person back while their own hours are half typed', () => {
    expect(cleanPerson(fields({ hours: own('18:00', '') }))).toBeNull();
    expect(cleanPerson(fields({ hours: own('18:00', '18:00') }))).toBeNull();
    expect(cleanPerson(fields({ hours: own('18:00', '02:00', [{ weekdays: [], start: '18:00', end: '04:00' }]) }))).toBeNull();
    expect(cleanPerson(fields({ hours: own('18:00', '02:00', [{ weekdays: [5], start: '18:00', end: '' }]) }))).toBeNull();
    expect(cleanPerson(fields({ name: '   ' }))).toBeNull();

    expect(cleanPerson(fields({ hours: own('18:00', '02:00', [{ weekdays: [6, 5], start: '18:00', end: '04:00' }]) }))?.hours).toEqual({
      mode: 'own',
      start_time: '18:00',
      end_time: '02:00',
      week_hours: [
        { weekday: 5, start_time: '18:00', end_time: '04:00' },
        { weekday: 6, start_time: '18:00', end_time: '04:00' },
      ],
    });
  });

  it('lets own hours go once the person takes their position’s again', () => {
    expect(cleanPerson(fields({ hours: { mode: 'inherit', start: '18:00', end: '', rows: [] } }))?.hours).toEqual(INHERIT);
  });

  it('holds a person back while a cycle has no first day', () => {
    const cycle = (on: number | null, off: number | null, from: string | null) =>
      cleanPerson(fields({ pattern: { kind: 'cycle', weekdays: [], on, off, from } }));

    expect(cycle(2, 2, null)).toBeNull();
    expect(cycle(0, 2, '2026-11-13')).toBeNull();
    expect(cycle(2, 29, '2026-11-13')).toBeNull();
    expect(cycle(null, 2, '2026-11-13')).toBeNull();
    expect(cleanPerson(fields({ pattern: { ...NO_PATTERN, kind: 'weekdays' } }))).toBeNull();

    expect(cycle(2, 2, '2026-11-13')?.pattern).toEqual({ kind: 'cycle', weekdays: [], on: 2, off: 2, from: '2026-11-13' });
  });

  it('moves the next person’s first day on by the days worked', () => {
    const pattern = { kind: 'cycle' as const, weekdays: [], on: 2, off: 2, from: '2026-11-13' };

    expect(nextFrom(pattern)).toEqual({ ...pattern, from: '2026-11-15' });
    expect(nextFrom({ ...pattern, on: 5, from: '2026-11-30' }).from).toBe('2026-12-05');
    expect(nextFrom({ ...NO_PATTERN, kind: 'weekdays', weekdays: [1] })).toEqual({ ...NO_PATTERN, kind: 'weekdays', weekdays: [1] });
  });

  it('says a pattern in a few words', () => {
    const t = (key: string) => key;

    expect(patternLabel(NO_PATTERN, t, 'ru')).toBe('By hand');
    expect(patternLabel({ ...NO_PATTERN, kind: 'weekdays', weekdays: [5, 1, 3] }, t, 'ru')).toBe('Mon Wed Fri');
    expect(patternLabel({ kind: 'cycle', weekdays: [], on: 2, off: 2, from: '2026-11-13' }, t, 'ru')).toBe('2/2 · from 13 нояб.');
  });
});

describe('the api', () => {
  const call = vi.mocked(api);

  beforeEach(() => {
    call.mockReset();
    call.mockResolvedValue(undefined);
  });

  it('reads the month with bare days', async () => {
    await rosterApi.month(7, '2026-11');

    expect(call).toHaveBeenCalledWith('/shifter/v1/rosters/7/month/2026-11?bare=1', { fresh: true });
  });

  it('sends a cell with no time as two nulls', async () => {
    await sendEdits(7, [{ kind: 'set', shift: bare(1, '2026-11-02') }]);

    const body = call.mock.calls[0][1]?.body as { set: RosterShift[] };

    expect(JSON.stringify(body.set)).toBe('[{"person_id":1,"date":"2026-11-02","start_time":null,"end_time":null}]');
  });

  it('fills and clears a month in one request each', async () => {
    await rosterApi.fill(7, '2026-11');
    await rosterApi.clear(7, '2026-11');

    expect(call.mock.calls).toEqual([
      ['/shifter/v1/rosters/7/fill', { method: 'POST', body: { month: '2026-11' } }],
      ['/shifter/v1/rosters/7/clear', { method: 'POST', body: { month: '2026-11' } }],
    ]);
  });

  it('saves opening hours, and positions by id', async () => {
    const save = { name: 'Бармен', hours: BARMAN.hours };

    await rosterApi.saveVenueHours(7, BAR);
    await rosterApi.addPosition(7, save);
    await rosterApi.updatePosition(7, 3, save);
    await rosterApi.removePosition(7, 3);

    expect(call.mock.calls).toEqual([
      ['/shifter/v1/rosters/7/venue-hours', { method: 'PUT', body: { venue_hours: BAR } }],
      ['/shifter/v1/rosters/7/positions', { method: 'POST', body: save }],
      ['/shifter/v1/rosters/7/positions/3', { method: 'PUT', body: save }],
      ['/shifter/v1/rosters/7/positions/3', { method: 'DELETE' }],
    ]);
  });

  it('sends every field of a person and never a position key', async () => {
    const full: RosterPerson = {
      ...person(3, 'Паша', 2),
      position: 'Кальянщик',
      pattern: { kind: 'cycle', weekdays: [], on: 2, off: 2, from: '2026-11-03' },
    };

    await sendEdits(7, [{ kind: 'person', id: 3, save: personSave(full) }]);

    const [path, options] = call.mock.calls[0];
    const body = options?.body as Record<string, unknown>;

    expect(path).toBe('/shifter/v1/rosters/7/people/3');
    expect(body).toEqual({
      name: 'Паша',
      colour: '#6366f1',
      position_id: 2,
      hours: INHERIT,
      pattern: { kind: 'cycle', weekdays: [], on: 2, off: 2, from: '2026-11-03' },
    });
    expect('position' in body).toBe(false);
  });
});

describe('the notices', () => {
  const t = (key: string) => key;
  const filled = (added: number, kept: number, skipped: number, from = '2026-11-01') => ({ added, kept, skipped, from });
  const say = (result: ReturnType<typeof filled>, leftOut: string[] = []) => fillNotice(result, '2026-11-01', leftOut, t, 'ru');

  it('says nobody has working days, this month or what is left of it', () => {
    expect(say(filled(0, 0, 0))).toBe('Nobody has working days this month.');
    expect(say(filled(0, 0, 0, '2026-11-13'))).toBe('Nobody has working days left this month.');
  });

  it('says the venue was closed when that is all there was', () => {
    expect(say(filled(0, 0, 4))).toBe('Nobody was put on: the venue is closed on those days.');
  });

  it('says the filled days stayed when nothing was new', () => {
    expect(say(filled(0, 5, 0))).toBe('No new shifts, the filled days stayed as they were.');
    expect(say(filled(0, 5, 2))).toBe('No new shifts, the filled days stayed as they were. Not placed, the venue is closed: 2 дня.');
  });

  it('counts what it added, from the day it started', () => {
    expect(say(filled(8, 0, 0))).toBe('Added: 8 смен.');
    expect(say(filled(6, 1, 3, '2026-11-13'))).toBe(
      'Added from 13 ноября: 6 смен. Already there: 1 смена. Not placed, the venue is closed: 3 дня.',
    );
  });

  it('names the people it left to be put on by hand', () => {
    expect(say(filled(8, 0, 0), ['Женя', 'Оля'])).toBe('Added: 8 смен. No working days: Женя, Оля — put them on by hand.');
  });
});
