import { expect, test, type Page, type Locator } from '@playwright/test';
import { createInitialState } from '../../../src/engine/gameReducer.ts';
import { writeV2Save } from '../../../src/save/saveGame.ts';
async function load(page: Page, width: number, size: number) {
  await page.setViewportSize({ width, height: 844 });
  const raw = writeV2Save({ ...createInitialState(104), phase: 'management' as const, activeTab: 'hall', tutorialsSeen: ['hall'] });
  await page.addInitScript(raw => { if (!localStorage.getItem('lords-ledger-v2-save')) localStorage.setItem('lords-ledger-v2-save', raw); }, raw);
  await page.goto('/'); await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, size);
  await page.getByRole('button', { name: 'Load saved game', exact: true }).click();
  await page.getByRole('button', { name: 'Audience', exact: true }).click(); return raw;
}
async function readable(locator: Locator, minimum: number) {
  const result = await locator.evaluate(e => {
    const s = getComputedStyle(e), channels = (v: string) => v.match(/[\d.]+/g)?.map(Number) ?? [];
    const fg = channels(s.color), bg = channels(s.backgroundColor);
    const backing = [42, 37, 32].map((c, i) => c * (1 - (bg[3] ?? 1)) + (bg[i] ?? 0) * (bg[3] ?? 1));
    const lum = (rgb: number[]) => rgb.slice(0, 3).reduce((n, c, i) => { const x=c/255; return n+(x<=.04045?x/12.92:((x+.055)/1.055)**2.4)*([.2126,.7152,.0722][i]??0); },0);
    return { size: parseFloat(s.fontSize), ratio: (lum(fg)+.05)/(lum(backing)+.05) };
  });
  expect(result.size).toBeGreaterThanOrEqual(minimum); expect(result.ratio).toBeGreaterThanOrEqual(4.5);
}
async function tabTo(page: Page, locator: Locator) {
  for (let i=0;i<100 && !(await locator.evaluate(e=>e===document.activeElement));i++) await page.keyboard.press('Tab');
  await expect(locator).toBeFocused();
  await expect.poll(()=>locator.evaluate(e=>{const r=e.getBoundingClientRect(),footer=document.querySelector('.sticky.bottom-0')?.getBoundingClientRect(),header=document.querySelector('.game-header');const top=header&&getComputedStyle(header).position==='sticky'?header.getBoundingClientRect().bottom:0;return r.top>=top+3&&r.bottom<=(footer?.top??innerHeight)-3&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  await expect(locator).toHaveCSS('outline-style','solid');
}
for(const width of [390,1366]) for(const size of [16,24]) {
  test(`Audience captions, badges and effects readable ${width}px root${size}`, async({page},info)=>{
    await load(page,width,size);
    for(const label of ['beggar','merchant','priest','soldier','gossip']) await readable(page.getByText(label,{exact:true}).first(),size*.75);
    await page.screenshot({path:info.outputPath('queue.png'),animations:'disabled'});
    await page.getByRole('button',{name:/Old Martha/}).click();
    await page.locator('.dispute-cursor').locator('..').click();
    await page.getByRole('button',{name:/Feed her from the kitchen/}).click();
    for(const label of ['Your Decree','What Follows','Consequences']) await readable(page.getByText(label,{exact:true}),size*.75);
    for(const label of ['People +3','Treasury -1']) await readable(page.getByText(label,{exact:true}),size*.875);
    await page.screenshot({path:info.outputPath('aftermath.png'),animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
  test(`Audience native skip, response and history stay clear ${width}px root${size}`,async({page},info)=>{
    await load(page,width,size);
    const visitor=page.getByRole('button',{name:/Old Martha/}); await tabTo(page,visitor); await page.keyboard.press('Enter');
    const skip=page.getByRole('button',{name:'Reveal full petition',exact:true}); await tabTo(page,skip); await page.keyboard.press('Enter');
    const reply=page.getByRole('button',{name:/Feed her from the kitchen/}); await tabTo(page,reply);
    await expect.poll(() => reply.locator('h5').evaluate(e => {
      const r = e.getBoundingClientRect();
      return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })).toBe(true);
    await expect.poll(() => reply.locator('..').evaluate(e => {
      const cards = Array.from(e.querySelectorAll('button'));
      return cards.every(card => {
        let ancestor: HTMLElement | null = card.parentElement;
        const r = card.getBoundingClientRect();
        while (ancestor && ancestor.closest('.audience-view')) {
          const s = getComputedStyle(ancestor), a = ancestor.getBoundingClientRect();
          if (['hidden', 'clip'].includes(s.overflowY) && (r.top < a.top || r.bottom > a.bottom)) return false;
          ancestor = ancestor.parentElement;
        }
        return true;
      });
    })).toBe(true);
    await page.screenshot({path:info.outputPath('response-focus.png'),animations:'disabled'}); await page.keyboard.press('Enter');
    const history=page.getByRole('button',{name:'Show Historical Context',exact:true}); await tabTo(page,history); await page.keyboard.press('Enter');
    const next=page.getByRole('button',{name:'Next Visitor',exact:true}); await tabTo(page,next);
    // A button can pass bounds/hit tests while its label splits within a word.
    await expect.poll(() => next.evaluate(e => {
      const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const start = node.textContent?.indexOf('Visitor') ?? -1;
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(node, start); range.setEnd(node, start + 'Visitor'.length);
        return range.getClientRects().length === 1;
      }
      return false;
    })).toBe(true);
    await page.screenshot({path:info.outputPath('history-focus.png'),animations:'disabled'});
  });
}
