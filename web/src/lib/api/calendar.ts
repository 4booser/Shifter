'use client';

import { api } from './http';
import {
  CalendarDayData,
  CalendarEvent,
  DaySave,
  DaysResponse,
  EventSave,
  Expense,
  ExpenseKind,
  Goal,
  GoalSave,
  Payout,
  PayoutCreate,
  PayslipCheck,
  Reconciliation,
  SalesCreate,
  SalesPosition,
  ShiftCreate,
  ShiftTemplate,
  WorkLocation,
  WorkLocationCreate,
} from '../calendar/models';

/** Relative paths: proxied to the API in dev, same origin in prod. */
const API = '/shifter/v1';

export const calendarApi = {
  shifts: () => api<ShiftTemplate[]>(`${API}/shifts?archived=true`),
  createShift: (request: ShiftCreate) => api<ShiftTemplate>(`${API}/shifts`, { body: request }),
  updateShift: (id: number, request: ShiftCreate) =>
    api<ShiftTemplate>(`${API}/shifts/${id}`, { method: 'PUT', body: request }),
  archiveShift: (id: number, archived: boolean) =>
    api<ShiftTemplate>(`${API}/shifts/${id}/archived?value=${archived}`, { method: 'POST' }),

  sales: () => api<SalesPosition[]>(`${API}/sales?archived=true`),
  createSales: (request: SalesCreate) => api<SalesPosition>(`${API}/sales`, { body: request }),
  updateSales: (id: number, request: SalesCreate) =>
    api<SalesPosition>(`${API}/sales/${id}`, { method: 'PUT', body: request }),
  archiveSales: (id: number, archived: boolean) =>
    api<SalesPosition>(`${API}/sales/${id}/archived?value=${archived}`, { method: 'POST' }),
  deleteSales: (id: number) => api<void>(`${API}/sales/${id}`, { method: 'DELETE' }),

  days: (from: string, to: string, base?: string) =>
    api<DaysResponse>(
      `${API}/days?from=${from}&to=${to}${base !== undefined && base !== '' ? `&base=${base}` : ''}`,
    ),
  saveDay: (date: string, request: DaySave) =>
    api<CalendarDayData>(`${API}/days/${date}`, { method: 'PUT', body: request }),
  colourDays: (days: { date: string; colour: string | null }[]) =>
    api<CalendarDayData[]>(`${API}/days/colour`, { body: { days } }),
  bulk: (dates: string[], shiftId: number, mode: 'add' | 'remove') =>
    api<CalendarDayData[]>(`${API}/days/bulk`, { body: { dates, shift_id: shiftId, mode } }),

  goals: () => api<Goal[]>(`${API}/goals`),
  saveGoal: (request: GoalSave) => api<Goal>(`${API}/goals`, { method: 'PUT', body: request }),
  deleteGoal: (id: number) => api<void>(`${API}/goals/${id}`, { method: 'DELETE' }),

  locations: () => api<WorkLocation[]>(`${API}/locations?archived=true`),
  createLocation: (request: WorkLocationCreate) =>
    api<WorkLocation>(`${API}/locations`, { body: request }),
  updateLocation: (id: number, request: WorkLocationCreate) =>
    api<WorkLocation>(`${API}/locations/${id}`, { method: 'PUT', body: request }),
  archiveLocation: (id: number, archived: boolean) =>
    api<WorkLocation>(`${API}/locations/${id}/archived?value=${archived}`, { method: 'POST' }),
  deleteLocation: (id: number, detach = false) =>
    api<void>(`${API}/locations/${id}?detach=${detach}`, { method: 'DELETE' }),

  schedule: (from: string, to: string) =>
    api<Reconciliation>(`${API}/payouts/schedule?from=${from}&to=${to}`),
  payouts: (from: string, to: string) => api<Payout[]>(`${API}/payouts?from=${from}&to=${to}`),
  createPayout: (request: PayoutCreate) => api<Payout>(`${API}/payouts`, { body: request }),
  deletePayout: (id: number) => api<void>(`${API}/payouts/${id}`, { method: 'DELETE' }),
  /** What the work cost — kept apart from fines, and never inside earnings. */
  expenses: (from: string, to: string) =>
    api<Expense[]>(`${API}/expenses?from=${from}&to=${to}`),
  createExpense: (request: {
    date: string;
    amount: number;
    kind: ExpenseKind;
    note: string | null;
    location_id: number | null;
  }) => api<Expense>(`${API}/expenses`, { body: request }),
  deleteExpense: (id: number) => api<void>(`${API}/expenses/${id}`, { method: 'DELETE' }),
  /** One pay period at one place, in the shape a payslip is written in. */
  payslipCheck: (location_id: number, on: string) =>
    api<PayslipCheck>(`${API}/payouts/check?location_id=${location_id}&on=${on}`),
  /** Draws a line under one shortfall, or lifts it again with kind: null. */
  settlePeriod: (
    location_id: number,
    period_from: string,
    stream: string,
    kind: 'paid' | 'written-off' | null,
    note: string | null,
  ) =>
    api<void>(`${API}/payouts/settle`, {
      body: { location_id, period_from, stream, kind, note },
    }),

  createEvent: (request: EventSave) => api<CalendarEvent>(`${API}/events`, { body: request }),
  updateEvent: (id: number, request: EventSave) =>
    api<CalendarEvent>(`${API}/events/${id}`, { method: 'PUT', body: request }),
  deleteEvent: (id: number) => api<void>(`${API}/events/${id}`, { method: 'DELETE' }),
};
