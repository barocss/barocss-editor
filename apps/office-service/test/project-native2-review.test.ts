import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ProjectExecutionStore, captureNative2ParagraphReview, type LocalExecutionInput, type LocalExecutionAdapter, type Native2ParagraphReviewWitness } from '../src/project-execution.js';
import { captureExecutionTarget, expectedExecutionSnapshot } from '../src/project-execution-native.js';
import type { ProjectExecutionContext, ProjectRecord, ProjectStore, ProjectTarget } from '../src/project-store.js';
import type { VerifiedPrincipal } from '../src/membership-store.js';
import { ProjectError, validateProjectAction } from '../src/project-store.js';

const target = { kind: 'note-native2-paragraph-review', id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  quote: '{"stype":"paragraph","content":[{"stype":"inline-text","text":"original"}]}',
  selector: { version: 2, pageId: 'native2-note-A', paragraphIndex: 1 } };
const action = () => ({ type: 'comment', resultId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', target: structuredClone(target),
  body: 'Review only', source: { documentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', revision: 1, snapshotHash: 'a'.repeat(64) } });

it('admits a bounded explicit native2 review selector without granting a native-v1 edit', () => {
  expect(() => validateProjectAction(action())).not.toThrow();
});
it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('refuses invalid native2 paragraph index %s', index => {
  const value = action(); value.target.selector.paragraphIndex = index;
  expect(() => validateProjectAction(value)).toThrow('invalid_request');
});
it('refuses forged extra target/selector fields, version substitution and the existing quote budget', () => {
  const value = action();
  expect(() => validateProjectAction({ ...value, target: { ...value.target, writer: true } })).toThrow();
  expect(() => validateProjectAction({ ...value, target: { ...value.target, selector: { ...value.target.selector, version: 1 } } })).toThrow();
  expect(() => validateProjectAction({ ...value, target: { ...value.target, selector: { ...value.target.selector, path: [1] } } })).toThrow();
  expect(() => validateProjectAction({ ...value, target: { ...value.target, quote: 'x'.repeat(8001) } })).toThrow('invalid_text');
});

// Complete independently declared Editor A/B literals, copied as data only.
// Controlled store/SQL/provider doubles below are not PG, OIDC or model evidence.
const corpus = {
  "SOURCE_A": {
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
  },
  "SOURCE_B": {
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
  }
};

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const projectId = 'cccccccc-cccc-cccc-cccc-cccccccccccc', workId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const documentId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const args = [{ issuer: 'https://controlled.test', subject: 'editor' }, tenantId, projectId, workId] as const;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
function reviewFixture(options: { held?: boolean; missing?: boolean; unknown?: boolean; wrongVersion?: boolean; mutate?: boolean; invalidClone?: boolean } = {}) {
  const raw = JSON.stringify(corpus.SOURCE_A, null, 2) + '\n';
  const quote = JSON.stringify(corpus.SOURCE_A.document.content[1]);
  const reviewTarget: ProjectTarget = { kind: 'note-native2-paragraph-review', id: target.id, quote,
    selector: { version: 2, pageId: corpus.SOURCE_A.document.attributes.pageId, paragraphIndex: 1 } };
  const pin = { id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', document: { product: 'note' as const, id: documentId },
    revision: 7, text: raw, title: 'A' };
  const record: ProjectRecord = { id: projectId, title: 'Review', goal: 'Review only', archived: false,
    results: [{ id: 'result', name: 'A', document: pin.document, inputs: [] }],
    comments: [{ id: 'comment', resultId: 'result', target: reviewTarget, pin, actor: { kind: 'human', id: 'actor', label: 'Editor' },
      body: 'Review complete paragraph', createdAt: '2026-10-09', status: 'open', workId }],
    works: [{ id: workId, commentId: 'comment', request: 'Review this full paragraph', state: 'unconnected', inputs: [pin],
      outputs: ['result'], reason: 'Ready', createdAt: '2026-10-09' }], activities: [], drafts: {} };
  const source = { id: documentId, product: 'note' as const, title: 'A', mode: 'snapshot', revision: 7,
    snapshot_text: raw, snapshot_hash: hash(raw), file_format: 'barocss-note', file_version: 2, page_id: 'native2-note-A' };
  let stored: Record<string, unknown> | undefined, reviewCalls = 0, legacyCalls = 0, denial: ProjectError | undefined;
  let seenInput: LocalExecutionInput | undefined, seenWitness: Native2ParagraphReviewWitness | undefined;
  const ledger: string[] = [], entered = deferred(), release = deferred();
  const client = { release: () => {}, query: async (sql: string, values: unknown[] = []) => {
    ledger.push(sql);
    if (sql.includes('FROM pg_roles')) return { rows: [{ safe: true, context_empty: true }] };
    if (sql.startsWith('SELECT data FROM wonffice.project_executions')) return { rows: stored ? [{ data: structuredClone(stored) }] : [] };
    if (sql.startsWith('SELECT document_id,snapshot_revision')) return { rows: [{ document_id: documentId,
      snapshot_revision: pin.revision, snapshot_hash: hash(pin.text), snapshot_text: pin.text }] };
    if (sql.startsWith('INSERT INTO wonffice.project_executions')) stored = JSON.parse(String(values[8])) as Record<string, unknown>;
    else if (sql.startsWith('UPDATE wonffice.project_executions')) stored = JSON.parse(String(values[3])) as Record<string, unknown>;
    else if (sql.startsWith('SELECT wonffice.complete_project_execution')) Object.assign(stored!, JSON.parse(String(values[4])));
    else if (!['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) && !sql.startsWith('SET LOCAL') && !sql.startsWith('SELECT set_config'))
      throw new Error(`Unexpected SQL: ${sql}`);
    return { rows: [], rowCount: 1 };
  } } as unknown as PoolClient;
  const context: ProjectExecutionContext = { client, project: { id: projectId, workspace_id: workspaceId, revision: 4, data: record },
    actor: { kind: 'human', id: 'actor', label: 'Editor' }, authorityEpoch: 'editor:0:xmin',
    document: async () => { if (denial) throw denial; return source; } };
  const projects: Pick<ProjectStore, 'withExecutionContext'> = { withExecutionContext: async <T>(_p: VerifiedPrincipal, _t: string,
    _id: string, writable: boolean, operation: (context: ProjectExecutionContext) => Promise<T>) => {
    if (writable && context.authorityEpoch.startsWith('viewer')) throw new ProjectError(403, 'forbidden');
    return operation(context);
  } };
  const adapter: LocalExecutionAdapter = { generate: async () => { legacyCalls++; throw new Error('legacy_must_not_dispatch_native2'); } };
  if (!options.missing) adapter.generateNative2Review = async (input, witness) => {
    reviewCalls++; seenInput = structuredClone(input); seenWitness = witness; entered.resolve();
    if (options.held) await release.promise;
    if (options.unknown) throw new Error('Controlled lost response');
    if (options.mutate) { expect(Object.isFrozen(input.target)).toBe(true); expect(Object.isFrozen(witness.paragraph)).toBe(true);
      expect(() => { input.target.text = 'mutated'; }).toThrow(); }
    const proposal = { replacement: 'Controlled review output', reason: 'Fixed test response', assumptions: [] };
    return { proposal, ...(options.invalidClone ? { untrustedFunction: () => {} } : {}), provenance: { kind: 'live-local-model', adapterVersion: options.wrongVersion ? '4' : '4-native2-review-v1',
      model: 'controlled-fixed-output', modelDigest: 'a'.repeat(64), runtimeVersion: 'controlled-test',
      inputHash: hash(JSON.stringify(input)), responseHash: 'b'.repeat(64), proposalHash: hash(JSON.stringify(proposal)),
      startedAt: '2026-10-09T00:00:00Z', completedAt: '2026-10-09T00:00:01Z', contextTokens: 32768, outputTokenLimit: 4096,
      promptBytes: 1000, promptEvalCount: 500, evalCount: 20 } };
  };
  const store = new ProjectExecutionStore({ connect: async () => client } as unknown as Pool, adapter, projects);
  return { store, record, context, source, raw, reviewTarget, entered, release, ledger, stored: () => stored!,
    input: () => seenInput!, witness: () => seenWitness!, calls: () => [reviewCalls, legacyCalls],
    deny: (reason: string) => { denial = new ProjectError(403, reason); },
    execute: () => store.execute(...args, { expectedRevision: context.project.revision }) };
}

describe('controlled canonical native2 review', () => {
  it.each([['SOURCE_A', 1], ['SOURCE_B', 0]] as const)('uses actual shared capture for complete %s without native writes', (name, index) => {
    const file = corpus[name], raw = JSON.stringify(file, null, 2) + '\n', paragraph = file.document.content[index];
    const held: ProjectTarget = { kind: 'note-native2-paragraph-review', id: target.id, quote: JSON.stringify(paragraph),
      selector: { version: 2, pageId: file.document.attributes.pageId, paragraphIndex: index } };
    expect(captureExecutionTarget(raw, held)).toEqual({ nodeId: target.id, text: JSON.stringify(paragraph), from: 0,
      to: JSON.stringify(paragraph).length, path: [index] });
    expect(() => expectedExecutionSnapshot(raw, held, 'proposal')).toThrow('native2_review_only');
    expect(captureNative2ParagraphReview(raw, index).snapshotText).toBe(raw);
  });
  it('dispatches exact13 fields and complete witness through only the trusted review method; input/provider mutations cannot change source', async () => {
    const f = reviewFixture({ mutate: true }), beforeB = JSON.stringify(corpus.SOURCE_B), result = (await f.execute()).execution;
    expect(result.phase).toBe('proposal'); expect(f.calls()).toEqual([1, 0]);
    expect(Object.keys(f.input())).toEqual(['attemptId','tenantId','workspaceId','projectId','workId','actorId','request',
      'documentId','revision','snapshotHash','snapshotText','target','inputs']);
    expect(f.input().snapshotText).toBe(f.raw); expect(f.input().snapshotHash).toBe(hash(f.raw));
    expect(f.input().target.text).toBe(JSON.stringify(corpus.SOURCE_A.document.content[1]));
    expect(f.witness().schemaBundle).toEqual(corpus.SOURCE_A.schemaBundle);
    expect(f.witness().paragraph).toEqual(corpus.SOURCE_A.document.content[1]);
    expect(result.binding?.operation).toBe('note.paragraph.review/native2-v1');
    if (result.binding?.operation !== 'note.paragraph.review/native2-v1') throw new Error('Missing review binding');
    expect(result.binding.priorPinDigest).toBe(hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenantId, workspaceId,
      documentId, 'pinned', corpus.SOURCE_A.schemaBundle.selected.map(ref => [ref.schemaId, ref.version, ref.digest])])));
    expect(result.binding.witness.snapshotText).toBe(f.raw); expect(result.expectedSnapshotText).toBeUndefined();
    expect(result.expectedSnapshotHash).toBeUndefined(); expect(result.appliedRevision).toBeUndefined();
    expect(f.source.snapshot_text).toBe(f.raw); expect(JSON.stringify(corpus.SOURCE_B)).toBe(beforeB);
    expect(f.ledger.some(sql => /UPDATE wonffice\.(document|schema)|INSERT INTO wonffice\.(document|schema)/.test(sql))).toBe(false);
    expect((await f.store.get(...args)).execution).toEqual(result);
    expect((await f.execute()).execution).toEqual(result); expect(f.calls()).toEqual([1, 0]);
  });
  it('refuses a missing trusted method before reservation and never falls back to legacy generate', async () => {
    const f = reviewFixture({ missing: true });
    await expect(f.execute()).rejects.toMatchObject({ reason: 'native2_review_unconnected' });
    expect(f.calls()).toEqual([0, 0]); expect(f.stored()).toBeUndefined();
  });
  it('refuses viewer execution even when native2 data reads are configured', async () => {
    const f = reviewFixture(); f.context.authorityEpoch = 'viewer:0:xmin';
    await expect(f.execute()).rejects.toMatchObject({ status: 403 }); expect(f.calls()).toEqual([0, 0]);
  });
  it.each(['page', 'quote', 'index', 'unsupported', 'oversize'] as const)('refuses %s before dispatch without simplifying the full source', async kind => {
    const f = reviewFixture();
    if (f.reviewTarget.kind !== 'note-native2-paragraph-review') throw new Error('Missing test target');
    if (kind === 'page') f.reviewTarget.selector.pageId = 'different';
    if (kind === 'quote') f.reviewTarget.quote += ' ';
    if (kind === 'index') f.reviewTarget.selector.paragraphIndex = 0;
    if (kind === 'unsupported' || kind === 'oversize') {
      const file = structuredClone(corpus.SOURCE_A);
      if (kind === 'oversize') file.document.metadata.labels = ['x'.repeat(65536)];
      else Object.assign(file.document.content[0], { stype: 'unsupported-block' });
      const raw = JSON.stringify(file); f.source.snapshot_text = raw; f.source.snapshot_hash = hash(raw);
      f.record.comments[0].pin.text = raw; f.record.works[0].inputs[0].text = raw;
    }
    await expect(f.execute()).rejects.toBeInstanceOf(ProjectError); expect(f.calls()).toEqual([0, 0]); expect(f.stored()).toBeUndefined();
  });
  it.each(['authority', 'source', 'request', 'policy', 'paused'] as const)('withholds held model response after current %s changes and retains only a blocked receipt', async kind => {
    const f = reviewFixture({ held: true }), pending = f.execute(); await f.entered.promise;
    if (kind === 'authority') f.context.authorityEpoch = 'editor:2:new-xmin';
    if (kind === 'source') f.source.revision++;
    if (kind === 'request') f.record.works[0].request = 'A later request';
    if (kind === 'policy') f.deny('scope_forbidden');
    if (kind === 'paused') f.record.works[0].state = 'paused';
    f.release.resolve(); await expect(pending).rejects.toBeInstanceOf(ProjectError);
    expect(f.stored().phase).toBe('blocked'); expect(f.calls()).toEqual([1, 0]);
    await expect(f.store.get(...args)).rejects.toBeInstanceOf(ProjectError);
    expect(f.source.snapshot_text).toBe(f.raw);
  });
  it('keeps lost response unknown and does not dispatch the same durable attempt again', async () => {
    const f = reviewFixture({ unknown: true }), result = (await f.execute()).execution;
    expect(result.phase).toBe('unknown'); expect((await f.execute()).execution).toEqual(result); expect(f.calls()).toEqual([1, 0]);
    await expect(f.store.authorizeAcceptance(...args, result.id, {})).rejects.toMatchObject({ reason: 'native2_review_only' });
  });
  it('refuses legacy provenance mode even with valid unchanged provenance hashes', async () => {
    const f = reviewFixture({ wrongVersion: true }), result = (await f.execute()).execution;
    expect(result.phase).toBe('failed'); expect(result.reason).toBe('invalid_provenance'); expect(result.proposal).toBeUndefined();
  });
  it.each(['normal', 'copied-binding', 'forged-accepted', 'forged-legacy'] as const)('never authorizes accept/ack for %s native2 review receipt', async kind => {
    const f = reviewFixture(), result = (await f.execute()).execution;
    if (kind === 'copied-binding') f.stored().binding = structuredClone(result.binding);
    if (kind === 'forged-accepted') { f.stored().phase = 'accepted'; f.stored().expectedSnapshotText = 'forged'; }
    if (kind === 'forged-legacy') { f.stored().binding = undefined; f.stored().target = { kind: 'note-paragraph', id: target.id,
      quote: 'forged', selector: { version: 1, pageId: 'native2-note-A', paragraphIndex: 1 } }; }
    await expect(f.store.authorizeAcceptance(...args, result.id, {})).rejects.toMatchObject({ reason: 'native2_review_only' });
    await expect(f.store.acknowledge(...args, result.id, { revision: 8, snapshotHash: 'a'.repeat(64) }))
      .rejects.toMatchObject({ reason: 'native2_review_only' }); expect(f.source.snapshot_text).toBe(f.raw);
  });
  it('recomputes stored binding from exact original raw and selector on receipt recovery', async () => {
    const f = reviewFixture(), result = (await f.execute()).execution;
    const binding = structuredClone(result.binding);
    if (binding?.operation !== 'note.paragraph.review/native2-v1') throw new Error('Missing binding');
    f.stored().binding = { ...binding, priorPinDigest: 'a'.repeat(64) };
    await expect(f.store.get(...args)).rejects.toMatchObject({ reason: 'native2_review_binding_mismatch' });
    expect(f.calls()).toEqual([1, 0]);
  });
});

it.each(['invalid-json', 'missing-bundle', 'partial-bundle', 'conflicting-digest', 'foreign-source'] as const)('refuses controlled %s raw before any model dispatch', async kind => {
  const f = reviewFixture();
  const file = JSON.parse(f.raw) as Record<string, unknown>;
  if (kind === 'missing-bundle') delete file.schemaBundle;
  if (kind === 'partial-bundle') file.schemaBundle = { bundleVersion: 1, selected: [] };
  if (kind === 'conflicting-digest') {
    const bundle = file.schemaBundle as { selected: Array<{ digest: string }> }; bundle.selected[0].digest = 'a'.repeat(64);
  }
  if (kind === 'foreign-source') f.source.id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const raw = kind === 'invalid-json' ? '{' : JSON.stringify(file);
  f.source.snapshot_text = raw; f.source.snapshot_hash = hash(raw);
  f.record.comments[0].pin.text = raw; f.record.works[0].inputs[0].text = raw;
  await expect(f.execute()).rejects.toBeInstanceOf(ProjectError); expect(f.calls()).toEqual([0, 0]);
});

it.each(['extra-field', 'array-order', 'paragraph-string', 'selector-index'] as const)('refuses restored binding %s changes without a model retry', async kind => {
  const f = reviewFixture(), result = (await f.execute()).execution;
  const binding = structuredClone(result.binding);
  if (binding?.operation !== 'note.paragraph.review/native2-v1') throw new Error('Missing binding');
  if (kind === 'extra-field') Object.assign(binding.witness, { callerPermission: undefined });
  if (kind === 'array-order') Object.assign(binding.witness, { segments: [...binding.witness.segments].reverse() });
  if (kind === 'paragraph-string') Object.assign(binding.witness, { paragraphJSON: binding.witness.paragraphJSON + ' ' });
  if (kind === 'selector-index') binding.target.selector.paragraphIndex++;
  f.stored().binding = binding;
  await expect(f.store.get(...args)).rejects.toMatchObject({ reason: 'native2_review_binding_mismatch' });
  expect(f.calls()).toEqual([1, 0]);
});

it('records an observed uncloneable provider response as invalid output, not an unknown model outcome', async () => {
  const f = reviewFixture({ invalidClone: true }), result = (await f.execute()).execution;
  expect(result.phase).toBe('failed'); expect(result.reason).toBe('invalid_proposal');
  expect(result.proposal).toBeUndefined(); expect(f.calls()).toEqual([1, 0]); expect(f.source.snapshot_text).toBe(f.raw);
});
