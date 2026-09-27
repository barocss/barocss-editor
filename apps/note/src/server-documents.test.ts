import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { copyNoteSnapshotFile, serializeNoteFile } from '@barocss/office-note/file';
import { createServerNoteClient, noteSaveAttempt, ServerNoteError,
  type ServerDocumentMode, type ServerNoteHead, type ServerNoteReceipt } from './server-documents';

const tenantId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';
const pageId = '44444444-4444-4444-8444-444444444444';
const sourceText = serializeNoteFile({ stype: 'note', attributes: { title: '원본' },
  content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '본문' }] }] });
const copy = copyNoteSnapshotFile(sourceText, pageId);
if ('error' in copy) throw new Error(copy.error);
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const head = (snapshotText: string, revision = 1, mode: ServerDocumentMode = 'snapshot'): ServerNoteHead => ({
  documentId, tenantId, workspaceId, product: 'note', title: '원본', metadataRevision: 1,
  mode, pageId, documentKey: `wonffice-${tenantId}-${documentId}`,
  fileFormat: 'barocss-note', fileVersion: 1, revision, snapshotHash: digest(snapshotText)
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
  return { calls, client: createServerNoteClient({ tenantId, workspaceId, authorizedFetch: authorizedFetch as typeof fetch }) };
};

describe('Note server document receipts', () => {
  it('confirms a C copy only after the matching receipt and same-account GET', async () => {
    const attempt = noteSaveAttempt({ operation: 'create', workspaceId, title: '원본',
      snapshotText: sourceText, idempotencyKey: 'create-1' });
    const requestHash = digest(JSON.stringify(['create', workspaceId, 'note', '원본',
      'barocss-note', 1, 'new-page-copy', sourceText]));
    const receipt = { operation: 'create', idempotencyKey: 'create-1', requestHash,
      document: head(copy.snapshotText), snapshotText: copy.snapshotText };
    const { client, calls } = transport(reply(receipt, 201),
      reply({ document: head(copy.snapshotText), snapshotText: copy.snapshotText }));
    const saved = await client.save(attempt);
    const opened = await client.confirm(attempt, saved);
    expect(opened.note.attributes.pageId).toBe(pageId);
    expect(calls.map(call => call.url)).toEqual([
      `/api/v1/tenants/${tenantId}/documents`,
      `/api/v1/tenants/${tenantId}/documents/${documentId}`
    ]);
  });

  it('keeps 503 and network failures distinct so the fixed request can be retried', async () => {
    const { client } = transport(new Response('', { status: 503 }), new Error('offline'));
    const attempt = noteSaveAttempt({ operation: 'create', workspaceId, title: '원본',
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
    const attempt = noteSaveAttempt({ operation: 'create', workspaceId, title: '원본',
      snapshotText: sourceText, idempotencyKey: 'lost-create' });
    const requestHash = digest(JSON.stringify(['create', workspaceId, 'note', '원본',
      'barocss-note', 1, 'new-page-copy', sourceText]));
    const saved = { operation: 'create', idempotencyKey: attempt.idempotencyKey, requestHash,
      document: head(copy.snapshotText), snapshotText: copy.snapshotText };
    const { client, calls } = transport(new Error('response lost'), reply({ status: 'not_found' }, 404),
      reply(saved, 201), reply({ document: head(copy.snapshotText), snapshotText: copy.snapshotText }));
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
    const { client } = transport(reply({ document: head(copy.snapshotText, 1, 'collaborative') }));
    await expect(client.open(documentId)).resolves.toMatchObject({ mode: 'collaborative' });
  });

  it('rejects a receipt whose saved body differs from the same-account GET', async () => {
    const attempt = noteSaveAttempt({ operation: 'update', documentId, expectedRevision: 1,
      snapshotText: copy.snapshotText, idempotencyKey: 'update-1' });
    const requestHash = digest(JSON.stringify(['update', documentId, 1, copy.snapshotText]));
    const receipt: ServerNoteReceipt = { operation: 'update', idempotencyKey: 'update-1', requestHash,
      document: head(copy.snapshotText, 2), snapshotText: copy.snapshotText };
    const { client } = transport(reply({ document: head(copy.snapshotText, 3), snapshotText: copy.snapshotText }));
    await expect(client.confirm(attempt, receipt)).rejects.toBeInstanceOf(ServerNoteError);
  });

  it('rejects a list row from another workspace and duplicate rows across pages', async () => {
    const foreign = { ...head(copy.snapshotText), workspaceId: '99999999-9999-4999-8999-999999999999' };
    await expect(transport(reply({ documents: [foreign], nextCursor: null })).client.list())
      .rejects.toMatchObject({ code: 'invalid_server_response' });
    const row = head(copy.snapshotText);
    await expect(transport(reply({ documents: [row], nextCursor: documentId }),
      reply({ documents: [row], nextCursor: null })).client.list())
      .rejects.toMatchObject({ code: 'invalid_server_response' });
  });

  it('rejects a malformed or non-progressing list cursor', async () => {
    const row = head(copy.snapshotText);
    await expect(transport(reply({ documents: [row], nextCursor: 'nope' })).client.list())
      .rejects.toMatchObject({ code: 'invalid_server_response' });
    await expect(transport(reply({ documents: [row], nextCursor: workspaceId })).client.list())
      .rejects.toMatchObject({ code: 'invalid_server_response' });
  });

  it('rejects same-tenant cross-workspace open and create', async () => {
    const foreignWorkspaceId = '99999999-9999-4999-8999-999999999999';
    await expect(transport(reply({ document: { ...head(copy.snapshotText), workspaceId: foreignWorkspaceId },
      snapshotText: copy.snapshotText })).client.open(documentId))
      .rejects.toMatchObject({ code: 'invalid_server_response' });
    const { client, calls } = transport();
    await expect(client.save(noteSaveAttempt({ operation: 'create', workspaceId: foreignWorkspaceId,
      title: '원본', snapshotText: sourceText, idempotencyKey: 'wrong-workspace' })))
      .rejects.toMatchObject({ code: 'invalid_server_response' });
    expect(calls).toHaveLength(0);
  });
});
