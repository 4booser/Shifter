import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentCardTheme } from '@/lib/export/share-card';

const CSS = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

/** The page as the browser computes it, from a list of the tokens set on it. */
function pageWith(tokens: Record<string, string>) {
  const asked: string[] = [];

  vi.stubGlobal('document', { documentElement: {} });
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) => {
      asked.push(name);

      return tokens[name] ?? '';
    },
  }));

  return asked;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the theme a picture is drawn in', () => {
  it('takes the dark page’s real muted and faint, not the light fallback', () => {
    pageWith({ '--surface': '#1f2126', '--muted': '#9aa0ac', '--faint': '#888e99' });

    expect(currentCardTheme()).toMatchObject({ muted: '#9aa0ac', faint: '#888e99' });
  });

  it('reads only tokens the stylesheet sets, since a name that is not there falls back without a word', () => {
    const asked = pageWith({});

    currentCardTheme();

    expect(asked.length).toBeGreaterThan(0);
    expect(asked.filter((name) => !CSS.includes(`${name}:`))).toEqual([]);
  });

  it('still has something to draw with when a token is missing', () => {
    pageWith({});

    expect(currentCardTheme().muted).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
