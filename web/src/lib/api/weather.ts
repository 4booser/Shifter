'use client';

import { api } from './http';

const API = '/shifter/v1/weather';

/**
 * Somebody's own record read against the sky over their own place.
 *
 * The server has already decided whether the gap is big enough to say out
 * loud, which is deliberate: two screens inventing their own thresholds would
 * eventually disagree about whether the same record proves anything.
 */
export interface WeatherEffect {
  location_id: number;
  place: string;
  wet_days: number;
  dry_days: number;
  wet_per_hour: number;
  dry_per_hour: number;
  /** Signed: −18 means wet days ran eighteen per cent lower. */
  percent: number;
  worth: boolean;
}

export const weatherApi = {
  effect: (today: string) =>
    api<{ places: WeatherEffect[] }>(`${API}/effect?today=${today}`),
};
