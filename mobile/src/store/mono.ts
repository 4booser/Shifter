import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { t } from '@/lib/i18n';

import { clientInfo, MonoBusy, MonoRefused, statement, waitFor } from '@/lib/mono-api';
import { MonoAccount, MonoClientInfo, MonoStatementItem, statementWindows } from '@/lib/mono';

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
  /** Payer names confirmed for a place, so the next wage matches itself. */
  payers: Record<string, string[]>;
  /** Unix seconds of the newest transaction already fetched. */
  syncedTo: number | null;
  /**
   * Transactions already turned into a Shifter row. Kept because a resync
   * brings the same taxi back, and offering it again is how somebody records
   * the same fare twice — the app would then be wrong about the one thing it
   * exists to be right about.
   */
  used: string[];
}

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

  return { accountId: null, payers: {}, syncedTo: null, used: [] };
};

export const useMono = create<MonoState>((set, get) => ({
  token: undefined,
  client: null,
  accountId: null,
  payers: {},
  items: [],
  syncedTo: null,
  used: [],
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
    let items: MonoStatementItem[] = [];

    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);

      if (raw !== null) items = JSON.parse(raw) as MonoStatementItem[];
    } catch {
      items = [];
    }

    set({
      token,
      accountId: setup.accountId,
      payers: setup.payers,
      syncedTo: setup.syncedTo,
      used: setup.used ?? [],
      items,
    });

    if (token !== null) {
      try {
        set({ client: await clientInfo(token) });
      } catch {
        // Offline, or rate-limited a moment ago. The cache still reads.
      }
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
      syncedTo: null, payers: {}, used: [],
    });
    await quietly(SecureStore.deleteItemAsync(TOKEN_KEY));
    await quietly(AsyncStorage.multiRemove([CACHE_KEY, SETUP_KEY]));
  },

  chooseAccount: async (accountId) => {
    set({ accountId, items: [], syncedTo: null });

    const setup = await readSetup();

    await quietly(
      AsyncStorage.setItem(SETUP_KEY, JSON.stringify({ ...setup, accountId, syncedTo: null })),
    );
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

        set({ items: next, syncedTo: stamp, progress: { done: at + 1, total: windows.length } });
        await quietly(AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)));

        const setup = await readSetup();

        await quietly(
          AsyncStorage.setItem(SETUP_KEY, JSON.stringify({ ...setup, syncedTo: stamp })),
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
