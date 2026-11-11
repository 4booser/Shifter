import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { PeopleStrip } from '@/components/roster/people-strip';
import { SaveLine } from '@/components/roster/save-line';
import { SaveState } from '@/lib/roster/save-queue';

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, n: (count: number) => `${count}` }) }));

const CSS = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

const line = (state: SaveState) =>
  renderToStaticMarkup(createElement(SaveLine, { state, failure: null, onRetry: () => undefined }));

/** The class list of the first tag matching. */
const classesOf = (html: string, tag: RegExp) => (tag.exec(html)?.[1] ?? '').split(' ');

describe('the save pill floating over the page', () => {
  it.each(['idle', 'saving', 'saved', 'failed'] as const)('takes no press of its own when %s', (state) => {
    expect(classesOf(line(state), /<div class="([^"]*)"/)).toContain('pointer-events-none');
  });

  it('gives presses back to Try again, and only there', () => {
    expect(classesOf(line('failed'), /<button[^>]*class="([^"]*)"/)).toContain('pointer-events-auto');
    expect(line('failed').match(/pointer-events-auto/g)).toHaveLength(1);
    expect(line('saved')).not.toContain('pointer-events-auto');
    expect(line('saving')).not.toContain('pointer-events-auto');
  });

  it('fades once saved, so it does not sit on a name for good', () => {
    expect(line('saved')).toContain('fade-away');
    expect(line('saving')).not.toContain('fade-away');
    expect(line('failed')).not.toContain('fade-away');
  });

  it('stays gone once it has faded', () => {
    const rule = /\.fade-away\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    const frames = /@keyframes fade-away\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? '';

    expect(rule).toMatch(/animation:\s*fade-away\b.*\bforwards/);
    expect(frames).toMatch(/opacity:\s*0/);
  });

  it('says nothing at all when there is nothing to say', () => {
    expect(line('idle')).not.toContain('card');
  });

  it('lets a failure be read and pressed', () => {
    expect(line('failed')).toContain('Not saved');
    expect(line('failed')).toContain('Try again');
  });
});

describe('the people strip', () => {
  const long = { id: 1, name: 'W'.repeat(40), position: 'W'.repeat(40), colour: '#6366f1' };

  const strip = (count: number) =>
    renderToStaticMarkup(
      createElement(PeopleStrip, {
        people: Array.from({ length: count }, (_, index) => ({ ...long, id: index + 1 })),
        onPerson: () => undefined,
        onAdd: () => undefined,
      }),
    );

  it('holds a chip to the width it has, however long the word in it', () => {
    expect(classesOf(strip(1), /<button[^>]*class="([^"]*)"/)).toContain('max-w-full');
  });

  it('lets the text give way inside the chip, and not the dot', () => {
    const html = strip(1);

    expect(classesOf(html, /<span class="(min-w-0[^"]*)"/)).toContain('truncate');
    expect(classesOf(html, /<span class="([^"]*rounded-full[^"]*)"/)).toContain('flex-none');
  });

  it('still folds a big crew away', () => {
    expect(strip(8)).not.toContain('<details');
    expect(strip(9)).toContain('<details');
  });
});
