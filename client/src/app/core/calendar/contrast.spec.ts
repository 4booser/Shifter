import { describe, expect, it } from 'vitest';

import { luminance, readableInk } from './contrast';

describe('readableInk', () => {
  it('puts dark ink on the pale end of the palette', () => {
    // Lemon and lime are the two that white disappeared into.
    expect(readableInk('#F5C518')).toBe('#16181d');
    expect(readableInk('#5CD65C')).toBe('#16181d');
    expect(readableInk('#38BDF8')).toBe('#16181d');
  });

  it('puts white on the deep end', () => {
    expect(readableInk('#334155')).toBe('#ffffff');
    expect(readableInk('#4338CA')).toBe('#ffffff');
    expect(readableInk('#B91C4A')).toBe('#ffffff');
  });

  it('handles the extremes and short hex', () => {
    expect(readableInk('#ffffff')).toBe('#16181d');
    expect(readableInk('#000000')).toBe('#ffffff');
    expect(readableInk('#fff')).toBe('#16181d');
  });

  it('falls back to white ink when the colour cannot be read', () => {
    expect(readableInk('not a colour')).toBe('#ffffff');
    expect(luminance('not a colour')).toBe(0);
  });

  it('orders luminance the way the eye does', () => {
    expect(luminance('#ffffff')).toBeGreaterThan(luminance('#F5C518'));
    expect(luminance('#F5C518')).toBeGreaterThan(luminance('#334155'));
    expect(luminance('#334155')).toBeGreaterThan(luminance('#000000'));
  });
});
