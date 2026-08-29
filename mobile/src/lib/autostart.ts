/**
 * Starting the shift by itself, at the hour somebody chose in advance.
 *
 * The button stays: pressing it is a fact about now. This is for the other
 * evening — the one where the phone stays in the locker until the break, and
 * the shift is half over before anything is pressed. Somebody who has already
 * said "my Вечер starts at 18:00" should not have to say it again every day.
 *
 * Two honesty rules carry the whole feature.
 *
 * The clock is backdated to the chosen hour, never started at the moment the
 * app happened to open. An auto-start is a statement about when work began,
 * and 18:00 is when it began — a live shift that says 20:47 because that is
 * when the phone came out of the locker is wrong by exactly the amount the
 * person cares about.
 *
 * And it only fires on a day the shift is actually planned. A standing time
 * on a template is not a rota; the calendar is.
 */

export interface AutoStartRule {
  /** The template it belongs to. */
  shiftId: number;
  /** "18:00" — the hour it starts by itself. */
  at: string;
}

export interface AutoStartDecision {
  shiftId: number;
  /** ISO instant the clock should read as the start — the chosen hour, today. */
  startedAt: string;
}

/**
 * Whether an auto-start is due right now.
 *
 * Pure, and handed everything: the rules, today's planned shifts, whether a
 * live shift is already running, which auto-starts already fired today, and
 * the clock.
 */
export function dueAutoStart(input: {
  rules: AutoStartRule[];
  /** Today's planned-and-not-worked shifts, by template id. */
  planned: { shiftId: number }[];
  /** A shift already running: nothing may start over it, ever. */
  liveRunning: boolean;
  /** Template ids already auto-started today, so a stop stays stopped. */
  firedToday: number[];
  /** Milliseconds since epoch. */
  now: number;
  /** 'YYYY-MM-DD', the phone's own day. */
  today: string;
}): AutoStartDecision | null {
  if (input.liveRunning) return null;

  for (const rule of input.rules) {
    if (!input.planned.some((plan) => plan.shiftId === rule.shiftId)) continue;

    // Fired once per day. Somebody who auto-started at 18:00 and clocked out
    // at 19:00 has said something by clocking out, and starting them again at
    // 19:01 would be the app overruling them.
    if (input.firedToday.includes(rule.shiftId)) continue;

    const startAt = new Date(`${input.today}T${rule.at}:00`).getTime();

    if (Number.isNaN(startAt)) continue;

    // Due, and not absurdly stale: an auto-start discovered ten hours late is
    // most of a shift long gone, and backdating it would invent a workday.
    // Four hours is late-from-the-locker; more is yesterday's news.
    const age = input.now - startAt;

    if (age < 0 || age > 4 * 60 * 60 * 1000) continue;

    return {
      shiftId: rule.shiftId,
      startedAt: new Date(startAt).toISOString(),
    };
  }

  return null;
}
