import { expect, test, type Page } from '@playwright/test';
import { openDeck, openFilmstrip, currentSlide, pickMenu } from './helpers';

const mode = (page: Page, multi: boolean) => page.getByRole('button', { name: multi ? '멀티 슬라이드 보기' : '슬라이드 보기', exact: true });
const state = (page: Page) => page.evaluate(() => ({ document: (window as any).editor.exportDocument(), history: (window as any).editor.getHistoryStats() }));
const geometry = (page: Page) => page.locator('.sl-stage-viewport').boundingBox();

for (const theme of ['light', 'dark']) test(`single/multi icons preserve the deck and replace thumbnails in ${theme}`, async ({page}, info) => {
  await openDeck(page); await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
  const before=await state(page), bounds=await geometry(page), current=await currentSlide(page);
  await expect(mode(page,false)).toHaveAttribute('aria-pressed','true');
  const viewTools=page.getByRole('toolbar',{name:'Slides 보기 도구',exact:true});
  const viewToolsBefore=await viewTools.boundingBox();
  await openFilmstrip(page);
  await page.getByRole('button',{name:'발표자 노트',exact:true}).click();
  await mode(page,true).click();
  await expect(mode(page,true)).toBeFocused();
  expect(await viewTools.boundingBox()).toEqual(viewToolsBefore);
  await expect(mode(page,true)).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.sl-stage')).toHaveAttribute('data-freeboard','true');
  await expect(page.locator('.sl-map')).toHaveCount(0);
  await expect(page.locator('[data-filmstrip-panel]')).toBeHidden();
  await expect(page.locator('[data-notes-panel]')).toBeHidden();
  await expect(page.locator('.sl-stage')).toBeVisible();
  await expect(page.locator('.sl-stage-owner')).not.toHaveAttribute('inert','');
  await expect(page.locator('.sl-overlay')).toBeVisible();
  await expect(page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true})).toBeVisible();
  expect(await geometry(page)).toEqual(bounds);
  expect(await state(page)).toEqual(before); expect(await currentSlide(page)).toBe(current);
  const button=await mode(page,true).boundingBox(), main=await page.locator('.sl-main').boundingBox();
  const cluster=page.getByRole('group',{name:'슬라이드 보기 전환',exact:true});
  const clusterBounds=(await cluster.boundingBox())!;
  expect(button!.width).toBeGreaterThanOrEqual(32); expect(button!.height).toBeGreaterThanOrEqual(32);
  expect(button!.width).toBeLessThanOrEqual(32); expect(button!.height).toBeLessThanOrEqual(32);
  expect(main!.x+main!.width-clusterBounds.x-clusterBounds.width).toBe(12);
  expect(await cluster.evaluate(el=>parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThanOrEqual(clusterBounds.height/2);
  await page.screenshot({path:info.outputPath(`multi-${theme}.png`),animations:'disabled'});
  await mode(page,false).focus(); await page.keyboard.press('Enter');
  await expect(mode(page,false)).toBeFocused();
  await expect(mode(page,false)).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.sl-map')).toHaveCount(0);
  await expect(page.locator('[data-filmstrip-panel]')).toBeVisible();
  await expect(page.locator('[data-notes-panel]')).toBeVisible();
  expect(await geometry(page)).toEqual(bounds); expect(await state(page)).toEqual(before);
  await page.getByRole('button',{name:'발표자 노트 닫기',exact:true}).click();
  await page.getByRole('button',{name:'슬라이드 탐색 접기',exact:true}).click();
  await mode(page,true).click(); await expect(page.locator('.sl-stage')).toHaveAttribute('data-freeboard','true');
  await mode(page,false).click(); await expect(mode(page,false)).toHaveAttribute('aria-pressed','true');
  expect(await state(page)).toEqual(before);
});

test('view controls keep map navigation, canvas and icon presentation available', async ({page})=>{
  await openDeck(page);
  await expect(page.locator('[data-focus-toggle]')).toHaveCount(0);
  const present=page.getByRole('button',{name:'처음부터 발표',exact:true});
  await expect(present.locator('svg')).toHaveCount(1); expect(await present.textContent()).toBe('');
  await pickMenu(page,'view.panes.1');
  const target=page.locator('[data-map-page]').nth(1); const sid=await target.getAttribute('data-map-page');
  await target.click(); await expect(page.locator('.sl-map')).toHaveCount(0);
  expect(await currentSlide(page)).toBe(sid);
  await pickMenu(page,'view.panes.2'); await expect(page.locator('.sl-stage')).toHaveAttribute('data-freeboard','true');
  await mode(page,false).click(); await expect(page.locator('.sl-stage')).not.toHaveAttribute('data-freeboard','true');
  await present.click(); await expect(page.locator('.sl-shell')).toHaveAttribute('data-presenting','true');
  await page.keyboard.press('Escape'); await expect(present).toBeVisible();
});

 test('map entry retires selected-object tools while preserving native selection',async({page})=>{
  await openDeck(page); await openFilmstrip(page);
  await page.locator('.sl-filmstrip button[data-slide]').nth(2).click();
  const box=(await page.locator('.sl-stage .sl-rectangle:visible').first().boundingBox())!;
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await expect(page.locator('[data-slides-formatting]')).toBeVisible();
  const before=await state(page), selection=await page.evaluate(()=>(window as any).editor.selection);
  await pickMenu(page,'view.panes.1');
  await expect(page.locator('[data-slides-formatting]')).toHaveCount(0);
  await expect(page.getByRole('toolbar',{name:'Slides 삽입 도구',exact:true})).toHaveCount(0);
  expect(await state(page)).toEqual(before);
  expect(await page.evaluate(()=>(window as any).editor.selection)).toEqual(selection);
  await mode(page,false).click(); await expect(page.locator('.sl-overlay')).toBeVisible();
  expect(await state(page)).toEqual(before);
  expect(await page.evaluate(()=>(window as any).editor.selection)).toEqual(selection);
 });

 test('reselecting the current view does not steal the next thumbnail focus',async({page})=>{
  await openDeck(page);
  await mode(page,false).click();
  await openFilmstrip(page);
  await expect(page.locator('.sl-filmstrip button[data-current="true"]')).toBeFocused();
 });
