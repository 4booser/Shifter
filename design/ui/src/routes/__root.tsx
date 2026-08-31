import { Link, Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';
import { Boxes, FileText, Landmark, Layers, PanelsTopLeft, Settings, Smartphone, SquareStack } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Обёртка макета.
 *
 * Верхняя полоса — не часть продукта, а оглавление макета: по ней ходят те,
 * кто смотрит, а не те, кто работает. Внутри каждого раздела уже настоящий
 * интерфейс со своей навигацией.
 */
const SECTIONS = [
  { to: '/', label: 'Обзор', icon: Layers },
  { to: '/screens', label: 'Экраны', icon: PanelsTopLeft },
  { to: '/modals', label: 'Окна', icon: SquareStack },
  { to: '/phone', label: 'Телефон', icon: Smartphone },
  { to: '/account', label: 'Настройки', icon: Settings },
  { to: '/papers', label: 'Бумаги', icon: FileText },
  { to: '/more', label: 'Остальное', icon: Boxes },
  { to: '/foundations', label: 'Основа', icon: Landmark },
] as const;

function Shell() {
  const path = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="min-h-dvh">
      <nav className="sticky top-0 z-50 border-b border-paper/9 bg-night/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center gap-1 overflow-x-auto px-6 py-2.5">
          <span className="mr-4 font-mono text-2xs tracking-[0.16em] text-faint uppercase">
            Shifter · макет
          </span>
          {SECTIONS.map((one) => {
            const on = one.to === '/' ? path === '/' : path.startsWith(one.to);

            return (
              <Link
                key={one.to}
                to={one.to}
                className={cn(
                  'flex flex-none items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  on ? 'bg-brass text-night' : 'text-faint hover:text-paper',
                )}
              >
                <one.icon className="size-3.5" />
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

export const Route = createRootRoute({ component: Shell });
