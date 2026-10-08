import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NATIVE_NOTE_FIXTURES, NATIVE_NOTE_EXPECTED_VARIANTS, NATIVE_B_VARIANTS } from './native2-scenario-fixtures';
import { createExperimentalNative2Preserver, isNative2FixedConfirmation, isNative2DirectReceipt, type Native2PreserveAttempt } from './experimental-native2-preserve';

const scope = { issuer: 'controlled-issuer', subject: 'controlled-writer', tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
const documentId = '33333333-3333-4333-8333-333333333333';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const raw = (file: unknown) => JSON.stringify(file);
type Fixture = typeof NATIVE_NOTE_FIXTURES[keyof typeof NATIVE_NOTE_FIXTURES];
function base(file: Fixture = NATIVE_NOTE_FIXTURES.SOURCE_A, id = documentId, revision = 1) {
  const snapshotText = raw(file);
  return { snapshotText, document: { documentId: id, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
    product: 'note' as const, title: 'Controlled original', creatorUserId: null, metadataRevision: 1,
    mode: 'snapshot' as const, pageId: file.document.attributes.pageId, documentKey: `wonffice-${scope.tenantId}-${id}`,
    fileFormat: 'barocss-note' as const, fileVersion: 2 as const, revision, snapshotHash: hash(snapshotText) } };
}
const pinDigest = (file: Fixture, id = documentId) => hash(JSON.stringify([
  'wonffice.note.snapshot-pins.cas.v1', scope.tenantId, scope.workspaceId, id, 'pinned',
  file.schemaBundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest]) ]));
function harness(responses: Array<Response | Error> = [], state = { current: true, writable: true, durable: undefined as Native2PreserveAttempt | undefined }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const writer = createExperimentalNative2Preserver({ scope, apiBase: '/controlled-native2',
    isCurrent: () => state.current, isWritableCurrent: () => state.writable,
    readDurableAttempt: async () => state.durable,
    authorizedFetch: async (url, init) => {
      calls.push({ url: String(url), init }); const next = responses.shift();
      if (next instanceof Error) throw next;
      if (!next) throw new Error('Missing controlled response'); return next;
    } });
  return { writer, calls, state, responses };
}
function receipt(one: ReturnType<typeof base>, text: string, requestHash = 'e'.repeat(64)) {
  return { operation: 'update', idempotencyKey: 'native2-preserve-test-1', requestHash,
    document: { ...one.document, revision: one.document.revision + 1, snapshotHash: hash(text) }, snapshotText: text };
}
function reopen(r: ReturnType<typeof receipt>, file: typeof NATIVE_NOTE_FIXTURES.SOURCE_A) {
  return [Response.json({ document: r.document, snapshotText: r.snapshotText }),
    Response.json({ status: 'pinned', documentId: r.document.documentId, documentRevision: r.document.revision,
      snapshotHash: r.document.snapshotHash, nativeFormat: { format: 'barocss-note', version: 2 }, bundle: file.schemaBundle })];
}
describe('private preserve-existing native2 fixed requests', () => {
  it('a proof or direct receipt cannot outlive its captured writable owner', async () => {
    const one = base(), r = receipt(one, one.snapshotText), h = harness([Response.json(r), ...reopen(r, NATIVE_NOTE_FIXTURES.SOURCE_A)]);
    const fixed = await h.writer.freeze(one, one.snapshotText, r.idempotencyKey, 1); h.state.durable = fixed;
    const direct = await h.writer.send(fixed), proof = await h.writer.confirm(fixed, direct);
    if (proof.status !== 'fixed-confirmed') throw new Error('Full current proof required');
    expect(isNative2FixedConfirmation(proof)).toBe(true); expect(isNative2DirectReceipt(direct, fixed)).toBe(true);
    h.state.writable = false; expect(isNative2FixedConfirmation(proof)).toBe(false); expect(isNative2DirectReceipt(direct, fixed)).toBe(false);
  });
  it.each(Object.entries(NATIVE_NOTE_FIXTURES))('freezes full %s with independent experimental pin CAS and exact six-key body', async (_name, file) => {
    const before = structuredClone(file), one = base(file), { writer, calls } = harness();
    const fixed = await writer.freeze(one, raw(file), 'native2-preserve-test-1', 1);
    const body = { schemaAction: 'preserve', expectedRevision: 1, expectedSnapshotHash: hash(raw(file)),
      expectedPriorPinDigest: pinDigest(file), snapshotText: raw(file), idempotencyKey: 'native2-preserve-test-1' };
    expect(fixed.bodyText).toBe(JSON.stringify(body)); expect(JSON.parse(fixed.bodyText)).toEqual(body);
    expect(fixed.base).toEqual(one); expect(fixed.snapshotText).toBe(raw(file)); expect(fixed.snapshotHash).toBe(hash(raw(file)));
    expect(fixed.generation).toBe(1); expect(fixed.scope).toEqual({ ...scope, documentId });
    expect(await writer.recoverAttempt(structuredClone(fixed))).toEqual(fixed);
    expect(Object.isFrozen(fixed)).toBe(true); expect(Object.isFrozen(fixed.base.document)).toBe(true);
    expect(file).toEqual(before); expect(calls).toEqual([]);
  });
  it.each(Object.entries(NATIVE_NOTE_EXPECTED_VARIANTS))('accepts entire independent A %s body without changing pins/identity', async (_name, file) => {
    const { writer, calls } = harness(); const fixed = await writer.freeze(base(), raw(file), 'native2-preserve-test-1', 2);
    expect(fixed.snapshotText).toBe(raw(file)); expect(JSON.parse(fixed.bodyText).snapshotText).toBe(raw(file));
    expect(JSON.parse(fixed.snapshotText)).toEqual(file); expect(calls).toEqual([]);
  });
  it.each(Object.entries(NATIVE_B_VARIANTS))('accepts complete independently authored B %s', async (_name, file) => {
    const { writer, calls } = harness(); const fixed = await writer.freeze(base(NATIVE_NOTE_FIXTURES.SOURCE_B), raw(file), 'native2-preserve-test-1', 2);
    expect(fixed.snapshotText).toBe(raw(file)); expect(JSON.parse(fixed.snapshotText)).toEqual(file); expect(calls).toEqual([]);
  });
  it('refuses A1 -> A2 adoption and page/rawhash/base mutation without a request', async () => {
    const h = harness();
    await expect(h.writer.freeze(base(), raw(NATIVE_NOTE_FIXTURES.TARGET_A2), 'native2-preserve-test-1', 1)).rejects.toMatchObject({ code: 'native2_preserve_conflict' });
    const wrong = structuredClone(NATIVE_NOTE_FIXTURES.SOURCE_A); wrong.document.attributes.pageId = 'other-page';
    await expect(h.writer.freeze(base(), raw(wrong), 'native2-preserve-test-1', 1)).rejects.toMatchObject({ code: 'native2_preserve_conflict' });
    await expect(h.writer.freeze({ ...base(), snapshotText: raw(wrong) }, raw(wrong), 'native2-preserve-test-1', 1)).rejects.toBeDefined();
    expect(h.calls).toEqual([]);
  });
  it('requires exact durable attempt before sending and never widens action on recovered JSON', async () => {
    const h = harness(), one = base(), fixed = await h.writer.freeze(one, one.snapshotText, 'native2-preserve-test-1', 1);
    await expect(h.writer.send(fixed)).rejects.toMatchObject({ code: 'native2_attempt_not_durable' });
    const wrong = { ...fixed, bodyText: fixed.bodyText.replace('preserve', 'adopt') };
    await expect(h.writer.recoverAttempt(wrong)).rejects.toMatchObject({ code: 'invalid_native2_attempt' });
    h.state.durable = { ...fixed, idempotencyKey: 'other' };
    await expect(h.writer.send(fixed)).rejects.toMatchObject({ code: 'native2_attempt_not_durable' }); expect(h.calls).toEqual([]);
  });
  it('confirms only exact direct fixed response after entire current read/head/raw/bundle equality', async () => {
    const one = base(), text = raw(NATIVE_NOTE_EXPECTED_VARIANTS.typing), r = receipt(one, text), h = harness([Response.json(r), ...reopen(r, NATIVE_NOTE_EXPECTED_VARIANTS.typing)]);
    const fixed = await h.writer.freeze(one, text, r.idempotencyKey, 1); h.state.durable = fixed;
    const direct = await h.writer.send(fixed), result = await h.writer.confirm(fixed, direct);
    expect(result.status).toBe('fixed-confirmed');
    if (result.status !== 'fixed-confirmed') throw new Error('Expected complete confirmation');
    expect(result.generation).toBe(1); expect(result.read.document).toEqual(r.document); expect(result.read.snapshotText).toBe(text);
    expect(result.read.file).toEqual({ fileVersion: 2, document: NATIVE_NOTE_EXPECTED_VARIANTS.typing.document,
      schemaBundle: NATIVE_NOTE_EXPECTED_VARIANTS.typing.schemaBundle, savedAt: NATIVE_NOTE_EXPECTED_VARIANTS.typing.savedAt });
    expect(h.calls.map(c => c.init?.method)).toEqual(['PUT', 'GET', 'GET']); expect(h.calls[0].init?.body).toBe(fixed.bodyText);
  });
  it('lost direct reply: lookup-only opaque receipt never confirms; explicit same-body retry correlates without duplicate effects', async () => {
    const one = base(), r = receipt(one, one.snapshotText), h = harness([new Error('response lost'), Response.json(r), Response.json(r), ...reopen(r, NATIVE_NOTE_FIXTURES.SOURCE_A)]);
    const fixed = await h.writer.freeze(one, one.snapshotText, r.idempotencyKey, 1); h.state.durable = fixed;
    await expect(h.writer.send(fixed)).rejects.toMatchObject({ code: 'network_error' });
    const found = await h.writer.checkReceipt(fixed); expect(await h.writer.confirm(fixed, found)).toEqual({ status: 'unconfirmed', reason: 'receipt_not_correlated' });
    expect(h.calls.map(c => c.init?.method)).toEqual(['PUT', 'GET']);
    const direct = await h.writer.send(fixed); expect((await h.writer.confirm(fixed, direct)).status).toBe('fixed-confirmed');
    expect(h.calls.filter(c => c.init?.method === 'PUT').map(c => c.init?.body)).toEqual([fixed.bodyText, fixed.bodyText]);
    expect(h.calls[1].url).toContain('/receipts/update/native2-preserve-test-1');
  });
  it('rejects lookup hash inconsistent with observed direct hash and refuses historical receipt current head', async () => {
    const one = base(), r = receipt(one, one.snapshotText), changed = receipt(one, raw(NATIVE_NOTE_EXPECTED_VARIANTS.typing));
    const h = harness([Response.json(r), Response.json({ ...r, requestHash: 'f'.repeat(64) }), ...reopen(changed, NATIVE_NOTE_EXPECTED_VARIANTS.typing)]);
    const fixed = await h.writer.freeze(one, one.snapshotText, r.idempotencyKey, 1); h.state.durable = fixed;
    const direct = await h.writer.send(fixed), found = await h.writer.checkReceipt(fixed);
    await expect(h.writer.confirm(fixed, found, direct.requestHash)).rejects.toMatchObject({ code: 'native2_receipt_conflict' });
    expect(await h.writer.confirm(fixed, direct)).toEqual({ status: 'unconfirmed', reason: 'current_head_differs' });
  });
  it.each(['operation', 'idempotencyKey', 'requestHash', 'snapshotText', 'document', 'extra'])( 'refuses malformed or wrong full receipt %s', async field => {
    const one = base(), r: Record<string, unknown> = receipt(one, one.snapshotText);
    if (field === 'extra') r.permission = 'owner'; else r[field] = 'wrong';
    const h = harness([Response.json(r)]), fixed = await h.writer.freeze(one, one.snapshotText, 'native2-preserve-test-1', 1); h.state.durable = fixed;
    await expect(h.writer.send(fixed)).rejects.toBeDefined(); expect(h.calls).toHaveLength(1);
  });
  it.each([401, 403, 404, 409, 503])('preserves HTTP %s and fixed bytes with no implicit retries', async status => {
    const h = harness([Response.json({ status: 'controlled_refusal' }, { status })]), one = base();
    const fixed = await h.writer.freeze(one, one.snapshotText, 'native2-preserve-test-1', 1); h.state.durable = fixed;
    await expect(h.writer.send(fixed)).rejects.toMatchObject({ status, code: 'controlled_refusal' }); expect(h.state.durable).toEqual(fixed); expect(h.calls).toHaveLength(1);
  });
  it.each(['fetch', 'body', 'durable'] as const)('refuses current writable owner retirement during %s without confirmation', async phase => {
    const h = harness(), one = base(), r = receipt(one, one.snapshotText);
    const fixed = await h.writer.freeze(one, one.snapshotText, r.idempotencyKey, 1); h.state.durable = fixed;
    let entered!: () => void, release!: () => void; const waiting = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    const response = Response.json(r); const text = response.text.bind(response);
    const writer = createExperimentalNative2Preserver({ scope, apiBase: '/controlled-native2', isCurrent: () => true,
      isWritableCurrent: () => h.state.writable, readDurableAttempt: async () => { if (phase === 'durable') { entered(); await held; } return fixed; },
      authorizedFetch: async () => { if (phase === 'fetch') { entered(); await held; } return response; } });
    if (phase === 'body') response.text = async () => { entered(); await held; return text(); };
    const pending = writer.send(fixed); await waiting; h.state.writable = false; release();
    await expect(pending).rejects.toMatchObject({ code: 'stale_native2_writable_context' });
  });
});
