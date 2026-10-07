import {expect, type Page} from '@playwright/test';
import {playOneTurn, type TurnDiagnostic} from './helpers.ts';
import {readV2Save, SAVE_KEY_V2} from '../../src/save/saveGame.ts';

export async function saveQaSnapshot(page: Page) {
  await page.getByRole('button', {name: 'Save game', exact: true}).click();
  const raw = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY_V2);
  if (!raw) throw new Error('QA action did not produce a native save.');
  const result = readV2Save(raw);
  if (!result.ok) throw new Error(result.error);
  return {raw, state: result.state};
}

/** Verify saved calendar movement or native ending UI, rather than trusting a boolean. */
export async function playQaTurn(page: Page, diagnostic: TurnDiagnostic) {
  const before = await saveQaSnapshot(page);
  expect(before.state.phase).toBe('management');
  const continued = await playOneTurn(page, diagnostic);
  if (continued) {
    const after = await saveQaSnapshot(page);
    const nextTurn = before.state.turn + 1;
    const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
    expect(after.state).toMatchObject({phase: 'management', turn: nextTurn,
      season: seasons[(nextTurn - 1) % 4], year: Math.floor((nextTurn - 1) / 4) + 1});
  } else if (diagnostic.reason === 'game_over') {
    // Terminal screens have no Save control. The stored pre-turn snapshot is not terminal state.
    await expect(page.locator('[data-gameover-reason]')).toHaveAttribute('data-gameover-reason', /^(bankruptcy|famine|depopulation)$/);
    await expect(page.getByRole('button', {name: 'Try Again', exact: true})).toBeVisible();
  } else if (diagnostic.reason === 'victory') {
    expect(before.state.turn).toBe(40);
    await expect(page.getByText(/^Ten years have passed/)).toBeVisible();
    await expect(page.getByRole('button', {name: 'Reign Again', exact: true})).toBeVisible();
  }
  if (!continued && (diagnostic.reason === 'game_over' || diagnostic.reason === 'victory')) {
    await expect(page.locator('dl[aria-label="Final estate resources"]')).toBeVisible();
    await expect(page.getByRole('button', {name: /Simulate/})).toHaveCount(0);
  }
  return continued;
}
