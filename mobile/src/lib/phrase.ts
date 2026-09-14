/** "Записав тисячу двісті чайових" → a number and what it is. */

export type Kind = 'tips' | 'revenue' | 'deduction' | 'expense' | 'hours';

export interface Phrase {
  kind: Kind;
  /** Null where the words named a thing but no number. */
  amount: number | null;
  /** What was left over, for the note field. */
  rest: string;
}

/** The words each kind is said in. */
const WORDS: { kind: Kind; words: string[] }[] = [
  { kind: 'tips', words: ['чайов', 'чаев', 'чай ', 'типс', 'tips'] },
  { kind: 'revenue', words: ['виручк', 'выручк', 'продаж', 'товарооб', 'оборот', 'каса', 'касса', 'чек на'] },
  { kind: 'deduction', words: ['штраф', 'недостач', 'нестач', 'утрим', 'удерж', 'розбив', 'разбил', 'бій', 'бой'] },
  { kind: 'expense', words: ['витрат', 'потрат', 'израсход', 'таксі', 'такси', 'проїзд', 'проезд', 'купив', 'купил', 'обід', 'обед'] },
  { kind: 'hours', words: ['годин', 'часов', 'часа', 'відпрацюв', 'отработ'] },
];

/** Numbers as they are spoken. */
const UNITS: Record<string, number> = {
  'нуль': 0, 'ноль': 0,
  'один': 1, 'одна': 1, 'одну': 1, 'раз': 1,
  'два': 2, 'дві': 2, 'две': 2,
  'три': 3, 'чотири': 4, 'четыре': 4,
  'п’ять': 5, 'пять': 5, 'пʼять': 5,
  'шість': 6, 'шесть': 6, 'сім': 7, 'семь': 7,
  'вісім': 8, 'восемь': 8, 'дев’ять': 9, 'девять': 9, 'девʼять': 9,
  'десять': 10, 'одинадцять': 11, 'одиннадцать': 11,
  'дванадцять': 12, 'двенадцать': 12,
  'тринадцять': 13, 'тринадцать': 13,
  'чотирнадцять': 14, 'четырнадцать': 14,
  'п’ятнадцять': 15, 'пятнадцать': 15, 'пʼятнадцять': 15,
  'шістнадцять': 16, 'шестнадцать': 16,
  'сімнадцять': 17, 'семнадцать': 17,
  'вісімнадцять': 18, 'восемнадцать': 18,
  'дев’ятнадцять': 19, 'девятнадцать': 19,
  'двадцять': 20, 'двадцать': 20,
  'тридцять': 30, 'тридцать': 30,
  'сорок': 40, 'п’ятдесят': 50, 'пятьдесят': 50, 'пʼятдесят': 50,
  'шістдесят': 60, 'шестьдесят': 60,
  'сімдесят': 70, 'семьдесят': 70,
  'вісімдесят': 80, 'восемьдесят': 80,
  'дев’яносто': 90, 'девяносто': 90, 'девʼяносто': 90,
  'сто': 100, 'двісті': 200, 'двести': 200,
  'триста': 300, 'чотириста': 400, 'четыреста': 400,
  'п’ятсот': 500, 'пятьсот': 500, 'пʼятсот': 500,
  'шістсот': 600, 'шестьсот': 600,
  'сімсот': 700, 'семьсот': 700,
  'вісімсот': 800, 'восемьсот': 800,
  'дев’ятсот': 900, 'девятьсот': 900, 'девʼятсот': 900,
};

/** "тысяча", "тыс", "к" — the multiplier is where a tenfold error hides. */
const SCALES: Record<string, number> = {
  'тисяч': 1_000, 'тисяча': 1_000, 'тисячі': 1_000, 'тисячу': 1_000,
  'тысяч': 1_000, 'тысяча': 1_000, 'тысячи': 1_000, 'тысячу': 1_000,
  'тис': 1_000, 'тыс': 1_000, 'k': 1_000, 'к': 1_000,
};

const clean = (text: string): string[] =>
  text
    .toLocaleLowerCase()
    // Punctuation goes, except between two digits.
    .replace(/(?<!\d)[.,](?!\d)/g, ' ')
    .replace(/[;!?]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);

/** Rejoins the thousands that speech recognition splits. */
export function joinThousands(words: string[]): string[] {
  const joined: string[] = [];

  for (const word of words) {
    const last = joined[joined.length - 1];

    if (
      last !== undefined
      && /^\d{1,3}$/.test(last)
      && /^\d{3}$/.test(word)
    ) {
      joined[joined.length - 1] = last + word;

      continue;
    }

    joined.push(word);
  }

  return joined;
}

/** A written number, in the two shapes recognition produces. */
export function asNumber(word: string): number | null {
  if (/^\d{1,3}(?:\.\d{3})+$/.test(word)) return Number(word.replace(/\./g, ''));

  const plain = word.replace(',', '.');

  return /^\d+(?:\.\d+)?$/.test(plain) ? Number(plain) : null;
}

/** "08:00" spoken as a length of time. */
const asDuration = (word: string): number | null => {
  const match = /^([0-2]?\d):([0-5]\d)$/.exec(word);

  if (match === null) return null;

  return Number(match[1]) + Number(match[2]) / 60;
};

/** The number in the sentence, spoken or written. */
export function readNumber(words: string[], hours = false): number | null {
  let total = 0;
  let current = 0;
  let seen = false;

  for (const word of joinThousands(words)) {
    // A length of time, where a length of time is what was asked for.
    if (hours) {
      const duration = asDuration(word);

      if (duration !== null) {
        current += duration;
        seen = true;

        continue;
      }
    }

    const digits = word.replace(/\s/g, '');
    const written = asNumber(digits);

    if (written !== null) {
      current += written;
      seen = true;

      continue;
    }

    // "12к", "5тыс" — the number and its scale run together.
    const stuck = /^(\d+(?:[.,]\d+)?)(к|k|тис|тыс)$/.exec(digits.replace(',', '.'));

    if (stuck !== null) {
      total += Number(stuck[1]) * 1_000;
      current = 0;
      seen = true;

      continue;
    }

    const scale = SCALES[word];

    if (scale !== undefined) {
      // "тысяча" on its own is a thousand, not nothing times a thousand.
      total += (current === 0 ? 1 : current) * scale;
      current = 0;
      seen = true;

      continue;
    }

    const unit = UNITS[word];

    if (unit !== undefined) {
      current += unit;
      seen = true;
    }
  }

  return seen ? total + current : null;
}

/** What the sentence was about, and how much. */
/** What is left, once it is worth keeping. */
function note(words: string[]): string {
  const text = words.join(' ').trim();

  return words.length === 1 && words[0].length <= 3 ? '' : text;
}

export function readPhrase(text: string): Phrase | null {
  const lowered = (text ?? '').toLocaleLowerCase();
  const found = WORDS.find((entry) => entry.words.some((word) => lowered.includes(word)));

  if (found === undefined) return null;

  const words = clean(text);

  return {
    kind: found.kind,
    amount: readNumber(words, found.kind === 'hours'),
    // Everything that is not a number and not a word that named the kind: "штраф 200 за разбитый бокал" leaves "за…
    rest: note(
      joinThousands(words)
        .filter((word) => UNITS[word] === undefined && SCALES[word] === undefined)
        .filter((word) => !/^\d/.test(word))
        .filter((word) => !found.words.some((one) => word.includes(one.trim()))),
    ),
  };
}
