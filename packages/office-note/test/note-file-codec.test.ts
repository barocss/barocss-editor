import { describe, expect, it } from 'vitest';
import { NOTE_FILE_FORMAT, NOTE_FILE_VERSION, copyNoteSnapshotFile, readNoteFile, readNoteSnapshotFile, serializeNoteFile, type NoteDocument } from '../src/note-file-codec';
import { noteFileText } from '../src/note-file';

const document = (): NoteDocument => ({
  stype: 'note',
  attributes: { title: '계획', pageId: 'original' },
  content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '본문' }] }]
});

describe('Note snapshot file codec', () => {
  it('produces identical bytes without a clock and preserves savedAt absence', () => {
    const before = document();
    const first = serializeNoteFile(before);
    expect(serializeNoteFile(before)).toBe(first);
    expect(JSON.parse(first)).toMatchObject({ format: NOTE_FILE_FORMAT, version: NOTE_FILE_VERSION });
    expect(Object.hasOwn(JSON.parse(first), 'savedAt')).toBe(false);
    expect(readNoteSnapshotFile(first)).toEqual({ document: before });
  });

  it('preserves an explicit savedAt string and strips session IDs', () => {
    const before = { ...document(), sid: 'session:root' };
    const savedAt = '2026-09-23T10:00:00+09:00';
    const text = serializeNoteFile(before, { savedAt });
    expect(text).not.toContain('session:root');
    expect(JSON.parse(text).savedAt).toBe(savedAt);
    expect(readNoteSnapshotFile(text)).toEqual({ document: document(), savedAt });
    expect(serializeNoteFile(document(), { savedAt })).toBe(text);
    expect(readNoteSnapshotFile(serializeNoteFile(document(), { savedAt: 'not-a-date' }))).toEqual({ document: document(), savedAt: 'not-a-date' });
  });

  it('rejects invalid savedAt for server migration while the local reader remains compatible', () => {
    const base = JSON.parse(serializeNoteFile(document()));
    for (const savedAt of ['', 0, null, false, {}]) {
      const text = JSON.stringify({ ...base, savedAt });
      expect(readNoteFile(text)).toEqual({ document: document() });
      expect(readNoteSnapshotFile(text)).toEqual({ error: '이 파일의 저장 시각이 올바르지 않습니다.' });
      expect(() => serializeNoteFile(document(), { savedAt } as { savedAt: string })).toThrow('저장 시각');
    }
  });

  it('keeps the existing download writer timestamped', () => {
    expect(typeof JSON.parse(noteFileText(document())).savedAt).toBe('string');
  });

  it('copies a page with a new ID and remaps only its own references, including resources', () => {
    const ref = (pageId: string) => ({ stype: 'pageReference', attributes: { pageId, title: pageId } });
    const before: NoteDocument = { ...document(), content: [
      { stype: 'paragraph', content: [ref('original'), ref('external')] },
      { stype: 'resources', content: [
        { stype: 'richText', attributes: { id: 'body' }, content: [{ stype: 'paragraph', content: [ref('original')] }] }
      ] }
    ] };
    const sourceText = serializeNoteFile(before, { savedAt: '2026-09-23T01:00:00Z' });
    const result = copyNoteSnapshotFile(sourceText, 'copy-1');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result).toMatchObject({ pageId: 'copy-1' });
    expect(copyNoteSnapshotFile(sourceText, 'copy-1')).toEqual(result);
    const stored = JSON.parse(result.snapshotText);
    expect(stored.savedAt).toBe('2026-09-23T01:00:00Z');
    expect(stored.document.attributes.pageId).toBe('copy-1');
    expect(stored.document.content[0].content.map((node: { attributes: { pageId: string } }) => node.attributes.pageId)).toEqual(['copy-1', 'external']);
    expect(stored.document.content[1].content[0].content[0].content[0].attributes.pageId).toBe('copy-1');
    expect(readNoteFile(result.snapshotText)).toHaveProperty('document');
    expect(JSON.parse(sourceText).document.attributes.pageId).toBe('original');
  });

  it('assigns a new ID to legacy files and leaves invalid migration inputs untouched', () => {
    const legacy = { ...document(), attributes: { title: '계획' } };
    const copied = copyNoteSnapshotFile(serializeNoteFile(legacy), 'copy-2');
    expect(copied).toMatchObject({ pageId: 'copy-2' });
    if ('error' in copied) return;
    expect(Object.hasOwn(JSON.parse(copied.snapshotText), 'savedAt')).toBe(false);
    expect(JSON.parse(copied.snapshotText).document.attributes.pageId).toBe('copy-2');

    const malformed = JSON.stringify({ ...JSON.parse(serializeNoteFile(document())), savedAt: '' });
    expect(copyNoteSnapshotFile(malformed, 'copy-3')).toHaveProperty('error');
    expect(() => copyNoteSnapshotFile(serializeNoteFile(document()), 'original')).toThrow('달라야');
    expect(() => copyNoteSnapshotFile(serializeNoteFile(document()), '../invalid')).toThrow('페이지 ID');
    expect(() => copyNoteSnapshotFile(serializeNoteFile(document()), '__proto__')).toThrow('페이지 ID');
  });
});


// Adopted future refusal contract. These are unsupported native-v1 pin claims,
// not installed schemas or a claim that the current product already refuses them.
describe('reserved schema claims in native-v1 files', () => {
  const fixtures = [
  {
    "label": "A",
    "format": "barocss-note",
    "version": 1,
    "savedAt": "authored source stamp A",
    "document": {
      "stype": "note",
      "attributes": {
        "title": "검사 자료 A",
        "pageId": "schema-note-A"
      },
      "content": [
        {
          "stype": "paragraph",
          "attributes": {
            "authoredTag": "paragraph-A"
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "계획 A",
              "marks": [
                {
                  "stype": "bold",
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
                "pageId": "schema-note-A",
                "title": "A 내부 참조"
              }
            },
            {
              "stype": "pageReference",
              "attributes": {
                "pageId": "external-note-A",
                "title": "A 외부 참조"
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
                          "text": "A cell"
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
                "name": "tasks-A",
                "fields": [
                  {
                    "name": "Label",
                    "kind": "text"
                  },
                  {
                    "name": "Count",
                    "kind": "number"
                  },
                  {
                    "name": "Done",
                    "kind": "boolean"
                  },
                  {
                    "name": "State",
                    "kind": "choice",
                    "options": [
                      "계획",
                      "진행"
                    ]
                  }
                ],
                "rowIds": [
                  "row-A-1",
                  "row-A-2"
                ],
                "records": [
                  {
                    "Label": "자료 A",
                    "Count": 7,
                    "Done": false,
                    "State": "계획"
                  },
                  {
                    "Label": "값이 생략된 A"
                  }
                ]
              }
            },
            {
              "stype": "richText",
              "attributes": {
                "id": "row-A-1"
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
                          "stype": "italic",
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
                        "pageId": "schema-note-A",
                        "title": "자료 A"
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
  {
    "label": "B",
    "format": "barocss-note",
    "version": 1,
    "document": {
      "stype": "note",
      "attributes": {
        "title": "검사 자료 B",
        "pageId": "schema-note-B"
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
                  "stype": "italic",
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
                "pageId": "external-note-B",
                "title": "B 외부 참조"
              }
            },
            {
              "stype": "pageReference",
              "attributes": {
                "pageId": "schema-note-B",
                "title": "B 내부 참조"
              }
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
                      "attributes": {
                        "authoredTag": "cell-B"
                      },
                      "content": [
                        {
                          "stype": "inline-text",
                          "text": "B cell",
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
          "stype": "codeBlock",
          "attributes": {
            "language": "javascript"
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "const ready = true;"
            }
          ]
        },
        {
          "stype": "resources",
          "content": [
            {
              "stype": "dataset",
              "attributes": {
                "name": "tasks-B",
                "fields": [
                  {
                    "name": "Name",
                    "kind": "text"
                  },
                  {
                    "name": "Amount",
                    "kind": "number"
                  },
                  {
                    "name": "Ready",
                    "kind": "boolean"
                  },
                  {
                    "name": "Stage",
                    "kind": "choice",
                    "options": [
                      "검토",
                      "완료"
                    ]
                  }
                ],
                "rowIds": [
                  "row-B-1"
                ],
                "records": [
                  {
                    "Name": "자료 B",
                    "Amount": 0,
                    "Ready": true,
                    "Stage": "검토"
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
                      "text": "항목 본문 B"
                    },
                    {
                      "stype": "pageReference",
                      "attributes": {
                        "pageId": "external-note-B",
                        "title": "보존할 외부 자료"
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
] as const;
  const claim = { schemaId: 'note-work-items', version: 1, digest: 'a'.repeat(64) };
  const expected = [
    { document: 'A', placement: 'schemaLock', refused: true },
    { document: 'A', placement: 'schemaRef', refused: true },
    { document: 'B', placement: 'schemaLock', refused: true },
    { document: 'B', placement: 'schemaRef', refused: true }
  ];

  it('refuses reserved schema metadata in native-v1 before resave', () => {
    const outcomes = [];
    for (const fixture of fixtures) {
      const { label, ...legacy } = fixture;
      const fixtureBefore = JSON.stringify(fixture);
      const legacyText = `${JSON.stringify(legacy, null, 2)}\n`;
      expect(readNoteSnapshotFile(legacyText)).toEqual({ document: legacy.document,
        ...('savedAt' in legacy ? { savedAt: legacy.savedAt } : {}) });
      for (const placement of ['schemaLock', 'schemaRef'] as const) {
        const claimed = placement === 'schemaLock' ? { ...legacy, schemaLock: [claim] }
          : { ...legacy, document: { ...legacy.document,
            attributes: { ...legacy.document.attributes, schemaRef: claim } } };
        const source = `${JSON.stringify(claimed, null, 2)}\n`, sourceBefore = source;
        const claimedBefore = JSON.stringify(claimed);
        const result = readNoteSnapshotFile(source);
        expect(source).toBe(sourceBefore); expect(JSON.stringify(claimed)).toBe(claimedBefore);
        expect(JSON.stringify(fixture)).toBe(fixtureBefore);
        outcomes.push({ document: label, placement,
          refused: 'error' in result && typeof result.error === 'string' && result.error.length > 0 });
      }
    }
    expect(outcomes).toEqual(expected);
  });

  it('refuses independent copying of native-v1 schema metadata without changing source', () => {
    const outcomes = [];
    for (const fixture of fixtures) {
      const { label, ...legacy } = fixture;
      const fixtureBefore = JSON.stringify(fixture);
      const legacyText = `${JSON.stringify(legacy, null, 2)}\n`;
      expect(readNoteSnapshotFile(legacyText)).toEqual({ document: legacy.document,
        ...('savedAt' in legacy ? { savedAt: legacy.savedAt } : {}) });
      for (const placement of ['schemaLock', 'schemaRef'] as const) {
        const claimed = placement === 'schemaLock' ? { ...legacy, schemaLock: [claim] }
          : { ...legacy, document: { ...legacy.document,
            attributes: { ...legacy.document.attributes, schemaRef: claim } } };
        const source = `${JSON.stringify(claimed, null, 2)}\n`, sourceBefore = source;
        const claimedBefore = JSON.stringify(claimed);
        const result = copyNoteSnapshotFile(source, `independent-copy-${label}`);
        expect(source).toBe(sourceBefore); expect(JSON.stringify(claimed)).toBe(claimedBefore);
        expect(JSON.stringify(fixture)).toBe(fixtureBefore);
        outcomes.push({ document: label, placement,
          refused: 'error' in result && typeof result.error === 'string' && result.error.length > 0 });
      }
    }
    expect(outcomes).toEqual(expected);
  });
});


// Native file2 and schema definition versions are independent. These are authored
// codec fixtures, not installed schemas, real A/B adoption, or mounted editor proof.
// Literal digests were calculated independently with standard JSON/SHA256.
function freezeNative2<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeNative2);
    Object.freeze(value);
  }
  return value;
}

describe('native-v2 full schema bundle preservation contract', () => {
  // Preserve this authored array order, decomposed codepoints, original definition
  // strings, explicit nulls and missing fields. No current reader creates an oracle.
  const fixtures = freezeNative2([
  {
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
  {
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
]);
  // Only the supplied pageId and these body's/resource's self references differ.
  // The full copy oracle is fixed before invoking the implementation.
  const expectedCopy = freezeNative2({
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
});

  it('reads and explicitly serializes complete native2 A/B without losing definitions or omissions', () => {
    for (const fixture of fixtures) {
      const before = JSON.stringify(fixture), source = `${JSON.stringify(fixture, null, 2)}\n`;
      // Native shapes must be supported before newer-format refusal is a valid RED.
      expect(readNoteFile(JSON.stringify({ format: fixture.format, version: 1, document: fixture.document })))
        .not.toHaveProperty('error');
      expect(fixture.schemaBundle.selected[0].version).toBe(1);
      const savedAt = 'savedAt' in fixture ? fixture.savedAt : undefined;
      const read = readNoteSnapshotFile(source);
      expect.soft(read, `${fixture.document.attributes.pageId}: full native2 read context`).toEqual({
        document: fixture.document, fileVersion: 2, schemaBundle: fixture.schemaBundle,
        ...(savedAt !== undefined ? { savedAt } : {})
      });
      // The explicit context uses existing imports and a structurally typed variable.
      const options = { fileVersion: 2, schemaBundle: fixture.schemaBundle,
        ...(savedAt !== undefined ? { savedAt } : {}) };
      const text = serializeNoteFile(fixture.document, options), written = JSON.parse(text);
      console.info('native2 codec observation', JSON.stringify({ pageId: fixture.document.attributes.pageId,
        read, writerVersion: written.version, writerHasBundle: Object.hasOwn(written, 'schemaBundle') }));
      expect.soft(written, `${fixture.document.attributes.pageId}: explicit native2 serialization`).toEqual(fixture);
      expect(text).toBe(serializeNoteFile(fixture.document, options));
      expect(Object.hasOwn(written, 'savedAt')).toBe(Object.hasOwn(fixture, 'savedAt'));
      expect(JSON.stringify(fixture)).toBe(before);
      expect(source).toBe(`${JSON.stringify(fixture, null, 2)}\n`);
    }
  });

  it('copies native2 with only the declared page/self-reference delta and leaves source A and all B unchanged', () => {
    const sourceA = `${JSON.stringify(fixtures[0], null, 2)}\n`, sourceB = `${JSON.stringify(fixtures[1], null, 2)}\n`;
    const before = JSON.stringify(fixtures);
    expect(readNoteFile(JSON.stringify({ format: fixtures[0].format, version: 1, document: fixtures[0].document })))
      .not.toHaveProperty('error');
    const copied = copyNoteSnapshotFile(sourceA, 'native2-copy-A');
    console.info('native2 copy observation', JSON.stringify(copied));
    expect.soft(copied, 'native2 independent copy must succeed').not.toHaveProperty('error');
    if (!('error' in copied)) {
      expect(copied.pageId).toBe('native2-copy-A');
      const envelope = JSON.parse(copied.snapshotText);
      expect(envelope).toEqual(expectedCopy);
      expect(envelope.schemaBundle).toEqual(fixtures[0].schemaBundle);
      expect(copyNoteSnapshotFile(sourceA, 'native2-copy-A')).toEqual(copied);
    }
    expect(JSON.stringify(fixtures)).toBe(before);
    expect(sourceA).toBe(`${JSON.stringify(fixtures[0], null, 2)}\n`);
    expect(sourceB).toBe(`${JSON.stringify(fixtures[1], null, 2)}\n`);
  });
});


import { readNoteV1SnapshotFile } from '../src/note-file-codec';
describe('strict native2 admission and explicit context', () => {
  const native = {
  "format": "barocss-note",
  "version": 2,
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 1,
        "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"items\",\n    \"fields\": [\n      {\n        \"name\": \"Title\",\n        \"kind\": \"text\"\n      }\n    ]\n  }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "content": [
      {
        "stype": "paragraph",
        "content": [
          {
            "stype": "inline-text",
            "text": "Café",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  5
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};
  const source = () => JSON.stringify(native);
  it('preserves omitted attributes/title and adds only identity during copying', () => {
    expect(readNoteSnapshotFile(source())).toEqual({ document: native.document, fileVersion: 2, schemaBundle: native.schemaBundle });
    expect(readNoteFile(source())).toHaveProperty('error');
    expect(readNoteV1SnapshotFile(source())).toHaveProperty('error');
    const copied = copyNoteSnapshotFile(source(), 'copy-omitted');
    expect(copied).not.toHaveProperty('error');
    if ('error' in copied) throw new Error(copied.error);
    expect(JSON.parse(copied.snapshotText)).toEqual({ ...native, document: { ...native.document, attributes: { pageId: 'copy-omitted' } } });
  });
  it.each([
    ['missing bundle', { ...native, schemaBundle: undefined }],
    ['unknown envelope member', { ...native, renderer: 'code' }],
    ['empty selection', { ...native, schemaBundle: { ...native.schemaBundle, selected: [] } }],
    ['missing closure', { ...native, schemaBundle: { ...native.schemaBundle, definitions: [] } }],
    ['wrong digest', { ...native, schemaBundle: { ...native.schemaBundle, definitions: [{ ...native.schemaBundle.definitions[0],
      definitionText: native.schemaBundle.definitions[0].definitionText.replace('items', 'other') }] } }],
    ['bad savedAt', { ...native, savedAt: '' }],
    ['ambiguous pin', { ...native, document: { ...native.document, attributes: { schemaRef: native.schemaBundle.selected[0] } } }],
    ['known null title', { ...native, document: { ...native.document, attributes: { title: null } } }],
    ['unknown node', { ...native, document: { stype: 'note', content: [{ stype: 'generated-node' }] } }],
    ['session fields', { ...native, document: { ...native.document, sid: 'runtime-root' } }],
    ['bad metadata', { ...native, document: { ...native.document, metadata: [] } }],
    ['bad content', { ...native, document: { ...native.document, content: null } }]
  ])('refuses %s without changing its input or manufacturing context', (_name, envelope) => {
    expect(readNoteSnapshotFile(source())).not.toHaveProperty('error');
    const text = JSON.stringify(envelope), before = text;
    expect(readNoteSnapshotFile(text)).toHaveProperty('error');
    expect(copyNoteSnapshotFile(text, 'rejected-copy')).toHaveProperty('error');
    expect(text).toBe(before);
  });
  it.each([
    ['unknown mark', { stype: 'invented', range: [0, 1] }, 'unsupported_native_mark'],
    ['bad range', { stype: 'bold', range: [0, 6] }, 'invalid_native_mark_range'],
    ['fractional range', { stype: 'bold', range: [0.5, 1] }, 'invalid_native_mark_range'],
    ['missing link href', { stype: 'link' }, 'invalid_native_mark_attributes'],
    ['null mark attributes', { stype: 'bold', attributes: null }, 'invalid_native_mark_attributes']
  ])('refuses %s against the trusted mark rules', (_name, mark, reason) => {
    const envelope = { ...native, document: { ...native.document, content: [{ stype: 'paragraph', content: [
      { stype: 'inline-text', text: 'Café', marks: [mark] }
    ] }] } };
    expect(readNoteSnapshotFile(JSON.stringify(envelope))).toEqual({ error: reason });
  });
  it.each(['{"format":"barocss-note","version":2,"version":1}', '{"version":2,"vers\\u0069on":2}'])('detects duplicate decoded keys before dispatch %s', text => {
    expect(readNoteSnapshotFile(text)).toEqual({ error: 'duplicate_definition_key' });
  });
  it('rejects explicit writer contexts that could imply a downgrade or incomplete bundle', () => {
    for (const options of [{ fileVersion: 1, schemaBundle: native.schemaBundle }, { fileVersion: 2, schemaBundle: null },
      { fileVersion: 3, schemaBundle: native.schemaBundle }]) {
      expect(() => serializeNoteFile(native.document, options)).toThrow();
    }
    expect(readNoteV1SnapshotFile(JSON.stringify({ ...native, version: 1 }))).toHaveProperty('error');
  });
  it('exports node session fields only and preserves similarly named metadata data', () => {
    const document = { ...native.document, sid: 'root-session', parentId: 'root-parent',
      metadata: { sid: 'authored', parentId: null }, content: [{ ...native.document.content[0], sid: 'child-session' }] };
    const written = JSON.parse(serializeNoteFile(document, { fileVersion: 2, schemaBundle: native.schemaBundle }));
    expect(written.document).toEqual({ ...native.document, metadata: { sid: 'authored', parentId: null } });
    expect(document.sid).toBe('root-session');
  });
  it.each([undefined, NaN, Infinity, -0, 9007199254740992, () => 'code', Symbol('code')])('refuses non-JSON writer values %s', value => {
    expect(() => serializeNoteFile({ ...native.document, metadata: { value } },
      { fileVersion: 2, schemaBundle: native.schemaBundle })).toThrow();
  });
  it('does not invoke data accessors or toJSON and refuses cyclic or sparse data', () => {
    let calls = 0;
    const getter = { ...native.document, get metadata() { calls++; return {}; } };
    const hook = { ...native.document, toJSON() { calls++; return native.document; } };
    const cycle: Record<string, unknown> = { ...native.document }; cycle.metadata = cycle;
    for (const value of [getter, hook, cycle, { ...native.document, metadata: { sparse: Array(2) } }]) {
      expect(() => serializeNoteFile(value, { fileVersion: 2, schemaBundle: native.schemaBundle })).toThrow();
    }
    expect(calls).toBe(0);
  });
  it('retains finite fractions, null metadata, codepoints, order and pollution-looking own keys', () => {
    const document = { ...native.document, metadata: { fraction: 1.5, zero: 0, flag: false, annotation: null, labels: ['b', 'a'], text: 'Café' } };
    const text = serializeNoteFile(document, { fileVersion: 2, schemaBundle: native.schemaBundle });
    expect(readNoteSnapshotFile(text)).toEqual({ document, fileVersion: 2, schemaBundle: native.schemaBundle });
    const dangerousKeys = JSON.stringify({ ...native, document }).replace('"fraction":1.5', '"__proto__":{"safe":true},"fraction":1.5');
    const read = readNoteSnapshotFile(dangerousKeys);
    expect(read).not.toHaveProperty('error');
    if ('error' in read) throw new Error(read.error);
    if (!('fileVersion' in read)) throw new Error('Expected native2 context');
    expect(Object.hasOwn(read.document.metadata as object, '__proto__')).toBe(true);
    expect(Object.hasOwn(Object.prototype, 'safe')).toBe(false);
  });
  it('refuses total byte and depth overflow before native admission', () => {
    expect(readNoteSnapshotFile(source().replace('Café', 'x'.repeat(524289)))).toEqual({ error: 'definition_too_large' });
    const text = source().replace('"Café"', '['.repeat(101) + '0' + ']'.repeat(101));
    expect(readNoteSnapshotFile(text)).toEqual({ error: 'definition_too_complex' });
  });
});


describe('native2 inline field values without fallback or defaults', () => {
  const native = {
  "format": "barocss-note",
  "version": 2,
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 1,
        "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"items\",\n    \"fields\": [\n      {\n        \"name\": \"Title\",\n        \"kind\": \"text\"\n      }\n    ]\n  }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "content": [
      {
        "stype": "paragraph",
        "content": [
          {
            "stype": "inline-text",
            "text": "Café",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  5
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};
  const fields = [{ name: 'Count', kind: 'number' }, { name: 'Ready', kind: 'boolean' },
    { name: 'Text', kind: 'text' }, { name: 'State', kind: 'choice', options: ['b', 'a'] }];
  const dataset = (records: unknown[], extraFields = fields) => ({ ...native, document: { stype: 'note', content: [
    ...native.document.content, { stype: 'resources', content: [{ stype: 'dataset', attributes: {
      name: 'independent-inline', fields: extraFields, rowIds: records.map((_row, i) => `row-${i}`), records
    } }] }
  ] } });
  it('retains decimals/false/zero/empty text/omitted optional fields and authored order', () => {
    // No invented schema-to-node binding: this independent inline dataset is validated as its own typed data.
    const envelope = dataset([{ Count: 1.5, Ready: false, Text: '', State: 'b' }, {}, { Count: 0 }]);
    const text = serializeNoteFile(envelope.document, { fileVersion: 2, schemaBundle: envelope.schemaBundle });
    expect(JSON.parse(text)).toEqual(envelope);
    expect(readNoteSnapshotFile(text)).toEqual({ document: envelope.document, fileVersion: 2, schemaBundle: envelope.schemaBundle });
  });
  it.each([{ Count: '1' }, { Count: null }, { Ready: 0 }, { Text: false }, { State: 'outside' }, { Unknown: 1 }])('refuses incompatible cell %s', record => {
    expect(readNoteSnapshotFile(JSON.stringify(dataset([{ Count: 1.5 }])))).not.toHaveProperty('error');
    expect(readNoteSnapshotFile(JSON.stringify(dataset([record])))).toHaveProperty('error');
  });
  it('refuses unsupported field kinds without converting them to text', () => {
    expect(readNoteSnapshotFile(JSON.stringify(dataset([], [{ name: 'Generated', kind: 'custom' }])))).toEqual({ error: 'unsupported_field_kind' });
  });
  it('refuses changed field semantics under the same selected dataset name', () => {
    const envelope = dataset([], [{ name: 'Title', kind: 'number' }]);
    const resource = envelope.document.content[1] as { content: { attributes: { name: string } }[] };
    resource.content[0].attributes.name = 'items';
    expect(readNoteSnapshotFile(JSON.stringify(envelope))).toEqual({ error: 'native_dataset_schema_mismatch' });
  });
});


describe('newly adopted native2 codec-only strike syntax', () => {
  const base = {
  "format": "barocss-note",
  "version": 2,
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 1,
        "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"items\",\n    \"fields\": [\n      {\n        \"name\": \"Title\",\n        \"kind\": \"text\"\n      }\n    ]\n  }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "content": [
      {
        "stype": "paragraph",
        "content": [
          {
            "stype": "inline-text",
            "text": "Café",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  5
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};
  const envelope = (mark: unknown) => ({ ...base, document: { stype: 'note', content: [{ stype: 'paragraph', content: [
    { stype: 'inline-text', text: 'Café', marks: [mark] }
  ] }] } });
  it('preserves original strike name/attrs/range/order and omissions without a schema or renderer install', () => {
    for (const mark of [{ stype: 'strike', range: [0, 2] }, { stype: 'strike', attributes: { style: 'line-through' }, range: [1, 5] }]) {
      const fixture = envelope(mark), before = JSON.stringify(fixture), text = JSON.stringify(fixture, null, 2) + '\n';
      expect(readNoteSnapshotFile(text)).toEqual({ document: fixture.document, fileVersion: 2, schemaBundle: fixture.schemaBundle });
      const output = serializeNoteFile(fixture.document, { fileVersion: 2, schemaBundle: fixture.schemaBundle });
      expect(JSON.parse(output)).toEqual(fixture); expect(output).toBe(text);
      expect(JSON.stringify(fixture)).toBe(before);
    }
  });
  it.each([
    [{ stype: 'strike', attributes: { style: 1 }, range: [0, 2] }, 'invalid_native_mark_attributes'],
    [{ stype: 'strike', range: [0, 6] }, 'invalid_native_mark_range'],
    [{ stype: 'strike', range: [-1, 2] }, 'invalid_native_mark_range'],
    [{ stype: 'strike', execute: 'code', range: [0, 2] }, 'unsupported_native_mark_member'],
    [{ stype: 'different-unknown', range: [0, 2] }, 'unsupported_native_mark']
  ])('refuses malformed or other unsupported syntax %s', (mark, reason) => {
    expect(readNoteSnapshotFile(JSON.stringify(envelope({ stype: 'strike', range: [0, 2] })))).not.toHaveProperty('error');
    const text = JSON.stringify(envelope(mark)); expect(readNoteSnapshotFile(text)).toEqual({ error: reason });
  });
  it('refuses strike marks on a block instead of changing inline applicability', () => {
    const fixture = envelope({ stype: 'strike', range: [0, 2] });
    const paragraph = { ...fixture.document.content[0], marks: [{ stype: 'strike', range: [0, 2] }] };
    expect(readNoteSnapshotFile(JSON.stringify({ ...fixture, document: { ...fixture.document, content: [paragraph] } })))
      .toEqual({ error: 'invalid_native_marks' });
  });
});


it('keeps metadata JSON names without executing writer context accessors', () => {
  const native = {
  "format": "barocss-note",
  "version": 2,
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 1,
        "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"items\",\n    \"fields\": [\n      {\n        \"name\": \"Title\",\n        \"kind\": \"text\"\n      }\n    ]\n  }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "content": [
      {
        "stype": "paragraph",
        "content": [
          {
            "stype": "inline-text",
            "text": "Café",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  5
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};
  const document = { ...native.document, metadata: { toJSON: 'authored data', annotation: null } };
  const text = serializeNoteFile(document, { fileVersion: 2, schemaBundle: native.schemaBundle });
  expect(JSON.parse(text).document).toEqual(document);
  expect(readNoteSnapshotFile(text)).toEqual({ document, fileVersion: 2, schemaBundle: native.schemaBundle });
  let calls = 0;
  const context = { fileVersion: 2, schemaBundle: native.schemaBundle, get savedAt() { calls++; return 'stamp'; } };
  expect(() => serializeNoteFile(document, context)).toThrow('non_json_native_value');
  expect(calls).toBe(0);
});
