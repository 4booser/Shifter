import { expect, test } from '@playwright/test';

import { apiPut, createShiftTemplate, registerUser, signIn } from './helpers';

/**
 * The screens, looked at.
 *
 * Four widget bugs were found the day somebody finally rendered the widgets;
 * nothing renders the web screens except people. These shots are the web's
 * equivalent: calendar, stats, payouts, bank and the year, in both themes. A diff is
 * a question, not an automatic failure — run with --update-snapshots after
 * looking, and the look is the point.
 */
const SCREENS = [
  { path: '/dashboard', name: 'calendar' },
  { path: '/stats', name: 'stats' },
  { path: '/payouts', name: 'payouts' },
  { path: '/bank', name: 'bank' },
  { path: '/wrapped', name: 'year' },
] as const;

// The committed baselines are darwin-rendered; on any other platform this
// spec would fail on first sight and block a deploy over font hinting. The
// deploy's e2e run therefore skips it, and the dedicated soft CI job opts in
// with SCREENS=1 and --update-snapshots to hang fresh shots on the run.
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

        // A believable month, not an empty one: three worked days with tips
        // and one planned ahead, so every screen has something to say.
        for (const [day, worked] of [
          ['05', true],
          ['06', true],
          ['07', true],
          ['26', false],
        ] as const) {
          await apiPut(user.token, `/days/2026-08-${day}`, {
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
          // Live figures move between runs — mask nothing, tolerate a little:
          // the failures this hunts are collapsed sections and unreadable
          // themes, which move whole regions, not pixels.
          maxDiffPixelRatio: 0.02,
          animations: 'disabled',
        });
      });
    }
  }
});
