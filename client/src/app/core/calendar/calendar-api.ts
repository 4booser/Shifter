import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CalendarDayData,
  DaySave,
  DaysResponse,
  Payout,
  PayoutCreate,
  WorkLocation,
  WorkLocationCreate,
  SalesCreate,
  SalesPosition,
  ShiftCreate,
  ShiftTemplate,
} from './calendar.models';

/** Relative paths: proxied to the API in dev, same origin in prod. */
const API = '/shifter/v1';

@Service()
export class CalendarApi {
  private readonly http = inject(HttpClient);

  /** Archived templates are fetched too, so the palette can offer a restore. */
  shifts(): Observable<ShiftTemplate[]> {
    return this.http.get<ShiftTemplate[]>(`${API}/shifts`, {
      params: new HttpParams().set('archived', true),
    });
  }

  createShift(request: ShiftCreate): Observable<ShiftTemplate> {
    return this.http.post<ShiftTemplate>(`${API}/shifts`, request);
  }

  updateShift(id: number, request: ShiftCreate): Observable<ShiftTemplate> {
    return this.http.put<ShiftTemplate>(`${API}/shifts/${id}`, request);
  }

  archiveShift(id: number, archived: boolean): Observable<ShiftTemplate> {
    return this.http.post<ShiftTemplate>(`${API}/shifts/${id}/archived`, null, {
      params: new HttpParams().set('value', archived),
    });
  }

  sales(): Observable<SalesPosition[]> {
    return this.http.get<SalesPosition[]>(`${API}/sales`, {
      params: new HttpParams().set('archived', true),
    });
  }

  createSales(request: SalesCreate): Observable<SalesPosition> {
    return this.http.post<SalesPosition>(`${API}/sales`, request);
  }

  updateSales(id: number, request: SalesCreate): Observable<SalesPosition> {
    return this.http.put<SalesPosition>(`${API}/sales/${id}`, request);
  }

  archiveSales(id: number, archived: boolean): Observable<SalesPosition> {
    return this.http.post<SalesPosition>(`${API}/sales/${id}/archived`, null, {
      params: new HttpParams().set('value', archived),
    });
  }

  days(from: string, to: string): Observable<DaysResponse> {
    const params = new HttpParams().set('from', from).set('to', to);

    return this.http.get<DaysResponse>(`${API}/days`, { params });
  }

  /** Upsert, so the same call can create or replace the day. */
  saveDay(date: string, request: DaySave): Observable<CalendarDayData> {
    return this.http.put<CalendarDayData>(`${API}/days/${date}`, request);
  }

  goal(): Observable<{ monthly_goal: number | null }> {
    return this.http.get<{ monthly_goal: number | null }>('/shifter/v1/auth/goal');
  }

  setGoal(value: number | null): Observable<{ monthly_goal: number | null }> {
    return this.http.put<{ monthly_goal: number | null }>('/shifter/v1/auth/goal', {
      monthly_goal: value,
    });
  }

  locations(): Observable<WorkLocation[]> {
    return this.http.get<WorkLocation[]>(`${API}/locations`, {
      params: new HttpParams().set('archived', true),
    });
  }

  createLocation(request: WorkLocationCreate): Observable<WorkLocation> {
    return this.http.post<WorkLocation>(`${API}/locations`, request);
  }

  updateLocation(id: number, request: WorkLocationCreate): Observable<WorkLocation> {
    return this.http.put<WorkLocation>(`${API}/locations/${id}`, request);
  }

  archiveLocation(id: number, archived: boolean): Observable<WorkLocation> {
    return this.http.post<WorkLocation>(`${API}/locations/${id}/archived`, null, {
      params: new HttpParams().set('value', archived),
    });
  }

  deleteLocation(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/locations/${id}`);
  }

  deleteSales(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/sales/${id}`);
  }

  payouts(from: string, to: string): Observable<Payout[]> {
    const params = new HttpParams().set('from', from).set('to', to);

    return this.http.get<Payout[]>(`${API}/payouts`, { params });
  }

  createPayout(request: PayoutCreate): Observable<Payout> {
    return this.http.post<Payout>(`${API}/payouts`, request);
  }

  deletePayout(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/payouts/${id}`);
  }

  /** One template across many dates in a single request. */
  bulk(dates: string[], shiftId: number, mode: 'add' | 'remove'): Observable<CalendarDayData[]> {
    return this.http.post<CalendarDayData[]>(`${API}/days/bulk`, {
      dates,
      shift_id: shiftId,
      mode,
    });
  }
}
