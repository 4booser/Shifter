import { test } from '@playwright/test';

import { apiPost, apiPut, createShiftTemplate, registerUser, signIn } from './helpers';

/**
 * The shop-window press: bakes the landing page's screenshots from the live
 * product, so the визитка can never quietly show pages that no longer exist.
 * Run by hand (SHOTS=1), writes straight into public/landing/.
 */
test.skip(process.env['SHOTS'] !== '1', 'the landing press runs only when asked: SHOTS=1');

test('bake the landing screenshots', async ({ page }) => {
  test.setTimeout(120_000);

  const user = await registerUser();

  // A place first, so the page opens on the product, not on the onboarding.
  await apiPost(user.token, '/locations', {
    name: 'Бар «Дым»',
    address: null,
    colour: '#4f46e5',
    pay_period: 'monthly',
    pay_day: 10,
    pay_anchor: null,
    overtime_weekly_hours: 40,
    overtime_multiplier: 1.5,
    night_multiplier: 1.3,
    night_from: '22:00',
    night_to: '06:00',
    public_holiday_multiplier: 1,
    holiday_country: 'UA',
    tip_out_of_tips_percent: 0,
    tip_out_of_sales_percent: 0,
    meal_deduction: 0,
    tax_percent: 0,
    tax_tips: false,
    holiday_percent: 0,
    currency: null,
  });

  const shift = await createShiftTemplate(user.token);

  // A month that photographs well: a believable rhythm with tips.
  for (const [day, tips] of [
    ['03', 850], ['04', 1200], ['06', 700], ['08', 1500], ['10', 900],
    ['11', 1100], ['13', 650], ['15', 1750], ['17', 800], ['18', 1300],
    ['20', 950], ['22', 1600], ['24', 720], ['25', 1050],
  ] as const) {
    await apiPut(user.token, `/days/2026-08-${day}`, {
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
      tips,
      tips_cash: null,
      deductions: 0,
      deduction_reason: null,
      note: null,
    });
  }

  // Two planned days ahead, so the calendar shows a future.
  for (const day of ['28', '30']) {
    await apiPut(user.token, `/days/2026-08-${day}`, {
      shifts: [{
        shift_id: shift,
        worked: false,
        needs_cover: false,
        actual_start: null,
        actual_end: null,
        break_minutes: null,
        revenue: null,
      }],
      sales: [],
      tips: null,
      tips_cash: null,
      deductions: 0,
      deduction_reason: null,
      note: null,
    });
  }

  await signIn(page, user);
  await page.addInitScript(() => {
    localStorage.setItem('shifter.settings', JSON.stringify({ theme: 'light', language: 'ru' }));
    localStorage.setItem('shifter.tour.v1', 'seen');
  });

  await page.setViewportSize({ width: 1531, height: 803 });

  for (const [path, name] of [
    ['/dashboard', 'calendar.jpg'],
    ['/stats', 'stats.jpg'],
    ['/gigs', 'gigs.jpg'],
  ] as const) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1400);
    await page.screenshot({
      path: `public/landing/${name}`,
      type: 'jpeg',
      quality: 82,
      animations: 'disabled',
    });
  }
});
