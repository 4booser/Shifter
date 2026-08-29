import { Page, expect } from '@playwright/test';

const BASE = process.env['E2E_BASE'] ?? 'http://localhost:5208';
const API = `${BASE}/shifter/v1`;

export interface E2eUser {
  login: string;
  password: string;
  session: unknown;
  token: string;
}

/** A brand-new account per run, so the specs never trip over old state. */
export async function registerUser(): Promise<E2eUser> {
  const login = `e2-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const password = 'e2e-password-12345';

  const response = await fetch(`${API}/auth/user/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password, first_name: 'E2E', last_name: 'Probe' }),
  });

  if (!response.ok) throw new Error(`register failed: ${response.status}`);

  const session = (await response.json()) as { access_token: string };

  return { login, password, session, token: session.access_token };
}

export async function apiPost(token: string, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);

  return response.json();
}

export async function apiPut(token: string, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);

  return response.json();
}

export async function apiGet(token: string, path: string): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);

  return response.json();
}

/** Creates the one template every scenario leans on. */
export async function createShiftTemplate(token: string): Promise<number> {
  const shift = (await apiPost(token, '/shifts', {
    name: 'Bar',
    symbol: '🍸',
    location_id: null,
    colour: null,
    start_time: '11:00',
    end_time: '19:00',
    salary_period: 'hour',
    salary_amount: 100,
    break_minutes: 0,
  })) as { id: number };

  return shift.id;
}

/** Signs the page in by planting the stored session before any script runs. */
export async function signIn(page: Page, user: E2eUser): Promise<void> {
  await page.addInitScript((session) => {
    localStorage.setItem('shifter.session', JSON.stringify(session));
    // The tour would shade the very elements the specs click.
    localStorage.setItem('shifter.tour.v1', 'seen');
  }, user.session);
}

export async function openDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page.locator('[data-day]').first()).toBeVisible({ timeout: 15_000 });
}

export function todayKey(): string {
  const now = new Date();

  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
}
