import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

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

/**
 * The keys on one line of a dictionary.
 *
 * Not a regular expression, because two things defeat one. Keys come both
 * quoted ('Record a payment') and bare (Overtime); and a *value* can contain a
 * word followed by a colon — "Аккаунт → Calendar feed:" — which a pattern
 * scanning the whole line reads as a second key. So the line is walked once,
 * quotes are tracked, and only a colon at the top level ends a key.
 *
 * It has to see every pair on a line rather than the first: the weekday
 * abbreviations live seven to a line, and an anchored pattern read one of them
 * and silently allowed six duplicates — which is the failure this file exists
 * to catch.
 */
function keysIn(line: string): string[] {
  const keys: string[] = [];

  let token = '';
  let quoted = false;
  let expecting = true;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (quoted) {
      if (c === '\\') i++;
      else if (c === "'") quoted = false;
      else token += c;

      continue;
    }

    if (c === "'") {
      quoted = true;
    } else if (c === ':' && expecting) {
      if (token.trim() !== '') keys.push(token.trim());

      token = '';
      expecting = false;
    } else if (c === ',') {
      token = '';
      expecting = true;
    } else if (expecting) {
      token += c;
    }
  }

  return keys;
}

function keysOf(name: 'RU' | 'UK'): string[] {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`export const ${name}: Dictionary`));

  expect(start, `${name} dictionary not found`).toBeGreaterThan(-1);

  const keys: string[] = [];

  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('export const ')) break;

    keys.push(...keysIn(lines[i]));
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

  it('knows every phrase the code asks it for', () => {
    // The checks above compare RU with UK, so a phrase missing from both is
    // invisible to them — and five were, rendering raw English into a Russian
    // interface. This reads the call sites instead.
    const files = walk(join(__dirname, '../src')).filter(
      (file) => file.endsWith('.ts') || file.endsWith('.tsx'),
    );

    const missing = new Set<string>();

    for (const file of files) {
      if (file.endsWith('dictionaries.ts')) continue;

      const source = readFileSync(file, 'utf8');

      // Only the literal form. A key built at runtime cannot be checked here,
      // and there are few enough of those to keep in mind.
      for (const [, key] of source.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
        const phrase = key.replace(/\\'/g, "'");

        if (!(phrase in RU) || !(phrase in UK)) missing.add(`${basename(file)}: ${phrase}`);
      }
    }

    expect([...missing].sort()).toEqual([]);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);

    return entry.isDirectory() ? walk(full) : [full];
  });
}
