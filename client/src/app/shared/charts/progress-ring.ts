import { Component, computed, input } from '@angular/core';

const SIZE = 120;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A single ratio against a limit. The unfilled track is a lighter step of the
 * same hue, so the state reads across the whole ring rather than only where
 * the arc stops.
 */
@Component({
  selector: 'app-progress-ring',
  template: `
    <svg class="ring" [attr.viewBox]="viewBox" role="img">
      <circle
        class="ring-track"
        [attr.cx]="centre"
        [attr.cy]="centre"
        [attr.r]="radius"
        [attr.stroke-width]="stroke"
      />
      <circle
        class="ring-fill"
        [class.is-complete]="percent() >= 100"
        [attr.cx]="centre"
        [attr.cy]="centre"
        [attr.r]="radius"
        [attr.stroke-width]="stroke"
        [attr.stroke-dasharray]="circumference"
        [attr.stroke-dashoffset]="offset()"
      />
    </svg>
  `,
})
export class ProgressRing {
  readonly percent = input.required<number>();

  protected readonly viewBox = `0 0 ${SIZE} ${SIZE}`;
  protected readonly centre = SIZE / 2;
  protected readonly radius = RADIUS;
  protected readonly stroke = STROKE;
  protected readonly circumference = CIRCUMFERENCE;

  protected readonly offset = computed(() => {
    const clamped = Math.max(0, Math.min(100, this.percent()));

    return CIRCUMFERENCE * (1 - clamped / 100);
  });
}
