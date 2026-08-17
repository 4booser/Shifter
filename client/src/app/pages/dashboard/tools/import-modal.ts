import { Component, computed, inject, output, signal } from '@angular/core';

import { CalendarStore } from '../../../core/calendar/calendar-store';
import { ImportPreview, ImportRow, readSpreadsheet } from '../../../core/export/import';
import { TPipe } from '../../../core/i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { Modal } from '../../../shared/modal/modal';

/**
 * Bringing a spreadsheet in. Nothing is written until the preview has been
 * looked at: an import that half-succeeds is worse than one that never ran,
 * because there is no way to tell which half.
 */
@Component({
  selector: 'app-import-modal',
  imports: [TPipe, Modal, Icon],
  templateUrl: './import-modal.html',
})
export class ImportModal {
  private readonly store = inject(CalendarStore);

  readonly closed = output<void>();

  protected readonly preview = signal<ImportPreview | null>(null);
  protected readonly fileName = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly done = signal<number | null>(null);

  /** Templates are matched by name, so an unknown name is worth flagging. */
  protected readonly rows = computed<ImportRow[]>(() => {
    const preview = this.preview();

    if (preview === null) return [];

    const known = new Set(this.store.allTemplates().map((template) => template.name.toLowerCase()));

    return preview.rows.map((row) =>
      row.problem === null && row.shift !== null && !known.has(row.shift.toLowerCase())
        ? { ...row, problem: 'No shift with that name.' }
        : row,
    );
  });

  protected readonly usable = computed(() => this.rows().filter((row) => row.problem === null));

  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file === undefined) return;

    this.error.set(null);
    this.done.set(null);
    this.fileName.set(file.name);

    try {
      this.preview.set(await readSpreadsheet(file));
    } catch (error: unknown) {
      this.preview.set(null);
      this.error.set(error instanceof Error ? error.message : 'Could not read the file.');
    }
  }

  protected async apply(): Promise<void> {
    const rows = this.usable();

    if (rows.length === 0) return;

    this.busy.set(true);

    const written = await this.store.importDays(
      rows.map((row) => ({
        date: row.date,
        shift: row.shift,
        tips: row.tips,
        tipsCash: row.tipsCash,
        deductions: row.deductions,
        note: row.note,
      })),
    );

    this.busy.set(false);
    this.done.set(written);
  }

  protected close(): void {
    this.closed.emit();
  }
}
