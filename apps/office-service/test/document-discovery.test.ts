import { afterEach, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { DocumentStore, type DocumentHead } from '../src/document-store.js';
import { MembershipStore, TenantAccessDeniedError } from '../src/membership-store.js';

const tenant = '11111111-1111-4111-8111-111111111111', workspace = '22222222-2222-4222-8222-222222222222';
const id = (i: number) => `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`;
const principal = { issuer: 'https://controlled.example', subject: 'current-member' };
// Independent metadata-only expectations. They are not registered native bodies or genuine PG evidence.
const header = (i: number, fileVersion = 1): DocumentHead => ({ documentId: id(i), tenantId: tenant, workspaceId: workspace,
  product: 'note', title: fileVersion === 1 ? 'Independent editable source S' : `Native metadata ${i}`,
  creatorUserId: null, metadataRevision: 1, mode: 'snapshot', pageId: fileVersion === 1 ? id(i) : `native2-page-${i}`,
  documentKey: `wonffice-${tenant}-${id(i)}`, fileFormat: 'barocss-note', fileVersion, revision: i, snapshotHash: String(i % 10).repeat(64) });
function boundary(heads: DocumentHead[], denied = false) {
  const query = vi.fn(async (sql: string, _values: unknown[] = []) => {
    if (!sql.includes('SELECT d.id AS') || !sql.includes('ORDER BY d.id LIMIT 51')) throw new Error('unexpected_discovery_query');
    return { rows: heads, rowCount: heads.length };
  });
  const client = { query } as unknown as PoolClient;
  const authorize = vi.spyOn(MembershipStore.prototype, 'withAuthorizedTenant').mockImplementation(async (who, scope, operation) => {
    expect(who).toBe(principal); expect(scope).toBe(tenant);
    if (denied) throw new TenantAccessDeniedError();
    return operation(client, 'viewer');
  });
  return { query, authorize, store: new DocumentStore({} as Pool) };
}
afterEach(() => vi.restoreAllMocks());

it('discovers complete mixed metadata without reading native bodies, definitions or receipts', async () => {
  const heads = [header(1), header(2, 2), { ...header(3, 2), mode: 'initializing' as const },
    { ...header(4, 2), mode: 'collaborative' as const }];
  const before = JSON.stringify(heads), b = boundary(heads);
  expect(await b.store.list(principal, tenant, { workspaceId: workspace })).toEqual({ documents: heads, nextCursor: null });
  expect(b.query).toHaveBeenCalledTimes(1);
  const [sql, values] = b.query.mock.calls[0];
  expect(sql).not.toMatch(/snapshot_text|schema_versions|schema_dependencies|document_receipts|INSERT|UPDATE/);
  expect(values).toEqual([tenant, workspace, null, null]);
  expect(JSON.stringify(heads)).toBe(before);
});
it('keeps the exact original filter and cursor query with mixed native versions', async () => {
  const b = boundary([header(2, 2)]);
  expect((await b.store.list(principal, tenant, { workspaceId: workspace, product: 'note', after: id(1) })).documents).toEqual([header(2, 2)]);
  expect(b.query).toHaveBeenCalledWith(expect.stringContaining('d.workspace_id = $2::uuid'), [tenant, workspace, 'note', id(1)]);
});
it('retains bounded pagination without dropping native2 rows or changing the cursor', async () => {
  const heads = Array.from({ length: 51 }, (_, i) => header(i + 1, i % 2 ? 2 : 1)), b = boundary(heads);
  const result = await b.store.list(principal, tenant);
  expect(result).toEqual({ documents: heads.slice(0, 50), nextCursor: id(50) });
});
it.each([0, 3])('does not invent metadata support for Note file version %s', async version => {
  const b = boundary([header(1), header(2, version)]);
  await expect(b.store.list(principal, tenant)).rejects.toMatchObject(version === 0 ? { message: 'missing_document_snapshot' } : { status: 422, reason: 'unsupported_native_format' });
});
it('refuses a native2 metadata format mismatch without exposing an apparently supported row', async () => {
  const b = boundary([{ ...header(2, 2), fileFormat: 'foreign-note-format' }]);
  await expect(b.store.list(principal, tenant)).rejects.toMatchObject({ status: 422, reason: 'unsupported_native_format' });
});
it('denied current membership returns no catalog or query even if native metadata exists', async () => {
  const b = boundary([header(1), header(2, 2)], true);
  await expect(b.store.list(principal, tenant)).rejects.toBeInstanceOf(TenantAccessDeniedError);
  expect(b.query).not.toHaveBeenCalled();
});
it('invalid requested scope refuses before authorization or metadata queries', async () => {
  const b = boundary([header(1), header(2, 2)]);
  await expect(b.store.list(principal, tenant, { workspaceId: 'not-a-uuid' })).rejects.toMatchObject({ status: 400 });
  expect(b.authorize).not.toHaveBeenCalled(); expect(b.query).not.toHaveBeenCalled();
});
