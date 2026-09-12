import { expect, test } from '@playwright/test';

import { apiPut, createShiftTemplate, registerUser, signIn, todayKey } from './helpers';

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
  // The five above were the ones anybody thought to shoot. These five are
  // screens nothing has ever rendered outside a person's browser — and the
  // report is where a fall of 1851% and an axis with two dates in one place
  // both sat in plain sight for as long as they did.
  { path: '/report', name: 'report' },
  { path: '/schedule', name: 'rota' },
  { path: '/team', name: 'team' },
  { path: '/gigs', name: 'gigs' },
  { path: '/account', name: 'account' },
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

        /*
         * A believable month, not an empty one: three worked days with tips
         * and one planned ahead, so every screen has something to say.
         *
         * In the month the screens actually open on, which is this one. The
         * dates used to be hard-coded to August — true when they were
         * written — and every page opens on today, so every baseline in here
         * was a photograph of an empty state. The report said «В этом месяце
         * ничего не записано» and that was the shot being defended.
         */
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
          // Live figures move between runs — mask nothing, tolerate a little:
          // the failures this hunts are collapsed sections and unreadable
          // themes, which move whole regions, not pixels.
          maxDiffPixelRatio: 0.02,
          animations: 'disabled',
        });
      });
    }
  }

  /*
   * The day panel, open.
   *
   * Every screen above is a page; this is the thing people actually spend
   * their evening in, and no shot has ever included it. It is also where the
   * save button used to be, which means its layout changed this week and
   * nobody outside this session has seen it.
   */
  for (const theme of ['light', 'dark'] as const) {
    test(`day panel in ${theme}`, async ({ page }) => {
      const user = await registerUser();
      const shift = await createShiftTemplate(user.token);

      // Today, not a fixed August day: the calendar opens on the month it is
      // in and has no query parameter to argue with, so a day in any other
      // month is simply not on the screen to click.
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

      /*
       * The panel alone, not the page: the grid behind it renumbers itself
       * every month and would fail this shot on the first of every one.
       *
       * And a warning to whoever reads this picture: the «Фактически» fields
       * show «04:05» where the shift starts at 16:05. That is headless
       * Chromium drawing a native time input on a twelve-hour clock with the
       * meridiem left blank — it ignores both --lang and LANG. The DOM holds
       * 16:05, and a real browser on this machine draws 16:05. Do not go
       * fixing it; this cost an hour once already.
       */
      await expect(page.getByTestId('day-panel'))
        .toHaveScreenshot(`day-panel-${theme}.png`, {
          maxDiffPixelRatio: 0.02,
          animations: 'disabled',
        });
    });
  }
});
