import { test, expect, type Page } from '@playwright/test';
import { openRepresentative, persistedDocument, selectSentence, sentence, viewState } from './document-centered.helpers';
const host = (page: Page) => page.locator('[data-note-document]');
const read = (page: Page) => host(page).getByRole('button', { name: '읽기 모드', exact: true });
const write = (page: Page) => host(page).getByRole('button', { name: '글쓰기 모드', exact: true });
async function reading(page: Page) { await read(page).click(); await expect(host(page)).toHaveAttribute('data-note-mode', 'reading'); await expect(read(page)).toHaveAttribute('aria-pressed', 'true'); }
async function writing(page: Page) { await write(page).click(); await expect(host(page)).toHaveAttribute('data-note-mode', 'writing'); await expect(write(page)).toHaveAttribute('aria-pressed', 'true'); }

test('document modes retain native content, logical nodes, selection and scroll in both themes', async ({ page }, info) => {
  await openRepresentative(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await page.screenshot({ path: info.outputPath(`${theme}-writing.png`), animations: 'disabled' });
    await info.attach(`${theme}-geometry.json`, { body: JSON.stringify({ theme, modeRow: await page.locator('.on-document-actions').boundingBox(), bodyHeading: await page.locator('.on-doc > h1').boundingBox(), document: await page.locator('.nw-document').boundingBox() }), contentType: 'application/json' });
    await selectSentence(page);
    await page.screenshot({ path: info.outputPath(`${theme}-selected-text.png`), animations: 'disabled' });
    const native = await persistedDocument(page), before = await viewState(page), layout = await page.locator('.on-doc > h1').boundingBox();
    await reading(page);
    await expect(page.locator('[data-note-formatting], [data-note-add], [data-note-grip], [data-note-block-menu]')).toHaveCount(0);
    await expect(page.getByLabel('노트 제목', { exact: true })).toHaveAttribute('readonly', '');
    expect(await persistedDocument(page)).toEqual(native);
    expect(await viewState(page)).toEqual(before); expect(await page.locator('.on-doc > h1').boundingBox()).toEqual(layout);
    await page.screenshot({ path: info.outputPath(`${theme}-reading.png`), animations: 'disabled' });
    await writing(page);
    expect(await persistedDocument(page)).toEqual(native);
    expect(await viewState(page)).toEqual(before); expect(await page.locator('.on-doc > h1').boundingBox()).toEqual(layout);
    await page.screenshot({ path: info.outputPath(`${theme}-writing-return.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.locator('.w-callout').first().hover(); await page.locator('[data-note-grip]').click(); await info.attach(`${theme}-block-state.json`, { body: JSON.stringify({ formattingCount: await page.locator('[data-note-formatting]').count(), menuCount: await page.locator('[data-note-block-menu]').count(), selectedText: await page.evaluate(() => getSelection()?.toString()), editable: await page.locator('.on-doc > p').first().evaluate(node => (node as HTMLElement).isContentEditable) }), contentType: 'application/json' }); await expect(page.locator('[data-note-block-menu]')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${theme}-selected-block.png`), animations: 'disabled' }); await page.keyboard.press('Escape'); await page.locator('.w-callout').first().hover(); await page.locator('[data-note-grip]').focus(); await page.keyboard.press('Enter'); await expect(page.locator('[data-note-block-menu]')).toBeVisible(); await page.keyboard.press('Escape');
    const last = page.locator('.on-doc > p').last(); await last.scrollIntoViewIfNeeded(); await last.click();
    const scrolled = await viewState(page); expect(scrolled.scrollTop).toBeGreaterThan(0);
    await reading(page); expect(await viewState(page)).toEqual(scrolled);
    await writing(page); expect(await viewState(page)).toEqual(scrolled);
    await page.locator('.on-doc > h1').scrollIntoViewIfNeeded();
  }
});

test('last typed input and nested table/math drafts survive immediate mode switch and reopen with meaningful undo', async ({ page }) => {
  await openRepresentative(page);
  const paragraph = page.locator('.on-doc > p').filter({ hasText: sentence }).first();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' LAST INPUT');
  await reading(page); await expect(paragraph).toContainText('LAST INPUT'); await writing(page);
  await paragraph.click(); await page.keyboard.press('ControlOrMeta+z'); await expect(paragraph).not.toContainText('LAST INPUT');
  await page.keyboard.press('ControlOrMeta+Shift+z'); await expect(paragraph).toContainText('LAST INPUT');
  const cell = page.locator('.on-doc td').first(); await cell.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' TABLE INPUT');
  await reading(page); await expect(cell).toContainText('TABLE INPUT'); await writing(page);
  const atom = page.getByRole('button', { name: '인라인 수식 편집', exact: true }); await atom.click();
  await page.locator('.oe-math-inplace .me-input:focus').fill('37');
  await reading(page); await expect(atom.locator('annotation')).toHaveText('37+1'); await writing(page);
  const code = page.locator('.on-doc pre').first(); await code.click({ position: { x: 8, y: 10 } }); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End'); await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.insertText('CODE INPUT'); await expect(code).toContainText('\n\tCODE INPUT'); await reading(page); await expect(code).toContainText('\n\tCODE INPUT'); await writing(page);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  const native = await persistedDocument(page); await page.reload();
  await expect(paragraph).toContainText('LAST INPUT'); await expect(cell).toContainText('TABLE INPUT'); await expect(atom.locator('annotation')).toHaveText('37+1'); await expect(code).toContainText('\n\tCODE INPUT');
  expect(await persistedDocument(page)).toEqual(native);
});

test('reading permits native selection and scroll while rejecting keyboard edits, paste, undo and stale tools', async ({ page }) => {
  await openRepresentative(page); await selectSentence(page);
  await page.keyboard.press('Escape'); await reading(page);
  const before = await persistedDocument(page);
  const paragraph = page.locator('.on-doc > p').filter({ hasText: sentence }).first();
  await expect(paragraph).toHaveJSProperty('isContentEditable', false);
  await paragraph.click({ position: { x: 8, y: 10 }, clickCount: 3 });
  await expect.poll(() => page.evaluate(() => getSelection()?.toString().trimEnd())).toBe(sentence);
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+f'); const query=page.getByLabel('본문에서 찾기', { exact: true }); await expect(query).toBeVisible(); await query.fill('fictional'); await query.press('Backspace'); await expect(query).toHaveValue('fictiona'); await query.press('Enter'); await query.press('Escape'); expect(await persistedDocument(page)).toEqual(before);
  const code = page.locator('.on-doc pre').first(); await code.click(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.type('FORBIDDEN CODE');
  await expect(code).not.toContainText('FORBIDDEN CODE'); expect(await persistedDocument(page)).toEqual(before);
  for (const key of ['FORBIDDEN', 'Backspace', 'ControlOrMeta+b', 'ControlOrMeta+z']) {
    if (key === 'FORBIDDEN') await page.keyboard.type(key); else await page.keyboard.press(key);
    await expect(page.locator('.on-doc')).toContainText(sentence); expect(await persistedDocument(page)).toEqual(before);
  }
  await paragraph.evaluate(node => { const data = new DataTransfer(); data.setData('text/plain', 'FORBIDDEN'); node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })); });
  await paragraph.evaluate(node => { const data = new DataTransfer(); data.setData('text/plain', 'FORBIDDEN DROP'); node.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data })); });
  await expect(paragraph).toHaveText(sentence); expect(await persistedDocument(page)).toEqual(before);
  await expect(page.locator('[data-note-formatting], [data-note-block-menu], [data-note-table-context]')).toHaveCount(0);
  await paragraph.press('Escape'); await writing(page); await selectSentence(page);
  await page.locator('[data-note-formatting]').getByRole('button', { name: '굵게', exact: true }).click();
  await expect(paragraph.locator('span').last()).toHaveCSS('font-weight', '700');
});

test('context tools use the current document for heading, bold, link, color and list; Escape removes stale targets', async ({ page }) => {
  await openRepresentative(page); await selectSentence(page);
  const tools = page.locator('[data-note-formatting]');
  await tools.getByRole('button', { name: '굵게', exact: true }).click();
  const block = page.locator('.on-doc > p').filter({ hasText: sentence }).first();
  await expect(block.locator('span').last()).toHaveCSS('font-weight', '700');
  await tools.getByRole('button', { name: '링크', exact: true }).click();
  await page.getByLabel('링크 주소').fill('https://example.com/new-reference'); await page.getByRole('button', { name: '링크 적용', exact: true }).click();
  await expect(block.locator('a')).toHaveAttribute('href', 'https://example.com/new-reference');
  await tools.getByRole('button', { name: '글자색 및 배경색', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '글자색 파랑', exact: true }).click();
  await expect(block.locator('a span').last()).toHaveCSS('color', 'rgb(51, 126, 169)');
  await tools.getByRole('button', { name: '문단 및 제목 수준', exact: true }).click();
  await page.getByRole('group', { name: '문단 유형', exact: true }).getByRole('button', { name: '제목 2', exact: true }).click();
  await expect(page.locator('.on-doc > h2')).toHaveText(sentence);
  await page.keyboard.press('Escape'); await expect(page.locator('[data-note-formatting]')).toHaveCount(0);
  await page.keyboard.insertText('ESCAPE INPUT'); await expect(page.locator('.on-doc > h2')).toHaveText('ESCAPE INPUT');
  await page.keyboard.press('ControlOrMeta+z'); await expect(page.locator('.on-doc > h2')).toHaveText(sentence);
  await page.locator('.on-doc > h2').hover(); await page.getByRole('button', { name: '블록 추가', exact: true }).click();
  await page.locator('[data-note-insert] [data-note-control="insertBulletList"]').click(); await page.keyboard.type('Fictional list item');
  await expect(page.locator('.on-doc')).toContainText('Fictional list item');
  await reading(page); await expect.poll(async () => JSON.stringify(await persistedDocument(page))).toContain('Fictional list item'); const native = await persistedDocument(page); await writing(page); expect(await persistedDocument(page)).toEqual(native);
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  await expect(page.getByLabel('노트 제목', { exact: true })).not.toHaveValue('Synthetic document review');
  await expect(page.locator('[data-note-formatting], [data-note-insert], [data-note-block-menu]')).toHaveCount(0);
  await page.locator('.on-doc > p').first().click(); await page.keyboard.insertText('OTHER DOCUMENT'); await page.keyboard.press('ControlOrMeta+b'); await expect(page.locator('.on-doc')).not.toContainText(sentence);
  await page.getByRole('button', { name: 'Synthetic document review', exact: true }).click(); await expect(page.locator('.on-doc > h2')).toHaveText(sentence); expect(await persistedDocument(page)).toEqual(native); await expect(page.locator('[data-note-formatting]')).toHaveCount(0);
});

test('synthetic composition keeps writing active until input ends and mode controls remain reachable at desktop zoom', async ({ page }) => {
  await openRepresentative(page); const paragraph = page.locator('.on-doc > p').filter({ hasText: sentence }).first(); await paragraph.click();
  await paragraph.dispatchEvent('compositionstart', { data: '' }); await read(page).click();
  await expect(host(page)).toHaveAttribute('data-note-mode', 'writing'); await expect(host(page).getByRole('status')).toContainText('입력을 마친');
  await paragraph.dispatchEvent('compositionend', { data: '' }); await reading(page); await writing(page);
  for (const zoom of ['1.25', '0.8']) {
    await page.evaluate(zoom => { document.body.style.zoom = zoom; }, zoom);
    await read(page).focus(); await page.keyboard.press('Enter'); await expect(host(page)).toHaveAttribute('data-note-mode', 'reading');
    const bounds = await read(page).boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
    await write(page).focus(); await page.keyboard.press('Space'); await expect(host(page)).toHaveAttribute('data-note-mode', 'writing');
    await selectSentence(page); const tools = await page.locator('[data-note-formatting]').boundingBox(); expect(tools).not.toBeNull(); expect(tools!.x).toBeGreaterThanOrEqual(0); expect(tools!.y).toBeGreaterThanOrEqual(0); expect(tools!.x + tools!.width).toBeLessThanOrEqual(1440); expect(tools!.y + tools!.height).toBeLessThanOrEqual(900); await page.keyboard.press('Escape');
  }
});

test('independent database item final input is saved when the modal closes and the parent enters reading', async ({ page }) => {
  await openRepresentative(page);
  const document = { stype: 'note', attributes: { title: 'Synthetic document review' }, content: [
    { stype: 'noteDatabase', attributes: { source: 'fictional' } },
    { stype: 'resources', content: [
      { stype: 'dataset', attributes: { name: 'fictional', label: 'Fictional items', fields: [{ name: 'Title', kind: 'text' }], rowIds: ['fictional-a'], records: [{ Title: 'Fictional entry' }] } },
      { stype: 'richText', attributes: { id: 'fictional-a' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Child draft starts here.' }] }] }
    ] }
  ] };
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'child.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document })) });
  const db = page.locator('[data-note-database-ui]'); await db.getByRole('button', { name: '행 1 열기', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '데이터베이스 항목', exact: true });
  const body = modal.locator('[data-db-item-body] .on-doc > p').first(); await expect(body).toHaveText('Child draft starts here.');
  await body.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' FINAL CHILD INPUT');
  await modal.getByRole('button', { name: '닫기', exact: true }).click(); await expect(modal).toHaveCount(0); await reading(page); await writing(page);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨'); const native = await persistedDocument(page);
  expect(JSON.stringify(native)).toContain('FINAL CHILD INPUT'); await page.reload();
  await db.getByRole('button', { name: '행 1 열기', exact: true }).click(); await expect(body).toContainText('FINAL CHILD INPUT');
  await body.click(); await page.keyboard.press('ControlOrMeta+z');
  // Reopening starts a fresh child history; it must not undo the parent mode or delete saved content.
  await expect(body).toContainText('FINAL CHILD INPUT');
});
