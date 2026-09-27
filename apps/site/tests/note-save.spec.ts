import { expect, test, type Page, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
test.describe.configure({ retries: 0 });
test.use({ trace: 'retain-on-failure', screenshot: 'only-on-failure' });

const recordedDownloads = new WeakMap<Page, Download[]>();
const downloadsOf = (page: Page) => recordedDownloads.get(page) ?? [];

test.beforeEach(async ({ page }) => {
  const downloads: Download[] = [];
  recordedDownloads.set(page, downloads);
  page.on('download', download => downloads.push(download));
});

test.afterEach(async ({ page }, info) => {
  const files = downloadsOf(page);
  await info.attach('download-counts', {
    body: JSON.stringify({ count: files.length, names: files.map(file => file.suggestedFilename()) }, null, 2),
    contentType: 'application/json',
  });
  for (const [index, file] of files.entries()) {
    try {
      const failure = await file.failure();
      await info.attach(`download-${index + 1}-status`, {
        body: JSON.stringify({ name: file.suggestedFilename(), failure }), contentType: 'application/json',
      });
      const path = await file.path();
      if (path) await info.attach(`download-${index + 1}-${file.suggestedFilename()}`, { path });
    } catch (error) {
      await info.attach(`download-${index + 1}-error`, { body: String(error), contentType: 'text/plain' });
    }
  }
  if (info.status !== info.expectedStatus) {
    try {
      const state = await page.evaluate(() => {
        const host = window as unknown as { editor?: { exportDocument(): unknown } };
        const selection = document.getSelection();
        return {
          rowCount: document.querySelectorAll('[data-row-form]').length,
          nestedBodyCount: document.querySelectorAll('[data-db-item-body]').length,
          selectedText: selection?.toString(),
          anchorOffset: selection?.anchorOffset,
          focusOffset: selection?.focusOffset,
          focused: document.activeElement?.outerHTML.slice(0, 2000),
          bodies: [...document.querySelectorAll('[data-note-body], [data-db-item-body]')].map(element => element.textContent),
          problems: [...document.querySelectorAll('[data-note-delivery-problem], [role="alert"]')].map(element => element.textContent),
          hostDocument: host.editor?.exportDocument(),
        };
      });
      await info.attach('note-save-state', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
    } catch (error) {
      await info.attach('note-save-state-error', { body: String(error), contentType: 'text/plain' });
    }
  }
  recordedDownloads.delete(page);
});

const body = (page: Page, name = '본문') => page.locator(`[data-row-form] [data-field="${name}"] [data-note-body]`);
async function setup(page: Page, blog = false) {
  await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
      // Hold both Note delivery and workspace autosave to isolate explicit file/export flushing.
      schedule(handler, delay === 350 || delay === 300 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  });
  await page.goto('/');
  if (blog) {
    await page.locator('[data-admin-open="blog"]').click();
    await page.locator('[data-to-admin]').click();
  }
  await page.locator('[data-admin-tab="data"]').click();
  await page.locator('[data-admin-open]').last().click();
  await page.locator('[data-row-open]').first().click();
}
async function type(page: Page, text: string, name = '본문') {
  await body(page, name).locator('p').first().click();
  await page.keyboard.press('End'); await page.keyboard.insertText(text);
  await expect(body(page, name)).toContainText(text);
}
const saveKey = process.platform === 'darwin' ? 'Meta+s' : 'Control+s';
const hostText = (page: Page) => page.evaluate(() => JSON.stringify((window as any).editor.exportDocument()));
async function downloadText(download: Download) { return readFile((await download.path())!, 'utf8'); }

test('save from an open Note body awaits both host writes and keeps the editor usable', async ({ page }) => {
  await setup(page);
  await type(page, ' FINAL-BODY'); await type(page, ' FINAL-SUMMARY', '요약');
  expect(await hostText(page)).not.toContain('FINAL-BODY');
  await page.evaluate(() => {
    const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
    const gate = new Promise<void>(resolve => { (window as any).releaseBody = resolve; });
    editor.executeCommand = async (name: string, payload: unknown) => {
      if (name === 'setRichText') { (window as any).bodyWriteStarted = true; await gate; }
      return original(name, payload);
    };
  });
  const downloads: Download[] = []; page.on('download', file => downloads.push(file));
  const wait = page.waitForEvent('download');
  await page.keyboard.press(saveKey);
  await expect.poll(() => page.evaluate(() => (window as any).bodyWriteStarted)).toBe(true);
  expect(downloads).toHaveLength(0); expect(await hostText(page)).not.toContain('FINAL-BODY');
  await page.evaluate(() => (window as any).releaseBody());
  const file = await wait;
  const text = await downloadText(file);
  expect(text).toContain('FINAL-BODY'); expect(text).toContain('FINAL-SUMMARY');
  await expect(body(page)).toBeVisible();
  await type(page, ' STILL-EDITING');
  const again = page.waitForEvent('download'); await page.keyboard.press(saveKey);
  expect(await downloadText(await again)).toContain('STILL-EDITING');
  await page.keyboard.press('Escape'); await page.locator('[data-row-open]').first().click();
  await expect(body(page)).toContainText('STILL-EDITING');
  expect(downloads).toHaveLength(2);
});

test('a rejected host write prevents downloading and keeps the body available for retry', async ({ page }) => {
  await setup(page); await type(page, ' RETRY-ME');
  await page.evaluate(() => {
    const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
    (window as any).rejectBody = true;
    editor.executeCommand = (name: string, payload: unknown) => name === 'setRichText' && (window as any).rejectBody
      ? Promise.resolve(false) : original(name, payload);
  });
  const downloads: Download[] = []; page.on('download', file => downloads.push(file));
  await page.keyboard.press(saveKey);
  await expect(page.locator('[data-note-delivery-problem]')).toBeVisible();
  expect(downloads).toHaveLength(0); expect(await hostText(page)).not.toContain('RETRY-ME');
  await page.evaluate(() => { (window as any).rejectBody = false; });
  const wait = page.waitForEvent('download'); await page.keyboard.press(saveKey);
  expect(await downloadText(await wait)).toContain('RETRY-ME');
  await expect(page.locator('[data-note-delivery-problem]')).toHaveCount(0);
  await expect(body(page)).toContainText('RETRY-ME');
  expect(downloads).toHaveLength(1);
});

for (const all of [false, true]) test(`${all ? 'site ZIP' : 'page HTML'} export waits for a body write still pending after the row closes`, async ({ page }) => {
  await setup(page, true); await type(page, ' EXPORT-LATEST', '요약');
  await page.evaluate(() => {
    const editor = (window as any).editor, original = editor.executeCommand.bind(editor);
    const gate = new Promise<void>(resolve => { (window as any).releaseBody = resolve; });
    editor.executeCommand = async (name: string, payload: unknown) => {
      if (name === 'setRichText') { (window as any).bodyWriteStarted = true; await gate; }
      return original(name, payload);
    };
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-row-form]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).bodyWriteStarted)).toBe(true);
  const downloads: Download[] = []; page.on('download', file => downloads.push(file));
  const wait = page.waitForEvent('download');
  await page.locator('[data-menu="file"]').click();
  await page.locator(`[data-menu-item="file.publish.${all ? 1 : 0}"]`).click();
  expect(downloads).toHaveLength(0);
  await page.evaluate(() => (window as any).releaseBody());
  const file = await wait;
  // Both the published blog page and the archive must include the final summary.
  expect(await hostText(page)).toContain('EXPORT-LATEST');
  if (all) {
    const path = (await file.path())!;
    const text = await new Promise<string>((resolve, reject) => execFile('python3', ['-c',
      'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print("\\n".join(z.read(n).decode("utf-8") for n in z.namelist() if n.endswith(".html")))', path],
      (error, out) => error ? reject(error) : resolve(out)));
    expect(text).toContain('EXPORT-LATEST');
  } else expect(await downloadText(file)).toContain('EXPORT-LATEST');
  expect(downloads).toHaveLength(1);
});

test('saving from a deeply nested database item flushes inner then outer bodies into the Site file', async ({ page }) => {
  await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
      schedule(handler, delay === 150 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  });
  await setup(page);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(async () => {
    const editor = (window as any).editor, store = editor.dataStore;
    const root = store.getNode(editor.getRootId());
    const resources = root.content.map((id: string) => store.getNode(id)).find((node: any) => node.stype === 'resources');
    const rich = resources.content.map((id: string) => store.getNode(id)).find((node: any) => node.stype === 'richText' && node.attributes.id === '본문-스택');
    const db = (source: string) => ({ stype: 'noteDatabase', attributes: { source } });
    const dataset = (name: string, id: string, title: string) => ({ stype: 'dataset', attributes: { name,
      fields: [{ name: '이름', kind: 'text' }], records: [{ 이름: title }], rowIds: [id] } });
    return editor.executeCommand('setRichText', { nodeId: rich.sid, blocks: [db('outer'), { stype: 'resources', content: [
      dataset('outer', 'outer-item', '상위 작업'), { stype: 'richText', attributes: { id: 'outer-item' }, content: [db('inner'),
        { stype: 'resources', content: [dataset('inner', 'inner-item', '하위 작업'), { stype: 'richText', attributes: { id: 'inner-item' },
          content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '세부 내용 ' }] }] }] }
      ] }
    ] }] });
  })).toBe(true);
  await page.locator('[data-row-open]').first().click();
  await body(page).getByRole('button', { name: '행 1 열기', exact: true }).click();
  const peek = page.locator('[data-db-item-body]').last();
  await peek.getByRole('button', { name: '행 1 열기', exact: true }).click();
  const last = page.locator('[data-db-item-body] .on-doc > p').last();
  await last.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' DEEPEST-FINAL');
  await expect(last).toContainText('DEEPEST-FINAL');
  expect(await hostText(page)).not.toContain('DEEPEST-FINAL');
  await page.evaluate(() => {
    const prototype = Object.getPrototypeOf((window as any).editor);
    const original = prototype.executeCommand;
    (window as any).restoreNestedWrite = () => { prototype.executeCommand = original; };
    prototype.executeCommand = function (name: string, payload: unknown) {
      return name === 'setNoteDatabaseItemBody' ? Promise.resolve(false) : original.call(this, name, payload);
    };
  });
  const downloads: Download[] = []; page.on('download', file => downloads.push(file));
  await page.keyboard.press(saveKey);
  await expect(page.locator('[data-db-item-body] [role="alert"]').last()).toContainText('본문을 저장하지 못했습니다');
  expect(downloads).toHaveLength(0); expect(await hostText(page)).not.toContain('DEEPEST-FINAL');
  await page.evaluate(() => (window as any).restoreNestedWrite());
  const wait = page.waitForEvent('download'); await page.keyboard.press(saveKey);
  expect(await downloadText(await wait)).toContain('DEEPEST-FINAL');
  await expect(last).toBeVisible();
  await page.keyboard.insertText(' STILL-NESTED');
  const again = page.waitForEvent('download'); await page.keyboard.press(saveKey);
  const latest = await downloadText(await again);
  expect(latest).toContain('DEEPEST-FINAL');
  expect(latest).toContain('STILL-NESTED');
  expect(downloads).toHaveLength(2);
  await expect(page.locator('[data-db-item-body]')).toHaveCount(2);
  // SidePeek keeps Escape inside an active text edit; saving must preserve that ownership.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-db-item-body]')).toHaveCount(2);
  await expect(page.locator('[data-row-form]')).toBeVisible();
  await page.keyboard.insertText(' AFTER-ESCAPE');
  await expect(last).toContainText('AFTER-ESCAPE');
  const afterEscape = page.waitForEvent('download'); await page.keyboard.press(saveKey);
  expect(await downloadText(await afterEscape)).toContain('AFTER-ESCAPE');
  expect(downloads).toHaveLength(3);
});


for (const shortcut of ['Meta+s', 'Control+s'] as const) {
  test(`${shortcut} saves from the Note dialog while selection, local undo and Escape remain owned by the dialog`, async ({ page }) => {
    await setup(page);
    const row = page.locator('[data-row-form]');
    const unchangedSummary = await body(page, '요약').innerText();
    const marker = shortcut === 'Meta+s' ? 'META-SAVE-UI' : 'CONTROL-SAVE-UI';
    await type(page, ` ${marker}`);
    for (let index = 0; index < marker.length; index++) await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe(marker);
    const focused = await page.evaluateHandle(() => document.activeElement);
    expect(await hostText(page)).not.toContain(marker);

    const download = page.waitForEvent('download');
    await page.keyboard.press(shortcut);
    const text = await downloadText(await download);
    expect(text).toContain(marker);
    expect(await hostText(page)).toContain(marker);
    expect(downloadsOf(page)).toHaveLength(1);
    await expect(row).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe(marker);
    expect(await focused.evaluate(element => element === document.activeElement)).toBe(true);
    await expect(body(page, '요약')).toHaveText(unchangedSummary);

    // Replace the actual browser selection, then undo within this Note editor.
    await page.keyboard.insertText('REPLACED-LOCALLY');
    await expect(body(page)).toContainText('REPLACED-LOCALLY');
    await expect(body(page)).not.toContainText(marker);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(body(page)).toContainText(marker);
    await expect(body(page)).not.toContainText('REPLACED-LOCALLY');
    await expect(body(page, '요약')).toHaveText(unchangedSummary);
    await expect(row).toBeVisible();
    expect(await hostText(page)).toContain(marker);
    expect(downloadsOf(page)).toHaveLength(1);

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => body(page).evaluate(element => {
      const selection = document.getSelection();
      return selection?.isCollapsed && !!selection.anchorNode && element.contains(selection.anchorNode);
    })).toBe(true);
    // Selection UI owns Escape until it has closed; then the row dialog owns the key.
    await expect(page.locator('[data-note-formatting]')).toHaveCount(0);
    await expect(row).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(row).toHaveCount(0);
    await page.locator('[data-row-open]').first().click();
    await expect(body(page)).toContainText(marker);
    await expect(body(page)).not.toContainText('REPLACED-LOCALLY');
    await expect(body(page, '요약')).toHaveText(unchangedSummary);
    expect(downloadsOf(page)).toHaveLength(1);
    await focused.dispose();
  });
}
