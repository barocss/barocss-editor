import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSampleSite } from '@barocss/office-site';
import { serverSiteFileText } from '../src/server-file';
import { createServerSiteClient, siteSaveAttempt, ServerSiteError,
  type ServerDocumentMode, type ServerSiteHead, type ServerSiteReceipt } from '../src/server-documents';

const tenantId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';
const sourceText = serverSiteFileText(createSampleSite());
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const head = (snapshotText: string, revision = 1, mode: ServerDocumentMode = 'snapshot'): ServerSiteHead => ({
  documentId, tenantId, workspaceId, product: 'site', title: '원본', metadataRevision: 1,
  mode, pageId: null, documentKey: `wonffice-${tenantId}-${documentId}`,
  fileFormat: 'barocss-site', fileVersion: 1, revision, snapshotHash: digest(snapshotText)
});
const reply = (data: unknown, status = 200) => Response.json(data, { status });
const transport = (...responses: Array<Response | Error>) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const authorizedFetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('No test response');
    return next;
  };
  return { calls, client: createServerSiteClient({ tenantId, workspaceId, authorizedFetch: authorizedFetch as typeof fetch }) };
};

describe('Site server document receipts', () => {
  it('confirms exact native bytes only after the matching receipt and same-account GET', async () => {
    const attempt = siteSaveAttempt({ operation: 'create', workspaceId, title: '원본',
      snapshotText: sourceText, idempotencyKey: 'create-1' });
    const requestHash = digest(JSON.stringify(['create', workspaceId, 'site', '원본',
      'barocss-site', 1, null, sourceText]));
    const receipt = { operation: 'create', idempotencyKey: 'create-1', requestHash,
      document: head(sourceText), snapshotText: sourceText };
    const { client, calls } = transport(reply(receipt, 201),
      reply({ document: head(sourceText), snapshotText: sourceText }));
    const saved = await client.save(attempt);
    const opened = await client.confirm(attempt, saved);
    expect(opened.site.stype).toBe('document');
    expect(JSON.parse(String(calls[0].init?.body))).not.toHaveProperty('importMode');
    expect(opened.snapshotText).toBe(sourceText);
    expect(calls.map(call => call.url)).toEqual([
      `/api/v1/tenants/${tenantId}/documents`,
      `/api/v1/tenants/${tenantId}/documents/${documentId}`
    ]);
  });

  it('keeps 503 and network failures distinct so the fixed request can be retried', async () => {
    const { client } = transport(new Response('', { status: 503 }), new Error('offline'));
    const attempt = siteSaveAttempt({ operation: 'create', workspaceId, title: '원본',
      snapshotText: sourceText, idempotencyKey: 'create-2' });
    await expect(client.save(attempt)).rejects.toMatchObject({ status: 503, code: 'http_error' });
    await expect(client.save(attempt)).rejects.toMatchObject({ status: null, code: 'network_error' });
    expect(attempt.idempotencyKey).toBe('create-2');
    expect(attempt.snapshotText).toBe(sourceText);
  });

  it('preserves the Office authentication result instead of reporting a network outage', async () => {
    const forbidden = Object.assign(new Error('no access'), { kind: 'forbidden' });
    const unauthorized = Object.assign(new Error('expired'), { kind: 'unauthorized' });
    await expect(transport(forbidden).client.list()).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(transport(unauthorized).client.list()).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
  });

  it('recovers a lost create response with the original key and body after a missing receipt', async () => {
    const attempt = siteSaveAttempt({ operation: 'create', workspaceId, title: '원본',
      snapshotText: sourceText, idempotencyKey: 'lost-create' });
    const requestHash = digest(JSON.stringify(['create', workspaceId, 'site', '원본',
      'barocss-site', 1, null, sourceText]));
    const saved = { operation: 'create', idempotencyKey: attempt.idempotencyKey, requestHash,
      document: head(sourceText), snapshotText: sourceText };
    const { client, calls } = transport(new Error('response lost'), reply({ status: 'not_found' }, 404),
      reply(saved, 201), reply({ document: head(sourceText), snapshotText: sourceText }));
    await expect(client.save(attempt)).rejects.toMatchObject({ code: 'network_error' });
    await expect(client.receipt('create', attempt.idempotencyKey)).rejects.toMatchObject({ status: 404 });
    await expect(client.confirm(attempt, await client.save(attempt))).resolves.toMatchObject({ mode: 'snapshot' });
    const first = JSON.parse(String(calls[0].init?.body));
    const retried = JSON.parse(String(calls[2].init?.body));
    expect(retried).toEqual(first);
    expect(retried.idempotencyKey).toBe('lost-create');
    expect(retried.snapshotText).toBe(sourceText);
  });

  it('does not open a collaborative document as a snapshot', async () => {
    const { client } = transport(reply({ document: head(sourceText, 1, 'collaborative') }));
    await expect(client.open(documentId)).resolves.toMatchObject({ mode: 'collaborative' });
  });

  it('rejects a receipt whose saved body differs from the same-account GET', async () => {
    const attempt = siteSaveAttempt({ operation: 'update', documentId, expectedRevision: 1,
      snapshotText: sourceText, idempotencyKey: 'update-1' });
    const requestHash = digest(JSON.stringify(['update', documentId, 1, sourceText]));
    const receipt: ServerSiteReceipt = { operation: 'update', idempotencyKey: 'update-1', requestHash,
      document: head(sourceText, 2), snapshotText: sourceText };
    const { client } = transport(reply({ document: head(sourceText, 3), snapshotText: sourceText }));
    await expect(client.confirm(attempt, receipt)).rejects.toBeInstanceOf(ServerSiteError);
  });

  it('rejects a list row from another workspace and duplicate rows across pages', async () => {
    const foreign = { ...head(sourceText), workspaceId: '99999999-9999-4999-8999-999999999999' };
    await expect(transport(reply({ documents: [foreign], nextCursor: null })).client.list())
      .rejects.toMatchObject({ code: 'invalid_server_response' });
    const row = head(sourceText);
    await expect(transport(reply({ documents: [row], nextCursor: documentId }),
      reply({ documents: [row], nextCursor: null })).client.list())
      .rejects.toMatchObject({ code: 'invalid_server_response' });
  });

  it('rejects a malformed or non-progressing list cursor', async () => {
    const row = head(sourceText);
    await expect(transport(reply({ documents: [row], nextCursor: 'nope' })).client.list())
      .rejects.toMatchObject({ code: 'invalid_server_response' });
    await expect(transport(reply({ documents: [row], nextCursor: workspaceId })).client.list())
      .rejects.toMatchObject({ code: 'invalid_server_response' });
  });

  it('rejects same-tenant cross-workspace open and create', async () => {
    const foreignWorkspaceId = '99999999-9999-4999-8999-999999999999';
    await expect(transport(reply({ document: { ...head(sourceText), workspaceId: foreignWorkspaceId },
      snapshotText: sourceText })).client.open(documentId))
      .rejects.toMatchObject({ code: 'invalid_server_response' });
    const { client, calls } = transport();
    await expect(client.save(siteSaveAttempt({ operation: 'create', workspaceId: foreignWorkspaceId,
      title: '원본', snapshotText: sourceText, idempotencyKey: 'wrong-workspace' })))
      .rejects.toMatchObject({ code: 'invalid_server_response' });
    expect(calls).toHaveLength(0);
  });
  it('rejects Note page identities, another product, altered hashes and collaborative bytes', async () => {
    for (const change of [{ pageId: documentId }, { product: 'note' }, { snapshotHash: '0'.repeat(64) },
      { mode: 'collaborative' }]) {
      await expect(transport(reply({ document: { ...head(sourceText), ...change }, snapshotText: sourceText }))
        .client.open(documentId)).rejects.toMatchObject({ code: 'invalid_server_response' });
    }
  });

  it('refuses a different request receipt before confirming any server save', async () => {
    const attempt = siteSaveAttempt({ operation: 'create', workspaceId, title: '원본',
      snapshotText: sourceText, idempotencyKey: 'fixed-copy' });
    const receipt = { operation: 'create' as const, idempotencyKey: 'fixed-copy', requestHash: '0'.repeat(64),
      document: head(sourceText), snapshotText: sourceText };
    const { client, calls } = transport();
    await expect(client.confirm(attempt, receipt)).rejects.toMatchObject({ code: 'invalid_server_response' });
    expect(calls).toHaveLength(0);
  });

  it('confirms an update only at the exact next revision and keeps stale failure explicit', async () => {
    const attempt = siteSaveAttempt({ operation: 'update', documentId, expectedRevision: 7,
      snapshotText: sourceText, idempotencyKey: 'update-fixed' });
    const receipt = { operation: 'update' as const, idempotencyKey: 'update-fixed',
      requestHash: digest(JSON.stringify(['update', documentId, 7, sourceText])),
      document: head(sourceText, 8), snapshotText: sourceText };
    const { client, calls } = transport(reply({ status: 'revision_conflict' }, 409), reply(receipt),
      reply({ document: head(sourceText, 8), snapshotText: sourceText }));
    await expect(client.save(attempt)).rejects.toMatchObject({ status: 409, code: 'revision_conflict' });
    await expect(client.confirm(attempt, await client.save(attempt))).resolves.toMatchObject({
      mode: 'snapshot', snapshotText: sourceText });
    expect(calls[0].init?.body).toBe(calls[1].init?.body);
  });

  it('freezes the selected native copy while later local input remains a different request', () => {
    const source = { operation: 'create' as const, workspaceId, title: 'Selected native source',
      snapshotText: sourceText, idempotencyKey: 'selected-source' };
    const attempt = siteSaveAttempt(source);
    source.title = 'Later local title';
    source.snapshotText = serverSiteFileText({ ...createSampleSite(), metadata: { later: true } });
    expect(Object.isFrozen(attempt)).toBe(true);
    expect(attempt).toMatchObject({ title: 'Selected native source' });
    expect(attempt.snapshotText).toBe(sourceText);
    expect(attempt.snapshotText).not.toBe(source.snapshotText);
  });

  it('recovers an acknowledged update receipt without issuing another write', async () => {
    const attempt = siteSaveAttempt({ operation: 'update', documentId, expectedRevision: 3,
      snapshotText: sourceText, idempotencyKey: 'lost-update' });
    const saved: ServerSiteReceipt = { operation: 'update', idempotencyKey: attempt.idempotencyKey,
      requestHash: digest(JSON.stringify(['update', documentId, 3, sourceText])),
      document: head(sourceText, 4), snapshotText: sourceText };
    const { client, calls } = transport(new Error('ack lost'), reply(saved),
      reply({ document: head(sourceText, 4), snapshotText: sourceText }));
    await expect(client.save(attempt)).rejects.toMatchObject({ code: 'network_error' });
    const receipt = await client.receipt('update', attempt.idempotencyKey);
    const reopened = await client.confirm(attempt, receipt);
    expect(reopened.snapshotText).toBe(sourceText);
    expect(calls.map(call => call.init?.method)).toEqual(['PUT', 'GET', 'GET']);
    expect(calls[1].url).toBe(`/api/v1/tenants/${tenantId}/receipts/update/lost-update`);
  });

  it('does not confirm a saved receipt after access revocation or a fresh mode change', async () => {
    const attempt = siteSaveAttempt({ operation: 'update', documentId, expectedRevision: 1,
      snapshotText: sourceText, idempotencyKey: 'authority-change' });
    const saved: ServerSiteReceipt = { operation: 'update', idempotencyKey: attempt.idempotencyKey,
      requestHash: digest(JSON.stringify(['update', documentId, 1, sourceText])),
      document: head(sourceText, 2), snapshotText: sourceText };
    await expect(transport(reply({ status: 'forbidden' }, 403)).client.confirm(attempt, saved))
      .rejects.toMatchObject({ status: 403, code: 'forbidden' });
    for (const mode of ['initializing', 'collaborative'] as const) {
      const { client, calls } = transport(reply({ document: head(sourceText, 2, mode) }));
      await expect(client.confirm(attempt, saved)).rejects.toMatchObject({ code: 'invalid_server_response' });
      expect(calls.map(call => call.init?.method)).toEqual(['GET']);
    }
    expect(attempt).toMatchObject({ expectedRevision: 1 });
    expect(attempt.snapshotText).toBe(sourceText);
  });

  it('keeps backend mode refusal explicit without changing or automatically replaying a fixed attempt', async () => {
    const attempt = siteSaveAttempt({ operation: 'update', documentId, expectedRevision: 1,
      snapshotText: sourceText, idempotencyKey: 'mode-refused' });
    const { client, calls } = transport(reply({ status: 'mode_conflict' }, 409));
    await expect(client.save(attempt)).rejects.toMatchObject({ status: 409, code: 'mode_conflict' });
    expect(calls).toHaveLength(1);
    expect(attempt).toMatchObject({ expectedRevision: 1, snapshotText: sourceText, idempotencyKey: 'mode-refused' });
  });

});
