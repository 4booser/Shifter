import { api } from '@/lib/api/http';

const BASE = '/shifter/v1/assistant';

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** 'model' when a model worded it, 'local' when the app did, null on your own. */
  source: string | null;
  created_at: string;
}

/** A blank in your own record the assistant would like filled. */
export interface AssistantGap {
  id: string;
  kind: 'tips' | 'revenue' | 'pool';
  question: string;
  date: string;
  shift_id: number | null;
  shift_name: string | null;
  suggestion: number | null;
}

export interface AssistantStat {
  label: string;
  value: string;
  hint: string | null;
}

export interface AssistantReport {
  title: string;
  from: string;
  to: string;
  summary: string;
  paragraphs: string[];
  stats: AssistantStat[];
  source: string;
}

/**
 * The case for a raise at one place, assembled out of the person's own record.
 *
 * The honesty is the feature: a thin case is reported as thin, with the reason
 * spelled out, because an app that talks somebody into a conversation they will
 * lose has done them harm rather than a favour.
 */
export interface RaiseCase {
  location_id: number;
  location_name: string;
  months_here: number;
  /** Months since the rate last moved, or since they started. */
  months_since_raise: number;
  per_hour: number;
  /** The facts, in the order they are worth saying. */
  points: string[];
  worth_asking: boolean;
  /** Something they can send as it is. Null where there is no case yet. */
  message: string | null;
  /** Why the case is thin, where it is. */
  weakness: string | null;
}

export const assistantApi = {
  /** The case for a raise, per place, strongest first. */
  raise: () => api<RaiseCase[]>(`${BASE}/raise`),
  messages: () => api<AssistantMessage[]>(`${BASE}/messages`),
  ask: (text: string, from: string, to: string, today: string) =>
    api<AssistantMessage>(`${BASE}/ask`, { body: { text, from, to, today } }),
  clear: () => api<void>(`${BASE}/messages`, { method: 'DELETE' }),
  report: (from: string, to: string) => api<AssistantReport>(`${BASE}/report?from=${from}&to=${to}`),
  gaps: (today: string, lang: string) => api<AssistantGap[]>(`${BASE}/gaps?today=${today}&lang=${lang}`),
  answerGap: (kind: string, date: string, shiftId: number | null, value: number) =>
    api<void>(`${BASE}/gaps`, { body: { kind, date, shift_id: shiftId, value } }),
};
