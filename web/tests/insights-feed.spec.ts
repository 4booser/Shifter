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
        worked: true,
        needs_cover: false,
      },
    ],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
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
