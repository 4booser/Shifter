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

/**
 * Mirrors RotaEntryDto — and, like it, has nowhere to put money. If this ever
 * grows a pay field, the server is handing out something it should not, and
 * the backend privacy tests fail long before this file matters.
 */
export interface RotaEntry {
  member_id: number;
  date: string;
  shift_name: string;
  symbol: string | null;
  colour: string | null;
  start_time: string;
  end_time: string;
  hours: number;
  worked: boolean;
  /** The person is asking for someone to take it. */
  needs_cover: boolean;
}

export interface RotaMember {
  member_id: number;
  display_name: string;
  is_you: boolean;
  hours: number;
  days: number;
  cover_requests: number;
}

/** One day across the whole team: coverage, spare hands, open requests. */
export interface RotaDay {
  date: string;
  on_shift: number;
  /** Names of people with nothing on that day. */
  free: string[];
  hours: number;
  cover_requests: number;
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
}
