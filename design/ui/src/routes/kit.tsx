import { Link, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';

import { cn } from '@/lib/utils';

/**
 * Дизайн-система: то, из чего собран сайт.
 *
 * Живёт рядом с самим сайтом, а не внутри него — это справочник для тех, кто
 * строит, а не экран для тех, кто работает.
 */
const PARTS = [
  { to: '/kit', label: 'Основа' },
  { to: '/kit/states', label: 'Состояния' },
  { to: '/kit/modals', label: 'Окна' },
  { to: '/kit/phone', label: 'Телефон' },
] as const;

function Kit() {
  const path = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="min-h-dvh">
      <nav className="sticky top-0 z-40 border-b border-paper/9 bg-night/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center gap-1 overflow-x-auto px-6 py-2.5">
          <Link to="/" className="mr-4 font-mono text-2xs tracking-[0.16em] text-faint uppercase">
            ← к сайту
          </Link>
          {PARTS.map((one) => {
            const on = one.to === '/kit' ? path === '/kit' : path.startsWith(one.to);

            return (
              <Link
                key={one.to}
                to={one.to}
                className={cn(
                  'flex-none rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  on ? 'bg-brass text-night' : 'text-faint hover:text-paper',
                )}
              >
                {one.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/kit')({ component: Kit });
