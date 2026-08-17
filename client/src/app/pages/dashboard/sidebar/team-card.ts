import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { todayKey } from '../../../core/calendar/calendar-date';
import { TPipe } from '../../../core/i18n/i18n';
import { Rota, TeamApi } from '../../../core/team/team-api';
import { Icon } from '../../../shared/icon/icon';

/**
 * The shared rota, on the dashboard where the day is actually planned.
 *
 * It lived only behind a link in the top bar, which meant nobody found it. A
 * feature about coordinating with other people has to be visible next to the
 * calendar, not one navigation step away from it.
 */
@Component({
  selector: 'app-team-card',
  imports: [RouterLink, TPipe, Icon],
  template: `
    <section class="team-card">
      <h3 class="block-title">
        <app-icon name="users" [size]="15" />
        {{ 'Team' | t }}
      </h3>

      @if (loading()) {
        <p class="field-hint">{{ 'Loading…' | t }}</p>
      } @else if (rota() === null) {
        <p class="field-hint">
          {{ 'Share a rota with your crew: who is on and when, without anyone’s money.' | t }}
        </p>
        <a routerLink="/team" class="button is-block">
          {{ 'Join or start a team' | t }}
        </a>
      } @else {
        <div class="team-today">
          <span class="team-figure">
            <strong>{{ onToday() }}</strong>
            <span class="field-hint">{{ 'on shift today' | t }}</span>
          </span>
          <span class="team-figure">
            <strong>{{ freeToday().length }}</strong>
            <span class="field-hint">{{ 'free' | t }}</span>
          </span>
        </div>

        @if (freeToday().length > 0) {
          <p class="field-hint">{{ freeToday().join(', ') }}</p>
        }

        @if (covers() > 0) {
          <a routerLink="/team" class="team-alert">
            <app-icon name="swap" [size]="14" />
            {{ covers() }} {{ 'looking for cover' | t }}
          </a>
        }

        <a routerLink="/team" class="button is-block">{{ 'Open the rota' | t }}</a>
      }
    </section>
  `,
})
export class TeamCard {
  private readonly api = inject(TeamApi);

  protected readonly rota = signal<Rota | null>(null);
  protected readonly loading = signal(true);

  constructor() {
    // The first team is enough for a summary; the page itself lets people
    // switch between them.
    this.api.list().subscribe({
      next: (teams) => {
        if (teams.length === 0) {
          this.loading.set(false);

          return;
        }

        const today = todayKey();

        this.api.rota(teams[0].id, today, today).subscribe({
          next: (rota) => {
            this.rota.set(rota);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      },
      error: () => this.loading.set(false),
    });
  }

  private readonly day = computed(() => this.rota()?.days?.[0] ?? null);

  protected readonly onToday = computed(() => this.day()?.on_shift ?? 0);
  protected readonly freeToday = computed(() => this.day()?.free ?? []);
  protected readonly covers = computed(() => this.day()?.cover_requests ?? 0);
}
