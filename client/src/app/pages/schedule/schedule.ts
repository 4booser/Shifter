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
  shiftDays,
  todayKey,
  weekBounds,
} from '../../core/calendar/calendar-date';
import { I18n, TPipe } from '../../core/i18n/i18n';
import { AcceptedCover, Rota, RotaDay, RotaEntry, Team, TeamApi } from '../../core/team/team-api';
import { Icon } from '../../shared/icon/icon';

interface Cell {
  key: string;
  entries: RotaEntry[];
  hours: number;
}

type Span = 'week' | 'month';

/**
 * The shared rota, on a page of its own. It used to sit under the membership
 * controls on the team page, where a month of columns had to squeeze in beside
 * invite codes and a join form; a grid this wide deserves the width, and the
 * things people do rarely — joining, renaming, leaving — do not.
 *
 * Nothing here knows what anyone is paid, and the payload it reads has no field
 * for it. That is the whole point of the feature: a crew can coordinate without
 * publishing each other's wages.
 */
@Component({
  selector: 'app-schedule',
  imports: [DecimalPipe, FormsModule, RouterLink, TPipe, Icon],
  templateUrl: './schedule.html',
})
export class SchedulePage {
  private readonly api = inject(TeamApi);
  private readonly i18n = inject(I18n);

  protected readonly teams = signal<Team[]>([]);
  protected readonly selected = signal<number | null>(null);
  protected readonly rota = signal<Rota | null>(null);
  protected readonly month = signal(currentMonth());

  /**
   * A week at a time is what a rota is read for — "who is on Thursday" — and a
   * month is what it is planned in. Both, rather than a compromise between.
   */
  protected readonly span = signal<Span>('month');
  protected readonly anchor = signal(todayKey());

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  /**
   * What a handover left behind. The shift is off the owner's calendar, and the
   * person who took it has to put it on their own — the app cannot do that for
   * them, because the rate travels with a placement and the rate is the one
   * thing a team never sees about its members.
   */
  protected readonly handedOver = signal<AcceptedCover | null>(null);

  constructor() {
    this.api.list().subscribe({
      next: (teams) => {
        this.teams.set(teams);
        this.loading.set(false);

        if (this.selected() === null && teams.length > 0) this.selected.set(teams[0].id);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });

    effect(() => {
      const id = this.selected();
      const { from, to } = this.range();

      this.reloadToken();

      if (id === null) return;

      this.api.rota(id, from, to).subscribe({
        next: (rota) => this.rota.set(rota),
        error: (error: unknown) => this.error.set(apiErrorMessage(error)),
      });
    });
  }

  protected readonly range = computed(() => {
    if (this.span() === 'week') return weekBounds(this.anchor());

    const { year, month } = this.month();

    return monthBounds(`${year}-${`${month}`.padStart(2, '0')}-01`);
  });

  protected readonly rangeLabel = computed(() => {
    if (this.span() === 'month') {
      const { year, month } = this.month();

      return new Intl.DateTimeFormat(this.i18n.lang(), {
        month: 'long',
        year: 'numeric',
      }).format(new Date(year, month - 1, 1));
    }

    const { from, to } = this.range();
    const format = new Intl.DateTimeFormat(this.i18n.lang(), {
      day: 'numeric',
      month: 'short',
    });

    return `${format.format(new Date(`${from}T00:00:00`))} — ${format.format(
      new Date(`${to}T00:00:00`),
    )}`;
  });

  protected readonly days = computed(() => {
    const { from, to } = this.range();

    return keysBetween(from, to);
  });

  protected readonly current = computed(
    () => this.teams().find((team) => team.id === this.selected()) ?? null,
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

  protected readonly focusDay = signal<string | null>(null);

  protected readonly focus = computed<RotaDay | null>(() => {
    const key = this.focusDay();

    return (this.rota()?.days ?? []).find((day) => day.date === key) ?? null;
  });

  /** Your own offer on a shift, if you have made one. */
  protected yourOffer(entry: RotaEntry) {
    return entry.offers.find((offer) => offer.is_you && !offer.accepted) ?? null;
  }

  /** Offering to take somebody's shift, and taking that back. */
  protected offer(entry: RotaEntry): void {
    const team = this.selected();

    if (team === null) return;

    this.run(this.api.offerCover(team, entry.day_shift_id));
  }

  protected withdraw(offerId: number): void {
    const team = this.selected();

    if (team === null) return;

    this.run(this.api.withdrawCover(team, offerId));
  }

  protected accept(offerId: number): void {
    const team = this.selected();

    if (team === null) return;

    this.busy.set(true);
    this.error.set(null);

    this.api.acceptCover(team, offerId).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.handedOver.set(result);
        this.refresh();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  private run(call: { subscribe: (observer: {
    next: () => void;
    error: (error: unknown) => void;
  }) => void }): void {
    this.busy.set(true);
    this.error.set(null);

    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.refresh();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  /** Bumped to refetch the rota after it has been changed from this page. */
  private readonly reloadToken = signal(0);

  protected refresh(): void {
    this.reloadToken.update((value) => value + 1);
  }

  protected pickDay(key: string): void {
    this.focusDay.update((current) => (current === key ? null : key));
  }

  protected setSpan(value: Span): void {
    this.span.set(value);
  }

  /** One step of whatever is on screen: a week in week view, a month in month. */
  protected step(delta: number): void {
    if (this.span() === 'week') this.anchor.update((key) => shiftDays(key, delta * 7));
    else this.month.update((current) => addMonths(current, delta));
  }

  protected today(): void {
    this.anchor.set(todayKey());
    this.month.set(currentMonth());
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

  protected isToday(key: string): boolean {
    return key === todayKey();
  }
}
