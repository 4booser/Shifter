import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/auth/api-error';
import {
  addMonths,
  currentMonth,
  keysBetween,
  monthBounds,
  todayKey,
} from '../../core/calendar/calendar-date';
import { I18n, TPipe } from '../../core/i18n/i18n';
import { Rota, RotaDay, RotaEntry, Team, TeamApi } from '../../core/team/team-api';
import { Icon } from '../../shared/icon/icon';

interface Cell {
  key: string;
  entries: RotaEntry[];
  hours: number;
}

/**
 * The shared rota: who is on, when, and for how long. Nothing on this page
 * knows what anyone is paid, and the payload it reads has no field for it —
 * the whole point of the feature is that a crew can coordinate without
 * publishing each other's wages.
 */
@Component({
  selector: 'app-team',
  imports: [DecimalPipe, FormsModule, RouterLink, TPipe, Icon],
  templateUrl: './team.html',
})
export class TeamPage {
  private readonly api = inject(TeamApi);
  private readonly i18n = inject(I18n);

  protected readonly teams = signal<Team[]>([]);
  protected readonly selected = signal<number | null>(null);
  protected readonly rota = signal<Rota | null>(null);
  protected readonly month = signal(currentMonth());

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  // Joining and creating
  protected readonly newName = signal('');
  protected readonly joinCode = signal('');
  protected readonly displayName = signal('');
  protected readonly copied = signal(false);

  protected readonly current = computed(
    () => this.teams().find((team) => team.id === this.selected()) ?? null,
  );

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.list().subscribe({
      next: (teams) => {
        this.teams.set(teams);
        this.loading.set(false);

        // Straight into the first team: someone with one crew should not have
        // to pick it out of a list of one every time.
        if (this.selected() === null && teams.length > 0) this.selected.set(teams[0].id);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected create(): void {
    if (this.newName().trim() === '') return;

    this.run(this.api.create(this.newName().trim()), (team) => {
      this.newName.set('');
      this.selected.set(team.id);
    });
  }

  protected join(): void {
    if (this.joinCode().trim() === '') return;

    this.run(
      this.api.join(this.joinCode().trim(), this.displayName().trim() || null),
      (team) => {
        this.joinCode.set('');
        this.displayName.set('');
        this.selected.set(team.id);
      },
    );
  }

  protected rotateCode(): void {
    const team = this.current();

    if (team === null) return;

    this.run(this.api.rotateCode(team.id), () => undefined);
  }

  protected leave(): void {
    const team = this.current();

    if (team === null) return;

    const question = team.is_owner
      ? this.i18n.t('You own this team — leaving deletes it for everyone. Continue?')
      : this.i18n.t('Leave this team?');

    if (!window.confirm(question)) return;

    this.busy.set(true);

    this.api.leave(team.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.selected.set(null);
        this.rota.set(null);
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  protected async copyCode(): Promise<void> {
    const code = this.current()?.invite_code;

    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);

      this.copied.set(true);

      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard access can be refused; the code is on screen to read anyway.
    }
  }

  private run(call: ReturnType<TeamApi['create']>, after: (team: Team) => void): void {
    this.busy.set(true);
    this.error.set(null);

    call.subscribe({
      next: (team) => {
        this.busy.set(false);
        after(team);
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }
}
