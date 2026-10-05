import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { DocumentStore, type CreateDocumentInput } from '../src/document-store.js';
import { MembershipStore, TenantAccessDeniedError, type TenantRole } from '../src/membership-store.js';

const tenant = '11111111-1111-4111-8111-111111111111';
const workspace = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';
const other = '44444444-4444-4444-8444-444444444444';
const principal = { issuer: 'https://verified.example', subject: 'authenticated-user' };
const native = { format: 'barocss-word', version: 1, document: { stype: 'document',
  attributes: { title: 'Original', language: 'ko' }, content: [{ stype: 'paragraph', attributes: { align: 'center' },
    content: [{ stype: 'inline-text', text: 'Complete original', marks: [{ stype: 'bold', range: [0, 8] }] }] }],
  metadata: { preserve: ['marks', 'attributes'] } } };
const input: CreateDocumentInput = { workspaceId: workspace, product: 'word', title: 'Original',
  fileFormat: 'barocss-word', fileVersion: 1, snapshotText: JSON.stringify(native), idempotencyKey: 'create-original' };

/** SQL boundary fixture. It executes the actual store methods; PostgreSQL/RLS is qualified separately. */
function boundary() {
  let role: TenantRole = 'editor', identity = user, denied = false, workspaceExists = true;
  const documents: Record<string, unknown>[] = [];
  const receipts = new Map<string, Record<string, unknown>>();
  const receiptKey = (values: unknown[]) => JSON.stringify(values.slice(0, 4));
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('SELECT id FROM wonffice.identities')) return { rows: [{ id: identity }], rowCount: 1 };
    if (sql.includes('INSERT INTO wonffice.document_receipts')) {
      const key = receiptKey(values); if (receipts.has(key)) return { rows: [], rowCount: 0 };
      receipts.set(key, { request_hash: values[4], result_head: null, result_snapshot_text: null });
      return { rows: [{}], rowCount: 1 };
    }
    if (sql.includes('SELECT r.request_hash')) return { rows: [{ ...receipts.get(receiptKey(values)), current_mode: 'snapshot' }], rowCount: 1 };
    if (sql.includes('SELECT 1 FROM wonffice.workspaces')) return { rows: workspaceExists ? [{}] : [], rowCount: workspaceExists ? 1 : 0 };
    if (sql.includes('INSERT INTO wonffice.documents')) {
      const columns = sql.match(/\(([^)]+)\)\s*VALUES/)![1].split(',').map(value => value.trim());
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index]])); documents.push(row);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO wonffice.document_snapshots')) {
      const row = documents.at(-1)!; Object.assign(row, { fileFormat: values[2], fileVersion: values[3], snapshotText: values[4], snapshotHash: values[5] });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('UPDATE wonffice.document_receipts')) {
      Object.assign(receipts.get(receiptKey(values))!, { result_head: JSON.parse(values[5] as string), result_snapshot_text: values[6] });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT d.id AS')) return { rows: documents.filter(row => !sql.includes('d.id = $2') || row.id === values[1]).map(row => ({ documentId: row.id, tenantId: row.tenant_id,
      workspaceId: row.workspace_id, product: row.product, title: row.title, pageId: row.page_id, documentKey: row.document_key,
      creatorUserId: row.creator_user_id ?? null, metadataRevision: 1, mode: 'snapshot', fileFormat: row.fileFormat,
      fileVersion: row.fileVersion, revision: 1, snapshotHash: row.snapshotHash, snapshotText: row.snapshotText })), rowCount: documents.length };
    throw new Error('unhandled_query');
  });
  const client = { query } as unknown as PoolClient;
  vi.spyOn(MembershipStore.prototype, 'withAuthorizedTenant').mockImplementation(async (_principal, _tenant, operation) => {
    if (denied) throw new TenantAccessDeniedError();
    return operation(client, role);
  });
  return { store: new DocumentStore({} as Pool), query, documents, receipts,
    setRole: (value: TenantRole) => { role = value; }, setIdentity: (value: string) => { identity = value; },
    revoke: () => { denied = true; }, missingWorkspace: () => { workspaceExists = false; } };
}
afterEach(() => vi.restoreAllMocks());
describe('immutable creator attribution at genuine creation', () => {
  it('attributes an editor-created original to the verified internal user, not a tenant owner or supplied creator', async () => {
    const b = boundary();
    const created = await b.store.create(principal, tenant, { ...input, creatorUserId: other } as CreateDocumentInput);
    expect(created.document).toMatchObject({ creatorUserId: user });
    expect(b.documents[0].creator_user_id).toBe(user);
    expect(created.snapshotText).toBe(input.snapshotText);
    expect(JSON.parse(created.snapshotText!)).toEqual(native);
    expect(b.query).toHaveBeenCalledWith(expect.stringContaining('SELECT id FROM wonffice.identities'), [principal.issuer, principal.subject]);
  });
  it('retains the original creator and complete frozen receipt on exact lost-ACK retry', async () => {
    const b = boundary(); const first = await b.store.create(principal, tenant, input);
    const frozenReceipt = JSON.stringify([...b.receipts]);
    const retry = await b.store.create(principal, tenant, input);
    expect(retry).toEqual(first); expect(retry.document).toMatchObject({ creatorUserId: user });
    expect(JSON.stringify([...b.receipts])).toBe(frozenReceipt); expect(b.documents).toHaveLength(1);
    await expect(b.store.create(principal, tenant, { ...input, title: 'Changed' })).rejects.toMatchObject({ status: 409 });
    expect(b.documents).toHaveLength(1);
  });
  it('a new independent copy gets the current user and a distinct identity without altering the source', async () => {
    const b = boundary(); const original = await b.store.create(principal, tenant, input);
    b.setIdentity(other);
    const copy = await b.store.create({ ...principal, subject: 'other-authenticated-user' }, tenant,
      { ...input, idempotencyKey: 'independent-copy' });
    expect(copy.document).toMatchObject({ creatorUserId: other });
    expect(copy.document.documentId).not.toBe(original.document.documentId);
    expect(original.document).toMatchObject({ creatorUserId: user });
    expect(copy.snapshotText).toBe(original.snapshotText);
  });
  it('a genuine Note page copy changes only its native self identity and attributes the copying person', async () => {
    const b = boundary();
    const note = { format: 'barocss-note', version: 1, document: { stype: 'note',
      attributes: { title: 'Plan', pageId: 'source-page' }, content: [
        { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Rich original', marks: [{ stype: 'bold', range: [0, 4] }] }] },
        { stype: 'paragraph', content: [{ stype: 'pageReference', attributes: { pageId: 'source-page' } },
          { stype: 'pageReference', attributes: { pageId: 'other-page' } }] },
      ] } };
    const snapshotText = JSON.stringify(note);
    b.setIdentity(other);
    const copyInput: CreateDocumentInput = { ...input, product: 'note', fileFormat: 'barocss-note',
      snapshotText, importMode: 'new-page-copy', idempotencyKey: 'note-copy' };
    const copy = await b.store.create({ ...principal, subject: 'copying-person' }, tenant, copyInput);
    expect(copy.document.creatorUserId).toBe(other);
    expect(copy.document.pageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(copy.document.pageId).not.toBe('source-page');
    const expected = structuredClone(note);
    expected.document.attributes.pageId = copy.document.pageId!;
    const selfReference = expected.document.content[1].content[0];
    if (!('attributes' in selfReference)) throw new Error('missing_self_reference');
    selfReference.attributes!.pageId = copy.document.pageId!;
    expect(JSON.parse(copy.snapshotText!)).toEqual(expected);
    expect(JSON.stringify(note)).toBe(snapshotText);
    expect(await b.store.create({ ...principal, subject: 'copying-person' }, tenant, copyInput)).toEqual(copy);
    expect(b.documents).toHaveLength(1);
  });
  it('authorized viewers read legacy Unknown and attributed originals without acquiring write authority', async () => {
    const b = boundary(); const original = await b.store.create(principal, tenant, input);
    b.setRole('viewer'); b.setIdentity(other);
    expect((await b.store.list({ ...principal, subject: 'viewing-person' }, tenant)).documents[0].creatorUserId).toBe(user);
    expect((await b.store.open({ ...principal, subject: 'viewing-person' }, tenant, original.document.documentId)).document.creatorUserId).toBe(user);
    delete b.documents[0].creator_user_id;
    expect((await b.store.list(principal, tenant)).documents[0].creatorUserId).toBeNull();
    expect((await b.store.open(principal, tenant, original.document.documentId)).document.creatorUserId).toBeNull();
    b.revoke();
    await expect(b.store.list(principal, tenant)).rejects.toBeInstanceOf(TenantAccessDeniedError);
  });
  it('creator status never permits viewer writes or a revoked current membership', async () => {
    const b = boundary(); b.setRole('viewer');
    await expect(b.store.create(principal, tenant, input)).rejects.toMatchObject({ status: 403 });
    expect(b.documents).toEqual([]); expect(b.receipts.size).toBe(0); expect(b.query).not.toHaveBeenCalled();
    b.setRole('owner'); b.revoke();
    await expect(b.store.create(principal, tenant, input)).rejects.toBeInstanceOf(TenantAccessDeniedError);
    expect(b.query).not.toHaveBeenCalled();
  });
  it('a failed workspace check inserts no attributed original', async () => {
    const b = boundary(); b.missingWorkspace();
    await expect(b.store.create(principal, tenant, input)).rejects.toMatchObject({ status: 404 });
    expect(b.documents).toEqual([]);
  });
  it('legacy create receipts stay Unknown without rewriting fixed receipt data', async () => {
    const b = boundary(); await b.store.create(principal, tenant, input);
    for (const receipt of b.receipts.values()) delete (receipt.result_head as Record<string, unknown>).creatorUserId;
    const frozen = JSON.stringify([...b.receipts]);
    const retry = await b.store.create(principal, tenant, input);
    expect(retry.document).toMatchObject({ creatorUserId: null });
    const read = await b.store.getReceipt(principal, tenant, 'create', input.idempotencyKey);
    expect(read.document).toMatchObject({ creatorUserId: null });
    expect(JSON.stringify([...b.receipts])).toBe(frozen);
  });
});
