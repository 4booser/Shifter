import { api, apiBlob } from './http';

/** A chapter of the private chronicle: one place, first day to last. */
export interface Chapter {
  location_id: number;
  name: string;
  first_day: string | null;
  last_day: string | null;
  days: number;
  hours: number;
  earned: number;
  rate_first: number | null;
  rate_last: number | null;
  current: boolean;
  note: string | null;
  /** The place's own money. Empty is the app's own currency. */
  currency: string;
}

export const papersApi = {
  /** The income statement as a PDF — honesty line first, figures after. */
  incomePdf: (from: string, to: string, lang: 'ru' | 'ua') =>
    apiBlob(`/shifter/v1/papers/income.pdf?from=${from}&to=${to}&lang=${lang}`),

  /** The deliberately boring CSV an accountant actually wants. */
  accountantCsv: (from: string, to: string) =>
    apiBlob(`/shifter/v1/papers/accountant.csv?from=${from}&to=${to}`),

  /** Everything the account holds, as a zip that opens without this app. */
  takeout: () => apiBlob('/shifter/v1/papers/takeout.zip'),

  chronicle: () => api<Chapter[]>('/shifter/v1/papers/chronicle'),

  note: (locationId: number, note: string | null) =>
    api<void>(`/shifter/v1/papers/chronicle/${locationId}/note`, {
      method: 'PUT',
      body: { note },
    }),
};
