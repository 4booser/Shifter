import { useState } from 'react';
import { Link, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';
import { MoreHorizontal, Play, Square } from 'lucide-react';

import { ME } from '@/mock/data';
import { cn } from '@/lib/utils';

/**
 * Оболочка приложения.
 *
 * Настоящая: вкладки переключают маршруты, живая смена держится сверху на
 * всех экранах. Работает только навигация — за ней нет ни данных, ни
 * запросов, потому что это каркас.
 */
const NAV = [
  { to: '/', label: 'Календарь' },
  { to: '/shifts', label: 'Смены' },
  { to: '/places', label: 'Места' },
  { to: '/schedule', label: 'График' },
  { to: '/gigs', label: 'Подработки' },
  { to: '/payouts', label: 'Выплаты' },
  { to: '/bank', label: 'Банк' },
  { to: '/stats', label: 'Статистика' },
  { to: '/wrapped', label: 'Год' },
] as const;

/** То, что открывают раз в месяц: в верхней строке ему места нет. */
const MORE = [
  { to: '/report', label: 'Отчёт за месяц' },
  { to: '/payslip', label: 'Сверить расчётку' },
  { to: '/compare', label: 'Сравнить периоды' },
  { to: '/costs', label: 'Что работа стоила' },
  { to: '/team', label: 'Команда' },
  { to: '/seekers', label: 'Люди на бирже' },
  { to: '/service', label: 'Состояние и данные' },
] as const;

function Shell() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [live, setLive] = useState(true);
  const [more, setMore] = useState(false);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-paper/9 bg-night/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-5 px-5">
          <Link to="/" className="text-base font-extrabold tracking-[-0.04em] whitespace-nowrap">
            Shifter<span className="text-brass">.</span>
          </Link>

          <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
            {NAV.map((one) => {
              const on = one.to === '/' ? path === '/' : path.startsWith(one.to);

              return (
                <Link
                  key={one.to}
                  to={one.to}
                  className={cn(
                    'flex-none rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                    on ? 'bg-brass font-semibold text-night' : 'text-faint hover:text-paper',
                  )}
                >
                  {one.label}
                </Link>
              );
            })}
          </nav>

          <span className="relative flex flex-none items-center gap-2">
            <button
              type="button"
              onClick={() => setMore((was) => !was)}
              className={cn(
                'grid size-8 place-items-center rounded-full border transition-colors',
                more ? 'border-brass text-brass' : 'border-paper/17 text-dim hover:text-paper',
              )}
              aria-label="Ещё"
            >
              <MoreHorizontal className="size-4" />
            </button>

            <Link
              to="/account"
              className={cn(
                'grid size-8 place-items-center rounded-full border text-xs transition-colors',
                path.startsWith('/account')
                  ? 'border-brass text-brass'
                  : 'border-paper/17 text-dim hover:text-paper',
              )}
            >
              {ME.initials}
            </Link>

            {/* Ящик для того, что открывают раз в месяц: в верхней строке оно
                отнимало бы место у восьми вкладок, которыми пользуются каждый день. */}
            {more && (
              <div className="absolute top-11 right-0 z-50 w-60 rounded-[var(--radius-card)] border border-paper/17 bg-table p-2 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.9)]">
                {MORE.map((one) => (
                  <Link
                    key={one.to}
                    to={one.to}
                    onClick={() => setMore(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-dim transition-colors hover:bg-paper/5 hover:text-paper"
                  >
                    {one.label}
                  </Link>
                ))}
                <span className="mt-1 block border-t border-paper/9 pt-1">
                  <Link
                    to="/kit"
                    onClick={() => setMore(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-faint transition-colors hover:text-paper"
                  >
                    Дизайн-система
                  </Link>
                </span>
              </div>
            )}
          </span>
        </div>

        {/* Идущая смена: держится под навигацией на всех экранах. */}
        {live && (
          <div className="border-t border-paper/9 bg-table/60">
            <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2">
              <span className="flex items-center gap-2">
                <span className="size-1.5 animate-pulse rounded-full bg-brass" />
                <span className="text-sm font-semibold">🍸 Вечер</span>
              </span>
              <span className="font-mono text-lg font-bold tabular">3:07:42</span>
              <span className="font-mono text-sm font-semibold text-money tabular">₴1 640</span>
              <span className="hint">до конца 5:22:18</span>

              <span className="ml-auto flex items-center gap-2">
                <span className="inline-flex h-8 items-center rounded-[var(--radius-field)] px-3 text-xs font-semibold text-dim">
                  Перерыв 15
                </span>
                <button
                  type="button"
                  onClick={() => setLive(false)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-field)] bg-brass px-3 text-xs font-semibold text-night"
                >
                  <Square className="size-3" />
                  Закончить
                </button>
              </span>

              <span className="order-last h-0.5 w-full overflow-hidden rounded-full bg-night">
                <span className="block h-full w-[38%] rounded-full bg-brass" />
              </span>
            </div>
          </div>
        )}

        {!live && (
          <div className="border-t border-paper/9 bg-table/40">
            <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-5 py-2">
              <span className="hint">Смена закрыта — 8:12 на часах.</span>
              <button
                type="button"
                onClick={() => setLive(true)}
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-field)] border border-paper/17 px-3 text-xs font-semibold"
              >
                <Play className="size-3" />
                Начать смену
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-7">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-[1400px] px-5 pb-10">
        <p className="hint border-t border-paper/9 pt-4">
          Каркас интерфейса. Данные выдуманы, за кнопками ничего нет —{' '}
          <Link to="/kit" className="text-brass">дизайн-система</Link>.
        </p>
      </footer>
    </div>
  );
}

export const Route = createFileRoute('/_app')({ component: Shell });
