import { expect, test, type Page } from '@playwright/test';
import { openDeck, openFilmstrip, pickMenu } from './helpers';
import { forFile } from '../../../packages/office-slides/src/deck-file';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const modelUrl = `/@fs${fileURLToPath(new URL('../../../packages/model/src/index.ts', import.meta.url))}`;

const panel = (page: Page) => page.locator('[data-notes-panel]');
const draft = (page: Page) => panel(page).getByRole('textbox', {name:'발표자 노트 입력',exact:true});
const native = (page: Page) => page.evaluate(() => (window as any).editor.exportDocument());
async function openNotes(page: Page) {
  await openDeck(page);
  const before=await page.evaluate(()=>({document:(window as any).editor.exportDocument(),history:(window as any).editor.getHistoryStats()}));
  await page.getByRole('button',{name:'발표자 노트',exact:true}).click();
  await expect(draft(page)).toBeFocused();
  await expect(page.getByRole('button',{name:'노트 추가',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>({document:(window as any).editor.exportDocument(),history:(window as any).editor.getHistoryStats()}))).toEqual(before);
}

for (const theme of ['light','dark']) test(`empty notes accept native text immediately without an add step in ${theme}`,async({page},info)=>{
  await openNotes(page); await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
  const before=await native(page);
  const geometry=()=>page.locator('.sl-stage-viewport').boundingBox();const bounds=await geometry();
  await panel(page).getByRole('button',{name:'발표자 노트 닫기',exact:true}).click();
  await page.getByRole('button',{name:'발표자 노트',exact:true}).click();
  expect(await native(page)).toEqual(before);
  await draft(page).fill('첫 발표자 노트\nSecond paragraph');
  const rich=panel(page).locator('.sl-notes-host');
  await expect(rich).toBeVisible(); await expect(rich).toContainText('첫 발표자 노트');await expect(rich).toContainText('Second paragraph');
  await expect(rich.locator('p')).toHaveCount(2);
  await page.keyboard.insertText(' continued');await expect(rich).toContainText('Second paragraph continued');
  const edited=await native(page);expect(await geometry()).toEqual(bounds);
  await page.screenshot({path:info.outputPath(`notes-direct-${theme}.png`),animations:'disabled'});
  await page.keyboard.press('Meta+z');await expect(rich).not.toContainText('continued');
  await page.keyboard.press('Meta+z');await expect(draft(page)).toBeVisible();await expect.poll(()=>native(page)).toEqual(before);
  await draft(page).press('Meta+Shift+z');await expect(rich).toBeVisible();
  await page.keyboard.press('Meta+Shift+z');await expect.poll(()=>native(page)).toEqual(edited);
  const [download]=await Promise.all([page.waitForEvent('download'),pickMenu(page,'file.document.2')]);
  const path=info.outputPath('direct-note.slides.json');await download.saveAs(path);
  expect(JSON.parse(readFileSync(path,'utf8')).document).toEqual(forFile(edited));
  page.on('dialog',dialog=>void dialog.accept());await page.getByLabel('슬라이드 파일',{exact:true}).setInputFiles(path);
  await expect.poll(async()=>forFile(await native(page))).toEqual(forFile(edited));
  await page.getByRole('button',{name:'발표자 노트',exact:true}).click();await expect(rich).toContainText('Second paragraph continued');
});

async function delayFirstWrite(page:Page) {
  await page.evaluate(async(path)=>{
    const model=await import(/* @vite-ignore */ path);
    (window as any).__notesRelease=undefined;
    let first=true;
    (window as any).__notesGuardOff=model.registerPreExecutionGuard((window as any).editor,async()=>{
      if(!first)return;first=false;await new Promise<void>(resolve=>{(window as any).__notesRelease=resolve;});
    });
  },modelUrl);
}

test('first note retains input arriving during a pending authority check',async({page})=>{
  await openNotes(page);await delayFirstWrite(page);
  await draft(page).fill('First');
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__notesRelease)).toBe('function');
  await draft(page).fill('First and second\nThird line');
  await page.evaluate(()=>{(window as any).__notesRelease();});
  await expect(panel(page).locator('.sl-notes-host')).toBeVisible();
  await expect(panel(page).locator('.sl-notes-host')).toContainText('First and second');
  await expect(panel(page).locator('.sl-notes-host')).toContainText('Third line');
  await page.keyboard.insertText(' after');await expect(panel(page).locator('.sl-notes-host')).toContainText('Third line after');
});

test('denied first input preserves the draft and retries once',async({page})=>{
  await openNotes(page);const before=await native(page);
  await page.evaluate(async(path)=>{
    const model=await import(/* @vite-ignore */ path);(window as any).__notesGuardOff=model.registerPreExecutionGuard((window as any).editor,()=> 'synthetic transient refusal');
  },modelUrl);
  await draft(page).fill('Retained input');await expect(panel(page).getByRole('alert')).toBeVisible();
  expect(await native(page)).toEqual(before);await expect(draft(page)).toHaveValue('Retained input');
  await page.evaluate(()=>{(window as any).__notesGuardOff();});await panel(page).getByRole('button',{name:'다시 시도',exact:true}).click();
  await expect(panel(page).locator('.sl-notes-host')).toContainText('Retained input');
  await page.keyboard.insertText(' after retry'); await expect(panel(page).locator('.sl-notes-host')).toContainText('Retained input after retry');
});

test('switching slides retires a pending first note without changing either native slide',async({page})=>{
  await openNotes(page);const before=await native(page);await delayFirstWrite(page);await draft(page).fill('Preserved draft');
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__notesRelease)).toBe('function');
  await openFilmstrip(page);await page.locator('.sl-filmstrip button[data-slide]').nth(4).click();
  await page.locator('.sl-filmstrip button[data-slide]').first().click();
  await page.evaluate(()=>{(window as any).__notesRelease();});
  await expect.poll(()=>native(page)).toEqual(before);
  await page.locator('.sl-filmstrip button[data-slide]').first().click();await expect(draft(page)).toHaveValue('Preserved draft');
  await expect(panel(page).getByRole('alert')).toBeVisible();
});

test('composition stays in the first-input draft until completion and then uses the rich editor',async({page})=>{
  await openNotes(page);const before=await native(page);
  await draft(page).dispatchEvent('compositionstart',{data:''});await draft(page).fill('한글');
  expect(await native(page)).toEqual(before);
  await draft(page).dispatchEvent('compositionend',{data:'한글'});
  await expect(panel(page).locator('.sl-notes-host')).toContainText('한글');
  await page.keyboard.insertText(' 입력');await expect(panel(page).locator('.sl-notes-host')).toContainText('한글 입력');
});


test('closing and reopening notes retires the pending input and retains its recovery draft',async({page})=>{
  await openNotes(page);const before=await native(page);await delayFirstWrite(page);await draft(page).fill('Closed panel draft');
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__notesRelease)).toBe('function');
  await panel(page).getByRole('button',{name:'발표자 노트 닫기',exact:true}).click();
  await page.getByRole('button',{name:'발표자 노트',exact:true}).click();
  await page.evaluate(()=>{(window as any).__notesRelease();});
  await expect(panel(page).getByRole('alert')).toBeVisible();await expect(draft(page)).toHaveValue('Closed panel draft');
  expect(await native(page)).toEqual(before);
});
