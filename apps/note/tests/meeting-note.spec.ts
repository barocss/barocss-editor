import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const text = (value: string) => ({ stype: 'inline-text', text: value });
const paragraph = (value: string) => ({ stype: 'paragraph', content: [text(value)] });
const fixture = {
  format: 'barocss-note', version: 1,
  document: { stype: 'note', attributes: { title: '제품 회의' }, content: [
    paragraph('Write together'),
    { stype: 'taskItem', attributes: { checked: false }, content: [text('Ship Note')] },
    { stype: 'bDetails', attributes: { open: true }, content: [
      { stype: 'bSummary', content: [text('Decisions')] }, paragraph('Keep the context')
    ] },
    { stype: 'callout', attributes: { type: 'info', title: 'Remember' }, content: [paragraph('Save our work')] }
  ] }
};

async function openBlockSettings(page: Page, block: Locator) {
  const sid = await block.getAttribute('data-bc-sid');
  const handle = page.locator('[data-note-grip]');
  await expect(handle).toHaveAttribute('data-note-grip', sid!);
  await handle.click();
  await expect(page.getByRole('menu', { name: '블록 메뉴', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: '블록 설정', exact: true }).click();
}

test('문맥 도구로 서식과 블록 속성을 바꾸고 저장·내보내기·열기로 유지한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일').setInputFiles({ name: 'meeting.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('제품 회의');
  const editor = page.locator('[data-note-editor]');
  await expect(editor.locator('[data-note-bar]')).toHaveCount(0);
  const first = editor.locator('.on-doc > p').first();
  await first.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await expect(editor.locator('[data-note-formatting]')).toHaveCount(0);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowLeft' : 'Shift+Home');
  const formatting = editor.getByRole('toolbar', { name: '선택한 글 서식' });
  await expect(formatting).toBeVisible();
  await formatting.screenshot({ path: testInfo.outputPath('text-toolbar.png') });
  await formatting.getByRole('button', { name: '굵게', exact: true }).click();
  await expect(first.locator('span').last()).toHaveCSS('font-weight', '700');
  await formatting.getByRole('button', { name: '링크', exact: true }).click();
  await page.getByLabel('링크 주소').fill('https://example.com/meeting');
  await page.getByRole('button', { name: '링크 적용', exact: true }).click();
  await expect(first.locator('a')).toHaveAttribute('href', 'https://example.com/meeting');

  await editor.locator('[data-checklist-toggle]').click();
  await expect(editor.locator('[data-checklist-toggle]')).toHaveAttribute('aria-checked', 'true');
  await editor.locator('summary').click({ position: { x: 5, y: 8 } });
  await expect(editor.locator('details')).not.toHaveAttribute('open');
  await editor.locator('.w-callout p').click();
  const properties = editor.locator('[data-note-properties]');
  await expect(properties).toHaveCount(0);
  await openBlockSettings(page, editor.locator('.w-callout'));
  await expect(properties).toBeVisible();
  const header = properties.locator('[data-floating-panel-header]');
  const headingBox = await header.getByText('콜아웃', { exact: true }).boundingBox();
  const closeBox = await header.getByRole('button', { name: '속성 닫기' }).boundingBox();
  expect(headingBox).not.toBeNull();
  expect(closeBox).not.toBeNull();
  expect(Math.abs(headingBox!.y + headingBox!.height / 2 - closeBox!.y - closeBox!.height / 2)).toBeLessThan(2);
  expect(closeBox!.x).toBeGreaterThan(headingBox!.x + headingBox!.width);
  await properties.screenshot({ path: testInfo.outputPath('block-properties.png') });
  await properties.locator('[data-note-field="type"]').selectOption('warning');
  await properties.getByRole('button', { name: '속성 닫기' }).click();
  await editor.locator('.w-callout-title').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowLeft' : 'Shift+Home');
  await page.keyboard.type('Release check');
  await expect(editor.locator('.w-callout')).toHaveAttribute('data-callout-type', 'warning');
  await expect(editor.locator('.w-callout-title')).toHaveText('Release check');
  expect(errors).toEqual([]);
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
  await page.reload();
  await expect(page.getByLabel('노트 제목')).toHaveValue('제품 회의');
  await expect(editor.locator('[data-checklist-toggle]')).toHaveAttribute('aria-checked', 'true');
  await expect(editor.locator('details')).not.toHaveAttribute('open');
  await expect(editor.locator('.w-callout-title')).toHaveText('Release check');
  await expect(editor.locator('.on-doc > p a')).toHaveAttribute('href', 'https://example.com/meeting');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.getByRole('button', { name: '파일 내려받기', exact: true }).click();
  const download = await downloaded;
  const path = await download.path();
  expect(path).toBeTruthy();
  const exported = JSON.parse(await readFile(path!, 'utf8'));
  expect(exported.document.content[1].attributes.checked).toBe(true);
  expect(exported.document.content[2].attributes.open).toBe(false);
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  await page.getByLabel('노트 파일').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: await readFile(path!) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('제품 회의');
  await expect(editor.locator('.w-callout-title')).toHaveText('Release check');
});

test('블록 옆 추가 메뉴와 슬래시 메뉴에서 쓰기 블록을 넣는다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  const editor = page.locator('[data-note-editor]');
  await editor.locator('.on-doc p').first().click();
  await editor.getByRole('button', { name: '블록 추가', exact: true }).click();
  const menu = editor.locator('[data-note-insert]');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await editor.getByRole('button', { name: '블록 추가', exact: true }).click();
  await menu.locator('[data-note-control="insertChecklist"]').click();
  await expect(editor.locator('.w-task-item')).toHaveCount(1);
  await expect(menu).toHaveCount(0);
  await page.keyboard.type('Review today');
  await expect(editor.locator('.w-task-content')).toContainText('Review today');
  await editor.locator('.on-doc > p').first().click();
  await page.keyboard.type('/');
  await page.locator('[data-slash-item="insertCallout"]').click();
  await expect(editor.locator('.w-callout')).toHaveCount(1);
});

test('속성은 선택한 블록을 따르고 글을 선택하면 서식 도구만 보인다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  const document = { ...fixture.document, content: [
    { stype: 'callout', attributes: { type: 'info', title: 'First' }, content: [paragraph('First words')] },
    { stype: 'bDetails', attributes: { open: true }, content: [
      { stype: 'bSummary', content: [text('More context')] },
      paragraph('A nested block has its own properties.'),
      { stype: 'callout', attributes: { type: 'tip', title: 'Second' }, content: [paragraph('Second words')] }
    ] }
  ] };
  await page.getByLabel('노트 파일').setInputFiles({ name: 'blocks.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...fixture, document })) });
  const blocks = page.locator('.w-callout');
  const title = page.locator('[data-note-properties] [data-note-field="type"]');
  await blocks.first().locator('p').click();
  await expect(title).toHaveCount(0);
  await openBlockSettings(page, blocks.first());
  await expect(title).toHaveValue('info');
  await blocks.last().locator('p').click();
  await openBlockSettings(page, blocks.last());
  await expect(title).toHaveValue('tip');
  const panelBox = await page.locator('[data-note-properties]').boundingBox();
  const blockBox = await blocks.last().boundingBox();
  expect(panelBox).not.toBeNull();
  expect(blockBox).not.toBeNull();
  expect(Math.abs(panelBox!.y + panelBox!.height + 6 - blockBox!.y)).toBeLessThan(2);
  await title.selectOption('warning');
  await page.getByRole('button', { name: '속성 닫기', exact: true }).click();
  await blocks.last().locator('.w-callout-title').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowLeft' : 'Shift+Home');
  await page.keyboard.type('Second revised');
  await page.keyboard.press('Enter');
  await expect(blocks.locator('p')).toHaveCount(2);
  await expect(blocks.last().locator('.w-callout-title')).toHaveText('Second revised');
  await expect(blocks.first().locator('.w-callout-title')).toHaveText('First');
  await blocks.first().locator('p').click();
  await expect(title).toHaveCount(0);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(page.locator('[data-note-formatting]')).toBeVisible();
  await expect(page.locator('[data-note-properties]')).not.toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-note-formatting]')).toHaveCount(0);
  await expect(title).toHaveCount(0);
  await openBlockSettings(page, blocks.first());
  await expect(title).toHaveValue('info');
});

test('속성·제목의 Backspace는 이미지를 삭제하지 않고 본문 Delete만 선택 블록을 지운다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByRole('button', { name: '새 노트', exact: true }).click();
  const editor = page.locator('[data-note-editor]');
  await editor.locator('.on-doc p').first().click();
  await editor.getByRole('button', { name: '블록 추가', exact: true }).click();
  await editor.locator('[data-note-control="insertPicture"]').click();
  const picture = editor.locator('.on-picture');
  await expect(picture).toHaveCount(1);
  await picture.click();
  await openBlockSettings(page, picture);
  const alt = editor.locator('[data-note-field="alt"]');
  await alt.fill('Image description');
  await alt.press('Backspace');
  await alt.press('Enter');
  await expect(picture).toHaveAttribute('alt', 'Image descriptio');
  const title = page.getByLabel('노트 제목');
  await title.fill('Meeting');
  await title.press('Backspace');
  await expect(title).toHaveValue('Meetin');
  await expect(picture).toHaveCount(1);
  await picture.click();
  await page.keyboard.press('Delete');
  await expect(picture).toHaveCount(0);
});

test('글자 도구가 내부 잘림과 배율 변경을 추적하고 Escape 닫힘을 유지한다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByLabel('노트 제목')).toBeVisible();
  await page.getByLabel('노트 파일').setInputFiles({ name: 'range.note.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByLabel('노트 제목')).toHaveValue('제품 회의');
  const first = page.locator('.on-doc > p').first();
  await first.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowLeft' : 'Shift+Home');
  const toolbar = page.getByRole('toolbar', { name: '선택한 글 서식', exact: true });
  await expect(toolbar).toBeVisible();
  const before = await toolbar.boundingBox();
  const original = await page.locator('.on-doc').getAttribute('style');
  await page.locator('.on-doc').evaluate(element => { (element as HTMLElement).style.transform = 'translate(50px, 35px) scale(.9)'; });
  await expect.poll(async () => Math.abs((await toolbar.boundingBox())!.y - before!.y)).toBeGreaterThan(15);
  await page.locator('.on-doc').evaluate(element => Object.assign((element as HTMLElement).style, { minHeight: '0', height: '1px', overflow: 'hidden' }));
  await expect(toolbar).toBeHidden();
  await page.locator('.on-doc').evaluate((element, style) => { if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style); }, original);
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: '굵게', exact: true }).click();
  await expect(first.locator('span').last()).toHaveCSS('font-weight', '700');
  await page.keyboard.press('Escape');
  await expect(toolbar).toBeHidden();
  await page.locator('.on-doc').evaluate(element => { (element as HTMLElement).style.transform = 'translateY(10px)'; });
  await expect(toolbar).toBeHidden();
  expect(errors).toEqual([]);
});
