import type {Page} from '@playwright/test';
/** Observe the rendered diamond in the visible track, without reading game state. */
export async function rhythmPosition(page:Page):Promise<number>{
 return page.locator('.forge-rhythm-indicator,[style*="rotate(45deg)"]').evaluate(el=>{
  const parent=el.parentElement;if(!parent)throw Error('Missing rhythm track');
  const box=el.getBoundingClientRect(),track=parent.getBoundingClientRect();
  return (((box.left+box.right)/2-track.left-parent.clientLeft)/parent.clientWidth)*500;
 });
}
export async function hitRhythm(page:Page,center:number,speed:number,input:'space'|'enter'|'pointer'='space',holdSpace=false){
 const pos=await rhythmPosition(page);await page.clock.runFor(Math.max(0,Math.round((center-pos)/speed)));
 if(input==='pointer')await page.locator('.forge-rhythm-indicator').locator('..').click();
 else if(input==='space'&&holdSpace)await page.keyboard.down('Space');
 else await page.keyboard.press(input==='enter'?'Enter':'Space');
}
