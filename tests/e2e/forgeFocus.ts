import {expect,type Page} from '@playwright/test';
/** Native Tab must expose the complete control between pinned header and season action. */
export async function focusCollect(page:Page) {
 const collect=page.getByRole('button',{name:'Collect Item',exact:true});
 await expect(page.getByRole('heading',{name:'Masterwork Dagger',exact:true})).toBeFocused();
 await page.keyboard.press('Tab');await page.clock.runFor(32);await expect(collect).toBeFocused();
 const geometry=await collect.evaluate(el=>{
  const rect=el.getBoundingClientRect();
  const header=document.querySelector('.game-header[data-pinned="true"]')?.getBoundingClientRect();
  const footer=document.querySelector('.season-actions')?.getBoundingClientRect();
  return {top:rect.top,bottom:rect.bottom,headerBottom:header?.bottom??0,
   footerTop:Math.min(innerHeight,footer?.top??innerHeight),
   hits:[.05,.5,.95].map(part=>el.contains(document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height*part)))};
 });
 expect(geometry.top).toBeGreaterThanOrEqual(geometry.headerBottom);
 expect(geometry.bottom).toBeLessThanOrEqual(geometry.footerTop);
 expect(geometry.hits).toEqual([true,true,true]);return geometry;
}
