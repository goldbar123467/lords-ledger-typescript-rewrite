import {expect, test} from '@playwright/test';
import encounters from '../../../src/data/audience.ts';
import {COMPOUND_RULES, exportPitchData} from '../../../src/data/greatHall.ts';
import {createInitialState, gameReducer} from '../../../src/engine/gameReducer.ts';
import {readV2Save, writeV2Save} from '../../../src/save/saveGame.ts';

const choices = [
  {id: 'aud_006', flag: 'fundedEdwin', selected: [0]},
  {id: 'aud_009', flag: 'grantedScriptorium', selected: [0, 1]},
  {id: 'aud_010', flag: 'harshOnPoacher', selected: [1]},
] as const;
for (const width of [390, 1366]) for (const choice of choices) for (const responseIndex of [0, 1, 2]) {
  test(`Hall feedback ${choice.id} response ${responseIndex} save/reload at ${width}`, async ({page}, info) => {
    const encounter = encounters.find(entry => entry.id === choice.id), response = encounter?.responses[responseIndex];
    const rule = COMPOUND_RULES.find(entry => entry.flag === choice.flag);
    if (!encounter || !response || !rule) throw new Error('Missing authored feedback encounter.');
    let fixture = gameReducer(createInitialState(104), {type: 'START_GAME', payload: {seed: 104, difficulty: 'normal'}});
    // Managed queue prefix uses actual reducer choices, not played campaign acquisition.
    for (const prior of encounters) {
      if (prior.id === choice.id) break;
      fixture = gameReducer(fixture, {type: 'HALL_AUDIENCE_RESPOND', payload: {encounterId: prior.id, responseIndex: 0}});
    }
    fixture = gameReducer(fixture, {type: 'SET_TAB', payload: {tab: 'hall'}});
    fixture = gameReducer(fixture, {type: 'DISMISS_TUTORIAL', payload: {tab: 'hall'}});
    const input = writeV2Save(fixture), selected = choice.selected.some(index => index === responseIndex);
    const expected = gameReducer(fixture, {type: 'HALL_AUDIENCE_RESPOND', payload: {encounterId: choice.id, responseIndex}});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({width, height: width === 390 ? 844 : 768});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.addInitScript(raw => {
      if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw);
    }, input);
    await page.goto('/');
    await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
    await page.getByRole('button', {name: 'Audience', exact: true}).click();
    await page.getByRole('button', {name: new RegExp(encounter.name)}).click();
    await page.getByRole('button', {name: 'Reveal full petition', exact: true}).click();
    await page.getByRole('button', {name: new RegExp(response.label)}).click();
    await expect(page.getByText(response.aftermath, {exact: false})).toBeVisible();
    await page.getByRole('button', {name: 'Return to Queue', exact: true}).click();
    await page.getByRole('button', {name: 'Return to Throne', exact: true}).click();
    await page.getByRole('button', {name: 'Summary', exact: true}).click();
    await expect(page.getByText(rule.label, {exact: true})).toHaveCount(selected ? 1 : 0);
    await page.screenshot({path: info.outputPath('feedback-summary.png'), fullPage: true});
    await page.getByRole('button', {name: 'Save game', exact: true}).click();
    const raw = await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'));
    if (!raw) throw new Error('Missing native Hall save.');
    expect(raw).toBe(writeV2Save(expected));
    const loaded = readV2Save(raw);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(exportPitchData(loaded.state).compoundFlags[choice.flag] === true).toBe(selected);
    await page.reload();
    await page.getByRole('button', {name: 'Load saved game', exact: true}).click();
    await page.getByRole('button', {name: 'Summary', exact: true}).click();
    await expect(page.getByText(rule.label, {exact: true})).toHaveCount(selected ? 1 : 0);
    await page.getByRole('button', {name: 'Save game', exact: true}).click();
    expect(await page.evaluate(() => localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    expect(writeV2Save(fixture)).toBe(input); expect(errors).toEqual([]);
  });
}
