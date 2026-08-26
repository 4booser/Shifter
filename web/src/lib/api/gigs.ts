'use client';

import { api } from './http';

export type GigCategory =
  | 'bartender' | 'barback' | 'barista'
  | 'waiter' | 'runner' | 'host' | 'cashier'
  | 'cook-hot' | 'cook-cold' | 'prep' | 'pizzaiolo' | 'sushi' | 'pastry' | 'baker'
  | 'dishwasher' | 'courier' | 'catering' | 'floor-manager';

export interface Gig {
  id: number;
  venue: string;
  category: GigCategory;
  title: string;
  details: string | null;
  date: string;
  start: string;
  end: string;
  pay_amount: number;
  pay_period: 'hour' | 'shift';
  city: string;
  slots: number;
  status: 'open' | 'filled' | 'closed';
  responses: number;
  is_mine: boolean;
  my_response: { id: number; accepted: boolean } | null;
}

export interface GigSave {
  venue: string;
  category: GigCategory;
  title: string;
  details: string | null;
  date: string;
  start: string;
  end: string;
  pay_amount: number;
  pay_period: 'hour' | 'shift';
  city: string;
  slots: number;
}

export interface GigReply {
  id: number;
  user_id: number;
  name: string;
  avatar_kind: string | null;
  avatar_data: string | null;
  message: string | null;
  phone: string | null;
  telegram: string | null;
  accepted: boolean;
  created_at: string;
}

const GIGS = '/shifter/v1/gigs';

export const gigApi = {
  board: (from: string, to: string, category: string | null, city: string) => {
    const filters =
      (category !== null ? `&category=${category}` : '')
      + (city.trim() !== '' ? `&city=${encodeURIComponent(city.trim())}` : '');

    return api<Gig[]>(`${GIGS}?from=${from}&to=${to}${filters}`);
  },
  create: (body: GigSave) => api<Gig>(GIGS, { body }),
  update: (id: number, body: GigSave) => api<Gig>(`${GIGS}/${id}`, { method: 'PUT', body }),
  setStatus: (id: number, status: 'open' | 'filled' | 'closed') =>
    api<Gig>(`${GIGS}/${id}/status`, { method: 'PUT', body: { status } }),
  mine: () => api<{ gig: Gig; replies: GigReply[] }[]>(`${GIGS}/mine`),
  myReplies: () => api<Gig[]>(`${GIGS}/replies`),
  respond: (id: number, body: { message: string | null; phone: string | null; telegram: string | null }) =>
    api<Gig>(`${GIGS}/${id}/respond`, { body }),
  withdraw: (id: number) => api<void>(`${GIGS}/${id}/respond`, { method: 'DELETE' }),
  accept: (id: number, replyId: number) =>
    api<GigReply>(`${GIGS}/${id}/replies/${replyId}/accept`, { body: {} }),
};

/** The board's vocabulary: what each trade looks and reads like. */
export const GIG_CATEGORIES: { id: GigCategory; emoji: string; label: string; group: string }[] = [
  { id: 'bartender', emoji: '🍸', label: 'Bartender', group: 'Bar' },
  { id: 'barback', emoji: '🧊', label: 'Barback', group: 'Bar' },
  { id: 'barista', emoji: '☕', label: 'Barista', group: 'Bar' },
  { id: 'waiter', emoji: '🍽️', label: 'Waiter', group: 'Floor' },
  { id: 'runner', emoji: '🏃', label: 'Runner', group: 'Floor' },
  { id: 'host', emoji: '💁', label: 'Host', group: 'Floor' },
  { id: 'cashier', emoji: '💳', label: 'Cashier', group: 'Floor' },
  { id: 'cook-hot', emoji: '🔥', label: 'Hot line cook', group: 'Kitchen' },
  { id: 'cook-cold', emoji: '🥗', label: 'Cold side cook', group: 'Kitchen' },
  { id: 'prep', emoji: '🔪', label: 'Prep cook', group: 'Kitchen' },
  { id: 'pizzaiolo', emoji: '🍕', label: 'Pizzaiolo', group: 'Kitchen' },
  { id: 'sushi', emoji: '🍣', label: 'Sushi chef', group: 'Kitchen' },
  { id: 'pastry', emoji: '🍰', label: 'Pastry chef', group: 'Kitchen' },
  { id: 'baker', emoji: '🥐', label: 'Baker', group: 'Kitchen' },
  { id: 'dishwasher', emoji: '🫧', label: 'Dishwasher', group: 'Back' },
  { id: 'courier', emoji: '🛵', label: 'Courier', group: 'Back' },
  { id: 'catering', emoji: '🥂', label: 'Catering crew', group: 'Events' },
  { id: 'floor-manager', emoji: '📋', label: 'Floor manager', group: 'Events' },
];

export const categoryOf = (id: string) =>
  GIG_CATEGORIES.find((entry) => entry.id === id) ?? GIG_CATEGORIES[0];
