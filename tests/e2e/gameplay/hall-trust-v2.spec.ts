import { expect, test } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { readV2Save, writeV2Save } from '../../../src/save/saveGame.ts';

for (const width of [390, 1366]) for (const trust of [0, 85.5]) {
  test(`Hall trust ${trust} survives council and Save/Load at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({width,height:844});
    const base=createInitialState(104),state={...base,phase:'management' as const,activeTab:'hall',tutorialsSeen:['hall'],greatHall:{...base.greatHall,stewardTrust:trust,meters:{...base.greatHall.meters,people:71}}};
    const raw=writeV2Save(state),errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},raw);
    await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
    await expect(page.getByText(`Trust: ${trust===0?'Wary':'Devoted'}`,{exact:true})).toBeVisible();
    await page.screenshot({path:info.outputPath('throne.png'),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Council',exact:true}).click();
    await page.getByRole('button',{name:/Accept the Alliance/}).click();
    await page.getByRole('button',{name:'Save game',exact:true}).click();
    const saved=await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save')); if(!saved)throw new Error('Missing save');
    const result=readV2Save(saved);if(!result.ok)throw new Error(result.error);
    expect(result.state.greatHall.stewardTrust).toBe(trust+1);expect(result.state.rngState).toBe(state.rngState);
    await page.reload();await page.getByRole('button',{name:'Load saved game',exact:true}).click();
    await expect(page.getByText(`Trust: ${trust===0?'Wary':'Bonded'}`,{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Save game',exact:true}).click();
    expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(saved);expect(errors).toEqual([]);
  });
}
