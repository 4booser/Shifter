import { expect, test } from '@playwright/test';

import { apiPost, createShiftTemplate, registerUser, signIn, todayKey } from './helpers';

test('the monthly report renders the ledger for a worked day', async ({ page }) => {
  const user = await registerUser();
  const templateId = await createShiftTemplate(user.token);

  // A worked day straight through the API; the report only reads.
  await fetch(`${process.env['E2E_BASE'] ?? 'http://localhost:5208'}/shifter/v1/days/${todayKey()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({
      shifts: [{ shift_id: templateId, worked: true, needs_cover: false }],
      sales: [],
      tips: 120,
      tips_cash: null,
      deductions: null,
      note: null,
      colour: null,
    }),
  });

  await signIn(page, user);
  await page.goto('/report');

  await expect(page.getByRole('heading', { name: 'Monthly report' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Day by day')).toBeVisible({ timeout: 15_000 });
  // Eight paid hours at 100 an hour, somewhere on the page.
  await expect(page.getByText('800', { exact: false }).first()).toBeVisible();
});
