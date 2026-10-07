import {expect, test} from '@playwright/test';
import {playOneTurnLogged} from '../playthrough.ts';
import {writeFileSync} from 'node:fs';
import {createInitialState, gameReducer} from '../../../src/engine/gameReducer.ts';
import {readV2Save, writeV2Save, SAVE_KEY_V2} from '../../../src/save/saveGame.ts';

for (const width of [390, 1366]) {
  test(`campaign logger resolves a forced raid instead of repeatedly saving at ${width}px`, async ({page}, info) => {
    const started = gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104, difficulty: 'normal'}});
    // Accepted calendar-boundary fixture; progression uses only native controls.
    const state = {...started, turn: 16, year: 4, season: 'winter' as const, tutorialsSeen: ['estate', 'chronicle']};
    const raw = writeV2Save(state);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({width, height: 844});
    await page.addInitScript(({raw, key}) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
    }, {raw, key: SAVE_KEY_V2});
    await page.goto('/');
    await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
    const resultLog = await playOneTurnLogged(page, outcome => info.outputPath(`autoplay-${outcome}.png`));
    writeFileSync(info.outputPath('turn-result.json'), JSON.stringify(resultLog, null, 2));
    await page.screenshot({path: info.outputPath('raid-turn.png'), animations: 'disabled'});
    expect(resultLog.continued, JSON.stringify(resultLog)).toBe(true);
    expect(resultLog.outcome).toBeNull();
    expect(resultLog.choices).toContain("Defend the Estate");
    expect(resultLog.choices.some(choice => /save/i.test(choice))).toBe(false);
    await expect(page.getByRole('button', {name: 'Defend the Estate', exact: true})).toHaveCount(0);
    await page.getByRole('button', {name: 'Save game', exact: true}).click();
    const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2);
    if (!saved) throw new Error('Helper progression did not produce a saved snapshot.');
    const result = readV2Save(saved);
    if (!result.ok) throw new Error(result.error);
    expect(result.state).toMatchObject({phase: 'management', turn: 17, year: 5, season: 'spring'});
    expect(result.state.raids.totalScottishRaids).toBe(1);
    expect(result.state.raids.activeRaid).toBeNull();
    expect(result.state.rngState).not.toBe(state.rngState);
    await page.reload();
    await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
    expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(saved);
    expect(errors).toEqual([]);
  });
}
