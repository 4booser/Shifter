/** Starting the shift by itself, at the hour somebody chose in advance. */

export interface AutoStartRule {
  /** The template it belongs to. */
  shiftId: number;
  /** "18:00" — the hour it starts by itself. Null: only the stop is set. */
  at: string | null;
  /** "10:45" — the hour the running shift closes itself, anchored to the plan's own end rather than to the clock's… */
  stopAt?: string | null;
}

export interface AutoStartDecision {
  shiftId: number;
  /** ISO instant the clock should read as the start — the chosen hour, today. */
  startedAt: string;
}

/** Whether an auto-start is due right now. */
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
    if (rule.at === null || rule.at === undefined) continue;
    if (!input.planned.some((plan) => plan.shiftId === rule.shiftId)) continue;

    // Fired once per day.
    if (input.firedToday.includes(rule.shiftId)) continue;

    const startAt = new Date(`${input.today}T${rule.at}:00`).getTime();

    if (Number.isNaN(startAt)) continue;

    // Due, and not absurdly stale: an auto-start discovered ten hours late is most of a shift long gone, and…
    const age = input.now - startAt;

    if (age < 0 || age > 4 * 60 * 60 * 1000) continue;

    return {
      shiftId: rule.shiftId,
      startedAt: new Date(startAt).toISOString(),
    };
  }

  return null;
}

export interface AutoStopDecision {
  /** ISO instant the clock should read as the end — the chosen hour. */
  endsAt: string;
}

/** Whether the running shift should close itself now. */
export function dueAutoStop(input: {
  /** The rule for the running shift's template, where there is one. */
  stopAt: string | null | undefined;
  /** Milliseconds: when the running shift says it began. */
  startedMs: number;
  /** Milliseconds: the instant the plan says this shift ends. */
  plannedEndMs: number;
  /** Milliseconds since epoch. */
  now: number;
}): AutoStopDecision | null {
  const clock = input.stopAt;

  if (clock === null || clock === undefined || clock === '') return null;

  const [hour, minute] = clock.split(':').map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const planned = new Date(input.plannedEndMs);
  const candidate = new Date(planned);

  candidate.setHours(hour, minute, 0, 0);

  // Nearest occurrence to the plan's end: 10:45 against an 11:00 end is the
  // same morning; against a 23:00 end it is the next.
  const half = 12 * 60 * 60 * 1000;

  if (candidate.getTime() - planned.getTime() > half) candidate.setDate(candidate.getDate() - 1);
  if (planned.getTime() - candidate.getTime() > half) candidate.setDate(candidate.getDate() + 1);

  // Never before it began: a stop earlier than the start is a rule somebody
  // set for tomorrow's version of this shift.
  while (candidate.getTime() <= input.startedMs) candidate.setDate(candidate.getDate() + 1);

  if (input.now < candidate.getTime()) return null;

  return { endsAt: candidate.toISOString() };
}
