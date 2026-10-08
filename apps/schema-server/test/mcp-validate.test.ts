import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateNative2, type McpValidation } from '../src/mcp-validate.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const documentId = '55555555-5555-4555-8555-555555555555';
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const config = { baseUrl: 'http://127.0.0.1:4101', bearerToken: 'controlled.token.value' };
const sourceChecks = ['current_authority', 'current_source', 'native2_file', 'registered_bundle',
  'source_preconditions'];
const candidateChecks = [...sourceChecks, 'candidate_file', 'candidate_registered_bundle',
  'candidate_action_policy', 'pin_transition'];
const document: McpValidation = { kind: 'document', tenantId, documentId, expectedRevision: 3,
  expectedSnapshotHash: sha('stored raw'), expectedPriorPinDigest: sha('stored pins') };
const candidate: McpValidation = { ...document, kind: 'candidate',
  snapshotText: '{ "exact": "raw text" }', intendedAction: 'preserve' };

function result(input: McpValidation) {
  return { status: 'structurally_valid', kind: input.kind, documentId,
    documentRevision: input.expectedRevision, snapshotHash: input.expectedSnapshotHash,
    priorPinDigest: input.expectedPriorPinDigest,
    checks: input.kind === 'candidate' ? candidateChecks : sourceChecks,
    ...(input.kind === 'candidate' ? { candidateSnapshotHash: sha(input.snapshotText),
      action: input.intendedAction } : {}) };
}

describe('MCP native2 validation forwards the same HTTP contract', () => {
  it('posts exact preconditions and raw candidate text to the one authenticated read-only route', async () => {
    for (const input of [document, candidate]) {
      let calls = 0;
      const fetcher: typeof fetch = async (url, init) => {
        calls++;
        expect(String(url)).toBe(`http://127.0.0.1:4101/v1/tenants/${tenantId}` +
          `/note-native2/documents/${documentId}/validation`);
        expect(init?.method).toBe('POST');
        expect(init?.redirect).toBe('error');
        expect(init?.headers).toEqual({ authorization: 'Bearer controlled.token.value',
          accept: 'application/json', 'content-type': 'application/json' });
        const posted = JSON.parse(String(init?.body));
        expect(posted).toEqual(input.kind === 'document'
          ? { kind: 'document', expectedRevision: 3, expectedSnapshotHash: input.expectedSnapshotHash,
            expectedPriorPinDigest: input.expectedPriorPinDigest }
          : { kind: 'candidate', expectedRevision: 3, expectedSnapshotHash: input.expectedSnapshotHash,
            expectedPriorPinDigest: input.expectedPriorPinDigest, snapshotText: input.snapshotText,
            intendedAction: input.intendedAction });
        expect(posted).not.toHaveProperty('role');
        expect(posted).not.toHaveProperty('actor');
        return Response.json(result(input));
      };
      expect(await validateNative2(config, input, undefined, fetcher)).toEqual(result(input));
      expect(calls).toBe(1);
    }
  });

  it('preserves named authority, stale-source, pin and candidate refusals', async () => {
    for (const [status, reason] of [[401, 'unauthorized'], [403, 'scope_forbidden'],
      [404, 'not_found'], [409, 'revision_conflict'], [409, 'snapshot_hash_conflict'],
      [409, 'schema_pin_conflict'], [422, 'invalid_snapshot'],
      [422, 'unsupported_native_format'], [413, 'snapshot_too_large']] as const) {
      await expect(validateNative2(config, candidate, undefined,
        async () => Response.json({ status: reason }, { status }))).rejects.toMatchObject({ reason });
    }
  });

  it('rejects malformed inputs before HTTP and forged or partial success', async () => {
    let calls = 0;
    const never: typeof fetch = async () => { calls++; throw new Error('unexpected'); };
    for (const invalid of [
      { ...document, role: 'owner' }, { ...document, tenantId: '../foreign' },
      { ...document, expectedRevision: 0 }, { ...document, expectedPriorPinDigest: '0' },
      { ...candidate, intendedAction: 'execute' }, { ...candidate, snapshotText: '📝'.repeat(140000) },
    ]) {
      await expect(validateNative2(config, invalid as McpValidation, undefined, never))
        .rejects.toMatchObject({ reason: 'invalid_request' });
    }
    await expect(validateNative2({ ...config, bearerToken: undefined }, document, undefined, never))
      .rejects.toMatchObject({ reason: 'unauthorized' });
    expect(calls).toBe(0);
    const good = result(candidate);
    for (const altered of [
      { ...good, snapshotHash: sha('other source') },
      { ...good, documentRevision: 4 },
      { ...good, priorPinDigest: sha('other pins') },
      { ...good, candidateSnapshotHash: sha('normalized text') },
      { ...good, action: 'adopt' },
      { ...good, checks: candidateChecks.slice(0, -1) },
      { ...good, approval: true },
    ]) {
      await expect(validateNative2(config, candidate, undefined,
        async () => Response.json(altered))).rejects.toMatchObject({ reason: 'invalid_service_response' });
    }
  });

  it('bounds the response and maps caller cancellation', async () => {
    await expect(validateNative2(config, document, undefined,
      async () => new Response('x'.repeat(70000))))
      .rejects.toMatchObject({ reason: 'response_too_large' });
    const controller = new AbortController(); controller.abort();
    await expect(validateNative2(config, document, controller.signal,
      async () => { throw new Error('aborted'); })).rejects.toMatchObject({ reason: 'cancelled' });
  });
});
