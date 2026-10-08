import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseRegistryDefinition } from '@barocss/schema/registry-contract';
import { McpBundleReadError, readExactDocumentBundle, schemaServerOrigin } from '../src/mcp-bundle-reader.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const documentId = '55555555-5555-4555-8555-555555555555';
const firstSchema = '33333333-3333-4333-8333-333333333333';
const secondSchema = '44444444-4444-4444-8444-444444444444';
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function fixture() {
  const firstText = JSON.stringify({ dialect: 'wonffice.note-fields.v1', scope: { tenantId, workspaceId },
    schemaId: firstSchema, version: 1, parent: null, dependencies: [], requiredCapabilities: ['note.field.text.v1'],
    dataset: { name: 'Original', fields: [{ name: 'Name', kind: 'text' }] } }, null, 2);
  const first = { schemaId: firstSchema, version: 1, digest: sha(parseRegistryDefinition(firstText).canonicalText) };
  const secondV1Text = JSON.stringify({ dialect: 'wonffice.note-fields.v1', scope: { tenantId, workspaceId },
    schemaId: secondSchema, version: 1, parent: null, dependencies: [first], requiredCapabilities: ['note.field.text.v1'],
    dataset: { name: 'Earlier', fields: [{ name: 'Name', kind: 'text' }] } });
  const secondV1 = { schemaId: secondSchema, version: 1, digest: sha(parseRegistryDefinition(secondV1Text).canonicalText) };
  const secondText = JSON.stringify({ dialect: 'wonffice.note-fields.v1', scope: { tenantId, workspaceId },
    schemaId: secondSchema, version: 2, parent: secondV1, dependencies: [], requiredCapabilities: ['note.field.text.v1'],
    dataset: { name: 'Later', fields: [{ name: 'Name', kind: 'text' }] } });
  const second = { schemaId: secondSchema, version: 2, digest: sha(parseRegistryDefinition(secondText).canonicalText) };
  const bundle = { bundleVersion: 1, digestAlgorithm: 'wonffice.canonical-json.sha256.v1', selected: [second],
    definitions: [{ reference: second, definitionText: secondText },
      { reference: secondV1, definitionText: secondV1Text }, { reference: first, definitionText: firstText }] };
  const snapshotText = JSON.stringify({ format: 'barocss-note', version: 2, schemaBundle: bundle,
    document: { stype: 'note', attributes: { title: 'Exact', pageId: documentId }, content: [] } });
  const document = { documentId, tenantId, workspaceId, product: 'note', title: 'Exact', creatorUserId: null,
    metadataRevision: 1, mode: 'snapshot', pageId: documentId, documentKey: 'controlled-key',
    fileFormat: 'barocss-note', fileVersion: 2, revision: 7, snapshotHash: sha(snapshotText) };
  const opened = { document, snapshotText };
  const resolved = { status: 'pinned', documentId, documentRevision: 7, snapshotHash: document.snapshotHash,
    nativeFormat: { format: 'barocss-note', version: 2 }, bundle };
  return { opened, resolved, bundle, snapshotText, document, firstText };
}

const config = { baseUrl: 'http://127.0.0.1:4101', bearerToken: 'controlled.token.value' };
function served(values: readonly [unknown, unknown]) {
  const paths: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    paths.push(String(input));
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({ authorization: 'Bearer controlled.token.value', accept: 'application/json' });
    expect(init?.redirect).toBe('error');
    return Response.json(values[paths.length - 1]);
  };
  return { fetcher, paths };
}

describe('MCP exact document-bundle reader, controlled HTTP responses only', () => {
  it('keeps raw text, head, original definitions and transitive dependency exact', async () => {
    const source = fixture(), { fetcher, paths } = served([source.opened, source.resolved]);
    const result = await readExactDocumentBundle(config, tenantId, documentId, undefined, fetcher);
    expect(result).toEqual({ status: 'pinned', document: source.document, snapshotText: source.snapshotText,
      documentRevision: 7, snapshotHash: source.document.snapshotHash,
      nativeFormat: { format: 'barocss-note', version: 2 }, bundle: source.bundle });
    expect(result.bundle.definitions[2].definitionText).toBe(source.firstText);
    expect(paths).toEqual([`http://127.0.0.1:4101/v1/tenants/${tenantId}/note-native2/documents/${documentId}`,
      `http://127.0.0.1:4101/v1/tenants/${tenantId}/note-native2/documents/${documentId}/schema-bundle`]);
  });

  it('refuses missing credentials and non-loopback service configuration before fetch', async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; throw new Error('unexpected fetch'); };
    await expect(readExactDocumentBundle({ ...config, bearerToken: undefined }, tenantId, documentId, undefined, fetcher))
      .rejects.toMatchObject({ reason: 'unauthorized' });
    for (const url of ['https://example.com', 'http://localhost:4101', 'http://127.0.0.1:4101/base',
      'http://127.0.0.1:4101/%2e%2e',
      'http://user:secret@127.0.0.1:4101', 'http://127.0.0.1:4101/?role=owner']) {
      expect(() => schemaServerOrigin(url)).toThrow(McpBundleReadError);
    }
    expect(calls).toBe(0);
  });

  it('surfaces existing service denial and never returns the first response', async () => {
    const source = fixture();
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      return calls === 1 ? Response.json(source.opened) : Response.json({ status: 'scope_forbidden' }, { status: 403 });
    };
    await expect(readExactDocumentBundle(config, tenantId, documentId, undefined, fetcher))
      .rejects.toMatchObject({ reason: 'scope_forbidden' });
    expect(calls).toBe(2);
  });

  it('refuses a changed revision, hash, omitted dependency and wrong raw page', async () => {
    const source = fixture();
    const changed = { ...source.resolved, documentRevision: 8 };
    await expect(readExactDocumentBundle(config, tenantId, documentId, undefined, served([source.opened, changed]).fetcher))
      .rejects.toMatchObject({ reason: 'inconsistent_document_read' });
    const partial = { ...source.resolved, bundle: { ...source.bundle, definitions: [source.bundle.definitions[0]] } };
    await expect(readExactDocumentBundle(config, tenantId, documentId, undefined, served([source.opened, partial]).fetcher))
      .rejects.toMatchObject({ reason: 'inconsistent_document_read' });
    const wrong = { ...source.opened, document: { ...source.document, pageId: 'other-page' } };
    await expect(readExactDocumentBundle(config, tenantId, documentId, undefined, served([wrong, source.resolved]).fetcher))
      .rejects.toMatchObject({ reason: 'invalid_service_response' });
    const wrongWorkspace = { ...source.opened, document: { ...source.document,
      workspaceId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } };
    await expect(readExactDocumentBundle(config, tenantId, documentId, undefined, served([wrongWorkspace, source.resolved]).fetcher))
      .rejects.toMatchObject({ reason: 'invalid_service_response' });
    const brokenRaw = JSON.stringify({ ...JSON.parse(source.snapshotText),
      schemaBundle: { ...source.bundle, definitions: [source.bundle.definitions[0]] } });
    const broken = { document: { ...source.document, snapshotHash: sha(brokenRaw) }, snapshotText: brokenRaw };
    const onlyFirst = served([broken, source.resolved]);
    await expect(readExactDocumentBundle(config, tenantId, documentId, undefined, onlyFirst.fetcher))
      .rejects.toMatchObject({ reason: 'invalid_service_response' });
    expect(onlyFirst.paths).toHaveLength(1);
  });

  it('refuses oversized, malformed, redirected and cancelled reads', async () => {
    const large: typeof fetch = async () => new Response('x'.repeat(2 * 1024 * 1024 + 1));
    await expect(readExactDocumentBundle(config, tenantId, documentId, undefined, large))
      .rejects.toMatchObject({ reason: 'response_too_large' });
    const malformed: typeof fetch = async () => new Response('{');
    await expect(readExactDocumentBundle(config, tenantId, documentId, undefined, malformed))
      .rejects.toMatchObject({ reason: 'invalid_service_response' });
    const redirected: typeof fetch = async () => { throw new Error('redirect blocked'); };
    await expect(readExactDocumentBundle(config, tenantId, documentId, undefined, redirected))
      .rejects.toMatchObject({ reason: 'schema_service_unavailable' });
    const controller = new AbortController(); controller.abort();
    const cancelled: typeof fetch = async () => { throw new Error('aborted'); };
    await expect(readExactDocumentBundle(config, tenantId, documentId, controller.signal, cancelled))
      .rejects.toMatchObject({ reason: 'cancelled' });
  });
});
