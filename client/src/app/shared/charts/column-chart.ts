import { Component, computed, inject, input, signal } from '@angular/core';

import { SettingsStore } from '../../core/settings/settings-store';
import { CHART_H, CHART_W, Column, PAD, PLOT_H, Tick } from './chart-math';

/**
 * A single-series column chart with an optional planned overlay. Inline SVG:
 * colours ride the CSS variables, so themes and the accent picker apply to the
 * marks with no code in between.
 */
@Component({
  selector: 'app-column-chart',
  templateUrl: './column-chart.html',
})
export class ColumnChart {
  readonly columns = input.required<Column[]>();
  readonly ticks = input.required<Tick[]>();
  /** Draw every Nth x-label; 1 labels them all. */
  readonly labelEvery = input(1);
  /** Direct-label the peak column instead of flooding every cap. */
  readonly labelPeak = input(true);
  /** Put the amount on every cap; only legible when columns are few. */
  readonly labelAll = input(false);

  private readonly settings = inject(SettingsStore);

  protected readonly viewBox = `0 0 ${CHART_W} ${CHART_H}`;
  protected readonly chartWidth = CHART_W;
  protected readonly plotBottom = PAD.top + PLOT_H;

  protected readonly hovered = signal<number | null>(null);

  /**
   * Changes whenever the data does. The template loops over it so the marks are
   * destroyed and rebuilt, which is what makes the entry animation replay —
   * otherwise it only ever ran on the very first render.
   */
  protected readonly renderKey = computed(() =>
    this.columns()
      .map((entry) => `${entry.label}:${entry.earned}`)
      .join('|'),
  );

  protected readonly peakIndex = computed(() => {
    const columns = this.columns();

    if (!this.labelPeak() || columns.length === 0) return null;

    let best = 0;

    columns.forEach((entry, index) => {
      if (entry.earned > columns[best].earned) best = index;
    });

    return columns[best].earned > 0 ? best : null;
  });

  protected labelVisible(index: number): boolean {
    return index % this.labelEvery() === 0;
  }

  /** Values fit on the caps only while the columns stay wide enough. */
  protected readonly showAllValues = computed(
    () => this.labelAll() && this.columns().length <= 16,
  );

  protected valueVisible(index: number): boolean {
    return this.showAllValues() || this.peakIndex() === index;
  }

  protected tooltipLeft(entry: Column): string {
    return `${(entry.centre / CHART_W) * 100}%`;
  }

  /** The axis gutter is fixed, so its labels are the compact ones. */
  protected formatAxis(value: number): string {
    return this.settings.formatCompact(value);
  }

  protected format(value: number): string {
    return this.settings.format(value);
  }

  /** Rounded at the data end, square at the baseline, per the mark spec. */
  protected columnPath(x: number, y: number, width: number, height: number): string {
    const r = Math.min(4, width / 2, height);
    const bottom = y + height;

    return [
      `M ${x} ${bottom}`,
      `L ${x} ${y + r}`,
      `Q ${x} ${y} ${x + r} ${y}`,
      `L ${x + width - r} ${y}`,
      `Q ${x + width} ${y} ${x + width} ${y + r}`,
      `L ${x + width} ${bottom}`,
      'Z',
    ].join(' ');
  }
}
