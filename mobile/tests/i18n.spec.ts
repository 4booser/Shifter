/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { UK } from '@/lib/i18n/uk';

const ROOT = join(import.meta.dirname, '..', 'src');

const sources = (): string[] => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);

      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts') || name.endsWith('.tsx')) found.push(path);
    }
  };

  walk(ROOT);

  return found;
};

/** Phrases handed to t() as a literal — the ones that certainly need an entry. */
const asked = (): Set<string> => {
  const found = new Set<string>();
  const call = /\bt\(\s*'((?:[^'\\]|\\.)*)'\s*\)|\bt\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g;

  for (const path of sources()) {
    if (path.endsWith(join('lib', 'i18n', 'uk.ts'))) continue;

    for (const match of readFileSync(path, 'utf8').matchAll(call)) {
      const raw = match[1] ?? match[2];

      found.add(raw.replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
    }
  }

  return found;
};

/**
 * Every Russian string anywhere in the source.
 *
 * Some phrases reach t() through a variable — a label table read as
 * t(KINDS[row.kind]) — and no amount of reading the source will pair those
 * up. What can still be checked is the weaker and more useful thing: that a
 * phrase in the dictionary exists in the app at all.
 */
const written = (): Set<string> => {
  const found = new Set<string>();
  const literal = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
  const cyrillic = /[а-яА-ЯёЁ]/;

  for (const path of sources()) {
    if (path.endsWith(join('lib', 'i18n', 'uk.ts'))) continue;

    for (const match of readFileSync(path, 'utf8').matchAll(literal)) {
      const raw = match[1] ?? match[2];

      if (raw !== undefined && cyrillic.test(raw)) {
        found.add(raw.replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
      }
    }
  }

  return found;
};

/**
 * A dictionary drifts in two directions and both are quiet. A phrase changed
 * in the source falls back to Russian and nobody notices; a phrase deleted
 * from the source stays in the dictionary forever and the next person to read
 * it believes the app still says it.
 */
describe('the Ukrainian dictionary', () => {
  it('has every phrase the app asks for', () => {
    const missing = [...asked()].filter((phrase) => UK[phrase] === undefined);

    expect(missing.sort()).toEqual([]);
  });

  it('has no phrase the app no longer says', () => {
    const wanted = written();
    const stale = Object.keys(UK).filter((phrase) => !wanted.has(phrase));

    expect(stale.sort()).toEqual([]);
  });

  it('never answers with the Russian it was given', () => {
    // A key whose translation is the key is a phrase somebody skipped. Words
    // that are genuinely the same in both languages are listed here on
    // purpose, so skipping one is never mistaken for one of them.
    const same = new Set([
      'Аванс', 'Банк', 'Бар', 'Готово', 'Замок', 'Логін', 'Пароль', 'Токен',
      'Телефон', 'Телеграм', 'Форма', 'Хостес', 'Кухня', 'Зал', 'Станція',
      'Статистика', 'Менеджер', 'Медкнижка', 'Санмінімум', 'Сертифікат',
      'Транспорт', 'Інструмент', 'Премія', 'Права', 'Дозвіл', 'Ставка',
      'Множник', 'Число', 'Назва', 'Значок', 'Колір', 'Список', 'Аналіз',
      'Дошка', 'Біржа', 'Бій', 'Передача', 'Підсобка', 'Кешбек', 'Фриланс',
      'Мартіні', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Я', 'День', 'Місце',
      'Перерва', 'Дорога', 'Розрахунок', 'Нестача', 'Запізнення', 'Продажі',
      'Проїзд', 'Прострочено', 'Переплата', 'Недоплачено', 'Надбавки',
      'Нічні', 'Понаднормові', 'Питання', 'Помічник', 'Скасувати', 'Назад',
      'Внести', 'Записати', 'Позначити', 'Зняти', 'Прибрати', 'Поставити',
      'Роздати', 'Беру', 'Можу', 'Плани', 'план', 'ставка', 'раз', 'день',
      'сьогодні', 'відсоток', 'Відсоток', 'Дії', 'Дні', 'До', 'Коли',
      'Скільки', 'Стільки', 'Зміни', 'Зміна', 'зміна', 'зміни', 'Календар',
      'Графік', 'Виплати', 'Підробітки', 'Спільна каса', 'Опора закладу',
      'Тверда рука', 'Залізна зміна', 'Легенда залу', 'Улюблена зміна',
      'Тільки почали', 'Входите в ритм', 'Відпочинок', 'Кавомолка',
      // The same word in both languages, or a bare suffix with nothing to
      // translate in it.
      '/день', '/місяць', '/тиждень', 'Ввести код', 'Ночей', 'без ставки', 'фриланс',
      'Тип', 'весь день', 'Кому', 'За', 'дорога', 'форма', 'Ок',
      // Abbreviations and endings that carry no word to translate.
      'го', 'дн.', 'с', 'с.', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'Банки',
    ]);

    const untranslated = Object.entries(UK)
      .filter(([key, value]) => key === value && !same.has(value))
      .map(([key]) => key);

    expect(untranslated.sort()).toEqual([]);
  });
});
