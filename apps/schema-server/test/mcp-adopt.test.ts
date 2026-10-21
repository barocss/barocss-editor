import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseRegistryDefinition } from '@barocss/schema/registry-contract';
import { adoptSchema, type McpAdoption } from '../src/mcp-adopt.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const schemaId = '33333333-3333-4333-8333-333333333333';
const documentId = '55555555-5555-4555-8555-555555555555';
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const definitionText = JSON.stringify({ dialect: 'wonffice.note-fields.v1', scope: { tenantId, workspaceId },
  schemaId, version: 1, parent: null, dependencies: [], requiredCapabilities: ['note.field.text.v1'],
  dataset: { name: 'Tasks', fields: [{ name: 'Title', kind: 'text' }] } });
const ref = { schemaId, version: 1, digest: sha(parseRegistryDefinition(definitionText).canonicalText) };
const snapshotText = JSON.stringify({ format: 'barocss-note', version: 2,
  schemaBundle: { bundleVersion: 1, digestAlgorithm: 'wonffice.canonical-json.sha256.v1',
    selected: [ref], definitions: [{ reference: ref, definitionText }] },
  document: { stype: 'note', attributes: { title: 'Exact', pageId: documentId }, content: [] } });
const input: McpAdoption = { tenantId, documentId, expectedRevision: 1,
  expectedSnapshotHash: 'a'.repeat(64), expectedPriorPinDigest: 'b'.repeat(64),
  snapshotText, idempotencyKey: 'adopt-fixed-1' };
const config = { baseUrl: 'http://127.0.0.1:4101', bearerToken: 'controlled.token.value' };
const requestHash = sha(JSON.stringify(['note-native2-snapshot-v1', tenantId, workspaceId, documentId,
  'adopt', 1, input.expectedSnapshotHash, input.expectedPriorPinDigest, snapshotText]));
const receipt = { operation: 'update', idempotencyKey: input.idempotencyKey, requestHash,
  document: { documentId, tenantId, workspaceId, product: 'note', title: 'Exact',
    creatorUserId: null, metadataRevision: 1, mode: 'snapshot', pageId: documentId,
    documentKey: `wonffice-${tenantId}-${documentId}`, fileFormat: 'barocss-note',
    fileVersion: 2, revision: 2, snapshotHash: sha(snapshotText) }, snapshotText };

describe('MCP Note schema adoption adapter', () => {
  it('sends exactly one authenticated adopt PUT with original text and verifies the durable receipt', async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (url, init) => {
      calls++;
      expect(url).toBe(`${config.baseUrl}/v1/tenants/${tenantId}/note-native2/documents/${documentId}/snapshot`);
      expect(init?.method).toBe('PUT');
      expect(init?.redirect).toBe('error');
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer controlled.token.value');
      expect(JSON.parse(init?.body as string)).toEqual({ schemaAction: 'adopt', expectedRevision: 1,
        expectedSnapshotHash: input.expectedSnapshotHash, expectedPriorPinDigest: input.expectedPriorPinDigest,
        snapshotText, idempotencyKey: input.idempotencyKey });
      return Response.json(receipt);
    };
    expect(await adoptSchema(config, input, undefined, fetcher)).toEqual(receipt);
    expect(await adoptSchema(config, input, undefined, fetcher)).toEqual(receipt);
    expect(calls).toBe(2);
  });

  it('preserves named service denials without fabricating a receipt', async () => {
    for (const [status, reason] of [[401, 'unauthorized'], [403, 'scope_forbidden'],
      [409, 'revision_conflict'], [409, 'schema_pin_conflict'], [409, 'key_reuse'],
      [422, 'invalid_snapshot']] as const) {
      await expect(adoptSchema(config, input, undefined,
        async () => Response.json({ status: reason }, { status })))
        .rejects.toMatchObject({ reason });
    }
  });

  it('refuses malformed, extra and authority fields before HTTP', async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; throw Error('unexpected'); };
    for (const bad of [{ ...input, actorId: workspaceId }, { ...input, schemaAction: 'preserve' },
      { ...input, expectedRevision: Number.MAX_SAFE_INTEGER },
      { ...input, expectedSnapshotHash: 'A'.repeat(64) },
      { ...input, snapshotText: 'x'.repeat(524289) }, { ...input, idempotencyKey: '../bad' }]) {
      await expect(adoptSchema(config, bad, undefined, fetcher))
        .rejects.toMatchObject({ reason: 'invalid_request' });
    }
    await expect(adoptSchema({ ...config, bearerToken: undefined }, input, undefined, fetcher))
      .rejects.toMatchObject({ reason: 'unauthorized' });
    expect(calls).toBe(0);
  });

  it('refuses partial, forged or cross-scope success', async () => {
    for (const bad of [
      { ...receipt, requestHash: '0'.repeat(64) },
      { ...receipt, idempotencyKey: 'another-key' },
      { ...receipt, document: { ...receipt.document, workspaceId: tenantId } },
      { ...receipt, document: { ...receipt.document, revision: 3 } },
      { ...receipt, document: { ...receipt.document, pageId: workspaceId } },
      { ...receipt, document: { ...receipt.document, snapshotHash: '0'.repeat(64) } },
      { ...receipt, snapshotText: snapshotText + ' ' },
      { ...receipt, authority: 'forged' },
    ]) {
      await expect(adoptSchema(config, input, undefined, async () => Response.json(bad)))
        .rejects.toMatchObject({ reason: 'invalid_service_response' });
    }
  });

  it('bounds responses and reports caller cancellation', async () => {
    await expect(adoptSchema(config, input, undefined, async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))))
      .rejects.toMatchObject({ reason: 'response_too_large' });
    const controller = new AbortController(); controller.abort();
    await expect(adoptSchema(config, input, controller.signal, async () => { throw Error('aborted'); }))
      .rejects.toMatchObject({ reason: 'cancelled' });
  });
});
