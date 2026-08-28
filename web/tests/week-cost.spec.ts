import { describe, expect, it } from 'vitest';

import { RotaEntry, RotaMember } from '@/lib/api/team';
import { costIsLegible, weekCost } from '@/lib/calendar/week-cost';

const entry = (
  member_id: number,
  date: string,
  hours: number,
  pay: number | null,
): RotaEntry =>
  ({
    day_shift_id: member_id * 100 + Number(date.slice(-2)),
    member_id,
    date,
    shift_name: 'Смена',
    hours,
    pay,
    start_time: '10:00',
    end_time: '18:00',
    worked: false,
    needs_cover: false,
    is_mine: false,
    offers: [],
  }) as unknown as RotaEntry;

const member = (member_id: number, shares_earnings: boolean): RotaMember =>
  ({ member_id, display_name: `#${member_id}`, shares_earnings }) as unknown as RotaMember;

describe('what a week of rota costs', () => {
  it('adds up only the pay it was actually told', () => {
    const cost = weekCost(
      [
        entry(1, '2026-03-02', 8, 1_200),
        entry(1, '2026-03-03', 8, 1_200),
        entry(2, '2026-03-02', 10, null),
      ],
      [member(1, true), member(2, false)],
    );

    expect(cost.covered).toBe(2_400);
    expect(cost.coveredHours).toBe(16);
    // The ten hours nobody shared a rate for are reported, not absorbed.
    expect(cost.uncoveredHours).toBe(10);
    expect(cost.perHour).toBe(150);
  });

  it('never guesses the part it was not told', () => {
    // The tempting move is covered/coveredHours × uncoveredHours, printed as a
    // total. That number is a rumour about somebody's wage, and nothing here
    // returns it — there is no total field to misread.
    const cost = weekCost(
      [entry(1, '2026-03-02', 8, 800), entry(2, '2026-03-02', 8, null)],
      [member(1, true), member(2, false)],
    );

    expect(Object.keys(cost)).not.toContain('total');
    expect(cost.covered).toBe(800);
  });

  it('counts sharers among the people on this rota, not the whole team', () => {
    // A crew of twenty where four are rostered and all four share is fully
    // covered. Counting against the team roll would print "4 of 20" over a
    // figure that is complete.
    const cost = weekCost(
      [entry(1, '2026-03-02', 8, 800), entry(2, '2026-03-02', 8, 800)],
      [member(1, true), member(2, true), member(3, true), member(4, false)],
    );

    expect(cost.people).toBe(2);
    expect(cost.sharing).toBe(2);
  });

  it('breaks the week down by day so the expensive one shows', () => {
    const cost = weekCost(
      [
        entry(1, '2026-03-02', 8, 800),
        entry(1, '2026-03-07', 12, 2_000),
        entry(2, '2026-03-07', 12, null),
      ],
      [member(1, true), member(2, false)],
    );

    expect(cost.byDay).toEqual([
      { date: '2026-03-02', covered: 800, uncoveredHours: 0 },
      { date: '2026-03-07', covered: 2_000, uncoveredHours: 12 },
    ]);
  });

  it('has no rate to report where nobody shared one', () => {
    const cost = weekCost([entry(1, '2026-03-02', 8, null)], [member(1, false)]);

    expect(cost.perHour).toBeNull();
    expect(cost.covered).toBe(0);
  });
});

describe('whether the figure is worth showing', () => {
  it('stays quiet when most of the crew has not shared', () => {
    // Two people out of nine is not a wage bill, it is two people's wages,
    // and a heading saying "what the week costs" would be read as the former.
    const cost = weekCost(
      [
        entry(1, '2026-03-02', 8, 800),
        entry(2, '2026-03-02', 8, 800),
        ...[3, 4, 5, 6, 7, 8, 9].map((id) => entry(id, '2026-03-02', 8, null)),
      ],
      [1, 2].map((id) => member(id, true)).concat([3, 4, 5, 6, 7, 8, 9].map((id) => member(id, false))),
    );

    expect(costIsLegible(cost)).toBe(false);
  });

  it('speaks once half the rostered crew shares', () => {
    const cost = weekCost(
      [entry(1, '2026-03-02', 8, 800), entry(2, '2026-03-02', 8, null)],
      [member(1, true), member(2, false)],
    );

    expect(costIsLegible(cost)).toBe(true);
  });

  it('says nothing about an empty rota', () => {
    expect(costIsLegible(weekCost([], []))).toBe(false);
  });
});
