import { describe, expect, it } from 'vitest';
import { readNoteSnapshotFile } from '@barocss/office-note/file';
import { NATIVE_NOTE_FIXTURES } from './native2-scenario-fixtures';

describe('original codec boundary before adoption implementation', () => {
  it('pure pin substitution refuses the missing declared Owner field without changing either complete input', () => {
    const before = JSON.stringify(NATIVE_NOTE_FIXTURES);
    const result = readNoteSnapshotFile(JSON.stringify({ ...NATIVE_NOTE_FIXTURES.SOURCE_A, schemaBundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle }));
    expect(result).toEqual({ error: 'native_dataset_schema_mismatch' });
    expect(JSON.stringify(NATIVE_NOTE_FIXTURES)).toBe(before);
  });
  it('full independently authored A2 with explicit Owner declaration is valid and preserves the whole B source', () => {
    const beforeB = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B);
    const target = NATIVE_NOTE_FIXTURES.TARGET_A2;
    expect(readNoteSnapshotFile(JSON.stringify(target))).toEqual({ fileVersion: 2, document: target.document, schemaBundle: target.schemaBundle, savedAt: target.savedAt });
    expect(JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B)).toBe(beforeB);
  });
});

import { createHash } from 'node:crypto';
import { parseRegistryDefinition, REGISTRY_DIGEST } from '@barocss/schema/registry-contract';
import { createExperimentalNative2Adopter, type Native2AdoptAttempt } from './experimental-native2-adopt';
import { NATIVE_NOTE_EXPECTED_VARIANTS } from './native2-scenario-fixtures';
const scope = { issuer: 'controlled-issuer', subject: 'controlled-writer', tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
const sourceRaw = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A), hash = (s: string) => createHash('sha256').update(s).digest('hex');
const targetRaw = JSON.stringify({ format: 'barocss-note', version: 2, schemaBundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle,
  document: NATIVE_NOTE_FIXTURES.TARGET_A2.document, savedAt: NATIVE_NOTE_FIXTURES.TARGET_A2.savedAt }, null, 2) + '\n';
const documentId = '33333333-3333-4333-8333-333333333333';
const base = { snapshotText: sourceRaw, document: { documentId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, product: 'note' as const,
  title: 'SOURCE_A', creatorUserId: null, metadataRevision: 1, mode: 'snapshot' as const, pageId: 'native2-note-A',
  documentKey: `wonffice-${scope.tenantId}-${documentId}`, fileFormat: 'barocss-note' as const, fileVersion: 2 as const, revision: 1, snapshotHash: hash(sourceRaw) } };
const chosen = NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle.selected[0];
function versionReply() {
  const records = NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle.definitions.map(e => ({ ...e.reference, digestAlgorithm: REGISTRY_DIGEST,
    definitionText: e.definitionText, ...parseRegistryDefinition(e.definitionText), actorIdentityId: '66666666-6666-4666-8666-666666666666', createdAt: '2026-10-01T00:00:00.000Z' }));
  return { record: records[3], dependencies: [records[1], records[0], records[2]] };
}
const receipt = { operation: 'update', idempotencyKey: 'native2-adopt-test-1', requestHash: 'f'.repeat(64),
  document: { ...base.document, revision: 2, snapshotHash: hash(targetRaw) }, snapshotText: targetRaw };
function harness(replies: Response[] = [Response.json(versionReply())]) {
  let current = true, prior = false, stored: Native2AdoptAttempt | undefined;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const writer = createExperimentalNative2Adopter({ scope, apiBase: '/controlled-native2', isCurrent: () => current, isAdoptWritableCurrent: () => current,
    hasUnresolvedPrior: async () => prior, readDurableAttempt: async () => stored, authorizedFetch: async (url, init) => {
      calls.push({ url: String(url), init }); const response = replies.shift(); if (!response) throw new Error('Controlled lost response'); return response;
    } });
  return { writer, calls, retire: () => { current = false; }, blockPrior: () => { prior = true; }, persist: (v: Native2AdoptAttempt) => { stored = v; } };
}
async function fixed(h = harness()) {
  const choice = await h.writer.resolveExact(chosen), attempt = await h.writer.freeze(base, sourceRaw, choice, [4, 0], 'native2-adopt-test-1', 1);
  h.persist(attempt); return { ...h, attempt, choice };
}
describe('private fixed native2 adoption protocol', () => {
  it('resolves exact registered version/complete closure and freezes only independently declared Owner delta, full ordered pins and six-key body', async () => {
    const before = JSON.stringify(NATIVE_NOTE_FIXTURES), h = await fixed();
    expect(h.calls[0]).toMatchObject({ url: `/controlled-native2/v1/tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/schemas/${chosen.schemaId}/versions/2`, init: { method: 'GET', cache: 'no-store' } });
    expect(h.choice).toEqual({ reference: chosen, ...versionReply() });
    expect(h.attempt.snapshotText).toBe(targetRaw); expect(JSON.parse(h.attempt.snapshotText)).toEqual(NATIVE_NOTE_FIXTURES.TARGET_A2);
    expect(h.attempt.sourceSnapshotText).toBe(sourceRaw); expect(h.attempt.base).toEqual(base);
    const body = { schemaAction: 'adopt', expectedRevision: 1, expectedSnapshotHash: hash(sourceRaw),
      expectedPriorPinDigest: '97a2b55ed9691484c743b7aba6a9912f6074f9e014f3361528e8ea6a08495a94', snapshotText: targetRaw, idempotencyKey: 'native2-adopt-test-1' };
    // Independently frozen proposal03/02 prior-pin tuple; no public requestHash calculation.
    expect(h.attempt.expectedPriorPinDigest).toBe(hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', scope.tenantId, scope.workspaceId,
      documentId, 'pinned', NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle.selected.map(r => [r.schemaId, r.version, r.digest])])));
    expect(JSON.parse(h.attempt.bodyText)).toEqual(body);
    expect(h.attempt.bodyText).toBe(JSON.stringify(body));
    expect(await h.writer.recoverAttempt(h.attempt)).toEqual(h.attempt); expect(Object.isFrozen(h.attempt.choice.record.definition)).toBe(true);
    expect(JSON.stringify(NATIVE_NOTE_FIXTURES)).toBe(before); expect(h.calls).toHaveLength(1);
  });
  it.each(['text', 'nested', 'structure', 'sparse', 'typing'] as const)('full independently authored %s source keeps every old native value while target appends one exact field', async name => {
    const h = harness(), choice = await h.writer.resolveExact(chosen), source = NATIVE_NOTE_EXPECTED_VARIANTS[name];
    const index = name === 'structure' ? 5 : 4;
    const attempt = await h.writer.freeze(base, JSON.stringify(source), choice, [index, 0], 'variant-adopt-key', 2);
    const expectedDocument = { ...source.document, content: source.document.content.map((node, i) => i !== index ? node : {
      ...node, content: node.content.map((child, j) => {
        if (j !== 0) return child;
        if (!('attributes' in child) || !child.attributes || !('fields' in child.attributes)) throw new Error('Independent explicit source dataset required');
        return { ...child, attributes: { ...child.attributes,
          fields: [{ name: 'State', kind: 'choice', options: ['진행', '계획'] }, { name: 'Done', kind: 'boolean' }, { name: 'Count', kind: 'number' }, { name: 'Label', kind: 'text', label: 'Café' }, { name: 'Owner', kind: 'text', label: '담당자' }] } };
      }) }) };
    expect(JSON.parse(attempt.snapshotText)).toEqual({ ...source, document: expectedDocument, schemaBundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle });
    expect(attempt.sourceSnapshotText).toBe(JSON.stringify(source)); expect(h.calls.filter(c => c.init?.method === 'PUT')).toHaveLength(0);
  });
  it.each(['wrong-digest', 'missing-parent', 'duplicate', 'foreign', 'extra-record-field', 'wrong-canonical', 'wrong-definition'] as const)('invalid complete version %s has no PUT and retains full A/B source', async kind => {
    const v = versionReply(), before = JSON.stringify(NATIVE_NOTE_FIXTURES);
    if (kind === 'wrong-digest') v.record = { ...v.record, digest: '0'.repeat(64) };
    if (kind === 'missing-parent') v.dependencies.shift();
    if (kind === 'duplicate') v.dependencies.push(v.dependencies[0]);
    if (kind === 'foreign') v.record = { ...v.record, definition: { ...v.record.definition, scope: { ...v.record.definition.scope, workspaceId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' } } };
    if (kind === 'wrong-canonical') v.record = { ...v.record, canonicalText: '{}' };
    if (kind === 'wrong-definition') v.record = { ...v.record, definition: { ...v.record.definition, version: 9 } };
    const h = harness([Response.json(kind === 'extra-record-field' ? { ...v, record: { ...v.record, rights: 'writer' } } : v)]);
    await expect(h.writer.resolveExact(chosen)).rejects.toBeDefined(); expect(h.calls).toHaveLength(1); expect(h.calls[0].init?.method).toBe('GET'); expect(JSON.stringify(NATIVE_NOTE_FIXTURES)).toBe(before);
  });
  it('old unresolved recovery, a foreign choice or wrong source dataset binding cannot freeze a new request', async () => {
    const h = harness(), choice = await h.writer.resolveExact(chosen); h.blockPrior();
    await expect(h.writer.freeze(base, sourceRaw, choice, [4, 0], 'blocked-key', 1)).rejects.toMatchObject({ code: 'native2_prior_recovery_unresolved' });
    const other = harness(); await expect(other.writer.freeze(base, sourceRaw, choice, [4, 0], 'foreign-choice', 1)).rejects.toMatchObject({ code: 'native2_adopt_choice_not_current' });
    const own = await other.writer.resolveExact(chosen);
    await expect(other.writer.freeze(base, sourceRaw, own, [4, 1], 'bad-slot', 1)).rejects.toBeDefined(); expect(h.calls.filter(c => c.init?.method === 'PUT')).toHaveLength(0);
  });
  it('unprotected and mutated action/body/key/source-base attempts never send', async () => {
    const h = await fixed(), before = h.calls.length;
    for (const value of [{ ...h.attempt, schemaAction: 'preserve' }, { ...h.attempt, bodyText: h.attempt.bodyText.replace('adopt', 'preserve') },
      { ...h.attempt, idempotencyKey: 'changed-key' }, { ...h.attempt, snapshotText: sourceRaw }, { ...h.attempt, datasetPath: [4, 1] }]) {
      await expect(h.writer.recoverAttempt(value)).rejects.toMatchObject({ code: 'invalid_native2_adoption' });
    }
    const blank = harness(), c = await blank.writer.resolveExact(chosen), unfixed = await blank.writer.freeze(base, sourceRaw, c, [4, 0], 'unprotected', 1);
    await expect(blank.writer.send(unfixed)).rejects.toMatchObject({ code: 'native2_adopt_attempt_not_durable' }); expect(h.calls).toHaveLength(before); expect(blank.calls).toHaveLength(1);
  });
  it('direct action-correlated receipt needs matching whole target current head/raw/full bundle; source input is never installed', async () => {
    const h = await fixed(harness([Response.json(versionReply()), Response.json(receipt), Response.json({ document: receipt.document, snapshotText: targetRaw }), Response.json({
      status: 'pinned', documentId, documentRevision: 2, snapshotHash: hash(targetRaw), nativeFormat: { format: 'barocss-note', version: 2 }, bundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle })]));
    const direct = await h.writer.send(h.attempt); const proof = await h.writer.confirm(h.attempt, direct);
    expect(proof.status).toBe('adoption-fixed-confirmed'); if (proof.status !== 'adoption-fixed-confirmed') throw new Error('Exact current target required');
    expect(proof.read.snapshotText).toBe(targetRaw); expect(proof.read.file).toEqual({ fileVersion: 2, document: NATIVE_NOTE_FIXTURES.TARGET_A2.document,
      schemaBundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle, savedAt: NATIVE_NOTE_FIXTURES.TARGET_A2.savedAt });
    expect(h.attempt.sourceSnapshotText).toBe(sourceRaw); expect(h.calls.filter(c => c.init?.method === 'PUT')).toHaveLength(1); expect(h.calls.find(c => c.init?.method === 'PUT')?.init?.body).toBe(h.attempt.bodyText);
  });
  it('after total response loss receipt lookup is GET-only/unconfirmed; explicit same-key whole-body retry is distinct', async () => {
    const h = await fixed(harness([Response.json(versionReply())])); await expect(h.writer.send(h.attempt)).rejects.toMatchObject({ code: 'network_error' });
    const replies = [Response.json(versionReply()), Response.json(receipt), Response.json(receipt)];
    const retry = await fixed(harness(replies)), lookup = await retry.writer.checkReceipt(retry.attempt);
    expect(await retry.writer.confirm(retry.attempt, lookup)).toEqual({ status: 'unconfirmed', reason: 'adoption_receipt_not_correlated' });
    expect(retry.calls.every(c => c.init?.method === 'GET')).toBe(true);
    await retry.writer.send(retry.attempt); expect(retry.calls.at(-1)?.init?.body).toBe(h.attempt.bodyText); expect(retry.calls.filter(c => c.init?.method === 'PUT')).toHaveLength(1);
  });
  it.each([401, 403, 404, 409, 413, 422, 503])('current HTTP %s refuses without inventing correlation or changing fixed bytes', async status => {
    const h = await fixed(harness([Response.json(versionReply()), Response.json({ status: 'controlled_rejection' }, { status })]));
    const before = JSON.stringify(h.attempt); await expect(h.writer.send(h.attempt)).rejects.toMatchObject({ status, code: 'controlled_rejection' }); expect(JSON.stringify(h.attempt)).toBe(before);
  });
  it('owner retirement rejects fixed request before any effect and refuses an already selected exact tuple', async () => {
    const h = await fixed(); h.retire(); await expect(h.writer.send(h.attempt)).rejects.toMatchObject({ code: 'stale_native2_writable_context' }); expect(h.calls).toHaveLength(1);
    const own = harness(), c = await own.writer.resolveExact(chosen), current = JSON.stringify(NATIVE_NOTE_FIXTURES.TARGET_A2);
    await expect(own.writer.freeze({ document: { ...base.document, revision: 2, snapshotHash: hash(current) }, snapshotText: current }, current, c, [4, 0], 'selected-key', 1)).rejects.toMatchObject({ code: 'native2_already_selected' });
  });
});
describe('adoption confirmation failure and held owner boundaries', () => {
  it.each(['operation', 'key', 'hash', 'foreign-head', 'source-raw', 'extra-rights'] as const)('malformed %s receipt retains complete immutable source/target attempt', async kind => {
    const bad = kind === 'operation' ? { ...receipt, operation: 'create' } : kind === 'key' ? { ...receipt, idempotencyKey: 'foreign' } :
      kind === 'hash' ? { ...receipt, requestHash: 'opaque-not-a-digest' } : kind === 'foreign-head' ? { ...receipt, document: { ...receipt.document, workspaceId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' } } :
      kind === 'source-raw' ? { ...receipt, snapshotText: sourceRaw } : { ...receipt, rights: 'writer' };
    const h = await fixed(harness([Response.json(versionReply()), Response.json(bad)])), before = JSON.stringify(h.attempt);
    await expect(h.writer.send(h.attempt)).rejects.toBeDefined(); expect(JSON.stringify(h.attempt)).toBe(before); expect(h.calls.filter(c => c.init?.method === 'PUT')).toHaveLength(1);
  });
  it('known opaque correlation mismatch refuses and a historical receipt cannot confirm a different current target head', async () => {
    const h = await fixed(harness([Response.json(versionReply()), Response.json(receipt)])), lookup = await h.writer.checkReceipt(h.attempt);
    await expect(h.writer.confirm(h.attempt, lookup, 'e'.repeat(64))).rejects.toMatchObject({ code: 'native2_adopt_receipt_conflict' }); expect(h.calls).toHaveLength(2);
    const currentHead = { ...receipt.document, revision: 3 };
    const old = await fixed(harness([Response.json(versionReply()), Response.json(receipt), Response.json({ document: currentHead, snapshotText: targetRaw }),
      Response.json({ status: 'pinned', documentId, documentRevision: 3, snapshotHash: hash(targetRaw), nativeFormat: { format: 'barocss-note', version: 2 }, bundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle })]));
    const direct = await old.writer.send(old.attempt), before = JSON.stringify(old.attempt);
    expect(await old.writer.confirm(old.attempt, direct)).toEqual({ status: 'unconfirmed', reason: 'current_target_head_differs' }); expect(JSON.stringify(old.attempt)).toBe(before);
  });
  it('retirement at held exact-version response body rejects choice before any write or source effect', async () => {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(r => { enter = r; }), held = new Promise<void>(r => { release = r; });
    const response = Response.json(versionReply()), originalText = response.text.bind(response);
    response.text = async () => { enter(); await held; return originalText(); };
    const h = harness([response]), pending = h.writer.resolveExact(chosen); await entered; h.retire(); release();
    await expect(pending).rejects.toMatchObject({ code: 'stale_native2_writable_context' }); expect(h.calls).toHaveLength(1); expect(h.calls[0].init?.method).toBe('GET');
  });
});
