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
