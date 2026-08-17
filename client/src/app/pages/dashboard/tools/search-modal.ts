import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CalendarApi } from '../../../core/calendar/calendar-api';
import { CalendarStore } from '../../../core/calendar/calendar-store';
import { CalendarDayData } from '../../../core/calendar/calendar.models';
import { I18n, TPipe } from '../../../core/i18n/i18n';
import { Modal } from '../../../shared/modal/modal';
import { MoneyPipe } from '../../../shared/money/money-pipe';

/** Wide enough to mean "everything", the same span the store uses. */
const ALL_TIME = { from: '2000-01-01', to: '2099-12-31' };

interface Hit {
  date: string;
  label: string;
  note: string | null;
  shifts: string;
  earned: number;
}

/**
 * Finds a day by what was written on it. Notes are where people put the things
 * the schema has no column for — who covered a shift, why a night was short —
 * and until now the only way back to one was scrolling the calendar.
 */
@Component({
  selector: 'app-search-modal',
  imports: [FormsModule, TPipe, MoneyPipe, Modal],
  templateUrl: './search-modal.html',
})
export class SearchModal {
  private readonly api = inject(CalendarApi);
  private readonly store = inject(CalendarStore);
  private readonly i18n = inject(I18n);

  readonly closed = output<void>();

  protected readonly query = signal('');
  protected readonly loading = signal(true);

  private readonly all = signal<CalendarDayData[]>([]);

  constructor() {
    // One request for the whole history: a search that only looked at the
    // month on screen would miss precisely the day being hunted for.
    this.api.days(ALL_TIME.from, ALL_TIME.to).subscribe({
      next: (response) => {
        this.all.set(response.days);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected readonly hits = computed<Hit[]>(() => {
    const needle = this.query().trim().toLowerCase();

    if (needle.length < 2) return [];

    const locale = this.i18n.lang();
    const format = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    return this.all()
      .map((day) => ({
        date: day.date,
        label: format.format(new Date(`${day.date}T00:00:00`)),
        note: day.note,
        shifts: day.shifts.map((entry) => entry.name).join(', '),
        earned: day.earned,
      }))
      .filter((hit) =>
        // The date is searchable too, so "2026-03" jumps to a month.
        `${hit.note ?? ''} ${hit.shifts} ${hit.date}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60);
  });

  /** Opens the day on the calendar and gets out of the way. */
  protected go(date: string): void {
    this.store.openDate(date);
    this.closed.emit();
  }

  protected close(): void {
    this.closed.emit();
  }
}
