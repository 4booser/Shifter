import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { CalendarStore } from '../../../core/calendar/calendar-store';
import { I18n } from '../../../core/i18n/i18n';
import { CalendarDayData } from '../../../core/calendar/calendar.models';
import { DayPanel } from './day-panel';

/**
 * The panel keeps a draft of the day so typing does not fire a request per
 * keystroke, and the draft is filled from the day when the date changes. That
 * left one hole: a day that arrives *after* the date was selected — the month
 * still loading, or a webhook writing into the day while the panel sits open —
 * never reached the inputs, and a day full of sales showed zeroes.
 */
describe('DayPanel draft', () => {
  const selectedDate = signal<string | null>('2026-08-24');
  const selectedDay = signal<CalendarDayData | undefined>(undefined);

  const day = (
    sales: { sales_id: number; quantity: number }[],
    tips: number | null = null,
  ): CalendarDayData =>
    ({
      date: '2026-08-24',
      shifts: [],
      sales: sales.map((s) => ({
        ...s,
        name: 'Heven',
        unit_price: 350,
        percentage: 5,
        earned: s.quantity * 350 * 0.05,
      })),
      tips,
      tips_cash: null,
      tip_out: 0,
      deductions: null,
      note: null,
      colour: null,
      hours: 0,
      earned: 0,
      planned: 0,
    }) as unknown as CalendarDayData;

  function panel(): { quantities: () => Record<number, number>; tips: () => number | null } {
    const store = {
      selectedDate,
      selectedDay,
      positions: signal([]),
      templates: signal([]),
      saving: signal(false),
      eventsByDate: signal(new Map()),
      holidays: signal(new Map()),
    };

    // I18n is stubbed only to keep the settings store — and its localStorage —
    // out of a test about draft state.
    TestBed.configureTestingModule({
      providers: [
        { provide: CalendarStore, useValue: store },
        { provide: I18n, useValue: { lang: () => 'ru', t: (key: string) => key } },
      ],
    });

    return TestBed.runInInjectionContext(() => new DayPanel()) as never;
  }

  beforeEach(() => {
    selectedDate.set('2026-08-24');
    selectedDay.set(undefined);
    TestBed.resetTestingModule();
  });

  it('fills the inputs from a day that arrives after the date was picked', () => {
    const created = panel();

    TestBed.tick();
    expect(created.quantities()).toEqual({});

    // The month finishes loading, or a webhook writes the day in.
    selectedDay.set(day([{ sales_id: 2, quantity: 6 }], 40));
    TestBed.tick();

    expect(created.quantities()).toEqual({ 2: 6 });
    expect(created.tips()).toBe(40);
  });

  it('never overwrites a quantity the user has already touched', () => {
    const created = panel();

    TestBed.tick();

    (
      created as unknown as { quantities: { set: (v: Record<number, number>) => void } }
    ).quantities.set({ 2: 0 });

    selectedDay.set(
      day([
        { sales_id: 2, quantity: 6 },
        { sales_id: 3, quantity: 1 },
      ]),
    );
    TestBed.tick();

    // The cleared one stays cleared; the one they never touched arrives.
    expect(created.quantities()).toEqual({ 2: 0, 3: 1 });
  });
});
