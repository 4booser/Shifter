import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RU, UK } from '../src/lib/i18n/dictionaries';

/**
 * The dictionaries are phrase-keyed object literals, thousands of lines long,
 * and adding a phrase that is already there is silent in JavaScript: the second
 * entry wins and the first becomes dead weight. TypeScript catches it only as
 * a build error somewhere in the middle of a 3 000-line file, which is exactly
 * when nobody is looking.
 *
 * Read from the source rather than the imported object, because by the time it
 * is an object the duplicate has already been collapsed and there is nothing
 * left to find.
 */
const source = readFileSync(join(__dirname, '../src/lib/i18n/dictionaries.ts'), 'utf8');

/** Both quoted keys ('Record a payment') and bare ones (Overtime). */
const KEY = /^\s*(?:'([^']+)'|([A-Za-z][A-Za-z0-9]*)):/;

function keysOf(name: 'RU' | 'UK'): string[] {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`export const ${name}: Dictionary`));

  expect(start, `${name} dictionary not found`).toBeGreaterThan(-1);

  const keys: string[] = [];

  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('export const ')) break;

    const match = KEY.exec(lines[i]);

    if (match !== null) keys.push(match[1] ?? match[2]);
  }

  return keys;
}

function duplicatesIn(name: 'RU' | 'UK'): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();

  for (const key of keysOf(name)) {
    if (seen.has(key)) twice.add(key);
    seen.add(key);
  }

  return [...twice].sort();
}

describe('the dictionaries', () => {
  it('says each phrase once in Russian', () => {
    expect(duplicatesIn('RU')).toEqual([]);
  });

  it('says each phrase once in Ukrainian', () => {
    expect(duplicatesIn('UK')).toEqual([]);
  });

  it('translates the same phrases into both languages', () => {
    // A phrase in one dictionary and not the other falls back to the English
    // key, which reads as a bug to anybody using that language.
    const missingFromUk = Object.keys(RU).filter((key) => !(key in UK));
    const missingFromRu = Object.keys(UK).filter((key) => !(key in RU));

    expect({ missingFromUk, missingFromRu }).toEqual({ missingFromUk: [], missingFromRu: [] });
  });
});
