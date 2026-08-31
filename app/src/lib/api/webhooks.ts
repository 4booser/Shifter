'use client';

import { api } from './http';

export type WebhookKind = 'sales' | 'hours' | 'both';
export type DeliveryStatus = 'applied' | 'duplicate' | 'rejected' | 'failed' | 'empty';

/** Mirrors WebhookDto. */
export interface Webhook {
  id: number;
  name: string;
  kind: WebhookKind;
  url_path: string;
  token: string;
  secret: string;
  active: boolean;
  default_shift_id: number | null;
  default_shift_name: string | null;
  mapping: string | null;
  signature_header: string | null;
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
  signature_header: string | null;
  signature_secret: string | null;
}

export interface Delivery {
  id: number;
  received_at: string;
  status: DeliveryStatus;
  external_id: string | null;
  applied_date: string | null;
  error: string | null;
  payload: string;
}

export interface IngestResult {
  status: 'applied' | 'duplicate' | 'preview' | 'empty';
  date: string | null;
  preview: {
    sales: { sales_id: number; name: string; quantity: number; unit_price: number; earned: number }[];
    tips: number | null;
    tips_cash: number | null;
    deductions: number | null;
    note: string | null;
    replace: boolean;
    shift: {
      shift_id: number;
      name: string;
      start_time: string;
      end_time: string;
      break_minutes: number;
      hours: number;
      worked: boolean;
    } | null;
  } | null;
}

const HOOKS = '/shifter/v1/webhooks';

export const webhookApi = {
  list: () => api<Webhook[]>(HOOKS),
  create: (request: WebhookSave) => api<Webhook>(HOOKS, { body: request }),
  update: (id: number, request: WebhookSave) =>
    api<Webhook>(`${HOOKS}/${id}`, { method: 'PUT', body: request }),
  rotate: (id: number) => api<Webhook>(`${HOOKS}/${id}/token`, { method: 'POST', body: {} }),
  remove: (id: number) => api<void>(`${HOOKS}/${id}`, { method: 'DELETE' }),
  deliveries: (id: number) => api<Delivery[]>(`${HOOKS}/${id}/deliveries`),
  replay: (deliveryId: number) =>
    api<IngestResult>(`${HOOKS}/deliveries/${deliveryId}/replay`, { method: 'POST', body: {} }),
  /**
   * The body goes up as the raw text the person typed, not as an object: it is
   * somebody else's JSON, and re-serialising it would quietly repair what we
   * are asking the server to judge.
   */
  test: (id: number, body: string, apply: boolean) =>
    api<IngestResult>(`${HOOKS}/${id}/test?apply=${apply}`, { rawBody: body }),
};
