import { t } from '@/lib/i18n';
/**
 * A place of work, as the server keeps it.
 *
 * Every field is here even though the phone only offers some of them for
 * editing. A place is saved whole, exactly like a day: send a shorter object
 * and the fields left out fall back to their defaults, which would quietly
 * wipe the holiday calendar or the commission cycle somebody set on the site.
 */
export interface WorkPlace {
  id: number;
  name: string;
  address: string | null;
  colour: string;
  pay_period: PayPeriod;
  pay_day: number;
  pay_anchor: string;
  current_period_from: string;
  current_period_to: string;
  overtime_weekly_hours: number;
  overtime_multiplier: number;
  /** 1 means the place pays no night premium at all. */
  night_multiplier: number;
  night_from: string;
  night_to: string;
  public_holiday_multiplier: number;
  holiday_country: string;
  tip_out_of_tips_percent: number;
  tip_out_of_sales_percent: number;
  meal_deduction: number;
  tax_percent: number;
  tax_tips: boolean;
  holiday_percent: number;
  /** Empty means "whatever the app is set to". */
  currency: string;
  archived: boolean;
  sales_pay_period: string;
  sales_pay_day: number;
  sales_pay_anchor: string;
  latitude: number | null;
  longitude: number | null;
  auto_break_after_hours: number;
  auto_break_minutes: number;
  /** The hourly rate this person will not go under here. 0 is off. */
  minimum_hourly: number;
  commute_minutes: number;
  commute_cost: number;
}

export type PayPeriod = 'monthly' | 'semimonthly' | 'biweekly' | 'weekly';

export const PAY_PERIODS: { value: PayPeriod; label: string; day: string }[] = [
  { value: 'monthly', label: 'Раз в месяц', day: 'Число' },
  { value: 'semimonthly', label: 'Два раза', day: 'Первое число' },
  { value: 'biweekly', label: 'Раз в 2 недели', day: 'День недели' },
  { value: 'weekly', label: 'Раз в неделю', day: 'День недели' },
];

/** How a place's pay cycle reads in one line. */
export const payLine = (place: WorkPlace): string => {
  const period = PAY_PERIODS.find((entry) => entry.value === place.pay_period);

  if (period === undefined) return t('Выплаты не настроены');
  if (place.pay_period === 'monthly') return `${period.label}, ${place.pay_day}-${t('го')}`;
  if (place.pay_period === 'semimonthly') return `${period.label}: ${place.pay_day} ${t('и')} ${place.pay_day + 15}`;

  return period.label;
};

/**
 * The whole place, ready to send back. Nothing is dropped and nothing is
 * defaulted: what the phone does not show, it carries.
 */
export const toPlacePayload = (place: WorkPlace) => ({
  name: place.name,
  address: place.address,
  colour: place.colour,
  pay_period: place.pay_period,
  pay_day: place.pay_day,
  pay_anchor: place.pay_anchor,
  overtime_weekly_hours: place.overtime_weekly_hours,
  overtime_multiplier: place.overtime_multiplier,
  night_multiplier: place.night_multiplier,
  night_from: place.night_from,
  night_to: place.night_to,
  public_holiday_multiplier: place.public_holiday_multiplier,
  holiday_country: place.holiday_country,
  tip_out_of_tips_percent: place.tip_out_of_tips_percent,
  tip_out_of_sales_percent: place.tip_out_of_sales_percent,
  meal_deduction: place.meal_deduction,
  tax_percent: place.tax_percent,
  tax_tips: place.tax_tips,
  holiday_percent: place.holiday_percent,
  currency: place.currency === '' ? null : place.currency,
  sales_pay_period: place.sales_pay_period === '' ? null : place.sales_pay_period,
  sales_pay_day: place.sales_pay_day,
  sales_pay_anchor: place.sales_pay_anchor,
  latitude: place.latitude,
  longitude: place.longitude,
  auto_break_after_hours: place.auto_break_after_hours,
  auto_break_minutes: place.auto_break_minutes,
  minimum_hourly: place.minimum_hourly,
  commute_minutes: place.commute_minutes,
  commute_cost: place.commute_cost,
});

/** A number typed on a phone, where a comma is as likely as a full stop. */
export const numberOf = (text: string, fallback = 0): number => {
  const value = Number(text.replace(',', '.').trim());

  return Number.isFinite(value) ? value : fallback;
};
