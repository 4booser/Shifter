import { Outlet, createRootRoute } from '@tanstack/react-router';

/**
 * Корень.
 *
 * Пустой: у сайта своя оболочка в `_app`, у дизайн-системы — своя в `kit`,
 * а экраны входа не носят ни одной из них.
 */
export const Route = createRootRoute({ component: Outlet });
