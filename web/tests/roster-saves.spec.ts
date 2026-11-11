import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError, api } from '@/lib/api/http';
import { Roster, RosterPerson, RosterShift } from '@/lib/api/roster';
import { RosterEdit, editKey } from '@/lib/roster/edits';
import { RosterRefusal, createRosterSaves, watchLeaving } from '@/lib/roster/saves';
import { SaveState } from '@/lib/roster/save-queue';

vi.mock('@/lib/api/http', async (original) => ({
  ...(await original<typeof import('@/lib/api/http')>()),
  api: vi.fn(),
}));

const call = vi.mocked(api);

const person = (id: number, name: string): RosterPerson => ({ id, name, position: null, colour: '#6366f1' });

const roster = (id: number, people: RosterPerson[]): Roster => ({ id, title: 'Бар', share_slug: null, people });

const cell = (personId: number, date: string): RosterEdit => ({
  kind: 'set',
  shift: { person_id: personId, date, start_time: '11:00', end_time: '22:00' } satisfies RosterShift,
});

/** The saves with everything they report kept for the test to read. */
function rig() {
  const refusals: RosterRefusal[] = [];
  const reported: [SaveState, string | null][] = [];

  const saves = createRosterSaves({
    onChange: (state, failure) => reported.push([state, failure]),
    onRefused: (refusal) => refusals.push(refusal),
  });

  const put = (rosterId: number, ...edits: RosterEdit[]) => {
    for (const edit of edits) saves.queueFor(rosterId).put(editKey(edit), edit);
  };

  return { saves, refusals, reported, put };
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
    expect(refusals).toEqual([{ error: gone, went: [1], kept: 3 }]);
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
    expect(refusals).toEqual([{ error: gone, went: [], kept: 0 }]);
    expect(saves.queueFor(1).pending()).toEqual([]);
  });

  it('lets the batch go when the whole roster has gone', async () => {
    const { saves, put, refusals } = rig();

    refusedOnce(null);
    put(1, cell(1, '2026-11-02'));
    await quiet();

    expect(saved()).toHaveLength(1);
    expect(refusals).toEqual([{ error: gone, went: [], kept: 0 }]);
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
    expect(refusals).toEqual([{ error: bad, went: [], kept: 0 }]);
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
