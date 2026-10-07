import type {GameCommand} from '../../../src/engine/gameCommands.ts';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { FEAST_DATA } from '../../../src/data/decrees.ts';
import { createInitialState, gameReducer } from '../../../src/engine/gameReducer.ts';
import { writeV2Save } from '../../../src/save/saveGame.ts';
async function tabTo(page: Page, target: Locator) {
  for(let i=0;i<100;i++){if(await target.evaluate(e=>e===document.activeElement))return;await page.keyboard.press('Tab');}
  await expect(target).toBeFocused();
}
for(const scenario of [{width:1366,height:768,root:16},{width:390,height:600,root:32}]) {
  test('Feast options expose numeric effects before selection '+scenario.width,async({page},info)=>{
    const state={...createInitialState(104),phase:'management' as const,activeTab:'hall',tutorialsSeen:['hall']},raw=writeV2Save(state);
    await page.setViewportSize(scenario);await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(raw=>{if(!localStorage.getItem('lords-ledger-v2-save'))localStorage.setItem('lords-ledger-v2-save',raw);},raw);
    await page.goto('/');await page.evaluate(root=>document.documentElement.style.fontSize=root+'px',scenario.root);
    await page.getByRole('button',{name:'Load saved game',exact:true}).click();
    await page.getByRole('button',{name:'Feast',exact:true}).click();
    await page.screenshot({path:info.outputPath('guest-planning.png'),fullPage:true,animations:'disabled'});
    for(const group of [FEAST_DATA.guestOptions,FEAST_DATA.entertainmentOptions,FEAST_DATA.courseOptions]) {
      for(const option of group){const choice=page.getByRole('button',{name:new RegExp(option.label)});
        for(const [key,value]of Object.entries(option.effects))if(value)await expect(choice).toContainText(key[0]?.toUpperCase()+key.slice(1)+' '+(value>0?'+':'')+value);
        await tabTo(page,choice);await page.waitForTimeout(150);
        const bounds=await choice.evaluate(e=>{const r=e.getBoundingClientRect(),hit=(y:number)=>{const target=document.elementFromPoint(r.x+r.width/2,y);return !!target&&(target===e||e.contains(target));};return {inside:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,top:hit(r.top+3),center:hit(r.top+r.height/2),bottom:hit(r.bottom-3),outline:getComputedStyle(e).outlineStyle};});
        expect(bounds).toEqual({inside:true,top:true,center:true,bottom:true,outline:'solid'});
        await page.screenshot({path:info.outputPath(option.id+'-focus.png'),animations:'disabled'});
      }
      await page.getByRole('button',{name:new RegExp(group[0].label)}).click();
      if(group!==FEAST_DATA.courseOptions)await page.getByRole('button',{name:'Next',exact:true}).click();
    }
    await page.getByRole('button',{name:'Begin the Feast',exact:true}).click();
    await page.getByRole('button',{name:'Save game',exact:true}).click();
    expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    const action: GameCommand={type:'HALL_FEAST_COMPLETE',payload:{guestId:FEAST_DATA.guestOptions[0].id,entertainmentId:FEAST_DATA.entertainmentOptions[0].id,courseId:FEAST_DATA.courseOptions[0].id,seed:state.rngState}};
    const finish=page.getByRole('button',{name:'Return to Throne',exact:true});await tabTo(page,finish);await page.keyboard.press('Enter');
    await expect(page.getByText('You have already held a feast this season.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Save game',exact:true}).click();
    expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(writeV2Save(gameReducer(state,action)));
  });
}

for(const width of [390,1366]) {
  test('Feast Back preserves later choices and Load resets preview '+width,async({page},info)=>{
    const state={...createInitialState(104),phase:'management' as const,activeTab:'hall',tutorialsSeen:['hall']},raw=writeV2Save(state);
    await page.setViewportSize({width,height:844});
    await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),raw);
    await page.goto('/');await page.getByRole('button',{name:'Load saved game',exact:true}).click();
    await page.getByRole('button',{name:'Feast',exact:true}).click();
    await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:new RegExp(FEAST_DATA.guestOptions[3].label)}).click();
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.getByRole('button',{name:new RegExp(FEAST_DATA.entertainmentOptions[1].label)}).click();
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.getByRole('button',{name:new RegExp(FEAST_DATA.courseOptions[2].label)}).click();
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await expect(page.getByRole('button',{name:new RegExp(FEAST_DATA.entertainmentOptions[1].label)})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await expect(page.getByRole('button',{name:new RegExp(FEAST_DATA.guestOptions[3].label)})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:new RegExp(FEAST_DATA.guestOptions[0].label)}).click();
    await expect(page.getByRole('button',{name:new RegExp(FEAST_DATA.guestOptions[3].label)})).toHaveAttribute('aria-pressed','false');
    await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
    await expect(page.getByRole('button',{name:new RegExp(FEAST_DATA.courseOptions[2].label)})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'Begin the Feast',exact:true}).click();
    await page.screenshot({path:info.outputPath('changed-plan-preview.png'),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
    await page.getByRole('button',{name:'Load saved game',exact:true}).click();
    await page.getByRole('button',{name:'Feast',exact:true}).click();
    await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
    for(const option of FEAST_DATA.guestOptions)await expect(page.getByRole('button',{name:new RegExp(option.label)})).toHaveAttribute('aria-pressed','false');
    await page.getByRole('button',{name:'Save game',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBe(raw);
  });
  test('Feast pointer hold keeps short choice stationary '+width,async({page})=>{
    const state={...createInitialState(104),phase:'management' as const,activeTab:'hall',tutorialsSeen:['hall']};
    await page.setViewportSize({width,height:width===390?600:768});
    await page.addInitScript(raw=>localStorage.setItem('lords-ledger-v2-save',raw),writeV2Save(state));
    await page.goto('/');if(width===390)await page.evaluate(()=>document.documentElement.style.fontSize='32px');
    await page.getByRole('button',{name:'Load saved game',exact:true}).click();await page.getByRole('button',{name:'Feast',exact:true}).click();
    const choice=page.getByRole('button',{name:new RegExp(FEAST_DATA.guestOptions[0].label)});
    await choice.evaluate(e=>e.scrollIntoView({block:'center'}));
    const box=await choice.boundingBox();if(!box)throw Error('Missing choice');
    expect(await choice.evaluate(e=>{const r=e.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return target===e||!!target&&e.contains(target);})).toBe(true);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    const before=await page.evaluate(()=>scrollY);await page.waitForTimeout(150);expect(await page.evaluate(()=>scrollY)).toBe(before);
    await page.mouse.up();await expect(choice).toHaveAttribute('aria-pressed','true');
  });
}
