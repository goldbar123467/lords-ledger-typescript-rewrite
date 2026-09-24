import { expect, test } from '@playwright/test';

test('forge storefront debits the displayed price and persists the purchased material', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Normal.*standard experience/i }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: 'Forge tab' }).click();
  await expect(tutorial).toBeVisible();
  await tutorial.click();
  await page.getByRole('button', { name: 'Storefront' }).click();
  await expect(page.getByText('Material Market')).toBeVisible();
  const before = await page.getByTestId('resource-denarii').textContent();
  const beforeAmount = Number.parseInt(before ?? '', 10);
  const steelRow = page.getByTestId('forge-resource-steel');
  const buy = steelRow.getByRole('button', { name: /^Buy 1 \(\d+d\)$/ });
  const label = await buy.textContent();
  const quoted = Number.parseInt(label?.match(/\((\d+)d\)/)?.[1] ?? '', 10);
  expect(quoted).toBeGreaterThan(0);
  await buy.click();
  await expect(page.getByTestId('resource-denarii')).toContainText(String(beforeAmount - quoted));
  await page.getByRole('button', { name: 'Save game' }).click();
  const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  expect(saved).not.toBeNull();
  const parsed = JSON.parse(saved ?? '{}');
  expect(parsed.state.inventory.steel).toBe(6);
});
