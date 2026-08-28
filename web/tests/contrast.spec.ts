import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every theme, checked against the surface it is painted on.
 *
 * The palettes were designed one at a time and eight of them now exist. A
 * warning colour that reads on paper can vanish on plum, and the person it
 * vanishes for is the one being warned. Nobody notices, because whoever picked
 * the colour was looking at a different theme.
 *
 * This reads the stylesheet rather than a copy of it, so it cannot drift: a
 * new theme is checked the moment somebody adds it, and a token quietly
 * darkened fails here before it reaches anybody.
 */

const CSS = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

const channel = (value: number): number =>
  value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** The WCAG ratio, 1 (identical) to 21 (black on white). */
const contrast = (one: string, two: string): number => {
  const [light, dark] = [luminance(one), luminance(two)].sort((a, b) => b - a);

  return (light + 0.05) / (dark + 0.05);
};

/**
 * Every block in the stylesheet, as a map of the tokens it sets. Later blocks
 * override earlier ones, which is how the cascade already works — a theme that
 * only redefines the surface keeps the shared accents above it.
 */
function themes(): Map<string, Record<string, string>> {
  const found = new Map<string, Record<string, string>>();
  const base: Record<string, string> = {};

  // Comments first: a stylesheet header full of prose about braces makes any
  // single sweeping regex read the file wrong, quietly and in its favour.
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

  // Each selector, then the balanced block after it. Simpler than one pattern
  // over the whole file and it cannot swallow the block it was aiming at.
  for (const at of css.matchAll(/(^|[};])\s*((?::root|\[data-theme=)[^{]*)\{/gm)) {
    const selector = at[2].trim();
    const open = at.index! + at[0].length;
    const close = css.indexOf('}', open);

    if (close === -1) continue;

    const tokens: Record<string, string> = {};

    for (const line of css.slice(open, close).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      tokens[line[1]] = line[2];
    }

    if (Object.keys(tokens).length === 0) continue;

    if (selector.startsWith(':root')) {
      Object.assign(base, tokens);

      continue;
    }

    // "[data-theme='dark'], [data-theme='night'], …" sets the same tokens for
    // several themes at once.
    for (const name of selector.split(',')) {
      const match = /\[data-theme='([a-z]+)'\]/.exec(name.trim());

      if (match === null) continue;

      found.set(match[1], { ...base, ...(found.get(match[1]) ?? {}), ...tokens });
    }
  }

  // Light is the bare :root, which no [data-theme] block names.
  found.set('paper', { ...base });

  return found;
}

/**
 * Three to one. The WCAG floor for large text and for anything that carries
 * meaning by colour — which is what these tokens do: they are the difference
 * between a figure that is fine and one that is not.
 */
const FLOOR = 3;

const CARRIERS = ['danger', 'good', 'warn', 'accent'];

describe('every theme against the surface it is painted on', () => {
  const all = themes();

  it('finds all the themes the stylesheet defines', () => {
    // A guard on the guard: a regex that quietly matched nothing would pass
    // every check below and prove nothing at all.
    expect(all.size).toBeGreaterThanOrEqual(8);
    expect([...all.keys()]).toContain('plum');
  });

  for (const [name, tokens] of all) {
    it(`reads on ${name}`, () => {
      const surface = tokens['surface'];

      expect(surface, `${name} has no surface`).toBeDefined();

      const failures = CARRIERS.filter((token) => {
        const colour = tokens[token];

        return colour !== undefined && contrast(colour, surface) < FLOOR;
      }).map((token) => `${token} ${tokens[token]} on ${surface}: ${contrast(tokens[token], surface).toFixed(2)}`);

      expect(failures).toEqual([]);
    });

    it(`keeps ${name} text legible`, () => {
      // Body text is held to the full 4.5, which is the one place the large
      // text allowance does not apply.
      expect(contrast(tokens['text'], tokens['surface'])).toBeGreaterThanOrEqual(4.5);
      // Muted is still text somebody has to read, not decoration.
      expect(contrast(tokens['muted'], tokens['surface'])).toBeGreaterThanOrEqual(FLOOR);
    });
  }
});
