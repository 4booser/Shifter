import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { t } from '@/lib/i18n';

import { clientInfo, MonoBusy, MonoRefused, rates as publishedRates, statement, waitFor } from '@/lib/mono-api';
import {
  MonoAccount,
  MonoClientInfo,
  MonoRate,
  MonoStatementItem,
  statementWindows,
} from '@/lib/mono';
import { Budget, CategoryRule } from '@/lib/mono-rules';

/**
 * The bank connection, on this phone and nowhere else.
 *
 * The token goes into the keychain beside the session and is never handed to
 * the Shifter server — not in a request, not in a crash report, not in a
 * backup that leaves the device. What the server eventually learns is what
 * the person confirmed: a payout of this much on this date, an expense of
 * that much. The same rows they could have typed by hand.
 */
const TOKEN_KEY = 'shifter.mono.token';
const CACHE_KEY = 'shifter.mono.cache';
const SETUP_KEY = 'shifter.mono.setup';

/** What survives a restart, minus the token, which lives in the keychain. */
interface Setup {
  /** The account the wage lands on. */
  accountId: string | null;
  /**
   * Accounts left out of the running total. Absent means counted — a card
   * added at the bank after this was written should show up, not vanish.
   */
  hidden?: string[];
  /** Payer names confirmed for a place, so the next wage matches itself. */
  payers: Record<string, string[]>;
  /**
   * Unix seconds of the newest transaction already fetched, per account.
   *
   * Per account because switching cards used to throw the statement away and
   * start the four-minute backfill again — which made looking at a second
   * account something nobody did twice.
   */
  syncedTo: number | null;
  syncedPer?: Record<string, number>;
  /**
   * Transactions already turned into a Shifter row. Kept because a resync
   * brings the same taxi back, and offering it again is how somebody records
   * the same fare twice — the app would then be wrong about the one thing it
   * exists to be right about.
   */
  used: string[];
  /**
   * Categories the person assigned, in the order they wrote them. Kept here
   * rather than derived, because they are the corrections that make the
   * breakdown theirs rather than the terminal's.
   */
  rules: CategoryRule[];
  /** Monthly limits per category. Absent means no limit, which is not zero. */
  budgets?: Budget[];
  /**
   * The jar the tip rule saves into.
   *
   * The app can say what should have been put aside; the jar says what is
   * actually in it. Putting the two side by side is the only way anybody
   * finds out that the habit slipped in March.
   */
  jarId?: string | null;
}

/** The statement cache, keyed by account. Older phones hold a bare array. */
type Cache = Record<string, MonoStatementItem[]>;

interface MonoState {
  /** Undefined while the keychain is still being read. */
  token: string | null | undefined;
  client: MonoClientInfo | null;
  accountId: string | null;
  payers: Record<string, string[]>;
  items: MonoStatementItem[];
  syncedTo: number | null;
  /** Transaction ids already recorded in Shifter, so nothing is offered twice. */
  used: string[];
  rules: CategoryRule[];
  budgets: Budget[];
  /** The jar the tip rule saves into, where one was chosen. */
  jarId: string | null;
  /** Accounts left out of the running total. */
  hidden: string[];
  /** Every account's statement, so switching cards is instant. */
  cache: Cache;
  /** Published rates, for one total across currencies. Empty until fetched. */
  rates: MonoRate[];
  busy: boolean;
  error: string | null;
  /** Windows fetched and windows asked for, so a backfill can show a bar. */
  progress: { done: number; total: number } | null;
  /** Seconds until the bank will answer again, when it has told us to wait. */
  waiting: number;

  hydrate: () => Promise<void>;
  /** Checks the token against the bank before keeping it. */
  connect: (token: string) => Promise<'ok' | 'refused' | 'failed'>;
  disconnect: () => Promise<void>;
  chooseAccount: (accountId: string) => Promise<void>;
  /** Fetches what is missing, one window at a time. Returns how many arrived. */
  sync: (sinceSeconds: number) => Promise<number>;
  /** Replaces the category rules, order included. */
  setRules: (rules: CategoryRule[]) => Promise<void>;
  /** Sets one category's monthly limit. Zero removes it. */
  setBudget: (category: string, limit: number) => Promise<void>;
  /** Points the tip rule at a jar, or at none. */
  chooseJar: (jarId: string | null) => Promise<void>;
  /** Counts an account into the running total, or leaves it out. */
  toggleAccount: (accountId: string, counted: boolean) => Promise<void>;
  /** Fetches the bank's published rates. Public endpoint, no token. */
  loadRates: () => Promise<void>;
  /** Remembers that this payer is the wage for this place. */
  rememberPayer: (locationId: number, payer: string) => Promise<void>;
  /** Marks transactions as already recorded, so they stop being offered. */
  markUsed: (ids: string[]) => Promise<void>;
}

const now = () => Math.floor(Date.now() / 1000);

/** Counts a wait down out loud, so the screen can say how long is left. */
const countdown = async (seconds: number, tick: (left: number) => void) => {
  for (let left = seconds; left > 0; left--) {
    tick(left);
    await new Promise((resume) => setTimeout(resume, 1000));
  }
};

const quietly = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch {
    // Losing the cache costs a re-fetch, never the app.
  }
};

const readSetup = async (): Promise<Setup> => {
  try {
    const raw = await AsyncStorage.getItem(SETUP_KEY);

    if (raw !== null) return JSON.parse(raw) as Setup;
  } catch {
    // A setup that cannot be read is one that has to be asked for again.
  }

  return {
    accountId: null, payers: {}, syncedTo: null, used: [], rules: [],
    hidden: [], syncedPer: {}, budgets: [], jarId: null,
  };
};

export const useMono = create<MonoState>((set, get) => ({
  token: undefined,
  client: null,
  accountId: null,
  payers: {},
  items: [],
  syncedTo: null,
  used: [],
  rules: [],
  budgets: [],
  jarId: null,
  hidden: [],
  cache: {},
  rates: [],
  busy: false,
  error: null,
  progress: null,
  waiting: 0,

  hydrate: async () => {
    let token: string | null = null;

    try {
      token = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      token = null;
    }

    const setup = await readSetup();
    let cache: Cache = {};

    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);

      if (raw !== null) {
        const stored: unknown = JSON.parse(raw);

        // A phone that last ran the single-account version holds a bare array.
        // It belongs to whichever account was selected then, and throwing it
        // away would cost somebody a four-minute backfill for nothing.
        cache = Array.isArray(stored)
          ? (setup.accountId === null
              ? {}
              : { [setup.accountId]: stored as MonoStatementItem[] })
          : (stored as Cache);
      }
    } catch {
      cache = {};
    }

    const account = setup.accountId;
    const per = setup.syncedPer ?? {};

    set({
      token,
      accountId: account,
      payers: setup.payers,
      used: setup.used ?? [],
      rules: setup.rules ?? [],
      budgets: setup.budgets ?? [],
      jarId: setup.jarId ?? null,
      hidden: setup.hidden ?? [],
      cache,
      items: account === null ? [] : cache[account] ?? [],
      syncedTo: account === null
        ? null
        : per[account] ?? setup.syncedTo,
    });

    if (token !== null) {
      try {
        set({ client: await clientInfo(token) });
      } catch {
        // Offline, or rate-limited a moment ago. The cache still reads.
      }

      void get().loadRates();
    }
  },

  connect: async (token) => {
    set({ busy: true, error: null });

    try {
      const client = await clientInfo(token.trim());

      await SecureStore.setItemAsync(TOKEN_KEY, token.trim());
      set({ token: token.trim(), client });

      return 'ok';
    } catch (caught) {
      if (caught instanceof MonoRefused) return 'refused';

      set({ error: caught instanceof Error ? caught.message : 'Не получилось.' });

      return 'failed';
    } finally {
      set({ busy: false });
    }
  },

  disconnect: async () => {
    // Everything the bank told us goes. What the person confirmed has already
    // become an ordinary Shifter row and stays where it is.
    set({
      token: null, client: null, accountId: null, items: [],
      syncedTo: null, payers: {}, used: [], rules: [],
      hidden: [], cache: {}, rates: [], budgets: [], jarId: null,
    });
    await quietly(SecureStore.deleteItemAsync(TOKEN_KEY));
    await quietly(AsyncStorage.multiRemove([CACHE_KEY, SETUP_KEY]));
  },

  chooseJar: async (jarId) => {
    set({ jarId });

    const setup = await readSetup();

    await quietly(AsyncStorage.setItem(SETUP_KEY, JSON.stringify({ ...setup, jarId })));
  },

  setBudget: async (category, limit) => {
    const budgets = [
      ...get().budgets.filter((row) => row.category !== category),
      ...(limit > 0 ? [{ category, limit }] : []),
    ];

    set({ budgets });

    const setup = await readSetup();

    await quietly(AsyncStorage.setItem(SETUP_KEY, JSON.stringify({ ...setup, budgets })));
  },

  toggleAccount: async (accountId, counted) => {
    const hidden = counted
      ? get().hidden.filter((one) => one !== accountId)
      : [...new Set([...get().hidden, accountId])];

    set({ hidden });

    const setup = await readSetup();

    await quietly(AsyncStorage.setItem(SETUP_KEY, JSON.stringify({ ...setup, hidden })));
  },

  /**
   * The bank's published rates, so one total can span three currencies.
   *
   * Public: no token goes anywhere near this, and the limit is five minutes
   * rather than one. Failing is fine — a total the app cannot compute honestly
   * is a total it does not show.
   */
  loadRates: async () => {
    try {
      set({ rates: await publishedRates() });
    } catch {
      // Offline, or asked too soon. The balances still read one by one.
    }
  },

  /**
   * Replaces the whole list rather than editing one rule.
   *
   * Order is part of what a rule means — first match wins — so moving one is
   * as much of an edit as changing its text, and a per-rule API would need
   * three verbs to say what one assignment says.
   */
  setRules: async (rules) => {
    set({ rules });

    const setup = await readSetup();

    await quietly(AsyncStorage.setItem(SETUP_KEY, JSON.stringify({ ...setup, rules })));
  },

  /**
   * Points the statement at another account, keeping what was already read.
   *
   * It used to empty the list and reset the clock, so looking at a second card
   * cost a four-minute backfill and looking back at the first cost another. A
   * bank app where switching accounts is expensive is a bank app with one
   * account.
   */
  chooseAccount: async (accountId) => {
    const setup = await readSetup();
    const per = setup.syncedPer ?? {};

    set({
      accountId,
      items: get().cache[accountId] ?? [],
      syncedTo: per[accountId] ?? null,
    });

    await quietly(AsyncStorage.setItem(SETUP_KEY, JSON.stringify({ ...setup, accountId })));
  },

  sync: async (sinceSeconds) => {
    const { token, accountId, items, busy } = get();

    if (token === null || token === undefined || accountId === null || busy) return 0;

    const windows = statementWindows(sinceSeconds, now());

    set({ busy: true, error: null, waiting: 0, progress: { done: 0, total: windows.length } });

    const known = new Map(items.map((item) => [item.id, item]));
    let added = 0;

    try {
      // Newest window first, so the wage that just landed shows up before a
      // year of history has finished loading. Each one after the first waits
      // out the bank's minute rather than being refused — a backfill of a year
      // is twelve minutes and a progress bar, not twelve errors.
      for (const [at, window] of windows.entries()) {
        const pause = waitFor('statement');

        if (pause > 0) await countdown(pause, (left) => set({ waiting: left }));

        set({ waiting: 0, progress: { done: at, total: windows.length } });

        const page = await statement(token, accountId, window.from, window.to);

        for (const item of page) {
          if (!known.has(item.id)) added += 1;
          known.set(item.id, item);
        }

        // Written after every window, so a backfill interrupted halfway is a
        // backfill that resumes rather than one that starts again.
        const next = [...known.values()].sort((one, two) => two.time - one.time);

        const stamp = now();
        const cache = { ...get().cache, [accountId]: next };

        set({
          items: next,
          cache,
          syncedTo: stamp,
          progress: { done: at + 1, total: windows.length },
        });
        await quietly(AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)));

        const setup = await readSetup();

        await quietly(
          AsyncStorage.setItem(
            SETUP_KEY,
            JSON.stringify({
              ...setup,
              syncedTo: stamp,
              syncedPer: { ...(setup.syncedPer ?? {}), [accountId]: stamp },
            }),
          ),
        );
      }

      return added;
    } catch (caught) {
      set({
        error:
          caught instanceof MonoBusy
            ? `${t('Банк просит подождать')} ${caught.seconds} ${t('с.')}`
            : caught instanceof Error
              ? caught.message
              : 'Не дотянулись до банка.',
      });

      return added;
    } finally {
      set({ busy: false, waiting: 0, progress: null });
    }
  },

  markUsed: async (ids) => {
    const used = [...new Set([...get().used, ...ids])];

    set({ used });

    const setup = await readSetup();

    await quietly(AsyncStorage.setItem(SETUP_KEY, JSON.stringify({ ...setup, used })));
  },

  rememberPayer: async (locationId, payer) => {
    const payers = { ...get().payers };
    const key = `${locationId}`;
    const known = payers[key] ?? [];

    if (!known.includes(payer)) payers[key] = [...known, payer];

    set({ payers });

    const setup = await readSetup();

    await quietly(AsyncStorage.setItem(SETUP_KEY, JSON.stringify({ ...setup, payers })));
  },
}));

/** The account somebody picked, if it is still there. */
export const chosenAccount = (state: MonoState): MonoAccount | null =>
  state.client?.accounts.find((account) => account.id === state.accountId) ?? null;
