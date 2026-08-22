import { Component, computed, inject, input } from '@angular/core';

import { SettingsStore } from '../../core/settings/settings-store';
import { niceCeiling } from './chart-math';

export type PlotScale = 'money' | 'percent' | 'plain';

/**
 * The frame around a chart made of elements rather than SVG: a value axis down
 * the left, gridlines across, and whatever marks the caller projects into it.
 *
 * The div charts on the statistics page were each drawn without one, which
 * made them shapes rather than measurements — a column twice as tall as its
 * neighbour said "more" and never said "how much more". Rather than give six
 * charts six axes, they share this.
 *
 * The marks stay outside it as projected content, so this owns the reading of
 * the plot and nothing about what is drawn in it.
 */
@Component({
  selector: 'app-plot',
  template: `
    <div class="plot" [class.is-tight]="tight()">
      <div class="plot-axis" aria-hidden="true">
        @for (tick of ticks(); track tick.value) {
          <span class="plot-tick" [style.bottom.%]="tick.at">{{ tick.label }}</span>
        }
      </div>

      <div class="plot-area" [style.height]="height()">
        @for (tick of ticks(); track tick.value) {
          <!-- The floor is the card's own edge; a rule on top of it would read
               as a value rather than as the bottom of the scale. -->
          @if (tick.value > 0) {
            <span class="plot-grid" [style.bottom.%]="tick.at"></span>
          }
        }

        <!-- Anything drawn across the whole plot rather than in a column of it:
             an average line, a target. It goes here and not among the marks,
             where the per-column width cap would clip it to one column wide. -->
        <ng-content select="[plotOverlay]" />

        <div class="plot-marks">
          <ng-content />
        </div>
      </div>
    </div>
  `,
})
export class Plot {
  /** The top of the scale, before rounding to something a person would say. */
  readonly max = input.required<number>();
  readonly scale = input<PlotScale>('money');
  readonly height = input('10rem');
  /** Three ticks instead of five, where the plot is short. */
  readonly tight = input(false);

  private readonly settings = inject(SettingsStore);

  /**
   * Rounded up to a number worth printing, so the top of the axis is 50 000
   * rather than 48 317. The marks are drawn against the same ceiling by the
   * caller, which is why it is exposed.
   */
  readonly ceiling = computed(() => niceCeiling(Math.max(1, this.max())));

  protected readonly ticks = computed(() => {
    const top = this.ceiling();
    const steps = this.tight() ? 2 : 4;

    return Array.from({ length: steps + 1 }, (_, index) => {
      const value = (top / steps) * index;

      return { value, at: (index / steps) * 100, label: this.label(value) };
    });
  });

  private label(value: number): string {
    switch (this.scale()) {
      case 'percent':
        return `${Math.round(value)}%`;
      case 'plain':
        return `${Math.round(value)}`;
      default:
        return this.settings.formatCompact(value);
    }
  }
}
