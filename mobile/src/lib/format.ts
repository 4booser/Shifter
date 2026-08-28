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
