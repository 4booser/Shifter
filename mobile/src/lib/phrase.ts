/**
 * "Записав тисячу двісті чайових" → a number and what it is.
 *
 * Hands are busy. Saying it is faster than any form, and the same sentence
 * typed with one thumb is faster than four taps. The hard part is not the
 * intent — there are five things anybody ever records — but the number, which
 * arrives from speech recognition spelled out in words and from a keyboard as
 * digits, and often as both at once.
 *
 * It always reports what it understood before anything is saved. A parser that
 * writes 1 200 when somebody said 12 000 is worse than no parser, and the only
 * defence against that is showing the person the number.
 */

export type Kind = 'tips' | 'revenue' | 'deduction' | 'expense' | 'hours';

export interface Phrase {
  kind: Kind;
  /** Null where the words named a thing but no number. */
  amount: number | null;
  /** What was left over, for the note field. */
  rest: string;
}

/**
 * The words each kind is said in. Ordered by how specific they are: "чаевые"
 * before "деньги", so a sentence containing both lands on the specific one.
 */
const WORDS: { kind: Kind; words: string[] }[] = [
  { kind: 'tips', words: ['чайов', 'чаев', 'чай ', 'типс', 'tips'] },
  { kind: 'revenue', words: ['виручк', 'выручк', 'продаж', 'товарооб', 'оборот', 'каса', 'касса', 'чек на'] },
  { kind: 'deduction', words: ['штраф', 'недостач', 'нестач', 'утрим', 'удерж', 'розбив', 'разбил', 'бій', 'бой'] },
  { kind: 'expense', words: ['витрат', 'потрат', 'израсход', 'таксі', 'такси', 'проїзд', 'проезд', 'купив', 'купил', 'обід', 'обед'] },
  { kind: 'hours', words: ['годин', 'часов', 'часа', 'відпрацюв', 'отработ'] },
];

/**
 * Numbers as they are spoken. Only up to a hundred, plus the multipliers —
 * beyond that people say digits, and a table long enough to cover every
 * spoken number would be mostly words nobody uses about money.
 */
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
    .replace(/[.,;!?]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);

/**
 * The number in the sentence, spoken or written.
 *
 * Spoken numbers add up ("тысяча двести" is 1000 + 200) until a multiplier
 * appears, which multiplies everything said before it and starts again — the
 * way the languages themselves build them.
 */
export function readNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;

  for (const word of words) {
    const digits = word.replace(/\s/g, '').replace(',', '.');

    if (/^\d+(\.\d+)?$/.test(digits)) {
      current += Number(digits);
      seen = true;

      continue;
    }

    // "12к", "5тыс" — the number and its scale run together.
    const stuck = /^(\d+(?:\.\d+)?)(к|k|тис|тыс)$/.exec(digits);

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

/**
 * What the sentence was about, and how much.
 *
 * Null where nothing recognisable was said. Silence is the right answer to a
 * sentence about the weather, and guessing a kind would put somebody's tips in
 * the fines column.
 */
export function readPhrase(text: string): Phrase | null {
  const lowered = (text ?? '').toLocaleLowerCase();
  const found = WORDS.find((entry) => entry.words.some((word) => lowered.includes(word)));

  if (found === undefined) return null;

  const words = clean(text);

  return {
    kind: found.kind,
    amount: readNumber(words),
    // Everything that is not a number and not the word that named the kind:
    // "штраф 200 за розбитий келих" leaves "за розбитий келих", which is
    // exactly what belongs in the note.
    rest: words
      .filter((word) => UNITS[word] === undefined && SCALES[word] === undefined)
      .filter((word) => !/^\d/.test(word))
      .filter((word) => !found.words.some((one) => word.includes(one.trim())))
      .join(' ')
      .trim(),
  };
}
