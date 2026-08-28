import { insightsFor, InsightInput } from '@/lib/calendar/insights-feed';
import { CalendarDayData, DaysResponse, EMPTY_SUMMARY } from '@/lib/calendar/models';

function day(date: string, earned: number): CalendarDayData {
  return {
    date,
    shifts: [
      {
        shift_id: 1,
        name: 'Bar',
        symbol: null,
        colour: null,
        start_time: '10:00',
        end_time: '18:00',
        hours: 8,
        earned,
        revenue: null,
  guests: null,
  zone: 'unset' as const,
        revenue_percent: null,
        worked: true,
        needs_cover: false,
        actual_start: null,
        actual_end: null,
        break_minutes: 0,
      },
    ],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_pool: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    below_floor: false,
    hours: 8,
    earned,
    planned: 0,
  };
}

function summaryOf(days: CalendarDayData[]): DaysResponse {
  return {
    ...EMPTY_SUMMARY,
    days,
    days_worked: days.length,
    total_earned: days.reduce((sum, d) => sum + d.earned, 0),
    hours: days.length * 8,
  };
}

const base = (over: Partial<InsightInput>): InsightInput => ({
  summary: EMPTY_SUMMARY,
  previous: EMPTY_SUMMARY,
  forecast: null,
  days: [],
  today: '2026-03-16',
  weekdayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  formatMoney: (amount) => `${amount}`,
  ...over,
});

describe('insightsFor', () => {
  it('stays silent on an empty calendar', () => {
    expect(insightsFor(base({}))).toEqual([]);
  });

  it('names the weekday that pays more', () => {
    // Fridays at 2000, everything else at 1000; six-plus worked days.
    const days = [
      day('2026-03-02', 1000),
      day('2026-03-03', 1000),
      day('2026-03-06', 2000),
      day('2026-03-09', 1000),
      day('2026-03-10', 1000),
      day('2026-03-13', 2000),
    ];

    const found = insightsFor(base({ summary: summaryOf(days) }));
    const premium = found.find((insight) => insight.id === 'weekday-premium');

    expect(premium?.vars['day']).toBe('Friday');
  });

  it('warns about a long unbroken run of days', () => {
    const days = ['12', '13', '14', '15', '16'].map((d) => day(`2026-03-${d}`, 1000));

    const found = insightsFor(base({ summary: summaryOf(days), days }));
    const streak = found.find((insight) => insight.id === 'streak');

    expect(streak?.vars['days']).toBe('5');
  });

  it('does not report a tips trend without a baseline', () => {
    const now = summaryOf([day('2026-03-02', 1000)]);

    now.tips_earned = 300;

    const found = insightsFor(base({ summary: now }));

    expect(found.find((insight) => insight.id === 'tips-trend')).toBeUndefined();
  });
});

describe('insights v2', () => {
  it('flags a day far under its weekday median', () => {
    // Four Mondays: three around 1200, one at 500.
    const days = [
      day('2026-03-02', 1200),
      day('2026-03-09', 1250),
      day('2026-03-16', 500),
      day('2026-03-23', 1200),
    ];

    const found = insightsFor(base({ summary: summaryOf(days) }));
    const dip = found.find((insight) => insight.id === 'anomaly-dip');

    expect(dip?.vars['date']).toBe('16.03');
  });

  it('compares the rolling weeks around today', () => {
    // Today is 16.03: the last window is 10–16, the one before is 03–09.
    const days = [
      ...['06', '07', '08', '09'].map((d) => day(`2026-03-${d}`, 1000)),
      ...['13', '14', '15', '16'].map((d) => day(`2026-03-${d}`, 1500)),
    ];

    const found = insightsFor(base({ summary: summaryOf(days), days }));
    const rolling = found.find((insight) => insight.id === 'rolling-week');

    expect(rolling?.key).toContain('above');
  });
});
