'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { authApi } from '@/lib/api/auth';
import { onSessionChange, readSession } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/lib/settings/store';
import { flushOffline, useCalendar } from '@/lib/store/calendar';
import { Icon } from '@/components/ui/icon';

const NAV: { href: string; label: string; icon: string }[] = [
  { href: '/dashboard', label: 'Calendar', icon: 'calendar' },
  { href: '/schedule', label: 'Schedule', icon: 'users' },
  { href: '/payouts', label: 'Payouts', icon: 'wallet' },
  { href: '/stats', label: 'Statistics', icon: 'chart' },
  { href: '/wrapped', label: 'Your year', icon: 'trophy' },
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

  // Whatever the offline queue holds goes out as soon as a connection returns.
  useEffect(() => {
    void flushOffline();

    const flush = () => void flushOffline();

    addEventListener('online', flush);

    return () => removeEventListener('online', flush);
  }, []);

  if (!ready) return null;

  const logout = () => {
    authApi.logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-dvh">
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

          <nav className="hidden items-center gap-0.5 md:flex">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.85rem] font-medium transition-colors ${
                    active ? 'text-(--accent-ink)' : 'text-muted hover:bg-surface-2 hover:text-ink'
                  }`}
                  style={active ? { background: 'var(--accent)' } : undefined}
                >
                  <Icon name={item.icon} size={15} />
                  {t(item.label)}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
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
                <Icon name="user" size={16} />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="card absolute right-0 z-50 mt-1.5 w-52 overflow-hidden py-1 shadow-(--shadow-lg)">
                    {[
                      { href: '/account', label: 'Account', icon: 'user' },
                      { href: '/webhooks', label: 'Webhooks', icon: 'swap' },
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
