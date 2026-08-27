import { api } from '@/lib/api';

const BASE = '/shifter/v1/assistant';

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** 'model' when a model worded it, 'local' when the app did, null on your own. */
  source: string | null;
  created_at: string;
}

export interface AssistantGap {
  id: string;
  kind: 'tips' | 'revenue' | 'pool';
  question: string;
  date: string;
  shift_id: number | null;
  shift_name: string | null;
  suggestion: number | null;
}

export interface AssistantReport {
  title: string;
  from: string;
  to: string;
  summary: string;
  paragraphs: string[];
  stats: { label: string; value: string; hint: string | null }[];
  source: string;
}

export interface Brief {
  date: string;
  headline: string;
  body: string;
  tip: string | null;
  mood: string | null;
  source: string;
}

export const assistant = {
  messages: () => api<AssistantMessage[]>(`${BASE}/messages`),
  ask: (text: string, from: string, to: string, today: string) =>
    api<AssistantMessage>(`${BASE}/ask`, { method: 'POST', body: { text, from, to, today } }),
  clear: () => api<void>(`${BASE}/messages`, { method: 'DELETE' }),
  report: (from: string, to: string) => api<AssistantReport>(`${BASE}/report?from=${from}&to=${to}`),
  gaps: (today: string) => api<AssistantGap[]>(`${BASE}/gaps?today=${today}`),
  answerGap: (kind: string, date: string, shiftId: number | null, value: number) =>
    api<void>(`${BASE}/gaps`, { method: 'POST', body: { kind, date, shift_id: shiftId, value } }),
  brief: (today: string) => api<Brief>(`/shifter/v1/brief/today?date=${today}`),
};
