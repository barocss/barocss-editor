import {test,expect,type Page,type Locator,type TestInfo} from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-site-save-status]')).toContainText('저장됨');
  await page.locator('[data-admin-open]').first().click();
  await expect(page.locator('[data-frame="desktop"] .st-page')).toBeVisible();
}
const native = (page: Page) => page.evaluate(() => {
  const editor=(window as any).editor;
  return {document:editor.exportDocument(),selection:editor.selection,history:editor.getHistoryStats()};
});
for(const [width,height] of [[1440,900],[1280,800]]) for(const theme of ['light','dark']) {
  test(`compact Site ${width} ${theme} keeps native content while chrome opens deliberately`,async ({page},info)=>{
    await page.setViewportSize({width,height});await ready(page);
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    const before=await native(page);
    await page.screenshot({path:info.outputPath('idle.png')});
    const header=page.locator('.st-documentbar');
    await expect(header).toHaveAttribute('data-compact','true');
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(56);
    const targets=await header.locator('button,[role="menuitem"],input').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&!n.closest('[hidden]')&&!n.classList.contains('sr-only')).map(n=>{
      const box=n.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
      return {name:n.getAttribute('aria-label')??n.textContent,box:box.toJSON(),hit:!!hit&&n.contains(hit)};
    }));
    await info.attach('header-targets.json',{body:JSON.stringify(targets),contentType:'application/json'});
    for(const target of targets) {
      expect(target.box.width,target.name??'target').toBeGreaterThanOrEqual(32);expect(target.box.height).toBeGreaterThanOrEqual(32);
      expect(target.hit,target.name??'target').toBe(true);
    }
    await expect(page.getByRole('toolbar',{name:'사이트 도구',exact:true})).toBeHidden();
    await expect(page.locator('.st-navigation-slot')).toBeHidden();
    await expect(page.locator('.st-detail-slot')).toBeHidden();
    await page.getByRole('button',{name:'모든 도구',exact:true}).click();
    await expect(page.getByRole('toolbar',{name:'사이트 도구',exact:true})).toBeVisible();
    expect(await native(page)).toEqual(before);
    await page.screenshot({path:info.outputPath('all-tools.png')});
    await page.keyboard.press('Escape');
    await expect(page.getByRole('toolbar',{name:'사이트 도구',exact:true})).toBeHidden();
    await expect(page.getByRole('button',{name:'모든 도구',exact:true})).toBeFocused();
    expect(await native(page)).toEqual(before);
    for(const [name,slot] of [['페이지 및 구조','.st-navigation-slot'],['자세한 속성','.st-detail-slot']]) {
      await page.getByRole('button',{name,exact:true}).click();await expect(page.locator(slot)).toBeVisible();
      expect(await native(page)).toEqual(before);
      await page.getByRole('button',{name,exact:true}).click();await expect(page.locator(slot)).toBeHidden();
      expect(await native(page)).toEqual(before);
    }
  });
}

async function measure(surface: Locator, info: TestInfo, label: string) {
  await expect(surface).toBeVisible();
  await surface.evaluate(async node => { await Promise.all(node.getAnimations({subtree:true}).map(animation => animation.finished.catch(() => {}))); });
  const result = await surface.evaluate(node => {
    const box = node.getBoundingClientRect();
    return {box:box.toJSON(), radius:getComputedStyle(node).borderRadius,
      controls:[...node.querySelectorAll<HTMLElement>('button,input,[role="combobox"]')].filter(one => one.getClientRects().length && !one.closest('[hidden]')).map(one => {
        const rect=one.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
        return {name:one.getAttribute('aria-label'),box:rect.toJSON(),hit:!!hit&&one.contains(hit)};
      })};
  });
  const anchor=await surface.page().evaluate(kind=>{
    if(kind==='text') return getSelection()?.getRangeAt(0).getBoundingClientRect().toJSON();
    const id=(window as any).editor.selection.nodeIds[0];
    return document.querySelector(`[data-frame="desktop"] [data-bc-sid="${CSS.escape(id)}"]`)?.getBoundingClientRect().toJSON();
  },label);
  expect(anchor).toBeTruthy();
  const verticalGap=Math.max(0,result.box.y-anchor!.bottom,anchor!.y-result.box.bottom);
  const horizontalGap=Math.max(0,result.box.x-anchor!.right,anchor!.x-result.box.right);
  expect(verticalGap).toBeLessThanOrEqual(20);expect(horizontalGap).toBe(0);
  await info.attach(label+'-anchor.json',{body:JSON.stringify({anchor,verticalGap,horizontalGap}),contentType:'application/json'});
  await info.attach(label+'-geometry.json' ,{body:JSON.stringify(result),contentType:'application/json'});
  expect(result.box.height).toBeGreaterThanOrEqual(40);expect(result.box.height).toBeLessThanOrEqual(48);
  expect(result.box.width).toBeLessThanOrEqual(480);expect(result.radius).toBe('20px');
  expect(result.box.x).toBeGreaterThanOrEqual(0);expect(result.box.y).toBeGreaterThanOrEqual(0);
  const viewport=surface.page().viewportSize()!;
  expect(result.box.right).toBeLessThanOrEqual(viewport.width);expect(result.box.bottom).toBeLessThanOrEqual(viewport.height);
  for(const control of result.controls) {
    expect(control.box.width,control.name??'control').toBeGreaterThanOrEqual(32);expect(control.box.height).toBeGreaterThanOrEqual(32);
    expect(control.hit,control.name??'control').toBe(true);
    expect(control.box.x).toBeGreaterThanOrEqual(result.box.x+11);expect(control.box.right).toBeLessThanOrEqual(result.box.right-11);
  }
}
async function search(page: Page, command: string) {
  await page.getByRole('button',{name:'명령 검색',exact:true}).click();
  const input=page.getByRole('combobox',{name:'명령 검색어'});await input.fill(command);await input.press('Enter');
  await expect(input).toHaveCount(0);
}
async function textRange(page: Page) {
  const heading=page.locator('[data-frame="desktop"] .st-page h1').first();
  const box=(await heading.boundingBox())!;
  await page.keyboard.down('Meta');await page.mouse.click(box.x+60,box.y+box.height/2);await page.keyboard.up('Meta');
  await page.mouse.dblclick(box.x+60,box.y+box.height/2);
  await expect.poll(()=>page.evaluate(()=>(window as any).editor.selection?.type)).toBe('range');
  await page.keyboard.press('Meta+ArrowLeft');
  for(let i=0;i<3;i++) await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(()=>page.evaluate(()=>(window as any).editor.selection?.collapsed)).toBe(false);
  return heading;
}
for(const [width,height] of [[1440,900],[1280,800]]) for(const theme of ['light','dark']) {
  test(`Site objects ${width} ${theme} own one board and duplicate with exact native undo`,async ({page},info)=>{
    await page.setViewportSize({width,height});await ready(page);
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    const picture=page.locator('[data-frame="desktop"] img.st-picture[alt="문서와 덱과 페이지가 한 화면에 놓인 그림"]');
    const pictureBox=(await picture.boundingBox())!;
    await page.keyboard.down('Meta');await page.mouse.click(pictureBox.x+10,pictureBox.y+10);await page.keyboard.up('Meta');
    await info.attach('object-owner.json',{body:JSON.stringify(await page.evaluate(()=>{
      const editor=(window as any).editor;return {selection:editor.selection,root:editor.getRootId(),editable:editor.isEditable,
        nodes:[...document.querySelectorAll('[data-frame="desktop"] [data-bc-sid]')].map(element=>element.getAttribute('data-bc-sid'))};
    })),contentType:'application/json'});
    const tools=page.locator('[data-site-selection-chrome="object"]');await expect(tools).toHaveCount(1);
    await measure(tools,info,'object');await contrast(tools,info,'object');
    const before=await native(page);
    await tools.getByRole('button',{name:'객체 도구 더 보기',exact:true}).click();
    await expect(page.getByRole('menu',{name:'추가 객체 도구',exact:true})).toBeVisible();await contrast(page.getByRole('menu',{name:'추가 객체 도구',exact:true}),info,'object-more');
    expect(await native(page)).toEqual(before);
    await page.screenshot({path:info.outputPath('object-more.png')});
    await page.keyboard.press('Escape');await expect(tools).toBeVisible();expect(await native(page)).toEqual(before);
    await tools.locator('[data-site-object-control="duplicateBlocks"]').click();
    await expect.poll(async()=> (await native(page)).document).not.toEqual(before.document);
    await search(page,'실행 취소');await expect.poll(async()=> (await native(page)).document).toEqual(before.document);
    await page.locator('.st-preview-toggle').click();await expect(tools).toHaveCount(0);
    const preview=await native(page);expect(preview.document).toEqual(before.document);
    await page.keyboard.press('Escape');expect((await native(page)).document).toEqual(before.document);
  });
  test(`Site text ${width} ${theme} keeps selection through More and actual formatting`,async ({page},info)=>{
    await page.setViewportSize({width,height});await ready(page);
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    const heading=await textRange(page);
    const tools=page.locator('[data-site-selection-chrome="text"]');await measure(tools,info,'text');await contrast(tools,info,'text');
    const before=await native(page);
    await tools.getByRole('button',{name:'글 서식 더 보기',exact:true}).click();
    const more=page.getByRole('menu',{name:'추가 글 서식',exact:true});await expect(more).toBeVisible();await contrast(more,info,'text-more');
    expect(await native(page)).toEqual(before);await page.screenshot({path:info.outputPath('text-more.png')});
    await page.keyboard.press('Escape');await expect(tools).toBeVisible();expect(await native(page)).toEqual(before);
    await tools.locator('[data-site-text-control="toggleBold"]').click();
    await expect(heading.locator('.mark-bold')).not.toHaveCount(0);
    const formatted=await native(page);expect(formatted.document).not.toEqual(before.document);
    await search(page,'실행 취소');await expect.poll(async()=> (await native(page)).document).toEqual(before.document);
    await search(page,'다시 실행');await expect.poll(async()=> (await native(page)).document).toEqual(formatted.document);
  });
  test(`Site marked text ${width} ${theme} preserves full native secondary-format undo and redo`,async ({page},info)=>{
    await page.setViewportSize({width,height});await ready(page);
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    const heading=await textRange(page);
    const tools=page.locator('[data-site-selection-chrome="text"]');await measure(tools,info,'text');await contrast(tools,info,'text');
    await tools.locator('[data-site-text-control="toggleBold"]').click();
    await expect(heading.locator('.mark-bold')).not.toHaveCount(0);
    const before=await native(page);
    await tools.getByRole('button',{name:'글 서식 더 보기',exact:true}).click();
    const more=page.getByRole('menu',{name:'추가 글 서식',exact:true});await expect(more).toBeVisible();await contrast(more,info,'text-more');
    expect(await native(page)).toEqual(before);await page.screenshot({path:info.outputPath('text-more.png')});
    await page.keyboard.press('Escape');await expect(tools).toBeVisible();expect(await native(page)).toEqual(before);
    await tools.getByRole('button',{name:'글 서식 더 보기',exact:true}).click();
    await more.locator('[data-site-text-control="toggleUnderline"]').click();
    await expect(heading.locator('.mark-underline')).not.toHaveCount(0);
    const formatted=await native(page);expect(formatted.document).not.toEqual(before.document);
    await search(page,'실행 취소');await expect.poll(async()=> (await native(page)).document).toEqual(before.document);
    await search(page,'다시 실행');await expect.poll(async()=> (await native(page)).document).toEqual(formatted.document);
  });
}

test('Site detail folding preserves an unaccepted field draft without changing native history',async ({page})=>{
  await ready(page);
  const picture=page.locator('[data-frame="desktop"] img.st-picture[alt="문서와 덱과 페이지가 한 화면에 놓인 그림"]');
  const box=(await picture.boundingBox())!;
  await page.keyboard.down('Meta');await page.mouse.click(box.x+10,box.y+10);await page.keyboard.up('Meta');
  const detail=page.getByRole('button',{name:'자세한 속성',exact:true});await detail.click();
  const panel=page.locator('.office-properties');await panel.getByRole('tab',{name:'모양',exact:true}).click();
  const input=panel.getByRole('spinbutton',{name:'기울기',exact:true});
  const before=await native(page);await input.fill('12');expect(await native(page)).toEqual(before);
  await detail.click();await expect(page.locator('.st-detail-slot')).toBeHidden();expect(await native(page)).toEqual(before);
  await detail.click();await expect(input).toHaveValue('12');expect(await native(page)).toEqual(before);
  await input.press('Escape');expect(await native(page)).toEqual(before);
});

async function contrast(surface: Locator,info: TestInfo,label: string) {
  await surface.evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});
  const samples=await surface.evaluate(node=>{
    const luminance=(color:string)=>{
      const numbers=(color.match(/[\d.]+/g)??[]).map(Number),scale=color.startsWith('color(')?1:255;
      const linear=(v:number)=>{const c=v/scale;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4;};
      return .2126*linear(numbers[0])+.7152*linear(numbers[1])+.0722*linear(numbers[2]);
    };
    const ground=(el:Element)=>{
      let current:Element|null=el;
      while(current){const bg=getComputedStyle(current).backgroundColor;
        if(bg&&!bg.includes('rgba(0, 0, 0, 0)'))return bg;current=current.parentElement;}
      return 'rgb(255,255,255)';
    };
    return [...node.querySelectorAll<HTMLElement>('button,[role="menuitem"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]')&&!el.matches(':disabled,[aria-disabled="true"]')).map(el=>{
      const ink=getComputedStyle(el).color,bg=ground(el),a=luminance(ink)+.05,b=luminance(bg)+.05;
      return {name:el.getAttribute('aria-label')??el.textContent,ink,bg,ratio:Math.max(a,b)/Math.min(a,b)};
    });
  });
  expect(samples.length).toBeGreaterThan(0);for(const sample of samples)expect(sample.ratio,sample.name??'control').toBeGreaterThanOrEqual(4.5);
  await info.attach(label+'-contrast.json',{body:JSON.stringify(samples),contentType:'application/json'});
}

test('Site real complete-tools link draft survives layered Escape without a native edit',async ({page})=>{
  await ready(page);await textRange(page);
  const before=await native(page),tools=page.locator('[data-site-selection-chrome="text"]');
  await tools.getByRole('button',{name:'글 서식 더 보기',exact:true}).click();
  await page.getByRole('menuitem',{name:'링크 및 삽입 도구',exact:true}).click();
  await expect(page.getByRole('toolbar',{name:'사이트 도구',exact:true})).toBeVisible();
  const address=page.locator('.st-link-address');await address.fill('https://example.test/unaccepted');
  expect(await native(page)).toEqual(before);
  await page.getByRole('button',{name:'모든 도구',exact:true}).click();
  await expect(page.getByRole('toolbar',{name:'사이트 도구',exact:true})).toBeHidden();expect(await native(page)).toEqual(before);
  await page.getByRole('button',{name:'모든 도구',exact:true}).click();await expect(address).toHaveValue('https://example.test/unaccepted');
  await address.focus();
  await page.keyboard.press('Escape');
  // The committed field first cancels its own draft; a second Escape closes its containing tools.
  expect(await native(page)).toEqual(before);await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar',{name:'사이트 도구',exact:true})).toBeHidden();expect(await native(page)).toEqual(before);
  await page.getByRole('button',{name:'모든 도구',exact:true}).click();await expect(address).toHaveValue('');
  expect(await native(page)).toEqual(before);
});

test('a narrow desktop uses the same panel owners without shrinking its editing canvas',async ({page})=>{
  await page.setViewportSize({width:920,height:900});await ready(page);
  const workspace=page.locator('.st-body');await expect(workspace).toHaveAttribute('data-compact','true');
  const before=await native(page),canvas=page.locator('.st-canvas');const area=await canvas.boundingBox();
  await workspace.getByRole('button',{name:'탐색',exact:true}).click();await expect(page.locator('.st-navigation-slot')).toBeVisible();
  expect(await canvas.boundingBox()).toEqual(area);expect(await native(page)).toEqual(before);
  await workspace.getByRole('button',{name:'속성',exact:true}).click();await expect(page.locator('.st-detail-slot')).toBeVisible();
  await expect(page.locator('.st-navigation-slot')).toBeHidden();expect(await canvas.boundingBox()).toEqual(area);expect(await native(page)).toEqual(before);
  await page.keyboard.press('Escape');await expect(page.locator('.st-detail-slot')).toBeHidden();
  await page.getByRole('button',{name:'페이지 및 구조',exact:true}).click();await expect(page.locator('.st-navigation-slot')).toBeVisible();
  await page.getByRole('button',{name:'자세한 속성',exact:true}).click();await expect(page.locator('.st-detail-slot')).toBeVisible();
  await expect(page.locator('.st-navigation-slot')).toBeHidden();expect(await canvas.boundingBox()).toEqual(area);expect(await native(page)).toEqual(before);
});
