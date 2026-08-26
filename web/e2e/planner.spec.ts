import { expect, test } from '@playwright/test';

import { apiGet, apiPost, createShiftTemplate, registerUser, signIn, todayKey } from './helpers';

test('the manager plans a week, publishes it, and the member accepts at their own rate', async ({ page }) => {
  // Two people: the owner who plans, the member who answers.
  const owner = await registerUser();
  const member = await registerUser();

  const team = (await apiPost(owner.token, '/teams', { name: 'E2E Crew' })) as { id: number };
  const teams = (await apiGet(owner.token, '/teams')) as { id: number; invite_code: string }[];
  const code = teams.find((entry) => entry.id === team.id)?.invite_code ?? '';

  await apiPost(member.token, '/teams/join', { invite_code: code, display_name: 'Member' });

  const memberTemplate = await createShiftTemplate(member.token);
  const memberId = ((await apiGet(member.token, '/account')) as { id: number }).id;

  // The owner drafts one assignment for tomorrow and publishes on the board.
  await signIn(page, owner);
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'Planning' }).click();

  // Second row (the member), last column (Sunday): always today-or-later,
  // which is the window the member's inbox reads.
  const cell = page.locator('td.group').nth(13);
  await cell.hover();
  await cell.getByRole('button', { name: '+' }).click();

  await page.getByRole('textbox').first().fill('Bar');
  await page.getByRole('button', { name: 'Add to the draft' }).click();
  await expect(page.locator('td .pop').first()).toBeVisible();

  await page.getByRole('button', { name: /Publish the week/ }).click();
  await expect(page.getByText('Week published')).toBeVisible({ timeout: 10_000 });

  // The member sees the proposal on the rota page and accepts it.
  const mine = (await apiGet(member.token, `/teams/${team.id}/planner/mine`)) as { id: number }[];

  expect(mine.length).toBe(1);

  const accepted = (await apiPost(
    member.token,
    `/teams/${team.id}/planner/assignments/${mine[0].id}/accept`,
    { template_id: memberTemplate },
  )) as { status: string; date: string };

  expect(accepted.status).toBe('accepted');

  // The shift is genuinely on the member's calendar, priced by their template.
  const days = (await apiGet(member.token, `/days?from=${accepted.date}&to=${accepted.date}`)) as {
    days: { shifts: { earned: number }[] }[];
  };

  expect(days.days[0]?.shifts.length).toBe(1);
  expect(days.days[0].shifts[0].earned).toBeGreaterThan(0);

  // And the owner's board shows the green answer.
  await page.reload();
  await page.getByRole('button', { name: 'Planning' }).click();
  await expect(page.locator('.border-good\\/50').first()).toBeVisible({ timeout: 10_000 });

  void memberId;
});
