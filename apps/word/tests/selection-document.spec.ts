import { test, expect, type Page } from '@playwright/test';
import { settled } from './helpers';
import { resolve } from 'node:path';

const prefix = 'This paragraph takes its ';
const prose = (page: Page) => page.locator('#editor .w-paragraph, #editor .w-heading, #editor .w-list-item').filter({ hasText: prefix }).first();
const tools = (page: Page) => page.getByRole('group', { name: '선택한 Word 글 서식', exact: true });
async function openMore(page: Page, surface = tools(page), object = false) {
  await surface.getByRole('button', { name: '추가 서식', exact: true }).click();
  const more = page.getByLabel(object ? '추가 Word 개체 도구' : '추가 Word 서식', { exact: true });
  await expect(more).toBeVisible();
  return more;
}
const native = (page: Page) => page.evaluate(() => JSON.stringify(window.editor.exportDocument()));

const savedText = (page: Page) => page.evaluate(() => new Promise<string[]>((resolve, reject) => {
  const request = indexedDB.open('barocss-word');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const rows = db.transaction('documents').objectStore('documents').getAll();
    rows.onerror = () => { db.close(); reject(rows.error); };
    rows.onsuccess = () => { const result = rows.result.map((row: { text: string }) => row.text); db.close(); resolve(result); };
  };
}));

async function selectProse(page: Page) {
  await prose(page).click({ position: { x: 8, y: 10 } });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
  await page.keyboard.down('Shift');
  for (let i = 0; i < prefix.length; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe(prefix);
  try { await expect.poll(() => page.evaluate(() => window.editor.selection?.endOffset)).toBe(prefix.length); }
  catch (error) { await test.info().attach('selection-mismatch.json', {body: JSON.stringify(await page.evaluate(() => { const dom = getSelection(); const model = window.editor.selection; return { dom: {text: dom?.toString(), anchor: dom?.anchorNode?.parentElement?.outerHTML, anchorOffset: dom?.anchorOffset, focus: dom?.focusNode?.parentElement?.outerHTML, focusOffset: dom?.focusOffset}, model, selected: window.editor.selectionManager.getSelectedText(), modelStart: model && window.editor.dataStore.getNode(model.startNodeId), modelEnd: model && window.editor.dataStore.getNode(model.endNodeId), active: document.activeElement?.outerHTML }; })),contentType:'application/json'});throw error; }
}

async function reachableTools(page: Page, label = '선택한 Word 글 서식') {
  const surface = page.getByLabel(label, { exact: true }).first();
  try { await expect(surface).toBeInViewport({ ratio: 1 }); } catch(error) {await test.info().attach('tools-absence.json',{body:JSON.stringify(await page.evaluate(()=>({model:window.editor.selection,dom:getSelection()?.toString(),active:document.activeElement?.outerHTML,scrollLock:document.body.dataset.scrollLocked,pointerEvents:getComputedStyle(document.body).pointerEvents}))),contentType:'application/json'});throw error;}
  await expect.poll(() => surface.evaluate(el => { for (let n: Element | null = el; n; n = n.parentElement) { const css = getComputedStyle(n); if (css.visibility !== 'visible' || Number(css.opacity) < 1) return false; } return true; })).toBe(true);
  const geometry = await surface.evaluate(el => ({box:el.getBoundingClientRect().toJSON(), anchor:getSelection()?.rangeCount ? getSelection()!.getRangeAt(0).getBoundingClientRect().toJSON() : null}));
  await test.info().attach('owned-tool-geometry.json', {body:JSON.stringify(geometry),contentType:'application/json'});
  if (label !== '선택한 Word 글 서식') {
    const boxes = await surface.locator('button:visible, input:visible').evaluateAll(elements => elements.map(el => ({ label: el.getAttribute('aria-label') ?? el.textContent, box: el.getBoundingClientRect().toJSON() })));
    await test.info().attach('object-control-bounds.json', { body: JSON.stringify({ surface: geometry.box, controls: boxes }), contentType: 'application/json' });
    for (const { box } of boxes) {
      expect(box.top).toBeGreaterThanOrEqual(geometry.box.top - 1);
      expect(box.bottom).toBeLessThanOrEqual(geometry.box.bottom + 1);
      expect(box.left).toBeGreaterThanOrEqual(geometry.box.left - 1);
      expect(box.right).toBeLessThanOrEqual(geometry.box.right + 1);
    }
  }
  const control = surface.locator('button:not([disabled])').first();
  expect(await control.evaluate(el => { const box = el.getBoundingClientRect(); const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return !!at && el.contains(at); })).toBe(true);
  return geometry;
}

async function open(page: Page) {
  await page.goto('/?sample'); await settled(page);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  await expect(page.getByRole('button', { name: '전체 도구 펼치기', exact: true })).toBeVisible();
}

for (const theme of ['light', 'dark']) test(`continuous writer selection and dismissal preserve native document (${theme})`, async ({ page }, info) => {
  await open(page); await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
  await expect(page.getByRole('button', { name: '전체 도구 펼치기', exact: true })).toHaveCSS('color', theme === 'dark' ? 'rgb(238, 241, 245)' : 'rgb(32, 37, 45)');
  const before = await native(page);
  await expect(tools(page)).toHaveCount(0);
  await expect(page.locator('.w-ribbon-quick, .w-ruler')).toHaveCount(0);
  await info.attach('idle-geometry', { body: JSON.stringify(await page.locator('.w-document').first().boundingBox()), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath(`${theme}-idle-editable.png`) });
  await selectProse(page); await expect(tools(page)).toBeVisible();
  const geometry = await reachableTools(page);
  expect(geometry.anchor).not.toBeNull();
  expect(Math.min(Math.abs(geometry.box.bottom - geometry.anchor!.top), Math.abs(geometry.box.top - geometry.anchor!.bottom))).toBeLessThanOrEqual(20);
  const selection = await page.evaluate(() => structuredClone(window.editor.selection));
  await page.screenshot({ path: info.outputPath(`${theme}-selected-text.png`) });
  expect(await native(page)).toBe(before);
  await page.keyboard.press('Escape'); await expect(tools(page)).toHaveCount(0);
  expect(await native(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.selection)).toEqual(selection);
  await page.screenshot({ path: info.outputPath(`${theme}-dismissed-tools.png`) });
  await selectProse(page); await expect(tools(page)).toBeVisible();
  expect(await native(page)).toBe(before);
  await page.getByRole('button', { name: '전체 도구 펼치기', exact: true }).click();
  await expect(page.getByRole('tab', { name: '홈', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '전체 도구 접기', exact: true }).click();
  expect(await native(page)).toBe(before);
});

test('selected text formatting is a real undoable edit and selection-only gestures do not save content', async ({ page }, info) => {
  await open(page);
  // Existing code mark makes full native undo exact. The core's known absent→[]
  // mark representation behavior is covered separately by the preserved probe.
  await prose(page).locator('.mark-code').dblclick();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('Normal');
  await expect.poll(() => page.evaluate(() => window.editor.selection?.endOffset)).toBe(6);
  await expect(tools(page)).toBeVisible();
  const before = await native(page);
  const expectedSaved = await page.evaluate(async ({ snapshot, fileSource }) => {
    // File export intentionally removes session SIDs. Preserve all other native fields.
    const file = await import(fileSource);
    return JSON.parse(file.wordFileText(JSON.parse(snapshot), ''));
  }, { snapshot: before, fileSource: '/@fs' + resolve(process.cwd(), 'packages/office-word/src/word-file.ts') });
  await tools(page).getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(prose(page).locator('.mark-bold')).toContainText('Normal');
  const bold = await native(page); expect(bold).not.toBe(before);
  await page.locator('#editor [contenteditable="true"]').first().focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await info.attach('before-bold-native.json', { body: before, contentType: 'application/json' });
  await info.attach('after-undo-native.json', { body: await native(page), contentType: 'application/json' });
  await expect.poll(() => native(page)).toBe(before);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
  await expect.poll(() => native(page)).toBe(bold);
  await expect(page.locator('[data-word-save-status]')).toHaveText('저장됨');
  const changed = JSON.parse(bold);
  const findCode = (node: { text?: string; marks?: { stype: string; range: number[] }[]; content?: unknown[] }): typeof node | undefined => {
    if (node.text === 'Normal' && node.marks?.some(mark => mark.stype === 'code')) return node;
    for (const child of node.content ?? []) { const found = findCode(child as typeof node); if (found) return found; }
    return undefined;
  };
  const marked = findCode(changed)!;
  expect(marked.marks).toEqual(expect.arrayContaining([{ stype: 'code', range: [0, 6] }, { stype: 'bold', range: [0, 6] }]));
  expect(marked.marks).toHaveLength(2);
  findCode(expectedSaved.document)!.marks = [{ stype: 'code', range: [0, 6] }, { stype: 'bold', range: [0, 6] }];
  await info.attach('expected-saved-native.json', { body: JSON.stringify(expectedSaved.document), contentType: 'application/json' });
  await info.attach('observed-saved-files.json', { body: JSON.stringify(await savedText(page)), contentType: 'application/json' });
  await expect.poll(async () => (await savedText(page)).some(text => JSON.stringify(JSON.parse(text).document) === JSON.stringify(expectedSaved.document))).toBe(true);
  const finalPersisted = await savedText(page);
  await page.reload(); await settled(page);
  await expect(prose(page).locator('.mark-bold')).toContainText('Normal');
  expect(await savedText(page)).toEqual(finalPersisted);
});

for (const retirement of ['A-B-A', 'Escape']) test(`deferred font completion cannot revive selection after ${retirement}`, async ({ page }) => {
  await open(page); await selectProse(page); await expect(tools(page)).toBeVisible();
  const before = await native(page);
  // Delay the actual font-loader promise. The font choice remains a user click;
  // this diagnostic controls only resource completion, never editor commands.
  await page.evaluate(() => {
    const loader = window.wordFonts;
    if (!loader) throw new Error('Standalone Word font-loader diagnostic unavailable');
    const original = loader.ensure.bind(loader);
    let release: () => void = () => {};
    loader.ensure = () => new Promise<void>(resolve => { release = resolve; });
    Object.assign(window, { releaseWordFont: () => { loader.ensure = original; release(); } });
  });
  await (await openMore(page)).locator('.w-toolbar-font-family').click();
  await page.getByRole('option', { name: 'Arial', exact: true }).click();
  await tools(page).getByRole('button', { name: '추가 서식', exact: true }).click();
  await expect(page.getByLabel('추가 Word 서식', { exact: true })).not.toBeVisible();
  await expect(page.getByLabel('추가 Word 서식', { exact: true })).toHaveAttribute('inert', '');
  expect(await native(page)).toBe(before);
  await tools(page).locator('.w-toolbar-style').focus();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  if (retirement === 'A-B-A') {
    await prose(page).click(); await page.keyboard.press('ArrowRight');
    await selectProse(page); await expect(tools(page)).toBeVisible();
  } else {
    const owned = await page.evaluate(() => structuredClone(window.editor.selection));
    await page.keyboard.press('Escape'); await expect(tools(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.editor.selection)).toEqual(owned);
  }
  await page.evaluate(() => (window as unknown as { releaseWordFont(): void }).releaseWordFont());
  await settled(page); expect(await native(page)).toBe(before);
  if (retirement === 'Escape') { await selectProse(page); await expect(tools(page)).toBeVisible(); }
  await tools(page).getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(prose(page).locator('.mark-bold')).toContainText(prefix.trimEnd());
});

test('selected style, link, colour and list tools edit their owned paragraph', async ({ page }) => {
  await open(page); await selectProse(page);
  await tools(page).getByRole('button', { name: '링크 편집', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '링크 편집', exact: true });
  await dialog.getByLabel('링크 주소').fill('https://example.com/word-selection');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(prose(page).locator('a[href="https://example.com/word-selection"]')).toHaveText(prefix);
  await selectProse(page);
  await tools(page).getByRole('button', { name: 'Text colour', exact: true }).click();
  await tools(page).locator('[data-palette="font-color"]').getByRole('button', { name: 'Red', exact: true }).click();
  await expect(prose(page).locator('.mark-fontColor')).toHaveCSS('color', 'rgb(255, 0, 0)');
  await selectProse(page);
  await (await openMore(page)).getByRole('button', { name: 'Bulleted list', exact: true }).click();
  await expect(prose(page)).toHaveAttribute('data-marker', /\S/);
  await selectProse(page);
  await tools(page).locator('.w-toolbar-style').click();
  await page.getByRole('option', { name: 'Heading 1', exact: true }).click();
  await expect(page.locator('h1.w-heading').filter({ hasText: prefix })).toBeVisible();
});

test('table and drawing owned tools retain the rich native document on open and dismissal', async ({ page }, info) => {
  await open(page); const before = await native(page);
  await page.locator('#editor .w-cell').first().click();
  const tableTools = page.getByLabel('선택한 표 도구', { exact: true });
  await expect(tableTools).toBeVisible(); await expect(tools(page)).toHaveCount(0);
  await reachableTools(page, '선택한 표 도구');
  expect(await native(page)).toBe(before);
  await page.screenshot({ path: info.outputPath('selected-table.png') });
  const tableMore = await openMore(page, tableTools, true);
  await tableMore.getByRole('combobox', { name: '표 정렬', exact: true }).click();
  await page.getByRole('option', { name: '가운데 정렬', exact: true }).click();
  await expect.poll(()=>page.locator('#editor table').first().evaluate(el=>window.editor.dataStore.getNode(el.getAttribute('data-bc-sid')!)?.attributes?.alignment)).toBe('center');
  const centered = await page.locator('#editor table').first().evaluate(el=>{const box=el.getBoundingClientRect(),parent=el.parentElement!.getBoundingClientRect();return Math.abs((box.left+box.right)/2-(parent.left+parent.right)/2)});
  expect(centered).toBeLessThanOrEqual(1);
  await tableMore.getByRole('combobox', { name: '표 자동 맞춤', exact: true }).click();
  await page.getByRole('option', { name: '본문 너비에 맞춤', exact: true }).click();
  await info.attach('post-fit-state.json',{body:JSON.stringify(await page.evaluate(()=>({model:window.editor.selection,active:document.activeElement?.outerHTML,tools:!!document.querySelector('[data-word-object-tools]'),table:window.editor.dataStore.getNode(document.querySelector('#editor table')!.getAttribute('data-bc-sid')!)}))),contentType:'application/json'});
  await expect(tableMore.getByRole('combobox', { name: '표 자동 맞춤', exact: true })).toContainText('본문 너비에 맞춤');
  const tableChanged = await native(page); expect(tableChanged).not.toBe(before);
  const tableSelection = await page.evaluate(() => structuredClone(window.editor.selection));
  const tableMoreTrigger = tableTools.getByRole('button', { name: '추가 서식', exact: true });
  await page.keyboard.press('Escape');
  await expect(tableMore).toBeHidden(); await expect(tableMore).toHaveAttribute('inert', '');
  await expect(tableTools).toBeVisible(); await expect(tableMoreTrigger).toBeFocused();
  expect(await page.evaluate(() => window.editor.selection)).toEqual(tableSelection);
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(await native(page)).toBe(tableChanged);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0); await expect(tableTools).toBeVisible();
  await expect(tableMoreTrigger).toBeFocused();
  expect(await page.evaluate(() => window.editor.selection)).toEqual(tableSelection); expect(await native(page)).toBe(tableChanged);
  await page.keyboard.press('Escape'); await expect(tableTools).toHaveCount(0);
  await expect(page.locator('#editor [contenteditable="true"]').first()).toBeFocused();
  expect(await page.evaluate(() => window.editor.selection)).toEqual(tableSelection);
  expect(await native(page)).toBe(tableChanged);
  const image = page.locator('#editor .w-image').first();
  await image.click();
  const imageTools = page.getByLabel('선택한 그림 도구', { exact: true });
  await expect(imageTools).toBeVisible(); await reachableTools(page, '선택한 그림 도구');
  expect(await native(page)).toBe(tableChanged);
  const imageMore = await openMore(page, imageTools, true);
  await imageMore.getByRole('combobox', { name: '그림 본문 배치', exact: true }).click();
  await page.getByRole('option', { name: '왼쪽에 배치', exact: true }).click();
  await expect(imageMore.getByRole('combobox', { name: '그림 본문 배치', exact: true })).toContainText('왼쪽에 배치');
  expect(await native(page)).not.toBe(tableChanged);
  await page.screenshot({ path: info.outputPath('selected-image.png') });
});

for (const zoom of [80, 125]) test(`owned text and object controls stay reachable at document zoom ${zoom}% and after scrolling`, async ({ page }) => {
  await open(page); const before = await native(page);
  const value = page.getByRole('textbox', {name:'확대/축소',exact:true});
  await value.fill(String(zoom)); await value.press('Enter');
  await expect(page.locator('.w-zoom-frame')).toHaveAttribute('data-zoom', String((zoom / 100).toFixed(2)));
  await selectProse(page); await reachableTools(page);
  const owned = await page.evaluate(() => structuredClone(window.editor.selection));
  const colour = tools(page).getByRole('button', { name: 'Text colour', exact: true });
  await colour.focus(); await colour.click();
  const palette = page.getByRole('group', { name: 'Text colour', exact: true });
  await expect(palette).toBeVisible();
  await palette.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); });
  const paletteBox = (await palette.boundingBox())!;
  expect(paletteBox.x).toBeGreaterThanOrEqual(0); expect(paletteBox.y).toBeGreaterThanOrEqual(0);
  expect(paletteBox.x + paletteBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(paletteBox.y + paletteBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  for (const swatch of await palette.locator('button').all()) {
    const box = (await swatch.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(32); expect(box.height).toBeGreaterThanOrEqual(32);
    expect(await swatch.evaluate(element => { const box = element.getBoundingClientRect(); const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return !!hit && element.contains(hit); })).toBe(true);
  }
  await page.keyboard.press('Escape'); await expect(palette).not.toBeVisible(); await expect(tools(page)).toBeVisible();
  expect(await page.evaluate(() => window.editor.selection)).toEqual(owned); expect(await native(page)).toBe(before);
  await tools(page).locator('.w-toolbar-style').click();
  await expect(page.getByRole('option',{name:'Heading 1',exact:true})).toBeInViewport();
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  expect(await native(page)).toBe(before);
  await page.locator('#editor .w-cell').first().click(); await reachableTools(page,'선택한 표 도구');
  await (await openMore(page, page.getByLabel('선택한 표 도구',{exact:true}), true)).getByRole('combobox',{name:'표 정렬',exact:true}).click();
  await expect(page.getByRole('option',{name:'가운데 정렬',exact:true})).toBeInViewport();
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  expect(await native(page)).toBe(before);
  await page.mouse.wheel(0, 700); await page.mouse.wheel(0,-700);
  await selectProse(page); await reachableTools(page); expect(await native(page)).toBe(before);
});


test('owned tool dismissal returns editing focus and synthetic composition commits without losing rich content', async ({ page }, info) => {
  await open(page);
  await prose(page).locator('.mark-code').dblclick();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('Normal');
  await expect(tools(page)).toBeVisible();
  const before = await native(page);
  const selected = await page.evaluate(() => structuredClone(window.editor.selection));
  const boldControl = tools(page).getByRole('button', { name: 'Bold', exact: true });
  await boldControl.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(tools(page)).toBeVisible();
  await expect(boldControl).toBeFocused();
  expect(await native(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.selection)).toEqual(selected);
  await page.keyboard.press('Escape');
  await expect(tools(page)).toHaveCount(0);
  await expect(page.locator('#editor [contenteditable="true"]').first()).toBeFocused();
  expect(await native(page)).toBe(before);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => getSelection()?.anchorOffset)).toBe(1);
  const cdp = await page.context().newCDPSession(page);
  // CDP composition is a browser event check, not a physical Korean IME check.
  await cdp.send('Input.imeSetComposition', { text: 'ㅎ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  await expect.poll(() => native(page)).toBe(before);
  await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '한' });
  const expected = JSON.parse(before);
  const change = (node: { text?: string; marks?: { stype: string; range: number[] }[]; content?: unknown[] }): boolean => {
    if (node.text === 'Normal' && node.marks?.some(mark => mark.stype === 'code')) {
      node.text = 'N한ormal'; node.marks = [{ stype: 'code', range: [0, 7] }]; return true;
    }
    return (node.content ?? []).some(child => change(child as typeof node));
  };
  expect(change(expected)).toBe(true);
  await expect.poll(() => native(page)).toBe(JSON.stringify(expected));
  await expect(prose(page).locator('.mark-code')).toHaveText('N한ormal');
  await info.attach('synthetic-composition-native.json', { body: await native(page), contentType: 'application/json' });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect.poll(() => native(page)).toBe(before);
});
