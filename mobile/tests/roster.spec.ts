import { describe, expect, it } from 'vitest';

import { UK } from '@/lib/i18n/uk';
import {
  CellEdit,
  compactHours,
  crossesMidnight,
  dayList,
  goneFromServer,
  hourPairs,
  hoursProblem,
  monthKey,
  nextColour,
  pressLink,
  readClock,
  repeatLine,
  ROSTER_COLOURS,
  rosterLink,
  RosterMonth,
  RosterPerson,
  rosterProblem,
  RosterShift,
  stepMonth,
  toBatch,
  withEdits,
} from '@/lib/roster';

const tolik: RosterPerson = { id: 1, name: 'Толик', position: 'Кальяны', colour: '#1f3a5f' };
const grisha: RosterPerson = { id: 2, name: 'Гриша', position: 'Бар', colour: '#22c55e' };
const pasha: RosterPerson = { id: 3, name: 'Паша', position: null, colour: '#f5c518' };

const shift = (person: number, date: string, start = '11:00', end = '22:00'): RosterShift => ({
  person_id: person,
  date,
  start_time: start,
  end_time: end,
});

const november = { year: 2026, month: 11 };

describe('compact hours', () => {
  it('writes whole hours bare', () => {
    expect(compactHours('11:00', '22:00')).toBe('11-22');
  });

  it('keeps minutes where there are any', () => {
    expect(compactHours('11:30', '22:00')).toBe('11:30-22');
    expect(compactHours('11:00', '22:45')).toBe('11-22:45');
  });

  it('drops the leading nought', () => {
    expect(compactHours('09:00', '17:00')).toBe('9-17');
    expect(compactHours('09:05', '17:30')).toBe('9:05-17:30');
  });

  it('closes a shift at midnight as 24, the way the link writes it', () => {
    expect(compactHours('18:00', '00:00')).toBe('18-24');
  });

  it('writes a shift past midnight as the clock reads', () => {
    expect(compactHours('22:00', '06:00')).toBe('22-6');
    expect(compactHours('18:00', '00:30')).toBe('18-0:30');
  });

  it('starts a shift at midnight from nought', () => {
    expect(compactHours('00:00', '08:00')).toBe('0-8');
  });
});

describe('a typed time', () => {
  it.each([
    ['11:30', '11:30'],
    ['9:30', '09:30'],
    ['11', '11:00'],
    ['9', '09:00'],
    ['1130', '11:30'],
    ['930', '09:30'],
    ['11.30', '11:30'],
    ['11,30', '11:30'],
    [' 22:00 ', '22:00'],
    ['0', '00:00'],
    ['00:00', '00:00'],
  ])('reads %s as %s', (typed, read) => {
    expect(readClock(typed)).toBe(read);
  });

  it('takes the 24 the list itself writes for midnight', () => {
    expect(readClock('24')).toBe('00:00');
    expect(readClock('24:00')).toBe('00:00');
  });

  it.each(['', 'утро', '25', '24:30', '12:60', '12:5', '12345', '11:30:00'])(
    'refuses %j',
    (typed) => {
      expect(readClock(typed)).toBeNull();
    },
  );
});

describe('what is wrong with two times', () => {
  it('has nothing to say about a day shift or a night one', () => {
    expect(hoursProblem('11', '22')).toBeNull();
    expect(hoursProblem('22', '6')).toBeNull();
  });

  it('asks for a time it can read', () => {
    expect(hoursProblem('утро', '22')).toBe('Время пишется как 18:00.');
    expect(hoursProblem('11', '')).toBe('Время пишется как 18:00.');
  });

  it('refuses a shift that starts and ends at the same minute, however it was typed', () => {
    expect(hoursProblem('11:00', '1100')).toBe('Начало и конец должны отличаться.');
    expect(hoursProblem('24', '00:00')).toBe('Начало и конец должны отличаться.');
  });
});

describe('a shift into the next day', () => {
  it('is an end at or before the start', () => {
    expect(crossesMidnight('22:00', '06:00')).toBe(true);
    expect(crossesMidnight('18:00', '00:00')).toBe(true);
    expect(crossesMidnight('11:00', '22:00')).toBe(false);
  });
});

describe('switching months', () => {
  it('names a month the way the wire does', () => {
    expect(monthKey(november)).toBe('2026-11');
    expect(monthKey({ year: 2026, month: 3 })).toBe('2026-03');
  });

  it('steps either way', () => {
    expect(stepMonth(november, 1)).toEqual({ year: 2026, month: 12 });
    expect(stepMonth(november, -1)).toEqual({ year: 2026, month: 10 });
  });

  it('crosses a new year both ways', () => {
    expect(stepMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(stepMonth({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
  });

  it('stops where the server stops', () => {
    expect(stepMonth({ year: 2000, month: 1 }, -1)).toBeNull();
    expect(stepMonth({ year: 2100, month: 12 }, 1)).toBeNull();
    expect(stepMonth({ year: 2000, month: 2 }, -1)).toEqual({ year: 2000, month: 1 });
    expect(stepMonth({ year: 2100, month: 11 }, 1)).toEqual({ year: 2100, month: 12 });
  });
});

describe('the month by day', () => {
  const dates = (days: { date: string }[]) => days.map((day) => day.date);

  it('puts today on top, then the rest of the month, with the past behind', () => {
    const { coming, past } = dayList(november, [tolik], [], '2026-11-17');

    expect(coming[0].date).toBe('2026-11-17');
    expect(coming[1].date).toBe('2026-11-18');
    expect(coming.at(-1)?.date).toBe('2026-11-30');
    expect(coming).toHaveLength(14);
    expect(dates(past)[0]).toBe('2026-11-01');
    expect(dates(past).at(-1)).toBe('2026-11-16');
    expect(past).toHaveLength(16);
  });

  it('has nothing behind on the first of the month', () => {
    const { coming, past } = dayList(november, [tolik], [], '2026-11-01');

    expect(coming).toHaveLength(30);
    expect(past).toEqual([]);
  });

  it('has only today ahead on the last of the month', () => {
    const { coming, past } = dayList(november, [tolik], [], '2026-11-30');

    expect(dates(coming)).toEqual(['2026-11-30']);
    expect(past).toHaveLength(29);
  });

  it('runs any other month in date order, past or still to come', () => {
    const earlier = dayList({ year: 2026, month: 10 }, [tolik], [], '2026-11-17');
    const later = dayList({ year: 2026, month: 12 }, [tolik], [], '2026-11-17');

    for (const list of [earlier, later]) {
      expect(list.past).toEqual([]);
      expect(dates(list.coming)).toEqual([...dates(list.coming)].sort());
      expect(list.coming).toHaveLength(31);
    }
  });

  it('counts the days a month really has', () => {
    expect(dayList({ year: 2028, month: 2 }, [], [], '2026-11-17').coming).toHaveLength(29);
    expect(dayList({ year: 2026, month: 2 }, [], [], '2026-11-17').coming).toHaveLength(28);
  });

  it('keeps a day nobody works, because that is where it gets filled', () => {
    const { coming } = dayList(november, [tolik, grisha], [], '2026-11-02');

    expect(coming[0].working).toEqual([]);
    expect(coming[0].free.map((person) => person.name)).toEqual(['Толик', 'Гриша']);
  });

  it('sorts a day into who works and who does not', () => {
    const shifts = [shift(3, '2026-11-02'), shift(1, '2026-11-02', '12:00', '20:00')];
    const [day] = dayList(november, [tolik, grisha, pasha], shifts, '2026-11-02').coming;

    expect(day.working.map((row) => row.person.name).sort()).toEqual(['Паша', 'Толик']);
    expect(day.free.map((person) => person.name)).toEqual(['Гриша']);
  });

  it('orders a day by who starts first, as the web and the link do', () => {
    const shifts = [
      shift(1, '2026-11-02', '18:00', '02:00'),
      shift(2, '2026-11-02', '11:00', '22:00'),
      shift(3, '2026-11-02', '14:00', '22:00'),
    ];
    const [day] = dayList(november, [tolik, grisha, pasha], shifts, '2026-11-02').coming;

    expect(day.working.map((row) => row.person.name)).toEqual(['Гриша', 'Паша', 'Толик']);
  });

  it('leaves people starting together in the roster’s order', () => {
    const shifts = [shift(3, '2026-11-02'), shift(1, '2026-11-02'), shift(2, '2026-11-02')];
    const [day] = dayList(november, [tolik, grisha, pasha], shifts, '2026-11-02').coming;

    expect(day.working.map((row) => row.person.name)).toEqual(['Толик', 'Гриша', 'Паша']);
  });

  it('keeps a shift past midnight on its start date', () => {
    const shifts = [shift(1, '2026-11-02', '22:00', '06:00')];
    const { coming } = dayList(november, [tolik], shifts, '2026-11-02');

    expect(coming[0].working).toHaveLength(1);
    expect(coming[1].working).toHaveLength(0);
  });

  it('draws nothing for somebody no longer on the roster', () => {
    const [day] = dayList(november, [tolik], [shift(9, '2026-11-02')], '2026-11-02').coming;

    expect(day.working).toEqual([]);
  });

  it('holds together across a clock change, whichever way the phone’s zone runs', () => {
    // The last Sunday of October is 25 hours long here, and a list stepped in
    // milliseconds would lose a day to it or show one twice.
    const { coming } = dayList({ year: 2026, month: 10 }, [], [], '2026-11-17');

    expect(coming.map((day) => Number(day.date.slice(8)))).toEqual(
      Array.from({ length: 31 }, (_, index) => index + 1),
    );
  });
});

describe('the hours already used', () => {
  it('comes back commonest first', () => {
    const shifts = [
      shift(1, '2026-11-01', '12:00', '20:00'),
      shift(1, '2026-11-02', '11:00', '22:00'),
      shift(2, '2026-11-02', '11:00', '22:00'),
    ];

    expect(hourPairs(shifts)).toEqual([
      { start_time: '11:00', end_time: '22:00' },
      { start_time: '12:00', end_time: '20:00' },
    ]);
  });

  it('is empty for an empty month', () => {
    expect(hourPairs([])).toEqual([]);
  });
});

describe('edits laid over a month', () => {
  const month = (shifts: RosterShift[]): RosterMonth => ({
    id: 7,
    title: 'Кальянная',
    share_slug: null,
    month: '2026-11',
    people: [tolik, grisha],
    shifts,
  });

  const put = (person: number, date: string): CellEdit => ({
    person_id: person,
    date,
    hours: { start_time: '12:00', end_time: '20:00' },
  });

  it('fills an empty cell', () => {
    const shown = withEdits(month([]), [put(1, '2026-11-02')]);

    expect(shown.shifts).toEqual([shift(1, '2026-11-02', '12:00', '20:00')]);
  });

  it('replaces what a cell held rather than adding a second shift', () => {
    const shown = withEdits(month([shift(1, '2026-11-02')]), [put(1, '2026-11-02')]);

    expect(shown.shifts).toEqual([shift(1, '2026-11-02', '12:00', '20:00')]);
  });

  it('empties a cell', () => {
    const shown = withEdits(month([shift(1, '2026-11-02'), shift(2, '2026-11-02')]), [
      { person_id: 1, date: '2026-11-02', hours: null },
    ]);

    expect(shown.shifts).toEqual([shift(2, '2026-11-02')]);
  });

  it('leaves another month’s edits out of this one', () => {
    const held = month([shift(1, '2026-11-02')]);

    expect(withEdits(held, [put(1, '2026-12-02')])).toBe(held);
  });
});

describe('a save as the wire takes it', () => {
  it('splits into what is set and what is cleared', () => {
    expect(
      toBatch([
        { person_id: 1, date: '2026-11-02', hours: { start_time: '11:00', end_time: '22:00' } },
        { person_id: 2, date: '2026-11-03', hours: null },
      ]),
    ).toEqual({
      set: [{ person_id: 1, date: '2026-11-02', start_time: '11:00', end_time: '22:00' }],
      clear: [{ person_id: 2, date: '2026-11-03' }],
    });
  });

  it('sends two empty lists for nothing', () => {
    expect(toBatch([])).toEqual({ set: [], clear: [] });
  });
});

describe('the line after a repeat', () => {
  it('says how many went in', () => {
    expect(repeatLine({ added: 21, kept: 0 })).toBe('Добавлено: 21 смена.');
    expect(repeatLine({ added: 3, kept: 0 })).toBe('Добавлено: 3 смены.');
    expect(repeatLine({ added: 12, kept: 0 })).toBe('Добавлено: 12 смен.');
  });

  it('says what was left alone', () => {
    expect(repeatLine({ added: 5, kept: 2 })).toBe('Добавлено: 5 смен, уже стояло: 2.');
  });

  it('says when last month had nothing to give', () => {
    expect(repeatLine({ added: 0, kept: 0 })).toBe('В прошлом месяце смен нет, повторять нечего.');
  });

  it('says when every cell it could fill was already filled', () => {
    expect(repeatLine({ added: 0, kept: 9 })).toBe(
      'Новых смен нет, заполненные дни остались как были.',
    );
  });
});

describe('a new face’s colour', () => {
  it('starts at the top of the palette', () => {
    expect(nextColour([])).toBe(ROSTER_COLOURS[0]);
  });

  it('skips what is taken, wherever it was taken from', () => {
    const taken = [{ ...tolik, colour: ROSTER_COLOURS[0] }, { ...grisha, colour: ROSTER_COLOURS[2] }];

    expect(nextColour(taken)).toBe(ROSTER_COLOURS[1]);
  });

  it('comes round again once the palette runs out', () => {
    const everyone = ROSTER_COLOURS.map((colour, id) => ({ ...tolik, id, colour }));

    expect(ROSTER_COLOURS).toContain(nextColour(everyone));
  });

  it('only offers what the server takes', () => {
    for (const colour of ROSTER_COLOURS) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('the link', () => {
  it('is the public page on the app’s own host', () => {
    expect(rosterLink('https://www.shifter.ink', 'abcdefghjkmn')).toBe(
      'https://www.shifter.ink/r/abcdefghjkmn',
    );
  });
});

describe('ending the link', () => {
  it('takes two presses on the same button', () => {
    expect(pressLink(null, 'off')).toEqual({ armed: 'off', go: false });
    expect(pressLink('off', 'off')).toEqual({ armed: null, go: true });
    expect(pressLink(null, 'renew')).toEqual({ armed: 'renew', go: false });
    expect(pressLink('renew', 'renew')).toEqual({ armed: null, go: true });
  });

  it('does not take a press on one button as the second press of the other', () => {
    expect(pressLink('renew', 'off')).toEqual({ armed: 'off', go: false });
    expect(pressLink('off', 'renew')).toEqual({ armed: 'renew', go: false });
  });
});

describe('what went wrong', () => {
  it('says all of it in Ukrainian too', () => {
    // These reach t() through a variable, which the dictionary's own test
    // cannot follow, so a phrase missing here would fall back to Russian.
    const phrases = [
      hoursProblem('утро', '22'),
      hoursProblem('11', '11'),
      rosterProblem(new Error('нет сети'), 'Не получилось.'),
      rosterProblem({ status: 404 }, 'Не получилось.'),
      rosterProblem({ status: 429 }, 'Не получилось.'),
      rosterProblem({ status: 400 }, 'Не получилось.'),
      rosterProblem({ status: 400 }, 'Не сохранилось.'),
    ];

    expect(phrases.filter((phrase) => UK[phrase as string] === undefined)).toEqual([]);
  });

  it('knows a person or a roster that has gone', () => {
    expect(goneFromServer({ status: 404 })).toBe(true);
    expect(goneFromServer({ status: 400 })).toBe(false);
    expect(goneFromServer(new Error('нет сети'))).toBe(false);
    expect(goneFromServer(null)).toBe(false);
  });

  it('never hands a reader the server’s English', () => {
    const refused = { status: 400, message: 'A roster holds at most 60 people.' };

    expect(rosterProblem(refused, 'Не получилось.')).toBe('Не получилось.');
  });

  it('tells a dead network from a roster changed elsewhere', () => {
    expect(rosterProblem(new Error('нет сети'), 'Не получилось.')).toBe('Не дотянулись до сервера.');
    expect(rosterProblem({ status: 503 }, 'Не получилось.')).toBe('Не дотянулись до сервера.');
    expect(rosterProblem({ status: 404 }, 'Не получилось.')).toBe(
      'Этого уже нет: график изменили на другом устройстве.',
    );
    expect(rosterProblem({ status: 429 }, 'Не получилось.')).toBe('Слишком часто, подождите минуту.');
  });
});
