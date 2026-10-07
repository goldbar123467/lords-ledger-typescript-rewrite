import {expect, test} from '@playwright/test';
import {createInitialState, gameReducer} from '../../../src/engine/gameReducer.ts';
import {SAVE_KEY_V2, writeV2Save} from '../../../src/save/saveGame.ts';
import {playQaTurn, saveQaSnapshot} from '../qaProgress.ts';
import {startGame, type TurnDiagnostic} from '../helpers.ts';

for (const width of [390, 1366]) {
  for (const ending of ['victory', 'game_over'] as const) {
    test(`QA progression accepts a native ${ending} transition at ${width}px`, async ({page}, info) => {
      page.setDefaultTimeout(1500);
      const started = gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104, difficulty: 'normal'}});
      // Accepted management fixtures exercise ending transitions, not acquired campaigns.
      const state = {...started, tutorialsSeen: ['estate', 'chronicle'],
        ...(ending === 'victory' ? {turn: 40, year: 10, season: 'winter' as const} : {
          turn: 4, year: 1, season: 'winter' as const, food: 0, starvationTurns: 2,
          inventory: {...started.inventory, grain: 0, livestock: 0, fish: 0, flour: 0},
        })};
      const raw = writeV2Save(state);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({width, height: 844});
      await page.addInitScript(({key, raw}) => localStorage.setItem(key, raw), {key: SAVE_KEY_V2, raw});
      await page.goto('/');
      await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
      const diagnostic: TurnDiagnostic = {};
      expect(await playQaTurn(page, diagnostic)).toBe(false);
      expect(diagnostic.reason).toBe(ending);
      if (ending === 'game_over') await expect(page.locator('[data-gameover-reason]')).toHaveAttribute('data-gameover-reason', 'famine');
      await expect(page.getByRole('button', {name: ending === 'victory' ? 'Reign Again' : 'Try Again', exact: true})).toBeVisible();
      await expect(page.getByRole('button', {name: 'Save game', exact: true})).toHaveCount(0);
      // Terminal screens cannot save; do not mistake the pre-turn stored bytes for terminal state.
      expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2)).toBe(raw);
      await page.screenshot({path: info.outputPath('native-ending.png'), animations: 'disabled'});
      expect(errors).toEqual([]);
    });
  }
}

test('QA progression rejects a visible management screen that never advances', async ({page}) => {
  await page.goto('/');
  await startGame(page, 'normal');
  const before = await saveQaSnapshot(page);
  // Deliberately suppress the real native action to reproduce the helper's false-positive path.
  await page.getByRole('button', {name: /Simulate/}).evaluate(button => {
    button.addEventListener('click', event => event.stopImmediatePropagation(), {capture: true});
  });
  await expect(playQaTurn(page, {})).rejects.toThrow();
  expect((await saveQaSnapshot(page)).state.turn).toBe(before.state.turn);
});
