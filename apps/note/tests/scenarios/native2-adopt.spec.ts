import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { parseRegistryDefinition, REGISTRY_DIGEST } from '@barocss/schema/registry-contract';
import { NATIVE_NOTE_FIXTURES, NATIVE_NOTE_EXPECTED_VARIANTS } from '../../src/native2-scenario-fixtures';
import type { Native2AdoptObservation } from '../../src/native2-adopt-scenario';
type Fixture = typeof NATIVE_NOTE_FIXTURES[keyof typeof NATIVE_NOTE_FIXTURES];
const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const docA = '33333333-3333-4333-8333-333333333333', docB = '44444444-4444-4444-8444-444444444444';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const raw = (f: Fixture) => JSON.stringify(f);
const targetRaw = (f: Fixture) => JSON.stringify({ format: 'barocss-note', version: 2, schemaBundle: f.schemaBundle, document: f.document, ...('savedAt' in f ? { savedAt: f.savedAt } : {}) }, null, 2) + '\n';
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
async function read(page: Page): Promise<Native2AdoptObservation> {
  return page.evaluate(() => { const v = window.readNative2Adopt?.(); if (!v) throw new Error('Actual native preserve not ready'); return v; });
}
function assertPositiveRange(v: Native2AdoptObservation, text: string, startOffset: number, endOffset: number) {
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
function controlled(expectedTarget: Fixture = NATIVE_NOTE_FIXTURES.TARGET_A2) {
  const original = NATIVE_NOTE_FIXTURES.SOURCE_A, originalB = NATIVE_NOTE_FIXTURES.SOURCE_B;
  const head = (documentId: string, file: Fixture, title: string) => ({ documentId, tenantId, workspaceId, product: 'note', title,
    creatorUserId: null, metadataRevision: 1, mode: 'snapshot', pageId: file.document.attributes.pageId,
    documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: hash(raw(file)) });
  const a = head(docA, original, 'SOURCE_A'), b = head(docB, originalB, 'SOURCE_B'), text = targetRaw(expectedTarget);
  const expected = { schemaAction: 'adopt', expectedRevision: 1, expectedSnapshotHash: hash(raw(original)),
    expectedPriorPinDigest: hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenantId, workspaceId, docA, 'pinned', original.schemaBundle.selected.map(r => [r.schemaId, r.version, r.digest])])), snapshotText: text, idempotencyKey: 'native2-adopt-test-1' };
  const receipt = { operation: 'update', idempotencyKey: expected.idempotencyKey, requestHash: 'f'.repeat(64),
    document: { ...a, revision: 2, snapshotHash: hash(text) }, snapshotText: text };
  const entries = NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle.definitions.map(e => ({ ...e.reference, digestAlgorithm: REGISTRY_DIGEST,
    definitionText: e.definitionText, ...parseRegistryDefinition(e.definitionText), actorIdentityId: '66666666-6666-4666-8666-666666666666', createdAt: '2026-10-01T00:00:00.000Z' }));
  const version = { record: entries[3], dependencies: [entries[1], entries[0], entries[2]] };
  let committed = false, effects = 0, holdPut = false, holdLookup = false, holdVersion = false, lose = false;
  let enteredPut!: () => void, releasePut!: () => void, enteredLookup!: () => void, releaseLookup!: () => void, enteredVersion!: () => void, releaseVersion!: () => void;
  const putEntered = new Promise<void>(r => { enteredPut = r; }), putGate = new Promise<void>(r => { releasePut = r; });
  const lookupEntered = new Promise<void>(r => { enteredLookup = r; }), lookupGate = new Promise<void>(r => { releaseLookup = r; });
  const versionEntered = new Promise<void>(r => { enteredVersion = r; }), versionGate = new Promise<void>(r => { releaseVersion = r; });
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const install = (page: Page) => page.route('**/controlled-native2/**', async route => {
    const request = route.request(), method = request.method(), url = request.url(); calls.push({ method, url, body: request.postData() });
    if (url.includes('/schemas/')) { expect(method).toBe('GET'); expect(url.endsWith('/11111111-1111-1111-1111-111111111111/versions/2')).toBe(true);
      if (holdVersion) { enteredVersion(); await versionGate; } return route.fulfill({ json: version }); }
    if (method === 'PUT') {
      expect(url.endsWith(`/documents/${docA}/snapshot`)).toBe(true); expect(request.postData()).toBe(JSON.stringify(expected));
      expect(JSON.parse(JSON.parse(request.postData()!).snapshotText)).toEqual(expectedTarget);
      if (!committed) { committed = true; effects++; }
      if (holdPut) { enteredPut(); await putGate; }
      if (lose) { lose = false; return route.abort('failed'); } return route.fulfill({ json: receipt });
    }
    expect(method).toBe('GET'); expect(request.postData()).toBeNull();
    if (url.includes('/receipts/')) { if (holdLookup) { enteredLookup(); await lookupGate; } return committed ? route.fulfill({ json: receipt }) : route.fulfill({ status: 404, json: { status: 'not_found' } }); }
    const isB = url.includes(docB), h = isB ? b : committed ? receipt.document : a;
    const snapshotText = isB ? raw(originalB) : committed ? text : raw(original);
    const bundle = isB ? originalB.schemaBundle : committed ? expectedTarget.schemaBundle : original.schemaBundle;
    return route.fulfill({ json: url.endsWith('/schema-bundle') ? { status: 'pinned', documentId: h.documentId, documentRevision: h.revision,
      snapshotHash: h.snapshotHash, nativeFormat: { format: 'barocss-note', version: 2 }, bundle } : { document: h, snapshotText } });
  });
  return { install, calls, expected, receipt, putEntered, lookupEntered, versionEntered, effects: () => effects,
    holdPut: () => { holdPut = true; }, holdLookup: () => { holdLookup = true; }, holdVersion: () => { holdVersion = true; },
    releasePut: () => releasePut(), releaseLookup: () => releaseLookup(), releaseVersion: () => releaseVersion(), lose: () => { lose = true; } };
}
async function open(page: Page, store: ReturnType<typeof controlled>) {
  await store.install(page); await page.goto('/scenarios.html?case=native2-adopt-A');
  await expect(page.getByTestId('native2-adopt-host').locator('.on-doc')).toBeVisible(); await full(page, NATIVE_NOTE_FIXTURES.SOURCE_A);
}
async function prepare(page: Page) {
  await page.getByRole('button', { name: 'Prepare exact schema 111 v2', exact: true }).click();
  await expect(page.getByTestId('adopt-status')).toHaveText('exact-version-prepared-source-protected');
}
async function targetVersion(page: Page) {
  const value = await page.evaluate(() => window.readNative2Transport?.()); if (!value) throw new Error('Actual known read-only target required');
  return value;
}
test.afterEach(async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath('actual-adoption-current.png'), fullPage: true });
  const v = await page.evaluate(() => window.readNative2Adopt?.()); if (v) await info.attach('whole-adoption-final-source.json', { body: JSON.stringify(v, null, 2), contentType: 'application/json' });
});
test('explicit registered A v2 target confirms once while entire live A1 source/context/history stays; protected exit reopens whole readonly target and B v1', async ({ page }, info) => {
  const store = controlled(); await open(page, store); await prepare(page); const before = await full(page, NATIVE_NOTE_FIXTURES.SOURCE_A);
  await page.getByRole('button', { name: 'Adopt fixed target', exact: true }).click(); await expect(page.getByTestId('adopt-status')).toHaveText('adoption-fixed-confirmed-source-session-retained');
  const after = await full(page, NATIVE_NOTE_FIXTURES.SOURCE_A); expect(after.model).toEqual(before.model); expect(after.history).toEqual(before.history); expect(after.epoch).toBe(before.epoch);
  expect(after.journal?.fixed?.bodyText).toBe(JSON.stringify(store.expected)); expect(after.journal?.fixed?.snapshotText).toBe(targetRaw(NATIVE_NOTE_FIXTURES.TARGET_A2)); expect(after.journal?.latestSourceDraft.snapshotText).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_A)); expect(store.effects()).toBe(1);
  await info.attach('whole-fixed-adoption-source-retained.json', { body: JSON.stringify(after, null, 2), contentType: 'application/json' });
  await page.getByRole('button', { name: 'Leave protected and open target read-only', exact: true }).click(); await expect(page).toHaveURL(/case=native2-transport-A2$/);
  await expect(page.getByTestId('native2-transport-host').locator('.on-doc')).toBeVisible(); const reopened = await targetVersion(page);
  expect(reopened.nativeDocument).toEqual(NATIVE_NOTE_FIXTURES.TARGET_A2.document); expect(JSON.parse(reopened.snapshotText)).toEqual(NATIVE_NOTE_FIXTURES.TARGET_A2);
  expect(observedEngine(reopened.model)).toEqual(expectedEngine(NATIVE_NOTE_FIXTURES.TARGET_A2.document, true));
  await page.getByTestId('native2-transport-host').click(); await page.keyboard.insertText('READONLY MUST REFUSE'); const still = await targetVersion(page); expect(still.model).toEqual(reopened.model); expect(still.history).toEqual(reopened.history);
  await info.attach('whole-actual-readonly-adopted-target.json', { body: JSON.stringify(still, null, 2), contentType: 'application/json' });
  await page.goto('/scenarios.html?case=native2-transport-B'); await expect(page.getByTestId('native2-transport-host').locator('.on-doc')).toBeVisible();
  const b = await targetVersion(page); expect(b.nativeDocument).toEqual(NATIVE_NOTE_FIXTURES.SOURCE_B.document); expect(b.snapshotText).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_B));
  expect(observedEngine(b.model)).toEqual(expectedEngine(NATIVE_NOTE_FIXTURES.SOURCE_B.document, true)); expect(store.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
  await info.attach('whole-B-v1-native-unmodified.json', { body: JSON.stringify(b, null, 2), contentType: 'application/json' });
});
test('lost ACK with genuine root and later last-child input keeps fixed adopted body separate; Check GET-only and explicit retry preserve whole dirty source through reload', async ({ page }, info) => {
  const typedTarget = { ...NATIVE_NOTE_EXPECTED_VARIANTS.typing, schemaBundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle,
    document: { ...NATIVE_NOTE_EXPECTED_VARIANTS.typing.document, content: NATIVE_NOTE_FIXTURES.TARGET_A2.document.content.map((node, i) => i === 0 ? NATIVE_NOTE_EXPECTED_VARIANTS.typing.document.content[0] : node) } };
  const store = controlled(typedTarget); store.holdPut(); store.lose(); await open(page, store);
  await page.getByTestId('native2-adopt-host').locator('h2').filter({ hasText: '목표 A' }).click(); await page.keyboard.press('End'); await page.keyboard.insertText(' • 독립 편집');
  await prepare(page); await full(page, NATIVE_NOTE_EXPECTED_VARIANTS.typing); await page.getByRole('button', { name: 'Adopt fixed target', exact: true }).click(); await store.putEntered;
  const fixed = await read(page); expect(fixed.journal?.fixed?.sourceSnapshotText).toBe(fixed.snapshotText); expect(fixed.journal?.fixed?.generation).toBe(2);
  await page.getByRole('button', { name: 'Show last nested resource', exact: true }).click();
  await page.getByTestId('native2-adopt-host').locator('p').filter({ hasText: '항목 본문 A' }).first().click(); await page.keyboard.press('End'); await page.keyboard.insertText(' / 마지막 중첩 입력');
  await page.getByRole('button', { name: 'Protect latest draft', exact: true }).click(); await expect(page.getByTestId('adopt-status')).toHaveText('latest-draft-protected');
  const combined = { ...NATIVE_NOTE_EXPECTED_VARIANTS.nested, document: { ...NATIVE_NOTE_EXPECTED_VARIANTS.nested.document,
    content: NATIVE_NOTE_EXPECTED_VARIANTS.nested.document.content.map((node, i) => i === 0 ? NATIVE_NOTE_EXPECTED_VARIANTS.typing.document.content[0] : node) } };
  const later = await full(page, combined, '/4/1/'); expect(later.journal?.latestSourceDraft.generation).toBe(3); expect(later.journal?.fixed).toEqual(fixed.journal?.fixed);
  store.releasePut(); await expect(page.getByTestId('adopt-status')).toHaveText('unknown-or-unprotected');
  const unknown = await read(page); expect(unknown.journal?.fixed).toEqual(fixed.journal?.fixed);
  await page.getByRole('button', { name: 'Check receipt', exact: true }).click(); await expect(page.getByTestId('adopt-status')).toHaveText('adoption_receipt_not_correlated');
  const checked = await full(page, combined, '/4/1/'); expect(checked.model).toEqual(unknown.model); expect(checked.history).toEqual(unknown.history); expect(checked.journal?.fixed).toEqual(fixed.journal?.fixed); expect(store.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry fixed request', exact: true }).click(); await expect(page.getByTestId('adopt-status')).toHaveText('adoption-fixed-confirmed-later-source-dirty');
  const confirmed = await full(page, combined, '/4/1/'); expect(confirmed.journal?.latestSourceDraft.snapshotText).toBe(later.journal?.latestSourceDraft.snapshotText); expect(confirmed.journal?.fixed).toEqual(fixed.journal?.fixed); expect(store.effects()).toBe(1);
  expect(store.calls.filter(c => c.method === 'PUT').map(c => c.body)).toEqual([JSON.stringify(store.expected), JSON.stringify(store.expected)]);
  await info.attach('whole-older-target-and-later-source.json', { body: JSON.stringify(confirmed, null, 2), contentType: 'application/json' });
  await page.reload(); await expect(page.getByTestId('native2-adopt-host').locator('.on-doc')).toBeVisible(); const recovered = await full(page, combined);
  expect(recovered.durableRaw).toBe(confirmed.durableRaw); expect(store.calls.filter(c => c.method === 'PUT')).toHaveLength(2);
});
test('held receipt lookup retains affirmative same intended engine/DOM SID/range/focus and entire old-source history; late revoked PUT cannot confirm', async ({ page }, info) => {
  const store = controlled(); await open(page, store); await prepare(page); await page.getByRole('button', { name: 'Adopt fixed target', exact: true }).click();
  await expect(page.getByTestId('adopt-status')).toHaveText('adoption-fixed-confirmed-source-session-retained');
  store.holdLookup(); await page.getByRole('button', { name: 'Check receipt', exact: true }).click(); await store.lookupEntered;
  await page.getByTestId('native2-adopt-host').locator('h2').filter({ hasText: '목표 A' }).click(); await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight'); await page.keyboard.down('Shift'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
  await expect.poll(async () => (await read(page)).selection).toMatchObject({ type: 'range', startOffset: 3, endOffset: 4, collapsed: false });
  await expect.poll(async () => (await read(page)).hostFocused).toBe(true); const before = await full(page, NATIVE_NOTE_FIXTURES.SOURCE_A); assertPositiveRange(before, '목표 A', 3, 4);
  await info.attach('A-held-before-whole-positive.json', { body: JSON.stringify(before, null, 2), contentType: 'application/json' });
  store.releaseLookup(); await expect(page.getByTestId('adopt-status')).toHaveText('adoption-fixed-confirmed-source-session-retained');
  const after = await full(page, NATIVE_NOTE_FIXTURES.SOURCE_A); assertPositiveRange(after, '목표 A', 3, 4);
  expect(after.model).toEqual(before.model); expect(after.history).toEqual(before.history); expect(after.nativeDocument).toEqual(before.nativeDocument);
  expect(after.snapshotText).toBe(before.snapshotText); expect(after.epoch).toBe(before.epoch); expect(after.selection).toEqual(before.selection); expect(after.domRange).toEqual(before.domRange);
  await info.attach('A-held-after-whole-positive.json', { body: JSON.stringify(after, null, 2), contentType: 'application/json' });
  await page.unroute('**/controlled-native2/**'); await page.evaluate(() => localStorage.clear());
  const held = controlled(); held.holdPut(); await open(page, held); await prepare(page); await page.getByRole('button', { name: 'Adopt fixed target', exact: true }).click(); await held.putEntered;
  const pending = await read(page); await page.getByRole('button', { name: 'Revoke controlled role', exact: true }).click(); held.releasePut();
  await expect(page.getByTestId('adopt-error')).toHaveText('stale_native2_writable_context'); const retired = await read(page);
  expect(retired.model).toEqual(pending.model); expect(retired.nativeDocument).toEqual(pending.nativeDocument); expect(retired.history).toEqual(pending.history); expect(retired.durableRaw).toBe(pending.durableRaw);
  expect(retired.journal?.phase).toBe('pending'); expect(retired.writable).toBe(false); expect(held.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
});
test('held exact version response cannot prepare an edited or revoked source binding', async ({ page }, info) => {
  const store = controlled(); store.holdVersion(); await open(page, store); await page.getByRole('button', { name: 'Prepare exact schema 111 v2', exact: true }).click(); await store.versionEntered;
  await page.getByTestId('native2-adopt-host').locator('h2').filter({ hasText: '목표 A' }).click(); await page.keyboard.press('End'); await page.keyboard.insertText(' • 독립 편집');
  store.releaseVersion(); await expect(page.getByTestId('adopt-error')).toHaveText('adoption_source_changed_prepare_again'); await full(page, NATIVE_NOTE_EXPECTED_VARIANTS.typing);
  await page.getByRole('button', { name: 'Adopt fixed target', exact: true }).click(); await expect(page.getByTestId('adopt-error')).toHaveText('adoption_source_changed_prepare_again');
  expect(store.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
  await info.attach('whole-edited-source-before-freeze-refusal.json', { body: JSON.stringify(await read(page), null, 2), contentType: 'application/json' });
  await page.unroute('**/controlled-native2/**'); await page.evaluate(() => localStorage.clear());
  const retired = controlled(); retired.holdVersion(); await open(page, retired); await page.getByRole('button', { name: 'Prepare exact schema 111 v2', exact: true }).click(); await retired.versionEntered;
  const before = await read(page); await page.getByRole('button', { name: 'Revoke controlled role', exact: true }).click(); retired.releaseVersion();
  await expect(page.getByTestId('adopt-error')).toHaveText('stale_native2_writable_context'); const after = await read(page);
  expect(after.model).toEqual(before.model); expect(after.history).toEqual(before.history); expect(after.durableRaw).toBe(before.durableRaw); expect(retired.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
});
test('quota blocks explicit leave with genuine final input; abrupt revoked last-child input stays visibly unresolved without false durable target', async ({ page }) => {
  const store = controlled(); await open(page, store); await prepare(page); const protectedBefore = await read(page);
  await page.getByTestId('native2-adopt-host').locator('h2').filter({ hasText: '목표 A' }).click(); await page.keyboard.press('End'); await page.keyboard.insertText(' • 독립 편집');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('controlled quota'); }; });
  await page.getByRole('button', { name: 'Leave after protecting input', exact: true }).click(); await expect(page.getByTestId('adopt-status')).toHaveText('leave-blocked-input-unprotected');
  const blocked = await full(page, NATIVE_NOTE_EXPECTED_VARIANTS.typing); expect(blocked.writable).toBe(true); expect(blocked.durableRaw).toBe(protectedBefore.durableRaw); expect(store.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
  await page.reload(); await expect(page.getByTestId('native2-adopt-host').locator('.on-doc')).toBeVisible(); await full(page, NATIVE_NOTE_FIXTURES.SOURCE_A);
  await page.getByRole('button', { name: 'Show last nested resource', exact: true }).click();
  await page.getByTestId('native2-adopt-host').locator('p').filter({ hasText: '항목 본문 A' }).first().click(); await page.keyboard.press('End'); await page.keyboard.insertText(' UNFLUSHED');
  const before = await read(page); await page.getByRole('button', { name: 'Revoke controlled role', exact: true }).click();
  await expect(page.getByTestId('native2-adopt-host')).toContainText('UNFLUSHED'); const revoked = await read(page);
  expect(revoked.model).toEqual(before.model); expect(revoked.childModel).toEqual(before.childModel); expect(revoked.durableRaw).toBe(before.durableRaw); expect(revoked.writable).toBe(false);
  expect(store.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
});
test('unresolved full preserve and v1 recovery bytes block adoption without rewriting or migrating either namespace', async ({ page }) => {
  const store = controlled(); await open(page, store); const initial = await read(page);
  const scope = { issuer: 'controlled-issuer', subject: 'controlled-writer', tenantId, workspaceId };
  const source = raw(NATIVE_NOTE_FIXTURES.SOURCE_A), head = { ...store.receipt.document, revision: 1, snapshotHash: hash(source) };
  const priorBody = { ...store.expected, schemaAction: 'preserve', snapshotText: source, idempotencyKey: 'old-preserve-failure' };
  const fixed = { version: 1, operation: 'update', scope: { ...scope, documentId: docA }, generation: 1,
    base: { document: head, snapshotText: source }, snapshotText: source, snapshotHash: hash(source), idempotencyKey: priorBody.idempotencyKey, expectedPriorPinDigest: priorBody.expectedPriorPinDigest, bodyText: JSON.stringify(priorBody) };
  const prefix = 'wonffice.note.experimental-native2-preserve.v1:' + encodeURIComponent(JSON.stringify([scope.issuer, scope.subject, tenantId, workspaceId, docA]));
  const priorRaw = JSON.stringify({ version: 1, kind: 'experimental-native2-preserve', scope: { ...scope, documentId: docA }, base: fixed.base, latestDraft: { generation: 1, snapshotText: source }, fixed, phase: 'unknown' });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: prefix, raw: priorRaw }); await prepare(page);
  await page.getByRole('button', { name: 'Adopt fixed target', exact: true }).click(); await expect(page.getByTestId('adopt-error')).toHaveText('native2_prior_recovery_unresolved');
  expect(await page.evaluate(key => localStorage.getItem(key), prefix)).toBe(priorRaw); await full(page, NATIVE_NOTE_FIXTURES.SOURCE_A);
  await page.evaluate(key => localStorage.removeItem(key), prefix);
  const legacyText = JSON.stringify({ format: 'barocss-note', version: 1, document: { stype: 'note', attributes: { title: 'Old draft', pageId: docA }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'old input retained' }] }] } });
  const draftId = '77777777-7777-4777-8777-777777777777', documentRef = `server:${docA}`;
  const legacyKey = `wonffice.note.pending.v1:${encodeURIComponent(JSON.stringify(scope))}:${encodeURIComponent(JSON.stringify(documentRef))}:${draftId}`;
  const legacyRaw = JSON.stringify({ version: 1, draftId, scope: { ...scope, documentRef }, base: { operation: 'update', documentId: docA, expectedRevision: 1 }, status: 'draft', snapshotText: legacyText, savedAt: '2026-10-01T00:00:00.000Z' });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: legacyKey, raw: legacyRaw });
  await page.getByRole('button', { name: 'Adopt fixed target', exact: true }).click(); await expect(page.getByTestId('adopt-error')).toHaveText('native2_prior_recovery_unresolved');
  expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBe(legacyRaw); const blocked = await full(page, NATIVE_NOTE_FIXTURES.SOURCE_A);
  expect(blocked.model).toEqual(initial.model); expect(blocked.history).toEqual(initial.history); expect(store.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
});
test('functional scoped discovery and corrupt adoption raw survive reload without automatic send or new target installation', async ({ page }) => {
  const store = controlled(); await open(page, store); await prepare(page); const before = await read(page);
  await page.goto('/scenarios.html?case=native2-adopt-A&controlled-subject=other-user'); await expect(page.getByTestId('native2-adopt-host').locator('.on-doc')).toBeVisible();
  const foreign = await full(page, NATIVE_NOTE_FIXTURES.SOURCE_A); expect(foreign.journal).toBeUndefined(); expect(foreign.durableRaw).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), before.journalKey)).toBe(before.durableRaw);
  await page.evaluate(key => localStorage.setItem(key, '{corrupt'), before.journalKey);
  await page.goto('/scenarios.html?case=native2-adopt-A'); await expect(page.getByTestId('adopt-error')).toHaveText('corrupt_native2_adopt_record');
  expect(await page.evaluate(key => localStorage.getItem(key), before.journalKey)).toBe('{corrupt'); expect(store.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
});
