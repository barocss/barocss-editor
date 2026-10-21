import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { selectSentence, viewState, sentence, documentTitle } from './document-centered.helpers';

// This producer fixture declares empty attributes/content before import. It does not
// normalize observed output; the sparse accepted fixture and its default materialization
// are retained separately in the before evidence.
function fullFixture(code = false) {
  const text = (value: string, marks?: unknown[]) => ({ stype: 'inline-text', text: value, attributes: {}, content: [], ...(marks ? { marks } : {}) });
  const paragraph = (value: string) => ({ stype: 'paragraph', attributes: {}, content: [text(value)] });
  return { stype: 'note', attributes: { title: documentTitle, pageId: 'a5b7ea5b-6410-4c15-a352-b4e7cfb0a424' }, content: [
    { stype: 'heading', attributes: { level: 1 }, content: [text('Fictional release review')] },
    { stype: 'paragraph', attributes: {}, content: [text(sentence, code ? [{ stype: 'code', range: [0, sentence.length] }] : undefined)] },
    { stype: 'paragraph', attributes: {}, content: [text('Open the synthetic reference.', [{ stype: 'link', attrs: { href: 'https://example.com/reference' }, range: [0, 29] }])] },
    { stype: 'callout', attributes: { type: 'note' }, content: [{ stype: 'calloutTitle', attributes: {}, content: [text('Keep source context')] }, paragraph('Nested fictional context remains editable.')] },
    { stype: 'bTable', attributes: {}, content: [
      { stype: 'bTableHeader', attributes: {}, content: ['Item', 'Result'].map(value => ({ stype: 'bTableHeaderCell', attributes: {}, content: [text(value)] })) },
      { stype: 'bTableBody', attributes: {}, content: [{ stype: 'bTableRow', attributes: {}, content: ['Synthetic item', 'Pending review'].map(value => ({ stype: 'bTableCell', attributes: {}, content: [text(value)] })) }] }
    ] },
    { stype: 'codeBlock', attributes: { language: 'javascript' }, content: [text('const synthetic = true;')] },
    { stype: 'paragraph', attributes: {}, content: [text('Equation '), { stype: 'mathInline', attributes: { tex: 'x+1' }, content: [] }, text(' belongs to the sentence.')] },
    { stype: 'paragraph', attributes: {}, content: [text('Native reference '), { stype: 'pageReference', attributes: { pageId: 'a5b7ea5b-6410-4c15-a352-b4e7cfb0a424', title: 'Synthetic self reference' }, content: [] }] },
    ...Array.from({ length: 16 }, (_, index) => paragraph(`Fictional appendix ${index + 1}: scroll and selection remain in this document.`)), paragraph('Final synthetic paragraph.')
  ] };
}

async function activeNative(page: Page) {
  return page.evaluate(() => new Promise<unknown>((resolve, reject) => {
    const id = decodeURIComponent(location.hash.slice(1)), request = indexedDB.open('barocss-note', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, transaction = db.transaction('documents'), row = transaction.objectStore('documents').get(id);
      transaction.oncomplete = () => { db.close(); if (!row.result) { reject(new Error(`Active Note ${id} was not saved`)); return; } resolve(JSON.parse(row.result.text).document); };
      transaction.onabort = () => reject(transaction.error);
    };
  }));
}

async function openFullNote(page: Page, code = false) {
  await page.goto('/'); await expect(page.getByLabel('노트 제목', { exact: true })).toBeVisible(); const document = fullFixture(code);
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'compact-rich.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document })) });
  await expect.poll(() => activeNative(page)).toEqual(document);
  const downloaded = page.waitForEvent('download'); await openExport(page);
  await page.getByRole('button', { name: '파일 내려받기', exact: true }).click(); const file = await downloaded;
  const bytes = await readFile((await file.path())!, 'utf8'); expect(JSON.parse(bytes).document).toEqual(document);
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'compact-roundtrip.note.json', mimeType: 'application/json', buffer: Buffer.from(bytes) });
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash.slice(1))).not.toBe(document.attributes.pageId);
  const newId = decodeURIComponent(new URL(page.url()).hash.slice(1));
  expect(newId).toMatch(/^[0-9a-f-]{36}$/); expect(newId).not.toBe(document.attributes.pageId);
  const copied = structuredClone(document); copied.attributes.pageId = newId;
  const reference = copied.content[7].content![1] as { attributes: { pageId: string } }; reference.attributes.pageId = newId;
  await expect.poll(() => activeNative(page)).toEqual(copied);
}

async function openExport(page: Page) {
  await page.getByRole('menuitem', { name: '노트 메뉴', exact: true }).click();
  await page.getByRole('menu', { name: '노트 메뉴', exact: true }).getByRole('menuitem', { name: '내보내기', exact: true }).click();
}

async function calloutContrast(page: Page) {
  return page.locator('.w-callout').first().evaluate(element => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const context = canvas.getContext('2d')!;
    const rgb = (color: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const luminance = (values: number[]) => values.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
    const background = getComputedStyle(element).backgroundColor;
    const titleElement = [...element.querySelectorAll('*')].find(node => node.textContent === 'Keep source context')!;
    const title = getComputedStyle(titleElement).color, body = getComputedStyle(element.querySelector('p')!).color;
    const contrast = (color: string) => { const foreground = luminance(rgb(color)), back = luminance(rgb(background)); return (Math.max(foreground, back) + .05) / (Math.min(foreground, back) + .05); };
    return { background, title, body, titleContrast: contrast(title), bodyContrast: contrast(body) };
  });
}

async function compactSurface(page: Page, selector = '[data-note-formatting]', minimumControls = 6) {
  const tools = page.locator(selector);
  await tools.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined))); });
  const measurements = await tools.evaluate(element => {
    const rect = (node: Element) => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; };
    return { surface: rect(element), radius: getComputedStyle(element).borderRadius, controls: [...element.querySelectorAll('button,input,[role="combobox"]')].filter(node => node.getBoundingClientRect().width > 0 && node.closest('[data-floating-surface]') === element).map(node => {
      const box = rect(node), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { label: node.getAttribute('aria-label') ?? node.textContent, box, radius: getComputedStyle(node).borderRadius, reachable: node === hit || node.contains(hit) };
    }) };
  });
  expect(measurements.surface.height).toBeGreaterThanOrEqual(40);
  expect(measurements.surface.height).toBeLessThanOrEqual(44);
  expect(measurements.surface.width).toBeLessThanOrEqual(480);
  expect(measurements.radius).toBe('20px');
  expect(measurements.controls.length).toBeGreaterThanOrEqual(minimumControls);
  for (const control of measurements.controls) {
    expect(control.box.height, `${control.label}: minimum hit height`).toBeGreaterThanOrEqual(32);
    expect(control.box.width, `${control.label}: minimum hit width`).toBeGreaterThanOrEqual(32);
    expect(control.box.y).toBeGreaterThanOrEqual(measurements.surface.y);
    expect(control.box.y + control.box.height).toBeLessThanOrEqual(measurements.surface.y + measurements.surface.height);
    expect(control.box.x).toBeGreaterThanOrEqual(measurements.surface.x);
    expect(control.box.x + control.box.width).toBeLessThanOrEqual(measurements.surface.x + measurements.surface.width);
    expect(control.reachable, `${control.label}: actual center hit`).toBe(true);
    expect(control.radius, `${control.label}: inner control radius`).toBe('10px');
  }
  expect(measurements.controls[0].box.x - measurements.surface.x).toBeGreaterThanOrEqual(12);
  const last = measurements.controls.at(-1)!;
  expect(measurements.surface.x + measurements.surface.width - last.box.x - last.box.width).toBeGreaterThanOrEqual(12);
  expect(new Set(measurements.controls.map(control => Math.round(control.box.y))).size).toBe(1);
  return measurements;
}

for (const [width, height] of [[1440, 900], [1280, 800]]) for (const theme of ['light', 'dark']) {
  test(`compact Note chrome and owned tools at ${width}x${height} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height }); await openFullNote(page);
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    const colors = await calloutContrast(page); expect(colors.titleContrast).toBeGreaterThanOrEqual(4.5); expect(colors.bodyContrast).toBeGreaterThanOrEqual(4.5);
    await info.attach('callout-colors.json', { body: JSON.stringify(colors), contentType: 'application/json' });
    const header = page.locator('.nw-header'); const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull(); expect(headerBox!.height).toBeLessThanOrEqual(56);
    await expect(page.locator('[data-note-formatting]')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('idle.png'), animations: 'disabled' });
    const native = await activeNative(page); await selectSentence(page); const selected = await viewState(page);
    await expect(page.locator('[data-note-formatting]').getByRole('button', { name: '굵게', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '문단 및 제목 수준', exact: true })).toBeVisible();
    const geometry = await compactSurface(page);
    await page.screenshot({ path: info.outputPath('selected.png'), animations: 'disabled' });
    await info.attach('geometry.json', { body: JSON.stringify({ header: headerBox, ...geometry }), contentType: 'application/json' });
    const tools = page.locator('[data-note-formatting]');
    await tools.getByRole('button', { name: '추가 서식', exact: true }).click();
    const more = page.getByRole('menu', { name: '추가 서식', exact: true });
    await expect(more).toBeVisible(); await expect(more.getByRole('menuitem', { name: '밑줄', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('more.png'), animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(more).toHaveCount(0);
    expect(await activeNative(page)).toEqual(native); expect(await viewState(page)).toEqual(selected);
    await expect(tools).toBeVisible(); await expect(tools.getByRole('button', { name: '추가 서식', exact: true })).toBeFocused();
    await tools.getByRole('button', { name: '추가 서식', exact: true }).click(); await expect(more).toBeVisible();
    await more.getByRole('menuitem', { name: '밑줄', exact: true }).click();
    const paragraph = page.locator('.on-doc > p').filter({ hasText: sentence }).first();
    await expect(paragraph.locator('.mark-underline')).toHaveCSS('text-decoration-line', 'underline');
    const expected = structuredClone(native) as { content: Array<{ content: Array<{ marks?: unknown[] }> }> };
    expected.content[1].content[0].marks = [{ stype: 'underline', range: [0, sentence.length] }];
    await expect.poll(() => activeNative(page)).toEqual(expected);
    await page.keyboard.press('Escape'); await page.keyboard.press('ControlOrMeta+z');
    await expect(paragraph.locator('.mark-underline')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Shift+z'); await expect(paragraph.locator('.mark-underline')).toHaveCSS('text-decoration-line', 'underline');
    await page.getByLabel('노트 제목', { exact: true }).focus(); await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
    const edited = await activeNative(page); expect(edited).not.toEqual(native);
    await page.reload(); expect(await activeNative(page)).toEqual(edited); await expect(paragraph.locator('.mark-underline')).toHaveCSS('text-decoration-line', 'underline');
  });
}

for (const [width, height] of [[1440, 900], [1280, 800]]) for (const theme of ['light', 'dark']) {
  test(`compact Note table tools at ${width}x${height} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height }); await openFullNote(page);
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    const native = await activeNative(page);
    await page.locator('.on-doc td').first().click();
    await expect(page.locator('[data-note-table-context]')).toBeVisible();
    await page.screenshot({ path: info.outputPath('selected-table.png'), animations: 'disabled' });
    const geometry = await compactSurface(page, '[data-note-table-context]', 4);
    await info.attach('table-geometry.json', { body: JSON.stringify(geometry), contentType: 'application/json' });
    expect(await activeNative(page)).toEqual(native);
  });
}

test('temporary link editor and table menus preserve the final rich draft and native file', async ({ page }, info) => {
  await openFullNote(page, true);
  await expect(page.locator('.on-doc > p').filter({ hasText: sentence }).first().locator('.mark-code')).toBeVisible();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  const initial = await activeNative(page); await selectSentence(page);
  const tools = page.locator('[data-note-formatting]'); await expect(tools.getByRole('button', { name: '굵게', exact: true })).toBeEnabled();
  const before = await viewState(page);
  const styles = page.getByRole('menu', { name: '문단 유형', exact: true });
  await tools.getByRole('button', { name: '문단 및 제목 수준', exact: true }).click();
  await expect(styles.getByRole('menuitem', { name: '문단', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(styles).toHaveCount(0); await expect(tools).toBeVisible();
  await expect(tools.getByRole('button', { name: '문단 및 제목 수준', exact: true })).toBeFocused();
  expect(await activeNative(page)).toEqual(initial); expect(await viewState(page)).toEqual(before);
  await tools.getByRole('button', { name: '문단 및 제목 수준', exact: true }).click();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await expect(styles.getByRole('menuitem', { name: '제목 2', exact: true })).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('.on-doc > h2')).toHaveText(sentence); await page.keyboard.press('Escape'); await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => activeNative(page)).toEqual(initial); await selectSentence(page);
  await tools.getByRole('button', { name: '글자색 및 배경색', exact: true }).click();
  const colors = page.getByRole('menu', { name: '글자 색상 선택', exact: true }); await expect(colors).toBeVisible();
  await page.keyboard.press('Escape'); await expect(colors).toHaveCount(0); await expect(tools).toBeVisible();
  await expect(tools.getByRole('button', { name: '글자색 및 배경색', exact: true })).toBeFocused();
  expect(await activeNative(page)).toEqual(initial); expect(await viewState(page)).toEqual(before);
  await tools.getByRole('button', { name: '글자색 및 배경색', exact: true }).click(); await expect(colors).toBeVisible();
  await page.keyboard.press('Escape');
  await tools.getByRole('button', { name: '링크', exact: true }).click();
  const field = page.getByLabel('링크 주소', { exact: true }); await expect(field).toBeVisible();
  await field.fill('https://example.com/fictional-final-link');
  expect(await activeNative(page)).toEqual(initial);
  await compactSurface(page);
  await page.screenshot({ path: info.outputPath('link-draft.png'), animations: 'disabled' });
  await field.press('Escape'); await expect(field).toHaveCount(0); await expect(tools).toBeVisible();
  await expect(tools.getByRole('button', { name: '링크', exact: true })).toBeFocused();
  expect(await activeNative(page)).toEqual(initial); expect(await viewState(page)).toEqual(before);
  await tools.getByRole('button', { name: '링크', exact: true }).click(); await expect(field).toHaveValue('https://example.com/fictional-final-link');
  await page.getByRole('button', { name: '링크 적용', exact: true }).click();
  const paragraph = page.locator('.on-doc > p').filter({ hasText: sentence }).first();
  await expect(paragraph.locator('a')).toHaveAttribute('href', 'https://example.com/fictional-final-link');
  await page.keyboard.press('Escape'); await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => activeNative(page)).toEqual(initial); await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(paragraph.locator('a')).toHaveAttribute('href', 'https://example.com/fictional-final-link');
  const cell = page.locator('.on-doc td').first(); await cell.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End'); await page.keyboard.insertText(' FINAL CELL INPUT');
  await expect(cell).toHaveText('Synthetic item FINAL CELL INPUT');
  await page.locator('[data-note-table-context]').getByRole('button', { name: '행 편집', exact: true }).click();
  await expect(page.getByRole('menu', { name: '행 편집', exact: true })).toBeVisible(); await page.keyboard.press('Escape');
  await page.getByLabel('노트 제목', { exact: true }).focus(); await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  const saved = await activeNative(page);
  const download = page.waitForEvent('download'); await openExport(page);
  await page.getByRole('button', { name: '파일 내려받기', exact: true }).click();
  const file = await download; const bytes = await readFile((await file.path())!, 'utf8');
  expect(JSON.parse(bytes).document).toEqual(saved);
  await page.reload(); await expect(page.getByLabel('노트 제목', { exact: true })).toHaveValue(documentTitle);
  await expect(cell).toHaveText('Synthetic item FINAL CELL INPUT'); expect(await activeNative(page)).toEqual(saved);
});

test('compact row menu inserts one blank row and preserves exact undo, redo and native reopen', async ({ page }, info) => {
  await openFullNote(page, true);
  const initial = await activeNative(page);
  const cell = page.locator('.on-doc td').first();
  await cell.click();
  const tools = page.locator('[data-note-table-context]');
  await tools.getByRole('button', { name: '행 편집', exact: true }).click();
  const menu = page.getByRole('menu', { name: '행 편집', exact: true });
  await expect(menu).toBeVisible();
  await menu.locator('[data-note-table-action="insertRowBelow"]').click();
  await expect(page.locator('.on-doc tbody tr')).toHaveCount(2);
  await expect(page.locator('.on-doc tbody tr').nth(1).locator('td')).toHaveText(['', '']);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  const expected = structuredClone(initial) as {
    content: Array<{ stype: string; content: Array<{ stype: string; content: unknown[] }> }>;
  };
  expected.content.find(node => node.stype === 'bTable')!.content.find(node => node.stype === 'bTableBody')!.content.push({
    stype: 'bTableRow', content: [0, 1].map(() => ({
      stype: 'bTableCell', attributes: { colspan: 1, rowspan: 1 }, content: [{ stype: 'inline-text', text: '', content: [] }],
    })),
  });
  await expect.poll(() => activeNative(page)).toEqual(expected);
  await page.screenshot({ path: info.outputPath('inserted-row.png'), animations: 'disabled' });
  await cell.click(); await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.on-doc tbody tr')).toHaveCount(1);
  await expect.poll(() => activeNative(page)).toEqual(initial);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('.on-doc tbody tr')).toHaveCount(2);
  await expect.poll(() => activeNative(page)).toEqual(expected);
  await page.getByLabel('노트 제목', { exact: true }).focus();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  const download = page.waitForEvent('download'); await openExport(page);
  await page.getByRole('button', { name: '파일 내려받기', exact: true }).click();
  expect(JSON.parse(await readFile((await (await download).path())!, 'utf8')).document).toEqual(expected);
  await page.reload();
  await expect(page.getByLabel('노트 제목', { exact: true })).toHaveValue(documentTitle);
  await expect(page.locator('.on-doc tbody tr')).toHaveCount(2);
  await expect.poll(() => activeNative(page)).toEqual(expected);
});
