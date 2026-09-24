import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const fixture = JSON.parse(await readFile(new URL('../../fixtures/legacy-normal-turn1.json', import.meta.url), 'utf8'));
const saveKey = 'lords-ledger-v2-save';

test('a loaded raid warning resolves through the real reducer and resumes the season', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const state = {
    ...fixture,
    phase: 'raid_warning',
    raids: { ...fixture.raids, activeRaid: { type: 'criminal', phase: 'warning' } },
  };
  const raw = JSON.stringify({ format: 'lords-ledger', version: 2, state });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: saveKey, value: raw });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(page.getByRole('button', { name: 'Defend the Estate' })).toBeVisible();
  await page.getByRole('button', { name: 'Defend the Estate' }).click();
  const raidResult = page.locator('div.fixed.inset-0.z-50').filter({
    has: page.getByRole('heading', { name: /RAID (REPELLED|SUCCESSFUL)/ }),
  });
  await expect(raidResult.getByRole('heading', { name: /RAID (REPELLED|SUCCESSFUL)/ })).toBeVisible();
  await raidResult.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'See What Happens Next' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Defend the Estate' })).toHaveCount(0);
  await expect(page.getByText(/raided the estate|attacked the estate/i).last()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('a zero-garrison partial defense describes the fortifications consistently', async ({ page }) => {
  const state = {
    ...fixture,
    phase: 'raid_warning',
    garrison: 0,
    military: { ...fixture.military, garrison: { levy: 0, menAtArms: 0, knights: 0 } },
    raids: { ...fixture.raids, activeRaid: { type: 'criminal', phase: 'warning' } },
  };
  const raw = JSON.stringify({ format: 'lords-ledger', version: 2, state });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: saveKey, value: raw });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await page.getByRole('button', { name: 'Defend the Estate' }).click();
  const raidResult = page.locator('div.fixed.inset-0.z-50').filter({
    has: page.getByRole('heading', { name: 'RAID SUCCESSFUL' }),
  });
  await expect(raidResult.getByText('Your fortifications slowed the raiders. Losses were reduced but not prevented.')).toBeVisible();
  await expect(raidResult.getByText(/outlaws breached the outer defenses/i)).toBeVisible();
  await expect(raidResult.getByText(/unopposed/i)).toHaveCount(0);
  await raidResult.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'See What Happens Next' })).toBeVisible();
});

test('Aldric drill is visible in a third-season raid and changes its outcome', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = {
    ...fixture,
    phase: 'raid_warning',
    tavern: { ...fixture.tavern, aldricDrillActive: 0 },
    raids: { ...fixture.raids, activeRaid: {
      type: 'criminal', phase: 'warning', result: null, drillBonus: 5, defenseRating: 20,
    } },
  };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: saveKey, value: JSON.stringify({ format: 'lords-ledger', version: 2, state }),
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const overlay = page.locator('div.fixed.inset-0.z-50').filter({
    has: page.getByRole('button', { name: 'Defend the Estate' }),
  });
  await expect(overlay.getByText('20', { exact: true })).toBeVisible();
  await expect(overlay.getByText("Aldric's drill: +5 defense")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('aldric-drill-warning-390.png') });
  await page.getByRole('button', { name: 'Defend the Estate' }).click();
  await expect(page.getByRole('heading', { name: 'RAID REPELLED' })).toBeVisible();
});
