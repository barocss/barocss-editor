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
