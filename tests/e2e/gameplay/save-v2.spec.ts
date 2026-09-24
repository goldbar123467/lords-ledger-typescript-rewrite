import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import seasonalEvents from '../../../src/data/seasonalEvents.js';

const legacyKey = 'lords-ledger-save';
const currentKey = 'lords-ledger-v2-save';
const fixture = await readFile(new URL('../../fixtures/legacy-normal-turn1.json', import.meta.url), 'utf8');

test('malformed 2.0 save remains recoverable and untouched', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: currentKey, raw: '{}' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(page.getByRole('heading', { name: "The Lord's Ledger" })).toBeVisible();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('not a Lord’s Ledger 2.0 save');
  const bounds = await alert.boundingBox();
  assertInViewport(bounds, 768);
  expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBe('{}');
});

function assertInViewport(bounds: { y: number; height: number } | null, height: number) {
  expect(bounds).not.toBeNull();
  if (bounds) expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
}

test('save rejection remains visible on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: currentKey, raw: '{}' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('not a Lord’s Ledger 2.0 save');
  assertInViewport(await alert.boundingBox(), 844);
});

test('malformed legacy save is rejected without writing a 2.0 save', async ({ page }) => {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: legacyKey, raw: '{}' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Import old save' }).click();
  await expect(page.getByRole('heading', { name: "The Lord's Ledger" })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('phase');
  const stored = await page.evaluate(({ oldKey, newKey }) => ({
    oldSave: localStorage.getItem(oldKey), newSave: localStorage.getItem(newKey),
  }), { oldKey: legacyKey, newKey: currentKey });
  expect(stored).toEqual({ oldSave: '{}', newSave: null });
});

for (const scenario of [
  { label: 'v2', key: currentKey, action: 'Load saved game', entry: { instanceId: 'dragon_keep-1', type: 'dragon_keep', condition: 100, builtOnTurn: 1 } },
  { label: 'legacy', key: legacyKey, action: 'Import old save', entry: 'dragon_keep' },
] as const) {
  test(`an unknown ${scenario.label} building cannot silently occupy an inaccessible plot`, async ({ page }) => {
    const state = JSON.parse(fixture);
    state.buildings.push(scenario.entry);
    const raw = scenario.label === 'v2'
      ? JSON.stringify({ format: 'lords-ledger', version: 2, state })
      : JSON.stringify(state);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: scenario.key, value: raw });
    await page.goto('/');
    await page.getByRole('button', { name: scenario.action }).click();
    await expect(page.getByRole('heading', { name: "The Lord's Ledger" })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(/building.*(type|ID).*not recognized/i);
    expect(await page.evaluate(key => localStorage.getItem(key), scenario.key)).toBe(raw);
    if (scenario.label === 'legacy') {
      expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBeNull();
    }
  });
}

type MutableEconomySave = { inventory: { salt?: number }; taxRate: string };
for (const scenario of [
  { label: 'negative purchased-salt quantity', mutate: (state: MutableEconomySave) => { state.inventory.salt = -1; }, error: 'inventory.salt' },
  { label: 'unrecognized tax rate', mutate: (state: MutableEconomySave) => { state.taxRate = 'royal'; }, error: 'tax rate' },
] as const) {
  test(`a save with ${scenario.label} is rejected before the first season`, async ({ page }) => {
    const state = JSON.parse(fixture);
    scenario.mutate(state);
    const raw = JSON.stringify(state);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: legacyKey, value: raw });
    await page.goto('/');
    await page.getByRole('button', { name: 'Import old save' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(scenario.error);
    assertInViewport(await alert.boundingBox(), 844);
    expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBe(raw);
    expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBeNull();
  });
}

test('an unknown saved inventory key cannot change hidden storage capacity', async ({ page }) => {
  const state = JSON.parse(fixture);
  state.inventory.dragon_eggs = -100;
  const raw = JSON.stringify({ format: 'lords-ledger', version: 2, state });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: currentKey, value: raw });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load saved game' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('inventory.dragon_eggs is not recognized');
  assertInViewport(await alert.boundingBox(), 844);
  expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBe(raw);
  await page.getByRole('button', { name: /Easy/ }).click();
  await expect(page.getByRole('button', { name: 'Simulate this season' })).toBeVisible();
});

test('a fabricated pending event cannot strand the player after import', async ({ page }) => {
  const invalid = JSON.stringify({
    ...JSON.parse(fixture),
    phase: 'seasonal_action',
    currentEvent: { id: 'not-a-real-event', options: [] },
  });
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: legacyKey, raw: invalid });
  await page.goto('/');
  await page.getByRole('button', { name: 'Import old save' }).click();
  await expect(page.getByRole('heading', { name: "The Lord's Ledger" })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('event ID is not recognized');
  expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBe(invalid);
  expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBeNull();
});

test('damaged effects on a known pending event are rejected before a choice', async ({ page }) => {
  const source = JSON.parse(fixture);
  const authored = seasonalEvents.spring.find(event => event.id === 'spring_1');
  if (!authored) throw new Error('Missing spring_1 fixture definition');
  const damaged = { ...authored, options: authored.options.map((option, index) =>
    index === 0 ? { ...option, effects: { denarii: 'damaged' } } : option) };
  const raw = JSON.stringify({ ...source, phase: 'seasonal_action', currentEvent: damaged });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: legacyKey, value: raw });
  await page.goto('/');
  await page.getByRole('button', { name: 'Import old save' }).click();
  await expect(page.getByRole('heading', { name: "The Lord's Ledger" })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/event.*effect/i);
  expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBe(raw);
  expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBeNull();
});

test('an altered numeric effect on a known event cannot change the authored cost', async ({ page }) => {
  const source = JSON.parse(fixture);
  const authored = seasonalEvents.spring.find(event => event.id === 'spring_1');
  if (!authored) throw new Error('Missing spring_1 fixture definition');
  const altered = { ...authored, options: authored.options.map((option, index) =>
    index === 0 ? { ...option, effects: { ...option.effects, treasury: 999999 } } : option) };
  const raw = JSON.stringify({ ...source, phase: 'seasonal_action', currentEvent: altered });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: legacyKey, value: raw });
  await page.goto('/');
  await page.getByRole('button', { name: 'Import old save' }).click();
  await expect(page.getByRole('heading', { name: "The Lord's Ledger" })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/event.*effect/i);
  expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBe(raw);
  expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBeNull();
});

for (const phase of ['flip_decision', 'raid_warning'] as const) {
  test(`missing interaction data in ${phase} cannot strand the player`, async ({ page }) => {
    const raw = JSON.stringify({ ...JSON.parse(fixture), phase });
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: legacyKey, value: raw });
    await page.goto('/');
    await page.getByRole('button', { name: 'Import old save' }).click();
    await expect(page.getByRole('heading', { name: "The Lord's Ledger" })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(phase === 'flip_decision' ? 'pending perspective shift' : 'pending raid');
    expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBe(raw);
    expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBeNull();
  });
}

test('explicit legacy import preserves old bytes and reloads from 2.0 namespace', async ({ page }) => {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: legacyKey, raw: fixture });
  await page.goto('/');
  await page.getByRole('button', { name: 'Import old save' }).click();
  await expect(page.getByTestId('resource-denarii')).toContainText('500');
  const stored = await page.evaluate(({ oldKey, newKey }) => ({
    oldSave: localStorage.getItem(oldKey), newSave: localStorage.getItem(newKey),
  }), { oldKey: legacyKey, newKey: currentKey });
  expect(stored.oldSave).toBe(fixture);
  expect(stored.newSave).not.toBeNull();
  const envelope: unknown = JSON.parse(stored.newSave ?? 'null');
  expect(envelope).toMatchObject({ format: 'lords-ledger', version: 2, state: { turn: 1, denarii: 500 } });
  await page.reload();
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(page.getByTestId('resource-denarii')).toContainText('500');
});

test('importing an old save does not overwrite an existing 2.0 slot', async ({ page }) => {
  const existingState = { ...JSON.parse(fixture), denarii: 321 };
  const currentRaw = JSON.stringify({ format: 'lords-ledger', version: 2, state: existingState });
  await page.addInitScript(({ oldKey, oldRaw, newKey, newRaw }) => {
    localStorage.setItem(oldKey, oldRaw);
    localStorage.setItem(newKey, newRaw);
  }, { oldKey: legacyKey, oldRaw: fixture, newKey: currentKey, newRaw: currentRaw });
  await page.goto('/');
  await page.getByRole('button', { name: 'Import old save' }).click();
  await expect(page.getByTestId('resource-denarii')).toContainText('500');
  await expect(page.getByRole('alert')).toContainText('Your 2.0 save is unchanged');
  expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBe(currentRaw);
  expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBe(fixture);
});

test('a mid-season 2.0 save retains its pending choice after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Easy.*gentler penalties/i }).click();
  const tutorial = page.getByRole('button', { name: 'I Understand' });
  if (await tutorial.isVisible()) await tutorial.click();
  await page.getByRole('button', { name: 'Simulate this season' }).click();
  const options = page.getByRole('group', { name: 'Choose your response' });
  await expect(options).toBeVisible();
  await expect(options.getByRole('button').first()).toHaveAttribute('aria-label', /Expected effects: (Denarii|Food|Families|Garrison) (increase|decrease)/);
  const eventTitle = await page.locator('h3').first().textContent();
  await page.getByRole('button', { name: 'Save game' }).click();
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
  const saved = await page.evaluate(key => localStorage.getItem(key), currentKey);
  expect(saved).not.toBeNull();
  expect(JSON.parse(saved ?? 'null')).toMatchObject({ version: 2, state: { phase: 'seasonal_action', turn: 1 } });
  await page.reload();
  await page.getByRole('button', { name: 'Load saved game' }).click();
  await expect(options).toBeVisible();
  await expect(page.locator('h3').first()).toHaveText(eventTitle ?? '');
  await options.getByRole('button').first().click();
  await expect(page.getByRole('button', { name: 'See What Happens Next' })).toBeVisible();
});
