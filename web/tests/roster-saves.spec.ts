import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError, api } from '@/lib/api/http';
import {
  Roster,
  RosterCellClear,
  RosterMonth,
  RosterPerson,
  RosterPersonSave,
  RosterPosition,
  RosterShift,
} from '@/lib/api/roster';
import type { WeekHours } from '@/lib/calendar/models';
import { RosterEdit, applyEdit, editKey } from '@/lib/roster/edits';
import { INHERIT, NO_PATTERN } from '@/lib/roster/people';
import { restamp } from '@/lib/roster/rules';
import { RosterRefusal, behindSaves, createRosterSaves, watchLeaving } from '@/lib/roster/saves';
import { SaveState } from '@/lib/roster/save-queue';

vi.mock('@/lib/api/http', async (original) => ({
  ...(await original<typeof import('@/lib/api/http')>()),
  api: vi.fn(),
}));

const call = vi.mocked(api);

const person = (id: number, name: string): RosterPerson => ({
  id,
  name,
  position_id: null,
  position: null,
  colour: '#6366f1',
  hours: INHERIT,
  pattern: NO_PATTERN,
});

const position = (id: number, name: string): RosterPosition => ({
  id,
  name,
  hours: { mode: 'none', start_time: null, end_time: null, week_hours: [] },
});

const roster = (id: number, people: RosterPerson[], positions: RosterPosition[] = []): Roster => ({
  id,
  title: 'Бар',
  share_slug: null,
  venue_hours: [],
  positions,
  people,
});

/** A person save as the page builds it: every field, a position by id. */
const personEdit = (id: number, positionId: number | null, over: Partial<RosterPersonSave> = {}): RosterEdit => ({
  kind: 'person',
  id,
  save: { name: `#${id}`, colour: '#6366f1', position_id: positionId, hours: INHERIT, pattern: NO_PATTERN, ...over },
});

const cell = (personId: number, date: string): RosterEdit => ({
  kind: 'set',
  shift: { person_id: personId, date, start_time: '11:00', end_time: '22:00' } satisfies RosterShift,
});

/** The saves with everything they report kept for the test to read. */
function rig() {
  const refusals: RosterRefusal[] = [];
  const reported: [SaveState, string | null][] = [];
  const peopleSaved: number[] = [];

  const saves = createRosterSaves({
    onChange: (state, failure) => reported.push([state, failure]),
    onRefused: (refusal) => refusals.push(refusal),
    onPeopleSaved: (rosterId) => peopleSaved.push(rosterId),
  });

  const put = (rosterId: number, ...edits: RosterEdit[]) => {
    for (const edit of edits) saves.queueFor(rosterId).put(editKey(edit), edit);
  };

  return { saves, refusals, reported, peopleSaved, put };
}

const saved = () => call.mock.calls.filter(([, options]) => options?.method === 'PUT');

const quiet = () => vi.advanceTimersByTimeAsync(500);

beforeEach(() => {
  vi.useFakeTimers();
  call.mockReset();
  call.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('leaving the page', () => {
  it('goes out at once in a request that outlives the page, and only then', async () => {
    const { saves, put } = rig();

    put(1, cell(1, '2026-11-02'));
    saves.leave();

    expect(saved()[0][1]?.keepalive).toBe(true);

    await vi.advanceTimersByTimeAsync(0);

    put(1, cell(1, '2026-11-03'));
    await quiet();

    expect(saved()[1][1]?.keepalive).toBeFalsy();
  });

  it('counts anything still waiting, on its way, or failed as unsaved', async () => {
    const { saves, put } = rig();

    expect(saves.unsaved()).toBe(false);

    call.mockRejectedValueOnce(new HttpError(503, 'Later.'));
    put(1, cell(1, '2026-11-02'));

    expect(saves.unsaved()).toBe(true);

    await quiet();

    expect(saves.queueFor(1).state()).toBe('failed');
    expect(saves.unsaved()).toBe(true);

    saves.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(saves.unsaved()).toBe(false);
  });

  it('counts a failure on a roster the owner has left', async () => {
    const { saves, put } = rig();

    call.mockRejectedValueOnce(new HttpError(503, 'Later.'));
    put(1, cell(1, '2026-11-02'));
    await quiet();

    put(2, cell(2, '2026-11-02'));
    await quiet();

    expect(saves.unsaved()).toBe(true);
  });
});

describe('the events a page ends with', () => {
  /** A page and document that fire what they are told, in the state they are told. */
  function ends(unsaved = () => true) {
    const page = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const leave = vi.fn();

    return { page, doc, leave, stop: watchLeaving({ leave, unsaved }, page, doc) };
  }

  const unload = () => new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;

  it('flushes on pagehide though the page still counts as visible', () => {
    const { page, leave } = ends();

    page.dispatchEvent(new Event('pagehide'));

    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('flushes when the page goes out of sight, and not when it comes back', () => {
    const { doc, leave } = ends();

    doc.dispatchEvent(new Event('visibilitychange'));

    expect(leave).not.toHaveBeenCalled();

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));

    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('asks the browser to hold the page while anything is unsent, having already tried to send it', () => {
    const { page, leave } = ends();
    const event = unload();

    page.dispatchEvent(event);

    expect(leave).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets the page go when everything is saved', () => {
    const { page } = ends(() => false);
    const event = unload();

    page.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('stops listening with the page that listened', () => {
    const { page, leave, stop } = ends();

    stop();
    page.dispatchEvent(new Event('pagehide'));
    page.dispatchEvent(unload());

    expect(leave).not.toHaveBeenCalled();
  });
});

describe('a batch naming somebody who went on another device', () => {
  const gone = new HttpError(404, 'Person does not exist.');

  /** Толик was removed, so the first save is refused and the list no longer holds him. */
  function refusedOnce(left: RosterPerson[] | null = [person(2, 'Гриша')]) {
    call.mockImplementation(async (path, options) => {
      if (options?.method === 'PUT' && saved().length === 1) throw gone;

      return (path === '/shifter/v1/rosters' ? (left === null ? [] : [roster(1, left)]) : undefined) as never;
    });
  }

  it('saves the other cells and drops only theirs', async () => {
    const { saves, put, refusals } = rig();

    refusedOnce();
    put(1, cell(1, '2026-11-02'), cell(2, '2026-11-02'), cell(2, '2026-11-03'), cell(2, '2026-11-04'));
    await quiet();

    expect(saved()).toHaveLength(2);
    expect((saved()[1][1]?.body as { set: RosterShift[] }).set.map((one) => one.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
    expect((saved()[1][1]?.body as { set: RosterShift[] }).set.every((one) => one.person_id === 2)).toBe(true);
    expect(refusals).toEqual([{ error: gone, went: [1], kept: 3, positionGone: false }]);
    expect(saves.queueFor(1).state()).toBe('saved');
  });

  it('also lets go of a later change to the same person, which would only be refused', async () => {
    const { saves, put } = rig();

    refusedOnce();
    put(1, cell(1, '2026-11-02'), cell(2, '2026-11-02'));
    await quiet();

    expect(saves.queueFor(1).pending()).toEqual([]);
    expect(saved()).toHaveLength(2);
  });

  it('keeps a title riding in the same batch', async () => {
    const { put } = rig();

    refusedOnce();
    put(1, cell(1, '2026-11-02'), { kind: 'title', title: 'Кухня' });
    await quiet();

    expect(saved().map(([path]) => path)).toEqual([
      '/shifter/v1/rosters/1/cells',
      '/shifter/v1/rosters/1',
    ]);
  });

  it('lets the batch go when nobody in it has left, or it would go round for ever', async () => {
    const { saves, put, refusals } = rig();

    refusedOnce([person(1, 'Толик'), person(2, 'Гриша')]);
    put(1, cell(1, '2026-11-02'));
    await quiet();

    expect(saved()).toHaveLength(1);
    expect(refusals).toEqual([{ error: gone, went: [], kept: 0, positionGone: false }]);
    expect(saves.queueFor(1).pending()).toEqual([]);
  });

  it('lets the batch go when the whole roster has gone', async () => {
    const { saves, put, refusals } = rig();

    refusedOnce(null);
    put(1, cell(1, '2026-11-02'));
    await quiet();

    expect(saved()).toHaveLength(1);
    expect(refusals).toEqual([{ error: gone, went: [], kept: 0, positionGone: false }]);
    expect(saves.queueFor(1).state()).toBe('idle');
  });

  it('holds the batch as failed when the list cannot be read, and tries it all again on retry', async () => {
    const { saves, put, refusals, reported } = rig();

    call.mockImplementationOnce(async () => {
      throw gone;
    });
    call.mockImplementationOnce(async () => {
      throw new HttpError(503, 'Later.');
    });

    put(1, cell(1, '2026-11-02'), cell(2, '2026-11-02'));
    await quiet();

    expect(reported.at(-1)?.[0]).toBe('failed');
    expect(refusals).toEqual([]);
    expect(saves.queueFor(1).pending()).toHaveLength(2);

    saves.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(saved()).toHaveLength(2);
    expect(saves.queueFor(1).state()).toBe('saved');
  });

  it('turns down a bad batch as before, with no second look', async () => {
    const { saves, put, refusals } = rig();
    const bad = new HttpError(400, 'A shift cannot start and end at the same minute.');

    call.mockRejectedValueOnce(bad);
    put(1, cell(1, '2026-11-02'));
    await quiet();

    expect(call).toHaveBeenCalledTimes(1);
    expect(refusals).toEqual([{ error: bad, went: [], kept: 0, positionGone: false }]);
    expect(saves.queueFor(1).state()).toBe('idle');
  });

  it('reads the list past the worker’s copy', async () => {
    const { put } = rig();

    refusedOnce();
    put(1, cell(1, '2026-11-02'));
    await quiet();

    expect(call).toHaveBeenCalledWith('/shifter/v1/rosters', { fresh: true });
  });
});

describe('a batch naming a position deleted on another device', () => {
  const gone = new HttpError(404, 'Position does not exist.');

  it('a refused batch keeps everything but the person edit that names a deleted position', async () => {
    const { saves, put, refusals } = rig();
    const people = [person(1, 'Толик'), person(2, 'Гриша'), person(3, 'Паша')];
    let refused = false;

    call.mockImplementation(async (path, options) => {
      if (path === '/shifter/v1/rosters') return [roster(1, people, [position(4, 'Бар')])] as never;

      if (options?.method === 'PUT' && path === '/shifter/v1/rosters/1/people/2' && !refused) {
        refused = true;
        throw gone;
      }

      return undefined as never;
    });

    put(1, cell(1, '2026-11-02'), personEdit(2, 9), personEdit(3, 4), { kind: 'title', title: 'Кухня' });
    await quiet();

    expect(refusals).toEqual([{ error: gone, went: [], kept: 3, positionGone: true }]);

    const again = saved().slice(saved().findIndex(([path]) => path === '/shifter/v1/rosters/1/people/2') + 1);

    expect(again.map(([path]) => path)).toEqual([
      '/shifter/v1/rosters/1/cells',
      '/shifter/v1/rosters/1/people/3',
      '/shifter/v1/rosters/1',
    ]);
    expect(saves.queueFor(1).state()).toBe('saved');
  });

  it('lets a person edit go to a position that is still there', async () => {
    const { put, refusals } = rig();

    call.mockImplementation(async (path, options) => {
      if (path === '/shifter/v1/rosters') return [roster(1, [person(1, 'Толик')], [position(4, 'Бар')])] as never;
      if (options?.method === 'PUT' && saved().length === 1) throw gone;

      return undefined as never;
    });

    put(1, personEdit(1, 4));
    await quiet();

    expect(refusals).toEqual([{ error: gone, went: [], kept: 0, positionGone: false }]);
  });
});

describe('a request that must not pass the edits ahead of it', () => {
  it('deleting a position waits for a failed batch rather than going past it', async () => {
    const { saves, put } = rig();
    const remove = vi.fn(async () => ({ restamped: 0 }));

    call.mockRejectedValueOnce(new HttpError(503, 'Later.'));
    put(1, personEdit(1, 4));

    const deleting = behindSaves(saves.queueFor(1), remove);

    await vi.advanceTimersByTimeAsync(0);

    expect(await deleting).toBeNull();
    expect(remove).not.toHaveBeenCalled();
    expect(saves.queueFor(1).state()).toBe('failed');
  });

  it('goes once the edits ahead of it have landed', async () => {
    const { saves, put } = rig();
    const order: string[] = [];

    call.mockImplementation(async (path) => {
      order.push(path);

      return undefined as never;
    });
    put(1, personEdit(1, 4));

    const removed = await behindSaves(saves.queueFor(1), async () => {
      order.push('delete');

      return { restamped: 2 };
    });

    expect(removed).toEqual({ restamped: 2 });
    expect(order).toEqual(['/shifter/v1/rosters/1/people/1', 'delete']);
  });
});

describe('the new kinds of edit', () => {
  it('coalesce a day with no time and a person’s position, hours and days, and send them unchanged', async () => {
    const { put } = rig();
    const own = { mode: 'own' as const, start_time: '18:00', end_time: '02:00', week_hours: [] };
    const days = { kind: 'cycle' as const, weekdays: [], on: 2, off: 2, from: '2026-11-03' };
    const latest = personEdit(1, 4, { hours: own, pattern: days });

    put(1, cell(1, '2026-11-02'), { kind: 'set', shift: { person_id: 1, date: '2026-11-02', start_time: null, end_time: null } });
    put(1, personEdit(1, null), latest);
    await quiet();

    expect(saved().map(([path, options]) => [path, options?.body])).toEqual([
      [
        '/shifter/v1/rosters/1/cells',
        { set: [{ person_id: 1, date: '2026-11-02', start_time: null, end_time: null }], clear: [] },
      ],
      ['/shifter/v1/rosters/1/people/1', latest.kind === 'person' ? latest.save : null],
    ]);
  });
});

describe('a person edit and the cells around it', () => {
  const TODAY = '2026-11-13';

  /** Mon–Thu noon to midnight, Friday and Saturday to two. */
  const VENUE: WeekHours[] = [
    ...[1, 2, 3, 4].map((weekday) => ({ weekday, start_time: '12:00', end_time: '00:00' })),
    ...[5, 6].map((weekday) => ({ weekday, start_time: '12:00', end_time: '02:00' })),
  ];

  const none = { mode: 'none' as const, start_time: null, end_time: null, week_hours: [] };
  const own = (start_time: string, end_time: string) => ({ mode: 'own' as const, start_time, end_time, week_hours: [] });

  const POSITIONS: RosterPosition[] = [
    { id: 1, name: 'Бар', hours: own('18:00', '02:00') },
    { id: 2, name: 'Кальяны', hours: { ...none, mode: 'venue' } },
    { id: 3, name: 'Уборка', hours: none },
    { id: 4, name: 'Кухня', hours: own('10:00', '22:00') },
  ];

  const at = (date: string, start: string | null, end: string | null): RosterShift => ({
    person_id: 11,
    date,
    start_time: start,
    end_time: end,
  });

  const set = (date: string, start: string | null, end: string | null): RosterEdit => ({ kind: 'set', shift: at(date, start, end) });
  const moveTo = (positionId: number, name = 'Толик'): RosterEdit => personEdit(11, positionId, { name });

  // Толик on the hookahs takes the venue's 12–00 on a Monday. The 9th is gone
  // by; the 16th sits at his usual time; the 23rd is empty.
  const START: RosterMonth = {
    ...roster(1, [{ ...person(11, 'Толик'), position_id: 2, position: 'Кальяны' }], POSITIONS),
    venue_hours: VENUE,
    month: '2026-11',
    shifts: [at('2026-11-09', '12:00', '00:00'), at('2026-11-16', '12:00', '00:00')],
  };

  const cellOf = (cell: RosterCellClear) => `${cell.person_id}|${cell.date}`;

  /**
   * The server's end: cells as they come, and a person save that moves their
   * shifts from the person it held by the shared rule, as RestampAsync does.
   * Each save waits on the gate first, so a test can hold one on the wire.
   */
  function server(gate: () => Promise<void> = async () => undefined) {
    let month = START;

    call.mockImplementation(async (path, options) => {
      if (options?.method !== 'PUT') return undefined as never;

      await gate();

      if (path.endsWith('/cells')) {
        const { set: put, clear } = options.body as { set: RosterShift[]; clear: RosterCellClear[] };
        const touched = new Set([...put, ...clear].map(cellOf));
        const cleared = new Set(clear.map(cellOf));

        month = {
          ...month,
          shifts: [...month.shifts.filter((one) => !touched.has(cellOf(one))), ...put.filter((one) => !cleared.has(cellOf(one)))],
        };
      } else {
        const id = Number(path.split('/').at(-1));
        const save = options.body as RosterPersonSave;
        const after = { ...month, people: month.people.map((one) => (one.id === id ? { ...one, ...save } : one)) };

        month = { ...after, shifts: restamp(month.shifts, month, after, TODAY).shifts };
      }

      return undefined as never;
    });

    return () => month;
  }

  /** What the screen shows: each edit laid on as it was made. */
  const screen = (edits: RosterEdit[]) => edits.reduce((month, edit) => applyEdit(month, edit, TODAY), START);

  const byDate = (shifts: RosterShift[]) => [...shifts].sort((one, two) => one.date.localeCompare(two.date));

  const paths = () => saved().map(([path]) => path.replace('/shifter/v1/rosters/1', ''));

  it('leaves the screen and the server alike when a cell is set after the person edit in one batch', async () => {
    const { put } = rig();
    const stored = server();
    // Moved to the bar from next week, but the 23rd is still a hookah day.
    const edits = [moveTo(1), set('2026-11-23', '12:00', '00:00')];

    put(1, ...edits);
    await quiet();

    expect(paths()).toEqual(['/people/11', '/cells']);
    expect(byDate(stored().shifts)).toEqual(byDate(screen(edits).shifts));
    expect(stored().shifts).toContainEqual(at('2026-11-23', '12:00', '00:00'));
    expect(stored().shifts).toContainEqual(at('2026-11-16', '18:00', '02:00'));
  });

  it('still sends first a cell set before the person edit, which the move takes along on both sides', async () => {
    const { put } = rig();
    const stored = server();
    const edits = [set('2026-11-23', '12:00', '00:00'), moveTo(1)];

    put(1, ...edits);
    await quiet();

    expect(paths()).toEqual(['/cells', '/people/11']);
    expect(byDate(stored().shifts)).toEqual(byDate(screen(edits).shifts));
    expect(stored().shifts).toContainEqual(at('2026-11-23', '18:00', '02:00'));
  });

  it('sends a person edit that failed again ahead of a cell set while it was out', async () => {
    const { saves, put } = rig();
    let fail: (error: unknown) => void = () => undefined;
    let first = true;
    const stored = server(() => {
      if (!first) return Promise.resolve();

      first = false;

      return new Promise((_, no) => {
        fail = no;
      });
    });
    const edits = [moveTo(1), set('2026-11-23', '12:00', '00:00')];

    put(1, edits[0]);
    await quiet();

    put(1, edits[1]);
    fail(new TypeError('Failed to fetch'));
    await quiet();

    expect(saves.queueFor(1).state()).toBe('saved');
    expect(paths()).toEqual(['/people/11', '/people/11', '/cells']);
    expect(byDate(stored().shifts)).toEqual(byDate(screen(edits).shifts));
  });

  it('sends a cell set again after the person edit behind it, not in the place it was first set', async () => {
    const { put } = rig();
    const stored = server();
    const edits = [set('2026-11-23', '14:00', '23:00'), moveTo(1), set('2026-11-23', '12:00', '00:00')];

    put(1, ...edits);
    await quiet();

    expect(paths()).toEqual(['/people/11', '/cells']);
    expect(byDate(stored().shifts)).toEqual(byDate(screen(edits).shifts));
  });

  it('keeps a person’s newer word ahead of the cells set since, so its move does not reach them', async () => {
    const { put } = rig();
    const stored = server();
    const edits = [moveTo(1), set('2026-11-23', '12:00', '00:00'), moveTo(1, 'Анатолий')];

    put(1, ...edits);
    await quiet();

    expect(paths()).toEqual(['/people/11', '/cells']);
    expect(byDate(stored().shifts)).toEqual(byDate(screen(edits).shifts));
  });

  it('has the month read back once a person edit lands, since the screen’s steps need not add up to the server’s one move', async () => {
    const { put, peopleSaved } = rig();
    const stored = server();
    // The bar, a slip onto cleaning with no set time, then the kitchen: one word goes out.
    const edits = [moveTo(1), moveTo(3), moveTo(4)];

    put(1, ...edits);

    expect(peopleSaved).toEqual([]);

    await quiet();

    expect(saved()).toHaveLength(1);
    expect(peopleSaved).toEqual([1]);
    // Step by step the screen got to no time and stopped; the server went straight from 12–00 to 10–22.
    expect(screen(edits).shifts).toContainEqual(at('2026-11-16', null, null));
    expect(stored().shifts).toContainEqual(at('2026-11-16', '10:00', '22:00'));
  });

  it('asks for no read back after cells alone, or a person edit that did not land', async () => {
    const { saves, put, peopleSaved } = rig();

    server();
    put(1, set('2026-11-23', '12:00', '00:00'));
    await quiet();

    call.mockRejectedValueOnce(new HttpError(503, 'Later.'));
    put(1, moveTo(1));
    await quiet();

    expect(saves.queueFor(1).state()).toBe('failed');
    expect(peopleSaved).toEqual([]);

    saves.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(peopleSaved).toEqual([1]);
  });
});
