import { api } from './http';

export interface RestWindow {
  ended: string;
  resumed: string;
  hours: number;
  short: boolean;
}

export interface RestRead {
  threshold: number;
  windows: RestWindow[];
  short_count: number;
  shortest: number | null;
}

export interface FatigueVerdict {
  fresh_days: number;
  deep_days: number;
  fresh_per_hour: number;
  deep_per_hour: number;
  percent: number;
  noticeable: boolean;
}

export const rhythmApi = {
  rest: (from: string, to: string) =>
    api<RestRead>(`/shifter/v1/rhythm/rest?from=${from}&to=${to}`),

  /** 204 (undefined) means «too little data», which is an answer, not an error. */
  fatigue: () => api<FatigueVerdict | undefined>('/shifter/v1/rhythm/fatigue'),
};
