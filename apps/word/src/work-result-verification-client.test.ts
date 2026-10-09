import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { captureCriterionContext, compareCriterionContext } from '../../../packages/office-word/src/criterion-confirmation';
import { evaluateNativePreservation, NATIVE_PRESERVATION_EVALUATOR, NATIVE_PRESERVATION_SENTENCE } from '../../office-service/src/native-preservation-evaluator';
import { criterionHash, type CriterionReceipt } from './criterion-confirmation-client';
import { createWordWorkClient, currentWordWorkRun, readCurrentWorkAuthority, WORD_PRESERVATION_EVALUATOR,
  wordWorkRequest, type WordWorkOption, type WordWorkReceipt } from './work-result-verification-client';

const ids = { tenant: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspace: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  document: 'cccccccc-cccc-cccc-cccc-cccccccccccc', actor: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  performer: '99999999-9999-4999-8999-999999999999',
  project: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', result: '11111111-1111-4111-8111-111111111111',
  work: '22222222-2222-4222-8222-222222222222', attempt: '33333333-3333-4333-8333-333333333333',
  pin: '44444444-4444-4444-8444-444444444444', comment: '55555555-5555-4555-8555-555555555555',
  confirmation: '66666666-6666-4666-8666-666666666666', run: '77777777-7777-4777-8777-777777777777' };
const original = readFileSync(new URL('../../office-service/test/fixtures/criterion-confirmation-word.json', import.meta.url), 'utf8')
  .replaceAll('Keep original fictional content.', NATIVE_PRESERVATION_SENTENCE);
const next = original.replace('"text": "Store exact rich reference."', '"text": "Changed protected decision."');

async function fixture() {
  const inputHash = await criterionHash(original), outputHash = await criterionHash(next);
  const context = captureCriterionContext(original);
  const confirmation: CriterionReceipt = { schemaVersion: 1, confirmationId: ids.confirmation,
    tenantId: ids.tenant, documentId: ids.document, actorIdentityId: ids.actor,
    confirmedAt: '2026-10-09T00:00:00.000Z', documentRevision: 2, snapshotHash: inputHash,
    context, authorityEpoch: 'editor:1:44', idempotencyKey: 'confirm-1', requestHash: 'a'.repeat(64),
    verification: 'not-run', scope: 'writer-self-confirmation' };
  const option: WordWorkOption = { projectId: ids.project, projectTitle: 'Project', workId: ids.work,
    resultId: ids.result, resultName: 'Word result', requesterIdentityId: ids.actor,
    attemptActorIdentityId: ids.performer, attemptId: ids.attempt,
    phase: 'applied', reason: null, proposal: 'Proposed edit', pinId: ids.pin, referenceText: original,
    inputRevision: 2, inputHash, inputText: original, outputRevision: 3, outputHash };
  const pin = { id: ids.pin, document: { product: 'word', id: ids.document }, revision: 2, text: original, title: 'Pinned Word' };
  const record = { id: ids.project, title: 'Project', goal: '', archived: false,
    results: [{ id: ids.result, name: 'Word result', document: { product: 'word', id: ids.document }, inputs: [pin], request: ids.work }],
    comments: [{ id: ids.comment, resultId: ids.result, target: { kind: 'word-comment', id: 'word-anchor', quote: 'Selected work' },
      pin, actor: { kind: 'human', id: ids.actor, label: 'Writer' }, body: 'Change elsewhere',
      createdAt: '2026-10-09T00:00:00.000Z', workId: ids.work, status: 'open' }],
    works: [{ id: ids.work, commentId: ids.comment, request: 'Change elsewhere', state: 'unconnected',
      inputs: [pin], outputs: [ids.result], reason: '', createdAt: '2026-10-09T00:00:00.000Z' }],
    activities: [], drafts: {} };
  const execution = { id: ids.attempt, tenantId: ids.tenant, workspaceId: ids.workspace,
    projectId: ids.project, workId: ids.work, resultId: ids.result, documentId: ids.document, actorId: ids.performer,
    phase: 'applied', reason: null, input: { request: 'Change elsewhere', revision: 2, snapshotHash: inputHash,
      snapshotText: original, target: { nodeId: 'word-anchor', text: 'Selected work', from: 0, to: 13 },
      inputs: [{ id: ids.pin, documentId: ids.document, revision: 2, snapshotHash: inputHash, snapshotText: original }] },
    pendingOutputs: [], proposal: { replacement: 'Proposed edit', reason: '', assumptions: [] },
    expectedSnapshotText: next, expectedSnapshotHash: outputHash, appliedRevision: 3 };
  return { option, confirmation, record, execution };
}

it('keeps the browser evaluator byte contract equal to the registered server evaluator', () => {
  expect(WORD_PRESERVATION_EVALUATOR).toStrictEqual(NATIVE_PRESERVATION_EVALUATOR);
});

it('keeps changed protected criterion refusal distinct from access denial and unknown transport', async () => {
  expect(() => captureCriterionContext(next)).toThrow();
  const hash = await criterionHash(next);
  const reply = (status: number, reason: string) => async () => new Response(JSON.stringify({ status: reason }), { status });
  expect(await readCurrentWorkAuthority(reply(409, 'criterion_unavailable') as typeof fetch,
    ids.tenant, ids.document, 3, hash)).toStrictEqual({ kind: 'unavailable', actorIdentityId: null, authorityEpoch: null });
  await expect(readCurrentWorkAuthority(reply(403, 'forbidden') as typeof fetch,
    ids.tenant, ids.document, 3, hash)).rejects.toMatchObject({ status: 403, code: 'forbidden' });
  await expect(readCurrentWorkAuthority(reply(409, 'mode_conflict') as typeof fetch,
    ids.tenant, ids.document, 3, hash)).rejects.toMatchObject({ status: 409, code: 'mode_conflict' });
  await expect(readCurrentWorkAuthority((async () => { throw new Error('offline'); }) as typeof fetch,
    ids.tenant, ids.document, 3, hash)).rejects.toMatchObject({ status: null, code: 'confirmation_network_unknown' });
  const basis = { schemaVersion: 1, documentRevision: 2, snapshotHash: await criterionHash(original),
    snapshotText: original, context: captureCriterionContext(original), actorIdentityId: ids.actor,
    authorityEpoch: 'editor:1:44' };
  const current = async () => new Response(JSON.stringify(basis), { status: 200 });
  expect(await readCurrentWorkAuthority(current as typeof fetch, ids.tenant, ids.document,
    basis.documentRevision, basis.snapshotHash)).toStrictEqual({ kind: 'available', actorIdentityId: ids.actor,
    authorityEpoch: 'editor:1:44' });
  await expect(readCurrentWorkAuthority(current as typeof fetch, ids.tenant, ids.document, 3, hash))
    .rejects.toMatchObject({ status: 409, code: 'work_source_changed' });
});

it('lets current requester B verify performer A’s applied Word attempt using B’s input confirmation', async () => {
  const f = await fixture(), calls: string[] = [];
  expect(next).not.toBe(original);
  expect(compareCriterionContext(original, f.confirmation.context)).toBe(true);
  const fetcher = async (url: string | URL | Request) => {
    const path = String(url); calls.push(path);
    const body = path.endsWith('/criterion-confirmations') ? { confirmations: [f.confirmation] } :
      path.includes('/projects?') ? { projects: [{ tenantId: ids.tenant, workspaceId: ids.workspace,
        actor: { kind: 'human', id: ids.actor, label: 'Member' }, project: { revision: 1, record: f.record } }], nextCursor: null } :
      path.endsWith('/execution') ? { execution: f.execution } : { runs: [] };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const client = createWordWorkClient(fetcher as typeof fetch, ids.tenant, ids.workspace, ids.document);
  const view = await client.load();
  expect(view.options).toStrictEqual([f.option]);
  expect(view.options[0].attemptActorIdentityId).toBe(ids.performer);
  expect(view.options[0].requesterIdentityId).toBe(ids.actor);
  expect(view.confirmations).toStrictEqual([f.confirmation]);
  expect(view.runs).toStrictEqual([]);
  expect(calls).toHaveLength(4);
  expect(wordWorkRequest(view.options[0], view.confirmations[0], 'fixed-work-1')).toStrictEqual({
    schemaVersion: 1, projectId: ids.project, workId: ids.work, attemptId: ids.attempt, resultId: ids.result,
    confirmationId: ids.confirmation, expectedOutputRevision: 3, expectedOutputHash: f.option.outputHash,
    authorityEpoch: 'editor:1:44', idempotencyKey: 'fixed-work-1', evaluator: WORD_PRESERVATION_EVALUATOR });
  f.execution.actorId = ids.actor;
  f.option.attemptActorIdentityId = ids.actor;
  expect((await client.load()).options).toStrictEqual([f.option]);
});

it('refuses a forged output hash before offering an applied result', async () => {
  const f = await fixture(); f.execution.expectedSnapshotHash = 'f'.repeat(64);
  const fetcher = async (url: string | URL | Request) => new Response(JSON.stringify(
    String(url).endsWith('/criterion-confirmations') ? { confirmations: [f.confirmation] } :
      String(url).includes('/projects?') ? { projects: [{ tenantId: ids.tenant, workspaceId: ids.workspace,
        actor: { kind: 'human', id: ids.actor, label: 'Member' }, project: { revision: 1, record: f.record } }], nextCursor: null } :
        { execution: f.execution }), { status: 200 });
  await expect(createWordWorkClient(fetcher as typeof fetch, ids.tenant, ids.workspace, ids.document).load())
    .rejects.toThrow('invalid_work_execution');
});

it('accepts only a stored native receipt bound to the frozen attempt and full output hash', async () => {
  const f = await fixture(), request = wordWorkRequest(f.option, f.confirmation, 'fixed-work-2');
  const requestHash = await criterionHash(JSON.stringify(['native-work-verification-v1', ids.tenant, ids.document, ids.actor, request]));
  const specimen = { kind: 'native-word-work-result' as const, projectId: ids.project, workId: ids.work,
    attemptId: ids.attempt, resultId: ids.result, inputRevision: 2, inputHash: f.option.inputHash!,
    outputRevision: 3, outputHash: f.option.outputHash! };
  const startedAt = '2026-10-09T00:01:00.000Z', endedAt = '2026-10-09T00:01:00.001Z';
  const outputText = JSON.stringify({ schemaVersion: 1, executionId: ids.run, tenantId: ids.tenant,
    documentId: ids.document, requestHash, request, confirmationId: ids.confirmation,
    confirmationSnapshotHash: f.option.inputHash, contextHash: await criterionHash(JSON.stringify(f.confirmation.context)),
    requesterIdentityId: ids.actor, executor: { id: 'registered-local-native-evaluator', version: 1 },
    startedAt, endedAt, specimen, evaluator: WORD_PRESERVATION_EVALUATOR,
    comparison: { status: 'unsupported', reason: 'example' }, outcome: 'unsupported' });
  const receipt: WordWorkReceipt = { schemaVersion: 1, runId: ids.run, tenantId: ids.tenant,
    documentId: ids.document, requesterIdentityId: ids.actor, confirmationId: ids.confirmation,
    documentRevision: 3, snapshotHash: f.option.outputHash!, context: f.confirmation.context,
    authorityEpoch: f.confirmation.authorityEpoch, idempotencyKey: request.idempotencyKey,
    requestHash, specimen, evaluator: WORD_PRESERVATION_EVALUATOR, outcome: 'unsupported',
    startedAt, endedAt, outputText, outputHash: await criterionHash(outputText) };
  const fetcher = async () => new Response(JSON.stringify(receipt), { status: 200 });
  const client = createWordWorkClient(fetcher as typeof fetch, ids.tenant, ids.workspace, ids.document);
  expect(await client.run(request, ids.actor)).toStrictEqual(receipt);
  expect(currentWordWorkRun(f.option, f.confirmation, receipt, 3, f.option.outputHash!, ids.actor, f.confirmation.authorityEpoch)).toBe(true);
  expect(currentWordWorkRun(f.option, f.confirmation, receipt, 4, f.option.outputHash!, ids.actor, f.confirmation.authorityEpoch)).toBe(false);
  expect(currentWordWorkRun(f.option, f.confirmation, receipt, 3, f.option.outputHash!, ids.actor, 'editor:2:45')).toBe(false);
  const tamperedFetch = (async () => new Response(JSON.stringify({ ...receipt, outcome: 'passed' }))) as typeof fetch;
  await expect(createWordWorkClient(tamperedFetch,
    ids.tenant, ids.workspace, ids.document).run(request, ids.actor)).rejects.toThrow('invalid_work_receipt');
  const withComparison = async (comparison: unknown, outcome: WordWorkReceipt['outcome'], error?: string): Promise<WordWorkReceipt> => {
    const output = { ...JSON.parse(outputText), comparison, outcome, ...(error === undefined ? {} : { error }) };
    const text = JSON.stringify(output);
    return { ...receipt, outcome, outputText: text, outputHash: await criterionHash(text) };
  };
  const runReceipt = async (one: WordWorkReceipt) => createWordWorkClient(
    (async () => new Response(JSON.stringify(one))) as typeof fetch, ids.tenant, ids.workspace, ids.document
  ).run(request, ids.actor);
  const passed = evaluateNativePreservation(f.confirmation.context, original, original);
  const failed = evaluateNativePreservation(f.confirmation.context, original, next);
  expect(passed.status).toBe('passed'); expect(failed.status).toBe('failed');
  expect(await runReceipt(await withComparison(passed, 'passed'))).toMatchObject({ outcome: 'passed' });
  expect(await runReceipt(await withComparison(failed, 'failed'))).toMatchObject({ outcome: 'failed' });
  expect(await runReceipt(await withComparison(null, 'error', 'evaluator_failed'))).toMatchObject({ outcome: 'error' });
  for (const one of [
    await withComparison({ status: 'passed' }, 'passed'),
    await withComparison({ ...passed, referenceParagraphHash: '0'.repeat(64) }, 'passed'),
    await withComparison({ ...failed, extra: true }, 'failed'),
    await withComparison({ status: 'unsupported', reason: 7 }, 'unsupported'),
    await withComparison({ ...passed, status: 'failed' }, 'failed')
  ]) await expect(runReceipt(one)).rejects.toThrow('invalid_work_receipt');
});
