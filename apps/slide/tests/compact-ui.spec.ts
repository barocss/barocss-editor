import { test, expect, type Page, type Locator, type TestInfo } from '@playwright/test';
import { openDeck, visibleBoxes, currentSlide, openFilmstrip, pickMenu } from './helpers';

const tools = (page: Page) => page.locator('[data-slides-formatting]');
const native = (page: Page) => page.evaluate(() => {
  const editor = (window as any).editor;
  return { document: JSON.stringify(editor.exportDocument()), selection: editor.selection, history: editor.getHistoryStats() };
});

test('keeps rulers hidden until requested without changing the native document or history', async ({ page }) => {
  await openDeck(page);
  await expect(page.locator('[data-ruler]')).toHaveCount(0);
  const before = await native(page);
  await pickMenu(page, 'view.panes.3');
  await expect(page.locator('[data-ruler="x"]')).toBeVisible();
  await expect(page.locator('[data-ruler="y"]')).toBeVisible();
  expect(await native(page)).toEqual(before);
  await pickMenu(page, 'view.panes.3');
  await expect(page.locator('[data-ruler]')).toHaveCount(0);
  expect(await native(page)).toEqual(before);
  await selectTitle(page);
  const selected = await native(page);
  const gap = () => page.evaluate(() => {
    const selection = getSelection();
    if (!selection?.rangeCount) throw new Error('Owned text range missing');
    const range = selection.getRangeAt(0).getBoundingClientRect();
    const surface = document.querySelector('[data-slides-formatting]')!.getBoundingClientRect();
    return Math.min(Math.abs(range.top - surface.bottom), Math.abs(surface.top - range.bottom));
  });
  await expect.poll(gap).toBeCloseTo(8, 0);
  for (let i = 0; i < 2; i++) {
    await pickMenu(page, 'view.panes.3');
    expect(await native(page)).toEqual(selected);
    // A document menu deliberately retires the floating text scope. A fresh real
    // selection admits its tools again at the ruler-adjusted document geometry.
    await expect(tools(page)).toHaveCount(0);
    await selectTitle(page);
    expect(await native(page)).toEqual(selected);
    await expect(tools(page)).toBeVisible();
    await expect.poll(gap).toBeCloseTo(8, 0);
  }
});
async function selectTitle(page: Page) {
  const [frame] = await visibleBoxes(page, '.sl-text-frame');
  expect(frame).toBeTruthy();
  await page.mouse.dblclick(frame.x, frame.y);
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.type)).toBe('range');
  await page.keyboard.press('Meta+ArrowLeft');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('One eng');
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.collapsed)).toBe(false);
  await expect.poll(() => page.evaluate(() => ({start:(window as any).editor.selection?.startOffset,end:(window as any).editor.selection?.endOffset}))).toEqual({start:0,end:7});
}
async function measure(surface: Locator, info: TestInfo, name: string) {
  await expect(surface).toBeVisible();
  await surface.evaluate(async node => { await Promise.all(node.getAnimations({subtree:true}).map(animation => animation.finished.catch(() => {}))); });
  const result = await surface.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const controls = Array.from(node.querySelectorAll<HTMLElement>('button,input,[role="combobox"]')).filter(control => control.getClientRects().length && control.getBoundingClientRect().width > 0 && !control.closest('[hidden]'));
    return { rect: rect.toJSON(), radius: getComputedStyle(node).borderRadius, shape:node.getAttribute('data-toolbar-shape'), scrollWidth:node.scrollWidth, clientWidth:node.clientWidth,
      controls: controls.map(control => { const box=control.getBoundingClientRect(), hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2); return {name:control.getAttribute('aria-label')??control.textContent,rect:box.toJSON(),hit:!!hit&&control.contains(hit)}; }) };
  });
  await info.attach(`${name}-geometry.json`, {body:JSON.stringify(result),contentType:'application/json'});
  expect(result.rect.height).toBeLessThanOrEqual(48); expect(result.rect.height).toBeGreaterThanOrEqual(40);
  expect(result.rect.width).toBeLessThanOrEqual(480); expect(result.radius).toBe(result.shape === 'pill' ? '999px' : '20px');
  expect(result.rect.x).toBeGreaterThanOrEqual(0); expect(result.rect.y).toBeGreaterThanOrEqual(0);
  const viewport=surface.page().viewportSize()!;
  expect(result.rect.right).toBeLessThanOrEqual(viewport.width); expect(result.rect.bottom).toBeLessThanOrEqual(viewport.height);
  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth+1);
  expect(result.controls.length).toBeGreaterThan(0);
  for (const control of result.controls) {
    expect(control.rect.width,control.name??'control').toBeGreaterThanOrEqual(32); expect(control.rect.height).toBeGreaterThanOrEqual(32);
    expect(control.hit,control.name??'control').toBe(true);
    expect(control.rect.x).toBeGreaterThanOrEqual(result.rect.x+11); expect(control.rect.right).toBeLessThanOrEqual(result.rect.right-11);
    expect(control.rect.y).toBeGreaterThanOrEqual(result.rect.y); expect(control.rect.bottom).toBeLessThanOrEqual(result.rect.bottom);
  }
  return result;
}

for (const [width,height] of [[1440,900],[1280,800]]) for (const theme of ['light','dark']) {
  test(`compact ${width} ${theme} deck has floating clusters, anchored selection and reserved folded navigation`, async ({page},info) => {
    await page.setViewportSize({width,height}); await openDeck(page);
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    const header=page.locator('.sl-topbar'); await expect(header).toHaveAttribute('data-compact','true');
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(56);
    // FilePick's clipped sr-only input is activated by the real document menu; measure visible targets.
    const headerHits=await header.evaluate(node=>Array.from(node.querySelectorAll<HTMLElement>('button,input,[role=menuitem]')).filter(control=>control.getClientRects().length && !control.matches('.sr-only') && !control.closest('[hidden],[inert]')).map(control=>{const box=control.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return{name:control.getAttribute('aria-label')??control.textContent,box:box.toJSON(),hit:!!hit&&control.contains(hit)};}));
    await info.attach('header-targets.json',{body:JSON.stringify(headerHits),contentType:'application/json'});
    for(const control of headerHits){expect(control.box.width,control.name??'header').toBeGreaterThanOrEqual(32);expect(control.box.height).toBeGreaterThanOrEqual(32);expect(control.hit,control.name??'header').toBe(true);expect(control.box.right).toBeLessThanOrEqual(width);}
    await expect(page.locator('#slides-objects')).toBeHidden(); await expect(tools(page)).toHaveCount(0);
    await measure(page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}),info,'insertion');
    await measure(page.getByRole('toolbar',{name:'Slides 보기 도구',exact:true}),info,'view');
    await measure(page.getByRole('toolbar',{name:'슬라이드 페이지 도구',exact:true}),info,'navigator');
    await expect(page.locator('[data-filmstrip-panel]')).toBeHidden();
    const initial=await native(page), sid=await currentSlide(page);
    await page.screenshot({path:info.outputPath('idle.png'),animations:'disabled'});
    await selectTitle(page); const selected=await native(page);
    await measure(tools(page),info,'text');
    const anchor=await page.evaluate(()=>{const rect=getSelection()!.getRangeAt(0).getBoundingClientRect();const bar=document.querySelector('[data-slides-formatting]')!.getBoundingClientRect();return{range:rect.toJSON(),bar:bar.toJSON()};});
    expect(anchor.bar.bottom<=anchor.range.top-7 || anchor.bar.top>=anchor.range.bottom+7).toBe(true);
    await page.screenshot({path:info.outputPath('selected.png'),animations:'disabled'});
    await tools(page).getByRole('button',{name:'선택 속성 열기',exact:true}).click();
    const more=page.locator('#slides-details');
    await expect(more).toBeVisible(); await expect(more).toHaveCSS('opacity','1');
    await expect(more.getByLabel('Size', {exact:true})).toBeVisible();
    await page.screenshot({path:info.outputPath('more.png'),animations:'disabled'});
    // Record the visible inner layer before dismissal; never retry an unexplained Escape.
    const tooltip = page.getByRole('tooltip');
    const tooltipOwned = await tooltip.isVisible();
    await page.keyboard.press('Escape');
    if (tooltipOwned) { await expect(tooltip).toHaveCount(0); await expect(more).toBeVisible(); await page.keyboard.press('Escape'); }
    await expect(more).toBeHidden(); await expect(tools(page).getByRole('button',{name:'선택 속성 열기',exact:true})).toBeFocused();
    expect(await native(page)).toEqual(selected);
    await page.keyboard.press('Escape'); await expect(tools(page)).toHaveCount(0);
    const foldedViewport = await page.locator('.sl-stage-viewport').boundingBox();
    await openFilmstrip(page);
    const region=await page.evaluate(()=>({viewport:document.querySelector('.sl-stage-viewport')!.getBoundingClientRect().toJSON(),panel:document.querySelector('[data-filmstrip-panel]')!.getBoundingClientRect().toJSON(),strip:document.querySelector('.sl-filmstrip')!.getBoundingClientRect().toJSON()}));
    await info.attach('expanded-regions.json',{body:JSON.stringify(region),contentType:'application/json'});
    // The owner-requested tray overlays the canvas without changing its geometry.
    expect(await page.locator('.sl-stage-viewport').boundingBox()).toEqual(foldedViewport);
    expect(region.panel.y).toBeGreaterThanOrEqual(region.viewport.y);
    expect(region.panel.y).toBeLessThan(region.viewport.bottom);
    expect(region.panel.right).toBeLessThanOrEqual(width); expect(region.panel.x).toBeGreaterThanOrEqual(0);
    await expect(page.locator('.sl-filmstrip')).toHaveCount(1); await expect(page.locator('.sl-filmstrip button')).toHaveCount(6);
    await expect(page.locator('.sl-thumb [data-bc-sid]').first()).toBeVisible();
    await page.screenshot({path:info.outputPath('expanded.png'),animations:'disabled'});
    await page.getByRole('button',{name:'슬라이드 탐색 접기',exact:true}).click();
    expect((await native(page)).document).toBe(initial.document); expect((await native(page)).history).toEqual(initial.history); expect(await currentSlide(page)).toBe(sid);
    for(const zoom of ['75%','100%','125%']) {
      const field=page.getByLabel('확대/축소',{exact:true}); await field.fill(zoom); await field.press('Enter'); await expect(field).toHaveValue(zoom);
      expect(await field.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
      await measure(page.getByRole('toolbar',{name:'Slides 보기 도구',exact:true}),info,`view-${zoom}`);
    }
    await pickMenu(page,'file.document.2');
  });
}

test('folded thumbnail navigation retains unfinished rename, current SID and exact native undo/reopen',async({page},info)=>{
  await openDeck(page); await openFilmstrip(page);
  const before=await native(page),sid=await currentSlide(page);
  const thumb=page.locator(`.sl-filmstrip button[data-slide="${sid}"]`);
  await thumb.dblclick();
  const field=page.getByRole('textbox',{name:'슬라이드 1 새 이름',exact:true});
  await field.fill(' Unaccepted rename ');
  await page.getByRole('button',{name:'슬라이드 탐색 접기',exact:true}).click();
  await expect(page.locator('[data-filmstrip-panel]')).toBeHidden();
  await expect(page.locator('[data-filmstrip-toggle]')).toBeFocused();
  expect(await native(page)).toEqual(before);
  await openFilmstrip(page); await expect(field).toHaveValue(' Unaccepted rename ');
  await field.press('Enter'); await expect(thumb).toHaveAttribute('aria-label','1 · Unaccepted rename');
  const renamed=(await native(page)).document;
  await page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'실행 취소',exact:true}).click();
  expect((await native(page)).document).toBe(before.document);
  await page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true}).getByRole('button',{name:'다시 실행',exact:true}).click();
  expect((await native(page)).document).toBe(renamed);
  const [download]=await Promise.all([page.waitForEvent('download'),pickMenu(page,'file.document.2')]);
  const path=info.outputPath('renamed.slides.json');await download.saveAs(path);
  page.on('dialog',dialog=>void dialog.accept());
  await page.getByLabel('슬라이드 파일',{exact:true}).setInputFiles(path);
  await expect(page.getByRole('complementary',{name:'파일 작업 상태'})).toContainText('파일 열기 완료');
  await openFilmstrip(page); await expect(page.locator('.sl-filmstrip-name').first()).toHaveText('Unaccepted rename');
});

test('More owns nested font picker Escape and current selection; revoked rename cannot write',async({page})=>{
  await openDeck(page);await selectTitle(page);const before=await native(page);
  const trigger=tools(page).getByRole('button',{name:'선택 속성 열기',exact:true});await trigger.click();
  const more=page.locator('#slides-details');
  const ownedSlide = await currentSlide(page);
  await more.getByRole('combobox',{name:'Size',exact:true}).click();await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('PageDown'); await expect(page.getByRole('listbox')).toBeVisible(); expect(await currentSlide(page)).toBe(ownedSlide); expect(await native(page)).toEqual(before);
  await page.keyboard.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);await expect(more).toBeVisible();
  expect(await native(page)).toEqual(before);
  await page.keyboard.press('Escape');await expect(more).toBeHidden();await expect(trigger).toBeFocused();
  expect(await native(page)).toEqual(before);
  await page.keyboard.press('Escape');await openFilmstrip(page);
  const current=await currentSlide(page);await page.locator(`.sl-filmstrip button[data-slide="${current}"]`).dblclick();
  await page.getByRole('textbox',{name:'슬라이드 1 새 이름',exact:true}).fill('Denied rename');
  const captured=(await native(page)).document;
  await page.evaluate(()=>(window as any).editor.setEditable(false));
  await expect(page.locator('.sl-filmstrip-rename input')).toHaveCount(0);
  await openFilmstrip(page);await page.locator('.sl-filmstrip button').nth(1).click();
  await expect(page.locator('.sl-filmstrip button[data-current="true"]')).toHaveAttribute('data-slide',(await page.locator('.sl-filmstrip button').nth(1).getAttribute('data-slide'))!);
  expect((await native(page)).document).toBe(captured);
});


test('canvas PageDown and PageUp retain deliberate slide navigation without a native write', async ({page}) => {
  await openDeck(page);
  await page.locator('.sl-stage-viewport').click({position:{x:5,y:5}});
  const before=await native(page), sid=await currentSlide(page);
  await page.keyboard.press('PageDown');
  await expect.poll(()=>currentSlide(page)).not.toBe(sid);
  await page.keyboard.press('PageUp');
  await expect.poll(()=>currentSlide(page)).toBe(sid);
  expect((await native(page)).document).toBe(before.document);
  expect((await native(page)).history).toEqual(before.history);
});


test('visible document Open menu activates the clipped native file input by keyboard', async ({page}) => {
  await openDeck(page); const before=await native(page);
  await page.getByRole('menuitem',{name:'덱 메뉴',exact:true}).click();
  const open=page.locator('[data-menu-item="file.document.1"]');
  await expect(open).toBeVisible(); await open.focus();
  const box=(await open.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(32); expect(box.height).toBeGreaterThanOrEqual(32);
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.keyboard.press('Enter')]);
  expect(await chooser.element().getAttribute('aria-label')).toBe('슬라이드 파일');
  expect(await chooser.element().getAttribute('class')).toMatch(/sr-only/);
  await chooser.setFiles([]);
  expect((await native(page)).document).toBe(before.document); expect((await native(page)).history).toEqual(before.history);
});
