import { afterEach, describe, expect, it } from 'vitest';

import { useEye } from '@/lib/eye';
import { money, moneyIn, moneyShort } from '@/lib/types';

/**
 * The shutters themselves. The screens all call this one trio, so three
 * assertions cover thirty modules — and the web walker (e2e/eye.spec.ts)
 * guards the same promise on the other platform.
 */
describe('the shut eye', () => {
  afterEach(() => useEye.getState().set(false));

  it('turns money into shutters, not into zeros', () => {
    useEye.getState().set(true);

    expect(money(12400)).toBe('₴•••');
    expect(moneyIn('PLN', 5230)).toBe('••• PLN');
  });

  it('empties the calendar cell instead of dotting the whole grid', () => {
    useEye.getState().set(true);

    expect(moneyShort(1240)).toBe('');
  });

  it('gives every figure back when reopened', () => {
    useEye.getState().set(true);
    useEye.getState().set(false);

    // toLocaleString('ru') groups thousands with U+00A0, not a plain space.
    expect(money(12400)).toBe('₴12\u00a0400');
    expect(moneyIn('PLN', 5230)).toBe('5\u00a0230 PLN');
    expect(moneyShort(1240)).toBe('1,2к');
  });
});
