'use client';

import { create } from 'zustand';

import {
  MonoClientInfo,
  MonoStatementItem,
  statementWindows,
} from '@/lib/mono/mono';
import { MonoBusy, MonoRefused, clientInfo, statement, waitFor } from '@/lib/mono/mono-api';
import { Budget, CategoryRule } from '@/lib/mono/mono-rules';
import { demoClient, demoStatement } from '@/lib/mono/demo';

/**
 * The bank, in the browser.
 *
 * The same privacy design as the phone, and the reason it works at all:
 * monobank answers browsers directly — checked, `access-control-allow-origin:
 * *` — so the token goes from this tab to api.monobank.ua and nowhere else.
 * The Shifter server never sees it, never proxies it, and cannot leak it.
 *
 * What differs from the phone is the container. localStorage is not a
 * keychain: any script on this origin can read it, and "this origin" is
 * exactly the code we ship. That is worth a plain sentence on the connect
 * screen rather than a claim of bank-grade anything — the honest mitigations
 * are that the token is read-only, revocable in one tap at the bank, and
 * erased here by one button that also wipes the statement.
 */

const TOKEN_KEY = 'shifter.mono.token';
const SETUP_KEY = 'shifter.mono.setup';
const CACHE_KEY = 'shifter.mono.cache';

/** What survives a reload, minus the token, which is kept apart. */
interface Setup {
  accountId: string | null;
  rules: CategoryRule[];
  budgets: Budget[];
  /** Unix seconds of the newest transaction already fetched, per account. */
  syncedPer: Record<string, number>;
}

const quietly = (work: () => void) => {
  try {
    work();
  } catch {
    // A full or forbidden localStorage costs a re-fetch, never the page.
  }
};

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);

    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

/**
 * The statement cache, capped.
 *
 * localStorage holds five megabytes on a good day, and three years of
 * statement is more. The newest items win, because every screen reads
 * recency first — history beyond the cap re-fetches on demand rather than
 * silently not existing.
 */
const CACHE_ITEMS = 4_000;
const DEMO_KEY = 'shifter.mono.demo';

interface MonoState {
  /** Undefined while localStorage has not been read yet. */
  token: string | null | undefined;
  /** A generated statement for looking around — no bank behind it. */
  demo: boolean;
  client: MonoClientInfo | null;
  accountId: string | null;
  items: MonoStatementItem[];
  rules: CategoryRule[];
  budgets: Budget[];
  busy: boolean;
  /** Seconds until the bank will answer again, when it told us to wait. */
  waiting: number;
  error: string | null;
  /** Windows fetched and asked for, so a backfill can show a bar. */
  progress: { done: number; total: number } | null;

  hydrate: () => void;
  connect: (token: string) => Promise<'ok' | 'refused' | 'failed'>;
  /** Ninety believable days, drawn in this browser; nothing stored. */
  enterDemo: () => void;
  disconnect: () => void;
  chooseAccount: (accountId: string) => void;
  /** Fetches what is missing, one window at a time. */
  sync: (daysBack: number) => Promise<void>;
  setRules: (rules: CategoryRule[]) => void;
  setBudget: (category: string, limit: number) => void;
}

export const useMono = create<MonoState>((set, get) => ({
  token: undefined,
  demo: false,
  client: null,
  accountId: null,
  items: [],
  rules: [],
  budgets: [],
  busy: false,
  waiting: 0,
  error: null,
  progress: null,

  hydrate: () => {
    if (get().demo) return;

    // A demo lives for the tab: sessionStorage remembers the choice, the
    // deterministic generator rebuilds the same ninety days on any screen
    // that hydrates, and closing the tab forgets the whole fiction.
    if (window.sessionStorage.getItem(DEMO_KEY) === '1') {
      get().enterDemo();

      return;
    }

    const token = window.localStorage.getItem(TOKEN_KEY);
    const setup = readJson<Setup>(SETUP_KEY, {
      accountId: null, rules: [], budgets: [], syncedPer: {},
    });
    const cache = readJson<Record<string, MonoStatementItem[]>>(CACHE_KEY, {});

    set({
      token,
      accountId: setup.accountId,
      rules: setup.rules,
      budgets: setup.budgets,
      items: setup.accountId !== null ? (cache[setup.accountId] ?? []) : [],
    });

    // The client info is cheap and names the accounts; fetched on load so the
    // picker is never empty on a connected tab.
    if (token !== null) {
      void clientInfo(token)
        .then((client) => set({ client }))
        .catch(() => undefined);
    }
  },

  connect: async (token) => {
    const trimmed = token.trim();

    if (trimmed === '') return 'failed';

    try {
      const client = await clientInfo(trimmed);

      quietly(() => window.localStorage.setItem(TOKEN_KEY, trimmed));

      const first = client.accounts[0]?.id ?? null;

      set({ token: trimmed, client, accountId: first, error: null });
      persistSetup(get);

      return 'ok';
    } catch (caught) {
      if (caught instanceof MonoRefused) return 'refused';

      set({ error: caught instanceof Error ? caught.message : 'failed' });

      return 'failed';
    }
  },

  enterDemo: () => {
    const client = demoClient();
    const items = demoStatement(Math.floor(Date.now() / 1000));

    // The card's balance is whatever the statement ran up to.
    client.accounts[0].balance = items[0]?.balance ?? 0;

    quietly(() => window.sessionStorage.setItem(DEMO_KEY, '1'));

    set({
      token: 'demo', demo: true, client, accountId: client.accounts[0].id,
      items, rules: [], budgets: [], error: null, progress: null,
    });
  },

  disconnect: () => {
    // The token and everything fetched with it, gone together. A statement
    // left behind after the token is removed is somebody's spending sitting
    // in a browser they thought they had disconnected.
    quietly(() => {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(SETUP_KEY);
      window.localStorage.removeItem(CACHE_KEY);
      window.sessionStorage.removeItem(DEMO_KEY);
    });

    set({
      token: null, demo: false, client: null, accountId: null, items: [],
      rules: [], budgets: [], error: null, progress: null,
    });
  },

  chooseAccount: (accountId) => {
    // The demo's single account has no cache behind it; reading the empty
    // localStorage here wiped the generated statement on a stray tap.
    if (get().demo) return;

    const cache = readJson<Record<string, MonoStatementItem[]>>(CACHE_KEY, {});

    set({ accountId, items: cache[accountId] ?? [] });
    persistSetup(get);
  },

  sync: async (daysBack) => {
    const { token, accountId } = get();

    if (get().demo) return;
    if (token === null || token === undefined || accountId === null) return;
    if (get().busy) return;

    set({ busy: true, error: null });

    try {
      const now = Math.floor(Date.now() / 1000);
      const setup = readJson<Setup>(SETUP_KEY, {
        accountId: null, rules: [], budgets: [], syncedPer: {},
      });

      // From where the last sync ended, or as deep as asked. The overlap of a
      // day catches transactions that settled late.
      const since = Math.max(
        now - daysBack * 86_400,
        (setup.syncedPer[accountId] ?? 0) - 86_400,
      );

      const windows = statementWindows(since, now);

      set({ progress: { done: 0, total: windows.length } });

      for (const [index, window_] of windows.entries()) {
        // The bank allows one statement call a minute. The wait is shown as a
        // countdown rather than swallowed, because a tab has to stay open for
        // it and the person deserves to know why.
        for (;;) {
          const wait = waitFor('statement');

          if (wait <= 0) break;

          set({ waiting: wait });
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }

        set({ waiting: 0 });

        const batch = await statement(token, accountId, window_.from, window_.to);

        const seen = new Set(get().items.map((item) => item.id));
        const fresh = batch.filter((item) => !seen.has(item.id));

        const items = [...fresh, ...get().items]
          .sort((one, two) => two.time - one.time);

        set({ items, progress: { done: index + 1, total: windows.length } });

        quietly(() => {
          const cache = readJson<Record<string, MonoStatementItem[]>>(CACHE_KEY, {});

          cache[accountId] = items.slice(0, CACHE_ITEMS);
          window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        });
      }

      const after = readJson<Setup>(SETUP_KEY, {
        accountId: null, rules: [], budgets: [], syncedPer: {},
      });

      after.accountId = get().accountId;
      after.rules = get().rules;
      after.budgets = get().budgets;
      after.syncedPer[accountId] = now;

      quietly(() => window.localStorage.setItem(SETUP_KEY, JSON.stringify(after)));
    } catch (caught) {
      if (caught instanceof MonoBusy) {
        set({ waiting: caught.seconds });
      } else if (caught instanceof MonoRefused) {
        set({ error: 'refused' });
      } else {
        set({ error: caught instanceof Error ? caught.message : 'failed' });
      }
    } finally {
      set({ busy: false, progress: null, waiting: 0 });
    }
  },

  setRules: (rules) => {
    set({ rules });
    persistSetup(get);
  },

  setBudget: (category, limit) => {
    const budgets = [
      ...get().budgets.filter((row) => row.category !== category),
      ...(limit > 0 ? [{ category, limit }] : []),
    ];

    set({ budgets });
    persistSetup(get);
  },
}));

function persistSetup(get: () => MonoState): void {
  quietly(() => {
    const previous = readJson<Setup>(SETUP_KEY, {
      accountId: null, rules: [], budgets: [], syncedPer: {},
    });

    const state = get();

    window.localStorage.setItem(SETUP_KEY, JSON.stringify({
      ...previous,
      accountId: state.accountId,
      rules: state.rules,
      budgets: state.budgets,
    }));
  });
}
