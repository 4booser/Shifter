import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Mirrors ProfileDto. */
export interface Profile {
  id: number;
  login: string;
  first_name: string;
  last_name: string | null;
  /** False for accounts that have only ever signed in with Google. */
  has_password: boolean;
  google_linked: boolean;
  created_at: string;
  monthly_goal: number | null;
}

const ACCOUNT_API = '/shifter/v1/account';

@Service()
export class AccountApi {
  private readonly http = inject(HttpClient);

  get(): Observable<Profile> {
    return this.http.get<Profile>(ACCOUNT_API);
  }

  update(first_name: string, last_name: string | null): Observable<Profile> {
    return this.http.put<Profile>(ACCOUNT_API, { first_name, last_name });
  }

  changePassword(
    current_password: string | null,
    new_password: string,
  ): Observable<Profile> {
    return this.http.put<Profile>(`${ACCOUNT_API}/password`, {
      current_password,
      new_password,
    });
  }

  linkGoogle(credential: string): Observable<Profile> {
    return this.http.post<Profile>(`${ACCOUNT_API}/google`, { credential });
  }

  unlinkGoogle(): Observable<Profile> {
    return this.http.delete<Profile>(`${ACCOUNT_API}/google`);
  }

  /** The body carries the confirmation, so this cannot be a plain DELETE. */
  remove(password: string | null, confirm_login: string): Observable<void> {
    return this.http.request<void>('delete', ACCOUNT_API, {
      body: { password, confirm_login },
    });
  }
}
