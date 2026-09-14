import { MonoClientInfo, MonoStatementItem } from '@/lib/mono';
import { t } from '@/lib/i18n';

/** The only place in this app that holds a monobank token, and the only place that talks to monobank. */
const BASE = 'https://api.monobank.ua';

/** The bank is asking us to slow down. Not an error to retry blindly. */
export class MonoBusy extends Error {
  constructor(public readonly seconds: number) {
    super('too many requests');
  }
}

/** The token is wrong, expired, or has been revoked at the bank. */
export class MonoRefused extends Error {
  constructor() {
    super('token refused');
  }
}

/** monobank allows one call a minute per endpoint. */
const LIMIT_MS = 60_000;
const lastCall = new Map<string, number>();

/** Seconds until this endpoint may be asked again. Zero when it is free. */
export const waitFor = (endpoint: string): number => {
  const last = lastCall.get(endpoint);

  if (last === undefined) return 0;

  return Math.max(0, Math.ceil((LIMIT_MS - (Date.now() - last)) / 1000));
};

/** The bank's own explanation, when it gave one worth repeating. */
async function because(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorDescription?: unknown };
    const said = typeof body.errorDescription === 'string' ? body.errorDescription.trim() : '';

    return said === '' ? '' : ` — ${said.slice(0, 120)}`;
  } catch {
    // No body, or not JSON. The status still says something.
    return '';
  }
}

async function ask<T>(token: string, endpoint: string, path: string): Promise<T> {
  const wait = waitFor(endpoint);

  if (wait > 0) throw new MonoBusy(wait);

  lastCall.set(endpoint, Date.now());

  const response = await fetch(`${BASE}${path}`, {
    headers: { 'X-Token': token },
  });

  if (response.status === 429) {
    // Whatever we thought, the bank disagrees. Start the minute again.
    lastCall.set(endpoint, Date.now());
    throw new MonoBusy(60);
  }

  if (response.status === 401 || response.status === 403) throw new MonoRefused();

  if (!response.ok) {
    // The status alone was all this used to say, and "monobank ответил 400" is not something anybody can act on.
    throw new Error(`monobank ${t('ответил')} ${response.status}${await because(response)}`);
  }

  return (await response.json()) as T;
}

/** Who the token belongs to, and which accounts and jars they have. */
export const clientInfo = (token: string) =>
  ask<MonoClientInfo>(token, 'client-info', '/personal/client-info');

/** One window of a statement. */
export const statement = (token: string, account: string, from: number, to: number) =>
  ask<MonoStatementItem[]>(
    token,
    'statement',
    `/personal/statement/${account}/${Math.floor(from)}/${Math.floor(to)}`,
  );

/** Published rates. Public: no token, and a different limit — once per five minutes. */
export const rates = () =>
  ask<{ currencyCodeA: number; currencyCodeB: number; date: number; rateBuy?: number; rateSell?: number; rateCross?: number }[]>(
    '',
    'currency',
    '/bank/currency',
  );
