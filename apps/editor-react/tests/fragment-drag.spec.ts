import { expect, test, type Page } from '@playwright/test';
import type { Editor } from '@barocss/editor-core';
declare global { interface Window { clipboardEditor: Editor; } }
async function point(page: Page, id: string, offset: number) {
  return page.evaluate(({id,offset}) => {
    const host=document.querySelector(`[data-bc-layer="content"] [data-bc-sid="${id}"]`)!;
    const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT); let left=offset;
    while(walker.nextNode()) { const node=walker.currentNode as Text; if(left<=node.length) { const range=document.createRange();range.setStart(node,left);range.collapse(true);const box=range.getBoundingClientRect();return {x:box.x,y:box.y+box.height/2}; } left-=node.length; }
    throw new Error('Missing text position');
  },{id,offset});
}
async function select(page: Page, from=1, to=3) {
  await page.evaluate(({from,to}) => {
    const host=document.querySelector('[data-bc-layer="content"] [data-bc-sid="a1"]')!;
    host.closest<HTMLElement>('[contenteditable="true"]')!.focus();
    const texts: Text[]=[];const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);while(walker.nextNode())texts.push(walker.currentNode as Text);
    const at=(offset:number):[Text,number]=>{for(const node of texts){if(offset<=node.length)return [node,offset];offset-=node.length;}throw new Error('Missing endpoint');};
    const range=document.createRange();range.setStart(...at(from));range.setEnd(...at(to));window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);
    window.clipboardEditor.updateSelection({type:'range',startNodeId:'a1',startOffset:from,endNodeId:'a1',endOffset:to,collapsed:from===to});
  },{from,to});
}
async function drag(page: Page, start:{x:number;y:number}, end:{x:number;y:number}) {
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.waitForTimeout(250);
  await page.mouse.move(start.x+5,start.y+3,{steps:4});await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();
}
const blocks=(page:Page)=>page.locator('[data-bc-layer="content"] [data-bc-stype="paragraph"]');
const snapshot=(page:Page)=>page.evaluate(()=>JSON.stringify(window.clipboardEditor.dataStore.getAllNodes().sort((a,b)=>a.sid!.localeCompare(b.sid!))));
for(const view of ['dom','react']) test.describe(`${view} native fragment drag`,()=>{
  test.beforeEach(async({page})=>{
    await page.goto(`/tests/fixtures/clipboard.html?view=${view}`);await expect(blocks(page)).toHaveText(['ABCD','xy']);
  });
  test('external text lands at the pointer rather than the previous cursor',async({page})=>{
    await select(page,0,0);const before=await snapshot(page);
    await page.evaluate(()=>{const source=document.createElement('div');source.id='external';source.draggable=true;source.textContent='external drag';source.style.cssText='margin-top:80px;width:120px;height:40px;background:#eee';source.addEventListener('dragstart',event=>event.dataTransfer!.setData('text/plain','DROP'));document.body.append(source);});
    const source=await page.locator('#external').boundingBox();await drag(page,{x:source!.x+20,y:source!.y+20},await point(page,'b1',1));
    await expect(blocks(page)).toHaveText(['ABCD','xDROPy']);
    expect(await page.evaluate(()=>window.clipboardEditor.undo())).toBe(true);expect(await snapshot(page)).toBe(before);
    expect(await page.evaluate(()=>window.clipboardEditor.redo())).toBe(true);await expect(blocks(page)).toHaveText(['ABCD','xDROPy']);
  });
  test('moves a marked selection once and undoes source and destination together',async({page})=>{
    await select(page);const before=await snapshot(page);await drag(page,await point(page,'a1',2),await point(page,'b1',1));
    await expect(blocks(page)).toHaveText(['AD','xBCy']);await expect(blocks(page).nth(1).locator('strong')).toHaveText('BC');
    expect(await page.evaluate(()=>window.clipboardEditor.getHistoryStats().totalEntries)).toBe(1);
    expect(await page.evaluate(()=>window.clipboardEditor.undo())).toBe(true);expect(await snapshot(page)).toBe(before);
  });
  test('Alt copies a local range without deleting its source',async({page})=>{
    await select(page);await page.keyboard.down('Alt');await drag(page,await point(page,'a1',2),await point(page,'b1',1));await page.keyboard.up('Alt');
    await expect(blocks(page)).toHaveText(['ABCD','xBCy']);
  });
  test('whole-node drag uses a child gap and keeps IDs',async({page})=>{
    await page.evaluate(()=>{
      window.clipboardEditor.updateSelection({type:'node',nodeIds:['a'],startNodeId:'a',endNodeId:'a',startOffset:0,endOffset:0,collapsed:false});
      const block=document.querySelector<HTMLElement>('[data-bc-layer="content"] [data-bc-sid="a"]')!;block.draggable=true;block.contentEditable='false';
    });
    const a=await blocks(page).nth(0).boundingBox(),b=await blocks(page).nth(1).boundingBox();
    await drag(page,{x:a!.x+10,y:a!.y+a!.height/2},{x:b!.x+10,y:b!.y+b!.height-2});await expect(blocks(page)).toHaveText(['xy','ABCD']);
    expect(await page.evaluate(()=>window.clipboardEditor.dataStore.getNode(window.clipboardEditor.getRootId()!)?.content)).toEqual(['b','a']);
  });
  test('a range dropped inside itself is a noop without history',async({page})=>{
    await select(page);const before=await snapshot(page);
    await drag(page,await point(page,'a1',2),await point(page,'a1',1));
    expect(await snapshot(page)).toBe(before);expect(await page.evaluate(()=>window.clipboardEditor.getHistoryStats().totalEntries)).toBe(0);
  });
  test('a source change during native drag rejects the move',async({page})=>{
    await select(page);
    await page.evaluate(()=>document.addEventListener('dragstart',()=>window.clipboardEditor.dataStore.updateNode('a1',{text:'CHANGED',marks:[]}),{once:true}));
    await drag(page,await point(page,'a1',2),await point(page,'b1',1));
    // This direct datastore probe changes the basis without requesting a render.
    expect(await page.evaluate(()=>[window.clipboardEditor.dataStore.getNode('a1')?.text,window.clipboardEditor.dataStore.getNode('b1')?.text])).toEqual(['CHANGED','xy']);
    expect(await page.evaluate(()=>window.clipboardEditor.getHistoryStats().totalEntries)).toBe(0);
  });
  test('file drops prevent navigation and still reach product handlers',async({page})=>{
    const before=await snapshot(page),at=await point(page,'b1',1);
    expect(await page.evaluate(({x,y})=>{
      const target=document.elementFromPoint(x,y)!;let delivered=false;document.body.addEventListener('drop',event=>{delivered=(event as DragEvent).dataTransfer?.files[0]?.name==='fixture.txt';},{once:true});
      return ['file','product'].map(kind=>{const data=new DataTransfer();if(kind==='file')data.items.add(new File(['file'],'fixture.txt',{type:'text/plain'}));else data.setData('application/x-note-calendar','entry');const event=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data,clientX:x,clientY:y});target.dispatchEvent(event);if(kind==='file'&&!delivered)throw new Error('File did not reach product handler');return event.defaultPrevented;});
    },at)).toEqual([true,false]);expect(await snapshot(page)).toBe(before);
  });

});
