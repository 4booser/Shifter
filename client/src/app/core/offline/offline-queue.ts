import { HttpClient } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';

import { DaySave } from '../calendar/calendar.models';

/**
 * A day saved without a connection. Keyed by date, because a second edit to
 * the same day replaces the first rather than queueing behind it — the payload
 * is the whole day, so only the last one matters.
 */
interface PendingDay {
  date: string;
  body: DaySave;
  queuedAt: number;
}

const DB_NAME = 'shifter-offline';
const STORE = 'days';

/**
 * Holds day saves that could not reach the server and replays them when it
 * comes back. IndexedDB rather than localStorage: a queue has to survive the
 * tab being closed mid-shift, and localStorage is wiped by some browsers under
 * storage pressure well before IndexedDB is.
 */
@Service()
export class OfflineQueue {
  private readonly http = inject(HttpClient);

  private readonly _pending = signal<PendingDay[]>([]);
  private readonly _flushing = signal(false);

  /** Days waiting to reach the server. */
  readonly pending = this._pending.asReadonly();
  readonly count = computed(() => this._pending().length);
  readonly flushing = this._flushing.asReadonly();

  readonly online = signal(navigator.onLine);

  /** Emits after a successful replay so the calendar can reload itself. */
  readonly flushed = new Subject<string[]>();

  private db: Promise<IDBDatabase> | null = null;

  constructor() {
    void this.restore();

    addEventListener('online', () => {
      this.online.set(true);
      void this.flush();
    });

    addEventListener('offline', () => this.online.set(false));
  }

  /** Puts a day in the queue, replacing any earlier version of the same date. */
  async enqueue(date: string, body: DaySave): Promise<void> {
    const entry: PendingDay = { date, body, queuedAt: Date.now() };

    this._pending.update((list) => [...list.filter((item) => item.date !== date), entry]);

    const db = await this.open();

    await this.run(db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry));
  }

  /**
   * Sends everything waiting, oldest first. Stops at the first failure: if the
   * connection dropped again there is no point hammering the rest, and the
   * order days were edited in is worth keeping.
   */
  async flush(): Promise<void> {
    if (this._flushing() || this._pending().length === 0 || !navigator.onLine) return;

    this._flushing.set(true);

    const sent: string[] = [];

    for (const entry of [...this._pending()].sort((a, b) => a.queuedAt - b.queuedAt)) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.http
            .put(`/shifter/v1/days/${entry.date}`, entry.body)
            .subscribe({ next: () => resolve(), error: reject });
        });

        await this.remove(entry.date);
        sent.push(entry.date);
      } catch {
        break;
      }
    }

    this._flushing.set(false);

    if (sent.length > 0) this.flushed.next(sent);
  }

  /** Drops the queue without sending it; used when the user gives up on it. */
  async discard(): Promise<void> {
    const db = await this.open();

    await this.run(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());

    this._pending.set([]);
  }

  private async remove(date: string): Promise<void> {
    this._pending.update((list) => list.filter((item) => item.date !== date));

    const db = await this.open();

    await this.run(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(date));
  }

  private async restore(): Promise<void> {
    try {
      const db = await this.open();
      const all = await this.run<PendingDay[]>(
        db.transaction(STORE, 'readonly').objectStore(STORE).getAll(),
      );

      this._pending.set(all ?? []);

      // A tab that opens already online should not sit on stale writes.
      if (this._pending().length > 0) void this.flush();
    } catch {
      // Private browsing can refuse IndexedDB outright. The app still works;
      // it simply cannot promise anything about offline edits.
      this._pending.set([]);
    }
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'date' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.db;
  }

  private run<T = unknown>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
