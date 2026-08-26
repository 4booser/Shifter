import { expect, test } from '@playwright/test';

import { apiGet, createShiftTemplate, openDashboard, registerUser, signIn, todayKey } from './helpers';

test('a live shift starts from the palette, ticks, finishes onto the day', async ({ page }) => {
  const user = await registerUser();

  await createShiftTemplate(user.token);
  await signIn(page, user);
  await openDashboard(page);

  // The palette owns starting; the header button opens it without Cmd+K.
  await page.getByRole('button', { name: 'Command palette' }).click();
  // By container, not placeholder: the hint text is copy and copy moves.
  await page.locator('.palette input').fill('start');
  await page.getByRole('button', { name: /Start shift: Bar/ }).click();

  // The pill appears in the header and carries the live dot.
  await expect(page.locator('header .live-dot')).toBeVisible({ timeout: 10_000 });

  // Finish from the pill's dropdown.
  await page.locator('header .live-dot').locator('..').click();
  await page.getByRole('button', { name: 'Finish shift' }).click();

  // The clock-out moment, then the day actually holds the shift.
  await expect(page.getByText('Shift finished')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  const days = (await apiGet(user.token, `/days?from=${todayKey()}&to=${todayKey()}`)) as {
    days: { shifts: { worked: boolean; actual_start: string | null }[] }[];
  };

  const shifts = days.days[0]?.shifts ?? [];

  expect(shifts.length).toBe(1);
  expect(shifts[0].worked).toBe(true);
  expect(shifts[0].actual_start).not.toBeNull();
});
