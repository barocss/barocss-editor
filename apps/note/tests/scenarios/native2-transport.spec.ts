import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { NATIVE_NOTE_FIXTURES } from '../../src/native2-scenario-fixtures';
import type { Native2TransportObservation } from '../../src/native2-transport-scenario';
type Name = keyof typeof NATIVE_NOTE_FIXTURES;
const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ids = { SOURCE_A: '33333333-3333-4333-8333-333333333333', TARGET_A2: '33333333-3333-4333-8333-333333333333',
  SOURCE_B: '44444444-4444-4444-8444-444444444444', COPY_A_ORACLE: '55555555-5555-4555-8555-555555555555' };
const kinds = { SOURCE_A: 'A', SOURCE_B: 'B', TARGET_A2: 'A2', COPY_A_ORACLE: 'C' };
const raw = (file: unknown) => JSON.stringify(file, null, 2) + '\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function wire(name: Name, extraNode = false) {
  const file = structuredClone(NATIVE_NOTE_FIXTURES[name]);
  if (extraNode) Object.assign(file.document, { diagnosticExtra: 'retained raw unknown NODE' });
  const snapshotText = raw(file), documentId = ids[name], revision = name === 'TARGET_A2' ? 2 : 1;
  const document = { documentId, tenantId, workspaceId, product: 'note', title: name, creatorUserId: null,
    metadataRevision: 1, mode: 'snapshot', pageId: file.document.attributes.pageId,
    documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2, revision, snapshotHash: hash(snapshotText) };
  return { snapshotText, file, opened: { document, snapshotText }, pinned: { status: 'pinned', documentId,
    documentRevision: revision, snapshotHash: hash(snapshotText), nativeFormat: { format: 'barocss-note', version: 2 }, bundle: file.schemaBundle } };
}
async function read(page: Page): Promise<Native2TransportObservation> {
  return page.evaluate(() => { const value = window.readNative2Transport?.(); if (!value) throw new Error('Real native transport model not ready'); return value; });
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
// Independent entire Loader/Exporter contract, bound to frozen source in evidence09.
function expectedEngine(value: unknown, root = false): Record<string, unknown> {
  if (!record(value) || typeof value.stype !== 'string') throw new Error('Original node required');
  const metadata = record(value.metadata) ? { ...value.metadata } : {}; delete metadata.loadedAt;
  return { stype: value.stype, attributes: value.attributes ?? {}, metadata,
    ...(Object.hasOwn(value, 'text') ? { text: value.text } : {}),
    ...(Object.hasOwn(value, 'marks') ? { marks: value.marks } : {}),
    ...(Array.isArray(value.content) && (value.content.length || root) ? { content: value.content.map(child => expectedEngine(child)) } : {}) };
}
function observedEngine(value: unknown, ids = new Set<string>()): Record<string, unknown> {
  if (!record(value)) throw new Error('Entire real engine node required');
  expect(typeof value.sid).toBe('string');
  if (typeof value.sid !== 'string' || !value.sid || ids.has(value.sid)) throw new Error('Unique live SID required');
  ids.add(value.sid);
  const node = { ...value }; delete node.sid;
  for (const key of ['text', 'marks', 'content']) if (Object.hasOwn(node, key) && node[key] === undefined) delete node[key];
  if (!record(node.metadata)) throw new Error('Loader metadata required');
  expect(node.metadata.loadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  const metadata = { ...node.metadata }; delete metadata.loadedAt; node.metadata = metadata;
  if (Array.isArray(node.content)) node.content = node.content.map(child => observedEngine(child, ids));
  return node;
}
function findNode(value: unknown, stype: string, text?: string): Record<string, unknown> | undefined {
  if (!record(value)) return undefined;
  if (value.stype === stype && (text === undefined || value.text === text)) return value;
  if (Array.isArray(value.content)) for (const child of value.content) { const found = findNode(child, stype, text); if (found) return found; }
  return undefined;
}
test.afterEach(async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath('transport-current.png'), fullPage: true });
  const observation = await page.evaluate(() => window.readNative2Transport?.());
  if (observation) await info.attach('actual-full-native-readonly.json', { body: JSON.stringify(observation, null, 2), contentType: 'application/json' });
});
for (const name of Object.keys(NATIVE_NOTE_FIXTURES) as Name[]) {
  test(`controlled ${name} binds exact raw/head/full bundle to actual readonly native model and reopen`, async ({ page }) => {
    const expected = wire(name), calls: Array<{ method: string; body: string | null }> = [];
    await page.route('**/controlled-native2/**', route => {
      calls.push({ method: route.request().method(), body: route.request().postData() });
      return route.fulfill({ json: route.request().url().endsWith('/schema-bundle') ? expected.pinned : expected.opened });
    });
    await page.goto(`/scenarios.html?case=native2-transport-${kinds[name]}`);
    const host = page.getByTestId('native2-transport-host');
    await expect(host.locator('.on-doc')).toBeVisible();
    const before = await read(page);
    expect(observedEngine(before.model)).toEqual(expectedEngine(NATIVE_NOTE_FIXTURES[name].document, true));
    expect(before.nativeDocument).toEqual(NATIVE_NOTE_FIXTURES[name].document);
    expect(before.sourceText).toBe(expected.snapshotText);
    expect(before.snapshotText).toBe(expected.snapshotText);
    expect(before.document).toEqual(expected.opened.document);
    expect(before.editable).toBe(false);
    if (name === 'SOURCE_B') await expect.poll(() => host.locator('.mark-strike').first().evaluate(element =>
      getComputedStyle(element).textDecorationLine)).toContain('line-through');
    await page.getByRole('button', { name: 'Export readonly snapshot', exact: true }).click();
    await expect(page.getByTestId('transport-export')).toHaveText(expected.snapshotText);
    for (const command of ['toggleBold', 'toggleItalic', 'toggleUnderline', 'toggleStrikeThrough']) {
      await page.getByRole('button', { name: `Try readonly ${command}`, exact: true }).click();
      await expect(page.getByTestId('readonly-command-result')).toHaveText('false');
      expect((await read(page)).model).toEqual(before.model);
      expect((await read(page)).history).toEqual(before.history);
      expect((await read(page)).nativeDocument).toEqual(NATIVE_NOTE_FIXTURES[name].document);
    }
    await page.getByRole('button', { name: 'Try readonly structure', exact: true }).click();
    await expect(page.getByTestId('readonly-command-result')).toHaveText('false');
    expect((await read(page)).model).toEqual(before.model); expect((await read(page)).history).toEqual(before.history);
    await page.getByRole('button', { name: 'Show nested resource', exact: true }).click();
    await expect(host).toContainText(name === 'SOURCE_B' ? 'B 자료 본문' : '항목 본문 A');
    const nestedBefore = await read(page);
    const originalResource = findNode(NATIVE_NOTE_FIXTURES[name].document, 'richText');
    if (!originalResource) throw new Error('Independent original nested body required');
    expect(observedEngine(nestedBefore.childModel)).toEqual(expectedEngine({ stype: 'note', content: originalResource.content }, true));
    await host.locator('.on-doc').click();
    await page.keyboard.insertText('readonly input refused');
    expect((await read(page)).childModel).toEqual(nestedBefore.childModel);
    expect((await read(page)).childHistory).toEqual(nestedBefore.childHistory);
    expect((await read(page)).nativeDocument).toEqual(NATIVE_NOTE_FIXTURES[name].document);
    await page.getByRole('button', { name: 'Reopen readonly snapshot', exact: true }).click();
    await expect.poll(async () => (await read(page)).snapshotText).toBe(expected.snapshotText);
    expect((await read(page)).nativeDocument).toEqual(NATIVE_NOTE_FIXTURES[name].document);
    expect(calls.every(call => call.method === 'GET' && call.body === null)).toBe(true);
  });
}
test('raced/denied or unrepresentable input retains the previous entire native model and rejected raw', async ({ page }) => {
  let mode: 'good' | 'race' | 'denied' | 'unknown' = 'good';
  const a = wire('SOURCE_A'), unknown = wire('SOURCE_B', true);
  await page.route('**/controlled-native2/**', route => {
    if (mode === 'denied') return route.fulfill({ status: 403, json: { status: 'scope_forbidden' } });
    const x = mode === 'unknown' ? unknown : a;
    return route.fulfill({ json: route.request().url().endsWith('/schema-bundle')
      ? { ...x.pinned, ...(mode === 'race' ? { documentRevision: 99 } : {}) } : x.opened });
  });
  await page.goto('/scenarios.html?case=native2-transport-A');
  await expect(page.getByTestId('native2-transport-host').locator('.on-doc')).toBeVisible();
  const before = await read(page);
  for (const failure of ['race', 'denied', 'unknown'] as const) {
    mode = failure;
    await page.getByRole('button', { name: failure === 'unknown' ? 'Open B' : 'Open A', exact: true }).click();
    await expect(page.getByTestId('transport-error')).toHaveText(failure === 'race' ? 'invalid_native2_response'
      : failure === 'denied' ? 'scope_forbidden' : 'unsupported_native_editor');
    const after = await read(page);
    expect(after.model).toEqual(before.model); expect(after.history).toEqual(before.history);
    expect(after.snapshotText).toBe(a.snapshotText); expect(after.nativeDocument).toEqual(NATIVE_NOTE_FIXTURES.SOURCE_A.document);
  }
  await expect(page.getByTestId('transport-rejected-raw')).toHaveText(unknown.snapshotText);
});
test('a late response after retiring the read owner cannot replace original SID/selection/focus/model/history', async ({ page }) => {
  let hold = false, entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const a = wire('SOURCE_A'), b = wire('SOURCE_B');
  await page.route('**/controlled-native2/**', async route => {
    const x = route.request().url().includes(ids.SOURCE_B) ? b : a;
    if (hold && !route.request().url().endsWith('/schema-bundle')) { entered(); await barrier; }
    await route.fulfill({ json: route.request().url().endsWith('/schema-bundle') ? x.pinned : x.opened });
  });
  await page.goto('/scenarios.html?case=native2-transport-A');
  const host = page.getByTestId('native2-transport-host');
  await expect(host.locator('.on-doc')).toBeVisible();
  hold = true; await page.getByRole('button', { name: 'Open B', exact: true }).click(); await waiting;
  await page.getByRole('button', { name: 'Retire read owner', exact: true }).click();
  const target = findNode((await read(page)).model, 'inline-text', '목표 A');
  if (!target || typeof target.sid !== 'string' || !target.sid) throw new Error('Actual live heading text SID required');
  await host.focus();
  const points = await host.locator(`[data-bc-sid="${target.sid}"]`).evaluate(element => {
    const point = (offset: number) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent?.length ?? 0;
        if (offset <= length) { const range = document.createRange(); range.setStart(node, offset); range.collapse(true);
          const box = range.getBoundingClientRect(); return { x: box.x, y: box.y + box.height / 2 }; }
        offset -= length;
      }
      throw new Error('Real text geometry required');
    };
    return { start: point(3), end: point(4) };
  });
  await page.mouse.move(points.start.x, points.start.y); await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => (await read(page)).domRange).toEqual({ startNodeId: target.sid, endNodeId: target.sid,
    startOffset: 3, endOffset: 4, collapsed: false, text: 'A' });
  await expect.poll(async () => (await read(page)).selection).toEqual({ type: 'range', startNodeId: target.sid,
    endNodeId: target.sid, startOffset: 3, endOffset: 4, collapsed: false, direction: 'forward' });
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="native2-transport-host"]'))).toBe(true);
  const before = await read(page);
  const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName,
    id: document.activeElement?.getAttribute('data-node-id'), text: document.getSelection()?.toString() }));
  release();
  await expect(page.getByTestId('transport-error')).toHaveText('stale_native2_context');
  const after = await read(page);
  expect(after.model).toEqual(before.model); expect(after.history).toEqual(before.history);
  expect(after.selection).toEqual(before.selection); expect(after.epoch).toBe(before.epoch);
  expect(after.domRange).toEqual(before.domRange);
  expect(after.nativeDocument).toEqual(NATIVE_NOTE_FIXTURES.SOURCE_A.document); expect(after.snapshotText).toBe(a.snapshotText);
  expect(await page.evaluate(() => ({ tag: document.activeElement?.tagName,
    id: document.activeElement?.getAttribute('data-node-id'), text: document.getSelection()?.toString() }))).toEqual(focus);
});
