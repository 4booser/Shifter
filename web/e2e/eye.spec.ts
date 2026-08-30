import { expect, test } from '@playwright/test';

import { apiPut, createShiftTemplate, registerUser, signIn } from './helpers';

/**
 * The eye's warden. «Скрыть суммы» has been repaired by hand twice; this
 * walks the money pages with the eye shut and fails on any hryvnia figure
 * still visible. The dashboard is deliberately out of scope for now: the
 * brief embeds server-composed sentences with figures in them, and hiding
 * those is a different feature, not a leak of the client formatter.
 */
test('the shut eye leaves no hryvnia figures behind', async ({ page }) => {
  const user = await registerUser();
  const shift = await createShiftTemplate(user.token);

  // Three fresh days counting back from today, so the stats month always
  // has something to hide no matter when this runs.
  const stamp = (back: number) => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  };

  for (const day of [stamp(0), stamp(1), stamp(2)]) {
    await apiPut(user.token, `/days/${day}`, {
      shifts: [{
        shift_id: shift,
        worked: true,
        needs_cover: false,
        actual_start: null,
        actual_end: null,
        break_minutes: null,
        revenue: null,
      }],
      sales: [],
      tips: 350,
      tips_cash: null,
      deductions: 0,
      deduction_reason: null,
      note: null,
    });
  }

  await signIn(page, user);
  await page.addInitScript(() => {
    localStorage.setItem(
      'shifter.settings',
      JSON.stringify({ theme: 'light', language: 'ru', hideAmounts: true }),
    );
  });

  // /schedule and /team render join screens for a crewless account — no
  // figures, but the walk still proves no formatter leaks on the shell.
  for (const path of ['/stats', '/payouts', '/bank', '/schedule', '/team']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(700);

    const text = await page.evaluate(() => document.body.innerText);

    // ₴ glued to digits on the same line, in either order — the client money
    // formats. ₴••• is the eye doing its job and passes; \s would leap across
    // newlines and marry a date to the next line's hryvnia, so spaces only.
    const leaks = text.match(/₴[  ]?\d|\d[  ]?₴/g) ?? [];

    expect(leaks, `${path} shows money with the eye shut: ${leaks.slice(0, 5).join(' | ')}`).toEqual([]);

    // The pass must mean «hidden», not «empty»: the money pages are seeded,
    // so at least one shuttered figure has to be on screen.
    if (path === '/stats' || path === '/payouts') {
      expect(text, `${path} rendered no ₴••• at all — did the page load?`).toContain('₴•••');
    }
  }
});
