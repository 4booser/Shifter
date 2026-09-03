/**
 * What an hour was worth — or nothing, when there is no honest answer.
 *
 * A rate is a division, and dividing by a few minutes turns a rounding error
 * into a headline: two shifts a minute long each produced «−₴7 805 an hour,
 * down 3371%» on a screen whose own «Hours» tile said 0.
 *
 * The question was being asked in four places with four different guards —
 * `hours > 0`, `hours <= 0`, `rate > 0`, `hours >= 1` — so the same month
 * quoted a rate on one screen and a dot on the next. Under an hour of work
 * there is no rate to quote; there is a number, and it is noise.
 */
export const perHour = (earned: number, hours: number): number | null =>
  hours >= 1 ? earned / hours : null;
