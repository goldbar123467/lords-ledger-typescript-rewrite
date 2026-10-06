import {expect,type Page} from '@playwright/test';

/** Follow the native dialog's heading-first keyboard reading order. */
export async function focusForgeConfirm(page:Page){
 const dialog=page.getByRole('dialog');await expect(dialog).toHaveCount(1);
 await expect(dialog.getByRole('heading')).toBeFocused();
 await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Confirm',exact:true})).toBeFocused();
}
export async function confirmForgeDialog(page:Page){
 await focusForgeConfirm(page);await page.keyboard.press('Enter');
 await expect(page.getByRole('dialog')).toHaveCount(0);
}
