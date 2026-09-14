import { dayOf, fromMinor, MonoStatementItem, payerName } from '@/lib/mono';
import { CalendarDayData } from './types';
import { t } from '@/lib/i18n';

/** Finding one day out of two years of them. */
export interface Hit {
  kind: 'day' | 'money';
  /** 'YYYY-MM-DD', which is also where tapping the hit goes. */
  date: string;
  title: string;
  meta: string;
  /** Signed for a transaction, always positive for a day. */
  amount: number;
}

const fold = (value: string) => value.toLowerCase().trim();

/** A query of digits might be money — and might be a year. */
const amountIn = (query: string): number | null => {
  const digits = query.replace(/[\s,.]/g, '');

  return /^\d{2,}$/.test(digits) ? Number(digits) : null;
};

/** How close an amount has to be to count as the one somebody meant. */
const NEAR = 0.05;

const near = (value: number, wanted: number) =>
  Math.abs(Math.abs(value) - wanted) <= Math.max(1, wanted * NEAR);

export const searchDays = (days: CalendarDayData[], query: string): Hit[] => {
  const needle = fold(query);

  if (needle.length < 2) return [];

  const wanted = amountIn(needle);

  return days
    .filter((day) => {
      const haystack = fold(
        `${day.note ?? ''} ${day.shifts.map((shift) => shift.name).join(' ')} ${day.date}`,
      );

      if (haystack.includes(needle)) return true;

      return (
        wanted !== null
        && (near(day.earned, wanted) || near(day.planned, wanted) || near(day.tips ?? 0, wanted))
      );
    })
    .map((day) => ({
      kind: 'day' as const,
      date: day.date,
      title:
        day.shifts.length > 0
          ? day.shifts.map((shift) => `${shift.symbol ?? ''}${shift.name}`).join(', ')
          : 'День без смены',
      // A comma, because that is how this language writes a half.
      meta: day.note ?? (day.hours > 0 ? `${`${day.hours}`.replace('.', ',')} ${t('ч')}` : ''),
      amount: day.earned > 0 ? day.earned : day.planned,
    }))
    .sort((one, two) => (one.date < two.date ? 1 : -1))
    .slice(0, 40);
};

export const searchStatement = (items: MonoStatementItem[], query: string): Hit[] => {
  const needle = fold(query);

  if (needle.length < 2) return [];

  const wanted = amountIn(needle);

  return items
    .filter((item) => {
      if (fold(`${item.description} ${payerName(item)}`).includes(needle)) return true;

      return wanted !== null && near(fromMinor(item.amount), wanted);
    })
    .map((item) => ({
      kind: 'money' as const,
      date: dayOf(item),
      title: item.amount > 0 ? payerName(item) : item.description,
      meta: item.hold ? 'не подтверждено' : '',
      amount: fromMinor(item.amount),
    }))
    .sort((one, two) => (one.date < two.date ? 1 : -1))
    .slice(0, 40);
};
