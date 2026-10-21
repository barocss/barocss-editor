import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseRegistryDefinition, REGISTRY_DIGEST } from '@barocss/schema/registry-contract';
import { registerSchema, type McpRegistration } from '../src/mcp-register.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const schemaId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const config = { baseUrl: 'http://127.0.0.1:4101', bearerToken: 'controlled.token.value' };
const definition = { dialect: 'wonffice.note-fields.v1', scope: { tenantId, workspaceId }, schemaId, version: 1,
  parent: null, dependencies: [], requiredCapabilities: ['note.field.text.v1'],
  dataset: { name: 'Tasks', fields: [{ name: 'Title', kind: 'text' }] } };
const input: McpRegistration = { tenantId, workspaceId, schemaId, version: 1,
  definitionText: JSON.stringify(definition, null, 2), idempotencyKey: 'fixed-key-1' };

function receipt(submitted = input) {
  const parsed = parseRegistryDefinition(submitted.definitionText);
  const original = parseRegistryDefinition(input.definitionText);
  return { operation: 'register', idempotencyKey: submitted.idempotencyKey,
    requestHash: sha(JSON.stringify(['schema-register-v1', tenantId, workspaceId, schemaId, 1, submitted.definitionText])),
    requesterIdentityId: actorId, authorityEpoch: 'epoch-1',
    record: { schemaId, version: 1, digest: sha(original.canonicalText), digestAlgorithm: REGISTRY_DIGEST,
      definitionText: input.definitionText, canonicalText: original.canonicalText, definition: parsed.definition,
      actorIdentityId: actorId, createdAt: '2026-10-08T00:00:00.000Z' }, dependencies: [] };
}

describe('MCP schema registration over the controlled HTTP boundary', () => {
  it('sends only the fixed original bytes and key to the existing authenticated PUT', async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (url, init) => {
      calls++;
      expect(String(url)).toBe(`http://127.0.0.1:4101/v1/tenants/${tenantId}/workspaces/${workspaceId}` +
        `/schemas/${schemaId}/versions/1`);
      expect(init?.method).toBe('PUT');
      expect(init?.redirect).toBe('error');
      expect(init?.headers).toEqual({ authorization: 'Bearer controlled.token.value', accept: 'application/json',
        'content-type': 'application/json' });
      expect(JSON.parse(String(init?.body))).toEqual({ definitionText: input.definitionText,
        idempotencyKey: input.idempotencyKey });
      return Response.json(receipt());
    };
    expect(await registerSchema(config, input, undefined, fetcher)).toEqual(receipt());
    expect(calls).toBe(1);

    const equivalent = { ...input, definitionText: JSON.stringify(definition) };
    const equivalentResult = receipt(equivalent);
    expect(await registerSchema(config, equivalent, undefined, async () => Response.json(equivalentResult)))
      .toEqual(equivalentResult);
    expect(equivalentResult.record.definitionText).toBe(input.definitionText);
  });

  it('returns service denial without inventing a receipt', async () => {
    for (const [status, reason] of [[401, 'unauthorized'], [403, 'scope_forbidden'],
      [409, 'key_reuse'], [422, 'dependency_missing']] as const) {
      await expect(registerSchema(config, input, undefined,
        async () => Response.json({ status: reason }, { status })))
        .rejects.toMatchObject({ reason });
    }
  });

  it('refuses malformed or out-of-scope inputs before any HTTP call', async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; throw new Error('unexpected'); };
    for (const altered of [{ ...input, workspaceId: actorId },
      { ...input, definitionText: input.definitionText.replace('"Title"', '"Title","kind":"code"') },
      { ...input, definitionText: 'x'.repeat(65537) },
      { ...input, idempotencyKey: '../bad' }]) {
      await expect(registerSchema(config, altered, undefined, fetcher)).rejects.toBeDefined();
    }
    await expect(registerSchema({ ...config, bearerToken: undefined }, input, undefined, fetcher))
      .rejects.toMatchObject({ reason: 'unauthorized' });
    expect(calls).toBe(0);
  });

  it('rejects a forged, partial or altered success response', async () => {
    const good = receipt();
    for (const altered of [
      { ...good, requestHash: '0'.repeat(64) },
      { ...good, record: { ...good.record, digest: '0'.repeat(64) } },
      { ...good, record: { ...good.record, definitionText: good.record.definitionText.replace('Tasks', 'Other') } },
      { ...good, dependencies: [{ ...good.record, schemaId: actorId }] },
      { ...good, record: { ...good.record, definition: { ...good.record.definition, scope: { tenantId: actorId, workspaceId } } } },
    ]) {
      await expect(registerSchema(config, input, undefined, async () => Response.json(altered)))
        .rejects.toMatchObject({ reason: 'invalid_service_response' });
    }
  });

  it('bounds responses and cancels a caller-aborted request', async () => {
    await expect(registerSchema(config, input, undefined, async () => new Response('x'.repeat(400000))))
      .rejects.toMatchObject({ reason: 'response_too_large' });
    const signal = new AbortController(); signal.abort();
    await expect(registerSchema(config, input, signal.signal, async () => { throw new Error('aborted'); }))
      .rejects.toMatchObject({ reason: 'cancelled' });
  });
});
