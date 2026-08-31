import { expect, test } from '@playwright/test';

import { registerUser, signIn } from './helpers';

/**
 * The bank on its test drive, end to end: the example walks in without a
 * token, shows a living month, survives a walk around the app (the flag is
 * per-tab), and leaves without a trace. This is the regression net over the
 * only path that lets anyone — person or spec — see the bank page at all.
 */
test('the bank example walks in, shows a living month, and leaves cleanly', async ({ page }) => {
  const user = await registerUser();

  await signIn(page, user);

  await page.goto('/bank');
  await page.getByRole('button', { name: 'Look around on an example' }).click();

  // The fiction is named, and the money is on screen.
  await expect(page.getByText('This is an example', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('On the card')).toBeVisible();

  // The detector finds the standing charges the generator planted — the
  // regression this guards was invisible for months: a monthly charge seen
  // through a one-month window is one line, never a subscription.
  await expect(page.getByText('Comes round by itself')).toBeVisible();
  await expect(page.getByText('Netflix').first()).toBeVisible();

  // A walk around the app does not kill the example: the choice lives for
  // the tab, and hydrate rebuilds the same deterministic days anywhere.
  await page.getByRole('link', { name: 'Calendar' }).first().click();
  await expect(page.locator('[data-day]').first()).toBeVisible({ timeout: 15_000 });

  // The day panel picks up the statement's half of the story. The wage day
  // is the one date the generator fills unconditionally — the 5th and 20th
  // always carry the salary credit — so the spec stands on it whatever the
  // calendar says today. Yesterday would be probabilistic and flake.
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const wageDay =
    now.getDate() >= 5
      ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-05`
      : `${new Date(now.getFullYear(), now.getMonth() - 1, 20).getFullYear()}-${pad(new Date(now.getFullYear(), now.getMonth() - 1, 20).getMonth() + 1)}-20`;

  await page.locator(`[data-day="${wageDay}"]`).click();
  await expect(page.getByText('The card, this day')).toBeVisible();

  await page.getByRole('link', { name: 'Bank' }).first().click();
  await expect(page.getByText('This is an example', { exact: false }).first()).toBeVisible();

  // Leaving erases the whole fiction.
  await page.getByRole('button', { name: 'Leave the example' }).click();
  await expect(page.getByText('Connect monobank')).toBeVisible();
});
