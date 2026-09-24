import { expect, test } from '@playwright/test';

test('building and upgrade use the quoted costs and persist across save/reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Normal.*standard experience/i }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();

  await expect(page.getByTestId('resource-denarii')).toContainText('500');
  await page.getByTestId('build-card-strip_farm').getByRole('button', { name: 'Build (80d)' }).click();
  await expect(page.getByTestId('resource-denarii')).toContainText('420');
  const built = page.getByTestId(/built-building-strip_farm-1-seq-/);
  await expect(built).toHaveCount(1);
  await built.getByRole('button', { name: /Demesne Field/ }).click();
  await expect(page.getByTestId('resource-denarii')).toContainText('300');
  await expect(page.getByTestId(/built-building-demesne_field-1-seq-/)).toHaveCount(1);

  await page.getByRole('button', { name: 'Save game' }).click();
  const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
  expect(saved).not.toBeNull();
  const parsed = JSON.parse(saved ?? '{}');
  const upgraded = parsed.state.buildings.find((building: { type: string }) => building.type === 'demesne_field');
  expect(upgraded).toMatchObject({ type: 'demesne_field', condition: 100 });
  expect(upgraded.instanceId).toMatch(/^demesne_field-1-seq-\d+$/);

  await page.reload();
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(page.getByTestId('resource-denarii')).toContainText('300');
  await expect(page.getByTestId(`built-building-${upgraded.instanceId}`)).toHaveCount(1);
});
