import { expect, test } from '@playwright/test';

import { registerUser } from './helpers';

test('the login form signs a person in and the guard lets them through', async ({ page }) => {
  const user = await registerUser();

  await page.goto('/login');
  await page.locator('input[autocomplete="username"]').fill(user.login);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(page.locator('[data-day]').first()).toBeVisible();

  // The guard in reverse: a signed-out visitor bounces back to login.
  await page.evaluate(() => localStorage.removeItem('shifter.session'));
  await page.goto('/stats');
  await page.waitForURL('**/login**', { timeout: 15_000 });
});
