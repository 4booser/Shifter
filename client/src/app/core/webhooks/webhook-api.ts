import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** What an endpoint is allowed to write. */
export type WebhookKind = 'sales' | 'hours';

/** How one arrival ended. */
export type DeliveryStatus = 'applied' | 'duplicate' | 'rejected' | 'failed';

/** Mirrors WebhookDto. */
export interface Webhook {
  id: number;
  name: string;
  kind: WebhookKind;
  /** Where the sender posts, relative to this origin. */
  url_path: string;
  token: string;
  /** The shared key. Readable so it can be pasted into the sender twice. */
  secret: string;
  active: boolean;
  default_shift_id: number | null;
  default_shift_name: string | null;
  mapping: string | null;
  /** The header a sender signs under, when it uses its own scheme. */
  signature_header: string | null;
  /** That sender's own key. */
  signature_secret: string | null;
  created_at: string;
  last_delivery_at: string | null;
  recent_applied: number;
  recent_failed: number;
}

export interface WebhookSave {
  name: string;
  kind: WebhookKind;
  active: boolean;
  default_shift_id: number | null;
  mapping: string | null;
  /** Both or neither: a header with no key cannot be checked. */
  signature_header: string | null;
  signature_secret: string | null;
}

/** Mirrors DeliveryDto: one arrival, with the body as it was sent. */
export interface Delivery {
  id: number;
  received_at: string;
  status: DeliveryStatus;
  external_id: string | null;
  applied_date: string | null;
  error: string | null;
  payload: string;
}

export interface IngestLine {
  sales_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  earned: number;
}

export interface IngestShift {
  shift_id: number;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  hours: number;
  worked: boolean;
}

export interface IngestPreview {
  sales: IngestLine[];
  tips: number | null;
  tips_cash: number | null;
  deductions: number | null;
  note: string | null;
  replace: boolean;
  shift: IngestShift | null;
}

/** What a delivery turned into. `preview` is filled in for tests and replays. */
export interface IngestResult {
  status: 'applied' | 'duplicate' | 'preview';
  date: string | null;
  preview: IngestPreview | null;
}

const WEBHOOKS_API = '/shifter/v1/webhooks';

@Service()
export class WebhookApi {
  private readonly http = inject(HttpClient);

  list(): Observable<Webhook[]> {
    return this.http.get<Webhook[]>(WEBHOOKS_API);
  }

  create(request: WebhookSave): Observable<Webhook> {
    return this.http.post<Webhook>(WEBHOOKS_API, request);
  }

  update(id: number, request: WebhookSave): Observable<Webhook> {
    return this.http.put<Webhook>(`${WEBHOOKS_API}/${id}`, request);
  }

  /** New address and new key at once: the old URL stops working immediately. */
  rotate(id: number): Observable<Webhook> {
    return this.http.post<Webhook>(`${WEBHOOKS_API}/${id}/token`, {});
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${WEBHOOKS_API}/${id}`);
  }

  deliveries(id: number): Observable<Delivery[]> {
    return this.http.get<Delivery[]>(`${WEBHOOKS_API}/${id}/deliveries`);
  }

  replay(deliveryId: number): Observable<IngestResult> {
    return this.http.post<IngestResult>(`${WEBHOOKS_API}/deliveries/${deliveryId}/replay`, {});
  }

  /**
   * Runs a pasted payload through the endpoint's mapping. The body goes up as
   * the raw text the person typed, not as an object: it is somebody else's
   * JSON, and re-serialising it would quietly repair what we are asking the
   * server to judge.
   */
  test(id: number, body: string, apply: boolean): Observable<IngestResult> {
    return this.http.post<IngestResult>(`${WEBHOOKS_API}/${id}/test`, body, {
      headers: { 'Content-Type': 'application/json' },
      params: { apply },
    });
  }
}
