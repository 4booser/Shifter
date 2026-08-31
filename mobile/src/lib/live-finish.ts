import { api } from '@/lib/api';
import { pad } from '@/lib/calendar';
import { CalendarDayData, DaysResponse, toSavePayload } from '@/lib/types';
import { LiveShift, breakSeconds } from '@/store/live';

/**
 * Writing a finished shift into its day.
 *
 * Lifted out of the live screen so the auto-stop can use the very same
 * routine: a shift that closes itself at the chosen hour must land in the
 * calendar exactly as one closed by the button, or the two would quietly
 * disagree about what a worked day looks like.
 */
const clock = (at: Date): string => `${pad(at.getHours())}:${pad(at.getMinutes())}`;

export async function writeFinishedShift(input: {
  live: LiveShift;
  /** ISO instant of the end. Defaults to now. */
  endAt?: string;
}): Promise<void> {
  const { live } = input;
  const started = new Date(live.startedAt);
  const ended = input.endAt === undefined ? new Date() : new Date(input.endAt);
  const paused = breakSeconds(live, ended.getTime());

  const summary = await api<DaysResponse>(`/shifter/v1/days?from=${live.date}&to=${live.date}`);
  const day: CalendarDayData | undefined = summary.days[0];
  const payload = toSavePayload(day);
  const entry = payload.shifts.find((row) => row.shift_id === live.shiftId);
  const stamp = {
    actual_start: clock(started),
    actual_end: clock(ended),
    worked: true,
    // Minutes, because that is what the server prices in — and null rather
    // than zero where nobody took one, so the template's own unpaid minutes
    // are kept rather than overwritten with "none".
    break_minutes: paused > 30 ? Math.round(paused / 60) : null,
  };

  if (entry === undefined) {
    payload.shifts.push({ shift_id: live.shiftId, needs_cover: false, revenue: null, ...stamp });
  } else {
    Object.assign(entry, stamp);
  }

  await api(`/shifter/v1/days/${live.date}`, { method: 'PUT', body: payload });
}
