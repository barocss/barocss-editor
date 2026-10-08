import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { NATIVE_NOTE_FIXTURES, NATIVE_NOTE_EXPECTED_VARIANTS, NATIVE_B_VARIANTS } from '../../src/native2-scenario-fixtures';
import type { Native2PreserveObservation } from '../../src/native2-preserve-scenario';
type Fixture = typeof NATIVE_NOTE_FIXTURES[keyof typeof NATIVE_NOTE_FIXTURES];
type Name = keyof typeof NATIVE_NOTE_FIXTURES;
const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ids = { SOURCE_A: '33333333-3333-4333-8333-333333333333', TARGET_A2: '33333333-3333-4333-8333-333333333333', SOURCE_B: '44444444-4444-4444-8444-444444444444', COPY_A_ORACLE: '55555555-5555-4555-8555-555555555555' };
const kinds = { SOURCE_A: 'A', TARGET_A2: 'A2', SOURCE_B: 'B', COPY_A_ORACLE: 'C' };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const originalRaw = (f: Fixture) => JSON.stringify(f);
// Exact existing serializer order, from independently authored full fields; never read a producer to form expected bytes.
const editedRaw = (f: Fixture) => JSON.stringify({ format: 'barocss-note', version: 2, schemaBundle: f.schemaBundle, document: f.document,
  ...('savedAt' in f ? { savedAt: f.savedAt } : {}) }, null, 2) + '\n';
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
function expectedEngine(value: unknown, root = false, path = '', addedPrefix?: string): Record<string, unknown> {
  if (!isRecord(value) || typeof value.stype !== 'string') throw new Error('Independent original node required');
  if (addedPrefix && path.startsWith(addedPrefix)) return { ...value,
    ...(Array.isArray(value.content) ? { content: value.content.map((child, i) => expectedEngine(child, false, `${path}/${i}`, addedPrefix)) } : {}) };
  const metadata = isRecord(value.metadata) ? { ...value.metadata } : {}; delete metadata.loadedAt;
  return { stype: value.stype, attributes: value.attributes ?? {}, metadata,
    ...(Object.hasOwn(value, 'text') ? { text: value.text } : {}), ...(Object.hasOwn(value, 'marks') ? { marks: value.marks } : {}),
    ...(Array.isArray(value.content) && (value.content.length || root) ? { content: value.content.map((child, i) => expectedEngine(child, false, `${path}/${i}`, addedPrefix)) } : {}) };
}
function observedEngine(value: unknown, ids = new Set<string>(), path = '', addedPrefix?: string): Record<string, unknown> {
  if (!isRecord(value) || typeof value.sid !== 'string' || !value.sid || ids.has(value.sid)) throw new Error('Every real unique SID required');
  ids.add(value.sid); const node = { ...value }; delete node.sid;
  for (const key of ['text', 'marks', 'content']) if (Object.hasOwn(node, key) && node[key] === undefined) delete node[key];
  if (addedPrefix && path.startsWith(addedPrefix)) {
    // addChild persists authored values without Loader's default attributes or generated loadedAt.
    for (const key of ['attributes', 'metadata']) if (Object.hasOwn(node, key) && node[key] === undefined) delete node[key];
  } else {
    if (!isRecord(node.metadata)) throw new Error('Actual loader metadata required');
    expect(node.metadata.loadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); const metadata = { ...node.metadata }; delete metadata.loadedAt; node.metadata = metadata;
  }
  if (Array.isArray(node.content)) node.content = node.content.map((child, i) => observedEngine(child, ids, `${path}/${i}`, addedPrefix)); return node;
}
async function read(page: Page): Promise<Native2PreserveObservation> {
  return page.evaluate(() => { const v = window.readNative2Preserve?.(); if (!v) throw new Error('Actual native preserve not ready'); return v; });
}
function assertPositiveRange(v: Native2PreserveObservation, text: string, startOffset: number, endOffset: number) {
  const selection = v.selection, range = v.domRange;
  if (!selection || selection.type !== 'range' || !range) throw new Error('Real noncollapsed engine and DOM ranges required');
  expect(selection).toMatchObject({ startOffset, endOffset, collapsed: false, direction: 'forward' });
  expect(range).toMatchObject({ startOffset, endOffset, collapsed: false, text: text.slice(startOffset, endOffset) });
  expect(selection.startNodeId).toBe(selection.endNodeId); expect(selection.startNodeId).toBe(range.startNodeId);
  expect(range.startNodeId).toBe(range.endNodeId); expect(range.startNodeId).toBeTruthy(); expect(v.hostFocused).toBe(true);
  const matches: Array<Record<string, unknown>> = [];
  const visit = (node: unknown) => {
    if (!isRecord(node)) throw new Error('Whole actual model node required');
    if (node.sid === selection.startNodeId) matches.push(node);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(v.model); expect(matches).toHaveLength(1); expect(matches[0]).toMatchObject({ stype: 'inline-text', text });
}
async function full(page: Page, expected: Fixture, addedPrefix?: string) {
  const v = await read(page); expect(v.nativeDocument).toEqual(expected.document);
  expect(JSON.parse(v.snapshotText)).toEqual(expected); expect(observedEngine(v.model, new Set(), '', addedPrefix)).toEqual(expectedEngine(expected.document, true, '', addedPrefix)); return v;
}
function controlled(name: Name, nextExpected: Fixture = NATIVE_NOTE_FIXTURES[name], nextRaw = originalRaw(nextExpected)) {
  const original = NATIVE_NOTE_FIXTURES[name], documentId = ids[name], revision = name === 'TARGET_A2' ? 2 : 1;
  const baseRaw = originalRaw(original), document = { documentId, tenantId, workspaceId, product: 'note', title: name,
    creatorUserId: null, metadataRevision: 1, mode: 'snapshot', pageId: original.document.attributes.pageId,
    documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2, revision, snapshotHash: hash(baseRaw) };
  const pinDigest = hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenantId, workspaceId, documentId, 'pinned', original.schemaBundle.selected.map(r => [r.schemaId, r.version, r.digest])]));
  const body = { schemaAction: 'preserve', expectedRevision: revision, expectedSnapshotHash: hash(baseRaw), expectedPriorPinDigest: pinDigest,
    snapshotText: nextRaw, idempotencyKey: 'native2-preserve-test-1' };
  const receipt = { operation: 'update', idempotencyKey: body.idempotencyKey, requestHash: 'e'.repeat(64),
    document: { ...document, revision: revision + 1, snapshotHash: hash(nextRaw) }, snapshotText: nextRaw };
  let committed = false, effects = 0, loseReply = false, deny = false, holdPut = false, holdLookup = false;
  let enteredPut!: () => void, releasePut!: () => void, enteredLookup!: () => void, releaseLookup!: () => void;
  const putEntered = new Promise<void>(r => { enteredPut = r; }), putBarrier = new Promise<void>(r => { releasePut = r; });
  const lookupEntered = new Promise<void>(r => { enteredLookup = r; }), lookupBarrier = new Promise<void>(r => { releaseLookup = r; });
  const calls: Array<{ method: string; body: string | null; url: string }> = [];
  const install = (page: Page) => page.route('**/controlled-native2/**', async route => {
    const request = route.request(), method = request.method(), url = request.url(); calls.push({ method, url, body: request.postData() });
    if (deny) return route.fulfill({ status: 403, json: { status: 'controlled_role_denied' } });
    if (method === 'PUT') {
      expect(request.postData()).toBe(JSON.stringify(body)); expect(JSON.parse(JSON.parse(request.postData()!).snapshotText)).toEqual(nextExpected);
      if (!committed) { committed = true; effects++; }
      if (holdPut) { enteredPut(); await putBarrier; }
      if (loseReply) { loseReply = false; return route.abort('failed'); }
      return route.fulfill({ json: receipt });
    }
    if (url.includes('/receipts/')) {
      if (holdLookup) { enteredLookup(); await lookupBarrier; }
      return committed ? route.fulfill({ json: receipt }) : route.fulfill({ status: 404, json: { status: 'receipt_not_found' } });
    }
    const h = committed ? receipt.document : document, snapshotText = committed ? nextRaw : baseRaw;
    return route.fulfill({ json: url.endsWith('/schema-bundle') ? { status: 'pinned', documentId, documentRevision: h.revision,
      snapshotHash: h.snapshotHash, nativeFormat: { format: 'barocss-note', version: 2 }, bundle: original.schemaBundle } : { document: h, snapshotText } });
  });
  return { install, calls, body, receipt, putEntered, lookupEntered, releasePut: () => releasePut(), releaseLookup: () => releaseLookup(),
    setHoldPut: () => { holdPut = true; }, setHoldLookup: () => { holdLookup = true; }, lose: () => { loseReply = true; }, deny: () => { deny = true; }, effects: () => effects };
}
async function open(page: Page, name: Name, store: ReturnType<typeof controlled>) {
  await store.install(page); await page.goto(`/scenarios.html?case=native2-preserve-${kinds[name]}`);
  await expect(page.getByTestId('native2-preserve-host').locator('.on-doc')).toBeVisible(); await full(page, NATIVE_NOTE_FIXTURES[name]);
}
test.afterEach(async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath('actual-preserve-current.png'), fullPage: true });
  const v = await page.evaluate(() => window.readNative2Preserve?.()); if (v) await info.attach('whole-native-preserve-current.json', { body: JSON.stringify(v, null, 2), contentType: 'application/json' });
});
for (const name of Object.keys(NATIVE_NOTE_FIXTURES) as Name[]) test(`controlled ${name} same original identity/pins/full body saves once, Storage recovery reopens with no new effects`, async ({ page }) => {
  const store = controlled(name); await open(page, name, store); const before = await read(page);
  await page.getByRole('button', { name: 'Save fixed request', exact: true }).click(); await expect(page.getByTestId('preserve-status')).toHaveText('fixed-confirmed');
  const saved = await full(page, NATIVE_NOTE_FIXTURES[name]); expect(saved.model).toEqual(before.model); expect(saved.history).toEqual(before.history);
  expect(saved.journal?.fixed?.bodyText).toBe(JSON.stringify(store.body)); expect(saved.journal?.phase).toBe('fixed-confirmed'); expect(store.effects()).toBe(1);
  await page.reload(); await expect(page.getByTestId('native2-preserve-host').locator('.on-doc')).toBeVisible(); await full(page, NATIVE_NOTE_FIXTURES[name]);
  expect((await read(page)).durableRaw).toBe(saved.durableRaw); expect(store.calls.filter(c => c.method === 'PUT')).toHaveLength(1); expect(store.effects()).toBe(1);
});
test('A actual root input and B last nested input save entire edited files; local history stays genuine', async ({ page }) => {
  const store = controlled('SOURCE_A', NATIVE_NOTE_EXPECTED_VARIANTS.typing, editedRaw(NATIVE_NOTE_EXPECTED_VARIANTS.typing)); await open(page, 'SOURCE_A', store);
  const heading = page.getByTestId('native2-preserve-host').locator('h2').filter({ hasText: '목표 A' });
  await heading.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' • 독립 편집');
  await page.getByRole('button', { name: 'Save fixed request', exact: true }).click(); await expect(page.getByTestId('preserve-status')).toHaveText('fixed-confirmed'); await full(page, NATIVE_NOTE_EXPECTED_VARIANTS.typing);
  await page.getByRole('button', { name: 'Undo local edit', exact: true }).click(); await full(page, NATIVE_NOTE_FIXTURES.SOURCE_A);
  await page.getByRole('button', { name: 'Redo local edit', exact: true }).click(); await full(page, NATIVE_NOTE_EXPECTED_VARIANTS.typing);
  await page.unroute('**/controlled-native2/**');
  const b = controlled('SOURCE_B', NATIVE_B_VARIANTS['last-nested-input'], editedRaw(NATIVE_B_VARIANTS['last-nested-input'])); await open(page, 'SOURCE_B', b);
  await page.getByRole('button', { name: 'Show last nested resource', exact: true }).click();
  const paragraph = page.getByTestId('native2-preserve-host').locator('p').filter({ hasText: 'B 자료 본문' }).first();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' / 마지막 B 입력');
  await page.getByRole('button', { name: 'Save fixed request', exact: true }).click(); await expect(page.getByTestId('preserve-status')).toHaveText('fixed-confirmed');
  await full(page, NATIVE_B_VARIANTS['last-nested-input'], '/1/1/'); expect(b.effects()).toBe(1); expect((await read(page)).journal?.fixed?.snapshotText).toBe(editedRaw(NATIVE_B_VARIANTS['last-nested-input']));
});
test('lost ACK with real later last-child input: Check receipt is GET-only/unconfirmed and fixed retry retains later whole dirty draft', async ({ page }) => {
  const fixedFile = NATIVE_NOTE_EXPECTED_VARIANTS.typing, later = structuredClone(fixedFile);
  let last: unknown = later;
  for (const key of ['document', 'content', 4, 'content', 1, 'content', 0, 'content', 0]) {
    if (typeof key === 'number' && Array.isArray(last)) last = last[key];
    else if (typeof key === 'string' && isRecord(last)) last = last[key];
    else throw new Error('Complete original authored last-child path required');
  }
  if (!isRecord(last) || last.stype !== 'inline-text' || last.text !== '항목 본문 A') throw new Error('Original independent nested text required');
  last.text = '항목 본문 A / 마지막 중첩 입력';
  const store = controlled('SOURCE_A', fixedFile, editedRaw(fixedFile)); store.setHoldPut(); store.lose(); await open(page, 'SOURCE_A', store);
  const host = page.getByTestId('native2-preserve-host'); await host.locator('h2').filter({ hasText: '목표 A' }).click();
  await page.keyboard.press('End'); await page.keyboard.insertText(' • 독립 편집'); await page.getByRole('button', { name: 'Save fixed request', exact: true }).click(); await store.putEntered;
  const attempted = (await read(page)).journal?.fixed; expect(attempted?.bodyText).toBe(JSON.stringify(store.body));
  await page.getByRole('button', { name: 'Show last nested resource', exact: true }).click();
  await host.locator('p').filter({ hasText: '항목 본문 A' }).first().click(); await page.keyboard.press('End'); await page.keyboard.insertText(' / 마지막 중첩 입력');
  await page.getByRole('button', { name: 'Protect latest draft', exact: true }).click(); await expect(page.getByTestId('preserve-status')).toHaveText('latest-draft-protected');
  await full(page, later, '/4/1/'); const protectedLater = await read(page); expect(protectedLater.journal?.fixed).toEqual(attempted);
  expect(protectedLater.journal?.latestDraft.snapshotText).toBe(editedRaw(later)); expect(protectedLater.journal?.latestDraft.generation).toBe(3);
  store.releasePut(); await expect(page.getByTestId('preserve-status')).toHaveText('unknown-or-unprotected');
  await page.getByRole('button', { name: 'Check receipt', exact: true }).click(); await expect(page.getByTestId('preserve-status')).toHaveText('receipt_not_correlated');
  expect(store.calls.filter(c => c.method === 'PUT')).toHaveLength(1); await full(page, later, '/4/1/');
  await page.getByRole('button', { name: 'Retry fixed request', exact: true }).click(); await expect(page.getByTestId('preserve-status')).toHaveText('fixed-confirmed-later-draft-dirty');
  const after = await full(page, later, '/4/1/'); expect(after.journal?.fixed).toEqual(attempted); expect(after.journal?.latestDraft).toEqual(protectedLater.journal?.latestDraft);
  expect(store.calls.filter(c => c.method === 'PUT').map(c => c.body)).toEqual([JSON.stringify(store.body), JSON.stringify(store.body)]); expect(store.effects()).toBe(1);
  await page.reload(); await expect(host.locator('.on-doc')).toBeVisible(); await full(page, later); expect(store.effects()).toBe(1);
});
test('explicit leave protects final input without publishing; quota blocks leave and abrupt revoked child remains visibly unresolved', async ({ page }) => {
  const store = controlled('SOURCE_B'); await open(page, 'SOURCE_B', store); const host = page.getByTestId('native2-preserve-host');
  await page.getByRole('button', { name: 'Show last nested resource', exact: true }).click();
  await host.locator('p').filter({ hasText: 'B 자료 본문' }).click(); await page.keyboard.press('End'); await page.keyboard.insertText(' / 마지막 B 입력');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('controlled quota failure'); }; });
  await page.getByRole('button', { name: 'Leave after protecting input', exact: true }).click(); await expect(page.getByTestId('preserve-status')).toHaveText('leave-blocked-input-unprotected');
  await expect(page.getByTestId('preserve-error')).toHaveText('controlled quota failure'); expect((await read(page)).writable).toBe(true); await full(page, NATIVE_B_VARIANTS['last-nested-input'], '/1/1/');
  expect(store.calls.every(c => c.method === 'GET')).toBe(true); expect(store.effects()).toBe(0);
  await page.reload(); await expect(host.locator('.on-doc')).toBeVisible(); await page.getByRole('button', { name: 'Show last nested resource', exact: true }).click();
  await host.locator('p').filter({ hasText: 'B 자료 본문' }).click(); await page.keyboard.press('End'); await page.keyboard.insertText(' UNFLUSHED');
  await page.getByRole('button', { name: 'Revoke controlled role', exact: true }).click(); await expect(page.getByTestId('preserve-status')).toHaveText('revoked-unprotected-input-retained');
  await expect(host).toContainText('UNFLUSHED'); expect((await read(page)).durableRaw).toBeNull();
  await page.getByRole('button', { name: 'Retry fixed request', exact: true }).click(); expect(store.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
});
test('functional account-scoped discovery refuses corrupt same-scope raw and never auto-retries for a different controlled subject', async ({ page }) => {
  const store = controlled('SOURCE_A'); await open(page, 'SOURCE_A', store); await page.getByRole('button', { name: 'Protect latest draft', exact: true }).click();
  await expect(page.getByTestId('preserve-status')).toHaveText('latest-draft-protected'); const before = await read(page);
  await page.goto('/scenarios.html?case=native2-preserve-A&controlled-subject=other-user'); await expect(page.getByTestId('native2-preserve-host').locator('.on-doc')).toBeVisible();
  expect((await read(page)).journal).toBeUndefined(); expect((await read(page)).durableRaw).toBeNull(); expect(await page.evaluate(key => localStorage.getItem(key), before.journalKey)).toBe(before.durableRaw);
  await page.evaluate(key => localStorage.setItem(key, '{corrupt'), before.journalKey);
  await page.goto('/scenarios.html?case=native2-preserve-A'); await expect(page.getByTestId('preserve-error')).toHaveText('corrupt_native2_pending_record');
  expect(await page.evaluate(key => localStorage.getItem(key), before.journalKey)).toBe('{corrupt'); expect(store.calls.every(c => c.method === 'GET')).toBe(true);
});
test('real B underline selection and A structure retain full native body and history through preserve', async ({ page }, info) => {
  const b = controlled('SOURCE_B', NATIVE_B_VARIANTS['underline-overlap'], editedRaw(NATIVE_B_VARIANTS['underline-overlap']));
  await open(page, 'SOURCE_B', b); const host = page.getByTestId('native2-preserve-host');
  await host.locator('.mark-strike').first().click(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
  await page.keyboard.down('Shift'); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
  await expect.poll(async () => (await read(page)).selection).toMatchObject({ type: 'range', startOffset: 1, endOffset: 4, collapsed: false });
  const selected = await read(page); expect(selected.selection).toMatchObject({ type: 'range', startOffset: 1, endOffset: 4, collapsed: false });
  expect(selected.domRange).toMatchObject({ startOffset: 1, endOffset: 4, text: '토 B', collapsed: false });
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="native2-preserve-host"]'))).toBe(true);
  assertPositiveRange(selected, '검토 B', 1, 4);
  await info.attach('B-positive-selected-whole.json', { body: JSON.stringify(selected, null, 2), contentType: 'application/json' });
  await page.getByRole('button', { name: 'toggleUnderline', exact: true }).click(); await full(page, NATIVE_B_VARIANTS['underline-overlap']);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save fixed request', exact: true }).click(); await expect(page.getByTestId('preserve-status')).toHaveText('fixed-confirmed');
  await full(page, NATIVE_B_VARIANTS['underline-overlap']);
  await page.unroute('**/controlled-native2/**');
  const moved = structuredClone(NATIVE_NOTE_FIXTURES.SOURCE_A);
  [moved.document.content[0], moved.document.content[1]] = [moved.document.content[1], moved.document.content[0]];
  const a = controlled('SOURCE_A', moved, editedRaw(moved)); await open(page, 'SOURCE_A', a);
  await page.getByRole('button', { name: 'Move first block down', exact: true }).click(); await full(page, moved);
  await page.getByRole('button', { name: 'Undo local edit', exact: true }).click(); await full(page, NATIVE_NOTE_FIXTURES.SOURCE_A);
  await page.getByRole('button', { name: 'Redo local edit', exact: true }).click(); await full(page, moved);
  await page.getByRole('button', { name: 'Save fixed request', exact: true }).click(); await expect(page.getByTestId('preserve-status')).toHaveText('fixed-confirmed'); await full(page, moved);
});
test('held lookup preserves actual valid SID/range/focus/history; late PUT after revoke never confirms or installs', async ({ page }, info) => {
  const store = controlled('SOURCE_A'); await open(page, 'SOURCE_A', store);
  await page.getByRole('button', { name: 'Save fixed request', exact: true }).click(); await expect(page.getByTestId('preserve-status')).toHaveText('fixed-confirmed');
  store.setHoldLookup(); await page.getByRole('button', { name: 'Check receipt', exact: true }).click(); await store.lookupEntered;
  const host = page.getByTestId('native2-preserve-host'); await host.locator('h2').filter({ hasText: '목표 A' }).click();
  await page.keyboard.press('Home'); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.down('Shift'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
  await expect.poll(async () => (await read(page)).selection).toMatchObject({ type: 'range', startOffset: 3, endOffset: 4, collapsed: false });
  const before = await read(page); expect(before.selection).toMatchObject({ type: 'range', startOffset: 3, endOffset: 4, collapsed: false });
  expect(before.domRange).toMatchObject({ startOffset: 3, endOffset: 4, collapsed: false, text: 'A' });
  expect(before.domRange?.startNodeId).toBe(before.domRange?.endNodeId); expect(before.domRange?.startNodeId).toBeTruthy();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="native2-preserve-host"]'))).toBe(true);
  assertPositiveRange(before, '목표 A', 3, 4);
  await info.attach('A-held-before-whole-positive.json', { body: JSON.stringify(before, null, 2), contentType: 'application/json' });
  store.releaseLookup(); await expect(page.getByTestId('preserve-status')).toHaveText('fixed-confirmed');
  const after = await read(page); expect(after.model).toEqual(before.model); expect(after.nativeDocument).toEqual(before.nativeDocument);
  expect(after.history).toEqual(before.history); expect(after.selection).toEqual(before.selection); expect(after.domRange).toEqual(before.domRange);
  expect(after.snapshotText).toBe(before.snapshotText); expect(after.epoch).toBe(before.epoch); assertPositiveRange(after, '목표 A', 3, 4);
  await info.attach('A-held-after-whole-positive.json', { body: JSON.stringify(after, null, 2), contentType: 'application/json' });
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="native2-preserve-host"]'))).toBe(true);
  await page.unroute('**/controlled-native2/**'); await page.evaluate(() => localStorage.clear());
  const held = controlled('SOURCE_A'); held.setHoldPut(); await open(page, 'SOURCE_A', held);
  await page.getByRole('button', { name: 'Save fixed request', exact: true }).click(); await held.putEntered;
  const pending = await read(page); await page.getByRole('button', { name: 'Revoke controlled role', exact: true }).click(); held.releasePut();
  await expect(page.getByTestId('preserve-error')).toHaveText('stale_native2_writable_context');
  const retired = await read(page); expect(retired.model).toEqual(pending.model); expect(retired.nativeDocument).toEqual(pending.nativeDocument);
  expect(retired.history).toEqual(pending.history); expect(retired.durableRaw).toBe(pending.durableRaw); expect(retired.journal?.phase).toBe('pending');
  expect(retired.writable).toBe(false); expect(held.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
});
