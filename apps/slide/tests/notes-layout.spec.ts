import { expect, test, type Page } from '@playwright/test';
import { openDeck, openFilmstrip } from './helpers';

const geometry = (page: Page) => page.evaluate(() => ({
  viewport: document.querySelector('.sl-stage-viewport')!.getBoundingClientRect().toJSON(),
  zoom: (document.querySelector('[aria-label="확대/축소"]') as HTMLInputElement).value,
}));

test('notes of different lengths never resize the stage when navigating slides', async ({ page }, info) => {
  await openDeck(page);
  await openFilmstrip(page);
  const before = await geometry(page);
  await page.locator('.sl-filmstrip button').nth(1).click();
  await expect(page.locator('.sl-host')).toContainText('What the second product cost');
  const after = await geometry(page);
  await info.attach('stage-bounds.json', { body: JSON.stringify({before, after}), contentType:'application/json' });
  expect(after).toEqual(before);
});

for (const theme of ['light', 'dark']) test(`floating notes preserve geometry, editing and focus in ${theme}`, async ({ page }, info) => {
  await openDeck(page);
  await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
  const before = await geometry(page);
  const nativeBefore = await page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
  const toggle = page.getByRole('button', { name: '발표자 노트', exact: true });
  const notes = page.locator('[data-notes-panel]');
  await expect(notes).toBeHidden();
  await toggle.click(); await expect(notes).toBeVisible(); await expect(notes.getByRole('textbox', {name:'발표자 노트 입력',exact:true})).toBeFocused();
  expect(await geometry(page)).toEqual(before);
  await openFilmstrip(page);
  expect(await geometry(page)).toEqual(before);
  const surfaces = await page.locator('[data-slide-dock]').evaluate(dock => {
    const measure = (node: Element) => ({ bounds: node.getBoundingClientRect().toJSON(), radius: getComputedStyle(node).borderRadius });
    return { viewport: document.querySelector('.sl-main')!.getBoundingClientRect().toJSON(),
      notes: measure(dock.querySelector('[data-notes-panel]')!), tray: measure(dock.querySelector('[data-filmstrip-panel]')!) };
  });
  for (const surface of [surfaces.notes, surfaces.tray]) {
    expect(surface.bounds.left).toBe(surfaces.viewport.left);
    expect(surface.bounds.right).toBe(surfaces.viewport.right);
    expect(surface.radius).toBe('0px');
  }
  expect(surfaces.notes.bounds.bottom).toBe(surfaces.tray.bounds.top);
  await info.attach('edge-panels.json', {body:JSON.stringify(surfaces), contentType:'application/json'});
  await page.screenshot({path:info.outputPath(`edge-panels-${theme}.png`),animations:'disabled'});

  await page.locator('.sl-filmstrip button[data-slide]').nth(1).click();
  await expect(notes).toContainText('The point of this slide');
  expect(await geometry(page)).toEqual(before);
  const paragraph = notes.locator('.sl-notes-host p').first();
  await paragraph.click(); await page.keyboard.press('Meta+ArrowRight');
  const longText = ' Notes stay inside their own scroll area.'.repeat(40);
  await page.keyboard.insertText(longText);
  await expect(paragraph).toContainText(longText);
  expect(await geometry(page)).toEqual(before);
  const bounds = await notes.boundingBox();
  expect(bounds!.height).toBeLessThanOrEqual(202);
  const scrolling = await notes.locator('.sl-notes-host').evaluate(node => ({height:node.clientHeight, content:node.scrollHeight}));
  expect(scrolling.content).toBeGreaterThan(scrolling.height);
  await info.attach('notes-geometry.json', {body:JSON.stringify({before,after:await geometry(page),bounds,scrolling}),contentType:'application/json'});
  await page.keyboard.press('Meta+z');
  await expect.poll(() => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()))).toBe(nativeBefore);
  await page.keyboard.press('Escape');
  await expect(notes).toBeHidden(); await expect(toggle).toBeFocused();
  expect(await geometry(page)).toEqual(before);
  await toggle.click(); await page.locator('.sl-filmstrip button[data-slide]').nth(4).click();
  await expect(notes.getByRole('textbox', {name:'발표자 노트 입력',exact:true})).toBeVisible();
  expect(await geometry(page)).toEqual(before);
  await notes.getByRole('textbox', {name:'발표자 노트 입력',exact:true}).fill('New presenter note');
  await expect(notes.locator('.sl-notes-host')).toBeVisible();
  expect(await geometry(page)).toEqual(before);
  await page.screenshot({path:info.outputPath(`floating-notes-${theme}.png`),animations:'disabled'});
  await notes.getByRole('button',{name:'발표자 노트 닫기',exact:true}).click();
  await expect(toggle).toBeFocused();
  expect(await geometry(page)).toEqual(before);
});

// The original empty-marks representation must survive real note typing and Undo.
test('unformatted notes restore the exact native document after typing and undo', async ({page}) => {
  await openDeck(page); await openFilmstrip(page);
  await page.locator('.sl-filmstrip button[data-slide]').nth(1).click();
  const toggle = page.getByRole('button',{name:'발표자 노트',exact:true});
  if (await toggle.count()) await toggle.click();
  const before = await page.evaluate(()=>(window as any).editor.exportDocument());
  const paragraph = page.locator('.sl-notes-host p').first();
  await paragraph.click(); await page.keyboard.press('Meta+ArrowRight'); await page.keyboard.insertText(' note typing');
  await expect(paragraph).toContainText(' note typing'); await page.keyboard.press('Meta+z');
  await expect.poll(()=>page.evaluate(()=>(window as any).editor.exportDocument())).toEqual(before);
});


test('both sidebars, notes and thumbnails overlay the unchanged editing area', async ({page}, info) => {
  await openDeck(page);
  const before = await geometry(page);
  const header = page.locator('.sl-topbar');
  await header.getByRole('button',{name:'레이어',exact:true}).click();
  await header.getByRole('button',{name:'속성',exact:true}).click();
  await openFilmstrip(page);
  await page.getByRole('button',{name:'발표자 노트',exact:true}).click();
  const notes=page.locator('[data-notes-panel]');
  await expect(notes).toBeVisible();
  await expect.poll(async()=>{
    const top=(await notes.boundingBox())!.y;
    return page.locator('[data-floating-panel]').evaluateAll((nodes,top)=>nodes.every(node=>node.getBoundingClientRect().bottom<=top-8),top);
  }).toBe(true);
  expect(await geometry(page)).toEqual(before);
  const close=notes.getByRole('button',{name:'발표자 노트 닫기',exact:true});
  expect(await close.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  await page.screenshot({path:info.outputPath('notes-menu-integrated-ui.png'),animations:'disabled'});
  await close.click(); await expect(notes).toBeHidden();
  expect(await geometry(page)).toEqual(before);
});
