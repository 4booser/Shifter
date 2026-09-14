import { Outlet, createRootRoute } from '@tanstack/react-router';

/** Корень. */
export const Route = createRootRoute({ component: Outlet });
