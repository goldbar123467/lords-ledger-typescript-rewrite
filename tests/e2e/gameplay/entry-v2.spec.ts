import {test,expect} from '@playwright/test';

test('local entry boots and saves without requesting hosted Analytics',async({page},info)=>{
 const errors:string[]=[],analyticsRequests:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/_vercel/insights/'))analyticsRequests.push(request.url());});
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.getByRole('button',{name:/Normal.*standard experience/i})).toBeVisible();
 await page.waitForLoadState('networkidle');await page.screenshot({path:info.outputPath('title.png'),animations:'disabled'});
 await expect(page.locator('script[src*="/_vercel/insights/"]')).toHaveCount(0);
 await page.getByRole('button',{name:/Normal.*standard experience/i}).click();
 await page.getByRole('button',{name:'I Understand',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Economy Overview',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save game',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('lords-ledger-v2-save'))).toBeTruthy();
 expect(analyticsRequests).toEqual([]);expect(errors).toEqual([]);
});
