import {test, expect} from '@playwright/test';
import BUILDINGS from '../../../src/data/buildings.ts';
import {mapViewFixture} from '../../fixtures/mapView.ts';
import {writeV2Save} from '../../../src/save/saveGame.ts';
import {gameReducer} from '../../../src/engine/gameReducer.ts';

for (const width of [390, 1366]) for (const doubled of [false, true]) {
  test(`Map readable dense labels ${width} repeated ${doubled}`, async ({page}, info) => {
    const base = mapViewFixture('dense');
    const state = doubled ? {...base, buildings: [...base.buildings, ...base.buildings.map((building, index) =>
      typeof building === 'string' ? building : {...building, instanceId: 'reading-second-' + index})]} : base;
    const raw = writeV2Save(state), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({width, height: width === 390 ? 844 : 768});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.addInitScript(saved => localStorage.setItem('lords-ledger-v2-save', saved), raw);
    await page.goto('/');
    await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
    const canvas = page.locator('[style*="aspect-ratio"]');
    await canvas.scrollIntoViewIfNeeded();
    await page.screenshot({path: info.outputPath('map-viewport.png'), animations: 'disabled'});
    await canvas.screenshot({path: info.outputPath('map-detail.png'), animations: 'disabled'});
    const names: string[] = Object.values(BUILDINGS).map(building => building.name);
    const metrics = await canvas.evaluate((element, names) => {
      const bounds = element.getBoundingClientRect();
      const labels = [...element.querySelectorAll('span')].filter(node => names.includes(node.textContent?.trim() ?? ''));
      const rows = labels.map(node => {
        const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
        return {text: node.textContent, font: parseFloat(style.fontSize), left: rect.left, right: rect.right,
          top: rect.top, bottom: rect.bottom, contained: rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom};
      });
      const overlaps = rows.flatMap((a, index) => rows.slice(index + 1).filter(b =>
        Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top))
        .map(b => [a.text, b.text]));
      return {rows, overlaps};
    }, names);
    await test.info().attach('label-metrics', {body: JSON.stringify(metrics), contentType: 'application/json'});
    expect(metrics.rows.length).toBeGreaterThanOrEqual(17);
    for (const row of metrics.rows) {expect(row.font).toBeGreaterThanOrEqual(13); expect(row.contained).toBe(true);}
    expect(metrics.overlaps).toEqual([]);
    const readable = await canvas.evaluate((element, names) => {
      return [...element.querySelectorAll('span')].filter(node => names.includes(node.textContent?.trim() ?? '')).map(node => {
        node.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
        const box = node.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(node);
        const glyph = range.getBoundingClientRect(), hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
        return {text: node.textContent, hit: node.contains(hit), whole: glyph.left >= box.left && glyph.right <= box.right && glyph.top >= box.top && glyph.bottom <= box.bottom};
      });
    }, names);
    for (const label of readable) {expect(label.hit, label.text ?? '').toBe(true); expect(label.whole, label.text ?? '').toBe(true);}
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(canvas.locator('animate')).toHaveCount(0);
    expect(await canvas.locator('*').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationName === 'none'))).toBe(true);
    const legend = page.getByText('Common', {exact: true});
    await expect(legend).toHaveCSS('font-size', '16px');
    await page.getByRole('button', {name: 'Save game', exact: true}).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1366]) test(`Map keyboard panning and all destinations ${width}`, async ({page}, info) => {
  let state = mapViewFixture('dense'); const input = writeV2Save(state), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width, height: width === 390 ? 844 : 768});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), input);
  await page.goto('/'); await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
  const region = page.getByRole('region', {name: 'Estate map', exact: true});
  await page.getByRole('button', {name: 'Map tab (active)', exact: true}).focus();
  for (let i = 0; i < 12 && !await region.evaluate(element => element === document.activeElement); i++) await page.keyboard.press('Tab');
  await expect(region).toBeFocused(); await expect(region).toHaveCSS('outline-width', '3px');
  if (width === 390) {
    expect(await region.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await region.evaluate(element => {element.scrollLeft = 0;}); await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await page.screenshot({path: info.outputPath('keyboard-pan.png')});
  }
  await page.keyboard.press('Tab');
  const tavern = page.getByTitle("Enter the Boar's Head Tavern", {exact: true});
  await expect(tavern).toBeFocused(); await expect(tavern).toHaveCSS('outline-width', '3px');
  await page.keyboard.press('Enter'); await expect(page.getByRole('heading', {name: /The Boar.s Head Tavern/})).toBeVisible();
  state = gameReducer(state, {type: 'TAVERN_VISIT'});
  await page.getByRole('button', {name: 'Leave Tavern', exact: true}).click();
  await region.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expect(page.getByTitle('Climb the Watchtower', {exact: true})).toBeFocused();
  await page.keyboard.press('Enter'); await page.getByRole('button', {name: 'Descend from Tower', exact: true}).click();
  await region.focus(); for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await expect(page.getByTitle('Enter the Market Square', {exact: true})).toBeFocused();
  await page.keyboard.press('Enter'); state = gameReducer(state, {type: 'SET_TAB', payload: {tab: 'market'}});
  await expect(page.getByRole('button', {name: 'Market tab (active)', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Save game', exact: true}).click();
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));
  expect(errors).toEqual([]);
});
