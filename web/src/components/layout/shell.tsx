'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { authApi } from '@/lib/api/auth';
import { onSessionChange, readSession } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/lib/settings/store';
import { flushOffline, loadCatalogues, useCalendar } from '@/lib/store/calendar';
import { PointerFx, PressRipple, RevealObserver } from '@/lib/fx';
import { Toasts } from '@/lib/toast';
import { useUnlockCheck } from '@/components/achievements/badges';
import { CommandPalette, PALETTE_OPEN_EVENT } from '@/components/command/palette';
import { LiveBar } from '@/components/live/live-bar';
import { ShiftDoneOverlay } from '@/components/live/shift-done';
import { FeatureTour } from '@/components/tour/tour';
import { Icon } from '@/components/ui/icon';
import { Avatar } from '@/components/ui/avatar';
import { Profile, accountApi } from '@/lib/api/auth';
import { LiveTitle } from '@/components/layout/live-title';

const NAV: { href: string; label: string; icon: string }[] = [
  { href: '/dashboard', label: 'Calendar', icon: 'calendar' },
  { href: '/schedule', label: 'Schedule', icon: 'users' },
  { href: '/gigs', label: 'Gigs', icon: 'spark' },
  { href: '/payouts', label: 'Payouts', icon: 'wallet' },
  { href: '/bank', label: 'Bank', icon: 'coins' },
  { href: '/stats', label: 'Statistics', icon: 'chart' },
  { href: '/assistant', label: 'Assistant', icon: 'note' },
  { href: '/wrapped', label: 'Your year', icon: 'trophy' },
  { href: '/cv', label: 'Your record', icon: 'user' },
];

/**
 * The signed-in frame: one sticky top bar on wide screens, a tab bar on
 * narrow ones, and the client-side guard that sends anonymous visitors to the
 * login page. Pages render inside it.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const pendingOffline = useCalendar((state) => state.pendingOffline);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [face, setFace] = useState<Profile | null>(null);

  /**
   * One integer, so decisions about what to build next stop being guesses.
   *
   * The screen's name off the path and nothing else — no identifier of any
   * kind reaches this, by design and by test. Failing is silent: a counter
   * that can interrupt somebody's evening has its priorities backwards.
   */
  useEffect(() => {
    const screen = pathname.split('/')[1] || 'calendar';

    void fetch('/shifter/v1/status/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screen }),
    }).catch(() => undefined);
  }, [pathname]);

  useEffect(() => {
    void accountApi.get().then(setFace).catch(() => undefined);
  }, []);

  // The guard: no session, no page. Client-side, because the export is static.
  useEffect(() => {
    const check = () => {
      if (readSession() === null) {
        router.replace(`/login?returnUrl=${encodeURIComponent(pathname)}`);
      } else {
        setReady(true);
      }
    };

    check();

    return onSessionChange(check);
  }, [router, pathname]);

  useUnlockCheck(t);

  // Shift templates power the palette and the live bar on every page.
  useEffect(() => {
    if (ready) void loadCatalogues();
  }, [ready]);

  // Whatever the offline queue holds goes out as soon as a connection returns.
  useEffect(() => {
    void flushOffline();

    const flush = () => void flushOffline();

    addEventListener('online', flush);

    return () => removeEventListener('online', flush);
  }, []);

  // Said out loud, in the outbox's own words: the basement has no bars, the
  // app keeps working, and nothing typed is lost.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);

    const down = () => setOffline(true);
    const up = () => setOffline(false);

    addEventListener('offline', down);
    addEventListener('online', up);

    return () => {
      removeEventListener('offline', down);
      removeEventListener('online', up);
    };
  }, []);

  if (!ready) return null;

  const logout = () => {
    authApi.logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-dvh">
      <LiveTitle />
      <header className="sticky top-0 z-40 border-b border-border bg-(--surface)/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-1 px-3 sm:px-5">
          <Link href="/dashboard" className="mr-2 flex items-center gap-2 font-bold tracking-tight">
            <span
              className="grid h-7 w-7 place-items-center rounded-lg text-[0.95rem]"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              S
            </span>
            <span className="hidden text-[1.05rem] sm:inline">Shifter</span>
          </Link>

          <DesktopNav pathname={pathname} />

          <div className="ml-auto flex items-center gap-1">
            <LiveBar />
            {offline && (
              <span className="chip border-warn/40 bg-(--warn-soft) text-warn" title={t('Changes will be sent when the network returns')}>
                {t('offline')}
              </span>
            )}
            {pendingOffline > 0 && (
              <button
                type="button"
                className="chip border-warn/40 bg-(--warn-soft) text-warn"
                onClick={() => void flushOffline()}
                title={t('days waiting to sync')}
              >
                <Icon name="repeat" size={12} />
                {pendingOffline}
              </button>
            )}

            <button
              type="button"
              className="btn btn-quiet btn-sm"
              aria-label={t('Command palette')}
              data-tour="palette"
              title="⌘K"
              onClick={() => dispatchEvent(new CustomEvent(PALETTE_OPEN_EVENT))}
            >
              <Icon name="search" size={16} />
              <kbd className="hidden rounded border border-border px-1 text-[0.62rem] text-muted lg:inline">⌘K</kbd>
            </button>

            <button
              type="button"
              className="btn btn-quiet btn-sm"
              aria-label={t('Hide amounts')}
              onClick={() => update('hideAmounts', !settings.hideAmounts)}
            >
              <Icon name={settings.hideAmounts ? 'eye-off' : 'eye'} size={16} />
            </button>

            <div className="relative">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                aria-label={t('Account')}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {face !== null && face.avatar_kind !== null ? (
                  <Avatar kind={face.avatar_kind} data={face.avatar_data} name={face.first_name} size={22} />
                ) : (
                  <Icon name="user" size={16} />
                )}
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="card absolute right-0 z-50 mt-1.5 w-52 overflow-hidden py-1 shadow-(--shadow-lg)">
                    {[
                      { href: '/account', label: 'Account', icon: 'user' },
                      { href: '/webhooks', label: 'Webhooks', icon: 'swap' },
                      { href: '/whats-new', label: 'What’s new', icon: 'spark' },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-[0.88rem] hover:bg-surface-2"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Icon name={item.icon} size={15} className="text-muted" />
                        {t(item.label)}
                      </Link>
                    ))}
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[0.88rem] text-danger hover:bg-surface-2"
                      onClick={logout}
                    >
                      <Icon name="logout" size={15} />
                      {t('Sign out')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-3 pb-24 pt-4 sm:px-5 md:pb-8">{children}</main>

      <CommandPalette />
      <ShiftDoneOverlay />
      <FeatureTour />
      <Toasts />
      <PointerFx />
      <PressRipple />
      <RevealObserver />

      {/* Narrow screens: the five destinations as a thumb-height tab bar. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-(--surface)/92 backdrop-blur-md md:hidden">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.62rem] font-medium ${
                active ? 'text-(--accent)' : 'text-muted'
              }`}
            >
              <Icon name={item.icon} size={19} />
              {t(item.label)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}


/**
 * The desktop nav with a pill that slides between items instead of teleporting
 * — measured with getBoundingClientRect on every route change and window
 * resize, then moved with a transform the CSS springs.
 */
function DesktopNav({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const host = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const place = () => {
      const nav = host.current;
      const marker = pill.current;

      if (nav === null || marker === null) return;

      const active = nav.querySelector<HTMLElement>('[data-active="true"]');

      if (active === null) {
        marker.style.opacity = '0';

        return;
      }

      const navBox = nav.getBoundingClientRect();
      const box = active.getBoundingClientRect();

      marker.style.opacity = '1';
      marker.style.width = `${box.width}px`;
      marker.style.transform = `translateX(${box.left - navBox.left}px)`;
    };

    place();
    addEventListener('resize', place);

    // Fonts settling shifts widths a few pixels; re-measure once they load.
    void document.fonts?.ready.then(place);

    return () => removeEventListener('resize', place);
  }, [pathname]);

  return (
    <nav ref={host} className="relative hidden items-center gap-0.5 md:flex">
      <span ref={pill} className="nav-pill" style={{ opacity: 0 }} aria-hidden="true" />
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            data-active={active}
            className={`relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.85rem] font-medium transition-colors ${
              active ? 'text-(--accent-ink)' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon name={item.icon} size={15} />
            {t(item.label)}
          </Link>
        );
      })}
    </nav>
  );
}
