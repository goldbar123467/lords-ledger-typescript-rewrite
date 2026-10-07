import type {GameSnapshot} from '../../../src/save/saveGame.ts';
import { expect, test } from '@playwright/test';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { DECREE_OPTIONS, COUNCIL_TOPICS } from '../../../src/data/decrees.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';
for (const width of [390, 1366]) for (const start of [0, 3]) {
  test('Council keeps voted context including final topic at ' + width + ' starting ' + start, async ({ page }, info) => {
    let state: GameSnapshot = { ...createInitialState(104), phase: 'management' as const, turn: 4, season: 'winter' as const, activeTab: 'hall', tutorialsSeen: ['hall'] };
    for (const topic of COUNCIL_TOPICS.slice(0, start)) state = gameReducer(state, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: topic.id, optionId: topic.options[0].id } });
    const raw = writeV2Save(state), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, raw);
    await page.goto('/'); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    let expected: GameSnapshot = state;
    for (const topic of COUNCIL_TOPICS.slice(start)) {
      const option = topic.options[0];
      await page.getByRole('button', { name: 'Council', exact: true }).click();
      await expect(page.getByText(topic.title, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: new RegExp(option.label) }).click();
      await expect(page.getByText(option.aftermath, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Show Historical Context', exact: true }).click();
      await expect(page.getByText(topic.historicalNote, { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(topic.id + '-aftermath.png'), fullPage: true, animations: 'disabled' });
      expected = gameReducer(expected, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: topic.id, optionId: option.id } });
      await page.getByRole('button', { name: 'Return to Throne', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save')); if (!saved) throw new Error('Missing save');
    const loaded = readV2Save(saved); if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.state.greatHall).toEqual(expected.greatHall); expect(loaded.state.rngState).toBe(state.rngState);
    await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(saved); expect(errors).toEqual([]);
  });
}
for (const width of [390, 1366]) {
  test('decree issue revoke and seasonal cap survive Save/Load at ' + width, async ({ page }, info) => {
    const state = { ...createInitialState(104), phase: 'management' as const, activeTab: 'hall', tutorialsSeen: ['hall'] }, raw = writeV2Save(state), first = DECREE_OPTIONS[0], second = DECREE_OPTIONS[1];
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, raw);
    await page.goto('/'); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.getByRole('button', { name: 'Decrees', exact: true }).click();
    for (const decree of [first, second]) {
      await page.getByRole('button', { name: new RegExp(decree.name) }).click();
      await page.getByRole('button', { name: 'Seal This Decree', exact: true }).click();
      await expect(page.getByText(decree.flavor, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /Continue/ }).click();
      if (decree.id === first.id) {
        await page.getByText(first.name, { exact: true }).locator('..').getByRole('button', { name: 'Revoke', exact: true }).click();
        await page.getByRole('button', { name: 'Tear It Down', exact: true }).click();
      }
    }
    await expect(page.getByRole('button', { name: new RegExp(first.name) })).toBeEnabled();
    await page.getByRole('button', { name: new RegExp(first.name) }).click();
    await expect(page.getByRole('button', { name: 'Seal This Decree', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Back to Decrees', exact: true }).click();
    await page.screenshot({ path: info.outputPath('decree-limit.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Save game', exact: true }).click();
    const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save')); if (!saved) throw new Error('Missing save');
    const loaded = readV2Save(saved); if (!loaded.ok) throw new Error(loaded.error);
    let expected = gameReducer(state, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: first.id } });
    expected = gameReducer(expected, { type: 'HALL_REVOKE_DECREE', payload: { decreeId: first.id } });
    expected = gameReducer(expected, { type: 'HALL_ISSUE_DECREE', payload: { decreeId: second.id } });
    expect(loaded.state.greatHall).toEqual(expected.greatHall); expect(loaded.state.rngState).toBe(state.rngState);
    await page.reload(); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
    await page.getByRole('button', { name: 'Decrees', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(first.name) })).toBeEnabled();
    await page.getByRole('button', { name: new RegExp(first.name) }).click();
    await expect(page.getByRole('button', { name: 'Seal This Decree', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Back to Decrees', exact: true }).click();
  });
}

for (const width of [390, 1366]) test('early Council relock preserves completed vote aftermath at ' + width, async ({ page }, info) => {
  const base = createInitialState(104), initial = { ...base, phase: 'management' as const, activeTab: 'hall', tutorialsSeen: ['hall'], greatHall: { ...base.greatHall, meters: { ...base.greatHall.meters, people: 71 } } };
  const prior = COUNCIL_TOPICS[0], road = COUNCIL_TOPICS[1], topic = COUNCIL_TOPICS[2], option = topic.options[2];
  let state = gameReducer(initial, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: prior.id, optionId: prior.options[0].id } });
  state = gameReducer(state, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: road.id, optionId: road.options[2].id } });
  const raw = writeV2Save(state);
  await page.setViewportSize({ width, height: 844 }); await page.addInitScript(raw => localStorage.setItem('lords-ledger-v2-save', raw), raw);
  await page.goto('/'); await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await page.getByRole('button', { name: 'Council', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(option.label) }).click();
  await expect(page.getByText(option.aftermath, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show Historical Context', exact: true }).click();
  await expect(page.getByText(topic.historicalNote, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('early-council-aftermath.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  const saved = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save')); if (!saved) throw new Error('Missing save');
  const loaded = readV2Save(saved); if (!loaded.ok) throw new Error(loaded.error);
  const expected = gameReducer(state, { type: 'HALL_COUNCIL_VOTE', payload: { topicId: topic.id, optionId: option.id } });
  expect(loaded.state.greatHall).toEqual(expected.greatHall); expect(loaded.state.rngState).toBe(state.rngState);
  expect(expected.greatHall.meters.people).toBeLessThanOrEqual(70);
  await page.getByRole('button', { name: 'Return to Throne', exact: true }).click();
  await page.getByRole('button', { name: 'Council', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(COUNCIL_TOPICS[3].options[0].label) })).toHaveCount(0);
});
