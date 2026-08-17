import { Service, effect, inject, signal } from '@angular/core';

import { CalendarStore } from '../calendar/calendar-store';
import { I18n } from '../i18n/i18n';
import { SettingsStore } from '../settings/settings-store';
import { ServiceWorkerHost } from './sw-register';

/** What the browser currently allows, kept as a signal so the UI can follow it. */
export type Permission = 'default' | 'granted' | 'denied' | 'unsupported';

const LAST_FIRED_KEY = 'shifter.reminder.last';

/**
 * The nudge to close the day. Without a push server this can only fire while
 * the app has been opened at some point that day, so it does two things: sets
 * a timer for the chosen hour, and checks on every start whether that hour has
 * already passed with days still open. That covers the realistic case — the
 * phone comes out of a pocket after the shift — without pretending to be a
 * background service it is not.
 */
@Service()
export class Reminders {
  private readonly settings = inject(SettingsStore);
  private readonly store = inject(CalendarStore);
  private readonly worker = inject(ServiceWorkerHost);
  private readonly i18n = inject(I18n);

  readonly permission = signal<Permission>(
    'Notification' in globalThis ? Notification.permission : 'unsupported',
  );

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const settings = this.settings.settings();

      this.clear();

      if (!settings.notifyUnclosed || this.permission() !== 'granted') return;

      this.catchUp(settings.notifyAt);
      this.schedule(settings.notifyAt);
    });
  }

  /** Asks the browser, and remembers the answer for the settings screen. */
  async request(): Promise<Permission> {
    if (!('Notification' in globalThis)) return 'unsupported';

    const result = await Notification.requestPermission();

    this.permission.set(result);

    return result;
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);

    this.timer = null;
  }

  /** Sets a single timer for today's time, or tomorrow's if it has passed. */
  private schedule(at: string): void {
    const now = new Date();
    const [hours, minutes] = at.split(':').map(Number);
    const target = new Date(now);

    target.setHours(hours, minutes, 0, 0);

    if (target <= now) target.setDate(target.getDate() + 1);

    const delay = target.getTime() - now.getTime();

    // A timer that far out is unreliable anyway — the tab will very likely be
    // discarded first — so the start-up check is what actually carries it.
    this.timer = setTimeout(() => {
      this.fire();
      this.schedule(at);
    }, Math.min(delay, 2 ** 31 - 1));
  }

  /** Fires once for a day whose reminder time has already gone by. */
  private catchUp(at: string): void {
    const now = new Date();
    const [hours, minutes] = at.split(':').map(Number);
    const due = new Date(now);

    due.setHours(hours, minutes, 0, 0);

    if (now < due) return;

    this.fire();
  }

  private fire(): void {
    const open = this.store.unclosedDays();

    if (open.length === 0) return;

    // One reminder a day: the point is a nudge, not nagging.
    const today = new Date().toISOString().slice(0, 10);

    if (localStorage.getItem(LAST_FIRED_KEY) === today) return;

    localStorage.setItem(LAST_FIRED_KEY, today);

    this.worker.notify(
      this.i18n.t('Close your day'),
      `${open.length} ${this.i18n.t('days are still open — tips and sales are missing.')}`,
    );
  }
}
