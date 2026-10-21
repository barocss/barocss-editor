import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { captureCriterionContext, captureExecutableCriterion, CRITERION_EVALUATOR,
  evaluateRenderedCriterion, getCriterionSpecimen, listCriterionSpecimens } from '../../../packages/office-word/src/criterion-confirmation';
import { criterionHash } from './criterion-confirmation-client';
import { createVerificationClient, verificationRequest, type VerificationBasis, type VerificationReceipt } from './criterion-verification-client';
import { createWordWorkClient, WORD_PRESERVATION_EVALUATOR, type WordWorkReceipt, type WordWorkRequest } from './work-result-verification-client';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', documentId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorId = 'cccccccc-cccc-cccc-cccc-cccccccccccc', confirmationId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const legacyRun = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', nativeRun = '11111111-1111-4111-8111-111111111111';
const startedAt = '2026-10-09T00:00:00.000Z', endedAt = '2026-10-09T00:00:00.001Z';

// Controlled stored-output schemas. No browser execution, membership grant or
// real applied work is claimed by these decoder fixtures.
async function receipts() {
  const snapshotText = readFileSync(new URL('../../office-service/test/fixtures/criterion-verification-word.json', import.meta.url), 'utf8');
  const context = captureCriterionContext(snapshotText), executable = captureExecutableCriterion(context);
  if (executable.status !== 'executable') throw new Error('Executable legacy fixture required');
  const snapshotHash = await criterionHash(snapshotText);
  const basis: VerificationBasis = { schemaVersion: 1, documentRevision: 2, snapshotHash, snapshotText, context,
    actorIdentityId: actorId, authorityEpoch: 'editor:1:44', confirmationId, executable,
    specimens: [...listCriterionSpecimens()], evaluator: CRITERION_EVALUATOR };
  const specimen = getCriterionSpecimen('dark')!;
  const request = verificationRequest(basis, specimen, 'legacy-fixed-1');
  const requestHash = await criterionHash(JSON.stringify(['criterion-verification-v1', tenantId, documentId, actorId, request]));
  const rendered = { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)', opacity: '1',
    backgroundImage: 'none', ancestorOpacities: ['1', '1'], tagName: 'BUTTON', disabled: false,
    visibility: 'visible', display: 'inline-block' };
  const evaluation = evaluateRenderedCriterion(executable.criterion, rendered);
  expect(evaluation.status).toBe('passed');
  const outputText = JSON.stringify({ schemaVersion: 1, executionId: legacyRun, tenantId, documentId,
    requestHash, request, confirmationId, documentRevision: 2, snapshotHash, context,
    authorityEpoch: basis.authorityEpoch, requesterIdentityId: actorId,
    executor: { id: 'local-playwright-chromium', version: 1, browserVersion: 'controlled-decoder-fixture' },
    startedAt, endedAt, specimen: { ...specimen, sourceHash: await criterionHash(specimen.sourceText) },
    evaluator: CRITERION_EVALUATOR, criterion: executable.criterion, rendered, evaluation, outcome: 'passed' });
  const legacy: VerificationReceipt = { schemaVersion: 1, runId: legacyRun, tenantId, documentId,
    requesterIdentityId: actorId, confirmationId, documentRevision: 2, snapshotHash, context,
    authorityEpoch: basis.authorityEpoch, idempotencyKey: request.idempotencyKey, requestHash,
    specimen, evaluator: CRITERION_EVALUATOR, outcome: 'passed', startedAt, endedAt,
    outputText, outputHash: await criterionHash(outputText) };
  const nativeSpecimen = { kind: 'native-word-work-result' as const,
    projectId: '22222222-2222-4222-8222-222222222222', workId: '33333333-3333-4333-8333-333333333333',
    attemptId: '44444444-4444-4444-8444-444444444444', resultId: '55555555-5555-4555-8555-555555555555',
    inputRevision: 2, inputHash: snapshotHash, outputRevision: 3, outputHash: 'f'.repeat(64) };
  const nativeRequest = { schemaVersion: 1, projectId: nativeSpecimen.projectId, workId: nativeSpecimen.workId,
    attemptId: nativeSpecimen.attemptId, resultId: nativeSpecimen.resultId, confirmationId,
    expectedOutputRevision: 3, expectedOutputHash: nativeSpecimen.outputHash,
    authorityEpoch: basis.authorityEpoch, idempotencyKey: 'native-fixed-1', evaluator: WORD_PRESERVATION_EVALUATOR };
  const nativeRequestHash = await criterionHash(JSON.stringify(['native-work-verification-v1', tenantId, documentId, actorId, nativeRequest]));
  const nativeOutput = JSON.stringify({ schemaVersion: 1, executionId: nativeRun, tenantId, documentId,
    requestHash: nativeRequestHash, request: nativeRequest, confirmationId, confirmationSnapshotHash: snapshotHash,
    contextHash: await criterionHash(JSON.stringify(context)), requesterIdentityId: actorId,
    executor: { id: 'registered-local-native-evaluator', version: 1 }, startedAt, endedAt,
    specimen: nativeSpecimen, evaluator: WORD_PRESERVATION_EVALUATOR,
    comparison: { status: 'unsupported', reason: 'controlled-history-decoder-fixture' }, outcome: 'unsupported' });
  const native: WordWorkReceipt = { ...legacy, runId: nativeRun, documentRevision: 3,
    snapshotHash: nativeSpecimen.outputHash, idempotencyKey: nativeRequest.idempotencyKey,
    requestHash: nativeRequestHash, specimen: nativeSpecimen, evaluator: WORD_PRESERVATION_EVALUATOR,
    outcome: 'unsupported', outputText: nativeOutput, outputHash: await criterionHash(nativeOutput) };
  return { legacy, native, basis, request };
}

it('loads the unchanged legacy receipt alone and alongside a valid stored native result in either order', async () => {
  const { legacy, native } = await receipts();
  const nativeRequest = (JSON.parse(native.outputText) as { request: WordWorkRequest }).request;
  expect(await createWordWorkClient(async () => Response.json(native), tenantId, actorId, documentId)
    .run(nativeRequest, actorId)).toStrictEqual(native);
  for (const runs of [[legacy], [native, legacy], [legacy, native], [native]]) {
    const fetcher = vi.fn(async () => Response.json({ runs }));
    const result = await createVerificationClient(fetcher, tenantId, documentId).list();
    expect(result).toStrictEqual(runs.includes(legacy) ? [legacy] : []);
    expect(result[0]).not.toBe(legacy);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(`/api/v1/tenants/${tenantId}/documents/${documentId}/criterion-verifications`, undefined);
  }
});

it('keeps legacy confirmation, current context, actor and fixed execution request exact', async () => {
  const { legacy, native, basis, request } = await receipts();
  const fetcher = vi.fn(async (path: string | URL | Request, init?: RequestInit) => Response.json(
    String(path).endsWith('/context') ? basis : init?.method === 'POST' ? legacy : { runs: [native, legacy] }));
  const client = createVerificationClient(fetcher, tenantId, documentId);
  expect(await client.context()).toStrictEqual(basis);
  expect(await client.list()).toStrictEqual([legacy]);
  expect(await client.run(request, actorId)).toStrictEqual(legacy);
  const post = fetcher.mock.calls[2];
  expect(post[1]?.method).toBe('POST');
  expect(JSON.parse(String(post[1]?.body))).toStrictEqual(request);
});

it('rejects malformed, unknown and foreign sibling receipts instead of silently dropping them', async () => {
  const { legacy, native } = await receipts();
  const wrongComparison = JSON.stringify({ ...JSON.parse(native.outputText),
    comparison: { status: 'unsupported', reason: 7 } });
  const wrongRequest = JSON.stringify({ ...JSON.parse(native.outputText), request: {
    ...(JSON.parse(native.outputText) as { request: WordWorkRequest }).request, authorityEpoch: 'editor:2:45' } });
  const mutations = [
    null, {}, { ...native, specimen: null },
    { ...native, specimen: { ...native.specimen, kind: 'unknown-verification' } },
    { ...native, tenantId: actorId }, { ...native, documentId: actorId },
    { ...native, outputHash: '0'.repeat(64) },
    { ...native, evaluator: { ...native.evaluator, definition: 'always pass' } },
    { ...native, specimen: { ...native.specimen, outputRevision: 4 } },
    { ...native, outputText: '{malformed' }, { ...native, extra: true },
    { ...native, outputText: wrongComparison, outputHash: await criterionHash(wrongComparison) },
    { ...native, outputText: wrongRequest, outputHash: await criterionHash(wrongRequest) },
  ];
  for (const malformed of mutations) {
    const fetcher = async () => Response.json({ runs: [legacy, malformed] });
    await expect(createVerificationClient(fetcher, tenantId, documentId).list()).rejects.toThrow();
  }
});

it('retains strict legacy validation and current HTTP authorization failure', async () => {
  const { legacy, native } = await receipts();
  for (const malformed of [{ ...legacy, outputHash: '0'.repeat(64) }, { ...legacy, tenantId: actorId },
    { ...legacy, specimen: { ...legacy.specimen, sourceText: '<button>forged</button>' } }]) {
    const fetcher = async () => Response.json({ runs: [native, malformed] });
    await expect(createVerificationClient(fetcher, tenantId, documentId).list()).rejects.toThrow();
  }
  const forbidden = async () => Response.json({ status: 'forbidden' }, { status: 403 });
  await expect(createVerificationClient(forbidden, tenantId, documentId).list())
    .rejects.toMatchObject({ status: 403, code: 'forbidden' });
});
