import { t } from '@/lib/i18n';
/**
 * The trade, named the way people in it speak. The server stores the role as
 * a slug and prices everything itself; this table is only how the phone says
 * it out loud, with the emoji doing the work an icon set would.
 */
export const TRADES: Record<string, { emoji: string; label: string }> = {
  managing: { emoji: '🎩', label: 'управляющий' },
  'floor-manager': { emoji: '📋', label: 'менеджер зала' },
  administrator: { emoji: '🛎️', label: 'администратор' },
  chef: { emoji: '👨‍🍳', label: 'шеф-повар' },
  'sous-chef': { emoji: '🥇', label: 'су-шеф' },
  'shift-lead': { emoji: '⭐', label: 'старший смены' },
  bartender: { emoji: '🍸', label: 'бармен' },
  barback: { emoji: '🧊', label: 'барбек' },
  barista: { emoji: '☕', label: 'бариста' },
  sommelier: { emoji: '🍷', label: 'сомелье' },
  hookah: { emoji: '💨', label: 'кальянщик' },
  waiter: { emoji: '🍽️', label: 'официант' },
  runner: { emoji: '🏃', label: 'раннер' },
  host: { emoji: '💁', label: 'хостес' },
  cashier: { emoji: '💳', label: 'кассир' },
  busser: { emoji: '🧹', label: 'сборщик столов' },
  'cook-hot': { emoji: '🔥', label: 'повар горячего цеха' },
  'cook-cold': { emoji: '🥗', label: 'повар холодного цеха' },
  'cook-universal': { emoji: '🍳', label: 'повар-универсал' },
  prep: { emoji: '🔪', label: 'заготовщик' },
  grill: { emoji: '🍖', label: 'гриль' },
  wok: { emoji: '🥡', label: 'вок-повар' },
  pizzaiolo: { emoji: '🍕', label: 'пиццайоло' },
  sushi: { emoji: '🍣', label: 'сушист' },
  shawarma: { emoji: '🌯', label: 'шаурмист' },
  butcher: { emoji: '🥩', label: 'мясник-обвальщик' },
  pastry: { emoji: '🍰', label: 'кондитер' },
  baker: { emoji: '🥐', label: 'пекарь' },
  dishwasher: { emoji: '🫧', label: 'посудомойщик' },
  cleaner: { emoji: '🧼', label: 'уборщик' },
  storekeeper: { emoji: '📦', label: 'кладовщик' },
  security: { emoji: '🛡️', label: 'охранник' },
  courier: { emoji: '🛵', label: 'курьер' },
  catering: { emoji: '🥂', label: 'кейтеринг' },
  dj: { emoji: '🎧', label: 'диджей' },
  promoter: { emoji: '📣', label: 'промоутер' },
};

export const tradeOf = (id: string) => TRADES[id] ?? { emoji: '💼', label: id };

export interface Gig {
  id: number;
  venue: string;
  category: string;
  employment: 'freelance' | 'permanent';
  photos: string[];
  schedule: string | null;
  title: string;
  details: string | null;
  date: string;
  start: string;
  end: string;
  pay_amount: number;
  pay_period: 'hour' | 'shift' | 'month';
  pay_percent: number | null;
  city: string;
  slots: number;
  status: string;
  created_at: string;
  employer_rating: number | null;
  employer_count: number;
  responses: number;
  is_mine: boolean;
  /**
   * Somebody has not turned up and the shift starts today. The only listing in
   * the app that reaches anybody by notification.
   */
  urgent: boolean;
  /**
   * What this shift is worth against the hours the reader already works. Null
   * where there is nothing honest to say — no rate on the listing, or not
   * enough of their own hours to average against.
   */
  worth: {
    offered_per_hour: number;
    your_per_hour: number;
    /** Positive means better than their usual hour. */
    difference_percent: number;
  } | null;
  my_response: { id: number; accepted: boolean } | null;
}

/** "₴250 за час + 3% с продаж" — base, percent, or the two stacked. */
export function payLine(gig: Gig): string {
  const period =
    gig.pay_period === 'hour' ? 'за час' : gig.pay_period === 'month' ? 'в месяц' : 'за смену';
  const base = gig.pay_amount > 0 ? `₴${Math.round(gig.pay_amount).toLocaleString('ru')} ${period}` : null;
  const percent = gig.pay_percent !== null ? `${gig.pay_percent}% ${t('с продаж')}` : null;

  return [base, percent].filter((part) => part !== null).join(' + ');
}

/**
 * How long a vacancy has been sitting there. A fresh post and a three-week
 * one deserve different amounts of trust, and the exact stamp is a tap away.
 */
export function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} ${t('дн. назад')}`;
  if (days < 31) {
    const weeks = Math.floor(days / 7);

    return weeks === 1 ? 'неделю назад' : `${weeks} ${t('нед. назад')}`;
  }

  const months = Math.floor(days / 30);

  return months === 1 ? 'месяц назад' : `${months} ${t('мес. назад')}`;
}

/**
 * Only the photos that are actually there. An empty string in the array
 * still passes a length check and then draws as a blank grey box, which
 * reads as a broken listing rather than one without pictures.
 */
export const photosOf = (gig: Gig): string[] => gig.photos.filter((url) => url.trim() !== '');

/**
 * The vacancy's own terms, in the shape a shift template takes. A gig says
 * "per shift" where a template says "per day", and its percentage is the same
 * share of the takings the template already knows how to hold — so an outing
 * arranged on the board can be priced without anybody retyping the deal.
 */
export const templateFromGig = (gig: Gig) => ({
  name: gig.title.slice(0, 40),
  symbol: null,
  location_id: null,
  start_time: gig.start,
  end_time: gig.end,
  salary_period: gig.pay_period === 'shift' ? 'day' : gig.pay_period,
  salary_amount: gig.pay_amount,
  break_minutes: 0,
  colour: null,
  revenue_percent: gig.pay_percent,
  tip_source: 'personal',
  tip_pool_percent: null,
});
