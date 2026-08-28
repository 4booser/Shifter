import { describe, expect, it } from 'vitest';

import { nextFocus } from '@/lib/a11y';

/** Stand-ins: the function only ever compares identities and indices. */
const elements = ['first', 'middle', 'last'].map(
  (name) => ({ name }) as unknown as HTMLElement,
);

describe('the focus trap', () => {
  it('wraps from the last element back to the first', () => {
    // Without this a keyboard user tabs straight out of an open overlay into
    // the page behind it and operates a form they cannot see.
    expect(nextFocus(elements, elements[2], false)).toBe(elements[0]);
  });

  it('wraps backwards from the first to the last', () => {
    expect(nextFocus(elements, elements[0], true)).toBe(elements[2]);
  });

  it('leaves the browser alone in the middle of the list', () => {
    // Null means "do nothing", so ordinary tabbing keeps the browser's own
    // order rather than a reimplementation of it.
    expect(nextFocus(elements, elements[1], false)).toBeNull();
    expect(nextFocus(elements, elements[1], true)).toBeNull();
  });

  it('pulls focus back in when it has escaped the overlay', () => {
    expect(nextFocus(elements, null, false)).toBe(elements[0]);
    expect(nextFocus(elements, null, true)).toBe(elements[2]);
  });

  it('has nothing to do in an overlay with nothing focusable', () => {
    expect(nextFocus([], null, false)).toBeNull();
  });

  it('keeps a single focusable element focused', () => {
    const one = [elements[0]];

    expect(nextFocus(one, elements[0], false)).toBe(elements[0]);
    expect(nextFocus(one, elements[0], true)).toBe(elements[0]);
  });
});
