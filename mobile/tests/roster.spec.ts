import { describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  calls: [] as { path: string; method?: string; body?: unknown }[],
  /** What the next request is answered with, whatever it asked. */
  answer: undefined as unknown,
}));

// The client itself reaches for React Native; what is checked here is what the
// phone puts on the wire, and what it makes of the answer.
vi.mock('@/lib/api', () => ({
  api: async (path: string, options?: { method?: string; body?: unknown }) => {
    server.calls.push({ path, method: options?.method, body: options?.body });

    return server.answer;
  },
}));

import { UK } from '@/lib/i18n/uk';
import {
  anyPattern,
  CellEdit,
  cellText,
  compactHours,
  cycleStart,
  draftOf,
  draftProblem,
  fillFrom,
  fillLine,
  hoursOf,
  INHERIT,
  monthWeeks,
  NO_PATTERN,
  NO_TIME,
  nextFrom,
  patternLabel,
  patternProblem,
  positionHoursLine,
  positionTaken,
  readDays,
  restampLine,
  RosterPattern,
  RosterPosition,
  sameHours,
  swapEdits,
  undoFill,
  undoOf,
  usualPair,
  withoutPattern,
  withoutPosition,
  withPerson,
  withPosition,
  workingDays,
  crossesMidnight,
  dayList,
  goneFromServer,
  hourPairs,
  hoursProblem,
  monthKey,
  nextColour,
  pressLink,
  readClock,
  readPerson,
  readSheet,
  repeatLine,
  ROSTER_COLOURS,
  rosterLink,
  RosterDay,
  RosterMonth,
  RosterPerson,
  rosterProblem,
  RosterShift,
  stepMonth,
  toBatch,
  withEdits,
} from '@/lib/roster';
import { personSave, rosterApi } from '@/lib/roster-api';
import { venueLine } from '@/lib/roster-rules';

const someone = (id: number, name: string, colour: string, more: Partial<RosterPerson> = {}): RosterPerson => ({
  id,
  name,
  position_id: null,
  position: null,
  colour,
  hours: INHERIT,
  pattern: NO_PATTERN,
  ...more,
});

const tolik = someone(1, 'Толик', '#1f3a5f');
const grisha = someone(2, 'Гриша', '#22c55e');
const pasha = someone(3, 'Паша', '#f5c518');

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
  const workingOn = (day: RosterDay) => day.groups.flatMap((group) => group.working);

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

    expect(workingOn(coming[0])).toEqual([]);
    expect(coming[0].free.map((person) => person.name)).toEqual(['Толик', 'Гриша']);
  });

  it('sorts a day into who works and who does not', () => {
    const shifts = [shift(3, '2026-11-02'), shift(1, '2026-11-02', '12:00', '20:00')];
    const [day] = dayList(november, [tolik, grisha, pasha], shifts, '2026-11-02').coming;

    expect(workingOn(day).map((row) => row.person.name).sort()).toEqual(['Паша', 'Толик']);
    expect(day.free.map((person) => person.name)).toEqual(['Гриша']);
  });

  it('orders a day by who starts first, as the web and the link do', () => {
    const shifts = [
      shift(1, '2026-11-02', '18:00', '02:00'),
      shift(2, '2026-11-02', '11:00', '22:00'),
      shift(3, '2026-11-02', '14:00', '22:00'),
    ];
    const [day] = dayList(november, [tolik, grisha, pasha], shifts, '2026-11-02').coming;

    expect(workingOn(day).map((row) => row.person.name)).toEqual(['Гриша', 'Паша', 'Толик']);
  });

  it('leaves people starting together in the roster’s order', () => {
    const shifts = [shift(3, '2026-11-02'), shift(1, '2026-11-02'), shift(2, '2026-11-02')];
    const [day] = dayList(november, [tolik, grisha, pasha], shifts, '2026-11-02').coming;

    expect(workingOn(day).map((row) => row.person.name)).toEqual(['Толик', 'Гриша', 'Паша']);
  });

  it('keeps a shift past midnight on its start date', () => {
    const shifts = [shift(1, '2026-11-02', '22:00', '06:00')];
    const { coming } = dayList(november, [tolik], shifts, '2026-11-02');

    expect(workingOn(coming[0])).toHaveLength(1);
    expect(workingOn(coming[1])).toHaveLength(0);
  });

  it('draws nothing for somebody no longer on the roster', () => {
    const [day] = dayList(november, [tolik], [shift(9, '2026-11-02')], '2026-11-02').coming;

    expect(workingOn(day)).toEqual([]);
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
    venue_hours: [],
    positions: [],
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

/* Positions, venue hours, usual days and days with no set time. */

const bar: RosterPosition = {
  id: 1,
  name: 'Бар',
  hours: {
    mode: 'own',
    start_time: '18:00',
    end_time: '02:00',
    week_hours: [{ weekday: 5, start_time: '18:00', end_time: '04:00' }],
  },
};
const hookahs: RosterPosition = {
  id: 2,
  name: 'Кальяны',
  hours: { mode: 'venue', start_time: null, end_time: null, week_hours: [] },
};
const cleaning: RosterPosition = {
  id: 3,
  name: 'Уборка',
  hours: { mode: 'none', start_time: null, end_time: null, week_hours: [] },
};
const positions = [bar, hookahs, cleaning];

/** Mon–Thu 12–00, Fri–Sat 12–02, closed on Sunday. */
const venue = [1, 2, 3, 4].map((weekday) => ({ weekday, start_time: '12:00', end_time: '00:00' })).concat(
  [5, 6].map((weekday) => ({ weekday, start_time: '12:00', end_time: '02:00' })),
);

const sheet = { positions, venue_hours: venue };

const bare = (person: number, date: string): RosterShift => ({
  person_id: person,
  date,
  start_time: null,
  end_time: null,
});

const twoTwo: RosterPattern = { kind: 'cycle', weekdays: [], on: 2, off: 2, from: '2026-11-13' };

describe('a day with no set time', () => {
  it('says nothing in its cell, where hours would go', () => {
    expect(cellText(bare(1, '2026-11-02'))).toBeNull();
    expect(cellText(shift(1, '2026-11-02', '18:00', '00:00'))).toBe('18-24');
  });

  it('is no pair of hours to offer', () => {
    const shifts = [bare(1, '2026-11-01'), bare(2, '2026-11-01'), shift(1, '2026-11-02')];

    expect(hourPairs(shifts)).toEqual([{ start_time: '11:00', end_time: '22:00' }]);
  });

  it('is the same as another day with no time, and as no pair of hours', () => {
    expect(sameHours(NO_TIME, { start_time: null, end_time: null })).toBe(true);
    expect(sameHours(NO_TIME, { start_time: '11:00', end_time: '22:00' })).toBe(false);
    expect(sameHours({ start_time: '11:00', end_time: '22:00' }, { start_time: '11:00', end_time: '22:00' })).toBe(true);
  });

  it('lays over a timed shift, and a time lays back over it', () => {
    const month: RosterMonth = {
      id: 7,
      title: 'Кальянная',
      share_slug: null,
      month: '2026-11',
      venue_hours: [],
      positions: [],
      people: [tolik],
      shifts: [shift(1, '2026-11-02')],
    };

    const bared = withEdits(month, [{ person_id: 1, date: '2026-11-02', hours: NO_TIME }]);

    expect(bared.shifts).toEqual([bare(1, '2026-11-02')]);

    const timed = withEdits(bared, [
      { person_id: 1, date: '2026-11-02', hours: { start_time: '12:00', end_time: '20:00' } },
    ]);

    expect(timed.shifts).toEqual([shift(1, '2026-11-02', '12:00', '20:00')]);
  });

  it('goes out as a set with two nulls, not as a clear', () => {
    expect(toBatch([{ person_id: 1, date: '2026-11-02', hours: NO_TIME }])).toEqual({
      set: [{ person_id: 1, date: '2026-11-02', start_time: null, end_time: null }],
      clear: [],
    });
  });
});

describe('the month by day, with positions and venue hours', () => {
  const tolikBar = someone(1, 'Толик', '#1f3a5f', { position_id: 1 });
  const grishaHookahs = someone(2, 'Гриша', '#22c55e', { position_id: 2 });
  const pashaNone = someone(3, 'Паша', '#f5c518');
  const olyaBar = someone(4, 'Оля', '#a855f7', { position_id: 1 });
  const crew = [pashaNone, grishaHookahs, olyaBar, tolikBar];

  it('groups who works by position, positions in id order and nobody’s last', () => {
    const shifts = [
      shift(3, '2026-11-02', '10:00', '18:00'),
      shift(2, '2026-11-02', '12:00', '00:00'),
      shift(4, '2026-11-02', '18:00', '02:00'),
      shift(1, '2026-11-02', '17:00', '02:00'),
    ];
    const [day] = dayList(november, crew, shifts, '2026-11-02', positions, venue).coming;

    expect(day.labelled).toBe(true);
    expect(
      day.groups.map(({ position, working }) => [position?.name ?? null, working.map((row) => row.person.name)]),
    ).toEqual([
      ['Бар', ['Толик', 'Оля']],
      ['Кальяны', ['Гриша']],
      [null, ['Паша']],
    ]);
  });

  it('puts a day with no time after the timed ones in its group, keeping the list’s order among them', () => {
    const shifts = [bare(1, '2026-11-02'), bare(4, '2026-11-02'), shift(4, '2026-11-03', '18:00', '02:00')];
    const later = [...shifts.slice(0, 1), shift(4, '2026-11-02', '19:00', '02:00')];

    const [both] = dayList(november, crew, shifts, '2026-11-02', positions, venue).coming;
    const [mixed] = dayList(november, crew, later, '2026-11-02', positions, venue).coming;

    expect(both.groups[0].working.map((row) => row.person.name)).toEqual(['Толик', 'Оля']);
    expect(mixed.groups[0].working.map((row) => row.person.name)).toEqual(['Оля', 'Толик']);
  });

  it('offers the free in the same order', () => {
    const [day] = dayList(november, crew, [], '2026-11-02', positions, venue).coming;

    expect(day.free.map((person) => person.name)).toEqual(['Толик', 'Оля', 'Гриша', 'Паша']);
    expect(day.groups).toEqual([]);
  });

  it('marks the days the venue is closed, and only those', () => {
    const { coming } = dayList(november, crew, [], '2026-11-01', positions, venue);

    expect(coming.filter((day) => day.closed).map((day) => day.date)).toEqual([
      '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29',
    ]);
  });

  it('closes no day and labels no group while the roster has neither', () => {
    const [day] = dayList(november, [pashaNone], [shift(3, '2026-11-01')], '2026-11-01').coming;

    expect(day.closed).toBe(false);
    expect(day.labelled).toBe(false);
    expect(day.groups).toHaveLength(1);
  });
});

describe('the usual time, put on by one tap', () => {
  it('is the position’s own hours, its own Friday too', () => {
    const on = someone(1, 'Толик', '#1f3a5f', { position_id: 1 });

    expect(usualPair(on, sheet, '2026-11-02')).toEqual({ start_time: '18:00', end_time: '02:00' });
    expect(usualPair(on, sheet, '2026-11-06')).toEqual({ start_time: '18:00', end_time: '04:00' });
  });

  it('is the venue’s for nobody’s position, and no time on a day it is closed', () => {
    expect(usualPair(pasha, sheet, '2026-11-02')).toEqual({ start_time: '12:00', end_time: '00:00' });
    expect(usualPair(pasha, sheet, '2026-11-08')).toEqual(NO_TIME);
  });

  it('is no time for a position with none', () => {
    expect(usualPair(someone(1, 'Толик', '#1f3a5f', { position_id: 3 }), sheet, '2026-11-02')).toEqual(NO_TIME);
  });

  it('is a person’s own, over everything', () => {
    const own = someone(1, 'Толик', '#1f3a5f', {
      position_id: 1,
      hours: { mode: 'own', start_time: '09:00', end_time: '17:00', week_hours: [] },
    });

    expect(usualPair(own, sheet, '2026-11-08')).toEqual({ start_time: '09:00', end_time: '17:00' });
  });
});

describe('handing a day to somebody else', () => {
  const tolikBar = someone(1, 'Толик', '#1f3a5f', { position_id: 1 });
  const grishaHookahs = someone(2, 'Гриша', '#22c55e', { position_id: 2 });
  const olyaCleaning = someone(4, 'Оля', '#a855f7', { position_id: 3 });

  it('gives a day at the usual time the new person’s usual time', () => {
    expect(swapEdits(shift(1, '2026-11-02', '18:00', '02:00'), tolikBar, grishaHookahs, '2026-11-02', sheet)).toEqual([
      { person_id: 1, date: '2026-11-02', hours: null },
      { person_id: 2, date: '2026-11-02', hours: { start_time: '12:00', end_time: '00:00' } },
    ]);
  });

  it('keeps hand-set hours as they are', () => {
    expect(swapEdits(shift(1, '2026-11-02', '20:00', '02:00'), tolikBar, grishaHookahs, '2026-11-02', sheet)[1]).toEqual({
      person_id: 2,
      date: '2026-11-02',
      hours: { start_time: '20:00', end_time: '02:00' },
    });
  });

  it('gives a day with no time, where none was usual, the new person’s time', () => {
    expect(swapEdits(bare(4, '2026-11-02'), olyaCleaning, tolikBar, '2026-11-02', sheet)[1].hours).toEqual({
      start_time: '18:00',
      end_time: '02:00',
    });
  });

  it('keeps a day with no time where the first person had a usual time', () => {
    expect(swapEdits(bare(1, '2026-11-02'), tolikBar, grishaHookahs, '2026-11-02', sheet)[1].hours).toEqual(NO_TIME);
  });

  it('hands over no time to somebody whose usual is none', () => {
    expect(swapEdits(shift(1, '2026-11-02', '18:00', '02:00'), tolikBar, olyaCleaning, '2026-11-02', sheet)[1].hours).toEqual(NO_TIME);
  });
});

describe('taking it back', () => {
  const shifts = [shift(1, '2026-11-02', '18:00', '02:00'), bare(2, '2026-11-03')];

  it('puts each touched cell back as it was: its hours, no time, or empty', () => {
    const edits: CellEdit[] = [
      { person_id: 1, date: '2026-11-02', hours: null },
      { person_id: 2, date: '2026-11-03', hours: { start_time: '12:00', end_time: '00:00' } },
      { person_id: 3, date: '2026-11-02', hours: NO_TIME },
    ];

    expect(undoOf(edits, shifts)).toEqual([
      { person_id: 1, date: '2026-11-02', hours: { start_time: '18:00', end_time: '02:00' } },
      { person_id: 2, date: '2026-11-03', hours: NO_TIME },
      { person_id: 3, date: '2026-11-02', hours: null },
    ]);
  });

  it('touches a cell once, however many edits named it', () => {
    const edits: CellEdit[] = [
      { person_id: 3, date: '2026-11-02', hours: NO_TIME },
      { person_id: 3, date: '2026-11-02', hours: null },
    ];

    expect(undoOf(edits, shifts)).toEqual([{ person_id: 3, date: '2026-11-02', hours: null }]);
  });

  it('takes a fill back by clearing only what was empty before it', () => {
    const after = [...shifts, shift(1, '2026-11-03', '18:00', '02:00'), bare(2, '2026-11-04')];

    expect(undoFill(shifts, after)).toEqual([
      { person_id: 1, date: '2026-11-03', hours: null },
      { person_id: 2, date: '2026-11-04', hours: null },
    ]);
  });

  it('leaves what the owner put by hand while the fill was out', () => {
    const theirs: CellEdit[] = [{ person_id: 3, date: '2026-11-20', hours: { start_time: '12:00', end_time: '20:00' } }];
    const after = [...shifts, shift(1, '2026-11-03', '18:00', '02:00'), shift(3, '2026-11-20', '12:00', '20:00')];

    expect(undoFill(shifts, after, theirs)).toEqual([{ person_id: 1, date: '2026-11-03', hours: null }]);
  });
});

describe('where a fill starts', () => {
  it('is today in the month under way, the 1st of a later one, and nowhere in one gone by', () => {
    expect(fillFrom(november, '2026-11-13')).toBe('2026-11-13');
    expect(fillFrom(november, '2026-11-01')).toBe('2026-11-01');
    expect(fillFrom(november, '2026-10-20')).toBe('2026-11-01');
    expect(fillFrom(november, '2026-11-30')).toBe('2026-11-30');
    expect(fillFrom(november, '2026-12-01')).toBeNull();
  });
});

describe('the line after a fill', () => {
  it('says nobody has working days, this month or what is left of it', () => {
    expect(fillLine({ added: 0, kept: 0, skipped: 0, from: '2026-11-01' }, november, [])).toBe(
      'В этом месяце ни у кого нет рабочих дней.',
    );
    expect(fillLine({ added: 0, kept: 0, skipped: 0, from: '2026-11-13' }, november, [])).toBe(
      'До конца месяца ни у кого нет рабочих дней.',
    );
  });

  it('tells a closed venue apart from nobody having days', () => {
    expect(fillLine({ added: 0, kept: 0, skipped: 4, from: '2026-11-01' }, november, [])).toBe(
      'Никого не поставили — в эти дни заведение закрыто.',
    );
  });

  it('says nothing new went in, and what the closed days kept out', () => {
    expect(fillLine({ added: 0, kept: 8, skipped: 0, from: '2026-11-01' }, november, [])).toBe(
      'Новых смен нет, заполненные дни остались как были.',
    );
    expect(fillLine({ added: 0, kept: 8, skipped: 5, from: '2026-11-01' }, november, [])).toBe(
      'Новых смен нет, заполненные дни остались как были, не поставлено — заведение закрыто: 5.',
    );
  });

  it('says from when it filled a month under way, with what stood and what the venue kept out', () => {
    expect(fillLine({ added: 6, kept: 2, skipped: 3, from: '2026-11-13' }, november, [])).toBe(
      'Добавлено с 13 ноября: 6 смен, уже стояло: 2, не поставлено — заведение закрыто: 3.',
    );
  });

  it('counts in the forms a number takes', () => {
    const line = (added: number) => fillLine({ added, kept: 0, skipped: 0, from: '2026-11-01' }, november, []);

    expect(line(1)).toBe('Добавлено: 1 смена.');
    expect(line(2)).toBe('Добавлено: 2 смены.');
    expect(line(5)).toBe('Добавлено: 5 смен.');
    expect(line(21)).toBe('Добавлено: 21 смена.');
  });

  it('names whom it left for the owner to put on by hand', () => {
    expect(fillLine({ added: 8, kept: 0, skipped: 5, from: '2026-11-01' }, november, ['Женя', 'Оля'])).toBe(
      'Добавлено: 8 смен, не поставлено — заведение закрыто: 5. Без рабочих дней: Женя, Оля — их ставьте вручную.',
    );
  });

  it('knows who has days and who does not, in list order', () => {
    const crew = [
      someone(1, 'Толик', '#1f3a5f', { pattern: twoTwo }),
      someone(2, 'Женя', '#22c55e'),
      someone(3, 'Оля', '#f5c518', { position_id: 1 }),
    ];

    expect(anyPattern(crew)).toBe(true);
    expect(anyPattern([tolik])).toBe(false);
    expect(withoutPattern(crew, positions)).toEqual(['Оля', 'Женя']);
  });
});

describe('the line after shifts moved to a new usual time', () => {
  it('says how many', () => {
    expect(restampLine(3)).toBe('Время обновлено в уже поставленных сменах: 3.');
  });
});

describe('usual days', () => {
  it('moves the next person’s rhythm on by its days on', () => {
    expect(nextFrom(twoTwo)).toEqual({ ...twoTwo, from: '2026-11-15' });
    expect(nextFrom({ ...twoTwo, on: 3, off: 3, from: '2026-12-30' }).from).toBe('2027-01-02');
  });

  it('leaves anything but a rhythm as it is', () => {
    const weekdays: RosterPattern = { kind: 'weekdays', weekdays: [1, 3], on: null, off: null, from: null };

    expect(nextFrom(NO_PATTERN)).toBe(NO_PATTERN);
    expect(nextFrom(weekdays)).toBe(weekdays);
  });

  it('says them in a few words', () => {
    expect(patternLabel(NO_PATTERN, november)).toBe('Вручную');
    expect(patternLabel({ ...NO_PATTERN, kind: 'weekdays', weekdays: [5, 1, 3] }, november)).toBe('Пн Ср Пт');
    expect(patternLabel(twoTwo, november)).toBe('2/2 · Выходит с 13 ноя');
  });

  it('gives the year of a rhythm anchored in another', () => {
    expect(patternLabel({ ...twoTwo, from: '2025-12-30' }, november)).toBe('2/2 · Выходит с 30 дек 2025');
  });

  it('starts a new rhythm today in the month under way, else on the 1st', () => {
    expect(cycleStart(november, '2026-11-13')).toBe('2026-11-13');
    expect(cycleStart({ year: 2026, month: 12 }, '2026-11-13')).toBe('2026-12-01');
  });

  it('lights up the days a rhythm lands on in the month shown', () => {
    expect([...workingDays(twoTwo, november)].slice(0, 6)).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10',
    ]);
  });

  it('asks for a day of the week, and for a rhythm that fits', () => {
    expect(patternProblem(NO_PATTERN)).toBeNull();
    expect(patternProblem({ ...NO_PATTERN, kind: 'weekdays' })).toBe('Выберите хотя бы один день.');
    expect(patternProblem(twoTwo)).toBeNull();
    expect(patternProblem({ ...twoTwo, on: 0 })).toBe('В цикле от 1 до 28 рабочих дней и от 1 до 28 выходных.');
    expect(patternProblem({ ...twoTwo, off: 29 })).toBe('В цикле от 1 до 28 рабочих дней и от 1 до 28 выходных.');
    expect(patternProblem({ ...twoTwo, on: null })).toBe('В цикле от 1 до 28 рабочих дней и от 1 до 28 выходных.');
  });

  it('reads a typed count of days', () => {
    expect(readDays('2')).toBe(2);
    expect(readDays(' 28 ')).toBe(28);
    expect(readDays('')).toBeNull();
    expect(readDays('2.5')).toBeNull();
    expect(readDays('abc')).toBeNull();
  });
});

describe('hours as a form holds them', () => {
  it('opens own hours as they are, their other days as rows', () => {
    expect(draftOf(bar.hours)).toEqual({
      mode: 'own',
      start: '18:00',
      end: '02:00',
      rows: [{ days: [5], start: '18:00', end: '04:00' }],
    });
  });

  it('opens hours with none of their own on a pair to start from', () => {
    expect(draftOf(INHERIT)).toEqual({ mode: 'inherit', start: '18:00', end: '02:00', rows: [] });
  });

  it('sends own hours as the wire writes them, typed however', () => {
    expect(
      hoursOf({ mode: 'own', start: '9', end: '1730', rows: [{ days: [6, 7], start: '10:00', end: '15:00' }] }),
    ).toEqual({
      mode: 'own',
      start_time: '09:00',
      end_time: '17:30',
      week_hours: [
        { weekday: 6, start_time: '10:00', end_time: '15:00' },
        { weekday: 7, start_time: '10:00', end_time: '15:00' },
      ],
    });
  });

  it('sends no times at all for anything but own, whatever was typed before', () => {
    expect(hoursOf({ mode: 'venue', start: '18:00', end: '02:00', rows: [{ days: [5], start: '18:00', end: '04:00' }] })).toEqual({
      mode: 'venue',
      start_time: null,
      end_time: null,
      week_hours: [],
    });
  });

  it('finds fault only with own hours', () => {
    expect(draftProblem({ mode: 'inherit', start: '', end: '', rows: [] })).toBeNull();
    expect(draftProblem({ mode: 'own', start: 'утро', end: '22', rows: [] })).toBe('Время пишется как 18:00.');
    expect(draftProblem({ mode: 'own', start: '11', end: '11:00', rows: [] })).toBe('Начало и конец должны отличаться.');
    expect(draftProblem({ mode: 'own', start: '11', end: '22', rows: [{ days: [5], start: '23', end: '02:00' }] })).toBe(
      'Часы по дням: время пишется как 18:00.',
    );
  });
});

describe('the month as a grid', () => {
  it('runs in weeks from Monday, padded either side', () => {
    const weeks = monthWeeks(november);

    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks[1][0]).toBe('2026-11-02');
    expect(weeks[5]).toEqual(['2026-11-30', null, null, null, null, null, null]);
  });
});

describe('positions', () => {
  it('knows a name already taken, in any case and with spaces, but not its own', () => {
    expect(positionTaken(positions, '  бар ')).toBe(true);
    expect(positionTaken(positions, 'Кухня')).toBe(false);
    expect(positionTaken(positions, 'бар', 1)).toBe(false);
  });

  it('says its hours in one line', () => {
    expect(positionHoursLine(bar.hours)).toBe('18:00–02:00 · по дням');
    expect(positionHoursLine({ ...bar.hours, week_hours: [] })).toBe('18:00–02:00');
    expect(positionHoursLine(hookahs.hours)).toBe('С открытия до закрытия');
    expect(positionHoursLine(cleaning.hours)).toBe('Без времени');
  });

  it('carries a rename to the people on it', () => {
    const crew = { venue_hours: [], positions, people: [someone(1, 'Толик', '#1f3a5f', { position_id: 1, position: 'Бар' })] };
    const renamed = withPosition(crew, { ...bar, name: 'Барная стойка' });

    expect(renamed.positions.map((one) => one.name)).toEqual(['Барная стойка', 'Кальяны', 'Уборка']);
    expect(renamed.people[0].position).toBe('Барная стойка');
  });

  it('adds a new one at the end', () => {
    const crew = { venue_hours: [], positions: [bar], people: [] };

    expect(withPosition(crew, hookahs).positions).toEqual([bar, hookahs]);
  });

  it('leaves its people on the roster, with none, once it is deleted', () => {
    const crew = { venue_hours: [], positions, people: [someone(1, 'Толик', '#1f3a5f', { position_id: 1, position: 'Бар' })] };
    const after = withoutPosition(crew, 1);

    expect(after.positions).toEqual([hookahs, cleaning]);
    expect(after.people[0]).toMatchObject({ position_id: null, position: null });
  });

  it('takes a person as the server answered, or adds them', () => {
    const crew = { venue_hours: [], positions, people: [tolik] };
    const moved = { ...tolik, position_id: 2, position: 'Кальяны' };

    expect(withPerson(crew, moved).people).toEqual([moved]);
    expect(withPerson(crew, grisha).people).toEqual([tolik, grisha]);
  });
});

describe('what the phone sends', () => {
  it('builds a person field by field, and never with the position’s name', () => {
    const save = personSave({ ...tolik, position_id: 1, position: 'Бар' } as RosterPerson);

    expect(save).toEqual({ name: 'Толик', colour: '#1f3a5f', position_id: 1, hours: INHERIT, pattern: NO_PATTERN });
    expect('position' in save).toBe(false);
    expect('id' in save).toBe(false);
  });

  it('sends a person save with no position text, adding or changing', async () => {
    server.calls.length = 0;
    server.answer = { ...tolik, restamped: 0 };

    const stale = { ...tolik, position: 'Бар' } as RosterPerson;

    await rosterApi.addPerson(7, stale);
    await rosterApi.updatePerson(7, 1, stale);

    expect(server.calls.map((call) => [call.method, call.path])).toEqual([
      ['POST', '/shifter/v1/rosters/7/people'],
      ['PUT', '/shifter/v1/rosters/7/people/1'],
    ]);

    for (const call of server.calls) expect(Object.keys(call.body as object).sort()).toEqual(['colour', 'hours', 'name', 'pattern', 'position_id']);
  });

  it('always reads a month bare, days with no set time and all', async () => {
    server.calls.length = 0;
    server.answer = { id: 7, title: 'Бар', share_slug: null, month: '2026-11', venue_hours: [], positions: [], people: [], shifts: [] };

    await rosterApi.month(7, '2026-11');

    expect(server.calls[0].path).toBe('/shifter/v1/rosters/7/month/2026-11?bare=1');
  });

  it('fills and clears a month by its key', async () => {
    server.calls.length = 0;

    await rosterApi.fill(7, '2026-11');
    await rosterApi.clear(7, '2026-11');

    expect(server.calls).toEqual([
      { path: '/shifter/v1/rosters/7/fill', method: 'POST', body: { month: '2026-11' } },
      { path: '/shifter/v1/rosters/7/clear', method: 'POST', body: { month: '2026-11' } },
    ]);
  });
});

describe('what the phone makes of a server rolled back to before positions', () => {
  // A store build stays on the phone: the server going back a release must not
  // take the roster screen down with it.
  const before = {
    id: 7,
    title: 'Бар',
    share_slug: null,
    month: '2026-11',
    people: [{ id: 1, name: 'Толик', position: 'Бармен', colour: '#1f3a5f' }],
    shifts: [shift(1, '2026-11-02')],
  };

  it('takes what it leaves out as not set, and keeps what it sends', async () => {
    server.answer = before;

    const month = await rosterApi.month(7, '2026-11');

    expect(month).toEqual({
      ...before,
      venue_hours: [],
      positions: [],
      people: [{ ...before.people[0], position_id: null, hours: INHERIT, pattern: NO_PATTERN }],
    });

    // What the screen does with a month the moment it has one.
    const days = dayList(november, month.people, month.shifts, '2026-11-13', month.positions, month.venue_hours);

    expect(venueLine(month.venue_hours, 'ru')).toBeNull();
    expect(days.past.find((day) => day.date === '2026-11-02')?.groups[0].working).toHaveLength(1);
    expect(usualPair(month.people[0], month, '2026-11-14')).toEqual(NO_TIME);
    expect(anyPattern(month.people)).toBe(false);
  });

  it('does the same for the roster list, a new roster and a person saved', async () => {
    const roster = { id: 7, title: 'Бар', share_slug: null, people: before.people };

    server.answer = [roster];
    expect((await rosterApi.list())[0]).toMatchObject({ venue_hours: [], positions: [], people: [{ hours: INHERIT }] });

    server.answer = roster;
    expect(await rosterApi.create('Бар')).toMatchObject({ positions: [], people: [{ pattern: NO_PATTERN }] });
    expect(await rosterApi.rename(7, 'Бар')).toMatchObject({ venue_hours: [] });

    server.answer = before.people[0];
    expect(await rosterApi.addPerson(7, tolik)).toMatchObject({ position_id: null, hours: INHERIT, pattern: NO_PATTERN });
    expect(await rosterApi.updatePerson(7, 1, tolik)).toMatchObject({ position: 'Бармен', pattern: NO_PATTERN });
  });

  it('leaves an answer from this server as it came', () => {
    const now = { venue_hours: venue, positions, people: [someone(1, 'Толик', '#1f3a5f', { position_id: 1, position: 'Бар', pattern: twoTwo })] };
    const moved = { ...tolik, position_id: 2, position: 'Кальяны', restamped: 3 };

    expect(readSheet(now)).toEqual(now);
    expect(readPerson(moved)).toEqual(moved);
  });
});

describe('the new lines, in Ukrainian too', () => {
  it('has every phrase that reaches t() through a variable', () => {
    const phrases = [
      patternProblem({ ...NO_PATTERN, kind: 'weekdays' }),
      patternProblem({ ...twoTwo, on: 0 }),
    ];

    expect(phrases.filter((phrase) => UK[phrase as string] === undefined)).toEqual([]);
  });
});
