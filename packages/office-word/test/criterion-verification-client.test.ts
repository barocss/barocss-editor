import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createBusinessPair } from '../src/business-pair';
import { captureCriterionContext, captureExecutableCriterion, CRITERION_EVALUATOR, evaluateRenderedCriterion, getCriterionSpecimen, listCriterionSpecimens } from '../src/criterion-confirmation';
import { wordFileText } from '../src/word-file';
import { criterionHash } from '../../../apps/word/src/criterion-confirmation-client';
import { createVerificationClient, currentVerification, verificationRequest, type VerificationBasis, type VerificationReceipt } from '../../../apps/word/src/criterion-verification-client';

const tenantId = '11111111-1111-4111-8111-111111111111', documentId = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333', confirmationId = '44444444-4444-4444-8444-444444444444';
afterEach(() => { vi.unstubAllGlobals(); });
const response = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
const transport = (v: unknown) => vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(response(v));
async function fixture() {
  vi.stubGlobal('crypto', webcrypto);
  const native = { stype: 'document', metadata: { approved: true, verification: 'passed' }, content: [{ stype: 'surface', content: [
    { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'r' } }, { stype: 'inline-text', text: 'Keep the original. Fictional active-button contrast: minimum 4.5:1.' }] },
    { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'd' } }, { stype: 'inline-text', text: 'A fictional decision, not organization policy.' }] }
  ] }] };
  const pair = createBusinessPair(native, 'r', 'd'), snapshotText = wordFileText({ ...native, metadata: { ...native.metadata, wonfficeBusinessPair: pair } }, '');
  const context = captureCriterionContext(snapshotText);
  const basis: VerificationBasis = { schemaVersion: 1, documentRevision: 5, snapshotText, snapshotHash: await criterionHash(snapshotText), context,
    authorityEpoch: 'event:membership-9', actorIdentityId: actor, confirmationId, executable: captureExecutableCriterion(context), specimens: [...listCriterionSpecimens()], evaluator: CRITERION_EVALUATOR };
  const specimen = getCriterionSpecimen('dark')!, request = verificationRequest(basis, specimen, 'fixed-run');
  const requestHash = await criterionHash(JSON.stringify(['criterion-verification-v1', tenantId, documentId, actor, request]));
  const rendered = { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)', opacity: '1', backgroundImage: 'none', ancestorOpacities: ['1', '1'], tagName: 'BUTTON', disabled: false, visibility: 'visible', display: 'inline-block' };
  if (basis.executable.status !== 'executable') throw new Error('test_fixture');
  const startedAt = '2026-10-03T03:00:00.000Z', endedAt = '2026-10-03T03:00:01.000Z';
  const runId = '55555555-5555-4555-8555-555555555555';
  const output = { schemaVersion: 1, executionId: runId, tenantId, documentId, requestHash, request, confirmationId, documentRevision: 5,
    snapshotHash: basis.snapshotHash, context, authorityEpoch: basis.authorityEpoch, requesterIdentityId: actor,
    executor: { id: 'local-playwright-chromium', version: 1, browserVersion: 'declared-mock-browser' }, startedAt, endedAt,
    specimen: { ...specimen, sourceHash: await criterionHash(specimen.sourceText) }, evaluator: CRITERION_EVALUATOR, criterion: basis.executable.criterion,
    rendered, evaluation: evaluateRenderedCriterion(basis.executable.criterion, rendered), outcome: 'passed' };
  const outputText = JSON.stringify(output);
  const receipt: VerificationReceipt = { schemaVersion: 1, runId, tenantId, documentId, requesterIdentityId: actor, confirmationId,
    documentRevision: 5, snapshotHash: basis.snapshotHash, context, authorityEpoch: basis.authorityEpoch, idempotencyKey: request.idempotencyKey, requestHash,
    specimen, evaluator: CRITERION_EVALUATOR, outcome: 'passed', startedAt, endedAt, outputText, outputHash: await criterionHash(outputText) };
  return { basis, request, output, receipt };
}
it('accepts complete private evidence and PostgreSQL JSONB property order without discarding any native context or output bytes', async () => {
  const { basis, receipt } = await fixture();
  expect(await createVerificationClient(transport(basis), tenantId, documentId).context()).toEqual(basis);
  const reordered = { ...receipt, context: { relation: receipt.context.relation, decision: receipt.context.decision, requirement: receipt.context.requirement, schemaVersion: 1 as const } };
  const records = await createVerificationClient(transport({ runs: [reordered] }), tenantId, documentId).list();
  expect(records).toEqual([reordered]); expect(currentVerification(basis, records[0], receipt.specimen)).toBe(true);
  expect(currentVerification({ ...basis, confirmationId: documentId }, records[0], receipt.specimen)).toBe(false);
  expect(currentVerification({ ...basis, documentRevision: 6 }, records[0], receipt.specimen)).toBe(false);
  expect(currentVerification(basis, records[0], getCriterionSpecimen('low')!)).toBe(false);
});
it('refuses internally altered provenance/inputs/results even when an attacker recomputes the output digest', async () => {
  const { receipt, output } = await fixture();
  const alterations = [
    { executionId: output.executionId, outcome: output.outcome }, { ...output, executor: null }, { ...output, requesterIdentityId: documentId },
    { ...output, confirmationId: documentId }, { ...output, endedAt: output.startedAt }, { ...output, context: {} },
    { ...output, specimen: { ...output.specimen, sourceHash: '0'.repeat(64) } },
    { ...output, request: { ...output.request, idempotencyKey: 'other' } },
    { ...output, evaluator: { ...output.evaluator, version: 2 } },
    { ...output, evaluation: { ...output.evaluation, ratio: 1000 } },
    { ...output, rendered: { ...output.rendered, color: 'rgb(255, 255, 255)' } },
    { ...output, rendered: { ...output.rendered, opacity: '.5' } }
  ];
  for (const altered of alterations) {
    const outputText = JSON.stringify(altered), corrupted = { ...receipt, outputText, outputHash: await criterionHash(outputText) };
    await expect(createVerificationClient(transport({ runs: [corrupted] }), tenantId, documentId).list()).rejects.toThrow('invalid_verification_response');
  }
  await expect(createVerificationClient(transport({ runs: [{ ...receipt, context: {} }] }), tenantId, documentId).list()).rejects.toThrow('invalid_verification_response');
});
it('lost acknowledgement preserves the frozen exact request and server execution identity; forged extra flags never send', async () => {
  const { basis, request, receipt } = await fixture();
  const fetcher = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockRejectedValueOnce(new TypeError('connection lost')).mockResolvedValue(response(receipt));
  const client = createVerificationClient(fetcher, tenantId, documentId), before = structuredClone(request);
  await expect(client.run(request, basis.actorIdentityId)).rejects.toThrow('verification_network_unknown');
  expect(await client.run(request, basis.actorIdentityId)).toEqual(receipt);
  expect(fetcher.mock.calls.map(call => call[1]!.body)).toEqual([JSON.stringify(before), JSON.stringify(before)]);
  await expect(client.run({ ...request, passed: true } as typeof request, basis.actorIdentityId)).rejects.toThrow('invalid_verification_response');
  expect(fetcher).toHaveBeenCalledTimes(2); expect(request).toEqual(before);
});
it('a durable unavailable-executor error is explicit and cannot acquire forged rendered evidence', async () => {
  const { receipt, output } = await fixture();
  const error = { ...output, executor: null, rendered: null, evaluation: null, outcome: 'error', error: 'executor_unavailable' };
  const outputText = JSON.stringify(error), record = { ...receipt, outcome: 'error', outputText, outputHash: await criterionHash(outputText) };
  expect(await createVerificationClient(transport({ runs: [record] }), tenantId, documentId).list()).toEqual([record]);
  const forged = JSON.stringify({ ...error, executor: output.executor });
  await expect(createVerificationClient(transport({ runs: [{ ...record, outputText: forged, outputHash: await criterionHash(forged) }] }), tenantId, documentId).list()).rejects.toThrow('invalid_verification_response');
});
