import { expect, test, type Page } from '@playwright/test';

const bodyField = (page: Page) => page.locator('[data-row-form] [data-field="본문"]');

async function openFirstRow(page: Page) {
  await page.locator('[data-admin-tab="data"]').click();
  await page.locator('[data-admin-open]').last().click();
  await page.locator('[data-row-open]').first().click();
}

async function otherContent(page: Page, omitEditedBody = true) {
  return page.evaluate(omitEditedBody => {
    type Node = { stype?: string; sid?: string; metadata?: Record<string, unknown>; attributes?: Record<string, unknown>; content?: Node[] };
    const editor = (window as unknown as { editor: { exportDocument(): Node } }).editor;
    const omitBody = (node: Node): Node => {
      // Reopening assigns runtime SIDs and load timestamps; retain stored IDs and all content.
      const result = { ...node };
      delete result.sid;
      if (result.metadata) {
        result.metadata = { ...result.metadata };
        delete result.metadata.loadedAt;
      }
      if (omitEditedBody && node.stype === 'richText' && node.attributes?.id === '본문-스택') return { ...result, content: [] };
      return node.content ? { ...result, content: node.content.map(omitBody) } : result;
    };
    return omitBody(editor.exportDocument());
  }, omitEditedBody);
}

test.use({ viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' });

test('rich-text fields have group names while ordinary field labels still focus their inputs', async ({ page }) => {
  await page.goto('/');
  await openFirstRow(page);
  for (const name of ['요약', '본문']) {
    const field = page.locator(`[data-row-form] [data-field="${name}"]`);
    await expect(field).toHaveRole('group');
    await expect(field).toHaveAccessibleName(name);
  }
  for (const name of ['제목', '날짜']) {
    const field = page.locator(`[data-row-form] [data-field="${name}"]`);
    await field.locator('.st-row-label').click();
    await expect(field.locator('input')).toBeFocused();
  }
});

test('Site row table clicks edit the intended cells and survive undo and reload', async ({ page }, info) => {
  const otherDocument = await page.context().newPage();
  await otherDocument.goto('/');
  await expect(otherDocument.locator('[data-site-save-status]')).toHaveText('저장됨');
  const otherUrl = otherDocument.url();
  const originalOtherDocument = await otherContent(otherDocument, false);
  await page.bringToFront();
  await page.goto('/');
  await openFirstRow(page);
  expect(page.url()).not.toBe(otherUrl);
  const originalOtherContent = await otherContent(page);
  const summary = page.locator('[data-row-form] [data-field="요약"] [data-note-body]');
  const originalSummary = await summary.innerText();
  const body = bodyField(page).locator('[data-note-body]');
  await body.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  await expect(page.locator('[data-slash-item]').first()).toBeVisible();
  await page.keyboard.insertText('표');
  await expect(page.locator('[data-slash-item="insertTableBlock"]')).toHaveAttribute('data-current', 'true');
  await page.keyboard.press('Enter');
  const table = body.locator('table');
  await expect(table).toHaveCount(1);
  await page.keyboard.type('ALPHA');
  await expect(table.locator('th').first()).toHaveText('ALPHA');

  await table.locator('th').nth(1).click();
  await info.attach('cell-focus', { contentType: 'application/json', body: JSON.stringify(await table.evaluate(element => ({
    activeTag: document.activeElement?.tagName,
    activeLabel: document.activeElement?.getAttribute('aria-label'),
    labelControl: element.closest('label')?.control?.getAttribute('aria-label')
  }))) });
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-row-form] [data-field="본문"] [contenteditable="true"]'))).toBe(true);
  await page.keyboard.type('BETA');
  await expect(table.locator('th').nth(1)).toHaveText('BETA');
  await expect(table.locator('th').first()).toHaveText('ALPHA');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(table.locator('th').nth(1)).toHaveText('');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(table.locator('th').nth(1)).toHaveText('BETA');

  await table.locator('td').first().click();
  await page.keyboard.type('BODYCELL');
  await expect(table.locator('td').first()).toHaveText('BODYCELL');
  await expect(summary).toHaveText(originalSummary);
  expect(await otherContent(page)).toEqual(originalOtherContent);
  await expect.poll(() => page.evaluate(() => JSON.stringify(
    (window as unknown as { editor: { exportDocument(): unknown } }).editor.exportDocument()
  ).includes('BODYCELL'))).toBe(true);
  await expect(page.locator('[data-site-save-status]')).toHaveText('저장됨');
  const url = page.url();
  await page.reload();
  await openFirstRow(page);
  expect(page.url()).toBe(url);
  await expect(table.locator('th').first()).toHaveText('ALPHA');
  await expect(table.locator('th').nth(1)).toHaveText('BETA');
  await expect(table.locator('td').first()).toHaveText('BODYCELL');
  await table.locator('td').nth(1).click();
  await page.keyboard.type('AFTERRELOAD');
  await expect(table.locator('td').nth(1)).toHaveText('AFTERRELOAD');
  await expect(table.locator('th').first()).toHaveText('ALPHA');
  await expect(summary).toHaveText(originalSummary);
  expect(await otherContent(page)).toEqual(originalOtherContent);
  await expect(bodyField(page)).toHaveAccessibleName('본문');
  await page.screenshot({ path: info.outputPath('table-cell-editing.png') });

  await bodyField(page).getByRole('button', { name: '표 선택', exact: true }).click();
  await expect(table).toHaveAttribute('data-table-selected', 'true');
  await otherDocument.reload();
  await expect(otherDocument.locator('[data-site-save-status]')).toHaveText('저장됨');
  expect(otherDocument.url()).toBe(otherUrl);
  expect(await otherContent(otherDocument, false)).toEqual(originalOtherDocument);
});
