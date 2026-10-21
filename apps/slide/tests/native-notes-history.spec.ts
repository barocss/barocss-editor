import { expect, test } from '@playwright/test';
import { openDeck, openFilmstrip } from './helpers';

// The original empty-marks representation must survive real note typing and Undo.
test('unformatted notes restore the exact native document after typing and undo', async ({page}, info) => {
  await openDeck(page); await openFilmstrip(page);
  await page.locator('.sl-filmstrip button[data-slide]').nth(1).click();
  const toggle = page.getByRole('button',{name:'발표자 노트',exact:true});
  if (await toggle.count()) await toggle.click();
  const before = await page.evaluate(()=>(window as any).editor.exportDocument());
  const paragraph = page.locator('.sl-notes-host p').first();
  await paragraph.click(); await page.keyboard.press('Meta+ArrowRight'); await page.keyboard.insertText(' note typing');
  await expect(paragraph).toContainText(' note typing');
  await info.attach('typing-history.json', { body: JSON.stringify(await page.evaluate(()=>(window as any).editor.historyManager.getHistory())), contentType:'application/json' });
  await page.keyboard.press('Meta+z');
  await expect.poll(()=>page.evaluate(()=>(window as any).editor.exportDocument())).toEqual(before);
});
