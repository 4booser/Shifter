import { expect, test } from '@playwright/test';

import { createShiftTemplate, openDashboard, registerUser, signIn, todayKey } from './helpers';

test('picking a shift and clicking a day paints it and the money follows', async ({ page }) => {
  const user = await registerUser();

  await createShiftTemplate(user.token);
  await signIn(page, user);
  await openDashboard(page);

  // Arm the brush from the sidebar, then paint today.
  await page.getByRole('button', { name: /Bar/ }).first().click();
  await expect(page.getByText('Placing', { exact: false })).toBeVisible();

  // A real click: pointerdown lands on the cell, pointerup bubbles to the
  // grid's handler — synthetic events dispatched at body never reach it.
  await page.locator(`[data-day="${todayKey()}"]`).click();

  const today = page.locator(`[data-day="${todayKey()}"]`);

  // The chip lands in the cell, and the sidebar's summary catches up.
  await expect(today.getByText('Bar')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Earned').first()).toBeVisible();
});
