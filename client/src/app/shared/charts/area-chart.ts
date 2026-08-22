import { Component, computed, inject, input, signal } from '@angular/core';

import { TPipe } from '../../core/i18n/i18n';
import { SettingsStore } from '../../core/settings/settings-store';
import { CHART_H, CHART_W, PAD, PLOT_H, PLOT_W, niceCeiling } from './chart-math';

export interface AreaPoint {
  label: string;
  value: number;
}

/**
 * A cumulative line with a soft wash under it and an optional goal line.
 * The wash is a gradient fading to nothing — the line carries the data, the
 * fill only anchors it to the baseline.
 */
@Component({
  selector: 'app-area-chart',
  imports: [TPipe],
  templateUrl: './area-chart.html',
})
export class AreaChart {
  readonly points = input.required<AreaPoint[]>();
  /** Continues the line past today; drawn dashed so it never reads as fact. */
  readonly projection = input<AreaPoint[]>([]);
  /**
   * The same measure over the window before this one, for "am I ahead of last
   * month". The same measure on the same scale, so it is one axis and one
   * comparison — not a second series with a second meaning.
   */
  readonly comparison = input<AreaPoint[]>([]);
  readonly goal = input<number | null>(null);

  private readonly settings = inject(SettingsStore);

  protected readonly viewBox = `0 0 ${CHART_W} ${CHART_H}`;
  protected readonly chartWidth = CHART_W;
  protected readonly plotBottom = PAD.top + PLOT_H;

  protected readonly hovered = signal<number | null>(null);

  /** Rebuilds the line when the data changes, so the draw animation replays. */
  protected readonly renderKey = computed(
    () => `${this.points().length}:${this.points().at(-1)?.value ?? 0}`,
  );

  /** The goal stretches the scale, so reaching it reads as filling the chart. */
  private readonly max = computed(() => {
    const peak = Math.max(
      1,
      ...this.points().map((point) => point.value),
      ...this.projection().map((point) => point.value),
      // The comparison shares the scale or the two lines could not be compared,
      // which is the only reason it is drawn.
      ...this.comparison().map((point) => point.value),
    );

    return niceCeiling(Math.max(peak, this.goal() ?? 0));
  });

  /** One shared x-scale so the projection continues the line, not restarts it. */
  private readonly step = computed(() => {
    const total = this.points().length + this.projection().length;

    return total <= 1 ? 0 : PLOT_W / (total - 1);
  });

  protected readonly coords = computed(() => this.place(this.points(), 0));

  protected readonly projectionCoords = computed(() => {
    const actual = this.coords();

    if (actual.length === 0) return [];

    // Starts at the last real point so the dashed run leaves no gap.
    return [actual[actual.length - 1], ...this.place(this.projection(), actual.length)];
  });

  protected readonly projectionPath = computed(() =>
    this.projectionCoords()
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' '),
  );

  protected readonly projectionEnd = computed(() => {
    const coords = this.projectionCoords();

    return coords.length > 1 ? coords[coords.length - 1] : null;
  });

  private place(points: AreaPoint[], offset: number) {
    const max = this.max();
    const step = this.step();

    return points.map((point, index) => ({
      x: PAD.left + step * (offset + index),
      y: PAD.top + PLOT_H - (point.value / max) * PLOT_H,
      label: point.label,
      value: point.value,
    }));
  }

  protected readonly linePath = computed(() =>
    this.coords()
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' '),
  );

  /**
   * Laid over the same days rather than after them: a window of a different
   * length still has to line up start-to-start, or "ahead" and "behind" would
   * depend on how long each month happened to be.
   */
  protected readonly comparisonPath = computed(() => {
    const points = this.comparison();

    if (points.length < 2) return '';

    const max = this.max();
    const span = points.length - 1;

    return points
      .map((point, index) => {
        const x = PAD.left + (PLOT_W * index) / span;
        const y = PAD.top + PLOT_H - (point.value / max) * PLOT_H;

        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  });

  protected readonly areaPath = computed(() => {
    const coords = this.coords();

    if (coords.length === 0) return '';

    const last = coords[coords.length - 1];

    return (
      this.linePath() +
      ` L ${last.x} ${this.plotBottom} L ${coords[0].x} ${this.plotBottom} Z`
    );
  });

  protected readonly goalY = computed(() => {
    const goal = this.goal();

    if (goal === null || goal <= 0) return null;

    return PAD.top + PLOT_H - (goal / this.max()) * PLOT_H;
  });

  protected readonly ticks = computed(() => {
    const max = this.max();

    return [0, max / 2, max].map((value) => ({
      value,
      y: PAD.top + PLOT_H - (value / max) * PLOT_H,
    }));
  });

  /** Sparse x labels: first, quarter points, last. */
  protected labelVisible(index: number): boolean {
    const total = this.coords().length;

    if (total <= 8) return true;

    return index % Math.ceil(total / 6) === 0 || index === total - 1;
  }

  protected slotWidth(): number {
    return Math.max(6, this.step());
  }

  protected tooltipLeft(x: number): string {
    return `${(x / CHART_W) * 100}%`;
  }

  protected format(value: number): string {
    return this.settings.format(value);
  }

  /** The axis gutter is fixed, so its labels are the compact ones. */
  protected formatAxis(value: number): string {
    return this.settings.formatCompact(value);
  }
}
