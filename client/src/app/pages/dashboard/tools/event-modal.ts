import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TPipe } from '../../../core/i18n/i18n';
import { CalendarStore } from '../../../core/calendar/calendar-store';
import {
  CalendarEvent,
  EMOJI_GROUPS,
  MARK_COLOURS,
} from '../../../core/calendar/calendar.models';
import { Modal } from '../../../shared/modal/modal';

/**
 * Creates or edits one event. The end date defaults to the start and moves with
 * it while they match, so a single day stays a single field until somebody
 * actually wants a range — the common case costs no thought.
 */
@Component({
  selector: 'app-event-modal',
  imports: [TPipe, FormsModule, Modal],
  templateUrl: './event-modal.html',
})
export class EventModal {
  readonly open = input.required<boolean>();
  /** Null creates; an event edits it in place. */
  readonly editing = input<CalendarEvent | null>(null);
  /** Where a new event starts, which is whichever day is open. */
  readonly date = input<string | null>(null);
  readonly closed = output<void>();

  private readonly store = inject(CalendarStore);

  protected readonly colours = MARK_COLOURS;
  protected readonly emojiGroups = EMOJI_GROUPS;
  protected readonly saving = this.store.saving;

  protected readonly name = signal('');
  protected readonly symbol = signal<string | null>(null);
  protected readonly colour = signal(MARK_COLOURS[0].value);
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly allDay = signal(true);
  protected readonly startTime = signal('09:00');
  protected readonly endTime = signal('18:00');
  protected readonly note = signal('');

  /** Guards the reset below against running on every unrelated change. */
  private loadedFor: string | null = null;

  protected readonly days = computed(() => {
    const from = this.from();
    const to = this.to();

    if (from === '' || to === '' || to < from) return 0;

    return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  });

  protected readonly valid = computed(
    () => this.name().trim().length > 0 && this.days() > 0,
  );

  constructor() {
    effect(() => {
      if (!this.open()) {
        this.loadedFor = null;

        return;
      }

      const event = this.editing();
      const key = event === null ? `new:${this.date()}` : `edit:${event.id}`;

      if (key === this.loadedFor) return;

      this.loadedFor = key;

      if (event === null) {
        const start = this.date() ?? '';

        this.name.set('');
        this.symbol.set(null);
        this.colour.set(MARK_COLOURS[0].value);
        this.from.set(start);
        this.to.set(start);
        this.allDay.set(true);
        this.startTime.set('09:00');
        this.endTime.set('18:00');
        this.note.set('');

        return;
      }

      this.name.set(event.name);
      this.symbol.set(event.symbol);
      this.colour.set(event.colour);
      this.from.set(event.start_date);
      this.to.set(event.end_date);
      this.allDay.set(event.start_time === null);
      this.startTime.set(event.start_time ?? '09:00');
      this.endTime.set(event.end_time ?? '18:00');
      this.note.set(event.note ?? '');
    });
  }

  /** Dragging the start past the end takes the end with it rather than erroring. */
  protected setFrom(value: string): void {
    const wasSingleDay = this.from() === this.to();

    this.from.set(value);

    if (wasSingleDay || this.to() < value) this.to.set(value);
  }

  protected pickSymbol(emoji: string): void {
    this.symbol.update((current) => (current === emoji ? null : emoji));
  }

  protected close(): void {
    this.closed.emit();
  }

  protected submit(): void {
    if (!this.valid()) return;

    this.store.saveEvent(
      {
        name: this.name().trim(),
        symbol: this.symbol(),
        colour: this.colour(),
        start_date: this.from(),
        end_date: this.to(),
        start_time: this.allDay() ? null : this.startTime(),
        end_time: this.allDay() ? null : this.endTime(),
        note: this.note().trim() === '' ? null : this.note().trim(),
      },
      this.editing()?.id ?? null,
      () => this.close(),
    );
  }
}
