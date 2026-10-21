import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { readNoteSnapshotFile } from '@barocss/office-note-file';
import { ProjectError, ProjectStore, type ProjectRecord } from '../src/project-store.js';
import type { DocumentSchemaScopePolicy } from '../src/schema-registry-store.js';

// Reuse the complete independently declared original native2 policy corpus and
// authoritative canonical rows; no product serializer generates this oracle.
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
const doc = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', actorId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const projectId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', pinId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const principal = { issuer: 'https://policy.example', subject: 'writer' };
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const raw = JSON.stringify(originalFile, null, 2) + '\n';
const policy = (): DocumentSchemaScopePolicy[] => [{ tenantId: tenant, workspaceId: workspace,
  readRoles: ['editor'], preserveRoles: ['editor'], adoptRoles: ['editor'], capabilities: ['note.field.text.v1'] }];
/** Actual membership/schema/source methods, controlled SQL responses. No PG/RLS proof. */
function fixture(policies: DocumentSchemaScopePolicy[] | undefined = policy()) {
  let role = 'editor', epoch = 'editor:4', active = false, connects = 0;
  let onSchemaRead: (() => void) | undefined;
  const trace: string[] = [];
  const current = { id: doc, product: 'note', title: 'Complete original', mode: 'snapshot', file_format: 'barocss-note',
    file_version: 2, page_id: 'native-policy-page', revision: 2, snapshot_hash: sha(raw), snapshot_text: raw };
  const historical = { document_id: doc, snapshot_revision: 1, snapshot_hash: sha(raw), snapshot_text: raw,
    source_title: 'Historical original', source_product: 'note' };
  const record: ProjectRecord = { id: projectId, title: 'Read policy', goal: 'Preserve complete sources', archived: false,
    results: [{ id: projectId, name: 'A', document: { product: 'note', id: doc }, inputs: [] }], comments: [], works: [], activities: [], drafts: {} };
  const versions = new Map(definitionRows.map(e => [e.reference.schemaId, { schema_id: e.reference.schemaId,
    version: e.reference.version, digest: e.reference.digest, definition_text: e.definitionText,
    canonical_text: e.canonicalText, actor_identity_id: actorId, created_at: new Date('2026-10-01T00:00:00Z') }]));
  const rows = (value: unknown[]) => ({ rows: value, rowCount: value.length });
  const client = { query: async (text: string, params: readonly unknown[] = []) => {
    const sql = text.replace(/\s+/g, ' ').trim(); trace.push(sql);
    if (sql === 'BEGIN') { if (active) throw new Error('nested_transaction'); active = true; return rows([]); }
    if (sql === 'COMMIT' || sql === 'ROLLBACK') { active = false; return rows([]); }
    if (sql.startsWith('SET LOCAL') || sql.startsWith('SELECT set_config(')) return rows([]);
    if (!active) throw new Error('outside_project_transaction');
    if (sql.includes('current_user')) return rows([{ safe: true, context_empty: true }]);
    if (sql.includes('xmin::text')) return rows([{ version: 'same-client-lifetime' }]);
    if (sql.includes('FROM wonffice.tenant_memberships')) return rows([{ role }]);
    if (sql.includes('project_current_actor(')) return rows([{ id: actorId, role }]);
    if (sql.includes('project_execution_actor_epoch(')) return rows([{ epoch }]);
    if (sql.includes('FROM wonffice.projects')) return rows([{ id: projectId, workspace_id: workspace, revision: 1, data: structuredClone(record) }]);
    if (sql.includes('FROM wonffice.documents')) return rows(params[0] === tenant && params[1] === workspace && params[2] === doc ? [structuredClone(current)] : []);
    if (sql.includes('FROM wonffice.project_pins')) return rows([structuredClone(historical)]);
    if (sql.includes('FROM wonffice.schema_versions')) {
      onSchemaRead?.(); onSchemaRead = undefined;
      const value = versions.get(String(params[2])); return rows(value && value.version === params[3] && params[0] === tenant && params[1] === workspace ? [structuredClone(value)] : []);
    }
    if (sql.includes('FROM wonffice.schema_dependencies')) {
      const entry = versions.get(String(params[2])); if (!entry) return rows([]);
      const definition = JSON.parse(entry.definition_text) as { dependencies: Array<{ schemaId: string; version: number; digest: string }> };
      return rows(definition.dependencies.map((ref, ordinal) => ({ kind: 'dependency', dependency_id: ref.schemaId,
        dependency_version: ref.version, dependency_digest: ref.digest, ordinal })));
    }
    throw new Error(`unexpected_project_sql:${sql}`);
  }, release() { if (active) throw new Error('leaked_project_transaction'); } } as unknown as PoolClient;
  const pool = { connect: async () => { connects++; return client; } } as unknown as Pool;
  const store = policies === undefined ? new ProjectStore(pool) : new ProjectStore(pool, { noteSchemaPolicy: policies });
  return { store, pool, current, historical, record, versions, trace, client, connects: () => connects,
    role: (value: string) => { role = value; }, epoch: (value: string) => { epoch = value; },
    onSchemaRead: (fn: () => void) => { onSchemaRead = fn; },
    snapshot: () => JSON.stringify({ current, historical, record, versions: [...versions] }) };
}
describe('native2 Project current and historical admission', () => {
  it.each(['absent', 'empty'] as const)('refuses %s policy before exposing current native2 raw', async kind => {
    expect(readNoteSnapshotFile(raw)).not.toHaveProperty('error');
    const f = fixture([]), before = f.snapshot();
    const store = kind === 'absent' ? new ProjectStore(f.pool) : f.store;
    await expect(store.get(principal, tenant, projectId)).rejects.toMatchObject({ status: 403, reason: 'scope_forbidden' });
    expect(f.snapshot()).toBe(before); expect(f.connects()).toBe(1);
    expect(f.trace.some(sql => /^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
  });
  it('returns the complete original through one client without schema or document writes', async () => {
    const f = fixture(), before = f.snapshot();
    const result = await f.store.withExecutionContext(principal, tenant, projectId, true, async context => {
      expect(context.client).toBe(f.client); expect(context.authorityEpoch).toBe('editor:4:same-client-lifetime');
      return context.document(doc);
    });
    expect(result.snapshot_text).toBe(raw); expect(result.snapshot_hash).toBe(sha(raw));
    expect(f.trace.some(sql => sql.includes('FROM wonffice.schema_versions'))).toBe(true);
    expect(f.trace.filter(sql => sql === 'BEGIN')).toHaveLength(1);
    expect(f.connects()).toBe(1); expect(f.snapshot()).toBe(before);
    expect(f.trace.some(sql => /^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
  });
  it('retains viewer refusal for execution even when read policy explicitly permits viewer', async () => {
    const opts = policy(); opts[0].readRoles = ['viewer']; const f = fixture(opts); f.role('viewer');
    let called = false;
    await expect(f.store.withExecutionContext(principal, tenant, projectId, true, async () => { called = true; }))
      .rejects.toMatchObject({ status: 403, reason: 'forbidden' });
    expect(called).toBe(false);
  });
  it('refuses dependency-capability grants, registered definition conflict and current head mismatch', async () => {
    const denied = fixture([{ ...policy()[0], capabilities: [] }]);
    await expect(denied.store.get(principal, tenant, projectId)).rejects.toMatchObject({ status: 403, reason: 'scope_forbidden' });
    const conflict = fixture(); conflict.versions.get('11111111-1111-1111-1111-111111111111')!.canonical_text = '{}';
    await expect(conflict.store.get(principal, tenant, projectId)).rejects.toBeInstanceOf(ProjectError);
    const wrongHead = fixture(); wrongHead.current.page_id = 'another-page';
    await expect(wrongHead.store.get(principal, tenant, projectId)).rejects.toMatchObject({ status: 409, reason: 'source_conflict' });
  });
  it('rechecks actor epoch after a held registered schema response', async () => {
    const f = fixture(); f.onSchemaRead(() => f.epoch('editor:5'));
    await expect(f.store.get(principal, tenant, projectId)).rejects.toMatchObject({ status: 409, reason: 'authority_changed' });
  });
  it('admit each original historical bundle rather than replacing it by an allowed current bundle', async () => {
    const f = fixture();
    const later = structuredClone(originalFile);
    later.schemaBundle.selected = [later.schemaBundle.definitions[1].reference];
    later.schemaBundle.definitions = [later.schemaBundle.definitions[1]];
    const laterRaw = JSON.stringify(later, null, 2) + '\n';
    expect(readNoteSnapshotFile(laterRaw)).not.toHaveProperty('error');
    f.current.snapshot_text = laterRaw; f.current.snapshot_hash = sha(laterRaw);
    f.versions.delete('11111111-1111-1111-1111-111111111111');
    const before = f.snapshot();
    await expect(f.store.getPin(principal, tenant, projectId, pinId)).rejects.toMatchObject({ status: 422, reason: 'dependency_missing' });
    expect(f.snapshot()).toBe(before); expect(f.historical.snapshot_text).toBe(raw);
  });
  it.each(['result', 'comment', 'work'] as const)('checks embedded %s native2 raw even with a valid current source', async kind => {
    const f = fixture();
    const broken = JSON.stringify({ ...originalFile, schemaBundle: { ...originalFile.schemaBundle, definitions: [] } });
    const held = { id: pinId, document: { product: 'note' as const, id: doc }, revision: 1, text: broken, title: 'Pinned' };
    if (kind === 'result') f.record.results[0].inputs.push(held);
    if (kind === 'comment') f.record.comments.push({ id: pinId, resultId: projectId, target: { kind: 'document', id: doc, quote: '' },
      pin: held, actor: { kind: 'human', id: actorId, label: 'Member' }, body: 'Literal', createdAt: '2026-10-01', status: 'open' });
    if (kind === 'work') f.record.works.push({ id: pinId, commentId: pinId, request: 'Review', state: 'unconnected', inputs: [held], outputs: [], reason: '', createdAt: '2026-10-01' });
    const before = f.snapshot();
    await expect(f.store.get(principal, tenant, projectId)).rejects.toMatchObject({ status: 422, reason: 'invalid_snapshot' });
    expect(f.snapshot()).toBe(before);
  });
  it('does not admit a native2 raw body under a mislabeled native-v1 head', async () => {
    const f = fixture(); f.current.file_version = 1;
    await expect(f.store.get(principal, tenant, projectId)).rejects.toMatchObject({ status: 409, reason: 'source_conflict' });
  });
  it('leaves existing v1 Project reads on their original boundary without native2 policy', async () => {
    const f = fixture([]);
    const v1 = JSON.stringify({ format: 'barocss-note', version: 1,
      document: { stype: 'note', attributes: { pageId: 'native-policy-page' }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Legacy' }] }] } });
    f.current.file_version = 1; f.current.snapshot_text = v1; f.current.snapshot_hash = sha(v1);
    expect((await f.store.get(principal, tenant, projectId)).project.record).toEqual(f.record);
    expect(f.trace.some(sql => sql.includes('FROM wonffice.schema_versions'))).toBe(false);
  });
  it('keeps the native2 byte limit named as 413', async () => {
    const f = fixture(); f.current.snapshot_text = ' '.repeat(524289); f.current.snapshot_hash = sha(f.current.snapshot_text);
    await expect(f.store.get(principal, tenant, projectId)).rejects.toMatchObject({ status: 413, reason: 'snapshot_too_large' });
  });
});
