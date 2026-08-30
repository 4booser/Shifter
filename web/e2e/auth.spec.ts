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

test('a wrong password answers through the code map, not the raw envelope', async ({ page }) => {
  const user = await registerUser();

  await page.goto('/login');
  await page.locator('input[autocomplete="username"]').fill(user.login);
  await page.locator('input[type="password"]').fill('WrongWrong1@');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The dictionary phrase for auth.invalid — not the server's own
  // «Invalid login or password.» fallback. Seeing this string proves the
  // code travelled the whole way: middleware → envelope → client map.
  await expect(page.getByText('Wrong login or password.')).toBeVisible({ timeout: 10_000 });
});
