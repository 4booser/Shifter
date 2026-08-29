import { describe, expect, it } from 'vitest';

import { CalendarDayData } from '@/lib/calendar/models';
import { todayKey, shiftDays } from '@/lib/calendar/calendar-date';
import { forecastFor, paceToGoal, projectionSeries } from '@/lib/calendar/forecast';

function day(date: string, earned: number, planned = 0): CalendarDayData {
  return {
    date,
    version: 0,
    shifts: [],
    sales: [],
    tips: null,
    tips_cash: null,
  tip_pool: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    below_floor: false,
    hours: 0,
    earned,
    planned,
  };
}

const today = todayKey();
const yesterday = shiftDays(today, -1);
const tomorrow = shiftDays(today, 1);
const from = shiftDays(today, -10);
const to = shiftDays(today, 10);

describe('forecastFor', () => {
  it("counts a shift booked for today as still ahead", () => {
    // The bug this pins: today is neither past nor future, so a shift booked
    // for this evening used to fall out of the forecast entirely.
    const result = forecastFor([day(today, 0, 3000)], from, to);

    expect(result.plannedAhead).toBe(3000);
    expect(result.projected).toBeGreaterThanOrEqual(3000);
  });

  it('does not count today twice when it was already worked', () => {
    const result = forecastFor([day(today, 2500, 0)], from, to);

    expect(result.earnedSoFar).toBe(2500);
    expect(result.plannedAhead).toBe(0);
  });

  it('keeps earned and planned apart on separate days', () => {
    const result = forecastFor(
      [day(yesterday, 1000), day(today, 0, 2000), day(tomorrow, 0, 3000)],
      from,
      to,
    );

    expect(result.earnedSoFar).toBe(1000);
    expect(result.plannedAhead).toBe(5000);
  });

  it('adds the run rate only for days with nothing booked', () => {
    // 11 elapsed days earning 1100 → 100 a day; 10 days ahead, one of them
    // booked at 500, so nine empty days get the pace.
    const result = forecastFor(
      [day(yesterday, 1100), day(tomorrow, 0, 500)],
      from,
      to,
    );

    expect(result.perDay).toBeCloseTo(100, 5);
    expect(result.projected).toBeCloseTo(1100 + 500 + 900, 5);
  });

  it('is still live when only today has work left on it', () => {
    const result = forecastFor([day(yesterday, 1000), day(today, 0, 800)], from, today);

    expect(result.remaining).toBe(0);
    expect(result.live).toBe(true);
  });

  it('is not live once the period is over and nothing is booked', () => {
    const result = forecastFor([day(yesterday, 1000)], from, yesterday);

    expect(result.live).toBe(false);
  });
});

describe('projectionSeries', () => {
  it('starts at today and includes what is booked for tonight', () => {
    const days = [day(yesterday, 1000), day(today, 0, 800)];
    const forecast = forecastFor(days, from, to);
    const points = projectionSeries(days, from, to, forecast);

    expect(points[0].label).toBe(today.slice(8));
    expect(points[0].value).toBe(1000 + 800);
  });

  it('never dips below what has already been earned', () => {
    const days = [day(yesterday, 5000), day(today, 0, 100)];
    const forecast = forecastFor(days, from, to);
    const points = projectionSeries(days, from, to, forecast);

    for (const point of points) expect(point.value).toBeGreaterThanOrEqual(5000);
  });
});

describe('paceToGoal', () => {
  it('reports nothing to do once the goal is already passed', () => {
    const forecast = forecastFor([day(yesterday, 50_000)], from, to);
    const pace = paceToGoal(forecast, 40_000);

    expect(pace?.needed).toBe(0);
    expect(pace?.ahead).toBe(true);
  });
});
