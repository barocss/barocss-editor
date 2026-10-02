import { readFileSync, writeFileSync } from 'node:fs';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import type { Editor } from '@barocss/editor-core';
import { createSampleDeck } from '../../../packages/office-slides/src/sample-deck';
import { deckFileText } from '../../../packages/office-slides/src/deck-file';
import type { INode } from '../../../packages/datastore/src/types';
import { openDeck, currentSlide, visibleBoxes, pickMenu, openFilmstrip } from './helpers';

test.use({ actionTimeout: 10000 });

const tools = (page: Page) => page.locator('[data-slides-formatting]');
const native = (page: Page) => page.evaluate(() => {
  const editor = (window as any).editor;
  return { document: JSON.stringify(editor.exportDocument()), history: editor.getHistoryStats() };
});
async function openRepresentative(page: Page, info: TestInfo, richNotes = false) {
  await openDeck(page);
  const document = createSampleDeck();
  const slides = document.content!.filter((node): node is INode => typeof node !== 'string' && node.stype === 'surface');
  slides[2].content!.push(
    { stype: 'rectangle', attributes: { objectId: '427-rectangle', name: '427 independent rectangle', x: 1500, y: 9300, width: 2800, height: 1000, fill: '#2563eb' } },
    { stype: 'ellipse', attributes: { objectId: '427-ellipse', name: '427 independent ellipse', x: 8000, y: 9300, width: 2800, height: 1000, fill: '#f59e0b' } },
    { stype: 'connector', attributes: { objectId: '427-line', startObjectId: '427-rectangle', endObjectId: '427-ellipse', startSide: 'e', endSide: 'w', kind: 'elbow', startX: 4300, startY: 9800, endX: 8000, endY: 9800 } }
  );
  if (richNotes) {
    const resources = document.content!.find((node):node is INode=>typeof node !== 'string' && node.stype === 'resources')!;
    const note = resources.content!.find((node):node is INode=>typeof node !== 'string' && node.stype === 'surfaceNote')!;
    note.content!.push({stype:'bTable',attributes:{},content:[{stype:'bTableBody',content:[{stype:'bTableRow',attributes:{},content:[{stype:'bTableCell',attributes:{},content:[{stype:'paragraph',content:[{stype:'inline-text',text:'Nested note cell',marks:[{stype:'bold',range:[0,6]}]}]}]}]}]}]});
    (note.content![0] as INode).content![0] = {stype:'inline-text',text:'The point of this slide is that nothing on it is new.',marks:[{stype:'bold',range:[0,2]}]};
  }
  const path = info.outputPath('representative.slides.json');
  writeFileSync(path, deckFileText(document, '2026-10-01T00:00:00.000Z'));
  page.on('dialog', dialog => void dialog.accept());
  await page.getByLabel('슬라이드 파일', { exact: true }).setInputFiles(path);
  await expect(page.getByRole('complementary', { name: '파일 작업 상태' })).toContainText('파일 열기 완료');
  return path;
}
async function selectTitle(page: Page) {
  const [frame] = await visibleBoxes(page, '.sl-text-frame');
  expect(frame).toBeTruthy();
  await page.mouse.dblclick(frame.x, frame.y);
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.type)).toBe('range');
  await page.keyboard.press('Meta+ArrowLeft');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('One eng');
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.collapsed)).toBe(false);
}
async function reachableTools(page: Page) {
  const bar = tools(page);
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-label', '선택한 Slides 도구');
  // Measure surface and children in one layout frame. Scroll repositions the fixed surface asynchronously.
  await expect.poll(() => bar.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const controls = Array.from(node.querySelectorAll('button,input,[role="combobox"]')).filter(one => {
      const r = one.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    });
    const first = controls[0]; const r = first?.getBoundingClientRect();
    const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
    return {
      viewport: bounds.x >= 0 && bounds.y >= 0 && bounds.right <= 1441 && bounds.bottom <= 901,
      controls: controls.length > 0,
      contained: controls.every(one => {const child = one.getBoundingClientRect(); return child.y >= bounds.y - 1 && child.bottom <= bounds.bottom + 1;}),
      reachable: !!first && !!hit && (first.contains(hit) || hit.contains(first))
    };
  })).toEqual({viewport:true,controls:true,contained:true,reachable:true});
}

for (const theme of ['light', 'dark']) test(`continuous ${theme} deck has reachable owned text tools and on-demand detail without native loss`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRepresentative(page, info);
  await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
  const before = await native(page), active = await currentSlide(page);
  const [initialDownload] = await Promise.all([page.waitForEvent('download'), pickMenu(page, 'file.document.2')]);
  const initialPath = info.outputPath('native-before.slides.json'); await initialDownload.saveAs(initialPath);
  const initialPortable = JSON.parse(readFileSync(initialPath, 'utf8'));

  const detail = page.locator('.sl-topbar').getByRole('button', { name: '속성', exact: true });
  await expect(page.locator('.sl-topbar').getByRole('button', { name: '편집 도구', exact: true })).toHaveCount(0);
  await expect(detail).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('complementary', { name: '속성', exact: true })).toBeHidden();
  await expect(tools(page)).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`${theme}-idle.png`), animations: 'disabled' });
  await selectTitle(page); await reachableTools(page);
  await page.screenshot({ path: info.outputPath(`${theme}-text-selected.png`), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(tools(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement)?.isContentEditable)).toBe(true);
  await page.screenshot({ path: info.outputPath(`${theme}-dismissed.png`), animations: 'disabled' });
  await selectTitle(page); await reachableTools(page);
  await detail.press('Enter');
  await expect(detail).toHaveAttribute('aria-expanded', 'true');
  const right = page.getByRole('complementary', { name: '속성', exact: true });
  await expect(right.getByRole('tablist', { name: '속성 탭' })).toBeVisible();
  await expect(right.getByLabel('단위', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`${theme}-inspector.png`), animations: 'disabled' });
  await detail.press('Enter'); await expect(right).toBeHidden();
  await page.getByRole('button', { name: '추가 Slides 도구', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Slides 삽입 및 슬라이드 메뉴', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Slides 삽입 및 슬라이드 메뉴', exact: true })).toBeHidden();
  await pickMenu(page, 'view.present.0');
  await expect(page.locator('.sl-present-hint')).toBeVisible();
  await page.screenshot({ path: info.outputPath(`${theme}-presentation.png`), animations: 'disabled' });
  await page.keyboard.press('Escape'); await expect(page.locator('.sl-present-hint')).toHaveCount(0);
  expect(await currentSlide(page)).toBe(active);
  expect(await native(page)).toEqual(before);
  writeFileSync(info.outputPath('native-after.json'), (await native(page)).document);
  const [download] = await Promise.all([page.waitForEvent('download'), pickMenu(page, 'file.document.2')]);
  const exported = info.outputPath('native-export.slides.json'); await download.saveAs(exported);
  expect(JSON.parse(readFileSync(exported, 'utf8')).document).toEqual(initialPortable.document);
});

async function captureBothThemes(page: Page, info: TestInfo, name: string) {
  const before = await native(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await expect.poll(() => tools(page).evaluate(node => {
      const css = getComputedStyle(node);
      const probe = document.createElement('span'); probe.style.color = css.getPropertyValue('--ou-ink'); node.append(probe);
      const expected = getComputedStyle(probe).color; probe.remove(); return css.color === expected;
    })).toBe(true);
    await reachableTools(page);
    await page.screenshot({path: info.outputPath(`${theme}-${name}.png`), animations:'disabled'});
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  expect(await native(page)).toEqual(before);
}

async function independentObjects(page: Page) {
  await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(2).click();
  // Fold the overlay tray before selecting the objects beneath it.
  await page.getByRole('button', { name: '슬라이드 탐색 접기', exact: true }).click();
  const ids = await page.evaluate(() => {
    const editor = (window as any).editor, nodes: any[] = [];
    const walk = (sid: string) => { const node = editor.dataStore.getNode(sid); nodes.push(node); for (const child of node.content ?? []) walk(child); };
    walk(editor.getRootId());
    return ['427 independent rectangle', '427 independent ellipse'].map(name => nodes.find(node => node.attributes?.name === name).sid);
  });
  const boxes = await visibleBoxes(page, '.sl-shape');
  const actual = ids.map((sid: string) => boxes.find(box => box.sid === sid)!);
  expect(actual.every(Boolean)).toBe(true);
  return { ids: ids as string[], boxes: actual };
}

test('single and multiple object tools arrange the owned targets, retain native undo, and fit the viewport', async ({ page }, info) => {
  await openRepresentative(page, info);
  const { ids, boxes } = await independentObjects(page);
  await page.evaluate(() => { (window as any).__objectEvents=[]; for(const name of ['pointerdown','mousedown','focusin']) document.addEventListener(name,event=>{ const target=event.target as Element; (window as any).__objectEvents.push({name,target:target?.className,path:event.composedPath().filter(one=>one instanceof Element).map(one=>(one as Element).className),inMain:!!target?.closest('.sl-main'),canvasAncestor:!!target?.closest('.sl-stage,.sl-overlay')}); },true); });
  await page.mouse.click(boxes[0].x, boxes[0].y);
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds)).toEqual([ids[0]]);
  writeFileSync(info.outputPath('actual-object-owner.json'), JSON.stringify(await page.evaluate(() => {
    const rect=(selector:string)=>{const element=document.querySelector(selector);return element?element.getBoundingClientRect().toJSON():null};
    const e=(window as any).editor;return {events:(window as any).__objectEvents,selection:e.selection,editable:e.isEditable,active:document.activeElement?.outerHTML.slice(0,500),region:document.activeElement?.closest('.sl-main,.sl-sidebar')?.className,
      target:e.dataStore.getNode(e.selection?.nodeIds?.[0]),stage:rect('.sl-stage'),main:rect('.sl-main'),overlay:rect('.sl-overlay'),tool:document.querySelector('[data-slides-formatting]')?.outerHTML??null};
  }),null,2));
  await reachableTools(page);
  await captureBothThemes(page, info, 'single-object');
  await page.keyboard.down('Shift'); await page.mouse.click(boxes[1].x, boxes[1].y); await page.keyboard.up('Shift');
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds?.length)).toBe(2);
  await reachableTools(page);
  const before = await native(page);
  const original = await page.evaluate(targets => targets.map(id => (window as any).editor.dataStore.getNode(id).attributes), ids);
  await captureBothThemes(page, info, 'multi-object');
  const moreTrigger = tools(page).getByRole('button', { name: '선택 속성 열기', exact: true });
  await moreTrigger.click();
  const morePanel = page.locator('#slides-details');
  await morePanel.getByRole('button', { name: '왼쪽 정렬', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  expect(await native(page)).toEqual(before);
  const focusedTooltip = page.getByRole('tooltip');
  await expect(focusedTooltip).toBeVisible();
  await info.attach('object-more-inner-layer.json', { body: JSON.stringify({ tooltip: await focusedTooltip.textContent(), focus: await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) }), contentType: 'application/json' });
  await page.keyboard.press('Escape'); await expect(focusedTooltip).toHaveCount(0); await expect(morePanel).toBeVisible();
  expect(await native(page)).toEqual(before);
  await page.keyboard.press('Escape'); await expect(morePanel).toBeHidden(); await expect(moreTrigger).toBeFocused();
  expect(await native(page)).toEqual(before);
  await tools(page).getByRole('button', { name: '선택 속성 열기', exact: true }).click();
  await page.getByRole('complementary', { name: '속성', exact: true }).getByRole('button', { name: '왼쪽 정렬', exact: true }).click();
  await expect.poll(() => page.evaluate(targets => targets.map(id => (window as any).editor.dataStore.getNode(id).attributes.x), ids)).toEqual([1500, 1500]);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => page.evaluate(targets => targets.map(id => (window as any).editor.dataStore.getNode(id).attributes), ids)).toEqual(original);
  expect((await native(page)).document).toBe(before.document);
  await page.keyboard.press('Meta+Shift+z');
  await expect.poll(() => page.evaluate(targets => targets.map(id => (window as any).editor.dataStore.getNode(id).attributes.x), ids)).toEqual([1500, 1500]);
  const searchBefore = await native(page);
  await page.getByRole('button', { name: '명령 검색', exact: true }).click();
  await page.getByRole('combobox', { name: '명령 검색어', exact: true }).fill('복제');
  await page.getByRole('option', { name: /^복제(?:\s|$)/ }).click();
  await expect(page.getByRole('dialog', { name: '명령 검색', exact: true })).toHaveCount(0);
  await expect.poll(async () => (await native(page)).history.currentIndex).toBe(searchBefore.history.currentIndex + 1);
  await page.keyboard.press('Meta+z');
  expect((await native(page)).document).toBe(searchBefore.document);
});

test('table caret tools edit the current row and whole native undo preserves connectors and resources', async ({ page }, info) => {
  await openRepresentative(page, info);
  await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(3).click();
  const cell = page.locator('.sl-stage td:visible').first(), box = (await cell.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => (window as any).editor.selection?.type)).toBe('range');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  writeFileSync(info.outputPath('actual-table-owner.json'), JSON.stringify(await page.evaluate(() => {
    const e = (window as any).editor, chain: unknown[] = []; let n = e.dataStore.getNode(e.selection?.startNodeId);
    while (n) { chain.push({ sid: n.sid, stype: n.stype }); n = n.parentId ? e.dataStore.getNode(n.parentId) : undefined; }
    return { selection: e.selection, chain, tools: document.querySelector('[data-slides-formatting]')?.outerHTML };
  }), null, 2));
  await reachableTools(page);
  const before = await native(page), rows = await page.locator('.sl-stage tr:visible').count();
  await captureBothThemes(page, info, 'table-cell');
  await tools(page).getByRole('button', { name: '아래에 행 삽입', exact: true }).click();
  await expect(page.locator('.sl-stage tr:visible')).toHaveCount(rows + 1);
  await page.keyboard.press('Meta+z'); await expect(page.locator('.sl-stage tr:visible')).toHaveCount(rows);
  expect((await native(page)).document).toBe(before.document);
  await page.keyboard.press('Meta+Shift+z'); await expect(page.locator('.sl-stage tr:visible')).toHaveCount(rows + 1);
});

test('on-demand navigation, units and timeline retain target and native content', async ({ page }, info) => {
  await openRepresentative(page, info);
  const { ids, boxes } = await independentObjects(page);
  await page.mouse.click(boxes[0].x, boxes[0].y);
  const before = await native(page), active = await currentSlide(page);
  await page.locator('.sl-topbar').getByRole('button', { name: '속성', exact: true }).click();
  const left = page.getByRole('complementary', { name: '슬라이드 탐색', exact: true });
  const tabs = left.getByRole('tablist', { name: '탐색 방식' });
  await page.getByRole('button', { name: '레이어', exact: true }).click();
  await tabs.getByRole('tab', { name: '레이어', exact: true }).focus();
  await page.keyboard.press('ArrowRight'); await expect(tabs.getByRole('tab', { name: '컴포넌트', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home'); await expect(tabs.getByRole('tab', { name: '레이어', exact: true })).toHaveAttribute('aria-selected', 'true');
  const right = page.getByRole('complementary', { name: '속성', exact: true });
  const unit = right.getByLabel('단위', { exact: true });
  await unit.selectOption('in'); await expect(right.getByRole('spinbutton', { name: '너비', exact: true })).toHaveValue('1.94');
  await unit.selectOption('cm');
  const style = right.getByRole('tab', { name: '속성', exact: true }), motion = right.getByRole('tab', { name: '모션', exact: true });
  await style.focus(); await style.press('ArrowRight'); await expect(motion).toHaveAttribute('aria-selected', 'true');
  await motion.press('ArrowLeft'); await expect(style).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '타임라인 펼치기', exact: true }).click();
  await page.getByRole('button', { name: '타임라인 접기', exact: true }).click();
  expect(await currentSlide(page)).toBe(active);
  expect(await page.evaluate(() => (window as any).editor.selection?.nodeIds)).toEqual([ids[0]]);
  expect(await native(page)).toEqual(before);
});

test('fresh compact insertion still runs after a header menu is dismissed without a native revision', async ({ page }, info) => {
  await openRepresentative(page, info);
  const before = await native(page), active = await currentSlide(page);
  await page.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click(); await page.keyboard.press('Escape');
  expect(await native(page)).toEqual(before);
  const count = () => page.evaluate(id => (window as any).editor.dataStore.getNode(id).content.length, active);
  const original = await count();
  await page.getByRole('toolbar', { name: 'Slides 삽입 도구', exact: true }).getByRole('button', { name: '사각형', exact: true }).click();
  await expect.poll(count).toBe(original + 1);
  await page.keyboard.press('Meta+z'); await expect.poll(count).toBe(original);
  expect((await native(page)).document).toBe(before.document);
});

test('document menu survives identical selection reports and retires actual owner changes', async ({ page }, info) => {
  await openRepresentative(page, info);
  const [initialDownload] = await Promise.all([
    page.waitForEvent('download'), pickMenu(page, 'file.document.2')
  ]);
  const initialPath = info.outputPath('menu-before.slides.json');
  await initialDownload.saveAs(initialPath);
  const initialPortable = JSON.parse(readFileSync(initialPath, 'utf8'));
  await selectTitle(page);
  const trigger = page.getByRole('menuitem', { name: '문서 메뉴', exact: true });
  const menu = page.getByRole('menu', { name: '문서 메뉴', exact: true });
  const before = await native(page);
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as Window & { editor: Editor }).editor;
    editor.updateSelection({ selection: structuredClone(editor.selection), applySelectionToView: false });
  });
  await expect(menu).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    menu.locator('[data-menu-item="file.document.2"]').click()
  ]);
  const path = info.outputPath('identical-selection.slides.json');
  await download.saveAs(path);
  expect(JSON.parse(readFileSync(path, 'utf8')).document).toEqual(initialPortable.document);
  expect(await native(page)).toEqual(before);

  for (const change of ['selection', 'authority', 'content', 'root'] as const) {
    await trigger.click();
    await expect(menu).toBeVisible();
    await page.evaluate(async kind => {
      const editor = (window as unknown as Window & { editor: Editor }).editor;
      if (kind === 'selection') {
        const original = structuredClone(editor.selection);
        editor.updateSelection(null); editor.updateSelection(original);
      } else if (kind === 'authority') {
        editor.setEditable(false); editor.setEditable(true);
      } else if (kind === 'content') {
        const slide = [...editor.dataStore.getNodes().values()].find(node => node.stype === 'surface');
        if (!slide?.sid) throw new Error('Native slide is missing');
        if (!await editor.run('setSlideInfo', { slideId: slide.sid, name: 'Changed while the menu was open' })) throw new Error('Native slide rename was refused');
      } else {
        const session = editor.dataStore.getSessionId();
        if (typeof session !== 'string') throw new Error('Native slide session must be a string');
        editor.loadDocument(editor.exportDocument(), session);
      }
    }, change);
    await expect(menu).toHaveCount(0);
  }
});

test('rich notes are an owned second view and font popup retirement cannot target a different slide', async ({ page }, info) => {
  await openRepresentative(page, info, true); await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(1).click();
  await page.getByRole('button', { name: '발표자 노트', exact: true }).click();
  const notes = page.locator('.sl-notes-host'), paragraph = notes.getByText('The point of this slide is that nothing on it is new.', { exact: true }).first();
  await paragraph.click(); await page.keyboard.press('Meta+ArrowLeft');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('The poi');
  await reachableTools(page);
  const before = await native(page);
  await tools(page).locator('.sl-toolbar-font-family').click();
  await expect(page.getByRole('listbox')).toBeVisible();
  // The anchored list can overlap a thumbnail. Use a visible point outside the list, then navigate.
  const outside = (await page.locator('.sl-topbar [data-document-identity]').boundingBox())!;
  await page.mouse.click(outside.x + outside.width / 2, outside.y + outside.height / 2);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(0).click();
  await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(1).click();
  expect(await native(page)).toEqual(before);
  await paragraph.click(); await page.keyboard.press('Meta+ArrowLeft');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('The poi');
  writeFileSync(info.outputPath('notes-reselection-owner.json'),JSON.stringify(await page.evaluate(()=>{const e=(window as any).editor,s=getSelection();return{selection:e.selection,root:e.getRootId(),editable:e.isEditable,active:document.activeElement?.outerHTML.slice(0,600),dom:{text:s?.toString(),anchor:s?.anchorNode?.parentElement?.outerHTML.slice(0,350),focus:s?.focusNode?.parentElement?.outerHTML.slice(0,350)},current:document.querySelector('.sl-filmstrip [data-current]')?.getAttribute('data-slide'),notes:document.querySelector('.sl-notes-host')?.outerHTML.slice(0,1000),tools:document.querySelector('[data-slides-formatting]')?.outerHTML??null};}),null,2));
  await expect.poll(()=>page.evaluate(()=>(window as any).editor.selection?.collapsed)).toBe(false);
  writeFileSync(info.outputPath('notes-reselection-settled.json'),JSON.stringify(await page.evaluate(()=>{const e=(window as any).editor,s=getSelection();return{selection:e.selection,range:s?.rangeCount?s.getRangeAt(0).getBoundingClientRect().toJSON():null,active:document.activeElement?.outerHTML.slice(0,400),parents:Array.from(document.querySelectorAll('.sl-main,.sl-notes,.sl-notes-host')).map(el=>({className:el.className,rect:el.getBoundingClientRect().toJSON(),scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,overflow:getComputedStyle(el).overflow}))};}),null,2));
  await page.screenshot({path:info.outputPath('notes-reselection.png'),animations:'disabled'});
  await reachableTools(page); await tools(page).locator('.sl-toolbar-font-family').click();
  await page.getByRole('option', { name: 'Arial', exact: true }).click();
  await expect.poll(async()=> (await notes.locator('.mark-fontFamily').allTextContents()).join('')).toBe('The poi');
  for(const run of await notes.locator('.mark-fontFamily').all()) await expect(run).toHaveCSS('font-family',/Arial/);
  await page.keyboard.press('Escape'); await expect(tools(page)).toHaveCount(0);
  await page.keyboard.press('Meta+z');
  expect((await native(page)).document).toBe(before.document);
  await paragraph.click(); await page.keyboard.press('Meta+ArrowRight'); await page.keyboard.insertText(' LATEST NOTE INPUT');
  await expect(notes).toContainText('LATEST NOTE INPUT');
  const draft = await native(page);
  const [download] = await Promise.all([page.waitForEvent('download'), pickMenu(page, 'file.document.2')]);
  const path = info.outputPath('latest-notes.slides.json'); await download.saveAs(path);
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  expect(JSON.stringify(saved.document)).toContain('LATEST NOTE INPUT');
  await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(0).click(); await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(1).click();
  expect((await native(page)).document).toBe(draft.document);
  await page.getByLabel('슬라이드 파일', { exact: true }).setInputFiles(path);
  await expect(page.getByRole('complementary', { name: '파일 작업 상태' })).toContainText('파일 열기 완료');
  await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(1).click(); await page.getByRole('button',{name:'발표자 노트',exact:true}).click(); await expect(notes).toContainText('LATEST NOTE INPUT');
  const [reopened] = await Promise.all([page.waitForEvent('download'), pickMenu(page, 'file.document.2')]);
  const next = info.outputPath('reopened-notes.slides.json'); await reopened.saveAs(next);
  expect(JSON.parse(readFileSync(next, 'utf8')).document).toEqual(saved.document);
});


test('nested note table final input survives slide changes, meaningful undo and complete native reopen',async({page},info)=>{
 await openRepresentative(page,info,true);await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(1).click();await page.getByRole('button',{name:'발표자 노트',exact:true}).click();const notes=page.locator('.sl-notes-host'),cell=notes.locator('.w-paragraph').filter({hasText:'Nested note cell'}).first();
 await cell.click();await page.keyboard.press('Meta+ArrowRight');await expect.poll(()=>page.evaluate(()=>(window as any).editor.selection?.type)).toBe('range');
 const before=await native(page);await page.keyboard.insertText(' LATEST NESTED INPUT');await expect(notes).toContainText('Nested note cell LATEST NESTED INPUT');
 const draft=await native(page),expected=JSON.parse(before.document);const visit=(node:INode)=>{if(node.text==='Nested note cell')node.text='Nested note cell LATEST NESTED INPUT';for(const child of node.content??[])if(typeof child!=='string')visit(child);};visit(expected);expect(JSON.parse(draft.document)).toEqual(expected);
 await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(0).click();await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(1).click();expect((await native(page)).document).toBe(draft.document);
 await cell.click();await page.keyboard.press('Meta+z');expect((await native(page)).document).toBe(before.document);await page.keyboard.press('Meta+Shift+z');expect((await native(page)).document).toBe(draft.document);
 const[download]=await Promise.all([page.waitForEvent('download'),pickMenu(page,'file.document.2')]);const path=info.outputPath('nested-notes.slides.json');await download.saveAs(path);const saved=JSON.parse(readFileSync(path,'utf8')).document;
 await page.getByLabel('슬라이드 파일',{exact:true}).setInputFiles(path);await expect(page.getByRole('complementary',{name:'파일 작업 상태'})).toContainText('파일 열기 완료');await openFilmstrip(page); await page.locator('.sl-filmstrip button').nth(1).click();await page.getByRole('button',{name:'발표자 노트',exact:true}).click();await expect(notes).toContainText('Nested note cell LATEST NESTED INPUT');
 const[reopened]=await Promise.all([page.waitForEvent('download'),pickMenu(page,'file.document.2')]);const next=info.outputPath('nested-notes-reopened.slides.json');await reopened.saveAs(next);expect(JSON.parse(readFileSync(next,'utf8')).document).toEqual(saved);
});


test('owned text tools format characters, colour, paragraphs and lists and complete native export reopens',async({page},info)=>{
 await openRepresentative(page,info);await selectTitle(page);await reachableTools(page);
 await tools(page).getByRole('button',{name:'굵게',exact:true}).click();await expect(page.locator('.sl-stage .mark-bold')).toContainText('One eng');
 await tools(page).locator('[data-control="font-color"]:visible').click();await page.locator('[data-palette="font-color"] [data-swatch="C00000"]').click();
 await expect.poll(()=>page.locator('.sl-stage .mark-fontColor').evaluateAll(nodes=>nodes.some(node=>node.textContent==='One eng'&&getComputedStyle(node).color==='rgb(192, 0, 0)'))).toBe(true);
 await tools(page).getByRole('button',{name:'선택 속성 열기',exact:true}).click(); await page.getByRole('button',{name:'오른쪽 맞춤',exact:true}).click();await expect(page.locator('.sl-stage .w-paragraph').filter({hasText:'One engine'}).first()).toHaveCSS('text-align','right');
 await tools(page).getByRole('button',{name:'선택 속성 열기',exact:true}).click(); await page.getByRole('button',{name:'글머리 기호',exact:true}).click();await expect(page.locator('.sl-stage .w-list-item').filter({hasText:'One engine'})).toBeVisible();
 const formatted=JSON.parse((await native(page)).document);const candidates:INode[]=[];const collect=(node:INode)=>{if(node.stype==='list')candidates.push(node);for(const child of node.content??[])if(typeof child!=='string')collect(child);};collect(formatted);
 const ownedList=candidates.find(node=>JSON.stringify(node).includes('One engine'));expect(ownedList?.attributes?.type).toBe('bullet');expect((ownedList?.content![0] as INode).stype).toBe('listItem');expect(JSON.stringify(ownedList)).toContain('One engine, two products');
 const textNodes:INode[]=[];const words=(node:INode)=>{if(node.stype==='inline-text'&&node.text?.startsWith('One engine'))textNodes.push(node);for(const child of node.content??[])if(typeof child!=='string')words(child);};words(ownedList!);expect(textNodes).toHaveLength(1);expect(textNodes[0].marks).toEqual(expect.arrayContaining([{stype:'bold',range:[0,7]},{stype:'fontColor',attrs:{color:'C00000'},range:[0,7]}]));
 const[download]=await Promise.all([page.waitForEvent('download'),pickMenu(page,'file.document.2')]);const path=info.outputPath('selected-format.slides.json');await download.saveAs(path);const saved=JSON.parse(readFileSync(path,'utf8')).document;
 await page.getByLabel('슬라이드 파일',{exact:true}).setInputFiles(path);await expect(page.getByRole('complementary',{name:'파일 작업 상태'})).toContainText('파일 열기 완료');await expect(page.locator('.sl-stage .w-list-item').filter({hasText:'One engine'})).toBeVisible();await expect(page.locator('.sl-stage .mark-bold')).toContainText('One eng');
 const[next]=await Promise.all([page.waitForEvent('download'),pickMenu(page,'file.document.2')]);const reopened=info.outputPath('selected-format-reopened.slides.json');await next.saveAs(reopened);expect(JSON.parse(readFileSync(reopened,'utf8')).document).toEqual(saved);
});


test('supported canvas zoom and scroll keep owned text controls reachable without native or history mutation',async({page},info)=>{
 await openRepresentative(page,info);const before=await native(page);
 for(const zoom of ['125%','80%']) {const input=page.getByRole('textbox',{name:'확대/축소',exact:true});await input.fill(zoom);await input.press('Enter');await expect(input).toHaveValue(zoom);const scale=Number(zoom.replace('%',''))/100;await expect(page.locator('.sl-stage-scaled')).toHaveCSS('transform',`matrix(${scale}, 0, 0, ${scale}, 0, 0)`);
 const title=page.locator('.sl-stage .w-paragraph').filter({hasText:'One engine'}).first();const glyph=await title.evaluate(node=>{const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let t:Node|null;while((t=walker.nextNode()))if(t.textContent?.startsWith('One engine')){const range=document.createRange();range.setStart(t,0);range.setEnd(t,1);return range.getBoundingClientRect().toJSON();}throw new Error('title glyph missing');});
 writeFileSync(info.outputPath(`zoom-${zoom.replace('%','')}-gesture.json`),JSON.stringify({glyph,scale,frame:await page.locator('.sl-stage-frame').boundingBox(),overlay:await page.locator('.sl-overlay').boundingBox()},null,2));expect(glyph.x).toBeGreaterThanOrEqual((await page.locator('.sl-stage-viewport').boundingBox())!.x);expect(glyph.x+glyph.width).toBeLessThanOrEqual(1440);await page.mouse.dblclick(glyph.x+glyph.width/2,glyph.y+glyph.height/2);await expect.poll(()=>page.evaluate(()=>(window as any).editor.selection?.type)).toBe('range');await page.keyboard.press('Meta+ArrowLeft');for(let i=0;i<7;i++)await page.keyboard.press('Shift+ArrowRight');await expect.poll(()=>page.evaluate(()=>getSelection()?.toString())).toBe('One eng');await expect.poll(()=>page.evaluate(()=>(window as any).editor.selection?.collapsed)).toBe(false);
 writeFileSync(info.outputPath(`zoom-${zoom.replace('%','')}-tools.json`),JSON.stringify(await tools(page).evaluate(bar=>{const describe=(node:Element)=>{const css=getComputedStyle(node);return{tag:node.tagName,cls:node.className,rect:node.getBoundingClientRect().toJSON(),transform:css.transform,overflow:css.overflow,height:css.height,position:css.position,label:node.getAttribute('aria-label')};};return{bar:describe(bar),ancestors:Array.from((function*(node:Element|null){while(node){yield node;node=node.parentElement;}})(bar.parentElement)).map(describe),controls:Array.from(bar.querySelectorAll('button,input,[role=combobox]')).filter(node=>node.getBoundingClientRect().width>0).map(describe),model:(window as any).editor.selection,range:getSelection()?.getRangeAt(0).getBoundingClientRect().toJSON()};}),null,2));await page.screenshot({path:info.outputPath(`zoom-${zoom.replace('%','')}-before-bounds.png`),animations:'disabled'});await reachableTools(page);
 await page.mouse.move(glyph.x+glyph.width/2,glyph.y+glyph.height/2);await page.mouse.wheel(0,60);writeFileSync(info.outputPath(`zoom-${zoom.replace('%','')}-after-wheel.json`),JSON.stringify(await tools(page).evaluate(bar=>({bar:bar.getBoundingClientRect().toJSON(),controls:Array.from(bar.querySelectorAll('button,input,[role=combobox]')).filter(node=>node.getBoundingClientRect().width>0).map(node=>({label:node.getAttribute('aria-label'),rect:node.getBoundingClientRect().toJSON()})),range:getSelection()?.getRangeAt(0).getBoundingClientRect().toJSON()})),null,2));await page.screenshot({path:info.outputPath(`zoom-${zoom.replace('%','')}-after-wheel.png`),animations:'disabled'});await reachableTools(page);await page.screenshot({path:info.outputPath(`canvas-${zoom.replace('%','')}-selected.png`),animations:'disabled'});await page.keyboard.press('Escape');await expect(tools(page)).toHaveCount(0);}
 expect(await native(page)).toEqual(before);
});


test('synthetic composition hides selected formatting until its owned content finishes without changing native history',async({page},info)=>{
 await openRepresentative(page,info);await selectTitle(page);await reachableTools(page);const before=await native(page);
 // These are explicit browser composition lifecycle events; they do not prove physical OS Korean IME input.
 await page.evaluate(()=>{const anchor=getSelection()!.anchorNode!,el=anchor.nodeType===Node.ELEMENT_NODE?anchor as Element:anchor.parentElement!;el.closest('[contenteditable="true"]')!.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));});await expect(tools(page)).toHaveCount(0);
 await page.evaluate(()=>{const anchor=getSelection()!.anchorNode!,el=anchor.nodeType===Node.ELEMENT_NODE?anchor as Element:anchor.parentElement!;el.closest('[contenteditable="true"]')!.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}));});await selectTitle(page);await reachableTools(page);expect(await native(page)).toEqual(before);
});
