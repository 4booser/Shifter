import { Component, computed, input } from '@angular/core';

import { Icon } from '../icon/icon';

/**
 * The small arrow beside a number: up in green, down in red, a dash when there
 * is nothing to compare against. The arrow and the sign both carry the
 * direction, so the meaning survives without the colour.
 */
@Component({
  selector: 'app-delta',
  imports: [Icon],
  host: { class: 'delta', '[class.is-up]': 'up()', '[class.is-down]': 'down()' },
  template: `
    @if (percent() === null) {
      <span class="delta-flat" aria-hidden="true">—</span>
    } @else {
      <app-icon [name]="up() ? 'arrow-up' : 'arrow-down'" [size]="12" />
      <span>{{ label() }}</span>
    }
  `,
})
export class Delta {
  /** Percent change; null renders the neutral dash. */
  readonly percent = input.required<number | null>();
  /** True for figures where less is better — deductions, tip-out, hours. */
  readonly invert = input(false);

  /** Rounded first, so "+0.4%" never draws a green arrow next to "0%". */
  private readonly rounded = computed(() => {
    const value = this.percent();

    return value === null ? null : Math.round(value);
  });

  protected readonly up = computed(() => {
    const value = this.rounded();

    return value !== null && value > 0 !== this.invert();
  });

  protected readonly down = computed(() => {
    const value = this.rounded();

    return value !== null && value < 0 !== this.invert();
  });

  protected readonly label = computed(() => {
    const value = this.rounded();

    if (value === null) return '';

    // Capped: a tenfold jump is "+999%" either way, and the tile stays put.
    const capped = Math.min(999, Math.abs(value));

    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${capped}%`;
  });
}
