import { Component, computed, inject, input, signal } from '@angular/core';

import { TPipe } from '../../core/i18n/i18n';
import { fromKey, keysBetween } from '../../core/calendar/calendar-date';
import { SettingsStore } from '../../core/settings/settings-store';

type MaybeCell = Cell | null;

interface Cell {
  key: string;
  /** 0 = no record; 1..4 = quartile of the range's peak. */
  level: number;
  value: number;
  weekIndex: number;
}

/**
 * A year of work at a glance: columns are weeks, rows are weekdays, and the
 * fill is a sequential ramp of the accent — one hue, light to dark, since the
 * cell encodes magnitude and nothing else.
 */
@Component({
  selector: 'app-heatmap',
  imports: [TPipe],
  templateUrl: './heatmap.html',
})
export class Heatmap {
  /** Earned per 'YYYY-MM-DD' key. */
  readonly values = input.required<ReadonlyMap<string, number>>();
  readonly from = input.required<string>();
  readonly to = input.required<string>();

  private readonly settings = inject(SettingsStore);

  protected readonly hovered = signal<Cell | null>(null);

  protected readonly weeks = computed<MaybeCell[][]>(() => {
    const keys = keysBetween(this.from(), this.to());

    if (keys.length === 0) return [];

    const values = this.values();
    const peak = Math.max(1, ...keys.map((key) => values.get(key) ?? 0));

    // Leading pad so the first column starts on the right weekday row.
    const offset = (fromKey(keys[0]).getDay() + 6) % 7;
    const columns: MaybeCell[][] = [];
    let column: MaybeCell[] = new Array<MaybeCell>(offset).fill(null);

    for (const key of keys) {
      const value = values.get(key) ?? 0;

      column.push({
        key,
        value,
        level: value === 0 ? 0 : Math.min(4, Math.ceil((value / peak) * 4)),
        weekIndex: columns.length,
      });

      if (column.length === 7) {
        columns.push(column);
        column = [];
      }
    }

    if (column.length > 0) columns.push(column);

    return columns;
  });

  protected tooltipLeft(cell: Cell): string {
    const total = this.weeks().length;

    return `${((cell.weekIndex + 0.5) / total) * 100}%`;
  }

  protected format(value: number): string {
    return this.settings.format(value);
  }
}
