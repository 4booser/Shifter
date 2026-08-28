'use client';

import { api } from './http';

export type GigCategory =
  | 'managing' | 'floor-manager' | 'chef' | 'sous-chef' | 'shift-lead'
  | 'bartender' | 'barback' | 'barista' | 'sommelier'
  | 'waiter' | 'runner' | 'host' | 'cashier' | 'busser'
  | 'cook-hot' | 'cook-cold' | 'cook-universal' | 'prep' | 'grill' | 'wok'
  | 'pizzaiolo' | 'sushi' | 'pastry' | 'baker'
  | 'dishwasher' | 'cleaner' | 'storekeeper' | 'courier' | 'catering'
  | 'administrator' | 'hookah' | 'shawarma' | 'butcher' | 'security' | 'dj' | 'promoter';

export type GigEmployment = 'freelance' | 'permanent';

export interface Gig {
  id: number;
  venue: string;
  category: GigCategory;
  employment: GigEmployment;
  photos: string[];
  schedule: string | null;
  title: string;
  details: string | null;
  date: string;
  start: string;
  end: string;
  pay_amount: number;
  pay_period: 'hour' | 'shift' | 'month';
  pay_percent: number | null;
  city: string;
  slots: number;
  status: 'open' | 'filled' | 'closed';
  created_at: string;
  employer_rating: number | null;
  employer_count: number;
  responses: number;
  is_mine: boolean;
  my_response: { id: number; accepted: boolean } | null;
  /**
   * The unguessable half of the share link, and only the owner is given it.
   * The preview at /g/… has to work for people who are not signed in, so it
   * cannot be keyed on the listing's id — counting from one used to walk the
   * whole board.
   */
  share_slug: string | null;
  /**
   * What this shift is worth against the hours the reader already works. Null
   * where there is nothing honest to say — no rate on the listing, or not
   * enough of their own hours to average.
   */
  worth: {
    offered_per_hour: number;
    your_per_hour: number;
    /** Positive means better than their usual hour. */
    difference_percent: number;
  } | null;
  /**
   * Somebody has not turned up and the shift starts today. The only listing in
   * the app that reaches anybody by notification, and only people who have
   * published a card saying they are looking.
   */
  urgent: boolean;
}

export interface GigSave {
  venue: string;
  category: GigCategory;
  employment: GigEmployment;
  photos: string[];
  schedule: string | null;
  title: string;
  details: string | null;
  date: string;
  start: string;
  end: string;
  pay_amount: number;
  pay_period: 'hour' | 'shift' | 'month';
  pay_percent: number | null;
  city: string;
  slots: number;
  /** Somebody has not turned up and the shift starts today. */
  urgent?: boolean;
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
  worker_rating: number | null;
  worker_count: number;
  created_at: string;
}

const GIGS = '/shifter/v1/gigs';

export const gigApi = {
  board: (from: string, to: string, category: string | null, city: string, employment: GigEmployment) => {
    const filters =
      (category !== null ? `&category=${category}` : '')
      + (city.trim() !== '' ? `&city=${encodeURIComponent(city.trim())}` : '')
      + `&employment=${employment}`;

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

/**
 * The whole trade, grouped the way a venue's org chart reads. Order inside a
 * group runs senior to junior; the filter bar renders group by group.
 */
export const GIG_CATEGORIES: { id: GigCategory; emoji: string; label: string; group: string }[] = [
  { id: 'managing', emoji: '🎩', label: 'General manager', group: 'Management' },
  { id: 'floor-manager', emoji: '📋', label: 'Floor manager', group: 'Management' },
  { id: 'administrator', emoji: '🛎️', label: 'Administrator', group: 'Management' },
  { id: 'chef', emoji: '👨‍🍳', label: 'Head chef', group: 'Management' },
  { id: 'sous-chef', emoji: '🥇', label: 'Sous chef', group: 'Management' },
  { id: 'shift-lead', emoji: '⭐', label: 'Shift lead', group: 'Management' },
  { id: 'bartender', emoji: '🍸', label: 'Bartender', group: 'Bar' },
  { id: 'barback', emoji: '🧊', label: 'Barback', group: 'Bar' },
  { id: 'barista', emoji: '☕', label: 'Barista', group: 'Bar' },
  { id: 'sommelier', emoji: '🍷', label: 'Sommelier', group: 'Bar' },
  { id: 'hookah', emoji: '💨', label: 'Hookah master', group: 'Bar' },
  { id: 'waiter', emoji: '🍽️', label: 'Waiter', group: 'Floor' },
  { id: 'runner', emoji: '🏃', label: 'Runner', group: 'Floor' },
  { id: 'host', emoji: '💁', label: 'Host', group: 'Floor' },
  { id: 'cashier', emoji: '💳', label: 'Cashier', group: 'Floor' },
  { id: 'busser', emoji: '🧹', label: 'Busser', group: 'Floor' },
  { id: 'cook-hot', emoji: '🔥', label: 'Hot line cook', group: 'Kitchen' },
  { id: 'cook-cold', emoji: '🥗', label: 'Cold side cook', group: 'Kitchen' },
  { id: 'cook-universal', emoji: '🍳', label: 'Line cook, all stations', group: 'Kitchen' },
  { id: 'prep', emoji: '🔪', label: 'Prep cook', group: 'Kitchen' },
  { id: 'grill', emoji: '🍖', label: 'Grill cook', group: 'Kitchen' },
  { id: 'wok', emoji: '🥡', label: 'Wok cook', group: 'Kitchen' },
  { id: 'pizzaiolo', emoji: '🍕', label: 'Pizzaiolo', group: 'Kitchen' },
  { id: 'sushi', emoji: '🍣', label: 'Sushi chef', group: 'Kitchen' },
  { id: 'shawarma', emoji: '🌯', label: 'Shawarma cook', group: 'Kitchen' },
  { id: 'butcher', emoji: '🥩', label: 'Butcher', group: 'Kitchen' },
  { id: 'pastry', emoji: '🍰', label: 'Pastry chef', group: 'Bakery' },
  { id: 'baker', emoji: '🥐', label: 'Baker', group: 'Bakery' },
  { id: 'dishwasher', emoji: '🫧', label: 'Dishwasher', group: 'Back of house' },
  { id: 'cleaner', emoji: '🧼', label: 'Cleaner', group: 'Back of house' },
  { id: 'storekeeper', emoji: '📦', label: 'Storekeeper', group: 'Back of house' },
  { id: 'security', emoji: '🛡️', label: 'Security', group: 'Back of house' },
  { id: 'courier', emoji: '🛵', label: 'Courier', group: 'Delivery' },
  { id: 'catering', emoji: '🥂', label: 'Catering crew', group: 'Events' },
  { id: 'dj', emoji: '🎧', label: 'DJ', group: 'Events' },
  { id: 'promoter', emoji: '📣', label: 'Promoter', group: 'Events' },
];

export const GIG_GROUPS = ['Management', 'Bar', 'Floor', 'Kitchen', 'Bakery', 'Back of house', 'Delivery', 'Events'];

/** Client-side shrink: centre-fit to 900px, JPEG, stepped down under the wire budget. */
export function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error('decode'));
      image.onload = () => {
        const scale = Math.min(1, 900 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');

        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext('2d');

        if (ctx === null) {
          reject(new Error('canvas'));

          return;
        }

        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        let quality = 0.8;
        let url = canvas.toDataURL('image/jpeg', quality);

        while (url.length > 200_000 && quality > 0.35) {
          quality -= 0.1;
          url = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(url);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const categoryOf = (id: string) =>
  GIG_CATEGORIES.find((entry) => entry.id === id) ?? GIG_CATEGORIES[0];


// ==== The seekers' side ====

export interface Seeker {
  id: number;
  user_id: number;
  name: string;
  avatar_kind: string | null;
  avatar_data: string | null;
  categories: GigCategory[];
  employment: 'freelance' | 'permanent' | 'any';
  city: string;
  about: string | null;
  availability: string | null;
  pay_amount: number | null;
  pay_period: 'hour' | 'shift' | 'month' | null;
  phone: string | null;
  telegram: string | null;
  is_active: boolean;
  is_me: boolean;
  worker_rating: number | null;
  worker_count: number;
  updated_at: string;
}

export interface SeekerSave {
  categories: string[];
  employment: 'freelance' | 'permanent' | 'any';
  city: string;
  about: string | null;
  availability: string | null;
  pay_amount: number | null;
  pay_period: string | null;
  phone: string | null;
  telegram: string | null;
  is_active: boolean;
}

export const seekerApi = {
  list: (category: string | null, city: string, employment: string) =>
    api<Seeker[]>(
      `${GIGS}/seekers?employment=${employment}`
      + (category !== null ? `&category=${category}` : '')
      + (city.trim() !== '' ? `&city=${encodeURIComponent(city.trim())}` : ''),
    ),
  mine: () => api<Seeker | Record<string, never>>(`${GIGS}/seeker`),
  save: (body: SeekerSave) => api<Seeker>(`${GIGS}/seeker`, { method: 'PUT', body }),
};


// ==== Reviews ====

export interface PendingReview {
  listing_id: number;
  listing_title: string;
  date: string;
  target_user_id: number;
  target_name: string;
  by_employer: boolean;
}

export const WORKER_CHIPS = ['punctual', 'fast', 'self-starter', 'would-rehire'] as const;
export const EMPLOYER_CHIPS = ['pays-on-time', 'as-promised', 'good-crew', 'would-return'] as const;

export const reviewApi = {
  pending: () => api<PendingReview[]>(`${GIGS}/reviews/pending`),
  send: (listingId: number, body: { target_user_id: number; rating: number; chips: string[]; text: string | null }) =>
    api<unknown>(`${GIGS}/${listingId}/reviews`, { body }),
};


// ==== Calling back somebody who already worked out ====

export interface KnownWorker {
  user_id: number;
  name: string;
  avatar_kind: string | null;
  avatar_data: string | null;
  times_worked: number;
  last_worked: string;
  rating: number | null;
  rating_count: number;
  phone: string | null;
  telegram: string | null;
}

export const inviteApi = {
  known: () => api<KnownWorker[]>(`${GIGS}/known-workers`),
  invite: (listingId: number, userId: number) =>
    api<void>(`${GIGS}/${listingId}/invite/${userId}`, { method: 'POST', body: {} }),
};
