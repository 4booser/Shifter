import { CalendarDayData } from './models';

const HEADER = [
  'date',
  'shifts',
  'hours',
  'worked',
  'sales',
  'tips',
  'earned',
  'planned',
  'note',
];

/** Builds a CSV of the days on screen. */
export function daysToCsv(days: CalendarDayData[]): string {
  const rows = days.map((day) => [
    day.date,
    day.shifts.map((entry) => entry.name).join(' + '),
    day.shifts.reduce((total, entry) => total + entry.hours, 0),
    day.shifts.every((entry) => entry.worked) ? 'yes' : 'partly',
    day.sales.map((entry) => `${entry.name} x${entry.quantity}`).join(' + '),
    day.tips ?? 0,
    day.earned,
    day.planned,
    day.note ?? '',
  ]);

  return [HEADER, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

export function downloadCsv(name: string, contents: string): void {
  // A BOM so Excel opens UTF-8 correctly instead of mangling non-Latin names.
  const blob = new Blob(['﻿', contents], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = name;
  link.click();

  URL.revokeObjectURL(url);
}

/** Quotes anything containing a separator, a quote or a newline. */
/** A note is text, and a spreadsheet must not read it as anything else. */
function escape(value: string | number): string {
  const text = `${value}`;
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
