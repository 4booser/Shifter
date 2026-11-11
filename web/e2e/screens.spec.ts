import { Page, expect, test } from '@playwright/test';

import { apiPut, createShiftTemplate, registerUser, signIn } from './helpers';

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

// The baselines are Linux-only: shot on a runner, by the screens job and the
// "Refresh the screens" workflow, because nothing else renders fonts the way a
// runner does. Anywhere else, a laptop included, this spec would fail on first
// sight, so it stays out of every run that does not ask for it by name.
test.skip(
  process.env['SCREENS'] !== '1',
  'the screens are shot on Linux in CI; SCREENS=1 opts in',
);

/** The day every shot is taken on. */
const MONTH = '2026-09';
const DAY = `${MONTH}-16`;

/** A moment on the pinned day, for every stamp the server makes with its own clock. */
const STAMP = `${DAY}T09:00:00Z`;

type Json = Record<string, unknown>;

/** The server's real answer to a GET, with the fields its clock or its dice wrote replaced. */
async function rewrite(page: Page, url: string, change: (body: Json) => Json): Promise<void> {
  await page.route(url, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();

    const response = await route.fetch();

    await route.fulfill({ response, json: change((await response.json()) as Json) });
  });
}

/**
 * Hold still what the pinned clock cannot reach. The browser's day is pinned,
 * the server's is not: the records card counts sixty days back from the
 * server's today, so the seed slid out of it a week after the baselines were
 * taken, and the card vanished from a page nobody had touched. The badge check
 * fires two and a half seconds after load, so whether its confetti made the
 * shot came down to how long the page took to settle.
 *
 * The same goes for everything the server stamps with the moment it happened
 * or makes up on the spot, which reached two shots. On the account screen:
 * the login, made of the moment of registration and a random tail; «С нами
 * с», the month the account was made, which turns over with the real
 * calendar; the hour each signed-in session was opened; and the referral
 * code, random per account. In the day panel's DOM: the time of each change
 * in the day's history. Two runs a minute apart differed in every one of them
 * except the month, which only waits for the calendar to turn. Each is
 * rewritten from the real answer on its way to the page, so everything else
 * in it is still what the server said.
 */
async function holdStill(page: Page): Promise<void> {
  await rewrite(page, '**/shifter/v1/account', (body) => ({
    ...body,
    login: 'e2-screens',
    created_at: STAMP,
  }));

  await rewrite(page, '**/shifter/v1/account/sessions', (body) => ({
    ...body,
    sessions: (body['sessions'] as Json[]).map((session) => ({
      ...session,
      created_at: STAMP,
      expires_at: `${MONTH}-23T09:00:00Z`,
    })),
  }));

  await rewrite(page, '**/shifter/v1/account/referral', (body) => ({ ...body, code: '5c4ee115' }));

  await rewrite(page, '**/shifter/v1/days/*/history', (body) => ({
    ...body,
    entries: (body['entries'] as Json[]).map((entry) => ({ ...entry, at: STAMP })),
  }));

  await page.route('**/shifter/v1/health/records', (route) =>
    route.fulfill({
      json: [
        {
          kind: 'actual_times_unsaid',
          count: 3,
          sample: [`${MONTH}-07`, `${MONTH}-06`, `${MONTH}-05`],
          hurts: 'rest_windows',
        },
      ],
    }),
  );

  // Every badge either seed can earn, already celebrated.
  await page.addInitScript(() => {
    localStorage.setItem('shifter.achievements', JSON.stringify(['first-shift', 'first-money', 'streak-3']));
  });

  // The dice as well as the clock, which page.clock does not reach. The tips
  // ribbon on the calendar starts at a random tip, and the confetti scatters at
  // random. Neither shows today: the seed has no place of work, so the calendar
  // is shot in its first-run state with the ribbon hidden, and the badges are
  // celebrated above. The day the seed gets a place, the ribbon appears and
  // would read differently on every run. A fixed sequence (Park and Miller's)
  // rather than a constant, so code that draws twice still gets two numbers.
  await page.addInitScript(() => {
    let seed = 1;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
}

test.describe('screens', () => {
  // The service worker answers API calls itself, and a route never sees what
  // it answers, so it stays out of these shots.
  //
  // The browser's zone is pinned as well as its clock. The pinned instant is
  // nine in the morning in UTC and noon in Kyiv, and which of the two a page
  // showed came from whatever machine ran it. UTC is the runners' own zone,
  // the one every baseline was shot in.
  test.use({ serviceWorkers: 'block', timezoneId: 'UTC' });

  // The seed used to follow the real calendar, so a shot changed shape with the
  // date: on the first of a month its worked days were still ahead, the year
  // held one column, and the page came out ten thousand pixels tall.
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${DAY}T12:00:00+03:00`));
  });

  for (const theme of ['light', 'dark'] as const) {
    for (const screen of SCREENS) {
      test(`${screen.name} in ${theme}`, async ({ page }) => {
        const user = await registerUser();
        const shift = await createShiftTemplate(user.token);

        /* A believable month, not an empty one: three worked days with tips and one planned ahead, so every screen has… */
        for (const [day, worked] of [
          ['05', true],
          ['06', true],
          ['07', true],
          ['26', false],
        ] as const) {
          await apiPut(user.token, `/days/${MONTH}-${day}`, {
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
        await holdStill(page);

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

      const day = DAY;

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
      await holdStill(page);

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
