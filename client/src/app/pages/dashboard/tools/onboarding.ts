import { Component, computed, inject } from '@angular/core';

import { CalendarStore } from '../../../core/calendar/calendar-store';
import { TPipe } from '../../../core/i18n/i18n';
import { Icon } from '../../../shared/icon/icon';

/**
 * What a brand new account sees instead of an empty calendar. Three steps in
 * the order the app actually needs them, each ticking itself off as it is
 * done — a checklist that reads the real state rather than a tour that has to
 * be clicked through and remembers nothing.
 */
@Component({
  selector: 'app-onboarding',
  imports: [TPipe, Icon],
  template: `
    <section class="onboard">
      <span class="onboard-badge">👋</span>
      <h2 class="onboard-title">{{ 'Let us set this up' | t }}</h2>
      <p class="field-hint">
        {{ 'Three steps, and the calendar starts counting for you.' | t }}
      </p>

      <ol class="onboard-steps">
        <li class="onboard-step" [class.is-done]="hasLocation()">
          <span class="onboard-tick">
            @if (hasLocation()) {
              <app-icon name="check" [size]="14" />
            } @else {
              1
            }
          </span>
          <span class="onboard-body">
            <strong>{{ 'Add where you work' | t }}</strong>
            <span class="field-hint">
              {{ 'Pay period, overtime, tip-out and meals live on the place.' | t }}
            </span>
          </span>
        </li>

        <li class="onboard-step" [class.is-done]="hasTemplate()">
          <span class="onboard-tick">
            @if (hasTemplate()) {
              <app-icon name="check" [size]="14" />
            } @else {
              2
            }
          </span>
          <span class="onboard-body">
            <strong>{{ 'Create a shift' | t }}</strong>
            <span class="field-hint">
              {{ 'Times and rate once; after that it is one tap per day.' | t }}
            </span>
          </span>
        </li>

        <li class="onboard-step" [class.is-done]="hasDay()">
          <span class="onboard-tick">
            @if (hasDay()) {
              <app-icon name="check" [size]="14" />
            } @else {
              3
            }
          </span>
          <span class="onboard-body">
            <strong>{{ 'Paint it onto the calendar' | t }}</strong>
            <span class="field-hint">
              {{ 'Pick the shift, then drag across the days you work.' | t }}
            </span>
          </span>
        </li>
      </ol>
    </section>
  `,
})
export class Onboarding {
  private readonly store = inject(CalendarStore);

  protected readonly hasLocation = computed(() => this.store.locations().length > 0);
  protected readonly hasTemplate = computed(() => this.store.templates().length > 0);
  protected readonly hasDay = computed(() => this.store.days().size > 0);

  /** Gone for good once all three are done; nothing to dismiss by hand. */
  readonly finished = computed(
    () => this.hasLocation() && this.hasTemplate() && this.hasDay(),
  );
}
