'use client';

import { DaySave } from '../calendar/models';

/**
 * Day saves that could not reach the server, replayed when it comes back.
 * IndexedDB rather than localStorage: a queue has to survive the tab closing
 * mid-shift, and localStorage is wiped under storage pressure well before
 * IndexedDB is. Keyed by date — the payload is the whole day, so a second
 * edit replaces the first rather than queueing behind it.
 */

export interface PendingDay {
  date: string;
  body: DaySave;
  queuedAt: number;
}

const DB_NAME = 'shifter-offline';
const STORE = 'days';

let db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'date' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return db;
}

function run<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const offlineQueue = {
  async all(): Promise<PendingDay[]> {
    try {
      const database = await open();

      return (await run(database.transaction(STORE).objectStore(STORE).getAll())) ?? [];
    } catch {
      // Private browsing can refuse IndexedDB outright; the app still works.
      return [];
    }
  },

  /**
   * True where the day is safely queued, false where the browser refused to
   * hold it.
   *
   * The refusal is the whole point of the answer. Private browsing declines
   * IndexedDB outright, and this throw used to escape the catch block it was
   * called from: the counter never rose, no error was shown, and the cell
   * kept showing what somebody had typed as though it were saved. A day lost
   * quietly is worse than a day that failed loudly.
   */
  async put(entry: PendingDay): Promise<boolean> {
    try {
      const database = await open();

      await run(database.transaction(STORE, 'readwrite').objectStore(STORE).put(entry));

      return true;
    } catch {
      return false;
    }
  },

  async remove(date: string): Promise<void> {
    try {
      const database = await open();

      await run(database.transaction(STORE, 'readwrite').objectStore(STORE).delete(date));
    } catch {
      // Nothing to remove where nothing could be stored.
    }
  },
};
