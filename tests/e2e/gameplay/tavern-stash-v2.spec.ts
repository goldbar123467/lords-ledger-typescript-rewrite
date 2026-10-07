import { test, expect, type Page } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { readV2Save, writeV2Save, type GameSnapshot } from '../../../src/save/saveGame.ts';

interface StashTimer { id: number; fired: boolean; cancelled: boolean }
interface StashTimerTrace { enabled: boolean; pending: Map<number, StashTimer>; marks: StashTimer[] }
declare global { interface Window { __llStashTimers?: StashTimerTrace } }
function snapshot(value: unknown): GameSnapshot {
  const result = readV2Save(writeV2Save(value));
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
async function enter(page: Page, width = 390, enlarged = false) {
  let value = gameReducer(createInitialState(1), { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  value = gameReducer(value, { type: 'SET_TAB', payload: { tab: 'map' } });
  const state = snapshot(gameReducer(value, { type: 'DISMISS_TUTORIAL', payload: { tab: 'map' } }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(raw => {
    if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
    const trace: StashTimerTrace = { enabled: false, pending: new Map(), marks: [] };
    window.__llStashTimers = trace;
    const nativeSet = window.setTimeout.bind(window), nativeClear = window.clearTimeout.bind(window);
    const tracedSet = (handler: TimerHandler, delay?: number, ...args: unknown[]): number => {
      if (!trace.enabled || typeof handler !== 'function' || delay !== 4000) return nativeSet(handler, delay, ...args);
      const mark: StashTimer = { id: 0, fired: false, cancelled: false };
      const id = nativeSet(() => { trace.pending.delete(id); mark.fired = true; handler.apply(window, args); }, delay);
      mark.id = id; trace.pending.set(id, mark); trace.marks.push(mark); return id;
    };
    const tracedClear = (id?: number) => {
      if (id !== undefined) {
        const mark = trace.pending.get(id);
        if (mark) { mark.cancelled = true; trace.pending.delete(id); }
      }
      nativeClear(id);
    };
    Object.defineProperty(window, 'setTimeout', { configurable: true, writable: true, value: tracedSet });
    Object.defineProperty(window, 'clearTimeout', { configurable: true, writable: true, value: tracedClear });
  }, writeV2Save(state));
  await page.goto('/');
  if (enlarged) await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
  await expect(page.getByRole('button', { name: /Rats in the Cellar/ })).toBeVisible();
  const visited = snapshot(gameReducer(state, { type: 'TAVERN_VISIT' }));
  return { state, visited, found: snapshot(gameReducer(visited, { type: 'TAVERN_WALL_STASH' })), errors };
}
async function save(page: Page, state: GameSnapshot) {
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));
}
for (const row of [
  { width: 1366, enlarged: false, key: 'Enter' }, { width: 390, enlarged: false, key: ' ' },
  { width: 1366, enlarged: true, key: ' ' }, { width: 390, enlarged: true, key: 'Enter' },
]) test(`Wall stash native keyboard ${row.width} root ${row.enlarged ? 32 : 16} ${row.key === ' ' ? 'Space' : row.key}`, async ({ page }, info) => {
  const loaded = await enter(page, row.width, row.enlarged);
  const crack = page.getByRole('button', { name: 'Inspect the wall crack', exact: true });
  await expect(crack).toBeVisible();
  let reached = false;
  for (let index = 0; index < 64; index++) {
    await page.keyboard.press('Tab');
    if (await crack.evaluate(node => node === document.activeElement)) { reached = true; break; }
  }
  expect(reached).toBe(true);
  await expect(crack).toHaveCSS('outline-style', 'solid');
  await expect.poll(() => crack.evaluate(node => {
    const r = node.getBoundingClientRect();
    return r.width >= 44 && r.height >= 44 && r.top >= 0 && r.bottom <= innerHeight && node.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  })).toBe(true);
  await page.screenshot({ path: info.outputPath('wall-focused.png'), animations: 'disabled' });
  await page.keyboard.press(row.key);
  const empty = page.getByRole('button', { name: 'Empty wall crack', exact: true });
  await expect(empty).toBeFocused();
  await expect(empty).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('status')).toContainText('+25d');
  expect(loaded.found.denarii - loaded.visited.denarii).toBe(25);
  await page.keyboard.press('Enter'); await page.keyboard.press(' ');
  await page.screenshot({ path: info.outputPath('wall-empty.png'), animations: 'disabled' });
  await save(page, loaded.found);
  await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await page.locator('button[title="Enter the Boar\'s Head Tavern"]').click();
  await expect(page.getByRole('button', { name: 'Empty wall crack', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspect the wall crack', exact: true })).toHaveCount(0);
  await save(page, snapshot(gameReducer(loaded.found, { type: 'TAVERN_VISIT' })));
  expect(loaded.errors).toEqual([]);
});
for (const navigation of ['Load saved game', 'Leave Tavern']) test(`Wall stash feedback timer is cancelled on ${navigation}`, async ({ page }, info) => {
  const loaded = await enter(page);
  await page.evaluate(() => { if (window.__llStashTimers) window.__llStashTimers.enabled = true; });
  await page.getByText('✦', { exact: true }).click();
  await expect(page.getByText('EMPTY', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__llStashTimers?.pending.size)).toBe(1);
  await page.screenshot({ path: info.outputPath('pending-feedback.png'), animations: 'disabled' });
  await page.getByRole('button', { name: navigation, exact: true }).click();
  await expect(page.getByText("The Boar’s Head Tavern", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__llStashTimers?.marks)).toEqual([{ id: expect.any(Number), fired: false, cancelled: true }]);
  expect(await page.evaluate(() => window.__llStashTimers?.pending.size)).toBe(0);
  await save(page, navigation === 'Load saved game' ? loaded.state : loaded.found);
  expect(loaded.errors).toEqual([]);
});
test('Wall stash feedback expires after its real four-second timeout without changing the saved reward', async ({ page }, info) => {
  const loaded = await enter(page);
  await page.evaluate(() => { if (window.__llStashTimers) window.__llStashTimers.enabled = true; });
  await page.getByText('✦', { exact: true }).click();
  const message = page.getByText(/You found a coin purse hidden in a crack/);
  await expect(message).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__llStashTimers?.pending.size)).toBe(1);
  await expect(message).toHaveCount(0, { timeout: 6000 });
  expect(await page.evaluate(() => window.__llStashTimers?.marks)).toEqual([{ id: expect.any(Number), fired: true, cancelled: false }]);
  await page.screenshot({ path: info.outputPath('expired-feedback.png'), animations: 'disabled' });
  await save(page, loaded.found); expect(loaded.errors).toEqual([]);
});
