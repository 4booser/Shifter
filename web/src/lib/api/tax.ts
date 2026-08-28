'use client';

import { api } from './http';

const API = '/shifter/v1/tax';

/**
 * Somebody's own tax arrangement, in their own numbers.
 *
 * Every field here was typed by the person off their own registration. The app
 * knows no rates and ships none: a figure that is right for most people and
 * wrong for some, with no way to tell which, is worse than no figure.
 */
export interface TaxProfile {
  name: string;
  year: number;
  /** Null means the arrangement has no percentage — which is not zero per cent. */
  percent: number | null;
  fixed_monthly: number | null;
  social_monthly: number | null;
  annual_limit: number | null;
  /** "paid" counts money that arrived; "earned" counts what the shifts came to. */
  basis: string;
}

export interface TaxReading {
  /** Null where nothing has been entered for the year. Not an empty profile. */
  profile: TaxProfile | null;
  income?: number;
  on_income?: number | null;
  flat?: number | null;
  social?: number | null;
  total?: number;
  /** Share of their own stated ceiling, 0..1. */
  limit_used?: number | null;
  /** Roughly when the ceiling is reached at the pace so far. */
  limit_on?: string | null;
  /** They asked for money received and have recorded none. */
  fell_back_to_earned?: boolean;
}

export const taxApi = {
  read: (year: number) => api<TaxReading>(`${API}/${year}`),
  save: (profile: TaxProfile) => api<void>(API, { method: 'PUT', body: profile }),
  remove: (year: number) => api<void>(`${API}/${year}`, { method: 'DELETE' }),
};
