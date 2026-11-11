import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError, api } from '@/lib/api/http';
import { RosterMonth, RosterPerson, RosterShift, refusedForGood, rosterApi, sendEdits } from '@/lib/api/roster';
import { brushesOf } from '@/lib/roster/brushes';
import { dayList } from '@/lib/roster/day-list';
import { RosterEdit, aboutPerson, applyEdit, editKey, overlay, peopleGone, personOf, stamp } from '@/lib/roster/edits';
import { compactHours, runsOvernight, stackedHours, validHours } from '@/lib/roster/hours';
import { cellKey, cellsOf, monthKey, monthOfKey, rosterDays } from '@/lib/roster/month';
import { ROSTER_COLOURS, cleanPerson, namesOf, nextColour } from '@/lib/roster/people';

vi.mock('@/lib/api/http', async (original) => ({
  ...(await original<typeof import('@/lib/api/http')>()),
  api: vi.fn(),
}));

const person = (id: number, name: string, position: string | null = null): RosterPerson => ({
  id,
  name,
  position,
  colour: '#6366f1',
});

const shift = (personId: number, date: string, start = '11:00', end = '22:00'): RosterShift => ({
  person_id: personId,
  date,
  start_time: start,
  end_time: end,
});

const sheet = (over: Partial<RosterMonth> = {}): RosterMonth => ({
  id: 1,
  title: 'Бар',
  share_slug: null,
  month: '2026-11',
  people: [person(1, 'Толик'), person(2, 'Гриша')],
  shifts: [],
  ...over,
});

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
});

describe('the list by day', () => {
  const people = [person(1, 'Толик', 'Кальяны'), person(2, 'Гриша'), person(3, 'Паша')];
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

    expect(ahead[0].on).toEqual([]);
    expect(ahead[0].off.map((one) => one.name)).toEqual(['Толик', 'Гриша', 'Паша']);
  });

  it('orders a day by who starts first, and leaves the rest to be tapped', () => {
    const shifts = [shift(1, '2026-11-02', '15:00', '23:00'), shift(3, '2026-11-02', '09:00', '18:00')];
    const { ahead } = dayList(november('2026-11-02'), people, shifts);

    expect(ahead[0].on.map((entry) => entry.person.name)).toEqual(['Паша', 'Толик']);
    expect(ahead[0].off.map((one) => one.name)).toEqual(['Гриша']);
  });

  it('lists a night shift on the day it starts', () => {
    const shifts = [shift(1, '2026-11-02', '22:00', '06:00')];
    const { ahead } = dayList(november('2026-11-02'), people, shifts);

    expect(ahead[0].on).toHaveLength(1);
    expect(ahead[1].on).toEqual([]);
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
    const save = { name: 'Анатолий', position: 'Бар', colour: '#059669' };
    const renamed = applyEdit(sheet(), { kind: 'title', title: 'Кухня' });
    const changed = applyEdit(sheet(), { kind: 'person', id: 2, save });

    expect(renamed.title).toBe('Кухня');
    expect(changed.people[1]).toEqual({ id: 2, ...save });
    expect(changed.people[0].name).toBe('Толик');
  });

  it('knows whose it is, and a title is nobody’s', () => {
    expect(personOf({ kind: 'set', shift: shift(4, '2026-11-02') })).toBe(4);
    expect(personOf({ kind: 'clear', person_id: 5, date: '2026-11-02' })).toBe(5);
    expect(personOf({ kind: 'person', id: 6, save: { name: 'Паша', position: null, colour: '#059669' } })).toBe(6);
    expect(personOf({ kind: 'title', title: 'Кухня' })).toBeNull();
  });

  it('finds who a batch names that the roster has lost, each once', () => {
    const edits: RosterEdit[] = [
      { kind: 'set', shift: shift(1, '2026-11-02') },
      { kind: 'set', shift: shift(9, '2026-11-02') },
      { kind: 'clear', person_id: 9, date: '2026-11-03' },
      { kind: 'person', id: 8, save: { name: 'Паша', position: null, colour: '#059669' } },
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

  it('trims a form, and takes an empty position for none', () => {
    expect(cleanPerson('  Толик ', '  ', '#6366f1')).toEqual({ name: 'Толик', position: null, colour: '#6366f1' });
    expect(cleanPerson('Гриша', ' Бар ', '#6366f1').position).toBe('Бар');
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
      ['/shifter/v1/rosters/7/month/2026-11', { fresh: true }],
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
      { kind: 'person', id: 3, save: { name: 'Паша', position: null, colour: '#059669' } },
    ]);

    expect(order).toEqual(['/shifter/v1/rosters/7', '/shifter/v1/rosters/7/people/3']);
  });

  it('sends the cells first, since on the way out of a page only the first request is sure to leave', async () => {
    await sendEdits(7, [
      { kind: 'title', title: 'Кухня' },
      { kind: 'person', id: 3, save: { name: 'Паша', position: null, colour: '#059669' } },
      { kind: 'set', shift: shift(1, '2026-11-02') },
    ]);

    expect(call.mock.calls.map(([path]) => path)).toEqual([
      '/shifter/v1/rosters/7/cells',
      '/shifter/v1/rosters/7',
      '/shifter/v1/rosters/7/people/3',
    ]);
  });

  it('asks for a request that outlives the page only when told to', async () => {
    const edits: RosterEdit[] = [
      { kind: 'set', shift: shift(1, '2026-11-02') },
      { kind: 'title', title: 'Кухня' },
      { kind: 'person', id: 3, save: { name: 'Паша', position: null, colour: '#059669' } },
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
