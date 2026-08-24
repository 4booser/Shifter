import { Routes } from '@angular/router';

import { anonymousGuard, authGuard } from './core/auth/auth-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'stats',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/stats/stats').then((m) => m.Stats),
  },
  {
    path: 'payouts',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/payouts/payouts').then((m) => m.Payouts),
  },
  {
    path: 'team',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/team/team').then((m) => m.TeamPage),
  },
  {
    path: 'schedule',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/schedule/schedule').then((m) => m.SchedulePage),
  },
  {
    path: 'webhooks',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/webhooks/webhooks').then((m) => m.Webhooks),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/account/account').then((m) => m.Account),
  },
  {
    path: 'wrapped',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/wrapped/wrapped').then((m) => m.Wrapped),
  },
  {
    path: 'login',
    canActivate: [anonymousGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [anonymousGuard],
    loadComponent: () => import('./pages/register/register').then((m) => m.Register),
  },
  { path: '**', redirectTo: 'dashboard' },
];
