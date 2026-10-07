import {test, expect} from '@playwright/test';
import {mkdirSync, readFileSync} from 'node:fs';
import {createGameLog, doManagement, dismissOverlays, playGame, PERSONAS} from '../../../playwright-playtest.ts';
import {createInitialState, gameReducer} from '../../../src/engine/gameReducer.ts';
import {SAVE_KEY_V2, writeV2Save} from '../../../src/save/saveGame.ts';
import {startGame} from '../helpers.ts';
import {saveQaSnapshot} from '../qaProgress.ts';
import {playOneTurnLogged} from '../playthrough.ts';
import {SYNERGY_TIER_MAP} from '../../../src/data/synergies.ts';

test('War Kid pays for a real early Strip Farm', async ({page}, info) => {
  await page.goto('/'); await startGame(page, 'normal');
  const before = await saveQaSnapshot(page), log = createGameLog();
  await doManagement(page, log, 'military_focused', 1, () => 0);
  const after = await saveQaSnapshot(page);
  expect(log.buildingsBuilt).toEqual([{turn: 1, label: 'strip_farm'}]);
  expect(after.state.denarii).toBe(before.state.denarii - 80);
  expect(after.state.buildings).toHaveLength(before.state.buildings.length + 1);
  expect(after.state.rngState).toBe(before.state.rngState);
  await page.reload(); await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
  expect((await saveQaSnapshot(page)).raw).toBe(after.raw);
  await page.screenshot({path: info.outputPath('paid-farm.png'), animations: 'disabled'});
});

for (const strategy of ['military_focused', 'trade_focused'] as const) {
  test(`browser ${strategy} performs its later native paid actions`, async ({page}, info) => {
    const started = gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104, difficulty: 'normal'}});
    const turn = strategy === 'military_focused' ? 5 : 3;
    // Accepted management fixtures cover policy actions, not acquired campaign outcomes.
    const state = {...started, turn, season: strategy === 'military_focused' ? 'spring' as const : 'autumn' as const,
      year: strategy === 'military_focused' ? 2 : 1, tutorialsSeen: ['estate', 'people', 'military', 'market']};
    await page.addInitScript(({key, raw}) => localStorage.setItem(key, raw), {key: SAVE_KEY_V2, raw: writeV2Save(state)});
    await page.goto('/'); await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
    const log = createGameLog(); await doManagement(page, log, strategy, turn, () => 0);
    const after = await saveQaSnapshot(page);
    expect(after.state.turn).toBe(turn); expect(after.state.rngState).toBe(state.rngState);
    if (strategy === 'military_focused') {
      expect(after.state.garrison).toBeGreaterThan(state.garrison);
      expect(after.state.military.totalRecruitmentSpending).toBeGreaterThan(0);
      expect(after.state.military.totalFortificationSpending).toBeGreaterThan(0);
    } else {
      expect(log.tradesMade.some(trade => trade.type === 'sell')).toBe(true);
      for (const name of ['Salt', 'Tools', 'Spices']) expect(log.tradesMade.some(trade => trade.type === 'buy' && trade.label?.includes(name))).toBe(true);
      expect(after.state.tradeCount).toBe(log.tradesMade.length);
    }
    await page.screenshot({path: info.outputPath('paid-actions.png'), animations: 'disabled'});
  });
}

test('browser campaign preserves action evidence when native progression stalls', async ({page, baseURL}, info) => {
  if (!baseURL) throw new Error('Missing isolated test URL.');
  await page.addInitScript(() => document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('button[aria-label*="Simulate"]')) event.stopImmediatePropagation();
  }, {capture: true}));
  const persona = PERSONAS[0]; if (!persona) throw new Error('Missing builder persona.');
  const output = info.outputPath('partial-evidence'); mkdirSync(output, {recursive: true});
  const result = await playGame(page, persona, 0, {games: 1, baseURL, turnLimit: 1, offset: 0, debug: false}, output);
  expect(result.outcome).toBe('error'); expect(result.buildingsBuilt.length).toBeGreaterThan(0);
  expect(result.consoleErrors.some(error => /advance the saved calendar/.test(error))).toBe(true);
  expect(JSON.parse(readFileSync(`${output}/game-1.json`, 'utf8')).outcome).toBe('error');
  expect(readFileSync(`${output}/game-1.png`).length).toBeGreaterThan(0);
});

test('turn logger rejects an invalid policy choice index', async ({page}, info) => {
  await page.goto('/'); await startGame(page, 'normal');
  await expect(playOneTurnLogged(page, outcome => info.outputPath(`${outcome}.png`), () => Number.NaN)).rejects.toThrow('Choice selector returned an invalid index.');
});

test('turn logger propagates a native choice click failure', async ({page}, info) => {
  await page.goto('/'); await startGame(page, 'normal');
  await page.evaluate(() => {
    // Reproduce an unavailable choice; the logger must reject the failed native click.
    const observer = new MutationObserver(() => {
      for (const button of document.querySelectorAll<HTMLButtonElement>('[role="group"] button')) button.disabled = true;
    });
    observer.observe(document.body, {childList: true, subtree: true});
  });
  await expect(playOneTurnLogged(page, outcome => info.outputPath(`${outcome}.png`), () => 0)).rejects.toThrow(/Timeout.*exceeded/);
  await expect(page.getByRole('group', {name: 'Choose your response', exact: true})).toBeVisible();
});

for (const width of [390, 1366]) test(`browser driver natively dismisses queued tier-two cards at ${width}px`, async ({page}, info) => {
  const state = gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104, difficulty: 'normal'}});
  state.tutorialsSeen = ['estate'];
  state.synergies.activated = ['wool_baron_1', 'wool_baron_2', 'pious_lord_1', 'pious_lord_2'];
  // Authored notification rendering fixture; no natural acquisition claim.
  state.pendingSynergyNotifications = (['wool_baron_2', 'pious_lord_2'] as const).map(tierId => {
    const entry = SYNERGY_TIER_MAP[tierId]; if (!entry) throw new Error('Missing authored notification.');
    return {tierId, tier: entry.tier.tier, title: entry.tier.title,
      description: entry.tier.description, pathName: entry.path.name, pathIcon: entry.path.icon, pathColor: entry.path.color,
      scribesNote: entry.tier.scribesNote ?? null};
  });
  await page.setViewportSize({width, height: 844});
  await page.emulateMedia({reducedMotion: width === 390 ? 'reduce' : 'no-preference'});
  await page.addInitScript(({key, raw}) => localStorage.setItem(key, raw), {key: SAVE_KEY_V2, raw: writeV2Save(state)});
  await page.goto('/'); await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
  await page.evaluate(() => {
    document.body.dataset.notificationClicks = '0';
    document.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('[role="status"]')?.textContent?.includes('Tap to dismiss'))
        document.body.dataset.notificationClicks = String(Number(document.body.dataset.notificationClicks) + 1);
    }, {capture: true});
  });
  await page.screenshot({path: info.outputPath('queued-cards.png'), animations: 'allow'});
  await dismissOverlays(page);
  expect(await page.evaluate(() => document.body.dataset.notificationClicks)).toBe('2');
  expect((await saveQaSnapshot(page)).state.pendingSynergyNotifications).toEqual([]);
});
