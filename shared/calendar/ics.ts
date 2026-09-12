/*
 * A deliberately small ICS reader.
 *
 * Half the trade keeps its rota in Google Calendar; this turns an exported
 * .ics into rows Shifter can preview and apply. RFC 5545 is bottomless, so
 * the reader takes the common shapes — folded lines, TZID/floating/UTC
 * times, VALUE=DATE, weekly and daily RRULEs with COUNT/UNTIL/BYDAY — and
 * reports everything else as «не разобрали» instead of guessing. An import
 * that quietly invents shifts is worse than one that honestly skips.
 */

export interface IcsOccurrence {
  summary: string;
  /** yyyy-MM-dd, wall-clock date. */
  date: string;
  /** HH:mm, or null for an all-day event. */
  start: string | null;
  end: string | null;
}

export interface IcsRead {
  occurrences: IcsOccurrence[];
  /** Summaries whose recurrence we refused to guess. */
  unparsed: string[];
}

/** RFC 5545 line folding: CRLF followed by a space continues the line. */
const unfold = (text: string): string[] =>
  text
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);

interface Stamp {
  date: string;
  time: string | null;
}

/**
 * One DTSTART/DTEND value into wall-clock date+time. A trailing Z is UTC and
 * converts to the browser's clock — a rota means wall time, and the person
 * importing is standing in the timezone the rota is about.
 */
const parseStamp = (raw: string): Stamp | null => {
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);

  if (dateOnly !== null) {
    return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: null };
  }

  const full = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(raw);

  if (full === null) return null;

  if (full[7] === 'Z') {
    const at = new Date(Date.UTC(
      Number(full[1]), Number(full[2]) - 1, Number(full[3]),
      Number(full[4]), Number(full[5]), Number(full[6] ?? '0'),
    ));

    return {
      date: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`,
      time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`,
    };
  }

  return {
    date: `${full[1]}-${full[2]}-${full[3]}`,
    time: `${full[4]}:${full[5]}`,
  };
};

const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const addDays = (date: string, days: number): string => {
  const at = new Date(`${date}T12:00:00`);

  at.setDate(at.getDate() + days);

  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};

/** Expands one event's recurrence. Null means the rule was beyond us. */
const expand = (
  start: Stamp,
  rrule: string | null,
  horizon: number,
): string[] | null => {
  if (rrule === null) return [start.date];

  const parts = new Map(
    rrule.split(';').map((piece) => {
      const [key, value] = piece.split('=');

      return [key, value ?? ''] as const;
    }),
  );

  const freq = parts.get('FREQ');

  if (freq !== 'WEEKLY' && freq !== 'DAILY') return null;

  const interval = Number(parts.get('INTERVAL') ?? '1');

  if (!Number.isInteger(interval) || interval < 1 || interval > 4) return null;

  const count = parts.has('COUNT') ? Number(parts.get('COUNT')) : null;
  const untilRaw = parts.get('UNTIL');
  const until = untilRaw !== undefined ? parseStamp(untilRaw)?.date ?? null : null;

  if (count === null && until === null) {
    // An endless rule gets the horizon, not infinity.
  }

  // WEEKLY without BYDAY recurs on the start's own weekday — not daily.
  const startWeekday = new Date(`${start.date}T12:00:00`).getDay();
  const weekdays = parts.has('BYDAY')
    ? parts.get('BYDAY')!.split(',').map((day) => BYDAY[day]).filter((day) => day !== undefined)
    : freq === 'WEEKLY'
      ? [startWeekday]
      : null;

  if (parts.has('BYDAY') && (weekdays === null || weekdays.length === 0)) return null;

  const out: string[] = [];
  const stop = until ?? addDays(start.date, horizon);
  let cursor = start.date;
  let step = 0;

  while (cursor <= stop && out.length < 200 && step < 1000) {
    const weekday = new Date(`${cursor}T12:00:00`).getDay();

    const inSet = weekdays === null || weekdays.includes(weekday);
    const onInterval =
      freq === 'DAILY'
        ? step % interval === 0
        : Math.floor(step / 7) % interval === 0;

    if (inSet && onInterval) out.push(cursor);
    if (count !== null && out.length >= count) break;

    cursor = addDays(cursor, 1);
    step += 1;
  }

  return out;
};

export const readIcs = (text: string, horizonDays = 120): IcsRead => {
  const lines = unfold(text);

  const occurrences: IcsOccurrence[] = [];
  const unparsed: string[] = [];

  let inEvent = false;
  let summary = '';
  let start: Stamp | null = null;
  let end: Stamp | null = null;
  let rrule: string | null = null;

  const flush = () => {
    if (summary === '' || start === null) return;

    const days = expand(start, rrule, horizonDays);

    if (days === null) {
      unparsed.push(summary);

      return;
    }

    for (const date of days) {
      occurrences.push({
        summary,
        date,
        start: start.time,
        end: end?.time ?? null,
      });
    }
  };

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      summary = '';
      start = null;
      end = null;
      rrule = null;
      continue;
    }

    if (line === 'END:VEVENT') {
      if (inEvent) flush();
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    const colon = line.indexOf(':');

    if (colon < 0) continue;

    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = head.split(';')[0];

    if (name === 'SUMMARY') summary = value.trim();
    else if (name === 'DTSTART') start = parseStamp(value);
    else if (name === 'DTEND') end = parseStamp(value);
    else if (name === 'RRULE') rrule = value;
  }

  return { occurrences, unparsed: [...new Set(unparsed)] };
};
