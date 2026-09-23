import { expect, test, type Page } from '@playwright/test';
import type { Editor } from '@barocss/editor-core';
declare global { interface Window { clipboardEditor: Editor; } }
const blocks = (page: Page) => page.locator('[data-bc-layer="content"] [data-bc-stype="paragraph"]');
async function select(page: Page, startId: string, from: number, endId = startId, to = from) {
  await page.evaluate(({startId,from,endId,to}) => {
    const point=(id:string,offset:number):[Node,number]=>{
      const host=document.querySelector(`[data-bc-layer="content"] [data-bc-sid="${id}"]`)!;
      const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);let at=offset;
      while(walker.nextNode()){if(at<=walker.currentNode.textContent!.length)return [walker.currentNode,at];at-=walker.currentNode.textContent!.length;}
      throw new Error('Missing text endpoint');
    };
    const root=document.querySelector<HTMLElement>('[contenteditable="true"]')!;root.focus();
    const range=document.createRange();range.setStart(...point(startId,from));range.setEnd(...point(endId,to));
    getSelection()!.removeAllRanges();getSelection()!.addRange(range);
    window.clipboardEditor.updateSelection({type:'range',startNodeId:startId,startOffset:from,endNodeId:endId,endOffset:to,collapsed:startId===endId&&from===to});
  },{startId,from,endId,to});
}
for(const view of ['dom','react']) test.describe(`${view} structural editing`,()=>{
  test.beforeEach(async({page})=>{await page.goto(`/tests/fixtures/clipboard.html?view=${view}`);await expect(blocks(page)).toHaveText(['ABCD','xy']);});
  test('Enter and Backspace share one reversible boundary edit each',async({page})=>{
    await select(page,'a1',2);await page.keyboard.press('Enter');await expect(blocks(page)).toHaveText(['AB','CD','xy']);
    await page.keyboard.press('Backspace');await expect(blocks(page)).toHaveText(['ABCD','xy']);
    const after=await page.evaluate(()=>JSON.stringify(window.clipboardEditor.exportDocument()));
    expect(await page.evaluate(()=>window.clipboardEditor.undo())).toBe(true);await expect(blocks(page)).toHaveText(['AB','CD','xy']);
    expect(await page.evaluate(()=>window.clipboardEditor.redo())).toBe(true);expect(await page.evaluate(()=>JSON.stringify(window.clipboardEditor.exportDocument()))).toBe(after);
  });
  test('selected typing replaces across containers and restores original marks',async({page})=>{
    const before=await page.evaluate(()=>JSON.stringify(window.clipboardEditor.exportDocument()));
    await select(page,'a1',1,'b1',1);await page.keyboard.type('Z');await expect(blocks(page)).toHaveText(['AZy']);
    expect(await page.evaluate(()=>window.clipboardEditor.undo())).toBe(true);expect(await page.evaluate(()=>JSON.stringify(window.clipboardEditor.exportDocument()))).toBe(before);await expect(blocks(page).first().locator('strong')).toHaveText('BC');
  });
  test('policy rejection leaves the model and native DOM unchanged', async ({ page }) => {
    await page.goto(`/tests/fixtures/clipboard.html?view=${view}&denyJoin=1`);
    await expect(blocks(page)).toHaveText(['ABCD', 'xy']);
    const before = await page.evaluate(() => JSON.stringify(window.clipboardEditor.exportDocument()));
    await select(page, 'a1', 1, 'b1', 1);
    await page.keyboard.type('Z');
    await select(page, 'b1', 0);
    await page.keyboard.press('Backspace');
    await select(page, 'a1', 4);
    await page.keyboard.press('Delete');
    await expect(blocks(page)).toHaveText(['ABCD', 'xy']);
    expect(await page.evaluate(() => JSON.stringify(window.clipboardEditor.exportDocument()))).toBe(before);
    expect(await page.evaluate(() => window.clipboardEditor.getHistoryStats().totalEntries)).toBe(0);
  });
  test('forward Delete joins at the same boundary and restores it on undo',async({page})=>{
    await select(page,'a1',4);await page.keyboard.press('Delete');await expect(blocks(page)).toHaveText(['ABCDxy']);
    expect(await page.evaluate(()=>window.clipboardEditor.undo())).toBe(true);await expect(blocks(page)).toHaveText(['ABCD','xy']);
  });
});
