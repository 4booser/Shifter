import { DecimalPipe } from '@angular/common';
import { I18n, TPipe } from '../../../core/i18n/i18n';
import { Component, computed, inject, signal } from '@angular/core';

import {
  CalendarStore,
  SUMMARY_PERIODS,
  SummaryPeriod,
} from '../../../core/calendar/calendar-store';
import {
  SalesPosition,
  ShiftTemplate,
  rateLabel,
} from '../../../core/calendar/calendar.models';
import { daysToCsv, downloadCsv } from '../../../core/calendar/csv-export';
import { buildIcs, downloadIcs } from '../../../core/export/ics';
import { MoneyPipe } from '../../../shared/money/money-pipe';
import { Icon } from '../../../shared/icon/icon';
import { Delta } from '../../../shared/delta/delta';
import { TeamCard } from './team-card';
import { averagesFor, change } from '../../../core/calendar/insights';
import { LocationModal } from '../tools/location-modal';
import { PayoutModal } from '../tools/payout-modal';
import { PatternModal } from '../tools/pattern-modal';
import { SchemeModal } from '../tools/scheme-modal';
import { RotationModal } from '../tools/rotation-modal';
import { SalesModal } from '../tools/sales-modal';
import { ImportModal } from '../tools/import-modal';
import { ShiftModal } from '../tools/shift-modal';

@Component({
  selector: 'app-sidebar',
  imports: [TPipe, Delta, ImportModal, TeamCard, 
    ShiftModal,
    SalesModal,
    RotationModal,
    PatternModal,
    SchemeModal,
    PayoutModal,
    LocationModal,
    DecimalPipe,
    Icon,
    MoneyPipe,
  ],
  templateUrl: './sidebar.html',
})
export class Sidebar {
  private readonly store = inject(CalendarStore);
  private readonly i18n = inject(I18n);

  protected readonly periods = SUMMARY_PERIODS;
  protected readonly templates = this.store.templates;
  protected readonly positions = this.store.positions;
  protected readonly archivedTemplates = this.store.archivedTemplates;
  protected readonly archivedPositions = this.store.archivedPositions;
  protected readonly brush = this.store.brush;
  protected readonly summary = this.store.summary;
  protected readonly summaryPeriod = this.store.summaryPeriod;
  protected readonly importOpen = signal(false);

  /** Per-unit figures and how each moved against the window just before. */
  protected readonly averages = computed(() => averagesFor(this.summary()));
  private readonly before = computed(() => averagesFor(this.store.previousSummary()));

  protected readonly earnedChange = computed(() =>
    change(this.summary().total_earned, this.store.previousSummary().total_earned),
  );
  protected readonly hoursChange = computed(() =>
    change(this.summary().hours, this.store.previousSummary().hours),
  );
  protected readonly tipsChange = computed(() =>
    change(this.summary().tips_earned, this.store.previousSummary().tips_earned),
  );
  protected readonly perDayChange = computed(() =>
    change(this.averages().perDay, this.before().perDay),
  );
  protected readonly perHourChange = computed(() =>
    change(this.averages().perHour, this.before().perHour),
  );
  protected readonly locations = this.store.locations;

  protected readonly shiftModalOpen = signal(false);
  protected readonly salesModalOpen = signal(false);
  protected readonly rotationModalOpen = signal(false);
  protected readonly patternModalOpen = signal(false);
  protected readonly schemeModalOpen = signal(false);
  protected readonly payoutModalOpen = signal(false);
  protected readonly locationModalOpen = signal(false);
  protected readonly showArchive = signal(false);

  /** Null means the open modal is creating rather than editing. */
  protected readonly editingShift = signal<ShiftTemplate | null>(null);
  protected readonly editingPosition = signal<SalesPosition | null>(null);

  protected readonly rate = rateLabel;

  protected pick(template: ShiftTemplate): void {
    this.store.toggleBrush(template);
  }

  protected setPeriod(period: SummaryPeriod): void {
    this.store.setSummaryPeriod(period);
  }

  protected newShift(): void {
    this.editingShift.set(null);
    this.shiftModalOpen.set(true);
  }

  protected editShift(template: ShiftTemplate): void {
    this.editingShift.set(template);
    this.shiftModalOpen.set(true);
  }

  protected newPosition(): void {
    this.editingPosition.set(null);
    this.salesModalOpen.set(true);
  }

  protected editPosition(position: SalesPosition): void {
    this.editingPosition.set(position);
    this.salesModalOpen.set(true);
  }

  protected archiveShift(template: ShiftTemplate, archived: boolean): void {
    this.store.archiveShift(template.id, archived);
  }

  protected removePosition(position: SalesPosition): void {
    if (window.confirm(`${position.name} — ${this.i18n.t('Delete this? It cannot be undone.')}`)) {
      this.store.deletePosition(position.id);
    }
  }

  protected archivePosition(position: SalesPosition, archived: boolean): void {
    this.store.archivePosition(position.id, archived);
  }

  protected copyWeek(): void {
    this.store.copyPreviousWeek();
  }

  protected exportCsv(): void {
    const range = this.store.summaryRangeValue();

    downloadCsv(
      `shifter-${range.from}-${range.to}.csv`,
      daysToCsv(this.summary().days),
    );
  }

  /**
   * The rota in whatever calendar the phone already opens. A file rather than
   * a subscription, so it is a snapshot — but the entries carry stable ids, so
   * exporting again after a change updates them instead of leaving duplicates
   * beside the originals.
   */
  protected exportIcs(): void {
    const range = this.store.summaryRangeValue();

    downloadIcs(
      `shifter-${range.from}-${range.to}.ics`,
      buildIcs({
        days: this.summary().days,
        events: this.store.events(),
        calendarName: 'Shifter',
      }),
    );
  }
}
