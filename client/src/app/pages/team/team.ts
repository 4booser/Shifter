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

  constructor() {
    this.load();

    effect(() => {
      const id = this.selected();
      const { from, to } = this.range();

      if (id === null) return;

      this.api.rota(id, from, to).subscribe({
        next: (rota) => this.rota.set(rota),
        error: (error: unknown) => this.error.set(apiErrorMessage(error)),
      });
    });
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

  protected readonly range = computed(() => {
    const { year, month } = this.month();

    return monthBounds(`${year}-${`${month}`.padStart(2, '0')}-01`);
  });

  protected readonly monthLabel = computed(() => {
    const { year, month } = this.month();

    return new Intl.DateTimeFormat(this.i18n.lang(), {
      month: 'long',
      year: 'numeric',
    }).format(new Date(year, month - 1, 1));
  });

  protected readonly days = computed(() => {
    const { from, to } = this.range();

    return keysBetween(from, to);
  });

  protected readonly current = computed(() =>
    this.teams().find((team) => team.id === this.selected()) ?? null,
  );

  /**
   * Rows are people, columns are days. Built once per load rather than looked
   * up per cell: a month by a dozen people is several hundred cells, and a
   * filter inside each one is the difference between instant and sluggish.
   */
  protected readonly grid = computed(() => {
    const rota = this.rota();

    if (rota === null) return [];

    const byMember = new Map<number, Map<string, RotaEntry[]>>();

    for (const entry of rota.entries) {
      const member = byMember.get(entry.member_id) ?? new Map<string, RotaEntry[]>();

      member.set(entry.date, [...(member.get(entry.date) ?? []), entry]);
      byMember.set(entry.member_id, member);
    }

    return rota.members.map((member) => ({
      member,
      cells: this.days().map((key): Cell => {
        const entries = byMember.get(member.member_id)?.get(key) ?? [];

        return {
          key,
          entries,
          hours: entries.reduce((total, entry) => total + entry.hours, 0),
        };
      }),
    }));
  });

  /** Everyone's hours together — the one number a rota is actually asked for. */
  protected readonly totalHours = computed(() =>
    (this.rota()?.members ?? []).reduce((total, member) => total + member.hours, 0),
  );

  protected readonly busiestDay = computed(() => {
    const counts = new Map<string, number>();

    for (const entry of this.rota()?.entries ?? []) {
      counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1);
    }

    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

    return best === undefined ? null : { date: best[0], count: best[1] };
  });

  /**
   * Shifts whose owner is asking someone to take them. The single most useful
   * thing on a shared rota: it is the message that would otherwise scroll away
   * in a group chat within the hour.
   */
  protected readonly coverRequests = computed(() => {
    const rota = this.rota();

    if (rota === null) return [];

    const names = new Map(
      rota.members.map((member) => [member.member_id, member.display_name]),
    );

    return rota.entries
      .filter((entry) => entry.needs_cover)
      .map((entry) => ({ ...entry, who: names.get(entry.member_id) ?? '' }))
      .sort((a, b) => a.date.localeCompare(b.date));
  });

  /** Days nobody is on — the gaps worth spotting before they arrive. */
  protected readonly uncovered = computed(() =>
    (this.rota()?.days ?? []).filter((day) => day.on_shift === 0 && day.date >= todayKey()),
  );

  /** The selected day's coverage, shown under the grid. */
  protected readonly focusDay = signal<string | null>(null);

  protected readonly focus = computed<RotaDay | null>(() => {
    const key = this.focusDay();

    return (this.rota()?.days ?? []).find((day) => day.date === key) ?? null;
  });

  protected pickDay(key: string): void {
    this.focusDay.update((current) => (current === key ? null : key));
  }

  protected shiftMonth(delta: number): void {
    this.month.update((current) => addMonths(current, delta));
  }

  protected label(key: string): string {
    return key.slice(8);
  }

  protected weekday(key: string): string {
    return new Intl.DateTimeFormat(this.i18n.lang(), { weekday: 'narrow' }).format(
      new Date(`${key}T00:00:00`),
    );
  }

  protected isWeekend(key: string): boolean {
    const day = new Date(`${key}T00:00:00`).getDay();

    return day === 0 || day === 6;
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
