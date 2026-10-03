import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createBusinessPair } from '../src/business-pair';
import { captureCriterionContext } from '../src/criterion-confirmation';
import { wordFileText } from '../src/word-file';
import { createCriterionClient, currentCriterionReceipt, criterionHash, criterionRequest, type CriterionBasis, type CriterionReceipt } from '../../../apps/word/src/criterion-confirmation-client';

const tenantId = '11111111-1111-4111-8111-111111111111', documentId = '22222222-2222-4222-8222-222222222222';
const actorIdentityId = '33333333-3333-4333-8333-333333333333';
afterEach(() => { vi.unstubAllGlobals(); });
async function basis(): Promise<CriterionBasis> {
  vi.stubGlobal('crypto', webcrypto);
  const document = { stype: 'document', metadata: { approved: true, actor: 'forged' }, content: [{ stype: 'surface', content: [
    { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'r' } }, { stype: 'inline-text', text: 'Preserve complete native evidence', marks: [{ stype: 'bold', range: [0, 8] }] }] },
    { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'd' } }, { stype: 'inline-text', text: 'Keep original version references' }] }
  ] }] };
  const pair = createBusinessPair(document, 'r', 'd');
  const snapshotText = wordFileText({ ...document, metadata: { ...document.metadata, wonfficeBusinessPair: pair } }, '');
  return { schemaVersion: 1, documentRevision: 9, snapshotText, snapshotHash: await criterionHash(snapshotText), context: captureCriterionContext(snapshotText), authorityEpoch: 'writer-epoch-7', actorIdentityId };
}
function transport(value: unknown) { return vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(new Response(JSON.stringify(value), { status: 200 })); }
it('captures validated full native context separately from server identity and rejects forged context or mismatched source hash', async () => {
  const current = await basis(); const before = structuredClone(current);
  expect(await createCriterionClient(transport(current), tenantId, documentId).context()).toEqual(current);
  for (const corrupted of [{ ...current, snapshotHash: 'f'.repeat(64) }, { ...current, context: { ...current.context, approved: true } }])
    await expect(createCriterionClient(transport(corrupted), tenantId, documentId).context()).rejects.toThrow('invalid_confirmation_response');
  expect(current).toEqual(before);
});
it('sends one frozen explicit operation and validates exact actor, own receipt identity, context, version and request hash', async () => {
  const current = await basis(), attempt = criterionRequest(current, 'confirm-fixed');
  const requestHash = await criterionHash(JSON.stringify(['criterion-confirmation-v1', tenantId, documentId, actorIdentityId, attempt]));
  const receipt: CriterionReceipt = { schemaVersion: 1, confirmationId: '44444444-4444-4444-8444-444444444444', tenantId, documentId, actorIdentityId,
    confirmedAt: '2026-10-03T01:00:00.000Z', documentRevision: 9, snapshotHash: current.snapshotHash, context: current.context,
    authorityEpoch: current.authorityEpoch, idempotencyKey: attempt.idempotencyKey, requestHash, verification: 'not-run', scope: 'writer-self-confirmation' };
  await expect(createCriterionClient(transport({ confirmations: [{ ...receipt, context: {} }] }), tenantId, documentId).list()).rejects.toThrow('invalid_confirmation_response');
  await expect(createCriterionClient(transport({ confirmations: [{ ...receipt, context: { ...receipt.context, decision: { ...receipt.context.decision, snapshotText: '{}' } } }] }), tenantId, documentId).list()).rejects.toThrow('invalid_confirmation_response');
  expect(currentCriterionReceipt(current, [receipt])).toEqual(receipt);
  const other = await basis();
  const wrongContext = { ...receipt, context: other.context };
  const historical = await createCriterionClient(transport({ confirmations: [wrongContext] }), tenantId, documentId).list();
  expect(currentCriterionReceipt(current, historical)).toBeUndefined();
  const send = transport(receipt);
  expect(await createCriterionClient(send, tenantId, documentId).confirm(attempt, actorIdentityId)).toEqual(receipt);
  expect(JSON.parse(send.mock.calls[0][1]!.body as string)).toEqual(attempt);
  expect(attempt).not.toHaveProperty('actor'); expect(attempt).not.toHaveProperty('confirmedAt');
  for (const corrupted of [{ ...receipt, actorIdentityId: documentId }, { ...receipt, requestHash: '0'.repeat(64) },
    { ...receipt, documentId: tenantId }, { ...receipt, documentRevision: 10 }, { ...receipt, verification: 'passed' },
    { ...receipt, context: { ...receipt.context, decision: { ...receipt.context.decision, snapshotText: '{}' } } }])
    await expect(createCriterionClient(transport(corrupted), tenantId, documentId).confirm(attempt, actorIdentityId)).rejects.toThrow('invalid_confirmation_response');
});
it('preserves frozen bytes/key after lost acknowledgement and never treats an ordinary save or malformed private record as confirmation', async () => {
  const current = await basis(), attempt = criterionRequest(current, 'confirm-retry'), before = JSON.stringify(attempt);
  const send = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockRejectedValue(new TypeError('connection lost'));
  const client = createCriterionClient(send, tenantId, documentId);
  await expect(client.confirm(attempt, actorIdentityId)).rejects.toThrow('confirmation_network_unknown');
  await expect(client.confirm(attempt, actorIdentityId)).rejects.toThrow('confirmation_network_unknown');
  expect(send.mock.calls.map(call => call[1]!.body)).toEqual([before, before]); expect(JSON.stringify(attempt)).toBe(before);
  await expect(createCriterionClient(transport({ operation: 'update', snapshotText: current.snapshotText }), tenantId, documentId).list()).rejects.toThrow('invalid_confirmation_response');
  const refused = transport({});
  await expect(createCriterionClient(refused, tenantId, documentId).confirm({ ...attempt, actor: 'forged' } as typeof attempt, actorIdentityId)).rejects.toThrow('invalid_confirmation_response');
  expect(refused).not.toHaveBeenCalled();
});
