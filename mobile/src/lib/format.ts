/**
 * Number formatting that also runs on the animation thread.
 *
 * Everything here is marked as a worklet so Roll can call it sixty times a
 * second without crossing back to JavaScript — which also rules out
 * toLocaleString and Intl, neither of which exists there. Kept out of the
 * component file so it can be tested as what it is: string arithmetic.
 */

/** Groups a number the way this app writes money: 12 400, not 12,400. */
export const spaced = (value: number): string => {
  'worklet';

  const sign = value < 0 ? '−' : '';
  let rest = Math.round(Math.abs(value));
  let tail = '';

  while (rest >= 1000) {
    const group = rest % 1000;

    tail = ` ${group < 10 ? '00' : group < 100 ? '0' : ''}${group}${tail}`;
    rest = Math.floor(rest / 1000);
  }

  return `${sign}${rest}${tail}`;
};

/**
 * One decimal place, written the way both of this app's languages write it.
 *
 * Four screens reached for `toFixed(1)` and got a full stop — «★ 5.0», «9.5 ч»
 * — and two others patched the stop out with a string replace afterwards,
 * which is the same decision made twice in the wrong place. A whole number
 * keeps no tail: «9», not «9,0».
 */
export const tenth = (value: number, places = 1): string => {
  'worklet';

  const rounded = Math.round(value * 10 ** places) / 10 ** places;
  const whole = Math.trunc(rounded);
  const tail = Math.abs(rounded - whole);

  if (tail < 10 ** -places / 2) return spaced(whole);

  const digits = `${Math.round(tail * 10 ** places)}`.padStart(places, '0');

  return `${spaced(whole)},${digits}`;
};

/** Two digits, for a clock. */
export const two = (value: number): string => {
  'worklet';

  return value < 10 ? `0${value}` : `${value}`;
};

/** Seconds as hh:mm:ss, which is how long a shift is talked about. */
export const stopwatch = (seconds: number): string => {
  'worklet';

  const whole = Math.max(0, Math.floor(seconds));

  return `${two(Math.floor(whole / 3600))}:${two(Math.floor((whole % 3600) / 60))}:${two(whole % 60)}`;
};
