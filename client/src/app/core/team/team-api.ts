import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

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

/** What one shift may be set to do on the rota. */
export type Visibility = 'shown' | 'hidden' | 'default';

/**
 * Mirrors RotaEntryDto. `pay` arrives only for people who have switched sharing
 * on — for everyone else the server does not read the column, so null here is
 * "not shared" and never "shared but zero".
 */
export interface RotaEntry {
  /** Identifies the placement, so an offer can name which one. */
  day_shift_id: number;
  member_id: number;
  date: string;
  shift_name: string;
  symbol: string | null;
  /** The shift's own colour, as on its owner's calendar. */
  colour: string | null;
  /** The person's colour, which is how the crew tells them apart. */
  member_colour: string;
  start_time: string;
  end_time: string;
  hours: number;
  worked: boolean;
  /** The person is asking for someone to take it. */
  needs_cover: boolean;
  /** Yours, so you are the one who can hand it over. */
  is_mine: boolean;
  /** Only ever set on your own shifts. */
  visibility: Visibility | null;
  pay: number | null;
  offers: RotaOffer[];
}

/** What was handed over, so the person taking it knows what to put in. */
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
  /** Null unless they share. Zero is a quiet month, null is a closed book. */
  earned: number | null;
  /** Shifts the crew cannot see. Only ever set for you. */
  hidden: number | null;
  /** What your unmarked shifts do. Only ever set for you. */
  private_by_default: boolean | null;
}

/** Your own membership — the only one you may read in full. */
export interface Membership {
  member_id: number;
  display_name: string;
  colour: string;
  share_earnings: boolean;
  private_by_default: boolean;
}

/**
 * The colours a crew is drawn in, in the order the server hands them out.
 * Mirrors TeamRules.MemberColours: validated for colour blindness as a set, so
 * the order is part of the guarantee and re-stepping it would break it.
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

/** One day across the whole team: coverage, spare hands, open requests. */
export interface RotaDay {
  date: string;
  on_shift: number;
  /** Names of people with nothing on that day. */
  free: string[];
  hours: number;
  cover_requests: number;
  /** The day's takings across everyone who shares them; null if nobody does. */
  earned: number | null;
}

export interface Rota {
  team_id: number;
  team_name: string;
  members: RotaMember[];
  entries: RotaEntry[];
  days: RotaDay[];
}

const TEAMS_API = '/shifter/v1/teams';

@Service()
export class TeamApi {
  private readonly http = inject(HttpClient);

  list(): Observable<Team[]> {
    return this.http.get<Team[]>(TEAMS_API);
  }

  create(name: string): Observable<Team> {
    return this.http.post<Team>(TEAMS_API, { name });
  }

  join(code: string, displayName: string | null): Observable<Team> {
    return this.http.post<Team>(`${TEAMS_API}/join`, {
      invite_code: code,
      display_name: displayName,
    });
  }

  leave(id: number): Observable<void> {
    return this.http.delete<void>(`${TEAMS_API}/${id}/me`);
  }

  rotateCode(id: number): Observable<Team> {
    return this.http.post<Team>(`${TEAMS_API}/${id}/code`, {});
  }

  rota(id: number, from: string, to: string): Observable<Rota> {
    return this.http.get<Rota>(`${TEAMS_API}/${id}/rota`, { params: { from, to } });
  }

  /**
   * How you appear to this crew and what you let them see. Only the fields
   * passed are changed, so a screen that flips one switch cannot reset another
   * by not knowing about it.
   */
  updateMembership(
    id: number,
    changes: Partial<{
      display_name: string;
      colour: string;
      share_earnings: boolean;
      private_by_default: boolean;
    }>,
  ): Observable<Membership> {
    return this.http.patch<Membership>(`${TEAMS_API}/${id}/me`, changes);
  }

  /**
   * Whether one shift of yours shows on the rota. Null puts it back under your
   * default. Not scoped to a team — hiding a shift hides it from every crew.
   */
  setVisibility(dayShiftId: number, visible: boolean | null): Observable<void> {
    return this.http.put<void>(`${TEAMS_API}/shifts/${dayShiftId}/visibility`, { visible });
  }

  /** Offering to take a shift somebody put up for cover. */
  offerCover(teamId: number, dayShiftId: number): Observable<RotaOffer> {
    return this.http.post<RotaOffer>(`${TEAMS_API}/${teamId}/cover/${dayShiftId}`, {});
  }

  withdrawCover(teamId: number, offerId: number): Observable<void> {
    return this.http.delete<void>(`${TEAMS_API}/${teamId}/cover/offers/${offerId}`);
  }

  /**
   * Handing it over. The shift leaves the owner's calendar; whoever took it
   * places it on their own, because only they know what they are paid for it.
   */
  acceptCover(teamId: number, offerId: number): Observable<AcceptedCover> {
    return this.http.post<AcceptedCover>(
      `${TEAMS_API}/${teamId}/cover/offers/${offerId}/accept`,
      {},
    );
  }
}
