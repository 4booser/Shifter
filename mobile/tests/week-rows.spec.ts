import { describe, expect, it } from 'vitest';

import {
  hoursLabel,
  toggleWeekday,
  toWeekHours,
  toWeekRows,
  weekRowsLine,
  weekRowsProblem,
} from '@/lib/week-rows';

const stored = [
  { weekday: 7, start_time: '13:00', end_time: '23:00' },
  { weekday: 5, start_time: '11:00', end_time: '23:00' },
  { weekday: 6, start_time: '13:00', end_time: '23:00' },
];

describe('the weekday rows of the shift form', () => {
  it('groups the stored days that share their hours', () => {
    expect(toWeekRows(stored)).toEqual([
      { days: [5], start: '11:00', end: '23:00' },
      { days: [6, 7], start: '13:00', end: '23:00' },
    ]);
  });

  it('opens collapsed with nothing stored', () => {
    expect(toWeekRows([])).toEqual([]);
  });

  it('sends one flat entry per weekday', () => {
    expect(toWeekHours(toWeekRows(stored))).toEqual([
      { weekday: 5, start_time: '11:00', end_time: '23:00' },
      { weekday: 6, start_time: '13:00', end_time: '23:00' },
      { weekday: 7, start_time: '13:00', end_time: '23:00' },
    ]);
  });

  it('sends an empty list once the last row is gone, which is what clears it', () => {
    expect(toWeekHours([])).toEqual([]);
  });

  it('drops a row with no days picked', () => {
    expect(toWeekHours([{ days: [], start: '10:00', end: '20:00' }])).toEqual([]);
  });

  it('writes a typed "9:30" the way the server does', () => {
    expect(toWeekHours([{ days: [1], start: '9:30', end: '18:00' }])[0].start_time).toBe('09:30');
  });

  it('keeps a weekday in one row: taking it here takes it from the other', () => {
    const rows = toggleWeekday(toWeekRows(stored), 0, 6);

    expect(rows[0].days).toEqual([5, 6]);
    expect(rows[1].days).toEqual([7]);
  });

  it('lets a weekday be tapped off again', () => {
    expect(toggleWeekday(toWeekRows(stored), 1, 7)[1].days).toEqual([6]);
  });

  it('asks for a real time on a row that has days', () => {
    expect(weekRowsProblem([{ days: [1], start: '11', end: '22:00' }])).not.toBeNull();
    expect(weekRowsProblem([{ days: [1], start: '25:00', end: '22:00' }])).not.toBeNull();
    expect(weekRowsProblem([{ days: [1], start: '11:00', end: '22:00' }])).toBeNull();
  });

  it('refuses a row that starts when it ends', () => {
    expect(weekRowsProblem([{ days: [1], start: '9:00', end: '09:00' }])).not.toBeNull();
  });

  it('does not mind a half-filled row nobody picked days for', () => {
    expect(weekRowsProblem([{ days: [], start: '', end: '' }])).toBeNull();
  });

  it('reads back as one line for the list', () => {
    expect(weekRowsLine(stored, (phrase) => phrase)).toBe('Пт 11:00–23:00 · Сб, Вс 13:00–23:00');
  });
});

describe('a shift’s hours in a row of one line', () => {
  const say = (phrase: string) => `[${phrase}]`;
  const usual = { start_time: '11:00:00', end_time: '22:00:00' };

  it('reads as the hours where every day runs the same', () => {
    expect(hoursLabel({ ...usual, week_hours: [] }, say)).toBe('11:00–22:00');
  });

  it('says so where some days run others', () => {
    // Painting a Saturday places 13:00–23:00, and 11:00–22:00 alone reads as a promise.
    expect(hoursLabel({ ...usual, week_hours: stored }, say)).toBe('11:00–22:00 · [по дням]');
  });

  it('copes with a template from before weekday hours', () => {
    expect(hoursLabel(usual, say)).toBe('11:00–22:00');
  });
});
