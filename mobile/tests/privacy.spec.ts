/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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

const read = (path: string) => readFileSync(path, 'utf8');
const relative = (path: string) => path.slice(ROOT.length + 1);

/**
 * The bank connection rests on one promise: the token stays on the phone. A
 * promise nobody checks stops being true at the first refactor that finds it
 * convenient — so it is checked here, by reading the source rather than by
 * trusting it.
 */
describe('the monobank token never leaves the phone', () => {
  it('is sent in exactly one file, and that file talks only to monobank', () => {
    const senders = sources().filter((path) => read(path).includes('X-Token'));

    expect(senders.map(relative)).toEqual(['lib/mono-api.ts']);

    const client = read(join(ROOT, 'lib', 'mono-api.ts'));

    expect(client).toContain("https://api.monobank.ua");
    // The app's own client adds a bearer to every call. This file must not be
    // able to reach it, or a token could ride along on a Shifter request.
    expect(client).not.toContain("from './api'");
    expect(client).not.toContain("from '@/lib/api'");
  });

  it('is read out of the keychain in exactly one file', () => {
    const readers = sources().filter((path) => read(path).includes('shifter.mono.token'));

    expect(readers.map(relative)).toEqual(['store/mono.ts']);
  });

  it('is never handed to the app’s own API client', () => {
    // Anything that imports the Shifter client and also holds a token is one
    // careless line away from posting it.
    const risky = sources().filter((path) => {
      const source = read(path);

      return (
        (source.includes("from '@/lib/api'") || source.includes("from './api'"))
        && source.includes('shifter.mono.token')
      );
    });

    expect(risky.map(relative)).toEqual([]);
  });

  it('is never written to a log', () => {
    const talkative = sources().filter((path) => {
      const source = read(path);

      if (!source.includes('token')) return false;

      return /console\.(log|warn|error|info)[^\n]*token/i.test(source);
    });

    expect(talkative.map(relative)).toEqual([]);
  });

  it('does not travel in an error message from the bank client', () => {
    const client = read(join(ROOT, 'lib', 'mono-api.ts'));
    const thrown = [...client.matchAll(/new Error\(([^)]*)\)/g)].map((match) => match[1]);

    expect(thrown.some((message) => message.includes('token'))).toBe(false);
  });
});

describe('the statement stays on the phone', () => {
  it('is cached only in local storage, never posted anywhere', () => {
    const store = read(join(ROOT, 'store', 'mono.ts'));

    expect(store).toContain('AsyncStorage');
    expect(store).not.toContain("from '@/lib/api'");
  });
});
