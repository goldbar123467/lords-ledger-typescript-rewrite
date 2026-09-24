import { expect, test } from '@playwright/test';

test('a seasonal decision is brought into view after a narrow-screen management tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /Normal.*standard experience/i }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: /^Forge tab/ }).click();
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: 'Simulate this season' }).click();
  await expect(page.getByRole('group', { name: 'Choose your response' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('h3').first()).toBeInViewport();
  await expect.poll(() => page.evaluate(() => {
    const bar = document.querySelector('.tab-nav');
    const active = bar?.querySelector('[aria-current="page"]');
    if (!bar || !active) return false;
    const viewport = bar.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    return active.getAttribute('aria-label')?.startsWith('Chronicle tab') &&
      tab.left >= viewport.left && tab.right <= viewport.right;
  })).toBe(true);
});
