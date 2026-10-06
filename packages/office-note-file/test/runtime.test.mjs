import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { copyNoteSnapshotFile, readNoteSnapshotFile, serializeNoteFile } from '../dist/index.js';

const document = {
  stype: 'note', attributes: { title: 'Plan', pageId: 'original' },
  content: [{ stype: 'paragraph', content: [{ stype: 'pageReference', attributes: { pageId: 'original', title: 'Plan' } }] }]
};

test('the built Node codec copies a validated Note without a clock or workspace runtime', () => {
  const source = serializeNoteFile(document);
  const copy = copyNoteSnapshotFile(source, 'copy-1');
  assert.equal('error' in copy, false);
  assert.equal(copy.pageId, 'copy-1');
  assert.equal(readNoteSnapshotFile(copy.snapshotText).document.attributes.pageId, 'copy-1');
  assert.equal(JSON.parse(copy.snapshotText).document.content[0].content[0].attributes.pageId, 'copy-1');
  assert.equal(copyNoteSnapshotFile(source, 'copy-1').snapshotText, copy.snapshotText);
  assert.equal(readNoteSnapshotFile(JSON.stringify({ ...JSON.parse(source), savedAt: '' })).error, '이 파일의 저장 시각이 올바르지 않습니다.');
  assert.equal(readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8').match(/from ['"]@barocss\//g), null);
});


import { readNoteV1SnapshotFile, NOTE_FILE_VERSION, NOTE_NATIVE_FILE_VERSION } from '../dist/index.js';
const native2 = {
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
test('the own built facade preserves native2 context and refuses it at its v1 perimeter', () => {
  const source = JSON.stringify(native2), before = JSON.stringify(native2);
  assert.equal(NOTE_FILE_VERSION, 1); assert.equal(NOTE_NATIVE_FILE_VERSION, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(readNoteSnapshotFile(source))), {
    document: native2.document, fileVersion: 2, schemaBundle: native2.schemaBundle
  });
  assert.equal(typeof readNoteV1SnapshotFile(source).error, 'string');
  const written = serializeNoteFile(native2.document, { fileVersion: 2, schemaBundle: native2.schemaBundle });
  assert.deepEqual(JSON.parse(written), native2);
  const copied = copyNoteSnapshotFile(source, 'facade-copy');
  assert.equal('error' in copied, false);
  assert.deepEqual(JSON.parse(copied.snapshotText), { ...native2, document: {
    ...native2.document, attributes: { pageId: 'facade-copy' }
  } });
  assert.equal(JSON.stringify(native2), before);
  assert.equal(source, before);
  assert.equal(readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8').match(/from ['"]@barocss\//g), null);
});
