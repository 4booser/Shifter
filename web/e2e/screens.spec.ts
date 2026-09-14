import { expect, test } from '@playwright/test';

import { apiPut, createShiftTemplate, registerUser, signIn, todayKey } from './helpers';

/** The screens, looked at. */
const SCREENS = [
  { path: '/dashboard', name: 'calendar' },
  { path: '/stats', name: 'stats' },
  { path: '/payouts', name: 'payouts' },
  { path: '/bank', name: 'bank' },
  { path: '/wrapped', name: 'year' },
  // The five above were the ones anybody thought to shoot.
  { path: '/report', name: 'report' },
  { path: '/schedule', name: 'rota' },
  { path: '/team', name: 'team' },
  { path: '/gigs', name: 'gigs' },
  { path: '/account', name: 'account' },
] as const;

// The committed baselines are darwin-rendered; on any other platform this spec would fail on first sight and…
test.skip(
  process.platform !== 'darwin' && process.env['SCREENS'] !== '1',
  'screenshot baselines are darwin; the soft screens job opts in via SCREENS=1',
);

test.describe('screens', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const screen of SCREENS) {
      test(`${screen.name} in ${theme}`, async ({ page }) => {
        const user = await registerUser();
        const shift = await createShiftTemplate(user.token);

        /* A believable month, not an empty one: three worked days with tips and one planned ahead, so every screen has… */
        const month = todayKey().slice(0, 7);

        for (const [day, worked] of [
          ['05', true],
          ['06', true],
          ['07', true],
          ['26', false],
        ] as const) {
          await apiPut(user.token, `/days/${month}-${day}`, {
            shifts: [
              {
                shift_id: shift,
                worked,
                needs_cover: false,
                actual_start: null,
                actual_end: null,
                break_minutes: null,
                revenue: null,
              },
            ],
            sales: [],
            tips: worked ? 350 : null,
            tips_cash: null,
            deductions: 0,
            deduction_reason: null,
            note: null,
          });
        }

        await signIn(page, user);

        await page.addInitScript((mode) => {
          localStorage.setItem(
            'shifter.settings',
            JSON.stringify({ theme: mode, language: 'ru' }),
          );
        }, theme);

        await page.goto(screen.path);
        await page.waitForLoadState('networkidle');

        // The reveal animations settle fast; give them one beat so the shot
        // is of the page, not of the page arriving.
        await page.waitForTimeout(600);

        await expect(page).toHaveScreenshot(`${screen.name}-${theme}.png`, {
          fullPage: true,
          // Live figures move between runs — mask nothing, tolerate a little: the failures this hunts are collapsed…
          maxDiffPixelRatio: 0.02,
          animations: 'disabled',
        });
      });
    }
  }

  /* The day panel, open. */
  for (const theme of ['light', 'dark'] as const) {
    test(`day panel in ${theme}`, async ({ page }) => {
      const user = await registerUser();
      const shift = await createShiftTemplate(user.token);

      // Today, not a fixed August day: the calendar opens on the month it is in and has no query parameter to argue…
      const day = todayKey();

      await apiPut(user.token, `/days/${day}`, {
        shifts: [
          {
            shift_id: shift,
            worked: true,
            needs_cover: false,
            actual_start: '16:05',
            actual_end: '23:40',
            break_minutes: 30,
            revenue: null,
          },
        ],
        sales: [],
        tips: 420,
        tips_cash: 180,
        deductions: 150,
        deduction_reason: 'meal',
        note: 'Полный зал, две брони не пришли',
      });

      await signIn(page, user);

      await page.addInitScript((mode) => {
        localStorage.setItem(
          'shifter.settings',
          JSON.stringify({ theme: mode, language: 'ru' }),
        );
      }, theme);

      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.click(`[data-day="${day}"]`);
      await page.waitForTimeout(700);

      /* The panel alone, not the page: the grid behind it renumbers itself every month and would fail this shot on… */
      await expect(page.getByTestId('day-panel'))
        .toHaveScreenshot(`day-panel-${theme}.png`, {
          maxDiffPixelRatio: 0.02,
          animations: 'disabled',
        });
    });
  }
});
