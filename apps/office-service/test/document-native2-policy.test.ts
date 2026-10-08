import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { readNoteSnapshotFile, readNoteV1SnapshotFile } from '@barocss/office-note-file';
import { DocumentStore, type DocumentHead, type DocumentStoreOptions, type UpdateSnapshotInput, type ValidateNative2Input } from '../src/document-store.js';
import { MembershipStore, type TenantRole } from '../src/membership-store.js';
import { admitDocumentSchemaBundle, currentSchemaActor, SchemaRegistryError, type CurrentSchemaActor } from '../src/schema-registry-store.js';

// Independently authored full literal/canonical texts, not product-generated or imported from frozen tests.
const originalFile = {
  "format": "barocss-note",
  "version": 2,
  "savedAt": "independent policy fixture / Café",
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 1,
        "digest": "9dad15d4e80cef80dbf932c8c35e568a2f0438fa8e143b859906a665e74a8f5e"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "9dad15d4e80cef80dbf932c8c35e568a2f0438fa8e143b859906a665e74a8f5e"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 1,\n      \"digest\": \"7e5bac0f34a1effb7ac5d00868aa57bec6cd1d46e3af6a4540b04527db38716c\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"Tasks\",\n    \"fields\": [\n      {\n        \"name\": \"Title\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
      },
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 1,
          "digest": "7e5bac0f34a1effb7ac5d00868aa57bec6cd1d46e3af6a4540b04527db38716c"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"Notes\",\n    \"fields\": [\n      {\n        \"name\": \"Note\",\n        \"kind\": \"text\"\n      }\n    ]\n  }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "attributes": {
      "pageId": "native-policy-page",
      "title": "Controlled document",
      "nullableExtra": null
    },
    "content": [
      {
        "stype": "paragraph",
        "attributes": {
          "align": "left",
          "extra": [
            "Café",
            null,
            false
          ]
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "Independent content Café",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  11
                ]
              }
            ]
          }
        ]
      }
    ],
    "metadata": {
      "source": "independently authored",
      "opaque": {
        "omittedIsDifferent": null
      }
    }
  }
};
const definitionRows = [
  {
    "reference": {
      "schemaId": "11111111-1111-1111-1111-111111111111",
      "version": 1,
      "digest": "9dad15d4e80cef80dbf932c8c35e568a2f0438fa8e143b859906a665e74a8f5e"
    },
    "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 1,\n      \"digest\": \"7e5bac0f34a1effb7ac5d00868aa57bec6cd1d46e3af6a4540b04527db38716c\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"Tasks\",\n    \"fields\": [\n      {\n        \"name\": \"Title\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n",
    "canonicalText": "{\"dataset\":{\"fields\":[{\"kind\":\"text\",\"label\":\"Café\",\"name\":\"Title\"}],\"name\":\"Tasks\"},\"dependencies\":[{\"digest\":\"7e5bac0f34a1effb7ac5d00868aa57bec6cd1d46e3af6a4540b04527db38716c\",\"schemaId\":\"22222222-2222-2222-2222-222222222222\",\"version\":1}],\"dialect\":\"wonffice.note-fields.v1\",\"parent\":null,\"requiredCapabilities\":[\"note.field.text.v1\"],\"schemaId\":\"11111111-1111-1111-1111-111111111111\",\"scope\":{\"tenantId\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\"workspaceId\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"},\"version\":1}"
  },
  {
    "reference": {
      "schemaId": "22222222-2222-2222-2222-222222222222",
      "version": 1,
      "digest": "7e5bac0f34a1effb7ac5d00868aa57bec6cd1d46e3af6a4540b04527db38716c"
    },
    "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"Notes\",\n    \"fields\": [\n      {\n        \"name\": \"Note\",\n        \"kind\": \"text\"\n      }\n    ]\n  }\n}\n",
    "canonicalText": "{\"dataset\":{\"fields\":[{\"kind\":\"text\",\"name\":\"Note\"}],\"name\":\"Notes\"},\"dependencies\":[],\"dialect\":\"wonffice.note-fields.v1\",\"parent\":null,\"requiredCapabilities\":[\"note.field.text.v1\"],\"schemaId\":\"22222222-2222-2222-2222-222222222222\",\"scope\":{\"tenantId\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\"workspaceId\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"},\"version\":1}"
  }
];
const tenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspace = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const doc = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', writer = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const principal = { issuer: 'https://policy.example', subject: 'writer' };
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const textOf = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const raw = textOf(originalFile);
const policy = (): DocumentStoreOptions => ({ noteSchemaPolicy: [{ tenantId: tenant, workspaceId: workspace,
  readRoles: ['editor'], preserveRoles: ['editor'], adoptRoles: ['editor'], capabilities: ['note.field.text.v1'] }] });
const pins = (file = originalFile) => sha(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenant, workspace, doc, 'pinned',
  file.schemaBundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest])]));
const attempt = (source = raw, selected = pins(), overrides: Partial<UpdateSnapshotInput> = {}): UpdateSnapshotInput => ({
  expectedRevision: 1, expectedSnapshotHash: sha(source), expectedPriorPinDigest: selected, schemaAction: 'preserve', snapshotText: source,
  idempotencyKey: 'policy-fixed-request', ...overrides });
function codecValid(text: string) { expect(readNoteSnapshotFile(text), 'Independent fixture must pass aware codec before store predicate').not.toHaveProperty('error'); }
function str(value: unknown): string { if (typeof value !== 'string') throw new Error('policy_ledger_string'); return value; }
function num(value: unknown): number { if (typeof value !== 'number') throw new Error('policy_ledger_number'); return value; }
type HeadRow = DocumentHead & { snapshotText: string };
type ReceiptRow = { document_id: string | null; request_hash: string; result_head: (DocumentHead & { _noteSchemaReceiptV1?: unknown }) | null; result_snapshot_text: string | null };
/** Controlled journal through actual source stores/withTenant. Not PostgreSQL/RLS/concurrency evidence. */
function fixture(opts: DocumentStoreOptions | undefined = policy(), file = originalFile) {
  const input = textOf(file);
  let committed = { rows: new Map<string, HeadRow>([[doc, { documentId: doc, tenantId: tenant, workspaceId: workspace, product: 'note', title: 'Controlled document',
    creatorUserId: writer, metadataRevision: 1, mode: 'snapshot', pageId: 'native-policy-page', documentKey: `wonffice-${tenant}-${doc}`,
    fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: sha(input), snapshotText: input }]]), receipts: new Map<string, ReceiptRow>() };
  const roleState: { role: TenantRole; epoch: string } = { role: 'editor', epoch: 'editor:4' };
  const registry = new Map(definitionRows.map(entry => [entry.reference.schemaId, { schema_id: entry.reference.schemaId, version: entry.reference.version,
    digest: entry.reference.digest, definition_text: entry.definitionText, canonical_text: entry.canonicalText, actor_identity_id: writer, created_at: new Date('2026-10-01T00:00:00Z') }]));
  let edgeTampered = false;
  let onVersionRead: (() => void) | undefined;
  const keyOf = (params: readonly unknown[]) => JSON.stringify(params.slice(0, 4));
  const pool = { connect: async () => {
    let working: typeof committed | undefined;
    const state = () => { if (!working) throw new Error('policy_query_outside_transaction'); return working; };
    const rows = (data: unknown[]) => ({ rows: data, rowCount: data.length });
    const query = async (sql: string, params: readonly unknown[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s === 'BEGIN') { working = structuredClone(committed); return rows([]); }
      if (s === 'COMMIT') { committed = state(); working = undefined; return rows([]); }
      if (s === 'ROLLBACK') { working = undefined; return rows([]); }
      if (s.startsWith('SET LOCAL') || s.startsWith('SELECT set_config(')) return rows([]);
      if (s.includes('current_user')) return rows([{ safe: true, context_empty: true }]);
      const w = state();
      if (s.includes('FROM wonffice.tenant_memberships')) return rows([{ role: roleState.role }]);
      if (s.includes('project_current_actor(')) return rows([{ id: writer, role: roleState.role }]);
      if (s.includes('project_execution_actor_epoch(')) return rows([{ epoch: roleState.epoch }]);
      if (s.includes('SELECT id FROM wonffice.identities')) return rows([{ id: writer }]);
      if (s.includes('SELECT 1 FROM wonffice.workspaces')) return rows([{}]);
      if (s.includes('FROM wonffice.schema_versions')) {
        onVersionRead?.(); onVersionRead = undefined;
        const found = registry.get(str(params[2])); return rows(found && found.version === params[3] && params[0] === tenant && params[1] === workspace ? [structuredClone(found)] : []);
      }
      if (s.includes('FROM wonffice.schema_dependencies')) {
        const found = registry.get(str(params[2])); if (!found) return rows([]);
        const d = JSON.parse(found.definition_text) as { parent: null | { schemaId: string; version: number; digest: string }; dependencies: { schemaId: string; version: number; digest: string }[] };
        return rows([...(d.parent ? [{ kind: 'parent', ref: d.parent }] : []), ...d.dependencies.map(ref => ({ kind: 'dependency', ref }))].map((e, ordinal) => ({
          kind: e.kind, dependency_id: e.ref.schemaId, dependency_version: e.ref.version, dependency_digest: edgeTampered ? '0'.repeat(64) : e.ref.digest, ordinal })));
      }
      if (s.includes('INSERT INTO wonffice.document_receipts')) {
        const key = keyOf(params); if (w.receipts.has(key)) return rows([]);
        w.receipts.set(key, { document_id: null, request_hash: str(params[4]), result_head: null, result_snapshot_text: null }); return rows([{}]);
      }
      if (s.includes('SELECT r.request_hash')) {
        const found = w.receipts.get(keyOf(params)); return rows(found?.document_id ? [{ ...structuredClone(found), current_mode: w.rows.get(found.document_id)?.mode }] : []);
      }
      if (s.includes('UPDATE wonffice.document_receipts')) {
        const found = w.receipts.get(keyOf(params)); if (!found) return rows([]);
        found.document_id = str(params[4]); found.result_head = JSON.parse(str(params[5])) as DocumentHead; found.result_snapshot_text = params[6] === null ? null : str(params[6]); return rows([{}]);
      }
      if (s.includes('INSERT INTO wonffice.documents')) {
        const id = str(params[1]); w.rows.set(id, { documentId: id, tenantId: tenant, workspaceId: workspace, product: 'note', title: str(params[4]), creatorUserId: writer,
          pageId: str(params[5]), documentKey: str(params[6]), metadataRevision: 1, mode: 'snapshot', fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: '', snapshotText: '' }); return rows([]);
      }
      if (s.includes('INSERT INTO wonffice.document_snapshots')) {
        const row = w.rows.get(str(params[1])); if (!row) throw new Error('policy_snapshot_missing');
        Object.assign(row, { fileFormat: str(params[2]), fileVersion: num(params[3]), snapshotText: str(params[4]), snapshotHash: str(params[5]) }); return rows([]);
      }
      if (s.includes('UPDATE wonffice.document_snapshots')) {
        const row = w.rows.get(str(params[1])); if (!row) return rows([]);
        Object.assign(row, { snapshotText: str(params[2]), snapshotHash: str(params[3]), fileVersion: num(params[4]), revision: row.revision + 1 }); return rows([{}]);
      }
      if (s.includes('UPDATE wonffice.documents SET updated_at')) return rows([{}]);
      if (s.includes('SELECT d.id AS')) return rows(s.includes('ORDER BY d.id') ? [...w.rows.values()].map(row => structuredClone(row)) :
        w.rows.has(str(params[1])) ? [structuredClone(w.rows.get(str(params[1])))] : []);
      throw new Error(`policy_unhandled_sql:${s}`);
    };
    return { query, release() {} } as unknown as PoolClient;
  } } as unknown as Pool;
  return { store: new DocumentStore(pool, opts), pool, registry, roleState,
    state: () => JSON.stringify({ rows: [...committed.rows], receipts: [...committed.receipts] }),
    row: () => committed.rows.get(doc)!, onNextVersionRead: (effect: () => void) => { onVersionRead = effect; }, seedMetadata: () => {
      const head = { ...committed.rows.get(doc)! };
      Reflect.deleteProperty(head, 'snapshotText'); // metadata receipts intentionally carry no snapshot body
      committed.receipts.set(JSON.stringify([tenant, writer, 'metadata', 'historical-metadata2']), { document_id: doc, request_hash: sha('controlled historical metadata'), result_head: head, result_snapshot_text: null });
    }, receipt: () => [...committed.receipts.values()][0]!, tamperEdge: () => { edgeTampered = true; } };
}
const createInput = { workspaceId: workspace, product: 'note' as const, title: 'Independent copy', fileFormat: 'barocss-note', fileVersion: 2,
  snapshotText: raw, importMode: 'new-page-copy' as const, idempotencyKey: 'new-policy-copy' };

describe('strict native2 service policy and preservation boundaries', () => {
  it.each(['absent', 'empty'] as const)('keeps native2 closed under %s trusted policy', async kind => {
    codecValid(raw); const f = fixture(kind === 'absent' ? undefined : { noteSchemaPolicy: [] }), before = f.state();
    // undefined must exercise the actual default constructor rather than the fixture's convenience default.
    const store = kind === 'absent' ? new DocumentStore(f.pool) : f.store;
    await expect(store.create(principal, tenant, createInput)).rejects.toMatchObject({ status: 403, reason: 'scope_forbidden' });
    await expect(store.updateSnapshot(principal, tenant, doc, attempt())).rejects.toMatchObject({ status: 403, reason: 'scope_forbidden' });
    await expect(store.open(principal, tenant, doc)).rejects.toMatchObject({ status: 403, reason: 'scope_forbidden' }); expect(f.state()).toBe(before);
  });
  it('keeps register-only grants distinct from document adoption', async () => {
    codecValid(raw); const opts = policy(); opts.noteSchemaPolicy = [{ ...opts.noteSchemaPolicy![0], adoptRoles: [] }];
    const f = fixture(opts), before = f.state(), body = { ...attempt(), schemaAction: 'adopt' as const, registerRoles: ['editor'], approved: true };
    await expect(f.store.updateSnapshot(principal, tenant, doc, body)).rejects.toMatchObject({ status: 403, reason: 'scope_forbidden' }); expect(f.state()).toBe(before);
  });
  it('allows explicitly configured viewer reads without granting writes', async () => {
    codecValid(raw); const opts = policy(); opts.noteSchemaPolicy = [{ ...opts.noteSchemaPolicy![0], readRoles: ['viewer'] }]; const f = fixture(opts); f.roleState.role = 'viewer';
    expect((await f.store.open(principal, tenant, doc)).snapshotText).toBe(raw);
    const before = f.state(); await expect(f.store.updateSnapshot(principal, tenant, doc, attempt())).rejects.toMatchObject({ status: 403, reason: 'forbidden' }); expect(f.state()).toBe(before);
  });
  it('does not admit a forged body actor even through the shared helper', async () => {
    codecValid(raw); const f = fixture();
    await new MembershipStore(f.pool).withAuthorizedTenant(principal, tenant, async client => {
      const forged: CurrentSchemaActor = { id: writer, role: 'owner', epoch: 'owner:1' };
      await expect(admitDocumentSchemaBundle(client, { tenantId: tenant, workspaceId: workspace }, originalFile.schemaBundle, forged, 'adopt', policy().noteSchemaPolicy!)).rejects.toBeInstanceOf(SchemaRegistryError);
      const actual = await currentSchemaActor(client, tenant);
      await expect(admitDocumentSchemaBundle(client, { tenantId: tenant, workspaceId: workspace }, originalFile.schemaBundle, actual, 'read', policy().noteSchemaPolicy!)).resolves.toBeUndefined();
    });
  });
  it.each(['preserve', 'adopt'] as const)('rejects rewriting an overlapping immutable definition during %s', async schemaAction => {
    const file = structuredClone(originalFile); file.schemaBundle.definitions[0].definitionText = JSON.stringify(JSON.parse(file.schemaBundle.definitions[0].definitionText));
    const changed = textOf(file); codecValid(changed); const f = fixture(), before = f.state();
    await expect(f.store.updateSnapshot(principal, tenant, doc, attempt(raw, pins(), { schemaAction, snapshotText: changed }))).rejects.toMatchObject({ status: 409, reason: 'schema_pin_conflict' }); expect(f.state()).toBe(before);
  });
  it('rejects reordering selected pins while preserve is claimed', async () => {
    const file = structuredClone(originalFile); file.schemaBundle.selected.push(file.schemaBundle.definitions[1].reference);
    const source = textOf(file); codecValid(source); const changed = structuredClone(file); changed.schemaBundle.selected.reverse(); codecValid(textOf(changed));
    const f = fixture(policy(), file), before = f.state();
    await expect(f.store.updateSnapshot(principal, tenant, doc, attempt(source, pins(file), { snapshotText: textOf(changed) }))).rejects.toMatchObject({ status: 409, reason: 'schema_pin_conflict' }); expect(f.state()).toBe(before);
  });
  it('permits known object key order differences without reserializing exact caller data', async () => {
    const source = structuredClone(originalFile), oldRef = source.schemaBundle.selected[0];
    source.schemaBundle.selected[0] = { digest: oldRef.digest, version: oldRef.version, schemaId: oldRef.schemaId };
    const target = textOf(source) + ' '; codecValid(target); const f = fixture(), body = attempt(raw, pins(), { snapshotText: target });
    const saved = await f.store.updateSnapshot(principal, tenant, doc, body); expect(saved.snapshotText).toBe(target); expect(f.row().snapshotText).toBe(target);
  });
  it('rejects corrupt stored raw/hash and retains the original state', async () => {
    codecValid(raw); const f = fixture(); f.row().snapshotText += ' '; const before = f.state();
    await expect(f.store.updateSnapshot(principal, tenant, doc, attempt())).rejects.toMatchObject({ status: 409, reason: 'snapshot_store_unavailable' }); expect(f.state()).toBe(before);
  });
  it.each(['workspace', 'document', 'page', 'hash', 'tenant', 'version'] as const)('rejects corrupt historical receipt %s binding', async kind => {
    codecValid(raw); const f = fixture(); await f.store.updateSnapshot(principal, tenant, doc, attempt()); const stored = f.receipt().result_head!;
    if (kind === 'workspace') stored.workspaceId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    if (kind === 'document') stored.documentId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    if (kind === 'tenant') stored.tenantId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    if (kind === 'version') { delete stored._noteSchemaReceiptV1; stored.fileVersion = 1; } // compatible unmarked historical row must not bypass body-version admission
    if (kind === 'page') stored.pageId = 'other-page'; if (kind === 'hash') stored.snapshotHash = '0'.repeat(64);
    const before = f.state(); await expect(f.store.getReceipt(principal, tenant, 'update', 'policy-fixed-request')).rejects.toMatchObject({ status: 409 }); expect(f.state()).toBe(before);
  });
  it('keeps private provenance stable on retry and strips it from the public response', async () => {
    codecValid(raw); const f = fixture(), body = attempt(), first = await f.store.updateSnapshot(principal, tenant, doc, body), state = f.state();
    expect(first.document).not.toHaveProperty('_noteSchemaReceiptV1');
    expect(f.receipt().result_head!._noteSchemaReceiptV1).toMatchObject({ version: 1, actorId: writer, action: 'preserve', authorityEpoch: 'editor:4', requestDomain: 'note-native2-snapshot-v1' });
    f.roleState.epoch = 'editor:9'; expect(await f.store.updateSnapshot(principal, tenant, doc, body)).toEqual(first); expect(f.state()).toBe(state);
    expect(await f.store.getReceipt(principal, tenant, 'update', body.idempotencyKey)).toEqual(first); expect(f.state()).toBe(state);
  });
  it('keeps compatible unmarked historical provenance unknown and rejects a forged marker', async () => {
    codecValid(raw); const f = fixture(), body = attempt(), first = await f.store.updateSnapshot(principal, tenant, doc, body);
    delete f.receipt().result_head!._noteSchemaReceiptV1; const state = f.state();
    expect(await f.store.getReceipt(principal, tenant, 'update', body.idempotencyKey)).toEqual(first); expect(f.state()).toBe(state);
    f.receipt().result_head!._noteSchemaReceiptV1 = { version: 1, actorId: 'foreign', action: 'adopt', authorityEpoch: 'owner:1', requestDomain: 'note-native2-snapshot-v1' };
    await expect(f.store.getReceipt(principal, tenant, 'update', body.idempotencyKey)).rejects.toMatchObject({ status: 409, reason: 'receipt_unavailable' });
  });
  it.each(['missing', 'edge'] as const)('refuses %s registered dependency information', async kind => {
    codecValid(raw); const f = fixture(), before = f.state(); if (kind === 'missing') f.registry.delete(definitionRows[1].reference.schemaId); else f.tamperEdge();
    await expect(f.store.updateSnapshot(principal, tenant, doc, attempt())).rejects.toMatchObject({ status: kind === 'missing' ? 422 : 409, reason: kind === 'missing' ? 'dependency_missing' : 'bundle_incomplete' }); expect(f.state()).toBe(before);
  });
  it('keeps unaware2 listing/metadata explicit and leaves snapshots untouched', async () => {
    codecValid(raw); const f = fixture(), before = f.state();
    await expect(f.store.list(principal, tenant)).rejects.toMatchObject({ status: 422, reason: 'unsupported_native_format' });
    await expect(f.store.updateMetadata(principal, tenant, doc, { expectedMetadataRevision: 1, title: 'Changed', idempotencyKey: 'metadata2' })).rejects.toMatchObject({ status: 422, reason: 'unsupported_native_format' }); expect(f.state()).toBe(before);
  });
  it.each(['initializing', 'collaborative'] as const)('keeps native2 open closed in %s mode', async mode => {
    codecValid(raw); const f = fixture(); f.row().mode = mode; const before = f.state();
    await expect(f.store.open(principal, tenant, doc)).rejects.toMatchObject({ status: 409, reason: 'mode_conflict' }); expect(f.state()).toBe(before);
  });
  it('refuses unsupported native kind/mark/version without changing preserved data', async () => {
    codecValid(raw); expect(readNoteV1SnapshotFile(raw)).toHaveProperty('error'); const f = fixture(), before = f.state();
    const mark = structuredClone(originalFile); mark.document.content[0].content[0].marks[0].stype = 'untrusted-mark';
    expect(readNoteSnapshotFile(textOf(mark))).toHaveProperty('error');
    await expect(f.store.create(principal, tenant, { ...createInput, snapshotText: textOf(mark) })).rejects.toMatchObject({ status: 422, reason: 'invalid_snapshot' });
    await expect(f.store.create(principal, tenant, { ...createInput, fileVersion: 3 })).rejects.toMatchObject({ status: 422, reason: 'invalid_document_format' }); expect(f.state()).toBe(before);
  });
});

// Additional strict malformed and unavailable-history predicates, independent of the frozen creator journal.
describe('native2 policy malformed data and unavailable history', () => {
  it('rechecks default-closed policy on a genuine completed controlled receipt', async () => {
    codecValid(raw); const f = fixture(), body = attempt(); await f.store.updateSnapshot(principal, tenant, doc, body); const before = f.state();
    await expect(new DocumentStore(f.pool).getReceipt(principal, tenant, 'update', body.idempotencyKey)).rejects.toMatchObject({ status: 403, reason: 'scope_forbidden' }); expect(f.state()).toBe(before);
  });
  it('does not invent a historical bundle for unsupported native2 metadata receipts', async () => {
    codecValid(raw); const f = fixture(); f.seedMetadata(); const before = f.state();
    await expect(f.store.getReceipt(principal, tenant, 'metadata', 'historical-metadata2')).rejects.toMatchObject({ status: 422, reason: 'unsupported_native_format' }); expect(f.state()).toBe(before);
  });
  it.each(['cycle', 'limit', 'kind'] as const)('rejects %s declarative data before publication', async kind => {
    const file = structuredClone(originalFile);
    if (kind === 'cycle') {
      const leaf = JSON.parse(file.schemaBundle.definitions[1].definitionText) as { dependencies: typeof file.schemaBundle.selected };
      leaf.dependencies.push(file.schemaBundle.selected[0]); file.schemaBundle.definitions[1].definitionText = JSON.stringify(leaf);
    } else if (kind === 'limit') {
      while (file.schemaBundle.definitions.length <= 128) file.schemaBundle.definitions.push(structuredClone(file.schemaBundle.definitions[0]));
    } else {
      const main = JSON.parse(file.schemaBundle.definitions[0].definitionText) as { dataset: { fields: { kind: string }[] } };
      main.dataset.fields[0].kind = 'executable'; file.schemaBundle.definitions[0].definitionText = JSON.stringify(main);
    }
    expect(readNoteSnapshotFile(textOf(file))).toHaveProperty('error'); const f = fixture(), before = f.state();
    await expect(f.store.create(principal, tenant, { ...createInput, snapshotText: textOf(file) })).rejects.toMatchObject({ status: 422, reason: 'invalid_snapshot' }); expect(f.state()).toBe(before);
  });
});

describe('read-only native2 structural validation on one current head', () => {
  const documentInput = (): ValidateNative2Input => ({ kind: 'document', expectedRevision: 1,
    expectedSnapshotHash: sha(raw), expectedPriorPinDigest: pins() });
  const candidateInput = (snapshotText: string, intendedAction: 'preserve' | 'adopt' = 'preserve'): ValidateNative2Input =>
    ({ ...documentInput(), kind: 'candidate', snapshotText, intendedAction });

  it('checks the stored native2 file and registered closure without any document or receipt effect', async () => {
    const f = fixture(), before = f.state();
    expect(await f.store.validateNative2(principal, tenant, doc, documentInput())).toEqual({
      status: 'structurally_valid', kind: 'document', documentId: doc, documentRevision: 1,
      snapshotHash: sha(raw), priorPinDigest: pins(),
      checks: ['current_authority', 'current_source', 'native2_file', 'registered_bundle', 'source_preconditions'] });
    expect(f.state()).toBe(before);
  });

  it('checks an exact raw candidate and reports only structural readiness, without saving it', async () => {
    const file = structuredClone(originalFile), changed = textOf(file);
    file.document.content[0].content[0].text = 'Candidate source retained';
    const candidate = textOf(file), f = fixture(), before = f.state();
    codecValid(candidate);
    expect(await f.store.validateNative2(principal, tenant, doc, candidateInput(candidate))).toEqual({
      status: 'structurally_valid', kind: 'candidate', documentId: doc, documentRevision: 1,
      snapshotHash: sha(raw), priorPinDigest: pins(), candidateSnapshotHash: sha(candidate), action: 'preserve',
      checks: ['current_authority', 'current_source', 'native2_file', 'registered_bundle', 'source_preconditions',
        'candidate_file', 'candidate_registered_bundle', 'candidate_action_policy', 'pin_transition'] });
    expect(changed).not.toBe(candidate); expect(f.state()).toBe(before);
  });

  it('rejects stale revision, raw hash and prior pins before candidate success', async () => {
    const f = fixture(), before = f.state();
    for (const [input, reason] of [
      [{ ...documentInput(), expectedRevision: 2 }, 'revision_conflict'],
      [{ ...documentInput(), expectedSnapshotHash: '0'.repeat(64) }, 'snapshot_hash_conflict'],
      [{ ...documentInput(), expectedPriorPinDigest: '0'.repeat(64) }, 'schema_pin_conflict'],
    ] as const) await expect(f.store.validateNative2(principal, tenant, doc, input)).rejects.toMatchObject({ status: 409, reason });
    expect(f.state()).toBe(before);
  });

  it('requires write authority and action policy for a candidate, while an allowed viewer can validate the stored source', async () => {
    const opts = policy(); opts.noteSchemaPolicy = [{ ...opts.noteSchemaPolicy![0], readRoles: ['editor', 'viewer'], adoptRoles: [] }];
    const f = fixture(opts), before = f.state();
    await expect(f.store.validateNative2(principal, tenant, doc, candidateInput(raw, 'adopt'))).rejects.toMatchObject({ status: 403, reason: 'scope_forbidden' });
    f.roleState.role = 'viewer';
    await expect(f.store.validateNative2(principal, tenant, doc, documentInput())).resolves.toMatchObject({ status: 'structurally_valid', kind: 'document' });
    await expect(f.store.validateNative2(principal, tenant, doc, candidateInput(raw))).rejects.toMatchObject({ status: 403, reason: 'forbidden' });
    expect(f.state()).toBe(before);
  });

  it('refuses a held validation after the current actor changes during registry admission', async () => {
    const f = fixture(), before = f.state();
    f.onNextVersionRead(() => { f.roleState.role = 'viewer'; f.roleState.epoch = 'viewer:5'; });
    await expect(f.store.validateNative2(principal, tenant, doc, documentInput())).rejects.toMatchObject({ status: 403, reason: 'scope_forbidden' });
    expect(f.state()).toBe(before);
  });

  it('refuses bad candidates, changed immutable definition text and preserve-to-adopt pin changes without effects', async () => {
    const f = fixture(), before = f.state();
    const wrongPage = structuredClone(originalFile); wrongPage.document.attributes.pageId = 'foreign-page';
    await expect(f.store.validateNative2(principal, tenant, doc, candidateInput(textOf(wrongPage)))).rejects.toMatchObject({ status: 422, reason: 'invalid_page_id' });
    const changedDefinition = structuredClone(originalFile);
    changedDefinition.schemaBundle.definitions[0].definitionText = JSON.stringify(JSON.parse(changedDefinition.schemaBundle.definitions[0].definitionText));
    await expect(f.store.validateNative2(principal, tenant, doc, candidateInput(textOf(changedDefinition)))).rejects.toMatchObject({ status: 409, reason: 'schema_pin_conflict' });
    const changedPins = structuredClone(originalFile); changedPins.schemaBundle.selected.push(changedPins.schemaBundle.definitions[1].reference);
    await expect(f.store.validateNative2(principal, tenant, doc, candidateInput(textOf(changedPins)))).rejects.toMatchObject({ status: 409, reason: 'schema_pin_conflict' });
    await expect(f.store.validateNative2(principal, tenant, doc, candidateInput(textOf(changedPins), 'adopt'))).resolves.toMatchObject({
      status: 'structurally_valid', kind: 'candidate', action: 'adopt', candidateSnapshotHash: sha(textOf(changedPins)) });
    expect(f.state()).toBe(before);
  });
});
