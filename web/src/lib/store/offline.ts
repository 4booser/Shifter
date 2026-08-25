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

  async put(entry: PendingDay): Promise<void> {
    const database = await open();

    await run(database.transaction(STORE, 'readwrite').objectStore(STORE).put(entry));
  },

  async remove(date: string): Promise<void> {
    const database = await open();

    await run(database.transaction(STORE, 'readwrite').objectStore(STORE).delete(date));
  },
};
