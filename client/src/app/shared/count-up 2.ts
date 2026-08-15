import { Directive, ElementRef, inject, input, effect, signal } from '@angular/core';

import { SettingsStore } from '../core/settings/settings-store';

/**
 * Counts a number up to its value when it changes. Applied to figures people
 * watch — totals, forecasts — where the motion says "this just recalculated".
 * Honours reduced motion by jumping straight to the final value.
 */
@Directive({ selector: '[appCountUp]' })
export class CountUp {
  readonly appCountUp = input.required<number>();
  /** Formats each frame; defaults to the money format from settings. */
  readonly countFormat = input<((value: number) => string) | null>(null);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly settings = inject(SettingsStore);
  private readonly frame = signal(0);

  constructor() {
    effect((onCleanup) => {
      const target = this.appCountUp();
      const format = this.countFormat() ?? ((value: number) => this.settings.format(value));
      const element = this.host.nativeElement as HTMLElement;

      if (this.settings.settings().reduceMotion) {
        element.textContent = format(target);

        return;
      }

      const from = this.frame();
      const start = performance.now();
      const duration = 650;
      let raf = 0;

      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        // Ease-out: fast at first, settling into the final digits.
        const eased = 1 - (1 - progress) ** 3;
        const value = from + (target - from) * eased;

        element.textContent = format(value);

        if (progress < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          this.frame.set(target);
        }
      };

      raf = requestAnimationFrame(tick);

      onCleanup(() => cancelAnimationFrame(raf));
    });
  }
}
