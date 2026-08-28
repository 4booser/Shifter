'use client';

import { api } from './http';

/** Mirrors TeamDto. */
export interface Team {
  id: number;
  name: string;
  is_owner: boolean;
  member_count: number;
  /** Only the owner is given the code. */
  invite_code: string | null;
}

/** Somebody offering to take a shift. Names and dates, never money. */
export interface RotaOffer {
  offer_id: number;
  member_id: number;
  display_name: string;
  is_you: boolean;
  accepted: boolean;
}

export type Visibility = 'shown' | 'hidden' | 'default';

export interface RotaEntry {
  day_shift_id: number;
  member_id: number;
  date: string;
  shift_name: string;
  symbol: string | null;
  colour: string | null;
  member_colour: string;
  start_time: string;
  end_time: string;
  hours: number;
  worked: boolean;
  needs_cover: boolean;
  is_mine: boolean;
  /** Only ever set on your own shifts. */
  visibility: Visibility | null;
  /** Null is "not shared", never "shared but zero". */
  pay: number | null;
  offers: RotaOffer[];
}

export interface AcceptedCover {
  date: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  taken_by: string;
}

export interface RotaMember {
  member_id: number;
  display_name: string;
  is_you: boolean;
  colour: string;
  hours: number;
  days: number;
  cover_requests: number;
  shares_earnings: boolean;
  earned: number | null;
  hidden: number | null;
  private_by_default: boolean | null;
  /** Still learning the room. Everybody on a shift already knows who is new. */
  trainee: boolean;
}

export interface Membership {
  member_id: number;
  display_name: string;
  colour: string;
  share_earnings: boolean;
  private_by_default: boolean;
  trainee: boolean;
  /** When the trial ends, where one was agreed. */
  trial_ends_on: string | null;
}

/**
 * The colours a crew is drawn in, in the order the server hands them out.
 * Mirrors TeamRules.MemberColours: validated for colour blindness as a set.
 */
export const MEMBER_COLOURS = [
  '#6366F1',
  '#D97706',
  '#0891B2',
  '#DB2777',
  '#65A30D',
  '#A855F7',
  '#059669',
] as const;

export interface RotaDay {
  date: string;
  on_shift: number;
  free: string[];
  hours: number;
  cover_requests: number;
  earned: number | null;
}

export interface RotaGig {
  member_id: number;
  date: string;
  employment: 'freelance' | 'permanent';
  start: string;
  end: string;
}

export interface Rota {
  team_id: number;
  team_name: string;
  members: RotaMember[];
  entries: RotaEntry[];
  days: RotaDay[];
  /** Crew members out on the gig board that day — the fact, never the money. */
  gig_outings: RotaGig[];
  /**
   * This account has no second factor, so the crew's shared totals are
   * withheld. Said out loud: figures that quietly went missing read as a
   * broken app.
   */
  needs_second_factor: boolean;
}

const TEAMS = '/shifter/v1/teams';

export const teamApi = {
  list: () => api<Team[]>(TEAMS),
  create: (name: string) => api<Team>(TEAMS, { body: { name } }),
  join: (invite_code: string, display_name: string | null) =>
    api<Team>(`${TEAMS}/join`, { body: { invite_code, display_name } }),
  leave: (id: number) => api<void>(`${TEAMS}/${id}/me`, { method: 'DELETE' }),
  rotateCode: (id: number) => api<Team>(`${TEAMS}/${id}/code`, { method: 'POST', body: {} }),
  rota: (id: number, from: string, to: string) =>
    api<Rota>(`${TEAMS}/${id}/rota?from=${from}&to=${to}`),
  updateMembership: (
    id: number,
    changes: Partial<{
      display_name: string;
      colour: string;
      share_earnings: boolean;
      private_by_default: boolean;
    }>,
  ) => api<Membership>(`${TEAMS}/${id}/me`, { method: 'PATCH', body: changes }),
  setVisibility: (dayShiftId: number, visible: boolean | null) =>
    api<void>(`${TEAMS}/shifts/${dayShiftId}/visibility`, { method: 'PUT', body: { visible } }),
  offerCover: (teamId: number, dayShiftId: number) =>
    api<RotaOffer>(`${TEAMS}/${teamId}/cover/${dayShiftId}`, { method: 'POST', body: {} }),
  withdrawCover: (teamId: number, offerId: number) =>
    api<void>(`${TEAMS}/${teamId}/cover/offers/${offerId}`, { method: 'DELETE' }),
  acceptCover: (teamId: number, offerId: number) =>
    api<AcceptedCover>(`${TEAMS}/${teamId}/cover/offers/${offerId}/accept`, {
      method: 'POST',
      body: {},
    }),
};

// ==== The manager's board ====

export type AssignmentStatus = 'draft' | 'published' | 'accepted' | 'declined';

/**
 * The stations a rota is counted by. Short on purpose: a vocabulary long
 * enough to name every job is long enough that nobody fills it in.
 */
export type PlanRole = 'bar' | 'kitchen' | 'floor' | 'host' | 'support' | 'manager' | '';

export const PLAN_ROLES: { value: PlanRole; label: string; emoji: string }[] = [
  { value: 'bar', label: 'Bar', emoji: '🍸' },
  { value: 'kitchen', label: 'Kitchen', emoji: '🔥' },
  { value: 'floor', label: 'Floor', emoji: '🍽️' },
  { value: 'host', label: 'Host', emoji: '💁' },
  { value: 'support', label: 'Support', emoji: '🧼' },
  { value: 'manager', label: 'Manager', emoji: '🎩' },
];

export interface Assignment {
  id: number;
  user_id: number;
  user_name: string;
  date: string;
  title: string;
  start: string;
  end: string;
  note: string | null;
  status: AssignmentStatus;
  /** '' where nobody said. Never guessed from the title. */
  role: PlanRole;
}

/** One day's coverage, station by station. */
export interface CoverageDay {
  date: string;
  roles: { role: PlanRole; count: number }[];
  /** Cells on that day with no station recorded. */
  unset: number;
}

export interface PlannerMember {
  user_id: number;
  display_name: string;
  colour: string;
  is_owner: boolean;
  is_manager: boolean;
}

export interface Blocked {
  user_id: number;
  date: string;
  reason: string | null;
  /** True on the caller's own blocks. */
  mine: boolean;
}

/**
 * One request for time off. Carries the decision as well as the ask, because
 * the state that matters most is the one in between: waiting.
 */
export interface Leave {
  id: number;
  user_id: number;
  user_name: string;
  from: string;
  to: string;
  days: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'declined';
  decided_by: string | null;
  decided_on: string | null;
  decision_note: string | null;
  /** Whether this is the caller's own request. */
  mine: boolean;
  /** Whether the caller can answer it. */
  can_decide: boolean;
}

/**
 * What the shift going home knows and the shift coming in does not. Written at
 * the end of a shift, read at the start of the next one — one note per crew per
 * day, because a chat scrolls and a handover has to be read once and acted on.
 */
export interface Handover {
  date: string;
  text: string;
  by: string | null;
  updated_at: string | null;
}

/** Something the room does not have, or something that is broken. */
export interface StopItem {
  id: number;
  kind: 'stop' | 'broken';
  name: string;
  raised_by: string;
  raised_on: string;
  /** How long it has been like this. Three weeks is a different conversation. */
  days: number;
  cleared: boolean;
}

/**
 * The night's pool and how it divides. Everybody who worked the shift sees
 * every share — that is not a hole in the privacy rules, it is the exact
 * transparency a pool exists for. A pool nobody can check is just a promise.
 */
export interface PoolShare {
  user_id: number;
  name: string;
  /** The percentage written on their own shift template. */
  percent: number;
  amount: number;
  mine: boolean;
}

export interface Pool {
  date: string;
  amount: number;
  entered_by: string | null;
  shares: PoolShare[];
  /** What the percentages do not add up to. Often the house's slice. */
  unallocated: number;
}

export interface PlannerBoard {
  members: PlannerMember[];
  assignments: Assignment[];
  can_plan: boolean;
  can_grant: boolean;
  /** Days the crew said they cannot work, inside the window. */
  blocked: Blocked[];
  /** Station counts per day. Only sent to somebody who plans. */
  coverage: CoverageDay[];
}

export interface AssignmentSave {
  user_id: number;
  date: string;
  title: string;
  start: string;
  end: string;
  note: string | null;
  role: PlanRole;
}

export const plannerApi = {
  board: (teamId: number, from: string, to: string) =>
    api<PlannerBoard>(`${TEAMS}/${teamId}/planner?from=${from}&to=${to}`),
  copyWeek: (teamId: number, weekStart: string) =>
    api<{ copied: number }>(`${TEAMS}/${teamId}/planner/copy-week?week_start=${weekStart}`, {
      method: 'POST',
    }),
  create: (teamId: number, body: AssignmentSave) =>
    api<Assignment>(`${TEAMS}/${teamId}/planner/assignments`, { body }),
  update: (teamId: number, id: number, body: AssignmentSave) =>
    api<Assignment>(`${TEAMS}/${teamId}/planner/assignments/${id}`, { method: 'PUT', body }),
  remove: (teamId: number, id: number) =>
    api<void>(`${TEAMS}/${teamId}/planner/assignments/${id}`, { method: 'DELETE' }),
  publish: (teamId: number, from: string, to: string) =>
    api<{ published: number; people: number }>(
      `${TEAMS}/${teamId}/planner/publish?from=${from}&to=${to}`,
      { method: 'POST', body: {} },
    ),
  mine: (teamId: number) => api<Assignment[]>(`${TEAMS}/${teamId}/planner/mine`),
  accept: (teamId: number, id: number, template_id: number) =>
    api<Assignment>(`${TEAMS}/${teamId}/planner/assignments/${id}/accept`, { body: { template_id } }),
  decline: (teamId: number, id: number) =>
    api<Assignment>(`${TEAMS}/${teamId}/planner/assignments/${id}/decline`, { method: 'POST', body: {} }),
  availability: (teamId: number, from: string, to: string) =>
    api<Blocked[]>(`${TEAMS}/${teamId}/planner/availability?from=${from}&to=${to}`),
  /** Blocks a day, or lifts the block when it is already there. */
  toggleAvailability: (teamId: number, date: string, reason: string | null) =>
    api<Blocked[]>(`${TEAMS}/${teamId}/planner/availability`, { body: { date, reason } }),
  /** Drafts one slot onto whoever can take it, lightest week first. */
  fill: (
    teamId: number,
    body: { date: string; title: string; start: string; end: string; role: PlanRole; count: number },
  ) =>
    api<{ placed: Assignment[]; wanted: number; shortfall: string | null }>(
      `${TEAMS}/${teamId}/planner/fill`,
      { body: { ...body, role: body.role === '' ? null : body.role } },
    ),
  pool: (teamId: number, date: string) =>
    api<Pool>(`${TEAMS}/${teamId}/planner/pool?date=${date}`),
  savePool: (teamId: number, date: string, amount: number) =>
    api<Pool>(`${TEAMS}/${teamId}/planner/pool`, { body: { date, amount } }),
  handover: (teamId: number, date: string) =>
    api<{ note: Handover; stops: StopItem[] }>(
      `${TEAMS}/${teamId}/planner/handover?date=${date}`,
    ),
  writeHandover: (teamId: number, date: string, text: string) =>
    api<Handover>(`${TEAMS}/${teamId}/planner/handover`, { body: { date, text } }),
  raiseStop: (teamId: number, kind: 'stop' | 'broken', name: string) =>
    api<StopItem[]>(`${TEAMS}/${teamId}/planner/handover/stops`, { body: { kind, name } }),
  clearStop: (teamId: number, id: number) =>
    api<StopItem[]>(`${TEAMS}/${teamId}/planner/handover/stops/${id}`, { method: 'DELETE' }),
  /** A planner sees the crew's requests; everybody else sees their own. */
  leave: (teamId: number) => api<Leave[]>(`${TEAMS}/${teamId}/planner/leave`),
  requestLeave: (teamId: number, from: string, to: string, reason: string | null) =>
    api<Leave[]>(`${TEAMS}/${teamId}/planner/leave`, { body: { from, to, reason } }),
  decideLeave: (teamId: number, id: number, approve: boolean, note: string | null) =>
    api<Leave[]>(`${TEAMS}/${teamId}/planner/leave/${id}/decision`, { body: { approve, note } }),
  withdrawLeave: (teamId: number, id: number) =>
    api<Leave[]>(`${TEAMS}/${teamId}/planner/leave/${id}`, { method: 'DELETE' }),
  setManager: (teamId: number, userId: number, is_manager: boolean) =>
    api<void>(`${TEAMS}/${teamId}/planner/members/${userId}/manager`, { method: 'PUT', body: { is_manager } }),
};


// ==== Swaps: two shifts, two agreements ====

export interface Swap {
  id: number;
  /** True when the caller is the one who proposed it. */
  mine: boolean;
  proposer_name: string;
  target_name: string;
  proposer_date: string;
  proposer_shift: string;
  proposer_start: string;
  proposer_end: string;
  target_date: string;
  target_shift: string;
  target_start: string;
  target_end: string;
  note: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
}

export const swapApi = {
  list: (teamId: number) => api<Swap[]>(`${TEAMS}/${teamId}/swaps`),
  propose: (teamId: number, body: { my_day_shift_id: number; their_day_shift_id: number; note: string | null }) =>
    api<Swap>(`${TEAMS}/${teamId}/swaps`, { body }),
  accept: (teamId: number, id: number) =>
    api<Swap>(`${TEAMS}/${teamId}/swaps/${id}/accept`, { method: 'POST', body: {} }),
  withdraw: (teamId: number, id: number) =>
    api<Swap>(`${TEAMS}/${teamId}/swaps/${id}/withdraw`, { method: 'POST', body: {} }),
};
