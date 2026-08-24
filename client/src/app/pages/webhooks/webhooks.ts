import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/auth/api-error';
import { CalendarApi } from '../../core/calendar/calendar-api';
import { ShiftTemplate } from '../../core/calendar/calendar.models';
import { I18n, TPipe } from '../../core/i18n/i18n';
import {
  Delivery,
  IngestResult,
  Webhook,
  WebhookApi,
  WebhookKind,
  WebhookSave,
} from '../../core/webhooks/webhook-api';
import { Icon } from '../../shared/icon/icon';

/** Shown in the mapping box before anyone has written one. */
const MAPPING_EXAMPLE = `{
  "$root": "data.object",
  "date": "closed_at",
  "external_id": "id",
  "tips": "totals.tip_money",
  "sales": "line_items",
  "sales.name": "catalogue.name",
  "sales.quantity": "qty",
  "$divide": { "tips": 100 }
}`;

/** Shown in the test box, so the first try needs no typing. */
const PAYLOAD_EXAMPLE: Record<WebhookKind, string> = {
  sales: `{
  "date": "2026-08-20",
  "external_id": "till-991",
  "tips": 42.50,
  "sales": [{ "name": "Wine", "quantity": 3 }]
}`,
  hours: `{
  "date": "2026-08-20",
  "shift": "Evening",
  "start": "17:00",
  "end": "23:30",
  "break_minutes": 30
}`,
};

/**
 * The webhook manager: addresses other software can post to, and what it is
 * allowed to write when it does.
 *
 * The screen is built around the two things that actually go wrong. A sender's
 * fields never match ours, so the mapping is editable here and can be tried
 * against a pasted payload without writing anything. And when a delivery is
 * refused at three in the morning, the body is kept — so the mapping can be
 * corrected the next day and the night replayed rather than lost.
 */
@Component({
  selector: 'app-webhooks',
  imports: [FormsModule, RouterLink, TPipe, Icon],
  templateUrl: './webhooks.html',
  styleUrl: './webhooks.scss',
})
export class Webhooks {
  private readonly api = inject(WebhookApi);
  private readonly calendar = inject(CalendarApi);
  private readonly i18n = inject(I18n);

  protected readonly hooks = signal<Webhook[]>([]);
  protected readonly templates = signal<ShiftTemplate[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal<string | null>(null);

  protected readonly mappingExample = MAPPING_EXAMPLE;

  /** The endpoint being edited: its id, or 'new' while one is being made. */
  protected readonly editing = signal<number | 'new' | null>(null);

  protected readonly name = signal('');
  protected readonly kind = signal<WebhookKind>('sales');
  protected readonly active = signal(true);
  protected readonly defaultShiftId = signal<number | null>(null);
  protected readonly mapping = signal('');

  /**
   * For senders that sign their own way. A till's webhook page offers a URL
   * and a key, never a choice of scheme, so the endpoint learns theirs instead
   * of demanding ours.
   */
  protected readonly signatureHeader = signal('');
  protected readonly signatureSecret = signal('');

  /** Secrets stay covered until asked for: this page gets shown to people. */
  protected readonly revealed = signal<number | null>(null);

  /** Which endpoint's log is open, and what is in it. */
  protected readonly logFor = signal<number | null>(null);
  protected readonly deliveries = signal<Delivery[]>([]);

  /** The try-it box, per endpoint. */
  protected readonly testFor = signal<number | null>(null);
  protected readonly testBody = signal('');
  protected readonly testResult = signal<IngestResult | null>(null);

  protected readonly kinds: { value: WebhookKind; label: string }[] = [
    { value: 'sales', label: 'Sales for a day' },
    { value: 'hours', label: 'Hours worked' },
  ];

  /** Only hours need a template to land on, so the field only shows for them. */
  protected readonly needsTemplate = computed(() => this.kind() === 'hours');

  constructor() {
    this.load();

    // Templates are only needed for the hours case, but they are a small list
    // and fetching them on demand would put a spinner inside a form.
    this.calendar.shifts().subscribe({
      next: (list) => this.templates.set(list.filter((template) => !template.archived)),
      error: () => this.templates.set([]),
    });
  }

  private load(): void {
    this.api.list().subscribe({
      next: (list) => {
        this.hooks.set(list);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  /** The address as the sender has to write it, origin and all. */
  protected url(hook: Webhook): string {
    return `${window.location.origin}${hook.url_path}`;
  }

  protected copy(text: string, message: string): void {
    void navigator.clipboard?.writeText(text);
    this.saved.set(this.i18n.t(message));
    this.error.set(null);
  }

  // ==== The form ====

  protected startNew(): void {
    this.editing.set('new');
    this.name.set('');
    this.kind.set('sales');
    this.active.set(true);
    this.defaultShiftId.set(null);
    this.mapping.set('');
    this.signatureHeader.set('');
    this.signatureSecret.set('');
  }

  protected startEdit(hook: Webhook): void {
    this.editing.set(hook.id);
    this.name.set(hook.name);
    this.kind.set(hook.kind);
    this.active.set(hook.active);
    this.defaultShiftId.set(hook.default_shift_id);
    this.mapping.set(hook.mapping ?? '');
    this.signatureHeader.set(hook.signature_header ?? '');
    this.signatureSecret.set(hook.signature_secret ?? '');
  }

  protected cancel(): void {
    this.editing.set(null);
  }

  protected save(): void {
    const editing = this.editing();

    if (editing === null) return;

    const body: WebhookSave = {
      name: this.name().trim(),
      kind: this.kind(),
      active: this.active(),
      // A sales endpoint has no template to fall back on, and leaving a stale
      // one on it would confuse the next person to read the form.
      default_shift_id: this.needsTemplate() ? this.defaultShiftId() : null,
      mapping: this.mapping().trim() === '' ? null : this.mapping(),
      signature_header: this.signatureHeader().trim() || null,
      signature_secret: this.signatureSecret().trim() || null,
    };

    this.run(
      editing === 'new' ? this.api.create(body) : this.api.update(editing, body),
      'Saved',
      () => this.editing.set(null),
    );
  }

  protected toggleActive(hook: Webhook): void {
    this.run(
      // The whole endpoint goes up, so every field it already had has to come
      // with it: a switch that quietly cleared the sender's signature would
      // take an integration down and look like it only flipped a toggle.
      this.api.update(hook.id, {
        name: hook.name,
        kind: hook.kind,
        active: !hook.active,
        default_shift_id: hook.default_shift_id,
        mapping: hook.mapping,
        signature_header: hook.signature_header,
        signature_secret: hook.signature_secret,
      }),
      hook.active ? 'Switched off' : 'Switched on',
    );
  }

  /**
   * Both halves at once, and there is no undo: whatever holds the old URL stops
   * being able to write the moment this returns.
   */
  protected rotate(hook: Webhook): void {
    this.run(this.api.rotate(hook.id), 'New address and key. Update the sender.', () =>
      this.revealed.set(hook.id),
    );
  }

  protected remove(hook: Webhook): void {
    this.busy.set(true);
    this.error.set(null);

    this.api.remove(hook.id).subscribe({
      next: () => {
        this.hooks.update((list) => list.filter((item) => item.id !== hook.id));
        this.busy.set(false);
        this.saved.set(this.i18n.t('Deleted'));
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.busy.set(false);
      },
    });
  }

  // ==== What arrived ====

  protected toggleLog(hook: Webhook): void {
    if (this.logFor() === hook.id) {
      this.logFor.set(null);

      return;
    }

    this.logFor.set(hook.id);
    this.deliveries.set([]);

    this.api.deliveries(hook.id).subscribe({
      next: (list) => this.deliveries.set(list),
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  /** Runs a stored body through the endpoint again, mapping and all. */
  protected replay(delivery: Delivery): void {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(null);

    this.api.replay(delivery.id).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.saved.set(
          `${this.i18n.t('Replayed')}: ${result.status}${result.date ? ` · ${result.date}` : ''}`,
        );

        const open = this.logFor();

        if (open !== null) {
          this.api.deliveries(open).subscribe({
            next: (list) => this.deliveries.set(list),
          });
        }
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.busy.set(false);
      },
    });
  }

  // ==== Trying one out ====

  protected toggleTest(hook: Webhook): void {
    if (this.testFor() === hook.id) {
      this.testFor.set(null);

      return;
    }

    this.testFor.set(hook.id);
    this.testResult.set(null);
    this.testBody.set(PAYLOAD_EXAMPLE[hook.kind]);
  }

  /**
   * Reads the payload and reports what it would write. `apply` is the same run
   * with the writing left in, for when the mapping is finally right and the
   * night is worth keeping.
   */
  protected tryPayload(hook: Webhook, apply: boolean): void {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(null);
    this.testResult.set(null);

    this.api.test(hook.id, this.testBody(), apply).subscribe({
      next: (result) => {
        this.testResult.set(result);
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.busy.set(false);
      },
    });
  }

  /** Reads a stored delivery back into the try-it box, to work on its mapping. */
  protected reuse(hook: Webhook, delivery: Delivery): void {
    this.testFor.set(hook.id);
    this.testResult.set(null);
    this.testBody.set(delivery.payload);
  }

  protected when(value: string | null): string {
    if (value === null) return this.i18n.t('never');

    return new Intl.DateTimeFormat(this.i18n.lang(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  /** One place for the busy flag, the error, the flash and the reload. */
  private run(call: ReturnType<WebhookApi['create']>, message: string, after?: () => void): void {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(null);

    call.subscribe({
      next: () => {
        this.saved.set(this.i18n.t(message));
        this.busy.set(false);
        after?.();
        this.load();
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.busy.set(false);
      },
    });
  }
}
