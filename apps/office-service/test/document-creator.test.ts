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

// #495 TEST-ONLY proposed contract. Original eight cases above remain byte-for-byte unchanged.
// Full expected native files are independent literals, never generated by product copy/writer.
import { createHash } from 'node:crypto';
import { readNoteSnapshotFile as readN2File, readNoteV1SnapshotFile as readUnawareFile } from '@barocss/office-note-file';
import type { DocumentHead, DocumentReceipt, UpdateSnapshotInput } from '../src/document-store.js';
type N2Ref = { schemaId: string; version: number; digest: string };
type N2Literal = {
  format: string; version: number; savedAt?: string;
  schemaBundle: { bundleVersion: number; digestAlgorithm: string; selected: N2Ref[]; definitions: { reference: N2Ref; definitionText: string }[] };
  document: { stype: string; attributes: { pageId: string; [key: string]: unknown }; content: unknown[]; [key: string]: unknown };
};
type N2RegistryRow = { tenant_id: string; workspace_id: string; schema_id: string; version: number; digest: string;
  definition_text: string; canonical_text: string; actor_identity_id: string; created_at: string };
const N2_A: N2Literal = {
  "format": "barocss-note",
  "version": 2,
  "savedAt": "authored stamp A / Café",
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 1,
        "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 2,
          "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305"
        },
        "definitionText": "{\n    \"dialect\": \"wonffice.note-fields.v1\",\n    \"scope\": {\n        \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n        \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n    },\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 2,\n    \"parent\": {\n        \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n        \"version\": 1,\n        \"digest\": \"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\"\n    },\n    \"dependencies\": [],\n    \"requiredCapabilities\": [\n        \"note.field.choice.v1\",\n        \"note.field.text.v1\"\n    ],\n    \"dataset\": {\n        \"name\": \"reference labels\",\n        \"fields\": [\n            {\n                \"name\": \"State\",\n                \"kind\": \"choice\",\n                \"options\": [\n                    \"검토\",\n                    \"초안\"\n                ]\n            },\n            {\n                \"name\": \"Label\",\n                \"kind\": \"text\",\n                \"label\": \"Café\"\n            }\n        ]\n    }\n}\n"
      },
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
      },
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 1,
          "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9"
        },
        "definitionText": "{\n \"dialect\": \"wonffice.note-fields.v1\",\n \"scope\": {\n  \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n  \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n },\n \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n \"version\": 1,\n \"parent\": null,\n \"dependencies\": [],\n \"requiredCapabilities\": [\n  \"note.field.text.v1\"\n ],\n \"dataset\": {\n  \"name\": \"reference labels\",\n  \"fields\": [\n   {\n    \"name\": \"Label\",\n    \"kind\": \"text\",\n    \"label\": \"Café\"\n   }\n  ]\n }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "attributes": {
      "title": "검토 자료 A",
      "pageId": "native2-note-A",
      "authoredTag": "preserve-A"
    },
    "metadata": {
      "sourceRevision": 7,
      "annotation": null,
      "labels": [
        "검토",
        "Café"
      ]
    },
    "content": [
      {
        "stype": "heading",
        "attributes": {
          "level": 2
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "목표 A",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  2
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "paragraph",
        "attributes": {
          "alignment": "left"
        },
        "metadata": {
          "source": "authored-A",
          "annotation": null
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "Café 검토 A",
            "marks": [
              {
                "stype": "italic",
                "range": [
                  0,
                  5
                ]
              }
            ]
          },
          {
            "stype": "inline-text",
            "text": " / marks 생략"
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "native2-note-A",
              "title": "A 내부"
            }
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "external-note-A",
              "title": "A 외부"
            }
          }
        ]
      },
      {
        "stype": "codeBlock",
        "attributes": {
          "language": "typescript"
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "const total = 7;"
          }
        ]
      },
      {
        "stype": "bTable",
        "content": [
          {
            "stype": "bTableBody",
            "content": [
              {
                "stype": "bTableRow",
                "content": [
                  {
                    "stype": "bTableCell",
                    "content": [
                      {
                        "stype": "inline-text",
                        "text": "A cell",
                        "marks": []
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "resources",
        "content": [
          {
            "stype": "dataset",
            "attributes": {
              "name": "review-items",
              "fields": [
                {
                  "name": "State",
                  "kind": "choice",
                  "options": [
                    "진행",
                    "계획"
                  ]
                },
                {
                  "name": "Done",
                  "kind": "boolean"
                },
                {
                  "name": "Count",
                  "kind": "number"
                },
                {
                  "name": "Label",
                  "kind": "text",
                  "label": "Café"
                }
              ],
              "rowIds": [
                "row-A-2",
                "row-A-1"
              ],
              "records": [
                {
                  "State": "진행",
                  "Done": false,
                  "Count": 7,
                  "Label": "자료 A"
                },
                {
                  "Label": "값 생략 A"
                }
              ]
            }
          },
          {
            "stype": "richText",
            "attributes": {
              "id": "row-A-2"
            },
            "metadata": {
              "note": null
            },
            "content": [
              {
                "stype": "paragraph",
                "content": [
                  {
                    "stype": "inline-text",
                    "text": "항목 본문 A",
                    "marks": [
                      {
                        "stype": "underline",
                        "range": [
                          0,
                          2
                        ]
                      }
                    ]
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "native2-note-A",
                      "title": "A 자료 내부"
                    }
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "external-note-A",
                      "title": "A 자료 외부"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};

const N2_B: N2Literal = {
  "format": "barocss-note",
  "version": 2,
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 1,
        "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 2,
          "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305"
        },
        "definitionText": "{\n    \"dialect\": \"wonffice.note-fields.v1\",\n    \"scope\": {\n        \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n        \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n    },\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 2,\n    \"parent\": {\n        \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n        \"version\": 1,\n        \"digest\": \"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\"\n    },\n    \"dependencies\": [],\n    \"requiredCapabilities\": [\n        \"note.field.choice.v1\",\n        \"note.field.text.v1\"\n    ],\n    \"dataset\": {\n        \"name\": \"reference labels\",\n        \"fields\": [\n            {\n                \"name\": \"State\",\n                \"kind\": \"choice\",\n                \"options\": [\n                    \"검토\",\n                    \"초안\"\n                ]\n            },\n            {\n                \"name\": \"Label\",\n                \"kind\": \"text\",\n                \"label\": \"Café\"\n            }\n        ]\n    }\n}\n"
      },
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
      },
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 1,
          "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9"
        },
        "definitionText": "{\n \"dialect\": \"wonffice.note-fields.v1\",\n \"scope\": {\n  \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n  \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n },\n \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n \"version\": 1,\n \"parent\": null,\n \"dependencies\": [],\n \"requiredCapabilities\": [\n  \"note.field.text.v1\"\n ],\n \"dataset\": {\n  \"name\": \"reference labels\",\n  \"fields\": [\n   {\n    \"name\": \"Label\",\n    \"kind\": \"text\",\n    \"label\": \"Café\"\n   }\n  ]\n }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "attributes": {
      "title": "검토 자료 B",
      "pageId": "native2-note-B",
      "authoredTag": "preserve-B"
    },
    "metadata": {
      "annotation": null,
      "sourceRevision": 3
    },
    "content": [
      {
        "stype": "paragraph",
        "content": [
          {
            "stype": "inline-text",
            "text": "검토 B",
            "marks": [
              {
                "stype": "strike",
                "range": [
                  0,
                  2
                ]
              }
            ]
          },
          {
            "stype": "inline-text",
            "text": " / 생략 B"
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "native2-note-B",
              "title": "B 내부"
            }
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "external-note-B",
              "title": "B 외부"
            }
          }
        ]
      },
      {
        "stype": "resources",
        "content": [
          {
            "stype": "dataset",
            "attributes": {
              "name": "review-items",
              "fields": [
                {
                  "name": "State",
                  "kind": "choice",
                  "options": [
                    "진행",
                    "계획"
                  ]
                },
                {
                  "name": "Done",
                  "kind": "boolean"
                },
                {
                  "name": "Count",
                  "kind": "number"
                },
                {
                  "name": "Label",
                  "kind": "text",
                  "label": "Café"
                }
              ],
              "rowIds": [
                "row-B-1"
              ],
              "records": [
                {
                  "State": "계획",
                  "Done": true,
                  "Count": 0,
                  "Label": "자료 B"
                }
              ]
            }
          },
          {
            "stype": "richText",
            "attributes": {
              "id": "row-B-1"
            },
            "content": [
              {
                "stype": "paragraph",
                "content": [
                  {
                    "stype": "inline-text",
                    "text": "B 자료 본문"
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "native2-note-B",
                      "title": "B 자료 내부"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};

const N2_A_ADOPTED: N2Literal = {
  "format": "barocss-note",
  "version": 2,
  "savedAt": "authored stamp A / Café",
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 2,
        "digest": "c73df69758346deeb34cc3be23f7e0629aa9069907fb5293207e1faed4e416fd"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 2,
          "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305"
        },
        "definitionText": "{\n    \"dialect\": \"wonffice.note-fields.v1\",\n    \"scope\": {\n        \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n        \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n    },\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 2,\n    \"parent\": {\n        \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n        \"version\": 1,\n        \"digest\": \"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\"\n    },\n    \"dependencies\": [],\n    \"requiredCapabilities\": [\n        \"note.field.choice.v1\",\n        \"note.field.text.v1\"\n    ],\n    \"dataset\": {\n        \"name\": \"reference labels\",\n        \"fields\": [\n            {\n                \"name\": \"State\",\n                \"kind\": \"choice\",\n                \"options\": [\n                    \"검토\",\n                    \"초안\"\n                ]\n            },\n            {\n                \"name\": \"Label\",\n                \"kind\": \"text\",\n                \"label\": \"Café\"\n            }\n        ]\n    }\n}\n"
      },
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
      },
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 1,
          "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9"
        },
        "definitionText": "{\n \"dialect\": \"wonffice.note-fields.v1\",\n \"scope\": {\n  \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n  \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n },\n \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n \"version\": 1,\n \"parent\": null,\n \"dependencies\": [],\n \"requiredCapabilities\": [\n  \"note.field.text.v1\"\n ],\n \"dataset\": {\n  \"name\": \"reference labels\",\n  \"fields\": [\n   {\n    \"name\": \"Label\",\n    \"kind\": \"text\",\n    \"label\": \"Café\"\n   }\n  ]\n }\n}\n"
      },
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 2,
          "digest": "c73df69758346deeb34cc3be23f7e0629aa9069907fb5293207e1faed4e416fd"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 2,\n  \"parent\": {\n    \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n    \"version\": 1,\n    \"digest\": \"0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a\"\n  },\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      },\n      {\n        \"name\": \"Owner\",\n        \"kind\": \"text\",\n        \"label\": \"담당자\"\n      }\n    ]\n  }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "attributes": {
      "title": "검토 자료 A",
      "pageId": "native2-note-A",
      "authoredTag": "preserve-A"
    },
    "metadata": {
      "sourceRevision": 7,
      "annotation": null,
      "labels": [
        "검토",
        "Café"
      ]
    },
    "content": [
      {
        "stype": "heading",
        "attributes": {
          "level": 2
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "목표 A",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  2
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "paragraph",
        "attributes": {
          "alignment": "left"
        },
        "metadata": {
          "source": "authored-A",
          "annotation": null
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "Café 검토 A",
            "marks": [
              {
                "stype": "italic",
                "range": [
                  0,
                  5
                ]
              }
            ]
          },
          {
            "stype": "inline-text",
            "text": " / marks 생략"
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "native2-note-A",
              "title": "A 내부"
            }
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "external-note-A",
              "title": "A 외부"
            }
          }
        ]
      },
      {
        "stype": "codeBlock",
        "attributes": {
          "language": "typescript"
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "const total = 7;"
          }
        ]
      },
      {
        "stype": "bTable",
        "content": [
          {
            "stype": "bTableBody",
            "content": [
              {
                "stype": "bTableRow",
                "content": [
                  {
                    "stype": "bTableCell",
                    "content": [
                      {
                        "stype": "inline-text",
                        "text": "A cell",
                        "marks": []
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "resources",
        "content": [
          {
            "stype": "dataset",
            "attributes": {
              "name": "review-items",
              "fields": [
                {
                  "name": "State",
                  "kind": "choice",
                  "options": [
                    "진행",
                    "계획"
                  ]
                },
                {
                  "name": "Done",
                  "kind": "boolean"
                },
                {
                  "name": "Count",
                  "kind": "number"
                },
                {
                  "name": "Label",
                  "kind": "text",
                  "label": "Café"
                },
                {
                  "name": "Owner",
                  "kind": "text",
                  "label": "담당자"
                }
              ],
              "rowIds": [
                "row-A-2",
                "row-A-1"
              ],
              "records": [
                {
                  "State": "진행",
                  "Done": false,
                  "Count": 7,
                  "Label": "자료 A"
                },
                {
                  "Label": "값 생략 A"
                }
              ]
            }
          },
          {
            "stype": "richText",
            "attributes": {
              "id": "row-A-2"
            },
            "metadata": {
              "note": null
            },
            "content": [
              {
                "stype": "paragraph",
                "content": [
                  {
                    "stype": "inline-text",
                    "text": "항목 본문 A",
                    "marks": [
                      {
                        "stype": "underline",
                        "range": [
                          0,
                          2
                        ]
                      }
                    ]
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "native2-note-A",
                      "title": "A 자료 내부"
                    }
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "external-note-A",
                      "title": "A 자료 외부"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};

const N2_COPY_ORACLE: N2Literal = {
  "format": "barocss-note",
  "version": 2,
  "savedAt": "authored stamp A / Café",
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 1,
        "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 2,
          "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305"
        },
        "definitionText": "{\n    \"dialect\": \"wonffice.note-fields.v1\",\n    \"scope\": {\n        \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n        \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n    },\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 2,\n    \"parent\": {\n        \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n        \"version\": 1,\n        \"digest\": \"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\"\n    },\n    \"dependencies\": [],\n    \"requiredCapabilities\": [\n        \"note.field.choice.v1\",\n        \"note.field.text.v1\"\n    ],\n    \"dataset\": {\n        \"name\": \"reference labels\",\n        \"fields\": [\n            {\n                \"name\": \"State\",\n                \"kind\": \"choice\",\n                \"options\": [\n                    \"검토\",\n                    \"초안\"\n                ]\n            },\n            {\n                \"name\": \"Label\",\n                \"kind\": \"text\",\n                \"label\": \"Café\"\n            }\n        ]\n    }\n}\n"
      },
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
      },
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 1,
          "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9"
        },
        "definitionText": "{\n \"dialect\": \"wonffice.note-fields.v1\",\n \"scope\": {\n  \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n  \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n },\n \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n \"version\": 1,\n \"parent\": null,\n \"dependencies\": [],\n \"requiredCapabilities\": [\n  \"note.field.text.v1\"\n ],\n \"dataset\": {\n  \"name\": \"reference labels\",\n  \"fields\": [\n   {\n    \"name\": \"Label\",\n    \"kind\": \"text\",\n    \"label\": \"Café\"\n   }\n  ]\n }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "attributes": {
      "title": "검토 자료 A",
      "pageId": "native2-copy-A",
      "authoredTag": "preserve-A"
    },
    "metadata": {
      "sourceRevision": 7,
      "annotation": null,
      "labels": [
        "검토",
        "Café"
      ]
    },
    "content": [
      {
        "stype": "heading",
        "attributes": {
          "level": 2
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "목표 A",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  2
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "paragraph",
        "attributes": {
          "alignment": "left"
        },
        "metadata": {
          "source": "authored-A",
          "annotation": null
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "Café 검토 A",
            "marks": [
              {
                "stype": "italic",
                "range": [
                  0,
                  5
                ]
              }
            ]
          },
          {
            "stype": "inline-text",
            "text": " / marks 생략"
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "native2-copy-A",
              "title": "A 내부"
            }
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "external-note-A",
              "title": "A 외부"
            }
          }
        ]
      },
      {
        "stype": "codeBlock",
        "attributes": {
          "language": "typescript"
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "const total = 7;"
          }
        ]
      },
      {
        "stype": "bTable",
        "content": [
          {
            "stype": "bTableBody",
            "content": [
              {
                "stype": "bTableRow",
                "content": [
                  {
                    "stype": "bTableCell",
                    "content": [
                      {
                        "stype": "inline-text",
                        "text": "A cell",
                        "marks": []
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "resources",
        "content": [
          {
            "stype": "dataset",
            "attributes": {
              "name": "review-items",
              "fields": [
                {
                  "name": "State",
                  "kind": "choice",
                  "options": [
                    "진행",
                    "계획"
                  ]
                },
                {
                  "name": "Done",
                  "kind": "boolean"
                },
                {
                  "name": "Count",
                  "kind": "number"
                },
                {
                  "name": "Label",
                  "kind": "text",
                  "label": "Café"
                }
              ],
              "rowIds": [
                "row-A-2",
                "row-A-1"
              ],
              "records": [
                {
                  "State": "진행",
                  "Done": false,
                  "Count": 7,
                  "Label": "자료 A"
                },
                {
                  "Label": "값 생략 A"
                }
              ]
            }
          },
          {
            "stype": "richText",
            "attributes": {
              "id": "row-A-2"
            },
            "metadata": {
              "note": null
            },
            "content": [
              {
                "stype": "paragraph",
                "content": [
                  {
                    "stype": "inline-text",
                    "text": "항목 본문 A",
                    "marks": [
                      {
                        "stype": "underline",
                        "range": [
                          0,
                          2
                        ]
                      }
                    ]
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "native2-copy-A",
                      "title": "A 자료 내부"
                    }
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "external-note-A",
                      "title": "A 자료 외부"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};

const N2_CAPABILITY_ONLY: N2Literal = {
  "format": "barocss-note",
  "version": 2,
  "savedAt": "authored stamp A / Café",
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "33333333-3333-3333-3333-333333333333",
        "version": 1,
        "digest": "806d9fd6beb14fcce67d7941bbcf39c1a7bf203f1d418acd34f44c7821867a83"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "33333333-3333-3333-3333-333333333333",
          "version": 1,
          "digest": "806d9fd6beb14fcce67d7941bbcf39c1a7bf203f1d418acd34f44c7821867a83"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"33333333-3333-3333-3333-333333333333\",\n  \"version\": 1,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"policy-only\",\n    \"fields\": [\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\"\n      }\n    ]\n  },\n  \"parent\": null\n}\n"
      },
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 2,
          "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305"
        },
        "definitionText": "{\n    \"dialect\": \"wonffice.note-fields.v1\",\n    \"scope\": {\n        \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n        \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n    },\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 2,\n    \"parent\": {\n        \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n        \"version\": 1,\n        \"digest\": \"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\"\n    },\n    \"dependencies\": [],\n    \"requiredCapabilities\": [\n        \"note.field.choice.v1\",\n        \"note.field.text.v1\"\n    ],\n    \"dataset\": {\n        \"name\": \"reference labels\",\n        \"fields\": [\n            {\n                \"name\": \"State\",\n                \"kind\": \"choice\",\n                \"options\": [\n                    \"검토\",\n                    \"초안\"\n                ]\n            },\n            {\n                \"name\": \"Label\",\n                \"kind\": \"text\",\n                \"label\": \"Café\"\n            }\n        ]\n    }\n}\n"
      },
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 1,
          "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9"
        },
        "definitionText": "{\n \"dialect\": \"wonffice.note-fields.v1\",\n \"scope\": {\n  \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n  \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n },\n \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n \"version\": 1,\n \"parent\": null,\n \"dependencies\": [],\n \"requiredCapabilities\": [\n  \"note.field.text.v1\"\n ],\n \"dataset\": {\n  \"name\": \"reference labels\",\n  \"fields\": [\n   {\n    \"name\": \"Label\",\n    \"kind\": \"text\",\n    \"label\": \"Café\"\n   }\n  ]\n }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "attributes": {
      "title": "검토 자료 A",
      "pageId": "native2-note-A",
      "authoredTag": "preserve-A"
    },
    "metadata": {
      "sourceRevision": 7,
      "annotation": null,
      "labels": [
        "검토",
        "Café"
      ]
    },
    "content": [
      {
        "stype": "heading",
        "attributes": {
          "level": 2
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "목표 A",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  2
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "paragraph",
        "attributes": {
          "alignment": "left"
        },
        "metadata": {
          "source": "authored-A",
          "annotation": null
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "Café 검토 A",
            "marks": [
              {
                "stype": "italic",
                "range": [
                  0,
                  5
                ]
              }
            ]
          },
          {
            "stype": "inline-text",
            "text": " / marks 생략"
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "native2-note-A",
              "title": "A 내부"
            }
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "external-note-A",
              "title": "A 외부"
            }
          }
        ]
      },
      {
        "stype": "codeBlock",
        "attributes": {
          "language": "typescript"
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "const total = 7;"
          }
        ]
      },
      {
        "stype": "bTable",
        "content": [
          {
            "stype": "bTableBody",
            "content": [
              {
                "stype": "bTableRow",
                "content": [
                  {
                    "stype": "bTableCell",
                    "content": [
                      {
                        "stype": "inline-text",
                        "text": "A cell",
                        "marks": []
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "resources",
        "content": [
          {
            "stype": "dataset",
            "attributes": {
              "name": "review-items",
              "fields": [
                {
                  "name": "State",
                  "kind": "choice",
                  "options": [
                    "진행",
                    "계획"
                  ]
                },
                {
                  "name": "Done",
                  "kind": "boolean"
                },
                {
                  "name": "Count",
                  "kind": "number"
                },
                {
                  "name": "Label",
                  "kind": "text",
                  "label": "Café"
                }
              ],
              "rowIds": [
                "row-A-2",
                "row-A-1"
              ],
              "records": [
                {
                  "State": "진행",
                  "Done": false,
                  "Count": 7,
                  "Label": "자료 A"
                },
                {
                  "Label": "값 생략 A"
                }
              ]
            }
          },
          {
            "stype": "richText",
            "attributes": {
              "id": "row-A-2"
            },
            "metadata": {
              "note": null
            },
            "content": [
              {
                "stype": "paragraph",
                "content": [
                  {
                    "stype": "inline-text",
                    "text": "항목 본문 A",
                    "marks": [
                      {
                        "stype": "underline",
                        "range": [
                          0,
                          2
                        ]
                      }
                    ]
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "native2-note-A",
                      "title": "A 자료 내부"
                    }
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "external-note-A",
                      "title": "A 자료 외부"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};

const N2_FOREIGN_SCOPE: N2Literal = {
  "format": "barocss-note",
  "version": 2,
  "savedAt": "authored stamp A / Café",
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 1,
        "digest": "9830608560a7a11a010db23b2cc7b2e57e07527a9f91802d2601bb279d6d5cfc"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 2,
          "digest": "7cb65b10a5c244a9c45efb3a9a0ca7ab76386ddc9a7bdfb581d91114439bf22c"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"ffffffff-ffff-ffff-ffff-ffffffffffff\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n  \"version\": 2,\n  \"parent\": {\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 1,\n    \"digest\": \"2f54f2fdee338ed9d31f3d4bb7f144f302ecc1b008bd57200977c31af27adc11\"\n  },\n  \"dependencies\": [],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"reference labels\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"검토\",\n          \"초안\"\n        ]\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
      },
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "9830608560a7a11a010db23b2cc7b2e57e07527a9f91802d2601bb279d6d5cfc"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"ffffffff-ffff-ffff-ffff-ffffffffffff\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"7cb65b10a5c244a9c45efb3a9a0ca7ab76386ddc9a7bdfb581d91114439bf22c\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
      },
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 1,
          "digest": "2f54f2fdee338ed9d31f3d4bb7f144f302ecc1b008bd57200977c31af27adc11"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"ffffffff-ffff-ffff-ffff-ffffffffffff\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"reference labels\",\n    \"fields\": [\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "attributes": {
      "title": "검토 자료 A",
      "pageId": "native2-note-A",
      "authoredTag": "preserve-A"
    },
    "metadata": {
      "sourceRevision": 7,
      "annotation": null,
      "labels": [
        "검토",
        "Café"
      ]
    },
    "content": [
      {
        "stype": "heading",
        "attributes": {
          "level": 2
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "목표 A",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  2
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "paragraph",
        "attributes": {
          "alignment": "left"
        },
        "metadata": {
          "source": "authored-A",
          "annotation": null
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "Café 검토 A",
            "marks": [
              {
                "stype": "italic",
                "range": [
                  0,
                  5
                ]
              }
            ]
          },
          {
            "stype": "inline-text",
            "text": " / marks 생략"
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "native2-note-A",
              "title": "A 내부"
            }
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "external-note-A",
              "title": "A 외부"
            }
          }
        ]
      },
      {
        "stype": "codeBlock",
        "attributes": {
          "language": "typescript"
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "const total = 7;"
          }
        ]
      },
      {
        "stype": "bTable",
        "content": [
          {
            "stype": "bTableBody",
            "content": [
              {
                "stype": "bTableRow",
                "content": [
                  {
                    "stype": "bTableCell",
                    "content": [
                      {
                        "stype": "inline-text",
                        "text": "A cell",
                        "marks": []
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "resources",
        "content": [
          {
            "stype": "dataset",
            "attributes": {
              "name": "review-items",
              "fields": [
                {
                  "name": "State",
                  "kind": "choice",
                  "options": [
                    "진행",
                    "계획"
                  ]
                },
                {
                  "name": "Done",
                  "kind": "boolean"
                },
                {
                  "name": "Count",
                  "kind": "number"
                },
                {
                  "name": "Label",
                  "kind": "text",
                  "label": "Café"
                }
              ],
              "rowIds": [
                "row-A-2",
                "row-A-1"
              ],
              "records": [
                {
                  "State": "진행",
                  "Done": false,
                  "Count": 7,
                  "Label": "자료 A"
                },
                {
                  "Label": "값 생략 A"
                }
              ]
            }
          },
          {
            "stype": "richText",
            "attributes": {
              "id": "row-A-2"
            },
            "metadata": {
              "note": null
            },
            "content": [
              {
                "stype": "paragraph",
                "content": [
                  {
                    "stype": "inline-text",
                    "text": "항목 본문 A",
                    "marks": [
                      {
                        "stype": "underline",
                        "range": [
                          0,
                          2
                        ]
                      }
                    ]
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "native2-note-A",
                      "title": "A 자료 내부"
                    }
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "external-note-A",
                      "title": "A 자료 외부"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};

const N2_REGISTRY_ROWS: N2RegistryRow[] = [
  {
    "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "workspace_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "schema_id": "22222222-2222-2222-2222-222222222222",
    "version": 2,
    "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305",
    "definition_text": "{\n    \"dialect\": \"wonffice.note-fields.v1\",\n    \"scope\": {\n        \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n        \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n    },\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 2,\n    \"parent\": {\n        \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n        \"version\": 1,\n        \"digest\": \"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\"\n    },\n    \"dependencies\": [],\n    \"requiredCapabilities\": [\n        \"note.field.choice.v1\",\n        \"note.field.text.v1\"\n    ],\n    \"dataset\": {\n        \"name\": \"reference labels\",\n        \"fields\": [\n            {\n                \"name\": \"State\",\n                \"kind\": \"choice\",\n                \"options\": [\n                    \"검토\",\n                    \"초안\"\n                ]\n            },\n            {\n                \"name\": \"Label\",\n                \"kind\": \"text\",\n                \"label\": \"Café\"\n            }\n        ]\n    }\n}\n",
    "canonical_text": "{\"dataset\":{\"fields\":[{\"kind\":\"choice\",\"name\":\"State\",\"options\":[\"검토\",\"초안\"]},{\"kind\":\"text\",\"label\":\"Café\",\"name\":\"Label\"}],\"name\":\"reference labels\"},\"dependencies\":[],\"dialect\":\"wonffice.note-fields.v1\",\"parent\":{\"digest\":\"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\",\"schemaId\":\"22222222-2222-2222-2222-222222222222\",\"version\":1},\"requiredCapabilities\":[\"note.field.choice.v1\",\"note.field.text.v1\"],\"schemaId\":\"22222222-2222-2222-2222-222222222222\",\"scope\":{\"tenantId\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\"workspaceId\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"},\"version\":2}",
    "actor_identity_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    "created_at": "2026-10-01T00:00:00.000Z"
  },
  {
    "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "workspace_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "schema_id": "11111111-1111-1111-1111-111111111111",
    "version": 1,
    "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a",
    "definition_text": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n",
    "canonical_text": "{\"dataset\":{\"fields\":[{\"kind\":\"choice\",\"name\":\"State\",\"options\":[\"진행\",\"계획\"]},{\"kind\":\"boolean\",\"name\":\"Done\"},{\"kind\":\"number\",\"name\":\"Count\"},{\"kind\":\"text\",\"label\":\"Café\",\"name\":\"Label\"}],\"name\":\"review-items\"},\"dependencies\":[{\"digest\":\"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\",\"schemaId\":\"22222222-2222-2222-2222-222222222222\",\"version\":2}],\"dialect\":\"wonffice.note-fields.v1\",\"parent\":null,\"requiredCapabilities\":[\"note.field.choice.v1\",\"note.field.boolean.v1\",\"note.field.number.v1\",\"note.field.text.v1\"],\"schemaId\":\"11111111-1111-1111-1111-111111111111\",\"scope\":{\"tenantId\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\"workspaceId\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"},\"version\":1}",
    "actor_identity_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    "created_at": "2026-10-01T00:00:00.000Z"
  },
  {
    "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "workspace_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "schema_id": "22222222-2222-2222-2222-222222222222",
    "version": 1,
    "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9",
    "definition_text": "{\n \"dialect\": \"wonffice.note-fields.v1\",\n \"scope\": {\n  \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n  \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n },\n \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n \"version\": 1,\n \"parent\": null,\n \"dependencies\": [],\n \"requiredCapabilities\": [\n  \"note.field.text.v1\"\n ],\n \"dataset\": {\n  \"name\": \"reference labels\",\n  \"fields\": [\n   {\n    \"name\": \"Label\",\n    \"kind\": \"text\",\n    \"label\": \"Café\"\n   }\n  ]\n }\n}\n",
    "canonical_text": "{\"dataset\":{\"fields\":[{\"kind\":\"text\",\"label\":\"Café\",\"name\":\"Label\"}],\"name\":\"reference labels\"},\"dependencies\":[],\"dialect\":\"wonffice.note-fields.v1\",\"parent\":null,\"requiredCapabilities\":[\"note.field.text.v1\"],\"schemaId\":\"22222222-2222-2222-2222-222222222222\",\"scope\":{\"tenantId\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\"workspaceId\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"},\"version\":1}",
    "actor_identity_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    "created_at": "2026-10-01T00:00:00.000Z"
  },
  {
    "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "workspace_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "schema_id": "11111111-1111-1111-1111-111111111111",
    "version": 2,
    "digest": "c73df69758346deeb34cc3be23f7e0629aa9069907fb5293207e1faed4e416fd",
    "definition_text": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 2,\n  \"parent\": {\n    \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n    \"version\": 1,\n    \"digest\": \"0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a\"\n  },\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      },\n      {\n        \"name\": \"Owner\",\n        \"kind\": \"text\",\n        \"label\": \"담당자\"\n      }\n    ]\n  }\n}\n",
    "canonical_text": "{\"dataset\":{\"fields\":[{\"kind\":\"choice\",\"name\":\"State\",\"options\":[\"진행\",\"계획\"]},{\"kind\":\"boolean\",\"name\":\"Done\"},{\"kind\":\"number\",\"name\":\"Count\"},{\"kind\":\"text\",\"label\":\"Café\",\"name\":\"Label\"},{\"kind\":\"text\",\"label\":\"담당자\",\"name\":\"Owner\"}],\"name\":\"review-items\"},\"dependencies\":[{\"digest\":\"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\",\"schemaId\":\"22222222-2222-2222-2222-222222222222\",\"version\":2}],\"dialect\":\"wonffice.note-fields.v1\",\"parent\":{\"digest\":\"0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a\",\"schemaId\":\"11111111-1111-1111-1111-111111111111\",\"version\":1},\"requiredCapabilities\":[\"note.field.choice.v1\",\"note.field.boolean.v1\",\"note.field.number.v1\",\"note.field.text.v1\"],\"schemaId\":\"11111111-1111-1111-1111-111111111111\",\"scope\":{\"tenantId\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\"workspaceId\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"},\"version\":2}",
    "actor_identity_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    "created_at": "2026-10-01T00:00:00.000Z"
  },
  {
    "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "workspace_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "schema_id": "33333333-3333-3333-3333-333333333333",
    "version": 1,
    "digest": "806d9fd6beb14fcce67d7941bbcf39c1a7bf203f1d418acd34f44c7821867a83",
    "definition_text": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"33333333-3333-3333-3333-333333333333\",\n  \"version\": 1,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"policy-only\",\n    \"fields\": [\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\"\n      }\n    ]\n  },\n  \"parent\": null\n}\n",
    "canonical_text": "{\"dataset\":{\"fields\":[{\"kind\":\"text\",\"name\":\"Label\"}],\"name\":\"policy-only\"},\"dependencies\":[{\"digest\":\"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\",\"schemaId\":\"22222222-2222-2222-2222-222222222222\",\"version\":2}],\"dialect\":\"wonffice.note-fields.v1\",\"parent\":null,\"requiredCapabilities\":[\"note.field.text.v1\"],\"schemaId\":\"33333333-3333-3333-3333-333333333333\",\"scope\":{\"tenantId\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\"workspaceId\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"},\"version\":1}",
    "actor_identity_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    "created_at": "2026-10-01T00:00:00.000Z"
  }
];

const N2_PIN_VECTORS = {
  "pinned1": {
    "preimage": "[\"wonffice.note.snapshot-pins.cas.v1\",\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\",\"cccccccc-cccc-4ccc-8ccc-cccccccccccc\",\"pinned\",[[\"11111111-1111-1111-1111-111111111111\",1,\"0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a\"]]]",
    "sha256": "5bea50129a4dce5af2362ae31fc61c69619e489f3551a753f19ed590663ac377"
  },
  "pinned2": {
    "preimage": "[\"wonffice.note.snapshot-pins.cas.v1\",\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\",\"cccccccc-cccc-4ccc-8ccc-cccccccccccc\",\"pinned\",[[\"11111111-1111-1111-1111-111111111111\",2,\"c73df69758346deeb34cc3be23f7e0629aa9069907fb5293207e1faed4e416fd\"]]]",
    "sha256": "e89a1ff2f89c85ea2b3824cf11bf238a6a4a8c2e2ffa1e8bc92416dd1bdece35"
  },
  "orderedTwo": {
    "preimage": "[\"wonffice.note.snapshot-pins.cas.v1\",\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\",\"cccccccc-cccc-4ccc-8ccc-cccccccccccc\",\"pinned\",[[\"11111111-1111-1111-1111-111111111111\",1,\"0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a\"],[\"22222222-2222-2222-2222-222222222222\",2,\"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"]]]",
    "sha256": "ae1598392b68bd260d32ee33cf6e379086e173602cfad02a422df6b93d03510f"
  },
  "reversedTwo": {
    "preimage": "[\"wonffice.note.snapshot-pins.cas.v1\",\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\",\"cccccccc-cccc-4ccc-8ccc-cccccccccccc\",\"pinned\",[[\"22222222-2222-2222-2222-222222222222\",2,\"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"],[\"11111111-1111-1111-1111-111111111111\",1,\"0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a\"]]]",
    "sha256": "945cf3e137511f596634ba62fcaec2b7725a6c5b8cadd1e777df29cb5ff3bb8c"
  }
};
const N2_TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', N2_WORKSPACE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const N2_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', N2_B_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const N2_WRITER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const n2Principal = { issuer: 'https://verified.example', subject: 'native2-writer' };
const n2Clone = <T>(value: T): T => structuredClone(value);
const n2Raw = (value: N2Literal) => JSON.stringify(value, null, 2) + '\n';
const n2Hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const N2_A_RAW = n2Raw(N2_A), N2_B_RAW = n2Raw(N2_B), N2_ADOPT_RAW = n2Raw(N2_A_ADOPTED);
const n2Policy = () => ({ noteSchemaPolicy: [{ tenantId: N2_TENANT, workspaceId: N2_WORKSPACE,
  readRoles: ['owner', 'admin', 'editor'] as TenantRole[], preserveRoles: ['owner', 'admin', 'editor'] as TenantRole[],
  adoptRoles: ['owner', 'admin', 'editor'] as TenantRole[],
  capabilities: ['note.field.choice.v1', 'note.field.boolean.v1', 'note.field.number.v1', 'note.field.text.v1'] }] });
type N2Policy = ReturnType<typeof n2Policy>;
// Optional trusted second argument is proposed, not a nonexistent product method/export.
const N2Store: new (pool: Pool, options?: N2Policy) => DocumentStore = DocumentStore;
type N2Attempt = UpdateSnapshotInput & { expectedSnapshotHash: string; expectedPriorPinDigest: string; schemaAction: 'preserve' | 'adopt' };
const n2Attempt = (overrides: Partial<N2Attempt> = {}): N2Attempt => ({ expectedRevision: 1,
  expectedSnapshotHash: n2Hash(N2_A_RAW), expectedPriorPinDigest: N2_PIN_VECTORS.pinned1.sha256,
  schemaAction: 'adopt', snapshotText: N2_ADOPT_RAW, idempotencyKey: 'native2-adopt-A', ...overrides });
const n2Create = (): CreateDocumentInput => ({ workspaceId: N2_WORKSPACE, product: 'note', title: 'Independent native2 copy',
  fileFormat: 'barocss-note', fileVersion: 2, snapshotText: N2_A_RAW, importMode: 'new-page-copy', idempotencyKey: 'native2-copy-C' });
function n2CodecPrecondition(raw: string, literal: N2Literal) {
  const read = readN2File(raw);
  expect(read, 'Fixture must be codec-valid BEFORE store predicate; validation output is never the oracle').not.toHaveProperty('error');
  if ('error' in read) throw new Error(`native2_fixture_invalid:${read.error}`);
  expect(read).toHaveProperty('fileVersion', 2); expect(read.document).toEqual(literal.document);
  if (!('schemaBundle' in read)) throw new Error('native2_fixture_context_missing');
  expect(read.schemaBundle).toEqual(literal.schemaBundle);
}
function n2Record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ledger_fixture_record_expected');
  return value as Record<string, unknown>;
}
function n2Text(value: unknown): string { if (typeof value !== 'string') throw new Error('ledger_fixture_text_expected'); return value; }
function n2Number(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('ledger_fixture_integer_expected'); return value; }
function n2At(value: unknown, path: (string | number)[]): Record<string, unknown> {
  let target: unknown = value;
  for (const key of path) target = typeof key === 'number' ? (Array.isArray(target) ? target[key] : undefined) : n2Record(target)[key];
  return n2Record(target);
}
function n2ExpectedCopy(pageId: string): string {
  const expected = n2Clone(N2_COPY_ORACLE);
  const paths: (string | number)[][] = [['document', 'attributes'], ['document', 'content', 1, 'content', 2, 'attributes'],
    ['document', 'content', 4, 'content', 1, 'content', 0, 'content', 1, 'attributes']];
  for (const path of paths) n2At(expected, path).pageId = pageId;
  // Explicit authored envelope order; nested original order/strings/codepoints unchanged.
  return JSON.stringify({ format: expected.format, version: expected.version, schemaBundle: expected.schemaBundle,
    document: expected.document, ...(Object.hasOwn(expected, 'savedAt') ? { savedAt: expected.savedAt } : {}) }, null, 2) + '\n';
}
type N2Row = DocumentHead & { snapshotText: string };
type N2ReceiptRow = { request_hash: string; document_id: string | null; result_head: DocumentHead | null; result_snapshot_text: string | null };
type N2State = { documents: Map<string, N2Row>; receipts: Map<string, N2ReceiptRow> };
class N2LedgerSetupError extends Error {}
function n2SeedRow(id: string, literal: N2Literal, raw: string): N2Row {
  return { documentId: id, tenantId: N2_TENANT, workspaceId: N2_WORKSPACE, product: 'note', title: String(literal.document.attributes.title),
    creatorUserId: N2_WRITER, metadataRevision: 1, mode: 'snapshot', pageId: literal.document.attributes.pageId,
    documentKey: `wonffice-${N2_TENANT}-${id}`, fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: n2Hash(raw), snapshotText: raw };
}
function n2Deferred() {
  let resolve: () => void = () => { throw new N2LedgerSetupError('deferred_not_initialized'); };
  const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve };
}
/** Controlled transaction journal, NOT a PG emulator or an admission implementation.
 * Returns declared rows; actual source DocumentStore/MembershipStore/withTenant decide admission.
 * Unsupported SQL is SETUP failure, never product RED or a successful negative predicate.
 */
function n2Ledger(options: { source?: N2Literal; policy?: N2Policy; mode?: DocumentHead['mode'] } = {}) {
  const literal = options.source ?? N2_A, raw = n2Raw(literal), policy = options.policy ?? n2Policy();
  let committed: N2State = { documents: new Map([[N2_A_ID, n2SeedRow(N2_A_ID, literal, raw)], [N2_B_ID, n2SeedRow(N2_B_ID, N2_B, N2_B_RAW)]]), receipts: new Map() };
  if (options.mode) committed.documents.get(N2_A_ID)!.mode = options.mode;
  let actor: { role: TenantRole; epoch: string; active: boolean } = { role: 'editor', epoch: 'editor:4', active: true };
  let hold: { entered: ReturnType<typeof n2Deferred>; released: ReturnType<typeof n2Deferred> } | undefined;
  let failAfterSnapshot = false, failpointReached = false, connections = 0;
  const registry = new Map(N2_REGISTRY_ROWS.map(row => [`${row.schema_id}:${row.version}`, n2Clone(row)]));
  const events: { client: number; kind: string; epoch?: string; destroy?: boolean }[] = [];
  const receiptKey = (params: readonly unknown[]) => JSON.stringify(params.slice(0, 4));
  const pool = { connect: async () => {
    const id = ++connections; let staged: N2State | undefined; const context = { tenant: '', issuer: '', subject: '' };
    const state = () => { if (!staged) throw new N2LedgerSetupError('query_outside_transaction'); return staged; };
    const rows = (values: unknown[]) => ({ rows: values, rowCount: values.length });
    const query = async (sql: string, params: readonly unknown[] = []) => {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (text === 'BEGIN') { if (staged) throw new N2LedgerSetupError('nested_transaction'); staged = n2Clone(committed); events.push({ client: id, kind: 'BEGIN' }); return rows([]); }
      if (text === 'COMMIT') { committed = state(); staged = undefined; events.push({ client: id, kind: 'COMMIT' }); return rows([]); }
      if (text === 'ROLLBACK') { staged = undefined; events.push({ client: id, kind: 'ROLLBACK' }); return rows([]); }
      if (text.startsWith('SET LOCAL')) { state(); return rows([]); }
      if (text.includes("current_user = 'wonffice_app'")) { state(); return rows([{ safe: true, context_empty: true }]); }
      if (text.startsWith('SELECT set_config(')) {
        const name = text.includes("'wonffice.tenant_id'") ? 'tenant' : text.includes("'wonffice.oidc_issuer'") ? 'issuer' : 'subject';
        context[name] = params.length ? n2Text(params[0]) : ''; return rows([]);
      }
      const current = state();
      if (text.includes('FROM wonffice.tenant_memberships')) {
        if (params[0] !== N2_TENANT) return rows([]);
        const captured = actor.active ? actor.role : undefined; events.push({ client: id, kind: 'unlocked_membership' });
        if (hold) { const barrier = hold; barrier.entered.resolve(); await barrier.released.promise; hold = undefined; }
        return rows(captured ? [{ role: captured }] : []);
      }
      if (text.includes('wonffice.project_current_actor(')) {
        events.push({ client: id, kind: 'locked_current_actor' });
        return rows(actor.active && context.tenant === N2_TENANT && context.issuer === n2Principal.issuer && context.subject === n2Principal.subject
          ? [{ id: N2_WRITER, role: actor.role }] : []);
      }
      if (text.includes('wonffice.project_execution_actor_epoch(')) {
        events.push({ client: id, kind: 'locked_current_epoch', epoch: actor.epoch }); return rows(actor.active ? [{ epoch: actor.epoch }] : []);
      }
      if (text.includes('SELECT id FROM wonffice.identities')) return rows(params[0] === n2Principal.issuer && params[1] === n2Principal.subject ? [{ id: N2_WRITER }] : []);
      if (text.includes('SELECT 1 FROM wonffice.workspaces')) return rows(params[0] === N2_TENANT && params[1] === N2_WORKSPACE ? [{}] : []);
      if (text.includes('pg_advisory_xact_lock(')) { events.push({ client: id, kind: 'advisory_lock' }); return rows([]); }
      if (text.startsWith('SELECT') && text.includes('FROM wonffice.schema_versions')) {
        const row = registry.get(`${params[2]}:${params[3]}`); events.push({ client: id, kind: 'registry_row' });
        return rows(row && row.tenant_id === params[0] && row.workspace_id === params[1] ? [{ ...n2Clone(row), created_at: new Date(row.created_at) }] : []);
      }
      if (text.startsWith('SELECT') && text.includes('FROM wonffice.schema_dependencies')) {
        const row = registry.get(`${params[2]}:${params[3]}`); if (!row || params[0] !== row.tenant_id || params[1] !== row.workspace_id) return rows([]);
        const definition = JSON.parse(row.definition_text) as { parent?: N2Ref | null; dependencies: N2Ref[] };
        const edges = [...(definition.parent ? [{ kind: 'parent', reference: definition.parent }] : []), ...definition.dependencies.map(reference => ({ kind: 'dependency', reference }))];
        events.push({ client: id, kind: 'registry_edges' }); return rows(edges.map((edge, ordinal) => ({ kind: edge.kind, dependency_id: edge.reference.schemaId,
          dependency_version: edge.reference.version, dependency_digest: edge.reference.digest, ordinal })));
      }
      if (text.includes('INSERT INTO wonffice.document_receipts')) {
        const key = receiptKey(params); if (current.receipts.has(key)) return rows([]);
        current.receipts.set(key, { request_hash: n2Text(params[4]), document_id: null, result_head: null, result_snapshot_text: null });
        events.push({ client: id, kind: 'reserve_receipt' }); return rows([{}]);
      }
      if (text.includes('SELECT r.request_hash')) {
        const receipt = current.receipts.get(receiptKey(params)); if (!receipt || !receipt.document_id) return rows([]);
        const document = current.documents.get(receipt.document_id); events.push({ client: id, kind: 'read_receipt' });
        return rows(document ? [{ ...n2Clone(receipt), current_mode: document.mode }] : []);
      }
      if (text.includes('UPDATE wonffice.document_receipts')) {
        if (failAfterSnapshot && events.some(event => event.client === id && event.kind === 'staged_snapshot')) {
          failpointReached = true; events.push({ client: id, kind: 'injected_receipt_failure' }); throw new Error('injected_native2_receipt_failure');
        }
        const receipt = current.receipts.get(receiptKey(params)); if (!receipt || receipt.document_id) return rows([]);
        receipt.document_id = n2Text(params[4]); receipt.result_head = JSON.parse(n2Text(params[5])) as DocumentHead;
        receipt.result_snapshot_text = params[6] === null ? null : n2Text(params[6]); events.push({ client: id, kind: 'complete_receipt' }); return rows([{}]);
      }
      if (text.includes('INSERT INTO wonffice.documents')) {
        const documentId = n2Text(params[1]); current.documents.set(documentId, { documentId, tenantId: n2Text(params[0]), workspaceId: n2Text(params[2]), product: 'note', title: n2Text(params[4]),
          pageId: n2Text(params[5]), documentKey: n2Text(params[6]), creatorUserId: n2Text(params[7]), metadataRevision: 1, mode: 'snapshot',
          fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: '', snapshotText: '' }); events.push({ client: id, kind: 'staged_document' }); return rows([]);
      }
      if (text.includes('INSERT INTO wonffice.document_snapshots')) {
        const document = current.documents.get(n2Text(params[1])); if (!document) throw new N2LedgerSetupError('snapshot_document_missing');
        Object.assign(document, { fileFormat: n2Text(params[2]), fileVersion: n2Number(params[3]), snapshotText: n2Text(params[4]), snapshotHash: n2Text(params[5]), revision: 1 });
        events.push({ client: id, kind: 'staged_snapshot' }); return rows([]);
      }
      if (text.includes('UPDATE wonffice.document_snapshots')) {
        const document = current.documents.get(n2Text(params[1])); if (!document) return rows([]);
        document.snapshotText = n2Text(params[2]); document.snapshotHash = n2Text(params[3]); document.fileVersion = n2Number(params[4]); document.revision++;
        events.push({ client: id, kind: 'staged_snapshot' }); return rows([{}]);
      }
      if (text.includes('UPDATE wonffice.documents SET updated_at')) return rows(current.documents.has(n2Text(params[1])) ? [{}] : []);
      if (text.includes('SELECT d.id AS')) {
        const document = current.documents.get(n2Text(params[1])); events.push({ client: id, kind: text.includes('FOR UPDATE') ? 'locked_snapshot' : 'read_head' });
        return rows(document && document.tenantId === params[0] ? [n2Clone(document)] : []);
      }
      if (text.includes('FROM wonffice.document_collaboration_seeds')) return rows([{ status: 'uncertain' }]);
      throw new N2LedgerSetupError(`unsupported_ledger_query:${text}`);
    };
    return { query, release: (destroy: boolean) => { events.push({ client: id, kind: 'release', destroy }); } } as unknown as PoolClient;
  } } as unknown as Pool;
  return { store: new N2Store(pool, policy), pool, policy, events, registry,
    stateText: () => JSON.stringify({ documents: [...committed.documents], receipts: [...committed.receipts] }), row: (id: string) => n2Clone(committed.documents.get(id)!),
    documentCount: () => committed.documents.size, receiptCount: () => committed.receipts.size,
    authority: (next: Partial<typeof actor>) => { actor = { ...actor, ...next }; },
    injectAfterSnapshot: () => { failAfterSnapshot = true; }, failpointReached: () => failpointReached,
    holdMembership: () => { hold = { entered: n2Deferred(), released: n2Deferred() }; return hold; },
    seedReceipt: (attempt: N2Attempt) => {
      const current = n2Clone(committed.documents.get(N2_A_ID)!);
      current.snapshotText = attempt.snapshotText; current.snapshotHash = n2Hash(attempt.snapshotText); current.revision = attempt.expectedRevision + 1;
      committed.documents.set(N2_A_ID, current);
      const { snapshotText, ...head } = { ...current, mode: 'snapshot' as const };
      const digest = n2Hash(JSON.stringify(['note-native2-snapshot-v1', N2_TENANT, N2_WORKSPACE, N2_A_ID, attempt.schemaAction,
        attempt.expectedRevision, attempt.expectedSnapshotHash, attempt.expectedPriorPinDigest, attempt.snapshotText]));
      committed.receipts.set(JSON.stringify([N2_TENANT, N2_WRITER, 'update', attempt.idempotencyKey]), { request_hash: digest, document_id: N2_A_ID, result_head: head, result_snapshot_text: snapshotText });
      return { operation: 'update', idempotencyKey: attempt.idempotencyKey, requestHash: digest, document: head, snapshotText } as DocumentReceipt;
    }
  };
}
type N2Ledger = ReturnType<typeof n2Ledger>;
type N2Outcome = { kind: 'returned'; value: DocumentReceipt } | { kind: 'rejected'; error: unknown };
async function n2Observe(name: string, request: Promise<DocumentReceipt>, ledger: N2Ledger): Promise<N2Outcome> {
  let outcome: N2Outcome;
  try { outcome = { kind: 'returned', value: await request }; } catch (error) { outcome = { kind: 'rejected', error }; }
  const error = outcome.kind === 'rejected' && outcome.error instanceof Error ? outcome.error : undefined, record = error ? n2Record(error) : {};
  console.info(JSON.stringify({ native2Contract: name, outcome: outcome.kind, reason: record.reason ?? error?.message ?? null, status: record.status ?? null,
    classification: error instanceof N2LedgerSetupError ? 'SETUP_FAILURE' : 'PRODUCT_OUTCOME',
    lockedActorReached: ledger.events.some(e => e.kind === 'locked_current_actor'), lockedEpochReached: ledger.events.some(e => e.kind === 'locked_current_epoch'),
    snapshotEffectReached: ledger.events.some(e => e.kind === 'staged_snapshot'), receiptFailpointReached: ledger.failpointReached() }));
  return outcome;
}
function n2Admitted(outcome: N2Outcome): DocumentReceipt {
  const error = outcome.kind === 'rejected' && outcome.error instanceof Error ? outcome.error.message : '';
  expect(outcome.kind, `native2 positive admission prerequisite missing: ${error}`).toBe('returned');
  if (outcome.kind === 'rejected') throw outcome.error; return outcome.value;
}
function n2Rejected(outcome: N2Outcome, status: number, reason: string) {
  expect(outcome.kind, 'Format refusal/SETUP failure is not successful CAS/policy refusal').toBe('rejected');
  if (outcome.kind === 'returned') throw new Error('native2_expected_refusal_but_returned');
  expect(outcome.error).toMatchObject({ status, reason });
}
async function n2HeldOutcome(ledger: N2Ledger, name: string, action: () => Promise<DocumentReceipt>, change: () => void) {
  const barrier = ledger.holdMembership(), request = n2Observe(name, action(), ledger);
  const reached = await Promise.race([barrier.entered.promise.then(() => true), request.then(() => false)]);
  if (!reached) { console.info(JSON.stringify({ native2Contract: name, heldBarrier: 'NOT_REACHED' })); throw new Error('native2_admission_barrier_not_reached'); }
  change(); barrier.released.resolve(); return request;
}
describe('#495 native2 atomic snapshot/pin proposed contract', () => {
  describe('N2-01 complete new-page copy', () => {
    it('admits a codec-valid full native2 copy and stores the independent complete copy oracle', async () => {
      n2CodecPrecondition(N2_A_RAW, N2_A); n2CodecPrecondition(N2_B_RAW, N2_B);
      const l = n2Ledger(), beforeA = l.row(N2_A_ID), beforeB = l.row(N2_B_ID);
      const created = n2Admitted(await n2Observe('N2-01/create', l.store.create(n2Principal, N2_TENANT, n2Create()), l));
      expect(created.document.documentId).not.toBe(N2_A_ID); expect(created.document.pageId).toMatch(/^[0-9a-f-]{36}$/);
      const expected = n2ExpectedCopy(created.document.pageId!);
      expect(created.snapshotText).toBe(expected); expect(created.document.snapshotHash).toBe(n2Hash(expected));
      expect(created.document.creatorUserId).toBe(N2_WRITER);
      expect((await l.store.open(n2Principal, N2_TENANT, created.document.documentId)).snapshotText).toBe(expected);
      expect(await l.store.getReceipt(n2Principal, N2_TENANT, 'create', n2Create().idempotencyKey)).toEqual(created);
      expect(l.documentCount()).toBe(3); expect(l.receiptCount()).toBe(1);
      expect(l.row(N2_A_ID)).toEqual(beforeA); expect(l.row(N2_B_ID)).toEqual(beforeB);
    });
  });
  describe('N2-02 only A explicitly adopts definition2', () => {
    it('updates A content and selected111 definition2 atomically while the entire B remains unchanged', async () => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED);
      const l = n2Ledger(), beforeB = l.row(N2_B_ID), registryBefore = JSON.stringify([...l.registry]);
      const receipt = n2Admitted(await n2Observe('N2-02/adopt-A', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, n2Attempt()), l));
      const transaction = l.events.slice(), effectClient = transaction.find(e => e.kind === 'staged_snapshot')?.client;
      expect(effectClient).toBeDefined(); expect(transaction.filter(e => e.kind === 'BEGIN')).toHaveLength(1);
      expect(transaction.filter(e => ['locked_current_actor', 'locked_current_epoch', 'registry_row', 'complete_receipt', 'COMMIT'].includes(e.kind)).every(e => e.client === effectClient)).toBe(true);
      expect(transaction).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'locked_current_actor' }), expect.objectContaining({ kind: 'locked_current_epoch', epoch: 'editor:4' }), expect.objectContaining({ kind: 'registry_row' })]));
      expect(receipt.snapshotText).toBe(N2_ADOPT_RAW); expect(receipt.document).toMatchObject({ revision: 2, fileVersion: 2, snapshotHash: n2Hash(N2_ADOPT_RAW) });
      expect((await l.store.open(n2Principal, N2_TENANT, N2_A_ID)).snapshotText).toBe(N2_ADOPT_RAW);
      expect((await l.store.open(n2Principal, N2_TENANT, N2_B_ID)).snapshotText).toBe(N2_B_RAW);
      expect(l.row(N2_B_ID)).toEqual(beforeB); expect(JSON.stringify([...l.registry])).toBe(registryBefore); expect(l.receiptCount()).toBe(1);
    });
  });
  describe('N2-03 revision/raw hash/ordered prior pin CAS', () => {
    it('retains literal digest vectors with scoped document/state and exact selected order', () => {
      n2CodecPrecondition(N2_A_RAW, N2_A);
      for (const v of Object.values(N2_PIN_VECTORS)) expect(n2Hash(v.preimage)).toBe(v.sha256);
      expect(N2_PIN_VECTORS.orderedTwo.sha256).not.toBe(N2_PIN_VECTORS.reversedTwo.sha256);
      expect(JSON.parse(N2_PIN_VECTORS.pinned1.preimage)).toEqual(['wonffice.note.snapshot-pins.cas.v1', N2_TENANT, N2_WORKSPACE, N2_A_ID, 'pinned',
        [['11111111-1111-1111-1111-111111111111', 1, '0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a']]]);
    });
    it.each([
      ['revision', { expectedRevision: 99 }, 'revision_conflict'], ['rawhash', { expectedSnapshotHash: '0'.repeat(64) }, 'snapshot_hash_conflict'],
      ['priorpins', { expectedPriorPinDigest: N2_PIN_VECTORS.pinned2.sha256 }, 'schema_pin_conflict']
    ] as const)('rejects the independently mismatched %s without any committed content/pin/receipt', async (name, changes, reason) => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED); const l = n2Ledger(), before = l.stateText();
      n2Rejected(await n2Observe(`N2-03/${name}`, l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, n2Attempt(changes)), l), 409, reason);
      expect(l.stateText()).toBe(before); expect(l.receiptCount()).toBe(0);
    });
    it('refuses the sequential stale losing request without automatic reload/rebase/retry', async () => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED); const l = n2Ledger();
      n2Admitted(await n2Observe('N2-03/winner', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, n2Attempt()), l));
      const stale = Object.freeze(n2Attempt({ idempotencyKey: 'stale-independent-request' })), frozen = JSON.stringify(stale), before = l.stateText();
      n2Rejected(await n2Observe('N2-03/stale-loser', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, stale), l), 409, 'revision_conflict');
      expect(l.stateText()).toBe(before); expect(JSON.stringify(stale)).toBe(frozen);
    });
  });
  describe('N2-04 preserve explicit pins and full registered closure/policy', () => {
    it('keeps definition1 and complete embedded original text when definition2 is registered', async () => {
      n2CodecPrecondition(N2_A_RAW, N2_A); const l = n2Ledger(), beforeB = l.row(N2_B_ID);
      const receipt = n2Admitted(await n2Observe('N2-04/preserve', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID,
        n2Attempt({ schemaAction: 'preserve', snapshotText: N2_A_RAW, idempotencyKey: 'preserve-definition1' })), l));
      expect(receipt.snapshotText).toBe(N2_A_RAW); expect(l.row(N2_A_ID).snapshotText).toBe(N2_A_RAW); expect(l.row(N2_B_ID)).toEqual(beforeB);
      expect(JSON.parse(receipt.snapshotText!).schemaBundle).toEqual(N2_A.schemaBundle);
    });
    it.each(['missing', 'digest'] as const)('refuses codec-valid embedded pins with %s registered data', async kind => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED); const l = n2Ledger(), before = l.stateText(), key = '11111111-1111-1111-1111-111111111111:2';
      if (kind === 'missing') l.registry.delete(key); else l.registry.get(key)!.digest = 'f'.repeat(64);
      n2Rejected(await n2Observe(`N2-04/registry-${kind}`, l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, n2Attempt()), l),
        kind === 'missing' ? 422 : 409, kind === 'missing' ? 'dependency_missing' : 'schema_store_unavailable');
      expect(l.stateText()).toBe(before);
    });
    it('refuses a complete codec-valid foreign-scope bundle; embedded definitions grant no access', async () => {
      const raw = n2Raw(N2_FOREIGN_SCOPE); n2CodecPrecondition(raw, N2_FOREIGN_SCOPE); const l = n2Ledger(), before = l.stateText();
      n2Rejected(await n2Observe('N2-04/foreign-scope', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, n2Attempt({ snapshotText: raw })), l), 403, 'scope_forbidden');
      expect(l.stateText()).toBe(before);
    });
    it.each([true, false])('checks isolated dependency capability, allowed=%s', async allowed => {
      const raw = n2Raw(N2_CAPABILITY_ONLY); n2CodecPrecondition(raw, N2_CAPABILITY_ONLY); const policy = n2Policy();
      policy.noteSchemaPolicy[0].capabilities = allowed ? ['note.field.text.v1', 'note.field.choice.v1'] : ['note.field.text.v1'];
      const l = n2Ledger({ source: N2_CAPABILITY_ONLY, policy }), before = l.stateText();
      const root = JSON.parse(N2_CAPABILITY_ONLY.schemaBundle.definitions[0].definitionText) as { requiredCapabilities: string[] };
      expect(root.requiredCapabilities).toEqual(['note.field.text.v1']);
      const selected = N2_CAPABILITY_ONLY.schemaBundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest]);
      const prior = n2Hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', N2_TENANT, N2_WORKSPACE, N2_A_ID, 'pinned', selected]));
      const outcome = await n2Observe(`N2-04/dependency-cap-${allowed}`, l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID,
        n2Attempt({ schemaAction: 'preserve', snapshotText: raw, expectedSnapshotHash: n2Hash(raw), expectedPriorPinDigest: prior })), l);
      if (allowed) expect(n2Admitted(outcome).snapshotText).toBe(raw);
      else { n2Rejected(outcome, 403, 'scope_forbidden'); expect(l.stateText()).toBe(before); }
      // Unrelated declared dataset name is permitted by current codec, not schema-to-node identity proof.
    });
  });
  describe('N2-05 failure after staged content/pin effect', () => {
    it('reaches injected receipt failure and restores whole prior content/pins/head/receipts', async () => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED); const l = n2Ledger(), before = l.stateText(); l.injectAfterSnapshot();
      const outcome = await n2Observe('N2-05/receipt-failure', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, n2Attempt()), l);
      expect(l.failpointReached(), 'NOT REACHED is not rollback proof: native2 admission failed earlier').toBe(true);
      expect(outcome.kind).toBe('rejected'); if (outcome.kind === 'rejected') expect(outcome.error).toMatchObject({ message: 'injected_native2_receipt_failure' });
      expect(l.stateText()).toBe(before); expect(l.receiptCount()).toBe(0);
      expect(l.events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ROLLBACK' }), expect.objectContaining({ kind: 'release', destroy: true })]));
      expect(l.events.some(e => e.kind === 'COMMIT')).toBe(false);
    });
  });
  describe('N2-06 exact historical lost-ACK receipt/fixed request', () => {
    it('replays once, rejects changed fixed conditions, and never submits or confirms a later draft', async () => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED); const l = n2Ledger(), fixed = Object.freeze(n2Attempt()), fixedBytes = JSON.stringify(fixed);
      const draft = Object.freeze({ raw: N2_A_RAW + ' ', key: 'later-unsent-draft' }), draftBytes = JSON.stringify(draft);
      const first = n2Admitted(await n2Observe('N2-06/first', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, fixed), l)), saved = l.stateText();
      expect(n2Admitted(await n2Observe('N2-06/exact-replay', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, fixed), l))).toEqual(first);
      expect(l.stateText()).toBe(saved); expect(l.receiptCount()).toBe(1); expect(JSON.stringify(fixed)).toBe(fixedBytes); expect(JSON.stringify(draft)).toBe(draftBytes);
      for (const changed of [{ expectedRevision: 2 }, { expectedSnapshotHash: '0'.repeat(64) }, { expectedPriorPinDigest: N2_PIN_VECTORS.pinned2.sha256 },
        { schemaAction: 'preserve' as const }, { snapshotText: N2_ADOPT_RAW + ' ' }]) {
        n2Rejected(await n2Observe('N2-06/key-reuse', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, { ...fixed, ...changed }), l), 409, 'key_reuse');
        expect(l.stateText()).toBe(saved);
      }
      const next = n2Attempt({ expectedRevision: 2, expectedSnapshotHash: n2Hash(N2_ADOPT_RAW), expectedPriorPinDigest: N2_PIN_VECTORS.pinned2.sha256,
        schemaAction: 'preserve', snapshotText: N2_ADOPT_RAW + ' ', idempotencyKey: 'later-authorized-explicit-request' });
      n2Admitted(await n2Observe('N2-06/later-independent', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, next), l));
      const afterLater = l.stateText(), historical = n2Admitted(await n2Observe('N2-06/historical', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, fixed), l));
      expect(historical).toEqual(first); expect(l.stateText()).toBe(afterLater); expect(JSON.stringify(draft)).toBe(draftBytes);
      expect(historical.document.revision).toBe(2); expect(l.row(N2_A_ID).revision).toBe(3);
    });
    it('rechecks current capabilities before revealing a seeded historical full receipt', async () => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED); const policy = n2Policy(); policy.noteSchemaPolicy[0].capabilities = [];
      const l = n2Ledger({ policy }), seeded = l.seedReceipt(n2Attempt()), before = l.stateText();
      // Historical seeded fixture is not a claimed successful native2 save in this run.
      expect(seeded.snapshotText).toBe(N2_ADOPT_RAW);
      n2Rejected(await n2Observe('N2-06/current-receipt-policy', l.store.getReceipt(n2Principal, N2_TENANT, 'update', seeded.idempotencyKey), l), 403, 'scope_forbidden');
      expect(l.stateText()).toBe(before);
    });
  });
  describe('N2-07 held membership versus current locked authority/epoch', () => {
    it.each(['viewer', 'revoked', 'retired', 'restored-policy-denied'] as const)('refuses current %s after stale membership capture', async kind => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED); const policy = n2Policy(); if (kind === 'restored-policy-denied') policy.noteSchemaPolicy[0].adoptRoles = [];
      const l = n2Ledger({ policy }), before = l.stateText();
      const outcome = await n2HeldOutcome(l, `N2-07/${kind}`, () => l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, n2Attempt()),
        () => l.authority(kind === 'viewer' ? { role: 'viewer', epoch: 'viewer:5' } : kind === 'restored-policy-denied'
          ? { role: 'editor', epoch: 'editor:9' } : { active: false, epoch: `editor:${kind === 'retired' ? 8 : 6}` }));
      expect(outcome.kind).toBe('rejected'); if (outcome.kind === 'rejected') {
        if (kind === 'revoked' || kind === 'retired') expect(outcome.error).toBeInstanceOf(TenantAccessDeniedError);
        else expect(outcome.error).toMatchObject({ status: 403, reason: kind === 'viewer' ? 'forbidden' : 'scope_forbidden' });
      }
      expect(l.stateText()).toBe(before); expect(l.events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'locked_current_actor' })]));
    });
    it('rechecks current read policy before releasing a receipt after captured role becomes viewer', async () => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED); const l = n2Ledger(), seeded = l.seedReceipt(n2Attempt()), before = l.stateText();
      const outcome = await n2HeldOutcome(l, 'N2-07/receipt-viewer', () => l.store.getReceipt(n2Principal, N2_TENANT, 'update', seeded.idempotencyKey),
        () => l.authority({ role: 'viewer', epoch: 'viewer:5' }));
      n2Rejected(outcome, 403, 'scope_forbidden'); expect(l.stateText()).toBe(before);
    });
    it('uses the current permitted restored epoch without inventing old/current epoch equality', async () => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED); const l = n2Ledger();
      const outcome = await n2HeldOutcome(l, 'N2-07/restored-permitted', () => l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, n2Attempt()),
        () => l.authority({ role: 'editor', epoch: 'editor:9' }));
      expect(n2Admitted(outcome).snapshotText).toBe(N2_ADOPT_RAW);
      expect(l.events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'locked_current_epoch', epoch: 'editor:9' })]));
    });
    it('ignores body actor/approval/epoch grants when current role is viewer', async () => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED); const l = n2Ledger(); l.authority({ role: 'viewer', epoch: 'viewer:5' }); const before = l.stateText();
      const claimed = { ...n2Attempt(), approved: true, actorRole: 'owner', authorityEpoch: 'owner:1' };
      n2Rejected(await n2Observe('N2-07/body-claims', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, claimed), l), 403, 'forbidden'); expect(l.stateText()).toBe(before);
    });
  });
  describe('N2-08 mode and explicit unaware/default1 boundaries', () => {
    it.each(['initializing', 'collaborative'] as const)('refuses content/pin overwrite and replay in %s mode', async mode => {
      n2CodecPrecondition(N2_ADOPT_RAW, N2_A_ADOPTED); const l = n2Ledger({ mode }), before = l.stateText();
      n2Rejected(await n2Observe(`N2-08/${mode}`, l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, n2Attempt()), l), 409, 'mode_conflict'); expect(l.stateText()).toBe(before);
      const seeded = l.seedReceipt(n2Attempt()), withReceipt = l.stateText();
      n2Rejected(await n2Observe(`N2-08/${mode}-receipt`, l.store.getReceipt(n2Principal, N2_TENANT, 'update', seeded.idempotencyKey), l), 409, 'mode_conflict'); expect(l.stateText()).toBe(withReceipt);
    });
    it('keeps codec-aware2 separate from unaware1 and refuses implicit downgrade', async () => {
      n2CodecPrecondition(N2_A_RAW, N2_A); expect(readUnawareFile(N2_A_RAW)).toHaveProperty('error');
      const downgrade = JSON.parse(N2_A_RAW) as N2Literal; downgrade.version = 1; expect(readUnawareFile(n2Raw(downgrade))).toHaveProperty('error');
      const l = n2Ledger(), before = l.stateText();
      n2Rejected(await n2Observe('N2-08/implicit-downgrade', l.store.updateSnapshot(n2Principal, N2_TENANT, N2_A_ID, n2Attempt({ snapshotText: n2Raw(downgrade) })), l), 422, 'invalid_document_format'); expect(l.stateText()).toBe(before);
    });
  });
});
