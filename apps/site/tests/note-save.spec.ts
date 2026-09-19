import { expect, test, type Page, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
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
  expect(await downloadText(await again)).toContain('STILL-NESTED');
});
