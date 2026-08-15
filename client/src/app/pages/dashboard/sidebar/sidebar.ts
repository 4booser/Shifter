import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';

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
import { Icon } from '../../../shared/icon/icon';
import { LocationModal } from '../tools/location-modal';
import { PayoutModal } from '../tools/payout-modal';
import { RotationModal } from '../tools/rotation-modal';
import { SalesModal } from '../tools/sales-modal';
import { ShiftModal } from '../tools/shift-modal';

@Component({
  selector: 'app-sidebar',
  imports: [
    ShiftModal,
    SalesModal,
    RotationModal,
    PayoutModal,
    LocationModal,
    DecimalPipe,
    Icon,
  ],
  templateUrl: './sidebar.html',
})
export class Sidebar {
  private readonly store = inject(CalendarStore);

  protected readonly periods = SUMMARY_PERIODS;
  protected readonly templates = this.store.templates;
  protected readonly positions = this.store.positions;
  protected readonly archivedTemplates = this.store.archivedTemplates;
  protected readonly archivedPositions = this.store.archivedPositions;
  protected readonly brush = this.store.brush;
  protected readonly summary = this.store.summary;
  protected readonly summaryPeriod = this.store.summaryPeriod;
  protected readonly locations = this.store.locations;

  protected readonly shiftModalOpen = signal(false);
  protected readonly salesModalOpen = signal(false);
  protected readonly rotationModalOpen = signal(false);
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
}
