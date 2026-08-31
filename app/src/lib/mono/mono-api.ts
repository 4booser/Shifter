/*
 * Carried over from the phone, verbatim where possible.
 *
 * The bank tab lived only in the pocket, and every formula here — what counts
 * as a transfer, how branches of one shop merge, what a day usually costs —
 * was already written and tested there. Parity between the platforms is
 * parity of files: if the web and the phone ever disagree about a figure,
 * that is a bug by definition, and keeping the code identical is the
 * cheapest way to make it a rare one.
 */
import { MonoClientInfo, MonoStatementItem } from './mono';

/**
 * The only place in this app that holds a monobank token, and the only place
 * that talks to monobank.
 *
 * Nothing here touches the Shifter server. That separation is the whole
 * privacy design: the token reads somebody's entire bank statement, so it
 * lives on the phone, goes to api.monobank.ua and nowhere else, and never
 * appears in a log or an error message. The rest of the app receives
 * transactions, never credentials.
 */
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

/**
 * monobank allows one call a minute per endpoint. Asked for more, it answers
 * 429 and a client that retries is a client that stays blocked. So the wait
 * is tracked here and exposed, because "try again in 43 seconds" is something
 * a screen can say and a spinner is not.
 */
const LIMIT_MS = 60_000;
const lastCall = new Map<string, number>();

/** Seconds until this endpoint may be asked again. Zero when it is free. */
export const waitFor = (endpoint: string): number => {
  const last = lastCall.get(endpoint);

  if (last === undefined) return 0;

  return Math.max(0, Math.ceil((LIMIT_MS - (Date.now() - last)) / 1000));
};

/**
 * The bank's own explanation, when it gave one worth repeating.
 *
 * Kept to one short field and capped: the message goes on somebody's screen,
 * and a bank error body is not a place to be trusting about length or shape.
 */
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
    // The status alone was all this used to say, and "monobank ответил 400"
    // is not something anybody can act on. The bank's own errorDescription is
    // one short sentence and it names the cause — so that field, and only
    // that field, is passed on: never the body, which can echo the request
    // back including the path, and never anything else it might carry.
    throw new Error(`monobank: ${response.status}${await because(response)}`);
  }

  return (await response.json()) as T;
}

/** Who the token belongs to, and which accounts and jars they have. */
export const clientInfo = (token: string) =>
  ask<MonoClientInfo>(token, 'client-info', '/personal/client-info');

/**
 * One window of a statement. `from` and `to` are unix seconds and the window
 * must be inside monobank's limit — statementWindows() cuts a range to size.
 */
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
