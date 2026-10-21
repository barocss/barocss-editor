import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ retries: 0 });
test.use({ trace: 'retain-on-failure', screenshot: 'only-on-failure' });

interface ExportNode {
  sid?: string;
  stype: string;
  text?: string;
  attributes?: Record<string, unknown>;
  content?: ExportNode[];
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const editor = (window as unknown as { editor: { exportDocument(): ExportNode } }).editor;
    const nodes: ExportNode[] = [];
    const visit = (node: ExportNode) => {
      nodes.push(node);
      for (const child of node.content ?? []) visit(child);
    };
    visit(editor.exportDocument());
    const dataset = nodes.find(node => node.stype === 'dataset' && node.attributes?.name === '글');
    if (!dataset) throw new Error('Sample blog dataset is missing');
    const textOf = (node: ExportNode): string => typeof node.text === 'string'
      ? node.text : (node.content ?? []).map(textOf).join('');
    const normalizeChildren = (node: ExportNode): ExportNode => ({
      ...node,
      content: (node.content ?? []).map(normalizeChildren),
    });
    const richText = Object.fromEntries(nodes.filter(node => node.stype === 'richText').map(node => [
      String(node.attributes?.id), {
        text: textOf(node),
        tree: normalizeChildren(JSON.parse(JSON.stringify(node, (key, value) => ['sid', 'parentId', 'metadata'].includes(key) ? undefined : value)) as ExportNode),
      },
    ]));
    return { records: dataset.attributes?.records as Array<Record<string, unknown>>, richText };
  });
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>;
const saved = (page: Page) => expect(page.locator('[data-site-save-status]')).toHaveText('저장됨');
const field = (page: Page, name: string) => page.locator(`[data-row-form] [data-field="${name}"]`);
const resolved = (state: Snapshot, row: number, name: string) => {
  const value = state.records[row]?.[name];
  return typeof value === 'string' && value.startsWith('text:') ? state.richText[value.slice(5)]?.text : value ?? '';
};

async function openBlogData(page: Page) {
  await page.locator('[data-admin-tab="data"]').click();
  await page.locator('[data-admin-open]').last().click();
  await expect(page.locator('[data-dataset-page="글"]')).toBeVisible();
}

async function writeEmptyField(page: Page, name: string, text: string, checkHistory: boolean) {
  const control = field(page, name);
  await expect(control.locator('[data-note-body]')).toHaveCount(0);
  await control.getByRole('button', { name: `${name} 작성`, exact: true }).click();
  const paragraph = control.locator('[data-note-body] p').first();
  await expect(paragraph).toBeVisible();
  await paragraph.click();
  await page.keyboard.insertText(text);
  await expect(paragraph).toHaveText(text);
  if (checkHistory) {
    await page.keyboard.press('ControlOrMeta+z');
    await expect(paragraph).toHaveText('');
    await expect(control.locator('[data-note-body]')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(paragraph).toHaveText(text);
  }
}

function expectOthersUnchanged(current: Snapshot, original: Snapshot, editedRow: number) {
  for (const [index, record] of original.records.entries()) {
    if (index !== editedRow) expect(current.records[index]).toEqual(record);
  }
  for (const [id, rich] of Object.entries(original.richText)) expect(current.richText[id]).toEqual(rich);
}

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  try {
    await info.attach('empty-note-body-state', { body: JSON.stringify(await snapshot(page), null, 2), contentType: 'application/json' });
  } catch (error) {
    await info.attach('empty-note-body-diagnostic-error', { body: String(error), contentType: 'text/plain' });
  }
});

for (const scenario of ['existing third row', 'new fifth row'] as const) {
  test(`creates and autosaves a Note body in the ${scenario} without changing other rows`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await saved(page);
    await openBlogData(page);
    const original = await snapshot(page);
    expect(original.records).toHaveLength(4);
    const isNew = scenario === 'new fifth row';
    const row = isNew ? 4 : 2;
    if (isNew) {
      await page.locator('[data-dataset-page="글"]').getByRole('button', { name: '행 추가', exact: true }).click();
      await expect(page.locator('[data-row-open]')).toHaveCount(5);
    } else {
      expect(original.records[row].제목).toBe('커서는 누구의 것인가');
      expect(original.records[row].본문 ?? '').toBe('');
    }
    await page.locator(`[data-row-open="${row}"]`).click();
    const title = isNew ? '새 행의 본문 작성 검증' : '커서는 누구의 것인가';
    const summary = isNew ? '새 행의 요약은 본문과 구분합니다.' : '입력 경로를 다시 그린 기록.';
    const bodyText = isNew ? '다섯 번째 행에 새 본문을 작성했습니다.' : '세 번째 행의 빈 본문을 작성했습니다.';
    const titleInput = field(page, '제목').locator('input');
    if (isNew) {
      await titleInput.fill(title);
      await field(page, '요약').getByRole('button', { name: '요약 작성', exact: true }).click();
      const summaryParagraph = field(page, '요약').locator('[data-note-body] p').first();
      await summaryParagraph.click();
      await page.keyboard.insertText(summary);
      await expect(summaryParagraph).toHaveText(summary);
    }
    await expect(titleInput).toHaveValue(title);
    await writeEmptyField(page, '본문', bodyText, true);
    await expect(field(page, '요약')).toContainText(summary);
    await expect(field(page, '요약')).not.toContainText(bodyText);
    await expect(titleInput).toHaveValue(title);

    // Wait for Note delivery to the host before reading the product's autosave status.
    await expect.poll(async () => resolved(await snapshot(page), row, '본문')).toBe(bodyText);
    await expect.poll(async () => resolved(await snapshot(page), row, '요약')).toBe(summary);
    await saved(page);
    const written = await snapshot(page);
    expect(written.records).toHaveLength(isNew ? 5 : 4);
    expect(written.records[row].제목).toBe(title);
    expect(written.records[row].본문).toMatch(/^text:.+/);
    if (isNew) expect(written.records[row].본문).not.toBe(written.records[row].요약);
    else expect(written.records[row]).toEqual({ ...original.records[row], 본문: written.records[row].본문 });
    expectOthersUnchanged(written, original, row);

    const url = page.url();
    await page.reload();
    await saved(page);
    expect(page.url()).toBe(url);
    await openBlogData(page);
    await page.locator(`[data-row-open="${row}"]`).click();
    await expect(field(page, '제목').locator('input')).toHaveValue(title);
    await expect(field(page, '본문').locator('[data-note-body] p').first()).toHaveText(bodyText);
    await expect(field(page, '요약')).toContainText(summary);
    await expect(field(page, '요약')).not.toContainText(bodyText);
    await expect(field(page, '본문').getByRole('button', { name: '본문 작성', exact: true })).toHaveCount(0);
    const restored = await snapshot(page);
    expect(restored.records).toEqual(written.records);
    expect(restored.richText).toEqual(written.richText);
    expectOthersUnchanged(restored, original, row);
  });
}

test('an existing empty Note body stays empty in the table and reopens without recreation', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await openBlogData(page);
  const original = await snapshot(page);
  expect(original.records[2].본문 ?? '').toBe('');
  await page.locator('[data-row-open="2"]').click();
  await field(page, '본문').getByRole('button', { name: '본문 작성', exact: true }).click();
  const paragraph = field(page, '본문').locator('[data-note-body] p').first();
  await expect(paragraph).toBeVisible();
  await expect(paragraph).toHaveText('');

  const created = await snapshot(page);
  const reference = created.records[2].본문;
  expect(reference).toMatch(/^text:.+/);
  if (typeof reference !== 'string') throw new Error('Created body reference is missing');
  const resource = created.richText[reference.slice(5)];
  expect(resource).toBeDefined();
  expect(resource.text).toBe('');
  expect(resource.tree.content).toHaveLength(1);
  expect(resource.tree.content?.[0].stype).toBe('paragraph');
  expect(created.records[2]).toEqual({ ...original.records[2], 본문: reference });
  expectOthersUnchanged(created, original, 2);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-row-form]')).toHaveCount(0);
  const row = page.locator('tr').filter({ has: page.locator('[data-row-open="2"]') });
  const bodyCell = row.locator('td[data-cell-kind="richText"]').nth(1);
  await expect(bodyCell).toHaveText('비어 있음');
  await expect(bodyCell).not.toContainText('본문을 찾을 수 없습니다');

  await page.locator('[data-row-open="2"]').click();
  await expect(field(page, '본문').locator('[data-note-body]')).toBeVisible();
  await expect(field(page, '본문').locator('[data-note-body] p').first()).toHaveText('');
  await expect(field(page, '본문').getByRole('button', { name: '본문 작성', exact: true })).toHaveCount(0);
  expect(await snapshot(page)).toEqual(created);
});

test('a broken rich-text reference stays distinct from an empty body and is never overwritten', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  // Only this error-path fixture creates a broken reference; normal creation tests use UI exclusively.
  expect(await page.evaluate(async () => {
    type StoredNode = { sid: string; stype: string; attributes?: Record<string, unknown>; content?: string[] };
    const editor = (window as unknown as { editor: {
      getRootId(): string;
      dataStore: { getNode(id: string): StoredNode | undefined };
      executeCommand(name: string, payload: Record<string, unknown>): Promise<boolean>;
    } }).editor;
    const find = (id: string): StoredNode | undefined => {
      const node = editor.dataStore.getNode(id);
      if (node?.stype === 'dataset' && node.attributes?.name === '글') return node;
      for (const child of node?.content ?? []) { const found = find(child); if (found) return found; }
    };
    const dataset = find(editor.getRootId());
    if (!dataset) throw new Error('Blog dataset is missing');
    return editor.executeCommand('setDatasetCell', { nodeId: dataset.sid, row: 2, field: '본문', value: 'text:missing-body-regression' });
  })).toBe(true);
  await saved(page);
  const original = await snapshot(page);
  await openBlogData(page);
  await page.locator('[data-row-open="2"]').click();
  await expect(field(page, '본문')).toContainText('본문을 찾을 수 없습니다');
  await expect(field(page, '본문').getByRole('button', { name: '본문 작성', exact: true })).toHaveCount(0);
  await expect(field(page, '본문').locator('[data-note-body]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-row-form]')).toHaveCount(0);
  await page.locator('[data-row-open="3"]').click();
  await expect(field(page, '본문').getByRole('button', { name: '본문 작성', exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(original);
});
