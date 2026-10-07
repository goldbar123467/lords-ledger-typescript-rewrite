import {test, expect} from '@playwright/test';
import {createInitialState, gameReducer} from '../../../src/engine/gameReducer.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';

function fixture(long: boolean) {
  let state = gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104, difficulty: 'normal'}});
  state = gameReducer(state, {type: 'SET_TAB', payload: {tab: 'map'}});
  state = gameReducer(state, {type: 'DISMISS_TUTORIAL', payload: {tab: 'map'}});
  return {...state, watchtower: {...state.watchtower, scannedThisSeason: true, perfectScans: 3,
    totalScans: long ? 60 : 3, totalAnomaliesSpotted: long ? 120 : 15, totalAnomaliesMissed: long ? 30 : 0,
    signalLog: long ? Array.from({length: 60}, (_, index) => ({season: 'spring', year: 1,
      type: ['scan', 'warning', 'raid', 'legacy'][index % 4], text: `Patrol ${index}: The watch kept its signal burning through a long night on the northern road.`})) : []}};
}
async function open(page: import('@playwright/test').Page, long: boolean) {
  const state = fixture(long), raw = writeV2Save(state), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(saved => localStorage.setItem('lords-ledger-v2-save', saved), raw);
  await page.goto('/'); await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
  await page.getByTitle('Climb the Watchtower', {exact: true}).click();
  return {state, raw, errors};
}
for (const width of [390, 1366]) {
  for (const long of [false, true]) test(`Watchtower home reading ${width} long ${long}`, async ({page}, info) => {
    await page.setViewportSize({width, height: width === 390 ? 844 : 768}); await page.emulateMedia({reducedMotion: 'reduce'});
    const {raw, errors} = await open(page, long);
    const scan = page.getByRole('button', {name: /Horizon Scan/});
    await scan.scrollIntoViewIfNeeded(); await page.screenshot({path: info.outputPath('home.png'), animations: 'disabled'});
    const log = page.getByRole('heading', {name: /Signal Fire Log/}).locator('..');
    await log.scrollIntoViewIfNeeded(); await page.screenshot({path: info.outputPath('history.png'), animations: 'disabled'});
    await expect(scan).toBeDisabled();
    await expect(page.getByRole('button', {name: /Captain.*Briefing/})).toContainText('Captain’s Briefing');
    await expect(page.getByText('Hear your garrison commander’s report', {exact: true})).toBeVisible();
    expect(await scan.locator('p').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await scan.evaluate(node => {let opacity = 1; for (let p: Element | null = node; p; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity); return opacity;})).toBe(1);
    const region = page.getByRole('region', {name: 'Signal fire entries', exact: true});
    await page.getByRole('button', {name: /Captain.*Briefing/}).focus(); await page.keyboard.press('Tab');
    await expect(region).toBeFocused(); await expect(region).toHaveCSS('outline-width', '3px');
    await expect.poll(() => region.evaluate(node => {
      const bounds = node.getBoundingClientRect(), header = document.querySelector('.game-header[data-pinned="true"]');
      return bounds.top >= (header?.getBoundingClientRect().bottom ?? 0) && bounds.bottom <= innerHeight;
    })).toBe(true);
    if (long) {
      const oldest = region.getByRole('listitem').filter({hasText: /Patrol 0:/});
      await page.keyboard.press('End'); await expect(oldest).toBeVisible();
      await expect.poll(() => region.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(1);
      const bounds = await oldest.boundingBox();
      const header = page.locator('.game-header[data-pinned="true"]');
      const headerBounds = await header.count() ? await header.boundingBox() : null;
      if (!bounds) throw new Error('Missing history bounds.');
      expect(bounds.y).toBeGreaterThanOrEqual(headerBounds ? headerBounds.y + headerBounds.height : 0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
      await page.screenshot({path: info.outputPath('oldest-history.png')});
      await page.keyboard.press('Home'); await expect(region.getByRole('listitem').filter({hasText: /Patrol 59:/})).toBeVisible();
      await expect.poll(() => region.evaluate(node => node.scrollTop)).toBeLessThanOrEqual(1);
      expect(await region.locator('[data-kind]').evaluateAll(nodes => nodes.every(node => parseFloat(getComputedStyle(node).fontSize) >= 16))).toBe(true);
    } else await expect(region.getByText('No entries yet. Scan the horizon to begin your watch.', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Save game', exact: true}).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw); expect(errors).toEqual([]);
  });
  test(`Captain note and speech reading ${width}`, async ({page}, info) => {
    await page.setViewportSize({width, height: width === 390 ? 844 : 768}); await page.emulateMedia({reducedMotion: 'reduce'});
    const {state, errors} = await open(page, true);
    await page.getByRole('button', {name: /Captain.*Briefing/}).click();
    const panel = page.getByRole('heading', {name: 'Captain Roderic', exact: true}).locator('..');
    await page.screenshot({path: info.outputPath('captain.png'), fullPage: true, animations: 'disabled'});
    expect(await panel.locator('p').evaluateAll(nodes => nodes.every(node => parseFloat(getComputedStyle(node).fontSize) >= 16))).toBe(true);
    await page.getByRole('button', {name: 'I understand', exact: true}).click();
    const expected = gameReducer(state, {type: 'WATCHTOWER_RODERIC_SCRIBES_NOTE_SEEN'});
    await page.getByRole('button', {name: 'Hear More', exact: true}).click();
    await page.getByRole('button', {name: 'Dismiss', exact: true}).click();
    await page.getByRole('button', {name: 'Save game', exact: true}).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(expected)); expect(errors).toEqual([]);
  });
}
