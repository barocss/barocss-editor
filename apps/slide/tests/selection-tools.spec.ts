import { expect,test } from '@playwright/test';
import { openDeck,visibleBoxes,openFilmstrip } from './helpers';
const tools=(page:import('@playwright/test').Page)=>page.locator('[data-slides-formatting]');
const native=(page:import('@playwright/test').Page)=>page.evaluate(()=>{const ed=(window as any).editor;return {document:JSON.stringify(ed.exportDocument()),selection:ed.selection,history:ed.getHistoryStats()};});
async function text(page:import('@playwright/test').Page){const [frame]=await visibleBoxes(page,'.sl-text-frame');await page.mouse.dblclick(frame.x,frame.y);await page.keyboard.press('Meta+ArrowLeft');for(let i=0;i<7;i++)await page.keyboard.press('Shift+ArrowRight');await expect.poll(()=>page.evaluate(()=>getSelection()?.toString())).toBe('One eng');await expect.poll(()=>page.evaluate(()=>({type:(window as any).editor.selection?.type,start:(window as any).editor.selection?.startOffset,end:(window as any).editor.selection?.endOffset,collapsed:(window as any).editor.selection?.collapsed}))).toEqual({type:'range',start:0,end:7,collapsed:false});}
test('text selection exposes size and underline and compact secondary paragraph tools',async({page},info)=>{
 await openDeck(page);await text(page);const before=await native(page);
 await expect(tools(page).getByRole('combobox',{name:'Size',exact:true})).toBeVisible();
 await expect(tools(page).getByRole('button',{name:'밑줄',exact:true})).toBeVisible();
 await tools(page).getByRole('button',{name:'선택 도구 더보기',exact:true}).click();
 const menu=page.getByRole('menu',{name:'선택한 Slides 추가 도구',exact:true});
 await expect(menu.getByRole('menuitemcheckbox',{name:'가운데 맞춤',exact:true})).toBeVisible();expect(await native(page)).toEqual(before);
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();expect(await native(page)).toEqual(before);
 const rect=(await tools(page).boundingBox())!;expect(rect.width).toBeLessThanOrEqual(480);expect(rect.height).toBeLessThanOrEqual(48);
 await tools(page).getByRole('button',{name:'밑줄',exact:true}).click();
 await expect.poll(async()=>JSON.stringify((await native(page)).document)).not.toBe(JSON.stringify(before.document));
 await page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'실행 취소',exact:true}).click();expect((await native(page)).document).toBe(before.document);
 await text(page);await page.screenshot({path:info.outputPath('text-tools.png')});
});
test('caret keeps paragraph tools without treating text as selected objects',async({page})=>{
 await openDeck(page);const [frame]=await visibleBoxes(page,'.sl-text-frame');await page.mouse.dblclick(frame.x,frame.y);await page.keyboard.press('ArrowRight');await expect.poll(()=>page.evaluate(()=>(window as any).editor.selection?.type)).toBe('range');await expect.poll(()=>page.evaluate(()=>(window as any).editor.selection?.collapsed)).toBe(true);const before=await native(page);
 await expect(tools(page).getByRole('button',{name:'가운데 맞춤',exact:true})).toBeVisible();
 await expect(tools(page).getByRole('button',{name:'복제',exact:true})).toHaveCount(0);expect(await native(page)).toEqual(before);
 await tools(page).getByRole('button',{name:'오른쪽 맞춤',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>{const ed=(window as any).editor;let node=ed.dataStore.getNode(ed.selection.startNodeId);while(node && node.stype!=='paragraph')node=ed.dataStore.getNode(node.parentId);return node?.attributes?.alignment;})).toBe('right');
});
const attributes=(page:import('@playwright/test').Page,id:string)=>page.evaluate(id=>(window as any).editor.dataStore.getNode(id)?.attributes,id);
test('shape stroke changes use native style and undo while mixed selection exposes arrangement',async({page},info)=>{
 await openDeck(page);await page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'사각형',exact:true}).click();
 await expect(tools(page).getByRole('spinbutton',{name:'선 두께',exact:true})).toBeVisible();
 const id=await page.evaluate(()=>(window as any).editor.selection.nodeIds[0]),before=await native(page);
 const width=tools(page).getByRole('spinbutton',{name:'선 두께',exact:true});await width.fill('2');await width.press('Enter');
 await expect.poll(async()=>(await attributes(page,id)).strokeWidth).toBe(40);
 await page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'실행 취소',exact:true}).click();expect((await native(page)).document).toBe(before.document);
 await page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'사각형',exact:true}).click();
 await page.evaluate(first=>{const ed=(window as any).editor,last=ed.selection.nodeIds[0];ed.updateSelection({type:'node',nodeIds:[first,last],startNodeId:first,startOffset:0,endNodeId:last,endOffset:0,collapsed:false});},id);
 // The native selection admission above prepares the exact multi-node context;
 // toolbar commands below are real user actions.
 await expect(tools(page).getByRole('button',{name:'왼쪽 정렬',exact:true})).toBeVisible();
 await expect(tools(page).getByRole('button',{name:'그룹',exact:true})).toBeEnabled();
 await tools(page).getByRole('button',{name:'그룹',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>{const ed=(window as any).editor;return ed.dataStore.getNode(ed.selection.nodeIds[0])?.stype;})).toBe('group');
 await page.screenshot({path:info.outputPath('object-tools.png')});
});
test('table cells expose structure controls and secondary deletion without text-frame object tools',async({page})=>{
 await openDeck(page);await openFilmstrip(page);await page.locator('.sl-filmstrip button[data-slide]').nth(3).click();await page.getByRole('button',{name:'슬라이드 탐색 접기',exact:true}).click();
 const box=(await page.locator('.sl-stage').getByRole('cell').first().boundingBox())!;await page.mouse.dblclick(box.x+Math.min(40,box.width/2),box.y+box.height/2);
 await expect.poll(()=>page.evaluate(()=>(window as any).editor.selection?.type)).toBe('range');
 await expect(tools(page).getByRole('button',{name:'아래에 행 삽입',exact:true})).toBeVisible();
 const before=await native(page);await tools(page).getByRole('button',{name:'선택 도구 더보기',exact:true}).click();
 await expect(page.getByRole('menuitem',{name:'행 삭제',exact:true})).toBeVisible();expect(await native(page)).toEqual(before);
 await page.keyboard.press('Escape');await expect(tools(page).getByRole('button',{name:'복제',exact:true})).toHaveCount(0);
});
test('queued object draft and text menu cannot write after the owner becomes read-only',async({page})=>{
 await openDeck(page);await page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'사각형',exact:true}).click();
 const width=tools(page).getByRole('spinbutton',{name:'선 두께',exact:true});await width.fill('9');const before=await native(page);
 await page.evaluate(()=>(window as any).editor.setEditable(false));await expect(tools(page)).toHaveCount(0);expect((await native(page)).document).toBe(before.document);expect((await native(page)).history).toEqual(before.history);
});
test('whole text object shows BIUS and fonts and keeps native object selection and off-target text',async({page},info)=>{
 await openDeck(page);const [frame]=await visibleBoxes(page,'.sl-text-frame');await page.mouse.click(frame.x,frame.y);
 await expect.poll(()=>page.evaluate(()=>(window as any).editor.selection.type)).toBe('node');
 const before=await native(page);const ids=before.selection.nodeIds;
 const outside=await page.evaluate(id=>{const ed=(window as any).editor;const selected=ed.dataStore.getNode(id);return selected.parentId && ed.dataStore.getNode(selected.parentId).content.filter((sid:string)=>sid!==id).map((sid:string)=>JSON.stringify(ed.dataStore.getNode(sid)));},ids[0]);
 for(const label of ['굵게','기울임','밑줄','취소선'])await expect(tools(page).getByRole('button',{name:label,exact:true})).toBeEnabled();
 await expect(tools(page).getByRole('combobox',{name:'Size',exact:true})).toBeEnabled();
 await expect(tools(page).getByRole('button',{name:'굵게',exact:true})).toHaveAttribute('aria-pressed','true');
 const rect=(await tools(page).boundingBox())!;expect(rect.width).toBeLessThanOrEqual(480);expect(rect.height).toBeLessThanOrEqual(48);
 await tools(page).getByRole('button',{name:'밑줄',exact:true}).click();
 await expect.poll(()=>page.evaluate(id=>{const ed=(window as any).editor;const walk=(sid:string):any[]=>{const n=ed.dataStore.getNode(sid);return n.stype==='inline-text'?[n]:n.content.flatMap(walk);};return walk(id).every(n=>n.marks?.some((mark:any)=>mark.stype==='underline'));},ids[0])).toBe(true);
 expect((await native(page)).selection).toEqual(before.selection);
 const after=await native(page);
 expect(await page.evaluate(id=>{const ed=(window as any).editor;const selected=ed.dataStore.getNode(id);return ed.dataStore.getNode(selected.parentId).content.filter((sid:string)=>sid!==id).map((sid:string)=>JSON.stringify(ed.dataStore.getNode(sid)));},ids[0])).toEqual(outside);
 await page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'실행 취소',exact:true}).click();expect((await native(page)).document).toBe(before.document);
 await page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'다시 실행',exact:true}).click();expect((await native(page)).document).toBe(after.document);
 await tools(page).getByRole('button',{name:'굵게',exact:true}).click();
 await expect(tools(page).getByRole('button',{name:'굵게',exact:true})).toHaveAttribute('aria-pressed','false');
 expect((await native(page)).selection).toEqual(before.selection);
 await page.screenshot({path:info.outputPath('whole-object-text.png')});
});
test('picture fit and line stroke stay compact and use reversible native writes',async({page})=>{
 await openDeck(page);
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'그림 삽입',exact:true}).click()]);
 await chooser.setFiles({name:'toolbar-test.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="blue"/></svg>')});
 const fit=tools(page).getByRole('combobox',{name:'그림 맞춤',exact:true});await expect(fit).toBeVisible();
 const before=await native(page),id=before.selection.nodeIds[0];await fit.click();await page.getByRole('option',{name:'가득 채우기',exact:true}).click();await expect.poll(async()=>(await attributes(page,id)).fit).toBe('cover');
 await page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'실행 취소',exact:true}).click();expect((await native(page)).document).toBe(before.document);
 await page.getByRole('button',{name:'추가 Slides 도구',exact:true}).click();await page.getByRole('menuitem',{name:'선',exact:true}).click();
 const lineBefore=await native(page),lineId=lineBefore.selection.nodeIds[0];const width=tools(page).getByRole('spinbutton',{name:'선 두께',exact:true});await width.fill('2');await width.press('Enter');await expect.poll(async()=>(await attributes(page,lineId)).strokeWidth).toBe(40);
 await page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'실행 취소',exact:true}).click();expect((await native(page)).document).toBe(lineBefore.document);
});
