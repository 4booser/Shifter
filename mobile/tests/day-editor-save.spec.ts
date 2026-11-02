import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adoptAnswer,
  adoptBoxes,
  afterFailure,
  createDaySaver,
  dayBoxes,
  dayDraft,
  fingerprint,
  putOn,
  QUIET_BEFORE_SAVE,
  SaveState,
} from '@/lib/day-saver';
import type { DayTyped } from '@/lib/day-saver';
import { hearDay, inTurn, tellDay } from '@/lib/day-writes';
import { CalendarDayData, DaySave, DayShiftEntry, toSavePayload } from '@/lib/types';

/**
 * The day editor keeps its edits on a local copy of the day and saves it
 * through `toSavePayload`. Anything the builder drops is therefore not just
 * lost history — it is the number somebody typed a second ago, gone without
 * an error, which is the worst way for a field to fail.
 */
function edited(): CalendarDayData {
  return {
    date: '2026-08-31',
    tips: null,
    tips_cash: null,
    tip_pool: null,
    deductions: null,
    note: null,
    colour: null,
    earned: 0,
    hours: 0,
    shifts: [
      {
        shift_id: 9,
        worked: true,
        needs_cover: false,
        actual_start: null,
        actual_end: null,
        break_minutes: null,
        revenue: 7300,
        guests: 52,
        zone: 'terrace',
      },
    ],
    sales: [],
  } as unknown as CalendarDayData;
}

describe('what the editor saves', () => {
  it('sends the covers somebody just counted', () => {
    expect(toSavePayload(edited()).shifts[0].guests).toBe(52);
  });

  it('sends the section somebody just picked', () => {
    expect(toSavePayload(edited()).shifts[0].zone).toBe('terrace');
  });

  it('sends the takings somebody just entered', () => {
    expect(toSavePayload(edited()).shifts[0].revenue).toBe(7300);
  });
});

describe('the day draft', () => {
  const typed = {
    quantities: { 3: 2, 4: 0 },
    tips: '12,5',
    tipPool: '',
    deductions: '',
    deductionReason: 'late' as const,
    note: '  тихий вечер ',
  };

  it('reads a decimal comma as a decimal', () => {
    expect(dayDraft(edited(), typed).tips).toBe(12.5);
  });

  it('keeps an empty box empty rather than zero', () => {
    expect(dayDraft(edited(), { ...typed, tips: '' }).tips).toBeNull();
  });

  it('drops a reason with no fine behind it', () => {
    expect(dayDraft(edited(), typed).deduction_reason).toBeNull();
    expect(dayDraft(edited(), { ...typed, deductions: '50' }).deduction_reason).toBe('late');
  });

  it('counts only what was sold and trims the note', () => {
    const draft = dayDraft(edited(), typed);

    expect(draft.sales).toEqual([{ sales_id: 3, quantity: 2 }]);
    expect(draft.note).toBe('тихий вечер');
  });

  it('does not let the cash half outgrow a lowered total', () => {
    const day = { ...edited(), tips: 600, tips_cash: 500 };

    expect(dayDraft(day, { ...typed, tips: '200' }).tips_cash).toBe(200);
  });
});

describe('what counts as a change', () => {
  const draft = () => toSavePayload(edited());

  it('sees what somebody typed', () => {
    expect(fingerprint({ ...draft(), tips: 100 })).not.toBe(fingerprint(draft()));
  });

  it('does not see what only the server fills in', () => {
    const filled = draft();

    filled.version = 9;
    filled.tips_cash = 0;
    filled.shifts[0] = { ...filled.shifts[0], break_minutes: 30, auto_closed: true };

    expect(fingerprint(filled)).toBe(fingerprint(draft()));
  });
});

describe('a draft a save could not deliver', () => {
  it('is left for whoever is looking at it to retry', () => {
    expect(afterFailure(new Error('нет сети'), true)).toBe('retry');
  });

  it('is held when nobody is, offline', () => {
    expect(afterFailure(new Error('нет сети'), false)).toBe('hold');
  });

  it('is held when nobody is and the server fell over', () => {
    expect(afterFailure({ status: 503 }, false)).toBe('hold');
  });

  it('is not held when the server said no, which it would say again', () => {
    expect(afterFailure({ status: 400 }, false)).toBe('refused');
  });
});

describe('this phone’s writes to one day', () => {
  /** A write that finishes when told to. */
  const gate = <T,>() => {
    let open!: (value: T) => void;
    let shut!: (why: unknown) => void;
    const opened = new Promise<T>((resolve, reject) => {
      open = resolve;
      shut = reject;
    });

    return { opened, open, shut };
  };

  it('runs one at a time, in the order they came', async () => {
    const order: string[] = [];
    const first = gate<void>();

    const one = inTurn('2026-11-02', async () => {
      order.push('save starts');
      await first.opened;
      order.push('save lands');
    });
    const two = inTurn('2026-11-02', async () => {
      order.push('clock writes');
    });

    await vi.waitFor(() => expect(order).toEqual(['save starts']));

    first.open();
    await Promise.all([one, two]);

    expect(order).toEqual(['save starts', 'save lands', 'clock writes']);
  });

  it('is not held up by a write that failed', async () => {
    const failing = inTurn('2026-11-02', async () => {
      throw new Error('нет сети');
    });
    const next = inTurn('2026-11-02', async () => 'записано');

    await expect(failing).rejects.toThrow('нет сети');
    await expect(next).resolves.toBe('записано');
  });

  it('keeps dates apart', async () => {
    const stuck = gate<void>();

    void inTurn('2026-11-02', () => stuck.opened);

    await expect(inTurn('2026-11-03', async () => 'записано')).resolves.toBe('записано');

    stuck.open();
  });

  it('tells whoever has the date open, and only them', () => {
    const told: (number | undefined)[] = [];
    const stop = hearDay('2026-11-02', (answer) => told.push(answer.version));

    tellDay('2026-11-02', { ...edited(), version: 6 });
    tellDay('2026-11-03', { ...edited(), version: 9 });
    stop();
    tellDay('2026-11-02', { ...edited(), version: 7 });

    expect(told).toEqual([6]);
  });
});

describe('folding an answer into the screen', () => {
  const answer = (over: Partial<DayShiftEntry> = {}): CalendarDayData =>
    ({
      ...edited(),
      version: 8,
      earned: 900,
      planned: 0,
      hours: 8,
      shifts: [{ ...edited().shifts[0], earned: 900, hours: 8, ...over }],
    }) as CalendarDayData;

  it('takes the money, the hours and the version', () => {
    const shown = adoptAnswer(edited(), toSavePayload(edited()), answer());

    expect(shown.version).toBe(8);
    expect(shown.earned).toBe(900);
    expect(shown.hours).toBe(8);
    expect(shown.shifts[0].earned).toBe(900);
  });

  it('keeps what was typed while the save was out', () => {
    const sent = toSavePayload(edited());
    const typing = edited();

    typing.shifts[0] = { ...typing.shifts[0], revenue: 8100 };

    expect(adoptAnswer(typing, sent, answer()).shifts[0].revenue).toBe(8100);
  });

  it('lets a close from the server through to a field nobody touched', () => {
    const planned = edited();

    planned.shifts[0] = { ...planned.shifts[0], worked: false };

    const shown = adoptAnswer(
      planned,
      toSavePayload(planned),
      answer({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '22:00' }),
    );

    expect(shown.shifts[0].worked).toBe(true);
    expect(shown.shifts[0].auto_closed).toBe(true);
    expect(shown.shifts[0].actual_end).toBe('22:00');
  });

  it('keeps a shift put on the day after that save left', () => {
    const added = edited();

    added.shifts.push({ ...added.shifts[0], shift_id: 12 });

    expect(adoptAnswer(added, toSavePayload(edited()), answer()).shifts).toHaveLength(2);
  });

  it('does not bring back a shift taken off after that save left', () => {
    const removed = { ...edited(), shifts: [] };

    expect(adoptAnswer(removed, toSavePayload(edited()), answer()).shifts).toEqual([]);
  });

  it('takes a shift the answer brought that neither side here has heard of', () => {
    const brought = answer();

    brought.shifts = [...brought.shifts, { ...brought.shifts[0], shift_id: 12, earned: 300 }];

    const shown = adoptAnswer(edited(), toSavePayload(edited()), brought);

    expect(shown.shifts.map((row) => row.shift_id)).toEqual([9, 12]);
    expect(shown.shifts[1].earned).toBe(300);
  });

  it('lets a shift go when the answer lacks it and nobody here touched it', () => {
    const shown = adoptAnswer(edited(), toSavePayload(edited()), { ...answer(), shifts: [] });

    expect(shown.shifts).toEqual([]);
  });

  it('keeps a shift the answer lacks where somebody has been at it since', () => {
    // The other side took it off, this side is typing on it: the next save
    // puts it back, and that is the later word.
    const typing = edited();

    typing.shifts[0] = { ...typing.shifts[0], revenue: 8100 };

    const shown = adoptAnswer(typing, toSavePayload(edited()), { ...answer(), shifts: [] });

    expect(shown.shifts).toHaveLength(1);
    expect(shown.shifts[0].revenue).toBe(8100);
  });
});

describe('a row put on this screen and brought back by the answer', () => {
  const blank = { ...edited().shifts[0], worked: false, revenue: null, guests: null, zone: 'unset' as const };
  const bare = { ...edited(), shifts: [] };
  const known = toSavePayload(bare);
  const added = () => putOn(blank);
  const brought = (over: Partial<DayShiftEntry> = {}) =>
    ({ ...bare, version: 8, earned: 800, shifts: [{ ...blank, earned: 800, ...over }] }) as CalendarDayData;

  it('keeps what was typed on it, and takes the server’s figures', () => {
    const row = { ...added(), revenue: 7300 };
    const [shown] = adoptAnswer({ ...bare, shifts: [row] }, known, brought()).shifts;

    expect(shown.revenue).toBe(7300);
    expect(shown.earned).toBe(800);
  });

  it('takes what the answer says about whatever was not typed on it', () => {
    const [shown] = adoptAnswer(
      { ...bare, shifts: [added()] },
      known,
      brought({ worked: true, actual_end: '20:00', revenue: 500 }),
    ).shifts;

    expect(shown).toMatchObject({ worked: true, actual_end: '20:00', revenue: 500 });
  });

  it('still knows what it started as on the next answer, if that save has not landed', () => {
    const row = { ...added(), revenue: 7300 };
    const once = adoptAnswer({ ...bare, shifts: [row] }, known, brought());
    const twice = adoptAnswer(once, known, brought());

    expect(twice.shifts[0].revenue).toBe(7300);
  });

  it('lets go of that once the row is known, and goes by what was sent', () => {
    const row = { ...added(), revenue: 7300 };
    const sent = toSavePayload({ ...bare, shifts: [row] });
    const [shown] = adoptAnswer({ ...bare, shifts: [row] }, sent, brought({ revenue: 7300 })).shifts;

    expect(shown.placedAs).toBeUndefined();
  });

  it('never goes out with the row', () => {
    expect(toSavePayload({ ...bare, shifts: [added()] }).shifts[0]).not.toHaveProperty('placedAs');
  });
});

describe('folding an answer into the boxes', () => {
  const boxes = (over: Partial<DayTyped> = {}): DayTyped => ({ ...dayBoxes(edited()), ...over });
  const known = (typed = boxes()) => dayDraft(edited(), typed);
  const said = (over: Partial<CalendarDayData> = {}): CalendarDayData => ({ ...edited(), ...over });

  it('fills an empty box with what landed under it', () => {
    expect(adoptBoxes(boxes(), known(), said({ tips: 1500 })).tips).toBe('1500');
  });

  it('fills every box the same way', () => {
    const filled = adoptBoxes(
      boxes(),
      known(),
      said({
        tip_pool: 900,
        deductions: 100,
        deduction_reason: 'late',
        note: 'с ноута',
        sales: [{ sales_id: 3, quantity: 2 }],
      }),
    );

    expect(filled).toMatchObject({
      tipPool: '900',
      deductions: '100',
      deductionReason: 'late',
      note: 'с ноута',
      quantities: { 3: 2 },
    });
  });

  it('leaves what was typed since', () => {
    const typing = boxes({ tips: '20' });

    expect(adoptBoxes(typing, known(), said({ tips: 1500 })).tips).toBe('20');
  });

  it('leaves a box as typed where the server only repeats what was sent', () => {
    // Rewritten from the answer, the box would change under somebody's thumb.
    const typing = boxes({ tips: '12,5', note: 'тихо ' });

    expect(adoptBoxes(typing, known(typing), said({ tips: 12.5, note: 'тихо' }))).toEqual(typing);
  });

  it('sees no news in the two ways of saying no fine, or in the order of the sales', () => {
    const counted = boxes({ quantities: { 1: 2, 2: 1 } });
    const answer = said({
      deductions: 0,
      sales: [
        { sales_id: 2, quantity: 1 },
        { sales_id: 1, quantity: 2 },
      ],
    });

    expect(adoptBoxes(counted, known(counted), answer)).toEqual(counted);
  });

  it('does not empty a typed nought', () => {
    // The server reads a fine of 0 back as no fine, which is no news, and the
    // box going blank would take the nought out from under a typed "0,5".
    const typing = boxes({ deductions: '0' });

    expect(adoptBoxes(typing, known(typing), said({ deductions: 0 })).deductions).toBe('0');
  });

  it('does not take a place’s meal money for a fine', () => {
    // The total has it in once the shift counts as worked. Taken into the box
    // it would be saved back as a fine, and charged twice.
    const planned = dayDraft({ ...edited(), shifts: [{ ...edited().shifts[0], worked: false }] }, boxes());

    expect(adoptBoxes(boxes(), planned, said({ deductions: 50, fine: 0 })).deductions).toBe('');
  });

  it('takes a fine however the worked shifts moved beside it', () => {
    const planned = dayDraft({ ...edited(), shifts: [{ ...edited().shifts[0], worked: false }] }, boxes());

    expect(adoptBoxes(boxes(), planned, said({ deductions: 150, fine: 100 })).deductions).toBe('100');
  });

  it('still takes a fine where the same people worked', () => {
    expect(adoptBoxes(boxes(), known(), said({ deductions: 100 })).deductions).toBe('100');
  });

  it('fills the fine box from the fine, not from the total', () => {
    expect(dayBoxes({ ...edited(), deductions: 130, fine: 50 }).deductions).toBe('50');
    expect(dayBoxes({ ...edited(), deductions: 80, fine: 0 }).deductions).toBe('');
  });
});

describe('saving by itself', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A server that answers when told to, and a screen reduced to the draft it is showing. */
  function rig() {
    const sent: DaySave[] = [];
    const pending: { resolve: (day?: CalendarDayData) => void; reject: (why: unknown) => void }[] = [];
    const states: SaveState[] = [];
    const conflicts: DaySave[] = [];
    const failures: unknown[] = [];
    const handed: { payload: DaySave; known: DaySave }[] = [];
    const owns: boolean[] = [];
    let current = { ...toSavePayload(edited()), version: 5 };

    const saver = createDaySaver({
      send: (payload) => {
        sent.push(payload);

        return new Promise((resolve, reject) => pending.push({ resolve, reject }));
      },
      adopt: (answer, _known, own) => {
        owns.push(own);

        return { ...current, version: answer.version };
      },
      onState: (state) => states.push(state),
      onConflict: (payload) => conflicts.push(payload),
      onFailed: (caught, payload, known) => {
        failures.push(caught);
        handed.push({ payload, known });
      },
    });

    const type = (tips: number) => {
      current = { ...current, tips };
      saver.edit(current);
    };
    const land = async (version: number) => {
      pending.shift()!.resolve({ ...edited(), version });
      await vi.advanceTimersByTimeAsync(0);
    };

    saver.edit(current);

    return { saver, sent, pending, states, conflicts, failures, handed, owns, type, land };
  }

  it('sends nothing for the day as it loaded', async () => {
    const { sent } = rig();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(sent).toHaveLength(0);
  });

  it('waits half a second after the last keystroke, not four', async () => {
    const { sent, type } = rig();

    expect(QUIET_BEFORE_SAVE).toBe(500);

    type(1);
    await vi.advanceTimersByTimeAsync(400);
    type(12);
    await vi.advanceTimersByTimeAsync(400);

    expect(sent).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(100);

    expect(sent).toHaveLength(1);
    expect(sent[0].tips).toBe(12);
  });

  it('sends the second edit with the version the first came back with', async () => {
    const { sent, type, land } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);
    await land(6);

    type(200);
    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toHaveLength(2);
    expect(sent[0].version).toBe(5);
    expect(sent[1].version).toBe(6);
    expect(sent[1].tips).toBe(200);
  });

  it('is not stuck after a save lands', async () => {
    // The screen used to stay busy for good after its first save, so nothing
    // after it was ever sent.
    const { sent, states, type, land } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);
    await land(6);

    expect(states.at(-1)).toBe('saved');

    type(200);
    await vi.advanceTimersByTimeAsync(500);
    await land(7);

    type(300);
    await vi.advanceTimersByTimeAsync(500);

    expect(sent.map((payload) => payload.tips)).toEqual([100, 200, 300]);
  });

  it('never has two saves out at once, and loses nothing typed during one', async () => {
    const { sent, type, land } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);

    type(150);
    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toHaveLength(1);

    await land(6);

    expect(sent).toHaveLength(2);
    expect(sent[1].tips).toBe(150);
    expect(sent[1].version).toBe(6);
  });

  it('saves once more if something was typed just before one landed', async () => {
    const { sent, type, land } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);
    type(150);
    await land(6);

    expect(sent).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toHaveLength(2);
    expect(sent[1].tips).toBe(150);
  });

  it('goes straight out when a box loses focus', async () => {
    const { saver, sent, type } = rig();

    type(100);
    void saver.flush();

    expect(sent).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toHaveLength(1);
  });

  it('flushes when the screen closes', async () => {
    const { saver, sent, type, land } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(100);
    void saver.flush();

    expect(sent).toHaveLength(1);
    expect(sent[0].tips).toBe(100);

    await land(6);

    expect(saver.clean()).toBe(true);
  });

  it('flushes what is left when the screen closes during a save', async () => {
    const { saver, sent, type, land } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);
    type(150);

    const closing = saver.flush();

    await land(6);

    expect(sent).toHaveLength(2);
    expect(sent[1].version).toBe(6);

    await land(7);
    await closing;

    expect(saver.clean()).toBe(true);
  });

  it('says what it is doing', async () => {
    const { states, type, land } = rig();

    type(100);
    expect(states.at(-1)).toBe('waiting');

    await vi.advanceTimersByTimeAsync(500);
    expect(states.at(-1)).toBe('saving');

    await land(6);
    expect(states.at(-1)).toBe('saved');
  });

  it('owns up to a failure and tries again when asked', async () => {
    const { saver, pending, sent, states, failures, type } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);

    pending.shift()!.reject(new Error('нет сети'));
    await vi.advanceTimersByTimeAsync(0);

    expect(states.at(-1)).toBe('failed');
    expect(failures).toHaveLength(1);
    expect(saver.clean()).toBe(false);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(sent).toHaveLength(1);

    void saver.flush();
    expect(sent).toHaveLength(2);
    expect(sent[1].version).toBe(5);
  });

  it('hands over the newest draft when a save fails with more typed behind it', async () => {
    // The screen closed during a hanging save of 15, with 1500 typed by then.
    // Nothing is left to show that second number if the failure loses it.
    const { saver, pending, handed, type } = rig();

    type(15);
    await vi.advanceTimersByTimeAsync(500);
    type(1500);
    void saver.flush();

    pending.shift()!.reject(new Error('нет сети'));
    await vi.advanceTimersByTimeAsync(0);

    expect(handed).toHaveLength(1);
    expect(handed[0].payload.tips).toBe(1500);
    expect(handed[0].payload.version).toBe(5);
    expect(handed[0].known.tips).toBeNull();
  });

  it('stops at a conflict until somebody decides', async () => {
    const { saver, pending, sent, states, conflicts, type } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);

    pending.shift()!.reject({ status: 409 });
    await vi.advanceTimersByTimeAsync(0);

    expect(states.at(-1)).toBe('conflict');
    expect(conflicts[0].tips).toBe(100);

    type(200);
    await vi.advanceTimersByTimeAsync(5_000);
    await saver.flush();

    expect(sent).toHaveLength(1);

    saver.overrule(9);
    void saver.flush();

    expect(sent).toHaveLength(2);
    expect(sent[1].version).toBe(9);
    expect(sent[1].tips).toBe(200);
  });

  it('sends nothing more once the other version was kept', async () => {
    const { saver, pending, sent, type } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);

    pending.shift()!.reject({ status: 409 });
    await vi.advanceTimersByTimeAsync(0);

    saver.abandon();
    await saver.flush();

    expect(sent).toHaveLength(1);
  });

  it('hears a close that moved no version', async () => {
    const { saver, states } = rig();

    saver.overhear({ ...edited(), version: 5 });

    expect(states.at(-1)).toBe('clean');
    expect(saver.clean()).toBe(true);
  });

  it('takes this phone’s own write, but not somebody else’s edit', async () => {
    const { saver, sent, type } = rig();

    saver.overhear({ ...edited(), version: 7 }, true);
    type(100);
    await vi.advanceTimersByTimeAsync(500);

    // Two ahead is not this phone: the save has to run into it and ask.
    expect(sent[0].version).toBe(5);
  });

  it('has nothing to say about a clock write the screen was told about', async () => {
    // A chosen-hour start moved the day to 6 under an open screen: the tips
    // typed after it go at 6, with no alert about another device.
    const { saver, sent, conflicts, type, land } = rig();

    saver.overhear({ ...edited(), version: 6 }, true);
    type(100);
    await vi.advanceTimersByTimeAsync(500);
    await land(7);

    expect(sent[0].version).toBe(6);
    expect(conflicts).toEqual([]);
  });

  it('says which answers are its own, so the boxes only hear the others', async () => {
    const { saver, owns, type, land } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);
    saver.overhear({ ...edited(), version: 7 }, true);
    await land(6);
    saver.overhear({ ...edited(), version: 8 }, true);

    expect(owns).toEqual([true, false, false]);
  });

  it('holds a clock write answered during a save until that save has landed', async () => {
    const { saver, sent, conflicts, type, land } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);

    // The save reached the server first, so the clock wrote over it.
    saver.overhear({ ...edited(), version: 7 }, true);
    await land(6);

    type(200);
    await vi.advanceTimersByTimeAsync(500);

    expect(sent[1].version).toBe(7);
    expect(conflicts).toEqual([]);
  });

  it('sends the draft again when a clock write of its own took the version', async () => {
    const { saver, pending, sent, conflicts, states, type } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);

    saver.overhear({ ...edited(), version: 6 }, true);
    pending.shift()!.reject({ status: 409 });
    await vi.advanceTimersByTimeAsync(0);

    expect(conflicts).toEqual([]);
    expect(states.at(-1)).toBe('saving');
    expect(sent).toHaveLength(2);
    expect(sent[1].version).toBe(6);
    expect(sent[1].tips).toBe(100);
  });

  it('still calls it a conflict when the version moved by somebody else', async () => {
    const { saver, pending, conflicts, type } = rig();

    type(100);
    await vi.advanceTimersByTimeAsync(500);

    // Another device took 6, so the clock wrote 7 on top of an edit this
    // screen has never seen.
    saver.overhear({ ...edited(), version: 7 }, true);
    pending.shift()!.reject({ status: 409 });
    await vi.advanceTimersByTimeAsync(0);

    expect(conflicts).toHaveLength(1);
  });

  it('takes the next version from a write of its own', async () => {
    const { saver, sent, type } = rig();

    saver.overhear({ ...edited(), version: 6 }, true);
    type(100);
    await vi.advanceTimersByTimeAsync(500);

    expect(sent[0].version).toBe(6);
  });
});
