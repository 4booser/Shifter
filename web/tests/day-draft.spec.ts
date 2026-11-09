import { describe, expect, it } from 'vitest';

import { baselineAfterAnswer, cashWithin, closeOverruled, replayEdits, saveStateOf, withoutEchoes } from '@/lib/calendar/day-draft';
import { DaySave } from '@/lib/calendar/models';

describe('baselineAfterAnswer', () => {
  it('takes the answer in when nothing was typed since the send', () => {
    expect(baselineAfterAnswer('sent', 'sent', 'answered')).toBe('answered');
  });

  it('keeps the old baseline when something was typed during the save, so it stays dirty and goes out', () => {
    const next = baselineAfterAnswer('tips 100', 'tips 150', 'tips 150 on version 2');

    expect(next).toBe('tips 100');
    expect('tips 150 on version 2' !== next).toBe(true);
  });

  it('starts from whatever is there on first look', () => {
    expect(baselineAfterAnswer(null, 'draft', 'draft')).toBe('draft');
  });

  it('lets a close from the server in without calling the panel dirty', () => {
    // Same version, new content: nobody typed, so the panel must not send it back.
    expect(baselineAfterAnswer('planned', 'planned', 'closed')).toBe('closed');
  });
});

describe('closeOverruled', () => {
  const planned = { shift_id: 1, actual_start: null, actual_end: null, auto_closed: false };
  const closed = { shift_id: 1, actual_start: '13:00', actual_end: '23:00', auto_closed: true };

  it('catches an end typed just after a close nobody here had heard of', () => {
    expect(closeOverruled([planned], [closed], {}, { 1: '23:10' })).toBe(true);
  });

  it('catches a start the same way', () => {
    expect(closeOverruled([planned], [closed], { 1: '12:50' }, {})).toBe(true);
  });

  it('has nothing to say where the edit was said back', () => {
    expect(closeOverruled([planned], [closed], { 1: '13:00' }, { 1: '23:00' })).toBe(false);
  });

  it('has nothing to say with no edit at all: the close simply flows in', () => {
    expect(closeOverruled([planned], [closed], {}, {})).toBe(false);
  });

  it('reads a close already heard of as old news, whatever is being typed over it', () => {
    expect(closeOverruled([closed], [closed], {}, { 1: '23:10' })).toBe(false);
  });

  it('counts a close arriving with the day itself', () => {
    expect(closeOverruled(undefined, [closed], {}, { 1: '23:10' })).toBe(true);
  });

  it('keeps the baseline, so the panel stays dirty and the edit goes out with the echo', () => {
    expect(baselineAfterAnswer('sent', 'sent', 'answered', true)).toBe('sent');
    expect(baselineAfterAnswer('sent', 'sent', 'answered', false)).toBe('answered');
  });
});

describe('cashWithin', () => {
  it('holds the cash part inside a total retyped lower', () => {
    expect(cashWithin(300, 400)).toBe(300);
  });

  it('leaves a cash part that fits', () => {
    expect(cashWithin(1500, 400)).toBe(400);
  });

  it('takes it to nothing with the total gone, which the server accepts', () => {
    expect(cashWithin(null, 400)).toBe(0);
  });

  it('leaves no cash part as none', () => {
    expect(cashWithin(300, null)).toBeNull();
    expect(cashWithin(null, null)).toBeNull();
  });
});

describe('withoutEchoes', () => {
  const server = new Map<number, boolean>([[1, true], [2, false]]);

  it('drops what the server has said back', () => {
    expect(withoutEchoes({ 1: true }, (id) => server.get(id))).toEqual({});
  });

  it('keeps what it has not', () => {
    expect(withoutEchoes({ 2: true }, (id) => server.get(id))).toEqual({ 2: true });
  });

  it('drops an edit on something no longer on the day', () => {
    expect(withoutEchoes({ 9: true }, (id) => server.get(id))).toEqual({});
  });

  it('counts a null said back as an echo: "back to the plan" is an answer', () => {
    expect(withoutEchoes<string | null>({ 1: null }, () => null)).toEqual({});
  });

  it('hands back the same object when nothing changed, so state does not churn', () => {
    const edits = { 2: true };

    expect(withoutEchoes(edits, (id) => server.get(id))).toBe(edits);
  });
});

describe('saveStateOf', () => {
  it('reads saved with nothing outstanding', () => {
    expect(saveStateOf(undefined, false)).toBe('saved');
  });

  it('calls the wait before the send saving too', () => {
    expect(saveStateOf(undefined, true)).toBe('saving');
  });

  it('says saving while a save is out', () => {
    expect(saveStateOf('saving', false)).toBe('saving');
  });

  it('says so when it failed, and when it waits for the network', () => {
    expect(saveStateOf('failed', false)).toBe('failed');
    expect(saveStateOf('queued', false)).toBe('queued');
  });

  it('lets a fresh edit past an old failure', () => {
    expect(saveStateOf('failed', true)).toBe('saving');
  });
});

describe('replayEdits', () => {
  const row = (over: Partial<DaySave['shifts'][number]> = {}): DaySave['shifts'][number] => ({
    shift_id: 1,
    worked: false,
    needs_cover: false,
    actual_start: null,
    actual_end: null,
    break_minutes: 30,
    auto_closed: false,
    ...over,
  });

  const payload = (over: Partial<DaySave> = {}): DaySave => ({
    shifts: [row()],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_pool: null,
    deductions: null,
    note: null,
    colour: null,
    ...over,
  });

  it('puts only what changed over the day as it stands, so what came meanwhile survives', () => {
    const { day, contested } = replayEdits(
      payload({ tips: 100 }),
      payload(),
      payload({ note: 'from the phone', shifts: [row({ worked: true, auto_closed: true, actual_end: '22:00' })] }),
    );

    expect(contested).toBe(false);
    expect(day).toMatchObject({ tips: 100, note: 'from the phone' });
    expect(day.shifts[0]).toMatchObject({ worked: true, auto_closed: true, actual_end: '22:00' });
  });

  it('calls it contested when both sides changed one thing, and keeps the edit for the person to weigh', () => {
    const { day, contested } = replayEdits(payload({ tips: 100, note: 'mine' }), payload(), payload({ tips: 1500 }));

    expect(contested).toBe(true);
    expect(day).toMatchObject({ tips: 100, note: 'mine' });
  });

  it('is no contest where both sides arrived at the same thing', () => {
    expect(replayEdits(payload({ tips: 100 }), payload(), payload({ tips: 100 })).contested).toBe(false);
  });

  it('leaves off a shift removed meanwhile, even one the edit touched', () => {
    const untouched = replayEdits(payload({ tips: 100 }), payload(), payload({ shifts: [] }));
    const touched = replayEdits(payload({ shifts: [row({ revenue: 900 })] }), payload(), payload({ shifts: [] }));

    expect(untouched.day.shifts).toEqual([]);
    expect(touched.day.shifts).toEqual([]);
  });

  it('keeps a shift the edit took off, and one it put on', () => {
    const second = row({ shift_id: 2 });

    expect(replayEdits(payload({ shifts: [] }), payload(), payload()).day.shifts).toEqual([]);
    expect(replayEdits(payload({ shifts: [row(), second] }), payload(), payload()).day.shifts).toHaveLength(2);
  });

  it('leaves alone what a discard or a request for cover said meanwhile', () => {
    const { day } = replayEdits(
      payload({ tips: 100 }),
      payload(),
      payload({ shifts: [row({ needs_cover: true, auto_closed: true })] }),
    );

    expect(day.shifts[0]).toMatchObject({ needs_cover: true, auto_closed: true });
  });

  it('reads a stamp left out as unstamped, so an edit that wrote it down does not take a close back off', () => {
    const { auto_closed: _left, ...read } = row();
    const { day, contested } = replayEdits(
      payload(),
      payload({ shifts: [read] }),
      payload({ shifts: [row({ auto_closed: true, worked: true })] }),
    );

    expect(contested).toBe(false);
    expect(day.shifts[0]).toMatchObject({ worked: true, auto_closed: true });
  });

  it('counts a fine of nothing and no fine as the same, which is how a draft and a read write them', () => {
    const { day, contested } = replayEdits(
      payload({ deductions: 100 }),
      payload({ deductions: null }),
      payload({ deductions: 0, note: 'from the phone' }),
    );

    expect(contested).toBe(false);
    expect(day).toMatchObject({ deductions: 100, note: 'from the phone' });
  });

  it('reads sales whatever order they came in, the server keeping none', () => {
    const one = { sales_id: 1, quantity: 2 };
    const two = { sales_id: 2, quantity: 3 };
    const { day, contested } = replayEdits(
      payload({ sales: [one, { ...two, quantity: 4 }] }),
      payload({ sales: [one, two] }),
      payload({ sales: [two, one] }),
    );

    expect(contested).toBe(false);
    expect(day.sales).toEqual([one, { ...two, quantity: 4 }]);
  });

  it('holds a cash part inside a total that dropped meanwhile', () => {
    const { day } = replayEdits(
      payload({ tips: 1000, tips_cash: 800 }),
      payload({ tips: 1000 }),
      payload({ tips: 500 }),
    );

    expect(day.tips_cash).toBe(500);
  });
});
