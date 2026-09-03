import { Link, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Clock,
  Coins,
  Landmark,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';

import { LiveBar } from '@/components/live/live-bar';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/**
 * The shell every signed-in screen wears.
 *
 * One rail, one accent, and the active page named by a filled pill rather
 * than by a colour alone — the strip is read at a glance between two tables
 * and has to survive being glanced at.
 */
/*
 * The labels here are dictionary keys, not words. A module constant is
 * evaluated once, before any component exists, so it cannot call the hook —
 * the whole strip stayed English while the page under it was Ukrainian.
 * Translated where it is drawn, below.
 */
const NAV = [
  { to: '/', label: 'Calendar', icon: CalendarDays },
  { to: '/shifts', label: 'Shifts', icon: Clock },
  { to: '/places', label: 'Places', icon: Building2 },
  { to: '/schedule', label: 'Rota', icon: Users },
  { to: '/gigs', label: 'Gigs', icon: Sparkles },
  { to: '/payouts', label: 'Payouts', icon: Wallet },
  { to: '/bank', label: 'Bank', icon: Landmark },
  { to: '/stats', label: 'Statistics', icon: BarChart3 },
  { to: '/wrapped', label: 'Your year', icon: Trophy },
] as const;

function AppShell() {
  const { t } = useI18n();
  const path = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-1 px-3 sm:px-5">
          <Link to="/" className="mr-3 flex items-center gap-2 font-bold tracking-tight">
            <span
              className="grid size-7 place-items-center rounded-lg text-sm font-black"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              S
            </span>
            Shifter
          </Link>

          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {NAV.map((item) => {
              const active = item.to === '/' ? path === '/' : path.startsWith(item.to);

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex flex-none items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <item.icon className="size-4" />
                  {t(item.label)}
                </Link>
              );
            })}
          </nav>

          <Link
            to="/account"
            className="ml-2 grid size-8 flex-none place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-ink"
            aria-label={t('Account')}
          >
            <Coins className="size-4" />
          </Link>
        </div>
        <LiveBar />
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-3 py-5 sm:px-5">
        <Outlet />
      </main>
    </div>
  );
}

export const Route = createFileRoute('/_app')({ component: AppShell });
