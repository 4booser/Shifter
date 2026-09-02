import { CalendarDayData, CalendarEvent } from '../calendar/models';

/**
 * Builds an iCalendar file from the shifts and events on screen, so a rota can
 * be opened in whatever calendar the phone already uses. Generated in the
 * browser like the CSV: the data is loaded, and a download endpoint would need
 * the token in a query string to work from a plain link.
 *
 * This is a file, not a subscription — it is a snapshot, and re-exporting after
 * a change replaces the entries rather than updating them in place. That is
 * what the stable UIDs below are for.
 */

export interface IcsOptions {
  days: CalendarDayData[];
  events: CalendarEvent[];
  /** Prefix for the entry titles, so several exports do not blur together. */
  calendarName: string;
}

/** Anything that would otherwise be read as syntax. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * RFC 5545 lines are folded at 75 octets, continued with a leading space. Long
 * shift names in Cyrillic reach that in about thirty characters, so this is not
 * an edge case — an unfolded file is simply rejected by some calendars.
 */
function fold(line: string): string {
  /*
   * Octets, not characters — and never through the middle of one.
   *
   * The limit in RFC 5545 is bytes, and this counted string length: «Вечер в
   * баре» is two bytes a letter and a shift symbol is four, so a line this
   * called seventy-five could leave as a hundred and fifty and be refused by
   * a strict reader. Slicing by code unit could also cut an emoji in half and
   * emit broken UTF-8 — so the walk is over whole code points.
   */
  const bytes = (text: string) => new TextEncoder().encode(text).length;

  if (bytes(line) <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let limit = 75;

  for (const point of line) {
    if (bytes(current) + bytes(point) > limit) {
      parts.push(parts.length === 0 ? current : ` ${current}`);
      current = point;
      // Continuation lines carry a leading space, which is an octet too.
      limit = 74;

      continue;
    }

    current += point;
  }

  if (current !== '') parts.push(parts.length === 0 ? current : ` ${current}`);

  return parts.join('\r\n');
}

const stamp = (date: Date): string =>
  `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

/** "YYYY-MM-DD" and "HH:mm" to a local-time value, without a zone. */
function localStamp(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

/** The day after, because an all-day DTEND is exclusive. */
function dayAfter(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);

  parsed.setUTCDate(parsed.getUTCDate() + 1);

  return parsed.toISOString().slice(0, 10).replace(/-/g, '');
}

export function buildIcs({ days, events, calendarName }: IcsOptions): string {
  const now = stamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shifter//Shift calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const day of days) {
    for (const shift of day.shifts) {
      // A night shift ends on the clock before it starts, so its end belongs to
      // the next day. Without this the entry collapses to a negative span and
      // calendars either drop it or draw it backwards.
      const overnight = shift.end_time <= shift.start_time;
      const endDate = overnight ? dayAfter(day.date).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : day.date;

      lines.push(
        'BEGIN:VEVENT',
        // Stable per shift per day, so a second export updates the entry
        // instead of leaving a duplicate beside it.
        `UID:shift-${day.date}-${shift.shift_id}@shifter.ink`,
        `DTSTAMP:${now}`,
        `DTSTART:${localStamp(day.date, shift.start_time)}`,
        `DTEND:${localStamp(endDate, shift.end_time)}`,
        fold(`SUMMARY:${escapeText(shift.name)}`),
        // Planned shifts are marked tentative, which calendars show differently
        // from a confirmed one — the same distinction the app makes.
        `STATUS:${shift.worked ? 'CONFIRMED' : 'TENTATIVE'}`,
        'END:VEVENT',
      );
    }
  }

  for (const event of events) {
    const allDay = event.start_time === null;

    lines.push(
      'BEGIN:VEVENT',
      `UID:event-${event.id}@shifter.ink`,
      `DTSTAMP:${now}`,
    );

    if (allDay) {
      lines.push(
        `DTSTART;VALUE=DATE:${event.start_date.replace(/-/g, '')}`,
        // Exclusive, so a single day ends on the following one.
        `DTEND;VALUE=DATE:${dayAfter(event.end_date)}`,
      );
    } else {
      lines.push(
        `DTSTART:${localStamp(event.start_date, event.start_time!)}`,
        `DTEND:${localStamp(event.end_date, event.end_time ?? event.start_time!)}`,
      );
    }

    lines.push(fold(`SUMMARY:${escapeText(event.name)}`));

    if (event.note !== null && event.note !== '') {
      lines.push(fold(`DESCRIPTION:${escapeText(event.note)}`));
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  // CRLF throughout: the specification requires it, and the calendars that
  // tolerate bare newlines are not the ones people use.
  return lines.map(fold).join('\r\n');
}

export function downloadIcs(name: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = name;
  link.click();

  URL.revokeObjectURL(url);
}
