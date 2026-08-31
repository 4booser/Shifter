import { expect, test } from '@playwright/test';

import { apiPut, createShiftTemplate, registerUser, signIn } from './helpers';

/**
 * The goal meter, end to end: set an amount the month has already beaten,
 * and the stats page must say so out loud. This guards the whole chain —
 * the goal rows, activeGoalFor's period maths, and the reached branch that
 * fires the confetti.
 */
test('a goal the month has beaten reads as taken', async ({ page }) => {
  const user = await registerUser();
  const shift = await createShiftTemplate(user.token);

  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-05`;

  await apiPut(user.token, `/days/${key}`, {
    shifts: [
      {
        shift_id: shift,
        worked: true,
        needs_cover: false,
        actual_start: null,
        actual_end: null,
        break_minutes: null,
        revenue: null,
      },
    ],
    sales: [],
    tips: 350,
    tips_cash: null,
    deductions: 0,
    deduction_reason: null,
    note: null,
  });

  await apiPut(user.token, '/goals', { period: 'month', amount: 100, anchor: null, note: null });

  await signIn(page, user);
  await page.goto('/stats');

  await expect(page.getByText('Reached')).toBeVisible({ timeout: 15_000 });
});
