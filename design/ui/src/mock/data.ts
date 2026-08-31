/*
 * Выдуманные данные макета.
 *
 * Ровно столько, чтобы экраны выглядели как у человека, который правда
 * работает: месяц с выходными по понедельникам и вторникам, вечера дороже
 * дневных, один штраф за разбитый бокал. Круглые числа врут — от них любой
 * график выглядит ровнее, чем бывает.
 */

export const ME = { name: 'Аня', initials: 'А' };

export interface Day {
  n: number;
  what?: string;
  amount?: string;
  hours?: string;
  plan?: boolean;
  today?: boolean;
  event?: string;
  blank?: boolean;
}

/** Август 2026: 1-е — суббота, 31-е — понедельник. Сетка с понедельника. */
export const MONTH: Day[] = [
  // Первая неделя: месяц начинается в субботу, поэтому пять клеток чужие.
  { n: 27, blank: true }, { n: 28, blank: true }, { n: 29, blank: true },
  { n: 30, blank: true }, { n: 31, blank: true },
  { n: 1, what: 'Вечер', amount: '2 470', hours: '8,5' },
  { n: 2, what: 'День', amount: '1 340', hours: '7,5' },

  { n: 3 },
  { n: 4 },
  { n: 5, what: 'Вечер', amount: '2 200', hours: '8,5' },
  { n: 6, what: 'Вечер', amount: '2 200', hours: '8,5' },
  { n: 7, what: 'Вечер', amount: '2 470', hours: '8,5' },
  { n: 8, what: 'День', amount: '1 340', hours: '7,5' },
  { n: 9, what: 'День', amount: '1 340', hours: '7,5' },

  { n: 10 },
  { n: 11 },
  { n: 12, what: 'Вечер', amount: '2 200', hours: '8,5' },
  { n: 13, what: 'Вечер', amount: '2 200', hours: '8,5' },
  { n: 14, what: 'Вечер', amount: '2 470', hours: '8,5' },
  { n: 15, event: 'Отпуск' },
  { n: 16, event: 'Отпуск' },

  { n: 17, event: 'Отпуск' },
  { n: 18, event: 'Отпуск' },
  { n: 19, event: 'Отпуск' },
  { n: 20, what: 'Вечер', amount: '2 200', hours: '8,5' },
  { n: 21, what: 'Вечер', amount: '2 470', hours: '8,5' },
  { n: 22, what: 'День', amount: '1 340', hours: '7,5' },
  { n: 23, what: 'День', amount: '1 340', hours: '7,5' },

  { n: 24 },
  { n: 25 },
  { n: 26, what: 'Вечер', amount: '2 200', hours: '8,5' },
  { n: 27, what: 'Вечер', amount: '2 200', hours: '8,5' },
  { n: 28, what: 'Вечер', amount: '2 470', hours: '8,5' },
  { n: 29, what: 'День', amount: '1 340', hours: '7,5' },
  { n: 30, what: 'День', amount: '1 340', hours: '7,5' },

  { n: 31, what: 'Вечер', amount: '1 640', hours: '8,5', today: true },
  { n: 1, blank: true }, { n: 2, blank: true }, { n: 3, blank: true },
  { n: 4, blank: true }, { n: 5, blank: true }, { n: 6, blank: true },
];

export const MONTH_TOTALS = {
  earned: '24 700',
  shifts: 17,
  hours: 137,
  hourly: '180',
  tips: '7 700',
  withheld: '2 230',
  nights: 62,
  guests: 990,
};

export const TILES = [
  { said: 'Заработано', num: '₴24 700', foot: '17 смен · 137 ч', tone: 'good' as const },
  { said: 'Твой час', num: '₴180', foot: '137 ч в этом месяце' },
  { said: 'Чаевые', num: '₴7 700', foot: '31% от заработка' },
  { said: 'Лучший день', num: '₴2 470', foot: '1 августа' },
  { said: 'Ночные часы', num: '62', foot: '45% всех часов' },
  { said: 'Удержано', num: '₴2 230', foot: 'штрафы и питание', tone: 'bad' as const },
  { said: 'Подряд', num: '5', foot: 'дней без выходного' },
  { said: 'Гостей', num: '990', foot: '₴18 с гостя' },
];

export const SHIFTS = [
  { name: 'Вечер', symbol: '🍸', time: '17:00–01:00', hours: '8,5 ч', pay: '₴200 в час', place: 'Бар «Полночь»', extra: 'пул 15%' },
  { name: 'День', symbol: '☕️', time: '09:00–17:00', hours: '7,5 ч', pay: '₴150 в час', place: 'Бар «Полночь»' },
  { name: 'Банкет', symbol: '🥂', time: '18:00–23:00', hours: '5,0 ч', pay: '₴1 400 за смену', place: 'Ресторан «Веранда»' },
];

export const PLACES = [
  {
    name: 'Бар «Полночь»',
    where: 'Днепр, Соборная 12',
    cycle: 'дважды в месяц, 10-го',
    colour: '#e0a45b',
    rules: ['ночь ×1,35', 'праздник ×2', 'налог 19,5%', 'питание ₴90', 'в котёл 5%'],
  },
  {
    name: 'Ресторан «Веранда»',
    where: 'Днепр, Яворницкого 4',
    cycle: 'раз в месяц, 5-го',
    colour: '#7fbf7a',
    rules: ['ночь ×1,2', 'налог 19,5%'],
  },
];

export const PAYOUTS = [
  { place: 'Бар «Полночь»', span: '16–30 июня', due: 'выплата 5 июля', amount: '₴9 260', state: 'Задержка', late: '+57 дн.' },
  { place: 'Бар «Полночь»', span: '1–15 июля', due: 'выплата 20 июля', amount: '₴17 274', state: 'Задержка', late: '+42 дн.' },
  { place: 'Бар «Полночь»', span: '16–31 июля', due: 'выплата 5 авг.', amount: '₴18 437', state: 'Задержка', late: '+26 дн.' },
  { place: 'Ресторан «Веранда»', span: '1–15 августа', due: 'выплата 20 авг.', amount: '₴17 808', state: 'Пришло' },
  { place: 'Бар «Полночь»', span: '16–31 августа', due: 'выплата 5 сент.', amount: '₴16 590', state: 'Идёт' },
];

export const CREW = [
  { name: 'Аня', you: true, colour: '#e0a45b', hours: 137, days: 17, week: ['', '', 'В', 'В', 'В', 'Д', ''] },
  { name: 'Ира', colour: '#7fbf7a', hours: 96, days: 12, week: ['Д', '', 'В', 'В', '', 'В', 'В'] },
  { name: 'Костя', colour: '#d9705f', hours: 112, days: 14, week: ['В', 'В', '', 'Д', 'Д', '', 'В'], cover: 3 },
  { name: 'Марк', colour: '#b5ada3', trainee: true, hours: 40, days: 6, week: ['', 'Д', 'Д', '', '', '', 'Д'] },
];

/**
 * Подработки.
 *
 * `worth` — не украшение, а частное: сколько выходит в час против ваших
 * ₴180. Карточка, где написано «₴180 в час» и «−12% к вашему часу», учит
 * не верить проценту, а он единственное, ради чего эту доску открывают.
 */
export const GIGS = [
  { title: 'Бармен на вечер пятницы', venue: 'Бар «Хмель»', city: 'Днепр', when: '5 сентября · 16:00–23:00', pay: '₴250', per: 'в час', hourly: '₴250 в час', worth: '+39% к вашему часу', urgent: true },
  { title: 'Повар горячего цеха на банкет', venue: 'Ресторан «Веранда»', city: 'Днепр', when: '5 сентября · 12:00–23:00', pay: '₴2 800', per: 'за смену', hourly: '11 часов — ₴254 в час', worth: '+41% к вашему часу' },
  { title: 'Бариста на выходные', venue: 'Кофейня «Тчк»', city: 'Днепр', when: '6 сентября · 08:00–16:00', pay: '₴140', per: 'в час', hourly: '₴140 в час', worth: '−22% к вашему часу', worse: true },
  { title: 'Хостес на открытие', venue: 'Terrace 42', city: 'Днепр', when: '7 сентября · 18:00–02:00', pay: '₴1 900', per: 'за смену', hourly: '8 часов — ₴237 в час', worth: '+32% к вашему часу' },
];

export const SPEND = [
  { name: 'АТБ', under: '11 раз', share: 100, value: '₴5 440' },
  { name: 'Сільпо', under: '8 раз', share: 70, value: '₴3 797' },
  { name: 'Rozetka', under: '2 раза', share: 45, value: '₴2 450' },
  { name: 'Кав’ярня «Мулен»', under: '12 раз', share: 39, value: '₴2 111' },
  { name: 'Uklon', under: '8 раз', share: 26, value: '₴1 437' },
  { name: 'Аптека АНЦ', under: '4 раза', share: 18, value: '₴990' },
];

export const STANDING = [
  { name: 'Київенерго: комуналка', amount: '₴1 638', next: '25.09' },
  { name: 'Netflix', amount: '₴199', next: '03.09' },
  { name: 'lifecell: поповнення', amount: '₴150', next: '25.09' },
  { name: 'Spotify', amount: '₴125', next: '07.09' },
  { name: 'iCloud+', amount: '₴99', next: '11.09' },
];

export const WEEKDAY_PAY = [
  { name: 'пн', under: '0 дн.', share: 0, value: '·' },
  { name: 'вт', under: '0 дн.', share: 0, value: '·' },
  { name: 'ср', under: '4 дн.', share: 62, value: '₴1 396' },
  { name: 'чт', under: '4 дн.', share: 57, value: '₴1 282' },
  { name: 'пт', under: '4 дн.', share: 92, value: '₴2 204' },
  { name: 'сб', under: '5 дн.', share: 100, value: '₴2 398' },
  { name: 'вс', under: '5 дн.', share: 56, value: '₴1 339' },
];

/** Точки для кривой заработка. Не гладкие: месяц не бывает гладким. */
export const CLIMB = [
  0, 2.47, 3.81, 3.81, 3.81, 5.12, 7.32, 9.66, 12.13, 13.47, 13.47, 13.47,
  14.66, 16.86, 16.86, 16.86, 16.86, 16.86, 16.86, 19.06, 21.26, 23.73,
  25.07, 25.07, 25.07, 25.07, 27.27, 29.61, 32.08, 33.39, 35.03,
];

export const YEAR_MONTHS = [
  { m: 'я', v: 34 }, { m: 'ф', v: 41 }, { m: 'м', v: 38 }, { m: 'а', v: 52 },
  { m: 'м', v: 61 }, { m: 'и', v: 47 }, { m: 'и', v: 55 }, { m: 'а', v: 70 },
  { m: 'с', v: 0 }, { m: 'о', v: 0 }, { m: 'н', v: 0 }, { m: 'д', v: 0 },
];
