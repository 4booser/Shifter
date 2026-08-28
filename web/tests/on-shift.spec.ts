import { describe, expect, it } from 'vitest';

import { RotaEntry } from '@/lib/api/team';
import { onShiftNow, spell, tightTurnarounds } from '@/lib/calendar/on-shift';

const entry = (over: Partial<RotaEntry>): RotaEntry =>
  ({
    day_shift_id: Math.floor(Math.random() * 1e6),
    member_id: 1,
    date: '2026-08-28',
    shift_name: 'Вечер',
    symbol: null,
    colour: null,
    member_colour: '#7C5CFF',
    start_time: '16:00',
    end_time: '02:00',
    hours: 10,
    worked: false,
    needs_cover: false,
    is_mine: false,
    visibility: null,
    pay: null,
    offers: [],
    ...over,
  }) as RotaEntry;

const at = (hour: number, minute = 0) => hour * 60 + minute;

describe('who is on right now', () => {
  it('has somebody on the floor mid-shift', () => {
    const evening = entry({ start_time: '16:00', end_time: '02:00' });

    const now = onShiftNow([evening], '2026-08-28', at(20));

    expect(now.on).toHaveLength(1);
    expect(now.on[0].minutes).toBe(240);
    expect(now.soon).toHaveLength(0);
  });

  it('counts a close that started yesterday as still on at two in the morning', () => {
    // The case a group chat gets wrong. Somebody who came in at four on the
    // 27th is very much at work at one on the 28th.
    const yesterday = entry({ date: '2026-08-27', start_time: '16:00', end_time: '02:00' });

    const now = onShiftNow([yesterday], '2026-08-28', at(1));

    expect(now.on).toHaveLength(1);
    expect(now.on[0].minutes).toBe(9 * 60);
  });

  it('leaves out yesterday once it has actually ended', () => {
    const yesterday = entry({ date: '2026-08-27', start_time: '10:00', end_time: '18:00' });

    expect(onShiftNow([yesterday], '2026-08-28', at(9)).on).toHaveLength(0);
    expect(onShiftNow([yesterday], '2026-08-28', at(9)).gone).toHaveLength(0);
  });

  it('says who is coming and when, soonest first', () => {
    const four = entry({ start_time: '16:00' });
    const ten = entry({ start_time: '10:00', end_time: '18:00' });

    const now = onShiftNow([four, ten], '2026-08-28', at(8));

    expect(now.soon.map((row) => row.entry.start_time)).toEqual(['10:00', '16:00']);
    expect(now.soon[0].minutes).toBe(120);
  });

  it('puts the one who has been on longest at the top', () => {
    const early = entry({ start_time: '10:00', end_time: '22:00' });
    const late = entry({ start_time: '18:00', end_time: '02:00' });

    const now = onShiftNow([early, late], '2026-08-28', at(20));

    expect(now.on[0].entry.start_time).toBe('10:00');
  });

  it('knows the difference between finished and not started', () => {
    const morning = entry({ start_time: '08:00', end_time: '14:00' });

    const now = onShiftNow([morning], '2026-08-28', at(16));

    expect(now.gone).toHaveLength(1);
    expect(now.gone[0].minutes).toBe(120);
    expect(now.on).toHaveLength(0);
  });

  it('has nothing to say about an empty rota', () => {
    const now = onShiftNow([], '2026-08-28', at(20));

    expect(now).toEqual({ on: [], soon: [], gone: [] });
  });

  it('is exclusive at the end and inclusive at the start', () => {
    // Somebody whose shift starts at four is on at four and not at 15:59.
    const shift = entry({ start_time: '16:00', end_time: '22:00' });

    expect(onShiftNow([shift], '2026-08-28', at(16)).on).toHaveLength(1);
    expect(onShiftNow([shift], '2026-08-28', at(15, 59)).on).toHaveLength(0);
    expect(onShiftNow([shift], '2026-08-28', at(22)).on).toHaveLength(0);
  });
});

describe('saying it out loud', () => {
  it('splits minutes into hours and minutes', () => {
    expect(spell(130)).toEqual({ hours: 2, minutes: 10 });
    expect(spell(40)).toEqual({ hours: 0, minutes: 40 });
    expect(spell(-90)).toEqual({ hours: 1, minutes: 30 });
  });
});

describe('too little between two shifts', () => {
  const entry = (over: Partial<RotaEntry>): RotaEntry =>
    ({
      day_shift_id: Math.floor(Math.random() * 1e6),
      member_id: 1,
      date: '2026-08-28',
      shift_name: 'Вечер',
      symbol: null,
      colour: null,
      member_colour: '#7C5CFF',
      start_time: '16:00',
      end_time: '02:00',
      hours: 10,
      worked: false,
      needs_cover: false,
      is_mine: false,
      visibility: null,
      pay: null,
      offers: [],
      ...over,
    }) as RotaEntry;

  it('finds a close followed by an open', () => {
    const rota = [
      entry({ date: '2026-08-28', start_time: '16:00', end_time: '02:00' }),
      entry({ date: '2026-08-29', start_time: '09:00', end_time: '17:00' }),
    ];

    const [tight] = tightTurnarounds(rota);

    expect(tight.gap).toBe(7);
    expect(tight.memberId).toBe(1);
  });

  it('says nothing about a proper night between them', () => {
    const rota = [
      entry({ date: '2026-08-28', start_time: '10:00', end_time: '18:00' }),
      entry({ date: '2026-08-29', start_time: '10:00', end_time: '18:00' }),
    ];

    expect(tightTurnarounds(rota)).toEqual([]);
  });

  it('does not compare two different people', () => {
    const rota = [
      entry({ member_id: 1, date: '2026-08-28', end_time: '02:00' }),
      entry({ member_id: 2, date: '2026-08-29', start_time: '09:00', end_time: '17:00' }),
    ];

    expect(tightTurnarounds(rota)).toEqual([]);
  });

  it('takes the threshold it is given', () => {
    const rota = [
      entry({ date: '2026-08-28', start_time: '16:00', end_time: '00:00' }),
      entry({ date: '2026-08-29', start_time: '09:00', end_time: '17:00' }),
    ];

    expect(tightTurnarounds(rota)).toHaveLength(1);
    expect(tightTurnarounds(rota, 8)).toEqual([]);
  });

  it('puts the shortest gap first', () => {
    const rota = [
      entry({ member_id: 1, date: '2026-08-28', start_time: '16:00', end_time: '02:00' }),
      entry({ member_id: 1, date: '2026-08-29', start_time: '09:00', end_time: '17:00' }),
      entry({ member_id: 2, date: '2026-08-28', start_time: '16:00', end_time: '02:00' }),
      entry({ member_id: 2, date: '2026-08-29', start_time: '06:00', end_time: '14:00' }),
    ];

    expect(tightTurnarounds(rota).map((row) => row.gap)).toEqual([4, 7]);
  });
});
