/*
 * The line that keeps one copy possible.
 *
 * ../shared holds the arithmetic the web and the phone both read. It can only
 * stay one copy while it depends on neither platform: the moment something in
 * there reaches for `@/`, for expo, or for next, one of the two clients stops
 * being able to compile it and the file goes back to being two files.
 *
 * Nothing about that is visible while editing — the web's own tsc is perfectly
 * happy with an `@/` import. This test is the only thing that notices.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SHARED = join(import.meta.dirname, '..', '..', 'shared');

const filesUnder = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);

    return statSync(full).isDirectory()
      ? filesUnder(full)
      : full.endsWith('.ts')
        ? [full]
        : [];
  });

const importsOf = (source: string): string[] =>
  [...source.matchAll(/(?:from|import)\s+'([^']+)'/g)].map((match) => match[1]);

describe('shared', () => {
  it('has files to check', () => {
    expect(filesUnder(SHARED).length).toBeGreaterThan(5);
  });

  it('imports nothing but its own neighbours', () => {
    const strays: string[] = [];

    for (const file of filesUnder(SHARED)) {
      for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
        // A relative path inside shared/ is the only allowed shape. Anything
        // else is a platform — there are no runtime dependencies here on
        // purpose, not even a date library.
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
          strays.push(`${file.slice(SHARED.length + 1)} → ${specifier}`);
        }
      }
    }

    expect(strays).toEqual([]);
  });

  it('does not reach back out of shared/', () => {
    const escapes: string[] = [];

    for (const file of filesUnder(SHARED)) {
      for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
        // '../mono/mono' is fine — that is one shared folder reading another.
        // '../../web/src/...' is a client, reached sideways.
        if (specifier.includes('../../')) escapes.push(`${file} → ${specifier}`);
      }
    }

    expect(escapes).toEqual([]);
  });
});
