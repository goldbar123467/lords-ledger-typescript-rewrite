import { test, expect, type Page } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { readV2Save, writeV2Save, type GameSnapshot } from '../../../src/save/saveGame.ts';
import seasonalEvents from '../../../src/data/seasonalEvents.ts';
import randomEvents from '../../../src/data/randomEvents.ts';

interface LifecycleMark { id: number; fired: boolean; cancelled: boolean }
interface LifecycleTrace { framesEnabled: boolean; timers: LifecycleMark[]; frames: LifecycleMark[] }
declare global { interface Window { __llAppLifecycle?: LifecycleTrace } }
function snapshot(value: unknown): GameSnapshot {
  const result = readV2Save(writeV2Save(value));
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const started = gameReducer(createInitialState(104), { type: 'START_GAME', payload: { difficulty: 'easy', seed: 104 } });
const base = snapshot(gameReducer(started, { type: 'DISMISS_TUTORIAL', payload: { tab: 'estate' } }));
async function boot(page: Page, title = false) {
  const state = snapshot(title ? { ...base, phase: 'title' as const } : base);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(({ raw, legacy }) => {
    localStorage.setItem('lords-ledger-v2-save', raw); localStorage.setItem('lords-ledger-save', legacy);
    const trace: LifecycleTrace = { framesEnabled: false, timers: [], frames: [] };
    window.__llAppLifecycle = trace;
    const nativeSet = window.setTimeout.bind(window), nativeClear = window.clearTimeout.bind(window);
    const tracedSet = (handler: TimerHandler, delay?: number, ...args: unknown[]): number => {
      if (typeof handler !== 'function' || delay !== 2000) return nativeSet(handler, delay, ...args);
      const mark: LifecycleMark = { id: 0, fired: false, cancelled: false };
      const id = nativeSet(() => { mark.fired = true; handler.apply(window, args); }, delay);
      mark.id = id; trace.timers.push(mark); return id;
    };
    const tracedClear = (id?: number) => { const mark = trace.timers.find(entry => entry.id === id); if (mark && !mark.fired) mark.cancelled = true; nativeClear(id); };
    Object.defineProperty(window, 'setTimeout', { value: tracedSet, configurable: true, writable: true });
    Object.defineProperty(window, 'clearTimeout', { value: tracedClear, configurable: true, writable: true });
    const nativeFrame = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      if (!trace.framesEnabled) return nativeFrame(callback);
      const mark: LifecycleMark = { id: 0, fired: false, cancelled: false };
      const id = nativeFrame(time => { mark.fired = true; callback(time); });
      mark.id = id; trace.frames.push(mark); return id;
    };
    window.cancelAnimationFrame = id => { const mark = trace.frames.find(entry => entry.id === id); if (mark && !mark.fired) mark.cancelled = true; nativeCancel(id); };
  }, { raw: writeV2Save(state), legacy: JSON.stringify(base) });
  await page.goto('/'); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  if (title) await expect(page.getByRole('alert')).toContainText('Game loaded.');
  else await expect(page.getByText('Loaded!', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__llAppLifecycle?.timers.length)).toBe(1);
  return { state, raw: writeV2Save(state), legacy: JSON.stringify(base), errors };
}
async function timerTerminal(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__llAppLifecycle?.timers.every(mark => mark.fired || mark.cancelled)), { timeout: 4000 }).toBe(true);
}
async function save(page: Page, state: GameSnapshot) {
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(state));
}
test('older loaded success cannot erase a newer malformed-load error', async ({ page }, info) => {
  const loaded = await boot(page);
  await page.evaluate(() => localStorage.setItem('lords-ledger-v2-save', '{}'));
  await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await timerTerminal(page); await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => window.__llAppLifecycle?.timers)).toEqual([{ id: expect.any(Number), fired: false, cancelled: true }]);
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe('{}');
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-save'))).toBe(loaded.legacy);
  await page.screenshot({ path: info.outputPath('error-kept.png'), animations: 'disabled' });
  await save(page, loaded.state); expect(loaded.errors).toEqual([]);
});
test('a newer Save owns its full success lifetime and cancels the previous Load timer', async ({ page }) => {
  const loaded = await boot(page); await save(page, loaded.state);
  expect(await page.evaluate(() => window.__llAppLifecycle?.timers)).toEqual([
    { id: expect.any(Number), fired: false, cancelled: true }, { id: expect.any(Number), fired: false, cancelled: false },
  ]);
  await timerTerminal(page); await expect(page.getByText('Saved!', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__llAppLifecycle?.timers.map(mark => ({ fired: mark.fired, cancelled: mark.cancelled })))).toEqual([{ fired: false, cancelled: true }, { fired: true, cancelled: false }]);
  expect(loaded.errors).toEqual([]);
});
test('older title Load timer cannot erase the persistent legacy import notice or slots', async ({ page }, info) => {
  const loaded = await boot(page, true);
  await page.getByRole('button', { name: 'Import old save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your 2.0 save is unchanged');
  await timerTerminal(page); await expect(page.getByRole('alert')).toContainText('Your 2.0 save is unchanged');
  expect(await page.evaluate(() => window.__llAppLifecycle?.timers)).toEqual([{ id: expect.any(Number), fired: false, cancelled: true }]);
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(loaded.raw);
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-save'))).toBe(loaded.legacy);
  await page.screenshot({ path: info.outputPath('import-kept.png'), animations: 'disabled' });
  await save(page, base); expect(loaded.errors).toEqual([]);
});
test('older Load timer cannot erase an explicit manuscript recovery notice', async ({ page }, info) => {
  const loaded = await boot(page);
  const damaged = { ...base, activeTab: 'chapel', tutorialsSeen: ['chapel'], chapel: { ...base.chapel, view: 'manuscript', msPhase: 'input', msPattern: [0, 1, 2], msPlayerInput: [null], inventory: ['quill_ink'] } };
  const raw = JSON.stringify({ format: 'lords-ledger', version: 2, state: damaged });
  const recovered = readV2Save(raw, { restartManuscript: true }); if (!recovered.ok) throw new Error(recovered.error);
  await page.evaluate(raw => localStorage.setItem('lords-ledger-v2-save', raw), raw);
  await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await page.getByRole('button', { name: 'Restart manuscript and load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Stored saves are unchanged');
  await timerTerminal(page); await expect(page.getByRole('alert')).toContainText('Stored saves are unchanged');
  expect(await page.evaluate(() => window.__llAppLifecycle?.timers)).toEqual([{ id: expect.any(Number), fired: false, cancelled: true }]);
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-save'))).toBe(loaded.legacy);
  await page.screenshot({ path: info.outputPath('recovery-kept.png'), animations: 'disabled' });
  await save(page, recovered.state); expect(loaded.errors).toEqual([]);
});
test('ordinary loaded feedback expires on its real two-second timer without changing either slot', async ({ page }) => {
  const loaded = await boot(page); await timerTerminal(page);
  await expect(page.getByText('Loaded!', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__llAppLifecycle?.timers)).toEqual([{ id: expect.any(Number), fired: true, cancelled: false }]);
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(loaded.raw);
  expect(await page.evaluate(() => localStorage.getItem('lords-ledger-save'))).toBe(loaded.legacy); expect(loaded.errors).toEqual([]);
});
test('successful Load cancels an already queued same-task season action', async ({ page }, info) => {
  const loaded = await boot(page);
  await expect(page.getByRole('button', { name: 'Simulate this season', exact: true })).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => window.requestAnimationFrame(() => resolve())));
  // Deliberately activate both real DOM controls in one JS task to cover the queue race.
  // This is a controlled lifecycle scenario, not a native-play campaign.
  await page.evaluate(() => {
    const trace = window.__llAppLifecycle; if (!trace) throw new Error('Missing lifecycle observer'); trace.framesEnabled = true;
    const season = document.querySelector<HTMLButtonElement>('button[aria-label="Simulate this season"]');
    const load = document.querySelector<HTMLButtonElement>('button[aria-label="Load saved game"]');
    if (!season || !load) throw new Error('Missing actual season/load buttons');
    season.click(); if (trace.frames.length !== 1) throw new Error('Season did not allocate exactly one real frame'); load.click();
  });
  await expect.poll(() => page.evaluate(() => window.__llAppLifecycle?.frames)).toEqual([{ id: expect.any(Number), fired: false, cancelled: true }]);
  await expect(page.getByRole('button', { name: 'Simulate this season', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('season-cancelled.png'), animations: 'disabled' });
  await save(page, loaded.state); expect(loaded.errors).toEqual([]);
});
test('ordinary native season action fires once and preserves the canonical seeded transition', async ({ page }) => {
  const loaded = await boot(page);
  const expected = snapshot(gameReducer(loaded.state, { type: 'SIMULATE_SEASON', payload: { seasonalEvents: Object.values(seasonalEvents).flat(), randomEvents } }));
  expect(expected.phase).toBe('seasonal_action');
  await page.getByRole('button', { name: 'Simulate this season', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Simulate this season', exact: true })).toHaveCount(0);
  await save(page, expected); expect(loaded.errors).toEqual([]);
});
